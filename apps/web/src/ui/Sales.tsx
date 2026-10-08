import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { apiRequest } from '../data/api';
import { ScanModeOverlay } from './ScanModeOverlay';
import { loadSaleUnits } from '../data/units';
import { loadInvoiceSettings } from '../data/invoiceSettings';
import { IconReceipt, IconWallet, IconRefresh, IconChart, IconCart } from './Icons';
import { noticeClass, noticeKind } from './notice';

type Product = { id: string; name: string; barcode?: string | null; salePrice: number; currentCost: number; stock: number };
type CartLine = {
  key: string;
  barcode: string;
  productId: string;
  query: string;
  unit: string;
  quantity: string;
  unitPrice: string;
  cost: string;
  stock: number | null;
};
type Sale = {
  id: string; invoiceNumber: string; saleDate: string; createdAt?: string; customerName?: string | null;
  subtotal: number | string; discount: number | string; total: number | string; paidAmount: number | string;
  items: Array<{
    id: string;
    productId?: string | null;
    productName: string;
    quantity: number | string;
    returnedQuantity?: number | string;
    unitPrice: number | string;
    unitCost?: number | string;
    lineTotal: number | string;
  }>;
};
const money = (n: number) => `${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;
const qty = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 3 });

const chipBase: import('react').CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: '3.4rem',
  padding: '6px 12px',
  borderRadius: 10,
  fontSize: 13,
  fontWeight: 800,
  border: '1.5px solid',
  fontVariantNumeric: 'tabular-nums',
};
const CHIP_COST: import('react').CSSProperties = { ...chipBase, background: '#f1f5f9', borderColor: '#94a3b8', color: '#334155' };
const CHIP_PROFIT: import('react').CSSProperties = { ...chipBase, background: '#d1fae5', borderColor: '#34d399', color: '#065f46' };
const CHIP_LOSS: import('react').CSSProperties = { ...chipBase, background: '#fee2e2', borderColor: '#f87171', color: '#991b1b' };
const CHIP_STOCK: import('react').CSSProperties = { ...chipBase, background: '#d1fae5', borderColor: '#34d399', color: '#065f46' };
const CHIP_STOCK_LOW: import('react').CSSProperties = { ...chipBase, background: '#fef3c7', borderColor: '#fbbf24', color: '#92400e' };
const CHIP_STOCK_ZERO: import('react').CSSProperties = { ...chipBase, background: '#fee2e2', borderColor: '#f87171', color: '#991b1b' };
const CHIP_TOTAL: import('react').CSSProperties = { ...chipBase, background: '#ccfbf1', borderColor: '#2dd4bf', color: '#0f766e' };
const CHIP_MUTED: import('react').CSSProperties = { ...chipBase, background: '#f8fafc', borderColor: '#e2e8f0', color: '#94a3b8' };


function escapeHtml(s: string) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));
}

export function Sales() {
  const [saleUnits, setSaleUnits] = useState<string[]>(() => loadSaleUnits());
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [returnSale, setReturnSale] = useState<Sale | null>(null);
  const [returnQtys, setReturnQtys] = useState<Record<string, string>>({});
  const [returnReason, setReturnReason] = useState('');
  const [returnRefund, setReturnRefund] = useState('');
  const newLineKey = () => `L-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const emptyCartLine = (): CartLine => ({
    key: newLineKey(),
    barcode: '',
    productId: '',
    query: '',
    unit: 'قطعة',
    quantity: '1',
    unitPrice: '',
    cost: '',
    stock: null,
  });
  const [cart, setCart] = useState<CartLine[]>(() => [emptyCartLine(), emptyCartLine(), emptyCartLine()]);
  const cartRef = useRef(cart);
  cartRef.current = cart;



  const [invoiceNumber, setInvoiceNumber] = useState('1');
  const [saleDate, setSaleDate] = useState(new Date().toISOString().slice(0, 10));
  const [customerName, setCustomerName] = useState('');
  const [discount, setDiscount] = useState('0');
  const [paidAmount, setPaidAmount] = useState('');
  const [saleSearch, setSaleSearch] = useState('');
  const [saleFilterFrom, setSaleFilterFrom] = useState('');
  const [saleFilterTo, setSaleFilterTo] = useState('');
  const [saleFilterPay, setSaleFilterPay] = useState<'all' | 'paid' | 'partial' | 'unpaid'>('all');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    if (!notice) return;
    if (noticeKind(notice) !== 'success') return;
    const t = window.setTimeout(() => setNotice(''), 4500);
    return () => window.clearTimeout(t);
  }, [notice]);

  const [pageTab, setPageTab] = useState<'invoice' | 'history'>('invoice');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [scanMode, setScanMode] = useState(false);

  /** أكبر رقم فاتورة + 1 (أرقام فقط من نهاية الرقم أو الرقم كاملًا) */
  function computeNextInvoiceNo(records: Sale[]): string {
    let max = 0;
    for (const s of records) {
      const raw = String(s.invoiceNumber || '').trim();
      const m = raw.match(/(\d+)\s*$/);
      if (m) {
        const n = parseInt(m[1], 10);
        if (Number.isFinite(n) && n > max) max = n;
      }
    }
    return String(max + 1);
  }

  const refresh = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [stock, records] = await Promise.all([apiRequest<Product[]>('/inventory'), apiRequest<Sale[]>('/sales')]);
      setProducts((stock || []).map((p) => ({
        ...p,
        stock: Number(p.stock) || 0,
        salePrice: Number(p.salePrice) || 0,
        currentCost: Number(p.currentCost) || 0,
      })));
      const list = records || [];
      setSales(list);
      setInvoiceNumber(computeNextInvoiceNo(list));
    } catch (e) { setError(e instanceof Error ? e.message : 'تعذر تحميل بيانات المبيعات.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const subtotal = useMemo(() => cart.reduce((sum, line) => {
    if (!line.productId && !line.query?.trim()) return sum;
    return sum + Math.max(0, Number(line.quantity) || 0) * Math.max(0, Number(line.unitPrice) || 0);
  }, 0), [cart]);
  const discountValue = Math.max(0, Number(discount) || 0);
  const total = Math.max(0, subtotal - discountValue);
  const paidN = paidAmount.trim() === '' ? total : Math.max(0, Number(paidAmount) || 0);
  const remaining = Math.max(0, total - paidN);

  const cartProfit = useMemo(() => cart.reduce((sum, line) => {
    if (!line.query?.trim() && !line.productId) return sum;
    const q = Math.max(0, Number(line.quantity) || 0);
    const price = Math.max(0, Number(line.unitPrice) || 0);
    const cost = line.cost !== '' ? Math.max(0, Number(line.cost) || 0) : 0;
    return sum + (price - cost) * q;
  }, 0), [cart]);

  const filteredSales = useMemo(() => {
    const q = saleSearch.trim().toLowerCase();
    return sales.filter((s) => {
      const hay = `${s.invoiceNumber || ''} ${s.customerName || ''} ${(s.items || []).map((it: { productName?: string }) => it.productName || '').join(' ')}`.toLowerCase();
      if (q && !hay.includes(q)) return false;
      const d = String(s.saleDate || s.createdAt || '').slice(0, 10);
      if (saleFilterFrom && d && d < saleFilterFrom) return false;
      if (saleFilterTo && d && d > saleFilterTo) return false;
      const total = Number(s.total) || 0;
      const paid = Number(s.paidAmount) || 0;
      const status = paid <= 0 ? 'unpaid' : paid + 0.001 >= total ? 'paid' : 'partial';
      if (saleFilterPay !== 'all' && status !== saleFilterPay) return false;
      return true;
    });
  }, [sales, saleSearch, saleFilterFrom, saleFilterTo, saleFilterPay]);

  const historyProfit = useMemo(() => filteredSales.reduce((sum, sale) => {
    return sum + (sale.items || []).reduce((s, it) => {
      const q = Number(it.quantity) || 0;
      const price = Number(it.unitPrice) || 0;
      const cost = Number(it.unitCost) || 0;
      return s + (price - cost) * q;
    }, 0);
  }, 0), [filteredSales]);

  function addEmptyRow() {
    setCart((old) => [...old, emptyCartLine()]);
  }

  function removeLine(key: string) {
    setCart((old) => (old.length <= 1 ? [emptyCartLine()] : old.filter((line) => line.key !== key)));
  }

  /** مطابقة بالباركود أولًا ثم بالاسم (يفضّل صنف له رصيد) */
  function findProduct(raw: string): Product | undefined {
    const q = raw.trim().toLowerCase();
    if (!q) return undefined;
    const qBc = q.replace(/\s+/g, '');
    const byBarcode = products.find((p) => {
      const pb = (p.barcode || '').trim().toLowerCase().replace(/\s+/g, '');
      return pb && (pb === q || pb === qBc);
    });
    if (byBarcode) return byBarcode;
    const exactName = products.find((p) => p.name.trim().toLowerCase() === q);
    if (exactName) return exactName;
    const pick = (list: Product[]) => {
      if (list.length === 0) return undefined;
      const withStock = list.filter((p) => (Number(p.stock) || 0) > 0);
      if (withStock.length >= 1) return withStock[0];
      return list[0];
    };
    const starts = products.filter((p) => p.name.toLowerCase().startsWith(q));
    if (starts.length > 0) return pick(starts);
    const contains = products.filter((p) => p.name.toLowerCase().includes(q) || (p.barcode || '').toLowerCase().includes(q));
    return pick(contains);
  }

  function applyProductToLine(line: CartLine, p: Product | undefined, query: string): CartLine {
    if (!p) {
      return { ...line, productId: '', query, barcode: line.barcode, cost: '', stock: null };
    }
    return {
      ...line,
      productId: p.id,
      query: p.name,
      barcode: (p.barcode || line.barcode || '').trim(),
      unit: line.unit || 'قطعة',
      unitPrice: p.salePrice > 0 ? String(p.salePrice) : line.unitPrice,
      cost: String(Number(p.currentCost) || 0),
      stock: Number(p.stock) || 0,
    };
  }

  function onProductQueryChange(key: string, value: string) {
    setCart((old) => old.map((line) => {
      if (line.key !== key) return line;
      return { ...line, query: value, productId: '', cost: '', stock: null };
    }));
  }

  function onBarcodeChange(key: string, value: string) {
    setCart((old) => old.map((line) => {
      if (line.key !== key) return line;
      return { ...line, barcode: value };
    }));
  }

  function focusBarcodeField(lineKey: string) {
    window.setTimeout(() => {
      const el = document.querySelector(
        `input[data-line-key="${lineKey}"][data-field="barcode"]`,
      ) as HTMLInputElement | null;
      if (el) {
        el.focus();
        el.select();
      }
    }, 50);
  }

  // عند فتح صفحة المبيعات ركّز أول خانة باركود (مهم للماسح في Edge/Chrome)
  useEffect(() => {
    const key = cartRef.current[0]?.key;
    if (!key) return;
    const t = window.setTimeout(() => focusBarcodeField(key), 120);
    return () => window.clearTimeout(t);
  }, []);


  function resolveBarcode(key: string, value?: string) {
    const lines = cartRef.current;
    const line = lines.find((l) => l.key === key);
    if (!line) return;
    const text = (value !== undefined ? value : line.barcode).trim();
    if (!text) return;

    const p = findProduct(text);
    if (!p) {
      setNotice(`لا يوجد صنف بالباركود «${text}».`);
      return;
    }

    const blank = emptyCartLine();
    const idx = lines.findIndex((l) => l.key === key);
    let nextKey: string | null = null;
    const after = lines.slice(idx + 1).find(
      (l) => !l.productId && !String(l.query || '').trim() && !String(l.barcode || '').trim(),
    );
    if (after) nextKey = after.key;
    else nextKey = blank.key;

    setCart((old) => {
      let applied = old.map((l) => (l.key === key ? applyProductToLine(l, p, text) : l));
      const hasNext = applied.some(
        (l, i) =>
          i > idx &&
          !l.productId &&
          !String(l.query || '').trim() &&
          !String(l.barcode || '').trim(),
      );
      if (!hasNext) applied = [...applied, blank];
      return applied;
    });

    setNotice(
      `تم جلب «${p.name}» — المتبقي ${qty(Number(p.stock) || 0)} | سعر البيع ${p.salePrice}`,
    );
    focusBarcodeField(nextKey);
  }

  function resolveProductLine(key: string, value?: string) {
    setCart((old) => old.map((line) => {
      if (line.key !== key) return line;
      const text = value !== undefined ? value : line.query;
      const p = findProduct(text);
      if (!text.trim()) return { ...line, productId: '', query: '', cost: '', stock: null };
      if (!p) {
        // خدمة حرة بدون صنف مخزون
        return { ...line, productId: '', query: text, cost: '', stock: null };
      }
      return applyProductToLine(line, p, text);
    }));
  }

  function updateLine(key: string, patch: Partial<CartLine>) {
    setCart((old) => old.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  
  function resetForm(nextSales?: Sale[]) {
    setCart([emptyCartLine(), emptyCartLine(), emptyCartLine()]);
    setCustomerName('');
    setDiscount('0');
    setPaidAmount('');
    setSaleDate(new Date().toISOString().slice(0, 10));
    setInvoiceNumber(computeNextInvoiceNo(nextSales ?? sales));
    setNotice('');
  }

  function printSale(sale: Sale) {
    const w = window.open('', '_blank');
    if (!w) { setNotice('اسمح بالنوافذ المنبثقة لطباعة الفاتورة.'); return; }
    const cfg = loadInvoiceSettings();
    const centerName = cfg.watermarkText || cfg.brandTitle;
    const phone = cfg.phone;
    const address = cfg.address;
    const brandTitle = cfg.brandTitle;
    const brandSubtitle = cfg.brandSubtitle;
    const invoiceTitle = cfg.invoiceTitle;
    const footerText = cfg.footerText;
    const serviceTagsHtml = cfg.serviceTags.map((t) => `<span>${escapeHtml(t)}</span>`).join('');
    const items = sale.items || [];
    const maxRows = Math.max(10, items.length);
    const rows = Array.from({ length: maxRows }, (_, i) => {
      const l = items[i];
      if (!l) {
        return `<tr><td class="num">${i + 1}</td><td></td><td></td><td></td><td></td></tr>`;
      }
      return `<tr>
        <td class="num">${i + 1}</td>
        <td>${escapeHtml(l.productName)}</td>
        <td>${qty(Number(l.quantity))}</td>
        <td>${Number(l.unitPrice).toFixed(2)}</td>
        <td>${Number(l.lineTotal).toFixed(2)}</td>
      </tr>`;
    }).join('');
    const paid = Number(sale.paidAmount);
    const tot = Number(sale.total);
    const sub = Number(sale.subtotal);
    const disc = Number(sale.discount);
    const dateStr = new Date(sale.saleDate).toLocaleDateString('en-GB');
    const invNo = escapeHtml(sale.invoiceNumber);
    const customer = escapeHtml(sale.customerName || 'عميل نقدي');
    const wmText = escapeHtml(centerName);
    // شبكة علامة مائية مكررة على كامل الصفحة
    const wmCells = Array.from({ length: 48 }, () =>
      `<span class="wm-cell">${wmText}<br/><small>${invNo}</small></span>`
    ).join('');

    w.document.write(`<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<title>فاتورة مبيعات ${invNo}</title>
<style>
  @page { size: A4; margin: 8mm; }
  * { box-sizing: border-box; }
  body {
    font-family: Tahoma, 'Segoe UI', Arial, sans-serif;
    margin: 0; padding: 0; color: #123055;
    background: #fff;
  }
  .sheet {
    position: relative;
    width: 100%;
    max-width: 210mm;
    margin: 0 auto;
    padding: 0 0 16px;
    overflow: hidden;
    min-height: 277mm;
  }

  /* علامة مائية مكررة على كل الفاتورة */
  .watermark {
    position: absolute;
    inset: 0;
    z-index: 50;
    pointer-events: none;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    grid-auto-rows: 88px;
    align-items: center;
    justify-items: center;
    opacity: 1;
    overflow: hidden;
  }
  .wm-cell {
    transform: rotate(-30deg);
    font-size: 16px;
    font-weight: 900;
    color: rgba(13, 58, 122, 0.22);
    text-align: center;
    line-height: 1.4;
    user-select: none;
    white-space: nowrap;
  }
  .wm-cell small {
    display: inline-block;
    margin-top: 2px;
    font-size: 12px;
    font-weight: 800;
    color: rgba(13, 58, 122, 0.24);
    letter-spacing: 0.4px;
  }
  .content { position: relative; z-index: 1; }

  /* هيدر مطابق لهوية المركز */
  .hero {
    position: relative;
    overflow: hidden;
    background: linear-gradient(180deg, #eef5ff 0%, #ffffff 70%);
    padding: 0 0 8px;
    border-bottom: 3px solid #1a4f9c;
  }
  .hero-bg-left {
    position: absolute;
    top: -30px; right: -40px;
    width: 200px; height: 180px;
    background: radial-gradient(circle at 30% 40%, #1a4f9c 0%, #0d2f66 60%, transparent 70%);
    border-radius: 50%;
    opacity: 0.95;
  }
  .hero-bg-right {
    position: absolute;
    top: -20px; left: -50px;
    width: 190px; height: 170px;
    background: radial-gradient(circle at 70% 40%, #1a4f9c 0%, #0a2558 65%, transparent 72%);
    border-radius: 50%;
    opacity: 0.95;
  }
  .hero-inner {
    position: relative;
    z-index: 2;
    display: grid;
    grid-template-columns: 110px 1fr 120px;
    gap: 8px;
    align-items: center;
    padding: 14px 16px 10px;
  }
  .hero-art {
    text-align: center;
    font-size: 28px;
    line-height: 1.2;
    filter: drop-shadow(0 2px 4px rgba(0,0,0,.12));
  }
  .hero-art .row { letter-spacing: 2px; }
  .hero-brand { text-align: center; }
  .hero-brand h1 {
    margin: 0;
    font-size: 30px;
    color: #0a2f6e;
    font-weight: 900;
    letter-spacing: 1px;
  }
  .hero-brand .sub {
    margin: 4px 0 0;
    font-size: 13px;
    color: #1a4f9c;
    font-weight: 800;
  }
  .hero-brand .addr {
    margin: 5px 0 0;
    font-size: 11px;
    color: #3d5f8c;
    font-weight: 600;
  }
  .hero-brand .phone {
    margin: 4px 0 0;
    font-size: 13px;
    color: #0d2f66;
    font-weight: 800;
  }
  .hero-side {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }
  .hero-logo {
    width: 58px; height: 58px;
    border-radius: 50%;
    background: linear-gradient(145deg, #0d3a7a, #1a4f9c);
    border: 3px solid #e8a317;
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 26px;
    box-shadow: 0 3px 10px rgba(13,47,102,.3);
  }
  .svc-tags {
    display: flex;
    flex-direction: column;
    gap: 3px;
    width: 100%;
  }
  .svc-tags span {
    display: block;
    background: #0d2f66;
    color: #fff;
    font-size: 9px;
    font-weight: 700;
    text-align: center;
    padding: 3px 4px;
    border-radius: 4px;
    border-right: 3px solid #e8a317;
  }

  .body-pad { padding: 12px 16px 0; }

  .title-wrap { text-align: center; margin: 2px 0 12px; }
  .title-wrap .title {
    display: inline-block;
    background: linear-gradient(135deg, #1a4f9c, #0d2f66);
    color: #fff;
    font-size: 16px;
    font-weight: 900;
    padding: 7px 42px;
    border-radius: 24px;
    border: 2px solid #e8a317;
    box-shadow: 0 2px 0 #0a2558;
  }

  .meta {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px 14px;
    margin-bottom: 12px;
    font-size: 12.5px;
  }
  .meta .field {
    display: flex;
    align-items: center;
    gap: 0;
    border: 1.5px solid #9eb6d8;
    border-radius: 6px;
    overflow: hidden;
    background: rgba(255,255,255,0.9);
    min-height: 34px;
  }
  .meta .field label {
    background: #1a4f9c;
    color: #fff;
    font-weight: 800;
    font-size: 11px;
    padding: 8px 10px;
    white-space: nowrap;
    min-width: 78px;
    text-align: center;
  }
  .meta .field span {
    flex: 1;
    padding: 6px 10px;
    font-weight: 700;
    color: #0d2f66;
  }

  table.items {
    width: 100%;
    border-collapse: collapse;
    font-size: 12.5px;
    margin-bottom: 12px;
    background: rgba(255,255,255,0.88);
  }
  table.items th, table.items td {
    border: 1px solid #9eb6d8;
    padding: 7px 6px;
    text-align: center;
  }
  table.items th { color: #fff; font-weight: 800; }
  table.items th.col-n { background: #e89b1a; width: 34px; }
  table.items th.col-name { background: #1a4f9c; text-align: right; }
  table.items th.col-qty { background: #1e9e6a; width: 68px; }
  table.items th.col-price { background: #5b4fcf; width: 88px; }
  table.items th.col-total { background: #d6455d; width: 92px; }
  table.items td.num { background: #fff7e8; font-weight: 700; color: #b87a0c; }
  table.items td:nth-child(2) { text-align: right; }
  table.items tbody tr { height: 27px; }

  .bottom {
    display: grid;
    grid-template-columns: 1.15fr 0.95fr;
    gap: 12px;
  }
  .notes, .totals {
    border: 1.5px solid #9eb6d8;
    border-radius: 8px;
    padding: 10px 12px;
    background: rgba(247, 250, 255, 0.92);
    min-height: 88px;
  }
  .notes h3 {
    margin: 0 0 8px;
    display: inline-block;
    background: #e89b1a;
    color: #1a2a4a;
    font-size: 12px;
    padding: 3px 12px;
    border-radius: 12px;
  }
  .notes .lines { border-bottom: 1px dotted #9eb6d8; height: 20px; margin: 4px 0; }
  .totals table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .totals td { padding: 5px 8px; border-bottom: 1px solid #d0dff2; }
  .totals td:last-child { text-align: left; font-weight: 700; direction: ltr; }
  .totals tr.grand td {
    background: #e8f0ff;
    font-weight: 900;
    color: #0d2f66;
    font-size: 14px;
    border-bottom: none;
  }

  .thanks {
    text-align: center;
    margin: 16px 0 8px;
    font-weight: 800;
    color: #0d3a7a;
    font-size: 14px;
  }
  .footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    margin: 0 16px;
    padding: 8px 4px;
    border-top: 2px solid #1a4f9c;
    font-size: 11px;
    color: #355a8c;
  }
  .bottom-wave {
    height: 6px;
    margin-top: 10px;
    background: linear-gradient(90deg, #0a2a5c 0%, #1a4f9c 40%, #e8a317 70%, #0a2a5c 100%);
  }
  .auth-strip {
    text-align: center;
    font-size: 9px;
    color: #7a8fa8;
    margin: 6px 16px 0;
  }

  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .sheet { max-width: none; }
  }
</style>
</head>
<body>
  <div class="sheet">
    <div class="watermark" aria-hidden="true">${wmCells}</div>
    <div class="content">
      <div class="hero">
        <div class="hero-bg-left"></div>
        <div class="hero-bg-right"></div>
        <div class="hero-inner">
          <div class="hero-art" aria-hidden="true">
            <div class="row">📚🖨️</div>
            <div class="row">💻✏️📐</div>
          </div>
          <div class="hero-brand">
            <h1>${escapeHtml(brandTitle)}</h1>
            <p class="sub">${escapeHtml(brandSubtitle)}</p>
            <p class="addr">${escapeHtml(address)}</p>
            <p class="phone">تليفون / واتساب: <span dir="ltr">${escapeHtml(phone)}</span></p>
          </div>
          <div class="hero-side">
            <div class="hero-logo">🎓</div>
            <div class="svc-tags">${serviceTagsHtml}</div>
          </div>
        </div>
      </div>

      <div class="body-pad">
        <div class="title-wrap"><span class="title">${escapeHtml(invoiceTitle)}</span></div>

        <div class="meta">
          <div class="field"><label>اسم العميل</label><span>${customer}</span></div>
          <div class="field"><label>التاريخ</label><span>${escapeHtml(dateStr)}</span></div>
          <div class="field"><label>رقم الهاتف</label><span dir="ltr">—</span></div>
          <div class="field"><label>رقم الفاتورة</label><span dir="ltr">${invNo}</span></div>
        </div>

        <table class="items">
          <thead>
            <tr>
              <th class="col-n">م</th>
              <th class="col-name">اسم الصنف</th>
              <th class="col-qty">الكمية</th>
              <th class="col-price">سعر الوحدة</th>
              <th class="col-total">الإجمالي</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>

        <div class="bottom">
          <div class="notes">
            <h3>ملاحظات</h3>
            <div class="lines"></div>
            <div class="lines"></div>
            <div class="lines"></div>
          </div>
          <div class="totals">
            <table>
              <tr><td>إجمالي المبلغ</td><td>${sub.toFixed(2)}</td></tr>
              <tr><td>خصم</td><td>${disc.toFixed(2)}</td></tr>
              <tr class="grand"><td>صافي المبلغ</td><td>${tot.toFixed(2)}</td></tr>
              <tr><td>المدفوع</td><td>${paid.toFixed(2)}</td></tr>
              <tr><td>المتبقي</td><td>${Math.max(0, tot - paid).toFixed(2)}</td></tr>
            </table>
          </div>
        </div>

        <p class="thanks">— ${escapeHtml(footerText)} —</p>
      </div>

      <div class="footer">
        <span>${escapeHtml(brandTitle)}</span>
        <span dir="ltr">${escapeHtml(phone)}</span>
      </div>
      <div class="auth-strip">وثيقة إلكترونية — ${invNo} — العلامة المائية المكررة جزء من الحماية ضد التزوير</div>
      <div class="bottom-wave"></div>
    </div>
  </div>
  <script>window.onload=function(){window.print()}</script>
</body>
</html>`);
    w.document.close();
  }

  async function saveSale(andPrint = false) {
    // اربط البضاعة إن أمكن؛ وإلا اعتبر البند خدمة حرّة
    const resolvedCart = cart.map((line) => {
      if (line.productId || !line.query?.trim()) return line;
      const p = findProduct(line.query);
      if (p && (Number(p.stock) || 0) > 0) {
        return {
          ...line,
          productId: p.id,
          query: p.name,
          unitPrice: line.unitPrice !== '' ? line.unitPrice : String(Number(p.salePrice) || 0),
        };
      }
      // خدمة / وصف حر
      return {
        ...line,
        productId: '',
        unit: line.unit && line.unit !== 'قطعة' ? line.unit : 'خدمة',
      };
    });
    setCart(resolvedCart);

    const lines = resolvedCart.filter((l) => l.query?.trim() && Number(l.quantity) > 0 && Number(l.unitPrice) >= 0);
    if (lines.length === 0) {
      setNotice('أضف بندًا واحدًا على الأقل: بضاعة من المخزون أو خدمة بالاسم والسعر.');
      return;
    }
    const inv = invoiceNumber.trim() || computeNextInvoiceNo(sales);
    if (!invoiceNumber.trim()) setInvoiceNumber(inv);

    for (const line of lines) {
      if (!line.productId) continue; // خدمة — بدون مخزون
      const p = products.find((x) => x.id === line.productId);
      const stock = Number(p?.stock) || 0;
      const q = Number(line.quantity) || 0;
      if (!p) { setNotice('صنف غير موجود في المخزون.'); return; }
      if (stock <= 0) {
        setNotice(`«${p.name}» رصيده صفر. سجّل وارد من المشتريات ثم حدّث البيانات.`);
        return;
      }
      if (q > stock) { setNotice(`الكمية المطلوبة من «${p.name}» أكبر من المتاح (${stock}).`); return; }
    }

    const computedSubtotal = lines.reduce(
      (sum, l) => sum + Math.max(0, Number(l.quantity) || 0) * Math.max(0, Number(l.unitPrice) || 0),
      0,
    );
    const disc = Math.max(0, Number(discount) || 0);
    if (disc > computedSubtotal) { setNotice('الخصم لا يمكن أن يتجاوز إجمالي الفاتورة.'); return; }
    const net = Math.max(0, computedSubtotal - disc);
    const paid = paidAmount.trim() === '' ? net : Number(paidAmount);
    if (!Number.isFinite(paid) || paid < 0 || paid > net) { setNotice('المبلغ المدفوع يجب أن يكون بين صفر وإجمالي الفاتورة.'); return; }
    setSaving(true); setNotice('');
    try {
      const sale = await apiRequest<Sale>(
        '/sales',
        {
          method: 'POST',
          body: JSON.stringify({
            invoiceNumber: inv,
            saleDate: saleDate || undefined,
            customerName: customerName.trim() || undefined,
            discount: disc,
            paidAmount: paid,
            items: lines.map((line) => ({
              productId: line.productId || undefined,
              productName: line.query.trim(),
              unit: line.unit || (line.productId ? 'قطعة' : 'خدمة'),
              quantity: Number(line.quantity),
              unitPrice: Number(line.unitPrice),
            })),
          }),
        },
        { queueLabel: 'حفظ فاتورة بيع' },
      );
      setNotice(`تم حفظ فاتورة البيع ${sale.invoiceNumber}` + (paid > 0 ? ' وتسجيل التحصيل في الخزينة.' : '.'));
      await refresh();
      if (andPrint) printSale(sale);
    } catch (e) { setNotice(e instanceof Error ? e.message : 'تعذر حفظ فاتورة البيع.'); }
    finally { setSaving(false); }
  }

  async function deleteSale(sale: Sale) {
    if (!confirm(`حذف فاتورة البيع رقم ${sale.invoiceNumber}؟\nسيتم إرجاع رصيد البضاعة للمخزون إن وُجد.`)) return;
    setSaving(true); setNotice('');
    try {
      await apiRequest(`/sales/${sale.id}`, { method: 'DELETE' }, { queueLabel: 'حذف — حفظ فاتورة بيع' });
      setNotice(`تم حذف فاتورة ${sale.invoiceNumber}.`);
      await refresh();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'تعذر حذف الفاتورة.');
    } finally {
      setSaving(false);
    }
  }

  
  function openReturn(sale: Sale) {
    const qtys: Record<string, string> = {};
    for (const it of sale.items) {
      const remaining = Number(it.quantity) - Number(it.returnedQuantity || 0);
      qtys[it.id] = remaining > 0 ? String(remaining) : '0';
    }
    setReturnSale(sale);
    setReturnQtys(qtys);
    setReturnReason('');
    const totalRemaining = sale.items.reduce((s, it) => {
      const rem = Math.max(0, Number(it.quantity) - Number(it.returnedQuantity || 0));
      return s + rem * Number(it.unitPrice);
    }, 0);
    setReturnRefund(String(Math.round(totalRemaining * 100) / 100));
  }

  async function submitReturn() {
    if (!returnSale) return;
    const items = returnSale.items
      .map((it) => ({
        saleItemId: it.id,
        quantity: Number(returnQtys[it.id] || 0),
      }))
      .filter((x) => x.quantity > 0);
    if (items.length === 0) {
      setNotice('حدد كمية مرتجع واحدة على الأقل.');
      return;
    }
    setSaving(true);
    setNotice('');
    try {
      await apiRequest(
        '/sales/returns',
        {
          method: 'POST',
          body: JSON.stringify({
            saleId: returnSale.id,
            reason: returnReason.trim() || undefined,
            refundAmount: Number(returnRefund) || 0,
            items,
          }),
        },
        { queueLabel: 'مرتجع بيع' },
      );
      setNotice(`تم تسجيل مرتجع على فاتورة ${returnSale.invoiceNumber}.`);
      setReturnSale(null);
      await refresh();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'تعذر تسجيل المرتجع.');
    } finally {
      setSaving(false);
    }
  }

function printDraft() {
    const lines = cart.filter((l) => l.query?.trim() && Number(l.quantity) > 0);
    if (lines.length === 0) { setNotice('أضف بنودًا قبل الطباعة.'); return; }
    const draft: Sale = {
      id: 'draft',
      invoiceNumber: invoiceNumber.trim() || 'مسودة',
      saleDate: saleDate || new Date().toISOString(),
      customerName: customerName.trim() || 'عميل نقدي',
      subtotal,
      discount: discountValue,
      total,
      paidAmount: paidN,
      items: lines.map((line, i) => {
        const p = products.find((x) => x.id === line.productId);
        const q = Number(line.quantity) || 0;
        const price = Number(line.unitPrice) || 0;
        return {
          id: String(i),
          productName: p?.name || line.query.trim() || 'بند',
          quantity: q,
          unitPrice: price,
          lineTotal: q * price,
        };
      }),
    };
    printSale(draft);
  }

  const salesTotal = filteredSales.reduce((sum, sale) => sum + Number(sale.total), 0);
  const salesDue = filteredSales.reduce((sum, sale) => sum + Number(sale.total) - Number(sale.paidAmount), 0);

  return (
    <div className="purchases-page sales-page">
      <div className="purchase-title">
        <div>
          <span className="eyebrow">نقطة البيع</span>
          <h1>المبيعات</h1>
          <p>فواتير البيع · التحصيل · المكسب · السجل</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="primary-btn" type="button" onClick={() => setScanMode(true)}>
            <span>مسح باركود</span>
          </button>
          <button className="secondary-btn" type="button" onClick={() => void refresh()}>
            <IconRefresh size={16} />
            <span>تحديث</span>
          </button>
        </div>
      </div>

      <div className="pur-stats">
        <div className="pur-stat">
          <span className="pur-stat-icon"><IconReceipt size={18} /></span>
          <div>
            <div className="label">فواتير البيع</div>
            <div className="value">{filteredSales.length}</div>
          </div>
        </div>
        <div className="pur-stat">
          <span className="pur-stat-icon"><IconCart size={18} /></span>
          <div>
            <div className="label">إجمالي الفواتير</div>
            <div className="value" style={{ fontSize: 18 }}>{money(salesTotal)}</div>
          </div>
        </div>
        <div className="pur-stat">
          <span className="pur-stat-icon"><IconWallet size={18} /></span>
          <div>
            <div className="label">المتبقي على العملاء</div>
            <div className="value" style={{ fontSize: 18, color: salesDue > 0 ? '#b45309' : undefined }}>{money(salesDue)}</div>
          </div>
        </div>
        <div className="pur-stat">
          <span className="pur-stat-icon"><IconChart size={18} /></span>
          <div>
            <div className="label">مكسب تقديري</div>
            <div className="value" style={{ fontSize: 18, color: historyProfit >= 0 ? '#0a7a4b' : '#b42318' }}>{money(historyProfit)}</div>
          </div>
        </div>
      </div>

      <div className="pur-tabs" role="tablist">
        <button type="button" className={pageTab === 'invoice' ? 'active' : ''} onClick={() => setPageTab('invoice')}>
          <IconReceipt size={16} /><span>فاتورة بيع</span>
        </button>
        <button type="button" className={pageTab === 'history' ? 'active' : ''} onClick={() => setPageTab('history')}>
          <IconCart size={16} /><span>سجل الفواتير</span>
        </button>
      </div>

      {notice && <div className={noticeClass(notice)} role={noticeKind(notice) === "error" ? "alert" : "status"}>{notice}</div>}
      {error && <div className="app-notice app-notice--error" role="alert">{error} — تأكد من تسجيل الدخول وتشغيل الخادم.</div>}

      {pageTab === 'invoice' && (
      <section className="purchase-panel pur-invoice">
        <div className="panel-heading">
          <div>
            <h2>فاتورة بيع جديدة</h2>
            <p>امسح الباركود أو اكتب اسم الصنف — السعر والتكلفة والمكسب والمتبقي يظهرون تلقائيًا.</p>
          </div>
        </div>

        <div className="pur-section">
          <div className="pur-section-title">بيانات الفاتورة</div>
          <div className="pur-meta-grid sale-meta-grid">
            <label className="pur-field pur-field--wide">اسم العميل (اختياري)
              <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="عميل نقدي" />
            </label>
            <label className="pur-field">التاريخ
              <input type="date" value={saleDate} onChange={(e) => setSaleDate(e.target.value)} />
            </label>
            <label className="pur-field">رقم الفاتورة
              <input
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                title="يُولَّد بالترتيب تلقائيًا ويمكن تعديله يدويًا"
              />
            </label>
          </div>
        </div>

        <div className="pur-section">
          <div className="pur-section-title">بنود البيع</div>
        <div className="sale-lines-wrap pur-lines">
          <table className="sale-lines-table">
            <thead>
              <tr>
                <th>باركود</th>
                <th>الصنف / الخدمة</th>
                <th>الوحدة</th>
                <th>الكمية</th>
                <th>سعر البيع</th>
                <th>التكلفة</th>
                <th>المكسب</th>
                <th>المتبقي</th>
                <th>الإجمالي</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {cart.map((line) => {
                const lineTotal = Math.max(0, Number(line.quantity) || 0) * Math.max(0, Number(line.unitPrice) || 0);
                const matched = products.find((p) => p.id === line.productId);
                const stock = line.stock !== null && line.stock !== undefined
                  ? Number(line.stock)
                  : (matched ? Number(matched.stock) || 0 : null);
                const cost = line.cost !== '' ? Number(line.cost) : (matched ? Number(matched.currentCost) || 0 : null);
                const price = Number(line.unitPrice);
                const qtyN = Number(line.quantity) || 0;
                // مكسب السطر = (سعر البيع − التكلفة) × الكمية
                const profit = cost !== null && Number.isFinite(price) && line.unitPrice !== ''
                  ? (price - cost) * qtyN
                  : null;
                const overStock = line.productId && stock !== null && qtyN > stock;
                return (
                  <tr key={line.key}>
                    <td>
                      <input
                        placeholder="باركود"
                        value={line.barcode}
                        dir="ltr"
                        inputMode="numeric"
                        data-line-key={line.key}
                        data-field="barcode"
                        onChange={(e) => onBarcodeChange(line.key, e.target.value)}
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (!v) return;
                          // لا تعِد الجلب لو السطر متحدّث بالفعل لنفس الباركود
                          if (line.productId && (line.barcode || '').trim() === v) return;
                          resolveBarcode(line.key, v);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            e.stopPropagation();
                            resolveBarcode(line.key, (e.target as HTMLInputElement).value);
                          }
                        }}
                        autoComplete="off"
                      />
                    </td>
                    <td>
                      <input
                        list={`products-list-${line.key}`}
                        aria-label="الصنف أو الباركود"
                        placeholder="اسم الصنف أو الخدمة"
                        value={line.query}
                        onChange={(e) => onProductQueryChange(line.key, e.target.value)}
                        onBlur={(e) => resolveProductLine(line.key, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            resolveProductLine(line.key, (e.target as HTMLInputElement).value);
                          }
                        }}
                        autoComplete="off"
                        style={{
                          borderColor: line.productId
                            ? (stock !== null && stock > 0 ? '#20a486' : '#d97706')
                            : (line.query.trim() ? '#e8a0a0' : undefined),
                          background: line.productId ? (stock !== null && stock > 0 ? '#f0faf6' : '#fff8eb') : undefined,
                        }}
                      />
                      <datalist id={`products-list-${line.key}`}>
                        {products.map((prod) => (
                          <option
                            key={prod.id}
                            value={prod.name}
                            label={`${prod.name}${prod.barcode ? ` · ${prod.barcode}` : ''} · متاح ${qty(Number(prod.stock) || 0)}`}
                          />
                        ))}
                      </datalist>
                    </td>
                    <td>
                      <select value={line.unit} onChange={(e) => updateLine(line.key, { unit: e.target.value })}>
                        {saleUnits.map((u) => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        step="0.001"
                        data-line-key={line.key}
                        data-field="quantity"
                        value={line.quantity}
                        onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                        className={overStock ? 'input-num input-num--danger' : 'input-num input-num--qty'}
                        title={overStock ? 'الكمية أكبر من المتاح' : undefined}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.unitPrice}
                        placeholder="0"
                        className="input-num input-num--price"
                        onChange={(e) => updateLine(line.key, { unitPrice: e.target.value })}
                      />
                    </td>
                    <td className="num-cell">
                      {cost === null || !Number.isFinite(cost) ? (
                        <span className="num-chip num-chip--muted" style={CHIP_MUTED}>—</span>
                      ) : (
                        <span className="num-chip num-chip--cost" style={CHIP_COST}>{cost.toLocaleString('en-US', { maximumFractionDigits: 3 })}</span>
                      )}
                    </td>
                    <td className="num-cell">
                      {profit === null ? (
                        <span className="num-chip num-chip--muted" style={CHIP_MUTED}>—</span>
                      ) : (
                        <span className={`num-chip ${profit >= 0 ? 'num-chip--profit' : 'num-chip--loss'}`} style={profit >= 0 ? CHIP_PROFIT : CHIP_LOSS}>
                          {profit.toLocaleString('en-US', { maximumFractionDigits: 3 })}
                        </span>
                      )}
                    </td>
                    <td className="num-cell" title="الكمية المتاحة في المخزون">
                      {stock === null ? (
                        <span className="num-chip num-chip--muted" style={CHIP_MUTED}>—</span>
                      ) : (
                        <span className={`num-chip ${stock <= 0 ? 'num-chip--stock-zero' : stock <= 5 ? 'num-chip--stock-low' : 'num-chip--stock'}`} style={stock <= 0 ? CHIP_STOCK_ZERO : stock <= 5 ? CHIP_STOCK_LOW : CHIP_STOCK}>
                          {qty(stock)}
                        </span>
                      )}
                    </td>
                    <td className="num-cell">
                      <span className="num-chip num-chip--total" style={CHIP_TOTAL}>
                        {lineTotal ? lineTotal.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '0'}
                      </span>
                    </td>
                    <td>
                      <button className="danger-outline-btn" type="button" onClick={() => removeLine(line.key)}>حذف</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {products.length === 0 && (
          <div className="empty-state">لا توجد أصناف بعد. أضف منتجات من الإعدادات ← المنتجات، أو من المخزون، أو عبر فاتورة وارد.</div>
        )}

        <div className="pur-lines-actions">
          <button className="add-line-btn" type="button" onClick={addEmptyRow}>+ إضافة صنف</button>
        </div>
        </div>

        <div className="pur-footer sale-footer">
          <div className="pur-footer-fields">
            <label>خصم (ج)
              <input type="number" min="0" step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} />
            </label>
            <label>المدفوع (ج)
              <input type="number" min="0" step="0.01" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} placeholder="فارغ = كامل المبلغ" />
            </label>
            <button className="secondary-btn small" type="button" style={{ alignSelf: 'end' }} onClick={() => setPaidAmount(String(total))}>
              دفع كامل
            </button>
          </div>
          <div className="pur-footer-summary">
            <div className="sale-totals-grid">
              <div className="sale-total-item">
                <span>الصافي</span>
                <strong>{money(total)}</strong>
              </div>
              <div className={`sale-total-item${remaining > 0 ? ' sale-total-item--warn' : ''}`}>
                <span>المتبقي</span>
                <strong>{money(remaining)}</strong>
              </div>
              <div className="sale-total-item sale-total-item--profit">
                <span>مكسب تقديري</span>
                <strong className={cartProfit >= 0 ? 'num-ok' : 'num-bad'}>{money(cartProfit)}</strong>
              </div>
            </div>
            <div className="pur-footer-actions">
              <button className="primary-btn" type="button" disabled={saving} onClick={() => void saveSale(false)}>
                {saving ? 'جارٍ الحفظ...' : 'حفظ الفاتورة'}
              </button>
              <button className="primary-btn" type="button" disabled={saving} onClick={() => void saveSale(true)}>
                حفظ وطباعة
              </button>
              <button className="secondary-btn" type="button" onClick={printDraft}>طباعة مسودة</button>
              <button className="secondary-btn" type="button" onClick={() => resetForm()}>فاتورة جديدة</button>
            </div>
          </div>
        </div>
      </section>

      )}

      {pageTab === 'history' && (
      <section className="purchase-panel">
        <div className="panel-heading">
          <div>
            <h2>سجل فواتير البيع</h2>
            <p>الحذف يعيد رصيد البضاعة ويلغي قيد التحصيل من الخزينة إن وُجد.</p>
          </div>
          <span className="count-badge">{filteredSales.length}</span>
        </div>
        <div className="filter-bar">
          <label className="grow">بحث
            <input value={saleSearch} onChange={(e) => setSaleSearch(e.target.value)} placeholder="رقم فاتورة / عميل / صنف" />
          </label>
          <label>من تاريخ
            <input type="date" value={saleFilterFrom} onChange={(e) => setSaleFilterFrom(e.target.value)} />
          </label>
          <label>إلى تاريخ
            <input type="date" value={saleFilterTo} onChange={(e) => setSaleFilterTo(e.target.value)} />
          </label>
          <label>الدفع
            <select value={saleFilterPay} onChange={(e) => setSaleFilterPay(e.target.value as typeof saleFilterPay)}>
              <option value="all">الكل</option>
              <option value="paid">مدفوع</option>
              <option value="partial">جزئي</option>
              <option value="unpaid">غير مدفوع</option>
            </select>
          </label>
          <div className="filter-actions">
            <button type="button" className="secondary-btn small" onClick={() => { setSaleSearch(''); setSaleFilterFrom(''); setSaleFilterTo(''); setSaleFilterPay('all'); }}>مسح</button>
          </div>
        </div>
        {loading ? <div className="empty-state">جارٍ تحميل الفواتير...</div> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>رقم الفاتورة</th>
                  <th>التاريخ</th>
                  <th>العميل</th>
                  <th>الإجمالي</th>
                  <th>المدفوع</th>
                  <th>المتبقي</th>
                  <th>مكسب تقديري</th>
                  <th>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filteredSales.map((sale) => {
                  const estProfit = (sale.items || []).reduce(
                    (s, it) => s + (Number(it.unitPrice) - Number(it.unitCost || 0)) * Number(it.quantity),
                    0,
                  );
                  return (
                  <tr key={sale.id}>
                    <td>{sale.invoiceNumber}</td>
                    <td>{new Date(sale.saleDate).toLocaleDateString('en-GB')}</td>
                    <td>{sale.customerName || 'عميل نقدي'}</td>
                    <td>{money(Number(sale.total))}</td>
                    <td>{money(Number(sale.paidAmount))}</td>
                    <td>{money(Number(sale.total) - Number(sale.paidAmount))}</td>
                    <td style={{ color: estProfit >= 0 ? '#0a7a4b' : '#b42318', fontWeight: 600 }}>{money(estProfit)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button className="secondary-btn small" type="button" onClick={() => printSale(sale)}>طباعة</button>
                        <button className="secondary-btn small" type="button" onClick={() => openReturn(sale)}>مرتجع</button>
                        <button
                          className="danger-outline-btn"
                          type="button"
                          disabled={saving}
                          onClick={() => void deleteSale(sale)}
                        >
                          حذف
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
            {filteredSales.length === 0 && <div className="empty-state">لا توجد فواتير مطابقة.</div>}
          </div>
        )}
      </section>
      )}

      {returnSale && (
        <div className="modal-backdrop" role="dialog" style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'grid', placeItems: 'center', zIndex: 50, padding: 16 }}>
          <div className="purchase-panel" style={{ maxWidth: 640, width: '100%', maxHeight: '90vh', overflow: 'auto' }}>
            <div className="panel-heading">
              <div>
                <h2>مرتجع بيع — {returnSale.invoiceNumber}</h2>
                <p>يُعاد المخزون للأصناف ويُسجَّل الاسترداد في الخزينة إن وُجد.</p>
              </div>
              <button type="button" className="secondary-btn" onClick={() => setReturnSale(null)}>إغلاق</button>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>الصنف</th>
                    <th>المباع</th>
                    <th>مرتجع سابق</th>
                    <th>كمية المرتجع</th>
                  </tr>
                </thead>
                <tbody>
                  {returnSale.items.map((it) => {
                    const sold = Number(it.quantity);
                    const prev = Number(it.returnedQuantity || 0);
                    const max = Math.max(0, sold - prev);
                    return (
                      <tr key={it.id}>
                        <td>{it.productName}</td>
                        <td>{qty(sold)}</td>
                        <td>{qty(prev)}</td>
                        <td>
                          <input
                            type="number"
                            min={0}
                            max={max}
                            step="0.001"
                            value={returnQtys[it.id] ?? '0'}
                            disabled={max <= 0}
                            onChange={(e) => setReturnQtys((old) => ({ ...old, [it.id]: e.target.value }))}
                            style={{ width: 90 }}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="pur-form-grid" style={{ marginTop: 12 }}>
              <label className="pur-field">
                سبب المرتجع
                <input value={returnReason} onChange={(e) => setReturnReason(e.target.value)} placeholder="اختياري" />
              </label>
              <label className="pur-field">
                مبلغ الاسترداد من الخزينة
                <input type="number" min={0} step="0.01" value={returnRefund} onChange={(e) => setReturnRefund(e.target.value)} />
              </label>
            </div>
            <div className="pur-footer-actions" style={{ marginTop: 14 }}>
              <button type="button" className="primary-btn" disabled={saving} onClick={() => void submitReturn()}>
                تأكيد المرتجع
              </button>
              <button type="button" className="secondary-btn" onClick={() => setReturnSale(null)}>إلغاء</button>
            </div>
          </div>
        </div>
      )}


      <ScanModeOverlay
        open={scanMode}
        title="مسح باركود للبيع"
        onClose={() => setScanMode(false)}
        onScan={(code) => {
          const lines = cartRef.current;
          const active =
            lines.find((l) => !l.productId && !String(l.query || '').trim())?.key || lines[0]?.key;
          if (active) {
            onBarcodeChange(active, code);
            resolveBarcode(active, code);
          }
          setScanMode(false);
        }}
      />

    </div>
  );
}
