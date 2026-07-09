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

function createRoom(setup) {
  return callRoom("createRoom", { setup });
}

function joinRoom(roomId, setup) {
  return callRoom("joinRoom", { roomId, setup });
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
  roomWatcher = db.collection(ROOM_COLLECTION).doc(roomId).watch({
    onChange(snapshot) {
      const docs = snapshot && snapshot.docs ? snapshot.docs : [];
      if (docs[0]) onChange(docs[0]);
    },
    onError(err) {
      if (onError) onError(err);
    }
  });
  return roomWatcher;
}

function copyRoomId(roomId) {
  const api = wxApi();
  if (!api || !api.setClipboardData) return false;
  api.setClipboardData({ data: String(roomId || "") });
  return true;
}

module.exports = {
  ENV_ID,
  initCloud,
  createRoom,
  joinRoom,
  submitAction,
  leaveRoom,
  watchRoom,
  closeRoomWatch,
  copyRoomId
};
