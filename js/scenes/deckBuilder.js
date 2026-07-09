const { clear, text, button, fillRoundRect, wrapText, short, drawCardImage } = require("../ui/canvas");
const { loadSettings, MAX_CUSTOM_DECKS, getCustomDeckSlots, getActiveCustomDeckSlotIndex, getActiveCustomDeckIds } = require("../core/storage");
const {
  eligibleCards,
  deckStatus,
  cardValue,
  categoryLabel,
  FACTION_LABELS,
  ROW_LABELS,
  displayName,
  cardSummary,
  cardById
} = require("../core/cards");
const { drawDetail } = require("./cardsBrowser");

function canAddCard(status, card) {
  if (status.total >= 40) return false;
  if ((card.category === "special" || card.category === "weather") && status.specials >= 10) return false;
  return true;
}

function slotLabel(slot, index, faction) {
  const status = deckStatus(slot.ids, faction);
  const name = slot.name || `牌组${index + 1}`;
  if (status.valid) return `${name} · 已存 · ${status.total}张`;
  if (status.total) return `${name} · 未完成 · ${status.total}张`;
  return `${name} · 空`;
}

function drawSlotDropdown(ctx, view, actions, ui, anchor, slots, activeSlot, faction) {
  if (ui.deckSlotDropdown !== "slot") return;
  const itemH = 38;
  const menuH = slots.length * itemH;
  const menuX = Math.max(8, Math.min(anchor.x, view.width - anchor.w - 8));
  const menuY = Math.min(anchor.y + anchor.h + 6, view.height - view.safeBottom - menuH - 8);
  actions.push({ id: "closeDeckSlotDropdown", x: 0, y: 0, w: view.width, h: view.height });
  ctx.save();
  ctx.fillStyle = "rgba(38, 28, 18, 0.2)";
  ctx.fillRect(0, 0, view.width, view.height);
  ctx.restore();
  fillRoundRect(ctx, menuX, menuY, anchor.w, menuH, 12, "#fffaf0", "#2f6f57");
  slots.forEach((slot, index) => {
    const y = menuY + index * itemH;
    const active = index === activeSlot;
    actions.push({ id: "selectDeckSlotOption", slotIndex: index, x: menuX, y, w: anchor.w, h: itemH });
    if (active) fillRoundRect(ctx, menuX + 4, y + 3, anchor.w - 8, itemH - 6, 9, "#2f6f57");
    else if (index > 0) {
      ctx.strokeStyle = "rgba(119, 92, 52, 0.2)";
      ctx.beginPath();
      ctx.moveTo(menuX + 10, y);
      ctx.lineTo(menuX + anchor.w - 10, y);
      ctx.stroke();
    }
    text(ctx, slotLabel(slot, index, faction), menuX + anchor.w / 2, y + itemH / 2, 12, active ? "#ffffff" : "#2f2417", "center");
  });
}

function pageLayout(view) {
  const top = view.safeTop + 26;
  const slotY = top + 58;
  const toolY = top + 98;
  const listTop = top + 140;
  const backY = view.height - view.safeBottom - 50;
  const listBottom = backY - 22;
  const pageSize = Math.max(4, Math.min(7, Math.floor((listBottom - listTop) / 68)));
  return { top, slotY, toolY, listTop, backY, listBottom, pageSize };
}

function clampPage(view, ui, targetPage) {
  const settings = loadSettings();
  const faction = settings.humanFaction;
  const { pageSize } = pageLayout(view);
  const cards = eligibleCards(faction);
  const totalPages = Math.max(1, Math.ceil(cards.length / pageSize));
  const page = targetPage == null ? (ui.deckPage || 0) : targetPage;
  return Math.max(0, Math.min(page, totalPages - 1));
}

function draw(ctx, view, actions, ui) {
  clear(ctx, view.width, view.height);
  let detail = null;
  if (ui.deckCardDetailId) {
    detail = cardById(ui.deckCardDetailId);
    if (!detail) ui.deckCardDetailId = "";
  }
  const settings = loadSettings();
  const faction = settings.humanFaction;
  const slots = getCustomDeckSlots(settings, faction);
  const activeSlot = getActiveCustomDeckSlotIndex(settings, faction);
  const selectedIds = getActiveCustomDeckIds(settings, faction);
  const status = deckStatus(selectedIds, faction);
  const page = ui.deckPage || 0;
  const { top, slotY, toolY, listTop, backY, pageSize } = pageLayout(view);
  const cards = eligibleCards(faction).sort((a, b) => cardValue(b) - cardValue(a));
  const totalPages = Math.max(1, Math.ceil(cards.length / pageSize));
  const safePage = Math.max(0, Math.min(page, totalPages - 1));
  const list = cards.slice(safePage * pageSize, safePage * pageSize + pageSize);

  text(ctx, "编辑我的牌组", view.width / 2, top, 22, "#2f2417", "center");
  text(ctx, `${FACTION_LABELS[faction] || faction} · 牌组${activeSlot + 1}/${MAX_CUSTOM_DECKS} · ${safePage + 1}/${totalPages}`, view.width / 2, top + 25, 12, "#775c34", "center");
  const statusColor = status.valid ? "#2f6f57" : "#8f3c1f";
  text(ctx, `已选 ${status.total}/40 · 人物 ${status.units}/22 · 谋略 ${status.specials}/10`, view.width / 2, top + 45, 12, statusColor, "center");

  const slotRect = { id: "customDeckSlot", x: 26, y: slotY, w: view.width - 52, h: 34 };
  actions.push(slotRect);
  button(ctx, {
    ...slotRect,
    label: `${slotLabel(slots[activeSlot], activeSlot, faction)} ${ui.deckSlotDropdown === "slot" ? "▴" : "▾"}`,
    fill: "#a1632b",
    stroke: "#6d2d18",
    size: 12
  });

  const auto = { id: "autoCustomDeck", x: 26, y: toolY, w: (view.width - 64) / 2, h: 34 };
  const clearBtn = { id: "clearCustomDeck", x: auto.x + auto.w + 12, y: toolY, w: auto.w, h: 34 };
  actions.push(auto, clearBtn);
  button(ctx, { ...auto, label: "自动推荐到本组", fill: "#2f6f57", size: 12 });
  button(ctx, { ...clearBtn, label: "清空本组", fill: "#8f3c1f", stroke: "#6d2d18", size: 12 });

  list.forEach((card, index) => {
    const y = listTop + index * 68;
    const selected = selectedIds.includes(card.id);
    const disabled = !selected && !canAddCard(status, card);
    const rect = { id: "toggleCustomCard", cardId: card.id, x: 18, y, w: view.width - 36, h: 58 };
    actions.push(rect);
    fillRoundRect(ctx, rect.x, rect.y, rect.w, rect.h, 12, selected ? "#eff8ef" : (disabled ? "#eee7da" : "#fffaf0"), selected ? "#2f6f57" : "#dcc48d");
    drawCardImage(ctx, {
      ...card,
      imageX: rect.x + 10,
      imageY: rect.y + 8,
      imageW: 42,
      imageH: 42
    });
    const x = rect.x + 62;
    text(ctx, short(displayName(card), 9), x, y + 15, 13, disabled ? "#8a8170" : "#3b2b18");
    const rowName = (card.row || []).map(row => ROW_LABELS[row]).join("/") || "谋略";
    text(ctx, `${categoryLabel(card)} · ${rowName} · ${card.strength == null ? "策" : card.strength}`, x, y + 34, 11, "#775c34");
    wrapText(ctx, cardSummary(card), x, y + 50, view.width - 178, 13, 1, 10, "#6f5a3a");
    const detail = { id: "deckCardDetail", cardId: card.id, x: view.width - 72, y: y + 30, w: 48, h: 22 };
    actions.push(detail);
    button(ctx, { ...detail, label: "详情", fill: "#4f6d8a", stroke: "#36516a", size: 10, r: 8 });
  });

  text(ctx, "上下滑动查看更多 · 点击卡牌加入/移除", view.width / 2, backY - 12, 11, "#775c34", "center");
  const back = { id: "backSettings", x: 46, y: backY, w: view.width - 92, h: 40 };
  actions.push(back);
  button(ctx, { ...back, label: ui.deckReturnScene === "matchSetup" ? "返回准备" : "返回设置", size: 13, fill: "#8d6840" });
  drawSlotDropdown(ctx, view, actions, ui, slotRect, slots, activeSlot, faction);
  if (detail) drawDetail(ctx, view, actions, detail, { closeHint: "点击空白处返回牌组编辑" });
}

module.exports = { draw, clampPage };
