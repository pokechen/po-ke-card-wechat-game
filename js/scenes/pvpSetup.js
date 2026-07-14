const { clear, text, button, fillRoundRect, wrapText, short, drawCardImage } = require("../ui/canvas");
const { loadSettings, getActiveCustomDeckIds } = require("../core/storage");
const { FACTION_KEYS, FACTION_LABELS, deckStatus, leadersFor, displayName, cardSummary, cardById } = require("../core/cards");
const { drawDetail } = require("./cardDetail");

function shortText(value, max) {
  const textValue = String(value || "");
  return textValue.length > max ? `${textValue.slice(0, max - 1)}…` : textValue;
}

function leaderSkill(card) {
  return card ? `技能：${cardSummary(card)}` : "随机确定主将技能";
}

function currentFaction(settings) {
  const value = settings.pvpFaction || settings.humanFaction || FACTION_KEYS[0];
  return value === "random" || FACTION_KEYS.includes(value) ? value : FACTION_KEYS[0];
}

function selectedLeader(settings, faction) {
  if (faction === "random") return null;
  const leaderValue = settings.pvpLeaderIds?.[faction] ?? settings.humanLeaderIds?.[faction];
  if (leaderValue === "random") return null;
  const leaders = leadersFor(faction);
  return leaders.find(card => card.id === leaderValue) || leaders[0] || null;
}

function selectedLeaderValue(settings, faction) {
  if (faction === "random") return "random";
  return settings.pvpLeaderIds?.[faction] === "random" ? "random" : (selectedLeader(settings, faction)?.id || "");
}

function detailLeaderCards(settings, pvp) {
  const selectingOnline = pvp.room?.status === "selecting";
  const roomRules = pvp.room?.rules || {};
  const fixedFaction = roomRules.factionMode === "fixed" && FACTION_KEYS.includes(roomRules.faction) ? roomRules.faction : "";
  const faction = selectingOnline && fixedFaction ? fixedFaction : currentFaction(settings);
  return FACTION_KEYS.includes(faction) ? leadersFor(faction) : [];
}

function setupOptions(settings, field, forcedFaction = null) {
  const faction = forcedFaction || currentFaction(settings);
  if (field === "pvpFaction") {
    return [{ value: "random", label: "随机" }].concat(FACTION_KEYS.map(value => ({ value, label: FACTION_LABELS[value] || value })));
  }
  if (field === "pvpLeader") {
    if (faction === "random") return [{ value: "random", label: "随机", hint: leaderSkill(null) }];
    return [{ value: "random", label: "随机", hint: leaderSkill(null) }].concat(
      leadersFor(faction).map(card => ({ value: card.id, label: displayName(card), hint: leaderSkill(card), cardId: card.id }))
    );
  }
  return [];
}

function drawSectionTitle(ctx, label, x, y) {
  fillRoundRect(ctx, x, y - 8, 4, 16, 2, "#d3a44f");
  text(ctx, label, x + 10, y, 13, "#3b2b18");
}

function drawRow(ctx, actions, spec, opened, anchors) {
  const labelW = spec.labelW || 78;
  const rectH = spec.h || 38;
  text(ctx, spec.label, spec.x, spec.y, 12, "#775c34");
  const rect = { id: spec.id, x: spec.x + labelW, y: spec.y - rectH / 2, w: spec.w - labelW, h: rectH };
  if (spec.cardId) rect.cardId = spec.cardId;
  anchors[spec.id] = rect;
  if (!spec.disabled) actions.push(rect);
  button(ctx, { ...rect, label: spec.card ? "" : `${spec.value} ${spec.disabled ? "" : (opened ? "▴" : "▾")}`, fill: spec.disabled ? "#b6a98e" : (spec.fill || "#2f6f57"), size: 12, r: spec.r });
  if (spec.card) {
    const avatar = { x: rect.x + 9, y: rect.y + 7, w: 34, h: rect.h - 14 };
    drawCardImage(ctx, { ...spec.card, imageFill: true, imageX: avatar.x, imageY: avatar.y, imageW: avatar.w, imageH: avatar.h });
    const textX = avatar.x + avatar.w + 10;
    text(ctx, shortText(spec.value, 14), textX, rect.y + 18, 12, "#ffffff");
    text(ctx, shortText(spec.subtitle || "", 20), textX, rect.y + 36, 9, "#efe6ff");
    text(ctx, spec.disabled ? "锁" : (opened ? "▴" : "▾"), rect.x + rect.w - 24, rect.y + rect.h / 2, 12, "#fff7d8", "center");
  }
}

function drawDropdown(ctx, view, actions, settings, field, anchors, forcedFaction = null) {
  const anchor = anchors[field];
  if (!anchor) return;
  const options = setupOptions(settings, field, forcedFaction);
  if (!options.length) return;
  const faction = forcedFaction || currentFaction(settings);
  const selected = field === "pvpFaction" ? faction : selectedLeaderValue(settings, faction);
  const isLeader = field === "pvpLeader";
  const itemH = isLeader ? 42 : 34;
  const menuH = options.length * itemH;
  const menuX = Math.max(8, Math.min(anchor.x, view.width - anchor.w - 8));
  const menuY = Math.min(anchor.y + anchor.h + 6, view.height - view.safeBottom - menuH - 8);

  actions.push({ id: "closePvpSetupDropdown", x: 0, y: 0, w: view.width, h: view.height });
  ctx.save();
  ctx.fillStyle = "rgba(38, 28, 18, 0.2)";
  ctx.fillRect(0, 0, view.width, view.height);
  ctx.restore();
  fillRoundRect(ctx, menuX, menuY, anchor.w, menuH, 12, "#fffaf0", "#2f6f57");
  options.forEach((option, index) => {
    const y = menuY + index * itemH;
    const active = option.value === selected;
    actions.push({ id: "selectPvpSetupOption", field, value: option.value, cardId: option.cardId || "", x: menuX, y, w: anchor.w, h: itemH });
    if (active) fillRoundRect(ctx, menuX + 4, y + 3, anchor.w - 8, itemH - 6, 9, "#2f6f57");
    else if (index > 0) {
      ctx.strokeStyle = "rgba(119, 92, 52, 0.2)";
      ctx.beginPath();
      ctx.moveTo(menuX + 10, y);
      ctx.lineTo(menuX + anchor.w - 10, y);
      ctx.stroke();
    }
    text(ctx, shortText(option.label, isLeader ? 16 : 18), menuX + anchor.w / 2, y + (isLeader ? 15 : itemH / 2), 12, active ? "#ffffff" : "#2f2417", "center");
    if (isLeader) text(ctx, shortText(option.hint, 24), menuX + anchor.w / 2, y + 31, 9, active ? "#efe6ff" : "#775c34", "center");
  });
}

function drawModeButton(ctx, actions, rect, active, label, fill) {
  actions.push(rect);
  button(ctx, { ...rect, label, fill: active ? fill : "#fffaf0", stroke: active ? fill : "#dcc48d", color: active ? "#ffffff" : "#775c34", size: 12 });
}

function drawPrepareScreen(ctx, view, actions, ui, pvp, settings) {
  const rules = {
    factionMode: settings.pvpRuleFactionMode === "fixed" ? "fixed" : "any",
    faction: FACTION_KEYS.includes(settings.pvpRuleFaction) ? settings.pvpRuleFaction : FACTION_KEYS[0],
    deckMode: settings.pvpRuleDeckMode === "autoOnly" ? "autoOnly" : "any"
  };
  const top = view.safeTop + 28;
  const panelX = 18;
  const panelW = view.width - 36;
  const panelY = top + 48;
  const bottom = view.height - view.safeBottom - 160;
  const panelH = Math.max(260, bottom - panelY);
  const contentX = panelX + 20;
  const rowW = panelW - 40;

  text(ctx, "对战准备", view.width / 2, top, 24, "#2f2417", "center");
  text(ctx, pvp.pendingRoomId ? `准备加入房间 ${pvp.pendingRoomId}` : "先设置房间规则，进房后再选阵营与卡牌", view.width / 2, top + 26, 12, "#775c34", "center");

  fillRoundRect(ctx, panelX, panelY, panelW, panelH, 18, "rgba(255, 250, 240, 0.94)", "#dcc48d");
  drawSectionTitle(ctx, "阵营规则", contentX, panelY + 28);
  wrapText(ctx, "不限：双方各自选择；指定：所有人使用同一阵营，仍可各自选主将。", contentX, panelY + 44, rowW, 15, 2, 11, "#775c34");
  const ruleY = panelY + 82;
  const halfW = (rowW - 10) / 2;
  drawModeButton(ctx, actions, { id: "pvpRuleFactionMode", value: "any", x: contentX, y: ruleY, w: halfW, h: 36 }, rules.factionMode === "any", "阵营不限", "#2f6f57");
  drawModeButton(ctx, actions, { id: "pvpRuleFactionMode", value: "fixed", x: contentX + halfW + 10, y: ruleY, w: halfW, h: 36 }, rules.factionMode === "fixed", "指定阵营", "#2f6f57");
  if (rules.factionMode === "fixed") {
    const factionRule = { id: "pvpRuleFactionNext", x: contentX, y: ruleY + 44, w: rowW, h: 34 };
    actions.push(factionRule);
    button(ctx, { ...factionRule, label: `指定：${FACTION_LABELS[rules.faction] || rules.faction}（点击切换）`, fill: "#fffaf0", stroke: "#dcc48d", color: "#3b2b18", size: 12, shadow: false });
  }

  const deckSectionY = rules.factionMode === "fixed" ? ruleY + 96 : ruleY + 60;
  drawSectionTitle(ctx, "卡牌规则", contentX, deckSectionY);
  wrapText(ctx, "不限：可选自动卡牌或自定义牌组；仅自动：本局所有人只能用系统自动卡牌。", contentX, deckSectionY + 16, rowW, 15, 2, 11, "#775c34");
  const deckY = deckSectionY + 54;
  drawModeButton(ctx, actions, { id: "pvpRuleDeckMode", value: "any", x: contentX, y: deckY, w: halfW, h: 36 }, rules.deckMode === "any", "卡牌不限", "#8d6840");
  drawModeButton(ctx, actions, { id: "pvpRuleDeckMode", value: "autoOnly", x: contentX + halfW + 10, y: deckY, w: halfW, h: 36 }, rules.deckMode === "autoOnly", "仅自动卡牌", "#8d6840");

  const create = { id: "pvpCreatePrepared", x: 46, y: bottom + 22, w: view.width - 92, h: 46 };
  const join = { id: "pvpJoinPrepared", x: 46, y: bottom + 78, w: view.width - 92, h: 42 };
  const back = { id: "back", x: 46, y: bottom + 130, w: view.width - 92, h: 42 };
  actions.push(create, join, back);
  button(ctx, { ...create, label: "开房间邀请好友", fill: "#2f6f57", stroke: "#1d4f3c", size: 14 });
  button(ctx, { ...join, label: pvp.pendingRoomId ? `加入房间 ${pvp.pendingRoomId}` : "输入房间号加入", fill: "#4f6d8a", stroke: "#36516a", size: 13 });
  button(ctx, { ...back, label: "返回首页", fill: "#8d6840", stroke: "#6f4d29", size: 13 });
}

function drawSelectingScreen(ctx, view, actions, ui, pvp, settings) {
  const roomRules = pvp.room?.rules || {};
  const rules = {
    factionMode: roomRules.factionMode === "fixed" ? "fixed" : "any",
    faction: FACTION_KEYS.includes(roomRules.faction) ? roomRules.faction : FACTION_KEYS[0],
    deckMode: roomRules.deckMode === "autoOnly" ? "autoOnly" : "any"
  };
  const factionLocked = rules.factionMode === "fixed";
  const deckLocked = rules.deckMode === "autoOnly";
  const faction = factionLocked ? rules.faction : currentFaction(settings);
  const concreteFaction = faction !== "random";
  const selectedIds = concreteFaction ? getActiveCustomDeckIds(settings, faction) : [];
  const status = concreteFaction ? deckStatus(selectedIds, faction) : { valid: false, total: 0, units: 0, specials: 0, ids: [] };
  const deckMode = deckLocked ? "random" : (settings.pvpDeckMode === "custom" ? "custom" : "random");
  const useCustom = !deckLocked && concreteFaction && deckMode === "custom" && status.valid;
  const leader = selectedLeader(settings, faction);
  const leaderLabel = faction === "random" || settings.pvpLeaderIds?.[faction] === "random" ? "随机" : short(leader ? displayName(leader) : "未选择", 14);
  const top = view.safeTop + 28;
  const panelX = 18;
  const panelW = view.width - 36;
  const panelY = top + 48;
  const bottom = view.height - view.safeBottom - 160;
  const panelH = Math.max(380, bottom - panelY);
  const contentX = panelX + 20;
  const rowW = panelW - 40;
  const dropdownField = ui.matchSetupDropdown || "";
  const anchors = {};

  text(ctx, "选择出战配置", view.width / 2, top, 24, "#2f2417", "center");
  const ruleTip = `规则：阵营${factionLocked ? `指定${FACTION_LABELS[rules.faction] || rules.faction}` : "不限"}；卡牌${deckLocked ? "仅自动" : "不限"}`;
  text(ctx, ruleTip, view.width / 2, top + 26, 12, "#8f3c1f", "center");

  fillRoundRect(ctx, panelX, panelY, panelW, panelH, 18, "rgba(255, 250, 240, 0.94)", "#dcc48d");
  drawSectionTitle(ctx, "我的出战配置", contentX, panelY + 28);
  drawRow(ctx, actions, { id: "pvpFaction", label: "阵营", value: faction === "random" ? "随机" : (FACTION_LABELS[faction] || faction), x: contentX, y: panelY + 58, w: rowW, fill: "#2f6f57", disabled: factionLocked }, dropdownField === "pvpFaction" && !factionLocked, anchors);
  drawRow(ctx, actions, {
    id: "pvpLeader",
    label: "主将",
    value: leaderLabel,
    subtitle: leader ? cardSummary(leader) : "开局时随机确定",
    card: leader,
    cardId: leader?.id,
    x: contentX,
    y: panelY + 108,
    w: rowW,
    h: 42,
    fill: "#7a5a95"
  }, dropdownField === "pvpLeader", anchors);

  const statusText = deckLocked
    ? "房间规则为仅自动卡牌，本局不能选择自定义牌组。"
    : (faction === "random"
      ? "随机阵营会在开局时确定，并使用随机卡牌。选择具体阵营后可使用自定义牌组。"
      : (status.valid
        ? `自定义牌组已完成：${status.total}张；本局${useCustom ? "使用自定义卡牌" : "使用随机卡牌"}。`
        : `自定义牌组未完成：${status.total}/40张；可编辑卡牌，或直接使用随机卡牌。`));
  fillRoundRect(ctx, contentX, panelY + 160, rowW, 62, 12, "rgba(255, 249, 235, 0.88)", "rgba(216, 189, 131, 0.7)");
  wrapText(ctx, statusText, contentX + 12, panelY + 178, rowW - 24, 16, 3, 11, useCustom ? "#2f6f57" : "#8d6840");

  drawSectionTitle(ctx, "卡牌模式", contentX, panelY + 252);
  const randomBtn = { id: "pvpDeckMode", value: "random", x: contentX, y: panelY + 274, w: (rowW - 10) / 2, h: 38 };
  const customBtn = { id: "pvpDeckMode", value: "custom", x: randomBtn.x + randomBtn.w + 10, y: randomBtn.y, w: randomBtn.w, h: 38 };
  drawModeButton(ctx, actions, randomBtn, !useCustom, "随机卡牌", "#8d6840");
  drawModeButton(ctx, actions, customBtn, useCustom, "自定义卡牌", "#2f6f57");

  const edit = { id: "editPvpCustomDeck", x: contentX, y: panelY + 326, w: rowW, h: 38 };
  actions.push(edit);
  button(ctx, { ...edit, label: deckLocked ? "房间仅自动卡牌" : (concreteFaction ? "编辑该阵营卡牌" : "先选择具体阵营"), fill: concreteFaction && !deckLocked ? "#8f3c1f" : "#b6a98e", stroke: concreteFaction && !deckLocked ? "#6d2d18" : "#a89a80", size: 13 });

  const me = pvp.room?.players?.[pvp.playerIndex] || {};
  const submit = { id: "pvpSubmitSetup", x: 46, y: bottom + 34, w: view.width - 92, h: 48 };
  const back = { id: "pvpRoomBack", x: 46, y: bottom + 96, w: view.width - 92, h: 42 };
  actions.push(submit, back);
  button(ctx, { ...submit, label: me.setupReady ? "已确认，等待对方" : "确认出战配置", fill: me.setupReady ? "#b5892f" : "#2f6f57", stroke: me.setupReady ? "#8f6b20" : "#1d4f3c", size: 14 });
  button(ctx, { ...back, label: "返回房间查看规则", fill: "#8d6840", stroke: "#6f4d29", size: 13 });

  drawDropdown(ctx, view, actions, settings, dropdownField, anchors, factionLocked ? faction : null);
}

function draw(ctx, view, actions, ui = {}, pvp = {}) {
  clear(ctx, view.width, view.height);
  let detail = null;
  if (ui.matchSetupCardDetailId) {
    detail = cardById(ui.matchSetupCardDetailId);
    if (!detail) ui.matchSetupCardDetailId = "";
  }

  const settings = loadSettings();
  const selectingOnline = pvp.room?.status === "selecting";

  if (selectingOnline) drawSelectingScreen(ctx, view, actions, ui, pvp, settings);
  else drawPrepareScreen(ctx, view, actions, ui, pvp, settings);

  if (detail) {
    const leaders = detailLeaderCards(settings, pvp);
    const currentIdx = leaders.findIndex(card => card.id === detail.id);
    const leftCard = currentIdx > 0 ? leaders[currentIdx - 1] : null;
    const rightCard = currentIdx >= 0 && currentIdx < leaders.length - 1 ? leaders[currentIdx + 1] : null;
    const swipeOffset = ui.detailSwipe ? ui.detailSwipe.offset || 0 : 0;
    drawDetail(ctx, view, actions, detail, { closeHint: "点击空白处返回对战准备", leftCard, rightCard, swipeOffset });
  }
}

module.exports = { draw };
