const cloud = require("wx-server-sdk");
const battle = require("./js/core/battle");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
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
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}

function createRoomId() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let id = "";
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

function safeSetup(input = {}) {
  const setup = input && typeof input === "object" ? input : {};
  return {
    name: String(setup.name || "").trim().slice(0, 12),
    faction: String(setup.faction || "Northern Realms"),
    leaderId: String(setup.leaderId || ""),
    customDeckIds: Array.isArray(setup.customDeckIds) ? setup.customDeckIds.map(id => String(id)).slice(0, 40) : []
  };
}

function makePlayer(openid, index, setup) {
  const safe = safeSetup(setup);
  return {
    openid,
    index,
    name: safe.name || `玩家${index + 1}`,
    faction: safe.faction,
    leaderId: safe.leaderId,
    customDeckIds: safe.customDeckIds
  };
}

async function getRoom(roomId) {
  const id = normalizeRoomId(roomId);
  if (!id) throw new Error("房间号不能为空");
  try {
    const res = await db.collection(ROOMS).doc(id).get();
    return res.data ? { _id: id, ...res.data } : null;
  } catch (err) {
    return null;
  }
}

function roomData(room) {
  const data = { ...room };
  delete data._id;
  return data;
}

function publicRoom(room) {
  return room ? { ...room } : null;
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
  match.logs.unshift("好友已加入，联网对战开始。 ");
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
    if (match.mulligan.current !== playerIndex) throw new Error("等待对方换牌");
    if (actionType !== "mulliganSwap" && actionType !== "mulliganDone") throw new Error("请先完成换牌");
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
  if (type === "mulliganSwap") return battle.mulliganSwap(match, action.cardUid);
  if (type === "mulliganDone") return battle.finishMulligan(match);
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
  const player = makePlayer(openid, 0, event.setup);
  for (let i = 0; i < 5; i++) {
    const roomId = createRoomId();
    const room = {
      _id: roomId,
      status: "waiting",
      players: [player],
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

  const players = (room.players || []).concat(makePlayer(openid, 1, event.setup));
  const match = buildMatch(players);
  const nextRoom = {
    ...room,
    status: "playing",
    players,
    match,
    turnSeq: (room.turnSeq || 0) + 1,
    updatedAt: now()
  };
  await db.collection(ROOMS).doc(roomId).update({
    data: {
      status: nextRoom.status,
      players,
      match,
      turnSeq: nextRoom.turnSeq,
      updatedAt: nextRoom.updatedAt
    }
  });
  return ok({ roomId, playerIndex: 1, room: publicRoom(nextRoom) });
}

async function submitAction(event, openid) {
  const roomId = normalizeRoomId(event.roomId);
  const room = await getRoom(roomId);
  if (!room) return fail("房间不存在", "NOT_FOUND");
  if (room.status !== "playing") return fail("房间未在对战中", "NOT_PLAYING");
  const playerIndex = playerIndexOf(room, openid);
  if (playerIndex < 0) return fail("你不在这个房间", "FORBIDDEN");
  if (Number.isFinite(Number(event.turnSeq)) && Number(event.turnSeq) !== Number(room.turnSeq || 0)) {
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
      match,
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
      match: room.match,
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
    if (action === "submitAction") return submitAction(event, OPENID);
    if (action === "leaveRoom") return leaveRoom(event, OPENID);
    return fail("未知请求");
  } catch (err) {
    console.error("[pvpRoom] failed", err);
    return fail(err.message || "服务异常", "SERVER_ERROR");
  }
};
