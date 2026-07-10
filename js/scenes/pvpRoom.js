const { clear, text, button, fillRoundRect, wrapText, short } = require("../ui/canvas");
const { FACTION_LABELS, cardById, displayName } = require("../core/cards");

function statusText(pvp) {
  if (pvp.loading) return "正在连接云端房间...";
  if (pvp.error) return pvp.error;
  if (!pvp.roomId) return "请选择创建房间，或输入好友给你的房间号加入。";
  if (pvp.room?.status === "playing") return "好友已加入，即将开始对战";
  if (pvp.room?.status === "finished") return "本局已结束";
  return "等待好友加入房间";
}

const ERROR_PREVIEW_LINES = 5;

function playerSetupText(player, fallbackName) {
  if (!player) return `${fallbackName}：等待加入`;
  const faction = FACTION_LABELS[player.faction] || player.faction || "未选阵营";
  const leader = cardById(player.leaderId);
  const leaderName = leader ? displayName(leader) : "随机主将";
  const deckMode = player.customDeckIds && player.customDeckIds.length ? `自定义${player.customDeckIds.length}张` : "随机卡牌";
  return `${player.name || fallbackName}：${short(faction, 5)} · ${short(leaderName, 7)} · ${deckMode}`;
}

function errorMetrics(err, panelW) {
  const lineH = 16;
  const paddingX = 26;
  const textW = panelW - (paddingX * 2);
  const estimatedLines = Math.max(3, Math.ceil(String(err || "").length / (textW / 8)));
  const maxLines = Math.min(ERROR_PREVIEW_LINES, estimatedLines);
  return {
    lineH,
    paddingX,
    textW,
    maxLines,
    truncated: estimatedLines > maxLines,
    boxH: Math.max(88, maxLines * lineH + 58)
  };
}

function drawErrorPanel(ctx, view, actions, panel, pvp) {
  const err = pvp.error || "";
  const metrics = errorMetrics(err, panel.w);
  fillRoundRect(ctx, panel.x + 14, panel.y + 116, panel.w - 28, metrics.boxH, 10, "rgba(193, 57, 43, 0.08)", "rgba(193, 57, 43, 0.25)");
  text(ctx, "联机错误，复制错误信息便于排查", panel.x + metrics.paddingX, panel.y + 134, 12, "#8f3c1f", "left");
  wrapText(ctx, err, panel.x + metrics.paddingX, panel.y + 154, metrics.textW, metrics.lineH, metrics.maxLines, 11, "#c0392b");
  if (metrics.truncated) text(ctx, "完整错误请点击下方按钮复制", panel.x + metrics.paddingX, panel.y + 116 + metrics.boxH - 16, 11, "#8f3c1f", "left");
  return metrics.boxH;
}

function draw(ctx, view, actions, pvp = {}) {
  clear(ctx, view.width, view.height);
  const top = view.safeTop + 64;
  text(ctx, "联网对战", view.width / 2, top, 28, "#2f2417", "center");
  text(ctx, "创建房间邀请好友，或输入房间号加入", view.width / 2, top + 34, 12, "#775c34", "center");

  const roomId = String(pvp.roomId || "").replace(/\D/g, "").slice(0, 4);
  const hasError = !!pvp.error;
  const basePanelH = 210;
  const errorBoxH = hasError ? errorMetrics(pvp.error, view.width - 48).boxH : 0;
  const panelH = hasError ? 136 + errorBoxH : basePanelH;
  const panel = { x: 24, y: top + 78, w: view.width - 48, h: panelH };
  fillRoundRect(ctx, panel.x, panel.y, panel.w, panel.h, 18, "#fffaf0", "#dcc48d");
  text(ctx, roomId ? "房间号" : "联网对战", view.width / 2, panel.y + 34, 13, "#775c34", "center");
  text(ctx, roomId || "准备开始", view.width / 2, panel.y + 78, roomId ? 34 : 28, "#8f3c1f", "center");

  if (hasError) {
    drawErrorPanel(ctx, view, actions, panel, pvp);
  } else {
    wrapText(ctx, statusText(pvp), panel.x + 22, panel.y + 116, panel.w - 44, 20, 2, 13, pvp.error ? "#c0392b" : "#2f6f57");
    const players = pvp.room?.players || [];
    if (roomId && players.length) {
      text(ctx, playerSetupText(players[0], "玩家一"), panel.x + 22, panel.y + 164, 11, "#775c34");
      text(ctx, playerSetupText(players[1], "玩家二"), panel.x + 22, panel.y + 184, 11, "#775c34");
    } else {
      const seat = pvp.playerIndex === 1 ? "你是玩家二" : "你是玩家一";
      text(ctx, roomId ? seat : "", view.width / 2, panel.y + 184, 12, "#775c34", "center");
    }
  }

  const y0 = panel.y + panel.h + 36;
  if (!roomId) {
    const create = { id: "pvpCreate", x: 46, y: y0, w: view.width - 92, h: 46 };
    const join = { id: "pvpJoin", x: 46, y: y0 + 56, w: view.width - 92, h: 42 };
    const copyError = hasError ? { id: "pvpCopyError", x: 46, y: y0 + 108, w: view.width - 92, h: 42 } : null;
    const back = { id: "pvpBack", x: 46, y: y0 + (hasError ? 160 : 108), w: view.width - 92, h: 42 };
    actions.push(create, join, back);
    if (copyError) actions.push(copyError);
    button(ctx, { ...create, label: "开房间邀请好友", fill: "#2f6f57", stroke: "#1d4f3c", size: 14 });
    button(ctx, { ...join, label: "输入房间号加入", fill: "#4f6d8a", stroke: "#36516a", size: 13 });
    if (copyError) button(ctx, { ...copyError, label: "复制错误信息", fill: "#8f3c1f", stroke: "#6d2d18", size: 12 });
    button(ctx, { ...back, label: "返回首页", fill: "#8d6840", stroke: "#6f4d29", size: 13 });
    return;
  }

  const share = { id: "pvpShare", x: 46, y: y0, w: view.width - 92, h: 42 };
  const copy = { id: "pvpCopy", x: 46, y: y0 + 52, w: view.width - 92, h: 40 };
  const copyError = hasError ? { id: "pvpCopyError", x: 46, y: y0 + 100, w: view.width - 92, h: 40 } : null;
  const back = { id: "pvpBack", x: 46, y: y0 + (hasError ? 148 : 100), w: view.width - 92, h: 40 };
  actions.push(share, copy, back);
  if (copyError) actions.push(copyError);
  button(ctx, { ...share, label: "右上角转发给好友", fill: "#2f6f57", stroke: "#1d4f3c", size: 13 });
  button(ctx, { ...copy, label: "复制房间号", fill: "#b5892f", stroke: "#8f6b20", size: 12 });
  if (copyError) button(ctx, { ...copyError, label: "复制错误信息", fill: "#8f3c1f", stroke: "#6d2d18", size: 12 });
  button(ctx, { ...back, label: "返回首页", fill: "#8d6840", stroke: "#6f4d29", size: 12 });
}

module.exports = { draw };
