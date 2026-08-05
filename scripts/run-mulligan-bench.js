#!/usr/bin/env node
// 批量跑换牌变体对比并汇总（实验用，验证结束后删除）
const { spawn } = require("child_process");
const path = require("path");

const jobs = process.argv.slice(2).map(arg => {
  const [variant, scope, matches, seed] = arg.split(":");
  return { variant, scope: scope || "", matches: matches || "200", seed: seed || "20260805" };
});

const script = path.join(__dirname, "bench-mulligan-strategy.js");

function run(job) {
  return new Promise((resolve, reject) => {
    const args = [script, `--variant=${job.variant}`, `--matches=${job.matches}`, `--seed=${job.seed}`, "--concurrency=8", "--json"];
    if (job.scope) args.push(`--scope=${job.scope}`);
    const child = spawn(process.execPath, args, { stdio: ["ignore", "pipe", "inherit"] });
    let out = "";
    child.stdout.on("data", d => { out += d; });
    child.on("error", reject);
    child.on("close", code => {
      if (code !== 0) return reject(new Error(`${job.variant}/${job.scope} 退出码 ${code}`));
      try {
        resolve(JSON.parse(out.trim()));
      } catch (error) {
        reject(new Error(`${job.variant}/${job.scope} 输出无效`));
      }
    });
  });
}

(async () => {
  for (const job of jobs) {
    try {
      const r = await run(job);
      const pct = v => `${(v * 100).toFixed(2)}%`;
      console.log([
        `${r.variant.padEnd(6)}/${String(r.scope).padEnd(9)} seed=${r.seed}`,
        `全样本 ${pct(r.candidateDecisiveWinRate)} (${r.candidateWins}/${r.baselineWins})`,
        `换牌不同子集 ${pct(r.diffDecisiveWinRate)} (${r.diffWins}/${r.diffLosses}) p=${r.diffPValue.toFixed(4)}`,
        `无差异 ${r.identicalMatches} 场`
      ].join(" | "));
    } catch (error) {
      console.error(`失败：${error.message}`);
    }
  }
})();
