import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';
import { AuthUser, CurrentUser, JwtAuthGuard, PermissionsGuard, RequirePermission } from './auth';

/** يفسّر YYYY-MM-DD كتاريخ محلي (بدون إزاحة UTC التي تُرجع اليوم السابق في القاهرة). */
function parseDateBound(value: string | undefined, endOfDay: boolean): Date | undefined {
  if (!value?.trim()) return undefined;
  const raw = value.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  let d: Date;
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const day = Number(m[3]);
    d = endOfDay
      ? new Date(y, mo, day, 23, 59, 59, 999)
      : new Date(y, mo, day, 0, 0, 0, 0);
  } else {
    d = new Date(raw);
    if (Number.isNaN(d.getTime())) throw new BadRequestException('تاريخ غير صحيح.');
    if (endOfDay) d.setHours(23, 59, 59, 999);
    else d.setHours(0, 0, 0, 0);
  }
  return d;
}

@Controller('reports')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission('reports')
export class ReportsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('summary')
  async summary(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const orgId = user.organizationId;
    const fromDate = parseDateBound(from, false);
    const toDate = parseDateBound(to, true);

    const saleDateFilter: Prisma.DateTimeFilter | undefined =
      fromDate || toDate ? { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lte: toDate } : {}) } : undefined;
    const purchaseDateFilter = saleDateFilter;
    const cashDateFilter = saleDateFilter;

    const [products, sales, purchaseInvoices, payments, returns, cashRows, allSalesItems, serviceReceipts] =
      await Promise.all([
      this.prisma.product.findMany({
        where: { organizationId: orgId },
        include: {
          purchaseItems: { where: { invoice: { organizationId: orgId } } },
          returnItems: {
            where: { purchaseReturn: { organizationId: orgId } },
            include: { invoiceItem: true },
          },
          stockMovements: { where: { organizationId: orgId } },
        },
      }),
      this.prisma.sale.findMany({
        where: { organizationId: orgId, ...(saleDateFilter ? { saleDate: saleDateFilter } : {}) },
        include: { items: true },
      }),
      this.prisma.purchaseInvoice.findMany({
        where: { organizationId: orgId, ...(purchaseDateFilter ? { invoiceDate: purchaseDateFilter } : {}) },
        include: { items: true },
      }),
      this.prisma.supplierPayment.findMany({
        where: { organizationId: orgId, ...(purchaseDateFilter ? { paymentDate: purchaseDateFilter } : {}) },
      }),
      this.prisma.purchaseReturn.findMany({
        where: { organizationId: orgId, ...(purchaseDateFilter ? { returnDate: purchaseDateFilter } : {}) },
      }),
      this.prisma.cashTransaction.findMany({
        where: { organizationId: orgId, ...(cashDateFilter ? { date: cashDateFilter } : {}) },
      }),
      this.prisma.saleItem.findMany({
        where: { sale: { organizationId: orgId, ...(saleDateFilter ? { saleDate: saleDateFilter } : {}) } },
      }),
      this.prisma.serviceReceipt.findMany({
        where: {
          organizationId: orgId,
          ...(saleDateFilter ? { receiptDate: saleDateFilter } : {}),
        },
        include: { items: true },
      }),
    ]);

    // --- Inventory balances & capital in stock ---
    const inventory = products.map((product) => {
      const purchased = product.purchaseItems.reduce(
        (sum, item) => sum + Number(item.quantity) * (item.unit === 'PACK' ? item.piecesPerPack : 1),
        0,
      );
      const returned = product.returnItems.reduce(
        (sum, item) =>
          sum + Number(item.quantity) * (item.invoiceItem.unit === 'PACK' ? item.invoiceItem.piecesPerPack : 1),
        0,
      );
      const sold = -product.stockMovements
        .filter((m) => m.type === 'SALE')
        .reduce((sum, m) => sum + Number(m.quantity), 0);
      const adjusted = product.stockMovements
        .filter((m) => m.type !== 'SALE' && m.type !== 'RETURN')
        .reduce((sum, m) => sum + Number(m.quantity), 0);
      const stock = purchased - returned - sold + adjusted;
      const cost = Number(product.currentCost) || 0;
      const salePrice = Number(product.salePrice) || 0;
      return {
        id: product.id,
        name: product.name,
        barcode: product.barcode,
        unit: product.unit,
        piecesPerPack: product.piecesPerPack,
        currentCost: cost,
        salePrice,
        purchased,
        returned,
        sold,
        adjusted,
        stock,
        valueAtCost: Math.max(0, stock) * cost,
        valueAtSale: Math.max(0, stock) * salePrice,
      };
    });

    const inventoryValueCost = inventory.reduce((s, i) => s + i.valueAtCost, 0);
    const inventoryValueSale = inventory.reduce((s, i) => s + i.valueAtSale, 0);
    const skusInStock = inventory.filter((i) => i.stock > 0).length;
    const skusTotal = inventory.length;
    const unitsInStock = inventory.reduce((s, i) => s + Math.max(0, i.stock), 0);

    // --- Period sales & COGS & profit ---
    const salesCount = sales.length;
    let salesRevenue = 0;
    let salesDiscount = 0;
    let salesNet = 0;
    let salesPaid = 0;
    let cogs = 0;
    let saleReturnsValue = 0;
    let saleReturnsCogs = 0;
    for (const sale of sales) {
      salesRevenue += Number(sale.subtotal);
      salesDiscount += Number(sale.discount);
      salesNet += Number(sale.total);
      salesPaid += Number(sale.paidAmount);
      const saleTotal = Number(sale.total) || 0;
      const saleSub = Number(sale.subtotal) || 0;
      for (const item of sale.items) {
        const qty = Number(item.quantity) || 0;
        const returned = Number(item.returnedQuantity ?? 0);
        const effectiveQty = Math.max(0, qty - returned);
        cogs += effectiveQty * Number(item.unitCost || 0);
        if (returned > 0) {
          const lineShare = saleSub > 0 ? (Number(item.lineTotal) / saleSub) * saleTotal : Number(item.lineTotal);
          saleReturnsValue += (returned / qty) * lineShare;
          saleReturnsCogs += returned * Number(item.unitCost || 0);
        }
      }
    }
    salesNet = Math.max(0, salesNet - saleReturnsValue);
    salesRevenue = Math.max(0, salesRevenue - saleReturnsValue);

    // also from allSalesItems if needed - already in sales.items
    void allSalesItems;
    const grossProfit = salesNet - cogs;

    // --- Services period ---
    let servicesCount = serviceReceipts.length;
    let servicesSubtotal = 0;
    let servicesFees = 0;
    let servicesDiscount = 0;
    let servicesNet = 0;
    let servicesPaid = 0;
    for (const r of serviceReceipts) {
      // FIX: ServiceReceipt model has no `subtotal` field (only total, extraFees, discount).
      const fees = Number(r.extraFees) || 0;
      const disc = Number(r.discount) || 0;
      const tot = Number(r.total) || 0;
      servicesSubtotal += Math.max(0, tot - fees + disc);
      servicesFees += fees;
      servicesDiscount += disc;
      servicesNet += tot;
      servicesPaid += Number(r.paidAmount) || 0;
    }
    const servicesDue = Math.max(0, servicesNet - servicesPaid);
    const combinedRevenue = salesNet + servicesNet;
    const combinedProfit = grossProfit + servicesNet; // services have no COGS in this model


    // --- Purchases period ---
    let purchasesTotal = 0;
    let purchasesPaidOnInvoice = 0;
    for (const inv of purchaseInvoices) {
      purchasesTotal += Number(inv.total);
      purchasesPaidOnInvoice += Number(inv.paidAmount);
    }
    const supplierPayments = payments.reduce((s, p) => s + Number(p.amount), 0);
    const purchaseReturnsTotal = returns.reduce((s, r) => s + Number(r.total), 0);

    // All-time payables (not only period): invoices total - invoice paid - returns approx
    const allInvoices = await this.prisma.purchaseInvoice.findMany({
      where: { organizationId: orgId },
      select: { total: true, paidAmount: true },
    });
    const allPayments = await this.prisma.supplierPayment.aggregate({
      where: { organizationId: orgId },
      _sum: { amount: true },
    });
    const allReturns = await this.prisma.purchaseReturn.aggregate({
      where: { organizationId: orgId },
      _sum: { total: true },
    });
    const purchasesAllTime = allInvoices.reduce((s, i) => s + Number(i.total), 0);
    const paidAllTime =
      allInvoices.reduce((s, i) => s + Number(i.paidAmount), 0) + Number(allPayments._sum.amount ?? 0);
    // avoid double count: paidAmount on invoice often also in payments - use max logic:
    // supplier debt ≈ sum(invoice.total - invoice.paidAmount) - returns, payments outside invoice reduce debt further
    const openOnInvoices = allInvoices.reduce((s, i) => s + Math.max(0, Number(i.total) - Number(i.paidAmount)), 0);
    // Extra payments not tied to paidAmount field are hard; use openOnInvoices as primary debt signal
    // مديونية الموردين = (إجمالي فواتير الوارد − مدفوع على الفواتير − دفعات منفصلة − مرتجعات) بحد أدنى 0
    // openOnInvoices أصلاً = sum(total - paidAmount) على الفواتير
    const extraPayments = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
    // تجنّب خصم المدفوع مرتين: openOnInvoices يخصم paidAmount؛ الدفعات المنفصلة تخصم أيضاً
    const supplierDebt = Math.max(0, openOnInvoices - Number(allReturns._sum.total ?? 0));
    // ملاحظة: إن كانت الدفعات تحدّث paidAmount على الفاتورة فـ openOnInvoices كافٍ؛ وإلا تُطرح الدفعات:
    // const supplierDebt = Math.max(0, openOnInvoices - extraPayments - Number(allReturns._sum.total ?? 0));

    // --- Cash ---
    let cashIncome = 0;
    let cashExpense = 0;
    let cashFromSales = 0;
    let cashFromServices = 0;
    let cashOtherIncome = 0;
    for (const row of cashRows) {
      const a = Number(row.amount);
      if (row.kind === 'INCOME') {
        cashIncome += a;
        const cat = (row.category || '').trim();
        if (cat === 'مبيعات') cashFromSales += a;
        else if (cat === 'خدمات') cashFromServices += a;
        else cashOtherIncome += a;
      } else {
        cashExpense += a;
      }
    }
    const cashNet = cashIncome - cashExpense;

    // All-time cash for capital remaining
    const allCash = await this.prisma.cashTransaction.findMany({
      where: { organizationId: orgId },
      select: { kind: true, amount: true },
    });
    let cashAllIncome = 0;
    let cashAllExpense = 0;
    for (const row of allCash) {
      const a = Number(row.amount);
      if (row.kind === 'INCOME') cashAllIncome += a;
      else cashAllExpense += a;
    }
    const cashBalance = cashAllIncome - cashAllExpense;

    // رأس المال في البضاعة = قيمة المخزون بالتكلفة
    // رأس المال السائل ≈ رصيد الخزينة
    // رأس المال العامل ≈ نقد + مخزون − مديونية الموردين
    const capitalInStock = inventoryValueCost;
    const liquidCapital = cashBalance;
    const workingCapital = cashBalance + inventoryValueCost - supplierDebt;

    return {
      period: { from: from || null, to: to || null },
      inventory: {
        skusTotal,
        skusInStock,
        unitsInStock,
        valueAtCost: inventoryValueCost,
        valueAtSale: inventoryValueSale,
        potentialProfit: inventoryValueSale - inventoryValueCost,
        items: inventory.sort((a, b) => b.valueAtCost - a.valueAtCost),
      },
      sales: {
        count: salesCount,
        revenue: salesRevenue,
        discount: salesDiscount,
        net: salesNet,
        paid: salesPaid,
        due: Math.max(0, salesNet - salesPaid),
        cogs,
        grossProfit,
        grossMarginPct: salesNet > 0 ? (grossProfit / salesNet) * 100 : 0,
      },
      services: {
        count: servicesCount,
        subtotal: servicesSubtotal,
        fees: servicesFees,
        discount: servicesDiscount,
        net: servicesNet,
        paid: servicesPaid,
        due: servicesDue,
      },
      combined: {
        revenue: combinedRevenue,
        profit: combinedProfit,
      },
      purchases: {
        invoicesCount: purchaseInvoices.length,
        total: purchasesTotal,
        paidOnInvoices: purchasesPaidOnInvoice,
        supplierPayments,
        returns: purchaseReturnsTotal,
        supplierDebt,
        purchasesAllTime,
      },
      cash: {
        income: cashIncome,
        expense: cashExpense,
        net: cashNet,
        balanceAllTime: cashBalance,
        fromSales: cashFromSales,
        fromServices: cashFromServices,
        otherIncome: cashOtherIncome,
      },
      capital: {
        inStock: capitalInStock,
        liquid: liquidCapital,
        supplierDebt,
        working: workingCapital,
        remaining: workingCapital,
      },
    };
  }

  @Get('profit-series')
  async profitSeries(
    @CurrentUser() user: AuthUser,
    @Query('groupBy') groupBy: string = 'day',
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const g = (groupBy || 'day').toLowerCase();
    if (!['day', 'month', 'year'].includes(g)) {
      throw new BadRequestException('groupBy يجب أن يكون day أو month أو year.');
    }
    const fromDate = parseDateBound(from, false) || new Date(new Date().getFullYear(), 0, 1);
    const toDate = parseDateBound(to, true) || new Date();

    const sales = await this.prisma.sale.findMany({
      where: {
        organizationId: user.organizationId,
        saleDate: { gte: fromDate, lte: toDate },
      },
      include: { items: true },
      orderBy: { saleDate: 'asc' },
    });

    type Bucket = { key: string; label: string; salesNet: number; cogs: number; profit: number; count: number };
    const map = new Map<string, Bucket>();

    for (const sale of sales) {
      const d = new Date(sale.saleDate);
      let key: string;
      let label: string;
      if (g === 'year') {
        key = String(d.getFullYear());
        label = key;
      } else if (g === 'month') {
        key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        label = key;
      } else {
        key = d.toISOString().slice(0, 10);
        label = key;
      }
      let b = map.get(key);
      if (!b) {
        b = { key, label, salesNet: 0, cogs: 0, profit: 0, count: 0 };
        map.set(key, b);
      }
      const net = Number(sale.total);
      let cogs = 0;
      for (const item of sale.items) cogs += Number(item.unitCost) * Number(item.quantity);
      b.salesNet += net;
      b.cogs += cogs;
      b.profit += net - cogs;
      b.count += 1;
    }

    const series = Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
    return { groupBy: g, from: fromDate.toISOString(), to: toDate.toISOString(), series };
  }
}
