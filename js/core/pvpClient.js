const ENV_ID = "cloud1-d7gbbwpnd7d68e1b8";
const ROOM_COLLECTION = "game_rooms";
const PVP_READY_DEBUG_VERSION = "20260720-ready-debug-v1";

let cloudReady = false;
let roomWatcher = null;
let roomPollTimer = null;
let roomWatchToken = 0;

const ROOM_POLL_INTERVAL_MS = 1500;

function wxApi() {
  return typeof wx !== "undefined" ? wx : null;
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function initCloud() {
  const api = wxApi();
  if (!api || !api.cloud) return false;
  if (!cloudReady) {
    api.cloud.init({ env: ENV_ID, traceUser: true });
    cloudReady = true;
  }
  return true;
}

function callRoom(action, data = {}) {
  const api = wxApi();
  if (!initCloud() || !api.cloud.callFunction) return Promise.reject(new Error("当前环境不支持云开发"));
  return api.cloud.callFunction({
    name: "pvpRoom",
    data: { action, ...data }
  }).then(res => {
    const result = res && res.result ? res.result : res;
    if (!result || result.ok === false) {
      const error = new Error(result?.message || "云函数调用失败");
      error.code = result?.code || "CLOUD_FUNCTION_FAILED";
      throw error;
    }
    return result;
  });
}

function createRoom(setup, rules) {
  return callRoom("createRoom", { setup, rules });
}

function joinRoom(roomId, setup) {
  return callRoom("joinRoom", { roomId, setup });
}

function getRoom(roomId) {
  return callRoom("getRoom", { roomId });
}

function getRoomFromDatabase(roomId) {
  const api = wxApi();
  if (!initCloud() || !api.cloud.database) return Promise.reject(new Error("当前环境不支持云数据库读取"));
  const db = api.cloud.database({ env: ENV_ID });
  return db.collection(ROOM_COLLECTION).doc(roomId).get().then(res => {
    const room = res && res.data;
    if (!room) throw new Error("房间不存在");
    const safeRoomId = room.roomId || room._id || roomId;
    return { roomId: safeRoomId, room: { ...room, roomId: safeRoomId, _id: safeRoomId } };
  });
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

async function fetchRoom(roomId) {
  let dbError = null;
  let getError = null;
  try {
    const result = await getRoomFromDatabase(roomId);
    console.log("[pvp-ready-debug] fetchRoom source=database", roomId, roomReadyDebug(result.room));
    return result;
  } catch (err) {
    dbError = err;
  }
  try {
    const result = await getRoom(roomId);
    console.log("[pvp-ready-debug] fetchRoom source=getRoom", roomId, roomReadyDebug(result.room));
    return result;
  } catch (err) {
    getError = err;
  }
  try {
    const result = await callRoom("returnToRoom", { roomId });
    console.log("[pvp-ready-debug] fetchRoom source=returnToRoom", roomId, roomReadyDebug(result.room));
    return result;
  } catch (returnError) {
    console.warn("[pvp-ready-debug] fetchRoom all failed", roomId, {
      database: dbError?.errMsg || dbError?.message || String(dbError),
      getRoom: getError?.errMsg || getError?.message || String(getError),
      returnToRoom: returnError?.errMsg || returnError?.message || String(returnError)
    });
    throw returnError || getError || dbError;
  }
}

const roomCodePaths = {};
const ROOM_CODE_ENV_VERSION = "trial";

function roomCodeKey(roomId, envVersion = ROOM_CODE_ENV_VERSION) {
  return `${roomId}-${envVersion}`;
}

function localRoomCodePath(roomId, envVersion = ROOM_CODE_ENV_VERSION) {
  const api = wxApi();
  const base = api?.env?.USER_DATA_PATH;
  return base ? `${base}/pvp-room-${roomCodeKey(roomId, envVersion)}.png` : "";
}

function cachedRoomCodePath(roomId, envVersion = ROOM_CODE_ENV_VERSION) {
  const api = wxApi();
  const key = roomCodeKey(roomId, envVersion);
  const filePath = roomCodePaths[key] || localRoomCodePath(roomId, envVersion);
  if (!api?.getFileSystemManager || !filePath) return "";
  try {
    api.getFileSystemManager().accessSync(filePath);
    roomCodePaths[key] = filePath;
    return filePath;
  } catch (err) {
    return "";
  }
}

function getRoomCode(roomId, force = false) {
  const envVersion = ROOM_CODE_ENV_VERSION;
  const key = roomCodeKey(roomId, envVersion);
  const cached = !force && cachedRoomCodePath(roomId, envVersion);
  if (cached) return Promise.resolve({ filePath: cached, envVersion });
  const api = wxApi();
  if (!api?.getFileSystemManager) return Promise.reject(new Error("当前环境不支持保存房间二维码"));
  return callRoom("generateRoomCode", { roomId, envVersion }).then(result => new Promise((resolve, reject) => {
    const filePath = localRoomCodePath(roomId, envVersion);
    if (!filePath || !result?.imageBase64) return reject(new Error("房间二维码数据无效"));
    api.getFileSystemManager().writeFile({
      filePath,
      data: result.imageBase64,
      encoding: "base64",
      success: () => {
        roomCodePaths[key] = filePath;
        resolve({ filePath, envVersion: result.envVersion || envVersion });
      },
      fail: err => reject(new Error(err?.errMsg || "二维码保存失败"))
    });
  }));
}

function updateRules(roomId, rules) {
  return callRoom("updateRules", { roomId, rules });
}

function setReady(roomId, ready, traceId = "") {
  return callRoom("setReady", { roomId, ready, traceId });
}

function readyAt(room, index) {
  const players = room?.players || [];
  const readyPlayers = Array.isArray(room?.readyPlayers) ? room.readyPlayers : [];
  return !!(players[index]?.ready || readyPlayers[index]);
}

async function setReadyConfirmed(roomId, ready) {
  const traceId = `ready-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  let lastError = null;
  let playerIndex = 1;
  console.log("[pvp-ready-debug] setReadyConfirmed begin", { version: PVP_READY_DEBUG_VERSION, traceId, roomId, ready: !!ready });
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      console.log("[pvp-ready-debug] setReady request", { traceId, attempt: attempt + 1, roomId, ready: !!ready });
      const result = await setReady(roomId, ready, traceId);
      playerIndex = Number.isInteger(result.playerIndex) ? result.playerIndex : playerIndex;
      const confirmed = readyAt(result.room, playerIndex) === !!ready;
      console.log("[pvp-ready-debug] setReady response", { traceId, attempt: attempt + 1, playerIndex, confirmed, room: roomReadyDebug(result.room) });
      if (confirmed) return result;
    } catch (err) {
      lastError = err;
      console.warn("[pvp-ready-debug] setReady error", { traceId, attempt: attempt + 1, code: err?.code || "", message: err?.message || String(err) });
      if (!["PLAYER_SYNCING", "READY_NOT_CONFIRMED", "FORBIDDEN"].includes(err?.code) && attempt > 0) throw err;
    }
    await wait(180 * (attempt + 1));
    try {
      const latest = await fetchRoom(roomId);
      const confirmed = readyAt(latest.room, playerIndex) === !!ready;
      console.log("[pvp-ready-debug] setReady verify fetch", { traceId, attempt: attempt + 1, playerIndex, confirmed, room: roomReadyDebug(latest.room) });
      if (confirmed) return { ...latest, playerIndex };
    } catch (err) {
      lastError = err;
      console.warn("[pvp-ready-debug] setReady verify error", { traceId, attempt: attempt + 1, message: err?.message || String(err) });
    }
  }
  console.error("[pvp-ready-debug] setReadyConfirmed failed", { traceId, roomId, ready: !!ready, message: lastError?.message || "unknown" });
  throw lastError || new Error("准备状态同步失败，请重试");
}

function startSelection(roomId) {
  return callRoom("startSelection", { roomId });
}

function submitSetup(roomId, setup) {
  return callRoom("submitSetup", { roomId, setup });
}

function returnToRoom(roomId) {
  return callRoom("returnToRoom", { roomId });
}

function submitAction(roomId, turnSeq, battleAction) {
  return callRoom("submitAction", { roomId, turnSeq, battleAction });
}

function leaveRoom(roomId) {
  return callRoom("leaveRoom", { roomId });
}

function closeRoomWatch() {
  roomWatchToken += 1;
  if (roomPollTimer) {
    clearInterval(roomPollTimer);
    roomPollTimer = null;
  }
  if (roomWatcher && roomWatcher.close) {
    try { roomWatcher.close(); } catch (err) { console.warn("[pvp] close watch failed", err); }
  }
  roomWatcher = null;
}

function roomUpdateKey(room) {
  if (!room) return "";
  const readyPlayers = Array.isArray(room.readyPlayers) ? room.readyPlayers.map(Boolean).join("") : "";
  return [room.roomId || room._id || "", room.status || "", room.turnSeq || 0, room.updatedAt || 0, room.readySeq || 0, readyPlayers].join(":");
}

function watchRoom(roomId, onChange, onError) {
  const api = wxApi();
  if (!initCloud()) throw new Error("当前环境不支持云开发");
  closeRoomWatch();
  const watchToken = roomWatchToken;
  let lastDeliveredKey = "";
  const deliver = (room, source) => {
    if (watchToken !== roomWatchToken || !room) return;
    const key = roomUpdateKey(room);
    if (key && key === lastDeliveredKey) return;
    lastDeliveredKey = key;
    console.log("[pvp-ready-debug] watch deliver", { source, roomId, key, room: roomReadyDebug(room) });
    onChange(room);
  };
  const pollRoom = () => {
    fetchRoom(roomId).then(result => deliver(result.room, "poll")).catch(err => {
      if (watchToken === roomWatchToken) console.warn("[pvp] poll room failed", err && err.errMsg || err);
    });
  };
  roomPollTimer = setInterval(pollRoom, ROOM_POLL_INTERVAL_MS);
  pollRoom();

  if (!api.cloud.database) {
    console.warn("[pvp] 云数据库监听不可用，使用轮询同步房间");
    return roomWatcher;
  }

  try {
    const db = api.cloud.database({ env: ENV_ID });
    console.log("[pvp] watchRoom 开始监听, roomId=", roomId);
    roomWatcher = db.collection(ROOM_COLLECTION).doc(roomId).watch({
      onChange(snapshot) {
        console.log("[pvp] watch onChange 触发, type=", snapshot && snapshot.type,
          "docChanges=", snapshot && snapshot.docChanges ? snapshot.docChanges.length : 0,
          "docs=", snapshot && snapshot.docs ? snapshot.docs.length : 0);
        const docs = snapshot && snapshot.docs ? snapshot.docs : [];
        if (docs[0]) {
          deliver(docs[0], "watch-docs");
          return;
        }
        const changes = snapshot && snapshot.docChanges ? snapshot.docChanges : [];
        if (changes.length > 0 && changes[0].doc) {
          deliver(changes[0].doc, "watch-change");
          return;
        }
        console.log("[pvp] watch onChange 但无有效文档数据, snapshot keys=", snapshot ? Object.keys(snapshot) : "null");
      },
      onError(err) {
        console.error("[pvp] watch onError，继续使用轮询兜底:", err && err.errMsg || err);
        if (watchToken === roomWatchToken && onError && !roomPollTimer) onError(err);
      }
    });
  } catch (err) {
    console.warn("[pvp] watchRoom 启动失败，使用轮询同步房间:", err && err.errMsg || err);
  }
  return roomWatcher;
}

function copyText(value) {
  const api = wxApi();
  if (!api || !api.setClipboardData) return false;
  try {
    api.setClipboardData({
      data: String(value || ""),
      success: () => {},
      fail: err => console.warn("[pvp] setClipboardData failed", err)
    });
    return true;
  } catch (err) {
    console.warn("[pvp] setClipboardData exception", err);
    return false;
  }
}

function copyRoomId(roomId) {
  return copyText(roomId);
}

module.exports = {
  ENV_ID,
  initCloud,
  createRoom,
  joinRoom,
  getRoom,
  fetchRoom,
  getRoomCode,
  updateRules,
  setReady,
  setReadyConfirmed,
  startSelection,
  submitSetup,
  returnToRoom,
  submitAction,
  leaveRoom,
  watchRoom,
  closeRoomWatch,
  copyText,
  copyRoomId
};
