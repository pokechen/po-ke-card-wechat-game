#!/usr/bin/env node

// 验证：在卡组包含「非传世济世」（华佗，非 Hero 的 Revival）的前提下，
// 携带 0 / 1 / 2 / 3 张「请辞归隐」（Recall）时的胜率区别。
//
// 设计：
//  - 固定阵营为 开国群雄，使华佗可入组。
//  - 每个种子先生成一份基准困难卡组（作为对手与受试卡组的来源）。
//  - 受试卡组 = 基准卡组，但确保恰好 1 张华佗（zhangyu-0145，非传世济世），
//    移除原有请辞，保留 7 张其它特殊牌，再补入 N 张请辞归隐。
//    => 各 N 之间唯一变量是请辞数量。
//  - 对手始终使用同一份基准卡组。对每种 N 同时跑「受试为玩家0」与「受试为玩家1」，
//    抵消先后手偏差。
//  - 双方均使用相同 AI 策略（v3.2），以隔离卡组构成的影响。

const battle = require("../shared/core/battle");
const { FACTION_KEYS, buildDeck, cardValue, deckStatus, cardById, categoryLabel } = require("../shared/core/cards");

const HARD = { blunder: 0, concede: true, valueNoise: 0, minLeadToStop: 1 };
const FACTION = "开国群雄";
const REVIVAL_CARD_ID = "zhangyu-0145"; // 华佗：非传世济世
const RECALL_CARD_IDS = ["zhangyu-0185", "zhangyu-0186", "zhangyu-0187"]; // 请辞归隐 三张
const STRATEGY = "v3.2";

function parseArgs(argv) {
  const args = {
    matches: 200,        // 种子数（每个种子对每种 N 跑 2 场：受试分别在玩家0/玩家1）
    start: 0,            // 起始种子偏移（用于并行分片）
    seed: 20260722,
    maxSteps: 1500,
    simDepth: 10,
    branchCap: 12,
    json: false
  };
  argv.forEach(arg => {
    if (arg === "--json") args.json = true;
    else if (arg.startsWith("--matches=")) args.matches = Math.max(1, Number(arg.slice(10)) || args.matches);
    else if (arg.startsWith("--start=")) args.start = Math.max(0, Number(arg.slice(8)) || args.start);
    else if (arg.startsWith("--seed=")) args.seed = Number(arg.slice(6)) || args.seed;
    else if (arg.startsWith("--maxSteps=")) args.maxSteps = Math.max(100, Number(arg.slice(11)) || args.maxSteps);
    else if (arg.startsWith("--simDepth=")) args.simDepth = Math.max(1, Number(arg.slice(11)) || args.simDepth);
    else if (arg.startsWith("--branchCap=")) args.branchCap = Math.max(1, Number(arg.slice(12)) || args.branchCap);
    else if (arg.startsWith("--out=")) args.out = arg.slice(6);
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

function isStrategyCard(id) {
  const c = cardById(id);
  return c && (c.category === "stratagem" || c.category === "situation");
}

function buildSubjectIds(baseIds, recallCount) {
  const units = baseIds.filter(id => !isStrategyCard(id));
  let strategies = baseIds.filter(id => isStrategyCard(id) && !RECALL_CARD_IDS.includes(id));
  // 保留 7 张其它特殊牌（不足则全保留），保持各 N 之间唯一变量为请辞数量
  const keptStratagems = strategies.slice(0, 7);
  const recalls = RECALL_CARD_IDS.slice(0, recallCount);
  const units2 = units.slice();
  if (!units2.includes(REVIVAL_CARD_ID)) units2.push(REVIVAL_CARD_ID); // 确保恰好 1 张非传世济世
  return [...units2, ...keptStratagems, ...recalls];
}

function deckInfo(ids) {
  const revivals = ids.filter(id => {
    const c = cardById(id);
    return c && (c.abilities || []).includes("济世");
  }).length;
  const recalls = ids.filter(id => RECALL_CARD_IDS.includes(id)).length;
  return { total: ids.length, revivals, recalls, valid: deckStatus(ids, FACTION).valid };
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

function runOneMatch(seed, subjectIds, baseIds, subjectAsPlayer0, cfg) {
  return withSeed(seed, () => {
    const state = battle.createMatch({
      mode: "ai",
      humanFaction: FACTION,
      aiFaction: FACTION,
      difficulty: "hard",
      humanCustomDeckIds: subjectAsPlayer0 ? subjectIds : baseIds,
      aiCustomDeckIds: subjectAsPlayer0 ? baseIds : subjectIds
    });
    state.autoControlAll = true;
    state.suppressRecording = true;
    state.logs = [];
    battle.finishMulligan(state, 0);
    while (state.pending && resolveAutoPending(state)) {}
    battle.recalcScores(state);
    let steps = 0;
    while (!state.over && steps < cfg.maxSteps) {
      steps += 1;
      if (state.roundTransition) { battle.continueRoundTransition(state); continue; }
      if (state.pending) { if (!resolveAutoPending(state)) throw new Error(`无法自动处理 pending: ${state.pending.type}`); continue; }
      const ok = battle.autoStep(state, { playerIndex: state.current, cfg: cfg.aiCfg });
      if (!ok) throw new Error(`自动出牌失败：current=${state.current}`);
    }
    if (!state.over) throw new Error(`超过最大步数 ${cfg.maxSteps}`);
    const subjectIndex = subjectAsPlayer0 ? 0 : 1;
    return { winner: state.winner, subjectWin: state.winner === subjectIndex, draw: state.winner == null, finalScores: state.finalScores };
  });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const cfg = {
    maxSteps: args.maxSteps,
    aiCfg: { ...HARD, strategy: STRATEGY, simDepth: args.simDepth, branchCap: args.branchCap }
  };
  const N_VALUES = [0, 1, 2, 3];
  const stats = {};
  N_VALUES.forEach(n => { stats[n] = { wins: 0, draws: 0, matches: 0, invalid: 0 }; });

  const baseInfoSample = [];
  let firstSeedInfo = null;

  for (let i = 0; i < args.matches; i++) {
    const seed = args.seed + (args.start + i) * 9973;
    const baseIds = withSeed(seed, () => buildDeck(0, { faction: FACTION, difficulty: "hard" }).map(c => c.id));
    if (i === 0) firstSeedInfo = deckInfo(baseIds);
    const subjectDecks = {};
    N_VALUES.forEach(n => {
      const ids = buildSubjectIds(baseIds, n);
      const info = deckInfo(ids);
      if (!info.valid) stats[n].invalid += 1;
      subjectDecks[n] = ids;
    });
    N_VALUES.forEach(n => {
      // 受试作为玩家0
      let r = runOneMatch(seed, subjectDecks[n], baseIds, true, cfg);
      stats[n].matches += 1;
      if (r.draw) stats[n].draws += 1; else if (r.subjectWin) stats[n].wins += 1;
      // 受试作为玩家1
      r = runOneMatch(seed + 5000000, subjectDecks[n], baseIds, false, cfg);
      stats[n].matches += 1;
      if (r.draw) stats[n].draws += 1; else if (r.subjectWin) stats[n].wins += 1;
    });
    process.stdout.write(".");
  }

  process.stdout.write(`\n[分片 start=${args.start} count=${args.matches}] 完成 ${args.matches} 种子\n`);
  const lines = [];
  lines.push(`验证「非传世济世(华佗) + N 张请辞归隐」胜率区别`);
  lines.push(`阵营=${FACTION}  策略=${STRATEGY}  simDepth=${args.simDepth} branchCap=${args.branchCap}  种子=${args.seed}  种子数=${args.matches}`);
  lines.push(`基准卡组样例(首个种子)：总数=${firstSeedInfo.total} 济世数=${firstSeedInfo.revivals} 请辞数=${firstSeedInfo.recalls} 合法=${firstSeedInfo.valid}`);
  lines.push("");
  lines.push(`请辞数 | 受试胜场 | 平局 | 总场数 | 受试胜率 | 非平局胜率`);
  lines.push(`--------|----------|------|--------|----------|------------`);
  const rows = [];
  N_VALUES.forEach(n => {
    const s = stats[n];
    const winRate = s.wins / s.matches;
    const decisive = Math.max(1, s.matches - s.draws);
    const decisiveRate = s.wins / decisive;
    rows.push({ n, ...s, winRate, decisiveRate });
    lines.push(
      `   ${n}    |   ${s.wins}    |  ${s.draws}  |  ${s.matches}  | ${(winRate * 100).toFixed(2)}% | ${(decisiveRate * 100).toFixed(2)}%` +
      (s.invalid ? `  (非法卡组${s.invalid})` : "")
    );
  });
  lines.push("");
  // 相邻差异
  for (let k = 1; k < rows.length; k++) {
    const d = (rows[k].winRate - rows[k - 1].winRate) * 100;
    lines.push(`请辞 ${rows[k - 1].n}→${rows[k].n} 张：胜率变化 ${d >= 0 ? "+" : ""}${d.toFixed(2)}%`);
  }
  const full = ((rows[3].winRate - rows[0].winRate) * 100);
  lines.push(`请辞 0→3 张：胜率变化 ${full >= 0 ? "+" : ""}${full.toFixed(2)}%`);

  const jsonOut = JSON.stringify({ args, stats: rows, firstSeedInfo }, null, 2);
  if (args.out) {
    require("fs").writeFileSync(args.out, jsonOut);
    console.log(lines.join("\n"));
  } else if (args.json) {
    console.log(jsonOut);
  } else {
    console.log(lines.join("\n"));
  }
}

if (require.main === module) main();

module.exports = { buildSubjectIds, deckInfo, runOneMatch, mulberry32, withSeed };
