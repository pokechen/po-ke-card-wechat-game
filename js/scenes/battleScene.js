const { clear, text, button, fillRoundRect, card, wrapText } = require("../ui/canvas");
const { ROWS, ROW_LABELS, categoryLabel } = require("../core/cards");
const { totalScore, rowScore } = require("../core/battle");

function drawRows(ctx, view, state) {
  const top = view.safeTop + 58;
  const rowH = Math.max(38, Math.min(47, Math.floor((view.height - view.safeTop - view.safeBottom - 318) / 6)));
  const gap = 6;
  state.players.forEach((player, playerIndex) => {
    const baseY = playerIndex === 1 ? top : top + (rowH + gap) * 3 + 34;
    text(ctx, `${player.name} · ${player.factionName}`, 18, baseY - 18, 12, "#3b2b18");
    text(ctx, `${totalScore(player)} 分`, view.width - 18, baseY - 18, 13, "#8f3c1f", "right");
    ROWS.forEach((row, index) => {
      const y = baseY + index * (rowH + gap);
      const weather = state.weather[row] ? " 时局" : "";
      const horn = state.rowHorn[playerIndex][row] ? " 号令" : "";
      fillRoundRect(ctx, 12, y, view.width - 24, rowH, 9, playerIndex === 1 ? "#efe6d2" : "#fffaf0", state.weather[row] ? "#ba7517" : "#d3b982");
      text(ctx, `${ROW_LABELS[row]}${weather}${horn}`, 24, y + rowH / 2, 11, "#775c34");
      text(ctx, `${rowScore(player, row)}`, view.width - 24, y + rowH / 2, 13, "#8f3c1f", "right");
      const cards = player.board[row].slice(-5);
      cards.forEach((item, cardIndex) => {
        const x = 86 + cardIndex * 43;
        if (x + 34 > view.width - 48) return;
        fillRoundRect(ctx, x, y + 5, 36, rowH - 10, 7, item.hero ? "#f5dfac" : "#f9edcf", "#c6954b");
        text(ctx, item.name.slice(0, 2), x + 18, y + rowH / 2 - 5, 10, "#3b2b18", "center");
        text(ctx, String(item.effective == null ? item.strength : item.effective), x + 18, y + rowH / 2 + 9, 11, "#8f3c1f", "center");
      });
    });
  });
}

function drawHand(ctx, view, actions, state, ui) {
  const player = state.players[state.current] || state.players[0];
  const pageSize = 5;
  const page = Math.max(0, Math.min(ui.handPage || 0, Math.max(0, Math.ceil(player.hand.length / pageSize) - 1)));
  const shown = player.hand.slice(page * pageSize, page * pageSize + pageSize);
  const cardW = Math.floor((view.width - 44) / 5);
  const cardH = 78;
  const startX = 10;
  const startY = view.height - view.safeBottom - 184;
  text(ctx, `${player.name} 手牌 ${player.hand.length} 张 · ${page + 1}/${Math.max(1, Math.ceil(player.hand.length / pageSize))}`, 16, startY - 16, 11, "#775c34");
  shown.forEach((item, index) => {
    const spec = {
      id: "card",
      cardUid: item.uid,
      x: startX + index * (cardW + 6),
      y: startY,
      w: cardW,
      h: cardH,
      name: item.name,
      summary: item.summary,
      category: categoryLabel(item),
      faction: item.faction,
      row: item.row,
      hero: item.hero,
      strength: item.category === "weather" || item.category === "special" ? "策" : item.strength,
      nameMax: 4,
      summaryMax: 5
    };
    actions.push(spec);
    card(ctx, spec);
  });
  const prev = { id: "handPrev", x: 16, y: startY + cardH + 10, w: 58, h: 30 };
  const next = { id: "handNext", x: 82, y: startY + cardH + 10, w: 58, h: 30 };
  actions.push(prev, next);
  button(ctx, { ...prev, label: "上页", size: 11, fill: "#6b6b5f" });
  button(ctx, { ...next, label: "下页", size: 11, fill: "#6b6b5f" });
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
  const guide = "点击下方手牌即可打出，系统会按卡牌类型放到合适战线；时局、谋略牌同样点击使用。手牌较多时用上页/下页翻牌，也可用主将技能或放弃本回合。";
  wrapText(ctx, guide, panelX + 18, panelY + 58, panelW - 36, 20, 4, 12, "#5f4727");
  text(ctx, "点任意位置关闭，之后不再提示", panelX + 18, panelY + 130, 11, "#8f3c1f");
  const close = { id: "closeCardGuide", x: panelX + panelW - 106, y: panelY + panelH - 44, w: 84, h: 30 };
  actions.push(close);
  button(ctx, { ...close, label: "知道了", size: 12, fill: "#2f6f57" });
}

function draw(ctx, view, actions, state, ui = {}) {
  clear(ctx, view.width, view.height);
  const headerY = view.safeTop + 16;
  const isMulligan = state.mulligan && state.mulligan.active;
  const weatherNames = ROWS.filter(row => state.weather[row]).map(row => ROW_LABELS[row]);
  text(ctx, `第 ${state.round} 回合`, view.width / 2, headerY, 17, "#2f2417", "center");
  const mulliganUsed = isMulligan ? (state.mulligan.used[state.mulligan.current || 0] || 0) : 0;
  text(ctx, isMulligan ? `${state.players[state.current].name} 换牌 ${mulliganUsed}/${state.mulligan.max}` : (state.over ? "对局结束" : `当前：${state.players[state.current].name}`), view.width / 2, headerY + 22, 12, "#775c34", "center");
  text(ctx, weatherNames.length ? `时局：${weatherNames.join("、")}` : "无时局", view.width / 2, headerY + 40, 10, "#8a785f", "center");
  drawRows(ctx, view, state);
  const logY = view.height - view.safeBottom - 218;
  fillRoundRect(ctx, 12, logY, view.width - 24, 30, 9, "#efe6d2", "#d3b982");
  text(ctx, (state.logs[0] || "").slice(0, 31), 24, logY + 15, 10, "#775c34");
  drawPendingChoice(ctx, view, actions, state);
  drawHand(ctx, view, actions, state, ui);
  const bottom = view.height - view.safeBottom - 42;
  if (isMulligan) {
    const done = { id: "mulliganDone", x: view.width - 132, y: bottom - 118, w: 116, h: 34 };
    actions.push(done);
    button(ctx, { ...done, label: "开始对局", size: 12, fill: "#2f6f57" });
  }
  const w = (view.width - 56) / 4;
  const buttons = [
    ["leader", "主将", "#7a5a95"],
    ["auto", "自动", "#4f6d8a"],
    ["pass", "放弃", "#8d6840"],
    ["home", "首页", "#6b6b5f"]
  ];
  buttons.forEach((item, index) => {
    const rect = { id: item[0], x: 10 + index * (w + 12), y: bottom, w, h: 34 };
    actions.push(rect);
    button(ctx, { ...rect, label: item[1], size: 12, fill: item[2] });
  });
  if (ui.showCardGuide && !isMulligan && !state.over && state.current === 0) {
    drawCardGuide(ctx, view, actions);
  }
}

module.exports = { draw };
