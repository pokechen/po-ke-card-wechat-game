const { clear, text, button, fillRoundRect, drawTopLeftBack } = require("../ui/canvas");

function localPlayerIndex(state) {
  return state?.mode === "online" && Number.isInteger(state.localPlayerIndex) ? state.localPlayerIndex : 0;
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

function drawMoraleToken(ctx, x, y, active, fill) {
  const size = 7;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x, y - size);
  ctx.lineTo(x + size, y);
  ctx.lineTo(x, y + size);
  ctx.lineTo(x - size, y);
  ctx.closePath();
  ctx.fillStyle = active ? fill : "#d8c9ad";
  ctx.fill();
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = active ? fill : "#bfa77c";
  ctx.stroke();
  ctx.restore();
}

function drawMoraleTokens(ctx, x, y, count, fill) {
  for (let index = 0; index < 2; index += 1) drawMoraleToken(ctx, x + index * 18, y, index < count, fill);
}

function resultTitle(state) {
  if (!state) return "对局结束";
  if (state.mode !== "online") return state.resultText || "对局结束";
  const local = localPlayerIndex(state);
  if (state.winner == null) return "平局";
  if (state.endReason === "disconnect") return state.winner === local ? "对方掉线" : "你已掉线";
  if (state.endReason === "surrender") return state.winner === local ? "对方认输" : "你已认输";
  return state.winner === local ? "你赢了" : "你输了";
}

function roundResultText(state) {
  const local = localPlayerIndex(state);
  const enemy = local === 0 ? 1 : 0;
  const entries = (state.roundResults || []).slice(0, 3).map(item => {
    const scores = item.scores || [0, 0];
    const label = item.winner == null ? "平" : (item.winner === local ? "胜" : "负");
    const scoreText = state.mode === "online"
      ? `${scores[local] || 0}:${scores[enemy] || 0}`
      : `${scores[0] || 0}:${scores[1] || 0}`;
    return `第${item.round}局 ${scoreText}${state.mode === "online" ? ` ${label}` : ""}`;
  });
  return entries.join("  ");
}

function draw(ctx, view, actions, state) {
  clear(ctx, view.width, view.height);
  const online = state.mode === "online";
  drawTopLeftBack(ctx, view, actions, online ? "restart" : "home");
  const top = view.safeTop + 78;
  const result = resultTitle(state);
  text(ctx, result, view.width / 2, top, 30, "#2f2417", "center");
  fillRoundRect(ctx, 30, top + 56, view.width - 60, 178, 18, "#fffaf0", "#dcc48d");
  const p0 = state.players[0];
  const p1 = state.players[1];
  const local = localPlayerIndex(state);
  const enemy = local === 0 ? 1 : 0;
  const me = state.players[local];
  const opponent = state.players[enemy];
  const roundsText = online
    ? `小局：我方（${me.name}） ${me.roundsWon} : ${opponent.roundsWon} 敌方（${opponent.name}）`
    : `小局：${p0.name} ${p0.roundsWon} : ${p1.roundsWon} ${p1.name}`;
  const finalScoresText = online
    ? `${state.finalScores?.[local] || 0} : ${state.finalScores?.[enemy] || 0}`
    : `${state.finalScores?.[0] || 0} : ${state.finalScores?.[1] || 0}`;
  const morale = Array.isArray(state.morale) ? state.morale : moraleAfterRoundResults(state.roundResults);
  text(ctx, roundsText, view.width / 2, top + 92, online ? 12 : 18, "#3b2b18", "center");
  text(ctx, `末局分：${finalScoresText}`, view.width / 2, top + 122, 15, "#8f3c1f", "center");
  text(ctx, "军心", view.width / 2, top + 144, 11, "#8a6132", "center");
  drawMoraleTokens(ctx, view.width / 2 - 48, top + 164, morale[local] || 0, "#2f6f57");
  drawMoraleTokens(ctx, view.width / 2 + 18, top + 164, morale[enemy] || 0, "#8f3c1f");
  text(ctx, "我", view.width / 2 - 62, top + 165, 10, "#2f6f57", "center");
  text(ctx, "敌", view.width / 2 + 4, top + 165, 10, "#8f3c1f", "center");
  text(ctx, online ? `我方 ${me.factionName} 对 敌方 ${opponent.factionName}` : `${p0.factionName} 对 ${p1.factionName}`, view.width / 2, top + 184, 12, "#775c34", "center");
  const detail = roundResultText(state);
  if (detail) text(ctx, detail, view.width / 2, top + 204, 10, "#775c34", "center");
  const rankDelta = state.rankDelta || null;
  const rankLine = state.ranked
    ? (state.rankSubmitting ? "排位结算中…" : (state.rankSubmitError || (rankDelta ? `${rankDelta.rankDeltaText || "排位已结算"} · ${rankDelta.after?.display || ""}` : "排位等待结算")))
    : "";
  text(ctx, rankLine, view.width / 2, top + 222, 11, state.rankSubmitError ? "#9f3b24" : "#775c34", "center");
  const restart = { id: "restart", x: 46, y: top + 256, w: view.width - 92, h: 48 };
  const cards = { id: "viewBattleCards", x: 46, y: online ? top + 256 : top + 316, w: view.width - 92, h: 48 };
  if (!online) {
    actions.push(restart);
    button(ctx, { ...restart, label: "再来一局", size: 14 });
  }
  actions.push(cards);
  button(ctx, { ...cards, label: "查看双方卡牌", fill: "#8f3c1f", stroke: "#6d2d18", size: 14 });
}

module.exports = { draw };
