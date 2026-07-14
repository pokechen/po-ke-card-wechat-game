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
  "Northern Realms": ["#315d8a", "#d7b25b"],
  "Nilfgaardian Empire": ["#2f2b2b", "#c4a35a"],
  "Scoia'tael": ["#2f6f57", "#d7b25b"],
  Monsters: ["#8a3f35", "#e5a85b"],
  Skellige: ["#4f6d8a", "#d8c6a0"],
  Neutral: ["#7a5a95", "#dcc48d"]
};

const FACTION_ART = {
  "Northern Realms": "assets/card-art/northern.webp",
  "Nilfgaardian Empire": "assets/card-art/nilfgaard.webp",
  "Scoia'tael": "assets/card-art/scoiatael.webp",
  Monsters: "assets/card-art/monsters.webp",
  Skellige: "assets/card-art/skellige.webp",
  Neutral: "assets/card-art/neutral.webp"
};

const ROW_MARKS = {
  melee: "疆",
  ranged: "朝",
  siege: "文"
};

const imageCache = {};
const STATIC_CARD_IMAGE_BASE_URL = "https://po-ke-card-d0gg2ewaac3e700c4-1302893388.tcloudbaseapp.com/po-ke-card";
let imageRenderHook = null;

function setImageRenderHook(fn) {
  imageRenderHook = typeof fn === "function" ? fn : null;
}

function categoryMark(spec) {
  if (spec.category === "时局" || spec.category === "weather") return "局";
  if (spec.category === "谋略" || spec.category === "special") return "策";
  if (spec.category === "主将" || spec.category === "leader") return "";
  if (spec.hero || spec.category === "传世" || spec.category === "hero") return "传";
  return "";
}

function categoryBadgeStyle(mark) {
  if (mark === "局") return ["rgba(79,109,138,0.88)", "rgba(255,247,216,0.72)"];
  if (mark === "策") return ["rgba(122,90,149,0.88)", "rgba(255,247,216,0.72)"];
  if (mark === "将") return ["rgba(47,111,87,0.90)", "rgba(255,247,216,0.72)"];
  if (mark === "传") return ["rgba(143,60,31,0.90)", THEME.gold];
  return ["rgba(38,28,18,0.70)", "rgba(255,247,216,0.60)"];
}

const ABILITY_MARKS = {
  Hero: "传世",
  Spy: "出使",
  Medic: "济世",
  "Tight Bond": "同盟",
  "Morale Boost": "振势",
  Muster: "集贤",
  Agile: "通才",
  Scorch: "奇策",
  "Commander's Horn": "号令",
  "Summon Shield Maidens": "召唤盾女",
  "Summon Avenger": "召唤复仇者",
  "Summon Sky Hound": "召唤啸天",
  Berserker: "奋起",
  Mardroeme: "破釜"
};

function abilityMark(spec) {
  const labels = (spec.abilityDisplayNames && spec.abilityDisplayNames.length)
    ? spec.abilityDisplayNames
    : (spec.abilities || []).map(name => ABILITY_MARKS[name] || name);
  return labels.filter(Boolean).find(label => label !== "传世") || "";
}

function abilityBadgeStyle(label) {
  if (label === "出使") return ["rgba(79,109,138,0.92)", "rgba(255,247,216,0.76)"];
  if (label === "济世") return ["rgba(47,111,87,0.92)", "rgba(255,247,216,0.76)"];
  if (label === "奇策") return ["rgba(143,60,31,0.92)", "rgba(255,247,216,0.76)"];
  if (label === "号令") return ["rgba(181,137,47,0.94)", "rgba(255,247,216,0.78)"];
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

function defaultImageUrl(spec) {
  if (spec.category === "weather" || spec.category === "时局") return "assets/card-art/weather.webp";
  if (spec.category === "special" || spec.category === "谋略") return "assets/card-art/special.webp";
  return FACTION_ART[spec.faction] || FACTION_ART.Neutral;
}

function fileNameFromImageUrl(imageUrl) {
  const value = String(imageUrl || "");
  if (!value || /Tw3_gwent|gwent/i.test(value)) return "";
  const cleanValue = value.split("?")[0].split("#")[0];
  const fileName = cleanValue.split("/").filter(Boolean).pop() || "";
  try {
    return decodeURIComponent(fileName);
  } catch (err) {
    return fileName;
  }
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

function staticCardImageUrl(spec) {
  const rawFileName = fileNameFromImageUrl(spec.imageUrl) || `${spec.baseName || spec.name || ""}.webp`;
  const fileName = normalizeWebpFileName(rawFileName);
  return fileName ? encodeURI(`${STATIC_CARD_IMAGE_BASE_URL}/${fileName}`) : "";
}

function imageSources(spec) {
  return [staticCardImageUrl(spec), defaultImageUrl(spec)].filter((src, index, arr) => src && arr.indexOf(src) === index);
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
  const palette = FACTION_COLORS[spec.faction] || FACTION_COLORS.Neutral;
  const fill = ctx.createLinearGradient ? ctx.createLinearGradient(x, y, x + w, y + h) : null;
  if (fill) {
    fill.addColorStop(0, palette[0]);
    fill.addColorStop(1, palette[1]);
  }
  fillRoundRect(ctx, x, y, w, h, Math.min(9, Math.floor(h / 4)), fill || palette[0], spec.hero ? "#f6d27a" : "#c6954b");
  ctx.fillStyle = "rgba(255,255,255,0.16)";
  ctx.fillRect(x + w * 0.08, y + h * 0.12, w * 0.24, h * 0.76);
  ctx.fillRect(x + w * 0.58, y + h * 0.12, w * 0.1, h * 0.76);
  text(ctx, short(spec.name || spec.baseName, 1), x + w / 2, y + h / 2, Math.max(18, Math.min(32, h * 0.58)), "#fff7d8", "center");
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
  const { x, y, w, h } = squareImageRect(spec);
  const sources = imageSources(spec);
  const cacheKey = sources.join("|");
  const entry = cacheKey ? (imageCache[cacheKey] || (imageCache[cacheKey] = createLocalImage(sources))) : null;
  const radius = Math.min(10, Math.floor(h / 4));
  const border = spec.hero ? THEME.gold : "rgba(198,149,75,0.86)";
  ctx.save();
  ctx.shadowColor = "rgba(43, 28, 12, 0.14)";
  ctx.shadowBlur = Math.min(8, Math.max(3, h / 12));
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
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(x, y, w, Math.max(4, h * 0.22));
    ctx.restore();
  } else {
    drawGeneratedCardArt(ctx, spec, x, y, w, h);
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
  const stroke = spec.hero ? THEME.gold : (spec.stroke || "#b98a45");
  ctx.save();
  ctx.shadowColor = "rgba(43, 28, 12, 0.16)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 2;
  fillRoundRect(ctx, spec.x, spec.y, spec.w, spec.h, 11, spec.fill || THEME.card, stroke);
  ctx.restore();
  const pad = 4;
  const stripH = 17;
  const artX = spec.x + pad;
  const artY = spec.y + pad;
  const artW = spec.w - pad * 2;
  const artH = spec.h - pad - stripH - 3;
  drawCardImage(ctx, { ...spec, imageFill: true, imageX: artX, imageY: artY, imageW: artW, imageH: artH });
  const nameW = spec.w - 4;
  fillRoundRect(ctx, spec.x + 2, spec.y + spec.h - stripH - 1, nameW, stripH, 6, "rgba(255, 249, 235, 0.96)", "#e2cc9c");
  text(ctx, short(spec.name, spec.nameMax || 4), spec.x + spec.w / 2, spec.y + spec.h - stripH / 2 - 1, 10, "#3b2b18", "center");
  const isStrategy = spec.strength === "策" || spec.strength === "局" || spec.category === "weather" || spec.category === "special" || spec.category === "谋略" || spec.category === "时局";
  const bs = 22;
  fillRoundRect(ctx, spec.x + 3, spec.y + 3, bs, bs, bs / 2, isStrategy ? THEME.purple : (spec.hero ? "#b5892f" : THEME.rust), "rgba(255,247,216,0.88)");
  text(ctx, String(spec.strength == null ? "-" : spec.strength), spec.x + 3 + bs / 2, spec.y + 3 + bs / 2, isStrategy ? 11 : 13, THEME.creamText, "center");
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
  drawCardImage,
  card,
  hit
};
