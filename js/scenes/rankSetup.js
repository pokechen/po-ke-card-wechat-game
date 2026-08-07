const { clear, text, button, fillRoundRect, wrapText, drawRemoteImage, short, drawTopLeftBack } = require("../ui/canvas");
const { loadSettings, getActiveCustomDeckIds } = require("../core/storage");
const { FACTION_LABELS, DIFFICULTY_LABELS, deckStatus, leadersFor, displayName } = require("../core/cards");
const rankCore = require("../core/rank");
const { setupOptions, selectedValue, drawRow, drawSetupDropdown, selectedLeader, currentHumanFaction } = require("./matchSetup");

function avatar(ctx, profile, ui, x, y, size) {
  const fallback = () => {
    fillRoundRect(ctx, x, y, size, size, size / 2, "#315e59", "#e5c27e");
    text(ctx, "章", x + size / 2, y + size / 2 + 1, 14, "#fff4d8", "center", "middle");
  };
  const onFail = () => {
    ui.authAvatarNeedsRefresh = true;
    fallback();
  };
  if (!drawRemoteImage(ctx, profile?.avatarUrl, x, y, size, size, { radius: size / 2, onFail })) fallback();
}

function drawProgress(ctx, x, y, w, value, max, color) {
  fillRoundRect(ctx, x, y, w, 10, 5, "rgba(119,92,52,0.14)");
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  if (ratio > 0) fillRoundRect(ctx, x, y, Math.max(8, w * ratio), 10, 5, color || "#2f6f57");
}

function drawHelpIcon(ctx, actions, id, x, y, size = 18) {
  const hitBox = { id, x, y, w: size, h: size };
  actions.push(hitBox);
  fillRoundRect(ctx, x, y, size, size, size / 2, "#fff7d8", "#d1ad6a");
  text(ctx, "?", x + size / 2, y + size / 2 + 1, 13, "#8f3c1f", "center");
}

function measureLines(ctx, str, maxW, fontSize) {
  if (!str) return 0;
  // 用实际文本测量，每字符约 fontSize*0.6 宽
  const charW = fontSize * 0.6;
  let lines = 1;
  let lineLen = 0;
  for (const ch of str) {
    if (ch === "\n") { lines++; lineLen = 0; continue; }
    lineLen += charW;
    if (lineLen > maxW) { lines++; lineLen = charW; }
  }
  return lines;
}

function rankTierRangeText(tier) {
  if (!Number.isFinite(tier.maxPower)) return `${tier.minPower}+`;
  return `${tier.minPower}-${tier.maxPower}`;
}

function drawHelpPanel(ctx, view, actions, helpType) {
  const padX = 24;
  const panelW = Math.min(340, view.width - 40);
  const panelX = (view.width - panelW) / 2;
  const contentW = panelW - padX * 2;

  // 段落数据
  let titleStr = "";
  let items = []; // [label, body]
  if (helpType === "rule") {
    const tierText = rankCore.RANK_TIERS.map(t => `${t.name}${rankTierRangeText(t)}权势`).join("、");
    titleStr = "排位规则";
    items = [
      ["段位划分", tierText + "。"],
      ["胜负规则", "胜利 +1 权势；平局权势不变。\n平民、士卒失败不扣权势；校尉及以上失败 -1 权势，威望满 100 时会优先消耗威望抵扣。"],
      ["难度说明", "平民/士卒 → 简单\n校尉/都督 → 普通\n将军及以上 → 困难"],
      ["帝王特殊", "无权势上限，强制随机阵营、随机主将、自动组牌。"],
    ];
  } else {
    titleStr = "威望说明";
    items = [
      ["威望作用", `上限 ${rankCore.PRESTIGE_CAP}，不直接决定段位（段位只看权势）。`],
      ["如何获得", "校尉及以上胜利可获得威望；\n平民、士卒不积累威望。"],
      ["护盾机制", `失败时若威望 ≥ ${rankCore.PRESTIGE_PROTECT_COST}，自动消耗 ${rankCore.PRESTIGE_PROTECT_COST} 威望抵扣本次 -1 权势；不足时正常扣权势。`],
      ["获得量", "2:0 大胜获得更多；段位越高，单局胜利获得的威望越少。"],
    ];
  }

  // 固定面板高度：取屏幕可用空间，确保足够
  const btnH = 44;
  const panelH = Math.min(420, view.height - view.safeTop - view.safeBottom - 60);
  const panelY = Math.max(view.safeTop + 48, (view.height - panelH) / 2);

  // 遮罩
  actions.push({ id: "closeRankHelpPanel", x: 0, y: 0, w: view.width, h: view.height });
  ctx.save();
  ctx.fillStyle = "rgba(28, 21, 14, 0.48)";
  ctx.fillRect(0, 0, view.width, view.height);
  ctx.restore();

  // 面板背景
  actions.push({ id: "rankHelpPanelBody", x: panelX, y: panelY, w: panelW, h: panelH });
  fillRoundRect(ctx, panelX, panelY, panelW, panelH, 18, "#fffaf0", "#dcc48d");

  // 标题
  text(ctx, titleStr, view.width / 2, panelY + 30, 17, "#2f2417", "center");

  // 内容区：从标题下方到按钮上方
  const contentTop = panelY + 54;
  const contentBottom = panelY + panelH - btnH - 16;
  let cy = contentTop;
  const labelSize = 13;
  const textSize = 12;
  const labelGap = 6;
  const itemGap = 14;

  items.forEach(([label, body]) => {
    if (cy >= contentBottom - 10) return; // 超出区域则跳过
    if (label) {
      text(ctx, label, panelX + padX, cy, labelSize, "#8f3c1f");
      cy += labelSize + labelGap;
    }
    const remainH = contentBottom - cy;
    const lineHeight = 18;
    const maxLines = Math.max(1, Math.floor(remainH / lineHeight));
    if (remainH < lineHeight) return;
    cy += wrapText(ctx, body, panelX + padX, cy, contentW, lineHeight, maxLines, textSize, "#5f4727") + itemGap;
  });

  // 关闭按钮
  const closeBtn = { id: "closeRankHelpPanel", x: panelX + 50, y: panelY + panelH - btnH - 12, w: panelW - 100, h: 38 };
  actions.push(closeBtn);
  button(ctx, { ...closeBtn, label: "知道了", size: 13, fill: "#8d6840", stroke: "#6f4d29" });
}

function draw(ctx, view, actions, ui = {}, rank = {}) {
  clear(ctx, view.width, view.height);
  const top = view.safeTop + 22;
  const bottom = view.height - view.safeBottom - 44;
  const x = 18;
  const w = view.width - 36;
  const profile = rank.profile || null;
  const rules = rank.rules || {};
  const settings = loadSettings();
  const locked = !!rules.forcePlayerRandom;

  drawTopLeftBack(ctx, view, actions, "rankBack");
  text(ctx, "排位赛", view.width / 2, top, 24, "#2f2417", "center");
  text(ctx, "挑战随机系统对手，赢取权势冲击帝王", view.width / 2, top + 26, 12, "#775c34", "center");

  // 资料卡 — 紧凑布局
  const cardY = top + 44;
  let cardH = 120;
  if (rank.loading && !profile) cardH = 72;
  else if (rank.error && !profile) cardH = 78;

  fillRoundRect(ctx, x, cardY, w, cardH, 16, "#fffaf0", "#dcc48d");
  if (rank.loading && !profile) {
    text(ctx, "正在读取排位资料…", view.width / 2, cardY + cardH / 2 + 4, 14, "#775c34", "center");
  } else if (rank.error && !profile) {
    wrapText(ctx, rank.error, x + 18, cardY + 18, w - 36, 14, 2, 13, "#9f3b24");
  } else if (profile) {
    avatar(ctx, ui.authUser || profile, ui, x + 16, cardY + 14, 44);
    text(ctx, short(profile.nickName || "匿名玩家", 10), x + 70, cardY + 26, 13, "#2f2417");
    text(ctx, `${profile.tierName} · ${profile.powerText}`, x + 70, cardY + 48, 17, "#8f3c1f");
    text(ctx, `总场 ${profile.totalMatches || 0} · 胜率 ${profile.winRate || 0}%`, x + 70, cardY + 70, 11, "#775c34");
    const prestigeText = `威望 ${profile.prestige || 0}/${profile.prestigeCap || rankCore.PRESTIGE_CAP}`;
    text(ctx, prestigeText, x + 16, cardY + 92, 11, "#775c34");
    drawHelpIcon(ctx, actions, "rankPrestigeHelp", x + 16 + ctx.measureText(prestigeText).width + 8, cardY + 83, 18);
    drawProgress(ctx, x + 16, cardY + 104, w - 32, profile.prestige || 0, profile.prestigeCap || rankCore.PRESTIGE_CAP, "#d3a44f");
    const next = rank.nextTier;
    const nextText = next ? `距下一段位 ${next.name} 还差 ${Math.max(1, next.minPower - profile.totalPower)} 权势` : "帝王段位无上限，继续累积权势争夺排行";
    text(ctx, nextText, view.width / 2, cardY + cardH + 10, 11, "#775c34", "center");
  }

  // 本段规则 — 高度自适应内容
  const difficulty = DIFFICULTY_LABELS[rules.aiDifficulty] || rules.aiDifficulty || "简单";
  const ruleLines = [
    `系统对手：随机阵营、随机主将、自动组牌，难度${difficulty}`,
    locked ? "我方限制：随机阵营、随机主将、自动组牌" : "我方限制：可自选阵营、主将，可用自定义或自动组牌",
    rules.prestigeEnabled ? "胜利可获得威望；失败会失去 1 权势，威望达 100 可抵扣" : "低段位失败不失去权势，也不积累威望"
  ];
  const ruleStr = ruleLines.join("\n");
  const ruleLineCount = measureLines(ctx, ruleStr, w - 36, 12);
  const ruleBoxY = cardY + cardH + (profile ? 28 : 6);
  const ruleTitleBottom = 24; // 标题文字底部位置
  const ruleGap = 10; // 标题到内容的间距
  const ruleLineH = 17; // 每行高度（字号12，行高17避免重叠）
  const ruleContentH = Math.max(ruleLineCount * ruleLineH + 4, 38);
  const ruleBoxH = ruleTitleBottom + ruleGap + ruleContentH + 8;

  fillRoundRect(ctx, x, ruleBoxY, w, ruleBoxH, 16, "rgba(255,250,240,0.94)", "#dcc48d");
  text(ctx, "本段规则", x + 18, ruleBoxY + 18, 13, "#3b2b18");
  drawHelpIcon(ctx, actions, "rankRuleHelp", x + 18 + ctx.measureText("本段规则").width + 8, ruleBoxY + 9, 18);
  wrapText(ctx, ruleStr, x + 18, ruleBoxY + ruleTitleBottom + ruleGap, w - 36, ruleContentH, 5, 12, "#775c34");

  // 我的阵容（内联调整）
  const boxY = ruleBoxY + ruleBoxH + 10;
  const rowX = x + 18;
  const rowW = w - 36;
  // 计算阵容区域实际需要的高度
  let boxH = 48; // 标题 + 最小内容
  if (!locked) {
    boxH += 46; // 阵营行
    const faction = currentHumanFaction(settings);
    if (faction !== "random") {
      boxH += 44; // 主将行
      const selIds = getActiveCustomDeckIds(settings, faction);
      const st = deckStatus(selIds, faction);
      if (st.valid) boxH += 38; // 牌组开关
      else boxH += 24; // 提示文字
    } else {
      boxH += 22; // 随机提示
    }
  } else {
    boxH += 30; // 锁定提示
  }
  boxH += 12; // 底部留白

  fillRoundRect(ctx, x, boxY, w, boxH, 16, "rgba(255,250,240,0.94)", "#dcc48d");
  text(ctx, "我的阵容", x + 18, boxY + 20, 13, "#3b2b18");
  const anchors = {};
  const faction = currentHumanFaction(settings);
  const randomLineup = faction === "random";
  if (locked) {
    wrapText(ctx, "帝王段位强制随机阵营、随机主将、自动组牌，不可修改。", x + 18, boxY + 52, w - 36, 17, 2, 11, "#8f3c1f");
  } else {
    drawRow(ctx, actions, { id: "humanFaction", label: "阵营", value: randomLineup ? "随机阵容" : (FACTION_LABELS[faction] || faction), x: rowX, y: boxY + 42, w: rowW, fill: "#2f6f57" }, ui.rankSetupDropdown === "humanFaction", anchors);
    if (!randomLineup) {
      const leader = selectedLeader(settings, "human", faction);
      drawRow(ctx, actions, { id: "humanLeader", label: "主将", value: short(leader ? displayName(leader) : "未选择", 14), card: leader, cardId: leader?.id, x: rowX, y: boxY + 86, w: rowW, fill: "#7a5a95" }, ui.rankSetupDropdown === "humanLeader", anchors);
    }
    const selectedIds = randomLineup ? [] : getActiveCustomDeckIds(settings, faction);
    const status = randomLineup ? { valid: false, total: 0, ids: [] } : deckStatus(selectedIds, faction);
    const useCustom = !randomLineup && status.valid && settings.customDeckEnabled;
    if (randomLineup) {
      text(ctx, "随机阵容：开局随机决定阵营、主将与卡牌。", x + 18, boxY + 88, 11, "#775c34");
    } else if (status.valid) {
      const toggle = { id: "toggleRankDeckMode", x: x + 18, y: boxY + 114, w: w - 36, h: 32 };
      actions.push(toggle);
      button(ctx, { ...toggle, label: useCustom ? "本局：自定义牌组" : "本局：自动牌组", fill: useCustom ? "#2f6f57" : "#8d6840", stroke: useCustom ? "#1d4f3c" : "#6f4d29", size: 12 });
    } else {
      text(ctx, `自定义牌组未完成（${status.total}/40），本局使用自动牌组。`, x + 18, boxY + 118, 11, "#775c34");
    }
  }
  const start = { id: "rankStart", x: 46, y: bottom - 50, w: view.width - 92, h: 42 };
  actions.push(start);
  button(ctx, { ...start, label: rank.starting ? "正在创建排位…" : (locked ? "随机阵容开始排位" : "开始排位"), fill: "#2f6f57", stroke: "#1d4f3c", size: 15 });

  drawSetupDropdown(ctx, view, actions, settings, ui.rankSetupDropdown || "", anchors, "closeRankSetupDropdown");

  // 帮助面板（最顶层）
  if (rank.helpPanel === "rule" || rank.helpPanel === "prestige") {
    drawHelpPanel(ctx, view, actions, rank.helpPanel);
  }
}

module.exports = { draw };
