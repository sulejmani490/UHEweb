import express from 'express';
import cors from 'cors';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_VECTOR_INDEX_PATH = path.join(__dirname, 'vector_index_v5.bin');
const PROJECT_DOCUMENTS_PATH = path.join(__dirname, 'documents_v5.json');
const NEEDS_ASCII_RUNTIME_DIR =
    process.platform === 'win32' && /[^\u0000-\u007f]/.test(__dirname);
const DEFAULT_RUNTIME_DATA_DIR = NEEDS_ASCII_RUNTIME_DIR
    ? path.join(os.tmpdir(), 'uhetech-runtime')
    : __dirname;

// Centralized backend tuning values.
// You can override most of these via environment variables without touching code.
const SERVER_CONFIG = {
    // Chat model used by the conversational endpoint.
    llmModel: process.env.LLM_MODEL || 'qwen3-max-preview',
    // Embedding model used for vector search and index generation.
    embeddingModel: process.env.EMBEDDING_MODEL || 'text-embedding-v4',
    // Embedding size must stay aligned with the on-disk vector index.
    dimensions: Number(process.env.EMBEDDING_DIMENSIONS || 1024),
    // Batch size for embedding requests when processing documents.
    batchSize: Number(process.env.EMBEDDING_BATCH_SIZE || 10),
    // Shared timeout for upstream AI requests.
    requestTimeoutMs: Number(process.env.AI_REQUEST_TIMEOUT_MS || 30000),
    // Express server port.
    port: Number(process.env.PORT || 3000),
    // API key fallback. Prefer setting QWEN_API_KEY in the environment.
    apiKey: process.env.QWEN_API_KEY || 'sk-6b43c835e2f24561aa2f628efcdb5502',
    // Upstream chat completion endpoint.
    chatEndpoint:
        process.env.QWEN_CHAT_API_ENDPOINT ||
        'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    // Upstream embedding endpoint.
    embeddingEndpoint:
        process.env.QWEN_EMBEDDING_API_ENDPOINT ||
        'https://dashscope.aliyuncs.com/api/v1/services/embeddings/text-embedding/text-embedding',
    // Runtime directory for AI artifacts. On Windows, a temporary ASCII-only path
    // avoids hnswlib file-open failures when the project lives under Chinese paths.
    runtimeDataDir: process.env.UHE_RUNTIME_DIR || DEFAULT_RUNTIME_DATA_DIR,
    // Binary HNSW index file used at runtime.
    vectorIndexPath:
        process.env.VECTOR_INDEX_PATH ||
        path.join(process.env.UHE_RUNTIME_DIR || DEFAULT_RUNTIME_DATA_DIR, 'vector_index_v5.bin'),
    // Source documents associated with the vector index.
    documentsPath:
        process.env.DOCUMENTS_PATH ||
        path.join(process.env.UHE_RUNTIME_DIR || DEFAULT_RUNTIME_DATA_DIR, 'documents_v5.json'),
};

// --- Configuration Loading ---
let appConfig;
try {
    const configPath = path.join(__dirname, 'config.js');
    const configFileContent = fs.readFileSync(configPath, 'utf8');
    
    const context = {
        module: { exports: {} }
    };
    vm.createContext(context); 

    const scriptToRun = new vm.Script(`
        ${configFileContent}
        module.exports = appConfig; 
    `);

    scriptToRun.runInContext(context); 
    appConfig = context.module.exports;

    if (!appConfig || !appConfig.ALLOWED_ORIGINS) {
        throw new Error("appConfig or appConfig.ALLOWED_ORIGINS is not defined in config.js");
    }

    console.log("✅ Configuration loaded successfully.");
    console.log(`   - Mode: ${appConfig.API_ENDPOINT.includes('localhost') ? 'Development' : 'Production'}`);
    console.log(`   - Allowed Origins: ${appConfig.ALLOWED_ORIGINS.join(', ')}`);
} catch (error) {
    console.error("FATAL: Could not load or parse config.js. Please ensure the file exists and is correct.", error);
    process.exit(1);
}

// --- 模型配置 ---
const LLM_MODEL = SERVER_CONFIG.llmModel;
const EMBEDDING_MODEL = SERVER_CONFIG.embeddingModel;
const DIMENSIONS = SERVER_CONFIG.dimensions;
const BATCH_SIZE = SERVER_CONFIG.batchSize;
const PORT = SERVER_CONFIG.port;
const QWEN_API_KEY = SERVER_CONFIG.apiKey;
const API_ENDPOINT = SERVER_CONFIG.chatEndpoint;
const EMBEDDING_API_ENDPOINT = SERVER_CONFIG.embeddingEndpoint;
const VECTOR_INDEX_PATH = SERVER_CONFIG.vectorIndexPath;
const DOCUMENTS_PATH = SERVER_CONFIG.documentsPath;

const app = express();

// --- CORS Configuration: Use settings from config.js ---
const corsOptions = {
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        if (appConfig.ALLOWED_ORIGINS.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error(`CORS policy violation: The origin '${origin}' is not allowed.`));
        }
    }
};

app.use(cors(corsOptions));
app.use(express.json());

let vectorIndex;
let documents = [];

function ensureDirectorySync(dirPath) {
    fs.mkdirSync(dirPath, { recursive: true });
}

function syncArtifactIfNeeded(sourcePath, targetPath) {
    if (!fs.existsSync(sourcePath)) {
        return false;
    }

    ensureDirectorySync(path.dirname(targetPath));

    if (!fs.existsSync(targetPath)) {
        fs.copyFileSync(sourcePath, targetPath);
        return true;
    }

    const sourceStat = fs.statSync(sourcePath);
    const targetStat = fs.statSync(targetPath);
    const hasChanged =
        sourceStat.size !== targetStat.size ||
        Math.abs(sourceStat.mtimeMs - targetStat.mtimeMs) > 1;

    if (hasChanged) {
        fs.copyFileSync(sourcePath, targetPath);
        return true;
    }

    return false;
}

function prepareRuntimeArtifacts() {
    if (!NEEDS_ASCII_RUNTIME_DIR) {
        return;
    }

    ensureDirectorySync(SERVER_CONFIG.runtimeDataDir);

    const copiedIndex = syncArtifactIfNeeded(PROJECT_VECTOR_INDEX_PATH, VECTOR_INDEX_PATH);
    const copiedDocuments = syncArtifactIfNeeded(PROJECT_DOCUMENTS_PATH, DOCUMENTS_PATH);

    if (copiedIndex || copiedDocuments) {
        console.log(`Mirrored AI runtime artifacts to ${SERVER_CONFIG.runtimeDataDir}`);
    }
}

function persistRuntimeArtifacts() {
    if (!NEEDS_ASCII_RUNTIME_DIR) {
        return;
    }

    if (fs.existsSync(VECTOR_INDEX_PATH)) {
        fs.copyFileSync(VECTOR_INDEX_PATH, PROJECT_VECTOR_INDEX_PATH);
    }

    if (fs.existsSync(DOCUMENTS_PATH)) {
        fs.copyFileSync(DOCUMENTS_PATH, PROJECT_DOCUMENTS_PATH);
    }
}

// --- 核心工具函数 ---
// 【【【 CHANGE 1: 增强 fetchWithRetry 函数 】】】
// - 增加了对 429 (Too Many Requests) 状态码的重试处理。
// - 实现了指数退避策略 (exponential backoff)，让重试更智能，避免冲击API。
// - 将默认超时缩短到 30 秒，更快失败，提升用户体验。
async function fetchWithRetry(url, options, retries = 3, initialBackoff = 3000) {
    let backoff = initialBackoff;
    for (let i = 0; i < retries; i++) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), SERVER_CONFIG.requestTimeoutMs);
        try {
            const response = await fetch(url, { ...options, signal: controller.signal });
            
            if (!response.ok) {
                // 如果是服务器错误或API限流，并且还有重试次数，则等待后重试
                if ((response.status >= 500 || response.status === 429) && i < retries - 1) {
                    console.warn(`API returned status ${response.status}. Retrying in ${backoff / 1000}s...`);
                    await new Promise(res => setTimeout(res, backoff));
                    backoff *= 2; // 指数增加等待时间
                    continue;
                }
                throw new Error(`API request failed with status ${response.status}: ${await response.text()}`);
            }
            return response;
        } catch (error) {
            const errorCode = error.cause?.code || error.name;
            if (['AbortError', 'UND_ERR_CONNECT_TIMEOUT', 'ECONNRESET'].includes(errorCode)) {
                if (i < retries - 1) {
                    console.warn(`Fetch error (${errorCode}). Retrying attempt ${i + 2}/${retries} in ${backoff / 1000}s...`);
                    await new Promise(res => setTimeout(res, backoff));
                    backoff *= 2;
                    continue;
                } else {
                    console.error(`Fetch failed after ${retries} attempts.`);
                    throw error;
                }
            }
            throw error;
        } finally {
            clearTimeout(timeoutId);
        }
    }
}

async function getEmbeddings(texts) {
    const allEmbeddings = [];
    if (texts.length === 0) return allEmbeddings;
    
    console.log(`- Total texts to embed: ${texts.length}. Processing in batches of ${BATCH_SIZE}...`);
    
    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
        const batchTexts = texts.slice(i, i + BATCH_SIZE);
        console.log(`- Processing batch ${Math.floor(i / BATCH_SIZE) + 1} / ${Math.ceil(texts.length / BATCH_SIZE)} (size: ${batchTexts.length})`);
        
        const options = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${QWEN_API_KEY}` },
            body: JSON.stringify({
                model: EMBEDDING_MODEL,
                input: { texts: batchTexts },
                parameters: { text_type: "document" }
            })
        };
        
        const response = await fetchWithRetry(EMBEDDING_API_ENDPOINT, options);
        const data = await response.json();
        allEmbeddings.push(...data.output.embeddings.map(e => e.embedding));
    }
    
    return allEmbeddings;
}

async function generateSubQueries(userQuery, history = []) {
    console.log(`Generating sub-queries for: "${userQuery}"`);
    const conversation = history.map(h => `${h.role}: ${h.content}`).join('\n');
    
    const prompt = `
你是一个专门负责"人类帝国"档案库的智能搜索助手。你的任务是根据用户的最新问题和对话历史，生成 3 个不同的、用于向量检索的搜索查询。
核心指令:
理解上下文: 充分理解对话历史，确保生成的查询与用户的真实意图相关。
多样化视角: 从不同角度构建查询。
忠于世界观: 所有查询必须严格限定在原创的"人类帝国"世界观内。
简洁输出: 直接输出 3 个查询，每个查询占一行，不要添加编号或解释。
对话历史:
${conversation || '无历史记录'}
用户最新问题: "${userQuery}"
生成的3个搜索查询:`;
    
    const requestBody = { model: LLM_MODEL, messages: [{ role: 'system', content: prompt }], temperature: 0.2 };
    const response = await fetchWithRetry(API_ENDPOINT, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${QWEN_API_KEY}` }, body: JSON.stringify(requestBody)
    });
    const data = await response.json();
    const rawResponse = data.choices[0].message.content;
    const queries = rawResponse.split('\n').map(q => q.replace(/^[-\d.]+\s*/, '').trim()).filter(Boolean);

    if (!queries.includes(userQuery)) {
        queries.unshift(userQuery);
    }

    console.log(`Generated sub-queries:`, queries);
    return queries;
}

// 【【【 CHANGE 2: 新增批量、并行的向量搜索函数 】】】
// 这个函数接收一个查询数组，一次性获取所有查询的向量，然后并行在本地搜索。
async function searchVectorStoreBatched(queries, k = 10) {
    if (documents.length === 0 || queries.length === 0) return [];
    
    // 1. 一次性获取所有查询的 embeddings，这是关键的性能优化
    const queryEmbeddings = await getEmbeddings(queries);

    // 2. 在本地进行快速的 KNN 搜索
    const allResults = [];
    for (const embedding of queryEmbeddings) {
        const results = vectorIndex.searchKnn(embedding, k);
        const searchDocs = results.neighbors.map(docId => documents[docId]).filter(Boolean);
        allResults.push(...searchDocs);
    }

    // 3. 返回所有结果的扁平化数组
    return allResults;
}

async function loadAndIndexKnowledgeBase(HNSWLib) {
    console.log('Building new vector index with High-Precision Chunking...');
    vectorIndex = new HNSWLib('cosine', DIMENSIONS);
    const knowledgeSources = {};
    
    try {
        const dataJsPath = path.join(__dirname, 'data.js');
        const dataJsContent = fs.readFileSync(dataJsPath, 'utf8');
        const websiteDataString = dataJsContent.substring(dataJsContent.indexOf('{'));
        knowledgeSources.websiteData = new Function(`return ${websiteDataString}`)();
        console.log("✅ Successfully loaded: data.js");
        
        const mockWindow = { colorPalette: {} };
        const graphDataPath = path.join(__dirname, 'graph-data.js');
        const graphDataContent = fs.readFileSync(graphDataPath, 'utf8');
        new Function('window', graphDataContent)(mockWindow);
        knowledgeSources.graphData = { allCharacters: mockWindow.allCharactersData, soviet: mockWindow.sovietData };
        console.log("✅ Successfully loaded: graph-data.js");
        
        const novelsPath = path.join(__dirname, 'novels_data');
        knowledgeSources.novels = {};
        if (fs.existsSync(novelsPath)) {
            const novelFiles = fs.readdirSync(novelsPath).filter(file => file.endsWith('.json') && file !== 'manifest.json');
            novelFiles.forEach(file => {
                const novelId = path.basename(file, '.json');
                knowledgeSources.novels[novelId] = JSON.parse(fs.readFileSync(path.join(novelsPath, file), 'utf8'));
            });
            console.log(`✅ Successfully loaded: ${novelFiles.length} novel files from novels_data/`);
        }
    } catch (error) { 
        console.error("Fatal Error: Failed to load knowledge sources:", error); 
        process.exit(1); 
    }
    
    let docId = 0;
    const stripHtml = (text) => text ? text.replace(/\[.*?\|.*?\]/g, '').replace(/<[^>]*>/g, '') : '';
    
    for (const category in knowledgeSources.websiteData) {
        const categoryData = knowledgeSources.websiteData[category];
        for (const type in categoryData) {
            const items = categoryData[type];
            items.forEach(item => {
                const title = item.title || item.name || `${type}档案`;
                const text1 = `"${title}"的摘要信息 ([${type}]档案, 分类: ${category}): ${stripHtml(item.content || item.description || '')}`;
                documents.push({ id: docId++, text: text1, full_text: text1, metadata: { source: `${type}档案` } });
                
                const fullContent = stripHtml(item.fullContent || item.longDescription || item.content || '');
                if (fullContent && fullContent !== stripHtml(item.content || '')) {
                    const text2 = `关于"${title}"的完整描述: ${fullContent}`;
                    documents.push({ id: docId++, text: text2, full_text: text2, metadata: { source: `${type}档案` } });
                }
            });
        }
    }
    
    if (knowledgeSources.graphData) {
        knowledgeSources.graphData.allCharacters.nodes.forEach(node => {
            const text = `"${node.name}"的人物档案条目。`;
            documents.push({ id: docId++, text: text, full_text: text, metadata: { source: "人物关系图谱" } });
        });
        
        knowledgeSources.graphData.allCharacters.links.forEach(link => {
            const text = `关于"${link.source}"的关系描述: ${link.source} 与 ${link.target}之间的关系是"${link.value}"。`;
            documents.push({ id: docId++, text: text, full_text: text, metadata: { source: "人物关系图谱" } });
        });
    }
    
    for (const novelId in knowledgeSources.novels) {
        const novel = knowledgeSources.novels[novelId];
        novel.chapters.forEach(chapter => {
            chapter.paragraphs.forEach(p => {
                const text = `在小说《${novel.title}》的章节"${chapter.title}"中提到: ${stripHtml(p.text)}`;
                documents.push({ 
                    id: docId++, 
                    text: text, 
                    full_text: text, 
                    metadata: { ref: `[REF:${novelId}:${p.id}]`, source: `小说《${novel.title}》` } 
                });
            });
        });
    }
    
    console.log(`Total high-precision chunks created: ${documents.length}.`);
    if (documents.length === 0) return;
    
    vectorIndex.initIndex(documents.length);
    const allTexts = documents.map(doc => doc.text);
    console.log(`Requesting embeddings for all ${allTexts.length} documents using ${EMBEDDING_MODEL}...`);
    const allEmbeddings = await getEmbeddings(allTexts);
    console.log('Embeddings received. Adding to HNSW index...');
    allEmbeddings.forEach((embedding, i) => vectorIndex.addPoint(embedding, documents[i].id));
    await vectorIndex.writeIndex(VECTOR_INDEX_PATH);
    fs.writeFileSync(DOCUMENTS_PATH, JSON.stringify(documents));
    persistRuntimeArtifacts();
    console.log(`✅ Vector index built and saved to ${VECTOR_INDEX_PATH}!`);
}

async function main() {
    let HNSWLib;
    try {
        const hnswlib = await import('hnswlib-node');
        HNSWLib = hnswlib?.HierarchicalNSW || hnswlib?.default?.HierarchicalNSW;
        if (!HNSWLib) { throw new Error('Failed to load HierarchicalNSW from hnswlib-node.'); }
    } catch (e) {
        console.error("Could not import hnswlib-node.", e);
        process.exit(1);
    }

    prepareRuntimeArtifacts();
    
    if (fs.existsSync(VECTOR_INDEX_PATH) && fs.existsSync(DOCUMENTS_PATH)) {
        console.log(`Loading existing V5 index from ${VECTOR_INDEX_PATH}...`);
        vectorIndex = new HNSWLib('cosine', DIMENSIONS);
        await vectorIndex.readIndex(VECTOR_INDEX_PATH);
        documents = JSON.parse(fs.readFileSync(DOCUMENTS_PATH, 'utf-8'));
        console.log(`✅ Index and ${documents.length} documents loaded.`);
    } else {
        await loadAndIndexKnowledgeBase(HNSWLib);
    }
    
    app.listen(PORT, () => { console.log(`✅ AI backend server running at http://localhost:${PORT}`); });
}

app.post('/api/chat', async (req, res) => {
    const { query, history = [] } = req.body;
    if (!query) return res.status(400).json({ error: 'Query is required.' });
    
    try {
        const subQueries = await generateSubQueries(query, history);

        // 【【【 CHANGE 3: 使用新的批量搜索函数替换旧的循环 】】】
        // 原来的串行循环被替换为一次高效的并行调用
        const searchResults = await searchVectorStoreBatched(subQueries);
        
        const uniqueDocsMap = new Map();
        searchResults.forEach(doc => { // searchResults 已经是扁平数组
            if (doc && doc.id !== undefined && !uniqueDocsMap.has(doc.id)) {
                uniqueDocsMap.set(doc.id, doc);
            }
        });
        const relevantDocs = Array.from(uniqueDocsMap.values());
        console.log(`Retrieved ${relevantDocs.length} unique documents from ${subQueries.length} sub-queries for query: "${query}"`);

        const relevantKnowledge = relevantDocs.map(doc => `[Source: ${doc.metadata.source}]\n${doc.full_text}\n${doc.metadata.ref || ''}`).join('\n\n---\n\n');

        const systemPrompt = `You are a "Human Empire Central Archives" AI expert. Your task is to act as an expert analyst. You will be given a user's question and a collection of potentially relevant document snippets from the archives. Your job is to carefully read all snippets, find the necessary information, and synthesize it into a **comprehensive, detailed, and well-structured answer**.
Core Rules:
Strictly Adhere to Provided Information: Your answer MUST be based SOLELY on the [Relevant Information]. Do NOT use external knowledge.
Handle Insufficient Information: If, after reading all snippets, you find the information is not sufficient to answer, you MUST respond with: "根据档案库的现有资料，我无法回答这个问题。"
Cite Sources Correctly: You MUST ONLY cite sources that come from a novel. These sources will have a specific reference tag (e.g., [REF:novel-name:p-123]). Append this tag at the end of the relevant sentence. Do NOT create reference tags for non-novel sources like "人物关系图谱" or "组织".
Focus on the Subject: When asked about a specific person (e.g., "李臻一"), your answer MUST strictly focus on that person. Do NOT mix facts or attributes between different people mentioned in the context.
[Relevant Information]
${relevantKnowledge || '无相关信息'}
`;

        console.log(`Generating final answer directly from ${relevantDocs.length} unique documents for query: "${query}"`);

        const messages = [
            { role: 'system', content: systemPrompt },
            ...history,
            { role: 'user', content: query }
        ];

        const requestBody = { model: LLM_MODEL, messages: messages };
        const apiResponse = await fetchWithRetry(API_ENDPOINT, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${QWEN_API_KEY}` }, body: JSON.stringify(requestBody)
        });
        const responseData = await apiResponse.json();
        const aiText = responseData.choices[0].message.content;
        res.json({ output: { text: aiText } });

    } catch (error) {
        // 增加更详细的错误日志，方便排查是哪个用户的请求出了问题
        console.error(`Error during chat processing for query "${query}":`, error);
        res.status(503).json({ output: { text: '抱歉，AI服务暂时遇到网络问题，请稍后再试。' } });
    }
});

main();
