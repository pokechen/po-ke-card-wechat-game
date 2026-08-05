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
  "蛰伏": "被雪耻触发后转化：疆场 4 点蛰伏变为 14 点传世振势，朝堂 2 点蛰伏变为 8 点同盟。",
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

// 被动主将（对应昆特牌原版被动领袖）：无需主动发动，开局即生效并持续整场对局。
// 秦昭襄王（双方济世复归随机）、朱元璋（双方出使翻倍）、张居正（恶劣时局半损）。
function leaderAbilitySource(card) {
  return `${card?.name || ""} ${card?.abilityText || ""}`;
}

function isEnvoyDoubleLeaderCard(card) {
  return !!card && /出使.*翻倍|间谍翻倍/i.test(leaderAbilitySource(card));
}

function isRandomRestoreLeaderCard(card) {
  return !!card && /济世.*随机|随机目标/.test(leaderAbilitySource(card));
}

function isHalfSituationLeaderCard(card) {
  return !!card && /half (of )?(their )?strength|lose half|半损|一半战力/i.test(leaderAbilitySource(card));
}

function isPassiveLeaderCard(card) {
  return isEnvoyDoubleLeaderCard(card) || isRandomRestoreLeaderCard(card) || isHalfSituationLeaderCard(card);
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
  if (name === "孟尝君") return 5;
  if (name === "鬼谷子") return 7;
  if (name === "李密") return 8;
  const relatedStrength = related.reduce((sum, item) => sum + (item.strength || 0), 0);
  // 上限 14 经实测从未被任何阵营的集贤卡触发（多数走上面的特例分支，其余通用值均<14），
  // 把上限抬到 20/24 对所有阵营的牌组零变化，故保持原值。
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

// 对战 AI 决策与换牌排序使用原始加分，保持已验证过的对战策略与行为不变。
const cardValue = makeCardValue(STRATEGY_CARD_BONUS_BASELINE);

// 自动组牌专用估值：与对战决策解耦，只影响「牌组里带什么牌」。
// 经 3 组独立种子共 900 场 hard 对战验证（剔除平局胜率 55.8%，58.3%/52.2%/57.0%）：
//  1. recall=13：请辞归隐在旧组牌估值里是 0 分，除开国群雄外所有阵营都不会带请辞，
//     而请辞是「回收人物再打一次」的核心组合件（回归脚本实测请辞 0→3 张胜率 +8.25pp）；
//  2. 非传世济世人物 +8：牌组里存在非传世济世时请辞才允许带 3 张，
//     提高济世人物入组概率可解锁「请辞×3 + 济世」的复用组合。
const DECK_BUILD_BONUS = { ...STRATEGY_CARD_BONUS_BASELINE, recall: 13 };
const DECK_BUILD_REVIVAL_UNIT_BONUS = 8;

function deckBuildCardValue(card, context = {}) {
  return cardValueBase(card, context, DECK_BUILD_BONUS)
    + (!isHeroCard(card) && hasAbility(card, "济世") ? DECK_BUILD_REVIVAL_UNIT_BONUS : 0);
}

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

// ---- 组牌估值：固定分+ 组内摊薄 ----
// 自动组牌的入组单位不是单卡，而是 addAutoDeckGroup + expandAutoDeckGroup 一次带入的整组
// （同名同盟、同名集贤、集贤组/集贤目标、蛰伏↔雪耻、召唤目标都会被强制一起入组），
// 因此「组合是否齐全」在组牌阶段本来就必然成立，不能按「当前已选牌里有没有伙伴」动态打分——
// 那会让分数取决于挑选顺序，使强组合因为伙伴还没被选中而永远排在后面。
// 估值只读卡牌自身字段与阵营池的静态组合信息，不读已选牌。
// 请辞归隐的济世复用按「至少 1 张非传世济世同组」计入（由 ensureRecallRevivalPartner 保证）。
const FIXED_RECALL_REVIVAL_BONUS = 12 + 5;

// 组牌专用同盟估值：战斗结算是 value *= 同线同名张数，n 张 s 战力的同盟组每张实得 s×n，
// 因此单张净增益为 s×(n−1)。同名同盟卡的阵线固定，抽到就必然同行、必然兑现，故按全额计入。
// 旧 allianceBoostBonus 的 0.25 系数使实测最大只给到 4 分（牛皋 s=6/n=3 真实净增 12 只给 4，
// 其 min(8,...) 上限从未被触发），导致 4 个阵营的自动组牌几乎不带同盟组。
// 经 5 组独立种子共 1000 场 hard 验证：剔除平局胜率 54.82%
// （49.5% / 57.0% / 57.5% / 53.0% / 53.0%，z=3.03）；系数 1.3 为 53.45%，0.5~0.7 为负向。
// 只作用于自动组牌，不改 cardValue（对战/换牌）与 displayCardValue（展示）。
const DECK_ALLIANCE_FACTOR = 1;

// 池内同名同盟张数（静态，不依赖已选牌）
function poolAllianceCount(card, pool) {
  const name = cleanCardName(card.name);
  return pool.filter(item => cleanCardName(item.name) === name && hasAbility(item, "同盟")).length;
}

function deckAllianceAdjust(card, pool) {
  if (!hasAbility(card, "同盟") || isHeroCard(card)) return 0;
  const count = poolAllianceCount(card, pool);
  if (count <= 1) return 0;
  const ideal = (card.strength || 0) * (count - 1) * DECK_ALLIANCE_FACTOR;
  // 先扣掉 cardValueBase 里已计入的旧同盟加分，再换成按真实净增益计算的值
  return ideal - allianceBoostBonus(card, { pool });
}

// 池内是否存在可被请辞反复回收的非传世济世单位（静态判定，不依赖已选牌）
function poolHasReplayRevivalUnit(pool) {
  return Array.isArray(pool) && pool.some(card => !isHeroCard(card)
    && hasAbility(card, "济世")
    && (card.category === "unit" || card.category === "hero"));
}

function deckBuildFixedValue(card, pool, valueFn) {
  const list = Array.isArray(pool) && pool.length ? pool : allCards();
  // 纯转化器只转化场上的蛰伏人物，牌池里没有蛰伏单位时是彻底的死牌
  if (isPureAwakeningTool(card) && !deckHasDormantUnit(list)) return 0;
  let value = (valueFn || deckBuildCardValue)(card, { pool: list });
  value += deckAllianceAdjust(card, list);
  // 请辞的济世复用价值只在阵营池确实有非传世济世单位时成立（草莽星火池内为 0 张）
  if (isRecallCard(card) && poolHasReplayRevivalUnit(list)) value += FIXED_RECALL_REVIVAL_BONUS;
  return value;
}

// 组内摊薄：一个组会占掉「组内实际入组张数」个牌组槽位，
// 因此排序键为组合总分 / 组内张数，而不是代表卡的单张分，否则
// 「3 张李广」会被当成一个槽位参与排序，而集贤/召唤套件的低分附带件不计成本。
// 经 8 组独立种子 1600 场 hard 验证：受影响子集（涉及遗策复兴）543 决胜场胜率 57.64%
// （8 组种子全部同向为正，z=3.56），对照子集（双方牌组相同）1036 场 50.19% 无偏。
function autoDeckGroupSeedCards(group) {
  return groupHasSynergy(group) ? group.cards : group.cards.slice(0, 1);
}

// 集贤组的两处偏差方向相反、大致相互抵消，实测两边任何单独修正都会变差，故保持现状：
//   高估：组内每张都计一次 recruitBonus，而整组只兑现一次「拉牌上场」
//   低估：按牌组位摊薄，没体现「集贤打 1 张就把关联件全送上场」的手牌效率
// 实测（各 400 场）：只去重复计价 47.34%、改按手牌效率计分 41.43%，均明显低于现状。
function deckBuildGroupScore(group, pool, valueFn) {
  const seeds = autoDeckGroupSeedCards(group);
  if (!seeds.length) return 0;
  const cards = expandAutoDeckGroup(seeds, pool);
  if (!cards.length) return 0;
  const total = cards.reduce((sum, card) => sum + deckBuildFixedValue(card, pool, valueFn), 0);
  return total / cards.length;
}

// valueFn 为可选注入点，供回归脚本对比不同能力加分系数（不传则用线上估值）
function makeDeckBuildGroupScorer(pool, valueFn) {
  const cache = {};
  return group => {
    if (!(group.key in cache)) cache[group.key] = deckBuildGroupScore(group, pool, valueFn);
    return cache[group.key];
  };
}

// 请辞归隐的回收组合件：请辞与济世单位在 autoDeckCardsAreRelated 中不是关联关系，
// expand 不会自动配对。估值已按「有 1 张济世伙伴」给分，因此选中请辞时必须
// 补齐一张非传世济世单位，避免出现带 3 张请辞却没有可重复回收目标的空转牌组。
function ensureRecallRevivalPartner(picked, pool) {
  if (picked.some(item => !isHeroCard(item) && hasAbility(item, "济世"))) return [];
  const pickedIds = {};
  picked.forEach(card => { pickedIds[card.id] = true; });
  const candidate = pool
    .filter(card => !pickedIds[card.id] && !isHeroCard(card) && hasAbility(card, "济世") && (card.category === "unit" || card.category === "hero"))
    .sort((a, b) => deckBuildFixedValue(b, pool) - deckBuildFixedValue(a, pool))[0];
  if (!candidate || picked.length + 1 > 40) return [];
  picked.push(candidate);
  return [candidate];
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

// 「纯转化器」：本身没有战力、只为触发蛰伏转化而存在的雪耻牌（卧薪尝胆）。
// 与之相对，范蠡是8 战力传世人物，雪耻只是附带能力，不带蛰伏也能正常上场，
// 因此不应被绑进蛰伏组（经 120 场/变体验证：范蠡单带+1.68pp，绑上文种 3 张则 -9.24pp）。
function isPureAwakeningTool(card) {
  return isAwakeningCard(card) && !isHeroCard(card) && !(card.strength > 0);
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
  // 蛰伏单位需要转化器才有价值，所以「蛰伏 -> 纯转化器」单向拉入；反向不成立，
  // 避免转化器把不同阵线的蛰伏套件串成一个大组（文种锁朝堂、勾践锁疆场）。
  if (hasAbility(left, "蛰伏") && isPureAwakeningTool(right)) return true;
  // 蛰伏单位之间只有同阵线才算一组（同阵线才能被同一次转化覆盖）
  if (hasAbility(left, "蛰伏") && hasAbility(right, "蛰伏")) {
    return (left.row || []).some(row => (right.row || []).includes(row));
  }
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

// 解析某个组实际会被加入牌组的卡（含 expand 拉入的关联件），不修改 picked。
// 供 addAutoDeckGroup 使用，也供「不超出 unitTarget」的预检使用。
function resolveAutoDeckGroupCards(picked, group, pool) {
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
  return cards;
}

function countUnitCards(cards) {
  return cards.filter(card => card.category === "unit" || card.category === "hero").length;
}

function addAutoDeckGroup(picked, group, pool) {
  const cards = resolveAutoDeckGroupCards(picked, group, pool);
  if (cards.length) picked.push(...cards);
  return cards;
}

function markPickedGroups(groups, usedKeys, picked) {
  const pickedIds = {};
  picked.forEach(card => { pickedIds[card.id] = true; });
  groups.forEach(group => {
    if (group.cards.some(card => pickedIds[card.id])) usedKeys[group.key] = true;
  });
}

function pickFromGroups(groups, usedKeys, topRatio, randomPick, strengthBias, groupValueFn) {
  const available = groups.filter(group => !usedKeys[group.key]);
  if (!available.length) return null;
  const poolSize = Math.max(1, Math.ceil(available.length * topRatio));
  const pool = available.slice(0, poolSize);
  if (!randomPick) return pool[0];
  if (!strengthBias) return pool[Math.floor(Math.random() * pool.length)];
  // 加权随机：组合价值越高，被选中概率越大，整体偏向强势卡牌（仍保留随机性）
  const weights = pool.map(group => Math.max(1, groupValueFn(group) + 1));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

function strategyGroupMaxCopies(group, pool) {
  const card = group.card;
  if (isRecallCard(card)) {
    // 请辞归隐：阵营池内存在可重复回收的非传世济世单位时最多带入 3 张配合回收
    // （ensureRecallRevivalPartner 会保证济世伙伴同组）；否则请辞无重复回收目标，仅保留 1 张。
    return poolHasReplayRevivalUnit(pool) ? 3 : 1;
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
  const valueFn = options.valueFn || deckBuildCardValue;
  const groupScore = makeDeckBuildGroupScorer(pool, valueFn);
  const unitGroups = groupCards(pool.filter(card => card.category === "unit" || card.category === "hero"))
    .sort((a, b) => groupScore(b) - groupScore(a));
  // 估值不依赖已选牌，谋略/时局组排序只需算一次
  const strategyGroups = groupCards(pool.filter(card => card.category === "stratagem" || card.category === "situation"))
    .sort((a, b) => groupScore(b) - groupScore(a));
  const picked = [];
  const usedUnits = {};
  let heroCount = 0;
  let envoyCount = 0;
  while (picked.filter(card => card.category === "unit" || card.category === "hero").length < config.unitTarget) {
    const group = pickFromGroups(unitGroups, usedUnits, config.topRatio, config.randomPick, strengthBias, groupScore);
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
    const group = pickFromGroups(strategyGroups, usedStrategies, config.topRatio, config.randomPick, strengthBias, groupScore);
    if (!group) break;
    // 纯转化器（卧薪尝胆）本身 0 战力、没有蛰伏就是废牌，且与蛰伏只有单向关联，
    // 因此不允许作为种子主动入组，只能作为附带件随蛰伏单位一起进牌组。
    if (isPureAwakeningTool(group.card)) {
      usedStrategies[group.key] = true;
      continue;
    }
    const maxCopies = strategyGroupMaxCopies(group, pool);
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
    if (added.some(isRecallCard)) ensureRecallRevivalPartner(picked, pool);
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
  isEnvoyDoubleLeaderCard,
  isRandomRestoreLeaderCard,
  isHalfSituationLeaderCard,
  isPassiveLeaderCard,
  cloneCard,
  shuffle,
  cardValue,
  displayCardValue,
  deckBuildCardValue,
  deckBuildFixedValue,
  selectAutoDeckCards,
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
