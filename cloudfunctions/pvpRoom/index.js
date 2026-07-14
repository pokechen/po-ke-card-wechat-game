const cloud = require("wx-server-sdk");
const battle = require("./js/core/battle");
const { FACTION_KEYS, deckStatus } = require("./js/core/cards");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
const ROOMS = "game_rooms";
const ROOM_TTL_MS = 2 * 60 * 60 * 1000;

function ok(data = {}) {
  return { ok: true, ...data };
}

function fail(message, code = "BAD_REQUEST") {
  return { ok: false, code, message };
}

function now() {
  return Date.now();
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
  const factionMode = source.factionMode === "fixed" ? "fixed" : "any";
  const deckMode = source.deckMode === "autoOnly" ? "autoOnly" : "any";
  const version = Number.isFinite(Number(previous?.version)) ? Number(previous.version) : 0;
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
  const faction = activeRules.factionMode === "fixed"
    ? activeRules.faction
    : safeFaction(String(setup.faction || "Northern Realms"));
  const rawIds = Array.isArray(setup.customDeckIds) ? setup.customDeckIds.map(id => String(id)).slice(0, 40) : [];
  const status = activeRules.deckMode === "autoOnly" ? { valid: false, ids: [] } : deckStatus(rawIds, faction);
  return {
    name: String(setup.name || "").trim().slice(0, 12),
    faction,
    leaderId: String(setup.leaderId || ""),
    customDeckIds: status.valid ? status.ids : []
  };
}

function makePlayer(openid, index, setup, rules) {
  const safe = safeSetup(setup, rules);
  return {
    openid,
    index,
    name: safe.name || `玩家${index + 1}`,
    faction: safe.faction,
    leaderId: safe.leaderId,
    customDeckIds: safe.customDeckIds,
    ready: false,
    setupReady: false
  };
}

function resetPlayerFlags(players = []) {
  return players.map(player => ({ ...player, ready: false, setupReady: false }));
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

function publicRoom(room) {
  if (!room) return null;
  const roomId = normalizeRoomId(room.roomId || room._id);
  return { ...room, roomId, _id: roomId };
}

function playerIndexOf(room, openid) {
  return (room.players || []).findIndex(player => player.openid === openid);
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
  match.players[0].name = p0.name || "玩家一";
  match.players[1].name = p1.name || "玩家二";
  match.logs.unshift("双方已确认出战配置，联网对战开始。 ");
  return match;
}

function pendingOwner(match) {
  if (!match || !match.pending) return match ? match.current : 0;
  if (Number.isInteger(match.pending.playerIndex)) return match.pending.playerIndex;
  return match.current || 0;
}

function assertCanAct(match, playerIndex, actionType) {
  if (!match || match.over) throw new Error("牌局已结束");
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
  if (type === "leader") return battle.useLeader(match, playerIndex);
  if (type === "auto") return battle.autoPlayHuman(match);
  if (type === "surrender") return battle.surrender(match, playerIndex);
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
      return ok({ roomId, playerIndex: 0, room: publicRoom(room) });
    } catch (err) {
      if (i === 4) throw err;
    }
  }
  throw new Error("房间创建失败");
}

async function joinRoom(event, openid) {
  const roomId = normalizeRoomId(event.roomId);
  const room = await getRoom(roomId);
  if (!room) return fail("房间不存在", "NOT_FOUND");
  const existedIndex = playerIndexOf(room, openid);
  if (existedIndex >= 0) return ok({ roomId, playerIndex: existedIndex, room: publicRoom(room) });
  if (room.status !== "waiting") return fail("房间已开始或已结束", "ROOM_CLOSED");
  if ((room.players || []).length >= 2) return fail("房间已满", "ROOM_FULL");

  const rules = safeRules(room.rules || {});
  const players = (room.players || []).concat(makePlayer(openid, 1, event.setup, rules));
  const nextRoom = {
    ...room,
    status: "waiting",
    players,
    rules,
    match: null,
    turnSeq: (room.turnSeq || 0) + 1,
    updatedAt: now()
  };
  await db.collection(ROOMS).doc(roomId).update({
    data: {
      status: nextRoom.status,
      players,
      rules,
      match: null,
      turnSeq: nextRoom.turnSeq,
      updatedAt: nextRoom.updatedAt
    }
  });
  return ok({ roomId, playerIndex: 1, room: publicRoom(nextRoom) });
}

async function updateRules(event, openid) {
  const roomId = normalizeRoomId(event.roomId);
  const room = await getRoom(roomId);
  if (!room) return fail("房间不存在", "NOT_FOUND");
  if (playerIndexOf(room, openid) !== 0) return fail("只有房主可以修改规则", "FORBIDDEN");
  if (room.status === "playing" || room.status === "selecting") return fail("本局已开始，不能修改规则", "ROOM_BUSY");
  const previous = safeRules(room.rules || {});
  const rules = { ...safeRules(event.rules, previous), version: (previous.version || 0) + 1, changedAt: now() };
  const players = resetPlayerFlags(room.players || []);
  const nextRoom = { ...room, status: "waiting", rules, players, match: null, turnSeq: (room.turnSeq || 0) + 1, updatedAt: now() };
  await db.collection(ROOMS).doc(roomId).update({
    data: { status: "waiting", rules, players, match: null, turnSeq: nextRoom.turnSeq, updatedAt: nextRoom.updatedAt }
  });
  return ok({ roomId, playerIndex: 0, room: publicRoom(nextRoom) });
}

async function setReady(event, openid) {
  const roomId = normalizeRoomId(event.roomId);
  const room = await getRoom(roomId);
  if (!room) return fail("房间不存在", "NOT_FOUND");
  if (room.status !== "waiting") return fail("当前不能准备", "ROOM_BUSY");
  const playerIndex = playerIndexOf(room, openid);
  if (playerIndex < 0) return fail("你不在这个房间", "FORBIDDEN");
  if (playerIndex === 0) return fail("房主无需准备，等待好友准备后开始", "HOST_READY_IGNORED");
  const players = (room.players || []).map((player, index) => index === playerIndex ? { ...player, ready: !!event.ready } : player);
  const nextRoom = { ...room, players, turnSeq: (room.turnSeq || 0) + 1, updatedAt: now() };
  await db.collection(ROOMS).doc(roomId).update({ data: { players, turnSeq: nextRoom.turnSeq, updatedAt: nextRoom.updatedAt } });
  return ok({ roomId, playerIndex, room: publicRoom(nextRoom) });
}

async function startSelection(event, openid) {
  const roomId = normalizeRoomId(event.roomId);
  const room = await getRoom(roomId);
  if (!room) return fail("房间不存在", "NOT_FOUND");
  if (playerIndexOf(room, openid) !== 0) return fail("只有房主可以开始", "FORBIDDEN");
  if (room.status !== "waiting") return fail("当前不能开始", "ROOM_BUSY");
  const players = room.players || [];
  if (players.length < 2) return fail("等待好友加入", "WAITING_PLAYER");
  if (!players[1]?.ready) return fail("好友准备后才能开始", "WAITING_READY");
  const nextPlayers = resetPlayerFlags(players);
  const nextRoom = { ...room, status: "selecting", players: nextPlayers, match: null, turnSeq: (room.turnSeq || 0) + 1, updatedAt: now() };
  await db.collection(ROOMS).doc(roomId).update({ data: { status: "selecting", players: nextPlayers, match: null, turnSeq: nextRoom.turnSeq, updatedAt: nextRoom.updatedAt } });
  return ok({ roomId, playerIndex: 0, room: publicRoom(nextRoom) });
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
  const players = (room.players || []).map((player, index) => index === playerIndex ? { ...player, ...setup, setupReady: true } : player);
  const allReady = players.length >= 2 && players.slice(0, 2).every(player => player.setupReady);
  const match = allReady ? buildMatch(players) : null;
  const status = allReady ? "playing" : "selecting";
  const nextRoom = { ...room, status, players, match, turnSeq: (room.turnSeq || 0) + 1, updatedAt: now() };
  await db.collection(ROOMS).doc(roomId).update({
    data: { status, players, match: match ? _.set(match) : null, turnSeq: nextRoom.turnSeq, updatedAt: nextRoom.updatedAt }
  });
  return ok({ roomId, playerIndex, room: publicRoom(nextRoom) });
}

async function returnToRoom(event, openid) {
  const roomId = normalizeRoomId(event.roomId);
  const room = await getRoom(roomId);
  if (!room) return fail("房间不存在", "NOT_FOUND");
  const playerIndex = playerIndexOf(room, openid);
  if (playerIndex < 0) return fail("你不在这个房间", "FORBIDDEN");
  if (room.status !== "finished") return ok({ roomId, playerIndex, room: publicRoom(room) });
  const players = resetPlayerFlags(room.players || []);
  const nextRoom = { ...room, status: "waiting", players, match: null, turnSeq: (room.turnSeq || 0) + 1, updatedAt: now() };
  await db.collection(ROOMS).doc(roomId).update({ data: { status: "waiting", players, match: null, turnSeq: nextRoom.turnSeq, updatedAt: nextRoom.updatedAt } });
  return ok({ roomId, playerIndex, room: publicRoom(nextRoom) });
}

async function submitAction(event, openid) {
  const roomId = normalizeRoomId(event.roomId);
  const room = await getRoom(roomId);
  if (!room) return fail("房间不存在", "NOT_FOUND");
  if (room.status !== "playing") return fail("房间未在对战中", "NOT_PLAYING");
  const playerIndex = playerIndexOf(room, openid);
  if (playerIndex < 0) return fail("你不在这个房间", "FORBIDDEN");
  const actionType = String(event.battleAction?.type || "");
  const allowStaleMulligan = room.match?.mulligan?.active
    && room.match.mulligan.simultaneous
    && (actionType === "mulliganSwap" || actionType === "mulliganDone");
  if (!allowStaleMulligan && Number.isFinite(Number(event.turnSeq)) && Number(event.turnSeq) !== Number(room.turnSeq || 0)) {
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
      match: _.set(match),
      turnSeq: nextRoom.turnSeq,
      updatedAt: nextRoom.updatedAt
    }
  });
  return ok({ roomId, playerIndex, room: publicRoom(nextRoom) });
}

async function leaveRoom(event, openid) {
  const roomId = normalizeRoomId(event.roomId);
  const room = await getRoom(roomId);
  if (!room) return fail("房间不存在", "NOT_FOUND");
  const playerIndex = playerIndexOf(room, openid);
  if (playerIndex < 0) return ok({ roomId, room: publicRoom(room) });
  if (room.status === "playing" && room.match && !room.match.over) {
    battle.surrender(room.match, playerIndex);
    room.status = "finished";
  }
  room.updatedAt = now();
  room.turnSeq = (room.turnSeq || 0) + 1;
  await db.collection(ROOMS).doc(roomId).update({
    data: {
      status: room.status,
      match: _.set(room.match),
      turnSeq: room.turnSeq,
      updatedAt: room.updatedAt
    }
  });
  return ok({ roomId, playerIndex, room: publicRoom(room) });
}

exports.main = async (event = {}) => {
  try {
    const { OPENID } = cloud.getWXContext();
    if (!OPENID) return fail("无法获取用户身份", "NO_OPENID");
    const action = String(event.action || "");
    if (action === "createRoom") return createRoom(event, OPENID);
    if (action === "joinRoom") return joinRoom(event, OPENID);
    if (action === "updateRules") return updateRules(event, OPENID);
    if (action === "setReady") return setReady(event, OPENID);
    if (action === "startSelection") return startSelection(event, OPENID);
    if (action === "submitSetup") return submitSetup(event, OPENID);
    if (action === "returnToRoom") return returnToRoom(event, OPENID);
    if (action === "submitAction") return submitAction(event, OPENID);
    if (action === "leaveRoom") return leaveRoom(event, OPENID);
    return fail("未知请求");
  } catch (err) {
    console.error("[pvpRoom] failed", err);
    return fail(err.message || "服务异常", "SERVER_ERROR");
  }
};
