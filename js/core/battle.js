const {
  ROWS,
  ROW_LABELS,
  FACTION_LABELS,
  FACTION_KEYS,
  buildDeck,
  defaultLeader,
  shuffle,
  hasAbility,
  cardValue,
  categoryLabel,
  deckStatus,
  leadersFor,
  tokenByName,
  cloneCard
} = require("./cards");
const { recordMatch, getActiveCustomDeckIds } = require("./storage");

const AI_DIFFICULTY = {
  easy: { blunder: 0.45, concede: false, valueNoise: 8, minLeadToStop: 99 },
  normal: { blunder: 0.1, concede: true, valueNoise: 2, minLeadToStop: 5 },
  hard: { blunder: 0, concede: true, valueNoise: 0, minLeadToStop: 1 }
};

function makePlayer(name, index, faction, difficulty, customDeckIds, leaderId) {
  return {
    name,
    index,
    faction,
    factionName: FACTION_LABELS[faction] || faction,
    difficulty: difficulty || "normal",
    leader: defaultLeader(faction, leaderId),
    leaderUsed: false,
    deck: buildDeck(index, { faction, difficulty, customDeckIds }),
    hand: [],
    board: { melee: [], ranged: [], siege: [] },
    discard: [],
    passed: false,
    roundsWon: 0,
    retained: []
  };
}

function initialCurrent(players) {
  const p0Scoia = players[0].faction === "Scoia'tael";
  const p1Scoia = players[1].faction === "Scoia'tael";
  if (p0Scoia && !p1Scoia) return 0;
  if (p1Scoia && !p0Scoia) return 1;
  return 0;
}

function draw(player, count) {
  for (let i = 0; i < count; i++) {
    const card = player.deck.shift();
    if (card) player.hand.push(card);
  }
}

function randomItem(list, fallback) {
  return list.length ? list[Math.floor(Math.random() * list.length)] : fallback;
}

function resolveFaction(value, fallback) {
  if (value === "random") return randomItem(FACTION_KEYS, fallback || FACTION_KEYS[0]);
  return FACTION_KEYS.includes(value) ? value : (fallback || FACTION_KEYS[0]);
}

function resolveAiFaction(value) {
  return resolveFaction(value, "Monsters");
}

function resolveLeaderId(options, side, faction, forceRandom) {
  const ids = side === "ai" ? options.aiLeaderIds : options.humanLeaderIds;
  const legacy = side === "ai" ? options.aiLeaderId : options.humanLeaderId;
  const stored = ids?.[faction] ?? ids?.random ?? legacy;
  if (forceRandom || stored === "random") {
    const leader = randomItem(leadersFor(faction), null);
    return leader ? leader.id : "";
  }
  return stored;
}

function createMatch(options = {}) {
  const mode = options.mode === "hotseat" || options.mode === "online" ? options.mode : "ai";
  const humanFactionRandom = options.humanFaction === "random";
  const humanFaction = resolveFaction(options.humanFaction, "Northern Realms");
  const aiFactionRandom = options.aiFaction === "random";
  const aiFaction = resolveAiFaction(options.aiFaction);
  const difficulty = options.difficulty || "normal";
  const explicitCustomIds = Array.isArray(options.humanCustomDeckIds)
    ? options.humanCustomDeckIds
    : (Array.isArray(options.customDeckIds) ? options.customDeckIds : null);
  const customIds = explicitCustomIds || (options.customDeckEnabled ? getActiveCustomDeckIds(options, humanFaction) : []);
  const customStatus = deckStatus(customIds, humanFaction);
  const humanCustomDeckIds = customStatus.valid ? customStatus.ids : null;
  const aiCustomStatus = deckStatus(Array.isArray(options.aiCustomDeckIds) ? options.aiCustomDeckIds : [], aiFaction);
  const aiCustomDeckIds = aiCustomStatus.valid ? aiCustomStatus.ids : null;
  const humanLeaderId = resolveLeaderId(options, "human", humanFaction, humanFactionRandom);
  const aiLeaderId = resolveLeaderId(options, "ai", aiFaction, aiFactionRandom);
  const players = [
    makePlayer("玩家一", 0, humanFaction, "normal", humanCustomDeckIds, humanLeaderId),
    makePlayer(mode === "ai" ? "系统" : "玩家二", 1, aiFaction, difficulty, mode === "online" ? aiCustomDeckIds : null, aiLeaderId)
  ];
  const state = {
    mode,
    round: 1,
    current: 0,
    weather: {},
    rowHorn: [{ melee: false, ranged: false, siege: false }, { melee: false, ranged: false, siege: false }],
    players,
    mulligan: { active: true, current: 0, used: [0, 0], max: 2 },
    logs: [],
    over: false,
    winner: null,
    resultText: "",
    roundResults: [],
    finalScores: [0, 0],
    pending: null,
    endReason: "normal",
    historyRecorded: false,
    lastPlayed: null,
    lastPlayedSeq: 0
  };
  draw(state.players[0], 10);
  draw(state.players[1], 10);
  if (mode === "ai") aiMulligan(state);
  recalcScores(state);
  addLog(state, `先换牌：每名玩家最多 ${state.mulligan.max} 张，换满后自动开始；也可直接开始。`);
  if (humanCustomDeckIds) addLog(state, `玩家一已使用该阵营自定义牌组：${customStatus.total} 张。`);
  else if (options.customDeckEnabled) addLog(state, "自定义牌组未完成，已改用自动组牌。");
  addLog(state, `对局开始：${state.players[0].name}使用${state.players[0].factionName}，${state.players[1].name}使用${state.players[1].factionName}。`);
  return state;
}

function addLog(state, text) {
  state.logs.unshift(text);
  state.logs = state.logs.slice(0, 7);
}

function currentPlayer(state) {
  return state.players[state.current];
}

function otherIndex(index) {
  return index === 0 ? 1 : 0;
}

function aiMulligan(state) {
  const ai = state.players[1];
  const weak = ai.difficulty === "hard" ? 6 : ai.difficulty === "easy" ? 4 : 5;
  for (let i = 0; i < 2; i++) {
    if (!ai.deck.length) break;
    const sorted = ai.hand.slice().sort((a, b) => cardValue(a) - cardValue(b));
    const card = sorted[0];
    if (!card || card.hero || cardValue(card) >= weak + 5) break;
    swapHandCard(ai, card.uid);
  }
}

function swapHandCard(player, uid) {
  if (!player.deck.length) return false;
  const idx = player.hand.findIndex(card => card.uid === uid);
  if (idx < 0) return false;
  const old = player.hand[idx];
  const fresh = player.deck.shift();
  player.hand[idx] = fresh;
  player.deck = shuffle(player.deck.concat(old));
  return true;
}

function mulliganSwap(state, uid) {
  if (!state.mulligan || !state.mulligan.active) return false;
  const pi = state.mulligan.current || 0;
  if ((state.mulligan.used[pi] || 0) >= state.mulligan.max) return false;
  const ok = swapHandCard(state.players[pi], uid);
  if (ok) {
    state.mulligan.used[pi] = (state.mulligan.used[pi] || 0) + 1;
    addLog(state, `${state.players[pi].name}已换牌 ${state.mulligan.used[pi]}/${state.mulligan.max}。`);
    if ((state.mulligan.used[pi] || 0) >= state.mulligan.max) finishMulligan(state);
  }
  return ok;
}

function finishMulligan(state) {
  if (!state.mulligan || !state.mulligan.active) return false;
  if ((state.mode === "hotseat" || state.mode === "online") && state.mulligan.current === 0) {
    state.mulligan.current = 1;
    state.current = 1;
    addLog(state, "请玩家二换牌。 ");
    return true;
  }
  state.mulligan.active = false;
  state.current = initialCurrent(state.players);
  addLog(state, "换牌结束，正式开始行动。");
  return true;
}

function weatherRowsFor(card) {
  if (card.category !== "weather") return [];
  if (isClearWeather(card)) return [];
  if (card.baseName === "Biting Frost") return ["melee"];
  if (card.baseName === "Impenetrable Fog") return ["ranged"];
  if (card.baseName === "Torrential Rain") return ["siege"];
  if (card.baseName === "Skellige Storm") return ["ranged", "siege"];
  return (card.row || []).slice();
}

function isClearWeather(card) {
  return card.category === "weather" && /拨云见日|Clear Weather/i.test(card.baseName || "");
}

function isHorn(card) {
  return hasAbility(card, "Commander's Horn") || card.baseName === "天下檄文";
}

function isScorch(card) {
  return hasAbility(card, "Scorch") || card.baseName === "釜底抽薪";
}

function isDecoy(card) {
  return card.baseName === "请辞归隐" || /收回手牌/.test(card.abilityText || "");
}

function isMardroeme(card) {
  return hasAbility(card, "Mardroeme") || card.baseName === "破釜沉舟";
}

function cardLabel(card) {
  return card.name || card.baseName || "卡牌";
}

function leaderText(player) {
  return `${player.leader?.baseName || ""} ${player.leader?.leaderAbility || ""} ${player.leader?.abilityText || ""}`.toLowerCase();
}

function playWeatherFromLeader(state, name) {
  if (/biting frost|边患/.test(name)) state.weather.melee = true;
  else if (/impenetrable fog|蔽日|党争/.test(name)) state.weather.ranged = true;
  else if (/torrential rain|倾盆|典籍/.test(name)) state.weather.siege = true;
  else {
    const rows = ROWS.filter(row => !state.weather[row]);
    state.weather[rows[0] || "melee"] = true;
  }
}

function takeBestDiscardToHand(state, fromIndex, toIndex) {
  const from = state.players[fromIndex];
  const to = state.players[toIndex];
  const candidates = from.discard.filter(card => card.category === "unit" || card.category === "hero");
  if (!candidates.length) return false;
  candidates.sort((a, b) => cardValue(b) - cardValue(a));
  const card = candidates[0];
  from.discard = from.discard.filter(item => item.uid !== card.uid);
  card.owner = toIndex;
  card.playedBy = toIndex;
  to.hand.push(card);
  addLog(state, `${to.name}从弃牌堆取回「${cardLabel(card)}」。`);
  return true;
}

function discardTwoDrawOne(state, playerIndex) {
  const player = state.players[playerIndex];
  const picks = player.hand.slice().sort((a, b) => cardValue(a) - cardValue(b)).slice(0, 2);
  picks.forEach(card => {
    player.hand = player.hand.filter(item => item.uid !== card.uid);
    player.discard.push(card);
  });
  draw(player, 1);
  addLog(state, `${player.name}弃置 ${picks.length} 张牌并抽 1 张。`);
}

function optimizeAgileRows(state, playerIndex) {
  const player = state.players[playerIndex];
  ROWS.forEach(row => {
    player.board[row].slice().forEach(card => {
      if (!hasAbility(card, "Agile") || !card.row || card.row.length < 2) return;
      const best = bestRowForCard(state, playerIndex, card);
      if (!best || best === row) return;
      player.board[row] = player.board[row].filter(item => item.uid !== card.uid);
      player.board[best].push(card);
    });
  });
  addLog(state, `${player.name}调整机动单位到更优战线。`);
}

function rowFromLeaderText(text) {
  if (/siege|文脉/.test(text)) return "siege";
  if (/ranged|朝堂/.test(text)) return "ranged";
  if (/melee|close combat|疆场/.test(text)) return "melee";
  return null;
}

function rowForCard(state, playerIndex, card) {
  if (isHorn(card)) return bestOwnRow(state, playerIndex);
  if (isMardroeme(card)) return bestBerserkerRow(state, playerIndex) || "melee";
  if (card.row && card.row.length === 1) return card.row[0];
  if (card.row && card.row.length > 1) return bestRowForCard(state, playerIndex, card);
  return null;
}

function boardTargetForCard(playerIndex, card) {
  return hasAbility(card, "Spy") ? otherIndex(playerIndex) : playerIndex;
}

function placeUnitOnBoard(state, playedBy, target, row, card) {
  card.playedBy = playedBy;
  card.owner = playedBy;
  state.players[target].board[row].push(card);
}

function discardBoardCard(state, controllerIndex, card) {
  const owner = Number.isInteger(card.owner) && state.players[card.owner] ? card.owner : controllerIndex;
  state.players[owner].discard.push(card);
}

function needsHumanChoice(state, player, card, preferredRow) {
  if (preferredRow || state.mode === "ai" && player.index !== 0) return false;
  if (card.category === "special" && (isHorn(card) || isMardroeme(card))) return true;
  return card.category !== "weather" && card.category !== "special" && card.row && card.row.length > 1;
}

function pendingRowsForCard(state, playerIndex, card) {
  if (isHorn(card)) return ROWS.slice();
  if (isMardroeme(card)) return ["melee", "ranged"];
  return (card.row || []).slice();
}

function markLastPlayed(state, playerIndex, card, targetIndex, row) {
  const seq = (state.lastPlayedSeq || 0) + 1;
  state.lastPlayedSeq = seq;
  const targetName = state.players[targetIndex]?.name || "目标";
  const rowName = row ? ROW_LABELS[row] : "特殊效果";
  state.lastPlayed = {
    seq,
    playerIndex,
    playerName: state.players[playerIndex]?.name || "对手",
    targetIndex,
    targetName,
    row,
    rowName,
    cardId: card.id,
    cardUid: card.uid,
    name: cardLabel(card),
    baseName: card.baseName,
    imageUrl: card.imageUrl,
    summary: card.summary,
    category: categoryLabel(card),
    faction: card.faction,
    cardRow: card.row,
    abilities: card.abilities,
    abilityDisplayNames: card.abilityDisplayNames,
    hero: card.hero,
    strength: card.category === "weather" || card.category === "special" ? "策" : card.strength,
    description: row ? `${targetName} · ${rowName}` : categoryLabel(card)
  };
}

function playCard(state, cardUid, preferredRow) {
  if (state.over || state.pending || (state.mulligan && state.mulligan.active)) return false;
  const player = currentPlayer(state);
  if (player.passed) return false;
  const index = player.hand.findIndex(card => card.uid === cardUid);
  if (index < 0) return false;
  const card = player.hand[index];
  if (needsHumanChoice(state, player, card, preferredRow)) {
    state.pending = {
      type: "row",
      cardUid,
      rows: pendingRowsForCard(state, player.index, card),
      title: `选择「${cardLabel(card)}」作用线`
    };
    addLog(state, `请选择「${cardLabel(card)}」的作用线。`);
    return true;
  }
  player.hand.splice(index, 1);
  if (card.category === "weather" || card.category === "special") {
    const row = preferredRow || rowForCard(state, player.index, card);
    resolveSpecial(state, player.index, card, row);
    player.discard.push(card);
    addLog(state, `${player.name}打出${categoryLabel(card)}「${cardLabel(card)}」。`);
    markLastPlayed(state, player.index, card, player.index, row);
  } else {
    const target = boardTargetForCard(player.index, card);
    const row = preferredRow || rowForCard(state, player.index, card) || "melee";
    placeUnitOnBoard(state, player.index, target, row, card);
    addLog(state, `${player.name}打出「${cardLabel(card)}」到${target === player.index ? "己方" : "对方"}${ROW_LABELS[row]}。`);
    markLastPlayed(state, player.index, card, target, row);
    resolveUnitAbility(state, player.index, target, row, card);
  }
  if (!state.pending) afterPlay(state);
  return true;
}

function autoPlayHuman(state) {
  if (state.over || (state.mulligan && state.mulligan.active)) return false;
  const pi = state.current;
  const hand = state.players[pi].hand;
  if (!hand.length) return pass(state);
  const best = hand.slice().sort((a, b) => estimatePlayGain(state, pi, b) - estimatePlayGain(state, pi, a))[0];
  return best ? playCard(state, best.uid, rowForCard(state, pi, best)) : pass(state);
}

function pass(state) {
  if (state.over || (state.mulligan && state.mulligan.active)) return false;
  const player = currentPlayer(state);
  player.passed = true;
  addLog(state, `${player.name}选择放弃本回合。`);
  advanceTurn(state);
  return true;
}

function useLeader(state, playerIndex) {
  if (state.over || (state.mulligan && state.mulligan.active)) return false;
  const player = state.players[playerIndex];
  if (!player || player.leaderUsed || !player.leader) return false;
  player.leaderUsed = true;
  const text = leaderText(player);
  addLog(state, `${player.name}使用主将「${cardLabel(player.leader)}」。`);
  if (/cancel your opponent|取消.*主将|cancel.*leader/.test(text)) {
    state.players[otherIndex(playerIndex)].leaderUsed = true;
    addLog(state, "对手主将能力已被封锁。");
  } else if (/look at 3 random/.test(text)) {
    const sample = shuffle(state.players[otherIndex(playerIndex)].hand).slice(0, 3).map(cardLabel).join("、") || "无手牌";
    addLog(state, `侦察对手手牌：${sample}`);
  } else if (/opponent.*discard|对手.*弃牌/.test(text)) {
    if (!takeBestDiscardToHand(state, otherIndex(playerIndex), playerIndex)) draw(player, 1);
  } else if (/restore a card from your discard|弃牌堆.*手牌/.test(text)) {
    if (!takeBestDiscardToHand(state, playerIndex, playerIndex)) draw(player, 1);
  } else if (/discard 2 cards/.test(text)) {
    discardTwoDrawOne(state, playerIndex);
  } else if (/shuffle all cards/.test(text)) {
    state.players.forEach(item => {
      item.deck = shuffle(item.deck.concat(item.discard));
      item.discard = [];
    });
    addLog(state, "双方弃牌堆已洗回牌库。");
  } else if (/move agile/.test(text)) {
    optimizeAgileRows(state, playerIndex);
  } else if (/pick any weather|pick a .*weather|biting frost|impenetrable fog|torrential rain/.test(text)) {
    playWeatherFromLeader(state, text);
  } else if (/clear|清除|拨云/.test(text)) {
    state.weather = {};
  } else if (/double|翻倍|horn|号令/.test(text)) {
    const row = rowFromLeaderText(text) || bestOwnRow(state, playerIndex) || "melee";
    state.rowHorn[playerIndex][row] = true;
  } else if (/destroy|scorch|摧毁|奇策/.test(text)) {
    doScorch(state, playerIndex, rowFromLeaderText(text), true, 10);
  } else if (/draw|抽/.test(text)) {
    draw(player, 1);
  } else {
    addLog(state, "该主将能力已作为持续/被动效果处理。");
  }
  afterPlay(state);
  return true;
}

function afterPlay(state) {
  recalcScores(state);
  autoPassEmptyPlayers(state);
  advanceTurn(state);
}

function autoPassEmptyPlayers(state) {
  state.players.forEach(player => {
    if (!player.passed && player.hand.length === 0) {
      player.passed = true;
      addLog(state, `${player.name}手牌已打完，自动放弃。`);
    }
  });
}

function advanceTurn(state) {
  if (state.over) return;
  if (state.players.every(player => player.passed)) {
    finishRound(state);
    return;
  }
  let next = otherIndex(state.current);
  if (state.players[next].passed) next = state.current;
  state.current = next;
}

function resolveSpecial(state, playerIndex, card, row) {
  if (isClearWeather(card)) {
    state.weather = {};
    addLog(state, "晴天：全部时局影响已清除。");
    return;
  }
  if (card.category === "weather") {
    weatherRowsFor(card).forEach(item => {
      state.weather[item] = true;
      addLog(state, `${ROW_LABELS[item]}受到「${cardLabel(card)}」影响。`);
    });
    return;
  }
  if (isHorn(card)) {
    const targetRow = row || bestOwnRow(state, playerIndex) || "melee";
    state.rowHorn[playerIndex][targetRow] = true;
    addLog(state, `${state.players[playerIndex].name}在${ROW_LABELS[targetRow]}发出号令。`);
    return;
  }
  if (isScorch(card)) return doScorch(state, playerIndex, null, false, 0);
  if (isDecoy(card)) {
    if (isHumanControlled(state, playerIndex) && decoyTargets(state, playerIndex).length) {
      state.pending = { type: "decoy", playerIndex, candidates: decoyTargets(state, playerIndex), title: "选择请辞归隐目标" };
      addLog(state, "请选择要收回手牌的人物，或跳过。 ");
      return;
    }
    return doDecoy(state, playerIndex);
  }
  if (isMardroeme(card)) return transformBerserkers(state, row || bestBerserkerRow(state, playerIndex) || "melee");
}

function resolveUnitAbility(state, playedBy, target, row, card) {
  if (hasAbility(card, "Spy")) {
    draw(state.players[playedBy], 2);
    addLog(state, `出使生效：${state.players[playedBy].name}抽 2 张牌。`);
  }
  if (hasAbility(card, "Medic")) {
    const candidates = reviveCandidates(state, playedBy);
    if (isHumanControlled(state, playedBy) && candidates.length) {
      state.pending = { type: "revive", playerIndex: playedBy, candidates, title: "选择举荐复归目标" };
      addLog(state, "请选择要复归的人物，或跳过。 ");
    } else reviveBest(state, playedBy);
  }
  if (hasAbility(card, "Muster")) doMuster(state, playedBy, target, row, card);
  if (hasAbility(card, "Summon Shield Maidens")) summonByName(state, playedBy, target, row, "Clan Drummond Shield Maiden");
  if (isScorch(card) && card.category !== "special") doScorch(state, playedBy, null, true, 10);
}

function doMuster(state, playedBy, target, row, card) {
  const player = state.players[playedBy];
  const names = [card.baseName];
  if (card.baseName === "Gaunter O'Dimm") names.push("Gaunter O'Dimm: Darkness");
  if (card.baseName === "Gaunter O'Dimm: Darkness") names.push("Gaunter O'Dimm");
  const group = card.musterGroup || null;
  let moved = 0;
  [player.hand, player.deck].forEach(pile => {
    for (let i = pile.length - 1; i >= 0; i--) {
      const item = pile[i];
      const related = names.includes(item.baseName) || (group && item.musterGroup === group);
      if (item.uid !== card.uid && related) {
        pile.splice(i, 1);
        const targetRow = (item.row || []).includes(row) ? row : ((item.row || [])[0] || row);
        placeUnitOnBoard(state, playedBy, target, targetRow, item);
        moved += 1;
      }
    }
  });
  if (moved) addLog(state, `集结生效：额外打出 ${moved} 张关联牌。`);
}

function summonByName(state, playedBy, target, row, baseName) {
  const player = state.players[playedBy];
  let moved = 0;
  [player.hand, player.deck].forEach(pile => {
    for (let i = pile.length - 1; i >= 0; i--) {
      const item = pile[i];
      if (item.baseName === baseName) {
        pile.splice(i, 1);
        const targetRow = (item.row || []).includes(row) ? row : ((item.row || [])[0] || row);
        placeUnitOnBoard(state, playedBy, target, targetRow, item);
        moved += 1;
      }
    }
  });
  if (moved) addLog(state, `${player.name}召唤 ${moved} 张「${baseName}」。`);
}

function isHumanControlled(state, playerIndex) {
  return state.mode !== "ai" || playerIndex === 0;
}

function handOwnerIndex(state) {
  if (!state) return 0;
  if (state.mode === "online" && Number.isInteger(state.localPlayerIndex)) return state.localPlayerIndex;
  if (state.mulligan && state.mulligan.active) return state.mulligan.current || 0;
  if (state.mode === "ai") return 0;
  return state.current || 0;
}

function reviveCandidates(state, playerIndex) {
  return state.players[playerIndex].discard
    .filter(card => !card.hero && (card.category === "unit" || card.category === "hero"))
    .sort((a, b) => cardValue(b) - cardValue(a));
}

function reviveCardByUid(state, playerIndex, uid) {
  const player = state.players[playerIndex];
  const card = player.discard.find(item => item.uid === uid);
  if (!card) return false;
  player.discard = player.discard.filter(item => item.uid !== uid);
  const target = boardTargetForCard(playerIndex, card);
  const row = rowForCard(state, playerIndex, card) || "melee";
  placeUnitOnBoard(state, playerIndex, target, row, card);
  addLog(state, `举荐生效：${player.name}复归「${cardLabel(card)}」到${target === playerIndex ? "己方" : "对方"}${ROW_LABELS[row]}。`);
  if (hasAbility(card, "Spy")) {
    draw(player, 2);
    addLog(state, `出使生效：${player.name}抽 2 张牌。`);
  }
  return true;
}

function decoyTargets(state, playerIndex) {
  const player = state.players[playerIndex];
  const targets = [];
  ROWS.forEach(row => {
    player.board[row].forEach(card => {
      if (!card.hero) targets.push({ row, card });
    });
  });
  return targets.sort((a, b) => cardValue(b.card) - cardValue(a.card));
}

function doDecoyTarget(state, playerIndex, uid) {
  const player = state.players[playerIndex];
  const entry = decoyTargets(state, playerIndex).find(item => item.card.uid === uid);
  if (!entry) return false;
  player.board[entry.row] = player.board[entry.row].filter(card => card.uid !== entry.card.uid);
  player.hand.push(entry.card);
  addLog(state, `${player.name}收回「${cardLabel(entry.card)}」。`);
  return true;
}

function reviveBest(state, playerIndex) {
  const candidates = reviveCandidates(state, playerIndex);
  if (!candidates.length) return;
  reviveCardByUid(state, playerIndex, candidates[0].uid);
}

function doScorch(state, playerIndex, row, opponentOnly, minEffective = 10) {
  recalcScores(state);
  const targets = [];
  const players = opponentOnly ? [otherIndex(playerIndex)] : [0, 1];
  players.forEach(pi => {
    ROWS.forEach(r => {
      if (row && row !== r) return;
      state.players[pi].board[r].forEach(card => {
        if (!card.hero && (card.effective || 0) >= minEffective) targets.push({ pi, row: r, card });
      });
    });
  });
  if (!targets.length) return addLog(state, "奇策未找到可摧毁目标。");
  const max = Math.max.apply(null, targets.map(item => item.card.effective || 0));
  const burned = targets.filter(item => (item.card.effective || 0) === max);
  burned.forEach(item => removeFromBoardToDiscard(state, item.pi, item.row, item.card.uid));
  addLog(state, `奇策摧毁 ${burned.length} 张战力 ${max} 的非传世人物。`);
}

function doDecoy(state, playerIndex) {
  const targets = decoyTargets(state, playerIndex);
  if (!targets.length) return addLog(state, "请辞归隐没有可收回的人物。");
  doDecoyTarget(state, playerIndex, targets[0].card.uid);
}

function transformBerserkers(state, row) {
  let count = 0;
  const bear = tokenByName("Transformed Bear");
  state.players.forEach(player => {
    player.board[row].forEach(card => {
      if (hasAbility(card, "Berserker") && !card.transformed) {
        card.transformed = true;
        card.name = bear?.displayName || bear?.name || "背水死士";
        card.baseName = bear?.baseName || "Transformed Bear";
        card.strength = bear?.strength || Math.max(card.strength || 0, 8);
        card.effective = card.strength;
        card.abilities = (bear?.abilities || []).slice();
        card.abilityDisplayNames = [];
        card.imageUrl = bear?.imageUrl || card.imageUrl;
        count += 1;
      }
    });
  });
  addLog(state, `蘑菇酒触发 ${count} 张狂战士变身。`);
}

function removeFromBoardToDiscard(state, playerIndex, row, uid) {
  const player = state.players[playerIndex];
  const idx = player.board[row].findIndex(card => card.uid === uid);
  if (idx >= 0) player.discard.push(player.board[row].splice(idx, 1)[0]);
}

function finishRound(state) {
  recalcScores(state);
  const p0 = state.players[0];
  const p1 = state.players[1];
  const s0 = totalScore(p0);
  const s1 = totalScore(p1);
  let winnerIndex = null;
  if (s0 > s1) winnerIndex = 0;
  if (s1 > s0) winnerIndex = 1;
  if (s0 === s1) winnerIndex = tieWinner(state);
  if (winnerIndex === null) {
    p0.roundsWon += 1;
    p1.roundsWon += 1;
    addLog(state, `第 ${state.round} 回合平局：${s0} : ${s1}，双方各得一局。`);
  } else {
    state.players[winnerIndex].roundsWon += 1;
    addLog(state, `第 ${state.round} 回合结束：${s0} : ${s1}，${state.players[winnerIndex].name}获胜。`);
    if (state.players[winnerIndex].faction === "Northern Realms") {
      draw(state.players[winnerIndex], 1);
      addLog(state, "开国群雄被动：获胜后抽 1 张牌。");
    }
  }
  state.roundResults.push({ round: state.round, scores: [s0, s1], winner: winnerIndex });
  if (state.players.some(player => player.roundsWon >= 2) || state.round >= 3) return finishMatch(state);
  cleanupRound(state);
  state.round += 1;
  state.weather = {};
  state.rowHorn = [{ melee: false, ranged: false, siege: false }, { melee: false, ranged: false, siege: false }];
  state.players.forEach(player => { player.passed = false; });
  state.current = winnerIndex === null ? 0 : winnerIndex;
  if (state.round === 3) applySkelligePerk(state);
  autoPassEmptyPlayers(state);
  recalcScores(state);
  addLog(state, `第 ${state.round} 回合开始。`);
}

function tieWinner(state) {
  const n0 = state.players[0].faction === "Nilfgaardian Empire";
  const n1 = state.players[1].faction === "Nilfgaardian Empire";
  if (n0 && !n1) return 0;
  if (n1 && !n0) return 1;
  return null;
}

function tokenCard(name, owner) {
  const raw = tokenByName(name);
  if (!raw) return null;
  return cloneCard({ ...raw, id: `token-${name}`, hero: raw.category === "hero" || (raw.abilities || []).includes("Hero") }, owner);
}

function cleanupRound(state) {
  state.players.forEach((player, pi) => {
    let keep = null;
    if (player.faction === "Monsters") {
      const candidates = [];
      ROWS.forEach(row => player.board[row].forEach(card => {
        if ((card.category === "unit" || card.category === "hero") && !hasAbility(card, "Spy")) candidates.push({ row, card });
      }));
      keep = candidates.length ? candidates[Math.floor(Math.random() * candidates.length)] : null;
    }
    ROWS.forEach(row => {
      const next = [];
      player.board[row].forEach(card => {
        if (keep && keep.card.uid === card.uid) next.push(card);
        else {
          if (hasAbility(card, "Summon Bovine Defense Force")) {
            const token = tokenCard("Bovine Defense Force", pi);
            if (token) player.retained.push(token);
          }
          if (hasAbility(card, "Summon Avenger")) {
            const token = tokenCard("Hemdall", pi);
            if (token) player.retained.push(token);
          }
          discardBoardCard(state, pi, card);
        }
      });
      player.board[row] = next;
    });
    player.retained.forEach(token => player.board[(token.row || [])[0] || "melee"].push(token));
    if (player.retained.length) addLog(state, `${player.name}的特殊召唤物进入新回合。`);
    player.retained = [];
    if (keep) addLog(state, `${player.name}的草莽星火被动保留「${cardLabel(keep.card)}」。`);
  });
}

function applySkelligePerk(state) {
  state.players.forEach(player => {
    if (player.faction !== "Skellige") return;
    const picks = shuffle(player.discard.filter(card => !card.hero && (card.category === "unit" || card.category === "hero"))).slice(0, 2);
    picks.forEach(card => {
      player.discard = player.discard.filter(item => item.uid !== card.uid);
      const target = boardTargetForCard(player.index, card);
      const row = (card.row || [])[0] || "melee";
      placeUnitOnBoard(state, player.index, target, row, card);
    });
    if (picks.length) addLog(state, `${player.name}的遗策复兴被动复归 ${picks.length} 张人物。`);
  });
}

function recordFinishedMatch(state) {
  if (state.historyRecorded) return;
  const p0 = state.players[0];
  const p1 = state.players[1];
  recordMatch({
    time: Date.now(),
    resultText: state.resultText,
    winner: state.winner,
    rounds: [p0.roundsWon, p1.roundsWon],
    scores: state.finalScores,
    roundResults: state.roundResults.slice(),
    humanFaction: p0.factionName,
    aiFaction: p1.factionName,
    humanLeader: cardLabel(p0.leader),
    aiLeader: cardLabel(p1.leader),
    humanLeaderId: p0.leader?.id || "",
    aiLeaderId: p1.leader?.id || "",
    difficulty: p1.difficulty,
    mode: state.mode,
    endReason: state.endReason || "normal"
  });
  state.historyRecorded = true;
}

function finishMatch(state) {
  state.over = true;
  state.pending = null;
  recalcScores(state);
  state.finalScores = [totalScore(state.players[0]), totalScore(state.players[1])];
  const p0 = state.players[0];
  const p1 = state.players[1];
  if (p0.roundsWon === p1.roundsWon) {
    state.winner = null;
    state.resultText = "平局";
  } else {
    state.winner = p0.roundsWon > p1.roundsWon ? 0 : 1;
    if (state.mode === "online") state.resultText = `${state.players[state.winner].name}获胜`;
    else state.resultText = state.winner === 0 ? "你赢了" : "系统获胜";
  }
  recordFinishedMatch(state);
  addLog(state, `整局结束：${state.resultText}。`);
}

function recalcScores(state) {
  state.players.forEach((player, pi) => {
    ROWS.forEach(row => {
      const cards = player.board[row];
      const bondCounts = {};
      cards.forEach(card => {
        if (hasAbility(card, "Tight Bond")) bondCounts[card.baseName] = (bondCounts[card.baseName] || 0) + 1;
      });
      const moraleCards = cards.filter(card => hasAbility(card, "Morale Boost"));
      const hasHorn = state.rowHorn[pi][row] || cards.some(card => hasAbility(card, "Commander's Horn"));
      cards.forEach(card => {
        let value = card.strength || 0;
        if (!card.hero && state.weather[row]) {
          value = player.leader && /half (of )?(their )?strength|lose half|半损|一半战力/i.test(`${player.leader.leaderAbility || ""}${player.leader.abilityText || ""}`) ? Math.ceil(value / 2) : Math.min(value, 1);
        }
        if (!card.hero && hasAbility(card, "Tight Bond") && bondCounts[card.baseName] > 1) value *= bondCounts[card.baseName];
        if (!card.hero) {
          value += moraleCards.filter(item => item.uid !== card.uid).length;
          if (hasHorn) value *= 2;
          if (hasAbility(card, "Spy") && player.leader && /treacherous/i.test(player.leader.baseName || "")) value *= 2;
        }
        card.effective = value;
      });
    });
  });
}

function totalScore(player) {
  return ROWS.reduce((sum, row) => sum + rowScore(player, row), 0);
}

function rowScore(player, row) {
  return player.board[row].reduce((sum, card) => sum + (card.effective == null ? (card.strength || 0) : card.effective), 0);
}

function bestRowForCard(state, playerIndex, card) {
  if (!card.row || !card.row.length) return null;
  if (card.row.length === 1) return card.row[0];
  let best = card.row[0];
  let bestScore = -1;
  card.row.forEach(row => {
    const score = rowScore(state.players[playerIndex], row);
    if (score > bestScore) { bestScore = score; best = row; }
  });
  return best;
}

function bestOwnRow(state, playerIndex) {
  return ROWS.slice().sort((a, b) => rowScore(state.players[playerIndex], b) - rowScore(state.players[playerIndex], a))[0];
}

function bestBerserkerRow(state, playerIndex) {
  const rows = ["melee", "ranged"].sort((a, b) => countBerserkers(state, playerIndex, b) - countBerserkers(state, playerIndex, a));
  return countBerserkers(state, playerIndex, rows[0]) > 0 ? rows[0] : null;
}

function countBerserkers(state, playerIndex, row) {
  return state.players[playerIndex].board[row].filter(card => hasAbility(card, "Berserker") && !card.transformed).length;
}

function weatherDamage(state, playerIndex, row) {
  if (state.weather[row]) return 0;
  return state.players[playerIndex].board[row].reduce((sum, card) => sum + (card.hero ? 0 : Math.max(0, (card.strength || 0) - 1)), 0);
}

function bestDecoyTarget(state, playerIndex) {
  const targets = [];
  ROWS.forEach(row => state.players[playerIndex].board[row].forEach(card => { if (!card.hero) targets.push({ row, card }); }));
  return targets.sort((a, b) => cardValue(b.card) - cardValue(a.card))[0] || null;
}

function estimatePlayGain(state, playerIndex, card) {
  if (card.category === "weather") {
    if (isClearWeather(card)) {
      const self = ROWS.reduce((sum, row) => sum + (state.weather[row] ? weatherDamage(state, playerIndex, row) : 0), 0);
      const opp = ROWS.reduce((sum, row) => sum + (state.weather[row] ? weatherDamage(state, otherIndex(playerIndex), row) : 0), 0);
      return self - opp;
    }
    const rows = weatherRowsFor(card);
    const oppLoss = rows.reduce((sum, row) => sum + weatherDamage(state, otherIndex(playerIndex), row), 0);
    const selfLoss = rows.reduce((sum, row) => sum + weatherDamage(state, playerIndex, row), 0);
    return oppLoss - selfLoss;
  }
  if (isHorn(card)) return Math.max(3, rowScore(state.players[playerIndex], bestOwnRow(state, playerIndex)));
  if (isScorch(card)) {
    const opponentOnly = card.category !== "special";
    const minEffective = card.category === "special" ? 0 : 10;
    return scorchGain(state, playerIndex, opponentOnly, minEffective);
  }
  if (isDecoy(card)) return bestDecoyTarget(state, playerIndex) ? 5 : -3;
  if (isMardroeme(card)) return bestBerserkerRow(state, playerIndex) ? 6 : -2;
  let value = card.strength || 0;
  const row = rowForCard(state, playerIndex, card) || "melee";
  if (!card.hero && state.weather[row]) value = Math.min(value, 1);
  if (!card.hero && state.rowHorn[playerIndex][row]) value *= 2;
  if (hasAbility(card, "Spy")) value = -(card.strength || 0) + 14;
  if (hasAbility(card, "Medic")) value += 6;
  if (hasAbility(card, "Muster")) value += 6;
  if (hasAbility(card, "Tight Bond")) value += 4;
  if (hasAbility(card, "Morale Boost")) value += 3;
  if (card.hero) value += 1;
  return value;
}

function scorchGain(state, playerIndex, opponentOnly, minEffective = 10) {
  recalcScores(state);
  const targets = [];
  const players = opponentOnly ? [otherIndex(playerIndex)] : [0, 1];
  players.forEach(pi => ROWS.forEach(row => state.players[pi].board[row].forEach(card => {
    if (!card.hero && (card.effective || 0) >= minEffective) targets.push({ pi, card });
  })));
  if (!targets.length) return -2;
  const max = Math.max.apply(null, targets.map(item => item.card.effective || 0));
  return targets.filter(item => (item.card.effective || 0) === max).reduce((sum, item) => sum + (item.pi === otherIndex(playerIndex) ? max : -max), 0);
}

function aiStep(state) {
  if (state.mode !== "ai" || state.over || state.current !== 1 || (state.mulligan && state.mulligan.active)) return;
  const ai = state.players[1];
  const cfg = AI_DIFFICULTY[ai.difficulty || "normal"] || AI_DIFFICULTY.normal;
  if (ai.hand.length === 0) return pass(state);
  if (!ai.leaderUsed && shouldUseLeader(state, cfg)) return useLeader(state, 1);
  const decision = aiDecideTurn(state, cfg);
  if (decision.action === "pass") return pass(state);
  if (decision.card) playCard(state, decision.card.uid, decision.row);
}

function shouldUseLeader(state, cfg) {
  if (cfg.blunder && Math.random() < cfg.blunder) return false;
  const ai = state.players[1];
  const diff = totalScore(ai) - totalScore(state.players[0]);
  if (diff > -8 && state.round < 3) return false;
  const text = leaderText(ai);
  if (/draw|抽/.test(text)) return ai.hand.length <= state.players[0].hand.length;
  if (/clear|weather/.test(text)) return Object.keys(state.weather).length > 0;
  return diff < -6;
}

function aiDecideTurn(state, cfg) {
  recalcScores(state);
  const ai = state.players[1];
  const human = state.players[0];
  const me = totalScore(ai);
  const opp = totalScore(human);
  const diff = me - opp;
  const candidates = aiBestCards(state, cfg);
  const best = candidates[0];
  const mustContest = human.roundsWon >= 1;
  if (human.passed) {
    if (diff > 0) return { action: "pass" };
    if (best && best.gain >= -diff + 1) return { action: "play", card: best.card, row: best.row };
    if (!mustContest && cfg.concede) return { action: "pass" };
    return best ? { action: "play", card: best.card, row: best.row } : { action: "pass" };
  }
  if (cfg.concede && !mustContest && diff < -18 && best && best.gain < Math.abs(diff) - 8 && ai.hand.length <= human.hand.length) return { action: "pass" };
  if (!mustContest && diff >= cfg.minLeadToStop && diff >= 8 && best && best.gain < 8 && state.round < 3) return { action: "pass" };
  if (!best) return { action: "pass" };
  return { action: "play", card: best.card, row: best.row };
}

function aiBestCards(state, cfg) {
  const ai = state.players[1];
  const scored = ai.hand.map(card => {
    let gain = estimatePlayGain(state, 1, card);
    if (cfg.valueNoise) gain += (Math.random() * 2 - 1) * cfg.valueNoise;
    return { card, row: rowForCard(state, 1, card), gain };
  }).sort((a, b) => b.gain - a.gain);
  if (cfg.blunder && Math.random() < cfg.blunder && scored.length > 1) {
    const i = 1 + Math.floor(Math.random() * (scored.length - 1));
    const t = scored[0]; scored[0] = scored[i]; scored[i] = t;
  }
  return scored;
}

function resolvePending(state, choice = {}) {
  const pending = state.pending;
  if (!pending || state.over) return false;
  if (pending.type === "row") {
    if (choice.skip) return cancelPending(state);
    if (!pending.rows.includes(choice.row)) return false;
    const uid = pending.cardUid;
    state.pending = null;
    return playCard(state, uid, choice.row);
  }
  const playerIndex = pending.playerIndex;
  state.pending = null;
  if (pending.type === "revive") {
    if (!choice.skip && choice.uid) reviveCardByUid(state, playerIndex, choice.uid);
    else addLog(state, `${state.players[playerIndex].name}跳过举荐复归。`);
    afterPlay(state);
    return true;
  }
  if (pending.type === "decoy") {
    if (!choice.skip && choice.uid) doDecoyTarget(state, playerIndex, choice.uid);
    else addLog(state, `${state.players[playerIndex].name}不收回人物。`);
    afterPlay(state);
    return true;
  }
  return false;
}

function cancelPending(state) {
  if (!state.pending) return false;
  if (state.pending.type === "row") {
    state.pending = null;
    addLog(state, "已取消选线，请重新选择手牌。 ");
    return true;
  }
  return resolvePending(state, { skip: true });
}

function surrender(state, playerIndex = 0) {
  if (!state || state.over) return false;
  recalcScores(state);
  state.over = true;
  state.pending = null;
  state.endReason = "surrender";
  state.winner = otherIndex(playerIndex);
  state.resultText = playerIndex === 0 ? "你已认输" : `${state.players[playerIndex].name}认输`;
  state.finalScores = [totalScore(state.players[0]), totalScore(state.players[1])];
  recordFinishedMatch(state);
  addLog(state, `${state.players[playerIndex].name}选择认输。`);
  return true;
}

module.exports = {
  createMatch,
  playCard,
  autoPlayHuman,
  pass,
  useLeader,
  mulliganSwap,
  finishMulligan,
  aiStep,
  resolvePending,
  cancelPending,
  surrender,
  totalScore,
  rowScore,
  handOwnerIndex,
  recalcScores,
  estimatePlayGain,
  cardLabel,
  resolvePending,
  cancelPending,
  surrender
};
