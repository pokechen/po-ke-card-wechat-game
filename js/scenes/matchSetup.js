const { clear, text, button, fillRoundRect, wrapText, short, drawCardImage } = require("../ui/canvas");
const { loadSettings, getCustomDeckSlots, getActiveCustomDeckSlotIndex, getActiveCustomDeckIds } = require("../core/storage");
const { FACTION_KEYS, FACTION_LABELS, DIFFICULTY_LABELS, deckStatus, leadersFor, displayName, cardSummary, cardById } = require("../core/cards");
const { drawDetail } = require("./cardsBrowser");

function selectedLeader(settings, side, faction) {
  if (faction === "random") return null;
  const store = side === "ai" ? settings.aiLeaderIds : settings.humanLeaderIds;
  const leaders = leadersFor(faction);
  return leaders.find(card => card.id === store?.[faction]) || leaders[0] || null;
}

function shortText(value, max) {
  const textValue = String(value || "");
  return textValue.length > max ? `${textValue.slice(0, max - 1)}…` : textValue;
}

function slotLabel(slot, index, faction) {
  const status = deckStatus(slot.ids, faction);
  const name = slot.name || `牌组${index + 1}`;
  if (status.valid) return `${name} · 已存 · ${status.total}张`;
  if (status.total) return `${name} · 未完成 · ${status.total}张`;
  return `${name} · 空`;
}

function leaderSkill(card) {
  return card ? `技能：${cardSummary(card)}` : "暂无技能";
}

function setupOptions(settings, field, slots, faction) {
  if (field === "humanFaction") {
    return FACTION_KEYS.map(value => ({ value, label: FACTION_LABELS[value] || value }));
  }
  if (field === "aiFaction") {
    return [{ value: "random", label: "随机" }].concat(FACTION_KEYS.map(value => ({ value, label: FACTION_LABELS[value] || value })));
  }
  if (field === "humanLeader") {
    return leadersFor(settings.humanFaction).map(card => ({ value: card.id, label: displayName(card), hint: leaderSkill(card) }));
  }
  if (field === "aiLeader") {
    if (settings.aiFaction === "random") return [{ value: "random", label: "随机", hint: "开局时随机主将" }];
    return [{ value: "random", label: "随机", hint: "开局时随机主将" }].concat(
      leadersFor(settings.aiFaction).map(card => ({ value: card.id, label: displayName(card), hint: leaderSkill(card) }))
    );
  }
  if (field === "customDeckSlot") {
    return slots.map((slot, index) => ({ value: String(index), label: slotLabel(slot, index, faction) }));
  }
  if (field === "difficulty") {
    return ["easy", "normal", "hard"].map(value => ({ value, label: DIFFICULTY_LABELS[value] }));
  }
  return [];
}

function selectedValue(settings, field, activeSlot) {
  if (field === "humanFaction") return settings.humanFaction;
  if (field === "humanLeader") return selectedLeader(settings, "human", settings.humanFaction)?.id || "";
  if (field === "customDeckSlot") return String(activeSlot);
  if (field === "aiFaction") return settings.aiFaction === "random" ? "random" : settings.aiFaction;
  if (field === "aiLeader") {
    if (settings.aiFaction === "random") return "random";
    return settings.aiLeaderIds?.[settings.aiFaction] === "random" ? "random" : (selectedLeader(settings, "ai", settings.aiFaction)?.id || "");
  }
  if (field === "difficulty") return settings.difficulty;
  return "";
}

function drawSectionTitle(ctx, label, x, y) {
  fillRoundRect(ctx, x, y - 8, 4, 16, 2, "#d3a44f");
  text(ctx, label, x + 10, y, 13, "#3b2b18");
}

function drawInfoCard(ctx, content, x, y, w, h, color) {
  fillRoundRect(ctx, x, y, w, h, 12, "rgba(255, 249, 235, 0.88)", "rgba(216, 189, 131, 0.7)");
  wrapText(ctx, content, x + 12, y + 13, w - 24, 15, 2, 10, color || "#775c34");
}

function drawRow(ctx, actions, spec, opened, anchors) {
  const labelW = spec.labelW || 78;
  const rectH = spec.h || 36;
  text(ctx, spec.label, spec.x, spec.y, 12, "#775c34");
  const rect = { id: spec.id, x: spec.x + labelW, y: spec.y - rectH / 2, w: spec.w - labelW, h: rectH };
  anchors[spec.id] = rect;
  actions.push(rect);
  const rich = spec.card || (spec.subtitle && rectH > 36);
  button(ctx, { ...rect, label: rich ? "" : `${spec.value} ${opened ? "▴" : "▾"}`, fill: spec.fill || "#2f6f57", size: 12, r: spec.r });

  if (rich) {
    const rightPad = spec.cardId ? 62 : 24;
    let textX = rect.x + 18;
    if (spec.card) {
      const avatar = { x: rect.x + 9, y: rect.y + 7, w: 34, h: rect.h - 14 };
      drawCardImage(ctx, { ...spec.card, imageFill: true, imageX: avatar.x, imageY: avatar.y, imageW: avatar.w, imageH: avatar.h });
      textX = avatar.x + avatar.w + 10;
    }
    text(ctx, shortText(spec.value, spec.card ? 12 : 16), textX, rect.y + 18, 12, "#ffffff");
    text(ctx, shortText(spec.subtitle || "暂无技能", spec.card ? 20 : 24), textX, rect.y + 36, 9, "#efe6ff");
    text(ctx, opened ? "▴" : "▾", rect.x + rect.w - rightPad, rect.y + rect.h / 2, 12, "#fff7d8", "center");
  }

  if (spec.cardId) {
    const detail = { id: "matchSetupCardDetail", cardId: spec.cardId, x: rect.x + rect.w - 44, y: rect.y + (rect.h - 24) / 2, w: 30, h: 24 };
    actions.push(detail);
    fillRoundRect(ctx, detail.x, detail.y, detail.w, detail.h, 8, "rgba(79,109,138,0.94)", "#36516a");
    text(ctx, "详", detail.x + detail.w / 2, detail.y + detail.h / 2, 10, "#fff7d8", "center");
  }
}

function drawSetupDropdown(ctx, view, actions, settings, field, anchors, slots, faction, activeSlot) {
  const anchor = anchors[field];
  if (!anchor) return;
  const options = setupOptions(settings, field, slots, faction);
  if (!options.length) return;
  const selected = selectedValue(settings, field, activeSlot);
  const isLeader = field.includes("Leader");
  const itemH = isLeader ? 42 : (field === "customDeckSlot" ? 38 : 34);
  const menuH = options.length * itemH;
  const menuX = Math.max(8, Math.min(anchor.x, view.width - anchor.w - 8));
  const menuY = Math.min(anchor.y + anchor.h + 6, view.height - view.safeBottom - menuH - 8);

  actions.push({ id: "closeMatchSetupDropdown", x: 0, y: 0, w: view.width, h: view.height });
  ctx.save();
  ctx.fillStyle = "rgba(38, 28, 18, 0.2)";
  ctx.fillRect(0, 0, view.width, view.height);
  ctx.restore();
  fillRoundRect(ctx, menuX, menuY, anchor.w, menuH, 12, "#fffaf0", "#2f6f57");
  options.forEach((option, index) => {
    const y = menuY + index * itemH;
    const active = option.value === selected;
    actions.push({ id: "selectMatchSetupOption", field, value: option.value, x: menuX, y, w: anchor.w, h: itemH });
    if (active) fillRoundRect(ctx, menuX + 4, y + 3, anchor.w - 8, itemH - 6, 9, "#2f6f57");
    else if (index > 0) {
      ctx.strokeStyle = "rgba(119, 92, 52, 0.2)";
      ctx.beginPath();
      ctx.moveTo(menuX + 10, y);
      ctx.lineTo(menuX + anchor.w - 10, y);
      ctx.stroke();
    }
    text(ctx, shortText(option.label, isLeader ? 16 : 18), menuX + anchor.w / 2, y + (isLeader ? 15 : itemH / 2), 12, active ? "#ffffff" : "#2f2417", "center");
    if (isLeader) {
      text(ctx, shortText(option.hint, 24), menuX + anchor.w / 2, y + 31, 9, active ? "#efe6ff" : "#775c34", "center");
      if (option.value !== "random") {
        const detail = { id: "matchSetupCardDetail", cardId: option.value, x: menuX + anchor.w - 42, y: y + 9, w: 34, h: 24 };
        actions.push(detail);
        fillRoundRect(ctx, detail.x, detail.y, detail.w, detail.h, 8, "rgba(79,109,138,0.94)", "#36516a");
        text(ctx, "详", detail.x + detail.w / 2, detail.y + detail.h / 2, 10, "#fff7d8", "center");
      }
    }
  });
}

function draw(ctx, view, actions, ui = {}) {
  clear(ctx, view.width, view.height);
  let detail = null;
  if (ui.matchSetupCardDetailId) {
    detail = cardById(ui.matchSetupCardDetailId);
    if (!detail) ui.matchSetupCardDetailId = "";
  }
  const settings = loadSettings();
  const faction = settings.humanFaction;
  const slots = getCustomDeckSlots(settings, faction);
  const activeSlot = getActiveCustomDeckSlotIndex(settings, faction);
  const selectedIds = getActiveCustomDeckIds(settings, faction);
  const status = deckStatus(selectedIds, faction);
  const humanLeader = selectedLeader(settings, "human", faction);
  const aiLeader = selectedLeader(settings, "ai", settings.aiFaction);
  const aiFactionLabel = settings.aiFaction === "random" ? "随机" : (FACTION_LABELS[settings.aiFaction] || settings.aiFaction);
  const aiLeaderLabel = settings.aiFaction === "random" || settings.aiLeaderIds?.[settings.aiFaction] === "random"
    ? "随机"
    : short(aiLeader ? displayName(aiLeader) : "未选择", 14);
  const top = view.safeTop + 28;
  const panelX = 18;
  const panelW = view.width - 36;
  const panelY = top + 48;
  const bottom = view.height - view.safeBottom - 108;
  const panelH = Math.max(442, bottom - panelY - 12);
  const contentX = panelX + 20;
  const rowW = panelW - 40;
  const dropdownField = ui.matchSetupDropdown || "";
  const anchors = {};

  text(ctx, "单机准备", view.width / 2, top, 24, "#2f2417", "center");
  text(ctx, "选择主将、牌组与对手，开始单机对局", view.width / 2, top + 26, 12, "#775c34", "center");

  fillRoundRect(ctx, panelX, panelY, panelW, panelH, 18, "rgba(255, 250, 240, 0.94)", "#dcc48d");
  drawSectionTitle(ctx, "我的牌组", contentX, panelY + 28);
  drawRow(ctx, actions, { id: "humanFaction", label: "阵营", value: FACTION_LABELS[faction] || faction, x: contentX, y: panelY + 58, w: rowW, fill: "#2f6f57" }, dropdownField === "humanFaction", anchors);
  drawRow(ctx, actions, {
    id: "humanLeader",
    label: "主将",
    value: short(humanLeader ? displayName(humanLeader) : "未选择", 14),
    subtitle: humanLeader ? cardSummary(humanLeader) : "当前阵营暂无主将",
    card: humanLeader,
    cardId: humanLeader?.id,
    x: contentX,
    y: panelY + 106,
    w: rowW,
    h: 50,
    fill: "#7a5a95"
  }, dropdownField === "humanLeader", anchors);

  drawRow(ctx, actions, { id: "customDeckSlot", label: "牌组", value: slotLabel(slots[activeSlot], activeSlot, faction), x: contentX, y: panelY + 172, w: rowW, fill: "#a1632b" }, dropdownField === "customDeckSlot", anchors);

  const statusText = status.valid
    ? `当前牌组${activeSlot + 1}可出战：${status.total}张，人物${status.units}张，谋略${status.specials}张。`
    : `当前牌组${activeSlot + 1}未完成：${status.total}/40张，至少需要22张人物；可直接自动组牌开始，或手动编辑。`;
  drawInfoCard(ctx, statusText, contentX, panelY + 204, rowW, 46, status.valid ? "#2f6f57" : "#8f3c1f");

  const edit = { id: "editCustomDeck", x: contentX, y: panelY + 262, w: rowW, h: 36 };
  actions.push(edit);
  button(ctx, { ...edit, label: "编辑卡牌", fill: "#8f3c1f", stroke: "#6d2d18", size: 13 });

  drawSectionTitle(ctx, "系统对手", contentX, panelY + 306);
  drawRow(ctx, actions, { id: "aiFaction", label: "阵营", value: aiFactionLabel, x: contentX, y: panelY + 334, w: rowW, fill: "#4f6d8a" }, dropdownField === "aiFaction", anchors);
  drawRow(ctx, actions, {
    id: "aiLeader",
    label: "主将",
    value: aiLeaderLabel,
    subtitle: (settings.aiFaction === "random" || settings.aiLeaderIds?.[settings.aiFaction] === "random") ? "开局时随机主将" : cardSummary(aiLeader),
    card: (settings.aiFaction === "random" || settings.aiLeaderIds?.[settings.aiFaction] === "random") ? null : aiLeader,
    cardId: (settings.aiFaction === "random" || settings.aiLeaderIds?.[settings.aiFaction] === "random") ? "" : aiLeader?.id,
    x: contentX,
    y: panelY + 380,
    w: rowW,
    h: 50,
    fill: "#7a5a95"
  }, dropdownField === "aiLeader", anchors);
  drawRow(ctx, actions, { id: "difficulty", label: "难度", value: DIFFICULTY_LABELS[settings.difficulty], x: contentX, y: panelY + 426, w: rowW, fill: "#8d6840" }, dropdownField === "difficulty", anchors);

  const start = { id: "startPrepared", x: 46, y: bottom, w: view.width - 92, h: 46 };
  const back = { id: "back", x: 46, y: bottom + 58, w: view.width - 92, h: 42 };
  actions.push(start, back);
  button(ctx, { ...start, label: status.valid ? "使用当前牌组开始" : "自动组牌开始", fill: "#2f6f57", stroke: "#1d4f3c", size: 15 });
  button(ctx, { ...back, label: "返回首页", fill: "#8d6840", stroke: "#6f4d29", size: 13 });
  drawSetupDropdown(ctx, view, actions, settings, dropdownField, anchors, slots, faction, activeSlot);
  if (detail) drawDetail(ctx, view, actions, detail, { closeHint: "点击空白处返回单机准备" });
}

module.exports = { draw };
