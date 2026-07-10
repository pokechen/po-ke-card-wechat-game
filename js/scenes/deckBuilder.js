const { clear, text, button, fillRoundRect, wrapText, short, drawCardImage } = require("../ui/canvas");
const { loadSettings, getActiveCustomDeckIds } = require("../core/storage");
const {
  eligibleCards,
  groupCards,
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

function selectedCount(ids, group) {
  const groupIds = new Set(group.cards.map(card => card.id));
  return ids.filter(id => groupIds.has(id)).length;
}

function pageLayout(view) {
  const top = view.safeTop + 26;
  const toolY = top + 64;
  const listTop = top + 106;
  const backY = view.height - view.safeBottom - 50;
  const listBottom = backY - 22;
  const pageSize = Math.max(4, Math.min(7, Math.floor((listBottom - listTop) / 68)));
  return { top, toolY, listTop, backY, listBottom, pageSize };
}

function clampPage(view, ui, targetPage) {
  const settings = loadSettings();
  const faction = settings.humanFaction;
  const { pageSize } = pageLayout(view);
  const groups = groupCards(eligibleCards(faction));
  const totalPages = Math.max(1, Math.ceil(groups.length / pageSize));
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
  const selectedIds = getActiveCustomDeckIds(settings, faction);
  const status = deckStatus(selectedIds, faction);
  const page = ui.deckPage || 0;
  const { top, toolY, listTop, backY, listBottom, pageSize } = pageLayout(view);
  const groups = groupCards(eligibleCards(faction)).sort((a, b) => cardValue(b.card) - cardValue(a.card));
  const totalPages = Math.max(1, Math.ceil(groups.length / pageSize));
  const safePage = Math.max(0, Math.min(page, totalPages - 1));
  const list = groups.slice(safePage * pageSize, safePage * pageSize + pageSize + 1);
  const transitionY = ui.pageTransition?.scene === "deckBuilder" ? ui.pageTransition.offset || 0 : 0;

  text(ctx, "编辑我的牌组", view.width / 2, top, 22, "#2f2417", "center");
  text(ctx, `${FACTION_LABELS[faction] || faction} · 自定义牌组 · ${safePage + 1}/${totalPages}`, view.width / 2, top + 25, 12, "#775c34", "center");
  const statusColor = status.valid ? "#2f6f57" : "#8f3c1f";
  text(ctx, `已选 ${status.total}/40 · 人物 ${status.units}/22 · 谋略 ${status.specials}/10`, view.width / 2, top + 45, 12, statusColor, "center");

  const auto = { id: "autoCustomDeck", x: 26, y: toolY, w: (view.width - 64) / 2, h: 34 };
  const clearBtn = { id: "clearCustomDeck", x: auto.x + auto.w + 12, y: toolY, w: auto.w, h: 34 };
  actions.push(auto, clearBtn);
  button(ctx, { ...auto, label: "随机推荐", fill: "#2f6f57", size: 12 });
  button(ctx, { ...clearBtn, label: "清空", fill: "#8f3c1f", stroke: "#6d2d18", size: 12 });

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, listTop - 4, view.width, listBottom - listTop + 4);
  ctx.clip();
  list.forEach((group, index) => {
    const card = group.card;
    const y = listTop + index * 68 + transitionY;
    const count = selectedCount(selectedIds, group);
    const selected = count > 0;
    const full = count >= group.cards.length;
    const disabled = (!selected && !canAddCard(status, card)) || full;
    const groupIds = group.cards.map(item => item.id);
    const rect = { id: "addCustomCard", cardIds: groupIds, x: 18, y, w: view.width - 36, h: 58 };
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
    if (selected) {
      fillRoundRect(ctx, x + 92, y + 5, 34, 20, 10, "#2f6f57", "#1d4f3c");
      text(ctx, `×${count}`, x + 109, y + 15, 11, "#fff7d8", "center");
    }
    const rowName = (card.row || []).map(row => ROW_LABELS[row]).join("/") || "谋略";
    text(ctx, `${categoryLabel(card)} · ${rowName} · ${card.strength == null ? "策" : card.strength}`, x, y + 34, 11, "#775c34");
    wrapText(ctx, cardSummary(card), x, y + 50, view.width - 178, 13, 1, 10, "#6f5a3a");
    if (selected) {
      const remove = { id: "removeCustomCard", cardIds: groupIds, x: view.width - 124, y: y + 30, w: 48, h: 22 };
      actions.push(remove);
      button(ctx, { ...remove, label: "减1", fill: "#8f3c1f", stroke: "#6d2d18", size: 10, r: 8 });
    }
    const detail = { id: "deckCardDetail", cardId: card.id, x: view.width - 72, y: y + 30, w: 48, h: 22 };
    actions.push(detail);
    button(ctx, { ...detail, label: "详情", fill: "#4f6d8a", stroke: "#36516a", size: 10, r: 8 });
  });
  ctx.restore();
  if (safePage < totalPages - 1) {
    ctx.save();
    const fade = ctx.createLinearGradient ? ctx.createLinearGradient(0, listBottom - 30, 0, listBottom) : null;
    if (fade) { fade.addColorStop(0, "rgba(255,250,240,0)"); fade.addColorStop(1, "rgba(255,250,240,0.92)"); ctx.fillStyle = fade; }
    else ctx.fillStyle = "rgba(255,250,240,0.72)";
    ctx.fillRect(0, listBottom - 30, view.width, 30);
    ctx.restore();
  }

  const back = { id: "backSettings", x: 46, y: backY, w: view.width - 92, h: 40 };
  actions.push(back);
  button(ctx, { ...back, label: ui.deckReturnScene === "matchSetup" ? "返回准备" : "返回设置", size: 13, fill: "#8d6840" });
  if (detail) drawDetail(ctx, view, actions, detail, { closeHint: "点击空白处返回牌组编辑" });
}

module.exports = { draw, clampPage };
