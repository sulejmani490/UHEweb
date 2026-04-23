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
            lineColor: isDark ? 'rgba(255,255,255,0.35)' : '#aaaaaa', // 默认连线颜色
        };
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
            
            const symbolSize = (data.symbolSize || 30) * config.nodeScale;
            const radius = (Array.isArray(symbolSize) ? Math.max(symbolSize[0], symbolSize[1]) : symbolSize) / 2;
            
            nodeBounds.minX = Math.min(nodeBounds.minX, x - radius);
            nodeBounds.maxX = Math.max(nodeBounds.maxX, x + radius);
            nodeBounds.minY = Math.min(nodeBounds.minY, y - radius);
            nodeBounds.maxY = Math.max(nodeBounds.maxY, y + radius);
            
            const labelText = data.name || '';
            const realTextWidth = measureTextWidth(labelText, fontSize);
            const textHeight = fontSize;
            
            const labelStartX = x + radius + 5;
            const labelEndX = labelStartX + realTextWidth;
            const labelTopY = y - textHeight / 2;
            const labelBottomY = y + textHeight / 2;
            
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

    // 新版 getOption：根据主题生成配色
    const getOption = (data, title, themeName) => {
        const config = deviceConfig();
        const theme = themeName || getCurrentTheme();
        const colors = getThemeColors(theme);

        console.log(`[getOption] Building config for ${config.isMobile ? 'Mobile' : config.isTablet ? 'Tablet' : 'Desktop'} device, theme=${theme}`);

        const processedNodes = data.nodes.map((node) => ({
            ...node,
            symbolSize: node.symbolSize * config.nodeScale,
            label: { 
                ...(node.label || {}), 
                show: !config.isMobile || node.symbolSize > 60,
                fontSize: Math.floor(12 * config.labelScale),
                position: 'right',
                color: colors.baseText,
                fontWeight: node.id === '最高委员会' ? 'bold' : 'normal'
            }
        }));

        return {
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
                layout: 'force', 
                data: processedNodes, 
                links: data.links, 
                categories: window.graphCategories || [],
                roam: true, 
                draggable: !config.isMobile,
                focusNodeAdjacency: true,
                blur: { lineStyle: { opacity: 0.1 }, itemStyle: { opacity: 0.3 } },
                labelLayout: { hideOverlap: true, moveOverlap: 'shiftY' },
                lineStyle: { 
                    color: colors.lineColor,
                    curveness: 0, // V10: Using straight lines for clarity
                    width: config.isMobile ? 1 : 1.5, 
                    opacity: 0.7 
                },
                // V12 Feature: Adding arrows to edges
                edgeSymbol: ['none', 'arrow'],
                edgeSymbolSize: config.isMobile ? 6 : 8,
                force: {
                    repulsion: config.repulsion, 
                    edgeLength: config.edgeLength, 
                    gravity: 0.05, 
                    friction: 0.7,
                    layoutAnimation: false,
                },
                emphasis: { 
                    focus: 'adjacency', 
                    label: { show: true }, 
                    lineStyle: { 
                        width: config.isMobile ? 2 : 3, 
                        opacity: 1 
                    }
                },
                left: config.isMobile ? '5%' : '0%', 
                right: config.isMobile ? '5%' : '0%', 
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
                const data =
                    (window.allGraphData && window.allGraphData[currentGraphId]) ||
                    window.allCharactersData;
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
            const currentData = (window.allGraphData && window.allGraphData[currentGraphId]) || window.allCharactersData;
            if (currentData) { 
                renderGraph(currentData, currentTitle || '人类帝国全人物关系图', { fitView: false }); 
            }
        }
    };

    const refreshView = () => {
        if (myChart) {
            forceRelayout(myChart, () => {
                ultraIntelligentFitView(myChart, true);
            });
        }
    };

    return { start, refreshView };
})();

window.RelationshipGraph = RelationshipGraph;
