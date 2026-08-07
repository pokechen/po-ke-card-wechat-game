// 验证卧薪尝胆「死牌开局即打」默认策略的行为：
//  1) 持有彻底无用的死牌复国（无出使、无战俘）时，轮到自己会立即打出清掉废牌；
//  2) 若己方手牌/场上存在战俘，则不应主动打出（守卫生效）。
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

// 强制双方持有「死牌卧薪尝胆」：移除出使/战俘，注入复国。
function injectDeadAwakening(state) {
  const mard = allCards().find(c => c.name === "卧薪尝胆");
  let counter = 0;
  state.players.forEach((player, idx) => {
    player.hand = player.hand.filter(c => !hasAbilitySafe(c, "出使") && !hasAbilitySafe(c, "战俘"));
    player.deck = (player.deck || []).filter(c => !hasAbilitySafe(c, "出使") && !hasAbilitySafe(c, "战俘"));
    player.discard = (player.discard || []).filter(c => !hasAbilitySafe(c, "出使") && !hasAbilitySafe(c, "战俘"));
    player.hand.push(cloneCard(mard, `inject-awakening-${idx}-${counter++}`, idx));
  });
}

// 强制双方持有「复国 + 一张战俘单位」：验证守卫不主动打出。
function injectAwakeningWithDormantUnit(state) {
  const mard = allCards().find(c => c.name === "卧薪尝胆");
  const dormantUnit = allCards().find(c => hasAbilitySafe(c, "战俘"));
  if (!dormantUnit) return;
  let counter = 0;
  state.players.forEach((player, idx) => {
    player.hand = player.hand.filter(c => !hasAbilitySafe(c, "出使"));
    player.deck = (player.deck || []).filter(c => !hasAbilitySafe(c, "出使"));
    player.discard = (player.discard || []).filter(c => !hasAbilitySafe(c, "出使"));
    player.hand.push(cloneCard(mard, `inject-awakening-${idx}`, idx));
    player.hand.push(cloneCard(dormantUnit, `inject-dormantUnit-${idx}-${counter++}`, idx));
  });
}

function runOne(seed, inject) {
  const state = createMatch();
  inject(state);
  const mardUid = {};
  state.players.forEach((p, i) => { mardUid[i] = p.hand.find(c => c.name === "卧薪尝胆").uid; });
  const played = { 0: false, 1: false };
  const dumpedBeforeDormantUnit = { 0: false, 1: false };
  let steps = 0;
  while (!state.over && steps < 1200) {
    steps += 1;
    if (state.roundTransition) { battle.continueRoundTransition(state); continue; }
    if (state.pending) { if (!battle.resolvePending(state, { skip: true })) break; continue; }
    const idx = state.current;
    const player = state.players[idx];
    const before = player.hand.some(c => c.uid === mardUid[idx]);
    const hadDormantUnitInHand = player.hand.some(c => hasAbilitySafe(c, "战俘"));
    const hadDormantUnitOnBoard = ["疆场", "朝堂", "文脉"].some(row => (player.board[row] || []).some(c => hasAbilitySafe(c, "战俘") && !c.transformed));
    battle.autoStep(state, { playerIndex: idx, cfg: HARD });
    const after = player.hand.some(c => c.uid === mardUid[idx]);
    if (before && !after) {
      played[idx] = true;
      if (hadDormantUnitInHand && !hadDormantUnitOnBoard) dumpedBeforeDormantUnit[idx] = true;
    }
  }
  return { played, dumpedBeforeDormantUnit };
}

const N = 40;
let mardPlayed = 0;
for (let i = 0; i < N; i++) {
  const result = runOne(20260721 + i * 131, injectDeadAwakening);
  if (result.played[0]) mardPlayed++;
  if (result.played[1]) mardPlayed++;
}
console.log(`[死牌清废] 抽样 ${N * 2} 次出手：打出复国=${mardPlayed}，${mardPlayed >= N * 2 * 0.9 ? "默认策略已主动清废牌(符合预期，未打出多为对手已放弃则转为争胜)" : "存在未打出，需排查"}`);

let guardBadDump = 0;
for (let i = 0; i < N; i++) {
  const result = runOne(20260721 + i * 131 + 7, injectAwakeningWithDormantUnit);
  if (result.dumpedBeforeDormantUnit[0]) guardBadDump++;
  if (result.dumpedBeforeDormantUnit[1]) guardBadDump++;
}
console.log(`[守卫校验] 抽样 ${N * 2} 次出手：手牌仍有战俘时抢先打复国=${guardBadDump}，${guardBadDump === 0 ? "持有战俘时不主动清废(守卫生效)" : "存在误打，需排查"}`);
