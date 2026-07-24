const { clear, text, button, fillRoundRect, wrapText, drawRemoteImage, short } = require("../ui/canvas");
const rankCore = require("../core/rank");

const ROW_H = 64;
const GROUP_H = 30;

function layout(view) {
  const top = view.safeTop + 28;
  const bottom = view.height - view.safeBottom - 52;
  const listTop = top + 62;
  const viewportH = Math.max(220, bottom - listTop - 8);
  return { top, bottom, listTop, listBottom: listTop + viewportH, viewportH };
}

function items(leaderboard = []) {
  const result = [];
  let lastTier = "";
  (Array.isArray(leaderboard) ? leaderboard : []).forEach(player => {
    const tierName = player.tierName || "平民";
    if (tierName !== lastTier) {
      result.push({ type: "group", tierName, h: GROUP_H });
      lastTier = tierName;
    }
    result.push({ type: "player", player, h: ROW_H });
  });
  return result;
}

function contentHeight(leaderboard) {
  return items(leaderboard).reduce((sum, item) => sum + item.h, 0);
}

function scrollBounds(view, rank = {}) {
  const info = layout(view);
  const contentH = contentHeight(rank.leaderboard || []);
  return { ...info, contentH, maxScroll: Math.max(0, contentH - info.viewportH) };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(value || 0, max));
}

function avatar(ctx, player, x, y, size) {
  const fallback = () => {
    fillRoundRect(ctx, x, y, size, size, size / 2, "#315e59", "#e5c27e");
    text(ctx, "章", x + size / 2, y + size / 2 + 1, 13, "#fff4d8", "center", "middle");
  };
  if (!drawRemoteImage(ctx, player?.avatarUrl, x, y, size, size, { radius: size / 2, onFail: fallback })) fallback();
}

function formatDate(value) {
  const time = Number(value || 0);
  if (!time) return "未知";
  const d = new Date(time);
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function drawPlayerRow(ctx, actions, player, x, y, w) {
  fillRoundRect(ctx, x, y, w, ROW_H - 8, 14, "#fffaf0", "#dcc48d");
  const rank = player.rank || "-";
  text(ctx, `${rank}`, x + 18, y + 28, 15, "#8f3c1f", "center");
  avatar(ctx, player, x + 34, y + 10, 38);
  actions.push({ id: "rankPublicProfile", userId: player.userId, x: x + 28, y: y + 4, w: w - 56, h: ROW_H - 8 });
  const textX = x + 82;
  text(ctx, short(player.nickName || "匿名玩家", 10), textX, y + 22, 13, "#2f2417");
  text(ctx, `${player.tierName} · ${player.powerText}`, textX, y + 43, 11, "#775c34");
  text(ctx, `胜率 ${player.winRate || 0}%`, x + w - 16, y + 22, 11, "#2f6f57", "right");
  text(ctx, `总 ${player.totalMatches || 0}`, x + w - 16, y + 43, 10, "#8d6840", "right");
}

function drawProfileModal(ctx, view, actions, profile, loading, error) {
  actions.push({ id: "rankClosePublicProfile", x: 0, y: 0, w: view.width, h: view.height });
  ctx.save();
  ctx.fillStyle = "rgba(31,24,18,0.36)";
  ctx.fillRect(0, 0, view.width, view.height);
  ctx.restore();
  const w = view.width - 52;
  const h = 286;
  const x = 26;
  const y = Math.max(view.safeTop + 96, (view.height - h) / 2);
  actions.push({ id: "rankPublicProfilePanel", x, y, w, h });
  fillRoundRect(ctx, x, y, w, h, 20, "#fffaf0", "#dcc48d");
  text(ctx, "排位资料", view.width / 2, y + 30, 18, "#2f2417", "center");
  if (loading) {
    text(ctx, "正在读取…", view.width / 2, y + 132, 14, "#775c34", "center");
  } else if (error) {
    wrapText(ctx, error, x + 24, y + 112, w - 48, 18, 3, 13, "#9f3b24");
  } else if (profile) {
    avatar(ctx, profile, x + 28, y + 56, 58);
    text(ctx, short(profile.nickName || "匿名玩家", 12), x + 98, y + 78, 16, "#2f2417");
    text(ctx, `${profile.tierName} · ${profile.powerText}`, x + 98, y + 104, 13, "#8f3c1f");
    const rows = [
      [`总场数`, `${profile.totalMatches || 0}`],
      [`胜 / 负 / 平`, `${profile.wins || 0} / ${profile.losses || 0} / ${profile.draws || 0}`],
      [`胜率`, `${profile.winRate || 0}%`],
      [`威望`, `${profile.prestige || 0}/${profile.prestigeCap || rankCore.PRESTIGE_CAP}`],
      [`历史最高`, `${rankCore.tierForPower(profile.peakPower || 0).name} ${rankCore.tierPowerText(profile.peakPower || 0)}`],
      [`更新`, formatDate(profile.updatedAt)]
    ];
    rows.forEach((row, index) => {
      const ry = y + 146 + index * 20;
      text(ctx, row[0], x + 28, ry, 11, "#775c34");
      text(ctx, row[1], x + w - 28, ry, 11, "#2f2417", "right");
    });
  }
  const close = { id: "rankClosePublicProfile", x: x + 24, y: y + h - 48, w: w - 48, h: 34 };
  actions.push(close);
  button(ctx, { ...close, label: "关闭", fill: "#8d6840", stroke: "#6f4d29", size: 12 });
}

function draw(ctx, view, actions, ui = {}, rank = {}) {
  clear(ctx, view.width, view.height);
  const state = scrollBounds(view, rank);
  const scroll = clamp(ui.rankLeaderboardScroll || 0, 0, state.maxScroll);
  ui.rankLeaderboardScroll = scroll;
  text(ctx, "排位排行榜", view.width / 2, state.top, 22, "#2f2417", "center");
  text(ctx, rank.loading ? "正在读取排行榜…" : (rank.error || "按段位分组展示 Top 玩家"), view.width / 2, state.top + 28, 12, rank.error ? "#9f3b24" : "#775c34", "center");

  if (!rank.leaderboard?.length && !rank.loading) {
    fillRoundRect(ctx, 24, state.listTop + 30, view.width - 48, 110, 18, "#fffaf0", "#dcc48d");
    text(ctx, rank.error || "暂无排位数据", view.width / 2, state.listTop + 84, 14, "#775c34", "center");
  }

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, state.listTop, view.width, state.viewportH);
  ctx.clip();
  let y = state.listTop - scroll;
  items(rank.leaderboard || []).forEach(item => {
    if (y + item.h >= state.listTop && y <= state.listBottom) {
      if (item.type === "group") {
        text(ctx, item.tierName, view.width / 2, y + 18, 13, "#8d6840", "center");
        ctx.save();
        ctx.strokeStyle = "rgba(141,104,64,0.28)";
        ctx.beginPath();
        ctx.moveTo(36, y + 17);
        ctx.lineTo(view.width / 2 - 34, y + 17);
        ctx.moveTo(view.width / 2 + 34, y + 17);
        ctx.lineTo(view.width - 36, y + 17);
        ctx.stroke();
        ctx.restore();
      } else {
        drawPlayerRow(ctx, actions, item.player, 18, y, view.width - 36);
      }
    }
    y += item.h;
  });
  ctx.restore();

  if (state.maxScroll > 0) {
    const trackX = view.width - 9;
    const trackY = state.listTop + 4;
    const trackH = Math.max(24, state.viewportH - 8);
    const thumbH = Math.max(30, trackH * state.viewportH / Math.max(state.contentH, state.viewportH));
    const thumbY = trackY + (trackH - thumbH) * (scroll / state.maxScroll);
    fillRoundRect(ctx, trackX, trackY, 3, trackH, 1.5, "rgba(119,92,52,0.16)");
    fillRoundRect(ctx, trackX, thumbY, 3, thumbH, 1.5, "rgba(47,111,87,0.76)");
  }

  const back = { id: "rankBoardBack", x: 18, y: state.bottom, w: view.width - 36, h: 40 };
  actions.push(back);
  button(ctx, { ...back, label: "返回", fill: "#8d6840", stroke: "#6f4d29", size: 13 });

  if (rank.publicProfileOpen) drawProfileModal(ctx, view, actions, rank.publicProfile, rank.publicProfileLoading, rank.publicProfileError);
}

module.exports = { draw, scrollBounds };
