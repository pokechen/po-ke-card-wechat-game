const SAVE_KEY = "zhangyu.wechat.demo.save.v2";
const SETTINGS_KEY = "zhangyu.wechat.demo.settings.v2";
const MAX_CUSTOM_DECKS = 1;

const DEFAULT_SAVE = {
  finishedTutorial: false,
  matches: 0,
  wins: 0,
  losses: 0,
  draws: 0,
  lastResult: "",
  history: []
};

const DEFAULT_SETTINGS = {
  mode: "ai",
  mode: "ai",
  humanFaction: "Northern Realms",
  aiFaction: "random",
  humanLeaderId: "",
  aiLeaderId: "",
  difficulty: "normal",
  sound: false,
  vibration: true,
  customDeckEnabled: false,
  customDecks: {},
  customDeckSlots: {},
  activeCustomDeckSlot: {},
  humanLeaderIds: {},
  aiLeaderIds: {},
  pvpFaction: "Northern Realms",
  pvpLeaderIds: {},
  pvpDeckMode: "random",
  aiOpponentRemembered: false
};

function safeWx() {
  return typeof wx !== "undefined" ? wx : null;
}

function getStorage(key, fallback) {
  const api = safeWx();
  if (!api || !api.getStorageSync) return { ...fallback };
  try {
    const value = api.getStorageSync(key);
    return value ? { ...fallback, ...value } : { ...fallback };
  } catch (err) {
    return { ...fallback };
  }
}

function setStorage(key, value) {
  const api = safeWx();
  if (!api || !api.setStorageSync) return false;
  try {
    api.setStorageSync(key, value);
    return true;
  } catch (err) {
    return false;
  }
}

function loadSave() {
  const save = getStorage(SAVE_KEY, DEFAULT_SAVE);
  save.finishedTutorial = !!save.finishedTutorial;
  save.history = Array.isArray(save.history) ? save.history : [];
  return save;
}

function saveProgress(patch) {
  const current = loadSave();
  return setStorage(SAVE_KEY, { ...current, ...patch });
}

function recordMatch(result) {
  const current = loadSave();
  const history = [result].concat(current.history || []).slice(0, 30);
  const isWin = result.winner === 0;
  const isLoss = result.winner === 1;
  const isDraw = result.winner == null;
  return saveProgress({
    matches: (current.matches || 0) + 1,
    wins: (current.wins || 0) + (isWin ? 1 : 0),
    losses: (current.losses || 0) + (isLoss ? 1 : 0),
    draws: (current.draws || 0) + (isDraw ? 1 : 0),
    lastResult: result.resultText || "",
    history
  });
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function makeDeckSlot(slot, index) {
  const source = Array.isArray(slot) ? { ids: slot } : safeObject(slot);
  return {
    name: "自定义牌组",
    ids: Array.isArray(source.ids) ? source.ids.slice(0, 40) : []
  };
}

function getCustomDeckSlots(settings, faction) {
  const slotsByFaction = safeObject(settings && settings.customDeckSlots);
  const legacyDecks = safeObject(settings && settings.customDecks);
  const source = Array.isArray(slotsByFaction[faction]) ? slotsByFaction[faction] : [];
  const slots = [];
  for (let i = 0; i < MAX_CUSTOM_DECKS; i++) {
    slots.push(makeDeckSlot(source[i], i));
  }
  if (!source.length && Array.isArray(legacyDecks[faction])) {
    slots[0] = makeDeckSlot({ name: "自定义牌组", ids: legacyDecks[faction] }, 0);
  }
  return slots;
}

function getActiveCustomDeckSlotIndex(settings, faction) {
  const active = safeObject(settings && settings.activeCustomDeckSlot);
  const index = Number(active[faction] || 0);
  return Number.isFinite(index) ? Math.max(0, Math.min(MAX_CUSTOM_DECKS - 1, index)) : 0;
}

function getActiveCustomDeckIds(settings, faction) {
  const slots = getCustomDeckSlots(settings, faction);
  return slots[getActiveCustomDeckSlotIndex(settings, faction)].ids;
}

function normalizeSettings(settings) {
  const next = { ...DEFAULT_SETTINGS, ...settings };
  next.mode = next.mode === "hotseat" ? "hotseat" : "ai";
  next.customDeckEnabled = !!next.customDeckEnabled;
  next.customDecks = { ...safeObject(next.customDecks) };
  next.customDeckSlots = { ...safeObject(next.customDeckSlots) };
  next.activeCustomDeckSlot = { ...safeObject(next.activeCustomDeckSlot) };
  next.humanLeaderIds = { ...safeObject(next.humanLeaderIds) };
  next.aiLeaderIds = { ...safeObject(next.aiLeaderIds) };
  next.pvpLeaderIds = { ...safeObject(next.pvpLeaderIds) };
  next.pvpFaction = next.pvpFaction || next.humanFaction;
  next.pvpDeckMode = next.pvpDeckMode === "custom" ? "custom" : "random";
  next.aiOpponentRemembered = !!next.aiOpponentRemembered;
  if (!next.aiOpponentRemembered && next.aiFaction === "Monsters" && !next.aiLeaderId && !Object.keys(next.aiLeaderIds).length) {
    next.aiFaction = "random";
  }
  const factions = Object.keys({ ...next.customDecks, ...next.customDeckSlots, [next.humanFaction]: true });
  factions.forEach(faction => {
    next.customDeckSlots[faction] = getCustomDeckSlots(next, faction);
    const active = getActiveCustomDeckSlotIndex(next, faction);
    next.activeCustomDeckSlot[faction] = active;
    next.customDecks[faction] = next.customDeckSlots[faction][active].ids;
  });
  return next;
}

function loadSettings() {
  return normalizeSettings(getStorage(SETTINGS_KEY, DEFAULT_SETTINGS));
}

function saveSettings(patch) {
  const current = loadSettings();
  return setStorage(SETTINGS_KEY, { ...current, ...patch });
}

module.exports = {
  DEFAULT_SETTINGS,
  MAX_CUSTOM_DECKS,
  loadSave,
  saveProgress,
  recordMatch,
  loadSettings,
  saveSettings,
  getCustomDeckSlots,
  getActiveCustomDeckSlotIndex,
  getActiveCustomDeckIds
};
