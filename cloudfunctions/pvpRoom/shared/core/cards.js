const DATA = require("../data/zhangyu_cards");

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
  Medic: "济世",
  "Tight Bond": "同盟",
  "Morale Boost": "振势",
  Muster: "集贤",
  Agile: "通才",
  Scorch: "奇策",
  "Commander's Horn": "鼓舞",
  "Summon Shield Maidens": "召唤岳家军",
  "Summon Avenger": "召唤陆抗",
  "Summon Sky Hound": "召唤啸天犬",
  Berserker: "奋起",
  Mardroeme: "破釜"
};

const ABILITY_DESCRIPTIONS = {
  Hero: "不受时局、鼓舞、振势、同盟等战力修正影响，也不会被奇策、请辞或济世选中。",
  Spy: "打到对方阵线，随后己方抽 2 张牌。",
  Medic: "打出后可从己方弃牌堆复归 1 张非传世人物。",
  "Tight Bond": "同名同盟牌在同一阵线多张并列时，每张战力按数量倍增。",
  "Morale Boost": "为同一阵线的其他非传世人物各加 1 点战力。",
  Muster: "打出后从牌库中立即打出所有同名牌。",
  Agile: "可部署到卡牌标注的任一阵线，系统会选择或让你选择收益最高的位置。",
  Scorch: "摧毁目标范围内有效战力最高的非传世人物。",
  "Commander's Horn": "使己方指定或所在阵线的非传世人物战力翻倍。",
  "Summon Shield Maidens": "打出后从己方手牌和牌库中把所有「岳家军」一并部署到「疆场」阵线。",
  "Summon Avenger": "陆逊每次离开战场时，召唤一张 11 点传世「陆抗」顶替；若因小局清场离场，则在下一局开始入场。",
  "Summon Sky Hound": "杨戬每次离开战场后，都会在下一回合开始时于己方「疆场」阵线召唤一张啸天犬（战力 8），可多张并存。",
  Berserker: "被破釜触发后转化：疆场 4 点奋起变为 14 点振势，朝堂 2 点奋起变为 8 点同盟。",
  Mardroeme: "选择一条阵线，触发该线所有奋起人物转化。"
};

function factionInfo(faction) {
  return DATA.factions?.[faction] || {
    displayName: FACTION_LABELS[faction] || faction || "阵营",
    perkName: "",
    perkText: ""
  };
}

function factionPerkSummary(faction) {
  const info = factionInfo(faction);
  if (!info.perkName) return info.perkText || "";
  return `${info.perkName}：${info.perkText || ""}`;
}

function translateLeaderAbility(card) {
  const abilityText = String(card?.abilityText || "").trim();
  if (abilityText && /[\u4e00-\u9fff]/.test(abilityText) && !isNoAbilityText(abilityText)) return abilityText;

  const text = `${card?.leaderAbility || ""} ${abilityText}`.toLowerCase();
  if (!text.trim()) return "主将技能";
  if (/half (of )?(their )?strength|lose half|半损|一半战力/.test(text)) return "己方单位在恶劣时局下仅损失一半战力。";
  if (/draw an extra card|draw 1|抽/.test(text)) return "开局或使用时额外抽 1 张牌。";
  if (/clear any weather|clear.*weather|清除|拨云/.test(text)) return "清除场上全部时局效果。";
  if (/restore a unit from the discard pile.*random|济世.*随机/.test(text)) return "双方济世复归改为随机目标。";
  if (/spy cards|all spy|出使.*战力翻倍/.test(text)) return "双方出使人物战力翻倍。";
  if (/move agile|通才.*更优战线|通才.*移动/.test(text)) return "将己方通才人物移动到更优战线。";
  if (/commanders horn|commander's horn|double|horn|鼓舞|号令/.test(text)) {
    if (/siege|文脉/.test(text)) return "己方文脉线战力翻倍。";
    if (/ranged|朝堂/.test(text)) return "己方朝堂线战力翻倍。";
    if (/melee|close combat|疆场/.test(text)) return "己方疆场线战力翻倍。";
    return "选择己方一条阵线战力翻倍。";
  }
  if (/destroy|strongest|scorch|摧毁|奇策/.test(text)) {
    if (/siege|文脉/.test(text)) return "摧毁对方文脉线最强人物。";
    if (/ranged|朝堂/.test(text)) return "摧毁对方朝堂线最强人物。";
    if (/melee|close combat|疆场/.test(text)) return "摧毁对方疆场线最强人物。";
    return "摧毁对方满足条件的最强人物。";
  }
  if (/look at 3 random|侦察|查看/.test(text)) return "侦察对手随机 3 张手牌。";
  if (/cancel your opponent|cancel.*leader|取消.*主将/.test(text)) return "封锁对手主将技能。";
  if (/opponent'?s discard|对手.*弃牌/.test(text)) return "从对手弃牌堆取回 1 张人物到手牌。";
  if (/restore a card from your discard|弃牌堆.*手牌/.test(text)) return "从己方弃牌堆取回 1 张人物到手牌。";
  if (/pick any weather|pick a .*weather|biting frost|impenetrable fog|torrential rain|weather/.test(text)) return "从牌组选择 1 张时局牌并立即打出。";
  if (/shuffle all cards/.test(text)) return "双方弃牌堆洗回各自牌库。";
  if (/discard 2 cards/.test(text)) return "弃置 2 张手牌并抽 1 张牌。";
  return card?.pohuDesignNote || abilityText || card?.leaderAbility || "主将技能";
}

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

function cleanCardName(value) {
  return String(value || "")
    .replace(/^特殊卡牌_/, "")
    .replace(/^领袖牌_/, "")
    .replace(/^单位牌_/, "")
    .replace(/^[^_]+阵营_/, "");
}

function displayName(card) {
  return cleanCardName(card.displayName || card.baseName || card.name || "未命名");
}

function abilityNames(card) {
  const names = (card.abilityDisplayNames && card.abilityDisplayNames.length)
    ? card.abilityDisplayNames
    : (card.abilities || []).map(name => ABILITY_LABELS[name] || name);
  return names.filter(Boolean);
}

function isNoAbilityText(content) {
  const value = String(content || "").trim();
  return !value || value === "无" || value === "无特殊能力" || /^普通人物[：:]/.test(value) || /提供基础影响力/.test(value);
}

function musterMemberText(card) {
  const members = (card?.musterGroupMembers || []).filter(Boolean);
  return members.length ? members.map(name => `「${name}」`).join("、") : "";
}

function scorchDescription(card) {
  const rowText = (card?.row || []).map(row => ROW_LABELS[row]).filter(Boolean).join("、") || "对应阵线";
  return `若对方${rowText}总战力达到 10 或以上，摧毁其${rowText}当前战力最高的非传世人物。`;
}

function abilityDescriptions(card) {
  return (card?.abilities || []).map(ability => {
    const label = ABILITY_LABELS[ability] || ability;
    const members = ability === "Muster" ? musterMemberText(card) : "";
    const musterTargetName = ability === "Muster" ? (card?.musterTargetDisplayName || card?.musterTarget || "") : "";
    const description = ability === "Scorch" && card?.category !== "special"
      ? scorchDescription(card)
      : (ability === "Mardroeme" || ability === "Berserker") && card?.category !== "special" && card?.abilityText
        ? String(card.abilityText).replace(/^[^：]*：/, "")
        : musterTargetName
          ? `打出后从牌库中立即打出所有「${musterTargetName}」。`
          : members
            ? `打出后从牌库中立即打出${members}中的同组关联牌。`
            : ABILITY_DESCRIPTIONS[ability];
    return description ? `${label}：${description}` : label;
  }).filter(Boolean);
}

function cardSummary(card) {
  if (!card) return "";
  if (card.category === "leader") return translateLeaderAbility(card);
  if (card.category === "weather") return card.abilityText || `时局：影响${(card.row || []).map(row => ROW_LABELS[row]).join("、") || "全部阵线"}`;
  if (card.category === "special") return card.abilityText || abilityNames(card).join("、") || "谋略";
  const abilityText = isNoAbilityText(card.abilityText) ? "" : card.abilityText;
  return abilityNames(card).join("、") || abilityText;
}

function cloneCard(card, owner) {
  const strength = card.strength == null ? 0 : card.strength;
  return {
    id: card.id || `token-${card.baseName || card.name}`,
    uid: `${card.id || card.baseName || card.name}-${owner}-${Math.random().toString(16).slice(2)}`,
    name: displayName(card),
    displayName: card.displayName || displayName(card),
    baseName: cleanCardName(card.baseName || card.name || displayName(card)),
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
    musterGroup: card.musterGroup || "",
    musterGroupDisplayName: card.musterGroupDisplayName || "",
    musterGroupMembers: (card.musterGroupMembers || []).slice(),
    musterTarget: card.musterTarget || "",
    musterTargetDisplayName: card.musterTargetDisplayName || "",
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

// 是否为召唤类能力（Summon *），加权逻辑同集贤 Muster
function hasSummon(card) {
  return (card.abilities || []).some(ability => /^Summon /.test(ability));
}

function cardValue(card) {
  let value = card.strength || 0;
  if (card.hero || card.category === "hero") value += 8;
  if (hasAbility(card, "Spy")) value += 11;
  if (hasAbility(card, "Medic")) value += 7;
  if (hasAbility(card, "Tight Bond")) value += 6;
  if (hasAbility(card, "Muster")) value += 7;
  if (hasSummon(card)) value += 7;
  if (hasAbility(card, "Morale Boost")) value += 4;
  if (hasAbility(card, "Mardroeme")) value += 8;
  if (hasAbility(card, "Berserker")) value += 6;
  if (hasAbility(card, "Agile")) value += 2;
  const name = cleanCardName(card.baseName || card.name);
  if (hasAbility(card, "Commander's Horn") || name === "战鼓齐鸣") value += 7;
  if (hasAbility(card, "Scorch") || name === "釜底抽薪") value += 6;
  if (card.category === "weather") value += 6;
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

function summonDeckTarget(card) {
  if (hasAbility(card, "Summon Shield Maidens")) return "岳家军";
  return "";
}

function autoDeckCardsAreRelated(left, right) {
  if (!left || !right) return false;
  const leftName = left.baseName || left.name;
  const rightName = right.baseName || right.name;
  const sameName = leftName === rightName;
  if (sameName && [left, right].some(card => hasAbility(card, "Tight Bond") || hasAbility(card, "Muster") || hasAbility(card, "Berserker") || hasSummon(card))) {
    return true;
  }
  if (left.musterGroup && left.musterGroup === right.musterGroup) return true;
  if (left.musterTarget === rightName || right.musterTarget === leftName) return true;
  const leftBerserkerSet = hasAbility(left, "Berserker") || hasAbility(left, "Mardroeme");
  const rightBerserkerSet = hasAbility(right, "Berserker") || hasAbility(right, "Mardroeme");
  if (leftBerserkerSet && rightBerserkerSet) return true;
  if (summonDeckTarget(left) === rightName || summonDeckTarget(right) === leftName) return true;
  return false;
}

function expandAutoDeckGroup(seedCards, pool) {
  const related = seedCards.slice();
  const included = {};
  related.forEach(card => { included[card.id] = true; });
  for (let i = 0; i < related.length; i++) {
    pool.forEach(card => {
      if (included[card.id] || !autoDeckCardsAreRelated(related[i], card)) return;
      included[card.id] = true;
      related.push(card);
    });
  }
  return related;
}

function addAutoDeckGroup(picked, group, pool) {
  const seedCards = groupHasSynergy(group) ? group.cards : group.cards.slice(0, 1);
  const pickedIds = {};
  picked.forEach(card => { pickedIds[card.id] = true; });
  const cards = expandAutoDeckGroup(seedCards, pool).filter(card => !pickedIds[card.id]);
  if (!cards.length || picked.length + cards.length > 40) return [];
  picked.push(...cards);
  return cards;
}

function markPickedGroups(groups, usedKeys, picked) {
  const pickedIds = {};
  picked.forEach(card => { pickedIds[card.id] = true; });
  groups.forEach(group => {
    if (group.cards.some(card => pickedIds[card.id])) usedKeys[group.key] = true;
  });
}

function pickFromGroups(groups, usedKeys, topRatio, randomPick, strengthBias) {
  const available = groups.filter(group => !usedKeys[group.key]);
  if (!available.length) return null;
  const poolSize = Math.max(1, Math.ceil(available.length * topRatio));
  const pool = available.slice(0, poolSize);
  if (!randomPick) return pool[0];
  if (!strengthBias) return pool[Math.floor(Math.random() * pool.length)];
  // 加权随机：卡牌价值越高，被选中概率越大，整体偏向强势卡牌（仍保留随机性）
  const weights = pool.map(group => Math.max(1, cardValue(group.card) + 1));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

function selectAutoDeckCards(options = {}) {
  const faction = options.faction || FACTION_KEYS[0];
  const difficulty = options.difficulty || "normal";
  const strengthBias = !!options.strengthBias;
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
    const group = pickFromGroups(unitGroups, usedUnits, config.topRatio, config.randomPick, strengthBias);
    if (!group) break;
    usedUnits[group.key] = true;
    const card = group.card;
    if (card.hero && heroCount >= config.maxHeroes) continue;
    if (hasAbility(card, "Spy") && spyCount >= config.maxSpyCards) continue;
    const added = addAutoDeckGroup(picked, group, pool);
    added.forEach(item => {
      if (item.hero) heroCount += 1;
      if (hasAbility(item, "Spy")) spyCount += 1;
    });
    markPickedGroups(unitGroups, usedUnits, picked);
  }
  const usedSpecials = {};
  markPickedGroups(specialGroups, usedSpecials, picked);
  while (picked.filter(card => card.category === "special" || card.category === "weather").length < config.specialTarget) {
    const group = pickFromGroups(specialGroups, usedSpecials, config.topRatio, config.randomPick, strengthBias);
    if (!group) break;
    usedSpecials[group.key] = true;
    addAutoDeckGroup(picked, group, pool);
    markPickedGroups(unitGroups, usedUnits, picked);
    markPickedGroups(specialGroups, usedSpecials, picked);
  }
  return picked;
}

function recommendedDeckIds(faction, difficulty) {
  // 牌组随机推荐：开启强势偏向，尽量推荐高价值卡牌
  return selectAutoDeckCards({ faction, difficulty, strengthBias: true }).map(card => card.id);
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
  ABILITY_DESCRIPTIONS,
  factionInfo,
  factionPerkSummary,
  allCards,
  allTokens,
  tokenByName,
  cardById,
  displayName,
  abilityNames,
  abilityDescriptions,
  cardSummary,
  cloneCard,
  shuffle,
  cardValue,
  hasAbility,
  eligibleCards,
  leadersFor,
  groupCards,
  normalizeDeckIds,
  deckStatus,
  recommendedDeckIds,
  buildDeck,
  defaultLeader,
  categoryLabel
};
