import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../data/api';

async function downloadReportCsv(from: string, to: string) {
  const q = new URLSearchParams();
  if (from) q.set('from', from);
  if (to) q.set('to', to);
  const data = await apiRequest<{ filename: string; body: string }>(`/reports/export/csv?${q}`);
  const blob = new Blob([data.body], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = data.filename || 'report.csv';
  a.click();
  URL.revokeObjectURL(url);
}
async function downloadReportXlsx(from: string, to: string) {
  const q = new URLSearchParams();
  if (from) q.set('from', from);
  if (to) q.set('to', to);
  const data = await apiRequest<{ filename: string; body: string; contentType?: string }>(`/reports/export/xlsx?${q}`);
  const blob = new Blob([data.body], { type: data.contentType || 'application/vnd.ms-excel' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = data.filename || 'report.xls';
  a.click();
  URL.revokeObjectURL(url);
}
function printReport() {
  window.print();
}

import { ProductPriceReport } from './ProductPriceReport';
import { IconChart, IconTag, IconPackage, IconRefresh } from './Icons';

const money = (n: number) =>
  `${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;
const qty = (n: number) => (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 3 });
const pct = (n: number) => `${(Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 1 })}%`;

type Summary = {
  period: { from: string | null; to: string | null };
  inventory: {
    skusTotal: number;
    skusInStock: number;
    unitsInStock: number;
    valueAtCost: number;
    valueAtSale: number;
    potentialProfit: number;
    items: Array<{
      id: string;
      name: string;
      barcode: string | null;
      stock: number;
      currentCost: number;
      salePrice: number;
      purchased: number;
      sold: number;
      returned: number;
      valueAtCost: number;
      valueAtSale: number;
    }>;
  };
  sales: {
    count: number;
    revenue: number;
    discount: number;
    net: number;
    paid: number;
    due: number;
    cogs: number;
    grossProfit: number;
    grossMarginPct: number;
  };
  services: {
    count: number;
    subtotal: number;
    fees: number;
    discount: number;
    net: number;
    paid: number;
    due: number;
  };
  combined: {
    revenue: number;
    profit: number;
  };
  purchases: {
    invoicesCount: number;
    total: number;
    paidOnInvoices: number;
    supplierPayments: number;
    returns: number;
    supplierDebt: number;
    purchasesAllTime: number;
  };
  cash: {
    income: number;
    expense: number;
    net: number;
    balanceAllTime: number;
    fromSales?: number;
    fromServices?: number;
    otherIncome?: number;
  };
  capital: { inStock: number; liquid: number; supplierDebt: number; working: number; remaining: number };
};

type SeriesRow = { key: string; label: string; salesNet: number; cogs: number; profit: number; count: number };
type TabId = 'overview' | 'prices' | 'stock';

function today() {
  return new Date().toISOString().slice(0, 10);
}
function startOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function startOfYear() {
  return new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);
}

function formatRange(from: string, to: string) {
  try {
    const f = new Date(from + 'T12:00:00').toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    const t = new Date(to + 'T12:00:00').toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    return `${f} — ${t}`;
  } catch {
    return `${from} — ${to}`;
  }
}

function Kpi({
  label,
  value,
  hint,
  tone = 'neutral',
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'ok' | 'warn' | 'danger' | 'neutral' | 'info';
  accent?: boolean;
}) {
  return (
    <article className={`rpt-kpi rpt-kpi--${tone}${accent ? ' rpt-kpi--accent' : ''}`}>
      <div className="rpt-kpi-label">{label}</div>
      <div className="rpt-kpi-value">{value}</div>
      {hint ? <div className="rpt-kpi-hint">{hint}</div> : null}
    </article>
  );
}

function ProfitBars({ series }: { series: SeriesRow[] }) {
  if (!series.length) return null;
  const maxAbs = Math.max(...series.map((s) => Math.abs(s.profit)), 1);
  const show = series.slice(-14);
  return (
    <div className="rpt-bars" role="img" aria-label="رسم أرباح الفترة">
      {show.map((row) => {
        const h = Math.max(4, (Math.abs(row.profit) / maxAbs) * 100);
        const up = row.profit >= 0;
        return (
          <div key={row.key} className="rpt-bar-col" title={`${row.label}: ${money(row.profit)}`}>
            <div className="rpt-bar-track">
              <div
                className={`rpt-bar-fill ${up ? 'up' : 'down'}`}
                style={{ height: `${h}%` }}
              />
            </div>
            <span className="rpt-bar-label">{row.label.replace(/^.*-/, '').slice(-5)}</span>
          </div>
        );
      })}
    </div>
  );
}

export function Reports() {
  const [tab, setTab] = useState<TabId>('overview');
  const [from, setFrom] = useState(startOfMonth());
  const [to, setTo] = useState(today());
  const [groupBy, setGroupBy] = useState<'day' | 'month' | 'year'>('day');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [series, setSeries] = useState<SeriesRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stockQuery, setStockQuery] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'in' | 'zero' | 'neg'>('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const q = `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
      const [s, ser] = await Promise.all([
        apiRequest<Summary>(`/reports/summary?${q}`),
        apiRequest<{ series: SeriesRow[] }>(`/reports/profit-series?groupBy=${groupBy}&${q}`),
      ]);
      setSummary(s);
      setSeries(ser.series || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل التقارير.');
      setSummary(null);
      setSeries([]);
    } finally {
      setLoading(false);
    }
  }, [from, to, groupBy]);

  useEffect(() => {
    void load();
  }, [load]);

  const stockRows = useMemo(() => {
    let items = summary?.inventory.items || [];
    const q = stockQuery.trim().toLowerCase();
    if (q) {
      items = items.filter(
        (i) => i.name.toLowerCase().includes(q) || (i.barcode || '').toLowerCase().includes(q),
      );
    }
    if (stockFilter === 'in') items = items.filter((i) => i.stock > 0);
    if (stockFilter === 'zero') items = items.filter((i) => i.stock === 0);
    if (stockFilter === 'neg') items = items.filter((i) => i.stock < 0);
    return items;
  }, [summary, stockQuery, stockFilter]);

  function preset(kind: 'today' | 'month' | 'year') {
    setTo(today());
    if (kind === 'today') {
      setFrom(today());
      setGroupBy('day');
    } else if (kind === 'month') {
      setFrom(startOfMonth());
      setGroupBy('day');
    } else {
      setFrom(startOfYear());
      setGroupBy('month');
    }
  }

  const totalProfit = useMemo(() => series.reduce((s, r) => s + r.profit, 0), [series]);

  return (
    <div className="purchases-page reports-page">
          <div className="toolbar-actions report-export-bar no-print" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <button type="button" className="secondary-btn" onClick={() => void downloadReportCsv(from, to).catch((e) => setError(e instanceof Error ? e.message : 'تعذر التصدير'))}>تصدير CSV</button>
            <button type="button" className="secondary-btn" onClick={() => void downloadReportXlsx(from, to).catch((e) => setError(e instanceof Error ? e.message : 'تعذر التصدير'))}>تصدير Excel</button>
            <button type="button" className="secondary-btn" onClick={() => printReport()}>طباعة / PDF</button>
          </div>

      <div className="purchase-title">
        <div>
          <span className="eyebrow">لوحة مالية</span>
          <h1>التقارير</h1>
          <p>رأس المال · الأرباح · أسعار الشراء · المخزون</p>
        </div>
        <button className="secondary-btn" type="button" onClick={() => void load()} disabled={loading}>
          <IconRefresh size={16} />
          <span>{loading ? 'جارٍ التحديث...' : 'تحديث البيانات'}</span>
        </button>
      </div>

      {error && (
        <div className="purchase-notice" role="alert">
          {error}
        </div>
      )}

      <div className="rpt-tabs" role="tablist">
        {(
          [
            { id: 'overview' as const, label: 'الملخص المالي', desc: 'رأس مال وأرباح', Icon: IconChart },
            { id: 'prices' as const, label: 'تاريخ الأسعار', desc: 'مقارنة الموردين', Icon: IconTag },
            { id: 'stock' as const, label: 'أرصدة المخزون', desc: 'كميات وقيم', Icon: IconPackage },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={tab === t.id ? 'active' : ''}
            onClick={() => setTab(t.id)}
          >
            <t.Icon size={22} className="rpt-tab-icon" />
            <div className="rpt-tab-text">
              <strong>{t.label}</strong>
              <span>{t.desc}</span>
            </div>
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <>
          <section className="rpt-toolbar">
            <div className="rpt-toolbar-fields">
              <label>
                من
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </label>
              <label>
                إلى
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </label>
              <label>
                التجميع
                <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as typeof groupBy)}>
                  <option value="day">يومي</option>
                  <option value="month">شهري</option>
                  <option value="year">سنوي</option>
                </select>
              </label>
            </div>
            <div className="rpt-toolbar-presets">
              <button type="button" className={from === today() && to === today() ? 'active' : ''} onClick={() => preset('today')}>
                اليوم
              </button>
              <button type="button" className={from === startOfMonth() && to === today() ? 'active' : ''} onClick={() => preset('month')}>
                هذا الشهر
              </button>
              <button type="button" className={from === startOfYear() && to === today() ? 'active' : ''} onClick={() => preset('year')}>
                هذه السنة
              </button>
            </div>
            <div className="rpt-toolbar-range">{formatRange(from, to)}</div>
          </section>

          {loading && <div className="empty-state">جارٍ حساب التقارير...</div>}

          {summary && !loading && (
            <>
              <section className="rpt-hero">
                <div className="rpt-hero-main">
                  <span>رأس المال المتبقي (عامل)</span>
                  <strong className={summary.capital.remaining >= 0 ? 'ok' : 'bad'}>
                    {money(summary.capital.remaining)}
                  </strong>
                  <p>نقد + مخزون بالتكلفة − مديونية الموردين</p>
                </div>
                <div className="rpt-hero-side">
                  <div>
                    <span>في البضاعة</span>
                    <b>{money(summary.capital.inStock)}</b>
                  </div>
                  <div>
                    <span>الخزينة</span>
                    <b>{money(summary.capital.liquid)}</b>
                  </div>
                  <div>
                    <span>دين الموردين</span>
                    <b className={summary.capital.supplierDebt > 0 ? 'warn' : ''}>
                      {money(summary.capital.supplierDebt)}
                    </b>
                  </div>
                </div>
              </section>

              <div className="rpt-section-head">
                <h3>أداء الفترة</h3>
                <span>{formatRange(from, to)}</span>
              </div>
              <div className="rpt-kpi-grid">
                <Kpi
                  label="صافي المبيعات"
                  value={money(summary.sales.net)}
                  hint={`${summary.sales.count} فاتورة · محصّل ${money(summary.sales.paid)}`}
                  tone="info"
                  accent
                />
                <Kpi label="تكلفة البضاعة المباعة" value={money(summary.sales.cogs)} hint="حسب تكلفة الأصناف" />
                <Kpi
                  label="مجمل ربح البضاعة"
                  value={money(summary.sales.grossProfit)}
                  hint={`هامش ${pct(summary.sales.grossMarginPct)}`}
                  tone={summary.sales.grossProfit >= 0 ? 'ok' : 'danger'}
                  accent
                />
                <Kpi
                  label="دخل الخدمات"
                  value={money(summary.services?.net ?? 0)}
                  hint={`${summary.services?.count ?? 0} فاتورة · محصّل ${money(summary.services?.paid ?? 0)}`}
                  tone="info"
                  accent
                />
                <Kpi
                  label="إجمالي الإيراد (بضاعة + خدمات)"
                  value={money(summary.combined?.revenue ?? summary.sales.net)}
                  hint={`ربح تقديري ${money(summary.combined?.profit ?? summary.sales.grossProfit)}`}
                  tone="ok"
                  accent
                />
                <Kpi
                  label="مشتريات الفترة"
                  value={money(summary.purchases.total)}
                  hint={`${summary.purchases.invoicesCount} فاتورة وارد`}
                />
              </div>

              <div className="rpt-kpi-grid rpt-kpi-grid--3">
                <Kpi
                  label="إيرادات الخزينة"
                  value={money(summary.cash.income)}
                  hint={`مبيعات ${money(summary.cash.fromSales ?? 0)} · خدمات ${money(summary.cash.fromServices ?? 0)}`}
                  tone="ok"
                />
                <Kpi label="مصروفات الخزينة" value={money(summary.cash.expense)} tone="danger" />
                <Kpi
                  label="صافي حركة الخزينة"
                  value={money(summary.cash.net)}
                  tone={summary.cash.net >= 0 ? 'ok' : 'danger'}
                />
              </div>

              <section className="purchase-panel rpt-panel">
                <div className="panel-heading">
                  <div>
                    <h2>
                      تسلسل الأرباح{' '}
                      <small style={{ fontWeight: 500, color: '#7a8e93' }}>
                        ({groupBy === 'day' ? 'يومي' : groupBy === 'month' ? 'شهري' : 'سنوي'})
                      </small>
                    </h2>
                    <p>صافي المبيعات − تكلفة البضاعة · إجمالي الفترة: {money(totalProfit)}</p>
                  </div>
                </div>
                <ProfitBars series={series} />
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>الفترة</th>
                        <th>فواتير</th>
                        <th>صافي المبيعات</th>
                        <th>التكلفة</th>
                        <th>الربح</th>
                      </tr>
                    </thead>
                    <tbody>
                      {series.map((row) => (
                        <tr key={row.key}>
                          <td>{row.label}</td>
                          <td>{row.count}</td>
                          <td>{money(row.salesNet)}</td>
                          <td>{money(row.cogs)}</td>
                          <td className={row.profit >= 0 ? 'num-ok' : 'num-bad'}>{money(row.profit)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {series.length === 0 && <div className="empty-state">لا مبيعات في هذه الفترة.</div>}
                </div>
              </section>
            </>
          )}
        </>
      )}

      {tab === 'prices' && <ProductPriceReport />}

      {tab === 'stock' && (
        <section className="purchase-panel rpt-panel">
          <div className="panel-heading">
            <div>
              <h2>أرصدة المخزون</h2>
              <p>وارد − مرتجعات − مبيعات ± تسويات</p>
            </div>
            {summary && (
              <span className="count-badge">
                {summary.inventory.skusTotal} صنف · {qty(summary.inventory.unitsInStock)} وحدة
              </span>
            )}
          </div>

          {loading && <div className="empty-state">جارٍ التحميل...</div>}

          {!loading && summary && (
            <>
              <div className="rpt-kpi-grid rpt-kpi-grid--3">
                <Kpi label="قيمة بالتكلفة" value={money(summary.inventory.valueAtCost)} />
                <Kpi label="قيمة بسعر البيع" value={money(summary.inventory.valueAtSale)} tone="info" />
                <Kpi
                  label="ربح محتمل عند البيع"
                  value={money(summary.inventory.potentialProfit)}
                  tone={summary.inventory.potentialProfit >= 0 ? 'ok' : 'danger'}
                  accent
                />
              </div>

              <div className="filter-bar">
                <label className="grow">
                  بحث
                  <input
                    value={stockQuery}
                    onChange={(e) => setStockQuery(e.target.value)}
                    placeholder="اسم الصنف أو باركود"
                  />
                </label>
                <label>
                  الرصيد
                  <select
                    value={stockFilter}
                    onChange={(e) => setStockFilter(e.target.value as typeof stockFilter)}
                  >
                    <option value="all">الكل</option>
                    <option value="in">متوفر</option>
                    <option value="zero">صفر</option>
                    <option value="neg">سالب</option>
                  </select>
                </label>
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>الصنف</th>
                      <th>باركود</th>
                      <th>وارد</th>
                      <th>مباع</th>
                      <th>مرتجع</th>
                      <th>الرصيد</th>
                      <th>تكلفة القطعة</th>
                      <th>قيمة التكلفة</th>
                      <th>سعر البيع</th>
                      <th>قيمة البيع</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stockRows.map((i) => (
                      <tr key={i.id}>
                        <td>{i.name}</td>
                        <td dir="ltr">{i.barcode || '—'}</td>
                        <td>{qty(i.purchased)}</td>
                        <td>{qty(i.sold)}</td>
                        <td>{qty(i.returned)}</td>
                        <td className={i.stock <= 0 ? 'num-bad' : 'num-ok'}>{qty(i.stock)}</td>
                        <td>{money(i.currentCost)}</td>
                        <td>{money(i.valueAtCost)}</td>
                        <td>{money(i.salePrice)}</td>
                        <td>{money(i.valueAtSale)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {stockRows.length === 0 && (
                  <div className="empty-state">لا أصناف مطابقة. سجّل فاتورة وارد من المشتريات.</div>
                )}
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
