const { clear, text, button, fillRoundRect, wrapText, short } = require("../ui/canvas");
const { FACTION_KEYS, FACTION_LABELS, cardById, displayName } = require("../core/cards");

const ERROR_PREVIEW_LINES = 5;

function rulesOf(room = {}) {
  const source = room && typeof room === "object" ? room : {};
  const rules = source.rules && typeof source.rules === "object" ? source.rules : {};
  const faction = FACTION_KEYS.includes(rules.faction) ? rules.faction : FACTION_KEYS[0];
  return {
    factionMode: rules.factionMode === "fixed" ? "fixed" : "any",
    faction,
    deckMode: rules.deckMode === "autoOnly" ? "autoOnly" : "any"
  };
}

function ruleText(room) {
  const rules = rulesOf(room);
  const faction = rules.factionMode === "fixed" ? `指定${FACTION_LABELS[rules.faction] || rules.faction}` : "不限";
  const deck = rules.deckMode === "autoOnly" ? "仅自动卡牌" : "不限，可自定义/自动";
  return `规则：阵营${faction}；卡牌${deck}`;
}

function statusText(pvp) {
  if (pvp.loading) return "正在连接云端房间...";
  if (pvp.error) return pvp.error;
  if (!pvp.roomId) return "请选择创建房间，或输入好友给你的房间号加入。";
  if (pvp.room?.status === "selecting") return "已开始选择卡牌，双方确认后自动进入对战。";
  if (pvp.room?.status === "playing") return "对战进行中";
  if (pvp.room?.status === "finished") return "本局已结束，可返回房间再开一局。";
  const players = pvp.room?.players || [];
  if (players.length < 2) return "等待好友加入。好友打开分享卡片后，点「联网对战」并输入上方房间号。";
  return players[1]?.ready ? "好友已准备，房主可开始选择卡牌。" : "好友查看规则后点击准备，房主随后开始。";
}

function playerSetupText(player, fallbackName, status) {
  if (!player) return `${fallbackName}：等待加入`;
  const faction = FACTION_LABELS[player.faction] || player.faction || "未选阵营";
  const leader = cardById(player.leaderId);
  const leaderName = leader ? displayName(leader) : "随机主将";
  const deckMode = player.customDeckIds && player.customDeckIds.length ? `自定义${player.customDeckIds.length}张` : "自动卡牌";
  const flag = status === "selecting" ? (player.setupReady ? "已确认" : "选择中") : (player.ready ? "已准备" : "未准备");
  return `${player.name || fallbackName}：${short(faction, 5)} · ${short(leaderName, 7)} · ${deckMode} · ${flag}`;
}

function errorMetrics(err, panelW) {
  const lineH = 16;
  const paddingX = 26;
  const textW = panelW - (paddingX * 2);
  const estimatedLines = Math.max(3, Math.ceil(String(err || "").length / (textW / 8)));
  const maxLines = Math.min(ERROR_PREVIEW_LINES, estimatedLines);
  return { lineH, paddingX, textW, maxLines, truncated: estimatedLines > maxLines, boxH: Math.max(88, maxLines * lineH + 58) };
}

function drawErrorPanel(ctx, view, actions, panel, pvp) {
  const err = pvp.error || "";
  const metrics = errorMetrics(err, panel.w);
  fillRoundRect(ctx, panel.x + 14, panel.y + 128, panel.w - 28, metrics.boxH, 10, "rgba(193, 57, 43, 0.08)", "rgba(193, 57, 43, 0.25)");
  text(ctx, "联机错误，复制错误信息便于排查", panel.x + metrics.paddingX, panel.y + 146, 12, "#8f3c1f", "left");
  wrapText(ctx, err, panel.x + metrics.paddingX, panel.y + 166, metrics.textW, metrics.lineH, metrics.maxLines, 11, "#c0392b");
  if (metrics.truncated) text(ctx, "完整错误请点击下方按钮复制", panel.x + metrics.paddingX, panel.y + 128 + metrics.boxH - 16, 11, "#8f3c1f", "left");
}

function drawRuleRow(ctx, actions, rect, label, editable) {
  if (editable) actions.push(rect);
  button(ctx, { ...rect, label, fill: editable ? "#fffaf0" : "#f2ead8", stroke: "#dcc48d", color: editable ? "#3b2b18" : "#775c34", size: 11, shadow: false });
}

function factionRuleOptions() {
  return [{ value: "any", label: "不限" }].concat(FACTION_KEYS.map(value => ({ value, label: FACTION_LABELS[value] || value })));
}

function drawFactionRuleDropdown(ctx, view, actions, anchor, rules) {
  if (!anchor) return;
  const options = factionRuleOptions();
  const selected = rules.factionMode === "fixed" ? rules.faction : "any";
  const itemH = 34;
  const menuH = options.length * itemH;
  const menuX = Math.max(8, Math.min(anchor.x, view.width - anchor.w - 8));
  const menuY = Math.min(anchor.y + anchor.h + 6, view.height - view.safeBottom - menuH - 8);
  actions.push({ id: "closePvpRoomRuleDropdown", x: 0, y: 0, w: view.width, h: view.height });
  ctx.save();
  ctx.fillStyle = "rgba(38, 28, 18, 0.18)";
  ctx.fillRect(0, 0, view.width, view.height);
  ctx.restore();
  fillRoundRect(ctx, menuX, menuY, anchor.w, menuH, 12, "#fffaf0", "#2f6f57");
  options.forEach((option, index) => {
    const y = menuY + index * itemH;
    const active = option.value === selected;
    actions.push({ id: "selectPvpRoomRuleFaction", value: option.value, x: menuX, y, w: anchor.w, h: itemH });
    if (active) fillRoundRect(ctx, menuX + 4, y + 3, anchor.w - 8, itemH - 6, 9, "#2f6f57");
    else if (index > 0) {
      ctx.strokeStyle = "rgba(119, 92, 52, 0.2)";
      ctx.beginPath();
      ctx.moveTo(menuX + 10, y);
      ctx.lineTo(menuX + anchor.w - 10, y);
      ctx.stroke();
    }
    text(ctx, short(option.label, 18), menuX + anchor.w / 2, y + itemH / 2, 12, active ? "#ffffff" : "#2f2417", "center");
  });
}

function drawShareGuideOverlay(ctx, view, actions, roomId) {
  actions.push({ id: "closePvpShareGuide", x: 0, y: 0, w: view.width, h: view.height });
  ctx.save();
  ctx.fillStyle = "rgba(24, 18, 12, 0.55)";
  ctx.fillRect(0, 0, view.width, view.height);

  // 右上角菜单按钮区域高亮
  const menuW = 92;
  const menuH = 38;
  const menuX = view.width - menuW - 10;
  const menuY = view.safeTop + 8;
  fillRoundRect(ctx, menuX - 8, menuY - 8, menuW + 16, menuH + 16, 26, "rgba(255, 247, 216, 0.10)", "rgba(255, 216, 106, 0.70)");
  fillRoundRect(ctx, menuX, menuY, menuW, menuH, 20, "rgba(255, 247, 216, 0.16)", "rgba(255, 247, 216, 0.62)");
  text(ctx, "···", menuX + 28, menuY + 18, 22, "#fff7d8", "center");
  text(ctx, "◎", menuX + 70, menuY + 19, 18, "#fff7d8", "center");

  // 分享卡片暂不能稳定携带参数，明确提示好友按房间号手动加入。
  const tipText = "记住房间号，再点击「···」转发";
  ctx.font = "14px sans-serif";
  const textMetrics = ctx.measureText(tipText);
  const tipW = Math.max(textMetrics.width + 32, 240);
  const tipH = 42;
  const tipX = (view.width - tipW) / 2;
  const tipY = menuY + menuH + 20;

  fillRoundRect(ctx, tipX, tipY, tipW, tipH, 21, "rgba(255, 248, 225, 0.96)", "rgba(255, 216, 106, 0.95)");
  text(ctx, tipText, tipX + tipW / 2, tipY + tipH / 2 + 1, 14, "#5f4727", "center");

  // 绘制曲线箭头：从提示框右上角弯曲指向右上角 ··· 按钮
  ctx.strokeStyle = "rgba(255, 180, 60, 0.9)";
  ctx.lineWidth = 2.4;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const arrowStartX = tipX + tipW - 30;
  const arrowStartY = tipY + 6;
  const arrowEndX = menuX + menuW / 2 + 12;
  const arrowEndY = menuY + menuH - 2;

  ctx.beginPath();
  ctx.moveTo(arrowStartX, arrowStartY);
  ctx.quadraticCurveTo(
    arrowStartX + (arrowEndX - arrowStartX) * 0.6,
    arrowEndY - (tipY + tipH - arrowEndY) * 0.3,
    arrowEndX,
    arrowEndY
  );
  ctx.stroke();

  // 箭头头部
  const arrowHeadLen = 8;
  const angle = Math.atan2(arrowEndY - (arrowEndY - 6), arrowEndX - (arrowEndX - 6));
  ctx.beginPath();
  ctx.moveTo(arrowEndX, arrowEndY);
  ctx.lineTo(
    arrowEndX - arrowHeadLen * Math.cos(angle - Math.PI / 5),
    arrowEndY - arrowHeadLen * Math.sin(angle - Math.PI / 5)
  );
  ctx.moveTo(arrowEndX, arrowEndY);
  ctx.lineTo(
    arrowEndX - arrowHeadLen * Math.cos(angle + Math.PI / 5),
    arrowEndY - arrowHeadLen * Math.sin(angle + Math.PI / 5)
  );
  ctx.stroke();

  const panelW = Math.min(view.width - 44, 330);
  const panelH = 246;
  const panelX = (view.width - panelW) / 2;
  const panelY = Math.min(view.height - view.safeBottom - panelH - 92, Math.max(view.safeTop + 150, Math.floor(view.height * 0.32)));
  actions.push({ id: "pvpShareGuidePanel", x: panelX, y: panelY, w: panelW, h: panelH });
  fillRoundRect(ctx, panelX, panelY, panelW, panelH, 22, "rgba(255, 250, 240, 0.98)", "rgba(255, 216, 106, 0.92)");
  fillRoundRect(ctx, panelX + 16, panelY + 16, 48, 48, 24, "rgba(47, 111, 87, 0.12)", "rgba(47, 111, 87, 0.26)");
  text(ctx, "↗", panelX + 40, panelY + 40, 24, "#2f6f57", "center");
  text(ctx, "把房间号发给好友", panelX + 78, panelY + 28, 18, "#2f2417");
  text(ctx, "好友打开后需要手动输入", panelX + 78, panelY + 52, 12, "#775c34");

  const roomChip = { x: panelX + 20, y: panelY + 78, w: panelW - 40, h: 42 };
  fillRoundRect(ctx, roomChip.x, roomChip.y, roomChip.w, roomChip.h, 21, "rgba(47, 111, 87, 0.08)", "rgba(47, 111, 87, 0.28)");
  text(ctx, `房间号 ${roomId}`, roomChip.x + roomChip.w / 2, roomChip.y + 21, 18, "#2f6f57", "center");

  wrapText(ctx, `好友打开分享卡片后：首页点「联网对战」→「输入房间号加入」，输入 ${roomId}。`, panelX + 22, panelY + 140, panelW - 44, 20, 3, 13, "#5f4727");

  const close = { id: "closePvpShareGuide", x: panelX + panelW - 104, y: panelY + panelH - 42, w: 82, h: 30 };
  actions.push(close);
  button(ctx, { ...close, label: "知道了", size: 12, fill: "#2f6f57", stroke: "#1d4f3c" });
  ctx.restore();
}

function draw(ctx, view, actions, pvp = {}, ui = {}) {
  clear(ctx, view.width, view.height);
  const top = view.safeTop + 38;
  text(ctx, "联网房间", view.width / 2, top, 26, "#2f2417", "center");
  text(ctx, "房主定规则，好友准备后开始选择卡牌", view.width / 2, top + 30, 12, "#775c34", "center");

  const roomId = String(pvp.roomId || "").replace(/\D/g, "").slice(0, 4);
  const hasError = !!pvp.error;
  const hasRoom = !!(pvp.room && typeof pvp.room === "object");
  const panelH = hasError ? 250 : 278;
  const panel = { x: 20, y: top + 58, w: view.width - 40, h: panelH };
  fillRoundRect(ctx, panel.x, panel.y, panel.w, panel.h, 18, "#fffaf0", "#dcc48d");
  text(ctx, roomId ? "房间号" : "联网对战", view.width / 2, panel.y + 24, 12, "#775c34", "center");
  text(ctx, roomId || "准备开始", view.width / 2, panel.y + 58, roomId ? 30 : 24, "#8f3c1f", "center");

  let factionRuleAnchor = null;
  let factionRuleDropdownRules = null;
  if (hasError) {
    drawErrorPanel(ctx, view, actions, panel, pvp);
  } else {
    wrapText(ctx, statusText(pvp), panel.x + 18, panel.y + 92, panel.w - 36, 18, 2, 12, "#2f6f57");
    if (roomId && hasRoom) wrapText(ctx, ruleText(pvp.room), panel.x + 18, panel.y + 132, panel.w - 36, 16, 2, 11, "#8f3c1f");
    const players = pvp.room?.players || [];
    if (roomId && hasRoom && players.length) {
      text(ctx, playerSetupText(players[0], "玩家一", pvp.room?.status), panel.x + 18, panel.y + 174, 10, "#775c34");
      text(ctx, playerSetupText(players[1], "玩家二", pvp.room?.status), panel.x + 18, panel.y + 194, 10, "#775c34");
    }

    if (roomId && hasRoom && pvp.playerIndex === 0 && (pvp.room.status === "waiting" || pvp.room.status === "finished")) {
      const rules = rulesOf(pvp.room);
      const editable = pvp.room?.status !== "selecting" && pvp.room?.status !== "playing";
      const y = panel.y + 218;
      factionRuleAnchor = { id: "pvpRoomRuleFaction", x: panel.x + 16, y, w: (panel.w - 42) / 2, h: 28 };
      factionRuleDropdownRules = rules;
      const factionLabel = rules.factionMode === "fixed" ? `阵营：${short(FACTION_LABELS[rules.faction] || rules.faction, 6)}` : "阵营：不限";
      drawRuleRow(ctx, actions, factionRuleAnchor, `${factionLabel}${editable ? (ui.matchSetupDropdown === "pvpRoomRuleFaction" ? " ▴" : " ▾") : ""}`, editable);
      drawRuleRow(ctx, actions, { id: "pvpRuleDeckMode", x: panel.x + 26 + (panel.w - 42) / 2, y, w: (panel.w - 42) / 2, h: 28 }, `卡牌：${rules.deckMode === "autoOnly" ? "仅自动" : "不限"}`, editable);
    }
  }

  const y0 = panel.y + panel.h + 24;
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

  if (!hasRoom) {
    const retry = { id: "pvpRetryJoin", x: 46, y: y0, w: view.width - 92, h: 42 };
    const copy = { id: "pvpCopy", x: 46, y: y0 + 52, w: view.width - 92, h: 38 };
    const copyError = hasError ? { id: "pvpCopyError", x: 46, y: y0 + 98, w: view.width - 92, h: 38 } : null;
    const back = { id: "pvpBack", x: 46, y: y0 + (hasError ? 144 : 98), w: view.width - 92, h: 38 };
    actions.push(copy, back);
    if (hasError) actions.push(retry, copyError);
    button(ctx, { ...retry, label: hasError ? "重新加入房间" : "正在加入房间...", fill: hasError ? "#2f6f57" : "#b6a98e", stroke: hasError ? "#1d4f3c" : "#a89a80", size: 13 });
    button(ctx, { ...copy, label: "复制房间号", fill: "#b5892f", stroke: "#8f6b20", size: 12 });
    if (copyError) button(ctx, { ...copyError, label: "复制错误信息", fill: "#8f3c1f", stroke: "#6d2d18", size: 12 });
    button(ctx, { ...back, label: "返回首页", fill: "#8d6840", stroke: "#6f4d29", size: 12 });
    return;
  }

  const players = pvp.room?.players || [];
  const isHost = pvp.playerIndex === 0;
  const status = pvp.room?.status || "waiting";
  let primary;
  if (status === "selecting") primary = { id: "pvpGoSetup", label: players[pvp.playerIndex]?.setupReady ? "已确认，查看配置" : "选择出战配置", fill: "#2f6f57" };
  else if (status === "finished") primary = { id: "pvpReturnRoom", label: "返回房间", fill: "#2f6f57" };
  else if (isHost) primary = { id: "pvpStartSelection", label: players.length >= 2 && players[1]?.ready ? "开始选择卡牌" : "等待好友准备", fill: players.length >= 2 && players[1]?.ready ? "#2f6f57" : "#b6a98e" };
  else primary = { id: "pvpReady", label: players[pvp.playerIndex]?.ready ? "取消准备" : "我已看完规则，准备", fill: players[pvp.playerIndex]?.ready ? "#b5892f" : "#2f6f57" };

  const primaryRect = { id: primary.id, x: 46, y: y0, w: view.width - 92, h: 42 };
  const share = { id: "pvpShare", x: 46, y: y0 + 52, w: view.width - 92, h: 40 };
  const copy = { id: "pvpCopy", x: 46, y: y0 + 100, w: view.width - 92, h: 38 };
  const copyError = hasError ? { id: "pvpCopyError", x: 46, y: y0 + 146, w: view.width - 92, h: 38 } : null;
  const back = { id: "pvpBack", x: 46, y: y0 + (hasError ? 192 : 146), w: view.width - 92, h: 38 };
  actions.push(primaryRect, share, copy, back);
  if (copyError) actions.push(copyError);
  button(ctx, { ...primaryRect, label: primary.label, fill: primary.fill, stroke: primary.fill === "#b6a98e" ? "#a89a80" : "#1d4f3c", size: 13 });
  button(ctx, { ...share, label: "转发房间号给好友", fill: "#4f6d8a", stroke: "#36516a", size: 12 });
  button(ctx, { ...copy, label: "复制房间号发送", fill: "#b5892f", stroke: "#8f6b20", size: 12 });
  if (copyError) button(ctx, { ...copyError, label: "复制错误信息", fill: "#8f3c1f", stroke: "#6d2d18", size: 12 });
  button(ctx, { ...back, label: "返回首页", fill: "#8d6840", stroke: "#6f4d29", size: 12 });
  if (ui.matchSetupDropdown === "pvpRoomRuleFaction") drawFactionRuleDropdown(ctx, view, actions, factionRuleAnchor, factionRuleDropdownRules || rulesOf(pvp.room));
  if (ui.pvpShareGuideOpen) drawShareGuideOverlay(ctx, view, actions, roomId);
}

module.exports = { draw };
