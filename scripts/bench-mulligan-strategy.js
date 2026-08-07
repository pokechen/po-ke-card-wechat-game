#!/usr/bin/env node

// 换牌策略回归 / 灵敏度对比：线上换牌规则 vs 指定基线。
//   --baseline=lowest  纯换最低分（去掉召唤目标重复、重复集贤两个优先级）
//   --baseline=none    完全不换牌
//   --baseline=worst   故意换掉最强的 2 张（灵敏度探针，测「换牌这步最多能造成多大差异」）
//   --scope=alliance|recruit|recall3  限定到有对应组合件的阵营并做镜像对局，剥离稀释
//   --diag=N           只跑换牌，看线上规则最常换掉哪些牌
//
// 已量化的结论（勿再重复踩坑，详见 shared/core/battle.js 的「换牌阶段估值」注释）：
// 换牌的价值几乎全是防御性的——故意换错掉 16pp（65.99%），但「换对」相对「完全不换」
// 只值约 2pp（52.04%，不显著）。四轮共 24 个变体（抬高条件牌/组合件估值、动态阈值、
// 对齐组牌估值、手牌联动条件化、限定阵营镜像、乃至偷看换来那张牌的作弊上界）全部无效，
// 因为线上规则已经把「不换错」做到了，剩余空间低于噪声。

const { spawn } = require("child_process");
const path = require("path");
const battle = require("../shared/core/battle");
const { FACTION_KEYS, buildDeck, cardValue, isHeroCard } = require("../shared/core/cards");
const { resolveAutoPending, runPreparedMatch, withSeed } = require("./simulate-ai-matches");

// 阵营限定：只有这些阵营的 hard 自动组牌里存在对应组合件。
// 限定阵营 + 双方同阵营（镜像）可剥离「双方都不受影响」的对局对胜率的稀释，
// 配合下面「换牌结果确实不同的子集」统计，用于测量只影响部分阵营的换牌改动。
const FACTION_SCOPES = {
  alliance: ["开国群雄", "纵横权谋", "遗策复兴"],  // 有多张同名同盟
  recruit: ["百家争鸣", "草莽星火", "遗策复兴"],   // 有集贤
  recall3: ["开国群雄", "纵横权谋", "百家争鸣", "遗策复兴"],
  noRevival: ["草莽星火"] // 请辞 3 张（草莽只有 1 张）
};

function parseArgs(argv) {
  const args = {
    matches: 100,
    seed: 20260731,
    maxSteps: 1200,
    concurrency: 4,
    scope: "",
    baseline: "lowest",
    child: null,
    diag: 0,
    json: false
  };
  argv.forEach(arg => {
    if (arg === "--json") args.json = true;
    else if (arg === "--diag") args.diag = 200;
    else if (arg.startsWith("--diag=")) args.diag = Math.max(1, Number(arg.slice(7)) || 200);
    else if (arg.startsWith("--matches=")) args.matches = Math.max(1, Number(arg.slice(10)) || args.matches);
    else if (arg.startsWith("--seed=")) args.seed = Number(arg.slice(7)) || args.seed;
    else if (arg.startsWith("--maxSteps=")) args.maxSteps = Math.max(100, Number(arg.slice(11)) || args.maxSteps);
    else if (arg.startsWith("--concurrency=")) args.concurrency = Math.max(1, Number(arg.slice(14)) || args.concurrency);
    else if (arg.startsWith("--scope=")) args.scope = arg.slice(8);
    else if (arg.startsWith("--baseline=")) args.baseline = arg.slice(11);
    else if (arg.startsWith("--child=")) args.child = Math.max(0, Number(arg.slice(8)) || 0);
    else if (arg.startsWith("--config=")) {
      try { Object.assign(args, JSON.parse(Buffer.from(arg.slice(9), "base64").toString())); } catch (error) {}
    }
  });
  if (args.scope && !FACTION_SCOPES[args.scope]) throw new Error(`未知阵营范围 ${args.scope}，可选：${Object.keys(FACTION_SCOPES).join(" / ")}`);
  if (!["lowest", "worst", "none", "online"].includes(args.baseline)) throw new Error(`未知基线 ${args.baseline}，可选：lowest / worst / none / online`);

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
  player.leaderDisabled = false;
  draw(player, 10);
}

// scope 为空时双方阵营各自随机（线上分布）；指定 scope 时从受影响阵营里随机选一个、
// 双方同阵营做镜像对局，使唯一差异是换牌规则。
function pickFactions(scope) {
  const pool = scope ? FACTION_SCOPES[scope] : null;
  if (!pool) return [randomFaction(), randomFaction()];
  const faction = pool[Math.floor(Math.random() * pool.length)];
  return [faction, faction];
}

function createInitialState(scope) {
  const [humanFaction, aiFaction] = pickFactions(scope);
  const state = battle.createMatch({
    mode: "online",
    humanFaction,
    aiFaction,
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
  return player.difficulty === "hard"? 11 : player.difficulty === "easy" ? 9 : 10;
}

// 基线：不带任何优先级，纯换掉最低分牌
function selectBaselineCard(player) {
  const card = player.hand.slice().sort((a, b) => cardValue(a) - cardValue(b))[0];
  if (!card || isHeroCard(card) || cardValue(card) >= thresholdFor(player)) return null;
  return card;
}

// 灵敏度探针：故意换掉手上最强的牌（非传世）。用于测量「换牌这一步对胜负到底有多敏感」，
// 若连这种明显更差的换牌都打不出显著劣势，说明换牌方向的优化天花板极低。
function selectWorstCard(player) {
  return player.hand.slice()
    .filter(card => !isHeroCard(card))
    .sort((a, b) => cardValue(b) - cardValue(a))[0] || null;
}

function trackDropped(state, playerIndex, before) {
  const kept = state.players[playerIndex].hand.map(card => card.name);
  const dropped = [];
  before.forEach(name => {
    const at = kept.indexOf(name);
    if (at >= 0) kept.splice(at, 1);
    else dropped.push(name);
  });
  return dropped;
}

function applyPickerMulligan(state, playerIndex, picker) {
  const player = state.players[playerIndex];
  const before = player.hand.map(card => card.name);
  let swaps = 0;
  for (let i = 0; i < state.mulligan.max; i++) {
    const card = picker(player);
    if (!card) break;
    if (!battle.mulliganSwap(state, card.uid, playerIndex)) break;
    swaps += 1;
  }
  if (!state.mulligan.done[playerIndex]) battle.finishMulligan(state, playerIndex);
  return { swaps, dropped: trackDropped(state, playerIndex, before) };
}

// 候选：线上换牌规则，统一调用 battle.aiMulliganFor，脚本不复制一份换牌逻辑
function applyCandidateMulligan(state, playerIndex) {
  const player = state.players[playerIndex];
  const before = player.hand.map(card => card.name);
  const swaps = battle.aiMulliganFor(state, playerIndex);
  if (!state.mulligan.done[playerIndex]) battle.finishMulligan(state, playerIndex);
  return { swaps, dropped: trackDropped(state, playerIndex, before) };
}

function baselineApplier(mode) {
  if (mode === "worst") return (state, pi) => applyPickerMulligan(state, pi, selectWorstCard);
  if (mode === "none") return (state, pi) => {
    battle.finishMulligan(state, pi);
    return { swaps: 0, dropped: [] };
  };
  // online：基线也走线上换牌规则。双方逻辑相同时是A/A 对称性校验（实测 200 场 98/98），
  // 需要验证新候选规则时在 battle.js 的 mulliganCardValue 里临时挂开关，与本模式对打。
  if (mode === "online") return (state, pi) => applyCandidateMulligan(state, pi);
  return (state, pi) => applyPickerMulligan(state, pi, selectBaselineCard);
}

function runSingleMatch(index, options) {
  const pairSeed = options.seed + Math.floor(index / 2) * 9973;
  const candidateAsPlayer0 = index % 2 === 0;
  const state = withSeed(pairSeed, () => createInitialState(options.scope));
  const applyBaseline = baselineApplier(options.baseline);
  const appliers = candidateAsPlayer0
    ? [applyCandidateMulligan, applyBaseline]
    : [applyBaseline, applyCandidateMulligan];
  const stats = appliers.map((apply, playerIndex) => withSeed(
    pairSeed + 500003 + playerIndex * 104729,
    () => apply(state, playerIndex)
  ));
  while (state.pending && resolveAutoPending(state)) {}
  const candidateIndex = candidateAsPlayer0 ? 0 : 1;
  const result = runPreparedMatch(pairSeed + 1000003, options.maxSteps, state);
  return {
    winner: result.winner == null ? "draw" : result.winner === candidateIndex ? "candidate" : "baseline",
    candidateSwaps: stats[candidateIndex].swaps,
    baselineSwaps: stats[candidateIndex === 0 ? 1 : 0].swaps
  };
}

// 诊断：只跑换牌，统计线上规则最常换掉哪些牌
function runDiag(options) {
  const dropped = new Map();
  let total = 0;
  for (let i = 0; i < options.diag; i++) {
    const seed = options.seed + i * 9973;
    const state = withSeed(seed, () => createInitialState(options.scope));
    const before = state.players[0].hand.map(card => card.name);
    total += withSeed(seed + 500003, () => battle.aiMulliganFor(state, 0));
    trackDropped(state, 0, before).forEach(name => dropped.set(name, (dropped.get(name) || 0) + 1));
  }
  const top = Array.from(dropped.entries()).sort((a, b) => b[1] - a[1]).slice(0, 15)
    .map(([name, count]) => `${name}x${count}`).join("、");
  console.log(`换牌诊断：${options.diag} 个随机开局（只统计玩家一），种子 ${options.seed}${options.scope ? `，阵营范围 ${options.scope}` : ""}`);
  console.log(`总换牌 ${total} 次，最常换掉：${top}`);
}

// 双侧精确二项检验。注意必须在对数空间累加：Math.pow(0.5, n) 在 n>1024 时会下溢到 0，
// 直接算会让上千场样本的 p 值假报成 0。
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

// 正态近似 z 值，便于直观判断偏离程度（|z|>1.96 对应 p<0.05）
function binomialZ(wins, losses) {
  const n = wins + losses;
  if (!n) return 0;
  return (wins - n / 2) / Math.sqrt(n * 0.25);
}

function runParent(options) {
  const scriptPath = path.join(__dirname, "bench-mulligan-strategy.js");
  const childConfig = Buffer.from(JSON.stringify({
    seed: options.seed,
    maxSteps: options.maxSteps,
    scope: options.scope,
    baseline: options.baseline
  })).toString("base64");
  const summary = {
    matches: options.matches,
    seed: options.seed,
    baseline: options.baseline,
    scope: options.scope || "全阵营随机",
    candidateWins: 0,
    baselineWins: 0,
    draws: 0,
    candidateSwaps: 0,
    baselineSwaps: 0,
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
        summary.candidateSwaps += result.candidateSwaps;
        summary.baselineSwaps += result.baselineSwaps;
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
    process.stdout.write(JSON.stringify(runSingleMatch(options.child, options)));
    return;
  }
  if (options.diag) {
    runDiag(options);
    return;
  }
  try {
    const summary = await runParent(options);
    if (!options.json) process.stdout.write("\n");
    if (options.json) {
      console.log(JSON.stringify(summary, null, 2));
      return;
    }
    const labels = { lowest: "纯换最低分", worst: "故意换掉最强牌", none: "完全不换", online: "线上规则", combo: "组合件保留规则" };
    console.log(`换牌对比：线上换牌规则 vs ${labels[summary.baseline]}，阵营范围 ${summary.scope}，${summary.matches} 场，困难难度，种子 ${summary.seed}`);
    console.log(`线上换牌规则胜：${summary.candidateWins}，${labels[summary.baseline]}胜：${summary.baselineWins}，平局：${summary.draws}`);
    console.log(`全样本剔除平局胜率：${(summary.candidateDecisiveWinRate * 100).toFixed(2)}%，p=${summary.pValue.toFixed(4)}`);
    console.log(`z=${binomialZ(summary.candidateWins, summary.baselineWins).toFixed(2)}｜双方总换牌 ${summary.candidateSwaps}/${summary.baselineSwaps}`);
  } catch (error) {
    console.error(`对比中止：${error.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = { FACTION_SCOPES, selectBaselineCard, selectWorstCard, runSingleMatch, exactBinomialTwoSided, binomialZ };
