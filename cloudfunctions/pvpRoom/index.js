const cloud = require("wx-server-sdk");
const battle = require("./js/core/battle");
const { FACTION_KEYS, deckStatus } = require("./js/core/cards");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
const ROOMS = "game_rooms";
const ROOM_TTL_MS = 2 * 60 * 60 * 1000;
const PVP_READY_DEBUG_VERSION = "20260720-ready-debug-v1";

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
    faction,
    leaderId: randomLineup ? "random" : String(setup.leaderId || ""),
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

function publicRoom(room, viewerIndex = null) {
  if (!room) return null;
  const roomId = normalizeRoomId(room.roomId || room._id);
  let match = room.match;
  if (Array.isArray(match?.leaderReveals)) {
    match = {
      ...match,
      leaderReveals: match.leaderReveals.map((reveal, index) => index === viewerIndex ? reveal : null)
    };
  }
  return { ...room, match, roomId, _id: roomId };
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
  match.matchId = `${now()}-${Math.floor(Math.random() * 1000000)}`;
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
  // 认输是单方行为，对局进行中的任意阶段（换牌、选择目标、对方出牌时）均可发起
  if (actionType === "surrender") return;
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

  const envVersion = "trial";
  const result = await cloud.openapi.wxacode.getUnlimited({
    scene: `r=${roomId}`,
    envVersion,
    width: 360,
    autoColor: false,
    lineColor: { r: 47, g: 36, b: 23 },
    isHyaline: false
  });
  const source = result && result.buffer ? result.buffer : result;
  let imageBuffer = null;
  if (Buffer.isBuffer(source)) imageBuffer = source;
  else if (source && Array.isArray(source.data)) imageBuffer = Buffer.from(source.data);
  else if (source instanceof Uint8Array) imageBuffer = Buffer.from(source);
  if (!imageBuffer || !imageBuffer.length) throw new Error(result?.errmsg || "房间二维码生成失败");
  return ok({ roomId, envVersion, imageBase64: imageBuffer.toString("base64") });
}

async function getRoomForPlayer(event, openid) {
  const roomId = normalizeRoomId(event.roomId);
  const room = await getRoom(roomId);
  if (!room) return fail("房间不存在", "NOT_FOUND");
  const playerIndex = playerIndexOf(room, openid);
  if (playerIndex < 0) return fail("你不在这个房间", "FORBIDDEN");
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
    if (playerIndex === 0) return fail("房主无需准备，等待好友准备后开始", "HOST_READY_IGNORED");

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
  if (!roomPlayerReady(room, 1)) return fail("好友准备后才能开始", "WAITING_READY");
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
  const players = (room.players || []).map((player, index) => index === playerIndex ? { ...player, ...setup, setupReady: true } : player);
  const allReady = players.length >= 2 && players.slice(0, 2).every(player => player.setupReady);
  const match = allReady ? buildMatch(players) : null;
  const status = allReady ? "playing" : "selecting";
  const nextRoom = { ...room, status, players, match, turnSeq: (room.turnSeq || 0) + 1, updatedAt: now() };
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
  const allowStaleMulligan = room.match?.mulligan?.active
    && room.match.mulligan.simultaneous
    && (actionType === "mulliganSwap" || actionType === "mulliganDone");
  // 认输结果确定（仅标记该玩家为负），与当前轮次序号无关，允许用旧的 turnSeq 提交，避免对方刚出牌时被 STALE_TURN 拒绝
  const allowStaleAction = actionType === "surrender" || actionType === "continueRound";
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
      match: _.set(match),
      turnSeq: nextRoom.turnSeq,
      updatedAt: nextRoom.updatedAt
    }
  });
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
  if (playerIndex === 0) {
    room.status = "dissolved";
    room.match = null;
    room.dissolvedAt = room.updatedAt;
    await db.collection(ROOMS).doc(roomId).update({
      data: {
        status: room.status,
        match: null,
        dissolvedAt: room.dissolvedAt,
        turnSeq: room.turnSeq,
        updatedAt: room.updatedAt
      }
    });
    return ok({ roomId, playerIndex, room: publicRoom(room, playerIndex) });
  }

  if (room.status === "playing" && room.match && !room.match.over) {
    battle.surrender(room.match, playerIndex);
    room.status = "finished";
  }
  await db.collection(ROOMS).doc(roomId).update({
    data: {
      status: room.status,
      match: _.set(room.match),
      turnSeq: room.turnSeq,
      updatedAt: room.updatedAt
    }
  });
  return ok({ roomId, playerIndex, room: publicRoom(room, playerIndex) });
}

exports.main = async (event = {}) => {
  try {
    const { OPENID } = cloud.getWXContext();
    if (!OPENID) return fail("无法获取用户身份", "NO_OPENID");
    const action = String(event.action || "");
    if (action === "createRoom") return createRoom(event, OPENID);
    if (action === "generateRoomCode") return generateRoomCode(event, OPENID);
    if (action === "getRoom") return getRoomForPlayer(event, OPENID);
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
