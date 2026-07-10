const { clear, text, button, fillRoundRect, card, wrapText, drawCardImage, short } = require("../ui/canvas");
const { ROWS, ROW_LABELS, categoryLabel, cardById, cardValue, hasAbility, abilityDescriptions: getAbilityDescriptions } = require("../core/cards");
const { totalScore, rowScore, handOwnerIndex } = require("../core/battle");
const { drawDetail } = require("./cardDetail");

function drawLeaderHeader(ctx, view, actions, state, player, playerIndex, centerY) {
  const leader = player.leader;
  const active = state.current === playerIndex && !state.over && !(state.mulligan && state.mulligan.active);
  const avatar = 32;
  const x = 12;
  const y = centerY - avatar / 2;
  const panelW = Math.min(174, view.width - 140);
  fillRoundRect(ctx, x - 3, y - 2, panelW, avatar + 4, 10, active ? "#fff8e5" : "#f2ead8", active ? "#2f6f57" : "#d3b982");
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
  text(ctx, `${player.name} · ${short(player.factionName, 4)}`, x + avatar + 6, centerY - 7, 11, "#3b2b18");
  const handInfo = `手牌 ${player.hand.length} 张${player.passed ? " · 已放弃" : ""}`;
  text(ctx, `${leader ? short(leader.name || leader.baseName, 4) : "未配置主将"} · ${handInfo}`, x + avatar + 6, centerY + 8, 10, player.leaderUsed ? "#9a8a73" : "#775c34");
  text(ctx, `${totalScore(player)} 分`, view.width - 14, centerY, 12, "#8f3c1f", "right");
}

function fieldSortOrder(card) {
  if (hasAbility(card, "Commander's Horn")) return -10;
  if ((card.strength || 0) <= 1) return 100;
  const abilities = card.abilities || [];
  if (abilities.includes("Morale Boost")) return 20;
  if (card.hero) return -5;
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

function drawRows(ctx, view, actions, state, topOffset) {
  const top = view.safeTop + (topOffset || 78);
  const rowH = Math.max(38, Math.min(47, Math.floor((view.height - view.safeTop - view.safeBottom - 318) / 6)));
  const gap = 6;
  const local = localPlayerIndex(state);
  const enemy = local === 0 ? 1 : 0;
  [enemy, local].forEach((playerIndex, visualIndex) => {
    const player = state.players[playerIndex];
    if (!player) return;
    const isEnemySide = visualIndex === 0;
    const baseY = isEnemySide ? top : top + (rowH + gap) * 3 + 34;
    drawLeaderHeader(ctx, view, actions, state, player, playerIndex, baseY - 16);
    const discardCount = player.discard ? player.discard.length : 0;
    const dbH = 26;
    const dy = baseY + 2;
    if (discardCount > 0) {
      fillRoundRect(ctx, 12, dy, view.width - 24, dbH, 8, isEnemySide ? "#f2ead8" : "#fffaf0", "#d3b982");
      text(ctx, `弃牌堆 · ${discardCount} 张`, 22, dy + dbH / 2 + 1, 11, "#775c34");
      text(ctx, "查看", view.width - 24, dy + dbH / 2 + 1, 11, "#2f6f57", "right");
      actions.push({ id: "viewDiscardPile", playerIndex, x: 12, y: dy, w: view.width - 24, h: dbH });
    }
    const rowOrder = isEnemySide ? ROWS.slice().reverse() : ROWS;
    rowOrder.forEach((row, index) => {
      const y = baseY + index * (rowH + gap);
      const suppressed = !!state.weather[row];
      const horn = state.rowHorn[playerIndex][row] ? " 号令" : "";
      fillRoundRect(ctx, 12, y, view.width - 24, rowH, 9, suppressed ? "#ecd6b4" : (isEnemySide ? "#efe6d2" : "#fffaf0"), suppressed ? "#c0392b" : "#d3b982");
      if (suppressed) fillRoundRect(ctx, 12, y, 4, rowH, 2, "#c0392b");
      text(ctx, `${ROW_LABELS[row]}${horn}`, 22, y + rowH / 2 - (suppressed ? 6 : 0), 11, suppressed ? "#a8321f" : "#775c34");
      if (suppressed) {
        fillRoundRect(ctx, 22, y + rowH / 2 + 2, 44, 13, 6, "#c0392b");
        text(ctx, "战力压1", 44, y + rowH / 2 + 8.5, 8, "#fff7d8", "center");
      }
      text(ctx, `${rowScore(player, row)}`, view.width - 24, y + rowH / 2, 13, "#8f3c1f", "right");
      const cards = sortedFieldCards(player.board[row]).slice(-5);
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
      });
    });
  });
}

const HAND_CARD_H = 96;

function handSortGroup(card) {
  if (card.category === "special" || card.category === "weather" || card.category === "leader") return 100;
  const abilities = card.abilities || [];
  if (abilities.includes("Commander's Horn")) return 10;
  if (abilities.includes("Scorch") || abilities.includes("Muster")) return 11;
  if (abilities.includes("Morale Boost")) return 12;
  if ((card.row || []).includes("melee")) return 1;
  if ((card.row || []).includes("ranged")) return 2;
  if ((card.row || []).includes("siege")) return 3;
  return 0;
}

function sortedHandCards(hand) {
  return hand.map((item, index) => ({ item, index })).sort((a, b) => {
    const groupA = handSortGroup(a.item);
    const groupB = handSortGroup(b.item);
    if (groupA !== groupB) return groupA - groupB;
    const strDiff = (a.item.strength || 0) - (b.item.strength || 0);
    if (strDiff !== 0) return strDiff;
    const nameDiff = String(a.item.name || a.item.baseName || "").localeCompare(String(b.item.name || b.item.baseName || ""), "zh-Hans");
    return nameDiff || a.index - b.index;
  }).map(entry => entry.item);
}

function drawHand(ctx, view, actions, state, ui) {
  const ownerIndex = handOwnerIndex(state);
  const player = state.players[ownerIndex] || state.players[0];
  const waiting = (state.mode === "ai" && state.current !== 0 || state.mode === "online" && !isLocalOnlineAction(state)) && !state.over;
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
  if (waiting) {
    const tipY = startY - 24;
    fillRoundRect(ctx, 16, tipY, view.width - 32, 20, 8, "rgba(141,104,64,0.88)", "rgba(111,77,41,0.8)");
    text(ctx, "等待对方行动", view.width / 2, tipY + 10, 10, "#fff7d8", "center");
  }
}

function drawPendingChoice(ctx, view, actions, state) {
  const pending = state.pending;
  if (!pending) return;
  if (state.mode === "online" && !isLocalOnlineAction(state)) return;
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
    const rect = { id: "targetChoice", cardUid: item.uid, cardId: item.id, x: 18 + index * (w + 6), y: panelY + 28, w, h: 28 };
    actions.push(rect);
    button(ctx, { ...rect, label: `${item.name.slice(0, 4)} ${item.effective == null ? item.strength || "" : item.effective}`, size: 10, fill: "#7a5a95" });
  });
  const skip = { id: "pendingSkip", x: view.width - 70, y: panelY + 28, w: 52, h: 28 };
  actions.push(skip);
  button(ctx, { ...skip, label: "跳过", size: 10, fill: "#8d6840" });
}

function localPlayerIndex(state) {
  return state.mode === "online" && Number.isInteger(state.localPlayerIndex) ? state.localPlayerIndex : 0;
}

function actionOwnerIndex(state) {
  if (state.mulligan && state.mulligan.active) return state.mulligan.current || 0;
  if (state.pending) {
    if (Number.isInteger(state.pending.playerIndex)) return state.pending.playerIndex;
    return state.current || 0;
  }
  return state.current || 0;
}

function isLocalOnlineAction(state) {
  return state.mode !== "online" || actionOwnerIndex(state) === localPlayerIndex(state);
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
  fillRoundRect(ctx, x, y, panelW, panelH, 10, "rgba(255,250,240,0.94)", "#d3b982");
  text(ctx, "我", x + 14, y + 16, 9, "#2f6f57", "center");
  text(ctx, "对", x + 14, y + 28, 9, "#8f3c1f", "center");
  for (let index = 0; index < 3; index += 1) {
    const result = results.find(item => item.round === index + 1);
    const cx = x + 38 + index * 22;
    text(ctx, String(index + 1), cx, y + 8, 7, "#8a785f", "center");
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
      text(ctx, "长按查看", detail.x + detail.w - 30, detail.y + 22, 10, "#8f3c1f", "center");
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
  const panelX = 18;

  // 获取能力描述（带标签前缀，如"同盟：xxx"），谋略/时局卡用 abilityText 兜底
  const allAbilityDescs = detail ? getAbilityDescriptions(detail) : [];
  const abilityDescs = allAbilityDescs.filter(desc => !desc.startsWith("传世："));
  const rawAbilityText = notice.summary || detail?.abilityText || detail?.summary || "";
  const cleanDescs = abilityDescs
    .map(d => d.replace(/，系统会选择或让你选择收益最高的位置[。，]?\s*$/, ""))
    .filter(Boolean);
  if (!cleanDescs.length && rawAbilityText && rawAbilityText !== notice.name && rawAbilityText !== detail?.name) {
    cleanDescs.push(rawAbilityText);
  }

  // 布局：左侧大卡牌 + 右侧名称+能力
  const cardW = 88;
  const cardH = 120;
  const padding = 12;
  const textAreaW = panelW - cardW - padding * 2 - 10;
  const maxAbilityLines = 3;
  const shownDescs = cleanDescs.slice(0, maxAbilityLines);
  const hasAbilities = shownDescs.length > 0;
  
  // 计算能力区域高度：只按右侧信息实际高度撑开面板，避免底部留白
  let totalAbilityLines = 0;
  ctx.font = `10px "PingFang SC", "Hiragino Sans GB", sans-serif`;
  shownDescs.forEach(desc => {
    const lines = Math.ceil(ctx.measureText(desc).width / Math.max(1, textAreaW - 12)) || 1;
    totalAbilityLines += Math.min(lines, 2);
  });
  const abilityAreaH = hasAbilities ? totalAbilityLines * 15 + 12 : 0;
  const infoH = 55 + abilityAreaH;
  const panelH = padding * 2 + Math.max(cardH, infoH);

  const handY = view.height - view.safeBottom - 184;
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

  // 右侧信息区 — 与卡片顶部对齐
  const textX = cardX + cardW + 10;
  const infoStartY = cardY;

  // 标题行：对方刚打出
  text(ctx, (notice.playerName || "对方") + "刚打出", textX, infoStartY + 11, 12, "#8f3c1f");

  // 卡牌名称（紧贴标题下方）
  text(ctx, short(notice.name || detail?.name || "未知卡牌", 9), textX, infoStartY + 33, 15, "#2f2417");

  // 能力展示框（保留前缀如"同盟：xxx"）
  if (hasAbilities) {
    const aby = infoStartY + 57;
    const abw = Math.min(textAreaW + 8, panelX + panelW - textX - 4);
    const abh = Math.min(abilityAreaH, panelY + panelH - aby - padding);
    if (abh > 12) {
      fillRoundRect(ctx, textX - 4, aby, abw, abh, 8, "rgba(255,252,235,0.90)", "#e8d4a0");
      let ly = aby + 11;
      shownDescs.forEach(desc => {
        if (ly > aby + abh - 6) return;
        wrapText(ctx, desc, textX + 2, ly, abw - 12, 14, 2, 10, "#5f3a1a");
        ctx.font = '10px "PingFang SC", sans-serif';
        const usedL = Math.max(1, Math.ceil(ctx.measureText(desc).width / Math.max(1, abw - 12)));
        ly += Math.min(usedL, 2) * 15 + 1;
      });
    }
  }

  // 关闭按钮
  const close = { id: "dismissRecentPlay", seq: notice.seq, x: panelX + panelW - 34, y: panelY + 8, w: 24, h: 24 };
  actions.push(close);
  fillRoundRect(ctx, close.x, close.y, close.w, close.h, 12, "rgba(141,104,64,0.92)", "#6f4d29");
  text(ctx, "×", close.x + close.w / 2, close.y + close.h / 2 + 1, 14, "#fff7d8", "center");
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
  const local = localPlayerIndex(state);
  const actionOwner = actionOwnerIndex(state);
  const actionPlayer = state.players[actionOwner] || state.players[state.current] || state.players[0];
  const sideName = state.mode === "online" ? `${actionOwner === local ? "我方" : "对方"} · ` : "";
  const roundText = `第 ${state.round} 回合`;
  const mulliganUsed = isMulligan ? (state.mulligan.used[actionOwner] || 0) : 0;
  const statusText = isMulligan ? `${sideName}${actionPlayer.name} 换牌 ${mulliganUsed}/${state.mulligan.max}` : (state.over ? "对局结束" : `当前：${sideName}${actionPlayer.name}`);
  text(ctx, roundText, view.width / 2, headerY, 17, "#2f2417", "center");
  text(ctx, statusText, view.width / 2, headerY + 22, 12, "#775c34", "center");
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
  const bottom = view.height - view.safeBottom - 42;
  if (isMulligan && isLocalOnlineAction(state)) {
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
  if (ui.showCardGuide && !isMulligan && !state.over && (state.mode === "online" ? state.current === local : state.current === 0)) {
    drawCardGuide(ctx, view, actions);
  }
  if (detail) {
    const swipeOffset = ui.detailSwipe ? ui.detailSwipe.offset || 0 : 0;
    drawDetail(ctx, view, actions, detail, { closeHint: "点击空白处返回对局", swipeOffset });
  }
}

module.exports = { draw };
