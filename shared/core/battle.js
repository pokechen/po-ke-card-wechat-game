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
    autoPassed: false,
    roundsWon: 0,
    retained: []
  };
}

function initialCurrent() {
  return 0;
}

function scoiaChooserIndex(players) {
  const indices = players.map((player, index) => player.faction === "Scoia'tael" ? index : -1).filter(index => index >= 0);
  return indices.length === 1 ? indices[0] : null;
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
  const humanName = mode === "ai" ? "玩家" : "玩家一";
  const players = [
    makePlayer(humanName, 0, humanFaction, "normal", humanCustomDeckIds, humanLeaderId),
    makePlayer(mode === "ai" ? "系统" : "玩家二", 1, aiFaction, difficulty, mode === "online" ? aiCustomDeckIds : null, aiLeaderId)
  ];
  const state = {
    mode,
    round: 1,
    current: 0,
    weather: {},
    rowHorn: [{ melee: false, ranged: false, siege: false }, { melee: false, ranged: false, siege: false }],
    players,
    mulligan: { active: true, current: 0, used: [0, 0], done: [false, false], max: 2, simultaneous: mode === "online" },
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
    lastPlayedSeq: 0,
    playedHistory: [],
    roundTransition: null
  };
  draw(state.players[0], 10);
  draw(state.players[1], 10);
  if (mode === "ai") aiMulligan(state);
  recalcScores(state);
  addLog(state, mode === "online"
    ? `双方同时换牌：每名玩家最多 ${state.mulligan.max} 张，换满后自动准备；也可直接准备。`
    : `先换牌：每名玩家最多 ${state.mulligan.max} 张，换满后自动开始；也可直接开始。`);
  if (humanCustomDeckIds) addLog(state, `${state.players[0].name}已使用该阵营自定义牌组：${customStatus.total} 张。`);
  else if (options.customDeckEnabled) addLog(state, "自定义牌组未完成，已改用自动组牌。");
  addLog(state, `对局开始：${state.players[0].name}使用${state.players[0].factionName}，${state.players[1].name}使用${state.players[1].factionName}。`);
  return state;
}

function addLog(state, text) {
  state.logs.unshift(text);
  state.logs = state.logs.slice(0, 120);
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

function mulliganPlayerIndex(state, playerIndex) {
  if (state.mulligan?.simultaneous && Number.isInteger(playerIndex)) return playerIndex;
  return state.mulligan?.current || 0;
}

function allMulliganDone(state) {
  const mulligan = state.mulligan || {};
  return state.players.every((_, index) => mulligan.done?.[index] || (mulligan.used?.[index] || 0) >= mulligan.max);
}

function aiFirstPlayerChoice(state, chooserIndex) {
  return otherIndex(chooserIndex);
}

function resolveFirstPlayerChoice(state, firstIndex) {
  const pending = state.pending;
  if (!pending || pending.type !== "firstPlayer") return false;
  const chooser = pending.playerIndex;
  const options = pending.options || [chooser, otherIndex(chooser)];
  const selected = options.includes(firstIndex) ? firstIndex : chooser;
  state.pending = null;
  state.current = selected;
  addLog(state, `百家争鸣生效：${state.players[chooser].name}选择${state.players[selected].name}先出牌。`);
  recalcScores(state);
  autoPassEmptyPlayers(state);
  settlePassedState(state);
  return true;
}

function beginFirstPlayerChoice(state) {
  const chooser = scoiaChooserIndex(state.players);
  if (chooser == null) {
    state.current = initialCurrent(state.players);
    return false;
  }
  state.current = chooser;
  state.pending = {
    type: "firstPlayer",
    playerIndex: chooser,
    options: [chooser, otherIndex(chooser)],
    title: "百家争鸣：选择先手"
  };
  addLog(state, `${state.players[chooser].name}的百家争鸣被动：请选择第一小局由谁先出牌。`);
  if (state.mode === "ai" && chooser === 1) resolveFirstPlayerChoice(state, aiFirstPlayerChoice(state, chooser));
  return !!state.pending;
}

function endMulligan(state) {
  state.mulligan.active = false;
  addLog(state, "换牌结束，正式开始行动。");
  const waitingChoice = beginFirstPlayerChoice(state);
  if (!waitingChoice) {
    recalcScores(state);
    autoPassEmptyPlayers(state);
    settlePassedState(state);
  }
  return true;
}

function mulliganSwap(state, uid, playerIndex) {
  if (!state.mulligan || !state.mulligan.active) return false;
  const pi = mulliganPlayerIndex(state, playerIndex);
  if (state.mulligan.done?.[pi] || (state.mulligan.used[pi] || 0) >= state.mulligan.max) return false;
  const ok = swapHandCard(state.players[pi], uid);
  if (ok) {
    state.mulligan.used[pi] = (state.mulligan.used[pi] || 0) + 1;
    addLog(state, `${state.players[pi].name}已换牌 ${state.mulligan.used[pi]}/${state.mulligan.max}。`);
    if ((state.mulligan.used[pi] || 0) >= state.mulligan.max) finishMulligan(state, pi);
  }
  return ok;
}

function finishMulligan(state, playerIndex) {
  if (!state.mulligan || !state.mulligan.active) return false;
  if (state.mulligan.simultaneous) {
    const pi = mulliganPlayerIndex(state, playerIndex);
    if (state.mulligan.done?.[pi]) return false;
    state.mulligan.done[pi] = true;
    if (allMulliganDone(state)) return endMulligan(state);
    addLog(state, `${state.players[pi].name}已准备，等待对方换牌。`);
    return true;
  }
  if ((state.mode === "hotseat" || state.mode === "online") && state.mulligan.current === 0) {
    state.mulligan.current = 1;
    state.current = 1;
    addLog(state, "请玩家二换牌。 ");
    return true;
  }
  return endMulligan(state);
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
  return hasAbility(card, "Commander's Horn") || card.baseName === "战鼓齐鸣";
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
  if (card.row && card.row.length === 1) return card.row[0];
  if (card.row && card.row.length > 1) return bestRowForCard(state, playerIndex, card);
  if (isHorn(card)) return bestOwnRow(state, playerIndex);
  if (isMardroeme(card)) return bestBerserkerRow(state, playerIndex) || "melee";
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

function hasActiveAvengerToken(player) {
  if (!player) return false;
  const onBoard = ROWS.some(row => (player.board[row] || []).some(card => card.baseName === "Hemdall"));
  const retained = (player.retained || []).some(card => card.baseName === "Hemdall");
  return onBoard || retained;
}

function summonAvengerOnLeave(state, owner, row, card, options = {}) {
  const player = state.players[owner];
  if (!player || !hasAbility(card, "Summon Avenger") || hasActiveAvengerToken(player)) return null;
  const token = tokenCard("Hemdall", owner);
  if (!token) return null;
  const targetRow = ROWS.includes(row) ? row : ((token.row || [])[0] || "melee");
  const originName = cardLabel(card);
  if (options.nextRound) {
    token.retainedRow = targetRow;
    token.retainedSource = "召唤陆抗";
    token.retainedOriginName = originName;
    player.retained.push(token);
    addLog(state, `${player.name}的「${originName}」离开战场，「${cardLabel(token)}」将在下一局开始时入场。`);
  } else {
    placeUnitOnBoard(state, owner, owner, targetRow, token);
    addLog(state, `${player.name}的「${originName}」离开战场，召唤「${cardLabel(token)}」进入${ROW_LABELS[targetRow]}。`);
  }
  return { token, row: targetRow, sourceName: "召唤陆抗", originName };
}

function avengerEffectText(avengers) {
  const names = (avengers || []).map(item => cardLabel(item.token));
  return compactNameCounts(names, "陆抗");
}

function discardBoardCard(state, controllerIndex, card, row = null, options = {}) {
  const owner = hasAbility(card, "Spy")
    ? controllerIndex
    : (Number.isInteger(card.owner) && state.players[card.owner] ? card.owner : controllerIndex);
  card.owner = owner;
  const avenger = summonAvengerOnLeave(state, owner, row, card, { nextRound: !!options.nextRound });
  queueSkyHoundSummon(state, owner, card);
  state.players[owner].discard.push(card);
  return { card, avenger };
}

function choiceRowsForCard(state, playerIndex, card) {
  const cardRows = Array.isArray(card.row) ? card.row.filter(row => ROWS.includes(row)) : [];
  if (cardRows.length) return cardRows.slice();
  if (isHorn(card)) return ROWS.slice();
  if (isMardroeme(card)) return ["melee", "ranged"];
  return [];
}

function normalizePreferredRow(state, playerIndex, card, preferredRow) {
  if (!preferredRow) return null;
  const rows = choiceRowsForCard(state, playerIndex, card);
  return rows.includes(preferredRow) ? preferredRow : null;
}

function needsHumanChoice(state, player, card, preferredRow) {
  if (preferredRow || state.mode === "ai" && player.index !== 0) return false;
  const rows = choiceRowsForCard(state, player.index, card);
  if (isHorn(card) || isMardroeme(card)) return rows.length > 1;
  return card.category !== "weather" && card.category !== "special" && rows.length > 1;
}

function pendingRowsForCard(state, playerIndex, card) {
  return choiceRowsForCard(state, playerIndex, card);
}

function markBattleAction(state, entry) {
  const seq = (state.lastPlayedSeq || 0) + 1;
  state.lastPlayedSeq = seq;
  const next = { seq, round: state.round, ...entry };
  state.lastPlayed = next;
  state.playedHistory = [next].concat(Array.isArray(state.playedHistory) ? state.playedHistory : []).slice(0, 80);
}

function appendLastBattleActionNote(state, note) {
  if (!state.lastPlayed || !note) return;
  const description = state.lastPlayed.description ? `${state.lastPlayed.description}；${note}` : note;
  state.lastPlayed = { ...state.lastPlayed, description };
  if (Array.isArray(state.playedHistory)) {
    state.playedHistory = state.playedHistory.map(entry => entry.seq === state.lastPlayed.seq ? state.lastPlayed : entry);
  }
}

function compactNameCounts(names, fallback) {
  const counts = {};
  (names || []).map(name => String(name || "").trim()).filter(Boolean).forEach(name => {
    counts[name] = (counts[name] || 0) + 1;
  });
  const entries = Object.entries(counts);
  if (!entries.length && fallback) entries.push([fallback, 1]);
  return entries.map(([name, count]) => count > 1 ? `${name}x${count}` : name).join("、");
}

function appendLastBattleActionEffect(state, label, result) {
  if (!label || !result) return;
  appendLastBattleActionNote(state, `${label}：${result}`);
}

function markFactionPerkAction(state, playerIndex, perkName, result) {
  const player = state.players[playerIndex];
  if (!player || !perkName || !result) return;
  markBattleAction(state, {
    type: "factionPerk",
    playerIndex,
    playerName: player.name,
    text: `${player.name}触发${perkName}：${result}`
  });
}

function markBoardChangeAction(state, playerIndex, changeName, result, options = {}) {
  const player = state.players[playerIndex];
  if (!player || !changeName || !result) return;
  markBattleAction(state, {
    type: "boardChange",
    playerIndex,
    playerName: player.name,
    ...(options.round != null ? { round: options.round } : {}),
    text: `${player.name}触发${changeName}：${result}`
  });
}

function markPassAction(state, playerIndex, auto) {
  const player = state.players[playerIndex];
  if (!player) return;
  markBattleAction(state, {
    type: "pass",
    playerIndex,
    playerName: player.name,
    text: `${player.name}${auto ? "手牌已打完，自动放弃本回合" : "选择放弃本回合"}`
  });
}

function markLastPlayed(state, playerIndex, card, targetIndex, row) {
  const targetName = state.players[targetIndex]?.name || "目标";
  const rowName = row ? ROW_LABELS[row] : "特殊效果";
  markBattleAction(state, {
    actionType: "card",
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
  });
}

function markLeaderUsed(state, playerIndex, description) {
  const leader = state.players[playerIndex]?.leader;
  if (!leader) return;
  markBattleAction(state, {
    actionType: "leader",
    playerIndex,
    playerName: state.players[playerIndex]?.name || "对手",
    targetIndex: playerIndex,
    targetName: state.players[playerIndex]?.name || "主将",
    row: null,
    rowName: "主将技能",
    cardId: leader.id,
    cardUid: leader.uid,
    name: cardLabel(leader),
    baseName: leader.baseName,
    imageUrl: leader.imageUrl,
    summary: leader.abilityText || leader.leaderAbility || leader.summary,
    category: "主将",
    faction: leader.faction || state.players[playerIndex]?.faction,
    cardRow: leader.row,
    abilities: leader.abilities,
    abilityDisplayNames: leader.abilityDisplayNames,
    hero: leader.hero,
    strength: "将",
    description: description || "主将技能"
  });
}

function playCard(state, cardUid, preferredRow) {
  if (state.over || state.pending || state.roundTransition || (state.mulligan && state.mulligan.active)) return false;
  const player = currentPlayer(state);
  if (player.passed) return false;
  const index = player.hand.findIndex(card => card.uid === cardUid);
  if (index < 0) return false;
  const card = player.hand[index];
  const selectedRow = normalizePreferredRow(state, player.index, card, preferredRow);
  if (preferredRow && !selectedRow) return false;
  if (needsHumanChoice(state, player, card, selectedRow)) {
    state.pending = {
      type: "row",
      cardUid,
      rows: pendingRowsForCard(state, player.index, card),
      title: `选择「${cardLabel(card)}」作用线`
    };
    addLog(state, `请选择「${cardLabel(card)}」的作用线。`);
    return true;
  }
  if (card.category === "weather" || card.category === "special") {
    if (isDecoy(card) && isHumanControlled(state, player.index)) {
      state.pending = {
        type: "decoy",
        playerIndex: player.index,
        cardUid: card.uid,
        candidates: decoyTargets(state, player.index),
        title: "请辞归隐：选择收回目标"
      };
      addLog(state, "请选择要收回手牌的人物，或取消。");
      return true;
    }
    player.hand.splice(index, 1);
    const row = selectedRow || rowForCard(state, player.index, card);
    markLastPlayed(state, player.index, card, player.index, row);
    resolveSpecial(state, player.index, card, row);
    player.discard.push(card);
    addLog(state, `${player.name}打出${categoryLabel(card)}「${cardLabel(card)}」。`);
  } else {
    player.hand.splice(index, 1);
    const target = boardTargetForCard(player.index, card);
    const row = selectedRow || rowForCard(state, player.index, card) || "melee";
    placeUnitOnBoard(state, player.index, target, row, card);
    addLog(state, `${player.name}打出「${cardLabel(card)}」到${target === player.index ? "己方" : "对方"}${ROW_LABELS[row]}。`);
    markLastPlayed(state, player.index, card, target, row);
    resolveUnitAbility(state, player.index, target, row, card);
  }
  if (!state.pending) afterPlay(state);
  return true;
}

function pass(state) {
  if (state.over || (state.mulligan && state.mulligan.active)) return false;
  const player = currentPlayer(state);
  if (!player || player.passed) return false;
  player.passed = true;
  addLog(state, `${player.name}选择放弃本回合。`);
  markPassAction(state, state.current, false);
  advanceTurn(state);
  return true;
}

function useLeader(state, playerIndex) {
  if (state.over || (state.mulligan && state.mulligan.active)) return false;
  const player = state.players[playerIndex];
  if (!player || player.leaderUsed || !player.leader) return false;
  player.leaderUsed = true;
  const text = leaderText(player);
  const locksOpponentLeader = /cancel your opponent|取消.*主将|cancel.*leader/.test(text);
  markLeaderUsed(state, playerIndex, locksOpponentLeader ? "对手主将技能被封锁" : "主将技能");
  if (locksOpponentLeader) {
    state.players[otherIndex(playerIndex)].leaderUsed = true;
    addLog(state, `${player.name}使用主将「${cardLabel(player.leader)}」，对手主将技能被封锁。`);
  } else {
    addLog(state, `${player.name}使用主将「${cardLabel(player.leader)}」。`);
    if (/look at 3 random/.test(text)) {
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
  } else if (/double|翻倍|horn|鼓舞|号令/.test(text)) {
    const row = rowFromLeaderText(text) || bestOwnRow(state, playerIndex) || "melee";
    state.rowHorn[playerIndex][row] = true;
  } else if (/destroy|scorch|摧毁|奇策/.test(text)) {
    doScorch(state, playerIndex, rowFromLeaderText(text), true, 10);
  } else if (/draw|抽/.test(text)) {
    draw(player, 1);
  } else if (/half (of )?(their )?strength|lose half|半损|一半战力/i.test(text)) {
    addLog(state, `${player.name}激活主将「${cardLabel(player.leader)}」：己方单位在恶劣时局下仅损失一半战力。`);
  } else {
    addLog(state, "该主将能力已作为持续/被动效果处理。");
  }
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
      player.autoPassed = true;
      addLog(state, `${player.name}手牌已打完，自动放弃。`);
      markPassAction(state, player.index, true);
    }
  });
}

function settlePassedState(state) {
  if (state.over) return true;
  if (state.players.every(player => player.passed)) {
    finishRound(state);
    return true;
  }
  if (state.players[state.current]?.passed) {
    const next = otherIndex(state.current);
    if (!state.players[next]?.passed) state.current = next;
  }
  return false;
}

function advanceTurn(state) {
  if (state.over) return;
  if (settlePassedState(state)) return;
  const next = otherIndex(state.current);
  if (!state.players[next].passed) state.current = next;
  settlePassedState(state);
}

function resolveSpecial(state, playerIndex, card, row) {
  if (isClearWeather(card)) {
    const clearedRows = ROWS.filter(item => state.weather[item]).map(item => ROW_LABELS[item]);
    state.weather = {};
    addLog(state, "晴天：全部时局影响已清除。");
    if (clearedRows.length) appendLastBattleActionEffect(state, "晴天", `清除${clearedRows.join("、")}`);
    return;
  }
  if (card.category === "weather") {
    const affectedRows = [];
    weatherRowsFor(card).forEach(item => {
      if (!state.weather[item]) affectedRows.push(ROW_LABELS[item]);
      state.weather[item] = true;
      addLog(state, `${ROW_LABELS[item]}受到「${cardLabel(card)}」影响。`);
    });
    if (affectedRows.length) appendLastBattleActionEffect(state, "时局", affectedRows.join("、"));
    return;
  }
  if (isHorn(card)) {
    const targetRow = row || bestOwnRow(state, playerIndex) || "melee";
    const wasActive = !!state.rowHorn[playerIndex][targetRow];
    state.rowHorn[playerIndex][targetRow] = true;
    addLog(state, `${state.players[playerIndex].name}在${ROW_LABELS[targetRow]}鼓舞士气。`);
    const boosted = (state.players[playerIndex].board[targetRow] || []).filter(item => !item.hero).length;
    if (!wasActive && boosted) appendLastBattleActionEffect(state, "鼓舞", `${ROW_LABELS[targetRow]}x${boosted}`);
    return;
  }
  if (isScorch(card)) return doScorch(state, playerIndex, null, false, 0);
  if (isDecoy(card)) return doDecoy(state, playerIndex);
  if (isMardroeme(card)) return transformBerserkers(state, row || bestBerserkerRow(state, playerIndex) || "melee");
}

function resolveUnitAbility(state, playedBy, target, row, card) {
  if (hasAbility(card, "Spy")) {
    const player = state.players[playedBy];
    const before = player.hand.length;
    draw(player, 2);
    const drawn = player.hand.length - before;
    addLog(state, `出使生效：${player.name}抽 ${drawn || 0} 张牌。`);
    if (drawn > 0) appendLastBattleActionEffect(state, "出使", `抽牌x${drawn}`);
  }
  if (hasAbility(card, "Medic")) {
    const candidates = reviveCandidates(state, playedBy);
    if (isHumanControlled(state, playedBy) && candidates.length) {
      state.pending = { type: "revive", playerIndex: playedBy, candidates, title: "选择举荐复归目标" };
      addLog(state, "请选择要复归的人物，或跳过。 ");
    } else reviveBest(state, playedBy);
  }
  if (isHorn(card)) {
    const targetRow = row || bestOwnRow(state, playedBy) || "melee";
    const wasActive = !!state.rowHorn[playedBy][targetRow];
    state.rowHorn[playedBy][targetRow] = true;
    addLog(state, `${state.players[playedBy].name}在${ROW_LABELS[targetRow]}鼓舞士气。`);
    const boosted = (state.players[playedBy].board[targetRow] || []).filter(item => !item.hero).length;
    if (!wasActive && boosted) appendLastBattleActionEffect(state, "鼓舞", `${ROW_LABELS[targetRow]}x${boosted}`);
  }
  if (hasAbility(card, "Muster")) doMuster(state, playedBy, target, row, card);
  if (hasAbility(card, "Summon Shield Maidens")) summonByName(state, playedBy, target, row, "岳家军");
  if (hasAbility(card, "Mardroeme")) transformBerserkers(state, row);
  if (isScorch(card) && card.category !== "special") {
    const scorchRow = row || (card.row && card.row[0]) || null;
    doScorch(state, playedBy, scorchRow, true, 10);
  }
}

function doMuster(state, playedBy, target, row, card) {
  const player = state.players[playedBy];
  const group = card.musterGroup || null;
  const summonTarget = card.musterTarget || null;
  const movedNames = [];
  let moved = 0;
  for (let i = player.deck.length - 1; i >= 0; i--) {
    const item = player.deck[i];
    const related = summonTarget
      ? item.baseName === summonTarget
      : group
        ? item.musterGroup === group
        : item.baseName === card.baseName;
    if (item.uid !== card.uid && related) {
      player.deck.splice(i, 1);
      const targetRow = (item.row || []).includes(row) ? row : ((item.row || [])[0] || row);
      placeUnitOnBoard(state, playedBy, target, targetRow, item);
      movedNames.push(item.baseName || item.name || "关联牌");
      moved += 1;
    }
  }
  if (moved) {
    const summary = compactNameCounts(movedNames, summonTarget || group || cardLabel(card));
    const note = `集贤：${summary || `额外打出x${moved}`}`;
    addLog(state, `${note}。`);
    appendLastBattleActionNote(state, note);
  }
}

function summonByName(state, playedBy, target, row, baseName) {
  const player = state.players[playedBy];
  let moved = 0;
  const summoned = [];
  [player.hand, player.deck].forEach(pile => {
    for (let i = pile.length - 1; i >= 0; i--) {
      const item = pile[i];
      if (item.baseName === baseName) {
        pile.splice(i, 1);
        const targetRow = (item.row || []).includes(row) ? row : ((item.row || [])[0] || row);
        placeUnitOnBoard(state, playedBy, target, targetRow, item);
        summoned.push({ card: item, row: targetRow });
        moved += 1;
      }
    }
  });
  if (moved) {
    addLog(state, `${player.name}召唤 ${moved} 张「${baseName}」。`);
    const summary = compactNameCounts(summoned.map(s => s.card.baseName || s.card.name || baseName), baseName);
    const note = `召唤岳家军：${summary || `${baseName}x${moved}`}`;
    appendLastBattleActionNote(state, note);
  }
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

function isReviveCandidate(card) {
  return !!card && !card.hero && (card.category === "unit" || card.category === "hero");
}

function reviveCandidates(state, playerIndex) {
  return state.players[playerIndex].discard
    .filter(isReviveCandidate)
    .sort((a, b) => cardValue(b) - cardValue(a));
}

function reviveCardByUid(state, playerIndex, uid) {
  const player = state.players[playerIndex];
  const card = reviveCandidates(state, playerIndex).find(item => item.uid === uid);
  if (!card) return false;
  player.discard = player.discard.filter(item => item.uid !== uid);
  const target = boardTargetForCard(playerIndex, card);
  const row = rowForCard(state, playerIndex, card) || "melee";
  placeUnitOnBoard(state, playerIndex, target, row, card);
  addLog(state, `举荐生效：${player.name}复归「${cardLabel(card)}」到${target === playerIndex ? "己方" : "对方"}${ROW_LABELS[row]}。`);
  appendLastBattleActionEffect(state, "济世", cardLabel(card));
  resolveUnitAbility(state, playerIndex, target, row, card);
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
  if (!entry) return null;
  player.board[entry.row] = player.board[entry.row].filter(card => card.uid !== entry.card.uid);
  const owner = Number.isInteger(entry.card.owner) && state.players[entry.card.owner] ? entry.card.owner : playerIndex;
  const avenger = summonAvengerOnLeave(state, owner, entry.row, entry.card);
  queueSkyHoundSummon(state, owner, entry.card);
  entry.card.owner = playerIndex;
  entry.card.playedBy = playerIndex;
  player.hand.push(entry.card);
  addLog(state, `${player.name}收回「${cardLabel(entry.card)}」。`);
  return { card: entry.card, avenger };
}

function reviveBest(state, playerIndex) {
  const candidates = reviveCandidates(state, playerIndex);
  if (!candidates.length) return;
  reviveCardByUid(state, playerIndex, candidates[0].uid);
}

function collectScorchTargets(state, playerIndex, row, opponentOnly, minEffective = 10) {
  const targets = [];
  const players = opponentOnly ? [otherIndex(playerIndex)] : [0, 1];
  players.forEach(pi => {
    const rows = row ? [row] : ROWS;
    rows.forEach(r => {
      if (!state.players[pi]?.board?.[r]) return;
      if (row && rowScore(state.players[pi], r) < minEffective) return;
      state.players[pi].board[r].forEach(card => {
        if (!card.hero && (row || (card.effective || 0) >= minEffective)) targets.push({ pi, row: r, card });
      });
    });
  });
  return targets;
}

function doScorch(state, playerIndex, row, opponentOnly, minEffective = 10) {
  recalcScores(state);
  const targets = collectScorchTargets(state, playerIndex, row, opponentOnly, minEffective);
  if (!targets.length) {
    if (row) {
      const scope = opponentOnly ? "对方" : "目标";
      addLog(state, `奇策未触发：${scope}${ROW_LABELS[row] || row}总战力未达 ${minEffective}，或没有可摧毁的非传世人物。`);
    } else addLog(state, "奇策未找到可摧毁目标。");
    return;
  }
  const max = Math.max.apply(null, targets.map(item => item.card.effective || 0));
  const burned = targets.filter(item => (item.card.effective || 0) === max);
  const details = burned.map(item => {
    const ownerName = state.players[item.pi]?.name || `玩家${item.pi + 1}`;
    return `${ownerName}「${cardLabel(item.card)}」`;
  });
  const results = burned.map(item => removeFromBoardToDiscard(state, item.pi, item.row, item.card.uid)).filter(Boolean);
  addLog(state, `奇策摧毁 ${burned.length} 张战力 ${max} 的非传世人物：${details.join("、")}。`);
  appendLastBattleActionEffect(state, "奇策", `摧毁${compactNameCounts(details)}`);
  const avengers = results.map(item => item.avenger).filter(Boolean);
  if (avengers.length) appendLastBattleActionEffect(state, "召唤陆抗", avengerEffectText(avengers));
}

function doDecoy(state, playerIndex) {
  const targets = decoyTargets(state, playerIndex);
  if (!targets.length) return addLog(state, "请辞归隐没有可收回的人物。");
  const result = doDecoyTarget(state, playerIndex, targets[0].card.uid);
  if (result?.card) appendLastBattleActionEffect(state, "请辞", cardLabel(result.card));
  if (result?.avenger) appendLastBattleActionEffect(state, "召唤陆抗", avengerEffectText([result.avenger]));
}

function transformedBerserkerToken(card, row) {
  const cardRows = card.row || [];
  const isYoung = row === "ranged" || (cardRows.includes("ranged") && !cardRows.includes("melee")) || (card.strength || 0) <= 2;
  return tokenByName(isYoung ? "Transformed Young Vildkaarl" : "Transformed Vildkaarl") || tokenByName("Transformed Bear");
}

function applyTransformedBerserker(card, token, row) {
  const isYoung = row === "ranged" || (card.strength || 0) <= 2;
  const fallback = isYoung
    ? {
      baseName: "Transformed Young Vildkaarl",
      displayName: "背水锐卒",
      category: "unit",
      row: ["ranged"],
      rowDisplayName: ROW_LABELS.ranged,
      strength: 8,
      abilities: ["Tight Bond"],
      abilityDisplayNames: ["同盟"],
      abilityText: "奋起转化：战力 8；同名背水锐卒在同一阵线并列时战力倍增。",
      hero: false
    }
    : {
      baseName: "Transformed Vildkaarl",
      displayName: "背水死士",
      category: "unit",
      row: ["melee"],
      rowDisplayName: ROW_LABELS.melee,
      strength: 14,
      abilities: ["Morale Boost"],
      abilityDisplayNames: ["振势"],
      abilityText: "奋起转化：战力 14；为同一阵线其他非传世人物各加 1 点战力。",
      hero: false
    };
  const next = token || fallback;
  const originalImageUrl = card.imageUrl;
  card.transformed = true;
  card.transformedFrom = card.transformedFrom || card.baseName || card.name;
  card.name = next.displayName || next.name || fallback.displayName;
  card.displayName = next.displayName || fallback.displayName;
  card.baseName = next.baseName || fallback.baseName;
  card.faction = next.faction || card.faction;
  card.factionDisplayName = next.factionDisplayName || card.factionDisplayName;
  card.category = next.category || fallback.category;
  card.row = (next.row && next.row.length ? next.row : fallback.row).slice();
  card.rowDisplayName = next.rowDisplayName || fallback.rowDisplayName;
  card.strength = next.strength ?? fallback.strength;
  card.effective = card.strength;
  card.abilities = (next.abilities && next.abilities.length ? next.abilities : fallback.abilities).slice();
  card.abilityDisplayNames = (next.abilityDisplayNames && next.abilityDisplayNames.length ? next.abilityDisplayNames : fallback.abilityDisplayNames).slice();
  card.abilityText = next.abilityText || fallback.abilityText;
  card.summary = card.abilityDisplayNames.join("、") || card.abilityText || card.summary;
  card.hero = !!next.hero || card.category === "hero" || card.abilities.includes("Hero");
  card.imageUrl = next.imageUrl || originalImageUrl;
}

function transformBerserkers(state, row) {
  let count = 0;
  state.players.forEach(player => {
    player.board[row].forEach(card => {
      if (hasAbility(card, "Berserker") && !card.transformed) {
        applyTransformedBerserker(card, transformedBerserkerToken(card, row), row);
        count += 1;
      }
    });
  });
  addLog(state, `破釜触发 ${count} 张奋起人物转化。`);
  if (count) appendLastBattleActionEffect(state, "破釜", `奋起x${count}`);
}

function removeFromBoardToDiscard(state, playerIndex, row, uid) {
  const player = state.players[playerIndex];
  const idx = player.board[row].findIndex(card => card.uid === uid);
  if (idx < 0) return null;
  return discardBoardCard(state, playerIndex, player.board[row].splice(idx, 1)[0], row);
}

function finishRound(state) {
  if (state.roundTransition) return;
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
    addLog(state, `第 ${state.round} 回合平局：${s0} : ${s1}，本局不计胜负，稍后进入下一局。`);
  } else {
    const tieReason = s0 === s1 ? "（平分按阵营被动判定）" : "";
    state.players[winnerIndex].roundsWon += 1;
    addLog(state, `第 ${state.round} 回合结束：${s0} : ${s1}，${state.players[winnerIndex].name}获胜${tieReason}。`);
    if (state.players[winnerIndex].faction === "Northern Realms") {
      draw(state.players[winnerIndex], 1);
      addLog(state, "开国群雄被动：获胜后抽 1 张牌。");
    }
  }
  markBattleAction(state, {
    type: "roundResult",
    text: winnerIndex === null
      ? `双方放弃本局：平局，比分 ${s0} : ${s1}。`
      : `双方放弃本局：${state.players[winnerIndex].name}获胜，比分 ${s0} : ${s1}。`
  });
  state.roundResults.push({ round: state.round, scores: [s0, s1], winner: winnerIndex });
  state.roundTransition = {
    seq: state.lastPlayedSeq || 0,
    round: state.round,
    scores: [s0, s1],
    winner: winnerIndex,
    matchOver: state.players.some(player => player.roundsWon >= 2) || state.round >= 3,
    nextRound: state.round + 1
  };
}

function continueRoundTransition(state) {
  const transition = state && state.roundTransition;
  if (!transition || state.over) return false;
  state.roundTransition = null;
  if (transition.matchOver) return finishMatch(state);
  cleanupRound(state);
  state.round = transition.nextRound || (state.round + 1);
  state.weather = {};
  state.rowHorn = [{ melee: false, ranged: false, siege: false }, { melee: false, ranged: false, siege: false }];
  state.players.forEach(player => { player.passed = false; player.autoPassed = false; });
  state.current = transition.winner === null ? 0 : transition.winner;
  if (state.round === 3) applySkelligePerk(state);
  autoPassEmptyPlayers(state);
  recalcScores(state);
  addLog(state, `第 ${state.round} 回合开始。`);
  settlePassedState(state);
  return true;
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

function queueSkyHoundSummon(state, owner, card) {
  const player = state.players[owner];
  if (!player || !hasAbility(card, "Summon Sky Hound")) return;
  const token = tokenCard("Howling Sky Hound", owner);
  if (!token) return;
  token.retainedSource = "召唤啸天犬";
  token.retainedOriginName = cardLabel(card);
  player.retained.push(token);
  addLog(state, `${player.name}的「${cardLabel(card)}」离开战场，啸天犬将在下一回合开始时入场。`);
}

function retainableMonsterUnits(player) {
  if (player.faction !== "Monsters") return [];
  const candidates = [];
  ROWS.forEach(row => {
    player.board[row].forEach(card => {
      if (card.category === "unit" || card.category === "hero") candidates.push({ row, card });
    });
  });
  return candidates;
}

function cleanupRound(state) {
  state.players.forEach((player, pi) => {
    const monsterRetained = randomItem(retainableMonsterUnits(player), null);
    if (monsterRetained) {
      monsterRetained.card.retainedRow = monsterRetained.row;
      player.retained.push(monsterRetained.card);
      const retainedName = cardLabel(monsterRetained.card);
      addLog(state, `${player.name}的草莽星火被动保留「${retainedName}」到下一局。`);
      markFactionPerkAction(state, pi, "草莽星火", `保留「${retainedName}」到下一局`);
    }
    ROWS.forEach(row => {
      const cardsToDiscard = player.board[row].filter(card => !monsterRetained || card.uid !== monsterRetained.card.uid);
      player.board[row] = [];
      cardsToDiscard.forEach(card => {
        discardBoardCard(state, pi, card, row, { nextRound: true });
      });
    });
    player.retained.forEach(token => {
      const row = token.retainedRow || (token.row || [])[0] || "melee";
      const source = token.retainedSource || "";
      const originName = token.retainedOriginName || "";
      delete token.retainedRow;
      delete token.retainedSource;
      delete token.retainedOriginName;
      player.board[row].push(token);
      if (source) {
        const origin = originName ? `（${originName}）` : "";
        markBoardChangeAction(state, pi, `${source}${origin}`, `「${cardLabel(token)}」进入己方${ROW_LABELS[row]}`, { round: state.round + 1 });
      }
    });
    if (player.retained.length) addLog(state, `${player.name}的特殊召唤物进入新回合。`);
    player.retained = [];
  });
}

function applySkelligePerk(state) {
  state.players.forEach(player => {
    if (player.faction !== "Skellige") return;
    const picks = shuffle(reviveCandidates(state, player.index)).slice(0, 2);
    picks.forEach(card => {
      player.discard = player.discard.filter(item => item.uid !== card.uid);
      const target = boardTargetForCard(player.index, card);
      const row = rowForCard(state, player.index, card) || "melee";
      placeUnitOnBoard(state, player.index, target, row, card);
    });
    if (picks.length) {
      const names = picks.map(card => `「${cardLabel(card)}」`).join("、");
      const result = `从弃牌堆复归 ${picks.length} 张人物：${names}`;
      addLog(state, `${player.name}的遗策复兴被动${result}。`);
      markFactionPerkAction(state, player.index, "遗策复兴", result);
    }
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
  state.roundTransition = null;
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
  return true;
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
          const leaderHalfActive = player.leader && player.leaderUsed && /half (of )?(their )?strength|lose half|半损|一半战力/i.test(`${player.leader.leaderAbility || ""}${player.leader.abilityText || ""}`);
          value = leaderHalfActive ? Math.ceil(value / 2) : Math.min(value, 1);
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

// 估算召唤类能力带来的额外收益：岳飞「召唤岳家军」会把己方手牌与牌库中所有的
// 「岳家军」部署到疆场，并触发同盟（Tight Bond）翻倍。把这些将被召唤卡牌的净
// 增量战力计入本次出牌收益，让自动出牌把「岳飞 + 岳家军」当作一个整体来决策
// （即岳飞与岳家军绑定，优先一起打出，而非先零散打出岳家军）。
function summonPowerBonus(state, playerIndex, card) {
  if (!hasAbility(card, "Summon Shield Maidens")) return 0;
  const player = state.players[playerIndex];
  const existing = (player.board.melee || []).filter(c => c.baseName === "岳家军");
  const toSummon = [];
  [player.hand, player.deck].forEach(pile => pile.forEach(item => {
    if (item.baseName === "岳家军" && item.uid !== card.uid) toSummon.push(item);
  }));
  if (!toSummon.length) return 0;
  const totalCount = existing.length + toSummon.length;
  let after = 0;
  let before = 0;
  existing.forEach(c => { after += (c.strength || 0) * totalCount; before += (c.strength || 0) * existing.length; });
  toSummon.forEach(c => { after += (c.strength || 0) * totalCount; });
  return Math.max(0, after - before);
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
  if (isHorn(card)) {
    const row = rowForCard(state, playerIndex, card) || bestOwnRow(state, playerIndex) || "melee";
    return Math.max(3, rowScore(state.players[playerIndex], row));
  }
  if (isScorch(card)) {
    const opponentOnly = card.category !== "special";
    const minEffective = card.category === "special" ? 0 : 10;
    const scorchRow = card.category === "special" ? null : rowForCard(state, playerIndex, card);
    return scorchGain(state, playerIndex, scorchRow, opponentOnly, minEffective);
  }
  if (isDecoy(card)) return bestDecoyTarget(state, playerIndex) ? 5 : -3;
  if (isMardroeme(card)) {
    const row = rowForCard(state, playerIndex, card);
    return row && countBerserkers(state, playerIndex, row) ? 6 : -2;
  }
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
  // 召唤类能力：把将被召唤的卡牌战力（含同盟翻倍）计入本次出牌收益，
  // 使岳飞与其岳家军在对战 AI 中被视为一个整体（绑定出牌）。
  value += summonPowerBonus(state, playerIndex, card);
  return value;
}

function scorchGain(state, playerIndex, row, opponentOnly, minEffective = 10) {
  recalcScores(state);
  const targets = collectScorchTargets(state, playerIndex, row, opponentOnly, minEffective);
  if (!targets.length) return -2;
  const max = Math.max.apply(null, targets.map(item => item.card.effective || 0));
  return targets.filter(item => (item.card.effective || 0) === max).reduce((sum, item) => sum + (item.pi === otherIndex(playerIndex) ? max : -max), 0);
}

function aiStep(state) {
  if (state.mode !== "ai" || state.over || state.roundTransition || state.current !== 1 || (state.mulligan && state.mulligan.active)) return;
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
  if (/half (of )?(their )?strength|lose half|半损|一半战力/i.test(text)) return Object.keys(state.weather).length > 0 && diff < 0;
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
  // 我方手牌打完后自动放弃：系统继续把剩余手牌逐张打出，展示分数变化，不直接结束本回合
  if (human.passed && human.autoPassed) {
    return best ? { action: "play", card: best.card, row: best.row } : { action: "pass" };
  }
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
  if (pending.type === "firstPlayer") return resolveFirstPlayerChoice(state, choice.playerIndex);
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
    if (!state.pending) afterPlay(state);
    return true;
  }
  if (pending.type === "decoy") {
    const player = state.players[playerIndex];
    if (choice.cancel) {
      addLog(state, `${player.name}取消了请辞归隐。`);
      return true;
    }
    const idx = player.hand.findIndex(c => c.uid === pending.cardUid);
    if (idx < 0) {
      afterPlay(state);
      return true;
    }
    const card = player.hand.splice(idx, 1)[0];
    markLastPlayed(state, playerIndex, card, playerIndex, null);
    const result = !choice.skip && choice.uid ? doDecoyTarget(state, playerIndex, choice.uid) : null;
    if (!result) addLog(state, `${player.name}不收回人物。`);
    player.discard.push(card);
    addLog(state, `${player.name}打出${categoryLabel(card)}「${cardLabel(card)}」。`);
    if (result?.card) appendLastBattleActionEffect(state, "请辞", cardLabel(result.card));
    if (result?.avenger) appendLastBattleActionEffect(state, "召唤陆抗", avengerEffectText([result.avenger]));
    afterPlay(state);
    return true;
  }
  return false;
}

function cancelPending(state) {
  if (!state.pending) return false;
  if (state.pending.type === "firstPlayer") return resolveFirstPlayerChoice(state, state.pending.playerIndex);
  if (state.pending.type === "row") {
    state.pending = null;
    addLog(state, "已取消选线，请重新选择手牌。 ");
    return true;
  }
  if (state.pending.type === "decoy") return resolvePending(state, { cancel: true });
  return resolvePending(state, { skip: true });
}

function surrender(state, playerIndex = 0) {
  if (!state || state.over) return false;
  recalcScores(state);
  state.over = true;
  state.pending = null;
  state.roundTransition = null;
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
  pass,
  useLeader,
  mulliganSwap,
  finishMulligan,
  aiStep,
  continueRoundTransition,
  resolvePending,
  cancelPending,
  surrender,
  totalScore,
  rowScore,
  handOwnerIndex,
  recalcScores,
  estimatePlayGain,
  cardLabel
};
