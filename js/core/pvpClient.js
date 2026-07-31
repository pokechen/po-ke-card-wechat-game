const HTTP_API_URL = "https://po-ke-card-d0gg2ewaac3e700c4-1302893388.ap-shanghai.app.tcloudbase.com/pvpRoom";
const PVP_READY_DEBUG_VERSION = "20260720-ready-debug-v1";

let roomWatcher = null;
let roomPollTimer = null;
let roomWatchToken = 0;
let authToken = "";

const ROOM_POLL_INTERVAL_MS = 1500;

function wxApi() {
  return typeof wx !== "undefined" ? wx : null;
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function setAuthToken(token) {
  authToken = String(token || "");
}

function getAuthToken() {
  return authToken;
}

function normalizeResult(result, fallbackMessage = "服务调用失败") {
  if (!result || result.ok === false) {
    const error = new Error(result?.message || fallbackMessage);
    error.code = result?.code || "SERVICE_FAILED";
    throw error;
  }
  return result;
}

function callHttpRoom(action, data = {}) {
  const api = wxApi();
  if (!api?.request) return Promise.reject(new Error("当前环境不支持网络请求"));
  if (!HTTP_API_URL) return Promise.reject(new Error("缺少 HTTP_API_URL 配置"));
  return new Promise((resolve, reject) => {
    api.request({
      url: HTTP_API_URL,
      method: "POST",
      timeout: 10000,
      header: {
        "content-type": "application/json",
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
      },
      data: { action, token: authToken || undefined, ...data },
      success: res => {
        const result = res?.data;
        try {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            const error = new Error(result?.message || `HTTP ${res.statusCode}`);
            error.code = result?.code || "HTTP_FAILED";
            throw error;
          }
          resolve(normalizeResult(result, "HTTP 服务调用失败"));
        } catch (err) {
          reject(err);
        }
      },
      fail: err => reject(new Error(err?.errMsg || "HTTP 服务请求失败"))
    });
  });
}

function callRoom(action, data = {}) {
  return callHttpRoom(action, data);
}

function login(payload) {
  return callRoom("login", payload || {});
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
  let getError = null;
  try {
    const result = await getRoom(roomId);
    console.log("[pvp-ready-debug] fetchRoom source=getRoom", roomId, roomReadyDebug(result.room));
    return result;
  } catch (err) {
    getError = err;
  }
  try {
    const result = await callRoom("returnToRoom", { roomId, readOnly: true });
    console.log("[pvp-ready-debug] fetchRoom source=returnToRoomReadOnly", roomId, roomReadyDebug(result.room));
    return result;
  } catch (returnError) {
    console.warn("[pvp-ready-debug] fetchRoom all failed", roomId, {
      getRoom: getError?.errMsg || getError?.message || String(getError),
      returnToRoom: returnError?.errMsg || returnError?.message || String(returnError)
    });
    throw returnError || getError;
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

function recordMatchHistory(record) {
  return callRoom("recordMatchHistory", { record });
}

function listMatchHistory(limit = 20, skip = 0) {
  return callRoom("listMatchHistory", { limit, skip });
}

function getLoginContext() {
  return callRoom("getLoginContext");
}

function getCurrentUser() {
  return callRoom("currentUser");
}

function getAdminStatus() {
  return callRoom("getAdminStatus");
}

function getAdminStats() {
  return callRoom("getAdminStats");
}

function getRankProfile() {
  return callRoom("getRankProfile");
}

function startRankMatch(playerSetup) {
  return callRoom("startRankMatch", { playerSetup });
}

function finishRankMatch(rankMatchId, finalStateSummary, clientVersion, durationMs) {
  return callRoom("finishRankMatch", { rankMatchId, finalStateSummary, clientVersion, durationMs });
}

function getRankLeaderboard(limit = 50) {
  return callRoom("getRankLeaderboard", { limit });
}

function getRankPublicProfile(userId) {
  return callRoom("getRankPublicProfile", { userId });
}

function saveWechatProfile(userInfo, userInfoResult) {
  return callRoom("saveWechatProfile", { userInfo, userInfoResult });
}

function updateProfile(profile) {
  return callRoom("updateProfile", { profile });
}

function fileExt(path = "") {
  const match = String(path || "").match(/\.([a-z0-9]+)(?:\?|#|$)/i);
  const ext = match ? match[1].toLowerCase() : "jpg";
  return ["jpg", "jpeg", "png", "webp", "gif"].includes(ext) ? ext : "jpg";
}

function uploadAvatarFile(filePath) {
  const api = wxApi();
  if (!api?.getFileSystemManager || !filePath) return Promise.reject(new Error("当前环境不支持头像上传"));
  return new Promise((resolve, reject) => {
    api.getFileSystemManager().readFile({
      filePath,
      encoding: "base64",
      success: res => callRoom("uploadAvatar", { ext: fileExt(filePath), imageBase64: res.data })
        .then(resolve)
        .catch(reject),
      fail: err => reject(new Error(err?.errMsg || "头像读取失败"))
    });
  });
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
      if (watchToken === roomWatchToken) {
        console.warn("[pvp] poll room failed", err && err.errMsg || err);
        if (onError) onError(err);
      }
    });
  };
  roomPollTimer = setInterval(pollRoom, ROOM_POLL_INTERVAL_MS);
  pollRoom();
  return roomWatcher;
}

function plainClipboardError(err) {
  return {
    message: err?.errMsg || err?.message || String(err || "复制失败"),
    errMsg: err?.errMsg || "",
    code: err?.errCode || err?.code || ""
  };
}

function copyTextResult(value) {
  const api = wxApi();
  if (!api || !api.setClipboardData) return Promise.resolve({ ok: false, error: { message: "当前环境不支持复制" } });
  return new Promise(resolve => {
    try {
      api.setClipboardData({
        data: String(value || ""),
        success: res => resolve({ ok: true, result: res || {} }),
        fail: err => {
          console.warn("[pvp] setClipboardData failed", err);
          resolve({ ok: false, error: plainClipboardError(err) });
        }
      });
    } catch (err) {
      console.warn("[pvp] setClipboardData exception", err);
      resolve({ ok: false, error: plainClipboardError(err) });
    }
  });
}

function copyText(value) {
  const api = wxApi();
  if (!api || !api.setClipboardData) return false;
  copyTextResult(value);
  return true;
}

function copyRoomId(roomId) {
  return copyText(roomId);
}

function copyRoomIdResult(roomId) {
  return copyTextResult(roomId);
}

module.exports = {
  setAuthToken,
  getAuthToken,
  login,
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
  recordMatchHistory,
  listMatchHistory,
  getLoginContext,
  getCurrentUser,
  getAdminStatus,
  getAdminStats,
  getRankProfile,
  startRankMatch,
  finishRankMatch,
  getRankLeaderboard,
  getRankPublicProfile,
  saveWechatProfile,
  updateProfile,
  uploadAvatarFile,
  watchRoom,
  closeRoomWatch,
  copyText,
  copyTextResult,
  copyRoomId,
  copyRoomIdResult
};
