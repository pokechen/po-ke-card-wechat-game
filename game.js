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

const { createCanvasAdapter, hit, setImageRenderHook, drawRemoteImage, fillRoundRect, text, wrapText, button } = require("./js/ui/canvas");
const menuScene = require("./js/scenes/menu");
const matchSetupScene = require("./js/scenes/matchSetup");
const rulesScene = require("./js/scenes/rules");
const settingsScene = require("./js/scenes/settings");
const deckBuilderScene = require("./js/scenes/deckBuilder");
const historyScene = require("./js/scenes/history");
const adminStatsScene = require("./js/scenes/adminStats");
const rankSetupScene = require("./js/scenes/rankSetup");
const rankLeaderboardScene = require("./js/scenes/rankLeaderboard");
const battleScene = require("./js/scenes/battleScene");
const { sortedHandCards } = battleScene;
const resultScene = require("./js/scenes/result");
const battleCardsScene = require("./js/scenes/battleCards");
const pvpRoomScene = require("./js/scenes/pvpRoom");
const pvpSetupScene = require("./js/scenes/pvpSetup");
const pvpClient = require("./js/core/pvpClient");
const rankCore = require("./js/core/rank");
const { loadSave, loadSettings, saveSettings, saveProgress, recordMatch, localMatchRecords, removeLocalMatchRecord, setRecordMatchCloudHook, getCustomDeckSlots, getActiveCustomDeckSlotIndex, getActiveCustomDeckIds } = require("./js/core/storage");
const { cardById, displayName, factionPerkSummary, deckStatus, recommendedDeckIds, leadersFor, FACTION_KEYS, FACTION_LABELS, eligibleCards, groupCards, cardValue, allCards } = require("./js/core/cards");
const { createMatch, playCard, pass, useLeader, mulliganSwap, finishMulligan, continueRoundTransition, aiStep, resolvePending, cancelPending, surrender, handOwnerIndex, totalScore } = require("./js/core/battle");

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
  rank: {
    profile: null,
    rules: null,
    nextTier: null,
    currentMatch: null,
    resultDelta: null,
    leaderboard: [],
    publicProfile: null,
    publicProfileOpen: false,
    publicProfileLoading: false,
    publicProfileError: "",
    loading: false,
    starting: false,
    submitting: false,
    leaderboardLoading: false,
    error: ""
  },
  pvp: {
    roomId: "",
    pendingRoomId: "",
    room: null,
    playerIndex: 0,
    loading: false,
    submitting: false,
    error: "",
    recordedResultKey: "",
    lastSeenRuleVersion: 0,
    readyRuleVersion: 0,
    autoStartReadySeq: 0,
    rulePromptOpen: false,
    pendingRulePrompt: null,
    dissolvedNoticeRoomId: ""
  },
  ui: {
    handScroll: 0,
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
    rankSetupDropdown: "",
    deckSlotDropdown: "",
    historyScroll: 0,
    historyLeaderDetailId: "",
    cloudHistoryRecords: [],
    cloudHistoryLoaded: false,
    cloudHistoryLoading: false,
    cloudHistoryLoadingMore: false,
    cloudHistoryError: "",
    cloudHistoryTotal: null,
    cloudHistoryWins: 0,
    cloudHistoryLosses: 0,
    cloudHistoryDraws: 0,
    cloudHistoryWinRate: 0,
    cloudHistorySkip: 0,
    cloudHistoryHasMore: false,
    battleCardsSide: "mine",
    battleCardsScrolls: [0, 0],
    battleCardsDetailId: "",
    battleCardsHelpOpen: false,
    dismissedRecentPlaySeq: 0,
    dismissedLeaderRevealKey: "",
    discardPileOwner: null,
    discardPileScroll: 0,
    battleLogHistoryOpen: false,
    battleLogHistoryScroll: 0,
    battleRowScrolls: {},
    passLeadHintActive: false,
    passLeadHintActiveKey: "",
    passLeadHintShownKey: "",
    passLeadHintDismissedKey: "",
    passLeadHintMatchKey: "",
    pvpShareGuideOpen: false,
    pvpShareCodeLoading: false,
    pvpShareCodePath: "",
    pvpShareCodeError: "",
    pvpShareCodeRoomId: "",
    pvpShareCodeEnvVersion: "",
    pvpReadyAnimUntil: 0,
    authToken: "",
    authUser: null,
    authExpiresAt: 0,
    isAdmin: false,
    adminStats: null,
    adminStatsLoading: false,
    adminStatsError: "",
    adminStatsScroll: 0,
    rankLeaderboardScroll: 0,
    pageTransition: null,
    detailSwipe: null
  }
};

let imageRenderPending = false;
setImageRenderHook(() => {
  if (app.ui.settingDeckScrolling) return;
  if (imageRenderPending) return;
  imageRenderPending = true;
  requestFrame(() => {
    imageRenderPending = false;
    render();
  });
});

const RECENT_PLAY_AUTO_DISMISS_MS = 2000;
const ROUND_TRANSITION_NOTICE_MS = RECENT_PLAY_AUTO_DISMISS_MS * 2;
const PASS_LEAD_HINT_KEY = "zhangyu.pass-lead-hint.count.v1";
const MAX_PASS_LEAD_HINT_COUNT = 3;
const ACTIVE_SINGLE_MATCH_KEY = "zhangyu.single-match.active.v1";
const PENDING_RANK_RESULT_KEY = "zhangyu.rank-result.pending.v1";
let activeSingleMatchSnapshot = "";
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

function playPvpReadyAnim(duration = 900) {
  app.ui.pvpReadyAnimUntil = Date.now() + duration;
  const tick = () => {
    if (Date.now() >= app.ui.pvpReadyAnimUntil) return;
    if (app.scene === "pvpRoom") render();
    requestFrame(tick);
  };
  requestFrame(tick);
}

function activeSingleMatch() {
  return app.match && app.match.mode === "ai" && !app.match.over ? app.match : null;
}

function clearActiveSingleMatchSnapshot() {
  activeSingleMatchSnapshot = "";
  const api = typeof wx !== "undefined" ? wx : null;
  if (!api?.removeStorageSync) return;
  try { api.removeStorageSync(ACTIVE_SINGLE_MATCH_KEY); } catch (err) {
    console.warn("[single-match] 清理未完成对局快照失败", err?.message || err);
  }
}

function persistActiveSingleMatch() {
  const match = activeSingleMatch();
  if (!match) {
    if (app.match?.mode === "ai" && app.match.over) clearActiveSingleMatchSnapshot();
    return false;
  }
  const api = typeof wx !== "undefined" ? wx : null;
  if (!api?.setStorageSync) return false;
  try {
    const serialized = JSON.stringify(match);
    if (serialized === activeSingleMatchSnapshot) return true;
    api.setStorageSync(ACTIVE_SINGLE_MATCH_KEY, {
      version: 1,
      savedAt: Date.now(),
      match: JSON.parse(serialized)
    });
    activeSingleMatchSnapshot = serialized;
    return true;
  } catch (err) {
    console.warn("[single-match] 保存未完成对局快照失败", err?.message || err);
    return false;
  }
}

function savePendingRankResult(match, durationMs) {
  if (!match?.ranked || !match.rankMatchId || !match.over || match.rankSubmitted) return null;
  const api = typeof wx !== "undefined" ? wx : null;
  if (!api?.setStorageSync) return null;
  const payload = {
    version: 1,
    savedAt: Date.now(),
    rankMatchId: match.rankMatchId,
    finalStateSummary: rankFinalSummary(match),
    clientVersion: "wechat-game",
    durationMs: Math.max(0, durationMs || 0)
  };
  try {
    api.setStorageSync(PENDING_RANK_RESULT_KEY, payload);
    return payload;
  } catch (err) {
    console.warn("[rank] 保存待同步排位结算失败", err?.message || err);
    return null;
  }
}

function readPendingRankResult() {
  const api = typeof wx !== "undefined" ? wx : null;
  if (!api?.getStorageSync) return null;
  try {
    const payload = api.getStorageSync(PENDING_RANK_RESULT_KEY) || null;
    return payload?.version === 1 && payload.rankMatchId && payload.finalStateSummary ? payload : null;
  } catch (err) {
    return null;
  }
}

function clearPendingRankResult(rankMatchId = "") {
  const pending = readPendingRankResult();
  if (rankMatchId && pending && pending.rankMatchId !== rankMatchId) return;
  const api = typeof wx !== "undefined" ? wx : null;
  if (!api?.removeStorageSync) return;
  try { api.removeStorageSync(PENDING_RANK_RESULT_KEY); } catch (err) {}
}

function retryPendingRankResult(source = "retry") {
  const pending = readPendingRankResult();
  if (!pending || app.rank.retryingPendingRankResult) return false;
  if (app.match?.rankMatchId === pending.rankMatchId && app.match.rankSubmitting) return false;
  app.rank.retryingPendingRankResult = true;
  pvpClient.finishRankMatch(pending.rankMatchId, pending.finalStateSummary, pending.clientVersion || "wechat-game", pending.durationMs || 0).then(result => {
    clearPendingRankResult(pending.rankMatchId);
    app.rank.retryingPendingRankResult = false;
    app.rank.profile = result.profile || app.rank.profile;
    app.rank.resultDelta = result.delta || app.rank.resultDelta;
    if (app.match?.rankMatchId === pending.rankMatchId) {
      app.match.rankSubmitted = true;
      app.match.rankSubmitting = false;
      app.match.rankDelta = result.delta || null;
      app.match.rankSubmitError = "";
    }
    refreshCloudMatchHistory(false);
    render();
  }).catch(err => {
    app.rank.retryingPendingRankResult = false;
    if (err?.code === "RANK_ALREADY_FINISHED") {
      clearPendingRankResult(pending.rankMatchId);
      loadRankProfile(true);
      return;
    }
    console.warn("[rank] 待同步排位结算重试失败", source, err?.message || err);
  });
  return true;
}

function restoreInterruptedSingleMatch() {
  const api = typeof wx !== "undefined" ? wx : null;
  if (!api?.getStorageSync) return false;
  let snapshot = null;
  try { snapshot = api.getStorageSync(ACTIVE_SINGLE_MATCH_KEY) || null; } catch (err) {}
  if (!snapshot || snapshot.version !== 1) return false;
  clearActiveSingleMatchSnapshot();
  const source = snapshot.match;
  if (!source || source.mode !== "ai" || source.over || source.historyRecorded || !Array.isArray(source.players) || source.players.length !== 2) return false;
  try {
    app.match = JSON.parse(JSON.stringify(source));
    surrender(app.match, 0, "disconnect");
    app.scene = "result";
    if (app.match.ranked) {
      const durationMs = Math.max(0, Date.now() - (app.match.rankStartedAt || Date.now()));
      savePendingRankResult(app.match, durationMs);
      setTimeout(submitRankResultIfNeeded, 0);
    }
    console.log("[single-match] 检测到重新进入前未完成的单机对局，已判负结算");
    return true;
  } catch (err) {
    console.warn("[single-match] 结算未完成单机对局失败", err?.message || err);
    app.match = null;
    return false;
  }
}

function resumeSuspendedSingleMatch() {
  if (app.scene !== "battle" || !activeSingleMatch()) return false;
  // 排位对局若中断超过 60 秒，视为掉线判负而非恢复
  if (app.match.ranked) {
    const api = typeof wx !== "undefined" ? wx : null;
    let snap = null;
    try { snap = api?.getStorageSync?.(ACTIVE_SINGLE_MATCH_KEY) || null; } catch (err) {}
    const savedAt = snap && typeof snap.savedAt === "number" ? snap.savedAt : 0;
    if (savedAt && (Date.now() - savedAt > 60000)) {
      clearActiveSingleMatchSnapshot();
      performDisconnectLoss("suspend-timeout");
      return true;
    }
  }
  render();
  if (!app.match.pending) scheduleAi();
  return true;
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

function localMatchPlayerIndex(match = app.match) {
  return match?.mode === "online" && Number.isInteger(match.localPlayerIndex) ? match.localPlayerIndex : 0;
}

function passLeadHintStorageValue() {
  try {
    const api = typeof wx !== "undefined" ? wx : null;
    const value = api && api.getStorageSync
      ? api.getStorageSync(PASS_LEAD_HINT_KEY)
      : (typeof globalThis !== "undefined" && globalThis.localStorage ? globalThis.localStorage.getItem(PASS_LEAD_HINT_KEY) : null);
    const count = typeof value === "object" && value ? Number(value.count) : Number(value);
    return Number.isFinite(count) ? Math.max(0, count) : 0;
  } catch (err) {
    return 0;
  }
}

function savePassLeadHintStorageValue(count) {
  const safeCount = Math.max(0, Math.min(MAX_PASS_LEAD_HINT_COUNT, Number(count) || 0));
  try {
    const api = typeof wx !== "undefined" ? wx : null;
    if (api && api.setStorageSync) return api.setStorageSync(PASS_LEAD_HINT_KEY, safeCount);
    if (typeof globalThis !== "undefined" && globalThis.localStorage) globalThis.localStorage.setItem(PASS_LEAD_HINT_KEY, String(safeCount));
  } catch (err) {}
}

function passLeadHintMatchKey() {
  if (!app.match) return "";
  if (app.match.matchId) return `match:${app.match.matchId}`;
  if (app.match.rankMatchId) return `rank:${app.match.rankMatchId}`;
  if (isOnlineMatch()) return `online:${app.pvp.roomId || "room"}`;
  if (!app.ui.passLeadHintMatchKey) app.ui.passLeadHintMatchKey = `single:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  return app.ui.passLeadHintMatchKey;
}

function passLeadHintCandidate() {
  const match = app.match;
  if (app.scene !== "battle" || !match || match.over || match.roundTransition || match.pending) return null;
  if (match.mulligan && match.mulligan.active) return null;
  if (match.round !== 1 && match.round !== 2) return null;
  if (visibleRecentPlaySeq()) return null;
  if (app.ui.showCardGuide || (match.round === 1 && !app.ui.firstPlayerAnnounced)) return null;
  if (app.ui.battleCardDetailId || app.ui.battleCardDetailUid || app.ui.battleLogHistoryOpen || app.ui.discardPileOwner != null) return null;
  const local = localMatchPlayerIndex(match);
  const opponent = local === 0 ? 1 : 0;
  const localPlayer = match.players?.[local];
  const opponentPlayer = match.players?.[opponent];
  if (!localPlayer || !opponentPlayer || localPlayer.passed || !opponentPlayer.passed) return null;
  if (match.mode === "online" ? match.current !== local : match.current !== 0) return null;
  const localScore = totalScore(localPlayer);
  const opponentScore = totalScore(opponentPlayer);
  if (localScore <= opponentScore) return null;
  return { key: `${passLeadHintMatchKey()}:round:${match.round}:player:${local}`, localScore, opponentScore };
}

function preparePassLeadHint() {
  const candidate = passLeadHintCandidate();
  if (!candidate) {
    app.ui.passLeadHintActive = false;
    app.ui.passLeadHintActiveKey = "";
    return;
  }
  if (app.ui.passLeadHintActive && app.ui.passLeadHintActiveKey === candidate.key) return;
  app.ui.passLeadHintActive = false;
  app.ui.passLeadHintActiveKey = "";
  if (app.ui.passLeadHintDismissedKey === candidate.key) return;
  if (app.ui.passLeadHintShownKey === candidate.key) {
    app.ui.passLeadHintActive = true;
    app.ui.passLeadHintActiveKey = candidate.key;
    app.ui.passLeadHintScores = { local: candidate.localScore, opponent: candidate.opponentScore };
    return;
  }
  const shownCount = passLeadHintStorageValue();
  if (shownCount >= MAX_PASS_LEAD_HINT_COUNT) return;
  savePassLeadHintStorageValue(shownCount + 1);
  app.ui.passLeadHintShownKey = candidate.key;
  app.ui.passLeadHintActive = true;
  app.ui.passLeadHintActiveKey = candidate.key;
  app.ui.passLeadHintScores = { local: candidate.localScore, opponent: candidate.opponentScore };
}

function dismissPassLeadHintForCurrent() {
  if (!app.ui.passLeadHintActive && !app.ui.passLeadHintActiveKey) return;
  app.ui.passLeadHintDismissedKey = app.ui.passLeadHintActiveKey;
  app.ui.passLeadHintActive = false;
  app.ui.passLeadHintActiveKey = "";
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
  persistActiveSingleMatch();
  app.ui.handScroll = clampHandScroll(app.ui.handScroll);
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
    app.ui.handScroll = 0;
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
    app.ui.handScroll = 0;
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
  app.ui.handScroll = 0;
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
  app.ui.handScroll = 0;
  if (!app.match.mulligan?.active) app.ui.mulliganHandOrder = null;
  return afterHumanAction();
}

function finishMulliganSwapSequence(closeDetail = true) {
  app.ui.mulliganSwapAnim = null;
  app.ui.mulliganSwapQueue = null;
  app.ui.mulliganSwapIndex = 0;
  app.ui.mulliganReplacedUid = "";
  if (closeDetail) closeBattleCardDetail();
  app.ui.handScroll = 0;
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

const PROFILE_DEFAULT_NAME = "章鱼隐士";
const CARD_IMAGE_BASE_URL = "https://po-ke-card-d0gg2ewaac3e700c4-1302893388.tcloudbaseapp.com/po-ke-card";
let profileAuthButton = null;
let profileAuthButtonMode = "";
let profileUpdating = false;
let profileSaving = false;
let profileAvatarUploading = false;
let profileAvatarUploadPromise = null;
let profileAvatarPickVersion = 0;

function randomCardImageUrl() {
  const cards = Array.isArray(allCards) ? allCards : [];
  if (!cards.length) return "";
  const card = cards[Math.floor(Math.random() * cards.length)];
  const name = card?.name;
  if (!name) return "";
  return `${CARD_IMAGE_BASE_URL}/${encodeURIComponent(name)}.webp`;
}

function hasRealProfile() {
  const name = app.ui.authUser && app.ui.authUser.nickName;
  return !!(name && name !== PROFILE_DEFAULT_NAME);
}

function destroyProfileAuthButton() {
  if (profileAuthButton && typeof profileAuthButton.destroy === "function") {
    try { profileAuthButton.destroy(); } catch (err) {}
  }
  profileAuthButton = null;
  profileAuthButtonMode = "";
}

function applyProfile(userInfo) {
  const nickName = (userInfo && userInfo.nickName) || PROFILE_DEFAULT_NAME;
  const avatarUrl = (userInfo && userInfo.avatarUrl) || "";
  app.ui.authUser = { nickName, avatarUrl };
  saveAuthSession({
    token: app.ui.authToken,
    expiresAt: app.ui.authExpiresAt,
    tokenStorage: app.ui.authTokenStorage || ""
  });
  render();
  if (!profileUpdating) {
    profileUpdating = true;
    ensureCloudAuth()
      .then(authed => authed ? pvpClient.updateProfile({ nickName, avatarUrl }) : null)
      .catch(err => console.warn("[profile] update failed", err && err.message ? err.message : err))
      .then(() => { profileUpdating = false; });
  }
}

let keyboardInputHandler = null;
let keyboardConfirmHandler = null;
function startNameKeyboard() {
  if (typeof wx === "undefined" || typeof wx.showKeyboard !== "function") return;
  stopNameKeyboard();
  keyboardInputHandler = (res) => {
    if (app.ui.profileDraft) { app.ui.profileDraft.nickName = (res && res.value) || ""; render(); }
  };
  keyboardConfirmHandler = (res) => {
    if (app.ui.profileDraft) app.ui.profileDraft.nickName = (res && res.value) || app.ui.profileDraft.nickName;
    app.ui.profileEditingName = false;
    try { wx.hideKeyboard(); } catch (err) {}
    render();
  };
  try { wx.onKeyboardInput(keyboardInputHandler); } catch (err) {}
  try { wx.onKeyboardConfirm(keyboardConfirmHandler); } catch (err) {}
  try {
    wx.showKeyboard({ defaultValue: app.ui.profileDraft.nickName || "", maxLength: 12, confirmType: "done", confirmHold: false });
    app.ui.profileEditingName = true;
    render();
  } catch (err) {}
}
function stopNameKeyboard() {
  if (keyboardInputHandler) { try { wx.offKeyboardInput(keyboardInputHandler); } catch (err) {} keyboardInputHandler = null; }
  if (keyboardConfirmHandler) { try { wx.offKeyboardConfirm(keyboardConfirmHandler); } catch (err) {} keyboardConfirmHandler = null; }
  try { wx.hideKeyboard(); } catch (err) {}
}

function profileAvatarErrorTip(error) {
  const message = String(error?.errMsg || error?.message || error || "");
  if (/cancel/i.test(message)) return "";
  if (/112|not declared|privacy agreement|announce your privacy usage|1025|1026/i.test(message)) {
    return "请先在隐私保护指引中声明头像图片用途";
  }
  if (/104|privacy permission is not authorized|privacy/i.test(message)) return "请先同意隐私保护指引";
  if (/permission|authorize|denied|deny/i.test(message)) return "未获得相册或相机权限";
  return "头像选择失败，请稍后重试";
}

function requireProfilePrivacy(api) {
  if (typeof api?.requirePrivacyAuthorize !== "function") return Promise.resolve();
  return new Promise((resolve, reject) => {
    try { api.requirePrivacyAuthorize({ success: resolve, fail: reject }); }
    catch (err) { reject(err); }
  });
}

function pickProfileImage(api) {
  const chooseMedia = typeof api?.chooseMedia === "function" ? api.chooseMedia.bind(api) : null;
  const chooseImage = typeof api?.chooseImage === "function" ? api.chooseImage.bind(api) : null;
  const picker = chooseMedia || chooseImage;
  if (!picker) return Promise.reject(new Error("当前环境不支持选择头像"));
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = value => { if (!settled) { settled = true; resolve(value || {}); } };
    const fail = error => { if (!settled) { settled = true; reject(error); } };
    const options = chooseMedia
      ? { count: 1, mediaType: ["image"], sizeType: ["compressed"], sourceType: ["album", "camera"], success: done, fail }
      : { count: 1, sizeType: ["compressed"], sourceType: ["album", "camera"], success: done, fail };
    try {
      const result = picker(options);
      if (result && typeof result.then === "function") result.then(done).catch(fail);
    } catch (err) { fail(err); }
  });
}

function uploadAvatarToCloud(localPath) {
  if (!localPath || typeof pvpClient.uploadAvatarFile !== "function") return Promise.reject(new Error("当前环境不支持头像上传"));
  return ensureCloudAuth()
    .then(authed => {
      if (!authed) throw new Error("登录失败，请稍后重试");
      return pvpClient.uploadAvatarFile(localPath);
    })
    .then(res => {
      const avatarUrl = res?.avatarUrl || res?.fileID || "";
      if (!avatarUrl) throw new Error("头像上传未返回有效地址");
      return avatarUrl;
    });
}

function chooseAvatarImage() {
  const api = typeof wx !== "undefined" ? wx : null;
  if (!api) return toast("当前环境不支持选择头像");
  if (profileAvatarUploading || profileAvatarUploadPromise) return toast("头像正在上传，请稍候");
  app.ui.profileTip = "正在打开相册…";
  render();
  requireProfilePrivacy(api)
    .then(() => pickProfileImage(api))
    .then(res => {
      const paths = Array.isArray(res.tempFiles)
        ? res.tempFiles.map(file => file?.tempFilePath || file?.path || "")
        : (res.tempFilePaths || []);
      const localPath = paths[0] || "";
      if (!localPath) throw new Error("未读取到所选图片");
      const version = ++profileAvatarPickVersion;
      profileAvatarUploading = true;
      if (app.ui.profileDraft) app.ui.profileDraft.avatarPreviewUrl = localPath;
      app.ui.profileTip = "头像上传中…";
      render();
      profileAvatarUploadPromise = uploadAvatarToCloud(localPath)
        .then(avatarUrl => {
          if (version !== profileAvatarPickVersion) return;
          if (app.ui.profileDraft) {
            app.ui.profileDraft.avatarUrl = avatarUrl;
            app.ui.profileDraft.avatarPreviewUrl = "";
          }
          app.ui.profileTip = "头像上传成功";
          toast("头像上传成功");
        })
        .catch(err => {
          if (version !== profileAvatarPickVersion) return;
          console.warn("[profile] upload avatar failed", err && err.message ? err.message : err);
          if (app.ui.profileDraft) app.ui.profileDraft.avatarPreviewUrl = "";
          app.ui.profileTip = "头像上传失败，请重试";
          toast("头像上传失败，请重试");
        })
        .then(() => {
          if (version === profileAvatarPickVersion) {
            profileAvatarUploading = false;
            profileAvatarUploadPromise = null;
            render();
          }
        });
      return profileAvatarUploadPromise;
    })
    .catch(err => {
      const tip = profileAvatarErrorTip(err);
      app.ui.profileTip = tip;
      if (tip) {
        console.warn("[profile] choose avatar failed", err && err.errMsg ? err.errMsg : err);
        toast(tip);
      } else {
        app.ui.profileTip = "";
      }
      render();
    });
}

function saveProfileDraft() {
  if (profileAvatarUploading || profileAvatarUploadPromise) {
    toast("头像正在上传，请稍候");
    return Promise.resolve(false);
  }
  if (profileSaving) {
    toast("资料正在保存，请稍候");
    return Promise.resolve(false);
  }
  const draft = app.ui.profileDraft || {};
  const nickName = (draft.nickName || "").trim() || PROFILE_DEFAULT_NAME;
  const avatarUrl = draft.avatarUrl || "";
  profileSaving = true;
  app.ui.profileTip = "资料保存中…";
  render();
  return ensureCloudAuth()
    .then(authed => {
      if (!authed) throw new Error("登录失败，请稍后重试");
      return pvpClient.updateProfile({ nickName, avatarUrl });
    })
    .then(result => {
      const profile = result?.customProfile || result?.user || {};
      app.ui.authUser = {
        nickName: profile.nickName || nickName,
        avatarUrl: profile.avatarUrl || avatarUrl
      };
      saveAuthSession({
        token: app.ui.authToken,
        expiresAt: app.ui.authExpiresAt,
        tokenStorage: app.ui.authTokenStorage || ""
      });
      app.ui.profileTip = "资料保存成功";
      toast("资料保存成功");
      return true;
    })
    .catch(err => {
      console.warn("[profile] update failed", err && err.message ? err.message : err);
      app.ui.profileTip = "资料保存失败，请重试";
      toast("资料保存失败，请重试");
      return false;
    })
    .then(saved => {
      profileSaving = false;
      render();
      return saved;
    });
}

function openProfileSheet(tip = "") {
  destroyProfileAuthButton();
  const user = app.ui.authUser || {};
  app.ui.profileDraft = { nickName: user.nickName || "", avatarUrl: user.avatarUrl || "", avatarPreviewUrl: "" };
  app.ui.profileEditingName = false;
  app.ui.profileTip = tip;
  app.ui.profileSheetOpen = true;
  app.ui.profilePromptShown = true;
  render();
}

function closeProfileSheet() {
  if (profileAvatarUploading || profileAvatarUploadPromise) {
    toast("头像正在上传，请稍候");
    return false;
  }
  if (profileSaving) return false;
  const wasFirst = app.ui.profileFirstOpen;
  app.ui.profileSheetOpen = false;
  app.ui.profileFirstOpen = false;
  destroyProfileAuthButton();
  stopNameKeyboard();
  // 首次进入若未设置真实昵称，则落默认昵称，同时保留已上传头像。
  if (wasFirst) {
    const draft = app.ui.profileDraft || {};
    if (!(draft.nickName && draft.nickName !== PROFILE_DEFAULT_NAME)) {
      applyProfile({ nickName: PROFILE_DEFAULT_NAME, avatarUrl: draft.avatarUrl || app.ui.authUser?.avatarUrl || "" });
      return true;
    }
  }
  render();
  return true;
}

function profileNeedsNickname(user = app.ui.authUser) {
  return !String(user?.nickName || "").trim();
}

function menuProfileAuthRect() {
  return { x: 16, y: view.safeTop + 10, w: 34 + 160, h: 38 };
}

function profileAuthPromptConsumed() {
  return !profileNeedsNickname() || app.ui.profileAuthPrompted || loadProfileAuthPrompted();
}

function shouldUseAvatarAuth() {
  return app.scene === "menu" && !app.ui.profileSheetOpen && !profileAuthPromptConsumed();
}

function promptProfileIfNeeded(needsProfile) {
  if (!needsProfile || profileAuthPromptConsumed()) return;
  app.ui.profileFirstOpen = true;
  app.ui.profileAuthGuide = true;
  render();
  createProfileAuthButton("avatar");
}

// 统一按钮风格：浅底深字，清晰可读
const BTN_FILL = "#fff7e8";
const BTN_STROKE = "#c4b49a";
const BTN_TEXT = "#4a3826";

function createProfileAuthButton(mode = "avatar") {
  if (profileAuthButton && profileAuthButtonMode === mode) return true;
  destroyProfileAuthButton();
  if (typeof wx === "undefined" || typeof wx.createUserInfoButton !== "function") {
    saveProfileAuthPrompted();
    app.ui.profileAuthGuide = false;
    openProfileSheet("当前环境无法微信授权，请填写个人信息");
    return false;
  }
  const rect = menuProfileAuthRect();
  profileAuthButton = wx.createUserInfoButton({
    type: "text",
    text: "",
    style: {
      left: rect.x,
      top: rect.y,
      width: rect.w,
      height: rect.h,
      lineHeight: rect.h,
      backgroundColor: "rgba(255,255,255,0.01)",
      color: "rgba(0,0,0,0)",
      textAlign: "center",
      fontSize: 1,
      borderRadius: Math.floor(rect.h / 2),
      borderWidth: 0
    }
  });
  profileAuthButtonMode = mode;
  profileAuthButton.onTap(res => {
    saveProfileAuthPrompted();
    app.ui.profileAuthGuide = false;
    const info = res && res.userInfo;
    if (info && (info.nickName || info.avatarUrl)) {
      app.ui.profileDraft = {
        nickName: info.nickName || app.ui.authUser?.nickName || "",
        avatarUrl: info.avatarUrl || app.ui.authUser?.avatarUrl || ""
      };
      // 微信授权资料保留在 users.profile/userInfo；游戏内展示资料另存 customProfile。
      ensureCloudAuth()
        .then(authed => authed && pvpClient.saveWechatProfile ? pvpClient.saveWechatProfile(info) : null)
        .catch(err => console.warn("[profile] save wechat profile failed", err && err.message ? err.message : err));
      saveProfileDraft();
      destroyProfileAuthButton();
      render();
      return;
    }
    destroyProfileAuthButton();
    openProfileSheet("未授权微信资料，请填写昵称并上传头像");
  });
  if (typeof profileAuthButton.onError === "function") {
    profileAuthButton.onError(err => {
      console.warn("[profile] auth error", err && err.message ? err.message : err);
      saveProfileAuthPrompted();
      app.ui.profileAuthGuide = false;
      destroyProfileAuthButton();
      openProfileSheet("微信授权不可用，请填写个人信息");
    });
  }
  return true;
}

function drawProfileSheet(ctx, view, actions) {
  ctx.save();
  ctx.fillStyle = "rgba(20,16,10,0.55)";
  ctx.fillRect(0, 0, view.width, view.height);
  ctx.restore();
  const firstOpen = !!app.ui.profileFirstOpen;
  const pw = 300, ph = firstOpen ? 270 : 240;
  const px = (view.width - pw) / 2, py = (view.height - ph) / 2;
  const r = 16;
  fillRoundRect(ctx, px, py, pw, ph, r, "#fff7e8", "#d9c39a");
  text(ctx, "个人资料", px + pw / 2, py + 28, 17, "#4a3826", "center");
  text(ctx, "×", px + pw - 22, py + 23, 24, "#806e57", "center", "middle");
  if (firstOpen) {
    wrapText(ctx, "设置你的昵称和头像，用于联机对战展示身份。", px + 20, py + 48, pw - 40, 11, 2, 11, "#8a7860");
  }

  const draft = app.ui.profileDraft || {};
  const sz = 60;
  const cx = px + pw / 2;
  const cy = py + (firstOpen ? 96 : 76);
  const avatarUrl = draft.avatarPreviewUrl || draft.avatarUrl || "";

  fillRoundRect(ctx, cx - sz / 2, cy - sz / 2, sz, sz, sz / 2, "#ede5d5", "#c4b49a");
  const hasImg = drawRemoteImage(ctx, avatarUrl, cx - sz / 2, cy - sz / 2, sz, sz, { radius: sz / 2 });
  if (!hasImg) text(ctx, "+", cx, cy + 2, 28, "#b0a488", "center", "middle");
  if (profileAvatarUploading) {
    fillRoundRect(ctx, cx - sz / 2, cy - sz / 2, sz, sz, sz / 2, "rgba(32,25,18,0.48)");
    text(ctx, "上传中", cx, cy + 1, 11, "#fff7e8", "center", "middle");
  }
  if (app.ui.profileTip) text(ctx, app.ui.profileTip, cx, cy + sz / 2 + 14, 10, profileAvatarUploading ? "#8f5c25" : "#8a7860", "center");
  const nameY = cy + sz / 2 + 36;
  const nameLabel = draft.nickName || (app.ui.profileEditingName ? "输入中…" : "未设置昵称");
  const editSize = 20;
  const nameW = Math.min(120, Math.max(28, ctx.measureText(nameLabel).width));
  const nameX = cx - 4;
  const editX = nameX + nameW / 2 + 8;
  const editY = nameY - editSize / 2 - 1;
  text(ctx, nameLabel, nameX, nameY, 14, "#4a3826", "center");
  fillRoundRect(ctx, editX, editY, editSize, editSize, editSize / 2, "#f6ecd9", "#d2b98c");
  ctx.save();
  ctx.translate(editX + editSize / 2, editY + editSize / 2);
  ctx.rotate(Math.PI / 4);
  fillRoundRect(ctx, -2, -7, 4, 11, 1.8, "#806343");
  fillRoundRect(ctx, -2, -7, 4, 2.2, 1, "#b89561");
  ctx.beginPath();
  ctx.moveTo(-2, 4);
  ctx.lineTo(2, 4);
  ctx.lineTo(0, 7.2);
  ctx.closePath();
  ctx.fillStyle = "#806343";
  ctx.fill();
  ctx.restore();

  const bw = pw - 40, bx = px + 20;
  const saveY = cy + sz / 2 + 56;
  const busy = profileAvatarUploading || profileSaving;
  const saveLabel = profileAvatarUploading ? "头像上传中…" : (profileSaving ? "保存中…" : "保存");
  button(ctx, { x: bx, y: saveY, w: bw, h: 40, label: saveLabel, fill: busy ? "#8d9a91" : "#3a6b58", stroke: busy ? "#8d9a91" : "#3a6b58", color: "#fff7e8", size: 15, r: 14, shadow: false, gloss: false });

  // 遮罩位于最底层；资料框本身吞掉点击，只有框外点击会关闭。
  actions.push({ id: "profileMask", x: 0, y: 0, w: view.width, h: view.height });
  actions.push({ id: "profilePanel", x: px, y: py, w: pw, h: ph });
  const avatarHitSize = 84;
  actions.push({ id: "profileAvatar", x: cx - avatarHitSize / 2, y: cy - avatarHitSize / 2, w: avatarHitSize, h: avatarHitSize });
  actions.push({ id: "profileName", x: cx - 100, y: nameY - 16, w: 200, h: 28 });
  actions.push({ id: "profileSave", x: bx, y: saveY, w: bw, h: 40 });
  actions.push({ id: "profileClose", x: px + pw - 40, y: py + 4, w: 36, h: 36 });
}

function setScene(scene) {
  destroyProfileAuthButton();
  stopNameKeyboard();
  app.ui.profileSheetOpen = false;
  if (scene !== "battle") {
    clearAiTimer();
    clearRecentPlayTimer();
    clearRoundTransitionTimer();
  }
  persistActiveSingleMatch();
  app.scene = scene;
  if (scene === "menu") {
    ensureCloudAuth().then(() => {
      if (app.scene === "menu") promptProfileIfNeeded(profileNeedsNickname());
    });
  }
  if (scene === "result") setTimeout(submitRankResultIfNeeded, 0);
  if (scene === "menu" || scene === "history") refreshCloudMatchHistory(scene === "history");
  render();
}

function startMatch(optionsPatch = {}) {
  clearAiTimer();
  if (app._rankDisconnectTimer) { clearTimeout(app._rankDisconnectTimer); app._rankDisconnectTimer = null; }
  app.ui.handScroll = 0;
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
  app.ui.discardPileScroll = 0;
  app.ui.battleLogHistoryOpen = false;
  app.ui.battleLogHistoryScroll = 0;
  app.ui.battleRowScrolls = {};
  app.ui.passLeadHintActive = false;
  app.ui.passLeadHintActiveKey = "";
  app.ui.passLeadHintShownKey = "";
  app.ui.passLeadHintDismissedKey = "";
  app.ui.passLeadHintMatchKey = `single:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  app.ui.dismissedRecentPlaySeq = 0;
  app.ui.dismissedLeaderRevealKey = "";
  app.ui.firstPlayerAnnounced = false;
  app.ui.firstPlayerIndex = null;
  clearRecentPlayTimer();
  const settings = { ...loadSettings(), ...optionsPatch };
  app.match = createMatch(settings);
  if (optionsPatch.ranked) {
    app.match.ranked = true;
    app.match.rankMatchId = optionsPatch.rankMatchId || "";
    app.match.rankStartedAt = Date.now();
    app.match.rankRules = app.rank.rules || null;
    app.match.rankProfileBefore = app.rank.profile || null;
  }
  app.ui.showCardGuide = !loadSave().finishedTutorial;
  app.ui.activeGuide = "";
  app.ui.guideDismissed = false;
  if (!app.ui.showCardGuide) pickActiveGuide();
  openMulliganGuideDetail();
  setScene("battle");
}

function render() {
  app.actions = [];
  if (app.scene === "menu") menuScene.draw(ctx, view, app.actions, app.ui);
  if (app.scene === "menu" && app.ui.profileSheetOpen) drawProfileSheet(ctx, view, app.actions);
  if (app.scene === "pvpSetup") pvpSetupScene.draw(ctx, view, app.actions, app.ui, app.pvp);
  if (app.scene === "pvpRoom") pvpRoomScene.draw(ctx, view, app.actions, app.pvp, app.ui);
  if (app.scene === "rankSetup") rankSetupScene.draw(ctx, view, app.actions, app.ui, app.rank);
  if (app.scene === "rankLeaderboard") rankLeaderboardScene.draw(ctx, view, app.actions, app.ui, app.rank);
  if (app.scene === "matchSetup") matchSetupScene.draw(ctx, view, app.actions, app.ui);
  if (app.scene === "rules") rulesScene.draw(ctx, view, app.actions);
  if (app.scene === "settings") settingsScene.draw(ctx, view, app.actions, app.ui);
  if (app.scene === "deckBuilder") deckBuilderScene.draw(ctx, view, app.actions, app.ui);
  if (app.scene === "history") historyScene.draw(ctx, view, app.actions, app.ui);
  if (app.scene === "adminStats") adminStatsScene.draw(ctx, view, app.actions, app.ui);
  if (app.scene === "battle") {
    app.ui.recentPlayAutoDismissMs = RECENT_PLAY_AUTO_DISMISS_MS;
    app.ui.roundTransitionNoticeMs = ROUND_TRANSITION_NOTICE_MS;
    preparePassLeadHint();
    battleScene.draw(ctx, view, app.actions, app.match, app.ui);
  }
  if (app.scene === "result") resultScene.draw(ctx, view, app.actions, app.match);
  if (app.scene === "battleCards") battleCardsScene.draw(ctx, view, app.actions, app.match, app.ui);
  scheduleRecentPlayAutoDismiss();
  scheduleRoundTransitionAutoContinue();
}

function scheduleAi() {
  if (!app.match || app.match.mode !== "ai" || app.match.over || app.match.roundTransition || app.match.current !== 1 || app.match.mulligan?.active) return;
  clearAiTimer();
  app.aiTimer = setTimeout(() => {
    app.aiTimer = null;
    const acted = aiStep(app.match);
    if (!acted && !app.match.over && !app.match.pending && !app.match.roundTransition && app.match.current === 1) {
      console.error("[battle] 系统行动执行失败，自动放弃当前回合以避免对局卡死。");
      pass(app.match);
    }
    persistActiveSingleMatch();
    if (app.match.over) {
      setScene("result");
      return;
    }
    app.ui.handScroll = clampHandScroll(app.ui.handScroll);
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
const AUTH_SESSION_KEY = "zhangyu.auth.session.v1";
const PROFILE_AUTH_PROMPTED_KEY = "zhangyu.profile.authPrompted.v1";
const LEGACY_PROFILE_HANDLED_KEY = "zhangyu.profile.handled.v1";
const LEGACY_PROFILE_AUTHORIZED_KEY = "zhangyu.profile.authorized.v1";

function cleanupLegacyProfileStorage() {
  const api = typeof wx !== "undefined" ? wx : null;
  if (!api?.removeStorageSync) return;
  try { api.removeStorageSync(LEGACY_PROFILE_HANDLED_KEY); } catch (err) {}
  try { api.removeStorageSync(LEGACY_PROFILE_AUTHORIZED_KEY); } catch (err) {}
}

function loadProfileAuthPrompted() {
  cleanupLegacyProfileStorage();
  const api = typeof wx !== "undefined" ? wx : null;
  if (!api?.getStorageSync) return false;
  try { return !!api.getStorageSync(PROFILE_AUTH_PROMPTED_KEY); } catch (err) { return false; }
}

function saveProfileAuthPrompted() {
  const api = typeof wx !== "undefined" ? wx : null;
  app.ui.profileAuthPrompted = true;
  if (!api?.setStorageSync) return;
  try { api.setStorageSync(PROFILE_AUTH_PROMPTED_KEY, true); } catch (err) {}
}

function debugJson(value) {
  try { return JSON.stringify(value); } catch (err) { return `[无法序列化: ${err.message}]`; }
}

function plainError(err) {
  return {
    name: err?.name || "Error",
    message: err?.message || err?.errMsg || String(err || ""),
    code: err?.code || err?.errCode || "",
    errMsg: err?.errMsg || ""
  };
}

function jsonPlain(value) {
  try {
    return JSON.parse(JSON.stringify(value, (key, item) => {
      if (typeof item === "function") return `[Function ${item.name || "anonymous"}]`;
      if (item === undefined) return "[undefined]";
      if (item instanceof Error) return plainError(item);
      return item;
    }));
  } catch (err) {
    return { stringifyError: err.message || String(err), value: String(value) };
  }
}

function callWxCallback(api, method, options = {}) {
  return new Promise(resolve => {
    if (!api || typeof api[method] !== "function") return resolve({ ok: false, notSupported: true });
    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      resolve(jsonPlain(value));
    };
    try {
      api[method]({
        ...options,
        success: res => finish({ ok: true, result: res }),
        fail: err => finish({ ok: false, error: plainError(err) }),
        complete: res => finish({ ok: false, complete: res })
      });
    } catch (err) {
      finish({ ok: false, exception: plainError(err) });
    }
  });
}

function wxLogin(source) {
  const api = typeof wx !== "undefined" ? wx : null;
  return callWxCallback(api, "login", { timeout: 10000 }).then(result => ({ source, ...result }));
}

function readAuthSession() {
  const api = typeof wx !== "undefined" ? wx : null;
  if (!api?.getStorageSync) return null;
  try {
    const session = api.getStorageSync(AUTH_SESSION_KEY) || null;
    if (!session) return null;
    // 不从本地读取用户头像/昵称，资料只以 users 表返回为准
    const safeSession = { token: session.token, expiresAt: session.expiresAt, tokenStorage: session.tokenStorage || "" };
    if (session.user) api.setStorageSync(AUTH_SESSION_KEY, safeSession);
    return safeSession;
  } catch (err) { return null; }
}

function saveAuthSession(session) {
  const api = typeof wx !== "undefined" ? wx : null;
  if (!api?.setStorageSync) return;
  // 本地只缓存登录态，不缓存头像和昵称
  const safeSession = {
    token: session?.token || "",
    expiresAt: session?.expiresAt || 0,
    tokenStorage: session?.tokenStorage || ""
  };
  try { api.setStorageSync(AUTH_SESSION_KEY, safeSession); } catch (err) {}
}

function applyAuthSession(session) {
  const token = String(session?.token || "");
  app.ui.authToken = token;
  if (session && Object.prototype.hasOwnProperty.call(session, "user")) app.ui.authUser = session.user || null;
  app.ui.authTokenStorage = session?.tokenStorage || "";
  app.ui.authExpiresAt = Number(session?.expiresAt || 0) || 0;
  pvpClient.setAuthToken?.(token);
}

function loadAuthSession() {
  const session = readAuthSession();
  if (session?.token && Number(session.expiresAt || 0) > Date.now()) applyAuthSession(session);
}

async function refreshAdminStatus() {
  if (!app.ui.authToken || !pvpClient.getAdminStatus) {
    app.ui.isAdmin = false;
    return false;
  }
  try {
    const result = await pvpClient.getAdminStatus();
    app.ui.isAdmin = !!result?.isAdmin;
    if (!app.ui.isAdmin) {
      app.ui.adminStats = null;
      app.ui.adminStatsError = "";
    }
    if (app.scene === "menu") render();
    return app.ui.isAdmin;
  } catch (err) {
    app.ui.isAdmin = false;
    return false;
  }
}

let adminStatsLoading = false;
async function refreshAdminStats() {
  if (adminStatsLoading || !app.ui.isAdmin || !pvpClient.getAdminStats) return false;
  adminStatsLoading = true;
  app.ui.adminStatsLoading = true;
  app.ui.adminStatsError = "";
  if (app.scene === "adminStats") render();
  try {
    const result = await pvpClient.getAdminStats();
    app.ui.adminStats = result?.stats || null;
    if (!app.ui.adminStats) throw new Error("统计数据为空");
    return true;
  } catch (err) {
    app.ui.adminStatsError = err?.message || "统计数据加载失败";
    if (err?.code === "FORBIDDEN") app.ui.isAdmin = false;
    return false;
  } finally {
    adminStatsLoading = false;
    app.ui.adminStatsLoading = false;
    if (app.scene === "adminStats") render();
  }
}

let silentLoginRunning = false;
let silentLoginPromise = null;
async function silentLogin() {
  if (app.ui.authToken && app.ui.authExpiresAt > Date.now()) {
    try {
      if (!app.ui.authUser && pvpClient.getCurrentUser) {
        const result = await pvpClient.getCurrentUser();
        app.ui.authUser = result.user || null;
        if (app.scene === "menu") promptProfileIfNeeded(!!result.needsProfile);
      }
      console.log("[user-login] cached token valid, skip wx.login");
      refreshCloudMatchHistory(false);
      refreshAdminStatus();
      return true;
    } catch (err) {
      console.warn("[user-login] cached token invalid, relogin:", err?.message || err);
      applyAuthSession({ token: "", expiresAt: 0, tokenStorage: "" });
      saveAuthSession({ token: "", expiresAt: 0, tokenStorage: "" });
    }
  }
  if (silentLoginRunning) return silentLoginPromise;
  silentLoginRunning = true;
  silentLoginPromise = (async () => {
    try {
      console.log("[user-login] starting silent login...");
      const loginResult = await wxLogin("silent");
      console.log("[user-login] wxLogin result:", JSON.stringify(loginResult));
      const code = loginResult?.result?.code || "";
      if (!code && !loginResult?.ok) throw new Error(loginResult?.error?.message || loginResult?.exception?.message || "wx.login 失败");
      console.log("[user-login] calling pvpClient.login with code:", code.slice(0, 6) + "...");
      const result = await pvpClient.login({ code, trigger: "silent" });
      console.log("[user-login] login success, token:", result?.token ? result.token.slice(0, 8) + "..." : "MISSING");
      const session = {
        token: result.token,
        expiresAt: result.expiresAt,
        user: result.user || null,
        tokenStorage: result.tokenStorage || ""
      };
      applyAuthSession(session);
      saveAuthSession(session);
      refreshCloudMatchHistory(false);
      refreshAdminStatus();
      if (app.scene === "menu") promptProfileIfNeeded(!!result.needsProfile);
      return true;
    } catch (err) {
      console.error("[user-login] silent login FAILED:", err?.message || err, err);
      return false;
    } finally {
      silentLoginRunning = false;
      silentLoginPromise = null;
    }
  })();
  return silentLoginPromise;
}

async function ensureCloudAuth() {
  if (app.ui.authToken && app.ui.authExpiresAt > Date.now()) {
    try {
      if (!app.ui.authUser && pvpClient.getCurrentUser) {
        const result = await pvpClient.getCurrentUser();
        if (result && result.user) {
          app.ui.authUser = result.user;
          saveAuthSession({
            token: app.ui.authToken,
            expiresAt: app.ui.authExpiresAt,
            tokenStorage: app.ui.authTokenStorage || ""
          });
          render();
        }
      }
      refreshCloudMatchHistory(false);
      refreshAdminStatus();
    } catch (err) {
      console.warn("[user-login] refresh user data failed", err?.message || err);
    }
    return true;
  }
  return !!(await silentLogin());
}

function normalizeHistoryRecords(records = []) {
  const seen = new Set();
  const list = [];
  (Array.isArray(records) ? records : []).forEach(item => {
    if (!item || typeof item !== "object") return;
    const key = String(item.recordKey || item.cloudId || "");
    if (key && seen.has(key)) return;
    if (key) seen.add(key);
    list.push({ ...item, syncState: "synced" });
  });
  return list.sort((a, b) => (b.time || 0) - (a.time || 0));
}

function applyCloudHistoryRecords(records) {
  app.ui.cloudHistoryRecords = normalizeHistoryRecords(records);
}

let pendingHistorySyncRunning = false;
async function uploadMatchRecord(record) {
  if (!record?.recordKey) {
    console.error("[history] uploadMatchRecord: missing recordKey", record);
    return false;
  }
  console.log("[history] uploading record:", record.recordKey, "syncState:", record.syncState);
  const authed = await ensureCloudAuth();
  console.log("[history] ensureCloudAuth:", authed, "token:", app.ui.authToken ? app.ui.authToken.slice(0, 8) + "..." : "NONE");
  if (!authed) {
    console.error("[history] upload skipped: not authed");
    return false;
  }
  try {
    const result = await pvpClient.recordMatchHistory(record);
    console.log("[history] upload success:", JSON.stringify(result));
    removeLocalMatchRecord(record.recordKey);
    if (result?.record) applyCloudHistoryRecords([result.record].concat(app.ui.cloudHistoryRecords || []));
    if (app.scene === "menu" || app.scene === "history") refreshCloudMatchHistory(true);
    return true;
  } catch (err) {
    console.error("[history] upload FAILED:", err?.message || err, err);
    return false;
  }
}

async function syncPendingMatchHistory() {
  if (pendingHistorySyncRunning) return false;
  if (!(await ensureCloudAuth())) return false;
  pendingHistorySyncRunning = true;
  try {
    const localRecords = localMatchRecords();
    for (const record of localRecords) await uploadMatchRecord(record);
    return true;
  } finally {
    pendingHistorySyncRunning = false;
  }
}

const HISTORY_PAGE_SIZE = 20;

let cloudHistoryLoading = false;
let cloudHistoryLoadedAt = 0;
async function refreshCloudMatchHistory(force = false) {
  if (cloudHistoryLoading) return false;
  if (!force && Date.now() - cloudHistoryLoadedAt < 15000) return false;
  cloudHistoryLoading = true;
  app.ui.cloudHistoryLoading = true;
  app.ui.cloudHistoryError = "";
  if (app.scene === "history") render();
  try {
    if (!(await ensureCloudAuth())) throw new Error("云端登录失败");
    await syncPendingMatchHistory();
    const result = await pvpClient.listMatchHistory(HISTORY_PAGE_SIZE, 0);
    const history = normalizeHistoryRecords(result.history || []);
    app.ui.cloudHistoryRecords = history;
    app.ui.cloudHistorySkip = history.length;
    app.ui.cloudHistoryHasMore = !!result.hasMore;
    if (result.total != null) app.ui.cloudHistoryTotal = result.total;
    if (result.wins != null) app.ui.cloudHistoryWins = result.wins;
    if (result.losses != null) app.ui.cloudHistoryLosses = result.losses;
    if (result.draws != null) app.ui.cloudHistoryDraws = result.draws;
    if (result.winRate != null) app.ui.cloudHistoryWinRate = result.winRate;
    app.ui.cloudHistoryLoaded = true;
    cloudHistoryLoadedAt = Date.now();
    if (app.scene === "menu" || app.scene === "history") render();
    maybeLoadMoreHistory();
    return true;
  } catch (err) {
    app.ui.cloudHistoryError = err?.message || "云端战绩加载失败";
    console.warn("[history] load cloud failed", err?.message || err);
    if (app.scene === "menu" || app.scene === "history") render();
    return false;
  } finally {
    cloudHistoryLoading = false;
    app.ui.cloudHistoryLoading = false;
    if (app.scene === "history") render();
  }
}

async function loadMoreCloudMatchHistory() {
  if (!app.ui.cloudHistoryLoaded || !app.ui.cloudHistoryHasMore || app.ui.cloudHistoryLoadingMore) return false;
  app.ui.cloudHistoryLoadingMore = true;
  try {
    const result = await pvpClient.listMatchHistory(HISTORY_PAGE_SIZE, app.ui.cloudHistorySkip || app.ui.cloudHistoryRecords.length);
    const more = normalizeHistoryRecords(result.history || []);
    if (more.length) {
      app.ui.cloudHistoryRecords = app.ui.cloudHistoryRecords.concat(more);
      app.ui.cloudHistorySkip = app.ui.cloudHistoryRecords.length;
    }
    app.ui.cloudHistoryHasMore = !!result.hasMore;
    if (app.scene === "history") render();
    return true;
  } catch (err) {
    console.warn("[history] load more failed", err?.message || err);
    return false;
  } finally {
    app.ui.cloudHistoryLoadingMore = false;
    if (app.scene === "history") render();
  }
}

function maybeLoadMoreHistory() {
  if (!app.ui.cloudHistoryHasMore || app.ui.cloudHistoryLoadingMore) return;
  const bounds = historyScrollBounds();
  const maxScroll = bounds.maxScroll || 0;
  const scroll = app.ui.historyScroll || 0;
  if (maxScroll <= 0) {
    loadMoreCloudMatchHistory();
    return;
  }
  if (scroll >= maxScroll - 240) loadMoreCloudMatchHistory();
}

setRecordMatchCloudHook(record => uploadMatchRecord(record));

function clipboardErrorTip(error) {
  const message = String(error?.message || error?.errMsg || error || "");
  if (/privacy agreement|api scope|privacy/i.test(message)) return "复制失败：需在用户隐私保护指引声明剪贴板能力";
  return message ? `复制失败：${message}` : "复制失败，请重试";
}

async function copyPvpRoomId() {
  const roomId = app.pvp.roomId || "";
  if (!roomId) return toast("暂无房间号");
  const result = pvpClient.copyRoomIdResult ? await pvpClient.copyRoomIdResult(roomId) : { ok: pvpClient.copyRoomId(roomId) };
  if (result.ok) return toast("房间号已复制");
  return toast(clipboardErrorTip(result.error));
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
    title: roomId ? `章鱼牌房间 ${roomId}｜打开后自动加入` : "来盘章鱼牌吧",
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

function loadPvpShareCode(roomId, force = false) {
  const safeRoomId = normalizePvpRoomId(roomId);
  if (!safeRoomId) return;
  app.ui.pvpShareCodeRoomId = safeRoomId;
  app.ui.pvpShareCodeLoading = true;
  app.ui.pvpShareCodeError = "";
  if (force) {
    app.ui.pvpShareCodePath = "";
    app.ui.pvpShareCodeEnvVersion = "";
  }
  render();
  pvpClient.getRoomCode(safeRoomId, force).then(result => {
    if (app.ui.pvpShareCodeRoomId !== safeRoomId) return;
    app.ui.pvpShareCodePath = result.filePath;
    app.ui.pvpShareCodeEnvVersion = result.envVersion;
    app.ui.pvpShareCodeLoading = false;
    app.ui.pvpShareCodeError = "";
    render();
  }).catch(err => {
    if (app.ui.pvpShareCodeRoomId !== safeRoomId) return;
    app.ui.pvpShareCodePath = "";
    app.ui.pvpShareCodeEnvVersion = "";
    app.ui.pvpShareCodeLoading = false;
    app.ui.pvpShareCodeError = err.message || "二维码生成失败";
    render();
  });
}

const ALBUM_SCOPE = "scope.writePhotosAlbum";

function readAlbumAuth(api, callback) {
  if (!api?.getSetting) return callback(undefined);
  api.getSetting({
    success: res => callback(res.authSetting?.[ALBUM_SCOPE]),
    fail: () => callback(undefined)
  });
}

function openAlbumSetting(api, filePath) {
  if (!api?.showModal || !api?.openSetting) return toast("请在设置中允许保存图片到相册");
  api.showModal({
    title: "需要相册权限",
    content: "请在设置中允许保存图片到相册。",
    confirmText: "去设置",
    success: modal => {
      if (!modal.confirm) return;
      api.openSetting({
        success: () => {
          setTimeout(() => {
            readAlbumAuth(api, status => {
              if (status === true) savePvpShareCode(filePath);
              else toast("未开启相册权限");
            });
          }, 300);
        }
      });
    }
  });
}

function albumSaveErrorTip(message) {
  const text = String(message || "");
  if (/112|not declared|privacy agreement|announce your privacy usage|1025|1026/i.test(text)) return "后台未声明相册权限，请检查用户隐私保护指引";
  if (/104|privacy permission is not authorized|privacy/i.test(text)) return "请先同意隐私保护指引";
  if (/system permission|system.*denied/i.test(text)) return "系统相册权限未开启，请在系统设置中允许微信访问照片";
  return "保存失败，请稍后重试";
}

function doSavePvpShareCode(api, filePath) {
  api.saveImageToPhotosAlbum({
    filePath,
    success: () => toast("分享图已保存到相册"),
    fail: err => {
      const message = String(err?.errMsg || err || "");
      console.warn("[pvp-share] saveImageToPhotosAlbum failed", err);
      readAlbumAuth(api, status => {
        if (status !== true && /auth|authorize|permission|deny/i.test(message) && !/privacy/i.test(message)) return openAlbumSetting(api, filePath);
        return toast(albumSaveErrorTip(message));
      });
    }
  });
}

const POSTER_W = 750;
const POSTER_H = 1200;
const STATIC_CARD_IMAGE_BASE_URL = "https://po-ke-card-d0gg2ewaac3e700c4-1302893388.tcloudbaseapp.com/po-ke-card";
const POSTER_ARTS = {
  "开国群雄": "assets/card-art/开国群雄.webp",
  "纵横权谋": "assets/card-art/纵横权谋.webp",
  "百家争鸣": "assets/card-art/百家争鸣.webp",
  "草莽星火": "assets/card-art/草莽星火.webp",
  "遗策复兴": "assets/card-art/遗策复兴.webp",
  "天下共识": "assets/card-art/天下共识.webp",
  stratagem: "assets/card-art/stratagem.webp",
  situation: "assets/card-art/situation.webp"
};

function posterSeed(roomId) {
  const textValue = String(roomId || "0000");
  return textValue.split("").reduce((sum, ch, index) => sum + ch.charCodeAt(0) * (index + 7), 131);
}

function posterCardHash(card, seed) {
  const textValue = `${card?.id || ""}${card?.name || ""}`;
  let value = seed || 1;
  for (let i = 0; i < textValue.length; i++) value = (value * 33 + textValue.charCodeAt(i)) % 1000003;
  return value;
}

function posterSortedCards(cards, seed) {
  return cards
    .filter(card => card && card.category !== "situation" && card.category !== "stratagem")
    .slice()
    .sort((a, b) => posterCardHash(a, seed) - posterCardHash(b, seed));
}

function posterCardUniqueKey(card) {
  const name = String(card?.name || "").trim();
  return name ? `name:${name}` : `id:${card?.id || ""}`;
}

function posterPickCards(roomId, faction) {
  const seed = posterSeed(roomId);
  const sourceFaction = FACTION_KEYS.includes(faction) ? faction : FACTION_KEYS[seed % FACTION_KEYS.length];
  const primary = posterSortedCards(eligibleCards(sourceFaction), seed);
  const fallback = posterSortedCards(FACTION_KEYS.flatMap(key => eligibleCards(key)), seed + 97);
  const picked = [];
  const seen = Object.create(null);
  primary.concat(fallback).forEach(card => {
    if (picked.length >= 5) return;
    const uniqueKey = posterCardUniqueKey(card);
    if (seen[uniqueKey]) return;
    seen[uniqueKey] = true;
    picked.push(card);
  });
  return picked;
}

function posterCleanImageFileName(fileName) {
  return String(fileName || "")
    .trim()
    .replace(/^特殊卡牌_/, "")
    .replace(/^领袖牌_/, "")
    .replace(/^单位牌_/, "")
    .replace(/^[^_/]+阵营_/, "");
}

function posterNormalizeWebpFileName(fileName) {
  const value = posterCleanImageFileName(fileName).replace(/[：:].*$/, "");
  if (!value || value === ".webp") return "";
  return /\.[^/.]+$/.test(value) ? value.replace(/\.[^/.]+$/, ".webp") : `${value}.webp`;
}

function posterStaticCardImageUrl(fileName) {
  const normalizedFileName = posterNormalizeWebpFileName(fileName);
  return normalizedFileName ? encodeURI(`${STATIC_CARD_IMAGE_BASE_URL}/${normalizedFileName}`) : "";
}

function posterCardImageFileNames(card) {
  return [card?.name]
    .map(posterNormalizeWebpFileName)
    .filter((fileName, index, arr) => fileName && arr.indexOf(fileName) === index);
}

function posterCardImageSources(card) {
  const fileNames = posterCardImageFileNames(card);
  return [...fileNames.map(posterStaticCardImageUrl), POSTER_ARTS[card?.category], POSTER_ARTS[card?.faction], POSTER_ARTS["天下共识"]].filter((src, index, arr) => src && arr.indexOf(src) === index);
}

function posterLoadImage(api, sources) {
  return new Promise(resolve => {
    if (!api?.createImage) return resolve(null);
    const queue = (Array.isArray(sources) ? sources : [sources]).filter(Boolean);
    if (!queue.length) return resolve(null);
    const img = api.createImage();
    let index = 0;
    const loadNext = () => {
      const src = queue[index];
      img.onload = () => resolve(img);
      img.onerror = () => {
        index += 1;
        if (index >= queue.length) resolve(null);
        else loadNext();
      };
      img.src = src;
    };
    loadNext();
  });
}

function posterRoundRect(ctx2, x, y, w, h, r) {
  const radius = Math.max(0, Math.min(r || 0, w / 2, h / 2));
  ctx2.beginPath();
  ctx2.moveTo(x + radius, y);
  ctx2.lineTo(x + w - radius, y);
  ctx2.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx2.lineTo(x + w, y + h - radius);
  ctx2.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx2.lineTo(x + radius, y + h);
  ctx2.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx2.lineTo(x, y + radius);
  ctx2.quadraticCurveTo(x, y, x + radius, y);
  ctx2.closePath();
}

function posterFillRoundRect(ctx2, x, y, w, h, r, fill, stroke) {
  posterRoundRect(ctx2, x, y, w, h, r);
  if (fill) {
    ctx2.fillStyle = fill;
    ctx2.fill();
  }
  if (stroke) {
    ctx2.strokeStyle = stroke;
    ctx2.lineWidth = 2;
    ctx2.stroke();
  }
}

function posterText(ctx2, value, x, y, size, color = "#2f2417", align = "left", weight = "400") {
  ctx2.save();
  ctx2.font = `${weight} ${size}px sans-serif`;
  ctx2.textAlign = align;
  ctx2.textBaseline = "middle";
  ctx2.fillStyle = color;
  ctx2.fillText(String(value || ""), x, y);
  ctx2.restore();
}

function posterWrapText(ctx2, value, x, y, maxW, lineH, maxLines, size, color = "#2f2417", weight = "400") {
  const chars = String(value || "").split("");
  let line = "";
  let lineCount = 0;
  ctx2.save();
  ctx2.font = `${weight} ${size}px sans-serif`;
  ctx2.fillStyle = color;
  ctx2.textBaseline = "top";
  for (let i = 0; i < chars.length; i++) {
    const test = line + chars[i];
    if (ctx2.measureText(test).width > maxW && line) {
      ctx2.fillText(line, x, y + lineCount * lineH);
      line = chars[i];
      lineCount += 1;
      if (lineCount >= maxLines) break;
    } else {
      line = test;
    }
  }
  if (line && lineCount < maxLines) {
    ctx2.fillText(line, x, y + lineCount * lineH);
    lineCount += 1;
  }
  ctx2.restore();
  return Math.max(1, lineCount);
}

function posterDrawImageContain(ctx2, img, x, y, w, h, radius = 0) {
  if (!img) return false;
  const iw = img.width || w;
  const ih = img.height || h;
  const scale = Math.min(w / iw, h / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  ctx2.save();
  if (radius) {
    posterRoundRect(ctx2, x, y, w, h, radius);
    ctx2.clip();
  }
  ctx2.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  ctx2.restore();
  return true;
}

function posterDrawImageCover(ctx2, img, x, y, w, h, radius = 0) {
  if (!img) return false;
  const iw = img.width || w;
  const ih = img.height || h;
  const scale = Math.max(w / iw, h / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  ctx2.save();
  if (radius) {
    posterRoundRect(ctx2, x, y, w, h, radius);
    ctx2.clip();
  }
  ctx2.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  ctx2.restore();
  return true;
}

function posterDrawBattleBackdrop(ctx2) {
  posterFillRoundRect(ctx2, 40, 74, POSTER_W - 80, 810, 26, "rgba(255,250,240,0.58)", "rgba(216,189,131,0.58)");
  ["文脉", "朝堂", "疆场", "疆场", "朝堂", "文脉"].forEach((label, index) => {
    const y = 112 + index * 112;
    posterFillRoundRect(ctx2, 60, y, POSTER_W - 120, 78, 16, "rgba(255,255,255,0.46)", "rgba(216,189,131,0.58)");
    posterText(ctx2, label, 86, y + 39, 26, "rgba(119,92,52,0.42)");
    posterText(ctx2, "0分", POSTER_W - 104, y + 39, 24, "rgba(143,60,31,0.45)", "center", "600");
  });
}

function posterDrawCard(ctx2, card, img, x, y, w, h, angle) {
  ctx2.save();
  ctx2.translate(x + w / 2, y + h / 2);
  ctx2.rotate(angle);
  ctx2.shadowColor = "rgba(64, 42, 19, 0.25)";
  ctx2.shadowBlur = 14;
  ctx2.shadowOffsetY = 8;
  posterFillRoundRect(ctx2, -w / 2, -h / 2, w, h, 16, "#fffaf0", "#d8bd83");
  ctx2.shadowBlur = 0;
  const artX = -w / 2 + 12;
  const artY = -h / 2 + 12;
  const artW = w - 24;
  const artH = h - 46;
  if (!posterDrawImageCover(ctx2, img, artX, artY, artW, artH, 12)) {
    const fill = ctx2.createLinearGradient ? ctx2.createLinearGradient(artX, artY, artX + artW, artY + artH) : null;
    if (fill) {
      fill.addColorStop(0, "#f6d27a");
      fill.addColorStop(1, "#d8bd83");
    }
    posterFillRoundRect(ctx2, artX, artY, artW, artH, 12, fill || "#f0ddaa", "#d8bd83");
    posterText(ctx2, displayName(card).slice(0, 1), 0, -6, Math.min(52, h * 0.28), "rgba(95,71,39,0.72)", "center", "800");
  }
  posterFillRoundRect(ctx2, -w / 2 + 10, h / 2 - 34, w - 20, 24, 10, "rgba(255,250,240,0.92)");
  posterText(ctx2, displayName(card).slice(0, 5), 0, h / 2 - 22, 18, "#5f4727", "center", "600");
  ctx2.restore();
}

function posterCardLayout(roomId) {
  const layouts = [
    [
      { x: 86, y: 470, w: 138, h: 176, a: -0.22 },
      { x: 194, y: 430, w: 138, h: 176, a: -0.08 },
      { x: 306, y: 414, w: 138, h: 176, a: 0.04 },
      { x: 420, y: 430, w: 138, h: 176, a: 0.15 },
      { x: 528, y: 472, w: 138, h: 176, a: 0.24 }
    ],
    [
      { x: 78, y: 426, w: 132, h: 170, a: -0.08 },
      { x: 218, y: 426, w: 132, h: 170, a: 0.04 },
      { x: 358, y: 426, w: 132, h: 170, a: -0.04 },
      { x: 498, y: 426, w: 132, h: 170, a: 0.08 },
      { x: 288, y: 508, w: 132, h: 170, a: 0 }
    ],
    [
      { x: 102, y: 500, w: 132, h: 166, a: -0.18 },
      { x: 210, y: 432, w: 136, h: 174, a: 0.1 },
      { x: 328, y: 486, w: 132, h: 166, a: -0.04 },
      { x: 442, y: 420, w: 136, h: 174, a: 0.18 },
      { x: 540, y: 506, w: 128, h: 162, a: -0.14 }
    ]
  ];
  return layouts[posterSeed(roomId) % layouts.length];
}

function posterDrawCardFan(ctx2, cards, images, roomId) {
  const specs = posterCardLayout(roomId);
  cards.forEach((card, index) => {
    const spec = specs[index] || specs[0];
    posterDrawCard(ctx2, card, images[index], spec.x, spec.y, spec.w, spec.h, spec.a);
  });
}

function posterSkillLine(rules, faction) {
  if (rules.factionMode === "fixed") return `阵营技能：${factionPerkSummary(faction) || "按指定阵营结算。"}`;
  if (rules.factionMode === "random") return "阵营技能：开局随机阵营后，按随机结果生效。";
  return "阵营技能：双方按各自选择的阵营生效。";
}

function generatePvpSharePoster(api, qrPath) {
  return new Promise((resolve, reject) => {
    if (!api?.createCanvas) return reject(new Error("当前环境不支持生成分享图"));
    const posterCanvas = api.createCanvas();
    posterCanvas.width = POSTER_W;
    posterCanvas.height = POSTER_H;
    const ctx2 = posterCanvas.getContext("2d");
    const roomId = normalizePvpRoomId(app.pvp.roomId || app.pvp.room?.roomId || app.pvp.room?._id) || "0000";
    const rules = normalizePvpRules(app.pvp.room?.rules || currentRulesFromSettings());
    const faction = rules.factionMode === "random" ? FACTION_KEYS[posterSeed(roomId) % FACTION_KEYS.length] : (rules.factionMode === "fixed" ? rules.faction : resolvePvpFaction(loadSettings()));
    const cards = posterPickCards(roomId, faction);
    const imageSources = [qrPath].concat(cards.map(posterCardImageSources));
    Promise.all(imageSources.map(src => posterLoadImage(api, src))).then(images => {
      const qr = images[0];
      const cardImages = images.slice(1);
      const bg = ctx2.createLinearGradient ? ctx2.createLinearGradient(0, 0, 0, POSTER_H) : null;
      if (bg) {
        bg.addColorStop(0, "#fbf2df");
        bg.addColorStop(0.55, "#fffaf0");
        bg.addColorStop(1, "#ead8ad");
      }
      ctx2.fillStyle = bg || "#f7f1e5";
      ctx2.fillRect(0, 0, POSTER_W, POSTER_H);
      posterDrawBattleBackdrop(ctx2);
      posterText(ctx2, "来盘章鱼牌吧", POSTER_W / 2, 174, 54, "#3a1d12", "center", "800");
      posterText(ctx2, `房间 ${roomId} · 扫码直接加入`, POSTER_W / 2, 228, 25, "#775c34", "center", "600");
      posterDrawCardFan(ctx2, cards, cardImages, roomId);

      posterFillRoundRect(ctx2, 58, 680, POSTER_W - 116, 260, 22, "rgba(255,250,240,0.92)", "rgba(216,189,131,0.82)");
      const lines = [
        { text: "最多三小局两胜，未打出的手牌跨小局保留。", weight: "700", color: "#3a1d12" },
        { text: `规则：${pvpRuleSummary(rules)}` },
        { text: posterSkillLine(rules, faction) },
        { text: "时局压制对应线；号令、同盟、振势会提升战力。" },
        { text: "好友扫码进入房间，确认出战后即可开局。" }
      ];
      let lineY = 718;
      lines.forEach(item => {
        const used = posterWrapText(ctx2, item.text, 94, lineY, POSTER_W - 188, 30, 2, 23, item.color || "#5f4727", item.weight || "500");
        lineY += used * 30 + 10;
      });

      posterFillRoundRect(ctx2, 254, 924, 242, 242, 22, "#ffffff", "#d8bd83");
      if (!posterDrawImageContain(ctx2, qr, 273, 943, 204, 204, 0)) return reject(new Error("二维码图片加载失败"));
      posterText(ctx2, "快来加入战斗，一起打出高分！", POSTER_W / 2, 1180, 22, "#3a1d12", "center", "700");
      if (!posterCanvas.toTempFilePath) return reject(new Error("当前环境不支持导出分享图"));
      posterCanvas.toTempFilePath({
        x: 0,
        y: 0,
        width: POSTER_W,
        height: POSTER_H,
        destWidth: POSTER_W,
        destHeight: POSTER_H,
        fileType: "png",
        success: res => resolve(res.tempFilePath),
        fail: err => reject(new Error(err?.errMsg || "分享图导出失败"))
      });
    }).catch(reject);
  });
}

function savePvpSharePoster(api, qrPath) {
  if (api.showLoading) api.showLoading({ title: "生成分享图...", mask: true });
  generatePvpSharePoster(api, qrPath).then(posterPath => {
    if (api.hideLoading) api.hideLoading();
    doSavePvpShareCode(api, posterPath);
  }).catch(err => {
    if (api.hideLoading) api.hideLoading();
    console.warn("[pvp-share] generate poster failed", err);
    toast("分享图生成失败，改存二维码");
    doSavePvpShareCode(api, qrPath);
  });
}

function savePvpShareCode(filePathOverride = "") {
  const filePath = filePathOverride || app.ui.pvpShareCodePath;
  const api = typeof wx !== "undefined" ? wx : null;
  if (!filePath) return toast(app.ui.pvpShareCodeLoading ? "二维码正在生成" : "请先重新生成二维码");
  if (!api?.saveImageToPhotosAlbum) return toast("当前环境不支持保存到相册");
  const afterPrivacy = () => readAlbumAuth(api, status => {
    if (status === true) return savePvpSharePoster(api, filePath);
    if (status === false) return openAlbumSetting(api, filePath);
    if (!api.authorize) return savePvpSharePoster(api, filePath);
    api.authorize({
      scope: ALBUM_SCOPE,
      success: () => savePvpSharePoster(api, filePath),
      fail: () => openAlbumSetting(api, filePath)
    });
  });
  if (!api.requirePrivacyAuthorize) return afterPrivacy();
  api.requirePrivacyAuthorize({
    success: afterPrivacy,
    fail: err => {
      console.warn("[pvp-share] requirePrivacyAuthorize failed", err);
      toast(albumSaveErrorTip(err?.errMsg || err || "privacy permission is not authorized"));
    }
  });
}

function guideShare(reason = "点击房间分享按钮") {
  const roomId = normalizePvpRoomId(app.pvp.roomId);
  console.log(`[share-debug] ${reason}:`, debugJson({
    scene: app.scene,
    rawRoomId: app.pvp.roomId,
    pendingRoomId: app.pvp.pendingRoomId,
    roomObject: app.pvp.room ? { roomId: app.pvp.room.roomId, _id: app.pvp.room._id, status: app.pvp.room.status } : null,
    resolvedRoomId: currentShareRoomId()
  }));
  if (!roomId) return toast("房间创建后才能分享邀请");
  const api = typeof wx !== "undefined" ? wx : null;
  registerShareHandler(api, `${reason}-${roomId}`);
  showGameShareMenu(api, `${reason}-${roomId}`);
  const preview = getSharePayload();
  console.warn("[share-debug] 分享前即时 payload 预览:", debugJson(preview));
  if (app.ui.pvpShareCodeRoomId !== roomId) app.ui.pvpShareCodePath = "";
  app.ui.pvpShareGuideOpen = true;
  loadPvpShareCode(roomId);
}

function normalizePvpRoomId(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length === 4 ? digits : "";
}

function resolvePvpFaction(settings) {
  const value = settings.pvpFaction || settings.humanFaction || FACTION_KEYS[0];
  if (value === "random") return value;
  return FACTION_KEYS.includes(value) ? value : FACTION_KEYS[0];
}

function resolvePvpLeaderId(settings, faction) {
  if (faction === "random") return "random";
  const leaders = leadersFor(faction);
  const stored = settings.pvpLeaderIds?.[faction] ?? settings.humanLeaderIds?.[faction];
  if (stored === "random") return "random";
  return (leaders.find(card => card.id === stored) || leaders[0])?.id || "";
}

function normalizePvpRules(rules = {}) {
  const fallback = FACTION_KEYS[0];
  const faction = FACTION_KEYS.includes(rules.faction) ? rules.faction : fallback;
  return {
    factionMode: ["fixed", "random"].includes(rules.factionMode) ? rules.factionMode : "any",
    faction,
    deckMode: rules.deckMode === "autoOnly" ? "autoOnly" : "any",
    version: Number(rules.version || 0) || 0
  };
}

function pvpRuleSummary(rules = {}) {
  const safe = normalizePvpRules(rules);
  const faction = safe.factionMode === "random" ? "随机阵容" : (safe.factionMode === "fixed" ? `指定${FACTION_LABELS[safe.faction] || safe.faction}` : "不限");
  const deck = safe.factionMode === "random" ? "随机卡牌" : (safe.deckMode === "autoOnly" ? "仅自动卡牌" : "不限，可自定义/自动");
  return `阵营${faction}；卡牌${deck}`;
}

function pvpRuleFactionSkillLines(rules) {
  const safe = normalizePvpRules(rules);
  return safe.factionMode === "fixed"
    ? [`阵营技能：${factionPerkSummary(safe.faction)}`]
    : [];
}

function queuePvpRuleChanged(previousRules, nextRules, roomId) {
  const nextVersion = Number(nextRules?.version || 0) || 0;
  if (app.pvp.rulePromptOpen) {
    const pending = app.pvp.pendingRulePrompt;
    app.pvp.pendingRulePrompt = {
      roomId,
      previousRules: pending?.previousRules || previousRules,
      nextRules,
      version: nextVersion
    };
    return;
  }
  promptPvpRuleChanged(previousRules, nextRules, roomId);
}

function promptPvpRuleChanged(previousRules, nextRules, roomId) {
  const shownVersion = Number(nextRules?.version || 0) || 0;
  const content = [
    `修改前：${pvpRuleSummary(previousRules)}`,
    `修改后：${pvpRuleSummary(nextRules)}`,
    ...pvpRuleFactionSkillLines(nextRules),
    "",
    "房主修改规则后，需要再点一下准备。"
  ].join("\n");
  const api = typeof wx !== "undefined" ? wx : null;
  if (api && api.showModal) {
    app.pvp.rulePromptOpen = true;
    api.showModal({
      title: "规则已修改",
      content,
      confirmText: "直接准备",
      confirmColor: "#2f6f57",
      cancelText: "稍后",
      success: res => finishPvpRulePrompt(res.confirm, roomId, shownVersion),
      fail: () => finishPvpRulePrompt(false, roomId, shownVersion)
    });
    return;
  }
  toast("房主修改了规则，请重新准备");
}

function finishPvpRulePrompt(confirmed, roomId, shownVersion) {
  app.pvp.rulePromptOpen = false;
  const pending = app.pvp.pendingRulePrompt;
  app.pvp.pendingRulePrompt = null;
  const currentRoomId = normalizePvpRoomId(app.pvp.roomId);
  const currentVersion = Number(app.pvp.room?.rules?.version || 0) || 0;
  if (pending && pending.roomId === currentRoomId && pending.version > shownVersion) {
    return promptPvpRuleChanged(pending.previousRules, pending.nextRules, pending.roomId);
  }
  if (confirmed && roomId === currentRoomId && currentVersion === shownVersion && app.pvp.room?.status === "waiting") {
    return setPvpReady(true);
  }
  render();
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
  const faction = rules.factionMode === "random" ? "random" : (rules.factionMode === "fixed" ? rules.faction : resolvePvpFaction(settings));
  const randomLineup = faction === "random";
  const selectedIds = randomLineup ? [] : getActiveCustomDeckIds(settings, faction);
  const status = randomLineup ? { valid: false, ids: [] } : deckStatus(selectedIds, faction);
  const useCustomDeck = !randomLineup && rules.deckMode !== "autoOnly" && settings.pvpDeckMode === "custom" && status.valid;
  return {
    name: String(app.ui.authUser?.nickName || "").slice(0, 12),
    avatarUrl: String(app.ui.authUser?.avatarUrl || ""),
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

function pvpPlayerReady(room, index) {
  if (!Number.isInteger(index) || index < 0) return false;
  const players = room?.players || [];
  const readyPlayers = Array.isArray(room?.readyPlayers) ? room.readyPlayers : [];
  return !!(players[index]?.ready || readyPlayers[index]);
}

function pvpReadyDebug(room) {
  const players = Array.isArray(room?.players) ? room.players : [];
  return {
    status: room?.status || "",
    turnSeq: Number(room?.turnSeq || 0),
    readySeq: Number(room?.readySeq || 0),
    playerCount: players.length,
    playerReady: players.map(player => !!player?.ready),
    readyPlayers: Array.isArray(room?.readyPlayers) ? room.readyPlayers.map(Boolean) : []
  };
}

function cardLabel(card) {
  return card ? (card.name || "主将") : "主将";
}

function applyRecordRoundMorale(morale, winner) {
  const next = [morale[0], morale[1]];
  if (winner == null) {
    next[0] -= 1;
    next[1] -= 1;
  } else {
    next[winner === 0 ? 1 : 0] -= 1;
  }
  return next.map(value => Math.max(0, value));
}

function moraleAfterRecordRounds(roundResults) {
  return (Array.isArray(roundResults) ? roundResults : []).reduce((morale, result) => {
    if (Array.isArray(result?.morale) && result.morale.length >= 2) return [result.morale[0] || 0, result.morale[1] || 0];
    return applyRecordRoundMorale(morale, result?.winner == null ? null : result.winner);
  }, [2, 2]);
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
  const disconnected = match.endReason === "disconnect";
  let resultText;
  if (winner == null) resultText = "平局";
  else if (winner === 0) resultText = disconnected ? "对方掉线" : (surrendered ? "对方认输" : "你赢了");
  else resultText = disconnected ? "你已掉线" : (surrendered ? "你已认输" : "你输了");

  const roundResults = (match.roundResults || []).map(r => ({
    round: r.round,
    scores: [r.scores?.[meIdx] || 0, r.scores?.[oppIdx] || 0],
    winner: r.winner == null ? null : (r.winner === meIdx ? 0 : 1),
    morale: Array.isArray(r.morale) ? [r.morale[meIdx] || 0, r.morale[oppIdx] || 0] : undefined,
    moraleLoss: Array.isArray(r.moraleLoss) ? [r.moraleLoss[meIdx] || 0, r.moraleLoss[oppIdx] || 0] : undefined
  }));
  const morale = Array.isArray(match.morale) ? [match.morale[meIdx] || 0, match.morale[oppIdx] || 0] : moraleAfterRecordRounds(roundResults);

  recordMatch({
    time: Date.now(),
    recordKey: `online:${app.pvp.roomId || "room"}:${match.matchId || recordKey}:${meIdx}`,
    resultText,
    winner,
    rounds: [me.roundsWon || 0, opp.roundsWon || 0],
    morale,
    scores: [match.finalScores?.[meIdx] || 0, match.finalScores?.[oppIdx] || 0],
    roundResults,
    humanFaction: me.factionName || me.faction,
    aiFaction: opp.factionName || opp.faction,
    humanLeader: cardLabel(me.leader),
    aiLeader: cardLabel(opp.leader),
    humanLeaderId: me.leader?.id || "",
    aiLeaderId: opp.leader?.id || "",
    humanDeckMode: me.deckMode || "random",
    aiDeckMode: opp.deckMode || "random",
    difficulty: "pvp",
    mode: "online",
    endReason: match.endReason || "normal",
    roomId: app.pvp.roomId || "",
    matchId: match.matchId || ""
  });
  app.pvp.recordedResultKey = recordKey;
}

function applyRoomUpdate(room, playerIndex) {
  if (!room) return;
  const roomId = normalizePvpRoomId(room.roomId || room._id || app.pvp.roomId);
  console.log("[pvp-ready-debug] applyRoomUpdate", {
    roomId,
    incomingPlayerIndex: playerIndex,
    currentPlayerIndex: app.pvp.playerIndex,
    scene: app.scene,
    submitting: app.pvp.submitting,
    room: pvpReadyDebug(room)
  });
  const previousRoom = app.pvp.room;
  const previousPendingType = app.match?.pending?.type || "";
  const nextPlayerIndex = Number.isInteger(playerIndex) ? playerIndex : app.pvp.playerIndex;
  if (room.status === "dissolved" && nextPlayerIndex === 1) {
    if (app.pvp.dissolvedNoticeRoomId === roomId) return;
    return showPvpRoomDissolvedNotice(roomId);
  }
  const nextVersion = Number(room.rules?.version || 0) || 0;
  const seenVersion = Number(app.pvp.lastSeenRuleVersion || previousRoom?.rules?.version || 0) || 0;
  const currentTurnSeq = Number(previousRoom?.turnSeq || 0) || 0;
  const nextTurnSeq = Number(room.turnSeq || 0) || 0;
  if (previousRoom && nextTurnSeq && currentTurnSeq && nextTurnSeq < currentTurnSeq) {
    console.warn("[pvp-ready-debug] ignore stale room", { incoming: pvpReadyDebug(room), current: pvpReadyDebug(previousRoom) });
    return;
  }
  if (previousRoom && nextVersion < Number(previousRoom.rules?.version || 0)) {
    console.warn("[pvp-ready-debug] preserve newer local rules but accept room state", {
      nextVersion,
      currentVersion: previousRoom.rules?.version,
      incoming: pvpReadyDebug(room),
      current: pvpReadyDebug(previousRoom)
    });
    room = { ...room, rules: previousRoom.rules };
  }
  const shouldPromptRuleChange = nextPlayerIndex === 1
    && !!previousRoom
    && nextVersion > seenVersion
    && room.status === "waiting";
  app.pvp.room = room;
  if (roomId) app.pvp.roomId = roomId;
  if (Number.isInteger(playerIndex)) app.pvp.playerIndex = playerIndex;
  if (room.match) {
    app.match = decorateOnlineMatch(room.match);
    if (["revive", "leaderDiscard", "recall"].includes(previousPendingType) && app.match.pending?.type !== previousPendingType) closeBattleCardDetail();
  } else if (room.status !== "finished") app.match = null;
  app.pvp.loading = false;
  app.pvp.submitting = false;
  app.pvp.error = "";
  app.pvp.lastSeenRuleVersion = Math.max(seenVersion, nextVersion);
  if (shouldPromptRuleChange) {
    app.pvp.readyRuleVersion = 0;
    console.log("[pvp] 玩家2检测到规则变更，加入提示队列:", seenVersion, "->", nextVersion);
    queuePvpRuleChanged(previousRoom?.rules || {}, room.rules, roomId);
  }
  const prevSelfReady = previousRoom ? pvpPlayerReady(previousRoom, nextPlayerIndex) : false;
  const nextSelfReady = pvpPlayerReady(room, nextPlayerIndex);
  const friendIndex = nextPlayerIndex === 0 ? 1 : 0;
  const prevFriendReady = previousRoom ? pvpPlayerReady(previousRoom, friendIndex) : false;
  const nextFriendReady = pvpPlayerReady(room, friendIndex);
  if (previousRoom && (!prevSelfReady && nextSelfReady || !prevFriendReady && nextFriendReady)) playPvpReadyAnim();
  if (nextPlayerIndex === 0 && previousRoom && !prevFriendReady && nextFriendReady) {
    toast("好友已准备");
  }
  const bothReady = room.status === "waiting" && (room.players?.length || 0) >= 2 && pvpPlayerReady(room, 0) && pvpPlayerReady(room, 1);
  const readySeq = Number(room.readySeq || 0) || 0;
  if (nextPlayerIndex === 0 && bothReady && app.pvp.autoStartReadySeq !== readySeq) {
    app.pvp.autoStartReadySeq = readySeq;
    setTimeout(() => {
      if (app.pvp.roomId === roomId && app.pvp.room?.status === "waiting" && pvpPlayerReady(app.pvp.room, 0) && pvpPlayerReady(app.pvp.room, 1)) startPvpSelection();
    }, 520);
  }
  const prevCount = previousRoom ? (previousRoom.players?.length || 0) : 0;
  const nextCount = room.players?.length || 0;
  if (nextPlayerIndex === 0 && previousRoom) {
    if (prevCount < 2 && nextCount >= 2) {
      toast("好友已进入房间");
    } else if (prevCount >= 2 && nextCount < 2) {
      toast("好友已离开房间");
    }
  }
  if (room.status === "playing" && app.match) {
    if (app.scene !== "battle") app.ui.mulliganGuideShown = false;
    app.ui.handScroll = clampHandScroll(app.ui.handScroll);
    syncPendingPvpMulliganSwap();
    openMulliganGuideDetail();
    if (app.scene !== "battle") return setScene("battle");
  }
  if (room.status === "finished" && app.match) {
    recordOnlineMatch(app.match);
    if (!["result", "battleCards", "pvpRoom"].includes(app.scene)) return setScene("result");
  }
  if (room.status === "selecting") {
    app.ui.matchSetupDropdown = "";
    app.ui.matchSetupCardDetailId = "";
    if (app.scene !== "pvpSetup") return setScene("pvpSetup");
  }
  if (room.status === "waiting" && ["battle", "result", "battleCards", "pvpSetup"].includes(app.scene)) {
    app.ui.battleCardsDetailId = "";
    app.ui.battleCardsHelpOpen = false;
    app.ui.detailSwipe = null;
    return setScene("pvpRoom");
  }
  render();
}

function watchPvpRoom(roomId) {
  try {
    pvpClient.watchRoom(roomId, room => applyRoomUpdate(room), err => {
      console.warn("[pvp] watch failed", err);
      app.pvp.error = "房间同步断开，正在尝试恢复";
      app.pvp.loading = false;
      render();
    });
  } catch (err) {
    app.pvp.error = err.message || "无法监听房间";
    app.pvp.loading = false;
    render();
  }
}

function resumePvpRoomSync(source = "foreground") {
  const roomId = normalizePvpRoomId(app.pvp.roomId);
  if (!roomId || !app.pvp.room || app.pvp.room.status === "dissolved") return false;
  console.log("[pvp] 恢复房间同步, source=", source, "roomId=", roomId);
  watchPvpRoom(roomId);
  pvpClient.fetchRoom(roomId).then(result => {
    if (normalizePvpRoomId(app.pvp.roomId) !== roomId) return;
    applyRoomUpdate(result.room, result.playerIndex);
  }).catch(err => {
    console.warn("[pvp] 恢复房间同步失败", source, err);
  });
  return true;
}

function resetPvpState() {
  pvpClient.closeRoomWatch();
  app.ui.pvpShareGuideOpen = false;
  app.ui.pvpShareCodeLoading = false;
  app.ui.pvpShareCodePath = "";
  app.ui.pvpShareCodeError = "";
  app.ui.pvpShareCodeRoomId = "";
  app.ui.pvpShareCodeEnvVersion = "";
  app.ui.pvpReadyAnimUntil = 0;
  clearPendingPvpMulliganSwap();
  clearRoundTransitionTimer();
  app.pvp = { roomId: "", pendingRoomId: "", room: null, playerIndex: 0, loading: false, submitting: false, error: "", recordedResultKey: "", lastSeenRuleVersion: 0, readyRuleVersion: 0, autoStartReadySeq: 0, rulePromptOpen: false, pendingRulePrompt: null, dissolvedNoticeRoomId: "" };
}

function showPvpRoomDissolvedNotice(roomId) {
  resetPvpState();
  app.pvp.playerIndex = 1;
  app.pvp.dissolvedNoticeRoomId = roomId;
  app.match = null;
  setScene("menu");
  const api = typeof wx !== "undefined" ? wx : null;
  if (api && api.showModal) {
    api.showModal({
      title: "房间已解散",
      content: "房主已离开并解散房间。",
      showCancel: false,
      confirmText: "知道了"
    });
    return;
  }
  toast("房主已解散房间");
}

function dissolvePvpRoom() {
  const roomId = app.pvp.roomId;
  if (!roomId || app.pvp.submitting) return;
  app.pvp.submitting = true;
  render();
  pvpClient.leaveRoom(roomId).then(() => {
    resetPvpState();
    app.match = null;
    setScene("menu");
  }).catch(err => {
    app.pvp.submitting = false;
    toast(err.message || "解散房间失败");
    render();
  });
}

function leavePvpRoom() {
  const roomId = app.pvp.roomId;
  if (!roomId || app.pvp.submitting) return;
  app.pvp.submitting = true;
  render();
  pvpClient.leaveRoom(roomId).then(() => {
    resetPvpState();
    app.match = null;
    setScene("menu");
  }).catch(err => {
    app.pvp.submitting = false;
    toast(err.message || "离开房间失败");
    render();
  });
}

function confirmDissolvePvpRoom() {
  if (app.pvp.playerIndex !== 0 || !app.pvp.roomId) {
    return leavePvpRoom();
  }
  const api = typeof wx !== "undefined" ? wx : null;
  if (api && api.showModal) {
    api.showModal({
      title: "确认解散房间",
      content: "解散后将通知玩家二，双方都无法继续使用该房间。",
      confirmText: "解散",
      confirmColor: "#8f3c1f",
      cancelText: "取消",
      success: res => {
        if (res.confirm) dissolvePvpRoom();
        else render();
      },
      fail: () => render()
    });
    return;
  }
  if (typeof globalThis !== "undefined" && typeof globalThis.confirm === "function" && !globalThis.confirm("确定解散房间吗？")) return render();
  return dissolvePvpRoom();
}

function confirmExitPvpRoom() {
  if (!app.pvp.roomId) {
    resetPvpState();
    app.match = null;
    return setScene("menu");
  }
  const isHost = app.pvp.playerIndex === 0;
  const api = typeof wx !== "undefined" ? wx : null;
  const content = isHost ? "确认退出房间吗？房主退出后房间将解散。" : "确认退出房间吗？退出后将回到首页。";
  if (api && api.showModal) {
    api.showModal({
      title: "退出房间？",
      content,
      confirmText: "退出",
      confirmColor: "#8f3c1f",
      cancelText: "取消",
      success: res => {
        if (!res.confirm) return render();
        return isHost ? dissolvePvpRoom() : leavePvpRoom();
      },
      fail: () => render()
    });
    return;
  }
  if (typeof globalThis !== "undefined" && typeof globalThis.confirm === "function" && !globalThis.confirm(content)) return render();
  return isHost ? dissolvePvpRoom() : leavePvpRoom();
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
    guideShare("创建房间后自动展示邀请页");
  }).catch(err => {
    console.warn("[pvp] create failed", err);
    app.pvp.loading = false;
    app.pvp.error = err.message || "开房间失败";
    render();
  });
}

async function joinPvpRoom(roomId) {
  const safeRoomId = normalizePvpRoomId(roomId);
  if (!safeRoomId) return toast("请输入4位数字房间号");
  console.log("[pvp] joinPvpRoom 开始, roomId=", safeRoomId);
  resetPvpState();
  app.pvp.roomId = safeRoomId;
  app.pvp.loading = true;
  setScene("pvpRoom");
  // 新用户通过分享二维码/分享卡片进入时，静默登录可能尚未完成，先确保拿到登录态再请求加入房间，
  // 否则云函数 authOpenid 会因没有 token 而拒绝，表现为“账号不存在”。
  try {
    await ensureCloudAuth();
  } catch (loginErr) {
    console.warn("[pvp] joinPvpRoom 静默登录失败", loginErr);
  }
  if (!pvpClient.getAuthToken()) {
    app.pvp.loading = false;
    app.pvp.error = "登录失败，请稍后重试";
    render();
    return;
  }
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
  if (api.onHide) {
    api.onHide(() => {
      if (!activeSingleMatch()) return;
      persistActiveSingleMatch();
      clearAiTimer();
      clearRecentPlayTimer();
      clearRoundTransitionTimer();
    });
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
      resumeSuspendedSingleMatch();
      resumePvpRoomSync("wx.onShow");
      retryPendingRankResult("wx.onShow");
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
  app._rankDisconnectTimer = null;
  if (api.onNetworkStatusChange) {
    api.onNetworkStatusChange(status => {
      if (status?.isConnected) {
        resumePvpRoomSync("network-reconnected");
        retryPendingRankResult("network-reconnected");
        if (app._rankDisconnectTimer) { clearTimeout(app._rankDisconnectTimer); app._rankDisconnectTimer = null; }
        return;
      }
      // 排位/AI 单机对局断网：延迟 8 秒后自动判负（给短暂抖动恢复机会）
      const match = app.match;
      if (!match || match.over || match.mode !== "ai") return;
      if (app._rankDisconnectTimer) return;
      app._rankDisconnectTimer = setTimeout(() => {
        app._rankDisconnectTimer = null;
        if (!app.match || app.match.over || app.match.mode !== "ai") return;
        performDisconnectLoss("network-disconnect");
      }, 8000);
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
  if (!isMyPvpTurn() && battleAction.type !== "surrender" && battleAction.type !== "disconnectLoss" && battleAction.type !== "continueRound") {
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

function handScrollBounds() {
  if (!app.match) return { maxScroll: 0 };
  const current = app.match.players[handOwnerIndex(app.match)] || app.match.players[0];
  return battleScene.handScrollBounds(view, current?.hand?.length || 0);
}

function clampHandScroll(value) {
  const { maxScroll } = handScrollBounds();
  return Math.max(0, Math.min(value || 0, maxScroll));
}

function scrollHandBy(deltaX) {
  if (app.scene !== "battle" || !app.match || app.match.over || app.ui.battleCardDetailId || app.ui.battleCardDetailUid || app.ui.battleLogHistoryOpen || app.ui.discardPileOwner != null) return false;
  const before = app.ui.handScroll || 0;
  const next = clampHandScroll(before - deltaX);
  if (Math.abs(next - before) > 0.1) {
    app.ui.handScroll = next;
    render();
  }
  return true;
}

function afterHumanAction() {
  if (!app.match) return;
  persistActiveSingleMatch();
  app.ui.handScroll = clampHandScroll(app.ui.handScroll);
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

function performDisconnectLoss(source = "disconnect") {
  if (!app.match || app.match.over) return false;
  if (isOnlineMatch()) {
    if (app.pvp.submitting) return true;
    submitPvpAction({ type: "disconnectLoss", source });
    return true;
  }
  surrender(app.match, 0, "disconnect");
  setScene("result");
  return true;
}

function performPass() {
  if (!app.match || app.match.over) return render();
  if (isOnlineMatch()) return submitPvpAction({ type: "pass" });
  pass(app.match);
  return afterHumanAction();
}

function resolveLeaderDiscardChoice(cardUid) {
  if (!app.match?.pending || app.match.pending.type !== "leaderDiscard" || !cardUid) return render();
  if (isOnlineMatch()) return submitPvpAction({ type: "resolvePending", choice: { uid: cardUid } });
  resolvePending(app.match, { uid: cardUid });
  if (!app.match.pending) closeBattleCardDetail();
  return afterHumanAction();
}

function resolveRecallChoice(cardUid) {
  if (!app.match?.pending || app.match.pending.type !== "recall" || !cardUid) return render();
  closeBattleCardDetail();
  if (isOnlineMatch()) return submitPvpAction({ type: "resolvePending", choice: { uid: cardUid } });
  resolvePending(app.match, { uid: cardUid });
  return afterHumanAction();
}

function resolveLeaderSituationChoice(cardUid) {
  if (!app.match?.pending || app.match.pending.type !== "leaderSituation" || !cardUid) return render();
  closeBattleCardDetail();
  if (isOnlineMatch()) return submitPvpAction({ type: "resolvePending", choice: { uid: cardUid } });
  resolvePending(app.match, { uid: cardUid });
  return afterHumanAction();
}

function cancelBattlePendingChoice() {
  if (!app.match?.pending) return render();
  closeBattleCardDetail();
  if (isOnlineMatch()) return submitPvpAction({ type: "cancelPending" });
  cancelPending(app.match);
  return afterHumanAction();
}

function confirmLeaderDiscardChoice(cardUid) {
  const pending = app.match?.pending;
  if (!pending || pending.type !== "leaderDiscard" || !cardUid) return render();
  const selectedUids = Array.isArray(pending.selectedUids) ? pending.selectedUids : [];
  const card = (pending.candidates || []).find(item => item.uid === cardUid);
  if (!card) return render();
  if (selectedUids.includes(cardUid) || selectedUids.length < 1) return resolveLeaderDiscardChoice(cardUid);
  const first = (pending.candidates || []).find(item => item.uid === selectedUids[0]);
  const firstName = first?.name || "已选手牌";
  const secondName = card.name || "当前手牌";
  const api = typeof wx !== "undefined" ? wx : null;
  const content = `将弃置「${firstName}」和「${secondName}」，并抽 1 张牌。`;
  if (api && api.showModal) {
    api.showModal({
      title: "确认弃置？",
      content,
      confirmText: "弃置",
      confirmColor: "#8f3c1f",
      cancelText: "继续选择",
      success: res => {
        if (res.confirm) resolveLeaderDiscardChoice(cardUid);
        else render();
      },
      fail: () => render()
    });
    return;
  }
  if (typeof globalThis !== "undefined" && typeof globalThis.confirm === "function" && !globalThis.confirm(content)) return render();
  return resolveLeaderDiscardChoice(cardUid);
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

function hasOpponentPassed(match = app.match) {
  if (!match || !Array.isArray(match.players)) return false;
  const local = localMatchPlayerIndex(match);
  const opponent = local === 0 ? 1 : 0;
  return !!match.players[opponent]?.passed;
}

function confirmPass() {
  const opponentPassed = hasOpponentPassed();
  if (opponentPassed) return performPass();
  const title = "确认放弃";
  const content = "放弃后本小局将不再出牌，确定要放弃吗？";
  const confirmText = "放弃";
  const api = typeof wx !== "undefined" ? wx : null;
  if (api && api.showModal) {
    api.showModal({
      title,
      content,
      confirmText,
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
  if (typeof globalThis !== "undefined" && typeof globalThis.confirm === "function" && !globalThis.confirm(content)) return render();
  return performPass();
}

function handleMenu(action) {
  if (app.ui.profileSheetOpen) {
    if (action.id === "profileName") startNameKeyboard();
    else if (action.id === "profileAvatar") chooseAvatarImage();
    else if (action.id === "profileSave") saveProfileDraft().then(saved => { if (saved) closeProfileSheet(); });
    else if (action.id === "profileClose" || action.id === "profileMask") closeProfileSheet();
    // profilePanel 仅拦截资料框内的空白点击，不关闭弹窗。
    return;
  }
  if (action.id === "openProfile") {
    if (shouldUseAvatarAuth()) {
      app.ui.profileAuthGuide = true;
      createProfileAuthButton("avatar");
      render();
      return;
    }
    openProfileSheet();
    return;
  }
  if (action.id === "start") {
    app.ui.deckReturnScene = "matchSetup";
    app.ui.matchSetupDropdown = "";
    return setScene("matchSetup");
  }
  if (action.id === "settings") {
    app.ui.settingDropdown = "";
    app.ui.settingDeckPage = 0;
    app.ui.settingDeckScroll = 0;
    app.ui.deckReturnScene = "";
    return setScene("settings");
  }
  if (action.id === "history") {
    app.ui.historyScroll = 0;
    app.ui.historyLeaderDetailId = "";
    setScene("history");
  }
  if (action.id === "adminStats") {
    if (!app.ui.isAdmin) return;
    app.ui.adminStatsScroll = 0;
    setScene("adminStats");
    refreshAdminStats();
    return;
  }
  if (action.id === "pvp") return enterPvpSetup();
  if (action.id === "rank") return openRankSetup();
  if (action.id === "rankLeaderboard") return openRankLeaderboard();
  if (action.id === "rules") setScene("rules");
}

function applyMatchSetupOption(action) {
  const settings = loadSettings();
  const field = action.field;
  const value = action.value;
  app.ui.matchSetupDropdown = "";
  if (field === "humanFaction") {
    app.ui.deckPage = 0;
    saveSettings(value === "random"
      ? { humanLineupMode: "random", customDeckEnabled: false }
      : { humanLineupMode: "selected", humanFaction: value });
  }
  if (field === "humanLeader" && settings.humanLineupMode !== "random") {
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
  const faction = settings.humanLineupMode === "random" ? "random" : settings.humanFaction;
  const randomLineup = faction === "random";
  const selectedIds = randomLineup ? [] : getActiveCustomDeckIds(settings, faction);
  const status = randomLineup ? { valid: false, ids: [] } : deckStatus(selectedIds, faction);
  const useCustomDeck = !randomLineup && status.valid && settings.customDeckEnabled;
  if (action.id === "togglePreparedDeckMode") {
    if (!status.valid) return render();
    saveSettings({ customDeckEnabled: !useCustomDeck });
    return render();
  }
  if (action.id === "editCustomDeck") {
    // 跳转到「我的牌组」界面编辑卡牌，复用现有界面而不是单独再开一个编辑器。
    const faction = settings.humanLineupMode === "random" ? "random" : settings.humanFaction;
    if (faction !== "random") saveSettings({ humanFaction: faction }); // 锚定到当前准备界面所选阵营
    app.ui.deckReturnScene = "matchSetup";
    app.ui.settingDeckPage = 0;
    app.ui.settingDeckScroll = 0;
    app.ui.settingCardTab = "all";
    return setScene("settings");
  }
  if (action.id === "startPrepared") {
    const startOptions = useCustomDeck
      ? { mode: "ai", humanFaction: faction, customDeckEnabled: true, humanCustomDeckIds: status.ids }
      : { mode: "ai", humanFaction: faction, customDeckEnabled: false };
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
    else if (value === "random") saveSettings({ pvpRuleFactionMode: "random" });
    else saveSettings({ pvpRuleFactionMode: "fixed", pvpRuleFaction: value });
  }
  render();
}

function handlePvpSetup(action) {
  const selectingOnline = app.pvp.room?.status === "selecting";
  const rules = normalizePvpRules(app.pvp.room?.rules || {});
  const randomLineupLocked = selectingOnline && rules.factionMode === "random";
  const factionLocked = selectingOnline && rules.factionMode !== "any";
  const deckLocked = selectingOnline && (rules.deckMode === "autoOnly" || randomLineupLocked);
  const selectFields = randomLineupLocked ? [] : (factionLocked ? ["pvpLeader"] : ["pvpFaction", "pvpLeader"]);
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
    if (currentRulesFromSettings().factionMode === "random") return render();
    saveSettings({ pvpRuleDeckMode: action.value === "autoOnly" ? "autoOnly" : "any" });
    return render();
  }
  const settings = loadSettings();
  const faction = randomLineupLocked ? "random" : (factionLocked ? rules.faction : (settings.pvpFaction || settings.humanFaction));
  if (action.id === "pvpDeckMode") {
    if (deckLocked && action.value === "custom") return toast("本房间仅允许自动卡牌");
    if (action.value === "custom" && faction === "random") return toast("随机阵容将使用随机卡牌");
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
    settingsScene.invalidateDeckViewCache();
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
  const isStrategyCard = card.category === "stratagem" || card.category === "situation";
  if (status.total >= 40 || (isStrategyCard && status.strategies >= 10)) return currentIds;
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
    settingsScene.invalidateDeckViewCache();
    return render();
  }
  if (action.id === "settingCardTab") {
    app.ui.settingCardTab = action.value || "all";
    app.ui.settingDeckPage = 0;
    app.ui.settingDeckScroll = 0;
    settingsScene.invalidateDeckViewCache();
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
    const backScene = app.ui.deckReturnScene || "menu";
    app.ui.deckReturnScene = "";
    return setScene(backScene);
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
  settingsScene.invalidateDeckViewCache();
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

function currentRankPlayerSetup() {
  const settings = loadSettings();
  const rules = app.rank.rules || {};
  if (rules.forcePlayerRandom) return { faction: "random", leaderId: "random", deckMode: "auto", customDeckIds: [] };
  const faction = settings.humanLineupMode === "random" ? "random" : settings.humanFaction;
  if (faction === "random") return { faction: "random", leaderId: "random", deckMode: "auto", customDeckIds: [] };
  const ids = getActiveCustomDeckIds(settings, faction);
  const status = deckStatus(ids, faction);
  const deckMode = settings.customDeckEnabled && status.valid ? "custom" : "auto";
  const leader = leadersFor(faction).find(card => card.id === settings.humanLeaderIds?.[faction]) || leadersFor(faction)[0] || null;
  return { faction, leaderId: leader?.id || "", deckMode, customDeckIds: deckMode === "custom" ? status.ids : [] };
}

function resetRankTransient() {
  app.rank.currentMatch = null;
  app.rank.resultDelta = null;
  app.rank.submitting = false;
}

function loadRankProfile(force = false) {
  if (app.rank.loading && !force) return;
  app.rank.loading = true;
  app.rank.error = "";
  render();
  pvpClient.getRankProfile().then(result => {
    app.rank.profile = result.profile || null;
    app.rank.rules = result.rules || null;
    app.rank.nextTier = result.nextTier || null;
    app.rank.loading = false;
    render();
  }).catch(err => {
    app.rank.loading = false;
    app.rank.error = err.message || "排位资料加载失败";
    render();
  });
}

function openRankSetup() {
  resetRankTransient();
  app.ui.rankSetupDropdown = "";
  setScene("rankSetup");
  loadRankProfile(true);
}

function loadRankLeaderboard(force = false) {
  if (app.rank.leaderboardLoading && !force) return;
  app.rank.leaderboardLoading = true;
  app.rank.loading = true;
  app.rank.error = "";
  render();
  pvpClient.getRankLeaderboard(50).then(result => {
    app.rank.leaderboard = Array.isArray(result.leaderboard) ? result.leaderboard : [];
    app.rank.leaderboardLoading = false;
    app.rank.loading = false;
    app.ui.rankLeaderboardScroll = 0;
    render();
  }).catch(err => {
    app.rank.leaderboardLoading = false;
    app.rank.loading = false;
    const message = err.message || "排行榜加载失败";
    if (err.code === "UNKNOWN_ACTION" || err.code === "UNKNOWN_REQUEST" || message.includes("未知请求")) {
      app.rank.leaderboard = [];
      app.rank.error = "";
    } else {
      app.rank.error = message;
    }
    render();
  });
}

function openRankLeaderboard() {
  setScene("rankLeaderboard");
  loadRankLeaderboard(true);
}

function startRankMatch() {
  if (app.rank.starting) return;
  app.rank.starting = true;
  app.rank.error = "";
  render();
  pvpClient.startRankMatch(currentRankPlayerSetup()).then(result => {
    app.rank.starting = false;
    app.rank.currentMatch = result;
    app.rank.profile = result.profile || app.rank.profile;
    app.rank.rules = result.rules || app.rank.rules;
    const options = {
      ...(result.matchOptions || {}),
      ranked: true,
      rankMatchId: result.rankMatchId,
      suppressRecording: true
    };
    startMatch(options);
    if (app.match) app.match.suppressRecording = true;
  }).catch(err => {
    app.rank.starting = false;
    app.rank.error = err.message || "创建排位失败";
    toast(app.rank.error);
    render();
  });
}

function rankFinalSummary(match) {
  const p0 = match.players?.[0] || {};
  const p1 = match.players?.[1] || {};
  return {
    winner: match.winner,
    result: rankCore.resultFromWinner(match.winner),
    roundsWon: p0.roundsWon || 0,
    roundsLost: p1.roundsWon || 0,
    rounds: [p0.roundsWon || 0, p1.roundsWon || 0],
    scores: match.finalScores || [0, 0],
    morale: Array.isArray(match.morale) ? match.morale : [],
    roundResults: Array.isArray(match.roundResults) ? match.roundResults.slice() : [],
    humanFaction: p0.factionName || "",
    aiFaction: p1.factionName || "",
    humanLeader: p0.leader ? displayName(p0.leader) : "",
    aiLeader: p1.leader ? displayName(p1.leader) : "",
    humanLeaderId: p0.leader?.id || "",
    aiLeaderId: p1.leader?.id || "",
    humanDeckMode: p0.deckMode || "auto",
    aiDeckMode: p1.deckMode || "auto",
    endReason: match.endReason || "normal"
  };
}

function submitRankResultIfNeeded() {
  const match = app.match;
  if (!match || !match.ranked || !match.rankMatchId || !match.over || match.rankSubmitted || match.rankSubmitting) return;
  match.rankSubmitting = true;
  app.rank.submitting = true;
  render();
  const durationMs = Math.max(0, Date.now() - (match.rankStartedAt || Date.now()));
  const pending = savePendingRankResult(match, durationMs);
  const summary = pending?.finalStateSummary || rankFinalSummary(match);
  pvpClient.finishRankMatch(match.rankMatchId, summary, "wechat-game", durationMs).then(result => {
    clearPendingRankResult(match.rankMatchId);
    match.rankSubmitted = true;
    match.rankSubmitting = false;
    match.rankDelta = result.delta || null;
    match.rankSubmitError = "";
    app.rank.submitting = false;
    app.rank.profile = result.profile || app.rank.profile;
    app.rank.resultDelta = result.delta || null;
    refreshCloudMatchHistory(false);
    render();
  }).catch(err => {
    match.rankSubmitting = false;
    if (err?.code === "RANK_ALREADY_FINISHED") {
      clearPendingRankResult(match.rankMatchId);
      match.rankSubmitted = true;
      match.rankSubmitError = "";
      app.rank.submitting = false;
      loadRankProfile(true);
      render();
      return;
    }
    match.rankSubmitError = err.message || "排位结算失败";
    app.rank.submitting = false;
    render();
  });
}

function openRankPublicProfile(userId) {
  if (!userId) return;
  app.rank.publicProfileOpen = true;
  app.rank.publicProfileLoading = true;
  app.rank.publicProfileError = "";
  app.rank.publicProfile = null;
  render();
  pvpClient.getRankPublicProfile(userId).then(result => {
    app.rank.publicProfileLoading = false;
    app.rank.publicProfile = result.profile || null;
    render();
  }).catch(err => {
    app.rank.publicProfileLoading = false;
    app.rank.publicProfileError = err.message || "资料加载失败";
    render();
  });
}

function rankTierRangeText(tier) {
  if (!Number.isFinite(tier.maxPower)) return `${tier.minPower}+`;
  return `${tier.minPower}-${tier.maxPower}`;
}

function showRankRuleHelp() {
  app.rank.helpPanel = app.rank.helpPanel === "rule" ? null : "rule";
  render();
}

function showRankPrestigeHelp() {
  app.rank.helpPanel = app.rank.helpPanel === "prestige" ? null : "prestige";
  render();
}

function handleRankSetup(action) {
  if (action.id === "rankBack") return setScene("menu");
  if (action.id === "rankRefreshProfile") return loadRankProfile(true);
  if (action.id === "rankStart") return startRankMatch();
  if (action.id === "rankRuleHelp") return showRankRuleHelp();
  if (action.id === "rankPrestigeHelp") return showRankPrestigeHelp();
  if (action.id === "closeRankHelpPanel") { app.rank.helpPanel = null; return render(); }
  if (action.id === "closeRankSetupDropdown" || action.id === "closeMatchSetupDropdown") {
    app.ui.rankSetupDropdown = "";
    return render();
  }
  const rules = app.rank.rules || {};
  if (rules.forcePlayerRandom) return render(); // 帝王段位不可修改阵容
  if (action.id === "selectMatchSetupOption") {
    if (action.field === "humanFaction" || action.field === "humanLeader") {
      applyMatchSetupOption(action);
      app.ui.rankSetupDropdown = "";
      return render();
    }
    return render();
  }
  if (action.id === "humanFaction" || action.id === "humanLeader") {
    app.ui.rankSetupDropdown = app.ui.rankSetupDropdown === action.id ? "" : action.id;
    return render();
  }
  if (action.id === "toggleRankDeckMode") {
    const settings = loadSettings();
    const faction = settings.humanLineupMode === "random" ? "random" : settings.humanFaction;
    const selectedIds = faction === "random" ? [] : getActiveCustomDeckIds(settings, faction);
    const status = faction === "random" ? { valid: false } : deckStatus(selectedIds, faction);
    const useCustomDeck = faction !== "random" && status.valid && settings.customDeckEnabled;
    if (!status.valid) return render();
    saveSettings({ customDeckEnabled: !useCustomDeck });
    return render();
  }
  render();
}

function handleRankLeaderboard(action) {
  if (action.id === "rankPublicProfilePanel") return render();
  if (action.id === "rankClosePublicProfile") {
    app.rank.publicProfileOpen = false;
    return render();
  }
  if (app.rank.publicProfileOpen) return render();
  if (action.id === "rankBoardBack") return setScene("menu");
  if (action.id === "rankBoardRefresh") return loadRankLeaderboard(true);
  if (action.id === "rankPublicProfile") return openRankPublicProfile(action.userId);
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
  console.log("[pvp-ready-debug] setPvpReady click", {
    roomId: app.pvp.roomId,
    playerIndex: app.pvp.playerIndex,
    ready: !!ready,
    submitting: app.pvp.submitting,
    room: pvpReadyDebug(app.pvp.room)
  });
  if (!app.pvp.roomId || app.pvp.submitting) {
    console.warn("[pvp-ready-debug] setPvpReady skipped", { roomId: app.pvp.roomId, submitting: app.pvp.submitting });
    return;
  }
  app.pvp.submitting = true;
  pvpClient.setReadyConfirmed(app.pvp.roomId, ready).then(result => {
    const readyVersion = Number(result.room?.rules?.version || app.pvp.room?.rules?.version || 0) || 0;
    app.pvp.readyRuleVersion = ready ? readyVersion : 0;
    console.log("[pvp-ready-debug] setPvpReady success", { playerIndex: result.playerIndex, readyVersion, room: pvpReadyDebug(result.room) });
    applyRoomUpdate(result.room, result.playerIndex);
  }).catch(err => {
    console.error("[pvp-ready-debug] setPvpReady failed", { code: err?.code || "", message: err?.message || String(err), room: pvpReadyDebug(app.pvp.room) });
    app.pvp.submitting = false;
    toast(err.message || "准备失败");
    render();
  });
}

function startPvpSelection() {
  console.log("[pvp-ready-debug] startPvpSelection click", {
    roomId: app.pvp.roomId,
    playerIndex: app.pvp.playerIndex,
    submitting: app.pvp.submitting,
    opponentReady: pvpPlayerReady(app.pvp.room, 1),
    room: pvpReadyDebug(app.pvp.room)
  });
  if (!app.pvp.roomId || app.pvp.submitting) {
    console.warn("[pvp-ready-debug] startPvpSelection skipped", { roomId: app.pvp.roomId, submitting: app.pvp.submitting });
    return;
  }
  if (app.pvp.playerIndex === 0 && app.pvp.room?.status === "waiting" && !pvpPlayerReady(app.pvp.room, 1)) {
    app.pvp.submitting = true;
    return pvpClient.fetchRoom(app.pvp.roomId).then(result => {
      applyRoomUpdate(result.room, result.playerIndex);
      if (pvpPlayerReady(app.pvp.room, 1)) return startPvpSelection();
      toast("等待好友准备");
      render();
    }).catch(err => {
      app.pvp.submitting = false;
      toast(err.message || "刷新房间失败");
      render();
    });
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
    if (result.room?.status === "finished" && app.scene !== "pvpRoom") return setScene("pvpRoom");
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
  if (action.id === "savePvpShareCode") return savePvpShareCode();
  if (action.id === "retryPvpShareCode") return loadPvpShareCode(app.pvp.roomId, true);
  if (action.id === "pvpShareGuidePanel" || action.id === "pvpShareGuideTip") return render();
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
      : (action.value === "random"
        ? { factionMode: "random", faction: current.faction }
        : { factionMode: "fixed", faction: action.value }));
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
    copyPvpRoomId();
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
  if (action.id === "pvpReady") return setPvpReady(!pvpPlayerReady(app.pvp.room, app.pvp.playerIndex));
  if (action.id === "pvpStartSelection") return startPvpSelection();
  if (action.id === "pvpGoSetup") return setScene("pvpSetup");
  if (action.id === "pvpReturnRoom") return returnPvpRoom();
  if (action.id === "pvpBack") {
    if (app.pvp.roomId && app.pvp.room) return confirmExitPvpRoom();
    resetPvpState();
    app.match = null;
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
  if (action.id === "dismissGuide") {
    app.ui.guideDismissed = true;
    return render();
  }
  if (action.id === "dismissPassLeadHint") {
    dismissPassLeadHintForCurrent();
    return render();
  }
  if (!app.match) return;
  if (action.id === "dismissLeaderReveal") {
    const local = app.match.mode === "online" && Number.isInteger(app.match.localPlayerIndex) ? app.match.localPlayerIndex : 0;
    app.ui.dismissedLeaderRevealKey = action.revealKey || `${app.match.matchId || "local"}:${app.match.leaderReveals?.[local]?.seq || 0}`;
    return render();
  }
  if (action.id === "leaderRevealPanel") return render();
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
  if (action.id === "dismissFirstPlayer") {
    app.ui.firstPlayerAnnounced = true;
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
    if (["leaderDiscard", "recall", "leaderSituation"].includes(app.match.pending?.type) && (app.ui.battleCardDetailId || app.ui.battleCardDetailUid)) {
      return cancelBattlePendingChoice();
    }
    app.ui.battleCardDetailId = "";
    app.ui.battleCardDetailUid = "";
    app.ui.mulliganHelpOpen = false;
    if (app.ui.pendingPvpMulliganSwap) app.ui.pendingPvpMulliganSwap.keepDetail = false;
    return render();
  }
  if (action.id === "mulliganDetailSwap") return handleMulliganSwap(action.cardUid, true);
  if (action.id === "targetChoice" && app.match.pending?.type === "leaderDiscard") return confirmLeaderDiscardChoice(action.cardUid);
  if (action.id === "targetChoice" && app.match.pending?.type === "recall") return resolveRecallChoice(action.cardUid);
  if (action.id === "targetChoice" && app.match.pending?.type === "leaderSituation") return resolveLeaderSituationChoice(action.cardUid);
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
    app.ui.discardPileScroll = 0;
    return render();
  }
  if (action.id === "closeDiscardPile") {
    app.ui.discardPileOwner = null;
    app.ui.discardPileScroll = 0;
    return render();
  }
  if (action.id === "switchDiscardPile") {
    app.ui.discardPileOwner = Number.isInteger(action.playerIndex) ? action.playerIndex : 0;
    app.ui.discardPileScroll = 0;
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
      if (action.playerIndex === app.match.current && !app.match.mulligan?.active) { markLeaderSkillPart("usedSkill"); return submitPvpAction({ type: "leader" }); }
      return render();
    }
    if (app.match.mulligan?.active) {
      if (action.id === "card") return handleMulliganSwap(action.cardUid);
      if (action.id === "mulliganDone") return app.ui.pendingPvpMulliganSwap ? render() : submitPvpAction({ type: "mulliganDone" });
      return render();
    }
    if (action.id === "leader") return submitPvpAction({ type: "leader" });
    if (action.id === "card") return submitPvpAction({ type: "card", cardUid: action.cardUid });
    if (action.id === "pass") { dismissPassLeadHintForCurrent(); return confirmPass(); }
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
        markLeaderSkillPart("usedSkill");
        return afterHumanAction();
      }
      return render();
    }
  if (app.match.mulligan?.active) {
    if (action.id === "card") return handleMulliganSwap(action.cardUid);
    if (action.id === "mulliganDone") { finishMulligan(app.match); app.ui.mulliganHandOrder = null; return afterHumanAction(); }
    return;
  }
  if (action.id === "leader") { useLeader(app.match, app.match.current); markLeaderSkillPart("usedSkill"); }
  if (action.id === "card") playCard(app.match, action.cardUid);
  if (action.id === "pass") { dismissPassLeadHintForCurrent(); return confirmPass(); }
  afterHumanAction();
}

function handleBattleCards(action) {
  if (action.id === "detailPanel" || action.id === "battleCardsHelpPanel") return;
  if (action.id === "closeDetail") {
    app.ui.battleCardsDetailId = "";
    app.ui.detailSwipe = null;
    return render();
  }
  if (app.ui.battleCardsDetailId) return render();
  if (action.id === "battleCardsHelp") {
    app.ui.battleCardsHelpOpen = true;
    return render();
  }
  if (action.id === "closeBattleCardsHelp") {
    app.ui.battleCardsHelpOpen = false;
    return render();
  }
  if (app.ui.battleCardsHelpOpen) return render();
  if (action.id === "switchBattleCardsSide") {
    app.ui.battleCardsSide = action.side === "enemy" ? "enemy" : "mine";
    app.ui.detailSwipe = null;
    return render();
  }
  if (action.id === "backBattleCards") return setScene("result");
  render();
}

function handleAdminStats(action) {
  if (action.id === "backAdminStats") return setScene("menu");
}

function handleAction(action) {
  vibrate();
  if (app.ui.mulliganSwapAnim) return;
  if (app.scene === "menu") return handleMenu(action);
  if (app.scene === "pvpSetup") return handlePvpSetup(action);
  if (app.scene === "pvpRoom") return handlePvpRoom(action);
  if (app.scene === "rankSetup") return handleRankSetup(action);
  if (app.scene === "rankLeaderboard") return handleRankLeaderboard(action);
  if (app.scene === "matchSetup") return handleMatchSetup(action);
  if (app.scene === "rules") return action.id === "back" ? setScene("menu") : null;
  if (app.scene === "settings") return handleSettings(action);
  if (app.scene === "deckBuilder") return handleDeckBuilder(action);
  if (app.scene === "history") return handleHistory(action);
  if (app.scene === "adminStats") return handleAdminStats(action);
  if (app.scene === "battle") return handleBattle(action);
  if (app.scene === "battleCards") return handleBattleCards(action);
  if (app.scene === "result") {
    if (action.id === "viewBattleCards") {
      app.ui.battleCardDetailId = "";
      app.ui.battleCardDetailUid = "";
      app.ui.battleCardsSide = "mine";
      app.ui.battleCardsScrolls = [0, 0];
      app.ui.battleCardsDetailId = "";
      app.ui.battleCardsHelpOpen = false;
      app.ui.detailSwipe = null;
      return setScene("battleCards");
    }
    if (action.id === "pvpContinue") return returnPvpRoom();
    if (action.id === "restart") {
      if (isOnlineMatch()) return returnPvpRoom();
      if (app.match?.ranked) return startRankMatch();
      return startMatch();
    }
    if (action.id === "pvpExitRoom") return confirmExitPvpRoom();
    if (action.id === "home") {
      if (isOnlineMatch()) return confirmExitPvpRoom();
      app.match = null;
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
  let pendingRecruit = "";
  (logs || []).forEach(item => {
    const value = String(item || "");
    if (/^集贤(?:生效：)?(?:(?:从牌库)?额外打出|从牌库打出)/.test(value)) {
      pendingRecruit = value.replace(/^集贤生效：/, "集贤").replace(/。$/, "");
      return;
    }
    if (/打出|使用主将/.test(value)) {
      const textValue = pendingRecruit ? `${value.replace(/。$/, "")}；${pendingRecruit}。` : value;
      entries.push({ text: textValue });
      pendingRecruit = "";
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
  const name = entry.name || "";
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

function adminStatsScrollBounds() {
  return adminStatsScene.scrollBounds(view, app.ui.adminStats);
}

function clampAdminStatsScroll(value) {
  const { maxScroll } = adminStatsScrollBounds();
  return Math.max(0, Math.min(value || 0, maxScroll));
}

function scrollAdminStatsBy(deltaY) {
  if (app.scene !== "adminStats") return false;
  const before = app.ui.adminStatsScroll || 0;
  const next = clampAdminStatsScroll(before - deltaY);
  if (Math.abs(next - before) > 0.5) {
    app.ui.adminStatsScroll = next;
    render();
  }
  return true;
}

function rankLeaderboardScrollBounds() {
  return rankLeaderboardScene.scrollBounds(view, app.rank);
}

function clampRankLeaderboardScroll(value) {
  const { maxScroll } = rankLeaderboardScrollBounds();
  return Math.max(0, Math.min(value || 0, maxScroll));
}

function scrollRankLeaderboardBy(deltaY) {
  if (app.scene !== "rankLeaderboard" || app.rank.publicProfileOpen) return false;
  const before = app.ui.rankLeaderboardScroll || 0;
  const next = clampRankLeaderboardScroll(before - deltaY);
  if (Math.abs(next - before) > 0.5) {
    app.ui.rankLeaderboardScroll = next;
    render();
  }
  return true;
}

let adminStatsScrollMotionId = 0;

function cancelAdminStatsScrollInertia() {
  adminStatsScrollMotionId += 1;
}

function startAdminStatsScrollInertia(initialVelocity) {
  let velocity = Math.max(-2.4, Math.min(2.4, initialVelocity || 0));
  if (app.scene !== "adminStats" || Math.abs(velocity) < 0.04) return;
  const motionId = ++adminStatsScrollMotionId;
  let lastTime = Date.now();
  function step() {
    if (motionId !== adminStatsScrollMotionId || app.scene !== "adminStats") return;
    const now = Date.now();
    const elapsed = Math.min(32, Math.max(1, now - lastTime));
    lastTime = now;
    const before = app.ui.adminStatsScroll || 0;
    const next = clampAdminStatsScroll(before + velocity * elapsed);
    app.ui.adminStatsScroll = next;
    if (Math.abs(next - before) < 0.05) return;
    render();
    velocity *= Math.exp(-0.0048 * elapsed);
    if (Math.abs(velocity) >= 0.025) requestFrame(step);
  }
  requestFrame(step);
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

function discardPileScrollMax() {
  const m = battleScene.discardPileMetrics(view, app.match, app.ui);
  return m.scrollMax;
}
function clampDiscardPileScroll(value) {
  return Math.max(0, Math.min(value, discardPileScrollMax()));
}
function scrollDiscardPileBy(deltaY) {
  if (app.ui.discardPileOwner == null) return;
  app.ui.discardPileScroll = clampDiscardPileScroll((app.ui.discardPileScroll || 0) + deltaY);
  render();
}
let discardPileInertiaRAF = null;
function cancelDiscardPileInertia() {
  if (discardPileInertiaRAF) {
    cancelAnimationFrame(discardPileInertiaRAF);
    discardPileInertiaRAF = null;
  }
}
function startDiscardPileInertia(velocity) {
  cancelDiscardPileInertia();
  if (Math.abs(velocity) < 0.02) return;
  let v = velocity;
  let last = performance.now();
  function step(now) {
    if (app.ui.discardPileOwner == null) { discardPileInertiaRAF = null; return; }
    const dt = Math.min(32, now - last);
    last = now;
    app.ui.discardPileScroll = clampDiscardPileScroll((app.ui.discardPileScroll || 0) + v * dt);
    render();
    v *= Math.pow(0.95, dt / 16);
    const max = discardPileScrollMax();
    if (Math.abs(v) > 0.02 && app.ui.discardPileScroll > 0 && app.ui.discardPileScroll < max) {
      discardPileInertiaRAF = requestAnimationFrame(step);
    } else {
      discardPileInertiaRAF = null;
    }
  }
  discardPileInertiaRAF = requestAnimationFrame(step);
}

function handleDiscardPileSwipe(start, end) {
  if (!start || !end || app.scene !== "battle" || !app.match || app.ui.battleCardDetailId || app.ui.battleCardDetailUid || app.ui.battleLogHistoryOpen || app.ui.discardPileOwner == null) return false;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  const panelY = view.safeTop + 74;
  const panelH = Math.max(300, Math.min(430, view.height - view.safeTop - view.safeBottom - 178));
  if (start.y < panelY || start.y > panelY + panelH || absY < 42 || absY < absX * 1.2) return false;
  return true;
}

function canScrollBattleCards() {
  return app.scene === "battle" && app.match && !app.match.over && !app.ui.battleCardDetailId && !app.ui.battleCardDetailUid && !app.ui.battleLogHistoryOpen && app.ui.discardPileOwner == null;
}

function scrollBattleFieldRowBy(action, deltaX) {
  if (!canScrollBattleCards() || !action?.scrollKey || !(action.maxScroll > 0)) return false;
  if (!app.ui.battleRowScrolls) app.ui.battleRowScrolls = {};
  const before = app.ui.battleRowScrolls[action.scrollKey] || 0;
  const next = Math.max(0, Math.min(before - deltaX, action.maxScroll));
  if (Math.abs(next - before) > 0.1) {
    app.ui.battleRowScrolls[action.scrollKey] = next;
    render();
  }
  return true;
}

let battleScrollMotionId = 0;

function cancelBattleScrollInertia() {
  battleScrollMotionId += 1;
}

function startBattleScrollInertia(target, initialVelocity) {
  const velocityLimit = 2.4;
  let velocity = Math.max(-velocityLimit, Math.min(velocityLimit, initialVelocity || 0));
  if (!target || Math.abs(velocity) < 0.04) return;
  const motionId = ++battleScrollMotionId;
  let lastTime = Date.now();

  function step() {
    if (motionId !== battleScrollMotionId || !canScrollBattleCards()) return;
    const now = Date.now();
    const elapsed = Math.min(32, Math.max(1, now - lastTime));
    lastTime = now;
    let before;
    let next;
    if (target.type === "hand") {
      before = app.ui.handScroll || 0;
      next = clampHandScroll(before + velocity * elapsed);
      app.ui.handScroll = next;
    } else {
      if (!target.scrollKey || !(target.maxScroll > 0)) return;
      if (!app.ui.battleRowScrolls) app.ui.battleRowScrolls = {};
      before = app.ui.battleRowScrolls[target.scrollKey] || 0;
      next = Math.max(0, Math.min(before + velocity * elapsed, target.maxScroll));
      app.ui.battleRowScrolls[target.scrollKey] = next;
    }
    if (Math.abs(next - before) < 0.05) return;
    render();
    velocity *= Math.exp(-0.0048 * elapsed);
    if (Math.abs(velocity) >= 0.025) requestFrame(step);
  }

  requestFrame(step);
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
  return settingsScene.scrollMetrics(view, app.ui);
}

function clampSettingDeckScroll(value, maxScroll = null) {
  const limit = maxScroll == null ? settingDeckScrollBounds().maxScroll : maxScroll;
  return Math.max(0, Math.min(value || 0, limit));
}

let settingDeckRenderPending = false;

function requestSettingDeckRender() {
  if (settingDeckRenderPending) return;
  settingDeckRenderPending = true;
  requestFrame(() => {
    settingDeckRenderPending = false;
    if (app.scene === "settings") render();
  });
}

function scrollSettingDeckBy(deltaY, maxScroll = null, deferRender = false) {
  if (app.scene !== "settings" || app.ui.settingCardDetailId || app.ui.settingDropdown) return false;
  const before = app.ui.settingDeckScroll || 0;
  const next = clampSettingDeckScroll(before - deltaY, maxScroll);
  if (Math.abs(next - before) > 0.1) {
    app.ui.settingDeckScroll = next;
    if (deferRender) requestSettingDeckRender();
    else render();
  }
  return true;
}

let settingDeckScrollMotionId = 0;

function cancelSettingDeckScrollInertia() {
  const wasScrolling = !!app.ui.settingDeckScrolling;
  settingDeckScrollMotionId += 1;
  app.ui.settingDeckScrolling = false;
  if (wasScrolling && app.scene === "settings") requestSettingDeckRender();
}

function canScrollSettingDeck() {
  return app.scene === "settings" && !app.ui.settingCardDetailId && !app.ui.settingDropdown;
}

function startSettingDeckScrollInertia(initialVelocity) {
  let velocity = Math.max(-2.4, Math.min(2.4, initialVelocity || 0));
  if (!canScrollSettingDeck()) {
    const wasScrolling = !!app.ui.settingDeckScrolling;
    app.ui.settingDeckScrolling = false;
    if (wasScrolling && app.scene === "settings") requestSettingDeckRender();
    return false;
  }
  if (Math.abs(velocity) < 0.04) {
    app.ui.settingDeckScrolling = false;
    requestSettingDeckRender();
    return false;
  }
  const motionId = ++settingDeckScrollMotionId;
  const maxScroll = settingDeckScrollBounds().maxScroll;
  app.ui.settingDeckScrolling = true;
  let lastTime = Date.now();

  function finish() {
    if (motionId !== settingDeckScrollMotionId) return;
    app.ui.settingDeckScrolling = false;
    requestSettingDeckRender();
  }

  function step() {
    if (motionId !== settingDeckScrollMotionId) return;
    if (!canScrollSettingDeck()) {
      app.ui.settingDeckScrolling = false;
      if (app.scene === "settings") requestSettingDeckRender();
      return;
    }
    const now = Date.now();
    const elapsed = Math.min(32, Math.max(1, now - lastTime));
    lastTime = now;
    const before = app.ui.settingDeckScroll || 0;
    const next = clampSettingDeckScroll(before + velocity * elapsed, maxScroll);
    app.ui.settingDeckScroll = next;
    if (Math.abs(next - before) < 0.05) {
      finish();
      return;
    }
    requestSettingDeckRender();
    velocity *= Math.exp(-0.0048 * elapsed);
    if (Math.abs(velocity) >= 0.025) requestFrame(step);
    else finish();
  }

  requestFrame(step);
  return true;
}

function finishSettingDeckTouch(state, start, end) {
  if (!state || !start || !end || !canScrollSettingDeck()) return false;
  const bounds = state.settingsDeckBounds || settingDeckScrollBounds();
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const qualifies = state.settingsDeckScrolled || (
    bounds.maxScroll > 0
    && start.y >= bounds.listTop
    && start.y <= bounds.listBottom
    && Math.abs(dy) > 3
    && Math.abs(dy) > Math.abs(dx) * 0.7
  );
  if (!qualifies) return false;

  const last = state.settingsDeckScrolled ? (state.lastPoint || start) : start;
  const deltaY = end.y - last.y;
  if (Math.abs(deltaY) > 0.1) {
    const now = Date.now();
    const lastTime = state.lastTime || state.startTime || now - 16;
    const elapsed = Math.max(1, now - lastTime);
    scrollSettingDeckBy(deltaY, bounds.maxScroll, true);
    const instantVelocity = -deltaY / elapsed;
    const previousVelocity = state.settingsDeckScrollVelocity;
    state.settingsDeckScrollVelocity = previousVelocity == null
      ? instantVelocity
      : previousVelocity * 0.65 + instantVelocity * 0.35;
    state.lastPoint = end;
    state.lastTime = now;
  }
  state.settingsDeckScrolled = true;
  app.ui.settingDeckScrolling = true;
  return true;
}

function handleSettingsSwipe(start, end) {
  return false;
}

function historyScrollBounds() {
  return historyScene.scrollBounds(view, app.ui);
}

function canScrollHistory() {
  return app.scene === "history" && !app.ui.historyLeaderDetailId;
}

function clampHistoryScroll(value) {
  const { maxScroll } = historyScrollBounds();
  return Math.max(0, Math.min(value || 0, maxScroll));
}

function scrollHistoryBy(deltaY) {
  if (!canScrollHistory()) return false;
  const before = app.ui.historyScroll || 0;
  const next = clampHistoryScroll(before - deltaY);
  if (Math.abs(next - before) > 0.1) {
    app.ui.historyScroll = next;
    render();
  }
  maybeLoadMoreHistory();
  return true;
}

let historyScrollMotionId = 0;

function cancelHistoryScrollInertia() {
  historyScrollMotionId += 1;
}

function startHistoryScrollInertia(initialVelocity) {
  let velocity = Math.max(-2.4, Math.min(2.4, initialVelocity || 0));
  if (!canScrollHistory() || Math.abs(velocity) < 0.04) return;
  const motionId = ++historyScrollMotionId;
  let lastTime = Date.now();

  function step() {
    if (motionId !== historyScrollMotionId || !canScrollHistory()) return;
    const now = Date.now();
    const elapsed = Math.min(32, Math.max(1, now - lastTime));
    lastTime = now;
    const before = app.ui.historyScroll || 0;
    const next = clampHistoryScroll(before + velocity * elapsed);
    app.ui.historyScroll = next;
    if (Math.abs(next - before) < 0.05) return;
    render();
    maybeLoadMoreHistory();
    velocity *= Math.exp(-0.0048 * elapsed);
    if (Math.abs(velocity) >= 0.025) requestFrame(step);
  }

  requestFrame(step);
}

function battleCardsPageScrollBounds() {
  return battleCardsScene.scrollBounds(view, app.match, app.ui);
}

function canScrollBattleCardsPage() {
  return app.scene === "battleCards" && app.match && !app.ui.battleCardsDetailId && !app.ui.battleCardsHelpOpen;
}

function clampBattleCardsPageScroll(value) {
  const { maxScroll } = battleCardsPageScrollBounds();
  return Math.max(0, Math.min(value || 0, maxScroll));
}

function scrollBattleCardsPageBy(deltaY) {
  if (!canScrollBattleCardsPage()) return false;
  const bounds = battleCardsPageScrollBounds();
  if (!Array.isArray(app.ui.battleCardsScrolls)) app.ui.battleCardsScrolls = [0, 0];
  const before = app.ui.battleCardsScrolls[bounds.playerIndex] || 0;
  const next = clampBattleCardsPageScroll(before - deltaY);
  if (Math.abs(next - before) > 0.1) {
    app.ui.battleCardsScrolls[bounds.playerIndex] = next;
    render();
  }
  return true;
}

let battleCardsPageScrollMotionId = 0;

function cancelBattleCardsPageScrollInertia() {
  battleCardsPageScrollMotionId += 1;
}

function startBattleCardsPageScrollInertia(initialVelocity) {
  let velocity = Math.max(-2.4, Math.min(2.4, initialVelocity || 0));
  if (!canScrollBattleCardsPage() || Math.abs(velocity) < 0.04) return;
  const motionId = ++battleCardsPageScrollMotionId;
  let lastTime = Date.now();

  function step() {
    if (motionId !== battleCardsPageScrollMotionId || !canScrollBattleCardsPage()) return;
    const now = Date.now();
    const elapsed = Math.min(32, Math.max(1, now - lastTime));
    lastTime = now;
    const bounds = battleCardsPageScrollBounds();
    if (!Array.isArray(app.ui.battleCardsScrolls)) app.ui.battleCardsScrolls = [0, 0];
    const before = app.ui.battleCardsScrolls[bounds.playerIndex] || 0;
    const next = clampBattleCardsPageScroll(before + velocity * elapsed);
    app.ui.battleCardsScrolls[bounds.playerIndex] = next;
    if (Math.abs(next - before) < 0.05) return;
    render();
    velocity *= Math.exp(-0.0048 * elapsed);
    if (Math.abs(velocity) >= 0.025) requestFrame(step);
  }

  requestFrame(step);
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
  if (app.ui.battleCardsDetailId) return { id: app.ui.battleCardsDetailId, uid: "", slot: "battleCards" };
  if (app.ui.battleCardDetailId || app.ui.battleCardDetailUid) return { id: app.ui.battleCardDetailId, uid: app.ui.battleCardDetailUid, slot: "battle" };
  if (app.ui.settingCardDetailId) return { id: app.ui.settingCardDetailId, uid: "", slot: "settings" };
  if (app.ui.matchSetupCardDetailId) return { id: app.ui.matchSetupCardDetailId, uid: "", slot: app.scene === "pvpSetup" ? "pvpSetup" : "matchSetup" };
  if (app.ui.historyLeaderDetailId) return { id: app.ui.historyLeaderDetailId, uid: "", slot: "history" };
  return null;
}

function setCurrentDetailCard(slot, card, cardUid = "") {
  if (!card) return;
  if (slot === "deck") app.ui.deckCardDetailId = card.id;
  else if (slot === "battleCards") app.ui.battleCardsDetailId = card.id;
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
    if (tab === "strategy") return card.category === "stratagem" || card.category === "situation";
    if (tab === "hero") return isHeroCard(card);
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
  if (app.scene === "battleCards" && battleCardsScene.detailCards) return detailEntries(battleCardsScene.detailCards(app.match, app.ui));
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
  if (app.scene === "pvpRoom") {
    console.log("[pvp-ready-debug] pvpRoom tap", {
      point,
      actionId: action?.id || "",
      playerIndex: app.pvp.playerIndex,
      submitting: app.pvp.submitting,
      room: pvpReadyDebug(app.pvp.room)
    });
  }
  if (action) handleAction(action);
}

const LONG_PRESS_MS = 380;

// 分步新手指引：按序逐个触发，每轮对局最多一个；用户完成则不再提醒，未完成且未达三次的指引循环触发，达到三次后停止提醒
const GUIDE_STEPS = ["cardDetail", "leaderSkill", "battleRecord", "fieldCardDetail"];
const MAX_GUIDE_REMIND = 3;

function pickActiveGuide() {
  app.ui.activeGuide = "";
  app.ui.guideDismissed = false;
  const save = loadSave();
  const guides = save.guides || {};
  const n = GUIDE_STEPS.length;

  // 收集所有「未完成且未超限」的可用指引
  const available = [];
  for (let i = 0; i < n; i += 1) {
    const step = GUIDE_STEPS[i];
    const g = guides[step];
    const cnt = Number.isFinite(g && g.count) ? g.count : 0;
    if (g && !g.done && cnt < MAX_GUIDE_REMIND) {
      available.push(step);
    }
  }

  // 没有可用指引则不显示任何气泡
  if (available.length === 0) return;

  // 从 guideCursor 开始向后找最近的可用指引，实现真正的顺序循环
  const cursor = (((save.guideCursor || 0) % n) + n) % n;
  let selectedStep = null;
  let selectedIdx = -1;
  for (let i = 0; i < n; i += 1) {
    const idx = (cursor + i) % n;
    const step = GUIDE_STEPS[idx];
    if (available.indexOf(step) !== -1) {
      selectedStep = step;
      selectedIdx = idx;
      break;
    }
  }

  if (!selectedStep) return;

  // 累加次数并持久化（强制确保 count 为数字）
  app.ui.activeGuide = selectedStep;
  const g = guides[selectedStep];
  g.count = (Number.isFinite(g.count) ? g.count : 0) + 1;
  saveProgress({ guides: save.guides, guideCursor: (selectedIdx + 1) % n });
}

function markGuideDone(step) {
  const save = loadSave();
  const g = save.guides && save.guides[step];
  if (!g || g.done) {
    if (app.ui.activeGuide === step) app.ui.activeGuide = "";
    return;
  }
  g.done = true;
  saveProgress({ guides: save.guides });
  if (app.ui.activeGuide === step) app.ui.activeGuide = "";
}

// 长按类指引只监控长按：长按主将头像=查看主将技能，长按手牌=查看手牌详情，长按场上卡牌=查看场上卡牌详情
function markGuideByLongPress(actionId) {
  if (app.scene !== "battle" || !app.match) return;
  if (app.match.mulligan && app.match.mulligan.active) return;
  if (actionId === "leaderAvatar") markLeaderSkillPart("longPressed");
  else if (actionId === "card") markGuideDone("cardDetail");
  else if (actionId === "battleCardDetail") markGuideDone("fieldCardDetail");
  else if (actionId === "targetChoice") markGuideDone("cardDetail");
}

// 主将技能指引需「长按查看」+「使用技能」两者都完成；part 为 longPressed 或 usedSkill
function markLeaderSkillPart(part) {
  const save = loadSave();
  const g = save.guides && save.guides.leaderSkill;
  if (!g) return;
  g[part] = true;
  if (g.longPressed && g.usedSkill) g.done = true;
  saveProgress({ guides: save.guides });
  if (g.done && app.ui.activeGuide === "leaderSkill") app.ui.activeGuide = "";
}
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
  markGuideDone("battleRecord");
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

function openBattleCardsDetail(cardId) {
  if (!cardId) return;
  app.ui.battleCardsDetailId = cardId;
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
    if (app.scene === "battleCards" && !app.ui.battleCardsDetailId && !app.ui.battleCardsHelpOpen && action.id === "battleCardsCard") {
      openDetail = openBattleCardsDetail;
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
    markGuideByLongPress(action.id);
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
    cancelBattleScrollInertia();
    cancelHistoryScrollInertia();
    cancelBattleCardsPageScrollInertia();
    cancelSettingDeckScrollInertia();
    cancelAdminStatsScrollInertia();
    cancelDiscardPileInertia();
    touchStartState = { point, startTime: Date.now() };
    startLongPress(point);
  });
}

if (typeof wx !== "undefined" && wx.onTouchMove) {
  wx.onTouchMove(event => {
    const point = normalizeTouch(event);
    if (!point || !touchStartState) return;

    
    // 实时跟踪卡牌详情滑动
    const detailId = app.ui.deckCardDetailId || app.ui.battleCardsDetailId || app.ui.battleCardDetailId || app.ui.settingCardDetailId || app.ui.matchSetupCardDetailId || app.ui.historyLeaderDetailId;
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

    if (app.scene === "adminStats") {
      const bounds = adminStatsScrollBounds();
      const start = touchStartState.point;
      const dx = point.x - start.x;
      const dy = point.y - start.y;
      if (!touchStartState.adminStatsScrolling && bounds.maxScroll > 0 && start.y >= bounds.listTop && start.y <= bounds.listBottom && Math.abs(dy) > 3 && Math.abs(dy) > Math.abs(dx) * 0.7) {
        touchStartState.adminStatsScrolling = true;
      }
      if (touchStartState.adminStatsScrolling) {
        clearLongPress();
        const last = touchStartState.lastPoint || start;
        const now = Date.now();
        const lastTime = touchStartState.lastTime || touchStartState.startTime || now - 16;
        const deltaY = point.y - last.y;
        const elapsed = Math.max(1, now - lastTime);
        scrollAdminStatsBy(deltaY);
        const instantVelocity = -deltaY / elapsed;
        const previousVelocity = touchStartState.adminStatsScrollVelocity;
        touchStartState.adminStatsScrollVelocity = previousVelocity == null
          ? instantVelocity
          : previousVelocity * 0.65 + instantVelocity * 0.35;
        touchStartState.adminStatsScrolled = true;
        touchStartState.lastPoint = point;
        touchStartState.lastTime = now;
        return;
      }
    }

    if (app.scene === "rankLeaderboard") {
      const bounds = rankLeaderboardScrollBounds();
      const start = touchStartState.point;
      const dx = point.x - start.x;
      const dy = point.y - start.y;
      if (!touchStartState.rankLeaderboardScrolling && bounds.maxScroll > 0 && start.y >= bounds.listTop && start.y <= bounds.listBottom && Math.abs(dy) > 3 && Math.abs(dy) > Math.abs(dx) * 0.7) {
        touchStartState.rankLeaderboardScrolling = true;
      }
      if (touchStartState.rankLeaderboardScrolling) {
        clearLongPress();
        const last = touchStartState.lastPoint || start;
        scrollRankLeaderboardBy(point.y - last.y);
        touchStartState.rankLeaderboardScrolled = true;
        touchStartState.lastPoint = point;
        return;
      }
    }

    if (app.scene === "battle" && app.match && app.ui.discardPileOwner != null && !app.ui.battleCardDetailId && !app.ui.battleCardDetailUid) {
      const start = touchStartState.point;
      const dx = point.x - start.x;
      const dy = point.y - start.y;
      if (Math.abs(dy) > 4 && Math.abs(dy) > Math.abs(dx) * 0.8) {
        if (touchStartState.discardPileScrolled || Math.abs(dy) > 6) {
          touchStartState.discardPileScrolled = true;
          clearLongPress();
          scrollDiscardPileBy(start.y - point.y);
          const now = Date.now();
          if (touchStartState.discardPileLastT) {
            const elapsed = Math.max(1, now - touchStartState.discardPileLastT);
            touchStartState.discardPileVelocity = -(point.y - touchStartState.discardPileLastY) / elapsed;
          }
          touchStartState.discardPileLastY = point.y;
          touchStartState.discardPileLastT = now;
          return;
        }
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

    if (canScrollBattleCards()) {
      const start = touchStartState.point;
      const dx = point.x - start.x;
      const dy = point.y - start.y;
      if (!touchStartState.battleScrollTarget && Math.abs(dx) > 4 && Math.abs(dx) > Math.abs(dy) * 0.8) {
        const handTop = view.height - view.safeBottom - BATTLE_HAND_BOTTOM_OFFSET - BATTLE_HAND_SWIPE_TOP_PADDING;
        const handBottom = view.height - view.safeBottom - (BATTLE_HAND_BOTTOM_OFFSET - BATTLE_HAND_CARD_H) + BATTLE_HAND_SWIPE_BOTTOM_PADDING;
        if (start.y >= handTop && start.y <= handBottom && handScrollBounds().maxScroll > 0) {
          touchStartState.battleScrollTarget = { type: "hand" };
        } else {
          const action = findAction(start);
          if (action && ["battleFieldRow", "battleCardDetail"].includes(action.id) && action.scrollKey && action.maxScroll > 0) {
            touchStartState.battleScrollTarget = { type: "row", scrollKey: action.scrollKey, maxScroll: action.maxScroll };
          }
        }
      }

      const target = touchStartState.battleScrollTarget;
      if (target) {
        clearLongPress();
        const last = touchStartState.lastPoint || start;
        const now = Date.now();
        const lastTime = touchStartState.lastTime || touchStartState.startTime || now - 16;
        const deltaX = point.x - last.x;
        const elapsed = Math.max(1, now - lastTime);
        if (target.type === "hand") scrollHandBy(deltaX);
        else scrollBattleFieldRowBy(target, deltaX);
        const instantVelocity = -deltaX / elapsed;
        const previousVelocity = touchStartState.battleScrollVelocity;
        touchStartState.battleScrollVelocity = previousVelocity == null
          ? instantVelocity
          : previousVelocity * 0.65 + instantVelocity * 0.35;
        touchStartState.battleCardsScrolled = true;
        touchStartState.lastPoint = point;
        touchStartState.lastTime = now;
        return;
      }
    }

    if (canScrollBattleCardsPage()) {
      const bounds = battleCardsPageScrollBounds();
      const start = touchStartState.point;
      const dx = point.x - start.x;
      const dy = point.y - start.y;
      if (!touchStartState.battleCardsPageScrolling && bounds.maxScroll > 0 && start.y >= bounds.listTop && start.y <= bounds.listBottom && Math.abs(dy) > 3 && Math.abs(dy) > Math.abs(dx) * 0.7) {
        touchStartState.battleCardsPageScrolling = true;
      }
      if (touchStartState.battleCardsPageScrolling) {
        clearLongPress();
        const last = touchStartState.lastPoint || start;
        const now = Date.now();
        const lastTime = touchStartState.lastTime || touchStartState.startTime || now - 16;
        const deltaY = point.y - last.y;
        const elapsed = Math.max(1, now - lastTime);
        scrollBattleCardsPageBy(deltaY);
        const instantVelocity = -deltaY / elapsed;
        const previousVelocity = touchStartState.battleCardsPageScrollVelocity;
        touchStartState.battleCardsPageScrollVelocity = previousVelocity == null
          ? instantVelocity
          : previousVelocity * 0.65 + instantVelocity * 0.35;
        touchStartState.battleCardsPageScrolled = true;
        touchStartState.lastPoint = point;
        touchStartState.lastTime = now;
        return;
      }
    }

    if (canScrollHistory()) {
      const bounds = historyScrollBounds();
      const start = touchStartState.point;
      const dx = point.x - start.x;
      const dy = point.y - start.y;
      if (!touchStartState.historyScrolling && bounds.maxScroll > 0 && start.y >= bounds.listTop && start.y <= bounds.listBottom && Math.abs(dy) > 3 && Math.abs(dy) > Math.abs(dx) * 0.7) {
        touchStartState.historyScrolling = true;
      }
      if (touchStartState.historyScrolling) {
        clearLongPress();
        const last = touchStartState.lastPoint || start;
        const now = Date.now();
        const lastTime = touchStartState.lastTime || touchStartState.startTime || now - 16;
        const deltaY = point.y - last.y;
        const elapsed = Math.max(1, now - lastTime);
        scrollHistoryBy(deltaY);
        const instantVelocity = -deltaY / elapsed;
        const previousVelocity = touchStartState.historyScrollVelocity;
        touchStartState.historyScrollVelocity = previousVelocity == null
          ? instantVelocity
          : previousVelocity * 0.65 + instantVelocity * 0.35;
        touchStartState.historyScrolled = true;
        touchStartState.lastPoint = point;
        touchStartState.lastTime = now;
        return;
      }
    }

    if (canScrollSettingDeck()) {
      const bounds = touchStartState.settingsDeckBounds || settingDeckScrollBounds();
      touchStartState.settingsDeckBounds = bounds;
      const start = touchStartState.point;
      const dx = point.x - start.x;
      const dy = point.y - start.y;
      if (!touchStartState.settingsDeckScrolling && bounds.maxScroll > 0 && start.y >= bounds.listTop && start.y <= bounds.listBottom && Math.abs(dy) > 3 && Math.abs(dy) > Math.abs(dx) * 0.7) {
        touchStartState.settingsDeckScrolling = true;
      }
      if (touchStartState.settingsDeckScrolling) {
        clearLongPress();
        app.ui.settingDeckScrolling = true;
        const last = touchStartState.lastPoint || start;
        const now = Date.now();
        const lastTime = touchStartState.lastTime || touchStartState.startTime || now - 16;
        const deltaY = point.y - last.y;
        const elapsed = Math.max(1, now - lastTime);
        scrollSettingDeckBy(deltaY, bounds.maxScroll, true);
        const instantVelocity = -deltaY / elapsed;
        const previousVelocity = touchStartState.settingsDeckScrollVelocity;
        touchStartState.settingsDeckScrollVelocity = previousVelocity == null
          ? instantVelocity
          : previousVelocity * 0.65 + instantVelocity * 0.35;
        touchStartState.settingsDeckScrolled = true;
        touchStartState.lastPoint = point;
        touchStartState.lastTime = now;
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

    finishSettingDeckTouch(state, start, point);

    if (state && state.battleCardsScrolled) {
      const idleMs = Math.max(0, Date.now() - (state.lastTime || Date.now()));
      const releaseFactor = Math.max(0, 1 - idleMs / 120);
      startBattleScrollInertia(state.battleScrollTarget, (state.battleScrollVelocity || 0) * releaseFactor);
      return;
    }
    if (state && state.battleCardsPageScrolled) {
      const idleMs = Math.max(0, Date.now() - (state.lastTime || Date.now()));
      const releaseFactor = Math.max(0, 1 - idleMs / 120);
      startBattleCardsPageScrollInertia((state.battleCardsPageScrollVelocity || 0) * releaseFactor);
      return;
    }
    if (state && state.rankLeaderboardScrolled) return;
    if (state && state.historyScrolled) {
      const idleMs = Math.max(0, Date.now() - (state.lastTime || Date.now()));
      const releaseFactor = Math.max(0, 1 - idleMs / 120);
      startHistoryScrollInertia((state.historyScrollVelocity || 0) * releaseFactor);
      return;
    }
    if (state && state.adminStatsScrolled) {
      const idleMs = Math.max(0, Date.now() - (state.lastTime || Date.now()));
      const releaseFactor = Math.max(0, 1 - idleMs / 120);
      startAdminStatsScrollInertia((state.adminStatsScrollVelocity || 0) * releaseFactor);
      return;
    }
    if (state && state.settingsDeckScrolled) {
      const idleMs = Math.max(0, Date.now() - (state.lastTime || Date.now()));
      const releaseFactor = Math.max(0, 1 - idleMs / 120);
      startSettingDeckScrollInertia((state.settingsDeckScrollVelocity || 0) * releaseFactor);
      return;
    }
    if (state && state.battleLogHistoryScrolled) return;
    if (state && state.discardPileScrolled) {
      const idleMs = Math.max(0, Date.now() - (state.discardPileLastT || Date.now()));
      const releaseFactor = Math.max(0, 1 - idleMs / 120);
      startDiscardPileInertia((state.discardPileVelocity || 0) * releaseFactor);
      return;
    }
    if (handleBattleLogHistorySwipe(start, point)) return;
    if (handleDiscardPileSwipe(start, point)) return;
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
    cancelSettingDeckScrollInertia();
    cancelAdminStatsScrollInertia();
    touchStartState = null;
  });
}

console.log("===== 章鱼牌 v20260720-ready-debug-v1 诊断代码已加载 =====");
loadAuthSession();
ensureCloudAuth().then(() => retryPendingRankResult("startup-auth")).catch(err => console.warn("[rank] 启动登录/补交结算失败", err?.message || err));
setupShare();
restoreInterruptedSingleMatch();
retryPendingRankResult("startup");
handleLaunchRoom();
render();
