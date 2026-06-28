// admin.js - UHE Central Archive CMS 后台（完整版）
// 功能：
//  - 读取 /content-api/website-data
//  - 编辑 / 保存
//  - 上传图片
//  - 同层级拖拽排序
//  - 颜色标签插入 / 去除
//  - 一键预览渲染 details
//  - 全局搜索（标题 / ID / 正文）+ 按类型过滤
//  - 时间支线（branches）/ 支线事件（events）编辑

// ====== 基本配置 ======
// Local development may host the CMS API on a dedicated port.
const CONTENT_API_BASE = window.appConfig?.CONTENT_API_BASE || "";
const API_BASE = `${CONTENT_API_BASE}/content-api`;
const GET_ENDPOINT = `${API_BASE}/website-data`;
const SAVE_ENDPOINT = `${API_BASE}/admin/website-data`;
const UPLOAD_ENDPOINT = `${API_BASE}/admin/upload-image`;
const UPLOAD_AUDIO_ENDPOINT = `${API_BASE}/admin/upload-audio`;
const DELETE_AUDIO_ENDPOINT = `${API_BASE}/admin/delete-audio`;
const ADMIN_SECURITY_ENDPOINT = `${API_BASE}/admin/security`;
const CHANGE_ADMIN_TOKEN_ENDPOINT = `${API_BASE}/admin/security/token`;

// ====== 小说管理（新增，不影响既有 website-data 管理） ======
// 前台仍然直接读取 /novels_data/manifest.json 与 /novels_data/<id>.json。
// 后台通过 content-api 增量管理 novels_data 目录。
const NOVELS_MANIFEST_ENDPOINT = `${API_BASE}/novels/manifest`;
const NOVELS_GET_ENDPOINT = `${API_BASE}/novels`; // /:id
const NOVELS_SAVE_MANIFEST_ENDPOINT = `${API_BASE}/admin/novels/manifest`;
const NOVELS_SAVE_NOVEL_ENDPOINT = `${API_BASE}/admin/novels`; // /:id
const NOVELS_DELETE_NOVEL_ENDPOINT = `${API_BASE}/admin/novels`; // /:id/delete
const NOVELS_UPLOAD_ENDPOINT = `${API_BASE}/admin/novels/upload`;
const NOVELS_UPLOAD_DOCX_ENDPOINT = `${API_BASE}/admin/novels/upload-docx`;
const NOVELS_UPLOAD_TXT_ENDPOINT = `${API_BASE}/admin/novels/upload-txt`;

let websiteData = null;
let adminToken = "";
let selectedPath = null;
let adminSecurityInfo = null;
let searchResultsCollapsed = false;
let lastSearchResultsCount = 0;
const SEARCH_RESULTS_COLLAPSED_KEY = "uhe_admin_search_results_collapsed";
let collapsedTreeNodeKeys = new Set();
const TREE_COLLAPSE_STORAGE_KEY = "uhe_admin_tree_collapsed_nodes";
const EDITOR_ACTION_DOCK_STORAGE_KEY = "uhe_admin_editor_action_dock";
const EDITOR_ACTION_DOCK_TOP = 0;
const EDITOR_ACTION_DOCK_SIDE = 18;
const EDITOR_ACTION_DOCK_SNAP = 18;
let editorActionDockState = null;

// 小说数据（独立于 websiteData，仅在后台使用）
let novelsState = {
  root: { id: "__novels_root", title: "小说库" },
  manifest: [],
  novels: {}, // { [id]: novelJson }
  dirty: {},  // { [id]: true }
};
const MUSIC_ROOT_NODE = { id: "__music_root", title: "音乐库" };
const SITE_SETTINGS_ROOT_NODE = { id: "__site_settings", title: "站点设置" };
const DEFAULT_ICP_URL = "https://beian.miit.gov.cn/";
const DEFAULT_SITE_EVENT_SLIDE = {
  image: "/images/总理府活动.png",
  text: "这是你的梦想吗？",
  durationMs: 4400,
  camera: "focus-zoom",
};
const SITE_EVENT_CAMERA_OPTIONS = [
  { value: "focus-zoom", label: "聚焦缓慢放大" },
  { value: "slow-zoom", label: "缓慢推进" },
  { value: "pan-left", label: "向左横移" },
  { value: "pan-right", label: "向右横移" },
  { value: "drift-up", label: "向上抬升" },
  { value: "still", label: "轻微静帧" },
];
const DEFAULT_SITE_EVENT = {
  enabled: true,
  homepageOnly: true,
  image: DEFAULT_SITE_EVENT_SLIDE.image,
  text: DEFAULT_SITE_EVENT_SLIDE.text,
  imageMs: DEFAULT_SITE_EVENT_SLIDE.durationMs,
  exitMs: 720,
  homeRevealMs: 2850,
  frostFrameEnabled: true,
  frostInMs: 2700,
  slideTransitionMs: 1100,
  homeIntroText: "帝国纪元70年，人类帝国随着第三委员上台进入了新的时期，但复活中心的损坏带来的动荡继续蔓延，委员会的矛盾正在扩大，欢迎来到70年代，绝望与希望并存的时代。",
  gameEntryEnabled: true,
  gameUrl: "/event-game/",
  gameEntryKicker: "限时活动",
  gameEntryTitle: "进入小游戏",
  slides: [{ ...DEFAULT_SITE_EVENT_SLIDE }],
};

// 拖拽状态
let dragSrcPath = null;
let dragOverPath = null;
let dragDropPlacement = "before";

// DOM 快捷
const $ = (id) => document.getElementById(id);

function updateSearchResultsPanelChrome() {
  const panel = $("search-results-panel");
  const button = $("toggle-search-results-btn");
  const count = $("search-results-count");

  if (count) {
    count.textContent = String(lastSearchResultsCount || 0);
  }

  if (panel) {
    panel.classList.toggle("collapsed", searchResultsCollapsed);
  }

  if (button) {
    button.textContent = searchResultsCollapsed ? "展开" : "收起";
    button.setAttribute("aria-expanded", searchResultsCollapsed ? "false" : "true");
  }
}

function setSearchResultsCollapsed(collapsed, options = {}) {
  searchResultsCollapsed = !!collapsed;

  if (options.persist !== false) {
    localStorage.setItem(
      SEARCH_RESULTS_COLLAPSED_KEY,
      searchResultsCollapsed ? "1" : "0"
    );
  }

  updateSearchResultsPanelChrome();
}

function bindSearchResultsPanel() {
  const button = $("toggle-search-results-btn");
  if (!button) return;

  searchResultsCollapsed =
    localStorage.getItem(SEARCH_RESULTS_COLLAPSED_KEY) === "1";

  button.onclick = () => {
    setSearchResultsCollapsed(!searchResultsCollapsed);
  };

  updateSearchResultsPanelChrome();
}

// ====== 状态栏颜色提示 ======
function setStatus(text, type = "info") {
  const bar = $("status-bar");
  const inline = $("editor-status-inline");
  const targets = [bar, inline].filter(Boolean);
  if (!targets.length) return;

  targets.forEach((target) => {
    target.textContent = text;
    target.classList.remove("ok", "warn", "error");
    if (type === "ok") target.classList.add("ok");
    if (type === "warn") target.classList.add("warn");
    if (type === "error") target.classList.add("error");
  });
}

function buildAdminHeaders(baseHeaders = {}) {
  const headers = { ...baseHeaders };
  if (adminToken) {
    headers["x-admin-token"] = adminToken;
  }
  return headers;
}

function getTreePathKey(path) {
  return JSON.stringify(path || []);
}

function persistCollapsedTreeState() {
  try {
    localStorage.setItem(
      TREE_COLLAPSE_STORAGE_KEY,
      JSON.stringify(Array.from(collapsedTreeNodeKeys))
    );
  } catch (_error) {
    // Ignore storage issues and keep the in-memory state.
  }
}

function restoreCollapsedTreeState() {
  try {
    const raw = localStorage.getItem(TREE_COLLAPSE_STORAGE_KEY);
    const parsed = JSON.parse(raw || "[]");
    collapsedTreeNodeKeys = new Set(
      Array.isArray(parsed) ? parsed.filter((entry) => typeof entry === "string") : []
    );
  } catch (_error) {
    collapsedTreeNodeKeys = new Set();
  }
}

function isTreeNodeCollapsed(path) {
  return collapsedTreeNodeKeys.has(getTreePathKey(path));
}

function setTreeNodeCollapsed(path, collapsed) {
  const key = getTreePathKey(path);
  if (collapsed) collapsedTreeNodeKeys.add(key);
  else collapsedTreeNodeKeys.delete(key);
  persistCollapsedTreeState();
}

function toggleTreeNodeCollapsed(path) {
  setTreeNodeCollapsed(path, !isTreeNodeCollapsed(path));
}

function expandTreeAncestors(path) {
  if (!Array.isArray(path) || !path.length) return;

  for (let i = 2; i <= path.length; i += 2) {
    collapsedTreeNodeKeys.delete(getTreePathKey(path.slice(0, i)));
  }

  persistCollapsedTreeState();
}

function loadEditorActionDockState() {
  try {
    const raw = localStorage.getItem(EDITOR_ACTION_DOCK_STORAGE_KEY);
    const parsed = JSON.parse(raw || "null");
    if (
      parsed &&
      Number.isFinite(parsed.left) &&
      Number.isFinite(parsed.top)
    ) {
      editorActionDockState = {
        left: Number(parsed.left),
        top: Number(parsed.top),
        dockedTop: parsed.dockedTop !== false,
      };
      return;
    }
  } catch (_error) {
    // Ignore storage issues and fall back to the default position.
  }

  editorActionDockState = null;
}

function persistEditorActionDockState() {
  try {
    if (!editorActionDockState) {
      localStorage.removeItem(EDITOR_ACTION_DOCK_STORAGE_KEY);
      return;
    }

    localStorage.setItem(
      EDITOR_ACTION_DOCK_STORAGE_KEY,
      JSON.stringify(editorActionDockState)
    );
  } catch (_error) {
    // Ignore storage failures and keep the in-memory position.
  }
}

function getEditorPanelElement() {
  return document.querySelector(".editor-panel");
}

function getDefaultEditorActionDockPosition() {
  const panel = getEditorPanelElement();
  const dock = $("editor-actions-dock");
  if (!panel || !dock) {
    return {
      left: EDITOR_ACTION_DOCK_SIDE,
      top: EDITOR_ACTION_DOCK_TOP,
      dockedTop: true,
    };
  }

  return {
    left: Math.max(
      EDITOR_ACTION_DOCK_SIDE,
      panel.clientWidth - dock.offsetWidth - EDITOR_ACTION_DOCK_SIDE
    ),
    top: EDITOR_ACTION_DOCK_TOP,
    dockedTop: true,
  };
}

function clampEditorActionDockPosition(left, top) {
  const panel = getEditorPanelElement();
  const dock = $("editor-actions-dock");
  if (!panel || !dock) {
    return { left, top };
  }

  const maxLeft = Math.max(
    EDITOR_ACTION_DOCK_SIDE,
    panel.clientWidth - dock.offsetWidth - EDITOR_ACTION_DOCK_SIDE
  );
  const maxTop = Math.max(
    EDITOR_ACTION_DOCK_TOP,
    panel.clientHeight - dock.offsetHeight - EDITOR_ACTION_DOCK_TOP
  );

  return {
    left: Math.min(Math.max(left, EDITOR_ACTION_DOCK_SIDE), maxLeft),
    top: Math.min(Math.max(top, EDITOR_ACTION_DOCK_TOP), maxTop),
  };
}

function applyEditorActionDockPosition(options = {}) {
  const dock = $("editor-actions-dock");
  if (!dock) return;

  if (window.innerWidth <= 980) {
    dock.removeAttribute("style");
    dock.classList.add("docked-top");
    return;
  }

  const base = editorActionDockState || getDefaultEditorActionDockPosition();
  const next = clampEditorActionDockPosition(base.left, base.top);
  const dockedTop = next.top <= EDITOR_ACTION_DOCK_TOP + EDITOR_ACTION_DOCK_SNAP;
  const resolvedTop = dockedTop ? EDITOR_ACTION_DOCK_TOP : next.top;

  editorActionDockState = {
    left: next.left,
    top: resolvedTop,
    dockedTop,
  };

  dock.style.left = `${editorActionDockState.left}px`;
  dock.style.top = `${editorActionDockState.top}px`;
  dock.classList.toggle("docked-top", dockedTop);

  if (options.persist !== false) {
    persistEditorActionDockState();
  }
}

function isEditorActionDockDragTarget(target) {
  if (!(target instanceof Element)) return false;
  return !target.closest("button, input, textarea, select, a");
}

function bindEditorActionDock() {
  const dock = $("editor-actions-dock");
  const handle = $("editor-actions-handle");
  const panel = getEditorPanelElement();
  if (!dock || !handle || !panel) return;

  loadEditorActionDockState();

  let dragState = null;

  const finishDrag = () => {
    if (!dragState) return;
    editorActionDockState = {
      left: Number.parseFloat(dock.style.left) || getDefaultEditorActionDockPosition().left,
      top: Number.parseFloat(dock.style.top) || EDITOR_ACTION_DOCK_TOP,
      dockedTop: dock.classList.contains("docked-top"),
    };
    dragState = null;
    dock.classList.remove("dragging");
    applyEditorActionDockPosition();
  };

  dock.addEventListener("pointerdown", (event) => {
    if (window.innerWidth <= 980) return;
    if (event.button !== 0) return;
    if (!isEditorActionDockDragTarget(event.target)) return;

    const dockRect = dock.getBoundingClientRect();
    dragState = {
      offsetX: event.clientX - dockRect.left,
      offsetY: event.clientY - dockRect.top,
    };

    dock.classList.add("dragging");
    dock.setPointerCapture(event.pointerId);
    event.preventDefault();
  });

  dock.addEventListener("pointermove", (event) => {
    if (!dragState || window.innerWidth <= 980) return;

    const panelRect = panel.getBoundingClientRect();
    const next = clampEditorActionDockPosition(
      event.clientX - panelRect.left - dragState.offsetX,
      event.clientY - panelRect.top - dragState.offsetY
    );

    dock.style.left = `${next.left}px`;
    dock.style.top = `${
      next.top <= EDITOR_ACTION_DOCK_TOP + EDITOR_ACTION_DOCK_SNAP
        ? EDITOR_ACTION_DOCK_TOP
        : next.top
    }px`;
    dock.classList.toggle(
      "docked-top",
      next.top <= EDITOR_ACTION_DOCK_TOP + EDITOR_ACTION_DOCK_SNAP
    );
  });

  dock.addEventListener("pointerup", finishDrag);
  dock.addEventListener("pointercancel", finishDrag);

  handle.addEventListener("dblclick", () => {
    editorActionDockState = null;
    applyEditorActionDockPosition();
    setStatus("快捷操作卡片已复位到顶部", "ok");
  });

  handle.addEventListener("dblclick", () => {
    setStatus("快捷操作卡片已复位到顶部", "ok");
  });

  window.addEventListener("resize", () => {
    applyEditorActionDockPosition({ persist: false });
  });

  requestAnimationFrame(() => {
    applyEditorActionDockPosition({ persist: false });
  });
}

function setSettingsMessage(text, type = "info") {
  const el = $("admin-settings-message");
  if (!el) return;

  el.textContent = text || "";
  el.classList.remove("ok", "warn", "error");
  if (type === "ok") el.classList.add("ok");
  if (type === "warn") el.classList.add("warn");
  if (type === "error") el.classList.add("error");
}

function setAdminSettingsEditable(editable) {
  [
    "admin-current-token",
    "admin-next-token",
    "admin-confirm-token",
    "change-admin-token-btn",
    "clear-settings-form-btn",
  ].forEach((id) => {
    const el = $(id);
    if (el) el.disabled = !editable;
  });
}

function renderAdminSecurityInfo(info) {
  const el = $("admin-settings-source");
  if (!el) return;

  if (!info) {
    el.textContent = "Unable to load the current admin token configuration.";
    el.classList.add("blocked");
    setAdminSettingsEditable(false);
    return;
  }

  const message = info.editableFromAdmin
    ? `Current token source: ${info.tokenSourceLabel}. Changes will be written to ${info.envFilePath} and applied to the current admin session immediately.`
    : `Current token source: ${info.tokenSourceLabel}. This token is controlled by the server process, so update ${info.envVariableName} in your server environment instead.`;

  el.textContent = message;
  el.classList.toggle("blocked", !info.editableFromAdmin);
  setAdminSettingsEditable(!!info.editableFromAdmin);
}

function openAdminSettings() {
  const modal = $("admin-settings-modal");
  if (!modal) return;

  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  setSettingsMessage("");

  loadAdminSecurityInfo().finally(() => {
    const input = $("admin-current-token");
    if (input && !input.disabled) input.focus();
  });
}

function closeAdminSettings() {
  const modal = $("admin-settings-modal");
  if (!modal) return;

  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
}

function resetAdminSettingsForm() {
  const form = $("admin-password-form");
  if (form) form.reset();
  setSettingsMessage("");
}

async function loadAdminSecurityInfo() {
  try {
    const res = await fetch(ADMIN_SECURITY_ENDPOINT, {
      cache: "no-cache",
      headers: buildAdminHeaders(),
    });
    const data = await res.json().catch(() => ({}));

    if (res.status === 401 || data.error === "Invalid admin token") {
      handleAdminAuthFailure();
      return null;
    }

    if (!res.ok || data.error) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }

    adminSecurityInfo = data;
    renderAdminSecurityInfo(data);
    return data;
  } catch (e) {
    console.error(e);
    adminSecurityInfo = null;
    renderAdminSecurityInfo(null);
    setSettingsMessage("Failed to load admin token configuration.", "error");
    return null;
  }
}

async function submitAdminTokenChange(event) {
  event.preventDefault();

  const currentToken = $("admin-current-token")?.value.trim() || "";
  const nextToken = $("admin-next-token")?.value.trim() || "";
  const confirmToken = $("admin-confirm-token")?.value.trim() || "";

  if (!currentToken || !nextToken || !confirmToken) {
    setSettingsMessage("Fill in the current token, new token, and confirmation token.", "error");
    return;
  }

  if (nextToken !== confirmToken) {
    setSettingsMessage("The new token confirmation does not match.", "error");
    return;
  }

  setSettingsMessage("Updating admin token...", "warn");

  try {
    const res = await fetch(CHANGE_ADMIN_TOKEN_ENDPOINT, {
      method: "POST",
      headers: buildAdminHeaders({
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({
        currentToken,
        nextToken,
        confirmToken,
      }),
    });
    const data = await res.json().catch(() => ({}));

    if (res.status === 401 || data.error === "Invalid admin token") {
      handleAdminAuthFailure();
      setStatus("已清除当前字段的颜色标签，记得应用修改并保存", "warn");
      return;
    }

    if (!res.ok || data.error) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }

    adminToken = nextToken;
    localStorage.setItem("uhe_admin_token", nextToken);

    const backupInput = $("admin-token-input");
    if (backupInput) backupInput.value = nextToken;

    adminSecurityInfo = data.security || adminSecurityInfo;
    renderAdminSecurityInfo(adminSecurityInfo);
    resetAdminSettingsForm();
    setSettingsMessage("Admin token updated and saved to .env.", "ok");
    setStatus("Admin token updated", "ok");
  } catch (e) {
    console.error(e);
    setSettingsMessage(String(e?.message || e), "error");
    setStatus("Admin token update failed", "error");
  }
}

function bindAdminSettingsEvents() {
  $("open-settings-btn")?.addEventListener("click", openAdminSettings);
  $("close-settings-btn")?.addEventListener("click", closeAdminSettings);
  $("clear-settings-form-btn")?.addEventListener("click", resetAdminSettingsForm);
  $("admin-password-form")?.addEventListener("submit", submitAdminTokenChange);
  $("admin-settings-modal")?.addEventListener("click", (event) => {
    if (event.target?.dataset?.closeSettings === "true") {
      closeAdminSettings();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeAdminSettings();
    }
  });
}

function handleAdminAuthFailure() {
  setStatus("管理员会话已失效，请重新访问 /admin 登录", "error");
  alert("管理员会话已失效，或备用 Token 不正确。请重新打开 /admin 并输入管理员密钥。");
}

// ====== 小说管理：工具函数（新增） ======
function isNovelsPath(path) {
  return Array.isArray(path) && path[0] === "__novels";
}

function getNovelIdFromPath(path) {
  if (!isNovelsPath(path)) return null;
  // manifest 条目：['__novels','manifest',i]
  if (path[1] === "manifest") {
    const entry = novelsState.manifest[path[2]];
    return entry ? entry.id : null;
  }
  // 章节路径：['__novels','novels',id,'chapters',ci]
  if (path[1] === "novels") {
    return path[2] || null;
  }
  return null;
}

function isMusicPath(path) {
  return Array.isArray(path) && path[0] === "__music";
}

function isSiteSettingsPath(path) {
  return Array.isArray(path) && path[0] === "__siteSettings";
}

function normalizeExternalUrl(value, fallback = DEFAULT_ICP_URL) {
  const rawValue = String(value || "").trim();
  if (!rawValue) return fallback;
  if (/^(?:https?:)?\/\//i.test(rawValue)) return rawValue;
  return `https://${rawValue.replace(/^\/+/, "")}`;
}

function normalizeSitePath(value, fallback = "/") {
  const rawValue = String(value || "").trim();
  if (!rawValue) return fallback;
  if (/^(?:[a-z]+:)?\/\//i.test(rawValue)) return rawValue;
  if (rawValue.startsWith("#")) return rawValue;
  return rawValue.startsWith("/") ? rawValue : `/${rawValue.replace(/^\.?\//, "")}`;
}

function ensureSiteSettings(data = websiteData) {
  if (!data || typeof data !== "object") return {};
  if (!data.siteSettings || typeof data.siteSettings !== "object" || Array.isArray(data.siteSettings)) {
    data.siteSettings = {};
  }

  if (data.siteSettings.icpNumber == null) {
    data.siteSettings.icpNumber = "";
  }
  if (data.siteSettings.icpUrl == null) {
    data.siteSettings.icpUrl = DEFAULT_ICP_URL;
  }

  return data.siteSettings;
}

function normalizeSiteEventCamera(value) {
  const camera = String(value || "").trim();
  return SITE_EVENT_CAMERA_OPTIONS.some((option) => option.value === camera)
    ? camera
    : DEFAULT_SITE_EVENT_SLIDE.camera;
}

function normalizeSiteEventSlide(slide, fallback = DEFAULT_SITE_EVENT_SLIDE) {
  const source =
    slide && typeof slide === "object" && !Array.isArray(slide) ? slide : {};
  const fallbackSlide = { ...DEFAULT_SITE_EVENT_SLIDE, ...fallback };
  const image = String(source.image || source.src || fallbackSlide.image || DEFAULT_SITE_EVENT_SLIDE.image).trim();
  const text = String(source.text ?? source.caption ?? fallbackSlide.text ?? DEFAULT_SITE_EVENT_SLIDE.text).trim();
  return {
    image: image || DEFAULT_SITE_EVENT_SLIDE.image,
    text: text || DEFAULT_SITE_EVENT_SLIDE.text,
    durationMs: Math.max(
      1400,
      Number(source.durationMs ?? source.imageMs ?? fallbackSlide.durationMs) ||
        DEFAULT_SITE_EVENT_SLIDE.durationMs
    ),
    camera: normalizeSiteEventCamera(source.camera || fallbackSlide.camera),
  };
}

function ensureSiteEvent(data = websiteData) {
  if (!data || typeof data !== "object") return { ...DEFAULT_SITE_EVENT };
  if (!data.siteEvent || typeof data.siteEvent !== "object" || Array.isArray(data.siteEvent)) {
    data.siteEvent = {};
  }
  const legacySlide = normalizeSiteEventSlide({
    image: data.siteEvent.image || DEFAULT_SITE_EVENT.image,
    text: data.siteEvent.text || DEFAULT_SITE_EVENT.text,
    durationMs: data.siteEvent.imageMs || DEFAULT_SITE_EVENT.imageMs,
    camera: data.siteEvent.camera || DEFAULT_SITE_EVENT_SLIDE.camera,
  });
  const sourceSlides = Array.isArray(data.siteEvent.slides) ? data.siteEvent.slides : [];
  const slides = sourceSlides.length
    ? sourceSlides.map((slide, index) =>
        normalizeSiteEventSlide(slide, index === 0 ? legacySlide : DEFAULT_SITE_EVENT_SLIDE)
      )
    : [legacySlide];
  const firstSlide = slides[0] || legacySlide;
  const lastSlide = slides[slides.length - 1] || firstSlide;

  data.siteEvent = {
    ...DEFAULT_SITE_EVENT,
    ...data.siteEvent,
    enabled: data.siteEvent.enabled === true,
    homepageOnly: data.siteEvent.homepageOnly !== false,
    image: firstSlide.image,
    text: firstSlide.text,
    imageMs: firstSlide.durationMs,
    exitMs: Math.max(260, Number(data.siteEvent.exitMs) || DEFAULT_SITE_EVENT.exitMs),
    homeRevealMs: Math.max(900, Number(data.siteEvent.homeRevealMs) || DEFAULT_SITE_EVENT.homeRevealMs),
    frostFrameEnabled: data.siteEvent.frostFrameEnabled !== false,
    frostInMs: Math.max(
      900,
      Math.min(
        lastSlide.durationMs,
        Number(data.siteEvent.frostInMs) || Math.round(lastSlide.durationMs * 0.62)
      )
    ),
    slideTransitionMs: Math.max(
      0,
      Math.min(2200, Number(data.siteEvent.slideTransitionMs) || DEFAULT_SITE_EVENT.slideTransitionMs)
    ),
    homeIntroText: String(data.siteEvent.homeIntroText || DEFAULT_SITE_EVENT.homeIntroText).trim(),
    gameEntryEnabled: data.siteEvent.gameEntryEnabled !== false,
    gameUrl: normalizeSitePath(data.siteEvent.gameUrl, DEFAULT_SITE_EVENT.gameUrl),
    gameEntryKicker: String(data.siteEvent.gameEntryKicker || DEFAULT_SITE_EVENT.gameEntryKicker).trim(),
    gameEntryTitle: String(data.siteEvent.gameEntryTitle || DEFAULT_SITE_EVENT.gameEntryTitle).trim(),
    slides,
  };

  return data.siteEvent;
}

function normalizeMusicSrc(value) {
  const rawValue = String(value || "").trim();
  if (!rawValue) return "";

  if (
    /^(?:[a-z]+:)?\/\//i.test(rawValue) ||
    rawValue.startsWith("data:") ||
    rawValue.startsWith("blob:")
  ) {
    return rawValue;
  }

  return rawValue.startsWith("/") ? rawValue : `/${rawValue.replace(/^\.?\//, "")}`;
}

function getMusicFileLabel(src) {
  const rawValue = String(src || "").split("?")[0].split("#")[0];
  const filename = rawValue.split("/").pop() || "";
  if (!filename) return "";

  try {
    return decodeURIComponent(filename);
  } catch (_error) {
    return filename;
  }
}

function normalizeMusicTrack(track, index) {
  const normalizedSrc = normalizeMusicSrc(track?.src || track?.path || "");
  const fallbackName =
    getMusicFileLabel(normalizedSrc).replace(/\.[^.]+$/, "") || `歌曲 ${index + 1}`;

  return {
    name: String(track?.name || track?.title || fallbackName).trim() || fallbackName,
    src: normalizedSrc,
  };
}

function ensureMusicPlaylist(data = websiteData) {
  if (!data || typeof data !== "object") return [];
  if (!Array.isArray(data.musicPlaylist)) {
    data.musicPlaylist = [];
  }

  data.musicPlaylist = data.musicPlaylist
    .filter((track) => track && typeof track === "object")
    .map((track, index) => normalizeMusicTrack(track, index));

  return data.musicPlaylist;
}

function resolveMusicTrackPreview(track) {
  return normalizeMusicSrc(track?.src || "");
}

function isMusicSourceShared(index, src) {
  const normalizedSrc = normalizeMusicSrc(src);
  if (!normalizedSrc) return false;

  return ensureMusicPlaylist(websiteData).some(
    (track, trackIndex) =>
      trackIndex !== index && normalizeMusicSrc(track?.src || "") === normalizedSrc
  );
}

async function uploadAudioFile(file) {
  if (!file) {
    alert("请选择音频文件");
    return null;
  }

  const formData = new FormData();
  formData.append("file", file);
  setStatus("正在上传歌曲...", "warn");

  try {
    const res = await fetch(UPLOAD_AUDIO_ENDPOINT, {
      method: "POST",
      headers: buildAdminHeaders(),
      body: formData,
    });

    const result = await res.json().catch(() => ({}));

    if (res.status === 401 || result.error === "Invalid admin token") {
      handleAdminAuthFailure();
      return null;
    }

    if (!res.ok || !result.ok) {
      throw new Error(result.error || `HTTP ${res.status}`);
    }

    setStatus("歌曲上传成功，记得保存全部", "ok");
    return {
      name: String(result.name || "").trim(),
      src: normalizeMusicSrc(result.path || ""),
    };
  } catch (error) {
    console.error(error);
    setStatus("歌曲上传失败", "error");
    alert(String(error?.message || error));
    return null;
  }
}

async function deleteAudioAsset(src) {
  const normalizedSrc = normalizeMusicSrc(src);
  if (!normalizedSrc) {
    return { ok: true, deleted: false };
  }

  try {
    const res = await fetch(DELETE_AUDIO_ENDPOINT, {
      method: "POST",
      headers: buildAdminHeaders({
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({ path: normalizedSrc }),
    });

    const result = await res.json().catch(() => ({}));

    if (res.status === 401 || result.error === "Invalid admin token") {
      handleAdminAuthFailure();
      return null;
    }

    if (!res.ok || !result.ok) {
      throw new Error(result.error || `HTTP ${res.status}`);
    }

    return result;
  } catch (error) {
    console.error(error);
    setStatus("删除音频文件失败", "error");
    alert("删除音频文件失败");
    return null;
  }
}

async function removeMusicTrack(index, options = {}) {
  const playlist = ensureMusicPlaylist(websiteData);
  const track = playlist[index];
  if (!Number.isInteger(index) || !track) return false;

  let shouldDeleteFile = options.deleteFile === true;
  const normalizedSrc = normalizeMusicSrc(track?.src || "");

  if (shouldDeleteFile && normalizedSrc && isMusicSourceShared(index, normalizedSrc)) {
    alert("这个音频文件仍被其他歌曲引用，已只移除当前歌曲记录。");
    shouldDeleteFile = false;
  }

  if (shouldDeleteFile && normalizedSrc) {
    const deleted = await deleteAudioAsset(normalizedSrc);
    if (!deleted) return false;
  }

  playlist.splice(index, 1);
  websiteData.musicPlaylist = playlist.map((entry, trackIndex) =>
    normalizeMusicTrack(entry, trackIndex)
  );

  if (isMusicPath(selectedPath) && selectedPath[1] === "playlist") {
    const selectedIndex = Number(selectedPath[2]);
    if (selectedIndex === index) {
      selectedPath = playlist.length
        ? ["__music", "playlist", Math.max(0, index - 1)]
        : ["__music", "root"];
    } else if (selectedIndex > index) {
      selectedPath = ["__music", "playlist", selectedIndex - 1];
    }
  }

  setStatus(
    shouldDeleteFile ? "已删除歌曲并移除音频文件（未保存）" : "已删除歌曲（未保存）",
    "warn"
  );
  return true;
}

function markNovelDirty(novelId, dirty = true) {
  if (!novelId) return;
  novelsState.dirty[novelId] = !!dirty;
}

function stripTagsForLabel(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}


// ====== 小说编辑器样式注入（新增，不影响现有布局） ======
function escapeRegExp(text) {
  return String(text || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeNovelColorHex(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, "");
}

function convertNovelEditorMarkupToHtml(text) {
  const palette =
    typeof getColorPalette === "function" ? getColorPalette() : window.colorPalette || {};

  return String(text || "")
    .replace(/\[\[link\|([\w\d\-_,，\s]+)\|([\w\d-]+)\|([\s\S]*?)\]\]/g, (_match, novelId, paragraphId, content) => {
      const safeNovelId = escapeHtml(String(novelId || "").trim());
      const safeParagraphId = escapeHtml(String(paragraphId || "").trim());
      return `<a href="#" class="novel-link" data-novel-id="${safeNovelId}" data-goto-id="${safeParagraphId}">${content}</a>`;
    })
    .replace(/\[\[([^|\[\]]+)\|([\s\S]*?)\]\]/g, (match, key, inner) => {
      const color = palette[key];
      if (!color) return inner;
      return `<span style="color:${color};">${inner}</span>`;
    });
}

function convertNovelHtmlToEditorMarkup(html) {
  const palette =
    typeof getColorPalette === "function" ? getColorPalette() : window.colorPalette || {};
  const paletteEntries = Object.entries(palette).map(([key, value]) => [
    key,
    normalizeNovelColorHex(value),
  ]);

  return String(html || "")
    .replace(
      /<a\b[^>]*class=(["'])[^"'<>]*novel-link[^"'<>]*\1[^>]*data-novel-id=(["'])(.*?)\2[^>]*data-goto-id=(["'])(.*?)\4[^>]*>([\s\S]*?)<\/a>/gi,
      (_match, _classQuote, _novelQuote, novelId, _paragraphQuote, paragraphId, content) =>
        `[[link|${String(novelId || "").trim()}|${String(paragraphId || "").trim()}|${content}]]`
    )
    .replace(/<span\b([^>]*)>([\s\S]*?)<\/span>/gi, (match, attrs, inner) => {
      const styleMatch = String(attrs || "").match(/style=(["'])(.*?)\1/i);
      if (!styleMatch) return match;

      const colorMatch = styleMatch[2].match(/color\s*:\s*([^;]+)/i);
      if (!colorMatch) return match;

      const normalized = normalizeNovelColorHex(colorMatch[1]);
      const paletteEntry = paletteEntries.find((entry) => entry[1] === normalized);
      if (!paletteEntry) return match;

      return `[[${paletteEntry[0]}|${inner}]]`;
    });
}

function normalizeNovelChapters(novel) {
  if (!novel || !Array.isArray(novel.chapters)) {
    novel.chapters = [];
  }

  novel.chapters.forEach((chapter, chapterIndex) => {
    if (!chapter || typeof chapter !== "object") {
      novel.chapters[chapterIndex] = {
        id: `ch-${chapterIndex}`,
        title: `Chapter ${chapterIndex + 1}`,
        paragraphs: [],
      };
      chapter = novel.chapters[chapterIndex];
    }

    if (!Array.isArray(chapter.paragraphs)) {
      chapter.paragraphs = [];
    }

    chapter.paragraphs = chapter.paragraphs.map((paragraph, paragraphIndex) => {
      if (paragraph && typeof paragraph === "object") {
        return {
          id: paragraph.id || `${chapter.id || `ch-${chapterIndex}`}-p-${paragraphIndex}`,
          html: String(paragraph.html || ""),
          text: String(paragraph.text || stripTagsForLabel(paragraph.html || "")),
        };
      }

      const htmlText = String(paragraph || "");
      return {
        id: `${chapter.id || `ch-${chapterIndex}`}-p-${paragraphIndex}`,
        html: htmlText,
        text: stripTagsForLabel(htmlText),
      };
    });
  });

  return novel.chapters;
}

function serializeNovelToEditableSource(novel) {
  const chapters = normalizeNovelChapters(novel);
  if (!chapters.length) {
    return "## 第一章\n\n";
  }

  return chapters
    .map((chapter, chapterIndex) => {
      const heading = `## ${String(chapter.title || `Chapter ${chapterIndex + 1}`).trim()}`;
      const body = (chapter.paragraphs || [])
        .map((paragraph) => convertNovelHtmlToEditorMarkup(paragraph?.html || ""))
        .join("\n\n")
        .trim();

      return body ? `${heading}\n\n${body}` : `${heading}\n\n`;
    })
    .join("\n\n\n");
}

function parseNovelEditableSource(sourceText, existingChapters = []) {
  const normalized = String(sourceText || "").replace(/\r\n?/g, "\n").trim();
  const headingRegex = /^##\s+(.+)$/gm;
  const matches = [...normalized.matchAll(headingRegex)];

  const draftChapters =
    matches.length > 0
      ? matches.map((match, index) => {
          const start = match.index + match[0].length;
          const end = index + 1 < matches.length ? matches[index + 1].index : normalized.length;
          return {
            title: String(match[1] || "").trim() || `Chapter ${index + 1}`,
            body: normalized.slice(start, end).trim(),
          };
        })
      : [
          {
            title: existingChapters[0]?.title || "第一章",
            body: normalized,
          },
        ];

  return draftChapters.map((chapterDraft, chapterIndex) => {
    const previousChapter = existingChapters[chapterIndex] || {};
    const previousParagraphs = Array.isArray(previousChapter.paragraphs)
      ? previousChapter.paragraphs
      : [];
    const chapterId = previousChapter.id || `ch-${chapterIndex}`;
    const paragraphBlocks = String(chapterDraft.body || "")
      .split(/\n{2,}/)
      .map((block) => block.trim())
      .filter(Boolean);

    return {
      id: chapterId,
      title: chapterDraft.title || `Chapter ${chapterIndex + 1}`,
      paragraphs: paragraphBlocks.map((block, paragraphIndex) => {
        const htmlText = convertNovelEditorMarkupToHtml(block);
        return {
          id: previousParagraphs[paragraphIndex]?.id || `${chapterId}-p-${paragraphIndex}`,
          html: htmlText,
          text: stripTagsForLabel(htmlText),
        };
      }),
    };
  });
}

function setTextareaSelectionRange(textarea, start, end) {
  if (!(textarea instanceof HTMLTextAreaElement)) return;

  textarea.focus();
  textarea.setSelectionRange(start, end);

  const prefix = String(textarea.value || "").slice(0, start);
  const lineCount = prefix.split("\n").length;
  const computed = window.getComputedStyle(textarea);
  const parsedLineHeight = Number.parseFloat(computed.lineHeight);
  const lineHeight = Number.isFinite(parsedLineHeight) ? parsedLineHeight : 24;

  textarea.scrollTop = Math.max(0, (lineCount - 3) * lineHeight);
}

function injectNovelsEditorStyles() {
  if (document.getElementById("novels-editor-styles")) return;
  const style = document.createElement("style");
  style.id = "novels-editor-styles";
  style.textContent = `
    /* 连贯小说编辑器（仅作用于 novels 区域） */
    .novel-doc-wrap { display: flex; flex-direction: column; gap: 10px; }
    .novel-doc-toolbar { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
    .novel-doc-toolbar .hint { color:#94a3b8; font-size:12px; }
    .novel-doc-search {
      margin-left: auto;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }
    .novel-doc-search-input,
    .novel-doc-jump {
      min-height: 38px;
      padding: 0 12px;
      border-radius: 10px;
      border: 1px solid rgba(148,163,184,0.25);
      background: rgba(2,6,23,0.5);
      color: #e5e7eb;
      outline: none;
    }
    .novel-doc-search-input {
      min-width: 220px;
    }
    .novel-doc-search-input:focus,
    .novel-doc-jump:focus {
      box-shadow: 0 0 0 2px rgba(59,130,246,0.35);
    }
    .novel-doc-search-count {
      min-width: 68px;
      font-size: 12px;
      color: #94a3b8;
      text-align: center;
    }
    .novel-doc-mode { margin-left:auto; display:flex; gap:8px; align-items:center; }
    .novel-doc-hint {
      color: #94a3b8;
      font-size: 12px;
      line-height: 1.7;
      margin-bottom: 4px;
    }
    .novel-doc-content {
      padding: 12px;
      border: 1px solid rgba(148,163,184,0.25);
      border-radius: 12px;
      background: rgba(15,23,42,0.35);
      max-height: 70vh;
      overflow: auto;
    }
    .novel-doc-content h2.novel-doc-chapter-title {
      margin: 18px 0 10px;
      padding: 6px 8px;
      border-radius: 10px;
      outline: none;
      background: rgba(148,163,184,0.08);
    }
    .novel-doc-content h2.novel-doc-chapter-title:focus {
      box-shadow: 0 0 0 2px rgba(59,130,246,0.35);
    }
    .novel-doc-paragraph {
      margin: 10px 0;
      padding: 8px 10px;
      border-radius: 10px;
      outline: none;
      line-height: 1.75;
      background: rgba(2,6,23,0.35);
      border: 1px solid rgba(148,163,184,0.18);
      word-break: break-word;
    }
    .novel-doc-paragraph:hover { border-color: rgba(148,163,184,0.35); }
    .novel-doc-paragraph:focus { box-shadow: 0 0 0 2px rgba(59,130,246,0.35); }
    .novel-doc-paragraph:empty:before {
      content: "（空段落，点击输入）";
      color: rgba(148,163,184,0.65);
    }
    .novel-doc-source {
      width: 100%;
      min-height: 110px;
      resize: vertical;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      font-size: 12px;
      padding: 10px;
      border-radius: 10px;
      border: 1px solid rgba(148,163,184,0.25);
      background: rgba(2,6,23,0.45);
      color: #e5e7eb;
      line-height: 1.6;
      outline: none;
    }
    .novel-doc-source:focus { box-shadow: 0 0 0 2px rgba(59,130,246,0.35); }
    .novel-doc-divider {
      height: 1px;
      margin: 12px 0;
      background: rgba(148,163,184,0.15);
    }
    .novel-doc-small { color:#94a3b8; font-size:12px; }
    .novel-book-source {
      width: 100%;
      min-height: 70vh;
      resize: vertical;
      padding: 14px 16px;
      border-radius: 14px;
      border: 1px solid rgba(148,163,184,0.25);
      background: rgba(2,6,23,0.58);
      color: #e5e7eb;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      font-size: 13px;
      line-height: 1.8;
      white-space: pre-wrap;
      outline: none;
    }
    .novel-book-source:focus {
      box-shadow: 0 0 0 2px rgba(59,130,246,0.35);
    }
    @media (max-width: 980px) {
      .novel-doc-search {
        width: 100%;
        margin-left: 0;
      }
      .novel-doc-search-input,
      .novel-doc-jump {
        width: 100%;
      }
    }
  `;
  document.head.appendChild(style);
}


async function loadNovelsManifest() {
  try {
    const res = await fetch(NOVELS_MANIFEST_ENDPOINT, { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const manifest = await res.json();
    novelsState.manifest = Array.isArray(manifest) ? manifest : [];
    return novelsState.manifest;
  } catch (e) {
    // 不影响 website-data 的加载与编辑
    console.warn("[CMS] novels manifest 加载失败：", e);
    novelsState.manifest = [];
    return novelsState.manifest;
  }
}

async function ensureNovelLoaded(novelId) {
  if (!novelId) return null;
  if (novelsState.novels[novelId]) return novelsState.novels[novelId];
  try {
    const res = await fetch(`${NOVELS_GET_ENDPOINT}/${encodeURIComponent(novelId)}`, {
      cache: "no-cache",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const novel = await res.json();
    novelsState.novels[novelId] = novel;
    return novel;
  } catch (e) {
    console.error(e);
    setStatus(`加载小说失败：${novelId}`, "error");
    return null;
  }
}

async function saveNovelsManifestToServer() {
  try {
    const res = await fetch(NOVELS_SAVE_MANIFEST_ENDPOINT, {
      method: "POST",
      headers: buildAdminHeaders({
        "Content-Type": "application/json",
      }),
      body: JSON.stringify(novelsState.manifest || []),
    });
    const r = await res.json().catch(() => ({}));
    if (res.status === 401 || r.error === "Invalid admin token") {
      handleAdminAuthFailure();
      return false;
    }
    if (!res.ok || r.error) throw new Error(r.error || `HTTP ${res.status}`);
    setStatus("小说清单（manifest）已保存", "ok");
    return true;
  } catch (e) {
    console.error(e);
    setStatus("小说清单保存失败", "error");
    return false;
  }
}

async function saveNovelToServer(novelId) {
  const novel = novelsState.novels[novelId];
  if (!novel) {
    setStatus("未加载小说正文，无法保存", "error");
    return false;
  }
  try {
    const res = await fetch(`${NOVELS_SAVE_NOVEL_ENDPOINT}/${encodeURIComponent(novelId)}`, {
      method: "POST",
      headers: buildAdminHeaders({
        "Content-Type": "application/json",
      }),
      body: JSON.stringify(novel),
    });
    const r = await res.json().catch(() => ({}));
    if (res.status === 401 || r.error === "Invalid admin token") {
      handleAdminAuthFailure();
      return false;
    }
    if (!res.ok || r.error) throw new Error(r.error || `HTTP ${res.status}`);
    markNovelDirty(novelId, false);
    setStatus(`小说已保存：${novelId}`, "ok");
    // 保存后刷新 manifest（后端会同步 title/image）
    await loadNovelsManifest();
    renderTree();
    return true;
  } catch (e) {
    console.error(e);
    setStatus(`小说保存失败：${novelId}`, "error");
    return false;
  }
}

async function deleteNovelFromServer(novelId) {
  if (!novelId) return false;

  try {
    const res = await fetch(
      `${NOVELS_DELETE_NOVEL_ENDPOINT}/${encodeURIComponent(novelId)}/delete`,
      {
        method: "POST",
        headers: buildAdminHeaders(),
      }
    );
    const result = await res.json().catch(() => ({}));

    if (res.status === 401 || result.error === "Invalid admin token") {
      handleAdminAuthFailure();
      return false;
    }

    if (!res.ok || !result.ok) {
      throw new Error(result.error || `HTTP ${res.status}`);
    }

    delete novelsState.novels[novelId];
    delete novelsState.dirty[novelId];
    novelsState.manifest = (novelsState.manifest || []).filter(
      (entry) => !(entry && entry.id === novelId)
    );

    if (Array.isArray(selectedPath) && isNovelsPath(selectedPath)) {
      selectedPath = ["__novels", "root"];
    }

    setStatus(`已删除小说：${novelId}`, "ok");
    return true;
  } catch (e) {
    console.error(e);
    setStatus(`删除小说失败：${novelId}`, "error");
    alert(String(e?.message || e));
    return false;
  }
}

async function uploadNovelFile(file) {
  if (!file) return null;

  const name = String(file.name || file.originalname || "novel.json");
  const ext = name.split(".").pop().toLowerCase();

  let endpoint = NOVELS_UPLOAD_ENDPOINT;
  let label = "JSON";
  if (ext === "docx") {
    endpoint = NOVELS_UPLOAD_DOCX_ENDPOINT;
    label = "DOCX";
  } else if (ext === "txt") {
    endpoint = NOVELS_UPLOAD_TXT_ENDPOINT;
    label = "TXT";
  }

  try {
    const fd = new FormData();
    fd.append("file", file);

    setStatus(`正在上传小说 ${label}…`, "warn");
    const res = await fetch(endpoint, {
      method: "POST",
      headers: buildAdminHeaders(),
      body: fd,
    });
    const r = await res.json().catch(() => ({}));
    if (res.status === 401 || r.error === "Invalid admin token") {
      handleAdminAuthFailure();
      return null;
    }
    if (!res.ok || r.error) throw new Error(r.error || `HTTP ${res.status}`);
    await loadNovelsManifest();
    setStatus(`上传成功：${r.id || "(unknown)"}`, "ok");
    return r.id || null;
  } catch (e) {
    console.error(e);
    setStatus(`上传小说失败（${label}）`, "error");
    alert(String(e && e.message ? e.message : e));
    return null;
  }
}


// ====== 颜色库辅助（插入/去除颜色标签 + 预览渲染） ======

// 常用颜色 key（需与 color-palette.js 对应）
const COLOR_SHORTCUT_KEYS = [
  "imperialGold",
  "darkGold",
  "imperialBlue",
  "sovietRed",
  "onyxBlack",
  "adminBureauBlue",
  "maritimeGuardAqua",
  "scienceMinistryCyan",
];

const COLOR_SHORTCUT_LABELS = {
  imperialGold: "帝国金 imperialGold",
  darkGold: "暗金色 darkGold",
};

/**
 * 获取颜色库：
 * - 优先 window.colorPalette（color-palette.js）
 * - 没有就用内置兜底
 */
function getColorPalette() {
  if (
    typeof window !== "undefined" &&
    window.colorPalette &&
    typeof window.colorPalette === "object"
  ) {
    return window.colorPalette;
  }
  return {
    imperialGold: "#FFD700",
    darkGold: "#8C6A3C",
    imperialBlue: "#003366",
    sovietRed: "#CD2626",
    onyxBlack: "#111827",
    adminBureauBlue: "#2563EB",
    maritimeGuardAqua: "#0EA5E9",
    scienceMinistryCyan: "#06B6D4",
  };
}

// ====== 时间线节点样式配置（自动同步用） ======

// 内置兜底配置；如果你在页面里定义了 window.TIMELINE_NODE_STYLES，会优先用你的
const DEFAULT_TIMELINE_NODE_STYLE_OPTIONS = [
  { value: "", label: "默认圆点（无特殊效果）" },
  { value: "fiery", label: "🔥 燃烧节点（Flame）" },
  { value: "frozen", label: "❄️ 冻结节点（Frozen）" },
];

/**
 * 获取可用的节点样式选项：
 * - 优先使用 window.TIMELINE_NODE_STYLES（数组，元素形如 { value, label }）
 * - 否则使用 DEFAULT_TIMELINE_NODE_STYLE_OPTIONS
 *
 * 将来你只要在任意前端 JS 里写：
 * window.TIMELINE_NODE_STYLES = [
 *   { value: "", label: "默认圆点" },
 *   { value: "fiery", label: "🔥 燃烧节点" },
 *   { value: "frozen", label: "❄️ 冻结节点" },
 *   { value: "doom", label: "☢ 核爆节点" },
 * ];
 * 后台这里就会自动多出 “☢ 核爆节点” 这一项。
 */
function getTimelineNodeStyleOptions() {
  if (
    typeof window !== "undefined" &&
    Array.isArray(window.TIMELINE_NODE_STYLES) &&
    window.TIMELINE_NODE_STYLES.length > 0
  ) {
    return window.TIMELINE_NODE_STYLES;
  }
  return DEFAULT_TIMELINE_NODE_STYLE_OPTIONS;
}

/**
 * 把选中的文本包成 [[colorKey|文本]]
 */
function wrapSelectionWithColor(fieldEl, colorKey) {
  if (!fieldEl || !colorKey) return;

  const start = fieldEl.selectionStart ?? 0;
  const end = fieldEl.selectionEnd ?? start;
  const value = fieldEl.value || "";

  const selected = value.slice(start, end) || "文本";
  const replacement = `[[${colorKey}|${selected}]]`;

  fieldEl.setRangeText(replacement, start, end, "end");
  fieldEl.focus();
}

function isColorEditableField(fieldEl) {
  if (!fieldEl || fieldEl.disabled || fieldEl.readOnly) return false;
  if (fieldEl.dataset?.colorToolbarSkip === "true") return false;

  if (fieldEl instanceof HTMLTextAreaElement) return true;

  if (fieldEl instanceof HTMLInputElement) {
    const type = String(fieldEl.type || "text").toLowerCase();
    return type === "text" || type === "search";
  }

  return false;
}

function rememberFieldSelection(state, fieldEl) {
  if (!state || !isColorEditableField(fieldEl)) return;

  state.element = fieldEl;
  state.start = fieldEl.selectionStart ?? 0;
  state.end = fieldEl.selectionEnd ?? state.start;
}

function restoreFieldSelection(state, fallbackEl = null) {
  const fieldEl =
    state?.element && isColorEditableField(state.element)
      ? state.element
      : fallbackEl;

  if (!isColorEditableField(fieldEl)) return null;

  const valueLength = String(fieldEl.value || "").length;
  const start = Math.max(0, Math.min(state?.start ?? 0, valueLength));
  const end = Math.max(start, Math.min(state?.end ?? start, valueLength));

  fieldEl.focus();
  if (typeof fieldEl.setSelectionRange === "function") {
    fieldEl.setSelectionRange(start, end);
  }

  return fieldEl;
}

function getFieldDisplayName(fieldEl) {
  if (!fieldEl) return "当前字段";

  const rowLabel = fieldEl.closest(".field-row")?.querySelector("label");
  if (rowLabel?.textContent?.trim()) {
    return rowLabel.textContent.trim();
  }

  const settingsLabel = fieldEl.closest(".settings-field")?.querySelector("span");
  if (settingsLabel?.textContent?.trim()) {
    return settingsLabel.textContent.trim();
  }

  return fieldEl.id || "当前字段";
}

/**
 * 去掉文本中的 [[xxx|文字]] 标签，保留“文字”
 */
function stripColorTags(text) {
  if (!text) return text;
  return text.replace(/\[\[[^|\[\]]+\|([\s\S]*?)\]\]/g, "$1");
}

/**
 * 在选中区域（如果有）或整个字段中，去掉颜色标签
 */
function removeColorTagsFromSelection(fieldEl) {
  if (!fieldEl) return;

  const start = fieldEl.selectionStart ?? 0;
  const end = fieldEl.selectionEnd ?? start;
  const value = fieldEl.value || "";

  if (start === end) {
    const cleaned = stripColorTags(value);
    fieldEl.value = cleaned;
    fieldEl.selectionStart = fieldEl.selectionEnd = cleaned.length;
  } else {
    const selected = value.slice(start, end);
    const cleaned = stripColorTags(selected);
    fieldEl.setRangeText(cleaned, start, end, "end");
  }

  fieldEl.focus();
}

/**
 * 渲染 details 预览：
 * - [[colorKey|文本]] → <span style="color:xxx">文本</span>
 * - \n → <br>
 */
function renderDetailsPreview(text, container) {
  if (!container) return;
  const palette = getColorPalette();

  const safe = (text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const withColors = safe.replace(
    /\[\[([^|\[\]]+)\|([\s\S]*?)\]\]/g,
    (match, key, inner) => {
      const color = palette[key] || "#facc15"; // 默认金色兜底
      return `<span style="color:${color}">${inner}</span>`;
    }
  );

  const withBr = withColors.replace(/\n/g, "<br>");
  container.innerHTML = withBr;
}

/**
 * 在右侧编辑容器中，创建颜色工具条
 */
function initColorToolbar(container) {
  const palette = getColorPalette();
  const keys = COLOR_SHORTCUT_KEYS.filter((k) => palette[k]);

  const editableFields = Array.from(
    container.querySelectorAll('textarea, input[type="text"], input[type="search"]')
  ).filter(isColorEditableField);

  if (!editableFields.length) return;
  if (!keys.length) return;

  const selectionState = {
    element: null,
    start: 0,
    end: 0,
  };

  const toolbar = document.createElement("div");
  toolbar.className = "color-toolbar";

  const title = document.createElement("div");
  title.className = "color-toolbar-title";
  title.textContent =
    "颜色标签：选中文字后点击颜色可插入 [[color|文本]]；点击“× 去标签”可清除标签";

  const list = document.createElement("div");
  list.className = "color-toolbar-list";

  // 颜色块按钮
  keys.forEach((key) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "color-chip";
    btn.dataset.colorKey = key;
    btn.title = COLOR_SHORTCUT_LABELS[key] || key;
    btn.style.backgroundColor = palette[key];
    btn.style.border = "1px solid rgba(15,23,42,0.9)";
    btn.style.width = "20px";
    btn.style.height = "20px";
    btn.style.padding = "0";
    btn.style.borderRadius = "4px";
    btn.style.cursor = "pointer";
    btn.textContent = " ";

    list.appendChild(btn);
  });

  // “去标签”按钮
  const clearBtn = document.createElement("button");
  clearBtn.type = "button";
  clearBtn.className = "color-chip clear-chip";
  clearBtn.textContent = "×";
  clearBtn.title = "去掉颜色标签（对选区或整段）";
  clearBtn.style.width = "28px";
  clearBtn.style.height = "20px";
  clearBtn.style.padding = "0";
  clearBtn.style.borderRadius = "4px";
  clearBtn.style.cursor = "pointer";
  clearBtn.style.border = "1px solid rgba(148,163,184,0.7)";
  clearBtn.style.background = "#020617";
  clearBtn.style.color = "#e5e7eb";
  clearBtn.style.fontSize = "14px";
  clearBtn.style.display = "flex";
  clearBtn.style.alignItems = "center";
  clearBtn.style.justifyContent = "center";
  clearBtn.style.marginLeft = "8px";

  list.appendChild(clearBtn);

  toolbar.appendChild(title);
  toolbar.appendChild(list);

  container.appendChild(toolbar);

  clearBtn.textContent = "x";
  clearBtn.title = "清除当前选区或整段的颜色标签";
  title.textContent =
    "颜色标签：会作用到当前光标所在字段的选中文字；点“x”可清除当前选区或整段标签。";

  const updateToolbarTitle = (fieldEl) => {
    const fieldName = getFieldDisplayName(fieldEl || selectionState.element);
    title.textContent = `颜色标签：当前目标 ${fieldName}。选中文字后点击颜色可插入 [[color|文本]]；点“x”可清除标签。`;
  };

  editableFields.forEach((fieldEl) => {
    const syncSelection = () => {
      rememberFieldSelection(selectionState, fieldEl);
      updateToolbarTitle(fieldEl);
    };

    fieldEl.addEventListener("focus", syncSelection);
    fieldEl.addEventListener("click", syncSelection);
    fieldEl.addEventListener("keyup", syncSelection);
    fieldEl.addEventListener("select", syncSelection);
    fieldEl.addEventListener("input", syncSelection);
  });

  updateToolbarTitle(editableFields[0]);

  // 点击事件：颜色块 / 去标签
  toolbar.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;

    const activeEl = document.activeElement;
    let target = null;

    if (isColorEditableField(activeEl) && container.contains(activeEl)) {
      target = activeEl;
      rememberFieldSelection(selectionState, activeEl);
    } else if (selectionState.element && container.contains(selectionState.element)) {
      target = restoreFieldSelection(selectionState, selectionState.element);
    } else {
      target = editableFields[0] || null;
      if (target) {
        restoreFieldSelection(selectionState, target);
      }
    }
    if (!target) return;

    if (btn.classList.contains("clear-chip")) {
      removeColorTagsFromSelection(target);
      rememberFieldSelection(selectionState, target);
      const evt = new Event("input", { bubbles: true });
      target.dispatchEvent(evt);
      updateToolbarTitle(target);
      setStatus("已清除当前字段的颜色标签，记得应用修改并保存", "warn");
      setStatus("已去掉颜色标签（记得点击“应用修改”并保存）", "warn");
      return;
    }

    const colorKey = btn.dataset.colorKey;
    if (!colorKey) return;

    wrapSelectionWithColor(target, colorKey);
    rememberFieldSelection(selectionState, target);
    const evt = new Event("input", { bubbles: true });
    target.dispatchEvent(evt);
    updateToolbarTitle(target);

    setStatus("已插入颜色标签（记得点击“应用修改”并保存）", "warn");
  });
}

// ====== 工具函数：节点操作 ======
function getNode(root, path) {
  if (isSiteSettingsPath(path)) {
    return {
      ...ensureSiteSettings(root),
      title: SITE_SETTINGS_ROOT_NODE.title,
    };
  }
  if (isNovelsPath(path)) {
    let cur = novelsState;
    for (let k of path.slice(1)) cur = cur[k];
    return cur;
  }
  if (isMusicPath(path)) {
    if (path[1] === "root") return MUSIC_ROOT_NODE;
    if (path[1] === "playlist") {
      return ensureMusicPlaylist(root)[path[2]];
    }
    return null;
  }
  let cur = root;
  for (let k of path) cur = cur[k];
  return cur;
}

function getParent(root, path) {
  const parentPath = path.slice(0, -1);
  const key = path[path.length - 1];
  const parent = getNode(root, parentPath);
  return { parent, key, parentPath };
}

function isSamePath(a, b) {
  return (
    Array.isArray(a) &&
    Array.isArray(b) &&
    a.length === b.length &&
    a.every((part, index) => part === b[index])
  );
}

function getSortableInfo(path) {
  if (!Array.isArray(path) || path.length < 2 || isNovelsPath(path) || isSiteSettingsPath(path)) return null;

  if (isMusicPath(path)) {
    if (path[1] !== "playlist") return null;
    const index = Number(path[2]);
    const list = ensureMusicPlaylist(websiteData);
    if (!Array.isArray(list) || !Number.isInteger(index)) return null;
    return {
      collectionPath: ["__music", "playlist"],
      arrayName: "playlist",
      list,
      index,
    };
  }

  const collectionPath = path.slice(0, -1);
  const arrayName = path[path.length - 2];
  const list = getNode(websiteData, collectionPath);
  const index = Number(path[path.length - 1]);

  if (!Array.isArray(list) || !Number.isInteger(index)) return null;

  return {
    collectionPath,
    arrayName,
    list,
    index,
  };
}

function clearTreeDragState() {
  dragOverPath = null;
  dragDropPlacement = "before";
  document.querySelectorAll(".tree-node").forEach((node) => {
    node.style.opacity = "";
    node.style.background = "";
    node.style.boxShadow = "";
  });
}

function decorateDropTarget(el, placement) {
  if (!el) return;
  const highlight =
    placement === "after"
      ? "inset 0 -3px 0 rgba(59,130,246,0.95)"
      : "inset 0 3px 0 rgba(59,130,246,0.95)";
  el.style.background = "rgba(59,130,246,0.16)";
  el.style.boxShadow = highlight;
}

function getNodeType(path) {
  if (!path) return "node";
  if (isSiteSettingsPath(path)) return "siteSettings";
  // 小说树（独立于 websiteData）
  if (isNovelsPath(path)) {
    if (path[1] === "root") return "novelsRoot";
    const key = path[path.length - 2];
    if (key === "manifest") return "novel";
    if (key === "chapters") return "novelChapter";
    if (key === "paragraphs") return "novelParagraph";
    if (key === "novels") return "novelDoc";
    return "novelNode";
  }
  if (isMusicPath(path)) {
    if (path[1] === "root") return "musicRoot";
    if (path[1] === "playlist") return "musicTrack";
    return "musicNode";
  }
  const key = path[path.length - 2];
  if (key === "categories") return "category";
  if (key === "items") return "item";
  if (key === "subItems") return "subItem";
  if (key === "eras") return "era";
  if (key === "branches") return "branch";
  if (key === "events") return "branchEvent";
  return "node";
}

const LAW_CATEGORY_ID = "laws";

function isLawPath(path) {
  return (
    Array.isArray(path) &&
    path[0] === "categories" &&
    Number.isInteger(path[1]) &&
    websiteData?.categories?.[path[1]]?.id === LAW_CATEGORY_ID
  );
}

function getLawNodeRole(path) {
  if (!isLawPath(path)) return null;
  if (path.length === 2) return "lawCategory";
  if (path.length === 4 && path[2] === "items") return "lawSection";
  if (path.length === 6 && path[4] === "subItems") return "law";
  if (path.length === 8 && path[6] === "subItems") return "lawClause";
  return null;
}

function readLawMeta(node) {
  return node && typeof node.lawMeta === "object" && !Array.isArray(node.lawMeta)
    ? node.lawMeta
    : {};
}

function ensureLawMeta(node) {
  if (!node.lawMeta || typeof node.lawMeta !== "object" || Array.isArray(node.lawMeta)) {
    node.lawMeta = {};
  }
  return node.lawMeta;
}

function listToTextarea(value) {
  if (Array.isArray(value)) {
    return value
      .map((entry) => String(entry ?? "").trim())
      .filter(Boolean)
      .join("\n");
  }
  if (typeof value === "string") return value;
  return "";
}

function normalizeLawHistoryEntries(value) {
  if (!Array.isArray(value)) return [];

  return value
    .filter((entry) => entry && typeof entry === "object")
    .map((entry) => ({
      title: String(entry.title || ""),
      statusTone: String(entry.statusTone || ""),
      statusLabel: String(entry.statusLabel || ""),
      eraLabel: String(entry.eraLabel || ""),
      summary: String(entry.summary || ""),
      text: String(entry.text || ""),
      note: String(entry.note || ""),
      positiveEffects: Array.isArray(entry.positiveEffects)
        ? [...entry.positiveEffects]
        : textareaToList(entry.positiveEffects),
      negativeEffects: Array.isArray(entry.negativeEffects)
        ? [...entry.negativeEffects]
        : textareaToList(entry.negativeEffects),
      neutralEffects: Array.isArray(entry.neutralEffects)
        ? [...entry.neutralEffects]
        : textareaToList(entry.neutralEffects),
    }))
    .filter((entry) => entry.title || entry.summary || entry.text);
}

function textareaToList(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function escapeEditorValue(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeHtml(value) {
  return escapeEditorValue(value);
}

function findSiteEventSlideCard(element) {
  return element?.closest?.("[data-site-event-slide-index]") || null;
}

function collectSiteEventSlidesFromEditor() {
  const cards = Array.from(document.querySelectorAll("[data-site-event-slide-index]"));
  const slides = cards.map((card) => {
    const getField = (field) =>
      card.querySelector(`[data-site-event-slide-field="${field}"]`)?.value;
    return normalizeSiteEventSlide({
      image: getField("image"),
      text: getField("text"),
      durationMs: getField("durationMs"),
      camera: getField("camera"),
    });
  });
  return slides.length ? slides : [{ ...DEFAULT_SITE_EVENT_SLIDE }];
}

function syncLegacySiteEventFieldsFromSlides(event) {
  const firstSlide = normalizeSiteEventSlide(Array.isArray(event.slides) ? event.slides[0] : null);
  event.image = firstSlide.image;
  event.text = firstSlide.text;
  event.imageMs = firstSlide.durationMs;
}

function countNodeChildren(node) {
  if (!node || typeof node !== "object") return 0;

  return [
    "items",
    "subItems",
    "children",
    "eras",
    "branches",
    "events",
    "chapters",
    "paragraphs",
  ].reduce((total, key) => total + (Array.isArray(node[key]) ? node[key].length : 0), 0);
}

function getDisplayTypeLabel(type) {
  return (
    {
      category: "分类",
      item: "条目",
      subItem: "子节点",
      era: "时间线",
      branch: "分支",
      branchEvent: "分支事件",
      siteSettings: "站点设置",
      musicRoot: "音乐库",
      musicTrack: "歌曲",
      musicNode: "音乐节点",
      novelsRoot: "小说库",
      novel: "小说",
      novelDoc: "正文",
      novelChapter: "章节",
      novelParagraph: "段落",
      node: "节点",
    }[type] || type || "节点"
  );
}

function getPathDisplay(path) {
  if (!Array.isArray(path) || !path.length) return "未选择节点";

  if (isSiteSettingsPath(path)) {
    return SITE_SETTINGS_ROOT_NODE.title;
  }

  if (isMusicPath(path)) {
    const parts = [MUSIC_ROOT_NODE.title];
    if (path[1] === "root") return parts.join(" / ");
    if (path[1] === "playlist") {
      const track = ensureMusicPlaylist(websiteData)[path[2]];
      if (track) parts.push(track.name || `歌曲 ${Number(path[2]) + 1}`);
    }
    return parts.join(" / ");
  }

  if (isNovelsPath(path)) {
    const parts = ["小说库"];
    if (path[1] === "root") return parts.join(" / ");

    if (path[1] === "manifest") {
      const entry = novelsState.manifest?.[path[2]];
      if (entry) parts.push(entry.title || entry.id || "未命名小说");
      return parts.join(" / ");
    }

    if (path[1] === "novels") {
      const novelId = path[2];
      const novel = novelsState.novels?.[novelId];
      parts.push(novel?.title || novelId || "小说");

      if (path[3] === "chapters") {
        const chapter = novel?.chapters?.[path[4]];
        parts.push(chapter?.title || `章节 ${Number(path[4]) + 1}`);
      } else {
        parts.push("正文");
      }
      return parts.join(" / ");
    }

    return parts.join(" / ");
  }

  const parts = [];
  let current = websiteData;
  for (let i = 0; i < path.length; i += 2) {
    const collectionName = path[i];
    const index = path[i + 1];
    const list = current?.[collectionName];
    if (!Array.isArray(list)) break;
    const node = list[index];
    if (!node) break;
    parts.push(node.title || `${collectionName} ${Number(index) + 1}`);
    current = node;
  }

  return parts.join(" / ") || "未命名路径";
}

function getTreeNodeSubtitle(node, path, type) {
  if (!node || typeof node !== "object") return "";

  if (type === "siteSettings") {
    const settings = ensureSiteSettings(websiteData);
    const event = ensureSiteEvent(websiteData);
    const icpText = settings.icpNumber ? `ICP备案：${settings.icpNumber}` : "ICP备案未填写";
    return `${icpText} · 活动${event.enabled ? "开启" : "关闭"}`;
  }

  if (type === "musicRoot") {
    const total = ensureMusicPlaylist(websiteData).length;
    return total > 0 ? `${total} 首歌曲` : "暂无歌曲";
  }

  if (type === "musicTrack") {
    return getMusicFileLabel(node?.src || "") || "未上传音频";
  }

  if (type === "branch") {
    const from = Number.isFinite(Number(node.fromEraIndex))
      ? `Era ${Number(node.fromEraIndex)}`
      : "未设起点";
    const to = Number.isFinite(Number(node.toEraIndex))
      ? `Era ${Number(node.toEraIndex)}`
      : "未设终点";
    return `${from} -> ${to}`;
  }

  if (type === "branchEvent" && node.time) {
    return String(node.time);
  }

  const lawRole = getLawNodeRole(path);
  const lawMeta = readLawMeta(node);
  if (lawRole === "law") {
    return lawMeta.statusLabel || lawMeta.subtitle || "";
  }
  if (lawRole === "lawClause") {
    return lawMeta.badge || lawMeta.subtitle || "";
  }

  if (typeof node.id === "string" && node.id.trim()) {
    return `ID: ${node.id.trim()}`;
  }

  return "";
}

function getNodeMetaChips(path, node, type, sectionCount = 0) {
  const chips = [{ text: getDisplayTypeLabel(type), tone: "type" }];
  const childCount =
    type === "musicRoot"
      ? ensureMusicPlaylist(websiteData).length
      : type === "siteSettings"
        ? 0
        : countNodeChildren(node);

  if (childCount > 0) {
    chips.push({ text: `${childCount} 子节点`, tone: "count" });
  }

  if (type === "siteSettings") {
    chips.push({
      text: node?.icpNumber ? "ICP备案已设置" : "ICP备案待填写",
      tone: node?.icpNumber ? "asset" : "warn",
    });
    const event = ensureSiteEvent(websiteData);
    chips.push({
      text: event.enabled ? "活动已开启" : "活动已关闭",
      tone: event.enabled ? "accent" : "neutral",
    });
  }

  if (node?.image) {
    chips.push({ text: "含图片", tone: "asset" });
  }

  if (type === "musicTrack") {
    chips.push({
      text: node?.src ? "含音频" : "待上传",
      tone: node?.src ? "asset" : "warn",
    });
  }

  if (sectionCount > 0) {
    chips.push({ text: `${sectionCount} 编辑区`, tone: "neutral" });
  }

  if (Array.isArray(path) && isLawPath(path)) {
    const lawRole = getLawNodeRole(path);
    const lawMeta = readLawMeta(node);
    const historyCount = normalizeLawHistoryEntries(lawMeta.historyEntries).length;

    if (lawRole === "law" && historyCount > 0) {
      chips.push({ text: `${historyCount} 历史法案`, tone: "history" });
    }

    if (lawMeta.layout === CHARTER_LAW_LAYOUT_ID) {
      chips.push({ text: "宪章法", tone: "accent" });
    }
  }

  if (Array.isArray(path) && isNovelsPath(path)) {
    const novelId = getNovelIdFromPath(path);
    if (novelId && novelsState.dirty?.[novelId]) {
      chips.push({ text: "正文有未保存改动", tone: "warn" });
    }
  }

  return chips;
}

function renderMetaChips(chips, className = "editor-meta-chip") {
  return (chips || [])
    .map((chip) => {
      const tone = chip?.tone ? ` ${className}--${chip.tone}` : "";
      return `<span class="${className}${tone}">${escapeHtml(chip?.text || "")}</span>`;
    })
    .join("");
}

function getTreeChildCollections(node) {
  if (!node || typeof node !== "object") return [];

  return ["items", "subItems", "children", "eras", "branches", "events"]
    .map((prop) => ({ prop, list: node[prop] }))
    .filter((entry) => Array.isArray(entry.list) && entry.list.length > 0);
}

function enhanceTreeNodes(container) {
  Array.from(container.querySelectorAll(".tree-node")).forEach((el) => {
    const pathText = el.getAttribute("data-path");
    if (!pathText) return;

    let path = null;
    try {
      path = JSON.parse(pathText);
    } catch (_error) {
      return;
    }

    const node = getNode(websiteData, path);
    const type = getNodeType(path);
    const subtitle = getTreeNodeSubtitle(node, path, type);
    const badgesHtml = renderMetaChips(getNodeMetaChips(path, node, type), "tree-badge");

    const mainLabel = el.querySelector(".label-main");
    if (!mainLabel) return;

    const iconText = String(mainLabel.textContent || "");
    const tags = el.querySelector(".tree-node-tags");
    if (tags) tags.remove();
    mainLabel.remove();

    const body = document.createElement("span");
    body.className = "tree-node-body";

    const nextMain = document.createElement("span");
    nextMain.className = "label-main";
    nextMain.textContent = iconText;
    body.appendChild(nextMain);

    if (subtitle) {
      const nextSub = document.createElement("span");
      nextSub.className = "tree-node-sub";
      nextSub.textContent = subtitle;
      body.appendChild(nextSub);
    }

    const nextTags = document.createElement("span");
    nextTags.className = "tree-node-tags";
    nextTags.innerHTML = `${badgesHtml}<span class="label-type">${escapeHtml(type)}</span>`;

    el.appendChild(body);
    el.appendChild(nextTags);
  });
}

function renderEditorOutline(editor) {
  const outline = $("editor-outline");
  if (!outline) return;

  const headings = Array.from(editor.querySelectorAll(".editor-section h2")).filter(
    (heading) => heading.textContent && heading.textContent.trim()
  );

  if (!headings.length) {
    outline.innerHTML =
      '<span class="editor-outline-note">快捷键：Ctrl/Cmd + S 保存全部，Ctrl/Cmd + Enter 应用当前</span>';
    return;
  }

  headings.forEach((heading, index) => {
    if (!heading.id) {
      heading.id = `editor-section-${index + 1}`;
    }
  });

  outline.innerHTML = headings
    .map(
      (heading, index) => `
        <button type="button" class="outline-chip" data-outline-target="${heading.id}" data-outline-index="${index}">
          ${escapeHtml(heading.textContent.trim())}
        </button>
      `
    )
    .join("");

  Array.from(outline.querySelectorAll("[data-outline-target]")).forEach((button) => {
    button.addEventListener("click", () => {
      const target = document.getElementById(button.getAttribute("data-outline-target"));
      if (!target) return;
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

function updateEditorChrome(context = {}) {
  const pathEl = $("editor-node-path");
  const titleEl = $("editor-node-title");
  const metaEl = $("editor-node-meta");
  const applyBtn = $("editor-apply-current-btn");
  const addBtn = $("add-child-btn");
  const deleteBtn = $("delete-node-btn");
  const saveBtn = $("editor-save-all-btn");
  const selectionBar = $("editor-selection-bar");
  const editor = $("editor-container");

  const path = context.path || null;
  const node = context.node || null;
  const type = context.type || "";
  const sectionCount = Number(context.sectionCount || 0);
  const hasSelection = Array.isArray(path) && path.length > 0;
  const canChangeTree = hasSelection && !isNovelsPath(path) && !isSiteSettingsPath(path);
  const canApplyCurrent = !!editor?.querySelector("#apply-edit");

  if (pathEl) pathEl.textContent = hasSelection ? getPathDisplay(path) : "未选择节点";
  if (titleEl) {
    titleEl.textContent = hasSelection
      ? String(node?.title || node?.name || context.title || "未命名节点")
      : "请选择左侧节点";
  }
  if (metaEl) {
    metaEl.innerHTML = hasSelection
      ? renderMetaChips(getNodeMetaChips(path, node, type, sectionCount))
      : '<span class="editor-meta-chip editor-meta-chip--neutral">从左侧结构树中选择一个节点开始编辑</span>';
  }

  if (selectionBar) {
    selectionBar.classList.toggle("has-selection", hasSelection);
  }

  if (applyBtn) applyBtn.disabled = !canApplyCurrent;
  if (addBtn) addBtn.disabled = !canChangeTree;
  if (deleteBtn) deleteBtn.disabled = !canChangeTree;
  if (saveBtn) saveBtn.disabled = !websiteData;
}

function finalizeEditorRender(editor, context = {}) {
  Array.from(editor.querySelectorAll(".editor-section")).forEach((section, index) => {
    section.classList.add("editor-card");
    section.dataset.sectionIndex = String(index);
  });

  renderEditorOutline(editor);
  updateEditorChrome({
    ...context,
    sectionCount: editor.querySelectorAll(".editor-section").length,
  });
}

function triggerApplyCurrentEdit() {
  const applyBtn = $("apply-edit");
  if (!applyBtn) {
    setStatus("当前节点没有可应用的表单修改", "warn");
    return;
  }
  applyBtn.click();
}

function bindGlobalShortcuts() {
  document.addEventListener("keydown", (event) => {
    const isModifier = event.ctrlKey || event.metaKey;
    if (!isModifier) return;

    const key = String(event.key || "").toLowerCase();
    if (key === "s") {
      event.preventDefault();
      saveData();
      return;
    }

    if (key === "enter") {
      const active = document.activeElement;
      const withinEditableControl =
        active &&
        ["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName);

      if (!withinEditableControl) return;

      event.preventDefault();
      triggerApplyCurrentEdit();
    }
  });
}

function assignMetaText(meta, key, value) {
  const normalized = String(value || "").trim();
  if (normalized) meta[key] = normalized;
  else delete meta[key];
}

function assignMetaList(meta, key, value) {
  const list = textareaToList(value);
  if (list.length) meta[key] = list;
  else delete meta[key];
}

function assignMetaNumber(meta, key, value) {
  const parsed = Number(value);
  if (Number.isFinite(parsed)) meta[key] = parsed;
  else delete meta[key];
}

function assignMetaBoolean(meta, key, checked) {
  if (checked) meta[key] = true;
  else delete meta[key];
}

// Charter laws reuse the same JSON tree but expose extra metadata for the special branching layout.
const CHARTER_LAW_LAYOUT_ID = "charter";

function isCharterLawNode(node) {
  return readLawMeta(node).layout === CHARTER_LAW_LAYOUT_ID;
}

function getCharterLawNodeForSelection(path) {
  if (!Array.isArray(path) || !websiteData) return null;

  const lawRole = getLawNodeRole(path);
  if (lawRole === "law") {
    const node = getNode(websiteData, path);
    return isCharterLawNode(node) ? node : null;
  }

  if (lawRole === "lawClause" && path.length >= 2) {
    const parentPath = path.slice(0, -2);
    const parentLaw = getNode(websiteData, parentPath);
    return isCharterLawNode(parentLaw) ? parentLaw : null;
  }

  return null;
}

// ====== 全局搜索相关 ======

/**
 * 遍历所有节点，按关键词匹配 id/title/details，并按类型过滤
 * typeFilter: 'all' | 'category' | 'item' | 'subItem' | 'era' | 'branch' | 'branchEvent'
 */
function searchNodes(keyword, typeFilter = "all") {
  if (!websiteData || !Array.isArray(websiteData.categories)) return [];
  const kw = keyword.trim().toLowerCase();
  if (!kw) return [];

  const results = [];
  const cats = websiteData.categories;

  cats.forEach((cat, idx) => {
    traverseForSearch(cat, ["categories", idx], kw, typeFilter, results);
  });

  const settings = ensureSiteSettings(websiteData);
  const event = ensureSiteEvent(websiteData);
  const siteSettingsHaystack = [
    SITE_SETTINGS_ROOT_NODE.title,
    "ICP ICP备案 备案号 工信部 限时活动 启动页 开屏 首页 图片 文案",
    settings.icpNumber,
    settings.icpUrl,
    event.enabled ? "活动开启" : "活动关闭",
    event.image,
    event.text,
  ]
    .join(" ")
    .toLowerCase();
  if (
    (typeFilter === "all" || typeFilter === "siteSettings") &&
    siteSettingsHaystack.includes(kw)
  ) {
    results.push({
      path: ["__siteSettings", "root"],
      title: SITE_SETTINGS_ROOT_NODE.title,
      type: "siteSettings",
      snippet: `${settings.icpNumber || "ICP备案未填写"} · 活动${event.enabled ? "开启" : "关闭"}`,
    });
  }

  const playlist = ensureMusicPlaylist(websiteData);
  const musicRootHaystack = [MUSIC_ROOT_NODE.title, "音乐 歌曲 播放列表"]
    .join(" ")
    .toLowerCase();
  if ((typeFilter === "all" || typeFilter === "musicRoot") && musicRootHaystack.includes(kw)) {
    results.push({
      path: ["__music", "root"],
      title: MUSIC_ROOT_NODE.title,
      type: "musicRoot",
      snippet: `共 ${playlist.length} 首歌曲`,
    });
  }
  if (typeFilter === "all" || typeFilter === "musicTrack") {
    playlist.forEach((track, index) => {
      const fields = [track?.name, track?.src, getMusicFileLabel(track?.src)].filter(Boolean);
      const hay = fields.join(" ").toLowerCase();
      if (!hay.includes(kw)) return;
      results.push({
        path: ["__music", "playlist", index],
        title: track?.name || `歌曲 ${index + 1}`,
        type: "musicTrack",
        snippet: getMusicFileLabel(track?.src || "") || track?.src || "",
      });
    });
  }

  return results;
}

function traverseForSearch(node, path, kw, typeFilter, results) {
  if (!node || typeof node !== "object") return;

  const nodeType = getNodeType(path);

  // 只有类型匹配（或过滤为 all）时，当前节点才参与匹配
  if (typeFilter === "all" || nodeType === typeFilter) {
    const fields = [];
    if (node.id) fields.push(String(node.id));
    if (node.title) fields.push(String(node.title));
    if (node.details) fields.push(String(node.details));
    if (node.lawMeta && typeof node.lawMeta === "object" && !Array.isArray(node.lawMeta)) {
      Object.values(node.lawMeta).forEach((value) => {
        if (Array.isArray(value)) fields.push(value.join(" "));
        else if (value != null && typeof value !== "object") fields.push(String(value));
      });
    }

    const hay = fields.join(" ").toLowerCase();
    if (hay.includes(kw)) {
      results.push({
        path: [...path],
        title: node.title || "(未命名)",
        type: nodeType,
        snippet: makeSnippet(node.details || "", kw),
      });
    }
  }

  // 子节点继续遍历
  const childProps = [
    "items",
    "subItems",
    "eras",
    "children",
    "branches",
    "events",
  ];
  childProps.forEach((prop) => {
    if (Array.isArray(node[prop])) {
      node[prop].forEach((child, idx) =>
        traverseForSearch(child, [...path, prop, idx], kw, typeFilter, results)
      );
    }
  });
}

/**
 * 生成简短 snippet，用于搜索结果展示
 */
function makeSnippet(details, kw) {
  const text = details || "";
  const lower = text.toLowerCase();
  const idx = lower.indexOf(kw);
  if (idx === -1) {
    return text.slice(0, 40).replace(/\s+/g, " ");
  }
  const start = Math.max(0, idx - 10);
  const end = Math.min(text.length, idx + kw.length + 20);
  let snippet = text.slice(start, end).replace(/\s+/g, " ");
  if (start > 0) snippet = "…" + snippet;
  if (end < text.length) snippet = snippet + "…";
  return snippet;
}

/**
 * 渲染搜索结果列表
 */
function renderSearchResults(results) {
  const panel = $("search-results");
  if (!panel) return;

  lastSearchResultsCount = Array.isArray(results) ? results.length : 0;
  if (lastSearchResultsCount > 0 && searchResultsCollapsed) {
    setSearchResultsCollapsed(false);
  } else {
    updateSearchResultsPanelChrome();
  }

  if (!Array.isArray(results) || !results.length) {
    panel.innerHTML = '<div class="search-results-empty">搜索结果会显示在这里。支持按标题、ID 和正文内容快速定位。</div>';
      '<div style="color:#6b7280;font-size:12px;">无匹配结果</div>';
    return;
  }

  let html = "";
  results.slice(0, 50).forEach((r, idx) => {
    const pathLabel = getPathDisplay(r.path);
    html += `
      <div class="search-result-item" data-index="${idx}">
        <div class="search-result-title">
          <span>${escapeHtml(r.title)}</span>
          <span class="search-result-type">${escapeHtml(getDisplayTypeLabel(r.type))}</span>
        </div>
        <div class="search-result-path">${escapeHtml(pathLabel)}</div>
        ${
          r.snippet
            ? `<div class="search-result-snippet">${escapeHtml(r.snippet)}</div>`
            : ""
        }
      </div>
    `;
  });

  if (results.length > 50) {
    html += `<div style="margin-top:3px;color:#9ca3af;font-size:11px;">只显示前 50 条，共 ${results.length} 条匹配</div>`;
  }

  panel.innerHTML = html;

  Array.from(panel.querySelectorAll(".search-result-item")).forEach((el) => {
    el.addEventListener("click", () => {
      const idx = Number(el.getAttribute("data-index"));
      const r = results[idx];
      if (!r) return;
      expandTreeAncestors(r.path);
      selectedPath = r.path;
      renderTree();
      renderEditor();
      setStatus(`已跳转到搜索结果：${r.title}`, "ok");
    });
  });
}

/**
 * 处理搜索按钮 / 回车
 */
function handleGlobalSearch() {
  const input = $("global-search-input");
  if (!input) return;
  const kw = input.value.trim();

  const typeSel = $("search-type-filter");
  const typeFilter = typeSel ? typeSel.value : "all";

  if (!kw) {
    setStatus("请输入搜索关键字", "warn");
    renderSearchResults([]);
    return;
  }

  const results = searchNodes(kw, typeFilter);
  if (!results.length) {
    setStatus("未找到匹配结果", "warn");
    renderSearchResults([]);
    return;
  }

  if (results.length > 1) {
    setStatus(
      `找到 ${results.length} 条匹配结果（筛选类型：${
        typeFilter === "all" ? "全部" : getDisplayTypeLabel(typeFilter)
      }）`,
      "ok"
    );
    renderSearchResults(results);
    return;
  }

  const r = results[0];
  expandTreeAncestors(r.path);
  selectedPath = r.path;
  renderTree();
  renderEditor();
  renderSearchResults(results);
  setStatus(`已跳转到唯一匹配结果：${r.title}`, "ok");
}

// ====== 加载 / 保存数据 ======
async function loadData() {
  setStatus("正在加载 website-data…", "warn");

  try {
    const res = await fetch(GET_ENDPOINT, { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    websiteData = await res.json();

    if (!websiteData || !Array.isArray(websiteData.categories)) {
      throw new Error("返回数据缺少 categories 数组");
    }

    ensureMusicPlaylist(websiteData);
    ensureSiteSettings(websiteData);
    ensureSiteEvent(websiteData);

    // 额外加载小说清单（失败也不影响 website-data）
    await loadNovelsManifest();

    renderTree();
    renderEditor();
    setStatus("加载完成", "ok");
  } catch (e) {
    console.error(e);
    setStatus("加载失败：Failed to load website-data", "error");
  }
}

async function saveData() {
  if (!websiteData) {
    setStatus("当前没有可保存的数据", "error");
    return;
  }

  ensureMusicPlaylist(websiteData);
  ensureSiteSettings(websiteData);
  ensureSiteEvent(websiteData);
  setStatus("正在保存 website-data…", "warn");

  try {
    const res = await fetch(SAVE_ENDPOINT, {
      method: "POST",
      headers: buildAdminHeaders({
        "Content-Type": "application/json",
      }),
      body: JSON.stringify(websiteData),
    });

    const r = await res.json().catch(() => ({}));

    if (res.status === 401 || r.error === "Invalid admin token") {
      handleAdminAuthFailure();
      return;
    }

    if (!res.ok || r.error) {
      throw new Error(r.error || `HTTP ${res.status}`);
    }

    setStatus("保存成功", "ok");
  } catch (e) {
    console.error(e);
    setStatus("保存失败", "error");
  }
}

// ====== 左侧树：递归渲染 + 点击选择 + 同层级拖拽排序 ======
function renderTree() {
  const container = $("tree-container");
  if (!container) return;
  container.innerHTML = "";

  if (!websiteData || !Array.isArray(websiteData.categories)) {
    container.innerHTML = "<div>尚未加载数据或数据结构异常。</div>";
    return;
  }

  renderSiteSettingsTree(container);

  websiteData.categories.forEach((cat, i) => {
    renderTreeNode(container, cat, ["categories", i], 0);
  });

  renderMusicTree(container);

  // 小说库（新增，不改变 websiteData 树结构）
  renderNovelsTree(container);
  enhanceTreeNodes(container);

  container.querySelectorAll(".tree-node").forEach((el) => {
    el.addEventListener("click", async (event) => {
      const path = JSON.parse(el.dataset.path);
      if (event.target.closest(".tree-toggle")) {
        event.preventDefault();
        event.stopPropagation();
        toggleTreeNodeCollapsed(path);
        renderTree();
        return;
      }
      if (isNovelsPath(path)) {
        await handleNovelNodeClick(path);
        return;
      }
      if (isSiteSettingsPath(path)) {
        selectedPath = path;
        renderTree();
        renderEditor();
        return;
      }
      if (isMusicPath(path)) {
        expandTreeAncestors(path);
        selectedPath = path;
        renderTree();
        renderEditor();
        return;
      }
      expandTreeAncestors(path);
      selectedPath = path;
      renderTree();
      renderEditor();
    });

    if (el.getAttribute("draggable") === "true") {
      el.addEventListener("dragstart", onDragStart);
      el.addEventListener("dragover", onDragOver);
      el.addEventListener("dragleave", onDragLeave);
      el.addEventListener("drop", onDrop);
      el.addEventListener("dragend", onDragEnd);
    }
  });
}

function renderSiteSettingsTree(container) {
  renderMusicTreeLine(
    container,
    SITE_SETTINGS_ROOT_NODE,
    ["__siteSettings", "root"],
    0,
    "⚙",
    getDisplayTypeLabel("siteSettings"),
    false
  );
}

function renderTreeNode(container, node, path, depth) {
  const type = getNodeType(path);
  const isSelected =
    selectedPath && JSON.stringify(selectedPath) === JSON.stringify(path);
  const childCollections = getTreeChildCollections(node);
  const hasChildren = childCollections.length > 0;
  const isCollapsed = hasChildren ? isTreeNodeCollapsed(path) : false;

  const icon =
    {
      category: "📁",
      item: "📄",
      subItem: "🧩",
      era: "🕰️",
      branch: "⎇", // 分支时间线：分叉符号
      branchEvent: "✦", // 支线事件：小星标
      node: "🗂️",
    }[type] || "📄";

  let indent = "";
  for (let i = 0; i < depth; i++) {
    indent += `<span class="tree-indent"></span>`;
  }
  const subtitle = getTreeNodeSubtitle(node, path, type);
  const badgesHtml = renderMetaChips(getNodeMetaChips(path, node, type), "tree-badge");

  container.innerHTML += `
    <div class="tree-node ${isSelected ? "selected" : ""}"
         data-path='${JSON.stringify(path)}'
         draggable="true">
      ${indent}
      ${
        hasChildren
          ? `<button type="button" class="tree-toggle ${isCollapsed ? "collapsed" : "expanded"}" aria-label="${isCollapsed ? "展开子节点" : "收起子节点"}" aria-expanded="${isCollapsed ? "false" : "true"}">▸</button>`
          : `<span class="tree-toggle-spacer" aria-hidden="true"></span>`
      }
      <span class="label-main">${icon} ${node.title || "(未命名)"}</span>
      <span class="tree-node-tags">
        ${badgesHtml}
        <span class="label-type">${escapeHtml(type)}</span>
      </span>
    </div>
  `;

  if (isCollapsed) {
    return;
  }

  for (const { prop, list } of childCollections) {
    list.forEach((child, index) => {
      renderTreeNode(container, child, [...path, prop, index], depth + 1);
    });
  }
}

// ====== 小说树（新增） ======

function renderNovelsTree(container) {
  // 如果还没拉到 manifest，就只渲染根节点（避免干扰主树）
  const manifest = Array.isArray(novelsState.manifest) ? novelsState.manifest : [];

  const rootPath = ["__novels", "root"];
  renderNovelTreeLine(container, novelsState.root, rootPath, 0, "📚", "novelsRoot");

  manifest.forEach((entry, idx) => {
    const p = ["__novels", "manifest", idx];
    const id = entry?.id;
    const loaded = !!(id && novelsState.novels[id]);
    const dirty = !!(id && novelsState.dirty[id]);

    const titleSuffix = `${loaded ? "" : "（未加载）"}${dirty ? " *" : ""}`;
    const node = { title: `${entry?.title || id || "(未命名)"}${titleSuffix}` };
    renderNovelTreeLine(container, node, p, 1, "📘", "novel");
    if (loaded) {
      const dp = ["__novels", "novels", id];
      renderNovelTreeLine(container, { title: "正文（连贯编辑）" }, dp, 2, "📄", "novelDoc");
    }

    if (loaded && Array.isArray(novelsState.novels[id]?.chapters)) {
      novelsState.novels[id].chapters.forEach((ch, ci) => {
        const cp = ["__novels", "novels", id, "chapters", ci];
        renderNovelTreeLine(
          container,
          { title: ch?.title || `Chapter ${ci + 1}` },
          cp,
          2,
          "🧩",
          "novelChapter"
        );
      });
    }
  });
}

function renderNovelTreeLine(container, node, path, depth, icon, typeLabel) {
  const isSelected =
    selectedPath && JSON.stringify(selectedPath) === JSON.stringify(path);

  let indent = "";
  for (let i = 0; i < depth; i++) {
    indent += `<span class="tree-indent"></span>`;
  }

  container.innerHTML += `
    <div class="tree-node ${isSelected ? "selected" : ""}"
         data-path='${JSON.stringify(path)}'
         draggable="false">
      ${indent}
      <span class="tree-toggle-spacer" aria-hidden="true"></span>
      <span class="label-main">${icon} ${node.title || "(未命名)"}</span>
      <span class="label-type">${typeLabel}</span>
    </div>
  `;
}

function renderMusicTree(container) {
  const playlist = ensureMusicPlaylist(websiteData);
  const rootPath = ["__music", "root"];

  renderMusicTreeLine(
    container,
    MUSIC_ROOT_NODE,
    rootPath,
    0,
    "♪",
    getDisplayTypeLabel("musicRoot"),
    false
  );

  playlist.forEach((track, index) => {
    renderMusicTreeLine(
      container,
      { title: track.name || `歌曲 ${index + 1}` },
      ["__music", "playlist", index],
      1,
      "♫",
      getDisplayTypeLabel("musicTrack"),
      true
    );
  });
}

function renderMusicTreeLine(container, node, path, depth, icon, typeLabel, draggable) {
  const isSelected =
    selectedPath && JSON.stringify(selectedPath) === JSON.stringify(path);

  let indent = "";
  for (let i = 0; i < depth; i++) {
    indent += `<span class="tree-indent"></span>`;
  }

  container.innerHTML += `
    <div class="tree-node ${isSelected ? "selected" : ""}"
         data-path='${JSON.stringify(path)}'
         draggable="${draggable ? "true" : "false"}">
      ${indent}
      <span class="tree-toggle-spacer" aria-hidden="true"></span>
      <span class="label-main">${icon} ${node.title || "(未命名)"}</span>
      <span class="label-type">${typeLabel}</span>
    </div>
  `;
}

async function handleNovelNodeClick(path) {
  selectedPath = path;

  const type = getNodeType(path);

  // 点击小说相关节点：自动拉正文（novel / 正文 / 章节）
  if (type === "novel" || type === "novelDoc" || type === "novelChapter") {
    const novelId = getNovelIdFromPath(path);
    if (novelId && !novelsState.novels[novelId]) {
      setStatus(`正在加载小说：${novelId}`, "warn");
      const loadedNovel = await ensureNovelLoaded(novelId);
      if (loadedNovel) {
        setStatus(`已加载小说：${novelId}`, "ok");
      }
    }
  }

  renderTree();
  renderEditor();
}

// ====== 小说编辑器（新增） ======
let novelsUiState = {
  paraIndexByChapterKey: {}, // { "<novelId>:<chapterIndex>": number }
  docViewModeByNovelId: {}, // { "<novelId>": "wysiwyg" | "source" }
  docScrollTopByNovelId: {}, // 保持滚动位置
};


function getDocViewMode(novelId) {
  const m = novelsUiState.docViewModeByNovelId[novelId];
  return m === "source" ? "source" : "wysiwyg";
}

function setDocViewMode(novelId, mode) {
  novelsUiState.docViewModeByNovelId[novelId] = mode === "source" ? "source" : "wysiwyg";
}

function saveDocScroll(editor, novelId) {
  const scroller =
    editor.querySelector(".novel-book-source") ||
    editor.querySelector(".novel-doc-content");
  if (!scroller) return;
  novelsUiState.docScrollTopByNovelId[novelId] = scroller.scrollTop || 0;
}

function restoreDocScroll(editor, novelId) {
  const scroller =
    editor.querySelector(".novel-book-source") ||
    editor.querySelector(".novel-doc-content");
  if (!scroller) return;
  const top = novelsUiState.docScrollTopByNovelId[novelId];
  if (typeof top === "number") scroller.scrollTop = top;
}

function markNovelDirtyDebounced(novelId) {
  if (!novelId) return;
  markNovelDirty(novelId, true);
  // 避免每次输入都重绘整棵树导致卡顿
  if (markNovelDirtyDebounced._t) clearTimeout(markNovelDirtyDebounced._t);
  markNovelDirtyDebounced._t = setTimeout(() => {
    renderTree();
  }, 350);
}

function applyNovelDocEditsFromDOM(editor, novelId, mode) {
  const novel = novelsState.novels[novelId];
  if (!novel || !Array.isArray(novel.chapters)) return false;

  const chapters = novel.chapters;

  if (mode === "source") {
    // 源码模式：章节标题仍从 contenteditable 读取，段落从 textarea 读取
    const titleEls = editor.querySelectorAll(".novel-doc-chapter-title[data-ci]");
    titleEls.forEach((el) => {
      const ci = Number(el.dataset.ci);
      if (!Number.isFinite(ci) || !chapters[ci]) return;
      chapters[ci].title = (el.textContent || "").trim();
    });

    const srcEls = editor.querySelectorAll("textarea.novel-doc-source[data-ci][data-pi]");
    srcEls.forEach((ta) => {
      const ci = Number(ta.dataset.ci);
      const pi = Number(ta.dataset.pi);
      if (!Number.isFinite(ci) || !Number.isFinite(pi)) return;
      const ch = chapters[ci];
      if (!ch || !Array.isArray(ch.paragraphs) || !ch.paragraphs[pi]) return;
      const html = String(ta.value || "");
      ch.paragraphs[pi].html = html;
      // text 由后端可再派生，这里同步一份便于 AI/搜索等立即可用
      ch.paragraphs[pi].text = stripTagsForLabel(html);
    });
    return true;
  }

  // wysiwyg 模式
  const titleEls = editor.querySelectorAll(".novel-doc-chapter-title[data-ci]");
  titleEls.forEach((el) => {
    const ci = Number(el.dataset.ci);
    if (!Number.isFinite(ci) || !chapters[ci]) return;
    chapters[ci].title = (el.textContent || "").trim();
  });

  const paraEls = editor.querySelectorAll(".novel-doc-paragraph[data-ci][data-pi]");
  paraEls.forEach((el) => {
    const ci = Number(el.dataset.ci);
    const pi = Number(el.dataset.pi);
    if (!Number.isFinite(ci) || !Number.isFinite(pi)) return;
    const ch = chapters[ci];
    if (!ch || !Array.isArray(ch.paragraphs) || !ch.paragraphs[pi]) return;
    const html = String(el.innerHTML || "");
    ch.paragraphs[pi].html = html;
    ch.paragraphs[pi].text = stripTagsForLabel(html);
  });

  return true;
}

function renderNovelDocContinuous(editor, novelId, options = {}) {
  const novel = novelsState.novels[novelId];
  const focusChapterIndex = Number.isInteger(options.focusChapterIndex)
    ? options.focusChapterIndex
    : null;

  if (!novel) {
    editor.innerHTML = `
      <div class="editor-section">
        <h2>小说正文</h2>
        <div style="color:#9ca3af;">正文尚未加载。请先在小说条目里点击“加载并进入全文编辑”。</div>
      </div>
    `;
    return;
  }

  normalizeNovelChapters(novel);

  editor.innerHTML = "";

  const wrap = document.createElement("div");
  wrap.className = "editor-section novel-doc-wrap";

  const title = document.createElement("h2");
  title.textContent = `全文编辑：${novelId}`;
  wrap.appendChild(title);

  const toolbar = document.createElement("div");
  toolbar.className = "novel-doc-toolbar";

  const applyBtn = document.createElement("button");
  applyBtn.className = "secondary";
  applyBtn.id = "apply-edit";
  applyBtn.textContent = "应用到本地";
  toolbar.appendChild(applyBtn);

  const saveBtn = document.createElement("button");
  saveBtn.className = "primary";
  saveBtn.textContent = `保存整本小说${novelsState.dirty[novelId] ? "（未保存*）" : ""}`;
  toolbar.appendChild(saveBtn);

  const reloadBtn = document.createElement("button");
  reloadBtn.className = "secondary";
  reloadBtn.textContent = "从服务器重载";
  toolbar.appendChild(reloadBtn);

  const openManifestBtn = document.createElement("button");
  openManifestBtn.className = "secondary";
  openManifestBtn.textContent = "回到小说条目";
  toolbar.appendChild(openManifestBtn);

  const searchWrap = document.createElement("div");
  searchWrap.className = "novel-doc-search";

  const searchInput = document.createElement("input");
  searchInput.type = "search";
  searchInput.className = "novel-doc-search-input";
  searchInput.placeholder = "搜索词句";
  searchInput.dataset.colorToolbarSkip = "true";
  searchWrap.appendChild(searchInput);

  const prevBtn = document.createElement("button");
  prevBtn.type = "button";
  prevBtn.className = "secondary";
  prevBtn.textContent = "上一个";
  searchWrap.appendChild(prevBtn);

  const nextBtn = document.createElement("button");
  nextBtn.type = "button";
  nextBtn.className = "secondary";
  nextBtn.textContent = "下一个";
  searchWrap.appendChild(nextBtn);

  const resultCount = document.createElement("span");
  resultCount.className = "novel-doc-search-count";
  resultCount.textContent = "未搜索";
  searchWrap.appendChild(resultCount);

  toolbar.appendChild(searchWrap);

  const jumpSel = document.createElement("select");
  jumpSel.className = "secondary novel-doc-jump";
  const jumpDefault = document.createElement("option");
  jumpDefault.value = "";
  jumpDefault.textContent = "跳转章节…";
  jumpSel.appendChild(jumpDefault);
  novel.chapters.forEach((chapter, chapterIndex) => {
    const option = document.createElement("option");
    option.value = String(chapterIndex);
    option.textContent = chapter?.title
      ? `${chapterIndex + 1}. ${chapter.title}`
      : `Chapter ${chapterIndex + 1}`;
    jumpSel.appendChild(option);
  });
  toolbar.appendChild(jumpSel);

  wrap.appendChild(toolbar);

  const hint = document.createElement("div");
  hint.className = "novel-doc-hint";
  hint.textContent =
    "全文编辑规则：每章用“## 章节标题”开头，段落之间留一个空行。颜色标签可直接使用 [[color|文字]]，保存时会自动转成前台可显示的 HTML。";
  wrap.appendChild(hint);

  const content = document.createElement("textarea");
  content.id = "novel-book-source";
  content.className = "editor-textarea novel-book-source";
  content.spellcheck = false;
  content.value = serializeNovelToEditableSource(novel);
  wrap.appendChild(content);

  editor.appendChild(wrap);

  const searchState = {
    matches: [],
    index: -1,
    query: "",
  };

  const resetSearchState = (message = String(searchInput.value || "").trim() ? "待搜索" : "未搜索") => {
    searchState.matches = [];
    searchState.index = -1;
    searchState.query = "";
    resultCount.textContent = message;
  };

  const updateSearchResults = () => {
    const query = String(searchInput.value || "").trim();
    const text = String(content.value || "");

    searchState.query = query;

    if (!query) {
      searchState.matches = [];
      searchState.index = -1;
      resultCount.textContent = "未搜索";
      return;
    }

    const regex = new RegExp(escapeRegExp(query), "gi");
    searchState.matches = [];
    let match = regex.exec(text);
    while (match) {
      searchState.matches.push({
        start: match.index,
        end: match.index + match[0].length,
      });
      if (match.index === regex.lastIndex) {
        regex.lastIndex += 1;
      }
      match = regex.exec(text);
    }

    if (!searchState.matches.length) {
      searchState.index = -1;
      resultCount.textContent = "无结果";
      return;
    }

    if (searchState.index < 0 || searchState.index >= searchState.matches.length) {
      searchState.index = 0;
    }

    resultCount.textContent = `${searchState.index + 1} / ${searchState.matches.length}`;
  };

  const focusSearchMatch = (direction = 1) => {
    const query = String(searchInput.value || "").trim();
    if (!query) {
      resetSearchState("未搜索");
      return;
    }

    const queryChanged = query !== searchState.query;
    if (queryChanged || !searchState.matches.length) {
      updateSearchResults();
      if (!searchState.matches.length) return;
      searchState.index = direction < 0 ? searchState.matches.length - 1 : 0;
    } else {
      const count = searchState.matches.length;
      if (searchState.index < 0 || searchState.index >= count) {
        searchState.index = direction < 0 ? count - 1 : 0;
      } else {
        searchState.index = ((searchState.index + direction) % count + count) % count;
      }
    }

    const count = searchState.matches.length;
    const target = searchState.matches[searchState.index];
    setTextareaSelectionRange(content, target.start, target.end);
    resultCount.textContent = `${searchState.index + 1} / ${count}`;
  };

  const focusChapterHeading = (chapterIndex) => {
    const headings = [...String(content.value || "").matchAll(/^##\s+.+$/gm)];
    const target = headings[chapterIndex];
    if (!target) return;
    setTextareaSelectionRange(content, target.index, target.index + target[0].length);
  };

  const applyBookSource = () => {
    saveDocScroll(editor, novelId);
    novel.chapters = parseNovelEditableSource(content.value, novel.chapters);
    markNovelDirty(novelId, true);
    setStatus("已修改（未保存）", "warn");
    renderTree();
  };

  content.addEventListener("input", () => {
    markNovelDirtyDebounced(novelId);
    resetSearchState();
    setStatus("已修改（未保存）", "warn");
  });

  content.addEventListener("keydown", (event) => {
    const isMac = /Mac|iPhone|iPad|iPod/i.test(navigator.platform);
    if ((isMac ? event.metaKey : event.ctrlKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      saveBtn.click();
    }
  });

  searchInput.addEventListener("input", () => {
    resetSearchState();
  });

  searchInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (event.shiftKey) {
      focusSearchMatch(-1);
    } else {
      focusSearchMatch(1);
    }
  });

  prevBtn.onclick = () => {
    focusSearchMatch(-1);
  };

  nextBtn.onclick = () => {
    focusSearchMatch(1);
  };

  jumpSel.addEventListener("change", () => {
    if (!jumpSel.value) return;
    focusChapterHeading(Number(jumpSel.value));
    jumpSel.value = "";
  });

  applyBtn.onclick = () => {
    applyBookSource();
  };

  saveBtn.onclick = async () => {
    applyBookSource();
    await saveNovelToServer(novelId);
    renderTree();
    renderNovelDocContinuous(editor, novelId, options);
    restoreDocScroll(editor, novelId);
  };

  reloadBtn.onclick = async () => {
    saveDocScroll(editor, novelId);
    setStatus(`正在重载小说：${novelId}`, "warn");
    delete novelsState.novels[novelId];
    await ensureNovelLoaded(novelId);
    setStatus("已重载正文", "ok");
    renderTree();
    renderNovelDocContinuous(editor, novelId, options);
    restoreDocScroll(editor, novelId);
  };

  openManifestBtn.onclick = () => {
    const manifestIndex = (novelsState.manifest || []).findIndex((entry) => entry && entry.id === novelId);
    if (manifestIndex < 0) return;
    selectedPath = ["__novels", "manifest", manifestIndex];
    renderTree();
    renderEditor();
  };

  resetSearchState("未搜索");
  restoreDocScroll(editor, novelId);

  if (Number.isInteger(focusChapterIndex)) {
    requestAnimationFrame(() => {
      focusChapterHeading(focusChapterIndex);
    });
  }
}

function renderNovelManifestEditor(editor, path) {
  const idx = path[2];
  const entry = novelsState.manifest[idx] || {};
  const novelId = entry.id;
  const loaded = !!(novelId && novelsState.novels[novelId]);

  editor.innerHTML = `
    <div class="editor-section">
      <h2>小说条目</h2>

      <div class="field-row">
        <label>id</label>
        <input id="novel-id" type="text" value="${escapeEditorValue(novelId || "")}" disabled>
      </div>

      <div class="field-row">
        <label>标题 title</label>
        <input id="novel-title" type="text" value="${escapeEditorValue(entry.title || "")}">
      </div>

      <div class="field-row">
        <label>封面 image</label>
        <input id="novel-image" type="text" value="${escapeEditorValue(entry.image || "")}">
      </div>

      <div class="field-row" style="gap:8px;">
        <button id="novel-apply-manifest" class="secondary">应用元信息</button>
        <button id="novel-save-manifest" class="primary">保存 manifest</button>
        <button id="novel-delete-btn" class="secondary danger-soft">删除小说</button>
      </div>

      <div class="field-row" style="gap:8px;">
        <button id="novel-open-doc" class="primary">${loaded ? "进入全文编辑" : "加载并进入全文编辑"}</button>
        <button id="novel-load-body" class="secondary">${loaded ? "重新加载正文" : "仅加载正文"}</button>
      </div>

      <div class="field-hint">正文编辑已统一到全文编辑器。加载后可直接搜索词句、整本修改，并用上方颜色工具条处理标色。</div>
    </div>
  `;

  const applyBtn = document.getElementById("novel-apply-manifest");
  if (applyBtn && applyBtn.id !== "apply-edit") {
    applyBtn.id = "apply-edit";
  }
  if (applyBtn) {
    applyBtn.onclick = () => {
      const title = document.getElementById("novel-title")?.value ?? "";
      const image = document.getElementById("novel-image")?.value ?? "";
      novelsState.manifest[idx] = { ...entry, id: novelId, title, image };
      setStatus("已应用元信息（未保存）", "warn");
      renderTree();
    };
  }

  const saveManifestBtn = document.getElementById("novel-save-manifest");
  if (saveManifestBtn) {
    saveManifestBtn.onclick = async () => {
      const title = document.getElementById("novel-title")?.value ?? "";
      const image = document.getElementById("novel-image")?.value ?? "";
      novelsState.manifest[idx] = { ...entry, id: novelId, title, image };
      await saveNovelsManifestToServer();
      renderTree();
      renderEditor();
    };
  }

  const deleteBtn = document.getElementById("novel-delete-btn");
  if (deleteBtn) {
    deleteBtn.onclick = async () => {
      if (!novelId) return;
      if (
        !window.confirm(
          `确认删除小说「${entry.title || novelId}」？这会同时删除 manifest 条目和 novels_data/${novelId}.json。`
        )
      ) {
        return;
      }

      const deleted = await deleteNovelFromServer(novelId);
      if (!deleted) return;
      renderTree();
      renderEditor();
    };
  }

  const loadBodyBtn = document.getElementById("novel-load-body");
  if (loadBodyBtn) {
    loadBodyBtn.onclick = async () => {
      if (!novelId) return;
      setStatus(`正在加载小说正文：${novelId}`, "warn");
      delete novelsState.novels[novelId];
      await ensureNovelLoaded(novelId);
      setStatus("已加载正文", "ok");
      renderTree();
      renderEditor();
    };
  }

  const openDocBtn = document.getElementById("novel-open-doc");
  if (openDocBtn) {
    openDocBtn.onclick = async () => {
      if (!novelId) return;
      if (!novelsState.novels[novelId]) {
        setStatus(`正在加载小说正文：${novelId}`, "warn");
        const loadedNovel = await ensureNovelLoaded(novelId);
        if (loadedNovel) {
          setStatus(`已加载正文：${novelId}`, "ok");
        }
      }
      selectedPath = ["__novels", "novels", novelId];
      renderTree();
      renderEditor();
    };
  }
}


function renderNovelEditor(editor, path) {
  const type = getNodeType(path);

  // 根：上传/刷新 manifest
  if (type === "novelsRoot") {
    const count = Array.isArray(novelsState.manifest) ? novelsState.manifest.length : 0;
    editor.innerHTML = `
      <div class="editor-section">
        <h2>小说库</h2>
        <div class="field-row">
          <label>当前小说数量</label>
          <div style="color:#e5e7eb;">${count}</div>
        </div>
        <div class="field-row">
          <label>刷新小说清单</label>
          <button id="novels-reload-manifest" class="secondary">从服务器重载 manifest</button>
        </div>
        <div class="field-row">
          <label>上传新小说（JSON / DOCX / TXT）</label>
          <input type="file" id="novels-upload-file" accept="application/json,.json,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx,text/plain,.txt" style="color:#e5e7eb;">
          <button id="novels-upload-btn" class="secondary">上传</button>
        </div>
        <div class="field-hint">支持：.json / .docx / .txt。DOCX/TXT 会在服务器端自动转换为网站可读 JSON（chapters + paragraphs[].html），并自动派生 paragraphs[].text 供 AI 索引使用。</div>
      </div>
    `;

    const reloadBtn = document.getElementById("novels-reload-manifest");
    if (reloadBtn) {
      reloadBtn.onclick = async () => {
        setStatus("正在加载小说清单…", "warn");
        await loadNovelsManifest();
        renderTree();
        renderNovelEditor(editor, path);
        setStatus("小说清单已刷新", "ok");
      };
    }

    const uploadBtn = document.getElementById("novels-upload-btn");
    if (uploadBtn) {
      uploadBtn.onclick = async () => {
        const input = document.getElementById("novels-upload-file");
        const file = input && input.files ? input.files[0] : null;
        const id = await uploadNovelFile(file);
        if (!id) return;

        // 跳转到新小说条目
        const idx = (novelsState.manifest || []).findIndex((x) => x && x.id === id);
        if (idx >= 0) {
          selectedPath = ["__novels", "manifest", idx];
          delete novelsState.novels[id];
          delete novelsState.dirty[id];
          const loadedNovel = await ensureNovelLoaded(id);
          if (loadedNovel) {
            setStatus(`上传并载入成功：${id}`, "ok");
          } else {
            setStatus(`上传成功：${id}`, "ok");
          }
          renderTree();
          renderEditor();
        }
      };
    }
    return;
  }

  // 小说正文（连贯展示 + 可编辑）
  if (type === "novelDoc") {
    const novelId = getNovelIdFromPath(path);
    if (!novelId) {
      editor.innerHTML = `
        <div class="editor-section">
          <h2>小说正文</h2>
          <div style="color:#9ca3af;">无法解析 novelId。</div>
        </div>
      `;
      return;
    }
    // 如果还没加载，提示并提供快速加载按钮
    if (!novelsState.novels[novelId]) {
      editor.innerHTML = `
        <div class="editor-section">
          <h2>小说正文（${novelId}）</h2>
          <div style="color:#9ca3af;">正文尚未加载。请先在小说条目里点击“加载正文”，或点击下方按钮快速加载。</div>
          <div class="field-row" style="gap:8px;margin-top:10px;">
            <button id="novel-doc-quick-load" class="secondary">快速加载正文</button>
          </div>
        </div>
      `;
      const btn = document.getElementById("novel-doc-quick-load");
      if (btn) {
        btn.onclick = async () => {
          setStatus(`正在加载小说：${novelId}`, "warn");
          await ensureNovelLoaded(novelId);
          renderTree();
          renderNovelEditor(editor, path);
        };
      }
      return;
    }
    renderNovelDocContinuous(editor, novelId);
    return;
  }

  if (type === "novel") {
    renderNovelManifestEditor(editor, path);
    return;
  }

  if (type === "novelChapter") {
    const novelId = path[2];
    const chapterIndex = Number(path[4]);
    const novel = novelsState.novels[novelId];

    if (!novel) {
      editor.innerHTML = `
        <div class="editor-section">
          <h2>小说章节</h2>
          <div style="color:#9ca3af;">正文尚未加载。请先进入小说条目，点击“加载并进入全文编辑”。</div>
        </div>
      `;
      return;
    }

    renderNovelDocContinuous(editor, novelId, {
      focusChapterIndex: Number.isFinite(chapterIndex) ? chapterIndex : null,
    });
    return;
  }


  // 小说条目（manifest）
  if (type === "novel") {
    const idx = path[2];
    const entry = novelsState.manifest[idx] || {};
    const novelId = entry.id;
    const loaded = !!(novelId && novelsState.novels[novelId]);

    editor.innerHTML = `
      <div class="editor-section">
        <h2>小说条目（manifest）</h2>

        <div class="field-row">
          <label>id</label>
          <input id="novel-id" type="text" value="${novelId || ""}" disabled>
        </div>

        <div class="field-row">
          <label>标题 title</label>
          <input id="novel-title" type="text" value="${(entry.title || "").replace(/"/g, "&quot;")}">
        </div>

        <div class="field-row">
          <label>封面 image</label>
          <input id="novel-image" type="text" value="${(entry.image || "").replace(/"/g, "&quot;")}">
        </div>

        <div class="field-row" style="gap:8px;">
          <button id="novel-apply-manifest" class="secondary">应用到本地</button>
          <button id="novel-save-manifest" class="primary">保存 manifest</button>
        </div>

        <div class="field-row" style="gap:8px;">
          <button id="novel-load-body" class="secondary">${loaded ? "刷新正文" : "加载正文"}</button>
          <button id="novel-save-body" class="primary" ${loaded ? "" : "disabled"}>保存正文${dirty ? "（未保存*）" : ""}</button>
        </div>

        <div class="field-row" style="gap:8px;">
          <button id="novel-open-doc" class="secondary" ${loaded ? "" : "disabled"}>打开连贯正文编辑</button>
        </div>

        <div class="field-hint">提示：点击“加载正文”后，左侧会展开章节；章节内可直接编辑段落 HTML 并保存。</div>
      </div>
    `;

    const applyBtn = document.getElementById("novel-apply-manifest");
    if (applyBtn) {
      applyBtn.onclick = () => {
        const title = document.getElementById("novel-title")?.value ?? "";
        const image = document.getElementById("novel-image")?.value ?? "";
        novelsState.manifest[idx] = { ...entry, id: novelId, title, image };
        setStatus("已应用（未保存 manifest）", "warn");
        renderTree();
      };
    }

    const saveManifestBtn = document.getElementById("novel-save-manifest");
    if (saveManifestBtn) {
      saveManifestBtn.onclick = async () => {
        const title = document.getElementById("novel-title")?.value ?? "";
        const image = document.getElementById("novel-image")?.value ?? "";
        novelsState.manifest[idx] = { ...entry, id: novelId, title, image };
        await saveNovelsManifestToServer();
        renderTree();
        renderEditor();
      };
    }

    const loadBodyBtn = document.getElementById("novel-load-body");
    if (loadBodyBtn) {
      loadBodyBtn.onclick = async () => {
        if (!novelId) return;
        setStatus(`正在加载小说正文：${novelId}`, "warn");
        // 强制刷新
        delete novelsState.novels[novelId];
        await ensureNovelLoaded(novelId);
        setStatus("已加载正文", "ok");
        renderTree();
        renderEditor();
      };
    }

    const saveBodyBtn = document.getElementById("novel-save-body");
    if (saveBodyBtn) {
      saveBodyBtn.onclick = async () => {
        if (!novelId) return;
        await saveNovelToServer(novelId);
        renderTree();
        renderEditor();
      };
    }

    const openDocBtn = document.getElementById("novel-open-doc");
    if (openDocBtn) {
      openDocBtn.onclick = async () => {
        if (!novelId) return;
        if (!novelsState.novels[novelId]) {
          setStatus(`正在加载小说正文：${novelId}`, "warn");
          await ensureNovelLoaded(novelId);
        }
        selectedPath = ["__novels", "novels", novelId];
        renderTree();
        renderEditor();
      };
    }

    return;
  }

  // 章节：连贯展示编辑（与前台阅读器一致）
  if (type === "novelChapter") {
    const novelId = path[2];
    const chapterIndex = path[4];
    const novel = novelsState.novels[novelId];
    const chapter = novel?.chapters?.[chapterIndex];

    if (!novel || !chapter) {
      editor.innerHTML = `
        <div class="editor-section">
          <h2>章节</h2>
          <div style="color:#9ca3af;">章节数据尚未加载。请先点击该小说条目并“加载正文”，或进入“正文（连贯编辑）”。</div>
        </div>
      `;
      return;
    }

    const modeKey = `${novelId}:ch:${chapterIndex}`;
    const mode = (novelsUiState.docViewModeByNovelId[modeKey] === "source") ? "source" : "wysiwyg";
    const paras = Array.isArray(chapter.paragraphs) ? chapter.paragraphs : [];
    chapter.paragraphs = paras;

    editor.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.className = "editor-section novel-doc-wrap";

    const h2 = document.createElement("h2");
    h2.textContent = `章节编辑（连贯）：${novelId} / ${chapter.title || `Chapter ${chapterIndex + 1}`}`;
    wrap.appendChild(h2);

    const toolbar = document.createElement("div");
    toolbar.className = "novel-doc-toolbar";

    const applyBtn = document.createElement("button");
    applyBtn.className = "secondary";
    applyBtn.textContent = "应用到本地（不保存）";
    toolbar.appendChild(applyBtn);

    const saveBtn = document.createElement("button");
    saveBtn.className = "primary";
    saveBtn.textContent = `保存整本小说${novelsState.dirty[novelId] ? "（未保存*）" : ""}`;
    toolbar.appendChild(saveBtn);

    const openDocBtn = document.createElement("button");
    openDocBtn.className = "secondary";
    openDocBtn.textContent = "打开正文（连贯编辑）";
    toolbar.appendChild(openDocBtn);

    const hint = document.createElement("div");
    hint.className = "hint";
    hint.textContent = "提示：可直接在段落中编辑；保存会写回整本小说 JSON。";
    toolbar.appendChild(hint);

    const modeWrap = document.createElement("div");
    modeWrap.className = "novel-doc-mode";
    const modeBtn = document.createElement("button");
    modeBtn.className = "secondary";
    modeBtn.textContent = mode === "source" ? "切换到所见即所得" : "切换到HTML源码";
    modeWrap.appendChild(modeBtn);
    toolbar.appendChild(modeWrap);

    wrap.appendChild(toolbar);

    const divider = document.createElement("div");
    divider.className = "novel-doc-divider";
    wrap.appendChild(divider);

    const content = document.createElement("div");
    content.className = "novel-doc-content";
    content.id = "novel-chapter-doc-content";

    const titleEl = document.createElement("h2");
    titleEl.className = "novel-doc-chapter-title";
    titleEl.dataset.ci = String(chapterIndex); // 复用 data-ci 以便 apply
    titleEl.contentEditable = "true";
    titleEl.spellcheck = false;
    titleEl.textContent = chapter.title || `Chapter ${chapterIndex + 1}`;
    content.appendChild(titleEl);

    paras.forEach((p, pi) => {
      if (!p || typeof p !== "object") {
        paras[pi] = { id: `p${chapterIndex + 1}_${pi + 1}`, html: String(p || ""), text: "" };
        p = paras[pi];
      }
      if (mode === "source") {
        const ta = document.createElement("textarea");
        ta.className = "novel-doc-source";
        ta.dataset.ci = String(chapterIndex);
        ta.dataset.pi = String(pi);
        ta.value = String(p.html || "");
        content.appendChild(ta);
      } else {
        const div = document.createElement("div");
        div.className = "novel-doc-paragraph";
        div.dataset.ci = String(chapterIndex);
        div.dataset.pi = String(pi);
        div.contentEditable = "true";
        div.spellcheck = false;
        div.innerHTML = String(p.html || "");
        content.appendChild(div);
      }
    });

    wrap.appendChild(content);
    editor.appendChild(wrap);

    // 输入标记 dirty
    content.addEventListener("input", () => {
      markNovelDirtyDebounced(novelId);
      setStatus("已修改（未保存）", "warn");
    });

    // Ctrl/Cmd + S 保存
    content.addEventListener("keydown", (e) => {
      const isMac = /Mac|iPhone|iPad|iPod/i.test(navigator.platform);
      if ((isMac ? e.metaKey : e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveBtn.click();
      }
    });

    const applyLocal = () => {
      // 章节标题
      chapter.title = (titleEl.textContent || "").trim();

      if (mode === "source") {
        const srcEls = content.querySelectorAll("textarea.novel-doc-source[data-pi]");
        srcEls.forEach((ta) => {
          const pi = Number(ta.dataset.pi);
          if (!Number.isFinite(pi) || !paras[pi]) return;
          const html = String(ta.value || "");
          paras[pi].html = html;
          paras[pi].text = stripTagsForLabel(html);
        });
      } else {
        const paraEls = content.querySelectorAll(".novel-doc-paragraph[data-pi]");
        paraEls.forEach((el) => {
          const pi = Number(el.dataset.pi);
          if (!Number.isFinite(pi) || !paras[pi]) return;
          const html = String(el.innerHTML || "");
          paras[pi].html = html;
          paras[pi].text = stripTagsForLabel(html);
        });
      }

      markNovelDirty(novelId, true);
      setStatus("已应用（未保存）", "warn");
      renderTree();
    };

    applyBtn.onclick = () => {
      applyLocal();
    };

    saveBtn.onclick = async () => {
      applyLocal();
      await saveNovelToServer(novelId);
      renderTree();
      renderEditor();
    };

    openDocBtn.onclick = async () => {
      applyLocal();
      selectedPath = ["__novels", "novels", novelId];
      renderTree();
      renderEditor();
    };

    modeBtn.onclick = () => {
      applyLocal();
      novelsUiState.docViewModeByNovelId[modeKey] = (mode === "source") ? "wysiwyg" : "source";
      renderEditor();
    };

    return;
  }

  // 兜底
  editor.innerHTML = `
    <div class="editor-section">
      <h2>小说编辑</h2>
      <div style="color:#9ca3af;">未实现的小说节点类型：${type}</div>
    </div>
  `;
}

function renderSiteSettingsEditor(editor, settings) {
  const icpNumber = String(settings?.icpNumber || "");
  const icpUrl = String(settings?.icpUrl || DEFAULT_ICP_URL);
  const event = ensureSiteEvent(websiteData);
  const previewText = icpNumber.trim() || "前台未显示备案号";
  const previewUrl = normalizeExternalUrl(icpUrl);
  const eventSlides = (Array.isArray(event.slides) && event.slides.length
    ? event.slides
    : [normalizeSiteEventSlide(event)]
  ).map((slide) => normalizeSiteEventSlide(slide));
  const firstEventSlide = eventSlides[0] || normalizeSiteEventSlide(event);
  const renderCameraOptions = (selectedCamera) =>
    SITE_EVENT_CAMERA_OPTIONS.map((option) => `
      <option value="${escapeEditorValue(option.value)}" ${option.value === selectedCamera ? "selected" : ""}>
        ${escapeHtml(option.label)}
      </option>
    `).join("");
  const eventSlidesHtml = eventSlides.map((slide, index) => `
    <div class="site-event-slide-card" data-site-event-slide-index="${index}">
      <div class="site-event-slide-head">
        <div>
          <strong>镜头 ${index + 1}</strong>
          <span>${index === eventSlides.length - 1 ? "最后一张会启动黑边霜雾" : "纯照片运镜播放"}</span>
        </div>
        <div class="site-event-slide-actions">
          <button class="secondary" type="button" data-site-event-slide-action="move-up" data-slide-index="${index}" ${index === 0 ? "disabled" : ""}>上移</button>
          <button class="secondary" type="button" data-site-event-slide-action="move-down" data-slide-index="${index}" ${index === eventSlides.length - 1 ? "disabled" : ""}>下移</button>
          <button class="secondary" type="button" data-site-event-slide-action="remove" data-slide-index="${index}" ${eventSlides.length <= 1 ? "disabled" : ""}>删除</button>
        </div>
      </div>

      <div class="site-event-slide-grid">
        <label>
          图片路径
          <input type="text" data-site-event-slide-field="image" value="${escapeEditorValue(slide.image)}">
        </label>
        <label>
          浮现文字
          <input type="text" data-site-event-slide-field="text" value="${escapeEditorValue(slide.text)}">
        </label>
        <label>
          展示毫秒
          <input type="number" min="1400" step="100" data-site-event-slide-field="durationMs" value="${Number(slide.durationMs) || DEFAULT_SITE_EVENT_SLIDE.durationMs}">
        </label>
        <label>
          运镜
          <select data-site-event-slide-field="camera">
            ${renderCameraOptions(slide.camera)}
          </select>
        </label>
      </div>

      <div class="site-event-slide-upload">
        <input type="file" accept="image/*" data-site-event-slide-upload-file="${index}" style="color:#e5e7eb;">
        <button class="secondary" type="button" data-site-event-slide-action="upload" data-slide-index="${index}">上传到此镜头</button>
      </div>

      <img
        class="site-event-slide-preview"
        data-site-event-slide-preview="${index}"
        src="${escapeEditorValue(slide.image)}"
        alt="镜头 ${index + 1} 图片预览"
      >
    </div>
  `).join("");

  editor.innerHTML = `
    <div class="editor-section">
      <h2>首页备案信息</h2>

      <div class="field-row">
        <label>ICP备案号</label>
        <input id="site-icp-number" type="text" value="${escapeEditorValue(icpNumber)}">
        <div class="field-hint">显示在网站首页底部。留空时前台会自动隐藏备案号。</div>
      </div>

      <div class="field-row">
        <label>备案链接</label>
        <input id="site-icp-url" type="text" value="${escapeEditorValue(icpUrl)}">
        <div class="field-hint">默认链接到工信部备案查询页；也可以填完整 URL。</div>
      </div>

      <div class="field-row" style="flex-direction:column;align-items:flex-start;">
        <label>前台预览</label>
        <a href="${escapeEditorValue(previewUrl)}" target="_blank" rel="noopener noreferrer" style="color:#93c5fd;text-decoration:none;">
          ${escapeHtml(previewText)}
        </a>
      </div>

      <div class="field-row">
        <label>快捷操作</label>
        <button id="apply-edit" class="primary" type="button">应用修改</button>
      </div>
    </div>

    <div class="editor-section">
      <h2>限时活动开屏</h2>

      <div class="field-row">
        <label>启用活动</label>
        <label class="inline-check">
          <input id="site-event-enabled" type="checkbox" ${event.enabled ? "checked" : ""}>
          <span>打开网站时播放活动开屏</span>
        </label>
      </div>

      <div class="field-row">
        <label>仅首页播放</label>
        <label class="inline-check">
          <input id="site-event-homepage-only" type="checkbox" ${event.homepageOnly ? "checked" : ""}>
          <span>深链接进入其他页面时跳过活动</span>
        </label>
      </div>

      <div class="field-row">
        <label>黑边霜雾</label>
        <label class="inline-check">
          <input id="site-event-frost-frame-enabled" type="checkbox" ${event.frostFrameEnabled ? "checked" : ""}>
          <span>启用四周不规则黑边、烟灰冰霜与回缩散开效果</span>
        </label>
      </div>

      <div class="field-row">
        <label>活动首页文字</label>
        <textarea id="site-event-home-intro-text" class="editor-textarea">${escapeEditorValue(event.homeIntroText || DEFAULT_SITE_EVENT.homeIntroText)}</textarea>
        <div class="field-hint">活动开启时临时替换首页介绍；关闭活动后自动恢复首页默认文字。可用换行分段。</div>
      </div>

      <div class="field-row">
        <label>小游戏入口</label>
        <label class="inline-check">
          <input id="site-event-game-entry-enabled" type="checkbox" ${event.gameEntryEnabled ? "checked" : ""}>
          <span>活动开启时在首页左下角显示进入小游戏入口</span>
        </label>
      </div>

      <div class="field-row">
        <label>入口角标</label>
        <input id="site-event-game-entry-kicker" type="text" value="${escapeEditorValue(event.gameEntryKicker || DEFAULT_SITE_EVENT.gameEntryKicker)}">
      </div>

      <div class="field-row">
        <label>入口标题</label>
        <input id="site-event-game-entry-title" type="text" value="${escapeEditorValue(event.gameEntryTitle || DEFAULT_SITE_EVENT.gameEntryTitle)}">
      </div>

      <div class="field-row">
        <label>小游戏链接</label>
        <input id="site-event-game-url" type="text" value="${escapeEditorValue(event.gameUrl || DEFAULT_SITE_EVENT.gameUrl)}">
        <div class="field-hint">默认使用网站内部子目录 /event-game/；也可以填完整外部链接。</div>
      </div>

      <div class="field-row">
        <label>第一张图片</label>
        <input id="site-event-image" type="text" value="${escapeEditorValue(firstEventSlide.image)}">
        <div class="field-hint">这是序列第一张图的快捷设置；完整顺序请在下方 CG 图片序列中调整。</div>
      </div>

      <div class="field-row">
        <label>替换第一张</label>
        <input type="file" id="site-event-upload-file" accept="image/*" style="color:#e5e7eb;">
        <button id="site-event-upload-btn" class="secondary" type="button">上传到第一张</button>
      </div>

      <div class="field-row" style="flex-direction:column;align-items:flex-start;">
        <label>第一张预览</label>
        <img
          id="site-event-image-preview"
          src="${escapeEditorValue(firstEventSlide.image)}"
          alt="第一张活动图片预览"
          style="max-width: min(560px, 100%); max-height: 240px; object-fit: cover; border-radius: 12px; border: 1px solid rgba(148,163,184,0.35);"
        >
      </div>

      <div class="field-row">
        <label>第一张文字</label>
        <input id="site-event-text" type="text" value="${escapeEditorValue(firstEventSlide.text)}">
        <div class="field-hint">前台会使用思源黑体 / Noto Sans CJK / 微软雅黑系列字体，白字浮现在图片中间。</div>
      </div>

      <div class="field-row">
        <label>第一张毫秒</label>
        <input id="site-event-image-ms" type="number" min="1400" step="100" value="${Number(firstEventSlide.durationMs) || DEFAULT_SITE_EVENT.imageMs}">
      </div>

      <div class="field-row">
        <label>第一张运镜</label>
        <select id="site-event-camera">
          ${renderCameraOptions(firstEventSlide.camera)}
        </select>
      </div>

      <div class="field-row">
        <label>消失过渡毫秒</label>
        <input id="site-event-exit-ms" type="number" min="260" step="20" value="${Number(event.exitMs) || DEFAULT_SITE_EVENT.exitMs}">
      </div>

      <div class="field-row">
        <label>首页波浪加载毫秒</label>
        <input id="site-event-home-reveal-ms" type="number" min="900" step="100" value="${Number(event.homeRevealMs) || DEFAULT_SITE_EVENT.homeRevealMs}">
      </div>

      <div class="field-row">
        <label>霜雾进入毫秒</label>
        <input id="site-event-frost-in-ms" type="number" min="900" step="100" value="${Number(event.frostInMs) || DEFAULT_SITE_EVENT.frostInMs}">
        <div class="field-hint">只作用于最后一张图片；前面的照片不会显示黑边和霜雾。</div>
      </div>

      <div class="field-row">
        <label>图片转场毫秒</label>
        <input id="site-event-slide-transition-ms" type="number" min="0" max="2200" step="100" value="${Number(event.slideTransitionMs) || DEFAULT_SITE_EVENT.slideTransitionMs}">
        <div class="field-hint">控制 CG 图片之间的交叠淡入和扫描暗场转场；填 0 可关闭。</div>
      </div>

      <div class="field-row site-event-sequence-row">
        <label>CG图片序列</label>
        <div class="site-event-sequence">
          <div class="field-hint">按顺序播放；最后一张开始时才出现黑边霜雾，结束后按当前方式退去。</div>
          <div class="site-event-slide-list">
            ${eventSlidesHtml}
          </div>
          <button id="site-event-add-slide" class="secondary" type="button">添加镜头</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById("apply-edit")?.addEventListener("click", () => {
    const nextSettings = ensureSiteSettings(websiteData);
    const nextEvent = ensureSiteEvent(websiteData);
    nextSettings.icpNumber = String(document.getElementById("site-icp-number")?.value || "").trim();
    nextSettings.icpUrl = normalizeExternalUrl(document.getElementById("site-icp-url")?.value || DEFAULT_ICP_URL);
    nextEvent.enabled = Boolean(document.getElementById("site-event-enabled")?.checked);
    nextEvent.homepageOnly = Boolean(document.getElementById("site-event-homepage-only")?.checked);
    nextEvent.frostFrameEnabled = Boolean(document.getElementById("site-event-frost-frame-enabled")?.checked);
    nextEvent.homeIntroText = String(document.getElementById("site-event-home-intro-text")?.value || "").trim();
    nextEvent.gameEntryEnabled = Boolean(document.getElementById("site-event-game-entry-enabled")?.checked);
    nextEvent.gameEntryKicker = String(document.getElementById("site-event-game-entry-kicker")?.value || DEFAULT_SITE_EVENT.gameEntryKicker).trim();
    nextEvent.gameEntryTitle = String(document.getElementById("site-event-game-entry-title")?.value || DEFAULT_SITE_EVENT.gameEntryTitle).trim();
    nextEvent.gameUrl = normalizeSitePath(document.getElementById("site-event-game-url")?.value || DEFAULT_SITE_EVENT.gameUrl, DEFAULT_SITE_EVENT.gameUrl);
    const slides = collectSiteEventSlidesFromEditor();
    slides[0] = normalizeSiteEventSlide({
      ...slides[0],
      image: document.getElementById("site-event-image")?.value || slides[0]?.image,
      text: document.getElementById("site-event-text")?.value || slides[0]?.text,
      durationMs: document.getElementById("site-event-image-ms")?.value || slides[0]?.durationMs,
      camera: document.getElementById("site-event-camera")?.value || slides[0]?.camera,
    });
    nextEvent.slides = slides.map((slide) => normalizeSiteEventSlide(slide));
    syncLegacySiteEventFieldsFromSlides(nextEvent);
    nextEvent.exitMs = Math.max(260, Number(document.getElementById("site-event-exit-ms")?.value) || DEFAULT_SITE_EVENT.exitMs);
    nextEvent.homeRevealMs = Math.max(900, Number(document.getElementById("site-event-home-reveal-ms")?.value) || DEFAULT_SITE_EVENT.homeRevealMs);
    const lastSlide = nextEvent.slides[nextEvent.slides.length - 1] || normalizeSiteEventSlide(null);
    nextEvent.frostInMs = Math.max(
      900,
      Math.min(
        lastSlide.durationMs,
        Number(document.getElementById("site-event-frost-in-ms")?.value) || DEFAULT_SITE_EVENT.frostInMs
      )
    );
    nextEvent.slideTransitionMs = Math.max(
      0,
      Math.min(
        2200,
        Number(document.getElementById("site-event-slide-transition-ms")?.value) || DEFAULT_SITE_EVENT.slideTransitionMs
      )
    );

    setStatus("已修改站点设置（未保存）", "warn");
    renderTree();
    renderEditor();
  });

  const updateEventDraftFromEditor = () => {
    const draftEvent = ensureSiteEvent(websiteData);
    draftEvent.enabled = Boolean(document.getElementById("site-event-enabled")?.checked);
    draftEvent.homepageOnly = Boolean(document.getElementById("site-event-homepage-only")?.checked);
    draftEvent.frostFrameEnabled = Boolean(document.getElementById("site-event-frost-frame-enabled")?.checked);
    draftEvent.homeIntroText = String(document.getElementById("site-event-home-intro-text")?.value || "").trim();
    draftEvent.gameEntryEnabled = Boolean(document.getElementById("site-event-game-entry-enabled")?.checked);
    draftEvent.gameEntryKicker = String(document.getElementById("site-event-game-entry-kicker")?.value || DEFAULT_SITE_EVENT.gameEntryKicker).trim();
    draftEvent.gameEntryTitle = String(document.getElementById("site-event-game-entry-title")?.value || DEFAULT_SITE_EVENT.gameEntryTitle).trim();
    draftEvent.gameUrl = normalizeSitePath(document.getElementById("site-event-game-url")?.value || DEFAULT_SITE_EVENT.gameUrl, DEFAULT_SITE_EVENT.gameUrl);
    const slides = collectSiteEventSlidesFromEditor();
    slides[0] = normalizeSiteEventSlide({
      ...slides[0],
      image: document.getElementById("site-event-image")?.value || slides[0]?.image,
      text: document.getElementById("site-event-text")?.value || slides[0]?.text,
      durationMs: document.getElementById("site-event-image-ms")?.value || slides[0]?.durationMs,
      camera: document.getElementById("site-event-camera")?.value || slides[0]?.camera,
    });
    draftEvent.slides = slides.map((slide) => normalizeSiteEventSlide(slide));
    syncLegacySiteEventFieldsFromSlides(draftEvent);
    draftEvent.exitMs = Math.max(260, Number(document.getElementById("site-event-exit-ms")?.value) || DEFAULT_SITE_EVENT.exitMs);
    draftEvent.homeRevealMs = Math.max(900, Number(document.getElementById("site-event-home-reveal-ms")?.value) || DEFAULT_SITE_EVENT.homeRevealMs);
    const lastSlide = draftEvent.slides[draftEvent.slides.length - 1] || normalizeSiteEventSlide(null);
    draftEvent.frostInMs = Math.max(
      900,
      Math.min(
        lastSlide.durationMs,
        Number(document.getElementById("site-event-frost-in-ms")?.value) || DEFAULT_SITE_EVENT.frostInMs
      )
    );
    draftEvent.slideTransitionMs = Math.max(
      0,
      Math.min(
        2200,
        Number(document.getElementById("site-event-slide-transition-ms")?.value) || DEFAULT_SITE_EVENT.slideTransitionMs
      )
    );
    return draftEvent;
  };

  document.getElementById("site-event-add-slide")?.addEventListener("click", () => {
    const draftEvent = updateEventDraftFromEditor();
    draftEvent.slides.push({
      ...DEFAULT_SITE_EVENT_SLIDE,
      text: "新的梦想仍在继续",
      camera: "slow-zoom",
    });
    syncLegacySiteEventFieldsFromSlides(draftEvent);
    setStatus("已添加活动镜头（未保存）", "warn");
    renderEditor();
  });

  const bindSyncedInputs = (source, target, eventName = "input") => {
    source?.addEventListener(eventName, () => {
      if (target) target.value = source.value;
    });
  };
  const firstSlideCard = editor.querySelector('[data-site-event-slide-index="0"]');
  const firstSlideImage = firstSlideCard?.querySelector('[data-site-event-slide-field="image"]');
  const firstSlideText = firstSlideCard?.querySelector('[data-site-event-slide-field="text"]');
  const firstSlideDuration = firstSlideCard?.querySelector('[data-site-event-slide-field="durationMs"]');
  const firstSlideCamera = firstSlideCard?.querySelector('[data-site-event-slide-field="camera"]');
  const firstShortcutImage = document.getElementById("site-event-image");
  const firstShortcutText = document.getElementById("site-event-text");
  const firstShortcutDuration = document.getElementById("site-event-image-ms");
  const firstShortcutCamera = document.getElementById("site-event-camera");
  bindSyncedInputs(firstShortcutImage, firstSlideImage);
  bindSyncedInputs(firstSlideImage, firstShortcutImage);
  bindSyncedInputs(firstShortcutText, firstSlideText);
  bindSyncedInputs(firstSlideText, firstShortcutText);
  bindSyncedInputs(firstShortcutDuration, firstSlideDuration);
  bindSyncedInputs(firstSlideDuration, firstShortcutDuration);
  bindSyncedInputs(firstShortcutCamera, firstSlideCamera, "change");
  bindSyncedInputs(firstSlideCamera, firstShortcutCamera, "change");

  editor.querySelectorAll('[data-site-event-slide-field="image"]').forEach((input) => {
    input.addEventListener("input", () => {
      const card = findSiteEventSlideCard(input);
      const index = card?.dataset?.siteEventSlideIndex;
      const preview = document.querySelector(`[data-site-event-slide-preview="${index}"]`);
      if (preview) preview.src = input.value;
      if (index === "0") {
        const firstPreview = document.getElementById("site-event-image-preview");
        if (firstPreview) firstPreview.src = input.value;
      }
    });
  });

  firstShortcutImage?.addEventListener("input", () => {
    const firstPreview = document.getElementById("site-event-image-preview");
    const slidePreview = document.querySelector('[data-site-event-slide-preview="0"]');
    if (firstPreview) firstPreview.src = firstShortcutImage.value;
    if (slidePreview) slidePreview.src = firstShortcutImage.value;
  });

  editor.querySelectorAll("[data-site-event-slide-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const action = button.dataset.siteEventSlideAction;
      const index = Number(button.dataset.slideIndex);
      if (!Number.isFinite(index)) return;

      if (action === "upload") {
        const input = document.querySelector(`[data-site-event-slide-upload-file="${index}"]`);
        const file = input?.files?.[0];
        if (!file) {
          alert("请选择活动图片");
          return;
        }

        const formData = new FormData();
        formData.append("file", file);
        setStatus("正在上传活动镜头图片…", "warn");

        try {
          const res = await fetch(UPLOAD_ENDPOINT, {
            method: "POST",
            headers: buildAdminHeaders(),
            body: formData,
          });
          const result = await res.json().catch(async () => ({
            error: await res.text().catch(() => "上传失败"),
          }));

          if (res.status === 401 || result.error === "Invalid admin token") {
            handleAdminAuthFailure();
            return;
          }

          if (!res.ok || !result.ok) {
            const message = result.error || `上传失败（HTTP ${res.status}）`;
            setStatus(`活动镜头图片上传失败：${message}`, "error");
            alert(message);
            return;
          }

          const card = findSiteEventSlideCard(button);
          const imageInput = card?.querySelector('[data-site-event-slide-field="image"]');
          const preview = document.querySelector(`[data-site-event-slide-preview="${index}"]`);
          if (imageInput) imageInput.value = result.path;
          if (preview) preview.src = result.path;
          if (index === 0) {
            const firstImageInput = document.getElementById("site-event-image");
            const firstPreview = document.getElementById("site-event-image-preview");
            if (firstImageInput) firstImageInput.value = result.path;
            if (firstPreview) firstPreview.src = result.path;
          }
          setStatus("活动镜头图片上传成功（记得应用修改并保存）", "ok");
        } catch (error) {
          console.error(error);
          const message = error?.message || "上传过程中出错";
          setStatus(`活动镜头图片上传失败：${message}`, "error");
          alert(message);
        }
        return;
      }

      const draftEvent = updateEventDraftFromEditor();
      const slides = draftEvent.slides;
      if (action === "remove" && slides.length > 1) {
        slides.splice(index, 1);
      }
      if (action === "move-up" && index > 0) {
        [slides[index - 1], slides[index]] = [slides[index], slides[index - 1]];
      }
      if (action === "move-down" && index < slides.length - 1) {
        [slides[index], slides[index + 1]] = [slides[index + 1], slides[index]];
      }
      draftEvent.slides = slides.map((slide) => normalizeSiteEventSlide(slide));
      syncLegacySiteEventFieldsFromSlides(draftEvent);
      setStatus("已调整活动镜头序列（未保存）", "warn");
      renderEditor();
    });
  });

  document.getElementById("site-event-upload-btn")?.addEventListener("click", async () => {
    const input = document.getElementById("site-event-upload-file");
    const file = input?.files?.[0];
    if (!file) {
      alert("请选择活动图片");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    setStatus("正在上传活动图片…", "warn");

    try {
      const res = await fetch(UPLOAD_ENDPOINT, {
        method: "POST",
        headers: buildAdminHeaders(),
        body: formData,
      });
      const result = await res.json().catch(async () => ({
        error: await res.text().catch(() => "上传失败"),
      }));

      if (res.status === 401 || result.error === "Invalid admin token") {
        handleAdminAuthFailure();
        return;
      }

      if (!res.ok || !result.ok) {
        const message = result.error || `上传失败（HTTP ${res.status}）`;
        setStatus(`活动图片上传失败：${message}`, "error");
        alert(message);
        return;
      }

      const imageInput = document.getElementById("site-event-image");
      const preview = document.getElementById("site-event-image-preview");
      const slideImageInput = document.querySelector('[data-site-event-slide-index="0"] [data-site-event-slide-field="image"]');
      const slidePreview = document.querySelector('[data-site-event-slide-preview="0"]');
      if (imageInput) imageInput.value = result.path;
      if (preview) preview.src = result.path;
      if (slideImageInput) slideImageInput.value = result.path;
      if (slidePreview) slidePreview.src = result.path;
      setStatus("活动图片上传成功（记得应用修改并保存）", "ok");
    } catch (error) {
      console.error(error);
      const message = error?.message || "上传过程中出错";
      setStatus(`活动图片上传失败：${message}`, "error");
      alert(message);
    }
  });
}

function renderMusicEditor(editor, path) {
  const type = getNodeType(path);
  const playlist = ensureMusicPlaylist(websiteData);

  if (type === "musicRoot") {
    const trackCards = playlist.length
      ? playlist
          .map((track, index) => {
            const displayName = track.name || `歌曲 ${index + 1}`;
            const displayPath = getMusicFileLabel(track.src) || track.src || "未上传音频";
            return `
              <div class="music-track-card">
                <div class="music-track-card-copy">
                  <div class="search-result-title">
                    <span>${escapeHtml(displayName)}</span>
                    <span class="search-result-type">Track ${index + 1}</span>
                  </div>
                  <div class="music-track-meta">${track.src ? "可播放" : "待补音频路径"}</div>
                  <div class="music-track-path">${escapeHtml(displayPath)}</div>
                </div>
                <div class="music-track-card-actions">
                  <button type="button" class="secondary" data-music-track-open="${index}">编辑</button>
                  <button type="button" class="secondary danger-soft" data-music-track-remove="${index}">移除</button>
                  ${
                    track.src
                      ? `<button type="button" class="secondary danger-soft" data-music-track-delete-file="${index}">删文件并移除</button>`
                      : ""
                  }
                </div>
              </div>
            `;
          })
          .join("")
      : '<div class="search-results-empty">当前还没有歌曲。先上传音频，或新增空白歌曲。</div>';

    editor.innerHTML = `
      <div class="editor-section">
        <h2>歌曲管理</h2>
        <div class="field-row" style="flex-direction:column;align-items:flex-start;">
          <label>上传新歌曲</label>
          <div class="music-inline-actions">
            <input
              type="file"
              id="music-upload-file"
              accept="audio/*,.mp3,.flac,.wav,.ogg,.m4a,.aac"
              style="color:#e5e7eb;flex:1;min-width:240px;"
            >
            <button id="music-upload-btn" class="secondary" type="button">上传并新增</button>
          </div>
          <div class="field-hint">上传后会自动写入播放列表。你也可以先新增空白歌曲，再手动修改名称和路径。</div>
        </div>

        <div class="field-row" style="gap:8px;flex-wrap:wrap;">
          <button id="music-add-track-btn" class="secondary" type="button">新增空白歌曲</button>
          <span class="field-hint">左侧结构树支持拖拽排序；保存后前台播放器会按当前顺序播放。</span>
        </div>
      </div>

      <div class="editor-section">
        <h2>当前歌曲列表</h2>
        <div id="music-track-list" class="music-track-list">
          ${trackCards}
        </div>
      </div>
    `;

    document.getElementById("music-add-track-btn")?.addEventListener("click", () => {
      const nextIndex = playlist.length;
      playlist.push(normalizeMusicTrack({}, nextIndex));
      websiteData.musicPlaylist = playlist.map((track, idx) => normalizeMusicTrack(track, idx));
      selectedPath = ["__music", "playlist", nextIndex];
      renderTree();
      renderEditor();
      setStatus("已新增空白歌曲（未保存）", "warn");
    });

    document.getElementById("music-upload-btn")?.addEventListener("click", async () => {
      const input = document.getElementById("music-upload-file");
      const uploaded = await uploadAudioFile(input?.files?.[0]);
      if (!uploaded) return;

      const nextIndex = playlist.length;
      playlist.push(normalizeMusicTrack(uploaded, nextIndex));
      websiteData.musicPlaylist = playlist.map((track, idx) => normalizeMusicTrack(track, idx));
      selectedPath = ["__music", "playlist", nextIndex];
      renderTree();
      renderEditor();
      setStatus("已新增歌曲（未保存）", "warn");
    });

    Array.from(editor.querySelectorAll("[data-music-track-open]")).forEach((button) => {
      button.addEventListener("click", () => {
        const index = Number(button.getAttribute("data-music-track-open"));
        if (!Number.isInteger(index) || !playlist[index]) return;
        selectedPath = ["__music", "playlist", index];
        renderTree();
        renderEditor();
      });
    });

    Array.from(editor.querySelectorAll("[data-music-track-remove]")).forEach((button) => {
      button.addEventListener("click", async () => {
        const index = Number(button.getAttribute("data-music-track-remove"));
        if (!Number.isInteger(index) || !playlist[index]) return;
        if (!window.confirm("移除这首歌？音频文件会保留在 /music 中。")) return;
        const removed = await removeMusicTrack(index);
        if (!removed) return;
        renderTree();
        renderEditor();
      });
    });

    Array.from(editor.querySelectorAll("[data-music-track-delete-file]")).forEach((button) => {
      button.addEventListener("click", async () => {
        const index = Number(button.getAttribute("data-music-track-delete-file"));
        if (!Number.isInteger(index) || !playlist[index]) return;
        if (!window.confirm("删除这首歌，并从 /music 中移除对应音频文件？此操作不可撤销。")) return;
        const removed = await removeMusicTrack(index, { deleteFile: true });
        if (!removed) return;
        renderTree();
        renderEditor();
      });
    });

    return;
  }

  const index = Number(path[2]);
  const track = playlist[index];
  if (!Number.isInteger(index) || !track) {
    editor.innerHTML = `
      <div class="editor-empty-state">
        <h3>歌曲不存在</h3>
        <p>这首歌曲可能已经被删除，请从左侧重新选择。</p>
      </div>
    `;
    return;
  }

  const previewSrc = resolveMusicTrackPreview(track);
  editor.innerHTML = `
    <div class="editor-section">
      <h2>歌曲信息</h2>

      <div class="field-row">
        <label>名称 name</label>
        <input id="music-name" type="text" value="${escapeEditorValue(track?.name || "")}">
      </div>

      <div class="field-row">
        <label>音频路径 src</label>
        <input id="music-src" type="text" value="${escapeEditorValue(track?.src || "")}">
      </div>

      <div class="field-row">
        <label>上传音频</label>
        <input
          type="file"
          id="music-upload-file"
          accept="audio/*,.mp3,.flac,.wav,.ogg,.m4a,.aac"
          style="color:#e5e7eb;"
        >
        <button id="music-upload-btn" class="secondary" type="button">上传替换</button>
      </div>

      <div class="field-row" style="flex-direction:column;align-items:flex-start;">
        <label>试听预览</label>
        <audio
          id="music-preview"
          controls
          preload="none"
          src="${escapeEditorValue(previewSrc)}"
          style="width:min(100%, 560px);display:${previewSrc ? "block" : "none"};"
        ></audio>
        <div id="music-preview-empty" class="field-hint" style="display:${previewSrc ? "none" : "block"};">
          当前还没有可预览的音频路径。
        </div>
      </div>

      <div class="field-row">
        <label>快捷操作</label>
        <div class="music-editor-actions-row">
          <button id="apply-edit" class="primary" type="button">应用修改</button>
          <button id="music-delete-track-btn" class="secondary danger-soft" type="button">移除歌曲</button>
          ${
            track?.src
              ? '<button id="music-delete-file-btn" class="secondary danger-soft" type="button">删文件并移除</button>'
              : ""
          }
        </div>
        <div class="field-hint">“移除歌曲”只删除播放列表记录；“删文件并移除”会同时删除 /music 中的音频文件。</div>
      </div>
    </div>
  `;

  document.getElementById("apply-edit")?.addEventListener("click", () => {
    websiteData.musicPlaylist[index] = normalizeMusicTrack(
      {
        name: document.getElementById("music-name")?.value ?? "",
        src: document.getElementById("music-src")?.value ?? "",
      },
      index
    );
    setStatus("已修改歌曲（未保存）", "warn");
    renderTree();
    renderEditor();
  });

  document.getElementById("music-upload-btn")?.addEventListener("click", async () => {
    const input = document.getElementById("music-upload-file");
    const uploaded = await uploadAudioFile(input?.files?.[0]);
    if (!uploaded) return;

    const nameInput = document.getElementById("music-name");
    const srcInput = document.getElementById("music-src");
    if (nameInput && !String(nameInput.value || "").trim()) {
      nameInput.value = uploaded.name || "";
    }
    if (srcInput) {
      srcInput.value = uploaded.src || "";
    }
    setStatus("音频已上传，记得点击“应用修改”", "ok");
  });

  document.getElementById("music-delete-track-btn")?.addEventListener("click", async () => {
    if (!window.confirm("移除这首歌？音频文件会保留在 /music 中。")) return;
    const removed = await removeMusicTrack(index);
    if (!removed) return;
    renderTree();
    renderEditor();
  });

  document.getElementById("music-delete-file-btn")?.addEventListener("click", async () => {
    if (!window.confirm("删除这首歌，并从 /music 中移除对应音频文件？此操作不可撤销。")) return;
    const removed = await removeMusicTrack(index, { deleteFile: true });
    if (!removed) return;
    renderTree();
    renderEditor();
  });
}

// ====== 右侧编辑面板：标题 / 图片 / 上传图片 / 预览 / details + 渲染预览 ======
function renderEditor() {
  const editor = $("editor-container");
  if (!editor) return;

  if (!selectedPath) {
    editor.innerHTML = `
      <div class="editor-empty-state">
        <h3>从左侧结构树选择一个节点</h3>
        <p>右侧会显示对应的编辑表单、分区导航和快捷操作。</p>
        <p>快捷键：Ctrl/Cmd + S 保存全部，Ctrl/Cmd + Enter 应用当前。</p>
      </div>
    `;
    finalizeEditorRender(editor);
    return;
  }

  if (isSiteSettingsPath(selectedPath)) {
    const settings = ensureSiteSettings(websiteData);
    renderSiteSettingsEditor(editor, settings);
    finalizeEditorRender(editor, {
      path: selectedPath,
      node: getNode(websiteData, selectedPath),
      type: getNodeType(selectedPath),
    });
    return;
  }

  if (isMusicPath(selectedPath)) {
    const musicNode = getNode(websiteData, selectedPath);
    const musicType = getNodeType(selectedPath);
    renderMusicEditor(editor, selectedPath);
    finalizeEditorRender(editor, {
      path: selectedPath,
      node: musicNode,
      type: musicType,
    });
    return;
  }

  if (isNovelsPath(selectedPath)) {
    const novelNode = getNode(websiteData, selectedPath);
    const novelType = getNodeType(selectedPath);
    renderNovelEditor(editor, selectedPath);
    finalizeEditorRender(editor, {
      path: selectedPath,
      node: novelNode,
      type: novelType,
    });
    return;
  }

  if (!selectedPath) {
    editor.innerHTML = "<p>请从左侧选择一个节点。</p>";
    return;
  }

  // 小说编辑（新增，不影响原有节点编辑器）
  if (isNovelsPath(selectedPath)) {
    renderNovelEditor(editor, selectedPath);
    return;
  }

  const node = getNode(websiteData, selectedPath);
  const type = getNodeType(selectedPath);
  const lawRole = getLawNodeRole(selectedPath);
  const lawMeta = readLawMeta(node);
  const lawHistoryEntries = normalizeLawHistoryEntries(lawMeta.historyEntries);
  const charterLawNode = getCharterLawNodeForSelection(selectedPath);
  const isCharterLayout =
    lawRole === "law"
      ? lawMeta.layout === CHARTER_LAW_LAYOUT_ID
      : !!charterLawNode;

  const rawImage = node.image || "";

  // 预览路径处理：兼容 "images/xxx.png" / "/images/xxx.png" / 完整 URL
  let previewSrc = "";
  if (rawImage) {
    if (rawImage.startsWith("http://") || rawImage.startsWith("https://")) {
      previewSrc = rawImage;
    } else if (rawImage.startsWith("/")) {
      previewSrc = rawImage;
    } else {
      const cleaned = rawImage.replace(/^\.?\//, "");
      previewSrc = "/" + cleaned;
    }
  }

  editor.innerHTML = `
    <div class="editor-section">
      <h2>基础信息（${type}）</h2>

      <div class="field-row">
        <label>标题 title</label>
        <input id="field-title" type="text" value="${node.title || ""}">
      </div>

      <div class="field-row">
        <label>图片 image</label>
        <input id="field-image" type="text" value="${rawImage}">
      </div>

      <div class="field-row">
        <label>上传图片</label>
        <input type="file" id="upload-file-input" accept="image/*" style="color:#e5e7eb;">
        <button id="upload-file-btn" class="secondary">上传</button>
      </div>

      <div class="field-row" style="flex-direction:column;align-items:flex-start;">
        <img id="image-preview"
             src="${previewSrc}"
             style="max-height:150px;border-radius:6px;margin-top:5px;display:${
               rawImage ? "block" : "none"
             };">
      </div>

      <div class="field-row" style="flex-direction:column;align-items:flex-start;">
        <label>详情 details</label>
        <textarea id="field-details" class="editor-textarea">${
          node.details || ""
        }</textarea>
        <div class="field-hint">支持多行文本；前端会按 \\n 渲染；支持 [[colorKey|文本]] 颜色标签。</div>
      </div>

      <div class="field-row" style="flex-direction:column;align-items:flex-start;margin-top:4px;">
        <button id="preview-details-btn" class="secondary">预览渲染效果</button>
        <div id="details-preview"
             style="margin-top:6px;padding:8px 10px;border-radius:6px;border:1px solid rgba(148,163,184,0.35);background:#020617;width:100%;font-size:13px;line-height:1.5;display:none;"></div>
      </div>

    </div>
  `;

  // ====== 时间线节点样式：era / branchEvent 通用 ======
  if (type === "era" || type === "branchEvent") {
    const styleSection = document.createElement("div");
    styleSection.className = "editor-section";

    const currentStyle = node.marker || ""; // 使用 marker 字段
    const options = getTimelineNodeStyleOptions();

    const optionsHtml = options
      .map((opt) => {
        const val = String(opt.value ?? "");
        const label = String(opt.label ?? val);
        const selected = val === currentStyle ? 'selected' : '';
        return `<option value="${val}" ${selected}>${label}</option>`;
      })
      .join("");

    styleSection.innerHTML = `
      <h2>时间线节点样式</h2>
      <div class="field-row">
        <label>节点样式 marker</label>
        <select id="field-node-style">
          ${optionsHtml}
        </select>
        <div class="field-hint">
          对应 timeline.css 里的样式类，例如 <code>.timeline-node--fiery</code>。
        </div>
      </div>
    `;

    editor.appendChild(styleSection);
  }

  // ====== 分支时间线专用表单 ======
  if (type === "branch" || type === "branchEvent") {
    const extra = document.createElement("div");
    extra.className = "editor-section";

    if (type === "branch") {
      // 找到 events 分类下的 eras，用作起止选项
      const cats =
        websiteData && Array.isArray(websiteData.categories)
          ? websiteData.categories
          : [];
      const eventsCat = cats.find((c) => c.id === "events");
      const eras =
        eventsCat && Array.isArray(eventsCat.eras) ? eventsCat.eras : [];

      const fromIdx = Number.isFinite(node.fromEraIndex)
        ? node.fromEraIndex
        : 0;
      const toIdx = Number.isFinite(node.toEraIndex)
        ? node.toEraIndex
        : fromIdx;

      const eraOptions = eras
        .map((era, idx) => {
          const label = `${idx}. ${era.title || "(未命名时代)"}`;
          return `<option value="${idx}">${label}</option>`;
        })
        .join("");

      extra.innerHTML = `
        <h2>时间支线设置</h2>

        <div class="field-row">
          <label>起点时代 fromEraIndex</label>
          <select id="field-from-era">
            ${
              eraOptions ||
              '<option value="0">0. (暂无时代数据，先在“重大事件”中新增 era)</option>'
            }
          </select>
        </div>

        <div class="field-row">
          <label>终点时代 toEraIndex</label>
          <select id="field-to-era">
            ${
              eraOptions ||
              '<option value="0">0. (暂无时代数据，先在“重大事件”中新增 era)</option>'
            }
          </select>
        </div>

        <div class="field-row">
          <label>支线位置 position</label>
          <select id="field-branch-position">
            <option value="below" ${
              node.position !== "above" ? "selected" : ""
            }>主线下方（below）</option>
            <option value="above" ${
              node.position === "above" ? "selected" : ""
            }>主线上方（above）</option>
          </select>
        </div>

        <div class="field-row">
          <label>轨道 laneIndex</label>
          <input id="field-lane-index" type="number" value="${
            Number.isFinite(node.laneIndex) ? node.laneIndex : 0
          }" />
          <div class="field-hint">
            同一侧多条支线时，用 0,1,2... 控制上下排列
          </div>
        </div>

        <div class="field-row">
          <label>颜色 key</label>
          <input id="field-branch-color" type="text" value="${
            node.color || ""
          }" />
          <div class="field-hint">
            对应 color-palette.js 中的 key，例如 imperialGold / darkGold / scienceMinistryCyan。
            留空则用默认 accent 颜色。
          </div>
        </div>
      `;
      editor.appendChild(extra);

      // 同步选项默认值
      const fromSel = $("field-from-era");
      const toSel = $("field-to-era");
      if (fromSel && eras[fromIdx]) fromSel.value = String(fromIdx);
      if (toSel && eras[toIdx]) toSel.value = String(toIdx);
    }

    if (type === "branchEvent") {
      extra.innerHTML = `
        <h2>支线事件设置</h2>

        <div class="field-row">
          <label>时间标签 time</label>
          <input id="field-event-time" type="text" value="${node.time || ""}" />
          <div class="field-hint">例如：E36 / 帝国纪元36年，用于前端提示展示。</div>
        </div>
      `;
      editor.appendChild(extra);
    }
  }

  // Empire Laws keeps using the same JSON tree, but these fields expose the
  // custom codex metadata directly so you do not need to hand-edit JSON.
  if (lawRole) {
    const lawSection = document.createElement("div");
    lawSection.className = "editor-section";

    if (lawRole === "lawCategory") {
      lawSection.innerHTML = `
        <h2>法律总览设置</h2>
        <div class="field-row">
          <label>页眉 kicker</label>
          <input id="law-kicker" type="text" value="${lawMeta.kicker || ""}" />
        </div>
        <div class="field-row" style="flex-direction:column;align-items:flex-start;">
          <label>总览摘要 summary</label>
          <textarea id="law-summary" class="editor-textarea">${lawMeta.summary || ""}</textarea>
          <div class="field-hint">显示在“帝国法律”页顶部的大段导语。</div>
        </div>
        <div class="field-row" style="flex-direction:column;align-items:flex-start;">
          <label>提示语 boardNote</label>
          <textarea id="law-board-note" class="editor-textarea">${lawMeta.boardNote || ""}</textarea>
          <div class="field-hint">显示在法律总览页标题下方的说明文字。</div>
        </div>
      `;
    } else if (lawRole === "lawSection") {
      lawSection.innerHTML = `
        <h2>法律分册设置</h2>
        <div class="field-row" style="flex-direction:column;align-items:flex-start;">
          <label>分册摘要 summary</label>
          <textarea id="law-summary" class="editor-textarea">${lawMeta.summary || ""}</textarea>
          <div class="field-hint">显示在一级法律页分栏标题下方。</div>
        </div>
        <div class="field-row" style="flex-direction:column;align-items:flex-start;">
          <label>分栏提示 boardNote</label>
          <textarea id="law-board-note" class="editor-textarea">${lawMeta.boardNote || ""}</textarea>
          <div class="field-hint">显示在该分册法令列表顶部的小提示。</div>
        </div>
      `;
    } else if (lawRole === "law") {
      lawSection.innerHTML = `
        <h2>法令详情设置</h2>
        <div class="field-row">
          <label>特殊布局 layout</label>
          <select id="law-layout">
            <option value="" ${!lawMeta.layout ? "selected" : ""}>普通法令</option>
            <option value="${CHARTER_LAW_LAYOUT_ID}" ${
              lawMeta.layout === CHARTER_LAW_LAYOUT_ID ? "selected" : ""
            }>宪章法</option>
          </select>
        </div>
        <div class="field-row">
          <label>卡片副标题 subtitle</label>
          <input id="law-subtitle" type="text" value="${lawMeta.subtitle || ""}" />
        </div>
        <div class="field-row">
          <label>状态标签 statusLabel</label>
          <input id="law-status-label" type="text" value="${lawMeta.statusLabel || ""}" />
        </div>
        <div class="field-row">
          <label>状态说明 statusText</label>
          <input id="law-status-text" type="text" value="${lawMeta.statusText || ""}" />
        </div>
        <div class="field-row">
          <label>条文标题 enactedLabel</label>
          <input id="law-enacted-label" type="text" value="${lawMeta.enactedLabel || ""}" />
        </div>
        <div class="field-row" style="flex-direction:column;align-items:flex-start;">
          <label>核心条文 enactedText</label>
          <textarea id="law-enacted-text" class="editor-textarea">${lawMeta.enactedText || ""}</textarea>
          <div class="field-hint">显示在法律详情页顶部的大段法令说明。</div>
        </div>
        <div class="field-row" style="flex-direction:column;align-items:flex-start;">
          <label>右侧引言 quote</label>
          <textarea id="law-quote" class="editor-textarea">${lawMeta.quote || ""}</textarea>
        </div>
        <div class="field-row" style="flex-direction:column;align-items:flex-start;">
          <label>正向影响 positiveEffects</label>
          <textarea id="law-positive-effects" class="editor-textarea">${listToTextarea(lawMeta.positiveEffects)}</textarea>
          <div class="field-hint">一行一条，显示为绿色效果标签。</div>
        </div>
        <div class="field-row" style="flex-direction:column;align-items:flex-start;">
          <label>负向影响 negativeEffects</label>
          <textarea id="law-negative-effects" class="editor-textarea">${listToTextarea(lawMeta.negativeEffects)}</textarea>
          <div class="field-hint">一行一条，显示为红色效果标签。</div>
        </div>
        <div class="field-row" style="flex-direction:column;align-items:flex-start;">
          <label>中性影响 neutralEffects</label>
          <textarea id="law-neutral-effects" class="editor-textarea">${listToTextarea(lawMeta.neutralEffects)}</textarea>
          <div class="field-hint">一行一条，显示为灰色效果标签。</div>
        </div>
        ${
          isCharterLayout
            ? `
              <div class="field-row">
                <label>宪章页眉 charterKicker</label>
                <input id="law-charter-kicker" type="text" value="${lawMeta.charterKicker || ""}" />
              </div>
              <div class="field-row">
                <label>左路线标题 charterLeftLabel</label>
                <input id="law-charter-left-label" type="text" value="${lawMeta.charterLeftLabel || ""}" />
              </div>
              <div class="field-row">
                <label>右路线标题 charterRightLabel</label>
                <input id="law-charter-right-label" type="text" value="${lawMeta.charterRightLabel || ""}" />
              </div>
              <div class="field-row" style="flex-direction:column;align-items:flex-start;">
                <label>中央说明 charterCenterText</label>
                <textarea id="law-charter-center-text" class="editor-textarea">${lawMeta.charterCenterText || ""}</textarea>
                <div class="field-hint">显示在宪章法页面中央。其下方的“焦点卡片”会根据你点击的法案节点自动切换。</div>
              </div>
              <div class="field-row" style="flex-direction:column;align-items:flex-start;">
                <div class="field-hint">宪章法的推进节点仍然使用当前法令下的子节点管理。把子节点的 track / tier / 已签署状态填好后，前端会自动计算“解锁”与“锁定”。</div>
              </div>
            `
            : ""
        }
      `;
    } else if (lawRole === "lawClause") {
      lawSection.innerHTML = `
        <h2>法条细则设置</h2>
        <div class="field-row">
          <label>细则标签 badge</label>
          <input id="law-badge" type="text" value="${lawMeta.badge || ""}" />
        </div>
        <div class="field-row">
          <label>细则副标题 subtitle</label>
          <input id="law-subtitle" type="text" value="${lawMeta.subtitle || ""}" />
        </div>
        <div class="field-row" style="flex-direction:column;align-items:flex-start;">
          <label>补充说明 note</label>
          <textarea id="law-note" class="editor-textarea">${lawMeta.note || ""}</textarea>
        </div>
        <div class="field-row" style="flex-direction:column;align-items:flex-start;">
          <label>正向影响 positiveEffects</label>
          <textarea id="law-positive-effects" class="editor-textarea">${listToTextarea(lawMeta.positiveEffects)}</textarea>
        </div>
        <div class="field-row" style="flex-direction:column;align-items:flex-start;">
          <label>负向影响 negativeEffects</label>
          <textarea id="law-negative-effects" class="editor-textarea">${listToTextarea(lawMeta.negativeEffects)}</textarea>
        </div>
        <div class="field-row" style="flex-direction:column;align-items:flex-start;">
          <label>中性影响 neutralEffects</label>
          <textarea id="law-neutral-effects" class="editor-textarea">${listToTextarea(lawMeta.neutralEffects)}</textarea>
        </div>
        ${
          isCharterLayout
            ? `
              <div class="field-row">
                <label>宪章路线 charterTrack</label>
                <select id="law-charter-track">
                  <option value="left" ${lawMeta.charterTrack !== "right" && lawMeta.charterTrack !== "final" ? "selected" : ""}>左线</option>
                  <option value="right" ${lawMeta.charterTrack === "right" ? "selected" : ""}>右线</option>
                  <option value="final" ${lawMeta.charterTrack === "final" ? "selected" : ""}>终局</option>
                </select>
              </div>
              <div class="field-row">
                <label>推进顺位 charterTier</label>
                <input id="law-charter-tier" type="number" value="${
                  Number.isFinite(Number(lawMeta.charterTier))
                    ? Number(lawMeta.charterTier)
                    : ""
                }" />
                <div class="field-hint">同一路线内按 1、2、3…… 排序。前一个法案签署后，下一个会自动解锁。</div>
              </div>
              <div class="field-row">
                <label>已签署 charterSigned</label>
                <input id="law-charter-signed" type="checkbox" ${
                  lawMeta.charterSigned ? "checked" : ""
                } />
                <div class="field-hint">只需要标记哪些节点已经生效；未生效节点的“解锁/锁定”状态由前端自动判断。</div>
              </div>
            `
            : ""
        }
      `;
    }

    editor.appendChild(lawSection);

    if (lawRole === "law") {
      const historySection = document.createElement("div");
      historySection.className = "editor-section";
      const historyItemsHtml = lawHistoryEntries.length
        ? lawHistoryEntries
            .map(
              (entry, index) => `
                <div class="law-history-editor-item" data-history-index="${index}">
                  <div class="law-history-editor-item-head">
                    <div class="law-history-editor-item-title">历史法案 ${String(
                      index + 1
                    ).padStart(2, "0")}</div>
                    <div class="law-history-editor-item-actions">
                      <button type="button" class="secondary" data-law-history-action="move-up" data-history-index="${index}">上移</button>
                      <button type="button" class="secondary" data-law-history-action="move-down" data-history-index="${index}">下移</button>
                      <button type="button" class="danger" data-law-history-action="remove" data-history-index="${index}">删除</button>
                    </div>
                  </div>
                  <div class="law-history-editor-grid">
                    <div class="field-row">
                      <label>标题 title</label>
                      <input type="text" data-history-field="title" data-history-index="${index}" value="${escapeEditorValue(
                        entry.title
                      )}">
                    </div>
                    <div class="field-row">
                      <label>时期 eraLabel</label>
                      <input type="text" data-history-field="eraLabel" data-history-index="${index}" value="${escapeEditorValue(
                        entry.eraLabel
                      )}">
                    </div>
                    <div class="field-row">
                      <label>状态类型 statusTone</label>
                      <select data-history-field="statusTone" data-history-index="${index}">
                        <option value="archived" ${
                          (entry.statusTone || "archived") === "archived"
                            ? "selected"
                            : ""
                        }>旧版法令</option>
                        <option value="repealed" ${
                          entry.statusTone === "repealed" ? "selected" : ""
                        }>已废止</option>
                        <option value="draft" ${
                          entry.statusTone === "draft" ? "selected" : ""
                        }>作废草案</option>
                      </select>
                    </div>
                    <div class="field-row">
                      <label>状态标签 statusLabel</label>
                      <input type="text" data-history-field="statusLabel" data-history-index="${index}" value="${escapeEditorValue(
                        entry.statusLabel
                      )}">
                    </div>
                    <div class="field-row" style="grid-column:1 / -1;flex-direction:column;align-items:flex-start;">
                      <label>摘要 summary</label>
                      <textarea class="editor-textarea" data-history-field="summary" data-history-index="${index}">${escapeEditorValue(
                        entry.summary
                      )}</textarea>
                    </div>
                    <div class="field-row" style="grid-column:1 / -1;flex-direction:column;align-items:flex-start;">
                      <label>正文 text</label>
                      <textarea class="editor-textarea" data-history-field="text" data-history-index="${index}">${escapeEditorValue(
                        entry.text
                      )}</textarea>
                    </div>
                    <div class="field-row" style="grid-column:1 / -1;flex-direction:column;align-items:flex-start;">
                      <label>附注 note</label>
                      <textarea class="editor-textarea" data-history-field="note" data-history-index="${index}">${escapeEditorValue(
                        entry.note
                      )}</textarea>
                    </div>
                    <div class="field-row" style="flex-direction:column;align-items:flex-start;">
                      <label>正向影响 positiveEffects</label>
                      <textarea class="editor-textarea" data-history-field="positiveEffects" data-history-index="${index}">${escapeEditorValue(
                        listToTextarea(entry.positiveEffects)
                      )}</textarea>
                    </div>
                    <div class="field-row" style="flex-direction:column;align-items:flex-start;">
                      <label>负向影响 negativeEffects</label>
                      <textarea class="editor-textarea" data-history-field="negativeEffects" data-history-index="${index}">${escapeEditorValue(
                        listToTextarea(entry.negativeEffects)
                      )}</textarea>
                    </div>
                    <div class="field-row" style="grid-column:1 / -1;flex-direction:column;align-items:flex-start;">
                      <label>中性影响 neutralEffects</label>
                      <textarea class="editor-textarea" data-history-field="neutralEffects" data-history-index="${index}">${escapeEditorValue(
                        listToTextarea(entry.neutralEffects)
                      )}</textarea>
                    </div>
                  </div>
                </div>
              `
            )
            .join("")
        : `<div class="law-history-editor-empty">当前没有历史法案。新增后，前端会在法律概览页显示“历史法案”提示，并支持展开进入旧法详情。</div>`;

      historySection.innerHTML = `
        <h2>历史法案档案</h2>
        <div class="field-hint" style="margin-bottom:10px;">历史法案不会再出现在当前法令二级页内，而是显示在法律概览页的展开档案列表中。</div>
        <div class="law-history-editor-item-actions" style="margin-bottom:10px;">
          <button type="button" id="law-history-add" class="secondary">新增历史法案</button>
        </div>
        <div id="law-history-editor-list">${historyItemsHtml}</div>
      `;
      editor.appendChild(historySection);
    }

  }

  const applySection = document.createElement("div");
  applySection.className = "editor-section";
  applySection.innerHTML = `
    <button id="apply-edit" class="primary">应用修改</button>
    <div class="field-hint" style="margin-top:8px;">
      先应用修改，再点击右上角“保存全部改动”写回网站数据。
    </div>
  `;
  editor.appendChild(applySection);

  if (lawRole === "law") {
    const addHistoryButton = $("law-history-add");
    if (addHistoryButton) {
      addHistoryButton.onclick = () => {
        const nextLawMeta = ensureLawMeta(node);
        const nextEntries = normalizeLawHistoryEntries(nextLawMeta.historyEntries);
        nextEntries.push({
          title: "新历史法案",
          statusTone: "archived",
          statusLabel: "旧版法令",
          eraLabel: "",
          summary: "",
          text: "",
          note: "",
          positiveEffects: [],
          negativeEffects: [],
          neutralEffects: [],
        });
        nextLawMeta.historyEntries = nextEntries;
        setStatus("已新增历史法案（未保存）", "warn");
        renderEditor();
      };
    }

    Array.from(
      editor.querySelectorAll("[data-law-history-action][data-history-index]")
    ).forEach((button) => {
      button.addEventListener("click", () => {
        const action = button.getAttribute("data-law-history-action");
        const index = Number(button.getAttribute("data-history-index"));
        if (!Number.isInteger(index) || index < 0) return;

        const nextLawMeta = ensureLawMeta(node);
        const nextEntries = normalizeLawHistoryEntries(nextLawMeta.historyEntries);
        if (!nextEntries[index]) return;

        if (action === "remove") {
          nextEntries.splice(index, 1);
        } else if (action === "move-up" && index > 0) {
          const [entry] = nextEntries.splice(index, 1);
          nextEntries.splice(index - 1, 0, entry);
        } else if (action === "move-down" && index < nextEntries.length - 1) {
          const [entry] = nextEntries.splice(index, 1);
          nextEntries.splice(index + 1, 0, entry);
        }

        if (nextEntries.length) nextLawMeta.historyEntries = nextEntries;
        else delete nextLawMeta.historyEntries;

        setStatus("已调整历史法案（未保存）", "warn");
        renderEditor();
      });
    });
  }

  // 应用修改：把表单值写回当前 node
  $("apply-edit").onclick = () => {
    node.title = $("field-title").value;
    node.image = $("field-image").value;
    node.details = $("field-details").value;

    // 使用 marker 字段保存节点样式（统一出口）
    const markerField = $("field-node-style");
    if (markerField) {
      const val = markerField.value.trim();
      if (val) {
        node.marker = val;
      } else {
        delete node.marker;
      }
    }

    // 类型特定字段
    if (type === "branch") {
      const fromSel = $("field-from-era");
      const toSel = $("field-to-era");
      const posSel = $("field-branch-position");
      const laneInput = $("field-lane-index");
      const colorInput = $("field-branch-color");

      if (fromSel) node.fromEraIndex = parseInt(fromSel.value, 10) || 0;
      if (toSel)
        node.toEraIndex =
          parseInt(toSel.value, 10) || node.fromEraIndex || 0;
      if (posSel) node.position = posSel.value === "above" ? "above" : "below";
      if (laneInput) node.laneIndex = parseInt(laneInput.value, 10) || 0;
      if (colorInput) node.color = colorInput.value.trim();
    }

    if (type === "branchEvent") {
      const timeInput = $("field-event-time");
      if (timeInput) node.time = timeInput.value;
    }

    if (lawRole) {
      const nextLawMeta = ensureLawMeta(node);

      if (lawRole === "lawCategory") {
        assignMetaText(nextLawMeta, "kicker", $("law-kicker")?.value);
        assignMetaText(nextLawMeta, "summary", $("law-summary")?.value);
        assignMetaText(nextLawMeta, "boardNote", $("law-board-note")?.value);
      } else if (lawRole === "lawSection") {
        assignMetaText(nextLawMeta, "summary", $("law-summary")?.value);
        assignMetaText(nextLawMeta, "boardNote", $("law-board-note")?.value);
      } else if (lawRole === "law") {
        assignMetaText(nextLawMeta, "layout", $("law-layout")?.value);
        assignMetaText(nextLawMeta, "subtitle", $("law-subtitle")?.value);
        assignMetaText(nextLawMeta, "statusLabel", $("law-status-label")?.value);
        assignMetaText(nextLawMeta, "statusText", $("law-status-text")?.value);
        assignMetaText(nextLawMeta, "enactedLabel", $("law-enacted-label")?.value);
        assignMetaText(nextLawMeta, "enactedText", $("law-enacted-text")?.value);
        assignMetaText(nextLawMeta, "quote", $("law-quote")?.value);
        assignMetaList(nextLawMeta, "positiveEffects", $("law-positive-effects")?.value);
        assignMetaList(nextLawMeta, "negativeEffects", $("law-negative-effects")?.value);
        assignMetaList(nextLawMeta, "neutralEffects", $("law-neutral-effects")?.value);
        assignMetaText(
          nextLawMeta,
          "charterKicker",
          $("law-charter-kicker")?.value
        );
        assignMetaText(
          nextLawMeta,
          "charterLeftLabel",
          $("law-charter-left-label")?.value
        );
        assignMetaText(
          nextLawMeta,
          "charterRightLabel",
          $("law-charter-right-label")?.value
        );
        assignMetaText(
          nextLawMeta,
          "charterCenterText",
          $("law-charter-center-text")?.value
        );
        const nextHistoryEntries = Array.from(
          editor.querySelectorAll(".law-history-editor-item")
        )
          .map((itemEl) => {
            const index = Number(itemEl.getAttribute("data-history-index"));
            const readHistoryField = (fieldName) =>
              editor.querySelector(
                `[data-history-field="${fieldName}"][data-history-index="${index}"]`
              );

            return {
              title: String(readHistoryField("title")?.value || "").trim(),
              statusTone: String(
                readHistoryField("statusTone")?.value || "archived"
              ).trim(),
              statusLabel: String(
                readHistoryField("statusLabel")?.value || ""
              ).trim(),
              eraLabel: String(readHistoryField("eraLabel")?.value || "").trim(),
              summary: String(readHistoryField("summary")?.value || "").trim(),
              text: String(readHistoryField("text")?.value || "").trim(),
              note: String(readHistoryField("note")?.value || "").trim(),
              positiveEffects: textareaToList(
                readHistoryField("positiveEffects")?.value
              ),
              negativeEffects: textareaToList(
                readHistoryField("negativeEffects")?.value
              ),
              neutralEffects: textareaToList(
                readHistoryField("neutralEffects")?.value
              ),
            };
          })
          .filter((entry) => entry.title || entry.summary || entry.text);

        if (nextHistoryEntries.length) nextLawMeta.historyEntries = nextHistoryEntries;
        else delete nextLawMeta.historyEntries;
      } else if (lawRole === "lawClause") {
        assignMetaText(nextLawMeta, "badge", $("law-badge")?.value);
        assignMetaText(nextLawMeta, "subtitle", $("law-subtitle")?.value);
        assignMetaText(nextLawMeta, "note", $("law-note")?.value);
        assignMetaList(nextLawMeta, "positiveEffects", $("law-positive-effects")?.value);
        assignMetaList(nextLawMeta, "negativeEffects", $("law-negative-effects")?.value);
        assignMetaList(nextLawMeta, "neutralEffects", $("law-neutral-effects")?.value);
        assignMetaText(
          nextLawMeta,
          "charterTrack",
          $("law-charter-track")?.value
        );
        assignMetaNumber(
          nextLawMeta,
          "charterTier",
          $("law-charter-tier")?.value
        );
        assignMetaBoolean(
          nextLawMeta,
          "charterSigned",
          Boolean($("law-charter-signed")?.checked)
        );
      }

      if (!Object.keys(nextLawMeta).length) {
        delete node.lawMeta;
      }
    }

    setStatus("已修改（未保存）", "warn");
    renderTree();
    renderEditor();
  };

  // 上传图片逻辑
  $("upload-file-btn").onclick = async () => {
    const fileInput = $("upload-file-input");
    if (!fileInput.files.length) {
      alert("请选择图片文件");
      return;
    }

    const formData = new FormData();
    formData.append("file", fileInput.files[0]);

    setStatus("正在上传图片…", "warn");

    try {
      const res = await fetch(UPLOAD_ENDPOINT, {
        method: "POST",
        headers: buildAdminHeaders(),
        body: formData,
      });

      const result = await res.json().catch(async () => ({
        error: await res.text().catch(() => "上传失败"),
      }));

      if (res.status === 401 || result.error === "Invalid admin token") {
        handleAdminAuthFailure();
        return;
      }

      if (!res.ok || !result.ok) {
        const message = result.error || `上传失败（HTTP ${res.status}）`;
        setStatus(`图片上传失败：${message}`, "error");
        alert(message);
        return;
      }

      $("field-image").value = result.path;

      const img = $("image-preview");
      img.src = result.path;
      img.style.display = "block";

      setStatus("图片上传成功（记得点击“应用修改”并保存）", "ok");
    } catch (err) {
      console.error(err);
      const message = err && err.message ? err.message : "上传过程中出错";
      setStatus(`图片上传失败：${message}`, "error");
      alert(message);
    }
  };

  // 渲染预览按钮逻辑
  const detailsField = $("field-details");
  const previewBtn = $("preview-details-btn");
  const previewBox = $("details-preview");

  if (previewBtn && previewBox && detailsField) {
    previewBtn.onclick = () => {
      const isHidden =
        previewBox.style.display === "none" || !previewBox.style.display;

      if (isHidden) {
        renderDetailsPreview(detailsField.value, previewBox);
        previewBox.style.display = "block";
        previewBtn.textContent = "隐藏预览";
        setStatus("已生成渲染预览", "ok");
      } else {
        previewBox.style.display = "none";
        previewBtn.textContent = "预览渲染效果";
      }
    };

    detailsField.addEventListener("input", () => {
      if (previewBox.style.display === "block") {
        renderDetailsPreview(detailsField.value, previewBox);
      }
    });
  }

  // 颜色工具条（含“去标签”）
  initColorToolbar(editor);
  finalizeEditorRender(editor, { path: selectedPath, node, type });
}

// ====== 新增子节点 / 删除节点 ======
function addChild() {
  if (!selectedPath) {
    alert("请先在左侧选择一个节点");
    return;
  }

  if (isSiteSettingsPath(selectedPath)) {
    setStatus("站点设置不支持新增子节点，请直接编辑右侧表单。", "warn");
    return;
  }

  // 小说库节点不走“新增子节点”逻辑（避免误操作影响既有结构）
  if (isNovelsPath(selectedPath)) {
    setStatus("小说库不支持使用左下角“新增子节点”。请在右侧使用小说上传/编辑按钮。", "warn");
    return;
  }

  if (isMusicPath(selectedPath)) {
    const playlist = ensureMusicPlaylist(websiteData);
    const currentIndex =
      selectedPath[1] === "playlist" ? Number(selectedPath[2]) : playlist.length - 1;
    const insertIndex =
      selectedPath[1] === "playlist" && Number.isInteger(currentIndex)
        ? currentIndex + 1
        : playlist.length;

    playlist.splice(insertIndex, 0, normalizeMusicTrack({}, insertIndex));
    websiteData.musicPlaylist = playlist.map((track, index) => normalizeMusicTrack(track, index));
    selectedPath = ["__music", "playlist", insertIndex];
    renderTree();
    renderEditor();
    setStatus("已新增歌曲（未保存）", "warn");
    return;
  }

  const node = getNode(websiteData, selectedPath);
  const type = getNodeType(selectedPath);

  // 特例 1：重大事件分类 -> 新时代 or 新时间支线
  if (type === "category" && node.id === "events") {
    const useEra = window.confirm(
      "在「重大事件」下新增：\n\n【确定】→ 新的【时代节点】（主时间线）\n【取消】→ 新的【时间支线】"
    );

    const prop = useEra ? "eras" : "branches";
    if (!Array.isArray(node[prop])) node[prop] = [];

    const idx = node[prop].length;

    if (useEra) {
      node[prop].push({
        title: "新时间节点",
        image: "",
        details: "",
      });

      selectedPath = [...selectedPath, prop, idx];
      renderTree();
      renderEditor();
      setStatus("已在「重大事件」下新增主线时代节点（未保存）", "warn");
      return;
    }

    // 新建分支
    node[prop].push({
      title: "新时间支线",
      fromEraIndex: 0,
      toEraIndex: 0,
      position: "below",
      laneIndex: 0,
      color: "",
      details: "",
      image: "",
      events: [
        {
          title: "支线事件",
          time: "",
          image: "",
          details: "",
        },
      ],
    });

    selectedPath = [...selectedPath, prop, idx];
    renderTree();
    renderEditor();
    setStatus("已在「重大事件」下新增时间支线（未保存）", "warn");
    return;
  }

  // 特例 2：在某条 branch 下新增支线事件
  if (type === "branch") {
    if (!Array.isArray(node.events)) node.events = [];
    const idx = node.events.length;

    node.events.push({
      title: "支线事件",
      time: "",
      image: "",
      details: "",
    });

    selectedPath = [...selectedPath, "events", idx];
    renderTree();
    renderEditor();
    setStatus("已在支线下新增事件（未保存）", "warn");
    return;
  }

  // 其他节点：保持原有逻辑，稍微放宽可用子数组
  const candidateProps = [
    "items",
    "subItems",
    "children",
    "eras",
    "branches",
    "events",
  ];
  let prop =
    candidateProps.find((p) => Array.isArray(node[p])) ||
    candidateProps.find((p) => node[p] === undefined) ||
    "subItems";

  if (!Array.isArray(node[prop])) node[prop] = [];

  const idx = node[prop].length;
  node[prop].push({
    title: "新节点",
    details: "",
    image: "",
    subItems: [],
  });

  selectedPath = [...selectedPath, prop, idx];
  renderTree();
  renderEditor();
  setStatus("已新增节点（未保存）", "warn");
}

async function deleteNode() {
  if (!selectedPath) {
    alert("尚未选择要删除的节点");
    return;
  }

  if (isSiteSettingsPath(selectedPath)) {
    setStatus("站点设置不能删除。", "warn");
    return;
  }

  if (isNovelsPath(selectedPath)) {
    setStatus("小说库节点不支持使用左下角“删除当前节点”。请在 novels_data 中手动处理或后续再扩展专用删除接口。", "warn");
    return;
  }

  if (isMusicPath(selectedPath)) {
    if (selectedPath[1] === "root") {
      setStatus("音乐库根节点不能删除", "warn");
      return;
    }

    const index = Number(selectedPath[2]);
    const removed = await removeMusicTrack(index);
    if (!removed) return;
    renderTree();
    renderEditor();
    return;
  }

  const { parent, key, parentPath } = getParent(websiteData, selectedPath);
  if (!parent) return;

  if (Array.isArray(parent)) {
    parent.splice(key, 1);
  } else {
    delete parent[key];
  }

  selectedPath = parentPath.length ? parentPath : null;
  renderTree();
  renderEditor();
  setStatus("已删除节点（未保存）", "warn");
}

// ====== 拖拽排序（同层级） ======
function onDragStart(e) {
  const el = e.currentTarget;
  dragSrcPath = JSON.parse(el.dataset.path);
  dragOverPath = null;
  dragDropPlacement = "before";
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", JSON.stringify(dragSrcPath));
  }
  el.style.opacity = "0.4";
}

function onDragOver(e) {
  e.preventDefault();
  if (!dragSrcPath) return;

  const el = e.currentTarget?.closest(".tree-node") || e.target.closest(".tree-node");
  if (!el) return;

  const nextPath = JSON.parse(el.dataset.path);
  const placement =
    e.clientY > el.getBoundingClientRect().top + el.getBoundingClientRect().height / 2
      ? "after"
      : "before";

  clearTreeDragState();
  dragOverPath = nextPath;
  dragDropPlacement = placement;
  decorateDropTarget(el, placement);

  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = "move";
  }
}

function onDragLeave(e) {
  const el = e.currentTarget?.closest(".tree-node") || e.target.closest(".tree-node");
  if (!el) return;
  el.style.background = "";
  el.style.boxShadow = "";
}

function onDrop(e) {
  e.preventDefault();

  const el = e.currentTarget?.closest(".tree-node") || e.target.closest(".tree-node");
  if (!el) return;

  const dstPath = JSON.parse(el.dataset.path);

  if (!isSameSortableCollection(dragSrcPath, dstPath)) {
    clearTreeDragState();
    setStatus("只能在同一父级内排序", "error");
    return;
  }

  applySort(dragSrcPath, dstPath, dragDropPlacement);
  clearTreeDragState();
}

function onDragEnd() {
  clearTreeDragState();
}

function isSameSortableCollection(a, b) {
  const srcInfo = getSortableInfo(a);
  const dstInfo = getSortableInfo(b);
  return (
    !!srcInfo &&
    !!dstInfo &&
    srcInfo.arrayName === dstInfo.arrayName &&
    isSamePath(srcInfo.collectionPath, dstInfo.collectionPath)
  );
}

function applySort(srcPath, dstPath, placement = "before") {
  const srcInfo = getSortableInfo(srcPath);
  const dstInfo = getSortableInfo(dstPath);
  if (!srcInfo || !dstInfo) {
    setStatus("当前节点不支持拖拽排序", "error");
    return;
  }

  if (isSamePath(srcPath, dstPath)) {
    setStatus("已选中当前节点，可拖到其他同级节点前后完成排序", "info");
    return;
  }

  const arr = srcInfo.list;
  const srcIndex = srcInfo.index;
  const originalDstIndex = dstInfo.index;
  const targetTitle = arr[originalDstIndex]?.title || "目标节点";
  const movingForward = srcIndex < originalDstIndex;
  let insertIndex = originalDstIndex;

  if (placement === "after") {
    insertIndex += 1;
  }
  if (movingForward) {
    insertIndex -= 1;
  }
  if (insertIndex < 0) {
    insertIndex = 0;
  }

  const moved = arr.splice(srcIndex, 1)[0];
  arr.splice(insertIndex, 0, moved);

  selectedPath = [...srcInfo.collectionPath, insertIndex];

  const movedTitle = moved?.title || "节点";
  const placementLabel = placement === "after" ? "之后" : "之前";

  setStatus(`已将「${movedTitle}」移动到「${targetTitle}」${placementLabel}（未保存）`, "warn");
  renderTree();
  renderEditor();
}

// ====== 按钮事件绑定 ======
$("save-token-btn").onclick = () => {
  const v = $("admin-token-input").value.trim();
  if (!v) {
    alert("备用 Token 不能为空");
    return;
  }
  adminToken = v;
  localStorage.setItem("uhe_admin_token", v);
  setStatus("备用 Token 已保存到本地", "ok");
};

$("reload-btn").onclick = () => {
  if (confirm("确认从服务器重新加载 website-data？将丢弃未保存的修改。")) {
    loadData();
  }
};

$("save-data-btn").onclick = () => {
  saveData();
};

$("editor-save-all-btn").onclick = () => {
  saveData();
};

$("editor-apply-current-btn").onclick = () => {
  triggerApplyCurrentEdit();
};

$("add-child-btn").onclick = () => {
  addChild();
};

$("delete-node-btn").onclick = () => {
  deleteNode();
};

$("add-category-btn").onclick = () => {
  if (!websiteData) return;
  if (!Array.isArray(websiteData.categories)) {
    websiteData.categories = [];
  }
  const idx = websiteData.categories.length;
  websiteData.categories.push({
    title: `新分类 ${idx + 1}`,
    items: [],
  });
  selectedPath = ["categories", idx];
  renderTree();
  renderEditor();
  setStatus("已新增分类（未保存）", "warn");
};

// 🔍 绑定全局搜索按钮 + 回车
function bindSearchEvents() {
  const btn = $("global-search-btn");
  const input = $("global-search-input");
  if (!btn || !input) return;

  btn.onclick = () => {
    handleGlobalSearch();
  };

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      handleGlobalSearch();
    }
  });
}

// ====== 初始化：读取本地 Token + 绑定搜索 + 加载数据 ======
window.addEventListener("DOMContentLoaded", () => {
  injectNovelsEditorStyles();
  restoreCollapsedTreeState();
  const saved = localStorage.getItem("uhe_admin_token");
  if (saved) {
    adminToken = saved;
    const input = $("admin-token-input");
    if (input) input.value = saved;
  }
  bindSearchEvents();
  bindSearchResultsPanel();
  bindEditorActionDock();
  bindGlobalShortcuts();
  bindAdminSettingsEvents();
  setAdminSettingsEditable(false);
  renderSearchResults([]);
  loadData();
});
