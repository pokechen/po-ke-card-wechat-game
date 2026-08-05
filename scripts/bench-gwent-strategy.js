#!/usr/bin/env node
// 昆特牌攻略策略对比脚本：新策略(candidate) vs 旧策略基线(baseline)
// 用法：
//   node scripts/bench-gwent-strategy.js --matches=100 --candidate='{"tuning":{"passLeadMin":8}}'
//   node scripts/bench-gwent-strategy.js --sanity            # baseline vs baseline，应≈50%
// candidate / baseline 均为传给 autoStep 的 cfg（会与 HARD 合并）。

const { runConfigComparison } = require("./simulate-ai-matches");

function parseArgs(argv) {
  const args = { matches: 100, seed: 20260731, maxSteps: 1200, candidate: {}, baseline: {}, sanity: false, label: "candidate", seeds: null, withMulligan: false };
  argv.forEach(arg => {
    if (arg === "--sanity") args.sanity = true;
    else if (arg === "--mulligan") args.withMulligan = true;
    else if (arg.startsWith("--matches=")) args.matches = Math.max(1, Number(arg.slice(10)) || args.matches);
    else if (arg.startsWith("--seeds=")) args.seeds = arg.slice(8).split(",").map(Number).filter(n => !Number.isNaN(n));
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
  const seeds = args.seeds && args.seeds.length ? args.seeds : [args.seed];
  let totCand = 0, totBase = 0, totDraw = 0, totMatch = 0;
  console.log(`[${args.label}] candidate=${JSON.stringify(candidateConfig)} baseline=${JSON.stringify(baselineConfig)}`);
  seeds.forEach(seed => {
    const s = runConfigComparison({ matches: args.matches, seed, maxSteps: args.maxSteps, candidateConfig, baselineConfig, withMulligan: args.withMulligan });
    totCand += s.candidateWins; totBase += s.baselineWins; totDraw += s.draws; totMatch += s.matches;
    console.log(`  seed=${seed}: 新胜:${s.candidateWins} 旧胜:${s.baselineWins} 平:${s.draws} 胜率:${(s.candidateWins / s.matches * 100).toFixed(1)}%`);
  });
  const rate = (totCand / totMatch * 100).toFixed(2);
  const decisive = (totCand / Math.max(1, totCand + totBase) * 100).toFixed(2);
  console.log(`  合计 ${totMatch} 场：新策略胜:${totCand} 旧策略胜:${totBase} 平局:${totDraw}`);
  console.log(`  总胜率:${rate}%  (剔除平局:${decisive}%)`);
}

main();
