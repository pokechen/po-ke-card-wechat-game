const { clear, text, button, fillRoundRect, card, drawTopLeftBack } = require("../ui/canvas");
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

const COLUMNS = 4;
const GAP = 8;
const CARD_RATIO = 1.38;

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
  const factionY = top + 66;
  const leaderY = top + 102;
  const tabY = leaderY + 38;
  const listTop = tabY + 38;
  const bottomY = view.height - view.safeBottom - 12;
  const toolY = bottomY - 36;
  const listBottom = toolY - 16;
  return { top, factionY, leaderY, toolY, tabY, listTop, bottomY, listBottom };
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

let deckViewCache = null;

function invalidateDeckViewCache() {
  deckViewCache = null;
}

function deckViewModel(ui = {}) {
  const cardTab = ui.settingCardTab || "all";
  if (ui.settingDeckScrolling && deckViewCache && deckViewCache.cardTab === cardTab) return deckViewCache;

  const settings = loadSettings();
  const faction = settings.humanFaction;
  const selectedIds = getActiveCustomDeckIds(settings, faction);
  const leaderId = settings.humanLeaderIds?.[faction] || "";
  const cacheKey = `${faction}|${cardTab}|${leaderId}|${selectedIds.join(",")}`;
  if (deckViewCache && deckViewCache.cacheKey === cacheKey) return deckViewCache;

  const selectedSet = new Set(selectedIds);
  const groups = filteredCardGroups(faction, cardTab).map(group => {
    const cardIds = group.cards.map(card => card.id);
    let selectedCount = 0;
    cardIds.forEach(id => {
      if (selectedSet.has(id)) selectedCount += 1;
    });
    return { ...group, cardIds, selectedCount };
  });
  deckViewCache = {
    cacheKey,
    cardTab,
    settings,
    faction,
    selectedIds,
    status: deckStatus(selectedIds, faction),
    humanLeader: selectedLeader(settings, faction),
    groups
  };
  return deckViewCache;
}

function scrollBounds(view, itemCount) {
  const layout = pageLayout(view);
  const margin = 14;
  const cardW = Math.floor((view.width - margin * 2 - GAP * (COLUMNS - 1)) / COLUMNS);
  const cardH = Math.round(cardW * CARD_RATIO);
  const rowStep = cardH + GAP;
  const rows = Math.ceil(itemCount / COLUMNS);
  const viewportH = Math.max(0, layout.listBottom - layout.listTop);
  const contentH = rows ? rows * rowStep - GAP : 0;
  return { ...layout, viewportH, contentH, maxScroll: Math.max(0, contentH - viewportH), margin, cardW, cardH, rowStep };
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
  const model = deckViewModel(ui);
  const { settings, faction, status, humanLeader, cardTab, groups } = model;
  const scrollY = ui.settingDeckScroll || 0;
  const anchors = {};
  const bounds = scrollBounds(view, groups.length);
  const safeScroll = Math.max(0, Math.min(scrollY || 0, bounds.maxScroll));
  const statusColor = status.valid ? "#2f6f57" : "#8f3c1f";

  drawTopLeftBack(ctx, view, actions, "back");
  text(ctx, "我的牌组", view.width / 2, bounds.top, 24, "#2f2417", "center");
  text(ctx, `${FACTION_LABELS[faction]} · 已选 ${status.total}/40 · 总战力 ${status.score}`, view.width / 2, bounds.top + 25, 12, statusColor, "center");
  text(ctx, `人物 ${status.units}/22 · 谋略/时局 ${status.specials}/10`, view.width / 2, bounds.top + 45, 11, "#775c34", "center");
  drawFactionTabs(ctx, view, actions, faction, bounds.factionY);

  const leaderRect = { id: "humanLeader", cardId: humanLeader ? humanLeader.id : "", x: 18, y: bounds.leaderY, w: view.width - 36, h: 30 };
  anchors.humanLeader = leaderRect;
  actions.push(leaderRect);
  fillRoundRect(ctx, leaderRect.x, leaderRect.y, leaderRect.w, leaderRect.h, 10, "#7a5a95", "#1d4f3c");
  text(ctx, `领袖：${shortText(humanLeader ? displayName(humanLeader) : "未选择", 14)} ▾`, leaderRect.x + leaderRect.w / 2, leaderRect.y + 15, 12, "#ffffff", "center");

  drawCardTabs(ctx, view, actions, cardTab, bounds.tabY);

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, bounds.listTop - 4, view.width, bounds.listBottom - bounds.listTop + 4);
  ctx.clip();
  const startRow = Math.floor(safeScroll / bounds.rowStep);
  const offsetY = -(safeScroll % bounds.rowStep);
  const visibleRows = Math.ceil(bounds.viewportH / bounds.rowStep) + 1;
  const isScrolling = !!ui.settingDeckScrolling;
  const startIdx = startRow * COLUMNS;
  const endIdx = Math.min(groups.length, (startRow + visibleRows) * COLUMNS);
  for (let i = startIdx; i < endIdx; i++) {
    const group = groups[i];
    if (!group) continue;
    const item = group.card;
    const col = i % COLUMNS;
    const row = Math.floor(i / COLUMNS) - startRow;
    const x = bounds.margin + col * (bounds.cardW + GAP);
    const y = bounds.listTop + row * bounds.rowStep + offsetY;
    if (y >= bounds.listBottom || y + bounds.cardH <= bounds.listTop) continue;
    const count = group.selectedCount;
    const selected = count > 0;
    const blocked = !selected && !canAddCard(status, item);
    const groupIds = group.cardIds;
    const hitY = Math.max(bounds.listTop, y);
    const hitBottom = Math.min(bounds.listBottom, y + bounds.cardH);
    actions.push({ id: "addSettingCard", cardIds: groupIds, cardId: item.id, x, y: hitY, w: bounds.cardW, h: hitBottom - hitY });
    card(ctx, {
      id: "addSettingCard",
      cardId: item.id,
      x,
      y,
      w: bounds.cardW,
      h: bounds.cardH,
      fill: selected ? "#eff8ef" : (blocked ? "#eee7da" : "#fffaf0"),
      stroke: selected ? "#2f6f57" : (blocked ? "#c9bdac" : "#d8bd83"),
      name: displayName(item),
      baseName: item.baseName,
      imageUrl: item.imageUrl,
      summary: item.summary || item.abilityText,
      category: categoryLabel(item),
      faction: item.faction,
      row: item.row,
      abilities: item.abilities,
      abilityDisplayNames: item.abilityDisplayNames,
      hero: item.hero,
      strength: item.category === "special" || item.category === "weather" ? "策" : item.strength,
      nameMax: 4,
      count: group.cards.length,
      selectedCount: count,
      skipImageLoad: isScrolling
    });
  }
  ctx.restore();

  if (bounds.maxScroll > 0 && safeScroll < bounds.maxScroll - 0.5) {
    ctx.save();
    const fade = ctx.createLinearGradient ? ctx.createLinearGradient(0, bounds.listBottom - 28, 0, bounds.listBottom) : null;
    if (fade) {
      fade.addColorStop(0, "rgba(247,241,229,0)");
      fade.addColorStop(1, "rgba(247,241,229,0.94)");
      ctx.fillStyle = fade;
    } else ctx.fillStyle = "rgba(247,241,229,0.72)";
    ctx.fillRect(0, bounds.listBottom - 28, view.width, 28);
    ctx.restore();
  }
  if (bounds.maxScroll > 0) {
    const trackX = view.width - 8;
    const trackY = bounds.listTop + 4;
    const trackH = Math.max(30, bounds.viewportH - 8);
    const thumbH = Math.max(30, trackH * bounds.viewportH / bounds.contentH);
    const thumbY = trackY + (trackH - thumbH) * (safeScroll / bounds.maxScroll);
    fillRoundRect(ctx, trackX, trackY, 3, trackH, 1.5, "rgba(119,92,52,0.18)");
    fillRoundRect(ctx, trackX - 1, thumbY, 5, thumbH, 2.5, "rgba(47,111,87,0.72)");
  }

  const auto = { id: "autoCustomDeck", x: 18, y: bounds.toolY, w: (view.width - 42) / 2, h: 30 };
  const clearBtn = { id: "clearCustomDeck", x: auto.x + auto.w + 6, y: bounds.toolY, w: auto.w, h: 30 };
  actions.push(auto, clearBtn);
  button(ctx, { ...auto, label: "随机推荐", fill: "#2f6f57", size: 11, r: 10 });
  button(ctx, { ...clearBtn, label: "清空", fill: "#8f3c1f", stroke: "#6d2d18", size: 11, r: 10 });
  drawSettingDropdown(ctx, view, actions, settings, ui.settingDropdown || "", anchors);
  if (detail) {
    const detailCards = detail.category === "leader" ? leadersFor(faction) : groups.map(group => group.card);
    const currentIdx = detailCards.findIndex(card => card.id === detail.id);
    const leftCard = currentIdx > 0 ? detailCards[currentIdx - 1] : null;
    const rightCard = currentIdx >= 0 && currentIdx < detailCards.length - 1 ? detailCards[currentIdx + 1] : null;
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

function scrollMetrics(view, ui = {}) {
  return scrollBounds(view, deckViewModel(ui).groups.length);
}

module.exports = { draw, scrollBounds, scrollMetrics, invalidateDeckViewCache, nextFaction, nextDifficulty, nextLeaderId };
