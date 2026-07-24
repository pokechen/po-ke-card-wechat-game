#!/usr/bin/env node
// 定位困难模式 randomPick=true 导致对战状态爆炸(单局 OOM)的特殊牌组合。
// 每局独立子进程：子进程先打印双方特殊牌，再跑对局；崩溃只杀子进程，父进程汇总崩溃局的特殊牌。
const battle = require("../shared/core/battle");
const { FACTION_KEYS, buildDeck } = require("../shared/core/cards");
const { resolveAutoPending, withSeed } = require("./simulate-ai-matches");
const { spawn } = require("child_process");
const path = require("path");
const HARD = battle.HARD || {};

const NEW_BASE = { unitTarget: 22, specialTarget: 4, topRatio: 0.25, randomPick: true, maxHeroes: 99, maxSpyCards: 99 };
const OLD_BASE = { unitTarget: 22, specialTarget: 4, topRatio: 0.25, randomPick: false, maxHeroes: 99, maxSpyCards: 99 };
const SEED = 20260721;

function randomFaction() { return FACTION_KEYS[Math.floor(Math.random() * FACTION_KEYS.length)]; }
function draw(player, count) { for (let i = 0; i < count; i++) { const c = player.deck.shift(); if (c) { c.owner = player.index; c.controller = player.index; c.zone = "hand"; c.boardRow = null; player.hand.push(c); } } }
function resetProfiledDeck(player, index, profile) {
  player.difficulty = "hard"; player.deckMode = "random";
  player.deck = buildDeck(index, { faction: player.faction, difficulty: "hard", deckProfile: profile });
  player.battleCardIds = player.deck.map(card => card.id);
  player.hand = []; player.board = { melee: [], ranged: [], siege: [] };
  player.discard = []; player.passed = false; player.autoPassed = false; player.roundsWon = 0;
  player.retained = []; player.leaderUsed = false; player.halfWeatherRound = null;
  draw(player, 10);
}
function createProfiledMatch(profileA, profileB) {
  const state = battle.createMatch({ mode: "ai", humanFaction: randomFaction(), aiFaction: randomFaction(), difficulty: "hard" });
  state.autoControlAll = true; state.suppressRecording = true; state.logs = [];
  state.players.forEach((p, i) => resetProfiledDeck(p, i, i === 0 ? profileA : profileB));
  battle.recalcScores(state); battle.finishMulligan(state, 0);
  while (state.pending && resolveAutoPending(state)) {}
  return state;
}
function specialsOf(deck) { return deck.filter(card => card.category === "special" || card.category === "weather").map(card => card.baseName || card.name); }

function runChildMatch(i) {
  const pairSeed = SEED + Math.floor(i / 2) * 9973;
  const newAsP0 = i % 2 === 0;
  const profileA = newAsP0 ? NEW_BASE : OLD_BASE;
  const profileB = newAsP0 ? OLD_BASE : NEW_BASE;
  const initialState = withSeed(pairSeed, () => createProfiledMatch(profileA, profileB));
  const newSpecials = specialsOf(initialState.players[newAsP0 ? 0 : 1].deck);
  const oldSpecials = specialsOf(initialState.players[newAsP0 ? 1 : 0].deck);
  // 先打印特殊牌，再跑；崩溃只杀本子进程
  process.stdout.write("SPECIALS " + JSON.stringify({ i, newSpecials, oldSpecials }) + "\n");
  const state = initialState; let steps = 0;
  withSeed(pairSeed + 1000003, () => {
    while (!state.over && steps < 5000) {
      steps += 1;
      if (state.roundTransition) { battle.continueRoundTransition(state); continue; }
      if (state.pending) { if (!resolveAutoPending(state)) throw new Error("pending"); continue; }
      const ok = battle.autoStep(state, { playerIndex: state.current, cfg: { ...HARD, strategy: "optimized" } });
      if (!ok) throw new Error("autoStep fail");
    }
  });
  process.stdout.write("DONE " + i + "\n");
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--child")) {
    const i = Number(argv[argv.indexOf("--child") + 1]);
    return runChildMatch(i);
  }
  const MATCHES = Number((argv.find(a => a.startsWith("--matches=")) || "--matches=300").slice(10)) || 300;
  const CONC = Math.min(Number((argv.find(a => a.startsWith("--concurrency=")) || "--concurrency=8").slice(13)) || 8, MATCHES);
  const MEM = Number((argv.find(a => a.startsWith("--mem=")) || "--mem=700").slice(6)) || 700;
  const TIMEOUT = Number((argv.find(a => a.startsWith("--timeout=")) || "--timeout=20000").slice(10)) || 20000;
  const script = path.join(__dirname, "find-crash-cards.js");
  let next = 0, finished = 0, crashes = 0;
  const crashNew = {}, crashOld = {}, newFreq = {};
  return new Promise(resolve => {
    function launch() {
      if (next >= MATCHES) return;
      const i = next++;
      const child = spawn(process.execPath, ["--max-old-space-size=" + MEM, script, "--child", String(i)], { stdio: ["ignore", "pipe", "ignore"] });
      let buf = ""; let crashed = false;
      child.stdout.on("data", d => {
        buf += d.toString();
        const lines = buf.split("\n"); buf = lines.pop();
        lines.forEach(line => {
          if (line.startsWith("SPECIALS ")) { try { const o = JSON.parse(line.slice(9)); o.newSpecials.forEach(n => newFreq[n] = (newFreq[n] || 0) + 1); child._specials = o; } catch (e) {} }
          else if (line.startsWith("DONE ")) { child._done = true; }
        });
      });
      const timer = setTimeout(() => { crashed = true; child.kill("SIGKILL"); }, TIMEOUT);
      child.on("close", () => {
        clearTimeout(timer); finished++;
        if (crashed || !child._done) {
          crashes++;
          const o = child._specials;
          if (o) { o.newSpecials.forEach(n => crashNew[n] = (crashNew[n] || 0) + 1); o.oldSpecials.forEach(n => crashOld[n] = (crashOld[n] || 0) + 1); }
        }
        process.stdout.write(`\r  进度 ${finished}/${MATCHES} 崩溃 ${crashes}`);
        if (next < MATCHES) launch();
        else {
          console.log(`\n共 ${MATCHES} 局，崩溃 ${crashes} 局（${(crashes / MATCHES * 100).toFixed(1)}%）`);
          console.log("\n崩溃局「随机方特殊牌」出现次数（按出现频次排序）：");
          Object.entries(crashNew).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${k}: ${v} 次（随机方总出现 ${newFreq[k] || 0} 次, 命中率 ${(v / Math.max(1, newFreq[k]) * 100).toFixed(0)}%）`));
          console.log("\n崩溃局「确定性方(固定)特殊牌」出现次数（用于对照，理论每局都应出现）：");
          Object.entries(crashOld).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${k}: ${v} 次`));
          resolve();
        }
      });
    }
    for (let k = 0; k < CONC; k++) launch();
  });
}
if (require.main === module) main();
