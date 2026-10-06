/**
 * Maktaba Portable — سطح المكتب (Electron)
 * يشغّل الـ API محليًا ويفتح نافذة برنامج.
 */
const { app, BrowserWindow, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const http = require('http');

function resolveRoot() {
  // أثناء التطوير: مجلد المشروع. بعد التغليف: resources/maktaba
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'maktaba');
  }
  return path.join(__dirname, '..');
}

const ROOT = resolveRoot();
const API_DIR = path.join(ROOT, 'apps', 'api');
const WEB_DIST = path.join(ROOT, 'apps', 'web', 'dist');
const DATA_DIR = path.join(ROOT, 'data');
const BACKUPS_DIR = path.join(ROOT, 'backups');
const DB_FILE = path.join(DATA_DIR, 'maktaba.db');
const PORT = Number(process.env.PORT || 3000);
const APP_URL = `http://127.0.0.1:${PORT}`;

let mainWindow = null;
let apiProcess = null;
let shuttingDown = false;

// سلوك برنامج ويندوز عادي: نسخة واحدة + تجميع في شريط المهام
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}
if (process.platform === 'win32') {
  app.setAppUserModelId('com.maktaba.portable');
}



function ensureDirs() {
  for (const d of [DATA_DIR, BACKUPS_DIR]) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  }
}

function waitForApi(maxMs = 90000) {
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
        reject(new Error('انتهت مهلة انتظار الخادم المحلي. تأكد من اكتمال البناء (build-desktop.bat).'));
        return;
      }
      setTimeout(tryOnce, 400);
    };
    tryOnce();
  });
}


function killPort3000() {
  if (process.platform !== 'win32') return;
  try {
    const { execSync } = require('child_process');
    // مزامنة: انتظر انتهاء القتل قبل تشغيل API جديد (تجنب قتل العملية الجديدة)
    execSync(
      'powershell.exe -NoProfile -Command "Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"',
      { windowsHide: true, stdio: 'ignore', timeout: 8000 },
    );
  } catch (_) {}
}

function startApi() {
  // Prisma على ويندوز يحتاج مسارًا بشرطات مائلة
  const dbUrl =
    process.env.DATABASE_URL ||
    `file:${String(DB_FILE).replace(/\\/g, '/')}`;

  const env = {
    ...process.env,
    PORT: String(PORT),
    NODE_ENV: 'production',
    WEB_DIST: WEB_DIST,
    DATABASE_URL: dbUrl,
    JWT_SECRET: process.env.JWT_SECRET || 'portable-desktop-change-me-in-production',
    CORS_ORIGINS: APP_URL,
  };

  killPort3000();
  // انتظار قصير بعد تحرير المنفذ
  try { require('child_process').execSync('timeout /t 1 /nobreak >nul', { stdio: 'ignore', windowsHide: true }); } catch (_) {}
  // مزامنة .env حتى لا يتجاوز dotenv مسارًا خاطئًا
  try {
    const envPath = path.join(API_DIR, '.env');
    const lines = [
      `DATABASE_URL="${dbUrl}"`,
      `PORT=${PORT}`,
      `JWT_SECRET="${env.JWT_SECRET}"`,
      'NODE_ENV=production',
    ];
    fs.writeFileSync(envPath, lines.join('\n') + '\n', 'utf8');
  } catch (_) {}
  const distMain = path.join(API_DIR, 'dist', 'main.js');
  const useDist = fs.existsSync(distMain);

  if (useDist) {
    // يجب تشغيل الـ API بـ Node وليس بـ electron.exe
    const nodeCmd = process.platform === 'win32' ? 'node.exe' : 'node';
    apiProcess = spawn(nodeCmd, [distMain], {
      cwd: API_DIR,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
      windowsHide: true,
    });
  } else {
    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    apiProcess = spawn(npmCmd, ['run', 'start:dev'], {
      cwd: API_DIR,
      env: { ...env, NODE_ENV: 'development' },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
      windowsHide: true,
    });
  }

  let apiErrLog = '';
  apiProcess.stdout?.on('data', (d) => {
    const s = String(d);
    process.stdout.write(`[api] ${s}`);
    apiErrLog += s;
  });
  apiProcess.stderr?.on('data', (d) => {
    const s = String(d);
    process.stderr.write(`[api] ${s}`);
    apiErrLog += s;
    try {
      fs.appendFileSync(path.join(DATA_DIR, 'api-error.log'), s);
    } catch (_) {}
  });
  apiProcess.on('exit', (code) => {
    apiProcess = null;
    if (!shuttingDown) {
      try {
        fs.appendFileSync(
          path.join(DATA_DIR, 'api-error.log'),
          `\n[exit code ${code}] ${new Date().toISOString()}\n`,
        );
      } catch (_) {}
      const hint =
        code === 1
          ? '\n\nغالبًا المنفذ 3000 مشغول أو مشكلة في قاعدة البيانات.\nأقفل أي نسخة قديمة من Maktaba ثم أعد التشغيل.\nالتفاصيل: data/api-error.log'
          : '';
      dialog.showErrorBox(
        'Maktaba',
        `توقف الخادم المحلي (رمز ${code}). أعد تشغيل التطبيق.${hint}`,
      );
    }
  });
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

async function doBackup() {
  ensureDirs();
  if (!fs.existsSync(DB_FILE)) {
    dialog.showErrorBox('نسخ احتياطي', 'لا يوجد ملف قاعدة بيانات بعد. شغّل seed أو استخدم البرنامج أولًا.');
    return;
  }
  const defaultName = `maktaba-backup-${stamp()}.db`;
  const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
    title: 'حفظ نسخة احتياطية',
    defaultPath: path.join(BACKUPS_DIR, defaultName),
    filters: [{ name: 'SQLite Database', extensions: ['db'] }],
  });
  if (canceled || !filePath) return;
  try {
    fs.copyFileSync(DB_FILE, filePath);
    // نسخة إضافية داخل مجلد backups
    try {
      fs.copyFileSync(DB_FILE, path.join(BACKUPS_DIR, defaultName));
    } catch (_) {}
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'تم النسخ',
      message: 'تم حفظ النسخة الاحتياطية بنجاح.',
      detail: filePath,
    });
  } catch (e) {
    dialog.showErrorBox('فشل النسخ', String(e.message || e));
  }
}

async function doRestore() {
  const { filePaths, canceled } = await dialog.showOpenDialog(mainWindow, {
    title: 'استعادة من نسخة احتياطية',
    filters: [{ name: 'SQLite Database', extensions: ['db'] }],
    properties: ['openFile'],
  });
  if (canceled || !filePaths?.[0]) return;
  const src = filePaths[0];
  const confirm = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    buttons: ['إلغاء', 'استعادة'],
    defaultId: 0,
    cancelId: 0,
    title: 'تأكيد الاستعادة',
    message: 'ستُستبدل قاعدة البيانات الحالية بالكامل.',
    detail: 'يُفضّل إغلاق العمليات الجارية. بعد الاستعادة أعد تشغيل التطبيق.',
  });
  if (confirm.response !== 1) return;
  try {
    ensureDirs();
    if (fs.existsSync(DB_FILE)) {
      fs.copyFileSync(DB_FILE, path.join(BACKUPS_DIR, `before-restore-${stamp()}.db`));
    }
    fs.copyFileSync(src, DB_FILE);
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'تمت الاستعادة',
      message: 'تمت استعادة القاعدة. أعد تشغيل التطبيق الآن.',
    });
  } catch (e) {
    dialog.showErrorBox('فشل الاستعادة', String(e.message || e));
  }
}

function openGuide() {
  const candidates = [
    path.join(ROOT, 'دليل-الاستخدام.md'),
    path.join(ROOT, 'GUIDE-AR.txt'),
    path.join(ROOT, 'README.md'),
  ];
  const f = candidates.find((c) => fs.existsSync(c));
  if (f) shell.openPath(f);
  else dialog.showMessageBox(mainWindow, { type: 'info', message: 'ضع ملف دليل-الاستخدام.md في مجلد البرنامج.' });
}

function buildMenu() {
  const template = [
    {
      label: 'ملف',
      submenu: [
        { label: 'نسخ احتياطي للبيانات…', click: () => void doBackup() },
        { label: 'استعادة من نسخة…', click: () => void doRestore() },
        { type: 'separator' },
        {
          label: 'فتح مجلد البيانات',
          click: () => {
            ensureDirs();
            shell.openPath(DATA_DIR);
          },
        },
        {
          label: 'فتح مجلد النسخ الاحتياطي',
          click: () => {
            ensureDirs();
            shell.openPath(BACKUPS_DIR);
          },
        },
        { type: 'separator' },
        { role: 'quit', label: 'خروج' },
      ],
    },
    {
      label: 'عرض',
      submenu: [
        { role: 'reload', label: 'إعادة تحميل' },
        { role: 'toggleDevTools', label: 'أدوات المطوّر' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'حجم افتراضي' },
        { role: 'zoomIn', label: 'تكبير' },
        { role: 'zoomOut', label: 'تصغير' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'ملء الشاشة' },
      ],
    },
    {
      label: 'مساعدة',
      submenu: [
        { label: 'دليل الاستخدام', click: () => openGuide() },
        {
          label: 'عن البرنامج',
          click: () =>
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'Maktaba',
              message: 'نظام إدارة المكتبة والخدمات',
              detail: 'إصدار Portable 1.0 — سطح مكتب + SQLite محلي',
            }),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    title: 'مكتبة — نظام إدارة المركز',
    backgroundColor: '#0f766e',
    autoHideMenuBar: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  mainWindow.webContents.session.clearCache().catch(() => {});
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents
      .executeJavaScript(`
        (async function(){
          try {
            if ('serviceWorker' in navigator) {
              const regs = await navigator.serviceWorker.getRegistrations();
              for (const r of regs) await r.unregister();
            }
            if (window.caches) {
              const keys = await caches.keys();
              for (const k of keys) await caches.delete(k);
            }
          } catch (e) {}
        })();
      `)
      .catch(() => {});
  });

  mainWindow.loadURL(APP_URL);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const u = String(url || '');
    if (!u || u === 'about:blank' || u.startsWith('about:')) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 900,
          height: 700,
          autoHideMenuBar: true,
          webPreferences: { nodeIntegration: false, contextIsolation: true },
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
  ensureDirs();
  buildMenu();

  if (!fs.existsSync(WEB_DIST) || !fs.existsSync(path.join(WEB_DIST, 'index.html'))) {
    dialog.showErrorBox(
      'Maktaba',
      'الواجهة غير مبنية.\nشغّل build-desktop.bat أو refresh-ui.bat ثم أعد المحاولة.',
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
