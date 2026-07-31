#!/usr/bin/env node

const { spawn } = require("child_process");
const path = require("path");
const battle = require("../shared/core/battle");
const { FACTION_KEYS, buildDeck, cardValue, hasAbility, isHeroCard } = require("../shared/core/cards");
const { resolveAutoPending, runPreparedMatch, withSeed } = require("./simulate-ai-matches");

function parseArgs(argv) {
  const args = {
    matches: 100,
    seed: 20260731,
    maxSteps: 1200,
    concurrency: 4,
    child: null,
    json: false
  };
  argv.forEach(arg => {
    if (arg === "--json") args.json = true;
    else if (arg.startsWith("--matches=")) args.matches = Math.max(1, Number(arg.slice(10)) || args.matches);
    else if (arg.startsWith("--seed=")) args.seed = Number(arg.slice(7)) || args.seed;
    else if (arg.startsWith("--maxSteps=")) args.maxSteps = Math.max(100, Number(arg.slice(11)) || args.maxSteps);
    else if (arg.startsWith("--concurrency=")) args.concurrency = Math.max(1, Number(arg.slice(14)) || args.concurrency);
    else if (arg.startsWith("--child=")) args.child = Math.max(0, Number(arg.slice(8)) || 0);
    else if (arg.startsWith("--config=")) {
      try { Object.assign(args, JSON.parse(Buffer.from(arg.slice(9), "base64").toString())); } catch (error) {}
    }
  });
  return args;
}

function randomFaction() {
  return FACTION_KEYS[Math.floor(Math.random() * FACTION_KEYS.length)];
}

function draw(player, count) {
  for (let i = 0; i < count; i++) {
    const card = player.deck.shift();
    if (!card) break;
    card.owner = player.index;
    card.controller = player.index;
    card.zone = "hand";
    card.boardRow = null;
    player.hand.push(card);
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

function createInitialState() {
  const state = battle.createMatch({
    mode: "online",
    humanFaction: randomFaction(),
    aiFaction: randomFaction(),
    difficulty: "hard"
  });
  state.mode = "ai";
  state.autoControlAll = true;
  state.suppressRecording = true;
  state.logs = [];
  state.pending = null;
  state.players[0].name = "系统一";
  state.players[1].name = "系统二";
  state.players.forEach(resetHardRandomDeck);
  state.mulligan = { active: true, current: 0, used: [0, 0], done: [false, false], max: 2, simultaneous: true };
  battle.recalcScores(state);
  return state;
}

function thresholdFor(player) {
  return player.difficulty === "hard" ? 11 : player.difficulty === "easy" ? 9 : 10;
}

function eligibleCards(player, cards) {
  const threshold = thresholdFor(player);
  return cards.filter(card => !isHeroCard(card) && cardValue(card) < threshold);
}

function oneWaySummonTarget(card) {
  if (hasAbility(card, "召唤岳家军")) return "岳家军";
  if (hasAbility(card, "集贤") && card.recruitTarget) return card.recruitTarget;
  return "";
}

function recruitKey(card) {
  if (!hasAbility(card, "集贤")) return "";
  if (card.recruitGroupDisplayName) return `group:${card.recruitGroupDisplayName}`;
  return `target:${card.recruitTarget || card.name}`;
}

function prioritySummonedTargets(player) {
  const targets = new Set(player.hand.map(oneWaySummonTarget).filter(Boolean));
  return eligibleCards(player, player.hand.filter(card => targets.has(card.name)));
}

function priorityDuplicateRecruiters(player) {
  const groups = new Map();
  player.hand.forEach(card => {
    const key = recruitKey(card);
    if (!key) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(card);
  });
  const extras = [];
  groups.forEach(cards => {
    if (cards.length < 2) return;
    const ranked = cards.slice().sort((a, b) => cardValue(b) - cardValue(a));
    extras.push(...ranked.slice(1));
  });
  return eligibleCards(player, extras);
}

function lowest(cards) {
  return cards.slice().sort((a, b) => cardValue(a) - cardValue(b))[0] || null;
}

function selectBaselineCard(player) {
  const card = lowest(player.hand);
  if (!card || isHeroCard(card) || cardValue(card) >= thresholdFor(player)) return null;
  return card;
}

function selectCandidateCard(player) {
  const summonedTarget = lowest(prioritySummonedTargets(player));
  if (summonedTarget) return { card: summonedTarget, priority: "p0" };
  const duplicateRecruiter = lowest(priorityDuplicateRecruiters(player));
  if (duplicateRecruiter) return { card: duplicateRecruiter, priority: "p1" };
  const card = selectBaselineCard(player);
  return card ? { card, priority: "base" } : null;
}

function applyMulligan(state, playerIndex, strategy) {
  const player = state.players[playerIndex];
  const stats = { swaps: 0, p0: 0, p1: 0 };
  for (let i = 0; i < state.mulligan.max; i++) {
    const selected = strategy === "candidate"
      ? selectCandidateCard(player)
      : { card: selectBaselineCard(player), priority: "base" };
    if (!selected.card) break;
    if (!battle.mulliganSwap(state, selected.card.uid, playerIndex)) break;
    stats.swaps += 1;
    if (selected.priority === "p0") stats.p0 += 1;
    if (selected.priority === "p1") stats.p1 += 1;
  }
  if (!state.mulligan.done[playerIndex]) battle.finishMulligan(state, playerIndex);
  return stats;
}

function runSingleMatch(index, options) {
  const pairSeed = options.seed + Math.floor(index / 2) * 9973;
  const candidateAsPlayer0 = index % 2 === 0;
  const state = withSeed(pairSeed, createInitialState);
  const strategies = candidateAsPlayer0 ? ["candidate", "baseline"] : ["baseline", "candidate"];
  const stats = strategies.map((strategy, playerIndex) => withSeed(
    pairSeed + 500003 + playerIndex * 104729,
    () => applyMulligan(state, playerIndex, strategy)
  ));
  while (state.pending && resolveAutoPending(state)) {}
  const result = runPreparedMatch(pairSeed + 1000003, options.maxSteps, state);
  const candidateIndex = candidateAsPlayer0 ? 0 : 1;
  return {
    winner: result.winner == null ? "draw" : result.winner === candidateIndex ? "candidate" : "baseline",
    candidateStats: stats[candidateIndex],
    baselineStats: stats[candidateIndex === 0 ? 1 : 0]
  };
}

function exactBinomialTwoSided(wins, losses) {
  const n = wins + losses;
  if (!n) return 1;
  const tail = Math.min(wins, losses);
  let probability = Math.pow(0.5, n);
  let sum = probability;
  for (let k = 1; k <= tail; k++) {
    probability *= (n - k + 1) / k;
    sum += probability;
  }
  return Math.min(1, sum * 2);
}

function addStats(total, item) {
  total.swaps += item.swaps;
  total.p0 += item.p0;
  total.p1 += item.p1;
}

function runAsChild(index, options) {
  process.stdout.write(JSON.stringify(runSingleMatch(index, options)));
}

function runParent(options) {
  const scriptPath = path.join(__dirname, "bench-mulligan-strategy.js");
  const childConfig = Buffer.from(JSON.stringify({ seed: options.seed, maxSteps: options.maxSteps })).toString("base64");
  const summary = {
    matches: options.matches,
    seed: options.seed,
    candidateWins: 0,
    baselineWins: 0,
    draws: 0,
    candidateStats: { swaps: 0, p0: 0, p1: 0 },
    baselineStats: { swaps: 0, p0: 0, p1: 0 }
  };
  const active = new Set();
  let next = 0;
  let finished = 0;
  let failed = false;
  return new Promise((resolve, reject) => {
    function stop(error) {
      if (failed) return;
      failed = true;
      active.forEach(child => child.kill("SIGTERM"));
      reject(error);
    }
    function launch() {
      if (failed || next >= options.matches) return;
      const index = next++;
      const child = spawn(process.execPath, [scriptPath, `--child=${index}`, `--config=${childConfig}`], {
        stdio: ["ignore", "pipe", "pipe"]
      });
      active.add(child);
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", data => { stdout += data; });
      child.stderr.on("data", data => { stderr += data; });
      child.on("error", stop);
      child.on("close", code => {
        active.delete(child);
        if (failed) return;
        if (code !== 0) {
          stop(new Error(`第 ${index + 1} 场失败：${stderr.trim() || `子进程退出码 ${code}`}`));
          return;
        }
        let result;
        try {
          result = JSON.parse(stdout.trim());
        } catch (error) {
          stop(new Error(`第 ${index + 1} 场输出无效：${stdout.trim()} ${stderr.trim()}`));
          return;
        }
        if (result.winner === "candidate") summary.candidateWins += 1;
        else if (result.winner === "baseline") summary.baselineWins += 1;
        else summary.draws += 1;
        addStats(summary.candidateStats, result.candidateStats);
        addStats(summary.baselineStats, result.baselineStats);
        finished += 1;
        if (!options.json) process.stdout.write(`\r进度 ${finished}/${options.matches} 新胜:${summary.candidateWins} 旧胜:${summary.baselineWins} 平:${summary.draws}`);
        if (finished === options.matches) {
          const decisive = summary.candidateWins + summary.baselineWins;
          summary.candidateWinRate = summary.candidateWins / summary.matches;
          summary.candidateDecisiveWinRate = decisive ? summary.candidateWins / decisive : 0;
          summary.pValue = exactBinomialTwoSided(summary.candidateWins, summary.baselineWins);
          summary.significantImprovement = summary.candidateWins > summary.baselineWins && summary.pValue < 0.05;
          resolve(summary);
          return;
        }
        launch();
      });
    }
    for (let i = 0; i < Math.min(options.concurrency, options.matches); i++) launch();
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.child != null) {
    runAsChild(options.child, options);
    return;
  }
  try {
    const summary = await runParent(options);
    if (!options.json) process.stdout.write("\n");
    if (options.json) {
      console.log(JSON.stringify(summary, null, 2));
      return;
    }
    console.log(`换牌策略对比：${summary.matches} 场，随机卡牌 + 困难难度，种子 ${summary.seed}`);
    console.log(`新策略胜：${summary.candidateWins}，旧策略胜：${summary.baselineWins}，平局：${summary.draws}`);
    console.log(`新策略胜率：${(summary.candidateWinRate * 100).toFixed(2)}%，非平局胜率：${(summary.candidateDecisiveWinRate * 100).toFixed(2)}%`);
    console.log(`P0 换牌：${summary.candidateStats.p0}，P1 换牌：${summary.candidateStats.p1}，新/旧总换牌：${summary.candidateStats.swaps}/${summary.baselineStats.swaps}`);
    console.log(`双侧精确二项检验 p=${summary.pValue.toFixed(4)}`);
    console.log(summary.significantImprovement
      ? "结论：新策略达到统计显著提升。"
      : "结论：新策略胜率未达到统计显著标准，可结合设计判断是否采用。");
  } catch (error) {
    console.error(`对比中止：${error.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  selectBaselineCard,
  selectCandidateCard,
  runSingleMatch,
  exactBinomialTwoSided
};
