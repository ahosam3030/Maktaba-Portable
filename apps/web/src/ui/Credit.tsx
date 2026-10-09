import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../data/api';
import { loadInvoiceSettings } from '../data/invoiceSettings';

type SaleItem = { productName: string; quantity: number; unitPrice: number; lineTotal: number; unit?: string | null };
type SaleRow = {
  id: string; invoiceNumber: string; saleDate: string; total: number; paidAmount: number;
  remaining: number; paymentStatus: string; discount?: number; items?: SaleItem[];
};
type CustomerRow = {
  id: string; name: string; phone: string | null; invoicesCount: number;
  salesTotal: number; paidTotal: number; balance: number;
};
type CustomerDetail = CustomerRow & { sales: SaleRow[] };

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
  const dateStr = sale.saleDate ? new Date(sale.saleDate).toLocaleDateString('ar-EG') : '';
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
<div><strong>التاريخ:</strong> ${escapeHtml(dateStr)}</div>
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
  const [paySaleId, setPaySaleId] = useState('');
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    try {
      const rows = await apiRequest<CustomerRow[]>('/customers');
      setList(Array.isArray(rows) ? rows : []);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'تعذر التحميل');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openInvoices = useMemo(() => {
    if (!selected) return [];
    return selected.sales.filter((s) => Number(s.remaining) > 0.001);
  }, [selected]);

  async function openCustomer(id: string) {
    setBusy(true);
    setMsg('');
    setOpenSale(null);
    setPaySaleId('');
    try {
      const d = await apiRequest<CustomerDetail>(`/customers/${id}`);
      setSelected(d);
      setPayAmount(d.balance > 0 ? String(Number(d.balance).toFixed(2)) : '');
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
            saleId: paySaleId || undefined,
          }),
        },
      );
      const detail = res?.applied?.length
        ? res.applied.map((a) => `${a.invoiceNumber}: ${Number(a.applied).toFixed(2)}`).join(' · ')
        : '';
      setMsg(detail ? `تم التحصيل — ${detail}` : 'تم تسجيل التحصيل');
      setPayNotes('');
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
      <div className="purchase-title">
        <div>
          <span className="eyebrow">المالية</span>
          <h1>الآجل والتحصيل</h1>
          <p>حسابات العملاء · سداد فاتورة أو جزء · عرض وطباعة في أي وقت</p>
        </div>
        <button className="secondary-btn" type="button" disabled={busy} onClick={() => void load()}>
          تحديث
        </button>
      </div>

      <div className="pur-stats">
        <div className="pur-stat">
          <div>
            <div className="label">عملاء في القائمة</div>
            <div className="value">{filtered.length}</div>
          </div>
        </div>
        <div className="pur-stat">
          <div>
            <div className="label">عليهم مبالغ</div>
            <div className="value" style={{ color: debtors ? '#b45309' : undefined }}>{debtors}</div>
          </div>
        </div>
        <div className="pur-stat">
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
              <h2>العملاء</h2>
              <p>اضغط «فتح الحساب» لعرض الفواتير والتحصيل</p>
            </div>
            <span className="count-badge">{filtered.length}</span>
          </div>
          <div className="filter-bar" style={{ marginBottom: 12 }}>
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
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>العميل</th>
                  <th>فواتير</th>
                  <th>المتبقي</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={4} className="muted">
                      لا يوجد عملاء آجل بعد — أنشئ فاتورة بيع آجل من المبيعات
                    </td>
                  </tr>
                )}
                {filtered.map((c) => (
                  <tr
                    key={c.id}
                    className={selected?.id === c.id ? 'credit-row-active' : undefined}
                  >
                    <td>
                      <strong>{c.name}</strong>
                      {c.phone ? (
                        <div className="muted" dir="ltr">
                          {c.phone}
                        </div>
                      ) : null}
                    </td>
                    <td>{c.invoicesCount}</td>
                    <td style={{ fontWeight: 700, color: c.balance > 0 ? '#b45309' : '#16815d' }}>
                      {Number(c.balance).toFixed(2)}
                    </td>
                    <td>
                      <button
                        className="secondary-btn small"
                        type="button"
                        disabled={busy}
                        onClick={() => void openCustomer(c.id)}
                      >
                        فتح الحساب
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* تفاصيل الحساب */}
        <section className="purchase-panel credit-panel-detail">
          {!selected && (
            <div className="credit-empty">
              <h2>حساب العميل</h2>
              <p className="muted">اختر عميلاً من القائمة لعرض فواتيره وتسجيل التحصيل أو الطباعة</p>
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
                <div className="credit-collect-title">تسجيل تحصيل</div>
                <div className="credit-collect-grid">
                  <label>
                    على أي فاتورة؟
                    <select value={paySaleId} onChange={(e) => onSelectPayTarget(e.target.value)}>
                      <option value="">توزيع تلقائي (من الأقدم للأحدث)</option>
                      {openInvoices.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.invoiceNumber} — متبقي {Number(s.remaining).toFixed(2)}
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

              {/* جدول الفواتير */}
              <div className="credit-invoices-head">
                <h3>فواتير العميل</h3>
                <span className="count-badge">{selected.sales.length}</span>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>رقم</th>
                      <th>تاريخ</th>
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
                        <td>{s.saleDate ? new Date(s.saleDate).toLocaleDateString('ar-EG') : '—'}</td>
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

              {/* تفاصيل فاتورة */}
              {openSale ? (
                <div className="credit-detail-card">
                  <div className="panel-heading">
                    <div>
                      <h3>
                        تفاصيل فاتورة <span dir="ltr">{openSale.invoiceNumber}</span>
                      </h3>
                      <p className="muted">
                        {openSale.saleDate
                          ? new Date(openSale.saleDate).toLocaleString('ar-EG')
                          : '—'}
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
