const { clear, text, button, fillRoundRect, card, wrapText, short } = require("../ui/canvas");
const { cardById, cardValue, categoryLabel, displayName } = require("../core/cards");
const { sortedHandCards } = require("./battleScene");
const { drawDetail } = require("./cardDetail");

const COLUMNS = 4;
const GAP = 8;
const CARD_RATIO = 1.38;

function localPlayerIndex(state) {
  return state?.mode === "online" && Number.isInteger(state.localPlayerIndex) ? state.localPlayerIndex : 0;
}

function selectedPlayerIndex(state, ui = {}) {
  const local = localPlayerIndex(state);
  return ui.battleCardsSide === "enemy" ? (local === 0 ? 1 : 0) : local;
}

function fallbackBattleCards(state, playerIndex) {
  const seen = new Set();
  const cards = [];
  const add = item => {
    if (!item || item.category === "leader") return;
    const key = item.uid || item.id;
    if (!key || seen.has(key)) return;
    const owner = Number.isInteger(item.owner) ? item.owner : playerIndex;
    if (owner !== playerIndex) return;
    seen.add(key);
    cards.push(cardById(item.id) || item);
  };
  (state?.players || []).forEach(player => {
    (player.deck || []).forEach(add);
    (player.hand || []).forEach(add);
    (player.discard || []).forEach(add);
    (player.retained || []).forEach(add);
    Object.values(player.board || {}).forEach(items => (items || []).forEach(add));
  });
  return cards;
}

function battleCardsForPlayer(state, playerIndex) {
  const player = state?.players?.[playerIndex];
  if (!player) return [];
  const cards = Array.isArray(player.battleCardIds) && player.battleCardIds.length
    ? player.battleCardIds.map(cardById).filter(Boolean)
    : fallbackBattleCards(state, playerIndex);
  return sortedHandCards(cards);
}

function pageLayout(view) {
  const top = view.safeTop + 22;
  const tabsY = top + 36;
  const summaryY = tabsY + 42;
  const listTop = summaryY + 74;
  const backY = view.height - view.safeBottom - 46;
  const availableBottom = backY - 12;
  const margin = 14;
  const cardW = Math.floor((view.width - margin * 2 - GAP * (COLUMNS - 1)) / COLUMNS);
  const cardH = Math.round(cardW * CARD_RATIO);
  const rowStep = cardH + GAP;
  const viewportH = Math.max(cardH, availableBottom - listTop);
  const listBottom = availableBottom;
  return { top, tabsY, summaryY, listTop, listBottom, backY, margin, cardW, cardH, rowStep, viewportH };
}

function scrollState(view, state, ui = {}) {
  const layout = pageLayout(view);
  const playerIndex = selectedPlayerIndex(state, ui);
  const cards = battleCardsForPlayer(state, playerIndex);
  const rows = Math.ceil(cards.length / COLUMNS);
  const contentH = rows ? rows * layout.rowStep - GAP : 0;
  const viewportH = layout.viewportH;
  const maxScroll = Math.max(0, contentH - viewportH);
  const saved = Array.isArray(ui.battleCardsScrolls) ? ui.battleCardsScrolls[playerIndex] : 0;
  const scroll = Math.max(0, Math.min(saved || 0, maxScroll));
  return { ...layout, playerIndex, cards, contentH, viewportH, maxScroll, scroll };
}

function scrollBounds(view, state, ui = {}) {
  const info = scrollState(view, state, ui);
  return { listTop: info.listTop, listBottom: info.listBottom, maxScroll: info.maxScroll, playerIndex: info.playerIndex };
}

function detailCards(state, ui = {}) {
  return battleCardsForPlayer(state, selectedPlayerIndex(state, ui));
}

function drawScoreHelp(ctx, view, actions) {
  actions.push({ id: "closeBattleCardsHelp", x: 0, y: 0, w: view.width, h: view.height });
  ctx.fillStyle = "rgba(28, 21, 14, 0.48)";
  ctx.fillRect(0, 0, view.width, view.height);
  const panelW = Math.min(340, view.width - 36);
  const panelH = 250;
  const panelX = (view.width - panelW) / 2;
  const panelY = Math.max(view.safeTop + 72, (view.height - panelH) / 2);
  actions.push({ id: "battleCardsHelpPanel", x: panelX, y: panelY, w: panelW, h: panelH });
  fillRoundRect(ctx, panelX, panelY, panelW, panelH, 18, "#fffaf0", "#d1ad6a");
  text(ctx, "卡牌强度记分", panelX + 20, panelY + 28, 18, "#2f2417");
  const rule = "每张牌以基础战力计分，并按能力加分：传世+8、出使+11、济世+7、同盟+6、集贤+7、召唤+7、振势+4、破釜+8、奋起+6、通才+2、鼓舞+7、奇策+6、时局+6。\n同一张牌有多个能力时累计加分；整副牌得分为所有卡牌记分之和。";
  wrapText(ctx, rule, panelX + 20, panelY + 64, panelW - 40, 21, 8, 13, "#5f4727");
  const close = { id: "closeBattleCardsHelp", x: panelX + 74, y: panelY + panelH - 48, w: panelW - 148, h: 34 };
  actions.push(close);
  button(ctx, { ...close, label: "知道了", size: 12, fill: "#8d6840" });
}

function draw(ctx, view, actions, state, ui = {}) {
  clear(ctx, view.width, view.height);
  const info = scrollState(view, state, ui);
  const local = localPlayerIndex(state);
  const enemy = local === 0 ? 1 : 0;
  const player = state?.players?.[info.playerIndex];
  if (!Array.isArray(ui.battleCardsScrolls)) ui.battleCardsScrolls = [0, 0];
  ui.battleCardsScrolls[info.playerIndex] = info.scroll;

  text(ctx, "本局卡牌总览", view.width / 2, info.top, 22, "#2f2417", "center");
  const tabGap = 10;
  const tabW = (view.width - 36 - tabGap) / 2;
  const mine = { id: "switchBattleCardsSide", side: "mine", x: 18, y: info.tabsY, w: tabW, h: 34 };
  const opponent = { id: "switchBattleCardsSide", side: "enemy", x: mine.x + tabW + tabGap, y: info.tabsY, w: tabW, h: 34 };
  actions.push(mine, opponent);
  button(ctx, { ...mine, label: `我方 ${short(state?.players?.[local]?.name || "玩家", 7)}`, size: 12, fill: info.playerIndex === local ? "#2f6f57" : "#8d6840", shadow: false });
  button(ctx, { ...opponent, label: `对方 ${short(state?.players?.[enemy]?.name || "玩家", 7)}`, size: 12, fill: info.playerIndex === enemy ? "#8f3c1f" : "#8d6840", shadow: false });

  const normalCount = info.cards.filter(item => item.category !== "special" && item.category !== "weather").length;
  const specialCount = info.cards.length - normalCount;
  const score = info.cards.reduce((sum, item) => sum + cardValue(item), 0);
  fillRoundRect(ctx, 18, info.summaryY, view.width - 36, 62, 13, "#fffaf0", "#dcc48d");
  text(ctx, `${player?.factionName || "阵营"} · 共 ${info.cards.length} 张`, 30, info.summaryY + 18, 12, "#775c34");
  text(ctx, `普通卡 ${normalCount} 张 · 特殊卡牌 ${specialCount} 张`, 30, info.summaryY + 42, 13, "#3b2b18");
  text(ctx, `强度记分：${score}`, view.width - 52, info.summaryY + 18, 12, "#8f3c1f", "right");
  const help = { id: "battleCardsHelp", x: view.width - 44, y: info.summaryY + 7, w: 28, h: 28 };
  actions.push(help);
  fillRoundRect(ctx, help.x, help.y, help.w, help.h, 14, "#fff7d8", "#d1ad6a");
  text(ctx, "?", help.x + help.w / 2, help.y + help.h / 2 + 1, 16, "#8f3c1f", "center");

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, info.listTop, view.width, info.viewportH);
  ctx.clip();
  info.cards.forEach((item, index) => {
    const col = index % COLUMNS;
    const row = Math.floor(index / COLUMNS);
    const x = info.margin + col * (info.cardW + GAP);
    const y = info.listTop + row * info.rowStep - info.scroll;
    if (y >= info.listBottom || y + info.cardH <= info.listTop) return;
    const hitY = Math.max(info.listTop, y);
    const hitBottom = Math.min(info.listBottom, y + info.cardH);
    actions.push({ id: "battleCardsCard", cardId: item.id, x, y: hitY, w: info.cardW, h: hitBottom - hitY });
    card(ctx, {
      id: "battleCardsCard",
      cardId: item.id,
      x,
      y,
      w: info.cardW,
      h: info.cardH,
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
      nameMax: 4
    });
  });
  ctx.restore();

  if (info.scroll < info.maxScroll - 0.5) {
    const fade = ctx.createLinearGradient ? ctx.createLinearGradient(0, info.listBottom - 28, 0, info.listBottom) : null;
    if (fade) {
      fade.addColorStop(0, "rgba(247,241,229,0)");
      fade.addColorStop(1, "rgba(247,241,229,0.94)");
      ctx.fillStyle = fade;
    } else ctx.fillStyle = "rgba(247,241,229,0.72)";
    ctx.fillRect(0, info.listBottom - 28, view.width, 28);
  }
  if (info.maxScroll > 0) {
    const trackX = view.width - 8;
    const trackY = info.listTop + 4;
    const trackH = Math.max(30, info.viewportH - 8);
    const thumbH = Math.max(30, trackH * info.viewportH / info.contentH);
    const thumbY = trackY + (trackH - thumbH) * (info.scroll / info.maxScroll);
    fillRoundRect(ctx, trackX, trackY, 3, trackH, 1.5, "rgba(119,92,52,0.18)");
    fillRoundRect(ctx, trackX - 1, thumbY, 5, thumbH, 2.5, "rgba(143,60,31,0.72)");
  }

  const back = { id: "backBattleCards", x: 18, y: info.backY, w: view.width - 36, h: 38 };
  actions.push(back);
  button(ctx, { ...back, label: "返回结算", size: 13, fill: "#8d6840" });

  const detail = ui.battleCardsDetailId ? cardById(ui.battleCardsDetailId) : null;
  if (detail) {
    const currentIdx = info.cards.findIndex(item => item.id === detail.id);
    drawDetail(ctx, view, actions, detail, {
      closeHint: "点击空白处返回卡牌总览",
      leftCard: currentIdx > 0 ? info.cards[currentIdx - 1] : null,
      rightCard: currentIdx >= 0 && currentIdx < info.cards.length - 1 ? info.cards[currentIdx + 1] : null,
      swipeOffset: ui.detailSwipe ? ui.detailSwipe.offset || 0 : 0
    });
  } else if (ui.battleCardsDetailId) {
    ui.battleCardsDetailId = "";
  }
  if (ui.battleCardsHelpOpen && !detail) drawScoreHelp(ctx, view, actions);
}

module.exports = { draw, scrollBounds, detailCards, selectedPlayerIndex };
