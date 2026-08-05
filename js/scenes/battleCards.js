const { clear, text, button, fillRoundRect, card, wrapText, short, drawTopLeftBack } = require("../ui/canvas");
const { cardById, deckExpectedScore, categoryLabel, displayName, groupCards } = require("../core/cards");
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
    if (!item || item.hidden || item.category === "leader") return;
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

function groupedBattleCards(cards) {
  return groupCards(cards || []).map(group => ({ ...group, count: group.cards.length }));
}

function pageLayout(view) {
  const top = view.safeTop + 22;
  const tabsY = top + 36;
  const summaryY = tabsY + 42;
  const listTop = summaryY + 74;
  const availableBottom = view.height - view.safeBottom - 12;
  const margin = 14;
  const cardW = Math.floor((view.width - margin * 2 - GAP * (COLUMNS - 1)) / COLUMNS);
  const cardH = Math.round(cardW * CARD_RATIO);
  const rowStep = cardH + GAP;
  const viewportH = Math.max(cardH, availableBottom - listTop);
  const listBottom = availableBottom;
  return { top, tabsY, summaryY, listTop, listBottom, margin, cardW, cardH, rowStep, viewportH };
}

function scrollState(view, state, ui = {}) {
  const layout = pageLayout(view);
  const playerIndex = selectedPlayerIndex(state, ui);
  const cards = battleCardsForPlayer(state, playerIndex);
  const groups = groupedBattleCards(cards);
  const rows = Math.ceil(groups.length / COLUMNS);
  const contentH = rows ? rows * layout.rowStep - GAP : 0;
  const viewportH = layout.viewportH;
  const maxScroll = Math.max(0, contentH - viewportH);
  const saved = Array.isArray(ui.battleCardsScrolls) ? ui.battleCardsScrolls[playerIndex] : 0;
  const scroll = Math.max(0, Math.min(saved || 0, maxScroll));
  return { ...layout, playerIndex, cards, groups, contentH, viewportH, maxScroll, scroll };
}

function scrollBounds(view, state, ui = {}) {
  const info = scrollState(view, state, ui);
  return { listTop: info.listTop, listBottom: info.listBottom, maxScroll: info.maxScroll, playerIndex: info.playerIndex };
}

function detailCards(state, ui = {}) {
  return groupedBattleCards(battleCardsForPlayer(state, selectedPlayerIndex(state, ui))).map(group => group.card);
}

function drawPowerIcon(ctx, x, y) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#c46a2b";
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(x + 2, y + 7);
  ctx.lineTo(x + 13, y - 6);
  ctx.stroke();
  ctx.strokeStyle = "#d19330";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + 2, y + 2);
  ctx.lineTo(x + 8, y + 8);
  ctx.stroke();
  ctx.strokeStyle = "#6f4d29";
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(x - 2, y + 9);
  ctx.lineTo(x + 3, y + 4);
  ctx.stroke();
  ctx.restore();
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
  text(ctx, "总战力说明", panelX + 20, panelY + 28, 18, "#2f2417");
  const rule = "每张牌以基础战力计分，并按能力加分：传世+8、出使+11、济世+7、同盟+6、集贤+7、召唤+7、振势+4、雪耻+8、蛰伏+6、通才+2、鼓舞+7、奇策+6、时局+6。\n总战力是按以上规则计算出的整体强度分，数字越高，代表这组卡牌的基础战力和能力加成整体越强，便于对比双方卡牌强度。";
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

  drawTopLeftBack(ctx, view, actions, "backBattleCards");
  text(ctx, "本局卡牌总览", view.width / 2, info.top, 22, "#2f2417", "center");
  const tabGap = 10;
  const tabW = (view.width - 36 - tabGap) / 2;
  const mine = { id: "switchBattleCardsSide", side: "mine", x: 18, y: info.tabsY, w: tabW, h: 34 };
  const opponent = { id: "switchBattleCardsSide", side: "enemy", x: mine.x + tabW + tabGap, y: info.tabsY, w: tabW, h: 34 };
  actions.push(mine, opponent);
  button(ctx, { ...mine, label: `我方 ${short(state?.players?.[local]?.name || "玩家", 7)}`, size: 12, fill: info.playerIndex === local ? "#2f6f57" : "#8d6840", shadow: false });
  button(ctx, { ...opponent, label: `对方 ${short(state?.players?.[enemy]?.name || "玩家", 7)}`, size: 12, fill: info.playerIndex === enemy ? "#8f3c1f" : "#8d6840", shadow: false });

  const normalCount = info.cards.filter(item => item.category !== "stratagem" && item.category !== "situation").length;
  const strategyCount = info.cards.length - normalCount;
  const score = deckExpectedScore(info.cards);
  fillRoundRect(ctx, 18, info.summaryY, view.width - 36, 62, 13, "#fffaf0", "#dcc48d");
  text(ctx, `${player?.factionName || "阵营"} · 共 ${info.cards.length} 张 · ${info.groups.length} 种`, 30, info.summaryY + 18, 12, "#775c34");
  const statsLine = `普通卡 ${normalCount} 张 · 特殊卡牌 ${strategyCount} 张 ·`;
  text(ctx, statsLine, 30, info.summaryY + 42, 13, "#3b2b18");
  const scoreText = `总战力 ${score}`;
  const scoreW = ctx.measureText(scoreText).width;
  const helpSize = 22;
  const maxIconX = view.width - 30 - 20 - scoreW - 8 - helpSize;
  const iconX = Math.max(30, Math.min(maxIconX, 30 + ctx.measureText(statsLine).width + 12));
  drawPowerIcon(ctx, iconX, info.summaryY + 42);
  text(ctx, scoreText, iconX + 20, info.summaryY + 42, 13, "#8f3c1f");
  const help = { id: "battleCardsHelp", x: iconX + 20 + scoreW + 8, y: info.summaryY + 31, w: helpSize, h: helpSize };
  actions.push(help);
  fillRoundRect(ctx, help.x, help.y, help.w, help.h, 11, "#fff7d8", "#d1ad6a");
  text(ctx, "?", help.x + help.w / 2, help.y + help.h / 2 + 1, 14, "#8f3c1f", "center");

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, info.listTop, view.width, info.viewportH);
  ctx.clip();
  info.groups.forEach((group, index) => {
    const item = group.card;
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
      summary: item.summary || item.abilityText,
      category: categoryLabel(item),
      faction: item.faction,
      row: item.row,
      abilities: item.abilities,
      abilityDisplayNames: item.abilityDisplayNames,
      strength: item.category === "stratagem" || item.category === "situation" ? "策" : item.strength,
      nameMax: 4,
      count: group.count
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

  const detail = ui.battleCardsDetailId ? cardById(ui.battleCardsDetailId) : null;
  if (detail) {
    const detailCards = info.groups.map(group => group.card);
    const currentIdx = detailCards.findIndex(item => item.id === detail.id);
    drawDetail(ctx, view, actions, detail, {
      closeHint: "点击空白处返回卡牌总览",
      leftCard: currentIdx > 0 ? detailCards[currentIdx - 1] : null,
      rightCard: currentIdx >= 0 && currentIdx < detailCards.length - 1 ? detailCards[currentIdx + 1] : null,
      swipeOffset: ui.detailSwipe ? ui.detailSwipe.offset || 0 : 0
    });
  } else if (ui.battleCardsDetailId) {
    ui.battleCardsDetailId = "";
  }
  if (ui.battleCardsHelpOpen && !detail) drawScoreHelp(ctx, view, actions);
}

module.exports = { draw, scrollBounds, detailCards, selectedPlayerIndex };
