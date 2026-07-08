const { clear, text, button, fillRoundRect } = require("../ui/canvas");
const { loadSave, loadSettings } = require("../core/storage");
const { FACTION_LABELS, DIFFICULTY_LABELS } = require("../core/cards");

function draw(ctx, view, actions) {
  clear(ctx, view.width, view.height);
  const save = loadSave();
  const settings = loadSettings();
  const top = Math.max(70, view.safeTop + 44);
  text(ctx, "章鱼牌", view.width / 2, top, 32, "#2f2417", "center");
  text(ctx, "微信端单机体验版", view.width / 2, top + 35, 15, "#775c34", "center");
  fillRoundRect(ctx, 24, top + 74, view.width - 48, 72, 18, "#fffaf0", "#dcc48d");
  text(ctx, `已试玩 ${save.matches || 0} 局，胜利 ${save.wins || 0} 局`, view.width / 2, top + 100, 15, "#3b2b18", "center");
  text(ctx, `${FACTION_LABELS[settings.humanFaction]} 对 ${FACTION_LABELS[settings.aiFaction]} · ${DIFFICULTY_LABELS[settings.difficulty]}`, view.width / 2, top + 128, 12, "#775c34", "center");
  const labels = [
    ["start", "开始单机", "#2f6f57"],
    ["settings", "对局设置", "#8d6840"],
    ["cards", "卡牌图鉴", "#4f6d8a"],
    ["history", "战绩记录", "#6b6b5f"],
    ["rules", "使用说明", "#7a5a95"]
  ];
  const y0 = top + 184;
  labels.forEach((item, index) => {
    const rect = { id: item[0], x: 46, y: y0 + index * 58, w: view.width - 92, h: 46 };
    actions.push(rect);
    button(ctx, { ...rect, label: item[1], fill: item[2], stroke: "#4b3d2d", size: 15 });
  });
}

module.exports = { draw };
