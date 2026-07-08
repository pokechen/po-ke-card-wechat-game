const { clear, text, button, fillRoundRect, wrapText } = require("../ui/canvas");

function draw(ctx, view, actions) {
  clear(ctx, view.width, view.height);
  const top = view.safeTop + 28;
  text(ctx, "使用说明与规则", view.width / 2, top, 24, "#2f2417", "center");
  const panelY = top + 42;
  const panelH = view.height - view.safeBottom - panelY - 82;
  fillRoundRect(ctx, 20, panelY, view.width - 40, panelH, 18, "#fffaf0", "#dcc48d");
  const lines = [
    "【使用说明】",
    "1. 首页可先进“对局设置”选择双方阵营和系统难度。",
    "2. 开局先换牌：点击手牌可替换，点“开始对局”确认。",
    "3. 对局中点击手牌直接出牌；手牌多时用“上页/下页”翻页。",
    "4. 底部“主将”触发技能，“自动”代打，“放弃”结束本回合。",
    "5. “卡牌图鉴”可查看卡面缩略图、阵营、战线、战力和技能。",
    "【规则要点】",
    "6. 三回合两胜，未打出的手牌跨回合保留。",
    "7. 疆场、朝堂、文脉三线分别计分，总分高者胜本回合。",
    "8. 时局压制对应线；号令、同袍、激励会提升战力。",
    "9. 出使抽牌、举荐复归、集结联动；奇策摧毁最高非传世人物。"
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
