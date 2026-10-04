import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiRequest, getToken } from '../data/api';
import { ScanModeOverlay } from './ScanModeOverlay';
import { ProductPriceReport } from './ProductPriceReport';
import { IconCart, IconReceipt, IconWallet, IconTag, IconRefresh, IconPackage } from './Icons';
import { noticeClass, noticeKind } from './notice';

type Supplier = { id: string; name: string; phone?: string | null };
type InvoiceItem = {
  id: string; productId: string; productName: string; unit: string; quantity: number | string;
  unitCost: number | string; piecesPerPack: number; lineTotal: number | string; returnedQuantity: number | string;
};
type Invoice = {
  id: string; invoiceNumber: string; invoiceDate: string; supplierId: string;
  supplier?: { id: string; name: string }; items: InvoiceItem[];
  subtotal: number | string; discount: number | string; total: number | string; paidAmount: number | string; notes?: string | null;
  returns?: unknown[];
};
type Payment = { id: string; supplierId: string; amount: number | string; paymentDate: string; method: string; supplier?: { name: string } };
type PurchaseReturn = { id: string; invoiceId: string; total: number | string; returnDate: string; items: Array<{ productId: string; quantity: number | string }> };

const money = (n: number) => `${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;
const num = (v: number | string) => Number(v) || 0;

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));
}


type InventoryProduct = {
    id: string;
    name: string;
    barcode: string | null;
    unit: string;
    piecesPerPack: number;
    currentCost: number;
    salePrice: number;
    stock: number;
  };
export function Purchases() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [returns, setReturns] = useState<PurchaseReturn[]>([]);
  const [catalog, setCatalog] = useState<InventoryProduct[]>([]);
  const [loading, setLoading] = useState(true);

  const [scanMode, setScanMode] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    if (!notice) return;
    if (noticeKind(notice) !== 'success') return;
    const id = window.setTimeout(() => setNotice(''), 4500);
    return () => window.clearTimeout(id);
  }, [notice]);

  const [pageTab, setPageTab] = useState<'invoice' | 'payments' | 'returns' | 'report' | 'history'>('invoice');

  const PURCHASE_UNITS = [
    { label: 'قطعة', api: 'PIECE' as const, defaultPcs: 1 },
    { label: 'علبة', api: 'PACK' as const, defaultPcs: 1 },
    { label: 'دستة', api: 'PACK' as const, defaultPcs: 12 },
    { label: 'كرتونة', api: 'PACK' as const, defaultPcs: 1 },
    { label: 'رزمة', api: 'PACK' as const, defaultPcs: 1 },
  ];
  type DraftLine = {
    key: string;
    barcode: string;
    productName: string;
    unitLabel: string;
    quantity: string;
    piecesPerPack: string;
    unitCost: string;
    salePrice: string;
    productId?: string;
    stock?: number | null;
  };  const newDraftKey = () => `P-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const emptyDraftLine = (): DraftLine => ({
    key: newDraftKey(),
    barcode: '',
    productName: '',
    unitLabel: 'قطعة',
    quantity: '1',
    piecesPerPack: '1',
    unitCost: '',
    salePrice: '',
    productId: undefined,
    stock: null,
  });

  const [supplierName, setSupplierName] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [lines, setLines] = useState<DraftLine[]>([emptyDraftLine(), emptyDraftLine(), emptyDraftLine()]);
  const [discount, setDiscount] = useState('0');
  const [paid, setPaid] = useState('0');
  const [notes, setNotes] = useState('');
  const [search, setSearch] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [filterPay, setFilterPay] = useState<'all' | 'paid' | 'partial' | 'unpaid'>('all');
  const [paymentSearch, setPaymentSearch] = useState('');
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [paymentSupplierId, setPaymentSupplierId] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));

  const [returnInvoiceId, setReturnInvoiceId] = useState('');
  const [returnItemId, setReturnItemId] = useState('');
  const [returnQty, setReturnQty] = useState('1');

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setError('سجّل الدخول أولًا لاستخدام فواتير الوارد على الخادم.');
      setLoading(false);
      return;
    }
    setLoading(true); setError('');
    try {
      const [s, inv, pay, ret, stock] = await Promise.all([
        apiRequest<Supplier[]>('/suppliers'),
        apiRequest<Invoice[]>('/purchases/invoices'),
        apiRequest<Payment[]>('/suppliers/payments'),
        apiRequest<PurchaseReturn[]>('/purchases/returns'),
        apiRequest<InventoryProduct[]>('/inventory'),
      ]);
      setSuppliers(s); setInvoices(inv); setPayments(pay); setReturns(ret); setCatalog(stock);
      if (!paymentSupplierId && s[0]) setPaymentSupplierId(s[0].id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل بيانات المشتريات.');
    } finally {
      setLoading(false);
    }
  }, [paymentSupplierId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const filledLines = useMemo(() => lines.filter((l) => l.productName.trim() && Number(l.quantity) > 0 && Number(l.unitCost) >= 0 && l.unitCost !== ''), [lines]);
  const subtotal = useMemo(
    () => filledLines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitCost) || 0), 0),
    [filledLines],
  );
  const discountN = Math.max(0, Number(discount) || 0);
  const total = Math.max(0, subtotal - discountN);

  function updateDraft(key: string, patch: Partial<DraftLine>) {
    setLines((old) => old.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function addDraftRow() {
    setLines((old) => [...old, emptyDraftLine()]);
  }

  function removeDraftRow(key: string) {
    setLines((old) => (old.length <= 1 ? [emptyDraftLine()] : old.filter((l) => l.key !== key)));
  }

  function clearDraft() {
    setLines([emptyDraftLine(), emptyDraftLine(), emptyDraftLine()]);
    setInvoiceNo('');
    setPaid('0');
    setDiscount('0');
    setNotes('');
    setNotice('');
    setEditingInvoiceId(null);
  }

  function unitLabelFromApi(unit: string): string {
    return unit === 'PACK' ? 'علبة' : 'قطعة';
  }

  function startEditInvoice(invoice: Invoice) {
    if (invoice.returns && (invoice.returns as unknown[]).length > 0) {
      setNotice('تنبيه: الفاتورة عليها مرتجعات. التعديل قد يحتاج مراجعة يدوية.');
    }
    setEditingInvoiceId(invoice.id);
    setSupplierName(invoice.supplier?.name || '');
    setInvoiceNo(invoice.invoiceNumber);
    setDate(String(invoice.invoiceDate).slice(0, 10));
    setDiscount(String(num(invoice.discount)));
    setPaid(String(num(invoice.paidAmount)));
    setNotes(invoice.notes || '');
    const mapped = (invoice.items || []).map((it) => {
      const cat = catalog.find((p) => p.id === it.productId);
      return {
        key: newDraftKey(),
        barcode: cat?.barcode || '',
        productName: it.productName,
        unitLabel: unitLabelFromApi(it.unit),
        quantity: String(num(it.quantity)),
        piecesPerPack: String(it.piecesPerPack || 1),
        unitCost: String(num(it.unitCost)),
        salePrice: cat && cat.salePrice > 0 ? String(cat.salePrice) : '',
        productId: it.productId,
        stock: cat ? cat.stock : null,
      };
    });
    setLines(mapped.length ? mapped : [emptyDraftLine()]);
    setNotice(`جارٍ تعديل الفاتورة ${invoice.invoiceNumber}. احفظ لتطبيق التعديل على المخزون.`);
    try {
      document.getElementById('purchase-invoice-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch {
      /* ignore */
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((old) => (old.includes(id) ? old.filter((x) => x !== id) : [...old, id]));
  }

  async function bulkDeleteInvoices() {
    if (selectedIds.length === 0) {
      setNotice('حدّد فاتورة واحدة على الأقل.');
      return;
    }
    if (!confirm(`حذف ${selectedIds.length} فاتورة وارد دفعة واحدة؟\nسيتم عكس أثرها على المخزون.`)) return;
    const ids = [...selectedIds];
    let ok = 0;
    let fail = 0;
    for (const id of ids) {
      try {
        await apiRequest(`/purchases/invoices/${id}`, { method: 'DELETE' }, { queueLabel: 'حذف — حفظ فاتورة وارد' });
        ok += 1;
      } catch {
        fail += 1;
      }
    }
    setSelectedIds([]);
    if (editingInvoiceId && ids.includes(editingInvoiceId)) setEditingInvoiceId(null);
    await refresh();
    setNotice(fail ? `تم حذف ${ok} وفشل ${fail}.` : `تم حذف ${ok} فاتورة.`);
  }

  function nextPurchaseInvoiceNo(): string {
    let max = 0;
    for (const inv of invoices) {
      const m = String(inv.invoiceNumber || '').match(/(\d+)\s*$/);
      if (m) {
        const n = parseInt(m[1], 10);
        if (n > max) max = n;
      }
    }
    return String(max + 1);
  }

  function unitApi(label: string): 'PIECE' | 'PACK' {
    return PURCHASE_UNITS.find((u) => u.label === label)?.api || 'PIECE';
  }

  function piecePrice(l: DraftLine): number | null {
    const cost = Number(l.unitCost);
    if (!Number.isFinite(cost) || l.unitCost === '') return null;
    if (unitApi(l.unitLabel) === 'PACK') {
      const ppp = Math.max(1, Math.floor(Number(l.piecesPerPack) || 1));
      return cost / ppp;
    }
    return cost;
  }

  /** آخر سعر لنفس الصنف/الوحدة من فواتير سابقة (مثل النسخة القديمة) */
  function lastPurchaseHint(name: string, unitLabel: string): string {
    const n = name.trim().toLowerCase();
    if (!n) return '';
    const unit = unitApi(unitLabel);
    const matches = allPricePoints.filter(
      (p) => p.productName.toLowerCase() === n && (unit === 'PACK' ? p.unit === 'علبة' : p.unit === 'قطعة'),
    );
    // fallback: any unit same name
    const list = matches.length ? matches : allPricePoints.filter((p) => p.productName.toLowerCase() === n);
    if (!list.length) return '';
    const last = list[list.length - 1];
    return `«${last.productName}»: آخر سعر ${last.unitCost} ج من ${last.supplier} بتاريخ ${last.date}`;
  }

  function normalizeBarcode(raw: string): string {
    return (raw || '').trim().replace(/\s+/g, '');
  }

  function findCatalogProduct(query?: string): InventoryProduct | undefined {
    const q = (query || '').trim().toLowerCase();
    if (!q) return undefined;
    const qBc = normalizeBarcode(query || '').toLowerCase();
    const byBarcode = catalog.find((p) => {
      const pb = normalizeBarcode(p.barcode || '').toLowerCase();
      return pb && (pb === qBc || pb === q);
    });
    if (byBarcode) return byBarcode;
    const exactName = catalog.find((p) => p.name.trim().toLowerCase() === q);
    if (exactName) return exactName;
    const contains = catalog.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.barcode || '').toLowerCase().includes(q),
    );
    if (!contains.length) return undefined;
    // فضّل الأصناف المتوفرة في المخزون
    const inStock = contains.filter((p) => Number(p.stock) > 0);
    const pool = inStock.length ? inStock : contains;
    pool.sort((a, b) => Number(b.stock) - Number(a.stock) || a.name.localeCompare(b.name, 'ar'));
    return pool[0];
  }

  function applyProductToLine(key: string, product: InventoryProduct) {
    const unitLabel = product.unit === 'PACK' ? 'علبة' : 'قطعة';
    const ppp = Math.max(1, product.piecesPerPack || 1);
    // currentCost في المخزون = تكلفة القطعة؛ عند الشراء بالعلبة نقترح سعر العلبة
    const suggestedUnitCost =
      product.currentCost > 0
        ? unitLabel === 'علبة'
          ? String(Number((product.currentCost * ppp).toFixed(4)))
          : String(product.currentCost)
        : '';
    updateDraft(key, {
      productId: product.id,
      productName: product.name,
      barcode: product.barcode || '',
      unitLabel,
      piecesPerPack: String(ppp),
      unitCost: suggestedUnitCost,
      salePrice: product.salePrice > 0 ? String(product.salePrice) : '',
      stock: product.stock,
    });
    setNotice(
      `تم جلب «${product.name}» — المتبقي: ${product.stock} قطعة | تكلفة/قطعة: ${product.currentCost} | بيع: ${product.salePrice}`,
    );
  }

  function ensureEmptyRowAfter(key: string) {
    setLines((old) => {
      const idx = old.findIndex((l) => l.key === key);
      const hasEmptyAfter = old.some(
        (l, i) => i > idx && !l.productName.trim() && !l.barcode.trim() && !l.unitCost,
      );
      if (hasEmptyAfter) return old;
      return [...old, emptyDraftLine()];
    });
  }

  function fillFromBarcode(key: string, barcode: string) {
    const bc = normalizeBarcode(barcode);
    if (!bc) return;
    const product = findCatalogProduct(bc);
    if (product) {
      applyProductToLine(key, product);
      ensureEmptyRowAfter(key);
      return;
    }
    // صنف جديد: ثبت الباركود وركّز على الاسم ليكمل المستخدم البيانات
    updateDraft(key, {
      barcode: bc,
      productId: '',
      productName: '',
      stock: null,
    });
    setNotice(
      `باركود جديد «${bc}» — اكتب اسم الصنف وسعر الشراء ثم احفظ الفاتورة (سيُسجَّل في المخزون تلقائيًا).`,
    );
    ensureEmptyRowAfter(key);
    requestAnimationFrame(() => {
      const el = document.querySelector(
        `input[data-line-key="${key}"][data-field="productName"]`,
      ) as HTMLInputElement | null;
      el?.focus();
      el?.select();
    });
  }



  function fillFromProductName(key: string, name: string) {
    const product = findCatalogProduct(name);
    if (product) {
      applyProductToLine(key, product);
      ensureEmptyRowAfter(key);
    }
  }

  function lineProfitPerPiece(l: DraftLine): number | null {
    const cost = piecePrice(l);
    const sale = Number(l.salePrice);
    if (cost === null || !Number.isFinite(sale) || l.salePrice === '') return null;
    return sale - cost;
  }

  function printDraftInvoice() {
    const items = filledLines;
    if (!supplierName.trim() && items.length === 0) {
      setNotice('أدخل بيانات للطباعة.');
      return;
    }
    const draft: Invoice = {
      id: 'draft',
      invoiceNumber: invoiceNo.trim() || 'مسودة',
      invoiceDate: date,
      supplierId: '',
      supplier: { id: '', name: supplierName.trim() || '—' },
      items: items.map((l, i) => ({
        id: String(i),
        productId: '',
        productName: l.productName.trim(),
        unit: unitApi(l.unitLabel),
        quantity: Number(l.quantity) || 0,
        unitCost: Number(l.unitCost) || 0,
        piecesPerPack: unitApi(l.unitLabel) === 'PACK' ? Math.max(1, Math.floor(Number(l.piecesPerPack) || 1)) : 1,
        lineTotal: (Number(l.quantity) || 0) * (Number(l.unitCost) || 0),
        returnedQuantity: 0,
      })),
      subtotal,
      discount: discountN,
      total,
      paidAmount: Math.min(total, Math.max(0, Number(paid) || 0)),
    };
    printInvoice(draft);
  }

  async function saveInvoice(andPrint = false) {
    if (!supplierName.trim()) {
      setNotice('أدخل اسم الشركة / المورد.');
      return;
    }
    if (filledLines.length === 0) {
      setNotice('أضف صنفًا واحدًا على الأقل (اسم + كمية + سعر).');
      return;
    }
    const invNo = invoiceNo.trim() || nextPurchaseInvoiceNo();
    const paidN = Math.min(total, Math.max(0, Number(paid) || 0));
    const wasEditing = Boolean(editingInvoiceId);
    try {
      const supplier = await apiRequest<Supplier>('/suppliers', {
        method: 'POST',
        body: JSON.stringify({ name: supplierName.trim() }),
      }, { queueLabel: 'حفظ/تأكيد مورد' });
      if (editingInvoiceId) {
        await apiRequest(`/purchases/invoices/${editingInvoiceId}`, { method: 'DELETE' }, { queueLabel: 'حذف — حفظ فاتورة وارد' });
      }
      const created = await apiRequest<Invoice>('/purchases/invoices', {
        method: 'POST',
        body: JSON.stringify({
          supplierId: supplier.id,
          invoiceNumber: invNo,
          invoiceDate: date,
          discount: discountN,
          paidAmount: paidN,
          notes: notes.trim() || undefined,
          items: filledLines.map((l) => ({
            productName: l.productName.trim(),
            barcode: l.barcode.trim() || undefined,
            unit: unitApi(l.unitLabel),
            quantity: Number(l.quantity),
            unitCost: Number(l.unitCost),
            piecesPerPack: unitApi(l.unitLabel) === 'PACK' ? Math.max(1, Math.floor(Number(l.piecesPerPack) || 1)) : 1,
            salePrice: l.salePrice !== '' && Number.isFinite(Number(l.salePrice)) ? Number(l.salePrice) : undefined,
          })),
        }),
      });
      setNotice(wasEditing ? `تم تحديث فاتورة الوارد ${created.invoiceNumber}.` : `تم حفظ فاتورة الوارد ${created.invoiceNumber}.`);
      const keepSupplier = supplierName;
      clearDraft();
      setSupplierName(keepSupplier);
      await refresh();
      if (andPrint && created?.id) printInvoice(created);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'تعذر حفظ الفاتورة.');
    }
  }

  async function savePayment() {
    const amount = Number(paymentAmount);
    if (!paymentSupplierId || !Number.isFinite(amount) || amount <= 0) {
      setNotice('اختر المورد وأدخل مبلغ الدفعة.');
      return;
    }
    try {
      await apiRequest('/suppliers/payments', {
        method: 'POST',
        body: JSON.stringify({ supplierId: paymentSupplierId, amount, paymentDate, method: 'CASH' }),
      }, { queueLabel: 'دفعة مورد' });
      setNotice('تم تسجيل الدفعة.');
      setPaymentAmount('');
      await refresh();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'تعذر تسجيل الدفعة.');
    }
  }

  async function deletePurchaseInvoice(invoice: Invoice) {
    if (!confirm(`حذف فاتورة الوارد رقم ${invoice.invoiceNumber}؟\nسيتم خصم الكميات من المخزون.`)) return;
    try {
      await apiRequest(`/purchases/invoices/${invoice.id}`, { method: 'DELETE' }, { queueLabel: 'حذف — حفظ فاتورة وارد' });
      setNotice(`تم حذف فاتورة الوارد ${invoice.invoiceNumber}.`);
      await refresh();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'تعذر حذف الفاتورة.');
    }
  }

  async function saveReturn() {
    const q = Number(returnQty);
    if (!returnInvoiceId || !returnItemId || !Number.isFinite(q) || q <= 0) {
      setNotice('اختر الفاتورة والصنف وكمية المرتجع.');
      return;
    }
    try {
      await apiRequest('/purchases/returns', {
        method: 'POST',
        body: JSON.stringify({ invoiceId: returnInvoiceId, items: [{ invoiceItemId: returnItemId, quantity: q }] }),
      });
      setNotice('تم تسجيل المرتجع.');
      setReturnQty('1');
      await refresh();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'تعذر تسجيل المرتجع.');
    }
  }

  function printInvoice(invoice: Invoice) {
    const w = window.open('', '_blank');
    if (!w) return;
    const rows = invoice.items.map((l) =>
      `<tr><td>${escapeHtml(l.productName)}</td><td>${l.unit === 'PACK' ? 'علبة' : 'قطعة'}</td><td>${num(l.quantity)}</td><td>${l.piecesPerPack}</td><td>${money(num(l.unitCost))}</td><td>${money(num(l.lineTotal))}</td></tr>`
    ).join('');
    w.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>فاتورة ${escapeHtml(invoice.invoiceNumber)}</title>
<style>body{font-family:Tahoma,Arial;padding:24px;color:#222}h1{font-size:22px}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{border:1px solid #bbb;padding:8px;text-align:right;font-size:13px}th{background:#eee}.totals{margin-top:20px;width:320px;margin-right:auto}.totals div{display:flex;justify-content:space-between;padding:5px}</style>
</head><body><h1>فاتورة مشتريات / وارد</h1>
<p>رقم الفاتورة: ${escapeHtml(invoice.invoiceNumber)} &nbsp; | &nbsp; التاريخ: ${escapeHtml(String(invoice.invoiceDate).slice(0, 10))}</p>
<p>المورد: ${escapeHtml(invoice.supplier?.name || '')}</p>
<table><thead><tr><th>الصنف</th><th>الوحدة</th><th>الكمية</th><th>قطعة/علبة</th><th>سعر الوحدة</th><th>الإجمالي</th></tr></thead><tbody>${rows}</tbody></table>
<div class="totals"><div><span>قبل الخصم</span><b>${money(num(invoice.subtotal))}</b></div>
<div><span>الخصم</span><b>${money(num(invoice.discount))}</b></div>
<div><span>الإجمالي</span><b>${money(num(invoice.total))}</b></div>
<div><span>المدفوع</span><b>${money(num(invoice.paidAmount))}</b></div></div>
<script>window.onload=()=>window.print()</script></body></html>`);
    w.document.close();
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return invoices.filter((i) => {
      const hay = `${i.invoiceNumber} ${i.supplier?.name || ''} ${i.notes || ''}`.toLowerCase();
      if (q && !hay.includes(q)) return false;
      const d = String(i.invoiceDate).slice(0, 10);
      if (filterFrom && d < filterFrom) return false;
      if (filterTo && d > filterTo) return false;
      const total = num(i.total);
      const paid = num(i.paidAmount);
      const status = paid <= 0 ? 'unpaid' : paid + 0.001 >= total ? 'paid' : 'partial';
      if (filterPay !== 'all' && status !== filterPay) return false;
      return true;
    });
  }, [invoices, search, filterFrom, filterTo, filterPay]);

  const filteredPayments = useMemo(() => {
    const q = paymentSearch.trim().toLowerCase();
    if (!q) return payments;
    return payments.filter((p) =>
      `${p.supplier?.name || ''} ${p.method} ${p.paymentDate}`.toLowerCase().includes(q),
    );
  }, [payments, paymentSearch]);

  function toggleSelectAllFiltered() {
    const ids = filtered.map((i) => i.id);
    const allOn = ids.length > 0 && ids.every((id) => selectedIds.includes(id));
    setSelectedIds(allOn ? selectedIds.filter((id) => !ids.includes(id)) : Array.from(new Set([...selectedIds, ...ids])));
  }

  const selectedInvoice = invoices.find((i) => i.id === returnInvoiceId);

  type PricePoint = {
    date: string;
    supplier: string;
    productName: string;
    unit: string;
    quantity: number;
    unitCost: number;
    invoiceNumber: string;
    invoiceId: string;
  };

  const allPricePoints = useMemo(() => {
    const points: PricePoint[] = [];
    for (const inv of invoices) {
      for (const it of inv.items || []) {
        points.push({
          date: String(inv.invoiceDate).slice(0, 10),
          supplier: inv.supplier?.name || '—',
          productName: it.productName,
          unit: it.unit === 'PACK' ? 'علبة' : 'قطعة',
          quantity: num(it.quantity),
          unitCost: num(it.unitCost),
          invoiceNumber: inv.invoiceNumber,
          invoiceId: inv.id,
        });
      }
    }
    return points.sort((a, b) => a.date.localeCompare(b.date));
  }, [invoices]);

  const purchaseStats = {
    invoices: invoices.length,
    suppliers: suppliers.length,
    payments: payments.length,
    returns: returns.length,
  };

  return (
    <div className="purchases-page">
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <button type="button" className="primary-btn" onClick={() => setScanMode(true)}>مسح باركود</button>
      </div>
      <div className="purchase-title">
        <div>
          <span className="eyebrow">العمليات</span>
          <h1>المشتريات</h1>
          <p>فواتير الوارد · الدفعات · المرتجعات · تاريخ الأسعار</p>
        </div>
        <button className="secondary-btn" type="button" onClick={() => void refresh()}>
          <IconRefresh size={16} />
          <span>تحديث</span>
        </button>
      </div>

      <div className="pur-stats">
        <div className="pur-stat">
          <span className="pur-stat-icon"><IconReceipt size={18} /></span>
          <div>
            <div className="label">فواتير الوارد</div>
            <div className="value">{purchaseStats.invoices}</div>
          </div>
        </div>
        <div className="pur-stat">
          <span className="pur-stat-icon"><IconCart size={18} /></span>
          <div>
            <div className="label">الموردون</div>
            <div className="value">{purchaseStats.suppliers}</div>
          </div>
        </div>
        <div className="pur-stat">
          <span className="pur-stat-icon"><IconWallet size={18} /></span>
          <div>
            <div className="label">الدفعات</div>
            <div className="value">{purchaseStats.payments}</div>
          </div>
        </div>
        <div className="pur-stat">
          <span className="pur-stat-icon"><IconPackage size={18} /></span>
          <div>
            <div className="label">المرتجعات</div>
            <div className="value">{purchaseStats.returns}</div>
          </div>
        </div>
      </div>

      <div className="pur-tabs" role="tablist">
        <button type="button" className={pageTab === 'invoice' ? 'active' : ''} onClick={() => setPageTab('invoice')}>
          <IconReceipt size={16} /><span>فاتورة وارد</span>
        </button>
        <button type="button" className={pageTab === 'payments' ? 'active' : ''} onClick={() => setPageTab('payments')}>
          <IconWallet size={16} /><span>دفعات الموردين</span>
        </button>
        <button type="button" className={pageTab === 'returns' ? 'active' : ''} onClick={() => setPageTab('returns')}>
          <IconPackage size={16} /><span>مرتجع</span>
        </button>
        <button type="button" className={pageTab === 'report' ? 'active' : ''} onClick={() => setPageTab('report')}>
          <IconTag size={16} /><span>تقرير منتج</span>
        </button>
        <button type="button" className={pageTab === 'history' ? 'active' : ''} onClick={() => setPageTab('history')}>
          <IconCart size={16} /><span>سجل الفواتير</span>
        </button>
      </div>

      {notice && <div className={noticeClass(notice)} role={noticeKind(notice) === "error" ? "alert" : "status"}>{notice}</div>}
      {error && <div className="app-notice app-notice--error" role="alert">{error}</div>}
      {loading && <div className="empty-state">جارٍ التحميل...</div>}

      {pageTab === 'invoice' && (
      <section className="purchase-panel pur-invoice" id="purchase-invoice-form">
        <div className="panel-heading">
          <div>
            <h2>{editingInvoiceId ? 'تعديل فاتورة وارد' : 'فاتورة وارد جديدة'}</h2>
            <p>
              {editingInvoiceId
                ? 'عدّل البنود ثم احفظ — المخزون يتحدّث تلقائيًا.'
                : 'امسح الباركود لجلب الصنف · المكسب = سعر البيع − تكلفة القطعة'}
            </p>
          </div>
          {editingInvoiceId && (
            <button className="secondary-btn small" type="button" onClick={clearDraft}>إلغاء التعديل</button>
          )}
        </div>

        <div className="pur-section">
          <div className="pur-section-title">بيانات الفاتورة</div>
          <div className="pur-meta-grid">
            <label className="pur-field pur-field--wide">اسم الشركة / المورد
              <input value={supplierName} onChange={(e) => setSupplierName(e.target.value)} list="supplier-list" placeholder="اكتب أو اختر" />
            </label>
            <datalist id="supplier-list">{suppliers.map((s) => <option key={s.id} value={s.name} />)}</datalist>
            <datalist id="product-name-list">{catalog.map((p) => <option key={p.id} value={p.name} />)}</datalist>
            <label className="pur-field">التاريخ
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="pur-field">رقم الفاتورة
              <input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} placeholder="تلقائي إن تُرك فارغًا" />
            </label>
            <label className="pur-field">المدفوع الآن
              <input type="number" min="0" step="0.01" value={paid} onChange={(e) => setPaid(e.target.value)} />
            </label>
          </div>
        </div>

        <div className="pur-section">
          <div className="pur-section-title">بنود الأصناف</div>
        <div className="sale-lines-wrap pur-lines">
          <table className="sale-lines-table">
            <thead>
              <tr>
                <th>باركود</th>
                <th>الصنف</th>
                <th>الوحدة</th>
                <th>الكمية</th>
                <th>قطع/وحدة</th>
                <th>سعر الشراء</th>
                <th>تكلفة القطعة</th>
                <th>سعر البيع</th>
                <th>المكسب</th>
                <th>المتبقي</th>
                <th>الإجمالي</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const q = Number(l.quantity) || 0;
                const c = Number(l.unitCost) || 0;
                const lineTotal = q * c;
                const pp = piecePrice(l);
                const profit = lineProfitPerPiece(l);
                return (
                  <tr key={l.key}>
                    <td>
                      <input
                        placeholder="باركود"
                        value={l.barcode}
                        dir="ltr"
                        inputMode="numeric"
                        autoComplete="off"
                        data-line-key={l.key}
                        data-field="barcode"
                        onChange={(e) => updateDraft(l.key, { barcode: e.target.value, productId: '' })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            fillFromBarcode(l.key, (e.target as HTMLInputElement).value);
                          }
                        }}
                        onBlur={(e) => fillFromBarcode(l.key, e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        placeholder="اسم الصنف"
                        value={l.productName}
                        list="product-name-list"
                        data-line-key={l.key}
                        data-field="productName"
                        onChange={(e) => updateDraft(l.key, { productName: e.target.value })}
                        onBlur={(e) => fillFromProductName(l.key, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            fillFromProductName(l.key, (e.target as HTMLInputElement).value);
                            const cost = document.querySelector(
                              `input[data-line-key="${l.key}"][data-field="unitCost"]`,
                            ) as HTMLInputElement | null;
                            cost?.focus();
                          }
                        }}
                      />
                    </td>
                    <td>
                      <select
                        value={l.unitLabel}
                        onChange={(e) => {
                          const label = e.target.value;
                          const meta = PURCHASE_UNITS.find((u) => u.label === label);
                          updateDraft(l.key, {
                            unitLabel: label,
                            piecesPerPack: String(meta?.defaultPcs ?? 1),
                          });
                        }}
                      >
                        {PURCHASE_UNITS.map((u) => (
                          <option key={u.label} value={u.label}>{u.label}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={l.quantity}
                        onChange={(e) => updateDraft(l.key, { quantity: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={l.piecesPerPack}
                        disabled={unitApi(l.unitLabel) !== 'PACK'}
                        onChange={(e) => updateDraft(l.key, { piecesPerPack: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={l.unitCost}
                        placeholder="0"
                        onChange={(e) => updateDraft(l.key, { unitCost: e.target.value })}
                      />
                    </td>
                    <td>{pp === null ? '—' : pp.toLocaleString('en-US', { maximumFractionDigits: 3 })}</td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={l.salePrice}
                        placeholder="0"
                        title="سعر بيع القطعة"
                        onChange={(e) => updateDraft(l.key, { salePrice: e.target.value })}
                      />
                    </td>
                    <td className="num-cell">
                      {profit === null ? (
                        <span className="num-chip num-chip--muted">—</span>
                      ) : (
                        <span className={`num-chip ${profit >= 0 ? 'num-chip--profit' : 'num-chip--loss'}`}>
                          {profit.toLocaleString('en-US', { maximumFractionDigits: 3 })}
                        </span>
                      )}
                    </td>
                    <td title="الكمية المتبقية في المخزون قبل هذه الفاتورة">
                      {l.stock === null || l.stock === undefined ? '—' : l.stock.toLocaleString('en-US')}
                    </td>
                    <td>{lineTotal ? lineTotal.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '0'}</td>
                    <td>
                      <button className="danger-outline-btn" type="button" onClick={() => removeDraftRow(l.key)}>حذف</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="pur-lines-actions">
          <button className="add-line-btn" type="button" onClick={addDraftRow}>+ إضافة صنف</button>
        </div>

        {lines.some((l) => l.productName.trim()) && (
          <div className="pur-hints">
            {lines.filter((l) => l.productName.trim()).map((l) => {
              const h = lastPurchaseHint(l.productName, l.unitLabel);
              return h ? <div key={l.key}>{h}</div> : null;
            })}
          </div>
        )}
        </div>

        <div className="pur-footer">
          <div className="pur-footer-fields">
            <label>خصم (ج)
              <input type="number" min="0" step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} />
            </label>
            <label className="pur-field--grow">ملاحظات
              <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="اختياري" />
            </label>
          </div>
          <div className="pur-footer-summary">
            <div className="pur-total-box">
              <span>إجمالي الفاتورة</span>
              <strong>{money(total)}</strong>
            </div>
            <div className="pur-footer-actions">
              <button className="primary-btn" type="button" onClick={() => void saveInvoice(false)}>
                {editingInvoiceId ? 'حفظ التعديل' : 'حفظ الفاتورة'}
              </button>
              <button className="primary-btn" type="button" onClick={() => void saveInvoice(true)}>
                {editingInvoiceId ? 'حفظ وطباعة' : 'حفظ وطباعة'}
              </button>
              <button className="secondary-btn" type="button" onClick={printDraftInvoice}>طباعة مسودة</button>
              <button className="secondary-btn" type="button" onClick={clearDraft}>فاتورة فارغة</button>
            </div>
          </div>
        </div>
      </section>

      )}

      {pageTab === 'payments' && (
      <section className="purchase-panel">
        <div className="panel-heading"><div><h2>دفعات الموردين</h2><p>تسجيل مدفوعات للموردين.</p></div><span className="count-badge">{filteredPayments.length}</span></div>
        <div className="filter-bar">
          <label className="grow">بحث في الدفعات
            <input value={paymentSearch} onChange={(e) => setPaymentSearch(e.target.value)} placeholder="مورد / طريقة / تاريخ" />
          </label>
        </div>
        <div className="inline-form">
          <label>المورد<select value={paymentSupplierId} onChange={(e) => setPaymentSupplierId(e.target.value)}><option value="">اختر</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
          <label>المبلغ<input type="number" min="0" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} /></label>
          <label>التاريخ<input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} /></label>
          <button className="primary-btn" type="button" onClick={() => void savePayment()}>حفظ الدفعة</button>
        </div>
        <div className="table-wrap"><table><thead><tr><th>المورد</th><th>المبلغ</th><th>التاريخ</th><th>الطريقة</th></tr></thead>
          <tbody>{filteredPayments.slice(0, 50).map((p) => <tr key={p.id}><td>{p.supplier?.name}</td><td>{money(num(p.amount))}</td><td>{String(p.paymentDate).slice(0, 10)}</td><td>{p.method}</td></tr>)}</tbody></table></div>
      </section>

      )}

      {pageTab === 'returns' && (
      <section className="purchase-panel">
        <div className="panel-heading"><div><h2>مرتجع مشتريات</h2><p>إرجاع أصناف من فواتير وارد سابقة.</p></div></div>
        <div className="inline-form">
          <label>الفاتورة<select value={returnInvoiceId} onChange={(e) => { setReturnInvoiceId(e.target.value); setReturnItemId(''); }}>
            <option value="">اختر</option>
            {invoices.map((i) => <option key={i.id} value={i.id}>{i.invoiceNumber} — {i.supplier?.name}</option>)}
          </select></label>
          <label>الصنف<select value={returnItemId} onChange={(e) => setReturnItemId(e.target.value)}>
            <option value="">اختر</option>
            {selectedInvoice?.items.map((it) => (
              <option key={it.id} value={it.id}>{it.productName} (متبقي {num(it.quantity) - num(it.returnedQuantity)})</option>
            ))}
          </select></label>
          <label>الكمية<input type="number" min="0.001" value={returnQty} onChange={(e) => setReturnQty(e.target.value)} /></label>
          <button className="primary-btn" type="button" onClick={() => void saveReturn()}>حفظ المرتجع</button>
        </div>
      </section>

      )}

      {pageTab === 'report' && <ProductPriceReport compact />}

      {pageTab === 'history' && (
      <section className="purchase-panel">
        <div className="panel-heading">
          <div><h2>سجل الفواتير</h2><p>عرض وتعديل وحذف فواتير الوارد.</p></div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="count-badge">{filtered.length}</span>
            <button
              className="danger-outline-btn small"
              type="button"
              disabled={selectedIds.length === 0}
              onClick={() => void bulkDeleteInvoices()}
            >
              حذف المحدد ({selectedIds.length})
            </button>
          </div>
        </div>
        <div className="filter-bar">
          <label className="grow">بحث
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="رقم فاتورة / مورد / ملاحظات" />
          </label>
          <label>من تاريخ
            <input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} />
          </label>
          <label>إلى تاريخ
            <input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} />
          </label>
          <label>الدفع
            <select value={filterPay} onChange={(e) => setFilterPay(e.target.value as typeof filterPay)}>
              <option value="all">الكل</option>
              <option value="paid">مدفوع بالكامل</option>
              <option value="partial">مدفوع جزئيًا</option>
              <option value="unpaid">غير مدفوع</option>
            </select>
          </label>
          <div className="filter-actions">
            <button type="button" className="secondary-btn small" onClick={() => { setSearch(''); setFilterFrom(''); setFilterTo(''); setFilterPay('all'); }}>مسح الفلاتر</button>
          </div>
        </div>
        <div className="table-wrap"><table><thead><tr>
          <th style={{ width: 42 }}>
            <input
              type="checkbox"
              title="تحديد الكل (المعروض)"
              checked={filtered.length > 0 && filtered.every((i) => selectedIds.includes(i.id))}
              onChange={toggleSelectAllFiltered}
            />
          </th>
          <th>الرقم</th><th>التاريخ</th><th>المورد</th><th>الأصناف</th><th>الإجمالي</th><th>المدفوع</th><th>إجراءات</th>
        </tr></thead>
          <tbody>{filtered.map((i) => (
            <tr key={i.id} style={{ background: editingInvoiceId === i.id ? '#f0faf6' : undefined }}>
              <td>
                <input
                  type="checkbox"
                  checked={selectedIds.includes(i.id)}
                  onChange={() => toggleSelect(i.id)}
                />
              </td>
              <td>{i.invoiceNumber}</td>
              <td>{String(i.invoiceDate).slice(0, 10)}</td>
              <td>{i.supplier?.name}</td>
              <td>{i.items.length}</td>
              <td>{money(num(i.total))}</td>
              <td>{money(num(i.paidAmount))}</td>
              <td>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button className="secondary-btn small" type="button" onClick={() => startEditInvoice(i)}>تعديل</button>
                  <button className="secondary-btn small" type="button" onClick={() => printInvoice(i)}>طباعة</button>
                  <button
                    className="danger-outline-btn"
                    type="button"
                    onClick={() => void deletePurchaseInvoice(i)}
                  >
                    حذف
                  </button>
                </div>
              </td>
            </tr>
          ))}</tbody></table>
          {filtered.length === 0 && <div className="empty-state">لا توجد فواتير.</div>}
        </div>
      </section>
      )}

      <ScanModeOverlay
        open={scanMode}
        title="مسح باركود للوارد"
        onClose={() => setScanMode(false)}
        onScan={(code) => {
          const old = lines;
          const empty = old.find((l) => !l.productName.trim() && !l.barcode.trim());
          const key = empty?.key || old[0]?.key;
          if (key) fillFromBarcode(key, code);
          setScanMode(false);
        }}
      />

    </div>
  );
}
