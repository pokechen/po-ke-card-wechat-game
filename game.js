const { createCanvasAdapter, hit, setImageRenderHook } = require("./js/ui/canvas");
const menuScene = require("./js/scenes/menu");
const matchSetupScene = require("./js/scenes/matchSetup");
const rulesScene = require("./js/scenes/rules");
const settingsScene = require("./js/scenes/settings");
const cardsScene = require("./js/scenes/cardsBrowser");
const deckBuilderScene = require("./js/scenes/deckBuilder");
const historyScene = require("./js/scenes/history");
const battleScene = require("./js/scenes/battleScene");
const resultScene = require("./js/scenes/result");
const pvpRoomScene = require("./js/scenes/pvpRoom");
const pvpClient = require("./js/core/pvpClient");
const { loadSave, loadSettings, saveSettings, saveProgress, getCustomDeckSlots, getActiveCustomDeckSlotIndex, getActiveCustomDeckIds } = require("./js/core/storage");
const { cardById, deckStatus, recommendedDeckIds, leadersFor } = require("./js/core/cards");
const { createMatch, playCard, autoPlayHuman, pass, useLeader, mulliganSwap, finishMulligan, aiStep, resolvePending, cancelPending, surrender, handOwnerIndex } = require("./js/core/battle");

const view = createCanvasAdapter();
const ctx = view.ctx;
const app = {
  scene: "menu",
  actions: [],
  match: null,
  aiTimer: null,
  pvp: {
    roomId: "",
    room: null,
    playerIndex: 0,
    loading: false,
    submitting: false,
    error: ""
  },
  ui: {
    handPage: 0,
    cardPage: 0,
    deckPage: 0,
    cardFactionFilter: "all",
    cardCategoryFilter: "all",
    cardFilterDropdown: "",
    cardQuery: "",
    cardSearchActive: false,
    cardSearchDraft: "",
    keyboardHeight: 0,
    cardDetailId: "",
    battleCardDetailId: "",
    deckCardDetailId: "",
    settingCardDetailId: "",
    matchSetupCardDetailId: "",
    showCardGuide: false,
    deckReturnScene: "settings",
    settingDropdown: "",
    settingCardTab: "all",
    settingDeckPage: 0,
    settingSelectedSlotIndex: null,
    matchSetupDropdown: "",
    deckSlotDropdown: "",
    historyPage: 0,
    historyLeaderDetailId: ""
  }
};

setImageRenderHook(() => render());

function clearAiTimer() {
  if (app.aiTimer) {
    clearTimeout(app.aiTimer);
    app.aiTimer = null;
  }
}

function setScene(scene) {
  if (scene !== "battle") clearAiTimer();
  app.scene = scene;
  render();
}

function startMatch(optionsPatch = {}) {
  clearAiTimer();
  app.ui.handPage = 0;
  app.ui.battleCardDetailId = "";
  const settings = { ...loadSettings(), ...optionsPatch };
  app.match = createMatch(settings);
  app.ui.showCardGuide = !loadSave().finishedTutorial;
  setScene("battle");
}

function render() {
  app.actions = [];
  if (app.scene === "menu") menuScene.draw(ctx, view, app.actions);
  if (app.scene === "pvpRoom") pvpRoomScene.draw(ctx, view, app.actions, app.pvp);
  if (app.scene === "matchSetup") matchSetupScene.draw(ctx, view, app.actions, app.ui);
  if (app.scene === "rules") rulesScene.draw(ctx, view, app.actions);
  if (app.scene === "settings") settingsScene.draw(ctx, view, app.actions, app.ui);
  if (app.scene === "cards") cardsScene.draw(ctx, view, app.actions, app.ui);
  if (app.scene === "deckBuilder") deckBuilderScene.draw(ctx, view, app.actions, app.ui);
  if (app.scene === "history") historyScene.draw(ctx, view, app.actions, app.ui);
  if (app.scene === "battle") battleScene.draw(ctx, view, app.actions, app.match, app.ui);
  if (app.scene === "result") resultScene.draw(ctx, view, app.actions, app.match);
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
  return {
    title: roomId ? `来章鱼牌房间 ${roomId} 对战` : "来盘章鱼牌吧",
    imageUrl: "assets/po-ke-card.png",
    query: roomId ? `roomId=${encodeURIComponent(roomId)}` : "from=share"
  };
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
    api.onShareAppMessage(() => getSharePayload());
  }
}

function shareGame() {
  const api = typeof wx !== "undefined" ? wx : null;
  if (!api || !api.shareAppMessage) {
    toast("当前环境不支持分享");
    return;
  }
  try {
    api.shareAppMessage(getSharePayload());
  } catch (err) {
    console.warn("[share] shareAppMessage failed", err);
    toast("分享失败，请稍后重试");
  }
}

function currentPlayerSetup() {
  const settings = loadSettings();
  const faction = settings.humanFaction;
  const selectedIds = getActiveCustomDeckIds(settings, faction);
  const status = deckStatus(selectedIds, faction);
  const leader = leadersFor(faction).find(card => card.id === settings.humanLeaderIds?.[faction]) || leadersFor(faction)[0];
  return {
    name: "玩家",
    faction,
    leaderId: leader?.id || "",
    customDeckIds: status.valid ? status.ids : []
  };
}

function decorateOnlineMatch(match) {
  if (!match) return null;
  match.mode = "online";
  match.localPlayerIndex = app.pvp.playerIndex;
  return match;
}

function applyRoomUpdate(room, playerIndex) {
  if (!room) return;
  app.pvp.room = room;
  app.pvp.roomId = room._id || app.pvp.roomId;
  if (Number.isInteger(playerIndex)) app.pvp.playerIndex = playerIndex;
  if (room.match) app.match = decorateOnlineMatch(room.match);
  app.pvp.loading = false;
  app.pvp.submitting = false;
  app.pvp.error = "";
  if (room.status === "playing" && app.match) {
    app.ui.handPage = clampHandPage(app.ui.handPage);
    if (app.scene !== "battle") return setScene("battle");
  }
  if (room.status === "finished" && app.match) return setScene("result");
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
  app.pvp = { roomId: "", room: null, playerIndex: 0, loading: false, submitting: false, error: "" };
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
    shareGame();
  }).catch(err => {
    console.warn("[pvp] create failed", err);
    app.pvp.loading = false;
    app.pvp.error = err.message || "开房间失败";
    render();
  });
}

function joinPvpRoom(roomId) {
  const safeRoomId = String(roomId || "").trim().toUpperCase();
  if (!safeRoomId) return toast("请输入房间号");
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
    content: "请输入好友分享的房间号",
    editable: true,
    placeholderText: "例如 ABC123",
    success: res => {
      if (!res.confirm) return render();
      joinPvpRoom(res.content);
    }
  });
}

function handleLaunchRoom() {
  const api = typeof wx !== "undefined" ? wx : null;
  if (!api) return;
  const roomId = api.getLaunchOptionsSync ? api.getLaunchOptionsSync()?.query?.roomId : "";
  if (roomId) setTimeout(() => joinPvpRoom(roomId), 80);
  if (api.onShow) {
    api.onShow(options => {
      const nextRoomId = options?.query?.roomId;
      if (nextRoomId && nextRoomId !== app.pvp.roomId) joinPvpRoom(nextRoomId);
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
    app.ui.settingSelectedSlotIndex = null;
    return setScene("settings");
  }
  if (action.id === "cards") {
    app.ui.cardPage = 0;
    app.ui.cardFilterDropdown = "";
    app.ui.cardSearchActive = false;
    app.ui.keyboardHeight = 0;
    setScene("cards");
  }
  if (action.id === "history") {
    app.ui.historyPage = 0;
    app.ui.historyLeaderDetailId = "";
    setScene("history");
  }
  if (action.id === "share") shareGame();
  if (action.id === "pvp") {
    resetPvpState();
    return setScene("pvpRoom");
  }
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
  if (field === "customDeckSlot") {
    app.ui.deckPage = 0;
    switchCustomDeckSlot(settings.humanFaction, Number(value));
  }
  if (field === "aiFaction") saveSettings({ aiFaction: value, aiOpponentRemembered: true });
  if (field === "aiLeader") {
    saveSettings({ aiLeaderIds: { ...(settings.aiLeaderIds || {}), [settings.aiFaction]: value }, aiOpponentRemembered: true });
  }
  if (field === "difficulty") saveSettings({ difficulty: value });
  render();
}

function handleMatchSetup(action) {
  const selectFields = ["humanFaction", "humanLeader", "customDeckSlot", "aiFaction", "aiLeader", "difficulty"];
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
  if (action.id === "editCustomDeck") {
    app.ui.deckPage = 0;
    app.ui.deckSlotDropdown = "";
    app.ui.deckReturnScene = "matchSetup";
    return setScene("deckBuilder");
  }
  if (action.id === "startPrepared") {
    const startOptions = status.valid
      ? { mode: "ai", customDeckEnabled: true, humanCustomDeckIds: status.ids }
      : { mode: "ai", customDeckEnabled: false };
    saveSettings({ mode: "ai", customDeckEnabled: status.valid });
    return startMatch(startOptions);
  }
  if (action.id === "back") return setScene("menu");
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
  if (field === "customDeckSlot") {
    app.ui.settingDeckPage = 0;
    app.ui.settingSelectedSlotIndex = Math.max(0, Number(value) || 0);
  }
  render();
}

function toast(title) {
  if (typeof wx !== "undefined" && wx.showToast) wx.showToast({ title, icon: "none" });
}

function saveDeckSetup(slotIndex, name, idsOverride) {
  const settings = loadSettings();
  const faction = settings.humanFaction;
  const slots = getCustomDeckSlots(settings, faction);
  const safeIndex = Math.max(0, Math.min(slots.length - 1, slotIndex || 0));
  const leader = leadersFor(faction).find(card => card.id === settings.humanLeaderIds?.[faction]) || leadersFor(faction)[0];
  const ids = Array.isArray(idsOverride) ? idsOverride : slots[safeIndex].ids;
  const status = deckStatus(ids, faction);
  saveCustomDeckSlot(faction, safeIndex, status.ids, status.valid, name || slots[safeIndex].name, true);
  saveSettings({
    humanLeaderIds: leader ? { ...(settings.humanLeaderIds || {}), [faction]: leader.id } : (settings.humanLeaderIds || {}),
    customDeckEnabled: status.valid
  });
  toast(status.valid ? "已保存牌组" : "已保存，牌组未完成");
}

function promptDeckNameAndSave(slotIndex, idsOverride) {
  const settings = loadSettings();
  const faction = settings.humanFaction;
  const slots = getCustomDeckSlots(settings, faction);
  const safeIndex = Math.max(0, Math.min(slots.length - 1, slotIndex || 0));
  const currentName = slots[safeIndex].name || `牌组${safeIndex + 1}`;
  const api = typeof wx !== "undefined" ? wx : null;
  if (!api || !api.showModal) {
    saveDeckSetup(safeIndex, currentName, idsOverride);
    app.ui.settingSelectedSlotIndex = safeIndex;
    return render();
  }
  api.showModal({
    title: `保存到牌组${safeIndex + 1}`,
    content: "设置牌组名称",
    editable: true,
    placeholderText: currentName,
    success: res => {
      if (!res.confirm) return render();
      const name = String(res.content || currentName).trim().slice(0, 12) || currentName;
      saveDeckSetup(safeIndex, name, idsOverride);
      app.ui.settingSelectedSlotIndex = safeIndex;
      render();
    },
    fail: () => {
      saveDeckSetup(safeIndex, currentName, idsOverride);
      app.ui.settingSelectedSlotIndex = safeIndex;
      render();
    }
  });
}

function chooseDeckSlotAndSave(defaultSlotIndex, idsOverride) {
  const settings = loadSettings();
  const faction = settings.humanFaction;
  const slots = getCustomDeckSlots(settings, faction);
  const api = typeof wx !== "undefined" ? wx : null;
  if (!api || !api.showActionSheet) return promptDeckNameAndSave(defaultSlotIndex == null ? 0 : defaultSlotIndex, idsOverride);
  api.showActionSheet({
    itemList: slots.map((slot, index) => slotStatusLabelForAction(slot, index, faction)),
    success: res => promptDeckNameAndSave(res.tapIndex, idsOverride),
    fail: () => render()
  });
}

function slotStatusLabelForAction(slot, index, faction) {
  const status = deckStatus(slot.ids, faction);
  const name = slot.name || `牌组${index + 1}`;
  if (status.valid) return `${name}（已存 ${status.total}张）`;
  if (status.total) return `${name}（未完成 ${status.total}张）`;
  return `${name}（空）`;
}

function handleSettings(action) {
  const selectFields = ["humanLeader", "customDeckSlot"];
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
    app.ui.settingSelectedSlotIndex = null;
    saveSettings({ humanFaction: action.faction });
    return render();
  }
  if (action.id === "settingCardTab") {
    app.ui.settingCardTab = action.value || "all";
    app.ui.settingDeckPage = 0;
    return render();
  }
  if (action.id === "toggleSettingCard") {
    const settings = loadSettings();
    const faction = settings.humanFaction;
    const slots = getCustomDeckSlots(settings, faction);
    const slotIndex = app.ui.settingSelectedSlotIndex;
    if (slotIndex == null) {
      app.ui.settingDropdown = "customDeckSlot";
      return render();
    }
    const safeIndex = Math.max(0, Math.min(slots.length - 1, Number(slotIndex) || 0));
    const currentIds = slots[safeIndex].ids.slice();
    const card = cardById(action.cardId);
    if (!card) return render();
    const exists = currentIds.includes(card.id);
    let nextIds = exists ? currentIds.filter(id => id !== card.id) : currentIds;
    if (!exists) {
      const status = deckStatus(currentIds, faction);
      const isSpecial = card.category === "special" || card.category === "weather";
      if (status.total < 40 && (!isSpecial || status.specials < 10)) nextIds = currentIds.concat(card.id);
    }
    const nextStatus = deckStatus(nextIds, faction);
    saveCustomDeckSlot(faction, safeIndex, nextStatus.ids, null, slots[safeIndex].name, false);
    return render();
  }
  if (action.id === "autoCustomDeck") {
    const settings = loadSettings();
    const faction = settings.humanFaction;
    const slots = getCustomDeckSlots(settings, faction);
    const slotIndex = app.ui.settingSelectedSlotIndex;
    app.ui.settingDropdown = "";
    app.ui.settingDeckPage = 0;
    if (slotIndex == null) {
      app.ui.settingDropdown = "customDeckSlot";
      toast("请先选择牌组");
      return render();
    }
    const safeIndex = Math.max(0, Math.min(slots.length - 1, Number(slotIndex) || 0));
    saveCustomDeckSlot(faction, safeIndex, recommendedDeckIds(faction, "normal"), null, slots[safeIndex].name, false);
    toast("已推荐，可继续调整后保存");
    return render();
  }
  if (action.id === "clearCustomDeck") {
    const settings = loadSettings();
    const faction = settings.humanFaction;
    const slots = getCustomDeckSlots(settings, faction);
    const slotIndex = app.ui.settingSelectedSlotIndex;
    app.ui.settingDropdown = "";
    app.ui.settingDeckPage = 0;
    if (slotIndex == null) {
      app.ui.settingDropdown = "customDeckSlot";
      toast("请先选择牌组");
      return render();
    }
    const safeIndex = Math.max(0, Math.min(slots.length - 1, Number(slotIndex) || 0));
    saveCustomDeckSlot(faction, safeIndex, [], null, slots[safeIndex].name, false);
    return render();
  }
  if (action.id === "saveDeckSetup") {
    const settings = loadSettings();
    const faction = settings.humanFaction;
    const slots = getCustomDeckSlots(settings, faction);
    const slotIndex = app.ui.settingSelectedSlotIndex;
    const safeIndex = slotIndex == null ? null : Math.max(0, Math.min(slots.length - 1, Number(slotIndex) || 0));
    app.ui.settingDropdown = "";
    chooseDeckSlotAndSave(safeIndex, safeIndex == null ? null : slots[safeIndex].ids.slice());
    return;
  }
  if (action.id === "back") {
    app.ui.settingDropdown = "";
    return setScene("menu");
  }
  render();
}

let searchKeyboardHandlers = null;

function detachSearchKeyboardListeners() {
  const api = typeof wx !== "undefined" ? wx : null;
  if (!api || !searchKeyboardHandlers) return;
  if (api.offKeyboardInput) api.offKeyboardInput(searchKeyboardHandlers.onInput);
  if (api.offKeyboardConfirm) api.offKeyboardConfirm(searchKeyboardHandlers.onConfirm);
  if (api.offKeyboardComplete) api.offKeyboardComplete(searchKeyboardHandlers.onComplete);
  if (api.offKeyboardHeightChange) api.offKeyboardHeightChange(searchKeyboardHandlers.onHeightChange);
  searchKeyboardHandlers = null;
}

function syncSearchValue(value) {
  app.ui.cardSearchDraft = String(value || "").trim();
  app.ui.cardQuery = app.ui.cardSearchDraft;
  app.ui.cardPage = 0;
}

function closeSearchKeyboard() {
  const api = typeof wx !== "undefined" ? wx : null;
  detachSearchKeyboardListeners();
  if (api?.hideKeyboard) api.hideKeyboard();
  app.ui.cardSearchActive = false;
  app.ui.keyboardHeight = 0;
  render();
}

function openSearchKeyboard() {
  const api = typeof wx !== "undefined" ? wx : null;
  app.ui.cardSearchActive = true;
  app.ui.cardSearchDraft = app.ui.cardQuery || "";
  app.ui.keyboardHeight = 0;
  render();
  if (!api || !api.showKeyboard || !api.onKeyboardConfirm) {
    const value = typeof prompt === "function" ? prompt("搜索卡牌", app.ui.cardQuery || "") : (app.ui.cardQuery ? "" : "出使");
    if (value != null) syncSearchValue(value);
    app.ui.cardSearchActive = false;
    return render();
  }
  detachSearchKeyboardListeners();
  const onInput = event => {
    syncSearchValue(event?.value || "");
    render();
  };
  const finish = event => {
    syncSearchValue(event?.value ?? app.ui.cardSearchDraft);
    closeSearchKeyboard();
  };
  const onHeightChange = event => {
    app.ui.keyboardHeight = Math.max(0, Number(event?.height || 0));
    render();
  };
  searchKeyboardHandlers = { onInput, onConfirm: finish, onComplete: finish, onHeightChange };
  if (api.onKeyboardInput) api.onKeyboardInput(onInput);
  api.onKeyboardConfirm(finish);
  if (api.onKeyboardComplete) api.onKeyboardComplete(finish);
  if (api.onKeyboardHeightChange) api.onKeyboardHeightChange(onHeightChange);
  api.showKeyboard({ defaultValue: app.ui.cardSearchDraft || "", maxLength: 20, multiple: false, confirmHold: false, confirmType: "search" });
}

function handleCards(action) {
  if (action.id === "closeFilterDropdown") {
    app.ui.cardFilterDropdown = "";
    return render();
  }
  if (action.id === "searchCancel" || action.id === "searchDone" || action.id === "searchBackdrop") {
    return closeSearchKeyboard();
  }
  if (action.id === "searchPanel") {
    return render();
  }
  if (action.id === "searchClear") {
    syncSearchValue("");
    if (typeof wx !== "undefined" && wx.updateKeyboard) wx.updateKeyboard({ value: "" });
    return render();
  }
  if (action.id === "quickSearch") {
    syncSearchValue(action.value || "");
    if (typeof wx !== "undefined" && wx.updateKeyboard) wx.updateKeyboard({ value: app.ui.cardQuery });
    return render();
  }
  if (action.id === "selectFilterOption") {
    if (action.filterType === "faction") app.ui.cardFactionFilter = action.value || "all";
    if (action.filterType === "category") app.ui.cardCategoryFilter = action.value || "all";
    app.ui.cardFilterDropdown = "";
    app.ui.cardPage = 0;
    return render();
  }
  if (action.id === "filterFaction") {
    app.ui.cardFilterDropdown = app.ui.cardFilterDropdown === "faction" ? "" : "faction";
    return render();
  }
  if (action.id === "filterCategory") {
    app.ui.cardFilterDropdown = app.ui.cardFilterDropdown === "category" ? "" : "category";
    return render();
  }
  if (action.id === "search") {
    app.ui.cardFilterDropdown = "";
    return openSearchKeyboard();
  }
  if (action.id === "clearSearch") {
    app.ui.cardFactionFilter = "all";
    app.ui.cardCategoryFilter = "all";
    app.ui.cardFilterDropdown = "";
    app.ui.cardQuery = "";
    app.ui.cardSearchDraft = "";
    app.ui.cardSearchActive = false;
    app.ui.keyboardHeight = 0;
    detachSearchKeyboardListeners();
    if (typeof wx !== "undefined" && wx.hideKeyboard) wx.hideKeyboard();
    app.ui.cardPage = 0;
  }
  if (action.id === "cardDetail") {
    app.ui.cardFilterDropdown = "";
    app.ui.cardSearchActive = false;
    app.ui.keyboardHeight = 0;
    detachSearchKeyboardListeners();
    if (typeof wx !== "undefined" && wx.hideKeyboard) wx.hideKeyboard();
    app.ui.cardDetailId = action.cardId || "";
  }
  if (action.id === "detailPanel") return;
  if (action.id === "closeDetail") app.ui.cardDetailId = "";
  if (action.id === "back") {
    app.ui.cardDetailId = "";
    app.ui.cardFilterDropdown = "";
    return setScene("menu");
  }
  render();
}

function saveCustomDeckSlot(faction, slotIndex, ids, enabled, name, activate = true) {
  const settings = loadSettings();
  const slots = getCustomDeckSlots(settings, faction);
  const safeIndex = Math.max(0, Math.min(slots.length - 1, slotIndex || 0));
  const nextIds = Array.isArray(ids) ? ids.slice(0, 40) : [];
  slots[safeIndex] = { ...slots[safeIndex], ids: nextIds, name: String(name || slots[safeIndex].name || `牌组${safeIndex + 1}`).slice(0, 12) };
  const nextSlots = { ...(settings.customDeckSlots || {}), [faction]: slots };
  const patch = { customDeckSlots: nextSlots };
  if (activate) {
    patch.activeCustomDeckSlot = { ...(settings.activeCustomDeckSlot || {}), [faction]: safeIndex };
    patch.customDecks = { ...(settings.customDecks || {}), [faction]: nextIds };
  }
  if (enabled != null) patch.customDeckEnabled = enabled;
  saveSettings(patch);
}

function switchCustomDeckSlot(faction, slotIndex) {
  const settings = loadSettings();
  const slots = getCustomDeckSlots(settings, faction);
  const safeIndex = Math.max(0, Math.min(slots.length - 1, slotIndex || 0));
  const ids = slots[safeIndex].ids;
  const status = deckStatus(ids, faction);
  saveSettings({
    activeCustomDeckSlot: { ...(settings.activeCustomDeckSlot || {}), [faction]: safeIndex },
    customDecks: { ...(settings.customDecks || {}), [faction]: ids },
    customDeckEnabled: settings.customDeckEnabled && status.valid
  });
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
  if (action.id === "closeDeckSlotDropdown") {
    app.ui.deckSlotDropdown = "";
    return render();
  }
  if (action.id === "selectDeckSlotOption") {
    app.ui.deckSlotDropdown = "";
    app.ui.deckPage = 0;
    switchCustomDeckSlot(faction, action.slotIndex);
    return render();
  }
  if (action.id === "customDeckSlot") {
    app.ui.deckSlotDropdown = app.ui.deckSlotDropdown === "slot" ? "" : "slot";
    return render();
  }

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
  if (action.id === "toggleCustomCard") {
    const card = cardById(action.cardId);
    if (!card) return render();
    const exists = currentIds.includes(card.id);
    let nextIds = exists ? currentIds.filter(id => id !== card.id) : currentIds;
    if (!exists) {
      const status = deckStatus(currentIds, faction);
      const isSpecial = card.category === "special" || card.category === "weather";
      if (status.total < 40 && (!isSpecial || status.specials < 10)) nextIds = currentIds.concat(card.id);
    }
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
  if (action.id === "pvpShare") return shareGame();
  if (action.id === "pvpCopy") {
    if (pvpClient.copyRoomId(app.pvp.roomId)) toast("房间号已复制");
    else toast(app.pvp.roomId || "暂无房间号");
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
  if (action.id === "battleCardDetail") {
    app.ui.battleCardDetailId = action.cardId || "";
    return render();
  }
  if (action.id === "detailPanel") return;
  if (action.id === "closeDetail") {
    app.ui.battleCardDetailId = "";
    return render();
  }
  if (app.ui.battleCardDetailId) return render();
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
  if (app.scene === "pvpRoom") return handlePvpRoom(action);
  if (app.scene === "matchSetup") return handleMatchSetup(action);
  if (app.scene === "rules") return action.id === "back" ? setScene("menu") : null;
  if (app.scene === "settings") return handleSettings(action);
  if (app.scene === "cards") return handleCards(action);
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

function handleHandSwipe(start, end) {
  if (!start || !end || app.scene !== "battle" || !app.match || app.match.over || app.ui.battleCardDetailId) return false;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (Math.abs(dx) < 42 || Math.abs(dx) < Math.abs(dy) * 1.2) return false;
  const handTop = view.height - view.safeBottom - 210;
  const handBottom = view.height - view.safeBottom - 78;
  if (start.y < handTop || start.y > handBottom) return false;
  const nextPage = clampHandPage(app.ui.handPage + (dx < 0 ? 1 : -1));
  if (nextPage !== app.ui.handPage) {
    app.ui.handPage = nextPage;
    render();
  }
  return true;
}

function handleCardsSwipe(start, end) {
  if (!start || !end || app.scene !== "cards" || app.ui.cardDetailId || app.ui.cardFilterDropdown || app.ui.cardSearchActive) return false;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  const listTop = view.safeTop + 26 + 34 + 92;
  const listBottom = view.height - view.safeBottom - 82;
  if (start.y < listTop || start.y > listBottom || absY < 42 || absY < absX * 1.2) return false;
  const nextPage = cardsScene.clampPage(view, app.ui, (app.ui.cardPage || 0) + (dy < 0 ? 1 : -1));
  if (nextPage !== app.ui.cardPage) {
    app.ui.cardPage = nextPage;
    render();
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
    render();
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
    render();
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
    render();
  }
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

function startLongPress(point) {
  const action = findAction(point);
  if (!action || !action.cardId) return;
  let openDetail = null;
  if (app.scene === "battle" && app.match && !app.ui.battleCardDetailId && ["card", "battleCardDetail", "leaderAvatar"].includes(action.id)) {
    openDetail = openBattleCardDetail;
  }
  if (app.scene === "history" && !app.ui.historyLeaderDetailId && action.id === "historyLeader") {
    openDetail = openHistoryLeaderDetail;
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
    if (!touchStartState || !touchStartState.longPressTimer) return;
    const point = normalizeTouch(event);
    if (!point) return;
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
    if (handleHandSwipe(start, point)) return;
    if (handleCardsSwipe(start, point)) return;
    if (handleHistorySwipe(start, point)) return;
    if (handleSettingsSwipe(start, point)) return;
    if (handleDeckBuilderSwipe(start, point)) return;
    if (Math.hypot(point.x - start.x, point.y - start.y) <= 20) handleTap(point);
  });
}

if (typeof wx !== "undefined" && wx.onTouchCancel) {
  wx.onTouchCancel(() => {
    clearLongPress();
    touchStartState = null;
  });
}

pvpClient.initCloud();
setupShare();
handleLaunchRoom();
render();
