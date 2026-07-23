#!/usr/bin/env node
// 汇总 verify-decoy-medic.js 的多个并行分片 JSON 结果。
const fs = require("fs");

const files = process.argv.slice(2);
const N_VALUES = [0, 1, 2, 3];
const agg = {};
N_VALUES.forEach(n => { agg[n] = { wins: 0, draws: 0, matches: 0, invalid: 0, firstSeed: null }; });

let meta = null;
for (const f of files) {
  let data;
  try { data = JSON.parse(fs.readFileSync(f, "utf8")); }
  catch (e) { console.error(`无法读取 ${f}: ${e.message}`); continue; }
  if (!meta) meta = data.args;
  if (data.firstSeedInfo && !agg[0].firstSeed) agg[0].firstSeed = data.firstSeedInfo;
  for (const row of data.stats) {
    const a = agg[row.n];
    a.wins += row.wins;
    a.draws += row.draws;
    a.matches += row.matches;
    a.invalid += row.invalid || 0;
  }
}

const lines = [];
lines.push(`汇总：${files.length} 个分片，总种子数=${agg[0].matches / 2 | 0}（每种子双打）`);
if (meta) lines.push(`阵营=${meta.seed ? "" : ""} 策略=${meta.simDepth} simDepth=${meta.simDepth} branchCap=${meta.branchCap}`);
if (agg[0].firstSeed) {
  const s = agg[0].firstSeed;
  lines.push(`基准卡组样例：总数=${s.total} 济世数=${s.medics} 请辞数=${s.decoys} 合法=${s.valid}`);
}
lines.push("");
lines.push(`请辞数 | 受试胜场 | 平局 | 总场数 | 受试胜率 | 非平局胜率`);
lines.push(`--------|----------|------|--------|----------|------------`);
const rows = N_VALUES.map(n => {
  const a = agg[n];
  const winRate = a.wins / a.matches;
  const decisive = Math.max(1, a.matches - a.draws);
  const decisiveRate = a.wins / decisive;
  lines.push(
    `   ${n}    |   ${a.wins}    |  ${a.draws}  |  ${a.matches}  | ${(winRate * 100).toFixed(2)}% | ${(decisiveRate * 100).toFixed(2)}%` +
    (a.invalid ? `  (非法${a.invalid})` : "")
  );
  return { n, winRate, decisiveRate };
});
lines.push("");
for (let k = 1; k < rows.length; k++) {
  const d = (rows[k].winRate - rows[k - 1].winRate) * 100;
  lines.push(`请辞 ${rows[k - 1].n}→${rows[k].n} 张：胜率变化 ${d >= 0 ? "+" : ""}${d.toFixed(2)}%`);
}
const full = (rows[3].winRate - rows[0].winRate) * 100;
lines.push(`请辞 0→3 张：胜率变化 ${full >= 0 ? "+" : ""}${full.toFixed(2)}%`);
console.log(lines.join("\n"));
