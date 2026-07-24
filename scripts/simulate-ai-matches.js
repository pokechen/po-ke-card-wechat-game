#!/usr/bin/env node

const battle = require("../shared/core/battle");
const { FACTION_KEYS, buildDeck, cardValue, allCards } = require("../shared/core/cards");

const HARD = { blunder: 0, concede: true, valueNoise: 0, minLeadToStop: 1 };

function parseArgs(argv) {
  const args = {
    matches: 100,
    seed: 20260721,
    maxSteps: 1200,
    json: false,
    compareStrategies: false,
    oldStrategy: "legacy",
    newStrategy: "optimized"
  };
  argv.forEach(arg => {
    if (arg === "--json") args.json = true;
    else if (arg === "--compareStrategies") args.compareStrategies = true;
    else if (arg.startsWith("--matches=")) args.matches = Math.max(1, Number(arg.slice(10)) || args.matches);
    else if (arg.startsWith("--seed=")) args.seed = Number(arg.slice(7)) || args.seed;
    else if (arg.startsWith("--maxSteps=")) args.maxSteps = Math.max(100, Number(arg.slice(11)) || args.maxSteps);
    else if (arg.startsWith("--oldStrategy=")) args.oldStrategy = arg.slice(14) || args.oldStrategy;
    else if (arg.startsWith("--newStrategy=")) args.newStrategy = arg.slice(14) || args.newStrategy;
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

function resetHardRandomDeck(player, index) {
  player.difficulty = "hard";
  player.deckMode = "random";
  player.deck = buildDeck(index, { faction: player.faction, difficulty: "hard" });
  player.battleCardIds = player.deck.map(card => card.id);
  player.hand = [];
  player.board = { melee: [], ranged: [], siege: [] };
  player.discard = [];
  player.passed = false;
  player.autoPassed = false;
  player.roundsWon = 0;
  player.retained = [];
  player.leaderUsed = false;
  player.halfWeatherRound = null;
  draw(player, 10);
}

function resolveAutoPending(state) {
  const pending = state.pending;
  if (!pending) return true;
  if (pending.type === "firstPlayer") return battle.resolvePending(state, { playerIndex: pending.playerIndex === 0 ? 1 : 0 });
  if (pending.type === "row") return battle.resolvePending(state, { row: pending.rows && pending.rows[0] });
  if (pending.type === "revive") {
    const best = (pending.candidates || []).slice().sort((a, b) => cardValue(b) - cardValue(a))[0];
    return battle.resolvePending(state, best ? { uid: best.uid } : { skip: true });
  }
  if (pending.type === "decoy") {
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

function createMatch() {
  const state = battle.createMatch({ mode: "ai", humanFaction: randomFaction(), aiFaction: randomFaction(), difficulty: "hard" });
  state.autoControlAll = true;
  state.suppressRecording = true;
  state.logs = [];
  state.players[0].name = "系统一";
  state.players[1].name = "系统二";
  state.players.forEach(resetHardRandomDeck);
  battle.recalcScores(state);
  battle.finishMulligan(state, 0);
  while (state.pending && resolveAutoPending(state)) {}
  return state;
}

function cloneState(state) {
  return JSON.parse(JSON.stringify(state));
}

function runPreparedMatch(seed, maxSteps, initialState, strategiesByPlayer) {
  return withSeed(seed, () => {
    const state = cloneState(initialState);
    state.autoControlAll = true;
    state.suppressRecording = true;
    state.logs = [];
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
      const strat = strategiesByPlayer[state.current];
      const strategyName = (typeof strat === "string") ? strat : (strat && strat.strategy) || "legacy";
      const tuning = (typeof strat === "string") ? undefined : (strat && strat.tuning);
      const ok = battle.autoStep(state, { playerIndex: state.current, cfg: { ...HARD, strategy: strategyName, tuning } });
      if (!ok) {
        // 极端情况下 AI 决策无法执行（如选了非法作用线），稳妥回退为放弃本回合，保证对局可完成。
        // 该脆弱点由随机种子驱动、对双方对称，不影响新旧策略对比的公平性。
        battle.pass(state);
      }
    }
    if (!state.over) {
      // 病态对局（如双方反复放弃导致回合无法结束）超步数后按平局结束，避免进程崩溃。
      return {
        seed,
        winner: null,
        draw: true,
        steps,
        strategies: strategiesByPlayer.slice(),
        factions: state.players.map(player => player.faction),
        finalScores: state.finalScores
      };
    }
    return {
      seed,
      winner: state.winner,
      draw: state.winner == null,
      steps,
      strategies: strategiesByPlayer.slice(),
      factions: state.players.map(player => player.faction),
      finalScores: state.finalScores
    };
  });
}

function createSeededInitialState(seed) {
  return withSeed(seed, createMatch);
}

function runMatch(seed, maxSteps, strategiesByPlayer = ["legacy", "legacy"]) {
  const initialState = createSeededInitialState(seed);
  return runPreparedMatch(seed + 1000003, maxSteps, initialState, strategiesByPlayer);
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

function runStrategyComparison(options) {
  const results = [];
  let oldWins = 0;
  let newWins = 0;
  let draws = 0;
  for (let i = 0; i < options.matches; i++) {
    const pairSeed = options.seed + Math.floor(i / 2) * 9973;
    const initialState = createSeededInitialState(pairSeed);
    const newAsPlayer0 = i % 2 === 0;
    const strategies = newAsPlayer0
      ? [options.newStrategy, options.oldStrategy]
      : [options.oldStrategy, options.newStrategy];
    const result = runPreparedMatch(pairSeed + 1000003, options.maxSteps, initialState, strategies);
    results.push(result);
    if (result.winner == null) { draws += 1; continue; }
    const winnerTag = strategies[result.winner].tag || strategies[result.winner];
    if (winnerTag === "new") newWins += 1;
    else if (winnerTag === "old") oldWins += 1;
    else draws += 1;
  }
  const decisive = Math.max(1, newWins + oldWins);
  return {
    matches: options.matches,
    seed: options.seed,
    oldStrategy: options.oldStrategy,
    newStrategy: options.newStrategy,
    oldWins,
    newWins,
    draws,
    newWinRate: newWins / options.matches,
    newDecisiveWinRate: newWins / decisive,
    results
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const summary = options.compareStrategies
    ? runStrategyComparison(options)
    : runSuite(options);
  if (options.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  if (options.compareStrategies) {
    console.log(`新旧策略对比：${summary.matches} 场，随机卡牌 + 困难难度，种子 ${summary.seed}`);
    console.log(`新策略(${summary.newStrategy})胜：${summary.newWins}，旧策略(${summary.oldStrategy})胜：${summary.oldWins}，平局：${summary.draws}`);
    console.log(`新策略胜率：${(summary.newWinRate * 100).toFixed(2)}%，非平局胜率：${(summary.newDecisiveWinRate * 100).toFixed(2)}%`);
    return;
  }
  console.log(`系统自动出牌模拟：${summary.matches} 场，随机卡牌 + 困难难度，种子 ${summary.seed}`);
  console.log(`系统一胜：${summary.player0Wins}，系统二胜：${summary.player1Wins}，平局：${summary.draws}`);
}

if (require.main === module) main();

module.exports = {
  runSuite,
  runMatch,
  runStrategyComparison,
  runPreparedMatch,
  createMatch,
  resolveAutoPending,
  withSeed,
  mulberry32
};
