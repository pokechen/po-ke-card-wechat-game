const fs = require("fs");
const path = __dirname + "/../js/core/battle.js";
let src = fs.readFileSync(path, "utf8");
const orig = src;
const report = [];
function mark(name, ok) { report.push(name + "=" + (ok ? "Y" : "N")); }

// ---- 1) 实现 playWeatherFromLeader（签名改为 state,text,playerIndex）----
const pwDefRe = /function playWeatherFromLeader\s*\(([^)]*)\)\s*\{[\s\S]*?\n\}/;
const pwNew =
`function playWeatherFromLeader(state, text, playerIndex) {
  const rows = [];
  if (/biting frost/.test(text)) rows.push("melee");
  if (/impenetrable fog/.test(text)) rows.push("ranged");
  if (/torrential rain/.test(text)) rows.push("siege");
  if (/skellige storm/.test(text)) { rows.push("ranged"); rows.push("siege"); }
  if (!rows.length) {
    const opp = otherIndex(playerIndex == null ? 0 : playerIndex);
    let best = "melee", bv = -1;
    ROWS.forEach(function (r) { const v = rowStrength(state, opp, r); if (v > bv) { bv = v; best = r; } });
    rows.push(best);
  }
  rows.forEach(function (r) { state.weather[r] = true; });
}`;
if (pwDefRe.test(src)) { src = src.replace(pwDefRe, pwNew); mark("playWeather", true); } else mark("playWeather", false);

// 调用处补 playerIndex
if (src.includes("playWeatherFromLeader(state, text);")) {
  src = src.replace("playWeatherFromLeader(state, text);", "playWeatherFromLeader(state, text, playerIndex);");
  mark("pwCall", true);
} else mark("pwCall", false);

// ---- 2) 在默认分支前插入三条新分支 ----
const NEW =
`  if (/opponent'?s discard/.test(text)) {
    const opp = state.players[otherIndex(playerIndex)];
    const c = opp.discard.shift();
    if (c) { player.hand.push(c); addLog(state, player.name + "从对手弃牌堆取得「" + cardLabel(c) + "」。"); }
    else addLog(state, "对手弃牌堆为空。");
    return true;
  }
  if (/move agile/.test(text)) {
    let moved = 0;
    ROWS.forEach(function (row) {
      const stay = [];
      player.board[row].forEach(function (card) {
        if (hasAbility(card, "Agile") && Array.isArray(card.row) && card.row.length > 1) {
          let best = row, bv = -1;
          card.row.forEach(function (r) { const v = rowStrength(state, playerIndex, r); if (v > bv) { bv = v; best = r; } });
          if (best !== row) { player.board[best].push(card); moved++; return; }
        }
        stay.push(card);
      });
      player.board[row] = stay;
    });
    addLog(state, player.name + "调整机动单位站位（" + moved + " 张）。");
    return true;
  }
  if (/restore.*random|randomly-chosen/.test(text)) {
    state.randomRestore = true;
    addLog(state, player.name + "启用随机复活规则（复活类能力改为随机目标）。");
    return true;
  }
`;
const defRe = /(\n[ \t]*addLog\(state, "主将技能发动)/;
if (defRe.test(src)) { src = src.replace(defRe, "\n" + NEW + "$1"); mark("branches", true); } else mark("branches", false);

// ---- 3) recalc: King Bran 半损 -> 基于技能文本 ----
const kingOld = 'player.leader.baseName === "King Bran"';
const kingNew = '/half (of )?their strength in bad weather|lose half/i.test(((player.leader.leaderAbility||"")+(player.leader.abilityText||"")))';
if (src.includes(kingOld)) { src = src.split(kingOld).join(kingNew); mark("halfWeather", true); } else mark("halfWeather", false);

// ---- 4) recalc: 间谍翻倍 -> 基于技能文本 ----
const trOld = '/treacherous/i.test(player.leader.baseName || "")';
const trNew = '/all spies|doubles? strength of all spies/i.test(((player.leader.leaderAbility||"")+(player.leader.abilityText||"")))';
if (src.includes(trOld)) { src = src.split(trOld).join(trNew); mark("spyDouble", true); } else mark("spyDouble", false);

// ---- 写回（仅当关键补丁均成功）----
const ok = report.every(r => r.endsWith("=Y"));
if (ok && src !== orig) {
  fs.writeFileSync(path, src);
  // 语法校验：清缓存并 require
  try {
    delete require.cache[require.resolve("../js/core/battle.js")];
    require("../js/core/battle.js");
    report.push("syntax=Y");
  } catch (e) {
    fs.writeFileSync(path, orig); // 回滚
    report.push("syntax=N:" + e.message.slice(0, 60));
  }
} else {
  report.push("WROTE=N");
}
fs.writeFileSync(__dirname + "/_patch_report.txt", report.join(" "));
process.stdout.write(report.join(" ").slice(0, 200));
