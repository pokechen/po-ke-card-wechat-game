const { createCanvasAdapter, hit, setImageRenderHook } = require("./js/ui/canvas");
const menuScene = require("./js/scenes/menu");
const matchSetupScene = require("./js/scenes/matchSetup");
const rulesScene = require("./js/scenes/rules");
const settingsScene = require("./js/scenes/settings");
const deckBuilderScene = require("./js/scenes/deckBuilder");
const historyScene = require("./js/scenes/history");
const battleScene = require("./js/scenes/battleScene");
const resultScene = require("./js/scenes/result");
const pvpRoomScene = require("./js/scenes/pvpRoom");
const pvpSetupScene = require("./js/scenes/pvpSetup");
const pvpClient = require("./js/core/pvpClient");
const { loadSave, loadSettings, saveSettings, saveProgress, recordMatch, getCustomDeckSlots, getActiveCustomDeckSlotIndex, getActiveCustomDeckIds } = require("./js/core/storage");
const { cardById, deckStatus, recommendedDeckIds, leadersFor, FACTION_KEYS } = require("./js/core/cards");
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
    error: ""
  },
  ui: {
    handPage: 0,
    deckPage: 0,
    battleCardDetailId: "",
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
    pageTransition: null,
    detailSwipe: null
  }
};

setImageRenderHook(() => render());

const RECENT_PLAY_AUTO_DISMISS_MS = 1800;
const PAGE_TRANSITION_MS = 180;
const DETAIL_SWIPE_MS = 220;

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
  app.ui.detailSwipe = { offset: fromOffset };
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
  app.ui.discardPileOwner = null;
  app.ui.discardPilePage = 0;
  app.ui.dismissedRecentPlaySeq = 0;
  clearRecentPlayTimer();
  const settings = { ...loadSettings(), ...optionsPatch };
  app.match = createMatch(settings);
  app.ui.showCardGuide = !loadSave().finishedTutorial;
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
  }, 420);
}

function vibrate() {
  const settings = loadSettings();
  if (settings.vibration && typeof wx !== "undefined" && wx.vibrateShort) {
    wx.vibrateShort({ type: "light" });
  }
}

function getSharePayload() {
  const roomId = app.pvp.roomId;
  const normal = {
    title: roomId ? `来章鱼牌房间 ${roomId} 对战` : "来盘章鱼牌吧",
    imageUrl: "assets/po-ke-card.png",
    query: roomId ? `roomId=${encodeURIComponent(roomId)}` : "from=share"
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
  if (api.showShareMenu) {
    api.showShareMenu({
      withShareTicket: false,
      menus: ["shareAppMessage"],
      fail: err => console.warn("[share] showShareMenu failed", err)
    });
  }
  if (api.onShareAppMessage) {
    api.onShareAppMessage(() => {
      const payload = getSharePayload();
      console.log("[share] onShareAppMessage payload:", JSON.stringify(payload), "currentRoomId:", app.pvp.roomId);
      return payload;
    });
  }
}

function guideShare() {
  const api = typeof wx !== "undefined" ? wx : null;
  if (api && api.showModal) {
    api.showModal({
      title: "分享给好友",
      content: "请点击右上角“···”，选择“转发”给好友。",
      showCancel: false
    });
    return;
  }
  toast("点右上角···转发");
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

function currentPlayerSetup() {
  const settings = loadSettings();
  const faction = resolvePvpFaction(settings);
  const selectedIds = getActiveCustomDeckIds(settings, faction);
  const status = deckStatus(selectedIds, faction);
  const useCustomDeck = settings.pvpDeckMode === "custom" && status.valid;
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
  app.pvp.room = room;
  if (roomId) app.pvp.roomId = roomId;
  if (Number.isInteger(playerIndex)) app.pvp.playerIndex = playerIndex;
  if (room.match) app.match = decorateOnlineMatch(room.match);
  app.pvp.loading = false;
  app.pvp.submitting = false;
  app.pvp.error = "";
  if (room.status === "playing" && app.match) {
    app.ui.handPage = clampHandPage(app.ui.handPage);
    if (app.scene !== "battle") return setScene("battle");
  }
  if (room.status === "finished" && app.match) {
    recordOnlineMatch(app.match);
    return setScene("result");
  }
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
  app.pvp = { roomId: "", pendingRoomId: "", room: null, playerIndex: 0, loading: false, submitting: false, error: "", recordedResultRoom: "" };
}

function enterPvpSetup(roomId) {
  resetPvpState();
  app.pvp.pendingRoomId = normalizePvpRoomId(roomId);
  app.ui.matchSetupDropdown = "";
  app.ui.matchSetupCardDetailId = "";
  setScene("pvpSetup");
}

function createPvpRoom() {
  resetPvpState();
  app.pvp.loading = true;
  setScene("pvpRoom");
  pvpClient.createRoom(currentPlayerSetup()).then(result => {
    app.pvp.roomId = result.roomId;
    app.pvp.playerIndex = result.playerIndex || 0;
    applyRoomUpdate(result.room, app.pvp.playerIndex);
    watchPvpRoom(result.roomId);
    guideShare();
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
  resetPvpState();
  app.pvp.roomId = safeRoomId;
  app.pvp.loading = true;
  setScene("pvpRoom");
  pvpClient.joinRoom(safeRoomId, currentPlayerSetup()).then(result => {
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

function readSharedRoomId() {
  const api = typeof wx !== "undefined" ? wx : null;
  if (!api) return "";
  // 启动参数（首次从分享卡片进入）
  try {
    const launch = api.getLaunchOptionsSync && api.getLaunchOptionsSync();
    const fromLaunch = normalizePvpRoomId(launch?.query?.roomId);
    console.log("[launch] launchOptions.query:", JSON.stringify(launch?.query || {}), "roomId:", fromLaunch);
    if (fromLaunch) return fromLaunch;
  } catch (e) {}
  // 切后台再回来（部分场景启动参数在 enterOptions 中）
  try {
    const enter = api.getEnterOptionsSync && api.getEnterOptionsSync();
    const fromEnter = normalizePvpRoomId(enter?.query?.roomId);
    console.log("[launch] enterOptions.query:", JSON.stringify(enter?.query || {}), "roomId:", fromEnter);
    if (fromEnter) return fromEnter;
  } catch (e) {}
  return "";
}

function handleLaunchRoom() {
  const api = typeof wx !== "undefined" ? wx : null;
  if (!api) return;
  const roomId = readSharedRoomId();
  if (roomId) {
    console.log("[launch] 检测到分享房间号，直接进入联网对战:", roomId);
    setTimeout(() => joinPvpRoom(roomId), 120);
  }
  if (api.onShow) {
    api.onShow(options => {
      const nextRoomId = normalizePvpRoomId(options?.query?.roomId);
      if (nextRoomId && nextRoomId !== app.pvp.roomId) {
        console.log("[launch] onShow 检测到房间号，进入联网对战:", nextRoomId);
        joinPvpRoom(nextRoomId);
      }
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
  if (app.match.mulligan?.active) return app.match.mulligan.current === app.pvp.playerIndex;
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
    const faction = settings.pvpFaction || settings.humanFaction;
    if (faction !== "random") saveSettings({ pvpLeaderIds: { ...(settings.pvpLeaderIds || {}), [faction]: value } });
  }
  render();
}

function handlePvpSetup(action) {
  const selectFields = ["pvpFaction", "pvpLeader"];
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
  const settings = loadSettings();
  const faction = settings.pvpFaction || settings.humanFaction;
  if (action.id === "pvpDeckMode") {
    if (action.value === "custom" && faction === "random") return toast("随机阵营将使用随机卡牌");
    saveSettings({ pvpDeckMode: action.value === "custom" ? "custom" : "random" });
    return render();
  }
  if (action.id === "editPvpCustomDeck") {
    if (faction === "random") return toast("请先选择具体阵营");
    saveSettings({ humanFaction: faction });
    app.ui.deckPage = 0;
    app.ui.deckSlotDropdown = "";
    app.ui.deckReturnScene = "pvpSetup";
    return setScene("deckBuilder");
  }
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
  if (action.id === "dismissRecentPlay") {
    app.ui.dismissedRecentPlaySeq = Math.max(app.ui.dismissedRecentPlaySeq || 0, action.seq || app.match.lastPlayed?.seq || 0);
    clearRecentPlayTimer();
    return render();
  }
  if (action.id === "battleCardDetail") return render();
  if (action.id === "detailPanel") return;
  if (action.id === "closeDetail") {
    app.ui.battleCardDetailId = "";
    return render();
  }
  if (app.ui.battleCardDetailId) return render();
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
  if (action.id === "surrenderMatch") {
    if (isOnlineMatch()) return submitPvpAction({ type: "surrender" });
    surrender(app.match, app.match.current);
    return setScene("result");
  }
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
    if (action.id === "card") { mulliganSwap(app.match, action.cardUid); app.ui.handPage = 0; return afterHumanAction(); }
    if (action.id === "mulliganDone") { finishMulligan(app.match); return afterHumanAction(); }
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
      if (isOnlineMatch()) return createPvpRoom();
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

function handleDiscardPileSwipe(start, end) {
  if (!start || !end || app.scene !== "battle" || !app.match || app.ui.battleCardDetailId || app.ui.discardPileOwner == null) return false;
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
  if (!start || !end || app.scene !== "battle" || !app.match || app.match.over || app.ui.battleCardDetailId || app.ui.discardPileOwner != null) return false;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (Math.abs(dx) < 42 || Math.abs(dx) < Math.abs(dy) * 1.2) return false;
  const handTop = view.height - view.safeBottom - 210;
  const handBottom = view.height - view.safeBottom - 78;
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

function getCurrentDetailCardList() {
  if (app.scene === "deckBuilder") {
    const settings = loadSettings();
    const faction = settings.humanFaction;
    const { eligibleCards, groupCards } = require("./js/core/cards");
    return groupCards(eligibleCards(faction));
  }
  return [];
}

function handleCardDetailSwipe(start, end) {
  const detailId = app.ui.deckCardDetailId || app.ui.battleCardDetailId || app.ui.settingCardDetailId || app.ui.matchSetupCardDetailId || app.ui.historyLeaderDetailId;
  if (!detailId || !start || !end) return false;
  
  // 如果正在动画中，不处理新滑动
  if (app.ui.detailSwipe && app.ui.detailSwipe.animating) return false;
  
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  
  // 需要水平滑动且幅度足够
  if (absX < 40 || absX < absY * 0.8) return false;
  
  const cards = getCurrentDetailCardList();
  if (!cards.length) return false;
  
  const currentIdx = cards.findIndex(g => g.card.id === detailId);
  if (currentIdx < 0) return false;
  
  // 向左滑（dx < 0）显示下一张，向右滑（dx > 0）显示上一张
  const swipeLeft = dx < 0;
  const targetIdx = swipeLeft ? currentIdx + 1 : currentIdx - 1;
  
  // 检查边界
  if (targetIdx < 0 || targetIdx >= cards.length) return false;
  
  const targetCard = cards[targetIdx].card;
  const maxOffset = 112; // 最大滑动偏移量
  
  // 启动动画切换卡牌
  startDetailSwipeTransition(swipeLeft ? -maxOffset : maxOffset, () => {
    // 动画完成后更新当前查看的卡牌ID
    if (app.scene === "deckBuilder") app.ui.deckCardDetailId = targetCard.id;
    else if (app.scene === "battle") app.ui.battleCardDetailId = targetCard.id;
    else if (app.scene === "settings") app.ui.settingCardDetailId = targetCard.id;
    else if (app.scene === "matchSetup" || app.scene === "pvpSetup") app.ui.matchSetupCardDetailId = targetCard.id;
    else if (app.scene === "history") app.ui.historyLeaderDetailId = targetCard.id;
  });
  
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

function openBattleCardDetail(cardId) {
  if (!cardId) return;
  app.ui.battleCardDetailId = cardId;
  vibrate();
  render();
}

function openHistoryLeaderDetail(cardId) {
  if (!cardId) return;
  app.ui.historyLeaderDetailId = cardId;
  vibrate();
  render();
}

function openMatchSetupCardDetail(cardId) {
  if (!cardId) return;
  app.ui.matchSetupDropdown = "";
  app.ui.matchSetupCardDetailId = cardId;
  vibrate();
  render();
}

function openDeckBuilderCardDetail(cardId) {
  if (!cardId) return;
  app.ui.deckCardDetailId = cardId;
  vibrate();
  render();
}

function openSettingCardDetail(cardId) {
  if (!cardId) return;
  app.ui.settingDropdown = "";
  app.ui.settingCardDetailId = cardId;
  vibrate();
  render();
}

function startLongPress(point) {
  const action = findAction(point);
  if (!action || !action.cardId) return;
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
  if (!openDetail) return;
  touchStartState.longPressTimer = setTimeout(() => {
    if (!touchStartState) return;
    touchStartState.longPressTimer = null;
    touchStartState.longPressFired = true;
    openDetail(action.cardId);
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
    
    // 检查是否在卡牌详情上有未完成的滑动，需要回弹
    const detailId = app.ui.deckCardDetailId || app.ui.battleCardDetailId || app.ui.settingCardDetailId || app.ui.matchSetupCardDetailId || app.ui.historyLeaderDetailId;
    if (detailId && app.ui.detailSwipe && !app.ui.detailSwipe.animating && Math.abs(app.ui.detailSwipe.offset || 0) > 5) {
      // 如果没有触发卡牌切换，回弹到原位
      startDetailSwipeTransition(app.ui.detailSwipe.offset);
      return;
    }
    
    // 重置未完成的滑动状态
    if (app.ui.detailSwipe && !app.ui.detailSwipe.animating) {
      app.ui.detailSwipe = null;
      render();
    }
    
    if (handleCardDetailSwipe(start, point)) return;
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

pvpClient.initCloud();
setupShare();
handleLaunchRoom();
render();
