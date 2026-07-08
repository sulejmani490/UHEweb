// script.js - (V2.3.5: Logo Visibility Fix)


// === CMS：从后端拉取档案数据 ===
// Local development may serve the page and the CMS API from different ports.
const CONTENT_API_BASE = window.appConfig?.CONTENT_API_BASE || '';
const WEBSITE_DATA_ENDPOINT = `${CONTENT_API_BASE}/content-api/website-data`;
const LOCAL_WEBSITE_DATA_ENDPOINT = '/website-data.json';
const DEFAULT_ICP_URL = 'https://beian.miit.gov.cn/';

let websiteData = { categories: [] };

function getSiteSettings(data = websiteData) {
    return data && typeof data.siteSettings === 'object' && !Array.isArray(data.siteSettings)
        ? data.siteSettings
        : {};
}

function normalizeIcpUrl(value) {
    const rawValue = String(value || '').trim();
    if (!rawValue) return DEFAULT_ICP_URL;
    if (/^(?:https?:)?\/\//i.test(rawValue)) return rawValue;
    return `https://${rawValue.replace(/^\/+/, '')}`;
}

function renderIcpFooter() {
    const footer = document.getElementById('icp-footer');
    const link = document.getElementById('icp-link');
    if (!footer || !link) return;

    const settings = getSiteSettings();
    const icpNumber = String(settings.icpNumber || '').trim();
    if (!icpNumber) {
        footer.hidden = true;
        link.textContent = '';
        link.removeAttribute('href');
        return;
    }

    link.textContent = icpNumber;
    link.href = normalizeIcpUrl(settings.icpUrl);
    footer.hidden = false;
}

function isValidWebsiteDataPayload(data) {
    return !!data && Array.isArray(data.categories);
}

async function fetchWebsiteDataFrom(url) {
    const resp = await fetch(url, { cache: 'no-cache' });
    if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
    }

    const data = await resp.json();
    if (!isValidWebsiteDataPayload(data)) {
        throw new Error('后端返回的 website-data 格式不对，缺少 categories 数组');
    }

    return data;
}

async function loadWebsiteData() {
    const sources = [WEBSITE_DATA_ENDPOINT];
    const isLocalHost = ['localhost', '127.0.0.1'].includes(
        window.location.hostname
    );

    // Live Server 本地预览时，前台可能先于 cms-server.js 启动。
    // 回退到静态 JSON 后，首页到二级页的浏览不会被后端缺席卡死。
    if (isLocalHost && !sources.includes(LOCAL_WEBSITE_DATA_ENDPOINT)) {
        sources.push(LOCAL_WEBSITE_DATA_ENDPOINT);
    }

    let lastError = null;

    for (const source of sources) {
        try {
            const data = await fetchWebsiteDataFrom(source);
            websiteData = data;
            window.__websiteData = websiteData; // 供其它模块/调试使用（不影响原逻辑）
            renderIcpFooter();
            console.log(
                `[CMS] website data 加载成功，来源 ${source}，分类数:`,
                websiteData.categories.length
            );
            return;
        } catch (err) {
            lastError = err;
            console.warn(`[CMS] website-data 加载失败，来源 ${source}:`, err);
        }
    }

    console.error('[CMS] 加载 website-data 失败，将使用空数据集:', lastError);
    websiteData = { categories: [] };
    renderIcpFooter();
}

// --- 1. 全局状态与元素获取 ---
const appState = {
    isNavigating: false,
    currentListMode: 'list',
    currentPage: 0,
    isScrolling: false,
    isEchartsLoaded: false,
    isG6Loaded: false,
    isCharacterArchiveLoaded: false,
    hasInitialized: false,
    landingIntroTimer: null,
    imageLightbox: null,
    timelineFocusByCategory: {},
    activeCharterSelections: {},
    activeLawHistoryPanels: {},
};
const logo = document.getElementById('logo');





// 明暗主题切换按钮
const themeToggleButton = document.getElementById('theme-toggle');
const themeToggleIcon = themeToggleButton
  ? themeToggleButton.querySelector('.theme-toggle-icon')
  : null;

function updateThemeToggleUI(theme) {
    if (!themeToggleButton || !themeToggleIcon) return;

    if (theme === 'dark') {
        themeToggleIcon.textContent = '☀'; // 暗色时显示“切换到亮色”的符号
        themeToggleButton.setAttribute('aria-label', '切换为亮色主题');
    } else {
        themeToggleIcon.textContent = '☾'; // 亮色时显示“切换到暗色”
        themeToggleButton.setAttribute('aria-label', '切换为暗色主题');
    }
}

// 订阅全局主题变化，初始化按钮状态
if (window.AppTheme && themeToggleButton) {
    AppTheme.subscribe(updateThemeToggleUI);

    themeToggleButton.addEventListener('click', () => {
        AppTheme.toggle({ user: true });
    });
} else {
    console.warn('[ThemeToggle] AppTheme 或 theme-toggle 按钮不存在，跳过主题按钮初始化。');
}



const views = {
    '#landing-view': document.getElementById('landing-view'),
    '#library-view': document.getElementById('library-view'),
    '#category-view': document.getElementById('category-view'),
    '#law-hub-view': document.getElementById('law-hub-view'),
    '#law-detail-view': document.getElementById('law-detail-view'),
    '#list-view': document.getElementById('list-view'),
    '#timeline-view': document.getElementById('timeline-view'),
    '#detail-view': document.getElementById('detail-view'),
    '#reader-view': document.getElementById('reader-view'),
};

const DEFAULT_PLACEHOLDER_IMAGE = '/images/placeholder.png';

const resolveAssetPath = (value, fallback = DEFAULT_PLACEHOLDER_IMAGE) => {
    const rawValue = String(value || '').trim();
    if (!rawValue) return fallback;

    if (
        /^(?:[a-z]+:)?\/\//i.test(rawValue) ||
        rawValue.startsWith('data:') ||
        rawValue.startsWith('blob:')
    ) {
        return rawValue;
    }

    return rawValue.startsWith('/')
        ? rawValue
        : `/${rawValue.replace(/^\.?\//, '')}`;
};

const stripRouteMarkup = (value) =>
    String(value || '')
        .replace(/\[\[link\|[^|]+\|[^|]+\|(.+?)\]\]/g, '$1')
        .replace(/\[\[\w+\|(.+?)\]\]/g, '$1')
        .trim();

const slugifyRouteSegment = (value) =>
    stripRouteMarkup(value)
        .toLowerCase()
        .replace(/&/g, ' and ')
        .replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, '-')
        .replace(/^-+|-+$/g, '');

const getCategoryRouteKey = (category, catIndex) => {
    const explicitId = String(category?.id || '').trim();
    if (explicitId) {
        return explicitId.toLowerCase();
    }

    const titleSlug = slugifyRouteSegment(category?.title);
    return titleSlug ? `${titleSlug}-${catIndex}` : `category-${catIndex}`;
};

const findCategoryIndexByRouteKey = (routeKey) => {
    const normalizedKey = String(routeKey || '')
        .trim()
        .toLowerCase();
    if (!normalizedKey) {
        return null;
    }

    if (/^\d+$/.test(normalizedKey)) {
        const numericIndex = Number(normalizedKey);
        return websiteData.categories[numericIndex] ? numericIndex : null;
    }

    for (let catIndex = 0; catIndex < websiteData.categories.length; catIndex += 1) {
        const category = websiteData.categories[catIndex];
        if (getCategoryRouteKey(category, catIndex) === normalizedKey) {
            return catIndex;
        }
    }

    return null;
};

const getRouteCategoryIndex = (preferredKey, fallbackCategoryId = null) => {
    const matchedIndex = findCategoryIndexByRouteKey(preferredKey);
    if (matchedIndex !== null) {
        return matchedIndex;
    }

    if (fallbackCategoryId) {
        const fallbackIndex = websiteData.categories.findIndex(
            (category) => category?.id === fallbackCategoryId
        );
        return fallbackIndex !== -1 ? fallbackIndex : null;
    }

    return null;
};

const getCategoryRootItems = (category) => {
    if (Array.isArray(category?.items)) {
        return category.items;
    }
    if (Array.isArray(category?.eras)) {
        return category.eras;
    }
    return [];
};

const getNodeBaseRouteKey = (node, siblingIndex, fallbackPrefix = 'item') => {
    const explicitKey = String(node?.slug || node?.id || '').trim();
    if (explicitKey) {
        const slug = slugifyRouteSegment(explicitKey);
        if (slug) return slug;
    }

    const titleSlug = slugifyRouteSegment(node?.title);
    if (titleSlug) {
        return titleSlug;
    }

    return `${fallbackPrefix}-${siblingIndex + 1}`;
};

const getSiblingRouteKey = (siblings, targetIndex, fallbackPrefix = 'item') => {
    const baseKey = getNodeBaseRouteKey(
        siblings[targetIndex],
        targetIndex,
        fallbackPrefix
    );
    const duplicateCount = siblings.filter(
        (node, siblingIndex) =>
            getNodeBaseRouteKey(node, siblingIndex, fallbackPrefix) === baseKey
    ).length;

    if (duplicateCount <= 1) {
        return baseKey;
    }

    let occurrence = 0;
    for (let siblingIndex = 0; siblingIndex <= targetIndex; siblingIndex += 1) {
        if (
            getNodeBaseRouteKey(
                siblings[siblingIndex],
                siblingIndex,
                fallbackPrefix
            ) === baseKey
        ) {
            occurrence += 1;
        }
    }

    return `${baseKey}-${occurrence}`;
};

const findSiblingIndexByRouteKey = (
    siblings,
    segment,
    fallbackPrefix = 'item'
) => {
    const normalizedSegment = decodeURIComponent(String(segment || ''))
        .trim()
        .toLowerCase();
    if (!normalizedSegment) {
        return -1;
    }

    return siblings.findIndex(
        (node, siblingIndex) =>
            getSiblingRouteKey(siblings, siblingIndex, fallbackPrefix) ===
            normalizedSegment
    );
};

const getItemPathSegments = (itemPath) =>
    String(itemPath || '')
        .split('.')
        .filter((part) => part !== '')
        .map((part) => Number(part))
        .filter((part) => Number.isInteger(part));

const getItemTrailFromPath = (catIndex, itemPath) => {
    const category = websiteData.categories[catIndex];
    if (!category) {
        return [];
    }

    const indices = getItemPathSegments(itemPath);
    const trail = [];
    let siblings = getCategoryRootItems(category);

    for (const nodeIndex of indices) {
        if (!Array.isArray(siblings) || !siblings[nodeIndex]) {
            return [];
        }

        const node = siblings[nodeIndex];
        trail.push({
            node,
            index: nodeIndex,
            siblings,
        });
        siblings = Array.isArray(node?.subItems) ? node.subItems : [];
    }

    return trail;
};

const buildItemRouteSegments = (catIndex, itemPath, fallbackPrefix = 'item') =>
    getItemTrailFromPath(catIndex, itemPath).map((step) =>
        getSiblingRouteKey(step.siblings, step.index, fallbackPrefix)
    );

const findItemPathByRouteSegments = (
    catIndex,
    segments,
    fallbackPrefix = 'item'
) => {
    const category = websiteData.categories[catIndex];
    if (!category) {
        return null;
    }

    const normalizedSegments = segments
        .map((segment) => decodeURIComponent(String(segment || '')).trim())
        .filter(Boolean);

    if (!normalizedSegments.length) {
        return null;
    }

    let siblings = getCategoryRootItems(category);
    const pathIndices = [];

    for (const segment of normalizedSegments) {
        if (!Array.isArray(siblings) || !siblings.length) {
            return null;
        }

        const siblingIndex = findSiblingIndexByRouteKey(
            siblings,
            segment,
            fallbackPrefix
        );
        if (siblingIndex === -1) {
            return null;
        }

        pathIndices.push(siblingIndex);
        siblings = Array.isArray(siblings[siblingIndex]?.subItems)
            ? siblings[siblingIndex].subItems
            : [];
    }

    return pathIndices.join('.');
};

const getBranchRouteSegment = (category, branchIndex) =>
    getSiblingRouteKey(category?.branches || [], branchIndex, 'branch');

const findBranchIndexByRouteSegment = (category, segment) =>
    findSiblingIndexByRouteKey(category?.branches || [], segment, 'branch');

const getBranchEventRouteSegment = (branch, eventIndex) =>
    getSiblingRouteKey(branch?.events || [], eventIndex, 'event');

const findBranchEventIndexByRouteSegment = (branch, segment) =>
    findSiblingIndexByRouteKey(branch?.events || [], segment, 'event');

const buildRouteUrl = (state) => {
    const safeState =
        state && typeof state === 'object' && state.viewId
            ? state
            : DEFAULT_ROUTE_STATE;
    const stateHistory = Array.isArray(safeState.history) ? safeState.history : [];
    const categoryCrumb = stateHistory.find((crumb) => crumb.type === 'category');
    const itemCrumb = stateHistory.find((crumb) => crumb.type === 'item');
    const lawSectionCrumb = stateHistory.find(
        (crumb) => crumb.type === 'lawSection'
    );
    const lawHistoryCrumb = stateHistory.find(
        (crumb) => crumb.type === 'lawHistory'
    );
    const branchCrumb = stateHistory.find(
        (crumb) => crumb.type === 'branchEvent'
    );
    const novelCrumb = stateHistory.find((crumb) => crumb.type === 'novel');
    const category =
        categoryCrumb &&
        Number.isInteger(categoryCrumb.catIndex) &&
        websiteData.categories[categoryCrumb.catIndex]
            ? websiteData.categories[categoryCrumb.catIndex]
            : null;
    const categoryKey = category
        ? encodeURIComponent(
              getCategoryRouteKey(category, categoryCrumb.catIndex)
          )
        : '';

    switch (safeState.viewId) {
        case '#library-view':
            return '/library';
        case '#category-view':
            return '/categories';
        case '#law-hub-view': {
            const routeSegments = ['laws'];
            if (categoryCrumb && lawSectionCrumb?.itemPath !== undefined && lawSectionCrumb.itemPath !== '') {
                const sectionSegments = buildItemRouteSegments(
                    categoryCrumb.catIndex,
                    lawSectionCrumb.itemPath,
                    'section'
                );
                if (sectionSegments[0]) {
                    routeSegments.push(encodeURIComponent(sectionSegments[0]));
                }
            }
            return `/${routeSegments.join('/')}`;
        }
        case '#law-detail-view': {
            const routeSegments = ['laws'];
            if (categoryCrumb && itemCrumb?.itemPath) {
                const lawSegments = buildItemRouteSegments(
                    categoryCrumb.catIndex,
                    itemCrumb.itemPath,
                    'law'
                );
                if (lawSegments.length) {
                    routeSegments.push(
                        ...lawSegments.map((segment) =>
                            encodeURIComponent(segment)
                        )
                    );
                    const lawNode = getItemByPath(
                        itemCrumb.itemPath,
                        categoryCrumb.catIndex
                    );
                    if (
                        lawNode &&
                        Number.isInteger(lawHistoryCrumb?.historyIndex)
                    ) {
                        const historySegment = getLawHistoryRouteSegment(
                            lawNode,
                            lawHistoryCrumb.historyIndex
                        );
                        if (historySegment) {
                            routeSegments.push(
                                'archive',
                                encodeURIComponent(historySegment)
                            );
                        }
                    }
                }
            } else if (
                categoryCrumb &&
                lawSectionCrumb?.itemPath !== undefined &&
                lawSectionCrumb.itemPath !== ''
            ) {
                const sectionSegments = buildItemRouteSegments(
                    categoryCrumb.catIndex,
                    lawSectionCrumb.itemPath,
                    'section'
                );
                if (sectionSegments[0]) {
                    routeSegments.push(encodeURIComponent(sectionSegments[0]));
                }
            }
            return `/${routeSegments.join('/')}`;
        }
        case '#list-view':
            return categoryKey ? `/list/${categoryKey}` : '/categories';
        case '#timeline-view':
            return categoryKey ? `/timeline/${categoryKey}` : '/categories';
        case '#detail-view':
            if (branchCrumb) {
                const branch = category?.branches?.[branchCrumb.branchIndex];
                const event = branch?.events?.[branchCrumb.eventIndex];
                const branchSegment = branch
                    ? encodeURIComponent(
                          getBranchRouteSegment(category, branchCrumb.branchIndex)
                      )
                    : String(branchCrumb.branchIndex);
                const eventSegment = event
                    ? encodeURIComponent(
                          getBranchEventRouteSegment(
                              branch,
                              branchCrumb.eventIndex
                          )
                      )
                    : String(branchCrumb.eventIndex);
                return categoryKey
                    ? `/branch/${categoryKey}/${branchSegment}/${eventSegment}`
                    : '/categories';
            }
            if (categoryKey && itemCrumb?.itemPath) {
                const detailSegments = buildItemRouteSegments(
                    categoryCrumb.catIndex,
                    itemCrumb.itemPath,
                    'detail'
                );
                if (detailSegments.length) {
                    return `/detail/${categoryKey}/${detailSegments
                        .map((segment) => encodeURIComponent(segment))
                        .join('/')}`;
                }
            }
            return '/categories';
        case '#reader-view':
            if (novelCrumb?.novelId) {
                const routeSegments = [
                    'reader',
                    encodeURIComponent(String(novelCrumb.novelId)),
                ];
                if (novelCrumb?.paragraphId) {
                    routeSegments.push(
                        encodeURIComponent(String(novelCrumb.paragraphId))
                    );
                }
                return `/${routeSegments.join('/')}`;
            }
            return '/reader';
        case '#landing-view':
        default:
            return '/';
    }
};

const parseLegacyStateFromHash = (rawHash) => {
    const normalizedHash = String(rawHash || '').trim();
    const matchedViewId = KNOWN_VIEW_IDS.find(
        (viewId) =>
            normalizedHash === viewId || normalizedHash.startsWith(`${viewId}[`)
    );

    if (!matchedViewId) {
        return null;
    }

    const serializedHistory = normalizedHash.slice(matchedViewId.length).trim();
    if (!serializedHistory) {
        return { viewId: matchedViewId, history: [] };
    }

    try {
        const parsedHistory = JSON.parse(serializedHistory);
        return {
            viewId: matchedViewId,
            history: Array.isArray(parsedHistory) ? parsedHistory : [],
        };
    } catch (error) {
        console.warn('[Router] Failed to parse legacy route hash:', error);
        return { viewId: matchedViewId, history: [] };
    }
};

const parseRouteStateFromLocation = () => {
    const pathname = decodeURIComponent(String(window.location.pathname || '/'));
    const routePath = pathname.replace(/\/+$/, '') || '/';
    const pathSegments = routePath
        .split('/')
        .map((segment) => segment.trim())
        .filter(Boolean);

    // Backward compatibility: older links still use hash-based routes.
    if (!pathSegments.length) {
        const rawHash = String(window.location.hash || '').trim();
        const legacyState =
            parseLegacyStateFromHash(rawHash) ||
            (() => {
                if (!rawHash || rawHash === '#') return null;
                const normalizedHash = rawHash.replace(/^#/, '');
                const [hashPath, hashQuery = ''] = normalizedHash.split('?');
                const normalizedHashPath = hashPath || '/';
                const hashParams = new URLSearchParams(hashQuery);
                return { normalizedHashPath, hashParams };
            })();

        if (legacyState && legacyState.viewId) {
            return legacyState;
        }

        if (
            legacyState &&
            typeof legacyState === 'object' &&
            legacyState.normalizedHashPath
        ) {
            const normalizedHashPath = legacyState.normalizedHashPath;
            const hashParams = legacyState.hashParams;

            if (normalizedHashPath === '/library') {
                return { viewId: '#library-view', history: [{ type: 'library' }] };
            }
            if (
                normalizedHashPath === '/categories' ||
                normalizedHashPath === '/category'
            ) {
                return { viewId: '#category-view', history: [] };
            }
            if (normalizedHashPath === '/list') {
                const catIndex = getRouteCategoryIndex(hashParams.get('c'));
                return catIndex === null
                    ? { viewId: '#category-view', history: [] }
                    : {
                          viewId: '#list-view',
                          history: [{ type: 'category', catIndex }],
                      };
            }
            if (normalizedHashPath === '/timeline') {
                const catIndex = getRouteCategoryIndex(hashParams.get('c'));
                return catIndex === null
                    ? { viewId: '#category-view', history: [] }
                    : {
                          viewId: '#timeline-view',
                          history: [{ type: 'category', catIndex }],
                      };
            }
            if (normalizedHashPath === '/laws') {
                const catIndex = getRouteCategoryIndex(
                    hashParams.get('c'),
                    LAW_CATEGORY_ID
                );
                return catIndex === null
                    ? { viewId: '#category-view', history: [] }
                    : getLawHubState(catIndex, hashParams.get('s'));
            }
            if (normalizedHashPath === '/law') {
                const catIndex = getRouteCategoryIndex(
                    hashParams.get('c'),
                    LAW_CATEGORY_ID
                );
                if (catIndex === null) {
                    return { viewId: '#category-view', history: [] };
                }

                const itemPath = String(hashParams.get('i') || '').trim();
                if (!itemPath) {
                    return getLawHubState(catIndex, hashParams.get('s'));
                }

                const sectionPath =
                    String(hashParams.get('s') || '').trim() ||
                    getLawSectionPathFromLawPath(itemPath);
                const historyIndex = Number(hashParams.get('h'));

                return {
                    viewId: '#law-detail-view',
                    history: [
                        { type: 'category', catIndex },
                        ...(sectionPath
                            ? [{ type: 'lawSection', catIndex, itemPath: sectionPath }]
                            : []),
                        { type: 'item', catIndex, itemPath },
                        ...(Number.isInteger(historyIndex) && historyIndex >= 0
                            ? [
                                  {
                                      type: 'lawHistory',
                                      catIndex,
                                      itemPath,
                                      historyIndex,
                                  },
                              ]
                            : []),
                    ],
                };
            }
            if (normalizedHashPath === '/detail') {
                const catIndex = getRouteCategoryIndex(hashParams.get('c'));
                const itemPath = String(hashParams.get('i') || '').trim();
                return catIndex === null || !itemPath
                    ? { viewId: '#category-view', history: [] }
                    : {
                          viewId: '#detail-view',
                          history: [
                              { type: 'category', catIndex },
                              { type: 'item', catIndex, itemPath },
                          ],
                      };
            }
            if (normalizedHashPath === '/branch') {
                const catIndex = getRouteCategoryIndex(hashParams.get('c'));
                const branchIndex = Number(hashParams.get('b'));
                const eventIndex = Number(hashParams.get('e'));
                return catIndex === null ||
                    !Number.isInteger(branchIndex) ||
                    !Number.isInteger(eventIndex)
                    ? { viewId: '#category-view', history: [] }
                    : {
                          viewId: '#detail-view',
                          history: [
                              { type: 'category', catIndex },
                              {
                                  type: 'branchEvent',
                                  catIndex,
                                  branchIndex,
                                  eventIndex,
                              },
                          ],
                      };
            }
            if (normalizedHashPath === '/reader') {
                const novelId = String(hashParams.get('n') || '').trim();
                const paragraphId = String(hashParams.get('p') || '').trim();
                return !novelId
                    ? DEFAULT_ROUTE_STATE
                    : {
                          viewId: '#reader-view',
                          history: [
                              {
                                  type: 'novel',
                                  novelId,
                                  paragraphId: paragraphId || null,
                              },
                          ],
                      };
            }
        }
    }

    const [rootSegment, secondSegment, thirdSegment, fourthSegment, fifthSegment] =
        pathSegments;

    switch (rootSegment || '') {
        case '':
            return DEFAULT_ROUTE_STATE;
        case 'home':
        case 'landing':
            return DEFAULT_ROUTE_STATE;
        case 'library':
            return { viewId: '#library-view', history: [{ type: 'library' }] };
        case 'categories':
        case 'category':
            return { viewId: '#category-view', history: [] };
        case 'list': {
            const catIndex = getRouteCategoryIndex(secondSegment);
            return catIndex === null
                ? { viewId: '#category-view', history: [] }
                : {
                      viewId: '#list-view',
                      history: [{ type: 'category', catIndex }],
                  };
        }
        case 'timeline': {
            const catIndex = getRouteCategoryIndex(secondSegment);
            return catIndex === null
                ? { viewId: '#category-view', history: [] }
                : {
                      viewId: '#timeline-view',
                      history: [{ type: 'category', catIndex }],
                  };
        }
        case 'laws': {
            const catIndex = getRouteCategoryIndex(
                LAW_CATEGORY_ID,
                LAW_CATEGORY_ID
            );
            if (catIndex === null) {
                return { viewId: '#category-view', history: [] };
            }

            if (!secondSegment) {
                return getLawHubState(catIndex, null);
            }

            if (thirdSegment) {
                const itemPath = findItemPathByRouteSegments(
                    catIndex,
                    [secondSegment, thirdSegment].filter(Boolean),
                    'law'
                );
                if (itemPath) {
                    const sectionPath = getLawSectionPathFromLawPath(itemPath);
                    const lawNode = getItemByPath(itemPath, catIndex);
                    const historyCrumbs =
                        fourthSegment === 'archive' && fifthSegment && lawNode
                            ? (() => {
                                  const historyIndex =
                                      findLawHistoryIndexByRouteSegment(
                                          lawNode,
                                          fifthSegment
                                      );
                                  return historyIndex >= 0
                                      ? [
                                            {
                                                type: 'lawHistory',
                                                catIndex,
                                                itemPath,
                                                historyIndex,
                                            },
                                        ]
                                      : [];
                              })()
                            : [];
                    return {
                        viewId: '#law-detail-view',
                        history: [
                            { type: 'category', catIndex },
                            ...(sectionPath
                                ? [{ type: 'lawSection', catIndex, itemPath: sectionPath }]
                                : []),
                            { type: 'item', catIndex, itemPath },
                            ...historyCrumbs,
                        ],
                    };
                }
            }

            const sectionPath = findItemPathByRouteSegments(
                catIndex,
                [secondSegment],
                'section'
            );
            return getLawHubState(catIndex, sectionPath || null);
        }
        case 'detail': {
            const catIndex = getRouteCategoryIndex(secondSegment);
            const itemPath = findItemPathByRouteSegments(
                catIndex,
                pathSegments.slice(2),
                'detail'
            );
            if (
                catIndex === null ||
                itemPath === null ||
                itemPath === undefined ||
                itemPath === ''
            ) {
                return { viewId: '#category-view', history: [] };
            }

            return {
                viewId: '#detail-view',
                history: [
                    { type: 'category', catIndex },
                    { type: 'item', catIndex, itemPath },
                ],
            };
        }
        case 'branch': {
            const catIndex = getRouteCategoryIndex(secondSegment);
            const category =
                catIndex !== null ? websiteData.categories[catIndex] : null;
            const branchIndex = category
                ? findBranchIndexByRouteSegment(category, thirdSegment)
                : -1;
            const branch =
                branchIndex !== -1 ? category?.branches?.[branchIndex] : null;
            const eventIndex = branch
                ? findBranchEventIndexByRouteSegment(branch, fourthSegment)
                : -1;

            if (
                catIndex === null ||
                branchIndex === -1 ||
                eventIndex === -1
            ) {
                return { viewId: '#category-view', history: [] };
            }

            return {
                viewId: '#detail-view',
                history: [
                    { type: 'category', catIndex },
                    { type: 'branchEvent', catIndex, branchIndex, eventIndex },
                ],
            };
        }
        case 'reader': {
            const novelId = decodeURIComponent(String(secondSegment || '')).trim();
            const paragraphId = decodeURIComponent(String(thirdSegment || '')).trim();
            if (!novelId) {
                return DEFAULT_ROUTE_STATE;
            }

            return {
                viewId: '#reader-view',
                history: [
                    {
                        type: 'novel',
                        novelId,
                        paragraphId: paragraphId || null,
                    },
                ],
            };
        }
        default:
            return DEFAULT_ROUTE_STATE;
    }
};

const areStatesEquivalent = (leftState, rightState) =>
    String(leftState?.viewId || '') === String(rightState?.viewId || '') &&
    JSON.stringify(leftState?.history || []) ===
        JSON.stringify(rightState?.history || []);

for (const key in views) {
    if (!views[key]) {
        console.error(`启动失败：未在 index.html 中找到元素 ${key}。请检查ID是否正确。`);
    }
}

const pageScroller = document.querySelector('.page-scroller');
const sections = document.querySelectorAll('.page-section');
const totalPages = sections.length;

let currentViewId = '#landing-view';
let currentHistory = [];
let g6TreeInstance = null;
const KNOWN_VIEW_IDS = [
    '#landing-view',
    '#library-view',
    '#category-view',
    '#law-hub-view',
    '#law-detail-view',
    '#list-view',
    '#timeline-view',
    '#detail-view',
    '#reader-view',
];

// Dedicated configuration for the Empire Laws experience.
// The data lives in the same website-data.json tree as the rest of the site,
// but the rendering is custom so the page can mimic a codex / statute board.
const LAW_CATEGORY_ID = 'laws';
const DEFAULT_ROUTE_STATE = { viewId: '#landing-view', history: [] };

function revealLandingIntro(delayMs = 100) {
    const intro = document.getElementById('intro');
    if (!intro) return;

    if (appState.landingIntroTimer) {
        clearTimeout(appState.landingIntroTimer);
    }

    appState.landingIntroTimer = setTimeout(() => {
        intro.classList.add('visible');
        appState.landingIntroTimer = null;
    }, delayMs);
}

// Centralized boot-time tuning values.
// Keep frequently adjusted startup behavior here so you can tune perceived speed
// without searching through the rest of the file.
const APP_BOOT_CONFIG = {
    // Delay before lazily loading heavy second-screen modules during scroll.
    sectionLoadDelayMs: 1200,
    // Shared transition duration for view enter/leave animations.
    viewTransitionMs: 500,
    // Idle budget for low-priority novel manifest prefetch.
    novelManifestIdleTimeoutMs: 2000,
    // Fallback delay when requestIdleCallback is unavailable.
    novelManifestFallbackDelayMs: 800,
    // CDN used for the chart dependency on the graph page.
    graphCdnUrl: 'https://cdn.jsdelivr.net/npm/echarts@5.5.0/dist/echarts.min.js',
    // CDN used for the G6 dependency on the relationship tree page.
    g6CdnUrl: 'https://unpkg.com/@antv/g6@4.8.24/dist/g6.min.js',
};
window.APP_BOOT_CONFIG = APP_BOOT_CONFIG;

const scriptLoadPromises = new Map();

// --- 动态脚本加载工具函数 ---
const loadScript = (src) => {
    if (scriptLoadPromises.has(src)) {
        return scriptLoadPromises.get(src);
    }

    const existingScript = document.querySelector(`script[src="${src}"]`);
    if (existingScript?.dataset.loadState === 'loaded') {
        return Promise.resolve();
    }

    const promise = new Promise((resolve, reject) => {
        const script = existingScript || document.createElement('script');

        const cleanup = () => {
            script.removeEventListener('load', handleLoad);
            script.removeEventListener('error', handleError);
        };

        const handleLoad = () => {
            script.dataset.loadState = 'loaded';
            cleanup();
            resolve();
        };

        const handleError = () => {
            cleanup();
            scriptLoadPromises.delete(src);
            reject(new Error(`Failed to load script: ${src}`));
        };

        script.addEventListener('load', handleLoad, { once: true });
        script.addEventListener('error', handleError, { once: true });

        if (!existingScript) {
            script.src = src;
            script.dataset.loadState = 'loading';
            document.head.appendChild(script);
        }
    });

    scriptLoadPromises.set(src, promise);
    return promise;
};

// --- 全局导航器 ---
const globalNavigator = {
    gotoNovelLocation: (novelId, paragraphId) => {
        const existingNovelIndex = currentHistory.findIndex(h => h.type === 'novel');
        let baseHistory = currentHistory;

        if (existingNovelIndex !== -1) {
            baseHistory = currentHistory.slice(0, existingNovelIndex);
        }
        
        const newState = {
            viewId: '#reader-view',
            history: [
                ...baseHistory,
                { type: 'novel', novelId: novelId, paragraphId: paragraphId }
            ]
        };
        
        if (appState.currentPage !== 0) {
            scrollToPage(0);
        }
        navigate(newState);
    }
};
window.globalNavigator = globalNavigator;

// --- 整页滚动逻辑 ---
const scrollToPage = (pageIndex) => {
    if (pageIndex < 0 || pageIndex >= totalPages || appState.isScrolling) return;
    appState.isScrolling = true;
    appState.currentPage = pageIndex;
    pageScroller.style.transform = `translateY(-${pageIndex * 100}vh)`;

    setTimeout(async () => {
        appState.isScrolling = false;
        if (pageIndex === 1) {
            const graphContainer = document.getElementById('relationship-graph-container');
            if (!graphContainer) return;

            try {
                // 1) 先确保 ECharts 已加载（CDN）
                if (!appState.isEchartsLoaded) {
                    graphContainer.innerHTML = `<div class="loading-placeholder">正在加载关系图谱模块...</div>`;
                    await loadScript(APP_BOOT_CONFIG.graphCdnUrl);
                    appState.isEchartsLoaded = true;
                    graphContainer.innerHTML = '';
                }

                // 2) 再按需加载本地图谱脚本（初始不阻塞首屏）
                if (!window.RelationshipGraph) {
                    graphContainer.innerHTML = `<div class="loading-placeholder">正在加载关系图谱数据...</div>`;
                    await loadScript('/graph-data.js');
                    await loadScript('/graph.js');
                    graphContainer.innerHTML = '';
                }

                // 3) 启动图谱
                if (window.RelationshipGraph) {
                    window.RelationshipGraph.start('relationship-graph-container');
                } else {
                    throw new Error('RelationshipGraph is not available after loading scripts.');
                }
            } catch (error) {
                console.error('关系图谱加载失败:', error);
                graphContainer.innerHTML = `<div class="loading-placeholder error">关系图谱模块加载失败，请刷新重试。</div>`;
            }
        } else if (pageIndex === 2) {
            const archiveRoot = document.getElementById('character-archive');
            if (!archiveRoot) return;

            try {
                if (window.CharacterArchive && typeof window.CharacterArchive.init === 'function') {
                    await window.CharacterArchive.init({ websiteData });
                    appState.isCharacterArchiveLoaded = true;
                } else {
                    throw new Error('CharacterArchive module not available. Check /app-modules.js.');
                }
            } catch (error) {
                console.error('人物档案加载失败:', error);
                const grid = document.getElementById('character-grid');
                if (grid) {
                    grid.innerHTML = `<div class="character-card placeholder"><div class="character-meta"><div class="character-name">加载失败</div><div class="character-snippet">人物档案模块加载失败，请刷新重试。</div></div></div>`;
                }
            }
        }

    }, APP_BOOT_CONFIG.sectionLoadDelayMs);
};

const handleScroll = (event) => {
    if (appState.isScrolling) { event.preventDefault(); return; }

    const delta = event.deltaY;

    // 仅在主页（Landing）允许从第 0 屏向下翻页，避免在其它视图滚轮误触
    if (appState.currentPage === 0) {
        const allowFromLanding = event.ctrlKey || currentViewId === '#landing-view';
        if (allowFromLanding && delta > 30) {
            scrollToPage(1);
        }
        return;
    }

    // 第 1/2/... 屏：允许上下翻页
    event.preventDefault();

    if (delta > 30 && appState.currentPage < totalPages - 1) {
        scrollToPage(appState.currentPage + 1);
    } else if (delta < -30 && appState.currentPage > 0) {
        scrollToPage(appState.currentPage - 1);
    }
};

const handleTouch = (() => {
    let startY = 0; let isMoving = false;
    return {
        start: (e) => {
            if (appState.isScrolling) return;
            startY = e.touches[0].clientY;
            isMoving = true;
        },
        move: (e) => {
            if (!isMoving || appState.isScrolling) return;
            const currentY = e.touches[0].clientY;
            const diff = startY - currentY; // >0: 向上滑（下一屏），<0: 向下滑（上一屏）

            if (appState.currentPage === 0) {
                if (currentViewId === '#landing-view' && diff > 50) {
                    scrollToPage(1);
                    isMoving = false;
                }
                return;
            }

            if (diff > 50 && appState.currentPage < totalPages - 1) {
                scrollToPage(appState.currentPage + 1);
                isMoving = false;
            } else if (diff < -50 && appState.currentPage > 0) {
                scrollToPage(appState.currentPage - 1);
                isMoving = false;
            }
        }
    };
})();

window.addEventListener('wheel', handleScroll, { passive: false });
window.addEventListener('touchstart', handleTouch.start, { passive: true });
window.addEventListener('touchmove', handleTouch.move, { passive: true });

// --- 辅助函数 ---
const parseAndColorText = (text) => {
    if (!text || typeof text !== 'string') return '';
    let html = text.replace(/\[\[(\w+)\|(.+?)\]\]/g, (match, colorName, content) => {
        const colorHex = window.colorPalette[colorName] || window.colorPalette.black;
        return `<span style="color: ${colorHex}; font-weight: inherit;">${content}</span>`;
    });
    html = html.replace(/\[\[link\|([\w\d\-_,，\s]+)\|([\w\d-]+)\|(.+?)\]\]/g, (match, novelId, paragraphId, content) => {
        return `<a href="#" class="novel-link" data-novel-id="${novelId.trim()}" data-goto-id="${paragraphId.trim()}">${content}</a>`;
    });
    return html;
};

const stripColorTags = (text) => {
    if (!text || typeof text !== 'string') return '';
    return text.replace(/\[\[\w+\|(.+?)\]\]/g, '$1');
};

const getItemByPath = (path, catIndex) => {
    if (path === null || path === undefined || catIndex === null || catIndex === undefined) return null;
    const category = websiteData.categories[catIndex];
    if (!category) return null;
    const rootItems = category.items || category.eras;
    if (!rootItems) return null;
    const indices = String(path).split('.').map(Number);
    let currentItems = rootItems;
    let item = null;
    for (const index of indices) {
        if (!currentItems || !currentItems[index]) return null;
        item = currentItems[index];
        currentItems = item.subItems;
    }
    return item;
};

const buildTimelineItemState = (catIndex, itemIndex) => ({
    viewId: '#detail-view',
    history: [
        { type: 'category', catIndex },
        { type: 'item', catIndex, itemPath: String(itemIndex) },
    ],
});

const buildTimelineBranchEventState = (catIndex, branchIndex, eventIndex) => ({
    viewId: '#detail-view',
    history: [
        { type: 'category', catIndex },
        { type: 'branchEvent', catIndex, branchIndex, eventIndex },
    ],
});

const getTimelineBranchEntryTargets = (stateHistory = []) => {
    const categoryCrumb = stateHistory.find((crumb) => crumb.type === 'category');
    const itemCrumb = stateHistory.find((crumb) => crumb.type === 'item');
    if (!categoryCrumb || !itemCrumb) return [];

    const catIndex = categoryCrumb.catIndex;
    const category = websiteData.categories[catIndex];
    if (!category || !Array.isArray(category.eras) || !Array.isArray(category.branches)) {
        return [];
    }

    const itemIndex = Number(String(itemCrumb.itemPath || '').split('.')[0]);
    if (!Number.isInteger(itemIndex)) return [];

    return category.branches
        .map((branch, branchIndex) => ({ branch, branchIndex }))
        .filter(({ branch }) => Number(branch?.fromEraIndex ?? -1) === itemIndex)
        .map(({ branch, branchIndex }) => {
            const events = Array.isArray(branch.events) ? branch.events : [];
            const firstEvent = events[0] || null;
            if (!firstEvent && !branch?.details) return null;

            return {
                branchIndex,
                eventIndex: 0,
                branchTitle: branch.title || '时间支线',
                eventTitle: firstEvent?.title || branch.title || '进入支线',
                eventCount: Math.max(events.length, 1),
                state: buildTimelineBranchEventState(catIndex, branchIndex, 0),
            };
        })
        .filter(Boolean);
};

const getTimelineBranchReturnTarget = (stateHistory = []) => {
    const categoryCrumb = stateHistory.find((crumb) => crumb.type === 'category');
    const branchCrumb = stateHistory.find((crumb) => crumb.type === 'branchEvent');
    if (!categoryCrumb || !branchCrumb) return null;

    const catIndex = categoryCrumb.catIndex;
    const category = websiteData.categories[catIndex];
    const branch = Array.isArray(category?.branches)
        ? category.branches[branchCrumb.branchIndex]
        : null;
    const fromEraIndex = Number(branch?.fromEraIndex);
    if (!Number.isInteger(fromEraIndex) || !category?.eras?.[fromEraIndex]) {
        return null;
    }

    return {
        label: category.eras[fromEraIndex].title || '重大事件',
        branchTitle: branch.title || '时间支线',
        state: buildTimelineItemState(catIndex, fromEraIndex),
    };
};

const getTimelineDetailNavTargets = (stateHistory = []) => {
    const categoryCrumb = stateHistory.find((crumb) => crumb.type === 'category');
    if (!categoryCrumb || !Number.isInteger(categoryCrumb.catIndex)) {
        return null;
    }

    const catIndex = categoryCrumb.catIndex;
    const category = websiteData.categories[catIndex];
    if (!category || !Array.isArray(category.eras)) {
        return null;
    }

    const branchCrumb = stateHistory.find((crumb) => crumb.type === 'branchEvent');
    if (branchCrumb) {
        const branch = Array.isArray(category.branches)
            ? category.branches[branchCrumb.branchIndex]
            : null;
        const events = Array.isArray(branch?.events) ? branch.events : [];
        const eventIndex = Number(branchCrumb.eventIndex);
        if (!Number.isInteger(eventIndex) || !events[eventIndex]) {
            return null;
        }

        const previousEvent = events[eventIndex - 1] || null;
        const nextEvent = events[eventIndex + 1] || null;
        return {
            previous: previousEvent
                ? {
                      label: previousEvent.title || branch?.title || '上一事件',
                      state: buildTimelineBranchEventState(
                          catIndex,
                          branchCrumb.branchIndex,
                          eventIndex - 1
                      ),
                  }
                : null,
            next: nextEvent
                ? {
                      label: nextEvent.title || branch?.title || '下一事件',
                      state: buildTimelineBranchEventState(
                          catIndex,
                          branchCrumb.branchIndex,
                          eventIndex + 1
                      ),
                  }
                : null,
        };
    }

    const itemCrumb = stateHistory.find((crumb) => crumb.type === 'item');
    if (!itemCrumb) {
        return null;
    }

    const itemIndex = Number(String(itemCrumb.itemPath || '').split('.')[0]);
    if (!Number.isInteger(itemIndex) || !category.eras[itemIndex]) {
        return null;
    }

    const previousEra = category.eras[itemIndex - 1] || null;
    const nextEra = category.eras[itemIndex + 1] || null;
    return {
        previous: previousEra
            ? {
                  label: previousEra.title || '上一事件',
                  state: buildTimelineItemState(catIndex, itemIndex - 1),
              }
            : null,
        next: nextEra
            ? {
                  label: nextEra.title || '下一事件',
                  state: buildTimelineItemState(catIndex, itemIndex + 1),
              }
            : null,
    };
};

const rememberTimelineDetailFocus = (stateHistory = []) => {
    const categoryCrumb = stateHistory.find((crumb) => crumb.type === 'category');
    if (!categoryCrumb || !Number.isInteger(categoryCrumb.catIndex)) return;

    const category = websiteData.categories[categoryCrumb.catIndex];
    if (!category || !Array.isArray(category.eras)) return;

    const itemCrumb = stateHistory.find((crumb) => crumb.type === 'item');
    if (itemCrumb) {
        const itemIndex = Number(String(itemCrumb.itemPath || '').split('.')[0]);
        if (Number.isInteger(itemIndex) && category.eras[itemIndex]) {
            appState.timelineFocusByCategory[categoryCrumb.catIndex] = itemIndex;
        }
        return;
    }

    const branchCrumb = stateHistory.find((crumb) => crumb.type === 'branchEvent');
    if (branchCrumb) {
        const branch = Array.isArray(category.branches)
            ? category.branches[branchCrumb.branchIndex]
            : null;
        const fallbackIndex = Number(branch?.fromEraIndex ?? 0);
        if (Number.isInteger(fallbackIndex) && category.eras[fallbackIndex]) {
            appState.timelineFocusByCategory[categoryCrumb.catIndex] = fallbackIndex;
        }
    }
};

const removeTimelineDetailNavigator = (view) => {
    if (!view) return;
    view.classList.remove('has-timeline-detail-nav');
    view.querySelector('.timeline-detail-nav')?.remove();
};

const renderTimelineDetailNavigator = (view, navTargets) => {
    removeTimelineDetailNavigator(view);
    if (!view || (!navTargets?.previous && !navTargets?.next)) return;

    view.classList.add('has-timeline-detail-nav');

    const buildButton = (direction, target) => {
        const isPrevious = direction === 'previous';
        const label = target?.label ? stripColorTags(target.label) : '';
        return `
            <button
                class="timeline-detail-nav-button timeline-detail-nav-button--${direction}"
                type="button"
                data-direction="${direction}"
                ${target ? '' : 'disabled aria-disabled="true"'}
                aria-label="${isPrevious ? '查看左侧时间线事件' : '查看右侧时间线事件'}"
            >
                <span class="timeline-detail-nav-icon">${isPrevious ? '‹' : '›'}</span>
                <span class="timeline-detail-nav-copy">
                    <span class="timeline-detail-nav-kicker">${isPrevious ? '左侧事件' : '右侧事件'}</span>
                    <strong>${parseAndColorText(label || (isPrevious ? '无更早事件' : '无后续事件'))}</strong>
                </span>
            </button>
        `;
    };

    const nav = document.createElement('div');
    nav.className = 'timeline-detail-nav';
    nav.innerHTML = `
        ${buildButton('previous', navTargets.previous)}
        ${buildButton('next', navTargets.next)}
    `;

    view.appendChild(nav);
};

const removeTimelineBranchControls = (view) => {
    if (!view) return;
    view.classList.remove('has-timeline-branch-controls');
    view.querySelector('.timeline-main-return')?.remove();
    view.querySelector('.timeline-branch-links')?.remove();
};

const renderTimelineBranchControls = (view, stateHistory = []) => {
    removeTimelineBranchControls(view);
    if (!view) return;

    const detailRight = view.querySelector('.detail-right');
    const detailTitle = view.querySelector('#detail-title');
    const detailText = view.querySelector('#detail-text');
    if (!detailRight || !detailText) return;

    const returnTarget = getTimelineBranchReturnTarget(stateHistory);
    if (returnTarget && detailTitle) {
        const returnButton = document.createElement('button');
        returnButton.type = 'button';
        returnButton.className = 'timeline-main-return';
        returnButton.innerHTML = `
            <span class="timeline-main-return-kicker">返回重大事件</span>
            <strong>${parseAndColorText(stripColorTags(returnTarget.label))}</strong>
        `;
        detailRight.insertBefore(returnButton, detailTitle);
        view.classList.add('has-timeline-branch-controls');
    }

    const branchTargets = getTimelineBranchEntryTargets(stateHistory);
    if (!branchTargets.length) return;

    const links = document.createElement('section');
    links.className = 'timeline-branch-links';
    links.innerHTML = `
        <div class="timeline-branch-links-title">关联时间支线</div>
        <div class="timeline-branch-links-grid">
            ${branchTargets
                .map(
                    (target) => `
                        <button
                            type="button"
                            class="timeline-branch-entry"
                            data-branch-index="${target.branchIndex}"
                            data-event-index="${target.eventIndex}">
                            <span class="timeline-branch-entry-kicker">进入支线</span>
                            <strong>${parseAndColorText(stripColorTags(target.eventTitle))}</strong>
                            <span>${parseAndColorText(stripColorTags(target.branchTitle))} / ${target.eventCount} 个节点</span>
                        </button>
                    `
                )
                .join('')}
        </div>
    `;
    detailText.insertAdjacentElement('afterend', links);
    view.classList.add('has-timeline-branch-controls');
};

const getImageLightboxTargetRect = (sourceImage) => {
    const viewportPadding = window.innerWidth <= 768 ? 18 : 64;
    const maxWidth = Math.max(160, window.innerWidth - viewportPadding * 2);
    const maxHeight = Math.max(160, window.innerHeight - viewportPadding * 2);
    const naturalWidth =
        sourceImage?.naturalWidth || sourceImage?.getBoundingClientRect().width || 1;
    const naturalHeight =
        sourceImage?.naturalHeight || sourceImage?.getBoundingClientRect().height || 1;
    const scale = Math.min(maxWidth / naturalWidth, maxHeight / naturalHeight, 2.2);
    const width = Math.max(1, naturalWidth * scale);
    const height = Math.max(1, naturalHeight * scale);

    return {
        left: (window.innerWidth - width) / 2,
        top: (window.innerHeight - height) / 2,
        width,
        height,
    };
};

const setLightboxImageRect = (image, rect) => {
    if (!image || !rect) return;
    image.style.left = `${rect.left}px`;
    image.style.top = `${rect.top}px`;
    image.style.width = `${rect.width}px`;
    image.style.height = `${rect.height}px`;
};

const closeImageLightbox = () => {
    const lightbox = appState.imageLightbox;
    if (!lightbox) return;

    const { overlay, image, sourceImage, onKeydown, onResize } = lightbox;
    appState.imageLightbox = null;
    window.removeEventListener('keydown', onKeydown);
    window.removeEventListener('resize', onResize);

    const sourceRect =
        sourceImage && sourceImage.isConnected
            ? sourceImage.getBoundingClientRect()
            : null;

    overlay.classList.remove('is-open');
    if (sourceRect) {
        setLightboxImageRect(image, sourceRect);
    } else {
        image.classList.add('is-fading-out');
    }

    const cleanup = () => {
        sourceImage?.classList.remove('is-lightbox-source');
        document.body.classList.remove('image-lightbox-open');
        overlay.remove();
    };

    image.addEventListener('transitionend', cleanup, { once: true });
    setTimeout(cleanup, 720);
};

const openImageLightbox = (sourceImage) => {
    if (!sourceImage || !sourceImage.classList.contains('is-zoomable')) return;
    const imageSrc = sourceImage.currentSrc || sourceImage.src;
    if (!imageSrc) return;

    if (appState.imageLightbox) {
        closeImageLightbox();
        return;
    }

    const sourceRect = sourceImage.getBoundingClientRect();
    const overlay = document.createElement('div');
    overlay.className = 'image-lightbox';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', '放大查看重大事件配图');

    const image = document.createElement('img');
    image.className = 'image-lightbox-image';
    image.src = imageSrc;
    image.alt = sourceImage.alt || '重大事件配图';

    const caption = document.createElement('div');
    caption.className = 'image-lightbox-caption';
    caption.textContent = sourceImage.alt || '重大事件配图';

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'image-lightbox-close';
    closeButton.setAttribute('aria-label', '关闭图片预览');
    closeButton.textContent = '×';

    overlay.append(image, caption, closeButton);
    document.body.appendChild(overlay);
    document.body.classList.add('image-lightbox-open');
    sourceImage.classList.add('is-lightbox-source');
    setLightboxImageRect(image, sourceRect);

    const onKeydown = (event) => {
        if (event.key === 'Escape') {
            event.preventDefault();
            closeImageLightbox();
        }
    };

    const onResize = () => {
        if (!appState.imageLightbox) return;
        setLightboxImageRect(image, getImageLightboxTargetRect(sourceImage));
    };

    appState.imageLightbox = {
        overlay,
        image,
        sourceImage,
        onKeydown,
        onResize,
    };

    closeButton.addEventListener('click', closeImageLightbox);
    image.addEventListener('click', closeImageLightbox);
    overlay.addEventListener('click', (event) => {
        if (event.target === overlay) {
            closeImageLightbox();
        }
    });
    window.addEventListener('keydown', onKeydown);
    window.addEventListener('resize', onResize);

    requestAnimationFrame(() => {
        overlay.classList.add('is-open');
        setLightboxImageRect(image, getImageLightboxTargetRect(sourceImage));
    });
};

const buildListHtml = (items, pathPrefix = '', level = 0) => {
    let html = '';
    const indentSize = 25;
    items.forEach((item, index) => {
        const currentPath = pathPrefix ? `${pathPrefix}.${index}` : `${index}`;
        const itemColor = window.colorPalette[item.color] || 'inherit';
        const titleHtml = parseAndColorText(item.title);
        html += `<div class="list-item" data-item-path="${currentPath}">
                    <h3 class="list-title" style="color: ${itemColor}; margin-left: ${level * indentSize}px;">${titleHtml}</h3>
                </div>`;
        if (item.subItems && item.subItems.length > 0) {
            html += buildListHtml(item.subItems, currentPath, level + 1);
        }
    });
    return html;
};

// --- G6 相关辅助函数 ---
// Normalize optional law-specific metadata so the legal views can stay resilient
// even when the CMS only fills part of the structure.
const normalizeMultilineList = (value) => {
    if (Array.isArray(value)) {
        return value
            .map((entry) => String(entry ?? '').trim())
            .filter(Boolean);
    }

    if (typeof value === 'string') {
        return value
            .split(/\r?\n/)
            .map((entry) => entry.trim())
            .filter(Boolean);
    }

    return [];
};

const normalizeLawHistoryEntries = (value) => {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .filter((entry) => entry && typeof entry === 'object')
        .map((entry) => ({
            title: String(entry.title || ''),
            summary: String(entry.summary || ''),
            text: String(entry.text || ''),
            note: String(entry.note || ''),
            image: String(entry.image || ''),
            statusTone: String(entry.statusTone || ''),
            statusLabel: String(entry.statusLabel || ''),
            eraLabel: String(entry.eraLabel || ''),
            positiveEffects: normalizeMultilineList(entry.positiveEffects),
            negativeEffects: normalizeMultilineList(entry.negativeEffects),
            neutralEffects: normalizeMultilineList(entry.neutralEffects),
        }))
        .filter((entry) => entry.title || entry.summary || entry.text);
};

const getLawMeta = (node) => {
    const rawMeta =
        node && typeof node.lawMeta === 'object' && !Array.isArray(node.lawMeta)
            ? node.lawMeta
            : {};
    const charterTier = Number(rawMeta.charterTier);

    return {
        kicker: String(rawMeta.kicker || ''),
        summary: String(rawMeta.summary || ''),
        boardNote: String(rawMeta.boardNote || ''),
        subtitle: String(rawMeta.subtitle || ''),
        statusLabel: String(rawMeta.statusLabel || ''),
        statusText: String(rawMeta.statusText || ''),
        enactedLabel: String(rawMeta.enactedLabel || ''),
        enactedText: String(rawMeta.enactedText || ''),
        quote: String(rawMeta.quote || ''),
        note: String(rawMeta.note || ''),
        badge: String(rawMeta.badge || ''),
        layout: String(rawMeta.layout || ''),
        charterKicker: String(rawMeta.charterKicker || ''),
        charterCenterText: String(rawMeta.charterCenterText || ''),
        charterLeftLabel: String(rawMeta.charterLeftLabel || ''),
        charterRightLabel: String(rawMeta.charterRightLabel || ''),
        charterTrack: String(rawMeta.charterTrack || ''),
        charterTier: Number.isFinite(charterTier) ? charterTier : null,
        charterSigned:
            rawMeta.charterSigned === true ||
            rawMeta.charterSigned === 'true' ||
            rawMeta.charterSigned === 1 ||
            rawMeta.charterSigned === '1',
        positiveEffects: normalizeMultilineList(rawMeta.positiveEffects),
        negativeEffects: normalizeMultilineList(rawMeta.negativeEffects),
        neutralEffects: normalizeMultilineList(rawMeta.neutralEffects),
        historyEntries: normalizeLawHistoryEntries(rawMeta.historyEntries),
    };
};

const isLawCategory = (category) => category?.id === LAW_CATEGORY_ID;
// Special layout id used by Empire Laws to render branching charter pages.
const CHARTER_LAW_LAYOUT_ID = 'charter';

const getLawCategoryState = (catIndex) => ({
    viewId: '#law-hub-view',
    history: [{ type: 'category', catIndex }],
});

const getLawHubState = (catIndex, sectionPath = null) => ({
    viewId: '#law-hub-view',
    history: [
        { type: 'category', catIndex },
        ...(sectionPath === null || sectionPath === undefined || sectionPath === ''
            ? []
            : [{ type: 'lawSection', catIndex, itemPath: String(sectionPath) }]),
    ],
});

const getLawSections = (category) =>
    Array.isArray(category?.items) ? category.items : [];

const resolveActiveLawSectionPath = (stateHistory, category, catIndex) => {
    const sections = getLawSections(category);
    if (!sections.length) {
        return '';
    }

    const sectionCrumb = stateHistory.find(
        (crumb) => crumb.type === 'lawSection' && crumb.catIndex === catIndex
    );
    const requestedPath =
        sectionCrumb?.itemPath !== undefined ? String(sectionCrumb.itemPath) : '';

    if (requestedPath && getItemByPath(requestedPath, catIndex)) {
        return requestedPath;
    }

    return '0';
};

const getLawSectionPathFromLawPath = (lawPath) => {
    const pathParts = String(lawPath || '')
        .split('.')
        .filter(Boolean);

    if (pathParts.length <= 1) {
        return pathParts[0] || '';
    }

    return pathParts.slice(0, -1).join('.');
};

const getLawItemPathKey = (itemPath) => String(itemPath || '');

const getLawHistoryPanelKey = (catIndex, lawPath) =>
    `${String(catIndex ?? '')}:${getLawItemPathKey(lawPath)}`;

const getLawHistoryStatusTone = (entry) => {
    const normalizedTone = String(entry?.statusTone || '')
        .trim()
        .toLowerCase();

    if (normalizedTone === 'repealed') {
        return 'repealed';
    }

    if (normalizedTone === 'draft') {
        return 'draft';
    }

    return 'archived';
};

const getLawHistoryStatusLabel = (entry) => {
    if (entry?.statusLabel) {
        return String(entry.statusLabel);
    }

    switch (getLawHistoryStatusTone(entry)) {
        case 'repealed':
            return '宸插簾姝�';
        case 'draft':
            return '浣滃簾鑽夋';
        case 'archived':
        default:
            return '鏃ф硶妗ｆ';
    }
};

const getLawHistoryStatusText = (entry) => {
    if (entry?.statusLabel) {
        return String(entry.statusLabel);
    }

    switch (getLawHistoryStatusTone(entry)) {
        case 'repealed':
            return '\u5df2\u5e9f\u6b62';
        case 'draft':
            return '\u4f5c\u5e9f\u8349\u6848';
        case 'archived':
        default:
            return '\u65e7\u7248\u6cd5\u4ee4';
    }
};

const getLawHistoryRouteSegment = (law, historyIndex) => {
    const historyEntries = getLawMeta(law).historyEntries;
    return getSiblingRouteKey(historyEntries, historyIndex, 'archive');
};

const findLawHistoryIndexByRouteSegment = (law, routeSegment) => {
    const historyEntries = getLawMeta(law).historyEntries;
    return findSiblingIndexByRouteKey(historyEntries, routeSegment, 'archive');
};

const getCharterTrackLabel = (trackKey, lawMeta) => {
    if (trackKey === 'left') {
        return lawMeta.charterLeftLabel || '治安集权线';
    }
    if (trackKey === 'right') {
        return lawMeta.charterRightLabel || '舆论集权线';
    }
    return '终局法案';
};

const getCharterStateLabel = (state) => {
    if (state === 'signed') return '已签署';
    if (state === 'available') return '已解锁';
    return '未解锁';
};

const getCharterStateHint = (state, previousStep) => {
    if (state === 'signed') {
        return '该法案已生效，可继续推进后续法案。';
    }
    if (state === 'available') {
        return previousStep
            ? `前置法案《${stripColorTags(previousStep.node.title || '未命名法案')}》已生效。`
            : '这是当前路线的起始法案，可直接推进。';
    }
    return previousStep
        ? `需先让《${stripColorTags(previousStep.node.title || '未命名法案')}》生效。`
        : '当前法案尚未达到解锁条件。';
};

// Normalize charter nodes so unlock state is derived from CMS data instead of hard-coded UI state.
const buildCharterLawModel = (law, lawPath) => {
    const lawMeta = getLawMeta(law);
    const rawSteps = Array.isArray(law.subItems) ? law.subItems : [];
    const normalizedSteps = rawSteps.map((node, index) => {
        const meta = getLawMeta(node);
        const track = ['left', 'right', 'final'].includes(meta.charterTrack)
            ? meta.charterTrack
            : 'left';

        return {
            node,
            meta,
            track,
            sortTier:
                meta.charterTier !== null && meta.charterTier !== undefined
                    ? meta.charterTier
                    : index + 1,
            path: `${lawPath}.${index}`,
            order: index,
        };
    });

    const buildTrack = (trackKey) => {
        const steps = normalizedSteps
            .filter((step) => step.track === trackKey)
            .sort(
                (a, b) =>
                    a.sortTier - b.sortTier ||
                    a.order - b.order
            );

        return steps.map((step, index) => {
            const previousStep = index > 0 ? steps[index - 1] : null;
            const state = step.meta.charterSigned
                ? 'signed'
                : !previousStep || previousStep.meta.charterSigned
                ? 'available'
                : 'locked';

            return {
                ...step,
                state,
                stateLabel: getCharterStateLabel(state),
                hint: getCharterStateHint(state, previousStep),
            };
        });
    };

    const leftSteps = buildTrack('left');
    const rightSteps = buildTrack('right');
    const sideTracks = [
        {
            key: 'left',
            label: getCharterTrackLabel('left', lawMeta),
            steps: leftSteps,
        },
        {
            key: 'right',
            label: getCharterTrackLabel('right', lawMeta),
            steps: rightSteps,
        },
    ];

    const finalCandidate = normalizedSteps
        .filter((step) => step.track === 'final')
        .sort((a, b) => a.sortTier - b.sortTier || a.order - b.order)[0];

    const areSideTracksComplete = sideTracks.every(
        (track) =>
            !track.steps.length ||
            track.steps[track.steps.length - 1].state === 'signed'
    );

    const finalStep = finalCandidate
        ? {
              ...finalCandidate,
              state: finalCandidate.meta.charterSigned
                  ? 'signed'
                  : areSideTracksComplete
                  ? 'available'
                  : 'locked',
              stateLabel: getCharterStateLabel(
                  finalCandidate.meta.charterSigned
                      ? 'signed'
                      : areSideTracksComplete
                      ? 'available'
                      : 'locked'
              ),
              hint: finalCandidate.meta.charterSigned
                  ? '两条路线已汇流，最高委员会权力完成集中。'
                  : areSideTracksComplete
                  ? '两条路线均已推进完成，终局法案现已解锁。'
                  : '需先让左右两条路线的末端法案全部生效。',
          }
        : null;

    const selectableSteps = [
        ...leftSteps,
        ...rightSteps,
        ...(finalStep ? [finalStep] : []),
    ];

    return {
        lawMeta,
        sideTracks,
        finalStep,
        selectableSteps,
    };
};

const getDefaultCharterSelection = (charterModel) =>
    charterModel.selectableSteps.find((step) => step.state === 'available') ||
    [...charterModel.selectableSteps]
        .reverse()
        .find((step) => step.state === 'signed') ||
    charterModel.selectableSteps[0] ||
    null;

const buildCharterFocusCard = (step) => {
    if (!step) {
        return '';
    }

    const effectHtml =
        buildLawEffectBadges(step.meta, 'law-charter-effect') ||
        '<li class="law-charter-effect law-charter-effect--neutral">暂无额外影响</li>';

    return `
        <article class="law-charter-focus">
            <div class="law-charter-focus-head">
                <span class="law-charter-focus-track">${parseAndColorText(
                    step.meta.badge || '宪章法案'
                )}</span>
                <span class="law-charter-focus-state law-charter-focus-state--${step.state}">
                    ${step.stateLabel}
                </span>
            </div>
            <h2 class="law-charter-focus-title">${parseAndColorText(
                step.node.title || '未命名法案'
            )}</h2>
            ${
                step.meta.subtitle
                    ? `<div class="law-charter-focus-subtitle">${parseAndColorText(
                          step.meta.subtitle
                      )}</div>`
                    : ''
            }
            <div class="law-charter-focus-copy">${buildRichParagraphs(
                step.node.details || step.meta.note || '该法案尚未填写详细说明。',
                '（暂无法案说明）',
                'law-empty-copy'
            )}</div>
            <div class="law-charter-focus-hint">${parseAndColorText(step.hint)}</div>
            <ul class="law-charter-effects">${effectHtml}</ul>
        </article>
    `;
};

// Render the special charter law board with two progressive branches and one final node.
const renderCharterLawDetailView = (view, law, lawPath) => {
    const shell = view.querySelector('.law-detail-shell');
    if (!shell) return;

    const charterModel = buildCharterLawModel(law, lawPath);
    const selectionKey = getLawItemPathKey(lawPath);
    const selectedPath =
        appState.activeCharterSelections[selectionKey] ||
        getDefaultCharterSelection(charterModel)?.path ||
        '';
    const selectedStep =
        charterModel.selectableSteps.find((step) => step.path === selectedPath) ||
        getDefaultCharterSelection(charterModel);

    if (selectedStep) {
        appState.activeCharterSelections[selectionKey] = selectedStep.path;
    }

    const trackHtml = charterModel.sideTracks
        .map(
            (track) => `
                <section class="law-charter-track law-charter-track--${track.key}">
                    <div class="law-charter-track-label">${parseAndColorText(
                        track.label
                    )}</div>
                    <div class="law-charter-track-line"></div>
                    <div class="law-charter-track-nodes">
                        ${
                            track.steps.length
                                ? track.steps
                                      .map(
                                          (step) => `
                                            <button
                                                type="button"
                                                class="law-charter-node law-charter-node--${step.state} ${
                                                    selectedStep?.path === step.path
                                                        ? 'is-selected'
                                                        : ''
                                                }"
                                                data-charter-step-path="${step.path}">
                                                <span class="law-charter-node-icon"></span>
                                                <span class="law-charter-node-copy">
                                                    <span class="law-charter-node-title">${parseAndColorText(
                                                        step.node.title || '未命名法案'
                                                    )}</span>
                                                    <span class="law-charter-node-state">${step.stateLabel}</span>
                                                </span>
                                            </button>
                                          `
                                      )
                                      .join('')
                                : `<div class="law-charter-node law-charter-node--empty">
                                    <span class="law-charter-node-copy">
                                        <span class="law-charter-node-title">暂无分支法案</span>
                                        <span class="law-charter-node-state">可在 CMS 中继续添加</span>
                                    </span>
                                   </div>`
                        }
                    </div>
                </section>
            `
        )
        .join('');

    const finalHtml = charterModel.finalStep
        ? `
            <div class="law-charter-final-wrap">
                <div class="law-charter-final-rail"></div>
                <button
                    type="button"
                    class="law-charter-node law-charter-node--${charterModel.finalStep.state} law-charter-node--final ${
                        selectedStep?.path === charterModel.finalStep.path
                            ? 'is-selected'
                            : ''
                    }"
                    data-charter-step-path="${charterModel.finalStep.path}">
                    <span class="law-charter-node-icon"></span>
                    <span class="law-charter-node-copy">
                        <span class="law-charter-node-title">${parseAndColorText(
                            charterModel.finalStep.node.title || '终局法案'
                        )}</span>
                        <span class="law-charter-node-state">${charterModel.finalStep.stateLabel}</span>
                    </span>
                </button>
            </div>
          `
        : '';

    /* Removed misplaced law hub visual block. */
    /*
                <div class="law-column-visual">
                    <div class="law-column-visual-media">
                        <img
                            class="law-column-visual-image"
                            src="${activeSectionImage}"
                            alt="${activeSectionVisualTitle}"
                            onerror="this.onerror=null;this.src='${DEFAULT_PLACEHOLDER_IMAGE}';"
                            loading="lazy">
                    </div>
                    <div class="law-column-visual-overlay"></div>
                    <div class="law-column-visual-copy">
                        <div class="law-column-visual-kicker">${parseAndColorText(
                            categoryMeta.kicker || 'IMPERIAL CODEX'
                        )}</div>
                        <h2 class="law-column-visual-title">${parseAndColorText(
                            activeSection?.title || category.title || '帝国法律'
                        )}</h2>
                        <div class="law-column-visual-caption">${lawCountLabel}</div>
                    </div>
                </div>
            </aside>`;

    
    const activeSectionVisualHtml = `<aside class="law-column law-column--visual">
                <div class="law-column-visual">
                    <div class="law-column-visual-media">
                        <img
                            class="law-column-visual-image"
                            src="${activeSectionImage}"
                            alt="${activeSectionVisualTitle}"
                            onerror="this.onerror=null;this.src='${DEFAULT_PLACEHOLDER_IMAGE}';"
                            loading="lazy">
                    </div>
                    <div class="law-column-visual-overlay"></div>
                    <div class="law-column-visual-copy">
                        <div class="law-column-visual-kicker">${parseAndColorText(
                            categoryMeta.kicker || 'IMPERIAL CODEX'
                        )}</div>
                        <h2 class="law-column-visual-title">${parseAndColorText(
                            activeSection?.title || category.title || '帝国法律'
                        )}</h2>
                        <div class="law-column-visual-caption">${lawCountLabel}</div>
                    </div>
                </div>
            </aside>`;

    */
    shell.innerHTML = `
        <div class="law-charter-frame">
            <div class="law-charter-header">
                <div class="law-charter-kicker">${parseAndColorText(
                    charterModel.lawMeta.charterKicker ||
                        charterModel.lawMeta.statusLabel ||
                        'CHARTER LAW'
                )}</div>
                <h1 class="law-charter-title">${parseAndColorText(
                    law.title || '宪章法'
                )}</h1>
            </div>
            <div class="law-charter-board">
                ${trackHtml}
                <div class="law-charter-center">
                    <div class="law-charter-center-copy">${buildRichParagraphs(
                        charterModel.lawMeta.charterCenterText ||
                            charterModel.lawMeta.enactedText ||
                            law.details ||
                            '宪章法通过逐步解锁的法案线路，缓慢但持续地向最高委员会集中治理权力。',
                        '（暂无宪章法说明）',
                        'law-empty-copy'
                    )}</div>
                    ${buildCharterFocusCard(selectedStep)}
                </div>
                ${finalHtml}
            </div>
        </div>
    `;
};

const buildRichParagraphs = (
    text,
    emptyCopy = '（暂无内容）',
    emptyClassName = 'law-empty-copy'
) => {
    const normalized = String(text || '').trim();

    if (!normalized) {
        return `<p class="${emptyClassName}">${emptyCopy}</p>`;
    }

    return normalized
        .split(/\n+/)
        .map((paragraph) => `<p>${parseAndColorText(paragraph)}</p>`)
        .join('');
};

const buildLawEffectBadges = (meta, className = 'law-effect-pill') => {
    const effectGroups = [
        { key: 'positiveEffects', tone: 'positive' },
        { key: 'negativeEffects', tone: 'negative' },
        { key: 'neutralEffects', tone: 'neutral' },
    ];

    return effectGroups
        .flatMap(({ key, tone }) =>
            meta[key].map(
                (entry) =>
                    `<li class="${className} ${className}--${tone}">${parseAndColorText(
                        entry
                    )}</li>`
            )
        )
        .join('');
};

const buildLawHistoryPanel = (
    historyEntries,
    catIndex,
    sectionPath,
    lawPath
) => {
    const panelKey = getLawHistoryPanelKey(catIndex, lawPath);
    const isOpen = Boolean(appState.activeLawHistoryPanels[panelKey]);
    const historyToggleLabel =
        historyEntries.length === 1 ? '鍘嗗彶娉曟 01' : `鍘嗗彶娉曟 ${String(historyEntries.length).padStart(2, '0')}`;
    const historyLinksHtml = historyEntries
        .map((entry, historyIndex) => {
            const tone = getLawHistoryStatusTone(entry);
            return `<button
                        class="law-entry-history-link law-entry-history-link--${tone}"
                        type="button"
                        data-cat-index="${catIndex}"
                        data-section-path="${sectionPath}"
                        data-law-path="${lawPath}"
                        data-history-index="${historyIndex}">
                            <span class="law-entry-history-link-title">${parseAndColorText(
                                entry.title || '鏈懡鍚嶆棫娉曟'
                            )}</span>
                            <span class="law-entry-history-link-meta">${parseAndColorText(
                                entry.eraLabel ||
                                    getLawHistoryStatusLabel(entry)
                            )}</span>
                    </button>`;
        })
        .join('');

    return `
        <div class="law-entry-history">
            <button
                class="law-entry-history-toggle ${
                    isOpen ? 'is-open' : ''
                }"
                type="button"
                aria-expanded="${isOpen ? 'true' : 'false'}"
                data-cat-index="${catIndex}"
                data-section-path="${sectionPath}"
                data-law-path="${lawPath}">
                <span class="law-entry-history-toggle-label">${historyToggleLabel}</span>
                <span class="law-entry-history-toggle-count">${isOpen ? '鏀惰捣' : '灞曞紑'}</span>
            </button>
            <div class="law-entry-history-panel ${
                isOpen ? 'is-open' : ''
            }">
                ${historyLinksHtml}
            </div>
        </div>
    `;
};

const buildLawHistoryDetailSection = (entry) => {
    const tone = getLawHistoryStatusTone(entry);
    const historyEffects =
        buildLawEffectBadges(entry, 'law-history-card-effect') ||
        '<li class="law-history-card-effect law-history-card-effect--neutral">鏆傛棤妗ｆ褰卞搷鏍囨敞</li>';

    return `
        <article class="law-history-card law-history-card--${tone}">
            <div class="law-history-card-head">
                <span class="law-history-card-status law-history-card-status--${tone}">${parseAndColorText(
                    getLawHistoryStatusLabel(entry)
                )}</span>
                ${
                    entry.eraLabel
                        ? `<span class="law-history-card-era">${parseAndColorText(
                              entry.eraLabel
                          )}</span>`
                        : ''
                }
            </div>
            ${
                entry.summary
                    ? `<div class="law-history-card-summary">${parseAndColorText(
                          entry.summary
                      )}</div>`
                    : ''
            }
            <div class="law-history-card-copy">${buildRichParagraphs(
                entry.text || entry.note || entry.summary,
                '锛堟殏鏃犲巻鍙叉姝ｆ枃锛�)',
                'law-empty-copy'
            )}</div>
            ${
                entry.note
                    ? `<div class="law-history-card-note">${parseAndColorText(
                          entry.note
                      )}</div>`
                    : ''
            }
            <ul class="law-history-card-effects">${historyEffects}</ul>
        </article>
    `;
};

const buildLawHistoryPanelV2 = (
    historyEntries,
    catIndex,
    sectionPath,
    lawPath
) => {
    const panelKey = getLawHistoryPanelKey(catIndex, lawPath);
    const isOpen = Boolean(appState.activeLawHistoryPanels[panelKey]);
    const historyToggleLabel = '\u5386\u53f2\u6cd5\u6848\u6863\u6848';
    const historyToggleCountLabel = `\u5df2\u6536\u5f55 ${String(
        historyEntries.length
    ).padStart(2, '0')}`;

    const historyLinksHtml = historyEntries
        .map((entry, historyIndex) => {
            const tone = getLawHistoryStatusTone(entry);
            const statusLabel = getLawHistoryStatusText(entry);
            const eraLabel =
                String(entry.eraLabel || '').trim() ||
                '\u5e74\u4ee3\u672a\u6807\u6ce8';

            return `<button
                        class="law-entry-history-link law-entry-history-link--${tone}"
                        type="button"
                        data-cat-index="${catIndex}"
                        data-section-path="${sectionPath}"
                        data-law-path="${lawPath}"
                        data-history-index="${historyIndex}">
                            <span class="law-entry-history-link-rail">
                                <span class="law-entry-history-link-year">${parseAndColorText(
                                    eraLabel
                                )}</span>
                            </span>
                            <span class="law-entry-history-link-body">
                                <span class="law-entry-history-link-title">${parseAndColorText(
                                    entry.title ||
                                        '\u672a\u547d\u540d\u5386\u53f2\u6cd5\u6848'
                                )}</span>
                                <span class="law-entry-history-link-meta">
                                    <span class="law-entry-history-badge law-entry-history-badge--${tone}">${parseAndColorText(
                                        statusLabel
                                    )}</span>
                                    <span class="law-entry-history-link-era">${parseAndColorText(
                                        eraLabel
                                    )}</span>
                                </span>
                            </span>
                    </button>`;
        })
        .join('');

    return `
        <div class="law-entry-history">
            <button
                class="law-entry-history-toggle ${
                    isOpen ? 'is-open' : ''
                }"
                type="button"
                aria-expanded="${isOpen ? 'true' : 'false'}"
                data-cat-index="${catIndex}"
                data-section-path="${sectionPath}"
                data-law-path="${lawPath}">
                <span class="law-entry-history-toggle-copy">
                    <span class="law-entry-history-toggle-label">${historyToggleLabel}</span>
                    <span class="law-entry-history-toggle-meta">${historyToggleCountLabel}</span>
                </span>
                <span class="law-entry-history-toggle-count">${
                    isOpen ? '\u6536\u8d77' : '\u5c55\u5f00'
                }</span>
            </button>
            <div class="law-entry-history-panel ${isOpen ? 'is-open' : ''}">
                ${historyLinksHtml}
            </div>
        </div>
    `;
};

const buildLawHistoryDetailSectionV2 = (entry) => {
    const tone = getLawHistoryStatusTone(entry);
    const historyEffects =
        buildLawEffectBadges(entry, 'law-history-card-effect') ||
        '<li class="law-history-card-effect law-history-card-effect--neutral">\u6682\u65e0\u6863\u6848\u5f71\u54cd\u6807\u6ce8</li>';

    return `
        <article class="law-history-card law-history-card--${tone}">
            <div class="law-history-card-head">
                <span class="law-history-card-status law-history-card-status--${tone}">${parseAndColorText(
                    getLawHistoryStatusText(entry)
                )}</span>
                ${
                    entry.eraLabel
                        ? `<span class="law-history-card-era">${parseAndColorText(
                              entry.eraLabel
                          )}</span>`
                        : ''
                }
            </div>
            ${
                entry.summary
                    ? `<div class="law-history-card-summary">${parseAndColorText(
                          entry.summary
                      )}</div>`
                    : ''
            }
            <div class="law-history-card-copy">${buildRichParagraphs(
                entry.text || entry.note || entry.summary,
                '\uff08\u6682\u65e0\u6863\u6848\u6b63\u6587\uff09',
                'law-empty-copy'
            )}</div>
            ${
                entry.note
                    ? `<div class="law-history-card-note">${parseAndColorText(
                          entry.note
                      )}</div>`
                    : ''
            }
            <ul class="law-history-card-effects">${historyEffects}</ul>
        </article>
    `;
};

const renderLawHubView = (view, category, catIndex, stateHistory) => {
    const shell = view.querySelector('.law-hub-shell');
    if (!shell) return;

    const categoryMeta = getLawMeta(category);
    const sections = getLawSections(category);
    const activeSectionPath = resolveActiveLawSectionPath(
        stateHistory,
        category,
        catIndex
    );
    const activeSection =
        activeSectionPath !== '' ? getItemByPath(activeSectionPath, catIndex) : null;
    const activeSectionIndex =
        activeSectionPath !== '' ? Number(activeSectionPath) : 0;
    const activeSectionMeta = getLawMeta(activeSection || {});
    const tabsHtml = sections
        .map(
            (section, sectionIndex) => `<button
                    class="law-hub-tab ${
                        String(sectionIndex) === activeSectionPath ? 'is-active' : ''
                    }"
                    type="button"
                    data-section-target="${sectionIndex}">
                    <span class="law-hub-tab-index">${String(
                        sectionIndex + 1
                    ).padStart(2, '0')}</span>
                    <span class="law-hub-tab-label">${parseAndColorText(
                        section.title || '未命名分册'
                    )}</span>
                </button>`
        )
        .join('');

    const laws = Array.isArray(activeSection?.subItems) ? activeSection.subItems : [];
    const activeSectionImage = resolveAssetPath(
        activeSection?.image ||
            laws.find((law) => law?.image)?.image ||
            category.image
    );
    const activeSectionVisualTitle = stripColorTags(
        activeSection?.title || category.title || '帝国法律'
    );
    const lawCountLabel = `现行法令 ${String(laws.length).padStart(2, '0')}`;
    const hubSummary = category.details || categoryMeta.summary || '';
    const activeSectionVisualHtml = `<aside class="law-column law-column--visual">
                <div class="law-column-visual">
                    <div class="law-column-visual-media">
                        <img
                            class="law-column-visual-image"
                            src="${activeSectionImage}"
                            alt="${activeSectionVisualTitle}"
                            onerror="this.onerror=null;this.src='${DEFAULT_PLACEHOLDER_IMAGE}';"
                            loading="lazy">
                    </div>
                    <div class="law-column-visual-overlay"></div>
                    <div class="law-column-visual-copy">
                        <div class="law-column-visual-kicker">${parseAndColorText(
                            categoryMeta.kicker || 'IMPERIAL CODEX'
                        )}</div>
                        <h2 class="law-column-visual-title">${parseAndColorText(
                            activeSection?.title || category.title || '帝国法律'
                        )}</h2>
                        <div class="law-column-visual-caption">${lawCountLabel}</div>
                    </div>
                </div>
            </aside>`;
    const entryHtml = laws.length
        ? laws
              .map((law, lawIndex) => {
                  const lawPath = `${activeSectionPath}.${lawIndex}`;
                  const lawMeta = getLawMeta(law);
                  const historyEntries = lawMeta.historyEntries;
                  const isCharterLaw =
                      lawMeta.layout === CHARTER_LAW_LAYOUT_ID;
                  const subtitle =
                      lawMeta.subtitle || lawMeta.summary || law.details || '暂无摘要';

                  const historyPanelHtml = historyEntries.length
                      ? buildLawHistoryPanelV2(
                            historyEntries,
                            catIndex,
                            activeSectionPath,
                            lawPath
                        )
                      : '';

                  return `<article class="law-entry-shell ${
                              historyEntries.length
                                  ? 'law-entry-shell--with-history'
                                  : ''
                          }"><button
                                class="law-entry ${
                                    isCharterLaw ? 'law-entry--charter' : ''
                                }"
                                type="button"
                                data-cat-index="${catIndex}"
                                data-section-path="${activeSectionPath}"
                                data-law-path="${lawPath}">
                                    <span class="law-entry-symbol">§</span>
                                    <span class="law-entry-copy">
                                        <span class="law-entry-title">${parseAndColorText(
                                            law.title || '未命名法令'
                                        )}</span>
                                        <span class="law-entry-subtitle">${parseAndColorText(
                                            subtitle
                                        )}</span>
                                    </span>
                                    ${
                                        lawMeta.statusLabel
                                            ? `<span class="law-entry-status">${parseAndColorText(
                                                  lawMeta.statusLabel
                                              )}</span>`
                                            : ''
                                    }
                              </button>${historyPanelHtml}</article>`;
              })
              .join('')
        : `<div class="law-entry-shell"><div class="law-entry law-entry-empty">
                <span class="law-entry-symbol">§</span>
                <span class="law-entry-copy">
                    <span class="law-entry-title">暂无法令</span>
                    <span class="law-entry-subtitle">可在 CMS 中直接新增、排序或修改法条。</span>
                </span>
           </div></div>`;

    const activeSectionHtml = activeSection
        ? `<section class="law-column law-column--page" data-section-path="${activeSectionPath}">
                <div class="law-column-header">
                    <div class="law-column-index">${String(
                        activeSectionIndex + 1
                    ).padStart(2, '0')}</div>
                    <div class="law-column-copy">
                        <h2>${parseAndColorText(activeSection.title || '未命名分册')}</h2>
                        <p>${parseAndColorText(
                            activeSectionMeta.summary ||
                                activeSection.details ||
                                activeSectionMeta.boardNote ||
                                '该分册暂未填写简介。'
                        )}</p>
                    </div>
                </div>
                <div class="law-column-board">
                    ${
                        activeSectionMeta.boardNote
                            ? `<div class="law-column-note">${parseAndColorText(
                                  activeSectionMeta.boardNote
                              )}</div>`
                            : ''
                    }
                    <div class="law-column-list">${entryHtml}</div>
                </div>
            </section>`
        : `<section class="law-column law-column--page">
                <div class="law-column-board">
                    <div class="law-column-note">当前分册暂无内容，请先在 CMS 中补充法令。</div>
                </div>
           </section>`;

    shell.innerHTML = `
        <div class="law-hub-frame">
            <div class="law-hub-topbar">
                <div class="law-hub-tabrail">${tabsHtml}</div>
            </div>
            <div class="law-hub-header">
                <div class="law-hub-kicker">${parseAndColorText(
                    categoryMeta.kicker || 'IMPERIAL CODEX'
                )}</div>
                <h1 class="law-hub-title">${parseAndColorText(
                    category.title || '帝国法律'
                )}</h1>
                <div class="law-hub-summary">${buildRichParagraphs(
                    categoryMeta.summary ||
                        category.details ||
                        '此处用于集中展示帝国现行法律。你可以在后台直接修改法典分册、法条摘要与细则卡片。'
                )}</div>
            </div>
            <div class="law-hub-note">${parseAndColorText(
                categoryMeta.boardNote ||
                    '点击任意法令即可进入法条页面；每条法令的说明、效果与细则卡片都可以在后台独立修改。'
            )}</div>
            <div class="law-hub-page-status">
                <span class="law-hub-page-badge">当前分册</span>
                <span class="law-hub-page-name">${parseAndColorText(
                    activeSection?.title || '未命名分册'
                )}</span>
                <span class="law-hub-page-count">法令 ${String(laws.length).padStart(
                    2,
                    '0'
                )}</span>
            </div>
            <div class="law-columns">${activeSectionHtml}${activeSectionVisualHtml}</div>
        </div>
    `;
};

const renderLawDetailViewLegacy = (view, category, stateHistory) => {
    const shell = view.querySelector('.law-detail-shell');
    if (!shell) return;

    const categoryCrumb = stateHistory.find((crumb) => crumb.type === 'category');
    const lawCrumb = stateHistory.find((crumb) => crumb.type === 'item');
    if (!categoryCrumb || !lawCrumb) {
        navigate(getLawCategoryState(categoryCrumb?.catIndex ?? 0));
        return;
    }

    const sectionCrumb = stateHistory.find(
        (crumb) => crumb.type === 'lawSection'
    );
    const sectionPath =
        sectionCrumb?.itemPath || getLawSectionPathFromLawPath(lawCrumb.itemPath);
    const section = getItemByPath(sectionPath, categoryCrumb.catIndex);
    const law = getItemByPath(lawCrumb.itemPath, categoryCrumb.catIndex);

    if (!law) {
        navigate(getLawCategoryState(categoryCrumb.catIndex));
        return;
    }

    const categoryMeta = getLawMeta(category);
    const sectionMeta = getLawMeta(section || {});
    const lawMeta = getLawMeta(law);

    if (lawMeta.layout === CHARTER_LAW_LAYOUT_ID) {
        renderCharterLawDetailView(view, law, lawCrumb.itemPath);
        return;
    }

    const lawImage = resolveAssetPath(
        law.image ||
            section?.image ||
            category.image
    );
    const effectHtml =
        buildLawEffectBadges(lawMeta) ||
        '<li class="law-effect-pill law-effect-pill--neutral">暂无影响标注</li>';

    const clauseCards = Array.isArray(law.subItems) ? law.subItems : [];
    const clauseHtml = clauseCards.length
        ? clauseCards
              .map((clause, clauseIndex) => {
                  const clauseMeta = getLawMeta(clause);
                  const clauseEffects =
                      buildLawEffectBadges(clauseMeta, 'law-clause-effect') ||
                      '<li class="law-clause-effect law-clause-effect--neutral">暂无附加影响</li>';

                  return `<article class="law-clause-card">
                                <div class="law-clause-line"></div>
                                <div class="law-clause-content">
                                    <div class="law-clause-kicker">${
                                        parseAndColorText(
                                            clauseMeta.badge ||
                                                `法条细则 ${String(
                                                    clauseIndex + 1
                                                ).padStart(2, '0')}`
                                        )
                                    }</div>
                                    <h2 class="law-clause-title">${parseAndColorText(
                                        clause.title || '未命名细则'
                                    )}</h2>
                                    ${
                                        clauseMeta.subtitle
                                            ? `<div class="law-clause-subtitle">${parseAndColorText(
                                                  clauseMeta.subtitle
                                              )}</div>`
                                            : ''
                                    }
                                    <div class="law-clause-text">${buildRichParagraphs(
                                        clause.details ||
                                            clauseMeta.note ||
                                            '该细则暂未填写正文。',
                                        '（暂无细则说明）',
                                        'law-empty-copy'
                                    )}</div>
                                    <ul class="law-clause-effects">${clauseEffects}</ul>
                                </div>
                            </article>`;
              })
              .join('')
        : `<article class="law-clause-card law-clause-card--empty">
                <div class="law-clause-line"></div>
                <div class="law-clause-content">
                    <div class="law-clause-kicker">法条细则</div>
                    <h2 class="law-clause-title">暂无细则卡片</h2>
                    <div class="law-clause-text">${buildRichParagraphs(
                        '可在 CMS 中继续为当前法令新增子节点，前端会自动把它们渲染成法条细则卡片。',
                        '（暂无细则说明）',
                        'law-empty-copy'
                    )}</div>
                </div>
            </article>`;

    shell.innerHTML = `
        <div class="law-detail-frame">
            <div class="law-detail-copy">
                <div class="law-detail-header">
                    <div class="law-detail-domain">${parseAndColorText(
                        section?.title || '帝国法律'
                    )}</div>
                    <h1 class="law-detail-title">${parseAndColorText(
                        law.title || '未命名法令'
                    )}</h1>
                    ${
                        lawMeta.subtitle
                            ? `<div class="law-detail-subtitle">${parseAndColorText(
                                  lawMeta.subtitle
                              )}</div>`
                            : ''
                    }
                    <div class="law-detail-status-row">
                        <span class="law-detail-status">${parseAndColorText(
                            lawMeta.statusLabel || '现行法令'
                        )}</span>
                        <span class="law-detail-status-copy">${parseAndColorText(
                            lawMeta.statusText ||
                                sectionMeta.boardNote ||
                                categoryMeta.boardNote ||
                                '该法条已归入帝国法典。'
                        )}</span>
                    </div>
                    <div class="law-detail-enacted">
                        <div class="law-detail-enacted-label">${parseAndColorText(
                            lawMeta.enactedLabel || '核心条文'
                        )}</div>
                        <div class="law-detail-enacted-copy">${buildRichParagraphs(
                            lawMeta.enactedText ||
                                law.details ||
                                '该法条暂未填写核心条文。',
                            '（暂无核心条文）',
                            'law-empty-copy'
                        )}</div>
                    </div>
                    <ul class="law-detail-effects">${effectHtml}</ul>
                </div>

                <div class="law-clause-list">${clauseHtml}</div>
            </div>

            <div class="law-detail-visual">
                <div class="law-detail-image-wrap">
                    <img
                        class="law-detail-image"
                        src="${lawImage}"
                        alt="${stripColorTags(law.title || '法令插画')}"
                        onerror="this.onerror=null;this.src='${DEFAULT_PLACEHOLDER_IMAGE}';"
                        loading="lazy">
                </div>
                <div class="law-detail-overlay"></div>
                <div class="law-detail-quote">
                    ${parseAndColorText(
                        lawMeta.quote ||
                            sectionMeta.summary ||
                            categoryMeta.summary ||
                            '法律不是静止的碑文，而是帝国秩序对世界作出的持续宣告。'
                    )}
                </div>
            </div>
        </div>
    `;
};

const renderLawDetailView = (view, category, stateHistory) => {
    const shell = view.querySelector('.law-detail-shell');
    if (!shell) return;

    const categoryCrumb = stateHistory.find((crumb) => crumb.type === 'category');
    const lawCrumb = stateHistory.find((crumb) => crumb.type === 'item');
    const lawHistoryCrumb = stateHistory.find(
        (crumb) => crumb.type === 'lawHistory'
    );

    if (!categoryCrumb || !lawCrumb) {
        navigate(getLawCategoryState(categoryCrumb?.catIndex ?? 0));
        return;
    }

    const sectionCrumb = stateHistory.find(
        (crumb) => crumb.type === 'lawSection'
    );
    const sectionPath =
        sectionCrumb?.itemPath || getLawSectionPathFromLawPath(lawCrumb.itemPath);
    const section = getItemByPath(sectionPath, categoryCrumb.catIndex);
    const law = getItemByPath(lawCrumb.itemPath, categoryCrumb.catIndex);

    if (!law) {
        navigate(getLawCategoryState(categoryCrumb.catIndex));
        return;
    }

    const categoryMeta = getLawMeta(category);
    const sectionMeta = getLawMeta(section || {});
    const lawMeta = getLawMeta(law);
    const historyEntries = lawMeta.historyEntries;
    const historyIndex = Number.isInteger(lawHistoryCrumb?.historyIndex)
        ? lawHistoryCrumb.historyIndex
        : -1;
    const historyEntry =
        historyIndex >= 0 && historyEntries[historyIndex]
            ? historyEntries[historyIndex]
            : null;

    if (lawMeta.layout === CHARTER_LAW_LAYOUT_ID && !historyEntry) {
        renderCharterLawDetailView(view, law, lawCrumb.itemPath);
        return;
    }

    const detailTitle = historyEntry?.title || law.title || '未命名法令';
    const detailSubtitle = historyEntry?.summary || lawMeta.subtitle || '';
    const detailStatusLabel = historyEntry
        ? getLawHistoryStatusLabel(historyEntry)
        : lawMeta.statusLabel || '现行法令';
    const detailStatusText = historyEntry
        ? historyEntry.eraLabel ||
          historyEntry.note ||
          lawMeta.statusText ||
          sectionMeta.boardNote ||
          categoryMeta.boardNote ||
          '该法案已归入帝国档案。'
        : lawMeta.statusText ||
          sectionMeta.boardNote ||
          categoryMeta.boardNote ||
          '该法条已归入帝国法典。';
    const detailEnactedLabel = historyEntry
        ? '档案正文'
        : lawMeta.enactedLabel || '核心条文';
    const detailEnactedCopy = historyEntry
        ? historyEntry.text || historyEntry.note || historyEntry.summary
        : lawMeta.enactedText || law.details;
    const detailQuote = historyEntry?.note
        ? historyEntry.note
        : lawMeta.quote ||
          sectionMeta.summary ||
          categoryMeta.summary ||
          '法律不是静止的碑文，而是帝国秩序对世界作出的持续宣告。';
    const detailImage = resolveAssetPath(
        historyEntry?.image || law.image || section?.image || category.image
    );
    const effectHtml =
        buildLawEffectBadges(historyEntry || lawMeta) ||
        '<li class="law-effect-pill law-effect-pill--neutral">暂无影响标注</li>';

    const clauseCards = Array.isArray(law.subItems) ? law.subItems : [];
    const renderedDetailTitle =
        historyEntry?.title || law.title || '\u672a\u547d\u540d\u6cd5\u4ee4';
    const renderedDetailStatusLabel = historyEntry
        ? getLawHistoryStatusText(historyEntry)
        : lawMeta.statusLabel || '\u73b0\u884c\u6cd5\u4ee4';
    const renderedDetailStatusText = historyEntry
        ? historyEntry.eraLabel ||
          historyEntry.note ||
          lawMeta.statusText ||
          sectionMeta.boardNote ||
          categoryMeta.boardNote ||
          '\u8be5\u6cd5\u6848\u5df2\u5f52\u5165\u5e1d\u56fd\u6863\u6848\u3002'
        : lawMeta.statusText ||
          sectionMeta.boardNote ||
          categoryMeta.boardNote ||
          '\u8be5\u6cd5\u6761\u5df2\u5f52\u5165\u5e1d\u56fd\u6cd5\u5178\u3002';
    const renderedDetailEnactedLabel = historyEntry
        ? '\u6863\u6848\u6b63\u6587'
        : lawMeta.enactedLabel || '\u6838\u5fc3\u6761\u6587';
    const renderedDetailQuote = historyEntry?.note
        ? historyEntry.note
        : lawMeta.quote ||
          sectionMeta.summary ||
          categoryMeta.summary ||
          '\u6cd5\u5f8b\u4e0d\u662f\u9759\u6b62\u7684\u7891\u6587\uff0c\u800c\u662f\u5e1d\u56fd\u79e9\u5e8f\u5bf9\u4e16\u754c\u4f5c\u51fa\u7684\u6301\u7eed\u5ba3\u544a\u3002';
    const renderedEffectHtml =
        buildLawEffectBadges(historyEntry || lawMeta) ||
        '<li class="law-effect-pill law-effect-pill--neutral">\u6682\u65e0\u5f71\u54cd\u6807\u6ce8</li>';
    const clauseHtml = clauseCards.length
        ? clauseCards
              .map((clause, clauseIndex) => {
                  const clauseMeta = getLawMeta(clause);
                  const clauseEffects =
                      buildLawEffectBadges(clauseMeta, 'law-clause-effect') ||
                      '<li class="law-clause-effect law-clause-effect--neutral">暂无附加影响</li>';

                  return `<article class="law-clause-card">
                                <div class="law-clause-line"></div>
                                <div class="law-clause-content">
                                    <div class="law-clause-kicker">${parseAndColorText(
                                        clauseMeta.badge ||
                                            `法条细则 ${String(
                                                clauseIndex + 1
                                            ).padStart(2, '0')}`
                                    )}</div>
                                    <h2 class="law-clause-title">${parseAndColorText(
                                        clause.title || '未命名细则'
                                    )}</h2>
                                    ${
                                        clauseMeta.subtitle
                                            ? `<div class="law-clause-subtitle">${parseAndColorText(
                                                  clauseMeta.subtitle
                                              )}</div>`
                                            : ''
                                    }
                                    <div class="law-clause-text">${buildRichParagraphs(
                                        clause.details ||
                                            clauseMeta.note ||
                                            '该细则尚未填写正文。',
                                        '（暂无细则说明）',
                                        'law-empty-copy'
                                    )}</div>
                                    <ul class="law-clause-effects">${clauseEffects}</ul>
                                </div>
                            </article>`;
              })
              .join('')
        : `<article class="law-clause-card law-clause-card--empty">
                <div class="law-clause-line"></div>
                <div class="law-clause-content">
                    <div class="law-clause-kicker">法条细则</div>
                    <h2 class="law-clause-title">暂无细则卡片</h2>
                    <div class="law-clause-text">${buildRichParagraphs(
                        '可在 CMS 中继续为当前法令新增子节点，前端会自动将它们渲染为法条细则卡片。',
                        '（暂无细则说明）',
                        'law-empty-copy'
                    )}</div>
                </div>
            </article>`;

    const detailBodyHtml = historyEntry
        ? buildLawHistoryDetailSectionV2(historyEntry)
        : clauseHtml;

    shell.innerHTML = `
        <div class="law-detail-frame">
            <div class="law-detail-copy">
                <div class="law-detail-header">
                    <div class="law-detail-domain">${parseAndColorText(
                        section?.title || '帝国法律'
                    )}</div>
                    <h1 class="law-detail-title">${parseAndColorText(
                        renderedDetailTitle
                    )}</h1>
                    ${
                        detailSubtitle
                            ? `<div class="law-detail-subtitle">${parseAndColorText(
                                  detailSubtitle
                              )}</div>`
                            : ''
                    }
                    <div class="law-detail-status-row">
                        <span class="law-detail-status">${parseAndColorText(
                            renderedDetailStatusLabel
                        )}</span>
                        <span class="law-detail-status-copy">${parseAndColorText(
                            renderedDetailStatusText
                        )}</span>
                    </div>
                    <div class="law-detail-enacted">
                        <div class="law-detail-enacted-label">${parseAndColorText(
                            renderedDetailEnactedLabel
                        )}</div>
                        <div class="law-detail-enacted-copy">${buildRichParagraphs(
                            detailEnactedCopy,
                            historyEntry ? '（暂无档案正文）' : '（暂无核心条文）',
                            'law-empty-copy'
                        )}</div>
                    </div>
                    <ul class="law-detail-effects">${renderedEffectHtml}</ul>
                </div>

                <div class="law-clause-list">${detailBodyHtml}</div>
            </div>

            <div class="law-detail-visual">
                <div class="law-detail-image-wrap">
                    <img
                        class="law-detail-image"
                        src="${detailImage}"
                        alt="${stripColorTags(renderedDetailTitle || '\u6cd5\u5f8b\u63d2\u753b')}"
                        onerror="this.onerror=null;this.src='${DEFAULT_PLACEHOLDER_IMAGE}';"
                        loading="lazy">
                </div>
                <div class="law-detail-overlay"></div>
                <div class="law-detail-quote">
                    ${parseAndColorText(renderedDetailQuote)}
                </div>
            </div>
        </div>
    `;
};

const transformDataForG6 = (items, pathPrefix = '') => {
    return items.map((item, index) => {
        const currentPath = pathPrefix ? `${pathPrefix}.${index}` : `${index}`;
        const hasChildren = item.subItems && item.subItems.length > 0;
        return {
            id: currentPath,
            label: stripColorTags(item.title),
            originalData: { itemPath: currentPath, colorName: item.color, title: item.title, },
            children: hasChildren ? transformDataForG6(item.subItems, currentPath) : []
        };
    });
};
const wrapText = (text, maxWidth, fontSize) => {
    const estimateWidth = (char) => (char.charCodeAt(0) > 255 ? fontSize : fontSize * 0.6);
    let currentWidth = 0;
    let wrappedText = '';
    for (const char of text) {
        const charWidth = estimateWidth(char);
        if (currentWidth + charWidth > maxWidth) {
            wrappedText += '\n';
            currentWidth = 0;
        }
        wrappedText += char;
        currentWidth += charWidth;
    }
    return wrappedText;
};
const preprocessDataForG6 = (node) => {
    const MAX_WIDTH = 200, PADDING_H = 40, PADDING_V = 28, LINE_HEIGHT = 24, FONT_SIZE = 18;
    node.label = wrapText(node.label, MAX_WIDTH - PADDING_H, FONT_SIZE);
    const lineCount = (node.label.match(/\n/g) || []).length + 1;
    const height = lineCount * LINE_HEIGHT + PADDING_V;
    node.size = [MAX_WIDTH, height];
    if (node.children) node.children.forEach(child => preprocessDataForG6(child));
};
const initG6Tree = (data) => {
    const container = document.getElementById('g6-tree-container');
    if (!container) return;
    if (g6TreeInstance) {
        g6TreeInstance.destroy();
        g6TreeInstance = null;
    }
    preprocessDataForG6(data);
    setTimeout(() => {
        if (container.scrollWidth === 0 || container.scrollHeight === 0) {
             setTimeout(() => initG6Tree(data), 100);
             return;
        }
        const width = container.scrollWidth, height = container.scrollHeight;
        try {
            g6TreeInstance = new G6.TreeGraph({
                container: 'g6-tree-container', width, height, fitView: true, fitViewPadding: 20,
                modes: { default: [ 'collapse-expand', 'drag-canvas', 'zoom-canvas' ] },
                defaultNode: { type: 'rect', anchorPoints: [ [0.5, 0], [0.5, 1] ], style: { radius: 8, fill: '#fff', lineWidth: 2, },
                    labelCfg: { style: { fontSize: 18, lineHeight: 24, fontWeight: 'bold' }, },
                },
                defaultEdge: { type: 'polyline', style: { stroke: '#e0e0e0', lineWidth: 2 }, },
                layout: { type: 'compactBox', direction: 'TB', getId: (d) => d.id, getWidth: (d) => d.size[0], getHeight: (d) => d.size[1], getVGap: () => 50, getHGap: () => 60, },
            });
            g6TreeInstance.node((node) => {
                const color = window.colorPalette[node.originalData.colorName] || 'var(--border-color)';
                return { style: { stroke: color, shadowColor: color.replace(')', ', 0.3)').replace('rgb', 'rgba') }, labelCfg: { style: { fill: color } } };
            });
            g6TreeInstance.on('node:click', (evt) => {
                if (evt.target.get('name') === 'collapse-icon') return;
                const { item } = evt;
                const model = item.getModel();
                if (model.originalData) {
                    const { itemPath } = model.originalData;
                    const catIndex = currentHistory.find(h => h.type === 'category')?.catIndex;
                    if (itemPath !== undefined && catIndex !== undefined) navigate({ viewId: '#detail-view', history: [...currentHistory, { type: 'item', catIndex, itemPath }] });
                }
            });
            g6TreeInstance.data(data);
            g6TreeInstance.render();
            if (typeof window !== 'undefined') window.onresize = () => {
                if (!g6TreeInstance || g6TreeInstance.get('destroyed') || !container || !container.scrollWidth || !container.scrollHeight) return;
                g6TreeInstance.changeSize(container.scrollWidth, container.scrollHeight);
            };
        } catch (e) { console.error('[G6] G6 initialization failed:', e); }
    }, 10);
};

// --- 2. 渲染引擎 ---
const render = (state) => {
    try {
        const { viewId, history: stateHistory } = state || {};
        if (!viewId || !stateHistory) return;

        const view = views[viewId];
        if (!view) {
            console.error(`Render Error: View with ID "${viewId}" not found.`);
            return;
        }

        currentHistory = stateHistory;

        // ===== 面包屑：支持 category / item / library / novel / branchEvent =====
        const nav = view.querySelector('.breadcrumb');
        if (nav) {
            let breadcrumbHTML = `<a href="#" data-level="0">主页</a>`;

            stateHistory.forEach((crumb, index) => {
                let title = '未知';

                if (crumb.type === 'category') {
                    const cat = websiteData.categories[crumb.catIndex];
                    if (cat) title = cat.title;
                } else if (crumb.type === 'lawSection') {
                    const lawSection = getItemByPath(
                        crumb.itemPath,
                        crumb.catIndex
                    );
                    title = stripColorTags(lawSection?.title || '法律分册');
                } else if (crumb.type === 'item') {
                    const item = getItemByPath(crumb.itemPath, crumb.catIndex);
                    title = stripColorTags(item?.title || '未知条目');
                } else if (crumb.type === 'lawHistory') {
                    const lawNode = getItemByPath(
                        crumb.itemPath,
                        crumb.catIndex
                    );
                    const historyEntry =
                        getLawMeta(lawNode || {}).historyEntries?.[
                            crumb.historyIndex
                        ];
                    title = stripColorTags(
                        historyEntry?.title || '\u5386\u53f2\u6cd5\u6848'
                    );
                } else if (crumb.type === 'novel') {
                    title = '小说原文';
                } else if (crumb.type === 'library') {
                    title = '帝国中央文库';
                } else if (crumb.type === 'branchEvent') {
                    const cat = websiteData.categories[crumb.catIndex];
                    const branch =
                        cat && Array.isArray(cat.branches)
                            ? cat.branches[crumb.branchIndex]
                            : null;
                    const evt =
                        branch && Array.isArray(branch.events)
                            ? branch.events[crumb.eventIndex]
                            : null;

                    if (evt?.title) {
                        title = stripColorTags(evt.title);
                    } else if (branch?.title) {
                        title = stripColorTags(branch.title);
                    } else {
                        title = '分支事件';
                    }
                }

                breadcrumbHTML += `<span>›</span><a href="#" data-level="${index + 1}" class="${
                    index === stateHistory.length - 1 ? 'active' : ''
                }">${title}</a>`;
            });

            nav.innerHTML = breadcrumbHTML;
        }

        // ===== 视图分支 =====
        if (viewId === '#library-view') {
            if (window.LibraryRenderer) {
                window.LibraryRenderer.render();
            }
        } else if (viewId === '#reader-view') {
            const novelCrumb = stateHistory.find((h) => h.type === 'novel');
            if (novelCrumb && window.NovelReader) {
                window.NovelReader.open(
                    novelCrumb.novelId,
                    novelCrumb.paragraphId
                );
            }
        } else if (viewId === '#category-view') {
            const container = view.querySelector('.category-gateway');
            const displayCategories = websiteData.categories.filter(
                (cat) => cat.id !== 'novels'
            );
            container.innerHTML = displayCategories
                .map((cat) => {
                    const originalIndex = websiteData.categories.findIndex(
                        (c) => c.id === cat.id
                    );
                    let imageUrl = DEFAULT_PLACEHOLDER_IMAGE;
                    if (cat.image) imageUrl = resolveAssetPath(cat.image);
                    else if (cat.items?.[0]?.image) {
                        imageUrl = resolveAssetPath(cat.items[0].image);
                    } else if (cat.eras?.[0]?.image) {
                        imageUrl = resolveAssetPath(cat.eras[0].image);
                    }
                    return `<div class="category-panel animate-on-load"
                                 data-cat-id="${cat.id}"
                                 data-cat-index="${originalIndex}"
                                 style="background-image: url('${imageUrl}');">
                                <h2 class="panel-title">${cat.title}</h2>
                            </div>`;
                })
                .join('');
        } else if (viewId === '#law-hub-view') {
            const { catIndex = 0 } =
                stateHistory.find((h) => h.type === 'category') || {};
            const category = websiteData.categories[catIndex];
            if (!isLawCategory(category)) {
                navigate({ viewId: '#category-view', history: [] });
                return;
            }

            renderLawHubView(view, category, catIndex, stateHistory);
        } else if (viewId === '#law-detail-view') {
            const { catIndex = 0 } =
                stateHistory.find((h) => h.type === 'category') || {};
            const category = websiteData.categories[catIndex];
            if (!isLawCategory(category)) {
                navigate({ viewId: '#category-view', history: [] });
                return;
            }

            renderLawDetailView(view, category, stateHistory);
        } else if (viewId === '#list-view') {
            const { catIndex = 0 } =
                stateHistory.find((h) => h.type === 'category') || {};
            const category = websiteData.categories[catIndex];
            if (!category) {
                navigate({ viewId: '#category-view', history: [] });
                return;
            }

            const items = category.items || [];
            const listWrapper = view.querySelector('.list-wrapper');
            const treeWrapper = view.querySelector('.tree-wrapper');
            const toggle = view.querySelector('.view-mode-toggle');
            if (!listWrapper || !treeWrapper || !toggle) return;

            const isHierarchical = items.some(
                (item) => item.subItems && item.subItems.length > 0
            );
            toggle.style.display = isHierarchical ? 'flex' : 'none';
            if (!isHierarchical) appState.currentListMode = 'list';

            listWrapper.innerHTML = buildListHtml(items);

            if (g6TreeInstance) {
                g6TreeInstance.destroy();
                g6TreeInstance = null;
            }

            if (appState.currentListMode === 'list') {
                listWrapper.classList.add('active');
                treeWrapper.classList.remove('active');
                toggle
                    .querySelector('[data-mode="list"]')
                    .classList.add('active');
                toggle
                    .querySelector('[data-mode="tree"]')
                    .classList.remove('active');
            } else {
                listWrapper.classList.remove('active');
                treeWrapper.classList.add('active');
                toggle
                    .querySelector('[data-mode="list"]')
                    .classList.remove('active');
                toggle
                    .querySelector('[data-mode="tree"]')
                    .classList.add('active');
            }
        } else if (viewId === '#timeline-view') {
            const { catIndex } = stateHistory.find(
                (h) => h.type === 'category'
            );
            if (window.Timeline && typeof window.Timeline.init === 'function') {
                const playAnimation =
                    currentViewId !== '#detail-view' &&
                    currentViewId !== '#reader-view';
                window.Timeline.init(
                    view,
                    catIndex,
                    navigate,
                    parseAndColorText,
                    playAnimation,
                    {
                        focusEraIndex:
                            appState.timelineFocusByCategory[catIndex],
                    }
                );
            }
        } else if (viewId === '#detail-view') {
            removeTimelineDetailNavigator(view);
            removeTimelineBranchControls(view);
            // ===== 详情页：兼容主线 item 和支线 branchEvent =====
            const itemCrumb = stateHistory.find((h) => h.type === 'item');
            const branchCrumb = stateHistory.find(
                (h) => h.type === 'branchEvent'
            );

            let title = '';
            let image = '';
            let details = '';
            let isTimelineDetail = false;

            if (branchCrumb) {
                isTimelineDetail = true;
                // 支线事件优先
                const cat = websiteData.categories[branchCrumb.catIndex];
                const branch =
                    cat && Array.isArray(cat.branches)
                        ? cat.branches[branchCrumb.branchIndex]
                        : null;
                const evt =
                    branch && Array.isArray(branch.events)
                        ? branch.events[branchCrumb.eventIndex]
                        : null;

                if (evt) {
                    title = evt.title || branch?.title || '分支事件';
                    image =
                        evt.image ||
                        branch?.image ||
                        cat?.image ||
                        DEFAULT_PLACEHOLDER_IMAGE;
                    details = evt.details || branch?.details || '';
                } else if (branch) {
                    // 找不到具体事件，就展示整个支线
                    title = branch.title || '分支事件';
                    image =
                        branch.image ||
                        cat?.image ||
                        DEFAULT_PLACEHOLDER_IMAGE;
                    details = branch.details || '';
                }
            } else if (itemCrumb) {
                // 原来的主线逻辑
                const { catIndex, itemPath } = itemCrumb;
                isTimelineDetail = Array.isArray(websiteData.categories[catIndex]?.eras);
                const item = getItemByPath(itemPath, catIndex);
                if (item) {
                    title = item.title || '';
                    image = item.image || DEFAULT_PLACEHOLDER_IMAGE;
                    details = item.details || '';
                }
            }

            // 真空兜底：完全没取到数据就别动 DOM
            if (!title && !details && !image) {
                console.warn(
                    '[DetailView] 无法解析 detail-view 数据：',
                    stateHistory
                );
                return;
            }

            const imgEl = view.querySelector('#detail-image');
            if (imgEl) {
                imgEl.src = resolveAssetPath(image);
                imgEl.alt = stripColorTags(title || '重大事件配图');
                imgEl.classList.toggle('is-zoomable', isTimelineDetail);
                if (isTimelineDetail) {
                    imgEl.setAttribute('role', 'button');
                    imgEl.setAttribute('tabindex', '0');
                    imgEl.setAttribute('aria-label', '点击放大重大事件配图');
                } else {
                    imgEl.removeAttribute('role');
                    imgEl.removeAttribute('tabindex');
                    imgEl.removeAttribute('aria-label');
                }
                imgEl.onerror = () => {
                    imgEl.src = DEFAULT_PLACEHOLDER_IMAGE;
                };
            }

            const titleEl = view.querySelector('#detail-title');
            if (titleEl) {
                titleEl.innerHTML = parseAndColorText(title || '');
            }

            const textEl = view.querySelector('#detail-text');
            if (textEl) {
                const safeDetails = details || '';
                textEl.innerHTML = safeDetails.trim()
                    ? `<p>${parseAndColorText(safeDetails).replace(
                          /\n/g,
                          '</p><p>'
                      )}</p>`
                    : `<p style="color:var(--text-muted);">（暂未填写正文）</p>`;
            }

            renderTimelineDetailNavigator(
                view,
                getTimelineDetailNavTargets(stateHistory)
            );
            renderTimelineBranchControls(view, stateHistory);
            rememberTimelineDetailFocus(stateHistory);
        }
    } catch (error) {
        console.error('Render Error:', error);
    }
};


// --- 3. 视图切换与动画控制器 ---
const syncGlobalControlsForView = (viewId) => {
    const libraryViewIds = new Set([
        '#library-view',
        '#category-view',
        '#law-hub-view',
        '#law-detail-view',
        '#list-view',
        '#detail-view',
        '#reader-view'
    ]);

    const inLibrary = libraryViewIds.has(viewId);

    if (themeToggleButton) {
        if (inLibrary) {
            themeToggleButton.style.opacity = '0';
            themeToggleButton.style.pointerEvents = 'none';
            themeToggleButton.style.transform = 'translateY(-20px)';
        } else {
            themeToggleButton.style.opacity = '';
            themeToggleButton.style.pointerEvents = '';
            themeToggleButton.style.transform = '';
        }
    }

    if (viewId === '#landing-view' && logo) {
        logo.style.visibility = 'visible';
        revealLandingIntro();
    }
};

const animateViewEntryElements = (view, viewId) => {
    if (!view) return;

    const commonElements = view.querySelectorAll('.back-button, .breadcrumb, .view-mode-toggle, .reader-controls');
    commonElements.forEach(el => {
        el.classList.remove('animate-in');
        void el.offsetWidth;
        el.classList.add('animate-in');
    });

    if (viewId !== '#library-view') {
        const animatedContent = view.querySelectorAll('.category-gateway, .law-hub-shell, .law-detail-shell, .view-content-container, .detail-content, .timeline-container, .reader-content-wrapper');
        animatedContent.forEach((el) => {
             const childrenToAnimate = el.querySelectorAll('.category-panel, .law-column, .law-entry-shell, .law-entry, .law-clause-card, .law-history-card, .law-detail-copy, .law-detail-visual, .law-charter-track, .law-charter-center, .law-charter-final-wrap, .law-charter-focus, .list-item, .detail-left, .detail-right');
             if (childrenToAnimate.length > 0){
                void el.offsetWidth;
                childrenToAnimate.forEach((child, index) => {
                    if(index > 20) return;
                    child.classList.remove('animate-in');
                    child.style.animationDelay = `${index * 50}ms`;
                    child.classList.add('animate-in');
                });
             }
        });
    }
};

const showView = (state) => {
    const nextView = views[state.viewId];
    const currentView = views[currentViewId];
    if (!nextView || (currentView === nextView && !state.forceRender)) {
        appState.isNavigating = false;
        document.body.classList.remove('is-navigating');
        return;
    }
    
    currentView.classList.remove('active-view');

    setTimeout(() => {
        nextView.classList.add('active-view');
        currentViewId = state.viewId;

// === 图书馆模式：隐藏全局主题按钮 ===
        const libraryViewIds = new Set([
            '#library-view',
            '#category-view',
            '#law-hub-view',
            '#law-detail-view',
            '#list-view',
            '#detail-view',
            '#reader-view'
        ]);

        const inLibrary = libraryViewIds.has(state.viewId);

        if (themeToggleButton) {
            if (inLibrary) {
                // 进入图书馆：隐藏全局明暗开关
                themeToggleButton.style.opacity = '0';
                themeToggleButton.style.pointerEvents = 'none';
                themeToggleButton.style.transform = 'translateY(-20px)';
            } else {
                // 回到首页 / 图谱等：恢复全局明暗开关
                themeToggleButton.style.opacity = '';
                themeToggleButton.style.pointerEvents = '';
                themeToggleButton.style.transform = '';
            }
        }


        // 【【【 CORE FIX: Ensure logo is visible when returning to the landing page 】】】
        if (state.viewId === '#landing-view') {
            logo.style.visibility = 'visible';
            revealLandingIntro();
        }

        const commonElements = nextView.querySelectorAll('.back-button, .breadcrumb, .view-mode-toggle, .reader-controls');
        commonElements.forEach(el => {
            el.classList.remove('animate-in');
            void el.offsetWidth;
            el.classList.add('animate-in');
        });

        if (state.viewId !== '#library-view') {
            const animatedContent = nextView.querySelectorAll('.category-gateway, .law-hub-shell, .law-detail-shell, .view-content-container, .detail-content, .timeline-container, .reader-content-wrapper');
            animatedContent.forEach((el) => {
                 const childrenToAnimate = el.querySelectorAll('.category-panel, .law-column, .law-entry-shell, .law-entry, .law-clause-card, .law-history-card, .law-detail-copy, .law-detail-visual, .law-charter-track, .law-charter-center, .law-charter-final-wrap, .law-charter-focus, .list-item, .detail-left, .detail-right');
                 if (childrenToAnimate.length > 0){
                    void el.offsetWidth;
                    childrenToAnimate.forEach((child, index) => {
                        if(index > 20) return;
                        child.classList.remove('animate-in');
                        child.style.animationDelay = `${index * 50}ms`;
                        child.classList.add('animate-in');
                    });
                 }
            });
        }

        appState.isNavigating = false;
        document.body.classList.remove('is-navigating');
    }, APP_BOOT_CONFIG.viewTransitionMs);
};

// --- 4. 导航核心 ---
const setLawHistoryPanelOpen = (toggleButton, isOpen) => {
    if (!toggleButton) return;

    const historyWrap = toggleButton.closest('.law-entry-history');
    const panel = historyWrap?.querySelector('.law-entry-history-panel');
    const countNode = toggleButton.querySelector('.law-entry-history-toggle-count');

    toggleButton.classList.toggle('is-open', isOpen);
    toggleButton.setAttribute('aria-expanded', isOpen ? 'true' : 'false');

    if (panel) {
        panel.classList.toggle('is-open', isOpen);
        panel.classList.remove('is-animating');
        if (isOpen) {
            void panel.offsetWidth;
            panel.classList.add('is-animating');
        }
    }

    if (countNode) {
        countNode.textContent = isOpen ? '\u6536\u8d77' : '\u5c55\u5f00';
    }
};

const navigate = (state, isReplacing = false) => {
    if (appState.isNavigating && !state.forceRender) return;
    appState.isNavigating = true;
    document.body.classList.add('is-navigating');
    render(state);
    const url = buildRouteUrl(state);
    if (isReplacing) history.replaceState(state, '', url); 
    else history.pushState(state, '', url);
    showView(state);
};

// --- 5. 事件处理 ---
document.body.addEventListener('click', (e) => {
    if (appState.isNavigating) { e.preventDefault(); return; }

    const zoomableDetailImage = e.target.closest('#detail-image.is-zoomable');
    if (zoomableDetailImage && currentViewId === '#detail-view') {
        e.preventDefault();
        openImageLightbox(zoomableDetailImage);
        return;
    }

    const timelineMainReturn = e.target.closest('.timeline-main-return');
    if (timelineMainReturn && currentViewId === '#detail-view') {
        e.preventDefault();
        const target = getTimelineBranchReturnTarget(currentHistory);
        if (target?.state) {
            navigate(target.state, true);
        }
        return;
    }

    const timelineBranchEntry = e.target.closest(
        '.timeline-branch-entry[data-branch-index]'
    );
    if (timelineBranchEntry && currentViewId === '#detail-view') {
        e.preventDefault();
        const categoryCrumb = currentHistory.find((crumb) => crumb.type === 'category');
        const branchIndex = Number(timelineBranchEntry.dataset.branchIndex);
        const eventIndex = Number(timelineBranchEntry.dataset.eventIndex || 0);
        if (
            categoryCrumb &&
            Number.isInteger(categoryCrumb.catIndex) &&
            Number.isInteger(branchIndex) &&
            Number.isInteger(eventIndex)
        ) {
            navigate(
                buildTimelineBranchEventState(
                    categoryCrumb.catIndex,
                    branchIndex,
                    eventIndex
                )
            );
        }
        return;
    }

    const timelineDetailNavButton = e.target.closest(
        '.timeline-detail-nav-button[data-direction]'
    );
    if (timelineDetailNavButton) {
        e.preventDefault();
        if (timelineDetailNavButton.disabled) return;

        const direction = timelineDetailNavButton.dataset.direction;
        const navTargets = getTimelineDetailNavTargets(currentHistory);
        const target =
            direction === 'previous' ? navTargets?.previous : navTargets?.next;
        if (target?.state) {
            navigate(target.state, true);
        }
        return;
    }
    
    const backButton = e.target.closest('.back-button');
    if (backButton) { e.preventDefault(); history.back(); return; }

    const libraryIcon = e.target.closest('#library-icon');
    if (libraryIcon) {
        e.preventDefault();
        navigate({ viewId: '#library-view', history: [{ type: 'library' }] });
        return;
    }
    
    const logoIcon = e.target.closest('#logo');
    if (logoIcon) {
        e.preventDefault();
        if (currentViewId !== '#landing-view') {
            navigate({ viewId: '#landing-view', history: [] });
        } else {
            transitionFromLanding();
        }
        return;
    }
    
    const novelLink = e.target.closest('a.novel-link');
    if (novelLink) {
        e.preventDefault();
        const novelId = novelLink.dataset.novelId;
        const paragraphId = novelLink.dataset.gotoId;
        if (novelId) {
            globalNavigator.gotoNovelLocation(novelId, paragraphId);
        }
        return;
    }
    
    const categoryPanel = e.target.closest('.category-panel');
    if (categoryPanel) {
        e.preventDefault();
        const catIndex = parseInt(categoryPanel.dataset.catIndex);
        if (isNaN(catIndex)) return;
        const category = websiteData.categories[catIndex];
        if (isLawCategory(category)) {
            navigate(getLawCategoryState(catIndex));
            return;
        }
        const nextViewId = category.eras ? '#timeline-view' : '#list-view';
        navigate({ viewId: nextViewId, history: [{ type: 'category', catIndex }] });
        return;
    }

    const lawHistoryToggle = e.target.closest(
        '.law-entry-history-toggle[data-law-path]'
    );
    if (lawHistoryToggle) {
        e.preventDefault();
        e.stopPropagation();
        const catIndex = parseInt(lawHistoryToggle.dataset.catIndex);
        const lawPath = lawHistoryToggle.dataset.lawPath;
        if (isNaN(catIndex) || !lawPath) return;

        const panelKey = getLawHistoryPanelKey(catIndex, lawPath);
        const nextIsOpen = !Boolean(appState.activeLawHistoryPanels[panelKey]);
        appState.activeLawHistoryPanels[panelKey] = nextIsOpen;
        setLawHistoryPanelOpen(lawHistoryToggle, nextIsOpen);
        return;
    }

    const lawHistoryLink = e.target.closest(
        '.law-entry-history-link[data-law-path][data-history-index]'
    );
    if (lawHistoryLink) {
        e.preventDefault();
        e.stopPropagation();
        const catIndex = parseInt(lawHistoryLink.dataset.catIndex);
        const sectionPath = lawHistoryLink.dataset.sectionPath;
        const lawPath = lawHistoryLink.dataset.lawPath;
        const historyIndex = parseInt(lawHistoryLink.dataset.historyIndex);
        if (
            isNaN(catIndex) ||
            !sectionPath ||
            !lawPath ||
            isNaN(historyIndex)
        ) {
            return;
        }

        navigate({
            viewId: '#law-detail-view',
            history: [
                { type: 'category', catIndex },
                { type: 'lawSection', catIndex, itemPath: sectionPath },
                { type: 'item', catIndex, itemPath: lawPath },
                { type: 'lawHistory', catIndex, itemPath: lawPath, historyIndex },
            ],
        });
        return;
    }

    const lawEntry = e.target.closest('.law-entry[data-law-path]');
    if (lawEntry) {
        e.preventDefault();
        const catIndex = parseInt(lawEntry.dataset.catIndex);
        const sectionPath = lawEntry.dataset.sectionPath;
        const lawPath = lawEntry.dataset.lawPath;
        if (isNaN(catIndex) || !sectionPath || !lawPath) return;
        navigate({
            viewId: '#law-detail-view',
            history: [
                { type: 'category', catIndex },
                { type: 'lawSection', catIndex, itemPath: sectionPath },
                { type: 'item', catIndex, itemPath: lawPath },
            ],
        });
        return;
    }

    const lawTab = e.target.closest('.law-hub-tab[data-section-target]');
    if (lawTab) {
        e.preventDefault();
        const target = lawTab.dataset.sectionTarget;
        const categoryCrumb = currentHistory.find(
            (crumb) => crumb.type === 'category'
        )
        if (!categoryCrumb || target === undefined) {
            return;
        }

        const activeSectionCrumb = currentHistory.find(
            (crumb) => crumb.type === 'lawSection'
        );
        if (activeSectionCrumb?.itemPath === target) {
            return;
        }

        navigate(
            getLawHubState(categoryCrumb.catIndex, target),
            Boolean(activeSectionCrumb)
        );
        return;
    }

    const charterNode = e.target.closest(
        '.law-charter-node[data-charter-step-path]'
    );
    if (charterNode && currentViewId === '#law-detail-view') {
        e.preventDefault();
        const lawCrumb = currentHistory.find((crumb) => crumb.type === 'item');
        const stepPath = charterNode.dataset.charterStepPath;
        if (!lawCrumb || !stepPath) {
            return;
        }

        appState.activeCharterSelections[getLawItemPathKey(lawCrumb.itemPath)] =
            stepPath;
        render({ viewId: '#law-detail-view', history: currentHistory });
        return;
    }
    
    const listItem = e.target.closest('.list-item');
    if (listItem) {
        e.preventDefault();
        const itemPath = listItem.dataset.itemPath;
        const catIndex = currentHistory.find(h => h.type === 'category')?.catIndex;
        if (itemPath !== undefined && catIndex !== undefined) {
            const itemData = getItemByPath(itemPath, catIndex);
            if (websiteData.categories[catIndex].id === 'novels' && itemData.id) {
                globalNavigator.gotoNovelLocation(itemData.id, null);
            } else {
                navigate({ viewId: '#detail-view', history: [...currentHistory, { type: 'item', catIndex, itemPath }] });
            }
        }
        return;
    }
    
    const breadcrumbLink = e.target.closest('.breadcrumb a');
    if (breadcrumbLink) {
        e.preventDefault();
        const level = parseInt(breadcrumbLink.dataset.level);
        if (isNaN(level) || breadcrumbLink.classList.contains('active')) return;
        if (level === 0) {
            navigate({ viewId: '#landing-view', history: [] });
            return;
        }

        const targetHistory = currentHistory.slice(0, level);
        const targetCrumb = targetHistory[targetHistory.length - 1];
        if (targetCrumb?.type === 'category') {
            const category = websiteData.categories[targetCrumb.catIndex];
            if (isLawCategory(category)) {
                navigate(getLawCategoryState(targetCrumb.catIndex));
                return;
            }
            if (Array.isArray(category?.eras)) {
                navigate({
                    viewId: '#timeline-view',
                    history: targetHistory,
                });
                return;
            }
            navigate({
                viewId: '#list-view',
                history: targetHistory,
            });
            return;
        }

        history.go(-(currentHistory.length - level));
    }
});

document.addEventListener('keydown', (event) => {
    if (appState.isNavigating) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;

    const activeElement = document.activeElement;
    if (
        currentViewId === '#detail-view' &&
        activeElement?.matches?.('#detail-image.is-zoomable')
    ) {
        event.preventDefault();
        openImageLightbox(activeElement);
    }
});

const listView = document.getElementById('list-view');
if (listView) {
    const toggleContainer = listView.querySelector('.view-mode-toggle');
    const listWrapper = listView.querySelector('.list-wrapper');
    const treeWrapper = listView.querySelector('.tree-wrapper');
    if (toggleContainer && listWrapper && treeWrapper) {
        toggleContainer.addEventListener('click', async (e) => {
        const button = e.target.closest('.toggle-button');
        if (!button || button.classList.contains('active')) return;
        appState.currentListMode = button.dataset.mode;
        toggleContainer.querySelector('.active').classList.remove('active');
        button.classList.add('active');
        
        if (appState.currentListMode === 'list') {
            treeWrapper.classList.remove('active'); listWrapper.classList.add('active');
        } else {
            listWrapper.classList.remove('active'); treeWrapper.classList.add('active');
            if (!appState.isG6Loaded) {
                const treeContainer = document.getElementById('g6-tree-container');
                try {
                    treeContainer.innerHTML = `<div class="loading-placeholder">正在加载树状视图模块...</div>`;
                    await loadScript(APP_BOOT_CONFIG.g6CdnUrl);
                    appState.isG6Loaded = true;
                    treeContainer.innerHTML = '';
                } catch(error) {
                    console.error("加载 G6 失败:", error);
                    treeContainer.innerHTML = `<div class="loading-placeholder error">树状视图加载失败，请刷新重试。</div>`;
                    return;
                }
            }
            
            const { catIndex = 0 } = currentHistory.find(h => h.type === 'category') || {};
            const items = websiteData.categories[catIndex]?.items || [];
            const transformedData = transformDataForG6(items);
            if (transformedData.length > 0) initG6Tree(transformedData[0]);
        }
        });
    }
}

window.addEventListener('popstate', (e) => {
    const state = e.state || parseRouteStateFromLocation() || DEFAULT_ROUTE_STATE;
    if (state.viewId === '#landing-view') {
        logo.style.visibility = 'visible';
    }
    render(state);
    showView({ ...state, forceRender: true });
});

const transitionFromLanding = () => {
    appState.isNavigating = true;
    document.body.classList.add('is-navigating');
    const logoRect = logo.getBoundingClientRect();
    const logoClone = logo.cloneNode(true);
    logoClone.classList.remove('breathe');
    
    logoClone.classList.add('logo-portal-clone');
document.body.classList.add('landing-portal-mode');

    
    const logoCenterX = logoRect.left + logoRect.width / 2;
    const logoCenterY = logoRect.top + logoRect.height / 2;
    logoClone.style.cssText = `position:fixed; top:${logoCenterY}px; left:${logoCenterX}px; width:${logoRect.width}px; height:${logoRect.height}px; margin:0; transform:translate(-50%,-50%) scale(1); z-index:9999;`;
    logoClone.style.transition = 'transform 0.8s cubic-bezier(0.25, 1, 0.5, 1), top 0.8s cubic-bezier(0.25, 1, 0.5, 1), left 0.8s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.3s linear 0.5s';
    logo.style.visibility = 'hidden';
    document.body.appendChild(logoClone);
    const nextState = { viewId: '#category-view', history: [] };
    
    const categoryView = views['#category-view'];
if (categoryView) {
    categoryView.classList.add('enter-from-logo-portal');
}

    
    render(nextState);
    history.pushState(nextState, '', buildRouteUrl(nextState));
    requestAnimationFrame(() => {
        const scale = Math.min(window.innerWidth / logoRect.width, window.innerHeight / logoRect.height) * 0.9;
        logoClone.style.transform = `translate(-50%, -50%) scale(${scale})`;
        logoClone.style.top = '50%';
        logoClone.style.left = '50%';
        logoClone.style.opacity = '0';
    });
    
  logoClone.addEventListener('transitionend', () => {
    logoClone.remove();
    logo.style.visibility = 'visible';
    document.body.classList.remove('landing-portal-mode');
    appState.isNavigating = false;
}, { once: true });

setTimeout(() => {
    views['#landing-view'].classList.remove('active-view');
    showView(nextState);
    if (categoryView) {
        // 下一帧把 enter-from-logo-portal 移除，避免之后普通导航也用这个动画
        requestAnimationFrame(() => {
            categoryView.classList.remove('enter-from-logo-portal');
        });
    }
}, APP_BOOT_CONFIG.viewTransitionMs);

};

// 统一一个内容 API 前缀，未来要改只改这里

// --- 小说清单（manifest.json）轻量缓存 ---
// 目标：
// 1. 不阻塞首屏初始化。
// 2. 小说页真正需要时再请求。
// 3. 同一会话内避免重复拉取相同 manifest。
window.__novelManifestCache = window.__novelManifestCache || null;
let __novelManifestPromise = null;

async function loadNovelManifest() {
    // Reuse the merged-module loader if it registered first.
    if (typeof window.__loadNovelManifest === 'function' && window.__loadNovelManifest !== loadNovelManifest) {
        return window.__loadNovelManifest();
    }

    if (Array.isArray(window.__novelManifestCache)) {
        return window.__novelManifestCache;
    }

    if (__novelManifestPromise) {
        return __novelManifestPromise;
    }

    __novelManifestPromise = fetch('/novels_data/manifest.json', { cache: 'no-cache' })
        .then((response) => {
            if (!response.ok) {
                throw new Error(`manifest.json 网络错误: ${response.status}`);
            }
            return response.json();
        })
        .then((novels) => {
            window.__novelManifestCache = novels;
            return novels;
        })
        .catch((error) => {
            __novelManifestPromise = null;
            throw error;
        });

    return __novelManifestPromise;
}

window.__loadNovelManifest = loadNovelManifest;

function prefetchNovelManifestIdle() {
    const start = () => {
        // 预取不应抛到全局
        loadNovelManifest().catch(() => {});
    };
    if ('requestIdleCallback' in window) {
        requestIdleCallback(start, { timeout: APP_BOOT_CONFIG.novelManifestIdleTimeoutMs });
    } else {
        setTimeout(start, APP_BOOT_CONFIG.novelManifestFallbackDelayMs);
    }
}

// --- 初始化流程 ---
async function initializeApp() {
    const bootRouteState =
        parseRouteStateFromLocation() || history.state || DEFAULT_ROUTE_STATE;
    if (bootRouteState.viewId === '#landing-view') {
        revealLandingIntro();
    }

    // ① 先从后端拿 website-data
    await loadWebsiteData();

    // ② 小说清单：改为低优先级预取（不阻塞首屏）
    // 保留原功能：仍然会在后台把 novels 挂到 websiteData 里，供搜索/统一数据结构使用
    prefetchNovelManifestIdle();
    (async () => {
        try {
            const novelItems = await loadNovelManifest();
            if (Array.isArray(novelItems) && novelItems.length > 0) {
                const novelsCategory = {
                    id: 'novels',
                    title: '小说原文',
                    items: novelItems
                };
                // 避免重复插入
                const exists = websiteData?.categories?.some?.(c => c && c.id === 'novels');
                if (!exists && websiteData && Array.isArray(websiteData.categories)) {
                    websiteData.categories.push(novelsCategory);
                }
            }
        } catch (e) {
            console.warn('小说清单预取失败（不影响首屏）:', e);
        }
    })();

    // ③ 原来就有的初始化逻辑保持不变
    // ③ 原来就有的初始化逻辑保持不变
    if (window.LibraryRenderer) window.LibraryRenderer.init();
    if (window.NovelReader) window.NovelReader.init();
    if (window.AIAgent) window.AIAgent.init();

    let initialState =
        parseRouteStateFromLocation() || history.state || DEFAULT_ROUTE_STATE;
    currentViewId = '#landing-view';
    currentHistory = initialState.history;
    render(initialState);

    if (initialState.viewId === '#landing-view') {
        syncGlobalControlsForView('#landing-view');
    } else {
        Object.values(views).forEach((view) => {
            if (view) view.classList.remove('active-view');
        });
        if (views[initialState.viewId]) {
            views[initialState.viewId].classList.add('active-view');
            syncGlobalControlsForView(initialState.viewId);
            animateViewEntryElements(views[initialState.viewId], initialState.viewId);
        }
        currentViewId = initialState.viewId;
    }

    history.replaceState(initialState, '', buildRouteUrl(initialState));
    appState.hasInitialized = true;
}


// 启动应用
initializeApp();

// 切换背景的函数
function toggleBackground(isMosaic) {
    if (isMosaic) {
        document.body.classList.add('mosaic-background');
    } else {
        document.body.classList.remove('mosaic-background');
    }
}
/*背景切换按钮*/
const toggleButton = document.getElementById('background-toggle');

if (toggleButton) {
    toggleButton.addEventListener('click', () => {
        const isMosaic = !document.body.classList.contains('mosaic-background');
        toggleBackground(isMosaic);

        // 呼吸光：保持背景激活状态
        if (isMosaic) {
            toggleButton.classList.add('bg-toggle-active');
        } else {
            toggleButton.classList.remove('bg-toggle-active');
        }

        // 点击触发扩散波：一次性动画
        toggleButton.classList.remove('bg-toggle-pulsing');
        void toggleButton.offsetWidth;  // 强制重绘，用于重新触发动画
        toggleButton.classList.add('bg-toggle-pulsing');

        // 替换图标
        const svgIcon = toggleButton.querySelector('svg');
        if (svgIcon) {
            if (isMosaic) {
                svgIcon.innerHTML =
                    '<circle cx="12" cy="12" r="10" />' +
                    '<line x1="7" y1="12" x2="17" y2="12" />' +
                    '<line x1="12" y1="7" x2="12" y2="17" />';
            } else {
                svgIcon.innerHTML =
                    '<circle cx="12" cy="12" r="10" />' +
                    '<line x1="4" y1="12" x2="20" y2="12" />';
            }
        }
    });

    // 扩散波结束时清除脉冲类（不影响呼吸光）
    toggleButton.addEventListener('animationend', (e) => {
        if (e.animationName === 'bg-toggle-pulse') {
            toggleButton.classList.remove('bg-toggle-pulsing');
        }
    });
}

// --- 刷新强制回到首页 ---
window.addEventListener('DOMContentLoaded', () => {
    if (!appState.hasInitialized) return;
    // 首屏文案动画不应被数据请求阻塞
    if (currentViewId === '#landing-view') {
        revealLandingIntro();
    }
    // 覆盖浏览器刷新的默认路由状态
    const resolvedState =
        parseRouteStateFromLocation() || history.state || DEFAULT_ROUTE_STATE;
    history.replaceState(resolvedState, '', buildRouteUrl(resolvedState));

    // 页面加载后立即跳回首页视图
    if (
        !areStatesEquivalent(resolvedState, {
            viewId: currentViewId,
            history: currentHistory,
        })
    ) {
        navigate(resolvedState, true);
    }
});
