#!/usr/bin/env node

const { spawn } = require("child_process");
const path = require("path");
const battle = require("../shared/core/battle");
const {
  FACTION_KEYS,
  STRATEGY_CARD_BONUS,
  STRATEGY_CARD_BONUS_BASELINE,
  buildDeck,
  cardValue,
  makeCardValue
} = require("../shared/core/cards");
const { resolveAutoPending, runPreparedMatch, withSeed } = require("./simulate-ai-matches");

const HARD = { blunder: 0, concede: true, valueNoise: 0, minLeadToStop: 1 };

function parseArgs(argv) {
  const args = {
    matches: 100,
    seed: 20260731,
    maxSteps: 1200,
    candidate: "display",
    concurrency: 4,
    child: null,
    json: false
  };
  argv.forEach(arg => {
    if (arg === "--json") args.json = true;
    else if (arg.startsWith("--matches=")) args.matches = Math.max(1, Number(arg.slice(10)) || args.matches);
    else if (arg.startsWith("--seed=")) args.seed = Number(arg.slice(7)) || args.seed;
    else if (arg.startsWith("--maxSteps=")) args.maxSteps = Math.max(100, Number(arg.slice(11)) || args.maxSteps);
    else if (arg.startsWith("--candidate=")) args.candidate = arg.slice(12) || args.candidate;
    else if (arg.startsWith("--concurrency=")) args.concurrency = Math.max(1, Number(arg.slice(14)) || args.concurrency);
    else if (arg.startsWith("--child=")) args.child = Number(arg.slice(8));
    else if (arg.startsWith("--config=")) {
      try { Object.assign(args, JSON.parse(Buffer.from(arg.slice(9), "base64").toString())); } catch (error) {}
    }
  });
  return args;
}

function hasAbility(card, name) {
  return (card.abilities || []).includes(name);
}

function contextPool(context) {
  if (Array.isArray(context)) return context;
  if (Array.isArray(context?.pool)) return context.pool;
  if (Array.isArray(context?.cards)) return context.cards;
  return [];
}

function allianceBonus(card, pool, factor) {
  if (!hasAbility(card, "同盟")) return 0;
  const count = pool.filter(item => item.name === card.name && hasAbility(item, "同盟")).length;
  if (count <= 1) return 0;
  return Math.min(18, Math.max(2, Math.round((card.strength || 0) * (count - 1) * factor)));
}

function baselineAllianceBonus(card, pool) {
  if (!hasAbility(card, "同盟")) return 0;
  const count = pool.filter(item => item.name === card.name && hasAbility(item, "同盟")).length;
  if (count <= 1) return 0;
  return Math.min(8, Math.max(2, Math.round((card.strength || 0) * (count - 1) * 0.25 + Math.max(0, count - 2))));
}

function recruitRelated(card, pool) {
  return pool.filter(item => {
    if (card.recruitTarget) return item.name === card.recruitTarget || item.name === card.name;
    if (card.recruitGroupDisplayName) return item.recruitGroupDisplayName === card.recruitGroupDisplayName;
    return item.name === card.name;
  });
}

function baselineRecruitBonus(card, pool) {
  if (!hasAbility(card, "集贤")) return 0;
  const related = recruitRelated(card, pool);
  if (related.length <= 1) return 0;
  if (card.recruitGroupDisplayName === "桃园三杰" || card.recruitGroupDisplayName === "星火五雄") return 10;
  if (card.name === "曾子") return 12;
  if (card.name === "孟尝君") return 5;
  if (card.name === "鬼谷子") return 7;
  if (card.name === "李密") return 8;
  const totalStrength = related.reduce((sum, item) => sum + (item.strength || 0), 0);
  return Math.min(14, Math.round(2 + related.length * 1.5 + totalStrength * 0.15));
}

function mechanicsCandidateValue(card, context = {}, options = {}) {
  const pool = contextPool(context);
  let value = cardValue(card, context);
  if (options.alliance && hasAbility(card, "同盟")) {
    value += allianceBonus(card, pool, options.alliance) - baselineAllianceBonus(card, pool);
  }
  if (options.recruitFactor != null && hasAbility(card, "集贤")) {
    const bonus = baselineRecruitBonus(card, pool);
    value -= bonus * (1 - options.recruitFactor);
  }
  if (options.heroEnvoy && hasAbility(card, "出使") && hasAbility(card, "传世")) value += options.heroEnvoy;
  if (options.era && card.name === "时代洪流") value += options.era;
  return value;
}

function candidateValueFn(name) {
  if (name === "display") return makeCardValue(STRATEGY_CARD_BONUS);
  if (name === "alliance-real") return (card, context) => mechanicsCandidateValue(card, context, { alliance: 0.75 });
  if (name === "recruit-quarter") return (card, context) => mechanicsCandidateValue(card, context, { recruitFactor: 0.25 });
  if (name === "recruit-discount") return (card, context) => mechanicsCandidateValue(card, context, { recruitFactor: 0.5 });
  if (name === "recruit-three-quarter") return (card, context) => mechanicsCandidateValue(card, context, { recruitFactor: 0.75 });
  if (name === "synergy-balanced") return (card, context) => mechanicsCandidateValue(card, context, { alliance: 0.75, recruitFactor: 0.5 });
  if (name === "mechanics-balanced") return (card, context) => mechanicsCandidateValue(card, context, { alliance: 0.75, recruitFactor: 0.5, heroEnvoy: 3, era: 4 });
  if (name === "unit-ability") {
    return makeCardValue({
      ...STRATEGY_CARD_BONUS_BASELINE,
      rowBoost: STRATEGY_CARD_BONUS.rowBoost,
      awakening: STRATEGY_CARD_BONUS.awakening
    });
  }
  if (name === "special-only") {
    return makeCardValue({
      ...STRATEGY_CARD_BONUS,
      rowBoost: STRATEGY_CARD_BONUS_BASELINE.rowBoost,
      awakening: STRATEGY_CARD_BONUS_BASELINE.awakening,
      highestPowerRemovalUnitHuangGai: STRATEGY_CARD_BONUS_BASELINE.highestPowerRemovalUnitHuangGai,
      highestPowerRemovalUnitOther: STRATEGY_CARD_BONUS_BASELINE.highestPowerRemovalUnitOther
    });
  }
  if (name === "horn-unit") {
    return makeCardValue({ ...STRATEGY_CARD_BONUS_BASELINE, rowBoost: STRATEGY_CARD_BONUS.rowBoost });
  }
  if (name === "awakening-unit") {
    return makeCardValue({ ...STRATEGY_CARD_BONUS_BASELINE, awakening: STRATEGY_CARD_BONUS.awakening });
  }
  return (card, context = {}) => {
    let value = cardValue(card, context);
    if (name.includes("era") && card.name === "时代洪流") value += 4;
    if (name.includes("no-recall") && card.name === "请辞归隐") value -= 30;
    if (name.includes("strategy")) {
      if (card.name === "战鼓齐鸣") value += 6;
      if (card.name === "釜底抽薪") value += 7;
      if (card.category === "situation") value += card.name === "时代洪流" ? 8 : 6;
    }
    return value;
  };
}

function randomFaction() {
  return FACTION_KEYS[Math.floor(Math.random() * FACTION_KEYS.length)];
}

function draw(player, count) {
  for (let i = 0; i < count; i++) {
    const card = player.deck.shift();
    if (!card) continue;
    card.owner = player.index;
    card.controller = player.index;
    card.zone = "hand";
    card.boardRow = null;
    player.hand.push(card);
  }
}

function resetPlayer(player, index, valueFn) {
  player.difficulty = "hard";
  player.deckMode = "random";
  player.deck = buildDeck(index, { faction: player.faction, difficulty: "hard", ...(valueFn ? { valueFn } : {}) });
  player.battleCardIds = player.deck.map(card => card.id);
  player.hand = [];
  player.board = { "疆场": [], "朝堂": [], "文脉": [] };
  player.discard = [];
  player.passed = false;
  player.autoPassed = false;
  player.roundsWon = 0;
  player.retained = [];
  player.leaderUsed = false;
  player.halfSituationRound = null;
  draw(player, 10);
}

function createComparedMatch(candidate, candidateAsPlayer0) {
  const state = battle.createMatch({
    mode: "ai",
    humanFaction: randomFaction(),
    aiFaction: randomFaction(),
    difficulty: "hard"
  });
  const candidateFn = candidateValueFn(candidate);
  state.autoControlAll = true;
  state.suppressRecording = true;
  state.logs = [];
  state.players.forEach((player, index) => {
    const isCandidate = candidateAsPlayer0 ? index === 0 : index === 1;
    player.name = isCandidate ? "新评分" : "当前评分";
    resetPlayer(player, index, isCandidate ? candidateFn : null);
  });
  battle.recalcScores(state);
  battle.finishMulligan(state, 0);
  while (state.pending && resolveAutoPending(state)) {}
  return state;
}

function sortedDeckIds(player) {
  return (player.battleCardIds || []).slice().sort();
}

function runSingleMatch(index, options) {
  const pairSeed = options.seed + Math.floor(index / 2) * 9973;
  const candidateAsPlayer0 = index % 2 === 0;
  const initialState = withSeed(pairSeed, () => createComparedMatch(options.candidate, candidateAsPlayer0));
  const candidateIndex = candidateAsPlayer0 ? 0 : 1;
  const baselineIndex = candidateAsPlayer0 ? 1 : 0;
  const result = runPreparedMatch(pairSeed + 1000003, options.maxSteps, initialState, [HARD, HARD]);
  return {
    winner: result.winner == null ? "draw" : (result.winner === candidateIndex ? "candidate" : "baseline"),
    candidateDeck: sortedDeckIds(initialState.players[candidateIndex]),
    baselineDeck: sortedDeckIds(initialState.players[baselineIndex]),
    candidateFaction: initialState.players[candidateIndex].faction,
    baselineFaction: initialState.players[baselineIndex].faction
  };
}

function runAsChild(index, options) {
  process.stdout.write(JSON.stringify(runSingleMatch(index, options)));
}

function runParent(options) {
  const config = Buffer.from(JSON.stringify({
    seed: options.seed,
    maxSteps: options.maxSteps,
    candidate: options.candidate
  })).toString("base64");
  const scriptPath = path.join(__dirname, "bench-card-score.js");
  const concurrency = Math.min(options.concurrency, options.matches);
  let next = 0;
  let finished = 0;
  let candidateWins = 0;
  let baselineWins = 0;
  let draws = 0;
  let errors = 0;
  const candidateDecks = new Set();
  const baselineDecks = new Set();

  return new Promise(resolve => {
    function launch() {
      if (next >= options.matches) return;
      const index = next++;
      const child = spawn(process.execPath, [scriptPath, `--child=${index}`, `--config=${config}`], {
        stdio: ["ignore", "pipe", "pipe"]
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", data => { stdout += data; });
      child.stderr.on("data", data => { stderr += data; });
      child.on("close", code => {
        finished += 1;
        try {
          if (code !== 0) throw new Error(stderr || `子进程退出码 ${code}`);
          const result = JSON.parse(stdout.trim());
          if (result.winner === "candidate") candidateWins += 1;
          else if (result.winner === "baseline") baselineWins += 1;
          else draws += 1;
          candidateDecks.add(`${result.candidateFaction}:${result.candidateDeck.join(",")}`);
          baselineDecks.add(`${result.baselineFaction}:${result.baselineDeck.join(",")}`);
        } catch (error) {
          errors += 1;
        }
        process.stdout.write(`\r进度 ${finished}/${options.matches} 新评分胜:${candidateWins} 当前胜:${baselineWins} 平:${draws} 错误:${errors}`);
        if (next < options.matches) launch();
        if (finished === options.matches) {
          const validMatches = candidateWins + baselineWins + draws;
          const decisive = candidateWins + baselineWins;
          resolve({
            candidate: options.candidate,
            matches: options.matches,
            validMatches,
            seed: options.seed,
            candidateWins,
            baselineWins,
            draws,
            errors,
            candidateWinRate: validMatches ? candidateWins / validMatches : 0,
            candidateDecisiveWinRate: decisive ? candidateWins / decisive : 0,
            uniqueCandidateDecks: candidateDecks.size,
            uniqueBaselineDecks: baselineDecks.size
          });
        }
      });
    }
    for (let index = 0; index < concurrency; index++) launch();
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.child != null) return runAsChild(options.child, options);
  const summary = await runParent(options);
  process.stdout.write("\n");
  if (options.json) return console.log(JSON.stringify(summary, null, 2));
  console.log(`评分对比：${summary.validMatches}/${summary.matches} 场有效，候选 ${summary.candidate}，种子 ${summary.seed}`);
  console.log(`新评分胜 ${summary.candidateWins}，当前评分胜 ${summary.baselineWins}，平局 ${summary.draws}，错误 ${summary.errors}`);
  console.log(`新评分总胜率 ${(summary.candidateWinRate * 100).toFixed(1)}%，非平局胜率 ${(summary.candidateDecisiveWinRate * 100).toFixed(1)}%`);
}

if (require.main === module) main();

module.exports = { candidateValueFn, runSingleMatch };
