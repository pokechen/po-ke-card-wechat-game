#!/usr/bin/env node
// 组牌数量(难度档位)胜率验证台。
// 目标：验证「困难难度减少组牌数量(人物/特殊牌) → 起手强牌密度更高 → 胜率上升」的假设。
// 方法（满足项目对战策略验证规则：随机卡牌 + 困难难度，交替先后手，固定种子可复现）：
//   新 profile(减少数量) vs 旧 profile(hard 基线) head-to-head，统计新 profile 胜率（>50% 即更优）。
//   双方统一使用当前正式出牌逻辑，确保差异仅来自组牌数量。
const battle = require("../shared/core/battle");
const { FACTION_KEYS, buildDeck } = require("../shared/core/cards");
const { resolveAutoPending, withSeed, runPreparedMatch } = require("./simulate-ai-matches");

// 旧 hard 基线配置（线上默认），新 profile 在其基础上仅覆盖 unitTarget/strategyTarget
const HARD_BASE = { unitTarget: 28, strategyTarget: 8, topRatio: 0.25, randomPick: false, maxHeroes: 99, maxEnvoyCards: 99 };
// 简单模式基线：随机选牌(topRatio 0.95)、英雄≤2、间谍≤1（与 shared/core/cards.js 的 easy 配置一致）
const EASY_BASE = { unitTarget: 22, strategyTarget: 3, topRatio: 0.95, randomPick: true, maxHeroes: 2, maxEnvoyCards: 1 };

function parseArgs(argv) {
  const args = {
    matches: 100, seed: 20260721, maxSteps: 1200,
    newUnit: 22, newStrategy: 4,
    oldUnit: 28, oldStrategy: 8,
    newRandomPick: null, oldRandomPick: null,
    mode: "hard",
    child: null, concurrency: 4,
    json: false
  };
  argv.forEach(arg => {
    if (arg === "--json") args.json = true;
    else if (arg.startsWith("--matches=")) args.matches = Math.max(1, Number(arg.slice(10)) || args.matches);
    else if (arg.startsWith("--seed=")) args.seed = Number(arg.slice(7)) || args.seed;
    else if (arg.startsWith("--maxSteps=")) args.maxSteps = Math.max(100, Number(arg.slice(11)) || args.maxSteps);
    else if (arg.startsWith("--newUnit=")) args.newUnit = Number(arg.slice(10)) || args.newUnit;
    else if (arg.startsWith("--newStrategy=")) args.newStrategy = Number(arg.slice(13)) || args.newStrategy;
    else if (arg.startsWith("--oldUnit=")) args.oldUnit = Number(arg.slice(10)) || args.oldUnit;
    else if (arg.startsWith("--oldStrategy=")) args.oldStrategy = Number(arg.slice(13)) || args.oldStrategy;
    else if (arg.startsWith("--newRandomPick=")) args.newRandomPick = arg.slice(16) === "true";
    else if (arg.startsWith("--oldRandomPick=")) args.oldRandomPick = arg.slice(16) === "true";
    else if (arg.startsWith("--start=")) args.start = Math.max(0, Number(arg.slice(8)) || 0);
    else if (arg.startsWith("--end=")) args.end = Number(arg.slice(6));
    else if (arg.startsWith("--mode=")) args.mode = arg.slice(7) || args.mode;
    else if (arg.startsWith("--child=")) args.child = Number(arg.slice(8));
    else if (arg.startsWith("--config=")) {
      try { Object.assign(args, JSON.parse(Buffer.from(arg.slice(9), "base64").toString())); } catch (e) {}
    }
    else if (arg.startsWith("--concurrency=")) args.concurrency = Math.max(1, Number(arg.slice(13)) || args.concurrency);
  });
  return args;
}

function randomFaction() {
  return FACTION_KEYS[Math.floor(Math.random() * FACTION_KEYS.length)];
}

function draw(player, count) {
  for (let i = 0; i < count; i++) {
    const card = player.deck.shift();
    if (card) {
      card.owner = player.index;
      card.controller = player.index;
      card.zone = "hand";
      card.boardRow = null;
      player.hand.push(card);
    }
  }
}

function resetProfiledDeck(player, index, profile, mode) {
  const aiDifficulty = mode === "easy" ? "easy" : "hard";
  player.difficulty = aiDifficulty;
  player.deckMode = "random";
  player.deck = buildDeck(index, { faction: player.faction, difficulty: aiDifficulty, deckProfile: profile });
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

function createProfiledMatch(profileA, profileB, mode) {
  const state = battle.createMatch({
    mode: "ai",
    humanFaction: randomFaction(),
    aiFaction: randomFaction(),
    difficulty: mode === "easy" ? "easy" : "hard"
  });
  state.autoControlAll = true;
  state.suppressRecording = true;
  state.logs = [];
  state.players[0].name = "新策略";
  state.players[1].name = "旧基线";
  state.players.forEach((p, i) => resetProfiledDeck(p, i, i === 0 ? profileA : profileB, mode));
  battle.recalcScores(state);
  battle.finishMulligan(state, 0);
  while (state.pending && resolveAutoPending(state)) {}
  return state;
}

// 单场对比：返回 { winner: 'new'|'old'|'draw', newDeck, oldDeck }
function runSingleMatch(i, options) {
  const base = options.mode === "easy" ? EASY_BASE : HARD_BASE;
  const oldProfile = { ...base, unitTarget: options.oldUnit, strategyTarget: options.oldStrategy };
  const newProfile = { ...base, unitTarget: options.newUnit, strategyTarget: options.newStrategy };
  if (options.oldRandomPick != null) oldProfile.randomPick = options.oldRandomPick;
  if (options.newRandomPick != null) newProfile.randomPick = options.newRandomPick;
  const pairSeed = options.seed + Math.floor(i / 2) * 9973;
  const newAsP0 = i % 2 === 0;
  const profileA = newAsP0 ? newProfile : oldProfile;
  const profileB = newAsP0 ? oldProfile : newProfile;
  const initialState = withSeed(pairSeed, () => createProfiledMatch(profileA, profileB, options.mode));
  const newDeck = initialState.players[newAsP0 ? 0 : 1].battleCardIds.length;
  const oldDeck = initialState.players[newAsP0 ? 1 : 0].battleCardIds.length;
  const result = runPreparedMatch(pairSeed + 1000003, options.maxSteps, initialState);
  const winnerProfile = result.winner == null ? null : (result.winner === 0 ? profileA : profileB);
  let winner = "draw";
  if (winnerProfile === newProfile) winner = "new";
  else if (winnerProfile === oldProfile) winner = "old";
  return { winner, newDeck, oldDeck };
}

// 子进程模式：只跑第 i 场，输出 JSON 后退出（避免单局内存爆炸拖垮全局）
function runAsChild(i, options) {
  const r = runSingleMatch(i, options);
  process.stdout.write(JSON.stringify(r));
  process.exit(0);
}

// 父进程模式：用并发子进程逐场跑，单局 OOM/超时只记平局，内存随子进程退出回收
const { spawn } = require("child_process");
const path = require("path");

function runDeckComparisonParent(options) {
  const M = options.matches;
  const childConfig = {
    seed: options.seed, maxSteps: options.maxSteps, mode: options.mode,
    newUnit: options.newUnit, newStrategy: options.newStrategy,
    oldUnit: options.oldUnit, oldStrategy: options.oldStrategy,
    newRandomPick: options.newRandomPick, oldRandomPick: options.oldRandomPick
  };
  const configArg = "--config=" + Buffer.from(JSON.stringify(childConfig)).toString("base64");
  const scriptPath = path.join(__dirname, "bench-deck-size.js");
  const concurrency = Math.min(options.concurrency || 4, M);
  let next = 0, finished = 0;
  let newWins = 0, oldWins = 0, draws = 0, errors = 0;
  let newDeckSizes = 0, oldDeckSizes = 0;
  return new Promise((resolve) => {
    function launchOne() {
      if (next >= M) return;
      const i = next++;
      const child = spawn(process.execPath, ["--max-old-space-size=2048", scriptPath, "--child=" + i, configArg], { stdio: ["ignore", "pipe", "pipe"] });
      let out = "", err = "";
      child.stdout.on("data", d => out += d);
      child.stderr.on("data", d => err += d);
      child.on("close", (code) => {
        finished++;
        try {
          const r = JSON.parse(out.trim());
          if (r.winner === "new") newWins++;
          else if (r.winner === "old") oldWins++;
          else draws++;
          newDeckSizes += r.newDeck || 0;
          oldDeckSizes += r.oldDeck || 0;
        } catch (e) {
          errors++;
          draws++;
        }
        process.stdout.write(`\r  进度 ${finished}/${M}  新胜:${newWins} 旧胜:${oldWins} 平/崩:${draws}`);
        if (next < M) launchOne();
        if (finished === M) {
          const count = M;
          const decisive = Math.max(1, newWins + oldWins);
          resolve({
            matches: M, count, seed: options.seed,
            oldProfile: { unitTarget: options.oldUnit, strategyTarget: options.oldStrategy, randomPick: options.oldRandomPick },
            newProfile: { unitTarget: options.newUnit, strategyTarget: options.newStrategy, randomPick: options.newRandomPick },
            oldWins, newWins, draws,
            newWinRate: newWins / count,
            newDecisiveWinRate: newWins / decisive,
            avgNewDeckSize: newDeckSizes / count,
            avgOldDeckSize: oldDeckSizes / count,
            errors
          });
        }
      });
    }
    for (let k = 0; k < concurrency; k++) launchOne();
  });
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.child != null) { runAsChild(options.child, options); return; }
  return runDeckComparisonParent(options).then(summary => {
    if (options.json) { console.log(JSON.stringify(summary, null, 2)); return; }
    console.log(`\n验证：${summary.count} 场（共 ${summary.matches}），随机卡牌 + ${options.mode} 难度，种子 ${summary.seed}`);
    console.log(`新策略(人物${summary.newProfile.unitTarget}/特殊${summary.newProfile.strategyTarget}, randomPick=${summary.newProfile.randomPick}) 胜：${summary.newWins}`);
    console.log(`旧基线(人物${summary.oldProfile.unitTarget}/特殊${summary.oldProfile.strategyTarget}, randomPick=${summary.oldProfile.randomPick}) 胜：${summary.oldWins}`);
    console.log(`平局：${summary.draws}${summary.errors ? `（其中 ${summary.errors} 场子进程崩溃，按平局计）` : ""}`);
    console.log(`新策略胜率：${(summary.newWinRate * 100).toFixed(2)}%，非平局胜率：${(summary.newDecisiveWinRate * 100).toFixed(2)}%`);
    console.log(`平均牌组大小：新 ${summary.avgNewDeckSize.toFixed(1)} / 旧 ${summary.avgOldDeckSize.toFixed(1)}`);
    console.log(summary.newWinRate > 0.5
      ? "结论：新策略胜率更高，可切换为正式策略。"
      : "结论：新策略未提升胜率，需分析原因或回滚。");
  });
}

if (require.main === module) main();
module.exports = { runSingleMatch, HARD_BASE };
