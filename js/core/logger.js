// 统一调试日志开关。
// 正式包保持 DEBUG_LOG = false：只输出 warn/error，避免线上刷大量诊断日志、泄露内部状态。
// 需要排查线上问题时把 DEBUG_LOG 改为 true，重新发一个体验版即可。
const DEBUG_LOG = false;

function debugLog(...args) {
  if (DEBUG_LOG) console.log(...args);
}

function debugWarn(...args) {
  if (DEBUG_LOG) console.warn(...args);
}

module.exports = { DEBUG_LOG, debugLog, debugWarn };
