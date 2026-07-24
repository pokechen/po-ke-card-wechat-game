#!/usr/bin/env node
// 主将加分(leaderGain) 估算 A/B 测试台。
// 目标：修复 optimisticReachableDiff 中 leaderGain 误用 totalScore(player)（≈整块场面分）的 bug——
//       该 bug 导致 AI 落后时误以为还能追上，不放弃必输的小局、把整手牌砸进去，后期无牌可打。
//
// 对比方式（满足项目对战策略验证规则：随机卡牌 + 困难难度，交替先后手）：
//   主测试 = 修复版(FIXED) vs 旧 bug 版(OLD_BUGGY) head-to-head，统计修复版胜率（>50% 即更优）。
//   上下文 = 旧 bug 生产版 vs legacy（说明该 pass 规则整体价值）。
//
// 通过 autoStep 的 cfg.tuning.leaderGainBuggy 切换新旧逻辑：true=旧 bug，false=模拟真实增量(修复)。

const { runStrategyComparison } = require("./simulate-ai-matches");

const OLD_BUGGY = { strategy: "optimized", tuning: { leaderGainBuggy: true } };  // 修复前的线上策略
const NEUTRAL = "legacy";       // 固定中立对手，独立于本次调参旋钮

// 候选：leaderGain 修复版（默认 leaderGainBuggy=false 即为修复版，这里显式声明）
const CANDIDATES = [
  { name: "FIXED_leaderGain", tuning: { leaderGainBuggy: false } },
];
const BASELINE = OLD_BUGGY;

function parseArgs(argv) {
  const args = { matches: 100, seed: 20260721, json: false, hhOnly: true, maxSteps: 1200, only: null };
  argv.forEach(arg => {
    if (arg === "--json") args.json = true;
    else if (arg === "--full") args.hhOnly = false;
    else if (arg.startsWith("--only=")) args.only = arg.slice(7) || null;
    else if (arg.startsWith("--matches=")) args.matches = Math.max(1, Number(arg.slice(10)) || args.matches);
    else if (arg.startsWith("--seed=")) args.seed = Number(arg.slice(7)) || args.seed;
  });
  return args;
}

// 候选（object 策略）vs 基线（string 策略）。newStrategy=候选。
function headToHead(candidate, matches, seed) {
  return runStrategyComparison({ matches, seed: seed + 1, maxSteps: 1200, oldStrategy: BASELINE, newStrategy: { strategy: BASELINE, tuning: candidate.tuning } });
}

function vsNeutral(candidate, matches, seed) {
  return runStrategyComparison({ matches, seed: seed + 2, maxSteps: 1200, oldStrategy: NEUTRAL, newStrategy: { strategy: BASELINE, tuning: candidate.tuning } });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const M = args.matches;
  const S = args.seed;
  const t0 = Date.now();

  console.log(`=== leaderGain 修复 A/B 测试 (matches=${M}, seed=${S}, hhOnly=${args.hhOnly}) ===\n`);

  // 上下文：旧 bug 生产版 vs legacy（说明当前 pass 规则的全局价值，不参与“是否更优”判定）
  const baseVsNeutral = runStrategyComparison({ matches: M, seed: S + 3, maxSteps: 1200, oldStrategy: NEUTRAL, newStrategy: BASELINE });
  console.log(`[上下文] 旧 bug 生产版 vs legacy: 旧版胜 ${baseVsNeutral.newWins}/${M} (${(baseVsNeutral.newWinRate * 100).toFixed(2)}%)\n`);

  const pool = args.only ? CANDIDATES.filter(c => c.name === args.only) : CANDIDATES;
  if (pool.length === 0) { console.log(`未找到候选 ${args.only}`); return; }
  const rows = [];
  for (const cand of pool) {
    const hh = headToHead(cand, M, S);
    let vn = null;
    if (!args.hhOnly) vn = vsNeutral(cand, M, S);
    rows.push({ name: cand.name, tuning: cand.tuning, hh, vn });
    const vnStr = vn ? `；vs legacy 候选胜 ${vn.newWins}/${M} (${(vn.newWinRate * 100).toFixed(2)}%)` : "";
    console.log(`[${cand.name}] head-to-head vs 基线: 候选胜 ${hh.newWins}/${M} (${(hh.newWinRate * 100).toFixed(2)}%)，平 ${hh.draws}${vnStr}`);
  }

  console.log(`\n=== 汇总（head-to-head vs 基线，>50% 即优于基线）===`);
  rows.sort((a, b) => b.hh.newWinRate - a.hh.newWinRate);
  rows.forEach(r => {
    const decisive = Math.max(1, r.hh.newWins + r.hh.oldWins);
    console.log(`  ${r.name}: vs基线 ${(r.hh.newWinRate * 100).toFixed(2)}% | 非平局胜率 ${(r.hh.newWins / decisive * 100).toFixed(2)}% | tuning=${JSON.stringify(r.tuning)}`);
  });

  const best = rows[0];
  console.log(`\n用时 ${((Date.now() - t0) / 1000).toFixed(1)}s。最优候选(head-to-head): ${best.name} (${(best.hh.newWinRate * 100).toFixed(2)}%)`);
}

if (require.main === module) main();

module.exports = { CANDIDATES, headToHead, vsNeutral };
