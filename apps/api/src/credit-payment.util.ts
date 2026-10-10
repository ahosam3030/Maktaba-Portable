/** توزيع مبلغ تحصيل على فواتير آجلة من الأقدم للأحدث */

import { roundMoney } from './money.util';

export type OpenInvoice = {
  id: string;
  remaining: number;
};

export type Allocation = {
  saleId: string;
  applied: number;
  remainingAfter: number;
};

/**
 * يوزّع amount على openSales مرتبة من الأقدم.
 * لا يتجاوز متبقي كل فاتورة. يعيد ما تبقّى من المبلغ إن زاد.
 */
export function allocatePayment(
  openSales: OpenInvoice[],
  amount: number,
  targetSaleId?: string | null,
): { allocations: Allocation[]; leftover: number } {
  const pay = roundMoney(amount);
  if (!(pay > 0)) return { allocations: [], leftover: 0 };

  let left = pay;
  const allocations: Allocation[] = [];

  const list = targetSaleId
    ? openSales.filter((s) => s.id === targetSaleId)
    : openSales.filter((s) => roundMoney(s.remaining) > 0);

  for (const inv of list) {
    if (left <= 0) break;
    const due = roundMoney(Math.max(0, Number(inv.remaining) || 0));
    if (due <= 0) continue;
    const applied = roundMoney(Math.min(left, due));
    if (applied <= 0) continue;
    allocations.push({
      saleId: inv.id,
      applied,
      remainingAfter: roundMoney(due - applied),
    });
    left = roundMoney(left - applied);
  }

  return { allocations, leftover: left };
}

export function customerBalance(sales: { total: number; paidAmount: number }[]): number {
  const tot = sales.reduce((s, x) => s + roundMoney(Number(x.total) || 0), 0);
  const paid = sales.reduce((s, x) => s + roundMoney(Number(x.paidAmount) || 0), 0);
  return Math.max(0, roundMoney(tot - paid));
}
