const SAVE_KEY = "zhangyu.wechat.demo.save.v2";
const SETTINGS_KEY = "zhangyu.wechat.demo.settings.v2";
const MAX_CUSTOM_DECKS = 1;
const MAX_HISTORY_RECORDS = 1000;

let recordMatchCloudHook = null;

const DEFAULT_SAVE = {
  finishedTutorial: false,
  // 新手指引分步进度：done 表示用户已操作完成，count 表示已提醒次数（上限见 MAX_GUIDE_REMIND）
  // leaderSkill 需「长按查看」+「使用技能」两者都完成才算 done，故额外记录 longPressed / usedSkill
  guides: {
    cardDetail: { done: false, count: 0 },
    leaderSkill: { done: false, count: 0, longPressed: false, usedSkill: false },
    battleRecord: { done: false, count: 0 },
    fieldCardDetail: { done: false, count: 0 },
    discardPile: { done: false, count: 0 }
  },
  // 分步指引在当前对局序列中的游标，保证「每轮对局最多一个、按序触发、未完成的再触发」
  guideCursor: 0,
  // 只允许保存离线/上传失败的待同步战绩；云端已存在的战绩以 match_history 为准
  pendingHistory: []
};

// 把存档中的 guides 归一化成完整结构，兼容旧版本缺失字段
function normalizeGuides(raw) {
  const def = DEFAULT_SAVE.guides;
  const src = (raw && raw.guides) || {};
  const out = {};
  Object.keys(def).forEach((key) => {
    const item = src[key] || {};
    out[key] = {
      done: !!item.done,
      count: Number.isFinite(item.count) ? item.count : 0
    };
    if (key === "leaderSkill") {
      out[key].longPressed = !!item.longPressed;
      out[key].usedSkill = !!item.usedSkill;
    }
  });
  return out;
}

const DEFAULT_SETTINGS = {
  mode: "ai",
  mode: "ai",
  humanFaction: "开国群雄",
  humanLineupMode: "selected",
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
  pvpFaction: "开国群雄",
  pvpLeaderIds: {},
  pvpDeckMode: "random",
  pvpRuleFactionMode: "any",
  pvpRuleFaction: "开国群雄",
  pvpRuleDeckMode: "any",
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

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function compactRecordKeyText(value) {
  return String(value == null ? "" : value).replace(/\s+/g, "").slice(0, 120);
}

function matchRecordKey(result = {}, index = 0) {
  if (result.recordKey) return String(result.recordKey).slice(0, 160);
  const rounds = safeArray(result.roundResults)
    .map(item => `${item?.round || 0}:${safeArray(item?.scores).join("-")}:${item?.winner == null ? "draw" : item.winner}`)
    .join("|");
  return compactRecordKeyText([
    result.mode || "local",
    result.roomId || "",
    result.matchId || "",
    result.time || Date.now(),
    result.endReason || "normal",
    safeArray(result.rounds).join("-"),
    safeArray(result.scores).join("-"),
    rounds,
    index
  ].join(":"));
}

function normalizeMatchRecord(result = {}, index = 0) {
  const time = Number(result.time || Date.now()) || Date.now();
  return {
    ...result,
    time,
    recordKey: matchRecordKey({ ...result, time }, index),
    syncState: result.syncState === "synced" ? "synced" : "pending"
  };
}

function uniqueHistory(records = []) {
  const seen = new Set();
  const result = [];
  safeArray(records).forEach((item, index) => {
    if (!item || typeof item !== "object") return;
    const record = normalizeMatchRecord(item, index);
    const key = record.recordKey;
    if (seen.has(key)) return;
    seen.add(key);
    result.push(record);
  });
  return result.sort((a, b) => (b.time || 0) - (a.time || 0)).slice(0, MAX_HISTORY_RECORDS);
}

function summaryFromHistory(history, current = {}) {
  const list = uniqueHistory(history);
  return {
    ...current,
    matches: list.length,
    wins: list.filter(item => item.winner === 0).length,
    losses: list.filter(item => item.winner === 1).length,
    draws: list.filter(item => item.winner == null).length,
    lastResult: list[0]?.resultText || "",
    history: list
  };
}

function pendingOnly(records = []) {
  return uniqueHistory(safeArray(records).filter(item => item && item.syncState !== "synced"));
}

function loadSave() {
  const save = getStorage(SAVE_KEY, DEFAULT_SAVE);
  // 兼容旧版本：旧 save.history 只迁移未同步记录，已同步/云端记录不再作为本地数据源。
  const pendingHistory = pendingOnly([].concat(save.pendingHistory || [], save.history || []));
  const guides = normalizeGuides(save);
  const guideCursor = Number.isFinite(save.guideCursor) ? save.guideCursor : 0;
  const normalized = {
    finishedTutorial: !!save.finishedTutorial,
    guides,
    guideCursor,
    pendingHistory
  };
  // 清理旧版本地战绩/统计字段，避免同一份云端战绩同时存在本地与数据库。
  if (save.history || save.matches || save.wins || save.losses || save.draws || save.lastResult) setStorage(SAVE_KEY, normalized);
  return {
    ...DEFAULT_SAVE,
    ...normalized,
    // 兼容旧调用：history 仅代表待同步队列，不代表完整战绩。
    history: pendingHistory,
    matches: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    lastResult: ""
  };
}

function saveProgress(patch = {}) {
  const current = loadSave();
  return setStorage(SAVE_KEY, {
    finishedTutorial: patch.finishedTutorial == null ? current.finishedTutorial : !!patch.finishedTutorial,
    guides: patch.guides == null ? current.guides : patch.guides,
    guideCursor: patch.guideCursor == null ? current.guideCursor : patch.guideCursor,
    pendingHistory: current.pendingHistory
  });
}

function replaceMatchHistory(history) {
  const current = loadSave();
  return setStorage(SAVE_KEY, {
    finishedTutorial: current.finishedTutorial,
    guides: current.guides,
    guideCursor: current.guideCursor,
    pendingHistory: pendingOnly(history)
  });
}

function mergeMatchHistory() {
  // 云端战绩不再合并到本地缓存；展示层应使用 match_history 接口返回的数据。
  return true;
}

function localMatchRecords() {
  return loadSave().pendingHistory.slice();
}

function clearLocalMatchHistory() {
  return replaceMatchHistory([]);
}

function updateMatchRecord(recordKey, patch) {
  if (!recordKey) return false;
  const current = loadSave();
  const history = current.pendingHistory.map(item => item.recordKey === recordKey ? { ...item, ...patch } : item);
  return replaceMatchHistory(history);
}

function removeLocalMatchRecord(recordKey) {
  if (!recordKey) return false;
  const current = loadSave();
  const history = current.pendingHistory.filter(item => item.recordKey !== recordKey);
  return replaceMatchHistory(history);
}

function pendingMatchRecords() {
  return loadSave().pendingHistory.slice();
}

function setRecordMatchCloudHook(hook) {
  recordMatchCloudHook = typeof hook === "function" ? hook : null;
}

function recordMatch(result) {
  const current = loadSave();
  const record = normalizeMatchRecord(result, current.pendingHistory.length);
  const pendingHistory = pendingOnly([record].concat(current.pendingHistory || []));
  const saved = setStorage(SAVE_KEY, {
    finishedTutorial: current.finishedTutorial,
    guides: current.guides,
    guideCursor: current.guideCursor,
    pendingHistory
  });
  if (recordMatchCloudHook) {
    Promise.resolve(recordMatchCloudHook(record)).catch(err => {
      console.error("[storage] recordMatchCloudHook error:", err?.message || err);
    });
  }
  return saved;
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
  next.humanLineupMode = next.humanLineupMode === "random" ? "random" : "selected";
  next.humanFaction = next.humanFaction || "开国群雄";
  next.aiFaction = next.aiFaction === "random" ? "random" : (next.aiFaction || "草莽星火");
  next.customDeckEnabled = !!next.customDeckEnabled;
  next.customDecks = { ...safeObject(next.customDecks) };
  next.customDeckSlots = { ...safeObject(next.customDeckSlots) };
  next.activeCustomDeckSlot = { ...safeObject(next.activeCustomDeckSlot) };
  next.humanLeaderIds = { ...safeObject(next.humanLeaderIds) };
  next.aiLeaderIds = { ...safeObject(next.aiLeaderIds) };
  next.pvpLeaderIds = { ...safeObject(next.pvpLeaderIds) };
  next.pvpFaction = next.pvpFaction === "random" ? "random" : (next.pvpFaction || next.humanFaction);
  next.pvpDeckMode = next.pvpDeckMode === "custom" ? "custom" : "random";
  next.pvpRuleFactionMode = ["fixed", "random"].includes(next.pvpRuleFactionMode) ? next.pvpRuleFactionMode : "any";
  next.pvpRuleFaction = next.pvpRuleFaction || next.pvpFaction || next.humanFaction;
  next.pvpRuleDeckMode = next.pvpRuleDeckMode === "autoOnly" ? "autoOnly" : "any";
  next.aiOpponentRemembered = !!next.aiOpponentRemembered;
  if (!next.aiOpponentRemembered && next.aiFaction === "草莽星火" && !next.aiLeaderId && !Object.keys(next.aiLeaderIds).length) {
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
  replaceMatchHistory,
  mergeMatchHistory,
  localMatchRecords,
  clearLocalMatchHistory,
  updateMatchRecord,
  removeLocalMatchRecord,
  pendingMatchRecords,
  setRecordMatchCloudHook,
  recordMatch,
  loadSettings,
  saveSettings,
  getCustomDeckSlots,
  getActiveCustomDeckSlotIndex,
  getActiveCustomDeckIds
};
