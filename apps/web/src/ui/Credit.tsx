import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiRequest } from '../data/api';
import { loadInvoiceSettings } from '../data/invoiceSettings';
import { IconUsers, IconMoney, IconClock, IconRefresh, IconUser, IconReceipt } from './Icons';

type SaleItem = { productName: string; quantity: number; unitPrice: number; lineTotal: number; unit?: string | null };
type SaleRow = {
  id: string;
  invoiceNumber: string;
  saleDate: string;
  createdAt?: string;
  total: number;
  paidAmount: number;
  remaining: number;
  paymentStatus: string;
  discount?: number;
  items?: SaleItem[];
};
type PaymentRow = {
  id: string;
  amount: number;
  date: string;
  createdAt?: string;
  method?: string;
  notes?: string | null;
  saleId?: string | null;
};
type CustomerRow = {
  id: string;
  name: string;
  phone: string | null;
  invoicesCount: number;
  salesTotal: number;
  paidTotal: number;
  balance: number;
  createdAt?: string;
  accountOpenedAt?: string;
  firstSaleAt?: string | null;
  lastSaleAt?: string | null;
  lastPaymentAt?: string | null;
};
type CustomerDetail = CustomerRow & { sales: SaleRow[]; payments?: PaymentRow[] };

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function statusLabel(s: string) {
  if (s === 'PAID') return 'مسددة';
  if (s === 'PARTIAL') return 'جزئي';
  if (s === 'CREDIT') return 'آجل';
  return s;
}
function statusClass(s: string) {
  if (s === 'PAID') return 'credit-badge credit-badge--paid';
  if (s === 'PARTIAL') return 'credit-badge credit-badge--partial';
  return 'credit-badge credit-badge--open';
}

/** تاريخ + وقت دقيق بالأرقام الإنجليزية */
function formatDateTime(value?: string | Date | null): string {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const date = d.toLocaleDateString('en-GB', { year: 'numeric', month: '2-digit', day: '2-digit' });
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  return `${date} ${time}`;
}

function formatDateOnly(value?: string | Date | null): string {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

/** عدد الأيام منذ تاريخ الشراء */
function daysSince(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days <= 0) return 'اليوم';
  if (days === 1) return 'يوم واحد';
  return `${days} يوم`;
}

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function paymentMethodLabel(m?: string) {
  if (!m) return 'نقدي';
  if (m === 'CASH') return 'نقدي';
  if (m === 'WALLET') return 'محفظة';
  if (m === 'BANK') return 'تحويل';
  if (m === 'CARD') return 'بطاقة';
  return m;
}

/** طباعة HTML داخل Electron بدون الاعتماد على النوافذ المنبثقة */
function printHtml(html: string) {
  // بدون noopener — وإلا window.open يرجع null في Electron
  const w = window.open('', '_blank');
  if (w) {
    w.document.open();
    w.document.write(html);
    w.document.close();
    return;
  }
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none';
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc) {
    alert('تعذر فتح نافذة الطباعة. جرّب إعادة تشغيل البرنامج.');
    iframe.remove();
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();
  const run = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } finally {
      setTimeout(() => iframe.remove(), 1500);
    }
  };
  if (iframe.contentWindow?.document.readyState === 'complete') {
    setTimeout(run, 200);
  } else {
    iframe.onload = () => setTimeout(run, 200);
  }
}

function buildInvoiceHtml(sale: SaleRow, customerName: string, customerPhone?: string | null) {
  const inv = loadInvoiceSettings();
  const items = sale.items || [];
  const rows = items
    .map(
      (it, i) =>
        `<tr><td>${i + 1}</td><td>${escapeHtml(it.productName || '')}</td><td>${Number(it.quantity)}</td><td>${Number(it.unitPrice).toFixed(2)}</td><td>${Number(it.lineTotal).toFixed(2)}</td></tr>`,
    )
    .join('');
  const sub = items.reduce((s, it) => s + Number(it.lineTotal || 0), 0);
  const disc = Number(sale.discount || 0);
  const tot = Number(sale.total);
  const paid = Number(sale.paidAmount);
  const rem = Math.max(0, tot - paid);
  const dateStr = formatDateTime(sale.saleDate || sale.createdAt);
  const createdStr = sale.createdAt && sale.createdAt !== sale.saleDate ? formatDateTime(sale.createdAt) : '';
  return `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"/><title>فاتورة ${escapeHtml(sale.invoiceNumber)}</title>
<style>
@page{margin:8mm}
body{font-family:Tahoma,Arial,sans-serif;padding:12px;color:#111;font-size:13px}
h1{margin:0 0 4px;font-size:20px}
.sub{font-size:12px;color:#555;margin-bottom:10px}
.meta{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:12px 0;font-size:13px}
table{width:100%;border-collapse:collapse;margin-top:8px}
th,td{border:1px solid #ccc;padding:6px;text-align:right}
th{background:#f3f4f6}
.totals{margin-top:12px;width:260px;margin-right:auto}
.totals td{border:none;padding:4px 0}
.badge{display:inline-block;background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:6px;font-size:12px;font-weight:700}
.rem{color:#b45309;font-weight:700}
@media print{body{padding:0}}
</style></head><body>
<h1>${escapeHtml(inv.brandTitle || 'المركز')}</h1>
<div class="sub">${escapeHtml(inv.address || '')}${inv.phone ? ' · ' + escapeHtml(inv.phone) : ''}</div>
<h2 style="margin:12px 0 4px;font-size:16px">فاتورة بيع <span class="badge">آجل</span></h2>
<div class="meta">
<div><strong>العميل:</strong> ${escapeHtml(customerName)}</div>
<div><strong>رقم الفاتورة:</strong> <span dir="ltr">${escapeHtml(sale.invoiceNumber)}</span></div>
<div><strong>الهاتف:</strong> <span dir="ltr">${escapeHtml(customerPhone || '—')}</span></div>
<div><strong>وقت الشراء:</strong> <span dir="ltr">${escapeHtml(dateStr)}</span></div>
${createdStr ? `<div><strong>وقت التسجيل:</strong> <span dir="ltr">${escapeHtml(createdStr)}</span></div>` : ''}
</div>
<table>
<thead><tr><th>م</th><th>الصنف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead>
<tbody>${rows || '<tr><td colspan="5">لا بنود</td></tr>'}</tbody>
</table>
<table class="totals">
<tr><td>المجموع</td><td>${sub.toFixed(2)}</td></tr>
<tr><td>خصم</td><td>${disc.toFixed(2)}</td></tr>
<tr><td><strong>الصافي</strong></td><td><strong>${tot.toFixed(2)}</strong></td></tr>
<tr><td>المدفوع</td><td>${paid.toFixed(2)}</td></tr>
<tr><td class="rem">المتبقي</td><td class="rem">${rem.toFixed(2)}</td></tr>
</table>
<p style="margin-top:16px;font-size:11px;color:#666">حالة السداد: ${statusLabel(sale.paymentStatus)}</p>
<script>window.onload=function(){setTimeout(function(){window.print()},200)}</script>
</body></html>`;
}

function printCreditInvoice(sale: SaleRow, customerName: string, customerPhone?: string | null) {
  printHtml(buildInvoiceHtml(sale, customerName, customerPhone));
}

export function Credit() {
  const [list, setList] = useState<CustomerRow[]>([]);
  const [selected, setSelected] = useState<CustomerDetail | null>(null);
  const [openSale, setOpenSale] = useState<SaleRow | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [payDateTime, setPayDateTime] = useState(() => toLocalInputValue(new Date()));
  const [paySaleId, setPaySaleId] = useState('');
  const [q, setQ] = useState('');
  const autoOpenedRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const rows = await apiRequest<CustomerRow[]>('/customers');
      const next = Array.isArray(rows) ? rows : [];
      setList(next);
      return next;
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'تعذر التحميل');
      return [] as CustomerRow[];
    }
  }, []);

  useEffect(() => {
    void (async () => {
      const rows = await load();
      if (!autoOpenedRef.current && rows.length > 0) {
        autoOpenedRef.current = true;
        // فتح أول عميل تلقائياً لعرض التفاصيل مباشرة
        const first = rows[0];
        setSelected({ ...first, sales: [], payments: [] });
        setBusy(true);
        try {
          const d = await apiRequest<CustomerDetail>(`/customers/${first.id}`);
          setSelected({
            ...d,
            sales: (d.sales || []).map((s) => ({
              ...s,
              total: Number(s.total),
              paidAmount: Number(s.paidAmount),
              remaining: Number(
                s.remaining != null
                  ? s.remaining
                  : Math.max(0, Number(s.total) - Number(s.paidAmount)),
              ),
            })),
            payments: d.payments || [],
          });
          setPayAmount(Number(d.balance) > 0 ? String(Number(d.balance).toFixed(2)) : '');
        } catch (e) {
          setMsg(e instanceof Error ? e.message : 'تعذر فتح الحساب');
        } finally {
          setBusy(false);
        }
      }
    })();
  }, [load]);

  const openInvoices = useMemo(() => {
    if (!selected) return [];
    return selected.sales.filter((s) => Number(s.remaining) > 0.001);
  }, [selected]);

  async function openCustomer(id: string) {
    setMsg('');
    setOpenSale(null);
    setPaySaleId('');
    // عرض فوري من القائمة ثم تحديث التفاصيل من الخادم
    const fromList = list.find((c) => c.id === id);
    if (fromList) {
      setSelected({
        ...fromList,
        sales: selected?.id === id ? selected.sales : [],
        payments: selected?.id === id ? selected.payments : [],
      });
      setPayAmount(fromList.balance > 0 ? String(Number(fromList.balance).toFixed(2)) : '');
    }
    setBusy(true);
    try {
      const d = await apiRequest<CustomerDetail>(`/customers/${id}`);
      setSelected({
        ...d,
        sales: (d.sales || []).map((s) => ({
          ...s,
          total: Number(s.total),
          paidAmount: Number(s.paidAmount),
          remaining: Number(
            s.remaining != null
              ? s.remaining
              : Math.max(0, Number(s.total) - Number(s.paidAmount)),
          ),
        })),
        payments: d.payments || [],
      });
      setPayAmount(Number(d.balance) > 0 ? String(Number(d.balance).toFixed(2)) : '');
      if ((d.sales || []).length) {
        const due = (d.sales || []).find((s) => Number(s.remaining) > 0.001);
        if (due) setPaySaleId(due.id);
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'تعذر فتح الحساب');
    } finally {
      setBusy(false);
    }
  }

  async function ensureSaleItems(sale: SaleRow): Promise<SaleRow> {
    if (sale.items && sale.items.length > 0) return sale;
    const full = await apiRequest<any>(`/sales/${sale.id}`);
    return {
      id: full.id,
      invoiceNumber: full.invoiceNumber,
      saleDate: full.saleDate,
      total: Number(full.total),
      paidAmount: Number(full.paidAmount),
      remaining: Math.max(0, Number(full.total) - Number(full.paidAmount)),
      paymentStatus: full.paymentStatus,
      discount: Number(full.discount || 0),
      items: (full.items || []).map((it: any) => ({
        productName: it.productName,
        quantity: Number(it.quantity),
        unitPrice: Number(it.unitPrice),
        lineTotal: Number(it.lineTotal),
        unit: it.unit,
      })),
    };
  }

  async function openInvoice(sale: SaleRow) {
    setBusy(true);
    setMsg('');
    try {
      const full = await ensureSaleItems(sale);
      setOpenSale(full);
      if (Number(full.remaining) > 0.001) {
        setPaySaleId(full.id);
        setPayAmount(String(Number(full.remaining).toFixed(2)));
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'تعذر فتح الفاتورة');
    } finally {
      setBusy(false);
    }
  }

  function onSelectPayTarget(saleId: string) {
    setPaySaleId(saleId);
    if (!selected) return;
    if (!saleId) {
      setPayAmount(selected.balance > 0 ? String(Number(selected.balance).toFixed(2)) : '');
      return;
    }
    const inv = selected.sales.find((s) => s.id === saleId);
    if (inv && Number(inv.remaining) > 0) setPayAmount(String(Number(inv.remaining).toFixed(2)));
  }

  async function collect() {
    if (!selected) return;
    const amount = Number(payAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setMsg('أدخل مبلغ تحصيل صحيح');
      return;
    }
    if (paySaleId) {
      const inv = selected.sales.find((s) => s.id === paySaleId);
      const due = inv ? Number(inv.remaining) : 0;
      if (due <= 0) {
        setMsg('هذه الفاتورة مسددة');
        return;
      }
      if (amount - due > 0.001) {
        setMsg(`المبلغ أكبر من متبقي الفاتورة (${due.toFixed(2)}).`);
        return;
      }
    }
    setBusy(true);
    setMsg('');
    try {
      const res = await apiRequest<{ applied?: Array<{ invoiceNumber: string; applied: number }> }>(
        `/customers/${selected.id}/payments`,
        {
          method: 'POST',
          body: JSON.stringify({
            amount,
            notes: payNotes.trim() || undefined,
            method: 'CASH',
            saleId: paySaleId || undefined,
            date: payDateTime ? new Date(payDateTime).toISOString() : new Date().toISOString(),
          }),
        },
      );
      const detail = res?.applied?.length
        ? res.applied.map((a) => `${a.invoiceNumber}: ${Number(a.applied).toFixed(2)}`).join(' · ')
        : '';
      setMsg(detail ? `تم التحصيل — ${detail}` : 'تم تسجيل التحصيل');
      setPayNotes('');
      setPayDateTime(toLocalInputValue(new Date()));
      await load();
      await openCustomer(selected.id);
      setOpenSale(null);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'فشل التحصيل');
    } finally {
      setBusy(false);
    }
  }

  const filtered = list.filter(
    (c) => !q.trim() || c.name.includes(q.trim()) || (c.phone || '').includes(q.trim()),
  );
  const totalDebt = filtered.reduce((s, c) => s + (c.balance || 0), 0);
  const debtors = filtered.filter((c) => c.balance > 0).length;

  return (
    <div className="purchases-page credit-page">
      <div className="purchase-title page-enter">
        <div>
          <span className="eyebrow">المالية</span>
          <h1 className="page-title-with-icon">
            <span className="page-title-icon" aria-hidden>
              <IconMoney size={28} />
            </span>
            الآجل والتحصيل
          </h1>
          <p>كل عملية لها تاريخ ووقت دقيق · وقت الشراء · وقت السداد · عمر الدين</p>
        </div>
        <button className="secondary-btn btn-with-icon" type="button" disabled={busy} onClick={() => void load()}>
          <IconRefresh size={16} className={busy ? 'icon-spin' : undefined} />
          تحديث
        </button>
      </div>

      <div className="pur-stats stats-enter">
        <div className="pur-stat pur-stat--icon">
          <span className="pur-stat-icon pur-stat-icon--teal"><IconUsers size={22} /></span>
          <div>
            <div className="label">عملاء في القائمة</div>
            <div className="value">{filtered.length}</div>
          </div>
        </div>
        <div className="pur-stat pur-stat--icon">
          <span className="pur-stat-icon pur-stat-icon--amber"><IconClock size={22} /></span>
          <div>
            <div className="label">عليهم مبالغ</div>
            <div className="value" style={{ color: debtors ? '#b45309' : undefined }}>{debtors}</div>
          </div>
        </div>
        <div className="pur-stat pur-stat--icon">
          <span className="pur-stat-icon pur-stat-icon--rose"><IconMoney size={22} /></span>
          <div>
            <div className="label">إجمالي المتبقي</div>
            <div className="value" style={{ color: totalDebt > 0 ? '#b45309' : undefined }}>
              {totalDebt.toFixed(2)}
            </div>
          </div>
        </div>
      </div>

      {msg ? <p className="notice">{msg}</p> : null}

      <div className="credit-layout">
        {/* قائمة العملاء */}
        <section className="purchase-panel credit-panel-list">
          <div className="panel-heading">
            <div>
              <h2 className="heading-with-icon"><IconUsers size={18} /> العملاء</h2>
              <p>اضغط على البطاقة لفتح الحساب والفواتير</p>
            </div>
            <span className="count-badge">{filtered.length}</span>
          </div>
          <div className="filter-bar credit-search-bar">
            <label className="grow">
              بحث
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="اسم أو هاتف"
                autoComplete="off"
              />
            </label>
          </div>
          {filtered.length === 0 ? (
            <div className="credit-empty-inline">
              <p className="muted">لا يوجد عملاء آجل بعد — أنشئ فاتورة بيع آجل من المبيعات</p>
            </div>
          ) : (
            <div className="credit-card-list">
              {filtered.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={
                    'credit-customer-card' + (selected?.id === c.id ? ' credit-customer-card--active' : '')
                  }
                  disabled={busy}
                  onClick={() => void openCustomer(c.id)}
                >
                  <div className="credit-customer-card__top">
                    <div className="credit-customer-card__avatar" aria-hidden>
                      {(c.name || '?').trim().charAt(0)}
                    </div>
                    <div className="credit-customer-card__name">
                      <strong>{c.name}</strong>
                      {c.phone ? (
                        <span className="muted" dir="ltr">
                          {c.phone}
                        </span>
                      ) : null}
                    </div>
                    <div
                      className={
                        'credit-customer-card__balance' +
                        (c.balance > 0 ? ' credit-customer-card__balance--due' : ' credit-customer-card__balance--ok')
                      }
                    >
                      <span className="credit-customer-card__balance-label">المتبقي</span>
                      <span className="credit-customer-card__balance-value">
                        {Number(c.balance).toFixed(2)}
                      </span>
                    </div>
                  </div>
                  <div className="credit-customer-card__meta">
                    <span>
                      فواتير: <strong>{c.invoicesCount}</strong>
                    </span>
                    <span>
                      مبيعات: <strong dir="ltr">{Number(c.salesTotal).toFixed(2)}</strong>
                    </span>
                    <span>
                      مدفوع: <strong dir="ltr">{Number(c.paidTotal).toFixed(2)}</strong>
                    </span>
                  </div>
                  <div className="credit-customer-card__times" dir="ltr">
                    <div>
                      <span className="credit-time-label">أول شراء</span>
                      {formatDateTime(c.firstSaleAt)}
                    </div>
                    <div>
                      <span className="credit-time-label">آخر شراء</span>
                      {formatDateTime(c.lastSaleAt)}
                    </div>
                    <div>
                      <span className="credit-time-label">آخر سداد</span>
                      {formatDateTime(c.lastPaymentAt)}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* تفاصيل الحساب */}
        <section className="purchase-panel credit-panel-detail">
          {!selected && (
            <div className="credit-empty">
              <div className="credit-empty-icon credit-empty-icon--svg" aria-hidden>
                <IconUser size={40} />
              </div>
              <h2>حساب العميل</h2>
              <p className="muted">
                {busy ? 'جارٍ تحميل بيانات العملاء…' : 'اضغط على أي عميل من القائمة لعرض فواتيره وتحصيلاته فوراً'}
              </p>
            </div>
          )}
          {selected && (
            <>
              <div className="panel-heading">
                <div>
                  <h2>{selected.name}</h2>
                  <p>
                    إجمالي المبيعات: <strong>{Number(selected.salesTotal).toFixed(2)}</strong>
                    {' · '}
                    المدفوع: <strong>{Number(selected.paidTotal).toFixed(2)}</strong>
                    {' · '}
                    المتبقي:{' '}
                    <strong style={{ color: '#b45309' }}>{Number(selected.balance).toFixed(2)}</strong>
                  </p>
                  <p className="muted credit-time-meta" dir="ltr">
                    فتح الحساب: {formatDateTime(selected.accountOpenedAt || selected.createdAt)}
                    {' · '}
                    أول شراء: {formatDateTime(selected.firstSaleAt)}
                    {' · '}
                    آخر شراء: {formatDateTime(selected.lastSaleAt)}
                    {' · '}
                    آخر سداد: {formatDateTime(selected.lastPaymentAt)}
                  </p>
                </div>
                <button
                  className="secondary-btn small"
                  type="button"
                  onClick={() => {
                    setSelected(null);
                    setOpenSale(null);
                    setPaySaleId('');
                  }}
                >
                  إغلاق الحساب
                </button>
              </div>

              {/* تحصيل */}
              <div className="credit-collect-card">
                <div className="credit-collect-title heading-with-icon"><IconMoney size={18} /> تسجيل تحصيل</div>
                <div className="credit-collect-grid">
                  <label>
                    على أي فاتورة؟
                    <select value={paySaleId} onChange={(e) => onSelectPayTarget(e.target.value)}>
                      <option value="">توزيع تلقائي (من الأقدم للأحدث)</option>
                      {openInvoices.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.invoiceNumber} · {formatDateTime(s.saleDate)} · متبقي {Number(s.remaining).toFixed(2)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    المبلغ (جزء أو كامل)
                    <input
                      value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value)}
                      inputMode="decimal"
                      dir="ltr"
                      placeholder="0.00"
                    />
                  </label>
                  <label>
                    وقت السداد
                    <input
                      type="datetime-local"
                      step="1"
                      value={payDateTime}
                      onChange={(e) => setPayDateTime(e.target.value)}
                      dir="ltr"
                    />
                  </label>
                  <label className="credit-collect-notes">
                    ملاحظات
                    <input
                      value={payNotes}
                      onChange={(e) => setPayNotes(e.target.value)}
                      placeholder="اختياري"
                    />
                  </label>
                </div>
                <p className="muted credit-collect-hint">
                  إن عدّلت الوقت يُحفظ كما هو · وإلا يُستخدم وقت الضغط على التسجيل
                  {' · '}
                  {paySaleId
                    ? 'يسدد على الفاتورة المختارة فقط (جزء أو كامل متبقيها).'
                    : 'يوزَّع على الفواتير المفتوحة بدءًا من الأقدم.'}
                </p>
                <div className="actions">
                  <button
                    className="primary-btn"
                    type="button"
                    disabled={busy || selected.balance <= 0}
                    onClick={() => void collect()}
                  >
                    تسجيل التحصيل
                  </button>
                  {paySaleId && openInvoices.find((s) => s.id === paySaleId) ? (
                    <button
                      className="secondary-btn"
                      type="button"
                      onClick={() => {
                        const inv = openInvoices.find((s) => s.id === paySaleId)!;
                        setPayAmount(String(Number(inv.remaining).toFixed(2)));
                      }}
                    >
                      تعبئة كامل متبقي الفاتورة
                    </button>
                  ) : null}
                </div>
              </div>

              {/* سجل التحصيلات بالوقت */}
              {(selected.payments || []).length > 0 ? (
                <div className="credit-payments-block">
                  <div className="credit-invoices-head">
                    <h3>سجل السداد (تاريخ ووقت كل تحصيل)</h3>
                    <span className="count-badge">{(selected.payments || []).length}</span>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>وقت السداد</th>
                          <th>وقت التسجيل</th>
                          <th>المبلغ</th>
                          <th>الطريقة</th>
                          <th>ملاحظات</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(selected.payments || []).map((p) => (
                          <tr key={p.id}>
                            <td className="credit-dt" dir="ltr">{formatDateTime(p.date)}</td>
                            <td className="credit-dt" dir="ltr">{formatDateTime(p.createdAt || p.date)}</td>
                            <td style={{ fontWeight: 600, color: '#16815d' }}>{Number(p.amount).toFixed(2)}</td>
                            <td>{paymentMethodLabel(p.method)}</td>
                            <td className="muted">{p.notes || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <p className="muted credit-collect-hint">لا يوجد تحصيل مسجّل بعد لهذا العميل.</p>
              )}

              {/* جدول الفواتير */}
              <div className="credit-invoices-head">
                <h3 className="heading-with-icon"><IconReceipt size={18} /> فواتير العميل</h3>
                <span className="count-badge">{selected.sales.length}</span>
              </div>
              {busy && selected.sales.length === 0 ? (
                <p className="muted credit-collect-hint">جارٍ تحميل الفواتير…</p>
              ) : null}
              {!busy && selected.sales.length === 0 ? (
                <p className="muted credit-collect-hint">لا توجد فواتير مسجّلة لهذا العميل.</p>
              ) : null}
              {selected.sales.length > 0 ? (
              <div className="table-wrap credit-invoices-table">
                <table>
                  <thead>
                    <tr>
                      <th>رقم</th>
                      <th>وقت الشراء</th>
                      <th>وقت التسجيل</th>
                      <th>عمر الدين</th>
                      <th>الإجمالي</th>
                      <th>مدفوع</th>
                      <th>متبقي</th>
                      <th>حالة</th>
                      <th>إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.sales.map((s) => (
                      <tr
                        key={s.id}
                        className={
                          openSale?.id === s.id || paySaleId === s.id ? 'credit-row-active' : undefined
                        }
                      >
                        <td dir="ltr">{s.invoiceNumber}</td>
                        <td className="credit-dt" dir="ltr">{formatDateTime(s.saleDate)}</td>
                        <td className="credit-dt" dir="ltr">{formatDateTime(s.createdAt || s.saleDate)}</td>
                        <td>{Number(s.remaining) > 0.001 ? daysSince(s.saleDate) : '—'}</td>
                        <td>{Number(s.total).toFixed(2)}</td>
                        <td>{Number(s.paidAmount).toFixed(2)}</td>
                        <td
                          style={{
                            fontWeight: 600,
                            color: Number(s.remaining) > 0 ? '#b45309' : '#16815d',
                          }}
                        >
                          {Number(s.remaining).toFixed(2)}
                        </td>
                        <td>
                          <span className={statusClass(s.paymentStatus)}>
                            {statusLabel(s.paymentStatus)}
                          </span>
                        </td>
                        <td>
                          <div className="credit-row-actions">
                            <button
                              className="secondary-btn small"
                              type="button"
                              onClick={() => void openInvoice(s)}
                            >
                              عرض
                            </button>
                            <button
                              className="secondary-btn small"
                              type="button"
                              onClick={() =>
                                void (async () => {
                                  try {
                                    printCreditInvoice(
                                      await ensureSaleItems(s),
                                      selected.name,
                                      selected.phone,
                                    );
                                  } catch (e) {
                                    setMsg(e instanceof Error ? e.message : 'تعذر الطباعة');
                                  }
                                })()
                              }
                            >
                              طباعة
                            </button>
                            {Number(s.remaining) > 0.001 ? (
                              <button
                                className="secondary-btn small"
                                type="button"
                                onClick={() => onSelectPayTarget(s.id)}
                              >
                                سداد
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              ) : null}

              {/* تفاصيل فاتورة */}
              {openSale ? (
                <div className="credit-detail-card">
                  <div className="panel-heading">
                    <div>
                      <h3>
                        تفاصيل فاتورة <span dir="ltr">{openSale.invoiceNumber}</span>
                      </h3>
                      <p className="muted">
                        {formatDateTime(openSale.saleDate)}
                        {' · '}
                        <span className={statusClass(openSale.paymentStatus)}>
                          {statusLabel(openSale.paymentStatus)}
                        </span>
                        {' · '}
                        متبقي: <strong>{Number(openSale.remaining).toFixed(2)}</strong>
                      </p>
                    </div>
                    <div className="credit-row-actions">
                      {Number(openSale.remaining) > 0 ? (
                        <button
                          className="secondary-btn small"
                          type="button"
                          onClick={() => onSelectPayTarget(openSale.id)}
                        >
                          سداد هذه الفاتورة
                        </button>
                      ) : null}
                      <button
                        className="primary-btn small"
                        type="button"
                        onClick={() =>
                          printCreditInvoice(openSale, selected.name, selected.phone)
                        }
                      >
                        طباعة
                      </button>
                      <button
                        className="secondary-btn small"
                        type="button"
                        onClick={() => setOpenSale(null)}
                      >
                        إغلاق
                      </button>
                    </div>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>الصنف</th>
                          <th>الكمية</th>
                          <th>السعر</th>
                          <th>الإجمالي</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(openSale.items || []).map((it, i) => (
                          <tr key={i}>
                            <td>{it.productName}</td>
                            <td>{it.quantity}</td>
                            <td>{Number(it.unitPrice).toFixed(2)}</td>
                            <td>{Number(it.lineTotal).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
