const { clear, text, button, fillRoundRect, wrapText } = require("../ui/canvas");

function statusText(pvp) {
  if (pvp.loading) return "正在连接云端房间...";
  if (pvp.error) return pvp.error;
  if (!pvp.roomId) return "请选择创建房间，或输入好友给你的房间号加入。";
  if (pvp.room?.status === "playing") return "好友已加入，即将开始对战";
  if (pvp.room?.status === "finished") return "本局已结束";
  return "等待好友加入房间";
}

function draw(ctx, view, actions, pvp = {}) {
  clear(ctx, view.width, view.height);
  const top = view.safeTop + 64;
  text(ctx, "联网对战", view.width / 2, top, 28, "#2f2417", "center");
  text(ctx, "创建房间邀请好友，或输入房间号加入", view.width / 2, top + 34, 12, "#775c34", "center");

  const panel = { x: 24, y: top + 78, w: view.width - 48, h: 210 };
  fillRoundRect(ctx, panel.x, panel.y, panel.w, panel.h, 18, "#fffaf0", "#dcc48d");
  text(ctx, pvp.roomId ? "房间号" : "联网对战", view.width / 2, panel.y + 34, 13, "#775c34", "center");
  text(ctx, pvp.roomId || "准备开始", view.width / 2, panel.y + 78, pvp.roomId ? 34 : 28, "#8f3c1f", "center");
  wrapText(ctx, statusText(pvp), panel.x + 22, panel.y + 122, panel.w - 44, 20, 3, 13, pvp.error ? "#c0392b" : "#2f6f57");
  const seat = pvp.playerIndex === 1 ? "你是玩家二" : "你是玩家一";
  text(ctx, pvp.roomId ? seat : "", view.width / 2, panel.y + 184, 12, "#775c34", "center");

  const y0 = panel.y + panel.h + 44;
  if (!pvp.roomId) {
    const create = { id: "pvpCreate", x: 46, y: y0, w: view.width - 92, h: 46 };
    const join = { id: "pvpJoin", x: 46, y: y0 + 62, w: view.width - 92, h: 42 };
    const back = { id: "pvpBack", x: 46, y: y0 + 118, w: view.width - 92, h: 42 };
    actions.push(create, join, back);
    button(ctx, { ...create, label: "开房间邀请好友", fill: "#2f6f57", stroke: "#1d4f3c", size: 14 });
    button(ctx, { ...join, label: "输入房间号加入", fill: "#4f6d8a", stroke: "#36516a", size: 13 });
    button(ctx, { ...back, label: "返回首页", fill: "#8d6840", stroke: "#6f4d29", size: 13 });
    return;
  }

  const share = { id: "pvpShare", x: 46, y: y0, w: view.width - 92, h: 44 };
  const copy = { id: "pvpCopy", x: 46, y: y0 + 58, w: view.width - 92, h: 42 };
  const back = { id: "pvpBack", x: 46, y: y0 + 112, w: view.width - 92, h: 42 };
  actions.push(share, copy, back);
  button(ctx, { ...share, label: "分享给好友", fill: "#2f6f57", stroke: "#1d4f3c", size: 14 });
  button(ctx, { ...copy, label: "复制房间号", fill: "#b5892f", stroke: "#8f6b20", size: 13 });
  button(ctx, { ...back, label: "返回首页", fill: "#8d6840", stroke: "#6f4d29", size: 13 });
}

module.exports = { draw };
