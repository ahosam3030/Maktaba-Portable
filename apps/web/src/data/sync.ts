import { db, type OutboxItem } from './db';
import { getToken, clearSession, getStoredOrganization } from './api';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

type SyncListener = (pending: number) => void;
const listeners = new Set<SyncListener>();
let flushing = false;

function notify() {
  void countPending().then((n) => {
    listeners.forEach((fn) => fn(n));
  });
}

export function subscribeSyncQueue(listener: SyncListener): () => void {
  listeners.add(listener);
  void countPending().then(listener);
  return () => listeners.delete(listener);
}

export async function countPending(): Promise<number> {
  return db.outbox.where('status').anyOf(['pending', 'failed', 'processing']).count();
}

export async function listPending(): Promise<OutboxItem[]> {
  return db.outbox
    .where('status')
    .anyOf(['pending', 'failed', 'processing'])
    .sortBy('createdAt');
}

export function isNetworkError(err: unknown): boolean {
  if (!navigator.onLine) return true;
  if (err instanceof TypeError) return true;
  const msg = err instanceof Error ? err.message : String(err);
  return /failed to fetch|network|load failed|networkerror|ECONNREFUSED|timed out/i.test(msg);
}

export async function enqueueMutation(input: {
  method: string;
  path: string;
  body?: unknown;
  label?: string;
}): Promise<OutboxItem> {
  const org = getStoredOrganization();
  const item: OutboxItem = {
    id: crypto.randomUUID(),
    method: (input.method || 'POST').toUpperCase(),
    path: input.path.startsWith('/') ? input.path : `/${input.path}`,
    body: input.body !== undefined ? JSON.stringify(input.body) : null,
    organizationId: org?.id || null,
    label: input.label || `${input.method} ${input.path}`,
    createdAt: new Date().toISOString(),
    status: 'pending',
    attempts: 0,
  };
  await db.outbox.put(item);
  notify();
  return item;
}

async function sendOne(item: OutboxItem): Promise<void> {
  const token = getToken();
  const response = await fetch(`${API_URL}${item.path}`, {
    method: item.method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'X-Idempotency-Key': item.id,
      'X-Offline-Queue': '1',
    },
    body: item.body,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) {
      clearSession();
      // مؤقت: أعد المحاولة بعد إعادة تسجيل الدخول — لا تُعلَّم دائمة
      const err = new Error('انتهت الجلسة — سجّل الدخول ثم المزامنة') as Error & { permanent?: boolean };
      err.permanent = false;
      throw err;
    }
    const msg =
      typeof (result as { message?: unknown }).message === 'string'
        ? (result as { message: string }).message
        : Array.isArray((result as { message?: unknown }).message)
          ? ((result as { message: string[] }).message).join(' — ')
          : `HTTP ${response.status}`;
    // 4xx دائمة ما عدا 401/408/429
    if (response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429) {
      const err = new Error(msg) as Error & { permanent?: boolean };
      err.permanent = true;
      throw err;
    }
    throw new Error(msg);
  }
}

export async function processSyncQueue(): Promise<{ synced: number; failed: number; remaining: number }> {
  if (flushing) {
    return { synced: 0, failed: 0, remaining: await countPending() };
  }
  if (!navigator.onLine) {
    return { synced: 0, failed: 0, remaining: await countPending() };
  }
  flushing = true;
  let synced = 0;
  let failed = 0;
  try {
    const org = getStoredOrganization();
    const orgId = org?.id || null;
    const pending = await db.outbox
      .where('status')
      .anyOf(['pending', 'failed'])
      .sortBy('createdAt');

    for (const item of pending) {
      if (item.permanent) continue;
      // لا ترسل عناصر مكتبة أخرى على نفس الجهاز
      if (item.organizationId && orgId && item.organizationId !== orgId) continue;
      await db.outbox.update(item.id, { status: 'processing' });
      try {
        await sendOne(item);
        await db.outbox.update(item.id, {
          status: 'done',
          attempts: item.attempts + 1,
          lastError: undefined,
        });
        synced += 1;
      } catch (e) {
        const permanent = Boolean((e as { permanent?: boolean }).permanent);
        const lastError = e instanceof Error ? e.message : String(e);
        await db.outbox.update(item.id, {
          status: permanent ? 'failed' : 'failed',
          attempts: item.attempts + 1,
          lastError,
          permanent,
        });
        failed += 1;
        // stop on network error to preserve order
        if (isNetworkError(e)) break;
        // permanent errors: continue with next
        if (!permanent) break;
      }
    }

    // cleanup done items older than 7 days
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const done = await db.outbox.where('status').equals('done').toArray();
    const oldIds = done.filter((d) => new Date(d.createdAt).getTime() < weekAgo).map((d) => d.id);
    if (oldIds.length) await db.outbox.bulkDelete(oldIds);
  } finally {
    flushing = false;
    notify();
  }
  return { synced, failed, remaining: await countPending() };
}

async function resetStuckProcessing(): Promise<void> {
  const stuck = await db.outbox.where('status').equals('processing').toArray();
  for (const item of stuck) {
    await db.outbox.update(item.id, { status: 'pending' });
  }
}

export function startSyncWatchers(): () => void {
  void resetStuckProcessing().then(() => processSyncQueue());

  const onOnline = () => {
    void processSyncQueue();
  };
  window.addEventListener('online', onOnline);
  const interval = window.setInterval(() => {
    if (navigator.onLine) void processSyncQueue();
  }, 30_000);
  // initial
  if (navigator.onLine) void processSyncQueue();
  return () => {
    window.removeEventListener('online', onOnline);
    window.clearInterval(interval);
  };
}
