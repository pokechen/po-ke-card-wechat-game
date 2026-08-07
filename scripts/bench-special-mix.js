#!/usr/bin/env node

// 特殊卡牌「构成」对比脚本：验证 hard 自动组牌的 4 张谋略/时局是否最优。
//
// 与 bench-special-cards.js 的区别：那个脚本比的是 AI 出牌参数，这个脚本比的是牌组构成。
// 做法：双方同阵营镜像，22+ 张单位牌完全取自线上 selectAutoDeckCards 结果（逐张相同），
// 只把4 张特殊卡替换成候选组合，牌组总张数保持一致，因此胜率差异只来自特殊卡构成。
//
// 线上基线（开国群雄 / 纵横权谋 / 百家争鸣 / 遗策复兴）：请辞归隐x3 + 战鼓齐鸣
// 草莽星火因池内无非传世济世单位，请辞只带 1 张，构成不同，默认不纳入范围。
//
// 用法：
//   node scripts/bench-special-mix.js --mix="请辞归隐x2,战鼓齐鸣,釜底抽薪" --matches=300 --seed=20260805
//   node scripts/bench-special-mix.js --mix="请辞归隐x3,釜底抽薪" --matches=300
//   node scripts/bench-special-mix.js --list# 打印各阵营候选特殊卡

const { spawn } = require("child_process");
const path = require("path");
const battle = require("../shared/core/battle");
const cards = require("../shared/core/cards");
const { allCards, cloneCard, shuffle, selectAutoDeckCards, deckBuildFixedValue, groupCards, categoryLabel } = cards;
const { resolveAutoPending, runPreparedMatch, withSeed } = require("./simulate-ai-matches");

// 请辞可带 3 张的4个阵营（草莽星火构成本就不同，单列）；也支持直接用阵营名作为范围
const FACTION_SCOPES = {
  recall3: ["开国群雄", "纵横权谋", "百家争鸣", "遗策复兴"],
  situation: ["草莽星火"],
  all: cards.FACTION_KEYS.slice()
};
cards.FACTION_KEYS.forEach(faction => { FACTION_SCOPES[faction] = [faction]; });

function parseArgs(argv) {
  const args = { matches: 100, seed: 20260805, maxSteps: 1200, concurrency: 4, scope: "recall3", child: null, json: false, mix: "", list: false, dropUnits: 0, deckProfile: null };
  argv.forEach(arg => {
    if (arg === "--json") args.json = true;
    else if (arg === "--list") args.list = true;
    else if (arg.startsWith("--profile=")) {
      // --profile=strategyTarget:5,allowSituation:false
      const profile = {};
      arg.slice(10).split(",").forEach(pair => {
        const [key, value] = pair.split(":");
        if (!key) return;
        profile[key.trim()] = value === "false" ? false : value === "true" ? true : Number(value);
      });
      args.deckProfile = profile;
    }
    else if (arg.startsWith("--dropUnits=")) args.dropUnits = Math.max(0, Number(arg.slice(12)) || 0);
    else if (arg.startsWith("--matches=")) args.matches = Math.max(1, Number(arg.slice(10)) || args.matches);
    else if (arg.startsWith("--seed=")) args.seed = Number(arg.slice(7)) || args.seed;
    else if (arg.startsWith("--maxSteps=")) args.maxSteps = Math.max(100, Number(arg.slice(11)) || args.maxSteps);
    else if (arg.startsWith("--concurrency=")) args.concurrency = Math.max(1, Number(arg.slice(14)) || args.concurrency);
    else if (arg.startsWith("--scope=")) args.scope = arg.slice(8);
    else if (arg.startsWith("--mix=")) args.mix = arg.slice(6);
    else if (arg.startsWith("--child=")) args.child = Math.max(0, Number(arg.slice(8)) || 0);
    else if (arg.startsWith("--config=")) {
      try { Object.assign(args, JSON.parse(Buffer.from(arg.slice(9), "base64").toString())); } catch (error) {}
    }
  });
  if (!FACTION_SCOPES[args.scope]) throw new Error(`未知阵营范围 ${args.scope}，可选：${Object.keys(FACTION_SCOPES).join(" / ")}`);
  return args;
}

function factionPool(faction) {
  return allCards().filter(card => card.category !== "leader" && (card.faction === faction || card.faction === "天下共识"));
}

// "请辞归隐x2,战鼓齐鸣" -> [{name:"请辞归隐",count:2},{name:"战鼓齐鸣",count:1}]
function parseMix(text) {
  return String(text).split(",").map(item => item.trim()).filter(Boolean).map(item => {
    const m = item.match(/^(.+?)[xX*](\d+)$/);
    return m ? { name: m[1].trim(), count: Math.max(1, Number(m[2])) } : { name: item, count: 1 };
  });
}

// 按名字从阵营池取指定张数的不同副本（同名卡在池里是多个独立 id）
function resolveMixCards(faction, mix) {
  const pool = factionPool(faction);
  const picked = [];
  mix.forEach(entry => {
    const copies = pool.filter(card => card.name === entry.name
      && (card.category === "stratagem" || card.category === "situation"));
    if (!copies.length) throw new Error(`阵营 ${faction} 没有特殊卡「${entry.name}」`);
    if (copies.length < entry.count) throw new Error(`阵营 ${faction} 的「${entry.name}」只有 ${copies.length} 张，无法取 ${entry.count} 张`);
    for (let i = 0; i < entry.count; i++) picked.push(copies[i]);
  });
  return picked;
}

// 线上牌组拆成「单位部分」与「特殊卡部分」；单位部分两方共用，保证唯一变量是特殊卡
function baseDeckParts(faction, deckProfile) {
  const picked = selectAutoDeckCards({ faction, difficulty: "hard", deckProfile: deckProfile || undefined });
  const isSpecial = card => card.category === "stratagem" || card.category === "situation";
  return { units: picked.filter(card => !isSpecial(card)), specials: picked.filter(isSpecial) };
}

function draw(player, count) {
  for (let i = 0; i < count; i++) {
    const card = player.deck.shift();
    if (!card) break;
    card.owner = player.index;
    card.controller = player.index;
    card.zone = "hand";
    card.boardRow = null;
    player.hand.push(card);
  }
}

function resetDeck(player, index, units, specials) {
  player.difficulty = "hard";
  player.deckMode = "random";
  player.deck = shuffle(units.concat(specials)).map(card => cloneCard(card, index));
  player.battleCardIds = player.deck.map(card => card.id);
  player.hand = [];
  player.board = { "疆场": [], "朝堂": [], "文脉": [] };
  player.discard = [];
  player.passed = false;
  player.autoPassed = false;
  player.roundsWon = 0;
  player.retained = [];
  player.leaderUsed = false;
  player.leaderDisabled = false;
  draw(player, 10);
}

// 候选方特殊卡多带N 张时，用 --dropUnits=N 砍掉最低分单位，把牌组总张数拉回与线上一致，
// 以区分收益来自「多带这张特殊卡」还是单纯「牌组多一张」。请辞的济世回收伙伴不允许被砍。
function dropWeakestUnits(units, count, pool) {
  if (!count) return units;
  const droppable = units
    .filter(card => !(cards.hasAbility && cards.hasAbility(card, "济世")))
    .slice()
    .sort((a, b) => deckBuildFixedValue(a, pool) - deckBuildFixedValue(b, pool))
    .slice(0, count);
  const dropIds = {};
  droppable.forEach(card => { dropIds[card.id] = true; });
  return units.filter(card => !dropIds[card.id]);
}

function createInitialState(scope, mix, candidateIndex, dropUnits, deckProfile) {
  const pool = FACTION_SCOPES[scope];
  const faction = pool[Math.floor(Math.random() * pool.length)];
  const parts = baseDeckParts(faction);
  // --profile 模式：候选方整副牌组走「注入组牌参数后的真实 selectAutoDeckCards」，
  // 而不是手工指定构成，用于验证最终落地路径（单位挑选不受特殊卡参数影响，两边单位部分一致）
  const candidateParts = deckProfile ? baseDeckParts(faction, deckProfile) : null;
  const candidateSpecials = candidateParts ? candidateParts.specials : (mix.length ? resolveMixCards(faction, mix) : parts.specials);
  const baseUnits = candidateParts ? candidateParts.units : (dropUnits ? dropWeakestUnits(parts.units, dropUnits, factionPool(faction)) : parts.units);
  const candidateUnits = baseUnits;
  const state = battle.createMatch({ mode: "online", humanFaction: faction, aiFaction: faction, difficulty: "hard" });
  state.mode = "ai";
  state.autoControlAll = true;
  state.suppressRecording = true;
  state.logs = [];
  state.pending = null;
  state.players[0].name = "系统一";
  state.players[1].name = "系统二";
  state.players.forEach((player, index) => {
    const isCandidate = index === candidateIndex;
    resetDeck(player, index, isCandidate ? candidateUnits : parts.units, isCandidate ? candidateSpecials : parts.specials);
  });
  state.mulligan = { active: true, current: 0, used: [0, 0], done: [false, false], max: 2, simultaneous: true };
  battle.recalcScores(state);
  return { state, faction };
}

function runSingleMatch(index, options) {
  const pairSeed = options.seed + Math.floor(index / 2) * 9973;
  const candidateIndex = index % 2 === 0 ? 0 : 1;
  const mix = parseMix(options.mix);
  const { state, faction } = withSeed(pairSeed, () => createInitialState(options.scope, mix, candidateIndex, options.dropUnits, options.deckProfile));
  state.players.forEach((_, pi) => withSeed(pairSeed + 500003 + pi * 104729, () => {
    battle.aiMulliganFor(state, pi);
    if (!state.mulligan.done[pi]) battle.finishMulligan(state, pi);
  }));
  while (state.pending && resolveAutoPending(state)) {}
  const result = runPreparedMatch(pairSeed + 1000003, options.maxSteps, state, [{}, {}]);
  return {
    faction,
    winner: result.winner == null ? "draw" : result.winner === candidateIndex ? "candidate" : "baseline"
  };
}

function exactBinomialTwoSided(wins, losses) {
  const n = wins + losses;
  if (!n) return 1;
  const tail = Math.min(wins, losses);
  let logP = -n * Math.LN2;
  let sum = Math.exp(logP);
  for (let k = 1; k <= tail; k++) {
    logP += Math.log((n - k + 1) / k);
    sum += Math.exp(logP);
  }
  return Math.min(1, sum * 2);
}

function binomialZ(wins, losses) {
  const n = wins + losses;
  if (!n) return 0;
  return (wins - n / 2) / Math.sqrt(n * 0.25);
}

function printList() {
  cards.FACTION_KEYS.forEach(faction => {
    const pool = factionPool(faction);
    const specials = pool.filter(card => card.category === "stratagem" || card.category === "situation");
    const online = baseDeckParts(faction).specials.map(card => card.name).join(" + ");
    console.log(`=== ${faction}（线上：${online}）`);
    groupCards(specials)
      .map(group => ({ name: group.card.name, cat: categoryLabel(group.card), score: deckBuildFixedValue(group.card, pool), copies: group.cards.length }))
      .sort((a, b) => b.score - a.score)
      .forEach(item => console.log(`  ${item.name}[${item.cat}] 组牌分=${item.score.toFixed(2)} 池内${item.copies}张`));
  });
}

function runParent(options) {
  const scriptPath = path.join(__dirname, "bench-special-mix.js");
  const childConfig = Buffer.from(JSON.stringify({ seed: options.seed, maxSteps: options.maxSteps, scope: options.scope, mix: options.mix, dropUnits: options.dropUnits, deckProfile: options.deckProfile })).toString("base64");
  const summary = {
    matches: options.matches, seed: options.seed, scope: options.scope,
    variant: (options.deckProfile ? `组牌参数 ${JSON.stringify(options.deckProfile)}` : options.mix || "线上构成（自比对照）") + (options.dropUnits ? ` -${options.dropUnits}单位` : ""),
    candidateWins: 0, baselineWins: 0, draws: 0, byFaction: {}
  };
  const active = new Set();
  let next = 0, finished = 0, failed = false;
  return new Promise((resolve, reject) => {
    function stop(error) {
      if (failed) return;
      failed = true;
      active.forEach(child => child.kill("SIGTERM"));
      reject(error);
    }
    function launch() {
      if (failed || next >= options.matches) return;
      const index = next++;
      const child = spawn(process.execPath, [scriptPath, `--child=${index}`, `--config=${childConfig}`], { stdio: ["ignore", "pipe", "pipe"] });
      active.add(child);
      let stdout = "", stderr = "";
      child.stdout.on("data", d => { stdout += d; });
      child.stderr.on("data", d => { stderr += d; });
      child.on("error", stop);
      child.on("close", code => {
        active.delete(child);
        if (failed) return;
        if (code !== 0) return stop(new Error(`第 ${index + 1} 场失败：${stderr.trim() || `退出码 ${code}`}`));
        let r;
        try { r = JSON.parse(stdout.trim()); } catch (e) { return stop(new Error(`第 ${index + 1} 场输出无效：${stdout.trim()} ${stderr.trim()}`)); }
        const bucket = summary.byFaction[r.faction] || (summary.byFaction[r.faction] = { candidate: 0, baseline: 0, draw: 0 });
        bucket[r.winner === "candidate" ? "candidate" : r.winner === "baseline" ? "baseline" : "draw"] += 1;
        if (r.winner === "candidate") summary.candidateWins += 1;
        else if (r.winner === "baseline") summary.baselineWins += 1;
        else summary.draws += 1;
        finished += 1;
        if (!options.json) process.stdout.write(`\r进度 ${finished}/${options.matches} 新:${summary.candidateWins} 旧:${summary.baselineWins} 平:${summary.draws}`);
        if (finished === options.matches) {
          const decisive = summary.candidateWins + summary.baselineWins;
          summary.candidateDecisiveWinRate = decisive ? summary.candidateWins / decisive : 0;
          summary.pValue = exactBinomialTwoSided(summary.candidateWins, summary.baselineWins);
          summary.z = binomialZ(summary.candidateWins, summary.baselineWins);
          return resolve(summary);
        }
        launch();
      });
    }
    for (let i = 0; i < Math.min(options.concurrency, options.matches); i++) launch();
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.list) return printList();
  if (options.child != null) {
    process.stdout.write(JSON.stringify(runSingleMatch(options.child, options)));
    return;
  }
  try {
    const s = await runParent(options);
    if (!options.json) process.stdout.write("\n");
    if (options.json) return console.log(JSON.stringify(s, null, 2));
    console.log(`特殊卡构成对比：候选[${s.variant}] vs 线上，阵营范围 ${s.scope}，${s.matches} 场，种子 ${s.seed}`);
    console.log(`新胜 ${s.candidateWins}，旧胜 ${s.baselineWins}，平 ${s.draws}`);
    console.log(`剔除平局胜率 ${(s.candidateDecisiveWinRate * 100).toFixed(2)}%  z=${s.z.toFixed(2)}  p=${s.pValue.toFixed(4)}`);
    Object.keys(s.byFaction).forEach(faction => {
      const b = s.byFaction[faction];
      const d = b.candidate + b.baseline;
      console.log(`  ${faction}：新 ${b.candidate} / 旧 ${b.baseline} / 平 ${b.draw}  胜率 ${d ? (b.candidate / d * 100).toFixed(2) : "0.00"}%`);
    });
  } catch (error) {
    console.error(`对比中止：${error.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = { runSingleMatch, exactBinomialTwoSided, binomialZ };
