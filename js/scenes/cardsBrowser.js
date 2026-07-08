const { clear, text, button, fillRoundRect, wrapText, short, drawCardImage } = require("../ui/canvas");
const { allCards, categoryLabel, FACTION_KEYS, FACTION_LABELS, ABILITY_LABELS, cardSummary, cardById, displayName, abilityNames, ROW_LABELS } = require("../core/cards");

const CATEGORY_FILTERS = ["all", "leader", "unit", "hero", "special", "weather"];

function categoryFilterLabel(value) {
  const labels = { all: "全部类型", leader: "主将", unit: "人物", hero: "传世", special: "谋略", weather: "时局" };
  return labels[value] || labels.all;
}

function factionFilterLabel(value) {
  return value === "all" ? "全部阵营" : (FACTION_LABELS[value] || value);
}

function nextFactionFilter(current) {
  const keys = ["all"].concat(FACTION_KEYS, "Neutral");
  const idx = keys.indexOf(current || "all");
  return keys[(idx + 1 + keys.length) % keys.length];
}

function nextCategoryFilter(current) {
  const idx = CATEGORY_FILTERS.indexOf(current || "all");
  return CATEGORY_FILTERS[(idx + 1 + CATEGORY_FILTERS.length) % CATEGORY_FILTERS.length];
}

function cardSearchText(card) {
  return [
    displayName(card), card.name, card.baseName,
    FACTION_LABELS[card.faction], card.faction,
    categoryLabel(card), card.category,
    card.rowDisplayName, ...(card.row || []).map(row => ROW_LABELS[row]),
    cardSummary(card), card.abilityText, card.leaderAbility,
    ...abilityNames(card), ...(card.abilities || []).map(name => ABILITY_LABELS[name] || name)
  ].filter(Boolean).join(" ").toLowerCase();
}

function filteredCards(ui) {
  const faction = ui.cardFactionFilter || "all";
  const category = ui.cardCategoryFilter || "all";
  const query = String(ui.cardQuery || "").trim().toLowerCase();
  return allCards().filter(card => {
    if (faction !== "all" && card.faction !== faction) return false;
    if (category === "hero" && !card.hero) return false;
    else if (category !== "all" && category !== "hero" && card.category !== category) return false;
    if (query && !cardSearchText(card).includes(query)) return false;
    return true;
  });
}

function drawDetail(ctx, view, actions, card) {
  const top = view.safeTop + 28;
  text(ctx, "卡牌详情", view.width / 2, top, 22, "#2f2417", "center");
  fillRoundRect(ctx, 22, top + 36, view.width - 44, view.height - view.safeBottom - top - 106, 18, "#fffaf0", "#dcc48d");
  drawCardImage(ctx, { ...card, imageX: view.width / 2 - 54, imageY: top + 58, imageW: 108, imageH: 142 });
  text(ctx, short(displayName(card), 15), view.width / 2, top + 222, 18, "#2f2417", "center");
  text(ctx, `${FACTION_LABELS[card.faction] || card.faction} · ${categoryLabel(card)} · ${card.rowDisplayName || "-"}`, view.width / 2, top + 248, 12, "#775c34", "center");
  text(ctx, `战力：${card.strength == null ? "-" : card.strength}`, 42, top + 282, 13, "#8f3c1f");
  wrapText(ctx, `能力：${cardSummary(card) || "无"}`, 42, top + 310, view.width - 84, 18, 4, 13, "#3b2b18");
  if (card.leaderAbility) wrapText(ctx, `主将效果：${card.leaderAbility}`, 42, top + 388, view.width - 84, 18, 3, 12, "#775c34");
  const close = { id: "closeDetail", x: 46, y: view.height - view.safeBottom - 58, w: view.width - 92, h: 42 };
  actions.push(close);
  button(ctx, { ...close, label: "返回图鉴", fill: "#8d6840", stroke: "#6f4d29", size: 14 });
}

function draw(ctx, view, actions, ui) {
  clear(ctx, view.width, view.height);
  if (ui.cardDetailId) {
    const detail = cardById(ui.cardDetailId);
    if (detail) return drawDetail(ctx, view, actions, detail);
    ui.cardDetailId = "";
  }
  const page = ui.cardPage || 0;
  const top = view.safeTop + 26;
  const bottom = view.height - view.safeBottom - 52;
  const filtersTop = top + 34;
  const listTop = filtersTop + 92;
  const pageSize = Math.max(3, Math.min(5, Math.floor((bottom - listTop - 8) / 76)));
  const cards = filteredCards(ui);
  const totalPages = Math.max(1, Math.ceil(cards.length / pageSize));
  const safePage = Math.max(0, Math.min(page, totalPages - 1));
  const list = cards.slice(safePage * pageSize, safePage * pageSize + pageSize);
  text(ctx, "卡牌图鉴", view.width / 2, top, 22, "#2f2417", "center");
  text(ctx, `${safePage + 1}/${totalPages} · 命中 ${cards.length} 张`, view.width / 2, top + 26, 12, "#775c34", "center");
  const half = (view.width - 48) / 2;
  const factionBtn = { id: "filterFaction", x: 18, y: filtersTop, w: half, h: 34 };
  const categoryBtn = { id: "filterCategory", x: 30 + half, y: filtersTop, w: half, h: 34 };
  const searchBtn = { id: "search", x: 18, y: filtersTop + 44, w: half, h: 34 };
  const clearBtn = { id: "clearSearch", x: 30 + half, y: filtersTop + 44, w: half, h: 34 };
  actions.push(factionBtn, categoryBtn, searchBtn, clearBtn);
  button(ctx, { ...factionBtn, label: factionFilterLabel(ui.cardFactionFilter || "all"), fill: "#2f6f57", size: 12 });
  button(ctx, { ...categoryBtn, label: categoryFilterLabel(ui.cardCategoryFilter || "all"), fill: "#7a5a95", size: 12 });
  button(ctx, { ...searchBtn, label: ui.cardQuery ? `搜索：${short(ui.cardQuery, 8)}` : "搜索卡牌", fill: "#4f6d8a", size: 12 });
  button(ctx, { ...clearBtn, label: "清除筛选", fill: "#8d6840", size: 12 });
  if (!list.length) {
    fillRoundRect(ctx, 24, listTop + 28, view.width - 48, 92, 16, "#fffaf0", "#dcc48d");
    text(ctx, "没有符合条件的卡牌", view.width / 2, listTop + 74, 14, "#775c34", "center");
  }
  list.forEach((card, index) => {
    const y = listTop + index * 76;
    const rect = { id: "cardDetail", cardId: card.id, x: 18, y, w: view.width - 36, h: 66 };
    actions.push(rect);
    fillRoundRect(ctx, rect.x, rect.y, rect.w, rect.h, 12, "#fffaf0", "#dcc48d");
    drawCardImage(ctx, { ...card, imageX: 30, imageY: y + 8, imageW: 50, imageH: 50 });
    const textX = 94;
    text(ctx, short(displayName(card), 10), textX, y + 18, 14, "#3b2b18");
    const rowName = card.rowDisplayName || (card.row || []).map(row => ROW_LABELS[row]).join("/") || "无固定战线";
    text(ctx, `${FACTION_LABELS[card.faction] || card.faction} · ${categoryLabel(card)} · ${rowName}`, textX, y + 40, 11, "#775c34");
    text(ctx, String(card.strength == null ? "策" : card.strength), view.width - 44, y + 23, 20, "#8f3c1f", "center");
    wrapText(ctx, cardSummary(card), textX, y + 56, view.width - 154, 15, 1, 10, "#6f5a3a");
  });
  const prev = { id: "prev", x: 18, y: bottom, w: 76, h: 40 };
  const next = { id: "next", x: view.width - 94, y: bottom, w: 76, h: 40 };
  const back = { id: "back", x: 108, y: bottom, w: view.width - 216, h: 40 };
  actions.push(prev, back, next);
  button(ctx, { ...prev, label: "上一页", size: 12, fill: "#6b6b5f" });
  button(ctx, { ...back, label: "返回首页", size: 13, fill: "#8d6840" });
  button(ctx, { ...next, label: "下一页", size: 12, fill: "#2f6f57" });
}

module.exports = { draw, nextFactionFilter, nextCategoryFilter };
