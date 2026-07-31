#!/usr/bin/env node

const battle = require("../shared/core/battle");
const { FACTION_KEYS, buildDeck, cardValue } = require("../shared/core/cards");

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

function resetHardRandomDeck(player, index) {
  player.difficulty = "hard";
  player.deckMode = "random";
  player.deck = buildDeck(index, { faction: player.faction, difficulty: "hard" });
  player.battleCardIds = player.deck.map(card => card.id);
  player.hand = [];
  player.board = { "疆场": [], "朝堂": [], "文脉": [] };
  player.discard = [];
  player.passed = false;
  player.autoPassed = false;
  player.roundsWon = 0;
  player.retained = [];
  player.leaderUsed = false;
  player.halfSituationRound = null;
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

function runPreparedMatch(seed, maxSteps = 1200, initialState, playerConfigs = [{}, {}]) {
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

function createSeededInitialState(seed) {
  return withSeed(seed, createMatch);
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
    const initialState = createSeededInitialState(pairSeed);
    const candidateAsPlayer0 = i % 2 === 0;
    const configs = candidateAsPlayer0
      ? [options.candidateConfig || {}, options.baselineConfig || {}]
      : [options.baselineConfig || {}, options.candidateConfig || {}];
    const result = runPreparedMatch(pairSeed + 1000003, options.maxSteps || 1200, initialState, configs);
    results.push(result);
    if (result.winner == null) {
      draws += 1;
    } else if (result.winner === (candidateAsPlayer0 ? 0 : 1)) {
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
