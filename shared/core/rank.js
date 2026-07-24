const SEASON_ID = "s1";
const PRESTIGE_CAP = 200;
const PRESTIGE_PROTECT_COST = 100;

const RANK_TIERS = [
  { id: "commoner", name: "平民", minPower: 0, maxPower: 2, powerSlots: 3, band: "low", aiDifficulty: "easy", lossProtected: true, prestigeEnabled: false, forcePlayerRandom: false, allowCustomDeck: true },
  { id: "footman", name: "士卒", minPower: 3, maxPower: 6, powerSlots: 4, band: "low", aiDifficulty: "easy", lossProtected: true, prestigeEnabled: false, forcePlayerRandom: false, allowCustomDeck: true },
  { id: "commandant", name: "校尉", minPower: 7, maxPower: 11, powerSlots: 5, band: "middle", aiDifficulty: "normal", lossProtected: false, prestigeEnabled: true, forcePlayerRandom: false, allowCustomDeck: true },
  { id: "governor", name: "都督", minPower: 12, maxPower: 16, powerSlots: 5, band: "middle", aiDifficulty: "normal", lossProtected: false, prestigeEnabled: true, forcePlayerRandom: false, allowCustomDeck: true },
  { id: "general", name: "将军", minPower: 17, maxPower: 21, powerSlots: 5, band: "high", aiDifficulty: "hard", lossProtected: false, prestigeEnabled: true, forcePlayerRandom: false, allowCustomDeck: true },
  { id: "warlord", name: "诸侯", minPower: 22, maxPower: 26, powerSlots: 5, band: "high", aiDifficulty: "hard", lossProtected: false, prestigeEnabled: true, forcePlayerRandom: false, allowCustomDeck: true },
  { id: "emperor", name: "帝王", minPower: 27, maxPower: Infinity, powerSlots: Infinity, band: "top", aiDifficulty: "hard", lossProtected: false, prestigeEnabled: true, forcePlayerRandom: true, allowCustomDeck: false }
];

const PRESTIGE_GAIN = {
  middle: { base: 18, cap: 35 },
  high: { base: 16, cap: 32 },
  top: { base: 14, cap: 28 }
};

function clampNumber(value, min, max) {
  const next = Number(value);
  const safe = Number.isFinite(next) ? next : min;
  return Math.max(min, Math.min(max, safe));
}

function normalizePower(value) {
  return Math.max(0, Math.floor(Number(value) || 0));
}

function normalizePrestige(value) {
  return clampNumber(Math.floor(Number(value) || 0), 0, PRESTIGE_CAP);
}

function tierForPower(totalPower = 0) {
  const power = normalizePower(totalPower);
  return RANK_TIERS.find(tier => power >= tier.minPower && power <= tier.maxPower) || RANK_TIERS[RANK_TIERS.length - 1];
}

function nextTierForPower(totalPower = 0) {
  const tier = tierForPower(totalPower);
  const index = RANK_TIERS.findIndex(item => item.id === tier.id);
  return index >= 0 && index < RANK_TIERS.length - 1 ? RANK_TIERS[index + 1] : null;
}

function tierPower(totalPower = 0) {
  const tier = tierForPower(totalPower);
  return Math.max(0, normalizePower(totalPower) - tier.minPower);
}

function tierPowerText(totalPower = 0) {
  const tier = tierForPower(totalPower);
  const value = tierPower(totalPower);
  return Number.isFinite(tier.powerSlots) ? `${value}/${tier.powerSlots} 权势` : `${value} 权势`;
}

function profileView(profile = {}) {
  const totalPower = normalizePower(profile.totalPower);
  const prestige = normalizePrestige(profile.prestige);
  const tier = tierForPower(totalPower);
  return {
    seasonId: String(profile.seasonId || SEASON_ID),
    totalPower,
    tierPower: tierPower(totalPower),
    prestige,
    prestigeCap: PRESTIGE_CAP,
    peakPower: Math.max(totalPower, normalizePower(profile.peakPower)),
    totalMatches: Math.max(0, Math.floor(Number(profile.totalMatches) || 0)),
    wins: Math.max(0, Math.floor(Number(profile.wins) || 0)),
    losses: Math.max(0, Math.floor(Number(profile.losses) || 0)),
    draws: Math.max(0, Math.floor(Number(profile.draws) || 0)),
    currentTier: tier.name,
    currentTierId: tier.id,
    tier,
    nextTier: nextTierForPower(totalPower),
    display: `${tier.name} ${tierPowerText(totalPower)}`
  };
}

function winRate(profile = {}) {
  const total = Math.max(0, Number(profile.totalMatches) || 0);
  const wins = Math.max(0, Number(profile.wins) || 0);
  return total ? Number((wins * 100 / total).toFixed(1)) : 0;
}

function resultFromWinner(winner) {
  if (winner === 0 || winner === "win") return "win";
  if (winner === 1 || winner === "loss") return "loss";
  return "draw";
}

function winningRoundDiff(roundResults = []) {
  return (Array.isArray(roundResults) ? roundResults : []).reduce((sum, item) => {
    if (!item || item.winner !== 0) return sum;
    const scores = Array.isArray(item.scores) ? item.scores : [0, 0];
    return sum + Math.max(0, (Number(scores[0]) || 0) - (Number(scores[1]) || 0));
  }, 0);
}

function prestigeGainForWin(profile = {}, summary = {}) {
  const view = profileView(profile);
  const tier = view.tier;
  if (!tier.prestigeEnabled) return 0;
  const cfg = PRESTIGE_GAIN[tier.band] || PRESTIGE_GAIN.middle;
  const roundsWon = Math.max(0, Number(summary.roundsWon) || 0);
  const roundsLost = Math.max(0, Number(summary.roundsLost) || 0);
  const sweepBonus = roundsWon >= 2 && roundsLost === 0 ? 10 : 4;
  const diffBonus = Math.min(7, Math.floor(winningRoundDiff(summary.roundResults) / 15));
  return Math.max(0, Math.min(cfg.cap, cfg.base + sweepBonus + diffBonus));
}

function settleRankProfile(profile = {}, summary = {}) {
  const before = profileView(profile);
  const result = resultFromWinner(summary.result || summary.winner);
  let totalPower = before.totalPower;
  let prestige = before.prestige;
  let powerDelta = 0;
  let prestigeDelta = 0;
  let protectionUsed = false;

  if (result === "win") {
    powerDelta = 1;
    totalPower += 1;
    const gain = Math.min(PRESTIGE_CAP - prestige, prestigeGainForWin(before, summary));
    prestige += gain;
    prestigeDelta = gain;
  } else if (result === "loss") {
    if (!before.tier.lossProtected) {
      if (prestige >= PRESTIGE_PROTECT_COST) {
        prestige -= PRESTIGE_PROTECT_COST;
        prestigeDelta = -PRESTIGE_PROTECT_COST;
        protectionUsed = true;
      } else {
        powerDelta = -1;
        totalPower = Math.max(0, totalPower - 1);
      }
    }
  }

  const after = profileView({ ...profile, totalPower, prestige, peakPower: Math.max(before.peakPower, totalPower) });
  return { before, after, result, powerDelta, prestigeDelta, protectionUsed };
}

function publicProfile(profile = {}) {
  const view = profileView(profile);
  return {
    userId: String(profile.publicUserId || profile.userId || ""),
    nickName: String(profile.publicProfile?.nickName || profile.nickName || "匿名玩家"),
    avatarUrl: String(profile.publicProfile?.avatarUrl || profile.avatarUrl || ""),
    tierName: view.currentTier,
    tierId: view.currentTierId,
    totalPower: view.totalPower,
    tierPower: view.tierPower,
    powerSlots: view.tier.powerSlots,
    powerText: tierPowerText(view.totalPower),
    prestige: view.prestige,
    prestigeCap: PRESTIGE_CAP,
    peakPower: view.peakPower,
    totalMatches: view.totalMatches,
    wins: view.wins,
    losses: view.losses,
    draws: view.draws,
    winRate: winRate(view),
    updatedAt: Number(profile.updatedAt || 0) || 0
  };
}

module.exports = {
  SEASON_ID,
  PRESTIGE_CAP,
  PRESTIGE_PROTECT_COST,
  RANK_TIERS,
  tierForPower,
  nextTierForPower,
  tierPower,
  tierPowerText,
  profileView,
  winRate,
  resultFromWinner,
  winningRoundDiff,
  prestigeGainForWin,
  settleRankProfile,
  publicProfile
};
