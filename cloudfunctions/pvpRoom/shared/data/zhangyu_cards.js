const DATA = {
  "title": "章鱼牌微信小游戏卡牌数据",
  "version": "zhangyu-core-v0.1",
  "factions": {
    "Northern Realms": {
      "displayName": "开国群雄",
      "theme": "创业、开疆、将相合力",
      "perkName": "乘胜追策",
      "perkText": "赢得一个回合后抽 1 张牌。",
      "originalEngineRole": "Northern Realms"
    },
    "Nilfgaardian Empire": {
      "displayName": "纵横权谋",
      "theme": "谋略、外交、制衡与奇策",
      "perkName": "庙算先机",
      "perkText": "平局时视为本派获胜；双方同派时仍为平局。",
      "originalEngineRole": "Nilfgaardian Empire"
    },
    "Scoia'tael": {
      "displayName": "百家争鸣",
      "theme": "思想、学派、改革与文化影响",
      "perkName": "先声夺人",
      "perkText": "第一小局开始前，可以选择自己先出牌还是对手先出牌。",
      "originalEngineRole": "Scoia'tael"
    },
    "Monsters": {
      "displayName": "草莽星火",
      "theme": "义军、豪杰、民间号召与不灭火种",
      "perkName": "星火不灭",
      "perkText": "小局结束清场时，随机留下自己场上一张单位牌到下一局。",
      "originalEngineRole": "Monsters"
    },
    "Skellige": {
      "displayName": "遗策复兴",
      "theme": "史家、医家、科技、制度遗产与后发复兴",
      "perkName": "遗策再起",
      "perkText": "第 3 回合开始时从弃牌堆随机复起 2 张非传世单位。",
      "originalEngineRole": "Skellige"
    },
    "Neutral": {
      "displayName": "天下共识",
      "theme": "跨派人物、时局牌与通用谋略牌",
      "perkName": "",
      "perkText": "可被任意牌组使用。",
      "originalEngineRole": "Neutral"
    }
  },
  "rows": {
    "melee": {
      "displayName": "疆场",
      "theme": "军事、征伐、守土、武功"
    },
    "ranged": {
      "displayName": "朝堂",
      "theme": "政治、外交、谋略、制度"
    },
    "siege": {
      "displayName": "文脉",
      "theme": "思想、科技、文化、医学、工程"
    }
  },
  "cards": [
    {
      "id": "zhangyu-0021",
      "name": "秦始皇",
      "baseName": "秦始皇",
      "faction": "Neutral",
      "factionDisplayName": "天下共识",
      "category": "hero",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 15,
      "abilities": [
        "Hero"
      ],
      "abilityDisplayNames": [
        "传世"
      ],
      "abilityText": "传世",
      "leaderAbility": "",
      "hero": true,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/秦始皇.webp"
    },
    {
      "id": "zhangyu-0195",
      "name": "武则天",
      "baseName": "武则天",
      "faction": "Neutral",
      "factionDisplayName": "天下共识",
      "category": "hero",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 15,
      "abilities": [
        "Hero"
      ],
      "abilityDisplayNames": [
        "传世"
      ],
      "abilityText": "传世",
      "leaderAbility": "",
      "hero": true,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/武则天.webp"
    },
    {
      "id": "zhangyu-0194",
      "name": "妇好",
      "baseName": "妇好",
      "faction": "Neutral",
      "factionDisplayName": "天下共识",
      "category": "hero",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 7,
      "abilities": [
        "Hero"
      ],
      "abilityDisplayNames": [
        "传世"
      ],
      "abilityText": "传世",
      "leaderAbility": "",
      "hero": true,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/妇好.webp"
    },
    {
      "id": "zhangyu-0146",
      "name": "扁鹊",
      "baseName": "扁鹊",
      "faction": "Neutral",
      "factionDisplayName": "天下共识",
      "category": "hero",
      "row": [
        "ranged"
      ],
      "rowDisplayName": "朝堂",
      "strength": 7,
      "abilities": [
        "Hero",
        "Medic"
      ],
      "abilityDisplayNames": [
        "传世",
        "济世"
      ],
      "abilityText": "传世、济世",
      "leaderAbility": "",
      "hero": true,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/扁鹊.webp"
    },
    {
      "id": "zhangyu-0190",
      "name": "屈原",
      "baseName": "屈原",
      "faction": "Neutral",
      "factionDisplayName": "天下共识",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 2,
      "abilities": [
        "Commander's Horn"
      ],
      "abilityDisplayNames": [
        "鼓舞"
      ],
      "abilityText": "鼓舞",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/屈原.webp"
    },
    {
      "id": "zhangyu-0193",
      "name": "鲁班",
      "baseName": "鲁班",
      "faction": "Neutral",
      "factionDisplayName": "天下共识",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 6,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "无",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/鲁班.webp"
    },
    {
      "id": "zhangyu-0191",
      "name": "张骞",
      "baseName": "张骞",
      "faction": "Neutral",
      "factionDisplayName": "天下共识",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 5,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "无",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/张骞.webp"
    },
    {
      "id": "zhangyu-0200",
      "name": "姜子牙",
      "baseName": "姜子牙",
      "faction": "Neutral",
      "factionDisplayName": "天下共识",
      "category": "hero",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 0,
      "abilities": [
        "Spy",
        "Hero"
      ],
      "abilityDisplayNames": [
        "出使",
        "传世"
      ],
      "abilityText": "出使、传世",
      "leaderAbility": "",
      "hero": true,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/姜子牙.webp"
    },
    {
      "id": "zhangyu-0198",
      "name": "鉴真",
      "baseName": "鉴真",
      "faction": "Neutral",
      "factionDisplayName": "天下共识",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 5,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "无",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/鉴真.webp"
    },
    {
      "id": "zhangyu-0201",
      "name": "田单",
      "baseName": "田单",
      "faction": "Neutral",
      "factionDisplayName": "天下共识",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 7,
      "abilities": [
        "Scorch"
      ],
      "abilityDisplayNames": [
        "奇策"
      ],
      "abilityText": "奇策：若对方疆场总战力达到 10 或以上，摧毁其疆场当前战力最高的非传世人物。",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/田单.webp"
    },
    {
      "id": "zhangyu-0150",
      "name": "杨戬",
      "baseName": "杨戬",
      "faction": "Neutral",
      "factionDisplayName": "天下共识",
      "category": "unit",
      "row": [
        "ranged"
      ],
      "rowDisplayName": "朝堂",
      "strength": 0,
      "abilities": [
        "Summon Sky Hound"
      ],
      "abilityDisplayNames": [
        "召唤啸天犬"
      ],
      "abilityText": "召唤啸天犬：杨戬每次离开战场后，都会在下一回合开始时于己方「疆场」阵线召唤一张啸天犬（战力 8），可多张并存。",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/杨戬.webp"
    },
    {
      "id": "zhangyu-0202",
      "name": "鬼谷子",
      "baseName": "鬼谷子",
      "faction": "Neutral",
      "factionDisplayName": "天下共识",
      "category": "unit",
      "row": [
        "siege"
      ],
      "rowDisplayName": "文脉",
      "strength": 2,
      "abilities": [
        "Muster"
      ],
      "abilityDisplayNames": [
        "集贤"
      ],
      "abilityText": "集贤：打出后从牌库中立即打出所有孟尝君。",
      "musterTarget": "孟尝君",
      "musterTargetDisplayName": "孟尝君",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/鬼谷子.webp"
    },
    {
      "id": "zhangyu-0203",
      "name": "孟尝君",
      "baseName": "孟尝君",
      "faction": "Neutral",
      "factionDisplayName": "天下共识",
      "category": "unit",
      "row": [
        "ranged"
      ],
      "rowDisplayName": "朝堂",
      "strength": 4,
      "abilities": [
        "Muster"
      ],
      "abilityDisplayNames": [
        "集贤"
      ],
      "abilityText": "集贤：打出后从牌库中立即打出所有同名牌。",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "1 of 3",
      "imageUrl": "assets/card-icons/孟尝君.webp"
    },
    {
      "id": "zhangyu-0204",
      "name": "孟尝君",
      "baseName": "孟尝君",
      "faction": "Neutral",
      "factionDisplayName": "天下共识",
      "category": "unit",
      "row": [
        "ranged"
      ],
      "rowDisplayName": "朝堂",
      "strength": 4,
      "abilities": [
        "Muster"
      ],
      "abilityDisplayNames": [
        "集贤"
      ],
      "abilityText": "集贤：打出后从牌库中立即打出所有同名牌。",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 2,
      "copyLabel": "2 of 3",
      "imageUrl": "assets/card-icons/孟尝君.webp"
    },
    {
      "id": "zhangyu-0205",
      "name": "孟尝君",
      "baseName": "孟尝君",
      "faction": "Neutral",
      "factionDisplayName": "天下共识",
      "category": "unit",
      "row": [
        "ranged"
      ],
      "rowDisplayName": "朝堂",
      "strength": 4,
      "abilities": [
        "Muster"
      ],
      "abilityDisplayNames": [
        "集贤"
      ],
      "abilityText": "集贤：打出后从牌库中立即打出所有同名牌。",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 3,
      "copyLabel": "3 of 3",
      "imageUrl": "assets/card-icons/孟尝君.webp"
    },
    {
      "id": "zhangyu-0206",
      "name": "荆轲",
      "baseName": "荆轲",
      "faction": "Neutral",
      "factionDisplayName": "天下共识",
      "category": "unit",
      "row": [
        "melee",
        "ranged"
      ],
      "rowDisplayName": "疆场 / 朝堂",
      "strength": 6,
      "abilities": [
        "Agile",
        "Morale Boost"
      ],
      "abilityDisplayNames": [
        "通才",
        "振势"
      ],
      "abilityText": "通才、振势",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/荆轲.webp"
    },
    {
      "id": "zhangyu-0165",
      "name": "边患四起",
      "baseName": "边患四起",
      "faction": "Neutral",
      "factionDisplayName": "天下共识",
      "category": "weather",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": null,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "时局：压制对应阵线，非传世人物战力降为 1。",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "1 of 3",
      "imageUrl": "assets/card-icons/边患四起.webp"
    },
    {
      "id": "zhangyu-0166",
      "name": "边患四起",
      "baseName": "边患四起",
      "faction": "Neutral",
      "factionDisplayName": "天下共识",
      "category": "weather",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": null,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "时局：压制对应阵线，非传世人物战力降为 1。",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 2,
      "copyLabel": "2 of 3",
      "imageUrl": "assets/card-icons/边患四起.webp"
    },
    {
      "id": "zhangyu-0167",
      "name": "边患四起",
      "baseName": "边患四起",
      "faction": "Neutral",
      "factionDisplayName": "天下共识",
      "category": "weather",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": null,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "时局：压制对应阵线，非传世人物战力降为 1。",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 3,
      "copyLabel": "3 of 3",
      "imageUrl": "assets/card-icons/边患四起.webp"
    },
    {
      "id": "zhangyu-0168",
      "name": "党争迷局",
      "baseName": "党争迷局",
      "faction": "Neutral",
      "factionDisplayName": "天下共识",
      "category": "weather",
      "row": [
        "ranged"
      ],
      "rowDisplayName": "朝堂",
      "strength": null,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "时局：压制对应阵线，非传世人物战力降为 1。",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "1 of 3",
      "imageUrl": "assets/card-icons/党争迷局.webp"
    },
    {
      "id": "zhangyu-0169",
      "name": "党争迷局",
      "baseName": "党争迷局",
      "faction": "Neutral",
      "factionDisplayName": "天下共识",
      "category": "weather",
      "row": [
        "ranged"
      ],
      "rowDisplayName": "朝堂",
      "strength": null,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "时局：压制对应阵线，非传世人物战力降为 1。",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 2,
      "copyLabel": "2 of 3",
      "imageUrl": "assets/card-icons/党争迷局.webp"
    },
    {
      "id": "zhangyu-0170",
      "name": "党争迷局",
      "baseName": "党争迷局",
      "faction": "Neutral",
      "factionDisplayName": "天下共识",
      "category": "weather",
      "row": [
        "ranged"
      ],
      "rowDisplayName": "朝堂",
      "strength": null,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "时局：压制对应阵线，非传世人物战力降为 1。",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 3,
      "copyLabel": "3 of 3",
      "imageUrl": "assets/card-icons/党争迷局.webp"
    },
    {
      "id": "zhangyu-0171",
      "name": "典籍散佚",
      "baseName": "典籍散佚",
      "faction": "Neutral",
      "factionDisplayName": "天下共识",
      "category": "weather",
      "row": [
        "siege"
      ],
      "rowDisplayName": "文脉",
      "strength": null,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "时局：压制对应阵线，非传世人物战力降为 1。",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "1 of 3",
      "imageUrl": "assets/card-icons/典籍散佚.webp"
    },
    {
      "id": "zhangyu-0172",
      "name": "典籍散佚",
      "baseName": "典籍散佚",
      "faction": "Neutral",
      "factionDisplayName": "天下共识",
      "category": "weather",
      "row": [
        "siege"
      ],
      "rowDisplayName": "文脉",
      "strength": null,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "时局：压制对应阵线，非传世人物战力降为 1。",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 2,
      "copyLabel": "2 of 3",
      "imageUrl": "assets/card-icons/典籍散佚.webp"
    },
    {
      "id": "zhangyu-0173",
      "name": "典籍散佚",
      "baseName": "典籍散佚",
      "faction": "Neutral",
      "factionDisplayName": "天下共识",
      "category": "weather",
      "row": [
        "siege"
      ],
      "rowDisplayName": "文脉",
      "strength": null,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "时局：压制对应阵线，非传世人物战力降为 1。",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 3,
      "copyLabel": "3 of 3",
      "imageUrl": "assets/card-icons/典籍散佚.webp"
    },
    {
      "id": "zhangyu-0174",
      "name": "时代洪流",
      "baseName": "时代洪流",
      "faction": "Neutral",
      "factionDisplayName": "天下共识",
      "category": "weather",
      "row": [
        "ranged",
        "siege"
      ],
      "rowDisplayName": "朝堂 / 文脉",
      "strength": null,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "时局：压制对应阵线，非传世人物战力降为 1。",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "1 of 3",
      "imageUrl": "assets/card-icons/时代洪流.webp"
    },
    {
      "id": "zhangyu-0175",
      "name": "时代洪流",
      "baseName": "时代洪流",
      "faction": "Neutral",
      "factionDisplayName": "天下共识",
      "category": "weather",
      "row": [
        "ranged",
        "siege"
      ],
      "rowDisplayName": "朝堂 / 文脉",
      "strength": null,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "时局：压制对应阵线，非传世人物战力降为 1。",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 2,
      "copyLabel": "2 of 3",
      "imageUrl": "assets/card-icons/时代洪流.webp"
    },
    {
      "id": "zhangyu-0207",
      "name": "时代洪流",
      "baseName": "时代洪流",
      "faction": "Neutral",
      "factionDisplayName": "天下共识",
      "category": "weather",
      "row": [
        "ranged",
        "siege"
      ],
      "rowDisplayName": "朝堂 / 文脉",
      "strength": null,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "时局：压制对应阵线或清除时局。",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 3,
      "copyLabel": "3 of 3",
      "imageUrl": "assets/card-icons/时代洪流.webp"
    },
    {
      "id": "zhangyu-0176",
      "name": "拨云见日",
      "baseName": "拨云见日",
      "faction": "Neutral",
      "factionDisplayName": "天下共识",
      "category": "weather",
      "row": [],
      "rowDisplayName": "",
      "strength": null,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "晴天：清除场上全部时局效果。",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "1 of 3",
      "imageUrl": "assets/card-icons/拨云见日.webp"
    },
    {
      "id": "zhangyu-0177",
      "name": "拨云见日",
      "baseName": "拨云见日",
      "faction": "Neutral",
      "factionDisplayName": "天下共识",
      "category": "weather",
      "row": [],
      "rowDisplayName": "",
      "strength": null,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "晴天：清除场上全部时局效果。",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 2,
      "copyLabel": "2 of 3",
      "imageUrl": "assets/card-icons/拨云见日.webp"
    },
    {
      "id": "zhangyu-0178",
      "name": "拨云见日",
      "baseName": "拨云见日",
      "faction": "Neutral",
      "factionDisplayName": "天下共识",
      "category": "weather",
      "row": [],
      "rowDisplayName": "",
      "strength": null,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "时局：压制对应阵线，非传世人物战力降为 1。",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 3,
      "copyLabel": "3 of 3",
      "imageUrl": "assets/card-icons/拨云见日.webp"
    },
    {
      "id": "zhangyu-0179",
      "name": "战鼓齐鸣",
      "baseName": "战鼓齐鸣",
      "faction": "Neutral",
      "factionDisplayName": "天下共识",
      "category": "special",
      "row": [],
      "rowDisplayName": "",
      "strength": null,
      "abilities": [
        "Commander's Horn"
      ],
      "abilityDisplayNames": [
        "鼓舞"
      ],
      "abilityText": "鼓舞：选择己方一条阵线，该线人物战力翻倍。",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "1 of 3",
      "imageUrl": "assets/card-icons/战鼓齐鸣.webp"
    },
    {
      "id": "zhangyu-0180",
      "name": "战鼓齐鸣",
      "baseName": "战鼓齐鸣",
      "faction": "Neutral",
      "factionDisplayName": "天下共识",
      "category": "special",
      "row": [],
      "rowDisplayName": "",
      "strength": null,
      "abilities": [
        "Commander's Horn"
      ],
      "abilityDisplayNames": [
        "鼓舞"
      ],
      "abilityText": "鼓舞：选择己方一条阵线，该线人物战力翻倍。",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 2,
      "copyLabel": "2 of 3",
      "imageUrl": "assets/card-icons/战鼓齐鸣.webp"
    },
    {
      "id": "zhangyu-0181",
      "name": "战鼓齐鸣",
      "baseName": "战鼓齐鸣",
      "faction": "Neutral",
      "factionDisplayName": "天下共识",
      "category": "special",
      "row": [],
      "rowDisplayName": "",
      "strength": null,
      "abilities": [
        "Commander's Horn"
      ],
      "abilityDisplayNames": [
        "鼓舞"
      ],
      "abilityText": "鼓舞：选择己方一条阵线，该线人物战力翻倍。",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 3,
      "copyLabel": "3 of 3",
      "imageUrl": "assets/card-icons/战鼓齐鸣.webp"
    },
    {
      "id": "zhangyu-0185",
      "name": "请辞归隐",
      "baseName": "请辞归隐",
      "faction": "Neutral",
      "factionDisplayName": "天下共识",
      "category": "special",
      "row": [],
      "rowDisplayName": "",
      "strength": null,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "请辞：将己方场上一张非传世人物收回手牌。",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "1 of 3",
      "imageUrl": "assets/card-icons/请辞归隐.webp"
    },
    {
      "id": "zhangyu-0186",
      "name": "请辞归隐",
      "baseName": "请辞归隐",
      "faction": "Neutral",
      "factionDisplayName": "天下共识",
      "category": "special",
      "row": [],
      "rowDisplayName": "",
      "strength": null,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "请辞：将己方场上一张非传世人物收回手牌。",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 2,
      "copyLabel": "2 of 3",
      "imageUrl": "assets/card-icons/请辞归隐.webp"
    },
    {
      "id": "zhangyu-0187",
      "name": "请辞归隐",
      "baseName": "请辞归隐",
      "faction": "Neutral",
      "factionDisplayName": "天下共识",
      "category": "special",
      "row": [],
      "rowDisplayName": "",
      "strength": null,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "请辞：将己方场上一张非传世人物收回手牌。",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 3,
      "copyLabel": "3 of 3",
      "imageUrl": "assets/card-icons/请辞归隐.webp"
    },
    {
      "id": "zhangyu-0182",
      "name": "釜底抽薪",
      "baseName": "釜底抽薪",
      "faction": "Neutral",
      "factionDisplayName": "天下共识",
      "category": "special",
      "row": [],
      "rowDisplayName": "",
      "strength": null,
      "abilities": [
        "Scorch"
      ],
      "abilityDisplayNames": [
        "奇策"
      ],
      "abilityText": "奇策：摧毁场上最高战力的非传世人物。",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "1 of 3",
      "imageUrl": "assets/card-icons/釜底抽薪.webp"
    },
    {
      "id": "zhangyu-0183",
      "name": "釜底抽薪",
      "baseName": "釜底抽薪",
      "faction": "Neutral",
      "factionDisplayName": "天下共识",
      "category": "special",
      "row": [],
      "rowDisplayName": "",
      "strength": null,
      "abilities": [
        "Scorch"
      ],
      "abilityDisplayNames": [
        "奇策"
      ],
      "abilityText": "奇策：摧毁场上最高战力的非传世人物。",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 2,
      "copyLabel": "2 of 3",
      "imageUrl": "assets/card-icons/釜底抽薪.webp"
    },
    {
      "id": "zhangyu-0184",
      "name": "釜底抽薪",
      "baseName": "釜底抽薪",
      "faction": "Neutral",
      "factionDisplayName": "天下共识",
      "category": "special",
      "row": [],
      "rowDisplayName": "",
      "strength": null,
      "abilities": [
        "Scorch"
      ],
      "abilityDisplayNames": [
        "奇策"
      ],
      "abilityText": "奇策：摧毁场上最高战力的非传世人物。",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 3,
      "copyLabel": "3 of 3",
      "imageUrl": "assets/card-icons/釜底抽薪.webp"
    },
    {
      "id": "zhangyu-0208",
      "name": "周勃",
      "baseName": "周勃",
      "faction": "Northern Realms",
      "factionDisplayName": "开国群雄",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 1,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "无",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "1 of 2",
      "imageUrl": "assets/card-icons/周勃.webp"
    },
    {
      "id": "zhangyu-0209",
      "name": "周勃",
      "baseName": "周勃",
      "faction": "Northern Realms",
      "factionDisplayName": "开国群雄",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 1,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "无",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 2,
      "copyLabel": "2 of 2",
      "imageUrl": "assets/card-icons/周勃.webp"
    },
    {
      "id": "zhangyu-0022",
      "name": "曹参",
      "baseName": "曹参",
      "faction": "Northern Realms",
      "factionDisplayName": "开国群雄",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 1,
      "abilities": [
        "Tight Bond"
      ],
      "abilityDisplayNames": [
        "同盟"
      ],
      "abilityText": "同盟",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "1 of 4",
      "imageUrl": "assets/card-icons/刘邦.webp"
    },
    {
      "id": "zhangyu-0210",
      "name": "曹参",
      "baseName": "曹参",
      "faction": "Northern Realms",
      "factionDisplayName": "开国群雄",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 1,
      "abilities": [
        "Tight Bond"
      ],
      "abilityDisplayNames": [
        "同盟"
      ],
      "abilityText": "同盟",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 2,
      "copyLabel": "2 of 4",
      "imageUrl": "assets/card-icons/曹参.webp"
    },
    {
      "id": "zhangyu-0211",
      "name": "曹参",
      "baseName": "曹参",
      "faction": "Northern Realms",
      "factionDisplayName": "开国群雄",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 1,
      "abilities": [
        "Tight Bond"
      ],
      "abilityDisplayNames": [
        "同盟"
      ],
      "abilityText": "同盟",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 3,
      "copyLabel": "3 of 4",
      "imageUrl": "assets/card-icons/曹参.webp"
    },
    {
      "id": "zhangyu-0212",
      "name": "曹参",
      "baseName": "曹参",
      "faction": "Northern Realms",
      "factionDisplayName": "开国群雄",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 1,
      "abilities": [
        "Tight Bond"
      ],
      "abilityDisplayNames": [
        "同盟"
      ],
      "abilityText": "同盟",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 4,
      "copyLabel": "4 of 4",
      "imageUrl": "assets/card-icons/曹参.webp"
    },
    {
      "id": "zhangyu-0043",
      "name": "赵普",
      "baseName": "赵普",
      "faction": "Northern Realms",
      "factionDisplayName": "开国群雄",
      "category": "unit",
      "row": [
        "siege"
      ],
      "rowDisplayName": "文脉",
      "strength": 1,
      "abilities": [
        "Morale Boost"
      ],
      "abilityDisplayNames": [
        "振势"
      ],
      "abilityText": "振势",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "1 of 3",
      "imageUrl": "assets/card-icons/赵匡胤.webp"
    },
    {
      "id": "zhangyu-0213",
      "name": "赵普",
      "baseName": "赵普",
      "faction": "Northern Realms",
      "factionDisplayName": "开国群雄",
      "category": "unit",
      "row": [
        "siege"
      ],
      "rowDisplayName": "文脉",
      "strength": 1,
      "abilities": [
        "Morale Boost"
      ],
      "abilityDisplayNames": [
        "振势"
      ],
      "abilityText": "振势",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 2,
      "copyLabel": "2 of 3",
      "imageUrl": "assets/card-icons/赵普.webp"
    },
    {
      "id": "zhangyu-0214",
      "name": "赵普",
      "baseName": "赵普",
      "faction": "Northern Realms",
      "factionDisplayName": "开国群雄",
      "category": "unit",
      "row": [
        "siege"
      ],
      "rowDisplayName": "文脉",
      "strength": 1,
      "abilities": [
        "Morale Boost"
      ],
      "abilityDisplayNames": [
        "振势"
      ],
      "abilityText": "振势",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 3,
      "copyLabel": "3 of 3",
      "imageUrl": "assets/card-icons/赵普.webp"
    },
    {
      "id": "zhangyu-0215",
      "name": "樊哙",
      "baseName": "樊哙",
      "faction": "Northern Realms",
      "factionDisplayName": "开国群雄",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 1,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "无",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/樊哙.webp"
    },
    {
      "id": "zhangyu-0216",
      "name": "马援",
      "baseName": "马援",
      "faction": "Northern Realms",
      "factionDisplayName": "开国群雄",
      "category": "unit",
      "row": [
        "ranged"
      ],
      "rowDisplayName": "朝堂",
      "strength": 4,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "无",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/马援.webp"
    },
    {
      "id": "zhangyu-0217",
      "name": "蒙恬",
      "baseName": "蒙恬",
      "faction": "Northern Realms",
      "factionDisplayName": "开国群雄",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 4,
      "abilities": [
        "Tight Bond"
      ],
      "abilityDisplayNames": [
        "同盟"
      ],
      "abilityText": "同盟",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "1 of 3",
      "imageUrl": "assets/card-icons/蒙恬.webp"
    },
    {
      "id": "zhangyu-0218",
      "name": "蒙恬",
      "baseName": "蒙恬",
      "faction": "Northern Realms",
      "factionDisplayName": "开国群雄",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 4,
      "abilities": [
        "Tight Bond"
      ],
      "abilityDisplayNames": [
        "同盟"
      ],
      "abilityText": "同盟",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 2,
      "copyLabel": "2 of 3",
      "imageUrl": "assets/card-icons/蒙恬.webp"
    },
    {
      "id": "zhangyu-0219",
      "name": "蒙恬",
      "baseName": "蒙恬",
      "faction": "Northern Realms",
      "factionDisplayName": "开国群雄",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 4,
      "abilities": [
        "Tight Bond"
      ],
      "abilityDisplayNames": [
        "同盟"
      ],
      "abilityText": "同盟",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 3,
      "copyLabel": "3 of 3",
      "imageUrl": "assets/card-icons/蒙恬.webp"
    },
    {
      "id": "zhangyu-0220",
      "name": "上官婉儿",
      "baseName": "上官婉儿",
      "faction": "Northern Realms",
      "factionDisplayName": "开国群雄",
      "category": "unit",
      "row": [
        "ranged"
      ],
      "rowDisplayName": "朝堂",
      "strength": 4,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "无",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/上官婉儿.webp"
    },
    {
      "id": "zhangyu-0221",
      "name": "秦琼",
      "baseName": "秦琼",
      "faction": "Northern Realms",
      "factionDisplayName": "开国群雄",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 5,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "无",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/秦琼.webp"
    },
    {
      "id": "zhangyu-0222",
      "name": "杨业",
      "baseName": "杨业",
      "faction": "Northern Realms",
      "factionDisplayName": "开国群雄",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 5,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "无",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/杨业.webp"
    },
    {
      "id": "zhangyu-0223",
      "name": "郦食其",
      "baseName": "郦食其",
      "faction": "Northern Realms",
      "factionDisplayName": "开国群雄",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 5,
      "abilities": [
        "Spy"
      ],
      "abilityDisplayNames": [
        "出使"
      ],
      "abilityText": "出使",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/郦食其.webp"
    },
    {
      "id": "zhangyu-0224",
      "name": "班昭",
      "baseName": "班昭",
      "faction": "Northern Realms",
      "factionDisplayName": "开国群雄",
      "category": "unit",
      "row": [
        "ranged"
      ],
      "rowDisplayName": "朝堂",
      "strength": 5,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "无",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/班昭.webp"
    },
    {
      "id": "zhangyu-0145",
      "name": "华佗",
      "baseName": "华佗",
      "faction": "Northern Realms",
      "factionDisplayName": "开国群雄",
      "category": "unit",
      "row": [
        "siege"
      ],
      "rowDisplayName": "文脉",
      "strength": 5,
      "abilities": [
        "Medic"
      ],
      "abilityDisplayNames": [
        "济世"
      ],
      "abilityText": "济世",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/华佗.webp"
    },
    {
      "id": "zhangyu-0225",
      "name": "刘伯温",
      "baseName": "刘伯温",
      "faction": "Northern Realms",
      "factionDisplayName": "开国群雄",
      "category": "unit",
      "row": [
        "ranged"
      ],
      "rowDisplayName": "朝堂",
      "strength": 6,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "无",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/刘伯温.webp"
    },
    {
      "id": "zhangyu-0141",
      "name": "沈括",
      "baseName": "沈括",
      "faction": "Northern Realms",
      "factionDisplayName": "开国群雄",
      "category": "unit",
      "row": [
        "siege"
      ],
      "rowDisplayName": "文脉",
      "strength": 6,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "无",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "1 of 2",
      "imageUrl": "assets/card-icons/沈括.webp"
    },
    {
      "id": "zhangyu-0226",
      "name": "沈括",
      "baseName": "沈括",
      "faction": "Northern Realms",
      "factionDisplayName": "开国群雄",
      "category": "unit",
      "row": [
        "siege"
      ],
      "rowDisplayName": "文脉",
      "strength": 6,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "无",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 2,
      "copyLabel": "2 of 2",
      "imageUrl": "assets/card-icons/沈括.webp"
    },
    {
      "id": "zhangyu-0153",
      "name": "郭守敬",
      "baseName": "郭守敬",
      "faction": "Northern Realms",
      "factionDisplayName": "开国群雄",
      "category": "unit",
      "row": [
        "siege"
      ],
      "rowDisplayName": "文脉",
      "strength": 6,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "无",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "1 of 2",
      "imageUrl": "assets/card-icons/郭守敬.webp"
    },
    {
      "id": "zhangyu-0227",
      "name": "郭守敬",
      "baseName": "郭守敬",
      "faction": "Northern Realms",
      "factionDisplayName": "开国群雄",
      "category": "unit",
      "row": [
        "siege"
      ],
      "rowDisplayName": "文脉",
      "strength": 6,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "无",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 2,
      "copyLabel": "2 of 2",
      "imageUrl": "assets/card-icons/郭守敬.webp"
    },
    {
      "id": "zhangyu-0137",
      "name": "蔡伦",
      "baseName": "蔡伦",
      "faction": "Northern Realms",
      "factionDisplayName": "开国群雄",
      "category": "unit",
      "row": [
        "siege"
      ],
      "rowDisplayName": "文脉",
      "strength": 8,
      "abilities": [
        "Tight Bond"
      ],
      "abilityDisplayNames": [
        "同盟"
      ],
      "abilityText": "同盟",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "1 of 2",
      "imageUrl": "assets/card-icons/蔡伦.webp"
    },
    {
      "id": "zhangyu-0228",
      "name": "蔡伦",
      "baseName": "蔡伦",
      "faction": "Northern Realms",
      "factionDisplayName": "开国群雄",
      "category": "unit",
      "row": [
        "siege"
      ],
      "rowDisplayName": "文脉",
      "strength": 8,
      "abilities": [
        "Tight Bond"
      ],
      "abilityDisplayNames": [
        "同盟"
      ],
      "abilityText": "同盟",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 2,
      "copyLabel": "2 of 2",
      "imageUrl": "assets/card-icons/蔡伦.webp"
    },
    {
      "id": "zhangyu-0229",
      "name": "李广",
      "baseName": "李广",
      "faction": "Northern Realms",
      "factionDisplayName": "开国群雄",
      "category": "unit",
      "row": [
        "ranged"
      ],
      "rowDisplayName": "朝堂",
      "strength": 5,
      "abilities": [
        "Tight Bond"
      ],
      "abilityDisplayNames": [
        "同盟"
      ],
      "abilityText": "同盟",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "1 of 3",
      "imageUrl": "assets/card-icons/李广.webp"
    },
    {
      "id": "zhangyu-0230",
      "name": "李广",
      "baseName": "李广",
      "faction": "Northern Realms",
      "factionDisplayName": "开国群雄",
      "category": "unit",
      "row": [
        "ranged"
      ],
      "rowDisplayName": "朝堂",
      "strength": 5,
      "abilities": [
        "Tight Bond"
      ],
      "abilityDisplayNames": [
        "同盟"
      ],
      "abilityText": "同盟",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 2,
      "copyLabel": "2 of 3",
      "imageUrl": "assets/card-icons/李广.webp"
    },
    {
      "id": "zhangyu-0231",
      "name": "李广",
      "baseName": "李广",
      "faction": "Northern Realms",
      "factionDisplayName": "开国群雄",
      "category": "unit",
      "row": [
        "ranged"
      ],
      "rowDisplayName": "朝堂",
      "strength": 5,
      "abilities": [
        "Tight Bond"
      ],
      "abilityDisplayNames": [
        "同盟"
      ],
      "abilityText": "同盟",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 3,
      "copyLabel": "3 of 3",
      "imageUrl": "assets/card-icons/李广.webp"
    },
    {
      "id": "zhangyu-0232",
      "name": "白起",
      "baseName": "白起",
      "faction": "Northern Realms",
      "factionDisplayName": "开国群雄",
      "category": "hero",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 10,
      "abilities": [
        "Hero"
      ],
      "abilityDisplayNames": [
        "传世"
      ],
      "abilityText": "传世",
      "leaderAbility": "",
      "hero": true,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/白起.webp"
    },
    {
      "id": "zhangyu-0026",
      "name": "霍去病",
      "baseName": "霍去病",
      "faction": "Northern Realms",
      "factionDisplayName": "开国群雄",
      "category": "hero",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 10,
      "abilities": [
        "Hero"
      ],
      "abilityDisplayNames": [
        "传世"
      ],
      "abilityText": "传世",
      "leaderAbility": "",
      "hero": true,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/霍去病.webp"
    },
    {
      "id": "zhangyu-0233",
      "name": "长孙皇后",
      "baseName": "长孙皇后",
      "faction": "Northern Realms",
      "factionDisplayName": "开国群雄",
      "category": "hero",
      "row": [
        "ranged"
      ],
      "rowDisplayName": "朝堂",
      "strength": 10,
      "abilities": [
        "Hero"
      ],
      "abilityDisplayNames": [
        "传世"
      ],
      "abilityText": "传世",
      "leaderAbility": "",
      "hero": true,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/长孙皇后.webp"
    },
    {
      "id": "zhangyu-0234",
      "name": "马钧",
      "baseName": "马钧",
      "faction": "Northern Realms",
      "factionDisplayName": "开国群雄",
      "category": "unit",
      "row": [
        "siege"
      ],
      "rowDisplayName": "文脉",
      "strength": 6,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "无",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/马钧.webp"
    },
    {
      "id": "zhangyu-0053",
      "name": "陈平",
      "baseName": "陈平",
      "faction": "Northern Realms",
      "factionDisplayName": "开国群雄",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 4,
      "abilities": [
        "Spy"
      ],
      "abilityDisplayNames": [
        "出使"
      ],
      "abilityText": "出使",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/陈平.webp"
    },
    {
      "id": "zhangyu-0235",
      "name": "苏武",
      "baseName": "苏武",
      "faction": "Northern Realms",
      "factionDisplayName": "开国群雄",
      "category": "unit",
      "row": [
        "siege"
      ],
      "rowDisplayName": "文脉",
      "strength": 1,
      "abilities": [
        "Spy"
      ],
      "abilityDisplayNames": [
        "出使"
      ],
      "abilityText": "出使",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/苏武.webp"
    },
    {
      "id": "zhangyu-0036",
      "name": "卫青",
      "baseName": "卫青",
      "faction": "Northern Realms",
      "factionDisplayName": "开国群雄",
      "category": "hero",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 10,
      "abilities": [
        "Hero"
      ],
      "abilityDisplayNames": [
        "传世"
      ],
      "abilityText": "传世",
      "leaderAbility": "",
      "hero": true,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/卫青.webp"
    },
    {
      "id": "zhangyu-0236",
      "name": "谢道韫",
      "baseName": "谢道韫",
      "faction": "Northern Realms",
      "factionDisplayName": "开国群雄",
      "category": "unit",
      "row": [
        "ranged"
      ],
      "rowDisplayName": "朝堂",
      "strength": 5,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "无",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/谢道韫.webp"
    },
    {
      "id": "zhangyu-0084",
      "name": "申不害",
      "baseName": "申不害",
      "faction": "Nilfgaardian Empire",
      "factionDisplayName": "纵横权谋",
      "category": "unit",
      "row": [
        "ranged"
      ],
      "rowDisplayName": "朝堂",
      "strength": 2,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "无",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/韩非.webp"
    },
    {
      "id": "zhangyu-0051",
      "name": "吕不韦",
      "baseName": "吕不韦",
      "faction": "Nilfgaardian Empire",
      "factionDisplayName": "纵横权谋",
      "category": "unit",
      "row": [
        "ranged"
      ],
      "rowDisplayName": "朝堂",
      "strength": 6,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "无",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/吕不韦.webp"
    },
    {
      "id": "zhangyu-0237",
      "name": "廉颇",
      "baseName": "廉颇",
      "faction": "Nilfgaardian Empire",
      "factionDisplayName": "纵横权谋",
      "category": "unit",
      "row": [
        "ranged"
      ],
      "rowDisplayName": "朝堂",
      "strength": 10,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "无",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "1 of 2",
      "imageUrl": "assets/card-icons/廉颇.webp"
    },
    {
      "id": "zhangyu-0238",
      "name": "廉颇",
      "baseName": "廉颇",
      "faction": "Nilfgaardian Empire",
      "factionDisplayName": "纵横权谋",
      "category": "unit",
      "row": [
        "ranged"
      ],
      "rowDisplayName": "朝堂",
      "strength": 10,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "无",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 2,
      "copyLabel": "2 of 2",
      "imageUrl": "assets/card-icons/廉颇.webp"
    },
    {
      "id": "zhangyu-0052",
      "name": "李斯",
      "baseName": "李斯",
      "faction": "Nilfgaardian Empire",
      "factionDisplayName": "纵横权谋",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 6,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "无",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/李斯.webp"
    },
    {
      "id": "zhangyu-0239",
      "name": "吕雉",
      "baseName": "吕雉",
      "faction": "Nilfgaardian Empire",
      "factionDisplayName": "纵横权谋",
      "category": "unit",
      "row": [
        "ranged"
      ],
      "rowDisplayName": "朝堂",
      "strength": 4,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "无",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/吕雉.webp"
    },
    {
      "id": "zhangyu-0240",
      "name": "淳于意",
      "baseName": "淳于意",
      "faction": "Nilfgaardian Empire",
      "factionDisplayName": "纵横权谋",
      "category": "unit",
      "row": [
        "ranged"
      ],
      "rowDisplayName": "朝堂",
      "strength": 1,
      "abilities": [
        "Medic"
      ],
      "abilityDisplayNames": [
        "济世"
      ],
      "abilityText": "济世",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "1 of 2",
      "imageUrl": "assets/card-icons/淳于意.webp"
    },
    {
      "id": "zhangyu-0241",
      "name": "淳于意",
      "baseName": "淳于意",
      "faction": "Nilfgaardian Empire",
      "factionDisplayName": "纵横权谋",
      "category": "unit",
      "row": [
        "ranged"
      ],
      "rowDisplayName": "朝堂",
      "strength": 1,
      "abilities": [
        "Medic"
      ],
      "abilityDisplayNames": [
        "济世"
      ],
      "abilityText": "济世",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 2,
      "copyLabel": "2 of 2",
      "imageUrl": "assets/card-icons/淳于意.webp"
    },
    {
      "id": "zhangyu-0049",
      "name": "范雎",
      "baseName": "范雎",
      "faction": "Nilfgaardian Empire",
      "factionDisplayName": "纵横权谋",
      "category": "unit",
      "row": [
        "ranged"
      ],
      "rowDisplayName": "朝堂",
      "strength": 6,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "无",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/范雎.webp"
    },
    {
      "id": "zhangyu-0242",
      "name": "李冰",
      "baseName": "李冰",
      "faction": "Nilfgaardian Empire",
      "factionDisplayName": "纵横权谋",
      "category": "unit",
      "row": [
        "siege"
      ],
      "rowDisplayName": "文脉",
      "strength": 10,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "无",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/李冰.webp"
    },
    {
      "id": "zhangyu-0243",
      "name": "平原君",
      "baseName": "平原君",
      "faction": "Nilfgaardian Empire",
      "factionDisplayName": "纵横权谋",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 3,
      "abilities": [
        "Tight Bond"
      ],
      "abilityDisplayNames": [
        "同盟"
      ],
      "abilityText": "同盟",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "1 of 4",
      "imageUrl": "assets/card-icons/平原君.webp"
    },
    {
      "id": "zhangyu-0244",
      "name": "平原君",
      "baseName": "平原君",
      "faction": "Nilfgaardian Empire",
      "factionDisplayName": "纵横权谋",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 3,
      "abilities": [
        "Tight Bond"
      ],
      "abilityDisplayNames": [
        "同盟"
      ],
      "abilityText": "同盟",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 2,
      "copyLabel": "2 of 4",
      "imageUrl": "assets/card-icons/平原君.webp"
    },
    {
      "id": "zhangyu-0245",
      "name": "平原君",
      "baseName": "平原君",
      "faction": "Nilfgaardian Empire",
      "factionDisplayName": "纵横权谋",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 3,
      "abilities": [
        "Tight Bond"
      ],
      "abilityDisplayNames": [
        "同盟"
      ],
      "abilityText": "同盟",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 3,
      "copyLabel": "3 of 4",
      "imageUrl": "assets/card-icons/平原君.webp"
    },
    {
      "id": "zhangyu-0246",
      "name": "平原君",
      "baseName": "平原君",
      "faction": "Nilfgaardian Empire",
      "factionDisplayName": "纵横权谋",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 3,
      "abilities": [
        "Tight Bond"
      ],
      "abilityDisplayNames": [
        "同盟"
      ],
      "abilityText": "同盟",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 4,
      "copyLabel": "4 of 4",
      "imageUrl": "assets/card-icons/平原君.webp"
    },
    {
      "id": "zhangyu-0023",
      "name": "韩信",
      "baseName": "韩信",
      "faction": "Nilfgaardian Empire",
      "factionDisplayName": "纵横权谋",
      "category": "hero",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 10,
      "abilities": [
        "Hero"
      ],
      "abilityDisplayNames": [
        "传世"
      ],
      "abilityText": "传世",
      "leaderAbility": "",
      "hero": true,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/韩信.webp"
    },
    {
      "id": "zhangyu-0024",
      "name": "张良",
      "baseName": "张良",
      "faction": "Nilfgaardian Empire",
      "factionDisplayName": "纵横权谋",
      "category": "hero",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 10,
      "abilities": [
        "Hero",
        "Medic"
      ],
      "abilityDisplayNames": [
        "传世",
        "济世"
      ],
      "abilityText": "传世、济世",
      "leaderAbility": "",
      "hero": true,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/张良.webp"
    },
    {
      "id": "zhangyu-0247",
      "name": "庞涓",
      "baseName": "庞涓",
      "faction": "Nilfgaardian Empire",
      "factionDisplayName": "纵横权谋",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 3,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "无",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/庞涓.webp"
    },
    {
      "id": "zhangyu-0059",
      "name": "诸葛亮",
      "baseName": "诸葛亮",
      "faction": "Nilfgaardian Empire",
      "factionDisplayName": "纵横权谋",
      "category": "hero",
      "row": [
        "siege"
      ],
      "rowDisplayName": "文脉",
      "strength": 10,
      "abilities": [
        "Hero"
      ],
      "abilityDisplayNames": [
        "传世"
      ],
      "abilityText": "传世",
      "leaderAbility": "",
      "hero": true,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "cloud://po-ke-card-d0gg2ewaac3e700c4.706f-po-ke-card-d0gg2ewaac3e700c4-1302893388/po-ke-card/诸葛亮.webp"
    },
    {
      "id": "zhangyu-0248",
      "name": "毛遂",
      "baseName": "毛遂",
      "faction": "Nilfgaardian Empire",
      "factionDisplayName": "纵横权谋",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 2,
      "abilities": [
        "Tight Bond"
      ],
      "abilityDisplayNames": [
        "同盟"
      ],
      "abilityText": "同盟",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "1 of 3",
      "imageUrl": "assets/card-icons/毛遂.webp"
    },
    {
      "id": "zhangyu-0249",
      "name": "毛遂",
      "baseName": "毛遂",
      "faction": "Nilfgaardian Empire",
      "factionDisplayName": "纵横权谋",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 2,
      "abilities": [
        "Tight Bond"
      ],
      "abilityDisplayNames": [
        "同盟"
      ],
      "abilityText": "同盟",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 2,
      "copyLabel": "2 of 3",
      "imageUrl": "assets/card-icons/毛遂.webp"
    },
    {
      "id": "zhangyu-0250",
      "name": "毛遂",
      "baseName": "毛遂",
      "faction": "Nilfgaardian Empire",
      "factionDisplayName": "纵横权谋",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 2,
      "abilities": [
        "Tight Bond"
      ],
      "abilityDisplayNames": [
        "同盟"
      ],
      "abilityText": "同盟",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 3,
      "copyLabel": "3 of 3",
      "imageUrl": "assets/card-icons/毛遂.webp"
    },
    {
      "id": "zhangyu-0251",
      "name": "伍子胥",
      "baseName": "伍子胥",
      "faction": "Nilfgaardian Empire",
      "factionDisplayName": "纵横权谋",
      "category": "unit",
      "row": [
        "ranged"
      ],
      "rowDisplayName": "朝堂",
      "strength": 3,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "无",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/伍子胥.webp"
    },
    {
      "id": "zhangyu-0252",
      "name": "李牧",
      "baseName": "李牧",
      "faction": "Nilfgaardian Empire",
      "factionDisplayName": "纵横权谋",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 4,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "无",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/李牧.webp"
    },
    {
      "id": "zhangyu-0073",
      "name": "乐毅",
      "baseName": "乐毅",
      "faction": "Nilfgaardian Empire",
      "factionDisplayName": "纵横权谋",
      "category": "unit",
      "row": [
        "ranged"
      ],
      "rowDisplayName": "朝堂",
      "strength": 5,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "无",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/乐毅.webp"
    },
    {
      "id": "zhangyu-0253",
      "name": "郑国",
      "baseName": "郑国",
      "faction": "Nilfgaardian Empire",
      "factionDisplayName": "纵横权谋",
      "category": "unit",
      "row": [
        "siege"
      ],
      "rowDisplayName": "文脉",
      "strength": 3,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "无",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/郑国.webp"
    },
    {
      "id": "zhangyu-0254",
      "name": "赵高",
      "baseName": "赵高",
      "faction": "Nilfgaardian Empire",
      "factionDisplayName": "纵横权谋",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 7,
      "abilities": [
        "Spy"
      ],
      "abilityDisplayNames": [
        "出使"
      ],
      "abilityText": "出使",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/赵高.webp"
    },
    {
      "id": "zhangyu-0255",
      "name": "公输班",
      "baseName": "公输班",
      "faction": "Nilfgaardian Empire",
      "factionDisplayName": "纵横权谋",
      "category": "unit",
      "row": [
        "siege"
      ],
      "rowDisplayName": "文脉",
      "strength": 6,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "无",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/公输班.webp"
    },
    {
      "id": "zhangyu-0142",
      "name": "葛洪",
      "baseName": "葛洪",
      "faction": "Nilfgaardian Empire",
      "factionDisplayName": "纵横权谋",
      "category": "unit",
      "row": [
        "siege"
      ],
      "rowDisplayName": "文脉",
      "strength": 0,
      "abilities": [
        "Medic"
      ],
      "abilityDisplayNames": [
        "济世"
      ],
      "abilityText": "济世",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/李时珍.webp"
    },
    {
      "id": "zhangyu-0054",
      "name": "贾诩",
      "baseName": "贾诩",
      "faction": "Nilfgaardian Empire",
      "factionDisplayName": "纵横权谋",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 9,
      "abilities": [
        "Spy"
      ],
      "abilityDisplayNames": [
        "出使"
      ],
      "abilityText": "出使",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/贾诩.webp"
    },
    {
      "id": "zhangyu-0256",
      "name": "晏婴",
      "baseName": "晏婴",
      "faction": "Nilfgaardian Empire",
      "factionDisplayName": "纵横权谋",
      "category": "unit",
      "row": [
        "ranged"
      ],
      "rowDisplayName": "朝堂",
      "strength": 2,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "无",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/晏婴.webp"
    },
    {
      "id": "zhangyu-0055",
      "name": "曹丕",
      "baseName": "曹丕",
      "faction": "Nilfgaardian Empire",
      "factionDisplayName": "纵横权谋",
      "category": "hero",
      "row": [
        "ranged"
      ],
      "rowDisplayName": "朝堂",
      "strength": 10,
      "abilities": [
        "Hero"
      ],
      "abilityDisplayNames": [
        "传世"
      ],
      "abilityText": "传世",
      "leaderAbility": "",
      "hero": true,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "cloud://po-ke-card-d0gg2ewaac3e700c4.706f-po-ke-card-d0gg2ewaac3e700c4-1302893388/po-ke-card/曹丕.webp"
    },
    {
      "id": "zhangyu-0056",
      "name": "郭嘉",
      "baseName": "郭嘉",
      "faction": "Nilfgaardian Empire",
      "factionDisplayName": "纵横权谋",
      "category": "unit",
      "row": [
        "ranged"
      ],
      "rowDisplayName": "朝堂",
      "strength": 4,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "无",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "cloud://po-ke-card-d0gg2ewaac3e700c4.706f-po-ke-card-d0gg2ewaac3e700c4-1302893388/po-ke-card/郭嘉.webp"
    },
    {
      "id": "zhangyu-0047",
      "name": "苏秦",
      "baseName": "苏秦",
      "faction": "Nilfgaardian Empire",
      "factionDisplayName": "纵横权谋",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 4,
      "abilities": [
        "Spy"
      ],
      "abilityDisplayNames": [
        "出使"
      ],
      "abilityText": "出使",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/苏秦.webp"
    },
    {
      "id": "zhangyu-0257",
      "name": "项燕",
      "baseName": "项燕",
      "faction": "Nilfgaardian Empire",
      "factionDisplayName": "纵横权谋",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 2,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "无",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/项燕.webp"
    },
    {
      "id": "zhangyu-0075",
      "name": "蔺相如",
      "baseName": "蔺相如",
      "faction": "Nilfgaardian Empire",
      "factionDisplayName": "纵横权谋",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 5,
      "abilities": [
        "Tight Bond"
      ],
      "abilityDisplayNames": [
        "同盟"
      ],
      "abilityText": "同盟",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "1 of 2",
      "imageUrl": "assets/card-icons/蔺相如.webp"
    },
    {
      "id": "zhangyu-0258",
      "name": "蔺相如",
      "baseName": "蔺相如",
      "faction": "Nilfgaardian Empire",
      "factionDisplayName": "纵横权谋",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 5,
      "abilities": [
        "Tight Bond"
      ],
      "abilityDisplayNames": [
        "同盟"
      ],
      "abilityText": "同盟",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 2,
      "copyLabel": "2 of 2",
      "imageUrl": "assets/card-icons/蔺相如.webp"
    },
    {
      "id": "zhangyu-0050",
      "name": "范蠡",
      "baseName": "范蠡",
      "faction": "Nilfgaardian Empire",
      "factionDisplayName": "纵横权谋",
      "category": "unit",
      "row": [
        "siege"
      ],
      "rowDisplayName": "文脉",
      "strength": 5,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "无",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/范蠡.webp"
    },
    {
      "id": "zhangyu-0101",
      "name": "苏轼",
      "baseName": "苏轼",
      "faction": "Scoia'tael",
      "factionDisplayName": "百家争鸣",
      "category": "unit",
      "row": [
        "melee",
        "ranged"
      ],
      "rowDisplayName": "疆场 / 朝堂",
      "strength": 6,
      "abilities": [
        "Agile"
      ],
      "abilityDisplayNames": [
        "通才"
      ],
      "abilityText": "通才",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/苏轼.webp"
    },
    {
      "id": "zhangyu-0259",
      "name": "公孙龙",
      "baseName": "公孙龙",
      "faction": "Scoia'tael",
      "factionDisplayName": "百家争鸣",
      "category": "unit",
      "row": [
        "melee",
        "ranged"
      ],
      "rowDisplayName": "疆场 / 朝堂",
      "strength": 3,
      "abilities": [
        "Agile"
      ],
      "abilityDisplayNames": [
        "通才"
      ],
      "abilityText": "通才",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/公孙龙.webp"
    },
    {
      "id": "zhangyu-0011",
      "name": "墨子",
      "baseName": "墨子",
      "faction": "Scoia'tael",
      "factionDisplayName": "百家争鸣",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 6,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "无",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/墨子.webp"
    },
    {
      "id": "zhangyu-0260",
      "name": "邹衍",
      "baseName": "邹衍",
      "faction": "Scoia'tael",
      "factionDisplayName": "百家争鸣",
      "category": "unit",
      "row": [
        "ranged"
      ],
      "rowDisplayName": "朝堂",
      "strength": 4,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "无",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/邹衍.webp"
    },
    {
      "id": "zhangyu-0079",
      "name": "孟子",
      "baseName": "孟子",
      "faction": "Scoia'tael",
      "factionDisplayName": "百家争鸣",
      "category": "unit",
      "row": [
        "melee",
        "ranged"
      ],
      "rowDisplayName": "疆场 / 朝堂",
      "strength": 6,
      "abilities": [
        "Agile"
      ],
      "abilityDisplayNames": [
        "通才"
      ],
      "abilityText": "通才",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "1 of 3",
      "imageUrl": "assets/card-icons/孟子.webp"
    },
    {
      "id": "zhangyu-0261",
      "name": "孟子",
      "baseName": "孟子",
      "faction": "Scoia'tael",
      "factionDisplayName": "百家争鸣",
      "category": "unit",
      "row": [
        "melee",
        "ranged"
      ],
      "rowDisplayName": "疆场 / 朝堂",
      "strength": 6,
      "abilities": [
        "Agile"
      ],
      "abilityDisplayNames": [
        "通才"
      ],
      "abilityText": "通才",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 2,
      "copyLabel": "2 of 3",
      "imageUrl": "assets/card-icons/孟子.webp"
    },
    {
      "id": "zhangyu-0262",
      "name": "孟子",
      "baseName": "孟子",
      "faction": "Scoia'tael",
      "factionDisplayName": "百家争鸣",
      "category": "unit",
      "row": [
        "melee",
        "ranged"
      ],
      "rowDisplayName": "疆场 / 朝堂",
      "strength": 6,
      "abilities": [
        "Agile"
      ],
      "abilityDisplayNames": [
        "通才"
      ],
      "abilityText": "通才",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 3,
      "copyLabel": "3 of 3",
      "imageUrl": "assets/card-icons/孟子.webp"
    },
    {
      "id": "zhangyu-0263",
      "name": "子路",
      "baseName": "子路",
      "faction": "Scoia'tael",
      "factionDisplayName": "百家争鸣",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 3,
      "abilities": [
        "Muster"
      ],
      "abilityDisplayNames": [
        "集贤"
      ],
      "abilityText": "集贤：打出后从牌库中立即打出所有同名牌。",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "1 of 3",
      "imageUrl": "assets/card-icons/子路.webp"
    },
    {
      "id": "zhangyu-0264",
      "name": "子路",
      "baseName": "子路",
      "faction": "Scoia'tael",
      "factionDisplayName": "百家争鸣",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 3,
      "abilities": [
        "Muster"
      ],
      "abilityDisplayNames": [
        "集贤"
      ],
      "abilityText": "集贤：打出后从牌库中立即打出所有同名牌。",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 2,
      "copyLabel": "2 of 3",
      "imageUrl": "assets/card-icons/子路.webp"
    },
    {
      "id": "zhangyu-0265",
      "name": "子路",
      "baseName": "子路",
      "faction": "Scoia'tael",
      "factionDisplayName": "百家争鸣",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 3,
      "abilities": [
        "Muster"
      ],
      "abilityDisplayNames": [
        "集贤"
      ],
      "abilityText": "集贤：打出后从牌库中立即打出所有同名牌。",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 3,
      "copyLabel": "3 of 3",
      "imageUrl": "assets/card-icons/子路.webp"
    },
    {
      "id": "zhangyu-0099",
      "name": "李白",
      "baseName": "李白",
      "faction": "Scoia'tael",
      "factionDisplayName": "百家争鸣",
      "category": "hero",
      "row": [
        "ranged"
      ],
      "rowDisplayName": "朝堂",
      "strength": 10,
      "abilities": [
        "Hero"
      ],
      "abilityDisplayNames": [
        "传世"
      ],
      "abilityText": "传世",
      "leaderAbility": "",
      "hero": true,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/李白.webp"
    },
    {
      "id": "zhangyu-0266",
      "name": "阮籍",
      "baseName": "阮籍",
      "faction": "Scoia'tael",
      "factionDisplayName": "百家争鸣",
      "category": "unit",
      "row": [
        "ranged"
      ],
      "rowDisplayName": "朝堂",
      "strength": 2,
      "abilities": [
        "Muster"
      ],
      "abilityDisplayNames": [
        "集贤"
      ],
      "abilityText": "集贤：打出后从牌库中立即打出所有同名牌。",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "1 of 3",
      "imageUrl": "assets/card-icons/阮籍.webp"
    },
    {
      "id": "zhangyu-0267",
      "name": "阮籍",
      "baseName": "阮籍",
      "faction": "Scoia'tael",
      "factionDisplayName": "百家争鸣",
      "category": "unit",
      "row": [
        "ranged"
      ],
      "rowDisplayName": "朝堂",
      "strength": 2,
      "abilities": [
        "Muster"
      ],
      "abilityDisplayNames": [
        "集贤"
      ],
      "abilityText": "集贤：打出后从牌库中立即打出所有同名牌。",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 2,
      "copyLabel": "2 of 3",
      "imageUrl": "assets/card-icons/阮籍.webp"
    },
    {
      "id": "zhangyu-0268",
      "name": "阮籍",
      "baseName": "阮籍",
      "faction": "Scoia'tael",
      "factionDisplayName": "百家争鸣",
      "category": "unit",
      "row": [
        "ranged"
      ],
      "rowDisplayName": "朝堂",
      "strength": 2,
      "abilities": [
        "Muster"
      ],
      "abilityDisplayNames": [
        "集贤"
      ],
      "abilityText": "集贤：打出后从牌库中立即打出所有同名牌。",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 3,
      "copyLabel": "3 of 3",
      "imageUrl": "assets/card-icons/阮籍.webp"
    },
    {
      "id": "zhangyu-0082",
      "name": "庄子",
      "baseName": "庄子",
      "faction": "Scoia'tael",
      "factionDisplayName": "百家争鸣",
      "category": "unit",
      "row": [
        "melee",
        "ranged"
      ],
      "rowDisplayName": "疆场 / 朝堂",
      "strength": 6,
      "abilities": [
        "Agile"
      ],
      "abilityDisplayNames": [
        "通才"
      ],
      "abilityText": "通才",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/庄子.webp"
    },
    {
      "id": "zhangyu-0144",
      "name": "张仲景",
      "baseName": "张仲景",
      "faction": "Scoia'tael",
      "factionDisplayName": "百家争鸣",
      "category": "unit",
      "row": [
        "ranged"
      ],
      "rowDisplayName": "朝堂",
      "strength": 0,
      "abilities": [
        "Medic"
      ],
      "abilityDisplayNames": [
        "济世"
      ],
      "abilityText": "济世",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "1 of 3",
      "imageUrl": "assets/card-icons/张仲景.webp"
    },
    {
      "id": "zhangyu-0269",
      "name": "张仲景",
      "baseName": "张仲景",
      "faction": "Scoia'tael",
      "factionDisplayName": "百家争鸣",
      "category": "unit",
      "row": [
        "ranged"
      ],
      "rowDisplayName": "朝堂",
      "strength": 0,
      "abilities": [
        "Medic"
      ],
      "abilityDisplayNames": [
        "济世"
      ],
      "abilityText": "济世",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 2,
      "copyLabel": "2 of 3",
      "imageUrl": "assets/card-icons/张仲景.webp"
    },
    {
      "id": "zhangyu-0270",
      "name": "张仲景",
      "baseName": "张仲景",
      "faction": "Scoia'tael",
      "factionDisplayName": "百家争鸣",
      "category": "unit",
      "row": [
        "ranged"
      ],
      "rowDisplayName": "朝堂",
      "strength": 0,
      "abilities": [
        "Medic"
      ],
      "abilityDisplayNames": [
        "济世"
      ],
      "abilityText": "济世",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 3,
      "copyLabel": "3 of 3",
      "imageUrl": "assets/card-icons/张仲景.webp"
    },
    {
      "id": "zhangyu-0271",
      "name": "子贡",
      "baseName": "子贡",
      "faction": "Scoia'tael",
      "factionDisplayName": "百家争鸣",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 5,
      "abilities": [
        "Muster"
      ],
      "abilityDisplayNames": [
        "集贤"
      ],
      "abilityText": "集贤：打出后从牌库中立即打出所有同名牌。",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "1 of 3",
      "imageUrl": "assets/card-icons/子贡.webp"
    },
    {
      "id": "zhangyu-0272",
      "name": "子贡",
      "baseName": "子贡",
      "faction": "Scoia'tael",
      "factionDisplayName": "百家争鸣",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 5,
      "abilities": [
        "Muster"
      ],
      "abilityDisplayNames": [
        "集贤"
      ],
      "abilityText": "集贤：打出后从牌库中立即打出所有同名牌。",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 2,
      "copyLabel": "2 of 3",
      "imageUrl": "assets/card-icons/子贡.webp"
    },
    {
      "id": "zhangyu-0273",
      "name": "子贡",
      "baseName": "子贡",
      "faction": "Scoia'tael",
      "factionDisplayName": "百家争鸣",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 5,
      "abilities": [
        "Muster"
      ],
      "abilityDisplayNames": [
        "集贤"
      ],
      "abilityText": "集贤：打出后从牌库中立即打出所有同名牌。",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 3,
      "copyLabel": "3 of 3",
      "imageUrl": "assets/card-icons/子贡.webp"
    },
    {
      "id": "zhangyu-0274",
      "name": "蔡文姬",
      "baseName": "蔡文姬",
      "faction": "Scoia'tael",
      "factionDisplayName": "百家争鸣",
      "category": "unit",
      "row": [
        "ranged"
      ],
      "rowDisplayName": "朝堂",
      "strength": 6,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "无",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/蔡文姬.webp"
    },
    {
      "id": "zhangyu-0086",
      "name": "孙子",
      "baseName": "孙子",
      "faction": "Scoia'tael",
      "factionDisplayName": "百家争鸣",
      "category": "hero",
      "row": [
        "ranged"
      ],
      "rowDisplayName": "朝堂",
      "strength": 10,
      "abilities": [
        "Hero"
      ],
      "abilityDisplayNames": [
        "传世"
      ],
      "abilityText": "传世",
      "leaderAbility": "",
      "hero": true,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/孙子.webp"
    },
    {
      "id": "zhangyu-0012",
      "name": "韩非",
      "baseName": "韩非",
      "faction": "Scoia'tael",
      "factionDisplayName": "百家争鸣",
      "category": "hero",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 10,
      "abilities": [
        "Hero",
        "Morale Boost"
      ],
      "abilityDisplayNames": [
        "传世",
        "振势"
      ],
      "abilityText": "传世、振势",
      "leaderAbility": "",
      "hero": true,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/韩非.webp"
    },
    {
      "id": "zhangyu-0275",
      "name": "曾子",
      "baseName": "曾子",
      "faction": "Scoia'tael",
      "factionDisplayName": "百家争鸣",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 5,
      "abilities": [
        "Muster"
      ],
      "abilityDisplayNames": [
        "集贤"
      ],
      "abilityText": "集贤：打出后从牌库中立即打出所有同名牌。",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "1 of 5",
      "imageUrl": "assets/card-icons/曾子.webp"
    },
    {
      "id": "zhangyu-0276",
      "name": "曾子",
      "baseName": "曾子",
      "faction": "Scoia'tael",
      "factionDisplayName": "百家争鸣",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 5,
      "abilities": [
        "Muster"
      ],
      "abilityDisplayNames": [
        "集贤"
      ],
      "abilityText": "集贤：打出后从牌库中立即打出所有同名牌。",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 2,
      "copyLabel": "2 of 5",
      "imageUrl": "assets/card-icons/曾子.webp"
    },
    {
      "id": "zhangyu-0277",
      "name": "曾子",
      "baseName": "曾子",
      "faction": "Scoia'tael",
      "factionDisplayName": "百家争鸣",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 5,
      "abilities": [
        "Muster"
      ],
      "abilityDisplayNames": [
        "集贤"
      ],
      "abilityText": "集贤：打出后从牌库中立即打出所有同名牌。",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 3,
      "copyLabel": "3 of 5",
      "imageUrl": "assets/card-icons/曾子.webp"
    },
    {
      "id": "zhangyu-0278",
      "name": "曾子",
      "baseName": "曾子",
      "faction": "Scoia'tael",
      "factionDisplayName": "百家争鸣",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 5,
      "abilities": [
        "Muster"
      ],
      "abilityDisplayNames": [
        "集贤"
      ],
      "abilityText": "集贤：打出后从牌库中立即打出所有同名牌。",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 4,
      "copyLabel": "4 of 5",
      "imageUrl": "assets/card-icons/曾子.webp"
    },
    {
      "id": "zhangyu-0279",
      "name": "曾子",
      "baseName": "曾子",
      "faction": "Scoia'tael",
      "factionDisplayName": "百家争鸣",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 5,
      "abilities": [
        "Muster"
      ],
      "abilityDisplayNames": [
        "集贤"
      ],
      "abilityText": "集贤：打出后从牌库中立即打出所有同名牌。",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 5,
      "copyLabel": "5 of 5",
      "imageUrl": "assets/card-icons/曾子.webp"
    },
    {
      "id": "zhangyu-0100",
      "name": "杜甫",
      "baseName": "杜甫",
      "faction": "Scoia'tael",
      "factionDisplayName": "百家争鸣",
      "category": "unit",
      "row": [
        "ranged"
      ],
      "rowDisplayName": "朝堂",
      "strength": 10,
      "abilities": [
        "Morale Boost"
      ],
      "abilityDisplayNames": [
        "振势"
      ],
      "abilityText": "振势",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/杜甫.webp"
    },
    {
      "id": "zhangyu-0081",
      "name": "列子",
      "baseName": "列子",
      "faction": "Scoia'tael",
      "factionDisplayName": "百家争鸣",
      "category": "unit",
      "row": [
        "ranged"
      ],
      "rowDisplayName": "朝堂",
      "strength": 1,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "无",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/老子.webp"
    },
    {
      "id": "zhangyu-0088",
      "name": "王阳明",
      "baseName": "王阳明",
      "faction": "Scoia'tael",
      "factionDisplayName": "百家争鸣",
      "category": "hero",
      "row": [
        "ranged"
      ],
      "rowDisplayName": "朝堂",
      "strength": 10,
      "abilities": [
        "Hero"
      ],
      "abilityDisplayNames": [
        "传世"
      ],
      "abilityText": "传世",
      "leaderAbility": "",
      "hero": true,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/王阳明.webp"
    },
    {
      "id": "zhangyu-0080",
      "name": "荀子",
      "baseName": "荀子",
      "faction": "Scoia'tael",
      "factionDisplayName": "百家争鸣",
      "category": "unit",
      "row": [
        "ranged"
      ],
      "rowDisplayName": "朝堂",
      "strength": 2,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "无",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/荀子.webp"
    },
    {
      "id": "zhangyu-0089",
      "name": "朱熹",
      "baseName": "朱熹",
      "faction": "Scoia'tael",
      "factionDisplayName": "百家争鸣",
      "category": "unit",
      "row": [
        "ranged"
      ],
      "rowDisplayName": "朝堂",
      "strength": 4,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "无",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/朱熹.webp"
    },
    {
      "id": "zhangyu-0104",
      "name": "顾炎武",
      "baseName": "顾炎武",
      "faction": "Scoia'tael",
      "factionDisplayName": "百家争鸣",
      "category": "unit",
      "row": [
        "melee",
        "ranged"
      ],
      "rowDisplayName": "疆场 / 朝堂",
      "strength": 5,
      "abilities": [
        "Agile"
      ],
      "abilityDisplayNames": [
        "通才"
      ],
      "abilityText": "通才",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "1 of 2",
      "imageUrl": "assets/card-icons/顾炎武.webp"
    },
    {
      "id": "zhangyu-0280",
      "name": "顾炎武",
      "baseName": "顾炎武",
      "faction": "Scoia'tael",
      "factionDisplayName": "百家争鸣",
      "category": "unit",
      "row": [
        "melee",
        "ranged"
      ],
      "rowDisplayName": "疆场 / 朝堂",
      "strength": 5,
      "abilities": [
        "Agile"
      ],
      "abilityDisplayNames": [
        "通才"
      ],
      "abilityText": "通才",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 2,
      "copyLabel": "2 of 2",
      "imageUrl": "assets/card-icons/顾炎武.webp"
    },
    {
      "id": "zhangyu-0078",
      "name": "颜回",
      "baseName": "颜回",
      "faction": "Scoia'tael",
      "factionDisplayName": "百家争鸣",
      "category": "unit",
      "row": [
        "melee",
        "ranged"
      ],
      "rowDisplayName": "疆场 / 朝堂",
      "strength": 6,
      "abilities": [
        "Agile"
      ],
      "abilityDisplayNames": [
        "通才"
      ],
      "abilityText": "通才",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/孔子.webp"
    },
    {
      "id": "zhangyu-0085",
      "name": "商鞅",
      "baseName": "商鞅",
      "faction": "Scoia'tael",
      "factionDisplayName": "百家争鸣",
      "category": "unit",
      "row": [
        "siege"
      ],
      "rowDisplayName": "文脉",
      "strength": 8,
      "abilities": [
        "Scorch"
      ],
      "abilityDisplayNames": [
        "奇策"
      ],
      "abilityText": "奇策：若对方文脉总战力达到 10 或以上，摧毁其文脉当前战力最高的非传世人物。",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/商鞅.webp"
    },
    {
      "id": "zhangyu-0281",
      "name": "程咬金",
      "baseName": "程咬金",
      "faction": "Monsters",
      "factionDisplayName": "草莽星火",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 4,
      "abilities": [
        "Muster"
      ],
      "abilityDisplayNames": [
        "集贤"
      ],
      "abilityText": "集贤：打出后从牌库中立即打出所有同名牌。",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "1 of 3",
      "imageUrl": "assets/card-icons/程咬金.webp"
    },
    {
      "id": "zhangyu-0282",
      "name": "程咬金",
      "baseName": "程咬金",
      "faction": "Monsters",
      "factionDisplayName": "草莽星火",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 4,
      "abilities": [
        "Muster"
      ],
      "abilityDisplayNames": [
        "集贤"
      ],
      "abilityText": "集贤：打出后从牌库中立即打出所有同名牌。",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 2,
      "copyLabel": "2 of 3",
      "imageUrl": "assets/card-icons/程咬金.webp"
    },
    {
      "id": "zhangyu-0283",
      "name": "程咬金",
      "baseName": "程咬金",
      "faction": "Monsters",
      "factionDisplayName": "草莽星火",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 4,
      "abilities": [
        "Muster"
      ],
      "abilityDisplayNames": [
        "集贤"
      ],
      "abilityText": "集贤：打出后从牌库中立即打出所有同名牌。",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 3,
      "copyLabel": "3 of 3",
      "imageUrl": "assets/card-icons/程咬金.webp"
    },
    {
      "id": "zhangyu-0284",
      "name": "李密",
      "baseName": "李密",
      "faction": "Monsters",
      "factionDisplayName": "草莽星火",
      "category": "unit",
      "row": [
        "siege"
      ],
      "rowDisplayName": "文脉",
      "strength": 6,
      "abilities": [
        "Muster"
      ],
      "abilityDisplayNames": [
        "集贤"
      ],
      "abilityText": "集贤：打出后从牌库中立即打出所有程咬金。",
      "musterTarget": "程咬金",
      "musterTargetDisplayName": "程咬金",
      "musterTargetOneWay": true,
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/李密.webp"
    },
    {
      "id": "zhangyu-0285",
      "name": "刘禅",
      "baseName": "刘禅",
      "faction": "Monsters",
      "factionDisplayName": "草莽星火",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 4,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "无",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/刘禅.webp"
    },
    {
      "id": "zhangyu-0286",
      "name": "孙尚香",
      "baseName": "孙尚香",
      "faction": "Monsters",
      "factionDisplayName": "草莽星火",
      "category": "unit",
      "row": [
        "melee",
        "ranged"
      ],
      "rowDisplayName": "疆场 / 朝堂",
      "strength": 2,
      "abilities": [
        "Agile"
      ],
      "abilityDisplayNames": [
        "通才"
      ],
      "abilityText": "通才",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/孙尚香.webp"
    },
    {
      "id": "zhangyu-0287",
      "name": "唐赛儿",
      "baseName": "唐赛儿",
      "faction": "Monsters",
      "factionDisplayName": "草莽星火",
      "category": "unit",
      "row": [
        "ranged"
      ],
      "rowDisplayName": "朝堂",
      "strength": 2,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "无",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/唐赛儿.webp"
    },
    {
      "id": "zhangyu-0111",
      "name": "关羽",
      "baseName": "关羽",
      "faction": "Monsters",
      "factionDisplayName": "草莽星火",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 6,
      "abilities": [
        "Muster"
      ],
      "abilityDisplayNames": [
        "集贤"
      ],
      "abilityText": "集贤：打出后从牌库中立即打出刘备、关羽、张飞中的同组关联牌。",
      "musterGroup": "taoyuan-brothers",
      "musterGroupDisplayName": "桃园三杰",
      "musterGroupMembers": [
        "刘备",
        "关羽",
        "张飞"
      ],
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/关羽.webp"
    },
    {
      "id": "zhangyu-0112",
      "name": "张飞",
      "baseName": "张飞",
      "faction": "Monsters",
      "factionDisplayName": "草莽星火",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 6,
      "abilities": [
        "Muster"
      ],
      "abilityDisplayNames": [
        "集贤"
      ],
      "abilityText": "集贤：打出后从牌库中立即打出刘备、关羽、张飞中的同组关联牌。",
      "musterGroup": "taoyuan-brothers",
      "musterGroupDisplayName": "桃园三杰",
      "musterGroupMembers": [
        "刘备",
        "关羽",
        "张飞"
      ],
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "cloud://po-ke-card-d0gg2ewaac3e700c4.706f-po-ke-card-d0gg2ewaac3e700c4-1302893388/po-ke-card/张飞.webp"
    },
    {
      "id": "zhangyu-0113",
      "name": "刘备",
      "baseName": "刘备",
      "faction": "Monsters",
      "factionDisplayName": "草莽星火",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 6,
      "abilities": [
        "Muster"
      ],
      "abilityDisplayNames": [
        "集贤"
      ],
      "abilityText": "集贤：打出后从牌库中立即打出刘备、关羽、张飞中的同组关联牌。",
      "musterGroup": "taoyuan-brothers",
      "musterGroupDisplayName": "桃园三杰",
      "musterGroupMembers": [
        "刘备",
        "关羽",
        "张飞"
      ],
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/刘备.webp"
    },
    {
      "id": "zhangyu-0107",
      "name": "英布",
      "baseName": "英布",
      "faction": "Monsters",
      "factionDisplayName": "草莽星火",
      "category": "hero",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 10,
      "abilities": [
        "Hero"
      ],
      "abilityDisplayNames": [
        "传世"
      ],
      "abilityText": "传世",
      "leaderAbility": "",
      "hero": true,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/项羽.webp"
    },
    {
      "id": "zhangyu-0288",
      "name": "李春",
      "baseName": "李春",
      "faction": "Monsters",
      "factionDisplayName": "草莽星火",
      "category": "unit",
      "row": [
        "siege"
      ],
      "rowDisplayName": "文脉",
      "strength": 6,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "无",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/李春.webp"
    },
    {
      "id": "zhangyu-0289",
      "name": "宋江",
      "baseName": "宋江",
      "faction": "Monsters",
      "factionDisplayName": "草莽星火",
      "category": "unit",
      "row": [
        "ranged"
      ],
      "rowDisplayName": "朝堂",
      "strength": 2,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "无",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/宋江.webp"
    },
    {
      "id": "zhangyu-0290",
      "name": "典韦",
      "baseName": "典韦",
      "faction": "Monsters",
      "factionDisplayName": "草莽星火",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 6,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "无",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/典韦.webp"
    },
    {
      "id": "zhangyu-0060",
      "name": "周瑜",
      "baseName": "周瑜",
      "faction": "Monsters",
      "factionDisplayName": "草莽星火",
      "category": "unit",
      "row": [
        "siege"
      ],
      "rowDisplayName": "文脉",
      "strength": 6,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "无",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "cloud://po-ke-card-d0gg2ewaac3e700c4.706f-po-ke-card-d0gg2ewaac3e700c4-1302893388/po-ke-card/周瑜.webp"
    },
    {
      "id": "zhangyu-0108",
      "name": "葛婴",
      "baseName": "葛婴",
      "faction": "Monsters",
      "factionDisplayName": "草莽星火",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 2,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "无",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/陈胜.webp"
    },
    {
      "id": "zhangyu-0291",
      "name": "常遇春",
      "baseName": "常遇春",
      "faction": "Monsters",
      "factionDisplayName": "草莽星火",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 5,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "无",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/常遇春.webp"
    },
    {
      "id": "zhangyu-0292",
      "name": "杨再兴",
      "baseName": "杨再兴",
      "faction": "Monsters",
      "factionDisplayName": "草莽星火",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 5,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "无",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/杨再兴.webp"
    },
    {
      "id": "zhangyu-0133",
      "name": "陆秀夫",
      "baseName": "陆秀夫",
      "faction": "Monsters",
      "factionDisplayName": "草莽星火",
      "category": "unit",
      "row": [
        "ranged"
      ],
      "rowDisplayName": "朝堂",
      "strength": 2,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "无",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/陆秀夫.webp"
    },
    {
      "id": "zhangyu-0120",
      "name": "张角",
      "baseName": "张角",
      "faction": "Monsters",
      "factionDisplayName": "草莽星火",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 1,
      "abilities": [
        "Muster"
      ],
      "abilityDisplayNames": [
        "集贤"
      ],
      "abilityText": "集贤：打出后从牌库中立即打出所有同名牌。",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "1 of 3",
      "imageUrl": "assets/card-icons/张角.webp"
    },
    {
      "id": "zhangyu-0293",
      "name": "张角",
      "baseName": "张角",
      "faction": "Monsters",
      "factionDisplayName": "草莽星火",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 1,
      "abilities": [
        "Muster"
      ],
      "abilityDisplayNames": [
        "集贤"
      ],
      "abilityText": "集贤：打出后从牌库中立即打出所有同名牌。",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 2,
      "copyLabel": "2 of 3",
      "imageUrl": "assets/card-icons/张角.webp"
    },
    {
      "id": "zhangyu-0294",
      "name": "张角",
      "baseName": "张角",
      "faction": "Monsters",
      "factionDisplayName": "草莽星火",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 1,
      "abilities": [
        "Muster"
      ],
      "abilityDisplayNames": [
        "集贤"
      ],
      "abilityText": "集贤：打出后从牌库中立即打出所有同名牌。",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 3,
      "copyLabel": "3 of 3",
      "imageUrl": "assets/card-icons/张角.webp"
    },
    {
      "id": "zhangyu-0295",
      "name": "冼夫人",
      "baseName": "冼夫人",
      "faction": "Monsters",
      "factionDisplayName": "草莽星火",
      "category": "unit",
      "row": [
        "ranged"
      ],
      "rowDisplayName": "朝堂",
      "strength": 5,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "无",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/冼夫人.webp"
    },
    {
      "id": "zhangyu-0296",
      "name": "马超",
      "baseName": "马超",
      "faction": "Monsters",
      "factionDisplayName": "草莽星火",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 5,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "无",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/马超.webp"
    },
    {
      "id": "zhangyu-0115",
      "name": "梁红玉",
      "baseName": "梁红玉",
      "faction": "Monsters",
      "factionDisplayName": "草莽星火",
      "category": "unit",
      "row": [
        "melee",
        "ranged"
      ],
      "rowDisplayName": "疆场 / 朝堂",
      "strength": 2,
      "abilities": [
        "Agile"
      ],
      "abilityDisplayNames": [
        "通才"
      ],
      "abilityText": "通才",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/梁红玉.webp"
    },
    {
      "id": "zhangyu-0297",
      "name": "桓温",
      "baseName": "桓温",
      "faction": "Monsters",
      "factionDisplayName": "草莽星火",
      "category": "unit",
      "row": [
        "siege"
      ],
      "rowDisplayName": "文脉",
      "strength": 5,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "无",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/桓温.webp"
    },
    {
      "id": "zhangyu-0013",
      "name": "项羽",
      "baseName": "项羽",
      "faction": "Monsters",
      "factionDisplayName": "草莽星火",
      "category": "hero",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 10,
      "abilities": [
        "Hero"
      ],
      "abilityDisplayNames": [
        "传世"
      ],
      "abilityText": "传世",
      "leaderAbility": "",
      "hero": true,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/项羽.webp"
    },
    {
      "id": "zhangyu-0042",
      "name": "郑成功",
      "baseName": "郑成功",
      "faction": "Monsters",
      "factionDisplayName": "草莽星火",
      "category": "hero",
      "row": [
        "melee",
        "ranged"
      ],
      "rowDisplayName": "疆场 / 朝堂",
      "strength": 8,
      "abilities": [
        "Hero",
        "Morale Boost",
        "Agile"
      ],
      "abilityDisplayNames": [
        "传世",
        "振势",
        "通才"
      ],
      "abilityText": "传世、振势、通才",
      "leaderAbility": "",
      "hero": true,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/郑成功.webp"
    },
    {
      "id": "zhangyu-0298",
      "name": "赵云",
      "baseName": "赵云",
      "faction": "Monsters",
      "factionDisplayName": "草莽星火",
      "category": "hero",
      "row": [
        "ranged"
      ],
      "rowDisplayName": "朝堂",
      "strength": 10,
      "abilities": [
        "Hero"
      ],
      "abilityDisplayNames": [
        "传世"
      ],
      "abilityText": "传世",
      "leaderAbility": "",
      "hero": true,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/赵云.webp"
    },
    {
      "id": "zhangyu-0299",
      "name": "张宝",
      "baseName": "张宝",
      "faction": "Monsters",
      "factionDisplayName": "草莽星火",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 2,
      "abilities": [
        "Muster"
      ],
      "abilityDisplayNames": [
        "集贤"
      ],
      "abilityText": "集贤：打出后从牌库中立即打出所有同名牌。",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "1 of 3",
      "imageUrl": "assets/card-icons/张宝.webp"
    },
    {
      "id": "zhangyu-0300",
      "name": "张宝",
      "baseName": "张宝",
      "faction": "Monsters",
      "factionDisplayName": "草莽星火",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 2,
      "abilities": [
        "Muster"
      ],
      "abilityDisplayNames": [
        "集贤"
      ],
      "abilityText": "集贤：打出后从牌库中立即打出所有同名牌。",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 2,
      "copyLabel": "2 of 3",
      "imageUrl": "assets/card-icons/张宝.webp"
    },
    {
      "id": "zhangyu-0301",
      "name": "张宝",
      "baseName": "张宝",
      "faction": "Monsters",
      "factionDisplayName": "草莽星火",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 2,
      "abilities": [
        "Muster"
      ],
      "abilityDisplayNames": [
        "集贤"
      ],
      "abilityText": "集贤：打出后从牌库中立即打出所有同名牌。",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 3,
      "copyLabel": "3 of 3",
      "imageUrl": "assets/card-icons/张宝.webp"
    },
    {
      "id": "zhangyu-0302",
      "name": "吕母",
      "baseName": "吕母",
      "faction": "Monsters",
      "factionDisplayName": "草莽星火",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 5,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "无",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/吕母.webp"
    },
    {
      "id": "zhangyu-0015",
      "name": "陈胜",
      "baseName": "陈胜",
      "faction": "Monsters",
      "factionDisplayName": "草莽星火",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 4,
      "abilities": [
        "Muster"
      ],
      "abilityDisplayNames": [
        "集贤"
      ],
      "abilityText": "集贤：打出后从牌库中立即打出星火五雄的同组关联牌（陈胜、吴广、彭越、项梁、刘秀）。",
      "musterGroup": "xinghuo-five",
      "musterGroupDisplayName": "星火五雄",
      "musterGroupMembers": [
        "陈胜",
        "吴广",
        "彭越",
        "项梁",
        "刘秀"
      ],
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/陈胜.webp"
    },
    {
      "id": "zhangyu-0109",
      "name": "吴广",
      "baseName": "吴广",
      "faction": "Monsters",
      "factionDisplayName": "草莽星火",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 4,
      "abilities": [
        "Muster"
      ],
      "abilityDisplayNames": [
        "集贤"
      ],
      "abilityText": "集贤：打出后从牌库中立即打出星火五雄的同组关联牌（陈胜、吴广、彭越、项梁、刘秀）。",
      "musterGroup": "xinghuo-five",
      "musterGroupDisplayName": "星火五雄",
      "musterGroupMembers": [
        "陈胜",
        "吴广",
        "彭越",
        "项梁",
        "刘秀"
      ],
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/吴广.webp"
    },
    {
      "id": "zhangyu-0303",
      "name": "彭越",
      "baseName": "彭越",
      "faction": "Monsters",
      "factionDisplayName": "草莽星火",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 4,
      "abilities": [
        "Muster"
      ],
      "abilityDisplayNames": [
        "集贤"
      ],
      "abilityText": "集贤：打出后从牌库中立即打出星火五雄的同组关联牌（陈胜、吴广、彭越、项梁、刘秀）。",
      "musterGroup": "xinghuo-five",
      "musterGroupDisplayName": "星火五雄",
      "musterGroupMembers": [
        "陈胜",
        "吴广",
        "彭越",
        "项梁",
        "刘秀"
      ],
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/彭越.webp"
    },
    {
      "id": "zhangyu-0304",
      "name": "项梁",
      "baseName": "项梁",
      "faction": "Monsters",
      "factionDisplayName": "草莽星火",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 4,
      "abilities": [
        "Muster"
      ],
      "abilityDisplayNames": [
        "集贤"
      ],
      "abilityText": "集贤：打出后从牌库中立即打出星火五雄的同组关联牌（陈胜、吴广、彭越、项梁、刘秀）。",
      "musterGroup": "xinghuo-five",
      "musterGroupDisplayName": "星火五雄",
      "musterGroupMembers": [
        "陈胜",
        "吴广",
        "彭越",
        "项梁",
        "刘秀"
      ],
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/项梁.webp"
    },
    {
      "id": "zhangyu-0014",
      "name": "刘秀",
      "baseName": "刘秀",
      "faction": "Monsters",
      "factionDisplayName": "草莽星火",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 5,
      "abilities": [
        "Muster"
      ],
      "abilityDisplayNames": [
        "集贤"
      ],
      "abilityText": "集贤：打出后从牌库中立即打出星火五雄的同组关联牌（陈胜、吴广、彭越、项梁、刘秀）。",
      "musterGroup": "xinghuo-five",
      "musterGroupDisplayName": "星火五雄",
      "musterGroupMembers": [
        "陈胜",
        "吴广",
        "彭越",
        "项梁",
        "刘秀"
      ],
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/刘秀.webp"
    },
    {
      "id": "zhangyu-0119",
      "name": "李自成",
      "baseName": "李自成",
      "faction": "Monsters",
      "factionDisplayName": "草莽星火",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 5,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "无",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/李自成.webp"
    },
    {
      "id": "zhangyu-0118",
      "name": "王仙芝",
      "baseName": "王仙芝",
      "faction": "Monsters",
      "factionDisplayName": "草莽星火",
      "category": "unit",
      "row": [
        "ranged"
      ],
      "rowDisplayName": "朝堂",
      "strength": 2,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "无",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/黄巢.webp"
    },
    {
      "id": "zhangyu-0305",
      "name": "方腊",
      "baseName": "方腊",
      "faction": "Monsters",
      "factionDisplayName": "草莽星火",
      "category": "unit",
      "row": [
        "ranged"
      ],
      "rowDisplayName": "朝堂",
      "strength": 7,
      "abilities": [
        "Scorch"
      ],
      "abilityDisplayNames": [
        "奇策"
      ],
      "abilityText": "奇策：若对方朝堂总战力达到 10 或以上，摧毁其朝堂当前战力最高的非传世人物。",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/方腊.webp"
    },
    {
      "id": "zhangyu-0132",
      "name": "祖逖",
      "baseName": "祖逖",
      "faction": "Skellige",
      "factionDisplayName": "遗策复兴",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 4,
      "abilities": [
        "Berserker"
      ],
      "abilityDisplayNames": [
        "奋起"
      ],
      "abilityText": "奋起：被破釜触发后转化为 14 点振势人物。",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/祖逖.webp"
    },
    {
      "id": "zhangyu-0143",
      "name": "孙思邈",
      "baseName": "孙思邈",
      "faction": "Skellige",
      "factionDisplayName": "遗策复兴",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 2,
      "abilities": [
        "Medic"
      ],
      "abilityDisplayNames": [
        "济世"
      ],
      "abilityText": "济世",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/孙思邈.webp"
    },
    {
      "id": "zhangyu-0306",
      "name": "薛仁贵",
      "baseName": "薛仁贵",
      "faction": "Skellige",
      "factionDisplayName": "遗策复兴",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 6,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "无",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/薛仁贵.webp"
    },
    {
      "id": "zhangyu-0114",
      "name": "岳飞",
      "baseName": "岳飞",
      "faction": "Skellige",
      "factionDisplayName": "遗策复兴",
      "category": "hero",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 10,
      "abilities": [
        "Hero",
        "Summon Shield Maidens"
      ],
      "abilityDisplayNames": [
        "传世",
        "召唤岳家军"
      ],
      "abilityText": "传世：战力恒为 10，不受时局、鼓舞、振势、同盟等影响，也不会被奇策、请辞、济世选中。\n召唤岳家军：打出后从己方手牌和牌库中把所有「岳家军」一起部署到「疆场」阵线。",
      "leaderAbility": "",
      "hero": true,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/岳飞.webp"
    },
    {
      "id": "zhangyu-0307",
      "name": "牛皋",
      "baseName": "牛皋",
      "faction": "Skellige",
      "factionDisplayName": "遗策复兴",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 6,
      "abilities": [
        "Tight Bond"
      ],
      "abilityDisplayNames": [
        "同盟"
      ],
      "abilityText": "同盟",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "1 of 3",
      "imageUrl": "assets/card-icons/牛皋.webp"
    },
    {
      "id": "zhangyu-0308",
      "name": "牛皋",
      "baseName": "牛皋",
      "faction": "Skellige",
      "factionDisplayName": "遗策复兴",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 6,
      "abilities": [
        "Tight Bond"
      ],
      "abilityDisplayNames": [
        "同盟"
      ],
      "abilityText": "同盟",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 2,
      "copyLabel": "2 of 3",
      "imageUrl": "assets/card-icons/牛皋.webp"
    },
    {
      "id": "zhangyu-0309",
      "name": "牛皋",
      "baseName": "牛皋",
      "faction": "Skellige",
      "factionDisplayName": "遗策复兴",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 6,
      "abilities": [
        "Tight Bond"
      ],
      "abilityDisplayNames": [
        "同盟"
      ],
      "abilityText": "同盟",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 3,
      "copyLabel": "3 of 3",
      "imageUrl": "assets/card-icons/牛皋.webp"
    },
    {
      "id": "zhangyu-0310",
      "name": "俞大猷",
      "baseName": "俞大猷",
      "faction": "Skellige",
      "factionDisplayName": "遗策复兴",
      "category": "unit",
      "row": [
        "ranged"
      ],
      "rowDisplayName": "朝堂",
      "strength": 6,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "无",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "1 of 3",
      "imageUrl": "assets/card-icons/俞大猷.webp"
    },
    {
      "id": "zhangyu-0311",
      "name": "俞大猷",
      "baseName": "俞大猷",
      "faction": "Skellige",
      "factionDisplayName": "遗策复兴",
      "category": "unit",
      "row": [
        "ranged"
      ],
      "rowDisplayName": "朝堂",
      "strength": 6,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "无",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 2,
      "copyLabel": "2 of 3",
      "imageUrl": "assets/card-icons/俞大猷.webp"
    },
    {
      "id": "zhangyu-0312",
      "name": "俞大猷",
      "baseName": "俞大猷",
      "faction": "Skellige",
      "factionDisplayName": "遗策复兴",
      "category": "unit",
      "row": [
        "ranged"
      ],
      "rowDisplayName": "朝堂",
      "strength": 6,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "无",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 3,
      "copyLabel": "3 of 3",
      "imageUrl": "assets/card-icons/俞大猷.webp"
    },
    {
      "id": "zhangyu-0313",
      "name": "郑芝龙",
      "baseName": "郑芝龙",
      "faction": "Skellige",
      "factionDisplayName": "遗策复兴",
      "category": "unit",
      "row": [
        "ranged"
      ],
      "rowDisplayName": "朝堂",
      "strength": 6,
      "abilities": [
        "Scorch"
      ],
      "abilityDisplayNames": [
        "奇策"
      ],
      "abilityText": "奇策：若对方朝堂总战力达到 10 或以上，摧毁其朝堂当前战力最高的非传世人物。",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/郑芝龙.webp"
    },
    {
      "id": "zhangyu-0314",
      "name": "岳家军",
      "baseName": "岳家军",
      "faction": "Skellige",
      "factionDisplayName": "遗策复兴",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 4,
      "abilities": [
        "Tight Bond"
      ],
      "abilityDisplayNames": [
        "同盟"
      ],
      "abilityText": "岳家军：同盟——同一阵线的「岳家军」越多，每张战力翻倍越高。也可被岳飞的「召唤岳家军」从手牌、牌库中一并部署。",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "1 of 3",
      "imageUrl": "assets/card-icons/岳家军.webp"
    },
    {
      "id": "zhangyu-0315",
      "name": "岳家军",
      "baseName": "岳家军",
      "faction": "Skellige",
      "factionDisplayName": "遗策复兴",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 4,
      "abilities": [
        "Tight Bond"
      ],
      "abilityDisplayNames": [
        "同盟"
      ],
      "abilityText": "岳家军：同盟——同一阵线的「岳家军」越多，每张战力翻倍越高。也可被岳飞的「召唤岳家军」从手牌、牌库中一并部署。",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 2,
      "copyLabel": "2 of 3",
      "imageUrl": "assets/card-icons/岳家军.webp"
    },
    {
      "id": "zhangyu-0316",
      "name": "岳家军",
      "baseName": "岳家军",
      "faction": "Skellige",
      "factionDisplayName": "遗策复兴",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 4,
      "abilities": [
        "Tight Bond"
      ],
      "abilityDisplayNames": [
        "同盟"
      ],
      "abilityText": "岳家军：同盟——同一阵线的「岳家军」越多，每张战力翻倍越高。也可被岳飞的「召唤岳家军」从手牌、牌库中一并部署。",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 3,
      "copyLabel": "3 of 3",
      "imageUrl": "assets/card-icons/岳家军.webp"
    },
    {
      "id": "zhangyu-0317",
      "name": "司马相如",
      "baseName": "司马相如",
      "faction": "Skellige",
      "factionDisplayName": "遗策复兴",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 4,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "无",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/司马相如.webp"
    },
    {
      "id": "zhangyu-0318",
      "name": "欧冶子",
      "baseName": "欧冶子",
      "faction": "Skellige",
      "factionDisplayName": "遗策复兴",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 4,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "无",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/欧冶子.webp"
    },
    {
      "id": "zhangyu-0037",
      "name": "戚继光",
      "baseName": "戚继光",
      "faction": "Skellige",
      "factionDisplayName": "遗策复兴",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 4,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "无",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/戚继光.webp"
    },
    {
      "id": "zhangyu-0116",
      "name": "文天祥",
      "baseName": "文天祥",
      "faction": "Skellige",
      "factionDisplayName": "遗策复兴",
      "category": "unit",
      "row": [
        "siege"
      ],
      "rowDisplayName": "文脉",
      "strength": 2,
      "abilities": [
        "Commander's Horn"
      ],
      "abilityDisplayNames": [
        "鼓舞"
      ],
      "abilityText": "鼓舞",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/文天祥.webp"
    },
    {
      "id": "zhangyu-0319",
      "name": "李时珍",
      "baseName": "李时珍",
      "faction": "Skellige",
      "factionDisplayName": "遗策复兴",
      "category": "hero",
      "row": [
        "ranged"
      ],
      "rowDisplayName": "朝堂",
      "strength": 8,
      "abilities": [
        "Hero",
        "Mardroeme"
      ],
      "abilityDisplayNames": [
        "传世",
        "破釜"
      ],
      "abilityText": "传世、破釜：打出后触发所在朝堂线奋起人物转化。",
      "leaderAbility": "",
      "hero": true,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/李时珍.webp"
    },
    {
      "id": "zhangyu-0320",
      "name": "郑和",
      "baseName": "郑和",
      "faction": "Skellige",
      "factionDisplayName": "遗策复兴",
      "category": "hero",
      "row": [
        "ranged"
      ],
      "rowDisplayName": "朝堂",
      "strength": 10,
      "abilities": [
        "Hero"
      ],
      "abilityDisplayNames": [
        "传世"
      ],
      "abilityText": "传世",
      "leaderAbility": "",
      "hero": true,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/郑和.webp"
    },
    {
      "id": "zhangyu-0321",
      "name": "胡宗宪",
      "baseName": "胡宗宪",
      "faction": "Skellige",
      "factionDisplayName": "遗策复兴",
      "category": "unit",
      "row": [
        "siege"
      ],
      "rowDisplayName": "文脉",
      "strength": 4,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "无",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/胡宗宪.webp"
    },
    {
      "id": "zhangyu-0322",
      "name": "陆逊",
      "baseName": "陆逊",
      "faction": "Skellige",
      "factionDisplayName": "遗策复兴",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 0,
      "abilities": [
        "Summon Avenger"
      ],
      "abilityDisplayNames": [
        "召唤陆抗"
      ],
      "abilityText": "召唤陆抗：陆逊每次离开战场时，召唤一张 11 点传世「陆抗」顶替；若因小局清场离场，则在下一局开始入场。",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/陆逊.webp"
    },
    {
      "id": "zhangyu-0148",
      "name": "汪大渊",
      "baseName": "汪大渊",
      "faction": "Skellige",
      "factionDisplayName": "遗策复兴",
      "category": "unit",
      "row": [
        "ranged"
      ],
      "rowDisplayName": "朝堂",
      "strength": 4,
      "abilities": [
        "Muster"
      ],
      "abilityDisplayNames": [
        "集贤"
      ],
      "abilityText": "集贤：打出后从牌库中立即打出所有同名牌。",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "1 of 3",
      "imageUrl": "assets/card-icons/汪大渊.webp"
    },
    {
      "id": "zhangyu-0323",
      "name": "汪大渊",
      "baseName": "汪大渊",
      "faction": "Skellige",
      "factionDisplayName": "遗策复兴",
      "category": "unit",
      "row": [
        "ranged"
      ],
      "rowDisplayName": "朝堂",
      "strength": 4,
      "abilities": [
        "Muster"
      ],
      "abilityDisplayNames": [
        "集贤"
      ],
      "abilityText": "集贤：打出后从牌库中立即打出所有同名牌。",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 2,
      "copyLabel": "2 of 3",
      "imageUrl": "assets/card-icons/汪大渊.webp"
    },
    {
      "id": "zhangyu-0324",
      "name": "汪大渊",
      "baseName": "汪大渊",
      "faction": "Skellige",
      "factionDisplayName": "遗策复兴",
      "category": "unit",
      "row": [
        "ranged"
      ],
      "rowDisplayName": "朝堂",
      "strength": 4,
      "abilities": [
        "Muster"
      ],
      "abilityDisplayNames": [
        "集贤"
      ],
      "abilityText": "集贤：打出后从牌库中立即打出所有同名牌。",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 3,
      "copyLabel": "3 of 3",
      "imageUrl": "assets/card-icons/汪大渊.webp"
    },
    {
      "id": "zhangyu-0117",
      "name": "辛弃疾",
      "baseName": "辛弃疾",
      "faction": "Skellige",
      "factionDisplayName": "遗策复兴",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 6,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "无",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/辛弃疾.webp"
    },
    {
      "id": "zhangyu-0188",
      "name": "破釜沉舟",
      "baseName": "破釜沉舟",
      "faction": "Skellige",
      "factionDisplayName": "遗策复兴",
      "category": "special",
      "row": [],
      "rowDisplayName": "",
      "strength": null,
      "abilities": [
        "Mardroeme"
      ],
      "abilityDisplayNames": [
        "破釜"
      ],
      "abilityText": "破釜：选择一条阵线，触发该线所有奋起人物转化。",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "1 of 3",
      "imageUrl": "assets/card-icons/破釜沉舟.webp"
    },
    {
      "id": "zhangyu-0189",
      "name": "破釜沉舟",
      "baseName": "破釜沉舟",
      "faction": "Skellige",
      "factionDisplayName": "遗策复兴",
      "category": "special",
      "row": [],
      "rowDisplayName": "",
      "strength": null,
      "abilities": [
        "Mardroeme"
      ],
      "abilityDisplayNames": [
        "破釜"
      ],
      "abilityText": "破釜：选择一条阵线，触发该线所有奋起人物转化。",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 2,
      "copyLabel": "2 of 3",
      "imageUrl": "assets/card-icons/破釜沉舟.webp"
    },
    {
      "id": "zhangyu-0325",
      "name": "破釜沉舟",
      "baseName": "破釜沉舟",
      "faction": "Skellige",
      "factionDisplayName": "遗策复兴",
      "category": "special",
      "row": [],
      "rowDisplayName": "",
      "strength": null,
      "abilities": [
        "Mardroeme"
      ],
      "abilityDisplayNames": [
        "破釜"
      ],
      "abilityText": "破釜：选择一条阵线，触发该线所有奋起人物转化。",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 3,
      "copyLabel": "3 of 3",
      "imageUrl": "assets/card-icons/破釜沉舟.webp"
    },
    {
      "id": "zhangyu-0326",
      "name": "李存孝",
      "baseName": "李存孝",
      "faction": "Skellige",
      "factionDisplayName": "遗策复兴",
      "category": "unit",
      "row": [
        "melee",
        "ranged"
      ],
      "rowDisplayName": "疆场 / 朝堂",
      "strength": 12,
      "abilities": [
        "Agile",
        "Morale Boost"
      ],
      "abilityDisplayNames": [
        "通才",
        "振势"
      ],
      "abilityText": "通才、振势",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/李存孝.webp"
    },
    {
      "id": "zhangyu-0147",
      "name": "高拱",
      "baseName": "高拱",
      "faction": "Skellige",
      "factionDisplayName": "遗策复兴",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 4,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "无",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/张居正.webp"
    },
    {
      "id": "zhangyu-0199",
      "name": "海瑞",
      "baseName": "海瑞",
      "faction": "Skellige",
      "factionDisplayName": "遗策复兴",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 4,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "无",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/海瑞.webp"
    },
    {
      "id": "zhangyu-0327",
      "name": "施琅",
      "baseName": "施琅",
      "faction": "Skellige",
      "factionDisplayName": "遗策复兴",
      "category": "unit",
      "row": [
        "siege"
      ],
      "rowDisplayName": "文脉",
      "strength": 6,
      "abilities": [
        "Tight Bond"
      ],
      "abilityDisplayNames": [
        "同盟"
      ],
      "abilityText": "同盟",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "1 of 3",
      "imageUrl": "assets/card-icons/施琅.webp"
    },
    {
      "id": "zhangyu-0328",
      "name": "施琅",
      "baseName": "施琅",
      "faction": "Skellige",
      "factionDisplayName": "遗策复兴",
      "category": "unit",
      "row": [
        "siege"
      ],
      "rowDisplayName": "文脉",
      "strength": 6,
      "abilities": [
        "Tight Bond"
      ],
      "abilityDisplayNames": [
        "同盟"
      ],
      "abilityText": "同盟",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 2,
      "copyLabel": "2 of 3",
      "imageUrl": "assets/card-icons/施琅.webp"
    },
    {
      "id": "zhangyu-0329",
      "name": "施琅",
      "baseName": "施琅",
      "faction": "Skellige",
      "factionDisplayName": "遗策复兴",
      "category": "unit",
      "row": [
        "siege"
      ],
      "rowDisplayName": "文脉",
      "strength": 6,
      "abilities": [
        "Tight Bond"
      ],
      "abilityDisplayNames": [
        "同盟"
      ],
      "abilityText": "同盟",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 3,
      "copyLabel": "3 of 3",
      "imageUrl": "assets/card-icons/施琅.webp"
    },
    {
      "id": "zhangyu-0134",
      "name": "岳云",
      "baseName": "岳云",
      "faction": "Skellige",
      "factionDisplayName": "遗策复兴",
      "category": "unit",
      "row": [
        "ranged"
      ],
      "rowDisplayName": "朝堂",
      "strength": 2,
      "abilities": [
        "Berserker"
      ],
      "abilityDisplayNames": [
        "奋起"
      ],
      "abilityText": "奋起：被破釜触发后转化为 8 点同盟人物。",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "1 of 3",
      "imageUrl": "assets/card-icons/岳云.webp"
    },
    {
      "id": "zhangyu-0330",
      "name": "岳云",
      "baseName": "岳云",
      "faction": "Skellige",
      "factionDisplayName": "遗策复兴",
      "category": "unit",
      "row": [
        "ranged"
      ],
      "rowDisplayName": "朝堂",
      "strength": 2,
      "abilities": [
        "Berserker"
      ],
      "abilityDisplayNames": [
        "奋起"
      ],
      "abilityText": "奋起：被破釜触发后转化为 8 点同盟人物。",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 2,
      "copyLabel": "2 of 3",
      "imageUrl": "assets/card-icons/岳云.webp"
    },
    {
      "id": "zhangyu-0331",
      "name": "岳云",
      "baseName": "岳云",
      "faction": "Skellige",
      "factionDisplayName": "遗策复兴",
      "category": "unit",
      "row": [
        "ranged"
      ],
      "rowDisplayName": "朝堂",
      "strength": 2,
      "abilities": [
        "Berserker"
      ],
      "abilityDisplayNames": [
        "奋起"
      ],
      "abilityText": "奋起：被破釜触发后转化为 8 点同盟人物。",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 3,
      "copyLabel": "3 of 3",
      "imageUrl": "assets/card-icons/岳云.webp"
    },
    {
      "id": "zhangyu-0001",
      "name": "刘邦",
      "baseName": "刘邦",
      "faction": "Northern Realms",
      "factionDisplayName": "开国群雄",
      "category": "leader",
      "row": [],
      "rowDisplayName": "",
      "strength": null,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "从牌组选择 1 张党争迷局并立即打出。",
      "leaderAbility": "Pick an Impenetrable Fog card from your deck and play it instantly.",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/刘邦.webp"
    },
    {
      "id": "zhangyu-0002",
      "name": "李世民",
      "baseName": "李世民",
      "faction": "Northern Realms",
      "factionDisplayName": "开国群雄",
      "category": "leader",
      "row": [],
      "rowDisplayName": "",
      "strength": null,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "清除场上全部时局效果。",
      "leaderAbility": "Clear any weather effects in play.",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/李世民.webp"
    },
    {
      "id": "zhangyu-0003",
      "name": "嬴政",
      "baseName": "嬴政",
      "faction": "Northern Realms",
      "factionDisplayName": "开国群雄",
      "category": "leader",
      "row": [],
      "rowDisplayName": "",
      "strength": null,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "己方文脉线战力翻倍。",
      "leaderAbility": "Doubles the strength of all your Siege units unless a Commander's Horn is also present.",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/嬴政.webp"
    },
    {
      "id": "zhangyu-0004",
      "name": "赵匡胤",
      "baseName": "赵匡胤",
      "faction": "Northern Realms",
      "factionDisplayName": "开国群雄",
      "category": "leader",
      "row": [],
      "rowDisplayName": "",
      "strength": null,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "摧毁对方文脉线最强人物。",
      "leaderAbility": "Destroy your enemy strongest Siege unit if the combined strength is 10 or more.",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/赵匡胤.webp"
    },
    {
      "id": "zhangyu-0332",
      "name": "刘彻",
      "baseName": "刘彻",
      "faction": "Northern Realms",
      "factionDisplayName": "开国群雄",
      "category": "leader",
      "row": [],
      "rowDisplayName": "",
      "strength": null,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "摧毁对方朝堂线最强人物。",
      "leaderAbility": "Destroy your enemy strongest Ranged unit if the combined strength is 10 or more.",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/刘彻.webp"
    },
    {
      "id": "zhangyu-0006",
      "name": "张仪",
      "baseName": "张仪",
      "faction": "Nilfgaardian Empire",
      "factionDisplayName": "纵横权谋",
      "category": "leader",
      "row": [],
      "rowDisplayName": "",
      "strength": null,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "侦察对手随机 3 张手牌。",
      "leaderAbility": "Look at 3 random cards from your opponent's hand.",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/张仪.webp"
    },
    {
      "id": "zhangyu-0007",
      "name": "曹操",
      "baseName": "曹操",
      "faction": "Nilfgaardian Empire",
      "factionDisplayName": "纵横权谋",
      "category": "leader",
      "row": [],
      "rowDisplayName": "",
      "strength": null,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "从牌组选择 1 张典籍散佚并立即打出。",
      "leaderAbility": "Pick a Torrential Rain card from your deck and play it instantly.",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/曹操.webp"
    },
    {
      "id": "zhangyu-0333",
      "name": "秦昭襄王",
      "baseName": "秦昭襄王",
      "faction": "Nilfgaardian Empire",
      "factionDisplayName": "纵横权谋",
      "category": "leader",
      "row": [],
      "rowDisplayName": "",
      "strength": null,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "双方济世复归改为随机目标。",
      "leaderAbility": "Abilities that restore a unit from the discard pile restore a randomly-chosen unit.",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/秦昭襄王.webp"
    },
    {
      "id": "zhangyu-0005",
      "name": "管仲",
      "baseName": "管仲",
      "faction": "Nilfgaardian Empire",
      "factionDisplayName": "纵横权谋",
      "category": "leader",
      "row": [],
      "rowDisplayName": "",
      "strength": null,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "从对手弃牌堆取回 1 张人物到手牌。",
      "leaderAbility": "Draw a card from your opponent's discard pile.",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/管仲.webp"
    },
    {
      "id": "zhangyu-0008",
      "name": "司马懿",
      "baseName": "司马懿",
      "faction": "Nilfgaardian Empire",
      "factionDisplayName": "纵横权谋",
      "category": "leader",
      "row": [],
      "rowDisplayName": "",
      "strength": null,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "封锁对手主将技能。",
      "leaderAbility": "Cancel your opponent's Leader Ability.",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/司马懿.webp"
    },
    {
      "id": "zhangyu-0009",
      "name": "孔子",
      "baseName": "孔子",
      "faction": "Scoia'tael",
      "factionDisplayName": "百家争鸣",
      "category": "leader",
      "row": [],
      "rowDisplayName": "",
      "strength": null,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "开局额外抽 1 张牌。",
      "leaderAbility": "Draw an extra card at the beginning of the battle.",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/孔子.webp"
    },
    {
      "id": "zhangyu-0334",
      "name": "惠施",
      "baseName": "惠施",
      "faction": "Scoia'tael",
      "factionDisplayName": "百家争鸣",
      "category": "leader",
      "row": [],
      "rowDisplayName": "",
      "strength": null,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "将己方通才人物移动到更优战线。",
      "leaderAbility": "Move agile units to whatever valid row maximizes their strength.",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/惠施.webp"
    },
    {
      "id": "zhangyu-0010",
      "name": "老子",
      "baseName": "老子",
      "faction": "Scoia'tael",
      "factionDisplayName": "百家争鸣",
      "category": "leader",
      "row": [],
      "rowDisplayName": "",
      "strength": null,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "从牌组选择 1 张边患四起并立即打出。",
      "leaderAbility": "Pick a Biting Frost card from your deck and play it instantly.",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/老子.webp"
    },
    {
      "id": "zhangyu-0335",
      "name": "韩非",
      "baseName": "韩非",
      "faction": "Scoia'tael",
      "factionDisplayName": "百家争鸣",
      "category": "leader",
      "row": [],
      "rowDisplayName": "",
      "strength": null,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "摧毁对方疆场线最强人物。",
      "leaderAbility": "Destroy your enemy strongest Close Combat unit if the combined strength is 10 or more.",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/韩非.webp"
    },
    {
      "id": "zhangyu-0336",
      "name": "墨子",
      "baseName": "墨子",
      "faction": "Scoia'tael",
      "factionDisplayName": "百家争鸣",
      "category": "leader",
      "row": [],
      "rowDisplayName": "",
      "strength": null,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "己方朝堂线战力翻倍。",
      "leaderAbility": "Doubles the strength of all your Ranged units unless a Commander's Horn is also present.",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/墨子.webp"
    },
    {
      "id": "zhangyu-0337",
      "name": "朱元璋",
      "baseName": "朱元璋",
      "faction": "Monsters",
      "factionDisplayName": "草莽星火",
      "category": "leader",
      "row": [],
      "rowDisplayName": "",
      "strength": null,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "双方出使人物战力翻倍。",
      "leaderAbility": "Doubles the strength of all Spy cards on both sides.",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/朱元璋.webp"
    },
    {
      "id": "zhangyu-0338",
      "name": "刘秀",
      "baseName": "刘秀",
      "faction": "Monsters",
      "factionDisplayName": "草莽星火",
      "category": "leader",
      "row": [],
      "rowDisplayName": "",
      "strength": null,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "从己方弃牌堆取回 1 张人物到手牌。",
      "leaderAbility": "Restore a card from your discard pile to your hand.",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/刘秀.webp"
    },
    {
      "id": "zhangyu-0339",
      "name": "项羽",
      "baseName": "项羽",
      "faction": "Monsters",
      "factionDisplayName": "草莽星火",
      "category": "leader",
      "row": [],
      "rowDisplayName": "",
      "strength": null,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "己方疆场线战力翻倍。",
      "leaderAbility": "Doubles the strength of all your Close Combat units unless a Commander's Horn is also present.",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/项羽.webp"
    },
    {
      "id": "zhangyu-0016",
      "name": "黄巢",
      "baseName": "黄巢",
      "faction": "Monsters",
      "factionDisplayName": "草莽星火",
      "category": "leader",
      "row": [],
      "rowDisplayName": "",
      "strength": null,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "弃置 2 张手牌并抽 1 张牌。",
      "leaderAbility": "Discard 2 cards then draw a card of your choice.",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/黄巢.webp"
    },
    {
      "id": "zhangyu-0340",
      "name": "陈胜",
      "baseName": "陈胜",
      "faction": "Monsters",
      "factionDisplayName": "草莽星火",
      "category": "leader",
      "row": [],
      "rowDisplayName": "",
      "strength": null,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "从牌组选择任意 1 张时局牌并立即打出。",
      "leaderAbility": "Pick any weather card from your deck and play it instantly.",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/陈胜.webp"
    },
    {
      "id": "zhangyu-0017",
      "name": "司马迁",
      "baseName": "司马迁",
      "faction": "Skellige",
      "factionDisplayName": "遗策复兴",
      "category": "leader",
      "row": [],
      "rowDisplayName": "",
      "strength": null,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "双方弃牌堆洗回各自牌库。",
      "leaderAbility": "Shuffle all cards from each player graveyard back into their decks.",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/司马迁.webp"
    },
    {
      "id": "zhangyu-0018",
      "name": "张居正",
      "baseName": "张居正",
      "faction": "Skellige",
      "factionDisplayName": "遗策复兴",
      "category": "leader",
      "row": [],
      "rowDisplayName": "",
      "strength": null,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "己方单位在恶劣时局下仅损失一半战力。",
      "leaderAbility": "Units lose only half their strength during bad weather.",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/张居正.webp"
    }
  ],
  "tokens": [
    {
      "id": "token-transformed-vildkaarl",
      "baseName": "Transformed Vildkaarl",
      "name": "背水死士",
      "displayName": "背水死士",
      "faction": "Skellige",
      "factionDisplayName": "遗策复兴",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 14,
      "abilities": [
        "Morale Boost"
      ],
      "abilityDisplayNames": [
        "振势"
      ],
      "abilityText": "奋起转化：战力 14；为同一阵线其他非传世人物各加 1 点战力。",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": ""
    },
    {
      "id": "token-transformed-young-vildkaarl",
      "baseName": "Transformed Young Vildkaarl",
      "name": "背水锐卒",
      "displayName": "背水锐卒",
      "faction": "Skellige",
      "factionDisplayName": "遗策复兴",
      "category": "unit",
      "row": [
        "ranged"
      ],
      "rowDisplayName": "朝堂",
      "strength": 8,
      "abilities": [
        "Tight Bond"
      ],
      "abilityDisplayNames": [
        "同盟"
      ],
      "abilityText": "奋起转化：战力 8；同名背水锐卒在同一阵线并列时战力倍增。",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": ""
    },
    {
      "id": "token-howling-sky-hound",
      "baseName": "Howling Sky Hound",
      "name": "啸天犬",
      "displayName": "啸天犬",
      "faction": "Neutral",
      "factionDisplayName": "天下共识",
      "category": "unit",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 8,
      "abilities": [],
      "abilityDisplayNames": [],
      "abilityText": "杨戬每次离开战场后于下一回合召唤的灵犬，战力固定为 8；可多张并存。",
      "leaderAbility": "",
      "hero": false,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": "assets/card-icons/啸天犬.webp"
    },
    {
      "id": "token-hemdall",
      "baseName": "Hemdall",
      "name": "陆抗",
      "displayName": "陆抗",
      "faction": "Skellige",
      "factionDisplayName": "遗策复兴",
      "category": "hero",
      "row": [
        "melee"
      ],
      "rowDisplayName": "疆场",
      "strength": 11,
      "abilities": [
        "Hero"
      ],
      "abilityDisplayNames": [
        "传世"
      ],
      "abilityText": "陆逊离开战场后召唤的继承者；陆抗为 11 点传世人物，不受时局、奇策、请辞、鼓舞、振势、同盟等特殊效果影响。",
      "leaderAbility": "",
      "hero": true,
      "copyIndex": 1,
      "copyLabel": "",
      "imageUrl": ""
    }
  ]
};

module.exports = DATA;
