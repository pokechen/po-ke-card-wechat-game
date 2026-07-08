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
  cardSummary
} = require("../core/cards");

function canAddCard(status, card) {
  if (status.total >= 40) return false;
  if ((card.category === "special" || card.category === "weather") && status.specials >= 10) return false;
  return true;
}

function slotLabel(slot, index, faction) {
  const status = deckStatus(slot.ids, faction);
  const mark = status.valid ? "✓" : (status.total ? "*" : "");
  return `${index + 1}${mark}`;
}

function draw(ctx, view, actions, ui) {
  clear(ctx, view.width, view.height);
  const settings = loadSettings();
  const faction = settings.humanFaction;
  const slots = getCustomDeckSlots(settings, faction);
  const activeSlot = getActiveCustomDeckSlotIndex(settings, faction);
  const selectedIds = getActiveCustomDeckIds(settings, faction);
  const status = deckStatus(selectedIds, faction);
  const page = ui.deckPage || 0;
  const top = view.safeTop + 26;
  const slotY = top + 58;
  const toolY = top + 98;
  const listTop = top + 140;
  const bottom = view.height - view.safeBottom - 50;
  const pageSize = Math.max(4, Math.min(6, Math.floor((bottom - listTop - 8) / 68)));
  const cards = eligibleCards(faction).sort((a, b) => cardValue(b) - cardValue(a));
  const totalPages = Math.max(1, Math.ceil(cards.length / pageSize));
  const safePage = Math.max(0, Math.min(page, totalPages - 1));
  const list = cards.slice(safePage * pageSize, safePage * pageSize + pageSize);

  text(ctx, "编辑我的牌组", view.width / 2, top, 22, "#2f2417", "center");
  text(ctx, `${FACTION_LABELS[faction] || faction} · 牌组${activeSlot + 1}/${MAX_CUSTOM_DECKS} · ${safePage + 1}/${totalPages}`, view.width / 2, top + 25, 12, "#775c34", "center");
  const statusColor = status.valid ? "#2f6f57" : "#8f3c1f";
  text(ctx, `已选 ${status.total}/40 · 人物 ${status.units}/22 · 谋略 ${status.specials}/10`, view.width / 2, top + 45, 12, statusColor, "center");

  const gap = 6;
  const slotW = (view.width - 36 - gap * (MAX_CUSTOM_DECKS - 1)) / MAX_CUSTOM_DECKS;
  for (let i = 0; i < MAX_CUSTOM_DECKS; i++) {
    const rect = { id: "customDeckSlot", slotIndex: i, x: 18 + i * (slotW + gap), y: slotY, w: slotW, h: 30 };
    actions.push(rect);
    button(ctx, {
      ...rect,
      label: slotLabel(slots[i], i, faction),
      fill: i === activeSlot ? "#a1632b" : "#6b6b5f",
      stroke: i === activeSlot ? "#6d2d18" : "#56564e",
      size: 12
    });
  }

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
    wrapText(ctx, cardSummary(card), x, y + 50, view.width - 164, 13, 1, 10, "#6f5a3a");
    text(ctx, selected ? "已选" : (disabled ? "已满" : "加入"), view.width - 42, y + 29, 12, selected ? "#2f6f57" : (disabled ? "#8a8170" : "#8f3c1f"), "center");
  });

  const prev = { id: "deckPrev", x: 18, y: bottom, w: 76, h: 40 };
  const next = { id: "deckNext", x: view.width - 94, y: bottom, w: 76, h: 40 };
  const back = { id: "backSettings", x: 108, y: bottom, w: view.width - 216, h: 40 };
  actions.push(prev, back, next);
  button(ctx, { ...prev, label: "上一页", size: 12, fill: "#6b6b5f" });
  button(ctx, { ...back, label: "返回设置", size: 13, fill: "#8d6840" });
  button(ctx, { ...next, label: "下一页", size: 12, fill: "#2f6f57" });
}

module.exports = { draw };
