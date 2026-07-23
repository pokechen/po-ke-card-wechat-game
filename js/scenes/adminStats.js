const { clear, text, button, fillRoundRect, wrapText, drawRemoteImage } = require("../ui/canvas");

const INK = "#2f2417";
const MUTED = "#775c34";
const PANEL = "#fffaf0";
const LINE = "#dcc48d";

function layout(view) {
  const top = view.safeTop + 28;
  const bottom = view.height - view.safeBottom - 52;
  const listTop = top + 52;
  const viewportH = Math.max(220, bottom - listTop - 8);
  return { top, bottom, listTop, listBottom: listTop + viewportH, viewportH };
}

function playerItems(stats) {
  return Array.isArray(stats?.playerBattles?.items) ? stats.playerBattles.items : [];
}

function recentItems(stats) {
  return Array.isArray(stats?.recentMatches?.items) ? stats.recentMatches.items : [];
}

function listPanelHeight(length, rowHeight, emptyHeight) {
  return 46 + (length ? length * rowHeight + 12 : emptyHeight);
}

function matchRoundDetails(item) {
  return Array.isArray(item?.roundDetails) ? item.roundDetails : [];
}

function recentMatchRowHeight() {
  return 94;
}

function recentMatchesPanelHeight(items) {
  if (!items.length) return 46 + 58;
  return 46 + items.reduce((sum, item) => sum + recentMatchRowHeight(item), 0) + 12;
}

function contentHeight(stats) {
  const topPlayersH = listPanelHeight(playerItems(stats).length, 52, 52);
  const recentMatchesH = recentMatchesPanelHeight(recentItems(stats));
  return 1018 + 14 + topPlayersH + 14 + recentMatchesH + 24;
}

function scrollBounds(view, stats) {
  const info = layout(view);
  const contentH = contentHeight(stats);
  return { ...info, contentH, maxScroll: Math.max(0, contentH - info.viewportH) };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(value, max));
}

function compactDate(value) {
  const date = String(value || "");
  return date.length >= 10 ? date.slice(5) : date;
}

function formatUpdatedAt(value) {
  const timestamp = Number(value) || 0;
  if (!timestamp) return "";
  const date = new Date(timestamp);
  const pad = number => String(number).padStart(2, "0");
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function kpi(ctx, x, y, w, label, value, color) {
  fillRoundRect(ctx, x, y, w, 62, 12, PANEL, LINE);
  text(ctx, String(value == null ? "-" : value), x + w / 2, y + 25, 20, color, "center");
  text(ctx, label, x + w / 2, y + 47, 10, MUTED, "center");
}

function panel(ctx, x, y, w, h, title) {
  fillRoundRect(ctx, x, y, w, h, 15, PANEL, LINE);
  text(ctx, title, x + 14, y + 20, 14, INK);
}

function chartAxes(ctx, x, y, w, h, labels) {
  ctx.save();
  ctx.strokeStyle = "rgba(119,92,52,0.18)";
  ctx.lineWidth = 1;
  for (let index = 0; index <= 3; index += 1) {
    const lineY = y + h * index / 3;
    ctx.beginPath();
    ctx.moveTo(x, lineY);
    ctx.lineTo(x + w, lineY);
    ctx.stroke();
  }
  ctx.restore();
  const step = Math.max(1, Math.ceil(labels.length / 5));
  labels.forEach((label, index) => {
    if (index !== 0 && index !== labels.length - 1 && index % step !== 0) return;
    text(ctx, compactDate(label), x + (labels.length <= 1 ? w / 2 : index * w / (labels.length - 1)), y + h + 12, 9, MUTED, "center");
  });
}

function lineChart(ctx, x, y, w, h, labels, values, color, fill) {
  const safeValues = values.map(value => Number(value) || 0);
  const max = Math.max(1, ...safeValues);
  chartAxes(ctx, x, y, w, h, labels);
  if (!safeValues.length) return;
  ctx.save();
  ctx.beginPath();
  safeValues.forEach((value, index) => {
    const px = x + (safeValues.length <= 1 ? w / 2 : index * w / (safeValues.length - 1));
    const py = y + h - value / max * h;
    if (index === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.beginPath();
  safeValues.forEach((value, index) => {
    const px = x + (safeValues.length <= 1 ? w / 2 : index * w / (safeValues.length - 1));
    const py = y + h - value / max * h;
    if (index === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.2;
  ctx.lineJoin = "round";
  ctx.stroke();
  ctx.restore();
  text(ctx, `峰值 ${max}`, x + w, y - 8, 10, MUTED, "right");
}

function barChart(ctx, x, y, w, h, labels, values, color) {
  const safeValues = values.map(value => Number(value) || 0);
  const max = Math.max(1, ...safeValues);
  chartAxes(ctx, x, y, w, h, labels);
  const gap = 4;
  const barW = Math.max(3, (w - gap * Math.max(0, safeValues.length - 1)) / Math.max(1, safeValues.length));
  safeValues.forEach((value, index) => {
    const barH = value / max * h;
    fillRoundRect(ctx, x + index * (barW + gap), y + h - barH, barW, Math.max(1, barH), Math.min(3, barW / 2), color);
  });
  text(ctx, `峰值 ${max}`, x + w, y - 8, 10, MUTED, "right");
}

function donut(ctx, cx, cy, radius, values, colors) {
  const total = values.reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
  if (!total) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = "#d8c9ad";
    ctx.lineWidth = 12;
    ctx.stroke();
    ctx.restore();
    return;
  }
  let angle = -Math.PI / 2;
  values.forEach((value, index) => {
    const portion = Math.max(0, Number(value) || 0) / total;
    const next = angle + portion * Math.PI * 2;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, angle, next);
    ctx.strokeStyle = colors[index % colors.length];
    ctx.lineWidth = 14;
    ctx.stroke();
    ctx.restore();
    angle = next;
  });
  text(ctx, String(total), cx, cy, 18, INK, "center");
  text(ctx, "对局", cx, cy + 19, 9, MUTED, "center");
}

function legend(ctx, x, y, items) {
  items.forEach((item, index) => {
    const rowY = y + index * 20;
    fillRoundRect(ctx, x, rowY - 6, 9, 9, 3, item.color);
    text(ctx, `${item.label} ${item.value}`, x + 15, rowY, 11, MUTED);
  });
}

function fitText(ctx, value, maxWidth, size = 12) {
  const source = String(value || "-");
  ctx.save();
  ctx.font = `${size}px sans-serif`;
  if (ctx.measureText(source).width <= maxWidth) {
    ctx.restore();
    return source;
  }
  let textValue = source;
  while (textValue.length > 1 && ctx.measureText(`${textValue}…`).width > maxWidth) textValue = textValue.slice(0, -1);
  ctx.restore();
  return `${textValue}…`;
}

function formatMatchTime(value) {
  const timestamp = Number(value) || 0;
  if (!timestamp) return "--:--";
  const date = new Date(timestamp);
  const pad = number => String(number).padStart(2, "0");
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function drawActivePlayers(ctx, x, y, w, stats) {
  const items = playerItems(stats);
  const days = Number(stats?.playerBattles?.windowDays) || 7;
  const height = listPanelHeight(items.length, 52, 52);
  panel(ctx, x, y, w, height, "活跃 Top 玩家对战数据");
  text(ctx, `近 ${days} 天 · 按对局数`, x + w - 14, y + 20, 10, MUTED, "right");
  if (!items.length) {
    text(ctx, "暂无近期开局数据", x + w / 2, y + 76, 12, MUTED, "center");
    return height;
  }
  items.forEach((item, index) => {
    const rowY = y + 37 + index * 52;
    if (index) {
      ctx.save();
      ctx.strokeStyle = "rgba(119,92,52,0.16)";
      ctx.beginPath();
      ctx.moveTo(x + 14, rowY - 3);
      ctx.lineTo(x + w - 14, rowY - 3);
      ctx.stroke();
      ctx.restore();
    }
    const player = item.player || { nickName: "匿名玩家", avatarUrl: "" };
    drawPlayerAvatar(ctx, player, x + 14, rowY + 5, 34);
    fillRoundRect(ctx, x + 39, rowY + 5, 18, 18, 6, index < 3 ? "#315e59" : "#8d6840");
    text(ctx, String(index + 1), x + 48, rowY + 18, 10, "#fff7e8", "center");
    const nameX = x + 64;
    text(ctx, fitText(ctx, player.nickName, w - 168, 13), nameX, rowY + 17, 13, INK);
    text(ctx, `${item.matches || 0} 局`, x + w - 14, rowY + 17, 13, "#315e59", "right");
    text(ctx, `联机 ${item.onlineMatches || 0} · AI ${item.aiMatches || 0}`, nameX, rowY + 36, 10, MUTED);
    text(ctx, `胜 ${item.wins || 0} 负 ${item.losses || 0} 平 ${item.draws || 0} · 胜率 ${item.winRate == null ? "-" : `${item.winRate}%`}`, x + w - 14, rowY + 36, 10, MUTED, "right");
  });
  return height;
}

function drawPlayerAvatar(ctx, player, x, y, size) {
  const fallback = () => {
    fillRoundRect(ctx, x, y, size, size, size / 2, "#d9c39a", "#b28a55");
    text(ctx, String(player?.nickName || "玩").slice(0, 1), x + size / 2, y + size / 2 + 1, 13, INK, "center", "middle");
  };
  if (!drawRemoteImage(ctx, player?.avatarUrl, x, y, size, size, { radius: size / 2, onFail: fallback })) fallback();
}

function drawMoraleDots(ctx, x, y, morale, fill) {
  const count = Math.max(0, Math.min(2, Number(morale) || 0));
  for (let index = 0; index < 2; index += 1) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x + index * 13, y - 4);
    ctx.lineTo(x + index * 13 + 4, y);
    ctx.lineTo(x + index * 13, y + 4);
    ctx.lineTo(x + index * 13 - 4, y);
    ctx.closePath();
    ctx.fillStyle = index < count ? fill : "#d8c9ad";
    ctx.fill();
    ctx.strokeStyle = index < count ? fill : "#bfa77c";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }
}

function roundOutcomeLabel(winner) {
  if (winner === 0) return "胜";
  if (winner === 1) return "负";
  return "平";
}

function drawRoundScore(ctx, detail, x, y, w) {
  const outcome = roundOutcomeLabel(detail?.winner);
  const color = outcome === "胜" ? "#2f6f57" : outcome === "负" ? "#8f3c1f" : "#8d6840";
  const scores = Array.isArray(detail?.scores) ? detail.scores : [0, 0];
  fillRoundRect(ctx, x, y, w, 18, 6, "#fffdf6", "#dfcfac");
  text(ctx, `第${detail?.round || 1}局`, x + 6, y + 13, 9, MUTED);
  text(ctx, `${scores[0] || 0}:${scores[1] || 0}`, x + w - 20, y + 13, 10, INK, "right");
  fillRoundRect(ctx, x + w - 16, y + 4, 11, 10, 4, color);
  text(ctx, outcome, x + w - 10.5, y + 12, 7, "#fff7e8", "center");
}

function drawRecentMatches(ctx, x, y, w, stats) {
  const items = recentItems(stats);
  const height = recentMatchesPanelHeight(items);
  panel(ctx, x, y, w, height, "全服最近对局数据");
  text(ctx, "仅展示已完成对局", x + w - 14, y + 20, 10, MUTED, "right");
  if (!items.length) {
    text(ctx, "暂无已完成对局", x + w / 2, y + 78, 12, MUTED, "center");
    return height;
  }
  let rowY = y + 36;
  items.forEach((item, index) => {
    const rowH = recentMatchRowHeight(item);
    if (index) {
      ctx.save();
      ctx.strokeStyle = "rgba(119,92,52,0.16)";
      ctx.beginPath();
      ctx.moveTo(x + 14, rowY - 4);
      ctx.lineTo(x + w - 14, rowY - 4);
      ctx.stroke();
      ctx.restore();
    }
    const modeColor = item.mode === "online" ? "#8f3c1f" : "#4f6d8a";
    const player = item.player || { nickName: "匿名玩家", avatarUrl: "" };
    const contentX = x + 56;
    const contentW = x + w - 14 - contentX;
    const details = matchRoundDetails(item);
    drawPlayerAvatar(ctx, player, x + 14, rowY + 4, 34);
    text(ctx, fitText(ctx, `${player.nickName || "匿名玩家"} · ${item.difficulty || "普通"} · ${item.deckMode || "随机卡牌"}`, contentW - 52, 12), contentX, rowY + 15, 12, INK);
    text(ctx, item.score || "-", x + w - 14, rowY + 15, 13, modeColor, "right");
    text(ctx, fitText(ctx, item.summary, contentW, 11), contentX, rowY + 33, 11, MUTED);

    const scoreY = rowY + 42;
    const scoreGap = 4;
    const scoreW = (contentW - scoreGap * 2) / 3;
    if (details.length) {
      details.slice(0, 3).forEach((detail, detailIndex) => {
        drawRoundScore(ctx, detail, contentX + detailIndex * (scoreW + scoreGap), scoreY, scoreW);
      });
    } else {
      fillRoundRect(ctx, contentX, scoreY, contentW, 18, 6, "#fffdf6", "#dfcfac");
      text(ctx, "该旧战绩未记录小局比分", contentX + 8, scoreY + 13, 9, MUTED);
    }

    const footerY = scoreY + 32;
    const morale = Array.isArray(item.morale) ? item.morale : [];
    if (morale.length) {
      text(ctx, "军心", contentX, footerY, 9, MUTED);
      drawMoraleDots(ctx, contentX + 27, footerY - 1, morale[0], "#2f6f57");
      drawMoraleDots(ctx, contentX + 57, footerY - 1, morale[1], "#8f3c1f");
    }
    text(ctx, formatMatchTime(item.time), morale.length ? contentX + 88 : contentX, footerY, 10, MUTED);
    text(ctx, `${item.rounds || 0} 小局 · ${item.outcome || "平局"}`, x + w - 14, footerY, 10, modeColor, "right");
    rowY += rowH;
  });
  return height;
}

function drawDashboard(ctx, view, actions, ui, state) {
  const stats = ui.adminStats || {};
  const users = stats.users || {};
  const matches = stats.matches || {};
  const trend = Array.isArray(stats.trend) ? stats.trend : [];
  const x = 18;
  const w = view.width - 36;
  const y = state.listTop - state.scroll;
  const gap = 10;
  const smallW = (w - gap) / 2;

  kpi(ctx, x, y, smallW, "总用户", users.total || 0, "#2f6f57");
  kpi(ctx, x + smallW + gap, y, smallW, "今日活跃", users.activeToday || 0, "#4f6d8a");
  kpi(ctx, x, y + 72, smallW, "近 7 天新增", users.new7 || 0, "#8f3c1f");
  kpi(ctx, x + smallW + gap, y + 72, smallW, "近 30 天活跃", users.active30 || 0, "#7a5a95");

  panel(ctx, x, y + 154, w, 190, "用户使用趋势（近 30 天）");
  const labels = trend.map(item => item.date);
  const active = trend.map(item => item.activeUsers || 0);
  const newUsers = trend.map(item => item.newUsers || 0);
  lineChart(ctx, x + 18, y + 194, w - 36, 94, labels, active, "#2f6f57", "rgba(47,111,87,0.14)");
  text(ctx, "日活（登录后开始统计）", x + 18, y + 318, 10, "#2f6f57");
  text(ctx, `近 30 天新增 ${users.new30 || 0}`, x + w - 18, y + 318, 10, MUTED, "right");

  panel(ctx, x, y + 356, w, 190, "每日新增用户");
  barChart(ctx, x + 18, y + 396, w - 36, 94, labels, newUsers, "#4f6d8a");
  text(ctx, `累计登录 ${users.totalLogins || 0} 次`, x + 18, y + 520, 10, MUTED);

  panel(ctx, x, y + 558, w, 198, "对局与 AI 表现");
  const mode = matches.byMode || {};
  donut(ctx, x + 82, y + 655, 43, [mode.ai || 0, mode.online || 0], ["#4f6d8a", "#8f3c1f"]);
  legend(ctx, x + 150, y + 626, [
    { label: "AI 对局", value: mode.ai || 0, color: "#4f6d8a" },
    { label: "联机对局", value: mode.online || 0, color: "#8f3c1f" },
    { label: "平均小局", value: matches.avgRounds == null ? "-" : matches.avgRounds, color: "#8d6840" }
  ]);
  text(ctx, `AI 胜率 ${matches.aiWinRateOverall == null ? "-" : `${matches.aiWinRateOverall}%`}`, x + 18, y + 730, 12, "#8f3c1f");
  text(ctx, `AI胜 ${matches.aiWins || 0} · 玩家胜 ${matches.playerWins || 0} · 平 ${matches.aiDraws || 0}`, x + w - 18, y + 730, 10, MUTED, "right");

  panel(ctx, x, y + 768, w, 196, "每日对局与 AI 胜率（近 30 天）");
  const matchTotals = trend.map(item => item.total || 0);
  barChart(ctx, x + 18, y + 808, w - 36, 88, labels, matchTotals, "#8f3c1f");
  const rate = trend.map(item => item.aiWinRate == null ? 0 : item.aiWinRate);
  lineChart(ctx, x + 18, y + 926, w - 36, 24, labels, rate, "#7a5a95", "rgba(122,90,149,0.12)");
  text(ctx, "柱：对局数 · 线：AI 胜率（当日有已决 AI 对局时）", x + 18, y + 978, 10, MUTED);

  const playerPanelY = y + 1018;
  const playerPanelH = drawActivePlayers(ctx, x, playerPanelY, w, stats);
  drawRecentMatches(ctx, x, playerPanelY + playerPanelH + 14, w, stats);
}

function draw(ctx, view, actions, ui = {}) {
  clear(ctx, view.width, view.height);
  const state = scrollBounds(view, ui.adminStats);
  state.scroll = clamp(ui.adminStatsScroll || 0, 0, state.maxScroll);
  ui.adminStatsScroll = state.scroll;

  text(ctx, "数据统计", view.width / 2, state.top, 22, INK, "center");
  const updated = ui.adminStats ? `更新于 ${formatUpdatedAt(ui.adminStats.updatedAt)}` : "";
  text(ctx, ui.adminStatsLoading ? "正在汇总云端数据…" : (ui.adminStatsError || updated), view.width / 2, state.top + 26, 11, ui.adminStatsError ? "#9f3b24" : MUTED, "center");

  if (ui.adminStats) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, state.listTop, view.width, state.viewportH);
    ctx.clip();
    drawDashboard(ctx, view, actions, ui, state);
    ctx.restore();
    if (state.scroll < state.maxScroll - 0.5) {
      ctx.save();
      const fade = ctx.createLinearGradient ? ctx.createLinearGradient(0, state.listBottom - 28, 0, state.listBottom) : null;
      if (fade) {
        fade.addColorStop(0, "rgba(247,241,229,0)");
        fade.addColorStop(1, "rgba(247,241,229,0.95)");
        ctx.fillStyle = fade;
      } else ctx.fillStyle = "rgba(247,241,229,0.88)";
      ctx.fillRect(0, state.listBottom - 28, view.width, 28);
      ctx.restore();
    }
    if (state.maxScroll > 0) {
      const trackX = view.width - 9;
      const trackY = state.listTop + 4;
      const trackH = Math.max(24, state.viewportH - 8);
      const thumbH = Math.max(30, trackH * state.viewportH / state.contentH);
      const thumbY = trackY + (trackH - thumbH) * (state.scroll / state.maxScroll);
      fillRoundRect(ctx, trackX, trackY, 3, trackH, 1.5, "rgba(119,92,52,0.16)");
      fillRoundRect(ctx, trackX, thumbY, 3, thumbH, 1.5, "rgba(47,111,87,0.76)");
    }
  } else {
    fillRoundRect(ctx, 24, state.listTop + 26, view.width - 48, 112, 16, PANEL, LINE);
    wrapText(ctx, ui.adminStatsError || "正在读取数据统计…", 42, state.listTop + 72, view.width - 84, 20, 2, 13, ui.adminStatsError ? "#9f3b24" : MUTED);
  }

  const back = { id: "backAdminStats", x: 18, y: state.bottom, w: view.width - 36, h: 40 };
  actions.push(back);
  button(ctx, { ...back, label: "返回首页", size: 12, fill: "#8d6840" });
}

module.exports = { draw, scrollBounds };
