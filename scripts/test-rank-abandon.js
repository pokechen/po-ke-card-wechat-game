#!/usr/bin/env node
"use strict";

// 排位赛"逃跑免罚"回归测试：直接调用真实 pvpRoom 云函数入口，使用内存数据库桩，不访问云端。
// 覆盖四条曾经可以零成本免罚的路径：
//   1. 开局后不提交结算，直接开下一局（杀进程逃跑）
//   2. 并发开多局，只提交赢的那一局
//   3. 长时间后台后再恢复结算
//   4. 提交自相矛盾的战报把必输的局洗成"数据异常"
// 同时验证立即重开也会判负上一局。

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
    if (expected && expected.__dbOperation === "gt") return Number(actual) > Number(expected.value);
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
  const state = { orderKey: "", orderDir: "asc", limit: 0, skip: 0 };
  const ref = {
    orderBy(key, dir) { state.orderKey = key; state.orderDir = dir || "asc"; return ref; },
    limit(value) { state.limit = value; return ref; },
    skip(value) { state.skip = Math.max(0, Number(value) || 0); return ref; },
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
      rows = rows.slice(state.skip);
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
    gt(value) { return operation("gt", value); },
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

  // 排位创建后直接不提交（等价于杀进程逃跑），下次开局立即判负。
  await rpc(openid, "startRankMatch", { playerSetup: { faction: "random" } });
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

async function testLongSuspendCanFinishNormally() {
  const openid = "rank-abandon-3";
  const before = await power(openid);

  const started = await rpc(openid, "startRankMatch", { playerSetup: { faction: "random" } });
  const firstReport = await rpc(openid, "reportRankProgress", {
    rankMatchId: started.rankMatchId,
    progressVersion: 1,
    setup: {
      humanFaction: "开国群雄",
      humanLeader: "刘邦",
      humanLeaderId: "leader-liubang",
      aiFaction: "遗策复兴",
      aiLeader: "项籍",
      aiLeaderId: "leader-xiangyu"
    },
    progress: {
      round: 2,
      phase: "playing",
      current: 1,
      passed: [true, false],
      rounds: [1, 0],
      scores: [45, 38],
      roundResults: [{ round: 1, scores: [45, 38], winner: 0 }]
    }
  });
  assert.equal(firstReport.updated, true, "初始局面必须成功写入当前排位局");

  // 模拟小程序被长时间挂起后恢复；排位局不应因时长被判负。
  clockOffset += 3 * 60 * 60 * 1000;
  const resumedReport = await rpc(openid, "reportRankProgress", {
    rankMatchId: started.rankMatchId,
    progressVersion: 2,
    progress: {
      round: 2,
      phase: "playing",
      current: 0,
      passed: [true, false],
      rounds: [1, 0],
      scores: [52, 46],
      roundResults: [{ round: 1, scores: [45, 38], winner: 0 }]
    }
  });
  assert.equal(resumedReport.updated, true, "长时间后台恢复后仍必须能更新排位局面");

  const result = await rpc(openid, "finishRankMatch", {
    rankMatchId: started.rankMatchId,
    clientVersion: "test",
    durationMs: 120000,
    finalStateSummary: {
      ...winSummary(),
      humanFaction: "开国群雄",
      humanLeader: "刘邦",
      humanLeaderId: "leader-liubang",
      aiFaction: "遗策复兴",
      aiLeader: "项籍",
      aiLeaderId: "leader-xiangyu"
    }
  });

  assert.equal(result.autoLoss, undefined, "长时间后台恢复后结算不得自动判负");
  assert.equal(result.delta.powerDelta, 1, "恢复后正常赢局必须增加 1 点权势");
  const after = await power(openid);
  assert.equal(after, before + 1, `长时间后台恢复后必须正常计分：${before} -> ${after}`);
  const record = (await historyFor(openid)).find(item => item.rankMatchId === started.rankMatchId);
  assert(record && record.endReason === "normal", "长时间后台恢复后的排位必须记录为正常结算");
  assert.equal(record.humanFaction, "开国群雄", "恢复后的正常战绩必须记录我方阵营");
  assert.equal(record.aiLeader, "项籍", "恢复后的正常战绩必须记录对手主将");
  console.log("✓ 排位长时间后台后仍可继续同步并正常结算");
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
  assert.equal(record.resultText, "排位弃局", "异常判负对玩家也必须统一显示为排位弃局");
  assert.equal(record.validationStatus, "invalid", "统一文案不得抹掉异常风控状态");
  assert(record.riskFlags.includes("MISSING_ROUND_RESULTS"), "异常原因必须保留在风控标记中");
  assert.equal(record.rankedAnomaly, true, "异常判负应保留风控标记");
  assert.equal(record.rankDeltaText, "权势 -1，威望不变", `异常判负也要照实展示扣分，实际 ${record.rankDeltaText}`);
  console.log("✓ 提交自相矛盾战报 → 按数据异常判负而非免罚");
}

async function testImmediateRestartIsAbandon() {
  const openid = "rank-abandon-5";
  await liftAboveProtection(openid, 8);
  const before = await power(openid);

  // 排位创建即视为开局：即使立即重开，也不能作废上一局逃避结算。
  await rpc(openid, "startRankMatch", { playerSetup: { faction: "random" } });
  const retry = await rpc(openid, "startRankMatch", { playerSetup: { faction: "random" } });
  assert.equal(retry.abandonedPrevious, 1, "立即重复创建也必须判负上一局");

  const after = await power(openid);
  assert.equal(after, before - 1, `立即重开必须扣分：${before} -> ${after}`);
  const record = (await historyFor(openid)).find(item => item.endReason === "abandon");
  assert(record, "立即重开必须写入弃局战绩");
  console.log("✓ 创建后立即重开 → 上一局按弃局判负");
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
    progressVersion: 1,
    setup: {
      humanFaction: "开国群雄",
      humanLeader: "刘邦",
      humanLeaderId: "leader-liubang",
      aiFaction: "遗策复兴",
      aiLeader: "项籍",
      aiLeaderId: "leader-xiangyu"
    },
    progress: {
      round: 2,
      phase: "playing",
      current: 1,
      passed: [true, false],
      rounds: [1, 0],
      scores: [45, 38],
      roundResults: [{ round: 1, scores: [45, 38], winner: 0 }]
    }
  });
  assert.equal(reported.updated, true, "小局进度必须写入当前排位局");
  const newer = await rpc(openid, "reportRankProgress", {
    rankMatchId: started.rankMatchId,
    progressVersion: 2,
    progress: {
      round: 2,
      phase: "playing",
      current: 0,
      passed: [true, false],
      rounds: [1, 0],
      scores: [52, 46],
      roundResults: [{ round: 1, scores: [45, 38], winner: 0 }]
    }
  });
  const delayed = await rpc(openid, "reportRankProgress", {
    rankMatchId: started.rankMatchId,
    progressVersion: 1,
    progress: { round: 2, phase: "playing", current: 1, passed: [false, false], rounds: [1, 0], scores: [99, 0], roundResults: [] }
  });
  assert.equal(newer.updated, true, "更高版本局面必须写入当前排位局");
  assert.equal(delayed.updated, false, "延迟到达的旧局面不得覆盖最新局面");

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
  assert.deepEqual(record.disconnectSnapshot.scores, [52, 46], "快照场面分应为最后一次有效上报值");
  assert.equal(record.disconnectSnapshot.round, 2, "快照应保留当前所在小局");
  assert.equal(record.disconnectSnapshot.phase, "playing", "快照应保留当前阶段");
  assert.equal(record.disconnectSnapshot.current, 0, "快照应保留最后一次有效上报的行动方");
  assert.deepEqual(record.disconnectSnapshot.passed, [true, false], "快照应保留双方停牌状态");
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
    progressVersion: 2,
    progress: { rounds: [2, 0], scores: [99, 0], roundResults: [] }
  });
  assert.equal(stale.updated, false, "已结算的排位局不得再接受进度上报");
  
  // 不能拿别人的对局号写进度
  const other = await rpc("rank-abandon-8", "startRankMatch", { playerSetup: { faction: "random" } });
  const crossWrite = await rpc(openid, "reportRankProgress", {
    rankMatchId: other.rankMatchId,
    progressVersion: 1,
    progress: { rounds: [2, 0], scores: [99, 0], roundResults: [] }
  });
  assert.equal(crossWrite.updated, false, "不得向他人的排位局写入进度");
  
  await rpcFailure(openid, "reportRankProgress", { rankMatchId: started.rankMatchId }, "BAD_REQUEST");
  console.log("✓ 掉线判负仍为 0:2，但能带出掉线时比分且不可跨局写入");
}

async function testRankPublicProfileRecentStats() {
  const openid = "rank-public-profile";
  const profile = await rpc(openid, "getRankProfile", {});
  const baseTime = Date.now();
  const records = [];
  const append = (faction, wins, losses, prestigePerWin) => {
    for (let index = 0; index < wins + losses; index += 1) {
      const winner = index < wins ? 0 : 1;
      records.push({
        winner,
        humanFaction: faction,
        rankPrestigeDelta: winner === 0 ? prestigePerWin : 0
      });
    }
  };
  // 前两阵营胜场与胜率完全相同，必须由威望提升决出常胜阵营。
  append("开国群雄", 5, 2, 12);
  append("纵横权谋", 5, 2, 8);
  append("百家争鸣", 0, 6, 0);
  records.forEach((record, index) => {
    storeFor("match_history").set(`rank-public-${index}`, {
      openid,
      time: baseTime - index,
      source: "pvpRoom",
      record: { ranked: true, ...record }
    });
  });
  // 第 21 场不应进入近 20 场统计。
  storeFor("match_history").set("rank-public-outside-window", {
    openid,
    time: baseTime - records.length,
    source: "pvpRoom",
    record: { ranked: true, winner: 0, humanFaction: "遗策复兴", rankPrestigeDelta: 200 }
  });

  const result = await rpc("rank-public-viewer", "getRankPublicProfile", { userId: profile.profile.userId });
  const stats = result.profile.recentRank;
  assert.equal(stats.totalMatches, 20, "公开资料只统计最近 20 场排位");
  assert.equal(stats.wins, 10, "近 20 场胜场统计应准确");
  assert.equal(stats.losses, 10, "近 20 场负场统计应准确");
  assert.equal(stats.draws, 0, "近 20 场平局统计应准确");
  assert.equal(stats.winRate, 50, "近 20 场排位胜率应准确");
  assert.equal(stats.favoriteFaction?.faction, "开国群雄", "胜场、胜率相同后应按威望提升选出常胜阵营");
  assert.equal(stats.favoriteFaction?.wins, 5, "常胜阵营应返回最近 20 场的胜场");
  assert.equal(stats.favoriteFaction?.winRate, 71.4, "常胜阵营应返回最近 20 场的胜率");
  assert.equal(stats.favoriteFaction?.prestigeGain, 60, "常胜阵营应累计最近 20 场的正向威望提升");
  console.log("✓ 公开排位资料准确展示近 20 场胜率与常胜阵营");
}

async function run() {
  await testNormalWinStillWorks();
  await testImmediateRestartIsAbandon();
  await testAbandonOnNextStart();
  await testConcurrentMatchesCannotBeCherryPicked();
  await testLongSuspendCanFinishNormally();
  await testInvalidSubmitIsLoss();
  await testDisconnectSnapshotReported();
  await testRankPublicProfileRecentStats();
  console.log("\n排位赛逃跑免罚回归测试全部通过");
}

run().catch(err => {
  console.error("\n排位赛逃跑免罚回归测试失败：", err.message);
  if (err.result) console.error(err.result);
  process.exit(1);
});
