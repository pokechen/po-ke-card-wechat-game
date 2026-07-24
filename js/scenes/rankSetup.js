const { clear, text, button, fillRoundRect, wrapText, drawRemoteImage, short } = require("../ui/canvas");
const { loadSettings, getActiveCustomDeckIds } = require("../core/storage");
const { FACTION_LABELS, DIFFICULTY_LABELS, deckStatus, leadersFor, displayName } = require("../core/cards");
const rankCore = require("../core/rank");

function selectedLeader(settings, faction) {
  if (!faction || faction === "random") return null;
  const leaders = leadersFor(faction);
  return leaders.find(card => card.id === settings.humanLeaderIds?.[faction]) || leaders[0] || null;
}

function currentSetupSummary(settings, rules = {}) {
  if (rules.forcePlayerRandom) return "帝王段位强制随机阵营、随机主将，并使用自动组牌。";
  const faction = settings.humanLineupMode === "random" ? "random" : settings.humanFaction;
  if (faction === "random") return "当前出战：随机阵营、随机主将、自动组牌。";
  const leader = selectedLeader(settings, faction);
  const ids = getActiveCustomDeckIds(settings, faction);
  const status = deckStatus(ids, faction);
  const useCustom = status.valid && settings.customDeckEnabled;
  const deckText = useCustom ? `自定义 ${status.total} 张` : "自动组牌";
  return `当前出战：${FACTION_LABELS[faction] || faction} · ${leader ? displayName(leader) : "随机主将"} · ${deckText}`;
}

function avatar(ctx, profile, x, y, size) {
  const fallback = () => {
    fillRoundRect(ctx, x, y, size, size, size / 2, "#315e59", "#e5c27e");
    text(ctx, "章", x + size / 2, y + size / 2 + 1, 14, "#fff4d8", "center", "middle");
  };
  if (!drawRemoteImage(ctx, profile?.avatarUrl, x, y, size, size, { radius: size / 2, onFail: fallback })) fallback();
}

function drawProgress(ctx, x, y, w, value, max, color) {
  fillRoundRect(ctx, x, y, w, 10, 5, "rgba(119,92,52,0.14)");
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  if (ratio > 0) fillRoundRect(ctx, x, y, Math.max(8, w * ratio), 10, 5, color || "#2f6f57");
}

function draw(ctx, view, actions, ui = {}, rank = {}) {
  clear(ctx, view.width, view.height);
  const top = view.safeTop + 28;
  const bottom = view.height - view.safeBottom - 52;
  const x = 18;
  const w = view.width - 36;
  const profile = rank.profile || null;
  const rules = rank.rules || {};
  const settings = loadSettings();

  text(ctx, "排位赛", view.width / 2, top, 24, "#2f2417", "center");
  text(ctx, "挑战随机系统对手，赢取权势冲击帝王", view.width / 2, top + 28, 12, "#775c34", "center");

  fillRoundRect(ctx, x, top + 54, w, 174, 18, "#fffaf0", "#dcc48d");
  if (rank.loading && !profile) {
    text(ctx, "正在读取排位资料…", view.width / 2, top + 134, 14, "#775c34", "center");
  } else if (rank.error && !profile) {
    wrapText(ctx, rank.error, x + 18, top + 126, w - 36, 18, 2, 13, "#9f3b24");
  } else if (profile) {
    avatar(ctx, profile, x + 18, top + 76, 48);
    text(ctx, short(profile.nickName || "匿名玩家", 10), x + 76, top + 91, 14, "#2f2417");
    text(ctx, `${profile.tierName} · ${profile.powerText}`, x + 76, top + 116, 18, "#8f3c1f");
    text(ctx, `总场 ${profile.totalMatches || 0} · 胜率 ${profile.winRate || 0}%`, x + 76, top + 140, 11, "#775c34");
    text(ctx, `威望 ${profile.prestige || 0}/${profile.prestigeCap || rankCore.PRESTIGE_CAP}`, x + 18, top + 164, 12, "#775c34");
    drawProgress(ctx, x + 18, top + 178, w - 36, profile.prestige || 0, profile.prestigeCap || rankCore.PRESTIGE_CAP, "#d3a44f");
    const next = rank.nextTier;
    const nextText = next ? `距下一段位 ${next.name} 还差 ${Math.max(1, next.minPower - profile.totalPower)} 权势` : "帝王段位无上限，继续累积权势争夺排行";
    text(ctx, nextText, view.width / 2, top + 208, 11, "#775c34", "center");
  }

  fillRoundRect(ctx, x, top + 244, w, 164, 18, "rgba(255,250,240,0.94)", "#dcc48d");
  text(ctx, "本段规则", x + 18, top + 272, 14, "#3b2b18");
  const difficulty = DIFFICULTY_LABELS[rules.aiDifficulty] || rules.aiDifficulty || "简单";
  const ruleText = [
    `系统对手：随机阵营、随机主将、自动组牌，难度${difficulty}`,
    rules.forcePlayerRandom ? "我方限制：随机阵营、随机主将、自动组牌" : "我方限制：可自选阵营、主将，可用自定义或自动组牌",
    rules.prestigeEnabled ? "胜利可获得威望；失败会失去 1 权势，威望达 100 可抵扣" : "低段位失败不失去权势，也不积累威望"
  ].join("\n");
  wrapText(ctx, ruleText, x + 18, top + 296, w - 36, 18, 5, 12, "#775c34");

  fillRoundRect(ctx, x, top + 424, w, 84, 18, "rgba(255,250,240,0.9)", "#dcc48d");
  text(ctx, "出战配置", x + 18, top + 452, 14, "#3b2b18");
  wrapText(ctx, currentSetupSummary(settings, rules), x + 18, top + 476, w - 36, 17, 2, 12, rules.forcePlayerRandom ? "#8f3c1f" : "#775c34");

  const start = { id: "rankStart", x: 46, y: bottom - 104, w: view.width - 92, h: 44 };
  const rowY = bottom - 48;
  const halfW = (view.width - 102) / 2;
  const board = { id: "rankLeaderboard", x: 46, y: rowY, w: halfW, h: 42 };
  const edit = { id: rules.forcePlayerRandom ? "rankRefreshProfile" : "rankEditSetup", x: 56 + halfW, y: rowY, w: halfW, h: 42 };
  const back = { id: "rankBack", x: 18, y: bottom + 6, w: view.width - 36, h: 40 };
  actions.push(start, board, edit, back);
  button(ctx, { ...start, label: rank.starting ? "正在创建排位…" : (rules.forcePlayerRandom ? "随机阵容开始排位" : "开始排位"), fill: "#2f6f57", stroke: "#1d4f3c", size: 15 });
  button(ctx, { ...board, label: "排行榜", fill: "#8f3c1f", stroke: "#6d2d18", size: 13 });
  button(ctx, { ...edit, label: rules.forcePlayerRandom ? "刷新资料" : "调整阵容", fill: "#8d6840", stroke: "#6f4d29", size: 13 });
  button(ctx, { ...back, label: "返回首页", fill: "#7a5a95", stroke: "#4e3568", size: 13 });
}

module.exports = { draw };
