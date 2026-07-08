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

function clear(ctx, width, height) {
  ctx.fillStyle = "#f7f3e8";
  ctx.fillRect(0, 0, width, height);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
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
  ctx.fillStyle = color || "#2f2417";
  ctx.font = `${size || 14}px sans-serif`;
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
  let line = "";
  let lines = [];
  ctx.font = `${size || 13}px sans-serif`;
  for (const ch of value) {
    const next = line + ch;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = ch;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  if (maxLines && lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    lines[lines.length - 1] = short(lines[lines.length - 1], Math.max(1, lines[lines.length - 1].length - 1));
  }
  lines.forEach((item, index) => text(ctx, item, x, y + index * lineHeight, size, color));
  return lines.length * lineHeight;
}

function button(ctx, spec) {
  fillRoundRect(ctx, spec.x, spec.y, spec.w, spec.h, spec.r || 12, spec.fill || "#2f6f57", spec.stroke || "#1d4f3c");
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
let imageRenderHook = null;

function setImageRenderHook(fn) {
  imageRenderHook = typeof fn === "function" ? fn : null;
}

function categoryMark(spec) {
  if (spec.category === "时局" || spec.category === "weather") return "局";
  if (spec.category === "谋略" || spec.category === "special") return "策";
  if (spec.category === "主将" || spec.category === "leader") return "将";
  if (spec.hero || spec.category === "传世" || spec.category === "hero") return "传";
  return "人";
}

function fallbackImageUrl(spec) {
  if (spec.imageUrl && !String(spec.imageUrl).startsWith("assets/card-images/")) return spec.imageUrl;
  if (spec.category === "weather" || spec.category === "时局") return "assets/card-art/weather.webp";
  if (spec.category === "special" || spec.category === "谋略") return "assets/card-art/special.webp";
  return FACTION_ART[spec.faction] || FACTION_ART.Neutral;
}

function createLocalImage(src) {
  const api = typeof wx !== "undefined" ? wx : null;
  const sourceCanvas = typeof canvas !== "undefined" ? canvas : null;
  const img = api && api.createImage ? api.createImage()
    : (sourceCanvas && sourceCanvas.createImage ? sourceCanvas.createImage()
    : (typeof Image !== "undefined" ? new Image() : null));
  if (!img) return { failed: true };
  const entry = { img, loaded: false, failed: false };
  img.onload = () => {
    entry.loaded = true;
    if (imageRenderHook) imageRenderHook();
  };
  img.onerror = () => { entry.failed = true; };
  img.src = src;
  return entry;
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

function drawCardImage(ctx, spec) {
  const x = spec.imageX == null ? spec.x + 5 : spec.imageX;
  const y = spec.imageY == null ? spec.y + 5 : spec.imageY;
  const w = spec.imageW == null ? spec.w - 10 : spec.imageW;
  const h = spec.imageH == null ? Math.max(24, Math.floor(spec.h * 0.42)) : spec.imageH;
  const src = fallbackImageUrl(spec);
  const entry = src ? (imageCache[src] || (imageCache[src] = createLocalImage(src))) : null;
  if (entry && entry.loaded && !entry.failed) {
    fillRoundRect(ctx, x, y, w, h, Math.min(9, Math.floor(h / 4)), "#1f1a14", spec.hero ? "#f6d27a" : "#c6954b");
    ctx.save();
    roundRect(ctx, x, y, w, h, Math.min(9, Math.floor(h / 4)));
    ctx.clip();
    ctx.drawImage(entry.img, x, y, w, h);
    ctx.restore();
  } else {
    drawGeneratedCardArt(ctx, spec, x, y, w, h);
  }
  const rows = (spec.row || []).map(row => ROW_MARKS[row]).filter(Boolean).join("") || categoryMark(spec);
  fillRoundRect(ctx, x + 3, y + h - 17, Math.max(18, rows.length * 10 + 8), 14, 6, "rgba(38,28,18,0.72)");
  text(ctx, rows, x + 8, y + h - 10, 9, "#fff7d8");
  fillRoundRect(ctx, x + w - 20, y + 4, 16, 16, 8, "rgba(38,28,18,0.72)");
  text(ctx, categoryMark(spec), x + w - 12, y + 12, 10, "#fff7d8", "center");
}

function card(ctx, spec) {
  fillRoundRect(ctx, spec.x, spec.y, spec.w, spec.h, 10, spec.fill || "#fffaf0", spec.stroke || "#b98a45");
  const artH = Math.max(22, Math.min(30, Math.floor(spec.h * 0.36)));
  drawCardImage(ctx, { ...spec, imageX: spec.x + 5, imageY: spec.y + 5, imageW: spec.w - 10, imageH: artH });
  text(ctx, short(spec.name, spec.nameMax || 6), spec.x + 8, spec.y + artH + 17, 11, "#3b2b18");
  text(ctx, short(spec.summary || spec.title, spec.summaryMax || 7), spec.x + 8, spec.y + artH + 30, 9, "#7c5a2e");
  text(ctx, spec.category || "", spec.x + 8, spec.y + spec.h - 9, 9, "#6f5a3a");
  text(ctx, String(spec.strength == null ? "-" : spec.strength), spec.x + spec.w - 16, spec.y + spec.h - 10, 17, "#8f3c1f", "center");
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
  drawCardImage,
  card,
  hit
};
