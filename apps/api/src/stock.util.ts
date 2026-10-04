/**
 * حساب رصيد الصنف بالقطعة من حركات الشراء والمرتجع والمخزون.
 * يُستخدم في البيع والتسويات والتقارير بنفس المعادلة.
 *
 * مهم: حركات type=RETURN (مرتجع شراء) لا تُحسب هنا لأنها ممثّلة في جدول returnItems
 * حتى لا يُخصم المرتجع مرتين.
 */
export type PurchaseLineLike = {
  quantity: number;
  unit?: string | null;
  piecesPerPack?: number | null;
};

export type MovementLike = {
  quantity: number;
  type?: string | null;
};

const PACK_UNITS = new Set([
  'PACK',
  'علبة',
  'علبه',
  'دستة',
  'دسته',
  'كرتونة',
  'كرتونه',
  'رزمة',
  'رزم',
  'BOX',
  'CARTON',
  'DOZEN',
]);

export function isPackUnit(unit?: string | null): boolean {
  const u = (unit || '').trim().toUpperCase();
  if (PACK_UNITS.has(u)) return true;
  // Arabic already in set; also common Latin
  const lower = (unit || '').trim();
  return PACK_UNITS.has(lower);
}

export function piecesFromPurchaseLine(line: PurchaseLineLike): number {
  const qty = Number(line.quantity) || 0;
  const ppp = Math.max(1, Number(line.piecesPerPack) || 1);
  if (isPackUnit(line.unit)) return qty * ppp;
  return qty;
}

/** كمية البيع بالقطعة حسب وحدة السطر وقطع العبوة المسجّلة على الصنف */
export function piecesFromSaleLine(
  quantity: number,
  unit: string | null | undefined,
  piecesPerPack: number | null | undefined,
): number {
  const qty = Number(quantity) || 0;
  const ppp = Math.max(1, Number(piecesPerPack) || 1);
  if (isPackUnit(unit)) return qty * ppp;
  return qty;
}

/**
 * purchased - purchaseReturns + movements
 * movements: SALE (سالب) + ADJUSTMENT + أي نوع عدا RETURN
 */
export function computeStockPieces(input: {
  purchases: PurchaseLineLike[];
  returns: PurchaseLineLike[];
  movements: MovementLike[];
}): number {
  const purchased = input.purchases.reduce((s, l) => s + piecesFromPurchaseLine(l), 0);
  const returned = input.returns.reduce((s, l) => s + piecesFromPurchaseLine(l), 0);
  const moved = input.movements
    .filter((m) => {
      const t = (m.type || '').toUpperCase();
      // مرتجع الشراء يُحسب من returnItems فقط
      return t !== 'RETURN';
    })
    .reduce((s, m) => s + (Number(m.quantity) || 0), 0);
  return purchased - returned + moved;
}

export function assertSufficientStock(available: number, requested: number, productName: string): void {
  if (requested > available + 1e-9) {
    throw new Error(`الرصيد غير كافٍ للصنف ${productName}. المتاح: ${roundStock(available)}`);
  }
}

export function roundStock(n: number): number {
  return Math.round(n * 1000) / 1000;
}
