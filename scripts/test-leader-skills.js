#!/usr/bin/env node

const assert = require("node:assert/strict");
const battle = require("../shared/core/battle");

let uidSeq = 0;

function card(name, category = "unit", strength = 0, owner = 0, options = {}) {
  const abilities = options.hero ? ["传世"] : [];
  return {
    id: `test-${name}-${++uidSeq}`,
    uid: `test-${name}-${uidSeq}`,
    name,
    category: options.hero ? "hero" : category,
    row: options.row ? [options.row] : [],
    strength,
    effective: strength,
    abilities,
    abilityDisplayNames: abilities.slice(),
    abilityText: options.abilityText || "",
    owner,
    controller: owner,
    zone: options.zone || "hand",
    boardRow: options.boardRow || null,
    playedBy: owner
  };
}

function leader(name, abilityText) {
  return card(name, "leader", 0, 0, { abilityText });
}

function stateFor(leaderCard, options = {}) {
  const state = battle.createMatch({ mode: "ai", humanFaction: "开国群雄", aiFaction: "草莽星火", difficulty: "hard" });
  state.suppressRecording = true;
  state.autoControlAll = !!options.autoControlAll;
  state.mulligan.active = false;
  state.pending = null;
  state.roundTransition = null;
  state.current = 0;
  state.situations = {};
  state.rowHorn = [{ "疆场": false, "朝堂": false, "文脉": false }, { "疆场": false, "朝堂": false, "文脉": false }];
  state.players.forEach((player, index) => {
    player.index = index;
    player.hand = [card(`保留手牌${index}`, "unit", 1, index)];
    player.deck = [];
    player.discard = [];
    player.board = { "疆场": [], "朝堂": [], "文脉": [] };
    player.passed = false;
    player.autoPassed = false;
    player.leaderUsed = index !== 0;
  });
  state.players[0].leader = leaderCard;
  state.players[0].leaderUsed = false;
  return state;
}

function putBoard(state, playerIndex, row, ...cards) {
  cards.forEach(item => {
    item.owner = playerIndex;
    item.controller = playerIndex;
    item.zone = "board";
    item.boardRow = row;
    state.players[playerIndex].board[row].push(item);
  });
}

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

test("奇策以整线总战力判定，摧毁并列最高非传世人物且保留传世", () => {
  const state = stateFor(leader("赵匡胤", "若对方文脉线总战力达到 10 或以上，摧毁该线当前战力最高的全部非传世人物。"), { autoControlAll: true });
  const hero = card("传世人物", "hero", 20, 1, { hero: true, row: "文脉" });
  const first = card("普通甲", "unit", 6, 1, { row: "文脉" });
  const second = card("普通乙", "unit", 6, 1, { row: "文脉" });
  putBoard(state, 1, "文脉", hero, first, second);
  assert.equal(battle.useLeader(state, 0), true);
  assert.deepEqual(state.players[1].board["文脉"].map(item => item.uid), [hero.uid]);
  assert.deepEqual(new Set(state.players[1].discard.map(item => item.uid)), new Set([first.uid, second.uid]));
});

test("奇策在目标阵线总战力不足 10 时不摧毁人物", () => {
  const state = stateFor(leader("刘彻", "若对方朝堂线总战力达到 10 或以上，摧毁该线当前战力最高的全部非传世人物。"), { autoControlAll: true });
  const target = card("普通人物", "unit", 9, 1, { row: "朝堂" });
  putBoard(state, 1, "朝堂", target);
  assert.equal(battle.useLeader(state, 0), true);
  assert.equal(state.players[1].board["朝堂"].length, 1);
  assert.equal(state.players[1].discard.length, 0);
});

test("阵线翻倍不影响传世人物，也不与已有鼓舞叠加", () => {
  const state = stateFor(leader("石勒", "使己方疆场线所有非传世人物战力翻倍；与该阵线的鼓舞效果不叠加。"), { autoControlAll: true });
  const normal = card("普通人物", "unit", 5, 0, { row: "疆场" });
  const hero = card("传世人物", "hero", 10, 0, { hero: true, row: "疆场" });
  putBoard(state, 0, "疆场", normal, hero);
  state.rowHorn[0]["疆场"] = true;
  battle.recalcScores(state);
  assert.equal(normal.effective, 10);
  assert.equal(hero.effective, 10);
  assert.equal(battle.useLeader(state, 0), true);
  assert.equal(normal.effective, 10);
  assert.equal(hero.effective, 10);
});

test("管仲可以从对手弃牌堆选择特殊卡牌", () => {
  const state = stateFor(leader("管仲", "从对手弃牌堆选择 1 张卡牌加入己方手牌。"));
  const strategy = card("特殊谋略", "stratagem", 0, 1, { zone: "discard" });
  const hero = card("传世人物", "hero", 12, 1, { hero: true, zone: "discard" });
  state.players[1].discard = [strategy, hero];
  assert.equal(battle.useLeader(state, 0), true);
  assert.equal(state.pending.type, "leaderDiscardChoice");
  assert.deepEqual(new Set(state.pending.candidates.map(item => item.uid)), new Set([strategy.uid, hero.uid]));
  assert.equal(battle.resolvePending(state, { uid: strategy.uid }), true);
  assert.equal(state.players[0].hand.some(item => item.uid === strategy.uid), true);
  assert.equal(state.players[1].discard.some(item => item.uid === strategy.uid), false);
});

test("刘裕可以从己方弃牌堆选择传世卡牌", () => {
  const state = stateFor(leader("刘裕", "从己方弃牌堆选择 1 张卡牌加入手牌。"));
  const hero = card("传世人物", "hero", 12, 0, { hero: true, zone: "discard" });
  const situation = card("特殊时局", "situation", 0, 0, { zone: "discard" });
  state.players[0].discard = [hero, situation];
  assert.equal(battle.useLeader(state, 0), true);
  assert.equal(state.pending.type, "leaderDiscardChoice");
  assert.equal(battle.resolvePending(state, { uid: hero.uid }), true);
  assert.equal(state.players[0].hand.some(item => item.uid === hero.uid), true);
  assert.equal(state.players[0].discard.some(item => item.uid === hero.uid), false);
});

test("黄巢由玩家弃置两张手牌后从完整牌库选择一张", () => {
  const state = stateFor(leader("黄巢", "弃置 2 张手牌，然后从牌库选择 1 张卡牌加入手牌。"));
  const first = card("弃牌甲", "unit", 2, 0);
  const second = card("弃牌乙", "stratagem", 0, 0);
  const kept = card("保留牌", "unit", 4, 0);
  const deckStrategy = card("牌库谋略", "stratagem", 0, 0, { zone: "deck" });
  const deckHero = card("牌库传世", "hero", 15, 0, { hero: true, zone: "deck" });
  state.players[0].hand = [first, second, kept];
  state.players[0].deck = [deckStrategy, deckHero];
  assert.equal(battle.useLeader(state, 0), true);
  assert.equal(state.pending.type, "leaderDiscard");
  assert.equal(battle.resolvePending(state, { uid: first.uid }), true);
  assert.equal(battle.resolvePending(state, { uid: second.uid }), true);
  assert.equal(state.pending.type, "leaderDeckChoice");
  assert.deepEqual(new Set(state.pending.candidates.map(item => item.uid)), new Set([deckStrategy.uid, deckHero.uid]));
  assert.equal(battle.resolvePending(state, { uid: deckHero.uid }), true);
  assert.equal(state.players[0].hand.some(item => item.uid === deckHero.uid), true);
  assert.equal(state.players[0].deck.some(item => item.uid === deckHero.uid), false);
  assert.deepEqual(new Set(state.players[0].discard.map(item => item.uid)), new Set([first.uid, second.uid]));
  assert.equal(state.players[0].leaderUsed, true);
});

console.log("主将技能测试全部通过");
