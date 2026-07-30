const { clear, text, button, fillRoundRect, wrapText, short, drawAssetImage, drawRemoteImage, drawTopLeftBack } = require("../ui/canvas");
const { FACTION_KEYS, FACTION_LABELS, displayName, cardSummary, leadersFor, factionPerkSummary } = require("../core/cards");

const ERROR_PREVIEW_LINES = 5;

function rulesOf(room = {}) {
  const source = room && typeof room === "object" ? room : {};
  const rules = source.rules && typeof source.rules === "object" ? source.rules : {};
  const faction = FACTION_KEYS.includes(rules.faction) ? rules.faction : FACTION_KEYS[0];
  return {
    factionMode: ["fixed", "random"].includes(rules.factionMode) ? rules.factionMode : "any",
    faction,
    deckMode: rules.deckMode === "autoOnly" ? "autoOnly" : "any"
  };
}

function ruleText(room) {
  const rules = rulesOf(room);
  const faction = rules.factionMode === "random" ? "随机阵容" : (rules.factionMode === "fixed" ? `指定${FACTION_LABELS[rules.faction] || rules.faction}` : "不限");
  const deck = rules.factionMode === "random" ? "随机卡牌" : (rules.deckMode === "autoOnly" ? "仅自动卡牌" : "不限，可自定义/自动");
  return `规则：阵营${faction}；卡牌${deck}`;
}

function readyOf(room, index) {
  if (!Number.isInteger(index) || index < 0) return false;
  const players = room?.players || [];
  const readyPlayers = Array.isArray(room?.readyPlayers) ? room.readyPlayers : [];
  return !!(players[index]?.ready || readyPlayers[index]);
}

function statusText(pvp) {
  if (pvp.loading) return "正在连接云端房间...";
  if (pvp.error) return pvp.error;
  if (!pvp.roomId) return "请选择创建房间，或输入好友给你的房间号加入。";
  if (pvp.room?.status === "selecting") return "双方已准备，正在选择出战配置。";
  if (pvp.room?.status === "playing") return "对战进行中";
  if (pvp.room?.status === "finished") return "本局已结束，可重新准备再开一局。";
  if (pvp.room?.status === "dissolved") return "房主已解散房间。";
  const players = pvp.room?.players || [];
  if (players.length < 2) return "等待好友加入。可分享二维码或通过右上角转发邀请。";
  const bothReady = readyOf(pvp.room, 0) && readyOf(pvp.room, 1);
  if (bothReady) return "双方已准备，正在进入游戏。";
  return "双方都点击准备后自动进入游戏。";
}

function playerSetup(player, room) {
  if (!player) return { faction: "", leader: null };
  const rules = rulesOf(room);
  const faction = rules.factionMode === "fixed" ? rules.faction : player.faction;
  const leader = leadersFor(faction).find(card => card.id === player.leaderId) || null;
  return { faction, leader };
}

function playerSetupText(player, fallbackName, status, room, sideLabel, playerIndex) {
  if (!player) return `${sideLabel || fallbackName}：等待加入`;
  const setup = playerSetup(player, room);
  const randomLineup = setup.faction === "random";
  const faction = randomLineup ? "随机阵容" : (FACTION_LABELS[setup.faction] || setup.faction || "未选阵营");
  const leaderName = randomLineup ? "随机主将" : (setup.leader ? displayName(setup.leader) : "待选择主将");
  const deckMode = randomLineup ? "随机卡牌" : (player.customDeckIds && player.customDeckIds.length ? `自定义${player.customDeckIds.length}张` : "自动卡牌");
  const ready = readyOf(room, Number.isInteger(playerIndex) ? playerIndex : player.index);
  const flag = status === "selecting" ? (player.setupReady ? "已确认" : "选择中") : (ready ? "已准备" : "未准备");
  const identity = sideLabel ? `${sideLabel}·${player.name || fallbackName}` : (player.name || fallbackName);
  return `${identity}：${short(faction, 5)} · ${short(leaderName, 7)} · ${deckMode} · ${flag}`;
}

function playerLeaderSkillText(player, room) {
  if (!player) return "";
  const setup = playerSetup(player, room);
  if (setup.faction === "random") return "主将技能：开局时随机确定";
  return setup.leader ? `主将技能：${cardSummary(setup.leader)}` : "主将技能：进入出战配置后选择";
}

function factionSkillText(room) {
  const rules = rulesOf(room);
  if (rules.factionMode === "random") return "阵营技能：双方开局时随机确定";
  return rules.factionMode === "fixed"
    ? `阵营技能：${factionPerkSummary(rules.faction)}`
    : "阵营技能：双方按各自选择的阵营生效";
}

function playerName(player, fallback) {
  return short(String(player?.name || player?.nickName || fallback || "玩家"), 8);
}

function avatarUrlOf(player) {
  return String(player?.avatarUrl || player?.profile?.avatarUrl || player?.user?.avatarUrl || "");
}

function drawAvatar(ctx, player, x, y, size, fallbackChar, muted = false) {
  const radius = size / 2;
  fillRoundRect(ctx, x, y, size, size, radius, muted ? "#eee3d1" : "#fff7df", muted ? "#d7c4a2" : "#d6b36a");
  const url = avatarUrlOf(player);
  const loaded = url ? drawRemoteImage(ctx, url, x, y, size, size, { radius }) : false;
  if (!loaded) {
    const label = String(playerName(player, fallbackChar || "友")).slice(0, 1) || fallbackChar || "友";
    text(ctx, label, x + size / 2, y + size / 2 + 1, Math.max(16, size * 0.38), muted ? "#b7a483" : "#8f3c1f", "center");
  }
}

function drawReadyBadge(ctx, x, y, ready, animate = false, labelOverride = "") {
  const w = ready ? 58 : 50;
  const h = 22;
  const fill = ready ? "#2f6f57" : "#efe4cf";
  const stroke = ready ? "rgba(255,247,216,0.92)" : "#d7c4a2";
  if (ready && animate) {
    const phase = (Date.now() % 720) / 720;
    ctx.save();
    ctx.globalAlpha = 0.3 * (1 - phase);
    fillRoundRect(ctx, x - 5 - phase * 8, y - 4 - phase * 5, w + 10 + phase * 16, h + 8 + phase * 10, 16, "rgba(47,111,87,0.22)", "rgba(47,111,87,0.5)");
    ctx.restore();
  }
  fillRoundRect(ctx, x, y, w, h, 11, fill, stroke);
  text(ctx, labelOverride || (ready ? "已准备" : "未准备"), x + w / 2, y + h / 2 + 0.5, 10, ready ? "#fff7d8" : "#8d6840", "center");
  return { w, h };
}

function drawFriendSeat(ctx, view, player, ready, ui, compact = false) {
  const seatW = compact ? 104 : 118;
  const seatH = compact ? 74 : 90;
  const x = (view.width - seatW) / 2;
  const y = view.safeTop + (compact ? 38 : 66);
  fillRoundRect(ctx, x, y, seatW, seatH, compact ? 15 : 18, "rgba(255,250,240,0.82)", "rgba(216,189,131,0.92)");
  const avatarSize = compact ? 40 : 48;
  const ax = x + (seatW - avatarSize) / 2;
  const ay = y + 8;
  drawAvatar(ctx, player, ax, ay, avatarSize, "友", !player);
  fillRoundRect(ctx, ax + avatarSize - 16, ay - 5, 38, 18, 9, "#8f3c1f", "rgba(255,247,216,0.9)");
  text(ctx, "好友", ax + avatarSize + 3, ay + 4, 9, "#fff7d8", "center");
  text(ctx, player ? playerName(player, "好友") : "等待好友", x + seatW / 2, y + seatH - 16, compact ? 11 : 12, player ? "#2f2417" : "#9a8562", "center");
  if (player && !compact) drawReadyBadge(ctx, x + seatW - 62, y + seatH - 28, ready, ui.pvpReadyAnimUntil > Date.now());
}

function drawPlayerStatusRow(ctx, room, player, index, label, rect, ui) {
  const ready = readyOf(room, index);
  fillRoundRect(ctx, rect.x, rect.y, rect.w, rect.h, 13, ready ? "rgba(47,111,87,0.08)" : "rgba(255,255,255,0.38)", ready ? "rgba(47,111,87,0.32)" : "rgba(216,189,131,0.42)");
  drawAvatar(ctx, player, rect.x + 10, rect.y + 9, 34, label.slice(0, 1), !player);
  text(ctx, `${label}：${player ? playerName(player, label) : "等待加入"}`, rect.x + 52, rect.y + 18, 11, label === "我方" ? "#2f6f57" : "#8f3c1f", "left");
  if (player) {
    wrapText(ctx, playerSetupText(player, label, room?.status, room, "", index), rect.x + 52, rect.y + 36, rect.w - 116, 12, 1, 9, "#775c34");
  }
  drawReadyBadge(ctx, rect.x + rect.w - 66, rect.y + 18, ready, ui.pvpReadyAnimUntil > Date.now());
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
  text(ctx, "联机错误", panel.x + metrics.paddingX, panel.y + 146, 12, "#8f3c1f", "left");
  wrapText(ctx, err, panel.x + metrics.paddingX, panel.y + 166, metrics.textW, metrics.lineH, metrics.maxLines, 11, "#c0392b");
  if (metrics.truncated) text(ctx, "错误信息过长，已省略", panel.x + metrics.paddingX, panel.y + 128 + metrics.boxH - 16, 11, "#8f3c1f", "left");
}

function drawRuleRow(ctx, actions, rect, label, editable) {
  if (editable) actions.push(rect);
  button(ctx, { ...rect, label, fill: editable ? "#fffaf0" : "#f2ead8", stroke: "#dcc48d", color: editable ? "#3b2b18" : "#775c34", size: 11, shadow: false });
}

function factionRuleOptions() {
  return [{ value: "random", label: "随机阵容" }, { value: "any", label: "不限" }].concat(FACTION_KEYS.map(value => ({ value, label: FACTION_LABELS[value] || value })));
}

function drawFactionRuleDropdown(ctx, view, actions, anchor, rules) {
  if (!anchor) return;
  const options = factionRuleOptions();
  const selected = rules.factionMode === "fixed" ? rules.faction : rules.factionMode;
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

function drawShareGuideOverlay(ctx, view, actions, roomId, ui) {
  actions.push({ id: "closePvpShareGuide", x: 0, y: 0, w: view.width, h: view.height });
  ctx.save();
  ctx.fillStyle = "rgba(24, 18, 12, 0.62)";
  ctx.fillRect(0, 0, view.width, view.height);

  const panelW = Math.min(view.width - 44, 336);
  const panelH = Math.min(430, view.height - view.safeTop - view.safeBottom - 72);
  const panelX = (view.width - panelW) / 2;
  const panelY = Math.max(view.safeTop + 42, Math.floor((view.height - panelH) / 2));

  let menuRect = { x: view.width - 102, y: view.safeTop + 8, width: 92, height: 38 };
  try {
    const current = typeof wx !== "undefined" && wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null;
    if (current && current.width > 0 && current.height > 0) menuRect = current;
  } catch (err) {}
  const tipH = 34;
  const tipY = menuRect.y + menuRect.height + 10;
  if (tipY + tipH + 10 < panelY) {
    const tipText = "点击右上角「···」转发给好友";
    const tipX = 16;
    const tipW = Math.max(190, Math.min(menuRect.x - tipX - 12, 280));
    fillRoundRect(ctx, tipX, tipY, tipW, tipH, 17, "rgba(255, 248, 225, 0.96)", "rgba(255, 216, 106, 0.95)");
    text(ctx, tipText, tipX + tipW / 2, tipY + tipH / 2, 12, "#5f4727", "center");
    ctx.strokeStyle = "rgba(255, 248, 225, 0.96)";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(tipX + tipW - 8, tipY + 8);
    ctx.quadraticCurveTo(menuRect.x - 18, tipY - 4, menuRect.x + menuRect.width * 0.42, menuRect.y + menuRect.height * 0.35);
    ctx.stroke();
    ctx.fillStyle = "rgba(255, 248, 225, 0.96)";
    ctx.beginPath();
    ctx.moveTo(menuRect.x + menuRect.width * 0.42, menuRect.y + menuRect.height * 0.35);
    ctx.lineTo(menuRect.x + menuRect.width * 0.42 - 8, menuRect.y + menuRect.height * 0.35 + 3);
    ctx.lineTo(menuRect.x + menuRect.width * 0.42 - 2, menuRect.y + menuRect.height * 0.35 + 10);
    ctx.closePath();
    ctx.fill();
  }

  actions.push({ id: "pvpShareGuidePanel", x: panelX, y: panelY, w: panelW, h: panelH });
  fillRoundRect(ctx, panelX, panelY, panelW, panelH, 22, "rgba(255, 250, 240, 0.99)", "rgba(255, 216, 106, 0.92)");
  text(ctx, "邀请好友加入房间", panelX + panelW / 2, panelY + 28, 18, "#2f2417", "center");
  text(ctx, `微信扫码直接进入 · 房间 ${roomId}`, panelX + panelW / 2, panelY + 53, 12, "#775c34", "center");

  const envVersion = ui.pvpShareCodeEnvVersion;
  const codeSize = Math.max(150, Math.min(190, panelW - 86, panelH - 218));
  const codeX = panelX + (panelW - codeSize) / 2;
  const codeY = panelY + 82;
  fillRoundRect(ctx, codeX - 8, codeY - 8, codeSize + 16, codeSize + 16, 15, "#ffffff", "#dcc48d");
  if (ui.pvpShareCodePath) {
    const loaded = drawAssetImage(ctx, ui.pvpShareCodePath, codeX, codeY, codeSize, codeSize, { fit: "contain", placeholder: false });
    if (!loaded) text(ctx, "二维码加载中...", codeX + codeSize / 2, codeY + codeSize / 2, 13, "#775c34", "center");
  } else if (ui.pvpShareCodeError) {
    wrapText(ctx, ui.pvpShareCodeError, codeX + 14, codeY + codeSize / 2 - 22, codeSize - 28, 18, 2, 12, "#8f3c1f");
    const retry = { id: "retryPvpShareCode", x: codeX + 30, y: codeY + codeSize / 2 + 22, w: codeSize - 60, h: 32 };
    actions.push(retry);
    button(ctx, { ...retry, label: "重新生成", size: 12, fill: "#8d6840", stroke: "#6f4d29" });
  } else {
    text(ctx, ui.pvpShareCodeLoading ? "正在生成房间二维码..." : "准备二维码...", codeX + codeSize / 2, codeY + codeSize / 2, 13, "#775c34", "center");
  }

  const hintY = codeY + codeSize + 22;
  text(ctx, "扫码自动加入，无需输入房间号", panelX + panelW / 2, hintY, 11, "#2f6f57", "center");
  text(ctx, "也可点击右上角「···」转发给好友", panelX + panelW / 2, hintY + 20, 11, "#775c34", "center");
  const versionTip = envVersion === "develop" ? "开发版码：扫码账号需为项目成员"
    : (envVersion === "trial" ? "体验版码：扫码账号需加入体验成员" : "正式版码");
  if (envVersion) text(ctx, versionTip, panelX + panelW / 2, hintY + 38, 10, envVersion === "release" ? "#775c34" : "#8f3c1f", "center");

  const buttonY = panelY + panelH - 56;
  const save = { id: "savePvpShareCode", x: panelX + 20, y: buttonY, w: panelW - 118, h: 38 };
  const close = { id: "closePvpShareGuide", x: panelX + panelW - 88, y: buttonY, w: 68, h: 38 };
  actions.push(save, close);
  button(ctx, { ...save, label: ui.pvpShareCodePath ? "保存二维码到相册" : "二维码生成中", size: 12, fill: ui.pvpShareCodePath ? "#2f6f57" : "#b6a98e", stroke: ui.pvpShareCodePath ? "#1d4f3c" : "#a89a80" });
  button(ctx, { ...close, label: "关闭", size: 12, fill: "#8d6840", stroke: "#6f4d29" });
  ctx.restore();
}

function draw(ctx, view, actions, pvp = {}, ui = {}) {
  clear(ctx, view.width, view.height);
  drawTopLeftBack(ctx, view, actions, "pvpBack");
  const compact = view.height < 560;
  const top = view.safeTop + (compact ? 20 : 34);
  text(ctx, "联网房间", view.width / 2, top, compact ? 22 : 24, "#2f2417", "center");
  text(ctx, "邀请好友入座，双方准备后自动开局", view.width / 2, top + (compact ? 24 : 27), 12, "#775c34", "center");

  const roomId = String(pvp.roomId || "").replace(/\D/g, "").slice(0, 4);
  const hasError = !!pvp.error;
  const hasRoom = !!(pvp.room && typeof pvp.room === "object");
  const players = pvp.room?.players || [];
  const selfIndex = Number.isInteger(pvp.playerIndex) ? pvp.playerIndex : 0;
  const friendIndex = selfIndex === 0 ? 1 : 0;
  const friend = players[friendIndex] || null;
  const status = pvp.room?.status || "waiting";
  const isHost = selfIndex === 0;
  const selfReady = readyOf(pvp.room, selfIndex);
  const friendReady = readyOf(pvp.room, friendIndex);

  if (roomId && hasRoom) drawFriendSeat(ctx, view, friend, friendReady, ui, compact);

  const panelTop = roomId && hasRoom ? view.safeTop + (compact ? 112 : 168) : top + 58;
  const panelH = hasError ? 250 : (roomId && hasRoom ? (compact ? 310 : 376) : 236);
  const panel = { x: 20, y: panelTop, w: view.width - 40, h: panelH };
  fillRoundRect(ctx, panel.x, panel.y, panel.w, panel.h, 18, "#fffaf0", "#dcc48d");

  text(ctx, roomId ? "房间号" : "联网对战", view.width / 2, panel.y + 25, 13, "#775c34", "center");
  text(ctx, roomId || "准备开始", view.width / 2, panel.y + 64, roomId ? 34 : 24, "#8f3c1f", "center");
  if (roomId) actions.push({ id: "pvpCopy", x: panel.x + panel.w / 2 - 78, y: panel.y + 38, w: 156, h: 44 });

  let factionRuleAnchor = null;
  let factionRuleDropdownRules = null;
  if (hasError) {
    drawErrorPanel(ctx, view, actions, panel, pvp);
  } else {
    wrapText(ctx, statusText(pvp), panel.x + 18, panel.y + 96, panel.w - 36, 18, 2, 12, "#2f6f57");
    if (roomId && hasRoom) {
      const ruleY = panel.y + (compact ? 126 : 136);
      wrapText(ctx, ruleText(pvp.room), panel.x + 18, ruleY, panel.w - 36, compact ? 14 : 16, 2, 11, "#8f3c1f");
      wrapText(ctx, factionSkillText(pvp.room), panel.x + 18, panel.y + (compact ? 154 : 172), panel.w - 36, 14, compact ? 1 : 2, 10, "#775c34");
      const rowW = panel.w - 32;
      const rowH = compact ? 42 : 54;
      drawPlayerStatusRow(ctx, pvp.room, players[selfIndex], selfIndex, "我方", { x: panel.x + 16, y: panel.y + (compact ? 178 : 212), w: rowW, h: rowH }, ui);
      drawPlayerStatusRow(ctx, pvp.room, friend, friendIndex, "好友", { x: panel.x + 16, y: panel.y + (compact ? 224 : 272), w: rowW, h: rowH }, ui);
    }

    if (roomId && hasRoom && isHost && (status === "waiting" || status === "finished")) {
      const rules = rulesOf(pvp.room);
      const editable = status !== "selecting" && status !== "playing";
      const y = panel.y + panel.h - 38;
      factionRuleAnchor = { id: "pvpRoomRuleFaction", x: panel.x + 16, y, w: (panel.w - 42) / 2, h: 28 };
      factionRuleDropdownRules = rules;
      const factionLabel = rules.factionMode === "random" ? "阵营：随机" : (rules.factionMode === "fixed" ? `阵营：${short(FACTION_LABELS[rules.faction] || rules.faction, 6)}` : "阵营：不限");
      drawRuleRow(ctx, actions, factionRuleAnchor, `${factionLabel}${editable ? (ui.matchSetupDropdown === "pvpRoomRuleFaction" ? " ▴" : " ▾") : ""}`, editable);
      const deckRuleEditable = editable && rules.factionMode !== "random";
      drawRuleRow(ctx, actions, { id: "pvpRuleDeckMode", x: panel.x + 26 + (panel.w - 42) / 2, y, w: (panel.w - 42) / 2, h: 28 }, `卡牌：${rules.factionMode === "random" ? "随机" : (rules.deckMode === "autoOnly" ? "仅自动" : "不限")}`, deckRuleEditable);
    }
  }

  const y0 = panel.y + panel.h + (compact ? 10 : 18);
  if (!roomId) {
    const create = { id: "pvpCreate", x: 46, y: y0, w: view.width - 92, h: 46 };
    const join = { id: "pvpJoin", x: 46, y: y0 + 56, w: view.width - 92, h: 42 };
    actions.push(create, join);
    button(ctx, { ...create, label: "开房间邀请好友", fill: "#2f6f57", stroke: "#1d4f3c", size: 14 });
    button(ctx, { ...join, label: "输入房间号加入", fill: "#4f6d8a", stroke: "#36516a", size: 13 });
    return;
  }

  if (!hasRoom) {
    const retry = { id: "pvpRetryJoin", x: 46, y: y0, w: view.width - 92, h: 42 };
    const copy = { id: "pvpCopy", x: 46, y: y0 + 52, w: view.width - 92, h: 38 };
    actions.push(copy);
    if (hasError) actions.push(retry);
    button(ctx, { ...retry, label: hasError ? "重新加入房间" : "正在加入房间...", fill: hasError ? "#2f6f57" : "#b6a98e", stroke: hasError ? "#1d4f3c" : "#a89a80", size: 13 });
    button(ctx, { ...copy, label: "复制房间号", fill: "#b5892f", stroke: "#8f6b20", size: 12 });
    return;
  }

  const gap = 16;
  const btnW = (view.width - 76 - gap) / 2;
  const invite = { id: "pvpShare", x: 38, y: y0, w: btnW, h: 44 };
  let ready = { id: "pvpReady", x: 38 + btnW + gap, y: y0, w: btnW, h: 44 };
  let readyLabel = selfReady ? "取消准备" : "准备";
  let readyFill = selfReady ? "#b5892f" : "#2f6f57";
  let readyStroke = selfReady ? "#8f6b20" : "#1d4f3c";
  if (pvp.submitting) {
    readyLabel = "同步中...";
    readyFill = "#b6a98e";
    readyStroke = "#a89a80";
  } else if (status === "selecting") {
    ready = { ...ready, id: "pvpGoSetup" };
    readyLabel = players[selfIndex]?.setupReady ? "查看配置" : "选牌配置";
    readyFill = "#2f6f57";
    readyStroke = "#1d4f3c";
  } else if (status === "finished") {
    ready = { ...ready, id: "pvpReturnRoom" };
    readyLabel = "重新准备";
    readyFill = "#2f6f57";
    readyStroke = "#1d4f3c";
  }

  const canInvite = isHost && status === "waiting" && players.length < 2 && !pvp.submitting;
  if (canInvite) actions.push(invite);
  if (!pvp.submitting && ["waiting", "selecting", "finished"].includes(status)) actions.push(ready);
  button(ctx, { ...invite, label: "邀请好友", fill: canInvite ? "#4aa35f" : "#b6a98e", stroke: canInvite ? "#2e7d46" : "#a89a80", size: 14 });
  button(ctx, { ...ready, label: readyLabel, fill: readyFill, stroke: readyStroke, size: 14 });
  if (y0 + 62 < view.height - view.safeBottom - 4) {
    text(ctx, players.length >= 2 ? "双方准备完成后自动进入游戏" : "点击邀请好友，或复制房间号发给好友", view.width / 2, y0 + 62, 11, "#775c34", "center");
  }

  if (ui.matchSetupDropdown === "pvpRoomRuleFaction") drawFactionRuleDropdown(ctx, view, actions, factionRuleAnchor, factionRuleDropdownRules || rulesOf(pvp.room));
  if (ui.pvpShareGuideOpen) drawShareGuideOverlay(ctx, view, actions, roomId, ui);
}

module.exports = { draw };
