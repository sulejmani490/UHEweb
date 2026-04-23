// watcher.js - V3.0 (Windows 强力杀进程 + 冷却缓冲版)
import chokidar from 'chokidar';
import { spawn, exec } from 'child_process'; // 引入 exec 用于执行系统命令
import fs from 'fs';
import crypto from 'node:crypto'; 
import path from 'path';
import { fileURLToPath } from 'url';

// --- ⚙️ 配置区域 ---
const WATCH_DIR = './novels_data';
const SERVER_SCRIPT = 'server.js'; 

// --- 🔧 内部变量 ---
let serverProcess = null;
let fileHashes = new Map();
let isRestarting = false;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 1. 核心：启动/重启服务器函数
const startServer = () => {
    if (isRestarting) return;

    if (serverProcess) {
        isRestarting = true;
        console.log('🔄 [自动监控] 检测到变化，正在清理旧进程...');

        const pid = serverProcess.pid;

        // === 监听退出事件 ===
        serverProcess.removeAllListeners('close'); 
        serverProcess.on('close', (code) => {
            console.log('💀 [自动监控] 进程已终止。等待端口释放 (1s)...');
            serverProcess = null;
            
            // === 关键修改：强制等待 1 秒 ===
            // 给 Windows 一点时间回收 3000 端口
            setTimeout(() => {
                isRestarting = false;
                spawnNewProcess();
            }, 1000); 
        });

        // === 关键修改：Windows 专用杀进程逻辑 ===
        if (process.platform === 'win32') {
            // /T = Tree (杀掉进程树，包括子进程)
            // /F = Force (强制杀死)
            exec(`taskkill /pid ${pid} /T /F`, (err) => {
                if (err) {
                    // 如果进程已经没了，taskkill 可能会报错，这种情况忽略即可
                    // console.log('Taskkill message:', err.message);
                }
            });
        } else {
            // Mac/Linux 使用标准信号
            serverProcess.kill('SIGTERM'); 
        }
        
    } else {
        // 第一次启动
        spawnNewProcess();
    }
};

// 2. 具体的启动子进程逻辑
const spawnNewProcess = () => {
    console.log('🚀 [自动监控] 启动新服务器...');
    
    serverProcess = spawn('node', [SERVER_SCRIPT], { 
        stdio: 'inherit',
        shell: true 
    });

    serverProcess.on('close', (code) => {
        if (code !== 0 && code !== null && !isRestarting) {
            console.log(`⚠️ [服务器] 意外崩溃/退出，代码: ${code}`);
            serverProcess = null;
        }
    });
};

// 3. 计算文件 MD5
const getFileHash = (filePath) => {
    try {
        if (!fs.existsSync(filePath)) return null;
        const fileBuffer = fs.readFileSync(filePath);
        const hashSum = crypto.createHash('md5');
        hashSum.update(fileBuffer);
        return hashSum.digest('hex');
    } catch (e) {
        return null; 
    }
};

// 4. 初始化监控
const watcher = chokidar.watch(WATCH_DIR, {
    persistent: true,
    ignoreInitial: false, 
    awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100
    }
});

console.log(`QC [自动监控] 正在严密监视目录: ${path.resolve(WATCH_DIR)}`);

// --- 📡 事件监听 ---

watcher.on('add', (filePath) => {
    const hash = getFileHash(filePath);
    if (hash) {
        if (!fileHashes.has(filePath)) {
            fileHashes.set(filePath, hash);
            if (serverProcess) { 
                console.log(`PY [自动监控] 检测到新文件: ${path.basename(filePath)}`);
                startServer();
            }
        }
    }
});

watcher.on('ready', () => {
    console.log('✅ [自动监控] 初始化扫描完成，服务启动中...');
    startServer();

    watcher.on('change', (filePath) => {
        const newHash = getFileHash(filePath);
        const oldHash = fileHashes.get(filePath);
        
        if (newHash && newHash !== oldHash) {
            fileHashes.set(filePath, newHash);
            const time = new Date().toLocaleTimeString();
            console.log(`📝 [自动监控] ${time} 文件变更: ${path.basename(filePath)}`);
            startServer();
        }
    });

    watcher.on('unlink', (filePath) => {
        fileHashes.delete(filePath);
        console.log(`🗑️ [自动监控] 文件被删除: ${path.basename(filePath)}`);
        startServer();
    });
});