const { clear, text, fillRoundRect, wrapText, drawCardImage, short, drawTopLeftBack } = require("../ui/canvas");
const { DIFFICULTY_LABELS, allCards, cardById, displayName } = require("../core/cards");
const { drawDetail } = require("./cardDetail");

const ROW_H = 90;
const ROW_GAP = 98;
const LEADERS = allCards().filter(card => card.category === "leader");

function formatTime(ts) {
  if (!ts) return "未知时间";
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${m}-${day} ${h}:${min}`;
}

const RESULT_STYLES = {
  win: { label: "胜利", color: "#2f6f57", fill: "#f0faf3", tagFill: "#2f6f57", streak: "连胜" },
  loss: { label: "失败", color: "#9f3b24", fill: "#fff0ea", tagFill: "#9f3b24", streak: "连败" },
  draw: { label: "平局", color: "#6b6b5f", fill: "#f6f2ea", tagFill: "#6b6b5f" },
  anomaly: { label: "异常", color: "#8d6840", fill: "#fff7e8", tagFill: "#8d6840" }
};

function resultType(item) {
  if (item.rankedAnomaly) return "anomaly";
  if (item.winner === 0) return "win";
  if (item.winner == null) return "draw";
  return "loss";
}

function resultStyle(item) {
  return RESULT_STYLES[resultType(item)];
}

function streakBadges(history) {
  const badges = {};
  let start = 0;
  while (start < history.length) {
    const type = resultType(history[start]);
    let end = start + 1;
    while (end < history.length && resultType(history[end]) === type) end += 1;
    const count = end - start;
    if (type !== "draw" && count >= 3) {
      const style = RESULT_STYLES[type];
      badges[start] = { text: `${count}${style.streak}`, fill: style.tagFill };
    }
    start = end;
  }
  return badges;
}

function cleanName(value) {
  return String(value || "")
    .replace(/^领袖牌_/, "")
    .replace(/^[^_]+阵营_/, "")
    .trim();
}

function leaderCard(id, name) {
  const byId = cardById(id);
  if (byId) return byId;
  const target = cleanName(name);
  if (!target) return null;
  return LEADERS.find(card => displayName(card) === target || cleanName(card.name) === target) || null;
}

function applyRoundMorale(morale, winner) {
  const next = [morale[0], morale[1]];
  if (winner == null) {
    next[0] -= 1;
    next[1] -= 1;
  } else {
    next[winner === 0 ? 1 : 0] -= 1;
  }
  return next.map(value => Math.max(0, value));
}

function moraleAfterRoundResults(results) {
  return (Array.isArray(results) ? results : []).reduce((morale, result) => {
    if (Array.isArray(result?.morale) && result.morale.length >= 2) return [result.morale[0] || 0, result.morale[1] || 0];
    return applyRoundMorale(morale, result?.winner == null ? null : result.winner);
  }, [2, 2]);
}

function roundLine(rounds) {
  return rounds.map(r => {
    const tag = r.winner == null ? "平" : (r.winner === 0 ? "胜" : "负");
    return `${r.round}局${r.scores?.[0] || 0}:${r.scores?.[1] || 0}${tag}`;
  }).join(" · ");
}

// 掉线/弃局的战绩固定记 0:2 失败，这里只额外补一句离开时的场面，不影响胜负展示。
// 服务端补判负时 roundResults 为空，此时才靠 disconnectSnapshot 把比分补回来。
const AWAY_END_REASONS = ["disconnect", "abandon", "timeout"];

function disconnectDetail(item) {
  if (!AWAY_END_REASONS.includes(item.endReason)) return "";
  const snapshot = item.disconnectSnapshot;
  if (!snapshot) return item.finishedRounds ? `已打 ${item.finishedRounds} 小局` : "";
  const snapshotRounds = Array.isArray(snapshot.roundResults) ? snapshot.roundResults : [];
  const rounds = Array.isArray(snapshot.rounds) ? snapshot.rounds : [0, 0];
  const scores = Array.isArray(snapshot.scores) ? snapshot.scores : [0, 0];
  const detail = snapshotRounds.length ? roundLine(snapshotRounds) : `小局 ${rounds[0] || 0}:${rounds[1] || 0}`;
  return `离开时 ${detail} · 场面 ${scores[0] || 0}:${scores[1] || 0}`;
}

function roundDetail(item) {
  const rounds = Array.isArray(item.roundResults) ? item.roundResults : [];
  const base = rounds.length ? roundLine(rounds) : `小局 ${item.rounds?.[0] || 0}:${item.rounds?.[1] || 0}`;
  if (rounds.length) return base;
  const away = disconnectDetail(item);
  return away ? `${base} · ${away}` : base;
}

function drawMoraleToken(ctx, x, y, active, fill) {
  const size = 6;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x, y - size);
  ctx.lineTo(x + size, y);
  ctx.lineTo(x, y + size);
  ctx.lineTo(x - size, y);
  ctx.closePath();
  ctx.fillStyle = active ? fill : "#d8c9ad";
  ctx.fill();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = active ? fill : "#bfa77c";
  ctx.stroke();
  ctx.restore();
}

function drawMoraleTokens(ctx, x, y, count, fill) {
  for (let index = 0; index < 2; index += 1) drawMoraleToken(ctx, x + index * 16, y, index < count, fill);
}

// 单行空间有限，超出会被裁成省略号，所以牌组模式只保留最短可辨识文案。
function deckModeLabel(mode) {
  if (mode === "custom") return "自定义";
  if (mode === "random") return "随机";
  if (mode === "auto") return "自动";
  return "未知";
}

// 卡片左侧已有胜负色块标签，第一行不再重复胜负文案，改成展示更能说明“打的是什么”的强度信息。
function matchStrengthLabel(item) {
  if (item.ranked) return "排位";
  if (item.mode === "online") return "好友";
  return DIFFICULTY_LABELS[item.difficulty] || item.difficulty || "普通";
}

// 只有非正常结束才需要额外交代原因，正常结束不占用第一行空间。
// 弃局与掉线对玩家是同一件事（中途离开没提交战报），统一显示成“掉线”，和详情标题保持一致。
const END_REASON_NOTES = { disconnect: "掉线", abandon: "掉线", surrender: "认输", timeout: "超时", invalid: "异常" };

function endReasonNote(item) {
  if (item.rankedAnomaly) return "异常";
  return END_REASON_NOTES[item.endReason] || "";
}

// 对局强度是扫读战绩时最关心的信息，统一成一个短标签放在对手行最前面。
// 联机对局第一行已标记“好友”，这里返回空串避免重复。
function opponentModeLabel(item) {
  if (item.mode === "online") return "";
  return DIFFICULTY_LABELS[item.difficulty] || item.difficulty || "普通";
}

function lineupText(deckMode, faction, leader, fallbackFaction, fallbackLeader) {
  return `${deckModeLabel(deckMode)} ${faction || fallbackFaction}·${short(leader || fallbackLeader, 6)}`;
}

// ===== 对战详情：列表里被压缩省略的信息在这里完整展示 =====

const DETAIL_FONT = "\"PingFang SC\", \"Hiragino Sans GB\", \"Microsoft YaHei\", sans-serif";
const BLOCK_GAP = 8;
const ROUND_TAGS = { win: "胜", loss: "负", draw: "平" };

function formatFullTime(ts) {
  if (!ts) return "未知时间";
  const d = new Date(ts);
  const pad = value => String(value).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function deckModeFullLabel(mode) {
  if (mode === "custom") return "自定义卡组";
  if (mode === "random") return "随机卡牌";
  if (mode === "auto") return "自动组牌";
  return "卡组未知";
}

function matchTypeLabel(item) {
  if (item.ranked) return "排位赛";
  if (item.mode === "online") return "好友对战";
  return `单机对战 · ${DIFFICULTY_LABELS[item.difficulty] || item.difficulty || "普通"}`;
}

// 弃局本质是中途离开、没提交战报，对玩家展示成掉线更好理解。
function recordTitle(item) {
  const reason = item.endReason || "";
  if (reason === "disconnect" || reason === "abandon") return item.ranked ? "排位掉线" : "掉线";
  return item.resultText || (reason === "surrender" ? "认输" : "已结束");
}

function recordKeyOf(item, index) {
  return String(item?.recordKey || item?.cloudId || item?.matchId || `history-${index}`);
}

function findRecord(ui = {}) {
  const key = String(ui.historyRecordDetailKey || "");
  if (!key) return null;
  const list = cloudHistory(ui);
  for (let index = 0; index < list.length; index += 1) {
    if (recordKeyOf(list[index], index) === key) return list[index];
  }
  return null;
}

function measureLines(ctx, content, maxWidth, size) {
  const value = String(content || "");
  if (!value) return 0;
  ctx.font = `${size}px ${DETAIL_FONT}`;
  let count = 0;
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
  return count;
}

function resultBlock(item, contentW, style) {
  const h = 64;
  const rounds = Array.isArray(item.rounds) ? item.rounds : [0, 0];
  return {
    h,
    draw(ctx, x, y) {
      fillRoundRect(ctx, x, y, contentW, h, 12, style.fill, style.color);
      const tagW = 46;
      fillRoundRect(ctx, x + 12, y + 12, tagW, 20, 10, style.tagFill);
      text(ctx, style.label, x + 12 + tagW / 2, y + 22, 11, "#fff7d8", "center");
      text(ctx, recordTitle(item), x + 12 + tagW + 10, y + 22, 15, style.color);
      text(ctx, formatFullTime(item.time), x + 14, y + 47, 11, "#775c34");
      text(ctx, `${rounds[0] || 0} : ${rounds[1] || 0}`, x + contentW - 18, y + 26, 20, style.color, "right");
      text(ctx, "小局比分", x + contentW - 18, y + 47, 10, "#8a6132", "right");
    }
  };
}

function sidesBlock(ctx, item, contentW) {
  const colW = (contentW - 10) / 2;
  const avatarSize = 46;
  const textW = colW - 20;
  const sides = [
    {
      title: "我方",
      card: leaderCard(item.humanLeaderId, item.humanLeader),
      faction: item.humanFaction || "阵营未知",
      leader: cleanName(item.humanLeader) || "主将未知",
      deck: deckModeFullLabel(item.humanDeckMode),
      color: "#2f6f57"
    },
    {
      title: item.mode === "online" ? "好友" : "对手",
      card: leaderCard(item.aiLeaderId, item.aiLeader),
      faction: item.aiFaction || "阵营未知",
      leader: cleanName(item.aiLeader) || "系统主将",
      deck: deckModeFullLabel(item.aiDeckMode),
      color: "#8f3c1f"
    }
  ];
  const morale = Array.isArray(item.morale) ? item.morale : moraleAfterRoundResults(item.roundResults);
  const factionLines = Math.max(1, ...sides.map(side => measureLines(ctx, `阵营 ${side.faction}`, textW, 12)));
  const nameLines = Math.max(1, ...sides.map(side => measureLines(ctx, `主将 ${side.leader}`, textW, 12)));
  const h = 28 + avatarSize + 14 + (factionLines + nameLines) * 16 + 18 + 10;
  return {
    h,
    draw(target, x, y) {
      sides.forEach((side, index) => {
        const colX = x + index * (colW + 10);
        fillRoundRect(target, colX, y, colW, h, 11, "#fffaf0", "#dcc48d");
        text(target, side.title, colX + 12, y + 15, 12, side.color);
        const avatarY = y + 26;
        fillRoundRect(target, colX + 9, avatarY - 3, avatarSize + 6, avatarSize + 6, 9, "#fff7df", side.color);
        if (side.card) {
          drawCardImage(target, { ...side.card, imageFill: true, imageX: colX + 12, imageY: avatarY, imageW: avatarSize, imageH: avatarSize });
        } else {
          fillRoundRect(target, colX + 12, avatarY, avatarSize, avatarSize, 8, "#d8c8aa", side.color);
          text(target, "将", colX + 12 + avatarSize / 2, avatarY + avatarSize / 2, 12, "#fff7d8", "center");
        }
        const infoX = colX + 12 + avatarSize + 10;
        text(target, "军心", infoX, avatarY + 14, 10, "#8a6132");
        drawMoraleTokens(target, infoX + 8, avatarY + 34, morale[index] || 0, side.color);
        let rowY = avatarY + avatarSize + 14;
        wrapText(target, `阵营 ${side.faction}`, colX + 12, rowY, textW, 16, factionLines, 12, "#3b2b18");
        rowY += factionLines * 16;
        wrapText(target, `主将 ${side.leader}`, colX + 12, rowY, textW, 16, nameLines, 12, "#3b2b18");
        rowY += nameLines * 16;
        text(target, side.deck, colX + 12, rowY + 4, 11, "#775c34");
      });
    }
  };
}

function infoBlock(ctx, title, rows, contentW, labelW = 68) {
  const list = (rows || []).filter(row => row && row.value);
  if (!list.length) return null;
  const valueW = contentW - 26 - labelW;
  const measured = list.map(row => ({ ...row, lines: Math.max(1, measureLines(ctx, row.value, valueW, 12)) }));
  const bodyH = measured.reduce((sum, row) => sum + row.lines * 17 + 4, 0);
  const h = 26 + bodyH + 6;
  return {
    h,
    draw(target, x, y) {
      fillRoundRect(target, x, y, contentW, h, 11, "#fffaf0", "#dcc48d");
      text(target, title, x + 13, y + 15, 12, "#8f3c1f");
      let rowY = y + 36;
      measured.forEach(row => {
        text(target, row.label, x + 13, rowY, 11, "#8a6132");
        wrapText(target, row.value, x + 13 + labelW, rowY, valueW, 17, row.lines, 12, row.color || "#3b2b18");
        rowY += row.lines * 17 + 4;
      });
    }
  };
}

function roundsBlock(item, contentW) {
  const rounds = Array.isArray(item.roundResults) ? item.roundResults : [];
  if (!rounds.length) return null;
  const rowH = 26;
  const h = 26 + rounds.length * rowH + 6;
  return {
    h,
    draw(ctx, x, y) {
      fillRoundRect(ctx, x, y, contentW, h, 11, "#fffaf0", "#dcc48d");
      text(ctx, "小局明细", x + 13, y + 15, 12, "#8f3c1f");
      rounds.forEach((round, index) => {
        const rowY = y + 38 + index * rowH;
        const type = round.winner == null ? "draw" : (round.winner === 0 ? "win" : "loss");
        const style = RESULT_STYLES[type];
        fillRoundRect(ctx, x + 10, rowY - 11, contentW - 20, rowH - 5, 8, style.fill, style.color);
        text(ctx, `第${round.round || index + 1}局`, x + 20, rowY, 11, "#5f4727");
        text(ctx, `${round.scores?.[0] || 0} : ${round.scores?.[1] || 0}`, x + 76, rowY, 13, style.color);
        text(ctx, ROUND_TAGS[type], x + 138, rowY, 12, style.color);
      });
    }
  };
}

function recordDetailBlocks(ctx, item, contentW) {
  const style = resultStyle(item);
  const scores = Array.isArray(item.scores) ? item.scores : [];
  const blocks = [
    resultBlock(item, contentW, style),
    sidesBlock(ctx, item, contentW),
    infoBlock(ctx, "对局信息", [
      { label: "对局类型", value: matchTypeLabel(item) },
      { label: "小局比分", value: `${item.rounds?.[0] || 0} : ${item.rounds?.[1] || 0}` },
      { label: "最终影响力", value: scores.length ? `${scores[0] || 0} : ${scores[1] || 0}` : "" },
      { label: "房间号", value: item.mode === "online" ? (item.roomId || "") : "" }
    ], contentW),
    roundsBlock(item, contentW)
  ];
  if (item.ranked) {
    blocks.push(infoBlock(ctx, "排位结算", [
      { label: "权势变化", value: item.rankDeltaText || "未结算", color: item.rankedAnomaly ? "#8d6840" : "#3b2b18" },
      { label: "当前段位", value: item.rankDisplay || "" }
    ], contentW));
  }
  const disconnect = disconnectDetail(item);
  if (disconnect) {
    blocks.push(infoBlock(ctx, "掉线信息", [{ label: "掉线记录", value: disconnect, color: "#8d6840" }], contentW));
  }
  return blocks.filter(Boolean);
}

function recordDetailLayout(ctx, view, item) {
  const panelW = Math.min(view.width - 24, 372);
  const panelX = (view.width - panelW) / 2;
  const contentW = panelW - 28;
  const blocks = recordDetailBlocks(ctx, item, contentW);
  const contentH = blocks.reduce((sum, block) => sum + block.h + BLOCK_GAP, 0) - (blocks.length ? BLOCK_GAP : 0);
  const headerH = 42;
  const footerH = 28;
  const maxPanelH = view.height - view.safeTop - view.safeBottom - 56;
  const panelH = Math.min(maxPanelH, headerH + contentH + footerH + 10);
  const panelY = Math.max(view.safeTop + 24, Math.floor((view.height - view.safeBottom - panelH) / 2));
  const viewportTop = panelY + headerH;
  const viewportH = Math.max(80, panelH - headerH - footerH);
  return { panelX, panelY, panelW, panelH, contentW, blocks, contentH, headerH, footerH, viewportTop, viewportH, maxScroll: Math.max(0, contentH - viewportH) };
}

function drawRecordDetail(ctx, view, actions, item, ui) {
  const info = recordDetailLayout(ctx, view, item);
  const scroll = Math.max(0, Math.min(ui.historyRecordScroll || 0, info.maxScroll));
  ui.historyRecordScroll = scroll;
  ui.__historyRecordLayout = {
    panelX: info.panelX,
    panelY: info.panelY,
    panelW: info.panelW,
    panelH: info.panelH,
    viewportTop: info.viewportTop,
    viewportH: info.viewportH,
    contentH: info.contentH,
    maxScroll: info.maxScroll
  };
  actions.push({ id: "closeHistoryRecord", x: 0, y: 0, w: view.width, h: view.height });
  ctx.save();
  ctx.fillStyle = "rgba(28, 21, 14, 0.46)";
  ctx.fillRect(0, 0, view.width, view.height);
  ctx.restore();
  fillRoundRect(ctx, info.panelX + 2, info.panelY + 3, info.panelW, info.panelH, 18, "rgba(60, 42, 24, 0.16)");
  fillRoundRect(ctx, info.panelX, info.panelY, info.panelW, info.panelH, 18, "#fffaf0", "#d6b779");
  actions.push({ id: "historyRecordPanel", x: info.panelX, y: info.panelY, w: info.panelW, h: info.panelH });
  fillRoundRect(ctx, info.panelX + 10, info.panelY + 8, info.panelW - 20, info.headerH - 14, 13, "#efe2c6", "#dcc48d");
  text(ctx, "对战详情", info.panelX + 22, info.panelY + 22, 16, "#2f2417");
  ctx.save();
  ctx.beginPath();
  ctx.rect(info.panelX + 6, info.viewportTop, info.panelW - 12, info.viewportH);
  ctx.clip();
  let blockY = info.viewportTop - scroll;
  info.blocks.forEach(block => {
    if (blockY + block.h >= info.viewportTop - 24 && blockY <= info.viewportTop + info.viewportH + 24) block.draw(ctx, info.panelX + 14, blockY);
    blockY += block.h + BLOCK_GAP;
  });
  ctx.restore();
  if (info.maxScroll > 0) {
    const trackX = info.panelX + info.panelW - 9;
    const trackY = info.viewportTop + 4;
    const trackH = Math.max(24, info.viewportH - 8);
    const thumbH = Math.max(28, trackH * info.viewportH / info.contentH);
    const thumbY = trackY + (trackH - thumbH) * (scroll / info.maxScroll);
    fillRoundRect(ctx, trackX, trackY, 3, trackH, 1.5, "rgba(119,92,52,0.16)");
    fillRoundRect(ctx, trackX, thumbY, 3, thumbH, 1.5, "rgba(143,60,31,0.72)");
  }
  text(ctx, "点击空白处返回", info.panelX + info.panelW / 2, info.panelY + info.panelH - 15, 11, "#8a785f", "center");
}

function recordScrollBounds(ui = {}) {
  const info = ui.__historyRecordLayout;
  if (!info) return { listTop: 0, listBottom: 0, maxScroll: 0 };
  return { listTop: info.panelY, listBottom: info.panelY + info.panelH, maxScroll: info.maxScroll };
}

function layout(view) {
  const top = view.safeTop + 30;
  const bottom = view.height - view.safeBottom - 24;
  const listTop = top + 58;
  const viewportH = Math.max(ROW_H, bottom - listTop);
  const listBottom = listTop + viewportH;
  return { top, bottom, listTop, listBottom, viewportH };
}

function scrollState(view, ui, history) {
  const info = layout(view);
  const contentH = history.length ? (history.length - 1) * ROW_GAP + ROW_H : 0;
  const maxScroll = Math.max(0, contentH - info.viewportH);
  const scroll = Math.max(0, Math.min(ui.historyScroll || 0, maxScroll));
  const start = Math.max(0, Math.floor(scroll / ROW_GAP));
  const end = Math.min(history.length, Math.ceil((scroll + info.viewportH) / ROW_GAP) + 1);
  return { ...info, contentH, maxScroll, scroll, start, list: history.slice(start, end) };
}

function cloudHistory(ui = {}) {
  return Array.isArray(ui.cloudHistoryRecords) ? ui.cloudHistoryRecords : [];
}

function historySummary(history) {
  const total = history.length;
  const wins = history.filter(item => item.winner === 0).length;
  const draws = history.filter(item => item.winner == null).length;
  const losses = Math.max(0, total - wins - draws);
  return { total, wins, losses, draws, winRate: total ? Math.round(wins * 100 / total) : 0 };
}

function scrollBounds(view, ui = {}) {
  const state = scrollState(view, {}, cloudHistory(ui));
  return { listTop: state.listTop, listBottom: state.listBottom, maxScroll: state.maxScroll };
}

function detailLeaderCards(view, ui) {
  const state = scrollState(view, ui, cloudHistory(ui));
  const seen = new Set();
  return state.list
    .map(item => leaderCard(item.humanLeaderId, item.humanLeader))
    .filter(card => {
      if (!card || seen.has(card.id)) return false;
      seen.add(card.id);
      return true;
    });
}

function drawLeaderAvatar(ctx, actions, card, x, y, size, stroke, recordKey) {
  fillRoundRect(ctx, x - 3, y - 3, size + 6, size + 6, 9, "#fff7df", stroke);
  if (card) {
    actions.push({ id: "historyLeader", cardId: card.id, recordKey, x: x - 8, y: y - 8, w: size + 16, h: size + 16 });
    drawCardImage(ctx, { ...card, imageFill: true, imageX: x, imageY: y, imageW: size, imageH: size });
  } else {
    fillRoundRect(ctx, x, y, size, size, 8, "#d8c8aa", stroke);
    text(ctx, "将", x + size / 2, y + size / 2, 11, "#fff7d8", "center");
  }
}

function drawStreakBadge(ctx, badge, rightX, y) {
  const w = 90;
  const h = 28;
  const cx = rightX - w * 0.5;
  const cy = y + h * 0.3;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(0.4);
  ctx.shadowColor = "rgba(0,0,0,0.25)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 3;
  fillRoundRect(ctx, -w / 2, -h / 2, w, h, 6, "#e85d2a", "#ff9d5c");
  ctx.restore();
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(0.4);
  fillRoundRect(ctx, -w / 2 + 3, -h / 2 + 3, w - 6, h - 6, 4, badge.fill, "rgba(255,255,255,0.18)");
  ctx.font = "bold 13px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#fff7e0";
  ctx.fillText(badge.text, 0, 1);
  ctx.restore();
}

function draw(ctx, view, actions, ui = {}) {
  clear(ctx, view.width, view.height);
  const allHistory = cloudHistory(ui);
  const state = scrollState(view, ui, allHistory);
  const listBottom = state.listBottom;
  ui.historyScroll = state.scroll;
  let detail = null;
  if (ui.historyLeaderDetailId) {
    detail = cardById(ui.historyLeaderDetailId);
    if (!detail) ui.historyLeaderDetailId = "";
  }
  const record = findRecord(ui);
  if (ui.historyRecordDetailKey && !record) {
    ui.historyRecordDetailKey = "";
    ui.historyRecordScroll = 0;
    ui.__historyRecordLayout = null;
  }
  const summary = (ui.cloudHistoryTotal != null)
    ? { total: ui.cloudHistoryTotal, wins: ui.cloudHistoryWins || 0, losses: ui.cloudHistoryLosses || 0, draws: ui.cloudHistoryDraws || 0, winRate: ui.cloudHistoryWinRate || 0 }
    : historySummary(allHistory);
  drawTopLeftBack(ctx, view, actions, "back");
  text(ctx, "战绩记录", view.width / 2, state.top, 22, "#2f2417", "center");
  text(ctx, `总 ${summary.total} · 胜 ${summary.wins} · 负 ${summary.losses} · 平 ${summary.draws} · 胜率 ${summary.winRate}%`, view.width / 2, state.top + 28, 12, "#775c34", "center");
  const badges = streakBadges(allHistory);
  if (!state.list.length) {
    fillRoundRect(ctx, 24, state.top + 74, view.width - 48, 110, 18, "#fffaf0", "#dcc48d");
    const emptyText = ui.cloudHistoryLoading ? "正在同步云端战绩..." : (ui.cloudHistoryError || "还没有完成的对局");
    text(ctx, emptyText, view.width / 2, state.top + 128, 15, "#775c34", "center");
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, state.listTop - 4, view.width, listBottom - state.listTop + 4);
  ctx.clip();
  state.list.forEach((item, index) => {
    const globalIndex = state.start + index;
    const y = state.listTop + globalIndex * ROW_GAP - state.scroll;
    const style = resultStyle(item);
    const badge = badges[globalIndex];
    const humanLeader = leaderCard(item.humanLeaderId, item.humanLeader);
    fillRoundRect(ctx, 18, y, view.width - 36, ROW_H, 13, style.fill, style.color);
    fillRoundRect(ctx, 24, y + 4, 5, ROW_H - 8, 3, style.color);
    if (badge) drawStreakBadge(ctx, badge, view.width - 14, y);
    const note = endReasonNote(item);
    const headline = note ? `${matchStrengthLabel(item)} · ${note}` : matchStrengthLabel(item);
    const avatarSize = ROW_H - 12;
    const avatarY = y + 6;
    const recordKey = recordKeyOf(item, globalIndex);
    // 先压入整行详情热区，再画头像热区，保证长按主将仍是主将详情、点/长按其他区域是对战详情。
    const hitTop = Math.max(y, state.listTop);
    const hitBottom = Math.min(y + ROW_H, listBottom);
    if (hitBottom - hitTop > 12) actions.push({ id: "historyRecord", recordKey, x: 18, y: hitTop, w: view.width - 36, h: hitBottom - hitTop });
    drawLeaderAvatar(ctx, actions, humanLeader, 32, avatarY, avatarSize, style.color, recordKey);
    const textX = 32 + avatarSize + 10;
    const textW = view.width - textX - 66;
    const tagW = 38;
    const tagH = 18;
    fillRoundRect(ctx, textX, y + 8, tagW, tagH, 9, style.tagFill);
    text(ctx, style.label, textX + tagW / 2, y + 17, 10, "#fff7d8", "center");
    const headX = textX + tagW + 8;
    text(ctx, headline, headX, y + 18, 13, style.color);
    // text() 已把画布字体设成同号字体，量出标题宽度后把时间弱化排在其后。
    text(ctx, formatTime(item.time), headX + ctx.measureText(headline).width + 8, y + 19, 10, "#9c8358");
    const oppMode = opponentModeLabel(item);
    wrapText(ctx, `我方·${lineupText(item.humanDeckMode, item.humanFaction, item.humanLeader, "阵营", "主将")}`, textX, y + 40, textW, 14, 1, 11, "#3b2b18");
    wrapText(ctx, `对手·${oppMode ? `${oppMode}·` : ""}${lineupText(item.aiDeckMode, item.aiFaction, item.aiLeader, "系统", "系统主将")}`, textX, y + 61, textW, 14, 1, 10, "#775c34");
    const detailText = item.ranked ? `${item.rankDeltaText || "排位"} · ${roundDetail(item)}` : roundDetail(item);
    wrapText(ctx, detailText, textX, y + 80, textW, 13, 1, 10, item.rankedAnomaly ? "#8d6840" : "#6f5a3a");
    const morale = Array.isArray(item.morale) ? item.morale : moraleAfterRoundResults(item.roundResults);
    const moraleX = view.width - 58;
    text(ctx, "军心", moraleX + 8, y + 34, 10, "#8a6132", "center");
    drawMoraleTokens(ctx, moraleX, y + 52, morale[0] || 0, "#2f6f57");
    drawMoraleTokens(ctx, moraleX, y + 72, morale[1] || 0, "#8f3c1f");
  });
  ctx.restore();
  if (state.scroll < state.maxScroll - 0.5) {
    ctx.save();
    const fade = ctx.createLinearGradient ? ctx.createLinearGradient(0, listBottom - 30, 0, listBottom) : null;
    if (fade) { fade.addColorStop(0, "rgba(255,250,240,0)"); fade.addColorStop(1, "rgba(255,250,240,0.92)"); ctx.fillStyle = fade; }
    else ctx.fillStyle = "rgba(255,250,240,0.72)";
    ctx.fillRect(0, listBottom - 30, view.width, 30);
    ctx.restore();
  }
  if (state.maxScroll > 0) {
    const trackX = view.width - 9;
    const trackY = state.listTop + 4;
    const trackH = Math.max(24, state.viewportH - 8);
    const thumbH = Math.max(30, trackH * state.viewportH / state.contentH);
    const thumbY = trackY + (trackH - thumbH) * (state.scroll / state.maxScroll);
    fillRoundRect(ctx, trackX, trackY, 3, trackH, 1.5, "rgba(119,92,52,0.16)");
    fillRoundRect(ctx, trackX, thumbY, 3, thumbH, 1.5, "rgba(143,60,31,0.72)");
  }
  if (ui.cloudHistoryHasMore && state.list.length) {
    text(ctx, ui.cloudHistoryLoadingMore ? "加载更多战绩…" : "上滑加载更多", view.width / 2, state.listBottom + 14, 11, "#b09a72", "center");
  }
  if (record) drawRecordDetail(ctx, view, actions, record, ui);
  if (detail) {
    const leaders = detailLeaderCards(view, ui);
    const currentIdx = leaders.findIndex(card => card.id === detail.id);
    const leftCard = currentIdx > 0 ? leaders[currentIdx - 1] : null;
    const rightCard = currentIdx >= 0 && currentIdx < leaders.length - 1 ? leaders[currentIdx + 1] : null;
    const swipeOffset = ui.detailSwipe ? ui.detailSwipe.offset || 0 : 0;
    drawDetail(ctx, view, actions, detail, { leftCard, rightCard, swipeOffset });
  }
}

module.exports = { draw, scrollBounds, detailLeaderCards, recordScrollBounds };
