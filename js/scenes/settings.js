const { clear, text, button, fillRoundRect, wrapText } = require("../ui/canvas");
const { loadSettings, getActiveCustomDeckSlotIndex, getActiveCustomDeckIds } = require("../core/storage");
const { FACTION_KEYS, FACTION_LABELS, DIFFICULTY_LABELS, deckStatus, leadersFor, displayName, cardSummary } = require("../core/cards");

function selectedLeader(settings, side, faction) {
  const store = side === "ai" ? settings.aiLeaderIds : settings.humanLeaderIds;
  const leaders = leadersFor(faction);
  return leaders.find(card => card.id === store?.[faction]) || leaders[0] || null;
}

function draw(ctx, view, actions) {
  clear(ctx, view.width, view.height);
  const settings = loadSettings();
  const activeSlot = getActiveCustomDeckSlotIndex(settings, settings.humanFaction);
  const selectedIds = getActiveCustomDeckIds(settings, settings.humanFaction);
  const status = deckStatus(selectedIds, settings.humanFaction);
  const humanLeader = selectedLeader(settings, "human", settings.humanFaction);
  const aiLeader = selectedLeader(settings, "ai", settings.aiFaction);
  const slotLabel = `牌组${activeSlot + 1}`;
  const customLabel = settings.customDeckEnabled
    ? (status.valid ? `${slotLabel} · 已启用 · ${status.total}张` : `${slotLabel} · 未完成`)
    : (status.total ? `${slotLabel} · 未启用 · ${status.total}张` : `${slotLabel} · 未启用`);
  const top = view.safeTop + 34;
  text(ctx, "对局设置", view.width / 2, top, 24, "#2f2417", "center");
  fillRoundRect(ctx, 18, top + 36, view.width - 36, 430, 18, "#fffaf0", "#dcc48d");
  const rows = [
    ["mode", "对局模式", settings.mode === "hotseat" ? "本地双人" : "玩家对系统"],
    ["humanFaction", "我的阵营", FACTION_LABELS[settings.humanFaction]],
    ["humanLeader", "我的主将", displayName(humanLeader)],
    ["aiFaction", settings.mode === "hotseat" ? "对手阵营" : "系统阵营", FACTION_LABELS[settings.aiFaction]],
    ["aiLeader", settings.mode === "hotseat" ? "对手主将" : "系统主将", displayName(aiLeader)],
    ["difficulty", "系统难度", settings.mode === "hotseat" ? "本地双人不使用" : DIFFICULTY_LABELS[settings.difficulty]],
    ["customDeckEnabled", "自定义牌组", customLabel]
  ];
  rows.forEach((row, index) => {
    const y = top + 68 + index * 50;
    text(ctx, row[1], 38, y, 13, "#775c34");
    const rect = { id: row[0], x: 132, y: y - 19, w: view.width - 158, h: 38 };
    actions.push(rect);
    const fill = row[0] === "difficulty" ? "#4f6d8a"
      : (row[0] === "customDeckEnabled" ? "#a1632b"
      : (row[0].includes("Leader") ? "#7a5a95" : "#2f6f57"));
    button(ctx, { ...rect, label: row[2], fill, size: 12 });
  });
  const leaderNote = humanLeader ? `主将：${displayName(humanLeader)}｜${cardSummary(humanLeader) || humanLeader.leaderAbility || "主将能力"}` : "当前阵营暂无主将。";
  wrapText(ctx, leaderNote, 38, top + 398, view.width - 76, 16, 2, 11, "#775c34");
  const edit = { id: "editCustomDeck", x: 38, y: top + 434, w: view.width - 76, h: 36 };
  actions.push(edit);
  button(ctx, { ...edit, label: "编辑我的牌组", fill: "#8f3c1f", stroke: "#6d2d18", size: 14 });
  const back = { id: "back", x: 46, y: view.height - view.safeBottom - 60, w: view.width - 92, h: 44 };
  actions.push(back);
  button(ctx, { ...back, label: "返回首页", fill: "#8d6840", stroke: "#6f4d29", size: 14 });
}

function nextFaction(current) {
  const idx = FACTION_KEYS.indexOf(current);
  return FACTION_KEYS[(idx + 1 + FACTION_KEYS.length) % FACTION_KEYS.length];
}

function nextDifficulty(current) {
  const keys = ["easy", "normal", "hard"];
  const idx = keys.indexOf(current);
  return keys[(idx + 1 + keys.length) % keys.length];
}

function nextLeaderId(current, faction) {
  const leaders = leadersFor(faction);
  if (!leaders.length) return "";
  const idx = leaders.findIndex(card => card.id === current);
  return leaders[(idx + 1 + leaders.length) % leaders.length].id;
}

module.exports = { draw, nextFaction, nextDifficulty, nextLeaderId };
