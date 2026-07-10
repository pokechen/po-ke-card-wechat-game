const { clear, text, button, fillRoundRect, wrapText, drawCardImage, short } = require("../ui/canvas");
const { loadSave } = require("../core/storage");
const { DIFFICULTY_LABELS, allCards, cardById, displayName } = require("../core/cards");
const { drawDetail } = require("./cardsBrowser");

const ROW_H = 90;
const ROW_GAP = 98;
const LEADERS = allCards().filter(card => card.category === "leader");

function formatTime(ts) {
  if (!ts) return "未知时间";
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${m}-${day} ${h}:${min}`;
}

const RESULT_STYLES = {
  win: { label: "胜利", color: "#2f6f57", fill: "#f0faf3", tagFill: "#2f6f57", streak: "连胜" },
  loss: { label: "失败", color: "#9f3b24", fill: "#fff0ea", tagFill: "#9f3b24", streak: "连败" },
  draw: { label: "平局", color: "#6b6b5f", fill: "#f6f2ea", tagFill: "#6b6b5f" }
};

function resultType(item) {
  if (item.winner === 0) return "win";
  if (item.winner == null) return "draw";
  return "loss";
}

function resultStyle(item) {
  return RESULT_STYLES[resultType(item)];
}

function streakBadges(history) {
  const badges = {};
  let start = 0;
  while (start < history.length) {
    const type = resultType(history[start]);
    let end = start + 1;
    while (end < history.length && resultType(history[end]) === type) end += 1;
    const count = end - start;
    if (type !== "draw" && count >= 3) {
      const style = RESULT_STYLES[type];
      badges[start] = { text: `${count}${style.streak}`, fill: style.tagFill };
    }
    start = end;
  }
  return badges;
}

function cleanName(value) {
  return String(value || "")
    .replace(/^领袖牌_/, "")
    .replace(/^[^_]+阵营_/, "")
    .trim();
}

function leaderCard(id, name) {
  const byId = cardById(id);
  if (byId) return byId;
  const target = cleanName(name);
  if (!target) return null;
  return LEADERS.find(card => displayName(card) === target || cleanName(card.baseName || card.name) === target) || null;
}

function roundDetail(item) {
  const rounds = Array.isArray(item.roundResults) ? item.roundResults : [];
  if (!rounds.length) return `小局 ${item.rounds?.[0] || 0}:${item.rounds?.[1] || 0}`;
  return rounds.map(r => {
    const tag = r.winner == null ? "平" : (r.winner === 0 ? "胜" : "负");
    return `${r.round}局${r.scores?.[0] || 0}:${r.scores?.[1] || 0}${tag}`;
  }).join(" · ");
}

function layout(view) {
  const top = view.safeTop + 30;
  const bottom = view.height - view.safeBottom - 52;
  const listTop = top + 58;
  const listBottom = bottom - 18;
  const pageSize = Math.max(1, Math.floor((listBottom - listTop) / ROW_GAP));
  return { top, bottom, listTop, pageSize };
}

function pageState(view, ui, history, targetPage) {
  const info = layout(view);
  const totalPages = Math.max(1, Math.ceil(history.length / info.pageSize));
  const page = targetPage == null ? (ui.historyPage || 0) : targetPage;
  const safePage = Math.max(0, Math.min(page, totalPages - 1));
  const start = safePage * info.pageSize;
  return { ...info, totalPages, safePage, start, list: history.slice(start, start + info.pageSize + 1) };
}

function clampPage(view, ui, page) {
  return pageState(view, ui, loadSave().history || [], page).safePage;
}

function drawLeaderAvatar(ctx, actions, card, x, y, size, stroke) {
  fillRoundRect(ctx, x - 3, y - 3, size + 6, size + 6, 9, "#fff7df", stroke);
  if (card) {
    actions.push({ id: "historyLeader", cardId: card.id, x: x - 8, y: y - 8, w: size + 16, h: size + 16 });
    drawCardImage(ctx, { ...card, imageFill: true, imageX: x, imageY: y, imageW: size, imageH: size });
  } else {
    fillRoundRect(ctx, x, y, size, size, 8, "#d8c8aa", stroke);
    text(ctx, "将", x + size / 2, y + size / 2, 11, "#fff7d8", "center");
  }
}

function drawStreakBadge(ctx, badge, x, y) {
  const w = 82;
  const h = 26;
  ctx.save();
  ctx.shadowColor = "rgba(143, 60, 31, 0.32)";
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 2;
  fillRoundRect(ctx, x, y, w, h, 13, "#f6d27a", "#fff1a8");
  ctx.restore();
  fillRoundRect(ctx, x + 4, y + 4, w - 8, h - 8, 9, badge.fill, "rgba(255,247,216,0.52)");
  text(ctx, badge.text, x + w / 2, y + h / 2 + 0.5, 11, "#fff7d8", "center");
}

function draw(ctx, view, actions, ui = {}) {
  clear(ctx, view.width, view.height);
  const save = loadSave();
  const allHistory = save.history || [];
  const state = pageState(view, ui, allHistory);
  const transitionY = ui.pageTransition?.scene === "history" ? ui.pageTransition.offset || 0 : 0;
  const listBottom = state.bottom - 18;
  ui.historyPage = state.safePage;
  let detail = null;
  if (ui.historyLeaderDetailId) {
    detail = cardById(ui.historyLeaderDetailId);
    if (!detail) ui.historyLeaderDetailId = "";
  }
  const total = save.matches || 0;
  const winRate = total ? Math.round((save.wins || 0) * 100 / total) : 0;
  text(ctx, "战绩记录", view.width / 2, state.top, 22, "#2f2417", "center");
  text(ctx, `总 ${total} · 胜 ${save.wins || 0} · 负 ${save.losses || 0} · 平 ${save.draws || 0} · 胜率 ${winRate}%`, view.width / 2, state.top + 28, 12, "#775c34", "center");
  const badges = streakBadges(allHistory);
  if (!state.list.length) {
    fillRoundRect(ctx, 24, state.top + 74, view.width - 48, 110, 18, "#fffaf0", "#dcc48d");
    text(ctx, "还没有完成的对局", view.width / 2, state.top + 128, 15, "#775c34", "center");
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, state.listTop - 4, view.width, listBottom - state.listTop + 4);
  ctx.clip();
  state.list.forEach((item, index) => {
    const globalIndex = state.start + index;
    const y = state.listTop + index * ROW_GAP + transitionY;
    const style = resultStyle(item);
    const badge = badges[globalIndex];
    const humanLeader = leaderCard(item.humanLeaderId, item.humanLeader);
    fillRoundRect(ctx, 18, y, view.width - 36, ROW_H, 13, style.fill, style.color);
    fillRoundRect(ctx, 24, y + 10, 5, ROW_H - 20, 3, style.color);
    fillRoundRect(ctx, 34, y + 8, 40, 18, 9, style.tagFill);
    text(ctx, style.label, 54, y + 17, 10, "#fff7d8", "center");
    if (badge) drawStreakBadge(ctx, badge, view.width - 128, y + 7);
    const title = item.resultText || (item.endReason === "surrender" ? "认输" : "已结束");
    const avatarSize = 54;
    const avatarY = y + 30;
    drawLeaderAvatar(ctx, actions, humanLeader, 36, avatarY, avatarSize, style.color);
    const textX = 104;
    const textW = view.width - textX - 72;
    text(ctx, `${title} · ${formatTime(item.time)}`, textX, y + 18, 13, style.color);
    wrapText(ctx, `我方 ${item.humanFaction || "阵营"} · ${short(item.humanLeader || "主将", 8)}`, textX, y + 40, textW, 14, 1, 11, "#3b2b18");
    wrapText(ctx, `对手 ${item.aiFaction || "系统"} · ${short(item.aiLeader || "系统主将", 8)} · ${DIFFICULTY_LABELS[item.difficulty] || item.difficulty || "普通"}`, textX, y + 61, textW, 14, 1, 10, "#775c34");
    wrapText(ctx, roundDetail(item), textX, y + 80, textW, 13, 1, 10, "#6f5a3a");
    text(ctx, `${item.rounds?.[0] || 0}:${item.rounds?.[1] || 0}`, view.width - 42, y + 54, 18, style.color, "center");
  });
  ctx.restore();
  if (state.safePage < state.totalPages - 1) {
    ctx.save();
    const fade = ctx.createLinearGradient ? ctx.createLinearGradient(0, listBottom - 30, 0, listBottom) : null;
    if (fade) { fade.addColorStop(0, "rgba(255,250,240,0)"); fade.addColorStop(1, "rgba(255,250,240,0.92)"); ctx.fillStyle = fade; }
    else ctx.fillStyle = "rgba(255,250,240,0.72)";
    ctx.fillRect(0, listBottom - 30, view.width, 30);
    ctx.restore();
  }
  const back = { id: "back", x: 18, y: state.bottom, w: view.width - 36, h: 40 };
  actions.push(back);
  button(ctx, { ...back, label: "返回首页", size: 13, fill: "#8d6840" });
  if (detail) drawDetail(ctx, view, actions, detail);
}

module.exports = { draw, clampPage };
