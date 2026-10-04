/**
 * Maktaba Portable — سطح المكتب (Electron)
 * يشغّل الـ API محليًا ويفتح نافذة برنامج (بدون متصفح خارجي).
 */
const { app, BrowserWindow, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const API_DIR = path.join(ROOT, 'apps', 'api');
const WEB_DIST = path.join(ROOT, 'apps', 'web', 'dist');
const DATA_DIR = path.join(ROOT, 'data');
const PORT = Number(process.env.PORT || 3000);
const APP_URL = `http://127.0.0.1:${PORT}`;

let mainWindow = null;
let apiProcess = null;
let shuttingDown = false;

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function waitForApi(maxMs = 60000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const req = http.get(`${APP_URL}/api/health`, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) resolve();
        else retry();
      });
      req.on('error', retry);
      req.setTimeout(2000, () => {
        req.destroy();
        retry();
      });
    };
    const retry = () => {
      if (Date.now() - start > maxMs) {
        reject(new Error('انتهت مهلة انتظار الخادم المحلي'));
        return;
      }
      setTimeout(tryOnce, 400);
    };
    tryOnce();
  });
}

function startApi() {
  const env = {
    ...process.env,
    PORT: String(PORT),
    NODE_ENV: 'production',
    WEB_DIST: WEB_DIST,
    DATABASE_URL: process.env.DATABASE_URL || `file:${path.join(DATA_DIR, 'maktaba.db')}`,
    JWT_SECRET: process.env.JWT_SECRET || 'portable-desktop-change-me-in-production',
    CORS_ORIGINS: APP_URL,
  };

  const distMain = path.join(API_DIR, 'dist', 'main.js');
  const useDist = fs.existsSync(distMain);

  if (useDist) {
    apiProcess = spawn(process.execPath, [distMain], {
      cwd: API_DIR,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } else {
    // تطوير: nest عبر npx
    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    apiProcess = spawn(npmCmd, ['run', 'start:dev'], {
      cwd: API_DIR,
      env: { ...env, NODE_ENV: 'development' },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
    });
  }

  apiProcess.stdout?.on('data', (d) => process.stdout.write(`[api] ${d}`));
  apiProcess.stderr?.on('data', (d) => process.stderr.write(`[api] ${d}`));
  apiProcess.on('exit', (code) => {
    apiProcess = null;
    if (!shuttingDown && mainWindow) {
      dialog.showErrorBox('Maktaba', `توقف الخادم المحلي (رمز ${code}). أعد تشغيل التطبيق.`);
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    title: 'مكتبة — نظام إدارة المركز',
    backgroundColor: '#0f766e',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  mainWindow.loadURL(APP_URL);

  // السماح بنوافذ الطباعة (about:blank) — ومنع فتح روابط خارجية في المتصفح إلا http(s)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const u = String(url || '');
    if (!u || u === 'about:blank' || u.startsWith('about:')) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 900,
          height: 700,
          autoHideMenuBar: true,
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
          },
        },
      };
    }
    if (u.startsWith('http://') || u.startsWith('https://')) {
      shell.openExternal(u);
    }
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function boot() {
  ensureDataDir();

  if (!fs.existsSync(WEB_DIST) || !fs.existsSync(path.join(WEB_DIST, 'index.html'))) {
    dialog.showErrorBox(
      'Maktaba',
      'واجهة التطبيق غير مبنية.\nشغّل مرة واحدة: build-desktop.bat\nأو من الطرفية: npm run build:desktop',
    );
    app.quit();
    return;
  }

  startApi();

  try {
    await waitForApi();
  } catch (e) {
    dialog.showErrorBox('Maktaba', String(e.message || e));
    cleanup();
    app.quit();
    return;
  }

  createWindow();
}

function cleanup() {
  shuttingDown = true;
  if (apiProcess && !apiProcess.killed) {
    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(apiProcess.pid), '/f', '/t'], { shell: true });
      } else {
        apiProcess.kill('SIGTERM');
      }
    } catch (_) {}
    apiProcess = null;
  }
}

app.whenReady().then(boot);

app.on('window-all-closed', () => {
  cleanup();
  app.quit();
});

app.on('before-quit', cleanup);
