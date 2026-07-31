const { clear, text, button, fillRoundRect, card, wrapText, drawCardImage, short } = require("../ui/canvas");
const { ROWS, ROW_LABELS, categoryLabel, cardById, cardValue, hasAbility, isHeroCard } = require("../core/cards");
const { totalScore, rowScore, handOwnerIndex, hasActiveHalfSituationLeader } = require("../core/battle");
const { loadSave } = require("../core/storage");
const { drawDetail } = require("./cardDetail");

const FIELD_FONT = "\"PingFang SC\", \"Hiragino Sans GB\", \"Microsoft YaHei\", sans-serif";
const HORN_DETAIL_CARD_ID = "zhangyu-0179";
const ROW_HORN_UID_PREFIX = "rowHorn";

function measureTextWidth(ctx, content, size) {
  ctx.save();
  ctx.font = `${size}px ${FIELD_FONT}`;
  const width = ctx.measureText(String(content || "")).width;
  ctx.restore();
  return width;
}

function drawLeaderHeader(ctx, view, actions, state, player, playerIndex, centerY, ui) {
  const leader = player.leader;
  const active = state.current === playerIndex && !state.over && !(state.mulligan && state.mulligan.active);
  const local = localPlayerIndex(state);
  const isLocal = playerIndex === local;
  const avatar = 32;
  const x = 12;
  const y = centerY - avatar / 2;
  const identity = state.mode === "online"
    ? `${playerSideLabel(state, playerIndex)} · ${short(player.name, 4)} · ${short(player.factionName, 4)}`
    : `${player.name} · ${short(player.factionName, 4)}`;
  const handInfo = `手牌 ${player.hand.length} 张${player.passed ? " · 已放弃" : ""}`;
  const subline = `${leader ? short(leader.name || leader.baseName, 4) : "未配置主将"} · ${handInfo}`;
  const scoreReserve = 56;
  const maxPanelW = Math.max(118, Math.min(186, view.width - scoreReserve - 24));
  const textW = Math.max(measureTextWidth(ctx, identity, 11), measureTextWidth(ctx, subline, 10));
  const panelW = Math.max(118, Math.min(maxPanelW, avatar + 18 + textW));
  const panel = { x: x - 3, y: y - 2, w: panelW, h: avatar + 4 };
  fillRoundRect(ctx, panel.x, panel.y, panel.w, panel.h, 10, active ? "#fff8e5" : "#f2ead8", active ? "#2f6f57" : "#d3b982");
  if (leader) {
    const action = { id: "leaderAvatar", playerIndex, cardId: leader.id, x, y, w: avatar, h: avatar };
    actions.push(action);
    drawCardImage(ctx, { ...leader, imageFill: true, imageX: x, imageY: y, imageW: avatar, imageH: avatar });
    if (playerIndex === local) ui.__guideLeader = { x, y, w: avatar, h: avatar };
    if (player.leaderUsed) {
      ctx.save();
      ctx.fillStyle = "rgba(38, 28, 18, 0.48)";
      ctx.fillRect(x, y, avatar, avatar);
      ctx.restore();
      text(ctx, "已用", x + avatar / 2, y + avatar / 2, 9, "#fff7d8", "center");
    }
  } else {
    fillRoundRect(ctx, x, y, avatar, avatar, 10, "#efe6d2", "#d3b982");
    text(ctx, "将", x + avatar / 2, y + avatar / 2, 13, "#8f3c1f", "center");
  }
  text(ctx, identity, x + avatar + 6, centerY - 7, 11, isLocal ? "#2f6f57" : "#8f3c1f");
  text(ctx, subline, x + avatar + 6, centerY + 8, 10, player.leaderUsed ? "#9a8a73" : "#775c34");
  text(ctx, `${totalScore(player)} 分`, view.width - 14, centerY, 12, "#8f3c1f", "right");
  return panel;
}

function fieldSortOrder(card) {
  if (hasAbility(card, "鼓舞")) return -10;
  if ((card.strength || 0) <= 1) return 100;
  const abilities = card.abilities || [];
  if (abilities.includes("振势")) return 20;
  if (isHeroCard(card)) return -5;
  return 0;
}

function sortedFieldCards(cards) {
  return cards.slice().sort((a, b) => {
    const orderA = fieldSortOrder(a);
    const orderB = fieldSortOrder(b);
    if (orderA !== orderB) return orderA - orderB;
    return (b.strength || 0) - (a.strength || 0);
  });
}

function drawFittedText(ctx, content, x, y, maxWidth, startSize, color) {
  const value = String(content || "");
  let size = startSize;
  ctx.save();
  while (size > 6) {
    ctx.font = `${size}px ${FIELD_FONT}`;
    if (ctx.measureText(value).width <= maxWidth) break;
    size -= 0.5;
  }
  ctx.beginPath();
  ctx.rect(x - maxWidth / 2, y - size / 2 - 2, maxWidth, size + 4);
  ctx.clip();
  text(ctx, value, x, y, size, color, "center");
  ctx.restore();
}

function drawFieldCard(ctx, item, rect, rowH, suppressed) {
  const power = item.effective == null ? item.strength : item.effective;
  const reduced = suppressed && !isHeroCard(item) && item.effective != null && item.effective < (item.strength || 0);
  const stripH = Math.max(9, Math.min(12, Math.floor(rect.h * 0.34)));
  fillRoundRect(ctx, rect.x, rect.y, rect.w, rect.h, 7, isHeroCard(item) ? "#21170c" : (reduced ? "#f4d3c8" : "#f9edcf"), isHeroCard(item) ? "#f4b63d" : (reduced ? "#c0392b" : "#c6954b"));
  if (isHeroCard(item)) {
    ctx.save();
    ctx.strokeStyle = "rgba(244, 182, 61, 0.98)";
    ctx.lineWidth = 2;
    ctx.shadowColor = "rgba(255, 202, 61, 0.65)";
    ctx.shadowBlur = 8;
    ctx.strokeRect(rect.x + 1.5, rect.y + 1.5, rect.w - 3, rect.h - 3);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(127, 214, 255, 0.96)";
    ctx.lineWidth = 1;
    ctx.strokeRect(rect.x + 4, rect.y + 4, rect.w - 8, rect.h - 8);
    ctx.restore();
  }
  drawCardImage(ctx, {
    ...item,
    imageFill: true,
    imageX: rect.x + 3,
    imageY: rect.y + 3,
    imageW: rect.w - 6,
    imageH: rect.h - 6
  });
  fillRoundRect(ctx, rect.x + 2, rect.y + rect.h - stripH - 1, rect.w - 4, stripH, 5, isHeroCard(item) ? "rgba(31, 23, 13, 0.96)" : "rgba(255, 249, 235, 0.96)", isHeroCard(item) ? "#f4b63d" : "#e2cc9c");
  drawFittedText(ctx, item.name || "卡牌", rect.x + rect.w / 2, rect.y + rect.h - stripH / 2 - 1, rect.w - 4, stripH >= 11 ? 7.5 : 6.5, isHeroCard(item) ? "#fff1a8" : "#3b2b18");
  const badge = Math.min(17, Math.max(14, Math.floor(rect.h * 0.48)));
  fillRoundRect(ctx, rect.x + 2, rect.y + 2, badge, badge, badge / 2, reduced ? "#c0392b" : (isHeroCard(item) ? "#d7a026" : "rgba(143,60,31,0.92)"), isHeroCard(item) ? "#fff0a8" : "rgba(255,247,216,0.88)");
  drawFittedText(ctx, reduced ? `↓${power}` : String(power), rect.x + 2 + badge / 2, rect.y + 2 + badge / 2, badge - 3, 8, "#fff7d8");
}

function rowHornUid(playerIndex, row) {
  return `${ROW_HORN_UID_PREFIX}:${playerIndex}:${row}`;
}

function parseRowHornUid(cardUid) {
  const parts = String(cardUid || "").split(":");
  if (parts.length !== 3 || parts[0] !== ROW_HORN_UID_PREFIX) return null;
  const playerIndex = Number(parts[1]);
  const row = parts[2];
  if (!Number.isInteger(playerIndex) || !ROWS.includes(row)) return null;
  return { playerIndex, row };
}

function rowHornActive(state, playerIndex, row) {
  return !!state?.rowHorn?.[playerIndex]?.[row];
}

function rowHornDetailCard(playerIndex, row) {
  const base = cardById(HORN_DETAIL_CARD_ID);
  if (!base) return null;
  return {
    ...base,
    uid: rowHornUid(playerIndex, row),
    row: [row],
    rowDisplayName: ROW_LABELS[row] || "",
    strength: "策",
    effective: "策",
    summary: base.abilityText || "鼓舞：选择己方一条阵线，该线人物战力翻倍。"
  };
}

function rowDetailCardsWithHorn(state, playerIndex, row) {
  const cards = sortedFieldCards(state.players[playerIndex]?.board?.[row] || []);
  const hornCard = rowHornActive(state, playerIndex, row) ? rowHornDetailCard(playerIndex, row) : null;
  return hornCard ? [hornCard].concat(cards) : cards;
}

function findRowHornContext(state, cardUid) {
  const parsed = parseRowHornUid(cardUid);
  if (!parsed || !rowHornActive(state, parsed.playerIndex, parsed.row)) return null;
  const card = rowHornDetailCard(parsed.playerIndex, parsed.row);
  return card ? { card, playerIndex: parsed.playerIndex, row: parsed.row, zone: "rowHorn" } : null;
}

function drawRowHornCard(ctx, item, rect) {
  const stripH = Math.max(10, Math.min(14, Math.floor(rect.h * 0.28)));
  ctx.save();
  ctx.shadowColor = "rgba(209, 147, 48, 0.34)";
  ctx.shadowBlur = 7;
  ctx.shadowOffsetY = 1;
  fillRoundRect(ctx, rect.x - 2, rect.y - 2, rect.w + 4, rect.h + 4, 9, "#fff4cf", "#d19330");
  ctx.restore();
  drawCardImage(ctx, {
    ...item,
    imageFill: true,
    imageX: rect.x + 3,
    imageY: rect.y + 3,
    imageW: rect.w - 6,
    imageH: rect.h - 6
  });
  fillRoundRect(ctx, rect.x + 2, rect.y + rect.h - stripH - 1, rect.w - 4, stripH, 5, "rgba(255, 249, 235, 0.97)", "#e2cc9c");
  drawFittedText(ctx, "鼓舞", rect.x + rect.w / 2, rect.y + rect.h - stripH / 2 - 1, rect.w - 4, stripH >= 12 ? 7.5 : 6.5, "#8f3c1f");
}

function drawRows(ctx, view, actions, state, ui, topOffset, bottomLimit) {
  const top = view.safeTop + (topOffset || 78);
  const gap = 6;
  const sideGap = 34;
  // 重置场上卡牌指引目标，仅在确有场上卡牌时记录，供 fieldCardDetail 指引按需指向
  ui.__guideFieldCard = null;
  const availableH = (bottomLimit || (view.height - view.safeBottom - 180)) - top - gap * 5 - sideGap;
  const rowH = Math.max(44, Math.min(92, Math.floor(availableH / 6)));
  const local = localPlayerIndex(state);
  const enemy = local === 0 ? 1 : 0;
  if (!ui.battleRowScrolls) ui.battleRowScrolls = {};
  [enemy, local].forEach((playerIndex, visualIndex) => {
    const player = state.players[playerIndex];
    if (!player) return;
    const isEnemySide = visualIndex === 0;
    const baseY = isEnemySide ? top : top + (rowH + gap) * 3 + sideGap;
    const header = drawLeaderHeader(ctx, view, actions, state, player, playerIndex, baseY - 16, ui);
    if (isEnemySide) drawRoundResultMarkers(ctx, view, state, header);
    else drawSharedDiscardPileButton(ctx, view, actions, state, header);
    const rowOrder = isEnemySide ? ROWS.slice().reverse() : ROWS;
    rowOrder.forEach((row, index) => {
      const y = baseY + index * (rowH + gap);
      const suppressed = !!state.situations[row];
      const halfSituation = suppressed && hasActiveHalfSituationLeader(state, player);
      const hasHorn = rowHornActive(state, playerIndex, row);
      fillRoundRect(ctx, 12, y, view.width - 24, rowH, 9, halfSituation ? "#e8d5a8" : (suppressed ? "#ecd6b4" : (isEnemySide ? "#efe6d2" : "#fffaf0")), halfSituation ? "#b8860b" : (suppressed ? "#c0392b" : "#d3b982"));
      if (halfSituation) fillRoundRect(ctx, 12, y, 4, rowH, 2, "#b8860b");
      else if (suppressed) fillRoundRect(ctx, 12, y, 4, rowH, 2, "#c0392b");
      text(ctx, ROW_LABELS[row], 22, y + rowH / 2 - (suppressed ? 7 : 0), rowH >= 70 ? 12 : 11, suppressed ? (halfSituation ? "#8b6914" : "#a8321f") : "#775c34");
      const statusLabel = halfSituation ? "半损" : (suppressed ? "压1" : "");
      if (statusLabel) {
        const statusW = 34;
        const statusY = y + rowH / 2 + 3;
        fillRoundRect(ctx, 22, statusY, statusW, 14, 7, halfSituation ? "#b8860b" : "#c0392b");
        text(ctx, statusLabel, 22 + statusW / 2, statusY + 7, 8.5, "#fff7d8", "center");
      }
      text(ctx, `${rowScore(player, row)}`, view.width - 24, y + rowH / 2, rowH >= 70 ? 14 : 13, "#8f3c1f", "right");
      const cards = sortedFieldCards(player.board[row]);
      const rawFieldRight = view.width - 54;
      const cardGap = rowH >= 70 ? 8 : 6;
      const cardH = Math.max(34, rowH - 10);
      const cardW = Math.max(36, Math.min(64, Math.floor(cardH * 0.72)));
      const hornRect = hasHorn ? { x: 70, y: y + 5, w: cardW, h: cardH } : null;
      const fieldX = hornRect ? hornRect.x + hornRect.w + Math.max(12, cardGap + 6) : 86;
      const rawViewportW = Math.max(0, rawFieldRight - fieldX);
      const step = cardW + cardGap;
      const contentW = cards.length ? cards.length * cardW + Math.max(0, cards.length - 1) * cardGap : 0;
      const fullPeekCount = Math.max(1, Math.floor((rawViewportW + cardGap) / step) - 1);
      const peekViewportW = fullPeekCount * step + cardW * 0.5;
      const viewportW = contentW > rawViewportW ? Math.min(rawViewportW, peekViewportW) : rawViewportW;
      const fieldRight = fieldX + viewportW;
      const maxScroll = Math.max(0, contentW - viewportW);
      const scrollKey = `${playerIndex}:${row}`;
      const scroll = Math.max(0, Math.min(ui.battleRowScrolls[scrollKey] || 0, maxScroll));
      ui.battleRowScrolls[scrollKey] = scroll;
      actions.push({ id: "battleFieldRow", playerIndex, row, scrollKey, maxScroll, x: fieldX, y, w: viewportW, h: rowH });
      if (hornRect) {
        const hornCard = rowHornDetailCard(playerIndex, row);
        if (hornCard) {
          const gapW = fieldX - hornRect.x - hornRect.w;
          const dividerX = hornRect.x + hornRect.w + gapW / 2;
          ctx.save();
          ctx.strokeStyle = "rgba(119, 92, 52, 0.30)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(dividerX, y + 8);
          ctx.lineTo(dividerX, y + rowH - 8);
          ctx.stroke();
          ctx.restore();
          actions.push({ id: "battleCardDetail", cardId: hornCard.id, cardUid: hornCard.uid, playerIndex, row, x: hornRect.x - 3, y: hornRect.y - 3, w: hornRect.w + 6, h: hornRect.h + 6 });
          drawRowHornCard(ctx, hornCard, hornRect);
        }
      }
      ctx.save();
      ctx.beginPath();
      ctx.rect(fieldX, y, viewportW, rowH);
      ctx.clip();
      cards.forEach((item, cardIndex) => {
        const x = fieldX + cardIndex * step - scroll;
        if (x >= fieldRight || x + cardW <= fieldX) return;
        const drawRect = { x, y: y + 5, w: cardW, h: cardH };
        const hitX = Math.max(fieldX, x);
        const hitRight = Math.min(fieldRight, x + cardW);
        const detail = { id: "battleCardDetail", cardId: item.id, cardUid: item.uid, playerIndex, row, scrollKey, maxScroll, x: hitX, y: y + 5, w: hitRight - hitX, h: cardH };
        actions.push(detail);
        drawFieldCard(ctx, item, drawRect, rowH, suppressed);
        // 记录首个战场卡牌作为 fieldCardDetail 指引的指向目标
        if (cardIndex === 0 && !ui.__guideFieldCard) ui.__guideFieldCard = { x: detail.x, y: detail.y, w: detail.w, h: detail.h };
      });
      ctx.restore();
      if (maxScroll > 0) {
        const trackW = Math.min(60, viewportW * 0.42);
        const trackX = fieldRight - trackW - 8;
        const trackY = y + rowH - 5;
        const thumbW = Math.max(16, trackW * viewportW / contentW);
        const thumbX = trackX + (trackW - thumbW) * (scroll / maxScroll);
        fillRoundRect(ctx, trackX, trackY, trackW, 3, 1.5, "rgba(119,92,52,0.18)");
        fillRoundRect(ctx, thumbX, trackY - 1, thumbW, 5, 2.5, "rgba(47,111,87,0.58)");
      }
    });
  });
}

const HAND_CARD_H = 96;
const HAND_BOTTOM_OFFSET = 148;
const HAND_LOG_GAP = 12;
const ACTION_BUTTON_H = 34;
const ACTION_BUTTON_BOTTOM_GAP = 4;
const ACTION_BUTTON_BOTTOM_OFFSET = ACTION_BUTTON_H + ACTION_BUTTON_BOTTOM_GAP;

function handSortGroup(card) {
  if (card.category === "stratagem" || card.category === "situation") return 1;
  if (card.category === "leader") return 2;
  return 0;
}

function handEffectKey(card) {
  const abilities = (card.abilities || []).slice().sort().join("/");
  if (abilities) return abilities;
  return `${card.category || ""}:${card.abilityText || ""}:${(card.row || []).join("/")}`;
}

function handCardKey(card) {
  return String(card.name || card.id || "");
}

function sortedHandCards(hand) {
  return hand.map((item, index) => ({ item, index })).sort((a, b) => {
    const groupA = handSortGroup(a.item);
    const groupB = handSortGroup(b.item);
    if (groupA !== groupB) return groupA - groupB;
    if (groupA === 0) {
      const strengthDiff = (a.item.strength || 0) - (b.item.strength || 0);
      if (strengthDiff !== 0) return strengthDiff;
    }
    const effectDiff = handEffectKey(a.item).localeCompare(handEffectKey(b.item), "zh-Hans");
    if (effectDiff !== 0) return effectDiff;
    const cardDiff = handCardKey(a.item).localeCompare(handCardKey(b.item), "zh-Hans");
    if (cardDiff !== 0) return cardDiff;
    const valueDiff = cardValue(a.item) - cardValue(b.item);
    return valueDiff || a.index - b.index;
  }).map(entry => entry.item);
}

function orderedHandCards(hand, state, ui = {}) {
  const sorted = sortedHandCards(hand || []);
  if (!state?.mulligan?.active || !Array.isArray(ui.mulliganHandOrder)) return sorted;
  const byUid = new Map((hand || []).map(item => [item.uid, item]));
  const ordered = ui.mulliganHandOrder.map(uid => byUid.get(uid)).filter(Boolean);
  const used = new Set(ordered.map(item => item.uid));
  sorted.forEach(item => {
    if (item.uid && !used.has(item.uid)) ordered.push(item);
  });
  return ordered;
}

function cardMetaText(card) {
  const rowName = (card.row || []).map(row => ROW_LABELS[row]).join("/");
  if (card.category === "situation" || card.category === "stratagem") {
    return [categoryLabel(card), rowName].filter(Boolean).join(" · ");
  }
  return `${categoryLabel(card)} · ${rowName || "无阵线"} · ${card.strength ?? ""}`;
}

function handScrollBounds(view, itemCount) {
  const gap = 6;
  const left = 10;
  const viewportW = Math.max(0, view.width - left * 2);
  const cardW = Math.floor((view.width - 20 - gap * 5) / 5.5);
  const contentW = itemCount > 0 ? itemCount * cardW + Math.max(0, itemCount - 1) * gap : 0;
  return {
    left,
    viewportW,
    cardW,
    gap,
    contentW,
    maxScroll: Math.max(0, contentW - viewportW)
  };
}

function drawHand(ctx, view, actions, state, ui) {
  const ownerIndex = handOwnerIndex(state);
  const player = state.players[ownerIndex] || state.players[0];
  const waiting = (state.mode === "ai" && state.current !== 0 || state.mode === "online" && !isLocalOnlineAction(state)) && !state.over;
  const sortedHand = orderedHandCards(player.hand, state, ui);
  const bounds = handScrollBounds(view, sortedHand.length);
  const scroll = Math.max(0, Math.min(ui.handScroll || 0, bounds.maxScroll));
  ui.handScroll = scroll;
  const cardH = HAND_CARD_H;
  const startY = view.height - view.safeBottom - HAND_BOTTOM_OFFSET;
  const viewportRight = bounds.left + bounds.viewportW;

  ctx.save();
  ctx.beginPath();
  ctx.rect(bounds.left, startY, bounds.viewportW, cardH);
  ctx.clip();
  sortedHand.forEach((item, index) => {
    const x = bounds.left + index * (bounds.cardW + bounds.gap) - scroll;
    if (x >= viewportRight || x + bounds.cardW <= bounds.left) return;
    const spec = {
      id: "card",
      cardUid: item.uid,
      cardId: item.id,
      x,
      y: startY,
      w: bounds.cardW,
      h: cardH,
      name: item.name,
      summary: item.summary,
      category: categoryLabel(item),
      faction: item.faction,
      row: item.row,
      abilities: item.abilities,
      abilityDisplayNames: item.abilityDisplayNames,
      strength: item.category === "situation" || item.category === "stratagem" ? "" : item.strength,
      nameMax: 4
    };
    const hitX = Math.max(bounds.left, x);
    const hitRight = Math.min(viewportRight, x + bounds.cardW);
    actions.push({ ...spec, x: hitX, w: hitRight - hitX });
    card(ctx, spec);
    if (index === 0) ui.__guideHandCard = { x: hitX, y: startY, w: hitRight - hitX, h: cardH };
  });
  ctx.restore();

  if (bounds.maxScroll > 0) {
    const trackW = Math.min(112, bounds.viewportW * 0.34);
    const trackX = bounds.left + (bounds.viewportW - trackW) / 2;
    const trackY = startY + cardH + 4;
    const thumbW = Math.max(22, trackW * bounds.viewportW / bounds.contentW);
    const thumbX = trackX + (trackW - thumbW) * (scroll / bounds.maxScroll);
    fillRoundRect(ctx, trackX, trackY, trackW, 3, 1.5, "rgba(119,92,52,0.20)");
    fillRoundRect(ctx, thumbX, trackY - 1, thumbW, 5, 2.5, "rgba(47,111,87,0.68)");
  }

  if (waiting) {
    const tipY = startY - 24;
    fillRoundRect(ctx, 16, tipY, view.width - 32, 20, 8, "rgba(141,104,64,0.88)", "rgba(111,77,41,0.8)");
    text(ctx, "等待敌方行动", view.width / 2, tipY + 10, 10, "#fff7d8", "center");
  }
}

function drawPendingChoice(ctx, view, actions, state) {
  const pending = state.pending;
  if (!pending) return;
  if (state.mode === "online" && !isLocalOnlineAction(state)) return;
  const panelY = view.height - view.safeBottom - 286;
  fillRoundRect(ctx, 12, panelY, view.width - 24, 64, 12, "#fff6dc", "#d19330");
  text(ctx, pending.title || "请选择目标", 24, panelY + 15, 12, "#8f3c1f");
  if (pending.type === "firstPlayer") {
    const options = pending.options || [pending.playerIndex];
    const w = Math.floor((view.width - 48) / Math.max(1, options.length));
    options.forEach((playerIndex, index) => {
      const player = state.players[playerIndex] || {};
      const rect = { id: "firstPlayerChoice", playerIndex, x: 18 + index * (w + 6), y: panelY + 28, w, h: 28 };
      actions.push(rect);
      button(ctx, { ...rect, label: `${playerIdentityLabel(state, playerIndex, player.name)}先手`, size: 11, fill: "#2f6f57" });
    });
    return;
  }
  if (pending.type === "row") {
    const rows = pending.rows || [];
    const w = Math.floor((view.width - 48) / Math.max(1, rows.length));
    rows.forEach((row, index) => {
      const rect = { id: "rowChoice", row, x: 18 + index * (w + 6), y: panelY + 28, w, h: 28 };
      actions.push(rect);
      button(ctx, { ...rect, label: ROW_LABELS[row] || row, size: 11, fill: "#2f6f57" });
    });
    const cancel = { id: "pendingCancel", x: view.width - 72, y: panelY + 4, w: 50, h: 22 };
    actions.push(cancel);
    button(ctx, { ...cancel, label: "取消", size: 10, fill: "#8d6840" });
    return;
  }
  if (pending.type === "reviveRow") {
    const rows = pending.rows || [];
    const w = Math.floor((view.width - 48) / Math.max(1, rows.length));
    rows.forEach((row, index) => {
      const rect = { id: "rowChoice", row, x: 18 + index * (w + 6), y: panelY + 28, w, h: 28 };
      actions.push(rect);
      button(ctx, { ...rect, label: ROW_LABELS[row] || row, size: 11, fill: "#2f6f57" });
    });
    return;
  }
  if (pending.type === "leaderDiscard") {
    const selectedCount = (pending.selectedUids || []).length;
    text(ctx, `已选 ${selectedCount}/2 · 点卡牌选择，再点已选卡取消`, 24, panelY + 43, 10, "#775c34");
    const cancel = { id: "pendingCancel", x: view.width - 72, y: panelY + 28, w: 50, h: 28 };
    actions.push(cancel);
    button(ctx, { ...cancel, label: "取消", size: 10, fill: "#8d6840" });
    return;
  }
  if (pending.type === "revive") return;
  if (pending.type === "leaderSituation") return;
  const candidates = (pending.candidates || []).slice(0, 3);
  const w = Math.floor((view.width - 94) / 3);
  candidates.forEach((entry, index) => {
    const item = entry.card || entry;
    const rect = { id: "targetChoice", cardUid: item.uid, cardId: item.id, x: 18 + index * (w + 6), y: panelY + 28, w, h: 28 };
    actions.push(rect);
    button(ctx, { ...rect, label: `${item.name.slice(0, 4)} ${item.effective == null ? item.strength || "" : item.effective}`, size: 10, fill: "#7a5a95" });
  });
  const skipId = pending.type === "recall" ? "pendingCancel" : "pendingSkip";
  const skipLabel = pending.type === "recall" ? "取消" : "跳过";
  const skipBtn = { id: skipId, x: view.width - 70, y: panelY + 28, w: 52, h: 28 };
  actions.push(skipBtn);
  button(ctx, { ...skipBtn, label: skipLabel, size: 10, fill: "#8d6840" });
}

function localPlayerIndex(state) {
  return state.mode === "online" && Number.isInteger(state.localPlayerIndex) ? state.localPlayerIndex : 0;
}

function battleCardMatch(card, cardId, cardUid) {
  if (!card) return false;
  if (cardUid && card.uid === cardUid) return true;
  return !cardUid && cardId && card.id === cardId;
}

function findBattleCardContext(state, cardId, cardUid) {
  if (!state || (!cardId && !cardUid)) return null;
  const revealCard = (state.leaderReveals?.[localPlayerIndex(state)]?.cards || []).find(item => battleCardMatch(item, cardId, cardUid));
  if (revealCard) return { card: revealCard, playerIndex: localPlayerIndex(state), row: null, zone: "leaderReveal" };
  const rowHornContext = findRowHornContext(state, cardUid);
  if (rowHornContext) return rowHornContext;
  for (let pi = 0; pi < state.players.length; pi += 1) {
    const player = state.players[pi];
    for (const row of ROWS) {
      const card = (player.board[row] || []).find(item => battleCardMatch(item, cardId, cardUid));
      if (card) return { card, playerIndex: pi, row, zone: "board" };
    }
  }
  for (let pi = 0; pi < state.players.length; pi += 1) {
    const player = state.players[pi];
    const piles = [
      ["hand", player.hand || []],
      ["discard", player.discard || []]
    ];
    for (const [zone, pile] of piles) {
      const card = pile.find(item => battleCardMatch(item, cardId, cardUid));
      if (card) return { card, playerIndex: pi, row: null, zone };
    }
    if (battleCardMatch(player.leader, cardId, cardUid)) return { card: player.leader, playerIndex: pi, row: null, zone: "leader" };
  }
  return null;
}

function detailEntry(card) {
  return card ? { card, cardId: card.id || "", cardUid: card.uid || "" } : null;
}

function detailEntries(cards) {
  return (cards || []).map(detailEntry).filter(Boolean);
}

function visibleLeaderCards(state) {
  const local = localPlayerIndex(state);
  const enemy = local === 0 ? 1 : 0;
  return [state.players[enemy]?.leader, state.players[local]?.leader].filter(Boolean);
}

function visibleHandDetailCards(state, ui = {}) {
  const ownerIndex = handOwnerIndex(state);
  const player = state.players[ownerIndex] || state.players[0];
  return orderedHandCards(player?.hand || [], state, ui);
}

function visibleDiscardDetailCards(state, ui = {}, fallbackOwner) {
  const owner = state.players[ui.discardPileOwner]
    ? ui.discardPileOwner
    : (state.players[fallbackOwner] ? fallbackOwner : localPlayerIndex(state));
  return groupDiscardCards(state.players[owner]?.discard || []).map(group => ({
    ...group.card,
    stackCount: group.count
  }));
}

function groupSameNameCards(cards) {
  const map = new Map();
  const order = [];
  cards.forEach(card => {
    const key = `${card.name || card.id}__${card.faction || ""}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...card, stackCount: 1 });
      order.push(key);
    } else {
      existing.stackCount += 1;
    }
  });
  return order.map(k => map.get(k));
}

function visiblePendingDetailCards(state) {
  if (!state.pending || state.pending.type === "row") return [];
  const cards = (state.pending.candidates || []).map(entry => entry.card || entry).filter(Boolean);
  if (state.pending.type === "recall") return groupSameNameCards(cards);
  return cards;
}

function pendingDetailType(state, ui = {}) {
  if (!state?.pending || !["revive", "leaderDiscard", "recall", "leaderSituation"].includes(state.pending.type)) return "";
  return visiblePendingDetailCards(state).some(card => battleCardMatch(card, ui.battleCardDetailId, ui.battleCardDetailUid))
    ? state.pending.type
    : "";
}

function ensurePendingDetail(state, ui = {}) {
  if (!state?.pending || !["revive", "leaderDiscard", "recall", "leaderSituation"].includes(state.pending.type) || !isLocalOnlineAction(state)) return;
  if (ui.battleCardDetailId || ui.battleCardDetailUid) return;
  const selected = new Set(state.pending.selectedUids || []);
  const first = visiblePendingDetailCards(state).find(card => !selected.has(card.uid)) || visiblePendingDetailCards(state)[0];
  if (!first) return;
  ui.battleCardDetailId = first.id || "";
  ui.battleCardDetailUid = first.uid || "";
  ui.detailSwipe = null;
}

function detailCardEntries(state, ui = {}, view = null) {
  // 牌库候选牌不在战场、手牌或弃牌堆中，必须先按待选列表构造左右滑动范围。
  const pendingCards = visiblePendingDetailCards(state);
  if (pendingCards.some(card => battleCardMatch(card, ui.battleCardDetailId, ui.battleCardDetailUid))) return detailEntries(pendingCards);
  const context = findBattleCardContext(state, ui.battleCardDetailId, ui.battleCardDetailUid);
  if (!context) return [];
  const revealCards = state.leaderReveals?.[localPlayerIndex(state)]?.cards || [];
  if (revealCards.some(card => battleCardMatch(card, ui.battleCardDetailId, ui.battleCardDetailUid))) return detailEntries(revealCards);
  if (context.zone === "leader") return detailEntries(visibleLeaderCards(state));
  if ((context.zone === "board" || context.zone === "rowHorn") && context.row) {
    return detailEntries(rowDetailCardsWithHorn(state, context.playerIndex, context.row));
  }
  if (context.zone === "hand") return detailEntries(visibleHandDetailCards(state, ui));
  if (context.zone === "discard") return detailEntries(visibleDiscardDetailCards(state, ui, context.playerIndex));
  return [];
}

function leaderTextForBattle(player) {
  return `${player?.leader?.name || ""} ${player?.leader?.abilityText || ""}`;
}

function hasEnvoyDoubleLeader(player) {
  return /出使.*翻倍|间谍翻倍/i.test(leaderTextForBattle(player));
}

function envoyDoubleActive(state) {
  return state.players.some(p => p.leaderUsed && hasEnvoyDoubleLeader(p));
}

function collectBoardInstances(state, card) {
  const results = [];
  if (!state || !card) return results;
  state.players.forEach((player, pi) => {
    ROWS.forEach(row => {
      (player.board[row] || []).forEach(item => {
        if (item.id === card.id || (card.name && item.name === card.name && item.faction === card.faction)) {
          results.push({ card: item, playerIndex: pi, row });
        }
      });
    });
  });
  return results;
}

function describeBoardCardEffect(state, context) {
  const { card, playerIndex, row } = context;
  const player = state.players[playerIndex];
  const rowCards = player?.board?.[row] || [];
  const base = card.strength || 0;
  const current = card.effective == null ? base : card.effective;
  const lines = [];
  const rowLabel = ROW_LABELS[row] || row;

  if (isHeroCard(card)) {
    const blocked = [];
    if (state.situations[row]) blocked.push("时局");
    if (state.rowHorn?.[playerIndex]?.[row] || rowCards.some(item => hasAbility(item, "鼓舞"))) blocked.push("鼓舞");
    if (rowCards.some(item => item.uid !== card.uid && hasAbility(item, "振势"))) blocked.push("振势");
    if (hasAbility(card, "同盟") && rowCards.filter(item => hasAbility(item, "同盟") && item.name === card.name).length > 1) blocked.push("同盟");
    lines.push(`所在阵线：${rowLabel}，当前战力 ${current}（基础 ${base}）。`);
    if (blocked.length) lines.push(`传世：不受${blocked.join("、")}修正影响。`);
    else lines.push("传世：不受时局、鼓舞、振势、同盟等战力修正影响。");
    return lines;
  }

  lines.push(current !== base
    ? `战力：${base} → ${current}`
    : `战力：${current}`);
  if (card.transformed && card.transformedFrom) {
    lines.push(`蛰伏转化：由「${card.transformedFrom}」经雪耻触发转化为当前形态。`);
  }
  if (state.situations[row]) {
    lines.push(hasActiveHalfSituationLeader(state, player)
      ? `时局：${rowLabel}受压制，主将效果使其改为半损。`
      : `时局：${rowLabel}受压制，基础战力降为 1。`);
  }
  const bondCount = hasAbility(card, "同盟")
    ? rowCards.filter(item => hasAbility(item, "同盟") && item.name === card.name).length
    : 0;
  if (bondCount > 1) lines.push(`同盟：同名同盟牌 ${bondCount} 张，战力 ×${bondCount}。`);
  const moraleCount = rowCards.filter(item => item.uid !== card.uid && hasAbility(item, "振势")).length;
  if (moraleCount > 0) lines.push(`振势：同阵线 ${moraleCount} 张振势牌，战力 +${moraleCount}。`);
  const hornCards = rowCards.filter(item => hasAbility(item, "鼓舞"));
  if (state.rowHorn?.[playerIndex]?.[row] || hornCards.length) {
    const hornSource = hornCards.length ? `「${short(hornCards[0].name || hornCards[0].name || "鼓舞", 6)}」` : "已打出的鼓舞";
    lines.push(`鼓舞：${hornSource}影响${rowLabel}，战力翻倍。`);
  }
  if (hasAbility(card, "出使") && envoyDoubleActive(state)) lines.push("主将：双方出使人物战力翻倍。");
  return lines;
}

function battlePowerEffectSections(state, context, fallbackCard) {
  if (!state) return [];
  let boardContexts = [];
  if (context && context.zone === "board" && context.row) {
    boardContexts = [context];
  } else if (fallbackCard) {
    boardContexts = collectBoardInstances(state, fallbackCard);
  }
  if (!boardContexts.length) return [];
  boardContexts = boardContexts.filter(item => {
    const card = item.card;
    if (!card || card.category === "situation" || card.category === "stratagem") return false;
    const base = card.strength || 0;
    const current = card.effective == null ? base : card.effective;
    return current !== base || card.transformed;
  });
  if (!boardContexts.length) return [];

  const blocks = [];
  boardContexts.forEach((ctx, idx) => {
    const owner = playerIdentityLabel(state, ctx.playerIndex, `玩家${ctx.playerIndex + 1}`);
    const header = boardContexts.length > 1 ? `实例 ${idx + 1}（${owner}）：\n` : "";
    const desc = describeBoardCardEffect(state, ctx).join("\n");
    blocks.push(header + desc);
  });

  return [{ title: "战力影响", content: blocks.join("\n\n"), color: "#2f6f57", lines: 12 }];
}

function actionOwnerIndex(state) {
  if (state.mulligan && state.mulligan.active) {
    if (state.mulligan.simultaneous && state.mode === "online") {
      const local = localPlayerIndex(state);
      return state.mulligan.done?.[local] ? -1 : local;
    }
    return state.mulligan.current || 0;
  }
  if (state.pending) {
    if (Number.isInteger(state.pending.playerIndex)) return state.pending.playerIndex;
    return state.current || 0;
  }
  return state.current || 0;
}

function isLocalOnlineAction(state) {
  return state.mode !== "online" || actionOwnerIndex(state) === localPlayerIndex(state);
}

function mulliganDetailSections(state, context) {
  if (!state?.mulligan?.active) return [];
  const owner = context?.zone === "hand" ? context.playerIndex : handOwnerIndex(state);
  const used = state.mulligan.used?.[owner] || 0;
  const max = state.mulligan.max || 2;
  const left = Math.max(0, max - used);
  const done = state.mulligan.done?.[owner];
  const startLabel = state.mode === "online" ? "准备" : "不换开始";
  const lines = done
    ? "你已完成换牌，正在等待敌方。"
    : `本局可换 ${max} 张：已换 ${used} 张，还可换 ${left} 张。\n点击当前卡牌可直接替换；也可点空白回到手牌后选择其它牌。\n不想换牌时，点击「${startLabel}」保留当前手牌。`;
  return [{ title: "换牌说明", content: lines, color: "#8f3c1f", lines: 4 }];
}

function playerSideLabel(state, playerIndex) {
  return playerIndex === localPlayerIndex(state) ? "我方" : "敌方";
}

function playerIdentityLabel(state, playerIndex, fallbackName) {
  const playerName = state.players?.[playerIndex]?.name || fallbackName || `玩家${playerIndex + 1}`;
  return state.mode === "online" ? `${playerSideLabel(state, playerIndex)}（${playerName}）` : playerName;
}

function localizeBattleEntryText(value, entry, state) {
  const content = String(value || "");
  if (state?.mode !== "online") return content;
  let playerIndex = Number.isInteger(entry?.playerIndex) ? entry.playerIndex : -1;
  if (playerIndex < 0) {
    playerIndex = (state.players || []).findIndex(player => player?.name && content.startsWith(player.name));
  }
  if (playerIndex < 0) return content;
  const playerName = entry?.playerName || state.players?.[playerIndex]?.name || "";
  const identity = playerIdentityLabel(state, playerIndex, playerName);
  return playerName && content.startsWith(playerName) ? `${identity}${content.slice(playerName.length)}` : content;
}

function applyRoundMorale(morale, winner) {
  const next = [morale[0], morale[1]];
  if (winner == null) {
    next[0] -= 1;
    next[1] -= 1;
  } else {
    next[winner === 0 ? 1 : 0] -= 1;
  }
  return next.map(value => Math.max(0, value));
}

function moraleAfterRoundResults(results) {
  return (Array.isArray(results) ? results : []).reduce((morale, result) => {
    if (Array.isArray(result?.morale) && result.morale.length >= 2) return [result.morale[0] || 0, result.morale[1] || 0];
    return applyRoundMorale(morale, result?.winner == null ? null : result.winner);
  }, [2, 2]);
}

function drawMoraleToken(ctx, x, y, active, fill, size = 6) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x, y - size);
  ctx.lineTo(x + size, y);
  ctx.lineTo(x, y + size);
  ctx.lineTo(x - size, y);
  ctx.closePath();
  ctx.fillStyle = active ? fill : "#d8c9ad";
  ctx.fill();
  ctx.lineWidth = Math.max(1, size * 0.2);
  ctx.strokeStyle = active ? fill : "#bfa77c";
  ctx.stroke();
  ctx.restore();
}

function drawMoraleTokens(ctx, x, y, count, fill, loss = 0, size = 6, gap = 16) {
  for (let index = 0; index < 2; index += 1) {
    drawMoraleToken(ctx, x + index * gap, y, index < count, fill, size);
  }
  if (loss > 0) text(ctx, `-${loss}`, x + gap * 2 + 6, y + 1, 10, "#9f3b24", "center");
}

function sideStatusLabel(state, playerIndex) {
  const playerName = state.players?.[playerIndex]?.name || `玩家${playerIndex + 1}`;
  if (state.mode === "online") return short(playerName, 4);
  if (state.mode === "ai") return playerIndex === localPlayerIndex(state) ? "玩家" : "系统";
  return short(playerName, 4);
}

function panelAfterHeader(view, header, preferredW) {
  if (!header) return { x: 10, y: view.safeTop + 2, w: preferredW, h: 24 };
  const x = header.x + header.w + 6;
  const availableW = Math.max(72, view.width - x - 10);
  return { x, y: header.y, w: Math.min(preferredW, availableW), h: header.h };
}

function drawSharedDiscardPileButton(ctx, view, actions, state, header) {
  const local = localPlayerIndex(state);
  const opponent = local === 0 ? 1 : 0;
  const localCount = state.players?.[local]?.discard?.length || 0;
  const opponentCount = state.players?.[opponent]?.discard?.length || 0;
  const rect = { id: "viewDiscardPile", playerIndex: local, ...panelAfterHeader(view, header, 112) };
  actions.push(rect);
  fillRoundRect(ctx, rect.x, rect.y, rect.w, rect.h, 10, "rgba(255,250,240,0.94)", "#d3b982");
  drawFittedText(ctx, `双方弃牌 ${localCount}/${opponentCount}`, rect.x + rect.w / 2, rect.y + rect.h / 2 + 1, rect.w - 12, 10, "#775c34");
}

function drawRoundResultMarkers(ctx, view, state, header) {
  const local = localPlayerIndex(state);
  const opponent = local === 0 ? 1 : 0;
  const morale = moraleAfterRoundResults(state.roundResults || []);
  const panel = panelAfterHeader(view, header, 126);
  const labelW = state.mode === "online" ? 36 : 28;
  const titleX = panel.x + 14;
  const labelX = panel.x + 28 + labelW / 2;
  const tokenX = panel.x + 34 + labelW;
  const topY = panel.y + panel.h * 0.34;
  const bottomY = panel.y + panel.h * 0.72;
  fillRoundRect(ctx, panel.x, panel.y, panel.w, panel.h, 10, "rgba(255,250,240,0.94)", "#d3b982");
  text(ctx, "军心", titleX, panel.y + panel.h / 2 + 1, 8, "#8a6132", "center");
  drawFittedText(ctx, sideStatusLabel(state, opponent), labelX, topY + 1, labelW, 8.5, "#8f3c1f");
  drawFittedText(ctx, sideStatusLabel(state, local), labelX, bottomY + 1, labelW, 8.5, "#2f6f57");
  drawMoraleTokens(ctx, tokenX, topY, morale[opponent] || 0, "#8f3c1f", 0, 4.6, 12);
  drawMoraleTokens(ctx, tokenX, bottomY, morale[local] || 0, "#2f6f57", 0, 4.6, 12);
}

function compactEffectNames(namesText, count) {
  const counts = {};
  String(namesText || "").split("、").map(name => name.trim()).filter(Boolean).forEach(name => {
    const m = name.match(/^(.*?)(?:x(\d+))?$/i);
    const cleanName = (m?.[1] || name).trim();
    const amount = Number(m?.[2]) || 1;
    if (cleanName) counts[cleanName] = (counts[cleanName] || 0) + amount;
  });
  const entries = Object.entries(counts);
  if (entries.length === 1 && count && entries[0][1] === 1) entries[0][1] = Number(count) || entries[0][1];
  return entries.map(([name, amount]) => amount > 1 ? `${short(name, 10)}x${amount}` : short(name, 12)).join("、");
}

function normalizeBattleEffectSegment(segment) {
  const value = String(segment || "").replace(/^\s+|\s+$/g, "").replace(/。$/, "");
  if (!value) return "";
  const direct = value.match(/^(集贤|出使|济世|鼓舞|晴天|时局|奇策|侦察|取回|洗牌|调度|封锁|抽牌|半损|召唤岳家军|雪耻|破釜|请辞|弃牌|主将技能)：(.+)/);
  if (direct) {
    const limit = direct[1] === "主将技能" ? 24 : (direct[1] === "奇策" ? 18 : (direct[1] === "弃牌" ? 24 : 16));
    return `${direct[1]}：${short(direct[2].trim(), limit)}`;
  }

  const recruit = value.match(/^集贤(?:生效：)?(?:(?:从牌库)?额外打出|从牌库打出)\s*(\d+)\s*张[^：；。]*(?:：([^；。]+))?/);
  if (recruit) {
    const result = compactEffectNames(recruit[2] || "", Number(recruit[1])) || `额外打出x${recruit[1]}`;
    return `集贤：${result}`;
  }
  const summon = value.match(/^召唤岳家军\s*(\d+)\s*张(?:：([^；。]+))?/);
  if (summon) {
    const result = compactEffectNames(summon[2] || "岳家军", Number(summon[1])) || `岳家军x${summon[1]}`;
    return `召唤岳家军：${result}`;
  }
  const highestPowerRemoval = value.match(/^奇策(?:销毁|摧毁)[:：]?(.+)/);
  if (highestPowerRemoval) return `奇策：${short(highestPowerRemoval[1].trim(), 18)}`;
  const dormantUnit = value.match(/^(?:蛰伏|奋起)转化\s*(\d+)\s*张/);
  if (dormantUnit) return `雪耻：蛰伏x${dormantUnit[1]}`;
  const envoy = value.match(/^出使生效：.*抽\s*(\d+)\s*张牌/);
  if (envoy && Number(envoy[1]) > 0) return `出使：抽牌x${envoy[1]}`;
  const revival = value.match(/^举荐生效：.*复归「([^」]+)」/);
  if (revival) return `济世：${short(revival[1], 12)}`;
  return "";
}

function leaderSkillSummaryLabel(entry) {
  if (entry.actionType !== "leader") return "";
  const summary = String(entry.summary || "").replace(/。$/, "").trim();
  if (!summary || summary === "主将技能") return "";
  return `主将技能：${short(summary, 24)}`;
}

function battlePlayEntryEffectLabels(entry) {
  const source = [entry.description, entry.text].filter(Boolean).map(String).join("；");
  const labels = [];
  const leaderSummary = leaderSkillSummaryLabel(entry);
  if (leaderSummary) labels.push(leaderSummary);
  source.split(/[；。]/).forEach(segment => {
    const label = normalizeBattleEffectSegment(segment);
    if (label && !labels.includes(label)) labels.push(label);
  });
  return labels;
}

function battlePlayEntryEffectText(entry) {
  const labels = battlePlayEntryEffectLabels(entry);
  return labels.length ? ` → ${labels.join("；")}` : "";
}

function battlePlayEntryLeaderLabel(entry) {
  if (entry.actionType !== "leader") return "";
  const source = [entry.description, entry.summary, entry.text].filter(Boolean).map(String).join("；");
  return /封锁对手主将技能|主将技能被封锁|主将能力已被封锁|cancel.*leader/i.test(source) ? "，对手主将技能被封锁" : "";
}

function battlePlayEntryText(entry, state) {
  if (entry.type === "boardChange") return localizeBattleEntryText(String(entry.text || "场上卡牌变化").replace(/。$/, ""), entry, state);
  const effectText = battlePlayEntryEffectText(entry);
  const leaderLabel = battlePlayEntryLeaderLabel(entry);
  if (entry.text) {
    const value = String(entry.text)
      .replace(/^第\s*\d+\s*回合\s*[·：:]\s*/, "")
      .replace(/；?(集贤|召唤岳家军|召唤|奇策|雪耻|破釜|蛰伏转化|奋起转化|出使生效|举荐生效|济世|请辞|鼓舞|时局|晴天|侦察|取回|洗牌|调度|封锁|抽牌|半损|主将技能)[^；。]*。?/g, "")
      .replace(/到(?:己方|对方)(?:疆场|朝堂|文脉)/g, "")
      .replace(/\s*(?:→|->)\s*[^；。]*/g, "")
      .replace(/。$/, "")
      .trim();
    const suffix = leaderLabel && !effectText && !/主将技能被封锁|主将能力已被封锁/.test(value) ? leaderLabel : "";
    return `${localizeBattleEntryText(value, entry, state)}${suffix}${effectText}`;
  }
  const verb = entry.actionType === "leader" ? "使用主将" : "打出";
  const actor = state?.mode === "online" && Number.isInteger(entry.playerIndex)
    ? playerIdentityLabel(state, entry.playerIndex, entry.playerName)
    : (entry.playerName || "玩家");
  const suffix = leaderLabel && !effectText ? leaderLabel : "";
  return `${actor}${verb}「${entry.name || "未知卡牌"}」${suffix}${effectText}`;
}

function mergeBattlePlayLogEntries(logs) {
  const entries = [];
  let pendingEffects = [];
  (logs || []).forEach(item => {
    const value = String(item || "").replace(/。$/, "");
    const effect = normalizeBattleEffectSegment(value);
    if (effect) {
      pendingEffects.push(effect);
      return;
    }
    if (/打出|使用主将/.test(value)) {
      const textValue = pendingEffects.length ? `${value}；${pendingEffects.reverse().join("；")}。` : `${value}。`;
      entries.push({ text: textValue });
      pendingEffects = [];
    }
  });
  return entries;
}

function summonHistoryInfo(entry) {
  const source = [entry.description, entry.text].filter(Boolean).map(String).join("；");
  const modern = source.match(/召唤岳家军：([^；。]+)/);
  if (modern) {
    const names = modern[1].split("、").map(item => item.trim()).filter(Boolean);
    const count = names.reduce((sum, name) => sum + (Number(name.match(/x(\d+)$/i)?.[1]) || 1), 0);
    return {
      count,
      names: names.map(name => name.replace(/x\d+$/i, "").trim()).filter(Boolean)
    };
  }
  const m = source.match(/召唤岳家军\s*(\d+)\s*张(?:：([^；。]+))?/);
  if (!m) return null;
  return {
    count: Number(m[1]) || 0,
    names: (m[2] || "岳家军").split("、").map(name => name.trim()).filter(Boolean)
  };
}

function shouldHideSummonedBattleEntry(history, entry) {
  if (!entry || entry.actionType !== "card" || !Number.isFinite(entry.seq)) return false;
  const name = entry.name || "";
  if (!name) return false;
  return history.some(parent => {
    if (!parent || !Number.isFinite(parent.seq) || parent.seq >= entry.seq) return false;
    if (parent.playerIndex !== entry.playerIndex) return false;
    const info = summonHistoryInfo(parent);
    if (!info || entry.seq > parent.seq + info.count) return false;
    return !info.names.length || info.names.includes(name);
  });
}

function visibleBattlePlayHistory(history) {
  return history.filter((entry) => !shouldHideSummonedBattleEntry(history, entry));
}

function battlePlayEntries(state) {
  const history = Array.isArray(state.playedHistory) ? visibleBattlePlayHistory(state.playedHistory) : [];
  if (history.length) return history;
  const playLogs = mergeBattlePlayLogEntries(state.logs || []);
  if (playLogs.length) return playLogs;
  return state.lastPlayed ? [state.lastPlayed] : [];
}

function discardCardGroupKey(card) {
  const row = Array.isArray(card?.row) ? card.row.join("/") : (card?.row || "");
  const abilities = Array.isArray(card?.abilities) ? card.abilities.join("/") : "";
  return [
    card?.name || card?.displayName || card?.id || "card",
    card?.faction || "",
    card?.category || "",
    card?.strength ?? "",
    row,
    abilities
  ].join("|");
}

function groupDiscardCards(cards) {
  const groups = [];
  const indexByKey = Object.create(null);
  (cards || []).forEach((card, i) => {
    const key = discardCardGroupKey(card);
    if (indexByKey[key] != null) {
      const group = groups[indexByKey[key]];
      group.count += 1;
      group.cards.push(card);
    } else {
      indexByKey[key] = groups.length;
      groups.push({ key, card, index: i, count: 1, cards: [card] });
    }
  });
  return groups;
}

function discardStackCount(state, context, detail) {
  if (context?.zone !== "discard" || !detail) return detail?.stackCount || 1;
  const owner = state.players[context.playerIndex] ? context.playerIndex : localPlayerIndex(state);
  const group = groupDiscardCards(state.players[owner]?.discard || [])
    .find(item => item.cards.some(card => battleCardMatch(card, detail.id, detail.uid)) || item.key === discardCardGroupKey(detail));
  return group?.count || detail.stackCount || 1;
}

function discardStrengthLabel(card) {
  if (card?.category === "situation" || card?.category === "stratagem") return "策";
  if (card?.category === "leader") return "将";
  return card?.effective != null ? card.effective : (card?.strength ?? "");
}

function drawDiscardCardBadges(ctx, card, count, x, y, w, h) {
  const strength = discardStrengthLabel(card);
  if (strength !== "") {
    const bs = Math.max(20, Math.round(w * 0.28));
    const hero = isHeroCard(card);
    fillRoundRect(ctx, x + 3, y + 3, bs, bs, bs / 2, hero ? "#1f2f4f" : "#8f3c1f", hero ? "#f4b63d" : "rgba(255,247,216,0.88)");
    text(ctx, String(strength), x + 3 + bs / 2, y + 3 + bs / 2, Math.max(11, Math.round(bs * 0.58)), hero ? "#ffe27a" : "#fff7d8", "center");
  }
  if (count > 1) {
    const label = `x${count}`;
    ctx.save();
    const badgeH = Math.max(17, Math.round(w * 0.22));
    ctx.font = `bold ${Math.max(10, Math.round(badgeH * 0.62))}px ${FIELD_FONT}`;
    const badgeW = Math.min(w - 10, Math.max(26, ctx.measureText(label).width + 12));
    const bx = x + (w - badgeW) / 2;
    const by = y + h - badgeH - 24;
    fillRoundRect(ctx, bx, by, badgeW, badgeH, badgeH / 2, "rgba(47,111,87,0.94)", "rgba(255,247,216,0.84)");
    ctx.fillStyle = "#fff7d8";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, bx + badgeW / 2, by + badgeH / 2 + 0.5);
    ctx.restore();
  }
}

function discardPileMetrics(view, state, ui) {
  const width = view.width;
  const height = view.height;
  const safeTop = view.safeTop || 0;
  const safeBottom = view.safeBottom || 0;
  const panelX = 16;
  const panelW = width - 32;
  const panelY = safeTop + 74;
  const panelH = Math.max(300, Math.min(430, height - safeTop - safeBottom - 178));
  const gridLeft = panelX + 12;
  const gridRight = panelX + panelW - 14;
  const gridTop = panelY + 86;
  const gridBottom = panelY + panelH - 14;
  const gridHeight = gridBottom - gridTop;
  const innerW = gridRight - gridLeft;
  const cols = Math.max(2, Math.min(4, Math.floor(innerW / 96)));
  const cellW = innerW / cols;
  const cardW = Math.min(cellW - 8, 104);
  const cardH = cardW * 1.4;
  const nameH = 16;
  const rowH = cardH + nameH + 8;
  const local = localPlayerIndex(state);
  const owner = state.players[ui.discardPileOwner] ? ui.discardPileOwner : local;
  const cards = groupDiscardCards(state.players[owner]?.discard || []);
  const rows = Math.ceil(cards.length / cols);
  const contentHeight = Math.max(0, rows * rowH - 8);
  const scrollMax = Math.max(0, contentHeight - gridHeight);
  return { panelX, panelW, panelY, panelH, gridLeft, gridRight, gridTop, gridBottom, gridHeight, cols, cellW, cardW, cardH, nameH, rowH, contentHeight, scrollMax };
}

function drawDiscardPilePanel(ctx, view, actions, state, ui) {
  if (ui.discardPileOwner == null) return;
  const local = localPlayerIndex(state);
  const enemy = local === 0 ? 1 : 0;
  const owner = state.players[ui.discardPileOwner] ? ui.discardPileOwner : local;
  const pile = groupDiscardCards(state.players[owner]?.discard || []);
  const m = discardPileMetrics(view, state, ui);
  const { panelX, panelW, panelY, panelH, gridLeft, gridRight, gridTop, gridBottom, gridHeight, cols, cellW, cardW, cardH, nameH, rowH } = m;

  actions.push({ id: "closeDiscardPile", x: 0, y: 0, w: view.width, h: view.height });
  ctx.save();
  ctx.fillStyle = "rgba(38, 28, 18, 0.46)";
  ctx.fillRect(0, 0, view.width, view.height);
  ctx.restore();
  actions.push({ id: "discardPilePanel", x: panelX, y: panelY, w: panelW, h: panelH });
  fillRoundRect(ctx, panelX, panelY, panelW, panelH, 18, "#fffaf0", "#d3b982");
  text(ctx, "弃牌堆", panelX + 18, panelY + 24, 18, "#2f2417");
  const close = { id: "closeDiscardPile", x: panelX + panelW - 42, y: panelY + 10, w: 28, h: 28 };
  actions.push(close);
  fillRoundRect(ctx, close.x, close.y, close.w, close.h, 14, "rgba(141,104,64,0.92)", "#6f4d29");
  text(ctx, "×", close.x + close.w / 2, close.y + close.h / 2 + 1, 15, "#fff7d8", "center");

  const tabW = (panelW - 48) / 2;
  [local, enemy].forEach((playerIndex, index) => {
    const active = owner === playerIndex;
    const rect = { id: "switchDiscardPile", playerIndex, x: panelX + 18 + index * (tabW + 12), y: panelY + 42, w: tabW, h: 28 };
    actions.push(rect);
    button(ctx, { ...rect, label: `${playerSideLabel(state, playerIndex)} ${state.players[playerIndex]?.discard?.length || 0}张`, size: 11, fill: active ? "#2f6f57" : "#8d6840", r: 9 });
  });

  const scroll = ui.discardPileScroll || 0;

  if (!pile.length) {
    text(ctx, `${playerSideLabel(state, owner)}暂无弃牌`, panelX + panelW / 2, gridTop + gridHeight / 2, 14, "#775c34", "center");
    return;
  }

  ctx.save();
  ctx.beginPath();
  ctx.rect(gridLeft, gridTop, gridRight - gridLeft, gridHeight);
  ctx.clip();
  pile.forEach((group, index) => {
    const item = group.card;
    const col = index % cols;
    const rowIndex = Math.floor(index / cols);
    const x = gridLeft + col * cellW + (cellW - cardW) / 2;
    const y = gridTop - scroll + rowIndex * rowH;
    if (y + cardH + nameH < gridTop || y > gridBottom) return;
    drawCardImage(ctx, { ...item, x, y, w: cardW, h: cardH, imageFill: true, imageX: x, imageY: y, imageW: cardW, imageH: cardH });
    drawDiscardCardBadges(ctx, item, group.count, x, y, cardW, cardH);
    text(ctx, short(item.name || "未知卡牌", 10), x + cardW / 2, y + cardH + nameH / 2 + 2, 12, "#5b4a2f", "center");
    actions.push({ id: "battleCardDetail", cardId: item.id, cardUid: item.uid, owner, x, y, w: cardW, h: cardH + nameH });
  });
  ctx.restore();

  if (m.scrollMax > 0) {
    const trackX = gridRight + 3;
    const trackY = gridTop;
    const trackH = gridHeight;
    const thumbH = Math.max(24, trackH * (trackH / m.contentHeight));
    const thumbY = trackY + (trackH - thumbH) * (scroll / m.scrollMax);
    fillRoundRect(ctx, trackX, trackY, 4, trackH, 2, "rgba(119,92,52,0.18)");
    fillRoundRect(ctx, trackX - 1, thumbY, 6, thumbH, 3, "rgba(47,111,87,0.72)");
  }

}

function wrappedTextLineCount(ctx, content, maxWidth, size, maxLines) {
  const value = String(content || "");
  let count = 0;
  ctx.font = `${size || 13}px ${FIELD_FONT}`;
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
  return maxLines ? Math.min(count || 1, maxLines) : (count || 1);
}

function drawBattleLogHistoryPanel(ctx, view, actions, state, ui) {
  if (!ui.battleLogHistoryOpen) return;
  const entries = battlePlayEntries(state);
  const panelX = 16;
  const panelY = view.safeTop + 74;
  const panelW = view.width - 32;
  const panelH = Math.max(300, Math.min(430, view.height - view.safeTop - view.safeBottom - 156));
  const listTop = panelY + 72;
  const listBottom = panelY + panelH - 22;
  const rowH = 48;
  const viewportH = Math.max(0, listBottom - listTop);
  const contentH = entries.length * rowH;
  const maxScroll = Math.max(0, contentH - viewportH);
  const scroll = Math.max(0, Math.min(ui.battleLogHistoryScroll || 0, maxScroll));
  ui.battleLogHistoryScroll = scroll;

  actions.push({ id: "closeBattleLogHistory", x: 0, y: 0, w: view.width, h: view.height });
  ctx.save();
  ctx.fillStyle = "rgba(38, 28, 18, 0.46)";
  ctx.fillRect(0, 0, view.width, view.height);
  ctx.restore();
  actions.push({ id: "battleLogHistoryPanel", x: panelX, y: panelY, w: panelW, h: panelH });
  fillRoundRect(ctx, panelX, panelY, panelW, panelH, 18, "#fffaf0", "#d3b982");
  text(ctx, "对战记录", panelX + 18, panelY + 24, 18, "#2f2417");
  text(ctx, "上滑看更早，下滑看较新", panelX + 18, panelY + 48, 11, "#775c34");
  const close = { id: "closeBattleLogHistory", x: panelX + panelW - 42, y: panelY + 10, w: 28, h: 28 };
  actions.push(close);
  fillRoundRect(ctx, close.x, close.y, close.w, close.h, 14, "rgba(141,104,64,0.92)", "#6f4d29");
  text(ctx, "×", close.x + close.w / 2, close.y + close.h / 2 + 1, 15, "#fff7d8", "center");

  if (!entries.length) {
    text(ctx, "暂无对战记录", panelX + panelW / 2, panelY + panelH / 2 + 8, 14, "#775c34", "center");
  } else {
    ctx.save();
    ctx.beginPath();
    ctx.rect(panelX + 12, listTop, panelW - 24, viewportH);
    ctx.clip();
    const startIndex = Math.max(0, Math.floor(scroll / rowH) - 1);
    const endIndex = Math.min(entries.length, Math.ceil((scroll + viewportH) / rowH) + 1);
    const latestRound = entries[0]?.round || state.round || 0;
    for (let index = startIndex; index < endIndex; index += 1) {
      const entry = entries[index];
      const y = listTop + index * rowH - scroll;
      const prevEntry = entries[index - 1];
      if (index > 0 && entry.round != null && prevEntry?.round != null && entry.round < prevEntry.round) {
        const divH = 28;
        fillRoundRect(ctx, panelX + 24, y + 4, panelW - 48, divH, 6, "rgba(198,149,75,0.12)", "rgba(180,132,68,0.28)");
        text(ctx, "--- 历史对局 ---", panelX + panelW / 2, y + 4 + divH / 2, 11, "#a0885e", "center");
      }
      const isHistory = (entry.round ?? latestRound) < latestRound;
      const isRoundResult = entry.type === "roundResult";
      const isPass = entry.type === "pass";
      const isFactionPerk = entry.type === "factionPerk";
      const isBoardChange = entry.type === "boardChange";
      const row = { id: "battleLogHistoryPanel", x: panelX + 18, y: y + 4, w: panelW - 46, h: 40 };
      actions.push(row);
      if (isRoundResult) {
        fillRoundRect(ctx, row.x, row.y, row.w, row.h, 11, "#f7dca6", "#c98a2e");
      } else if (isPass) {
        fillRoundRect(ctx, row.x, row.y, row.w, row.h, 10, "#fbe7dd", "#d98c6a");
      } else if (isFactionPerk) {
        fillRoundRect(ctx, row.x, row.y, row.w, row.h, 10, "#e9f4de", "#6a9b55");
        fillRoundRect(ctx, row.x + 5, row.y + 6, 4, row.h - 12, 2, "#4f873c");
      } else if (isBoardChange) {
        fillRoundRect(ctx, row.x, row.y, row.w, row.h, 10, "#e7f0fa", "#5c83ad");
        fillRoundRect(ctx, row.x + 5, row.y + 6, 4, row.h - 12, 2, "#3f6f9f");
      } else {
        fillRoundRect(ctx, row.x, row.y, row.w, row.h, 10,
          isHistory ? "#f1eadf" : "#fff4cf",
          isHistory ? "#cbb88a" : "#d19330"
        );
        fillRoundRect(ctx, row.x + 5, row.y + 6, 4, row.h - 12, 2, isHistory ? "#b09970" : "#c46a2b");
      }
      const entryText = battlePlayEntryText(entry, state);
      const lineH = 13;
      const tagW = (isRoundResult || isPass || isFactionPerk || isBoardChange) ? 56 : 0;
      const wrapW = row.w - 50 - tagW;
      const textColor = isRoundResult ? "#7a4310" : isPass ? "#9a3b1d" : isFactionPerk ? "#2f5f2a" : isBoardChange ? "#2f5575" : (isHistory ? "#7d6a50" : "#3b2b18");
      const lineCount = wrappedTextLineCount(ctx, entryText, wrapW, 11, 2);
      const textY = row.y + row.h / 2 - (lineCount - 1) * lineH / 2;
      text(ctx, `${index + 1}.`, row.x + 18, row.y + row.h / 2, 10, isRoundResult ? "#b9711f" : isPass ? "#c2603c" : isFactionPerk ? "#4f873c" : isBoardChange ? "#3f6f9f" : (isHistory ? "#b09970" : "#8f3c1f"));
      wrapText(ctx, entryText, row.x + 40, textY, wrapW, lineH, 2, 11, textColor);
      if (isRoundResult) {
        text(ctx, "双方放弃", row.x + row.w - 10, row.y + row.h / 2 + 4, 10, "#9a5a17", "right");
      } else if (isPass) {
        text(ctx, "放弃", row.x + row.w - 10, row.y + row.h / 2 + 4, 10, "#b56a4a", "right");
      } else if (isFactionPerk) {
        text(ctx, "被动", row.x + row.w - 10, row.y + row.h / 2 + 4, 10, "#4f873c", "right");
      } else if (isBoardChange) {
        text(ctx, "变化", row.x + row.w - 10, row.y + row.h / 2 + 4, 10, "#3f6f9f", "right");
      }
    }
    ctx.restore();
    if (maxScroll > 0) {
      const trackX = panelX + panelW - 12;
      const trackY = listTop + 4;
      const trackH = Math.max(48, viewportH - 8);
      const thumbH = Math.max(28, trackH * viewportH / contentH);
      const thumbY = trackY + (trackH - thumbH) * (scroll / maxScroll);
      fillRoundRect(ctx, trackX, trackY, 4, trackH, 2, "rgba(119,92,52,0.18)");
      fillRoundRect(ctx, trackX - 1, thumbY, 6, thumbH, 3, "rgba(47,111,87,0.72)");
    }
  }
}

function drawOpponentPassNotice(ctx, view, actions, state, ui, notice) {
  const opponentName = playerIdentityLabel(state, notice.playerIndex, notice.playerName || "敌方");
  const auto = /手牌已打完/.test(notice.text || "");
  const panelW = view.width - 36;
  const panelX = 18;
  const cardW = 88;
  const cardH = 120;
  const padding = 12;
  const panelH = padding * 2 + cardH;
  const handY = view.height - view.safeBottom - HAND_BOTTOM_OFFSET;
  const panelY = Math.max(view.safeTop + 72, handY - panelH - 12);
  const cardX = panelX + padding;
  const cardY = panelY + padding;
  const textX = cardX + cardW + 10;
  const textAreaW = panelX + panelW - textX - padding;

  const actor = state.players[notice.playerIndex] || null;
  const leader = actor?.leader;
  const leaderName = leader ? (leader.name || "主将") : "主将";

  actions.push({ id: "dismissRecentPlay", seq: notice.seq, x: panelX, y: panelY, w: panelW, h: panelH });
  fillRoundRect(ctx, panelX, panelY, panelW, panelH, 16, "#fbe7dd", "#d98c6a");
  fillRoundRect(ctx, panelX, panelY, 5, panelH, 3, "#c2603c", "#c2603c");

  if (leader) {
    card(ctx, {
      id: "passLeaderCard",
      cardId: leader.id,
      x: cardX,
      y: cardY,
      w: cardW,
      h: cardH,
      name: leader.name,
      summary: leader.abilityText || leader.summary,
      category: "主将",
      faction: leader.faction || actor?.faction,
      row: leader.row,
      abilities: leader.abilities,
      abilityDisplayNames: leader.abilityDisplayNames,
      strength: "将",
      nameMax: 6
    });
  } else {
    fillRoundRect(ctx, cardX, cardY, cardW, cardH, 10, "#fff4cf", "#d98c6a");
    text(ctx, "将", cardX + cardW / 2, cardY + cardH / 2, 24, "#8f3c1f", "center");
  }

  text(ctx, `${opponentName}放弃`, textX, cardY + 12, 12, "#8f3c1f");
  text(ctx, short(leaderName, 9), textX, cardY + 36, 15, "#2f2417");
  const nextTip = state.roundTransition
    ? (state.roundTransition.matchOver ? "即将结算整局结果" : "稍后进入下一局")
    : "对方不再出牌，可继续出牌或点「结算」";
  const desc = auto ? `手牌已打完，${nextTip}` : nextTip;
  fillRoundRect(ctx, textX - 4, cardY + 58, Math.max(92, textAreaW), 42, 8, "rgba(255,252,235,0.90)", "#e8d4a0");
  wrapText(ctx, desc, textX + 2, cardY + 73, Math.max(80, textAreaW - 12), 15, 2, 10, "#5f3a1a");

  const close = { id: "dismissRecentPlay", seq: notice.seq, x: panelX + panelW - 34, y: panelY + 8, w: 24, h: 24 };
  actions.push(close);
  fillRoundRect(ctx, close.x, close.y, close.w, close.h, 12, "rgba(141,104,64,0.92)", "#6f4d29");
  text(ctx, "×", close.x + close.w / 2, close.y + close.h / 2 + 1, 14, "#fff7d8", "center");
}

function findLatestOpponentPass(state) {
  const local = localPlayerIndex(state);
  const history = state.playedHistory || [];
  for (const entry of history) {
    if (entry.type === "pass" && entry.round === state.round && entry.playerIndex != null && entry.playerIndex !== local) return entry;
  }
  return null;
}

function drawRoundLeaderAvatar(ctx, player, x, y, size, stroke) {
  fillRoundRect(ctx, x - 3, y - 3, size + 6, size + 6, 9, "#fff7df", stroke);
  if (player?.leader) {
    drawCardImage(ctx, {
      ...player.leader,
      imageFill: true,
      imageX: x,
      imageY: y,
      imageW: size,
      imageH: size
    });
  } else {
    fillRoundRect(ctx, x, y, size, size, 8, "#d8c8aa", stroke);
    text(ctx, "将", x + size / 2, y + size / 2, 11, "#fff7d8", "center");
  }
}

function drawRoundTransitionNotice(ctx, view, actions, state, ui) {
  const transition = state.roundTransition;
  if (!transition) return;
  const local = localPlayerIndex(state);
  const opponent = local === 0 ? 1 : 0;
  const localPlayer = state.players[local];
  const opponentPlayer = state.players[opponent];
  const scores = transition.scores || [0, 0];
  const localScore = scores[local] || 0;
  const opponentScore = scores[opponent] || 0;
  const moraleAfter = Array.isArray(transition.morale) ? transition.morale : moraleAfterRoundResults(state.roundResults);
  const moraleLoss = Array.isArray(transition.moraleLoss) ? transition.moraleLoss : [0, 0];
  const moraleBefore = Array.isArray(transition.moraleBefore)
    ? transition.moraleBefore
    : [Math.min(2, (moraleAfter[0] || 0) + (moraleLoss[0] || 0)), Math.min(2, (moraleAfter[1] || 0) + (moraleLoss[1] || 0))];
  const seconds = Math.max(1, Math.ceil((ui.roundTransitionNoticeMs || ui.recentPlayAutoDismissMs || 2000) / 1000));
  const resultType = transition.winner == null ? "draw" : (transition.winner === local ? "win" : "loss");
  const resultStyles = {
    win: { label: "胜利", color: "#2f6f57", fill: "#f0faf3", tagFill: "#2f6f57" },
    loss: { label: "失败", color: "#9f3b24", fill: "#fff0ea", tagFill: "#9f3b24" },
    draw: { label: "平局", color: "#6b6b5f", fill: "#f6f2ea", tagFill: "#6b6b5f" }
  };
  const style = resultStyles[resultType];
  const passEntry = findLatestOpponentPass(state);
  const actorIndex = Number.isInteger(passEntry?.playerIndex) ? passEntry.playerIndex : opponent;
  const actor = state.players[actorIndex] || opponentPlayer || state.players[1];
  const title = transition.winner == null
    ? "本局平局"
    : `${playerIdentityLabel(state, transition.winner)}获胜`;
  const actorName = playerIdentityLabel(state, actorIndex, actor?.name || "敌方");
  const nextLine = transition.matchOver
    ? `${seconds} 秒后结算整局结果`
    : `${seconds} 秒后进入第 ${transition.nextRound || (transition.round + 1)} 局`;
  const roundLine = (state.roundResults || []).length
    ? (state.roundResults || []).slice(0, 3).map(item => {
      const itemScores = item.scores || [];
      const tag = item.winner == null ? "平" : (item.winner === local ? "胜" : "负");
      return `${item.round}局${itemScores[local] || 0}:${itemScores[opponent] || 0}${tag}`;
    }).join(" · ")
    : `${transition.round}局${localScore}:${opponentScore}${resultType === "draw" ? "平" : (resultType === "win" ? "胜" : "负")}`;
  const moraleLine = `军心 ${moraleBefore[local] || 0}:${moraleBefore[opponent] || 0}→${moraleAfter[local] || 0}:${moraleAfter[opponent] || 0}`;
  const panelW = view.width - 36;
  const panelX = 18;
  const panelH = 90;
  const handY = view.height - view.safeBottom - HAND_BOTTOM_OFFSET;
  const panelY = Math.max(view.safeTop + 72, handY - panelH - 12);
  const avatarSize = panelH - 12;
  const avatarY = panelY + 6;
  const avatarX = 32;
  const tagW = 38;
  const tagH = 18;

  fillRoundRect(ctx, panelX, panelY, panelW, panelH, 13, style.fill, style.color);
  fillRoundRect(ctx, panelX + 6, panelY + 4, 5, panelH - 8, 3, style.color);
  drawRoundLeaderAvatar(ctx, localPlayer, avatarX, avatarY, avatarSize, style.color);
  const textX = avatarX + avatarSize + 10;
  const textW = view.width - textX - 92;

  fillRoundRect(ctx, textX, panelY + 8, tagW, tagH, 9, style.tagFill);
  text(ctx, style.label, textX + tagW / 2, panelY + 17, 10, "#fff7d8", "center");
  text(ctx, `${title} · 第 ${transition.round} 局结束`, textX + tagW + 8, panelY + 18, 13, style.color);
  wrapText(ctx, `我方 ${localPlayer?.factionName || localPlayer?.faction || "阵营"} · ${short(localPlayer?.leader?.name || localPlayer?.leader?.name || "主将", 8)}`, textX, panelY + 40, textW, 14, 1, 11, "#3b2b18");
  wrapText(ctx, `敌方 ${opponentPlayer?.factionName || opponentPlayer?.faction || "阵营"} · ${short(opponentPlayer?.leader?.name || opponentPlayer?.leader?.name || "主将", 8)} · ${actorName}放弃`, textX, panelY + 61, textW, 14, 1, 10, "#775c34");
  wrapText(ctx, `${roundLine} · ${moraleLine} · ${nextLine}`, textX, panelY + 80, textW, 13, 1, 10, "#6f5a3a");
  const moraleX = view.width - 58;
  text(ctx, "军心", moraleX + 8, panelY + 31, 10, "#8a6132", "center");
  drawMoraleTokens(ctx, moraleX, panelY + 48, moraleAfter[local] || 0, style.color, moraleLoss[local] || 0);
  drawMoraleTokens(ctx, moraleX, panelY + 69, moraleAfter[opponent] || 0, "#8f3c1f", moraleLoss[opponent] || 0);
}

function drawRecentOpponentPlay(ctx, view, actions, state, ui) {
  const notice = state.lastPlayed;
  const local = localPlayerIndex(state);
  // 卡牌/主将展示卡牌弹窗；对手放弃展示轻量弹窗。
  // 其它非卡牌动作不能走卡牌面板，避免没有卡名时回退成“未知卡牌”。
  if (!notice || notice.seq <= (ui.dismissedRecentPlaySeq || 0) || state.over || state.mulligan?.active) return;
  // 我方放弃后，对手的“放弃”也要明确弹窗提示，避免误以为对局静止没有推进。
  // 注意：对手放弃常常直接触发回合结算，lastPlayed 会被覆盖成 roundResult，
  // 因此这里改为从出牌历史取“最近一次对手放弃”来触发弹窗（出牌历史不会被覆盖）。
  const passEntry = findLatestOpponentPass(state);
  if ((notice.type === "pass" || notice.type === "roundResult") && passEntry && passEntry.seq > (ui.dismissedRecentPlaySeq || 0)) {
    drawOpponentPassNotice(ctx, view, actions, state, ui, passEntry);
    return;
  }
  // 白名单：只展示对方真正的出牌 / 主将技能动作，我方打出的卡牌不再放大提示。
  const isCardPlay = notice.actionType === "card" || notice.actionType === "leader";
  if (!isCardPlay || notice.playerIndex === local || !notice.cardId) return;
  const detailForName = cardById(notice.cardId);
  // 兜底：拿不到卡名的动作一律不弹（避免出现“未知卡牌”）
  if (!(notice.name || detailForName?.name)) return;

  const detail = notice.cardId ? cardById(notice.cardId) : null;
  const isLeaderAction = notice.actionType === "leader";
  const panelW = view.width - 36;
  const panelX = 18;

  const displayText = battlePlayEntryText(notice, state);

  // 布局：左侧大卡牌 + 右侧统一出牌摘要
  const cardW = 88;
  const cardH = 120;
  const padding = 12;
  const textAreaW = panelW - cardW - padding * 2 - 10;

  ctx.font = `12px "PingFang SC", "Hiragino Sans GB", sans-serif`;
  const displayLineCount = wrappedTextLineCount(ctx, displayText, textAreaW - 12, 12, 3);
  const effectAreaH = displayLineCount * 16 + 16;
  const panelH = padding * 2 + Math.max(cardH, effectAreaH);

  const handY = view.height - view.safeBottom - HAND_BOTTOM_OFFSET;
  const panelY = Math.max(view.safeTop + 72, handY - panelH - 12);
  
  const cardX = panelX + padding;
  const cardY = panelY + padding;

  fillRoundRect(ctx, panelX, panelY, panelW, panelH, 16, "#fff4cf", "#d19330");
  fillRoundRect(ctx, panelX, panelY, 5, panelH, 3, "#c46a2b", "#c46a2b");

  // 左侧卡牌（更大尺寸）
  const preview = {
    id: "recentPlayedCard",
    cardId: notice.cardId,
    x: cardX,
    y: cardY,
    w: cardW,
    h: cardH,
    name: notice.name || detail?.name,
    name: notice.name || detail?.name,
    summary: notice.summary || detail?.summary,
    category: notice.category || (detail ? categoryLabel(detail) : (isLeaderAction ? "主将" : "卡牌")),
    faction: notice.faction || detail?.faction,
    row: notice.cardRow || detail?.row,
    abilities: notice.abilities || detail?.abilities,
    abilityDisplayNames: notice.abilityDisplayNames || detail?.abilityDisplayNames,
    strength: notice.strength == null ? (isLeaderAction ? "将" : (detail?.category === "situation" || detail?.category === "stratagem" ? "策" : detail?.strength)) : notice.strength,
    nameMax: 6
  };
  actions.push({ id: "battleCardDetail", cardId: notice.cardId, cardUid: notice.cardUid, x: cardX, y: cardY, w: cardW, h: cardH });
  card(ctx, preview);

  // 右侧信息区 — 与卡片顶部对齐
  const textX = cardX + cardW + 10;
  const infoStartY = cardY;

  const abw = Math.min(textAreaW + 8, panelX + panelW - textX - 4);
  const abh = Math.min(effectAreaH, panelY + panelH - infoStartY - padding);
  fillRoundRect(ctx, textX - 4, infoStartY, abw, abh, 9, "rgba(255,252,235,0.94)", "#d19330");
  fillRoundRect(ctx, textX - 1, infoStartY + 5, 4, Math.max(10, abh - 10), 2, "#c46a2b");
  wrapText(ctx, displayText, textX + 8, infoStartY + 14, abw - 16, 16, 3, 12, "#3b2b18");

  // 关闭按钮
  const close = { id: "dismissRecentPlay", seq: notice.seq, x: panelX + panelW - 34, y: panelY + 8, w: 24, h: 24 };
  actions.push(close);
  fillRoundRect(ctx, close.x, close.y, close.w, close.h, 12, "rgba(141,104,64,0.92)", "#6f4d29");
  text(ctx, "×", close.x + close.w / 2, close.y + close.h / 2 + 1, 14, "#fff7d8", "center");
}

function leaderRevealKey(state, reveal) {
  return `${state.matchId || "local"}:${reveal?.seq || 0}`;
}

function drawLeaderRevealPanel(ctx, view, actions, state, ui) {
  const local = localPlayerIndex(state);
  const reveal = state.leaderReveals?.[local];
  const key = leaderRevealKey(state, reveal);
  if (!reveal || ui.dismissedLeaderRevealKey === key) return;

  const cards = Array.isArray(reveal.cards) ? reveal.cards : [];
  const panelX = 16;
  const panelW = view.width - 32;
  const gap = 10;
  const cardW = Math.min(96, Math.max(68, Math.floor((panelW - 36 - gap * 2) / 3)));
  const cardH = Math.round(cardW * 1.36);
  const panelH = cards.length ? cardH + 94 : 174;
  const panelY = Math.max(view.safeTop + 66, Math.min(view.height - view.safeBottom - panelH - 56, (view.height - panelH) / 2));

  actions.push({ id: "dismissLeaderReveal", revealKey: key, x: 0, y: 0, w: view.width, h: view.height });
  ctx.save();
  ctx.fillStyle = "rgba(38, 28, 18, 0.58)";
  ctx.fillRect(0, 0, view.width, view.height);
  ctx.restore();

  actions.push({ id: "leaderRevealPanel", x: panelX, y: panelY, w: panelW, h: panelH });
  fillRoundRect(ctx, panelX, panelY, panelW, panelH, 18, "#fffaf0", "#d19330");
  fillRoundRect(ctx, panelX, panelY, 5, panelH, 3, "#c46a2b", "#c46a2b");
  text(ctx, "张仪 · 侦察结果", panelX + 18, panelY + 25, 18, "#2f2417");
  text(ctx, cards.length ? `随机查看敌方 ${cards.length} 张手牌 · 仅你可见` : "敌方当前没有手牌 · 仅你可见", panelX + 18, panelY + 49, 11, "#775c34");

  const close = { id: "dismissLeaderReveal", revealKey: key, x: panelX + panelW - 42, y: panelY + 10, w: 28, h: 28 };
  actions.push(close);
  fillRoundRect(ctx, close.x, close.y, close.w, close.h, 14, "rgba(141,104,64,0.92)", "#6f4d29");
  text(ctx, "×", close.x + close.w / 2, close.y + close.h / 2 + 1, 15, "#fff7d8", "center");

  if (!cards.length) {
    text(ctx, "无可侦察手牌", panelX + panelW / 2, panelY + 112, 15, "#8f3c1f", "center");
    return;
  }

  const cardsW = cards.length * cardW + Math.max(0, cards.length - 1) * gap;
  const startX = panelX + (panelW - cardsW) / 2;
  const cardY = panelY + 66;
  cards.forEach((item, index) => {
    const x = startX + index * (cardW + gap);
    const detail = { id: "battleCardDetail", cardId: item.id, cardUid: item.uid, x, y: cardY, w: cardW, h: cardH };
    actions.push(detail);
    card(ctx, {
      ...detail,
      name: item.name || "未知卡牌",
      summary: item.summary || item.abilityText,
      category: categoryLabel(item),
      faction: item.faction,
      row: item.row,
      abilities: item.abilities,
      abilityDisplayNames: item.abilityDisplayNames,
      strength: item.category === "situation" || item.category === "stratagem" ? "策" : item.strength,
      nameMax: 6
    });
  });
}

function drawCardGuide(ctx, view, actions) {
  const handY = view.height - view.safeBottom - HAND_BOTTOM_OFFSET;
  const panelW = view.width - 48;
  const panelH = 168;
  const panelX = 24;
  const panelY = Math.max(view.safeTop + 84, handY - panelH - 36);
  actions.push({ id: "closeCardGuide", x: 0, y: 0, w: view.width, h: view.height });
  ctx.fillStyle = "rgba(38, 28, 18, 0.48)";
  ctx.fillRect(0, 0, view.width, view.height);
  fillRoundRect(ctx, 8, handY - 6, view.width - 16, 92, 12, "rgba(255, 247, 216, 0.18)", "#ffd76a");
  fillRoundRect(ctx, panelX, panelY, panelW, panelH, 18, "#fffaf0", "#ffd76a");
  text(ctx, "卡牌使用指引", panelX + 18, panelY + 24, 18, "#2f2417");
  const guide = "点击手牌即可打出，长按手牌、场上卡牌或弃牌堆卡牌查看详情；点击当前方主将头像使用技能，长按双方头像可查看主将技能。";
  wrapText(ctx, guide, panelX + 18, panelY + 58, panelW - 36, 20, 4, 12, "#5f4727");
  text(ctx, "点任意位置关闭，之后不再提示", panelX + 18, panelY + 130, 11, "#8f3c1f");
  const close = { id: "closeCardGuide", x: panelX + panelW - 106, y: panelY + panelH - 44, w: 84, h: 30 };
  actions.push(close);
  button(ctx, { ...close, label: "知道了", size: 12, fill: "#2f6f57" });
}

function guideStrokeRoundRect(ctx, x, y, w, h, r) {
  const radius = Math.max(0, Math.min(r || 0, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
  ctx.stroke();
}

// 分步指引气泡 + 指向目标的脉冲高亮环。仅作视觉引导，不拦截目标自身的点击/长按。
function drawGuidePointer(ctx, view, actions, target, title, lines, options = {}) {
  const cx = target.x + target.w / 2;
  const cy = target.y + target.h / 2;
  const bubbleW = Math.min(view.width - 48, 280);
  const bubbleH = 96;
  const bubbleX = (view.width - bubbleW) / 2;
  const bubbleY = Math.max(view.safeTop + 64, Math.round(view.height / 2 - bubbleH / 2));
  const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 320);
  const rgb = options.rgb || "47,111,87";
  const fill = options.fill || "#2f6f57";
  const stroke = options.stroke || "#1f4d3a";
  const textColor = options.textColor || "#eaf6ee";
  ctx.save();
  ctx.strokeStyle = `rgba(${rgb},${0.55 + 0.4 * pulse})`;
  ctx.lineWidth = 3;
  const pad = 6 + 5 * pulse;
  guideStrokeRoundRect(ctx, target.x - pad, target.y - pad, target.w + pad * 2, target.h + pad * 2, 12);
  ctx.restore();
  fillRoundRect(ctx, bubbleX, bubbleY, bubbleW, bubbleH, 14, fill, stroke);
  text(ctx, title, bubbleX + bubbleW / 2, bubbleY + 26, 15, "#fff7d8", "center");
  lines.forEach((ln, i) => text(ctx, ln, bubbleX + bubbleW / 2, bubbleY + 52 + i * 20, 12, textColor, "center"));
  ctx.save();
  ctx.strokeStyle = `rgba(${rgb},0.85)`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(bubbleX + bubbleW / 2, bubbleY + bubbleH);
  ctx.lineTo(cx, cy);
  ctx.stroke();
  ctx.restore();
  const dismiss = { id: options.dismissId || "dismissGuide", x: bubbleX + bubbleW - 66, y: bubbleY + 8, w: 54, h: 24 };
  actions.push(dismiss);
  button(ctx, { ...dismiss, label: "稍后", size: 11, fill: options.dismissFill || "#3f7d61" });
}

function drawPassLeadHint(ctx, view, actions, state, ui) {
  if (!ui.passLeadHintActive || !ui.__passButton) return;
  if (ui.showCardGuide || state.roundTransition || state.over || state.pending) return;
  if (ui.battleCardDetailId || ui.battleCardDetailUid || ui.battleLogHistoryOpen || ui.discardPileOwner != null) return;
  drawGuidePointer(ctx, view, actions, ui.__passButton, "优势已稳", ["对方已放弃，且我方分数领先", "建议点「结算」保留手牌"], {
    dismissId: "dismissPassLeadHint",
    fill: "#8f3c1f",
    stroke: "#6d2d18",
    rgb: "143,60,31",
    textColor: "#fff4cf",
    dismissFill: "#a9552b"
  });
}

function drawFirstPlayerNotice(ctx, view, actions, state, ui) {
  if (ui.firstPlayerAnnounced) return;
  if (state.round !== 1 || state.over || state.roundTransition) return;
  if (state.mulligan && state.mulligan.active) return;
  if (state.pending) return;
  if (ui.battleCardDetailId || ui.battleCardDetailUid) return;
  const local = localPlayerIndex(state);
  if (!Number.isInteger(ui.firstPlayerIndex)) ui.firstPlayerIndex = state.current || 0;
  const firstIndex = ui.firstPlayerIndex;
  const isLocal = firstIndex === local;
  const firstPlayer = state.players[firstIndex] || state.players[0];
  const firstLabel = state.mode === "online"
    ? playerIdentityLabel(state, firstIndex, firstPlayer.name)
    : firstPlayer.name;
  const title = isLocal ? "本小局由你先出牌" : `本小局由「${firstLabel}」先出牌`;
  const sub = isLocal ? "先手优势，放手一搏！" : "对方先手，做好准备应对。";

  // 全屏可点区域，点击任意位置关闭弹窗
  actions.push({ id: "dismissFirstPlayer", x: 0, y: 0, w: view.width, h: view.height });
  ctx.save();
  ctx.fillStyle = "rgba(18,12,6,0.5)";
  ctx.fillRect(0, 0, view.width, view.height);
  ctx.restore();

  const panelW = Math.min(view.width - 56, 300);
  const panelH = 158;
  const panelX = (view.width - panelW) / 2;
  const panelY = (view.height - panelH) / 2;
  fillRoundRect(ctx, panelX, panelY, panelW, panelH, 18, "#fff6dc", "#d19330");
  text(ctx, "先手提示", panelX + panelW / 2, panelY + 30, 14, "#8f3c1f", "center");
  text(ctx, title, panelX + panelW / 2, panelY + 70, 17, "#2f2417", "center");
  text(ctx, sub, panelX + panelW / 2, panelY + 98, 11, "#775c34", "center");
  const btnW = panelW - 48;
  const btn = { id: "dismissFirstPlayer", x: panelX + 24, y: panelY + panelH - 54, w: btnW, h: 40 };
  actions.push(btn);
  button(ctx, { ...btn, label: "知道了", size: 14, fill: "#2f6f57" });
}

function drawStepGuide(ctx, view, actions, state, ui) {
  const step = ui.activeGuide;
  if (!step || ui.guideDismissed || ui.showCardGuide || ui.passLeadHintActive) return;
  // 二次校验：从存档重新读取当前指引的 done/count 状态，防止因存储异常、缓存不一致等导致超限指引仍被渲染
  const save = loadSave();
  const g = save.guides && save.guides[step];
  if (!g || g.done || (Number.isFinite(g.count) && g.count > 3)) {
    ui.activeGuide = "";
    return;
  }
  const isMulligan = state.mulligan && state.mulligan.active;
  if (state.roundTransition || isMulligan || state.over) return;
  if (ui.battleCardDetailId || ui.battleCardDetailUid) return;
  if (ui.battleLogHistoryOpen) return;
  const local = localPlayerIndex(state);
  const currentIsLocal = state.mode === "online" ? state.current === local : state.current === 0;
  if (!currentIsLocal) return;
  let target = null;
  let title = "";
  let lines = [];
  if (step === "cardDetail") {
    target = ui.__guideHandCard;
    title = "看卡牌详情";
    lines = ["长按手牌", "查看卡牌效果与说明"];
  } else if (step === "leaderSkill") {
    target = ui.__guideLeader;
    const g = loadSave().guides.leaderSkill;
    if (g && g.longPressed && !g.done) {
      title = "使用主将技能";
      lines = ["已查看主将技能", "点击主将头像使用技能"];
    } else {
      title = "看主将技能";
      lines = ["长按主将头像查看技能", "点击主将头像使用技能"];
    }
  } else if (step === "battleRecord") {
    target = ui.__guideLog;
    title = "看对战记录";
    lines = ["点击这里", "查看本局对战记录"];
  } else if (step === "fieldCardDetail") {
    target = ui.__guideFieldCard;
    title = "看场上卡牌";
    lines = ["长按场上的卡牌", "查看它的效果与说明"];
  }
  if (!target) return;
  drawGuidePointer(ctx, view, actions, target, title, lines);
}

function draw(ctx, view, actions, state, ui = {}) {
  clear(ctx, view.width, view.height);
  ensurePendingDetail(state, ui);
  let detail = null;
  let detailContext = null;
  if (ui.battleCardDetailId || ui.battleCardDetailUid) {
    // 朱温候选来自牌库；优先使用包含真实 uid 的待选实例，避免静态卡牌数据导致点击无法提交选择。
    const pendingCard = visiblePendingDetailCards(state)
      .find(card => battleCardMatch(card, ui.battleCardDetailId, ui.battleCardDetailUid));
    if (pendingCard) {
      detail = pendingCard;
      detailContext = { card: pendingCard, playerIndex: (state.pending && state.pending.playerIndex) || 0, row: null, zone: "pending" };
    } else {
      detailContext = findBattleCardContext(state, ui.battleCardDetailId, ui.battleCardDetailUid);
      detail = detailContext?.card || cardById(ui.battleCardDetailId);
      if (!detail) {
        ui.battleCardDetailId = "";
        ui.battleCardDetailUid = "";
      }
    }
  }
  const headerY = view.safeTop + 16;
  const isMulligan = state.mulligan && state.mulligan.active;
  const situationNames = ROWS.filter(row => state.situations[row]).map(row => ROW_LABELS[row]);
  const local = localPlayerIndex(state);
  const actionOwner = actionOwnerIndex(state);
  const actionPlayerIndex = state.players[actionOwner] ? actionOwner : (state.current || 0);
  const actionPlayer = state.players[actionPlayerIndex] || state.players[0];
  const actionPlayerName = state.mode === "online"
    ? playerIdentityLabel(state, actionPlayerIndex, actionPlayer.name)
    : actionPlayer.name;
  const roundText = `第 ${state.round} 回合`;
  const mulliganUsed = isMulligan ? (state.mulligan.used[actionPlayerIndex] || 0) : 0;
  const waitingForEnemyMulligan = isMulligan && state.mode === "online" && state.mulligan.simultaneous && state.mulligan.done?.[local];
  const statusText = isMulligan
    ? (waitingForEnemyMulligan ? "我方已准备 · 等待敌方换牌" : `${actionPlayerName} 换牌 ${mulliganUsed}/${state.mulligan.max}`)
    : (state.over ? "对局结束" : (state.roundTransition ? "回合结算中" : `当前：${actionPlayerName}`));
  text(ctx, roundText, view.width / 2, headerY, 17, "#2f2417", "center");
  text(ctx, statusText, view.width / 2, headerY + 22, 12, "#775c34", "center");
  if (situationNames.length) {
    text(ctx, `时局：${situationNames.join("、")}`, view.width / 2, headerY + 40, 10, "#8a785f", "center");
  }
  const handY = view.height - view.safeBottom - HAND_BOTTOM_OFFSET;
  const logLineH = 14;
  const logTextW = view.width - 48;
  const latestActionText = !state.pending && state.lastPlayed ? battlePlayEntryText(state.lastPlayed, state) : "";
  const logEntries = latestActionText ? [latestActionText] : (state.logs && state.logs.length ? state.logs : ["暂无行动记录"]);
  ctx.font = `10px ${FIELD_FONT}`;
  const latestFitsOneLine = !/\n/.test(logEntries[0]) && ctx.measureText(logEntries[0]).width <= logTextW;
  const compactLog = latestFitsOneLine && logEntries.length <= 1;
  const logH = compactLog ? 28 : 34;
  const logY = handY - logH - HAND_LOG_GAP;
  drawRows(ctx, view, actions, state, ui, situationNames.length ? 90 : 78, logY - 10);
  const logAction = { id: "battleLog", x: 12, y: logY, w: view.width - 24, h: logH };
  actions.push(logAction);
  ui.__guideLog = logAction;
  fillRoundRect(ctx, logAction.x, logAction.y, logAction.w, logAction.h, 10, "#fff4cf", "#d19330");
  fillRoundRect(ctx, logAction.x + 6, logAction.y + 5, 4, logAction.h - 10, 2, "#c46a2b");
  ctx.save();
  ctx.beginPath();
  ctx.rect(logAction.x + 18, logAction.y + 4, logAction.w - 28, logAction.h - 8);
  ctx.clip();
  if (compactLog) {
    text(ctx, logEntries[0], logAction.x + 20, logY + logH / 2, 10, "#5f3a1a");
  } else {
    const previewText = latestFitsOneLine ? logEntries.slice(0, 2).join("\n") : logEntries[0];
    wrapText(ctx, previewText, logAction.x + 20, logY + 11, logTextW - 8, logLineH, 2, 10, "#5f3a1a");
  }
  ctx.restore();
  drawPendingChoice(ctx, view, actions, state);
  drawHand(ctx, view, actions, state, ui);
  const bottom = view.height - view.safeBottom - ACTION_BUTTON_BOTTOM_OFFSET;
  ui.__passButton = null;
  let rightButton;
  if (state.over) rightButton = ["home", "首页", "#6b6b5f"];
  else if (isMulligan) rightButton = isLocalOnlineAction(state) ? ["mulliganDone", state.mode === "online" ? "准备" : "不换开始", "#2f6f57"] : ["noop", "等待", "#b6a98e"];
  else rightButton = ["surrenderMatch", "认输", "#6b6b5f"];
  const opponentIndex = local === 0 ? 1 : 0;
  const localCanAct = !state.over && !state.roundTransition && !state.pending && !isMulligan && (state.mode === "online" ? isLocalOnlineAction(state) : state.current === local);
  const passLabel = localCanAct && state.players[opponentIndex]?.passed ? "结算" : "放弃";
  const buttons = [
    ["pass", passLabel, "#8d6840"],
    rightButton
  ];
  const gap = 12;
  const bw = (view.width - 20 - gap * (buttons.length - 1)) / buttons.length;
  buttons.forEach((item, index) => {
    const rect = { id: item[0], x: 10 + index * (bw + gap), y: bottom, w: bw, h: ACTION_BUTTON_H };
    actions.push(rect);
    if (item[0] === "pass") ui.__passButton = rect;
    button(ctx, { ...rect, label: item[1], size: 12, fill: item[2] });
  });
  if (!state.roundTransition) drawRecentOpponentPlay(ctx, view, actions, state, ui);
  drawDiscardPilePanel(ctx, view, actions, state, ui);
  drawBattleLogHistoryPanel(ctx, view, actions, state, ui);
  if (ui.showCardGuide && !state.roundTransition && !isMulligan && !state.over && (state.mode === "online" ? state.current === local : state.current === 0)) {
    drawCardGuide(ctx, view, actions);
  }
  drawStepGuide(ctx, view, actions, state, ui);
  drawPassLeadHint(ctx, view, actions, state, ui);
  drawLeaderRevealPanel(ctx, view, actions, state, ui);
  if (detail) {
    const entries = detailCardEntries(state, ui, view);
    const currentIdx = entries.findIndex(entry => battleCardMatch(entry.card, ui.battleCardDetailId, ui.battleCardDetailUid));
    const leftCard = currentIdx > 0 ? entries[currentIdx - 1].card : null;
    const rightCard = currentIdx >= 0 && currentIdx < entries.length - 1 ? entries[currentIdx + 1].card : null;
    const swipeOffset = ui.detailSwipe ? ui.detailSwipe.offset || 0 : 0;
    const helpSections = mulliganDetailSections(state, detailContext);
    const pendingType = pendingDetailType(state, ui);
    const pendingRevive = pendingType === "revive";
    const pendingLeaderDiscard = pendingType === "leaderDiscard";
    const pendingRecall = pendingType === "recall";
    const pendingLeaderSituation = pendingType === "leaderSituation";
    const selectedUids = new Set(state.pending?.selectedUids || []);
    const currentSelected = pendingLeaderDiscard && selectedUids.has(detail.uid);
    const detailCard = pendingRevive ? { ...detail, effective: detail.strength } : detail;
    const pendingSections = pendingRevive ? [{
      title: "济世选择",
      content: "点击当前卡牌复归到战场；左右滑动切换其它可复归卡牌；点击空白处跳过本次济世。",
      color: "#8f3c1f",
      lines: 3
    }] : (pendingLeaderDiscard ? [{
      title: "黄巢弃牌",
      content: currentSelected
        ? "此牌已选，再点当前卡牌可取消选择；左右滑动切换其它手牌。"
        : (selectedUids.size === 1
          ? "点击当前卡牌后将二次确认是否弃置这两张牌；左右滑动可换牌。"
          : "点击当前卡牌选择第 1 张弃牌；左右滑动切换手牌；点击空白处取消。"),
      color: "#8f3c1f",
      lines: 3
    }] : []);
    const extraSections = (pendingRevive || pendingLeaderDiscard || pendingLeaderSituation ? [] : battlePowerEffectSections(state, detailContext, detail)).concat(pendingSections);
    drawDetail(ctx, view, actions, detailCard, {
      title: pendingRevive ? "济世复归" : (pendingLeaderDiscard ? `黄巢弃牌 ${selectedUids.size}/2` : (isMulligan ? "换牌阶段" : "卡牌详情")),
      closeHint: pendingRevive
        ? "点击当前卡牌复归 · 左右滑动切换"
        : (pendingLeaderDiscard
          ? "点卡牌选择/取消 · 选满后确认"
          : (pendingLeaderSituation
            ? "点击当前卡牌打出 · 左右滑动切换"
            : (isMulligan ? "点击当前卡牌换掉 · 空白处返回" : "点击空白处返回对局"))),
      leftCard,
      rightCard,
      swipeOffset,
      extraSections,
      count: pendingRecall ? (detail.stackCount || 1) : discardStackCount(state, detailContext, detail),
      headerAction: pendingLeaderDiscard || pendingLeaderSituation ? { id: "closeDetail", label: "取消" } : null,
      helpAction: isMulligan ? { id: "mulliganHelp" } : null,
      helpOpen: !!ui.mulliganHelpOpen,
      helpSections,
      selected: currentSelected,
      anim: ui.mulliganSwapAnim ? { alpha: ui.mulliganSwapAnim.alpha, scale: ui.mulliganSwapAnim.scale } : null,
      cardAction: pendingRevive || pendingLeaderDiscard || pendingRecall || pendingLeaderSituation
        ? { id: "targetChoice", cardId: detail.id, cardUid: detail.uid }
        : (isMulligan && detailContext?.zone === "hand" && isLocalOnlineAction(state)
          ? { id: "mulliganDetailSwap", cardId: detail.id, cardUid: detail.uid }
          : null)
    });
  }
  if (state.roundTransition) drawRoundTransitionNotice(ctx, view, actions, state, ui);
  drawFirstPlayerNotice(ctx, view, actions, state, ui);
}

module.exports = {
  draw,
  detailCardEntries,
  sortedHandCards,
  handScrollBounds,
  discardPileMetrics
};