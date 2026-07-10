const { clear, text, button, fillRoundRect, card, wrapText, drawCardImage, short } = require("../ui/canvas");
const { ROWS, ROW_LABELS, categoryLabel, cardById, cardValue, hasAbility } = require("../core/cards");
const { totalScore, rowScore, handOwnerIndex } = require("../core/battle");
const { drawDetail } = require("./cardsBrowser");

function drawLeaderHeader(ctx, view, actions, state, player, playerIndex, centerY) {
  const leader = player.leader;
  const active = state.current === playerIndex && !state.over && !(state.mulligan && state.mulligan.active);
  const avatar = 34;
  const x = 14;
  const y = centerY - avatar / 2;
  const panelW = 174;
  fillRoundRect(ctx, x - 4, y - 3, panelW, avatar + 6, 12, active ? "#fff8e5" : "#f2ead8", active ? "#2f6f57" : "#d3b982");
  if (leader) {
    const action = { id: "leaderAvatar", playerIndex, cardId: leader.id, x, y, w: avatar, h: avatar };
    actions.push(action);
    drawCardImage(ctx, { ...leader, imageFill: true, imageX: x, imageY: y, imageW: avatar, imageH: avatar });
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
  text(ctx, `${player.name} · ${short(player.factionName, 5)}`, x + avatar + 8, centerY - 7, 11, "#3b2b18");
  const handInfo = `手牌 ${player.hand.length} 张${player.passed ? " · 已放弃" : ""}`;
  text(ctx, `${leader ? short(leader.name || leader.baseName, 5) : "未配置主将"} · ${handInfo}`, x + avatar + 8, centerY + 9, 10, player.leaderUsed ? "#9a8a73" : "#775c34");
  text(ctx, `${totalScore(player)} 分`, view.width - 18, centerY, 13, "#8f3c1f", "right");
}

function drawRows(ctx, view, actions, state, topOffset) {
  const top = view.safeTop + (topOffset || 78);
  const rowH = Math.max(38, Math.min(47, Math.floor((view.height - view.safeTop - view.safeBottom - 318) / 6)));
  const gap = 6;
  state.players.forEach((player, playerIndex) => {
    const baseY = playerIndex === 1 ? top : top + (rowH + gap) * 3 + 34;
    drawLeaderHeader(ctx, view, actions, state, player, playerIndex, baseY - 18);
    const rowOrder = playerIndex === 1 ? ROWS.slice().reverse() : ROWS;
    rowOrder.forEach((row, index) => {
      const y = baseY + index * (rowH + gap);
      const suppressed = !!state.weather[row];
      const horn = state.rowHorn[playerIndex][row] ? " 号令" : "";
      fillRoundRect(ctx, 12, y, view.width - 24, rowH, 9, suppressed ? "#ecd6b4" : (playerIndex === 1 ? "#efe6d2" : "#fffaf0"), suppressed ? "#c0392b" : "#d3b982");
      if (suppressed) fillRoundRect(ctx, 12, y, 4, rowH, 2, "#c0392b");
      text(ctx, `${ROW_LABELS[row]}${horn}`, 22, y + rowH / 2 - (suppressed ? 6 : 0), 11, suppressed ? "#a8321f" : "#775c34");
      if (suppressed) {
        fillRoundRect(ctx, 22, y + rowH / 2 + 2, 44, 13, 6, "#c0392b");
        text(ctx, "战力压1", 44, y + rowH / 2 + 8.5, 8, "#fff7d8", "center");
      }
      text(ctx, `${rowScore(player, row)}`, view.width - 24, y + rowH / 2, 13, "#8f3c1f", "right");
      const cards = player.board[row].slice(-5);
      cards.forEach((item, cardIndex) => {
        const x = 86 + cardIndex * 43;
        if (x + 34 > view.width - 48) return;
        const detail = { id: "battleCardDetail", cardId: item.id, x, y: y + 5, w: 36, h: rowH - 10 };
        actions.push(detail);
        const power = item.effective == null ? item.strength : item.effective;
        const reduced = suppressed && !item.hero && item.effective != null && item.effective < (item.strength || 0);
        fillRoundRect(ctx, x, y + 5, 36, rowH - 10, 7, item.hero ? "#f5dfac" : (reduced ? "#f4d3c8" : "#f9edcf"), reduced ? "#c0392b" : "#c6954b");
        text(ctx, item.name.slice(0, 2), x + 18, y + rowH / 2 - 5, 10, "#3b2b18", "center");
        text(ctx, reduced ? `↓${power}` : String(power), x + 18, y + rowH / 2 + 9, 11, reduced ? "#c0392b" : "#8f3c1f", "center");
        fillRoundRect(ctx, x + 23, y + 7, 11, 11, 5, "rgba(47,111,87,0.88)");
        text(ctx, "详", x + 28.5, y + 12.5, 7, "#fff7d8", "center");
      });
    });
  });
}

const HAND_CARD_H = 96;

function handSortGroup(card) {
  if (card.hero || card.category === "hero") return 0;
  if (hasAbility(card, "Spy")) return 1;
  if (card.category === "special" || card.category === "weather") return 2;
  if (hasAbility(card, "Medic")) return 3;
  if (hasAbility(card, "Commander's Horn")) return 4;
  if (hasAbility(card, "Scorch")) return 5;
  if (hasAbility(card, "Muster")) return 6;
  if (hasAbility(card, "Tight Bond")) return 7;
  if (hasAbility(card, "Morale Boost")) return 8;
  if ((card.row || []).includes("melee")) return 9;
  if ((card.row || []).includes("ranged")) return 10;
  if ((card.row || []).includes("siege")) return 11;
  return 12;
}

function sortedHandCards(hand) {
  return hand.map((item, index) => ({ item, index })).sort((a, b) => {
    const groupDiff = handSortGroup(a.item) - handSortGroup(b.item);
    if (groupDiff) return groupDiff;
    if ((a.item.category || "") !== (b.item.category || "")) return String(a.item.category || "").localeCompare(String(b.item.category || ""));
    const valueDiff = cardValue(b.item) - cardValue(a.item);
    if (valueDiff) return valueDiff;
    const nameDiff = String(a.item.name || a.item.baseName || "").localeCompare(String(b.item.name || b.item.baseName || ""), "zh-Hans");
    return nameDiff || a.index - b.index;
  }).map(entry => entry.item);
}

function drawHand(ctx, view, actions, state, ui) {
  const ownerIndex = handOwnerIndex(state);
  const player = state.players[ownerIndex] || state.players[0];
  const waiting = (state.mode === "ai" && state.current !== 0 || state.mode === "online" && state.localPlayerIndex !== state.current) && !state.over && !(state.mulligan && state.mulligan.active);
  const pageSize = 5;
  const sortedHand = sortedHandCards(player.hand);
  const page = Math.max(0, Math.min(ui.handPage || 0, Math.max(0, Math.ceil(sortedHand.length / pageSize) - 1)));
  const shown = sortedHand.slice(page * pageSize, page * pageSize + pageSize + 1);
  const gap = 6;
  const cardW = Math.floor((view.width - 20 - gap * 5) / 5.5);
  const cardH = HAND_CARD_H;
  const transition = ui.pageTransition?.scene === "battleHand" ? ui.pageTransition.offset || 0 : 0;
  const startX = 10 + transition;
  const startY = view.height - view.safeBottom - 184;
  const totalPages = Math.max(1, Math.ceil(player.hand.length / pageSize));
  const title = waiting
    ? `${state.players[state.current].name}行动中 · ${player.name} 手牌 ${player.hand.length} 张`
    : `${player.name} 手牌 ${player.hand.length} 张 · ${page + 1}/${totalPages}`;
  text(ctx, title, 16, startY - 16, 11, "#775c34");
  shown.forEach((item, index) => {
    const spec = {
      id: "card",
      cardUid: item.uid,
      cardId: item.id,
      x: startX + index * (cardW + gap),
      y: startY,
      w: cardW,
      h: cardH,
      name: item.name,
      baseName: item.baseName,
      imageUrl: item.imageUrl,
      summary: item.summary,
      category: categoryLabel(item),
      faction: item.faction,
      row: item.row,
      abilities: item.abilities,
      abilityDisplayNames: item.abilityDisplayNames,
      hero: item.hero,
      strength: item.category === "weather" || item.category === "special" ? "策" : item.strength,
      nameMax: 4
    };
    actions.push(spec);
    card(ctx, spec);
  });
}

function drawPendingChoice(ctx, view, actions, state) {
  const pending = state.pending;
  if (!pending) return;
  const panelY = view.height - view.safeBottom - 286;
  fillRoundRect(ctx, 12, panelY, view.width - 24, 64, 12, "#fff6dc", "#d19330");
  text(ctx, pending.title || "请选择目标", 24, panelY + 15, 12, "#8f3c1f");
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
  const candidates = (pending.candidates || []).slice(0, 3);
  const w = Math.floor((view.width - 94) / 3);
  candidates.forEach((entry, index) => {
    const item = entry.card || entry;
    const rect = { id: "targetChoice", cardUid: item.uid, x: 18 + index * (w + 6), y: panelY + 28, w, h: 28 };
    actions.push(rect);
    button(ctx, { ...rect, label: `${item.name.slice(0, 4)} ${item.effective == null ? item.strength || "" : item.effective}`, size: 10, fill: "#7a5a95" });
    const detail = { id: "battleCardDetail", cardId: item.id, x: rect.x + rect.w - 23, y: rect.y + 3, w: 20, h: 22 };
    actions.push(detail);
    fillRoundRect(ctx, detail.x, detail.y, detail.w, detail.h, 7, "rgba(47,111,87,0.92)", "#1d4f3c");
    text(ctx, "详", detail.x + detail.w / 2, detail.y + detail.h / 2, 9, "#fff7d8", "center");
  });
  const skip = { id: "pendingSkip", x: view.width - 70, y: panelY + 28, w: 52, h: 28 };
  actions.push(skip);
  button(ctx, { ...skip, label: "跳过", size: 10, fill: "#8d6840" });
}

function localPlayerIndex(state) {
  return state.mode === "online" && Number.isInteger(state.localPlayerIndex) ? state.localPlayerIndex : 0;
}

function playerSideLabel(state, playerIndex) {
  return playerIndex === localPlayerIndex(state) ? "我方" : "对方";
}

function drawRoundDot(ctx, x, y, active, fill) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, active ? 5 : 4, 0, Math.PI * 2);
  ctx.fillStyle = active ? fill : "#d8c9ad";
  ctx.fill();
  ctx.lineWidth = active ? 2 : 1;
  ctx.strokeStyle = active ? "#fff7d8" : "#bfa77c";
  ctx.stroke();
  ctx.restore();
}

function drawRoundResultMarkers(ctx, view, state) {
  const results = Array.isArray(state.roundResults) ? state.roundResults : [];
  if (!results.length && state.round <= 1) return;
  const local = localPlayerIndex(state);
  const panelW = 114;
  const panelH = 42;
  const x = view.width - panelW - 10;
  const y = view.safeTop + 4;
  fillRoundRect(ctx, x, y, panelW, panelH, 12, "rgba(255,250,240,0.94)", "#d3b982");
  text(ctx, "我", x + 17, y + 18, 10, "#2f6f57", "center");
  text(ctx, "对", x + 17, y + 32, 10, "#8f3c1f", "center");
  for (let index = 0; index < 3; index += 1) {
    const result = results.find(item => item.round === index + 1);
    const cx = x + 44 + index * 24;
    text(ctx, String(index + 1), cx, y + 9, 8, "#8a785f", "center");
    const isLocalWin = result && result.winner === local;
    const isEnemyWin = result && result.winner != null && result.winner !== local;
    const isDraw = result && result.winner == null;
    drawRoundDot(ctx, cx, y + 18, isLocalWin || isDraw, isDraw ? "#d19330" : "#2f6f57");
    drawRoundDot(ctx, cx, y + 32, isEnemyWin || isDraw, isDraw ? "#d19330" : "#8f3c1f");
  }
}

function drawDiscardButtons(ctx, view, actions, state) {
  const local = localPlayerIndex(state);
  const enemy = local === 0 ? 1 : 0;
  const handY = view.height - view.safeBottom - 184;
  const y = handY - 32;
  const w = 68;
  const gap = 8;
  const x0 = view.width - 16 - w * 2 - gap;
  [local, enemy].forEach((playerIndex, index) => {
    const player = state.players[playerIndex];
    const rect = { id: "viewDiscardPile", playerIndex, x: x0 + index * (w + gap), y, w, h: 24 };
    actions.push(rect);
    button(ctx, { ...rect, label: `${playerSideLabel(state, playerIndex)}弃 ${player?.discard?.length || 0}`, size: 10, fill: playerIndex === local ? "#2f6f57" : "#8f3c1f", r: 8 });
  });
}

function drawDiscardPilePanel(ctx, view, actions, state, ui) {
  if (ui.discardPileOwner == null) return;
  const local = localPlayerIndex(state);
  const enemy = local === 0 ? 1 : 0;
  const owner = state.players[ui.discardPileOwner] ? ui.discardPileOwner : local;
  const pile = state.players[owner]?.discard || [];
  const panelX = 16;
  const panelY = view.safeTop + 74;
  const panelW = view.width - 32;
  const panelH = Math.max(300, Math.min(390, view.height - view.safeTop - view.safeBottom - 178));
  const listTop = panelY + 78;
  const rowH = 48;
  const pageSize = Math.max(3, Math.floor((panelH - 124) / rowH));
  const totalPages = Math.max(1, Math.ceil(pile.length / pageSize));
  const page = Math.max(0, Math.min(ui.discardPilePage || 0, totalPages - 1));
  ui.discardPilePage = page;
  const shown = pile.slice(page * pageSize, page * pageSize + pageSize);

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

  if (!pile.length) {
    text(ctx, `${playerSideLabel(state, owner)}暂无弃牌`, panelX + panelW / 2, panelY + panelH / 2 + 10, 14, "#775c34", "center");
  } else {
    shown.forEach((item, index) => {
      const y = listTop + index * rowH;
      const detail = { id: "battleCardDetail", cardId: item.id, x: panelX + 18, y: y + 5, w: panelW - 42, h: 40 };
      actions.push(detail);
      fillRoundRect(ctx, detail.x, detail.y, detail.w, detail.h, 10, "#f7edd8", "#dcc48d");
      drawCardImage(ctx, { ...item, imageFill: true, imageX: detail.x + 8, imageY: detail.y + 6, imageW: 28, imageH: 28 });
      const x = detail.x + 44;
      text(ctx, short(item.name || item.baseName || "未知卡牌", 10), x, detail.y + 15, 12, "#3b2b18");
      const rowName = (item.row || []).map(row => ROW_LABELS[row]).join("/") || "谋略/时局";
      const strength = item.category === "weather" || item.category === "special" ? "策" : (item.strength ?? "");
      text(ctx, `${categoryLabel(item)} · ${rowName} · ${strength}`, x, detail.y + 31, 10, "#775c34");
      text(ctx, "查看", detail.x + detail.w - 26, detail.y + 22, 10, "#8f3c1f", "center");
    });
    if (totalPages > 1) {
      const trackX = panelX + panelW - 12;
      const trackY = listTop + 5;
      const trackH = Math.max(48, panelY + panelH - 28 - trackY);
      const thumbH = Math.max(28, trackH / totalPages);
      const thumbY = trackY + (trackH - thumbH) * (totalPages === 1 ? 0 : page / (totalPages - 1));
      fillRoundRect(ctx, trackX, trackY, 4, trackH, 2, "rgba(119,92,52,0.18)");
      fillRoundRect(ctx, trackX - 1, thumbY, 6, thumbH, 3, "rgba(47,111,87,0.72)");
    }
  }

}

function drawRecentOpponentPlay(ctx, view, actions, state, ui) {
  const notice = state.lastPlayed;
  const localPlayerIndex = state.mode === "online" && Number.isInteger(state.localPlayerIndex) ? state.localPlayerIndex : 0;
  if (!notice || notice.playerIndex === localPlayerIndex || notice.seq <= (ui.dismissedRecentPlaySeq || 0) || state.over || state.mulligan?.active) return;

  const detail = notice.cardId ? cardById(notice.cardId) : null;
  const panelW = view.width - 36;
  const panelH = 132;
  const panelX = 18;
  const handY = view.height - view.safeBottom - 184;
  const panelY = Math.max(view.safeTop + 72, handY - panelH - 42);
  fillRoundRect(ctx, panelX, panelY, panelW, panelH, 18, "#fff4cf", "#d19330");
  fillRoundRect(ctx, panelX, panelY, 5, panelH, 3, "#c46a2b", "#c46a2b");

  const cardW = 72;
  const cardH = 100;
  const cardX = panelX + 16;
  const cardY = panelY + 18;
  const preview = {
    id: "recentPlayedCard",
    cardId: notice.cardId,
    x: cardX,
    y: cardY,
    w: cardW,
    h: cardH,
    name: notice.name || detail?.name,
    baseName: notice.baseName || detail?.baseName,
    imageUrl: notice.imageUrl || detail?.imageUrl,
    summary: notice.summary || detail?.summary,
    category: notice.category || (detail ? categoryLabel(detail) : "卡牌"),
    faction: notice.faction || detail?.faction,
    row: notice.cardRow || detail?.row,
    abilities: notice.abilities || detail?.abilities,
    abilityDisplayNames: notice.abilityDisplayNames || detail?.abilityDisplayNames,
    hero: notice.hero || detail?.hero,
    strength: notice.strength == null ? (detail?.category === "weather" || detail?.category === "special" ? "策" : detail?.strength) : notice.strength,
    nameMax: 4
  };
  actions.push({ id: "battleCardDetail", cardId: notice.cardId, x: cardX, y: cardY, w: cardW, h: cardH });
  card(ctx, preview);

  const textX = cardX + cardW + 14;
  text(ctx, `${notice.playerName || "对方"}刚打出`, textX, panelY + 28, 13, "#8f3c1f");
  text(ctx, short(notice.name || "未知卡牌", 12), textX, panelY + 51, 18, "#2f2417");
  text(ctx, notice.description || notice.category || "已进入战场", textX, panelY + 72, 11, "#775c34");
  wrapText(ctx, notice.summary || detail?.summary || "长按或点击牌面查看说明", textX, panelY + 94, panelX + panelW - textX - 16, 15, 2, 10, "#5f4727");

  const close = { id: "dismissRecentPlay", seq: notice.seq, x: panelX + panelW - 38, y: panelY + 10, w: 26, h: 26 };
  actions.push(close);
  fillRoundRect(ctx, close.x, close.y, close.w, close.h, 13, "rgba(141,104,64,0.92)", "#6f4d29");
  text(ctx, "×", close.x + close.w / 2, close.y + close.h / 2 + 1, 15, "#fff7d8", "center");
}

function drawCardGuide(ctx, view, actions) {
  const handY = view.height - view.safeBottom - 184;
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
  const guide = "点击手牌即可打出，长按手牌查看详情；点击当前方主将头像使用技能，长按双方头像可查看主将技能。";
  wrapText(ctx, guide, panelX + 18, panelY + 58, panelW - 36, 20, 4, 12, "#5f4727");
  text(ctx, "点任意位置关闭，之后不再提示", panelX + 18, panelY + 130, 11, "#8f3c1f");
  const close = { id: "closeCardGuide", x: panelX + panelW - 106, y: panelY + panelH - 44, w: 84, h: 30 };
  actions.push(close);
  button(ctx, { ...close, label: "知道了", size: 12, fill: "#2f6f57" });
}

function draw(ctx, view, actions, state, ui = {}) {
  clear(ctx, view.width, view.height);
  let detail = null;
  if (ui.battleCardDetailId) {
    detail = cardById(ui.battleCardDetailId);
    if (!detail) ui.battleCardDetailId = "";
  }
  const headerY = view.safeTop + 16;
  const isMulligan = state.mulligan && state.mulligan.active;
  const weatherNames = ROWS.filter(row => state.weather[row]).map(row => ROW_LABELS[row]);
  text(ctx, `第 ${state.round} 回合`, view.width / 2, headerY, 17, "#2f2417", "center");
  const mulliganUsed = isMulligan ? (state.mulligan.used[state.mulligan.current || 0] || 0) : 0;
  text(ctx, isMulligan ? `${state.players[state.current].name} 换牌 ${mulliganUsed}/${state.mulligan.max}` : (state.over ? "对局结束" : `当前：${state.players[state.current].name}`), view.width / 2, headerY + 22, 12, "#775c34", "center");
  drawRoundResultMarkers(ctx, view, state);
  if (weatherNames.length) {
    text(ctx, `时局：${weatherNames.join("、")}`, view.width / 2, headerY + 40, 10, "#8a785f", "center");
  }
  drawRows(ctx, view, actions, state, weatherNames.length ? 90 : 78);
  const handY = view.height - view.safeBottom - 184;
  const logH = 36;
  const logY = handY - logH - 34;
  fillRoundRect(ctx, 12, logY, view.width - 24, logH, 9, "#efe6d2", "#d3b982");
  wrapText(ctx, state.logs[0] || "暂无行动记录", 24, logY + 11, view.width - 48, 13, 2, 10, "#775c34");
  drawPendingChoice(ctx, view, actions, state);
  drawHand(ctx, view, actions, state, ui);
  drawDiscardButtons(ctx, view, actions, state);
  const bottom = view.height - view.safeBottom - 42;
  if (isMulligan) {
    const handControlY = handY + HAND_CARD_H + 6;
    const done = { id: "mulliganDone", x: view.width - 136, y: handControlY, w: 120, h: 30 };
    actions.push(done);
    button(ctx, { ...done, label: "开始对局", size: 12, fill: "#2f6f57" });
  }
  const w = (view.width - 44) / 3;
  const buttons = [
    ["auto", "自动", "#4f6d8a"],
    ["pass", "放弃", "#8d6840"],
    [state.over ? "home" : "surrenderMatch", state.over ? "首页" : "认输", "#6b6b5f"]
  ];
  buttons.forEach((item, index) => {
    const rect = { id: item[0], x: 10 + index * (w + 12), y: bottom, w, h: 34 };
    actions.push(rect);
    button(ctx, { ...rect, label: item[1], size: 12, fill: item[2] });
  });
  drawRecentOpponentPlay(ctx, view, actions, state, ui);
  drawDiscardPilePanel(ctx, view, actions, state, ui);
  if (ui.showCardGuide && !isMulligan && !state.over && state.current === 0) {
    drawCardGuide(ctx, view, actions);
  }
  if (detail) {
    drawDetail(ctx, view, actions, detail, { closeHint: "点击空白处返回对局" });
  }
}

module.exports = { draw };
