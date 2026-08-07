#!/usr/bin/env node

// 验证百家争鸣被动「先声夺人」（第一小局开始前选择谁先出牌）的 AI 选择是否最优。
//
// 现状：aiFirstPlayerChoice（battle.js:404-406）硬编码 return otherIndex(chooserIndex)，
// 即永远让对手先出，零评估；脚本里的 resolveAutoPending 对 firstPlayer 也是同样的固定选择。
//
// 做法：百家争鸣 vs 随机的其他阵营（同阵营时被动会被 initiativeChooserIndex 判为 null 而失效，
// 所以不能做镜像），双方 hard 自动组牌 + hard 白名单随机主将，交替座位。
// 同一配对下只改百家一侧的先后手选择：候选=自己先出，基线=让对手先出（线上现状）。
//
// 用法：
//   node scripts/bench-first-player.js --matches=300 --seed=20260806
//   node scripts/bench-first-player.js --matches=300 --aa   # A/A 校验（双方都用线上选择）

const { spawn } = require("child_process");
const path = require("path");
const battle = require("../shared/core/battle");
const cards = require("../shared/core/cards");
const { buildDeck, hardLeaderPool, FACTION_KEYS } = cards;
const { resolveAutoPending, runPreparedMatch, withSeed } = require("./simulate-ai-matches");

const SELF = "百家争鸣";

function parseArgs(argv) {
  const args = { matches: 100, seed: 20260806, maxSteps: 1200, concurrency: 8, child: null, json: false, aa: false };
  argv.forEach(arg => {
    if (arg === "--json") args.json = true;
    else if (arg === "--aa") args.aa = true;
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
  const selfIndex = index % 2 === 0 ? 0 : 1;
  let info = null;
  // 保持 mode="online"，这样 beginFirstPlayerChoice 不会自动替AI 决定先后手，
  // pending 留给下面按实验参数解析；autoStep 走 autoControlAll，不依赖 mode==="ai"
  const state = withSeed(pairSeed, () => {
    const oppFaction = pick(FACTION_KEYS.filter(f => f !== SELF));
    const selfFaction = SELF;
    const seat0Faction = selfIndex === 0 ? selfFaction : oppFaction;
    const seat1Faction = selfIndex === 0 ? oppFaction : selfFaction;
    const seat0Leader = pick(hardLeaderPool(seat0Faction));
    const seat1Leader = pick(hardLeaderPool(seat1Faction));
    info = { oppFaction, seat0: seat0Leader.name, seat1: seat1Leader.name };
    const s = battle.createMatch({
      mode: "online",
      humanFaction: seat0Faction,
      aiFaction: seat1Faction,
      difficulty: "hard",
      humanLeaderIds: { [seat0Faction]: seat0Leader.id },
      aiLeaderIds: { [seat1Faction]: seat1Leader.id }
    });
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
  // 百家被动的先后手选择：候选=自己先出，基线（线上现状）=让对手先出
  let chooserSeen = null;
  if (state.pending && state.pending.type === "firstPlayer") {
    const chooser = state.pending.playerIndex;
    chooserSeen = chooser;
    const selfFirst = !options.aa && chooser === selfIndex;
    const firstIndex = selfFirst ? chooser : (chooser === 0 ? 1 : 0);
    battle.resolvePending(state, { playerIndex: firstIndex });
  }
  while (state.pending && resolveAutoPending(state)) {}
  const result = runPreparedMatch(pairSeed + 1000003, options.maxSteps, state, [{}, {}]);
  return {
    oppFaction: info.oppFaction,
    chooserWasSelf: chooserSeen === selfIndex,
    winner: result.winner == null ? "draw" : result.winner === selfIndex ? "candidate" : "baseline"
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
  const scriptPath = path.join(__dirname, "bench-first-player.js");
  const childConfig = Buffer.from(JSON.stringify({ seed: options.seed, maxSteps: options.maxSteps, aa: options.aa })).toString("base64");
  const summary = { selfWins: 0, oppWins: 0, draws: 0, chooserWasSelf: 0, byOpp: {} };
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
        const bucket = summary.byOpp[r.oppFaction] || (summary.byOpp[r.oppFaction] = { self: 0, opp: 0, draw: 0 });
        bucket[r.winner === "candidate" ? "self" : r.winner === "baseline" ? "opp" : "draw"] += 1;
        if (r.winner === "candidate") summary.selfWins += 1;
        else if (r.winner === "baseline") summary.oppWins += 1;
        else summary.draws += 1;
        if (r.chooserWasSelf) summary.chooserWasSelf += 1;
        finished += 1;
        if (!options.json) process.stdout.write(`\r进度 ${finished}/${options.matches} 百家:${summary.selfWins} 对手:${summary.oppWins} 平:${summary.draws}`);
        if (finished === options.matches) {
          const decisive = summary.selfWins + summary.oppWins;
          summary.winRate = decisive ? summary.selfWins / decisive : 0;
          summary.pValue = exactBinomialTwoSided(summary.selfWins, summary.oppWins);
          summary.z = binomialZ(summary.selfWins, summary.oppWins);
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
    console.log(`${options.aa ? "基线（线上：让对手先出）" : "候选（百家自己先出）"}：百家争鸣 vs 其他阵营，${options.matches} 场，种子 ${options.seed}`);
    console.log(`百家胜 ${s.selfWins}，对手胜 ${s.oppWins}，平 ${s.draws}；其中百家确实拿到选择权 ${s.chooserWasSelf} 场`);
    console.log(`百家剔除平局胜率 ${(s.winRate * 100).toFixed(2)}%  z=${s.z.toFixed(2)}  p=${s.pValue.toFixed(4)}`);
    Object.keys(s.byOpp).forEach(faction => {
      const b = s.byOpp[faction];
      const d = b.self + b.opp;
      console.log(`  vs ${faction}：百家 ${b.self} / 对手 ${b.opp} / 平 ${b.draw}  胜率 ${d ? (b.self / d * 100).toFixed(2) : "0.00"}%`);
    });
  } catch (error) {
    console.error(`对比中止：${error.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = { runSingleMatch, exactBinomialTwoSided, binomialZ };
