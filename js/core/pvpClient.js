const { debugLog, debugWarn } = require("./logger");

const HTTP_API_URL = "https://po-ke-card-d0gg2ewaac3e700c4-1302893388.ap-shanghai.app.tcloudbase.com/pvpRoom";
const PVP_READY_DEBUG_VERSION = "20260803-ready-atomic-v2";

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

// 令牌失效（服务端 AUTH_EXPIRED）时由外部注入的重新登录逻辑，返回新的 token。
let authInvalidHandler = null;
let reloginPromise = null;

function setAuthInvalidHandler(handler) {
  authInvalidHandler = typeof handler === "function" ? handler : null;
}

function isAuthExpiredError(err) {
  return String(err?.code || "") === "AUTH_EXPIRED";
}

function requestRelogin() {
  if (!authInvalidHandler) return Promise.resolve("");
  if (!reloginPromise) {
    reloginPromise = Promise.resolve()
      .then(() => authInvalidHandler())
      .then(token => String(token || authToken || ""))
      .catch(err => {
        debugWarn("[pvp] 重新登录失败", err?.message || err);
        return "";
      })
      .then(token => {
        reloginPromise = null;
        return token;
      });
  }
  return reloginPromise;
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
          // CloudBase HTTP 访问服务对请求体有上限，超限会返回英文的
          // Exceed max request payload size，直接透出用户看不懂，这里转成中文原因。
          const rawMessage = String(result?.message || result?.errMsg || "");
          if (res.statusCode === 413 || /payload size|request entity too large/i.test(rawMessage)) {
            const error = new Error("图片体积过大，请重新选择一张照片");
            error.code = "PAYLOAD_TOO_LARGE";
            throw error;
          }
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

// 令牌失效时自动静默重新登录并重试一次，避免本地缓存的旧令牌把用户一直卡在“登录已过期”。
async function callRoom(action, data = {}) {
  try {
    return await callHttpRoom(action, data);
  } catch (err) {
    if (action === "login" || !isAuthExpiredError(err) || !authInvalidHandler) throw err;
    const token = await requestRelogin();
    if (!token) throw err;
    return callHttpRoom(action, data);
  }
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
    ruleVersion: Number(room?.rules?.version || 0),
    selectionRuleVersion: Number(room?.selectionRuleVersion || 0),
    playerCount: players.length,
    readyPlayers: Array.isArray(room?.readyPlayers) ? room.readyPlayers.map(Boolean) : []
  };
}

async function fetchRoom(roomId) {
  let getError = null;
  try {
    const result = await getRoom(roomId);
    debugLog("[pvp-ready-debug] fetchRoom source=getRoom", roomId, roomReadyDebug(result.room));
    return result;
  } catch (err) {
    getError = err;
  }
  try {
    const result = await callRoom("returnToRoom", { roomId, readOnly: true });
    debugLog("[pvp-ready-debug] fetchRoom source=returnToRoomReadOnly", roomId, roomReadyDebug(result.room));
    return result;
  } catch (returnError) {
    debugWarn("[pvp-ready-debug] fetchRoom all failed", roomId, {
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

function updateRules(roomId, rules, expectedRuleVersion) {
  return callRoom("updateRules", { roomId, rules, expectedRuleVersion });
}

function setReady(roomId, ready, expectedRuleVersion, traceId = "") {
  return callRoom("setReady", { roomId, ready, expectedRuleVersion, traceId });
}

function readyAt(room, index) {
  const readyPlayers = Array.isArray(room?.readyPlayers) ? room.readyPlayers : [];
  return !!readyPlayers[index];
}

function readyResultConfirmed(room, playerIndex, ready, expectedRuleVersion) {
  if (!room || !Number.isInteger(playerIndex)) return false;
  if (Number(room.rules?.version || 0) !== Number(expectedRuleVersion || 0)) return false;
  if (ready && room.status === "selecting") {
    return Number(room.selectionRuleVersion || 0) === Number(expectedRuleVersion || 0);
  }
  return room.status === "waiting" && readyAt(room, playerIndex) === !!ready;
}

async function setReadyConfirmed(roomId, ready, expectedRuleVersion) {
  const traceId = `ready-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  let lastError = null;
  let playerIndex = null;
  debugLog("[pvp-ready-debug] setReadyConfirmed begin", { version: PVP_READY_DEBUG_VERSION, traceId, roomId, ready: !!ready, expectedRuleVersion });
  for (let attempt = 0; attempt < 3; attempt++) {
    let requestError = null;
    try {
      debugLog("[pvp-ready-debug] setReady request", { traceId, attempt: attempt + 1, roomId, ready: !!ready, expectedRuleVersion });
      const result = await setReady(roomId, ready, expectedRuleVersion, traceId);
      playerIndex = Number.isInteger(result.playerIndex) ? result.playerIndex : playerIndex;
      const confirmed = result.readyAccepted === true && readyResultConfirmed(result.room, playerIndex, ready, expectedRuleVersion);
      debugLog("[pvp-ready-debug] setReady response", { traceId, attempt: attempt + 1, playerIndex, confirmed, transitioned: !!result.transitioned, room: roomReadyDebug(result.room) });
      if (confirmed) return result;
      requestError = new Error("准备状态尚未确认");
      requestError.code = "READY_NOT_CONFIRMED";
      lastError = requestError;
    } catch (err) {
      requestError = err;
      lastError = err;
      debugWarn("[pvp-ready-debug] setReady error", { traceId, attempt: attempt + 1, code: err?.code || "", message: err?.message || String(err) });
      if (["STALE_RULES", "FORBIDDEN", "NOT_FOUND"].includes(err?.code)) throw err;
    }

    await wait(180 * (attempt + 1));
    try {
      const latest = await fetchRoom(roomId);
      playerIndex = Number.isInteger(latest.playerIndex) ? latest.playerIndex : playerIndex;
      const confirmed = readyResultConfirmed(latest.room, playerIndex, ready, expectedRuleVersion);
      debugLog("[pvp-ready-debug] setReady verify fetch", { traceId, attempt: attempt + 1, playerIndex, confirmed, room: roomReadyDebug(latest.room) });
      if (confirmed) return { ...latest, playerIndex, readyAccepted: true, transitioned: latest.room?.status === "selecting", traceId };
      if (Number(latest.room?.rules?.version || 0) !== Number(expectedRuleVersion || 0)) {
        const staleError = new Error("房间规则已修改，请确认新规则后重新准备");
        staleError.code = "STALE_RULES";
        throw staleError;
      }
    } catch (err) {
      lastError = err;
      debugWarn("[pvp-ready-debug] setReady verify error", { traceId, attempt: attempt + 1, code: err?.code || "", message: err?.message || String(err) });
      if (err?.code === "STALE_RULES") throw err;
    }

    const retryable = !requestError?.code || ["PLAYER_SYNCING", "READY_NOT_CONFIRMED", "ROOM_BUSY", "SERVER_ERROR", "SERVICE_FAILED", "HTTP_FAILED"].includes(requestError.code);
    if (!retryable) throw requestError;
  }
  console.error("[pvp-ready-debug] setReadyConfirmed failed", { traceId, roomId, ready: !!ready, expectedRuleVersion, message: lastError?.message || "unknown" });
  throw lastError || new Error("准备状态同步失败，请重试");
}

function submitSetup(roomId, setup, selectionRuleVersion) {
  return callRoom("submitSetup", { roomId, setup, selectionRuleVersion });
}

function returnToRoom(roomId, matchId) {
  return callRoom("returnToRoom", { roomId, matchId });
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

function submitBattleFeedback(content, battle) {
  return callRoom("submitBattleFeedback", { content, battle });
}

function getBattleFeedbackDetail(feedbackId) {
  return callRoom("getBattleFeedbackDetail", { feedbackId });
}

function updateBattleFeedback(feedbackId, patch) {
  return callRoom("updateBattleFeedback", { feedbackId, patch });
}

function getRankProfile() {
  return callRoom("getRankProfile");
}

function startRankMatch(playerSetup) {
  return callRoom("startRankMatch", { playerSetup });
}

// 上报排位对局的出场信息与小局比分，仅用于服务端补判负时展示，不参与结算
function reportRankProgress(rankMatchId, payload = {}) {
  return callRoom("reportRankProgress", {
    rankMatchId,
    progressVersion: payload.progressVersion,
    setup: payload.setup,
    progress: payload.progress
  });
}

function finishRankMatch(rankMatchId, finalStateSummary, clientVersion, durationMs) {
  return callRoom("finishRankMatch", { rankMatchId, finalStateSummary, clientVersion, durationMs });
}

function getRankLeaderboard(limit = 50) {
  return callRoom("getRankLeaderboard", { limit });
}

function refreshRankLeaderboardAvatars(userIds) {
  return callRoom("refreshRankLeaderboardAvatars", { userIds });
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

// 头像在界面上始终是小尺寸圆形展示，这里统一取原图中心正方形区域并缩放到 256×256：
// 1) 非正方形照片不会被拉变形；
// 2) 输出体积很小，避免 base64 膨胀 33% 后触达 CloudBase HTTP 访问服务的请求体上限
//    （表现为 Exceed max request payload size）；
// 3) 用户可以直接选原图大照片，不需要自己关心尺寸和体积。
const AVATAR_OUTPUT_SIZE = 256;
// 目标文件体积，base64 后约为其 4/3，需要给请求体上限留足余量
const AVATAR_TARGET_BYTES = 400 * 1024;
// 上传硬上限：base64 后约 933KB，仍低于 CloudBase HTTP 访问服务的请求体上限，
// 也低于微信 img_sec_check 的 1MB 送检上限
const AVATAR_UPLOAD_MAX_BYTES = 700 * 1024;
// quality 只对 jpg 生效，png 依靠 compressedWidth 缩放，因此两个参数都要给。
const AVATAR_COMPRESS_STEPS = [
  { compressedWidth: 512, quality: 80 },
  { compressedWidth: 384, quality: 65 },
  { compressedWidth: 256, quality: 50 }
];

function localFileSize(api, filePath) {
  try { return api.getFileSystemManager().statSync(filePath)?.size || 0; } catch (err) { return 0; }
}

function createOffscreenCanvasFor(api, size) {
  try {
    if (typeof api.createOffscreenCanvas === "function") {
      return api.createOffscreenCanvas({ type: "2d", width: size, height: size });
    }
  } catch (err) {}
  try {
    // 小游戏中主 canvas 已被渲染层占用，这里拿到的是离屏 canvas
    if (typeof api.createCanvas === "function") return api.createCanvas();
  } catch (err) {}
  return null;
}

function createImageFor(api, canvas) {
  try {
    if (canvas && typeof canvas.createImage === "function") return canvas.createImage();
  } catch (err) {}
  try {
    if (typeof api.createImage === "function") return api.createImage();
  } catch (err) {}
  return null;
}

// 裁剪失败一律返回空串，由调用方回退到 compressImage 分级压缩。
function cropAvatarSquare(api, filePath, size = AVATAR_OUTPUT_SIZE) {
  return new Promise(resolve => {
    const canvas = createOffscreenCanvasFor(api, size);
    if (!canvas || typeof canvas.getContext !== "function" || typeof canvas.toTempFilePath !== "function") return resolve("");
    let ctx = null;
    try {
      canvas.width = size;
      canvas.height = size;
      ctx = canvas.getContext("2d");
    } catch (err) { return resolve(""); }
    if (!ctx) return resolve("");
    const image = createImageFor(api, canvas);
    if (!image) return resolve("");
    let settled = false;
    const finish = value => { if (!settled) { settled = true; resolve(value); } };
    image.onload = () => {
      const width = Number(image.width) || 0;
      const height = Number(image.height) || 0;
      if (!width || !height) return finish("");
      const side = Math.min(width, height);
      const sx = (width - side) / 2;
      const sy = (height - side) / 2;
      try {
        ctx.clearRect(0, 0, size, size);
        ctx.drawImage(image, sx, sy, side, side, 0, 0, size, size);
      } catch (err) { return finish(""); }
      try {
        canvas.toTempFilePath({
          x: 0,
          y: 0,
          width: size,
          height: size,
          destWidth: size,
          destHeight: size,
          fileType: "jpg",
          quality: 0.85,
          success: res => finish(res?.tempFilePath || ""),
          fail: () => finish("")
        });
      } catch (err) { finish(""); }
    };
    image.onerror = () => finish("");
    try { image.src = filePath; } catch (err) { finish(""); }
  });
}

function compressImageOnce(api, src, options) {
  return new Promise(resolve => {
    if (typeof api.compressImage !== "function") return resolve("");
    try {
      api.compressImage({
        src,
        quality: options.quality,
        compressedWidth: options.compressedWidth,
        success: res => resolve(res?.tempFilePath || ""),
        fail: () => resolve("")
      });
    } catch (err) { resolve(""); }
  });
}

// 优先走 canvas 正方形裁剪；老基础库拿不到 canvas能力时回退分级压缩，
// 每一级都从原图重新压缩，避免多次有损压缩叠加导致画质过差。
async function prepareAvatarFile(api, filePath) {
  const cropped = await cropAvatarSquare(api, filePath);
  if (cropped) {
    const croppedSize = localFileSize(api, cropped);
    if (!croppedSize || croppedSize <= AVATAR_TARGET_BYTES) return cropped;
  }
  const originalSize = localFileSize(api, filePath);
  if (!cropped && originalSize && originalSize <= AVATAR_TARGET_BYTES) return filePath;
  let best = cropped || filePath;
  for (const step of AVATAR_COMPRESS_STEPS) {
    const compressed = await compressImageOnce(api, filePath, step);
    if (!compressed) break;
    best = compressed;
    const size = localFileSize(api, compressed);
    if (!size || size <= AVATAR_TARGET_BYTES) return compressed;
  }
  return best;
}

function uploadAvatarFile(filePath) {
  const api = wxApi();
  if (!api?.getFileSystemManager || !filePath) return Promise.reject(new Error("当前环境不支持头像上传"));
  return prepareAvatarFile(api, filePath).then(finalPath => new Promise((resolve, reject) => {
    // 处理后仍然过大时本地就给出原因，避免上传超限请求体拿到平台的英文报错
    const size = localFileSize(api, finalPath);
    if (size > AVATAR_UPLOAD_MAX_BYTES) {
      const error = new Error("这张照片太大，换一张或裁剪后再试");
      error.code = "AVATAR_TOO_LARGE";
      return reject(error);
    }
    api.getFileSystemManager().readFile({
      filePath: finalPath,
      encoding: "base64",
      success: res => callRoom("uploadAvatar", { ext: fileExt(finalPath), imageBase64: res.data })
        .then(resolve)
        .catch(reject),
      fail: err => reject(new Error(err?.errMsg || "头像读取失败"))
    });
  }));
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
  return [room.roomId || room._id || "", room.status || "", room.turnSeq || 0, room.updatedAt || 0, room.rules?.version || 0, room.selectionRuleVersion || 0, readyPlayers].join(":");
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
    debugLog("[pvp-ready-debug] watch deliver", { source, roomId, key, room: roomReadyDebug(room) });
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

module.exports = {
  setAuthToken,
  getAuthToken,
  setAuthInvalidHandler,
  login,
  createRoom,
  joinRoom,
  getRoom,
  fetchRoom,
  getRoomCode,
  updateRules,
  setReady,
  setReadyConfirmed,
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
  submitBattleFeedback,
  getBattleFeedbackDetail,
  updateBattleFeedback,
  getRankProfile,
  startRankMatch,
  reportRankProgress,
  finishRankMatch,
  getRankLeaderboard,
  refreshRankLeaderboardAvatars,
  getRankPublicProfile,
  saveWechatProfile,
  updateProfile,
  uploadAvatarFile,
  watchRoom,
  closeRoomWatch
};
