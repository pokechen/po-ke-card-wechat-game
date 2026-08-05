#!/usr/bin/env node
// 事实核查：整场对局实际用到多少张牌、牌库剩多少
const battle = require("../shared/core/battle");
const { runPreparedMatch, createMatch, withSeed } = require("./simulate-ai-matches");

const matches = Number(process.argv[2]) || 60;
const seed0 = Number(process.argv[3]) || 20260805;

let sumDeckLeft = 0;
let sumHandLeft = 0;
let sumUsed = 0;
let sumRounds = 0;
const deckLeftList = [];

for (let i = 0; i < matches; i++) {
  const seed = seed0 + i * 9973;
  const state = withSeed(seed, () => createMatch());
  const deckSizes = state.players.map(p => p.deck.length + p.hand.length);
  const result = runPreparedMatch(seed + 1000003, 1200, state);
  // runPreparedMatch 内部用的是克隆体，这里重跑一遍拿终局状态
  const s2 = withSeed(seed, () => createMatch());
  const clone = JSON.parse(JSON.stringify(s2));
  clone.autoControlAll = true;
  clone.suppressRecording = true;
  withSeed(seed + 1000003, () => {
    let steps = 0;
    while (!clone.over && steps < 1200) {
      steps += 1;
      if (clone.roundTransition) { battle.continueRoundTransition(clone); continue; }
      if (clone.pending) { require("./simulate-ai-matches").resolveAutoPending(clone); continue; }
      battle.autoStep(clone, { playerIndex: clone.current, cfg: { blunder: 0, concede: true, valueNoise: 0, minLeadToStop: 1 } });
    }
  });
  clone.players.forEach((p, idx) => {
    const total = deckSizes[idx];
    sumDeckLeft += p.deck.length;
    sumHandLeft += p.hand.length;
    sumUsed += total - p.deck.length;
    deckLeftList.push(p.deck.length);
  });
  sumRounds += clone.round;
}

const n = matches * 2;
deckLeftList.sort((a, b) => a - b);
console.log(`核查 ${matches} 场 hard 对局（${n} 个玩家样本），种子 ${seed0}`);
console.log(`平均打到第 ${(sumRounds / matches).toFixed(2)} 小局`);
console.log(`整场从牌库离开的牌（进手牌/被集贤召唤上场）平均 ${(sumUsed / n).toFixed(2)} 张`);
console.log(`终局牌库剩余平均 ${(sumDeckLeft / n).toFixed(2)} 张（中位数 ${deckLeftList[Math.floor(n / 2)]}，最小 ${deckLeftList[0]}，最大 ${deckLeftList[n - 1]}）`);
console.log(`终局手上还剩平均 ${(sumHandLeft / n).toFixed(2)} 张没打出`);
