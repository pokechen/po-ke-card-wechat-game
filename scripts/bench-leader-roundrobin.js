#!/usr/bin/env node

// 22 个主将全循环赛：每个主将与其他 21 个主将各打 x 场（C(22,2)=231 对），
// 一场结果同时写进双方战绩，最终给出每个主将「vs 其他所有主将」的总胜率。
//
// 口径说明：这是跨阵营对战，双方各用自己阵营的 hard 自动组牌，因此胜率里天然混入了
// 阵营强度差（同阵营内部对打也算在 231 对里）。交替座位以消除先后手偏差。
//
// 并发方式：每个子进程跑完一整对的 x 场（避免 231×x 次 node 启动开销）。
//
// 用法：
//   node scripts/bench-leader-roundrobin.js --matches=40 --concurrency=8
//   node scripts/bench-leader-roundrobin.js --leader=zhangyu-0016 --matches=100 --concurrency=8
//   node scripts/bench-leader-roundrobin.js --matches=10 --json

const { spawn } = require("child_process");
const path = require("path");
const battle = require("../shared/core/battle");
const cards = require("../shared/core/cards");
const { buildDeck, leadersFor, FACTION_KEYS } = cards;
const { resolveAutoPending, runPreparedMatch, withSeed } = require("./simulate-ai-matches");

function allLeaders() {
  const list = [];
  FACTION_KEYS.forEach(faction => {
    leadersFor(faction).forEach(leader => list.push({ faction, id: leader.id, name: leader.name }));
  });
  return list;
}

function allPairs(count) {
  const pairs = [];
  for (let i = 0; i < count; i++) for (let j = i + 1; j < count; j++) pairs.push([i, j]);
  return pairs;
}

function parseArgs(argv) {
  const args = { matches: 20, seed: 20260806, maxSteps: 1200, concurrency: 8, pair: null, leader: null, json: false };
  argv.forEach(arg => {
    if (arg === "--json") args.json = true;
    else if (arg.startsWith("--matches=")) args.matches = Math.max(2, Number(arg.slice(10)) || args.matches);
    else if (arg.startsWith("--seed=")) args.seed = Number(arg.slice(7)) || args.seed;
    else if (arg.startsWith("--maxSteps=")) args.maxSteps = Math.max(100, Number(arg.slice(11)) || args.maxSteps);
    else if (arg.startsWith("--concurrency=")) args.concurrency = Math.max(1, Number(arg.slice(14)) || args.concurrency);
    else if (arg.startsWith("--leader=")) args.leader = arg.slice(9);
    else if (arg.startsWith("--pair=")) args.pair = arg.slice(7).split(",").map(Number);
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

// seat0 / seat1 为 { faction, id }
function createInitialState(seat0, seat1) {
  const state = battle.createMatch({
    mode: "online",
    humanFaction: seat0.faction,
    aiFaction: seat1.faction,
    difficulty: "hard",
    humanLeaderIds: { [seat0.faction]: seat0.id },
    aiLeaderIds: { [seat1.faction]: seat1.id }
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

// 跑一整对：a 与 b 各打 options.matches 场，偶数场 a 在座位 0，奇数场 a 在座位 1
function runPairMatches(a, b, pairIndex, options) {
  const result = { aWins: 0, bWins: 0, draws: 0 };
  for (let k = 0; k < options.matches; k++) {
    const seed = options.seed + pairIndex * 100003 + Math.floor(k / 2) * 9973;
    const aAtSeat0 = k % 2 === 0;
    const seat0 = aAtSeat0 ? a : b;
    const seat1 = aAtSeat0 ? b : a;
    const state = withSeed(seed, () => createInitialState(seat0, seat1));
    state.players.forEach((_, pi) => withSeed(seed + 500003 + pi * 104729, () => {
      battle.aiMulliganFor(state, pi);
      if (!state.mulligan.done[pi]) battle.finishMulligan(state, pi);
    }));
    while (state.pending && resolveAutoPending(state)) {}
    const match = runPreparedMatch(seed + 1000003, options.maxSteps, state, [{}, {}]);
    if (match.winner == null) result.draws += 1;
    else {
      const aIndex = aAtSeat0 ? 0 : 1;
      if (match.winner === aIndex) result.aWins += 1;
      else result.bWins += 1;
    }
  }
  return result;
}

function runParent(options) {
  const leaders = allLeaders();
  const leaderIndex = options.leader ? leaders.findIndex(leader => leader.id === options.leader) : -1;
  const pairs = allPairs(leaders.length)
    .map((pair, pairIndex) => ({ pair, pairIndex }))
    .filter(({ pair }) => leaderIndex < 0 || pair.includes(leaderIndex));
  const scriptPath = path.join(__dirname, "bench-leader-roundrobin.js");
  const childConfig = Buffer.from(JSON.stringify({ seed: options.seed, maxSteps: options.maxSteps, matches: options.matches })).toString("base64");
  const stats = leaders.map(leader => ({ ...leader, wins: 0, losses: 0, draws: 0 }));
  const active = new Set();
  let next = 0, finished = 0, failed = false;
  const started = Date.now();
  return new Promise((resolve, reject) => {
    function stop(error) {
      if (failed) return;
      failed = true;
      active.forEach(child => child.kill("SIGTERM"));
      reject(error);
    }
    function launch() {
      if (failed || next >= pairs.length) return;
      const { pair: [i, j], pairIndex } = pairs[next++];
      const child = spawn(process.execPath, [scriptPath, `--pair=${i},${j},${pairIndex}`, `--config=${childConfig}`], { stdio: ["ignore", "pipe", "pipe"] });
      active.add(child);
      let stdout = "", stderr = "";
      child.stdout.on("data", d => { stdout += d; });
      child.stderr.on("data", d => { stderr += d; });
      child.on("error", stop);
      child.on("close", code => {
        active.delete(child);
        if (failed) return;
        if (code !== 0) return stop(new Error(`对 ${leaders[i].name} vs ${leaders[j].name} 失败：${stderr.trim() || `退出码 ${code}`}`));
        let r;
        try { r = JSON.parse(stdout.trim()); } catch (e) { return stop(new Error(`对 ${leaders[i].name} vs ${leaders[j].name} 输出无效：${stdout.trim()} ${stderr.trim()}`)); }
        // 一场结果同时写进双方战绩
        stats[i].wins += r.aWins; stats[i].losses += r.bWins; stats[i].draws += r.draws;
        stats[j].wins += r.bWins; stats[j].losses += r.aWins; stats[j].draws += r.draws;
        finished += 1;
        if (!options.json) {
          const speed = (Date.now() - started) / finished;
          const eta = Math.round((pairs.length - finished) * speed / 1000);
          process.stdout.write(`\r进度 ${finished}/${pairs.length} 对（每对 ${options.matches} 场）预计剩余 ${eta}s   `);
        }
        if (finished === pairs.length) return resolve(stats);
        launch();
      });
    }
    for (let i = 0; i < Math.min(options.concurrency, pairs.length); i++) launch();
  });
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const leaders = allLeaders();
  if (options.pair) {
    const [i, j, pairIndex] = options.pair;
    process.stdout.write(JSON.stringify(runPairMatches(leaders[i], leaders[j], pairIndex, options)));
    return;
  }
  if (options.matches % 2 !== 0) {
    console.error("--matches 必须为偶数，才能让每名主将各有相同场次处于两个座位。");
    process.exitCode = 1;
    return;
  }
  const selectedLeader = options.leader ? leaders.find(leader => leader.id === options.leader) : null;
  if (options.leader && !selectedLeader) {
    console.error(`找不到主将：${options.leader}`);
    process.exitCode = 1;
    return;
  }
  runParent(options).then(stats => {
    if (!options.json) process.stdout.write("\n");
    if (options.json) return console.log(JSON.stringify(stats, null, 2));
    const rows = stats.map(item => {
      const decisive = item.wins + item.losses;
      return { ...item, total: decisive + item.draws, rate: decisive ? item.wins / decisive : 0 };
    }).filter(item => !selectedLeader || item.total > 0).sort((a, b) => b.rate - a.rate);
    const pairCount = selectedLeader ? leaders.length - 1 : allPairs(leaders.length).length;
    const title = selectedLeader
      ? `${selectedLeader.name} 对全部不同主将专项赛`
      : "主将全循环赛";
    console.log(`${title}：${pairCount} 对、每对 ${options.matches} 场、共 ${pairCount * options.matches} 场，双方均 hard 自动组牌、各占两个座位 ${options.matches / 2} 场，种子 ${options.seed}`);
    console.log("排名 主将        阵营        场次胜   负  平   剔除平局胜率");
    rows.forEach((row, index) => {
      console.log(`${String(index + 1).padStart(3)}  ${row.name.padEnd(10, "")} ${row.faction.padEnd(6, "　")} ${String(row.total).padStart(5)} ${String(row.wins).padStart(4)} ${String(row.losses).padStart(4)} ${String(row.draws).padStart(3)}   ${(row.rate * 100).toFixed(2)}%`);
    });
    if (!selectedLeader) {
      console.log("\n按阵营内排序（每族最优主将）：");
      FACTION_KEYS.forEach(faction => {
        const list = rows.filter(row => row.faction === faction);
        console.log(`  ${faction}：${list.map(row => `${row.name} ${(row.rate * 100).toFixed(1)}%`).join(" > ")}`);
      });
    }
  }).catch(error => {
    console.error(`\n循环赛中止：${error.message}`);
    process.exitCode = 1;
  });
}

if (require.main === module) main();

module.exports = { allLeaders, allPairs, runPairMatches };
