#!/usr/bin/env node

// 特殊卡牌（鼓舞/奇策/时局）相关 AI 参数对比脚本。
// 候选方通过 runPreparedMatch 的 playerConfigs 注入 cfg.strategy，双方在同一局内对打并交替座位。
//
// 已验证结论（勿重复踩坑，详见 ../tmp/docs/special-cards-strategy-notes.md）：
//   tempoHoldPenalty 线上 8 已接近最优——0→48.83%、4→3 组 900 场 50.17%、12→50.00%、
//   16→49.50%、24→47.83%（单峰，峰值在 4~8 之间但幅度在噪声内）。
//   奇策出手阈值偏移、时局出手阈值：草莽星火镜像各300 场全部 49.66%~50.34%，
//   影响面太小（草莽是唯一带釜底抽薪/边患四起的阵营，各 1 张）。
//
// 用法：
//   node scripts/bench-special-cards.js --tempo=4 --matches=300 --seed=20260805
//   node scripts/bench-special-cards.js --tempo=4 --matches=300 --scope=situation  # 限定草莽星火

const { spawn } = require("child_process");
const path = require("path");
const battle = require("../shared/core/battle");
const { FACTION_KEYS, buildDeck } = require("../shared/core/cards");
const { resolveAutoPending, runPreparedMatch, withSeed } = require("./simulate-ai-matches");

// 只有草莽星火带釜底抽薪 / 边患四起；战鼓齐鸣 5 个阵营全带。也支持直接用阵营名限定范围。
const FACTION_SCOPES = { situation: ["草莽星火"] };
FACTION_KEYS.forEach(faction => { FACTION_SCOPES[faction] = [faction]; });

// 解析 key:value[,key:value] 形式的数值参数。非法值必须直接报错：
// 若把 "--strategy=a:1 --seed=2" 当成单个参数传入（zsh 不对未加引号的变量分词就会这样），
// 静默 Number() 会得到 NaN 并被typeof === "number" 判定为合法权重，导致整批对比数据无效。
function parseNumberMap(text, flag) {
  const map = {};
  String(text).split(",").map(item => item.trim()).filter(Boolean).forEach(pair => {
    const at = pair.indexOf(":");
    const key = at >= 0 ? pair.slice(0, at).trim() : pair;
    const value = at >= 0 ? Number(pair.slice(at + 1).trim()) : NaN;
    if (!key || !Number.isFinite(value)) {
      throw new Error(`${flag} 参数非法：「${pair}」，正确格式为 key:number[,key:number]（整体不要含空格）`);
    }
    map[key] = value;
  });
  return Object.keys(map).length ? map : null;
}

function parseArgs(argv) {
    const args = { matches: 100, seed: 20260731, maxSteps: 1200, concurrency: 4, scope: "", child: null, json: false, tempo: null, strategy: null, tuning: null };
  argv.forEach(arg => {
    if (arg === "--json") args.json = true;
    else if (arg.startsWith("--tuning=")) {
      // 停牌参数注入，如 --tuning=minCardsToCatch:2，可用键见 battle.js 的 resolvePassTuning
      args.tuning = parseNumberMap(arg.slice(9), "--tuning");
    }
    else if (arg.startsWith("--strategy=")) {
      // 通用策略参数注入，如 --strategy=handDeltaWeight:6 或 --strategy=scoreGainWeight:1.5,tempoHoldPenalty:4
      // 可用键见 battle.js 的 resolveScoreStrategy
      args.strategy = parseNumberMap(arg.slice(11), "--strategy");
    }
    else if (arg.startsWith("--matches=")) args.matches = Math.max(1, Number(arg.slice(10)) || args.matches);
    else if (arg.startsWith("--seed=")) args.seed = Number(arg.slice(7)) || args.seed;
    else if (arg.startsWith("--maxSteps=")) args.maxSteps = Math.max(100, Number(arg.slice(11)) || args.maxSteps);
    else if (arg.startsWith("--concurrency=")) args.concurrency = Math.max(1, Number(arg.slice(14)) || args.concurrency);
    else if (arg.startsWith("--scope=")) args.scope = arg.slice(8);
    else if (arg.startsWith("--tempo=")) args.tempo = Number(arg.slice(8));
    else if (arg.startsWith("--child=")) args.child = Math.max(0, Number(arg.slice(8)) || 0);
    else if (arg.startsWith("--config=")) {
      try { Object.assign(args, JSON.parse(Buffer.from(arg.slice(9), "base64").toString())); } catch (error) {}
    }
  });
  if (args.scope && !FACTION_SCOPES[args.scope]) throw new Error(`未知阵营范围 ${args.scope}，可选：${Object.keys(FACTION_SCOPES).join(" / ")}`);
  return args;
}

function randomFaction() { return FACTION_KEYS[Math.floor(Math.random() * FACTION_KEYS.length)]; }

function pickFactions(scope) {
  const pool = scope ? FACTION_SCOPES[scope] : null;
  if (!pool) return [randomFaction(), randomFaction()];
  const f = pool[Math.floor(Math.random() * pool.length)];
  return [f, f];
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
  player.leaderDisabled = false;
  draw(player, 10);
}

function createInitialState(scope) {
  const [humanFaction, aiFaction] = pickFactions(scope);
  const state = battle.createMatch({ mode: "online", humanFaction, aiFaction, difficulty: "hard" });
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

function runSingleMatch(index, options) {
  const pairSeed = options.seed + Math.floor(index / 2) * 9973;
  const candidateAsPlayer0 = index % 2 === 0;
  const state = withSeed(pairSeed, () => createInitialState(options.scope));
  // 双方换牌都走线上规则，唯一差异是特殊卡牌估值开关
  state.players.forEach((_, pi) => withSeed(pairSeed + 500003 + pi * 104729, () => {
    battle.aiMulliganFor(state, pi);
    if (!state.mulligan.done[pi]) battle.finishMulligan(state, pi);
  }));
  while (state.pending && resolveAutoPending(state)) {}
  const candidateIndex = candidateAsPlayer0 ? 0 : 1;
  const strategy = { ...(options.strategy || {}) };
  if (options.tempo != null) strategy.tempoHoldPenalty = options.tempo;
  const candidateCfg = {};
  if (Object.keys(strategy).length) candidateCfg.strategy = strategy;
  if (options.tuning) candidateCfg.tuning = options.tuning;
  const playerConfigs = candidateAsPlayer0 ? [candidateCfg, {}] : [{}, candidateCfg];
  const result = runPreparedMatch(pairSeed + 1000003, options.maxSteps, state, playerConfigs);
  return {
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
  const scriptPath = path.join(__dirname, "bench-special-cards.js");
  const childConfig = Buffer.from(JSON.stringify({ seed: options.seed, maxSteps: options.maxSteps, scope: options.scope, tempo: options.tempo, strategy: options.strategy, tuning: options.tuning })).toString("base64");
  const summary = { matches: options.matches, seed: options.seed, scope: options.scope || "全阵营随机", variant: options.tempo != null ? `tempoHoldPenalty=${options.tempo}` : (options.strategy || options.tuning ? JSON.stringify({ ...(options.strategy || {}), ...(options.tuning || {}) }) : "无改动"), candidateWins: 0, baselineWins: 0, draws: 0 };
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
        if (!options.json) process.stdout.write(`\r进度 ${finished}/${options.matches} 新:${summary.candidateWins} 旧:${summary.baselineWins} 平:${summary.draws}`);
        if (finished === options.matches) {
          const decisive = summary.candidateWins + summary.baselineWins;
          summary.candidateDecisiveWinRate = decisive ? summary.candidateWins / decisive : 0;
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
    console.log(`特殊卡牌对比：${s.variant} vs 线上，阵营范围 ${s.scope}，${s.matches} 场，种子 ${s.seed}`);
    console.log(`新胜 ${s.candidateWins}，旧胜 ${s.baselineWins}，平 ${s.draws}`);
    console.log(`剔除平局胜率 ${(s.candidateDecisiveWinRate * 100).toFixed(2)}%  z=${s.z.toFixed(2)}  p=${s.pValue.toFixed(4)}`);
  } catch (error) {
    console.error(`对比中止：${error.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = { runSingleMatch, exactBinomialTwoSided, binomialZ };
