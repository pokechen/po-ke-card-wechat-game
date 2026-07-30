const { clear, text, button, fillRoundRect, wrapText, short, drawCardImage, drawTopLeftBack } = require("../ui/canvas");
const { loadSettings, getActiveCustomDeckIds } = require("../core/storage");
const { FACTION_KEYS, FACTION_LABELS, DIFFICULTY_LABELS, deckStatus, leadersFor, displayName, cardSummary, cardById, factionPerkSummary } = require("../core/cards");
const { drawDetail } = require("./cardDetail");

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

function leaderSkill(card) {
  return card ? `技能：${cardSummary(card)}` : "暂无技能";
}

function currentHumanFaction(settings) {
  return settings.humanLineupMode === "random" ? "random" : settings.humanFaction;
}

function setupOptions(settings, field, slots, faction) {
  const humanFaction = currentHumanFaction(settings);
  if (field === "humanFaction") {
    return [{ value: "random", label: "随机阵容", hint: "阵营、主将、卡牌均在开局时随机确定" }].concat(
      FACTION_KEYS.map(value => ({ value, label: FACTION_LABELS[value] || value, hint: factionPerkSummary(value) }))
    );
  }
  if (field === "aiFaction") {
    return [{ value: "random", label: "随机", hint: "开局随机确定阵营被动" }].concat(FACTION_KEYS.map(value => ({ value, label: FACTION_LABELS[value] || value, hint: factionPerkSummary(value) })));
  }
  if (field === "humanLeader") {
    if (humanFaction === "random") return [{ value: "random", label: "随机", hint: "随阵营随机确定主将" }];
    return leadersFor(humanFaction).map(card => ({ value: card.id, label: displayName(card), hint: leaderSkill(card) }));
  }
  if (field === "aiLeader") {
    if (settings.aiFaction === "random") return [{ value: "random", label: "随机" }];
    return [{ value: "random", label: "随机" }].concat(
      leadersFor(settings.aiFaction).map(card => ({ value: card.id, label: displayName(card), hint: leaderSkill(card) }))
    );
  }
  if (field === "difficulty") {
    return ["easy", "normal", "hard"].map(value => ({ value, label: DIFFICULTY_LABELS[value] }));
  }
  return [];
}

function selectedValue(settings, field) {
  const humanFaction = currentHumanFaction(settings);
  if (field === "humanFaction") return humanFaction;
  if (field === "humanLeader") return humanFaction === "random" ? "random" : (selectedLeader(settings, "human", humanFaction)?.id || "");
  if (field === "aiFaction") return settings.aiFaction === "random" ? "random" : settings.aiFaction;
  if (field === "aiLeader") {
    if (settings.aiFaction === "random") return "random";
    return settings.aiLeaderIds?.[settings.aiFaction] === "random" ? "random" : (selectedLeader(settings, "ai", settings.aiFaction)?.id || "");
  }
  if (field === "difficulty") return settings.difficulty;
  return "";
}

function detailLeaderCards(settings, detailId) {
  const humanFaction = currentHumanFaction(settings);
  const candidates = [humanFaction === "random" ? [] : leadersFor(humanFaction)];
  if (settings.aiFaction !== "random") candidates.push(leadersFor(settings.aiFaction));
  return candidates.find(list => list.some(card => card.id === detailId)) || candidates.reduce((all, list) => all.concat(list), []);
}

function drawSectionTitle(ctx, label, x, y) {
  fillRoundRect(ctx, x, y - 8, 4, 16, 2, "#d3a44f");
  text(ctx, label, x + 10, y, 13, "#3b2b18");
}

function drawInfoCard(ctx, content, x, y, w, h, color) {
  const compact = h <= 38;
  fillRoundRect(ctx, x, y, w, h, 12, "rgba(255, 249, 235, 0.88)", "rgba(216, 189, 131, 0.7)");
  wrapText(ctx, content, x + 12, compact ? y + h / 2 : y + 13, w - 24, 15, compact ? 1 : 2, 10, color || "#775c34");
}

function drawRow(ctx, actions, spec, opened, anchors) {
  const labelW = spec.labelW || 78;
  const rectH = spec.h || 36;
  text(ctx, spec.label, spec.x, spec.y, 12, "#775c34");
  const rect = { id: spec.id, x: spec.x + labelW, y: spec.y - rectH / 2, w: spec.w - labelW, h: rectH };
  anchors[spec.id] = rect;
  actions.push(rect);
  if (spec.cardId) rect.cardId = spec.cardId;
  const rich = spec.card || (spec.subtitle && rectH > 36);
  button(ctx, { ...rect, label: rich ? "" : `${spec.value} ${opened ? "▴" : "▾"}`, fill: spec.fill || "#2f6f57", size: 12, r: spec.r });

  if (rich) {
    let textX = rect.x + 18;
    if (spec.card) {
      const avatarSize = Math.min(26, rect.h - 8);
      const avatar = { x: rect.x + 10, y: rect.y + (rect.h - avatarSize) / 2, w: avatarSize, h: avatarSize };
      drawCardImage(ctx, { ...spec.card, imageFill: true, imageX: avatar.x, imageY: avatar.y, imageW: avatar.w, imageH: avatar.h });
      textX = avatar.x + avatar.w + 10;
    }
    const textY = spec.subtitle && rectH > 40 ? rect.y + 18 : rect.y + rect.h / 2;
    text(ctx, shortText(spec.value, spec.card ? 14 : 16), textX, textY, 12, "#ffffff");
    if (spec.subtitle && rectH > 40) text(ctx, shortText(spec.subtitle, spec.card ? 20 : 24), textX, rect.y + 36, 9, "#efe6ff");
    text(ctx, opened ? "▴" : "▾", rect.x + rect.w - 24, rect.y + rect.h / 2, 12, "#fff7d8", "center");
  }
}

function drawSetupDropdown(ctx, view, actions, settings, field, anchors, closeId = "closeMatchSetupDropdown") {
  const anchor = anchors[field];
  if (!anchor) return;
  const options = setupOptions(settings, field);
  if (!options.length) return;
  const selected = selectedValue(settings, field);
  const showHint = options.some(option => option.hint);
  const isLeader = field.includes("Leader");
  const itemH = showHint ? 68 : 38;
  const menuW = showHint ? Math.min(view.width - 36, anchor.w + 72) : anchor.w;
  const menuH = options.length * itemH;
  const menuX = Math.max(8, Math.min(anchor.x - (menuW - anchor.w), view.width - menuW - 8));
  const menuY = Math.max(view.safeTop + 8, Math.min(anchor.y + anchor.h + 6, view.height - view.safeBottom - menuH - 8));

  actions.push({ id: closeId, x: 0, y: 0, w: view.width, h: view.height });
  ctx.save();
  ctx.fillStyle = "rgba(38, 28, 18, 0.2)";
  ctx.fillRect(0, 0, view.width, view.height);
  ctx.restore();
  fillRoundRect(ctx, menuX, menuY, menuW, menuH, 12, "#fffaf0", "#2f6f57");
  options.forEach((option, index) => {
    const y = menuY + index * itemH;
    const active = option.value === selected;
    actions.push({ id: "selectMatchSetupOption", field, value: option.value, cardId: isLeader && option.value !== "random" ? option.value : "", x: menuX, y, w: menuW, h: itemH });
    if (active) fillRoundRect(ctx, menuX + 4, y + 3, menuW - 8, itemH - 6, 9, "#2f6f57");
    else if (index > 0) {
      ctx.strokeStyle = "rgba(119, 92, 52, 0.2)";
      ctx.beginPath();
      ctx.moveTo(menuX + 10, y);
      ctx.lineTo(menuX + menuW - 10, y);
      ctx.stroke();
    }
    if (showHint) {
      text(ctx, shortText(option.label, 18), menuX + 16, y + 20, 13, active ? "#ffffff" : "#2f2417");
      wrapText(ctx, option.hint || "", menuX + 16, y + 40, menuW - 32, 14, 2, 10, active ? "#efe6ff" : "#775c34");
    } else {
      text(ctx, shortText(option.label, 18), menuX + menuW / 2, y + itemH / 2, 13, active ? "#ffffff" : "#2f2417", "center");
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
  const faction = currentHumanFaction(settings);
  const randomLineup = faction === "random";
  const selectedIds = randomLineup ? [] : getActiveCustomDeckIds(settings, faction);
  const status = randomLineup ? { valid: false, total: 0, ids: [] } : deckStatus(selectedIds, faction);
  const useCustomDeck = !randomLineup && status.valid && settings.customDeckEnabled;
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
  const bottom = view.height - view.safeBottom - 64;
  const panelH = Math.max(442, bottom - panelY - 12);
  const contentX = panelX + 20;
  const rowW = panelW - 40;
  const dropdownField = ui.matchSetupDropdown || "";
  const anchors = {};

  drawTopLeftBack(ctx, view, actions, "back");
  text(ctx, "单机准备", view.width / 2, top, 24, "#2f2417", "center");
  text(ctx, "选择主将、牌组与对手，开始单机对局", view.width / 2, top + 26, 12, "#775c34", "center");

  fillRoundRect(ctx, panelX, panelY, panelW, panelH, 18, "rgba(255, 250, 240, 0.94)", "#dcc48d");
  drawSectionTitle(ctx, "我的牌组", contentX, panelY + 28);
  drawRow(ctx, actions, { id: "humanFaction", label: "阵营", value: randomLineup ? "随机阵容" : (FACTION_LABELS[faction] || faction), x: contentX, y: panelY + 58, w: rowW, fill: "#2f6f57" }, dropdownField === "humanFaction", anchors);
  drawRow(ctx, actions, {
    id: "humanLeader",
    label: "主将",
    value: randomLineup ? "随机" : short(humanLeader ? displayName(humanLeader) : "未选择", 14),
    card: humanLeader,
    cardId: humanLeader?.id,
    x: contentX,
    y: panelY + 106,
    w: rowW,
    fill: "#7a5a95"
  }, dropdownField === "humanLeader", anchors);

  const statusText = randomLineup
    ? "开局时随机确定阵营、主将与卡牌。"
    : (status.valid
      ? `自定义牌组已完成：${status.total}张，总分${status.score}，本局${useCustomDeck ? "使用自定义" : "使用随机"}。`
      : `自定义牌组未完成：${status.total}/40，总分${status.score}，可编辑或随机开局。`);
  drawInfoCard(ctx, statusText, contentX, panelY + 160, rowW, 34, randomLineup ? "#2f6f57" : (status.valid ? (useCustomDeck ? "#2f6f57" : "#8d6840") : "#8f3c1f"));

  if (randomLineup) {
    drawInfoCard(ctx, "本局阵容全部随机生成", contentX, panelY + 218, rowW, 36, "#8d6840");
  } else if (status.valid) {
    const toggle = { id: "togglePreparedDeckMode", x: contentX, y: panelY + 218, w: (rowW - 10) / 2, h: 36 };
    const edit = { id: "editCustomDeck", x: toggle.x + toggle.w + 10, y: panelY + 218, w: toggle.w, h: 36 };
    actions.push(toggle, edit);
    button(ctx, { ...toggle, label: useCustomDeck ? "本局：自定义" : "本局：随机", fill: useCustomDeck ? "#2f6f57" : "#8d6840", stroke: useCustomDeck ? "#1d4f3c" : "#6f4d29", size: 12 });
    button(ctx, { ...edit, label: "编辑卡牌", fill: "#8f3c1f", stroke: "#6d2d18", size: 12 });
  } else {
    const edit = { id: "editCustomDeck", x: contentX, y: panelY + 218, w: rowW, h: 36 };
    actions.push(edit);
    button(ctx, { ...edit, label: "编辑该阵营卡牌", fill: "#8f3c1f", stroke: "#6d2d18", size: 13 });
  }

  drawSectionTitle(ctx, "系统对手", contentX, panelY + 270);
  drawRow(ctx, actions, { id: "aiFaction", label: "阵营", value: aiFactionLabel, x: contentX, y: panelY + 298, w: rowW, fill: "#4f6d8a" }, dropdownField === "aiFaction", anchors);
  drawRow(ctx, actions, {
    id: "aiLeader",
    label: "主将",
    value: aiLeaderLabel,
    subtitle: "",
    card: aiLeader,
    cardId: aiLeader?.id,
    x: contentX,
    y: panelY + 344,
    w: rowW,
    fill: "#7a5a95"
  }, dropdownField === "aiLeader", anchors);
  drawRow(ctx, actions, { id: "difficulty", label: "难度", value: DIFFICULTY_LABELS[settings.difficulty], x: contentX, y: panelY + 390, w: rowW, fill: "#8d6840" }, dropdownField === "difficulty", anchors);

  const start = { id: "startPrepared", x: 46, y: bottom, w: view.width - 92, h: 46 };
  actions.push(start);
  button(ctx, { ...start, label: randomLineup ? "使用随机阵容开始" : (useCustomDeck ? "使用该阵营牌组开始" : "随机卡牌开始"), fill: "#2f6f57", stroke: "#1d4f3c", size: 15 });
  drawSetupDropdown(ctx, view, actions, settings, dropdownField, anchors);
  if (detail) {
    const leaders = detailLeaderCards(settings, detail.id);
    const currentIdx = leaders.findIndex(card => card.id === detail.id);
    const leftCard = currentIdx > 0 ? leaders[currentIdx - 1] : null;
    const rightCard = currentIdx >= 0 && currentIdx < leaders.length - 1 ? leaders[currentIdx + 1] : null;
    const swipeOffset = ui.detailSwipe ? ui.detailSwipe.offset || 0 : 0;
    drawDetail(ctx, view, actions, detail, { closeHint: "点击空白处返回单机准备", leftCard, rightCard, swipeOffset });
  }
}

module.exports = { draw, setupOptions, selectedValue, drawRow, drawSetupDropdown, selectedLeader, currentHumanFaction };
