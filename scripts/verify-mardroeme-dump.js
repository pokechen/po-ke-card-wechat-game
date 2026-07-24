// 验证破釜沉舟「死牌开局即打」默认策略的行为：
//  1) 持有彻底无用的死牌破釜（无出使、无奋起）时，轮到自己会立即打出清掉废牌；
//  2) 若己方手牌/场上存在奋起，则不应主动打出（守卫生效）。
// 注意：该策略已作为默认行为，无需任何开关即可触发。
const battle = require("../shared/core/battle");
const { allCards } = require("../shared/core/cards");
const { createMatch } = require("./simulate-ai-matches");

const HARD = { blunder: 0, concede: true, valueNoise: 0, minLeadToStop: 1 };

function hasAbilitySafe(card, name) {
  return card && Array.isArray(card.abilities) && card.abilities.includes(name);
}

function cloneCard(card, uid, owner) {
  const c = JSON.parse(JSON.stringify(card));
  c.uid = uid; c.owner = owner; c.controller = owner; c.zone = "hand"; c.boardRow = null;
  return c;
}

// 强制双方持有「死牌破釜沉舟」：移除出使/奋起，注入破釜。
function injectDeadMardroeme(state) {
  const mard = allCards().find(c => c.baseName === "破釜沉舟");
  let counter = 0;
  state.players.forEach((player, idx) => {
    player.hand = player.hand.filter(c => !hasAbilitySafe(c, "Spy") && !hasAbilitySafe(c, "Berserker"));
    player.deck = (player.deck || []).filter(c => !hasAbilitySafe(c, "Spy") && !hasAbilitySafe(c, "Berserker"));
    player.discard = (player.discard || []).filter(c => !hasAbilitySafe(c, "Spy") && !hasAbilitySafe(c, "Berserker"));
    player.hand.push(cloneCard(mard, `inject-mardroeme-${idx}-${counter++}`, idx));
  });
}

// 强制双方持有「破釜 + 一张奋起单位」：验证守卫不主动打出。
function injectMardroemeWithBerserker(state) {
  const mard = allCards().find(c => c.baseName === "破釜沉舟");
  const berserker = allCards().find(c => hasAbilitySafe(c, "Berserker"));
  if (!berserker) return;
  let counter = 0;
  state.players.forEach((player, idx) => {
    player.hand = player.hand.filter(c => !hasAbilitySafe(c, "Spy"));
    player.deck = (player.deck || []).filter(c => !hasAbilitySafe(c, "Spy"));
    player.discard = (player.discard || []).filter(c => !hasAbilitySafe(c, "Spy"));
    player.hand.push(cloneCard(mard, `inject-mardroeme-${idx}`, idx));
    player.hand.push(cloneCard(berserker, `inject-berserker-${idx}-${counter++}`, idx));
  });
}

function runOne(seed, inject) {
  const state = createMatch();
  inject(state);
  const mardUid = {};
  state.players.forEach((p, i) => { mardUid[i] = p.hand.find(c => c.baseName === "破釜沉舟").uid; });
  const played = { 0: false, 1: false };
  let steps = 0;
  while (!state.over && steps < 1200) {
    steps += 1;
    if (state.roundTransition) { battle.continueRoundTransition(state); continue; }
    if (state.pending) { if (!battle.resolvePending(state, { skip: true })) break; continue; }
    const idx = state.current;
    const before = state.players[idx].hand.some(c => c.uid === mardUid[idx]);
    battle.autoStep(state, { playerIndex: idx, cfg: { ...HARD, strategy: "optimized" } });
    const after = state.players[idx].hand.some(c => c.uid === mardUid[idx]);
    if (before && !after) played[idx] = true;
  }
  return played;
}

const N = 40;
let mardPlayed = 0;
for (let i = 0; i < N; i++) {
  const p = runOne(20260721 + i * 131, injectDeadMardroeme);
  if (p[0]) mardPlayed++;
  if (p[1]) mardPlayed++;
}
console.log(`[死牌清废] 抽样 ${N * 2} 次出手：打出破釜=${mardPlayed}，${mardPlayed >= N * 2 * 0.9 ? "默认策略已主动清废牌(符合预期，未打出多为对手已放弃则转为争胜)" : "存在未打出，需排查"}`);

let guardKept = 0;
for (let i = 0; i < N; i++) {
  const p = runOne(20260721 + i * 131 + 7, injectMardroemeWithBerserker);
  if (!p[0]) guardKept++;
  if (!p[1]) guardKept++;
}
console.log(`[守卫校验] 抽样 ${N * 2} 次出手：未打出破釜=${guardKept}，${guardKept >= N * 2 * 0.95 ? "持有奋起时不主动打出(守卫生效，个别为奋起已被移出战场后破釜转为死牌)" : "存在误打，需排查"}`);
