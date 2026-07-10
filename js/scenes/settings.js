const { clear, text, button, fillRoundRect, wrapText, short, drawCardImage } = require("../ui/canvas");
const { loadSettings, getActiveCustomDeckIds } = require("../core/storage");
const { FACTION_KEYS, FACTION_LABELS, ROW_LABELS, deckStatus, leadersFor, eligibleCards, groupCards, cardValue, categoryLabel, displayName, cardSummary, cardById } = require("../core/cards");
const { drawDetail } = require("./cardDetail");

const CARD_TABS = [
  { value: "all", label: "全部" },
  { value: "melee", label: ROW_LABELS.melee || "疆场" },
  { value: "ranged", label: ROW_LABELS.ranged || "朝堂" },
  { value: "siege", label: ROW_LABELS.siege || "文脉" },
  { value: "hero", label: "传世" },
  { value: "special", label: "谋略/时局" }
];

function selectedLeader(settings, faction) {
  const leaders = leadersFor(faction);
  return leaders.find(card => card.id === settings.humanLeaderIds?.[faction]) || leaders[0] || null;
}

function shortText(value, max) {
  const textValue = String(value || "");
  return textValue.length > max ? `${textValue.slice(0, max - 1)}…` : textValue;
}

function leaderSkill(card) {
  return card ? `技能：${cardSummary(card)}` : "暂无技能";
}

function canAddCard(status, card) {
  if (status.total >= 40) return false;
  if ((card.category === "special" || card.category === "weather") && status.specials >= 10) return false;
  return true;
}

function settingOptions(settings, field) {
  if (field === "humanLeader") {
    return leadersFor(settings.humanFaction).map(card => ({ value: card.id, label: displayName(card), hint: leaderSkill(card) }));
  }
  return [];
}

function optionSelectedValue(settings, field) {
  if (field === "humanLeader") return selectedLeader(settings, settings.humanFaction)?.id || "";
  return "";
}

function pageLayout(view) {
  const top = view.safeTop + 28;
  const factionY = top + 48;
  const leaderY = top + 84;
  const statusY = top + 120;
  const tabY = top + 150;
  const listTop = top + 188;
  const bottomY = view.height - view.safeBottom - 48;
  const toolY = bottomY - 48;
  const listBottom = toolY - 24;
  const pageSize = Math.max(3, Math.min(6, Math.floor((listBottom - listTop) / 68)));
  return { top, factionY, leaderY, statusY, toolY, tabY, listTop, bottomY, listBottom, pageSize };
}

function filteredCardGroups(faction, tab) {
  const active = tab || "all";
  const cards = eligibleCards(faction).filter(card => {
    if (active === "all") return true;
    if (active === "special") return card.category === "special" || card.category === "weather";
    if (active === "hero") return !!card.hero;
    if (!(card.category === "unit" || card.category === "hero")) return false;
    return (card.row || []).includes(active);
  });
  return groupCards(cards).sort((a, b) => cardValue(b.card) - cardValue(a.card));
}

function selectedCount(ids, group) {
  const groupIds = new Set(group.cards.map(card => card.id));
  return ids.filter(id => groupIds.has(id)).length;
}

function clampPage(view, ui, targetPage) {
  const settings = loadSettings();
  const { pageSize } = pageLayout(view);
  const totalPages = Math.max(1, Math.ceil(filteredCardGroups(settings.humanFaction, ui.settingCardTab || "all").length / pageSize));
  const page = targetPage == null ? (ui.settingDeckPage || 0) : targetPage;
  return Math.max(0, Math.min(page, totalPages - 1));
}

function drawSettingDropdown(ctx, view, actions, settings, field, anchors) {
  const anchor = anchors[field];
  if (!anchor) return;
  const options = settingOptions(settings, field);
  if (!options.length) return;
  const selected = optionSelectedValue(settings, field);
  const isLeader = field === "humanLeader";
  const itemH = isLeader ? 38 : 34;
  const menuH = options.length * itemH;
  const menuX = Math.max(8, Math.min(anchor.x, view.width - anchor.w - 8));
  const menuY = Math.min(anchor.y + anchor.h + 5, view.height - view.safeBottom - menuH - 8);

  actions.push({ id: "closeSettingDropdown", x: 0, y: 0, w: view.width, h: view.height });
  ctx.save();
  ctx.fillStyle = "rgba(38, 28, 18, 0.2)";
  ctx.fillRect(0, 0, view.width, view.height);
  ctx.restore();
  fillRoundRect(ctx, menuX, menuY, anchor.w, menuH, 12, "#fffaf0", "#2f6f57");
  options.forEach((option, index) => {
    const y = menuY + index * itemH;
    const active = option.value === selected;
    actions.push({ id: "selectSettingOption", field, value: option.value, cardId: option.value, x: menuX, y, w: anchor.w, h: itemH });
    if (active) fillRoundRect(ctx, menuX + 4, y + 3, anchor.w - 8, itemH - 6, 9, "#2f6f57");
    else if (index > 0) {
      ctx.strokeStyle = "rgba(119, 92, 52, 0.2)";
      ctx.beginPath();
      ctx.moveTo(menuX + 10, y);
      ctx.lineTo(menuX + anchor.w - 10, y);
      ctx.stroke();
    }
    text(ctx, shortText(option.label, isLeader ? 14 : 18), menuX + anchor.w / 2, y + (isLeader ? 14 : itemH / 2), 12, active ? "#ffffff" : "#2f2417", "center");
    if (isLeader) {
      text(ctx, shortText(option.hint, 20), menuX + anchor.w / 2, y + 29, 8, active ? "#efe6ff" : "#775c34", "center");
      text(ctx, "长按看详情", menuX + anchor.w - 8, y + itemH / 2, 9, active ? "#e6dcff" : "#9a8a6f", "right");
    }
  });
}

function drawFactionTabs(ctx, view, actions, faction, y) {
  const gap = 4;
  const x0 = 14;
  const tabW = (view.width - x0 * 2 - gap * (FACTION_KEYS.length - 1)) / FACTION_KEYS.length;
  FACTION_KEYS.forEach((key, index) => {
    const rect = { id: "selectSettingFaction", faction: key, x: x0 + index * (tabW + gap), y, w: tabW, h: 28 };
    actions.push(rect);
    const active = key === faction;
    fillRoundRect(ctx, rect.x, rect.y, rect.w, rect.h, 10, active ? "#2f6f57" : "#fffaf0", active ? "#1d4f3c" : "#dcc48d");
    text(ctx, shortText(FACTION_LABELS[key] || key, 4), rect.x + rect.w / 2, rect.y + rect.h / 2, 10, active ? "#ffffff" : "#775c34", "center");
  });
}

function drawCardTabs(ctx, view, actions, activeTab, y) {
  const gap = 6;
  const x0 = 18;
  const tabW = (view.width - x0 * 2 - gap * (CARD_TABS.length - 1)) / CARD_TABS.length;
  CARD_TABS.forEach((tab, index) => {
    const rect = { id: "settingCardTab", value: tab.value, x: x0 + index * (tabW + gap), y, w: tabW, h: 30 };
    actions.push(rect);
    const active = (activeTab || "all") === tab.value;
    fillRoundRect(ctx, rect.x, rect.y, rect.w, rect.h, 10, active ? "#2f6f57" : "#fffaf0", active ? "#1d4f3c" : "#dcc48d");
    text(ctx, tab.label, rect.x + rect.w / 2, rect.y + rect.h / 2, tab.value === "special" ? 9 : 11, active ? "#ffffff" : "#775c34", "center");
  });
}

function draw(ctx, view, actions, ui = {}) {
  clear(ctx, view.width, view.height);
  let detail = null;
  if (ui.settingCardDetailId) {
    detail = cardById(ui.settingCardDetailId);
    if (!detail) ui.settingCardDetailId = "";
  }
  const settings = loadSettings();
  const faction = settings.humanFaction;
  const selectedIds = getActiveCustomDeckIds(settings, faction);
  const status = deckStatus(selectedIds, faction);
  const humanLeader = selectedLeader(settings, faction);
  const cardTab = ui.settingCardTab || "all";
  const page = ui.settingDeckPage || 0;
  const layout = pageLayout(view);
  const anchors = {};
  const groups = filteredCardGroups(faction, cardTab);
  const totalPages = Math.max(1, Math.ceil(groups.length / layout.pageSize));
  const safePage = Math.max(0, Math.min(page, totalPages - 1));
  const list = groups.slice(safePage * layout.pageSize, safePage * layout.pageSize + layout.pageSize + 1);
  const transitionY = ui.pageTransition?.scene === "settings" ? ui.pageTransition.offset || 0 : 0;

  text(ctx, "我的牌组", view.width / 2, layout.top, 24, "#2f2417", "center");
  text(ctx, `${FACTION_LABELS[faction]} · 自定义牌组 · ${safePage + 1}/${totalPages}`, view.width / 2, layout.top + 25, 12, "#775c34", "center");
  drawFactionTabs(ctx, view, actions, faction, layout.factionY);

  const leaderRect = { id: "humanLeader", cardId: humanLeader ? humanLeader.id : "", x: 18, y: layout.leaderY, w: view.width - 36, h: 30 };
  anchors.humanLeader = leaderRect;
  actions.push(leaderRect);
  fillRoundRect(ctx, leaderRect.x, leaderRect.y, leaderRect.w, leaderRect.h, 10, "#7a5a95", "#1d4f3c");
  text(ctx, `领袖：${shortText(humanLeader ? displayName(humanLeader) : "未选择", 14)} ▾`, leaderRect.x + leaderRect.w / 2, leaderRect.y + 15, 12, "#ffffff", "center");
  if (humanLeader) text(ctx, "长按看详情", leaderRect.x + leaderRect.w - 10, leaderRect.y + 15, 10, "#e6dcff", "right");

  drawCardTabs(ctx, view, actions, cardTab, layout.tabY);

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, layout.listTop - 4, view.width, layout.listBottom - layout.listTop + 4);
  ctx.clip();
  list.forEach((group, index) => {
    const card = group.card;
    const y = layout.listTop + index * 68 + transitionY;
    const count = selectedCount(selectedIds, group);
    const selected = count > 0;
    const full = count >= group.cards.length;
    const disabled = (!selected && !canAddCard(status, card)) || full;
    const groupIds = group.cards.map(item => item.id);
    const rect = { id: "addSettingCard", cardIds: groupIds, cardId: card.id, x: 18, y, w: view.width - 36, h: 58 };
    actions.push(rect);
    fillRoundRect(ctx, rect.x, rect.y, rect.w, rect.h, 12, selected ? "#eff8ef" : (disabled ? "#eee7da" : "#fffaf0"), selected ? "#2f6f57" : "#dcc48d");
    drawCardImage(ctx, { ...card, imageX: rect.x + 10, imageY: rect.y + 8, imageW: 42, imageH: 42 });
    const x = rect.x + 62;
    const maxCount = group.cards.length;
    const baseName = short(displayName(card), 9);
    const nameText = maxCount > 1 ? `${baseName} x${maxCount}` : baseName;
    text(ctx, nameText, x, y + 15, 13, disabled ? "#8a8170" : "#3b2b18");
    if (selected && maxCount > 1) {
      fillRoundRect(ctx, x + 92, y + 5, 34, 20, 10, "#2f6f57", "#1d4f3c");
      text(ctx, `${count}/${maxCount}`, x + 109, y + 15, 11, "#fff7d8", "center");
    }
    const rowName = (card.row || []).map(row => ROW_LABELS[row]).join("/") || "谋略/时局";
    text(ctx, `${categoryLabel(card)} · ${rowName} · ${card.strength == null ? "策" : card.strength}`, x, y + 34, 11, "#775c34");
    wrapText(ctx, cardSummary(card), x, y + 50, view.width - 178, 13, 1, 10, "#6f5a3a");
    text(ctx, "长按看详情", view.width - 22, y + 41, 10, "#9a8a6f", "right");
  });
  ctx.restore();
  if (safePage < totalPages - 1) {
    ctx.save();
    const fade = ctx.createLinearGradient ? ctx.createLinearGradient(0, layout.listBottom - 30, 0, layout.listBottom) : null;
    if (fade) { fade.addColorStop(0, "rgba(255,250,240,0)"); fade.addColorStop(1, "rgba(255,250,240,0.92)"); ctx.fillStyle = fade; }
    else ctx.fillStyle = "rgba(255,250,240,0.72)";
    ctx.fillRect(0, layout.listBottom - 30, view.width, 30);
    ctx.restore();
  }

  const statusColor = status.valid ? "#2f6f57" : "#8f3c1f";
  text(ctx, `已选 ${status.total}/40 · 人物 ${status.units}/22 · 谋略/时局 ${status.specials}/10`, view.width / 2, layout.toolY - 16, 12, statusColor, "center");
  const auto = { id: "autoCustomDeck", x: 18, y: layout.toolY, w: (view.width - 42) / 2, h: 30 };
  const clearBtn = { id: "clearCustomDeck", x: auto.x + auto.w + 6, y: layout.toolY, w: auto.w, h: 30 };
  actions.push(auto, clearBtn);
  button(ctx, { ...auto, label: "随机推荐", fill: "#2f6f57", size: 11, r: 10 });
  button(ctx, { ...clearBtn, label: "清空", fill: "#8f3c1f", stroke: "#6d2d18", size: 11, r: 10 });
  const back = { id: "back", x: 46, y: layout.bottomY, w: view.width - 92, h: 40 };
  actions.push(back);
  button(ctx, { ...back, label: "返回首页", fill: "#8d6840", stroke: "#6f4d29", size: 13 });
  drawSettingDropdown(ctx, view, actions, settings, ui.settingDropdown || "", anchors);
  if (detail) {
    const currentIdx = groups.findIndex(g => g.card.id === detail.id);
    const leftCard = currentIdx > 0 ? groups[currentIdx - 1].card : null;
    const rightCard = currentIdx >= 0 && currentIdx < groups.length - 1 ? groups[currentIdx + 1].card : null;
    const swipeOffset = ui.detailSwipe ? ui.detailSwipe.offset || 0 : 0;
    drawDetail(ctx, view, actions, detail, { closeHint: "点击空白处返回我的牌组", leftCard, rightCard, swipeOffset });
  }
}

function nextFaction(current) {
  const idx = FACTION_KEYS.indexOf(current);
  return FACTION_KEYS[(idx + 1 + FACTION_KEYS.length) % FACTION_KEYS.length];
}

function nextDifficulty(current) {
  const keys = ["easy", "normal", "hard"];
  const idx = keys.indexOf(current);
  return keys[(idx + 1 + keys.length) % keys.length];
}

function nextLeaderId(current, faction) {
  const leaders = leadersFor(faction);
  if (!leaders.length) return "";
  const idx = leaders.findIndex(card => card.id === current);
  return leaders[(idx + 1 + leaders.length) % leaders.length].id;
}

module.exports = { draw, clampPage, nextFaction, nextDifficulty, nextLeaderId };
