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
  const entries = (state.roundResults || []).slice(0, 3).map(item => {
    const scores = item.scores || [0, 0];
    const label = item.winner == null ? "平" : (item.winner === local ? "胜" : "负");
    return `第${item.round}局 ${scores[0] || 0}:${scores[1] || 0}${state.mode === "online" ? ` ${label}` : ""}`;
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
  text(ctx, `小局：${p0.name} ${p0.roundsWon} : ${p1.roundsWon} ${p1.name}`, view.width / 2, top + 92, 18, "#3b2b18", "center");
  text(ctx, `末局分：${state.finalScores?.[0] || 0} : ${state.finalScores?.[1] || 0}`, view.width / 2, top + 122, 15, "#8f3c1f", "center");
  const detail = roundResultText(state);
  if (detail) text(ctx, detail, view.width / 2, top + 150, 12, "#775c34", "center");
  text(ctx, `${p0.factionName} 对 ${p1.factionName}`, view.width / 2, top + 176, 13, "#775c34", "center");
  text(ctx, online ? "联网对局已结束" : "战绩已保存在本机", view.width / 2, top + 206, 12, "#775c34", "center");
  actions.push({ id: "restart", x: 46, y: top + 256, w: view.width - 92, h: 54 });
  actions.push({ id: "home", x: 46, y: top + 326, w: view.width - 92, h: 54 });
  button(ctx, { ...actions[0], label: online ? "返回房间" : "再来一局" });
  button(ctx, { ...actions[1], label: "返回首页", fill: "#8d6840", stroke: "#6f4d29" });
}

module.exports = { draw };
