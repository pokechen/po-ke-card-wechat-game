function createCanvasAdapter() {
  const api = typeof wx !== "undefined" ? wx : null;
  const sourceCanvas = typeof canvas !== "undefined" ? canvas : api.createCanvas();
  const ctx = sourceCanvas.getContext("2d");
  const info = api && api.getSystemInfoSync ? api.getSystemInfoSync() : { windowWidth: 375, windowHeight: 667, pixelRatio: 1, safeArea: null };
  const dpr = info.pixelRatio || 1;
  sourceCanvas.width = Math.floor(info.windowWidth * dpr);
  sourceCanvas.height = Math.floor(info.windowHeight * dpr);
  ctx.scale(dpr, dpr);
  const safeArea = info.safeArea || { top: 0, bottom: info.windowHeight };
  return {
    canvas: sourceCanvas,
    ctx,
    width: info.windowWidth,
    height: info.windowHeight,
    dpr,
    safeTop: Math.max(12, safeArea.top || 0),
    safeBottom: Math.max(8, info.windowHeight - (safeArea.bottom || info.windowHeight))
  };
}

const FONT_STACK = "\"PingFang SC\", \"Hiragino Sans GB\", \"Microsoft YaHei\", sans-serif";
const THEME = {
  paper: "#f7f1e5",
  paperDeep: "#efe4cf",
  card: "#fffaf0",
  cardSoft: "#f8efd9",
  line: "#d8bd83",
  lineSoft: "#ead8ad",
  ink: "#2f2417",
  muted: "#775c34",
  green: "#2f6f57",
  greenDark: "#1d4f3c",
  brown: "#8d6840",
  rust: "#8f3c1f",
  blue: "#4f6d8a",
  purple: "#7a5a95",
  gold: "#f6d27a",
  creamText: "#fff7d8",
  shadow: "rgba(48, 35, 18, 0.15)"
};

function clear(ctx, width, height) {
  const bg = ctx.createLinearGradient ? ctx.createLinearGradient(0, 0, 0, height) : null;
  if (bg) {
    bg.addColorStop(0, THEME.paper);
    bg.addColorStop(0.58, "#fbf6eb");
    bg.addColorStop(1, THEME.paperDeep);
  }
  ctx.fillStyle = bg || THEME.paper;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "rgba(255,255,255,0.26)";
  ctx.fillRect(0, 0, width, Math.min(120, height));
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.max(0, Math.min(r || 0, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function fillRoundRect(ctx, x, y, w, h, r, fill, stroke) {
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function text(ctx, content, x, y, size, color, align) {
  ctx.fillStyle = color || THEME.ink;
  ctx.font = `${size || 14}px ${FONT_STACK}`;
  ctx.textAlign = align || "left";
  ctx.textBaseline = "middle";
  ctx.fillText(String(content || ""), x, y);
}

function short(content, max) {
  const value = String(content || "");
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function wrapText(ctx, content, x, y, maxWidth, lineHeight, maxLines, size, color) {
  const value = String(content || "");
  let lines = [];
  ctx.font = `${size || 13}px ${FONT_STACK}`;
  value.split(/\n+/).forEach(part => {
    let line = "";
    for (const ch of part) {
      const next = line + ch;
      if (ctx.measureText(next).width > maxWidth && line) {
        lines.push(line);
        line = ch;
      } else {
        line = next;
      }
    }
    if (line) lines.push(line);
  });
  if (maxLines && lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    lines[lines.length - 1] = short(lines[lines.length - 1], Math.max(1, lines[lines.length - 1].length - 1));
  }
  lines.forEach((item, index) => text(ctx, item, x, y + index * lineHeight, size, color));
  return lines.length * lineHeight;
}

function button(ctx, spec) {
  const radius = spec.r || Math.min(14, Math.floor(spec.h / 2));
  const fill = spec.fill || THEME.green;
  const stroke = spec.stroke || "rgba(38,28,18,0.22)";
  ctx.save();
  if (spec.shadow !== false) {
    ctx.shadowColor = spec.shadowColor || THEME.shadow;
    ctx.shadowBlur = spec.shadowBlur || 8;
    ctx.shadowOffsetY = spec.shadowOffsetY || 2;
  }
  fillRoundRect(ctx, spec.x, spec.y, spec.w, spec.h, radius, fill, stroke);
  ctx.restore();
  if (spec.gloss !== false && spec.h >= 26) {
    fillRoundRect(ctx, spec.x + 2, spec.y + 2, spec.w - 4, Math.max(8, Math.floor(spec.h * 0.38)), Math.max(4, radius - 2), "rgba(255,255,255,0.10)");
  }
  text(ctx, spec.label, spec.x + spec.w / 2, spec.y + spec.h / 2, spec.size || 16, spec.color || "#ffffff", "center");
}

const FACTION_COLORS = {
  "开国群雄": ["#315d8a", "#d7b25b"],
  "纵横权谋": ["#2f2b2b", "#c4a35a"],
  "百家争鸣": ["#2f6f57", "#d7b25b"],
  "草莽星火": ["#8a3f35", "#e5a85b"],
  "遗策复兴": ["#4f6d8a", "#d8c6a0"],
  "天下共识": ["#7a5a95", "#dcc48d"]
};

const FACTION_ART = {
  "开国群雄": "assets/card-art/开国群雄.webp",
  "纵横权谋": "assets/card-art/纵横权谋.webp",
  "百家争鸣": "assets/card-art/百家争鸣.webp",
  "草莽星火": "assets/card-art/草莽星火.webp",
  "遗策复兴": "assets/card-art/遗策复兴.webp",
  "天下共识": "assets/card-art/天下共识.webp"
};

const ROW_MARKS = {
  "疆场": "疆",
  "朝堂": "朝",
  "文脉": "文"
};

const imageCache = {};
const MAX_CARD_IMAGE_CACHE = 72;
let imageCacheTick = 0;
const STATIC_CARD_IMAGE_BASE_URL = "https://po-ke-card-d0gg2ewaac3e700c4-1302893388.tcloudbaseapp.com/po-ke-card";
let imageRenderHook = null;

function pruneCardImageCache() {
  const keys = Object.keys(imageCache).filter(key => {
    if (key.startsWith("asset:") || key.startsWith("remote:")) return false;
    const entry = imageCache[key];
    return entry?.loaded || entry?.failed;
  });
  const removeCount = keys.length - MAX_CARD_IMAGE_CACHE;
  if (removeCount <= 0) return;
  const entries = keys
    .map(key => ({ key, lastUsed: imageCache[key]?.lastUsed || 0 }))
    .sort((a, b) => a.lastUsed - b.lastUsed);
  for (let i = 0; i < removeCount; i++) delete imageCache[entries[i].key];
}

function setImageRenderHook(fn) {
  imageRenderHook = typeof fn === "function" ? fn : null;
}

function isSituationCategory(category) {
  return category === "时局" || category === "situation";
}

function isStratagemCategory(category) {
  return category === "谋略" || category === "策略" || category === "stratagem";
}

function isStrategyCategory(category) {
  return isSituationCategory(category) || isStratagemCategory(category);
}

function categoryMark(spec) {
  if (isSituationCategory(spec.category)) return "局";
  if (isStratagemCategory(spec.category)) return "谋";
  if (spec.category === "主将" || spec.category === "leader") return "";
  return "";
}

function categoryBadgeStyle(mark) {
  if (mark === "局") return ["rgba(79,109,138,0.88)", "rgba(255,247,216,0.72)"];
  if (mark === "谋" || mark === "策") return ["rgba(122,90,149,0.88)", "rgba(255,247,216,0.72)"];
  if (mark === "将") return ["rgba(47,111,87,0.90)", "rgba(255,247,216,0.72)"];
  if (mark === "传") return ["rgba(143,60,31,0.90)", THEME.gold];
  return ["rgba(38,28,18,0.70)", "rgba(255,247,216,0.60)"];
}

const ABILITY_MARKS = {
  "传世": "传世",
  "出使": "出使",
  "济世": "济世",
  "同盟": "同盟",
  "振势": "振势",
  "集贤": "集贤",
  "通才": "通才",
  "奇策": "奇策",
  "鼓舞": "鼓舞",
  "召唤岳家军": "召唤",
  "召唤无当飞军": "召唤",
  "召唤东吴水师": "召唤",
  "蛰伏": "蛰伏",
  "雪耻": "雪耻"
};

function abilityIconLabel(label) {
  const value = String(label || "").trim();
  if (!value) return "";
  if (value.startsWith("召唤")) return "召唤";
  return /^[\u4e00-\u9fff]+$/.test(value) && value.length > 2 ? value.slice(0, 2) : value;
}

function abilityMark(spec) {
  if (isStrategyCategory(spec.category)) return "";
  const labels = (spec.abilityDisplayNames && spec.abilityDisplayNames.length)
    ? spec.abilityDisplayNames
    : (spec.abilities || []).map(name => ABILITY_MARKS[name] || name);
  const label = labels.filter(Boolean).find(item => item !== "传世") || "";
  return abilityIconLabel(label);
}

function abilityBadgeStyle(label) {
  if (label === "出使") return ["rgba(79,109,138,0.92)", "rgba(255,247,216,0.76)"];
  if (label === "济世") return ["rgba(47,111,87,0.92)", "rgba(255,247,216,0.76)"];
  if (label === "奇策") return ["rgba(143,60,31,0.92)", "rgba(255,247,216,0.76)"];
  if (label === "鼓舞") return ["rgba(181,137,47,0.94)", "rgba(255,247,216,0.78)"];
  return ["rgba(38,28,18,0.78)", "rgba(255,247,216,0.62)"];
}

function compactBadgeLabel(label, w) {
  const max = w < 52 ? 2 : (w < 74 ? 3 : 4);
  const value = String(label || "");
  return value.length > max ? value.slice(0, max) : value;
}

function drawImageBadge(ctx, label, x, y, w, h, radius, fill, stroke) {
  if (!label) return;
  fillRoundRect(ctx, x, y, w, h, radius, fill, stroke);
  text(ctx, label, x + w / 2, y + h / 2 + 0.5, Math.min(10, h - 4), THEME.creamText, "center");
}

function heroFrameStroke(ctx, x, y, w, h, r, strong = false) {
  const gradient = ctx.createLinearGradient ? ctx.createLinearGradient(x, y, x + w, y + h) : null;
  if (gradient) {
    gradient.addColorStop(0, "#fff7b8");
    gradient.addColorStop(0.28, "#f4b63d");
    gradient.addColorStop(0.68, "#0e2d4f");
    gradient.addColorStop(1, "#78d6ff");
  }
  ctx.save();
  ctx.shadowColor = "rgba(255, 202, 61, 0.78)";
  ctx.shadowBlur = strong ? 18 : 11;
  ctx.lineWidth = strong ? 4 : 3;
  ctx.strokeStyle = gradient || "#f4b63d";
  roundRect(ctx, x, y, w, h, r);
  ctx.stroke();
  ctx.shadowBlur = 0;
  if (w > 10 && h > 10) {
    ctx.lineWidth = strong ? 2 : 1.4;
    ctx.strokeStyle = "rgba(15, 32, 54, 0.96)";
    roundRect(ctx, x + 2, y + 2, w - 4, h - 4, Math.max(0, r - 2));
    ctx.stroke();
  }
  if (w > 16 && h > 16) {
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(255, 252, 218, 0.96)";
    roundRect(ctx, x + 4, y + 4, w - 8, h - 8, Math.max(0, r - 4));
    ctx.stroke();
  }
  ctx.restore();
}

function drawHeroCornerMarks(ctx, x, y, w, h) {
  const len = Math.max(8, Math.min(18, Math.floor(Math.min(w, h) * 0.22)));
  ctx.save();
  ctx.lineCap = "round";
  [[x + 5, y + 5, 1, 1], [x + w - 5, y + 5, -1, 1], [x + 5, y + h - 5, 1, -1], [x + w - 5, y + h - 5, -1, -1]].forEach(([cx, cy, sx, sy]) => {
    ctx.strokeStyle = "rgba(255, 224, 104, 0.98)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx, cy + sy * len);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx + sx * len, cy);
    ctx.stroke();
    ctx.strokeStyle = "rgba(108, 211, 255, 0.95)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(cx + sx * 3, cy + sy * (len - 3));
    ctx.lineTo(cx + sx * 3, cy + sy * 3);
    ctx.lineTo(cx + sx * (len - 3), cy + sy * 3);
    ctx.stroke();
  });
  ctx.restore();
}

function defaultImageUrl(spec) {
  if (spec.category === "situation" || spec.category === "时局") return "assets/card-art/situation.webp";
  if (spec.category === "stratagem" || spec.category === "谋略") return "assets/card-art/stratagem.webp";
  return FACTION_ART[spec.faction] || FACTION_ART["天下共识"];
}

function cleanCardImageFileName(fileName) {
  return String(fileName || "")
    .trim()
    .replace(/^特殊卡牌_/, "")
    .replace(/^领袖牌_/, "")
    .replace(/^单位牌_/, "")
    .replace(/^[^_/]+阵营_/, "");
}

function normalizeWebpFileName(fileName) {
  const value = cleanCardImageFileName(fileName).replace(/[：:].*$/, "");
  if (!value || value === ".webp") return "";
  return /\.[^/.]+$/.test(value) ? value.replace(/\.[^/.]+$/, ".webp") : `${value}.webp`;
}

function staticCardImageUrl(fileName) {
  const normalizedFileName = normalizeWebpFileName(fileName);
  return normalizedFileName ? encodeURI(`${STATIC_CARD_IMAGE_BASE_URL}/${normalizedFileName}`) : "";
}

function cardImageFileNames(spec) {
  return [spec.name]
    .map(normalizeWebpFileName)
    .filter((fileName, index, arr) => fileName && arr.indexOf(fileName) === index);
}

function imageSources(spec) {
  const fileNames = cardImageFileNames(spec);
  return [...fileNames.map(staticCardImageUrl), defaultImageUrl(spec)].filter((src, index, arr) => src && arr.indexOf(src) === index);
}

function createLocalImage(sources) {
  const api = typeof wx !== "undefined" ? wx : null;
  const sourceCanvas = typeof canvas !== "undefined" ? canvas : null;
  const img = api && api.createImage ? api.createImage()
    : (sourceCanvas && sourceCanvas.createImage ? sourceCanvas.createImage()
    : (typeof Image !== "undefined" ? new Image() : null));
  const queue = (Array.isArray(sources) ? sources : [sources]).filter(Boolean);
  if (!img || !queue.length) return { failed: true };
  const entry = { img, loaded: false, failed: false, currentSrc: "", sourceIndex: 0 };
  const markFailed = reason => {
    entry.failed = true;
    if (typeof console !== "undefined" && console.warn) {
      console.warn("[card-image] load failed", { sources: queue, currentSrc: entry.currentSrc, reason });
    }
    if (imageRenderHook) imageRenderHook();
  };
  const loadSource = index => {
    const src = queue[index];
    entry.sourceIndex = index;
    entry.loaded = false;
    entry.currentSrc = src;
    img.onload = () => {
      entry.loaded = true;
      if (imageRenderHook) imageRenderHook();
    };
    img.onerror = () => {
      if (index + 1 < queue.length) {
        loadSource(index + 1);
        return;
      }
      markFailed("image onerror");
    };
    img.src = src;
  };

  loadSource(0);
  return entry;
}

function drawAssetImage(ctx, src, x, y, w, h, options = {}) {
  const entry = src ? (imageCache[`asset:${src}`] || (imageCache[`asset:${src}`] = createLocalImage(src))) : null;
  const radius = options.radius || 0;
  const fit = options.fit || "cover";
  ctx.save();
  if (options.alpha != null) ctx.globalAlpha *= options.alpha;
  if (entry && entry.loaded && !entry.failed) {
    if (radius) {
      roundRect(ctx, x, y, w, h, radius);
      ctx.clip();
    }
    const iw = entry.img.width || w;
    const ih = entry.img.height || h;
    const scale = fit === "contain" ? Math.min(w / iw, h / ih) : Math.max(w / iw, h / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    ctx.drawImage(entry.img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  } else if (options.placeholder !== false) {
    fillRoundRect(ctx, x, y, w, h, radius, options.fill || THEME.cardSoft, options.stroke || THEME.lineSoft);
  }
  ctx.restore();
  return Boolean(entry && entry.loaded && !entry.failed);
}

function drawGeneratedCardArt(ctx, spec, x, y, w, h) {
  const hero = isHeroSpec(spec);
  const palette = FACTION_COLORS[spec.faction] || FACTION_COLORS["天下共识"];
  const fill = ctx.createLinearGradient ? ctx.createLinearGradient(x, y, x + w, y + h) : null;
  if (fill) {
    fill.addColorStop(0, palette[0]);
    fill.addColorStop(1, palette[1]);
  }
  fillRoundRect(ctx, x, y, w, h, Math.min(9, Math.floor(h / 4)), fill || palette[0], hero ? "#f6d27a" : "#c6954b");
  if (hero) {
    ctx.fillStyle = "rgba(255, 240, 170, 0.14)";
    ctx.fillRect(x, y, w, h);
  }
  ctx.fillStyle = "rgba(255,255,255,0.16)";
  ctx.fillRect(x + w * 0.08, y + h * 0.12, w * 0.24, h * 0.76);
  ctx.fillRect(x + w * 0.58, y + h * 0.12, w * 0.1, h * 0.76);
  text(ctx, short(spec.name, 1), x + w / 2, y + h / 2, Math.max(18, Math.min(32, h * 0.58)), "#fff7d8", "center");
}

function isHeroSpec(spec) {
  const abilities = Array.isArray(spec?.abilityDisplayNames) && spec.abilityDisplayNames.length
    ? spec.abilityDisplayNames
    : (Array.isArray(spec?.abilities) ? spec.abilities : []);
  return abilities.includes("传世");
}

function squareImageRect(spec) {
  const rawX = spec.imageX == null ? spec.x + 5 : spec.imageX;
  const rawY = spec.imageY == null ? spec.y + 5 : spec.imageY;
  const rawW = spec.imageW == null ? spec.w - 10 : spec.imageW;
  const rawH = spec.imageH == null ? Math.max(24, Math.floor(spec.h * 0.42)) : spec.imageH;
  if (spec.imageFill) {
    return { x: rawX, y: rawY, w: Math.max(1, rawW), h: Math.max(1, rawH) };
  }
  const size = Math.max(1, Math.min(rawW, rawH));
  return {
    x: rawX + (rawW - size) / 2,
    y: rawY + (rawH - size) / 2,
    w: size,
    h: size
  };
}

function drawCardImage(ctx, spec) {
  const hero = isHeroSpec(spec);
  const { x, y, w, h } = squareImageRect(spec);
  const sources = imageSources(spec);
  const cacheKey = sources.join("|");
  const cached = cacheKey ? imageCache[cacheKey] : null;
  const entry = cacheKey ? (cached || (spec.skipImageLoad ? null : (imageCache[cacheKey] = createLocalImage(sources)))) : null;
  if (entry) {
    entry.lastUsed = ++imageCacheTick;
    if (imageCacheTick % 24 === 0) pruneCardImageCache();
  }
  const radius = Math.min(10, Math.floor(h / 4));
  const border = hero ? "#f0b83f" : "rgba(198,149,75,0.86)";
  ctx.save();
  ctx.shadowColor = hero ? "rgba(246, 210, 122, 0.36)" : "rgba(43, 28, 12, 0.14)";
  ctx.shadowBlur = hero ? Math.min(12, Math.max(5, h / 8)) : Math.min(8, Math.max(3, h / 12));
  ctx.shadowOffsetY = 1;
  fillRoundRect(ctx, x, y, w, h, radius, "#1f1a14", border);
  ctx.restore();
  if (entry && entry.loaded && !entry.failed) {
    ctx.save();
    roundRect(ctx, x, y, w, h, radius);
    ctx.clip();
    const iw = entry.img.width || w;
    const ih = entry.img.height || h;
    if (spec.imageFill && iw && ih) {
      const scale = Math.max(w / iw, h / ih);
      const dw = iw * scale;
      const dh = ih * scale;
      ctx.drawImage(entry.img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
    } else {
      ctx.drawImage(entry.img, x, y, w, h);
    }
    ctx.fillStyle = hero ? "rgba(255, 242, 170, 0.14)" : "rgba(255,255,255,0.08)";
    ctx.fillRect(x, y, w, Math.max(4, h * 0.22));
    if (hero) {
      ctx.fillStyle = "rgba(255, 217, 90, 0.12)";
      ctx.fillRect(x, y, w, h);
    }
    ctx.restore();
  } else {
    drawGeneratedCardArt(ctx, spec, x, y, w, h);
  }

  if (hero) {
    heroFrameStroke(ctx, x + 0.5, y + 0.5, w - 1, h - 1, radius, w >= 80 || h >= 100);
    if (w >= 44 && h >= 58) drawHeroCornerMarks(ctx, x, y, w, h);
  }

  const rows = (spec.row || []).map(row => ROW_MARKS[row]).filter(Boolean).join("");
  if (rows) {
    drawImageBadge(ctx, rows, x + 4, y + h - 18, Math.max(20, rows.length * 11 + 8), 14, 7, "rgba(38,28,18,0.68)", "rgba(255,247,216,0.22)");
  }
  const ability = abilityMark(spec);
  const mark = categoryMark(spec);
  const topLabel = compactBadgeLabel(ability || mark, w);
  if (topLabel && topLabel !== rows) {
    const badgeW = Math.min(w - 8, Math.max(18, topLabel.length * 11 + 8));
    const [fill, stroke] = ability ? abilityBadgeStyle(ability) : categoryBadgeStyle(mark);
    drawImageBadge(ctx, topLabel, x + w - badgeW - 4, y + 4, badgeW, 17, 8.5, fill, stroke);
  }
}

function card(ctx, spec) {
  const hero = isHeroSpec(spec);
  const stroke = hero ? "#f4b63d" : (spec.stroke || "#b98a45");
  ctx.save();
  ctx.shadowColor = hero ? "rgba(255, 202, 61, 0.55)" : "rgba(43, 28, 12, 0.16)";
  ctx.shadowBlur = hero ? 16 : 8;
  ctx.shadowOffsetY = 2;
  fillRoundRect(ctx, spec.x, spec.y, spec.w, spec.h, 11, spec.fill || (hero ? "#20170d" : THEME.card), stroke);
  ctx.restore();
  if (spec.selectedCount > 0) {
    ctx.save();
    ctx.shadowColor = "rgba(47,111,87,0.42)";
    ctx.shadowBlur = 10;
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#2f6f57";
    roundRect(ctx, spec.x + 1.5, spec.y + 1.5, spec.w - 3, spec.h - 3, 11);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = "rgba(255,247,216,0.92)";
    roundRect(ctx, spec.x + 5, spec.y + 5, spec.w - 10, spec.h - 10, 8);
    ctx.stroke();
    ctx.restore();
  }
  const pad = hero ? 5 : 4;
  const stripH = 17;
  const artX = spec.x + pad;
  const artY = spec.y + pad;
  const artW = spec.w - pad * 2;
  const artH = spec.h - pad - stripH - 3;
  drawCardImage(ctx, { ...spec, imageFill: true, imageX: artX, imageY: artY, imageW: artW, imageH: artH });
  if (spec.selectedCount > 0) {
    const maskR = Math.min(10, Math.floor(artH / 8));
    ctx.save();
    roundRect(ctx, artX, artY, artW, artH, maskR);
    ctx.clip();
    ctx.fillStyle = "rgba(34, 34, 34, 0.44)";
    ctx.fillRect(artX, artY, artW, artH);
    ctx.fillStyle = "rgba(255, 255, 255, 0.14)";
    ctx.fillRect(artX, artY, artW, Math.max(12, artH * 0.28));
    ctx.restore();
    const label = spec.selectedCount > 1 ? `已选x${spec.selectedCount}` : "已选";
    const labelW = Math.min(artW - 10, Math.max(40, label.length * 12 + 16));
    const labelH = 24;
    fillRoundRect(ctx, artX + (artW - labelW) / 2, artY + (artH - labelH) / 2, labelW, labelH, 12, "rgba(47,111,87,0.94)", "rgba(255,247,216,0.92)");
    text(ctx, label, artX + artW / 2, artY + artH / 2 + 1, 12, THEME.creamText, "center");
  }
  const nameW = spec.w - 4;
  const nameFill = hero ? "rgba(31, 23, 13, 0.98)" : "rgba(255, 249, 235, 0.96)";
  const nameStroke = hero ? "#f4b63d" : "#e2cc9c";
  const nameColor = hero ? "#fff1a8" : "#3b2b18";
  fillRoundRect(ctx, spec.x + 2, spec.y + spec.h - stripH - 1, nameW, stripH, 6, nameFill, nameStroke);
  text(ctx, short(spec.name, spec.nameMax || 4), spec.x + spec.w / 2, spec.y + spec.h - stripH / 2 - 1, 10, nameColor, "center");
  const isStrategy = isStrategyCategory(spec.category) || spec.strength === "策" || spec.strength === "局" || spec.strength === "谋";
  if (!isStrategy) {
    const bs = 22;
    fillRoundRect(ctx, spec.x + 3, spec.y + 3, bs, bs, bs / 2, hero ? "#1f2f4f" : THEME.rust, hero ? "#f4b63d" : "rgba(255,247,216,0.88)");
    text(ctx, String(spec.strength == null ? "-" : spec.strength), spec.x + 3 + bs / 2, spec.y + 3 + bs / 2, 13, hero ? "#ffe27a" : THEME.creamText, "center");
  }
  if (spec.count > 1) {
    const label = `x${spec.count}`;
    const badgeW = Math.min(spec.w - 8, Math.max(24, label.length * 8 + 10));
    const badgeH = 17;
    const bx = spec.x + spec.w - badgeW - 4;
    const by = spec.y + spec.h - stripH - badgeH - 5;
    fillRoundRect(ctx, bx, by, badgeW, badgeH, 8.5, "rgba(47,111,87,0.94)", "rgba(255,247,216,0.84)");
    text(ctx, label, bx + badgeW / 2, by + badgeH / 2 + 0.5, 10, THEME.creamText, "center");
  }
  if (spec.selectedCount > 0) {
    const label = spec.selectedCount > 1 ? `已${spec.selectedCount}` : "已选";
    const badgeW = Math.min(spec.w - 8, Math.max(28, label.length * 10 + 10));
    const badgeH = 18;
    const bx = spec.x + 4;
    const by = spec.y + spec.h - stripH - badgeH - 5;
    fillRoundRect(ctx, bx, by, badgeW, badgeH, 9, "rgba(47,111,87,0.96)", "rgba(255,247,216,0.92)");
    text(ctx, label, bx + badgeW / 2, by + badgeH / 2 + 0.5, 10, THEME.creamText, "center");
  }
  if (hero) heroFrameStroke(ctx, spec.x + 1, spec.y + 1, spec.w - 2, spec.h - 2, 10, true);
}

function drawRemoteImage(ctx, url, x, y, w, h, options = {}) {
  if (!url) return false;
  const key = `remote:${url}`;
  const entry = imageCache[key] || (imageCache[key] = createLocalImage([url]));
  entry.lastUsed = ++imageCacheTick;
  const radius = options.radius || 0;
  ctx.save();
  if (options.alpha != null) ctx.globalAlpha *= options.alpha;
  if (entry.loaded) {
    if (radius) {
      roundRect(ctx, x, y, w, h, radius);
      ctx.clip();
    }
    ctx.drawImage(entry.img, x, y, w, h);
    ctx.restore();
    return true;
  }
  if (entry.failed && typeof options.onFail === "function") {
    ctx.restore();
    options.onFail();
    return false;
  }
  ctx.restore();
  return false;
}

function drawTopLeftBack(ctx, view, actions, id = "back", options = {}) {
  const rect = {
    id,
    x: options.x == null ? 18 : options.x,
    y: options.y == null ? view.safeTop + 14 : options.y,
    w: options.w || 48,
    h: options.h || 42
  };
  actions.push({ ...rect, ...options.action });
  const color = options.color || "#6f4d29";
  const x = rect.x;
  const y = rect.y;
  const cy = y + rect.h / 2;
  ctx.save();
  ctx.fillStyle = color;
  ctx.shadowColor = "rgba(48, 35, 18, 0.14)";
  ctx.shadowBlur = 3;
  ctx.shadowOffsetY = 1;
  ctx.beginPath();
  ctx.moveTo(x + 6, cy);
  ctx.lineTo(x + 24, cy - 15);
  ctx.quadraticCurveTo(x + 27, cy - 18, x + 27, cy - 13);
  ctx.lineTo(x + 27, cy - 8);
  ctx.bezierCurveTo(x + 39, cy - 8, x + 44, cy + 1, x + 38, cy + 13);
  ctx.bezierCurveTo(x + 34, cy + 6, x + 30, cy + 5, x + 27, cy + 5);
  ctx.lineTo(x + 27, cy + 13);
  ctx.quadraticCurveTo(x + 27, cy + 18, x + 24, cy + 15);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  return rect;
}

function hit(point, rect) {
  return point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h;
}

module.exports = {
  createCanvasAdapter,
  clear,
  fillRoundRect,
  text,
  wrapText,
  short,
  button,
  setImageRenderHook,
  drawAssetImage,
  drawRemoteImage,
  drawCardImage,
  drawTopLeftBack,
  card,
  hit
};
