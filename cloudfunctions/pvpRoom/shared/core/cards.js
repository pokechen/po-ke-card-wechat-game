const DATA = require("../data/zhangyu_cards");

const ROWS = ["疆场", "朝堂", "文脉"];

const ROW_LABELS = {
  "疆场": "疆场",
  "朝堂": "朝堂",
  "文脉": "文脉"
};

const FACTION_KEYS = [
  "开国群雄",
  "纵横权谋",
  "百家争鸣",
  "草莽星火",
  "遗策复兴"
];

const FACTION_LABELS = {
  "开国群雄": "开国群雄",
  "纵横权谋": "纵横权谋",
  "百家争鸣": "百家争鸣",
  "草莽星火": "草莽星火",
  "遗策复兴": "遗策复兴",
  "天下共识": "天下共识"
};

const DIFFICULTY_LABELS = {
  easy: "简单",
  normal: "普通",
  hard: "困难"
};

const ABILITY_LABELS = {
  "传世": "传世",
  "出使": "出使",
  "济世": "济世",
  "同盟": "同盟",
  "振势": "振势",
  "集贤": "集贤",
  "通才": "通才",
  "奇策": "奇策",
  "鼓舞": "鼓舞",
  "召唤岳家军": "召唤岳家军",
    "召唤无当飞军": "召唤无当飞军",
    "召唤东吴水师": "召唤东吴水师",
    "蛰伏": "蛰伏",
    "雪耻": "雪耻"
};

const ABILITY_DESCRIPTIONS = {
  "传世": "不受时局、鼓舞、振势、同盟等战力修正影响，也不会被奇策、请辞或济世选中。",
  "出使": "打到对方阵线，随后己方抽 2 张牌。",
  "济世": "打出后可从己方弃牌堆复归 1 张非传世人物。",
  "同盟": "同名同盟牌在同一阵线多张并列时，每张战力按数量倍增。",
  "振势": "为同一阵线的其他非传世人物各加 1 点战力。",
  "集贤": "打出后从牌库中立即打出所有同名牌。",
  "通才": "可部署到卡牌标注的任一阵线，系统会选择或让你选择收益最高的位置。",
  "奇策": "摧毁目标范围内有效战力最高的非传世人物。",
  "鼓舞": "使己方指定或所在阵线的非传世人物战力翻倍。",
  "召唤岳家军": "打出后从己方手牌和牌库中把所有「岳家军」一并部署到「疆场」阵线。",
  "召唤无当飞军": "诸葛亮每次离开战场时，召唤一张 11 点传世「无当飞军」顶替；若因小局清场离场，则在下一局开始入场。",
  "召唤东吴水师": "周瑜每次离开战场时，召唤一张 8 点「东吴水师」顶替；若因小局清场离场，则在下一局开始入场。",
  "蛰伏": "被雪耻触发后转化：疆场 4 点蛰伏变为 14 点振势，朝堂 2 点蛰伏变为 8 点同盟。",
  "雪耻": "选择一条阵线，触发该线所有蛰伏人物转化。"
};

function splitDisplayList(value) {
  if (Array.isArray(value)) return value;
  return String(value || "").split(/[\/、,，]/).map(item => item.trim()).filter(Boolean);
}

function validFactionName(value, fallback = "开国群雄") {
  const name = String(value || "").trim();
  return FACTION_LABELS[name] ? name : fallback;
}

function validRowName(value) {
  const name = String(value || "").trim();
  return ROW_LABELS[name] ? name : "";
}

function validAbilityName(value) {
  const name = String(value || "").trim();
  return ABILITY_LABELS[name] ? name : "";
}

function displayRows(value) {
  return splitDisplayList(value).map(validRowName).filter(Boolean);
}

function displayAbilities(value) {
  return splitDisplayList(value).map(validAbilityName).filter(Boolean);
}

function cardAbilityList(card) {
  return Array.isArray(card?.abilityDisplayNames) && card.abilityDisplayNames.length
    ? card.abilityDisplayNames
    : (Array.isArray(card?.abilities) ? card.abilities : []);
}

function isHeroCard(card) {
  return cardAbilityList(card).includes("传世");
}

function normalizeCardDefinition(card) {
  const faction = validFactionName(card?.factionDisplayName, "天下共识");
  const row = displayRows(card?.rowDisplayName);
  const abilities = displayAbilities(card?.abilityDisplayNames);
  return {
    ...card,
    faction,
    factionDisplayName: faction,
    row,
    rowDisplayName: row.join("/"),
    abilities,
    abilityDisplayNames: abilities
  };
}

let normalizedCardsCache = null;
let normalizedTokensCache = null;

function factionInfo(faction) {
  const key = validFactionName(faction, faction || "开国群雄");
  return DATA.factions?.[key] || {
    displayName: FACTION_LABELS[key] || key || "阵营",
    perkName: "",
    perkText: ""
  };
}

function factionPerkSummary(faction) {
  const info = factionInfo(faction);
  if (!info.perkName) return info.perkText || "";
  return `${info.perkName}：${info.perkText || ""}`;
}

function leaderSummary(card) {
  const abilityText = String(card?.abilityText || "").trim();
  return abilityText && !isNoAbilityText(abilityText) ? abilityText : "主将技能";
}

function allCards() {
  if (!normalizedCardsCache) normalizedCardsCache = (DATA.cards || []).map(normalizeCardDefinition);
  return normalizedCardsCache;
}

function allTokens() {
  if (!normalizedTokensCache) normalizedTokensCache = (DATA.tokens || []).map(normalizeCardDefinition);
  return normalizedTokensCache;
}

function tokenByName(name) {
  return allTokens().find(token => token.name === name);
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
  return cleanCardName(card.displayName || card.name || "未命名");
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

function recruitMemberText(card) {
  const members = (card?.recruitGroupMembers || []).filter(Boolean);
  return members.length ? members.map(name => `「${name}」`).join("、") : "";
}

function highestPowerRemovalDescription(card) {
  const rowText = (card?.row || []).map(row => ROW_LABELS[row]).filter(Boolean).join("、") || "对应阵线";
  return `若对方${rowText}总战力达到 10 或以上，摧毁其${rowText}当前战力最高的非传世人物。`;
}

function abilityDescriptions(card) {
  return (card?.abilities || []).map(ability => {
    const label = ABILITY_LABELS[ability] || ability;
    const members = ability === "集贤" ? recruitMemberText(card) : "";
    const recruitTargetName = ability === "集贤" ? (card?.recruitTargetDisplayName || card?.recruitTarget || "") : "";
    const description = ability === "奇策"
      ? (card?.category === "stratagem" && card?.abilityText
        ? String(card.abilityText).replace(/^[^：]*：/, "")
        : highestPowerRemovalDescription(card))
      : (ability === "雪耻" || ability === "蛰伏") && card?.category !== "stratagem" && card?.abilityText
        ? String(card.abilityText).replace(/^[^：]*：/, "")
        : recruitTargetName
          ? `打出后从牌库中立即打出所有「${recruitTargetName}」。`
          : members
            ? `打出后从牌库中立即打出${members}中的同组关联牌。`
            : ABILITY_DESCRIPTIONS[ability];
    return description ? `${label}：${description}` : label;
  }).filter(Boolean);
}

function cardSummary(card) {
  if (!card) return "";
  if (card.category === "leader") return leaderSummary(card);
  if (card.category === "situation") return card.abilityText || `时局：影响${(card.row || []).map(row => ROW_LABELS[row]).join("、") || "全部阵线"}`;
  if (card.category === "stratagem") return card.abilityText || abilityNames(card).join("、") || "谋略";
  const abilityText = isNoAbilityText(card.abilityText) ? "" : card.abilityText;
  return abilityNames(card).join("、") || abilityText;
}

function cloneCard(card, owner) {
  const normalized = normalizeCardDefinition(card || {});
  const strength = normalized.strength == null ? 0 : normalized.strength;
  const name = displayName(normalized);
  return {
    id: normalized.id || `token-${name}`,
    uid: `${normalized.id || name}-${owner}-${Math.random().toString(16).slice(2)}`,
    name,
    displayName: normalized.displayName || name,
    faction: normalized.faction,
    factionDisplayName: normalized.factionDisplayName,
    category: normalized.category,
    row: normalized.row.slice(),
    rowDisplayName: normalized.rowDisplayName,
    strength,
    effective: strength,
    abilities: normalized.abilities.slice(),
    abilityDisplayNames: abilityNames(normalized),
    abilityText: normalized.abilityText || "",
    recruitGroupDisplayName: normalized.recruitGroupDisplayName || "",
    recruitGroupMembers: (normalized.recruitGroupMembers || []).slice(),
    recruitTarget: normalized.recruitTarget || "",
    recruitTargetDisplayName: normalized.recruitTargetDisplayName || "",
    expansion: normalized.expansion || "",
    territory: normalized.territory || "",
    acquisitionType: normalized.acquisitionType || "",
    acquisitionDetails: normalized.acquisitionDetails || "",
    flavor: normalized.flavor || "",
    source: normalized.source || "",
    summary: cardSummary(normalized),
    owner,
    controller: owner,
    zone: "deck",
    boardRow: null,
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

// 是否为召唤类能力（召唤*），加权逻辑同集贤 Recruit
function hasSummon(card) {
  return (card.abilities || []).some(ability => /^召唤/.test(ability));
}

function isRecallCard(card) {
  const name = cleanCardName(card.name);
  return name === "请辞归隐" || /收回手牌/.test(card.abilityText || "");
}

function cardPool(context) {
  if (Array.isArray(context)) return context;
  if (Array.isArray(context?.pool)) return context.pool;
  if (Array.isArray(context?.cards)) return context.cards;
  return [];
}

function recruitRelated(card, pool) {
  const name = cleanCardName(card.name);
  return pool.filter(item => {
    const itemName = cleanCardName(item.name);
    if (card.recruitTarget) return itemName === card.recruitTarget || itemName === name;
    if (card.recruitGroupDisplayName) return item.recruitGroupDisplayName === card.recruitGroupDisplayName;
    return itemName === name;
  });
}

function allianceBoostBonus(card, context) {
  const pool = cardPool(context);
  const name = cleanCardName(card.name);
  const count = pool.filter(item => cleanCardName(item.name) === name && hasAbility(item, "同盟")).length;
  if (count <= 1) return 0;
  const strength = card.strength || 0;
  return Math.min(8, Math.max(2, Math.round(strength * (count - 1) * 0.25 + Math.max(0, count - 2))));
}

function recruitBonus(card, context) {
  const related = recruitRelated(card, cardPool(context));
  const total = related.length;
  if (total <= 1) return 0;
  const name = cleanCardName(card.name);
  if (card.recruitGroupDisplayName === "桃园三杰") return 10;
  if (card.recruitGroupDisplayName === "星火五雄") return 10;
  if (name === "曾子") return 12;
  if (name === "孟尝君") return 5;
  if (name === "鬼谷子") return 7;
  if (name === "李密") return 8;
  const relatedStrength = related.reduce((sum, item) => sum + (item.strength || 0), 0);
  return Math.min(14, Math.round(2 + total * 1.5 + relatedStrength * 0.15));
}

function summonBonus(card, context) {
  if (hasAbility(card, "召唤岳家军")) return 18;
  if (hasAbility(card, "召唤无当飞军")) return 19;
  if (hasAbility(card, "召唤东吴水师")) return 12;
  return (card.abilities || []).some(ability => /^召唤/.test(ability)) ? 8 : 0;
}

function isSituationClearCard(card) {
  return card.category === "situation" && /拨云见日|晴空/i.test(card.name || "");
}

// 判断一组卡牌（牌组/已选卡）中是否存在「蛰伏」单位。
// 卧薪尝胆（Awakening）只会转化场上的蛰伏人物，牌组中若没有蛰伏单位则毫无价值，
// 因此它的记分与是否入组都依赖牌组是否含有蛰伏。
function deckHasDormantUnit(list) {
  return Array.isArray(list) && list.some(card => hasAbility(card, "蛰伏"));
}

function isAwakeningCard(card) {
  const name = card.name;
  return hasAbility(card, "雪耻") || name === "卧薪尝胆" || name === "破釜沉舟";
}

function isAwakeningStratagemCard(card) {
  return card?.category === "stratagem" && isAwakeningCard(card);
}

// 特殊/时局牌的能力加分配置。
// 人物牌有基础战力 + 能力加分，而特殊/时局牌基础战力为 0、只有能力加分，
// 因此这里把特殊牌的能力加分提到与强力人物相当的水平，使牌组总战力与自动组牌排序更合理。
const STRATEGY_CARD_BONUS = {
  rowBoost: 15,    // 战鼓齐鸣·鼓舞：翻倍一条阵线，价值接近强力人物
  highestPowerRemovalUnitHuangGai: 9, // 黄盖·奇策（人物牌，保留原值）
  highestPowerRemovalStratagem: 15,    // 釜底抽薪·奇策：摧毁最高战力非传世人物
  highestPowerRemovalUnitOther: 5,   // 其他带奇策的人物牌
  awakening: 11,        // 卧薪尝胆·雪耻：触发蛰伏转化
  recall: 13,            // 请辞归隐·请辞：回收单位再打出（基础分，revival 联动另计）
  situationClear: 9,      // 拨云见日：清除时局
  situationOther: 12      // 其余时局：压制对方一条阵线
};

// 旧版加分（用于胜率对比基线，勿删）
const STRATEGY_CARD_BONUS_BASELINE = {
  rowBoost: 9,
  highestPowerRemovalUnitHuangGai: 9,
  highestPowerRemovalStratagem: 8,
  highestPowerRemovalUnitOther: 5,
  awakening: 6,
  recall: 0,
  situationClear: 3,
  situationOther: 6
};

function cardValueBase(card, context, bonus) {
  const b = bonus || STRATEGY_CARD_BONUS;
  const strength = card.strength || 0;
  const envoy = hasAbility(card, "出使");
  let value = envoy ? 20 - strength : strength;
  if (!envoy && (isHeroCard(card))) value += 6;
  if (hasAbility(card, "济世")) value += 7;
  if (hasAbility(card, "同盟")) value += allianceBoostBonus(card, context);
  if (hasAbility(card, "集贤")) value += recruitBonus(card, context);
  value += summonBonus(card, context);
  if (hasAbility(card, "振势")) value += 1;
  if (hasAbility(card, "雪耻")) value += b.awakening;
  if (hasAbility(card, "蛰伏")) value += 3;
  if (hasAbility(card, "通才")) value += 2;
  const name = cleanCardName(card.name);
  if (hasAbility(card, "鼓舞") || name === "战鼓齐鸣") value += b.rowBoost;
  if (hasAbility(card, "奇策") || name === "釜底抽薪") {
    value += name === "黄盖" ? b.highestPowerRemovalUnitHuangGai : (card.category === "stratagem" || name === "釜底抽薪" ? b.highestPowerRemovalStratagem : b.highestPowerRemovalUnitOther);
  }
  if (isRecallCard(card)) value += b.recall;
  if (card.category === "situation") value += isSituationClearCard(card) ? b.situationClear : b.situationOther;
  return value;
}

function makeCardValue(bonus) {
  return (card, context = {}) => cardValueBase(card, context, bonus);
}

// 对战 AI 决策与自动组牌排序使用原始加分，保持已验证过的对战策略与行为不变。
const cardValue = makeCardValue(STRATEGY_CARD_BONUS_BASELINE);

// 牌组「总战力」展示使用重平衡后的加分，使特殊/时局牌的分数更贴近其实际效果价值
// （特殊牌基础战力为 0、只有能力加分，原加分偏低，展示上无法体现其真实价值）。
// 卧薪尝胆依赖牌组中的蛰伏单位，牌组无蛰伏时其展示分归零。
const displayCardValueBase = makeCardValue(STRATEGY_CARD_BONUS);
function displayCardValue(card, context = {}) {
  const value = displayCardValueBase(card, context);
  if (isAwakeningCard(card) && context.pool && !deckHasDormantUnit(context.pool)) {
    return value - STRATEGY_CARD_BONUS.awakening;
  }
  return value;
}

function autoDeckCardValue(card, picked = [], pool = allCards(), baseValueFn = cardValue) {
  let value = baseValueFn(card, { pool });
  if (isRecallCard(card)) {
    const revivalCount = picked.filter(item => !isHeroCard(item) && hasAbility(item, "济世")).length;
    if (revivalCount) value += 12 + revivalCount * 5;
  }
  if (isAwakeningCard(card) && !deckHasDormantUnit(picked)) value = 0;
  return value;
}

function deckValueTotal(cards) {
  const list = Array.isArray(cards) ? cards : [];
  return list.reduce((sum, card) => sum + displayCardValue(card, { pool: list }), 0);
}

function deckExpectedScore(cards) {
  const list = Array.isArray(cards) ? cards : [];
  return list.length ? Math.round((deckValueTotal(list) / list.length) * 10) : 0;
}

function hasAbility(card, ability) {
  const key = validAbilityName(ability);
  return !!key && cardAbilityList(card).includes(key);
}

function isDeckEligible(card, faction) {
  const key = validFactionName(faction);
  return card && card.category !== "leader" && (card.faction === key || card.faction === "天下共识");
}

function eligibleCards(faction) {
  const key = validFactionName(faction);
  return allCards().filter(card => isDeckEligible(card, key));
}

function leadersFor(faction) {
  const key = validFactionName(faction);
  return allCards().filter(card => card.category === "leader" && card.faction === key);
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
  const strategies = cards.filter(card => card.category === "stratagem" || card.category === "situation").length;
  const valueTotal = deckValueTotal(cards);
  return {
    ids: normalizedIds,
    cards,
    total: cards.length,
    units,
    strategies,
    valueTotal,
    score: deckExpectedScore(cards),
    valid: units >= 22 && strategies <= 10 && cards.length >= 22 && cards.length <= 40
  };
}

function groupKey(card) {
  return [card.name, card.faction, card.category, card.strength || 0, (card.row || []).join("/"), (card.abilities || []).join("/")].join("|");
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
  return group.cards.length > 1 && (hasAbility(card, "同盟") || hasAbility(card, "集贤") || hasAbility(card, "蛰伏") || hasAbility(card, "召唤岳家军"));
}

function summonDeckTarget(card) {
  if (hasAbility(card, "召唤岳家军")) return "岳家军";
  return "";
}

function autoDeckCardsAreRelated(left, right) {
  if (!left || !right) return false;
  const leftName = left.name || left.name;
  const rightName = right.name || right.name;
  const sameName = leftName === rightName;
  if (sameName && [left, right].some(card => hasAbility(card, "同盟") || hasAbility(card, "集贤") || hasAbility(card, "蛰伏") || hasSummon(card))) {
    return true;
  }
  if (left.recruitGroupDisplayName && left.recruitGroupDisplayName === right.recruitGroupDisplayName) return true;
  if (left.recruitTarget === rightName) return true;
  if (right.recruitTarget === leftName && !right.recruitTargetOneWay) return true;
  const leftDormantUnitSet = hasAbility(left, "蛰伏") || hasAbility(left, "雪耻");
  const rightDormantUnitSet = hasAbility(right, "蛰伏") || hasAbility(right, "雪耻");
  if (leftDormantUnitSet && rightDormantUnitSet) return true;
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
  const pickedIds = {};
  picked.forEach(card => { pickedIds[card.id] = true; });
  // 非联动组每次只取 1 张，且跳过已选入的副本，以便同一特殊牌（如请辞归隐）可重复多选
  const seedCards = groupHasSynergy(group)
    ? group.cards
    : group.cards.filter(card => !pickedIds[card.id]).slice(0, 1);
  if (!seedCards.length) return [];
  const expanded = expandAutoDeckGroup(seedCards, pool).filter(card => !pickedIds[card.id]);
  let awakeningStratagemCount = picked.filter(isAwakeningStratagemCard).length;
  const cards = expanded.filter(card => {
    if (!isAwakeningStratagemCard(card)) return true;
    if (awakeningStratagemCount >= 1) return false;
    awakeningStratagemCount += 1;
    return true;
  });
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

function pickFromGroups(groups, usedKeys, topRatio, randomPick, strengthBias, valueFn = cardValue) {
  const available = groups.filter(group => !usedKeys[group.key]);
  if (!available.length) return null;
  const poolSize = Math.max(1, Math.ceil(available.length * topRatio));
  const pool = available.slice(0, poolSize);
  if (!randomPick) return pool[0];
  if (!strengthBias) return pool[Math.floor(Math.random() * pool.length)];
  // 加权随机：卡牌价值越高，被选中概率越大，整体偏向强势卡牌（仍保留随机性）
  const weights = pool.map(group => Math.max(1, valueFn(group.card) + 1));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

function strategyGroupMaxCopies(group, picked) {
  const card = group.card;
  if (isRecallCard(card)) {
    // 请辞归隐：牌组中存在可重复回收的非传世济世（非传世济世单位）时，
    // 最多带入 3 张配合回收；否则仅保留 1 张（与现有池一致，避免无意义堆砌）。
    const hasReplayRevival = picked.some(item => !isHeroCard(item) && hasAbility(item, "济世"));
    return hasReplayRevival ? 3 : 1;
  }
  return 1;
}

function selectAutoDeckCards(options = {}) {
  const faction = validFactionName(options.faction, FACTION_KEYS[0]);
  const difficulty = options.difficulty || "normal";
  const strengthBias = !!options.strengthBias;
  // 旧简单基线（保留以便回归）：22/3 在 100 场验证中胜率 54%，高于 28/8 的 46%；
  // 用户决策仍采用组牌更丰富的 28/8，故此处保留旧值为回归基线，不删除旧策略。
  const OLD_EASY_BASE = { unitTarget: 22, strategyTarget: 3, topRatio: 0.95, randomPick: true, maxHeroes: 2, maxEnvoyCards: 1 };
  const baseConfig = {
    easy: { unitTarget: 28, strategyTarget: 8, topRatio: 0.95, randomPick: true, maxHeroes: 2, maxEnvoyCards: 1 },
    normal: { unitTarget: 25, strategyTarget: 6, topRatio: 0.55, randomPick: true, maxHeroes: 5, maxEnvoyCards: 2 },
    // hard 已切换为「越困难牌组越小越强」策略：对比旧 28/8 的 100 场胜率 60%（60胜39负1平），22/4 为验证通过方案
    hard: { unitTarget: 22, strategyTarget: 4, topRatio: 0.25, randomPick: false, maxHeroes: 99, maxEnvoyCards: 99 }
  }[difficulty] || { unitTarget: 24, strategyTarget: 5, topRatio: 0.55, randomPick: true, maxHeroes: 5, maxEnvoyCards: 2 };
  // deckProfile 允许实验性覆盖组牌配置（如回归对比传 28/8 复现旧基线）；不传则使用上面已验证的线上基线
  const config = options.deckProfile ? { ...baseConfig, ...options.deckProfile } : baseConfig;
  const pool = eligibleCards(faction);
  const valueFn = options.valueFn || cardValue;
  const unitGroups = groupCards(pool.filter(card => card.category === "unit" || card.category === "hero"))
    .sort((a, b) => valueFn(b.card, { pool }) - valueFn(a.card, { pool }));
  const strategyGroups = groupCards(pool.filter(card => card.category === "stratagem" || card.category === "situation"));
  const picked = [];
  const rankedStrategyGroups = () => strategyGroups.slice()
    .sort((a, b) => autoDeckCardValue(b.card, picked, pool, valueFn) - autoDeckCardValue(a.card, picked, pool, valueFn));
  const usedUnits = {};
  let heroCount = 0;
  let envoyCount = 0;
  while (picked.filter(card => card.category === "unit" || card.category === "hero").length < config.unitTarget) {
    const group = pickFromGroups(unitGroups, usedUnits, config.topRatio, config.randomPick, strengthBias, card => valueFn(card, { pool }));
    if (!group) break;
    usedUnits[group.key] = true;
    const card = group.card;
    if (isHeroCard(card) && heroCount >= config.maxHeroes) continue;
    if (hasAbility(card, "出使") && envoyCount >= config.maxEnvoyCards) continue;
    const added = addAutoDeckGroup(picked, group, pool);
    added.forEach(item => {
      if (isHeroCard(item)) heroCount += 1;
      if (hasAbility(item, "出使")) envoyCount += 1;
    });
    markPickedGroups(unitGroups, usedUnits, picked);
  }
  const usedStrategies = {};
  const strategyPicked = {};
  markPickedGroups(strategyGroups, usedStrategies, picked);
  while (picked.filter(card => card.category === "stratagem" || card.category === "situation").length < config.strategyTarget) {
    const rankedStrategies = rankedStrategyGroups();
    const group = pickFromGroups(rankedStrategies, usedStrategies, config.topRatio, config.randomPick, strengthBias, card => autoDeckCardValue(card, picked, pool, valueFn));
    if (!group) break;
    // 卧薪尝胆只转化场上的蛰伏单位，牌组中若没有蛰伏单位则毫无价值，直接排除不入组。
    if (isAwakeningCard(group.card) && !deckHasDormantUnit(picked)) {
      usedStrategies[group.key] = true;
      continue;
    }
    const maxCopies = strategyGroupMaxCopies(group, picked);
    const already = strategyPicked[group.key] || 0;
    if (already >= maxCopies) {
      // 已达该组最大携带张数，禁止继续挑选本组
      usedStrategies[group.key] = true;
      continue;
    }
    const added = addAutoDeckGroup(picked, group, pool);
    if (!added.length) {
      usedStrategies[group.key] = true;
      continue;
    }
    strategyPicked[group.key] = already + 1;
    if (strategyPicked[group.key] >= maxCopies) usedStrategies[group.key] = true;
    markPickedGroups(unitGroups, usedUnits, picked);
  }
  return picked;
}

function recommendedDeckIds(faction, difficulty) {
  // 牌组随机推荐：开启强势偏向，尽量推荐高价值卡牌
  return selectAutoDeckCards({ faction: validFactionName(faction), difficulty, strengthBias: true }).map(card => card.id);
}

function buildDeck(owner, options = {}) {
  const faction = validFactionName(options.faction, FACTION_KEYS[owner % FACTION_KEYS.length]);
  const difficulty = options.difficulty || "normal";
  const customStatus = deckStatus(options.customDeckIds, faction);
  const picked = customStatus.valid ? customStatus.cards : selectAutoDeckCards({ faction, difficulty, valueFn: options.valueFn, deckProfile: options.deckProfile });
  return shuffle(picked).map(card => cloneCard(card, owner));
}

function defaultLeader(faction, leaderId) {
  const key = validFactionName(faction);
  const leaders = leadersFor(key);
  const leader = leaders.find(card => card.id === leaderId) || leaders[0];
  return leader ? cloneCard(leader, -1) : null;
}

function categoryLabel(card) {
  if (card.category === "situation") return "时局";
  if (card.category === "stratagem") return "谋略";
  if (card.category === "leader") return "主将";
  return isHeroCard(card) ? "传世" : "人物";
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
  displayCardValue,
  makeCardValue,
  STRATEGY_CARD_BONUS,
  STRATEGY_CARD_BONUS_BASELINE,
  deckValueTotal,
  deckExpectedScore,
  hasAbility,
  eligibleCards,
  leadersFor,
  groupCards,
  normalizeDeckIds,
  deckStatus,
  recommendedDeckIds,
  buildDeck,
  defaultLeader,
  categoryLabel,
  isHeroCard
};
