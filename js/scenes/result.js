const { clear, text, button, fillRoundRect } = require("../ui/canvas");

function localPlayerIndex(state) {
  return state?.mode === "online" && Number.isInteger(state.localPlayerIndex) ? state.localPlayerIndex : 0;
}

function resultTitle(state) {
  if (!state) return "对局结束";
  if (state.mode !== "online") return state.resultText || "对局结束";
  const local = localPlayerIndex(state);
  if (state.winner == null) return "平局";
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
  const top = view.safeTop + 78;
  const result = resultTitle(state);
  text(ctx, result, view.width / 2, top, 30, "#2f2417", "center");
  fillRoundRect(ctx, 30, top + 56, view.width - 60, 178, 18, "#fffaf0", "#dcc48d");
  const p0 = state.players[0];
  const p1 = state.players[1];
  const online = state.mode === "online";
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
  text(ctx, roundsText, view.width / 2, top + 92, online ? 12 : 18, "#3b2b18", "center");
  text(ctx, `末局分：${finalScoresText}`, view.width / 2, top + 122, 15, "#8f3c1f", "center");
  const detail = roundResultText(state);
  if (detail) text(ctx, detail, view.width / 2, top + 150, 12, "#775c34", "center");
  text(ctx, online ? `我方 ${me.factionName} 对 敌方 ${opponent.factionName}` : `${p0.factionName} 对 ${p1.factionName}`, view.width / 2, top + 176, 13, "#775c34", "center");
  text(ctx, online ? "联网对局已结束" : "战绩已保存在本机", view.width / 2, top + 206, 12, "#775c34", "center");
  const cards = { id: "viewBattleCards", x: 46, y: top + 256, w: view.width - 92, h: 48 };
  const restart = { id: "restart", x: 46, y: top + 316, w: view.width - 92, h: 48 };
  const home = { id: "home", x: 46, y: top + 376, w: view.width - 92, h: 48 };
  actions.push(cards, restart, home);
  button(ctx, { ...cards, label: "查看双方卡牌", fill: "#8f3c1f", stroke: "#6d2d18", size: 14 });
  button(ctx, { ...restart, label: online ? "返回房间" : "再来一局", size: 14 });
  button(ctx, { ...home, label: online && localPlayerIndex(state) === 0 ? "解散房间" : "返回首页", fill: "#8d6840", stroke: "#6f4d29", size: 14 });
}

module.exports = { draw };
