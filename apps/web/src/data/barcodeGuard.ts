/**
 * حماية ماسح الباركود + منع اختصارات أدوات المطوّر قدر الإمكان من جهة الصفحة.
 * ملاحظة: بعض إعدادات الماسح ترسل الاختصار على مستوى النظام وقد تحتاج إعادة برمجة الماسح.
 */

const DEVTOOLS_KEY_CODES = new Set(['KeyI', 'KeyJ', 'KeyC', 'KeyK']);
const DEVTOOLS_KEYS = new Set(['I', 'J', 'C', 'K', 'i', 'j', 'c', 'k']);

export function isDevToolsShortcut(e: KeyboardEvent): boolean {
  if (e.key === 'F12' || e.code === 'F12') return true;
  // Ctrl/Cmd + Shift + I/J/C/K
  if ((e.ctrlKey || e.metaKey) && e.shiftKey) {
    if (DEVTOOLS_KEYS.has(e.key) || DEVTOOLS_KEY_CODES.has(e.code)) return true;
  }
  // Ctrl/Cmd + Alt + I (بعض اللوحات)
  if ((e.ctrlKey || e.metaKey) && e.altKey) {
    if (DEVTOOLS_KEYS.has(e.key) || DEVTOOLS_KEY_CODES.has(e.code)) return true;
  }
  return false;
}

/** تقدير بسيط: هل لوحة DevTools مفتوحة؟ */
export function isDevToolsLikelyOpen(): boolean {
  try {
    const widthGap = window.outerWidth - window.innerWidth;
    const heightGap = window.outerHeight - window.innerHeight;
    return widthGap > 180 || heightGap > 180;
  } catch {
    return false;
  }
}

export type ScanHandler = (code: string) => void;

function block(e: Event) {
  e.preventDefault();
  e.stopPropagation();
  if (typeof (e as KeyboardEvent).stopImmediatePropagation === 'function') {
    (e as KeyboardEvent).stopImmediatePropagation();
  }
}

/**
 * يمنع F12 / Ctrl+Shift+I على keydown+keyup+keypress (capture).
 */
export function attachDevToolsBlocker(): () => void {
  const handler = (e: Event) => {
    const ke = e as KeyboardEvent;
    if (isDevToolsShortcut(ke)) block(ke);
  };
  const opts: AddEventListenerOptions = { capture: true, passive: false };
  window.addEventListener('keydown', handler, opts);
  window.addEventListener('keyup', handler, opts);
  window.addEventListener('keypress', handler, opts);
  document.addEventListener('keydown', handler, opts);
  document.addEventListener('keyup', handler, opts);
  return () => {
    window.removeEventListener('keydown', handler, opts);
    window.removeEventListener('keyup', handler, opts);
    window.removeEventListener('keypress', handler, opts);
    document.removeEventListener('keydown', handler, opts);
    document.removeEventListener('keyup', handler, opts);
  };
}

/**
 * يستقبل رشقات الماسح ويستدعي onScan، مع منع تسريب المفاتيح أثناء الرشقة.
 */
export function attachBarcodeGuard(onScan: ScanHandler): () => void {
  let buffer = '';
  let lastTs = 0;
  let burst = false;

  const onKeyDown = (e: KeyboardEvent) => {
    if (isDevToolsShortcut(e)) {
      block(e);
      return;
    }

    const now = Date.now();
    const gap = now - lastTs;
    lastTs = now;

    if (gap < 60) burst = true;
    if (gap > 120) {
      burst = false;
      if (gap > 220) buffer = '';
    }

    if (burst && (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey)) {
      block(e);
      return;
    }

    if (e.key === 'Enter') {
      const code = buffer.trim();
      buffer = '';
      const wasBurst = burst || gap < 140;
      burst = false;
      if (code.length >= 3 && wasBurst) {
        block(e);
        try {
          onScan(code);
        } catch {
          /* ignore */
        }
      }
      return;
    }

    if (e.key.length !== 1) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    if (gap > 120) buffer = '';
    buffer += e.key;

    const target = e.target as HTMLElement | null;
    const tag = (target?.tagName || '').toLowerCase();
    const field = target?.getAttribute?.('data-field') || '';
    const isBarcodeField = field === 'barcode';
    const isEditable = tag === 'input' || tag === 'textarea' || tag === 'select';

    // رشقة سريعة: امنع التسريب لباقي الصفحة
    if ((burst || gap < 55) && (!isEditable || isBarcodeField)) {
      if (!isEditable) block(e);
    }
  };

  const opts: AddEventListenerOptions = { capture: true, passive: false };
  window.addEventListener('keydown', onKeyDown, opts);
  const stopDev = attachDevToolsBlocker();

  return () => {
    window.removeEventListener('keydown', onKeyDown, opts);
    stopDev();
  };
}
