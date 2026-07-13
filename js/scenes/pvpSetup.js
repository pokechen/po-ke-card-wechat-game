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

function setupOptions(settings, field) {
  const faction = currentFaction(settings);
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
  actions.push(rect);
  button(ctx, { ...rect, label: spec.card ? "" : `${spec.value} ${opened ? "▴" : "▾"}`, fill: spec.fill || "#2f6f57", size: 12, r: spec.r });
  if (spec.card) {
    const avatar = { x: rect.x + 9, y: rect.y + 7, w: 34, h: rect.h - 14 };
    drawCardImage(ctx, { ...spec.card, imageFill: true, imageX: avatar.x, imageY: avatar.y, imageW: avatar.w, imageH: avatar.h });
    const textX = avatar.x + avatar.w + 10;
    text(ctx, shortText(spec.value, 14), textX, rect.y + 18, 12, "#ffffff");
    text(ctx, shortText(spec.subtitle || "", 20), textX, rect.y + 36, 9, "#efe6ff");
    text(ctx, opened ? "▴" : "▾", rect.x + rect.w - 24, rect.y + rect.h / 2, 12, "#fff7d8", "center");
  }
}

function drawDropdown(ctx, view, actions, settings, field, anchors) {
  const anchor = anchors[field];
  if (!anchor) return;
  const options = setupOptions(settings, field);
  if (!options.length) return;
  const faction = currentFaction(settings);
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

function draw(ctx, view, actions, ui = {}, pvp = {}) {
  clear(ctx, view.width, view.height);
  let detail = null;
  if (ui.matchSetupCardDetailId) {
    detail = cardById(ui.matchSetupCardDetailId);
    if (!detail) ui.matchSetupCardDetailId = "";
  }

  const settings = loadSettings();
  const faction = currentFaction(settings);
  const concreteFaction = faction !== "random";
  const selectedIds = concreteFaction ? getActiveCustomDeckIds(settings, faction) : [];
  const status = concreteFaction ? deckStatus(selectedIds, faction) : { valid: false, total: 0, units: 0, specials: 0, ids: [] };
  const deckMode = settings.pvpDeckMode === "custom" ? "custom" : "random";
  const useCustom = concreteFaction && deckMode === "custom" && status.valid;
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

  text(ctx, "对战准备", view.width / 2, top, 24, "#2f2417", "center");
  text(ctx, pvp.pendingRoomId ? `准备加入房间 ${pvp.pendingRoomId}` : "先选择阵营、主将与卡牌，再进入房间", view.width / 2, top + 26, 12, "#775c34", "center");

  fillRoundRect(ctx, panelX, panelY, panelW, panelH, 18, "rgba(255, 250, 240, 0.94)", "#dcc48d");
  drawSectionTitle(ctx, "我的出战配置", contentX, panelY + 28);
  drawRow(ctx, actions, { id: "pvpFaction", label: "阵营", value: faction === "random" ? "随机" : (FACTION_LABELS[faction] || faction), x: contentX, y: panelY + 58, w: rowW, fill: "#2f6f57" }, dropdownField === "pvpFaction", anchors);
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

  const statusText = faction === "random"
    ? "随机阵营会在开房或加入时确定，并使用随机卡牌。选择具体阵营后可使用自定义牌组。"
    : (status.valid
      ? `自定义牌组已完成：${status.total}张；本局${useCustom ? "使用自定义卡牌" : "使用随机卡牌"}。`
      : `自定义牌组未完成：${status.total}/40张；可编辑卡牌，或直接使用随机卡牌。`);
  fillRoundRect(ctx, contentX, panelY + 160, rowW, 62, 12, "rgba(255, 249, 235, 0.88)", "rgba(216, 189, 131, 0.7)");
  wrapText(ctx, statusText, contentX + 12, panelY + 178, rowW - 24, 16, 3, 11, useCustom ? "#2f6f57" : "#8d6840");

  drawSectionTitle(ctx, "卡牌模式", contentX, panelY + 252);
  const randomBtn = { id: "pvpDeckMode", value: "random", x: contentX, y: panelY + 274, w: (rowW - 10) / 2, h: 38 };
  const customBtn = { id: "pvpDeckMode", value: "custom", x: randomBtn.x + randomBtn.w + 10, y: randomBtn.y, w: randomBtn.w, h: 38 };
  drawModeButton(ctx, actions, randomBtn, !useCustom, "随机卡牌", "#8d6840");
  drawModeButton(ctx, actions, customBtn, useCustom, "自定义卡牌", "#2f6f57");

  const edit = { id: "editPvpCustomDeck", x: contentX, y: panelY + 326, w: rowW, h: 38 };
  actions.push(edit);
  button(ctx, { ...edit, label: concreteFaction ? "编辑该阵营卡牌" : "先选择具体阵营", fill: concreteFaction ? "#8f3c1f" : "#b6a98e", stroke: concreteFaction ? "#6d2d18" : "#a89a80", size: 13 });

  const create = { id: "pvpCreatePrepared", x: 46, y: bottom + 22, w: view.width - 92, h: 46 };
  const join = { id: "pvpJoinPrepared", x: 46, y: bottom + 78, w: view.width - 92, h: 42 };
  const back = { id: "back", x: 46, y: bottom + 130, w: view.width - 92, h: 42 };
  actions.push(create, join, back);
  button(ctx, { ...create, label: "开房间邀请好友", fill: "#2f6f57", stroke: "#1d4f3c", size: 14 });
  button(ctx, { ...join, label: pvp.pendingRoomId ? `加入房间 ${pvp.pendingRoomId}` : "输入房间号加入", fill: "#4f6d8a", stroke: "#36516a", size: 13 });
  button(ctx, { ...back, label: "返回首页", fill: "#8d6840", stroke: "#6f4d29", size: 13 });

  drawDropdown(ctx, view, actions, settings, dropdownField, anchors);
  if (detail) {
    const swipeOffset = ui.detailSwipe ? ui.detailSwipe.offset || 0 : 0;
    drawDetail(ctx, view, actions, detail, { closeHint: "点击空白处返回对战准备", swipeOffset });
  }
}

module.exports = { draw };
