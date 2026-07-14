const ENV_ID = "cloud1-d7gbbwpnd7d68e1b8";
const ROOM_COLLECTION = "game_rooms";

let cloudReady = false;
let roomWatcher = null;

function wxApi() {
  return typeof wx !== "undefined" ? wx : null;
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
    if (!result || result.ok === false) throw new Error(result?.message || "云函数调用失败");
    return result;
  });
}

function createRoom(setup, rules) {
  return callRoom("createRoom", { setup, rules });
}

function joinRoom(roomId, setup) {
  return callRoom("joinRoom", { roomId, setup });
}

function updateRules(roomId, rules) {
  return callRoom("updateRules", { roomId, rules });
}

function setReady(roomId, ready) {
  return callRoom("setReady", { roomId, ready });
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
  if (roomWatcher && roomWatcher.close) {
    try { roomWatcher.close(); } catch (err) { console.warn("[pvp] close watch failed", err); }
  }
  roomWatcher = null;
}

function watchRoom(roomId, onChange, onError) {
  const api = wxApi();
  if (!initCloud() || !api.cloud.database) throw new Error("当前环境不支持云数据库监听");
  closeRoomWatch();
  const db = api.cloud.database({ env: ENV_ID });
  console.log("[pvp] watchRoom 开始监听, roomId=", roomId);
  roomWatcher = db.collection(ROOM_COLLECTION).doc(roomId).watch({
    onChange(snapshot) {
      console.log("[pvp] watch onChange 触发, type=", snapshot && snapshot.type,
        "docChanges=", snapshot && snapshot.docChanges ? snapshot.docChanges.length : 0,
        "docs=", snapshot && snapshot.docs ? snapshot.docs.length : 0);
      // 优先从 docs 取最新文档
      const docs = snapshot && snapshot.docs ? snapshot.docs : [];
      if (docs[0]) {
        console.log("[pvp] watch 收到房间数据, status=", docs[0].status, "players=", (docs[0].players || []).length);
        onChange(docs[0]);
        return;
      }
      // 兜底：从 docChanges 中取
      const changes = snapshot && snapshot.docChanges ? snapshot.docChanges : [];
      if (changes.length > 0 && changes[0].doc) {
        console.log("[pvp] watch 从 docChanges 取数据, status=", changes[0].doc.status);
        onChange(changes[0].doc);
        return;
      }
      console.log("[pvp] watch onChange 但无有效文档数据, snapshot keys=", snapshot ? Object.keys(snapshot) : "null");
    },
    onError(err) {
      console.error("[pvp] watch onError:", err && err.errMsg || err);
      if (onError) onError(err);
    }
  });
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
  updateRules,
  setReady,
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
