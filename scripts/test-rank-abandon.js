#!/usr/bin/env node
"use strict";

// 排位赛"逃跑免罚"回归测试：直接调用真实 pvpRoom 云函数入口，使用内存数据库桩，不访问云端。
// 覆盖四条曾经可以零成本免罚的路径：
//   1. 开局后不提交结算，直接开下一局（杀进程逃跑）
//   2. 并发开多局，只提交赢的那一局
//   3. 拖到对局过期后再提交
//   4. 提交自相矛盾的战报把必输的局洗成"数据异常"
// 另外验证宽限期内的重复创建不会被误判负。

const assert = require("assert");
const Module = require("module");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PVP_FUNCTION = path.join(ROOT, "cloudfunctions/pvpRoom/index.js");
const rankCore = require(path.join(ROOT, "shared/core/rank.js"));

const stores = new Map();
let currentOpenid = "";
let clockOffset = 0;

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function storeFor(name) {
  if (!stores.has(name)) stores.set(name, new Map());
  return stores.get(name);
}

function operation(type, value) {
  return { __dbOperation: type, value };
}

function resolveValue(value) {
  if (value && value.__dbOperation === "set") return clone(value.value);
  if (value && value.__dbOperation === "remove") return undefined;
  if (Array.isArray(value)) return value.map(resolveValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value)
      .map(([key, item]) => [key, resolveValue(item)])
      .filter(([, item]) => item !== undefined));
  }
  return value;
}

function matchesCondition(doc, id, condition) {
  return Object.entries(condition || {}).every(([key, expected]) => {
    const actual = key === "_id" ? id : doc?.[key];
    if (expected && expected.__dbOperation === "lt") return Number(actual) < Number(expected.value);
    if (expected && expected.__dbOperation === "nin") return !expected.value.includes(actual);
    return actual === expected;
  });
}

function docRef(name, id) {
  const store = storeFor(name);
  return {
    async get() {
      if (!store.has(id)) throw new Error(`document not found: ${name}/${id}`);
      return { data: clone(store.get(id)) };
    },
    async set({ data }) {
      store.set(id, resolveValue(data));
      return { _id: id };
    },
    async update({ data }) {
      if (!store.has(id)) throw new Error(`document not found: ${name}/${id}`);
      store.set(id, { ...clone(store.get(id)), ...resolveValue(data) });
      return { stats: { updated: 1 } };
    }
  };
}

function queryRef(name, condition) {
  const store = storeFor(name);
  const state = { orderKey: "", orderDir: "asc", limit: 0 };
  const ref = {
    orderBy(key, dir) { state.orderKey = key; state.orderDir = dir || "asc"; return ref; },
    limit(value) { state.limit = value; return ref; },
    skip() { return ref; },
    async count() {
      return { total: ref.__rows().length };
    },
    __rows() {
      let rows = [...store.entries()]
        .filter(([id, doc]) => matchesCondition(doc, id, condition))
        .map(([id, doc]) => ({ ...clone(doc), _id: id }));
      if (state.orderKey) {
        rows.sort((a, b) => {
          const diff = Number(a[state.orderKey] || 0) - Number(b[state.orderKey] || 0);
          return state.orderDir === "desc" ? -diff : diff;
        });
      }
      return state.limit ? rows.slice(0, state.limit) : rows;
    },
    async get() {
      return { data: ref.__rows() };
    },
    async update({ data }) {
      const rows = ref.__rows();
      rows.forEach(row => {
        store.set(row._id, { ...clone(store.get(row._id)), ...resolveValue(data) });
      });
      return { stats: { updated: rows.length } };
    }
  };
  return ref;
}

function collectionRef(name) {
  return {
    doc(id) { return docRef(name, String(id)); },
    where(condition) { return queryRef(name, condition); },
    orderBy(key, dir) { return queryRef(name, {}).orderBy(key, dir); },
    limit(value) { return queryRef(name, {}).limit(value); },
    async count() { return queryRef(name, {}).count(); },
    async get() { return queryRef(name, {}).get(); }
  };
}

const database = {
  command: {
    set(value) { return operation("set", value); },
    remove() { return operation("remove"); },
    lt(value) { return operation("lt", value); },
    nin(value) { return operation("nin", value); }
  },
  async createCollection(name) { storeFor(name); },
  collection: collectionRef,
  async runTransaction(work) { return work({ collection: collectionRef }); }
};

const cloudMock = {
  DYNAMIC_CURRENT_ENV: "mock",
  init() {},
  database() { return database; },
  getWXContext() { return { OPENID: currentOpenid, APPID: "rank-test-app" }; }
};

const realNow = Date.now;
Date.now = () => realNow() + clockOffset;

const originalLoad = Module._load;
Module._load = function mockWxServerSdk(request, parent, isMain) {
  if (request === "wx-server-sdk") return cloudMock;
  return originalLoad.call(this, request, parent, isMain);
};
const { main } = require(PVP_FUNCTION);
Module._load = originalLoad;

const originalConsoleLog = console.log;
console.log = (...args) => {
  const first = String(args[0] || "");
  if (first.startsWith("[pvpRoom] created collection:")) return;
  originalConsoleLog(...args);
};

async function rpc(openid, action, payload = {}) {
  currentOpenid = openid;
  const result = await main({ action, ...payload });
  if (!result?.ok) {
    const error = new Error(`${action} failed: ${result?.code || "UNKNOWN"} ${result?.message || ""}`.trim());
    error.result = result;
    throw error;
  }
  return result;
}

async function rpcFailure(openid, action, payload, expectedCode) {
  currentOpenid = openid;
  const result = await main({ action, ...payload });
  assert.equal(result?.ok, false, `${action} 应失败`);
  assert.equal(result?.code, expectedCode, `${action} 应返回 ${expectedCode}，实际 ${result?.code}`);
  return result;
}

// 把玩家权势推到脱离低段位保护区（校尉起才会掉权势），确保判负真的能扣分。
async function liftAboveProtection(openid, wins) {
  for (let i = 0; i < wins; i += 1) {
    const started = await rpc(openid, "startRankMatch", { playerSetup: { faction: "random" } });
    clockOffset += 120000;
    await rpc(openid, "finishRankMatch", {
      rankMatchId: started.rankMatchId,
      clientVersion: "test",
      durationMs: 120000,
      finalStateSummary: winSummary()
    });
  }
}

function winSummary() {
  return {
    winner: 0,
    result: "win",
    roundsWon: 2,
    roundsLost: 0,
    rounds: [2, 0],
    scores: [30, 10],
    morale: [2, 0],
    roundResults: [
      { round: 1, scores: [20, 10], winner: 0 },
      { round: 2, scores: [30, 12], winner: 0 }
    ],
    endReason: "normal"
  };
}

async function power(openid) {
  const res = await rpc(openid, "getRankProfile", {});
  return res.profile.totalPower;
}

async function historyFor(openid) {
  const res = await rpc(openid, "listMatchHistory", { limit: 50 });
  return res.history || [];
}

async function testAbandonOnNextStart() {
  const openid = "rank-abandon-1";
  await liftAboveProtection(openid, 8);
  const before = await power(openid);
  assert(before >= 7, `应已脱离低段位保护，实际权势 ${before}`);

  // 开局后直接不提交（等价于杀进程逃跑），超过宽限期再开下一局
  await rpc(openid, "startRankMatch", { playerSetup: { faction: "random" } });
  clockOffset += rankCore.ABANDON_GRACE_MS + 1000;
  const restart = await rpc(openid, "startRankMatch", { playerSetup: { faction: "random" } });

  assert.equal(restart.abandonedPrevious, 1, "上一局未提交必须被补判负1 局");
  const after = await power(openid);
  assert.equal(after, before - 1, `弃局必须扣 1 点权势：${before} -> ${after}`);

  const record = (await historyFor(openid)).find(item => item.endReason === "abandon");
  assert(record, "弃局必须写入战绩");
  assert.equal(record.resultText, "排位弃局", "弃局战绩文案应为排位弃局");
  assert.equal(record.rankDeltaText, "权势 -1，威望不变", `弃局战绩应照实展示扣分，实际 ${record.rankDeltaText}`);
  assert.equal(record.winner, 1, "弃局应记为对手胜");

  // 被判负的那局不能再提交一份赢的战报
  const abandonedId = restart.rankMatchId;
  clockOffset += rankCore.ABANDON_GRACE_MS + 1000;
  const next = await rpc(openid, "startRankMatch", { playerSetup: { faction: "random" } });
  assert.equal(next.abandonedPrevious, 1, "再次开局应把上一局也判负");
  await rpcFailure(openid, "finishRankMatch", {
    rankMatchId: abandonedId,
    clientVersion: "test",
    durationMs: 120000,
    finalStateSummary: winSummary()
  }, "RANK_MATCH_ABANDONED");
  console.log("✓ 开局不提交 → 下次开局自动判负，且旧局无法再补交赢局");
}

async function testConcurrentMatchesCannotBeCherryPicked() {
  const openid = "rank-abandon-2";
  await liftAboveProtection(openid, 8);
  const before = await power(openid);

  const first = await rpc(openid, "startRankMatch", { playerSetup: { faction: "random" } });
  clockOffset += rankCore.ABANDON_GRACE_MS + 1000;
  const second = await rpc(openid, "startRankMatch", { playerSetup: { faction: "random" } });
  assert.equal(second.abandonedPrevious, 1, "开第二局时第一局必须被判负，无法同时挂两局挑赢的交");

  clockOffset += 120000;
  await rpc(openid, "finishRankMatch", {
    rankMatchId: second.rankMatchId,
    clientVersion: "test",
    durationMs: 120000,
    finalStateSummary: winSummary()
  });
  await rpcFailure(openid, "finishRankMatch", {
    rankMatchId: first.rankMatchId,
    clientVersion: "test",
    durationMs: 120000,
    finalStateSummary: winSummary()
  }, "RANK_MATCH_ABANDONED");

  const after = await power(openid);
  assert.equal(after, before, `一负一胜净变化应为 0：${before} -> ${after}`);
  console.log("✓ 并发开局无法只结算赢的那一局");
}

async function testTimeoutSubmitIsLoss() {
  const openid = "rank-abandon-3";
  await liftAboveProtection(openid, 8);
  const before = await power(openid);

  const started = await rpc(openid, "startRankMatch", { playerSetup: { faction: "random" } });
  clockOffset += 3 * 60 * 60 * 1000; // 超过 ROOM_TTL_MS
  const result = await rpc(openid, "finishRankMatch", {
    rankMatchId: started.rankMatchId,
    clientVersion: "test",
    durationMs: 120000,
    finalStateSummary: winSummary()
  });

  assert.equal(result.autoLoss, true, "超时提交应标记为自动判负");
  assert.equal(result.delta.powerDelta, -1, "超时提交必须扣 1 点权势");
  const after = await power(openid);
  assert.equal(after, before - 1, `超时提交不得免罚：${before} -> ${after}`);
  const record = (await historyFor(openid)).find(item => item.endReason === "timeout");
  assert(record && record.resultText === "排位超时", "超时判负必须写入战绩");
  console.log("✓ 拖到过期再提交赢局→ 按超时判负");
}

async function testInvalidSubmitIsLoss() {
  const openid = "rank-abandon-4";
  await liftAboveProtection(openid, 8);
  const before = await power(openid);

  const started = await rpc(openid, "startRankMatch", { playerSetup: { faction: "random" } });
  clockOffset += 120000;
  // 自相矛盾的战报：声称 2:0 取胜，但没有任何小局明细
  const result = await rpc(openid, "finishRankMatch", {
    rankMatchId: started.rankMatchId,
    clientVersion: "test",
    durationMs: 120000,
    finalStateSummary: { ...winSummary(), roundResults: [] }
  });

  assert.equal(result.validationStatus, "invalid", "自相矛盾的战报必须判定 invalid");
  assert.equal(result.autoLoss, true, "invalid 提交应按判负处理");
  assert.equal(result.delta.powerDelta, -1, "invalid 提交必须扣 1 点权势");
  const after = await power(openid);
  assert.equal(after, before - 1, `提交垃圾战报不得免罚：${before} -> ${after}`);
  const record = (await historyFor(openid)).find(item => item.endReason === "invalid");
  assert(record, "异常判负必须写入战绩");
  assert.equal(record.rankedAnomaly, true, "异常判负应保留风控标记");
  assert.equal(record.rankDeltaText, "权势 -1，威望不变", `异常判负也要照实展示扣分，实际 ${record.rankDeltaText}`);
  console.log("✓ 提交自相矛盾战报 → 按数据异常判负而非免罚");
}

async function testGracePeriodNotPunished() {
  const openid = "rank-abandon-5";
  await liftAboveProtection(openid, 8);
  const before = await power(openid);

  // 模拟客户端请求超时后立刻重试开局：宽限期内的空局只能作废，不能判负
  await rpc(openid, "startRankMatch", { playerSetup: { faction: "random" } });
  clockOffset += 5000;
  const retry = await rpc(openid, "startRankMatch", { playerSetup: { faction: "random" } });
  assert.equal(retry.abandonedPrevious, 0, "宽限期内的重复创建不得判负");

  const after = await power(openid);
  assert.equal(after, before, `宽限期内重试不得扣分：${before} -> ${after}`);
  console.log("✓ 宽限期内重复开局只作废，不误判负");
}

async function testNormalWinStillWorks() {
  const openid = "rank-abandon-6";
  const started = await rpc(openid, "startRankMatch", { playerSetup: { faction: "random" } });
  clockOffset += 120000;
  const result = await rpc(openid, "finishRankMatch", {
    rankMatchId: started.rankMatchId,
    clientVersion: "test",
    durationMs: 120000,
    finalStateSummary: winSummary()
  });
  assert.equal(result.validationStatus, "valid", "正常赢局必须仍然有效");
  assert.equal(result.delta.powerDelta, 1, "正常赢局必须加 1 点权势");
  assert.equal(await power(openid), 1, "正常赢局必须写入权势");
  await rpcFailure(openid, "finishRankMatch", {
    rankMatchId: started.rankMatchId,
    clientVersion: "test",
    durationMs: 120000,
    finalStateSummary: winSummary()
  }, "RANK_ALREADY_FINISHED");
  console.log("✓ 正常赢局结算与重复提交幂等未被破坏");
}

// 掉线判负仍然是 0:2 失败，但要能说明掉线时的比分：
// 客户端每打完一小局上报进度，本地快照丢失后服务端补判负也能带出比分。
// 同时必须确认进度比分不会被拿去折算胜负，否则就出现“赢一局就跑”的套利。
async function testDisconnectSnapshotReported() {
  const openid = "rank-abandon-7";
  await liftAboveProtection(openid, 8);
  const before = await power(openid);
  
  const started = await rpc(openid, "startRankMatch", { playerSetup: { faction: "random" } });
  // 赢下第一小局后上报进度，然后直接跑掉
  const reported = await rpc(openid, "reportRankProgress", {
    rankMatchId: started.rankMatchId,
    setup: {
      humanFaction: "开国群雄",
      humanLeader: "刘邦",
      humanLeaderId: "leader-liubang",
      aiFaction: "遗策复兴",
      aiLeader: "项籍",
      aiLeaderId: "leader-xiangyu"
    },
    progress: {
      rounds: [1, 0],
      scores: [45, 38],
      roundResults: [{ round: 1, scores: [45, 38], winner: 0 }]
    }
  });
  assert.equal(reported.updated, true, "小局进度必须写入当前排位局");
  
  clockOffset += rankCore.ABANDON_GRACE_MS + 1000;
  const restart = await rpc(openid, "startRankMatch", { playerSetup: { faction: "random" } });
  assert.equal(restart.abandonedPrevious, 1, "跑掉的那局必须被补判负");
  
  const record = (await historyFor(openid)).find(item => item.rankMatchId === started.rankMatchId);
  assert(record, "补判负必须写入战绩");
  assert.equal(record.winner, 1, "掉线/弃局必须记为对手胜");
  assert.deepEqual(record.rounds, [0, 2], "结算比分必须恒为 0:2，不能被上报进度折算");
  assert.deepEqual(record.scores, [0, 0], "结算终分必须恒为 0:0");
  assert.equal(await power(openid), before - 1, "补判负必须照旧扣1点权势");
  
  assert(record.disconnectSnapshot, "必须带出掉线时的比分快照");
  assert.deepEqual(record.disconnectSnapshot.rounds, [1, 0], "快照小局比分应为上报值");
  assert.deepEqual(record.disconnectSnapshot.scores, [45, 38], "快照场面分应为上报值");
  assert.equal(record.disconnectSnapshot.roundResults.length, 1, "快照应保留已打完的小局明细");
  
  // 弃局战绩不能一片空白：阵营、主将、难度、牌组模式、已打小局数都要有
  assert.equal(record.humanFaction, "开国群雄", "弃局战绩必须记录我方阵营");
  assert.equal(record.humanLeader, "刘邦", "弃局战绩必须记录我方主将");
  assert.equal(record.aiFaction, "遗策复兴", "弃局战绩必须记录对手阵营");
  assert.equal(record.aiLeader, "项籍", "弃局战绩必须记录对手主将");
  assert(record.difficulty, "弃局战绩必须记录难度");
  assert(record.humanDeckMode, "弃局战绩必须记录牌组模式");
  assert.equal(record.finishedRounds, 1, "弃局战绩必须记录已打完的小局数");
  assert(record.startedAt > 0, "弃局战绩必须记录开局时间");
  
  // 已结算的局不能再被上报进度改写
  const stale = await rpc(openid, "reportRankProgress", {
    rankMatchId: started.rankMatchId,
    progress: { rounds: [2, 0], scores: [99, 0], roundResults: [] }
  });
  assert.equal(stale.updated, false, "已结算的排位局不得再接受进度上报");
  
  // 不能拿别人的对局号写进度
  const other = await rpc("rank-abandon-8", "startRankMatch", { playerSetup: { faction: "random" } });
  const crossWrite = await rpc(openid, "reportRankProgress", {
    rankMatchId: other.rankMatchId,
    progress: { rounds: [2, 0], scores: [99, 0], roundResults: [] }
  });
  assert.equal(crossWrite.updated, false, "不得向他人的排位局写入进度");
  
  await rpcFailure(openid, "reportRankProgress", { rankMatchId: started.rankMatchId }, "BAD_REQUEST");
  console.log("✓ 掉线判负仍为 0:2，但能带出掉线时比分且不可跨局写入");
}

async function run() {
  await testNormalWinStillWorks();
  await testGracePeriodNotPunished();
  await testAbandonOnNextStart();
  await testConcurrentMatchesCannotBeCherryPicked();
  await testTimeoutSubmitIsLoss();
  await testInvalidSubmitIsLoss();
  await testDisconnectSnapshotReported();
  console.log("\n排位赛逃跑免罚回归测试全部通过");
}

run().catch(err => {
  console.error("\n排位赛逃跑免罚回归测试失败：", err.message);
  if (err.result) console.error(err.result);
  process.exit(1);
});
