// graph.js - V13.1.0 (Theme-Aware Version)
// [合并 V10 & V12] 结合了V10的智能边界算法、移动端优先设计和V12的多层级钻取交互功能
// [核心功能] 保留V10的100%不遗漏节点的Ultra-Smart Fit，并集成V12的多图谱切换能力
// [新增功能] 支持点击多个节点(如最高委员会, 情报局等)进入内部关系图，关系边使用箭头指示方向
// [优化] 统一并增强了移动端体验，tooltip智能提示，返回按钮逻辑更通用
// [新功能] 适配全局主题（AppTheme）：图谱在亮/暗色模式下自动切换配色

const RelationshipGraph = (() => {
    let myChart = null;
    let chartContainer = null;
    let backButton = null;
    let currentGraphId = null;
    let currentTitle = '';
    let isLayouting = false;
    let layoutCompleteTimer = null;
    let themeUnsubscribe = null;
  
    // Set of node IDs that can be clicked to drill down into a new graph
    const drillDownNodeIds = new Set(['最高委员会', '帝国情报局', '海事警戒局', '科技部']);

    // 读取当前全局主题（来自 app-modules.js 中的 AppTheme）
    const getCurrentTheme = () => {
        if (window.AppTheme && typeof AppTheme.current === 'string') {
            return AppTheme.current;
        }
        return 'light';
    };

    // 根据主题返回一组配色
    const getThemeColors = (themeName) => {
        const isDark = themeName === 'dark';
        return {
            baseText: isDark ? '#f2f4ff' : '#333333',   // 主文字
            subText: isDark ? '#8d95a8' : '#555555',   // 次级文字/图例
            tooltipBg: isDark ? 'rgba(10,12,18,0.95)' : 'rgba(255,255,255,0.95)',
            tooltipBorder: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
            lineColor: isDark ? 'rgba(230,236,255,0.28)' : 'rgba(65,78,95,0.34)', // 默认连线颜色
            nodeBorder: isDark ? 'rgba(255,255,255,0.52)' : 'rgba(22,31,44,0.24)',
            labelBg: isDark ? 'rgba(7,10,17,0.72)' : 'rgba(255,255,255,0.78)',
            labelBorder: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(22,31,44,0.08)',
        };
    };

    // 分类视觉只改变图标外观，不改变 graph-data.js 中的人物/组织/事件内容。
    const categoryVisuals = [
        { symbol: 'circle', borderWidth: 3 },
        { symbol: 'roundRect', borderWidth: 2 },
        { symbol: 'triangle', borderWidth: 2 },
        { symbol: 'rect', borderWidth: 2 },
        { symbol: 'diamond', borderWidth: 2 },
        { symbol: 'diamond', borderWidth: 3 },
    ];

    // 关系图固定布局：把原本随机的 force 布局改为按阵营分区的稳定坐标。
    // 坐标只用于减少连线交错和提升可读性，节点与连线的内容仍完全读取原数据。
    const stableLayoutPresets = {
        allCharacters: {
            // 核心与最高委员会：放在画面中轴，委员会成员围绕权力核心展开。
            '人类帝国': [0, 0],
            '最高委员会': [0, -285],
            '刘宜鑫': [0, -455],
            '郭世上': [-220, -375],
            '李臻一': [225, -375],
            '黄睿': [115, -525],
            '殷实': [-125, -525],
            '楚沛锦': [360, -255],
            '吴宪人': [460, -90],
            '吴秦丞': [-455, -90],
            '李俊毅': [-360, -255],
            '赵纯浩': [330, -525],

            // 帝国机构：集中在右侧，避免与左侧敌对势力互相穿线。
            '第一领导': [-230, 115],
            '对外殖民管理局': [360, -25],
            '帝国情报局': [500, 115],
            '海事警戒局': [375, 245],
            '科技部': [180, 365],
            '复活中心': [0, 235],
            '头号法布尔': [-335, 115],

            // 外部势力：按魔法侧、法布尔、哲党分区，敌对连线从核心向外发散。
            '羊主': [-560, -125],
            '戴一博': [-665, -300],
            '狼主': [-660, 55],
            '姜王': [-555, 265],
            '法布尔': [-405, 410],
            '第四法布尔': [-245, 545],
            '哲党四杰': [0, 505],
            '潘锦睿': [-235, 655],
            '王政': [-75, 690],
            '范广睿': [90, 690],
            '徐睿': [245, 655],

            // 关键事件：放在右下和右上，保留事件与相关人物的空间关系。
            '郭世上平行中心案': [565, -300],
            '新西兰法布尔事件': [565, 330],
            '第四次远征失败': [245, 545],
        },
        soviet: {
            // 最高委员会内部图按政治阵营左右分区，主席置顶，减少核心对手线穿插。
            '刘宜鑫': [0, -270],
            '李臻一': [-255, 0],
            '楚沛锦': [-455, 175],
            '吴宪人': [-285, 285],
            '赵纯浩': [-90, 270],
            '殷实': [-155, 105],
            '郭世上': [255, 0],
            '李俊毅': [455, 175],
            '黄睿': [95, 270],
            '吴秦丞': [285, 285],
        },
    };

    // 移动端检测和配置 (Merged: V10 structure with V12 force values)
    const deviceConfig = () => {
        const isMobile = window.innerWidth < 768;
        const isTablet = window.innerWidth >= 768 && window.innerWidth < 1024;
        
        return {
            isMobile,
            isTablet,
            isDesktop: window.innerWidth >= 1024,
            nodeScale: isMobile ? 0.5 : isTablet ? 0.7 : 1.0,
            labelScale: isMobile ? 0.8 : isTablet ? 0.9 : 1.0,
            // Using higher values from V12 for better node separation
            repulsion: isMobile ? 2000 : isTablet ? 4000 : 6000,
            edgeLength: isMobile ? [100, 180] : isTablet ? [150, 250] : [200, 400],
            // Core values from V10
            safePadding: isMobile ? 60 : isTablet ? 80 : 100,
            minZoom: isMobile ? 0.2 : 0.1,
            maxZoom: isMobile ? 1.5 : 2.0
        };
    };

    /**
     * [V10 Core] 精确的文本宽度计算 - 使用一个复用的 Canvas 测量真实文本尺寸。
     * 调整这里不会改业务逻辑，只会影响 fit-view 的精度与开销。
     */
    const textMeasureCanvas = document.createElement('canvas');
    const textMeasureContext = textMeasureCanvas.getContext('2d');
    const measureTextWidth = (text, fontSize, fontFamily = 'Arial') => {
        if (!textMeasureContext) {
            return String(text || '').length * fontSize;
        }
        textMeasureContext.font = `${fontSize}px ${fontFamily}`;
        return textMeasureContext.measureText(text).width;
    };

    /**
     * [V10 Core] 防呆式智能边界检测 - 多重保险机制确保不遗漏任何节点
     */
    const getUltraSmartBounds = (chartInstance) => {
        const config = deviceConfig();
        const seriesModel = chartInstance.getModel().getSeriesByIndex(0);
        if (!seriesModel) {
            console.warn('[getUltraSmartBounds] No series model found');
            return null;
        }

        const graph = seriesModel.getGraph();
        const legend = chartInstance.getModel().getComponent('legend', 0);
        const selectedMap = legend ? legend.get('selected') : {};
        
        let globalBounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
        let nodeBounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
        let labelBounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
        
        let visibleNodes = [];
        const fontSize = 12 * config.labelScale;

        graph.eachNode(dataIndex => {
            const node = graph.getNodeByIndex(dataIndex);
            const nodeData = node.getData();
            const category = nodeData.category;
            const categoryName = window.graphCategories && window.graphCategories[category] ? 
                                window.graphCategories[category].name : null;
            
            const isNodeVisible = !categoryName || selectedMap[categoryName] !== false;
            
            if (isNodeVisible) {
                const layout = node.getLayout();
                if (layout && !isNaN(layout[0]) && !isNaN(layout[1])) {
                    visibleNodes.push({ layout, data: nodeData, node: node });
                }
            }
        });

        if (visibleNodes.length === 0) {
            console.warn('[getUltraSmartBounds] No visible nodes found');
            return null;
        }

        visibleNodes.forEach(({ layout, data }) => {
            const [x, y] = layout;
            
            const symbolSize = data.symbolSize || 30;
            const radius = (Array.isArray(symbolSize) ? Math.max(symbolSize[0], symbolSize[1]) : symbolSize) / 2;
            
            nodeBounds.minX = Math.min(nodeBounds.minX, x - radius);
            nodeBounds.maxX = Math.max(nodeBounds.maxX, x + radius);
            nodeBounds.minY = Math.min(nodeBounds.minY, y - radius);
            nodeBounds.maxY = Math.max(nodeBounds.maxY, y + radius);
            
            const labelText = data.name || '';
            const labelPadding = Array.isArray(data.label?.padding) ? data.label.padding : [0, 0];
            const labelPaddingY = Number(labelPadding[0]) || 0;
            const labelPaddingX = Number(labelPadding[1]) || 0;
            const realTextWidth = measureTextWidth(labelText, fontSize) + labelPaddingX * 2;
            const textHeight = fontSize + labelPaddingY * 2;
            const labelOffset = 10;
            const labelPosition = data.label?.position || 'right';
            let labelStartX = x + radius + labelOffset;
            let labelEndX = labelStartX + realTextWidth;
            let labelTopY = y - textHeight / 2;
            let labelBottomY = y + textHeight / 2;

            if (labelPosition === 'left') {
                labelEndX = x - radius - labelOffset;
                labelStartX = labelEndX - realTextWidth;
            } else if (labelPosition === 'top') {
                labelStartX = x - realTextWidth / 2;
                labelEndX = x + realTextWidth / 2;
                labelBottomY = y - radius - labelOffset;
                labelTopY = labelBottomY - textHeight;
            } else if (labelPosition === 'bottom') {
                labelStartX = x - realTextWidth / 2;
                labelEndX = x + realTextWidth / 2;
                labelTopY = y + radius + labelOffset;
                labelBottomY = labelTopY + textHeight;
            } else if (labelPosition === 'inside') {
                labelStartX = x - realTextWidth / 2;
                labelEndX = x + realTextWidth / 2;
                labelTopY = y - textHeight / 2;
                labelBottomY = y + textHeight / 2;
            }
            
            labelBounds.minX = Math.min(labelBounds.minX, labelStartX);
            labelBounds.maxX = Math.max(labelBounds.maxX, labelEndX);
            labelBounds.minY = Math.min(labelBounds.minY, labelTopY);
            labelBounds.maxY = Math.max(labelBounds.maxY, labelBottomY);
        });

        const combineBounds = (bounds1, bounds2) => ({
            minX: Math.min(bounds1.minX, bounds2.minX),
            maxX: Math.max(bounds1.maxX, bounds2.maxX),
            minY: Math.min(bounds1.minY, bounds2.minY),
            maxY: Math.max(bounds1.maxY, bounds2.maxY)
        });

        globalBounds = combineBounds(nodeBounds, labelBounds);
        
        const densityFactor = Math.sqrt(visibleNodes.length / 10);
        const dynamicPadding = config.safePadding * Math.max(0.5, Math.min(2.0, densityFactor));
        
        globalBounds.minX -= dynamicPadding;
        globalBounds.maxX += dynamicPadding;
        globalBounds.minY -= dynamicPadding;
        globalBounds.maxY += dynamicPadding;

        const result = {
            ...globalBounds,
            width: globalBounds.maxX - globalBounds.minX,
            height: globalBounds.maxY - globalBounds.minY,
            centerX: (globalBounds.minX + globalBounds.maxX) / 2,
            centerY: (globalBounds.minY + globalBounds.maxY) / 2,
            visibleNodeCount: visibleNodes.length,
            padding: dynamicPadding
        };

        console.log(`[getUltraSmartBounds] Detected bounds:`, 
                   `${result.width.toFixed(0)}x${result.height.toFixed(0)}, ` +
                   `Center: [${result.centerX.toFixed(0)}, ${result.centerY.toFixed(0)}], ` +
                   `Nodes: ${result.visibleNodeCount}, Padding: ${result.padding.toFixed(0)}`);

        return result;
    };

    /**
     * [V10 Core] 超智能缩放 - 多重检查确保100%不遗漏节点
     */
    const ultraIntelligentFitView = (chartInstance, animated = true) => {
        const config = deviceConfig();
        console.log(`[ultraIntelligentFitView] Starting ultra-smart fit (${config.isMobile ? 'Mobile' : config.isTablet ? 'Tablet' : 'Desktop'} mode)...`);
        
        const executeFit = () => {
            let bounds = null;
            for (let attempt = 0; attempt < 3; attempt++) {
                bounds = getUltraSmartBounds(chartInstance);
                if (bounds && bounds.width > 0 && bounds.height > 0) break;
                console.warn(`[ultraIntelligentFitView] Attempt ${attempt + 1} failed, retrying...`);
            }
            
            if (!bounds) {
                console.error('[ultraIntelligentFitView] Failed to get valid bounds after 3 attempts');
                chartInstance.setOption({
                    series: [{ zoom: config.isMobile ? 0.8 : 1.0, center: [0, 0] }]
                });
                return;
            }

            const chartWidth = chartInstance.getWidth();
            const chartHeight = chartInstance.getHeight();
            
            const viewMargin = config.isMobile ? 0.75 : config.isTablet ? 0.85 : 0.9;
            const availableWidth = chartWidth * viewMargin;
            const availableHeight = chartHeight * viewMargin;
            
            const zoomX = availableWidth / bounds.width;
            const zoomY = availableHeight / bounds.height;
            let optimalZoom = Math.min(zoomX, zoomY);
            
            optimalZoom = Math.max(config.minZoom, Math.min(config.maxZoom, optimalZoom));
            
            if (config.isMobile && optimalZoom < 0.3) {
                optimalZoom = 0.3;
                console.log('[ultraIntelligentFitView] Mobile zoom protection activated');
            }
            
            const targetCenter = [bounds.centerX, bounds.centerY];
            
            console.log(`[ultraIntelligentFitView] Final params: Zoom=${optimalZoom.toFixed(3)}, ` +
                       `Center=[${targetCenter[0].toFixed(0)}, ${targetCenter[1].toFixed(0)}]`);

            const animationDuration = animated ? (config.isMobile ? 600 : 1000) : 0;
            
            chartInstance.setOption({
                animationDurationUpdate: animationDuration,
                animationEasingUpdate: 'cubicOut',
                series: [{
                    zoom: optimalZoom,
                    center: targetCenter,
                }]
            });
        };

        const delay = animated ? (config.isMobile ? 200 : 300) : 50;
        setTimeout(() => requestAnimationFrame(executeFit), delay);
    };

    /**
     * [V10 Core] 强制重新布局 - 移动端友好
     */
    const forceRelayout = (chartInstance, callback) => {
        if (isLayouting) return;
        
        isLayouting = true;
        console.log('[forceRelayout] Forcing smart relayout...');
        
        if (layoutCompleteTimer) clearTimeout(layoutCompleteTimer);
        
        chartInstance.setOption({
            animationDurationUpdate: 0,
            series: [{ force: { layoutAnimation: true } }]
        });
        
        const config = deviceConfig();
        const layoutDelay = config.isMobile ? 300 : 500;
        
        layoutCompleteTimer = setTimeout(() => {
            chartInstance.setOption({
                series: [{ force: { layoutAnimation: false } }]
            });
            
            isLayouting = false;
            console.log('[forceRelayout] Layout completed');
            
            if (callback) callback();
        }, layoutDelay);
    };

    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

    const hexToRgba = (hex, alpha) => {
        const raw = String(hex || '').trim().replace('#', '');
        if (!/^[0-9a-f]{3}([0-9a-f]{3})?$/i.test(raw)) {
            return `rgba(53, 182, 255, ${alpha})`;
        }

        const normalized = raw.length === 3
            ? raw.split('').map((char) => char + char).join('')
            : raw;
        const value = parseInt(normalized, 16);
        const red = (value >> 16) & 255;
        const green = (value >> 8) & 255;
        const blue = value & 255;
        return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
    };

    const getReadableTextColor = (hex) => {
        const raw = String(hex || '').trim().replace('#', '');
        if (!/^[0-9a-f]{3}([0-9a-f]{3})?$/i.test(raw)) return '#ffffff';

        const normalized = raw.length === 3
            ? raw.split('').map((char) => char + char).join('')
            : raw;
        const red = parseInt(normalized.slice(0, 2), 16) / 255;
        const green = parseInt(normalized.slice(2, 4), 16) / 255;
        const blue = parseInt(normalized.slice(4, 6), 16) / 255;
        const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
        return luminance > 0.62 ? '#17202d' : '#ffffff';
    };

    const getCategoryColor = (categoryIndex, fallback = '#35b6ff') => {
        const category = window.graphCategories && window.graphCategories[categoryIndex];
        return category?.itemStyle?.color || fallback;
    };

    const getNodeColor = (node, fallback) => (
        node?.itemStyle?.color ||
        getCategoryColor(node?.category, fallback)
    );

    const getCurrentGraphData = () => {
        const registry = {
            allCharacters: window.allCharactersData,
            soviet: window.sovietData,
            intel: window.intelData,
            navy: window.navyData,
            science: window.scienceData,
            ...(window.allGraphData || {}),
        };
        return registry[currentGraphId] || window.allCharactersData;
    };

    const hasStableLayout = (graphId) => Boolean(stableLayoutPresets[graphId]);

    const buildNodePositions = (data) => {
        const preset = stableLayoutPresets[data.id] || {};
        const buckets = new Map();
        const categoryCenters = [
            [0, -260],
            [260, 0],
            [-470, -120],
            [-430, 260],
            [0, 470],
            [470, 260],
        ];

        data.nodes.forEach((node) => {
            const category = Number.isFinite(Number(node.category)) ? Number(node.category) : 0;
            if (!buckets.has(category)) buckets.set(category, []);
            buckets.get(category).push(node.id);
        });

        const positions = {};
        data.nodes.forEach((node) => {
            if (preset[node.id]) {
                const [x, y] = preset[node.id];
                positions[node.id] = { x, y };
                return;
            }

            const category = Number.isFinite(Number(node.category)) ? Number(node.category) : 0;
            const categoryNodes = buckets.get(category) || [];
            const index = Math.max(0, categoryNodes.indexOf(node.id));
            const total = Math.max(1, categoryNodes.length);
            const [centerX, centerY] = categoryCenters[category] || [0, 0];
            const radius = 110 + Math.min(120, total * 12);
            const angle = (Math.PI * 2 * index) / total - Math.PI / 2;

            positions[node.id] = {
                x: centerX + Math.cos(angle) * radius,
                y: centerY + Math.sin(angle) * radius,
            };
        });

        return positions;
    };

    const getLabelPosition = (node, position) => {
        const size = node.symbolSize || 30;
        if (size >= 90 || node.id === '人类帝国') return 'inside';
        if (position.x < -120) return 'left';
        if (position.x > 120) return 'right';
        if (position.y > 120) return 'bottom';
        return 'top';
    };

    const buildProcessedNodes = (data, config, colors, nodePositions) => {
        return data.nodes.map((node) => {
            const position = nodePositions[node.id] || { x: 0, y: 0 };
            const visual = categoryVisuals[node.category] || categoryVisuals[1];
            const nodeColor = getNodeColor(node, colors.baseText);
            const labelPosition = getLabelPosition(node, position);
            const isInsideLabel = labelPosition === 'inside';
            const dataLabel = node.label || {};

            const baseLabel = {
                show: !config.isMobile || (node.symbolSize || 30) > 55,
                fontSize: Math.floor(12 * config.labelScale),
                position: labelPosition,
                color: isInsideLabel ? getReadableTextColor(nodeColor) : colors.baseText,
                fontWeight: drillDownNodeIds.has(node.id) || node.id === '人类帝国' ? 'bold' : 'normal',
                ...(isInsideLabel ? {} : {
                    backgroundColor: colors.labelBg,
                    borderColor: colors.labelBorder,
                    borderWidth: 1,
                    borderRadius: 7,
                    padding: [3, 7],
                }),
            };

            return {
                ...node,
                x: position.x,
                y: position.y,
                fixed: hasStableLayout(data.id),
                symbol: node.symbol || visual.symbol,
                symbolSize: (node.symbolSize || 30) * config.nodeScale,
                itemStyle: {
                    color: nodeColor,
                    borderColor: colors.nodeBorder,
                    borderWidth: visual.borderWidth,
                    shadowBlur: config.isMobile ? 5 : 12,
                    shadowColor: hexToRgba(nodeColor, config.isMobile ? 0.20 : 0.32),
                    ...(node.itemStyle || {}),
                },
                label: {
                    ...baseLabel,
                    ...dataLabel,
                    color: dataLabel.color || baseLabel.color,
                },
            };
        });
    };

    const buildProcessedLinks = (data, nodePositions, colors) => {
        return data.links.map((link, index) => {
            const source = nodePositions[link.source];
            const target = nodePositions[link.target];
            let curveness = 0.06;

            if (source && target) {
                const dx = target.x - source.x;
                const dy = target.y - source.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                const cross = source.x * target.y - source.y * target.x;
                const direction = cross >= 0 ? 1 : -1;

                curveness = clamp(distance / 5200, 0.035, 0.18) * direction;
                if (link.source === '人类帝国' || link.source === '最高委员会') {
                    curveness *= 0.45;
                }
                if (Math.abs(dx) < 80 || Math.abs(dy) < 80) {
                    curveness *= 0.65;
                }
            } else {
                curveness *= index % 2 === 0 ? 1 : -1;
            }

            return {
                ...link,
                lineStyle: {
                    color: colors.lineColor,
                    width: 1.25,
                    opacity: 0.62,
                    curveness,
                    ...(link.lineStyle || {}),
                },
            };
        });
    };

    // 新版 getOption：根据主题生成配色
    const getOption = (data, title, themeName) => {
        const config = deviceConfig();
        const theme = themeName || getCurrentTheme();
        const colors = getThemeColors(theme);
        const nodePositions = buildNodePositions(data);
        const processedNodes = buildProcessedNodes(data, config, colors, nodePositions);
        const processedLinks = buildProcessedLinks(data, nodePositions, colors);
        const usesStableLayout = hasStableLayout(data.id);

        console.log(`[getOption] Building config for ${config.isMobile ? 'Mobile' : config.isTablet ? 'Tablet' : 'Desktop'} device, theme=${theme}`);

        return {
            animationDuration: 900,
            animationDurationUpdate: 750,
            animationEasing: 'cubicOut',
            animationEasingUpdate: 'cubicInOut',
            title: { 
                text: title, 
                top: config.isMobile ? 15 : 20, 
                left: 'center', 
                textStyle: { 
                    color: colors.baseText,
                    fontSize: config.isMobile ? 16 : 24,
                    fontWeight: 'bold'
                } 
            },
            tooltip: {
                trigger: 'item',
                confine: true,
                backgroundColor: colors.tooltipBg,
                borderColor: colors.tooltipBorder,
                borderWidth: 1,
                textStyle: {
                    color: colors.baseText,
                    fontSize: 12
                },
                formatter: function (params) {
                    if (params.dataType === 'node') {
                        let tooltipText = `<strong>${params.data.name}</strong>`;
                        if (drillDownNodeIds.has(params.data.id)) { 
                            tooltipText += '<br/><span style="color: #4682B4; font-size: 12px;">[点击查看内部关系]</span>'; 
                        }
                        return tooltipText;
                    }
                    if (params.dataType === 'edge') { 
                        return `<strong>关系:</strong> ${params.data.value}`; 
                    }
                }
            },
            legend: [{
                data: window.graphCategories ? window.graphCategories.map(a => a.name) : [],
                orient: config.isMobile ? 'horizontal' : 'vertical', 
                left: config.isMobile ? 'center' : 'left', 
                top: config.isMobile ? 'auto' : 'center', 
                bottom: config.isMobile ? 5 : 'auto',
                textStyle: { color: colors.subText, fontSize: config.isMobile ? 10 : 12 }, 
                itemGap: config.isMobile ? 8 : 15,
                itemWidth: config.isMobile ? 12 : 18,
                itemHeight: config.isMobile ? 8 : 12,
                type: config.isMobile ? 'scroll' : 'plain',
                ...(config.isMobile && {
                    scrollDataIndex: 0, pageButtonItemGap: 5, pageButtonGap: 5, pageIconSize: 12
                })
            }],
            // 背景交给 CSS 控制，这里用透明
            backgroundColor: 'transparent',
            series: [{
                type: 'graph', 
                layout: usesStableLayout ? 'none' : 'force',
                data: processedNodes, 
                links: processedLinks, 
                categories: window.graphCategories || [],
                roam: true, 
                draggable: !config.isMobile,
                focusNodeAdjacency: true,
                blur: { lineStyle: { opacity: 0.08 }, itemStyle: { opacity: 0.24 } },
                labelLayout: { hideOverlap: true, moveOverlap: 'shiftY', draggable: true },
                lineStyle: { 
                    color: colors.lineColor,
                    curveness: usesStableLayout ? 0.08 : 0,
                    width: config.isMobile ? 0.9 : 1.25, 
                    opacity: 0.62 
                },
                // V12 Feature: Adding arrows to edges
                edgeSymbol: ['none', 'arrow'],
                edgeSymbolSize: config.isMobile ? 4 : 6,
                force: {
                    repulsion: config.repulsion, 
                    edgeLength: config.edgeLength, 
                    gravity: 0.05, 
                    friction: 0.7,
                    layoutAnimation: !usesStableLayout,
                },
                scaleLimit: { min: config.minZoom, max: config.maxZoom },
                emphasis: { 
                    focus: 'adjacency', 
                    label: { show: true }, 
                    lineStyle: { 
                        width: config.isMobile ? 2 : 3, 
                        opacity: 1 
                    }
                },
                left: config.isMobile ? '5%' : '8%', 
                right: config.isMobile ? '5%' : '5%', 
                top: config.isMobile ? '20%' : '10%', 
                bottom: config.isMobile ? '20%' : '10%',
            }]
        };
    };

    // 新版 renderGraph：支持控制是否重新 fit 视图（主题切换时不再跳动）
    const renderGraph = (data, title, options = {}) => {
        const { fitView = true } = options;

        if (!myChart || !data) {
            console.error('[renderGraph] Chart or data missing'); 
            return;
        }
        
        currentGraphId = data.id;
        currentTitle = title;
        
        console.log(`[renderGraph] Rendering: ${title} (${data.id})`);
        
        myChart.off('finished');
        myChart.clear();

        const theme = getCurrentTheme();
        const option = getOption(data, title, theme);
        myChart.setOption(option, { notMerge: true });
        
        if (fitView) {
            myChart.one('finished', () => {
                console.log('[renderGraph] Layout finished, applying ultra-intelligent fit...');
                ultraIntelligentFitView(myChart, true);
            });
        }

        // Merged V12 Logic: Show back button for any sub-graph
        // Assumes main graph data has `id: 'allCharacters'`
        if (backButton) {
            if (data.id !== 'allCharacters') {
                backButton.style.display = 'block';
                setTimeout(() => backButton.style.opacity = '1', 10);
            } else {
                backButton.style.opacity = '0';
                setTimeout(() => {
                    if (backButton.style.opacity === '0' && currentGraphId === 'allCharacters') { 
                        backButton.style.display = 'none'; 
                    }
                }, 300);
            }
        }
    };
    
    const init = (containerId) => {
        chartContainer = document.getElementById(containerId);
        if (!chartContainer) { 
            console.error('[init] Container not found:', containerId); 
            return; 
        }

        myChart = echarts.init(chartContainer);
        console.log('[init] ECharts initialized');

        const config = deviceConfig();

        // 返回按钮：使用 CSS 中的 .graph-back-button 控制视觉（吃主题变量）
        backButton = document.createElement('div');
        backButton.className = 'graph-back-button';
        backButton.textContent = config.isMobile ? '‹ 返回' : '‹ 返回全图';
        chartContainer.appendChild(backButton);

        backButton.addEventListener('click', () => { 
            if (window.allCharactersData) {
                renderGraph(window.allCharactersData, '人类帝国全人物关系图', { fitView: true }); 
            }
        });
        
        // Merged V12 Logic: Multi-level drill-down click handler
        myChart.on('click', (params) => {
            if (params.dataType === 'node' && params.data.id !== currentGraphId) {
                switch (params.data.id) {
                    case '最高委员会':
                        if (window.sovietData) renderGraph(window.sovietData, '最高委员会内部关系图', { fitView: true });
                        break;
                    case '帝国情报局':
                        if (window.intelData) renderGraph(window.intelData, '帝国情报局内部关系图', { fitView: true });
                        break;
                    case '海事警戒局':
                        if (window.navyData) renderGraph(window.navyData, '海事警戒局内部关系图', { fitView: true });
                        break;
                    case '科技部':
                        if (window.scienceData) renderGraph(window.scienceData, '科技部内部关系图', { fitView: true });
                        break;
                }
            }
        });
        
        myChart.on('legendselectchanged', (params) => {
            console.log('[legendselectchanged] Detected:', params.name);
            if (hasStableLayout(currentGraphId)) {
                ultraIntelligentFitView(myChart, true);
                return;
            }

            forceRelayout(myChart, () => {
                ultraIntelligentFitView(myChart, true);
            });
        });

        let resizeTimer;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                if (myChart) {
                    myChart.resize();
                    console.log('[resize] Applying responsive fit...');
                    ultraIntelligentFitView(myChart, false);
                }
            }, 300);
        });

        // 订阅全局主题变化：只重刷配色，不再重新布局
        if (window.AppTheme && typeof AppTheme.subscribe === 'function') {
            if (themeUnsubscribe) {
                themeUnsubscribe();
                themeUnsubscribe = null;
            }
            themeUnsubscribe = AppTheme.subscribe((newTheme) => {
                if (!myChart) return;
                const data = getCurrentGraphData();
                if (!data) return;

                console.log('[RelationshipGraph] Theme changed to', newTheme, ', updating graph colors...');
                renderGraph(data, currentTitle || '人类帝国全人物关系图', { fitView: false });
            });
        }

        setTimeout(() => {
            if (window.allCharactersData) { 
                renderGraph(window.allCharactersData, '人类帝国全人物关系图', { fitView: true }); 
            } else { 
                console.error('[init] Data not ready'); 
            }
        }, 100);
    };
    
    const start = (containerId) => {
        if (!myChart) { 
            init(containerId); 
        } else {
            myChart.resize();
            const currentData = getCurrentGraphData();
            if (currentData) { 
                renderGraph(currentData, currentTitle || '人类帝国全人物关系图', { fitView: false }); 
            }
        }
    };

    const refreshView = () => {
        if (myChart) {
            if (hasStableLayout(currentGraphId)) {
                ultraIntelligentFitView(myChart, true);
                return;
            }

            forceRelayout(myChart, () => {
                ultraIntelligentFitView(myChart, true);
            });
        }
    };

    return { start, refreshView };
})();

window.RelationshipGraph = RelationshipGraph;
