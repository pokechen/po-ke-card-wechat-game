const { clear, text, button, fillRoundRect, drawAssetImage } = require("../ui/canvas");
const { loadSave, loadSettings, getActiveCustomDeckIds } = require("../core/storage");
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

function drawSummaryCard(ctx, view, actions, y, h, save, settings, latest) {
  const summaryRect = { id: "history", x: 26, y, w: view.width - 52, h };
  actions.push(summaryRect);
  ctx.save();
  ctx.shadowColor = "rgba(48,35,18,0.12)";
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 4;
  fillRoundRect(ctx, summaryRect.x, summaryRect.y, summaryRect.w, summaryRect.h, 18, "rgba(255,250,240,0.94)", "#dcc48d");
  ctx.restore();
  text(ctx, `已试玩 ${save.matches || 0} 局，胜利 ${save.wins || 0} 局`, view.width / 2, y + 24, 15, "#2f2417", "center");
  if (latest) {
    text(ctx, latestMatchLine(latest), view.width / 2, y + 52, 12, resultColor(latest), "center");
    text(ctx, latestMatchDetail(latest), view.width / 2, y + 76, 11, "#775c34", "center");
  } else {
    text(ctx, currentSettingsLine(settings), view.width / 2, y + 52, 12, "#775c34", "center");
    text(ctx, "完成一局后，这里会显示最近一局对局信息", view.width / 2, y + 76, 11, "#8d6840", "center");
  }
  fillRoundRect(ctx, view.width - 126, y + h - 32, 84, 24, 12, "#fff5df", "#dcc48d");
  text(ctx, "查看战绩 ›", view.width - 84, y + h - 20, 11, "#8f3c1f", "center");
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
  const deckText = status.valid ? `${status.total}张自定义` : (status.total ? `${status.total}张未完成` : "随机卡牌");
  return `我的牌组：${FACTION_LABELS[faction]} · ${leader ? displayName(leader) : "未选领袖"} · ${deckText}`;
}

function draw(ctx, view, actions) {
  clear(ctx, view.width, view.height);
  drawHomeBackground(ctx, view);
  const save = loadSave();
  const settings = loadSettings();
  const latest = (save.history || [])[0];
  const compact = view.height < 700;
  const top = view.safeTop + (compact ? 8 : 18);
  const logoSize = compact ? 78 : 96;
  const logoX = (view.width - logoSize) / 2;
  drawLogo(ctx, view, logoX, top, logoSize);
  drawTitle(ctx, "来盘章鱼牌吧", view.width / 2, top + logoSize + (compact ? 26 : 34), compact ? 30 : 38);

  const summaryY = top + logoSize + (compact ? 58 : 72);
  const summaryH = compact ? 104 : 116;
  drawSummaryCard(ctx, view, actions, summaryY, summaryH, save, settings, latest);

  const labels = [
    ["start", "开始单机", "#2f6f57"],
    ["pvp", "联网对战", "#8f3c1f"],
    ["settings", "我的牌组", "#8d6840"],
    ["cards", "卡牌图鉴", "#4f6d8a"],
    ["rules", "使用说明", "#7a5a95"]
  ];
  const buttonH = compact ? 40 : 44;
  const gap = view.height < 620 ? 44 : 50;
  const y0 = summaryY + summaryH + (compact ? 16 : 24);
  labels.forEach((item, index) => {
    const rect = { id: item[0], x: 46, y: y0 + index * gap, w: view.width - 92, h: buttonH };
    actions.push(rect);
    button(ctx, { ...rect, label: item[1], fill: item[2], stroke: "#4b3d2d", size: 15 });
  });
}

module.exports = { draw };
