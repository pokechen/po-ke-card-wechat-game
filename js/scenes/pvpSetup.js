const { clear, text, button, fillRoundRect, wrapText, short, drawCardImage, drawTopLeftBack } = require("../ui/canvas");
const { loadSettings, getActiveCustomDeckIds } = require("../core/storage");
const { FACTION_KEYS, FACTION_LABELS, deckStatus, leadersFor, displayName, cardSummary, cardById, factionPerkSummary, isPassiveLeaderCard } = require("../core/cards");
const { drawDetail } = require("./cardDetail");

function shortText(value, max) {
  const textValue = String(value || "");
  return textValue.length > max ? `${textValue.slice(0, max - 1)}…` : textValue;
}

function leaderSkill(card) {
  if (!card) return "随机确定主将技能";
  // 被动主将无需发动，标注「被动技能」区分主动技能。
  return `${isPassiveLeaderCard(card) ? "被动技能" : "技能"}：${cardSummary(card)}`;
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
    return [{ value: "random", label: "随机阵容", hint: "阵营、主将、卡牌均在开局时随机确定" }].concat(FACTION_KEYS.map(value => ({ value, label: FACTION_LABELS[value] || value, hint: factionPerkSummary(value) })));
  }
  if (field === "pvpRuleFaction") {
    return [
      { value: "random", label: "随机阵容", hint: "双方的阵营、主将、卡牌均在开局时随机确定" },
      { value: "any", label: "不限", hint: "双方各自选择阵营并触发对应被动" }
    ].concat(FACTION_KEYS.map(value => ({ value, label: FACTION_LABELS[value] || value, hint: factionPerkSummary(value) })));
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
  const rich = spec.card || (spec.subtitle && rectH > 38);
  button(ctx, { ...rect, label: rich ? "" : `${spec.value} ${spec.disabled ? "" : (opened ? "▴" : "▾")}`, fill: spec.disabled ? "#b6a98e" : (spec.fill || "#2f6f57"), size: 12, r: spec.r });
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
    if (spec.subtitle && rectH > 40) text(ctx, shortText(spec.subtitle || "", spec.card ? 20 : 24), textX, rect.y + 36, 9, "#efe6ff");
    text(ctx, spec.disabled ? "锁" : (opened ? "▴" : "▾"), rect.x + rect.w - 24, rect.y + rect.h / 2, 12, "#fff7d8", "center");
  }
}

function drawDropdown(ctx, view, actions, settings, field, anchors, forcedFaction = null) {
  const anchor = anchors[field];
  if (!anchor) return;
  const options = setupOptions(settings, field, forcedFaction);
  if (!options.length) return;
  const faction = forcedFaction || currentFaction(settings);
  const ruleFaction = settings.pvpRuleFactionMode === "random"
    ? "random"
    : (settings.pvpRuleFactionMode === "fixed" && FACTION_KEYS.includes(settings.pvpRuleFaction) ? settings.pvpRuleFaction : "any");
  const selected = field === "pvpFaction" ? faction : (field === "pvpRuleFaction" ? ruleFaction : selectedLeaderValue(settings, faction));
  const showHint = options.some(option => option.hint);
  const isLeader = field === "pvpLeader";
  const optionHeights = options.map(() => showHint ? 68 : 38);
  const menuW = showHint ? Math.min(view.width - 36, anchor.w + 72) : anchor.w;
  const menuH = optionHeights.reduce((sum, height) => sum + height, 0);
  const menuX = Math.max(8, Math.min(anchor.x - (menuW - anchor.w), view.width - menuW - 8));
  const menuY = Math.max(view.safeTop + 8, Math.min(anchor.y + anchor.h + 6, view.height - view.safeBottom - menuH - 8));

  actions.push({ id: "closePvpSetupDropdown", x: 0, y: 0, w: view.width, h: view.height });
  ctx.save();
  ctx.fillStyle = "rgba(38, 28, 18, 0.2)";
  ctx.fillRect(0, 0, view.width, view.height);
  ctx.restore();
  fillRoundRect(ctx, menuX, menuY, menuW, menuH, 12, "#fffaf0", "#2f6f57");
  let optionY = menuY;
  options.forEach((option, index) => {
    const itemH = optionHeights[index];
    const y = optionY;
    optionY += itemH;
    const active = option.value === selected;
    const optionCard = isLeader && option.cardId ? cardById(option.cardId) : null;
    actions.push({ id: "selectPvpSetupOption", field, value: option.value, cardId: optionCard?.id || "", x: menuX, y, w: menuW, h: itemH });
    if (active) fillRoundRect(ctx, menuX + 4, y + 3, menuW - 8, itemH - 6, 9, "#2f6f57");
    else if (index > 0) {
      ctx.strokeStyle = "rgba(119, 92, 52, 0.2)";
      ctx.beginPath();
      ctx.moveTo(menuX + 10, y);
      ctx.lineTo(menuX + menuW - 10, y);
      ctx.stroke();
    }
    if (showHint) {
      let textX = menuX + 16;
      let textW = menuW - 32;
      if (optionCard) {
        const avatarSize = Math.min(48, itemH - 12);
        const avatarX = menuX + 10;
        const avatarY = y + (itemH - avatarSize) / 2;
        drawCardImage(ctx, { ...optionCard, imageFill: true, imageX: avatarX, imageY: avatarY, imageW: avatarSize, imageH: avatarSize });
        textX = avatarX + avatarSize + 10;
        textW = menuX + menuW - 14 - textX;
      }
      text(ctx, shortText(option.label, optionCard ? 12 : 18), textX, y + 20, 13, active ? "#ffffff" : "#2f2417");
      wrapText(ctx, option.hint || "", textX, y + 40, textW, 14, 2, 10, active ? "#efe6ff" : "#775c34");
    } else {
      text(ctx, shortText(option.label, 18), menuX + menuW / 2, y + itemH / 2, 13, active ? "#ffffff" : "#2f2417", "center");
    }
  });
}

function drawModeButton(ctx, actions, rect, active, label, fill) {
  actions.push(rect);
  button(ctx, { ...rect, label, fill: active ? fill : "#fffaf0", stroke: active ? fill : "#dcc48d", color: active ? "#ffffff" : "#775c34", size: 12 });
}

function drawPrepareScreen(ctx, view, actions, ui, pvp, settings) {
  const rules = {
    factionMode: ["fixed", "random"].includes(settings.pvpRuleFactionMode) ? settings.pvpRuleFactionMode : "any",
    faction: FACTION_KEYS.includes(settings.pvpRuleFaction) ? settings.pvpRuleFaction : FACTION_KEYS[0],
    deckMode: settings.pvpRuleDeckMode === "autoOnly" ? "autoOnly" : "any"
  };
  const dropdownField = ui.matchSetupDropdown || "";
  const anchors = {};

  const top = view.safeTop + 28;
  drawTopLeftBack(ctx, view, actions, "back");
  text(ctx, "联网对战", view.width / 2, top, 24, "#2f2417", "center");

  const panelX = 20;
  const panelW = view.width - 40;
  const panelH = 264;
  const createH = 50;
  const bottomLimit = view.height - view.safeBottom - 30;
  const panelYBase = top + 118;
  const panelY = Math.max(top + 86, Math.min(panelYBase, bottomLimit - createH - 22 - panelH));
  const joinW = pvp.pendingRoomId ? 112 : 100;
  const join = { id: "pvpJoinPrepared", x: panelX + panelW - joinW, y: panelY - 48, w: joinW, h: 36 };
  actions.push(join);
  button(ctx, { ...join, label: "加入房间", fill: "rgba(255, 250, 240, 0.62)", stroke: "#d1ad6a", color: "#775c34", size: 13, r: 10, shadow: false, gloss: false });
  const contentX = panelX + 20;
  const rowW = panelW - 40;
  const accent = "#2f6f57";

  fillRoundRect(ctx, panelX, panelY, panelW, panelH, 20, "rgba(255, 250, 240, 0.82)", "#dcc48d");
  text(ctx, "房间规则", view.width / 2, panelY + 26, 18, "#2f2417", "center");

  const factionTitleY = panelY + 60;
  const factionRowY = panelY + 90;
  const factionRowH = 38;
  const deckTitleY = panelY + 148;
  const deckDescY = panelY + 172;
  const deckY = panelY + 212;
  const deckH = 36;

  drawSectionTitle(ctx, "阵营规则", contentX, factionTitleY);
  const factionRuleLabel = rules.factionMode === "random" ? "随机阵容" : (rules.factionMode === "fixed" ? `指定：${FACTION_LABELS[rules.faction] || rules.faction}` : "阵营不限");
  drawRow(ctx, actions, {
    id: "pvpRuleFaction",
    label: "阵营",
    labelW: 64,
    value: factionRuleLabel,
    x: contentX,
    y: factionRowY,
    w: rowW,
    h: factionRowH,
    fill: accent,
    disabled: false
  }, dropdownField === "pvpRuleFaction", anchors);

  drawSectionTitle(ctx, "卡牌规则", contentX, deckTitleY);
  fillRoundRect(ctx, contentX, deckDescY - 12, rowW, 34, 10, "rgba(255, 250, 240, 0.66)", "rgba(216, 189, 131, 0.75)");
  wrapText(ctx, rules.factionMode === "random"
    ? "随机阵容已包含随机卡牌，双方不能使用自定义牌组。"
    : "不限可自定义或自动；仅自动则双方只能用系统卡牌。", contentX + 10, deckDescY + 2, rowW - 20, 14, 2, 10, "#775c34");
  if (rules.factionMode === "random") {
    button(ctx, { id: "pvpRandomDeckRule", x: contentX, y: deckY, w: rowW, h: deckH, label: "随机阵容 · 随机卡牌", fill: "rgba(182, 169, 142, 0.72)", stroke: "#a89a80", color: "#fff7d8", size: 12, shadow: false });
  } else {
    const halfW = (rowW - 10) / 2;
    drawModeButton(ctx, actions, { id: "pvpRuleDeckMode", value: "any", x: contentX, y: deckY, w: halfW, h: deckH }, rules.deckMode === "any", "卡牌不限", accent);
    drawModeButton(ctx, actions, { id: "pvpRuleDeckMode", value: "autoOnly", x: contentX + halfW + 10, y: deckY, w: halfW, h: deckH }, rules.deckMode === "autoOnly", "仅自动卡牌", accent);
  }

  const create = { id: "pvpCreatePrepared", x: 54, y: panelY + panelH + 18, w: view.width - 108, h: createH };
  actions.push(create);
  button(ctx, { ...create, label: "创建房间", fill: accent, stroke: "#1d4f3c", size: 17, r: 18 });

  drawDropdown(ctx, view, actions, settings, dropdownField, anchors);
}

function drawSelectingScreen(ctx, view, actions, ui, pvp, settings) {
  const roomRules = pvp.room?.rules || {};
  const rules = {
    factionMode: ["fixed", "random"].includes(roomRules.factionMode) ? roomRules.factionMode : "any",
    faction: FACTION_KEYS.includes(roomRules.faction) ? roomRules.faction : FACTION_KEYS[0],
    deckMode: roomRules.deckMode === "autoOnly" ? "autoOnly" : "any"
  };
  const factionLocked = rules.factionMode !== "any";
  const deckLocked = rules.deckMode === "autoOnly" || rules.factionMode === "random";
  const faction = rules.factionMode === "random" ? "random" : (factionLocked ? rules.faction : currentFaction(settings));
  const concreteFaction = faction !== "random";
  const selectedIds = concreteFaction ? getActiveCustomDeckIds(settings, faction) : [];
  const status = concreteFaction ? deckStatus(selectedIds, faction) : { valid: false, total: 0, units: 0, strategies: 0, ids: [] };
  const deckMode = deckLocked ? "random" : (settings.pvpDeckMode === "custom" ? "custom" : "random");
  const useCustom = !deckLocked && concreteFaction && deckMode === "custom" && status.valid;
  const leader = selectedLeader(settings, faction);
  const leaderLabel = faction === "random" || settings.pvpLeaderIds?.[faction] === "random" ? "随机" : short(leader ? displayName(leader) : "未选择", 14);
  const top = view.safeTop + 28;
  const panelX = 18;
  const panelW = view.width - 36;
  const panelY = top + 48;
  const bottom = view.height - view.safeBottom - 100;
  const panelH = Math.max(380, bottom - panelY);
  const contentX = panelX + 20;
  const rowW = panelW - 40;
  const dropdownField = ui.matchSetupDropdown || "";
  const anchors = {};

  drawTopLeftBack(ctx, view, actions, "pvpRoomBack");
  text(ctx, "选择出战配置", view.width / 2, top, 24, "#2f2417", "center");
  const factionRuleTip = rules.factionMode === "random" ? "随机阵容" : (factionLocked ? `指定${FACTION_LABELS[rules.faction] || rules.faction}` : "不限");
  const deckRuleTip = rules.factionMode === "random" ? "随机" : (deckLocked ? "仅自动" : "不限");
  const ruleTip = `规则：阵营${factionRuleTip}；卡牌${deckRuleTip}`;
  text(ctx, ruleTip, view.width / 2, top + 26, 12, "#8f3c1f", "center");

  fillRoundRect(ctx, panelX, panelY, panelW, panelH, 18, "rgba(255, 250, 240, 0.94)", "#dcc48d");
  drawSectionTitle(ctx, "我的出战配置", contentX, panelY + 28);
  drawRow(ctx, actions, {
    id: "pvpFaction",
    label: "阵营",
    value: faction === "random" ? "随机阵容" : (FACTION_LABELS[faction] || faction),
    x: contentX,
    y: panelY + 52,
    w: rowW,
    h: 38,
    fill: "#2f6f57",
    disabled: factionLocked
  }, dropdownField === "pvpFaction" && !factionLocked, anchors);
  drawRow(ctx, actions, {
    id: "pvpLeader",
    label: "主将",
    value: leaderLabel,
    card: leader,
    cardId: leader?.id,
    x: contentX,
    y: panelY + 100,
    w: rowW,
    h: 38,
    fill: "#7a5a95",
    disabled: rules.factionMode === "random"
  }, dropdownField === "pvpLeader" && rules.factionMode !== "random", anchors);

  const statusText = rules.factionMode === "random"
    ? "房间规则为随机阵容，本局阵营、主将与卡牌均由系统随机确定。"
    : (deckLocked
      ? "房间规则为仅自动卡牌，本局不能选择自定义牌组。"
      : (faction === "random"
        ? "随机阵容会在开局时随机确定阵营、主将与卡牌。选择具体阵营后可使用自定义牌组。"
        : (status.valid
          ? `自定义牌组已完成：${status.total}张，总分${status.score}；本局${useCustom ? "使用自定义卡牌" : "使用随机卡牌"}。`
          : `自定义牌组未完成：${status.total}/40张，总分${status.score}；可编辑卡牌，或直接使用随机卡牌。`)));
  fillRoundRect(ctx, contentX, panelY + 160, rowW, 62, 12, "rgba(255, 249, 235, 0.88)", "rgba(216, 189, 131, 0.7)");
  wrapText(ctx, statusText, contentX + 12, panelY + 178, rowW - 24, 16, 3, 11, useCustom ? "#2f6f57" : "#8d6840");

  drawSectionTitle(ctx, "卡牌模式", contentX, panelY + 252);
  if (rules.factionMode === "random") {
    button(ctx, { id: "pvpRandomDeckMode", x: contentX, y: panelY + 274, w: rowW, h: 38, label: "随机阵容 · 随机卡牌", fill: "#b6a98e", stroke: "#a89a80", size: 12 });
  } else {
    const randomBtn = { id: "pvpDeckMode", value: "random", x: contentX, y: panelY + 274, w: (rowW - 10) / 2, h: 38 };
    const customBtn = { id: "pvpDeckMode", value: "custom", x: randomBtn.x + randomBtn.w + 10, y: randomBtn.y, w: randomBtn.w, h: 38 };
    drawModeButton(ctx, actions, randomBtn, !useCustom, "随机卡牌", "#8d6840");
    drawModeButton(ctx, actions, customBtn, useCustom, "自定义卡牌", "#2f6f57");
  }

  const edit = { id: "editPvpCustomDeck", x: contentX, y: panelY + 326, w: rowW, h: 38 };
  if (rules.factionMode !== "random") actions.push(edit);
  button(ctx, { ...edit, label: rules.factionMode === "random" ? "随机阵容已锁定" : (deckLocked ? "房间仅自动卡牌" : (concreteFaction ? "编辑该阵营卡牌" : "先选择具体阵营")), fill: concreteFaction && !deckLocked ? "#8f3c1f" : "#b6a98e", stroke: concreteFaction && !deckLocked ? "#6d2d18" : "#a89a80", size: 13 });

  const me = pvp.room?.players?.[pvp.playerIndex] || {};
  const submit = { id: "pvpSubmitSetup", x: 46, y: bottom + 34, w: view.width - 92, h: 48 };
  actions.push(submit);
  button(ctx, { ...submit, label: me.setupReady ? "已确认，等待对方" : "确认出战配置", fill: me.setupReady ? "#b5892f" : "#2f6f57", stroke: me.setupReady ? "#8f6b20" : "#1d4f3c", size: 14 });

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
