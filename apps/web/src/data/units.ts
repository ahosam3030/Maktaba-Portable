/** وحدات البيع/العرض — قابلة للتخصيص لكل جهاز (localStorage) */

const STORAGE_KEY = 'maktaba.saleUnits.v1';

export const DEFAULT_SALE_UNITS = [
  'قطعة',
  'ورقة',
  'نسخة',
  'علبة',
  'دستة',
  'كرتونة',
  'رزمة',
  'خدمة',
] as const;

export function loadSaleUnits(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [...DEFAULT_SALE_UNITS];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...DEFAULT_SALE_UNITS];
    const cleaned = parsed.map((x) => String(x).trim()).filter(Boolean);
    return cleaned.length > 0 ? Array.from(new Set(cleaned)) : [...DEFAULT_SALE_UNITS];
  } catch {
    return [...DEFAULT_SALE_UNITS];
  }
}

export function saveSaleUnits(units: string[]): string[] {
  const cleaned = Array.from(
    new Set(units.map((u) => u.trim()).filter(Boolean)),
  );
  const finalList = cleaned.length > 0 ? cleaned : [...DEFAULT_SALE_UNITS];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(finalList));
  return finalList;
}

export function resetSaleUnits(): string[] {
  localStorage.removeItem(STORAGE_KEY);
  return [...DEFAULT_SALE_UNITS];
}

export function addSaleUnit(name: string): string[] {
  const n = name.trim();
  if (!n) return loadSaleUnits();
  const current = loadSaleUnits();
  if (current.some((u) => u === n)) return current;
  return saveSaleUnits([...current, n]);
}
