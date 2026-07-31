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
  cloneCard,
  isHeroCard
} = require("./cards");
const { recordMatch, getActiveCustomDeckIds } = require("./storage");

const AI_DIFFICULTY = {
  easy: { blunder: 0.45, concede: false, valueNoise: 8, minLeadToStop: 99 },
  normal: { blunder: 0.1, concede: true, valueNoise: 2, minLeadToStop: 5 },
  hard: { blunder: 0, concede: true, valueNoise: 0, minLeadToStop: 1 }
};
const MATCH_MORALE = 2;

  // ===== 领先时主动停牌阈值的可调覆盖 =====
  // 默认值经固定种子、交替座位的 100 场 hard 随机卡牌对战验证；tuning 仅供回归实验覆盖。
  function resolvePassTuning(cfg) {
    const t = (cfg && cfg.tuning) || {};
    const expectedCatchPerCard = (typeof t.expectedCatchPerCard === "number") ? t.expectedCatchPerCard : 10;
    return {
      expectedCatchPerCard,
      passLeadMin: (typeof t.passLeadMin === "number") ? t.passLeadMin : expectedCatchPerCard,
      minCardsToCatch: (typeof t.minCardsToCatch === "number") ? t.minCardsToCatch : 3,
      unconditionalPassLead: (typeof t.unconditionalPassLead === "number") ? t.unconditionalPassLead : expectedCatchPerCard * 3,
      passCostFloor: (typeof t.passCostFloor === "number") ? t.passCostFloor : 10,
    };
  }

const ADVANCED_AI = {
  knownStateSearchDepth: 6,
  maxActionsPerNode: 20,
  // 搜索队列长度上限：限制 BFS 中同时存活的克隆状态数，从而约束内存峰值。
  // 正常对局 visited 剪枝有效，队列峰值远低于此值、逻辑不受影响；
  // 仅在 Recall 等导致 visited 失效、状态指数膨胀时限制队列，避免 OOM 崩溃。
  maxSearchQueue: 24000,
  scoreGainWeight: 1.35,
  finalScoreGainWeight: 2.2,
  futureResourceWeight: 0.62,
  mustWinFutureWeight: 0.28,
  finalFutureWeight: 0.12,
  handDeltaWeight: 4.5,
  highestPowerRemovalNetSwingNormal: 8,
  highestPowerRemovalNetSwingFinal: 4,
  situationNetSwing: 6,
  terminalWin: 100000,
  terminalLoss: -100000
};

function makePlayer(name, index, faction, difficulty, customDeckIds, leaderId) {
  const deck = buildDeck(index, { faction, difficulty, customDeckIds });
  return {
    name,
    index,
    faction,
    factionName: FACTION_LABELS[faction] || faction,
    difficulty: difficulty || "normal",
    deckMode: customDeckIds ? "custom" : "random",
    leader: defaultLeader(faction, leaderId),
    leaderUsed: false,
    halfSituationRound: null,
    battleCardIds: deck.map(card => card.id),
    deck,
    hand: [],
    board: { "疆场": [], "朝堂": [], "文脉": [] },
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

function initiativeChooserIndex(players) {
  const indices = players.map((player, index) => player.faction === "百家争鸣" ? index : -1).filter(index => index >= 0);
  return indices.length === 1 ? indices[0] : null;
}

function draw(player, count) {
  for (let i = 0; i < count; i++) {
    const card = player.deck.shift();
    if (card) {
      card.owner = player.index;
      card.controller = player.index;
      card.zone = "hand";
      card.boardRow = null;
      player.hand.push(card);
    }
  }
}

function randomItem(list, fallback) {
  return list.length ? list[Math.floor(Math.random() * list.length)] : fallback;
}

function resolveFaction(value, fallback) {
  const validFallback = FACTION_KEYS.includes(fallback) ? fallback : FACTION_KEYS[0];
  if (value === "random") return randomItem(FACTION_KEYS, validFallback);
  return FACTION_KEYS.includes(value) ? value : validFallback;
}

function resolveAiFaction(value) {
  return resolveFaction(value, "草莽星火");
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
  const humanFaction = resolveFaction(options.humanFaction, "开国群雄");
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
    situations: {},
    rowHorn: [{ "疆场": false, "朝堂": false, "文脉": false }, { "疆场": false, "朝堂": false, "文脉": false }],
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
    leaderReveals: [null, null],
    randomRestore: false,
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

function mulliganThreshold(player) {
  return player.difficulty === "hard" ? 11 : player.difficulty === "easy" ? 9 : 10;
}

function lowestMulliganCard(player, cards) {
  const threshold = mulliganThreshold(player);
  return cards
    .filter(card => !isHeroCard(card) && cardValue(card) < threshold)
    .sort((a, b) => cardValue(a) - cardValue(b))[0] || null;
}

function oneWaySummonTarget(card) {
  if (hasAbility(card, "召唤岳家军")) return "岳家军";
  if (hasAbility(card, "集贤") && card.recruitTarget) return card.recruitTarget;
  return "";
}

function recruitMulliganKey(card) {
  if (!hasAbility(card, "集贤")) return "";
  if (card.recruitGroupDisplayName) return `group:${card.recruitGroupDisplayName}`;
  return `target:${card.recruitTarget || card.name}`;
}

function selectAiMulliganCard(player) {
  const summonTargets = new Set(player.hand.map(oneWaySummonTarget).filter(Boolean));
  const summonedTarget = lowestMulliganCard(player, player.hand.filter(card => summonTargets.has(card.name)));
  if (summonedTarget) return summonedTarget;

  const recruitGroups = new Map();
  player.hand.forEach(card => {
    const key = recruitMulliganKey(card);
    if (!key) return;
    if (!recruitGroups.has(key)) recruitGroups.set(key, []);
    recruitGroups.get(key).push(card);
  });
  const duplicateRecruiters = [];
  recruitGroups.forEach(cards => {
    if (cards.length < 2) return;
    const ranked = cards.slice().sort((a, b) => cardValue(b) - cardValue(a));
    duplicateRecruiters.push(...ranked.slice(1));
  });
  const duplicateRecruiter = lowestMulliganCard(player, duplicateRecruiters);
  if (duplicateRecruiter) return duplicateRecruiter;

  return lowestMulliganCard(player, player.hand);
}

function aiMulligan(state) {
  const ai = state.players[1];
  for (let i = 0; i < 2; i++) {
    if (!ai.deck.length) break;
    const card = selectAiMulliganCard(ai);
    if (!card) break;
    swapHandCard(ai, card.uid);
  }
}

function swapHandCard(player, uid) {
  if (!player.deck.length) return false;
  const idx = player.hand.findIndex(card => card.uid === uid);
  if (idx < 0) return false;
  const old = player.hand[idx];
  const fresh = player.deck.shift();
  fresh.owner = player.index;
  fresh.controller = player.index;
  fresh.zone = "hand";
  fresh.boardRow = null;
  old.owner = player.index;
  old.controller = player.index;
  old.zone = "deck";
  old.boardRow = null;
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
  const chooser = initiativeChooserIndex(state.players);
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

function situationRowsFor(card) {
  if (card.category !== "situation") return [];
  if (isSituationClear(card)) return [];
  return (card.row || []).slice();
}

function isSituationClear(card) {
  return card.category === "situation" && /拨云见日/i.test(card.name || "");
}

function isHorn(card) {
  return hasAbility(card, "鼓舞") || card.name === "战鼓齐鸣";
}

function isHighestPowerRemoval(card) {
  return hasAbility(card, "奇策") || card.name === "釜底抽薪";
}

function isRecall(card) {
  return card.name === "请辞归隐" || /收回手牌/.test(card.abilityText || "");
}

function isAwakening(card) {
  return hasAbility(card, "雪耻") || card.name === "卧薪尝胆" || card.name === "破釜沉舟";
}

function isAwakeningStratagem(card) {
  return card.category === "stratagem" && isAwakening(card);
}

// ---- 卧薪尝胆「死牌开局即打」策略（默认行为）----
// 卧薪尝胆只转化场上的蛰伏人物；若双方场上与己方手牌均无蛰伏，则卧薪尝胆为彻底无用的死牌。
// 轮到自己且对手尚未放弃时，立即把该死牌打出清掉废牌、让对手多打一张，随后按对手出牌做正常决策：
//  - 无出使（手牌/牌库/弃牌均无出使，抽不到蛰伏）-> 开局直接打。
//  - 有出使：出使还在手或牌库中时本回合不打，等出使打出后若仍未抽到蛰伏立即打
//    （按需求「不需要看济世」，不考虑济世复归弃牌堆蛰伏）。
//  - 对手已放弃本回合时返回 null，由常规逻辑去收割该局，避免误打废牌送掉本该拿下的局。
function awakeningProactiveDumpDecision(state, playerIndex) {
  const p = state.players[playerIndex];
  const card = p.hand.find(item => isAwakeningStratagem(item));
  if (!card) return null;
  // 己方与对手场上均无蛰伏、己方手牌也无蛰伏：卧薪尝胆彻底无用
  // （若对手场上有蛰伏，打出雪耻反而会帮对手把蛰伏转化成强力单位，故不打）。
  if (ROWS.some(row => countDormantUnits(state, playerIndex, row) > 0)) return null;
  if (ROWS.some(row => countDormantUnits(state, otherIndex(playerIndex), row) > 0)) return null;
  if (p.hand.some(c => hasAbility(c, "蛰伏"))) return null;
  if (state.players[otherIndex(playerIndex)].passed) return null;
  const scoutInHand = p.hand.some(c => hasAbility(c, "出使"));
  const scoutInDeck = (p.deck || []).some(c => hasAbility(c, "出使"));
  const scoutInDiscard = (p.discard || []).some(c => hasAbility(c, "出使"));
  // 出使还在手或牌库：本回合不打，等出使打出后再判断
  if (scoutInHand || scoutInDeck) return null;
  // 无出使（抽不到蛰伏）-> 开局立即打出；有出使且已打出(在弃牌堆)且未抽到蛰伏 -> 立即打出
  return { action: "play", card, row: rowForCard(state, playerIndex, card) || "疆场" };
}

function cardLabel(card) {
  return card.name || "卡牌";
}

// 朱温选牌时，同名、同效果的时局牌只展示一次；保留首张的真实 uid 供后续从牌库打出。
function uniqueDeckSituationCards(player) {
  const seen = new Set();
  return (player?.deck || []).filter(card => {
    if (card?.category !== "situation") return false;
    const key = [
      card.name || card.id || "",
      card.abilityText || "",
      Array.isArray(card.row) ? card.row.join(",") : ""
    ].join("\u0001");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function leaderText(player) {
  return `${player.leader?.name || ""} ${player.leader?.abilityText || ""}`.toLowerCase();
}

// 朱元璋：双方出使人物战力翻倍。
// 注意：仅对「出使」卡生效，且作用于双方场上所有出使卡，不是某行的鼓舞。
function isEnvoyDoubleLeader(player) {
  if (!player || !player.leader) return false;
  return /出使.*翻倍|间谍翻倍/i.test(leaderText(player));
}

function envoyDoubleActive(state) {
  return state.players.some(p => p.leaderUsed && isEnvoyDoubleLeader(p));
}

function playSituationFromLeader(state, name, preferredRow) {
  let row;
  if (ROWS.includes(preferredRow)) row = preferredRow;
  else if (/边患/.test(name)) row = "疆场";
  else if (/蔽日|党争/.test(name)) row = "朝堂";
  else if (/倾盆|典籍/.test(name)) row = "文脉";
  else {
    const rows = ROWS.filter(item => !state.situations[item]);
    row = rows[0] || "疆场";
  }
  const alreadyActive = !!state.situations[row];
  state.situations[row] = true;
  return alreadyActive ? [] : [row];
}

function playLeaderSituationCard(state, playerIndex, uid) {
  const player = state.players[playerIndex];
  if (!player) return false;
  const idx = player.deck.findIndex(card => card.uid === uid);
  if (idx < 0) return false;
  const card = player.deck.splice(idx, 1)[0];
  // 立即打出该时局牌（与从手牌打出时局牌的表现保持一致）
  resolveStrategyCard(state, playerIndex, card, null);
  card.owner = playerIndex;
  card.controller = playerIndex;
  card.zone = "discard";
  card.boardRow = null;
  card.playedBy = playerIndex;
  player.discard.push(card);
  player.leaderUsed = true;
  markLeaderUsed(state, playerIndex, `打出时局牌「${cardLabel(card)}」`);
  addLog(state, `${player.name}使用主将「${cardLabel(player.leader)}」并打出时局牌「${cardLabel(card)}」。`);
  afterPlay(state);
  return true;
}

function takeBestDiscardToHand(state, fromIndex, toIndex, targetUid) {
  const from = state.players[fromIndex];
  const to = state.players[toIndex];
  const candidates = from.discard.filter(card => card.category === "unit" || card.category === "hero");
  if (!candidates.length) return null;
  candidates.sort((a, b) => cardValue(b) - cardValue(a));
  const card = candidates.find(item => item.uid === targetUid) || candidates[0];
  from.discard = from.discard.filter(item => item.uid !== card.uid);
  card.owner = toIndex;
  card.controller = toIndex;
  card.zone = "hand";
  card.boardRow = null;
  card.playedBy = toIndex;
  to.hand.push(card);
  addLog(state, `${to.name}从弃牌堆取回「${cardLabel(card)}」。`);
  return card;
}

function discardTwoDrawOne(state, playerIndex, selectedUids = null) {
  const player = state.players[playerIndex];
  const picks = Array.isArray(selectedUids)
    ? selectedUids.map(uid => player.hand.find(card => card.uid === uid)).filter(Boolean)
    : player.hand.slice().sort((a, b) => cardValue(a) - cardValue(b)).slice(0, 2);
  if (picks.length !== 2 || new Set(picks.map(card => card.uid)).size !== 2) return false;
  const picked = new Set(picks.map(card => card.uid));
  player.hand = player.hand.filter(card => !picked.has(card.uid));
  picks.forEach(card => {
    card.owner = playerIndex;
    card.controller = playerIndex;
    card.zone = "discard";
    card.boardRow = null;
  });
  player.discard.push(...picks);
  const before = player.hand.length;
  draw(player, 1);
  const drawn = player.hand.length - before;
  addLog(state, `${player.name}弃置「${picks.map(cardLabel).join("」、「")}」并抽 ${drawn} 张牌。`);
  return { picks, drawn };
}

function optimizeMultiRowRows(state, playerIndex) {
  const player = state.players[playerIndex];
  recalcScores(state);
  let moved = 0;
  let changed = true;
  let guard = 0;
  // 多张通才卡可能互相影响（士气、号令等），反复评估直到稳定
  while (changed && guard < 50) {
    changed = false;
    guard += 1;
    ROWS.forEach(row => {
      player.board[row].slice().forEach(card => {
        if (!hasAbility(card, "通才") || !card.row || card.row.length < 2) return;
        const best = multiRowBestRow(state, playerIndex, card);
        if (!best || best === card.boardRow) return;
        player.board[card.boardRow] = player.board[card.boardRow].filter(item => item.uid !== card.uid);
        player.board[best].push(card);
        card.boardRow = best;
        moved += 1;
        changed = true;
      });
    });
  }
  if (moved > 0) addLog(state, `${player.name}调整机动单位到更优战线。`);
  return moved;
}

function rowFromLeaderText(text) {
  if (/文脉/.test(text)) return "文脉";
  if (/朝堂/.test(text)) return "朝堂";
  if (/疆场/.test(text)) return "疆场";
  return null;
}

function rowForCard(state, playerIndex, card) {
  if (card.row && card.row.length === 1) return card.row[0];
  if (card.row && card.row.length > 1) return bestRowForCard(state, playerIndex, card);
  if (isHorn(card)) return bestOwnRow(state, playerIndex);
  if (isAwakening(card)) return bestDormantUnitRow(state, playerIndex) || "疆场";
  return null;
}

function boardTargetForCard(playerIndex, card) {
  return hasAbility(card, "出使") ? otherIndex(playerIndex) : playerIndex;
}

function placeUnitOnBoard(state, playedBy, target, row, card) {
  card.playedBy = playedBy;
  card.owner = playedBy;
  card.controller = target;
  card.zone = "board";
  card.boardRow = row;
  state.players[target].board[row].push(card);
}

function leaveSummonSpec(card) {
  if (hasAbility(card, "召唤无当飞军")) {
    return { tokenName: "无当飞军", sourceName: "召唤无当飞军", fallbackName: "无当飞军" };
  }
  if (hasAbility(card, "召唤东吴水师")) {
    return { tokenName: "东吴水师", sourceName: "召唤东吴水师", fallbackName: "东吴水师" };
  }
  return null;
}

function summonTokenOnLeave(state, owner, card, options = {}) {
  const player = state.players[owner];
  const spec = leaveSummonSpec(card);
  if (!player || !spec) return null;
  const token = tokenCard(spec.tokenName, owner);
  if (!token) return null;
  const targetRow = (token.row || []).find(row => ROWS.includes(row)) || "疆场";
  const originName = cardLabel(card);
  if (options.nextRound) {
    token.retainedRow = targetRow;
    token.retainedSource = spec.sourceName;
    token.retainedOriginName = originName;
    player.retained.push(token);
    addLog(state, `${player.name}的「${originName}」离开战场，「${cardLabel(token)}」将在下一局开始时入场。`);
  } else {
    placeUnitOnBoard(state, owner, owner, targetRow, token);
    addLog(state, `${player.name}的「${originName}」离开战场，召唤「${cardLabel(token)}」进入${ROW_LABELS[targetRow]}。`);
  }
  return { token, row: targetRow, sourceName: spec.sourceName, fallbackName: spec.fallbackName, originName };
}

function appendLeaveSummonEffects(state, summons) {
  const groups = new Map();
  (summons || []).filter(Boolean).forEach(item => {
    if (!groups.has(item.sourceName)) groups.set(item.sourceName, []);
    groups.get(item.sourceName).push(item);
  });
  groups.forEach((items, sourceName) => {
    const names = items.map(item => cardLabel(item.token));
    appendLastBattleActionEffect(state, sourceName, compactNameCounts(names, items[0]?.fallbackName || "召唤物"));
  });
}

function discardBoardCard(state, controllerIndex, card, row = null, options = {}) {
  const owner = hasAbility(card, "出使")
    ? controllerIndex
    : (Number.isInteger(card.owner) && state.players[card.owner] ? card.owner : controllerIndex);
  card.owner = owner;
  card.controller = owner;
  card.zone = "discard";
  card.boardRow = null;
  const summon = summonTokenOnLeave(state, owner, card, { nextRound: !!options.nextRound });
  state.players[owner].discard.push(card);
  return { card, summon };
}

function choiceRowsForCard(state, playerIndex, card) {
  const cardRows = Array.isArray(card.row) ? card.row.filter(row => ROWS.includes(row)) : [];
  if (cardRows.length) return cardRows.slice();
  if (isHorn(card)) return ROWS.slice();
  if (isAwakening(card)) return ["疆场", "朝堂"];
  return [];
}

function normalizePreferredRow(state, playerIndex, card, preferredRow) {
  if (!preferredRow) return null;
  const rows = choiceRowsForCard(state, playerIndex, card);
  return rows.includes(preferredRow) ? preferredRow : null;
}

function needsHumanChoice(state, player, card, preferredRow) {
  if (preferredRow || state.autoControlAll || state.mode === "ai" && player.index !== 0) return false;
  const rows = choiceRowsForCard(state, player.index, card);
  if (isHorn(card) || isAwakening(card)) return rows.length > 1;
  return card.category !== "situation" && card.category !== "stratagem" && rows.length > 1;
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
    name: card.name,
    summary: card.summary,
    category: categoryLabel(card),
    faction: card.faction,
    cardRow: card.row,
    abilities: card.abilities,
    abilityDisplayNames: card.abilityDisplayNames,
    strength: card.category === "situation" || card.category === "stratagem" ? "策" : card.strength,
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
    summary: leader.abilityText || leader.summary,
    category: "主将",
    faction: leader.faction || state.players[playerIndex]?.faction,
    cardRow: leader.row,
    abilities: leader.abilities,
    abilityDisplayNames: leader.abilityDisplayNames,
    strength: "将",
    description: description || "主将技能"
  });
}

function playCard(state, cardUid, preferredRow, actionOptions = {}) {
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
  if (card.category === "situation" || card.category === "stratagem") {
    if (isRecall(card) && isHumanControlled(state, player.index)) {
      state.pending = {
        type: "recall",
        playerIndex: player.index,
        cardUid: card.uid,
        candidates: recallTargets(state, player.index),
        title: "请辞归隐：选择收回目标"
      };
      addLog(state, "请选择要收回手牌的人物，或取消。");
      return true;
    }
    player.hand.splice(index, 1);
    const row = selectedRow || rowForCard(state, player.index, card);
    markLastPlayed(state, player.index, card, player.index, row);
    resolveStrategyCard(state, player.index, card, row, actionOptions);
    card.owner = player.index;
    card.controller = player.index;
    card.zone = "discard";
    card.boardRow = null;
    player.discard.push(card);
    addLog(state, `${player.name}打出${categoryLabel(card)}「${cardLabel(card)}」。`);
  } else {
    player.hand.splice(index, 1);
    const target = boardTargetForCard(player.index, card);
    const row = selectedRow || rowForCard(state, player.index, card) || "疆场";
    placeUnitOnBoard(state, player.index, target, row, card);
    addLog(state, `${player.name}打出「${cardLabel(card)}」到${target === player.index ? "己方" : "对方"}${ROW_LABELS[row]}。`);
    markLastPlayed(state, player.index, card, target, row);
    resolveUnitAbility(state, player.index, target, row, card, actionOptions);
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

function useLeader(state, playerIndex, actionOptions = {}) {
  if (state.over || state.pending || state.roundTransition || (state.mulligan && state.mulligan.active)) return false;
  const player = state.players[playerIndex];
  if (!player || state.current !== playerIndex || player.passed || player.leaderUsed || !player.leader) return false;
  const text = leaderText(player);
  const discardsTwo = /弃置\s*2\s*张手牌/.test(text);
  if (discardsTwo && player.hand.length < 2) return false;

  // 朱温：从牌组选择任意 1 张时局牌并立即打出（需要玩家选择具体牌）
  const picksDeckSituation = /从牌组选择.*时局牌/.test(text);
  if (picksDeckSituation) {
    const deckSituation = uniqueDeckSituationCards(player);
    if (!deckSituation.length) return false;
    // 已明确指定要打出的牌（云端 AI 决策 / 联机提交）：直接打出
    if (actionOptions.leaderCardUid) {
      const chosen = deckSituation.find(card => card.uid === actionOptions.leaderCardUid);
      if (!chosen) return false;
      return playLeaderSituationCard(state, playerIndex, chosen.uid);
    }
    if (isHumanControlled(state, playerIndex)) {
      state.pending = {
        type: "leaderSituation",
        playerIndex,
        candidates: deckSituation,
        title: "朱温：从牌组选 1 张时局牌打出"
      };
      addLog(state, `${player.name}使用主将「${cardLabel(player.leader)}」，从牌组选择时局牌。`);
      return true;
    }
    // 非人类且无指定牌：自动选最优时局牌打出，避免 AI 卡在待选状态
    let best = deckSituation[0];
    let bestScore = -Infinity;
    deckSituation.forEach(card => {
      const s = estimatePlayGain(state, playerIndex, card);
      if (s > bestScore) { bestScore = s; best = card; }
    });
    return playLeaderSituationCard(state, playerIndex, best.uid);
  }

  if (discardsTwo && isHumanControlled(state, playerIndex)) {
    state.pending = {
      type: "leaderDiscard",
      playerIndex,
      candidates: player.hand.slice(),
      selectedUids: [],
      title: "黄巢：选择第 1 张弃牌"
    };
    addLog(state, `${player.name}正在为主将「${cardLabel(player.leader)}」选择 2 张弃牌。`);
    return true;
  }
  player.leaderUsed = true;
  const locksOpponentLeader = /封锁.*主将|取消.*主将/.test(text);
  markLeaderUsed(state, playerIndex, locksOpponentLeader ? "封锁：对手主将技能" : "主将技能");
  if (locksOpponentLeader) {
    state.players[otherIndex(playerIndex)].leaderUsed = true;
    addLog(state, `${player.name}使用主将「${cardLabel(player.leader)}」，对手主将技能被封锁。`);
  } else {
    addLog(state, `${player.name}使用主将「${cardLabel(player.leader)}」。`);
    if (/侦察.*手牌|查看.*手牌/.test(text)) {
      const cards = shuffle(state.players[otherIndex(playerIndex)].hand).slice(0, 3);
      if (!Array.isArray(state.leaderReveals)) state.leaderReveals = [null, null];
      state.leaderReveals[playerIndex] = {
        seq: state.lastPlayed?.seq || state.lastPlayedSeq || 0,
        playerIndex,
        opponentIndex: otherIndex(playerIndex),
        cards
      };
      const result = cards.length ? `手牌x${cards.length}` : "无手牌";
      addLog(state, `侦察完成：查看对手 ${cards.length} 张手牌。`);
      appendLastBattleActionEffect(state, "侦察", result);
    } else if (/opponent.*discard|对手.*弃牌/.test(text)) {
      const taken = takeBestDiscardToHand(state, otherIndex(playerIndex), playerIndex, actionOptions.leaderTargetUid);
      if (taken) appendLastBattleActionEffect(state, "取回", cardLabel(taken));
      else {
        const before = player.hand.length;
        draw(player, 1);
        const drawn = player.hand.length - before;
        if (drawn > 0) appendLastBattleActionEffect(state, "抽牌", `手牌x${drawn}`);
      }
    } else if (/济世.*随机|随机目标/.test(text)) {
      state.randomRestore = true;
      addLog(state, `${player.name}启用随机济世：双方济世复归目标改为随机。`);
      appendLastBattleActionEffect(state, "济世", "随机目标");
    } else if (/己方.*弃牌堆.*手牌|弃牌堆.*取回.*手牌/.test(text)) {
      const taken = takeBestDiscardToHand(state, playerIndex, playerIndex, actionOptions.leaderTargetUid);
      if (taken) appendLastBattleActionEffect(state, "取回", cardLabel(taken));
      else {
        const before = player.hand.length;
        draw(player, 1);
        const drawn = player.hand.length - before;
        if (drawn > 0) appendLastBattleActionEffect(state, "抽牌", `手牌x${drawn}`);
      }
    } else if (/弃置\s*2\s*张手牌/.test(text)) {
      const result = discardTwoDrawOne(state, playerIndex, actionOptions.leaderDiscardUids);
      if (result) {
        const drawResult = result.drawn > 0 ? `，抽牌x${result.drawn}` : "";
        appendLastBattleActionEffect(state, "弃牌", `${result.picks.map(cardLabel).join("、")}${drawResult}`);
      }
    } else if (/双方弃牌堆.*洗回.*牌库/.test(text)) {
      const count = state.players.reduce((sum, item) => sum + item.discard.length, 0);
      state.players.forEach(item => {
        item.discard.forEach(card => {
          card.owner = item.index;
          card.controller = item.index;
          card.zone = "deck";
          card.boardRow = null;
        });
        item.deck = shuffle(item.deck.concat(item.discard));
        item.discard = [];
      });
      addLog(state, "双方弃牌堆已洗回牌库。");
      if (count > 0) appendLastBattleActionEffect(state, "洗牌", `弃牌堆x${count}`);
    } else if (/通才.*更优战线|通才.*移动|移动.*通才/.test(text)) {
      const moved = optimizeMultiRowRows(state, playerIndex);
      if (moved > 0) appendLastBattleActionEffect(state, "调度", `通才x${moved}`);
    } else if (/从牌组选择.*(边患四起|党争迷局|典籍散佚|时局牌)/.test(text)) {
      const rows = playSituationFromLeader(state, text, actionOptions.leaderRow);
      if (rows.length) appendLastBattleActionEffect(state, "时局", rows.map(row => ROW_LABELS[row]).join("、"));
    } else if (/清除|拨云/.test(text)) {
      const clearedRows = ROWS.filter(row => state.situations[row]).map(row => ROW_LABELS[row]);
      state.situations = {};
      if (clearedRows.length) appendLastBattleActionEffect(state, "晴天", `清除${clearedRows.join("、")}`);
    } else if (isEnvoyDoubleLeader(player)) {
      // 朱元璋：双方出使人物战力翻倍，仅对出使卡生效，非某行鼓舞。
      appendLastBattleActionEffect(state, "主将技能", "双方出使人物战力翻倍");
    } else if (/翻倍|鼓舞|号令/.test(text)) {
      const row = rowFromLeaderText(text) || (ROWS.includes(actionOptions.leaderRow) ? actionOptions.leaderRow : null) || bestOwnRow(state, playerIndex) || "疆场";
      const wasActive = !!state.rowHorn[playerIndex][row];
      state.rowHorn[playerIndex][row] = true;
      const boosted = (state.players[playerIndex].board[row] || []).filter(card => !isHeroCard(card)).length;
      if (!wasActive) appendLastBattleActionEffect(state, "鼓舞", boosted ? `${ROW_LABELS[row]}x${boosted}` : ROW_LABELS[row]);
    } else if (/摧毁|奇策/.test(text)) {
      doHighestPowerRemoval(state, playerIndex, rowFromLeaderText(text), true, 10);
    } else if (/抽/.test(text)) {
      const before = player.hand.length;
      draw(player, 1);
      const drawn = player.hand.length - before;
      if (drawn > 0) appendLastBattleActionEffect(state, "抽牌", `手牌x${drawn}`);
    } else if (/half (of )?(their )?strength|lose half|半损|一半战力/i.test(text)) {
      player.halfSituationRound = state.round;
      addLog(state, `${player.name}激活主将「${cardLabel(player.leader)}」：本回合己方单位在恶劣时局下仅损失一半战力。`);
      appendLastBattleActionEffect(state, "半损", "本回合");
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

function resolveStrategyCard(state, playerIndex, card, row, actionOptions = {}) {
  if (isSituationClear(card)) {
    const clearedRows = ROWS.filter(item => state.situations[item]).map(item => ROW_LABELS[item]);
    state.situations = {};
    addLog(state, "晴天：全部时局影响已清除。");
    if (clearedRows.length) appendLastBattleActionEffect(state, "晴天", `清除${clearedRows.join("、")}`);
    return;
  }
  if (card.category === "situation") {
    const affectedRows = [];
    situationRowsFor(card).forEach(item => {
      if (!state.situations[item]) affectedRows.push(ROW_LABELS[item]);
      state.situations[item] = true;
      addLog(state, `${ROW_LABELS[item]}受到「${cardLabel(card)}」影响。`);
    });
    if (affectedRows.length) appendLastBattleActionEffect(state, "时局", affectedRows.join("、"));
    return;
  }
  if (isHorn(card)) {
    const targetRow = row || bestOwnRow(state, playerIndex) || "疆场";
    const wasActive = !!state.rowHorn[playerIndex][targetRow];
    state.rowHorn[playerIndex][targetRow] = true;
    addLog(state, `${state.players[playerIndex].name}在${ROW_LABELS[targetRow]}鼓舞士气。`);
    const boosted = (state.players[playerIndex].board[targetRow] || []).filter(item => !isHeroCard(item)).length;
    if (!wasActive && boosted) appendLastBattleActionEffect(state, "鼓舞", `${ROW_LABELS[targetRow]}x${boosted}`);
    return;
  }
  if (isHighestPowerRemoval(card)) return doHighestPowerRemoval(state, playerIndex, null, false, 0);
  if (isRecall(card)) return doRecall(state, playerIndex, actionOptions.recallTargetUid);
  if (isAwakening(card)) return transformDormantUnits(state, row || bestDormantUnitRow(state, playerIndex) || "疆场");
}

function resolveUnitAbility(state, playedBy, target, row, card, actionOptions = {}) {
  if (hasAbility(card, "出使")) {
    const player = state.players[playedBy];
    const before = player.hand.length;
    draw(player, 2);
    const drawn = player.hand.length - before;
    addLog(state, `出使生效：${player.name}抽 ${drawn || 0} 张牌。`);
    if (drawn > 0) appendLastBattleActionEffect(state, "出使", `抽牌x${drawn}`);
  }
  if (hasAbility(card, "济世")) {
    const candidates = reviveCandidates(state, playedBy);
    const sequence = Array.isArray(actionOptions.revivalTargetUids)
      ? actionOptions.revivalTargetUids
      : (actionOptions.revivalTargetUid ? [actionOptions.revivalTargetUid] : []);
    const sequenceIndex = Number(actionOptions.revivalTargetIndex || 0);
    const selectedUid = sequence[sequenceIndex];
    const selected = !state.randomRestore && selectedUid && candidates.find(item => item.uid === selectedUid);
    if (selected) {
      reviveCardByUid(state, playedBy, selected.uid, { ...actionOptions, revivalTargetIndex: sequenceIndex + 1 });
    } else if (state.randomRestore) {
      reviveBest(state, playedBy);
    } else if (isHumanControlled(state, playedBy) && candidates.length) {
      state.pending = { type: "revive", playerIndex: playedBy, candidates, title: "选择举荐复归目标" };
      addLog(state, "请选择要复归的人物，或跳过。 ");
    } else reviveBest(state, playedBy);
  }
  if (isHorn(card)) {
    const targetRow = row || bestOwnRow(state, playedBy) || "疆场";
    addLog(state, `${state.players[playedBy].name}在${ROW_LABELS[targetRow]}鼓舞士气。`);
    const boosted = (state.players[playedBy].board[targetRow] || []).filter(item => !isHeroCard(item)).length;
    if (boosted) appendLastBattleActionEffect(state, "鼓舞", `${ROW_LABELS[targetRow]}x${boosted}`);
  }
  if (hasAbility(card, "集贤")) doRecruit(state, playedBy, target, row, card);
  if (hasAbility(card, "召唤岳家军")) summonByName(state, playedBy, target, row, "岳家军");
  if (hasAbility(card, "雪耻")) transformDormantUnits(state, row);
  if (isHighestPowerRemoval(card) && card.category !== "stratagem") {
    const highestPowerRemovalRow = row || (card.row && card.row[0]) || null;
    doHighestPowerRemoval(state, playedBy, highestPowerRemovalRow, true, 10);
  }
}

function doRecruit(state, playedBy, target, row, card) {
  const player = state.players[playedBy];
  const group = card.recruitGroupDisplayName || null;
  const summonTarget = card.recruitTarget || null;
  const movedNames = [];
  let moved = 0;
  for (let i = player.deck.length - 1; i >= 0; i--) {
    const item = player.deck[i];
    const related = summonTarget
      ? item.name === summonTarget
      : group
        ? item.recruitGroupDisplayName === group
        : item.name === card.name;
    if (item.uid !== card.uid && related) {
      player.deck.splice(i, 1);
      const targetRow = (item.row || []).includes(row) ? row : ((item.row || [])[0] || row);
      placeUnitOnBoard(state, playedBy, target, targetRow, item);
      movedNames.push(item.name || "关联牌");
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

function summonByName(state, playedBy, target, row, name) {
  const player = state.players[playedBy];
  let moved = 0;
  const summoned = [];
  [player.hand, player.deck].forEach(pile => {
    for (let i = pile.length - 1; i >= 0; i--) {
      const item = pile[i];
      if (item.name === name) {
        pile.splice(i, 1);
        const targetRow = (item.row || []).includes(row) ? row : ((item.row || [])[0] || row);
        placeUnitOnBoard(state, playedBy, target, targetRow, item);
        summoned.push({ card: item, row: targetRow });
        moved += 1;
      }
    }
  });
  if (moved) {
    addLog(state, `${player.name}召唤 ${moved} 张「${name}」。`);
    const summary = compactNameCounts(summoned.map(s => s.card.name || name), name);
    const note = `召唤岳家军：${summary || `${name}x${moved}`}`;
    appendLastBattleActionNote(state, note);
  }
}

function isHumanControlled(state, playerIndex) {
  if (state.autoControlAll) return false;
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
  return !!card && !isHeroCard(card) && (card.category === "unit" || card.category === "hero");
}

function reviveCandidates(state, playerIndex) {
  return state.players[playerIndex].discard
    .filter(isReviveCandidate)
    .sort((a, b) => cardValue(b) - cardValue(a));
}

function reviveCardByUid(state, playerIndex, uid, actionOptions = {}) {
  const player = state.players[playerIndex];
  const card = reviveCandidates(state, playerIndex).find(item => item.uid === uid);
  if (!card) return false;
  // 通才等多战线人物被举荐复归时，应像正常出牌一样让玩家选择落点战线
  // 仅人类玩家控制且非随机复归时给出选择。
  if (
    actionOptions.forceAuto !== true &&
    isHumanControlled(state, playerIndex) &&
    !state.randomRestore &&
    needsHumanChoice(state, player, card, null)
  ) {
    state.pending = {
      type: "reviveRow",
      playerIndex,
      cardUid: uid,
      rows: pendingRowsForCard(state, playerIndex, card),
      title: `选择「${cardLabel(card)}」复归战线`
    };
    addLog(state, `请选择「${cardLabel(card)}」复归的战线。`);
    return true;
  }
  player.discard = player.discard.filter(item => item.uid !== uid);
  const target = boardTargetForCard(playerIndex, card);
  const row = rowForCard(state, playerIndex, card) || "疆场";
  placeUnitOnBoard(state, playerIndex, target, row, card);
  addLog(state, `举荐生效：${player.name}复归「${cardLabel(card)}」到${target === playerIndex ? "己方" : "对方"}${ROW_LABELS[row]}。`);
  appendLastBattleActionEffect(state, "济世", cardLabel(card));
  resolveUnitAbility(state, playerIndex, target, row, card, actionOptions);
  return true;
}

// 在确定落点战线后实际执行复归，供 reviveRow 选择流程复用。
function finishReviveAtRow(state, playerIndex, uid, row, actionOptions = {}) {
  const player = state.players[playerIndex];
  const card = player.discard.find(item => item.uid === uid);
  if (!card) return false;
  player.discard = player.discard.filter(item => item.uid !== uid);
  const target = boardTargetForCard(playerIndex, card);
  const chosen = ROWS.includes(row) ? row : (rowForCard(state, playerIndex, card) || "疆场");
  placeUnitOnBoard(state, playerIndex, target, chosen, card);
  addLog(state, `举荐生效：${player.name}复归「${cardLabel(card)}」到${target === playerIndex ? "己方" : "对方"}${ROW_LABELS[chosen]}。`);
  appendLastBattleActionEffect(state, "济世", cardLabel(card));
  resolveUnitAbility(state, playerIndex, target, chosen, card, actionOptions);
  return true;
}

function bestRevivalReplayValue(state, playerIndex) {
  return reviveCandidates(state, playerIndex).reduce((best, card) => Math.max(best, revivalTargetValue(state, playerIndex, card.uid)), 0);
}

function recallRevivalReplayValue(state, playerIndex, card) {
  if (!card || isHeroCard(card) || !hasAbility(card, "济世")) return 0;
  const replayValue = bestRevivalReplayValue(state, playerIndex);
  if (replayValue <= 0) return 0;
  // 边际递减：济世被请辞反复回收时，每次复用的价值依次衰减，避免高估链式刷分
  const reuse = card.revivalReuseCount || 0;
  const decay = reuse === 0 ? 1 : Math.pow(0.6, reuse);
  return (10 + replayValue * 0.6) * decay;
}

// 对手是否持有能摧毁己方“最高战力”非传世人物的威胁（奇策/釜底抽薪或对应主将能力）。
function opponentHighestThreat(state, opponentIndex) {
  const opp = state.players[opponentIndex];
  if (!opp || opp.passed) return false; // 已过牌无法发动点杀
  if (!(opp.hand || []).length) return false; // 无手牌则无实际点杀威胁
  if ((opp.hand || []).some(card => isHighestPowerRemoval(card))) return true;
  const text = leaderText(opp);
  if (!opp.leaderUsed && /摧毁|奇策/i.test(text)) return true;
  return false;
}

// 该卡是否是其所在阵线当前最高战力的非传世人物。
function isHighestNonHeroOnRow(state, playerIndex, card, row) {
  const cards = state.players[playerIndex].board[row] || [];
  const maxEff = cards.filter(c => !isHeroCard(c)).reduce((m, c) => Math.max(m, c.effective || 0), 0);
  return maxEff > 0 && (card.effective || 0) >= maxEff;
}

// 防御性价值：收回即将被对手奇策/釜底抽薪点掉的最高战力非传世人物，
// 等同于保住该卡当前战场战力，避免被白吃。
function recallDefensiveValue(state, playerIndex, card, row) {
  if (isHeroCard(card)) return 0;
  const effective = card.effective || 0;
  if (effective < 8) return 0; // 低战力牌不值得消耗请辞抢救
  if (!isHighestNonHeroOnRow(state, playerIndex, card, row)) return 0;
  if (!opponentHighestThreat(state, otherIndex(playerIndex))) return 0;
  return Math.max(4, effective * 0.8);
}

// 集结（集贤）回收价值：仅当牌库/手牌仍有同名可集结卡时给收益，
// 否则首次打出时已全数召唤上场，收回再打无牌可集结（收益归零）。
function recallRecruitValue(state, playerIndex, card) {
  if (!hasAbility(card, "集贤")) return 0;
  return recruitPowerBonus(state, playerIndex, card);
}

// 请辞目标排序价值：只应对“真实可回收再利用”的目标——
// 济世二次复活、防御性抢救被奇策点掉的最高战力牌、尚有名可集结的集贤。
function recallTargetSortValueOptimized(state, playerIndex, card, row) {
  let value = cardValue(card) + recallRevivalReplayValue(state, playerIndex, card);
  value += recallRecruitValue(state, playerIndex, card);
  if (row) value += recallDefensiveValue(state, playerIndex, card, row);
  return value;
}

function recallTargetSortValue(state, playerIndex, card, row) {
  return recallTargetSortValueOptimized(state, playerIndex, card, row);
}

function recallTargets(state, playerIndex) {
  const player = state.players[playerIndex];
  const targets = [];
  ROWS.forEach(row => {
    player.board[row].forEach(card => {
      if (!isHeroCard(card)) targets.push({ row, card });
    });
  });
  return targets.sort((a, b) => recallTargetSortValue(state, playerIndex, b.card, b.row) - recallTargetSortValue(state, playerIndex, a.card, a.row));
}

function doRecallTarget(state, playerIndex, uid) {
  const player = state.players[playerIndex];
  const entry = recallTargets(state, playerIndex).find(item => item.card.uid === uid);
  if (!entry) return null;
  player.board[entry.row] = player.board[entry.row].filter(card => card.uid !== entry.card.uid);
  const owner = Number.isInteger(entry.card.owner) && state.players[entry.card.owner] ? entry.card.owner : playerIndex;
  const summon = summonTokenOnLeave(state, owner, entry.card);
  entry.card.owner = playerIndex;
  entry.card.controller = playerIndex;
  entry.card.zone = "hand";
  entry.card.boardRow = null;
  entry.card.playedBy = playerIndex;
  if (hasAbility(entry.card, "济世")) entry.card.revivalReuseCount = (entry.card.revivalReuseCount || 0) + 1; // 济世被请辞回收，记录复用次数用于边际递减
  player.hand.push(entry.card);
  addLog(state, `${player.name}收回「${cardLabel(entry.card)}」。`);
  return { card: entry.card, summon };
}

function reviveBest(state, playerIndex) {
  const candidates = reviveCandidates(state, playerIndex);
  if (!candidates.length) return;
  const selected = state.randomRestore ? randomItem(candidates, candidates[0]) : candidates[0];
  reviveCardByUid(state, playerIndex, selected.uid);
}

function collectHighestPowerRemovalTargets(state, playerIndex, row, opponentOnly, minEffective = 10) {
  const targets = [];
  const players = opponentOnly ? [otherIndex(playerIndex)] : [0, 1];
  players.forEach(pi => {
    const rows = row ? [row] : ROWS;
    rows.forEach(r => {
      if (!state.players[pi]?.board?.[r]) return;
      if (row && rowScore(state.players[pi], r) < minEffective) return;
      state.players[pi].board[r].forEach(card => {
        if (!isHeroCard(card) && (row || (card.effective || 0) >= minEffective)) targets.push({ pi, row: r, card });
      });
    });
  });
  return targets;
}

function doHighestPowerRemoval(state, playerIndex, row, opponentOnly, minEffective = 10) {
  recalcScores(state);
  const targets = collectHighestPowerRemovalTargets(state, playerIndex, row, opponentOnly, minEffective);
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
  appendLeaveSummonEffects(state, results.map(item => item.summon));
}

function doRecall(state, playerIndex, targetUid) {
  const targets = recallTargets(state, playerIndex);
  if (!targets.length) return addLog(state, "请辞归隐没有可收回的人物。");
  const selected = targets.find(item => item.card.uid === targetUid) || targets[0];
  const result = doRecallTarget(state, playerIndex, selected.card.uid);
  if (result?.card) appendLastBattleActionEffect(state, "请辞", cardLabel(result.card));
  appendLeaveSummonEffects(state, [result?.summon]);
}

function transformedDormantUnitToken(card, row) {
  const cardRows = card.row || [];
  const isYoung = row === "朝堂" || (cardRows.includes("朝堂") && !cardRows.includes("疆场")) || (card.strength || 0) <= 2;
  return tokenByName(isYoung ? "越相文种" : "越王勾践");
}

function applyTransformedDormantUnit(card, token, row) {
  const isYoung = row === "朝堂" || (card.strength || 0) <= 2;
  const fallback = isYoung
    ? {
      name: "越相文种",
      displayName: "越相文种",
      category: "unit",
      row: ["朝堂"],
      rowDisplayName: ROW_LABELS["朝堂"],
      strength: 8,
      abilities: ["同盟"],
      abilityDisplayNames: ["同盟"],
      abilityText: "蛰伏转化：战力 8；同名越相文种在同一阵线并列时战力倍增。",
    }
    : {
      name: "越王勾践",
      displayName: "越王勾践",
      category: "unit",
      row: ["疆场"],
      rowDisplayName: ROW_LABELS["疆场"],
      strength: 14,
      abilities: ["振势"],
      abilityDisplayNames: ["振势"],
      abilityText: "蛰伏转化：战力 14；为同一阵线其他非传世人物各加 1 点战力。",
    };
  const next = token || fallback;
  card.transformed = true;
  card.transformedFrom = card.transformedFrom || card.name;
  const nextName = next.name || next.displayName || fallback.name;
  card.name = nextName;
  card.displayName = next.displayName || nextName;
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
}

function transformDormantUnits(state, row) {
  let count = 0;
  state.players.forEach(player => {
    player.board[row].forEach(card => {
      if (hasAbility(card, "蛰伏") && !card.transformed) {
        applyTransformedDormantUnit(card, transformedDormantUnitToken(card, row), row);
        count += 1;
      }
    });
  });
  addLog(state, `雪耻触发 ${count} 张蛰伏人物转化。`);
  if (count) appendLastBattleActionEffect(state, "雪耻", `蛰伏x${count}`);
}

function removeFromBoardToDiscard(state, playerIndex, row, uid) {
  const player = state.players[playerIndex];
  const idx = player.board[row].findIndex(card => card.uid === uid);
  if (idx < 0) return null;
  return discardBoardCard(state, playerIndex, player.board[row].splice(idx, 1)[0], row);
}

function normalizeMorale(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.max(0, Math.min(MATCH_MORALE, amount)) : MATCH_MORALE;
}

function applyRoundMorale(morale, winnerIndex) {
  const next = [normalizeMorale(morale?.[0]), normalizeMorale(morale?.[1])];
  if (winnerIndex == null) {
    next[0] -= 1;
    next[1] -= 1;
  } else {
    next[otherIndex(winnerIndex)] -= 1;
  }
  return next.map(value => Math.max(0, value));
}

function moraleFromRoundResults(results) {
  return (Array.isArray(results) ? results : []).reduce((morale, result) => {
    if (Array.isArray(result?.morale) && result.morale.length >= 2) {
      return [normalizeMorale(result.morale[0]), normalizeMorale(result.morale[1])];
    }
    return applyRoundMorale(morale, result?.winner == null ? null : result.winner);
  }, [MATCH_MORALE, MATCH_MORALE]);
}

function moraleLoss(before, after) {
  return [Math.max(0, before[0] - after[0]), Math.max(0, before[1] - after[1])];
}

function matchWinnerByMorale(morale) {
  if (morale[0] === morale[1]) return null;
  return morale[0] > morale[1] ? 0 : 1;
}

function moraleLine(before, after) {
  return `军心 ${before[0]}:${before[1]} → ${after[0]}:${after[1]}`;
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
  const moraleBefore = moraleFromRoundResults(state.roundResults);
  const moraleAfter = applyRoundMorale(moraleBefore, winnerIndex);
  const moraleDelta = moraleLoss(moraleBefore, moraleAfter);
  if (winnerIndex === null) {
    addLog(state, `第 ${state.round} 回合平局：${s0} : ${s1}，双方军心各失 1 点，${moraleLine(moraleBefore, moraleAfter)}。`);
  } else {
    const tieReason = s0 === s1 ? "（平分按阵营被动判定）" : "";
    state.players[winnerIndex].roundsWon += 1;
    addLog(state, `第 ${state.round} 回合结束：${s0} : ${s1}，${state.players[winnerIndex].name}获胜${tieReason}，${state.players[otherIndex(winnerIndex)].name}军心 -1，${moraleLine(moraleBefore, moraleAfter)}。`);
    if (state.players[winnerIndex].faction === "开国群雄") {
      draw(state.players[winnerIndex], 1);
      addLog(state, "开国群雄被动：获胜后抽 1 张牌。");
      markFactionPerkAction(state, winnerIndex, "乘胜追策", "摸 1 张牌");
    }
  }
  markBattleAction(state, {
    type: "roundResult",
    text: winnerIndex === null
      ? `双方放弃本局：平局，比分 ${s0} : ${s1}，双方军心 -1。`
      : `双方放弃本局：${state.players[winnerIndex].name}获胜，比分 ${s0} : ${s1}，${state.players[otherIndex(winnerIndex)].name}军心 -1。`
  });
  state.roundResults.push({ round: state.round, scores: [s0, s1], winner: winnerIndex, morale: moraleAfter, moraleLoss: moraleDelta });
  state.roundTransition = {
    seq: state.lastPlayedSeq || 0,
    round: state.round,
    scores: [s0, s1],
    winner: winnerIndex,
    moraleBefore,
    morale: moraleAfter,
    moraleLoss: moraleDelta,
    matchOver: moraleAfter.some(value => value <= 0) || state.round >= 3,
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
  state.situations = {};
  state.rowHorn = [{ "疆场": false, "朝堂": false, "文脉": false }, { "疆场": false, "朝堂": false, "文脉": false }];
  state.players.forEach(player => {
    player.passed = false;
    player.autoPassed = false;
    player.halfSituationRound = null;
  });
  state.current = transition.winner === null ? 0 : transition.winner;
  if (state.round === 3) applyThirdRoundRevivalPerk(state);
  autoPassEmptyPlayers(state);
  recalcScores(state);
  addLog(state, `第 ${state.round} 回合开始。`);
  settlePassedState(state);
  return true;
}

function tieWinner(state) {
  const n0 = state.players[0].faction === "纵横权谋";
  const n1 = state.players[1].faction === "纵横权谋";
  if (n0 && !n1) return 0;
  if (n1 && !n0) return 1;
  return null;
}

function tokenCard(name, owner) {
  const raw = tokenByName(name);
  if (!raw) return null;
  return cloneCard({ ...raw, id: `token-${name}` }, owner);
}

function retainableMonsterUnits(player) {
  if (player.faction !== "草莽星火") return [];
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
      const row = token.retainedRow || (token.row || [])[0] || "疆场";
      const source = token.retainedSource || "";
      const originName = token.retainedOriginName || "";
      delete token.retainedRow;
      delete token.retainedSource;
      delete token.retainedOriginName;
      token.owner = pi;
      token.controller = pi;
      token.zone = "board";
      token.boardRow = row;
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

function applyThirdRoundRevivalPerk(state) {
  state.players.forEach(player => {
    if (player.faction !== "遗策复兴") return;
    const picks = shuffle(reviveCandidates(state, player.index)).slice(0, 2);
    picks.forEach(card => {
      player.discard = player.discard.filter(item => item.uid !== card.uid);
      const target = boardTargetForCard(player.index, card);
      const row = rowForCard(state, player.index, card) || "疆场";
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
  if (state.suppressRecording || state.historyRecorded) return;
  const p0 = state.players[0];
  const p1 = state.players[1];
  recordMatch({
    time: Date.now(),
    resultText: state.resultText,
    winner: state.winner,
    rounds: [p0.roundsWon, p1.roundsWon],
    morale: moraleFromRoundResults(state.roundResults),
    scores: state.finalScores,
    roundResults: state.roundResults.slice(),
    humanFaction: p0.factionName,
    aiFaction: p1.factionName,
    humanLeader: cardLabel(p0.leader),
    aiLeader: cardLabel(p1.leader),
    humanLeaderId: p0.leader?.id || "",
    aiLeaderId: p1.leader?.id || "",
    humanDeckMode: p0.deckMode || "random",
    aiDeckMode: p1.deckMode || "random",
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
  const morale = moraleFromRoundResults(state.roundResults);
  state.morale = morale;
  if (state.roundResults.length) {
    state.winner = matchWinnerByMorale(morale);
  } else if (p0.roundsWon === p1.roundsWon) {
    state.winner = null;
  } else {
    state.winner = p0.roundsWon > p1.roundsWon ? 0 : 1;
  }
  if (state.winner == null) {
    state.resultText = "平局";
  } else if (state.mode === "online") {
    state.resultText = `${state.players[state.winner].name}获胜`;
  } else {
    state.resultText = state.winner === 0 ? "你赢了" : "系统获胜";
  }
  recordFinishedMatch(state);
  addLog(state, `整局结束：${state.resultText}，${moraleLine([MATCH_MORALE, MATCH_MORALE], morale)}。`);
  return true;
}

function hasActiveHalfSituationLeader(state, player) {
  if (!state || !player || !player.leaderUsed || player.halfSituationRound !== state.round) return false;
  return /half (of )?(their )?strength|lose half|半损|一半战力/i.test(leaderText(player));
}

function recalcScores(state) {
  const envoyDouble = envoyDoubleActive(state); // 朱元璋：双方出使人物战力翻倍
  state.players.forEach((player, pi) => {
    ROWS.forEach(row => {
      const cards = player.board[row];
      const bondCounts = {};
      cards.forEach(card => {
        if (hasAbility(card, "同盟")) bondCounts[card.name] = (bondCounts[card.name] || 0) + 1;
      });
      const moraleCards = cards.filter(card => hasAbility(card, "振势"));
      const hasHorn = state.rowHorn[pi][row] || cards.some(card => hasAbility(card, "鼓舞"));
      cards.forEach(card => {
        let value = card.strength || 0;
        if (!isHeroCard(card) && state.situations[row]) {
          value = hasActiveHalfSituationLeader(state, player) ? Math.ceil(value / 2) : Math.min(value, 1);
        }
        if (!isHeroCard(card) && hasAbility(card, "同盟") && bondCounts[card.name] > 1) value *= bondCounts[card.name];
        if (!isHeroCard(card)) {
          value += moraleCards.filter(item => item.uid !== card.uid).length;
          if (hasHorn) value *= 2;
          if (hasAbility(card, "出使") && envoyDouble) value *= 2;
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

// 惠施主将技能专用：计算机动（通才）单位去往哪条战线能使己方总战力最大化。
// 与 bestRowForCard 不同，这里以「把该卡从当前战线移除后，加入候选战线的己方总战力」
// 作为评判标准（边际收益），避免被当前战线已计入的卡牌自身战力抬高门槛导致该移动却不移动。
function multiRowBestRow(state, playerIndex, card) {
  const player = state.players[playerIndex];
  if (!card.row || card.row.length < 2) return card.row && card.row[0] ? card.row[0] : null;
  const currentRow = card.boardRow;
  if (!ROWS.includes(currentRow)) return card.row[0];
  recalcScores(state);
  const baseTotal = totalScore(player);
  let best = currentRow;
  let bestTotal = baseTotal;
  card.row.forEach(row => {
    if (row === currentRow) return;
    // 临时把卡牌移到候选战线，重算战力，再还原
    player.board[currentRow] = player.board[currentRow].filter(c => c.uid !== card.uid);
    player.board[row].push(card);
    card.boardRow = row;
    recalcScores(state);
    const total = totalScore(player);
    player.board[row] = player.board[row].filter(c => c.uid !== card.uid);
    player.board[currentRow].push(card);
    card.boardRow = currentRow;
    if (total > bestTotal) { bestTotal = total; best = row; }
  });
  recalcScores(state);
  return best;
}

function bestOwnRow(state, playerIndex) {
  return ROWS.slice().sort((a, b) => rowScore(state.players[playerIndex], b) - rowScore(state.players[playerIndex], a))[0];
}

function bestDormantUnitRow(state, playerIndex) {
  const rows = ["疆场", "朝堂"].sort((a, b) => countDormantUnits(state, playerIndex, b) - countDormantUnits(state, playerIndex, a));
  return countDormantUnits(state, playerIndex, rows[0]) > 0 ? rows[0] : null;
}

function countDormantUnits(state, playerIndex, row) {
  return state.players[playerIndex].board[row].filter(card => hasAbility(card, "蛰伏") && !card.transformed).length;
}

function situationDamage(state, playerIndex, row) {
  if (state.situations[row]) return 0;
  return state.players[playerIndex].board[row].reduce((sum, card) => sum + (isHeroCard(card) ? 0 : Math.max(0, (card.strength || 0) - 1)), 0);
}

function bestRecallTarget(state, playerIndex) {
  return recallTargets(state, playerIndex)[0] || null;
}

// 估算召唤类能力带来的额外收益：岳飞「召唤岳家军」会把己方手牌与牌库中所有的
// 「岳家军」部署到疆场，并触发同盟翻倍。把这些将被召唤卡牌的净
// 增量战力计入本次出牌收益，让自动出牌把「岳飞 + 岳家军」当作一个整体来决策
// （即岳飞与岳家军绑定，优先一起打出，而非先零散打出岳家军）。
function playerValuePool(state, playerIndex) {
  const player = state.players[playerIndex];
  if (!player) return [];
  const board = ROWS.flatMap(row => player.board[row] || []);
  return player.hand.concat(player.deck || [], player.discard || [], board, player.retained || []);
}

function relatedRecruitCards(state, playerIndex, card, sources) {
  return sources.filter(item => {
    if (item.uid === card.uid) return false;
    if (card.recruitTarget) return item.name === card.recruitTarget;
    if (card.recruitGroupDisplayName) return item.recruitGroupDisplayName === card.recruitGroupDisplayName;
    return item.name === card.name;
  });
}

function allianceBoostPowerBonus(state, playerIndex, card, row) {
  if (!hasAbility(card, "同盟")) return 0;
  const partners = (state.players[playerIndex].board[row] || []).filter(item => item.name === card.name && hasAbility(item, "同盟"));
  if (!partners.length) return 0;
  const countBefore = partners.length;
  const countAfter = countBefore + 1;
  const partnerStrength = partners.reduce((sum, item) => sum + (item.strength || 0), 0);
  const before = partnerStrength * countBefore;
  const after = (partnerStrength + (card.strength || 0)) * countAfter;
  return Math.max(0, after - before - (card.strength || 0));
}

function recruitPowerBonus(state, playerIndex, card) {
  if (!hasAbility(card, "集贤")) return 0;
  const related = relatedRecruitCards(state, playerIndex, card, state.players[playerIndex].deck || []);
  if (!related.length) return 0;
  return related.reduce((sum, item) => sum + (item.strength || 0), 0) + related.length * 2;
}

function summonPowerBonus(state, playerIndex, card) {
  if (!hasAbility(card, "召唤岳家军")) {
    if (hasAbility(card, "召唤无当飞军")) return 19;
    if (hasAbility(card, "召唤东吴水师")) return 12;
    return 0;
  }
  const player = state.players[playerIndex];
  const existing = (player.board["疆场"] || []).filter(c => c.name === "岳家军");
  const toSummon = [];
  [player.hand, player.deck].forEach(pile => pile.forEach(item => {
    if (item.name === "岳家军" && item.uid !== card.uid) toSummon.push(item);
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
  if (card.category === "situation") {
    if (isSituationClear(card)) {
      const self = ROWS.reduce((sum, row) => sum + (state.situations[row] ? situationDamage(state, playerIndex, row) : 0), 0);
      const opp = ROWS.reduce((sum, row) => sum + (state.situations[row] ? situationDamage(state, otherIndex(playerIndex), row) : 0), 0);
      return self - opp;
    }
    const rows = situationRowsFor(card);
    const oppLoss = rows.reduce((sum, row) => sum + situationDamage(state, otherIndex(playerIndex), row), 0);
    const selfLoss = rows.reduce((sum, row) => sum + situationDamage(state, playerIndex, row), 0);
    return oppLoss - selfLoss;
  }
  if (isHorn(card)) {
    const row = rowForCard(state, playerIndex, card) || bestOwnRow(state, playerIndex) || "疆场";
    return Math.max(3, rowScore(state.players[playerIndex], row));
  }
  if (isHighestPowerRemoval(card)) {
    const opponentOnly = card.category !== "stratagem";
    const minEffective = card.category === "stratagem" ? 0 : 10;
    const highestPowerRemovalRow = card.category === "stratagem" ? null : rowForCard(state, playerIndex, card);
    return highestPowerRemovalGain(state, playerIndex, highestPowerRemovalRow, opponentOnly, minEffective);
  }
  if (isRecall(card)) {
    const target = bestRecallTarget(state, playerIndex);
    if (!target) return -3;
    // 决胜局无法跨回合再回收，降低门槛更积极使用请辞锁定胜势
    const threshold = state.round >= 3 ? 8 : 12;
    return recallTargetSortValue(state, playerIndex, target.card, target.row) >= threshold ? 5 : -1;
  }
  if (isAwakeningStratagem(card)) {
    const row = rowForCard(state, playerIndex, card);
    return row && countDormantUnits(state, playerIndex, row) ? 6 : -2;
  }
  let value = card.strength || 0;
  const row = rowForCard(state, playerIndex, card) || "疆场";
  if (!isHeroCard(card) && state.situations[row]) value = Math.min(value, 1);
  if (!isHeroCard(card) && state.rowHorn[playerIndex][row]) value *= 2;
  if (hasAbility(card, "出使")) value = -(card.strength || 0) + 14;
  if (hasAbility(card, "济世")) value += 6;
  if (hasAbility(card, "集贤")) value += recruitPowerBonus(state, playerIndex, card);
  if (hasAbility(card, "同盟")) value += allianceBoostPowerBonus(state, playerIndex, card, row);
  if (hasAbility(card, "振势")) value += 1;
  if (isHeroCard(card)) value += 1;
  // 召唤类能力：把将被召唤的卡牌战力（含同盟翻倍）计入本次出牌收益，
  // 使岳飞与其岳家军在对战 AI 中被视为一个整体（绑定出牌）。
  value += summonPowerBonus(state, playerIndex, card);
  return value;
}

function highestPowerRemovalGain(state, playerIndex, row, opponentOnly, minEffective = 10) {
  recalcScores(state);
  const targets = collectHighestPowerRemovalTargets(state, playerIndex, row, opponentOnly, minEffective);
  if (!targets.length) return -2;
  const max = Math.max.apply(null, targets.map(item => item.card.effective || 0));
  return targets.filter(item => (item.card.effective || 0) === max).reduce((sum, item) => sum + (item.pi === otherIndex(playerIndex) ? max : -max), 0);
}

function aiConfigFor(player) {
  return AI_DIFFICULTY[player?.difficulty || "normal"] || AI_DIFFICULTY.normal;
}

function aiStep(state) {
  if (state.mode !== "ai" || state.over || state.roundTransition || state.current !== 1 || (state.mulligan && state.mulligan.active)) return;
  return autoStep(state, { playerIndex: 1 });
}

function autoStep(state, options = {}) {
  if (!state || state.over || state.pending || state.roundTransition || (state.mulligan && state.mulligan.active)) return false;
  const playerIndex = Number.isInteger(options.playerIndex) ? options.playerIndex : state.current;
  const player = state.players[playerIndex];
  if (!player || state.current !== playerIndex || player.passed) return false;
  const cfg = options.cfg || aiConfigFor(player);
  if (player.hand.length === 0) return pass(state);
  const decision = aiDecideTurn(state, cfg, playerIndex);
  if (decision.action === "pass") return pass(state);
  if (decision.action === "leader") return useLeader(state, playerIndex, decision);
  if (decision.card) return playCard(state, decision.card.uid, decision.row, decision);
  return false;
}

function aiDecideTurn(state, cfg, playerIndex = 1) {
  return aiDecideTurnDocumentV2(state, cfg, playerIndex);
}

function mustContestRound(state, playerIndex) {
  const morale = moraleFromRoundResults(state.roundResults);
  return morale[playerIndex] <= 1 || state.players[otherIndex(playerIndex)].roundsWon >= 1;
}

function roundSecuredByDiff(state, playerIndex, diff) {
  return diff > 0 || diff === 0 && tieWinner(state) === playerIndex;
}

function scoreToSecureRound(state, playerIndex, diff) {
  if (roundSecuredByDiff(state, playerIndex, diff)) return 0;
  return tieWinner(state) === playerIndex ? -diff : 1 - diff;
}

function cloneAiState(state) {
  const copy = JSON.parse(JSON.stringify(state));
  copy.autoControlAll = true;
  copy.suppressRecording = true;
  return copy;
}

function canUseLeaderAction(state, playerIndex) {
  const player = state.players[playerIndex];
  if (!player || player.passed || player.leaderUsed || !player.leader || state.current !== playerIndex) return false;
  const text = leaderText(player);
  if (/弃置\s*2\s*张手牌/.test(text) && player.hand.length < 2) return false;
  if (/从牌组选择.*时局牌/.test(text) && !player.deck.some(card => card.category === "situation")) return false;
  return true;
}

function executeAiAction(state, playerIndex, action) {
  if (!action || state.current !== playerIndex) return false;
  if (action.action === "pass") return pass(state);
  if (action.action === "leader") return useLeader(state, playerIndex, action);
  const card = state.players[playerIndex].hand.find(item => item.uid === action.card?.uid || item.uid === action.cardUid);
  return !!card && playCard(state, card.uid, action.row, action);
}

function simulateActionStats(state, playerIndex, action) {
  recalcScores(state);
  const beforeMe = totalScore(state.players[playerIndex]);
  const beforeOpp = totalScore(state.players[otherIndex(playerIndex)]);
  const beforeHandDelta = state.players[playerIndex].hand.length - state.players[otherIndex(playerIndex)].hand.length;
  const copy = cloneAiState(state);
  copy.current = playerIndex;
  const ok = executeAiAction(copy, playerIndex, action);
  recalcScores(copy);
  const afterMe = totalScore(copy.players[playerIndex]);
  const afterOpp = totalScore(copy.players[otherIndex(playerIndex)]);
  const afterHandDelta = copy.players[playerIndex].hand.length - copy.players[otherIndex(playerIndex)].hand.length;
  return {
    ok,
    afterMe,
    afterOpp,
    diffAfter: afterMe - afterOpp,
    gain: afterMe - afterOpp - (beforeMe - beforeOpp),
    selfGain: afterMe - beforeMe,
    opponentGain: afterOpp - beforeOpp,
    handDeltaGain: afterHandDelta - beforeHandDelta,
    handDeltaAfter: afterHandDelta,
    state: copy
  };
}

function boardHasEnvoy(player) {
  return ROWS.some(row => (player.board[row] || []).some(card => hasAbility(card, "出使")));
}

function discardHasAbility(player, ability) {
  return (player.discard || []).some(card => hasAbility(card, ability));
}

function futureCardValue(state, playerIndex, card) {
  let value = Math.max(1, cardValue(card, { pool: playerValuePool(state, playerIndex) }));
  if (hasAbility(card, "出使")) value += state.round < 3 ? 12 : -6;
  if (hasAbility(card, "济世")) value += discardHasAbility(state.players[playerIndex], "出使") ? 8 : 2;
  if (isHighestPowerRemoval(card) || card.category === "situation" || isHorn(card)) value += state.round < 3 ? 5 : 1;
  if (isHeroCard(card) && state.round < 3) value += 5;
  if (hasAbility(card, "集贤") || hasAbility(card, "召唤岳家军")) value += state.round < 3 ? 4 : 1;
  return value;
}

function resourceCostForCard(state, playerIndex, card) {
  let cost = futureCardValue(state, playerIndex, card);
  if (hasAbility(card, "出使")) {
    const drawValue = Math.min(2, state.players[playerIndex].deck.length) * 5;
    cost = Math.max(1, (card.strength || 0) - drawValue + (state.round >= 3 ? 10 : 1));
  }
  if (state.round >= 3) cost *= 0.35;
  return cost;
}

function knownFuturePower(state, playerIndex) {
  return state.players[playerIndex].hand.reduce((sum, card) => sum + futureCardValue(state, playerIndex, card), 0);
}

function visibleCounterRisk(state, playerIndex, action, stats) {
  const opponent = state.players[otherIndex(playerIndex)];
  const card = action.card;
  let risk = opponent.passed || opponent.hand.length === 0 ? 0 : Math.min(10, opponent.hand.length * 1.2);
  if (!opponent.leaderUsed) risk += 2;
  if (!card) return risk;
  const row = action.row || rowForCard(state, playerIndex, card);
  if (row && !isHeroCard(card)) {
    const count = (stats.state.players[playerIndex].board[row] || []).filter(item => !isHeroCard(item)).length;
    if (count >= 4 && state.round < 3) risk += 3;
  }
  if ((hasAbility(card, "同盟") || hasAbility(card, "集贤") || isHorn(card)) && state.round < 3 && !opponent.passed) risk += 4;
  return risk;
}

function advancedFutureWeight(state, playerIndex) {
  if (state.round >= 3) return ADVANCED_AI.finalFutureWeight;
  return mustContestRound(state, playerIndex) ? ADVANCED_AI.mustWinFutureWeight : ADVANCED_AI.futureResourceWeight;
}

// 请辞价值按回合缩放：决胜局(第3局)回收关键牌收益更高，首局回合多可后续操作略降。
function recallRoundFactor(state) {
  if (state.round >= 3) return 1.15;
  if (state.round <= 1) return 0.9;
  return 1;
}

// 请辞目标价值：济世二次复活 + 尚有名可集结的集贤 + 防御性抢救被奇策点掉的最高战力牌，
// 并按回合缩放（决胜局更积极）。
function recallTargetValueOptimized(state, playerIndex, uid) {
  const entry = recallTargets(state, playerIndex).find(item => item.card.uid === uid);
  if (!entry) return -30;
  const card = entry.card;
  let value = futureCardValue(state, playerIndex, card) - (card.effective || card.strength || 0);
  if (hasAbility(card, "济世")) value += 14 + recallRevivalReplayValue(state, playerIndex, card);
  if (isHighestPowerRemoval(card) && card.category !== "stratagem") value += 10;
  value += recallRecruitValue(state, playerIndex, card);
  value += recallDefensiveValue(state, playerIndex, card, entry.row);
  return value > 0 ? value * recallRoundFactor(state) : value;
}

function recallTargetValue(state, playerIndex, uid) {
  return recallTargetValueOptimized(state, playerIndex, uid);
}

function revivalTargetValue(state, playerIndex, uid) {
  const card = reviveCandidates(state, playerIndex).find(item => item.uid === uid);
  if (!card) return 0;
  let value = cardValue(card, { pool: playerValuePool(state, playerIndex) });
  if (hasAbility(card, "出使")) value += state.round < 3 ? 32 : 8;
  if (hasAbility(card, "济世")) value += 16;
  if (hasAbility(card, "同盟")) {
    const row = rowForCard(state, playerIndex, card) || "疆场";
    const partners = state.players[playerIndex].board[row].filter(item => item.name === card.name).length;
    value += partners * 8;
  }
  if (isHighestPowerRemoval(card) && card.category !== "stratagem") value += 10;
  return value;
}

function leaderActionValue(state, playerIndex, stats) {
  const player = state.players[playerIndex];
  const text = leaderText(player);
  let value = stats.gain * 1.5;
  if (/抽|弃置\s*2\s*张手牌/.test(text)) value += stats.handDeltaGain * 8;
  if (/clear|清除|拨云/.test(text) && !Object.keys(state.situations).length) value -= 24;
  if (/double|翻倍|horn|鼓舞|号令/.test(text) && stats.selfGain <= 0) value -= 24;
  if (/destroy|highestPowerRemoval|摧毁|奇策/.test(text) && stats.gain < ADVANCED_AI.highestPowerRemovalNetSwingFinal) value -= 16;
  if (/situation|边患|党争|典籍/.test(text) && stats.gain < ADVANCED_AI.situationNetSwing) value -= 14;
  if (/封锁.*主将|取消.*主将/.test(text)) value += state.players[otherIndex(playerIndex)].leaderUsed ? -24 : 8;
  return value;
}

// 出牌打分可调权重：默认完全等于 ADVANCED_AI（旧策略基线不变），
// 仅当 cfg.strategy 提供时覆盖，用于攻略新策略的公平对比实验。
function resolveScoreStrategy(cfg) {
  const s = (cfg && cfg.strategy) || {};
  const num = (v, d) => (typeof v === "number" ? v : d);
  return {
    handDeltaWeight: num(s.handDeltaWeight, ADVANCED_AI.handDeltaWeight),
    finalScoreGainWeight: num(s.finalScoreGainWeight, ADVANCED_AI.finalScoreGainWeight),
    scoreGainWeight: num(s.scoreGainWeight, ADVANCED_AI.scoreGainWeight),
    envoyEarlyBonus: num(s.envoyEarlyBonus, 22),
    envoyLatePenalty: num(s.envoyLatePenalty, -16),
    tempoHoldPenalty: num(s.tempoHoldPenalty, 8),
  };
}

function scoreAiCandidateAdvanced(state, cfg, playerIndex, action) {
  const S = resolveScoreStrategy(cfg);
  const opponent = state.players[otherIndex(playerIndex)];
  const diff = totalScore(state.players[playerIndex]) - totalScore(opponent);
  const mustContest = mustContestRound(state, playerIndex);
  const cost = action.card ? resourceCostForCard(state, playerIndex, action.card) : (action.action === "leader" ? 10 : 0);
  const stats = simulateActionStats(state, playerIndex, action);
  if (!stats.ok) return { ...action, score: ADVANCED_AI.terminalLoss, cost, stats };

  const scoreGainWeight = state.round >= 3 ? S.finalScoreGainWeight : S.scoreGainWeight;
  let score = stats.gain * scoreGainWeight
    - cost * advancedFutureWeight(state, playerIndex)
    + stats.handDeltaGain * S.handDeltaWeight
    + (knownFuturePower(stats.state, playerIndex) - knownFuturePower(state, playerIndex)) * 0.18
    - visibleCounterRisk(state, playerIndex, action, stats);

  if (mustContest && roundSecuredByDiff(state, playerIndex, stats.diffAfter)) score += 24;
  if (action.action === "leader") score += leaderActionValue(state, playerIndex, stats);
  const card = action.card;
  if (card && hasAbility(card, "出使")) score += state.round < 3 ? S.envoyEarlyBonus : S.envoyLatePenalty;
  if (card && isRecall(card)) score += recallTargetValue(state, playerIndex, action.recallTargetUid);
  if (card && hasAbility(card, "济世")) score += revivalTargetValue(state, playerIndex, action.revivalTargetUid);

  const controlGain = card ? estimatePlayGain(state, playerIndex, card) : stats.gain;
  if (card && isHighestPowerRemoval(card)) {
    const threshold = state.round >= 3 || mustContest ? ADVANCED_AI.highestPowerRemovalNetSwingFinal : ADVANCED_AI.highestPowerRemovalNetSwingNormal;
    score += controlGain >= threshold ? 12 + controlGain : -18;
  }
  if (card && card.category === "situation" && !isSituationClear(card)) score += controlGain >= ADVANCED_AI.situationNetSwing ? 10 + controlGain : -14;
  if (card && isSituationClear(card)) score += controlGain >= ADVANCED_AI.situationNetSwing ? 8 : -12;
  if (card && (isHorn(card) || isHeroCard(card) || hasAbility(card, "集贤") || hasAbility(card, "召唤岳家军")) && state.round < 3 && !mustContest && !opponent.passed) score -= S.tempoHoldPenalty;
  if (!mustContest && state.round < 3 && diff < -10 && cost > 12 && stats.diffAfter <= 0) score -= 14;
  if (!mustContest && state.round < 3 && diff > 0 && stats.diffAfter > 18) score -= Math.min(16, stats.diffAfter - 18);

  return { ...action, gain: stats.gain, score, cost, stats };
}

function evaluateAdvancedPass(state, playerIndex, tuning) {
  const player = state.players[playerIndex];
  const opponent = state.players[otherIndex(playerIndex)];
  const diff = totalScore(player) - totalScore(opponent);
  const mustContest = mustContestRound(state, playerIndex);
  if (opponent.passed) return roundSecuredByDiff(state, playerIndex, diff) ? 5000 : (mustContest ? -5000 : 100);
  if (mustContest && !roundSecuredByDiff(state, playerIndex, diff)) return -800;
  if (state.round >= 3) return roundSecuredByDiff(state, playerIndex, diff) ? 80 : -120;

  const T = tuning || resolvePassTuning();
  const handDelta = player.hand.length - opponent.hand.length;
  const opponentCardsToCatch = Math.ceil(Math.max(0, scoreToSecureRound(state, otherIndex(playerIndex), -diff)) / T.expectedCatchPerCard);
  let value = -28 + Math.max(-3, Math.min(3, handDelta)) * 3;
  if (!mustContest && diff >= T.passLeadMin && opponentCardsToCatch >= T.minCardsToCatch) value += 28;
  if (!mustContest && diff >= T.unconditionalPassLead && opponent.hand.length > 0) value += 18;
  if (!mustContest && diff < -16 && handDelta <= 0) value += 26;
  if (!mustContest && player.hand.length <= opponent.hand.length && diff < -20) value += 18;
  return value;
}

function revivalTargetSequences(state, playerIndex, maxDepth = 3) {
  const candidates = reviveCandidates(state, playerIndex);
  const sequences = [];
  function visit(pool, sequence, depth) {
    pool.forEach(card => {
      const next = sequence.concat(card.uid);
      if (hasAbility(card, "济世") && depth < maxDepth) {
        const remaining = pool.filter(item => item.uid !== card.uid);
        if (remaining.length) visit(remaining, next, depth + 1);
        else sequences.push(next);
      } else sequences.push(next);
    });
  }
  visit(candidates, [], 1);
  return sequences.slice(0, ADVANCED_AI.maxActionsPerNode);
}

function leaderActionsDocumentV2(state, playerIndex) {
  if (!canUseLeaderAction(state, playerIndex)) return [];
  const player = state.players[playerIndex];
  const opponent = state.players[otherIndex(playerIndex)];
  const text = leaderText(player);
  if (/弃置\s*2\s*张手牌/.test(text)) {
    const cards = player.hand.slice().sort((a, b) => futureCardValue(state, playerIndex, a) - futureCardValue(state, playerIndex, b));
    const actions = [];
    for (let i = 0; i < cards.length; i++) {
      for (let j = i + 1; j < cards.length; j++) actions.push({ action: "leader", leaderDiscardUids: [cards[i].uid, cards[j].uid] });
    }
    return actions.slice(0, ADVANCED_AI.maxActionsPerNode);
  }
  if (/opponent.*discard|对手.*弃牌/.test(text)) {
    return opponent.discard.filter(card => card.category === "unit" || card.category === "hero")
      .map(card => ({ action: "leader", leaderTargetUid: card.uid }));
  }
  if (/己方.*弃牌堆.*手牌|弃牌堆.*取回.*手牌/.test(text)) {
    return player.discard.filter(card => card.category === "unit" || card.category === "hero")
      .map(card => ({ action: "leader", leaderTargetUid: card.uid }));
  }
  if (/清除|拨云/.test(text)) return Object.keys(state.situations).length ? [{ action: "leader" }] : [];
  if (/双方弃牌堆.*洗回.*牌库/.test(text)) return state.players.some(item => item.discard.length) ? [{ action: "leader" }] : [];
  if (/通才.*更优战线|通才.*移动|移动.*通才/.test(text)) {
    const movable = ROWS.some(row => player.board[row].some(card => hasAbility(card, "通才") && card.row?.length > 1 && multiRowBestRow(state, playerIndex, card) !== card.boardRow));
    return movable ? [{ action: "leader" }] : [];
  }
  if (/封锁.*主将|取消.*主将/.test(text)) return opponent.leaderUsed ? [] : [{ action: "leader" }];
  if (/侦察.*手牌|查看.*手牌/.test(text)) return opponent.hand.length ? [{ action: "leader" }] : [];
  if (/从牌组选择.*时局牌/.test(text)) {
    const deckSituation = uniqueDeckSituationCards(player);
    if (!deckSituation.length) return [];
    let best = null;
    let bestScore = -Infinity;
    deckSituation.forEach(card => {
      const s = estimatePlayGain(state, playerIndex, card);
      if (s > bestScore) { bestScore = s; best = card; }
    });
    if (!best || bestScore <= 0) return [];
    return [{ action: "leader", leaderCardUid: best.uid }];
  }
  if (/从牌组选择.*任意.*时局牌/.test(text)) return ROWS.filter(row => !state.situations[row]).map(row => ({ action: "leader", leaderRow: row }));
  if (/从牌组选择.*(边患四起|党争迷局|典籍散佚)|边患|党争|典籍/.test(text)) {
    const row = rowFromLeaderText(text) || (/边患/.test(text) ? "疆场" : /党争/.test(text) ? "朝堂" : /典籍/.test(text) ? "文脉" : null);
    return row && !state.situations[row] ? [{ action: "leader", leaderRow: row }] : [];
  }
  if (/double|翻倍|horn|鼓舞|号令/.test(text)) {
    const fixed = rowFromLeaderText(text);
    const rows = fixed ? [fixed] : ROWS;
    return rows.filter(row => !state.rowHorn[playerIndex][row] && player.board[row].some(card => !isHeroCard(card)))
      .map(row => ({ action: "leader", leaderRow: row }));
  }
  if (/destroy|highestPowerRemoval|摧毁|奇策/.test(text)) {
    const row = rowFromLeaderText(text);
    recalcScores(state);
    return collectHighestPowerRemovalTargets(state, playerIndex, row, true, 10).length ? [{ action: "leader", leaderRow: row }] : [];
  }
  return [{ action: "leader" }];
}

function cardActionsDocumentV2(state, playerIndex, card) {
  const rows = choiceRowsForCard(state, playerIndex, card);
  const targetRows = rows.length ? rows : [rowForCard(state, playerIndex, card) || null];
  const recalls = isRecall(card) ? recallTargets(state, playerIndex) : [null];
  const revivalSequences = hasAbility(card, "济世") ? revivalTargetSequences(state, playerIndex) : [null];
  if (isRecall(card) && !recalls.length) return [];
  if (hasAbility(card, "济世") && !revivalSequences.length) return [];
  const actions = [];
  targetRows.forEach(row => {
    if (isHorn(card)) {
      const beneficiaries = (state.players[playerIndex].board[row] || []).filter(item => !isHeroCard(item)).length;
      if (!beneficiaries || state.rowHorn[playerIndex][row]) return;
    }
    if (isAwakeningStratagem(card) && countDormantUnits(state, playerIndex, row) === 0) return;
    recalls.forEach(recall => {
      revivalSequences.forEach(sequence => {
        actions.push({
          action: "play",
          card,
          row,
          ...(recall ? { recallTargetUid: recall.card.uid } : {}),
          ...(sequence ? { revivalTargetUids: sequence, revivalTargetUid: sequence[0] } : {})
        });
      });
    });
  });
  return actions;
}

function generateLegalAiActionsDocumentV2(state, playerIndex, options = {}) {
  if (!state || state.over || state.pending || state.roundTransition || state.current !== playerIndex || state.players[playerIndex]?.passed) return [];
  const actions = state.players[playerIndex].hand.flatMap(card => cardActionsDocumentV2(state, playerIndex, card));
  actions.push(...leaderActionsDocumentV2(state, playerIndex));
  if (options.includePass !== false) actions.push({ action: "pass" });
  return actions;
}

function recruitFutureConsumption(state, playerIndex, card) {
  if (!hasAbility(card, "集贤") && !hasAbility(card, "召唤岳家军")) return 0;
  const player = state.players[playerIndex];
  const related = item => {
    if (hasAbility(card, "召唤岳家军")) return item.name === "岳家军";
    if (card.recruitTarget) return item.name === card.recruitTarget;
    if (card.recruitGroupDisplayName) return item.recruitGroupDisplayName === card.recruitGroupDisplayName;
    return item.name === card.name;
  };
  const sources = hasAbility(card, "召唤岳家军") ? player.hand.concat(player.deck) : player.deck;
  return sources
    .filter(item => item.uid !== card.uid && related(item))
    .reduce((sum, item) => sum + futureCardValue(state, playerIndex, item), 0);
}

function visibleFactionThreat(state, playerIndex) {
  const opponent = state.players[otherIndex(playerIndex)];
  let threat = 0;
  if (opponent.faction === "开国群雄") threat += 4;
  if (opponent.faction === "草莽星火") {
    const units = ROWS.flatMap(row => opponent.board[row] || []);
    threat += units.length ? units.reduce((sum, card) => sum + (card.effective || card.strength || 0), 0) / units.length : 0;
  }
  if (opponent.faction === "遗策复兴" && state.round < 3) {
    const values = opponent.discard.filter(isReviveCandidate).map(cardValue).sort((a, b) => b - a).slice(0, 2);
    threat += values.reduce((sum, value) => sum + value, 0) * 0.35;
  }
  return threat;
}

function factionActionAdjustment(state, playerIndex, action) {
  const opponent = state.players[otherIndex(playerIndex)];
  const card = action.card;
  if (!card) return 0;
  let value = 0;
  if (opponent.faction === "草莽星火") {
    if (card.name === "边患四起" || isHighestPowerRemoval(card)) value += 8;
    if (hasAbility(card, "集贤") && state.round < 3) value -= 4;
  }
  if (opponent.faction === "开国群雄") {
    if (card.name === "典籍散佚" || isHighestPowerRemoval(card)) value += 5;
  }
  if (opponent.faction === "遗策复兴" && state.round === 2 && state.players[playerIndex].roundsWon > 0) {
    value += Math.max(0, action.gain || 0) * 0.2;
  }
  return value;
}

// 估算主将技能在本小局能带来的真实净加分（含自我增强与削弱对手），用于乐观可达分差。
// 通过克隆状态真实模拟主将使用并测量场面分摆动，避免旧逻辑直接用 totalScore(player) 造成的虚高。
function estimateLeaderGain(state, playerIndex) {
  if (!canUseLeaderAction(state, playerIndex)) return 0;
  const clone = cloneAiState(state);
  clone.current = playerIndex;
  recalcScores(clone);
  const beforeMe = totalScore(clone.players[playerIndex]);
  const beforeOpp = totalScore(clone.players[otherIndex(playerIndex)]);
  const ok = useLeader(clone, playerIndex, {});
  if (!ok) return 0;
  recalcScores(clone);
  if (clone.over || clone.roundTransition) return 0;
  const afterMe = totalScore(clone.players[playerIndex]);
  const afterOpp = totalScore(clone.players[otherIndex(playerIndex)]);
  const swing = (afterMe - beforeMe) + (beforeOpp - afterOpp);
  // 单次主将使用的净加分上限，防止异常高估
  return Math.max(0, Math.min(swing, 20));
}

function optimisticReachableDiff(state, playerIndex) {
  const player = state.players[playerIndex];
  const diff = totalScore(player) - totalScore(state.players[otherIndex(playerIndex)]);
  const gains = player.hand.map(card => Math.max(0, estimatePlayGain(state, playerIndex, card)));
  const leaderGain = estimateLeaderGain(state, playerIndex);
  return diff + gains.reduce((sum, gain) => sum + gain, 0) + leaderGain;
}

function documentSearchStateKey(state) {
  return JSON.stringify({
    round: state.round,
    current: state.current,
    situation: state.situations,
    horn: state.rowHorn,
    morale: moraleFromRoundResults(state.roundResults),
    players: state.players.map(player => ({
      faction: player.faction,
      hand: player.hand.map(card => card.uid).sort(),
      board: ROWS.map(row => player.board[row].map(card => `${card.uid}:${card.effective || 0}`).sort()),
      discard: player.discard.map(card => card.uid).sort(),
      passed: player.passed,
      leaderUsed: player.leaderUsed,
      retained: (player.retained || []).map(card => card.uid).sort(),
      score: totalScore(player)
    }))
  });
}

function documentWinningResourceScore(state, playerIndex, resourceCost, actions) {
  const player = state.players[playerIndex];
  const opponent = state.players[otherIndex(playerIndex)];
  const diff = totalScore(player) - totalScore(opponent);
  return knownFuturePower(state, playerIndex) - resourceCost - Math.max(0, diff) * 0.15 - actions.length * 0.1;
}

function searchBestWinningSequenceDocumentV2(state, cfg, playerIndex) {
  const queue = [{ state: cloneAiState(state), actions: [], resourceCost: 0 }];
  const visited = new Map();
  let bestPlan = null;
  while (queue.length) {
    const node = queue.shift();
    recalcScores(node.state);
    const player = node.state.players[playerIndex];
    const opponent = node.state.players[otherIndex(playerIndex)];
    const diff = totalScore(player) - totalScore(opponent);
    const secured = roundSecuredByDiff(node.state, playerIndex, diff);
    if (secured) {
      const score = documentWinningResourceScore(node.state, playerIndex, node.resourceCost, node.actions);
      const overkill = Math.max(0, diff);
      if (!bestPlan || score > bestPlan.score || score === bestPlan.score && overkill < bestPlan.overkill) {
        bestPlan = { actions: node.actions.slice(), score, overkill };
      }
    }
    if (node.actions.length >= ADVANCED_AI.knownStateSearchDepth) continue;
    let actions = generateLegalAiActionsDocumentV2(node.state, playerIndex, { includePass: false });
    if (secured) actions = actions.filter(action => action.card && isRecall(action.card));
    const scored = actions
      .map(action => scoreDocumentActionV2(node.state, cfg, playerIndex, action))
      .filter(item => item.stats?.ok)
      .sort((a, b) => a.cost - b.cost || b.score - a.score)
      .slice(0, ADVANCED_AI.maxActionsPerNode);
    scored.forEach(action => {
      const next = action.stats.state;
      const planActions = node.actions.concat(action);
      const nextCost = node.resourceCost + action.cost;
      if (next.roundTransition) {
        if (next.roundTransition.winner === playerIndex) {
          const score = documentWinningResourceScore(next, playerIndex, nextCost, planActions);
          const overkill = Math.max(0, next.roundTransition.scores[playerIndex] - next.roundTransition.scores[otherIndex(playerIndex)]);
          if (!bestPlan || score > bestPlan.score || score === bestPlan.score && overkill < bestPlan.overkill) {
            bestPlan = { actions: planActions, score, overkill };
          }
        }
        return;
      }
      if (next.over || next.current !== playerIndex && !next.players[otherIndex(playerIndex)].passed) return;
      const key = documentSearchStateKey(next);
      if (visited.has(key) && visited.get(key) <= nextCost) return;
      visited.set(key, nextCost);
      // 限制同时存活的搜索状态数，避免 Recall 等导致 visited 剪枝失效时状态指数膨胀撑爆内存
      if (queue.length + 1 > ADVANCED_AI.maxSearchQueue) return;
      queue.push({ state: next, actions: planActions, resourceCost: nextCost });
    });
  }
  return bestPlan;
}

function scoreDocumentActionV2(state, cfg, playerIndex, action) {
  const base = scoreAiCandidateAdvanced(state, cfg, playerIndex, action);
  if (!base.stats?.ok) return base;
  const player = state.players[playerIndex];
  const opponent = state.players[otherIndex(playerIndex)];
  const morale = moraleFromRoundResults(state.roundResults);
  const nextMorale = base.stats.state.roundTransition?.morale || morale;
  const lifeDeltaBefore = morale[playerIndex] - morale[otherIndex(playerIndex)];
  const lifeDeltaAfter = nextMorale[playerIndex] - nextMorale[otherIndex(playerIndex)];
  let score = base.score + (lifeDeltaAfter - lifeDeltaBefore) * 2500;
  score -= visibleFactionThreat(state, playerIndex) * 0.2;
  score += factionActionAdjustment(state, playerIndex, { ...action, gain: base.gain });
  if (action.card) {
    score -= recruitFutureConsumption(state, playerIndex, action.card) * (state.round < 3 ? 0.45 : 0.08);
    if (hasAbility(action.card, "出使")) {
      const actualDraws = Math.min(2, player.deck.length);
      score += actualDraws * 8 - (action.card.strength || 0) * (state.round >= 3 ? 1.3 : 0.35);
    }
    if (Array.isArray(action.revivalTargetUids)) {
      score += action.revivalTargetUids.reduce((sum, uid) => sum + revivalTargetValue(state, playerIndex, uid), 0) * 0.2;
    }
  }
  if (base.stats.state.roundTransition) {
    const winner = base.stats.state.roundTransition.winner;
    if (winner === playerIndex) score += mustContestRound(state, playerIndex) ? ADVANCED_AI.terminalWin : 5000;
    else if (mustContestRound(state, playerIndex)) score += ADVANCED_AI.terminalLoss;
  }
  if (opponent.hand.length > 4 && !opponent.leaderUsed && action.card && (isHorn(action.card) || hasAbility(action.card, "同盟") || hasAbility(action.card, "集贤"))) score -= 6;
  return { ...base, score };
}

function analyzeDocumentTurnV2(state, cfg, playerIndex = 1) {
  recalcScores(state);
  const player = state.players[playerIndex];
  const opponent = state.players[otherIndex(playerIndex)];

  // 卧薪尝胆死牌「开局即打」：轮到自己且对手尚未放弃时，若持有彻底无用的卧薪尝胆，
  // 立即打出清掉废牌（无出使则开局直接打；有出使则等出使打出后再判断）。对手已放弃时
  // 不打，避免放弃本应拿下的这一局。
  const proactiveAwakening = awakeningProactiveDumpDecision(state, playerIndex);
  if (proactiveAwakening) {
    const diff = totalScore(player) - totalScore(opponent);
    return {
      decision: proactiveAwakening,
      forcedRuleApplied: "AWAKENING_DEAD_DUMP_OPENING",
      visibleStateScoreBefore: diff,
      visibleStateScoreAfter: diff,
      immediateNetSwing: 0,
      preservedResourceValue: 0,
      visibleCounterRisk: 0,
      overcommitPenalty: 0,
      alternativeActionsTop3: []
    };
  }

  const candidates = generateLegalAiActionsDocumentV2(state, playerIndex, { includePass: false })
    .map(action => scoreDocumentActionV2(state, cfg, playerIndex, action))
    .filter(action => action.stats?.ok)
    .sort((a, b) => b.score - a.score || b.gain - a.gain);
  const best = candidates[0];
  const mustContest = mustContestRound(state, playerIndex);
  const diff = totalScore(player) - totalScore(opponent);
  let decision = best || { action: "pass" };
  let forcedRuleApplied = "NONE";

  if (opponent.passed) {
    const plan = searchBestWinningSequenceDocumentV2(state, cfg, playerIndex);
    if (plan?.actions?.length) {
      decision = plan.actions[0];
      forcedRuleApplied = "OPPONENT_PASSED_MIN_RESOURCE_PLAN";
    } else if (roundSecuredByDiff(state, playerIndex, diff)) {
      decision = { action: "pass" };
      forcedRuleApplied = "OPPONENT_PASSED_ROUND_SECURED";
    } else if (!mustContest) {
      decision = { action: "pass" };
      forcedRuleApplied = "OPPONENT_PASSED_CONCEDE_ROUND";
    }
  } else if (!mustContest && optimisticReachableDiff(state, playerIndex, resolvePassTuning(cfg)) < 1) {
    decision = { action: "pass" };
    forcedRuleApplied = "MATHEMATICALLY_UNREACHABLE";
  } else if (mustContest) {
    decision = best || { action: "pass" };
    forcedRuleApplied = "MUST_AVOID_MATCH_LOSS";
  } else {
    const victoryDrawPenalty = opponent.faction === "开国群雄" ? 6 : 0;
    const T = resolvePassTuning(cfg);
    const passValue = evaluateAdvancedPass(state, playerIndex, T) - victoryDrawPenalty;
    const opponentCardsToCatch = Math.ceil(Math.max(0, scoreToSecureRound(state, otherIndex(playerIndex), -diff)) / T.expectedCatchPerCard);
    if (state.round < 3 && diff >= T.passLeadMin && opponentCardsToCatch >= T.minCardsToCatch && opponent.hand.length > 0 && (!best || best.cost > T.passCostFloor || diff >= T.unconditionalPassLead)) {
      decision = { action: "pass" };
      forcedRuleApplied = "LEAD_REQUIRES_THREE_CARDS_TO_CATCH";
    } else if (best && passValue >= best.score + 20 && cfg.concede) {
      decision = { action: "pass" };
      forcedRuleApplied = "ROUND_BUDGET_PASS";
    }
  }

  return {
    decision,
    forcedRuleApplied,
    visibleStateScoreBefore: diff,
    visibleStateScoreAfter: decision.stats?.diffAfter ?? diff,
    immediateNetSwing: decision.stats?.gain ?? 0,
    preservedResourceValue: knownFuturePower(decision.stats?.state || state, playerIndex),
    visibleCounterRisk: decision.stats ? visibleCounterRisk(state, playerIndex, decision, decision.stats) : 0,
    overcommitPenalty: decision.card && state.round < 3 ? recruitFutureConsumption(state, playerIndex, decision.card) : 0,
    alternativeActionsTop3: candidates.slice(0, 3).map(action => ({ action: action.action, cardId: action.card?.id || "", score: action.score }))
  };
}

function aiDecideTurnDocumentV2(state, cfg, playerIndex = 1) {
  const analysis = analyzeDocumentTurnV2(state, cfg, playerIndex);
  return { ...analysis.decision, analysis: {
    forcedRuleApplied: analysis.forcedRuleApplied,
    visibleStateScoreBefore: analysis.visibleStateScoreBefore,
    visibleStateScoreAfter: analysis.visibleStateScoreAfter,
    immediateNetSwing: analysis.immediateNetSwing,
    preservedResourceValue: analysis.preservedResourceValue,
    visibleCounterRisk: analysis.visibleCounterRisk,
    overcommitPenalty: analysis.overcommitPenalty,
    alternativeActionsTop3: analysis.alternativeActionsTop3
  } };
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
  if (pending.type === "leaderDiscard") {
    const player = state.players[playerIndex];
    const uid = String(choice.uid || "");
    const selectedUids = Array.isArray(pending.selectedUids) ? pending.selectedUids.slice() : [];
    const isCandidate = pending.candidates.some(card => card.uid === uid)
      && player.hand.some(card => card.uid === uid);
    if (!uid || !isCandidate) return false;
    const selectedIndex = selectedUids.indexOf(uid);
    if (selectedIndex >= 0) {
      selectedUids.splice(selectedIndex, 1);
      state.pending = {
        ...pending,
        selectedUids,
        title: `黄巢：选择第 ${selectedUids.length + 1} 张弃牌`
      };
      return true;
    }
    selectedUids.push(uid);
    if (selectedUids.length < 2) {
      state.pending = {
        ...pending,
        selectedUids,
        title: "黄巢：选择第 2 张弃牌"
      };
      return true;
    }
    const pickedCards = selectedUids.map(selectedUid => player.hand.find(card => card.uid === selectedUid));
    if (pickedCards.some(card => !card)) return false;
    state.pending = null;
    const result = discardTwoDrawOne(state, playerIndex, selectedUids);
    if (!result) return false;
    player.leaderUsed = true;
    const drawResult = result.drawn > 0 ? `，并抽${result.drawn}张牌` : "";
    markLeaderUsed(state, playerIndex, `弃牌：${pickedCards.map(cardLabel).join("、")}${drawResult}`);
    addLog(state, `${player.name}使用主将「${cardLabel(player.leader)}」。`);
    afterPlay(state);
    return true;
  }
  if (pending.type === "leaderSituation") {
    const uid = String(choice.uid || "");
    const player = state.players[playerIndex];
    const isCandidate = pending.candidates.some(card => card.uid === uid);
    const isStillInDeck = player?.deck.some(card => card.uid === uid && card.category === "situation");
    if (!uid || !isCandidate || !isStillInDeck) return false;
    state.pending = null;
    return playLeaderSituationCard(state, playerIndex, uid);
  }
  state.pending = null;
  if (pending.type === "revive") {
    if (!choice.skip && choice.uid) reviveCardByUid(state, playerIndex, choice.uid);
    else addLog(state, `${state.players[playerIndex].name}跳过举荐复归。`);
    if (!state.pending) afterPlay(state);
    return true;
  }
  if (pending.type === "reviveRow") {
    const pi = pending.playerIndex;
    const uid = pending.cardUid;
    state.pending = null;
    if (choice.skip || !pending.rows.includes(choice.row)) {
      // 不指定战线时自动选择最优落点
      reviveCardByUid(state, pi, uid, { forceAuto: true });
    } else {
      finishReviveAtRow(state, pi, uid, choice.row);
    }
    if (!state.pending) afterPlay(state);
    return true;
  }
  if (pending.type === "recall") {
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
    const result = !choice.skip && choice.uid ? doRecallTarget(state, playerIndex, choice.uid) : null;
    if (!result) addLog(state, `${player.name}不收回人物。`);
    card.owner = playerIndex;
    card.controller = playerIndex;
    card.zone = "discard";
    card.boardRow = null;
    player.discard.push(card);
    addLog(state, `${player.name}打出${categoryLabel(card)}「${cardLabel(card)}」。`);
    if (result?.card) appendLastBattleActionEffect(state, "请辞", cardLabel(result.card));
    appendLeaveSummonEffects(state, [result?.summon]);
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
  if (state.pending.type === "leaderDiscard") {
    const player = state.players[state.pending.playerIndex];
    state.pending = null;
    addLog(state, `${player.name}取消了主将「${cardLabel(player.leader)}」的弃牌，请重新出牌。`);
    return true;
  }
  if (state.pending.type === "leaderSituation") {
    const player = state.players[state.pending.playerIndex];
    state.pending = null;
    addLog(state, `${player.name}取消了主将「${cardLabel(player.leader)}」的时局选牌，请重新行动。`);
    return true;
  }
  if (state.pending.type === "recall") return resolvePending(state, { cancel: true });
  return resolvePending(state, { skip: true });
}

function surrender(state, playerIndex = 0, reason = "surrender") {
  if (!state || state.over) return false;
  const disconnected = reason === "disconnect";
  recalcScores(state);
  state.over = true;
  state.pending = null;
  state.roundTransition = null;
  state.endReason = disconnected ? "disconnect" : "surrender";
  state.winner = otherIndex(playerIndex);
  state.morale = moraleFromRoundResults(state.roundResults);
  state.morale[playerIndex] = 0;
  state.resultText = disconnected
    ? (playerIndex === 0 ? "你已掉线" : `${state.players[playerIndex].name}掉线`)
    : (playerIndex === 0 ? "你已认输" : `${state.players[playerIndex].name}认输`);
  state.finalScores = [totalScore(state.players[0]), totalScore(state.players[1])];
  recordFinishedMatch(state);
  addLog(state, disconnected ? `${state.players[playerIndex].name}掉线，本局判负。` : `${state.players[playerIndex].name}选择认输。`);
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
  autoStep,
  aiDecideTurn,
  analyzeAiTurn: analyzeDocumentTurnV2,
  generateLegalAiActions: generateLegalAiActionsDocumentV2,
  searchBestWinningSequenceFromKnownState: searchBestWinningSequenceDocumentV2,
  continueRoundTransition,
  resolvePending,
  cancelPending,
  surrender,
  totalScore,
  rowScore,
  handOwnerIndex,
  hasActiveHalfSituationLeader,
  recalcScores,
  estimatePlayGain,
  cardLabel,
  reviveCandidates
};
