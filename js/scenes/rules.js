const { clear, text, button, fillRoundRect, wrapText } = require("../ui/canvas");
const { FACTION_KEYS, FACTION_LABELS, factionInfo } = require("../core/cards");

function factionRuleLine(key) {
  const info = factionInfo(key);
  return `${FACTION_LABELS[key] || key}｜${info.perkName}：${info.perkText}`;
}

function draw(ctx, view, actions) {
  clear(ctx, view.width, view.height);
  const top = view.safeTop + 28;
  text(ctx, "使用说明与规则", view.width / 2, top, 24, "#2f2417", "center");
  const panelY = top + 42;
  const panelH = view.height - view.safeBottom - panelY - 82;
  fillRoundRect(ctx, 20, panelY, view.width - 40, panelH, 18, "#fffaf0", "#dcc48d");
  const lines = [
    "【使用说明】",
    "1. 首页点「开始单机」进入准备，选择阵营、主将、牌组、对手和难度。",
    "2. 开局先换牌：点击手牌主体可替换，换满 2 张后自动推进；少换可点「开始对局」。",
    "3. 对局中点击手牌直接出牌。",
    "4. 底部「主将」触发技能，「放弃」停止本小局行动。",
    "5. 长按主将或卡牌可查看完整详情。",
    "【规则要点】",
    "6. 最多三小局两胜，未打出的手牌跨小局保留。",
    "7. 疆场、朝堂、文脉三线计分；双方放弃后总分高者胜，平局按阵营被动结算。",
    "8. 时局压制对应线；鼓舞、同盟、振势会提升战力。",
    "9. 出使抽牌、济世复归、集贤联动；釜底抽薪摧毁场上最高战力的非传世人物。",
    "【阵营被动】",
    ...FACTION_KEYS.map(factionRuleLine)
  ];
  let y = panelY + 28;
  lines.forEach(line => {
    const isTitle = line[0] === "【";
    const used = wrapText(ctx, line, 40, y, view.width - 80, isTitle ? 22 : 18, 2, isTitle ? 14 : 12, isTitle ? "#8f3c1f" : "#3b2b18");
    y += used + (isTitle ? 4 : 3);
  });
  const back = { id: "back", x: 46, y: view.height - view.safeBottom - 66, w: view.width - 92, h: 48 };
  actions.push(back);
  button(ctx, { ...back, label: "返回首页", fill: "#8d6840", stroke: "#6f4d29" });
}

module.exports = { draw };
