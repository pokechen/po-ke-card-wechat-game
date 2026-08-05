#!/usr/bin/env node

const battle = require("../shared/core/battle");
const { FACTION_KEYS, buildDeck, cardValue, makeCardValue, hasAbility, isHeroCard, STRATEGY_CARD_BONUS, STRATEGY_CARD_BONUS_BASELINE } = require("../shared/core/cards");

const HARD = { blunder: 0, concede: true, valueNoise: 0, minLeadToStop: 1 };

function parseArgs(argv) {
  const args = { matches: 100, seed: 20260721, maxSteps: 1200, json: false };
  argv.forEach(arg => {
    if (arg === "--json") args.json = true;
    else if (arg.startsWith("--matches=")) args.matches = Math.max(1, Number(arg.slice(10)) || args.matches);
    else if (arg.startsWith("--seed=")) args.seed = Number(arg.slice(7)) || args.seed;
    else if (arg.startsWith("--maxSteps=")) args.maxSteps = Math.max(100, Number(arg.slice(11)) || args.maxSteps);
  });
  return args;
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return function rng() {
    t += 0x6D2B79F5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function withSeed(seed, fn) {
  const originalRandom = Math.random;
  Math.random = mulberry32(seed);
  try {
    return fn();
  } finally {
    Math.random = originalRandom;
  }
}

function randomFaction() {
  return FACTION_KEYS[Math.floor(Math.random() * FACTION_KEYS.length)];
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

// 组牌实验：deckOption支持 { deckProfile: {...}, valueBonus: "tuned"|"baseline"|{...} }
// 不传时完全等于线上 hard 组牌规则。
function resolveDeckBuildOptions(deckOption = {}) {
  const options = {};
  if (deckOption.deckProfile) options.deckProfile = deckOption.deckProfile;
  let base = null;
  if (deckOption.valueBonus === "tuned") base = makeCardValue(STRATEGY_CARD_BONUS);
  else if (deckOption.valueBonus && typeof deckOption.valueBonus === "object") base = makeCardValue({ ...STRATEGY_CARD_BONUS_BASELINE, ...deckOption.valueBonus });
  // revivalBonus：给「非传世济世人物」额外加权。牌组里有非传世济世时请辞才允许带 3 张，
  // 因此提高济世人物入组概率可以解锁「请辞×3 + 济世」的复用组合。
  if (typeof deckOption.revivalBonus === "number") {
    const inner = base || cardValue;
    base = (card, context) => inner(card, context)
    + (!isHeroCard(card) && hasAbility(card, "济世") ? deckOption.revivalBonus : 0);
  }
  if (base) options.valueFn = base;
  return options;
}

function resetHardRandomDeck(player, index, deckOption) {
  player.difficulty = "hard";
  player.deckMode = "random";
  player.deck = buildDeck(index, { faction: player.faction, difficulty: "hard", ...resolveDeckBuildOptions(deckOption) });
  player.battleCardIds = player.deck.map(card => card.id);
  player.hand = [];
  player.board = { "疆场": [], "朝堂": [], "文脉": [] };
  player.discard = [];
  player.passed = false;
  player.autoPassed = false;
  player.roundsWon = 0;
  player.retained = [];
  player.leaderUsed = false;
  player.leaderDisabled = false;
  draw(player, 10);
}

function resolveAutoPending(state) {
  const pending = state.pending;
  if (!pending) return true;
  if (pending.type === "firstPlayer") return battle.resolvePending(state, { playerIndex: pending.playerIndex === 0 ? 1 : 0 });
  if (pending.type === "row") return battle.resolvePending(state, { row: pending.rows && pending.rows[0] });
  if (pending.type === "reviveRow") return battle.resolvePending(state, { row: pending.rows && pending.rows[0] });
  if (pending.type === "revive") {
    const best = (pending.candidates || []).slice().sort((a, b) => cardValue(b) - cardValue(a))[0];
    return battle.resolvePending(state, best ? { uid: best.uid } : { skip: true });
  }
  if (pending.type === "recall") {
    const best = (pending.candidates || []).slice().sort((a, b) => cardValue(b.card) - cardValue(a.card))[0];
    return battle.resolvePending(state, best ? { uid: best.card.uid } : { skip: true });
  }
  if (pending.type === "leaderDiscard") {
    const firstTwo = (pending.candidates || []).slice().sort((a, b) => cardValue(a) - cardValue(b)).slice(0, 2);
    firstTwo.forEach(card => battle.resolvePending(state, { uid: card.uid }));
    return !state.pending;
  }
  return battle.cancelPending(state);
}

function createMatch(options = {}) {
  const state = battle.createMatch({ mode: "ai", humanFaction: randomFaction(), aiFaction: randomFaction(), difficulty: "hard" });
  state.autoControlAll = true;
  state.suppressRecording = true;
  state.logs = [];
  state.players[0].name = "系统一";
  state.players[1].name = "系统二";
  const deckOptions = options.deckOptions || [{}, {}];
  state.players.forEach((player, index) => resetHardRandomDeck(player, index, deckOptions[index]));
  battle.recalcScores(state);
  // withMulligan：保留换牌阶段，让 runPreparedMatch 按各自策略执行真实 AI 换牌
  if (options.withMulligan) {
    state.mulligan = { active: true, current: 0, used: [0, 0], done: [false, false], max: 2, simultaneous: true };
    return state;
  }
  battle.finishMulligan(state, 0);
  while (state.pending && resolveAutoPending(state)) {}
  return state;
}

function cloneState(state) {
  return JSON.parse(JSON.stringify(state));
}

function runPreparedMatch(seed, maxSteps = 1200, initialState, playerConfigs = [{}, {}]) {
  return withSeed(seed, () => {
    const state = cloneState(initialState);
    state.autoControlAll = true;
    state.suppressRecording = true;
    state.logs = [];
    // 换牌阶段：双方都走线上换牌规则（换牌估值不支持按座位分化，实验结论见 battle.js 注释）
    if (state.mulligan && state.mulligan.active) {
      state.players.forEach((_, index) => battle.aiMulliganFor(state, index));
      battle.finishMulligan(state, 0);
      battle.finishMulligan(state, 1);
      while (state.pending && resolveAutoPending(state)) {}
    }
    let steps = 0;
    while (!state.over && steps < maxSteps) {
      steps += 1;
      if (state.roundTransition) {
        battle.continueRoundTransition(state);
        continue;
      }
      if (state.pending) {
        if (!resolveAutoPending(state)) throw new Error(`无法自动处理 pending: ${state.pending.type}`);
        continue;
      }
      const playerConfig = playerConfigs[state.current] || {};
      const ok = battle.autoStep(state, { playerIndex: state.current, cfg: { ...HARD, ...playerConfig } });
      if (!ok) throw new Error(`自动出牌失败：seed=${seed} current=${state.current}`);
    }
    if (!state.over) {
      const snapshot = {
        pending: state.pending,
        current: state.current,
        hands: state.players.map(player => player.hand.length),
        passed: state.players.map(player => player.passed),
        round: state.round,
        lastPlayed: state.lastPlayed
      };
      throw new Error(`超过最大步数 ${maxSteps}：seed=${seed} state=${JSON.stringify(snapshot)}`);
    }
    return {
      seed,
      winner: state.winner,
      draw: state.winner == null,
      steps,
      factions: state.players.map(player => player.faction),
      finalScores: state.finalScores
    };
  });
}

function createSeededInitialState(seed, options = {}) {
  return withSeed(seed, () => createMatch(options));
}

function runMatch(seed, maxSteps = 1200, playerConfigs = [{}, {}]) {
  const initialState = createSeededInitialState(seed);
  return runPreparedMatch(seed + 1000003, maxSteps, initialState, playerConfigs);
}

function runSuite(options) {
  const results = [];
  let player0Wins = 0;
  let player1Wins = 0;
  let draws = 0;
  for (let i = 0; i < options.matches; i++) {
    const result = runMatch(options.seed + i * 9973, options.maxSteps);
    results.push(result);
    if (result.winner === 0) player0Wins += 1;
    else if (result.winner === 1) player1Wins += 1;
    else draws += 1;
  }
  return { matches: options.matches, seed: options.seed, player0Wins, player1Wins, draws, results };
}

function runConfigComparison(options) {
  const results = [];
  let baselineWins = 0;
  let candidateWins = 0;
  let draws = 0;
  for (let i = 0; i < options.matches; i++) {
    const pairSeed = options.seed + Math.floor(i / 2) * 9973;
    const candidateAsPlayer0 = i % 2 === 0;
    const configs = candidateAsPlayer0
      ? [options.candidateConfig || {}, options.baselineConfig || {}]
      : [options.baselineConfig || {}, options.candidateConfig || {}];
    // 组牌配置按座位分配：同一 pairSeed 下双方阵营相同，交替座位保证公平
    const deckOptions = configs.map(config => (config && config.deck) || {});
    const initialState = createSeededInitialState(pairSeed, { withMulligan: !!options.withMulligan, deckOptions });
    const result = runPreparedMatch(pairSeed + 1000003, options.maxSteps || 1200, initialState, configs);
    const candidateWon = result.winner != null && result.winner === (candidateAsPlayer0 ? 0 : 1);
    // 记录座位归属，便于按阵营/子集做归因统计（例如某项改动只影响部分阵营时剥离稀释效应）
    results.push({ ...result, candidateAsPlayer0, candidateWon, candidateFaction: result.factions[candidateAsPlayer0 ? 0 : 1], baselineFaction: result.factions[candidateAsPlayer0 ? 1 : 0] });
    if (result.winner == null) {
      draws += 1;
    } else if (candidateWon) {
      candidateWins += 1;
    } else {
      baselineWins += 1;
    }
  }
  const decisive = Math.max(1, candidateWins + baselineWins);
  return {
    matches: options.matches,
    seed: options.seed,
    baselineWins,
    candidateWins,
    draws,
    candidateWinRate: candidateWins / options.matches,
    candidateDecisiveWinRate: candidateWins / decisive,
    results
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const summary = runSuite(options);
  if (options.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  console.log(`系统自动出牌模拟：${summary.matches} 场，随机卡牌 + 困难难度，种子 ${summary.seed}`);
  console.log(`系统一胜：${summary.player0Wins}，系统二胜：${summary.player1Wins}，平局：${summary.draws}`);
}

if (require.main === module) main();

module.exports = {
  runSuite,
  runMatch,
  runConfigComparison,
  runPreparedMatch,
  createMatch,
  resolveAutoPending,
  withSeed,
  mulberry32
};
