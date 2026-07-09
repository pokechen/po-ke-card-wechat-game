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
  text(ctx, leader ? short(leader.name || leader.baseName, 7) : "未配置主将", x + avatar + 8, centerY + 9, 10, player.leaderUsed ? "#9a8a73" : "#775c34");
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
  const shown = sortedHand.slice(page * pageSize, page * pageSize + pageSize);
  const cardW = Math.floor((view.width - 44) / 5);
  const cardH = HAND_CARD_H;
  const startX = 10;
  const startY = view.height - view.safeBottom - 184;
  const totalPages = Math.max(1, Math.ceil(player.hand.length / pageSize));
  const title = waiting
    ? `${state.players[state.current].name}行动中 · ${player.name} 手牌 ${player.hand.length} 张`
    : `${player.name} 手牌 ${player.hand.length} 张 · ${page + 1}/${totalPages}${totalPages > 1 ? " · 左右滑动切换" : ""}`;
  text(ctx, title, 16, startY - 16, 11, "#775c34");
  shown.forEach((item, index) => {
    const spec = {
      id: "card",
      cardUid: item.uid,
      cardId: item.id,
      x: startX + index * (cardW + 6),
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
  if (ui.showCardGuide && !isMulligan && !state.over && state.current === 0) {
    drawCardGuide(ctx, view, actions);
  }
  if (detail) {
    drawDetail(ctx, view, actions, detail, { closeHint: "点击空白处返回对局" });
  }
}

module.exports = { draw };
