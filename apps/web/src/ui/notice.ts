/** تصنيف رسالة التنبيه تلقائيًا من النص */
export type NoticeKind = 'success' | 'error' | 'warn' | 'info';

export function noticeKind(msg: string): NoticeKind {
  const m = String(msg || '').trim();
  if (!m) return 'info';
  if (/تعذر|فشل|خطأ|غير موجود|لا يوجد|لا يمكن|يجب أن|مطلوب|ممنوع|رفض|رصيده صفر|أكبر من المتاح/.test(m)) {
    return 'error';
  }
  if (/تحذير|تأكد|اسمح|جزئي|أكبر من/.test(m)) return 'warn';
  if (/^تم\s|تم حفظ|تم حذف|تم تسجيل|تم إضافة|تم جلب|تم تحديث|تم تعطيل|تم تفعيل|نجاح/.test(m)) {
    return 'success';
  }
  return 'info';
}

export function noticeClass(msg: string): string {
  return `app-notice app-notice--${noticeKind(msg)}`;
}
