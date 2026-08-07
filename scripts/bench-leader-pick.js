#!/usr/bin/env node

// 主将（leader）强度对比脚本：AI 选哪个主将完全没有评估——排位模式固定 aiLeaderId="random"（纯随机），
// 单机未指定时落到 leadersFor(faction)[0]（取第一个）。本脚本量化同阵营内各主将的真实强度差。
//
// 做法：同阵营镜像，双方都用 hard 自动组牌（确定性，牌组内容逐张相同，只有洗牌顺序不同），
// 唯一变量是主将，交替座位。因此胜率差异只来自主将技能。
//
// 用法：
//   node scripts/bench-leader-pick.js --faction=开国群雄 --matches=300# 全主将 vs leaders[0]
//   node scripts/bench-leader-pick.js --faction=开国群雄 --leader=2 --matches=300 # 指定单个主将
//   node scripts/bench-leader-pick.js --all --matches=200# 5 个阵营全跑

const { spawn } = require("child_process");
const path = require("path");
const battle = require("../shared/core/battle");
const cards = require("../shared/core/cards");
const { buildDeck, leadersFor, FACTION_KEYS } = cards;
const { resolveAutoPending, runPreparedMatch, withSeed } = require("./simulate-ai-matches");

function parseArgs(argv) {
  const args = {
    matches: 100, seed: 20260806, maxSteps: 1200, concurrency: 4,
    faction: FACTION_KEYS[0], leader: null, baseline: 0, child: null, json: false, all: false
  };
  argv.forEach(arg => {
    if (arg === "--json") args.json = true;
    else if (arg === "--all") args.all = true;
    else if (arg.startsWith("--matches=")) args.matches = Math.max(1, Number(arg.slice(10)) || args.matches);
    else if (arg.startsWith("--seed=")) args.seed = Number(arg.slice(7)) || args.seed;
    else if (arg.startsWith("--maxSteps=")) args.maxSteps = Math.max(100, Number(arg.slice(11)) || args.maxSteps);
    else if (arg.startsWith("--concurrency=")) args.concurrency = Math.max(1, Number(arg.slice(14)) || args.concurrency);
    else if (arg.startsWith("--faction=")) args.faction = arg.slice(10);
    else if (arg.startsWith("--leader=")) args.leader = Number(arg.slice(9));
    else if (arg.startsWith("--baseline=")) args.baseline = Number(arg.slice(11)) || 0;
    else if (arg.startsWith("--child=")) args.child = Math.max(0, Number(arg.slice(8)) || 0);
    else if (arg.startsWith("--config=")) {
      try { Object.assign(args, JSON.parse(Buffer.from(arg.slice(9), "base64").toString())); } catch (error) {}
    }
  });
  if (!FACTION_KEYS.includes(args.faction)) throw new Error(`未知阵营 ${args.faction}，可选：${FACTION_KEYS.join(" / ")}`);
  return args;
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

// createMatch 里玩家一固定 difficulty="normal"，这里把双方都拉到 hard 自动组牌；主将不动
function resetHardDeck(player, index) {
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
  player.leaderDisabled = false;
  draw(player, 10);
}

function createInitialState(faction, candidateLeaderId, baselineLeaderId, candidateIndex) {
  const state = battle.createMatch({
    mode: "online",
    humanFaction: faction,
    aiFaction: faction,
    difficulty: "hard",
    humanLeaderIds: { [faction]: candidateIndex === 0 ? candidateLeaderId : baselineLeaderId },
    aiLeaderIds: { [faction]: candidateIndex === 1 ? candidateLeaderId : baselineLeaderId }
  });
  state.mode = "ai";
  state.autoControlAll = true;
  state.suppressRecording = true;
  state.logs = [];
  state.pending = null;
  state.players[0].name = "系统一";
  state.players[1].name = "系统二";
  state.players.forEach(resetHardDeck);
  state.mulligan = { active: true, current: 0, used: [0, 0], done: [false, false], max: 2, simultaneous: true };
  battle.recalcScores(state);
  return state;
}

function runSingleMatch(index, options) {
  const pairSeed = options.seed + Math.floor(index / 2) * 9973;
  const candidateIndex = index % 2 === 0 ? 0 : 1;
  const leaders = leadersFor(options.faction);
  const candidateLeaderId = leaders[options.leader]? leaders[options.leader].id : "";
  const baselineLeaderId = leaders[options.baseline] ? leaders[options.baseline].id : "";
  const state = withSeed(pairSeed, () => createInitialState(options.faction, candidateLeaderId, baselineLeaderId, candidateIndex));
  // 双方换牌都走线上规则
  state.players.forEach((_, pi) => withSeed(pairSeed + 500003 + pi * 104729, () => {
    battle.aiMulliganFor(state, pi);
    if (!state.mulligan.done[pi]) battle.finishMulligan(state, pi);
  }));
  while (state.pending && resolveAutoPending(state)) {}
  const result = runPreparedMatch(pairSeed + 1000003, options.maxSteps, state, [{}, {}]);
  return { winner: result.winner == null ? "draw" : result.winner === candidateIndex ? "candidate" : "baseline" };
}

function exactBinomialTwoSided(wins, losses) {
  const n = wins + losses;
  if (!n) return 1;
  const tail = Math.min(wins, losses);
  let logP = -n * Math.LN2;
  let sum = Math.exp(logP);
  for (let k = 1; k <= tail; k++) {
    logP += Math.log((n - k + 1) / k);
    sum += Math.exp(logP);
  }
  return Math.min(1, sum * 2);
}

function binomialZ(wins, losses) {
  const n = wins + losses;
  if (!n) return 0;
  return (wins - n / 2) / Math.sqrt(n * 0.25);
}

function runPair(options) {
  const scriptPath = path.join(__dirname, "bench-leader-pick.js");
  const childConfig = Buffer.from(JSON.stringify({
    seed: options.seed, maxSteps: options.maxSteps, faction: options.faction,
    leader: options.leader, baseline: options.baseline
  })).toString("base64");
  const summary = { candidateWins: 0, baselineWins: 0, draws: 0 };
  const active = new Set();
  let next = 0, finished = 0, failed = false;
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
      const child = spawn(process.execPath, [scriptPath, `--child=${index}`, `--config=${childConfig}`], { stdio: ["ignore", "pipe", "pipe"] });
      active.add(child);
      let stdout = "", stderr = "";
      child.stdout.on("data", d => { stdout += d; });
      child.stderr.on("data", d => { stderr += d; });
      child.on("error", stop);
      child.on("close", code => {
        active.delete(child);
        if (failed) return;
        if (code !== 0) return stop(new Error(`第 ${index + 1} 场失败：${stderr.trim() || `退出码 ${code}`}`));
        let r;
        try { r = JSON.parse(stdout.trim()); } catch (e) { return stop(new Error(`第 ${index + 1} 场输出无效：${stdout.trim()} ${stderr.trim()}`)); }
        if (r.winner === "candidate") summary.candidateWins += 1;
        else if (r.winner === "baseline") summary.baselineWins += 1;
        else summary.draws += 1;
        finished += 1;
        if (finished === options.matches) {
          const decisive = summary.candidateWins + summary.baselineWins;
          summary.winRate = decisive ? summary.candidateWins / decisive : 0;
          summary.pValue = exactBinomialTwoSided(summary.candidateWins, summary.baselineWins);
          summary.z = binomialZ(summary.candidateWins, summary.baselineWins);
          return resolve(summary);
        }
        launch();
      });
    }
    for (let i = 0; i < Math.min(options.concurrency, options.matches); i++) launch();
  });
}

async function runFaction(options) {
  const leaders = leadersFor(options.faction);
  const baseName = leaders[options.baseline] ? leaders[options.baseline].name : "?";
  console.log(`=== ${options.faction}：各主将 vs 基线「${baseName}」（leaders[${options.baseline}]），每组 ${options.matches} 场，种子 ${options.seed}`);
  const targets = options.leader != null ? [options.leader] : leaders.map((_, i) => i).filter(i => i !== options.baseline);
  for (const index of targets) {
    const summary = await runPair({ ...options, leader: index });
    const label = `${leaders[index].name}`.padEnd(5, "　");
    console.log(`  [${index}] ${label} 胜 ${String(summary.candidateWins).padStart(3)} / 负 ${String(summary.baselineWins).padStart(3)} / 平 ${String(summary.draws).padStart(2)}  胜率 ${(summary.winRate * 100).toFixed(2)}%  z=${summary.z.toFixed(2)}  p=${summary.pValue.toFixed(4)}`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.child != null) {
    process.stdout.write(JSON.stringify(runSingleMatch(options.child, options)));
    return;
  }
  try {
    if (options.all) {
      for (const faction of FACTION_KEYS) await runFaction({ ...options, faction, leader: null });
      return;
    }
    await runFaction(options);
  } catch (error) {
    console.error(`对比中止：${error.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = { runSingleMatch, exactBinomialTwoSided, binomialZ };
