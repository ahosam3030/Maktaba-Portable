const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const TOKEN_KEY = 'maktaba_access_token';
const USER_KEY = 'maktaba_user';
const ORG_KEY = 'maktaba_organization';

export const ALL_PERMISSIONS = ['purchases', 'sales', 'inventory', 'accounting', 'printing', 'reports', 'users'] as const;
export type Permission = (typeof ALL_PERMISSIONS)[number];

export function getToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function clearSession() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
  sessionStorage.removeItem(ORG_KEY);
}

export function saveSession(result: AuthResult) {
  sessionStorage.setItem(TOKEN_KEY, result.accessToken);
  sessionStorage.setItem(USER_KEY, JSON.stringify(result.user));
  sessionStorage.setItem(ORG_KEY, JSON.stringify(result.organization));
}

export function getStoredUser(): AuthResult['user'] | null {
  try {
    const raw = sessionStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function getStoredOrganization(): AuthResult['organization'] | null {
  try {
    const raw = sessionStorage.getItem(ORG_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function isAdminUser(user: AuthResult['user'] | null | undefined): boolean {
  return !!user && (user.role === 'OWNER' || user.role === 'ADMIN');
}

export function hasPermission(user: AuthResult['user'] | null | undefined, permission: Permission): boolean {
  if (!user) return false;
  if (isAdminUser(user)) return true;
  return Array.isArray(user.permissions) && user.permissions.includes(permission);
}

export async function apiHealth(): Promise<{ status: string; service: string; version: string }> {
  const response = await fetch(`${API_URL}/health`);
  if (!response.ok) throw new Error('تعذر الاتصال بالخادم');
  return response.json();
}

export type RegistrationInput = {
  organizationName: string; slug: string; phone?: string; fullName: string; email: string; password: string;
};

export type AuthResult = {
  accessToken: string;
  tokenType: 'Bearer';
  user: { id: string; fullName: string; email: string; role: string; permissions: string[] };
  organization: { id: string; name: string; slug: string; phone?: string | null };
};


/** تطبيع رسالة خطأ NestJS (string | string[]) */
export function formatApiErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') return fallback;
  const msg = (payload as { message?: unknown }).message;
  if (typeof msg === 'string' && msg.trim()) return msg;
  if (Array.isArray(msg)) {
    const parts = msg.map(String).map((s) => s.trim()).filter(Boolean);
    if (parts.length) return parts.join(' — ');
  }
  const err = (payload as { error?: unknown }).error;
  if (typeof err === 'string' && err.trim()) return err;
  return fallback;
}

export async function fetchSetupStatus(): Promise<{ needsSetup: boolean }> {
  const response = await fetch(`${API_URL}/auth/setup-status`);
  const result = await response.json().catch(() => ({ needsSetup: false }));
  if (!response.ok) return { needsSetup: false };
  return result as { needsSetup: boolean };
}

export async function registerOrganization(input: RegistrationInput): Promise<AuthResult> {
  const response = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...input, setupSecret: 'FIRST_RUN' }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(formatApiErrorMessage(result, 'فشل إنشاء الحساب. راجع البيانات وحاول مرة أخرى.'));
  return result as AuthResult;
}

export async function login(email: string, password: string): Promise<AuthResult> {
  const response = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(formatApiErrorMessage(result, 'فشل تسجيل الدخول.'));
  return result as AuthResult;
}

export type ApiRequestOptions = {
  /** عند انقطاع الشبكة: ضع الطلب في طابور المزامنة بدل الفشل فورًا (لطرق الكتابة فقط) */
  queueOffline?: boolean;
  /** وصف عربي يظهر في قائمة الانتظار */
  queueLabel?: string;
};

export class OfflineQueuedError extends Error {
  readonly queued = true;
  readonly queueId: string;
  constructor(queueId: string, label: string) {
    super(`تم الحفظ محليًا وسيُزامَن عند عودة الاتصال — ${label}`);
    this.name = 'OfflineQueuedError';
    this.queueId = queueId;
  }
}

function isMutatingMethod(method: string | undefined): boolean {
  const m = (method || 'GET').toUpperCase();
  return m === 'POST' || m === 'PUT' || m === 'PATCH' || m === 'DELETE';
}

function isNetworkFailure(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
  if (err instanceof TypeError) return true;
  const msg = err instanceof Error ? err.message : String(err);
  return /failed to fetch|network|load failed|networkerror/i.test(msg);
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
  options: ApiRequestOptions = {},
): Promise<T> {
  const method = (init.method || 'GET').toUpperCase();
  const wantQueue = options.queueOffline !== false && isMutatingMethod(method);

  if (wantQueue && typeof navigator !== 'undefined' && !navigator.onLine) {
    const { enqueueMutation } = await import('./sync');
    let body: unknown = undefined;
    if (typeof init.body === 'string' && init.body) {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    }
    const item = await enqueueMutation({
      method,
      path,
      body,
      label: options.queueLabel || `${method} ${path}`,
    });
    throw new OfflineQueuedError(item.id, item.label);
  }

  const token = getToken();
  try {
    const response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401) {
        clearSession();
      }
      throw new Error(formatApiErrorMessage(result, 'تعذر تنفيذ الطلب.'));
    }
    return result as T;
  } catch (err) {
    if (err instanceof OfflineQueuedError) throw err;
    if (wantQueue && isNetworkFailure(err)) {
      const { enqueueMutation } = await import('./sync');
      let body: unknown = undefined;
      if (typeof init.body === 'string' && init.body) {
        try {
          body = JSON.parse(init.body);
        } catch {
          body = init.body;
        }
      }
      const item = await enqueueMutation({
        method,
        path,
        body,
        label: options.queueLabel || `${method} ${path}`,
      });
      throw new OfflineQueuedError(item.id, item.label);
    }
    throw err;
  }
}

