#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { applyReady, applyRuleChange, roomPlayerReady } = require("../cloudfunctions/pvpRoom/readyState");

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

function room(ruleVersion = 1, playerCount = 2) {
  return {
    roomId: "1234",
    status: "waiting",
    rules: { version: ruleVersion, factionMode: "any", faction: "qin", deckMode: "any" },
    players: [
      { openid: "B-host", index: 0, setupReady: false, rematchReady: false },
      { openid: "A-guest", index: 1, setupReady: false, rematchReady: false }
    ].slice(0, playerCount),
    readyPlayers: Array(playerCount).fill(false),
    selectionRuleVersion: null,
    match: null,
    turnSeq: 0,
    updatedAt: 1
  };
}

function ready(current, playerIndex, expectedRuleVersion = current.rules.version, desiredReady = true, time = current.updatedAt + 1) {
  return applyReady(current, playerIndex, desiredReady, expectedRuleVersion, time).room;
}

function changedRules(current, version = current.rules.version + 1, time = current.updatedAt + 1) {
  return applyRuleChange(current, { ...current.rules, version, factionMode: "fixed", changedAt: time }, time);
}

function assertSelecting(current, version) {
  assert.equal(current.status, "selecting");
  assert.equal(current.selectionRuleVersion, version);
  assert.deepEqual(current.readyPlayers, [false, false]);
  assert.ok(current.players.every(player => !("ready" in player)));
}

function assertStale(fn) {
  assert.throws(fn, error => error?.code === "STALE_RULES");
}

test("场景1：A、B同时准备，两种事务顺序都原子进入选牌", () => {
  [[1, 0], [0, 1]].forEach(order => {
    let current = room();
    current = ready(current, order[0]);
    assert.equal(current.status, "waiting");
    assert.equal(roomPlayerReady(current, order[0]), true);
    assert.equal(roomPlayerReady(current, order[1]), false);
    current = ready(current, order[1]);
    assertSelecting(current, 1);
    assert.equal(current.turnSeq, 2);
  });
});

test("场景2：A准备后房主修改规则，A准备态优先清空", () => {
  let current = ready(room(), 1);
  assert.deepEqual(current.readyPlayers, [false, true]);
  current = changedRules(current);
  assert.equal(current.rules.version, 2);
  assert.equal(current.status, "waiting");
  assert.deepEqual(current.readyPlayers, [false, false]);
  assert.equal(current.selectionRuleVersion, null);
});

test("场景2.1：A在规则弹窗中继续准备，随后B准备即进入选牌", () => {
  let current = changedRules(ready(room(), 1));
  current = ready(current, 1, 2);
  assert.deepEqual(current.readyPlayers, [false, true]);
  current = ready(current, 0, 2);
  assertSelecting(current, 2);
});

test("场景2.2：A关闭弹窗后在外部准备，与B同时准备互不覆盖", () => {
  [[1, 0], [0, 1]].forEach(order => {
    let current = changedRules(ready(room(), 1));
    current = ready(current, order[0], 2);
    assert.equal(current.status, "waiting");
    current = ready(current, order[1], 2);
    assertSelecting(current, 2);
  });
});

test("场景3：房主改规则后马上准备，A保持未准备且旧请求不能启动", () => {
  let current = changedRules(ready(room(), 1));
  current = ready(current, 0, 2);
  assert.equal(current.status, "waiting");
  assert.deepEqual(current.readyPlayers, [true, false]);
  assertStale(() => ready(current, 1, 1));
  assert.equal(current.status, "waiting");
  assert.deepEqual(current.readyPlayers, [true, false]);
});

test("附加：同一准备请求重复提交幂等", () => {
  let current = ready(room(), 1);
  const turnSeq = current.turnSeq;
  current = ready(current, 1);
  assert.equal(current.turnSeq, turnSeq);
  assert.deepEqual(current.readyPlayers, [false, true]);
});

test("附加：进入选牌后同版本准备重试按成功处理", () => {
  let current = ready(ready(room(), 1), 0);
  const retried = applyReady(current, 0, true, 1, current.updatedAt + 1);
  assert.equal(retried.changed, false);
  assert.equal(retried.transitioned, true);
  assert.strictEqual(retried.room, current);
});

test("附加：取消准备不会影响另一玩家", () => {
  let current = ready(room(), 1);
  current = ready(current, 1, 1, false);
  assert.equal(current.status, "waiting");
  assert.deepEqual(current.readyPlayers, [false, false]);
});

test("附加：只有一名玩家时准备不会提前进入选牌", () => {
  const current = ready(room(1, 1), 0);
  assert.equal(current.status, "waiting");
  assert.deepEqual(current.readyPlayers, [true]);
});

test("附加：连续两次规则修改始终清空双方准备", () => {
  let current = changedRules(ready(room(), 0));
  current = ready(current, 1, 2);
  current = changedRules(current, 3);
  assert.equal(current.rules.version, 3);
  assert.deepEqual(current.readyPlayers, [false, false]);
});

test("客户端协议：弹窗确认绑定展示版本，轮询不清提交锁，已删除二次开始", () => {
  const root = path.resolve(__dirname, "..");
  const game = fs.readFileSync(path.join(root, "game.js"), "utf8");
  const client = fs.readFileSync(path.join(root, "js/core/pvpClient.js"), "utf8");
  const server = fs.readFileSync(path.join(root, "cloudfunctions/pvpRoom/index.js"), "utf8");
  assert.match(game, /setPvpReady\(true, shownVersion\)/);
  assert.match(game, /queuedReadyRuleVersion/);
  assert.match(game, /queueReadyAfterRuleUpdate/);
  assert.match(game, /ignore room response from previous session/);
  assert.match(game, /function applyRoomUpdate\(room, playerIndex, completeSubmission = false\)/);
  assert.doesNotMatch(game, /function startPvpSelection\(/);
  assert.doesNotMatch(client, /function startSelection\(/);
  assert.doesNotMatch(server, /action === "startSelection"/);
  assert.match(client, /selectionRuleVersion/);
  assert.match(client, /returnToRoom\(roomId, matchId\)/);
  assert.match(server, /expectedRuleVersion/);
  assert.match(server, /STALE_SELECTION/);
  assert.match(server, /STALE_MATCH/);
  assert.match(server, /async function submitSetup[\s\S]*?runRoomTransaction/);
  assert.match(server, /async function returnToRoom[\s\S]*?runRoomTransaction/);
  assert.match(server, /async function runRoomTransaction/);
});

let failures = 0;
for (const { name, fn } of tests) {
  try {
    fn();
    console.log(`通过：${name}`);
  } catch (error) {
    failures += 1;
    console.error(`失败：${name}\n  ${error.stack || error.message}`);
  }
}

console.log(`联机准备验收：${tests.length - failures}/${tests.length} 通过`);
if (failures) process.exitCode = 1;
