const { createCanvasAdapter, hit, setImageRenderHook } = require("./js/ui/canvas");
const menuScene = require("./js/scenes/menu");
const matchSetupScene = require("./js/scenes/matchSetup");
const rulesScene = require("./js/scenes/rules");
const settingsScene = require("./js/scenes/settings");
const deckBuilderScene = require("./js/scenes/deckBuilder");
const historyScene = require("./js/scenes/history");
const battleScene = require("./js/scenes/battleScene");
const { sortedHandCards } = battleScene;
const resultScene = require("./js/scenes/result");
const pvpRoomScene = require("./js/scenes/pvpRoom");
const pvpSetupScene = require("./js/scenes/pvpSetup");
const pvpClient = require("./js/core/pvpClient");
const { loadSave, loadSettings, saveSettings, saveProgress, recordMatch, getCustomDeckSlots, getActiveCustomDeckSlotIndex, getActiveCustomDeckIds } = require("./js/core/storage");
const { cardById, deckStatus, recommendedDeckIds, leadersFor, FACTION_KEYS, eligibleCards, groupCards, cardValue } = require("./js/core/cards");
const { createMatch, playCard, autoPlayHuman, pass, useLeader, mulliganSwap, finishMulligan, aiStep, resolvePending, cancelPending, surrender, handOwnerIndex } = require("./js/core/battle");

const view = createCanvasAdapter();
const ctx = view.ctx;
const app = {
  scene: "menu",
  actions: [],
  match: null,
  aiTimer: null,
  recentPlayTimer: null,
  recentPlayTimerSeq: 0,
  pvp: {
    roomId: "",
    pendingRoomId: "",
    room: null,
    playerIndex: 0,
    loading: false,
    submitting: false,
    error: "",
    lastSeenRuleVersion: 0
  },
  ui: {
    handPage: 0,
    deckPage: 0,
    battleCardDetailId: "",
    battleCardDetailUid: "",
    mulliganGuideShown: false,
    mulliganHelpOpen: false,
    mulliganHandOrder: null,
    mulliganSwapAnim: null,
    mulliganSwapQueue: null,
    mulliganSwapIndex: 0,
    mulliganReplacedUid: "",
    deckCardDetailId: "",
    settingCardDetailId: "",
    matchSetupCardDetailId: "",
    showCardGuide: false,
    deckReturnScene: "settings",
    settingDropdown: "",
    settingCardTab: "all",
    settingDeckPage: 0,
    matchSetupDropdown: "",
    deckSlotDropdown: "",
    historyPage: 0,
    historyLeaderDetailId: "",
    dismissedRecentPlaySeq: 0,
    discardPileOwner: null,
    discardPilePage: 0,
    battleLogHistoryOpen: false,
    battleLogHistoryScroll: 0,
    pageTransition: null,
    detailSwipe: null
  }
};

setImageRenderHook(() => render());

const RECENT_PLAY_AUTO_DISMISS_MS = 2500;
const PAGE_TRANSITION_MS = 180;
const DETAIL_SWIPE_MS = 220;
const BATTLE_HAND_CARD_H = 96;
const BATTLE_HAND_BOTTOM_OFFSET = 148;
const BATTLE_HAND_SWIPE_TOP_PADDING = 26;
const BATTLE_HAND_SWIPE_BOTTOM_PADDING = 10;
const MULLIGAN_SWAP_OUT_MS = 260;
const MULLIGAN_SWAP_IN_MS = 300;

function requestFrame(callback) {
  if (typeof requestAnimationFrame === "function") return requestAnimationFrame(callback);
  return setTimeout(callback, 16);
}

function startPageTransition(scene, axis, fromOffset) {
  const start = Date.now();
  app.ui.pageTransition = { scene, axis, offset: fromOffset };
  function step() {
    const progress = Math.min(1, (Date.now() - start) / PAGE_TRANSITION_MS);
    const eased = 1 - Math.pow(1 - progress, 3);
    if (app.ui.pageTransition?.scene !== scene) return;
    app.ui.pageTransition.offset = fromOffset * (1 - eased);
    render();
    if (progress < 1) requestFrame(step);
    else {
      app.ui.pageTransition = null;
      render();
    }
  }
  requestFrame(step);
}

function startDetailSwipeTransition(fromOffset, onComplete) {
  const start = Date.now();
  app.ui.detailSwipe = { offset: fromOffset, animating: true };
  function step() {
    const progress = Math.min(1, (Date.now() - start) / DETAIL_SWIPE_MS);
    const eased = 1 - Math.pow(1 - progress, 3);
    if (!app.ui.detailSwipe) return;
    app.ui.detailSwipe.offset = fromOffset * (1 - eased);
    render();
    if (progress < 1) requestFrame(step);
    else {
      app.ui.detailSwipe = null;
      if (onComplete) onComplete();
      render();
    }
  }
  requestFrame(step);
}

function clearRecentPlayTimer() {
  if (app.recentPlayTimer) {
    clearTimeout(app.recentPlayTimer);
    app.recentPlayTimer = null;
  }
  app.recentPlayTimerSeq = 0;
}

function visibleRecentPlaySeq() {
  const notice = app.match?.lastPlayed;
  if (app.scene !== "battle" || !app.match || !notice || app.match.over || app.match.mulligan?.active) return 0;
  const localPlayerIndex = app.match.mode === "online" && Number.isInteger(app.match.localPlayerIndex) ? app.match.localPlayerIndex : 0;
  if (notice.playerIndex === localPlayerIndex) return 0;
  if (notice.seq <= (app.ui.dismissedRecentPlaySeq || 0)) return 0;
  return notice.seq || 0;
}

function scheduleRecentPlayAutoDismiss() {
  const seq = visibleRecentPlaySeq();
  if (!seq) {
    clearRecentPlayTimer();
    return;
  }
  if (app.recentPlayTimer && app.recentPlayTimerSeq === seq) return;
  clearRecentPlayTimer();
  app.recentPlayTimerSeq = seq;
  app.recentPlayTimer = setTimeout(() => {
    app.recentPlayTimer = null;
    app.recentPlayTimerSeq = 0;
    if (visibleRecentPlaySeq() !== seq) return;
    app.ui.dismissedRecentPlaySeq = Math.max(app.ui.dismissedRecentPlaySeq || 0, seq);
    render();
  }, RECENT_PLAY_AUTO_DISMISS_MS);
}

function clearAiTimer() {
  if (app.aiTimer) {
    clearTimeout(app.aiTimer);
    app.aiTimer = null;
  }
}

function openMulliganGuideDetail() {
  if (!app.match?.mulligan?.active || app.ui.mulliganGuideShown || app.ui.battleCardDetailId || app.ui.battleCardDetailUid) return;
  const playerIndex = handOwnerIndex(app.match);
  const mulligan = app.match.mulligan;
  if (mulligan.done?.[playerIndex]) return;
  const hand = sortedHandCards(app.match.players[playerIndex]?.hand || []);
  if (!hand.length) return;
  const card = hand[0];
  app.ui.mulliganHandOrder = hand.map(item => item.uid).filter(Boolean);
  app.ui.battleCardDetailId = card.id || "";
  app.ui.battleCardDetailUid = card.uid || "";
  app.ui.detailSwipe = null;
  app.ui.mulliganHelpOpen = false;
  app.ui.mulliganGuideShown = true;
}

function ensureMulliganHandOrder(playerIndex) {
  const player = app.match?.players?.[playerIndex];
  const hand = player?.hand || [];
  const current = new Set(hand.map(item => item.uid));
  const cached = Array.isArray(app.ui.mulliganHandOrder)
    ? app.ui.mulliganHandOrder.filter(uid => current.has(uid))
    : [];
  sortedHandCards(hand).forEach(card => {
    if (card.uid && !cached.includes(card.uid)) cached.push(card.uid);
  });
  app.ui.mulliganHandOrder = cached;
  return cached;
}

function replaceMulliganHandOrderUid(oldUid, newUid, playerIndex) {
  const order = Array.isArray(app.ui.mulliganHandOrder)
    ? app.ui.mulliganHandOrder.slice()
    : ensureMulliganHandOrder(playerIndex);
  const index = order.indexOf(oldUid);
  if (index >= 0 && newUid) order[index] = newUid;
  else ensureMulliganHandOrder(playerIndex);
  app.ui.mulliganHandOrder = index >= 0 ? order : app.ui.mulliganHandOrder;
}

function hasMulliganSwapLeft() {
  const mulligan = app.match?.mulligan;
  if (!mulligan?.active) return false;
  const pi = handOwnerIndex(app.match);
  return (mulligan.used?.[pi] || 0) < (mulligan.max || 0);
}

function performLocalMulliganSwap(uid) {
  const state = app.match;
  const pi = handOwnerIndex(state);
  ensureMulliganHandOrder(pi);
  const before = new Set((state.players[pi].hand || []).map(item => item.uid));
  const ok = mulliganSwap(state, uid, pi);
  if (!ok) {
    app.ui.mulliganReplacedUid = "";
    return null;
  }
  const after = state.players[pi].hand || [];
  const newCard = after.find(item => item.uid && !before.has(item.uid));
  if (newCard) replaceMulliganHandOrderUid(uid, newCard.uid, pi);
  app.ui.mulliganReplacedUid = newCard ? newCard.uid : (after.length ? after[after.length - 1].uid : "");
  return newCard || null;
}

function finishMulliganSwapSequence(closeDetail = true) {
  app.ui.mulliganSwapAnim = null;
  app.ui.mulliganSwapQueue = null;
  app.ui.mulliganSwapIndex = 0;
  app.ui.mulliganReplacedUid = "";
  if (closeDetail) {
    app.ui.battleCardDetailId = "";
    app.ui.battleCardDetailUid = "";
    app.ui.mulliganHelpOpen = false;
  }
  app.ui.handPage = 0;
  afterHumanAction();
}

function runMulliganSwapStep(phase) {
  const queue = app.ui.mulliganSwapQueue || [];
  const index = app.ui.mulliganSwapIndex || 0;
  const uid = queue[index];
  if (!uid) return finishMulliganSwapSequence();
  app.ui.mulliganSwapAnim = {
    phase,
    start: Date.now(),
    alpha: phase === "out" ? 1 : 0,
    scale: phase === "out" ? 1 : 0.82
  };
  const dur = phase === "out" ? MULLIGAN_SWAP_OUT_MS : MULLIGAN_SWAP_IN_MS;
  function step() {
    if (!app.ui.mulliganSwapAnim || app.ui.mulliganSwapAnim.phase !== phase) return;
    const progress = Math.min(1, (Date.now() - app.ui.mulliganSwapAnim.start) / dur);
    const eased = 1 - Math.pow(1 - progress, 3);
    if (phase === "out") {
      app.ui.mulliganSwapAnim.alpha = 1 - eased;
      app.ui.mulliganSwapAnim.scale = 1 - 0.16 * eased;
    } else {
      app.ui.mulliganSwapAnim.alpha = eased;
      app.ui.mulliganSwapAnim.scale = 0.82 + 0.18 * eased;
    }
    render();
    if (progress < 1) return requestFrame(step);
    if (phase === "out") {
      const curUid = queue[app.ui.mulliganSwapIndex];
      const newCard = performLocalMulliganSwap(curUid);
      if (!newCard) return finishMulliganSwapSequence();
      app.ui.battleCardDetailUid = newCard.uid || "";
      app.ui.battleCardDetailId = newCard.id || "";
      app.ui.mulliganReplacedUid = "";
      runMulliganSwapStep("in");
    } else {
      app.ui.mulliganSwapIndex += 1;
      if (app.ui.mulliganSwapIndex < queue.length && hasMulliganSwapLeft()) {
        app.ui.battleCardDetailUid = queue[app.ui.mulliganSwapIndex] || "";
        app.ui.battleCardDetailId = "";
        runMulliganSwapStep("out");
      } else {
        finishMulliganSwapSequence(!hasMulliganSwapLeft());
      }
    }
  }
  requestFrame(step);
}

function startMulliganSwapSequence(firstUid) {
  const mulligan = app.match?.mulligan;
  if (!mulligan?.active || !firstUid) return;
  const pi = handOwnerIndex(app.match);
  const used = mulligan.used?.[pi] || 0;
  const remaining = Math.max(0, (mulligan.max || 0) - used);
  if (remaining <= 0) {
    app.ui.battleCardDetailId = "";
    app.ui.battleCardDetailUid = "";
    return render();
  }
  app.ui.mulliganSwapQueue = [firstUid];
  app.ui.mulliganSwapIndex = 0;
  app.ui.battleCardDetailUid = firstUid;
  app.ui.battleCardDetailId = "";
  app.ui.detailSwipe = null;
  app.ui.mulliganSwapAnim = { phase: "out", start: Date.now(), alpha: 1, scale: 1 };
  runMulliganSwapStep("out");
}

function setScene(scene) {
  if (scene !== "battle") {
    clearAiTimer();
    clearRecentPlayTimer();
  }
  app.scene = scene;
  render();
}

function startMatch(optionsPatch = {}) {
  clearAiTimer();
  app.ui.handPage = 0;
  app.ui.battleCardDetailId = "";
  app.ui.battleCardDetailUid = "";
  app.ui.mulliganGuideShown = false;
  app.ui.mulliganHelpOpen = false;
  app.ui.mulliganHandOrder = null;
  app.ui.mulliganSwapAnim = null;
  app.ui.mulliganSwapQueue = null;
  app.ui.mulliganSwapIndex = 0;
  app.ui.mulliganReplacedUid = "";
  app.ui.discardPileOwner = null;
  app.ui.discardPilePage = 0;
  app.ui.battleLogHistoryOpen = false;
  app.ui.battleLogHistoryScroll = 0;
  app.ui.dismissedRecentPlaySeq = 0;
  clearRecentPlayTimer();
  const settings = { ...loadSettings(), ...optionsPatch };
  app.match = createMatch(settings);
  app.ui.showCardGuide = !loadSave().finishedTutorial;
  openMulliganGuideDetail();
  setScene("battle");
}

function render() {
  app.actions = [];
  if (app.scene === "menu") menuScene.draw(ctx, view, app.actions);
  if (app.scene === "pvpSetup") pvpSetupScene.draw(ctx, view, app.actions, app.ui, app.pvp);
  if (app.scene === "pvpRoom") pvpRoomScene.draw(ctx, view, app.actions, app.pvp);
  if (app.scene === "matchSetup") matchSetupScene.draw(ctx, view, app.actions, app.ui);
  if (app.scene === "rules") rulesScene.draw(ctx, view, app.actions);
  if (app.scene === "settings") settingsScene.draw(ctx, view, app.actions, app.ui);
  if (app.scene === "deckBuilder") deckBuilderScene.draw(ctx, view, app.actions, app.ui);
  if (app.scene === "history") historyScene.draw(ctx, view, app.actions, app.ui);
  if (app.scene === "battle") battleScene.draw(ctx, view, app.actions, app.match, app.ui);
  if (app.scene === "result") resultScene.draw(ctx, view, app.actions, app.match);
  scheduleRecentPlayAutoDismiss();
}

function scheduleAi() {
  if (!app.match || app.match.mode !== "ai" || app.match.over || app.match.current !== 1 || app.match.mulligan?.active) return;
  clearAiTimer();
  app.aiTimer = setTimeout(() => {
    app.aiTimer = null;
    aiStep(app.match);
    if (app.match.over) {
      setScene("result");
      return;
    }
    app.ui.handPage = clampHandPage(app.ui.handPage);
    render();
    scheduleAi();
  }, 600);
}

function vibrate() {
  const settings = loadSettings();
  if (settings.vibration && typeof wx !== "undefined" && wx.vibrateShort) {
    wx.vibrateShort({ type: "light" });
  }
}

function getSharePayload() {
  const roomId = normalizePvpRoomId(app.pvp.roomId || app.pvp.room?.roomId || app.pvp.room?._id);
  if (!roomId) {
    console.warn("[share] 当前无房间号，分享出的卡片不会带 roomId，好友只能进入首页。请先创建/加入房间再转发。");
  }
  const normal = {
    title: roomId ? `来章鱼牌房间 ${roomId} 对战` : "来盘章鱼牌吧",
    query: roomId ? `roomId=${roomId}` : "from=share"
  };

  // PVP对局结束：根据当前玩家视角生成个性化分享内容
  const match = app.match;
  if (match && match.mode === "online" && match.over) {
    const myIndex = app.pvp.playerIndex ?? 0;
    const me = match.players[myIndex];
    const opp = match.players[1 - myIndex];
    const myName = (me && me.name !== "玩家") ? me.name : (myIndex === 0 ? "玩家一" : "玩家二");
    const oppName = (opp && opp.name !== "玩家") ? opp.name : ((1 - myIndex) === 0 ? "玩家一" : "玩家二");
    const myScore = match.finalScores?.[myIndex] ?? 0;
    const oppScore = match.finalScores?.[1 - myIndex] ?? 0;
    const won = myScore > oppScore;
    const resultLabel = won ? "获胜" : (myScore < oppScore ? "惜败" : "平局");
    normal.title = `${myName} ${resultLabel} · ${myScore}:${oppScore} ${oppName}`;
  }

  return normal;
}

function setupShare() {
  const api = typeof wx !== "undefined" ? wx : null;
  if (!api) return;
  console.log("[share] setupShare 开始注册");
  if (api.showShareMenu) {
    api.showShareMenu({
      withShareTicket: false,
      menus: ["shareAppMessage"],
      success: () => console.log("[share] showShareMenu success"),
      fail: err => console.warn("[share] showShareMenu failed", err)
    });
  }
  if (api.onShareAppMessage) {
    api.onShareAppMessage(() => {
      try {
        console.log("[share] onShareAppMessage 回调被触发! 当前 app.pvp.roomId=", app.pvp.roomId,
          "app.pvp.room=", JSON.stringify(app.pvp.room ? { roomId: app.pvp.room.roomId, _id: app.pvp.room._id } : null));
        const payload = getSharePayload();
        console.log("[share] 被动转发 payload:", JSON.stringify(payload));
        return payload;
      } catch (e) {
        console.error("[share] onShareAppMessage 回调异常:", e.message, e.stack);
        return { title: "来盘章鱼牌吧", query: "from=share_error" };
      }
    });
    console.log("[share] onShareAppMessage 已注册");
  } else {
    console.warn("[share] wx.onShareAppMessage 不存在，无法注册被动分享");
  }
}

function guideShare() {
  const api = typeof wx !== "undefined" ? wx : null;
  const roomId = normalizePvpRoomId(app.pvp.roomId);
  if (!roomId) return toast("房间创建后才能转发邀请");
  // 微信小游戏支持 wx.shareAppMessage 主动拉起转发
  if (api && api.shareAppMessage) {
    const payload = getSharePayload();
    console.log("[share] 主动转发 shareAppMessage:", JSON.stringify(payload));
    api.shareAppMessage({
      ...payload,
      success: () => console.log("[share] shareAppMessage success"),
      fail: (err) => {
        console.warn("[share] shareAppMessage fail:", JSON.stringify(err));
        // 主动分享被封禁时，引导右上角转发 + 复制房间号
        showShareFallback(api, roomId);
      }
    });
    return;
  }
  // 兜底提示
  showShareFallback(api, roomId);
}

function showShareFallback(api, roomId) {
  if (api && api.showModal) {
    api.showModal({
      title: `房间号 ${roomId}`,
      content: "方法一：点右上角『···』→『转发给朋友』，好友点卡片可加入。\n\n方法二：复制房间号发给好友，让好友在「联网对战」中输入房间号加入。",
      confirmText: "复制房间号",
      cancelText: "我知道了",
      success: res => {
        if (res.confirm) {
          if (pvpClient.copyRoomId(roomId)) toast("房间号已复制");
        }
        render();
      }
    });
    return;
  }
  toast(`房间号 ${roomId}，请点右上角···转发`);
}

function normalizePvpRoomId(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length === 4 ? digits : "";
}

function randomItem(list, fallback) {
  return list.length ? list[Math.floor(Math.random() * list.length)] : fallback;
}

function resolvePvpFaction(settings) {
  const value = settings.pvpFaction || settings.humanFaction || FACTION_KEYS[0];
  if (value === "random") return randomItem(FACTION_KEYS, FACTION_KEYS[0]);
  return FACTION_KEYS.includes(value) ? value : FACTION_KEYS[0];
}

function resolvePvpLeaderId(settings, faction) {
  const leaders = leadersFor(faction);
  const stored = settings.pvpLeaderIds?.[faction] ?? settings.humanLeaderIds?.[faction];
  if (stored === "random") return randomItem(leaders, null)?.id || "";
  return (leaders.find(card => card.id === stored) || leaders[0])?.id || "";
}

function normalizePvpRules(rules = {}) {
  const fallback = FACTION_KEYS[0];
  const faction = FACTION_KEYS.includes(rules.faction) ? rules.faction : fallback;
  return {
    factionMode: rules.factionMode === "fixed" ? "fixed" : "any",
    faction,
    deckMode: rules.deckMode === "autoOnly" ? "autoOnly" : "any",
    version: Number(rules.version || 0) || 0
  };
}

function currentRulesFromSettings() {
  const settings = loadSettings();
  return normalizePvpRules({
    factionMode: settings.pvpRuleFactionMode,
    faction: settings.pvpRuleFaction || settings.pvpFaction || settings.humanFaction,
    deckMode: settings.pvpRuleDeckMode
  });
}

function rememberPvpRules(rules) {
  const safe = normalizePvpRules(rules);
  saveSettings({
    pvpRuleFactionMode: safe.factionMode,
    pvpRuleFaction: safe.faction,
    pvpRuleDeckMode: safe.deckMode
  });
}

function currentPlayerSetup(ruleOverride = null) {
  const settings = loadSettings();
  const rules = ruleOverride ? normalizePvpRules(ruleOverride) : normalizePvpRules(app.pvp.room?.rules || {});
  const faction = rules.factionMode === "fixed" ? rules.faction : resolvePvpFaction(settings);
  const selectedIds = getActiveCustomDeckIds(settings, faction);
  const status = deckStatus(selectedIds, faction);
  const useCustomDeck = rules.deckMode !== "autoOnly" && settings.pvpDeckMode === "custom" && status.valid;
  // 不预设name，由云函数根据座位号分配 玩家一/玩家二
  return {
    faction,
    leaderId: resolvePvpLeaderId(settings, faction),
    customDeckIds: useCustomDeck ? status.ids : []
  };
}

function decorateOnlineMatch(match) {
  if (!match) return null;
  match.mode = "online";
  match.localPlayerIndex = app.pvp.playerIndex;
  return match;
}

function cardLabel(card) {
  return card ? (card.name || card.baseName || "主将") : "主将";
}

// 联网对局结束时，以本地玩家视角记录战绩到本机
function recordOnlineMatch(match) {
  if (!match || !match.over) return;
  const roomKey = app.pvp.roomId || "";
  if (app.pvp.recordedResultRoom === roomKey && roomKey) return;
  app.pvp.recordedResultRoom = roomKey;

  const meIdx = Number.isInteger(app.pvp.playerIndex) ? app.pvp.playerIndex : 0;
  const oppIdx = 1 - meIdx;
  const me = match.players[meIdx];
  const opp = match.players[oppIdx];
  if (!me || !opp) return;

  // 把座位视角的 winner 转换为“我方视角”：0=我方胜，1=我方负，null=平局
  let winner = match.winner;
  if (winner === meIdx) winner = 0;
  else if (winner === oppIdx) winner = 1;

  const surrendered = match.endReason === "surrender";
  let resultText;
  if (winner == null) resultText = "平局";
  else if (winner === 0) resultText = surrendered ? "对方认输" : "你赢了";
  else resultText = surrendered ? "你已认输" : "你输了";

  const roundResults = (match.roundResults || []).map(r => ({
    round: r.round,
    scores: [r.scores?.[meIdx] || 0, r.scores?.[oppIdx] || 0],
    winner: r.winner == null ? null : (r.winner === meIdx ? 0 : 1)
  }));

  recordMatch({
    time: Date.now(),
    resultText,
    winner,
    rounds: [me.roundsWon || 0, opp.roundsWon || 0],
    scores: [match.finalScores?.[meIdx] || 0, match.finalScores?.[oppIdx] || 0],
    roundResults,
    humanFaction: me.factionName || me.faction,
    aiFaction: opp.factionName || opp.faction,
    humanLeader: cardLabel(me.leader),
    aiLeader: cardLabel(opp.leader),
    humanLeaderId: me.leader?.id || "",
    aiLeaderId: opp.leader?.id || "",
    difficulty: "pvp",
    mode: "online",
    endReason: match.endReason || "normal"
  });
}

function applyRoomUpdate(room, playerIndex) {
  if (!room) return;
  const roomId = normalizePvpRoomId(room.roomId || room._id || app.pvp.roomId);
  console.log("[pvp] applyRoomUpdate: status=", room.status, "playerIndex=", playerIndex,
    "roomId=", roomId, "players=", (room.players || []).length, "currentScene=", app.scene);
  const prevVersion = app.pvp.room?.rules?.version || 0;
  const nextVersion = room.rules?.version || 0;
  app.pvp.room = room;
  if (roomId) app.pvp.roomId = roomId;
  if (Number.isInteger(playerIndex)) app.pvp.playerIndex = playerIndex;
  if (room.match) app.match = decorateOnlineMatch(room.match);
  else if (room.status !== "finished") app.match = null;
  app.pvp.loading = false;
  app.pvp.submitting = false;
  app.pvp.error = "";
  if (app.pvp.playerIndex === 1 && prevVersion && nextVersion > prevVersion && room.status === "waiting") {
    toast("房主修改了规则，请重新准备");
  }
  app.pvp.lastSeenRuleVersion = nextVersion || app.pvp.lastSeenRuleVersion || 0;
  if (room.status === "playing" && app.match) {
    if (app.scene !== "battle") app.ui.mulliganGuideShown = false;
    app.ui.handPage = clampHandPage(app.ui.handPage);
    openMulliganGuideDetail();
    if (app.scene !== "battle") return setScene("battle");
  }
  if (room.status === "finished" && app.match) {
    recordOnlineMatch(app.match);
    if (app.scene !== "result") return setScene("result");
  }
  if (room.status === "selecting") {
    app.ui.matchSetupDropdown = "";
    app.ui.matchSetupCardDetailId = "";
    if (app.scene !== "pvpSetup") return setScene("pvpSetup");
  }
  if (room.status === "waiting" && ["battle", "result", "pvpSetup"].includes(app.scene)) return setScene("pvpRoom");
  render();
}

function watchPvpRoom(roomId) {
  try {
    pvpClient.watchRoom(roomId, room => applyRoomUpdate(room), err => {
      console.warn("[pvp] watch failed", err);
      app.pvp.error = "房间同步断开，请返回后重试";
      app.pvp.loading = false;
      render();
    });
  } catch (err) {
    app.pvp.error = err.message || "无法监听房间";
    app.pvp.loading = false;
    render();
  }
}

function resetPvpState() {
  pvpClient.closeRoomWatch();
  app.pvp = { roomId: "", pendingRoomId: "", room: null, playerIndex: 0, loading: false, submitting: false, error: "", recordedResultRoom: "", lastSeenRuleVersion: 0 };
}

function enterPvpSetup(roomId) {
  resetPvpState();
  app.pvp.pendingRoomId = normalizePvpRoomId(roomId);
  app.ui.matchSetupDropdown = "";
  app.ui.matchSetupCardDetailId = "";
  setScene("pvpSetup");
}

function createPvpRoom() {
  const rules = currentRulesFromSettings();
  resetPvpState();
  app.pvp.loading = true;
  setScene("pvpRoom");
  pvpClient.createRoom(currentPlayerSetup(rules), rules).then(result => {
    app.pvp.roomId = result.roomId;
    app.pvp.playerIndex = result.playerIndex || 0;
    applyRoomUpdate(result.room, app.pvp.playerIndex);
    watchPvpRoom(result.roomId);
    toast("可先确认规则，再转发好友");
  }).catch(err => {
    console.warn("[pvp] create failed", err);
    app.pvp.loading = false;
    app.pvp.error = err.message || "开房间失败";
    render();
  });
}

function joinPvpRoom(roomId) {
  const safeRoomId = normalizePvpRoomId(roomId);
  if (!safeRoomId) return toast("请输入4位数字房间号");
  console.log("[pvp] joinPvpRoom 开始, roomId=", safeRoomId);
  resetPvpState();
  app.pvp.roomId = safeRoomId;
  app.pvp.loading = true;
  setScene("pvpRoom");
  pvpClient.joinRoom(safeRoomId, currentPlayerSetup()).then(result => {
    console.log("[pvp] joinRoom 云函数返回成功, roomId=", result.roomId,
      "playerIndex=", result.playerIndex, "room.status=", result.room?.status,
      "players=", result.room?.players?.length);
    app.pvp.roomId = result.roomId;
    app.pvp.playerIndex = Number.isInteger(result.playerIndex) ? result.playerIndex : 1;
    applyRoomUpdate(result.room, app.pvp.playerIndex);
    watchPvpRoom(result.roomId);
  }).catch(err => {
    console.warn("[pvp] join failed", err);
    app.pvp.loading = false;
    app.pvp.error = err.message || "加入房间失败";
    render();
  });
}

function promptJoinPvpRoom() {
  const api = typeof wx !== "undefined" ? wx : null;
  if (!api || !api.showModal) return toast("当前环境不支持输入房间号");
  api.showModal({
    title: "加入房间",
    content: "",
    editable: true,
    placeholderText: "请输入4位数字房间号",
    success: res => {
      if (!res.confirm) return render();
      joinPvpRoom(res.content);
    }
  });
}

function safeDecode(value) {
  const text = String(value || "");
  try { return decodeURIComponent(text); } catch (e) { return text; }
}

function extractRoomIdFromText(value) {
  const text = safeDecode(value);
  const direct = normalizePvpRoomId(text);
  if (direct) return direct;
  const keyed = text.match(/(?:roomId|roomid|pvpRoomId|room|r)[^0-9]{0,16}(\d{4})(?!\d)/i);
  if (keyed) return keyed[1];
  return "";
}

function extractSharedRoomId(options = {}) {
  if (typeof options === "string") return extractRoomIdFromText(options);
  const query = options?.query || {};
  if (typeof query === "string") return extractRoomIdFromText(query);
  const keys = ["roomId", "roomid", "pvpRoomId", "pvpRoomID", "room", "r"];
  for (const key of keys) {
    const roomId = extractRoomIdFromText(query[key]);
    if (roomId) return roomId;
  }
  for (const [key, value] of Object.entries(query)) {
    if (!/room|^r$/i.test(key)) continue;
    const roomId = extractRoomIdFromText(value);
    if (roomId) return roomId;
  }
  for (const value of Object.values(query)) {
    const roomId = extractRoomIdFromText(value);
    if (roomId) return roomId;
  }
  return extractRoomIdFromText(options?.path || JSON.stringify(options?.referrerInfo?.extraData || {}));
}

function describeScene(scene) {
  const map = {
    1001: "最近使用列表",
    1005: "微信顶部搜索结果",
    1006: "发现-小程序搜索结果",
    1007: "单聊会话卡片",
    1008: "群聊会话卡片",
    1010: "收藏夹",
    1011: "扫描二维码",
    1012: "长按图片识别二维码",
    1023: "桌面图标",
    1024: "小程序 profile 页",
    1035: "公众号自定义菜单",
    1036: "App 分享卡片",
    1037: "小程序打开小程序",
    1044: "群聊卡片(带 shareTicket)",
    1047: "扫描小程序码",
    1058: "公众号文章",
    1089: "微信聊天主界面下拉，「最近使用」栏(小游戏中心)"
  };
  return map[scene] ? `${scene}(${map[scene]})` : `${scene ?? "未知"}`;
}

function readSharedRoomId(options) {
  const fromOptions = extractSharedRoomId(options);
  if (fromOptions) return fromOptions;
  const api = typeof wx !== "undefined" ? wx : null;
  if (!api) return "";
  // 本次打开参数（冷启动/热启动），优先读取最新入口
  try {
    const enter = api.getEnterOptionsSync && api.getEnterOptionsSync();
    const fromEnter = extractSharedRoomId(enter);
    console.log("[launch] enterOptions scene:", describeScene(enter?.scene), "query:", JSON.stringify(enter?.query || {}), "roomId:", fromEnter);
    if (fromEnter) return fromEnter;
  } catch (e) {}
  // 冷启动参数兜底
  try {
    const launch = api.getLaunchOptionsSync && api.getLaunchOptionsSync();
    const fromLaunch = extractSharedRoomId(launch);
    console.log("[launch] launchOptions scene:", describeScene(launch?.scene), "query:", JSON.stringify(launch?.query || {}), "roomId:", fromLaunch);
    if (fromLaunch) return fromLaunch;
  } catch (e) {}
  return "";
}

function handleSharedRoomId(roomId, source) {
  const safeRoomId = normalizePvpRoomId(roomId);
  if (!safeRoomId || safeRoomId === app.pvp.roomId) return false;
  console.log(`[launch] ${source} 检测到房间号，进入联网对战:`, safeRoomId);
  joinPvpRoom(safeRoomId);
  return true;
}

function hasRoomHint(options) {
  const query = options?.query;
  if (!query) return false;
  if (typeof query === "string") return /room|\br\b/i.test(query);
  const keys = Object.keys(query);
  if (!keys.length) return false;
  return keys.some(k => /room|^r$/i.test(k));
}

function handleLaunchRoom() {
  const api = typeof wx !== "undefined" ? wx : null;
  if (!api) return;
  if (!handleSharedRoomId(readSharedRoomId(), "启动")) {
    console.log("[launch] 启动未检测到 roomId，保持主页");
  }
  if (api.onShow) {
    api.onShow(options => {
      if (handleSharedRoomId(readSharedRoomId(options), "onShow")) return;
      // 只在入口 query 明显带有 room 关键字时才走兜底解析，避免正常切前台产生噪音
      if (!hasRoomHint(options)) return;
      setTimeout(() => {
        if (handleSharedRoomId(readSharedRoomId(), "onShow兜底")) return;
        console.log("[launch] onShow 检测到 room 相关参数但未解析到 roomId，保持当前场景");
        render();
      }, 300);
    });
  }
}

function isOnlineMatch() {
  return app.match && app.match.mode === "online" && app.pvp.roomId;
}

function pvpPendingOwner() {
  if (!app.match?.pending) return app.match?.current || 0;
  if (Number.isInteger(app.match.pending.playerIndex)) return app.match.pending.playerIndex;
  return app.match.current || 0;
}

function isMyPvpTurn() {
  if (!isOnlineMatch()) return false;
  if (app.match.mulligan?.active) {
    if (app.match.mulligan.simultaneous) return !app.match.mulligan.done?.[app.pvp.playerIndex];
    return app.match.mulligan.current === app.pvp.playerIndex;
  }
  if (app.match.pending) return pvpPendingOwner() === app.pvp.playerIndex;
  return app.match.current === app.pvp.playerIndex;
}

function submitPvpAction(battleAction) {
  if (!isOnlineMatch()) return false;
  if (app.pvp.submitting) return true;
  if (!isMyPvpTurn() && battleAction.type !== "surrender") {
    toast("等待对方行动");
    return true;
  }
  app.pvp.submitting = true;
  pvpClient.submitAction(app.pvp.roomId, app.pvp.room?.turnSeq || 0, battleAction).then(result => {
    applyRoomUpdate(result.room, result.playerIndex);
  }).catch(err => {
    console.warn("[pvp] action failed", err);
    app.pvp.submitting = false;
    toast(err.message || "行动失败");
    render();
  });
  return true;
}

function clampHandPage(page) {
  if (!app.match) return 0;
  const current = app.match.players[handOwnerIndex(app.match)] || app.match.players[0];
  const total = Math.max(1, Math.ceil(current.hand.length / 5));
  return Math.max(0, Math.min(page, total - 1));
}

function afterHumanAction() {
  if (!app.match) return;
  app.ui.handPage = clampHandPage(app.ui.handPage);
  if (app.match.over) setScene("result");
  else {
    render();
    if (!app.match.pending) scheduleAi();
  }
}

function performSurrenderMatch() {
  if (!app.match || app.match.over) return render();
  if (isOnlineMatch()) return submitPvpAction({ type: "surrender" });
  surrender(app.match, app.match.current);
  return setScene("result");
}

function confirmSurrenderMatch() {
  const api = typeof wx !== "undefined" ? wx : null;
  if (api && api.showModal) {
    api.showModal({
      title: "确认认输",
      content: "认输后将直接结束本局，确定要认输吗？",
      confirmText: "认输",
      confirmColor: "#8f3c1f",
      cancelText: "再想想",
      success: res => {
        if (res.confirm) performSurrenderMatch();
        else render();
      },
      fail: () => render()
    });
    return;
  }
  if (typeof globalThis !== "undefined" && typeof globalThis.confirm === "function" && !globalThis.confirm("确定要认输吗？")) return render();
  return performSurrenderMatch();
}

function handleMenu(action) {
  if (action.id === "start") {
    app.ui.deckReturnScene = "matchSetup";
    app.ui.matchSetupDropdown = "";
    return setScene("matchSetup");
  }
  if (action.id === "settings") {
    app.ui.settingDropdown = "";
    app.ui.settingDeckPage = 0;
    return setScene("settings");
  }
  if (action.id === "history") {
    app.ui.historyPage = 0;
    app.ui.historyLeaderDetailId = "";
    setScene("history");
  }
  if (action.id === "pvp") return enterPvpSetup();
  if (action.id === "rules") setScene("rules");
}

function applyMatchSetupOption(action) {
  const settings = loadSettings();
  const field = action.field;
  const value = action.value;
  app.ui.matchSetupDropdown = "";
  if (field === "humanFaction") {
    app.ui.deckPage = 0;
    saveSettings({ humanFaction: value });
  }
  if (field === "humanLeader") {
    saveSettings({ humanLeaderIds: { ...(settings.humanLeaderIds || {}), [settings.humanFaction]: value } });
  }
  if (field === "aiFaction") saveSettings({ aiFaction: value, aiOpponentRemembered: true });
  if (field === "aiLeader") {
    saveSettings({ aiLeaderIds: { ...(settings.aiLeaderIds || {}), [settings.aiFaction]: value }, aiOpponentRemembered: true });
  }
  if (field === "difficulty") saveSettings({ difficulty: value });
  render();
}

function handleMatchSetup(action) {
  const selectFields = ["humanFaction", "humanLeader", "aiFaction", "aiLeader", "difficulty"];
  if (action.id === "matchSetupCardDetail") {
    app.ui.matchSetupDropdown = "";
    app.ui.matchSetupCardDetailId = action.cardId || "";
    return render();
  }
  if (action.id === "detailPanel") return;
  if (action.id === "closeDetail") {
    app.ui.matchSetupCardDetailId = "";
    return render();
  }
  if (app.ui.matchSetupCardDetailId) return render();
  if (action.id === "closeMatchSetupDropdown") {
    app.ui.matchSetupDropdown = "";
    return render();
  }
  if (action.id === "selectMatchSetupOption") return applyMatchSetupOption(action);
  if (selectFields.includes(action.id)) {
    app.ui.matchSetupDropdown = app.ui.matchSetupDropdown === action.id ? "" : action.id;
    return render();
  }

  app.ui.matchSetupDropdown = "";
  const settings = loadSettings();
  const faction = settings.humanFaction;
  const selectedIds = getActiveCustomDeckIds(settings, faction);
  const status = deckStatus(selectedIds, faction);
  const useCustomDeck = status.valid && settings.customDeckEnabled;
  if (action.id === "togglePreparedDeckMode") {
    if (!status.valid) return render();
    saveSettings({ customDeckEnabled: !useCustomDeck });
    return render();
  }
  if (action.id === "editCustomDeck") {
    app.ui.deckPage = 0;
    app.ui.deckSlotDropdown = "";
    app.ui.deckReturnScene = "matchSetup";
    return setScene("deckBuilder");
  }
  if (action.id === "startPrepared") {
    const startOptions = useCustomDeck
      ? { mode: "ai", customDeckEnabled: true, humanCustomDeckIds: status.ids }
      : { mode: "ai", customDeckEnabled: false };
    saveSettings({ mode: "ai", customDeckEnabled: useCustomDeck });
    return startMatch(startOptions);
  }
  if (action.id === "back") return setScene("menu");
  render();
}

function applyPvpSetupOption(action) {
  const settings = loadSettings();
  const field = action.field;
  const value = action.value;
  app.ui.matchSetupDropdown = "";
  if (field === "pvpFaction") {
    const patch = { pvpFaction: value };
    if (value !== "random") patch.humanFaction = value;
    saveSettings(patch);
  }
  if (field === "pvpLeader") {
    const rules = normalizePvpRules(app.pvp.room?.rules || {});
    const faction = app.pvp.room?.status === "selecting" && rules.factionMode === "fixed" ? rules.faction : (settings.pvpFaction || settings.humanFaction);
    if (faction !== "random") saveSettings({ pvpLeaderIds: { ...(settings.pvpLeaderIds || {}), [faction]: value } });
  }
  render();
}

function handlePvpSetup(action) {
  const selectingOnline = app.pvp.room?.status === "selecting";
  const rules = normalizePvpRules(app.pvp.room?.rules || {});
  const factionLocked = selectingOnline && rules.factionMode === "fixed";
  const deckLocked = selectingOnline && rules.deckMode === "autoOnly";
  const selectFields = factionLocked ? ["pvpLeader"] : ["pvpFaction", "pvpLeader"];
  if (action.id === "matchSetupCardDetail") {
    app.ui.matchSetupDropdown = "";
    app.ui.matchSetupCardDetailId = action.cardId || "";
    return render();
  }
  if (action.id === "detailPanel") return;
  if (action.id === "closeDetail") {
    app.ui.matchSetupCardDetailId = "";
    return render();
  }
  if (app.ui.matchSetupCardDetailId) return render();
  if (action.id === "closePvpSetupDropdown") {
    app.ui.matchSetupDropdown = "";
    return render();
  }
  if (action.id === "selectPvpSetupOption") return applyPvpSetupOption(action);
  if (selectFields.includes(action.id)) {
    app.ui.matchSetupDropdown = app.ui.matchSetupDropdown === action.id ? "" : action.id;
    return render();
  }

  app.ui.matchSetupDropdown = "";
  if (!selectingOnline && action.id === "pvpRuleFactionMode") {
    const current = currentRulesFromSettings();
    const nextMode = action.value === "fixed" ? "fixed" : "any";
    saveSettings({ pvpRuleFactionMode: nextMode, pvpRuleFaction: current.faction });
    return render();
  }
  if (!selectingOnline && action.id === "pvpRuleFactionNext") {
    const current = currentRulesFromSettings();
    const nextIndex = (FACTION_KEYS.indexOf(current.faction) + 1) % FACTION_KEYS.length;
    saveSettings({ pvpRuleFactionMode: "fixed", pvpRuleFaction: FACTION_KEYS[nextIndex] });
    return render();
  }
  if (!selectingOnline && action.id === "pvpRuleDeckMode") {
    saveSettings({ pvpRuleDeckMode: action.value === "autoOnly" ? "autoOnly" : "any" });
    return render();
  }
  const settings = loadSettings();
  const faction = factionLocked ? rules.faction : (settings.pvpFaction || settings.humanFaction);
  if (action.id === "pvpDeckMode") {
    if (deckLocked && action.value === "custom") return toast("本房间仅允许自动卡牌");
    if (action.value === "custom" && faction === "random") return toast("随机阵营将使用随机卡牌");
    saveSettings({ pvpDeckMode: action.value === "custom" ? "custom" : "random" });
    return render();
  }
  if (action.id === "editPvpCustomDeck") {
    if (deckLocked) return toast("本房间仅允许自动卡牌");
    if (faction === "random") return toast("请先选择具体阵营");
    saveSettings({ humanFaction: faction });
    app.ui.deckPage = 0;
    app.ui.deckSlotDropdown = "";
    app.ui.deckReturnScene = "pvpSetup";
    return setScene("deckBuilder");
  }
  if (action.id === "pvpSubmitSetup") return submitPvpSetup();
  if (action.id === "pvpRoomBack") return setScene("pvpRoom");
  if (action.id === "pvpCreatePrepared") return createPvpRoom();
  if (action.id === "pvpJoinPrepared") {
    if (app.pvp.pendingRoomId) return joinPvpRoom(app.pvp.pendingRoomId);
    return promptJoinPvpRoom();
  }
  if (action.id === "back") {
    resetPvpState();
    return setScene("menu");
  }
  render();
}

function applySettingOption(action) {
  const settings = loadSettings();
  const field = action.field;
  const value = action.value;
  app.ui.settingDropdown = "";
  if (field === "humanLeader") {
    saveSettings({ humanLeaderIds: { ...(settings.humanLeaderIds || {}), [settings.humanFaction]: value } });
  }
  render();
}

function toast(title) {
  if (typeof wx !== "undefined" && wx.showToast) wx.showToast({ title, icon: "none" });
}

function actionCardIds(action) {
  if (Array.isArray(action.cardIds)) return action.cardIds.filter(Boolean);
  return action.cardId ? [action.cardId] : [];
}

function addOneCardFromGroup(currentIds, groupIds, faction) {
  const nextId = groupIds.find(id => !currentIds.includes(id));
  if (!nextId) return currentIds;
  const card = cardById(nextId);
  if (!card) return currentIds;
  const status = deckStatus(currentIds, faction);
  const isSpecial = card.category === "special" || card.category === "weather";
  if (status.total >= 40 || (isSpecial && status.specials >= 10)) return currentIds;
  return currentIds.concat(nextId);
}

function removeOneCardFromGroup(currentIds, groupIds) {
  const groupSet = new Set(groupIds);
  const index = currentIds.map(id => groupSet.has(id)).lastIndexOf(true);
  if (index < 0) return currentIds;
  const nextIds = currentIds.slice();
  nextIds.splice(index, 1);
  return nextIds;
}

function handleSettings(action) {
  const selectFields = ["humanLeader"];
  if (action.id === "settingCardDetail") {
    app.ui.settingDropdown = "";
    app.ui.settingCardDetailId = action.cardId || "";
    return render();
  }
  if (action.id === "detailPanel") return;
  if (action.id === "closeDetail") {
    app.ui.settingCardDetailId = "";
    return render();
  }
  if (app.ui.settingCardDetailId) return render();
  if (action.id === "closeSettingDropdown") {
    app.ui.settingDropdown = "";
    return render();
  }
  if (action.id === "selectSettingOption") return applySettingOption(action);
  if (selectFields.includes(action.id)) {
    app.ui.settingDropdown = app.ui.settingDropdown === action.id ? "" : action.id;
    return render();
  }
  if (action.id === "selectSettingFaction") {
    app.ui.settingDropdown = "";
    app.ui.settingDeckPage = 0;
    saveSettings({ humanFaction: action.faction });
    return render();
  }
  if (action.id === "settingCardTab") {
    app.ui.settingCardTab = action.value || "all";
    app.ui.settingDeckPage = 0;
    return render();
  }
  if (action.id === "addSettingCard") {
    const settings = loadSettings();
    const faction = settings.humanFaction;
    const currentIds = getActiveCustomDeckIds(settings, faction).slice();
    const groupIds = actionCardIds(action);
    const nextIds = toggleCardInGroup(currentIds, groupIds, faction);
    const nextStatus = deckStatus(nextIds, faction);
    saveCustomDeckSlot(faction, 0, nextStatus.ids, nextStatus.valid, null, true);
    return render();
  }
  if (action.id === "autoCustomDeck") {
    const settings = loadSettings();
    const faction = settings.humanFaction;
    app.ui.settingDropdown = "";
    app.ui.settingDeckPage = 0;
    saveCustomDeckSlot(faction, 0, recommendedDeckIds(faction, "normal"), true, null, true);
    toast("已随机推荐，可继续调整");
    return render();
  }
  if (action.id === "clearCustomDeck") {
    const settings = loadSettings();
    const faction = settings.humanFaction;
    app.ui.settingDropdown = "";
    app.ui.settingDeckPage = 0;
    saveCustomDeckSlot(faction, 0, [], false, null, true);
    return render();
  }
  if (action.id === "back") {
    app.ui.settingDropdown = "";
    return setScene("menu");
  }
  render();
}

function saveCustomDeckSlot(faction, slotIndex, ids, enabled, name, activate = true) {
  const settings = loadSettings();
  const slots = getCustomDeckSlots(settings, faction);
  const safeIndex = Math.max(0, Math.min(slots.length - 1, slotIndex || 0));
  const nextIds = Array.isArray(ids) ? ids.slice(0, 40) : [];
  slots[safeIndex] = { ...slots[safeIndex], ids: nextIds, name: "自定义牌组" };
  const nextSlots = { ...(settings.customDeckSlots || {}), [faction]: slots };
  const patch = { customDeckSlots: nextSlots };
  if (activate) {
    patch.activeCustomDeckSlot = { ...(settings.activeCustomDeckSlot || {}), [faction]: safeIndex };
    patch.customDecks = { ...(settings.customDecks || {}), [faction]: nextIds };
  }
  if (enabled != null) patch.customDeckEnabled = enabled;
  saveSettings(patch);
}

function toggleCardInGroup(currentIds, groupIds, faction) {
  const groupSet = new Set(groupIds);
  const currentCount = currentIds.filter(id => groupSet.has(id)).length;
  const maxCount = groupIds.length;
  if (currentCount >= maxCount) {
    // 全选了，清空该组
    return currentIds.filter(id => !groupSet.has(id));
  }
  // 还没选满，+1
  return addOneCardFromGroup(currentIds, groupIds, faction);
}

function handleDeckBuilder(action) {
  const settings = loadSettings();
  const faction = settings.humanFaction;
  const slotIndex = getActiveCustomDeckSlotIndex(settings, faction);
  const currentIds = getActiveCustomDeckIds(settings, faction).slice();
  if (action.id === "deckCardDetail") {
    app.ui.deckSlotDropdown = "";
    app.ui.deckCardDetailId = action.cardId || "";
    return render();
  }
  if (action.id === "detailPanel") return;
  if (action.id === "closeDetail") {
    app.ui.deckCardDetailId = "";
    return render();
  }
  if (app.ui.deckCardDetailId) return render();
  app.ui.deckSlotDropdown = "";
  if (action.id === "backSettings") return setScene(app.ui.deckReturnScene || "settings");
  if (action.id === "autoCustomDeck") {
    saveCustomDeckSlot(faction, slotIndex, recommendedDeckIds(faction, "normal"), true);
    app.ui.deckPage = 0;
  }
  if (action.id === "clearCustomDeck") {
    saveCustomDeckSlot(faction, slotIndex, [], false);
    app.ui.deckPage = 0;
  }
  if (action.id === "addCustomCard") {
    const groupIds = actionCardIds(action);
    const nextIds = toggleCardInGroup(currentIds, groupIds, faction);
    const nextStatus = deckStatus(nextIds, faction);
    saveCustomDeckSlot(faction, slotIndex, nextStatus.ids, nextStatus.valid);
  }
  render();
}

function handleHistory(action) {
  if (action.id === "detailPanel") return;
  if (action.id === "closeDetail") {
    app.ui.historyLeaderDetailId = "";
    return render();
  }
  if (app.ui.historyLeaderDetailId) return render();
  if (action.id === "back") return setScene("menu");
  render();
}

function updatePvpRoomRules(patch) {
  if (!app.pvp.roomId || app.pvp.submitting) return;
  const rules = normalizePvpRules({ ...(app.pvp.room?.rules || currentRulesFromSettings()), ...patch });
  rememberPvpRules(rules);
  app.pvp.submitting = true;
  pvpClient.updateRules(app.pvp.roomId, rules).then(result => {
    applyRoomUpdate(result.room, result.playerIndex);
  }).catch(err => {
    app.pvp.submitting = false;
    toast(err.message || "修改规则失败");
    render();
  });
}

function setPvpReady(ready) {
  if (!app.pvp.roomId || app.pvp.submitting) {
    console.log("[pvp] setPvpReady 被跳过: roomId=", app.pvp.roomId, "submitting=", app.pvp.submitting);
    return;
  }
  console.log("[pvp] setPvpReady:", ready, "roomId=", app.pvp.roomId);
  app.pvp.submitting = true;
  pvpClient.setReady(app.pvp.roomId, ready).then(result => {
    console.log("[pvp] setReady 成功, room.status=", result.room?.status);
    applyRoomUpdate(result.room, result.playerIndex);
  }).catch(err => {
    app.pvp.submitting = false;
    toast(err.message || "准备失败");
    render();
  });
}

function startPvpSelection() {
  if (!app.pvp.roomId || app.pvp.submitting) {
    console.log("[pvp] startPvpSelection 被跳过: roomId=", app.pvp.roomId, "submitting=", app.pvp.submitting);
    return;
  }
  console.log("[pvp] startPvpSelection, roomId=", app.pvp.roomId);
  app.pvp.submitting = true;
  pvpClient.startSelection(app.pvp.roomId).then(result => {
    console.log("[pvp] startSelection 成功, room.status=", result.room?.status);
    applyRoomUpdate(result.room, result.playerIndex);
  }).catch(err => {
    app.pvp.submitting = false;
    toast(err.message || "开始失败");
    render();
  });
}

function submitPvpSetup() {
  if (!app.pvp.roomId || app.pvp.submitting) return;
  app.pvp.submitting = true;
  pvpClient.submitSetup(app.pvp.roomId, currentPlayerSetup(app.pvp.room?.rules)).then(result => {
    applyRoomUpdate(result.room, result.playerIndex);
  }).catch(err => {
    app.pvp.submitting = false;
    toast(err.message || "确认配置失败");
    render();
  });
}

function returnPvpRoom() {
  if (!app.pvp.roomId) return setScene("menu");
  if (app.pvp.room?.status !== "finished") return setScene("pvpRoom");
  if (app.pvp.submitting) return;
  app.pvp.submitting = true;
  pvpClient.returnToRoom(app.pvp.roomId).then(result => {
    applyRoomUpdate(result.room, result.playerIndex);
  }).catch(err => {
    app.pvp.submitting = false;
    toast(err.message || "返回房间失败");
    render();
  });
}

function handlePvpRoom(action) {
  if (action.id === "pvpCreate") return createPvpRoom();
  if (action.id === "pvpShare") return guideShare();
  if (action.id === "pvpCopy") {
    if (pvpClient.copyRoomId(app.pvp.roomId)) toast("房间号已复制");
    else toast(app.pvp.roomId || "暂无房间号");
    return render();
  }
  if (action.id === "pvpCopyError") {
    const message = [`房间号：${app.pvp.roomId || "无"}`, `错误信息：${app.pvp.error || "无"}`].join("\n");
    if (pvpClient.copyText(message)) toast("错误信息已复制");
    else toast(app.pvp.error || "暂无错误信息");
    return render();
  }
  if (action.id === "pvpJoin") return promptJoinPvpRoom();
  if (action.id === "pvpRuleFactionMode") {
    const current = normalizePvpRules(app.pvp.room?.rules || currentRulesFromSettings());
    return updatePvpRoomRules({ factionMode: current.factionMode === "fixed" ? "any" : "fixed" });
  }
  if (action.id === "pvpRuleFactionNext") {
    const current = normalizePvpRules(app.pvp.room?.rules || currentRulesFromSettings());
    const nextIndex = (FACTION_KEYS.indexOf(current.faction) + 1) % FACTION_KEYS.length;
    return updatePvpRoomRules({ factionMode: "fixed", faction: FACTION_KEYS[nextIndex] });
  }
  if (action.id === "pvpRuleDeckMode") {
    const current = normalizePvpRules(app.pvp.room?.rules || currentRulesFromSettings());
    return updatePvpRoomRules({ deckMode: current.deckMode === "autoOnly" ? "any" : "autoOnly" });
  }
  if (action.id === "pvpReady") return setPvpReady(!app.pvp.room?.players?.[app.pvp.playerIndex]?.ready);
  if (action.id === "pvpStartSelection") return startPvpSelection();
  if (action.id === "pvpGoSetup") return setScene("pvpSetup");
  if (action.id === "pvpReturnRoom") return returnPvpRoom();
  if (action.id === "pvpBack") {
    resetPvpState();
    return setScene("menu");
  }
  render();
}

function handleBattle(action) {
  if (action.id === "closeCardGuide") {
    app.ui.showCardGuide = false;
    saveProgress({ finishedTutorial: true });
    return render();
  }
  if (!app.match) return;
  if (action.id === "battleLog") return render();
  if (action.id === "closeBattleLogHistory") {
    app.ui.battleLogHistoryOpen = false;
    app.ui.battleLogHistoryScroll = 0;
    return render();
  }
  if (action.id === "battleLogHistoryPanel") return render();
  if (action.id === "dismissRecentPlay") {
    app.ui.dismissedRecentPlaySeq = Math.max(app.ui.dismissedRecentPlaySeq || 0, action.seq || app.match.lastPlayed?.seq || 0);
    clearRecentPlayTimer();
    return render();
  }
  if (action.id === "battleCardDetail") return render();
  if (action.id === "detailPanel") {
    if (app.ui.mulliganHelpOpen) {
      app.ui.mulliganHelpOpen = false;
      return render();
    }
    return;
  }
  if (action.id === "mulliganHelp") {
    app.ui.mulliganHelpOpen = !app.ui.mulliganHelpOpen;
    return render();
  }
  if (action.id === "mulliganHelpPanel") return render();
  if (action.id === "closeDetail") {
    if (app.ui.mulliganHelpOpen) {
      app.ui.mulliganHelpOpen = false;
      return render();
    }
    app.ui.battleCardDetailId = "";
    app.ui.battleCardDetailUid = "";
    app.ui.mulliganHelpOpen = false;
    return render();
  }
  if (action.id === "mulliganDetailSwap") {
    if (!app.match.mulligan?.active || !action.cardUid) return render();
    if (isOnlineMatch()) {
      app.ui.battleCardDetailId = "";
      app.ui.battleCardDetailUid = "";
      app.ui.detailSwipe = null;
      app.ui.handPage = 0;
      return submitPvpAction({ type: "mulliganSwap", cardUid: action.cardUid });
    }
    startMulliganSwapSequence(action.cardUid);
    return;
  }
  if (app.ui.battleCardDetailId || app.ui.battleCardDetailUid) return render();
  if (app.ui.battleLogHistoryOpen) return render();
  if (action.id === "viewDiscardPile") {
    app.ui.discardPileOwner = Number.isInteger(action.playerIndex) ? action.playerIndex : 0;
    app.ui.discardPilePage = 0;
    return render();
  }
  if (action.id === "closeDiscardPile") {
    app.ui.discardPileOwner = null;
    app.ui.discardPilePage = 0;
    return render();
  }
  if (action.id === "switchDiscardPile") {
    app.ui.discardPileOwner = Number.isInteger(action.playerIndex) ? action.playerIndex : 0;
    app.ui.discardPilePage = 0;
    return render();
  }
  if (action.id === "discardPilePage") {
    app.ui.discardPilePage = Math.max(0, (app.ui.discardPilePage || 0) + (action.delta || 0));
    return render();
  }
  if (action.id === "discardPilePanel") return render();
  if (app.ui.discardPileOwner != null) return render();
  if (action.id === "home") {
    if (app.match.over) {
      if (isOnlineMatch()) resetPvpState();
      return setScene("menu");
    }
    return render();
  }
  if (action.id === "surrenderMatch") return confirmSurrenderMatch();
  if (app.match.over) return;

  if (isOnlineMatch()) {
    if (app.match.pending) {
      if (action.id === "rowChoice") return submitPvpAction({ type: "resolvePending", choice: { row: action.row } });
      if (action.id === "targetChoice") return submitPvpAction({ type: "resolvePending", choice: { uid: action.cardUid } });
      if (action.id === "pendingSkip") return submitPvpAction({ type: "resolvePending", choice: { skip: true } });
      if (action.id === "pendingCancel") return submitPvpAction({ type: "cancelPending" });
      return render();
    }
    if (action.id === "leaderAvatar") {
      if (action.playerIndex === app.match.current && !app.match.mulligan?.active) return submitPvpAction({ type: "leader" });
      return render();
    }
    if (app.match.mulligan?.active) {
      if (action.id === "card") { app.ui.handPage = 0; return submitPvpAction({ type: "mulliganSwap", cardUid: action.cardUid }); }
      if (action.id === "mulliganDone") return submitPvpAction({ type: "mulliganDone" });
      return render();
    }
    if (action.id === "leader") return submitPvpAction({ type: "leader" });
    if (action.id === "auto") return submitPvpAction({ type: "auto" });
    if (action.id === "card") return submitPvpAction({ type: "card", cardUid: action.cardUid });
    if (action.id === "pass") return submitPvpAction({ type: "pass" });
    return render();
  }

  if (app.match.pending) {
    if (action.id === "rowChoice") resolvePending(app.match, { row: action.row });
    else if (action.id === "targetChoice") resolvePending(app.match, { uid: action.cardUid });
    else if (action.id === "pendingSkip") resolvePending(app.match, { skip: true });
    else if (action.id === "pendingCancel") cancelPending(app.match);
    return afterHumanAction();
  }
  if (app.match.mode === "ai" && app.match.current !== 0) return;
  if (action.id === "leaderAvatar") {
    if (action.playerIndex === app.match.current && !app.match.mulligan?.active) {
      useLeader(app.match, action.playerIndex);
      return afterHumanAction();
    }
    return render();
  }
  if (app.match.mulligan?.active) {
    if (action.id === "card") {
      performLocalMulliganSwap(action.cardUid);
      app.ui.handPage = 0;
      if (!app.match.mulligan?.active) app.ui.mulliganHandOrder = null;
      return afterHumanAction();
    }
    if (action.id === "mulliganDone") { finishMulligan(app.match); app.ui.mulliganHandOrder = null; return afterHumanAction(); }
    return;
  }
  if (action.id === "leader") useLeader(app.match, app.match.current);
  if (action.id === "auto") autoPlayHuman(app.match);
  if (action.id === "card") playCard(app.match, action.cardUid);
  if (action.id === "pass") pass(app.match);
  afterHumanAction();
}

function handleAction(action) {
  vibrate();
  if (app.ui.mulliganSwapAnim) return;
  if (app.scene === "menu") return handleMenu(action);
  if (app.scene === "pvpSetup") return handlePvpSetup(action);
  if (app.scene === "pvpRoom") return handlePvpRoom(action);
  if (app.scene === "matchSetup") return handleMatchSetup(action);
  if (app.scene === "rules") return action.id === "back" ? setScene("menu") : null;
  if (app.scene === "settings") return handleSettings(action);
  if (app.scene === "deckBuilder") return handleDeckBuilder(action);
  if (app.scene === "history") return handleHistory(action);
  if (app.scene === "battle") return handleBattle(action);
  if (app.scene === "result") {
    if (action.id === "restart") {
      if (isOnlineMatch()) return returnPvpRoom();
      return startMatch();
    }
    if (action.id === "home") {
      if (isOnlineMatch()) resetPvpState();
      setScene("menu");
    }
  }
}

let touchStartState = null;

function normalizeTouch(event) {
  const touch = event.changedTouches && event.changedTouches[0]
    ? event.changedTouches[0]
    : (event.touches && event.touches[0] ? event.touches[0] : null);
  if (!touch) return null;
  return { x: touch.clientX ?? touch.x, y: touch.clientY ?? touch.y };
}

function battlePlayedHistory() {
  const playLogs = (app.match?.logs || [])
    .filter(item => /打出/.test(String(item || "")))
    .map(text => ({ text: String(text) }));
  if (playLogs.length) return playLogs;
  const history = Array.isArray(app.match?.playedHistory) ? app.match.playedHistory : [];
  if (history.length) return history;
  return app.match?.lastPlayed ? [app.match.lastPlayed] : [];
}

function battleLogHistoryScrollBounds() {
  const panelY = view.safeTop + 74;
  const panelH = Math.max(300, Math.min(430, view.height - view.safeTop - view.safeBottom - 156));
  const listTop = panelY + 72;
  const listBottom = panelY + panelH - 22;
  const rowH = 42;
  const viewportH = Math.max(0, listBottom - listTop);
  const contentH = battlePlayedHistory().length * rowH;
  return { listTop, listBottom, maxScroll: Math.max(0, contentH - viewportH) };
}

function clampBattleLogHistoryScroll(value) {
  const { maxScroll } = battleLogHistoryScrollBounds();
  return Math.max(0, Math.min(value || 0, maxScroll));
}

function scrollBattleLogHistoryBy(deltaY) {
  if (app.scene !== "battle" || !app.match || app.ui.battleCardDetailId || app.ui.battleCardDetailUid || !app.ui.battleLogHistoryOpen) return false;
  const before = app.ui.battleLogHistoryScroll || 0;
  const next = clampBattleLogHistoryScroll(before - deltaY);
  if (Math.abs(next - before) > 0.5) {
    app.ui.battleLogHistoryScroll = next;
    render();
  }
  return true;
}

function handleBattleLogHistorySwipe(start, end) {
  if (!start || !end || app.scene !== "battle" || !app.match || app.ui.battleCardDetailId || app.ui.battleCardDetailUid || !app.ui.battleLogHistoryOpen) return false;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  const bounds = battleLogHistoryScrollBounds();
  if (start.y < bounds.listTop || start.y > bounds.listBottom || absY < 20 || absY < absX * 1.2) return false;
  scrollBattleLogHistoryBy(dy);
  return true;
}

function handleDiscardPileSwipe(start, end) {
  if (!start || !end || app.scene !== "battle" || !app.match || app.ui.battleCardDetailId || app.ui.battleCardDetailUid || app.ui.battleLogHistoryOpen || app.ui.discardPileOwner == null) return false;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  const panelY = view.safeTop + 74;
  const panelH = Math.max(300, Math.min(390, view.height - view.safeTop - view.safeBottom - 178));
  if (start.y < panelY || start.y > panelY + panelH || absY < 42 || absY < absX * 1.2) return false;
  const owner = app.match.players[app.ui.discardPileOwner] ? app.ui.discardPileOwner : 0;
  const pile = app.match.players[owner]?.discard || [];
  const pageSize = Math.max(3, Math.floor((panelH - 124) / 48));
  const totalPages = Math.max(1, Math.ceil(pile.length / pageSize));
  const nextPage = Math.max(0, Math.min((app.ui.discardPilePage || 0) + (dy < 0 ? 1 : -1), totalPages - 1));
  if (nextPage !== app.ui.discardPilePage) {
    app.ui.discardPilePage = nextPage;
    render();
  }
  return true;
}

function handleHandSwipe(start, end) {
  if (!start || !end || app.scene !== "battle" || !app.match || app.match.over || app.ui.battleCardDetailId || app.ui.battleCardDetailUid || app.ui.battleLogHistoryOpen || app.ui.discardPileOwner != null) return false;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (Math.abs(dx) < 42 || Math.abs(dx) < Math.abs(dy) * 1.2) return false;
  const handTop = view.height - view.safeBottom - BATTLE_HAND_BOTTOM_OFFSET - BATTLE_HAND_SWIPE_TOP_PADDING;
  const handBottom = view.height - view.safeBottom - (BATTLE_HAND_BOTTOM_OFFSET - BATTLE_HAND_CARD_H) + BATTLE_HAND_SWIPE_BOTTOM_PADDING;
  if (start.y < handTop || start.y > handBottom) return false;
  const nextPage = clampHandPage(app.ui.handPage + (dx < 0 ? 1 : -1));
  if (nextPage !== app.ui.handPage) {
    app.ui.handPage = nextPage;
    startPageTransition("battleHand", "x", dx < 0 ? view.width * 0.38 : -view.width * 0.38);
  }
  return true;
}

function handleDeckBuilderSwipe(start, end) {
  if (!start || !end || app.scene !== "deckBuilder" || app.ui.deckCardDetailId || app.ui.deckSlotDropdown) return false;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  const listTop = view.safeTop + 26 + 140;
  const listBottom = view.height - view.safeBottom - 72;
  if (start.y < listTop || start.y > listBottom || absY < 42 || absY < absX * 1.2) return false;
  const nextPage = deckBuilderScene.clampPage(view, app.ui, (app.ui.deckPage || 0) + (dy < 0 ? 1 : -1));
  if (nextPage !== app.ui.deckPage) {
    app.ui.deckPage = nextPage;
    startPageTransition("deckBuilder", "y", dy < 0 ? 68 : -68);
  }
  return true;
}

function handleSettingsSwipe(start, end) {
  if (!start || !end || app.scene !== "settings" || app.ui.settingCardDetailId || app.ui.settingDropdown) return false;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  const listTop = view.safeTop + 28 + 264;
  const listBottom = view.height - view.safeBottom - 68;
  if (start.y < listTop || start.y > listBottom || absY < 42 || absY < absX * 1.2) return false;
  const nextPage = settingsScene.clampPage(view, app.ui, (app.ui.settingDeckPage || 0) + (dy < 0 ? 1 : -1));
  if (nextPage !== app.ui.settingDeckPage) {
    app.ui.settingDeckPage = nextPage;
    startPageTransition("settings", "y", dy < 0 ? 68 : -68);
  }
  return true;
}

function handleHistorySwipe(start, end) {
  if (!start || !end || app.scene !== "history" || app.ui.historyLeaderDetailId) return false;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  const listTop = view.safeTop + 30 + 58;
  const listBottom = view.height - view.safeBottom - 76;
  if (start.y < listTop || start.y > listBottom || absY < 42 || absY < absX * 1.2) return false;
  const nextPage = historyScene.clampPage(view, app.ui, (app.ui.historyPage || 0) + (dy < 0 ? 1 : -1));
  if (nextPage !== app.ui.historyPage) {
    app.ui.historyPage = nextPage;
    startPageTransition("history", "y", dy < 0 ? 98 : -98);
  }
  return true;
}

function detailEntry(card) {
  return card ? { card, cardId: card.id || "", cardUid: card.uid || "" } : null;
}

function detailEntries(cards) {
  return (cards || []).map(detailEntry).filter(Boolean);
}

function detailEntryCard(entry) {
  return entry?.card || entry;
}

function detailEntryId(entry) {
  const card = detailEntryCard(entry);
  return entry?.cardId || card?.id || "";
}

function detailEntryUid(entry) {
  const card = detailEntryCard(entry);
  return entry?.cardUid || card?.uid || "";
}

function detailEntryMatches(entry, detailId, detailUid) {
  const uid = detailEntryUid(entry);
  if (detailUid) return uid === detailUid;
  return detailEntryId(entry) === detailId;
}

function currentDetailState() {
  if (app.ui.deckCardDetailId) return { id: app.ui.deckCardDetailId, uid: "", slot: "deck" };
  if (app.ui.battleCardDetailId || app.ui.battleCardDetailUid) return { id: app.ui.battleCardDetailId, uid: app.ui.battleCardDetailUid, slot: "battle" };
  if (app.ui.settingCardDetailId) return { id: app.ui.settingCardDetailId, uid: "", slot: "settings" };
  if (app.ui.matchSetupCardDetailId) return { id: app.ui.matchSetupCardDetailId, uid: "", slot: app.scene === "pvpSetup" ? "pvpSetup" : "matchSetup" };
  if (app.ui.historyLeaderDetailId) return { id: app.ui.historyLeaderDetailId, uid: "", slot: "history" };
  return null;
}

function setCurrentDetailCard(slot, card, cardUid = "") {
  if (!card) return;
  if (slot === "deck") app.ui.deckCardDetailId = card.id;
  else if (slot === "battle") {
    app.ui.battleCardDetailId = card.id || "";
    app.ui.battleCardDetailUid = cardUid || card.uid || "";
  } else if (slot === "settings") app.ui.settingCardDetailId = card.id;
  else if (slot === "matchSetup" || slot === "pvpSetup") app.ui.matchSetupCardDetailId = card.id;
  else if (slot === "history") app.ui.historyLeaderDetailId = card.id;
}

function sortedEligibleGroups(faction) {
  return groupCards(eligibleCards(faction)).sort((a, b) => cardValue(b.card) - cardValue(a.card));
}

function settingDetailEntries(settings, ui) {
  const current = cardById(ui.settingCardDetailId);
  if (current?.category === "leader") return detailEntries(leadersFor(settings.humanFaction));
  const tab = ui.settingCardTab || "all";
  const cards = eligibleCards(settings.humanFaction).filter(card => {
    if (tab === "all") return true;
    if (tab === "special") return card.category === "special" || card.category === "weather";
    if (tab === "hero") return !!card.hero;
    if (!(card.category === "unit" || card.category === "hero")) return false;
    return (card.row || []).includes(tab);
  });
  return detailEntries(groupCards(cards).sort((a, b) => cardValue(b.card) - cardValue(a.card)).map(group => group.card));
}

function matchSetupDetailEntries(settings) {
  const detailId = app.ui.matchSetupCardDetailId;
  const candidates = [leadersFor(settings.humanFaction)];
  if (settings.aiFaction !== "random") candidates.push(leadersFor(settings.aiFaction));
  const matched = candidates.find(list => list.some(card => card.id === detailId));
  return detailEntries(matched || candidates.reduce((all, list) => all.concat(list), []));
}

function pvpSetupDetailEntries(settings) {
  const rules = normalizePvpRules(app.pvp.room?.rules || {});
  const selectingOnline = app.pvp.room?.status === "selecting";
  const faction = selectingOnline && rules.factionMode === "fixed" ? rules.faction : (settings.pvpFaction || settings.humanFaction);
  if (!FACTION_KEYS.includes(faction)) return [];
  return detailEntries(leadersFor(faction));
}

function getCurrentDetailCardList() {
  if (app.scene === "battle" && battleScene.detailCardEntries) return battleScene.detailCardEntries(app.match, app.ui, view);
  if (app.scene === "history" && historyScene.detailLeaderCards) return detailEntries(historyScene.detailLeaderCards(view, app.ui));
  const settings = loadSettings();
  if (app.scene === "deckBuilder") return detailEntries(sortedEligibleGroups(settings.humanFaction).map(group => group.card));
  if (app.scene === "settings") return settingDetailEntries(settings, app.ui);
  if (app.scene === "matchSetup") return matchSetupDetailEntries(settings);
  if (app.scene === "pvpSetup") return pvpSetupDetailEntries(settings);
  return [];
}

function handleCardDetailSwipe(start, end) {
  const detailState = currentDetailState();
  if (!detailState || !start || !end) return false;
  if (app.ui.detailSwipe && app.ui.detailSwipe.animating) return false;

  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  if (absX < 40 || absX < absY * 0.8) return false;

  const cards = getCurrentDetailCardList();
  if (!cards.length) return false;

  const currentIdx = cards.findIndex(entry => detailEntryMatches(entry, detailState.id, detailState.uid));
  if (currentIdx < 0) return false;

  const swipeLeft = dx < 0;
  const targetIdx = swipeLeft ? currentIdx + 1 : currentIdx - 1;
  if (targetIdx < 0 || targetIdx >= cards.length) return false;

  const targetEntry = cards[targetIdx];
  const targetCard = detailEntryCard(targetEntry);
  if (!targetCard) return false;

  const maxOffset = 112;
  setCurrentDetailCard(detailState.slot, targetCard, detailEntryUid(targetEntry));
  startDetailSwipeTransition(swipeLeft ? maxOffset : -maxOffset);
  return true;
}

function findAction(point) {
  for (let i = app.actions.length - 1; i >= 0; i--) {
    if (hit(point, app.actions[i])) return app.actions[i];
  }
  return null;
}

function handleTap(point) {
  const action = findAction(point);
  if (action) handleAction(action);
}

const LONG_PRESS_MS = 380;
const LONG_PRESS_MOVE = 12;

function openBattleCardDetail(cardId, cardUid) {
  if (!cardId && !cardUid) return;
  app.ui.battleCardDetailId = cardId || "";
  app.ui.battleCardDetailUid = cardUid || "";
  app.ui.detailSwipe = null;
  vibrate();
  render();
}

function openBattleLogHistory() {
  app.ui.battleLogHistoryOpen = true;
  app.ui.battleLogHistoryScroll = 0;
  vibrate();
  render();
}

function openHistoryLeaderDetail(cardId) {
  if (!cardId) return;
  app.ui.historyLeaderDetailId = cardId;
  app.ui.detailSwipe = null;
  vibrate();
  render();
}

function openMatchSetupCardDetail(cardId) {
  if (!cardId) return;
  app.ui.matchSetupDropdown = "";
  app.ui.matchSetupCardDetailId = cardId;
  app.ui.detailSwipe = null;
  vibrate();
  render();
}

function openDeckBuilderCardDetail(cardId) {
  if (!cardId) return;
  app.ui.deckCardDetailId = cardId;
  app.ui.detailSwipe = null;
  vibrate();
  render();
}

function openSettingCardDetail(cardId) {
  if (!cardId) return;
  app.ui.settingDropdown = "";
  app.ui.settingCardDetailId = cardId;
  app.ui.detailSwipe = null;
  vibrate();
  render();
}

function startLongPress(point) {
  const action = findAction(point);
  if (!action) return;
  let onLongPress = null;
  if (app.scene === "battle" && app.match && !app.ui.battleCardDetailId && action.id === "battleLog") {
    onLongPress = openBattleLogHistory;
  } else if (action.cardId) {
    let openDetail = null;
    if (app.scene === "battle" && app.match && !app.ui.battleCardDetailId && ["card", "battleCardDetail", "leaderAvatar", "targetChoice"].includes(action.id)) {
      openDetail = openBattleCardDetail;
    }
    if (app.scene === "history" && !app.ui.historyLeaderDetailId && action.id === "historyLeader") {
      openDetail = openHistoryLeaderDetail;
    }
    if (app.scene === "matchSetup" && !app.ui.matchSetupCardDetailId && ["humanLeader", "aiLeader", "selectMatchSetupOption"].includes(action.id)) {
      openDetail = openMatchSetupCardDetail;
    }
    if (app.scene === "pvpSetup" && !app.ui.matchSetupCardDetailId && ["pvpLeader", "selectPvpSetupOption"].includes(action.id)) {
      openDetail = openMatchSetupCardDetail;
    }
    if (app.scene === "deckBuilder" && !app.ui.deckCardDetailId && action.id === "addCustomCard") {
      openDetail = openDeckBuilderCardDetail;
    }
    if (app.scene === "settings" && !app.ui.settingCardDetailId && action.cardId && ["humanLeader", "addSettingCard", "selectSettingOption"].includes(action.id)) {
      openDetail = openSettingCardDetail;
    }
    if (openDetail) onLongPress = () => openDetail(action.cardId, action.cardUid);
  }
  if (!onLongPress) return;
  touchStartState.longPressTimer = setTimeout(() => {
    if (!touchStartState) return;
    touchStartState.longPressTimer = null;
    touchStartState.longPressFired = true;
    onLongPress();
  }, LONG_PRESS_MS);
}

function clearLongPress() {
  if (touchStartState && touchStartState.longPressTimer) {
    clearTimeout(touchStartState.longPressTimer);
    touchStartState.longPressTimer = null;
  }
}

if (typeof wx !== "undefined" && wx.onTouchStart) {
  wx.onTouchStart(event => {
    const point = normalizeTouch(event);
    if (!point) return;
    touchStartState = { point };
    startLongPress(point);
  });
}

if (typeof wx !== "undefined" && wx.onTouchMove) {
  wx.onTouchMove(event => {
    const point = normalizeTouch(event);
    if (!point || !touchStartState) return;
    
    // 实时跟踪卡牌详情滑动
    const detailId = app.ui.deckCardDetailId || app.ui.battleCardDetailId || app.ui.settingCardDetailId || app.ui.matchSetupCardDetailId || app.ui.historyLeaderDetailId;
    if (detailId && !app.ui.detailSwipe?.animating) {
      const dx = point.x - touchStartState.point.x;
      const dy = point.y - touchStartState.point.y;
      // 水平滑动幅度大于垂直，且超过阈值
      if (Math.abs(dx) > 15 && Math.abs(dx) > Math.abs(dy) * 0.6) {
        const maxOffset = 112;
        const offset = Math.max(-maxOffset, Math.min(maxOffset, dx));
        app.ui.detailSwipe = { offset, animating: false };
        render();
      }
    }

    if (app.scene === "battle" && app.match && app.ui.battleLogHistoryOpen && !app.ui.battleCardDetailId && !app.ui.battleCardDetailUid) {
      const bounds = battleLogHistoryScrollBounds();
      const start = touchStartState.point;
      const dx = point.x - start.x;
      const dy = point.y - start.y;
      if (start.y >= bounds.listTop && start.y <= bounds.listBottom && Math.abs(dy) > 4 && Math.abs(dy) > Math.abs(dx) * 0.8) {
        clearLongPress();
        const last = touchStartState.lastPoint || start;
        scrollBattleLogHistoryBy(point.y - last.y);
        touchStartState.battleLogHistoryScrolled = true;
        touchStartState.lastPoint = point;
        return;
      }
    }
    
    if (!touchStartState.longPressTimer) return;
    if (Math.hypot(point.x - touchStartState.point.x, point.y - touchStartState.point.y) > LONG_PRESS_MOVE) {
      clearLongPress();
    }
  });
}

if (typeof wx !== "undefined" && wx.onTouchEnd) {
  wx.onTouchEnd(event => {
    const point = normalizeTouch(event);
    if (!point) return;
    const state = touchStartState;
    touchStartState = null;
    if (state && state.longPressTimer) clearTimeout(state.longPressTimer);
    if (state && state.longPressFired) return;
    const start = state?.point || point;
    
    const detailState = currentDetailState();
    if (handleCardDetailSwipe(start, point)) return;

    // 未达到切换条件的详情滑动回弹到原位
    if (detailState && app.ui.detailSwipe && !app.ui.detailSwipe.animating && Math.abs(app.ui.detailSwipe.offset || 0) > 5) {
      startDetailSwipeTransition(app.ui.detailSwipe.offset);
      return;
    }

    if (app.ui.detailSwipe && !app.ui.detailSwipe.animating) {
      app.ui.detailSwipe = null;
      render();
    }

    if (state && state.battleLogHistoryScrolled) return;
    if (handleBattleLogHistorySwipe(start, point)) return;
    if (handleDiscardPileSwipe(start, point)) return;
    if (handleHandSwipe(start, point)) return;
    if (handleHistorySwipe(start, point)) return;
    if (handleSettingsSwipe(start, point)) return;
    if (handleDeckBuilderSwipe(start, point)) return;
    if (Math.hypot(point.x - start.x, point.y - start.y) <= 20) handleTap(point);
  });
}

if (typeof wx !== "undefined" && wx.onTouchCancel) {
  wx.onTouchCancel(() => {
    clearLongPress();
    // 取消时如果有未完成的滑动，回弹
    if (app.ui.detailSwipe && !app.ui.detailSwipe.animating && (app.ui.detailSwipe.offset || 0) !== 0) {
      startDetailSwipeTransition(app.ui.detailSwipe.offset);
    }
    touchStartState = null;
  });
}

console.log("===== 章鱼牌 v0714-1032 新代码已加载 =====");
pvpClient.initCloud();
setupShare();
handleLaunchRoom();
render();
