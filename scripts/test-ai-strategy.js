#!/usr/bin/env node

const assert = require("node:assert/strict");
const battle = require("../shared/core/battle");
const cards = require("../shared/core/cards");

const HARD = { blunder: 0, concede: true, valueNoise: 0, minLeadToStop: 1 };
let uidSeq = 0;

function fakeUnit(name, strength, owner, options = {}) {
  return {
    id: `test-${name}-${++uidSeq}`,
    uid: `test-${name}-${uidSeq}`,
    name,
    baseName: name,
    category: options.hero ? "hero" : "unit",
    row: options.rows || [options.row || "melee"],
    strength,
    effective: strength,
    abilities: (options.abilities || []).slice(),
    hero: !!options.hero,
    owner,
    controller: owner,
    zone: "hand",
    boardRow: null,
    playedBy: owner
  };
}

function catalogCard(name, owner) {
  const raw = cards.allCards().find(card => cards.displayName(card) === name || card.baseName === name);
  assert.ok(raw, `找不到卡牌：${name}`);
  return cards.cloneCard(raw, owner);
}

function blankState(factions = ["Northern Realms", "Monsters"]) {
  const state = battle.createMatch({ mode: "ai", humanFaction: factions[0], aiFaction: factions[1], difficulty: "hard" });
  state.autoControlAll = true;
  state.suppressRecording = true;
  state.mulligan.active = false;
  state.pending = null;
  state.roundTransition = null;
  state.round = 1;
  state.current = 0;
  state.weather = {};
  state.rowHorn = [{ melee: false, ranged: false, siege: false }, { melee: false, ranged: false, siege: false }];
  state.roundResults = [];
  state.playedHistory = [];
  state.over = false;
  state.players.forEach((player, index) => {
    player.index = index;
    player.faction = factions[index];
    player.hand = [];
    player.deck = [];
    player.discard = [];
    player.board = { melee: [], ranged: [], siege: [] };
    player.passed = false;
    player.autoPassed = false;
    player.roundsWon = 0;
    player.retained = [];
    player.leaderUsed = true;
  });
  return state;
}

function toHand(state, playerIndex, ...items) {
  items.flat().forEach(card => {
    card.owner = playerIndex;
    card.controller = playerIndex;
    card.zone = "hand";
    card.boardRow = null;
    state.players[playerIndex].hand.push(card);
  });
}

function toDeck(state, playerIndex, ...items) {
  items.flat().forEach(card => {
    card.owner = playerIndex;
    card.controller = playerIndex;
    card.zone = "deck";
    card.boardRow = null;
    state.players[playerIndex].deck.push(card);
  });
}

function toDiscard(state, playerIndex, ...items) {
  items.flat().forEach(card => {
    card.owner = playerIndex;
    card.controller = playerIndex;
    card.zone = "discard";
    card.boardRow = null;
    state.players[playerIndex].discard.push(card);
  });
}

function toBoard(state, playerIndex, row, ...items) {
  items.flat().forEach(card => {
    card.controller = playerIndex;
    card.zone = "board";
    card.boardRow = row;
    state.players[playerIndex].board[row].push(card);
  });
  battle.recalcScores(state);
}

function decide(state, playerIndex = 0) {
  state.current = playerIndex;
  battle.recalcScores(state);
  return battle.aiDecideTurn(state, HARD, playerIndex);
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test("用例0 普通阵营平分双方失去军心", () => {
  const state = blankState();
  toHand(state, 0, fakeUnit("手牌甲", 1, 0));
  toHand(state, 1, fakeUnit("手牌乙", 1, 1));
  battle.pass(state);
  battle.pass(state);
  assert.deepEqual(state.roundTransition.morale, [1, 1]);
  assert.equal(state.roundTransition.winner, null);
});

test("用例1 对手停牌使用最低成本4点牌", () => {
  const state = blankState();
  toBoard(state, 0, "melee", fakeUnit("己方17", 17, 0));
  toBoard(state, 1, "melee", fakeUnit("对方20", 20, 1));
  const low = fakeUnit("四点白板", 4, 0);
  toHand(state, 0, low, fakeUnit("十点英雄", 10, 0, { hero: true }), catalogCard("战鼓齐鸣", 0));
  state.players[1].passed = true;
  assert.equal(decide(state).card.uid, low.uid);
});

test("用例2 尼弗迦德平分取胜", () => {
  const state = blankState(["Nilfgaardian Empire", "Monsters"]);
  toBoard(state, 0, "melee", fakeUnit("己方16", 16, 0));
  toBoard(state, 1, "melee", fakeUnit("对方20", 20, 1));
  const four = fakeUnit("四点", 4, 0);
  toHand(state, 0, four, fakeUnit("六点", 6, 0));
  state.players[1].passed = true;
  assert.equal(decide(state).card.uid, four.uid);
});

test("用例3 请辞优先回收出使", () => {
  const state = blankState();
  const spy = fakeUnit("敌方出使", 1, 1, { abilities: ["Spy"] });
  toBoard(state, 0, "melee", spy, fakeUnit("己方白板", 8, 0));
  const decoy = catalogCard("请辞归隐", 0);
  toHand(state, 0, decoy, fakeUnit("普通牌", 2, 0));
  toHand(state, 1, fakeUnit("对手手牌甲", 3, 1), fakeUnit("对手手牌乙", 4, 1));
  const action = decide(state);
  assert.equal(action.card.uid, decoy.uid);
  assert.equal(action.decoyTargetUid, spy.uid);
});

test("用例4 奇策计算全部并列最高单位", () => {
  const state = blankState();
  toBoard(state, 0, "melee", fakeUnit("己8", 8, 0));
  toBoard(state, 1, "melee", fakeUnit("敌10甲", 10, 1), fakeUnit("敌10乙", 10, 1), fakeUnit("敌10丙", 10, 1));
  assert.equal(battle.estimatePlayGain(state, 0, catalogCard("釜底抽薪", 0)), 30);
});

test("用例5 奇策计算己方自伤", () => {
  const state = blankState();
  toBoard(state, 0, "melee", fakeUnit("己10甲", 10, 0), fakeUnit("己10乙", 10, 0));
  toBoard(state, 1, "melee", fakeUnit("敌10", 10, 1));
  assert.equal(battle.estimatePlayGain(state, 0, catalogCard("釜底抽薪", 0)), -10);
});

test("用例6 时局按双方净损失估值", () => {
  const state = blankState();
  toBoard(state, 0, "melee", fakeUnit("己21", 21, 0));
  toBoard(state, 1, "melee", fakeUnit("敌25", 25, 1));
  assert.equal(battle.estimatePlayGain(state, 0, catalogCard("边患四起", 0)), 4);
});

test("用例7 济世优先复归出使", () => {
  const state = blankState();
  const medic = catalogCard("华佗", 0);
  const spy = fakeUnit("弃牌出使", 1, 0, { abilities: ["Spy"] });
  toDiscard(state, 0, spy, fakeUnit("十点白板", 10, 0));
  toDeck(state, 0, fakeUnit("抽牌甲", 5, 0), fakeUnit("抽牌乙", 5, 0));
  toHand(state, 0, medic, fakeUnit("低点", 1, 0));
  toHand(state, 1, fakeUnit("对手手牌甲", 3, 1), fakeUnit("对手手牌乙", 4, 1));
  const action = decide(state);
  assert.equal(action.card.uid, medic.uid);
  assert.equal(action.medicTargetUids[0], spy.uid);
});

test("用例8 非决胜轮对集贤计入完整资源消耗", () => {
  const state = blankState();
  const muster = catalogCard("程咬金", 0);
  toHand(state, 0, muster);
  toDeck(state, 0, catalogCard("程咬金", 0), catalogCard("程咬金", 0));
  toBoard(state, 1, "melee", fakeUnit("对手领先", 30, 1));
  state.playedHistory = [1, 2].map(seq => ({ seq, round: 1, actionType: "card", playerIndex: 1 }));
  assert.equal(decide(state).action, "pass");
});

test("用例9 怪物保留单位进入下一局", () => {
  const state = blankState(["Northern Realms", "Monsters"]);
  toBoard(state, 1, "melee", fakeUnit("怪物保留", 5, 1));
  toHand(state, 0, fakeUnit("甲", 1, 0));
  toHand(state, 1, fakeUnit("乙", 1, 1));
  battle.pass(state); battle.pass(state); battle.continueRoundTransition(state);
  assert.equal(state.players[1].board.melee.length, 1);
});

test("用例10 史凯利格第三轮复起两张", () => {
  const state = blankState(["Northern Realms", "Skellige"]);
  state.round = 2;
  state.roundTransition = { matchOver: false, nextRound: 3, winner: 0 };
  toDiscard(state, 1, fakeUnit("复起甲", 8, 1), fakeUnit("复起乙", 7, 1), fakeUnit("复起丙", 6, 1));
  battle.continueRoundTransition(state);
  assert.equal(state.players[1].board.melee.length, 2);
});

test("用例11 数学不可赢时立即停牌", () => {
  const state = blankState();
  toBoard(state, 1, "melee", fakeUnit("对方50", 50, 1));
  toHand(state, 0, fakeUnit("一", 2, 0), fakeUnit("二", 3, 0));
  assert.equal(decide(state).action, "pass");
});

test("用例12 第一轮避免过度投入", () => {
  const state = blankState();
  toBoard(state, 1, "melee", fakeUnit("对手领先", 18, 1));
  toHand(state, 0, catalogCard("战鼓齐鸣", 0), fakeUnit("高价值", 10, 0, { abilities: ["Tight Bond"] }));
  state.playedHistory = [1, 2].map(seq => ({ seq, round: 1, actionType: "card", playerIndex: 1 }));
  assert.equal(decide(state).action, "pass");
});

test("用例13 天气同盟振势鼓舞顺序", () => {
  const state = blankState();
  const a = fakeUnit("同盟", 4, 0, { abilities: ["Tight Bond"] });
  const b = fakeUnit("同盟", 4, 0, { abilities: ["Tight Bond"] });
  const morale = fakeUnit("振势", 1, 0, { abilities: ["Morale Boost"] });
  toBoard(state, 0, "melee", a, b, morale);
  state.weather.melee = true;
  state.rowHorn[0].melee = true;
  battle.recalcScores(state);
  assert.equal(a.effective, 6);
  assert.equal(b.effective, 6);
  assert.equal(morale.effective, 2);
});

test("用例14 普通集贤只从已验证牌库来源拉取", () => {
  const state = blankState();
  const trigger = catalogCard("程咬金", 0);
  const handCopy = catalogCard("程咬金", 0);
  const deckCopy = catalogCard("程咬金", 0);
  const discardCopy = catalogCard("程咬金", 0);
  toHand(state, 0, trigger, handCopy);
  toDeck(state, 0, deckCopy);
  toDiscard(state, 0, discardCopy);
  toHand(state, 1, fakeUnit("对手手牌", 1, 1));
  battle.playCard(state, trigger.uid, "melee");
  assert.ok(state.players[0].hand.some(card => card.uid === handCopy.uid));
  assert.ok(state.players[0].board.melee.some(card => card.uid === deckCopy.uid));
  assert.ok(state.players[0].discard.some(card => card.uid === discardCopy.uid));
});

test("用例15 济世连锁与空牌库抽牌", () => {
  const state = blankState();
  const first = catalogCard("华佗", 0);
  const second = catalogCard("淳于意", 0);
  const spy = fakeUnit("一牌库出使", 1, 0, { abilities: ["Spy"] });
  const drawCard = fakeUnit("唯一抽牌", 3, 0);
  toHand(state, 0, first);
  toDiscard(state, 0, second, spy);
  toDeck(state, 0, drawCard);
  toHand(state, 1, fakeUnit("对手手牌", 1, 1));
  battle.playCard(state, first.uid, "siege", { medicTargetUids: [second.uid, spy.uid] });
  assert.equal(state.players[0].deck.length, 0);
  assert.equal(state.players[0].hand.filter(card => card.uid === drawCard.uid).length, 1);
});

test("用例16 单位型奇策只处理目标阵线", () => {
  const state = blankState();
  const scorchUnit = catalogCard("黄盖", 0);
  toBoard(state, 1, "melee", fakeUnit("近战10", 10, 1));
  toBoard(state, 1, "ranged", fakeUnit("远程20", 20, 1));
  toHand(state, 0, scorchUnit);
  toHand(state, 1, fakeUnit("对手手牌", 1, 1));
  battle.playCard(state, scorchUnit.uid, "melee");
  assert.equal(state.players[1].board.melee.length, 0);
  assert.equal(state.players[1].board.ranged.length, 1);
});

test("用例17 停牌玩家没有合法动作", () => {
  const state = blankState();
  state.players[0].passed = true;
  assert.equal(battle.generateLegalAiActions(state, 0).length, 0);
});

test("用例18 搜索可用两张低牌替代英雄", () => {
  const state = blankState();
  toBoard(state, 1, "melee", fakeUnit("对方8", 8, 1));
  const low1 = fakeUnit("低1", 4, 0);
  const low2 = fakeUnit("低2", 5, 0);
  const hero = fakeUnit("英雄", 10, 0, { hero: true });
  toHand(state, 0, low1, low2, hero);
  state.players[1].passed = true;
  const plan = battle.searchBestWinningSequenceFromKnownState(state, HARD, 0);
  assert.ok(plan.actions.length >= 1);
  assert.notEqual(plan.actions[0].card.uid, hero.uid);
});

test("用例19 对手隐藏牌内容不影响决策", () => {
  const left = blankState();
  toHand(left, 0, fakeUnit("己方", 5, 0), fakeUnit("己方2", 6, 0));
  toHand(left, 1, fakeUnit("隐藏弱牌", 1, 1));
  const right = JSON.parse(JSON.stringify(left));
  right.players[1].hand[0].strength = 15;
  right.players[1].hand[0].effective = 15;
  right.players[1].hand[0].hero = true;
  const a = decide(left);
  const b = decide(right);
  assert.equal(a.card?.uid || a.action, b.card?.uid || b.action);
});

test("用例20 领先后请辞回收资源", () => {
  const state = blankState();
  const valuable = fakeUnit("高价值济世", 5, 0, { abilities: ["Medic"] });
  toBoard(state, 0, "melee", fakeUnit("基础领先", 10, 0), valuable);
  toBoard(state, 1, "melee", fakeUnit("对方7", 7, 1));
  const decoy = catalogCard("请辞归隐", 0);
  toHand(state, 0, decoy);
  state.players[1].passed = true;
  const action = decide(state);
  assert.equal(action.card.uid, decoy.uid);
  assert.equal(action.decoyTargetUid, valuable.uid);
});

test("用例21 出使估值随战力升高而降低", () => {
  assert.equal(cards.cardValue(fakeUnit("低战力出使", 1, 0, { abilities: ["Spy"] })), 19);
  assert.equal(cards.cardValue(fakeUnit("高战力出使", 9, 0, { abilities: ["Spy"] })), 11);
});

test("用例22 请辞优先回收可二次济世的非传世人物", () => {
  const state = blankState();
  const medic = fakeUnit("非传世济世", 1, 0, { abilities: ["Medic"] });
  const body = fakeUnit("高点白板", 12, 0);
  toBoard(state, 0, "melee", medic, body);
  toDiscard(state, 0, fakeUnit("弃牌高点", 10, 0));
  const decoy = catalogCard("请辞归隐", 0);
  toHand(state, 0, decoy, fakeUnit("普通牌", 2, 0));
  toHand(state, 1, fakeUnit("对手手牌甲", 3, 1), fakeUnit("对手手牌乙", 4, 1));
  const action = decide(state);
  assert.equal(action.card.uid, decoy.uid);
  assert.equal(action.decoyTargetUid, medic.uid);
});

test("用例23 第一轮手牌优势不强制放弃", () => {
  const state = blankState();
  toBoard(state, 0, "melee", fakeUnit("己方七分", 7, 0));
  toBoard(state, 1, "melee", fakeUnit("对方六分", 6, 1));
  toHand(state, 0, fakeUnit("低风险一", 2, 0), fakeUnit("低风险二", 3, 0), fakeUnit("低风险三", 4, 0), fakeUnit("低风险四", 5, 0));
  toHand(state, 1, fakeUnit("对手手牌", 1, 1));
  const action = decide(state);
  assert.notEqual(action.action, "pass");
});

test("用例24 同盟估值随同名数量和战力动态增加", () => {
  const low = fakeUnit("低同盟", 2, 0, { abilities: ["Tight Bond"] });
  const high = fakeUnit("高同盟", 8, 0, { abilities: ["Tight Bond"] });
  assert.ok(cards.cardValue(low, { pool: [low, fakeUnit("低同盟", 2, 0, { abilities: ["Tight Bond"] })] }) > cards.cardValue(low));
  assert.ok(cards.cardValue(high, { pool: [high, fakeUnit("高同盟", 8, 0, { abilities: ["Tight Bond"] })] }) > cards.cardValue(low, { pool: [low, fakeUnit("低同盟", 2, 0, { abilities: ["Tight Bond"] })] }));
});

test("用例25 集贤动态增值，召唤岳家军固定加分", () => {
  const muster = fakeUnit("集贤甲", 3, 0, { abilities: ["Muster"] });
  const mate = fakeUnit("集贤甲", 3, 0, { abilities: ["Muster"] });
  const yueFei = fakeUnit("岳飞", 10, 0, { abilities: ["Hero", "Summon Shield Maidens"], hero: true });
  const shield = fakeUnit("岳家军", 6, 0, { abilities: ["Tight Bond"] });
  assert.ok(cards.cardValue(muster, { pool: [muster, mate] }) > cards.cardValue(muster));
  assert.equal(cards.cardValue(yueFei, { pool: [yueFei, shield, { ...shield, id: "shield-2" }] }), cards.cardValue(yueFei, { pool: [yueFei] }));
});

test("用例26 请辞归隐在含非传世济世时最多带3张，无济世时不超过1张", () => {
  const DECOY_IDS = ["zhangyu-0185", "zhangyu-0186", "zhangyu-0187"];
  const hasMedic = ids => ids.some(id => {
    const c = cards.cardById(id);
    return c && (c.abilities || []).includes("Medic") && !c.hero;
  });
  const decoyCount = ids => ids.filter(id => DECOY_IDS.includes(id)).length;
  let checked = 0;
  for (const faction of cards.FACTION_KEYS) {
    for (let s = 0; s < 40; s++) {
      const ids = cards.buildDeck(0, { faction, difficulty: "hard" }).map(c => c.id);
      const m = hasMedic(ids);
      const d = decoyCount(ids);
      assert.ok(d <= 3, `${faction} 请辞超过3张: ${d}`);
      if (m) assert.equal(d, 3, `${faction} 含济世却未带满3张请辞: ${d}`);
      else assert.ok(d <= 1, `${faction} 无济世却带>1张请辞: ${d}`);
      checked += 1;
    }
  }
  assert.ok(checked > 0);
});

test("用例27 济世可复归集贤人物", () => {
  const state = blankState();
  const medic = catalogCard("华佗", 0);
  const mengchang = catalogCard("孟尝君", 0);
  const plain = fakeUnit("弃牌高点", 10, 0);
  toHand(state, 0, medic);
  toDiscard(state, 0, mengchang, plain);
  const cand = battle.reviveCandidates(state, 0);
  assert.ok(cand.includes(mengchang), "复归候选应包含孟尝君等集贤人物");
  assert.ok(cand.includes(plain), "复归候选应包含普通弃牌单位");
  assert.equal(battle.playCard(state, medic.uid, "siege", { medicTargetUid: mengchang.uid }), true);
  assert.ok(state.players[0].board.ranged.some(card => card.uid === mengchang.uid), "华佗应可复归孟尝君到朝堂");
});

test("用例28 秦昭襄王启用随机济世", () => {
  const state = blankState(["Nilfgaardian Empire", "Monsters"]);
  const medic = catalogCard("华佗", 0);
  const high = fakeUnit("高点弃牌", 10, 0, { row: "melee" });
  const low = fakeUnit("低点弃牌", 1, 0, { row: "siege" });
  state.players[0].leader = {
    id: "leader-random-restore",
    uid: "leader-random-restore-0",
    name: "秦昭襄王",
    baseName: "秦昭襄王",
    leaderAbility: "Abilities that restore a unit from the discard pile restore a randomly-chosen unit.",
    abilityText: "双方济世复归改为随机目标。"
  };
  state.players[0].leaderUsed = false;
  toHand(state, 0, medic);
  toDiscard(state, 0, high, low);
  battle.useLeader(state, 0);
  assert.equal(state.randomRestore, true);
  state.current = 0;
  const originalRandom = Math.random;
  try {
    Math.random = () => 0.99;
    assert.equal(battle.playCard(state, medic.uid, "siege"), true);
  } finally {
    Math.random = originalRandom;
  }
  assert.equal(state.pending, null);
  assert.ok(state.players[0].board.siege.some(card => card.uid === low.uid), "应随机复归低点弃牌");
  assert.ok(state.players[0].discard.some(card => card.uid === high.uid), "不应固定复归最高价值弃牌");
});

test("用例29 范蠡不会被雪耻清废策略选到非法阵线", () => {
  const state = blankState(["Northern Realms", "Skellige"]);
  const fanLi = catalogCard("范蠡", 1);
  toBoard(state, 0, "melee", fakeUnit("玩家领先", 49, 0));
  toBoard(state, 1, "melee", fakeUnit("系统疆场", 26, 1));
  toHand(state, 0, fakeUnit("玩家手牌", 4, 0));
  toHand(state, 1, fanLi);
  state.players[0].roundsWon = 1;
  state.current = 1;
  assert.equal(battle.autoStep(state, { playerIndex: 1, cfg: HARD }), true);
  assert.ok(state.players[1].board.ranged.some(card => card.uid === fanLi.uid), "范蠡应合法打到朝堂");
});

test("用例30 雪耻清废始终选择合法作用线", () => {
  const state = blankState(["Northern Realms", "Skellige"]);
  const mardroeme = catalogCard("卧薪尝胆", 1);
  toBoard(state, 1, "siege", fakeUnit("系统文脉", 26, 1));
  toHand(state, 0, fakeUnit("玩家手牌", 4, 0));
  toHand(state, 1, mardroeme);
  state.current = 1;
  assert.equal(battle.autoStep(state, { playerIndex: 1, cfg: HARD }), true);
  assert.ok(state.players[1].discard.some(card => card.uid === mardroeme.uid), "卧薪尝胆应成功打出而非卡在系统回合");
});

test("用例31 两种离场召唤均立即生效且允许重复触发", () => {
  [
    { sourceName: "周瑜", sourceRow: "ranged", tokenName: "东吴水师" },
    { sourceName: "诸葛亮", sourceRow: "melee", tokenName: "无当飞军" }
  ].forEach(({ sourceName, sourceRow, tokenName }) => {
    const state = blankState();
    const source = catalogCard(sourceName, 0);
    toBoard(state, 0, sourceRow, source);
    toHand(state, 0, catalogCard("请辞归隐", 0));
    toHand(state, 1, fakeUnit("对手手牌", 1, 1));

    const firstDecoy = state.players[0].hand[0];
    assert.equal(battle.playCard(state, firstDecoy.uid, null, { decoyTargetUid: source.uid }), true, `${sourceName}首次请辞应成功`);
    assert.equal(state.players[0].board.melee.filter(card => card.name === tokenName).length, 1, `${sourceName}首次离场应立即召唤${tokenName}`);
    assert.ok(state.players[0].hand.some(card => card.uid === source.uid), `${sourceName}应回到手牌`);

    const secondDecoy = catalogCard("请辞归隐", 0);
    toHand(state, 0, secondDecoy);
    state.current = 0;
    assert.equal(battle.playCard(state, source.uid, sourceRow), true, `${sourceName}应可再次打出`);
    state.current = 0;
    assert.equal(battle.playCard(state, secondDecoy.uid, null, { decoyTargetUid: source.uid }), true, `${sourceName}第二次请辞应成功`);
    assert.equal(state.players[0].board.melee.filter(card => card.name === tokenName).length, 2, `${sourceName}重复离场应再次召唤${tokenName}`);
  });
});

test("用例32 两种召唤源因小局清场离场时均在下一局入场", () => {
  const state = blankState();
  toBoard(state, 0, "ranged", catalogCard("周瑜", 0));
  toBoard(state, 0, "melee", catalogCard("诸葛亮", 0));
  toHand(state, 0, fakeUnit("玩家手牌", 1, 0));
  toHand(state, 1, fakeUnit("对手手牌", 1, 1));

  battle.pass(state);
  battle.pass(state);
  battle.continueRoundTransition(state);

  assert.ok(state.players[0].board.melee.some(card => card.name === "东吴水师"));
  assert.ok(state.players[0].board.melee.some(card => card.name === "无当飞军"));
});

const filter = process.argv.find(arg => arg.startsWith("--filter="))?.slice(9) || "";
const selectedTests = filter ? tests.filter(item => item.name.includes(filter)) : tests;
let failures = 0;
selectedTests.forEach(({ name, fn }) => {
  try {
    fn();
    console.log(`通过：${name}`);
  } catch (error) {
    failures += 1;
    console.error(`失败：${name}\n  ${error.message}`);
  }
});
console.log(`策略验收：${selectedTests.length - failures}/${selectedTests.length} 通过`);
if (failures) process.exitCode = 1;
