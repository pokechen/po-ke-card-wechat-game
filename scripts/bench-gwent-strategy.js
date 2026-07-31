#!/usr/bin/env node
// 昆特牌攻略策略对比脚本：新策略(candidate) vs 旧策略基线(baseline)
// 用法：
//   node scripts/bench-gwent-strategy.js --matches=100 --candidate='{"tuning":{"passLeadMin":8}}'
//   node scripts/bench-gwent-strategy.js --sanity            # baseline vs baseline，应≈50%
// candidate / baseline 均为传给 autoStep 的 cfg（会与 HARD 合并）。

const { runConfigComparison } = require("./simulate-ai-matches");

function parseArgs(argv) {
  const args = { matches: 100, seed: 20260731, maxSteps: 1200, candidate: {}, baseline: {}, sanity: false, label: "candidate" };
  argv.forEach(arg => {
    if (arg === "--sanity") args.sanity = true;
    else if (arg.startsWith("--matches=")) args.matches = Math.max(1, Number(arg.slice(10)) || args.matches);
    else if (arg.startsWith("--seed=")) args.seed = Number(arg.slice(7)) || args.seed;
    else if (arg.startsWith("--maxSteps=")) args.maxSteps = Math.max(100, Number(arg.slice(11)) || args.maxSteps);
    else if (arg.startsWith("--label=")) args.label = arg.slice(8);
    else if (arg.startsWith("--candidate=")) args.candidate = JSON.parse(arg.slice(12));
    else if (arg.startsWith("--baseline=")) args.baseline = JSON.parse(arg.slice(11));
  });
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const candidateConfig = args.sanity ? {} : args.candidate;
  const baselineConfig = args.baseline;
  const summary = runConfigComparison({
    matches: args.matches,
    seed: args.seed,
    maxSteps: args.maxSteps,
    candidateConfig,
    baselineConfig
  });
  const rate = (summary.candidateWins / summary.matches * 100).toFixed(1);
  const decisive = (summary.candidateDecisiveWinRate * 100).toFixed(1);
  console.log(`[${args.label}] ${args.matches} 场 hard 随机卡牌 交替座位 种子=${args.seed}`);
  console.log(`  candidate=${JSON.stringify(candidateConfig)}`);
  console.log(`  baseline =${JSON.stringify(baselineConfig)}`);
  console.log(`  新策略胜:${summary.candidateWins}  旧策略胜:${summary.baselineWins}  平局:${summary.draws}`);
  console.log(`  新策略胜率:${rate}%  (剔除平局:${decisive}%)`);
}

main();
