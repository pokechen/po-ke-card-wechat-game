const cloud = require("wx-server-sdk");
const crypto = require("crypto");
const https = require("https");
let redisModule = null;
try { redisModule = require("redis"); } catch (err) {}
const battle = require("./js/core/battle");
const rankCore = require("./js/core/rank");
const { FACTION_KEYS, deckStatus } = require("./js/core/cards");
const { buildAdminStats, dayKey } = require("./shared/core/adminStats");

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
const PVP_READY_DEBUG_VERSION = "20260720-ready-debug-v1";

let redisClientPromise = null;
let redisUnavailableLogged = false;

function ok(data = {}) {
  return { ok: true, ...data };
}

function fail(message, code = "BAD_REQUEST") {
  return { ok: false, code, message };
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

function redisKey(token) {
  return `auth_token:${token}`;
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

async function saveToken(token, openid) {
  const client = await getRedisClient();
  if (client) {
    try {
      await client.set(redisKey(token), openid, { EX: TOKEN_TTL_SECONDS });
      return "redis";
    } catch (err) {
      console.warn("[auth] Redis 写入失败，回退到云数据库 token 表:", err?.message || err);
    }
  }
  const expireAt = now() + TOKEN_TTL_MS;
  await db.collection(USER_TOKENS).doc(token).set({ data: { openid, createdAt: now(), expireAt } });
  return "database";
}

async function findActiveDatabaseToken(openid) {
  try {
    const res = await db.collection(USER_TOKENS)
      .where({ openid, expireAt: _.gt(now()) })
      .orderBy("expireAt", "desc")
      .limit(1)
      .get();
    const data = res.data?.[0];
    const expiresAt = Number(data?.expireAt || 0);
    const token = String(data?._id || "").trim();
    return token && expiresAt > now() ? { token, expiresAt } : null;
  } catch (err) {
    console.warn("[auth] 查询现有数据库 token 失败，将生成新 token:", err?.message || err);
    return null;
  }
}

async function resolveToken(token) {
  const safeToken = String(token || "").trim();
  if (!safeToken) return "";
  const client = await getRedisClient();
  if (client) {
    try {
      const openid = await client.get(redisKey(safeToken));
      if (openid) return openid;
    } catch (err) {
      console.warn("[auth] Redis 读取失败，尝试云数据库 token 表:", err?.message || err);
    }
  }
  try {
    const res = await db.collection(USER_TOKENS).doc(safeToken).get();
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

function safeFaction(value, fallback = "Northern Realms") {
  return FACTION_KEYS.includes(value) ? value : fallback;
}

function safeRules(input = {}, previous = null) {
  const source = input && typeof input === "object" ? input : {};
  const fallbackFaction = safeFaction(previous?.faction || "Northern Realms");
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

function safeSetup(input = {}, rules = null) {
  const setup = input && typeof input === "object" ? input : {};
  const activeRules = safeRules(rules || {});
  const requestedFaction = String(setup.faction || "Northern Realms");
  const faction = activeRules.factionMode === "random"
    ? "random"
    : (activeRules.factionMode === "fixed"
      ? activeRules.faction
      : (requestedFaction === "random" ? "random" : safeFaction(requestedFaction)));
  const randomLineup = faction === "random";
  const rawIds = Array.isArray(setup.customDeckIds) ? setup.customDeckIds.map(id => String(id)).slice(0, 40) : [];
  const status = activeRules.deckMode === "autoOnly" || randomLineup ? { valid: false, ids: [] } : deckStatus(rawIds, faction);
  return {
    name: String(setup.name || "").trim().slice(0, 12),
    avatarUrl: String(setup.avatarUrl || "").trim().slice(0, 1024),
    faction,
    leaderId: randomLineup ? "random" : String(setup.leaderId || ""),
    customDeckIds: status.valid ? status.ids : []
  };
}

function makePlayer(openid, index, setup, rules) {
  const safe = safeSetup(setup, rules);
  const time = now();
  return {
    openid,
    index,
    name: safe.name || `玩家${index + 1}`,
    avatarUrl: safe.avatarUrl,
    faction: safe.faction,
    leaderId: safe.leaderId,
    customDeckIds: safe.customDeckIds,
    ready: false,
    setupReady: false,
    lastSeenAt: time
  };
}

function resetPlayerFlags(players = []) {
  return players.map(player => ({ ...player, ready: false, setupReady: false }));
}

function readyPlayersOf(players = []) {
  return players.map(player => !!player.ready);
}

function roomPlayerReady(room, index) {
  const players = room?.players || [];
  const readyPlayers = Array.isArray(room?.readyPlayers) ? room.readyPlayers : [];
  return !!(players[index]?.ready || readyPlayers[index]);
}

function roomReadyDebug(room) {
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

function publicRoom(room, viewerIndex = null) {
  if (!room) return null;
  const roomId = normalizeRoomId(room.roomId || room._id);
  const players = Array.isArray(room.players) ? room.players.map(publicPlayer) : [];
  let match = room.match;
  if (Array.isArray(match?.leaderReveals)) {
    match = {
      ...match,
      leaderReveals: match.leaderReveals.map((reveal, index) => index === viewerIndex ? reveal : null)
    };
  }
  return { ...room, players, match, roomId, _id: roomId };
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
  const players = safeArray(room.players).map((player, index) => index === playerIndex ? { ...player, lastSeenAt: now() } : player);
  room.players = players;
  try {
    await db.collection(ROOMS).doc(normalizeRoomId(room.roomId || room._id)).update({ data: { players } });
  } catch (err) {
    console.warn("[pvp] heartbeat update failed", err?.message || err);
  }
  return room;
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
      const $ = db.command.aggregate;
      const aggRes = await db.collection(MATCH_HISTORY).aggregate()
        .match({ openid })
        .group({
          _id: null,
          wins: $.sum($.cond([$.eq(['$record.winner', 0]), 1, 0])),
          draws: $.sum($.cond([$.eq(['$record.winner', null]), 1, 0]))
        })
        .end();
      const aggRow = safeArray(aggRes.data)[0] || {};
      const wins = aggRow.wins || 0;
      const draws = aggRow.draws || 0;
      const losses = Math.max(0, total - wins - draws);
      result.wins = wins;
      result.losses = losses;
      result.draws = draws;
      result.winRate = total ? Math.round(wins * 100 / total) : 0;
    } catch (aggErr) {
      console.warn("[listMatchHistory] aggregate stats failed", aggErr?.message || aggErr);
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
    aiSetup: { faction: "random", leaderId: "random", difficulty: rules.aiDifficulty, deckMode: "auto" },
    ruleSnapshot: rules,
    createdAt: time,
    expireAt: time + ROOM_TTL_MS,
    updatedAt: time
  };
  await db.collection(RANK_MATCHES).doc(rankMatchId).set({ data: match });
  return ok({ rankMatchId, profile: publicRankPayload(profile), rules, playerSetup: setup, aiSetup: match.aiSetup, matchOptions: rankMatchOptions(setup, rules) });
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
    endReason: safeText(finalState.endReason || "normal", 24)
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
  if (safeNumber(match.expireAt, 0) && now() > safeNumber(match.expireAt, 0)) hardInvalid.push("MATCH_TIMEOUT");
  return hardInvalid.length
    ? { validationStatus: "invalid", riskFlags: hardInvalid.concat(flags) }
    : (flags.length ? { validationStatus: "suspicious", riskFlags: flags } : { validationStatus: "valid", riskFlags: [] });
}

function rankResultText(result, endReason = "normal") {
  if (endReason === "disconnect") return result === "loss" ? "排位掉线" : "对方掉线";
  if (endReason === "surrender") return result === "loss" ? "排位认输" : "对方认输";
  if (result === "win") return "排位胜利";
  if (result === "loss") return "排位失败";
  return "排位平局";
}

function rankDeltaText(delta) {
  if (!delta || delta.validationStatus !== "valid") return "数据异常";
  const power = delta.powerDelta > 0 ? `权势 +${delta.powerDelta}` : (delta.powerDelta < 0 ? `权势 ${delta.powerDelta}` : "权势不变");
  const prestige = delta.prestigeDelta > 0 ? `威望 +${delta.prestigeDelta}` : (delta.prestigeDelta < 0 ? `威望 ${delta.prestigeDelta}` : "威望不变");
  return `${power}，${prestige}`;
}

function buildRankHistoryRecord(match, summary, delta, validationStatus, riskFlags) {
  const abnormal = validationStatus !== "valid";
  const rankMatchId = match.rankMatchId || match._id || "";
  return {
    time: now(),
    recordKey: `rank:${rankMatchId}`,
    resultText: abnormal ? "数据异常" : rankResultText(delta.result, summary.endReason),
    winner: abnormal ? null : summary.winner,
    rounds: summary.rounds,
    morale: summary.morale,
    scores: summary.scores,
    roundResults: summary.roundResults,
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
    rankedAnomaly: abnormal,
    rankMatchId,
    rankDisplay: abnormal ? "数据异常" : delta.after.display,
    rankDeltaText: rankDeltaText({ ...delta, validationStatus }),
    validationStatus,
    riskFlags
  };
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
  if (match.status !== "created") return fail("该排位对局已结算", "RANK_ALREADY_FINISHED");

  const profile = await getRankProfileDoc(openid, true);
  const summary = rankResultSummary(event.finalStateSummary || {});
  const validation = validateRankFinish(match, summary, event);
  const valid = validation.validationStatus === "valid";
  const delta = valid
    ? rankCore.settleRankProfile(profile, summary)
    : { before: rankCore.profileView(profile), after: rankCore.profileView(profile), result: summary.result, powerDelta: 0, prestigeDelta: 0, protectionUsed: false };
  const time = now();

  if (valid) {
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
  }

  const historyRecord = buildRankHistoryRecord(match, summary, delta, validation.validationStatus, validation.riskFlags);
  await upsertMatchHistoryForOpenid(openid, historyRecord, "pvpRoom");
  const status = valid ? "finished" : "abnormal";
  await db.collection(RANK_MATCHES).doc(rankMatchId).update({
    data: {
      status,
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
    path: event.path || ""
  };
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

async function fetchAllCollection(name) {
  const collection = db.collection(name);
  const count = await collection.count();
  const total = Number(count.total || 0);
  const limit = 1000;
  const pages = Math.ceil(total / limit);
  const result = [];
  for (let index = 0; index < pages; index += 1) {
    const page = await collection.skip(index * limit).limit(limit).get();
    result.push(...safeArray(page.data));
  }
  return result;
}

async function getAdminStats(openid) {
  if (!(await isAdministrator(openid))) return fail("无权查看数据统计", "FORBIDDEN");
  const [users, matches, activities, rankMatches] = await Promise.all([
    fetchAllCollection(USERS),
    fetchAllCollection(MATCH_HISTORY),
    fetchAllCollection(DAILY_USER_ACTIVITY),
    fetchAllCollection(RANK_MATCHES)
  ]);
  return ok({ stats: buildAdminStats({ users, matches, activities, rankMatches, now: now() }) });
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
  const databaseToken = await findActiveDatabaseToken(openid);
  const existingToken = databaseToken?.expiresAt > now() ? databaseToken : null;
  const token = existingToken?.token || randomToken();
  const tokenStorage = existingToken ? "database" : await saveToken(token, openid);
  const expiresAt = existingToken?.expiresAt || (now() + TOKEN_TTL_MS);
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
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return "image/jpeg";
}

async function uploadAvatar(event, openid) {
  const extRaw = String(event.ext || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  const ext = ["jpg", "jpeg", "png", "webp", "gif"].includes(extRaw) ? extRaw : "jpg";
  const imageBase64 = String(event.imageBase64 || "").replace(/^data:image\/\w+;base64,/, "");
  if (!imageBase64) return fail("缺少头像数据", "MISSING_AVATAR");
  if (imageBase64.length > 2 * 1024 * 1024) return fail("头像图片过大", "AVATAR_TOO_LARGE");
  const fileContent = Buffer.from(imageBase64, "base64");
  if (!fileContent.length || fileContent.length > 1536 * 1024) return fail("头像图片过大", "AVATAR_TOO_LARGE");
  const cloudPath = `avatars/${openid}/${now()}-${crypto.randomBytes(4).toString("hex")}.${ext}`;
  const upload = await cloud.uploadFile({ cloudPath, fileContent });
  const fileID = upload.fileID || upload.fileId || "";
  let avatarUrl = fileID;
  if (fileID && cloud.getTempFileURL) {
    try {
      const temp = await cloud.getTempFileURL({ fileList: [fileID] });
      avatarUrl = temp?.fileList?.[0]?.tempFileURL || fileID;
    } catch (err) {
      console.warn("[profile] get avatar temp url failed", err?.message || err);
    }
  }
  return ok({ fileID, avatarUrl, cloudPath });
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

async function updateProfile(event, openid) {
  const profile = event.profile && typeof event.profile === "object" ? event.profile : {};
  const nickName = String(profile.nickName || "").trim().slice(0, 24);
  const avatarUrl = String(profile.avatarUrl || "").trim().slice(0, 1024);
  if (!nickName && !avatarUrl) return ok({ updated: false });
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
  const player = makePlayer(openid, 0, event.setup, rules);
  for (let i = 0; i < 5; i++) {
    const roomId = createRoomId();
    const room = {
      _id: roomId,
      roomId,
      status: "waiting",
      players: [player],
      readyPlayers: readyPlayersOf([player]),
      readySeq: 0,
      rules,
      match: null,
      turnSeq: 0,
      createdAt: now(),
      updatedAt: now(),
      expireAt: now() + ROOM_TTL_MS
    };
    try {
      const existed = await getRoom(roomId);
      if (existed) continue;
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
  const room = await getRoom(roomId);
  if (!room) return fail("房间不存在", "NOT_FOUND");
  if (room.status === "dissolved") return fail("房主已解散房间", "ROOM_DISSOLVED");
  const existedIndex = playerIndexOf(room, openid);
  if (existedIndex >= 0) return ok({ roomId, playerIndex: existedIndex, room: publicRoom(room, existedIndex) });
  if (room.status !== "waiting") return fail("房间已开始或已结束", "ROOM_CLOSED");
  if ((room.players || []).length >= 2) return fail("房间已满", "ROOM_FULL");

  const activeRules = safeRules(room.rules || {});
  const players = (room.players || []).concat(makePlayer(openid, 1, event.setup, activeRules));
  const readyPlayers = readyPlayersOf(players);
  const nextRoom = {
    ...room,
    status: "waiting",
    players,
    readyPlayers,
    readySeq: room.readySeq || 0,
    match: null,
    turnSeq: (room.turnSeq || 0) + 1,
    updatedAt: now()
  };
  await db.collection(ROOMS).doc(roomId).update({
    data: {
      status: nextRoom.status,
      players,
      readyPlayers,
      readySeq: nextRoom.readySeq,
      match: null,
      turnSeq: nextRoom.turnSeq,
      updatedAt: nextRoom.updatedAt
    }
  });
  return ok({ roomId, playerIndex: 1, room: publicRoom(nextRoom, 1) });
}

async function updateRules(event, openid) {
  const roomId = normalizeRoomId(event.roomId);
  const room = await getRoom(roomId);
  if (!room) return fail("房间不存在", "NOT_FOUND");
  if (playerIndexOf(room, openid) !== 0) return fail("只有房主可以修改规则", "FORBIDDEN");
  if (room.status === "dissolved") return fail("房间已解散", "ROOM_DISSOLVED");
  if (room.status === "playing" || room.status === "selecting") return fail("本局已开始，不能修改规则", "ROOM_BUSY");
  const previous = {
    ...safeRules(room.rules || {}),
    version: Math.max(0, Number(room.rules?.version || 0) || 0)
  };
  const rules = { ...safeRules(event.rules, previous), version: previous.version + 1, changedAt: now() };
  const players = resetPlayerFlags(room.players || []);
  const readyPlayers = readyPlayersOf(players);
  const nextRoom = { ...room, status: "waiting", rules, players, readyPlayers, readySeq: (room.readySeq || 0) + 1, match: null, turnSeq: (room.turnSeq || 0) + 1, updatedAt: now() };
  await db.collection(ROOMS).doc(roomId).update({
    data: { status: "waiting", rules, players, readyPlayers, readySeq: nextRoom.readySeq, match: null, turnSeq: nextRoom.turnSeq, updatedAt: nextRoom.updatedAt }
  });
  return ok({ roomId, playerIndex: 0, room: publicRoom(nextRoom, 0) });
}

async function setReady(event, openid) {
  const roomId = normalizeRoomId(event.roomId);
  const desiredReady = !!event.ready;
  const traceId = String(event.traceId || `server-${now()}`).slice(0, 64);
  let lastRoom = null;
  let lastPlayerIndex = -1;
  console.log("[pvp-ready-debug] server setReady begin", { version: PVP_READY_DEBUG_VERSION, traceId, roomId, desiredReady });

  for (let attempt = 0; attempt < 4; attempt++) {
    const room = await getRoom(roomId);
    console.log("[pvp-ready-debug] server setReady read", { traceId, attempt: attempt + 1, room: roomReadyDebug(room) });
    if (!room) {
      if (attempt < 3) {
        await wait(80 * (attempt + 1));
        continue;
      }
      return fail("房间不存在", "NOT_FOUND");
    }
    if (room.status !== "waiting") return fail("当前不能准备", "ROOM_BUSY");
    const playerIndex = playerIndexOf(room, openid);
    console.log("[pvp-ready-debug] server setReady player", { traceId, attempt: attempt + 1, playerIndex, desiredReady });
    if (playerIndex < 0) {
      if (attempt < 3) {
        await wait(80 * (attempt + 1));
        continue;
      }
      return fail("加入信息同步中，请再点一次准备", "PLAYER_SYNCING");
    }

    const players = (room.players || []).map((player, index) => index === playerIndex ? { ...player, ready: desiredReady } : player);
    const readyPlayers = readyPlayersOf(players);
    const readySeq = (room.readySeq || 0) + 1;
    const turnSeq = (room.turnSeq || 0) + 1;
    const updatedAt = now();
    console.log("[pvp-ready-debug] server setReady write", {
      traceId,
      attempt: attempt + 1,
      playerIndex,
      desiredReady,
      next: { turnSeq, readySeq, playerReady: players.map(player => !!player?.ready), readyPlayers }
    });
    const updateResult = await db.collection(ROOMS).doc(roomId).update({ data: { players, readyPlayers, readySeq, turnSeq, updatedAt } });
    console.log("[pvp-ready-debug] server setReady write result", { traceId, attempt: attempt + 1, updateResult });

    const confirmed = await getRoom(roomId);
    const confirmedPlayerIndex = playerIndexOf(confirmed || {}, openid);
    lastRoom = confirmed || { ...room, players, readyPlayers, readySeq, turnSeq, updatedAt };
    lastPlayerIndex = confirmedPlayerIndex >= 0 ? confirmedPlayerIndex : playerIndex;
    const readyConfirmed = confirmedPlayerIndex >= 0
      && roomPlayerReady(confirmed, confirmedPlayerIndex) === desiredReady
      && Number(confirmed.readySeq || 0) >= readySeq;
    console.log("[pvp-ready-debug] server setReady confirm", {
      traceId,
      attempt: attempt + 1,
      confirmedPlayerIndex,
      desiredReady,
      readyConfirmed,
      room: roomReadyDebug(confirmed)
    });
    if (readyConfirmed) {
      console.log("[pvp-ready-debug] server setReady success", { traceId, attempt: attempt + 1, playerIndex: confirmedPlayerIndex });
      return ok({ roomId, playerIndex: confirmedPlayerIndex, room: publicRoom(confirmed, confirmedPlayerIndex), traceId });
    }
    if (attempt < 3) await wait(100 * (attempt + 1));
  }

  if (lastRoom && lastPlayerIndex >= 0 && roomPlayerReady(lastRoom, lastPlayerIndex) === desiredReady) {
    console.log("[pvp-ready-debug] server setReady fallback success", { traceId, playerIndex: lastPlayerIndex, room: roomReadyDebug(lastRoom) });
    return ok({ roomId, playerIndex: lastPlayerIndex, room: publicRoom(lastRoom, lastPlayerIndex), traceId });
  }
  console.error("[pvp-ready-debug] server setReady failed", { traceId, desiredReady, playerIndex: lastPlayerIndex, room: roomReadyDebug(lastRoom) });
  return fail("准备状态同步失败，请重试", "READY_NOT_CONFIRMED");
}

async function startSelection(event, openid) {
  const roomId = normalizeRoomId(event.roomId);
  const room = await getRoom(roomId);
  if (!room) return fail("房间不存在", "NOT_FOUND");
  if (playerIndexOf(room, openid) !== 0) return fail("只有房主可以开始", "FORBIDDEN");
  if (room.status !== "waiting") return fail("当前不能开始", "ROOM_BUSY");
  const players = room.players || [];
  if (players.length < 2) return fail("等待好友加入", "WAITING_PLAYER");
  if (!roomPlayerReady(room, 0) || !roomPlayerReady(room, 1)) return fail("双方准备后才能开始", "WAITING_READY");
  const nextPlayers = resetPlayerFlags(players);
  const readyPlayers = readyPlayersOf(nextPlayers);
  const nextRoom = { ...room, status: "selecting", players: nextPlayers, readyPlayers, readySeq: (room.readySeq || 0) + 1, match: null, turnSeq: (room.turnSeq || 0) + 1, updatedAt: now() };
  await db.collection(ROOMS).doc(roomId).update({ data: { status: "selecting", players: nextPlayers, readyPlayers, readySeq: nextRoom.readySeq, match: null, turnSeq: nextRoom.turnSeq, updatedAt: nextRoom.updatedAt } });
  return ok({ roomId, playerIndex: 0, room: publicRoom(nextRoom, 0) });
}

async function submitSetup(event, openid) {
  const roomId = normalizeRoomId(event.roomId);
  const room = await getRoom(roomId);
  if (!room) return fail("房间不存在", "NOT_FOUND");
  if (room.status !== "selecting") return fail("还未进入选择卡牌阶段", "NOT_SELECTING");
  const playerIndex = playerIndexOf(room, openid);
  if (playerIndex < 0) return fail("你不在这个房间", "FORBIDDEN");
  const rules = safeRules(room.rules || {});
  const setup = safeSetup(event.setup, rules);
  const updatedAt = now();
  let players = (room.players || []).map((player, index) => index === playerIndex ? { ...player, ...setup, setupReady: true, lastSeenAt: updatedAt } : player);
  const allReady = players.length >= 2 && players.slice(0, 2).every(player => player.setupReady);
  if (allReady) players = players.map(player => ({ ...player, lastSeenAt: updatedAt }));
  const match = allReady ? buildMatch(players) : null;
  const status = allReady ? "playing" : "selecting";
  const nextRoom = { ...room, status, players, match, turnSeq: (room.turnSeq || 0) + 1, updatedAt };
  await db.collection(ROOMS).doc(roomId).update({
    data: { status, players, match: match ? _.set(match) : null, turnSeq: nextRoom.turnSeq, updatedAt: nextRoom.updatedAt }
  });
  return ok({ roomId, playerIndex, room: publicRoom(nextRoom, playerIndex) });
}

async function returnToRoom(event, openid) {
  const roomId = normalizeRoomId(event.roomId);
  const room = await getRoom(roomId);
  if (!room) return fail("房间不存在", "NOT_FOUND");
  const playerIndex = playerIndexOf(room, openid);
  if (playerIndex < 0) return fail("你不在这个房间", "FORBIDDEN");
  if (room.status !== "finished") return ok({ roomId, playerIndex, room: publicRoom(room, playerIndex) });
  const players = resetPlayerFlags(room.players || []);
  const readyPlayers = readyPlayersOf(players);
  const nextRoom = { ...room, status: "waiting", players, readyPlayers, readySeq: (room.readySeq || 0) + 1, match: null, turnSeq: (room.turnSeq || 0) + 1, updatedAt: now() };
  await db.collection(ROOMS).doc(roomId).update({ data: { status: "waiting", players, readyPlayers, readySeq: nextRoom.readySeq, match: null, turnSeq: nextRoom.turnSeq, updatedAt: nextRoom.updatedAt } });
  return ok({ roomId, playerIndex, room: publicRoom(nextRoom, playerIndex) });
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
    room.players = safeArray(room.players).filter((_, index) => index !== playerIndex);
    room.readyPlayers = readyPlayersOf(room.players);
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
  if (action === "login") return login(event, wxContext);
  if (action === "getLoginContext") return ok({ wxContext: { APPID: wxContext.APPID || "", UNIONID: wxContext.UNIONID || "" } });
  if (action === "getAdminStats") {
    const openid = await authAdminStatsOpenid(event, wxContext);
    if (!openid) return fail("无法获取用户身份", "NO_OPENID");
    return getAdminStats(openid);
  }
  if (action === "getRankLeaderboard") {
    let openid = "";
    try { openid = await authOpenid(event, wxContext); } catch (err) { openid = ""; }
    return getRankLeaderboard(event, openid);
  }

  const openid = await authOpenid(event, wxContext);
  if (!openid) return fail("无法获取用户身份", "NO_OPENID");
  if (action === "currentUser") return currentUser(openid);
  if (action === "getAdminStatus") return ok({ isAdmin: await isAdministrator(openid) });
  if (action === "getRankProfile") return getRankProfile(event, openid);
  if (action === "startRankMatch") return startRankMatch(event, openid);
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
  if (action === "startSelection") return startSelection(event, openid);
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
    return http ? httpResponse(result) : result;
  } catch (err) {
    console.error("[pvpRoom] failed", err);
    const result = fail(err.message || "服务异常", err.code || "SERVER_ERROR");
    return http ? httpResponse(result) : result;
  }
};
