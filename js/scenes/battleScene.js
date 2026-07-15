const { clear, text, button, fillRoundRect, card, wrapText, drawCardImage, short } = require("../ui/canvas");
const { ROWS, ROW_LABELS, categoryLabel, cardById, cardValue, hasAbility, abilityDescriptions: getAbilityDescriptions } = require("../core/cards");
const { totalScore, rowScore, handOwnerIndex } = require("../core/battle");
const { drawDetail } = require("./cardDetail");

const FIELD_FONT = "\"PingFang SC\", \"Hiragino Sans GB\", \"Microsoft YaHei\", sans-serif";

function drawLeaderHeader(ctx, view, actions, state, player, playerIndex, centerY) {
  const leader = player.leader;
  const active = state.current === playerIndex && !state.over && !(state.mulligan && state.mulligan.active);
  const local = localPlayerIndex(state);
  const isLocal = playerIndex === local;
  const avatar = 32;
  const x = 12;
  const y = centerY - avatar / 2;
  const scoreReserve = 56;
  const pillH = 24;
  const pillW = 72;
  const pillGap = 8;
  const panelW = Math.max(120, Math.min(174, view.width - scoreReserve - pillW - pillGap - 24));
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
  const discardCount = player.discard ? player.discard.length : 0;
  const pillX = x - 3 + panelW + pillGap;
  const pillY = centerY - pillH / 2;
  const pillFill = isLocal ? "#2f6f57" : "#8f3c1f";
  fillRoundRect(ctx, pillX, pillY, pillW, pillH, 12, pillFill, "#fff7d8");
  text(ctx, `弃牌 ${discardCount}`, pillX + pillW / 2, centerY + 1, 11, "#fff7d8", "center");
  actions.push({ id: "viewDiscardPile", playerIndex, x: pillX, y: pillY, w: pillW, h: pillH });
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
  const reduced = suppressed && !item.hero && item.effective != null && item.effective < (item.strength || 0);
  const stripH = Math.max(9, Math.min(12, Math.floor(rect.h * 0.34)));
  fillRoundRect(ctx, rect.x, rect.y, rect.w, rect.h, 7, item.hero ? "#f5dfac" : (reduced ? "#f4d3c8" : "#f9edcf"), reduced ? "#c0392b" : "#c6954b");
  drawCardImage(ctx, {
    ...item,
    imageFill: true,
    imageX: rect.x + 3,
    imageY: rect.y + 3,
    imageW: rect.w - 6,
    imageH: rect.h - 6
  });
  fillRoundRect(ctx, rect.x + 2, rect.y + rect.h - stripH - 1, rect.w - 4, stripH, 5, "rgba(255, 249, 235, 0.96)", "#e2cc9c");
  drawFittedText(ctx, item.name || item.baseName || "卡牌", rect.x + rect.w / 2, rect.y + rect.h - stripH / 2 - 1, rect.w - 4, stripH >= 11 ? 7.5 : 6.5, "#3b2b18");
  const badge = Math.min(17, Math.max(14, Math.floor(rect.h * 0.48)));
  fillRoundRect(ctx, rect.x + 2, rect.y + 2, badge, badge, badge / 2, reduced ? "#c0392b" : "rgba(143,60,31,0.92)", "rgba(255,247,216,0.88)");
  drawFittedText(ctx, reduced ? `↓${power}` : String(power), rect.x + 2 + badge / 2, rect.y + 2 + badge / 2, badge - 3, 8, "#fff7d8");
}

function drawRows(ctx, view, actions, state, topOffset, bottomLimit) {
  const top = view.safeTop + (topOffset || 78);
  const gap = 6;
  const sideGap = 34;
  const availableH = (bottomLimit || (view.height - view.safeBottom - 180)) - top - gap * 5 - sideGap;
  const rowH = Math.max(44, Math.min(92, Math.floor(availableH / 6)));
  const local = localPlayerIndex(state);
  const enemy = local === 0 ? 1 : 0;
  [enemy, local].forEach((playerIndex, visualIndex) => {
    const player = state.players[playerIndex];
    if (!player) return;
    const isEnemySide = visualIndex === 0;
    const baseY = isEnemySide ? top : top + (rowH + gap) * 3 + sideGap;
    drawLeaderHeader(ctx, view, actions, state, player, playerIndex, baseY - 16);
    const rowOrder = isEnemySide ? ROWS.slice().reverse() : ROWS;
    rowOrder.forEach((row, index) => {
      const y = baseY + index * (rowH + gap);
      const suppressed = !!state.weather[row];
      const horn = state.rowHorn[playerIndex][row] ? " 号令" : "";
      fillRoundRect(ctx, 12, y, view.width - 24, rowH, 9, suppressed ? "#ecd6b4" : (isEnemySide ? "#efe6d2" : "#fffaf0"), suppressed ? "#c0392b" : "#d3b982");
      if (suppressed) fillRoundRect(ctx, 12, y, 4, rowH, 2, "#c0392b");
      text(ctx, `${ROW_LABELS[row]}${horn}`, 22, y + rowH / 2 - (suppressed ? 7 : 0), rowH >= 70 ? 12 : 11, suppressed ? "#a8321f" : "#775c34");
      if (suppressed) {
        fillRoundRect(ctx, 22, y + rowH / 2 + 3, 48, 14, 7, "#c0392b");
        text(ctx, "战力压1", 46, y + rowH / 2 + 10, 8, "#fff7d8", "center");
      }
      text(ctx, `${rowScore(player, row)}`, view.width - 24, y + rowH / 2, rowH >= 70 ? 14 : 13, "#8f3c1f", "right");
      const cards = sortedFieldCards(player.board[row]).slice(-5);
      const fieldX = 86;
      const fieldRight = view.width - 54;
      const cardGap = rowH >= 70 ? 8 : 6;
      const cardH = Math.max(34, rowH - 10);
      const maxCardW = cards.length ? Math.floor((fieldRight - fieldX - cardGap * Math.max(0, cards.length - 1)) / cards.length) : 0;
      const cardW = Math.max(36, Math.min(64, Math.floor(cardH * 0.72), maxCardW));
      cards.forEach((item, cardIndex) => {
        const x = fieldX + cardIndex * (cardW + cardGap);
        if (x + cardW > fieldRight) return;
        const detail = { id: "battleCardDetail", cardId: item.id, cardUid: item.uid, playerIndex, row, x, y: y + 5, w: cardW, h: cardH };
        actions.push(detail);
        drawFieldCard(ctx, item, detail, rowH, suppressed);
      });
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
  if (card.category === "special" || card.category === "weather") return 1;
  if (card.category === "leader") return 2;
  return 0;
}

function handEffectKey(card) {
  const abilities = (card.abilities || []).slice().sort().join("/");
  if (abilities) return abilities;
  return `${card.category || ""}:${card.abilityText || ""}:${(card.row || []).join("/")}`;
}

function handCardKey(card) {
  return String(card.baseName || card.name || card.id || "");
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

function drawHand(ctx, view, actions, state, ui) {
  const ownerIndex = handOwnerIndex(state);
  const player = state.players[ownerIndex] || state.players[0];
  const waiting = (state.mode === "ai" && state.current !== 0 || state.mode === "online" && !isLocalOnlineAction(state)) && !state.over;
  const pageSize = 5;
  const sortedHand = orderedHandCards(player.hand, state, ui);
  const page = Math.max(0, Math.min(ui.handPage || 0, Math.max(0, Math.ceil(sortedHand.length / pageSize) - 1)));
  const shown = sortedHand.slice(page * pageSize, page * pageSize + pageSize + 1);
  const gap = 6;
  const cardW = Math.floor((view.width - 20 - gap * 5) / 5.5);
  const cardH = HAND_CARD_H;
  const transition = ui.pageTransition?.scene === "battleHand" ? ui.pageTransition.offset || 0 : 0;
  const startX = 10 + transition;
  const startY = view.height - view.safeBottom - HAND_BOTTOM_OFFSET;
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
  const skipId = pending.type === "decoy" ? "pendingCancel" : "pendingSkip";
  const skipLabel = pending.type === "decoy" ? "取消" : "跳过";
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
  return state.players[owner]?.discard || [];
}

function visiblePendingDetailCards(state) {
  if (!state.pending || state.pending.type === "row") return [];
  return (state.pending.candidates || []).slice(0, 3).map(entry => entry.card || entry).filter(Boolean);
}

function detailCardEntries(state, ui = {}, view = null) {
  const context = findBattleCardContext(state, ui.battleCardDetailId, ui.battleCardDetailUid);
  if (!context) return [];
  const pendingCards = visiblePendingDetailCards(state);
  if (pendingCards.some(card => battleCardMatch(card, ui.battleCardDetailId, ui.battleCardDetailUid))) return detailEntries(pendingCards);
  if (context.zone === "leader") return detailEntries(visibleLeaderCards(state));
  if (context.zone === "board" && context.row) {
    return detailEntries(sortedFieldCards(state.players[context.playerIndex]?.board?.[context.row] || []).slice(-5));
  }
  if (context.zone === "hand") return detailEntries(visibleHandDetailCards(state, ui));
  if (context.zone === "discard") return detailEntries(visibleDiscardDetailCards(state, ui, context.playerIndex));
  return [];
}

function leaderTextForBattle(player) {
  return `${player?.leader?.baseName || ""} ${player?.leader?.leaderAbility || ""} ${player?.leader?.abilityText || ""}`;
}

function hasHalfWeatherLeader(player) {
  return /half (of )?(their )?strength|lose half|半损|一半战力/i.test(leaderTextForBattle(player));
}

function hasSpyDoubleLeader(player) {
  return /treacherous/i.test(player?.leader?.baseName || "") || /all spies|doubles? strength of all spies|出使.*翻倍/i.test(leaderTextForBattle(player));
}

function collectBoardInstances(state, card) {
  const results = [];
  if (!state || !card) return results;
  state.players.forEach((player, pi) => {
    ROWS.forEach(row => {
      (player.board[row] || []).forEach(item => {
        if (item.id === card.id || (card.baseName && item.baseName === card.baseName && item.faction === card.faction)) {
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

  if (card.hero) {
    const blocked = [];
    if (state.weather[row]) blocked.push("时局");
    if (state.rowHorn?.[playerIndex]?.[row] || rowCards.some(item => hasAbility(item, "Commander's Horn"))) blocked.push("号令");
    if (rowCards.some(item => item.uid !== card.uid && hasAbility(item, "Morale Boost"))) blocked.push("振势");
    if (hasAbility(card, "Tight Bond") && rowCards.filter(item => hasAbility(item, "Tight Bond") && item.baseName === card.baseName).length > 1) blocked.push("同盟");
    lines.push(`所在阵线：${rowLabel}，当前战力 ${current}（基础 ${base}）。`);
    if (blocked.length) lines.push(`传世：不受${blocked.join("、")}修正影响。`);
    else lines.push("传世：不受时局、号令、振势、同盟等战力修正影响。");
    return lines;
  }

  lines.push(current !== base
    ? `所在阵线：${rowLabel}，战力 ${base} → ${current}。`
    : `所在阵线：${rowLabel}，当前战力 ${current}（未受效果影响）。`);
  if (state.weather[row]) {
    lines.push(hasHalfWeatherLeader(player)
      ? `时局：${rowLabel}受压制，主将效果使其改为半损。`
      : `时局：${rowLabel}受压制，基础战力降为 1。`);
  }
  const bondCount = hasAbility(card, "Tight Bond")
    ? rowCards.filter(item => hasAbility(item, "Tight Bond") && item.baseName === card.baseName).length
    : 0;
  if (bondCount > 1) lines.push(`同盟：同名同盟牌 ${bondCount} 张，战力 ×${bondCount}。`);
  else if (hasAbility(card, "Tight Bond")) lines.push("同盟：目前仅 1 张同名牌，未触发倍增。");
  const moraleCount = rowCards.filter(item => item.uid !== card.uid && hasAbility(item, "Morale Boost")).length;
  if (moraleCount > 0) lines.push(`振势：同阵线 ${moraleCount} 张振势牌，战力 +${moraleCount}。`);
  const hornCards = rowCards.filter(item => hasAbility(item, "Commander's Horn"));
  if (state.rowHorn?.[playerIndex]?.[row] || hornCards.length) {
    const hornSource = hornCards.length ? `「${short(hornCards[0].name || hornCards[0].baseName || "号令", 6)}」` : "已打出的号令";
    lines.push(`号令：${hornSource}影响${rowLabel}，战力翻倍。`);
  }
  if (hasAbility(card, "Spy") && hasSpyDoubleLeader(player)) lines.push("主将：出使人物战力翻倍。");
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
    if (!card || card.category === "weather" || card.category === "special") return false;
    const base = card.strength || 0;
    const current = card.effective == null ? base : card.effective;
    return current !== base;
  });
  if (!boardContexts.length) return [];

  const blocks = [];
  boardContexts.forEach((ctx, idx) => {
    const owner = state.players[ctx.playerIndex]?.name || `玩家${ctx.playerIndex + 1}`;
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
    ? "你已完成换牌，正在等待对方。"
    : `本局可换 ${max} 张：已换 ${used} 张，还可换 ${left} 张。\n点击当前卡牌可直接替换；也可点空白回到手牌后选择其它牌。\n不想换牌时，点击「${startLabel}」保留当前手牌。`;
  return [{ title: "换牌说明", content: lines, color: "#8f3c1f", lines: 4 }];
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

function battlePlayEntryText(entry) {
  if (entry.text) return entry.text;
  const roundText = entry.round ? `第 ${entry.round} 回合` : "本局";
  const targetText = entry.description || (entry.targetName && entry.rowName ? `${entry.targetName} · ${entry.rowName}` : "");
  return `${roundText} · ${entry.playerName || "玩家"}打出「${entry.name || entry.baseName || "未知卡牌"}」${targetText ? ` → ${targetText}` : ""}`;
}

function battlePlayEntries(state) {
  const playLogs = (state.logs || [])
    .filter(item => /打出/.test(String(item || "")))
    .map(text => ({ text: String(text) }));
  if (playLogs.length) return playLogs;
  const history = Array.isArray(state.playedHistory) ? state.playedHistory : [];
  if (history.length) return history;
  return state.lastPlayed ? [state.lastPlayed] : [];
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
      const detail = { id: "battleCardDetail", cardId: item.id, cardUid: item.uid, x: panelX + 18, y: y + 5, w: panelW - 42, h: 40 };
      actions.push(detail);
      fillRoundRect(ctx, detail.x, detail.y, detail.w, detail.h, 10, "#f7edd8", "#dcc48d");
      drawCardImage(ctx, { ...item, imageFill: true, imageX: detail.x + 8, imageY: detail.y + 6, imageW: 28, imageH: 28 });
      const x = detail.x + 44;
      text(ctx, short(item.name || item.baseName || "未知卡牌", 10), x, detail.y + 15, 12, "#3b2b18");
      const rowName = (item.row || []).map(row => ROW_LABELS[row]).join("/") || "谋略/时局";
      const strength = item.category === "weather" || item.category === "special" ? "策" : (item.strength ?? "");
      text(ctx, `${categoryLabel(item)} · ${rowName} · ${strength}`, x, detail.y + 31, 10, "#775c34");
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
  const rowH = 42;
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
  text(ctx, "出牌历史", panelX + 18, panelY + 24, 18, "#2f2417");
  text(ctx, "上滑看更早，下滑看较新", panelX + 18, panelY + 48, 11, "#775c34");
  const close = { id: "closeBattleLogHistory", x: panelX + panelW - 42, y: panelY + 10, w: 28, h: 28 };
  actions.push(close);
  fillRoundRect(ctx, close.x, close.y, close.w, close.h, 14, "rgba(141,104,64,0.92)", "#6f4d29");
  text(ctx, "×", close.x + close.w / 2, close.y + close.h / 2 + 1, 15, "#fff7d8", "center");

  if (!entries.length) {
    text(ctx, "暂无出牌历史", panelX + panelW / 2, panelY + panelH / 2 + 8, 14, "#775c34", "center");
  } else {
    ctx.save();
    ctx.beginPath();
    ctx.rect(panelX + 12, listTop, panelW - 24, viewportH);
    ctx.clip();
    const startIndex = Math.max(0, Math.floor(scroll / rowH) - 1);
    const endIndex = Math.min(entries.length, Math.ceil((scroll + viewportH) / rowH) + 1);
    for (let index = startIndex; index < endIndex; index += 1) {
      const entry = entries[index];
      const y = listTop + index * rowH - scroll;
      const row = { id: "battleLogHistoryPanel", x: panelX + 18, y: y + 3, w: panelW - 46, h: 36 };
      actions.push(row);
      fillRoundRect(ctx, row.x, row.y, row.w, row.h, 9, "#f7edd8", "#dcc48d");
      const entryText = battlePlayEntryText(entry);
      const lineH = 13;
      const lineCount = wrappedTextLineCount(ctx, entryText, row.w - 44, 11, 2);
      const textY = row.y + row.h / 2 - (lineCount - 1) * lineH / 2;
      text(ctx, `${index + 1}.`, row.x + 10, row.y + row.h / 2, 10, "#8f3c1f");
      wrapText(ctx, entryText, row.x + 32, textY, row.w - 44, lineH, 2, 11, "#3b2b18");
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
    nameMax: 6
  };
  actions.push({ id: "battleCardDetail", cardId: notice.cardId, cardUid: notice.cardUid, x: cardX, y: cardY, w: cardW, h: cardH });
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

function draw(ctx, view, actions, state, ui = {}) {
  clear(ctx, view.width, view.height);
  let detail = null;
  let detailContext = null;
  if (ui.battleCardDetailId || ui.battleCardDetailUid) {
    detailContext = findBattleCardContext(state, ui.battleCardDetailId, ui.battleCardDetailUid);
    detail = detailContext?.card || cardById(ui.battleCardDetailId);
    if (!detail) {
      ui.battleCardDetailId = "";
      ui.battleCardDetailUid = "";
    }
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
  const handY = view.height - view.safeBottom - HAND_BOTTOM_OFFSET;
  const logLineH = 14;
  const logTextW = view.width - 48;
  const logEntries = state.logs && state.logs.length ? state.logs : ["暂无行动记录"];
  ctx.font = `10px ${FIELD_FONT}`;
  const latestFitsOneLine = !/\n/.test(logEntries[0]) && ctx.measureText(logEntries[0]).width <= logTextW;
  const compactLog = latestFitsOneLine && logEntries.length <= 1;
  const logH = compactLog ? 26 : 32;
  const logY = handY - logH - HAND_LOG_GAP;
  drawRows(ctx, view, actions, state, weatherNames.length ? 90 : 78, logY - 10);
  const logAction = { id: "battleLog", x: 12, y: logY, w: view.width - 24, h: logH };
  actions.push(logAction);
  fillRoundRect(ctx, logAction.x, logAction.y, logAction.w, logAction.h, 9, "#efe6d2", "#d3b982");
  ctx.save();
  ctx.beginPath();
  ctx.rect(logAction.x + 10, logAction.y + 4, logAction.w - 20, logAction.h - 8);
  ctx.clip();
  if (compactLog) {
    text(ctx, logEntries[0], 24, logY + logH / 2, 10, "#775c34");
  } else {
    const previewText = latestFitsOneLine ? logEntries.slice(0, 2).join("\n") : logEntries[0];
    wrapText(ctx, previewText, 24, logY + 10, logTextW, logLineH, 2, 10, "#775c34");
  }
  ctx.restore();
  drawPendingChoice(ctx, view, actions, state);
  drawHand(ctx, view, actions, state, ui);
  const bottom = view.height - view.safeBottom - ACTION_BUTTON_BOTTOM_OFFSET;
  const w = (view.width - 44) / 3;
  let rightButton;
  if (state.over) rightButton = ["home", "首页", "#6b6b5f"];
  else if (isMulligan) rightButton = isLocalOnlineAction(state) ? ["mulliganDone", state.mode === "online" ? "准备" : "不换开始", "#2f6f57"] : ["noop", "等待", "#b6a98e"];
  else rightButton = ["surrenderMatch", "认输", "#6b6b5f"];
  const buttons = [
    ["auto", "自动", "#4f6d8a"],
    ["pass", "放弃", "#8d6840"],
    rightButton
  ];
  buttons.forEach((item, index) => {
    const rect = { id: item[0], x: 10 + index * (w + 12), y: bottom, w, h: ACTION_BUTTON_H };
    actions.push(rect);
    button(ctx, { ...rect, label: item[1], size: 12, fill: item[2] });
  });
  drawRecentOpponentPlay(ctx, view, actions, state, ui);
  drawDiscardPilePanel(ctx, view, actions, state, ui);
  drawBattleLogHistoryPanel(ctx, view, actions, state, ui);
  if (ui.showCardGuide && !isMulligan && !state.over && (state.mode === "online" ? state.current === local : state.current === 0)) {
    drawCardGuide(ctx, view, actions);
  }
  if (detail) {
    const entries = detailCardEntries(state, ui, view);
    const currentIdx = entries.findIndex(entry => battleCardMatch(entry.card, ui.battleCardDetailId, ui.battleCardDetailUid));
    const leftCard = currentIdx > 0 ? entries[currentIdx - 1].card : null;
    const rightCard = currentIdx >= 0 && currentIdx < entries.length - 1 ? entries[currentIdx + 1].card : null;
    const swipeOffset = ui.detailSwipe ? ui.detailSwipe.offset || 0 : 0;
    const helpSections = mulliganDetailSections(state, detailContext);
    const extraSections = battlePowerEffectSections(state, detailContext, detail);
    drawDetail(ctx, view, actions, detail, {
      title: isMulligan ? "换牌阶段" : "卡牌详情",
      closeHint: isMulligan ? "点击当前卡牌换掉 · 空白处返回" : "点击空白处返回对局",
      leftCard,
      rightCard,
      swipeOffset,
      extraSections,
      helpAction: isMulligan ? { id: "mulliganHelp" } : null,
      helpOpen: !!ui.mulliganHelpOpen,
      helpSections,
      anim: ui.mulliganSwapAnim ? { alpha: ui.mulliganSwapAnim.alpha, scale: ui.mulliganSwapAnim.scale } : null,
      cardAction: isMulligan && detailContext?.zone === "hand" && isLocalOnlineAction(state)
        ? { id: "mulliganDetailSwap", cardId: detail.id, cardUid: detail.uid }
        : null
    });
  }
}

module.exports = { draw, detailCardEntries, sortedHandCards };
