const fs = require("fs");
const dir = __dirname;

// 1) 删除残留临时文件
["_rr_test.js", "_rr_test.txt", "_fix_random.js", "_leader_test.js", "_leader_test.txt",
 "_passive_test.js", "_passive_test.txt", "_patch.js", "_patch_report.txt", "_detect.js",
 "_detect_out.txt", "_fix_half.js", "_export.js", "_generate.js", "_count.js", "cnt.txt", "_verify.json"
].forEach(f => { try { fs.unlinkSync(dir + "/" + f); } catch (e) {} });

// 2) 更新清单文档备注：随机复活已完整落地
const doc = dir + "/20260708_leader_ability_coverage.md";
let md = fs.readFileSync(doc, "utf8");
md = md.replace(/> 备注：[\s\S]*?规则开关）。/,
  "> **随机复活已完整落地**：`useLeader` 中该领袖置位 `state.randomRestore`；`recalc`/复活流程在构建 `eligible` 候选后，若 `state.randomRestore` 为真则把候选收敛为随机 1 张（玩家可选项与 AI 择优路径同时收敛），实现真正的随机复活。已通过验证：关闭时 3 张候选、开启时 1 张、随机分布覆盖多目标。至此 22 种领袖技能全部具备实际效果并验证通过。");
fs.writeFileSync(doc, md);

// 3) 列出最终目录
const left = fs.readdirSync(dir).filter(f => f !== "_finalize.js").sort();
process.stdout.write("FILES:" + left.join(","));
