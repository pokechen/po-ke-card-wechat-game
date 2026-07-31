const { clear, text, fillRoundRect, wrapText, drawCardImage, short, drawTopLeftBack } = require("../ui/canvas");
const { DIFFICULTY_LABELS, allCards, cardById, displayName } = require("../core/cards");
const { drawDetail } = require("./cardDetail");

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
  draw: { label: "平局", color: "#6b6b5f", fill: "#f6f2ea", tagFill: "#6b6b5f" },
  anomaly: { label: "异常", color: "#8d6840", fill: "#fff7e8", tagFill: "#8d6840" }
};

function resultType(item) {
  if (item.rankedAnomaly) return "anomaly";
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
  return LEADERS.find(card => displayName(card) === target || cleanName(card.name) === target) || null;
}

function applyRoundMorale(morale, winner) {
  const next = [morale[0], morale[1]];
  if (winner == null) {
    next[0] -= 1;
    next[1] -= 1;
  } else {
    next[winner === 0 ? 1 : 0] -= 1;
  }
  return next.map(value => Math.max(0, value));
}

function moraleAfterRoundResults(results) {
  return (Array.isArray(results) ? results : []).reduce((morale, result) => {
    if (Array.isArray(result?.morale) && result.morale.length >= 2) return [result.morale[0] || 0, result.morale[1] || 0];
    return applyRoundMorale(morale, result?.winner == null ? null : result.winner);
  }, [2, 2]);
}

function roundDetail(item) {
  const rounds = Array.isArray(item.roundResults) ? item.roundResults : [];
  if (!rounds.length) return `小局 ${item.rounds?.[0] || 0}:${item.rounds?.[1] || 0}`;
  return rounds.map(r => {
    const tag = r.winner == null ? "平" : (r.winner === 0 ? "胜" : "负");
    return `${r.round}局${r.scores?.[0] || 0}:${r.scores?.[1] || 0}${tag}`;
  }).join(" · ");
}

function drawMoraleToken(ctx, x, y, active, fill) {
  const size = 6;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x, y - size);
  ctx.lineTo(x + size, y);
  ctx.lineTo(x, y + size);
  ctx.lineTo(x - size, y);
  ctx.closePath();
  ctx.fillStyle = active ? fill : "#d8c9ad";
  ctx.fill();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = active ? fill : "#bfa77c";
  ctx.stroke();
  ctx.restore();
}

function drawMoraleTokens(ctx, x, y, count, fill) {
  for (let index = 0; index < 2; index += 1) drawMoraleToken(ctx, x + index * 16, y, index < count, fill);
}

function deckModeLabel(mode) {
  if (mode === "custom") return "自定义卡牌";
  if (mode === "random") return "随机卡牌";
  return "卡牌模式未知";
}

function layout(view) {
  const top = view.safeTop + 30;
  const bottom = view.height - view.safeBottom - 52;
  const listTop = top + 58;
  const availableH = Math.max(ROW_H, bottom - listTop);
  const fullRows = Math.max(1, Math.floor((availableH - ROW_H * 0.5) / ROW_GAP));
  const viewportH = Math.min(availableH, fullRows * ROW_GAP + ROW_H * 0.5);
  const listBottom = listTop + viewportH;
  return { top, bottom, listTop, listBottom, viewportH };
}

function scrollState(view, ui, history) {
  const info = layout(view);
  const contentH = history.length ? (history.length - 1) * ROW_GAP + ROW_H : 0;
  const maxScroll = Math.max(0, contentH - info.viewportH);
  const scroll = Math.max(0, Math.min(ui.historyScroll || 0, maxScroll));
  const start = Math.max(0, Math.floor(scroll / ROW_GAP));
  const end = Math.min(history.length, Math.ceil((scroll + info.viewportH) / ROW_GAP) + 1);
  return { ...info, contentH, maxScroll, scroll, start, list: history.slice(start, end) };
}

function cloudHistory(ui = {}) {
  return Array.isArray(ui.cloudHistoryRecords) ? ui.cloudHistoryRecords : [];
}

function historySummary(history) {
  const total = history.length;
  const wins = history.filter(item => item.winner === 0).length;
  const draws = history.filter(item => item.winner == null).length;
  const losses = Math.max(0, total - wins - draws);
  return { total, wins, losses, draws, winRate: total ? Math.round(wins * 100 / total) : 0 };
}

function scrollBounds(view, ui = {}) {
  const state = scrollState(view, {}, cloudHistory(ui));
  return { listTop: state.listTop, listBottom: state.listBottom, maxScroll: state.maxScroll };
}

function detailLeaderCards(view, ui) {
  const state = scrollState(view, ui, cloudHistory(ui));
  const seen = new Set();
  return state.list
    .map(item => leaderCard(item.humanLeaderId, item.humanLeader))
    .filter(card => {
      if (!card || seen.has(card.id)) return false;
      seen.add(card.id);
      return true;
    });
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

function drawStreakBadge(ctx, badge, rightX, y) {
  const w = 90;
  const h = 28;
  const cx = rightX - w * 0.5;
  const cy = y + h * 0.3;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(0.4);
  ctx.shadowColor = "rgba(0,0,0,0.25)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 3;
  fillRoundRect(ctx, -w / 2, -h / 2, w, h, 6, "#e85d2a", "#ff9d5c");
  ctx.restore();
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(0.4);
  fillRoundRect(ctx, -w / 2 + 3, -h / 2 + 3, w - 6, h - 6, 4, badge.fill, "rgba(255,255,255,0.18)");
  ctx.font = "bold 13px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#fff7e0";
  ctx.fillText(badge.text, 0, 1);
  ctx.restore();
}

function draw(ctx, view, actions, ui = {}) {
  clear(ctx, view.width, view.height);
  const allHistory = cloudHistory(ui);
  const state = scrollState(view, ui, allHistory);
  const listBottom = state.listBottom;
  ui.historyScroll = state.scroll;
  let detail = null;
  if (ui.historyLeaderDetailId) {
    detail = cardById(ui.historyLeaderDetailId);
    if (!detail) ui.historyLeaderDetailId = "";
  }
  const summary = (ui.cloudHistoryTotal != null)
    ? { total: ui.cloudHistoryTotal, wins: ui.cloudHistoryWins || 0, losses: ui.cloudHistoryLosses || 0, draws: ui.cloudHistoryDraws || 0, winRate: ui.cloudHistoryWinRate || 0 }
    : historySummary(allHistory);
  drawTopLeftBack(ctx, view, actions, "back");
  text(ctx, "战绩记录", view.width / 2, state.top, 22, "#2f2417", "center");
  text(ctx, `总 ${summary.total} · 胜 ${summary.wins} · 负 ${summary.losses} · 平 ${summary.draws} · 胜率 ${summary.winRate}%`, view.width / 2, state.top + 28, 12, "#775c34", "center");
  const badges = streakBadges(allHistory);
  if (!state.list.length) {
    fillRoundRect(ctx, 24, state.top + 74, view.width - 48, 110, 18, "#fffaf0", "#dcc48d");
    const emptyText = ui.cloudHistoryLoading ? "正在同步云端战绩..." : (ui.cloudHistoryError || "还没有完成的对局");
    text(ctx, emptyText, view.width / 2, state.top + 128, 15, "#775c34", "center");
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, state.listTop - 4, view.width, listBottom - state.listTop + 4);
  ctx.clip();
  state.list.forEach((item, index) => {
    const globalIndex = state.start + index;
    const y = state.listTop + globalIndex * ROW_GAP - state.scroll;
    const style = resultStyle(item);
    const badge = badges[globalIndex];
    const humanLeader = leaderCard(item.humanLeaderId, item.humanLeader);
    fillRoundRect(ctx, 18, y, view.width - 36, ROW_H, 13, style.fill, style.color);
    fillRoundRect(ctx, 24, y + 4, 5, ROW_H - 8, 3, style.color);
    if (badge) drawStreakBadge(ctx, badge, view.width - 14, y);
    const title = item.endReason === "disconnect" ? (item.ranked ? "排位掉线" : "掉线") : (item.resultText || (item.endReason === "surrender" ? "认输" : "已结束"));
    const avatarSize = ROW_H - 12;
    const avatarY = y + 6;
    drawLeaderAvatar(ctx, actions, humanLeader, 32, avatarY, avatarSize, style.color);
    const textX = 32 + avatarSize + 10;
    const textW = view.width - textX - 72;
    const tagW = 38;
    const tagH = 18;
    fillRoundRect(ctx, textX, y + 8, tagW, tagH, 9, style.tagFill);
    text(ctx, style.label, textX + tagW / 2, y + 17, 10, "#fff7d8", "center");
    text(ctx, `${title} · ${formatTime(item.time)}`, textX + tagW + 8, y + 18, 13, style.color);
    const isOnline = item.mode === "online";
    wrapText(ctx, `我方·${deckModeLabel(item.humanDeckMode)} ${item.humanFaction || "阵营"} · ${short(item.humanLeader || "主将", 8)}`, textX, y + 40, textW, 14, 1, 11, "#3b2b18");
    const oppSuffix = isOnline ? "好友对战" : (DIFFICULTY_LABELS[item.difficulty] || item.difficulty || "普通");
    const oppName = isOnline ? "好友" : "对手";
    wrapText(ctx, `${oppName}·${deckModeLabel(item.aiDeckMode)} ${item.aiFaction || "系统"} · ${short(item.aiLeader || "系统主将", 8)} · ${oppSuffix}`, textX, y + 61, textW, 14, 1, 10, "#775c34");
    const detailText = item.ranked ? `${item.rankDeltaText || "排位"} · ${roundDetail(item)}` : roundDetail(item);
    wrapText(ctx, detailText, textX, y + 80, textW, 13, 1, 10, item.rankedAnomaly ? "#8d6840" : "#6f5a3a");
    const morale = Array.isArray(item.morale) ? item.morale : moraleAfterRoundResults(item.roundResults);
    const moraleX = view.width - 58;
    text(ctx, "军心", moraleX + 8, y + 34, 10, "#8a6132", "center");
    drawMoraleTokens(ctx, moraleX, y + 52, morale[0] || 0, "#2f6f57");
    drawMoraleTokens(ctx, moraleX, y + 72, morale[1] || 0, "#8f3c1f");
  });
  ctx.restore();
  if (state.scroll < state.maxScroll - 0.5) {
    ctx.save();
    const fade = ctx.createLinearGradient ? ctx.createLinearGradient(0, listBottom - 30, 0, listBottom) : null;
    if (fade) { fade.addColorStop(0, "rgba(255,250,240,0)"); fade.addColorStop(1, "rgba(255,250,240,0.92)"); ctx.fillStyle = fade; }
    else ctx.fillStyle = "rgba(255,250,240,0.72)";
    ctx.fillRect(0, listBottom - 30, view.width, 30);
    ctx.restore();
  }
  if (state.maxScroll > 0) {
    const trackX = view.width - 9;
    const trackY = state.listTop + 4;
    const trackH = Math.max(24, state.viewportH - 8);
    const thumbH = Math.max(30, trackH * state.viewportH / state.contentH);
    const thumbY = trackY + (trackH - thumbH) * (state.scroll / state.maxScroll);
    fillRoundRect(ctx, trackX, trackY, 3, trackH, 1.5, "rgba(119,92,52,0.16)");
    fillRoundRect(ctx, trackX, thumbY, 3, thumbH, 1.5, "rgba(143,60,31,0.72)");
  }
  if (ui.cloudHistoryHasMore && state.list.length) {
    text(ctx, ui.cloudHistoryLoadingMore ? "加载更多战绩…" : "上滑加载更多", view.width / 2, state.listBottom + 14, 11, "#b09a72", "center");
  }
  if (detail) {
    const leaders = detailLeaderCards(view, ui);
    const currentIdx = leaders.findIndex(card => card.id === detail.id);
    const leftCard = currentIdx > 0 ? leaders[currentIdx - 1] : null;
    const rightCard = currentIdx >= 0 && currentIdx < leaders.length - 1 ? leaders[currentIdx + 1] : null;
    const swipeOffset = ui.detailSwipe ? ui.detailSwipe.offset || 0 : 0;
    drawDetail(ctx, view, actions, detail, { leftCard, rightCard, swipeOffset });
  }
}

module.exports = { draw, scrollBounds, detailLeaderCards };
