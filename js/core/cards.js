const DATA = require("../data/gwent_cards");

const ROWS = ["melee", "ranged", "siege"];

const ROW_LABELS = {
  melee: "疆场",
  ranged: "朝堂",
  siege: "文脉"
};

const FACTION_KEYS = [
  "Northern Realms",
  "Nilfgaardian Empire",
  "Scoia'tael",
  "Monsters",
  "Skellige"
];

const FACTION_LABELS = {
  "Northern Realms": "开国群雄",
  "Nilfgaardian Empire": "纵横权谋",
  "Scoia'tael": "百家争鸣",
  Monsters: "草莽星火",
  Skellige: "遗策复兴",
  Neutral: "天下共识"
};

const DIFFICULTY_LABELS = {
  easy: "简单",
  normal: "普通",
  hard: "困难"
};

const ABILITY_LABELS = {
  Hero: "传世",
  Spy: "出使",
  Medic: "举荐",
  "Tight Bond": "同袍",
  "Morale Boost": "激励",
  Muster: "集结",
  Agile: "机动",
  Scorch: "奇策",
  "Commander's Horn": "号令",
  "Summon Shield Maidens": "召唤盾女",
  "Summon Avenger": "召唤复仇者",
  "Summon Bovine Defense Force": "召唤牛魔防卫军",
  Berserker: "奋起",
  Mardroeme: "破釜"
};

function allCards() {
  return DATA.cards || [];
}

function allTokens() {
  return DATA.tokens || [];
}

function tokenByName(baseName) {
  return allTokens().find(token => token.baseName === baseName);
}

function cardById(id) {
  return allCards().find(card => card.id === id);
}

function displayName(card) {
  return card.displayName || card.baseName || card.name || "未命名";
}

function abilityNames(card) {
  const names = (card.abilityDisplayNames && card.abilityDisplayNames.length)
    ? card.abilityDisplayNames
    : (card.abilities || []).map(name => ABILITY_LABELS[name] || name);
  return names.filter(Boolean);
}

function cardSummary(card) {
  if (!card) return "";
  if (card.category === "leader") return card.leaderAbility || card.abilityText || "主将能力";
  if (card.category === "weather") return card.abilityText || `时局：影响${(card.row || []).map(row => ROW_LABELS[row]).join("、") || "全部阵线"}`;
  if (card.category === "special") return abilityNames(card).join("、") || card.abilityText || "谋略";
  return abilityNames(card).join("、") || card.abilityText || "人物";
}

function cloneCard(card, owner) {
  const strength = card.strength == null ? 0 : card.strength;
  return {
    id: card.id || `token-${card.baseName || card.name}`,
    uid: `${card.id || card.baseName || card.name}-${owner}-${Math.random().toString(16).slice(2)}`,
    name: displayName(card),
    baseName: card.baseName || card.name || displayName(card),
    faction: card.faction,
    factionDisplayName: card.factionDisplayName || FACTION_LABELS[card.faction] || card.faction,
    category: card.category,
    row: (card.row || []).slice(),
    rowDisplayName: card.rowDisplayName || (card.row || []).map(row => ROW_LABELS[row]).join("/"),
    strength,
    effective: strength,
    abilities: (card.abilities || []).slice(),
    abilityDisplayNames: abilityNames(card),
    abilityText: card.abilityText || "",
    leaderAbility: card.leaderAbility || "",
    expansion: card.expansion || "",
    territory: card.territory || "",
    acquisitionType: card.acquisitionType || "",
    acquisitionDetails: card.acquisitionDetails || "",
    imageUrl: card.imageUrl || "",
    flavor: card.flavor || "",
    source: card.source || "",
    copyIndex: card.copyIndex || 1,
    copyLabel: card.copyLabel || "",
    summary: cardSummary(card),
    hero: !!card.hero,
    owner,
    playedBy: owner,
    transformed: false
  };
}

function shuffle(list) {
  const arr = list.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
}

function cardValue(card) {
  let value = card.strength || 0;
  if (card.hero || card.category === "hero") value += 8;
  if (hasAbility(card, "Spy")) value += 11;
  if (hasAbility(card, "Medic")) value += 7;
  if (hasAbility(card, "Tight Bond")) value += 6;
  if (hasAbility(card, "Muster")) value += 7;
  if (hasAbility(card, "Morale Boost")) value += 4;
  if (hasAbility(card, "Commander's Horn") || card.baseName === "天下檄文") value += 7;
  if (hasAbility(card, "Scorch") || card.baseName === "釜底抽薪") value += 6;
  if (card.category === "weather") value += 2;
  return value;
}

function hasAbility(card, ability) {
  return (card.abilities || []).includes(ability);
}

function isDeckEligible(card, faction) {
  return card && card.category !== "leader" && (card.faction === faction || card.faction === "Neutral");
}

function eligibleCards(faction) {
  return allCards().filter(card => isDeckEligible(card, faction));
}

function leadersFor(faction) {
  return allCards().filter(card => card.category === "leader" && card.faction === faction);
}

function normalizeDeckIds(ids, faction) {
  const seen = {};
  const normalized = [];
  (Array.isArray(ids) ? ids : []).forEach(id => {
    if (seen[id] || normalized.length >= 40) return;
    const card = cardById(id);
    if (!isDeckEligible(card, faction)) return;
    seen[id] = true;
    normalized.push(id);
  });
  return normalized;
}

function deckStatus(ids, faction) {
  const normalizedIds = normalizeDeckIds(ids, faction);
  const cards = normalizedIds.map(cardById).filter(Boolean);
  const units = cards.filter(card => card.category === "unit" || card.category === "hero").length;
  const specials = cards.filter(card => card.category === "special" || card.category === "weather").length;
  return {
    ids: normalizedIds,
    cards,
    total: cards.length,
    units,
    specials,
    valid: units >= 22 && specials <= 10 && cards.length >= 22 && cards.length <= 40
  };
}

function groupKey(card) {
  return [card.baseName, card.faction, card.category, card.strength || 0, (card.row || []).join("/"), (card.abilities || []).join("/")].join("|");
}

function groupCards(cards) {
  const map = {};
  cards.forEach(card => {
    const key = groupKey(card);
    if (!map[key]) map[key] = { key, card, cards: [] };
    map[key].cards.push(card);
  });
  return Object.keys(map).map(key => map[key]);
}

function groupHasSynergy(group) {
  const card = group.card;
  return group.cards.length > 1 && (hasAbility(card, "Tight Bond") || hasAbility(card, "Muster") || hasAbility(card, "Berserker") || hasAbility(card, "Summon Shield Maidens"));
}

function pickFromGroups(groups, usedKeys, topRatio, randomPick) {
  const available = groups.filter(group => !usedKeys[group.key]);
  if (!available.length) return null;
  const poolSize = Math.max(1, Math.ceil(available.length * topRatio));
  const pool = available.slice(0, poolSize);
  return randomPick ? pool[Math.floor(Math.random() * pool.length)] : pool[0];
}

function selectAutoDeckCards(options = {}) {
  const faction = options.faction || FACTION_KEYS[0];
  const difficulty = options.difficulty || "normal";
  const config = {
    easy: { unitTarget: 22, specialTarget: 3, topRatio: 0.95, randomPick: true, maxHeroes: 2, maxSpyCards: 1 },
    normal: { unitTarget: 25, specialTarget: 6, topRatio: 0.55, randomPick: true, maxHeroes: 5, maxSpyCards: 2 },
    hard: { unitTarget: 28, specialTarget: 8, topRatio: 0.25, randomPick: false, maxHeroes: 99, maxSpyCards: 99 }
  }[difficulty] || { unitTarget: 24, specialTarget: 5, topRatio: 0.55, randomPick: true, maxHeroes: 5, maxSpyCards: 2 };
  const pool = eligibleCards(faction);
  const unitGroups = groupCards(pool.filter(card => card.category === "unit" || card.category === "hero"))
    .sort((a, b) => cardValue(b.card) - cardValue(a.card));
  const specialGroups = groupCards(pool.filter(card => card.category === "special" || card.category === "weather"))
    .sort((a, b) => cardValue(b.card) - cardValue(a.card));
  const picked = [];
  const usedUnits = {};
  let heroCount = 0;
  let spyCount = 0;
  while (picked.filter(card => card.category === "unit" || card.category === "hero").length < config.unitTarget) {
    const group = pickFromGroups(unitGroups, usedUnits, config.topRatio, config.randomPick);
    if (!group) break;
    usedUnits[group.key] = true;
    const card = group.card;
    if (card.hero && heroCount >= config.maxHeroes) continue;
    if (hasAbility(card, "Spy") && spyCount >= config.maxSpyCards) continue;
    const cards = groupHasSynergy(group) ? group.cards : group.cards.slice(0, 1);
    cards.forEach(item => {
      if (picked.length < 40) {
        picked.push(item);
        if (item.hero) heroCount += 1;
        if (hasAbility(item, "Spy")) spyCount += 1;
      }
    });
  }
  const usedSpecials = {};
  while (picked.filter(card => card.category === "special" || card.category === "weather").length < config.specialTarget) {
    const group = pickFromGroups(specialGroups, usedSpecials, config.topRatio, config.randomPick);
    if (!group) break;
    usedSpecials[group.key] = true;
    picked.push(group.cards[0]);
  }
  return picked;
}

function recommendedDeckIds(faction, difficulty) {
  return selectAutoDeckCards({ faction, difficulty }).map(card => card.id);
}

function buildDeck(owner, options = {}) {
  const faction = options.faction || FACTION_KEYS[owner % FACTION_KEYS.length];
  const difficulty = options.difficulty || "normal";
  const customStatus = deckStatus(options.customDeckIds, faction);
  const picked = customStatus.valid ? customStatus.cards : selectAutoDeckCards({ faction, difficulty });
  return shuffle(picked).map(card => cloneCard(card, owner));
}

function defaultLeader(faction, leaderId) {
  const leaders = leadersFor(faction);
  const leader = leaders.find(card => card.id === leaderId) || leaders[0];
  return leader ? cloneCard(leader, -1) : null;
}

function categoryLabel(card) {
  if (card.category === "weather") return "时局";
  if (card.category === "special") return "谋略";
  if (card.category === "leader") return "主将";
  return card.hero ? "传世" : "人物";
}

module.exports = {
  ROWS,
  ROW_LABELS,
  FACTION_KEYS,
  FACTION_LABELS,
  DIFFICULTY_LABELS,
  ABILITY_LABELS,
  allCards,
  allTokens,
  tokenByName,
  cardById,
  displayName,
  abilityNames,
  cardSummary,
  cloneCard,
  shuffle,
  cardValue,
  hasAbility,
  eligibleCards,
  leadersFor,
  normalizeDeckIds,
  deckStatus,
  recommendedDeckIds,
  buildDeck,
  defaultLeader,
  categoryLabel
};
