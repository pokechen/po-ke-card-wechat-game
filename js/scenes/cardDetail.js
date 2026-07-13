const { fillRoundRect, wrapText, short, drawCardImage, text } = require("../ui/canvas");
const { FACTION_LABELS, ABILITY_LABELS, cardSummary, cardById, displayName, abilityNames, abilityDescriptions, ROW_LABELS, categoryLabel } = require("../core/cards");

function wrappedHeight(ctx, content, maxWidth, lineHeight, maxLines, size) {
  const value = String(content || "");
  if (!value) return 0;
  let count = 0;
  ctx.font = `${size || 13}px "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif`;
  value.split(/\n+/).forEach(part => {
    let line = "";
    for (const ch of part) {
      const next = line + ch;
      if (ctx.measureText(next).width > maxWidth && line) {
        count += 1;
        line = ch;
      } else {
        line = next;
      }
    }
    if (line) count += 1;
  });
  return Math.min(count, maxLines || count) * lineHeight;
}

function normalizeDetailText(content) {
  return String(content || "").replace(/[：:，,、。\s]/g, "").toLowerCase();
}

function hasChineseText(content) {
  return /[\u4e00-\u9fff]/.test(String(content || ""));
}

function drawDetail(ctx, view, actions, card, options = {}) {
  const { leftCard, rightCard, swipeOffset = 0 } = options || {};
  const panelW = Math.min(view.width - 28, 372);
  const panelX = (view.width - panelW) / 2;

  // 筛选能力描述：传世(Hero)不展示文字说明，通才去掉冗余的系统选择提示
  const allAbilityDescs = abilityDescriptions(card);
  const effectDescs = allAbilityDescs
    .filter(desc => !desc.startsWith("传世："))
    .map(desc => desc.replace(/，系统会选择或让你选择收益最高的位置[。，]?\s*$/, ""));
  const rawSummary = cardSummary(card) || "无特殊能力";
  const summary = hasChineseText(rawSummary) ? rawSummary : "主将技能";
  const normalizedSummary = normalizeDetailText(summary);
  const rawLeader = card.leaderAbility || "";
  const leader = hasChineseText(rawLeader) && normalizeDetailText(rawLeader) !== normalizedSummary ? rawLeader : "";
  const flavor = hasChineseText(card.flavor) ? card.flavor : "";

  // 构建下方展示的sections（不含传世文字）
  const contentW = panelW - 32;
  const sections = [
    effectDescs.length > 0
      ? { title: "能力", content: effectDescs.join("\n"), color: "#8f3c1f", lines: 6 }
      : (summary !== "主将技能" ? { title: "能力", content: summary, color: "#8f3c1f", lines: 3 } : null),
    leader ? { title: "主将效果", content: leader, color: "#7a5a95", lines: 2 } : null,
    flavor ? { title: "典故", content: flavor, color: "#775c34", lines: 2 } : null
  ].filter(Boolean);

  const sectionW = contentW;
  let sectionsH = 0;
  sections.forEach(item => {
    sectionsH += 28 + wrappedHeight(ctx, item.content, sectionW - 24, 17, item.lines, 12) + 8;
  });

  // 布局参数
  const headerH = 44;
  const sideCardW = 72;
  const sideCardH = 100;
  const mainCardW = 160;
  const mainCardH = 220;
  const cardGap = 10;
  const cardsAreaW = (leftCard ? sideCardW + cardGap : 0) + mainCardW + (rightCard ? sideCardW + cardGap : 0);
  const nameAreaH = 36;

  const maxPanelH = view.height - view.safeTop - view.safeBottom - 80;
  const panelH = Math.min(maxPanelH, Math.max(420, headerH + 16 + mainCardH + 12 + nameAreaH + 16 + sectionsH + 40));
  const panelY = Math.max(view.safeTop + 36, Math.floor((view.height - view.safeBottom - panelH) / 2));

  const cardsStartX = panelX + (panelW - cardsAreaW) / 2;
  const cardsY = panelY + headerH + 14;
  const mainCardX = cardsStartX + (leftCard ? sideCardW + cardGap : 0) + (mainCardW - cardsAreaW + (leftCard ? sideCardW + cardGap : 0)) / 2 - (leftCard ? sideCardW + cardGap : 0);

  actions.push({ id: "closeDetail", x: 0, y: 0, w: view.width, h: view.height });
  ctx.save();
  ctx.fillStyle = "rgba(28, 21, 14, 0.46)";
  ctx.fillRect(0, 0, view.width, view.height);
  ctx.restore();

  // 面板背景
  fillRoundRect(ctx, panelX + 2, panelY + 3, panelW, panelH, 18, "rgba(60, 42, 24, 0.16)");
  fillRoundRect(ctx, panelX, panelY, panelW, panelH, 18, "#fffaf0", "#d6b779");
  actions.push({ id: "detailPanel", x: panelX, y: panelY, w: panelW, h: panelH });

  // 标题栏
  fillRoundRect(ctx, panelX + 10, panelY + 8, panelW - 20, headerH - 8, 14, "#efe2c6", "#dcc48d");
  text(ctx, "卡牌详情", panelX + 22, panelY + 26, 17, "#2f2417");

  // ===== 卡牌滑动区域 =====
  // swipeOffset: 正值表示向右滑动（显示左边的卡牌），负值表示向左滑动
  const maxSwipe = mainCardW * 0.7;
  const offset = Math.max(-maxSwipe, Math.min(maxSwipe, swipeOffset || 0));
  const progress = offset / maxSwipe; // -1 ~ 1
  
  // 卡牌区域中心点
  const centerCardX = panelX + panelW / 2;
  const cardsCenterY = cardsY + mainCardH / 2;
  
  // 裁剪区域，防止滑动时卡牌溢出面板
  ctx.save();
  ctx.beginPath();
  ctx.rect(panelX, cardsY - 10, panelW, mainCardH + 20);
  ctx.clip();

  // 绘制左边的卡牌（当向右滑或准备向右滑时显示）
  if (leftCard) {
    const leftTargetX = centerCardX - mainCardW / 2 - cardGap - sideCardW / 2;
    const leftVisibleX = centerCardX - sideCardW / 2 - 20; // 预览位置
    // 当offset>0时，左边卡牌从预览位置滑入中心；否则在预览位置
    const lx = progress > 0 
      ? leftTargetX + (mainCardW / 2 + sideCardW / 2 + cardGap) * (1 - progress)
      : leftVisibleX;
    const ly = cardsCenterY - sideCardH / 2;
    const scale = progress > 0 ? 0.55 + 0.45 * progress : 0.55;
    const alpha = progress > 0 ? 0.55 + 0.45 * progress : 0.55;
    
    ctx.save();
    ctx.globalAlpha = alpha;
    const scaledW = sideCardW * scale;
    const scaledH = sideCardH * scale;
    fillRoundRect(ctx, lx - scaledW/2 - 3, ly - scaledH/2 - 3, scaledW + 6, scaledH + 6, 12 * scale, "#f6ecd8", "#d1ad6a");
    drawCardImage(ctx, { ...leftCard, imageX: lx - scaledW/2 + 4, imageY: ly - scaledH/2 + 4, imageW: scaledW - 8, imageH: scaledH - 30 * scale });
    fillRoundRect(ctx, lx - scaledW/2 + 2, ly + scaledH/2 - 26, scaledW - 4, 24, 6, "rgba(255, 249, 235, 0.96)", "#e2cc9c");
    text(ctx, short(displayName(leftCard), 4), lx, ly + scaledH/2 - 14, 9 * scale, "#3b2b18", "center");
    ctx.restore();
  }

  // 绘制中间的主卡牌
  {
    const mcx = centerCardX + offset; // 滑动时主卡牌跟随手指移动
    const mcy = cardsY;
    
    // 主卡牌外框（高亮边框）
    ctx.save();
    ctx.globalAlpha = 1 - Math.abs(progress) * 0.5;
    ctx.shadowColor = "rgba(43, 28, 12, 0.22)";
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 3;
    fillRoundRect(ctx, mcx - mainCardW/2 - 5, mcy - 5, mainCardW + 10, mainCardH + 10, 16, "#f6ecd8", card.hero ? "#f6d27a" : "#d1ad6a");
    ctx.restore();

    // 绘制卡牌图片
    ctx.save();
    ctx.globalAlpha = 1 - Math.abs(progress) * 0.3;
    const artPadding = 6;
    const artX = mcx - mainCardW/2 + artPadding;
    const artY = mcy + artPadding;
    const artW = mainCardW - artPadding * 2;
    const artH = mainCardH - artPadding * 2 - 28;
    drawCardImage(ctx, { ...card, imageX: artX, imageY: artY, imageW: artW, imageH: artH });

    // 卡牌名称
    const nameStripH = 26;
    fillRoundRect(ctx, mcx - mainCardW/2 + 4, mcy + mainCardH - nameStripH - 6, mainCardW - 8, nameStripH, 7, "rgba(255, 249, 235, 0.96)", "#e2cc9c");
    text(ctx, short(displayName(card), 7), mcx, mcy + mainCardH - nameStripH / 2 - 6, 13, "#2f2417", "center");

    // 战力icon
    if (card.strength != null) {
      const bs = 30;
      const bx = mcx - mainCardW/2 + 6;
      const by = mcy + 6;
      const isStrategy = card.category === "weather" || card.category === "special";
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.35)";
      ctx.shadowBlur = 4;
      ctx.shadowOffsetY = 1;
      fillRoundRect(ctx, bx, by, bs, bs, bs / 2, isStrategy ? "#7a5a95" : (card.hero ? "#b5892f" : "#8f3c1f"), "rgba(255,247,216,0.88)");
      ctx.restore();
      text(ctx, String(card.strength), bx + bs / 2, by + bs / 2, isStrategy ? 13 : 15, "#fff7d8", "center");
    }

    // 传世icon
    if (card.hero || card.abilities?.includes("Hero")) {
      const heroBadgeW = 36;
      const heroBadgeH = 18;
      const hx = mcx + mainCardW/2 - heroBadgeW - 8;
      const hy = mcy + 8;
      fillRoundRect(ctx, hx, hy, heroBadgeW, heroBadgeH, 9, "rgba(143,60,31,0.90)", "#f6d27a");
      text(ctx, "传世", hx + heroBadgeW / 2, hy + heroBadgeH / 2, 10, "#fff7d8", "center");
    }
    ctx.restore();
  }

  // 绘制右边的卡牌（当向左滑或准备向左滑时显示）
  if (rightCard) {
    const rightTargetX = centerCardX + mainCardW / 2 + cardGap + sideCardW / 2;
    const rightVisibleX = centerCardX + sideCardW / 2 + 20; // 预览位置
    // 当offset<0时，右边卡牌从预览位置滑入中心；否则在预览位置
    const rx = progress < 0 
      ? rightTargetX - (mainCardW / 2 + sideCardW / 2 + cardGap) * (1 + progress)
      : rightVisibleX;
    const ry = cardsCenterY - sideCardH / 2;
    const scale = progress < 0 ? 0.55 - 0.45 * progress : 0.55;
    const alpha = progress < 0 ? 0.55 - 0.45 * progress : 0.55;
    
    ctx.save();
    ctx.globalAlpha = alpha;
    const scaledW = sideCardW * scale;
    const scaledH = sideCardH * scale;
    fillRoundRect(ctx, rx - scaledW/2 - 3, ry - scaledH/2 - 3, scaledW + 6, scaledH + 6, 12 * scale, "#f6ecd8", "#d1ad6a");
    drawCardImage(ctx, { ...rightCard, imageX: rx - scaledW/2 + 4, imageY: ry - scaledH/2 + 4, imageW: scaledW - 8, imageH: scaledH - 30 * scale });
    fillRoundRect(ctx, rx - scaledW/2 + 2, ry + scaledH/2 - 26, scaledW - 4, 24, 6, "rgba(255, 249, 235, 0.96)", "#e2cc9c");
    text(ctx, short(displayName(rightCard), 4), rx, ry + scaledH/2 - 14, 9 * scale, "#3b2b18", "center");
    ctx.restore();
  }
  
  ctx.restore(); // 恢复裁剪

  // ===== 下方能力描述区 =====
  const detailY = cardsY + mainCardH + 14;
  const footerY = panelY + panelH - 16;
  const contentBottom = panelY + panelH - 38;
  sections.forEach(item => {
    if (detailY > contentBottom - 36) return;
    const bodyH = Math.min(wrappedHeight(ctx, item.content, sectionW - 24, 17, item.lines, 12), contentBottom - detailY - 28);
    if (bodyH <= 0) return;
    const boxH = bodyH + 30;
    fillRoundRect(ctx, panelX + 16, detailY, sectionW, boxH, 12, "#f8efd9", "#e1c58c");
    text(ctx, item.title, panelX + 28, detailY + 15, 12, item.color);
    wrapText(ctx, item.content, panelX + 28, detailY + 34, sectionW - 24, 17, item.lines, 12, "#3b2b18");
    detailY += boxH + 8;
  });

  text(ctx, options.closeHint || "点击空白处返回", panelX + panelW / 2, footerY, 11, "#8a785f", "center");
}

module.exports = { drawDetail };
