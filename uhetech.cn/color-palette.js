// color-palette.js - V2.0.0 (Massively Expanded Library)

// 在此定义颜色单词与十六进制代码的映射。
// 这个库被极大地扩展了，包含了数百种精心命名和分类的颜色。
// 在 data.js 中，通过使用这里的键名来为文本指定颜色。

const colorPalette = {
    // =========================================================================
    // --- 项目核心主题色 (Project Core & Faction Colors) ---
    // =========================================================================
    
    // --- 帝国与盟友 (Empire & Allies) ---
    imperialGold: '#FFD700',      // 人类帝国 - 荣耀、核心
    darkGold: '#8C6A3C',          // 暗金色 - 宪章法、法典暗金主题
    imperialBlue: '#003366',      // 人类帝国 - 科技、庄重
    sovietRed: '#CD2626',         // 最高委员会 - 权力、警告
    onyxBlack: '#353839',         // 黑石阵 - 神秘、坚固
    adminBureauBlue: '#4682B4',   // 对外殖民管理局 - 海洋、扩张
    maritimeGuardAqua: '#00A499', // 海事警戒局 - 海洋、警戒
    scienceMinistryCyan: '#00AEEF',// 科技部 - 科技、未来
    
    // --- 敌对势力 (Enemy Factions) ---
    goatEmpireBrown: '#8B4513',   // 山羊帝国 - 大地、腐朽
    fabreGreen: '#556B2F',        // 法布尔 - 昆虫、剧毒
    wolfLordCrimson: '#DC143C',   // 狼主 - 鲜血、暴力
    zhePartyMagenta: '#FF00FF',    // 哲党 - 异端、欲望
    zombieBile: '#8FBC8F',        // 丧尸 - 瘟疫、腐烂

    // =========================================================================
    // --- 通用色彩库 (General Purpose Color Library) ---
    // =========================================================================

    // --- 中性色与灰色系 (Neutrals & Greys) ---
    white: '#FFFFFF',             // 纯白
    ivory: '#FFFFF0',             // 象牙白
    snow: '#FFFAFA',              // 雪白
    seashell: '#FFF5EE',          // 海贝色
    floralWhite: '#FFFAF0',       // 花白色
    ghostWhite: '#F8F8FF',        // 幽灵白
    smoke: '#F5F5F5',             // 烟白色
    lightGray: '#D3D3D3',         // 亮灰色
    silver: '#C0C0C0',            // 银色
    gainsboro: '#DCDCDC',         // 淡灰色
    gray: '#808080',              // 标准灰色
    dimGray: '#696969',           // 暗灰色
    slateGray: '#708090',         // 石板灰
    charcoal: '#36454F',          // 木炭色
    gunmetal: '#2C3539',          // 炮铜色
    black: '#3d3d3d',             // 项目默认黑
    trueBlack: '#000000',         // 纯黑

    // --- 红色与粉色系 (Reds & Pinks) ---
    lightSalmon: '#FFA07A',       // 亮鲑鱼色
    salmon: '#FA8072',            // 鲑鱼色
    scarlet: '#FF2400',           // 猩红色
    tomato: '#FF6347',            // 番茄红
    coral: '#FF7F50',             // 珊瑚红
    crimson: '#DC143C',           // 深红
    red: '#FF0000',               // 纯红
    firebrick: '#B22222',         // 砖红
    darkRed: '#8B0000',           // 暗红
    maroon: '#800000',            // 栗色
    bloodRed: '#8b0000',          // 血红
    rose: '#FF007F',              // 玫瑰色
    pink: '#FFC0CB',              // 粉色
    lightPink: '#FFB6C1',         // 亮粉色
    hotPink: '#FF69B4',           // 热情粉
    deepPink: '#FF1493',          // 深粉色
    fuchsia: '#FF00FF',           // 紫红色
    magenta: '#FF00FF',           // 品红
    blush: '#DE5D83',             // 腮红
    rosewood: '#65000B',          // 红木色

    // --- 橙色与黄色系 (Oranges & Yellows) ---
    orange: '#FFA500',            // 橙色
    darkOrange: '#FF8C00',        // 暗橙
    fireOrange: '#FF4500',        // 火橙色
    apricot: '#FBCEB1',           // 杏色
    tangerine: '#F28500',         // 橘色
    rust: '#B7410E',              // 铁锈色
    gold: '#FFD700',              // 金色
    yellow: '#FFFF00',            // 黄色
    lightYellow: '#FFFFE0',        // 亮黄
    lemon: '#FFFACD',             // 柠檬色
    khaki: '#F0E68C',             // 卡其色
    mustard: '#FFDB58',           // 芥末黄
    amber: '#FFBF00',             // 琥珀色
    sunYellow: '#FFC72C',         // 太阳黄
    warningYellow: '#FFFF00',     // 警告黄

    // --- 绿色系 (Greens) ---
    chartreuse: '#7FFF00',        // 黄绿色
    lime: '#00FF00',              // 酸橙绿
    lawnGreen: '#7CFC00',         // 草坪绿
    springGreen: '#00FF7F',       // 春绿色
    mint: '#3EB489',              // 薄荷绿
    seafoam: '#98FF98',           // 海泡石绿
    forestGreen: '#228B22',       // 森林绿
    green: '#008000',             // 纯绿
    darkGreen: '#006400',         // 暗绿
    olive: '#808000',             // 橄榄绿
    avocado: '#568203',           // 牛油果绿
    jungleGreen: '#29AB87',       // 丛林绿
    sage: '#BCB88A',              // 鼠尾草绿
    viridian: '#40826D',          // 维里迪安绿

    // --- 青色与蓝绿色系 (Cyans & Teals) ---
    cyan: '#00FFFF',              // 青色
    aqua: '#00FFFF',              // 水绿色
    lightCyan: '#E0FFFF',         // 亮青色
    turquoise: '#40E0D0',         // 绿松石色
    teal: '#008080',              // 蓝绿色
    darkCyan: '#008B8B',          // 暗青色
    cadetBlue: '#5F9EA0',         // 军校蓝
    seaGreen: '#2E8B57',          // 海绿色
    mediumAquaMarine: '#66CDAA',  // 中绿玉色

    // --- 蓝色系 (Blues) ---
    skyBlue: '#87CEEB',           // 天蓝色
    deepSkyBlue: '#00BFFF',       // 深天蓝
    powderBlue: '#B0E0E6',        // 粉蓝色
    steelBlue: '#4682B4',         // 钢蓝色
    dodgerBlue: '#1E90FF',        // 道奇蓝
    royalBlue: '#4169E1',         // 宝蓝
    blue: '#0000FF',              // 纯蓝
    mediumBlue: '#0000CD',        // 中蓝
    darkBlue: '#00008B',          // 暗蓝
    navy: '#000080',              // 海军蓝
    midnightBlue: '#191970',      // 午夜蓝
    indigo: '#4B0082',            // 靛蓝
    cobalt: '#0047AB',            // 钴蓝
    azure: '#007FFF',             // 蔚蓝
    iceBlue: '#ADD8E6',           // 冰蓝
    deepseaBlue: '#000080',       // 深海蓝
    stormyGray: '#708090',        // 暴风雨灰(偏蓝)

    // --- 紫色与品红色系 (Purples & Violets) ---
    lavender: '#E6E6FA',          // 薰衣草紫
    thistle: '#D8BFD8',           // 蓟色
    plum: '#DDA0DD',              // 李子紫
    violet: '#EE82EE',            // 紫罗兰
    orchid: '#DA70D6',            // 兰花紫
    purple: '#800080',            // 纯紫
    mediumPurple: '#9370DB',      // 中紫
    darkViolet: '#9400D3',        // 暗紫罗兰
    blueViolet: '#8A2BE2',        // 蓝紫色
    amethyst: '#9966CC',          // 紫水晶色
    royalPurple: '#8A2BE2',       // 皇家紫
    shadowPurple: '#483D8B',      // 暗影紫
    nebulaPurple: '#9370DB',      // 星云紫
    cyberPink: '#FF007F',         // 赛博粉

    // --- 棕色与大地色系 (Browns & Earth Tones) ---
    tan: '#D2B48C',               // 棕褐色
    sand: '#C2B280',              // 沙色
    beige: '#F5F5DC',             // 米色
    wheat: '#F5DEB3',             // 小麦色
    burlyWood: '#DEB887',         // 硬木色
    sienna: '#A0522D',            // 赭色
    saddleBrown: '#8B4513',       // 鞍褐色
    chocolate: '#D2691E',         // 巧克力色
    peru: '#CD853F',              // 秘鲁色
    earthBrown: '#A0522D',        // 大地棕
    coffee: '#6F4E37',            // 咖啡色
    walnut: '#593A27',            // 胡桃色
    umber: '#635147',             // 焦茶色
    desertSand: '#EDC9AF',        // 沙漠黄

    // --- 柔和的粉彩色系 (Soft Pastels) ---
    pastelPink: '#FFD1DC',        // 粉彩粉
    pastelOrange: '#FFB347',      // 粉彩橙
    pastelYellow: '#FFFFAA',      // 粉彩黄
    pastelGreen: '#B3EFA9',       // 粉彩绿
    pastelBlue: '#AEC6CF',        // 粉彩蓝
    pastelPurple: '#C3B1E1',      // 粉彩紫
    lavenderBlush: '#FFF0F5',     // 淡紫红
    mistyRose: '#FFE4E1',         // 薄雾玫瑰
    peach: '#FFE5B4',             // 桃色

    // --- 高级灰与柔和色系 (Muted & Desaturated Tones) ---
    taupe: '#483C32',             // 灰褐色
    dustyRose: '#9A6A69',         // 尘土玫瑰
    sageGreen: '#87AE73',         // 鼠尾草绿
    slateBlue: '#6A5ACD',         // 石板蓝
    oldLace: '#FDF5E6',           // 旧蕾丝色
    ashGray: '#B2BEB5',           // 灰烬色
    coolGray: '#8C92AC',          // 冷灰色
    warmGray: '#A69E94',          // 暖灰色
    stone: '#8A795D',             // 石头色

    // --- 明亮与霓虹色系 (Vibrant & Neons) ---
    electricLime: '#CCFF00',      // 电光绿
    electricBlue: '#7DF9FF',      // 电光蓝
    electricPurple: '#BF00FF',    // 电光紫
    neonPink: '#FF00A6',          // 霓虹粉
    neonOrange: '#FF5F00',        // 霓虹橙
    neonYellow: '#FFF000',        // 霓虹黄
    vibrantRed: '#EE0000',        // 活力红
    vibrantGreen: '#00DD00',      // 活力绿
    vibrantBlue: '#0077FF',       // 活力蓝
    
    // --- 金属与宝石色系 (Metallics & Gemstones) ---
    polishedGold: '#FFD700',      // 抛光金
    polishedSilver: '#C0C0C0',    // 抛光银
    bronze: '#CD7F32',            // 青铜
    copper: '#B87333',            // 黄铜
    platinum: '#E5E4E2',          // 铂金
    steel: '#B0C4DE',             // 钢铁
    brass: '#E1C16E',             // 红铜
    pewter: '#899499',            // 白镴
    ruby: '#E0115F',              // 红宝石
    emerald: '#50C878',           // 祖母绿
    sapphire: '#0F52BA',          // 蓝宝石
    topaz: '#FFC87C',             // 托帕石
    garnet: '#9A2A2A',            // 石榴石
    jade: '#00A86B',              // 翡翠
    peridot: '#B4C424',           // 橄榄石
    volcanicRed: '#D21F3C'        // 火山红
};

// 将颜色库挂载到 window 对象，以便 script.js 可以访问
window.colorPalette = colorPalette;
