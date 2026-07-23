const { clear, text, button, fillRoundRect, drawAssetImage, drawRemoteImage } = require("../ui/canvas");
const { loadSettings, getActiveCustomDeckIds } = require("../core/storage");
const { FACTION_LABELS, DIFFICULTY_LABELS, deckStatus, leadersFor, displayName } = require("../core/cards");

const LOGO_SRC = "assets/po-ke-card.png";
const FONT_STACK = "\"PingFang SC\", \"Hiragino Sans GB\", \"Microsoft YaHei\", sans-serif";

function drawArcTentacle(ctx, startX, startY, cp1X, cp1Y, cp2X, cp2Y, endX, endY) {
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.bezierCurveTo(cp1X, cp1Y, cp2X, cp2Y, endX, endY);
  ctx.stroke();
}

function drawCrackedOctopus(ctx, x, y, scale, alpha) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = "#8d6840";
  ctx.fillStyle = "rgba(141,104,64,0.07)";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.beginPath();
  ctx.moveTo(0, -42);
  ctx.bezierCurveTo(27, -42, 36, -14, 28, 8);
  ctx.bezierCurveTo(22, 26, 9, 34, 0, 34);
  ctx.bezierCurveTo(-9, 34, -22, 26, -28, 8);
  ctx.bezierCurveTo(-36, -14, -27, -42, 0, -42);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#8d6840";
  ctx.beginPath();
  ctx.arc(-10, -8, 2.8, 0, Math.PI * 2);
  ctx.arc(10, -8, 2.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 5, 8, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();

  drawArcTentacle(ctx, -22, 18, -52, 16, -50, 48, -24, 44);
  drawArcTentacle(ctx, -12, 27, -40, 42, -30, 68, -8, 52);
  drawArcTentacle(ctx, -3, 31, -18, 52, -8, 72, 3, 56);
  drawArcTentacle(ctx, 3, 31, 18, 52, 8, 72, -3, 56);
  drawArcTentacle(ctx, 12, 27, 40, 42, 30, 68, 8, 52);
  drawArcTentacle(ctx, 22, 18, 52, 16, 50, 48, 24, 44);
  drawArcTentacle(ctx, -28, 6, -55, -4, -64, 18, -44, 22);
  drawArcTentacle(ctx, 28, 6, 55, -4, 64, 18, 44, 22);

  ctx.restore();
}

function drawHomeBackground(ctx, view) {
  const panelY = Math.max(94, view.safeTop + 82);
  const panelH = view.height - panelY - view.safeBottom - 12;
  ctx.save();
  fillRoundRect(ctx, 12, panelY, view.width - 24, panelH, 24, "rgba(255,250,240,0.58)", "rgba(216,189,131,0.55)");
  ctx.strokeStyle = "rgba(141,104,64,0.18)";
  ctx.lineWidth = 1;
  ctx.strokeRect(22, panelY + 12, view.width - 44, Math.max(0, panelH - 24));
  drawCrackedOctopus(ctx, view.width / 2, panelY + 214, 1.55, 0.055);
  drawCrackedOctopus(ctx, 56, panelY + 72, 0.46, 0.18);
  drawCrackedOctopus(ctx, view.width - 58, panelY + 74, 0.44, 0.16);
  drawCrackedOctopus(ctx, 58, view.height - view.safeBottom - 72, 0.56, 0.15);
  drawCrackedOctopus(ctx, view.width - 58, view.height - view.safeBottom - 64, 0.42, 0.14);
  ctx.restore();
}

function drawTitle(ctx, content, x, y, size) {
  ctx.save();
  ctx.fillStyle = "#111111";
  ctx.font = `700 ${size}px ${FONT_STACK}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(content, x, y);
  ctx.restore();
}

function drawLogo(ctx, view, x, y, size) {
  ctx.save();
  ctx.shadowColor = "rgba(48,35,18,0.20)";
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 7;
  fillRoundRect(ctx, x, y, size, size, Math.floor(size * 0.24), "#fffdf2", "rgba(255,255,255,0.92)");
  ctx.restore();
  drawAssetImage(ctx, LOGO_SRC, x, y, size, size, { radius: Math.floor(size * 0.24), fit: "cover", placeholder: false });
}

function drawSummaryCard(ctx, view, actions, y, h, save, settings, latest, ui = {}) {
  const summaryRect = { id: "history", x: 26, y, w: view.width - 52, h };
  actions.push(summaryRect);
  ctx.save();
  ctx.shadowColor = "rgba(48,35,18,0.12)";
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 4;
  fillRoundRect(ctx, summaryRect.x, summaryRect.y, summaryRect.w, summaryRect.h, 18, "rgba(255,250,240,0.94)", "#dcc48d");
  ctx.restore();
  const tight = h < 90;
  const historyReady = !!ui.cloudHistoryLoaded;
  if (!historyReady) {
    text(ctx, ui.cloudHistoryError ? "战绩加载失败" : "正在读取云端战绩…", view.width / 2, y + (tight ? 17 : 24), tight ? 13 : 15, "#2f2417", "center");
    text(ctx, ui.cloudHistoryError || "数据加载完成后将显示真实战绩", view.width / 2, y + (tight ? 43 : 58), 11, "#775c34", "center");
  } else {
    text(ctx, `已试玩 ${save.matches || 0} 局，胜利 ${save.wins || 0} 局`, view.width / 2, y + (tight ? 17 : 24), tight ? 13 : 15, "#2f2417", "center");
    if (latest) {
      text(ctx, latestMatchLine(latest), view.width / 2, y + (tight ? 38 : 52), 12, resultColor(latest), "center");
      text(ctx, latestMatchDetail(latest), view.width / 2, y + (tight ? 56 : 76), 10, "#775c34", "center");
    } else {
      text(ctx, currentSettingsLine(settings), view.width / 2, y + (tight ? 38 : 52), 11, "#775c34", "center");
      text(ctx, tight ? "点击查看战绩" : "完成一局后，这里会显示最近一局对局信息", view.width / 2, y + (tight ? 56 : 76), 10, "#8d6840", "center");
    }
  }
  if (!tight) {
    fillRoundRect(ctx, view.width - 126, y + h - 32, 84, 24, 12, "#fff5df", "#dcc48d");
    text(ctx, "查看战绩 ›", view.width - 84, y + h - 20, 11, "#8f3c1f", "center");
  }
}

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
  if (item.winner === 0) return "#2f6f57";
  if (item.winner == null) return "#6b6b5f";
  return "#8f3c1f";
}

function cloudHistory(ui = {}) {
  return Array.isArray(ui.cloudHistoryRecords) ? ui.cloudHistoryRecords : [];
}

function historySummary(history) {
  const matches = history.length;
  const wins = history.filter(item => item.winner === 0).length;
  const draws = history.filter(item => item.winner == null).length;
  const losses = Math.max(0, matches - wins - draws);
  return { matches, wins, losses, draws };
}

function latestMatchLine(item) {
  if (!item) return "";
  const title = item.resultText || (item.endReason === "surrender" ? "认输" : "已结束");
  return `最近一局：${title} · ${formatTime(item.time)}`;
}

function latestMatchDetail(item) {
  if (!item) return "";
  const difficulty = DIFFICULTY_LABELS[item.difficulty] || item.difficulty || "普通";
  const rounds = `小局 ${item.rounds?.[0] || 0}:${item.rounds?.[1] || 0}`;
  const scores = Array.isArray(item.scores) ? `终分 ${item.scores[0] || 0}:${item.scores[1] || 0}` : "";
  return `${item.humanFaction || "你"} vs ${item.aiFaction || "系统"} · ${difficulty} · ${rounds}${scores ? ` · ${scores}` : ""}`;
}

function currentSettingsLine(settings) {
  const faction = settings.humanFaction;
  const leaders = leadersFor(faction);
  const leader = leaders.find(card => card.id === settings.humanLeaderIds?.[faction]) || leaders[0];
  const status = deckStatus(getActiveCustomDeckIds(settings, faction), faction);
  const deckText = status.valid ? `${status.total}张自定义 · 总分${status.score}` : (status.total ? `${status.total}张未完成 · 总分${status.score}` : "随机卡牌");
  return `我的牌组：${FACTION_LABELS[faction]} · ${leader ? displayName(leader) : "未选领袖"} · ${deckText}`;
}

function menuLayout(view) {
  const compact = view.height < 700;
  const top = view.safeTop + (compact ? 8 : 18);
  const logoSize = compact ? 78 : 96;
  const logoX = (view.width - logoSize) / 2;
  const titleY = top + logoSize + (compact ? 26 : 34);
  const summaryY = top + logoSize + (compact ? 58 : 72);
  const summaryH = compact ? 104 : 116;
  const buttonH = compact ? 40 : 44;
  const gap = view.height < 620 ? 44 : 50;
  const buttonY0 = summaryY + summaryH + (compact ? 18 : 22);
  return { compact, top, logoSize, logoX, titleY, summaryY, summaryH, buttonH, gap, buttonY0 };
}

function draw(ctx, view, actions, ui = {}) {
  clear(ctx, view.width, view.height);
  drawHomeBackground(ctx, view);
  const settings = loadSettings();
  const records = cloudHistory(ui);
  const save = historySummary(records);
  const latest = records[0];
  const layout = menuLayout(view);
  drawLogo(ctx, view, layout.logoX, layout.top, layout.logoSize);
  drawTitle(ctx, "来盘章鱼牌吧", view.width / 2, layout.titleY, layout.compact ? 30 : 38);

  // 用户头像与昵称：未授权时使用游戏主题的「章鱼隐士」与章鱼印记
  const avatarSize = 34;
  const avatarX = 16;
  const avatarY = view.safeTop + 10;
  const user = ui.authUser || {};
  const fallbackAvatar = () => {
    const cx = avatarX + avatarSize / 2, cy = avatarY + avatarSize / 2, r = avatarSize / 2;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r - 0.5, 0, Math.PI * 2);
    ctx.fillStyle = "#315e59";
    ctx.fill();
    ctx.strokeStyle = "#e5c27e";
    ctx.lineWidth = 1.2;
    ctx.stroke();
    // 章鱼头与触手组成的游戏主题默认头像
    ctx.fillStyle = "#e5b65d";
    ctx.beginPath();
    ctx.ellipse(cx, cy - 3.5, 8, 7, 0, Math.PI, 0, true);
    ctx.fill();
    ctx.strokeStyle = "#e5b65d";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    [[-6, 4, -8, 10], [-2, 5, -3, 11], [2, 5, 3, 11], [6, 4, 8, 10]].forEach(([sx, sy, ex, ey]) => {
      ctx.beginPath();
      ctx.moveTo(cx + sx, cy + sy);
      ctx.quadraticCurveTo(cx + sx * 1.25, cy + 7, cx + ex, cy + ey);
      ctx.stroke();
    });
    ctx.fillStyle = "#315e59";
    ctx.beginPath();
    ctx.arc(cx - 3, cy - 4, 1.2, 0, Math.PI * 2);
    ctx.arc(cx + 3, cy - 4, 1.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };
  if (!drawRemoteImage(ctx, user.avatarUrl, avatarX, avatarY, avatarSize, avatarSize, { radius: avatarSize / 2, onFail: fallbackAvatar })) fallbackAvatar();
  const nickName = user.nickName || "章鱼隐士";
  const nickX = avatarX + avatarSize + 8;
  text(ctx, nickName, nickX, avatarY + avatarSize / 2 + 1, 13, "#4a3826", "left", "middle");
  if (ui.profileAuthGuide) {
    fillRoundRect(ctx, avatarX + 2, avatarY + avatarSize + 6, 140, 26, 13, "#fff7e8", "#d9c39a");
    text(ctx, "点击头像授权", avatarX + 72, avatarY + avatarSize + 19, 12, "#4a3826", "center", "middle");
  }
  // 点击头像/昵称区域：首次触发授权，之后打开资料编辑
  actions.push({ id: "openProfile", x: avatarX, y: avatarY, w: avatarSize + 160, h: ui.profileAuthGuide ? avatarSize + 36 : avatarSize + 4 });
  if (ui.isAdmin) {
    ctx.save();
    ctx.font = `13px ${FONT_STACK}`;
    const nickWidth = ctx.measureText(nickName).width;
    ctx.restore();
    const iconSize = 24;
    const iconX = Math.min(view.width - iconSize - 14, nickX + nickWidth + 9);
    const iconY = avatarY + (avatarSize - iconSize) / 2;
    fillRoundRect(ctx, iconX, iconY, iconSize, iconSize, 7, "#315e59", "#e5c27e");
    ctx.save();
    ctx.strokeStyle = "#fff4d8";
    ctx.lineWidth = 1.7;
    ctx.lineCap = "round";
    [[6, 15, 6, 11], [12, 15, 12, 7], [18, 15, 18, 10]].forEach(([x, bottom, x2, top]) => {
      ctx.beginPath();
      ctx.moveTo(iconX + x, iconY + bottom);
      ctx.lineTo(iconX + x2, iconY + top);
      ctx.stroke();
    });
    ctx.restore();
    actions.push({ id: "adminStats", x: iconX - 4, y: iconY - 4, w: iconSize + 8, h: iconSize + 8 });
  }

  drawSummaryCard(ctx, view, actions, layout.summaryY, layout.summaryH, save, settings, latest, ui);

  const labels = [
    ["start", "单机对战", "#2f6f57"],
    ["pvp", "联网对战", "#8f3c1f"],
    ["settings", "我的牌组", "#8d6840"],
    ["rules", "使用说明", "#7a5a95"]
  ];
  labels.forEach((item, index) => {
    const rect = { id: item[0], x: 46, y: layout.buttonY0 + index * layout.gap, w: view.width - 92, h: layout.buttonH };
    actions.push(rect);
    button(ctx, { ...rect, label: item[1], fill: item[2], stroke: "#4b3d2d", size: 15 });
  });
}

module.exports = { draw };
