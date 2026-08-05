#!/usr/bin/env node
"use strict";

const assert = require("assert");
const Module = require("module");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PVP_FUNCTION = path.join(ROOT, "cloudfunctions/pvpRoom/index.js");
const stores = new Map();
let currentOpenid = "";

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

function docRef(name, id) {
  const store = storeFor(name);
  return {
    async get() {
      return { data: store.has(id) ? clone(store.get(id)) : null };
    },
    async set({ data }) {
      store.set(id, resolveValue(data));
      return { _id: id };
    },
    async update({ data }) {
      if (!store.has(id)) throw new Error(`document not found: ${name}/${id}`);
      store.set(id, { ...clone(store.get(id)), ...resolveValue(data) });
      return { updated: 1 };
    }
  };
}

function collectionRef(name) {
  return {
    doc(id) {
      return docRef(name, String(id));
    }
  };
}

const database = {
  command: {
    set(value) { return operation("set", value); },
    remove() { return operation("remove"); }
  },
  async createCollection(name) {
    storeFor(name);
  },
  collection: collectionRef,
  async runTransaction(work) {
    return work({ collection: collectionRef });
  }
};

const deletedFiles = [];
const cloudMock = {
  DYNAMIC_CURRENT_ENV: "mock",
  init() {},
  database() { return database; },
  getWXContext() { return { OPENID: currentOpenid, APPID: "smoke-app" }; },
  // 头像走云存储：数据库只存 fileID，出口再换成临时链接
  async getTempFileURL({ fileList }) {
    return {
      fileList: (fileList || []).map(item => {
        const fileID = typeof item === "string" ? item : item.fileID;
        return { fileID, tempFileURL: `https://cdn.example.com/${encodeURIComponent(fileID)}?sign=mock&t=${Date.now()}` };
      })
    };
  },
  async deleteFile({ fileList }) {
    deletedFiles.push(...(fileList || []));
    return { fileList: (fileList || []).map(fileID => ({ fileID, status: 0 })) };
  }
};

const originalLoad = Module._load;
Module._load = function mockWxServerSdk(request, parent, isMain) {
  if (request === "wx-server-sdk") return cloudMock;
  return originalLoad.call(this, request, parent, isMain);
};
const { main, viewerSafeMatch, resolveCloudFileUrls, ownedAvatarFileId } = require(PVP_FUNCTION);
Module._load = originalLoad;

const originalConsoleLog = console.log;
console.log = (...args) => {
  const first = String(args[0] || "");
  if (first.startsWith("[pvp-ready-debug]") || first.startsWith("[pvpRoom] created collection:")) return;
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
  assert.equal(result?.code, expectedCode, `${action} 应返回 ${expectedCode}`);
  return result;
}

function setup(name, faction) {
  return { name, faction, leaderId: "", customDeckIds: [] };
}

async function createJoinedRoom(suffix) {
  const host = `smoke-host-${suffix}`;
  const guest = `smoke-guest-${suffix}`;
  const rules = { factionMode: "any", faction: "开国群雄", deckMode: "any" };
  const created = await rpc(host, "createRoom", { rules, setup: setup("房主", "开国群雄") });
  const roomId = created.roomId;
  const joined = await rpc(guest, "joinRoom", { roomId, setup: setup("好友", "草莽星火") });
  assert.equal(joined.room.players.length, 2, "双方应同时存在于房间");
  assert.deepEqual(joined.room.readyPlayers, [false, false], "加入后双方应均未准备");
  return { host, guest, roomId, ruleVersion: joined.room.rules.version };
}

async function readyBoth(context, order) {
  let latest = null;
  for (const player of order) {
    latest = await rpc(player, "setReady", {
      roomId: context.roomId,
      ready: true,
      expectedRuleVersion: context.ruleVersion,
      traceId: `smoke-${player}`
    });
  }
  assert.equal(latest.room.status, "selecting", "双方准备后必须进入选牌阶段");
  assert.deepEqual(latest.room.readyPlayers, [false, false], "进入选牌后必须清空等待阶段准备态");
  assert.equal(latest.room.selectionRuleVersion, context.ruleVersion, "选牌规则版本必须锁定为当前版本");
  return latest;
}

// 联机对局必须按视角脱敏：自己手牌是真实卡，对手手牌与双方牌库只有数量占位。
// 一旦回归成明文下发，任何一端都能读出对手手牌与抽牌顺序造成作弊。
function assertMatchVisibility(room, viewerIndex, label) {
  const match = room?.match;
  assert(match, `${label} 应能读到牌局`);
  const opponentIndex = viewerIndex === 0 ? 1 : 0;
  const mine = match.players[viewerIndex];
  const opponent = match.players[opponentIndex];

  assert(mine.hand.length > 0, `${label} 自己手牌不应为空`);
  assert(mine.hand.every(card => card.id && !card.hidden), `${label} 自己手牌必须是真实卡牌`);

  assert(opponent.hand.length > 0, `${label} 对手手牌数量必须保留`);
  assert(opponent.hand.every(card => card.hidden && !card.id), `${label} 对手手牌必须全部为隐藏占位`);
  assert(
    (opponent.retained || []).every(card => card.hidden && !card.id),
    `${label} 对手保留牌必须全部为隐藏占位`
  );

  match.players.forEach((player, index) => {
    assert(
      (player.deck || []).every(card => card.hidden && !card.id),
      `${label} 玩家${index}的牌库必须全部为隐藏占位`
    );
  });

  // pending 的候选牌只属于行动方：黄巢等技能会把行动方整个剩余牌库放进 candidates，
  // 若原样下发给对手，等于泄露牌库内容与顺序。
  const pending = match.pending;
  if (pending && Number.isInteger(pending.playerIndex) && pending.playerIndex !== viewerIndex) {
    ["candidates", "discardedCards"].forEach(field => {
      const list = pending[field];
      if (!Array.isArray(list)) return;
      assert(
        list.every(card => card.hidden && !card.id),
        `${label} 对手pending.${field} 必须全部为隐藏占位`
      );
    });
  }
}

// 头像必须以 fileID 入库：临时链接带签名且会过期，落库后头像会变空白。
async function assertAvatarStorageRules() {
  assert.equal(typeof resolveCloudFileUrls, "function", "云函数必须导出 resolveCloudFileUrls 以便回归");
  assert.equal(typeof ownedAvatarFileId, "function", "云函数必须导出 ownedAvatarFileId 以便回归");

  const openid = "avatar-owner";
  const mine = `cloud://mock.706f-mock/avatars/${openid}/1-abc.jpg`;
  const others = "cloud://mock.706f-mock/avatars/someone-else/1-abc.jpg";
  const tempUrl = "https://cdn.example.com/avatars/x.jpg?sign=abc&t=123";

  assert.equal(ownedAvatarFileId(mine, openid), mine, "本人上传的 fileID 必须被接受");
  assert.equal(ownedAvatarFileId(others, openid), "", "不得引用他人头像文件");
  assert.equal(ownedAvatarFileId(tempUrl, openid), "", "不得把临时链接当作头像标识入库");
  assert.equal(ownedAvatarFileId("https://evil.example.com/a.jpg", openid), "", "不得把站外图片设为头像");
  assert.equal(ownedAvatarFileId("", openid), "", "空值不应通过校验");

  // 出口会把 fileID 换成临时链接，但 fileID 字段本身必须原样保留供客户端回传
  const resolved = await resolveCloudFileUrls({
    ok: true,
    fileID: mine,
    avatarUrl: mine,
    user: { avatarUrl: mine },
    players: [{ avatarUrl: mine }, { avatarUrl: "" }]
  });
  assert(resolved.avatarUrl.startsWith("https://"), "avatarUrl 必须换成可访问链接");
  assert(resolved.user.avatarUrl.startsWith("https://"), "嵌套的 avatarUrl 也必须换成可访问链接");
  assert(resolved.players[0].avatarUrl.startsWith("https://"), "数组内的 avatarUrl 也必须换成可访问链接");
  assert.equal(resolved.players[1].avatarUrl, "", "空头像保持为空");
  assert.equal(resolved.fileID, mine, "fileID 字段必须原样返回，供客户端提交资料时回传");
}

// 直接校验脱敏函数本身，避免随机牌局跑不到 leaderDeckChoice 这类 pending 就漏过回归。
function assertPendingMaskingUnit() {
  assert.equal(typeof viewerSafeMatch, "function", "云函数必须导出 viewerSafeMatch 以便回归脱敏逻辑");
  const match = {
    current: 0,
    players: [
      { hand: [{ id: "a", uid: "a1" }], deck: [{ id: "b", uid: "b1" }], retained: [] },
      { hand: [{ id: "c", uid: "c1" }], deck: [{ id: "d", uid: "d1" }], retained: [] }
    ],
    pending: {
      type: "leaderDeckChoice",
      playerIndex: 0,
      candidates: [{ id: "b", uid: "b1" }, { id: "e", uid: "e1" }],
      discardedCards: [{ id: "f", uid: "f1" }]
    }
  };
  const ownerView = viewerSafeMatch(match, 0);
  assert(
    ownerView.pending.candidates.every(card => card.id),
    "行动方本人必须能看到自己的 pending 候选牌"
  );
  const opponentView = viewerSafeMatch(match, 1);
  assert(
    opponentView.pending.candidates.every(card => card.hidden && !card.id),
    "对手不得看到 pending 候选牌内容"
  );
  assert(
    opponentView.pending.discardedCards.every(card => card.hidden && !card.id),
    "对手不得看到 pending 弃置牌内容"
  );
  assert.equal(
    opponentView.pending.candidates.length,
    match.pending.candidates.length,
    "pending 候选牌数量必须保留"
  );
  assert(
    match.pending.candidates.every(card => card.id),
    "脱敏不得修改传入对象"
  );
}

async function assertBothSidesMasked(context) {
  const hostView = await rpc(context.host, "getRoom", { roomId: context.roomId });
  assertMatchVisibility(hostView.room, hostView.playerIndex, "房主视角");
  const guestView = await rpc(context.guest, "getRoom", { roomId: context.roomId });
  assertMatchVisibility(guestView.room, guestView.playerIndex, "好友视角");
}

async function startAndAct(context) {
  const firstSetup = await rpc(context.host, "submitSetup", {
    roomId: context.roomId,
    selectionRuleVersion: context.ruleVersion,
    setup: setup("房主", "开国群雄")
  });
  assert.equal(firstSetup.room.status, "selecting", "仅一方确认阵容时应继续等待");

  let latest = await rpc(context.guest, "submitSetup", {
    roomId: context.roomId,
    selectionRuleVersion: context.ruleVersion,
    setup: setup("好友", "草莽星火")
  });
  assert.equal(latest.room.status, "playing", "双方确认阵容后必须开始对战");
  assert(latest.room.match, "开始对战后必须生成牌局");
  assert.equal(latest.room.match.players.length, 2, "牌局必须包含双方玩家");
  await assertBothSidesMasked(context);
  assertPendingMaskingUnit();
  await assertAvatarStorageRules();

  latest = await rpc(context.host, "submitAction", {
    roomId: context.roomId,
    turnSeq: latest.room.turnSeq,
    battleAction: { type: "mulliganDone" }
  });
  latest = await rpc(context.guest, "submitAction", {
    roomId: context.roomId,
    turnSeq: latest.room.turnSeq,
    battleAction: { type: "mulliganDone" }
  });
  assert.equal(latest.room.match.mulligan.active, false, "双方结束换牌后必须进入行动阶段");

  const firstPlayer = latest.room.match.current;
  const firstOpenid = firstPlayer === 0 ? context.host : context.guest;
  const secondOpenid = firstPlayer === 0 ? context.guest : context.host;
  latest = await rpc(firstOpenid, "submitAction", {
    roomId: context.roomId,
    turnSeq: latest.room.turnSeq,
    battleAction: { type: "pass" }
  });
  latest = await rpc(secondOpenid, "submitAction", {
    roomId: context.roomId,
    turnSeq: latest.room.turnSeq,
    battleAction: { type: "pass" }
  });
  assert(latest.room.match.roundResults.length >= 1, "双方各执行一次行动后应完成首轮结算");
  return latest;
}

async function testBothReadyOrders() {
  const hostFirst = await createJoinedRoom("host-first");
  await readyBoth(hostFirst, [hostFirst.host, hostFirst.guest]);
  await startAndAct(hostFirst);

  const guestFirst = await createJoinedRoom("guest-first");
  await readyBoth(guestFirst, [guestFirst.guest, guestFirst.host]);
  await startAndAct(guestFirst);
}

async function testRuleChangeInvalidatesOldState() {
  const context = await createJoinedRoom("rule-change");
  await rpc(context.guest, "setReady", {
    roomId: context.roomId,
    ready: true,
    expectedRuleVersion: context.ruleVersion,
    traceId: "smoke-before-rule-change"
  });
  const changed = await rpc(context.host, "updateRules", {
    roomId: context.roomId,
    expectedRuleVersion: context.ruleVersion,
    rules: { factionMode: "fixed", faction: "开国群雄", deckMode: "autoOnly" }
  });
  assert.equal(changed.room.rules.version, context.ruleVersion + 1, "修改规则必须递增版本");
  assert.deepEqual(changed.room.readyPlayers, [false, false], "修改规则必须清空双方准备状态");
  await rpcFailure(context.guest, "setReady", {
    roomId: context.roomId,
    ready: true,
    expectedRuleVersion: context.ruleVersion,
    traceId: "smoke-stale-rule"
  }, "STALE_RULES");

  context.ruleVersion = changed.room.rules.version;
  await readyBoth(context, [context.host, context.guest]);
  await startAndAct(context);
}

(async () => {
  await testBothReadyOrders();
  await testRuleChangeInvalidatesOldState();
  console.log("PVP flow smoke tests passed: create/join, both ready orders, rule version reset, setup, start, both actions");
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
