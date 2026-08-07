#!/usr/bin/env node

// 验证「战俘体系」各子套件单独携带时的胜率，用于决定自动组牌是否应把它们拆成独立组。
//
// 规则前提（已核对 battle.js /卡牌数据）：
//  - 文种：2 战力，row=["朝堂"]，战俘 -> 转化为「越相文种」8 战力 + 同盟
//    （3 张同在朝堂时每张 8×3=24，合计 72）
//  - 勾践：4 战力，row=["疆场"]，战俘 -> 转化为「越王勾践」14 战力 + 传世 + 振势
//  - 范蠡：8 战力传世(hero)，row=["朝堂"]，复国 -> 打出时只转化「朝堂」线的战俘
//    => 范蠡只能转化文种，救不了疆场的勾践
//  - 卧薪尝胆：谋略 ×3，复国，可任选阵线（AI 选战俘最多的一条）
//
// 设计：
//  - 固定阵营「遗策复兴」，基准牌组 = 当前线上 hard 自动组牌（已不含战俘件）。
//  - 每个变体在基准牌组上「等量替换」：加入套件所需的 N 个单位位/ M 个谋略位，
//    就按固定组牌估值从低到高移除同样数量的单位 / 谋略，保持单位数与谋略数不变，
//    使唯一变量是「用套件替换掉最弱的牌是否更好」。
//  - 对手始终使用同一份基准牌组；每个变体每种子跑 2 场（受试分别在玩家0/玩家1），抵消先后手。
//  - 双方AI 配置完全相同，并都执行真实 AI 换牌，以隔离牌组构成的影响。

const battle = require("../shared/core/battle");
const {
  buildDeck, cardValue, deckStatus, cardById, eligibleCards, deckBuildFixedValue, hasAbility, isHeroCard
} = require("../shared/core/cards");

const HARD = { blunder: 0, concede: true, valueNoise: 0, minLeadToStop: 1 };
const FACTION = "遗策复兴";

const FANLI = "zhangyu-0319";// 范蠡：8 战力传世，复国（朝堂）
const GOUJIAN = "zhangyu-0132";                // 勾践：战俘（疆场）-> 14 传世振势
const WENZHONG = ["zhangyu-0134", "zhangyu-0330", "zhangyu-0331"]; // 文种：战俘（朝堂）-> 8 同盟
const AWAKEN = ["zhangyu-0188", "zhangyu-0189", "zhangyu-0325"];   // 卧薪尝胆：谋略，复国

// 变体定义：fanli / wenzhong / goujian / awaken 分别为是否带范蠡、文种张数、是否带勾践、卧薪张数
const VARIANTS = [
  { key: "base", label: "基准(无战俘件)", fanli: false, wenzhong: 0, goujian: false, awaken: 0 },
  { key: "fanli", label: "范蠡单带", fanli: true, wenzhong: 0, goujian: false, awaken: 0 },
  { key: "fanli+wz1", label: "范蠡+文种1", fanli: true, wenzhong: 1, goujian: false, awaken: 0 },
  { key: "fanli+wz2", label: "范蠡+文种2", fanli: true, wenzhong: 2, goujian: false, awaken: 0 },
  { key: "fanli+wz3", label: "范蠡+文种3", fanli: true, wenzhong: 3, goujian: false, awaken: 0 },
  { key: "fanli+wz3+aw1", label: "范蠡+文种3+卧薪1", fanli: true, wenzhong: 3, goujian: false, awaken: 1 },
  { key: "fanli+wz3+aw2", label: "范蠡+文种3+卧薪2", fanli: true, wenzhong: 3, goujian: false, awaken: 2 },
  { key: "fanli+wz3+aw3", label: "范蠡+文种3+卧薪3", fanli: true, wenzhong: 3, goujian: false, awaken: 3 },
  { key: "wz3+aw1", label: "文种3+卧薪1(无范蠡)", fanli: false, wenzhong: 3, goujian: false, awaken: 1 },
  { key: "gj+aw1", label: "勾践+卧薪1", fanli: false, wenzhong: 0, goujian: true, awaken: 1 },
  { key: "gj+aw2", label: "勾践+卧薪2", fanli: false, wenzhong: 0, goujian: true, awaken: 2 },
  { key: "gj+aw3", label: "勾践+卧薪3", fanli: false, wenzhong: 0, goujian: true, awaken: 3 },
  { key: "full", label: "全套(范蠡+文种3+勾践+卧薪1)", fanli: true, wenzhong: 3, goujian: true, awaken: 1 }
];

function parseArgs(argv) {
  const args = { seeds: 40, start: 0, seed: 20260805, maxSteps: 1500, only: null, json: false, aiCfg: {} };
  argv.forEach(arg => {
    if (arg === "--json") args.json = true;
    else if (arg.startsWith("--seeds=")) args.seeds = Math.max(1, Number(arg.slice(8)) || args.seeds);
    else if (arg.startsWith("--start=")) args.start = Math.max(0, Number(arg.slice(8)) || args.start);
    else if (arg.startsWith("--seed=")) args.seed = Number(arg.slice(7)) || args.seed;
    else if (arg.startsWith("--maxSteps=")) args.maxSteps = Math.max(100, Number(arg.slice(11)) || args.maxSteps);
    else if (arg.startsWith("--only=")) args.only = arg.slice(7).split(",");
    // --aiCfg='{"awakeningWastePenalty":0,"awakeningWaitPenalty":0,"dormantSetupWeight":0}' 可关闭战俘时机逻辑做新旧对比
    else if (arg.startsWith("--aiCfg=")) args.aiCfg = JSON.parse(arg.slice(8));
  });
  return args;
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return function rng() {
    t += 0x6D2B79F5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function withSeed(seed, fn) {
  const original = Math.random;
  Math.random = mulberry32(seed);
  try {
    return fn();
  } finally {
    Math.random = original;
  }
}

function isStrategyId(id) {
  const card = cardById(id);
  return !!card && (card.category === "stratagem" || card.category === "situation");
}

const POOL = eligibleCards(FACTION);
function fixedValueOf(id) {
  const card = cardById(id);
  return card ? deckBuildFixedValue(card, POOL) : 0;
}

// 牌组「理想等效战力」估算：同名同盟按同行并列计入倍率（n 张 s 战力 -> 每张 s×n）。
// 用于计算移除某张牌的**边际**损失——同盟组不可拆，抽掉1 张会让整组倍率下降，
// 其边际损失是 s×(2n−1)，远大于它的单卡固定分（岳家军单卡分 7，边际损失却是 20）。
function deckPowerEstimate(ids) {
  const cards = ids.map(id => cardById(id)).filter(Boolean);
  const bond = {};
  cards.forEach(card => {
    if (!isHeroCard(card) && hasAbility(card, "同盟")) bond[card.name] = (bond[card.name] || 0) + 1;
  });
  return cards.reduce((sum, card) => {
    let value = card.strength || 0;
    if (!isHeroCard(card) && hasAbility(card, "同盟") && bond[card.name] > 1) value *= bond[card.name];
    // 非战力类收益（济世/集贤/召唤/时局/奇策等）沿用固定估值中与战力无关的部分
    const extra = Math.max(0, fixedValueOf(card.id) - (card.strength || 0));
    return sum + value + extra;
  }, 0);
}

function marginalLoss(id, ids) {
  const without = ids.filter(item => item !== id);
  return deckPowerEstimate(ids) - deckPowerEstimate(without);
}

// 等量原位替换：在基准牌组的原有位置上，把最弱的同类牌换成套件牌，
// 保持牌组长度、单位/谋略张数以及**牌序**都与基准一致
// （若重排牌序，固定随机序列下的洗牌会产生系统性发牌偏差，base 变体就无法作为 sanity 基准）。
function buildVariantIds(baseIds, variant) {
  const addUnits = []
    .concat(variant.fanli ? [FANLI] : [])
    .concat(WENZHONG.slice(0, variant.wenzhong))
    .concat(variant.goujian ? [GOUJIAN] : []);
  const addStrategies = AWAKEN.slice(0, variant.awaken);
  const addSet = new Set(addUnits.concat(addStrategies));

  const kept = baseIds.filter(id => !addSet.has(id));
  // 按「边际损失」升序丢弃，避免总是拆掉同盟组（同盟牌单卡分最低但边际损失最大）
  const weakest = (ids, count) => {
    const picked = [];
    let remaining = kept.slice();
    for (let i = 0; i < count; i++) {
      const candidates = ids.filter(id => !picked.includes(id));
      if (!candidates.length) break;
      let best = candidates[0];
      let bestLoss = marginalLoss(best, remaining);
      candidates.slice(1).forEach(id => {
        const loss = marginalLoss(id, remaining);
        if (loss < bestLoss) { best = id; bestLoss = loss; }
      });
      picked.push(best);
      remaining = remaining.filter(item => item !== best);
    }
    return picked;
  };
  const droppedSet = new Set([
    ...weakest(kept.filter(id => !isStrategyId(id)), addUnits.length),
    ...weakest(kept.filter(id => isStrategyId(id)), addStrategies.length)
  ]);

  const queueUnits = addUnits.slice();
  const queueStrategies = addStrategies.slice();
  const ids = [];
  kept.forEach(id => {
    if (!droppedSet.has(id)) { ids.push(id); return; }
    const replacement = isStrategyId(id) ? queueStrategies.shift() : queueUnits.shift();
    if (replacement) ids.push(replacement);
  });
  // 正常情况下队列已空；若基准可丢弃的同类牌不足则追加，保证套件完整
  ids.push(...queueUnits, ...queueStrategies);
  return {
    ids,
    dropped: [...droppedSet].map(id => (cardById(id) || {}).name || id),
    added: addUnits.concat(addStrategies).map(id => (cardById(id) || {}).name || id)
  };
}

function resolveAutoPending(state) {
  const pending = state.pending;
  if (!pending) return true;
  if (pending.type === "firstPlayer") return battle.resolvePending(state, { playerIndex: pending.playerIndex === 0 ? 1 : 0 });
  if (pending.type === "row") return battle.resolvePending(state, { row: pending.rows && pending.rows[0] });
  if (pending.type === "reviveRow") return battle.resolvePending(state, { row: pending.rows && pending.rows[0] });
  if (pending.type === "revive") {
    const best = (pending.candidates || []).slice().sort((a, b) => cardValue(b) - cardValue(a))[0];
    return battle.resolvePending(state, best ? { uid: best.uid } : { skip: true });
  }
  if (pending.type === "recall") {
    const best = (pending.candidates || []).slice().sort((a, b) => cardValue(b.card) - cardValue(a.card))[0];
    return battle.resolvePending(state, best ? { uid: best.card.uid } : { skip: true });
  }
  if (pending.type === "leaderDiscard") {
    const firstTwo = (pending.candidates || []).slice().sort((a, b) => cardValue(a) - cardValue(b)).slice(0, 2);
    firstTwo.forEach(card => battle.resolvePending(state, { uid: card.uid }));
    return !state.pending;
  }
  return battle.cancelPending(state);
}

function runOneMatch(seed, subjectIds, baseIds, subjectAsPlayer0, maxSteps, aiCfg) {
  return withSeed(seed, () => {
    const state = battle.createMatch({
      mode: "ai",
      humanFaction: FACTION,
      aiFaction: FACTION,
      difficulty: "hard",
      humanCustomDeckIds: subjectAsPlayer0 ? subjectIds : baseIds,
      aiCustomDeckIds: subjectAsPlayer0 ? baseIds : subjectIds
    });
    state.autoControlAll = true;
    state.suppressRecording = true;
    state.logs = [];
    // 真实 AI 换牌（双方同策略）
    state.mulligan = { active: true, current: 0, used: [0, 0], done: [false, false], max: 2, simultaneous: true };
    state.players.forEach((_, index) => battle.aiMulliganFor(state, index, {}));
    battle.finishMulligan(state, 0);
    battle.finishMulligan(state, 1);
    while (state.pending && resolveAutoPending(state)) {}
    battle.recalcScores(state);
    let steps = 0;
    while (!state.over && steps < maxSteps) {
      steps += 1;
      if (state.roundTransition) { battle.continueRoundTransition(state); continue; }
      if (state.pending) {
        if (!resolveAutoPending(state)) throw new Error(`无法自动处理 pending: ${state.pending.type}`);
        continue;
      }
      if (!battle.autoStep(state, { playerIndex: state.current, cfg: { ...HARD, strategy: aiCfg || {} } })) {
        throw new Error(`自动出牌失败：current=${state.current}`);
      }
    }
    if (!state.over) throw new Error(`超过最大步数 ${maxSteps}：seed=${seed}`);
    const subjectIndex = subjectAsPlayer0 ? 0 : 1;
    return { draw: state.winner == null, subjectWin: state.winner === subjectIndex };
  });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const variants = args.only ? VARIANTS.filter(v => args.only.includes(v.key)) : VARIANTS;
  const stats = {};
  variants.forEach(v => { stats[v.key] = { wins: 0, draws: 0, matches: 0, invalid: 0 }; });
  let sample = null;

  for (let i = 0; i < args.seeds; i++) {
    const seed = args.seed + (args.start + i) * 9973;
    const baseIds = withSeed(seed, () => buildDeck(0, { faction: FACTION, difficulty: "hard" }).map(card => card.id));
    variants.forEach(v => {
      const built = buildVariantIds(baseIds, v);
      const status = deckStatus(built.ids, FACTION);
      if (!status.valid) stats[v.key].invalid += 1;
      if (i === 0) {
        sample = sample || [];
        sample.push({ key: v.key, label: v.label, total: built.ids.length, units: status.units, strategies: status.strategies, valid: status.valid, added: built.added, dropped: built.dropped });
      }
      [true, false].forEach((asP0, k) => {
        const r = runOneMatch(seed + (k ? 5000000 : 0), built.ids, baseIds, asP0, args.maxSteps, args.aiCfg);
        stats[v.key].matches += 1;
        if (r.draw) stats[v.key].draws += 1;
        else if (r.subjectWin) stats[v.key].wins += 1;
      });
    });
    process.stdout.write(".");
  }
  process.stdout.write("\n");

  const lines = [];
  lines.push(`战俘套件拆分验证  阵营=${FACTION}  种子数=${args.seeds}  起始种子=${args.seed}(start=${args.start})`);
  lines.push(`每变体场数 = 种子数 × 2（交替先后手），对手固定为同一份基准牌组`);
  lines.push("");
  if (sample) {
    lines.push("首个种子的牌组构成：");
    sample.forEach(s => {
      lines.push(`  ${s.label}：总${s.total} 单位${s.units} 谋略${s.strategies} 合法=${s.valid}`
        + (s.added.length ? `  加入[${s.added.join("、")}]` : "")
        + (s.dropped.length ? `  换出[${s.dropped.join("、")}]` : ""));
    });
    lines.push("");
  }
  lines.push("变体 | 胜 | 平 | 总| 胜率 | 剔除平局胜率 | 对基准");
  const baseRow = stats.base;
  const baseRate = baseRow ? baseRow.wins / Math.max(1, baseRow.matches - baseRow.draws) : null;
  variants.forEach(v => {
    const s = stats[v.key];
    const decisive = Math.max(1, s.matches - s.draws);
    const rate = s.wins / decisive;
    const delta = baseRate == null ? "" : `${(rate - baseRate) * 100 >= 0 ? "+" : ""}${((rate - baseRate) * 100).toFixed(2)}pp`;
    lines.push(`${v.label} | ${s.wins} | ${s.draws} | ${s.matches} | ${(s.wins / s.matches * 100).toFixed(2)}% | ${(rate * 100).toFixed(2)}% | ${delta}`
      + (s.invalid ? `  (非法牌组${s.invalid})` : ""));
  });
  if (args.json) console.log(JSON.stringify({ args, stats }, null, 2));
  else console.log(lines.join("\n"));
}

if (require.main === module) main();

module.exports = { buildVariantIds, runOneMatch, VARIANTS };
