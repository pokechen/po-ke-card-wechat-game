const { clear, text, button, fillRoundRect, wrapText } = require("../ui/canvas");
const { loadSave } = require("../core/storage");
const { DIFFICULTY_LABELS } = require("../core/cards");

function formatTime(ts) {
  if (!ts) return "未知时间";
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${m}-${day} ${h}:${min}`;
}

function resultColor(item) {
  if (item.endReason === "surrender") return "#8f3c1f";
  if (item.winner === 0) return "#2f6f57";
  if (item.winner == null) return "#6b6b5f";
  return "#8f3c1f";
}

function roundDetail(item) {
  const rounds = Array.isArray(item.roundResults) ? item.roundResults : [];
  if (!rounds.length) return `小局 ${item.rounds?.[0] || 0}:${item.rounds?.[1] || 0}`;
  return rounds.map(r => {
    const tag = r.winner == null ? "平" : (r.winner === 0 ? "胜" : "负");
    return `${r.round}局${r.scores?.[0] || 0}:${r.scores?.[1] || 0}${tag}`;
  }).join(" · ");
}

function draw(ctx, view, actions) {
  clear(ctx, view.width, view.height);
  const save = loadSave();
  const top = view.safeTop + 30;
  const total = save.matches || 0;
  const winRate = total ? Math.round((save.wins || 0) * 100 / total) : 0;
  text(ctx, "战绩记录", view.width / 2, top, 22, "#2f2417", "center");
  text(ctx, `总 ${total} · 胜 ${save.wins || 0} · 负 ${save.losses || 0} · 平 ${save.draws || 0} · 胜率 ${winRate}%`, view.width / 2, top + 28, 12, "#775c34", "center");
  const history = (save.history || []).slice(0, 5);
  if (!history.length) {
    fillRoundRect(ctx, 24, top + 74, view.width - 48, 110, 18, "#fffaf0", "#dcc48d");
    text(ctx, "还没有完成的对局", view.width / 2, top + 128, 15, "#775c34", "center");
  }
  history.forEach((item, index) => {
    const y = top + 58 + index * 82;
    fillRoundRect(ctx, 18, y, view.width - 36, 72, 12, "#fffaf0", "#dcc48d");
    const title = item.endReason === "surrender" ? `${item.resultText} · 认输` : item.resultText;
    text(ctx, `${title} · ${formatTime(item.time)}`, 34, y + 15, 13, resultColor(item));
    text(ctx, `${item.humanFaction} vs ${item.aiFaction} · ${DIFFICULTY_LABELS[item.difficulty] || item.difficulty}`, 34, y + 34, 11, "#775c34");
    if (item.humanLeader || item.aiLeader) {
      wrapText(ctx, `${item.humanLeader || "主将"} / ${item.aiLeader || "系统主将"}`, 34, y + 51, view.width - 90, 14, 1, 10, "#6f5a3a");
    }
    wrapText(ctx, roundDetail(item), 34, y + 64, view.width - 90, 13, 1, 10, "#6f5a3a");
    text(ctx, `${item.rounds?.[0] || 0}:${item.rounds?.[1] || 0}`, view.width - 42, y + 34, 18, "#8f3c1f", "center");
  });
  const bottom = view.height - view.safeBottom - 52;
  const clearBtn = { id: "clear", x: 18, y: bottom, w: 112, h: 40 };
  const back = { id: "back", x: 144, y: bottom, w: view.width - 162, h: 40 };
  actions.push(clearBtn, back);
  button(ctx, { ...clearBtn, label: "清空记录", size: 12, fill: "#8f3c1f" });
  button(ctx, { ...back, label: "返回首页", size: 13, fill: "#8d6840" });
}

module.exports = { draw };
