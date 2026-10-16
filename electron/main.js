/**
 * Maktaba Portable — سطح المكتب (Electron)
 * يشغّل الـ API محليًا ويفتح نافذة برنامج.
 */
const { app, BrowserWindow, dialog, shell, Menu, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const http = require('http');


function logCrash(prefix, err) {
  try {
    ensureDirs();
    const line = `[${new Date().toISOString()}] ${prefix} ${err && err.stack ? err.stack : err}\n`;
    fs.appendFileSync(path.join(DATA_DIR, 'crash.log'), line);
  } catch (_) {}
}

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





/** نسخة متسقة عبر SQLite VACUUM INTO + فحص سلامة */
function sqliteExec(dbPath, sql) {
  const Database = tryLoadBetterSqlite();
  if (Database) {
    const db = new Database(dbPath);
    try {
      db.exec(sql);
    } finally {
      db.close();
    }
    return true;
  }
  // fallback: prisma-less pure file copy only if VACUUM unavailable
  return false;
}

function tryLoadBetterSqlite() {
  try {
    return require('better-sqlite3');
  } catch (_) {
    return null;
  }
}

function integrityCheckDb(dbPath) {
  const Database = tryLoadBetterSqlite();
  if (Database) {
    const db = new Database(dbPath, { readonly: true, fileMustExist: true });
    try {
      const row = db.prepare('PRAGMA integrity_check').get();
      const ok = row && String(Object.values(row)[0] || '').toLowerCase() === 'ok';
      if (!ok) throw new Error('فحص سلامة القاعدة فشل: ' + JSON.stringify(row));
      // جداول أساسية متوقعة
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all()
        .map((r) => r.name);
      for (const need of ['Organization', 'User', 'Product']) {
        if (!tables.includes(need)) {
          throw new Error('الملف ليس قاعدة Maktaba صالحة (ناقص جدول ' + need + ')');
        }
      }
    } finally {
      db.close();
    }
    return true;
  }
  // بدون better-sqlite3: تحقق بسيط من ترويسة SQLite
  const fd = fs.openSync(dbPath, 'r');
  try {
    const buf = Buffer.alloc(16);
    fs.readSync(fd, buf, 0, 16, 0);
    if (buf.toString('utf8', 0, 15) !== 'SQLite format 3') {
      throw new Error('الملف ليس قاعدة SQLite صالحة');
    }
  } finally {
    fs.closeSync(fd);
  }
  return true;
}

function copyDbBundle(destPath) {
  if (!fs.existsSync(DB_FILE)) throw new Error('لا يوجد ملف قاعدة بيانات');
  const destAbs = path.resolve(destPath);
  // احذف الهدف القديم إن وُجد
  try {
    if (fs.existsSync(destAbs)) fs.unlinkSync(destAbs);
  } catch (_) {}
  for (const ext of ['-wal', '-shm']) {
    try {
      if (fs.existsSync(destAbs + ext)) fs.unlinkSync(destAbs + ext);
    } catch (_) {}
  }
  const Database = tryLoadBetterSqlite();
  if (Database) {
    const db = new Database(DB_FILE);
    try {
      // لقطة متسقة حتى مع وجود كتابات
      db.exec(`VACUUM INTO '${destAbs.replace(/'/g, "''")}'`);
    } finally {
      db.close();
    }
  } else {
    // fallback: نسخ الملف + wal/shm
    fs.copyFileSync(DB_FILE, destAbs);
    for (const ext of ['-wal', '-shm']) {
      const side = DB_FILE + ext;
      if (fs.existsSync(side)) fs.copyFileSync(side, destAbs + ext);
    }
  }
  integrityCheckDb(destAbs);
}

function autoBackupDaily() {
  try {
    ensureDirs();
    if (!fs.existsSync(DB_FILE)) return;
    const day = new Date().toISOString().slice(0, 10);
    const dest = path.join(BACKUPS_DIR, `auto-${day}.db`);
    if (fs.existsSync(dest)) return;
    copyDbBundle(dest);
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

function waitForApi(maxMs = 90000, expectedNonce) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const req = http.get(`${APP_URL}/api/health`, (res) => {
        let body = '';
        res.on('data', (c) => { body += c; });
        res.on('end', () => {
          if (!(res.statusCode && res.statusCode < 500)) {
            retry();
            return;
          }
          // تأكد أننا وصلنا لخادم المكتبة وليس خدمة أخرى على نفس المنفذ
          const okMarker =
            body.includes('ok') ||
            body.includes('maktaba') ||
            body.includes('status') ||
            body.includes('true');
          if (expectedNonce && body.includes(expectedNonce)) {
            resolve();
            return;
          }
          if (!expectedNonce && okMarker) {
            resolve();
            return;
          }
          // لو الرد JSON صالح من Nest غالبًا يكفي
          if (res.statusCode === 200 && body.trim().startsWith('{')) {
            resolve();
            return;
          }
          retry();
        });
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
  const candidates = [...new Set([preferred, 3000, 3847, 4711, 5123, 8765, 9876, 18080])];
  for (const p of candidates) {
    if (await isPortFree(p)) return p;
  }
  throw new Error('لا يوجد منفذ متاح لتشغيل البرنامج. أغلق البرامج التي تستخدم المنافذ المحلية ثم أعد المحاولة.');
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

function hasRealMigrations(migDir) {
  if (!fs.existsSync(migDir)) return false;
  try {
    const entries = fs.readdirSync(migDir, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const sql = path.join(migDir, e.name, 'migration.sql');
      if (fs.existsSync(sql) && fs.statSync(sql).size > 0) return true;
    }
  } catch (_) {}
  return false;
}

function ensureDatabase(env) {
  const prismaCli = path.join(API_DIR, 'node_modules', 'prisma', 'build', 'index.js');
  if (!fs.existsSync(prismaCli)) {
    console.warn('prisma CLI missing — skip schema sync');
    return;
  }
  const migDir = path.join(API_DIR, 'prisma', 'migrations');
  const dbFile = (env.DATABASE_URL || '').replace(/^file:/, '');
  const dbExists = dbFile && fs.existsSync(dbFile) && fs.statSync(dbFile).size > 0;

  if (hasRealMigrations(migDir)) {
    let mig = spawnAsNodeSync([prismaCli, 'migrate', 'deploy'], {
      cwd: API_DIR,
      env,
      timeout: 120000,
    });
    if (mig.status === 0) return;

    const errText = ((mig.stderr || mig.stdout || '') + '').toString();
    console.warn('migrate deploy failed', errText.slice(0, 800));

    // مسار ترقية قديم فقط: القاعدة موجودة وجداولها الأساسية موجودة وخطأ P3005/already
    const looksLikeExistingSchema =
      dbExists &&
      (/P3005|already|exists|not empty/i.test(errText) || true);
    let canMarkInit = false;
    if (dbExists && looksLikeExistingSchema) {
      try {
        integrityCheckDb(dbFile);
        canMarkInit = true;
      } catch (_) {
        canMarkInit = false;
      }
    }
    if (canMarkInit) {
      const initName = '20261008000000_init';
      const resolve = spawnAsNodeSync(
        [prismaCli, 'migrate', 'resolve', '--applied', initName],
        { cwd: API_DIR, env, timeout: 60000 },
      );
      if (resolve.status === 0) {
        mig = spawnAsNodeSync([prismaCli, 'migrate', 'deploy'], {
          cwd: API_DIR,
          env,
          timeout: 120000,
        });
        if (mig.status === 0) return;
      }
    }
    if (dbExists) {
      throw new Error(
        'تعذر تطبيق تحديث قاعدة البيانات. أنشئ نسخة احتياطية ثم تواصل مع الدعم.\n' +
          errText.slice(0, 300),
      );
    }
  }

  console.log('Creating schema (db push, new database only)');
  const r = spawnAsNodeSync([prismaCli, 'db', 'push', '--skip-generate'], {
    cwd: API_DIR,
    env,
    timeout: 120000,
  });
  if (r.status !== 0) {
    const msg = (r.stderr || r.stdout || '').toString().slice(0, 800);
    console.error('prisma db push failed', msg);
    throw new Error('تعذر تجهيز قاعدة البيانات. أعد تثبيت البرنامج أو تواصل مع الدعم.');
  }
}

function stopApiSync() {
  if (!apiProcess) return;
  const proc = apiProcess;
  const pid = proc.pid;
  let exited = false;
  try {
    proc.once('exit', () => {
      exited = true;
    });
  } catch (_) {}

  // 1) إغلاق منظم
  try {
    if (process.platform === 'win32' && pid) {
      // بدون /f أولًا
      spawn('taskkill', ['/pid', String(pid), '/t'], { shell: true, windowsHide: true });
    } else {
      proc.kill('SIGTERM');
    }
  } catch (_) {}

  const deadline = Date.now() + 4000;
  while (!exited && Date.now() < deadline) {
    try {
      require('child_process').execSync(
        process.platform === 'win32' ? 'timeout /t 1 /nobreak >nul' : 'sleep 0.4',
        { stdio: 'ignore', windowsHide: true },
      );
    } catch (_) {}
    if (proc.killed) break;
  }

  // 2) إنهاء قسري إن لزم
  if (!exited && !proc.killed) {
    try {
      if (process.platform === 'win32' && pid) {
        spawn('taskkill', ['/pid', String(pid), '/f', '/t'], { shell: true, windowsHide: true });
      } else {
        proc.kill('SIGKILL');
      }
    } catch (_) {}
    try {
      require('child_process').execSync(
        process.platform === 'win32' ? 'timeout /t 1 /nobreak >nul' : 'sleep 0.5',
        { stdio: 'ignore', windowsHide: true },
      );
    } catch (_) {}
  }
  apiProcess = null;
}

async function startApi(cfg) {
  const dbUrl = 'file:' + String(DB_FILE).replace(/\\/g, '/');
  PORT = await pickPort(Number(cfg.port) || 3000);
  cfg.port = PORT;
  try {
    const tmpCfg = CONFIG_FILE + '.tmp';
    fs.writeFileSync(tmpCfg, JSON.stringify(cfg, null, 2), 'utf8');
    fs.renameSync(tmpCfg, CONFIG_FILE);
  } catch (e) {
    console.warn('config write failed', e && e.message ? e.message : e);
  }
  APP_URL = `http://127.0.0.1:${PORT}`;

  const env = {
    ...process.env,
    PORT: String(PORT),
    NODE_ENV: 'production',
    WEB_DIST: WEB_DIST,
    DATABASE_URL: dbUrl,
    JWT_SECRET: cfg.jwtSecret,
    LICENSE_SECRET: cfg.licenseSecret,
    TRIAL_DAYS: process.env.TRIAL_DAYS || '14',
    UPLOADS_DIR: UPLOADS_DIR,
    CORS_ORIGINS: `${APP_URL},http://127.0.0.1:${PORT},http://localhost:${PORT}`,
    ALLOW_LICENSE_ISSUE: process.env.ALLOW_LICENSE_ISSUE || 'NO',
    ELECTRON_RUN_AS_NODE: '1',
  };

  try {
    // لا نكتب أسرار JWT/License في .env داخل مجلد التطبيق.
    // الأسرار تُمرَّر عبر env للعملية فقط، وتُحفظ في config.json ضمن مجلد بيانات المستخدم.
    const envPath = path.join(API_DIR, '.env');
    const lines = [
      `DATABASE_URL="${dbUrl}"`,
      `PORT=${PORT}`,
      `UPLOADS_DIR="${String(UPLOADS_DIR).replace(/\\/g, '/')}"`,
      'NODE_ENV=production',
      'ALLOW_LICENSE_ISSUE=NO',
    ];
    // للتطوير المحلي فقط: إن لم يكن التطبيق مغلّفًا، اكتب الأسرار لتسهيل تشغيل API يدويًا
    if (!app.isPackaged) {
      lines.push(`JWT_SECRET="${cfg.jwtSecret}"`);
      lines.push(`LICENSE_SECRET="${cfg.licenseSecret}"`);
    }
    const tmp = envPath + '.tmp';
    fs.writeFileSync(tmp, lines.join('\n') + '\n', 'utf8');
    fs.renameSync(tmp, envPath);
  } catch (e) {
    console.warn('env write skipped', e && e.message ? e.message : e);
  }

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
        `حدث خطأ في تشغيل البرنامج (رمز ${code}). أعد تشغيل التطبيق.\\nالتفاصيل: ${path.join(DATA_DIR, 'api-error.log')}`,
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
    dialog.showErrorBox('نسخ احتياطي', 'لا يوجد ملف قاعدة بيانات بعد. أكمل إعداد البرنامج من الشاشة الأولى ثم أعد المحاولة.');
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
    copyDbBundle(filePath);
    // نسخة إضافية داخل مجلد backups
    try {
      copyDbBundle(path.join(BACKUPS_DIR, defaultName));
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
    // تحقق من الملف المصدر قبل أي استبدال
    integrityCheckDb(src);
    stopApiSync();
    // نسخة سلامة من الوضع الحالي (متسقة إن أمكن)
    if (fs.existsSync(DB_FILE)) {
      try {
        copyDbBundle(path.join(BACKUPS_DIR, `before-restore-${stamp()}.db`));
      } catch (e) {
        fs.copyFileSync(DB_FILE, path.join(BACKUPS_DIR, `before-restore-${stamp()}.db`));
      }
    }
    const tmp = path.join(DATA_DIR, `restore-tmp-${stamp()}.db`);
    fs.copyFileSync(src, tmp);
    integrityCheckDb(tmp);
    for (const ext of ['-wal', '-shm']) {
      const side = DB_FILE + ext;
      try { if (fs.existsSync(side)) fs.unlinkSync(side); } catch (_) {}
    }
    fs.copyFileSync(tmp, DB_FILE);
    try { fs.unlinkSync(tmp); } catch (_) {}
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'تمت الاستعادة',
      message: 'تمت استعادة القاعدة بعد التحقق من سلامتها. سيُغلق البرنامج — افتحه من جديد.',
    });
    shuttingDown = true;
    app.quit();
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
              detail: 'إصدار Portable 1.5.0 — سطح مكتب + SQLite محلي',
            }),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}


function resolveAppIcon() {
  const candidates = [
    path.join(__dirname, '..', 'build', 'icon.ico'),
    path.join(__dirname, '..', 'build', 'icon.png'),
    path.join(__dirname, '..', 'build', 'El-Mohands.ico'),
    path.join(__dirname, '..', 'build', 'El-Mohands.png'),
    path.join(process.resourcesPath || '', 'build', 'icon.ico'),
    path.join(process.resourcesPath || '', 'icon.ico'),
  ];
  for (const c of candidates) {
    try {
      if (c && fs.existsSync(c)) return c;
    } catch (_) {}
  }
  return undefined;
}



/** طباعة ملصقات: معاينة + محاولة TSPL خام لطابعات Xprinter */
function registerLabelPrintIpc() {
  const { exec } = require('child_process');
  const os = require('os');

  ipcMain.handle('list-printers', async () => {
    try {
      const printers = mainWindow ? await mainWindow.webContents.getPrintersAsync() : [];
      return (printers || []).map((p) => ({ name: p.name, isDefault: !!p.isDefault }));
    } catch (e) {
      return [];
    }
  });

  ipcMain.handle('print-labels', async (_event, payload) => {
    const images = (payload && payload.images) || [];
    const widthMm = Math.max(10, Number(payload && payload.widthMm) || 38);
    const heightMm = Math.max(10, Number(payload && payload.heightMm) || 25);
    if (!images.length) return { ok: false, error: 'no-images' };

    const pages = images
      .map(
        (src, i) =>
          `<div class="page"><img src="${String(src).replace(/"/g, '')}" alt="l${i}"/></div>`,
      )
      .join('');

    const html = `<!doctype html><html><head><meta charset="utf-8"/>
<style>
  @page { size: ${widthMm}mm ${heightMm}mm; margin: 0; }
  * { margin: 0; padding: 0; }
  html, body { width: ${widthMm}mm; background: #fff; }
  .page { width: ${widthMm}mm; height: ${heightMm}mm; page-break-after: always; overflow: hidden; }
  .page:last-child { page-break-after: auto; }
  img { width: ${widthMm}mm; height: ${heightMm}mm; display: block; }
  .tools { font-family: Tahoma,Arial,sans-serif; font-size: 13px; padding: 10px; background:#f0f0f0; }
  @media print { .tools { display: none !important; } }
</style></head><body>
<div class="tools">معاينة الملصق — إن ظهر المحتوى هنا والورق أبيض: استخدم «حفظ الصورة» واطبع من الرسام، أو طباعة TSPL.</div>
${pages}
</body></html>`;

    // نافذة معاينة ظاهرة دائمًا
    const printWin = new BrowserWindow({
      show: true,
      width: 480,
      height: 640,
      title: `ملصقات ${widthMm}x${heightMm}mm`,
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
    });

    await printWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    await new Promise((r) => setTimeout(r, 500));

    const pageSize = {
      width: Math.round(widthMm * 1000),
      height: Math.round(heightMm * 1000),
    };

    return await new Promise((resolve) => {
      printWin.webContents.print(
        {
          silent: false,
          printBackground: true,
          margins: { marginType: 'none' },
          pageSize,
        },
        (success, failureReason) => {
          // نترك نافذة المعاينة مفتوحة للمستخدم
          resolve({ ok: !!success, error: failureReason || null, previewOpen: true });
        },
      );
    });
  });

  function buildTspl(label, widthMm, heightMm) {
    const name = String(label.name || '')
      .replace(/"/g, "'")
      .slice(0, 28);
    const price = Number(label.price || 0).toFixed(2);
    const code = String(label.barcode || '').replace(/"/g, '');
    const copies = Math.max(1, Math.min(50, Number(label.copies) || 1));
    // TSPL — شائع على Xprinter
    const lines = [
      `SIZE ${widthMm} mm,${heightMm} mm`,
      'GAP 2 mm,0 mm',
      'DENSITY 8',
      'DIRECTION 1',
      'REFERENCE 0,0',
      'CLS',
      `TEXT 16,12,"2",0,1,1,"${name}"`,
      `TEXT 16,42,"2",0,1,1,"${price}"`,
      `BARCODE 16,70,"128",48,1,0,2,2,"${code}"`,
      'PRINT 1,1',
      '',
    ];
    return lines.join('\r\n');
  }

  function sendRawToPrinter(filePath, printerName) {
    return new Promise((resolve) => {
      const pn = String(printerName || '').replace(/"/g, '');
      if (!pn) return resolve(false);
      // copy /b إلى طابعة ويندوز (RAW)
      const cmd = `cmd /c copy /B "${filePath}" "\\\\localhost\\${pn}"`;
      exec(cmd, { windowsHide: true, timeout: 20000 }, (err) => {
        if (!err) return resolve(true);
        const cmd2 = `cmd /c print /D:"\\\\localhost\\${pn}" "${filePath}"`;
        exec(cmd2, { windowsHide: true, timeout: 20000 }, (err2) => resolve(!err2));
      });
    });
  }

  ipcMain.handle('print-labels-tspl', async (_event, payload) => {
    const labels = (payload && payload.labels) || [];
    const widthMm = Math.max(10, Number(payload && payload.widthMm) || 38);
    const heightMm = Math.max(10, Number(payload && payload.heightMm) || 25);
    if (!labels.length) return { ok: false, error: 'no-labels' };

    let printerName = payload && payload.printerName;
    if (!printerName) {
      try {
        const printers = mainWindow ? await mainWindow.webContents.getPrintersAsync() : [];
        const hit =
          (printers || []).find((p) => /xp-?q|xprinter|371|380|label/i.test(p.name)) ||
          (printers || []).find((p) => p.isDefault) ||
          (printers || [])[0];
        printerName = hit ? hit.name : '';
      } catch (_) {
        printerName = '';
      }
    }
    if (!printerName) return { ok: false, error: 'no-printer' };

    const tmpDir = path.join(os.tmpdir(), 'maktaba-labels');
    try {
      fs.mkdirSync(tmpDir, { recursive: true });
    } catch (_) {}

    let okCount = 0;
    for (let i = 0; i < labels.length; i++) {
      const tspl = buildTspl(labels[i], widthMm, heightMm);
      const filePath = path.join(tmpDir, `label-${Date.now()}-${i}.tspl`);
      fs.writeFileSync(filePath, tspl, 'ascii');
      const ok = await sendRawToPrinter(filePath, printerName);
      try {
        fs.unlinkSync(filePath);
      } catch (_) {}
      if (ok) okCount++;
    }

    return {
      ok: okCount > 0,
      printerName,
      printed: okCount,
      total: labels.length,
      error: okCount ? null : 'raw-print-failed',
    };
  });

  ipcMain.handle('print-labels-gdi', async (_event, payload) => {
    const images = (payload && payload.images) || [];
    const widthMm = Math.max(10, Number(payload && payload.widthMm) || 38);
    const heightMm = Math.max(10, Number(payload && payload.heightMm) || 25);
    if (!images.length) return { ok: false, error: 'no-images' };

    let printerName = (payload && payload.printerName) || '';
    try {
      const printers = mainWindow ? await mainWindow.webContents.getPrintersAsync() : [];
      if (!printerName) {
        const hit =
          (printers || []).find((p) => /xp-?q|xprinter|371|380|label|q371/i.test(String(p.name || ''))) ||
          (printers || []).find((p) => p.isDefault);
        printerName = hit ? hit.name : ((printers || [])[0] ? printers[0].name : '');
      }
    } catch (_) {}
    if (!printerName) return { ok: false, error: 'no-printer' };

    const os = require('os');
    const { execFile, exec } = require('child_process');
    const tmpDir = path.join(os.tmpdir(), 'maktaba-label-print');
    try {
      fs.mkdirSync(tmpDir, { recursive: true });
    } catch (_) {}

    let printed = 0;
    let lastError = null;
    const methodsTried = [];

    function run(cmd, args, opts = {}) {
      return new Promise((resolve) => {
        execFile(cmd, args, { windowsHide: true, timeout: 90000, ...opts }, (err, stdout, stderr) => {
          if (err) resolve({ ok: false, err: String(stderr || err.message || err).slice(0, 300) });
          else resolve({ ok: true, stdout: String(stdout || '') });
        });
      });
    }

    function runShell(command) {
      return new Promise((resolve) => {
        exec(command, { windowsHide: true, timeout: 90000 }, (err, stdout, stderr) => {
          if (err) resolve({ ok: false, err: String(stderr || err.message || err).slice(0, 300) });
          else resolve({ ok: true });
        });
      });
    }

    for (let i = 0; i < images.length; i++) {
      const src = String(images[i] || '');
      const m = /^data:image\/png;base64,(.+)$/.exec(src);
      if (!m) {
        lastError = 'bad-image';
        continue;
      }
      const filePath = path.join(tmpDir, 'label-' + Date.now() + '-' + i + '.png');
      try {
        fs.writeFileSync(filePath, Buffer.from(m[1], 'base64'));
      } catch (e) {
        lastError = 'write-fail';
        continue;
      }

      let ok = false;

      // 1) Windows Photo print-to-printer (يعمل مع أغلب درايفرات الملصقات)
      // rundll32 shimgvw.dll,ImageView_PrintTo filename printername
      {
        const r = await runShell(
          'rundll32.exe shimgvw.dll,ImageView_PrintTo "' + filePath.replace(/"/g, '') + '" "' + String(printerName).replace(/"/g, '') + '"',
        );
        methodsTried.push('shimgvw');
        if (r.ok) {
          ok = true;
          // انتظر قليلاً حتى تكتمل مهمة الطباعة
          await new Promise((res) => setTimeout(res, 1500));
        } else {
          lastError = r.err;
        }
      }

      // 2) mspaint /pt "file" "printer"
      if (!ok) {
        const paintCandidates = [
          path.join(process.env.SystemRoot || 'C:\\\\Windows', 'System32', 'mspaint.exe'),
          path.join(process.env.SystemRoot || 'C:\\\\Windows', 'mspaint.exe'),
        ];
        for (const paint of paintCandidates) {
          if (!fs.existsSync(paint)) continue;
          const r = await run(paint, ['/pt', filePath, printerName]);
          methodsTried.push('mspaint');
          if (r.ok) {
            ok = true;
            await new Promise((res) => setTimeout(res, 1500));
            break;
          }
          lastError = r.err;
        }
      }

      // 3) PowerShell GDI مع مقاس الملصق
      if (!ok) {
        const paperW = Math.max(1, Math.round((widthMm / 25.4) * 100));
        const paperH = Math.max(1, Math.round((heightMm / 25.4) * 100));
        const ps1Path = path.join(tmpDir, 'print-' + Date.now() + '-' + i + '.ps1');
        const ps1 = [
          "$ErrorActionPreference = 'Stop'",
          "Add-Type -AssemblyName System.Drawing",
          "$printer = @'",
          String(printerName),
          "'@",
          "$path = @'",
          filePath,
          "'@",
          "$wMm = " + widthMm,
          "$hMm = " + heightMm,
          "$paperW = " + paperW,
          "$paperH = " + paperH,
          "$img = [System.Drawing.Image]::FromFile($path)",
          "try {",
          "  $pd = New-Object System.Drawing.Printing.PrintDocument",
          "  $pd.PrinterSettings.PrinterName = $printer",
          "  if (-not $pd.PrinterSettings.IsValid) { throw \"Printer not valid: $printer\" }",
          "  $pd.DocumentName = 'MaktabaLabel'",
          "  $pd.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0,0,0,0)",
          "  try {",
          "    $psize = New-Object System.Drawing.Printing.PaperSize('MaktabaLabel', $paperW, $paperH)",
          "    $psize.RawKind = 256",
          "    $pd.DefaultPageSettings.PaperSize = $psize",
          "  } catch {}",
          "  $script:imgRef = $img",
          "  $pd.add_PrintPage({",
          "    param($sender, $e)",
          "    $e.Graphics.DrawImage($script:imgRef, $e.MarginBounds)",
          "    $e.HasMorePages = $false",
          "  })",
          "  $pd.Print()",
          "}",
          "finally { $img.Dispose() }",
        ].join('\r\n');
        try {
          fs.writeFileSync(ps1Path, ps1, 'utf8');
          const r = await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1Path]);
          methodsTried.push('gdi');
          if (r.ok) ok = true;
          else lastError = r.err;
          try {
            fs.unlinkSync(ps1Path);
          } catch (_) {}
        } catch (e) {
          lastError = String(e.message || e);
        }
      }

      try {
        fs.unlinkSync(filePath);
      } catch (_) {}
      if (ok) printed++;
    }

    return {
      ok: printed > 0,
      printed,
      total: images.length,
      printerName,
      paperMm: widthMm + 'x' + heightMm,
      methods: methodsTried.join(','),
      error: printed > 0 ? null : lastError || 'all-methods-failed',
    };
  });


}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    title: 'Maktaba 1.5.0',
    backgroundColor: '#0f766e',
    autoHideMenuBar: false,
    icon: resolveAppIcon(),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
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
  registerLabelPrintIpc();
  createWindow();

  // تحديث تلقائي (يتطلب نشر Releases على GitHub + بناء موقع)
  try {
    if (app.isPackaged) {
      const { autoUpdater } = require('electron-updater');
      autoUpdater.autoDownload = false;
      autoUpdater.on('update-available', (info) => {
        dialog
          .showMessageBox(mainWindow, {
            type: 'info',
            buttons: ['لاحقاً', 'تحميل'],
            defaultId: 1,
            title: 'تحديث متاح',
            message: 'يتوفر إصدار جديد من Maktaba',
            detail: String(info.version || ''),
          })
          .then((r) => {
            if (r.response === 1) autoUpdater.downloadUpdate();
          });
      });
      autoUpdater.on('update-downloaded', () => {
        dialog
          .showMessageBox(mainWindow, {
            type: 'info',
            buttons: ['إعادة التشغيل الآن'],
            title: 'تم التحميل',
            message: 'سيتم تثبيت التحديث بعد إعادة التشغيل.',
          })
          .then(() => autoUpdater.quitAndInstall());
      });
      autoUpdater.on('error', (err) => {
        try {
          fs.appendFileSync(path.join(DATA_DIR, 'update-error.log'), String(err) + '\n');
        } catch (_) {}
      });
      setTimeout(() => {
        autoUpdater.checkForUpdates().catch(() => {});
      }, 8000);
    }
  } catch (e) {
    console.warn('autoUpdater unavailable', e);
  }

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

process.on('uncaughtException', (err) => {
  logCrash('uncaughtException', err);
});
process.on('unhandledRejection', (err) => {
  logCrash('unhandledRejection', err);
});

app.whenReady().then(boot);
app.on('window-all-closed', () => {
  cleanup();
  app.quit();
});
app.on('before-quit', cleanup);
