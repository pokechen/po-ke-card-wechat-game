const cloud = require("wx-server-sdk");
const crypto = require("crypto");
const https = require("https");
let redisModule = null;
try { redisModule = require("redis"); } catch (err) {}
const battle = require("./js/core/battle");
const rankCore = require("./js/core/rank");
const { FACTION_KEYS, FACTION_LABELS, cardById, displayName, deckStatus } = require("./js/core/cards");
const { buildAdminStats, dayKey } = require("./shared/core/adminStats");
const {
  applyReady,
  applyRuleChange,
  cleanPlayers,
  emptyReadyPlayers,
  normalizedReadyPlayers
} = require("./readyState");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
const ROOMS = "game_rooms";
const USERS = "users";
const USER_TOKENS = "user_tokens";
const MATCH_HISTORY = "match_history";
const DAILY_USER_ACTIVITY = "daily_user_activity";
const RANK_PROFILES = "rank_profiles";
const RANK_MATCHES = "rank_matches";
const ROOM_TTL_MS = 2 * 60 * 60 * 1000;
const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;
const TOKEN_TTL_MS = TOKEN_TTL_SECONDS * 1000;
const PLAYER_HEARTBEAT_TIMEOUT_MS = 5 * 60 * 1000;
const MATCH_HISTORY_LIMIT = 20;
const PVP_READY_DEBUG_VERSION = "20260803-ready-atomic-v2";

let redisClientPromise = null;
let redisUnavailableLogged = false;

function ok(data = {}) {
  return { ok: true, ...data };
}

function fail(message, code = "BAD_REQUEST") {
  return { ok: false, code, message };
}

function roomActionError(message, code) {
  const error = new Error(message);
  error.code = code;
  error.isRoomActionError = true;
  return error;
}

function roomActionFailure(error) {
  return error?.isRoomActionError ? fail(error.message, error.code) : null;
}

async function runRoomTransaction(work, maxAttempts = 3) {
  let lastError = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await db.runTransaction(work);
    } catch (error) {
      lastError = error;
      if (error?.isRoomActionError || attempt === maxAttempts - 1) throw error;
      await wait(30 * (attempt + 1) + Math.floor(Math.random() * 25));
    }
  }
  throw lastError;
}

function now() {
  return Date.now();
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function randomToken() {
  return crypto.randomBytes(32).toString("hex");
}

function sha1(value) {
  return crypto.createHash("sha1").update(String(value || "")).digest("hex");
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function safeText(value, max = 80) {
  return String(value == null ? "" : value).slice(0, max);
}

function safeNumber(value, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

// 自修复：云函数首次使用时确保所需集合存在，避免手动建表
const REQUIRED_COLLECTIONS = [
  ROOMS,
  USERS,
  USER_TOKENS,
  MATCH_HISTORY,
  DAILY_USER_ACTIVITY,
  RANK_PROFILES,
  RANK_MATCHES
];
let collectionsEnsured = false;
async function ensureCollections() {
  if (collectionsEnsured) return;
  collectionsEnsured = true;
  await Promise.all(REQUIRED_COLLECTIONS.map(name =>
    Promise.resolve()
      .then(() => db.createCollection(name))
      .then(() => console.log("[pvpRoom] created collection:", name))
      .catch(err => {
        const msg = String(err && err.message ? err.message : err);
        // 集合已存在是正常情况，忽略；其他错误记录告警
        if (msg.indexOf("already exist") === -1 && msg.indexOf("already exists") === -1) {
          console.warn("[pvpRoom] ensureCollection skip", name, msg);
        }
      })
  ));
}

// 接口频控：云函数走公开 HTTP，必须限制单位时间调用次数，
// 避免被刷 login（消耗微信接口配额）、穷举4 位房间号、刷内容安全检测配额。
// 有 Redis 时用 Redis 计数（跨实例准确），否则退化为进程内计数（单实例内有效）。
const RATE_LIMIT_RULES = {
  login: { limit: 30, windowMs: 60000 },
  createRoom: { limit: 20, windowMs: 60000 },
  joinRoom: { limit: 12, windowMs: 60000 },
  generateRoomCode: { limit: 12, windowMs: 60000 },
  uploadAvatar: { limit: 6, windowMs: 60000 },
  updateProfile: { limit: 12, windowMs: 60000 },
  getAdminStats: { limit: 12, windowMs: 60000 },
  // 房间轮询 1.5s 一次（约 40 次/分钟），默认额度需要给足余量
  default: { limit: 240, windowMs: 60000 }
};
const memoryRateBuckets = new Map();

function memoryRateHit(key, windowMs) {
  const time = now();
  if (memoryRateBuckets.size > 5000) {
    for (const [bucketKey, bucket] of memoryRateBuckets) {
      if (bucket.resetAt <= time) memoryRateBuckets.delete(bucketKey);
    }
  }
  const bucket = memoryRateBuckets.get(key);
  if (!bucket || bucket.resetAt <= time) {
    memoryRateBuckets.set(key, { count: 1, resetAt: time + windowMs });
    return 1;
  }
  bucket.count += 1;
  return bucket.count;
}

async function rateHit(key, windowMs) {
  const client = await getRedisClient();
  if (client) {
    try {
      const count = Number(await client.incr(key));
      if (count === 1) await client.pExpire(key, windowMs);
      return count;
    } catch (err) {
      console.warn("[rate] Redis 计数失败，回退到进程内计数:", err?.message || err);
    }
  }
  return memoryRateHit(key, windowMs);
}

// 超出额度返回 true，由调用方直接拒绝请求。
async function isRateLimited(action, identity) {
  const rule = RATE_LIMIT_RULES[action] || RATE_LIMIT_RULES.default;
  const window = Math.floor(now() / rule.windowMs);
  const count = await rateHit(`rate:${action}:${identity}:${window}`, rule.windowMs);
  if (count > rule.limit) {
    console.warn("[rate] 请求超出频控额度", action, identity, count, rule.limit);
    return true;
  }
  return false;
}

function redisKey(tokenHash) {
  return `auth_token:${tokenHash}`;
}

async function getRedisClient() {
  if (!redisModule) return null;
  const url = process.env.REDIS_URL || "";
  const host = process.env.REDIS_HOST || "";
  if (!url && !host) return null;
  if (!redisClientPromise) {
    redisClientPromise = (async () => {
      const options = url
        ? { url }
        : {
          socket: {
            host,
            port: Number(process.env.REDIS_PORT || 6379),
            tls: process.env.REDIS_TLS === "1" || process.env.REDIS_TLS === "true"
          },
          password: process.env.REDIS_PASSWORD || undefined,
          database: Number(process.env.REDIS_DB || 0) || 0
        };
      const client = redisModule.createClient(options);
      client.on("error", err => console.warn("[auth] redis error", err?.message || err));
      await client.connect();
      return client;
    })().catch(err => {
      redisClientPromise = null;
      if (!redisUnavailableLogged) {
        redisUnavailableLogged = true;
        console.warn("[auth] Redis 不可用，临时回退到云数据库 token 表:", err?.message || err);
      }
      return null;
    });
  }
  return redisClientPromise;
}

// 登录令牌只存哈希：数据库/Redis 中不保留可直接使用的明文令牌，
// 即使存储被读取也无法冒用登录态。
function tokenDocId(token) {
  return sha256(String(token || "").trim());
}

async function saveToken(token, openid) {
  const id = tokenDocId(token);
  const client = await getRedisClient();
  if (client) {
    try {
      await client.set(redisKey(id), openid, { EX: TOKEN_TTL_SECONDS });
      return "redis";
    } catch (err) {
      console.warn("[auth] Redis 写入失败，回退到云数据库 token 表:", err?.message || err);
    }
  }
  const expireAt = now() + TOKEN_TTL_MS;
  await db.collection(USER_TOKENS).doc(id).set({ data: { openid, createdAt: now(), expireAt } });
  return "database";
}

// 机会性清理：令牌只存哈希无法复用，登录会不断新增文档，需要定期删除已过期令牌。
async function cleanupExpiredTokens(limit = 100) {
  try {
    const res = await db.collection(USER_TOKENS)
      .where({ expireAt: _.lt(now()) })
      .limit(limit)
      .get();
    const docs = safeArray(res.data);
    if (!docs.length) return 0;
    await Promise.all(docs.map(doc => db.collection(USER_TOKENS).doc(doc._id).remove().catch(() => {})));
    return docs.length;
  } catch (err) {
    console.warn("[auth] 清理过期令牌失败:", err?.message || err);
    return 0;
  }
}

async function resolveToken(token) {
  const safeToken = String(token || "").trim();
  if (!safeToken) return "";
  const id = tokenDocId(safeToken);
  const client = await getRedisClient();
  if (client) {
    try {
      const openid = await client.get(redisKey(id));
      if (openid) return openid;
    } catch (err) {
      console.warn("[auth] Redis 读取失败，尝试云数据库 token 表:", err?.message || err);
    }
  }
  try {
    const res = await db.collection(USER_TOKENS).doc(id).get();
    const data = res.data;
    if (data?.openid && Number(data.expireAt || 0) > now()) return data.openid;
  } catch (err) {}
  return "";
}

function normalizeRoomId(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length === 4 ? digits : "";
}

function createRoomId() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

// 房间号只有 4 位共 9000 个，若历史房间永久占号，号段会被占满导致无法建房。
// 已解散（留出重连缓冲）或早已过期的房间号允许复用；进行中的对局绝不复用。
const ROOM_REUSE_GRACE_MS = 10 * 60 * 1000;

function roomReusable(room) {
  if (!room) return true;
  if (room.status === "playing" || room.status === "selecting") return false;
  if (room.status === "dissolved") {
    const updatedAt = Number(room.updatedAt || room.createdAt || 0);
    return now() - updatedAt > ROOM_REUSE_GRACE_MS;
  }
  const expireAt = Number(room.expireAt || 0);
  return expireAt > 0 && expireAt <= now();
}

// 双方都已失联的 playing 房间永远不会被 settleDisconnectedPlayer 触发（没人轮询），
// 也不在 cleanupExpiredRooms 的回收范围内，会长期占住 4 位房间号。
// 这里直接作废（不写战绩，因为双方都没在等结果），让房号能重新使用。
const ROOM_BOTH_STALE_MS = PLAYER_HEARTBEAT_TIMEOUT_MS * 2;

async function voidStalePlayingRooms(limit = 20) {
  try {
    const time = now();
    const res = await db.collection(ROOMS)
      .where({ status: "playing", updatedAt: _.lt(time - ROOM_BOTH_STALE_MS) })
      .limit(limit)
      .get();
    const docs = safeArray(res.data).filter(room => safeArray(room.players).slice(0, 2)
      .every(player => time - safeNumber(player?.lastSeenAt, 0) > ROOM_BOTH_STALE_MS));
    if (!docs.length) return 0;
    await Promise.all(docs.map(doc => db.collection(ROOMS).doc(doc._id)
      .update({ data: { status: "dissolved", updatedAt: time } })
      .catch(() => {})));
    return docs.length;
  } catch (err) {
    console.warn("[rooms] 作废双方失联房间失败:", err?.message || err);
    return 0;
  }
}

// 机会性清理：房间集合会随对局数无限增长，建房时顺带删掉少量早已过期的房间文档。
async function cleanupExpiredRooms(limit = 50) {
  try {
    const res = await db.collection(ROOMS)
      .where({
        expireAt: _.lt(now() - ROOM_TTL_MS),
        status: _.nin(["playing", "selecting"])
      })
      .limit(limit)
      .get();
    const docs = safeArray(res.data);
    if (!docs.length) return 0;
    await Promise.all(docs.map(doc => db.collection(ROOMS).doc(doc._id).remove().catch(() => {})));
    return docs.length;
  } catch (err) {
    console.warn("[rooms] 清理过期房间失败:", err?.message || err);
    return 0;
  }
}

function safeFaction(value, fallback = "开国群雄") {
  const validFallback = FACTION_KEYS.includes(fallback) ? fallback : FACTION_KEYS[0];
  return FACTION_KEYS.includes(value) ? value : validFallback;
}

function safeRules(input = {}, previous = null) {
  const source = input && typeof input === "object" ? input : {};
  const fallbackFaction = safeFaction(previous?.faction || "开国群雄");
  const factionMode = ["fixed", "random"].includes(source.factionMode) ? source.factionMode : "any";
  const deckMode = source.deckMode === "autoOnly" ? "autoOnly" : "any";
  const versionSource = previous && previous.version != null ? previous.version : source.version;
  const version = Math.max(0, Number(versionSource || 0) || 0);
  return {
    factionMode,
    faction: safeFaction(source.faction || fallbackFaction, fallbackFaction),
    deckMode,
    version
  };
}

function safeSetup(input = {}, rules = null, profile = null) {
  const setup = input && typeof input === "object" ? input : {};
  const activeRules = safeRules(rules || {});
  const requestedFaction = String(setup.faction || "开国群雄");
  const faction = activeRules.factionMode === "random"
    ? "random"
    : (activeRules.factionMode === "fixed"
      ? activeRules.faction
      : (requestedFaction === "random" ? "random" : safeFaction(requestedFaction)));
  const randomLineup = faction === "random";
  const rawIds = Array.isArray(setup.customDeckIds) ? setup.customDeckIds.map(id => String(id)).slice(0, 40) : [];
  const status = activeRules.deckMode === "autoOnly" || randomLineup ? { valid: false, ids: [] } : deckStatus(rawIds, faction);
  return {
    // 房间内展示名与头像一律取服务端用户资料，不接受客户端传值，
    // 否则玩家可绕过 updateProfile 的内容安全检测把任意 UGC 展示给对手。
    name: String(profile?.nickName || "").trim().slice(0, 12),
    avatarUrl: String(profile?.avatarUrl || "").trim().slice(0, 1024),
    faction,
    leaderId: randomLineup ? "random" : String(setup.leaderId || ""),
    customDeckIds: status.valid ? status.ids : []
  };
}

function makePlayer(openid, index, setup, rules, profile) {
  const safe = safeSetup(setup, rules, profile);
  const time = now();
  return {
    openid,
    index,
    name: safe.name || `玩家${index + 1}`,
    avatarUrl: safe.avatarUrl,
    faction: safe.faction,
    leaderId: safe.leaderId,
    customDeckIds: safe.customDeckIds,
    setupReady: false,
    rematchReady: false,
    lastSeenAt: time
  };
}

function resetPlayerFlags(players = []) {
  return cleanPlayers(players, true);
}

function roomReadyDebug(room) {
  const players = Array.isArray(room?.players) ? room.players : [];
  return {
    status: room?.status || "",
    turnSeq: Number(room?.turnSeq || 0),
    ruleVersion: Number(room?.rules?.version || 0),
    selectionRuleVersion: Number(room?.selectionRuleVersion || 0),
    playerCount: players.length,
    readyPlayers: normalizedReadyPlayers(room)
  };
}

async function getRoom(roomId) {
  const id = normalizeRoomId(roomId);
  if (!id) throw new Error("房间号必须是4位数字");
  try {
    const res = await db.collection(ROOMS).doc(id).get();
    return res.data ? { ...res.data, _id: id, roomId: id } : null;
  } catch (err) {
    return null;
  }
}

function roomData(room) {
  const data = { ...room, roomId: room._id };
  delete data._id;
  return data;
}

function publicPlayer(player) {
  if (!player) return player;
  const { openid, ...safe } = player;
  return safe;
}

// 隐藏牌占位：只保留数量，不泄露卡牌内容。客户端仅用长度渲染背面与计数。
function hiddenCards(count, tag) {
  const size = Math.max(0, Number(count) || 0);
  const list = [];
  for (let i = 0; i < size; i++) list.push({ uid: `hidden:${tag}:${i}`, hidden: true });
  return list;
}

// pending 中的候选牌只属于正在行动的一方：
// 例如黄巢的 leaderDeckChoice 会把行动方「整个剩余牌库」放进 candidates，
// 原样下发等于把牌库内容和顺序直接交给对手。对手只需要知道数量即可。
// options 是玩家索引（选先手），不含卡牌信息，保持原样。
const PENDING_CARD_FIELDS = ["candidates", "discardedCards"];

function viewerSafePending(pending, viewerIndex, currentIndex) {
  if (!pending || typeof pending !== "object") return pending;
  const owner = Number.isInteger(pending.playerIndex) ? pending.playerIndex : currentIndex;
  if (Number.isInteger(viewerIndex) && owner === viewerIndex) return pending;
  const safe = { ...pending };
  PENDING_CARD_FIELDS.forEach(field => {
    if (Array.isArray(safe[field])) safe[field] = hiddenCards(safe[field].length, `pending-${field}`);
  });
  return safe;
}

// 按视角脱敏对局数据：对手手牌与保留牌、双方牌库都只下发数量占位。
// 客户端拿到的对局状态是唯一渲染数据源，若原样下发即可读出对手手牌与抽牌顺序造成作弊。
// 注意：只加工返回值，绝不修改传入对象，避免污染写库数据。
function viewerSafeMatch(match, viewerIndex) {
  if (!match || !Array.isArray(match.players)) return match;
  const players = match.players.map((player, index) => {
    if (!player || typeof player !== "object") return player;
    const isViewer = Number.isInteger(viewerIndex) && index === viewerIndex;
    const safe = { ...player, deck: hiddenCards(safeArray(player.deck).length, `deck${index}`) };
    if (!isViewer) {
      safe.hand = hiddenCards(safeArray(player.hand).length, `hand${index}`);
      safe.retained = hiddenCards(safeArray(player.retained).length, `retained${index}`);
    }
    return safe;
  });
  return { ...match, players, pending: viewerSafePending(match.pending, viewerIndex, match.current) };
}

function publicRoom(room, viewerIndex = null) {
  if (!room) return null;
  const roomId = normalizeRoomId(room.roomId || room._id);
  const readyPlayers = normalizedReadyPlayers(room);
  const players = cleanPlayers(room.players).map(publicPlayer);
  let match = room.match;
  if (Array.isArray(match?.leaderReveals)) {
    match = {
      ...match,
      leaderReveals: match.leaderReveals.map((reveal, index) => index === viewerIndex ? reveal : null)
    };
  }
  match = viewerSafeMatch(match, viewerIndex);
  return { ...room, players, readyPlayers, match, roomId, _id: roomId };
}

function playerIndexOf(room, openid) {
  return (room.players || []).findIndex(player => player.openid === openid);
}

function sanitizeRoundResult(item = {}) {
  return {
    round: safeNumber(item.round, 0),
    scores: safeArray(item.scores).slice(0, 2).map(value => safeNumber(value, 0)),
    winner: item.winner == null ? null : safeNumber(item.winner, 0),
    morale: safeArray(item.morale).slice(0, 2).map(value => safeNumber(value, 0)),
    moraleLoss: safeArray(item.moraleLoss).slice(0, 2).map(value => safeNumber(value, 0))
  };
}

function compactRecordKeyText(value) {
  return safeText(value, 200).replace(/\s+/g, "");
}

function matchRecordKey(record = {}) {
  if (record.recordKey) return safeText(record.recordKey, 160);
  const rounds = safeArray(record.roundResults)
    .map(item => `${item?.round || 0}:${safeArray(item?.scores).join("-")}:${item?.winner == null ? "draw" : item.winner}`)
    .join("|");
  return compactRecordKeyText([
    record.mode || "local",
    record.roomId || "",
    record.matchId || "",
    record.time || now(),
    record.endReason || "normal",
    safeArray(record.rounds).join("-"),
    safeArray(record.scores).join("-"),
    rounds
  ].join(":"));
}

// 掉线判负时额外带上的“掉线时比分”，只用于展示说明，不参与胜负与积分结算。
function sanitizeDisconnectSnapshot(input) {
  if (!input || typeof input !== "object") return null;
  const rounds = safeArray(input.rounds).slice(0, 2).map(value => safeNumber(value, 0));
  const scores = safeArray(input.scores).slice(0, 2).map(value => safeNumber(value, 0));
  const roundResults = safeArray(input.roundResults).slice(0, 3).map(sanitizeRoundResult);
  if (!rounds.length && !scores.length && !roundResults.length) return null;
  return { rounds, scores, roundResults };
}

function sanitizeMatchRecord(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  const time = safeNumber(source.time, now());
  const record = {
    time,
    resultText: safeText(source.resultText, 40),
    winner: source.winner == null ? null : safeNumber(source.winner, 0),
    rounds: safeArray(source.rounds).slice(0, 2).map(value => safeNumber(value, 0)),
    morale: safeArray(source.morale).slice(0, 2).map(value => safeNumber(value, 0)),
    scores: safeArray(source.scores).slice(0, 2).map(value => safeNumber(value, 0)),
    roundResults: safeArray(source.roundResults).slice(0, 3).map(sanitizeRoundResult),
    humanFaction: safeText(source.humanFaction, 40),
    aiFaction: safeText(source.aiFaction, 40),
    humanLeader: safeText(source.humanLeader, 60),
    aiLeader: safeText(source.aiLeader, 60),
    humanLeaderId: safeText(source.humanLeaderId, 80),
    aiLeaderId: safeText(source.aiLeaderId, 80),
    humanDeckMode: safeText(source.humanDeckMode, 20),
    aiDeckMode: safeText(source.aiDeckMode, 20),
    difficulty: safeText(source.difficulty, 20),
    mode: source.mode === "online" ? "online" : "ai",
    endReason: safeText(source.endReason || "normal", 24),
    disconnectSnapshot: sanitizeDisconnectSnapshot(source.disconnectSnapshot),
    startedAt: safeNumber(source.startedAt, 0),
    finishedRounds: safeNumber(source.finishedRounds, 0),
    roomId: normalizeRoomId(source.roomId) || "",
    matchId: safeText(source.matchId, 80),
    ranked: !!source.ranked,
    rankedAnomaly: !!source.rankedAnomaly,
    rankMatchId: safeText(source.rankMatchId, 80),
    rankDisplay: safeText(source.rankDisplay, 40),
    rankDeltaText: safeText(source.rankDeltaText, 80),
    validationStatus: safeText(source.validationStatus, 20),
    riskFlags: safeArray(source.riskFlags).slice(0, 12).map(flag => safeText(flag, 40)).filter(Boolean)
  };
  record.recordKey = matchRecordKey({ ...source, ...record });
  record.syncState = "synced";
  return record;
}

function historyDocId(openid, recordKey) {
  return sha1(`${openid}:${recordKey}`);
}

async function upsertMatchHistoryForOpenid(openid, record, source = "client") {
  if (!openid) throw new Error("缺少用户身份");
  const safe = sanitizeMatchRecord(record);
  const id = historyDocId(openid, safe.recordKey);
  if (source !== "pvpRoom") {
    try {
      const existing = await db.collection(MATCH_HISTORY).doc(id).get();
      if (existing.data?.source === "pvpRoom") {
        return { cloudId: id, record: existing.data.record || safe };
      }
    } catch (err) {}
  }
  const time = safeNumber(safe.time, now());
  await db.collection(MATCH_HISTORY).doc(id).set({
    data: {
      _openid: openid,
      openid,
      recordKey: safe.recordKey,
      time,
      mode: safe.mode,
      winner: safe.winner,
      endReason: safe.endReason,
      roomId: safe.roomId,
      matchId: safe.matchId,
      record: safe,
      source,
      updatedAt: now()
    }
  });
  return { cloudId: id, record: safe };
}

function onlineRecordForPlayer(room, playerIndex) {
  const match = room?.match;
  const players = match?.players || [];
  const meIdx = playerIndex;
  const oppIdx = 1 - meIdx;
  const me = players[meIdx];
  const opp = players[oppIdx];
  if (!match?.over || !me || !opp) return null;
  let winner = match.winner;
  if (winner === meIdx) winner = 0;
  else if (winner === oppIdx) winner = 1;
  const surrendered = match.endReason === "surrender";
  const disconnected = match.endReason === "disconnect";
  let resultText;
  if (winner == null) resultText = "平局";
  else if (winner === 0) resultText = disconnected ? "对方掉线" : (surrendered ? "对方认输" : "你赢了");
  else resultText = disconnected ? "你已掉线" : (surrendered ? "你已认输" : "你输了");
  const roundResults = safeArray(match.roundResults).map(r => ({
    round: r.round,
    scores: [safeNumber(r.scores?.[meIdx], 0), safeNumber(r.scores?.[oppIdx], 0)],
    winner: r.winner == null ? null : (r.winner === meIdx ? 0 : 1),
    morale: Array.isArray(r.morale) ? [safeNumber(r.morale[meIdx], 0), safeNumber(r.morale[oppIdx], 0)] : undefined,
    moraleLoss: Array.isArray(r.moraleLoss) ? [safeNumber(r.moraleLoss[meIdx], 0), safeNumber(r.moraleLoss[oppIdx], 0)] : undefined
  }));
  return sanitizeMatchRecord({
    time: now(),
    recordKey: `online:${normalizeRoomId(room.roomId || room._id)}:${match.matchId || "match"}:${meIdx}`,
    resultText,
    winner,
    rounds: [safeNumber(me.roundsWon, 0), safeNumber(opp.roundsWon, 0)],
    morale: Array.isArray(match.morale) ? [safeNumber(match.morale[meIdx], 0), safeNumber(match.morale[oppIdx], 0)] : [],
    scores: [safeNumber(match.finalScores?.[meIdx], 0), safeNumber(match.finalScores?.[oppIdx], 0)],
    roundResults,
    humanFaction: me.factionName || me.faction,
    aiFaction: opp.factionName || opp.faction,
    humanLeader: battle.cardLabel(me.leader),
    aiLeader: battle.cardLabel(opp.leader),
    humanLeaderId: me.leader?.id || "",
    aiLeaderId: opp.leader?.id || "",
    humanDeckMode: me.deckMode || "random",
    aiDeckMode: opp.deckMode || "random",
    disconnectSnapshot: disconnected ? {
      rounds: [safeNumber(me.roundsWon, 0), safeNumber(opp.roundsWon, 0)],
      scores: [safeNumber(match.finalScores?.[meIdx], 0), safeNumber(match.finalScores?.[oppIdx], 0)],
      roundResults
    } : null,
    difficulty: "pvp",
    mode: "online",
    endReason: match.endReason || "normal",
    roomId: normalizeRoomId(room.roomId || room._id),
    matchId: match.matchId || ""
  });
}

async function saveOnlineMatchHistoryForPlayers(room) {
  if (!room?.match?.over) return;
  await Promise.all(safeArray(room.players).slice(0, 2).map((player, index) => {
    const record = onlineRecordForPlayer(room, index);
    return player?.openid && record
      ? upsertMatchHistoryForOpenid(player.openid, record, "pvpRoom").catch(err => console.warn("[history] save online failed", err?.message || err))
      : null;
  }));
}

async function touchRoomPlayer(room, playerIndex) {
  if (!room || playerIndex < 0) return room;
  const roomId = normalizeRoomId(room.roomId || room._id);
  const openid = room.players?.[playerIndex]?.openid;
  if (!roomId || !openid) return room;
  try {
    return await runRoomTransaction(async transaction => {
      const ref = transaction.collection(ROOMS).doc(roomId);
      const result = await ref.get();
      const latest = result.data ? { ...result.data, _id: roomId, roomId } : null;
      if (!latest) return room;
      const latestPlayerIndex = playerIndexOf(latest, openid);
      if (latestPlayerIndex < 0) return latest;
      const players = safeArray(latest.players).map((player, index) => index === latestPlayerIndex
        ? { ...player, lastSeenAt: now() }
        : player);
      await ref.update({ data: { players } });
      return { ...latest, players };
    });
  } catch (err) {
    console.warn("[pvp] heartbeat update failed", err?.message || err);
    return await getRoom(roomId) || room;
  }
}

async function settleDisconnectedPlayer(room) {
  if (!room || room.status !== "playing" || !room.match || room.match.over) return room;
  const time = now();
  const stale = safeArray(room.players).slice(0, 2)
    .map((player, index) => ({ index, lastSeenAt: safeNumber(player?.lastSeenAt, room.updatedAt || room.createdAt || time) }))
    .filter(item => time - item.lastSeenAt > PLAYER_HEARTBEAT_TIMEOUT_MS);
  if (stale.length !== 1) return room;
  const loserIndex = stale[0].index;
  battle.surrender(room.match, loserIndex, "disconnect");
  room.status = "finished";
  room.turnSeq = (room.turnSeq || 0) + 1;
  room.updatedAt = time;
  await db.collection(ROOMS).doc(normalizeRoomId(room.roomId || room._id)).update({
    data: { status: room.status, match: _.set(room.match), turnSeq: room.turnSeq, updatedAt: room.updatedAt }
  });
  await saveOnlineMatchHistoryForPlayers(room);
  return room;
}

async function recordMatchHistory(event, openid) {
  const result = await upsertMatchHistoryForOpenid(openid, event.record || {}, "client");
  return ok(result);
}

async function listMatchHistory(event, openid) {
  const limit = Math.max(1, Math.min(MATCH_HISTORY_LIMIT, safeNumber(event.limit, MATCH_HISTORY_LIMIT)));
  const skip = Math.max(0, safeNumber(event.skip, 0));
  const res = await db.collection(MATCH_HISTORY)
    .where({ openid })
    .orderBy("time", "desc")
    .skip(skip)
    .limit(limit)
    .get();
  const history = safeArray(res.data).map(doc => ({ ...(doc.record || {}), cloudId: doc._id, syncState: "synced" }));
  const countRes = await db.collection(MATCH_HISTORY).where({ openid }).count();
  const total = countRes.total || 0;
  const hasMore = skip + history.length < total;
  const result = { history, total, hasMore };
  if (skip === 0) {
    try {
      // 统计字段已在写入时冗余到顶层，使用 count 查询避免聚合表达式在嵌套 record.winner 上兼容性异常导致胜场恒为 0。
      const [winsRes, drawsRes] = await Promise.all([
        db.collection(MATCH_HISTORY).where({ openid, winner: 0 }).count(),
        db.collection(MATCH_HISTORY).where({ openid, winner: null }).count()
      ]);
      const wins = Math.max(0, safeNumber(winsRes.total, 0));
      const draws = Math.max(0, safeNumber(drawsRes.total, 0));
      const losses = Math.max(0, total - wins - draws);
      result.wins = wins;
      result.losses = losses;
      result.draws = draws;
      result.winRate = total ? Math.round(wins * 100 / total) : 0;
    } catch (statsErr) {
      console.warn("[listMatchHistory] count stats failed", statsErr?.message || statsErr);
    }
  }
  return ok(result);
}

function rankPublicUserId(openid) {
  return sha1(`rank:${rankCore.SEASON_ID}:${openid}:public`);
}

async function userPublicProfile(openid) {
  try {
    const res = await db.collection(USERS).doc(openid).get();
    const user = res.data || null;
    return displayUser(user || {});
  } catch (err) {
    return { nickName: "匿名玩家", avatarUrl: "" };
  }
}

function normalizeRankProfileDoc(openid, source = {}) {
  const view = rankCore.profileView(source || {});
  const totalMatches = Math.max(0, safeNumber(source.totalMatches, 0));
  const wins = Math.max(0, safeNumber(source.wins, 0));
  const losses = Math.max(0, safeNumber(source.losses, 0));
  const draws = Math.max(0, safeNumber(source.draws, 0));
  return {
    openid,
    publicUserId: source.publicUserId || rankPublicUserId(openid),
    seasonId: rankCore.SEASON_ID,
    totalPower: view.totalPower,
    tierPower: view.tierPower,
    prestige: view.prestige,
    prestigeCap: rankCore.PRESTIGE_CAP,
    peakPower: view.peakPower,
    totalMatches,
    wins,
    losses,
    draws,
    winRate: totalMatches ? Number((wins * 100 / totalMatches).toFixed(1)) : 0,
    currentTier: view.currentTier,
    currentTierId: view.currentTierId,
    publicProfile: source.publicProfile || { nickName: "匿名玩家", avatarUrl: "" },
    lastMatchAt: safeNumber(source.lastMatchAt, 0),
    createdAt: safeNumber(source.createdAt, now()),
    updatedAt: safeNumber(source.updatedAt, now())
  };
}

async function getRankProfileDoc(openid, createIfMissing = true) {
  let existing = null;
  try {
    const res = await db.collection(RANK_PROFILES).doc(openid).get();
    existing = res.data || null;
  } catch (err) {}
  const publicProfile = await userPublicProfile(openid);
  const profile = normalizeRankProfileDoc(openid, {
    ...(existing || {}),
    publicUserId: existing?.publicUserId || rankPublicUserId(openid),
    publicProfile,
    createdAt: existing?.createdAt || now(),
    updatedAt: now()
  });
  if (createIfMissing || existing) {
    await db.collection(RANK_PROFILES).doc(openid).set({ data: profile });
  }
  return profile;
}

function publicRankPayload(profile) {
  return rankCore.publicProfile(profile);
}

async function getRankProfile(event, openid) {
  const profile = await getRankProfileDoc(openid, true);
  const view = rankCore.profileView(profile);
  return ok({ profile: publicRankPayload(profile), tier: view.tier, nextTier: view.nextTier, rules: rankRulesForProfile(profile) });
}

function rankRulesForProfile(profile = {}) {
  const tier = rankCore.profileView(profile).tier;
  return {
    tierId: tier.id,
    tierName: tier.name,
    aiDifficulty: tier.aiDifficulty,
    forcePlayerRandom: !!tier.forcePlayerRandom,
    allowCustomDeck: !!tier.allowCustomDeck,
    prestigeEnabled: !!tier.prestigeEnabled,
    prestigeCap: rankCore.PRESTIGE_CAP,
    prestigeProtectCost: rankCore.PRESTIGE_PROTECT_COST
  };
}

function safeRankFaction(value, fallback = "random") {
  const raw = String(value || "");
  if (raw === "random") return "random";
  return FACTION_KEYS.includes(raw) ? raw : fallback;
}

function sanitizeRankPlayerSetup(input = {}, rules = {}) {
  if (rules.forcePlayerRandom) {
    return { faction: "random", leaderId: "random", deckMode: "auto", customDeckIds: [] };
  }
  const faction = safeRankFaction(input.faction || input.humanFaction, "random");
  const customDeckIds = safeArray(input.customDeckIds || input.humanCustomDeckIds).map(id => safeText(id, 80)).filter(Boolean).slice(0, 40);
  const customValid = faction !== "random" && customDeckIds.length && deckStatus(customDeckIds, faction).valid;
  const deckMode = input.deckMode === "custom" && rules.allowCustomDeck && customValid ? "custom" : "auto";
  return {
    faction,
    leaderId: faction === "random" ? "random" : safeText(input.leaderId || input.humanLeaderId || "", 80),
    deckMode,
    customDeckIds: deckMode === "custom" ? customDeckIds : []
  };
}

function rankMatchOptions(setup, rules) {
  return {
    mode: "ai",
    humanFaction: setup.faction,
    humanLeaderId: setup.leaderId,
    customDeckEnabled: setup.deckMode === "custom",
    humanCustomDeckIds: setup.deckMode === "custom" ? setup.customDeckIds : [],
    aiFaction: "random",
    aiLeaderId: "random",
    difficulty: rules.aiDifficulty
  };
}

async function startRankMatch(event, openid) {
  // 开新局前必须先补判负上一局未提交的排位对局，否则"看到要输就杀进程不提交"即可免罚刷分。
  const cleanup = await settleOpenRankMatches(openid);
  const profile = await getRankProfileDoc(openid, true);
  const rules = rankRulesForProfile(profile);
  const setup = sanitizeRankPlayerSetup(event.playerSetup || {}, rules);
  const time = now();
  const rankMatchId = `rank-${time}-${crypto.randomBytes(4).toString("hex")}`;
  const match = {
    rankMatchId,
    openid,
    seasonId: rankCore.SEASON_ID,
    status: "created",
    validationStatus: "pending",
    riskFlags: [],
    tierBefore: profile.currentTier,
    totalPowerBefore: profile.totalPower,
    tierPowerBefore: profile.tierPower,
    prestigeBefore: profile.prestige,
    playerSetup: setup,
    roundProgress: null,
    aiSetup: { faction: "random", leaderId: "random", difficulty: rules.aiDifficulty, deckMode: "auto" },
    ruleSnapshot: rules,
    createdAt: time,
    expireAt: time + ROOM_TTL_MS,
    updatedAt: time
  };
  await db.collection(RANK_MATCHES).doc(rankMatchId).set({ data: match });
  return ok({
    rankMatchId,
    profile: publicRankPayload(profile),
    rules,
    playerSetup: setup,
    aiSetup: match.aiSetup,
    matchOptions: rankMatchOptions(setup, rules),
    abandonedPrevious: cleanup.abandoned
  });
}

function normalizeRankRound(item, index) {
  return {
    round: Math.max(1, safeNumber(item?.round, index + 1)),
    scores: safeArray(item?.scores).slice(0, 2).map(value => safeNumber(value, 0)),
    winner: item?.winner == null ? null : (safeNumber(item.winner, 0) === 0 ? 0 : 1)
  };
}

function rankResultSummary(finalState = {}) {
  const roundResults = safeArray(finalState.roundResults).slice(0, 3).map(normalizeRankRound);
  const roundsWon = Math.max(0, safeNumber(finalState.roundsWon, safeArray(finalState.rounds)[0] || 0));
  const roundsLost = Math.max(0, safeNumber(finalState.roundsLost, safeArray(finalState.rounds)[1] || 0));
  const winner = finalState.winner == null ? null : (safeNumber(finalState.winner, 0) === 0 ? 0 : 1);
  return {
    result: rankCore.resultFromWinner(winner),
    winner,
    roundsWon,
    roundsLost,
    rounds: [roundsWon, roundsLost],
    roundResults,
    scores: safeArray(finalState.scores || finalState.finalScores).slice(0, 2).map(value => safeNumber(value, 0)),
    morale: safeArray(finalState.morale).slice(0, 2).map(value => safeNumber(value, 0)),
    humanFaction: safeText(finalState.humanFaction, 40),
    aiFaction: safeText(finalState.aiFaction, 40),
    humanLeader: safeText(finalState.humanLeader, 60),
    aiLeader: safeText(finalState.aiLeader, 60),
    humanLeaderId: safeText(finalState.humanLeaderId, 80),
    aiLeaderId: safeText(finalState.aiLeaderId, 80),
    humanDeckMode: safeText(finalState.humanDeckMode, 20),
    aiDeckMode: safeText(finalState.aiDeckMode, 20),
    endReason: safeText(finalState.endReason || "normal", 24),
    disconnectSnapshot: sanitizeDisconnectSnapshot(finalState.disconnectSnapshot)
  };
}

function validateRankFinish(match, summary, event) {
  const flags = [];
  const hardInvalid = [];
  const surrendered = summary.endReason === "surrender";
  const disconnected = summary.endReason === "disconnect";
  const earlyEnd = surrendered || disconnected;
  if (!summary.roundResults.length && !earlyEnd) hardInvalid.push("MISSING_ROUND_RESULTS");
  const roundWins = summary.roundResults.filter(item => item.winner === 0).length;
  const roundLosses = summary.roundResults.filter(item => item.winner === 1).length;
  if (roundWins !== summary.roundsWon || roundLosses !== summary.roundsLost) hardInvalid.push("RESULT_ROUND_MISMATCH");
  if (earlyEnd && summary.result !== "loss") hardInvalid.push("EARLY_END_RESULT_MISMATCH");
  if (match.ruleSnapshot?.forcePlayerRandom && summary.humanDeckMode === "custom") hardInvalid.push("TOP_TIER_CUSTOM_DECK");
  if (safeText(event.clientVersion, 40) === "") flags.push("MISSING_CLIENT_VERSION");
  const durationMs = safeNumber(event.durationMs, 0);
  if (durationMs > 0 && durationMs < 30000 && !earlyEnd) flags.push("DURATION_TOO_SHORT");
  return hardInvalid.length
    ? { validationStatus: "invalid", riskFlags: hardInvalid.concat(flags) }
    : (flags.length ? { validationStatus: "suspicious", riskFlags: flags } : { validationStatus: "valid", riskFlags: [] });
}

function rankResultText(result, endReason = "normal") {
  if (endReason === "disconnect") return result === "loss" ? "排位掉线" : "对方掉线";
  if (endReason === "surrender") return result === "loss" ? "排位认输" : "对方认输";
  if (endReason === "abandon") return "排位弃局";
  if (endReason === "timeout") return "排位超时";
  if (endReason === "invalid") return "排位数据异常";
  if (result === "win") return "排位胜利";
  if (result === "loss") return "排位失败";
  return "排位平局";
}

function rankDeltaText(delta) {
  if (!delta) return "权势不变，威望不变";
  const power = delta.powerDelta > 0 ? `权势 +${delta.powerDelta}` : (delta.powerDelta < 0 ? `权势 ${delta.powerDelta}` : "权势不变");
  const prestige = delta.prestigeDelta > 0 ? `威望 +${delta.prestigeDelta}` : (delta.prestigeDelta < 0 ? `威望 ${delta.prestigeDelta}` : "威望不变");
  return `${power}，${prestige}`;
}

function buildRankHistoryRecord(match, summary, delta, validationStatus, riskFlags) {
  // 所有结算路径都会真实计分，因此文案一律照实展示；rankedAnomaly 仅作为风控标记，不再隐藏增减结果。
  const rankMatchId = match.rankMatchId || match._id || "";
  return {
    time: now(),
    recordKey: `rank:${rankMatchId}`,
    resultText: rankResultText(delta.result, summary.endReason),
    winner: summary.winner,
    rounds: summary.rounds,
    morale: summary.morale,
    scores: summary.scores,
    roundResults: summary.roundResults,
    disconnectSnapshot: summary.disconnectSnapshot || null,
    startedAt: safeNumber(summary.startedAt, 0),
    finishedRounds: safeNumber(summary.finishedRounds, 0),
    humanFaction: summary.humanFaction,
    aiFaction: summary.aiFaction,
    humanLeader: summary.humanLeader,
    aiLeader: summary.aiLeader,
    humanLeaderId: summary.humanLeaderId,
    aiLeaderId: summary.aiLeaderId,
    humanDeckMode: summary.humanDeckMode || match.playerSetup?.deckMode || "auto",
    aiDeckMode: "auto",
    difficulty: match.aiSetup?.difficulty || match.ruleSnapshot?.aiDifficulty || "normal",
    mode: "ai",
    endReason: summary.endReason || "normal",
    matchId: rankMatchId,
    ranked: true,
    rankedAnomaly: validationStatus !== "valid",
    rankMatchId,
    rankDisplay: delta.after.display,
    rankDeltaText: rankDeltaText(delta),
    validationStatus,
    riskFlags
  };
}

// 兼容 wx-server-sdk 与测试桩两种返回结构，取本次真实更新的文档数。
function updatedCount(res) {
  return Math.max(0, safeNumber(res?.stats?.updated ?? res?.updated, 0));
}

// 宽限期内未结算的排位局视为客户端重复创建 / 尚未开打，直接作废，不判负也不写战绩。
async function voidRankMatch(rankMatchId) {
  const time = now();
  try {
    const res = await db.collection(RANK_MATCHES)
      .where({ _id: rankMatchId, status: "created" })
      .update({ data: { status: "voided", validationStatus: "voided", finishedAt: time, updatedAt: time } });
    return updatedCount(res) > 0;
  } catch (err) {
    console.warn("[rank] 作废未开打排位局失败", rankMatchId, err?.message || err);
    return false;
  }
}

// 把一局未正常结算的排位对局按 0:2 判负写入战绩与排位资料。
// 先用条件更新抢占 created 状态做CAS，保证并发调用下不会重复扣分。
async function settleRankAbandon(openid, match, endReason = "abandon", validationStatus = "valid", riskFlags = []) {
  const rankMatchId = match?.rankMatchId || match?._id || "";
  if (!rankMatchId) return null;
  const time = now();
  let claimed = 0;
  try {
    const res = await db.collection(RANK_MATCHES)
      .where({ _id: rankMatchId, status: "created" })
      .update({ data: { status: "abandoned", updatedAt: time } });
    claimed = updatedCount(res);
  } catch (err) {
    console.warn("[rank] 抢占未结算排位局失败", rankMatchId, err?.message || err);
    return null;
  }
  if (!claimed) return null;

  const profile = await getRankProfileDoc(openid, true);
  // 结算结果恒为 0:2 判负；额外带上客户端上报的小局比分与出场信息，仅供展示
  const summary = {
    ...rankCore.abandonSummary(endReason, match?.roundProgress),
    ...rankAbandonMatchInfo(match),
    startedAt: safeNumber(match?.createdAt, 0),
    finishedRounds: safeArray(match?.roundProgress?.roundResults).length
  };
  const delta = rankCore.settleRankProfile(profile, summary);
  const nextProfile = normalizeRankProfileDoc(openid, {
    ...profile,
    totalPower: delta.after.totalPower,
    tierPower: delta.after.tierPower,
    prestige: delta.after.prestige,
    peakPower: Math.max(profile.peakPower, delta.after.totalPower),
    losses: profile.losses + 1,
    totalMatches: profile.totalMatches + 1,
    lastMatchAt: time,
    updatedAt: time,
    publicProfile: await userPublicProfile(openid)
  });
  await db.collection(RANK_PROFILES).doc(openid).set({ data: nextProfile });

  const historyRecord = buildRankHistoryRecord(match, summary, delta, validationStatus, riskFlags);
  await upsertMatchHistoryForOpenid(openid, historyRecord, "pvpRoom");
  await db.collection(RANK_MATCHES).doc(rankMatchId).update({
    data: {
      validationStatus,
      riskFlags,
      result: summary.result,
      roundsWon: summary.roundsWon,
      roundsLost: summary.roundsLost,
      roundResults: summary.roundResults,
      totalPowerAfter: delta.after.totalPower,
      tierPowerAfter: delta.after.tierPower,
      tierAfter: delta.after.currentTier,
      powerDelta: delta.powerDelta,
      prestigeAfter: delta.after.prestige,
      prestigeDelta: delta.prestigeDelta,
      protectionUsed: !!delta.protectionUsed,
      finalStateSummary: summary,
      endReason,
      finishedAt: time,
      updatedAt: time
    }
  });
  return { delta, historyRecord, summary };
}

// 清理该玩家所有还挂在 created 的排位局：超过宽限期的判负，宽限期内的作废。
// 副作用：执行后该玩家最多只会保留即将新建的那一局，天然限制并发开局。
async function settleOpenRankMatches(openid) {
  let docs = [];
  try {
    const res = await db.collection(RANK_MATCHES)
      .where({ openid, status: "created" })
      .orderBy("createdAt", "asc")
      .limit(20)
      .get();
    docs = safeArray(res.data);
  } catch (err) {
    console.warn("[rank] 查询未结算排位局失败", err?.message || err);
    return { abandoned: 0, voided: 0 };
  }
  let abandoned = 0;
  let voided = 0;
  for (const match of docs) {
    const rankMatchId = match.rankMatchId || match._id || "";
    if (!rankMatchId) continue;
    const startedAt = safeNumber(match.createdAt, 0);
    if (startedAt && now() - startedAt < rankCore.ABANDON_GRACE_MS) {
      if (await voidRankMatch(rankMatchId)) voided += 1;
      continue;
    }
    const settled = await settleRankAbandon(openid, { ...match, rankMatchId }, "abandon", "valid", ["RANK_ABANDON_AUTO_LOSS"]);
    if (settled) abandoned += 1;
  }
  return { abandoned, voided };
}

// 客户端上报的对局展示信息（实际阵营/主将/难度）。
// 只用于弃局战绩展示，不参与结算也不参与风控校验。
function sanitizeRankMatchInfo(input) {
  if (!input || typeof input !== "object") return null;
  const info = {
    humanFaction: safeText(input.humanFaction, 40),
    humanLeader: safeText(input.humanLeader, 60),
    humanLeaderId: safeText(input.humanLeaderId, 80),
    aiFaction: safeText(input.aiFaction, 40),
    aiLeader: safeText(input.aiLeader, 60),
    aiLeaderId: safeText(input.aiLeaderId, 80)
  };
  return Object.values(info).some(Boolean) ? info : null;
}

// 排位对局进度上报：只允许更新自己还挂在 created 的排位局，
// 只存展示用的出场信息与比分快照，不影响任何结算逻辑。
async function reportRankProgress(event, openid) {
  const rankMatchId = safeText(event.rankMatchId, 80);
  if (!rankMatchId) return fail("缺少排位对局标识");
  const progress = sanitizeDisconnectSnapshot(event.progress);
  const matchInfo = sanitizeRankMatchInfo(event.setup);
  if (!progress && !matchInfo) return fail("对局进度数据无效");
  const time = now();
  const data = { updatedAt: time };
  if (progress) data.roundProgress = progress;
  if (matchInfo) data.matchInfo = matchInfo;
  try {
    const res = await db.collection(RANK_MATCHES)
      .where({ _id: rankMatchId, openid, status: "created" })
      .update({ data });
    return ok({ updated: updatedCount(res) > 0 });
  } catch (err) {
    console.warn("[rank] 上报排位对局进度失败", rankMatchId, err?.message || err);
    return fail("上报排位对局进度失败", "SERVER_ERROR");
  }
}

function leaderNameById(leaderId) {
  if (!leaderId) return "";
  try {
    const card = cardById(leaderId);
    return card ? displayName(card) : "";
  } catch (err) {
    return "";
  }
}

// 弃局/超时类结算没有客户端战报，这里把展示信息拼回来，避免战绩上一片空白。
// 服务端已经确定的选项（固定阵营/主将/牌组模式/难度）以服务端为权威，
// 只有random 项才采用客户端上报的实际抽取结果，避免自定义牌组被伪装成auto。
function rankAbandonMatchInfo(match) {
  const info = match?.matchInfo || {};
  const setup = match?.playerSetup || {};
  const fixedFaction = setup.faction && setup.faction !== "random" ? safeText(setup.faction, 40) : "";
  const fixedLeaderId = setup.leaderId && setup.leaderId !== "random" ? safeText(setup.leaderId, 80) : "";
  const humanFaction = fixedFaction || safeText(info.humanFaction, 40);
  const humanLeaderId = fixedLeaderId || safeText(info.humanLeaderId, 80);
  const aiLeaderId = safeText(info.aiLeaderId, 80);
  return {
    humanFaction: FACTION_LABELS[humanFaction] || humanFaction || "未出场",
    humanLeader: safeText(info.humanLeader, 60) || leaderNameById(humanLeaderId) || "未出场",
    humanLeaderId,
    aiFaction: FACTION_LABELS[safeText(info.aiFaction, 40)] || safeText(info.aiFaction, 40) || "未出场",
    aiLeader: safeText(info.aiLeader, 60) || leaderNameById(aiLeaderId) || "未出场",
    aiLeaderId
  };
}

// 判负类结算（弃局/ 超时 / 数据异常）的统一回包，让客户端能照实展示扣分并清掉待提交缓存。
async function rankSettlementResponse(openid, settled, validationStatus, riskFlags) {
  const latestProfile = await getRankProfileDoc(openid, true);
  const view = rankCore.profileView(latestProfile);
  const delta = settled?.delta || { before: view, after: view, result: "loss", powerDelta: 0, prestigeDelta: 0, protectionUsed: false };
  return ok({
    profile: publicRankPayload(latestProfile),
    delta: { ...delta, validationStatus, riskFlags, rankDeltaText: settled?.historyRecord?.rankDeltaText || rankDeltaText(delta) },
    validationStatus,
    riskFlags,
    historyRecord: settled?.historyRecord || null,
    autoLoss: true
  });
}

async function finishRankMatch(event, openid) {
  const rankMatchId = safeText(event.rankMatchId, 100);
  if (!rankMatchId) return fail("缺少排位对局", "MISSING_RANK_MATCH");
  let match = null;
  try {
    const res = await db.collection(RANK_MATCHES).doc(rankMatchId).get();
    match = res.data || null;
  } catch (err) {}
  if (!match) return fail("排位对局不存在", "RANK_MATCH_NOT_FOUND");
  if (match.openid !== openid) return fail("无权结算该排位对局", "FORBIDDEN");
  if (match.status === "abandoned") return fail("该排位对局已因中途退出判负", "RANK_MATCH_ABANDONED");
  if (match.status === "voided") return fail("该排位对局尚未开始已作废", "RANK_MATCH_VOIDED");
  if (match.status !== "created") return fail("该排位对局已结算", "RANK_ALREADY_FINISHED");

  //拖过有效期再提交同样不能免罚，否则"挂着不交等过期"就是零成本逃跑。
  if (safeNumber(match.expireAt, 0) && now() > safeNumber(match.expireAt, 0)) {
    const settled = await settleRankAbandon(openid, match, "timeout", "valid", ["RANK_TIMEOUT_AUTO_LOSS"]);
    return rankSettlementResponse(openid, settled, "valid", ["RANK_TIMEOUT_AUTO_LOSS"]);
  }

  const profile = await getRankProfileDoc(openid, true);
  const summary = rankResultSummary(event.finalStateSummary || {});
  const validation = validateRankFinish(match, summary, event);

  // 校验硬失败不能只是"不结算"：否则玩家提交一份自相矛盾的战报就能洗掉必输的局。
  // 统一按弃局判负，让任何异常提交都只有代价、没有收益。
  if (validation.validationStatus === "invalid") {
    const settled = await settleRankAbandon(openid, match, "invalid", "invalid", validation.riskFlags);
    return rankSettlementResponse(openid, settled, "invalid", validation.riskFlags);
  }

  const delta = rankCore.settleRankProfile(profile, summary);
  const time = now();

  const after = delta.after;
  const wins = profile.wins + (summary.result === "win" ? 1 : 0);
  const losses = profile.losses + (summary.result === "loss" ? 1 : 0);
  const draws = profile.draws + (summary.result === "draw" ? 1 : 0);
  const totalMatches = profile.totalMatches + 1;
  const nextProfile = normalizeRankProfileDoc(openid, {
    ...profile,
    totalPower: after.totalPower,
    tierPower: after.tierPower,
    prestige: after.prestige,
    peakPower: Math.max(profile.peakPower, after.totalPower),
    wins,
    losses,
    draws,
    totalMatches,
    lastMatchAt: time,
    updatedAt: time,
    publicProfile: await userPublicProfile(openid)
  });
  await db.collection(RANK_PROFILES).doc(openid).set({ data: nextProfile });

  const historyRecord = buildRankHistoryRecord(match, summary, delta, validation.validationStatus, validation.riskFlags);
  await upsertMatchHistoryForOpenid(openid, historyRecord, "pvpRoom");
  await db.collection(RANK_MATCHES).doc(rankMatchId).update({
    data: {
      status: "finished",
      validationStatus: validation.validationStatus,
      riskFlags: validation.riskFlags,
      result: summary.result,
      roundsWon: summary.roundsWon,
      roundsLost: summary.roundsLost,
      roundResults: summary.roundResults,
      totalPowerAfter: delta.after.totalPower,
      tierPowerAfter: delta.after.tierPower,
      tierAfter: delta.after.currentTier,
      powerDelta: delta.powerDelta,
      prestigeAfter: delta.after.prestige,
      prestigeDelta: delta.prestigeDelta,
      protectionUsed: !!delta.protectionUsed,
      finalStateSummary: summary,
      clientVersion: safeText(event.clientVersion, 40),
      durationMs: safeNumber(event.durationMs, 0),
      finishedAt: time,
      updatedAt: time
    }
  });
  const latestProfile = await getRankProfileDoc(openid, true);
  return ok({
    profile: publicRankPayload(latestProfile),
    delta: { ...delta, validationStatus: validation.validationStatus, riskFlags: validation.riskFlags, rankDeltaText: historyRecord.rankDeltaText },
    validationStatus: validation.validationStatus,
    riskFlags: validation.riskFlags,
    historyRecord
  });
}

async function getRankLeaderboard(event, openid = "") {
  const limit = Math.max(1, Math.min(100, safeNumber(event.limit, 50)));
  const res = await db.collection(RANK_PROFILES).orderBy("totalPower", "desc").limit(Math.max(limit, 50)).get();
  const list = safeArray(res.data)
    .map(publicRankPayload)
    .sort((a, b) => b.totalPower - a.totalPower || b.prestige - a.prestige || b.winRate - a.winRate || b.totalMatches - a.totalMatches || a.updatedAt - b.updatedAt)
    .slice(0, limit)
    .map((item, index) => ({ ...item, rank: index + 1 }));
  if (!openid) return ok({ leaderboard: list, selfRank: null });
  const selfProfile = await getRankProfileDoc(openid, true);
  const selfPublic = publicRankPayload(selfProfile);
  const selfRank = list.find(item => item.userId === selfPublic.userId)?.rank || null;
  return ok({ leaderboard: list, selfRank: selfRank ? { ...selfPublic, rank: selfRank } : selfPublic });
}

async function getRankPublicProfile(event, openid) {
  const userId = safeText(event.userId, 80);
  if (!userId) return fail("缺少玩家", "MISSING_USER");
  const res = await db.collection(RANK_PROFILES).where({ publicUserId: userId }).limit(1).get();
  const profile = safeArray(res.data)[0];
  if (!profile) return fail("未找到玩家排位资料", "RANK_PROFILE_NOT_FOUND");
  return ok({ profile: publicRankPayload(profile) });
}

function buildMatch(players) {
  const p0 = players[0];
  const p1 = players[1];
  const match = battle.createMatch({
    mode: "online",
    humanFaction: p0.faction,
    aiFaction: p1.faction,
    humanLeaderId: p0.leaderId,
    aiLeaderId: p1.leaderId,
    humanCustomDeckIds: p0.customDeckIds,
    aiCustomDeckIds: p1.customDeckIds
  });
  match.mode = "online";
  match.matchId = `${now()}-${Math.floor(Math.random() * 1000000)}`;
  match.players[0].name = p0.name || "玩家一";
  match.players[1].name = p1.name || "玩家二";
  match.logs.unshift("双方已确认出战配置，联网对战开始。 ");
  return match;
}

function pickUserInfo(event = {}) {
  return event.userInfoResult?.userInfo || event.userInfoButtonTap?.userInfo || event.userInfo || {};
}

function publicUser(userInfo = {}) {
  return {
    nickName: String(userInfo.nickName || ""),
    avatarUrl: String(userInfo.avatarUrl || "")
  };
}

function displayUser(user = {}) {
  const wechatUserInfo = publicUser(user.userInfo || {});
  const customProfile = publicUser(user.customProfile || {});
  return {
    nickName: customProfile.nickName || wechatUserInfo.nickName,
    avatarUrl: customProfile.avatarUrl || wechatUserInfo.avatarUrl
  };
}

// 房间与对局中的展示资料只认服务端已保存的用户资料（微信授权资料或已过内容安全检测的自定义资料）。
async function serverProfileFor(openid) {
  try {
    const res = await db.collection(USERS).doc(openid).get();
    return displayUser(res.data || {});
  } catch (err) {
    return { nickName: "", avatarUrl: "" };
  }
}

const DEFAULT_WECHAT_APPID = "wx144b92ed6dc01596";
let wechatAccessTokenCache = { token: "", expireAt: 0 };

function safeJsonParse(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  try { return JSON.parse(String(value)); } catch (err) { return fallback; }
}

function normalizeHeaders(headers = {}) {
  const result = {};
  Object.keys(headers || {}).forEach(key => { result[String(key).toLowerCase()] = headers[key]; });
  return result;
}

function isHttpEvent(event = {}) {
  return !!(event.httpMethod || event.requestContext?.httpMethod || event.headers || typeof event.body === "string");
}

function parseHttpEvent(event = {}) {
  const body = event.isBase64Encoded
    ? Buffer.from(String(event.body || ""), "base64").toString("utf8")
    : event.body;
  const payload = safeJsonParse(body, {});
  const query = event.queryStringParameters || {};
  const headers = normalizeHeaders(event.headers || {});
  const authorization = String(headers.authorization || "");
  const bearerToken = authorization.replace(/^Bearer\s+/i, "").trim();
  return {
    ...query,
    ...payload,
    token: payload.token || bearerToken || query.token || "",
    httpMethod: event.httpMethod || event.requestContext?.httpMethod || "",
    path: event.path || "",
    // 未登录接口（login）只能按来源 IP 频控
    clientIp: String(headers["x-forwarded-for"] || headers["x-real-ip"] || "").split(",")[0].trim()
  };
}

// 云存储文件在数据库里只保存 fileID（cloud://...）：
// getTempFileURL 返回的是带 sign/t 的临时链接，落库后到期即失效，头像会变空白。
// 这里在返回客户端前统一把 fileID 换成可访问的临时链接，避免每个出口各写一遍。
// key 为 fileID 的字段保持原样，客户端需要用它回传给 updateProfile。
const CLOUD_FILE_PREFIX = "cloud://";
const TEMP_URL_MAX_AGE_SECONDS = 2 * 60 * 60;
// 缓存时间取有效期的一半，保证返回给客户端的链接至少还有一小时可用
const TEMP_URL_CACHE_MS = 60 * 60 * 1000;
const tempUrlCache = new Map();

function collectCloudFileIds(value, found, key = "") {
  if (typeof value === "string") {
    if (key !== "fileID" && value.startsWith(CLOUD_FILE_PREFIX)) found.add(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach(item => collectCloudFileIds(item, found, key));
    return;
  }
  if (value && typeof value === "object") {
    Object.entries(value).forEach(([childKey, item]) => collectCloudFileIds(item, found, childKey));
  }
}

function replaceCloudFileIds(value, map, key = "") {
  if (typeof value === "string") {
    if (key === "fileID") return value;
    return map.get(value) || value;
  }
  if (Array.isArray(value)) return value.map(item => replaceCloudFileIds(item, map, key));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([childKey, item]) => [childKey, replaceCloudFileIds(item, map, childKey)]));
  }
  return value;
}

async function tempUrlsFor(fileIds) {
  const map = new Map();
  const missing = [];
  const time = now();
  fileIds.forEach(fileID => {
    const cached = tempUrlCache.get(fileID);
    if (cached && cached.expireAt > time) map.set(fileID, cached.url);
    else missing.push(fileID);
  });
  if (!missing.length) return map;
  try {
    const temp = await cloud.getTempFileURL({
      fileList: missing.map(fileID => ({ fileID, maxAge: TEMP_URL_MAX_AGE_SECONDS }))
    });
    safeArray(temp?.fileList).forEach(item => {
      const fileID = item?.fileID || "";
      const url = item?.tempFileURL || "";
      if (!fileID || !url) return;
      map.set(fileID, url);
      tempUrlCache.set(fileID, { url, expireAt: time + TEMP_URL_CACHE_MS });
    });
  } catch (err) {
    console.warn("[storage] getTempFileURL 失败，保留原始 fileID:", err?.message || err);
  }
  if (tempUrlCache.size > 2000) tempUrlCache.clear();
  return map;
}

async function resolveCloudFileUrls(result) {
  const found = new Set();
  collectCloudFileIds(result, found);
  if (!found.size) return result;
  const map = await tempUrlsFor([...found]);
  return map.size ? replaceCloudFileIds(result, map) : result;
}

function httpResponse(payload, statusCode = 200) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
      "Access-Control-Allow-Methods": "POST,OPTIONS"
    },
    body: JSON.stringify(payload)
  };
}

function assertWechatApiUrl(urlString) {
  let url;
  try { url = new URL(urlString); } catch (err) { throw new Error("无效的微信接口地址"); }
  if (url.protocol !== "https:" || url.hostname !== "api.weixin.qq.com") throw new Error("微信接口地址不合法");
  return url;
}

function httpsGetJson(urlString) {
  return new Promise((resolve, reject) => {
    let url;
    try { url = assertWechatApiUrl(urlString); } catch (err) { return reject(err); }
    const req = https.get(url, { timeout: 8000 }, res => {
      const chunks = [];
      res.on("data", chunk => chunks.push(chunk));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        const data = safeJsonParse(text, null);
        if (!data) return reject(new Error("微信接口响应解析失败"));
        resolve(data);
      });
    });
    req.on("timeout", () => req.destroy(new Error("微信接口超时")));
    req.on("error", reject);
  });
}

function httpsPostBuffer(urlString, payload) {
  return new Promise((resolve, reject) => {
    let url;
    try { url = assertWechatApiUrl(urlString); } catch (err) { return reject(err); }
    const body = Buffer.from(JSON.stringify(payload || {}));
    const req = https.request(url, {
      method: "POST",
      timeout: 10000,
      headers: {
        "Content-Type": "application/json",
        "Content-Length": body.length
      }
    }, res => {
      const chunks = [];
      res.on("data", chunk => chunks.push(chunk));
      res.on("end", () => resolve(Buffer.concat(chunks)));
    });
    req.on("timeout", () => req.destroy(new Error("微信接口超时")));
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function wechatConfig() {
  const appid = String(process.env.WECHAT_APPID || DEFAULT_WECHAT_APPID).trim();
  const secret = String(process.env.WECHAT_APP_SECRET || process.env.WX_APP_SECRET || "").trim();
  if (!appid || !secret) {
    const error = new Error("云函数缺少 WECHAT_APP_SECRET 环境变量");
    error.code = "WECHAT_SECRET_REQUIRED";
    throw error;
  }
  return { appid, secret };
}

async function getWechatAccessToken() {
  if (wechatAccessTokenCache.token && wechatAccessTokenCache.expireAt > now() + 60000) return wechatAccessTokenCache.token;
  const { appid, secret } = wechatConfig();
  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(appid)}&secret=${encodeURIComponent(secret)}`;
  const data = await httpsGetJson(url);
  if (!data.access_token) {
    const error = new Error(data.errmsg || "微信 access_token 获取失败");
    error.code = `WECHAT_ACCESS_TOKEN_${data.errcode || "FAILED"}`;
    throw error;
  }
  wechatAccessTokenCache = { token: String(data.access_token), expireAt: now() + Math.max(60, Number(data.expires_in || 7200) - 300) * 1000 };
  return wechatAccessTokenCache.token;
}

async function code2Session(code) {
  const jsCode = String(code || "").trim();
  if (!jsCode || jsCode.length > 128) {
    const error = new Error("缺少微信登录 code");
    error.code = "MISSING_CODE";
    throw error;
  }
  const { appid, secret } = wechatConfig();
  const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${encodeURIComponent(appid)}&secret=${encodeURIComponent(secret)}&js_code=${encodeURIComponent(jsCode)}&grant_type=authorization_code`;
  const data = await httpsGetJson(url);
  if (!data.openid) {
    const error = new Error(data.errmsg || "微信登录凭证校验失败");
    error.code = `WECHAT_CODE2SESSION_${data.errcode || "FAILED"}`;
    throw error;
  }
  return {
    OPENID: String(data.openid || ""),
    APPID: appid,
    UNIONID: String(data.unionid || ""),
    FROM_OPENID: ""
  };
}

async function resolveLoginContext(event = {}, wxContext = {}) {
  if (wxContext?.OPENID) return wxContext;
  return code2Session(event.code);
}

// 管理员 OpenID 在云函数环境变量（后台服务配置）中配置，支持用逗号分隔多个。
// 不再依赖数据库 admin_openids 集合。
const ADMIN_OPENIDS_CONFIG = String(process.env.ADMIN_OPENID || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

async function isAdministrator(openid) {
  if (!openid) return false;
  return ADMIN_OPENIDS_CONFIG.includes(openid);
}

async function authAdminStatsOpenid(event, wxContext) {
  const token = String(event.token || "").trim();
  if (!token) return wxContext.OPENID || "";
  const openid = await resolveToken(token);
  if (openid) return openid;
  const error = new Error("登录已过期，请重新登录");
  error.code = "AUTH_EXPIRED";
  throw error;
}

async function recordDailyActivity(openid, time) {
  const day = dayKey(time);
  if (!openid || !day) return;
  const id = sha1(`activity:${openid}:${day}`);
  await db.collection(DAILY_USER_ACTIVITY).doc(id).set({
    data: { openid, day, lastSeenAt: time, updatedAt: time }
  });
}

// 管理统计按分页拉取，并加硬上限，避免数据量增长后把云函数内存/超时打满。
// 一旦触发上限说明必须改为预聚合统计，日志会明确告警，返回结果也会标记数据被截断。
const ADMIN_FETCH_HARD_LIMIT = 20000;

async function fetchAllCollection(name, hardLimit = ADMIN_FETCH_HARD_LIMIT) {
  const collection = db.collection(name);
  const count = await collection.count();
  const total = Number(count.total || 0);
  const capped = Math.min(total, hardLimit);
  const limit = 1000;
  const pages = Math.ceil(capped / limit);
  const result = [];
  for (let index = 0; index < pages; index += 1) {
    const page = await collection.skip(index * limit).limit(limit).get();
    result.push(...safeArray(page.data));
  }
  if (total > hardLimit) {
    console.warn(`[adminStats] ${name} 共 ${total} 条，已截断为 ${hardLimit} 条，需尽快改为预聚合统计`);
  }
  return { rows: result, total, truncated: total > hardLimit };
}

async function getAdminStats(openid) {
  if (!(await isAdministrator(openid))) return fail("无权查看数据统计", "FORBIDDEN");
  const [users, matches, activities, rankMatches] = await Promise.all([
    fetchAllCollection(USERS),
    fetchAllCollection(MATCH_HISTORY),
    fetchAllCollection(DAILY_USER_ACTIVITY),
    fetchAllCollection(RANK_MATCHES)
  ]);
  const dataScope = {
    truncated: users.truncated || matches.truncated || activities.truncated || rankMatches.truncated,
    totals: {
      users: users.total,
      matches: matches.total,
      activities: activities.total,
      rankMatches: rankMatches.total
    }
  };
  return ok({
    stats: buildAdminStats({
      users: users.rows,
      matches: matches.rows,
      activities: activities.rows,
      rankMatches: rankMatches.rows,
      now: now()
    }),
    dataScope
  });
}

async function saveUser(openid, event, wxContext) {
  const incomingUserInfo = pickUserInfo(event);
  const time = now();
  let previous = null;
  try {
    const res = await db.collection(USERS).doc(openid).get();
    previous = res.data || null;
  } catch (err) {}
  const isNewUser = !previous;
  // 静默登录不会携带资料，必须保留已授权的微信资料，不能用空对象覆盖。
  const hasIncomingProfile = !!(incomingUserInfo && (incomingUserInfo.nickName || incomingUserInfo.avatarUrl));
  const userInfo = hasIncomingProfile
    ? incomingUserInfo
    : (previous?.userInfo || {});
  const data = {
    openid,
    // userInfo 只保存微信授权资料；用户在游戏内修改的信息绝不写入该字段。
    userInfo,
    userInfoResult: hasIncomingProfile ? (event.userInfoResult || event.userInfoButtonTap || null) : (previous?.userInfoResult || null),
    // 用户自定义昵称和头像独立保存，避免覆盖微信授权资料。
    customProfile: publicUser(previous?.customProfile || {}),
    wxContext: {
      APPID: wxContext.APPID || "",
      UNIONID: wxContext.UNIONID || "",
      FROM_OPENID: wxContext.FROM_OPENID || ""
    },
    lastLoginAt: time,
    updatedAt: time,
    createdAt: previous?.createdAt || time,
    loginCount: (Number(previous?.loginCount || 0) || 0) + 1
  };
  await db.collection(USERS).doc(openid).set({ data });
  try {
    await recordDailyActivity(openid, time);
  } catch (err) {
    console.warn("[activity] record daily activity failed", err?.message || err);
  }
  data.isNewUser = isNewUser;
  data.needsProfile = !String(displayUser(data).nickName || "").trim();
  return data;
}

async function login(event, wxContext) {
  const loginContext = await resolveLoginContext(event, wxContext);
  const openid = loginContext.OPENID;
  if (!openid) return fail("无法获取用户身份", "NO_OPENID");
  const user = await saveUser(openid, event, loginContext);
  // 令牌只存哈希，无法复用旧令牌，每次登录签发新令牌；旧令牌到期自然失效。
  const token = randomToken();
  const tokenStorage = await saveToken(token, openid);
  const expiresAt = now() + TOKEN_TTL_MS;
  if (Math.random() < 0.1) await cleanupExpiredTokens();
  return ok({
    token,
    expiresIn: Math.max(1, Math.ceil((expiresAt - now()) / 1000)),
    expiresAt,
    tokenStorage,
    isNewUser: !!user.isNewUser,
    needsProfile: !!user.needsProfile,
    user: displayUser(user)
  });
}

async function currentUser(openid) {
  let user = null;
  try {
    const res = await db.collection(USERS).doc(openid).get();
    user = res.data || null;
  } catch (err) {}
  const userProfile = displayUser(user || {});
  return ok({
    openid,
    user: userProfile,
    needsProfile: !String(userProfile.nickName || "").trim()
  });
}

function avatarContentType(ext) {
  if (ext === "png") return "image/png";
  if (ext === "gif") return "image/gif";
  return "image/jpeg";
}

// UGC 内容安全：昵称与头像都必须过微信内容安全检测。
// 命中违规或检测不可用时一律拒绝（fail-closed），不允许未检测内容进入数据库与对局展示。
//
// 这里不能用 cloud.openapi.security（云调用）：云调用要求云函数由小程序端
// wx.cloud.callFunction 触发以携带微信调用上下文，而本项目客户端是通过 HTTP 访问服务
// 直连 pvpRoom的，cloud.openapi 拿不到上下文，表现为「内容安全检测暂不可用」。
// 因此统一走自建 access_token 直调 api.weixin.qq.com，与房间二维码 getwxacodeunlimit 一致。
const SEC_CHECK_RISKY_ERRCODE = 87014;
// 61010：openid 不是「近两小时访问过小程序」的用户，v2 会拒绝；此时降级为 v1 只校验文本。
const SEC_CHECK_STALE_OPENID_ERRCODE = 61010;

function riskyContentError() {
  const error = new Error("内容可能包含违规信息，请修改后重试");
  error.code = "CONTENT_RISKY";
  return error;
}

function checkUnavailableError() {
  const error = new Error("内容安全检测暂不可用，请稍后重试");
  error.code = "CONTENT_CHECK_UNAVAILABLE";
  return error;
}

async function securityAccessToken() {
  try {
    return await getWechatAccessToken();
  } catch (err) {
    console.error("[security] 获取 access_token 失败:", err?.code || "", err?.message || err);
    throw checkUnavailableError();
  }
}

async function wechatPostJson(urlString, payload) {
  const buffer = await httpsPostBuffer(urlString, payload);
  const data = safeJsonParse(buffer.toString("utf8"), null);
  if (!data) throw new Error("微信接口响应解析失败");
  return data;
}

// scene 1=资料 2=评论 3=论坛 4=社交日志
async function assertTextSafe(content, openid, scene = 1) {
  const text = String(content || "").trim();
  if (!text) return;
  const accessToken = await securityAccessToken();
  const url = `https://api.weixin.qq.com/wxa/msg_sec_check?access_token=${encodeURIComponent(accessToken)}`;
  let data = null;
  try {
    data = await wechatPostJson(url, { version: 2, scene, openid, content: text });
    if (Number(data.errcode) === SEC_CHECK_STALE_OPENID_ERRCODE) {
      data = await wechatPostJson(url, { content: text });
    }
  } catch (err) {
    console.error("[security] msg_sec_check 调用失败:", err?.message || err);
    throw checkUnavailableError();
  }
  const errcode = Number(data.errcode || 0);
  if (errcode === SEC_CHECK_RISKY_ERRCODE) throw riskyContentError();
  if (errcode !== 0) {
    console.error("[security] msg_sec_check 返回异常:", errcode, data.errmsg || "");
    throw checkUnavailableError();
  }
  // v2 通过 result.suggest 返回结论；review 同样按不通过处理，避免放过疑似违规内容。
  const suggest = String(data.result?.suggest || "");
  if (suggest === "risky" || suggest === "review") throw riskyContentError();
}

// img_sec_check 只接受 multipart/form-data 的 media 字段
function httpsPostImage(urlString, fileContent, contentType, filename) {
  return new Promise((resolve, reject) => {
    let url;
    try { url = assertWechatApiUrl(urlString); } catch (err) { return reject(err); }
    const boundary = `----zhangyu${crypto.randomBytes(12).toString("hex")}`;
    const head = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="media"; filename="${filename}"\r\n`
      + `Content-Type: ${contentType}\r\n\r\n`
    );
    const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body = Buffer.concat([head, fileContent, tail]);
    const req = https.request(url, {
      method: "POST",
      timeout: 15000,
      headers: {
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "Content-Length": body.length
      }
    }, res => {
      const chunks = [];
      res.on("data", chunk => chunks.push(chunk));
      res.on("end", () => {
        const data = safeJsonParse(Buffer.concat(chunks).toString("utf8"), null);
        if (!data) return reject(new Error("微信接口响应解析失败"));
        resolve(data);
      });
    });
    req.on("timeout", () => req.destroy(new Error("微信接口超时")));
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function assertImageSafe(fileContent, contentType, filename = "avatar.jpg") {
  if (!fileContent || !fileContent.length) return;
  const accessToken = await securityAccessToken();
  const url = `https://api.weixin.qq.com/wxa/img_sec_check?access_token=${encodeURIComponent(accessToken)}`;
  let data = null;
  try {
    data = await httpsPostImage(url, fileContent, contentType, filename);
  } catch (err) {
    console.error("[security] img_sec_check 调用失败:", err?.message || err);
    throw checkUnavailableError();
  }
  const errcode = Number(data.errcode || 0);
  if (errcode === SEC_CHECK_RISKY_ERRCODE) throw riskyContentError();
  if (errcode !== 0) {
    console.error("[security] img_sec_check 返回异常:", errcode, data.errmsg || "");
    throw checkUnavailableError();
  }
}

// 微信 img_sec_check 只接受 1MB 以内的图片，这是内容安全检测的硬约束。
// 客户端上传前会把头像压到 512 宽以内，正常不会触达该上限；
// 这里的判断只用于兜底（例如极老基础库拿不到 compressImage），并给出可读原因。
const AVATAR_SEC_CHECK_MAX_BYTES = 1024 * 1024;
const AVATAR_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;

async function uploadAvatar(event, openid) {
  const extRaw = String(event.ext || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  // img_sec_check 只支持 png/jpg/jpeg/gif，webp 会被微信侧拒绝，这里统一按 jpg 处理
  const ext = ["jpg", "jpeg", "png", "gif"].includes(extRaw) ? extRaw : "jpg";
  const imageBase64 = String(event.imageBase64 || "").replace(/^data:image\/\w+;base64,/, "");
  if (!imageBase64) return fail("缺少头像数据", "MISSING_AVATAR");
  if (imageBase64.length > Math.ceil(AVATAR_UPLOAD_MAX_BYTES * 4 / 3) + 1024) {
    return fail("这张照片太大，换一张或裁剪后再试", "AVATAR_TOO_LARGE");
  }
  const fileContent = Buffer.from(imageBase64, "base64");
  if (!fileContent.length) return fail("缺少头像数据", "MISSING_AVATAR");
  if (fileContent.length > AVATAR_SEC_CHECK_MAX_BYTES) {
    return fail("这张照片太大，换一张或裁剪后再试", "AVATAR_TOO_LARGE");
  }
  await assertImageSafe(fileContent, avatarContentType(ext), `avatar.${ext}`);
  const cloudPath = `avatars/${openid}/${now()}-${crypto.randomBytes(4).toString("hex")}.${ext}`;
  const upload = await cloud.uploadFile({ cloudPath, fileContent });
  const fileID = upload.fileID || upload.fileId || "";
  if (!fileID) return fail("头像上传失败，请重试", "AVATAR_UPLOAD_FAILED");
  // avatarUrl 返回 fileID，出口会统一替换为临时链接供客户端预览；
  // fileID 字段保持原样，客户端提交 updateProfile 时必须回传它而不是临时链接。
  return ok({ fileID, avatarUrl: fileID, cloudPath });
}

async function saveWechatProfile(event, openid) {
  const userInfo = event.userInfo && typeof event.userInfo === "object" ? event.userInfo : {};
  const wechatUserInfo = publicUser(userInfo);
  if (!wechatUserInfo.nickName && !wechatUserInfo.avatarUrl) return ok({ updated: false });
  const patch = {
    updatedAt: now(),
    userInfo,
    userInfoResult: event.userInfoResult || null,
    profile: _.remove()
  };
  let user = null;
  try {
    await db.collection(USERS).doc(openid).update({ data: patch });
    const res = await db.collection(USERS).doc(openid).get();
    user = res.data || null;
  } catch (err) {
    user = {
      openid,
      createdAt: now(),
      updatedAt: now(),
      userInfo,
      userInfoResult: event.userInfoResult || null,
      customProfile: {}
    };
    await db.collection(USERS).doc(openid).set({ data: user });
  }
  return ok({ updated: true, userInfo: wechatUserInfo, user: displayUser(user) });
}

// 头像只接受本人上传到本环境云存储的 fileID：
// 1) 临时链接带签名且会过期，落库后头像必然失效，因此绝不入库；
// 2) 只认avatars/{openid}/ 路径，防止引用他人头像或把任意站外图片设成头像（绕过内容安全检测）。
function ownedAvatarFileId(value, openid) {
  const fileID = String(value || "").trim();
  if (!fileID.startsWith(CLOUD_FILE_PREFIX)) return "";
  return fileID.includes(`/avatars/${openid}/`) ? fileID : "";
}

async function removeAvatarFile(fileID) {
  if (!fileID || !fileID.startsWith(CLOUD_FILE_PREFIX)) return;
  try {
    await cloud.deleteFile({ fileList: [fileID] });
    tempUrlCache.delete(fileID);
  } catch (err) {
    console.warn("[profile] 删除旧头像失败:", err?.message || err);
  }
}

async function updateProfile(event, openid) {
  const profile = event.profile && typeof event.profile === "object" ? event.profile : {};
  const nickName = String(profile.nickName || "").trim().slice(0, 24);
  const nextAvatarFileId = ownedAvatarFileId(profile.avatarUrl, openid);
  if (!nickName && !nextAvatarFileId) return ok({ updated: false });
  // 自定义昵称属于会展示给其他玩家的 UGC，入库前必须过内容安全检测。
  await assertTextSafe(nickName, openid, 1);
  let previous = null;
  try {
    const res = await db.collection(USERS).doc(openid).get();
    previous = res.data || null;
  } catch (err) {}
  const previousAvatar = String(previous?.customProfile?.avatarUrl || "").trim();
  // 只改昵称时不带 fileID，此时必须保留已有头像，不能被空值或临时链接覆盖。
  const avatarUrl = nextAvatarFileId || previousAvatar;
  const customProfile = { nickName, avatarUrl };
  const patch = { updatedAt: now(), customProfile, profile: _.remove() };
  let user = null;
  try {
    await db.collection(USERS).doc(openid).update({ data: patch });
    const res = await db.collection(USERS).doc(openid).get();
    user = res.data || null;
  } catch (err) {
    user = {
      openid,
      createdAt: now(),
      updatedAt: now(),
      userInfo: {},
      customProfile
    };
    await db.collection(USERS).doc(openid).set({ data: user });
  }
  // 换了新头像后删掉旧文件，避免云存储里不断堆积废弃头像
  if (nextAvatarFileId && previousAvatar && previousAvatar !== nextAvatarFileId) {
    await removeAvatarFile(previousAvatar);
  }
  return ok({ updated: true, customProfile, user: displayUser(user) });
}

async function authOpenid(event, wxContext) {
  const token = String(event.token || "").trim();
  if (token) {
    const openid = await resolveToken(token);
    if (!openid) {
      const error = new Error("登录已过期，请重新登录");
      error.code = "AUTH_EXPIRED";
      throw error;
    }
    return openid;
  }
  return wxContext.OPENID || "";
}

function pendingOwner(match) {
  if (!match || !match.pending) return match ? match.current : 0;
  if (Number.isInteger(match.pending.playerIndex)) return match.pending.playerIndex;
  return match.current || 0;
}

function assertCanAct(match, playerIndex, actionType) {
  if (!match || match.over) throw new Error("牌局已结束");
  // 认输/掉线判负是单方行为，对局进行中的任意阶段（换牌、选择目标、对方出牌时）均可发起
  if (actionType === "surrender" || actionType === "disconnectLoss") return;
  if (actionType === "continueRound") return;
  if (match.mulligan && match.mulligan.active) {
    if (actionType !== "mulliganSwap" && actionType !== "mulliganDone") throw new Error("请先完成换牌");
    if (match.mulligan.simultaneous && match.mode === "online") {
      if (match.mulligan.done?.[playerIndex]) throw new Error("等待对方换牌");
      return;
    }
    if (match.mulligan.current !== playerIndex) throw new Error("等待对方换牌");
    return;
  }
  if (match.pending) {
    if (pendingOwner(match) !== playerIndex) throw new Error("等待对方选择目标");
    if (actionType !== "resolvePending" && actionType !== "cancelPending") throw new Error("请先处理当前选择");
    return;
  }
  if (match.current !== playerIndex) throw new Error("还没轮到你行动");
}

function applyBattleAction(match, playerIndex, action = {}) {
  const type = String(action.type || "");
  assertCanAct(match, playerIndex, type);
  if (type === "mulliganSwap") return battle.mulliganSwap(match, action.cardUid, playerIndex);
  if (type === "mulliganDone") return battle.finishMulligan(match, playerIndex);
  if (type === "resolvePending") return battle.resolvePending(match, action.choice || {});
  if (type === "cancelPending") return battle.cancelPending(match);
  if (type === "card") return battle.playCard(match, action.cardUid, action.row);
  if (type === "pass") return battle.pass(match);
  if (type === "continueRound") return match.roundTransition ? battle.continueRoundTransition(match) : true;
  if (type === "leader") return battle.useLeader(match, playerIndex);
  if (type === "surrender") return battle.surrender(match, playerIndex);
  if (type === "disconnectLoss") return battle.surrender(match, playerIndex, "disconnect");
  throw new Error("未知行动");
}

async function createRoom(event, openid) {
  const rules = { ...safeRules(event.rules), version: 1, changedAt: now() };
  const profile = await serverProfileFor(openid);
  const player = makePlayer(openid, 0, event.setup, rules, profile);
  // 低频触发清理，避免每次建房都额外查询集合
  if (Math.random() < 0.1) {
    await cleanupExpiredRooms();
    await voidStalePlayingRooms();
  }
  for (let i = 0; i < 5; i++) {
    const roomId = createRoomId();
    const room = {
      _id: roomId,
      roomId,
      status: "waiting",
      players: [player],
      readyPlayers: [false],
      selectionRuleVersion: null,
      rules,
      match: null,
      turnSeq: 0,
      createdAt: now(),
      updatedAt: now(),
      expireAt: now() + ROOM_TTL_MS
    };
    try {
      const existed = await getRoom(roomId);
      if (existed && !roomReusable(existed)) continue;
      await db.collection(ROOMS).doc(roomId).set({ data: roomData(room) });
      return ok({ roomId, playerIndex: 0, room: publicRoom(room, 0) });
    } catch (err) {
      if (i === 4) throw err;
    }
  }
  throw new Error("房间创建失败");
}

async function generateRoomCode(event, openid) {
  const roomId = normalizeRoomId(event.roomId);
  const room = await getRoom(roomId);
  if (!room) return fail("房间不存在", "NOT_FOUND");
  if (room.status === "dissolved") return fail("房间已解散", "ROOM_DISSOLVED");
  if (playerIndexOf(room, openid) < 0) return fail("你不在这个房间", "FORBIDDEN");

  const envVersion = ["develop", "trial", "release"].includes(event.envVersion) ? event.envVersion : "trial";
  const accessToken = await getWechatAccessToken();
  const url = `https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=${encodeURIComponent(accessToken)}`;
  const imageBuffer = await httpsPostBuffer(url, {
    scene: `r=${roomId}`,
    env_version: envVersion,
    width: 360,
    auto_color: false,
    line_color: { r: 47, g: 36, b: 23 },
    is_hyaline: false,
    check_path: false
  });
  const maybeJson = safeJsonParse(imageBuffer.toString("utf8"), null);
  if (maybeJson && maybeJson.errcode) {
    const error = new Error(maybeJson.errmsg || "房间二维码生成失败");
    error.code = `WECHAT_WXACODE_${maybeJson.errcode}`;
    throw error;
  }
  if (!imageBuffer || !imageBuffer.length) throw new Error("房间二维码生成失败");
  return ok({ roomId, envVersion, imageBase64: imageBuffer.toString("base64") });
}

async function getRoomForPlayer(event, openid) {
  const roomId = normalizeRoomId(event.roomId);
  let room = await getRoom(roomId);
  if (!room) return fail("房间不存在", "NOT_FOUND");
  const playerIndex = playerIndexOf(room, openid);
  if (playerIndex < 0) return fail("你不在这个房间", "FORBIDDEN");
  room = await touchRoomPlayer(room, playerIndex);
  room = await settleDisconnectedPlayer(room);
  return ok({ roomId, playerIndex, room: publicRoom(room, playerIndex) });
}

async function joinRoom(event, openid) {
  const roomId = normalizeRoomId(event.roomId);
  const profile = await serverProfileFor(openid);
  try {
    const result = await runRoomTransaction(async transaction => {
      const ref = transaction.collection(ROOMS).doc(roomId);
      const snapshot = await ref.get();
      const room = snapshot.data ? { ...snapshot.data, _id: roomId, roomId } : null;
      if (!room) throw roomActionError("房间不存在", "NOT_FOUND");
      if (room.status === "dissolved") throw roomActionError("房主已解散房间", "ROOM_DISSOLVED");
      const existedIndex = playerIndexOf(room, openid);
      if (existedIndex >= 0) return { room, playerIndex: existedIndex };
      if (room.status !== "waiting") throw roomActionError("房间已开始或已结束", "ROOM_CLOSED");
      if ((room.players || []).length >= 2) throw roomActionError("房间已满", "ROOM_FULL");

      const activeRules = safeRules(room.rules || {});
      const existingPlayers = cleanPlayers(room.players);
      const players = existingPlayers.concat(makePlayer(openid, 1, event.setup, activeRules, profile));
      const readyPlayers = normalizedReadyPlayers({ ...room, players: existingPlayers }).concat(false);
      const updatedAt = now();
      const nextRoom = {
        ...room,
        status: "waiting",
        players,
        readyPlayers,
        selectionRuleVersion: null,
        match: null,
        turnSeq: (room.turnSeq || 0) + 1,
        updatedAt
      };
      await ref.update({
        data: {
          status: nextRoom.status,
          players,
          readyPlayers,
          selectionRuleVersion: null,
          match: null,
          turnSeq: nextRoom.turnSeq,
          updatedAt
        }
      });
      return { room: nextRoom, playerIndex: 1 };
    });
    return ok({ roomId, playerIndex: result.playerIndex, room: publicRoom(result.room, result.playerIndex) });
  } catch (err) {
    const failure = roomActionFailure(err);
    if (failure) return failure;
    throw err;
  }
}

async function updateRules(event, openid) {
  const roomId = normalizeRoomId(event.roomId);
  try {
    const nextRoom = await runRoomTransaction(async transaction => {
      const ref = transaction.collection(ROOMS).doc(roomId);
      const snapshot = await ref.get();
      const room = snapshot.data ? { ...snapshot.data, _id: roomId, roomId } : null;
      if (!room) throw roomActionError("房间不存在", "NOT_FOUND");
      if (playerIndexOf(room, openid) !== 0) throw roomActionError("只有房主可以修改规则", "FORBIDDEN");
      if (room.status === "dissolved") throw roomActionError("房间已解散", "ROOM_DISSOLVED");
      if (room.status === "playing" || room.status === "selecting") throw roomActionError("本局已开始，不能修改规则", "ROOM_BUSY");
      const previous = {
        ...safeRules(room.rules || {}),
        version: Math.max(0, Number(room.rules?.version || 0) || 0)
      };
      if (Number(event.expectedRuleVersion || 0) !== previous.version) {
        throw roomActionError("房间规则已更新，请重试", "STALE_RULES");
      }
      const updatedAt = now();
      const rules = { ...safeRules(event.rules, previous), version: previous.version + 1, changedAt: updatedAt };
      const next = applyRuleChange(room, rules, updatedAt);
      await ref.update({
        data: {
          status: next.status,
          rules,
          players: next.players,
          readyPlayers: next.readyPlayers,
          selectionRuleVersion: null,
          match: null,
          turnSeq: next.turnSeq,
          updatedAt
        }
      });
      return next;
    });
    return ok({ roomId, playerIndex: 0, room: publicRoom(nextRoom, 0) });
  } catch (err) {
    const failure = roomActionFailure(err);
    if (failure) return failure;
    throw err;
  }
}

async function setReady(event, openid) {
  const roomId = normalizeRoomId(event.roomId);
  const desiredReady = !!event.ready;
  const expectedRuleVersion = Number(event.expectedRuleVersion || 0);
  const traceId = String(event.traceId || `server-${now()}`).slice(0, 64);
  console.log("[pvp-ready-debug] server setReady begin", { version: PVP_READY_DEBUG_VERSION, traceId, roomId, desiredReady, expectedRuleVersion });

  try {
    const result = await runRoomTransaction(async transaction => {
      const ref = transaction.collection(ROOMS).doc(roomId);
      const snapshot = await ref.get();
      const room = snapshot.data ? { ...snapshot.data, _id: roomId, roomId } : null;
      console.log("[pvp-ready-debug] server setReady transaction read", { traceId, room: roomReadyDebug(room) });
      if (!room) throw roomActionError("房间不存在", "NOT_FOUND");
      const playerIndex = playerIndexOf(room, openid);
      if (playerIndex < 0) throw roomActionError("加入信息同步中，请再点一次准备", "PLAYER_SYNCING");

      const transition = applyReady(room, playerIndex, desiredReady, expectedRuleVersion, now());
      const nextRoom = transition.room;
      if (transition.changed) {
        console.log("[pvp-ready-debug] server setReady transaction write", {
          traceId,
          playerIndex,
          desiredReady,
          transitioned: transition.transitioned,
          next: roomReadyDebug(nextRoom)
        });
        await ref.update({
          data: {
            status: nextRoom.status,
            players: nextRoom.players,
            readyPlayers: nextRoom.readyPlayers,
            selectionRuleVersion: nextRoom.selectionRuleVersion ?? null,
            match: null,
            turnSeq: nextRoom.turnSeq,
            updatedAt: nextRoom.updatedAt
          }
        });
      }
      return { room: nextRoom, playerIndex, transitioned: transition.transitioned };
    });
    console.log("[pvp-ready-debug] server setReady success", { traceId, playerIndex: result.playerIndex, transitioned: result.transitioned, room: roomReadyDebug(result.room) });
    return ok({
      roomId,
      playerIndex: result.playerIndex,
      room: publicRoom(result.room, result.playerIndex),
      readyAccepted: true,
      transitioned: result.transitioned,
      traceId
    });
  } catch (err) {
    const failure = roomActionFailure(err);
    if (failure) return failure;
    console.error("[pvp-ready-debug] server setReady failed", { traceId, desiredReady, expectedRuleVersion, message: err?.message || String(err) });
    throw err;
  }
}

async function submitSetup(event, openid) {
  const roomId = normalizeRoomId(event.roomId);
  const profile = await serverProfileFor(openid);
  try {
    const result = await runRoomTransaction(async transaction => {
      const ref = transaction.collection(ROOMS).doc(roomId);
      const snapshot = await ref.get();
      const room = snapshot.data ? { ...snapshot.data, _id: roomId, roomId } : null;
      if (!room) throw roomActionError("房间不存在", "NOT_FOUND");
      if (room.status !== "selecting") throw roomActionError("还未进入选择卡牌阶段", "NOT_SELECTING");
      if (Number(event.selectionRuleVersion || 0) !== Number(room.selectionRuleVersion || 0)) {
        throw roomActionError("出战配置已过期，请重新确认", "STALE_SELECTION");
      }
      const playerIndex = playerIndexOf(room, openid);
      if (playerIndex < 0) throw roomActionError("你不在这个房间", "FORBIDDEN");
      const rules = safeRules(room.rules || {});
      const setup = safeSetup(event.setup, rules, profile);
      const updatedAt = now();
      let players = cleanPlayers(room.players).map((player, index) => index === playerIndex
        ? { ...player, ...setup, setupReady: true, lastSeenAt: updatedAt }
        : player);
      const allReady = players.length >= 2 && players.slice(0, 2).every(player => player.setupReady);
      if (allReady) players = players.map(player => ({ ...player, lastSeenAt: updatedAt }));
      const match = allReady ? buildMatch(players) : null;
      const status = allReady ? "playing" : "selecting";
      const nextRoom = { ...room, status, players, match, turnSeq: (room.turnSeq || 0) + 1, updatedAt };
      await ref.update({
        data: { status, players, match: match ? _.set(match) : null, turnSeq: nextRoom.turnSeq, updatedAt }
      });
      return { room: nextRoom, playerIndex };
    });
    return ok({ roomId, playerIndex: result.playerIndex, room: publicRoom(result.room, result.playerIndex) });
  } catch (err) {
    const failure = roomActionFailure(err);
    if (failure) return failure;
    throw err;
  }
}

async function returnToRoom(event, openid) {
  const roomId = normalizeRoomId(event.roomId);
  if (event.readOnly) {
    const room = await getRoom(roomId);
    if (!room) return fail("房间不存在", "NOT_FOUND");
    const playerIndex = playerIndexOf(room, openid);
    if (playerIndex < 0) return fail("你不在这个房间", "FORBIDDEN");
    return ok({ roomId, playerIndex, room: publicRoom(room, playerIndex) });
  }

  try {
    const result = await runRoomTransaction(async transaction => {
      const ref = transaction.collection(ROOMS).doc(roomId);
      const snapshot = await ref.get();
      const room = snapshot.data ? { ...snapshot.data, _id: roomId, roomId } : null;
      if (!room) throw roomActionError("房间不存在", "NOT_FOUND");
      const playerIndex = playerIndexOf(room, openid);
      if (playerIndex < 0) throw roomActionError("你不在这个房间", "FORBIDDEN");
      if (room.status !== "finished") return { room, playerIndex };
      if (!event.matchId || String(event.matchId) !== String(room.match?.matchId || "")) {
        throw roomActionError("对局状态已更新，请重新操作", "STALE_MATCH");
      }

      const updatedAt = now();
      const markedPlayers = cleanPlayers(room.players).map((player, index) => index === playerIndex
        ? { ...player, rematchReady: true, lastSeenAt: updatedAt }
        : player);
      const bothReady = markedPlayers.length >= 2 && markedPlayers.slice(0, 2).every(player => player?.rematchReady);
      if (!bothReady) {
        const nextRoom = { ...room, players: markedPlayers, turnSeq: (room.turnSeq || 0) + 1, updatedAt };
        await ref.update({ data: { players: markedPlayers, turnSeq: nextRoom.turnSeq, updatedAt } });
        return { room: nextRoom, playerIndex };
      }

      const players = resetPlayerFlags(markedPlayers);
      const readyPlayers = emptyReadyPlayers(players);
      const nextRoom = { ...room, status: "waiting", players, readyPlayers, selectionRuleVersion: null, match: null, turnSeq: (room.turnSeq || 0) + 1, updatedAt };
      await ref.update({
        data: { status: "waiting", players, readyPlayers, selectionRuleVersion: null, match: null, turnSeq: nextRoom.turnSeq, updatedAt }
      });
      return { room: nextRoom, playerIndex };
    });
    return ok({ roomId, playerIndex: result.playerIndex, room: publicRoom(result.room, result.playerIndex) });
  } catch (err) {
    const failure = roomActionFailure(err);
    if (failure) return failure;
    throw err;
  }
}

async function submitAction(event, openid) {
  const roomId = normalizeRoomId(event.roomId);
  const room = await getRoom(roomId);
  if (!room) return fail("房间不存在", "NOT_FOUND");
  if (room.status !== "playing") return fail("房间未在对战中", "NOT_PLAYING");
  const playerIndex = playerIndexOf(room, openid);
  if (playerIndex < 0) return fail("你不在这个房间", "FORBIDDEN");
  const actionType = String(event.battleAction?.type || "");
  room.players = safeArray(room.players).map((player, index) => index === playerIndex ? { ...player, lastSeenAt: now() } : player);
  const allowStaleMulligan = room.match?.mulligan?.active
    && room.match.mulligan.simultaneous
    && (actionType === "mulliganSwap" || actionType === "mulliganDone");
  // 认输/掉线结果确定（仅标记该玩家为负），与当前轮次序号无关，允许用旧的 turnSeq 提交，避免对方刚出牌时被 STALE_TURN 拒绝
  const allowStaleAction = actionType === "surrender" || actionType === "disconnectLoss" || actionType === "continueRound";
  if (!allowStaleMulligan && !allowStaleAction && Number.isFinite(Number(event.turnSeq)) && Number(event.turnSeq) !== Number(room.turnSeq || 0)) {
    return fail("牌局已更新，请稍后再试", "STALE_TURN");
  }
  const match = room.match;
  const changed = applyBattleAction(match, playerIndex, event.battleAction || {});
  if (!changed) return fail("行动无效", "INVALID_ACTION");
  delete match.localPlayerIndex;
  const status = match.over ? "finished" : "playing";
  const nextRoom = {
    ...room,
    status,
    match,
    turnSeq: (room.turnSeq || 0) + 1,
    updatedAt: now()
  };
  await db.collection(ROOMS).doc(roomId).update({
    data: {
      status,
      players: room.players,
      match: _.set(match),
      turnSeq: nextRoom.turnSeq,
      updatedAt: nextRoom.updatedAt
    }
  });
  if (status === "finished") await saveOnlineMatchHistoryForPlayers(nextRoom);
  return ok({ roomId, playerIndex, room: publicRoom(nextRoom, playerIndex) });
}

async function leaveRoom(event, openid) {
  const roomId = normalizeRoomId(event.roomId);
  const room = await getRoom(roomId);
  if (!room) return fail("房间不存在", "NOT_FOUND");
  const playerIndex = playerIndexOf(room, openid);
  if (playerIndex < 0) return ok({ roomId, room: publicRoom(room, playerIndex) });

  room.updatedAt = now();
  room.turnSeq = (room.turnSeq || 0) + 1;
  room.players = safeArray(room.players).map((player, index) => index === playerIndex ? { ...player, lastSeenAt: room.updatedAt } : player);

  if (room.status === "playing" && room.match && !room.match.over) {
    battle.surrender(room.match, playerIndex, "disconnect");
    room.status = "finished";
    await db.collection(ROOMS).doc(roomId).update({
      data: {
        status: room.status,
        players: room.players,
        match: _.set(room.match),
        turnSeq: room.turnSeq,
        updatedAt: room.updatedAt
      }
    });
    await saveOnlineMatchHistoryForPlayers(room);
    return ok({ roomId, playerIndex, room: publicRoom(room, playerIndex) });
  }

  if (playerIndex === 0) {
    room.status = "dissolved";
    room.match = null;
    room.dissolvedAt = room.updatedAt;
    await db.collection(ROOMS).doc(roomId).update({
      data: {
        status: room.status,
        players: room.players,
        match: null,
        dissolvedAt: room.dissolvedAt,
        turnSeq: room.turnSeq,
        updatedAt: room.updatedAt
      }
    });
    return ok({ roomId, playerIndex, room: publicRoom(room, playerIndex) });
  }

  // 好友(玩家1)在等待阶段离开房间：将其移出房间，房间回到仅房主状态，便于房主感知好友离开
  if (room.status === "waiting") {
    room.players = cleanPlayers(room.players).filter((_, index) => index !== playerIndex);
    room.readyPlayers = normalizedReadyPlayers(room).filter((_, index) => index !== playerIndex);
    await db.collection(ROOMS).doc(roomId).update({
      data: {
        status: room.status,
        players: room.players,
        readyPlayers: room.readyPlayers,
        turnSeq: room.turnSeq,
        updatedAt: room.updatedAt
      }
    });
    return ok({ roomId, playerIndex, room: publicRoom(room, playerIndex) });
  }

  await db.collection(ROOMS).doc(roomId).update({
    data: {
      status: room.status,
      players: room.players,
      match: _.set(room.match),
      turnSeq: room.turnSeq,
      updatedAt: room.updatedAt
    }
  });
  return ok({ roomId, playerIndex, room: publicRoom(room, playerIndex) });
}

async function handleRpc(event = {}, wxContext = {}) {
  const action = String(event.action || "");
  // 每次冷启动首次进入时确保集合存在（创建 users / match_history 等）
  await ensureCollections();
  if (action === "login") {
    if (await isRateLimited(action, `ip:${event.clientIp || wxContext.OPENID || "unknown"}`)) {
      return fail("登录请求过于频繁，请稍后再试", "RATE_LIMITED");
    }
    return login(event, wxContext);
  }
  if (action === "getLoginContext") return ok({ wxContext: { APPID: wxContext.APPID || "", UNIONID: wxContext.UNIONID || "" } });
  if (action === "getAdminStats") {
    const openid = await authAdminStatsOpenid(event, wxContext);
    if (!openid) return fail("无法获取用户身份", "NO_OPENID");
    if (await isRateLimited(action, `openid:${openid}`)) return fail("操作过于频繁，请稍后再试", "RATE_LIMITED");
    return getAdminStats(openid);
  }
  if (action === "getRankLeaderboard") {
    let openid = "";
    try { openid = await authOpenid(event, wxContext); } catch (err) { openid = ""; }
    if (await isRateLimited(action, openid ? `openid:${openid}` : `ip:${event.clientIp || "unknown"}`)) {
      return fail("操作过于频繁，请稍后再试", "RATE_LIMITED");
    }
    return getRankLeaderboard(event, openid);
  }

  const openid = await authOpenid(event, wxContext);
  if (!openid) return fail("无法获取用户身份", "NO_OPENID");
  if (await isRateLimited(action, `openid:${openid}`)) return fail("操作过于频繁，请稍后再试", "RATE_LIMITED");
  if (action === "currentUser") return currentUser(openid);
  if (action === "getAdminStatus") return ok({ isAdmin: await isAdministrator(openid) });
  if (action === "getRankProfile") return getRankProfile(event, openid);
  if (action === "startRankMatch") return startRankMatch(event, openid);
  if (action === "reportRankProgress") return reportRankProgress(event, openid);
  if (action === "finishRankMatch") return finishRankMatch(event, openid);
  if (action === "getRankPublicProfile") return getRankPublicProfile(event, openid);
  if (action === "uploadAvatar") return uploadAvatar(event, openid);
  if (action === "saveWechatProfile") return saveWechatProfile(event, openid);
  if (action === "updateProfile") return updateProfile(event, openid);
  if (action === "createRoom") return createRoom(event, openid);
  if (action === "generateRoomCode") return generateRoomCode(event, openid);
  if (action === "getRoom") return getRoomForPlayer(event, openid);
  if (action === "joinRoom") return joinRoom(event, openid);
  if (action === "updateRules") return updateRules(event, openid);
  if (action === "setReady") return setReady(event, openid);
  if (action === "submitSetup") return submitSetup(event, openid);
  if (action === "returnToRoom") return returnToRoom(event, openid);
  if (action === "submitAction") return submitAction(event, openid);
  if (action === "leaveRoom") return leaveRoom(event, openid);
  if (action === "recordMatchHistory") return recordMatchHistory(event, openid);
  if (action === "listMatchHistory") return listMatchHistory(event, openid);
  return fail("未知请求");
}

function getSafeWxContext() {
  try { return cloud.getWXContext() || {}; } catch (err) { return {}; }
}

exports.main = async (event = {}) => {
  const http = isHttpEvent(event);
  if (http && String(event.httpMethod || "").toUpperCase() === "OPTIONS") return httpResponse({}, 204);
  try {
    const wxContext = getSafeWxContext();
    const rpcEvent = http ? parseHttpEvent(event) : event;
    const result = await handleRpc(rpcEvent, wxContext);
    const resolved = await resolveCloudFileUrls(result);
    return http ? httpResponse(resolved) : resolved;
  } catch (err) {
    console.error("[pvpRoom] failed", err);
    const result = fail(err.message || "服务异常", err.code || "SERVER_ERROR");
    return http ? httpResponse(result) : result;
  }
};

// 仅供 scripts/smoke-pvp-flow.js 做单元级回归，不参与线上调用链路。
exports.viewerSafeMatch = viewerSafeMatch;
exports.resolveCloudFileUrls = resolveCloudFileUrls;
exports.ownedAvatarFileId = ownedAvatarFileId;
