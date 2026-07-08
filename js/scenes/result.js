const { clear, text, button, fillRoundRect } = require("../ui/canvas");

function draw(ctx, view, actions, state) {
  clear(ctx, view.width, view.height);
  const top = view.safeTop + 78;
  const result = state && state.resultText ? state.resultText : "对局结束";
  text(ctx, result, view.width / 2, top, 30, "#2f2417", "center");
  fillRoundRect(ctx, 30, top + 56, view.width - 60, 150, 18, "#fffaf0", "#dcc48d");
  const p0 = state.players[0];
  const p1 = state.players[1];
  text(ctx, `小局：你 ${p0.roundsWon} : ${p1.roundsWon} 系统`, view.width / 2, top + 94, 18, "#3b2b18", "center");
  text(ctx, `终局分：${state.finalScores?.[0] || 0} : ${state.finalScores?.[1] || 0}`, view.width / 2, top + 126, 15, "#8f3c1f", "center");
  text(ctx, `${p0.factionName} 对 ${p1.factionName}`, view.width / 2, top + 158, 13, "#775c34", "center");
  text(ctx, "战绩已保存在本机", view.width / 2, top + 188, 12, "#775c34", "center");
  actions.push({ id: "restart", x: 46, y: top + 256, w: view.width - 92, h: 54 });
  actions.push({ id: "home", x: 46, y: top + 326, w: view.width - 92, h: 54 });
  button(ctx, { ...actions[0], label: "再来一局" });
  button(ctx, { ...actions[1], label: "返回首页", fill: "#8d6840", stroke: "#6f4d29" });
}

module.exports = { draw };
