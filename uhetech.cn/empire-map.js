// empire-map.js - Imperial territorial map console

(function () {
  const MAP_DATA_URL = '/map-world-110m.geojson';
  const MAPBOX_STYLE_URL = '/empire-mapbox-style.json';
  const MAP_LOCAL_ROADS_URL = '/empire-map-local-roads.geojson';
  const MAP_LOCAL_CONTOURS_URL = '/empire-map-local-contours.geojson';
  const SVG_NS = 'http://www.w3.org/2000/svg';
  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  const COUNTRY_ALIASES = {
    'East Timor': 'TLS',
    'Timor-Leste': 'TLS',
  };

  const SOUTH_AMERICA_ISOS = [
    'ARG',
    'BOL',
    'BRA',
    'CHL',
    'COL',
    'ECU',
    'GUY',
    'PRY',
    'PER',
    'SUR',
    'URY',
    'VEN',
    'FLK',
  ];

  const SOUTHEAST_ASIA_ISOS = [
    'BRN',
    'KHM',
    'IDN',
    'LAO',
    'MYS',
    'MMR',
    'PHL',
    'SGP',
    'THA',
    'TLS',
    'VNM',
  ];

  const REGION_DEFINITIONS = {
    australia: {
      name: '澳大利亚本土',
      label: 'CORE',
      statusLabel: '核心领土',
      isos: ['AUS'],
      accent: '#35b6ff',
      coordinates: [149.13, -35.28],
      summary:
        '澳大利亚是人类帝国的核心领土，也是末世后帝国政治、军事与复活体系的重心所在。',
      details:
        '堪培拉作为人类帝国的政治和军事中心，承担最高委员会、总理府、复活中心体系与本土防务的枢纽职责。第四次远征后，澳大利亚本土暴露出海域拒止力量不足的问题，海事警戒局随之建立，本土防卫成为帝国恢复海外疆域前最重要的战略基座。',
    },
    newZealand: {
      name: '新西兰殖民地',
      label: 'SCI/PRISON',
      statusLabel: '科研与监狱辖区',
      isos: ['NZL'],
      accent: '#f2c14e',
      coordinates: [174.76, -41.29],
      summary:
        '新西兰殖民地与帝国同寿，长期承担科研基地与特殊监狱职能。',
      details:
        '北岛是帝国最大的科研基地之一，致力于恢复帝国纪元前的技术体系；南岛设有特殊监狱，用于管辖因复活中心体系而无法简单处以极刑的囚犯。第四次远征期间新西兰遭法布尔冲击，但按当前设定，远征结束后新西兰回到帝国控制。',
    },
    southAmerica: {
      name: '南美洲殖民地',
      label: 'RAW MATERIALS',
      statusLabel: '资源殖民地',
      isos: SOUTH_AMERICA_ISOS,
      accent: '#44c48c',
      coordinates: [-56.16, -34.9],
      summary:
        '南美洲殖民地由 Heinrich 在开拓年代初期建立，首都为蒙得维的亚。',
      details:
        '山羊帝国覆灭后，最高委员会决定拓展新的生存空间。南美殖民地在十五年间清除残余丧尸、重整废弃城市并建立武装，成为帝国最重要的原材料殖民地，向澳大利亚输送原木、橡胶、水果等资源。第四次远征后该地区一度丧失，第五次远征中由 LJY 与赵纯浩重建，并逐步恢复职能。',
    },
    southeastAsia: {
      name: '西太平洋殖民地',
      label: 'WPC',
      statusLabel: '前进殖民地',
      isos: SOUTHEAST_ASIA_ISOS,
      accent: '#00aeff',
      coordinates: [106.84, -6.2],
      summary:
        '西太平洋殖民地以印度尼西亚和东南亚为核心，承担拱卫本土与攫取资源的战略任务。',
      details:
        '开拓年代末期，帝国为摆脱对南美原材料的过度依赖，并清缴法布尔势力，授权 NULL 前往印度尼西亚建设殖民地。第四次远征前期，东南亚大部分地区被解放，殖民地一度扩张到大连；但随着 YS 叛变、NULL 被丧尸转化，西太平洋殖民地陷入混乱并丧失。第五次远征中，WQC 收复印尼地区。',
    },
    dalian: {
      name: '大连前沿节点',
      label: 'DALIAN',
      statusLabel: '远征最北端',
      isos: [],
      accent: '#8bd9ff',
      coordinates: [121.61, 38.91],
      pointOnly: true,
      summary:
        '大连是西太平洋殖民地极盛时期的北向扩张标记。',
      details:
        '西太平洋殖民地在 NULL 领导下进展顺利，一度扩张到大连。地图中以节点标记呈现，表示第四次远征前段的远征边界，而不是稳定行政区。',
    },
    europeContact: {
      name: '欧洲联络航线',
      label: 'EU CONTACT',
      statusLabel: '未达成目标',
      isos: [],
      accent: '#b8c7ff',
      coordinates: [12.5, 42.5],
      pointOnly: true,
      summary:
        '第五次远征期间，Sulejmani 曾试图重返欧洲并建立幸存者联络。',
      details:
        '欧洲之行遭到姜王水母偷袭，船队损伤惨重，被迫终止任务。地图以虚线航路和节点记录这次未能稳定转化为疆域控制的战略尝试。',
    },
  };

  const AUSTRALIA_FOCUS_SITES = [
    {
      id: 'canberra',
      name: '堪培拉',
      label: 'CAPITAL',
      coordinates: [149.13, -35.28],
      labelOffset: [-38, -15],
      detailZoom: 1,
      title: '最高委员会 / 帝国情报局总部',
      role: '人类帝国首都',
      detail:
        '堪培拉是人类帝国的政治与军事中枢，最高委员会和帝国情报局总部均设于此处，负责统合本土防务、复活中心安全、远征授权与殖民地情报评估。',
    },
    {
      id: 'nikenbah',
      name: '奈克姆近郊',
      label: 'MSA',
      coordinates: [152.8153, -25.3188],
      labelOffset: [-52, -18],
      detailZoom: 1,
      title: '海事警戒局总部',
      role: '昆士兰海事预警节点',
      detail:
        '海事警戒局总部设在昆士兰州奈克姆附近，承担帝国东岸与珊瑚海方向的海事监控、异常航迹预警和本土海域封锁调度。',
    },
    {
      id: 'sydney',
      name: '悉尼',
      label: 'OCMA',
      coordinates: [151.2093, -33.8688],
      labelOffset: [18, 15],
      detailZoom: 1,
      title: '对外殖民管理局总部',
      role: '海外行政接口',
      detail:
        '悉尼是对外殖民管理局总部所在地，负责海外殖民地行政档案、殖民官派驻、资源配给审批和本土与海外据点之间的民政联络。',
    },
  ];

  const AUSTRALIA_FOCUS_ROUTES = [
    {
      id: 'east-coast-command',
      coordinates: [
        [149.13, -35.28],
        [151.2093, -33.8688],
        [152.8153, -25.3188],
        [153.026, -27.47],
      ],
    },
    {
      id: 'southern-logistics',
      coordinates: [
        [115.86, -31.95],
        [138.6, -34.93],
        [144.96, -37.81],
        [149.13, -35.28],
        [151.2093, -33.8688],
      ],
    },
    {
      id: 'interior-watch',
      coordinates: [
        [130.84, -12.46],
        [133.88, -23.7],
        [138.6, -34.93],
        [149.13, -35.28],
      ],
    },
  ];

  const AUSTRALIA_ADMIN_LINES = [
    [[129, -14.8], [129, -31.8]],
    [[129, -26], [138, -26]],
    [[138, -17], [138, -26]],
    [[141, -26], [141, -38.1]],
    [[141, -28.16], [153.55, -28.16]],
    [[141, -33.95], [150.05, -33.95]],
    [[138, -26], [141, -26]],
  ];

  const AUSTRALIA_TERRAIN_AREAS = [
    {
      id: 'western-desert',
      coordinates: [
        [117.2, -22.7],
        [123.8, -20.8],
        [130.4, -23.1],
        [130.0, -28.8],
        [124.6, -31.0],
        [119.2, -29.2],
      ],
    },
    {
      id: 'central-desert',
      coordinates: [
        [131.2, -22.6],
        [137.8, -23.1],
        [139.1, -28.0],
        [135.8, -30.9],
        [130.9, -29.1],
      ],
    },
    {
      id: 'north-queensland',
      coordinates: [
        [143.4, -15.3],
        [150.1, -16.6],
        [151.0, -21.4],
        [147.1, -23.3],
        [142.6, -21.2],
      ],
    },
    {
      id: 'tasmania-highlands',
      coordinates: [
        [145.0, -41.4],
        [147.5, -41.9],
        [148.0, -43.4],
        [146.1, -43.9],
        [144.5, -42.8],
      ],
    },
  ];

  const AUSTRALIA_INLAND_WATERS = [
    {
      id: 'lake-eyre',
      coordinates: [
        [136.2, -27.7],
        [137.4, -27.6],
        [138.0, -28.6],
        [137.2, -29.3],
        [135.8, -29.1],
        [135.6, -28.3],
      ],
    },
    {
      id: 'lake-torrens',
      coordinates: [
        [137.5, -30.1],
        [138.2, -30.4],
        [138.3, -31.7],
        [137.7, -32.0],
        [137.2, -31.1],
      ],
    },
    {
      id: 'lake-gairdner',
      coordinates: [
        [135.0, -31.0],
        [136.2, -31.1],
        [136.1, -32.0],
        [135.2, -32.1],
        [134.8, -31.6],
      ],
    },
    {
      id: 'lake-amadeus',
      coordinates: [
        [130.4, -24.2],
        [132.6, -24.4],
        [132.4, -25.0],
        [130.7, -24.9],
      ],
    },
  ];

  const AUSTRALIA_ROADS = [
    {
      id: 'east-coast',
      className: 'major',
      coordinates: [
        [145.77, -16.92],
        [146.82, -19.26],
        [149.19, -21.14],
        [150.51, -23.38],
        [153.03, -27.47],
        [153.55, -28.65],
        [151.78, -32.93],
        [151.21, -33.87],
        [149.13, -35.28],
        [144.96, -37.81],
      ],
    },
    {
      id: 'pacific-corridor',
      className: 'secondary',
      coordinates: [
        [153.03, -27.47],
        [153.43, -28.02],
        [153.55, -28.65],
        [153.13, -30.30],
        [151.78, -32.93],
        [151.21, -33.87],
      ],
    },
    {
      id: 'hume-corridor',
      className: 'major',
      coordinates: [
        [151.21, -33.87],
        [150.77, -34.42],
        [149.13, -35.28],
        [147.37, -35.12],
        [146.92, -36.08],
        [145.04, -37.02],
        [144.96, -37.81],
      ],
    },
    {
      id: 'princes-corridor',
      className: 'secondary',
      coordinates: [
        [151.21, -33.87],
        [150.89, -34.42],
        [150.06, -35.72],
        [149.73, -36.22],
        [148.45, -37.88],
        [145.79, -38.15],
        [144.96, -37.81],
      ],
    },
    {
      id: 'newell-corridor',
      className: 'secondary',
      coordinates: [
        [153.03, -27.47],
        [151.95, -27.56],
        [150.52, -29.46],
        [148.16, -32.25],
        [146.92, -36.08],
      ],
    },
    {
      id: 'southern-coast',
      className: 'major',
      coordinates: [
        [115.86, -31.95],
        [118.0, -32.0],
        [121.47, -30.75],
        [122.0, -33.85],
        [128.88, -31.72],
        [133.67, -32.13],
        [138.6, -34.93],
        [144.96, -37.81],
        [147.33, -42.88],
      ],
    },
    {
      id: 'sturt-stuart',
      className: 'major',
      coordinates: [
        [130.84, -12.46],
        [131.03, -14.47],
        [133.88, -23.7],
        [136.08, -28.77],
        [137.77, -32.49],
        [138.6, -34.93],
      ],
    },
    {
      id: 'western-north',
      className: 'major',
      coordinates: [
        [115.86, -31.95],
        [116.85, -30.64],
        [118.61, -27.43],
        [119.59, -25.35],
        [118.58, -20.31],
        [117.15, -20.74],
        [122.24, -17.96],
        [130.84, -12.46],
      ],
    },
    {
      id: 'barkly',
      className: 'major',
      coordinates: [
        [133.88, -23.7],
        [134.2, -19.65],
        [136.75, -20.73],
        [139.49, -20.73],
        [146.82, -19.26],
        [146.25, -20.73],
      ],
    },
    {
      id: 'inland-queensland',
      className: 'secondary',
      coordinates: [
        [153.03, -27.47],
        [151.95, -27.56],
        [148.79, -26.57],
        [146.24, -26.40],
        [144.25, -23.44],
        [139.49, -20.73],
      ],
    },
    {
      id: 'sydney-adelaide',
      className: 'secondary',
      coordinates: [
        [151.21, -33.87],
        [149.59, -32.25],
        [145.94, -31.95],
        [141.45, -31.96],
        [138.6, -34.93],
      ],
    },
    {
      id: 'melbourne-adelaide-coast',
      className: 'secondary',
      coordinates: [
        [144.96, -37.81],
        [142.48, -38.38],
        [140.78, -37.83],
        [138.6, -34.93],
      ],
    },
    {
      id: 'perth-albany-esperance',
      className: 'secondary',
      coordinates: [
        [115.86, -31.95],
        [115.64, -33.33],
        [117.88, -35.02],
        [121.89, -33.86],
        [122.0, -33.85],
      ],
    },
    {
      id: 'canberra-sydney',
      className: 'major',
      coordinates: [
        [149.13, -35.28],
        [150.77, -34.42],
        [151.21, -33.87],
      ],
    },
    {
      id: 'tasmania',
      className: 'secondary',
      coordinates: [
        [147.33, -42.88],
        [147.14, -41.43],
        [146.35, -41.18],
        [145.91, -41.05],
      ],
    },
    {
      id: 'brisbane-urban-1',
      className: 'local',
      coordinates: [
        [152.78, -27.28],
        [153.03, -27.47],
        [153.26, -27.72],
      ],
    },
    {
      id: 'brisbane-urban-2',
      className: 'local',
      coordinates: [
        [152.89, -27.66],
        [153.03, -27.47],
        [153.20, -27.26],
      ],
    },
    {
      id: 'gold-coast-urban',
      className: 'local',
      coordinates: [
        [153.03, -27.47],
        [153.33, -27.98],
        [153.43, -28.02],
        [153.55, -28.65],
      ],
    },
    {
      id: 'sydney-urban-1',
      className: 'local',
      coordinates: [
        [150.70, -33.68],
        [151.21, -33.87],
        [151.34, -34.05],
      ],
    },
    {
      id: 'sydney-urban-2',
      className: 'local',
      coordinates: [
        [151.03, -33.55],
        [151.21, -33.87],
        [150.93, -34.10],
      ],
    },
    {
      id: 'sydney-urban-3',
      className: 'local',
      coordinates: [
        [150.52, -33.77],
        [151.21, -33.87],
        [151.56, -33.72],
      ],
    },
    {
      id: 'canberra-urban',
      className: 'local',
      coordinates: [
        [148.90, -35.18],
        [149.13, -35.28],
        [149.38, -35.42],
      ],
    },
    {
      id: 'melbourne-urban-1',
      className: 'local',
      coordinates: [
        [144.55, -37.62],
        [144.96, -37.81],
        [145.36, -37.96],
      ],
    },
    {
      id: 'melbourne-urban-2',
      className: 'local',
      coordinates: [
        [144.84, -38.14],
        [144.96, -37.81],
        [145.18, -37.50],
      ],
    },
    {
      id: 'adelaide-urban',
      className: 'local',
      coordinates: [
        [138.23, -34.73],
        [138.6, -34.93],
        [138.86, -35.13],
      ],
    },
    {
      id: 'perth-urban',
      className: 'local',
      coordinates: [
        [115.63, -31.75],
        [115.86, -31.95],
        [116.08, -32.18],
      ],
    },
  ];

  const AUSTRALIA_PLACE_LABELS = [
    { id: 'perth', name: 'Perth', coordinates: [115.86, -31.95], rank: 'major' },
    { id: 'darwin', name: 'Darwin', coordinates: [130.84, -12.46], rank: 'major' },
    { id: 'adelaide', name: 'Adelaide', coordinates: [138.6, -34.93], rank: 'major' },
    { id: 'melbourne', name: 'Melbourne', coordinates: [144.96, -37.81], rank: 'major' },
    { id: 'brisbane', name: 'Brisbane', coordinates: [153.03, -27.47], rank: 'major' },
    { id: 'sydney', name: 'Sydney', coordinates: [151.21, -33.87], rank: 'major' },
    { id: 'canberra', name: 'Canberra', coordinates: [149.13, -35.28], rank: 'major' },
    { id: 'hobart', name: 'Hobart', coordinates: [147.33, -42.88], rank: 'major' },
    { id: 'alice-springs', name: 'Alice Springs', coordinates: [133.88, -23.7], rank: 'minor' },
    { id: 'townsville', name: 'Townsville', coordinates: [146.82, -19.26], rank: 'minor' },
    { id: 'mount-isa', name: 'Mount Isa', coordinates: [139.49, -20.73], rank: 'minor' },
    { id: 'kalgoorlie', name: 'Kalgoorlie', coordinates: [121.47, -30.75], rank: 'minor' },
  ];

  const AUSTRALIA_DETAIL_ROADS = [
    {
      siteId: 'canberra',
      id: 'canberra-ring',
      className: 'detail-major',
      coordinates: [
        [148.98, -35.20],
        [149.08, -35.16],
        [149.21, -35.20],
        [149.26, -35.31],
        [149.16, -35.39],
        [149.02, -35.35],
        [148.98, -35.20],
      ],
    },
    {
      siteId: 'canberra',
      id: 'canberra-axis-1',
      className: 'detail-local',
      coordinates: [
        [149.00, -35.28],
        [149.13, -35.28],
        [149.28, -35.28],
      ],
    },
    {
      siteId: 'canberra',
      id: 'canberra-axis-2',
      className: 'detail-local',
      coordinates: [
        [149.13, -35.13],
        [149.13, -35.28],
        [149.13, -35.42],
      ],
    },
    {
      siteId: 'canberra',
      id: 'canberra-lake',
      className: 'detail-water',
      polygon: [
        [149.05, -35.29],
        [149.10, -35.27],
        [149.17, -35.28],
        [149.20, -35.30],
        [149.15, -35.32],
        [149.08, -35.32],
      ],
    },
    {
      siteId: 'nikenbah',
      id: 'nikenbah-coast-road',
      className: 'detail-major',
      coordinates: [
        [152.70, -25.22],
        [152.80, -25.30],
        [152.88, -25.40],
        [152.91, -25.53],
      ],
    },
    {
      siteId: 'nikenbah',
      id: 'nikenbah-harbour-axis',
      className: 'detail-local',
      coordinates: [
        [152.74, -25.33],
        [152.8153, -25.3188],
        [152.92, -25.30],
      ],
    },
    {
      siteId: 'nikenbah',
      id: 'nikenbah-watch-grid',
      className: 'detail-local',
      coordinates: [
        [152.79, -25.24],
        [152.82, -25.32],
        [152.84, -25.42],
      ],
    },
    {
      siteId: 'nikenbah',
      id: 'nikenbah-bay',
      className: 'detail-water',
      polygon: [
        [152.89, -25.22],
        [153.02, -25.25],
        [153.04, -25.43],
        [152.93, -25.48],
        [152.86, -25.34],
      ],
    },
    {
      siteId: 'sydney',
      id: 'sydney-harbour',
      className: 'detail-water',
      polygon: [
        [151.14, -33.78],
        [151.23, -33.76],
        [151.31, -33.82],
        [151.28, -33.88],
        [151.18, -33.87],
        [151.11, -33.84],
      ],
    },
    {
      siteId: 'sydney',
      id: 'sydney-m1',
      className: 'detail-major',
      coordinates: [
        [150.95, -33.70],
        [151.12, -33.79],
        [151.21, -33.87],
        [151.25, -34.03],
      ],
    },
    {
      siteId: 'sydney',
      id: 'sydney-west-axis',
      className: 'detail-local',
      coordinates: [
        [150.88, -33.87],
        [151.05, -33.87],
        [151.21, -33.87],
        [151.36, -33.88],
      ],
    },
    {
      siteId: 'sydney',
      id: 'sydney-north-axis',
      className: 'detail-local',
      coordinates: [
        [151.21, -33.68],
        [151.21, -33.87],
        [151.19, -34.02],
      ],
    },
  ];

  const AUSTRALIA_DETAIL_AREAS = {
    canberra: {
      center: [149.13, -35.28],
      spanLng: 2.65,
      spanLat: 1.9,
      majorAngles: [-24, 0, 38, 88],
      minorAngles: [-70, -45, -18, 16, 50, 76],
      waterBodies: [
        {
          id: 'lake-burley-griffin',
          type: 'lake',
          coordinates: [
            [148.62, -35.30],
            [148.88, -35.22],
            [149.13, -35.25],
            [149.42, -35.29],
            [149.55, -35.36],
            [149.18, -35.42],
            [148.82, -35.39],
          ],
        },
        {
          id: 'murrumbidgee-reserve',
          type: 'river',
          coordinates: [
            [148.52, -35.50],
            [148.88, -35.58],
            [149.24, -35.56],
            [149.56, -35.62],
            [149.72, -35.72],
            [149.28, -35.78],
            [148.72, -35.72],
          ],
        },
      ],
      zones: [
        {
          id: 'capital-command-grid',
          type: 'command',
          coordinates: [
            [148.72, -35.08],
            [149.58, -35.13],
            [149.55, -35.48],
            [148.78, -35.45],
          ],
        },
        {
          id: 'intelligence-quarter',
          type: 'intel',
          coordinates: [
            [149.18, -34.94],
            [149.70, -35.02],
            [149.62, -35.26],
            [149.14, -35.20],
          ],
        },
        {
          id: 'revival-security-belt',
          type: 'security',
          coordinates: [
            [148.42, -35.46],
            [148.92, -35.58],
            [149.52, -35.56],
            [149.82, -35.74],
            [149.18, -35.88],
            [148.46, -35.78],
          ],
        },
      ],
      facilities: [
        {
          id: 'supreme-council',
          type: 'capital',
          name: '最高委员会',
          coordinates: [
            [149.02, -35.22],
            [149.25, -35.23],
            [149.24, -35.34],
            [149.02, -35.33],
          ],
        },
        {
          id: 'imperial-intelligence',
          type: 'intel',
          name: '帝国情报局总部',
          coordinates: [
            [149.31, -35.12],
            [149.53, -35.16],
            [149.49, -35.30],
            [149.25, -35.26],
          ],
        },
        {
          id: 'capital-defence-command',
          type: 'defence',
          name: '首都防务司令部',
          coordinates: [
            [148.78, -35.08],
            [148.98, -35.10],
            [148.94, -35.23],
            [148.73, -35.21],
          ],
        },
        {
          id: 'revival-security-vault',
          type: 'archive',
          name: '复活中心安保库',
          coordinates: [
            [149.00, -35.58],
            [149.30, -35.60],
            [149.27, -35.75],
            [148.97, -35.72],
          ],
        },
      ],
      arcs: [
        { id: 'capital-inner-ring', type: 'command', radiusLng: 0.48, radiusLat: 0.34, startAngle: 190, endAngle: 520 },
        { id: 'capital-outer-ring', type: 'security', radiusLng: 0.92, radiusLat: 0.64, startAngle: 180, endAngle: 530 },
      ],
      districts: [
        { name: 'Civic', coordinates: [149.05, -35.05] },
        { name: 'Barton', coordinates: [149.23, -35.43] },
        { name: 'Russell', coordinates: [149.44, -35.18] },
        { name: 'Capital Hill', coordinates: [149.06, -35.35] },
        { name: 'Revival Security Belt', coordinates: [149.15, -35.82] },
      ],
      labels: [
        { name: '最高委员会', coordinates: [149.13, -35.28], kind: 'facility' },
        { name: '帝国情报局', coordinates: [149.39, -35.10], kind: 'facility' },
        { name: '首都防务环线', coordinates: [148.56, -34.98], kind: 'system' },
        { name: 'Lake Burley Griffin', coordinates: [149.10, -35.38], kind: 'water' },
      ],
    },
    nikenbah: {
      center: [152.8153, -25.3188],
      spanLng: 3.15,
      spanLat: 2.1,
      majorAngles: [-44, -10, 24, 66],
      minorAngles: [-72, -48, -24, 6, 34, 78],
      waterBodies: [
        {
          id: 'hervey-bay-sector',
          type: 'bay',
          coordinates: [
            [152.96, -24.34],
            [153.76, -24.60],
            [153.88, -25.72],
            [153.35, -26.26],
            [152.92, -25.84],
            [152.72, -25.26],
          ],
        },
        {
          id: 'signal-basin',
          type: 'basin',
          coordinates: [
            [152.36, -25.02],
            [152.66, -24.90],
            [152.82, -25.18],
            [152.62, -25.42],
            [152.28, -25.34],
          ],
        },
      ],
      zones: [
        {
          id: 'maritime-warning-campus',
          type: 'command',
          coordinates: [
            [152.55, -25.06],
            [152.98, -25.12],
            [153.04, -25.48],
            [152.60, -25.58],
          ],
        },
        {
          id: 'coral-sea-radar-field',
          type: 'radar',
          coordinates: [
            [152.92, -24.62],
            [153.66, -24.84],
            [153.52, -25.32],
            [152.90, -25.16],
          ],
        },
        {
          id: 'coastal-interdiction-line',
          type: 'security',
          coordinates: [
            [152.88, -25.48],
            [153.42, -25.72],
            [153.30, -26.12],
            [152.82, -25.84],
          ],
        },
      ],
      facilities: [
        {
          id: 'maritime-warning-bureau',
          type: 'capital',
          name: '海事警戒局总部',
          coordinates: [
            [152.69, -25.20],
            [152.92, -25.22],
            [152.91, -25.40],
            [152.67, -25.38],
          ],
        },
        {
          id: 'deep-sea-listening-array',
          type: 'radar',
          name: '深海监听阵列',
          coordinates: [
            [153.05, -24.72],
            [153.32, -24.80],
            [153.22, -25.00],
            [152.98, -24.94],
          ],
        },
        {
          id: 'patrol-dispatch-basin',
          type: 'harbor',
          name: '巡逻调度湾',
          coordinates: [
            [152.92, -25.54],
            [153.22, -25.66],
            [153.12, -25.88],
            [152.82, -25.72],
          ],
        },
      ],
      arcs: [
        { id: 'near-sea-sweep', type: 'radar', radiusLng: 0.58, radiusLat: 0.42, startAngle: -60, endAngle: 82 },
        { id: 'outer-sea-sweep', type: 'radar', radiusLng: 1.08, radiusLat: 0.78, startAngle: -54, endAngle: 76 },
        { id: 'blockade-envelope', type: 'security', radiusLng: 1.34, radiusLat: 0.96, startAngle: -44, endAngle: 68 },
      ],
      districts: [
        { name: 'Hervey Bay', coordinates: [153.22, -25.24] },
        { name: 'Nikenbah', coordinates: [152.8153, -25.3188] },
        { name: 'Coast Watch', coordinates: [153.12, -25.74] },
        { name: 'Signal Basin', coordinates: [152.42, -25.12] },
        { name: 'Coral Sea Sweep', coordinates: [153.62, -24.80] },
      ],
      labels: [
        { name: '海事警戒局', coordinates: [152.80, -25.30], kind: 'facility' },
        { name: '雷达扇区', coordinates: [153.36, -24.70], kind: 'system' },
        { name: '东岸封锁线', coordinates: [153.20, -26.06], kind: 'system' },
        { name: 'Hervey Bay Approach', coordinates: [153.52, -25.42], kind: 'water' },
      ],
    },
    sydney: {
      center: [151.2093, -33.8688],
      spanLng: 3.05,
      spanLat: 2.0,
      majorAngles: [-40, -4, 34, 86],
      minorAngles: [-66, -38, -16, 12, 42, 72],
      waterBodies: [
        {
          id: 'sydney-harbour-expanded',
          type: 'harbour',
          coordinates: [
            [150.82, -33.62],
            [151.20, -33.52],
            [151.62, -33.66],
            [151.76, -33.88],
            [151.42, -34.02],
            [151.03, -33.92],
            [150.70, -33.78],
          ],
        },
        {
          id: 'botany-approach',
          type: 'bay',
          coordinates: [
            [150.94, -34.02],
            [151.26, -33.98],
            [151.46, -34.18],
            [151.20, -34.36],
            [150.86, -34.25],
          ],
        },
      ],
      zones: [
        {
          id: 'colonial-administration-core',
          type: 'command',
          coordinates: [
            [150.96, -33.62],
            [151.42, -33.70],
            [151.38, -34.02],
            [150.92, -33.96],
          ],
        },
        {
          id: 'colonial-archive-corridor',
          type: 'archive',
          coordinates: [
            [150.48, -33.72],
            [151.06, -33.78],
            [151.00, -34.02],
            [150.38, -33.96],
          ],
        },
        {
          id: 'harbour-dispatch-sector',
          type: 'harbor',
          coordinates: [
            [151.24, -33.54],
            [151.78, -33.66],
            [151.62, -33.96],
            [151.18, -33.84],
          ],
        },
      ],
      facilities: [
        {
          id: 'ocma-headquarters',
          type: 'capital',
          name: '对外殖民管理局总部',
          coordinates: [
            [151.08, -33.76],
            [151.34, -33.78],
            [151.31, -33.96],
            [151.05, -33.94],
          ],
        },
        {
          id: 'colonial-archive-terminal',
          type: 'archive',
          name: '殖民档案终端',
          coordinates: [
            [150.62, -33.82],
            [150.94, -33.86],
            [150.90, -34.04],
            [150.58, -34.00],
          ],
        },
        {
          id: 'harbour-dispatch-office',
          type: 'harbor',
          name: '港湾派遣办公室',
          coordinates: [
            [151.38, -33.62],
            [151.62, -33.68],
            [151.54, -33.86],
            [151.30, -33.80],
          ],
        },
      ],
      arcs: [
        { id: 'administration-ring', type: 'command', radiusLng: 0.56, radiusLat: 0.38, startAngle: 190, endAngle: 526 },
        { id: 'harbour-control-ring', type: 'harbor', radiusLng: 0.96, radiusLat: 0.62, startAngle: -16, endAngle: 190 },
      ],
      districts: [
        { name: 'Sydney CBD', coordinates: [151.2093, -33.8688] },
        { name: 'Parramatta Axis', coordinates: [150.60, -33.78] },
        { name: 'Harbour Sector', coordinates: [151.54, -33.68] },
        { name: 'Botany Approach', coordinates: [151.18, -34.22] },
        { name: 'Archive Corridor', coordinates: [150.58, -34.08] },
      ],
      labels: [
        { name: '对外殖民管理局', coordinates: [151.20, -33.86], kind: 'facility' },
        { name: '殖民档案走廊', coordinates: [150.52, -33.70], kind: 'system' },
        { name: 'Harbour Dispatch', coordinates: [151.62, -33.92], kind: 'facility' },
        { name: 'Sydney Harbour', coordinates: [151.34, -33.54], kind: 'water' },
      ],
    },
  };

  const AUSTRALIA_LOCAL_DETAIL_AREAS = {
    canberra: {
      center: [149.13, -35.28],
      bounds: { minLng: 148.98, maxLng: 149.28, minLat: -35.42, maxLat: -35.20 },
      waterBodies: [
        {
          id: 'lake-burley-griffin',
          type: 'lake',
          name: '伯利格里芬湖',
          description: '真实堪培拉的中心水体。地图用它把 Civic、国会三角区、Russell 防务区分开，避免内部布局混成一团。',
          coordinates: [
            [149.020, -35.290],
            [149.046, -35.278],
            [149.090, -35.276],
            [149.128, -35.282],
            [149.171, -35.286],
            [149.222, -35.300],
            [149.214, -35.317],
            [149.160, -35.323],
            [149.098, -35.318],
            [149.044, -35.306],
          ],
        },
      ],
      zones: [
        {
          id: 'parliament-command-triangle',
          type: 'command',
          name: '国会三角核心管制区',
          description: '以 Capital Hill、Barton、Parkes 组成首都指挥三角，承载最高委员会、总理府与远征授权流程。',
          coordinates: [
            [149.090, -35.300],
            [149.137, -35.286],
            [149.176, -35.318],
            [149.148, -35.350],
            [149.096, -35.338],
          ],
        },
        {
          id: 'russell-intelligence-quarter',
          type: 'intel',
          name: 'Russell 情报与防务区',
          description: '东湖岸与 Mount Pleasant 坡地之间的保密办公区，靠近现实 Russell 防务设施位置。',
          coordinates: [
            [149.154, -35.270],
            [149.208, -35.278],
            [149.202, -35.312],
            [149.148, -35.306],
          ],
        },
        {
          id: 'civic-residential-grid',
          type: 'residential',
          name: 'Civic 居民与行政服务区',
          description: '用简化矩形街区代表湖西北的居民、档案服务和日常行政区，保留城市生活层而不挤占核心设施。',
          coordinates: [
            [149.060, -35.248],
            [149.132, -35.252],
            [149.126, -35.286],
            [149.054, -35.286],
          ],
        },
        {
          id: 'capital-security-cordon',
          type: 'security',
          name: '首都分级警戒圈',
          description: '围绕湖岸和国会三角布置的分级管制区，普通城市道路在圈外保持连续，核心通道进入圈内后收束。',
          coordinates: [
            [149.028, -35.244],
            [149.210, -35.248],
            [149.226, -35.326],
            [149.176, -35.366],
            [149.072, -35.356],
            [149.010, -35.314],
          ],
        },
      ],
      facilities: [
        {
          id: 'supreme-council',
          type: 'capital',
          name: '最高委员会',
          description: '首都最高决策设施，放在 Capital Hill 北侧，和现实国会轴线保持一致。',
          coordinates: [
            [149.115, -35.304],
            [149.142, -35.306],
            [149.140, -35.324],
            [149.112, -35.322],
          ],
        },
        {
          id: 'imperial-intelligence',
          type: 'intel',
          name: '帝国情报局总部',
          description: '情报局总部位于 Russell 防务区内，连接湖岸主路和限制通行的地下访问线。',
          coordinates: [
            [149.164, -35.286],
            [149.190, -35.289],
            [149.186, -35.306],
            [149.160, -35.303],
          ],
        },
        {
          id: 'capital-defence-gate',
          type: 'defence',
          name: '首都防务闸门',
          description: '连接 Civic 与国会三角的湖西入口，承担车辆筛查和危机时的封桥任务。',
          coordinates: [
            [149.066, -35.272],
            [149.090, -35.274],
            [149.088, -35.290],
            [149.064, -35.288],
          ],
        },
        {
          id: 'revival-command-annex',
          type: 'archive',
          name: '复活中心联络署',
          description: '不直接表现完整复活中心，只在首都核心区布置联络署，负责死亡统计、复活授权和安保调度。',
          coordinates: [
            [149.092, -35.332],
            [149.118, -35.334],
            [149.116, -35.350],
            [149.090, -35.348],
          ],
        },
      ],
      arcs: [
        { id: 'inner-council-cordon', type: 'command', name: '内层委员会警戒圈', description: '围绕最高委员会和总理府的步行级封控圈。', radiusLng: 0.032, radiusLat: 0.020, startAngle: 166, endAngle: 520 },
        { id: 'outer-capital-cordon', type: 'security', name: '外层首都防务环', description: '覆盖湖岸、桥梁和 Russell 防务区的车辆级管制圈。', radiusLng: 0.090, radiusLat: 0.054, startAngle: 156, endAngle: 532 },
      ],
      districts: [
        { name: 'Civic', coordinates: [149.088, -35.262], description: '北岸城市服务与居民片区。' },
        { name: 'Capital Hill', coordinates: [149.104, -35.326], description: '最高委员会所在的首都核心。' },
        { name: 'Russell', coordinates: [149.178, -35.292], description: '防务和情报机构集中区。' },
        { name: 'Barton', coordinates: [149.142, -35.334], description: '外交、行政和复活系统联络区。' },
      ],
      labels: [
        { name: '最高委员会', coordinates: [149.126, -35.304], kind: 'facility', description: '首都核心设施标注。' },
        { name: '帝国情报局', coordinates: [149.178, -35.284], kind: 'facility', description: 'Russell 防务区内的情报总部。' },
        { name: 'Capital Security Cordon', coordinates: [149.040, -35.248], kind: 'system', description: '首都外层警戒圈标注。' },
        { name: 'Lake Burley Griffin', coordinates: [149.138, -35.324], kind: 'water', description: '堪培拉局部图的地理基准线。' },
      ],
    },
    nikenbah: {
      center: [152.8153, -25.3188],
      bounds: { minLng: 152.70, maxLng: 153.03, minLat: -25.42, maxLat: -25.18 },
      waterBodies: [
        {
          id: 'hervey-bay-edge',
          type: 'bay',
          name: '赫维湾近岸水域',
          description: '真实赫维湾方向的近岸水体，用来表达海事警戒局面向珊瑚海的监视方向。',
          coordinates: [
            [152.918, -25.184],
            [153.030, -25.184],
            [153.030, -25.384],
            [152.974, -25.398],
            [152.934, -25.318],
          ],
        },
        {
          id: 'patrol-basin',
          type: 'basin',
          name: '巡逻调度内湾',
          description: '简化表现的小型巡逻艇/无人艇调度水域，连接沿岸封锁线。',
          coordinates: [
            [152.850, -25.334],
            [152.887, -25.342],
            [152.881, -25.371],
            [152.842, -25.366],
          ],
        },
      ],
      zones: [
        {
          id: 'maritime-warning-campus',
          type: 'command',
          name: '海事警戒局总部园区',
          description: '位于 Nikenbah 与 Urraween 之间的内陆指挥园区，避开海岸洪水风险，同时可接入沿岸主路。',
          coordinates: [
            [152.786, -25.286],
            [152.850, -25.292],
            [152.842, -25.344],
            [152.776, -25.336],
          ],
        },
        {
          id: 'radar-field',
          type: 'radar',
          name: '珊瑚海雷达/监听场',
          description: '沿海抬升地带的传感器阵列，覆盖赫维湾外海和珊瑚海方向异常航迹。',
          coordinates: [
            [152.872, -25.224],
            [152.980, -25.238],
            [152.962, -25.300],
            [152.862, -25.282],
          ],
        },
        {
          id: 'coast-watch-line',
          type: 'security',
          name: '东岸封锁与巡逻带',
          description: '沿海低地的限制通行带，串联巡逻调度湾、海岸观察哨和补给入口。',
          coordinates: [
            [152.858, -25.342],
            [152.982, -25.372],
            [152.966, -25.412],
            [152.820, -25.382],
          ],
        },
        {
          id: 'urraween-residential-service',
          type: 'residential',
          name: 'Urraween 居民与后勤区',
          description: '简化居民和后勤服务片区，保留城市支撑功能，同时与总部园区分隔。',
          coordinates: [
            [152.804, -25.258],
            [152.864, -25.266],
            [152.854, -25.292],
            [152.792, -25.284],
          ],
        },
      ],
      facilities: [
        {
          id: 'maritime-warning-bureau',
          type: 'capital',
          name: '海事警戒局总部',
          description: '海事警戒局的核心指挥楼群，负责东岸监控、封锁调度与异常航迹预警。',
          coordinates: [
            [152.807, -25.306],
            [152.832, -25.309],
            [152.829, -25.327],
            [152.804, -25.324],
          ],
        },
        {
          id: 'signal-array',
          type: 'radar',
          name: '珊瑚海监听阵列',
          description: '面向珊瑚海的监听与雷达设施，用刻线扇区表达预警覆盖方向。',
          coordinates: [
            [152.902, -25.246],
            [152.936, -25.252],
            [152.930, -25.270],
            [152.898, -25.264],
          ],
        },
        {
          id: 'patrol-dispatch',
          type: 'harbor',
          name: '巡逻调度站',
          description: '小型无人艇、巡逻车和海岸封锁队的调度节点，贴近内湾而不直接暴露于外海。',
          coordinates: [
            [152.866, -25.349],
            [152.892, -25.354],
            [152.888, -25.370],
            [152.862, -25.366],
          ],
        },
        {
          id: 'coast-watch-bunker',
          type: 'defence',
          name: '海岸观察堡',
          description: '低地封锁带上的加固观察节点，用于接力传感器数据和现场拦截命令。',
          coordinates: [
            [152.940, -25.354],
            [152.966, -25.360],
            [152.960, -25.376],
            [152.934, -25.370],
          ],
        },
      ],
      arcs: [
        { id: 'near-sea-sweep', type: 'radar', name: '近海雷达扫掠扇区', description: '覆盖赫维湾近岸航迹的短程扫掠范围。', radiusLng: 0.052, radiusLat: 0.036, startAngle: -50, endAngle: 72 },
        { id: 'outer-sea-sweep', type: 'radar', name: '珊瑚海外层预警扇区', description: '面向外海的远程监听范围，在地图上用扇形警戒线表达。', radiusLng: 0.092, radiusLat: 0.064, startAngle: -45, endAngle: 70 },
        { id: 'blockade-envelope', type: 'security', name: '东岸封锁包络线', description: '海岸线与总部之间的应急封锁边界。', radiusLng: 0.118, radiusLat: 0.082, startAngle: -38, endAngle: 64 },
      ],
      districts: [
        { name: 'Nikenbah', coordinates: [152.808, -25.326], description: '总部园区所在的内陆近郊。' },
        { name: 'Urraween', coordinates: [152.836, -25.278], description: '居民、医勤和后勤服务片区。' },
        { name: 'Coast Watch', coordinates: [152.948, -25.354], description: '海岸封锁带和观察节点。' },
        { name: 'Hervey Bay Edge', coordinates: [152.968, -25.220], description: '赫维湾近岸方向。' },
      ],
      labels: [
        { name: '海事警戒局', coordinates: [152.820, -25.304], kind: 'facility', description: '总部楼群标注。' },
        { name: '雷达扇区', coordinates: [152.934, -25.236], kind: 'system', description: '珊瑚海预警方向。' },
        { name: '东岸封锁线', coordinates: [152.928, -25.406], kind: 'system', description: '沿海限制通行边界。' },
        { name: 'Hervey Bay', coordinates: [152.988, -25.252], kind: 'water', description: '近岸水体参照。' },
      ],
    },
    sydney: {
      center: [151.2093, -33.8688],
      bounds: { minLng: 151.02, maxLng: 151.34, minLat: -34.02, maxLat: -33.76 },
      waterBodies: [
        {
          id: 'sydney-harbour',
          type: 'harbour',
          name: '悉尼港',
          description: '真实悉尼港水体被简化为可读轮廓，用来分割北岸、CBD 和港湾派遣区。',
          coordinates: [
            [151.050, -33.826],
            [151.098, -33.798],
            [151.176, -33.782],
            [151.246, -33.790],
            [151.318, -33.812],
            [151.340, -33.852],
            [151.292, -33.878],
            [151.222, -33.862],
            [151.154, -33.852],
            [151.092, -33.850],
          ],
        },
        {
          id: 'darling-harbour',
          type: 'basin',
          name: 'Darling Harbour 内湾',
          description: '港湾派遣与殖民地物流的内湾节点，连接 CBD 和 Pyrmont 方向。',
          coordinates: [
            [151.184, -33.858],
            [151.205, -33.866],
            [151.202, -33.892],
            [151.178, -33.888],
          ],
        },
        {
          id: 'botany-approach-pocket',
          type: 'bay',
          name: 'Botany 进近水域',
          description: '南侧 Botany 方向以简化水域标注，提示殖民物资并非只从悉尼港进入。',
          coordinates: [
            [151.186, -33.964],
            [151.238, -33.970],
            [151.270, -34.006],
            [151.198, -34.012],
          ],
        },
      ],
      zones: [
        {
          id: 'colonial-administration-core',
          type: 'command',
          name: '对外殖民行政核心区',
          description: '以 CBD 为中心的对外殖民管理局核心区，负责殖民官派驻、资源审批和海外民政协调。',
          coordinates: [
            [151.188, -33.846],
            [151.232, -33.852],
            [151.226, -33.888],
            [151.182, -33.882],
          ],
        },
        {
          id: 'archive-corridor',
          type: 'archive',
          name: '殖民档案走廊',
          description: '从 Pyrmont/Darling Harbour 向 CBD 延伸的档案与数据转运走廊，便于连接港湾和行政核心。',
          coordinates: [
            [151.134, -33.856],
            [151.194, -33.862],
            [151.188, -33.904],
            [151.126, -33.896],
          ],
        },
        {
          id: 'harbour-dispatch-sector',
          type: 'harbor',
          name: '港湾派遣扇区',
          description: '北东侧港湾控制区，用于船队派遣、短驳补给和对海外据点的行政联络。',
          coordinates: [
            [151.232, -33.806],
            [151.306, -33.824],
            [151.288, -33.866],
            [151.222, -33.848],
          ],
        },
        {
          id: 'inner-cbd-residential',
          type: 'residential',
          name: '内城居民与服务区',
          description: '简化表现 CBD 南部居民、商业和职员服务区，维持城市尺度感。',
          coordinates: [
            [151.196, -33.890],
            [151.258, -33.902],
            [151.248, -33.948],
            [151.184, -33.936],
          ],
        },
      ],
      facilities: [
        {
          id: 'ocma-headquarters',
          type: 'capital',
          name: '对外殖民管理局总部',
          description: '对外殖民管理局总部设在 CBD 核心，靠近港湾与主干路，方便行政和物流双向接入。',
          coordinates: [
            [151.203, -33.860],
            [151.224, -33.862],
            [151.221, -33.878],
            [151.200, -33.876],
          ],
        },
        {
          id: 'colonial-archive-terminal',
          type: 'archive',
          name: '殖民档案终端',
          description: '殖民地档案、资源配给审批和派驻记录的集中处理设施。',
          coordinates: [
            [151.160, -33.870],
            [151.184, -33.874],
            [151.180, -33.892],
            [151.156, -33.888],
          ],
        },
        {
          id: 'harbour-dispatch-office',
          type: 'harbor',
          name: '港湾派遣办公室',
          description: '面向悉尼港的派遣节点，负责船队靠泊、人员转运和紧急撤离调度。',
          coordinates: [
            [151.244, -33.832],
            [151.268, -33.838],
            [151.262, -33.854],
            [151.238, -33.848],
          ],
        },
        {
          id: 'botany-logistics-gate',
          type: 'defence',
          name: 'Botany 后勤闸门',
          description: '南向货运和应急后勤入口，连接 Botany 进近水域与行政核心。',
          coordinates: [
            [151.214, -33.948],
            [151.244, -33.954],
            [151.240, -33.974],
            [151.210, -33.968],
          ],
        },
      ],
      arcs: [
        { id: 'administration-cordon', type: 'command', name: '行政核心警戒圈', description: '围绕对外殖民管理局总部的核心安保范围。', radiusLng: 0.038, radiusLat: 0.026, startAngle: 166, endAngle: 526 },
        { id: 'harbour-control-ring', type: 'harbor', name: '港湾控制环', description: '覆盖 Circular Quay、Darling Harbour 和北岸通道的港湾调度范围。', radiusLng: 0.090, radiusLat: 0.056, startAngle: -12, endAngle: 196 },
        { id: 'archive-transfer-cordon', type: 'archive', name: '档案转运保护线', description: 'Pyrmont 至 CBD 的档案转运保护范围。', radiusLng: 0.066, radiusLat: 0.044, startAngle: 132, endAngle: 416 },
      ],
      districts: [
        { name: 'Sydney CBD', coordinates: [151.220, -33.836], description: '对外殖民管理局所在的行政核心。' },
        { name: 'Darling Harbour', coordinates: [151.174, -33.908], description: '港湾物流与档案转运内湾。' },
        { name: 'Circular Quay', coordinates: [151.202, -33.842], description: '港湾和城市核心的换乘节点。' },
        { name: 'Harbour Sector', coordinates: [151.292, -33.812], description: '面向悉尼港的派遣扇区。' },
        { name: 'Botany Gate', coordinates: [151.230, -33.966], description: '南向后勤入口。' },
      ],
      labels: [
        { name: '对外殖民管理局', coordinates: [151.214, -33.854], kind: 'facility', description: '行政总部标注。' },
        { name: '殖民档案走廊', coordinates: [151.144, -33.858], kind: 'system', description: '档案转运和数据处理带。' },
        { name: 'Harbour Dispatch', coordinates: [151.276, -33.820], kind: 'facility', description: '港湾派遣节点。' },
        { name: 'Sydney Harbour', coordinates: [151.242, -33.808], kind: 'water', description: '悉尼港水体参照。' },
      ],
    },
  };

  const STAGES = [
    {
      id: 'founding',
      year: '帝国纪元元年-21年',
      title: '本土奠基期',
      subtitle: '澳大利亚本土与新西兰处于帝国控制之下。',
      territory: {
        australia: 1,
        newZealand: 1,
      },
      focus: [135, -28, 155],
      note: '人类帝国以澳大利亚为最后堡垒，新西兰与帝国同寿。',
    },
    {
      id: 'pioneerEarly',
      year: '帝国纪元22-34年',
      title: '开拓年代初期',
      subtitle: '南美洲殖民地建立，帝国开始获得稳定海外原材料来源。',
      territory: {
        australia: 1,
        newZealand: 1,
        southAmerica: 1,
      },
      focus: [40, -22, 130],
      note: 'Heinrich 与 LJY 前往南美，蒙得维的亚成为殖民地首都。',
    },
    {
      id: 'fourthAdvance',
      year: '帝国纪元35-37年',
      title: '第四次远征前段',
      subtitle: 'NULL 就任东南亚总督，西太平洋殖民地迅速扩张。',
      territory: {
        australia: 1,
        newZealand: 1,
        southAmerica: 1,
        southeastAsia: 1,
        dalian: 0.85,
      },
      focus: [100, -12, 130],
      note: '东南亚大部被解放，殖民地一度向北扩张到大连。',
    },
    {
      id: 'fourthAftermath',
      year: '帝国纪元40年',
      title: '第四次远征后',
      subtitle: '南美和西太平洋殖民地丧失，新西兰回到帝国控制。',
      territory: {
        australia: 1,
        newZealand: 1,
      },
      contested: {
        southAmerica: 0.2,
        southeastAsia: 0.25,
      },
      focus: [140, -30, 150],
      note: '按本次确认设定，战后帝国稳定控制区为澳大利亚本土与新西兰。',
    },
    {
      id: 'fifthExpedition',
      year: '帝国纪元41-47年',
      title: '第五次远征',
      subtitle: '帝国开始收复殖民地，印尼回归，南美逐步恢复职能。',
      territory: {
        australia: 1,
        newZealand: 1,
        southeastAsia: 0.78,
        southAmerica: 0.58,
        europeContact: 0.6,
      },
      contested: {
        southAmerica: 0.35,
      },
      focus: [95, -22, 150],
      note: 'WQC 收复印尼，LJY 重建南美；欧洲联络任务被迫终止。',
    },
    {
      id: 'production',
      year: '帝国纪元49-61年',
      title: '大生产运动',
      subtitle: '南美率先生产复兴，印尼转入军事防御建设。',
      territory: {
        australia: 1,
        newZealand: 1,
        southAmerica: 0.86,
        southeastAsia: 0.92,
      },
      focus: [84, -24, 140],
      note: '南美生产运动传导至各大区域，黄睿在印尼建设军事防御设施。',
    },
  ];

  let worldDataPromise = null;
  let mapboxStylePromise = null;
  let localRoadsPromise = null;
  let localContoursPromise = null;

  const state = {
    initialized: false,
    root: null,
    svg: null,
    mainViewport: null,
    mapLayer: null,
    territoryLayer: null,
    pointLayer: null,
    routeLayer: null,
    australiaFocusEl: null,
    australiaContentEl: null,
    australiaLayer: null,
    australiaTerrainLayer: null,
    australiaInlandWaterLayer: null,
    australiaAdminLayer: null,
    australiaRouteLayer: null,
    australiaLocalPanLayer: null,
    australiaLocalBackdropLayer: null,
    australiaDetailLayer: null,
    australiaPlaceLayer: null,
    australiaSiteLayer: null,
    australiaUiLayer: null,
    detailEl: null,
    stageListEl: null,
    rangeEl: null,
    stageIndex: 0,
    currentTerritory: {},
    targetTerritory: {},
    selectedRegionId: 'australia',
    selectedLocalFeatureId: '',
    focusMode: 'world',
    australiaView: 'overview',
    australiaProjector: null,
    australiaLocalProjectors: new Map(),
    australiaLocalPan: {},
    australiaLocalZoom: {},
    websiteData: {},
    parseAndColorText: null,
    mapTextOverrides: {},
    australiaDrag: {
      active: false,
      pointerId: null,
      startX: 0,
      startY: 0,
      startPanX: 0,
      startPanY: 0,
    },
    worldFeatures: [],
    australiaFeature: null,
    localRoadFeatures: [],
    localContourFeatures: [],
    featureElements: new Map(),
    regionElements: new Map(),
    pointElements: new Map(),
    mapboxPalette: null,
    width: 1200,
    height: 640,
    resizeObserver: null,
    animationFrame: null,
  };

  const lerp = (from, to, t) => from + (to - from) * t;

  const easeInOutCubic = (t) =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  const escapeHtml = (value = '') =>
    String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const formatPlainText = (value = '') =>
    escapeHtml(value)
      .split(/\n{2,}/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean)
      .map((paragraph) => `<p>${paragraph.replace(/\n/g, '<br>')}</p>`)
      .join('');

  const formatMapText = (value = '') => {
    const raw = String(value || '');
    if (!raw.trim()) return '';
    if (typeof state.parseAndColorText === 'function') {
      return raw
        .split(/\n{2,}/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean)
        .map((paragraph) => `<p>${state.parseAndColorText(escapeHtml(paragraph)).replace(/\n/g, '<br>')}</p>`)
        .join('');
    }
    return formatPlainText(raw);
  };

  const formatInlineMapText = (value = '') => {
    const raw = String(value || '');
    if (!raw.trim()) return '';
    const safe = escapeHtml(raw);
    return typeof state.parseAndColorText === 'function'
      ? state.parseAndColorText(safe)
      : safe;
  };

  const getLocalTextOverride = (siteId, keys = []) => {
    const siteOverrides = state.mapTextOverrides?.[siteId];
    if (!siteOverrides || typeof siteOverrides !== 'object') return null;
    for (const key of keys) {
      if (!key) continue;
      const entry = siteOverrides[key];
      if (entry && typeof entry === 'object') return entry;
    }
    return null;
  };

  const resolveLocalFeatureText = (siteId, featureId, fallbackTitle, fallbackBody, extraKeys = []) => {
    const detailId = featureId && String(featureId).startsWith(`${siteId}-`)
      ? String(featureId)
      : `${siteId}-${featureId}`;
    const rawId = featureId ? String(featureId) : '';
    const override = getLocalTextOverride(siteId, [
      detailId,
      rawId,
      ...extraKeys,
    ]);
    return {
      title: override?.title || fallbackTitle || rawId.replace(/-/g, ' '),
      body: override?.body || override?.details || fallbackBody || '',
    };
  };

  const resolveLocalSiteText = (site) => {
    if (!site) return { title: '', summary: '', body: '' };
    const override = getLocalTextOverride(site.id, ['__site', `site-${site.id}`, site.id]) || {};
    return {
      title: override.title || site.name,
      summary: override.summary || site.title,
      body: override.body || override.details || site.detail,
    };
  };

  const readPaintColor = (style, layerId, propertyName, fallback) => {
    const layer = (style?.layers || []).find((item) => item.id === layerId);
    const value = layer?.paint?.[propertyName];
    return typeof value === 'string' ? value : fallback;
  };

  const loadMapboxStyle = async () => {
    if (!mapboxStylePromise) {
      mapboxStylePromise = fetch(MAPBOX_STYLE_URL, { cache: 'no-cache' })
        .then((response) => {
          if (!response.ok) return null;
          return response.json();
        })
        .catch(() => null);
    }
    return mapboxStylePromise;
  };

  const getMapboxPalette = async () => {
    const style = await loadMapboxStyle();
    return {
      land: readPaintColor(style, 'land', 'background-color', 'hsl(0, 0%, 100%)'),
      water: readPaintColor(style, 'water', 'fill-color', 'hsl(0, 0%, 89%)'),
      road: 'hsl(211, 0%, 0%)',
      boundary: readPaintColor(style, 'admin-0-boundary', 'line-color', 'hsl(212, 2%, 89%)'),
      label: readPaintColor(style, 'road-label-simple', 'text-color', 'hsl(216, 34%, 72%)'),
    };
  };

  const getFeatureIso = (feature) => {
    const props = feature?.properties || {};
    const raw =
      props.ISO_A3 && props.ISO_A3 !== '-99'
        ? props.ISO_A3
        : props.ADM0_A3 && props.ADM0_A3 !== '-99'
          ? props.ADM0_A3
          : COUNTRY_ALIASES[props.ADMIN] || COUNTRY_ALIASES[props.NAME] || '';
    return String(raw || '').toUpperCase();
  };

  const loadWorldData = async () => {
    if (!worldDataPromise) {
      worldDataPromise = fetch(MAP_DATA_URL, { cache: 'no-cache' }).then((response) => {
        if (!response.ok) {
          throw new Error(`地图数据加载失败: HTTP ${response.status}`);
        }
        return response.json();
      });
    }
    return worldDataPromise;
  };

  const loadLocalRoadData = async () => {
    if (!localRoadsPromise) {
      localRoadsPromise = fetch(MAP_LOCAL_ROADS_URL, { cache: 'no-cache' })
        .then((response) => {
          if (!response.ok) return { type: 'FeatureCollection', features: [] };
          return response.json();
        })
        .catch(() => ({ type: 'FeatureCollection', features: [] }));
    }
    return localRoadsPromise;
  };

  const loadLocalContourData = async () => {
    if (!localContoursPromise) {
      localContoursPromise = fetch(MAP_LOCAL_CONTOURS_URL, { cache: 'no-cache' })
        .then((response) => {
          if (!response.ok) return { type: 'FeatureCollection', features: [] };
          return response.json();
        })
        .catch(() => ({ type: 'FeatureCollection', features: [] }));
    }
    return localContoursPromise;
  };

  const normalizeLng = (lng) => {
    let normalized = Number(lng);
    while (normalized < -180) normalized += 360;
    while (normalized > 180) normalized -= 360;
    return normalized;
  };

  const project = ([lng, lat]) => {
    const x = ((normalizeLng(lng) + 180) / 360) * state.width;
    const mercN = Math.log(Math.tan(Math.PI / 4 + (clamp(lat, -84, 84) * Math.PI) / 360));
    const y = state.height / 2 - (state.width * mercN) / (2 * Math.PI);
    return [x, y];
  };

  const getAustraliaProjection = () => {
    const bounds = {
      minLng: 112.0,
      maxLng: 154.6,
      minLat: -44.3,
      maxLat: -10.3,
    };
    const padding = Math.max(30, Math.min(state.width, state.height) * 0.06);
    const spanLng = bounds.maxLng - bounds.minLng;
    const spanLat = bounds.maxLat - bounds.minLat;
    const scale = Math.min(
      (state.width - padding * 2) / spanLng,
      (state.height - padding * 2) / spanLat
    );
    const mapWidth = spanLng * scale;
    const mapHeight = spanLat * scale;
    const offsetX = (state.width - mapWidth) / 2;
    const offsetY = (state.height - mapHeight) / 2;

    return ([lng, lat]) => [
      offsetX + (normalizeLng(lng) - bounds.minLng) * scale,
      offsetY + (bounds.maxLat - lat) * scale,
    ];
  };

  const getLongitudeScaleAtLatitude = (lat) =>
    Math.max(0.56, Math.cos((Number(lat) * Math.PI) / 180));

  const getLocalDetailProjection = (siteId) => {
    const area = AUSTRALIA_LOCAL_DETAIL_AREAS[siteId] || AUSTRALIA_DETAIL_AREAS[siteId];
    if (!area) return getAustraliaProjection();
    const bounds = area.bounds || {
      minLng: area.center[0] - area.spanLng / 2,
      maxLng: area.center[0] + area.spanLng / 2,
      minLat: area.center[1] - area.spanLat / 2,
      maxLat: area.center[1] + area.spanLat / 2,
    };
    const paddingX = Math.max(18, state.width * 0.025);
    const paddingY = Math.max(16, state.height * 0.035);
    const spanLng = bounds.maxLng - bounds.minLng;
    const spanLat = bounds.maxLat - bounds.minLat;
    const lngScale = getLongitudeScaleAtLatitude(area.center?.[1] || (bounds.minLat + bounds.maxLat) / 2);
    const projectedSpanLng = spanLng * lngScale;
    const scale = Math.max(
      (state.width - paddingX * 2) / projectedSpanLng,
      (state.height - paddingY * 2) / spanLat
    );
    const mapWidth = projectedSpanLng * scale;
    const mapHeight = spanLat * scale;
    const offsetX = (state.width - mapWidth) / 2;
    const offsetY = (state.height - mapHeight) / 2;

    return ([lng, lat]) => [
      offsetX + (normalizeLng(lng) - bounds.minLng) * lngScale * scale,
      offsetY + (bounds.maxLat - lat) * scale,
    ];
  };

  const coordinatesToLinePath = (coordinates, projector) =>
    coordinates
      .map((coord, index) => {
        const [x, y] = projector(coord);
        return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(' ');

  const coordinatesToPolygonPath = (coordinates, projector) =>
    `${coordinatesToLinePath(coordinates, projector)} Z`;

  const multiLineToPath = (lines = [], projector) =>
    lines
      .map((line) => coordinatesToLinePath(line, projector))
      .filter(Boolean)
      .join(' ');

  const getAustraliaSite = (siteId) =>
    AUSTRALIA_FOCUS_SITES.find((item) => item.id === siteId) || null;

  const getPolygonCentroid = (coordinates = []) => {
    const usableCoordinates = coordinates.filter((coord) => Array.isArray(coord) && coord.length >= 2);
    if (!usableCoordinates.length) return null;
    const total = usableCoordinates.reduce(
      (sum, coord) => ({
        lng: sum.lng + Number(coord[0] || 0),
        lat: sum.lat + Number(coord[1] || 0),
      }),
      { lng: 0, lat: 0 }
    );
    return [
      total.lng / usableCoordinates.length,
      total.lat / usableCoordinates.length,
    ];
  };

  const getProjectedBounds = (coordinates = [], projector) => {
    const points = coordinates
      .filter((coord) => Array.isArray(coord) && coord.length >= 2)
      .map((coord) => projector(coord));
    if (!points.length) return null;
    const xs = points.map((point) => point[0]);
    const ys = points.map((point) => point[1]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    return {
      minX,
      maxX,
      minY,
      maxY,
      width: maxX - minX,
      height: maxY - minY,
      centerX: (minX + maxX) / 2,
      centerY: (minY + maxY) / 2,
    };
  };

  const isPointInPolygon = (point, polygon = []) => {
    if (!point || polygon.length < 3) return false;
    const [px, py] = point;
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
      const [xi, yi] = polygon[i];
      const [xj, yj] = polygon[j];
      const intersects = yi > py !== yj > py &&
        px < ((xj - xi) * (py - yi)) / ((yj - yi) || 1) + xi;
      if (intersects) inside = !inside;
    }
    return inside;
  };

  const LOCAL_ROAD_AVOIDANCE_SAMPLE_PX = 1.2;
  const LOCAL_ROAD_CLEARANCE_BY_CLASS = {
    major: 8.5,
    collector: 6.5,
    local: 4.8,
    service: 4.2,
    imperial: 9.2,
    restricted: 5.8,
  };

  const getPointDistance = (a, b) =>
    Math.hypot((Number(a?.[0]) || 0) - (Number(b?.[0]) || 0), (Number(a?.[1]) || 0) - (Number(b?.[1]) || 0));

  const getPointToSegmentDistance = (point, start, end) => {
    const [px, py] = point;
    const [x1, y1] = start;
    const [x2, y2] = end;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthSquared = dx * dx + dy * dy;
    if (!lengthSquared) return Math.hypot(px - x1, py - y1);
    const t = clamp(((px - x1) * dx + (py - y1) * dy) / lengthSquared, 0, 1);
    return Math.hypot(px - (x1 + dx * t), py - (y1 + dy * t));
  };

  const getProjectedPolygonBounds = (polygon = []) => {
    if (!polygon.length) return null;
    const xs = polygon.map((point) => point[0]);
    const ys = polygon.map((point) => point[1]);
    return {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys),
    };
  };

  const getRoadClearance = (roadClass) =>
    LOCAL_ROAD_CLEARANCE_BY_CLASS[roadClass] || LOCAL_ROAD_CLEARANCE_BY_CLASS.local;

  const buildRoadAvoidanceAreas = (area, projector) =>
    (area?.facilities || [])
      .map((facility) => {
        const polygon = (facility.coordinates || [])
          .filter((coord) => Array.isArray(coord) && coord.length >= 2)
          .map((coord) => projector(coord));
        const bounds = getProjectedPolygonBounds(polygon);
        if (!bounds || polygon.length < 3) return null;
        return { id: facility.id, polygon, bounds };
      })
      .filter(Boolean);

  const isPointNearPolygonEdge = (point, polygon, clearance) => {
    for (let index = 0; index < polygon.length; index += 1) {
      const start = polygon[index];
      const end = polygon[(index + 1) % polygon.length];
      if (getPointToSegmentDistance(point, start, end) <= clearance) return true;
    }
    return false;
  };

  const isRoadPointBlocked = (point, avoidanceAreas, roadClass) => {
    if (!point || !avoidanceAreas?.length) return false;
    const clearance = getRoadClearance(roadClass);
    return avoidanceAreas.some((area) => {
      const { bounds, polygon } = area;
      if (
        point[0] < bounds.minX - clearance ||
        point[0] > bounds.maxX + clearance ||
        point[1] < bounds.minY - clearance ||
        point[1] > bounds.maxY + clearance
      ) {
        return false;
      }
      return isPointInPolygon(point, polygon) || isPointNearPolygonEdge(point, polygon, clearance);
    });
  };

  const projectedSegmentsToPath = (segments = []) =>
    segments
      .filter((segment) => segment.length >= 2)
      .map((segment) =>
        segment
          .map((point, index) => `${index === 0 ? 'M' : 'L'}${point[0].toFixed(2)},${point[1].toFixed(2)}`)
          .join(' ')
      )
      .join(' ');

  const buildAvoidedRoadPath = (coordinates, projector, avoidanceAreas, roadClass) => {
    const projected = (coordinates || [])
      .filter((coord) => Array.isArray(coord) && coord.length >= 2)
      .map((coord) => projector(coord));
    if (projected.length < 2) return '';
    if (!avoidanceAreas?.length) return projectedSegmentsToPath([projected]);

    const segments = [];
    let current = [];
    const appendPoint = (point) => {
      const last = current[current.length - 1];
      if (!last || getPointDistance(last, point) > 0.35) current.push(point);
    };
    const flushSegment = () => {
      if (current.length >= 2) segments.push(current);
      current = [];
    };

    for (let lineIndex = 0; lineIndex < projected.length - 1; lineIndex += 1) {
      const start = projected[lineIndex];
      const end = projected[lineIndex + 1];
      const length = getPointDistance(start, end);
      const steps = Math.max(2, Math.ceil(length / LOCAL_ROAD_AVOIDANCE_SAMPLE_PX));
      for (let step = 0; step <= steps; step += 1) {
        if (lineIndex > 0 && step === 0) continue;
        const t = step / steps;
        const point = [
          start[0] + (end[0] - start[0]) * t,
          start[1] + (end[1] - start[1]) * t,
        ];
        if (isRoadPointBlocked(point, avoidanceAreas, roadClass)) {
          flushSegment();
        } else {
          appendPoint(point);
        }
      }
    }

    flushSegment();
    return projectedSegmentsToPath(segments);
  };

  const buildInternalStructureSegments = (bounds, type = 'default', variant = 'zone') => {
    if (!bounds || bounds.width < 9 || bounds.height < 7) return [];
    const margin = clamp(Math.min(bounds.width, bounds.height) * 0.18, 2.4, 8.5);
    const x1 = bounds.minX + margin;
    const x2 = bounds.maxX - margin;
    const y1 = bounds.minY + margin;
    const y2 = bounds.maxY - margin;
    const cx = bounds.centerX;
    const cy = bounds.centerY;
    const thirdX = x1 + (x2 - x1) / 3;
    const twoThirdX = x1 + ((x2 - x1) * 2) / 3;
    const thirdY = y1 + (y2 - y1) / 3;
    const twoThirdY = y1 + ((y2 - y1) * 2) / 3;

    const rect = `M${x1.toFixed(2)},${y1.toFixed(2)} H${x2.toFixed(2)} V${y2.toFixed(2)} H${x1.toFixed(2)} Z`;
    const segments = [rect];
    const addCenterRelay = () => {
      const relaySize = clamp(Math.min(bounds.width, bounds.height) * 0.08, 1.6, 3.8);
      const rx1 = cx - relaySize;
      const rx2 = cx + relaySize;
      const ry1 = cy - relaySize;
      const ry2 = cy + relaySize;
      segments.push(`M${rx1.toFixed(2)},${ry1.toFixed(2)} H${rx2.toFixed(2)} V${ry2.toFixed(2)} H${rx1.toFixed(2)} Z`);
    };

    if (type === 'defence' || type === 'security') {
      segments.push(
        `M${x1.toFixed(2)},${cy.toFixed(2)} H${x2.toFixed(2)}`,
        `M${twoThirdX.toFixed(2)},${y1.toFixed(2)} V${y2.toFixed(2)}`,
        `M${x1.toFixed(2)},${(y2 + margin * 0.34).toFixed(2)} H${x2.toFixed(2)}`
      );
      addCenterRelay();
    } else if (type === 'radar') {
      segments.push(
        `M${x1.toFixed(2)},${y2.toFixed(2)} L${cx.toFixed(2)},${y1.toFixed(2)} L${x2.toFixed(2)},${y2.toFixed(2)}`,
        `M${cx.toFixed(2)},${y1.toFixed(2)} V${y2.toFixed(2)}`,
        `M${(cx - (x2 - x1) * 0.18).toFixed(2)},${twoThirdY.toFixed(2)} H${(cx + (x2 - x1) * 0.18).toFixed(2)}`
      );
      addCenterRelay();
    } else if (type === 'harbor' || type === 'harbour') {
      segments.push(
        `M${x1.toFixed(2)},${twoThirdY.toFixed(2)} H${x2.toFixed(2)}`,
        `M${cx.toFixed(2)},${y1.toFixed(2)} V${y2.toFixed(2)}`,
        `M${x1.toFixed(2)},${(y2 + margin * 0.24).toFixed(2)} H${x2.toFixed(2)}`
      );
    } else if (type === 'archive') {
      segments.push(
        `M${x1.toFixed(2)},${thirdY.toFixed(2)} H${x2.toFixed(2)}`,
        `M${x1.toFixed(2)},${twoThirdY.toFixed(2)} H${x2.toFixed(2)}`,
        `M${thirdX.toFixed(2)},${y1.toFixed(2)} V${y2.toFixed(2)}`
      );
    } else if (type === 'residential') {
      segments.push(
        `M${thirdX.toFixed(2)},${y1.toFixed(2)} V${y2.toFixed(2)}`,
        `M${x1.toFixed(2)},${cy.toFixed(2)} H${x2.toFixed(2)}`
      );
    } else {
      segments.push(
        `M${cx.toFixed(2)},${y1.toFixed(2)} V${y2.toFixed(2)}`,
        `M${x1.toFixed(2)},${cy.toFixed(2)} H${x2.toFixed(2)}`
      );
    }

    if (variant === 'facility' && type !== 'defence' && type !== 'security' && type !== 'radar') {
      addCenterRelay();
    }

    return segments;
  };

  const getFacilityConnectorRadius = (markerScale = 1, screenScale = 1) =>
    Math.max(
      7.4,
      (FACILITY_SYMBOL_VISUAL_SIZE * markerScale * screenScale) / 2 + 2.2
    );

  const getFacilityCenterMap = (facilities = [], projector) =>
    new Map(
      facilities
        .map((facility) => {
          const centroid = getPolygonCentroid(facility.coordinates);
          if (!centroid) return null;
          const [x, y] = projector(centroid);
          const markerScale = getFacilityMarkerScale(facility, projector);
          const markerRadius = getFacilityConnectorRadius(markerScale, 1);
          return [facility.id, { x, y, type: facility.type || 'facility', markerRadius }];
        })
        .filter(Boolean)
    );

  const getConnectorEndpoint = (origin, target) => {
    if (!origin || !target) return origin;
    const dx = target.x - origin.x;
    const dy = target.y - origin.y;
    const radius = origin.markerRadius || 7.4;
    if (Math.abs(dx) >= Math.abs(dy)) {
      return {
        x: origin.x + Math.sign(dx || 1) * radius,
        y: origin.y,
      };
    }
    return {
      x: origin.x,
      y: origin.y + Math.sign(dy || 1) * radius,
    };
  };

  const buildOrthogonalConnectorPath = (from, to) => {
    if (!from || !to) return '';
    const start = getConnectorEndpoint(from, to);
    const end = getConnectorEndpoint(to, from);
    const midX = (start.x + end.x) / 2;
    return [
      `M${start.x.toFixed(2)},${start.y.toFixed(2)}`,
      `H${midX.toFixed(2)}`,
      `V${end.y.toFixed(2)}`,
      `H${end.x.toFixed(2)}`,
    ].join(' ');
  };

  const getOrthogonalConnectorNodes = (from, to) => {
    if (!from || !to) return [];
    const start = getConnectorEndpoint(from, to);
    const end = getConnectorEndpoint(to, from);
    const midX = (start.x + end.x) / 2;
    return [
      { x: midX, y: start.y, variant: 'junction' },
      { x: midX, y: end.y, variant: 'junction' },
    ];
  };

  const getMarkerConnectorGeometry = (marker) => {
    if (!marker) return null;
    const x = Number(marker.dataset.centerX);
    const y = Number(marker.dataset.centerY);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    const markerScale = Number(marker.dataset.markerScale || 1) || 1;
    const screenScale = Number(marker.dataset.screenScale || 1) || 1;
    return {
      x,
      y,
      markerRadius: getFacilityConnectorRadius(markerScale, screenScale),
    };
  };

  const updateFacilityConnectorGeometry = () => {
    if (!state.australiaDetailLayer) return;
    const markerMap = new Map(
      Array.from(state.australiaDetailLayer.querySelectorAll('.empire-map-australia-detail-marker[data-detail-site][data-local-feature-key]'))
        .map((marker) => [
          `${marker.dataset.detailSite}:${marker.dataset.localFeatureKey}`,
          getMarkerConnectorGeometry(marker),
        ])
        .filter(([, geometry]) => geometry)
    );

    state.australiaDetailLayer
      .querySelectorAll('.empire-map-australia-function-link[data-detail-site][data-link-from][data-link-to]')
      .forEach((link) => {
        const siteId = link.dataset.detailSite;
        const from = markerMap.get(`${siteId}:${link.dataset.linkFrom}`);
        const to = markerMap.get(`${siteId}:${link.dataset.linkTo}`);
        if (!from || !to) return;
        const pathData = buildOrthogonalConnectorPath(from, to);
        if (pathData) link.setAttribute('d', pathData);

        const nodes = Array.from(
          state.australiaDetailLayer.querySelectorAll(
            `.empire-map-australia-function-node[data-detail-site="${siteId}"][data-link-from="${link.dataset.linkFrom}"][data-link-to="${link.dataset.linkTo}"]`
          )
        );
        getOrthogonalConnectorNodes(from, to).forEach((point, index) => {
          const node = nodes[index];
          if (!node) return;
          node.setAttribute('x', (point.x - 1.55).toFixed(2));
          node.setAttribute('y', (point.y - 1.55).toFixed(2));
        });
      });
  };

  const rectsIntersect = (a, b, padding = 0) => {
    if (!a || !b) return false;
    return (
      a.left - padding < b.right &&
      a.right + padding > b.left &&
      a.top - padding < b.bottom &&
      a.bottom + padding > b.top
    );
  };

  const updateLocalLabelAvoidance = () => {
    if (!state.australiaDetailLayer || state.australiaView === 'overview') return;
    const siteId = state.australiaView;
    const markerRects = Array.from(
      state.australiaDetailLayer.querySelectorAll(
        `.empire-map-australia-detail-marker.is-visible[data-detail-site="${siteId}"] .empire-map-australia-detail-marker-frame`
      )
    ).map((node) => node.getBoundingClientRect());

    state.australiaDetailLayer
      .querySelectorAll(`.empire-map-australia-detail-label--district[data-detail-site="${siteId}"]`)
      .forEach((label) => {
        if (!label.classList.contains('is-visible') || label.classList.contains('is-local-selected')) {
          label.classList.remove('is-label-avoided');
          return;
        }
        const labelRect = label.getBoundingClientRect();
        const shouldAvoid = markerRects.some((markerRect) => rectsIntersect(labelRect, markerRect, 3));
        label.classList.toggle('is-label-avoided', shouldAvoid);
      });
  };

  const getFacilityConnectorPairs = (siteId, centerMap) => {
    const available = (...ids) => ids.find((id) => centerMap.has(id));
    const pairsBySite = {
      canberra: [
        ['supreme-council', 'capital-defence-gate', 'screening'],
        ['supreme-council', 'imperial-intelligence', 'classified'],
        ['supreme-council', 'revival-command-annex', 'archive'],
      ],
      nikenbah: [
        ['maritime-warning-bureau', 'signal-array', 'sensor'],
        ['maritime-warning-bureau', 'patrol-dispatch', 'dispatch'],
        ['patrol-dispatch', 'coast-watch-bunker', 'screening'],
      ],
      sydney: [
        ['ocma-headquarters', 'colonial-archive-terminal', 'archive'],
        ['ocma-headquarters', 'harbour-dispatch-office', 'dispatch'],
        ['ocma-headquarters', 'botany-logistics-gate', 'screening'],
      ],
    };
    return (pairsBySite[siteId] || []).filter(([fromId, toId]) => available(fromId) && available(toId));
  };

  const renderFacilityConnectors = (siteId, facilities, projector) => {
    if (!state.australiaDetailLayer || !Array.isArray(facilities) || !projector) return;
    const centerMap = getFacilityCenterMap(facilities, projector);
    getFacilityConnectorPairs(siteId, centerMap).forEach(([fromId, toId, role]) => {
      const from = centerMap.get(fromId);
      const to = centerMap.get(toId);
      const pathData = buildOrthogonalConnectorPath(from, to);
      if (!pathData) return;
      state.australiaDetailLayer.appendChild(
        createSvgEl('path', {
          class: `empire-map-australia-function-link empire-map-australia-function-link--${role || 'default'}`,
          d: pathData,
          'data-detail-site': siteId,
          'data-link-from': fromId,
          'data-link-to': toId,
          'aria-hidden': 'true',
        })
      );
      getOrthogonalConnectorNodes(from, to).forEach((point) => {
        state.australiaDetailLayer.appendChild(
          createSvgEl('rect', {
            class: `empire-map-australia-function-node empire-map-australia-function-node--${role || 'default'} empire-map-australia-function-node--${point.variant}`,
            x: (point.x - 1.55).toFixed(2),
            y: (point.y - 1.55).toFixed(2),
            width: '3.1',
            height: '3.1',
            'data-detail-site': siteId,
            'data-link-from': fromId,
            'data-link-to': toId,
            'aria-hidden': 'true',
          })
        );
      });
    });
  };

  const renderInternalStructure = (siteId, item, projector, variant = 'zone') => {
    if (!state.australiaDetailLayer || !item?.coordinates || !projector) return;
    const bounds = getProjectedBounds(item.coordinates, projector);
    const segments = buildInternalStructureSegments(bounds, item.type, variant);
    if (!segments.length) return;
    const featureKey = item.id || item.name || '';
    state.australiaDetailLayer.appendChild(
      createSvgEl('path', {
        class: `empire-map-australia-internal-structure empire-map-australia-internal-structure--${variant} empire-map-australia-internal-structure--${item.type || 'default'}`,
        d: segments.join(' '),
        'data-detail-site': siteId,
        'data-local-feature-key': featureKey,
        'aria-hidden': 'true',
      })
    );
  };

  const renderAreaPlusFill = (siteId, item, projector) => {
    if (!state.australiaDetailLayer || !item?.coordinates || !projector) return;
    const bounds = getProjectedBounds(item.coordinates, projector);
    if (!bounds || bounds.width < 24 || bounds.height < 18) return;
    const polygon = item.coordinates
      .filter((coord) => Array.isArray(coord) && coord.length >= 2)
      .map((coord) => projector(coord));
    const step = clamp(Math.min(bounds.width, bounds.height) / 3.5, 12, 22);
    const arm = clamp(step * 0.15, 1.4, 2.8);
    const margin = step * 0.78;
    const segments = [];
    for (let y = bounds.minY + margin; y <= bounds.maxY - margin; y += step) {
      for (let x = bounds.minX + margin; x <= bounds.maxX - margin; x += step) {
        if (!isPointInPolygon([x, y], polygon)) continue;
        segments.push(
          `M${(x - arm).toFixed(2)},${y.toFixed(2)} H${(x + arm).toFixed(2)}`,
          `M${x.toFixed(2)},${(y - arm).toFixed(2)} V${(y + arm).toFixed(2)}`
        );
      }
    }
    if (!segments.length) return;
    const featureKey = item.id || item.name || '';
    state.australiaDetailLayer.appendChild(
      createSvgEl('path', {
        class: `empire-map-australia-plus-fill empire-map-australia-plus-fill--${item.type || 'default'}`,
        d: segments.join(' '),
        'data-detail-site': siteId,
        'data-local-feature-key': featureKey,
        'aria-hidden': 'true',
      })
    );
  };

  const FACILITY_SYMBOL_VISUAL_SIZE = 11.6;
  const FACILITY_SYMBOL_MIN_FRAME_SIZE = 10;
  const FACILITY_SYMBOL_TARGET_COVERAGE = 0.22;
  const FACILITY_SYMBOL_MIN_SCALE = 1.25;
  const FACILITY_SYMBOL_MAX_SCALE = 2.15;
  const FACILITY_SYMBOL_DESKTOP_MIN_PX = 22;

  const getFacilityMarkerScale = (facility, projector) => {
    const bounds = getProjectedBounds(facility?.coordinates, projector);
    if (!bounds) return FACILITY_SYMBOL_MIN_SCALE;
    const occupiedRange = Math.max(bounds.width, bounds.height);
    const targetSize = occupiedRange * FACILITY_SYMBOL_TARGET_COVERAGE;
    return clamp(
      targetSize / FACILITY_SYMBOL_VISUAL_SIZE,
      FACILITY_SYMBOL_MIN_SCALE,
      FACILITY_SYMBOL_MAX_SCALE
    );
  };

  const FACILITY_TACTICAL_SYMBOLS = {
    capital: {
      frame: 'M-5.8,-5.8 H5.8 V5.8 H-5.8 Z',
      glyph: ['M-2.6,2.2 H2.6', 'M-1.65,0.2 H1.65', 'M0,-3.15 V3.1'],
      accent: ['M-5.8,-5.8 L-3.2,-3.2', 'M5.8,-5.8 L3.2,-3.2'],
    },
    intel: {
      frame: 'M-5.8,-5.8 H5.8 V5.8 H-5.8 Z',
      glyph: ['M-3.0,0 H3.0', 'M0,-3.2 V3.2', 'M-2.05,-2.05 L2.05,2.05', 'M2.05,-2.05 L-2.05,2.05'],
      accent: ['M-5.8,-5.8 H-2.8', 'M5.8,5.8 H2.8'],
    },
    radar: {
      frame: 'M-5.8,-5.8 H5.8 V5.8 H-5.8 Z',
      glyph: ['M-3.05,2.65 H3.05', 'M-1.75,0.75 H1.75', 'M0,-3.6 V3.65'],
      accent: ['M-5.8,5.8 L-2.8,2.8', 'M5.8,5.8 L2.8,2.8'],
    },
    archive: {
      frame: 'M-5.8,-5.8 H5.8 V5.8 H-5.8 Z',
      glyph: ['M-3.1,-2.6 H3.1', 'M-3.1,0 H3.1', 'M-3.1,2.6 H3.1'],
      accent: ['M-5.8,-2.8 H-3.8', 'M5.8,-2.8 H3.8'],
    },
    defence: {
      frame: 'M-5.8,-5.8 H5.8 V5.8 H-5.8 Z',
      glyph: ['M-4.0,0 H4.0', 'M0,-4.0 V4.0', 'M-2.0,-2.0 H2.0 V2.0 H-2.0 Z'],
      accent: ['M-5.8,0 H-4.0', 'M5.8,0 H4.0'],
    },
    harbor: {
      frame: 'M-5.8,-5.8 H5.8 V5.8 H-5.8 Z',
      glyph: ['M0,-3.25 V2.9', 'M-2.65,-0.85 H2.65', 'M-3.1,1.25 C-1.55,2.9 1.55,2.9 3.1,1.25'],
      accent: ['M-5.8,5.8 H-2.9', 'M5.8,5.8 H2.9'],
    },
    default: {
      frame: 'M-5.8,-5.8 H5.8 V5.8 H-5.8 Z',
      glyph: ['M-2.7,2.7 L2.7,-2.7'],
      accent: ['M-5.8,-5.8 L-3.3,-3.3', 'M5.8,5.8 L3.3,3.3'],
    },
  };

  const getFacilityTacticalSymbolMarkup = (type = 'default') => {
    const symbol = FACILITY_TACTICAL_SYMBOLS[type] || FACILITY_TACTICAL_SYMBOLS.default;
    return `
              <rect class="empire-map-australia-detail-marker-hit" x="-10" y="-10" width="20" height="20"></rect>
              <path class="empire-map-australia-detail-marker-plate" d="${symbol.frame}"></path>
              <path class="empire-map-australia-detail-marker-frame" d="${symbol.frame}"></path>
              ${(symbol.accent || []).map((path) => `<path class="empire-map-australia-detail-marker-accent" d="${path}"></path>`).join('')}
              ${symbol.glyph.map((path) => `<path class="empire-map-australia-detail-marker-glyph" d="${path}"></path>`).join('')}
            `;
  };

  const offsetCoordinate = ([lng, lat], distanceLng, distanceLat, angleDeg) => {
    const angle = (angleDeg * Math.PI) / 180;
    return [
      lng + Math.cos(angle) * distanceLng,
      lat + Math.sin(angle) * distanceLat,
    ];
  };

  const buildDetailStreetLines = (area) => {
    const lines = [];
    if (!area) return lines;
    const { center, spanLng, spanLat } = area;

    area.majorAngles.forEach((angle, angleIndex) => {
      [-0.30, -0.15, 0, 0.15, 0.30].forEach((offset, offsetIndex) => {
        const perpendicular = angle + 90;
        const startCenter = offsetCoordinate(center, spanLng * offset, spanLat * offset, perpendicular);
        lines.push({
          className: offsetIndex === 2 ? 'detail-major' : 'detail-secondary',
          coordinates: [
            offsetCoordinate(startCenter, spanLng * 0.62, spanLat * 0.62, angle + 180),
            offsetCoordinate(startCenter, spanLng * 0.62, spanLat * 0.62, angle),
          ],
          key: `major-${angleIndex}-${offsetIndex}`,
        });
      });
    });

    area.minorAngles.forEach((angle, angleIndex) => {
      [-0.46, -0.34, -0.22, -0.10, 0.02, 0.14, 0.26, 0.38, 0.50].forEach((offset, offsetIndex) => {
        const perpendicular = angle + 90;
        const startCenter = offsetCoordinate(center, spanLng * offset, spanLat * offset, perpendicular);
        lines.push({
          className: 'detail-local',
          coordinates: [
            offsetCoordinate(startCenter, spanLng * 0.48, spanLat * 0.48, angle + 180),
            offsetCoordinate(startCenter, spanLng * 0.48, spanLat * 0.48, angle),
          ],
          key: `minor-${angleIndex}-${offsetIndex}`,
        });
      });
    });

    return lines;
  };

  const buildDetailBlocks = (area) => {
    if (!area) return [];
    const blocks = [];
    const { center, spanLng, spanLat } = area;
    const blockWidth = spanLng * 0.055;
    const blockHeight = spanLat * 0.04;
    [
      [-0.40, -0.30],
      [-0.24, -0.30],
      [-0.08, -0.30],
      [0.10, -0.28],
      [0.28, -0.24],
      [0.42, -0.14],
      [-0.36, -0.08],
      [-0.18, -0.06],
      [0.00, -0.04],
      [0.20, 0.02],
      [0.38, 0.08],
      [-0.42, 0.18],
      [-0.22, 0.18],
      [-0.02, 0.22],
      [0.18, 0.24],
      [0.38, 0.32],
    ].forEach(([lngOffset, latOffset], index) => {
      const lng = center[0] + spanLng * lngOffset;
      const lat = center[1] + spanLat * latOffset;
      blocks.push({
        id: `block-${index}`,
        coordinates: [
          [lng - blockWidth, lat - blockHeight],
          [lng + blockWidth, lat - blockHeight],
          [lng + blockWidth, lat + blockHeight],
          [lng - blockWidth, lat + blockHeight],
        ],
      });
    });
    return blocks;
  };

  const buildDetailArcCoordinates = (area, arc) => {
    if (!area || !arc) return [];
    const coordinates = [];
    const start = arc.startAngle ?? 0;
    const end = arc.endAngle ?? 360;
    const steps = Math.max(18, Math.ceil(Math.abs(end - start) / 8));

    for (let index = 0; index <= steps; index += 1) {
      const angle = ((start + ((end - start) * index) / steps) * Math.PI) / 180;
      coordinates.push([
        area.center[0] + Math.cos(angle) * arc.radiusLng,
        area.center[1] + Math.sin(angle) * arc.radiusLat,
      ]);
    }

    return coordinates;
  };

  const renderLocalRoads = (siteId, area, projector) => {
    if (!state.australiaDetailLayer || !siteId || !area || !projector) return;
    const roadFeatures = state.localRoadFeatures.filter(
      (feature) => feature?.properties?.siteId === siteId && feature?.geometry?.type === 'LineString'
    );
    const avoidanceAreas = buildRoadAvoidanceAreas(area, projector);
    const roadDescriptions = {
      major: '城市主干道路，构成真实路网骨架。',
      collector: '次级道路，连接主干线与城市片区。',
      local: '社区道路，表现城市街区肌理。',
      service: '设施服务道路，仅保留关键入口。',
      imperial: '帝国专用通道，用于军事、行政和保密运输。',
      restricted: '限制通行线路，通常连接警戒区、设施后勤或安保节点。',
    };

    roadFeatures.forEach((feature, index) => {
      const coordinates = feature.geometry.coordinates || [];
      if (coordinates.length < 2) return;
      const roadClass = feature.properties?.roadClass || 'local';
      const roadPath = buildAvoidedRoadPath(coordinates, projector, avoidanceAreas, roadClass);
      if (!roadPath) return;
      const roadKey = `road-${feature.properties?.osmId || feature.properties?.name || index}`;
      const roadText = resolveLocalFeatureText(
        siteId,
        roadKey,
        feature.properties?.name || '道路',
        roadDescriptions[roadClass] || '局部道路。',
        [feature.properties?.name]
      );
      state.australiaDetailLayer.appendChild(
        createSvgEl('path', {
          class: `empire-map-australia-local-road empire-map-australia-local-road--${roadClass}`,
          d: roadPath,
          'data-detail-site': siteId,
          'data-detail-id': `${siteId}-${roadKey}`,
          'data-map-feature-kind': 'road',
          'data-map-tooltip-title': roadText.title,
          'data-map-tooltip-body': roadText.body,
        })
      );
    });
  };

  const renderLocalContours = (siteId, projector) => {
    if (!state.australiaDetailLayer || !siteId || !projector) return;
    const contourFeatures = state.localContourFeatures.filter(
      (feature) =>
        feature?.properties?.siteId === siteId &&
        feature?.geometry?.type === 'MultiLineString'
    );

    contourFeatures.forEach((feature) => {
      const { properties = {}, geometry = {} } = feature;
      const pathData = multiLineToPath(geometry.coordinates || [], projector);
      if (!pathData) return;
      const elevation = Number(properties.elevation || 0);
      const lineCount = Array.isArray(geometry.coordinates) ? geometry.coordinates.length : 0;
      const densityClass = lineCount > 2500
        ? ' empire-map-australia-contour--dense'
        : lineCount < 180
          ? ' empire-map-australia-contour--sparse'
          : '';
      const contourKey = `contour-${elevation}`;
      const contourText = resolveLocalFeatureText(
        siteId,
        contourKey,
        `${elevation}m 等高线`,
        `真实 DEM 生成的陆地等高线，间距 ${properties.contourInterval || '-'}m；来源：Mapzen Terrain Tiles / AWS Open Data Skadi HGT。`
      );
      state.australiaDetailLayer.appendChild(
        createSvgEl('path', {
          class: `empire-map-australia-contour${properties.index ? ' empire-map-australia-contour--index' : ''}${densityClass}`,
          d: pathData,
          'data-detail-site': siteId,
          'data-detail-id': `${siteId}-${contourKey}`,
          'data-line-count': String(lineCount),
          'data-map-feature-kind': 'terrain',
          'data-map-tooltip-title': contourText.title,
          'data-map-tooltip-body': contourText.body,
        })
      );
    });
  };

  const localFeatureDescription = (type, fallback = '局部地图标注。') => {
    const descriptions = {
      lake: '城市水域，用于定位真实地理环境。',
      bay: '近岸水域，显示海事设施的外部方向。',
      basin: '港湾或巡逻水域，关联海事调度。',
      harbour: '港湾水域，是海运和行政连接的重要地形。',
      command: '帝国核心指挥或行政管制区。',
      intel: '情报系统控制区，通常具备保密和筛查职能。',
      radar: '雷达/监听/预警覆盖区。',
      security: '安保管制区，限制普通通行。',
      archive: '档案和行政资料处理区。',
      harbor: '港湾派遣或海事后勤区域。',
      residential: '居民、服务和常规行政街区，用简化区块表示。',
      capital: '首都级核心设施，优先防护目标。',
      defence: '防务节点，负责入口管制和区域封锁。',
      terrain: '真实 DEM 生成的等高线，用于表现自然地形。',
      facility: '重点机构或设施节点。',
      system: '地图系统标注，表示警戒、调度或转运范围。',
    };
    return descriptions[type] || fallback;
  };

  const renderLocalBackdrop = () => {
    if (!state.australiaLocalBackdropLayer) return;
    state.australiaLocalBackdropLayer.innerHTML = '';
  };

  const getCurrentLocalPan = () => {
    const view = state.australiaView;
    if (!view || view === 'overview') return { x: 0, y: 0 };
    return state.australiaLocalPan[view] || { x: 0, y: 0 };
  };

  const getCurrentLocalZoom = () => {
    const view = state.australiaView;
    if (!view || view === 'overview') return 1;
    return state.australiaLocalZoom[view] || 1;
  };

  const clampLocalPan = (pan) => {
    const zoom = getCurrentLocalZoom();
    const limitX = state.width * (0.36 + zoom * 0.28);
    const limitY = state.height * (0.36 + zoom * 0.28);
    return {
      x: clamp(pan.x || 0, -limitX, limitX),
      y: clamp(pan.y || 0, -limitY, limitY),
    };
  };

  const clampLocalZoom = (zoom) => clamp(zoom || 1, 0.85, 3.6);

  const applyLocalPanTransform = () => {
    if (!state.australiaLocalPanLayer) return;
    const pan = state.australiaView === 'overview' ? { x: 0, y: 0 } : getCurrentLocalPan();
    const zoom = state.australiaView === 'overview' ? 1 : getCurrentLocalZoom();
    state.australiaLocalPanLayer.setAttribute(
      'transform',
      `translate(${pan.x.toFixed(2)} ${pan.y.toFixed(2)}) scale(${zoom.toFixed(3)})`
    );
    updateLocalScreenScale();
  };

  const getSvgViewportCompensation = () => {
    const svgRect = state.svg?.getBoundingClientRect();
    const svgScaleX = svgRect?.width ? svgRect.width / state.width : 1;
    const svgScaleY = svgRect?.height ? svgRect.height / state.height : 1;
    const viewportScale = Math.max(Math.min(svgScaleX, svgScaleY), 0.01);
    return clamp(0.72 / viewportScale, 1, 2.35);
  };

  const updateAustraliaSiteScreenScale = () => {
    if (!state.australiaSiteLayer) return;
    const scale = state.australiaView === 'overview' ? getSvgViewportCompensation() : 1;
    state.australiaSiteLayer.querySelectorAll('.empire-map-australia-site').forEach((site) => {
      const currentTransform = site.getAttribute('transform') || '';
      const baseTransform = site.dataset.baseTransform || currentTransform.replace(/\s+scale\([^)]*\)/g, '');
      site.dataset.baseTransform = baseTransform;
      site.setAttribute('transform', `${baseTransform} scale(${scale.toFixed(3)})`);
    });
  };

  const updateLocalScreenScale = () => {
    if (!state.australiaDetailLayer) return;
    const zoom = state.australiaView === 'overview' ? 1 : getCurrentLocalZoom();
    state.root?.classList.toggle('is-local-low-zoom', state.australiaView !== 'overview' && zoom < 1.15);
    state.root?.classList.toggle('is-local-high-zoom', state.australiaView !== 'overview' && zoom > 1.85);
    const responsiveCompensation = getSvgViewportCompensation();
    const svgRect = state.svg?.getBoundingClientRect();
    const svgScaleX = svgRect?.width ? svgRect.width / state.width : 1;
    const svgScaleY = svgRect?.height ? svgRect.height / state.height : 1;
    const viewportScale = Math.max(Math.min(svgScaleX, svgScaleY), 0.01);
    const isDesktopViewport = (window.innerWidth || svgRect?.width || 0) >= 760;
    const labelScale = clamp((responsiveCompensation * 0.92) / zoom, 0.42, 1.7);
    state.australiaDetailLayer.querySelectorAll('.empire-map-australia-detail-marker').forEach((marker) => {
      const currentTransform = marker.getAttribute('transform') || '';
      const baseTransform = marker.dataset.baseTransform || currentTransform.replace(/\s+scale\([^)]*\)/g, '');
      const markerScale = Number(marker.dataset.markerScale || 1) || 1;
      const visibleSymbolPx = FACILITY_SYMBOL_MIN_FRAME_SIZE * markerScale * responsiveCompensation * viewportScale;
      const desktopMinBoost = isDesktopViewport
        ? clamp(FACILITY_SYMBOL_DESKTOP_MIN_PX / Math.max(visibleSymbolPx, 1), 1, 2.6)
        : 1;
      const screenScale = clamp((responsiveCompensation * desktopMinBoost) / zoom, 0.42, 3.2);
      marker.dataset.baseTransform = baseTransform;
      marker.dataset.screenScale = screenScale.toFixed(3);
      marker.setAttribute('transform', `${baseTransform} scale(${screenScale.toFixed(3)})`);
    });
    state.australiaDetailLayer.querySelectorAll('.empire-map-australia-detail-label').forEach((label) => {
      label.style.setProperty('--local-screen-scale', labelScale.toFixed(3));
    });
    updateFacilityConnectorGeometry();
    window.requestAnimationFrame(() => updateLocalLabelAvoidance());
    updateAustraliaSiteScreenScale();
  };

  const setLocalPan = (siteId, pan) => {
    if (!siteId || siteId === 'overview') return;
    state.australiaLocalPan[siteId] = clampLocalPan(pan);
    applyLocalPanTransform();
  };

  const setLocalZoom = (siteId, zoom, anchor = null) => {
    if (!siteId || siteId === 'overview') return;
    const previousZoom = state.australiaLocalZoom[siteId] || 1;
    const nextZoom = clampLocalZoom(zoom);
    const currentPan = state.australiaLocalPan[siteId] || { x: 0, y: 0 };
    let nextPan = currentPan;

    if (anchor) {
      const originX = state.width / 2;
      const originY = state.height / 2;
      const ratio = nextZoom / previousZoom;
      nextPan = {
        x: anchor.x - originX - ((anchor.x - originX - currentPan.x) * ratio),
        y: anchor.y - originY - ((anchor.y - originY - currentPan.y) * ratio),
      };
    }

    state.australiaLocalZoom[siteId] = nextZoom;
    state.australiaLocalPan[siteId] = clampLocalPan(nextPan);
    applyLocalPanTransform();
    updateLocalZoomUi();
  };

  const zoomLocalMapBy = (factor, anchor = null) => {
    if (state.australiaView === 'overview') return;
    setLocalZoom(state.australiaView, getCurrentLocalZoom() * factor, anchor);
  };

  const formatLocalZoomLabel = (zoom) => {
    const rounded = Math.round((zoom || 1) * 10) / 10;
    return `${rounded.toFixed(1)}X`;
  };

  const updateAustraliaStatusText = () => {
    const statusGroup = state.australiaUiLayer?.querySelector('.empire-map-australia-status');
    const statusNode = statusGroup?.querySelector('text');
    if (!statusNode) return;
    const activeSite = getAustraliaSite(state.australiaView);
    const statusText = activeSite
      ? `${activeSite.label} / LOCAL ${formatLocalZoomLabel(getCurrentLocalZoom())}`
      : 'AUSTRALIA / NATIONAL';
    statusNode.textContent = statusText;

    const statusFrame = statusGroup?.querySelector('rect');
    if (statusFrame) {
      const textWidth = typeof statusNode.getComputedTextLength === 'function'
        ? statusNode.getComputedTextLength()
        : statusText.length * 7;
      statusFrame.setAttribute('width', String(Math.max(184, Math.ceil(textWidth + 24))));
    }
  };

  const updateLocalZoomUi = () => {
    const zoom = getCurrentLocalZoom();
    const zoomText = state.australiaUiLayer?.querySelector('.empire-map-australia-zoom-readout');
    if (zoomText) zoomText.textContent = formatLocalZoomLabel(zoom);
    state.australiaUiLayer?.querySelectorAll('[data-map-action="zoom-local-out"]').forEach((node) => {
      node.classList.toggle('is-disabled', zoom <= 0.86 || state.australiaView === 'overview');
    });
    state.australiaUiLayer?.querySelectorAll('[data-map-action="zoom-local-in"]').forEach((node) => {
      node.classList.toggle('is-disabled', zoom >= 3.55 || state.australiaView === 'overview');
    });
    state.australiaUiLayer?.querySelectorAll('[data-map-action="reset-local-map"]').forEach((node) => {
      node.classList.toggle('is-disabled', state.australiaView === 'overview');
    });
    updateAustraliaStatusText();
  };

  const getVisibleLocalLayerCount = (siteId, selector) =>
    state.australiaDetailLayer?.querySelectorAll(`${selector}.is-visible[data-detail-site="${siteId}"]`).length || 0;

  const getLocalDebugSnapshot = () => {
    const detailEl = state.detailEl;
    const siteLayerStyle = state.australiaSiteLayer ? getComputedStyle(state.australiaSiteLayer) : null;
    const siteStates = Array.from(state.australiaSiteLayer?.querySelectorAll('.empire-map-australia-site') || []).map((node) => {
      const style = getComputedStyle(node);
      return {
        siteId: node.dataset.siteId || '',
        selected: node.classList.contains('is-selected'),
        muted: node.classList.contains('is-muted'),
        ariaHidden: node.getAttribute('aria-hidden') || 'false',
        tabIndex: node.getAttribute('tabindex') || '',
        visible: style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0,
      };
    });
    const detailSites = Object.fromEntries(
      AUSTRALIA_FOCUS_SITES.map((site) => [
        site.id,
        {
          roads: getVisibleLocalLayerCount(site.id, '.empire-map-australia-local-road'),
          contours: getVisibleLocalLayerCount(site.id, '.empire-map-australia-contour'),
          markers: getVisibleLocalLayerCount(site.id, '.empire-map-australia-detail-marker'),
          zones: getVisibleLocalLayerCount(site.id, '.empire-map-australia-detail-feature--detail-zone'),
          facilities: getVisibleLocalLayerCount(site.id, '.empire-map-australia-detail-feature--detail-facility'),
          connectors: getVisibleLocalLayerCount(site.id, '.empire-map-australia-function-link'),
          clickableFeatures: state.australiaDetailLayer?.querySelectorAll(
            `.is-visible[data-detail-site="${site.id}"][data-map-tooltip-title]:not(.empire-map-australia-local-road):not(.empire-map-australia-contour)`
          ).length || 0,
        },
      ])
    );

    return {
      initialized: state.initialized,
      focusMode: state.focusMode,
      australiaView: state.australiaView,
      selectedLocalFeatureId: state.selectedLocalFeatureId,
      zoom: getCurrentLocalZoom(),
      zoomLabel: formatLocalZoomLabel(getCurrentLocalZoom()),
      detailTitle: detailEl?.querySelector('h2')?.textContent?.trim() || '',
      detailKicker: detailEl?.querySelector('.empire-map-detail-kicker')?.textContent?.trim() || '',
      detailBodyLength: detailEl?.querySelector('.empire-map-detail-body')?.textContent?.trim().length || 0,
      siteLayer: siteLayerStyle
        ? {
            opacity: siteLayerStyle.opacity,
            visibility: siteLayerStyle.visibility,
            pointerEvents: siteLayerStyle.pointerEvents,
          }
        : null,
      siteStates,
      detailSites,
    };
  };

  const getAustraliaViewTransform = (siteId) => {
    if (!siteId || siteId === 'overview' || !state.australiaProjector) {
      return { scale: 1, x: 0, y: 0 };
    }

    const site = getAustraliaSite(siteId);
    if (!site) return { scale: 1, x: 0, y: 0 };
    return {
      scale: site.detailZoom || 1,
      x: 0,
      y: 0,
    };
  };

  const applyAustraliaViewTransform = () => {
    if (!state.australiaContentEl) return;
    const transform = getAustraliaViewTransform(state.australiaView);
    state.australiaContentEl.style.transform =
      `translate(${transform.x.toFixed(2)}px, ${transform.y.toFixed(2)}px) scale(${transform.scale.toFixed(4)})`;
    state.root?.classList.toggle('is-australia-detail', state.australiaView !== 'overview');
    state.root?.classList.toggle('is-local-dragging', state.australiaDrag.active);
    state.australiaFocusEl?.setAttribute('data-australia-view', state.australiaView);
    applyLocalPanTransform();

    updateAustraliaStatusText();
  };

  const coordinateToPath = (coord, index) => {
    const [x, y] = project(coord);
    return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
  };

  const ringToPath = (ring) => `${ring.map(coordinateToPath).join(' ')} Z`;

  const geometryToPath = (geometry, projector = project) => {
    if (!geometry) return '';
    const ringToProjectedPath = (ring) => `${coordinatesToLinePath(ring, projector)} Z`;
    if (geometry.type === 'Polygon') {
      return geometry.coordinates.map(ringToProjectedPath).join(' ');
    }
    if (geometry.type === 'MultiPolygon') {
      return geometry.coordinates
        .map((polygon) => polygon.map(ringToProjectedPath).join(' '))
        .join(' ');
    }
    return '';
  };

  const createSvgEl = (tagName, attrs = {}) => {
    const el = document.createElementNS(SVG_NS, tagName);
    Object.entries(attrs).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        el.setAttribute(key, String(value));
      }
    });
    return el;
  };

  const getStagePointerPosition = (event) => {
    const rect = state.svg?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: ((event.clientX - rect.left) / rect.width) * state.width,
      y: ((event.clientY - rect.top) / rect.height) * state.height,
    };
  };

  const handleLocalPointerDown = (event) => {
    if (state.australiaView === 'overview' || state.focusMode !== 'australia') return;
    if (event.button !== undefined && event.button !== 0) return;
    event.preventDefault();
    const point = getStagePointerPosition(event);
    const pan = getCurrentLocalPan();
    state.australiaDrag = {
      active: true,
      pointerId: event.pointerId,
      startX: point.x,
      startY: point.y,
      startPanX: pan.x,
      startPanY: pan.y,
    };
    state.svg?.setPointerCapture?.(event.pointerId);
    state.root?.classList.add('is-local-dragging');
  };

  const handleLocalPointerMove = (event) => {
    if (!state.australiaDrag.active || state.australiaView === 'overview') return;
    if (state.australiaDrag.pointerId !== null && event.pointerId !== state.australiaDrag.pointerId) return;
    event.preventDefault();
    const point = getStagePointerPosition(event);
    setLocalPan(state.australiaView, {
      x: state.australiaDrag.startPanX + point.x - state.australiaDrag.startX,
      y: state.australiaDrag.startPanY + point.y - state.australiaDrag.startY,
    });
  };

  const endLocalPointerDrag = (event) => {
    if (!state.australiaDrag.active) return;
    if (state.australiaDrag.pointerId !== null && event?.pointerId !== state.australiaDrag.pointerId) return;
    state.svg?.releasePointerCapture?.(state.australiaDrag.pointerId);
    state.australiaDrag.active = false;
    state.australiaDrag.pointerId = null;
    state.root?.classList.remove('is-local-dragging');
  };

  const renderLocalFeatureDetail = (target) => {
    if (!target || state.australiaView === 'overview' || !state.detailEl) return;
    const siteId = target.dataset.detailSite || state.australiaView;
    const site = getAustraliaSite(siteId);
    if (!site) return;

    const featureKind = target.dataset.mapFeatureKind || 'feature';
    const featureLabel = {
      lake: '水体',
      bay: '水体',
      basin: '水体',
      harbour: '水体',
      road: '道路',
      terrain: '真实等高线',
      command: '指挥区',
      intel: '情报区',
      radar: '预警区',
      security: '警戒区',
      archive: '档案区',
      harbor: '港湾区',
      residential: '居民/服务区',
      capital: '核心设施',
      defence: '防务设施',
      district: '城市片区',
      facility: '重点标注',
      system: '系统标注',
    }[featureKind] || '局部要素';
    const title = target.dataset.mapTooltipTitle || site.name;
    const body = target.dataset.mapTooltipBody || site.detail;
    const archiveId = target.dataset.localFeatureKey
      ? `${siteId}-${target.dataset.localFeatureKey}`
      : target.dataset.detailId || site.label;

    state.detailEl.innerHTML = `
      <div class="empire-map-detail-kicker">LOCAL FEATURE / ${escapeHtml(site.label)}</div>
      <h2>${formatInlineMapText(title)}</h2>
      <p class="empire-map-detail-summary">${escapeHtml(featureLabel)} · ${escapeHtml(site.name)}</p>
      <div class="empire-map-detail-body">${formatMapText(body)}</div>
      <div class="empire-map-detail-actions">
        <button class="empire-map-action-button empire-map-action-button--ghost" type="button" data-australia-site="${site.id}">
          返回${escapeHtml(site.name)}总览
        </button>
        <button class="empire-map-action-button" type="button" data-map-action="show-australia">
          返回澳大利亚总览
        </button>
      </div>
      <dl class="empire-map-detail-meta">
        <div><dt>地图层级</dt><dd>${escapeHtml(featureLabel)}</dd></div>
        <div><dt>所属城市</dt><dd>${escapeHtml(site.name)}</dd></div>
        <div><dt>档案标记</dt><dd>${escapeHtml(archiveId)}</dd></div>
      </dl>
    `;
  };

  const setSelectedLocalFeature = (target) => {
    const selectedId = target?.dataset?.detailId || '';
    const selectedKey = getLocalSelectionKey(target);
    state.selectedLocalFeatureId = selectedId;
    state.australiaDetailLayer?.querySelectorAll('.is-local-selected, .is-local-related').forEach((node) => {
      node.classList.remove('is-local-selected');
      node.classList.remove('is-local-related');
    });
    if (!selectedId || !state.australiaView || state.australiaView === 'overview') return;
    state.australiaDetailLayer
      ?.querySelectorAll(`[data-detail-site="${state.australiaView}"][data-detail-id], [data-detail-site="${state.australiaView}"][data-local-feature-key]`)
      .forEach((node) => {
        if (node.dataset.detailId === selectedId || (selectedKey && node.dataset.localFeatureKey === selectedKey)) {
          node.classList.add('is-local-selected');
        }
      });

    if (!selectedKey) return;
    state.australiaDetailLayer
      ?.querySelectorAll(`[data-detail-site="${state.australiaView}"][data-link-from][data-link-to]`)
      .forEach((node) => {
        if (node.dataset.linkFrom === selectedKey || node.dataset.linkTo === selectedKey) {
          node.classList.add('is-local-related');
        }
      });
  };

  const getLocalSelectionKey = (target) => {
    if (!target?.dataset) return '';
    if (target.dataset.localFeatureKey) return target.dataset.localFeatureKey;
    const detailId = target.dataset.detailId || '';
    const withoutMarker = detailId.endsWith('-marker') ? detailId.slice(0, -7) : detailId;
    const sitePrefix = `${target.dataset.detailSite || state.australiaView}-`;
    return withoutMarker.startsWith(sitePrefix) ? withoutMarker.slice(sitePrefix.length) : withoutMarker;
  };

  const SUPPORT_LOCAL_FEATURE_KINDS = new Set(['road', 'terrain']);

  const getLocalFeaturePriority = (target) => {
    if (!target || target.dataset.detailSite !== state.australiaView) return -1;
    if (!target.dataset.mapTooltipTitle && !target.dataset.mapTooltipBody) return -1;
    if (SUPPORT_LOCAL_FEATURE_KINDS.has(target.dataset.mapFeatureKind)) return -1;

    const classes = target.classList;
    if (classes.contains('empire-map-australia-detail-marker')) return 90;
    if (classes.contains('empire-map-australia-detail-label')) return 80;
    if (classes.contains('empire-map-australia-detail-feature--detail-facility')) return 72;
    if (classes.contains('empire-map-australia-detail-feature--detail-water')) return 68;
    if (classes.contains('empire-map-australia-detail-feature--detail-arc')) return 62;
    if (classes.contains('empire-map-australia-detail-feature--detail-zone')) return 52;
    return 40;
  };

  const getLocalFeatureSpecificity = (target) => {
    const rect = target?.getBoundingClientRect?.();
    if (!rect) return 0;
    const area = Math.max(rect.width * rect.height, 1);
    return 1 / area;
  };

  const getLocalFeatureTargetFromEvent = (event) => {
    if (state.australiaView === 'overview') return null;
    const selector = '[data-detail-site][data-map-tooltip-title], [data-detail-site][data-map-tooltip-body]';
    const candidates = [];
    const seen = new Set();

    if (Number.isFinite(event.clientX) && Number.isFinite(event.clientY) && document.elementsFromPoint) {
      document.elementsFromPoint(event.clientX, event.clientY).forEach((node) => {
        const target = node?.closest?.(selector);
        if (!target || seen.has(target)) return;
        seen.add(target);
        candidates.push(target);
      });
    }

    const directTarget = event.target?.closest?.(selector);
    if (directTarget && !seen.has(directTarget)) {
      candidates.push(directTarget);
    }

    return candidates
      .map((target, index) => ({
        target,
        priority: getLocalFeaturePriority(target),
        specificity: getLocalFeatureSpecificity(target),
        index,
      }))
      .filter((entry) => entry.priority >= 0)
      .sort((a, b) => b.priority - a.priority || b.specificity - a.specificity || a.index - b.index)[0]?.target || null;
  };

  const handleLocalFeatureClick = (event) => {
    if (state.australiaView === 'overview') return;
    if (event.target?.closest?.('.empire-map-australia-site')) return;
    const target = getLocalFeatureTargetFromEvent(event);
    if (!target) return;
    event.stopPropagation();
    setSelectedLocalFeature(target);
    renderLocalFeatureDetail(target);
  };

  const setLocalTooltip = (title, body) => {
    const card = state.australiaUiLayer?.querySelector('.empire-map-local-tooltip-card');
    if (!card) return;
    card.classList.toggle('is-active', Boolean(title || body));
    card.innerHTML = `
      <strong>${formatInlineMapText(title || '局部地图')}</strong>
      <span>${formatInlineMapText(body || '悬停标志或线路查看说明，拖动地图浏览区域。')}</span>
    `;
  };

  const handleLocalTooltipMove = (event) => {
    if (state.australiaView === 'overview') return;
    const target = getLocalFeatureTargetFromEvent(event);
    if (!target) {
      clearLocalTooltip();
      return;
    }
    setLocalTooltip(target.dataset.mapTooltipTitle, target.dataset.mapTooltipBody);
  };

  const clearLocalTooltip = () => {
    setLocalTooltip('', '');
  };

  const handleLocalWheel = (event) => {
    if (state.australiaView === 'overview' || state.focusMode !== 'australia') return;
    event.preventDefault();
    const point = getStagePointerPosition(event);
    zoomLocalMapBy(event.deltaY < 0 ? 1.14 : 0.88, point);
  };

  const getRegionByIso = (iso) =>
    Object.entries(REGION_DEFINITIONS).find(([, region]) =>
      Array.isArray(region.isos) && region.isos.includes(iso)
    );

  const renderShell = () => {
    state.root.innerHTML = `
      <div class="empire-map-frame">
        <section class="empire-map-panel empire-map-panel--control">
          <div class="empire-map-kicker">IMPERIAL TERRITORIAL ARCHIVE</div>
          <h1>疆域态势地图</h1>
          <div class="empire-map-stage-meta">
            <span class="empire-map-year"></span>
            <strong class="empire-map-stage-title"></strong>
            <p class="empire-map-stage-subtitle"></p>
          </div>
          <div class="empire-map-stage-list"></div>
          <div class="empire-map-range-wrap">
            <input class="empire-map-range" type="range" min="0" max="${STAGES.length - 1}" value="0" step="1" aria-label="切换帝国疆域时期">
            <div class="empire-map-range-labels">
              <span>帝国成立</span>
              <span>大生产运动</span>
            </div>
          </div>
          <div class="empire-map-note"></div>
        </section>
        <section class="empire-map-stage" aria-label="人类帝国疆域地图">
          <div class="empire-map-scanline"></div>
          <svg class="empire-map-svg" viewBox="0 0 ${state.width} ${state.height}" role="img" aria-label="基于真实地球地理数据的人类帝国疆域地图">
            <defs>
              <filter id="empire-map-glow" x="-45%" y="-45%" width="190%" height="190%">
                <feGaussianBlur stdDeviation="3" result="coloredBlur"></feGaussianBlur>
                <feMerge>
                  <feMergeNode in="coloredBlur"></feMergeNode>
                  <feMergeNode in="SourceGraphic"></feMergeNode>
                </feMerge>
              </filter>
            </defs>
            <g class="empire-map-main-viewport">
              <g class="empire-map-graticule"></g>
              <g class="empire-map-world"></g>
              <g class="empire-map-routes"></g>
              <g class="empire-map-territories"></g>
              <g class="empire-map-points"></g>
            </g>
            <g class="empire-map-australia-focus" aria-hidden="true">
              <rect class="empire-map-australia-water" x="0" y="0" width="${state.width}" height="${state.height}"></rect>
              <g class="empire-map-australia-content">
                <g class="empire-map-australia-land"></g>
                <g class="empire-map-australia-terrain"></g>
                <g class="empire-map-australia-inland-water"></g>
                <g class="empire-map-australia-admin"></g>
                <g class="empire-map-australia-routes"></g>
                <g class="empire-map-australia-local-pan">
                  <g class="empire-map-australia-local-backdrop"></g>
                  <g class="empire-map-australia-detail"></g>
                </g>
                <g class="empire-map-australia-place-labels"></g>
                <g class="empire-map-australia-sites"></g>
              </g>
              <g class="empire-map-australia-ui"></g>
            </g>
          </svg>
        </section>
        <aside class="empire-map-panel empire-map-panel--detail">
          <div class="empire-map-detail"></div>
        </aside>
      </div>
    `;

    state.svg = state.root.querySelector('.empire-map-svg');
    state.mainViewport = state.root.querySelector('.empire-map-main-viewport');
    state.mapLayer = state.root.querySelector('.empire-map-world');
    state.territoryLayer = state.root.querySelector('.empire-map-territories');
    state.pointLayer = state.root.querySelector('.empire-map-points');
    state.routeLayer = state.root.querySelector('.empire-map-routes');
    state.australiaFocusEl = state.root.querySelector('.empire-map-australia-focus');
    state.australiaContentEl = state.root.querySelector('.empire-map-australia-content');
    state.australiaLayer = state.root.querySelector('.empire-map-australia-land');
    state.australiaTerrainLayer = state.root.querySelector('.empire-map-australia-terrain');
    state.australiaInlandWaterLayer = state.root.querySelector('.empire-map-australia-inland-water');
    state.australiaAdminLayer = state.root.querySelector('.empire-map-australia-admin');
    state.australiaRouteLayer = state.root.querySelector('.empire-map-australia-routes');
    state.australiaLocalPanLayer = state.root.querySelector('.empire-map-australia-local-pan');
    state.australiaLocalBackdropLayer = state.root.querySelector('.empire-map-australia-local-backdrop');
    state.australiaDetailLayer = state.root.querySelector('.empire-map-australia-detail');
    state.australiaPlaceLayer = state.root.querySelector('.empire-map-australia-place-labels');
    state.australiaSiteLayer = state.root.querySelector('.empire-map-australia-sites');
    state.australiaUiLayer = state.root.querySelector('.empire-map-australia-ui');
    state.detailEl = state.root.querySelector('.empire-map-detail');
    state.stageListEl = state.root.querySelector('.empire-map-stage-list');
    state.rangeEl = state.root.querySelector('.empire-map-range');

    state.svg.addEventListener('pointerdown', handleLocalPointerDown);
    state.svg.addEventListener('pointermove', handleLocalPointerMove);
    state.svg.addEventListener('pointerup', endLocalPointerDrag);
    state.svg.addEventListener('pointercancel', endLocalPointerDrag);
    state.svg.addEventListener('pointerleave', endLocalPointerDrag);
    state.svg.addEventListener('click', handleLocalFeatureClick);
    state.svg.addEventListener('mousemove', handleLocalTooltipMove);
    state.svg.addEventListener('mouseleave', clearLocalTooltip);
    state.svg.addEventListener('wheel', handleLocalWheel, { passive: false });

    state.australiaUiLayer.addEventListener('click', (event) => {
      const actionButton = event.target.closest('[data-map-action]');
      if (!actionButton || actionButton.classList.contains('is-disabled')) return;
      const action = actionButton.dataset.mapAction;
      if (action === 'zoom-local-in') {
        zoomLocalMapBy(1.22, { x: state.width / 2, y: state.height / 2 });
      } else if (action === 'zoom-local-out') {
        zoomLocalMapBy(0.82, { x: state.width / 2, y: state.height / 2 });
      } else if (action === 'reset-local-map' && state.australiaView !== 'overview') {
        state.australiaLocalPan[state.australiaView] = { x: 0, y: 0 };
        state.australiaLocalZoom[state.australiaView] = 1;
        applyLocalPanTransform();
        updateLocalZoomUi();
      }
    });

    state.stageListEl.innerHTML = STAGES.map(
      (stage, index) => `
        <button class="empire-map-stage-button" type="button" data-stage-index="${index}">
          <span>${stage.year}</span>
          <strong>${stage.title}</strong>
        </button>
      `
    ).join('');

    state.stageListEl.addEventListener('click', (event) => {
      const button = event.target.closest('.empire-map-stage-button');
      if (!button) return;
      setStage(Number(button.dataset.stageIndex));
    });

    state.rangeEl.addEventListener('input', () => {
      setStage(Number(state.rangeEl.value));
    });

    state.detailEl.addEventListener('click', (event) => {
      const actionButton = event.target.closest('[data-map-action]');
      if (actionButton) {
        const action = actionButton.dataset.mapAction;
        if (action === 'focus-australia') {
          if (state.focusMode === 'australia') {
            setAustraliaView('overview');
          }
          setFocusMode('australia');
          return;
        }
        if (action === 'exit-focus') {
          setFocusMode('world');
          selectRegion(state.selectedRegionId || 'australia');
          return;
        }
        if (action === 'show-australia') {
          setAustraliaView('overview');
          selectRegion('australia');
          return;
        }
      }

      const siteButton = event.target.closest('[data-australia-site]');
      if (siteButton) {
        selectAustraliaSite(siteButton.dataset.australiaSite);
      }
    });
  };

  const renderGraticule = () => {
    const layer = state.root.querySelector('.empire-map-graticule');
    if (!layer) return;
    layer.innerHTML = '';

    for (let lng = -180; lng <= 180; lng += 30) {
      const points = [];
      for (let lat = -75; lat <= 75; lat += 5) {
        points.push(project([lng, lat]));
      }
      layer.appendChild(
        createSvgEl('path', {
          class: 'empire-map-grid-line',
          d: points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`).join(' '),
        })
      );
    }

    for (let lat = -60; lat <= 60; lat += 20) {
      const points = [];
      for (let lng = -180; lng <= 180; lng += 5) {
        points.push(project([lng, lat]));
      }
      layer.appendChild(
        createSvgEl('path', {
          class: 'empire-map-grid-line',
          d: points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`).join(' '),
        })
      );
    }
  };

  const renderWorld = () => {
    state.mapLayer.innerHTML = '';
    state.territoryLayer.innerHTML = '';
    state.pointLayer.innerHTML = '';
    state.featureElements.clear();
    state.regionElements.clear();
    state.pointElements.clear();

    state.worldFeatures.forEach((feature) => {
      const pathData = geometryToPath(feature.geometry);
      if (!pathData) return;

      const iso = getFeatureIso(feature);
      const [regionId, region] = getRegionByIso(iso) || [];
      const countryPath = createSvgEl('path', {
        class: 'empire-map-country',
        d: pathData,
        'data-iso': iso,
      });
      state.mapLayer.appendChild(countryPath);
      state.featureElements.set(iso, countryPath);

      if (regionId && region) {
        const overlay = createSvgEl('path', {
          class: 'empire-map-territory',
          d: pathData,
          'data-region-id': regionId,
          'data-region-name': region.name,
          tabindex: '0',
          role: 'button',
          'aria-label': region.name,
        });
        overlay.style.setProperty('--region-accent', region.accent);
        overlay.addEventListener('click', () => selectRegion(regionId));
        overlay.addEventListener('keydown', (event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          selectRegion(regionId);
        });
        state.territoryLayer.appendChild(overlay);

        if (!state.regionElements.has(regionId)) {
          state.regionElements.set(regionId, []);
        }
        state.regionElements.get(regionId).push(overlay);
      }
    });

    Object.entries(REGION_DEFINITIONS).forEach(([regionId, region]) => {
      if (!region.pointOnly && region.isos.length) return;
      const [x, y] = project(region.coordinates);
      const node = createSvgEl('g', {
        class: 'empire-map-point',
        'data-region-id': regionId,
        tabindex: '0',
        role: 'button',
        'aria-label': region.name,
      });
      node.style.setProperty('--region-accent', region.accent);
      node.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)})`);
      node.innerHTML = `
        <circle class="empire-map-point-pulse" r="16"></circle>
        <circle class="empire-map-point-core" r="4.8"></circle>
        <text x="10" y="-9">${region.label}</text>
      `;
      node.addEventListener('click', () => selectRegion(regionId));
      node.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        selectRegion(regionId);
      });
      state.pointLayer.appendChild(node);
      state.pointElements.set(regionId, node);
    });

    renderRoutes();
  };

  const renderRoutes = () => {
    state.routeLayer.innerHTML = '';
    const routes = [
      ['australia', 'newZealand'],
      ['australia', 'southAmerica'],
      ['australia', 'southeastAsia'],
      ['southeastAsia', 'dalian'],
      ['australia', 'europeContact'],
    ];

    routes.forEach(([fromId, toId]) => {
      const from = REGION_DEFINITIONS[fromId];
      const to = REGION_DEFINITIONS[toId];
      if (!from || !to) return;
      const [x1, y1] = project(from.coordinates);
      const [x2, y2] = project(to.coordinates);
      const midX = (x1 + x2) / 2;
      const midY = Math.min(y1, y2) - Math.min(90, Math.abs(x2 - x1) * 0.15);
      const path = createSvgEl('path', {
        class: 'empire-map-route',
        d: `M${x1.toFixed(2)},${y1.toFixed(2)} Q${midX.toFixed(2)},${midY.toFixed(2)} ${x2.toFixed(2)},${y2.toFixed(2)}`,
        'data-route': `${fromId}-${toId}`,
      });
      state.routeLayer.appendChild(path);
    });
  };

  const selectAustraliaSite = (siteId) => {
    const site = getAustraliaSite(siteId);
    if (!site) return;
    const siteText = resolveLocalSiteText(site);
    setAustraliaView(siteId);

    state.australiaSiteLayer?.querySelectorAll('.empire-map-australia-site').forEach((node) => {
      node.classList.toggle('is-selected', node.dataset.siteId === siteId);
    });

    state.detailEl.innerHTML = `
      <div class="empire-map-detail-kicker">AUSTRALIA FOCUS / ${escapeHtml(site.label)}</div>
      <h2>${formatInlineMapText(siteText.title)}</h2>
      <p class="empire-map-detail-summary">${formatInlineMapText(siteText.summary)}</p>
      <div class="empire-map-detail-body">${formatMapText(siteText.body)}</div>
      <div class="empire-map-detail-actions">
        <button class="empire-map-action-button empire-map-action-button--ghost" type="button" data-map-action="show-australia">
          返回澳大利亚总览
        </button>
        <button class="empire-map-action-button" type="button" data-map-action="exit-focus">
          返回全球疆域
        </button>
      </div>
      <div class="empire-map-local-legend">
        <div><span class="legend-swatch legend-swatch--contour"></span><strong>灰色细线</strong><em>真实 DEM 等高线</em></div>
        <div><span class="legend-swatch legend-swatch--imperial"></span><strong>金色主线</strong><em>帝国专用通道</em></div>
        <div><span class="legend-swatch legend-swatch--restricted"></span><strong>金色虚线</strong><em>限制/安保线路</em></div>
        <div><span class="legend-swatch legend-swatch--facility"></span><strong>金色区块</strong><em>核心机构设施</em></div>
        <div><span class="legend-swatch legend-swatch--marker"></span><strong>机构节点</strong><em>简洁战略标记，悬停查看说明</em></div>
        <div><span class="legend-swatch legend-swatch--function"></span><strong>功能联络线</strong><em>机构之间的指挥/调度/审查关系</em></div>
        <div><span class="legend-swatch legend-swatch--plus"></span><strong>区域 + 标记</strong><em>管制区或功能区内部范围</em></div>
        <div><span class="legend-swatch legend-swatch--structure"></span><strong>内部结构线</strong><em>闸门、档案、港湾等设施分区</em></div>
        <div><span class="legend-swatch legend-swatch--cordon"></span><strong>虚线警戒线</strong><em>警戒或管制范围</em></div>
      </div>
      <dl class="empire-map-detail-meta">
        <div><dt>机构职能</dt><dd>${escapeHtml(site.role)}</dd></div>
        <div><dt>坐标</dt><dd>${site.coordinates[1].toFixed(2)}, ${site.coordinates[0].toFixed(2)}</dd></div>
        <div><dt>档案标记</dt><dd>${escapeHtml(site.label)}</dd></div>
      </dl>
    `;
  };

  const setAustraliaView = (viewId = 'overview') => {
    const nextView = viewId === 'overview' || getAustraliaSite(viewId) ? viewId : 'overview';
    state.australiaDrag.active = false;
    state.australiaDrag.pointerId = null;
    state.australiaView = nextView;
    state.selectedLocalFeatureId = '';
    applyAustraliaViewTransform();

    state.australiaDetailLayer?.querySelectorAll('[data-detail-site]').forEach((node) => {
      node.classList.toggle('is-visible', nextView !== 'overview' && node.dataset.detailSite === nextView);
    });

    state.australiaLocalBackdropLayer?.querySelectorAll('[data-detail-site]').forEach((node) => {
      node.classList.toggle('is-visible', nextView !== 'overview' && node.dataset.detailSite === nextView);
    });

    state.australiaSiteLayer?.querySelectorAll('.empire-map-australia-site').forEach((node) => {
      const isSelected = nextView !== 'overview' && node.dataset.siteId === nextView;
      node.classList.toggle('is-selected', isSelected);
      node.classList.toggle('is-muted', nextView !== 'overview' && !isSelected);
      node.setAttribute('aria-hidden', nextView === 'overview' ? 'false' : 'true');
      node.tabIndex = nextView === 'overview' ? 0 : -1;
    });

    updateAustraliaSiteScreenScale();
    updateLocalZoomUi();
    setSelectedLocalFeature(null);
    clearLocalTooltip();
  };

  const renderAustraliaFocus = () => {
    if (!state.australiaFocusEl || !state.australiaLayer) return;

    const palette = state.mapboxPalette || {
      land: 'hsl(0, 0%, 100%)',
      water: 'hsl(0, 0%, 89%)',
      road: 'hsl(211, 0%, 0%)',
      boundary: 'hsl(212, 2%, 89%)',
      label: 'hsl(216, 34%, 72%)',
    };
    const projector = getAustraliaProjection();
    const water = state.australiaFocusEl.querySelector('.empire-map-australia-water');
    const terrainLayer = state.australiaFocusEl.querySelector('.empire-map-australia-terrain');
    const inlandWaterLayer = state.australiaFocusEl.querySelector('.empire-map-australia-inland-water');
    const adminLayer = state.australiaFocusEl.querySelector('.empire-map-australia-admin');
    const placeLabelLayer = state.australiaFocusEl.querySelector('.empire-map-australia-place-labels');
    const australiaPath = state.australiaFeature
      ? geometryToPath(state.australiaFeature.geometry, projector)
      : '';

    state.root.style.setProperty('--mapbox-style-land', palette.land);
    state.root.style.setProperty('--mapbox-style-water', palette.water);
    state.root.style.setProperty('--mapbox-style-road', palette.road);
    state.root.style.setProperty('--mapbox-style-boundary', palette.boundary);
    state.root.style.setProperty('--mapbox-style-label', palette.label);

    if (water) {
      water.setAttribute('width', String(state.width));
      water.setAttribute('height', String(state.height));
    }

    if (state.australiaUiLayer) {
      state.australiaUiLayer.innerHTML = `
        <g class="empire-map-australia-status" transform="translate(18 24)">
          <rect width="184" height="30" rx="5"></rect>
          <text x="12" y="20">AUSTRALIA / NATIONAL</text>
        </g>
        <foreignObject class="empire-map-australia-zoom-ui" x="${state.width - 146}" y="22" width="124" height="42">
          <div xmlns="http://www.w3.org/1999/xhtml" class="empire-map-local-zoom-controls">
            <button type="button" data-map-action="zoom-local-out" aria-label="缩小局部地图">-</button>
            <span class="empire-map-australia-zoom-readout">100%</span>
            <button type="button" data-map-action="zoom-local-in" aria-label="放大局部地图">+</button>
          </div>
        </foreignObject>
        <foreignObject class="empire-map-australia-reset-ui" x="${state.width - 146}" y="70" width="124" height="34">
          <button xmlns="http://www.w3.org/1999/xhtml" class="empire-map-local-reset" type="button" data-map-action="reset-local-map">复位</button>
        </foreignObject>
        <foreignObject class="empire-map-local-tooltip" x="22" y="${state.height - 104}" width="330" height="82">
          <div xmlns="http://www.w3.org/1999/xhtml" class="empire-map-local-tooltip-card">
            <strong>局部地图</strong>
            <span>悬停标志或线路查看说明，拖动地图浏览区域。</span>
          </div>
        </foreignObject>
      `;
    }

    if (terrainLayer) {
      terrainLayer.innerHTML = '';
      AUSTRALIA_TERRAIN_AREAS.forEach((area) => {
        terrainLayer.appendChild(
          createSvgEl('path', {
            class: 'empire-map-australia-terrain-area',
            d: coordinatesToPolygonPath(area.coordinates, projector),
            'data-terrain-id': area.id,
          })
        );
      });
    }

    if (inlandWaterLayer) {
      inlandWaterLayer.innerHTML = '';
      AUSTRALIA_INLAND_WATERS.forEach((area) => {
        inlandWaterLayer.appendChild(
          createSvgEl('path', {
            class: 'empire-map-australia-lake',
            d: coordinatesToPolygonPath(area.coordinates, projector),
            'data-water-id': area.id,
          })
        );
      });
    }

    if (adminLayer) {
      adminLayer.innerHTML = '';
      AUSTRALIA_ADMIN_LINES.forEach((line) => {
        adminLayer.appendChild(
          createSvgEl('path', {
            class: 'empire-map-australia-admin-line',
            d: coordinatesToLinePath(line, projector),
          })
        );
      });
    }

    state.australiaLayer.innerHTML = '';
    if (australiaPath) {
      state.australiaLayer.appendChild(
        createSvgEl('path', {
          class: 'empire-map-australia-shape',
          d: australiaPath,
        })
      );
    }

    state.australiaRouteLayer.innerHTML = '';
    AUSTRALIA_ROADS.forEach((route) => {
      state.australiaRouteLayer.appendChild(
        createSvgEl('path', {
          class: `empire-map-australia-road empire-map-australia-road--${route.className}`,
          d: coordinatesToLinePath(route.coordinates, projector),
          'data-route-id': route.id,
        })
      );
    });

    if (placeLabelLayer) {
      placeLabelLayer.innerHTML = '';
      AUSTRALIA_PLACE_LABELS.forEach((place) => {
        const [x, y] = projector(place.coordinates);
        const label = createSvgEl('text', {
          class: `empire-map-australia-place empire-map-australia-place--${place.rank}`,
          x: x.toFixed(2),
          y: y.toFixed(2),
          'data-place-id': place.id,
        });
        label.textContent = place.name;
        placeLabelLayer.appendChild(label);
      });
    }

    if (state.australiaDetailLayer) {
      state.australiaDetailLayer.innerHTML = '';
      renderLocalBackdrop();

      Object.entries(AUSTRALIA_LOCAL_DETAIL_AREAS).forEach(([siteId, area]) => {
        const localProjector = getLocalDetailProjection(siteId);
        state.australiaLocalProjectors.set(siteId, localProjector);

        renderLocalContours(siteId, localProjector);

        (area.waterBodies || []).forEach((waterBody) => {
          const waterText = resolveLocalFeatureText(
            siteId,
            waterBody.id,
            waterBody.name || waterBody.id.replace(/-/g, ' '),
            waterBody.description || localFeatureDescription(waterBody.type)
          );
          state.australiaDetailLayer.appendChild(
            createSvgEl('path', {
              class: `empire-map-australia-detail-feature empire-map-australia-detail-feature--detail-water empire-map-australia-detail-feature--detail-water-${waterBody.type || 'default'}`,
              d: coordinatesToPolygonPath(waterBody.coordinates, localProjector),
              'data-detail-site': siteId,
              'data-detail-id': `${siteId}-${waterBody.id}`,
              'data-map-feature-kind': waterBody.type || 'water',
              'data-map-tooltip-title': waterText.title,
              'data-map-tooltip-body': waterText.body,
            })
          );
        });

        (area.zones || []).forEach((zone) => {
          const zoneText = resolveLocalFeatureText(
            siteId,
            zone.id,
            zone.name || zone.id.replace(/-/g, ' '),
            zone.description || localFeatureDescription(zone.type)
          );
          state.australiaDetailLayer.appendChild(
            createSvgEl('path', {
              class: `empire-map-australia-detail-feature empire-map-australia-detail-feature--detail-zone empire-map-australia-detail-feature--detail-zone-${zone.type || 'default'}`,
              d: coordinatesToPolygonPath(zone.coordinates, localProjector),
              'data-detail-site': siteId,
              'data-detail-id': `${siteId}-${zone.id}`,
              'data-local-feature-key': zone.id,
              'data-map-feature-kind': zone.type || 'zone',
              'data-map-tooltip-title': zoneText.title,
              'data-map-tooltip-body': zoneText.body,
            })
          );
          renderAreaPlusFill(siteId, zone, localProjector);
          renderInternalStructure(siteId, zone, localProjector, 'zone');
        });

        renderLocalRoads(siteId, area, localProjector);

        (area.facilities || []).forEach((facility) => {
          const facilityCentroid = getPolygonCentroid(facility.coordinates);
          const facilityText = resolveLocalFeatureText(
            siteId,
            facility.id,
            facility.name || facility.id.replace(/-/g, ' '),
            facility.description || localFeatureDescription(facility.type)
          );
          state.australiaDetailLayer.appendChild(
            createSvgEl('path', {
              class: `empire-map-australia-detail-feature empire-map-australia-detail-feature--detail-facility empire-map-australia-detail-feature--detail-facility-${facility.type || 'default'}`,
              d: coordinatesToPolygonPath(facility.coordinates, localProjector),
              'data-detail-site': siteId,
              'data-detail-id': `${siteId}-${facility.id}`,
              'data-local-feature-key': facility.id,
              'data-map-feature-kind': facility.type || 'facility',
              'data-map-tooltip-title': facilityText.title,
              'data-map-tooltip-body': facilityText.body,
            })
          );
          renderInternalStructure(siteId, facility, localProjector, 'facility');
        });
        renderFacilityConnectors(siteId, area.facilities || [], localProjector);

        (area.facilities || []).forEach((facility) => {
          const facilityCentroid = getPolygonCentroid(facility.coordinates);
          if (!facilityCentroid) return;
          const facilityText = resolveLocalFeatureText(
            siteId,
            facility.id,
            facility.name || facility.id.replace(/-/g, ' '),
            facility.description || localFeatureDescription(facility.type)
          );
          const [markerX, markerY] = localProjector(facilityCentroid);
          const markerScale = getFacilityMarkerScale(facility, localProjector);
          const marker = createSvgEl('g', {
            class: `empire-map-australia-detail-marker empire-map-australia-detail-marker--${facility.type || 'default'}`,
            'data-detail-site': siteId,
            'data-detail-id': `${siteId}-${facility.id}-marker`,
            'data-local-feature-key': facility.id,
            'data-marker-scale': markerScale.toFixed(3),
            'data-map-feature-kind': facility.type || 'facility',
            'data-map-tooltip-title': facilityText.title,
            'data-map-tooltip-body': facilityText.body,
          });
          const baseTransform = `translate(${markerX.toFixed(2)} ${markerY.toFixed(2)}) scale(${markerScale.toFixed(3)})`;
          marker.dataset.baseTransform = baseTransform;
          marker.dataset.centerX = markerX.toFixed(2);
          marker.dataset.centerY = markerY.toFixed(2);
          marker.setAttribute('transform', baseTransform);
          marker.innerHTML = getFacilityTacticalSymbolMarkup(facility.type);
          state.australiaDetailLayer.appendChild(marker);
        });

        (area.arcs || []).forEach((arc) => {
          const arcText = resolveLocalFeatureText(
            siteId,
            arc.id,
            arc.name || arc.id.replace(/-/g, ' '),
            arc.description || localFeatureDescription(arc.type, '警戒或监控覆盖范围。')
          );
          state.australiaDetailLayer.appendChild(
            createSvgEl('path', {
              class: `empire-map-australia-detail-feature empire-map-australia-detail-feature--detail-arc empire-map-australia-detail-feature--detail-arc-${arc.type || 'default'}`,
              d: coordinatesToLinePath(buildDetailArcCoordinates(area, arc), localProjector),
              'data-detail-site': siteId,
              'data-detail-id': `${siteId}-${arc.id}`,
              'data-map-feature-kind': arc.type || 'system',
              'data-map-tooltip-title': arcText.title,
              'data-map-tooltip-body': arcText.body,
            })
          );
        });

        (area.securityRings || []).forEach((ring) => {
          const [x, y] = localProjector(ring.coordinates);
          const [ringX] = localProjector([ring.coordinates[0] + ring.radius, ring.coordinates[1]]);
          state.australiaDetailLayer.appendChild(
            createSvgEl('circle', {
              class: `empire-map-australia-detail-ring empire-map-australia-detail-ring--${ring.id}`,
              cx: x.toFixed(2),
              cy: y.toFixed(2),
              r: Math.abs(ringX - x).toFixed(2),
            'data-detail-site': siteId,
            'data-map-feature-kind': 'security',
            'data-map-tooltip-title': `${ring.id.toUpperCase()} CORDON`,
            'data-map-tooltip-body': '同心警戒圈，表示设施周边的分级管制范围。',
          })
          );
        });

        area.districts.forEach((district) => {
          const [x, y] = localProjector(district.coordinates);
          const districtText = resolveLocalFeatureText(
            siteId,
            district.id || district.name,
            district.name,
            district.description || '城市片区标签，用于辅助定位局部地图。',
            [district.name]
          );
          const label = createSvgEl('text', {
            class: 'empire-map-australia-detail-label empire-map-australia-detail-label--district',
            x: x.toFixed(2),
            y: y.toFixed(2),
            'data-detail-site': siteId,
            'data-detail-id': `${siteId}-${district.id || district.name}`,
            'data-map-tooltip-title': districtText.title,
            'data-map-feature-kind': 'district',
            'data-map-tooltip-body': districtText.body,
          });
          label.textContent = district.name;
          state.australiaDetailLayer.appendChild(label);
        });

        (area.labels || []).filter((labelItem) => labelItem.kind !== 'facility').forEach((labelItem) => {
          const [x, y] = localProjector(labelItem.coordinates);
          const labelText = resolveLocalFeatureText(
            siteId,
            labelItem.id || labelItem.name,
            labelItem.name,
            labelItem.description || localFeatureDescription(labelItem.kind, '重点标注，表示帝国档案中的地理或机构节点。'),
            [labelItem.name]
          );
          const label = createSvgEl('text', {
            class: `empire-map-australia-detail-label empire-map-australia-detail-label--${labelItem.kind || 'system'}`,
            x: x.toFixed(2),
            y: y.toFixed(2),
            'data-detail-site': siteId,
            'data-detail-id': `${siteId}-${labelItem.id || labelItem.name}`,
            'data-map-tooltip-title': labelText.title,
            'data-map-feature-kind': labelItem.kind || 'system',
            'data-map-tooltip-body': labelText.body,
          });
          label.textContent = labelItem.name;
          state.australiaDetailLayer.appendChild(label);
        });
      });

    }

    state.australiaSiteLayer.innerHTML = '';
    const siteRenderOrder = [
      ...AUSTRALIA_FOCUS_SITES.filter((site) => site.id !== 'canberra'),
      AUSTRALIA_FOCUS_SITES.find((site) => site.id === 'canberra'),
    ].filter(Boolean);

    siteRenderOrder.forEach((site) => {
      const [x, y] = projector(site.coordinates);
      const [labelX, labelY] = site.labelOffset;
      const node = createSvgEl('g', {
        class: 'empire-map-australia-site',
        'data-site-id': site.id,
        tabindex: '0',
        role: 'button',
        'aria-label': `${site.name}：${site.title}`,
      });
      node.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)})`);
      node.innerHTML = `
        <circle class="empire-map-australia-site-hit" r="15"></circle>
        <circle class="empire-map-australia-site-core" r="4.4"></circle>
        <line class="empire-map-australia-site-leader" x1="0" y1="0" x2="${labelX}" y2="${labelY}"></line>
        <text class="empire-map-australia-site-label" x="${labelX}" y="${labelY + 4}">${site.name}</text>
      `;
      node.addEventListener('click', (event) => {
        event.stopPropagation();
        selectAustraliaSite(site.id);
      });
      node.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        selectAustraliaSite(site.id);
      });
      state.australiaSiteLayer.appendChild(node);
    });

    state.australiaProjector = projector;
    setAustraliaView(state.australiaView || 'overview');
    updateAustraliaSiteScreenScale();
  };

  const setFocusMode = (mode) => {
    const nextMode = mode === 'australia' ? 'australia' : 'world';
    state.focusMode = nextMode;
    state.root?.classList.toggle('is-australia-focused', nextMode === 'australia');
    if (state.australiaFocusEl) {
      state.australiaFocusEl.setAttribute('aria-hidden', nextMode === 'australia' ? 'false' : 'true');
    }
    if (nextMode === 'australia') {
      setAustraliaView('overview');
      selectRegion('australia');
    } else {
      setAustraliaView('overview');
    }
  };

  const setElementStrength = (el, strength, contestedStrength = 0) => {
    const safeStrength = clamp(strength || 0, 0, 1);
    const safeContested = clamp(contestedStrength || 0, 0, 1);
    el.style.opacity = String(Math.max(safeStrength, safeContested * 0.52));
    el.style.setProperty('--territory-strength', safeStrength.toFixed(3));
    el.classList.toggle('is-active', safeStrength > 0.05);
    el.classList.toggle('is-contested', safeStrength <= 0.05 && safeContested > 0.05);
  };

  const applyTerritory = (territory, contested = {}) => {
    Object.entries(REGION_DEFINITIONS).forEach(([regionId]) => {
      const strength = Number(territory[regionId] || 0);
      const contestedStrength = Number(contested[regionId] || 0);
      const overlays = state.regionElements.get(regionId) || [];
      overlays.forEach((overlay) => setElementStrength(overlay, strength, contestedStrength));

      const point = state.pointElements.get(regionId);
      if (point) {
        setElementStrength(point, strength, contestedStrength);
      }
    });

    state.routeLayer.querySelectorAll('.empire-map-route').forEach((route) => {
      const [fromId, toId] = String(route.dataset.route || '').split('-');
      const routeStrength = Math.min(
        Number(territory[fromId] || 0),
        Number(territory[toId] || 0)
      );
      route.style.opacity = String(clamp(routeStrength, 0, 0.72));
      route.classList.toggle('is-active', routeStrength > 0.05);
    });
  };

  const interpolateTerritory = (fromTerritory, toTerritory, t) => {
    const keys = new Set([
      ...Object.keys(fromTerritory || {}),
      ...Object.keys(toTerritory || {}),
      ...Object.keys(REGION_DEFINITIONS),
    ]);
    const output = {};
    keys.forEach((key) => {
      output[key] = lerp(Number(fromTerritory?.[key] || 0), Number(toTerritory?.[key] || 0), t);
    });
    return output;
  };

  const updateStageText = () => {
    const stage = STAGES[state.stageIndex];
    state.root.querySelector('.empire-map-year').textContent = stage.year;
    state.root.querySelector('.empire-map-stage-title').textContent = stage.title;
    state.root.querySelector('.empire-map-stage-subtitle').textContent = stage.subtitle;
    state.root.querySelector('.empire-map-note').textContent = stage.note;
    state.stageListEl.querySelectorAll('.empire-map-stage-button').forEach((button) => {
      button.classList.toggle('active', Number(button.dataset.stageIndex) === state.stageIndex);
    });
    if (Number(state.rangeEl.value) !== state.stageIndex) {
      state.rangeEl.value = String(state.stageIndex);
    }
  };

  const setStage = (stageIndex, immediate = false) => {
    const nextIndex = clamp(Number(stageIndex) || 0, 0, STAGES.length - 1);
    const stage = STAGES[nextIndex];
    state.stageIndex = nextIndex;
    updateStageText();

    const from = { ...state.currentTerritory };
    const to = { ...stage.territory };
    const contested = { ...(stage.contested || {}) };
    state.targetTerritory = to;

    if (state.animationFrame) {
      cancelAnimationFrame(state.animationFrame);
      state.animationFrame = null;
    }

    if (immediate) {
      state.currentTerritory = to;
      applyTerritory(to, contested);
      return;
    }

    const duration = 820;
    const startedAt = performance.now();
    const tick = (now) => {
      const progress = clamp((now - startedAt) / duration, 0, 1);
      const eased = easeInOutCubic(progress);
      state.currentTerritory = interpolateTerritory(from, to, eased);
      applyTerritory(state.currentTerritory, contested);
      if (progress < 1) {
        state.animationFrame = requestAnimationFrame(tick);
      } else {
        state.animationFrame = null;
        state.currentTerritory = to;
        applyTerritory(to, contested);
      }
    };
    state.animationFrame = requestAnimationFrame(tick);
  };

  const selectRegion = (regionId) => {
    const region = REGION_DEFINITIONS[regionId] || REGION_DEFINITIONS.australia;
    const stage = STAGES[state.stageIndex];
    const strength = Number(stage.territory?.[regionId] || 0);
    const contested = Number(stage.contested?.[regionId] || 0);
    state.selectedRegionId = regionId;
    const status =
      strength > 0.65
        ? region.statusLabel
        : strength > 0.05
          ? '恢复中'
          : contested > 0.05
            ? '失控/争夺区'
            : '未纳入当前疆域';

    state.root.querySelectorAll('[data-region-id]').forEach((el) => {
      el.classList.toggle('is-selected', el.dataset.regionId === regionId);
    });

    const australiaActions =
      regionId === 'australia'
        ? `
          <div class="empire-map-detail-actions">
            <button class="empire-map-action-button" type="button" data-map-action="focus-australia">
              ${state.focusMode === 'australia' ? '刷新聚焦总览' : '聚焦当前区域'}
            </button>
            ${
              state.focusMode === 'australia'
                ? '<button class="empire-map-action-button empire-map-action-button--ghost" type="button" data-map-action="exit-focus">返回全球疆域</button>'
                : ''
            }
          </div>
          <div class="empire-map-site-list" aria-label="澳大利亚本土重点机构">
            ${AUSTRALIA_FOCUS_SITES.map(
              (site) => `
                <button class="empire-map-site-row" type="button" data-australia-site="${site.id}">
                  <span>${site.name}</span>
                  <strong>${site.title}</strong>
                </button>
              `
            ).join('')}
          </div>
        `
        : state.focusMode === 'australia'
          ? `
            <div class="empire-map-detail-actions">
              <button class="empire-map-action-button" type="button" data-map-action="exit-focus">
                返回全球疆域
              </button>
            </div>
          `
          : '';

    state.detailEl.innerHTML = `
      <div class="empire-map-detail-kicker">${status}</div>
      <h2>${region.name}</h2>
      <p class="empire-map-detail-summary">${region.summary}</p>
      <div class="empire-map-detail-body">${region.details}</div>
      ${australiaActions}
      <dl class="empire-map-detail-meta">
        <div><dt>当前时期</dt><dd>${stage.title}</dd></div>
        <div><dt>控制强度</dt><dd>${Math.round(strength * 100)}%</dd></div>
        <div><dt>档案标记</dt><dd>${region.label}</dd></div>
      </dl>
    `;
  };

  const handleResize = () => {
    const stageEl = state.root?.querySelector('.empire-map-stage');
    if (!stageEl || !state.svg) return;
    const rect = stageEl.getBoundingClientRect();
    state.width = Math.max(720, rect.width || 1200);
    state.height = Math.max(420, rect.height || 640);
    state.svg.setAttribute('viewBox', `0 0 ${state.width} ${state.height}`);
    renderGraticule();
    renderWorld();
    renderAustraliaFocus();
    applyTerritory(state.currentTerritory, STAGES[state.stageIndex]?.contested || {});
  };

  const init = async (view, options = {}) => {
    const root = view?.querySelector('.empire-map-shell');
    if (!root) return;

    state.root = root;
    state.websiteData = options.websiteData || window.__websiteData || {};
    state.parseAndColorText = options.parseAndColorText || null;
    state.mapTextOverrides = state.websiteData?.empireMap?.localFeatureText || {};

    if (!state.initialized) {
      renderShell();
      try {
        const [world, palette, localRoads, localContours] = await Promise.all([
          loadWorldData(),
          getMapboxPalette(),
          loadLocalRoadData(),
          loadLocalContourData(),
        ]);
        state.mapboxPalette = palette;
        state.worldFeatures = Array.isArray(world.features) ? world.features : [];
        state.localRoadFeatures = Array.isArray(localRoads.features) ? localRoads.features : [];
        state.localContourFeatures = Array.isArray(localContours.features) ? localContours.features : [];
        state.australiaFeature = state.worldFeatures.find((feature) => getFeatureIso(feature) === 'AUS') || null;
        handleResize();
        setStage(0, true);
        selectRegion('australia');
      } catch (error) {
        console.error('[EmpireMap] failed to load map data', error);
        state.root.innerHTML = `
          <div class="loading-placeholder error">疆域地图数据加载失败，请刷新重试。</div>
        `;
        return;
      }

      state.resizeObserver = new ResizeObserver(handleResize);
      state.resizeObserver.observe(state.root);
      state.initialized = true;
    } else {
      updateStageText();
      setStage(state.stageIndex, true);
    }
  };

  window.EmpireMap = {
    init,
    selectAustraliaSite,
    setAustraliaView,
    getDebugSnapshot: getLocalDebugSnapshot,
  };
})();
