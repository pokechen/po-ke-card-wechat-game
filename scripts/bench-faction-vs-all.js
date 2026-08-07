#!/usr/bin/env node

// 特定阵营改动的「vs 全体」胜率口径（见 RULE.mdc「特定阵营/主将优化的胜率对比口径」）。
//
// 做法：枚举「目标阵营的候选主将」×「全部 5 个阵营的候选主将」，每个配对跑相同场次、交替座位。
// 对手池= 其他 4 族的 hard 白名单主将 + 本族「优化前」的主将池（--selfBaselineLeaders），
// 本族对手一律使用优化前的主将与优化前的牌组构成（--selfBaselineMix），不能用优化后版本当对手。
// 目标阵营一方可用 --mix 替换特殊卡构成、--leaders 指定主将池（单位牌仍取线上自动组牌）。
// 两次运行只要种子相同，对手牌序与配对完全一致，唯一变量就是候选方，可直接比较总胜率。
// 「候选 vs 本族优化前」子集会单独输出，作为是否提升的参考条件。
//
// 用法：
//   # 优化前基线（候选方与本族对手都用优化前配置）
//   node scripts/bench-faction-vs-all.js --faction=草莽星火 --leaders=zhangyu-0338,zhangyu-0339,zhangyu-0016 \
//     --selfBaselineLeaders=zhangyu-0338,zhangyu-0339,zhangyu-0016 --matches=40
//   # 优化后（候选方用当前白名单，本族对手仍为优化前）
//   node scripts/bench-faction-vs-all.js --faction=草莽星火 \
//     --selfBaselineLeaders=zhangyu-0338,zhangyu-0339,zhangyu-0016 --matches=40

const { spawn } = require("child_process");
const path = require("path");
const battle = require("../shared/core/battle");
const cards = require("../shared/core/cards");
const { allCards, cloneCard, shuffle, selectAutoDeckCards, buildDeck, hardLeaderPool, leadersFor, FACTION_KEYS } = cards;
const { resolveAutoPending, runPreparedMatch, withSeed } = require("./simulate-ai-matches");

function parseArgs(argv) {
  const args = {
    faction: "草莽星火", mix: "", leaders: "", selfBaselineLeaders: "", selfBaselineMix: "",
    matches: 40, seed: 20260806, maxSteps: 1200, concurrency: 8, pair: null, json: false
  };
  argv.forEach(arg => {
    if (arg === "--json") args.json = true;
    else if (arg.startsWith("--faction=")) args.faction = arg.slice(10);
    else if (arg.startsWith("--mix=")) args.mix = arg.slice(6);
    else if (arg.startsWith("--leaders=")) args.leaders = arg.slice(10);
    else if (arg.startsWith("--selfBaselineLeaders=")) args.selfBaselineLeaders = arg.slice(22);
    else if (arg.startsWith("--selfBaselineMix=")) args.selfBaselineMix = arg.slice(18);
    else if (arg.startsWith("--matches=")) args.matches = Math.max(2, Number(arg.slice(10)) || args.matches);
    else if (arg.startsWith("--seed=")) args.seed = Number(arg.slice(7)) || args.seed;
    else if (arg.startsWith("--maxSteps=")) args.maxSteps = Math.max(100, Number(arg.slice(11)) || args.maxSteps);
    else if (arg.startsWith("--concurrency=")) args.concurrency = Math.max(1, Number(arg.slice(14)) || args.concurrency);
    else if (arg.startsWith("--pair=")) args.pair = arg.slice(7).split(",");
    else if (arg.startsWith("--config=")) {
      try { Object.assign(args, JSON.parse(Buffer.from(arg.slice(9), "base64").toString())); } catch (error) {}
    }
  });
  if (!FACTION_KEYS.includes(args.faction)) throw new Error(`未知阵营 ${args.faction}`);
  return args;
}

function leadersByIds(faction, idText) {
  const ids = String(idText).split(",").map(item => item.trim()).filter(Boolean);
  if (!ids.length) return hardLeaderPool(faction);
  const all = leadersFor(faction);
  const picked = ids.map(id => all.find(card => card.id === id)).filter(Boolean);
  if (picked.length !== ids.length) throw new Error(`阵营 ${faction} 中存在无效主将 id：${idText}`);
  return picked;
}

// 候选方主将 × 全部 5 族对手主将（本族对手取优化前主将池，并标记 selfBaseline）
function buildPairs(options) {
  const faction = options.faction;
  const mine = leadersByIds(faction, options.leaders)
    .map(leader => ({ faction, id: leader.id, name: leader.name }));
  const theirs = [];
  FACTION_KEYS.forEach(f => {
    if (f === faction) {
      leadersByIds(faction, options.selfBaselineLeaders).forEach(leader => {
        theirs.push({ faction: f, id: leader.id, name: leader.name, selfBaseline: true });
      });
    } else {
      hardLeaderPool(f).forEach(leader => theirs.push({ faction: f, id: leader.id, name: leader.name }));
    }
  });
  const pairs = [];
  mine.forEach(a => theirs.forEach(b => pairs.push([a, b])));
  return { mine, theirs, pairs };
}

function parseMix(text) {
  return String(text).split(",").map(item => item.trim()).filter(Boolean).map(item => {
    const m = item.match(/^(.+?)[xX*](\d+)$/);
    return m ? { name: m[1].trim(), count: Math.max(1, Number(m[2])) } : { name: item, count: 1 };
  });
}

function factionPool(faction) {
  return allCards().filter(card => card.category !== "leader" && (card.faction === faction || card.faction === "天下共识"));
}

function resolveMixCards(faction, mix) {
  const pool = factionPool(faction);
  const picked = [];
  mix.forEach(entry => {
    const copies = pool.filter(card => card.name === entry.name && (card.category === "stratagem" || card.category === "situation"));
    if (!copies.length) throw new Error(`阵营 ${faction} 没有特殊卡「${entry.name}」`);
    if (copies.length < entry.count) throw new Error(`阵营 ${faction} 的「${entry.name}」只有 ${copies.length} 张`);
    for (let i = 0; i < entry.count; i++) picked.push(copies[i]);
  });
  return picked;
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

function resetPlayer(player, index, deckCards) {
  player.difficulty = "hard";
  player.deckMode = "random";
  player.deck = deckCards;
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

// 目标阵营牌组：单位部分取线上自动组牌，特殊卡按 mix 替换（mix 为空则用线上特殊卡）
function myDeck(faction, mix, owner) {
  const picked = selectAutoDeckCards({ faction, difficulty: "hard" });
  const isSpecial = card => card.category === "stratagem" || card.category === "situation";
  const units = picked.filter(card => !isSpecial(card));
  const specials = mix.length ? resolveMixCards(faction, mix) : picked.filter(isSpecial);
  return shuffle(units.concat(specials)).map(card => cloneCard(card, owner));
}

function runPairMatches(a, b, pairIndex, options) {
  const mix = parseMix(options.mix);
  const baselineMix = parseMix(options.selfBaselineMix);
  const result = { aWins: 0, bWins: 0, draws: 0 };
  for (let k = 0; k < options.matches; k++) {
    const seed = options.seed + pairIndex * 100003 + Math.floor(k / 2) * 9973;
    const aAtSeat0 = k % 2 === 0;
    const seat0 = aAtSeat0 ? a : b;
    const seat1 = aAtSeat0 ? b : a;
    const state = withSeed(seed, () => {
      const s = battle.createMatch({
        mode: "online",
        humanFaction: seat0.faction,
        aiFaction: seat1.faction,
        difficulty: "hard",
        humanLeaderIds: { [seat0.faction]: seat0.id },
        aiLeaderIds: { [seat1.faction]: seat1.id }
      });
      s.mode = "ai";
      s.autoControlAll = true;
      s.suppressRecording = true;
      s.logs = [];
      s.pending = null;
      s.players[0].name = "系统一";
      s.players[1].name = "系统二";
      const aIndex = aAtSeat0 ? 0 : 1;
      s.players.forEach((player, index) => {
        // 候选方用 --mix；本族对手用优化前构成 --selfBaselineMix；其他阵营用线上自动组牌
        const deckCards = index === aIndex
          ? myDeck(a.faction, mix, index)
          : (b.selfBaseline ? myDeck(b.faction, baselineMix, index) : buildDeck(index, { faction: player.faction, difficulty: "hard" }));
        resetPlayer(player, index, deckCards);
      });
      s.mulligan = { active: true, current: 0, used: [0, 0], done: [false, false], max: 2, simultaneous: true };
      battle.recalcScores(s);
      return s;
    });
    state.players.forEach((_, pi) => withSeed(seed + 500003 + pi * 104729, () => {
      battle.aiMulliganFor(state, pi);
      if (!state.mulligan.done[pi]) battle.finishMulligan(state, pi);
    }));
    while (state.pending && resolveAutoPending(state)) {}
    const match = runPreparedMatch(seed + 1000003, options.maxSteps, state, [{}, {}]);
    if (match.winner == null) result.draws += 1;
    else {
      const aIndex = aAtSeat0 ? 0 : 1;
      if (match.winner === aIndex) result.aWins += 1;
      else result.bWins += 1;
    }
  }
  return result;
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

function runParent(options) {
  const { mine, theirs, pairs } = buildPairs(options);
  const scriptPath = path.join(__dirname, "bench-faction-vs-all.js");
  const childConfig = Buffer.from(JSON.stringify({
    faction: options.faction, mix: options.mix, leaders: options.leaders,
    selfBaselineLeaders: options.selfBaselineLeaders, selfBaselineMix: options.selfBaselineMix,
    matches: options.matches, seed: options.seed, maxSteps: options.maxSteps
  })).toString("base64");
  const stats = { wins: 0, losses: 0, draws: 0, byOpp: {}, byMine: {}, self: { wins: 0, losses: 0, draws: 0 }, cross: { wins: 0, losses: 0, draws: 0 }, sameLeader: { wins: 0, losses: 0, draws: 0 } };
  const active = new Set();
  let next = 0, finished = 0, failed = false;
  const started = Date.now();
  return new Promise((resolve, reject) => {
    function stop(error) {
      if (failed) return;
      failed = true;
      active.forEach(child => child.kill("SIGTERM"));
      reject(error);
    }
    function launch() {
      if (failed || next >= pairs.length) return;
      const pairIndex = next++;
      const [a, b] = pairs[pairIndex];
      const child = spawn(process.execPath, [scriptPath, `--pair=${pairIndex}`, `--config=${childConfig}`], { stdio: ["ignore", "pipe", "pipe"] });
      active.add(child);
      let stdout = "", stderr = "";
      child.stdout.on("data", d => { stdout += d; });
      child.stderr.on("data", d => { stderr += d; });
      child.on("error", stop);
      child.on("close", code => {
        active.delete(child);
        if (failed) return;
        if (code !== 0) return stop(new Error(`${a.name} vs ${b.name} 失败：${stderr.trim() || `退出码 ${code}`}`));
        let r;
        try { r = JSON.parse(stdout.trim()); } catch (e) { return stop(new Error(`${a.name} vs ${b.name} 输出无效：${stdout.trim()} ${stderr.trim()}`)); }
        stats.wins += r.aWins; stats.losses += r.bWins; stats.draws += r.draws;
        const ob = stats.byOpp[b.faction] || (stats.byOpp[b.faction] = { wins: 0, losses: 0, draws: 0 });
        ob.wins += r.aWins; ob.losses += r.bWins; ob.draws += r.draws;
        const mb = stats.byMine[a.name] || (stats.byMine[a.name] = { wins: 0, losses: 0, draws: 0 });
        mb.wins += r.aWins; mb.losses += r.bWins; mb.draws += r.draws;
        // 本族（优化前）子集 / 跨族子集 / 同一主将互打子集
        const bucket = b.selfBaseline ? stats.self : stats.cross;
        bucket.wins += r.aWins; bucket.losses += r.bWins; bucket.draws += r.draws;
        if (b.selfBaseline && b.id === a.id) {
          stats.sameLeader.wins += r.aWins; stats.sameLeader.losses += r.bWins; stats.sameLeader.draws += r.draws;
        }
        finished += 1;
        if (!options.json) {
          const eta = Math.round((pairs.length - finished) * ((Date.now() - started) / finished) / 1000);
          process.stdout.write(`\r进度 ${finished}/${pairs.length} 对  剩余约 ${eta}s   `);
        }
        if (finished === pairs.length) return resolve({ stats, mine, theirs, pairs });
        launch();
      });
    }
    for (let i = 0; i < Math.min(options.concurrency, pairs.length); i++) launch();
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.pair != null) {
    const { pairs } = buildPairs(options);
    const pairIndex = Number(options.pair[0]);
    const [a, b] = pairs[pairIndex];
    process.stdout.write(JSON.stringify(runPairMatches(a, b, pairIndex, options)));
    return;
  }
  try {
    const { stats, mine, theirs, pairs } = await runParent(options);
    if (!options.json) process.stdout.write("\n");
    const decisive = stats.wins + stats.losses;
    const rate = decisive ? stats.wins / decisive : 0;
    if (options.json) return console.log(JSON.stringify({ ...stats, winRate: rate }, null, 2));
    const pct = b => {
      const d = b.wins + b.losses;
      return d ? (b.wins / d * 100).toFixed(2) : "0.00";
    };
    const specials = options.mix
      ? options.mix
      : selectAutoDeckCards({ faction: options.faction, difficulty: "hard" })
        .filter(card => card.category === "stratagem" || card.category === "situation")
        .map(card => card.name).join(" + ") + "（线上）";
    console.log(`${options.faction} vs 全体（含本族优化前）：特殊卡构成 = ${specials}`);
    console.log(`本方主将 ${mine.map(m => m.name).join("/")}（${mine.length} 个） × 对手主将 ${theirs.length} 个（含本族优化前 ${theirs.filter(t => t.selfBaseline).length} 个）= ${pairs.length} 对，每对 ${options.matches} 场，共 ${pairs.length * options.matches} 场，种子 ${options.seed}`);
    console.log(`胜 ${stats.wins}，负 ${stats.losses}，平 ${stats.draws}`);
    console.log(`剔除平局总胜率 ${(rate * 100).toFixed(2)}%  p=${exactBinomialTwoSided(stats.wins, stats.losses).toFixed(4)}`);
    console.log(`  其中 vs 本族优化前（参考条件）：${stats.self.wins} / ${stats.self.losses} / 平${stats.self.draws}  ${pct(stats.self)}%`);
    console.log(`       └ 同一主将互打（天然50%，稀释项）：${stats.sameLeader.wins} / ${stats.sameLeader.losses} / 平${stats.sameLeader.draws}  ${pct(stats.sameLeader)}%`);
    console.log(`  其中 vs 其他 4 族：${stats.cross.wins} / ${stats.cross.losses} / 平${stats.cross.draws}  ${pct(stats.cross)}%`);
    console.log("按对手阵营：");
    Object.keys(stats.byOpp).forEach(f => {
      const b = stats.byOpp[f];
      console.log(`  vs ${f}${f === options.faction ? "(优化前)" : ""}：${b.wins} / ${b.losses} / 平${b.draws}  ${pct(b)}%`);
    });
    console.log("按本方主将：");
    Object.keys(stats.byMine).forEach(name => {
      const b = stats.byMine[name];
      console.log(`  ${name}：${b.wins} / ${b.losses} / 平${b.draws}  ${pct(b)}%`);
    });
  } catch (error) {
    console.error(`\n对比中止：${error.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = { runPairMatches, buildPairs, exactBinomialTwoSided };
