import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

/** مجلد رفع الملفات بجانب جذر تشغيل الـ API (apps/api/uploads) */
export function uploadsRoot(): string {
  const root = process.env.UPLOADS_DIR || join(process.cwd(), 'uploads');
  if (!existsSync(root)) mkdirSync(root, { recursive: true });
  return root;
}

export function orgUploadDir(organizationId: string): string {
  const dir = join(uploadsRoot(), organizationId);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export function imageFileFilter(
  _req: unknown,
  file: { mimetype: string },
  cb: (error: Error | null, acceptFile: boolean) => void,
) {
  if (!ALLOWED.has(file.mimetype)) {
    cb(new Error('يُسمح بصور JPEG أو PNG أو WebP أو GIF فقط.'), false);
    return;
  }
  cb(null, true);
}

export function safeImageExt(mimetype: string): string {
  switch (mimetype) {
    case 'image/png':
      return '.png';
    case 'image/webp':
      return '.webp';
    case 'image/gif':
      return '.gif';
    default:
      return '.jpg';
  }
}
