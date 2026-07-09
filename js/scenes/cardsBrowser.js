const { clear, text, button, fillRoundRect, wrapText, short, drawCardImage } = require("../ui/canvas");
const { allCards, categoryLabel, FACTION_KEYS, FACTION_LABELS, ABILITY_LABELS, cardSummary, cardById, displayName, abilityNames, abilityDescriptions, ROW_LABELS } = require("../core/cards");

const FACTION_FILTERS = ["all"].concat(FACTION_KEYS, "Neutral");
const CATEGORY_FILTERS = ["all", "leader", "unit", "hero", "special", "weather"];
const CATEGORY_LABELS = { all: "全部类型", leader: "主将", unit: "人物", hero: "传世", special: "谋略", weather: "时局" };

function categoryFilterLabel(value) {
  return CATEGORY_LABELS[value] || CATEGORY_LABELS.all;
}

function factionFilterLabel(value) {
  return value === "all" ? "全部阵营" : (FACTION_LABELS[value] || value);
}

function factionFilterOptions() {
  return FACTION_FILTERS.map(value => ({ value, label: factionFilterLabel(value) }));
}

function categoryFilterOptions() {
  return CATEGORY_FILTERS.map(value => ({ value, label: categoryFilterLabel(value) }));
}

function nextFactionFilter(current) {
  const idx = FACTION_FILTERS.indexOf(current || "all");
  return FACTION_FILTERS[(idx + 1 + FACTION_FILTERS.length) % FACTION_FILTERS.length];
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

function getPageLayout(view) {
  const top = view.safeTop + 26;
  const bottom = view.height - view.safeBottom - 52;
  const filtersTop = top + 34;
  const listTop = filtersTop + 92;
  const rowGap = 76;
  const hintTop = bottom - 26;
  const pageSize = Math.max(3, Math.floor((hintTop - listTop) / rowGap));
  return { top, bottom, filtersTop, listTop, pageSize, rowGap };
}

function getPageState(view, ui, targetPage) {
  const layout = getPageLayout(view);
  const cards = filteredCards(ui);
  const totalPages = Math.max(1, Math.ceil(cards.length / layout.pageSize));
  const page = targetPage == null ? (ui.cardPage || 0) : targetPage;
  const safePage = Math.max(0, Math.min(page, totalPages - 1));
  const list = cards.slice(safePage * layout.pageSize, safePage * layout.pageSize + layout.pageSize);
  return { ...layout, cards, totalPages, safePage, list };
}

function clampPage(view, ui, page) {
  return getPageState(view, ui, page).safePage;
}

function drawFilterDropdown(ctx, view, actions, ui, anchors) {
  const type = ui.cardFilterDropdown;
  if (type !== "faction" && type !== "category") return;
  const anchor = anchors[type];
  const options = type === "faction" ? factionFilterOptions() : categoryFilterOptions();
  const selected = type === "faction" ? (ui.cardFactionFilter || "all") : (ui.cardCategoryFilter || "all");
  const itemH = 30;
  const menuH = options.length * itemH;
  const menuX = Math.max(8, Math.min(anchor.x, view.width - anchor.w - 8));
  const menuY = Math.min(anchor.y + anchor.h + 6, view.height - view.safeBottom - menuH - 8);

  actions.push({ id: "closeFilterDropdown", x: 0, y: 0, w: view.width, h: view.height });
  ctx.save();
  ctx.fillStyle = "rgba(38, 28, 18, 0.18)";
  ctx.fillRect(0, 0, view.width, view.height);
  ctx.restore();
  fillRoundRect(ctx, menuX, menuY, anchor.w, menuH, 12, "#fffaf0", "#2f6f57");
  options.forEach((option, index) => {
    const y = menuY + index * itemH;
    actions.push({ id: "selectFilterOption", filterType: type, value: option.value, x: menuX, y, w: anchor.w, h: itemH });
    if (option.value === selected) fillRoundRect(ctx, menuX + 4, y + 3, anchor.w - 8, itemH - 6, 9, "#2f6f57");
    else if (index > 0) {
      ctx.strokeStyle = "rgba(119, 92, 52, 0.2)";
      ctx.beginPath();
      ctx.moveTo(menuX + 10, y);
      ctx.lineTo(menuX + anchor.w - 10, y);
      ctx.stroke();
    }
    text(ctx, option.label, menuX + anchor.w / 2, y + itemH / 2, 12, option.value === selected ? "#ffffff" : "#2f2417", "center");
  });
}

function drawSearchOverlay(ctx, view, actions, ui) {
  const current = String(ui.cardSearchDraft ?? ui.cardQuery ?? "").trim();
  const keyboardHeight = Math.min(Math.max(Number(ui.keyboardHeight || 0), 0), Math.floor(view.height * 0.45));
  const keyboardTop = view.height - view.safeBottom - keyboardHeight;
  const panelX = 16;
  const panelW = view.width - 32;
  const panelH = 146;
  const panelY = Math.max(view.safeTop + 78, Math.min(keyboardTop - panelH - 10, view.height - view.safeBottom - panelH - 16));
  actions.push({ id: "searchBackdrop", x: 0, y: 0, w: view.width, h: view.height });
  actions.push({ id: "searchPanel", x: panelX, y: panelY, w: panelW, h: panelH });
  ctx.save();
  ctx.fillStyle = "rgba(38, 28, 18, 0.28)";
  ctx.fillRect(0, 0, view.width, view.height);
  ctx.restore();
  fillRoundRect(ctx, panelX, panelY, panelW, panelH, 18, "#fffaf0", "#d1ad6a");
  text(ctx, "搜索卡牌", panelX + 18, panelY + 24, 16, "#2f2417");
  text(ctx, `实时命中 ${filteredCards(ui).length} 张`, panelX + panelW - 18, panelY + 24, 12, "#2f6f57", "right");

  const field = { x: panelX + 18, y: panelY + 44, w: panelW - 36, h: 38 };
  fillRoundRect(ctx, field.x, field.y, field.w, field.h, 12, "#ffffff", "#9fb4c7");
  text(ctx, current || "输入卡牌名 / 能力 / 阵营", field.x + 14, field.y + field.h / 2, 13, current ? "#2f2417" : "#9a8a73");
  if (current) {
    const clear = { id: "searchClear", x: field.x + field.w - 36, y: field.y + 6, w: 26, h: 26 };
    actions.push(clear);
    fillRoundRect(ctx, clear.x, clear.y, clear.w, clear.h, 13, "#eef3f6", "#c5d2dc");
    text(ctx, "×", clear.x + clear.w / 2, clear.y + clear.h / 2, 16, "#6f5a3a", "center");
  }

  const chips = ["主将", "间谍", "时局", "传世"];
  let chipX = field.x;
  chips.forEach(label => {
    const w = 44;
    const chip = { id: "quickSearch", value: label, x: chipX, y: panelY + 92, w, h: 26 };
    actions.push(chip);
    fillRoundRect(ctx, chip.x, chip.y, chip.w, chip.h, 13, current === label ? "#2f6f57" : "#fff7df", current === label ? "#1d4f3c" : "#d7ba7a");
    text(ctx, label, chip.x + chip.w / 2, chip.y + chip.h / 2, 11, current === label ? "#ffffff" : "#6b4a20", "center");
    chipX += w + 8;
  });

  const cancel = { id: "searchCancel", x: panelX + panelW - 134, y: panelY + 92, w: 54, h: 30 };
  const done = { id: "searchDone", x: panelX + panelW - 72, y: panelY + 92, w: 54, h: 30 };
  actions.push(cancel, done);
  button(ctx, { ...cancel, label: "取消", fill: "#8d6840", stroke: "#6f4d29", size: 12 });
  button(ctx, { ...done, label: "完成", fill: "#2f6f57", stroke: "#1d4f3c", size: 12 });
  text(ctx, "键盘输入会实时筛选，点完成收起", panelX + 18, panelY + 132, 11, "#775c34");
}

function wrappedHeight(ctx, content, maxWidth, lineHeight, maxLines, size) {
  const value = String(content || "");
  if (!value) return 0;
  let count = 0;
  ctx.font = `${size || 13}px "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif`;
  value.split(/\n+/).forEach(part => {
    let line = "";
    for (const ch of part) {
      const next = line + ch;
      if (ctx.measureText(next).width > maxWidth && line) {
        count += 1;
        line = ch;
      } else {
        line = next;
      }
    }
    if (line) count += 1;
  });
  return Math.min(count, maxLines || count) * lineHeight;
}

function normalizeDetailText(content) {
  return String(content || "").replace(/[：:，,、。\s]/g, "").toLowerCase();
}

function hasChineseText(content) {
  return /[\u4e00-\u9fff]/.test(String(content || ""));
}

function drawDetail(ctx, view, actions, card) {
  const panelW = Math.min(view.width - 28, 372);
  const panelX = (view.width - panelW) / 2;
  const contentW = panelW - 32;
  const rowName = card.rowDisplayName || (card.row || []).map(row => ROW_LABELS[row]).join("/") || "无固定战线";
  const showStrength = card.strength != null;
  const showRow = rowName && rowName !== "无固定战线";
  const abilityDetail = abilityDescriptions(card).join("\n");
  const rawSummary = cardSummary(card) || "无特殊能力";
  const summary = hasChineseText(rawSummary) ? rawSummary : "主将技能";
  const normalizedSummary = normalizeDetailText(summary);
  const rawLeader = card.leaderAbility || "";
  const leader = hasChineseText(rawLeader) && normalizeDetailText(rawLeader) !== normalizedSummary ? rawLeader : "";
  const flavor = hasChineseText(card.flavor) ? card.flavor : "";
  const sourceText = card.source || card.acquisitionDetails || "";
  const source = hasChineseText(sourceText) ? sourceText : "";
  const imageW = 112;
  const imageH = 112;
  const sections = [
    abilityDetail
      ? { title: "能力", content: abilityDetail, color: "#8f3c1f", lines: 8 }
      : { title: "能力", content: summary, color: "#8f3c1f", lines: 3 },
    leader ? { title: "主将效果", content: leader, color: "#7a5a95", lines: 2 } : null,
    flavor ? { title: "典故", content: flavor, color: "#775c34", lines: 2 } : null,
    source ? { title: "来源", content: source, color: "#4f6d8a", lines: 1 } : null
  ].filter(Boolean);
  const sectionW = contentW;
  let sectionsH = 0;
  sections.forEach(item => {
    sectionsH += 28 + wrappedHeight(ctx, item.content, sectionW - 24, 17, item.lines, 12) + 8;
  });
  const maxPanelH = view.height - view.safeTop - view.safeBottom - 92;
  const panelH = Math.min(maxPanelH, Math.max(430, 238 + sectionsH));
  const panelY = Math.max(view.safeTop + 42, Math.floor((view.height - view.safeBottom - panelH) / 2));
  const headerH = 48;
  const imageX = panelX + 18;
  const imageY = panelY + headerH + 16;
  const infoX = imageX + imageW + 14;
  const infoW = panelX + panelW - 18 - infoX;

  actions.push({ id: "closeDetail", x: 0, y: 0, w: view.width, h: view.height });
  ctx.save();
  ctx.fillStyle = "rgba(28, 21, 14, 0.46)";
  ctx.fillRect(0, 0, view.width, view.height);
  ctx.restore();
  fillRoundRect(ctx, panelX + 2, panelY + 3, panelW, panelH, 18, "rgba(60, 42, 24, 0.16)");
  fillRoundRect(ctx, panelX, panelY, panelW, panelH, 18, "#fffaf0", "#d6b779");
  actions.push({ id: "detailPanel", x: panelX, y: panelY, w: panelW, h: panelH });

  fillRoundRect(ctx, panelX + 10, panelY + 8, panelW - 20, headerH - 8, 14, "#efe2c6", "#dcc48d");
  text(ctx, "卡牌详情", panelX + 22, panelY + 28, 17, "#2f2417");

  fillRoundRect(ctx, imageX - 5, imageY - 5, imageW + 10, imageH + 10, 14, "#f6ecd8", "#d1ad6a");
  drawCardImage(ctx, { ...card, imageX, imageY, imageW, imageH });

  let infoY = imageY + 6;
  text(ctx, short(displayName(card), 10), infoX, infoY, 17, "#2f2417");
  infoY += 22;
  wrapText(ctx, `${FACTION_LABELS[card.faction] || card.faction} · ${categoryLabel(card)}`, infoX, infoY, infoW, 16, 2, 11, "#775c34");
  infoY += 42;
  if (showStrength) {
    fillRoundRect(ctx, infoX, infoY, Math.min(66, infoW), 28, 10, "#fff5dc", "#d1ad6a");
    text(ctx, `战力 ${card.strength}`, infoX + Math.min(66, infoW) / 2, infoY + 14, 13, "#8f3c1f", "center");
    infoY += 38;
  }
  if (showRow) {
    fillRoundRect(ctx, infoX, infoY, infoW, 32, 10, "#f7eedc", "#e0c896");
    wrapText(ctx, rowName, infoX + 9, infoY + 11, infoW - 18, 14, 2, 10, "#6f5a3a");
  }

  let detailY = imageY + imageH + 18;
  const footerY = panelY + panelH - 18;
  const contentBottom = panelY + panelH - 42;
  sections.forEach(item => {
    if (detailY > contentBottom - 36) return;
    const bodyH = Math.min(wrappedHeight(ctx, item.content, sectionW - 24, 17, item.lines, 12), contentBottom - detailY - 28);
    if (bodyH <= 0) return;
    const boxH = bodyH + 30;
    fillRoundRect(ctx, panelX + 16, detailY, sectionW, boxH, 12, "#f8efd9", "#e1c58c");
    text(ctx, item.title, panelX + 28, detailY + 15, 12, item.color);
    wrapText(ctx, item.content, panelX + 28, detailY + 34, sectionW - 24, 17, item.lines, 12, "#3b2b18");
    detailY += boxH + 8;
  });
  text(ctx, "点击空白处返回", panelX + panelW / 2, footerY, 11, "#8a785f", "center");
}

function draw(ctx, view, actions, ui) {
  clear(ctx, view.width, view.height);
  let detail = null;
  if (ui.cardDetailId) {
    detail = cardById(ui.cardDetailId);
    if (!detail) ui.cardDetailId = "";
  }
  const { top, bottom, filtersTop, listTop, rowGap, cards, totalPages, safePage, list } = getPageState(view, ui);
  ui.cardPage = safePage;
  text(ctx, "卡牌图鉴", view.width / 2, top, 22, "#2f2417", "center");
  text(ctx, `${safePage + 1}/${totalPages} · 命中 ${cards.length} 张`, view.width / 2, top + 26, 12, "#775c34", "center");
  const half = (view.width - 48) / 2;
  const factionBtn = { id: "filterFaction", x: 18, y: filtersTop, w: half, h: 34 };
  const categoryBtn = { id: "filterCategory", x: 30 + half, y: filtersTop, w: half, h: 34 };
  const searchBtn = { id: "search", x: 18, y: filtersTop + 44, w: half, h: 34 };
  const clearBtn = { id: "clearSearch", x: 30 + half, y: filtersTop + 44, w: half, h: 34 };
  actions.push(factionBtn, categoryBtn, searchBtn, clearBtn);
  const dropdownType = ui.cardFilterDropdown || "";
  button(ctx, { ...factionBtn, label: `${factionFilterLabel(ui.cardFactionFilter || "all")} ${dropdownType === "faction" ? "▴" : "▾"}`, fill: "#2f6f57", size: 12 });
  button(ctx, { ...categoryBtn, label: `${categoryFilterLabel(ui.cardCategoryFilter || "all")} ${dropdownType === "category" ? "▴" : "▾"}`, fill: "#7a5a95", size: 12 });
  button(ctx, { ...searchBtn, label: ui.cardQuery ? `搜索：${short(ui.cardQuery, 8)}` : "搜索卡牌", fill: "#4f6d8a", size: 12 });
  button(ctx, { ...clearBtn, label: "清除筛选", fill: "#8d6840", size: 12 });
  if (!list.length) {
    fillRoundRect(ctx, 24, listTop + 28, view.width - 48, 92, 16, "#fffaf0", "#dcc48d");
    text(ctx, "没有符合条件的卡牌", view.width / 2, listTop + 74, 14, "#775c34", "center");
  }
  list.forEach((card, index) => {
    const y = listTop + index * rowGap;
    const rect = { id: "cardDetail", cardId: card.id, x: 18, y, w: view.width - 36, h: 66 };
    actions.push(rect);
    fillRoundRect(ctx, rect.x, rect.y, rect.w, rect.h, 12, "#fffaf0", "#dcc48d");
    drawCardImage(ctx, { ...card, imageX: 30, imageY: y + 8, imageW: 50, imageH: 50 });
    const textX = 94;
    text(ctx, short(displayName(card), 10), textX, y + 18, 14, "#3b2b18");
    const rowName = card.rowDisplayName || (card.row || []).map(row => ROW_LABELS[row]).join("/") || "无固定战线";
    text(ctx, `${FACTION_LABELS[card.faction] || card.faction} · ${categoryLabel(card)} · ${rowName}`, textX, y + 40, 11, "#775c34");
    text(ctx, String(card.strength == null ? "策" : card.strength), view.width - 44, y + 18, 18, "#8f3c1f", "center");
    wrapText(ctx, cardSummary(card), textX, y + 56, view.width - 154, 15, 1, 10, "#6f5a3a");
    const detail = { id: "cardDetail", cardId: card.id, x: view.width - 72, y: y + 36, w: 48, h: 22 };
    actions.push(detail);
    button(ctx, { ...detail, label: "详情", fill: "#4f6d8a", stroke: "#36516a", size: 10, r: 8 });
  });
  text(ctx, "上下滑动翻页 · 点击卡牌展开详细说明", view.width / 2, bottom - 14, 11, "#775c34", "center");
  const back = { id: "back", x: 46, y: bottom, w: view.width - 92, h: 40 };
  actions.push(back);
  button(ctx, { ...back, label: "返回首页", size: 13, fill: "#8d6840" });
  drawFilterDropdown(ctx, view, actions, ui, { faction: factionBtn, category: categoryBtn });
  if (ui.cardSearchActive) drawSearchOverlay(ctx, view, actions, ui);
  if (detail) drawDetail(ctx, view, actions, detail);
}

module.exports = { draw, drawDetail, nextFactionFilter, nextCategoryFilter, clampPage };
