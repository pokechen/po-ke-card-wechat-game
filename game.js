const { createCanvasAdapter, hit, setImageRenderHook } = require("./js/ui/canvas");
const menuScene = require("./js/scenes/menu");
const rulesScene = require("./js/scenes/rules");
const settingsScene = require("./js/scenes/settings");
const cardsScene = require("./js/scenes/cardsBrowser");
const deckBuilderScene = require("./js/scenes/deckBuilder");
const historyScene = require("./js/scenes/history");
const battleScene = require("./js/scenes/battleScene");
const resultScene = require("./js/scenes/result");
const { loadSave, loadSettings, saveSettings, saveProgress, clearHistory, getCustomDeckSlots, getActiveCustomDeckSlotIndex, getActiveCustomDeckIds } = require("./js/core/storage");
const { cardById, deckStatus, recommendedDeckIds } = require("./js/core/cards");
const { createMatch, playCard, autoPlayHuman, pass, useLeader, mulliganSwap, finishMulligan, aiStep, resolvePending, cancelPending, surrender } = require("./js/core/battle");

const view = createCanvasAdapter();
const ctx = view.ctx;
const app = {
  scene: "menu",
  actions: [],
  match: null,
  aiTimer: null,
  ui: {
    handPage: 0,
    cardPage: 0,
    deckPage: 0,
    cardFactionFilter: "all",
    cardCategoryFilter: "all",
    cardQuery: "",
    cardDetailId: "",
    showCardGuide: false
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

function startMatch() {
  clearAiTimer();
  app.ui.handPage = 0;
  const settings = loadSettings();
  app.match = createMatch(settings);
  app.ui.showCardGuide = !loadSave().finishedTutorial;
  setScene("battle");
}

function render() {
  app.actions = [];
  if (app.scene === "menu") menuScene.draw(ctx, view, app.actions);
  if (app.scene === "rules") rulesScene.draw(ctx, view, app.actions);
  if (app.scene === "settings") settingsScene.draw(ctx, view, app.actions);
  if (app.scene === "cards") cardsScene.draw(ctx, view, app.actions, app.ui);
  if (app.scene === "deckBuilder") deckBuilderScene.draw(ctx, view, app.actions, app.ui);
  if (app.scene === "history") historyScene.draw(ctx, view, app.actions);
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

function clampHandPage(page) {
  if (!app.match) return 0;
  const current = app.match.players[app.match.current] || app.match.players[0];
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
  if (action.id === "start") startMatch();
  if (action.id === "settings") setScene("settings");
  if (action.id === "cards") { app.ui.cardPage = 0; setScene("cards"); }
  if (action.id === "history") setScene("history");
  if (action.id === "rules") setScene("rules");
}

function handleSettings(action) {
  const settings = loadSettings();
  if (action.id === "mode") saveSettings({ mode: settings.mode === "hotseat" ? "ai" : "hotseat" });
  if (action.id === "humanFaction") {
    app.ui.deckPage = 0;
    saveSettings({ humanFaction: settingsScene.nextFaction(settings.humanFaction) });
  }
  if (action.id === "humanLeader") {
    saveSettings({ humanLeaderIds: { ...(settings.humanLeaderIds || {}), [settings.humanFaction]: settingsScene.nextLeaderId(settings.humanLeaderIds?.[settings.humanFaction], settings.humanFaction) } });
  }
  if (action.id === "aiFaction") saveSettings({ aiFaction: settingsScene.nextFaction(settings.aiFaction) });
  if (action.id === "aiLeader") {
    saveSettings({ aiLeaderIds: { ...(settings.aiLeaderIds || {}), [settings.aiFaction]: settingsScene.nextLeaderId(settings.aiLeaderIds?.[settings.aiFaction], settings.aiFaction) } });
  }
  if (action.id === "difficulty") saveSettings({ difficulty: settingsScene.nextDifficulty(settings.difficulty) });
  if (action.id === "customDeckEnabled") {
    const selectedIds = getActiveCustomDeckIds(settings, settings.humanFaction);
    const status = deckStatus(selectedIds, settings.humanFaction);
    if (!settings.customDeckEnabled && !status.valid) {
      app.ui.deckPage = 0;
      return setScene("deckBuilder");
    }
    saveSettings({ customDeckEnabled: !settings.customDeckEnabled });
  }
  if (action.id === "editCustomDeck") {
    app.ui.deckPage = 0;
    return setScene("deckBuilder");
  }
  if (action.id === "back") return setScene("menu");
  render();
}

function openSearchKeyboard() {
  const api = typeof wx !== "undefined" ? wx : null;
  if (!api || !api.showKeyboard || !api.onKeyboardConfirm) {
    app.ui.cardQuery = app.ui.cardQuery ? "" : "出使";
    app.ui.cardPage = 0;
    return render();
  }
  const onConfirm = event => {
    if (api.offKeyboardConfirm) api.offKeyboardConfirm(onConfirm);
    app.ui.cardQuery = String(event.value || "").trim();
    app.ui.cardPage = 0;
    render();
  };
  api.onKeyboardConfirm(onConfirm);
  api.showKeyboard({ defaultValue: app.ui.cardQuery || "", maxLength: 20, multiple: false, confirmHold: false, confirmType: "search" });
}

function handleCards(action) {
  if (action.id === "prev") app.ui.cardPage = Math.max(0, app.ui.cardPage - 1);
  if (action.id === "next") app.ui.cardPage += 1;
  if (action.id === "filterFaction") { app.ui.cardFactionFilter = cardsScene.nextFactionFilter(app.ui.cardFactionFilter); app.ui.cardPage = 0; }
  if (action.id === "filterCategory") { app.ui.cardCategoryFilter = cardsScene.nextCategoryFilter(app.ui.cardCategoryFilter); app.ui.cardPage = 0; }
  if (action.id === "search") return openSearchKeyboard();
  if (action.id === "clearSearch") {
    app.ui.cardFactionFilter = "all";
    app.ui.cardCategoryFilter = "all";
    app.ui.cardQuery = "";
    app.ui.cardPage = 0;
  }
  if (action.id === "cardDetail") app.ui.cardDetailId = action.cardId || "";
  if (action.id === "closeDetail") app.ui.cardDetailId = "";
  if (action.id === "back") {
    app.ui.cardDetailId = "";
    return setScene("menu");
  }
  render();
}

function saveCustomDeckSlot(faction, slotIndex, ids, enabled) {
  const settings = loadSettings();
  const slots = getCustomDeckSlots(settings, faction);
  const safeIndex = Math.max(0, Math.min(slots.length - 1, slotIndex || 0));
  slots[safeIndex] = { ...slots[safeIndex], ids };
  const nextSlots = { ...(settings.customDeckSlots || {}), [faction]: slots };
  const nextActive = { ...(settings.activeCustomDeckSlot || {}), [faction]: safeIndex };
  const nextDecks = { ...(settings.customDecks || {}), [faction]: ids };
  const patch = { customDeckSlots: nextSlots, activeCustomDeckSlot: nextActive, customDecks: nextDecks };
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
  if (action.id === "deckPrev") app.ui.deckPage = Math.max(0, app.ui.deckPage - 1);
  if (action.id === "deckNext") app.ui.deckPage += 1;
  if (action.id === "backSettings") return setScene("settings");
  if (action.id === "customDeckSlot") {
    app.ui.deckPage = 0;
    switchCustomDeckSlot(faction, action.slotIndex);
  }
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
  if (action.id === "clear") clearHistory();
  if (action.id === "back") return setScene("menu");
  render();
}

function handleBattle(action) {
  if (action.id === "closeCardGuide") {
    app.ui.showCardGuide = false;
    saveProgress({ finishedTutorial: true });
    return render();
  }
  if (!app.match) return;
  if (action.id === "home") {
    if (!app.match.over) {
      surrender(app.match, app.match.current);
      return setScene("result");
    }
    return setScene("menu");
  }
  if (app.match.over) return;
  if (action.id === "handPrev") { app.ui.handPage = clampHandPage(app.ui.handPage - 1); return render(); }
  if (action.id === "handNext") { app.ui.handPage = clampHandPage(app.ui.handPage + 1); return render(); }
  if (app.match.pending) {
    if (action.id === "rowChoice") resolvePending(app.match, { row: action.row });
    else if (action.id === "targetChoice") resolvePending(app.match, { uid: action.cardUid });
    else if (action.id === "pendingSkip") resolvePending(app.match, { skip: true });
    else if (action.id === "pendingCancel") cancelPending(app.match);
    return afterHumanAction();
  }
  if (app.match.mode === "ai" && app.match.current !== 0) return;
  if (app.match.mulligan?.active) {
    if (action.id === "card") { mulliganSwap(app.match, action.cardUid); app.ui.handPage = 0; return render(); }
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
  if (app.scene === "rules") return action.id === "back" ? setScene("menu") : null;
  if (app.scene === "settings") return handleSettings(action);
  if (app.scene === "cards") return handleCards(action);
  if (app.scene === "deckBuilder") return handleDeckBuilder(action);
  if (app.scene === "history") return handleHistory(action);
  if (app.scene === "battle") return handleBattle(action);
  if (app.scene === "result") {
    if (action.id === "restart") startMatch();
    if (action.id === "home") setScene("menu");
  }
}

function normalizeTouch(event) {
  const touch = event.changedTouches && event.changedTouches[0]
    ? event.changedTouches[0]
    : (event.touches && event.touches[0] ? event.touches[0] : null);
  return touch ? { x: touch.clientX, y: touch.clientY } : null;
}

if (typeof wx !== "undefined" && wx.onTouchStart) {
  wx.onTouchStart(event => {
    const point = normalizeTouch(event);
    if (!point) return;
    const action = app.actions.find(item => hit(point, item));
    if (action) handleAction(action);
  });
}

render();
