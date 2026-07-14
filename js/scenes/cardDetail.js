const { fillRoundRect, wrapText, short, drawCardImage, text } = require("../ui/canvas");
const { cardSummary, displayName, abilityDescriptions } = require("../core/cards");

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

function hasChineseText(content) {
  return /[\u4e00-\u9fff]/.test(String(content || ""));
}

function cleanEffectText(content) {
  const value = String(content || "")
    .replace(/，系统会选择或让你选择收益最高的位置[。，]?\s*$/, "")
    .trim();
  if (!value || !hasChineseText(value)) return "";
  if (["人物", "谋略", "主将技能", "无特殊能力"].includes(value)) return "";
  if (/^普通人物[：:]/.test(value) || /提供基础影响力/.test(value)) return "";
  return value;
}

function effectSections(card) {
  const effects = abilityDescriptions(card).map(cleanEffectText).filter(Boolean);
  if (!effects.length) {
    const fallback = cleanEffectText(card?.abilityText || (card?.category === "leader" || card?.category === "weather" || card?.category === "special" ? cardSummary(card) : ""));
    if (fallback) effects.push(fallback);
  }
  return effects.length ? [{ title: "特殊效果", content: effects.join("\n"), color: "#f1d58a", lines: 8 }] : [];
}

function drawSidePreview(ctx, sideCard, cx, y, w, h, alpha) {
  if (!sideCard) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  fillRoundRect(ctx, cx - w / 2 - 4, y - 4, w + 8, h + 8, 14, "rgba(255,244,215,0.96)", "#d1ad6a");
  drawCardImage(ctx, { ...sideCard, imageX: cx - w / 2 + 5, imageY: y + 5, imageW: w - 10, imageH: h - 34 });
  fillRoundRect(ctx, cx - w / 2 + 4, y + h - 27, w - 8, 23, 7, "rgba(255,249,235,0.96)", "#e2cc9c");
  text(ctx, short(displayName(sideCard), 5), cx, y + h - 15, 10, "#3b2b18", "center");
  ctx.restore();
}

function drawDetail(ctx, view, actions, card, options = {}) {
  const { leftCard, rightCard, swipeOffset = 0 } = options || {};
  const panelW = Math.min(view.width - 28, 372);
  const panelX = (view.width - panelW) / 2;

  const contentW = panelW - 32;
  const sections = effectSections(card);
  const sectionW = contentW;
  let sectionsH = 0;
  sections.forEach(item => {
    sectionsH += 28 + wrappedHeight(ctx, item.content, sectionW - 24, 17, item.lines, 12) + 8;
  });

  // 布局参数
  const headerH = 44;
  const sideCardW = 110;
  const sideCardH = 162;
  const mainCardW = 160;
  const mainCardH = 220;
  const sideDistance = 118;
  const nameAreaH = 18;

  const maxPanelH = view.height - view.safeTop - view.safeBottom - 80;
  const panelH = Math.min(maxPanelH, Math.max(420, headerH + 16 + mainCardH + 12 + nameAreaH + 16 + sectionsH + 40));
  const panelY = Math.max(view.safeTop + 36, Math.floor((view.height - view.safeBottom - panelH) / 2));

  const cardsY = panelY + headerH + 14;

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
  text(ctx, options.title || "卡牌详情", panelX + 22, panelY + 26, 17, "#2f2417");

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
  ctx.rect(panelX - 42, cardsY - 10, panelW + 84, mainCardH + 20);
  ctx.clip();

  // 绘制左右相邻卡牌：保持较大尺寸，露出完整图片区域
  if (leftCard) {
    const leftEnter = Math.max(0, progress);
    const lx = centerCardX - sideDistance + sideDistance * leftEnter;
    const ly = cardsCenterY - sideCardH / 2;
    const scale = 0.78 + 0.22 * leftEnter;
    drawSidePreview(ctx, leftCard, lx, ly, sideCardW * scale, sideCardH * scale, 0.58 + 0.32 * leftEnter);
  }
  if (rightCard) {
    const rightEnter = Math.max(0, -progress);
    const rx = centerCardX + sideDistance - sideDistance * rightEnter;
    const ry = cardsCenterY - sideCardH / 2;
    const scale = 0.78 + 0.22 * rightEnter;
    drawSidePreview(ctx, rightCard, rx, ry, sideCardW * scale, sideCardH * scale, 0.58 + 0.32 * rightEnter);
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
      const displayStrength = card.effective != null && card.effective !== card.strength ? card.effective : card.strength;
      const boosted = !isStrategy && card.effective != null && card.effective > (card.strength || 0);
      const reduced = !isStrategy && card.effective != null && card.effective < (card.strength || 0);
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.35)";
      ctx.shadowBlur = 4;
      ctx.shadowOffsetY = 1;
      const badgeFill = isStrategy ? "#7a5a95"
        : (boosted ? "#2f6f57" : (reduced ? "#c0392b" : (card.hero ? "#b5892f" : "#8f3c1f")));
      fillRoundRect(ctx, bx, by, bs, bs, bs / 2, badgeFill, "rgba(255,247,216,0.88)");
      ctx.restore();
      text(ctx, String(displayStrength), bx + bs / 2, by + bs / 2, isStrategy ? 13 : 15, "#fff7d8", "center");
    }
    ctx.restore();
  }

  ctx.restore(); // 恢复裁剪

  // ===== 下方能力描述区 =====
  let detailY = cardsY + mainCardH + 14;
  const footerY = panelY + panelH - 16;
  const contentBottom = panelY + panelH - 38;
  sections.forEach(item => {
    if (detailY > contentBottom - 36) return;
    const bodyH = Math.min(wrappedHeight(ctx, item.content, sectionW - 24, 17, item.lines, 12), contentBottom - detailY - 28);
    if (bodyH <= 0) return;
    const boxH = bodyH + 30;
    fillRoundRect(ctx, panelX + 16, detailY, sectionW, boxH, 10, "rgba(43, 34, 24, 0.92)", "#b98b48");
    text(ctx, item.title, panelX + 28, detailY + 15, 12, item.color);
    wrapText(ctx, item.content, panelX + 28, detailY + 34, sectionW - 24, 17, item.lines, 12, "#fff7d8");
    detailY += boxH + 8;
  });

  const footerHint = leftCard || rightCard ? `左右滑动切换 · ${options.closeHint || "点击空白处返回"}` : (options.closeHint || "点击空白处返回");
  text(ctx, footerHint, panelX + panelW / 2, footerY, 11, "#8a785f", "center");
}

module.exports = { drawDetail };
