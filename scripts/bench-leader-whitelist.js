#!/usr/bin/env node

// 验证 hard 白名单随机主将 vs 全量随机主将的胜率差。
//
// 做法：同阵营镜像（剥离阵营强度差），双方都用 hard 自动组牌（内容逐张相同），
// 候选方主将从 hardLeaderPool 白名单里随机抽，基线方从该阵营全部主将里随机抽，交替座位。
// 主将 id 显式传入 createMatch，因此不依赖 resolveLeaderId 的随机分支，落地前后都能跑。
//
// 用法：
//   node scripts/bench-leader-whitelist.js --matches=300 --seed=20260806
//   node scripts/bench-leader-whitelist.js --matches=300 --scope=草莽星火# 限定单阵营
//   node scripts/bench-leader-whitelist.js --matches=300 --aa# A/A 校验（双方都全量随机）

const { spawn } = require("child_process");
const path = require("path");
const battle = require("../shared/core/battle");
const cards = require("../shared/core/cards");
const { buildDeck, leadersFor, hardLeaderPool, FACTION_KEYS } = cards;
const { resolveAutoPending, runPreparedMatch, withSeed } = require("./simulate-ai-matches");

function parseArgs(argv) {
  const args = { matches: 100, seed: 20260806, maxSteps: 1200, concurrency: 8, scope: "", child: null, json: false, aa: false };
  argv.forEach(arg => {
    if (arg === "--json") args.json = true;
    else if (arg === "--aa") args.aa = true;
    else if (arg.startsWith("--matches=")) args.matches = Math.max(1, Number(arg.slice(10)) || args.matches);
    else if (arg.startsWith("--seed=")) args.seed = Number(arg.slice(7)) || args.seed;
    else if (arg.startsWith("--maxSteps=")) args.maxSteps = Math.max(100, Number(arg.slice(11)) || args.maxSteps);
    else if (arg.startsWith("--concurrency=")) args.concurrency = Math.max(1, Number(arg.slice(14)) || args.concurrency);
    else if (arg.startsWith("--scope=")) args.scope = arg.slice(8);
    else if (arg.startsWith("--child=")) args.child = Math.max(0, Number(arg.slice(8)) || 0);
    else if (arg.startsWith("--config=")) {
      try { Object.assign(args, JSON.parse(Buffer.from(arg.slice(9), "base64").toString())); } catch (error) {}
    }
  });
  if (args.scope && !FACTION_KEYS.includes(args.scope)) throw new Error(`未知阵营 ${args.scope}`);
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

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function runSingleMatch(index, options) {
  const pairSeed = options.seed + Math.floor(index / 2) * 9973;
  const candidateIndex = index % 2 === 0 ? 0 : 1;
  let picked = null;
  const state = withSeed(pairSeed, () => {
    const faction = options.scope || pick(FACTION_KEYS);
    const candidateLeader = pick(options.aa ? leadersFor(faction) : hardLeaderPool(faction));
    const baselineLeader = pick(leadersFor(faction));
    picked = { faction, candidate: candidateLeader.name, baseline: baselineLeader.name };
    const s = battle.createMatch({
      mode: "online",
      humanFaction: faction,
      aiFaction: faction,
      difficulty: "hard",
      humanLeaderIds: { [faction]: candidateIndex === 0 ? candidateLeader.id : baselineLeader.id },
      aiLeaderIds: { [faction]: candidateIndex === 1 ? candidateLeader.id : baselineLeader.id }
    });
    s.mode = "ai";
    s.autoControlAll = true;
    s.suppressRecording = true;
    s.logs = [];
    s.pending = null;
    s.players[0].name = "系统一";
    s.players[1].name = "系统二";
    s.players.forEach(resetHardDeck);
    s.mulligan = { active: true, current: 0, used: [0, 0], done: [false, false], max: 2, simultaneous: true };
    battle.recalcScores(s);
    return s;
  });
  state.players.forEach((_, pi) => withSeed(pairSeed + 500003 + pi * 104729, () => {
    battle.aiMulliganFor(state, pi);
    if (!state.mulligan.done[pi]) battle.finishMulligan(state, pi);
  }));
  while (state.pending && resolveAutoPending(state)) {}
  const result = runPreparedMatch(pairSeed + 1000003, options.maxSteps, state, [{}, {}]);
  return {
    faction: picked.faction,
    same: picked.candidate === picked.baseline,
    winner: result.winner == null ? "draw" : result.winner === candidateIndex ? "candidate" : "baseline"
  };
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

function runParent(options) {
  const scriptPath = path.join(__dirname, "bench-leader-whitelist.js");
  const childConfig = Buffer.from(JSON.stringify({ seed: options.seed, maxSteps: options.maxSteps, scope: options.scope, aa: options.aa })).toString("base64");
  const summary = { candidateWins: 0, baselineWins: 0, draws: 0, sameLeader: 0, byFaction: {} };
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
        const bucket = summary.byFaction[r.faction] || (summary.byFaction[r.faction] = { candidate: 0, baseline: 0, draw: 0 });
        bucket[r.winner === "candidate" ? "candidate" : r.winner === "baseline" ? "baseline" : "draw"] += 1;
        if (r.winner === "candidate") summary.candidateWins += 1;
        else if (r.winner === "baseline") summary.baselineWins += 1;
        else summary.draws += 1;
        if (r.same) summary.sameLeader += 1;
        finished += 1;
        if (!options.json) process.stdout.write(`\r进度 ${finished}/${options.matches} 新:${summary.candidateWins} 旧:${summary.baselineWins} 平:${summary.draws}`);
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

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.child != null) {
    process.stdout.write(JSON.stringify(runSingleMatch(options.child, options)));
    return;
  }
  try {
    const s = await runParent(options);
    if (!options.json) process.stdout.write("\n");
    if (options.json) return console.log(JSON.stringify(s, null, 2));
    console.log(`${options.aa ? "A/A 校验（双方均全量随机）" : "hard 白名单随机vs 全量随机"}，阵营 ${options.scope || "全随机"}，${options.matches} 场，种子 ${options.seed}`);
    console.log(`新胜 ${s.candidateWins}，旧胜 ${s.baselineWins}，平 ${s.draws}，其中双方抽到同一主将 ${s.sameLeader} 场（该部分天然 50%，会稀释差异）`);
    console.log(`剔除平局胜率 ${(s.winRate * 100).toFixed(2)}%  z=${s.z.toFixed(2)}  p=${s.pValue.toFixed(4)}`);
    Object.keys(s.byFaction).forEach(faction => {
      const b = s.byFaction[faction];
      const d = b.candidate + b.baseline;
      console.log(`  ${faction}：新 ${b.candidate} / 旧 ${b.baseline} / 平 ${b.draw}  胜率 ${d ? (b.candidate / d * 100).toFixed(2) : "0.00"}%`);
    });
  } catch (error) {
    console.error(`对比中止：${error.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = { runSingleMatch, exactBinomialTwoSided, binomialZ };
