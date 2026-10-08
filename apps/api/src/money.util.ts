/** حسابات مالية آمنة — تقريب إلى قرشين بدون float drift كبير */

export function roundMoney(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function lineTotal(quantity: number, unitPrice: number): number {
  return roundMoney((Number(quantity) || 0) * (Number(unitPrice) || 0));
}

export function sumMoney(values: number[]): number {
  return roundMoney(values.reduce((s, v) => s + (Number(v) || 0), 0));
}
