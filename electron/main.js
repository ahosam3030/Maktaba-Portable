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
  // كود البرنامج (API + واجهة): بعد التغليف في resources، التطوير = جذر المشروع
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'maktaba');
  }
  return path.join(__dirname, '..');
}

/** بيانات العميل دائمًا خارج مجلد التثبيت حتى لا تُمس عند التحديث/الإلغاء */
function resolveUserDataRoot() {
  try {
    return path.join(app.getPath('userData'), 'maktaba-data');
  } catch (_) {
    return path.join(resolveRoot(), 'data');
  }
}

const ROOT = resolveRoot();
const API_DIR = path.join(ROOT, 'apps', 'api');
const WEB_DIST = path.join(ROOT, 'apps', 'web', 'dist');
let DATA_DIR = path.join(ROOT, 'data');
let BACKUPS_DIR = path.join(ROOT, 'backups');
let DB_FILE = path.join(DATA_DIR, 'maktaba.db');
let UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
let CONFIG_FILE = path.join(DATA_DIR, 'config.json');
let PORT = Number(process.env.PORT || 3000);
let APP_URL = `http://127.0.0.1:${PORT}`;

function initUserPaths() {
  DATA_DIR = resolveUserDataRoot();
  BACKUPS_DIR = path.join(DATA_DIR, 'backups');
  DB_FILE = path.join(DATA_DIR, 'maktaba.db');
  UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
  CONFIG_FILE = path.join(DATA_DIR, 'config.json');
}

function loadOrCreateConfig() {
  ensureDirs();
  const crypto = require('crypto');
  let cfg = {};
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }
  } catch (_) {
    cfg = {};
  }
  let changed = false;
  if (!cfg.jwtSecret || String(cfg.jwtSecret).length < 32) {
    cfg.jwtSecret = crypto.randomBytes(32).toString('hex');
    changed = true;
  }
  if (!cfg.licenseSecret || String(cfg.licenseSecret).length < 32) {
    cfg.licenseSecret = crypto.randomBytes(32).toString('hex');
    changed = true;
  }
  if (!cfg.port) {
    cfg.port = 3000;
    changed = true;
  }
  if (changed) {
    try {
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8');
    } catch (_) {}
  }
  PORT = Number(cfg.port) || 3000;
  APP_URL = `http://127.0.0.1:${PORT}`;
  return cfg;
}

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




function autoBackupDaily() {
  try {
    ensureDirs();
    if (!fs.existsSync(DB_FILE)) return;
    const day = new Date().toISOString().slice(0, 10);
    const dest = path.join(BACKUPS_DIR, `auto-${day}.db`);
    if (fs.existsSync(dest)) return;
    fs.copyFileSync(DB_FILE, dest);
    // احتفظ بآخر 14 نسخة تلقائية
    const autos = fs
      .readdirSync(BACKUPS_DIR)
      .filter((f) => f.startsWith('auto-') && f.endsWith('.db'))
      .sort();
    while (autos.length > 14) {
      const old = autos.shift();
      try {
        fs.unlinkSync(path.join(BACKUPS_DIR, old));
      } catch (_) {}
    }
  } catch (_) {}
}

function ensureDirs() {
  for (const d of [DATA_DIR, BACKUPS_DIR, UPLOADS_DIR]) {
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



function isPortFree(port) {
  return new Promise((resolve) => {
    const net = require('net');
    const s = net.createServer();
    s.once('error', () => resolve(false));
    s.once('listening', () => s.close(() => resolve(true)));
    s.listen(port, '127.0.0.1');
  });
}

async function pickPort(preferred) {
  for (const p of [preferred, 3000, 3847, 4711, 5123, 8765]) {
    if (await isPortFree(p)) return p;
  }
  return preferred;
}

/** تشغيل سكربت Node عبر ثنائي Electron (لا يحتاج Node.js عند العميل) */
function spawnAsNode(scriptArgs, opts = {}) {
  const electronPath = process.execPath;
  const env = { ...(opts.env || process.env), ELECTRON_RUN_AS_NODE: '1' };
  return spawn(electronPath, scriptArgs, {
    ...opts,
    env,
    shell: false,
    windowsHide: true,
  });
}

function spawnAsNodeSync(scriptArgs, opts = {}) {
  const { spawnSync } = require('child_process');
  const electronPath = process.execPath;
  const env = { ...(opts.env || process.env), ELECTRON_RUN_AS_NODE: '1' };
  return spawnSync(electronPath, scriptArgs, {
    ...opts,
    env,
    shell: false,
    windowsHide: true,
    encoding: 'utf8',
  });
}

function ensureDatabase(env) {
  const prismaCli = path.join(API_DIR, 'node_modules', 'prisma', 'build', 'index.js');
  if (!fs.existsSync(prismaCli)) {
    console.warn('prisma CLI missing — skip db push');
    return;
  }
  const r = spawnAsNodeSync([prismaCli, 'db', 'push', '--skip-generate', '--accept-data-loss'], {
    cwd: API_DIR,
    env,
    timeout: 120000,
  });
  if (r.status !== 0) {
    const msg = (r.stderr || r.stdout || '').toString().slice(0, 800);
    console.error('prisma db push failed', msg);
    throw new Error('تعذر تجهيز قاعدة البيانات.\n' + msg);
  }
}

function stopApiSync() {
  if (!apiProcess || apiProcess.killed) return;
  try {
    if (process.platform === 'win32' && apiProcess.pid) {
      spawn('taskkill', ['/pid', String(apiProcess.pid), '/f', '/t'], { shell: true, windowsHide: true });
    } else {
      apiProcess.kill('SIGTERM');
    }
  } catch (_) {}
  apiProcess = null;
  // انتظر تحرير الملف
  try {
    require('child_process').execSync(process.platform === 'win32' ? 'timeout /t 2 /nobreak >nul' : 'sleep 2', {
      stdio: 'ignore',
      windowsHide: true,
    });
  } catch (_) {}
}

async function startApi(cfg) {
  const dbUrl = `file:${String(DB_FILE).replace(/\\\\/g, '/')}`;
  PORT = await pickPort(Number(cfg.port) || 3000);
  cfg.port = PORT;
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8');
  } catch (_) {}
  APP_URL = `http://127.0.0.1:${PORT}`;

  const env = {
    ...process.env,
    PORT: String(PORT),
    NODE_ENV: 'production',
    WEB_DIST: WEB_DIST,
    DATABASE_URL: dbUrl,
    JWT_SECRET: cfg.jwtSecret,
    LICENSE_SECRET: cfg.licenseSecret,
    UPLOADS_DIR: UPLOADS_DIR,
    CORS_ORIGINS: `${APP_URL},http://127.0.0.1:${PORT},http://localhost:${PORT}`,
    ALLOW_LICENSE_ISSUE: process.env.ALLOW_LICENSE_ISSUE || 'NO',
    ELECTRON_RUN_AS_NODE: '1',
  };

  try {
    const envPath = path.join(API_DIR, '.env');
    fs.writeFileSync(
      envPath,
      [
        `DATABASE_URL="${dbUrl}"`,
        `PORT=${PORT}`,
        `JWT_SECRET="${cfg.jwtSecret}"`,
        `LICENSE_SECRET="${cfg.licenseSecret}"`,
        `UPLOADS_DIR="${String(UPLOADS_DIR).replace(/\\\\/g, '/')}"`,
        'NODE_ENV=production',
        'ALLOW_LICENSE_ISSUE=NO',
      ].join('\n') + '\n',
      'utf8',
    );
  } catch (_) {}

  ensureDatabase(env);

  const distMain = path.join(API_DIR, 'dist', 'main.js');
  if (!fs.existsSync(distMain)) {
    throw new Error('ملف الخادم غير مبني (apps/api/dist). شغّل build-desktop.bat ثم أعد المحاولة.');
  }

  apiProcess = spawnAsNode([distMain], {
    cwd: API_DIR,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

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
          `\\n[exit code ${code}] ${new Date().toISOString()}\\n`,
        );
      } catch (_) {}
      dialog.showErrorBox(
        'Maktaba',
        `توقف الخادم المحلي (رمز ${code}). أعد تشغيل التطبيق.\\nالتفاصيل: ${path.join(DATA_DIR, 'api-error.log')}`,
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
        { role: 'reload', label: 'أدوات المطوّر' },
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
              detail: 'إصدار Portable 1.3 — سطح مكتب + SQLite محلي',
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
  initUserPaths();
  ensureDirs();
  const cfg = loadOrCreateConfig();
  autoBackupDaily();
  buildMenu();

  if (!fs.existsSync(WEB_DIST) || !fs.existsSync(path.join(WEB_DIST, 'index.html'))) {
    dialog.showErrorBox(
      'Maktaba',
      'الواجهة غير مبنية.\nشغّل build-desktop.bat أو refresh-ui.bat ثم أعد المحاولة.',
    );
    app.quit();
    return;
  }

  await startApi(cfg);
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
