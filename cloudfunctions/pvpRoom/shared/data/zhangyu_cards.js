const DATA = {
  "factions": {
    "开国群雄": {
      "theme": "创业、开疆、将相合力",
      "perkName": "乘胜追策",
      "perkText": "赢得一个回合后抽 1 张牌。"
    },
    "纵横权谋": {
      "theme": "谋略、外交、制衡与奇策",
      "perkName": "庙算先机",
      "perkText": "平局时视为本派获胜；双方同派时仍为平局。"
    },
    "百家争鸣": {
      "theme": "思想、学派、改革与文化影响",
      "perkName": "先声夺人",
      "perkText": "第一小局开始前，可以选择自己先出牌还是对手先出牌。"
    },
    "草莽星火": {
      "theme": "义军、豪杰、民间号召与不灭火种",
      "perkName": "星火不灭",
      "perkText": "小局结束清场时，随机留下自己场上一张单位牌到下一局。"
    },
    "遗策复兴": {
      "theme": "史家、医家、科技、制度遗产与后发复兴",
      "perkName": "遗策再起",
      "perkText": "第 3 回合开始时从弃牌堆随机复起 2 张非传世单位。"
    },
    "天下共识": {
      "theme": "跨派人物、时局牌与通用谋略牌",
      "perkName": "",
      "perkText": "可被任意牌组使用。"
    }
  },
  "rows": {
    "疆场": {
      "theme": "军事、征伐、守土、武功"
    },
    "朝堂": {
      "theme": "政治、外交、谋略、制度"
    },
    "文脉": {
      "theme": "思想、科技、文化、医学、工程"
    }
  },
  "cards": [
    {
      "id": "zhangyu-0021",
      "name": "秦始皇",
      "factionDisplayName": "天下共识",
      "category": "hero",
      "rowDisplayName": "疆场",
      "strength": 15,
      "abilityDisplayNames": [
        "传世"
      ],
      "abilityText": "传世：战力不受时局、鼓舞、振势影响，也不会被奇策、请辞或济世选中。"
    },
    {
      "id": "zhangyu-0195",
      "name": "武则天",
      "factionDisplayName": "天下共识",
      "category": "hero",
      "rowDisplayName": "疆场",
      "strength": 15,
      "abilityDisplayNames": [
        "传世"
      ],
      "abilityText": "传世：战力不受时局、鼓舞、振势影响，也不会被奇策、请辞或济世选中。"
    },
    {
      "id": "zhangyu-0194",
      "name": "花木兰",
      "factionDisplayName": "天下共识",
      "category": "hero",
      "rowDisplayName": "疆场",
      "strength": 7,
      "abilityDisplayNames": [
        "传世"
      ],
      "abilityText": "传世：战力不受时局、鼓舞、振势影响，也不会被奇策、请辞或济世选中。"
    },
    {
      "id": "zhangyu-0146",
      "name": "扁鹊",
      "factionDisplayName": "天下共识",
      "category": "hero",
      "rowDisplayName": "朝堂",
      "strength": 7,
      "abilityDisplayNames": [
        "传世",
        "济世"
      ],
      "abilityText": "传世、济世：传世战力不受时局、鼓舞、振势影响，也不会被奇策、请辞或济世选中。济世从己方弃牌堆复归 1 张非传世人物。"
    },
    {
      "id": "zhangyu-0190",
      "name": "西施",
      "factionDisplayName": "天下共识",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 2,
      "abilityDisplayNames": [
        "鼓舞"
      ],
      "abilityText": "鼓舞：使己方指定阵线的所有非传世人物战力翻倍。"
    },
    {
      "id": "zhangyu-0193",
      "name": "鲁班",
      "factionDisplayName": "天下共识",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 6,
      "abilityDisplayNames": [],
      "abilityText": "无"
    },
    {
      "id": "zhangyu-0191",
      "name": "徐霞客",
      "factionDisplayName": "天下共识",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 5,
      "abilityDisplayNames": [],
      "abilityText": "无"
    },
    {
      "id": "zhangyu-0200",
      "name": "王昭君",
      "factionDisplayName": "天下共识",
      "category": "hero",
      "rowDisplayName": "疆场",
      "strength": 0,
      "abilityDisplayNames": [
        "出使",
        "传世"
      ],
      "abilityText": "出使、传世：出使打到对方阵线，己方抽 2 张牌。传世战力不受时局、鼓舞、振势影响，也不会被奇策、请辞或济世选中。"
    },
    {
      "id": "zhangyu-0198",
      "name": "杨玉环",
      "factionDisplayName": "天下共识",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 5,
      "abilityDisplayNames": [],
      "abilityText": "无"
    },
    {
      "id": "zhangyu-0201",
      "name": "貂蝉",
      "factionDisplayName": "天下共识",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 7,
      "abilityDisplayNames": [
        "奇策"
      ],
      "abilityText": "奇策：若对方疆场总战力 ≥10，摧毁其疆场当前战力最高的非传世人物。"
    },
    {
      "id": "zhangyu-0150",
      "name": "杨戬",
      "factionDisplayName": "天下共识",
      "category": "unit",
      "rowDisplayName": "朝堂",
      "strength": 0,
      "abilityDisplayNames": [
        "召唤哮天犬"
      ],
      "abilityText": "召唤：每次离开战场时，在己方疆场召唤 1 张 8 战力「哮天犬」。"
    },
    {
      "id": "zhangyu-0202",
      "name": "鬼谷子",
      "factionDisplayName": "天下共识",
      "category": "unit",
      "rowDisplayName": "文脉",
      "strength": 2,
      "abilityDisplayNames": [
        "集贤"
      ],
      "abilityText": "集贤：打出后从牌库中立即打出所有孟尝君。",
      "recruitTarget": "孟尝君",
      "recruitTargetDisplayName": "孟尝君"
    },
    {
      "id": "zhangyu-0203",
      "name": "孟尝君",
      "factionDisplayName": "天下共识",
      "category": "unit",
      "rowDisplayName": "朝堂",
      "strength": 4,
      "abilityDisplayNames": [
        "集贤"
      ],
      "abilityText": "集贤：打出后，从牌库打出其余同名牌。"
    },
    {
      "id": "zhangyu-0204",
      "name": "孟尝君",
      "factionDisplayName": "天下共识",
      "category": "unit",
      "rowDisplayName": "朝堂",
      "strength": 4,
      "abilityDisplayNames": [
        "集贤"
      ],
      "abilityText": "集贤：打出后，从牌库打出其余同名牌。"
    },
    {
      "id": "zhangyu-0205",
      "name": "孟尝君",
      "factionDisplayName": "天下共识",
      "category": "unit",
      "rowDisplayName": "朝堂",
      "strength": 4,
      "abilityDisplayNames": [
        "集贤"
      ],
      "abilityText": "集贤：打出后，从牌库打出其余同名牌。"
    },
    {
      "id": "zhangyu-0206",
      "name": "荆轲",
      "factionDisplayName": "天下共识",
      "category": "unit",
      "rowDisplayName": "疆场 / 朝堂",
      "strength": 6,
      "abilityDisplayNames": [
        "通才",
        "振势"
      ],
      "abilityText": "通才、振势：可部署到卡牌标注的任一阵线。为同一阵线的其他非传世人物各加 1 点战力。"
    },
    {
      "id": "zhangyu-0165",
      "name": "边患四起",
      "factionDisplayName": "天下共识",
      "category": "situation",
      "rowDisplayName": "疆场",
      "strength": null,
      "abilityDisplayNames": [],
      "abilityText": "时局：对应阵线的非传世人物战力降为 1。"
    },
    {
      "id": "zhangyu-0166",
      "name": "边患四起",
      "factionDisplayName": "天下共识",
      "category": "situation",
      "rowDisplayName": "疆场",
      "strength": null,
      "abilityDisplayNames": [],
      "abilityText": "时局：对应阵线的非传世人物战力降为 1。"
    },
    {
      "id": "zhangyu-0167",
      "name": "边患四起",
      "factionDisplayName": "天下共识",
      "category": "situation",
      "rowDisplayName": "疆场",
      "strength": null,
      "abilityDisplayNames": [],
      "abilityText": "时局：对应阵线的非传世人物战力降为 1。"
    },
    {
      "id": "zhangyu-0168",
      "name": "党争迷局",
      "factionDisplayName": "天下共识",
      "category": "situation",
      "rowDisplayName": "朝堂",
      "strength": null,
      "abilityDisplayNames": [],
      "abilityText": "时局：对应阵线的非传世人物战力降为 1。"
    },
    {
      "id": "zhangyu-0169",
      "name": "党争迷局",
      "factionDisplayName": "天下共识",
      "category": "situation",
      "rowDisplayName": "朝堂",
      "strength": null,
      "abilityDisplayNames": [],
      "abilityText": "时局：对应阵线的非传世人物战力降为 1。"
    },
    {
      "id": "zhangyu-0170",
      "name": "党争迷局",
      "factionDisplayName": "天下共识",
      "category": "situation",
      "rowDisplayName": "朝堂",
      "strength": null,
      "abilityDisplayNames": [],
      "abilityText": "时局：对应阵线的非传世人物战力降为 1。"
    },
    {
      "id": "zhangyu-0171",
      "name": "典籍散佚",
      "factionDisplayName": "天下共识",
      "category": "situation",
      "rowDisplayName": "文脉",
      "strength": null,
      "abilityDisplayNames": [],
      "abilityText": "时局：对应阵线的非传世人物战力降为 1。"
    },
    {
      "id": "zhangyu-0172",
      "name": "典籍散佚",
      "factionDisplayName": "天下共识",
      "category": "situation",
      "rowDisplayName": "文脉",
      "strength": null,
      "abilityDisplayNames": [],
      "abilityText": "时局：对应阵线的非传世人物战力降为 1。"
    },
    {
      "id": "zhangyu-0173",
      "name": "典籍散佚",
      "factionDisplayName": "天下共识",
      "category": "situation",
      "rowDisplayName": "文脉",
      "strength": null,
      "abilityDisplayNames": [],
      "abilityText": "时局：对应阵线的非传世人物战力降为 1。"
    },
    {
      "id": "zhangyu-0174",
      "name": "时代洪流",
      "factionDisplayName": "天下共识",
      "category": "situation",
      "rowDisplayName": "朝堂/文脉",
      "strength": null,
      "abilityDisplayNames": [],
      "abilityText": "时局：对应阵线的非传世人物战力降为 1。"
    },
    {
      "id": "zhangyu-0175",
      "name": "时代洪流",
      "factionDisplayName": "天下共识",
      "category": "situation",
      "rowDisplayName": "朝堂/文脉",
      "strength": null,
      "abilityDisplayNames": [],
      "abilityText": "时局：对应阵线的非传世人物战力降为 1。"
    },
    {
      "id": "zhangyu-0207",
      "name": "时代洪流",
      "factionDisplayName": "天下共识",
      "category": "situation",
      "rowDisplayName": "朝堂/文脉",
      "strength": null,
      "abilityDisplayNames": [],
      "abilityText": "时局：对应阵线的非传世人物战力降为 1。"
    },
    {
      "id": "zhangyu-0176",
      "name": "拨云见日",
      "factionDisplayName": "天下共识",
      "category": "situation",
      "rowDisplayName": "",
      "strength": null,
      "abilityDisplayNames": [],
      "abilityText": "拨云见日：清除场上全部时局效果。"
    },
    {
      "id": "zhangyu-0177",
      "name": "拨云见日",
      "factionDisplayName": "天下共识",
      "category": "situation",
      "rowDisplayName": "",
      "strength": null,
      "abilityDisplayNames": [],
      "abilityText": "拨云见日：清除场上全部时局效果。"
    },
    {
      "id": "zhangyu-0178",
      "name": "拨云见日",
      "factionDisplayName": "天下共识",
      "category": "situation",
      "rowDisplayName": "",
      "strength": null,
      "abilityDisplayNames": [],
      "abilityText": "拨云见日：清除场上全部时局效果。"
    },
    {
      "id": "zhangyu-0179",
      "name": "战鼓齐鸣",
      "factionDisplayName": "天下共识",
      "category": "stratagem",
      "rowDisplayName": "",
      "strength": null,
      "abilityDisplayNames": [
        "鼓舞"
      ],
      "abilityText": "鼓舞：选择己方一条阵线，该线所有非传世人物战力翻倍。"
    },
    {
      "id": "zhangyu-0180",
      "name": "战鼓齐鸣",
      "factionDisplayName": "天下共识",
      "category": "stratagem",
      "rowDisplayName": "",
      "strength": null,
      "abilityDisplayNames": [
        "鼓舞"
      ],
      "abilityText": "鼓舞：选择己方一条阵线，该线所有非传世人物战力翻倍。"
    },
    {
      "id": "zhangyu-0181",
      "name": "战鼓齐鸣",
      "factionDisplayName": "天下共识",
      "category": "stratagem",
      "rowDisplayName": "",
      "strength": null,
      "abilityDisplayNames": [
        "鼓舞"
      ],
      "abilityText": "鼓舞：选择己方一条阵线，该线所有非传世人物战力翻倍。"
    },
    {
      "id": "zhangyu-0185",
      "name": "请辞归隐",
      "factionDisplayName": "天下共识",
      "category": "stratagem",
      "rowDisplayName": "",
      "strength": null,
      "abilityDisplayNames": [],
      "abilityText": "请辞：选择己方场上 1 名非传世人物，将其收回手牌。"
    },
    {
      "id": "zhangyu-0186",
      "name": "请辞归隐",
      "factionDisplayName": "天下共识",
      "category": "stratagem",
      "rowDisplayName": "",
      "strength": null,
      "abilityDisplayNames": [],
      "abilityText": "请辞：选择己方场上 1 名非传世人物，将其收回手牌。"
    },
    {
      "id": "zhangyu-0187",
      "name": "请辞归隐",
      "factionDisplayName": "天下共识",
      "category": "stratagem",
      "rowDisplayName": "",
      "strength": null,
      "abilityDisplayNames": [],
      "abilityText": "请辞：选择己方场上 1 名非传世人物，将其收回手牌。"
    },
    {
      "id": "zhangyu-0182",
      "name": "釜底抽薪",
      "factionDisplayName": "天下共识",
      "category": "stratagem",
      "rowDisplayName": "",
      "strength": null,
      "abilityDisplayNames": [
        "奇策"
      ],
      "abilityText": "奇策：摧毁双方场上当前战力最高的非传世人物。"
    },
    {
      "id": "zhangyu-0183",
      "name": "釜底抽薪",
      "factionDisplayName": "天下共识",
      "category": "stratagem",
      "rowDisplayName": "",
      "strength": null,
      "abilityDisplayNames": [
        "奇策"
      ],
      "abilityText": "奇策：摧毁双方场上当前战力最高的非传世人物。"
    },
    {
      "id": "zhangyu-0184",
      "name": "釜底抽薪",
      "factionDisplayName": "天下共识",
      "category": "stratagem",
      "rowDisplayName": "",
      "strength": null,
      "abilityDisplayNames": [
        "奇策"
      ],
      "abilityText": "奇策：摧毁双方场上当前战力最高的非传世人物。"
    },
    {
      "id": "zhangyu-0208",
      "name": "周勃",
      "factionDisplayName": "开国群雄",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 1,
      "abilityDisplayNames": [],
      "abilityText": "无"
    },
    {
      "id": "zhangyu-0209",
      "name": "周勃",
      "factionDisplayName": "开国群雄",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 1,
      "abilityDisplayNames": [],
      "abilityText": "无"
    },
    {
      "id": "zhangyu-0022",
      "name": "曹参",
      "factionDisplayName": "开国群雄",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 1,
      "abilityDisplayNames": [
        "同盟"
      ],
      "abilityText": "同盟：同名同盟人物在同一阵线并列 N 张时，每张战力按 N 倍计算。"
    },
    {
      "id": "zhangyu-0210",
      "name": "曹参",
      "factionDisplayName": "开国群雄",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 1,
      "abilityDisplayNames": [
        "同盟"
      ],
      "abilityText": "同盟：同名同盟人物在同一阵线并列 N 张时，每张战力按 N 倍计算。"
    },
    {
      "id": "zhangyu-0211",
      "name": "曹参",
      "factionDisplayName": "开国群雄",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 1,
      "abilityDisplayNames": [
        "同盟"
      ],
      "abilityText": "同盟：同名同盟人物在同一阵线并列 N 张时，每张战力按 N 倍计算。"
    },
    {
      "id": "zhangyu-0212",
      "name": "曹参",
      "factionDisplayName": "开国群雄",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 1,
      "abilityDisplayNames": [
        "同盟"
      ],
      "abilityText": "同盟：同名同盟人物在同一阵线并列 N 张时，每张战力按 N 倍计算。"
    },
    {
      "id": "zhangyu-0043",
      "name": "赵普",
      "factionDisplayName": "开国群雄",
      "category": "unit",
      "rowDisplayName": "文脉",
      "strength": 1,
      "abilityDisplayNames": [
        "振势"
      ],
      "abilityText": "振势：同一阵线的其他非传世人物各 +1 战力。"
    },
    {
      "id": "zhangyu-0213",
      "name": "赵普",
      "factionDisplayName": "开国群雄",
      "category": "unit",
      "rowDisplayName": "文脉",
      "strength": 1,
      "abilityDisplayNames": [
        "振势"
      ],
      "abilityText": "振势：同一阵线的其他非传世人物各 +1 战力。"
    },
    {
      "id": "zhangyu-0214",
      "name": "赵普",
      "factionDisplayName": "开国群雄",
      "category": "unit",
      "rowDisplayName": "文脉",
      "strength": 1,
      "abilityDisplayNames": [
        "振势"
      ],
      "abilityText": "振势：同一阵线的其他非传世人物各 +1 战力。"
    },
    {
      "id": "zhangyu-0215",
      "name": "樊哙",
      "factionDisplayName": "开国群雄",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 2,
      "abilityDisplayNames": [],
      "abilityText": "无"
    },
    {
      "id": "zhangyu-0216",
      "name": "马援",
      "factionDisplayName": "开国群雄",
      "category": "unit",
      "rowDisplayName": "朝堂",
      "strength": 4,
      "abilityDisplayNames": [],
      "abilityText": "无"
    },
    {
      "id": "zhangyu-0217",
      "name": "蒙恬",
      "factionDisplayName": "开国群雄",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 4,
      "abilityDisplayNames": [
        "同盟"
      ],
      "abilityText": "同盟：同名同盟人物在同一阵线并列 N 张时，每张战力按 N 倍计算。"
    },
    {
      "id": "zhangyu-0218",
      "name": "蒙恬",
      "factionDisplayName": "开国群雄",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 4,
      "abilityDisplayNames": [
        "同盟"
      ],
      "abilityText": "同盟：同名同盟人物在同一阵线并列 N 张时，每张战力按 N 倍计算。"
    },
    {
      "id": "zhangyu-0219",
      "name": "蒙恬",
      "factionDisplayName": "开国群雄",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 4,
      "abilityDisplayNames": [
        "同盟"
      ],
      "abilityText": "同盟：同名同盟人物在同一阵线并列 N 张时，每张战力按 N 倍计算。"
    },
    {
      "id": "zhangyu-0220",
      "name": "上官婉儿",
      "factionDisplayName": "开国群雄",
      "category": "unit",
      "rowDisplayName": "朝堂",
      "strength": 4,
      "abilityDisplayNames": [],
      "abilityText": "无"
    },
    {
      "id": "zhangyu-0221",
      "name": "秦琼",
      "factionDisplayName": "开国群雄",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 5,
      "abilityDisplayNames": [],
      "abilityText": "无"
    },
    {
      "id": "zhangyu-0222",
      "name": "杨业",
      "factionDisplayName": "开国群雄",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 5,
      "abilityDisplayNames": [],
      "abilityText": "无"
    },
    {
      "id": "zhangyu-0223",
      "name": "蔺相如",
      "factionDisplayName": "开国群雄",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 5,
      "abilityDisplayNames": [
        "出使"
      ],
      "abilityText": "出使：打到对方阵线，己方抽 2 张牌。"
    },
    {
      "id": "zhangyu-0224",
      "name": "班昭",
      "factionDisplayName": "开国群雄",
      "category": "unit",
      "rowDisplayName": "朝堂",
      "strength": 5,
      "abilityDisplayNames": [],
      "abilityText": "无"
    },
    {
      "id": "zhangyu-0145",
      "name": "张仲景",
      "factionDisplayName": "开国群雄",
      "category": "unit",
      "rowDisplayName": "文脉",
      "strength": 5,
      "abilityDisplayNames": [
        "济世"
      ],
      "abilityText": "济世：从己方弃牌堆复归 1 张非传世人物。"
    },
    {
      "id": "zhangyu-0225",
      "name": "刘伯温",
      "factionDisplayName": "开国群雄",
      "category": "unit",
      "rowDisplayName": "朝堂",
      "strength": 6,
      "abilityDisplayNames": [],
      "abilityText": "无"
    },
    {
      "id": "zhangyu-0141",
      "name": "房玄龄",
      "factionDisplayName": "开国群雄",
      "category": "unit",
      "rowDisplayName": "文脉",
      "strength": 6,
      "abilityDisplayNames": [],
      "abilityText": "无"
    },
    {
      "id": "zhangyu-0226",
      "name": "司马光",
      "factionDisplayName": "开国群雄",
      "category": "unit",
      "rowDisplayName": "文脉",
      "strength": 6,
      "abilityDisplayNames": [],
      "abilityText": "无"
    },
    {
      "id": "zhangyu-0153",
      "name": "魏征",
      "factionDisplayName": "开国群雄",
      "category": "unit",
      "rowDisplayName": "文脉",
      "strength": 6,
      "abilityDisplayNames": [],
      "abilityText": "无"
    },
    {
      "id": "zhangyu-0227",
      "name": "魏征",
      "factionDisplayName": "开国群雄",
      "category": "unit",
      "rowDisplayName": "文脉",
      "strength": 6,
      "abilityDisplayNames": [],
      "abilityText": "无"
    },
    {
      "id": "zhangyu-0137",
      "name": "长孙无忌",
      "factionDisplayName": "开国群雄",
      "category": "unit",
      "rowDisplayName": "文脉",
      "strength": 8,
      "abilityDisplayNames": [
        "同盟"
      ],
      "abilityText": "同盟：同名同盟人物在同一阵线并列 N 张时，每张战力按 N 倍计算。"
    },
    {
      "id": "zhangyu-0228",
      "name": "长孙无忌",
      "factionDisplayName": "开国群雄",
      "category": "unit",
      "rowDisplayName": "文脉",
      "strength": 8,
      "abilityDisplayNames": [
        "同盟"
      ],
      "abilityText": "同盟：同名同盟人物在同一阵线并列 N 张时，每张战力按 N 倍计算。"
    },
    {
      "id": "zhangyu-0229",
      "name": "李广",
      "factionDisplayName": "开国群雄",
      "category": "unit",
      "rowDisplayName": "朝堂",
      "strength": 5,
      "abilityDisplayNames": [
        "同盟"
      ],
      "abilityText": "同盟：同名同盟人物在同一阵线并列 N 张时，每张战力按 N 倍计算。"
    },
    {
      "id": "zhangyu-0230",
      "name": "李广",
      "factionDisplayName": "开国群雄",
      "category": "unit",
      "rowDisplayName": "朝堂",
      "strength": 5,
      "abilityDisplayNames": [
        "同盟"
      ],
      "abilityText": "同盟：同名同盟人物在同一阵线并列 N 张时，每张战力按 N 倍计算。"
    },
    {
      "id": "zhangyu-0231",
      "name": "李广",
      "factionDisplayName": "开国群雄",
      "category": "unit",
      "rowDisplayName": "朝堂",
      "strength": 5,
      "abilityDisplayNames": [
        "同盟"
      ],
      "abilityText": "同盟：同名同盟人物在同一阵线并列 N 张时，每张战力按 N 倍计算。"
    },
    {
      "id": "zhangyu-0232",
      "name": "白起",
      "factionDisplayName": "开国群雄",
      "category": "hero",
      "rowDisplayName": "疆场",
      "strength": 10,
      "abilityDisplayNames": [
        "传世"
      ],
      "abilityText": "传世：战力不受时局、鼓舞、振势影响，也不会被奇策、请辞或济世选中。"
    },
    {
      "id": "zhangyu-0026",
      "name": "霍去病",
      "factionDisplayName": "开国群雄",
      "category": "hero",
      "rowDisplayName": "疆场",
      "strength": 10,
      "abilityDisplayNames": [
        "传世"
      ],
      "abilityText": "传世：战力不受时局、鼓舞、振势影响，也不会被奇策、请辞或济世选中。"
    },
    {
      "id": "zhangyu-0233",
      "name": "萧何",
      "factionDisplayName": "开国群雄",
      "category": "hero",
      "rowDisplayName": "朝堂",
      "strength": 10,
      "abilityDisplayNames": [
        "传世"
      ],
      "abilityText": "传世：战力不受时局、鼓舞、振势影响，也不会被奇策、请辞或济世选中。"
    },
    {
      "id": "zhangyu-0234",
      "name": "马钧",
      "factionDisplayName": "开国群雄",
      "category": "unit",
      "rowDisplayName": "文脉",
      "strength": 6,
      "abilityDisplayNames": [],
      "abilityText": "无"
    },
    {
      "id": "zhangyu-0053",
      "name": "张骞",
      "factionDisplayName": "开国群雄",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 4,
      "abilityDisplayNames": [
        "出使"
      ],
      "abilityText": "出使：打到对方阵线，己方抽 2 张牌。"
    },
    {
      "id": "zhangyu-0235",
      "name": "苏武",
      "factionDisplayName": "开国群雄",
      "category": "unit",
      "rowDisplayName": "文脉",
      "strength": 1,
      "abilityDisplayNames": [
        "出使"
      ],
      "abilityText": "出使：打到对方阵线，己方抽 2 张牌。"
    },
    {
      "id": "zhangyu-0036",
      "name": "卫青",
      "factionDisplayName": "开国群雄",
      "category": "hero",
      "rowDisplayName": "疆场",
      "strength": 10,
      "abilityDisplayNames": [
        "传世"
      ],
      "abilityText": "传世：战力不受时局、鼓舞、振势影响，也不会被奇策、请辞或济世选中。"
    },
    {
      "id": "zhangyu-0236",
      "name": "谢道韫",
      "factionDisplayName": "开国群雄",
      "category": "unit",
      "rowDisplayName": "朝堂",
      "strength": 5,
      "abilityDisplayNames": [],
      "abilityText": "无"
    },
    {
      "id": "zhangyu-0084",
      "name": "赵高",
      "factionDisplayName": "纵横权谋",
      "category": "unit",
      "rowDisplayName": "朝堂",
      "strength": 2,
      "abilityDisplayNames": [],
      "abilityText": "无"
    },
    {
      "id": "zhangyu-0051",
      "name": "吕不韦",
      "factionDisplayName": "纵横权谋",
      "category": "unit",
      "rowDisplayName": "朝堂",
      "strength": 6,
      "abilityDisplayNames": [],
      "abilityText": "无"
    },
    {
      "id": "zhangyu-0237",
      "name": "廉颇",
      "factionDisplayName": "纵横权谋",
      "category": "unit",
      "rowDisplayName": "朝堂",
      "strength": 10,
      "abilityDisplayNames": [],
      "abilityText": "无"
    },
    {
      "id": "zhangyu-0238",
      "name": "廉颇",
      "factionDisplayName": "纵横权谋",
      "category": "unit",
      "rowDisplayName": "朝堂",
      "strength": 10,
      "abilityDisplayNames": [],
      "abilityText": "无"
    },
    {
      "id": "zhangyu-0052",
      "name": "韩信",
      "factionDisplayName": "纵横权谋",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 6,
      "abilityDisplayNames": [],
      "abilityText": "无"
    },
    {
      "id": "zhangyu-0239",
      "name": "吕雉",
      "factionDisplayName": "纵横权谋",
      "category": "unit",
      "rowDisplayName": "朝堂",
      "strength": 4,
      "abilityDisplayNames": [],
      "abilityText": "无"
    },
    {
      "id": "zhangyu-0240",
      "name": "淳于意",
      "factionDisplayName": "纵横权谋",
      "category": "unit",
      "rowDisplayName": "朝堂",
      "strength": 1,
      "abilityDisplayNames": [
        "济世"
      ],
      "abilityText": "济世：从己方弃牌堆复归 1 张非传世人物。"
    },
    {
      "id": "zhangyu-0241",
      "name": "淳于意",
      "factionDisplayName": "纵横权谋",
      "category": "unit",
      "rowDisplayName": "朝堂",
      "strength": 1,
      "abilityDisplayNames": [
        "济世"
      ],
      "abilityText": "济世：从己方弃牌堆复归 1 张非传世人物。"
    },
    {
      "id": "zhangyu-0049",
      "name": "李靖",
      "factionDisplayName": "纵横权谋",
      "category": "unit",
      "rowDisplayName": "朝堂",
      "strength": 6,
      "abilityDisplayNames": [],
      "abilityText": "无"
    },
    {
      "id": "zhangyu-0242",
      "name": "商鞅",
      "factionDisplayName": "纵横权谋",
      "category": "unit",
      "rowDisplayName": "文脉",
      "strength": 10,
      "abilityDisplayNames": [],
      "abilityText": "无"
    },
    {
      "id": "zhangyu-0243",
      "name": "平原君",
      "factionDisplayName": "纵横权谋",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 3,
      "abilityDisplayNames": [
        "同盟"
      ],
      "abilityText": "同盟：同名同盟人物在同一阵线并列 N 张时，每张战力按 N 倍计算。"
    },
    {
      "id": "zhangyu-0244",
      "name": "平原君",
      "factionDisplayName": "纵横权谋",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 3,
      "abilityDisplayNames": [
        "同盟"
      ],
      "abilityText": "同盟：同名同盟人物在同一阵线并列 N 张时，每张战力按 N 倍计算。"
    },
    {
      "id": "zhangyu-0245",
      "name": "平原君",
      "factionDisplayName": "纵横权谋",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 3,
      "abilityDisplayNames": [
        "同盟"
      ],
      "abilityText": "同盟：同名同盟人物在同一阵线并列 N 张时，每张战力按 N 倍计算。"
    },
    {
      "id": "zhangyu-0246",
      "name": "平原君",
      "factionDisplayName": "纵横权谋",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 3,
      "abilityDisplayNames": [
        "同盟"
      ],
      "abilityText": "同盟：同名同盟人物在同一阵线并列 N 张时，每张战力按 N 倍计算。"
    },
    {
      "id": "zhangyu-0023",
      "name": "诸葛亮",
      "factionDisplayName": "纵横权谋",
      "category": "hero",
      "rowDisplayName": "疆场",
      "strength": 10,
      "abilityDisplayNames": [
        "传世"
      ],
      "abilityText": "传世：战力不受时局、鼓舞、振势影响，也不会被奇策、请辞或济世选中。"
    },
    {
      "id": "zhangyu-0024",
      "name": "华佗",
      "factionDisplayName": "纵横权谋",
      "category": "hero",
      "rowDisplayName": "疆场",
      "strength": 10,
      "abilityDisplayNames": [
        "传世",
        "济世"
      ],
      "abilityText": "传世、济世：传世战力不受时局、鼓舞、振势影响，也不会被奇策、请辞或济世选中。济世从己方弃牌堆复归 1 张非传世人物。"
    },
    {
      "id": "zhangyu-0247",
      "name": "赵括",
      "factionDisplayName": "纵横权谋",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 3,
      "abilityDisplayNames": [],
      "abilityText": "无"
    },
    {
      "id": "zhangyu-0059",
      "name": "张良",
      "factionDisplayName": "纵横权谋",
      "category": "hero",
      "rowDisplayName": "文脉",
      "strength": 10,
      "abilityDisplayNames": [
        "传世"
      ],
      "abilityText": "传世：战力不受时局、鼓舞、振势影响，也不会被奇策、请辞或济世选中。"
    },
    {
      "id": "zhangyu-0248",
      "name": "毛遂",
      "factionDisplayName": "纵横权谋",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 2,
      "abilityDisplayNames": [
        "同盟"
      ],
      "abilityText": "同盟：同名同盟人物在同一阵线并列 N 张时，每张战力按 N 倍计算。"
    },
    {
      "id": "zhangyu-0249",
      "name": "毛遂",
      "factionDisplayName": "纵横权谋",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 2,
      "abilityDisplayNames": [
        "同盟"
      ],
      "abilityText": "同盟：同名同盟人物在同一阵线并列 N 张时，每张战力按 N 倍计算。"
    },
    {
      "id": "zhangyu-0250",
      "name": "毛遂",
      "factionDisplayName": "纵横权谋",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 2,
      "abilityDisplayNames": [
        "同盟"
      ],
      "abilityText": "同盟：同名同盟人物在同一阵线并列 N 张时，每张战力按 N 倍计算。"
    },
    {
      "id": "zhangyu-0251",
      "name": "伍子胥",
      "factionDisplayName": "纵横权谋",
      "category": "unit",
      "rowDisplayName": "朝堂",
      "strength": 3,
      "abilityDisplayNames": [],
      "abilityText": "无"
    },
    {
      "id": "zhangyu-0252",
      "name": "李斯",
      "factionDisplayName": "纵横权谋",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 4,
      "abilityDisplayNames": [],
      "abilityText": "无"
    },
    {
      "id": "zhangyu-0073",
      "name": "贾诩",
      "factionDisplayName": "纵横权谋",
      "category": "unit",
      "rowDisplayName": "朝堂",
      "strength": 5,
      "abilityDisplayNames": [],
      "abilityText": "无"
    },
    {
      "id": "zhangyu-0253",
      "name": "邹忌",
      "factionDisplayName": "纵横权谋",
      "category": "unit",
      "rowDisplayName": "文脉",
      "strength": 3,
      "abilityDisplayNames": [],
      "abilityText": "无"
    },
    {
      "id": "zhangyu-0254",
      "name": "班超",
      "factionDisplayName": "纵横权谋",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 7,
      "abilityDisplayNames": [
        "出使"
      ],
      "abilityText": "出使：打到对方阵线，己方抽 2 张牌。"
    },
    {
      "id": "zhangyu-0255",
      "name": "李冰",
      "factionDisplayName": "纵横权谋",
      "category": "unit",
      "rowDisplayName": "文脉",
      "strength": 6,
      "abilityDisplayNames": [],
      "abilityText": "无"
    },
    {
      "id": "zhangyu-0142",
      "name": "葛洪",
      "factionDisplayName": "纵横权谋",
      "category": "unit",
      "rowDisplayName": "文脉",
      "strength": 0,
      "abilityDisplayNames": [
        "济世"
      ],
      "abilityText": "济世：从己方弃牌堆复归 1 张非传世人物。"
    },
    {
      "id": "zhangyu-0054",
      "name": "文成公主",
      "factionDisplayName": "纵横权谋",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 9,
      "abilityDisplayNames": [
        "出使"
      ],
      "abilityText": "出使：打到对方阵线，己方抽 2 张牌。"
    },
    {
      "id": "zhangyu-0256",
      "name": "晏婴",
      "factionDisplayName": "纵横权谋",
      "category": "unit",
      "rowDisplayName": "朝堂",
      "strength": 2,
      "abilityDisplayNames": [],
      "abilityText": "无"
    },
    {
      "id": "zhangyu-0055",
      "name": "周瑜",
      "factionDisplayName": "纵横权谋",
      "category": "hero",
      "rowDisplayName": "朝堂",
      "strength": 10,
      "abilityDisplayNames": [
        "传世"
      ],
      "abilityText": "传世：战力不受时局、鼓舞、振势影响，也不会被奇策、请辞或济世选中。"
    },
    {
      "id": "zhangyu-0056",
      "name": "郭嘉",
      "factionDisplayName": "纵横权谋",
      "category": "unit",
      "rowDisplayName": "朝堂",
      "strength": 4,
      "abilityDisplayNames": [],
      "abilityText": "无"
    },
    {
      "id": "zhangyu-0047",
      "name": "苏秦",
      "factionDisplayName": "纵横权谋",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 4,
      "abilityDisplayNames": [
        "出使"
      ],
      "abilityText": "出使：打到对方阵线，己方抽 2 张牌。"
    },
    {
      "id": "zhangyu-0257",
      "name": "项燕",
      "factionDisplayName": "纵横权谋",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 2,
      "abilityDisplayNames": [],
      "abilityText": "无"
    },
    {
      "id": "zhangyu-0075",
      "name": "公孙衍",
      "factionDisplayName": "纵横权谋",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 5,
      "abilityDisplayNames": [
        "同盟"
      ],
      "abilityText": "同盟：同名同盟人物在同一阵线并列 N 张时，每张战力按 N 倍计算。"
    },
    {
      "id": "zhangyu-0258",
      "name": "公孙衍",
      "factionDisplayName": "纵横权谋",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 5,
      "abilityDisplayNames": [
        "同盟"
      ],
      "abilityText": "同盟：同名同盟人物在同一阵线并列 N 张时，每张战力按 N 倍计算。"
    },
    {
      "id": "zhangyu-0050",
      "name": "陆逊",
      "factionDisplayName": "纵横权谋",
      "category": "unit",
      "rowDisplayName": "文脉",
      "strength": 5,
      "abilityDisplayNames": [],
      "abilityText": "无"
    },
    {
      "id": "zhangyu-0101",
      "name": "苏轼",
      "factionDisplayName": "百家争鸣",
      "category": "unit",
      "rowDisplayName": "疆场 / 朝堂",
      "strength": 6,
      "abilityDisplayNames": [
        "通才"
      ],
      "abilityText": "通才：可部署至卡牌标注的任一阵线。"
    },
    {
      "id": "zhangyu-0259",
      "name": "公孙龙",
      "factionDisplayName": "百家争鸣",
      "category": "unit",
      "rowDisplayName": "疆场 / 朝堂",
      "strength": 3,
      "abilityDisplayNames": [
        "通才"
      ],
      "abilityText": "通才：可部署至卡牌标注的任一阵线。"
    },
    {
      "id": "zhangyu-0011",
      "name": "墨子",
      "factionDisplayName": "百家争鸣",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 6,
      "abilityDisplayNames": [],
      "abilityText": "无"
    },
    {
      "id": "zhangyu-0260",
      "name": "贾谊",
      "factionDisplayName": "百家争鸣",
      "category": "unit",
      "rowDisplayName": "朝堂",
      "strength": 4,
      "abilityDisplayNames": [],
      "abilityText": "无"
    },
    {
      "id": "zhangyu-0079",
      "name": "孟子",
      "factionDisplayName": "百家争鸣",
      "category": "unit",
      "rowDisplayName": "疆场 / 朝堂",
      "strength": 6,
      "abilityDisplayNames": [
        "通才"
      ],
      "abilityText": "通才：可部署至卡牌标注的任一阵线。"
    },
    {
      "id": "zhangyu-0261",
      "name": "孟子",
      "factionDisplayName": "百家争鸣",
      "category": "unit",
      "rowDisplayName": "疆场 / 朝堂",
      "strength": 6,
      "abilityDisplayNames": [
        "通才"
      ],
      "abilityText": "通才：可部署至卡牌标注的任一阵线。"
    },
    {
      "id": "zhangyu-0262",
      "name": "孟子",
      "factionDisplayName": "百家争鸣",
      "category": "unit",
      "rowDisplayName": "疆场 / 朝堂",
      "strength": 6,
      "abilityDisplayNames": [
        "通才"
      ],
      "abilityText": "通才：可部署至卡牌标注的任一阵线。"
    },
    {
      "id": "zhangyu-0263",
      "name": "子路",
      "factionDisplayName": "百家争鸣",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 3,
      "abilityDisplayNames": [
        "集贤"
      ],
      "abilityText": "集贤：打出后，从牌库打出其余同名牌。"
    },
    {
      "id": "zhangyu-0264",
      "name": "子路",
      "factionDisplayName": "百家争鸣",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 3,
      "abilityDisplayNames": [
        "集贤"
      ],
      "abilityText": "集贤：打出后，从牌库打出其余同名牌。"
    },
    {
      "id": "zhangyu-0265",
      "name": "子路",
      "factionDisplayName": "百家争鸣",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 3,
      "abilityDisplayNames": [
        "集贤"
      ],
      "abilityText": "集贤：打出后，从牌库打出其余同名牌。"
    },
    {
      "id": "zhangyu-0099",
      "name": "李白",
      "factionDisplayName": "百家争鸣",
      "category": "hero",
      "rowDisplayName": "朝堂",
      "strength": 10,
      "abilityDisplayNames": [
        "传世"
      ],
      "abilityText": "传世：战力不受时局、鼓舞、振势影响，也不会被奇策、请辞或济世选中。"
    },
    {
      "id": "zhangyu-0266",
      "name": "李清照",
      "factionDisplayName": "百家争鸣",
      "category": "unit",
      "rowDisplayName": "朝堂",
      "strength": 2,
      "abilityDisplayNames": [
        "集贤"
      ],
      "abilityText": "集贤：打出后，从牌库打出其余同名牌。"
    },
    {
      "id": "zhangyu-0267",
      "name": "李清照",
      "factionDisplayName": "百家争鸣",
      "category": "unit",
      "rowDisplayName": "朝堂",
      "strength": 2,
      "abilityDisplayNames": [
        "集贤"
      ],
      "abilityText": "集贤：打出后，从牌库打出其余同名牌。"
    },
    {
      "id": "zhangyu-0268",
      "name": "李清照",
      "factionDisplayName": "百家争鸣",
      "category": "unit",
      "rowDisplayName": "朝堂",
      "strength": 2,
      "abilityDisplayNames": [
        "集贤"
      ],
      "abilityText": "集贤：打出后，从牌库打出其余同名牌。"
    },
    {
      "id": "zhangyu-0082",
      "name": "庄子",
      "factionDisplayName": "百家争鸣",
      "category": "unit",
      "rowDisplayName": "疆场 / 朝堂",
      "strength": 6,
      "abilityDisplayNames": [
        "通才"
      ],
      "abilityText": "通才：可部署至卡牌标注的任一阵线。"
    },
    {
      "id": "zhangyu-0144",
      "name": "李时珍",
      "factionDisplayName": "百家争鸣",
      "category": "unit",
      "rowDisplayName": "朝堂",
      "strength": 0,
      "abilityDisplayNames": [
        "济世"
      ],
      "abilityText": "济世：从己方弃牌堆复归 1 张非传世人物。"
    },
    {
      "id": "zhangyu-0269",
      "name": "李时珍",
      "factionDisplayName": "百家争鸣",
      "category": "unit",
      "rowDisplayName": "朝堂",
      "strength": 0,
      "abilityDisplayNames": [
        "济世"
      ],
      "abilityText": "济世：从己方弃牌堆复归 1 张非传世人物。"
    },
    {
      "id": "zhangyu-0270",
      "name": "李时珍",
      "factionDisplayName": "百家争鸣",
      "category": "unit",
      "rowDisplayName": "朝堂",
      "strength": 0,
      "abilityDisplayNames": [
        "济世"
      ],
      "abilityText": "济世：从己方弃牌堆复归 1 张非传世人物。"
    },
    {
      "id": "zhangyu-0271",
      "name": "子贡",
      "factionDisplayName": "百家争鸣",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 5,
      "abilityDisplayNames": [
        "集贤"
      ],
      "abilityText": "集贤：打出后，从牌库打出其余同名牌。"
    },
    {
      "id": "zhangyu-0272",
      "name": "子贡",
      "factionDisplayName": "百家争鸣",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 5,
      "abilityDisplayNames": [
        "集贤"
      ],
      "abilityText": "集贤：打出后，从牌库打出其余同名牌。"
    },
    {
      "id": "zhangyu-0273",
      "name": "子贡",
      "factionDisplayName": "百家争鸣",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 5,
      "abilityDisplayNames": [
        "集贤"
      ],
      "abilityText": "集贤：打出后，从牌库打出其余同名牌。"
    },
    {
      "id": "zhangyu-0274",
      "name": "蔡文姬",
      "factionDisplayName": "百家争鸣",
      "category": "unit",
      "rowDisplayName": "朝堂",
      "strength": 6,
      "abilityDisplayNames": [],
      "abilityText": "无"
    },
    {
      "id": "zhangyu-0086",
      "name": "孙子",
      "factionDisplayName": "百家争鸣",
      "category": "hero",
      "rowDisplayName": "朝堂",
      "strength": 10,
      "abilityDisplayNames": [
        "传世"
      ],
      "abilityText": "传世：战力不受时局、鼓舞、振势影响，也不会被奇策、请辞或济世选中。"
    },
    {
      "id": "zhangyu-0012",
      "name": "韩非",
      "factionDisplayName": "百家争鸣",
      "category": "hero",
      "rowDisplayName": "疆场",
      "strength": 10,
      "abilityDisplayNames": [
        "传世",
        "振势"
      ],
      "abilityText": "传世、振势：传世战力不受时局、鼓舞、振势影响，也不会被奇策、请辞或济世选中。振势使同一阵线的其他非传世人物各 +1 战力。"
    },
    {
      "id": "zhangyu-0275",
      "name": "曾子",
      "factionDisplayName": "百家争鸣",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 5,
      "abilityDisplayNames": [],
      "abilityText": "无"
    },
    {
      "id": "zhangyu-0276",
      "name": "曾子",
      "factionDisplayName": "百家争鸣",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 5,
      "abilityDisplayNames": [],
      "abilityText": "无"
    },
    {
      "id": "zhangyu-0277",
      "name": "曾子",
      "factionDisplayName": "百家争鸣",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 5,
      "abilityDisplayNames": [],
      "abilityText": "无"
    },
    {
      "id": "zhangyu-0278",
      "name": "曾子",
      "factionDisplayName": "百家争鸣",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 5,
      "abilityDisplayNames": [],
      "abilityText": "无"
    },
    {
      "id": "zhangyu-0279",
      "name": "曾子",
      "factionDisplayName": "百家争鸣",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 5,
      "abilityDisplayNames": [],
      "abilityText": "无"
    },
    {
      "id": "zhangyu-0100",
      "name": "杜甫",
      "factionDisplayName": "百家争鸣",
      "category": "unit",
      "rowDisplayName": "朝堂",
      "strength": 10,
      "abilityDisplayNames": [
        "振势"
      ],
      "abilityText": "振势：同一阵线的其他非传世人物各 +1 战力。"
    },
    {
      "id": "zhangyu-0081",
      "name": "列子",
      "factionDisplayName": "百家争鸣",
      "category": "unit",
      "rowDisplayName": "朝堂",
      "strength": 1,
      "abilityDisplayNames": [],
      "abilityText": "无"
    },
    {
      "id": "zhangyu-0088",
      "name": "屈原",
      "factionDisplayName": "百家争鸣",
      "category": "hero",
      "rowDisplayName": "朝堂",
      "strength": 10,
      "abilityDisplayNames": [
        "传世"
      ],
      "abilityText": "传世：战力不受时局、鼓舞、振势影响，也不会被奇策、请辞或济世选中。"
    },
    {
      "id": "zhangyu-0080",
      "name": "荀子",
      "factionDisplayName": "百家争鸣",
      "category": "unit",
      "rowDisplayName": "朝堂",
      "strength": 2,
      "abilityDisplayNames": [],
      "abilityText": "无"
    },
    {
      "id": "zhangyu-0089",
      "name": "朱熹",
      "factionDisplayName": "百家争鸣",
      "category": "unit",
      "rowDisplayName": "朝堂",
      "strength": 4,
      "abilityDisplayNames": [],
      "abilityText": "无"
    },
    {
      "id": "zhangyu-0104",
      "name": "顾炎武",
      "factionDisplayName": "百家争鸣",
      "category": "unit",
      "rowDisplayName": "疆场 / 朝堂",
      "strength": 5,
      "abilityDisplayNames": [
        "通才"
      ],
      "abilityText": "通才：可部署至卡牌标注的任一阵线。"
    },
    {
      "id": "zhangyu-0280",
      "name": "顾炎武",
      "factionDisplayName": "百家争鸣",
      "category": "unit",
      "rowDisplayName": "疆场 / 朝堂",
      "strength": 5,
      "abilityDisplayNames": [
        "通才"
      ],
      "abilityText": "通才：可部署至卡牌标注的任一阵线。"
    },
    {
      "id": "zhangyu-0078",
      "name": "颜回",
      "factionDisplayName": "百家争鸣",
      "category": "unit",
      "rowDisplayName": "疆场 / 朝堂",
      "strength": 6,
      "abilityDisplayNames": [
        "通才"
      ],
      "abilityText": "通才：可部署至卡牌标注的任一阵线。"
    },
    {
      "id": "zhangyu-0085",
      "name": "田单",
      "factionDisplayName": "百家争鸣",
      "category": "unit",
      "rowDisplayName": "文脉",
      "strength": 8,
      "abilityDisplayNames": [
        "奇策"
      ],
      "abilityText": "奇策：若对方文脉总战力 ≥10，摧毁其文脉当前战力最高的非传世人物。"
    },
    {
      "id": "zhangyu-0281",
      "name": "程咬金",
      "factionDisplayName": "草莽星火",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 4,
      "abilityDisplayNames": [
        "集贤"
      ],
      "abilityText": "集贤：打出后，从牌库打出其余同名牌。"
    },
    {
      "id": "zhangyu-0282",
      "name": "程咬金",
      "factionDisplayName": "草莽星火",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 4,
      "abilityDisplayNames": [
        "集贤"
      ],
      "abilityText": "集贤：打出后，从牌库打出其余同名牌。"
    },
    {
      "id": "zhangyu-0283",
      "name": "程咬金",
      "factionDisplayName": "草莽星火",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 4,
      "abilityDisplayNames": [
        "集贤"
      ],
      "abilityText": "集贤：打出后，从牌库打出其余同名牌。"
    },
    {
      "id": "zhangyu-0284",
      "name": "李密",
      "factionDisplayName": "草莽星火",
      "category": "unit",
      "rowDisplayName": "文脉",
      "strength": 6,
      "abilityDisplayNames": [
        "集贤"
      ],
      "abilityText": "集贤：打出后从牌库中立即打出所有程咬金到疆场。",
      "recruitTarget": "程咬金",
      "recruitTargetDisplayName": "程咬金",
      "recruitTargetOneWay": true
    },
    {
      "id": "zhangyu-0285",
      "name": "武松",
      "factionDisplayName": "草莽星火",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 4,
      "abilityDisplayNames": [],
      "abilityText": "无"
    },
    {
      "id": "zhangyu-0286",
      "name": "孙尚香",
      "factionDisplayName": "草莽星火",
      "category": "unit",
      "rowDisplayName": "疆场 / 朝堂",
      "strength": 2,
      "abilityDisplayNames": [
        "通才"
      ],
      "abilityText": "通才：可部署至卡牌标注的任一阵线。"
    },
    {
      "id": "zhangyu-0287",
      "name": "红拂女",
      "factionDisplayName": "草莽星火",
      "category": "unit",
      "rowDisplayName": "朝堂",
      "strength": 2,
      "abilityDisplayNames": [],
      "abilityText": "无"
    },
    {
      "id": "zhangyu-0111",
      "name": "关羽",
      "factionDisplayName": "草莽星火",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 6,
      "abilityDisplayNames": [
        "集贤"
      ],
      "abilityText": "集贤：打出后从牌库中立即打出「刘备」、「关羽」、「张飞」中的同组关联牌。",
      "recruitGroupDisplayName": "桃园三杰",
      "recruitGroupMembers": [
        "刘备",
        "关羽",
        "张飞"
      ]
    },
    {
      "id": "zhangyu-0112",
      "name": "张飞",
      "factionDisplayName": "草莽星火",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 6,
      "abilityDisplayNames": [
        "集贤"
      ],
      "abilityText": "集贤：打出后从牌库中立即打出「刘备」、「关羽」、「张飞」中的同组关联牌。",
      "recruitGroupDisplayName": "桃园三杰",
      "recruitGroupMembers": [
        "刘备",
        "关羽",
        "张飞"
      ]
    },
    {
      "id": "zhangyu-0113",
      "name": "刘备",
      "factionDisplayName": "草莽星火",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 6,
      "abilityDisplayNames": [
        "集贤"
      ],
      "abilityText": "集贤：打出后从牌库中立即打出「刘备」、「关羽」、「张飞」中的同组关联牌。",
      "recruitGroupDisplayName": "桃园三杰",
      "recruitGroupMembers": [
        "刘备",
        "关羽",
        "张飞"
      ]
    },
    {
      "id": "zhangyu-0107",
      "name": "吕布",
      "factionDisplayName": "草莽星火",
      "category": "hero",
      "rowDisplayName": "疆场",
      "strength": 10,
      "abilityDisplayNames": [
        "传世"
      ],
      "abilityText": "传世：战力不受时局、鼓舞、振势影响，也不会被奇策、请辞或济世选中。"
    },
    {
      "id": "zhangyu-0288",
      "name": "公孙胜",
      "factionDisplayName": "草莽星火",
      "category": "unit",
      "rowDisplayName": "文脉",
      "strength": 6,
      "abilityDisplayNames": [],
      "abilityText": "无"
    },
    {
      "id": "zhangyu-0289",
      "name": "宋江",
      "factionDisplayName": "草莽星火",
      "category": "unit",
      "rowDisplayName": "朝堂",
      "strength": 2,
      "abilityDisplayNames": [],
      "abilityText": "无"
    },
    {
      "id": "zhangyu-0290",
      "name": "典韦",
      "factionDisplayName": "草莽星火",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 6,
      "abilityDisplayNames": [],
      "abilityText": "无"
    },
    {
      "id": "zhangyu-0060",
      "name": "吴用",
      "factionDisplayName": "草莽星火",
      "category": "unit",
      "rowDisplayName": "文脉",
      "strength": 6,
      "abilityDisplayNames": [],
      "abilityText": "无"
    },
    {
      "id": "zhangyu-0108",
      "name": "窦建德",
      "factionDisplayName": "草莽星火",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 2,
      "abilityDisplayNames": [],
      "abilityText": "无"
    },
    {
      "id": "zhangyu-0291",
      "name": "常遇春",
      "factionDisplayName": "草莽星火",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 5,
      "abilityDisplayNames": [],
      "abilityText": "无"
    },
    {
      "id": "zhangyu-0292",
      "name": "杨再兴",
      "factionDisplayName": "草莽星火",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 5,
      "abilityDisplayNames": [],
      "abilityText": "无"
    },
    {
      "id": "zhangyu-0133",
      "name": "陆秀夫",
      "factionDisplayName": "草莽星火",
      "category": "unit",
      "rowDisplayName": "朝堂",
      "strength": 2,
      "abilityDisplayNames": [],
      "abilityText": "无"
    },
    {
      "id": "zhangyu-0120",
      "name": "张角",
      "factionDisplayName": "草莽星火",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 1,
      "abilityDisplayNames": [
        "集贤"
      ],
      "abilityText": "集贤：打出后，从牌库打出其余同名牌。"
    },
    {
      "id": "zhangyu-0293",
      "name": "张角",
      "factionDisplayName": "草莽星火",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 1,
      "abilityDisplayNames": [
        "集贤"
      ],
      "abilityText": "集贤：打出后，从牌库打出其余同名牌。"
    },
    {
      "id": "zhangyu-0294",
      "name": "张角",
      "factionDisplayName": "草莽星火",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 1,
      "abilityDisplayNames": [
        "集贤"
      ],
      "abilityText": "集贤：打出后，从牌库打出其余同名牌。"
    },
    {
      "id": "zhangyu-0295",
      "name": "冼夫人",
      "factionDisplayName": "草莽星火",
      "category": "unit",
      "rowDisplayName": "朝堂",
      "strength": 5,
      "abilityDisplayNames": [],
      "abilityText": "无"
    },
    {
      "id": "zhangyu-0296",
      "name": "马超",
      "factionDisplayName": "草莽星火",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 5,
      "abilityDisplayNames": [],
      "abilityText": "无"
    },
    {
      "id": "zhangyu-0115",
      "name": "梁红玉",
      "factionDisplayName": "草莽星火",
      "category": "unit",
      "rowDisplayName": "疆场 / 朝堂",
      "strength": 2,
      "abilityDisplayNames": [
        "通才"
      ],
      "abilityText": "通才：可部署至卡牌标注的任一阵线。"
    },
    {
      "id": "zhangyu-0297",
      "name": "桓温",
      "factionDisplayName": "草莽星火",
      "category": "unit",
      "rowDisplayName": "文脉",
      "strength": 5,
      "abilityDisplayNames": [],
      "abilityText": "无"
    },
    {
      "id": "zhangyu-0013",
      "name": "项羽",
      "factionDisplayName": "草莽星火",
      "category": "hero",
      "rowDisplayName": "疆场",
      "strength": 10,
      "abilityDisplayNames": [
        "传世"
      ],
      "abilityText": "传世：战力不受时局、鼓舞、振势影响，也不会被奇策、请辞或济世选中。"
    },
    {
      "id": "zhangyu-0042",
      "name": "穆桂英",
      "factionDisplayName": "草莽星火",
      "category": "hero",
      "rowDisplayName": "疆场 / 朝堂",
      "strength": 8,
      "abilityDisplayNames": [
        "传世",
        "振势",
        "通才"
      ],
      "abilityText": "传世、振势、通才：传世战力不受时局、鼓舞、振势影响，也不会被奇策、请辞或济世选中。振势使同一阵线的其他非传世人物各 +1 战力。通才可部署至卡牌标注的任一阵线。"
    },
    {
      "id": "zhangyu-0298",
      "name": "赵云",
      "factionDisplayName": "草莽星火",
      "category": "hero",
      "rowDisplayName": "朝堂",
      "strength": 10,
      "abilityDisplayNames": [
        "传世"
      ],
      "abilityText": "传世：战力不受时局、鼓舞、振势影响，也不会被奇策、请辞或济世选中。"
    },
    {
      "id": "zhangyu-0299",
      "name": "李逵",
      "factionDisplayName": "草莽星火",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 2,
      "abilityDisplayNames": [
        "集贤"
      ],
      "abilityText": "集贤：打出后，从牌库打出其余同名牌。"
    },
    {
      "id": "zhangyu-0300",
      "name": "李逵",
      "factionDisplayName": "草莽星火",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 2,
      "abilityDisplayNames": [
        "集贤"
      ],
      "abilityText": "集贤：打出后，从牌库打出其余同名牌。"
    },
    {
      "id": "zhangyu-0301",
      "name": "李逵",
      "factionDisplayName": "草莽星火",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 2,
      "abilityDisplayNames": [
        "集贤"
      ],
      "abilityText": "集贤：打出后，从牌库打出其余同名牌。"
    },
    {
      "id": "zhangyu-0302",
      "name": "吕母",
      "factionDisplayName": "草莽星火",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 5,
      "abilityDisplayNames": [],
      "abilityText": "无"
    },
    {
      "id": "zhangyu-0015",
      "name": "陈胜",
      "factionDisplayName": "草莽星火",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 4,
      "abilityDisplayNames": [
        "集贤"
      ],
      "abilityText": "集贤：打出后从牌库中立即打出「陈胜」、「吴广」、「彭越」、「项梁」、「刘秀」中的同组关联牌。",
      "recruitGroupDisplayName": "星火五雄",
      "recruitGroupMembers": [
        "陈胜",
        "吴广",
        "彭越",
        "项梁",
        "刘秀"
      ]
    },
    {
      "id": "zhangyu-0109",
      "name": "吴广",
      "factionDisplayName": "草莽星火",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 4,
      "abilityDisplayNames": [
        "集贤"
      ],
      "abilityText": "集贤：打出后从牌库中立即打出「陈胜」、「吴广」、「彭越」、「项梁」、「刘秀」中的同组关联牌。",
      "recruitGroupDisplayName": "星火五雄",
      "recruitGroupMembers": [
        "陈胜",
        "吴广",
        "彭越",
        "项梁",
        "刘秀"
      ]
    },
    {
      "id": "zhangyu-0303",
      "name": "彭越",
      "factionDisplayName": "草莽星火",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 4,
      "abilityDisplayNames": [
        "集贤"
      ],
      "abilityText": "集贤：打出后从牌库中立即打出「陈胜」、「吴广」、「彭越」、「项梁」、「刘秀」中的同组关联牌。",
      "recruitGroupDisplayName": "星火五雄",
      "recruitGroupMembers": [
        "陈胜",
        "吴广",
        "彭越",
        "项梁",
        "刘秀"
      ]
    },
    {
      "id": "zhangyu-0304",
      "name": "项梁",
      "factionDisplayName": "草莽星火",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 4,
      "abilityDisplayNames": [
        "集贤"
      ],
      "abilityText": "集贤：打出后从牌库中立即打出「陈胜」、「吴广」、「彭越」、「项梁」、「刘秀」中的同组关联牌。",
      "recruitGroupDisplayName": "星火五雄",
      "recruitGroupMembers": [
        "陈胜",
        "吴广",
        "彭越",
        "项梁",
        "刘秀"
      ]
    },
    {
      "id": "zhangyu-0014",
      "name": "刘秀",
      "factionDisplayName": "草莽星火",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 5,
      "abilityDisplayNames": [
        "集贤"
      ],
      "abilityText": "集贤：打出后从牌库中立即打出「陈胜」、「吴广」、「彭越」、「项梁」、「刘秀」中的同组关联牌。",
      "recruitGroupDisplayName": "星火五雄",
      "recruitGroupMembers": [
        "陈胜",
        "吴广",
        "彭越",
        "项梁",
        "刘秀"
      ]
    },
    {
      "id": "zhangyu-0119",
      "name": "李自成",
      "factionDisplayName": "草莽星火",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 5,
      "abilityDisplayNames": [],
      "abilityText": "无"
    },
    {
      "id": "zhangyu-0118",
      "name": "单雄信",
      "factionDisplayName": "草莽星火",
      "category": "unit",
      "rowDisplayName": "朝堂",
      "strength": 2,
      "abilityDisplayNames": [],
      "abilityText": "无"
    },
    {
      "id": "zhangyu-0305",
      "name": "方腊",
      "factionDisplayName": "草莽星火",
      "category": "unit",
      "rowDisplayName": "朝堂",
      "strength": 7,
      "abilityDisplayNames": [
        "奇策"
      ],
      "abilityText": "奇策：若对方朝堂总战力 ≥10，摧毁其朝堂当前战力最高的非传世人物。"
    },
    {
      "id": "zhangyu-0132",
      "name": "勾践",
      "factionDisplayName": "遗策复兴",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 4,
      "abilityDisplayNames": [
        "战俘"
      ],
      "abilityText": "战俘：被复国触发后转化为 14 点传世、振势人物。"
    },
    {
      "id": "zhangyu-0143",
      "name": "孙思邈",
      "factionDisplayName": "遗策复兴",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 2,
      "abilityDisplayNames": [
        "济世"
      ],
      "abilityText": "济世：从己方弃牌堆复归 1 张非传世人物。"
    },
    {
      "id": "zhangyu-0306",
      "name": "狄青",
      "factionDisplayName": "遗策复兴",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 6,
      "abilityDisplayNames": [],
      "abilityText": "无"
    },
    {
      "id": "zhangyu-0114",
      "name": "岳飞",
      "factionDisplayName": "遗策复兴",
      "category": "hero",
      "rowDisplayName": "疆场",
      "strength": 10,
      "abilityDisplayNames": [
        "传世",
        "集贤"
      ],
      "abilityText": "传世、集贤：传世战力不受时局、鼓舞、振势影响，也不会被奇策、请辞或济世选中。集贤：打出后从牌库和手牌中立即打出所有岳家军到己方疆场。"
    },
    {
      "id": "zhangyu-0307",
      "name": "牛皋",
      "factionDisplayName": "遗策复兴",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 6,
      "abilityDisplayNames": [
        "同盟"
      ],
      "abilityText": "同盟：同名同盟人物在同一阵线并列 N 张时，每张战力按 N 倍计算。"
    },
    {
      "id": "zhangyu-0308",
      "name": "牛皋",
      "factionDisplayName": "遗策复兴",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 6,
      "abilityDisplayNames": [
        "同盟"
      ],
      "abilityText": "同盟：同名同盟人物在同一阵线并列 N 张时，每张战力按 N 倍计算。"
    },
    {
      "id": "zhangyu-0309",
      "name": "牛皋",
      "factionDisplayName": "遗策复兴",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 6,
      "abilityDisplayNames": [
        "同盟"
      ],
      "abilityText": "同盟：同名同盟人物在同一阵线并列 N 张时，每张战力按 N 倍计算。"
    },
    {
      "id": "zhangyu-0310",
      "name": "俞大猷",
      "factionDisplayName": "遗策复兴",
      "category": "unit",
      "rowDisplayName": "朝堂",
      "strength": 6,
      "abilityDisplayNames": [],
      "abilityText": "无"
    },
    {
      "id": "zhangyu-0311",
      "name": "俞大猷",
      "factionDisplayName": "遗策复兴",
      "category": "unit",
      "rowDisplayName": "朝堂",
      "strength": 6,
      "abilityDisplayNames": [],
      "abilityText": "无"
    },
    {
      "id": "zhangyu-0312",
      "name": "俞大猷",
      "factionDisplayName": "遗策复兴",
      "category": "unit",
      "rowDisplayName": "朝堂",
      "strength": 6,
      "abilityDisplayNames": [],
      "abilityText": "无"
    },
    {
      "id": "zhangyu-0313",
      "name": "于谦",
      "factionDisplayName": "遗策复兴",
      "category": "unit",
      "rowDisplayName": "朝堂",
      "strength": 6,
      "abilityDisplayNames": [
        "奇策"
      ],
      "abilityText": "奇策：若对方朝堂总战力 ≥10，摧毁其朝堂当前战力最高的非传世人物。"
    },
    {
      "id": "zhangyu-0314",
      "name": "岳家军",
      "factionDisplayName": "遗策复兴",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 4,
      "abilityDisplayNames": [
        "同盟"
      ],
      "abilityText": "同盟：同名同盟人物在同一阵线并列 N 张时，每张战力按 N 倍计算。"
    },
    {
      "id": "zhangyu-0315",
      "name": "岳家军",
      "factionDisplayName": "遗策复兴",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 4,
      "abilityDisplayNames": [
        "同盟"
      ],
      "abilityText": "同盟：同名同盟人物在同一阵线并列 N 张时，每张战力按 N 倍计算。"
    },
    {
      "id": "zhangyu-0316",
      "name": "岳家军",
      "factionDisplayName": "遗策复兴",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 4,
      "abilityDisplayNames": [
        "同盟"
      ],
      "abilityText": "同盟：同名同盟人物在同一阵线并列 N 张时，每张战力按 N 倍计算。"
    },
    {
      "id": "zhangyu-0317",
      "name": "郑和",
      "factionDisplayName": "遗策复兴",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 4,
      "abilityDisplayNames": [],
      "abilityText": "无"
    },
    {
      "id": "zhangyu-0318",
      "name": "欧冶子",
      "factionDisplayName": "遗策复兴",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 4,
      "abilityDisplayNames": [],
      "abilityText": "无"
    },
    {
      "id": "zhangyu-0037",
      "name": "李如松",
      "factionDisplayName": "遗策复兴",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 4,
      "abilityDisplayNames": [],
      "abilityText": "无"
    },
    {
      "id": "zhangyu-0116",
      "name": "文天祥",
      "factionDisplayName": "遗策复兴",
      "category": "unit",
      "rowDisplayName": "文脉",
      "strength": 2,
      "abilityDisplayNames": [
        "鼓舞"
      ],
      "abilityText": "鼓舞：使己方指定阵线的所有非传世人物战力翻倍。"
    },
    {
      "id": "zhangyu-0319",
      "name": "范蠡",
      "factionDisplayName": "遗策复兴",
      "category": "hero",
      "rowDisplayName": "朝堂",
      "strength": 8,
      "abilityDisplayNames": [
        "传世",
        "复国"
      ],
      "abilityText": "传世：战力不受时局、鼓舞、振势影响，也不会被奇策、请辞或济世选中。\n复国：打出后触发所在朝堂线战俘人物转化。"
    },
    {
      "id": "zhangyu-0320",
      "name": "戚继光",
      "factionDisplayName": "遗策复兴",
      "category": "hero",
      "rowDisplayName": "朝堂",
      "strength": 10,
      "abilityDisplayNames": [
        "传世"
      ],
      "abilityText": "传世：战力不受时局、鼓舞、振势影响，也不会被奇策、请辞或济世选中。"
    },
    {
      "id": "zhangyu-0321",
      "name": "祖冲之",
      "factionDisplayName": "遗策复兴",
      "category": "unit",
      "rowDisplayName": "文脉",
      "strength": 4,
      "abilityDisplayNames": [],
      "abilityText": "无"
    },
    {
      "id": "zhangyu-0322",
      "name": "哪吒",
      "factionDisplayName": "遗策复兴",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 0,
      "abilityDisplayNames": [
        "召唤风火轮"
      ],
      "abilityText": "召唤：每次离开战场时，在己方疆场召唤 1 张 11 战力传世的「风火轮」。"
    },
    {
      "id": "zhangyu-0148",
      "name": "王安石",
      "factionDisplayName": "遗策复兴",
      "category": "unit",
      "rowDisplayName": "朝堂",
      "strength": 4,
      "abilityDisplayNames": [
        "集贤"
      ],
      "abilityText": "集贤：打出后，从牌库打出其余同名牌。"
    },
    {
      "id": "zhangyu-0323",
      "name": "王安石",
      "factionDisplayName": "遗策复兴",
      "category": "unit",
      "rowDisplayName": "朝堂",
      "strength": 4,
      "abilityDisplayNames": [
        "集贤"
      ],
      "abilityText": "集贤：打出后，从牌库打出其余同名牌。"
    },
    {
      "id": "zhangyu-0324",
      "name": "王安石",
      "factionDisplayName": "遗策复兴",
      "category": "unit",
      "rowDisplayName": "朝堂",
      "strength": 4,
      "abilityDisplayNames": [
        "集贤"
      ],
      "abilityText": "集贤：打出后，从牌库打出其余同名牌。"
    },
    {
      "id": "zhangyu-0117",
      "name": "辛弃疾",
      "factionDisplayName": "遗策复兴",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 6,
      "abilityDisplayNames": [],
      "abilityText": "无"
    },
    {
      "id": "zhangyu-0188",
      "name": "卧薪尝胆",
      "factionDisplayName": "遗策复兴",
      "category": "stratagem",
      "rowDisplayName": "",
      "strength": null,
      "abilityDisplayNames": [
        "复国"
      ],
      "abilityText": "复国：选择一条阵线，触发己方该线所有战俘人物转化。"
    },
    {
      "id": "zhangyu-0189",
      "name": "卧薪尝胆",
      "factionDisplayName": "遗策复兴",
      "category": "stratagem",
      "rowDisplayName": "",
      "strength": null,
      "abilityDisplayNames": [
        "复国"
      ],
      "abilityText": "复国：选择一条阵线，触发己方该线所有战俘人物转化。"
    },
    {
      "id": "zhangyu-0325",
      "name": "卧薪尝胆",
      "factionDisplayName": "遗策复兴",
      "category": "stratagem",
      "rowDisplayName": "",
      "strength": null,
      "abilityDisplayNames": [
        "复国"
      ],
      "abilityText": "复国：选择一条阵线，触发己方该线所有战俘人物转化。"
    },
    {
      "id": "zhangyu-0326",
      "name": "徐光启",
      "factionDisplayName": "遗策复兴",
      "category": "unit",
      "rowDisplayName": "疆场 / 朝堂",
      "strength": 12,
      "abilityDisplayNames": [
        "通才",
        "振势"
      ],
      "abilityText": "通才、振势：可部署到卡牌标注的任一阵线。为同一阵线的其他非传世人物各加 1 点战力。"
    },
    {
      "id": "zhangyu-0147",
      "name": "高拱",
      "factionDisplayName": "遗策复兴",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 4,
      "abilityDisplayNames": [],
      "abilityText": "无"
    },
    {
      "id": "zhangyu-0199",
      "name": "海瑞",
      "factionDisplayName": "遗策复兴",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 4,
      "abilityDisplayNames": [],
      "abilityText": "无"
    },
    {
      "id": "zhangyu-0327",
      "name": "宋应星",
      "factionDisplayName": "遗策复兴",
      "category": "unit",
      "rowDisplayName": "文脉",
      "strength": 6,
      "abilityDisplayNames": [
        "同盟"
      ],
      "abilityText": "同盟：同名同盟人物在同一阵线并列 N 张时，每张战力按 N 倍计算。"
    },
    {
      "id": "zhangyu-0328",
      "name": "宋应星",
      "factionDisplayName": "遗策复兴",
      "category": "unit",
      "rowDisplayName": "文脉",
      "strength": 6,
      "abilityDisplayNames": [
        "同盟"
      ],
      "abilityText": "同盟：同名同盟人物在同一阵线并列 N 张时，每张战力按 N 倍计算。"
    },
    {
      "id": "zhangyu-0329",
      "name": "宋应星",
      "factionDisplayName": "遗策复兴",
      "category": "unit",
      "rowDisplayName": "文脉",
      "strength": 6,
      "abilityDisplayNames": [
        "同盟"
      ],
      "abilityText": "同盟：同名同盟人物在同一阵线并列 N 张时，每张战力按 N 倍计算。"
    },
    {
      "id": "zhangyu-0134",
      "name": "文种",
      "factionDisplayName": "遗策复兴",
      "category": "unit",
      "rowDisplayName": "朝堂",
      "strength": 2,
      "abilityDisplayNames": [
        "战俘"
      ],
      "abilityText": "战俘：被复国触发后转化为 8 点同盟人物。"
    },
    {
      "id": "zhangyu-0330",
      "name": "文种",
      "factionDisplayName": "遗策复兴",
      "category": "unit",
      "rowDisplayName": "朝堂",
      "strength": 2,
      "abilityDisplayNames": [
        "战俘"
      ],
      "abilityText": "战俘：被复国触发后转化为 8 点同盟人物。"
    },
    {
      "id": "zhangyu-0331",
      "name": "文种",
      "factionDisplayName": "遗策复兴",
      "category": "unit",
      "rowDisplayName": "朝堂",
      "strength": 2,
      "abilityDisplayNames": [
        "战俘"
      ],
      "abilityText": "战俘：被复国触发后转化为 8 点同盟人物。"
    },
    {
      "id": "zhangyu-0001",
      "name": "刘邦",
      "factionDisplayName": "开国群雄",
      "category": "leader",
      "rowDisplayName": "",
      "strength": null,
      "abilityDisplayNames": [],
      "abilityText": "从牌组选择 1 张党争迷局打出。"
    },
    {
      "id": "zhangyu-0002",
      "name": "李世民",
      "factionDisplayName": "开国群雄",
      "category": "leader",
      "rowDisplayName": "",
      "strength": null,
      "abilityDisplayNames": [],
      "abilityText": "清除场上全部时局效果。"
    },
    {
      "id": "zhangyu-0003",
      "name": "秦穆公",
      "factionDisplayName": "开国群雄",
      "category": "leader",
      "rowDisplayName": "",
      "strength": null,
      "abilityDisplayNames": [],
      "abilityText": "使己方文脉线所有非传世人物战力翻倍。"
    },
    {
      "id": "zhangyu-0004",
      "name": "赵匡胤",
      "factionDisplayName": "开国群雄",
      "category": "leader",
      "rowDisplayName": "",
      "strength": null,
      "abilityDisplayNames": [],
      "abilityText": "对方文脉线总战力满 10 时摧毁全部最强非传世人物。"
    },
    {
      "id": "zhangyu-0332",
      "name": "刘彻",
      "factionDisplayName": "开国群雄",
      "category": "leader",
      "rowDisplayName": "",
      "strength": null,
      "abilityDisplayNames": [],
      "abilityText": "对方朝堂线总战力满 10 时摧毁全部最强非传世人物。"
    },
    {
      "id": "zhangyu-0006",
      "name": "张仪",
      "factionDisplayName": "纵横权谋",
      "category": "leader",
      "rowDisplayName": "",
      "strength": null,
      "abilityDisplayNames": [],
      "abilityText": "侦察对手随机 3 张手牌。"
    },
    {
      "id": "zhangyu-0007",
      "name": "曹操",
      "factionDisplayName": "纵横权谋",
      "category": "leader",
      "rowDisplayName": "",
      "strength": null,
      "abilityDisplayNames": [],
      "abilityText": "从牌组选择 1 张典籍散佚打出。"
    },
    {
      "id": "zhangyu-0333",
      "name": "秦昭襄王",
      "factionDisplayName": "纵横权谋",
      "category": "leader",
      "rowDisplayName": "",
      "strength": null,
      "abilityDisplayNames": [],
      "abilityText": "双方济世复归改为随机目标。"
    },
    {
      "id": "zhangyu-0005",
      "name": "管仲",
      "factionDisplayName": "纵横权谋",
      "category": "leader",
      "rowDisplayName": "",
      "strength": null,
      "abilityDisplayNames": [],
      "abilityText": "从对手弃牌堆取 1 张牌加入手牌。"
    },
    {
      "id": "zhangyu-0008",
      "name": "司马懿",
      "factionDisplayName": "纵横权谋",
      "category": "leader",
      "rowDisplayName": "",
      "strength": null,
      "abilityDisplayNames": [],
      "abilityText": "封锁对手主将技能。"
    },
    {
      "id": "zhangyu-0009",
      "name": "孔子",
      "factionDisplayName": "百家争鸣",
      "category": "leader",
      "rowDisplayName": "",
      "strength": null,
      "abilityDisplayNames": [],
      "abilityText": "开局额外抽 1 张牌。"
    },
    {
      "id": "zhangyu-0334",
      "name": "惠施",
      "factionDisplayName": "百家争鸣",
      "category": "leader",
      "rowDisplayName": "",
      "strength": null,
      "abilityDisplayNames": [],
      "abilityText": "将己方通才人物移动到更优战线。"
    },
    {
      "id": "zhangyu-0010",
      "name": "老子",
      "factionDisplayName": "百家争鸣",
      "category": "leader",
      "rowDisplayName": "",
      "strength": null,
      "abilityDisplayNames": [],
      "abilityText": "从牌组选择 1 张边患四起打出。"
    },
    {
      "id": "zhangyu-0335",
      "name": "吴起",
      "factionDisplayName": "百家争鸣",
      "category": "leader",
      "rowDisplayName": "",
      "strength": null,
      "abilityDisplayNames": [],
      "abilityText": "对方疆场线总战力满 10 时摧毁全部最强非传世人物。"
    },
    {
      "id": "zhangyu-0336",
      "name": "董仲舒",
      "factionDisplayName": "百家争鸣",
      "category": "leader",
      "rowDisplayName": "",
      "strength": null,
      "abilityDisplayNames": [],
      "abilityText": "使己方朝堂线所有非传世人物战力翻倍。"
    },
    {
      "id": "zhangyu-0337",
      "name": "朱元璋",
      "factionDisplayName": "草莽星火",
      "category": "leader",
      "rowDisplayName": "",
      "strength": null,
      "abilityDisplayNames": [],
      "abilityText": "双方非传世出使人物战力翻倍。"
    },
    {
      "id": "zhangyu-0338",
      "name": "刘裕",
      "factionDisplayName": "草莽星火",
      "category": "leader",
      "rowDisplayName": "",
      "strength": null,
      "abilityDisplayNames": [],
      "abilityText": "从己方弃牌堆取 1 张牌加入手牌。"
    },
    {
      "id": "zhangyu-0339",
      "name": "石勒",
      "factionDisplayName": "草莽星火",
      "category": "leader",
      "rowDisplayName": "",
      "strength": null,
      "abilityDisplayNames": [],
      "abilityText": "使己方疆场线所有非传世人物战力翻倍。"
    },
    {
      "id": "zhangyu-0016",
      "name": "黄巢",
      "factionDisplayName": "草莽星火",
      "category": "leader",
      "rowDisplayName": "",
      "strength": null,
      "abilityDisplayNames": [],
      "abilityText": "弃置 2 张手牌，从牌库选 1 张。"
    },
    {
      "id": "zhangyu-0340",
      "name": "朱温",
      "factionDisplayName": "草莽星火",
      "category": "leader",
      "rowDisplayName": "",
      "strength": null,
      "abilityDisplayNames": [],
      "abilityText": "从牌组选择任意 1 张时局牌打出。"
    },
    {
      "id": "zhangyu-0017",
      "name": "司马迁",
      "factionDisplayName": "遗策复兴",
      "category": "leader",
      "rowDisplayName": "",
      "strength": null,
      "abilityDisplayNames": [],
      "abilityText": "双方弃牌堆洗回各自牌库。"
    },
    {
      "id": "zhangyu-0018",
      "name": "张居正",
      "factionDisplayName": "遗策复兴",
      "category": "leader",
      "rowDisplayName": "",
      "strength": null,
      "abilityDisplayNames": [],
      "abilityText": "己方单位在恶劣时局下仅损失一半战力。"
    }
  ],
  "tokens": [
    {
      "id": "token-越王勾践",
      "name": "越王勾践",
      "displayName": "越王勾践",
      "factionDisplayName": "遗策复兴",
      "category": "hero",
      "rowDisplayName": "疆场",
      "strength": 14,
      "abilityDisplayNames": [
        "传世",
        "振势"
      ],
      "abilityText": "战俘转化\n传世：战力不受时局、鼓舞、振势影响，也不会被奇策、请辞或济世选中。\n振势：同一阵线的其他非传世人物各 +1 战力。"
    },
    {
      "id": "token-越相文种",
      "name": "越相文种",
      "displayName": "越相文种",
      "factionDisplayName": "遗策复兴",
      "category": "unit",
      "rowDisplayName": "朝堂",
      "strength": 8,
      "abilityDisplayNames": [
        "同盟"
      ],
      "abilityText": "战俘转化\n同盟：同名同盟人物在同一阵线并列 N 张时，每张战力按 N 倍计算。"
    },
    {
      "id": "token-哮天犬",
      "name": "哮天犬",
      "displayName": "哮天犬",
      "factionDisplayName": "天下共识",
      "category": "unit",
      "rowDisplayName": "疆场",
      "strength": 8,
      "abilityDisplayNames": [],
      "abilityText": "杨戬离开战场后召唤"
    },
    {
      "id": "token-风火轮",
      "name": "风火轮",
      "displayName": "风火轮",
      "factionDisplayName": "遗策复兴",
      "category": "hero",
      "rowDisplayName": "疆场",
      "strength": 11,
      "abilityDisplayNames": [
        "传世"
      ],
      "abilityText": "哪吒离开战场后召唤\n传世：战力不受时局、鼓舞、振势影响，也不会被奇策、请辞或济世选中。"
    }
  ]
};

module.exports = DATA;
