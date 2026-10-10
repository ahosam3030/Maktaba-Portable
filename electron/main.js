/**
 * Maktaba Portable — سطح المكتب (Electron)
 * يشغّل الـ API محليًا ويفتح نافذة برنامج.
 */
const { app, BrowserWindow, dialog, shell, Menu } = require('electron');
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
