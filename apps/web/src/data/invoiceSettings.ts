/** إعدادات طباعة الفواتير — المصدر الأساسي: الخادم، مع كاش محلي للطابعة/الأوفلاين */

import { apiRequest, getToken } from './api';

export type InvoiceSettings = {
  brandTitle: string;
  brandSubtitle: string;
  phone: string;
  address: string;
  watermarkText: string;
  serviceTags: string[];
  invoiceTitle: string;
  footerText: string;
  paperSize: 'thermal_58' | 'thermal_80' | 'a4';
};

const STORAGE_KEY = 'maktaba_invoice_settings_v1';

export const DEFAULT_INVOICE_SETTINGS: InvoiceSettings = {
  brandTitle: '',
  brandSubtitle: 'للخدمات العلمية والطباعة والأدوات المكتبية',
  phone: '',
  address: '',
  watermarkText: '',
  serviceTags: ['خدمات علمية', 'تصوير وطباعة', 'أدوات مكتبية'],
  invoiceTitle: 'فاتورة مبيعات',
  footerText: 'شكرًا لثقتكم بنا',
  paperSize: 'thermal_80',
};

function normalize(parsed: Partial<InvoiceSettings> | null | undefined): InvoiceSettings {
  const tags = Array.isArray(parsed?.serviceTags)
    ? parsed!.serviceTags!.map(String).map((t) => t.trim()).filter(Boolean)
    : [...DEFAULT_INVOICE_SETTINGS.serviceTags];
  return {
    brandTitle:
      String(parsed?.brandTitle ?? DEFAULT_INVOICE_SETTINGS.brandTitle).trim() ||
      DEFAULT_INVOICE_SETTINGS.brandTitle,
    brandSubtitle:
      String(parsed?.brandSubtitle ?? DEFAULT_INVOICE_SETTINGS.brandSubtitle).trim() ||
      DEFAULT_INVOICE_SETTINGS.brandSubtitle,
    phone: String(parsed?.phone ?? DEFAULT_INVOICE_SETTINGS.phone).trim() || DEFAULT_INVOICE_SETTINGS.phone,
    address:
      String(parsed?.address ?? DEFAULT_INVOICE_SETTINGS.address).trim() || DEFAULT_INVOICE_SETTINGS.address,
    watermarkText:
      String(parsed?.watermarkText ?? DEFAULT_INVOICE_SETTINGS.watermarkText).trim() ||
      DEFAULT_INVOICE_SETTINGS.watermarkText,
    serviceTags: tags.length ? tags : [...DEFAULT_INVOICE_SETTINGS.serviceTags],
    invoiceTitle:
      String(parsed?.invoiceTitle ?? DEFAULT_INVOICE_SETTINGS.invoiceTitle).trim() ||
      DEFAULT_INVOICE_SETTINGS.invoiceTitle,
    footerText:
      String(parsed?.footerText ?? DEFAULT_INVOICE_SETTINGS.footerText).trim() ||
      DEFAULT_INVOICE_SETTINGS.footerText,
    paperSize: (['thermal_58', 'thermal_80', 'a4'].includes(String(parsed?.paperSize))
      ? (String(parsed?.paperSize) as InvoiceSettings['paperSize'])
      : DEFAULT_INVOICE_SETTINGS.paperSize),
  };
}

function writeLocalCache(settings: InvoiceSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* ignore quota */
  }
}

/** قراءة متزامنة من الكاش المحلي (للطباعة الفورية) */
export function loadInvoiceSettings(): InvoiceSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_INVOICE_SETTINGS, serviceTags: [...DEFAULT_INVOICE_SETTINGS.serviceTags] };
    return normalize(JSON.parse(raw) as Partial<InvoiceSettings>);
  } catch {
    return { ...DEFAULT_INVOICE_SETTINGS, serviceTags: [...DEFAULT_INVOICE_SETTINGS.serviceTags] };
  }
}

/** جلب من الخادم وتحديث الكاش — يُستدعى عند فتح الإعدادات وبعد تسجيل الدخول */
export async function fetchInvoiceSettings(): Promise<InvoiceSettings> {
  if (!getToken()) {
    return loadInvoiceSettings();
  }
  try {
    const remote = await apiRequest<InvoiceSettings>('/settings/print');
    const clean = normalize(remote);
    writeLocalCache(clean);
    return clean;
  } catch {
    return loadInvoiceSettings();
  }
}

/** حفظ على الخادم + الكاش المحلي */
export async function saveInvoiceSettings(settings: InvoiceSettings): Promise<InvoiceSettings> {
  const clean = normalize(settings);
  if (!getToken()) {
    writeLocalCache(clean);
    return clean;
  }
  const remote = await apiRequest<InvoiceSettings>(
    '/settings/print',
    { method: 'PUT', body: JSON.stringify(clean) },
    { queueLabel: 'حفظ إعدادات الطباعة' },
  );
  const saved = normalize(remote);
  writeLocalCache(saved);
  return saved;
}

/** استعادة الافتراضي على الخادم */
export async function resetInvoiceSettings(): Promise<InvoiceSettings> {
  if (!getToken()) {
    const defaults = { ...DEFAULT_INVOICE_SETTINGS, serviceTags: [...DEFAULT_INVOICE_SETTINGS.serviceTags] };
    writeLocalCache(defaults);
    return defaults;
  }
  const remote = await apiRequest<InvoiceSettings>(
    '/settings/print/reset',
    { method: 'PUT', body: '{}' },
    { queueLabel: 'استعادة إعدادات الطباعة' },
  );
  const clean = normalize(remote);
  writeLocalCache(clean);
  return clean;
}
