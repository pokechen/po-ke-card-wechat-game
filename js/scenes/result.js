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

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function rankAnimationProgress(state) {
  const animation = state.rankSettlementAnim;
  if (!animation?.start || !animation.duration) return 1;
  const progress = clamp((Date.now() - animation.start) / animation.duration, 0, 1);
  return 1 - Math.pow(1 - progress, 3);
}

function drawPrestigeProgress(ctx, x, y, width, before, after, cap, progress) {
  const height = 14;
  const safeCap = Math.max(1, Number(cap) || 200);
  const from = clamp(Number(before) || 0, 0, safeCap);
  const to = clamp(Number(after) || 0, 0, safeCap);
  const current = from + (to - from) * progress;
  const widthFor = value => width * clamp(value / safeCap, 0, 1);
  fillRoundRect(ctx, x, y, width, height, height / 2, "#fbf1df");
  if (to >= from) {
    if (from > 0) fillRoundRect(ctx, x, y, widthFor(from), height, height / 2, "#c6a15d");
    const addedWidth = widthFor(current) - widthFor(from);
    if (addedWidth > 0.5) fillRoundRect(ctx, x + widthFor(from), y, addedWidth, height, height / 2, "#2f6f57");
    return;
  }
  const currentWidth = widthFor(current);
  if (currentWidth > 0) fillRoundRect(ctx, x, y, currentWidth, height, height / 2, "#c6a15d");
  const removedWidth = widthFor(from) - currentWidth;
  if (removedWidth > 0.5) fillRoundRect(ctx, x + currentWidth, y, removedWidth, height, height / 2, "#fff7d8", "#e7cf95");
}

function drawRankPrestigeHelpPanel(ctx, view, actions) {
  const panelW = Math.min(330, view.width - 40);
  const panelH = 210;
  const panelX = (view.width - panelW) / 2;
  const panelY = Math.max(view.safeTop + 48, (view.height - panelH) / 2);
  actions.push({ id: "closeRankResultPrestigeHelp", x: 0, y: 0, w: view.width, h: view.height });
  ctx.save();
  ctx.fillStyle = "rgba(28, 21, 14, 0.48)";
  ctx.fillRect(0, 0, view.width, view.height);
  ctx.restore();
  actions.push({ id: "rankResultPrestigeHelpPanel", x: panelX, y: panelY, w: panelW, h: panelH });
  fillRoundRect(ctx, panelX, panelY, panelW, panelH, 18, "#fffaf0", "#dcc48d");
  text(ctx, "威望说明", view.width / 2, panelY + 30, 17, "#2f2417", "center");
  text(ctx, "威望不决定段位，段位只看权势。", panelX + 22, panelY + 66, 12, "#5f4727");
  text(ctx, "校尉及以上获胜可获得威望，最多 200。", panelX + 22, panelY + 94, 12, "#5f4727");
  text(ctx, "失败时威望达到 100，会自动消耗 100", panelX + 22, panelY + 122, 12, "#5f4727");
  text(ctx, "抵扣本次 -1 权势。", panelX + 22, panelY + 143, 12, "#5f4727");
  const close = { id: "closeRankResultPrestigeHelp", x: panelX + 54, y: panelY + 162, w: panelW - 108, h: 36 };
  actions.push(close);
  button(ctx, { ...close, label: "知道了", size: 13, fill: "#8d6840", stroke: "#6f4d29" });
}

function rankSettlementLayout(top) {
  const y = top + 234;
  const height = 118;
  return { y, height, restartY: y + height + 12, cardsY: y + height + 64 };
}

function drawRankSettlementPending(ctx, view, state, top) {
  const x = 30;
  const width = view.width - 60;
  const layout = rankSettlementLayout(top);
  fillRoundRect(ctx, x, layout.y, width, layout.height, 18, "#fffaf0", "#dcc48d");
  text(ctx, "排位结算", x + 18, layout.y + 20, 14, "#3b2b18");
  if (state.rankSubmitError) {
    text(ctx, "结算同步失败", x + 18, layout.y + 48, 15, "#9f3b24");
    text(ctx, state.rankSubmitError, x + 18, layout.y + 76, 12, "#775c34");
    text(ctx, "将自动保留本局结果并稍后重试", x + 18, layout.y + 101, 11, "#775c34");
  } else {
    text(ctx, "正在同步排位结果…", x + 18, layout.y + 52, 15, "#775c34");
    fillRoundRect(ctx, x + 18, layout.y + 77, width - 36, 12, 6, "rgba(119,92,52,0.14)");
    text(ctx, "权势与威望将在结算完成后更新", x + 18, layout.y + 104, 11, "#775c34");
  }
  return layout;
}

function drawRankSettlement(ctx, view, actions, state, rankDelta, top) {
  const x = 30;
  const width = view.width - 60;
  const layout = rankSettlementLayout(top);
  const before = rankDelta.before || {};
  const after = rankDelta.after || {};
  const cap = Number(after.prestigeCap || before.prestigeCap) || 200;
  const progress = rankAnimationProgress(state);
  const beforePrestige = clamp(Number(before.prestige) || 0, 0, cap);
  const afterPrestige = clamp(Number(after.prestige) || 0, 0, cap);
  const shownPrestige = Math.round(beforePrestige + (afterPrestige - beforePrestige) * progress);
  const prestigeDelta = Number(rankDelta.prestigeDelta) || 0;
  const powerDelta = Number(rankDelta.powerDelta) || 0;
  const isPrestigeProtection = Boolean(rankDelta.protectionUsed && prestigeDelta < 0);
  const deltaText = prestigeDelta > 0 ? `+${prestigeDelta}` : (prestigeDelta < 0 ? String(prestigeDelta) : "威望不变");
  const prestigeSummary = prestigeDelta === 0 ? deltaText : `威望 ${deltaText}`;
  const deltaColor = prestigeDelta > 0 ? "#2f6f57" : (prestigeDelta < 0 ? "#9f3b24" : "#775c34");
  fillRoundRect(ctx, x, layout.y, width, layout.height, 18, "#fffaf0", "#dcc48d");
  text(ctx, "排位结算", x + 18, layout.y + 20, 14, "#3b2b18");
  text(ctx, after.display || "排位已结算", x + 18, layout.y + 43, 15, "#8f3c1f");
  text(ctx, `威望 ${beforePrestige} → ${shownPrestige}/${cap}`, x + 18, layout.y + 66, 12, "#775c34");
  if (prestigeDelta !== 0) text(ctx, deltaText, x + width - 18, layout.y + 66, 13, deltaColor, "right");
  const helpSize = 18;
  const helpX = x + width - 18 - helpSize;
  const progressWidth = helpX - (x + 18) - 10;
  drawPrestigeProgress(ctx, x + 18, layout.y + 82, progressWidth, beforePrestige, afterPrestige, cap, progress);
  actions.push({ id: "rankResultPrestigeHelp", x: helpX, y: layout.y + 79, w: helpSize, h: helpSize });
  fillRoundRect(ctx, helpX, layout.y + 79, helpSize, helpSize, helpSize / 2, "#fff7d8", "#d1ad6a");
  text(ctx, "?", helpX + helpSize / 2, layout.y + 89, 13, "#8f3c1f", "center");
  const powerText = powerDelta > 0 ? `权势 +${powerDelta}` : (powerDelta < 0 ? `权势 ${powerDelta}` : "权势不变");
  const summary = isPrestigeProtection
    ? `已扣除 ${Math.abs(prestigeDelta)} 威望，抵扣本次权势 -1`
    : `${powerText}，${prestigeSummary}`;
  text(ctx, summary, x + 18, layout.y + 108, 11, isPrestigeProtection ? "#b6382c" : "#775c34");
  return layout;
}

function draw(ctx, view, actions, state, ui = {}) {
  clear(ctx, view.width, view.height);
  const online = state.mode === "online";
  drawTopLeftBack(ctx, view, actions, online ? "pvpExitRoom" : "home");
  const top = view.safeTop + 78;
  const result = resultTitle(state);
  text(ctx, result, view.width / 2, top, 30, "#2f2417", "center");
  fillRoundRect(ctx, 30, top + 56, view.width - 60, 166, 18, "#fffaf0", "#dcc48d");
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
  const finalScoresLabel = state.endReason === "surrender"
    ? "认输时场面分"
    : (state.endReason === "disconnect" ? "掉线时场面分" : "末局分");
  text(ctx, roundsText, view.width / 2, top + 92, online ? 12 : 18, "#3b2b18", "center");
  text(ctx, `${finalScoresLabel}：${finalScoresText}`, view.width / 2, top + 122, 15, "#8f3c1f", "center");
  text(ctx, "军心", view.width / 2, top + 144, 11, "#8a6132", "center");
  drawMoraleTokens(ctx, view.width / 2 - 48, top + 164, morale[local] || 0, "#2f6f57");
  drawMoraleTokens(ctx, view.width / 2 + 18, top + 164, morale[enemy] || 0, "#8f3c1f");
  text(ctx, "我", view.width / 2 - 62, top + 165, 10, "#2f6f57", "center");
  text(ctx, "敌", view.width / 2 + 4, top + 165, 10, "#8f3c1f", "center");
  text(ctx, online ? `我方 ${me.factionName} 对 敌方 ${opponent.factionName}` : `${p0.factionName} 对 ${p1.factionName}`, view.width / 2, top + 184, 12, "#775c34", "center");
  const detail = roundResultText(state);
  if (detail) text(ctx, detail, view.width / 2, top + 204, 10, "#775c34", "center");
  const rankDelta = state.rankDelta?.before && state.rankDelta?.after ? state.rankDelta : null;
  const positions = state.ranked
    ? (rankDelta
      ? drawRankSettlement(ctx, view, actions, state, rankDelta, top)
      : drawRankSettlementPending(ctx, view, state, top))
    : { restartY: top + 256, cardsY: top + 316 };
  const restart = { id: online ? "pvpContinue" : "restart", x: 46, y: positions.restartY, w: view.width - 92, h: 48 };
  const utilityGap = 10;
  const utilityW = (view.width - 92 - utilityGap) / 2;
  const history = { id: "viewFullBattleHistory", x: 46, y: positions.cardsY, w: utilityW, h: 48 };
  const cards = { id: "viewBattleCards", x: history.x + utilityW + utilityGap, y: positions.cardsY, w: utilityW, h: 48 };
  const feedback = { id: "submitBattleFeedback", x: view.width / 2 - 46, y: positions.cardsY + 60, w: 92, h: 22 };
  actions.push(restart, history, cards, feedback);
  button(ctx, { ...restart, label: online ? "继续对战" : "再来一局", fill: online ? "#2f6f57" : undefined, stroke: online ? "#1d4f3c" : undefined, size: 14 });
  button(ctx, { ...history, label: "完整记录", fill: "#6b765e", stroke: "#4d5942", size: 13, shadow: false });
  button(ctx, { ...cards, label: "查看双方卡牌", fill: "#8f3c1f", stroke: "#6d2d18", size: 13, shadow: false });
  text(ctx, ui.battleFeedbackSubmitting ? "提交中…" : "反馈问题 ›", view.width / 2, feedback.y + 15, 11, "#7a5a95", "center");
  if (rankDelta && state.rankPrestigeHelpOpen) drawRankPrestigeHelpPanel(ctx, view, actions);
}

module.exports = { draw };
