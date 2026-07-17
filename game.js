const EARLY_SHARE_VERSION = "S0718-join-fallback-v1";
let earlySharePayload = {
  title: "来盘章鱼牌吧",
  query: "from=share"
};
let earlyShareRegistered = false;

function earlyGameShareHandler() {
  const record = { time: Date.now(), version: EARLY_SHARE_VERSION, payload: earlySharePayload };
  console.warn("[share-early] 最早期 onShareAppMessage 回调被触发:", JSON.stringify(record));
  try { wx.setStorageSync("zhangyu.share.early.debug.v1", record); } catch (err) {}
  return earlySharePayload;
}

if (typeof wx !== "undefined" && typeof wx.onShareAppMessage === "function") {
  wx.onShareAppMessage(earlyGameShareHandler);
  earlyShareRegistered = true;
  console.log(`[share-early] 已在加载任何模块前注册，版本=${EARLY_SHARE_VERSION}`);
}

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
const { cardById, deckStatus, recommendedDeckIds, leadersFor, FACTION_KEYS, FACTION_LABELS, eligibleCards, groupCards, cardValue } = require("./js/core/cards");
const { createMatch, playCard, pass, useLeader, mulliganSwap, finishMulligan, continueRoundTransition, aiStep, resolvePending, cancelPending, surrender, handOwnerIndex } = require("./js/core/battle");

const view = createCanvasAdapter();
const ctx = view.ctx;
const app = {
  scene: "menu",
  actions: [],
  match: null,
  aiTimer: null,
  recentPlayTimer: null,
  recentPlayTimerSeq: 0,
  roundTransitionTimer: null,
  roundTransitionTimerSeq: 0,
  pvp: {
    roomId: "",
    pendingRoomId: "",
    room: null,
    playerIndex: 0,
    loading: false,
    submitting: false,
    error: "",
    recordedResultKey: "",
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
    pendingPvpMulliganSwap: null,
    deckCardDetailId: "",
    settingCardDetailId: "",
    matchSetupCardDetailId: "",
    showCardGuide: false,
    deckReturnScene: "settings",
    settingDropdown: "",
    settingCardTab: "all",
    settingDeckPage: 0,
    settingDeckScroll: 0,
    matchSetupDropdown: "",
    deckSlotDropdown: "",
    historyPage: 0,
    historyLeaderDetailId: "",
    dismissedRecentPlaySeq: 0,
    discardPileOwner: null,
    discardPilePage: 0,
    battleLogHistoryOpen: false,
    battleLogHistoryScroll: 0,
    battleRowScrolls: {},
    pvpShareGuideOpen: false,
    pageTransition: null,
    detailSwipe: null
  }
};

setImageRenderHook(() => render());

const RECENT_PLAY_AUTO_DISMISS_MS = 2000;
const ROUND_TRANSITION_NOTICE_MS = RECENT_PLAY_AUTO_DISMISS_MS * 2;
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
  if (app.scene !== "battle" || !app.match || !notice || app.match.over || app.match.roundTransition || app.match.mulligan?.active) return 0;
  if (notice.seq <= (app.ui.dismissedRecentPlaySeq || 0)) return 0;
  const local = app.match.mode === "online" && Number.isInteger(app.match.localPlayerIndex) ? app.match.localPlayerIndex : 0;
  const isOpponentAction = Number.isInteger(notice.playerIndex) && notice.playerIndex !== local;
  const isVisibleCardPlay = isOpponentAction && (notice.actionType === "card" || notice.actionType === "leader") && notice.cardId;
  const isVisiblePass = isOpponentAction && notice.type === "pass";
  return (isVisibleCardPlay || isVisiblePass) ? (notice.seq || 0) : 0;
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

function clearRoundTransitionTimer() {
  if (app.roundTransitionTimer) {
    clearTimeout(app.roundTransitionTimer);
    app.roundTransitionTimer = null;
  }
  app.roundTransitionTimerSeq = 0;
}

function visibleRoundTransitionSeq() {
  const transition = app.match?.roundTransition;
  if (app.scene !== "battle" || !app.match || !transition || app.match.over) return 0;
  return transition.seq || 0;
}

function continueBattleRoundTransition() {
  const seq = visibleRoundTransitionSeq();
  if (!seq) {
    clearRoundTransitionTimer();
    return render();
  }
  clearRoundTransitionTimer();
  app.ui.dismissedRecentPlaySeq = Math.max(app.ui.dismissedRecentPlaySeq || 0, seq);
  if (isOnlineMatch()) return submitPvpAction({ type: "continueRound" });
  if (!continueRoundTransition(app.match)) return render();
  app.ui.handPage = clampHandPage(app.ui.handPage);
  if (app.match.over) return setScene("result");
  render();
  if (!app.match.pending) scheduleAi();
}

function scheduleRoundTransitionAutoContinue() {
  const seq = visibleRoundTransitionSeq();
  if (!seq) {
    clearRoundTransitionTimer();
    return;
  }
  if (app.roundTransitionTimer && app.roundTransitionTimerSeq === seq) return;
  clearRoundTransitionTimer();
  app.roundTransitionTimerSeq = seq;
  app.roundTransitionTimer = setTimeout(() => {
    app.roundTransitionTimer = null;
    app.roundTransitionTimerSeq = 0;
    if (visibleRoundTransitionSeq() !== seq) return;
    continueBattleRoundTransition();
  }, ROUND_TRANSITION_NOTICE_MS);
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

function mulliganHandUids(playerIndex) {
  return (app.match?.players?.[playerIndex]?.hand || []).map(item => item.uid).filter(Boolean);
}

function findNewMulliganCard(playerIndex, beforeUids) {
  const before = beforeUids instanceof Set ? beforeUids : new Set(beforeUids || []);
  return (app.match?.players?.[playerIndex]?.hand || []).find(item => item.uid && !before.has(item.uid)) || null;
}

function closeBattleCardDetail() {
  app.ui.battleCardDetailId = "";
  app.ui.battleCardDetailUid = "";
  app.ui.detailSwipe = null;
  app.ui.mulliganHelpOpen = false;
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
  const before = new Set(mulliganHandUids(pi));
  const ok = mulliganSwap(state, uid, pi);
  if (!ok) {
    app.ui.mulliganReplacedUid = "";
    return null;
  }
  const after = state.players[pi].hand || [];
  const newCard = findNewMulliganCard(pi, before);
  if (newCard) replaceMulliganHandOrderUid(uid, newCard.uid, pi);
  app.ui.mulliganReplacedUid = newCard ? newCard.uid : (after.length ? after[after.length - 1].uid : "");
  return newCard || null;
}

function clearPendingPvpMulliganSwap() {
  app.ui.pendingPvpMulliganSwap = null;
  app.ui.mulliganSwapAnim = null;
  app.ui.mulliganSwapQueue = null;
  app.ui.mulliganSwapIndex = 0;
  app.ui.mulliganReplacedUid = "";
}

function finishOnlineMulliganSwapAfterOut() {
  const pending = app.ui.pendingPvpMulliganSwap;
  if (!pending) return;
  const newCard = pending.newCard;
  const keepOpen = newCard && app.match?.mulligan?.active && hasMulliganSwapLeft() && !pending.closeWhenReady;
  if (!keepOpen) {
    clearPendingPvpMulliganSwap();
    if (!app.match?.mulligan?.active) app.ui.mulliganHandOrder = null;
    closeBattleCardDetail();
    app.ui.handPage = 0;
    return render();
  }

  app.ui.battleCardDetailUid = newCard.uid || "";
  app.ui.battleCardDetailId = newCard.id || "";
  app.ui.detailSwipe = null;
  app.ui.mulliganHelpOpen = false;
  app.ui.mulliganSwapAnim = { phase: "online-in", start: Date.now(), alpha: 0, scale: 0.82 };
  const start = app.ui.mulliganSwapAnim.start;
  function step() {
    if (!app.ui.mulliganSwapAnim || app.ui.mulliganSwapAnim.phase !== "online-in" || app.ui.mulliganSwapAnim.start !== start) return;
    const progress = Math.min(1, (Date.now() - start) / MULLIGAN_SWAP_IN_MS);
    const eased = 1 - Math.pow(1 - progress, 3);
    app.ui.mulliganSwapAnim.alpha = eased;
    app.ui.mulliganSwapAnim.scale = 0.82 + 0.18 * eased;
    render();
    if (progress < 1) return requestFrame(step);
    clearPendingPvpMulliganSwap();
    app.ui.handPage = 0;
    render();
  }
  requestFrame(step);
}

function startOnlineMulliganSwapOut() {
  const pending = app.ui.pendingPvpMulliganSwap;
  if (!pending?.keepDetail) return;
  app.ui.mulliganSwapQueue = [pending.uid];
  app.ui.mulliganSwapIndex = 0;
  app.ui.mulliganSwapAnim = { phase: "online-out", start: Date.now(), alpha: 1, scale: 1 };
  const start = app.ui.mulliganSwapAnim.start;
  function step() {
    const current = app.ui.pendingPvpMulliganSwap;
    if (!current || !app.ui.mulliganSwapAnim || app.ui.mulliganSwapAnim.phase !== "online-out" || app.ui.mulliganSwapAnim.start !== start) return;
    const progress = Math.min(1, (Date.now() - start) / MULLIGAN_SWAP_OUT_MS);
    const eased = 1 - Math.pow(1 - progress, 3);
    app.ui.mulliganSwapAnim.alpha = 1 - eased;
    app.ui.mulliganSwapAnim.scale = 1 - 0.16 * eased;
    render();
    if (progress < 1) return requestFrame(step);
    current.outDone = true;
    if (current.newCard || current.closeWhenReady || !app.match?.mulligan?.active) return finishOnlineMulliganSwapAfterOut();
    app.ui.mulliganSwapAnim = { phase: "online-wait", start: Date.now(), alpha: 0, scale: 0.84 };
    render();
  }
  requestFrame(step);
}

function prepareOnlineMulliganSwap(uid, keepDetail) {
  const pi = handOwnerIndex(app.match);
  ensureMulliganHandOrder(pi);
  app.ui.pendingPvpMulliganSwap = {
    uid,
    playerIndex: pi,
    before: mulliganHandUids(pi),
    keepDetail: !!keepDetail,
    outDone: false,
    newCard: null,
    closeWhenReady: false
  };
  app.ui.handPage = 0;
  if (keepDetail) {
    app.ui.battleCardDetailUid = uid;
    app.ui.battleCardDetailId = "";
    app.ui.detailSwipe = null;
    app.ui.mulliganHelpOpen = false;
    startOnlineMulliganSwapOut();
  }
}

function syncPendingPvpMulliganSwap() {
  const pending = app.ui.pendingPvpMulliganSwap;
  if (!pending || !app.match) return false;
  const pi = Number.isInteger(pending.playerIndex) ? pending.playerIndex : handOwnerIndex(app.match);
  const hand = app.match.players?.[pi]?.hand || [];
  if (hand.some(card => card.uid === pending.uid)) return false;

  const newCard = findNewMulliganCard(pi, pending.before);
  if (newCard) replaceMulliganHandOrderUid(pending.uid, newCard.uid, pi);

  if (!pending.keepDetail) {
    clearPendingPvpMulliganSwap();
    if (!app.match.mulligan?.active) app.ui.mulliganHandOrder = null;
    return true;
  }

  pending.newCard = newCard || null;
  pending.closeWhenReady = !(newCard && app.match.mulligan?.active && hasMulliganSwapLeft());
  if (pending.outDone || !app.ui.mulliganSwapAnim || app.ui.mulliganSwapAnim.phase === "online-wait") finishOnlineMulliganSwapAfterOut();
  app.ui.mulliganReplacedUid = "";
  return true;
}

function handleMulliganSwap(cardUid, keepDetail = false) {
  if (!app.match?.mulligan?.active || !cardUid) return render();
  if (isOnlineMatch()) {
    if (app.pvp.submitting || app.ui.pendingPvpMulliganSwap) return true;
    prepareOnlineMulliganSwap(cardUid, keepDetail);
    return submitPvpAction({ type: "mulliganSwap", cardUid });
  }
  if (keepDetail) return startMulliganSwapSequence(cardUid);
  performLocalMulliganSwap(cardUid);
  app.ui.handPage = 0;
  if (!app.match.mulligan?.active) app.ui.mulliganHandOrder = null;
  return afterHumanAction();
}

function finishMulliganSwapSequence(closeDetail = true) {
  app.ui.mulliganSwapAnim = null;
  app.ui.mulliganSwapQueue = null;
  app.ui.mulliganSwapIndex = 0;
  app.ui.mulliganReplacedUid = "";
  if (closeDetail) closeBattleCardDetail();
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
    clearRoundTransitionTimer();
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
  app.ui.pendingPvpMulliganSwap = null;
  app.ui.discardPileOwner = null;
  app.ui.discardPilePage = 0;
  app.ui.battleLogHistoryOpen = false;
  app.ui.battleLogHistoryScroll = 0;
  app.ui.battleRowScrolls = {};
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
  if (app.scene === "pvpRoom") pvpRoomScene.draw(ctx, view, app.actions, app.pvp, app.ui);
  if (app.scene === "matchSetup") matchSetupScene.draw(ctx, view, app.actions, app.ui);
  if (app.scene === "rules") rulesScene.draw(ctx, view, app.actions);
  if (app.scene === "settings") settingsScene.draw(ctx, view, app.actions, app.ui);
  if (app.scene === "deckBuilder") deckBuilderScene.draw(ctx, view, app.actions, app.ui);
  if (app.scene === "history") historyScene.draw(ctx, view, app.actions, app.ui);
  if (app.scene === "battle") {
    app.ui.recentPlayAutoDismissMs = RECENT_PLAY_AUTO_DISMISS_MS;
    app.ui.roundTransitionNoticeMs = ROUND_TRANSITION_NOTICE_MS;
    battleScene.draw(ctx, view, app.actions, app.match, app.ui);
  }
  if (app.scene === "result") resultScene.draw(ctx, view, app.actions, app.match);
  scheduleRecentPlayAutoDismiss();
  scheduleRoundTransitionAutoContinue();
}

function scheduleAi() {
  if (!app.match || app.match.mode !== "ai" || app.match.over || app.match.roundTransition || app.match.current !== 1 || app.match.mulligan?.active) return;
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

const SHARE_DEBUG_KEY = "zhangyu.share.debug.v1";

function debugJson(value) {
  try { return JSON.stringify(value); } catch (err) { return `[无法序列化: ${err.message}]`; }
}

function rememberShareDebug(value) {
  const api = typeof wx !== "undefined" ? wx : null;
  if (!api?.setStorageSync) return;
  try { api.setStorageSync(SHARE_DEBUG_KEY, value); } catch (err) {
    console.warn("[share-debug] 保存诊断信息失败:", err.message || err);
  }
}

function readShareDebug() {
  const api = typeof wx !== "undefined" ? wx : null;
  if (!api?.getStorageSync) return null;
  try { return api.getStorageSync(SHARE_DEBUG_KEY) || null; } catch (err) { return null; }
}

function encodeShareQuery(params) {
  return Object.entries(params)
    .filter(([, value]) => value != null && String(value) !== "")
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join("&");
}

function currentShareRoomId() {
  return normalizePvpRoomId(app.pvp.roomId || app.pvp.room?.roomId || app.pvp.room?._id || app.pvp.pendingRoomId);
}

function getSharePayload() {
  const roomId = currentShareRoomId();
  const shareScene = app.scene || "menu";
  const sharePage = roomId ? "pvpRoom" : shareScene;
  // 房间邀请只传最必要的 roomId，避免无关字段影响微信对 query 的处理。
  const queryParams = roomId ? { roomId } : { from: "share", page: sharePage };
  if (sharePage === "pvpSetup" && !roomId) {
    const rules = currentRulesFromSettings();
    queryParams.factionMode = rules.factionMode;
    queryParams.faction = rules.faction;
    queryParams.deckMode = rules.deckMode;
  }
  const normal = {
    title: roomId ? `章鱼牌房间 ${roomId}｜打开后输入房间号加入` : "来盘章鱼牌吧",
    query: encodeShareQuery(queryParams)
  };
  console.log("[share-debug] 生成分享参数:", debugJson({
    appScene: app.scene,
    pvpRoomId: app.pvp.roomId,
    pendingRoomId: app.pvp.pendingRoomId,
    roomFields: app.pvp.room ? { roomId: app.pvp.room.roomId, _id: app.pvp.room._id, status: app.pvp.room.status } : null,
    resolvedRoomId: roomId,
    queryParams,
    encodedQuery: normal.query,
    decodedQuery: parseShareQueryText(normal.query)
  }));

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

  earlySharePayload = { ...normal };
  console.warn("[share-early] 已更新最早期回调 payload:", debugJson(earlySharePayload));
  return normal;
}

let shareRegistrationReason = "未注册";

function gameShareHandler() {
  try {
    console.log(`[share] onShareAppMessage 回调被触发! 注册来源=${shareRegistrationReason} 当前 app.pvp.roomId=`, app.pvp.roomId,
      "app.pvp.room=", debugJson(app.pvp.room ? { roomId: app.pvp.room.roomId, _id: app.pvp.room._id, status: app.pvp.room.status } : null));
    console.log("[share-debug] 回调时完整状态:", debugJson({
      time: new Date().toISOString(),
      registrationReason: shareRegistrationReason,
      scene: app.scene,
      pvp: app.pvp,
      currentShareRoomId: currentShareRoomId()
    }));
    const payload = getSharePayload();
    const debugRecord = {
      time: Date.now(),
      registrationReason: shareRegistrationReason,
      scene: app.scene,
      roomId: currentShareRoomId(),
      payload,
      parsedQuery: parseShareQueryText(payload.query)
    };
    rememberShareDebug(debugRecord);
    console.log("[share] 被动转发 payload:", debugJson(payload));
    console.log("[share-debug] 已保存本次分享记录:", debugJson(debugRecord));
    return payload;
  } catch (e) {
    console.error("[share] onShareAppMessage 回调异常:", e.message, e.stack);
    return { title: "来盘章鱼牌吧", query: "from=share_error" };
  }
}

let shareHandlerRegistered = earlyShareRegistered;

function registerShareHandler(api, reason) {
  if (!api?.onShareAppMessage) {
    console.warn("[share] wx.onShareAppMessage 不存在，无法注册被动分享");
    return false;
  }
  shareRegistrationReason = reason;
  if (shareHandlerRegistered) {
    console.log(`[share-debug] 最早期分享回调已存在，仅更新上下文，来源=${reason}`);
    return true;
  }
  api.onShareAppMessage(gameShareHandler);
  shareHandlerRegistered = true;
  console.log(`[share] onShareAppMessage 已兜底注册，来源=${reason}`);
  return true;
}

function showGameShareMenu(api, reason) {
  if (!api?.showShareMenu) return;
  api.showShareMenu({
    withShareTicket: false,
    menus: ["shareAppMessage"],
    success: res => console.log(`[share] showShareMenu success，来源=${reason}:`, debugJson(res || {})),
    fail: err => console.warn(`[share] showShareMenu failed，来源=${reason}:`, debugJson(err || {})),
    complete: res => console.log(`[share-debug] showShareMenu complete，来源=${reason}:`, debugJson(res || {}))
  });
}

function setupShare() {
  const api = typeof wx !== "undefined" ? wx : null;
  if (!api) return;
  console.log("[share] setupShare 开始注册");
  registerShareHandler(api, "游戏启动");
  showGameShareMenu(api, "游戏启动");
}

function guideShare() {
  const roomId = normalizePvpRoomId(app.pvp.roomId);
  console.log("[share-debug] 点击转发邀请按钮:", debugJson({
    scene: app.scene,
    rawRoomId: app.pvp.roomId,
    pendingRoomId: app.pvp.pendingRoomId,
    roomObject: app.pvp.room ? { roomId: app.pvp.room.roomId, _id: app.pvp.room._id, status: app.pvp.room.status } : null,
    resolvedRoomId: currentShareRoomId()
  }));
  if (!roomId) return toast("房间创建后才能转发邀请");
  const api = typeof wx !== "undefined" ? wx : null;
  registerShareHandler(api, `点击房间转发按钮-${roomId}`);
  showGameShareMenu(api, `点击房间转发按钮-${roomId}`);
  const preview = getSharePayload();
  console.warn("[share-debug] 转发前即时 payload 预览:", debugJson(preview));
  console.warn(`[share-debug] 请确认稍后出现回调日志；若没有出现，则微信没有调用 onShareAppMessage。预期 query=${preview.query}`);
  app.ui.pvpShareGuideOpen = true;
  render();
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

function pvpRuleSummary(rules = {}) {
  const safe = normalizePvpRules(rules);
  const faction = safe.factionMode === "fixed" ? `指定${FACTION_LABELS[safe.faction] || safe.faction}` : "不限";
  const deck = safe.deckMode === "autoOnly" ? "仅自动卡牌" : "不限，可自定义/自动";
  return `阵营${faction}；卡牌${deck}`;
}

function promptPvpRuleChanged(previousRules, nextRules) {
  const content = [
    `修改前：${pvpRuleSummary(previousRules)}`,
    `修改后：${pvpRuleSummary(nextRules)}`,
    "",
    "房主修改规则后，需要再点一下准备。"
  ].join("\n");
  const api = typeof wx !== "undefined" ? wx : null;
  if (api && api.showModal) {
    api.showModal({
      title: "规则已修改",
      content,
      confirmText: "直接准备",
      confirmColor: "#2f6f57",
      cancelText: "稍后",
      success: res => {
        if (res.confirm) setPvpReady(true);
        else render();
      },
      fail: () => render()
    });
    return;
  }
  toast("房主修改了规则，请重新准备");
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

function onlineMatchRecordKey(match) {
  const roomKey = app.pvp.roomId || "";
  if (match?.matchId) return `${roomKey}:${match.matchId}`;
  const rounds = (match?.roundResults || []).map(item => `${item.round}:${(item.scores || []).join("-")}:${item.winner == null ? "draw" : item.winner}`).join("|");
  const finalScores = (match?.finalScores || []).join("-");
  const won = (match?.players || []).map(player => player.roundsWon || 0).join("-");
  return `${roomKey}:${match?.endReason || "normal"}:${won}:${finalScores}:${rounds}`;
}

// 联网对局结束时，以本地玩家视角记录战绩到本机
function recordOnlineMatch(match) {
  if (!match || !match.over) return;
  const recordKey = onlineMatchRecordKey(match);
  if (app.pvp.recordedResultKey === recordKey && recordKey) return;

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
  app.pvp.recordedResultKey = recordKey;
}

function applyRoomUpdate(room, playerIndex) {
  if (!room) return;
  const roomId = normalizePvpRoomId(room.roomId || room._id || app.pvp.roomId);
  console.log("[pvp] applyRoomUpdate: status=", room.status, "playerIndex=", playerIndex,
    "roomId=", roomId, "players=", (room.players || []).length, "currentScene=", app.scene);
  const previousRoom = app.pvp.room;
  const effectivePlayerIndex = Number.isInteger(playerIndex) ? playerIndex : app.pvp.playerIndex;
  const prevVersion = previousRoom?.rules?.version || 0;
  const nextVersion = room.rules?.version || 0;
  const wasReadyBeforeRuleChange = effectivePlayerIndex === 1 && !!previousRoom?.players?.[effectivePlayerIndex]?.ready;
  app.pvp.room = room;
  if (roomId) app.pvp.roomId = roomId;
  if (Number.isInteger(playerIndex)) app.pvp.playerIndex = playerIndex;
  if (room.match) app.match = decorateOnlineMatch(room.match);
  else if (room.status !== "finished") app.match = null;
  app.pvp.loading = false;
  app.pvp.submitting = false;
  app.pvp.error = "";
  if (app.pvp.playerIndex === 1 && wasReadyBeforeRuleChange && prevVersion && nextVersion > prevVersion && room.status === "waiting" && !room.players?.[app.pvp.playerIndex]?.ready) {
    promptPvpRuleChanged(previousRoom.rules, room.rules);
  }
  app.pvp.lastSeenRuleVersion = nextVersion || app.pvp.lastSeenRuleVersion || 0;
  if (room.status === "playing" && app.match) {
    if (app.scene !== "battle") app.ui.mulliganGuideShown = false;
    app.ui.handPage = clampHandPage(app.ui.handPage);
    syncPendingPvpMulliganSwap();
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
  app.ui.pvpShareGuideOpen = false;
  clearPendingPvpMulliganSwap();
  clearRoundTransitionTimer();
  app.pvp = { roomId: "", pendingRoomId: "", room: null, playerIndex: 0, loading: false, submitting: false, error: "", recordedResultKey: "", lastSeenRuleVersion: 0 };
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
    console.log("[share-debug] 创建房间云函数返回:", debugJson({
      resultRoomId: result.roomId,
      playerIndex: result.playerIndex,
      room: result.room ? { roomId: result.room.roomId, _id: result.room._id, status: result.room.status } : null
    }));
    app.pvp.roomId = result.roomId;
    app.pvp.playerIndex = result.playerIndex || 0;
    applyRoomUpdate(result.room, app.pvp.playerIndex);
    console.log("[share-debug] 创建房间后本地状态:", debugJson({
      appRoomId: app.pvp.roomId,
      resolvedShareRoomId: currentShareRoomId(),
      scene: app.scene
    }));
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

function promptJoinPvpRoom(options = {}) {
  const api = typeof wx !== "undefined" ? wx : null;
  if (!api || !api.showModal) return toast("当前环境不支持输入房间号");
  const fromShareCard = !!options.fromShareCard;
  api.showModal({
    title: fromShareCard ? "输入分享图中的房间号" : "加入好友房间",
    content: "",
    editable: true,
    placeholderText: fromShareCard ? "请输入分享图中的4位房间号" : "请输入好友的4位房间号",
    confirmText: "加入房间",
    success: res => {
      if (!res.confirm) return render();
      const roomId = normalizePvpRoomId(res.content);
      if (!roomId) return toast("请输入4位数字房间号");
      joinPvpRoom(roomId);
    },
    fail: () => render()
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

function parseShareQueryText(text) {
  const result = {};
  const source = String(text || "");
  const queryText = source.includes("?") ? source.slice(source.indexOf("?") + 1) : source;
  queryText.split("&").forEach(part => {
    if (!part) return;
    const eq = part.indexOf("=");
    const rawKey = eq >= 0 ? part.slice(0, eq) : part;
    const rawValue = eq >= 0 ? part.slice(eq + 1) : "";
    const key = safeDecode(rawKey);
    if (!key) return;
    result[key] = safeDecode(rawValue);
  });
  return result;
}

function shareQueryFromOptions(options = {}) {
  if (typeof options === "string") return parseShareQueryText(options);
  const query = options?.query || {};
  if (typeof query === "string") return parseShareQueryText(query);
  const parsedPathQuery = options?.path && String(options.path).includes("?") ? parseShareQueryText(options.path) : {};
  return { ...parsedPathQuery, ...query };
}

function extractSharedRoute(options = {}) {
  const query = shareQueryFromOptions(options);
  const scene = String(query.page || query.sharePage || query.target || query.scene || "");
  if (!scene) return null;
  return {
    scene,
    query,
    roomId: normalizePvpRoomId(query.roomId || query.room || query.r || query.pvpRoomId)
  };
}

function readSharedRoute() {
  const api = typeof wx !== "undefined" ? wx : null;
  if (!api) return null;
  try {
    const enter = api.getEnterOptionsSync && api.getEnterOptionsSync();
    const route = extractSharedRoute(enter);
    if (route) return route;
  } catch (e) {}
  try {
    const launch = api.getLaunchOptionsSync && api.getLaunchOptionsSync();
    const route = extractSharedRoute(launch);
    if (route) return route;
  } catch (e) {}
  return null;
}

function hasShareRouteHint(options) {
  const query = options?.query;
  if (!query) return false;
  if (typeof query === "string") return /(?:^|&)(?:scene|page|sharePage|target)=/i.test(query);
  return ["scene", "page", "sharePage", "target"].some(key => Object.prototype.hasOwnProperty.call(query, key));
}

function applySharedPvpRules(query) {
  const current = currentRulesFromSettings();
  const next = normalizePvpRules({
    factionMode: query.factionMode || current.factionMode,
    faction: query.faction || current.faction,
    deckMode: query.deckMode || current.deckMode
  });
  rememberPvpRules(next);
}

function handleSharedRoute(route, source) {
  if (!route) return false;
  if (route.roomId) {
    if (handleSharedRoomId(route.roomId, source)) return true;
    if (route.roomId === app.pvp.roomId) return true;
  }
  if (route.scene === "pvpSetup") {
    console.log(`[launch] ${source} 检测到分享页面，进入对战准备:`, JSON.stringify(route.query || {}));
    applySharedPvpRules(route.query || {});
    enterPvpSetup("");
    return true;
  }
  return false;
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

function logShareEntryOptions(label, options) {
  const query = shareQueryFromOptions(options || {});
  const route = extractSharedRoute(options || {});
  const roomId = extractSharedRoomId(options || {});
  console.log(`[share-debug] ${label} 原始 options:`, debugJson(options || null));
  console.log(`[share-debug] ${label} 解析结果:`, debugJson({
    optionKeys: options && typeof options === "object" ? Object.keys(options) : [],
    scene: options?.scene,
    sceneLabel: describeScene(options?.scene),
    path: options?.path || "",
    queryType: typeof options?.query,
    rawQuery: options?.query ?? null,
    mergedQuery: query,
    referrerInfo: options?.referrerInfo || null,
    shareTicket: options?.shareTicket || "",
    roomId,
    route
  }));
  if (Number(options?.scene) === 1089) {
    console.warn(`[share-debug] ${label} scene=1089 表示当前实例来源于微信“最近使用”；若这是发送分享后回到发送端，仍会沿用该来源且 query 为空，不能据此判断好友点击卡片时的参数`);
  }
}

function logShareEnvironment() {
  const api = typeof wx !== "undefined" ? wx : null;
  if (!api) return;
  let system = {};
  try { system = api.getSystemInfoSync ? api.getSystemInfoSync() : {}; } catch (err) {}
  console.log("[share-debug] 运行环境:", debugJson({
    SDKVersion: system.SDKVersion || "",
    version: system.version || "",
    platform: system.platform || "",
    environment: system.environment || "",
    hasOnShareAppMessage: typeof api.onShareAppMessage === "function",
    hasShowShareMenu: typeof api.showShareMenu === "function",
    hasGetEnterOptionsSync: typeof api.getEnterOptionsSync === "function",
    hasGetLaunchOptionsSync: typeof api.getLaunchOptionsSync === "function"
  }));
  console.log("[share-debug] 本机上次分享记录:", debugJson(readShareDebug()));
  let earlyRecord = null;
  try { earlyRecord = api.getStorageSync?.("zhangyu.share.early.debug.v1") || null; } catch (err) {}
  console.log("[share-early] 本机最早期回调记录:", debugJson(earlyRecord));
  try { logShareEntryOptions("getEnterOptionsSync", api.getEnterOptionsSync?.()); } catch (err) {
    console.warn("[share-debug] getEnterOptionsSync 调用失败:", err.message || err);
  }
  try { logShareEntryOptions("getLaunchOptionsSync", api.getLaunchOptionsSync?.()); } catch (err) {
    console.warn("[share-debug] getLaunchOptionsSync 调用失败:", err.message || err);
  }
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

let sharedCardJoinPromptShown = false;

function isChatShareEntry(options) {
  return [1007, 1008, 1044].includes(Number(options?.scene));
}

function handleSharedCardJoinFallback(options, source) {
  if (sharedCardJoinPromptShown || !isChatShareEntry(options)) return false;
  if (extractSharedRoomId(options) || extractSharedRoute(options)) return false;
  sharedCardJoinPromptShown = true;
  console.warn(`[launch] ${source} 来自聊天分享卡片但未收到 roomId，进入手动加入流程`);
  enterPvpSetup("");
  setTimeout(() => promptJoinPvpRoom({ fromShareCard: true }), 280);
  return true;
}

function handleLaunchRoom() {
  const api = typeof wx !== "undefined" ? wx : null;
  if (!api) return;
  logShareEnvironment();
  let initialOptions = null;
  try { initialOptions = api.getEnterOptionsSync?.() || null; } catch (err) {}
  if (!initialOptions) {
    try { initialOptions = api.getLaunchOptionsSync?.() || null; } catch (err) {}
  }
  const initialRoomId = readSharedRoomId();
  const initialRoute = readSharedRoute();
  console.log("[share-debug] 启动最终解析:", debugJson({ initialRoomId, initialRoute }));
  if (!handleSharedRoomId(initialRoomId, "启动")
    && !handleSharedRoute(initialRoute, "启动")
    && !handleSharedCardJoinFallback(initialOptions, "启动")) {
    console.log("[launch] 启动未检测到分享参数，保持主页");
  }
  if (api.onShow) {
    api.onShow(options => {
      logShareEntryOptions("wx.onShow", options);
      const lastShareRecord = readShareDebug();
      console.log("[share-debug] onShow 时本机上次分享记录:", debugJson(lastShareRecord));
      if (lastShareRecord?.payload?.query && !Object.keys(options?.query || {}).length) {
        console.warn("[share-debug] 本机曾生成带 query 的分享卡片，但本次 onShow 没有 query；这通常是分享面板关闭后回到发送端，不能用来判断接收端是否收到参数");
      }
      const onShowRoomId = readSharedRoomId(options);
      const onShowRoute = extractSharedRoute(options);
      console.log("[share-debug] onShow 最终解析:", debugJson({ onShowRoomId, onShowRoute }));
      if (handleSharedRoomId(onShowRoomId, "onShow")) return;
      if (handleSharedRoute(onShowRoute, "onShow")) return;
      if (handleSharedCardJoinFallback(options, "onShow")) return;
      // 只在入口 query 明显带有 room/scene 关键字时才走兜底解析，避免正常切前台产生噪音
      if (!hasRoomHint(options) && !hasShareRouteHint(options)) return;
      setTimeout(() => {
        if (handleSharedRoomId(readSharedRoomId(), "onShow兜底")) return;
        if (handleSharedRoute(readSharedRoute(), "onShow兜底")) return;
        console.log("[launch] onShow 检测到分享相关参数但未解析到有效目标，保持当前场景");
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
  if (!isMyPvpTurn() && battleAction.type !== "surrender" && battleAction.type !== "continueRound") {
    if (battleAction.type === "mulliganSwap") clearPendingPvpMulliganSwap();
    toast("等待对方行动");
    return true;
  }
  app.pvp.submitting = true;
  pvpClient.submitAction(app.pvp.roomId, app.pvp.room?.turnSeq || 0, battleAction).then(result => {
    applyRoomUpdate(result.room, result.playerIndex);
  }).catch(err => {
    console.warn("[pvp] action failed", err);
    if (battleAction.type === "mulliganSwap") clearPendingPvpMulliganSwap();
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

function performPass() {
  if (!app.match || app.match.over) return render();
  if (isOnlineMatch()) return submitPvpAction({ type: "pass" });
  pass(app.match);
  return afterHumanAction();
}

function performSkipRevivePending() {
  if (!app.match?.pending || app.match.pending.type !== "revive") return render();
  closeBattleCardDetail();
  if (isOnlineMatch()) return submitPvpAction({ type: "resolvePending", choice: { skip: true } });
  resolvePending(app.match, { skip: true });
  return afterHumanAction();
}

function confirmSkipRevivePending() {
  const api = typeof wx !== "undefined" ? wx : null;
  if (api && api.showModal) {
    api.showModal({
      title: "跳过济世？",
      content: "跳过后本次济世不再复归卡牌。要继续选牌请点取消。",
      confirmText: "跳过",
      confirmColor: "#8f3c1f",
      cancelText: "继续选择",
      success: res => {
        if (res.confirm) performSkipRevivePending();
        else render();
      },
      fail: () => render()
    });
    return;
  }
  if (typeof globalThis !== "undefined" && typeof globalThis.confirm === "function" && !globalThis.confirm("确定跳过本次济世吗？")) return render();
  return performSkipRevivePending();
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

function confirmPass() {
  const api = typeof wx !== "undefined" ? wx : null;
  if (api && api.showModal) {
    api.showModal({
      title: "确认放弃",
      content: "放弃后本小局将不再出牌，确定要放弃吗？",
      confirmText: "放弃",
      confirmColor: "#8f3c1f",
      cancelText: "再想想",
      success: res => {
        if (res.confirm) performPass();
        else render();
      },
      fail: () => render()
    });
    return;
  }
  if (typeof globalThis !== "undefined" && typeof globalThis.confirm === "function" && !globalThis.confirm("确定要放弃吗？")) return render();
  return performPass();
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
    app.ui.settingDeckScroll = 0;
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
  if (field === "pvpRuleFaction") {
    if (value === "any") saveSettings({ pvpRuleFactionMode: "any", pvpRuleFaction: settings.pvpRuleFaction || settings.pvpFaction || settings.humanFaction });
    else saveSettings({ pvpRuleFactionMode: "fixed", pvpRuleFaction: value });
  }
  render();
}

function handlePvpSetup(action) {
  const selectingOnline = app.pvp.room?.status === "selecting";
  const rules = normalizePvpRules(app.pvp.room?.rules || {});
  const factionLocked = selectingOnline && rules.factionMode === "fixed";
  const deckLocked = selectingOnline && rules.deckMode === "autoOnly";
  const selectFields = factionLocked ? ["pvpLeader"] : ["pvpFaction", "pvpLeader"];
  if (!selectingOnline) selectFields.push("pvpRuleFaction");
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
    app.ui.settingDeckScroll = 0;
    saveSettings({ humanFaction: action.faction });
    return render();
  }
  if (action.id === "settingCardTab") {
    app.ui.settingCardTab = action.value || "all";
    app.ui.settingDeckPage = 0;
    app.ui.settingDeckScroll = 0;
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
    app.ui.settingDeckScroll = 0;
    saveCustomDeckSlot(faction, 0, recommendedDeckIds(faction, "normal"), true, null, true);
    toast("已随机推荐，可继续调整");
    return render();
  }
  if (action.id === "clearCustomDeck") {
    const settings = loadSettings();
    const faction = settings.humanFaction;
    app.ui.settingDropdown = "";
    app.ui.settingDeckPage = 0;
    app.ui.settingDeckScroll = 0;
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
  if (action.id === "closePvpShareGuide") {
    app.ui.pvpShareGuideOpen = false;
    return render();
  }
  if (action.id === "pvpShareGuidePanel") return render();
  if (app.ui.pvpShareGuideOpen) return render();
  if (action.id === "closePvpRoomRuleDropdown") {
    app.ui.matchSetupDropdown = "";
    return render();
  }
  if (action.id === "selectPvpRoomRuleFaction") {
    app.ui.matchSetupDropdown = "";
    const current = normalizePvpRules(app.pvp.room?.rules || currentRulesFromSettings());
    return updatePvpRoomRules(action.value === "any"
      ? { factionMode: "any", faction: current.faction }
      : { factionMode: "fixed", faction: action.value });
  }
  if (action.id === "pvpRoomRuleFaction") {
    app.ui.matchSetupDropdown = app.ui.matchSetupDropdown === "pvpRoomRuleFaction" ? "" : "pvpRoomRuleFaction";
    return render();
  }
  if (app.ui.matchSetupDropdown === "pvpRoomRuleFaction") {
    app.ui.matchSetupDropdown = "";
    return render();
  }
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
  if (action.id === "pvpRetryJoin") return joinPvpRoom(app.pvp.roomId);
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
  if (action.id === "battleLog") return openBattleLogHistory();
  if (action.id === "closeBattleLogHistory") {
    app.ui.battleLogHistoryOpen = false;
    app.ui.battleLogHistoryScroll = 0;
    return render();
  }
  if (action.id === "battleLogHistoryPanel") return render();
  if (action.id === "dismissRecentPlay") {
    app.ui.dismissedRecentPlaySeq = Math.max(app.ui.dismissedRecentPlaySeq || 0, action.seq || app.match.lastPlayed?.seq || 0);
    clearRecentPlayTimer();
    if (app.match.roundTransition) return continueBattleRoundTransition();
    return render();
  }
  if (app.match.roundTransition) return render();
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
    if (app.match.pending?.type === "revive" && (app.ui.battleCardDetailId || app.ui.battleCardDetailUid)) {
      return confirmSkipRevivePending();
    }
    app.ui.battleCardDetailId = "";
    app.ui.battleCardDetailUid = "";
    app.ui.mulliganHelpOpen = false;
    if (app.ui.pendingPvpMulliganSwap) app.ui.pendingPvpMulliganSwap.keepDetail = false;
    return render();
  }
  if (action.id === "mulliganDetailSwap") return handleMulliganSwap(action.cardUid, true);
  if (action.id === "targetChoice" && app.match.pending?.type === "revive") {
    closeBattleCardDetail();
    if (isOnlineMatch()) return submitPvpAction({ type: "resolvePending", choice: { uid: action.cardUid } });
    resolvePending(app.match, { uid: action.cardUid });
    return afterHumanAction();
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
      if (action.id === "firstPlayerChoice") return submitPvpAction({ type: "resolvePending", choice: { playerIndex: action.playerIndex } });
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
      if (action.id === "card") return handleMulliganSwap(action.cardUid);
      if (action.id === "mulliganDone") return app.ui.pendingPvpMulliganSwap ? render() : submitPvpAction({ type: "mulliganDone" });
      return render();
    }
    if (action.id === "leader") return submitPvpAction({ type: "leader" });
    if (action.id === "card") return submitPvpAction({ type: "card", cardUid: action.cardUid });
    if (action.id === "pass") return confirmPass();
    return render();
  }

  if (app.match.pending) {
    if (action.id === "firstPlayerChoice") resolvePending(app.match, { playerIndex: action.playerIndex });
    else if (action.id === "rowChoice") resolvePending(app.match, { row: action.row });
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
    if (action.id === "card") return handleMulliganSwap(action.cardUid);
    if (action.id === "mulliganDone") { finishMulligan(app.match); app.ui.mulliganHandOrder = null; return afterHumanAction(); }
    return;
  }
  if (action.id === "leader") useLeader(app.match, app.match.current);
  if (action.id === "card") playCard(app.match, action.cardUid);
  if (action.id === "pass") return confirmPass();
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

function mergeBattlePlayLogEntries(logs) {
  const entries = [];
  let pendingMuster = "";
  (logs || []).forEach(item => {
    const value = String(item || "");
    if (/^集贤(?:生效：)?(?:(?:从牌库)?额外打出|从牌库打出)/.test(value)) {
      pendingMuster = value.replace(/^集贤生效：/, "集贤").replace(/。$/, "");
      return;
    }
    if (/打出|使用主将/.test(value)) {
      const textValue = pendingMuster ? `${value.replace(/。$/, "")}；${pendingMuster}。` : value;
      entries.push({ text: textValue });
      pendingMuster = "";
    }
  });
  return entries;
}

function summonHistoryInfo(entry) {
  const source = [entry.description, entry.text].filter(Boolean).map(String).join("");
  const m = source.match(/召唤岳家军\s*(\d+)\s*张(?:：([^；。]+))?/);
  if (!m) return null;
  return {
    count: Number(m[1]) || 0,
    names: (m[2] || "岳家军").split("、").map(name => name.trim()).filter(Boolean)
  };
}

function shouldHideSummonedBattleEntry(history, entry) {
  if (!entry || entry.actionType !== "card" || !Number.isFinite(entry.seq)) return false;
  const name = entry.baseName || entry.name || "";
  if (!name) return false;
  return history.some(parent => {
    if (!parent || !Number.isFinite(parent.seq) || parent.seq >= entry.seq) return false;
    if (parent.playerIndex !== entry.playerIndex) return false;
    const info = summonHistoryInfo(parent);
    if (!info || entry.seq > parent.seq + info.count) return false;
    return !info.names.length || info.names.includes(name);
  });
}

function visibleBattlePlayHistory(history) {
  return history.filter((entry) => !shouldHideSummonedBattleEntry(history, entry));
}

function battlePlayedHistory() {
  const history = Array.isArray(app.match?.playedHistory) ? visibleBattlePlayHistory(app.match.playedHistory) : [];
  if (history.length) return history;
  const playLogs = mergeBattlePlayLogEntries(app.match?.logs || []);
  if (playLogs.length) return playLogs;
  return app.match?.lastPlayed ? [app.match.lastPlayed] : [];
}

function battleLogHistoryScrollBounds() {
  const panelY = view.safeTop + 74;
  const panelH = Math.max(300, Math.min(430, view.height - view.safeTop - view.safeBottom - 156));
  const listTop = panelY + 72;
  const listBottom = panelY + panelH - 22;
  const rowH = 48;
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

function handleBattleFieldRowSwipe(start, end) {
  if (!start || !end || app.scene !== "battle" || !app.match || app.ui.battleCardDetailId || app.ui.battleCardDetailUid || app.ui.battleLogHistoryOpen || app.ui.discardPileOwner != null) return false;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  if (absX < 42 || absX < absY * 1.2) return false;
  const action = findAction(start);
  if (!action || !["battleFieldRow", "battleCardDetail"].includes(action.id) || !action.scrollKey || !(action.maxScroll > 0)) return false;
  if (!app.ui.battleRowScrolls) app.ui.battleRowScrolls = {};
  const current = app.ui.battleRowScrolls[action.scrollKey] || 0;
  const step = action.pageStep || 96;
  const next = Math.max(0, Math.min(current + (dx < 0 ? step : -step), action.maxScroll));
  if (Math.abs(next - current) > 0.5) {
    app.ui.battleRowScrolls[action.scrollKey] = next;
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

function settingDeckScrollBounds() {
  const settings = loadSettings();
  const faction = settings.humanFaction;
  const cardTab = app.ui.settingCardTab || "all";
  const active = cardTab || "all";
  const cards = eligibleCards(faction).filter(card => {
    if (active === "all") return true;
    if (active === "special") return card.category === "special" || card.category === "weather";
    if (active === "hero") return !!card.hero;
    if (!(card.category === "unit" || card.category === "hero")) return false;
    return (card.row || []).includes(active);
  });
  const groups = groupCards(cards);
  return settingsScene.scrollBounds(view, groups.length);
}

function clampSettingDeckScroll(value) {
  const { maxScroll } = settingDeckScrollBounds();
  return Math.max(0, Math.min(value || 0, maxScroll));
}

function scrollSettingDeckBy(deltaY) {
  if (app.scene !== "settings" || app.ui.settingCardDetailId || app.ui.settingDropdown) return false;
  const before = app.ui.settingDeckScroll || 0;
  const next = clampSettingDeckScroll(before - deltaY);
  if (Math.abs(next - before) > 0.5) {
    app.ui.settingDeckScroll = next;
    render();
  }
  return true;
}

function handleSettingsSwipe(start, end) {
  // 此函数保留给惯性滚动回弹等后续扩展使用
  // 实时滚动已在 touchmove 中通过 scrollSettingDeckBy 处理
  return false;
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

    // 我的牌组列表实时滚动
    if (app.scene === "settings" && !app.ui.settingCardDetailId && !app.ui.settingDropdown) {
      const bounds = settingDeckScrollBounds();
      const start = touchStartState.point;
      const dx = point.x - start.x;
      const dy = point.y - start.y;
      // 实时检测：当前点必须在列表范围内，且满足垂直滑动条件
      if (bounds.maxScroll > 0 && point.y >= bounds.listTop - 10 && point.y <= bounds.listBottom + 10 && Math.abs(dy) > 3 && Math.abs(dy) > Math.abs(dx) * 0.7) {
        clearLongPress();
        const last = touchStartState.lastPoint || start;
        scrollSettingDeckBy(point.y - last.y);
        touchStartState.settingsDeckScrolled = true;
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
    if (state && state.settingsDeckScrolled) return;
    if (handleBattleLogHistorySwipe(start, point)) return;
    if (handleDiscardPileSwipe(start, point)) return;
    if (handleBattleFieldRowSwipe(start, point)) return;
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

console.log("===== 章鱼牌 v0718-join-fallback-v1 新代码已加载 =====");
pvpClient.initCloud();
setupShare();
handleLaunchRoom();
render();
