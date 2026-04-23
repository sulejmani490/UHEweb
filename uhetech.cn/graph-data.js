// graph-data.js - V5.0.0 (Data Integrity Fix)
// 补充缺失的 sovietData 对象，并为所有数据集添加必要的ID，以确保交互功能正常。

(() => {
    // 确保 colorPalette 已经加载
    if (!window.colorPalette) {
        console.error("color-palette.js is not loaded yet!");
        return;
    }
    
    const { imperialGold, sovietRed, adminBureauBlue, stormyGray, onyxBlack, goatEmpireBrown, fabreGreen, wolfLordCrimson, zhePartyMagenta, pastelGreen, warningYellow, scienceMinistryCyan } = window.colorPalette;

    // ECharts 图例分类
    const graphCategories = [
        { name: '最高委员会', itemStyle: { color: sovietRed } },
        { name: '人类帝国相关', itemStyle: { color: imperialGold } },
        { name: '魔法侧', itemStyle: { color: wolfLordCrimson } },
        { name: '法布尔', itemStyle: { color: fabreGreen } },
        { name: '哲党', itemStyle: { color: zhePartyMagenta } },
        { name: '关键事件', itemStyle: { color: warningYellow } }
    ];

    // --- 全人物关系图数据 ---
    const allCharactersData = {
        id: 'allCharacters', // [修正] 添加唯一ID
        nodes: [
            // 最高委员会 (Category 0)
            { id: '刘宜鑫', name: '刘宜鑫', symbolSize: 70, category: 0, label: { fontSize: 16 } },
            { id: '郭世上', name: '郭世上', symbolSize: 65, category: 0 },
            { id: '黄睿', name: '黄睿', symbolSize: 65, category: 0 },
            { id: '李臻一', name: '李臻一', symbolSize: 65, category: 0 },
            { id: '殷实', name: '殷实', symbolSize: 60, category: 0 },
            { id: '楚沛锦', name: '楚沛锦', symbolSize: 60, category: 0 },
            { id: '吴宪人', name: '吴宪人', symbolSize: 60, category: 0 },
            { id: '吴秦丞', name: '吴秦丞', symbolSize: 60, category: 0 },
            { id: '李俊毅', name: '李俊毅', symbolSize: 60, category: 0 },
            { id: '赵纯浩', name: '赵纯浩', symbolSize: 55, category: 0 },
            { id: '最高委员会', name: '最高委员会', symbolSize: 95, category: 0, label: { color: '#fff', backgroundColor: sovietRed, padding: [5, 10], borderRadius: 5, fontSize: 14, fontWeight: 'bold' } },

            // 人类帝国相关 (Category 1)
            { id: '人类帝国', name: '人类帝国', symbolSize: 110, category: 1 },
            { id: '第一领导', name: '第一领导', symbolSize: 40, category: 1 },
            { id: '对外殖民管理局', name: '对外殖民管理局', symbolSize: 38, category: 1, itemStyle: { color: adminBureauBlue } },
            { id: '帝国情报局', name: '帝国情报局', symbolSize: 38, category: 1, itemStyle: { color: stormyGray } },
            { id: '海事警戒局', name: '海事警戒局', symbolSize: 38, category: 1 },
            { id: '科技部', name: '科技部', symbolSize: 38, category: 1, itemStyle: { color: scienceMinistryCyan } },
            { id: '头号法布尔', name: '头号法布尔', symbolSize: 35, category: 1 },
            { id: '复活中心', name: '复活中心', symbolSize: 45, category: 1, itemStyle: { color: onyxBlack } },

            // 魔法侧 (Category 2)
            { id: '羊主', name: '羊主(曲勃旭)', symbolSize: 70, category: 2, itemStyle: { color: goatEmpireBrown } },
            { id: '戴一博', name: '戴一博', symbolSize: 60, category: 2 },
            { id: '狼主', name: '狼主', symbolSize: 65, category: 2, itemStyle: { color: wolfLordCrimson } },
            
            // 法布尔 (Category 3)
            { id: '姜王', name: '姜王(姜大成)', symbolSize: 70, category: 3 },
            { id: '法布尔', name: '法布尔组织', symbolSize: 45, category: 3 },
            { id: '第四法布尔', name: '第四法布尔', symbolSize: 40, category: 3 },

            // 哲党 (Category 4)
            { id: '哲党四杰', name: '哲党四杰', symbolSize: 45, category: 4 },
            { id: '潘锦睿', name: '潘锦睿', symbolSize: 30, category: 4 },
            { id: '王政', name: '王政', symbolSize: 30, category: 4 },
            { id: '范广睿', name: '范广睿', symbolSize: 30, category: 4 },
            { id: '徐睿', name: '徐睿', symbolSize: 30, category: 4 },

            // 关键事件 (Category 5)
            { id: '郭世上平行中心案', name: '郭世上平行中心案', symbolSize: 45, category: 5, symbol: 'diamond' },
            { id: '新西兰法布尔事件', name: '新西兰法布尔事件', symbolSize: 45, category: 5, symbol: 'diamond' },
            { id: '第四次远征失败', name: '第四次远征失败', symbolSize: 55, category: 5, symbol: 'diamond' },
        ],
        links: [
            // --- 组织与成员 ---
            { source: '人类帝国', target: '最高委员会', value: '核心权力' },
            ...['刘宜鑫', '郭世上', '黄睿', '李臻一', '殷实', '楚沛锦', '吴宪人', '吴秦丞', '李俊毅', '赵纯浩'].map(name => ({ source: '最高委员会', target: name, value: '委员' })),
            { source: '人类帝国', target: '第一领导', value: '已故创始人' },
            ...['对外殖民管理局', '帝国情报局', '海事警戒局', '科技部'].map(name => ({ source: '人类帝国', target: name, value: '下辖机构' })),
            { source: '人类帝国', target: '复活中心', value: '核心基石' },
            { source: '李臻一', target: '对外殖民管理局', value: '设立/曾领导' },
            { source: '楚沛锦', target: '帝国情报局', value: '设立/领导' },
            { source: '吴宪人', target: '海事警戒局', value: '领导' },
            { source: '赵纯浩', target: '科技部', value: '领导' },
            { source: '赵纯浩', target: '对外殖民管理局', value: '曾领导' },
            { source: '帝国情报局', target: '头号法布尔', value: '收编/教官' },
            { source: '羊主', target: '戴一博', value: '效忠' },
            { source: '羊主', target: '姜王', value: '辅佐' },
            { source: '姜王', target: '法布尔', value: '领导' },
            { source: '法布尔', target: '第四法布尔', value: '高级成员' },
            { source: '法布尔', target: '头号法布尔', value: '前成员' },
            { source: '哲党四杰', target: '潘锦睿', value: '成员' },
            { source: '哲党四杰', target: '王政', value: '成员' },
            { source: '哲党四杰', target: '范广睿', value: '成员' },
            { source: '哲党四杰', target: '徐睿', value: '成员' },
            // --- 敌对关系 (红色系) ---
            { source: '人类帝国', target: '羊主', value: '敌对', lineStyle: { color: 'red', width: 2 } },
            { source: '人类帝国', target: '姜王', value: '敌对', lineStyle: { color: 'red', width: 2 } },
            { source: '人类帝国', target: '哲党四杰', value: '敌对', lineStyle: { color: 'red', width: 2 } },
            { source: '人类帝国', target: '狼主', value: '敌对(后期)', lineStyle: { color: '#FF4500', width: 2, type: 'dashed' } },
            { source: '羊主', target: '狼主', value: '敌对/封印', lineStyle: { color: 'red', width: 2 } },
            { source: '姜王', target: '狼主', value: '敌对/战败', lineStyle: { color: 'red', width: 2 } },
            { source: '刘宜鑫', target: '戴一博', value: '重创', lineStyle: { color: 'red', width: 1.5 } },
            { source: '郭世上', target: '羊主', value: '被击碎激光剑', lineStyle: { color: 'red', width: 1.5 } },
            { source: '郭世上', target: '第四法布尔', value: '对抗', lineStyle: { color: 'red', width: 1.5 } },
            // --- 个人与事件的复杂关系 ---
            { source: '殷实', target: '人类帝国', value: '背叛', lineStyle: { color: '#DC143C', width: 3, type: 'dashed' } },
            { source: '殷实', target: '黄睿', value: '注射病毒', lineStyle: { color: '#8B0000', width: 2 } },
            { source: '殷实', target: '第四次远征失败', value: '直接原因', lineStyle: { color: '#DC143C', width: 2.5 } },
            { source: '黄睿', target: '戴一博', value: '爱恨情仇', lineStyle: { color: '#DA70D6', width: 2.5 } },
            { source: '法布尔', target: '郭世上平行中心案', value: '策划' },
            { source: '郭世上', target: '郭世上平行中心案', value: '被栽赃' },
            { source: '李臻一', target: '郭世上平行中心案', value: '结仇' },
            { source: '第一领导', target: '郭世上平行中心案', value: '被刺杀' },
            { source: '郭世上', target: '新西兰法布尔事件', value: '策划叛乱' },
            { source: '吴秦丞', target: '新西兰法布尔事件', value: '约定参与' },
            { source: '李臻一', target: '新西兰法布尔事件', value: '上报' },
            { source: '头号法布尔', target: '新西兰法布尔事件', value: '告密' },
            { source: '殷实', target: '法布尔', value: '投靠(第五法布尔)', lineStyle: { color: fabreGreen, width: 2, type: 'dashed' } },
            // --- 委员会内部关系 ---
            { source: '李臻一', target: '郭世上', value: '政治斗争', lineStyle: { color: 'purple', width: 2, type: 'dashed' } },
            { source: '李臻一', target: '殷实', value: '曾为盟友', lineStyle: { color: 'green', type: 'dotted' } },
            { source: '李臻一', target: '楚沛锦', value: '政治盟友' },
            { source: '吴宪人', target: '李臻一', value: '好友' },
            { source: '郭世上', target: '李俊毅', value: '上下级/盟友' },
            { source: '赵纯浩', target: '李臻一', value: '提拔' },
        ]
    };

    // --- [新增] 最高委员会内部关系图数据 ---
    const sovietData = {
        id: 'soviet', // [修正] 添加唯一ID
        nodes: [
            { id: '刘宜鑫', name: '刘宜鑫 (主席)', symbolSize: 80, category: 0, label: { fontSize: 16 } },
            { id: '郭世上', name: '郭世上 (变革派)', symbolSize: 70, category: 0 },
            { id: '李臻一', name: '李臻一 (建制派)', symbolSize: 70, category: 0 },
            { id: '黄睿', name: '黄睿 (中立/摇摆)', symbolSize: 65, category: 0, itemStyle: { color: pastelGreen } },
            { id: '殷实', name: '殷实 (建制派->叛变)', symbolSize: 65, category: 0 },
            { id: '楚沛锦', name: '楚沛锦 (建制派)', symbolSize: 60, category: 0 },
            { id: '吴宪人', name: '吴宪人 (建制派)', symbolSize: 60, category: 0 },
            { id: '吴秦丞', name: '吴秦丞 (机会主义)', symbolSize: 55, category: 0 },
            { id: '李俊毅', name: '李俊毅 (变革派)', symbolSize: 60, category: 0 },
            { id: '赵纯浩', name: '赵纯浩 (文职/偏建制)', symbolSize: 55, category: 0 },
        ],
        links: [
            { source: '刘宜鑫', target: '李臻一', value: '信任/维护', lineStyle: { color: 'green', width: 2 } },
            { source: '刘宜鑫', target: '郭世上', value: '制衡/不满', lineStyle: { color: 'orange', type: 'dashed' } },
            
            { source: '李臻一', target: '殷实', value: '政治盟友(前)', lineStyle: { color: 'green', type: 'dotted'} },
            { source: '李臻一', target: '楚沛锦', value: '政治盟友', lineStyle: { color: 'green' } },
            { source: '李臻一', target: '吴宪人', value: '好友', lineStyle: { color: 'green' } },
            { source: '李臻一', target: '赵纯浩', value: '提拔', lineStyle: { color: 'green' } },
            { source: '李臻一', target: '郭世上', value: '核心政治对手', lineStyle: { color: '#8A2BE2', width: 3 } },

            { source: '郭世上', target: '李俊毅', value: '领导/信任', lineStyle: { color: '#4682B4', width: 2 } },
            { source: '郭世上', target: '殷实', value: '不计前嫌任用', lineStyle: { type: 'dotted'} },
            { source: '郭世上', target: '黄睿', value: '试图拉拢', lineStyle: { color: '#4682B4', type: 'dotted'} },

            { source: '殷实', target: '郭世上', value: '被任命->背叛帝国', lineStyle: { color: 'red', width: 2, type: 'dashed'} },
            
            { source: '楚沛锦', target: '郭世上', value: '私下赞赏能力', lineStyle: { type: 'dotted'} },
        ]
    };

    // [修正] 确保所有数据都正确导出
    window.graphCategories = graphCategories;
    window.allCharactersData = allCharactersData;
    window.sovietData = sovietData;
})();