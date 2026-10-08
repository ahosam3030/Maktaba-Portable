/**
 * نسخ احتياطي متسق لـ SQLite.
 * يفضّل VACUUM INTO؛ إن تعذّر → نسخ الملف + wal/shm مع تحذير.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const src = process.argv[2];
const dest = process.argv[3];
if (!src || !dest) {
  console.error('Usage: node backup-sqlite.js <src.db> <dest.db>');
  process.exit(1);
}
if (!fs.existsSync(src)) {
  console.error('Source DB not found:', src);
  process.exit(1);
}

fs.mkdirSync(path.dirname(dest), { recursive: true });

// جرّب prisma / sqlite3 CLI إن وُجد
function tryVacuumInto() {
  // better-sqlite3 optional
  try {
    const Database = require('better-sqlite3');
    const db = new Database(src, { readonly: true, fileMustExist: true });
    const safe = dest.replace(/'/g, "''");
    db.exec(`VACUUM INTO '${safe}'`);
    db.close();
    return true;
  } catch (_) {}
  // sqlite3 CLI
  const r = spawnSync('sqlite3', [src, `VACUUM INTO '${dest.replace(/'/g, "''")}'`], {
    encoding: 'utf8',
  });
  if (r.status === 0 && fs.existsSync(dest)) return true;
  return false;
}

if (tryVacuumInto()) {
  console.log('VACUUM INTO OK');
  process.exit(0);
}

console.warn('VACUUM INTO unavailable — copying files. Close the app for a consistent backup.');
fs.copyFileSync(src, dest);
for (const suf of ['-wal', '-shm']) {
  if (fs.existsSync(src + suf)) {
    try {
      fs.copyFileSync(src + suf, dest + suf);
    } catch (_) {}
  }
}
console.log('COPY OK');
process.exit(0);
