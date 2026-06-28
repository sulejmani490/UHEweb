// cms-server.js - 轻量内容管理后端（ESM 版 + 图片上传 + 双前缀兼容）
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const ENV_FILE_PATH = path.join(__dirname, '.env');
const ADMIN_ENV_KEY = 'ADMIN_TOKEN';
const DEFAULT_ADMIN_TOKEN = 'sulejmani';
const ADMIN_SESSION_COOKIE = 'uhe_admin_session';
const ADMIN_STATIC_DIR = path.join(__dirname, 'admin');
const USE_SECURE_COOKIE = process.env.NODE_ENV === 'production';

function normalizeToken(value) {
  return String(value || '').trim();
}

function parseEnvValue(rawValue) {
  const trimmed = String(rawValue || '').trim();
  if (!trimmed) return '';

  const quote = trimmed[0];
  if ((quote === '"' || quote === "'") && trimmed.endsWith(quote)) {
    const inner = trimmed.slice(1, -1);
    if (quote === '"') {
      return inner
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
    }
    return inner
      .replace(/\\'/g, "'")
      .replace(/\\\\/g, '\\');
  }

  return trimmed.replace(/\s+#.*$/, '').trim();
}

function parseEnvFile(text) {
  const values = {};
  const lines = String(text || '').split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;

    values[match[1]] = parseEnvValue(match[2]);
  }

  return values;
}

function readEnvFileValues() {
  if (!fs.existsSync(ENV_FILE_PATH)) {
    return {};
  }

  try {
    return parseEnvFile(fs.readFileSync(ENV_FILE_PATH, 'utf8'));
  } catch (error) {
    console.error('Failed to read .env file:', error);
    return {};
  }
}

function serializeEnvValue(value) {
  const stringValue = String(value ?? '');
  if (/^[A-Za-z0-9._:@/-]+$/.test(stringValue)) {
    return stringValue;
  }
  return JSON.stringify(stringValue);
}

function upsertEnvFileValue(key, value) {
  let lines = [];

  if (fs.existsSync(ENV_FILE_PATH)) {
    lines = fs.readFileSync(ENV_FILE_PATH, 'utf8').split(/\r?\n/);
  }

  if (!lines.length) {
    lines = [
      '# UHE CMS local environment variables',
      '# ADMIN_TOKEN can be updated from /admin settings.',
      '',
    ];
  }

  const nextLine = `${key}=${serializeEnvValue(value)}`;
  let replaced = false;

  lines = lines.map((line) => {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (!match || match[1] !== key) {
      return line;
    }
    replaced = true;
    return nextLine;
  });

  if (!replaced) {
    if (lines.length && lines[lines.length - 1].trim() !== '') {
      lines.push('');
    }
    lines.push(nextLine);
  }

  fs.writeFileSync(ENV_FILE_PATH, `${lines.join('\n').replace(/\n+$/, '')}\n`, 'utf8');
}

function resolveAdminTokenState() {
  const runtimeToken = normalizeToken(process.env[ADMIN_ENV_KEY]);
  if (runtimeToken) {
    return {
      token: runtimeToken,
      source: 'process',
      sourceLabel: `system environment variable ${ADMIN_ENV_KEY}`,
      editableFromAdmin: false,
    };
  }

  const fileEnv = readEnvFileValues();
  const fileToken = normalizeToken(fileEnv[ADMIN_ENV_KEY]);
  if (fileToken) {
    process.env[ADMIN_ENV_KEY] = fileToken;
    return {
      token: fileToken,
      source: 'env-file',
      sourceLabel: '.env file',
      editableFromAdmin: true,
    };
  }

  try {
    upsertEnvFileValue(ADMIN_ENV_KEY, DEFAULT_ADMIN_TOKEN);
    process.env[ADMIN_ENV_KEY] = DEFAULT_ADMIN_TOKEN;
    return {
      token: DEFAULT_ADMIN_TOKEN,
      source: 'env-file',
      sourceLabel: '.env file',
      editableFromAdmin: true,
    };
  } catch (error) {
    console.error('Failed to bootstrap ADMIN_TOKEN in .env:', error);
    return {
      token: DEFAULT_ADMIN_TOKEN,
      source: 'memory',
      sourceLabel: 'temporary in-memory fallback',
      editableFromAdmin: true,
    };
  }
}

function getAdminSecurityInfo() {
  return {
    ok: true,
    envVariableName: ADMIN_ENV_KEY,
    envFilePath: '.env',
    tokenSource: adminTokenSource,
    tokenSourceLabel: adminTokenSourceLabel,
    editableFromAdmin: adminTokenEditableFromAdmin,
  };
}

function setAdminToken(nextToken, nextSource = 'env-file', nextLabel = '.env file') {
  adminToken = normalizeToken(nextToken);
  adminTokenSource = nextSource;
  adminTokenSourceLabel = nextLabel;
  adminTokenEditableFromAdmin = nextSource !== 'process';
  process.env[ADMIN_ENV_KEY] = adminToken;
}

const initialAdminTokenState = resolveAdminTokenState();
let adminToken = initialAdminTokenState.token;
let adminTokenSource = initialAdminTokenState.source;
let adminTokenSourceLabel = initialAdminTokenState.sourceLabel;
let adminTokenEditableFromAdmin = initialAdminTokenState.editableFromAdmin;

app.use(cors());
// NOTE: 小说正文 JSON 可能远大于默认 100kb；提高上限不会影响既有接口行为，只是允许更大 payload。
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: false }));

// ====== 0. 静态资源：后台页 & 图片目录 ======
app.use('/images', express.static(path.join(__dirname, 'images')));
// /images -> 上传后的图片直接可访问
app.use('/images', express.static(path.join(__dirname, 'images')));

// 内容数据文件
const WEBSITE_DATA_PATH = path.join(__dirname, 'website-data.json');
const IMAGE_DIR = path.join(__dirname, 'images');
const MUSIC_DIR = path.join(__dirname, 'music');

// ====== 0.1 小说数据目录（仅新增，不影响 website-data 现有逻辑） ======
// 约定：novels_data 位于网站主目录（即与 cms-server.js 同级）。
// 如你的部署目录不同，可通过环境变量 NOVELS_DIR 覆盖。
const NOVELS_DIR = process.env.NOVELS_DIR || path.join(__dirname, 'novels_data');
const NOVELS_MANIFEST_PATH = path.join(NOVELS_DIR, 'manifest.json');

// 简单的加载 / 保存工具函数
function loadWebsiteData() {
  if (!fs.existsSync(WEBSITE_DATA_PATH)) {
    return { categories: [] };
  }
  const raw = fs.readFileSync(WEBSITE_DATA_PATH, 'utf8');
  return JSON.parse(raw);
}

function saveWebsiteData(data) {
  fs.writeFileSync(WEBSITE_DATA_PATH, JSON.stringify(data, null, 2), 'utf8');
}

// ====== 1. 对前端开放的只读接口（双前缀：/api 和 /content-api） ======

function handleGetWebsiteData(req, res) {
  try {
    const data = loadWebsiteData();
    res.json(data);
  } catch (e) {
    console.error('读取 website-data.json 失败：', e);
    res.status(500).json({ error: 'Failed to load website data' });
  }
}

// 原始前缀
app.get('/api/website-data', handleGetWebsiteData);
// 新前缀（前端现在在用的）
app.get('/content-api/website-data', handleGetWebsiteData);

// ====== 2. 管理员接口（保存 website-data.json，双前缀） ======

function parseCookies(req) {
  const raw = String(req.headers.cookie || '');
  if (!raw) return {};

  return raw
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((acc, entry) => {
      const splitIndex = entry.indexOf('=');
      if (splitIndex === -1) return acc;
      const key = entry.slice(0, splitIndex).trim();
      const value = entry.slice(splitIndex + 1).trim();
      acc[key] = decodeURIComponent(value);
      return acc;
    }, {});
}

function hasValidAdminAccess(req) {
  const headerToken = String(req.headers['x-admin-token'] || '').trim();
  if (headerToken && headerToken === adminToken) {
    return true;
  }

  const cookies = parseCookies(req);
  return cookies[ADMIN_SESSION_COOKIE] === adminToken;
}

function requireAdmin(req, res, next) {
  if (!hasValidAdminAccess(req)) {
    return res.status(401).json({ error: 'Invalid admin token' });
  }
  next();
}

function renderAdminLoginPage(errorMessage = '') {
  const safeError = errorMessage
    ? `<div class="login-error">${String(errorMessage)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>管理员登录</title>
  <style>
    :root {
      color-scheme: dark;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      font-family: "Segoe UI", system-ui, sans-serif;
      background:
        radial-gradient(circle at top, rgba(180, 145, 84, 0.14), transparent 28%),
        linear-gradient(180deg, #020617, #0b1120 60%, #111827);
      color: #e5e7eb;
    }
    .login-shell {
      width: min(92vw, 420px);
      padding: 28px 24px 24px;
      border-radius: 20px;
      border: 1px solid rgba(196, 163, 97, 0.18);
      background:
        linear-gradient(180deg, rgba(17, 24, 39, 0.94), rgba(8, 13, 22, 0.96)),
        linear-gradient(135deg, rgba(196, 163, 97, 0.08), rgba(255,255,255,0));
      box-shadow:
        0 24px 60px rgba(0,0,0,0.42),
        inset 0 1px 0 rgba(255,255,255,0.04);
    }
    h1 {
      margin: 0 0 8px;
      font-size: 1.6rem;
      color: #f3dfb0;
      letter-spacing: 0.08em;
    }
    p {
      margin: 0 0 18px;
      color: rgba(226, 232, 240, 0.78);
      line-height: 1.7;
      font-size: 0.95rem;
    }
    label {
      display: block;
      margin-bottom: 8px;
      color: #d4af6c;
      font-size: 0.9rem;
    }
    input {
      width: 100%;
      height: 44px;
      padding: 0 12px;
      border-radius: 12px;
      border: 1px solid rgba(148, 163, 184, 0.28);
      background: rgba(2, 6, 23, 0.92);
      color: #f8fafc;
      font-size: 1rem;
      outline: none;
    }
    input:focus {
      border-color: rgba(196, 163, 97, 0.65);
      box-shadow: 0 0 0 3px rgba(196, 163, 97, 0.12);
    }
    button {
      width: 100%;
      margin-top: 14px;
      height: 44px;
      border: none;
      border-radius: 12px;
      cursor: pointer;
      font-size: 0.98rem;
      font-weight: 600;
      color: #111827;
      background: linear-gradient(180deg, #f0d7a4, #c79e58);
    }
    button:hover {
      filter: brightness(1.04);
    }
    .login-error {
      margin-bottom: 14px;
      padding: 10px 12px;
      border-radius: 12px;
      background: rgba(127, 29, 29, 0.22);
      border: 1px solid rgba(248, 113, 113, 0.22);
      color: #fecaca;
      font-size: 0.92rem;
    }
    .login-hint {
      margin-top: 14px;
      color: rgba(148, 163, 184, 0.78);
      font-size: 0.84rem;
    }
  </style>
</head>
<body>
  <main class="login-shell">
    <h1>管理员登录</h1>
    <p>请输入管理员密钥。验证通过后，系统会建立后台会话，随后才能进入内容管理页面。</p>
    ${safeError}
    <form method="post" action="/admin/login">
      <label for="admin-token">管理员密钥</label>
      <input id="admin-token" name="adminToken" type="password" autocomplete="current-password" autofocus required />
      <button type="submit">进入后台</button>
    </form>
    <div class="login-hint">访问 <code>/admin</code> 时未登录将自动跳转到此页面。</div>
  </main>
</body>
</html>`;
}

app.get('/admin/login', (req, res) => {
  if (hasValidAdminAccess(req)) {
    return res.redirect('/admin/');
  }
  res.type('html').send(renderAdminLoginPage());
});

app.post('/admin/login', (req, res) => {
  const token = String(req.body?.adminToken || '').trim();
  if (token !== adminToken) {
    return res
      .status(401)
      .type('html')
      .send(renderAdminLoginPage('管理员密钥错误，请重新输入。'));
  }

  res.cookie(ADMIN_SESSION_COOKIE, adminToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: USE_SECURE_COOKIE,
    path: '/',
  });
  res.redirect('/admin/');
});

app.post('/admin/logout', (req, res) => {
  res.clearCookie(ADMIN_SESSION_COOKIE, { path: '/' });
  res.redirect('/admin/login');
});

function requireAdminPage(req, res, next) {
  if (hasValidAdminAccess(req)) {
    return next();
  }

  if (req.method === 'GET' && (req.path === '/' || req.path === '' || req.path === '/index.html')) {
    return res.redirect('/admin/login');
  }

  return res.status(401).type('text/plain').send('Admin session required');
}

app.use('/admin', requireAdminPage, express.static(ADMIN_STATIC_DIR));
app.use(
  '/event-game',
  express.static(path.join(__dirname, 'event-game'), {
    setHeaders(res, filePath) {
      if (filePath.endsWith('.wasm')) {
        res.setHeader('Content-Type', 'application/wasm');
      }
      res.setHeader('Cache-Control', 'no-store');
    }
  })
);
// Development convenience: serve the whole site directly from cms-server
// so local testing no longer depends on Live Server.
app.use(express.static(__dirname));

function handleSaveWebsiteData(req, res) {
  try {
    const body = req.body;
    if (!body || !Array.isArray(body.categories)) {
      return res.status(400).json({ error: 'Invalid data format' });
    }
    saveWebsiteData(body);
    res.json({ ok: true });
  } catch (e) {
    console.error('写入 website-data.json 失败：', e);
    res.status(500).json({ error: 'Failed to save website data' });
  }
}

// 原始前缀
app.post('/api/admin/website-data', requireAdmin, handleSaveWebsiteData);
// 新前缀（现在 admin.js 用的是 /content-api）
app.post('/content-api/admin/website-data', requireAdmin, handleSaveWebsiteData);

// ====== 2.1 小说接口（只增不改：读/写 novels_data/*.json + manifest.json） ======

app.post('/content-api/admin/website-data', requireAdmin, handleSaveWebsiteData);

function handleGetAdminSecurity(req, res) {
  res.json(getAdminSecurityInfo());
}

function handleChangeAdminToken(req, res) {
  if (!adminTokenEditableFromAdmin) {
    return res.status(409).json({
      error: `ADMIN_TOKEN is controlled by the server environment. Update ${ADMIN_ENV_KEY} in your process manager instead.`,
    });
  }

  const currentToken = normalizeToken(req.body?.currentToken);
  const nextToken = normalizeToken(req.body?.nextToken);
  const confirmToken = normalizeToken(req.body?.confirmToken);

  if (!currentToken || currentToken !== adminToken) {
    return res.status(400).json({ error: 'Current admin token is incorrect' });
  }

  if (!nextToken) {
    return res.status(400).json({ error: 'New admin token is required' });
  }

  if (nextToken.length < 6) {
    return res.status(400).json({ error: 'New admin token must be at least 6 characters' });
  }

  if (nextToken !== confirmToken) {
    return res.status(400).json({ error: 'New admin token confirmation does not match' });
  }

  try {
    upsertEnvFileValue(ADMIN_ENV_KEY, nextToken);
    setAdminToken(nextToken, 'env-file', '.env file');

    res.cookie(ADMIN_SESSION_COOKIE, adminToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: USE_SECURE_COOKIE,
      path: '/',
    });

    return res.json({
      ok: true,
      message: 'Admin token updated successfully',
      security: getAdminSecurityInfo(),
    });
  } catch (error) {
    console.error('Failed to update ADMIN_TOKEN:', error);
    return res.status(500).json({ error: 'Failed to update ADMIN_TOKEN in .env' });
  }
}

app.get('/api/admin/security', requireAdmin, handleGetAdminSecurity);
app.get('/content-api/admin/security', requireAdmin, handleGetAdminSecurity);
app.post('/api/admin/security/token', requireAdmin, handleChangeAdminToken);
app.post('/content-api/admin/security/token', requireAdmin, handleChangeAdminToken);

function ensureDirSync(dirPath) {
  try {
    fs.mkdirSync(dirPath, { recursive: true });
  } catch (e) {
    // ignore
  }
}

function safeReadJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    console.error('读取 JSON 失败：', filePath, e);
    return fallback;
  }
}

function safeWriteJson(filePath, data) {
  // 原子写：先写 tmp，再 rename
  const dir = path.dirname(filePath);
  ensureDirSync(dir);

  const ts = new Date();
  const stamp = [
    ts.getFullYear(),
    String(ts.getMonth() + 1).padStart(2, '0'),
    String(ts.getDate()).padStart(2, '0'),
    '-',
    String(ts.getHours()).padStart(2, '0'),
    String(ts.getMinutes()).padStart(2, '0'),
    String(ts.getSeconds()).padStart(2, '0'),
  ].join('');

  // 轻量备份（避免写坏后无法回滚）
  if (fs.existsSync(filePath)) {
    try {
      fs.copyFileSync(filePath, `${filePath}.bak-${stamp}`);
    } catch (e) {
      // ignore backup failure
    }
  }

  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmpPath, filePath);
}




function sanitizeNovelId(input) {
  // 允许更宽松的小说 id（兼容现有 novels_data 文件名，尤其是中文标点）
  // 安全约束（兼容 Windows 文件系统）：
  //  - 禁止路径穿越与分隔符
  //  - 禁止控制字符
  //  - 禁止 Windows 文件名非法字符 <>:"/\|?*
  //  - 禁止以 ASCII 点号/空格结尾（Windows 不允许）
  const id = String(input || '').trim();
  if (!id) return null;

  if (id.includes('..') || id.includes('/') || id.includes('\\')) return null;
  if (/[\x00-\x1F\x7F]/.test(id)) return null;
  if (/[<>:"|?*]/.test(id)) return null;
  if (/[\. ]$/.test(id)) return null;

  // Windows 保留设备名（忽略大小写），避免写入失败
  const upper = id.toUpperCase();
  const reserved = new Set([
    'CON','PRN','AUX','NUL',
    'COM1','COM2','COM3','COM4','COM5','COM6','COM7','COM8','COM9',
    'LPT1','LPT2','LPT3','LPT4','LPT5','LPT6','LPT7','LPT8','LPT9',
  ]);
  if (reserved.has(upper)) return null;

  return id;
}

function stripHtmlToText(html) {
  const s = String(html || '');
  // 移除 script/style
  const noScripts = s
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ');
  // 移除标签
  const noTags = noScripts.replace(/<[^>]+>/g, ' ');
  return noTags.replace(/\s+/g, ' ').trim();
}

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeNovelJson(novel, idHint) {
  const n = (novel && typeof novel === 'object') ? novel : {};

  const cleanId = sanitizeNovelId(n.id) || sanitizeNovelId(idHint);
  if (!cleanId) {
    throw new Error('Invalid novel id');
  }
  n.id = cleanId;
  n.title = String(n.title || '').trim() || cleanId;
  if (n.image != null) n.image = String(n.image);

  if (!Array.isArray(n.chapters)) n.chapters = [];

  // 章节 / 段落补齐
  n.chapters = n.chapters.map((ch, ci) => {
    const c = (ch && typeof ch === 'object') ? ch : {};

    if (!c.id) c.id = `c${ci + 1}`;
    c.title = String(c.title || '').trim() || `Chapter ${ci + 1}`;

    // 兼容历史格式：paragraphs / paras / paragraph / content / body / html
    let paraSource = c.paragraphs;
    if (paraSource == null) paraSource = c.paras;
    if (paraSource == null) paraSource = c.paragraph;
    if (paraSource == null) paraSource = c.content;
    if (paraSource == null) paraSource = c.body;
    if (paraSource == null) paraSource = c.html;

    if (Array.isArray(paraSource)) {
      c.paragraphs = paraSource;
    } else if (typeof paraSource === 'string') {
      c.paragraphs = [{ html: paraSource }];
    } else if (paraSource && typeof paraSource === 'object') {
      // 支持对象映射 {id: html} 或 {id: {html/text}}
      c.paragraphs = Object.values(paraSource);
    } else {
      c.paragraphs = [];
    }

// 如果段落为空，但章节本身带有 text/html/content/body 等字符串，把它兜底成一个段落（保证前端 NovelReader 可读）
if (!Array.isArray(c.paragraphs)) c.paragraphs = [];
if (c.paragraphs.length === 0) {
  const rawStr =
    (typeof c.html === 'string' && c.html.trim()) ? c.html :
    (typeof c.content === 'string' && c.content.trim()) ? c.content :
    (typeof c.body === 'string' && c.body.trim()) ? c.body :
    (typeof c.text === 'string' && c.text.trim()) ? c.text :
    null;

  if (rawStr) {
    const looksHtml = /<[^>]+>/.test(rawStr);
    const html = looksHtml ? rawStr : escapeHtml(rawStr).replace(/\n/g, '<br>');
    c.paragraphs = [{ html }];
  }
}

    c.paragraphs = c.paragraphs.map((p, pi) => {
      const para = (p && typeof p === 'object') ? { ...p } : { html: String(p || '') };
      if (!para.id) para.id = `p${ci + 1}_${pi + 1}`;

      // 兼容字段：html/content/value/text（把 "" 也视为缺失，避免只提供 text 时前端显示空白）
const hasHtml = (v) => v != null && String(v).trim() !== '';
if (!hasHtml(para.html) && hasHtml(para.content)) para.html = String(para.content);
if (!hasHtml(para.html) && hasHtml(para.value)) para.html = String(para.value);

// 如果只给了 text（或 html 为空），则从 text 派生 html（纯文本安全转义）
if (!hasHtml(para.html) && hasHtml(para.text)) {
  para.html = escapeHtml(String(para.text)).replace(/\n/g, '<br>');
}
para.html = String(para.html || '');

      if (para.text == null || String(para.text).trim() === '') {
        para.text = stripHtmlToText(para.html);
      } else {
        para.text = String(para.text);
      }
      return para;
    });

    return c;
  });

  return n;
}



// ====== 2.1.1 导入转换：TXT / DOCX -> Novel JSON（仅新增，不影响既有 JSON 上传） ======

function detectChapterTitleLine(line) {
  const s = String(line || '').trim();
  if (!s) return null;

  // Markdown 风格
  const md = s.match(/^#{1,3}\s+(.*)$/);
  if (md && md[1]) return md[1].trim();

  // 常见中文章回
  if (/^第.{1,40}章/.test(s)) return s;

  // 英文章回
  if (/^chapter\s+\d+/i.test(s)) return s;

  // 自定义：用 "===" 分隔（上一行作为标题）不在这里处理

  return null;
}

function txtToNovelJson(txt, idHint, titleHint) {
  const raw = String(txt || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  const lines = raw.split('\n');

  const chapters = [];
  let curTitle = String(titleHint || '').trim() || '正文';
  let curParas = [];
  let buf = [];

  function flushParagraph() {
    const content = buf.join('\n').trim();
    buf = [];
    if (!content) return;
    const html = escapeHtml(content).replace(/\n/g, '<br>');
    curParas.push({ html });
  }

  function flushChapter() {
    flushParagraph();
    if (curParas.length === 0) return;
    chapters.push({ title: curTitle, paragraphs: curParas });
    curParas = [];
  }

  for (const line of lines) {
    const chapterTitle = detectChapterTitleLine(line);
    if (chapterTitle) {
      flushChapter();
      curTitle = chapterTitle;
      continue;
    }

    if (String(line).trim() === '') {
      flushParagraph();
    } else {
      buf.push(line);
    }
  }
  flushChapter();

  // 如果整篇没有任何段落，兜底成一个空段
  if (chapters.length === 0) {
    chapters.push({ title: curTitle, paragraphs: [{ html: '' }] });
  }

  return normalizeNovelJson({ id: idHint, title: titleHint || idHint, chapters }, idHint);
}

function extractParasFromHtmlSegment(segHtml) {
  const seg = String(segHtml || '');
  const paras = [];

  // <p>...</p>
  const pRe = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let m;
  while ((m = pRe.exec(seg)) !== null) {
    const inner = String(m[1] || '').trim();
    if (stripHtmlToText(inner)) paras.push(inner);
  }

  // <li>...</li> -> 转为带 bullet 的段落
  const liRe = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  while ((m = liRe.exec(seg)) !== null) {
    const inner = String(m[1] || '').trim();
    if (stripHtmlToText(inner)) paras.push(`&bull; ${inner}`);
  }

  // 如果完全找不到 <p>/<li>，尝试把纯文本残余兜底成一个段落
  if (paras.length === 0) {
    const text = stripHtmlToText(seg);
    if (text) paras.push(escapeHtml(text));
  }

  return paras;
}

function docxHtmlToNovelJson(html, idHint, titleHint) {
  const src = String(html || '');

  // 把 h1/h2/h3 作为章节切分点
  const re = /<(h1|h2|h3)[^>]*>([\s\S]*?)<\/\1>/gi;

  let last = 0;
  let curTitle = String(titleHint || '').trim() || '正文';
  let curParas = [];
  const chapters = [];

  function flush() {
    if (curParas.length === 0) return;
    chapters.push({ title: curTitle, paragraphs: curParas });
    curParas = [];
  }

  let match;
  while ((match = re.exec(src)) !== null) {
    const before = src.slice(last, match.index);
    const beforeParas = extractParasFromHtmlSegment(before).map((inner) => ({ html: inner }));
    curParas.push(...beforeParas);

    // 开新章
    flush();
    const hTitleHtml = match[2] || '';
    const hTitleText = stripHtmlToText(hTitleHtml);
    curTitle = hTitleText || curTitle || '正文';

    last = re.lastIndex;
  }

  // 尾部内容
  const tail = src.slice(last);
  const tailParas = extractParasFromHtmlSegment(tail).map((inner) => ({ html: inner }));
  curParas.push(...tailParas);
  flush();

  if (chapters.length === 0) {
    // 没有 heading 的 docx：整篇作为一章
    const allParas = extractParasFromHtmlSegment(src).map((inner) => ({ html: inner }));
    chapters.push({ title: curTitle, paragraphs: allParas.length ? allParas : [{ html: '' }] });
  }

  return normalizeNovelJson({ id: idHint, title: titleHint || idHint, chapters }, idHint);
}
function loadNovelsManifest() {
  ensureDirSync(NOVELS_DIR);
  const m = safeReadJson(NOVELS_MANIFEST_PATH, []);
  return Array.isArray(m) ? m : [];
}

function saveNovelsManifest(manifestArr) {
  ensureDirSync(NOVELS_DIR);
  safeWriteJson(NOVELS_MANIFEST_PATH, manifestArr);
}

function upsertManifestEntry(manifestArr, entry) {
  const id = sanitizeNovelId(entry && entry.id);
  if (!id) return manifestArr;

  const title = String(entry.title || '').trim() || id;
  const image = entry.image != null ? String(entry.image) : undefined;
  const details = entry && entry.details != null ? String(entry.details) : undefined;

  const idx = manifestArr.findIndex((x) => x && x.id === id);
  if (idx >= 0) {
    const cur = manifestArr[idx] || {};
    manifestArr[idx] = {
      ...cur,
      id,
      title,
      ...(image !== undefined ? { image } : {}),
      ...(details !== undefined ? { details } : {}),
    };
  } else {
    manifestArr.push({ id, title, ...(image !== undefined ? { image } : {}) });
  }
  return manifestArr;
}

function novelFilePathById(novelId) {
  const cleanId = sanitizeNovelId(novelId);
  if (!cleanId) return null;
  return path.join(NOVELS_DIR, `${cleanId}.json`);
}

function handleGetNovelsManifest(req, res) {
  try {
    const manifest = loadNovelsManifest();
    res.json(manifest);
  } catch (e) {
    console.error('读取 novels manifest 失败：', e);
    res.status(500).json({ error: 'Failed to load novels manifest' });
  }
}

function handleGetNovelById(req, res) {
  try {
    const rawId = decodeURIComponent(req.params.id || '');
    const filePath = novelFilePathById(rawId);
    if (!filePath) return res.status(400).json({ error: 'Invalid novel id' });
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Novel not found' });
    const novel = safeReadJson(filePath, null);
    if (!novel) return res.status(500).json({ error: 'Failed to load novel' });
    // 读接口也做一次轻量 normalize，保证字段齐全
    const normalized = normalizeNovelJson(novel, rawId);
    res.json(normalized);
  } catch (e) {
    console.error('读取 novel 失败：', e);
    res.status(500).json({ error: 'Failed to load novel' });
  }
}

// 只读：/api + /content-api
app.get('/api/novels/manifest', handleGetNovelsManifest);
app.get('/content-api/novels/manifest', handleGetNovelsManifest);
app.get('/api/novels/:id', handleGetNovelById);
app.get('/content-api/novels/:id', handleGetNovelById);

function handleSaveNovelsManifest(req, res) {
  try {
    const body = req.body;
    const manifest = Array.isArray(body) ? body : (Array.isArray(body?.manifest) ? body.manifest : null);
    if (!manifest) {
      return res.status(400).json({ error: 'Invalid manifest format' });
    }

    // 最小清洗：每条必须含 id/title
    const cleaned = manifest
      .map((x) => {
        const id = sanitizeNovelId(x && x.id);
        if (!id) return null;
        const title = String(x && x.title ? x.title : id).trim() || id;
        const image = x && x.image != null ? String(x.image) : undefined;
        return { id, title, ...(image !== undefined ? { image } : {}) };
      })
      .filter(Boolean);

    saveNovelsManifest(cleaned);
    res.json({ ok: true, count: cleaned.length });
  } catch (e) {
    console.error('写入 novels manifest 失败：', e);
    res.status(500).json({ error: 'Failed to save novels manifest' });
  }
}

function handleSaveNovelById(req, res) {
  try {
    const rawId = decodeURIComponent(req.params.id || '');
    const cleanId = sanitizeNovelId(rawId);
    if (!cleanId) return res.status(400).json({ error: 'Invalid novel id' });

    const normalized = normalizeNovelJson(req.body, cleanId);
    const filePath = novelFilePathById(cleanId);
    if (!filePath) return res.status(400).json({ error: 'Invalid novel id' });

    safeWriteJson(filePath, normalized);

    // 同步/补齐 manifest：保证前台列表与后台一致
    const manifest = loadNovelsManifest();
    upsertManifestEntry(manifest, { id: cleanId, title: normalized.title, image: normalized.image });
    saveNovelsManifest(manifest);

    res.json({ ok: true, id: cleanId });
  } catch (e) {
    console.error('写入 novel 失败：', e);
    res.status(500).json({ error: 'Failed to save novel' });
  }
}

function handleDeleteNovelById(req, res) {
  try {
    const rawId = decodeURIComponent(req.params.id || '');
    const cleanId = sanitizeNovelId(rawId);
    if (!cleanId) return res.status(400).json({ error: 'Invalid novel id' });

    const filePath = novelFilePathById(cleanId);
    if (!filePath) return res.status(400).json({ error: 'Invalid novel id' });

    let deletedFile = false;
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      deletedFile = true;
    }

    const manifest = loadNovelsManifest();
    const nextManifest = manifest.filter((entry) => !(entry && entry.id === cleanId));
    saveNovelsManifest(nextManifest);

    res.json({
      ok: true,
      id: cleanId,
      deletedFile,
      removedManifest: nextManifest.length !== manifest.length,
    });
  } catch (e) {
    console.error('删除 novel 失败：', e);
    res.status(500).json({ error: 'Failed to delete novel' });
  }
}

// 新增：导入/上传小说 JSON（multipart/form-data）
const novelUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
});

function handleUploadNovelJson(req, res) {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: '未接收到文件' });
    }

    const original = String(req.file.originalname || 'novel.json');
    const ext = path.extname(original).toLowerCase();
    if (ext !== '.json') {
      return res.status(400).json({ error: '仅支持 .json 文件' });
    }

    const base = path.basename(original, ext);
    const rawText = req.file.buffer.toString('utf8');
    const parsed = JSON.parse(rawText);

    // id 优先级：json.id > body.id > 文件名
    const idHint = sanitizeNovelId(parsed?.id) || sanitizeNovelId(req.body?.id) || sanitizeNovelId(base);
    if (!idHint) {
      return res.status(400).json({ error: '无法推断 novel id（请在 JSON 中提供 id 或用合法文件名）' });
    }

    const normalized = normalizeNovelJson(parsed, idHint);
    const filePath = novelFilePathById(normalized.id);
    if (!filePath) return res.status(400).json({ error: 'Invalid novel id' });

    safeWriteJson(filePath, normalized);

    const manifest = loadNovelsManifest();
    upsertManifestEntry(manifest, { id: normalized.id, title: normalized.title, image: normalized.image });
    saveNovelsManifest(manifest);

    res.json({ ok: true, id: normalized.id, title: normalized.title });
  } catch (e) {
    console.error('上传 novel 失败：', e);
    res.status(500).json({ error: 'Failed to upload novel' });
  }
}

// 新增：导入/上传小说 DOCX（multipart/form-data）
async function handleUploadNovelDocx(req, res) {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: '未接收到文件' });
    }

    const original = String(req.file.originalname || 'novel.docx');
    const ext = path.extname(original).toLowerCase();
    if (ext !== '.docx') {
      return res.status(400).json({ error: '仅支持 .docx 文件' });
    }

    const base = path.basename(original, ext);
    const idHint = sanitizeNovelId(req.body?.id) || sanitizeNovelId(base);
    if (!idHint) {
      return res.status(400).json({ error: '无法推断 novel id（请使用合法文件名或提供 body.id）' });
    }

    const titleHint = String(req.body?.title || '').trim() || base;
    const imageHint = req.body?.image != null ? String(req.body.image) : undefined;
    const detailsHint = req.body?.details != null ? String(req.body.details) : undefined;

    // 依赖：mammoth（需要 npm i mammoth）
    let mammothMod;
    try {
      mammothMod = await import('mammoth');
    } catch (e) {
      return res.status(500).json({
        error: 'DOCX 导入需要依赖 mammoth。请在 cms-server 所在目录执行：npm i mammoth，然后重启 cms-server。',
      });
    }
    const mammoth = mammothMod.default || mammothMod;

    const result = await mammoth.convertToHtml({ buffer: req.file.buffer });
    const html = (result && result.value) ? String(result.value) : '';

    // 转为网站可读的 novel JSON（chapters + paragraphs[].html）
    let novel = docxHtmlToNovelJson(html, idHint, titleHint);
    if (imageHint !== undefined) novel.image = imageHint;

    // 再 normalize 一次，补齐 text/ids
    novel = normalizeNovelJson(novel, idHint);

    const filePath = novelFilePathById(novel.id);
    if (!filePath) return res.status(400).json({ error: 'Invalid novel id' });

    safeWriteJson(filePath, novel);

    const manifest = loadNovelsManifest();
    upsertManifestEntry(manifest, { id: novel.id, title: novel.title, image: novel.image, details: detailsHint });
    saveNovelsManifest(manifest);

    res.json({ ok: true, id: novel.id, title: novel.title });
  } catch (e) {
    console.error('上传 DOCX 失败：', e);
    res.status(500).json({ error: 'Failed to upload docx' });
  }
}

// 新增：导入/上传小说 TXT（multipart/form-data）
function handleUploadNovelTxt(req, res) {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: '未接收到文件' });
    }

    const original = String(req.file.originalname || 'novel.txt');
    const ext = path.extname(original).toLowerCase();
    if (ext !== '.txt') {
      return res.status(400).json({ error: '仅支持 .txt 文件' });
    }

    const base = path.basename(original, ext);
    const idHint = sanitizeNovelId(req.body?.id) || sanitizeNovelId(base);
    if (!idHint) {
      return res.status(400).json({ error: '无法推断 novel id（请使用合法文件名或提供 body.id）' });
    }

    const titleHint = String(req.body?.title || '').trim() || base;
    const imageHint = req.body?.image != null ? String(req.body.image) : undefined;
    const detailsHint = req.body?.details != null ? String(req.body.details) : undefined;

    const rawText = req.file.buffer.toString('utf8');
    let novel = txtToNovelJson(rawText, idHint, titleHint);
    if (imageHint !== undefined) novel.image = imageHint;
    novel = normalizeNovelJson(novel, idHint);

    const filePath = novelFilePathById(novel.id);
    if (!filePath) return res.status(400).json({ error: 'Invalid novel id' });

    safeWriteJson(filePath, novel);

    const manifest = loadNovelsManifest();
    upsertManifestEntry(manifest, { id: novel.id, title: novel.title, image: novel.image, details: detailsHint });
    saveNovelsManifest(manifest);

    res.json({ ok: true, id: novel.id, title: novel.title });
  } catch (e) {
    console.error('上传 TXT 失败：', e);
    res.status(500).json({ error: 'Failed to upload txt' });
  }
}


// 管理：/api + /content-api
app.post('/api/admin/novels/manifest', requireAdmin, handleSaveNovelsManifest);
app.post('/content-api/admin/novels/manifest', requireAdmin, handleSaveNovelsManifest);
app.post('/api/admin/novels/upload', requireAdmin, novelUpload.single('file'), handleUploadNovelJson);
app.post('/content-api/admin/novels/upload', requireAdmin, novelUpload.single('file'), handleUploadNovelJson);

// 新增：DOCX/TXT 导入（仍使用 novels_data/*.json 落盘）
app.post('/api/admin/novels/upload-docx', requireAdmin, novelUpload.single('file'), handleUploadNovelDocx);
app.post('/content-api/admin/novels/upload-docx', requireAdmin, novelUpload.single('file'), handleUploadNovelDocx);
app.post('/api/admin/novels/upload-txt', requireAdmin, novelUpload.single('file'), handleUploadNovelTxt);
app.post('/content-api/admin/novels/upload-txt', requireAdmin, novelUpload.single('file'), handleUploadNovelTxt);
app.post('/api/admin/novels/:id/delete', requireAdmin, handleDeleteNovelById);
app.post('/content-api/admin/novels/:id/delete', requireAdmin, handleDeleteNovelById);
app.post('/api/admin/novels/:id', requireAdmin, handleSaveNovelById);
app.post('/content-api/admin/novels/:id', requireAdmin, handleSaveNovelById);

// ====== 3. 图片上传配置：存到 /images 目录 ======

function ensureDirectory(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function normalizeUploadOriginalName(originalName) {
  const rawName = String(originalName || 'upload').replace(/\\/g, '/');
  const fileName = path.basename(rawName);

  try {
    const decoded = Buffer.from(fileName, 'latin1').toString('utf8');
    if (decoded && !decoded.includes('\uFFFD')) {
      return decoded;
    }
  } catch (_error) {
    // Keep the original multer name if decoding is not applicable.
  }

  return fileName;
}

function buildSafeFilename(originalName) {
  const normalizedName = normalizeUploadOriginalName(originalName);
  const ext = path.extname(normalizedName).toLowerCase();
  const base = path.basename(normalizedName, ext);
  const safeBase = base
    .normalize('NFKC')
    .replace(/[^\w\-\u4e00-\u9fa5]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `${safeBase || 'upload'}${ext || ''}`;
}

function buildUniqueFilename(targetDir, originalName) {
  const safeName = buildSafeFilename(originalName);
  const ext = path.extname(safeName);
  const base = path.basename(safeName, ext);
  let filename = safeName;
  let counter = 1;

  while (fs.existsSync(path.join(targetDir, filename))) {
    filename = `${base}-${Date.now().toString(36)}-${counter}${ext}`;
    counter += 1;
  }

  return filename;
}

const upload = multer({
  storage: multer.diskStorage({
    destination: function (_req, _file, cb) {
      // All backend image uploads are saved in the site-level /images folder.
      ensureDirectory(IMAGE_DIR);
      cb(null, IMAGE_DIR);
    },
    filename: function (_req, file, cb) {
      const filename = buildUniqueFilename(IMAGE_DIR, file.originalname);
      cb(null, filename);
    }

  }),
  fileFilter: function (_req, file, cb) {
    const ext = path.extname(normalizeUploadOriginalName(file.originalname)).toLowerCase();
    const allowedExt = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg', '.avif']);
    const mimetype = String(file.mimetype || '').toLowerCase();
    if (!mimetype.startsWith('image/') && !allowedExt.has(ext)) {
      cb(new Error(`仅支持图片文件（当前类型：${ext || mimetype || 'unknown'}）`));
      return;
    }
    cb(null, true);
  },
  limits: {
    fileSize: 20 * 1024 * 1024  // 20MB
  }
});

const ALLOWED_AUDIO_EXTENSIONS = new Set(['.mp3', '.flac', '.wav', '.ogg', '.m4a', '.aac']);

function withUploadErrorHandling(uploadMiddleware, handler) {
  return (req, res, next) => {
    uploadMiddleware(req, res, (error) => {
      if (error) {
        const isMulterLimit =
          error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE';
        const message = isMulterLimit
          ? '上传文件超过 20MB 限制'
          : error.message || 'Upload failed';
        return res.status(400).json({ ok: false, error: message });
      }
      return handler(req, res, next);
    });
  };
}

const audioUpload = multer({
  storage: multer.diskStorage({
    destination: function (_req, _file, cb) {
      ensureDirectory(MUSIC_DIR);
      cb(null, MUSIC_DIR);
    },
    filename: function (_req, file, cb) {
      cb(null, buildSafeFilename(file.originalname));
    }
  }),
  fileFilter: function (_req, file, cb) {
    const ext = path.extname(String(file.originalname || '')).toLowerCase();
    if (!ALLOWED_AUDIO_EXTENSIONS.has(ext)) {
      cb(new Error(`Unsupported audio file type: ${ext || 'unknown'}`));
      return;
    }
    cb(null, true);
  },
  limits: {
    fileSize: 120 * 1024 * 1024
  }
});

// 上传图片接口（这里用 /content-api admin 前缀）
// 统一的图片上传处理函数
function handleUploadImage(req, res) {
  if (!req.file) {
    return res.status(400).json({ error: '未接收到文件' });
  }

  const urlPath = `/images/${req.file.filename}`;

  res.json({
    ok: true,
    path: urlPath
  });
}

// 兼容：/api/admin/upload-image
app.post(
  '/api/admin/upload-image',
  requireAdmin,
  withUploadErrorHandling(upload.single('file'), handleUploadImage)
);

// 兼容：/content-api/admin/upload-image
app.post(
  '/content-api/admin/upload-image',
  requireAdmin,
  withUploadErrorHandling(upload.single('file'), handleUploadImage)
);

function handleUploadAudio(req, res) {
  if (!req.file) {
    return res.status(400).json({ error: 'No audio file received' });
  }

  const urlPath = `/music/${req.file.filename}`;

  res.json({
    ok: true,
    path: urlPath,
    name: path.basename(req.file.filename, path.extname(req.file.filename)),
  });
}

function resolveManagedAudioPath(rawPath) {
  const normalized = String(rawPath || '').trim().replace(/\\/g, '/');
  if (!normalized.startsWith('/music/')) {
    return null;
  }

  const relativePath = normalized.slice('/music/'.length);
  if (!relativePath || relativePath.includes('..')) {
    return null;
  }

  const resolvedPath = path.resolve(MUSIC_DIR, relativePath);
  const musicRoot = path.resolve(MUSIC_DIR);
  if (resolvedPath !== musicRoot && !resolvedPath.startsWith(`${musicRoot}${path.sep}`)) {
    return null;
  }

  return resolvedPath;
}

function handleDeleteAudio(req, res) {
  const audioPath = resolveManagedAudioPath(req.body?.path || req.body?.src);
  if (!audioPath) {
    return res.status(400).json({ error: 'Invalid audio path' });
  }

  try {
    if (!fs.existsSync(audioPath)) {
      return res.json({ ok: true, deleted: false });
    }

    fs.unlinkSync(audioPath);
    return res.json({ ok: true, deleted: true });
  } catch (error) {
    console.error('删除音频文件失败：', error);
    return res.status(500).json({ error: 'Failed to delete audio file' });
  }
}

app.post(
  '/api/admin/upload-audio',
  requireAdmin,
  audioUpload.single('file'),
  handleUploadAudio
);

app.post(
  '/content-api/admin/upload-audio',
  requireAdmin,
  audioUpload.single('file'),
  handleUploadAudio
);

app.post('/api/admin/delete-audio', requireAdmin, handleDeleteAudio);
app.post('/content-api/admin/delete-audio', requireAdmin, handleDeleteAudio);

const FRONTEND_INDEX_PATH = path.join(__dirname, 'index.html');

function shouldServeFrontendApp(req) {
  if (req.method !== 'GET') return false;

  const requestPath = String(req.path || '/');
  if (!requestPath || requestPath === '/') {
    return true;
  }

  if (
    requestPath.startsWith('/admin') ||
    requestPath.startsWith('/api') ||
    requestPath.startsWith('/content-api')
  ) {
    return false;
  }

  // Real files should keep normal 404/static behavior.
  if (path.extname(requestPath)) {
    return false;
  }

  return true;
}

app.get('*', (req, res, next) => {
  if (!shouldServeFrontendApp(req)) {
    return next();
  }

  res.sendFile(FRONTEND_INDEX_PATH);
});

const PORT = process.env.CMS_PORT || 4000;
app.listen(PORT, () => {
  console.log(`✅ CMS server is running at http://localhost:${PORT}`);
  console.log(`   GET  /api/website-data`);
  console.log(`   GET  /content-api/website-data`);
  console.log(`   GET  /api/novels/manifest`);
  console.log(`   GET  /content-api/novels/manifest`);
  console.log(`   GET  /api/novels/:id`);
  console.log(`   GET  /content-api/novels/:id`);
  console.log(`   POST /api/admin/website-data`);
  console.log(`   POST /content-api/admin/website-data`);
  console.log(`   GET  /api/admin/security`);
  console.log(`   GET  /content-api/admin/security`);
  console.log(`   POST /api/admin/security/token`);
  console.log(`   POST /content-api/admin/security/token`);
  console.log(`   POST /api/admin/novels/upload`);
  console.log(`   POST /api/admin/novels/upload-docx`);
  console.log(`   POST /api/admin/novels/upload-txt`);
  console.log(`   POST /content-api/admin/novels/upload`);
  console.log(`   POST /content-api/admin/novels/upload-docx`);
  console.log(`   POST /content-api/admin/novels/upload-txt`);
  console.log(`   POST /api/admin/novels/:id`);
  console.log(`   POST /content-api/admin/novels/:id`);
  console.log(`   POST /api/admin/novels/:id/delete`);
  console.log(`   POST /content-api/admin/novels/:id/delete`);
  console.log(`   POST /api/admin/novels/manifest`);
  console.log(`   POST /content-api/admin/novels/manifest`);
  console.log(`   POST /content-api/admin/upload-image`);
  console.log(`   GET  /admin`);
  console.log(`   GET  /images/...`);
  console.log(`   Admin token source: ${adminTokenSourceLabel}`);
});
