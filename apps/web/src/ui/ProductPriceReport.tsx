import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiRequest, getToken } from '../data/api';

type InvoiceItem = {
  id: string;
  productName: string;
  unit: string;
  quantity: number | string;
  unitCost: number | string;
  piecesPerPack?: number;
};

type Invoice = {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  supplier?: { id: string; name: string };
  items: InvoiceItem[];
};

type PricePoint = {
  date: string;
  supplier: string;
  productName: string;
  unit: string;
  quantity: number;
  unitCost: number;
  invoiceNumber: string;
  invoiceId: string;
  change: number | null;
  isFirst: boolean;
};

const num = (v: number | string) => Number(v) || 0;

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));
}

/**
 * تقرير تاريخ أسعار الشراء ومقارنة الموردين — من فواتير الوارد على الخادم.
 */
export function ProductPriceReport({ compact = false }: { compact?: boolean }) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [unitFilter, setUnitFilter] = useState<'ALL' | 'PIECE' | 'PACK'>('ALL');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    if (!getToken()) {
      setError('سجّل الدخول أولًا.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const inv = await apiRequest<Invoice[]>('/purchases/invoices');
      setInvoices(inv);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل فواتير الوارد.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const allPricePoints = useMemo(() => {
    const points: Omit<PricePoint, 'change' | 'isFirst'>[] = [];
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
    return points.sort((a, b) => a.date.localeCompare(b.date) || a.productName.localeCompare(b.productName, 'ar'));
  }, [invoices]);

  const productNames = useMemo(() => {
    const set = new Set(allPricePoints.map((p) => p.productName));
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ar'));
  }, [allPricePoints]);

  /** ملخص كل صنف+وحدة: آخر سعر ومقارنته بالشراء السابق */
  const allProductsSummary = useMemo(() => {
    const map = new Map<string, Omit<PricePoint, 'change' | 'isFirst'>[]>();
    for (const p of allPricePoints) {
      const key = `${p.productName}||${p.unit}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return Array.from(map.entries())
      .map(([, list]) => {
        const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));
        const last = sorted[sorted.length - 1];
        const prev = sorted.length > 1 ? sorted[sorted.length - 2] : null;
        const change = prev ? last.unitCost - prev.unitCost : null;
        return {
          productName: last.productName,
          unit: last.unit,
          lastPrice: last.unitCost,
          lastDate: last.date,
          supplier: last.supplier,
          change,
          count: sorted.length,
          min: Math.min(...sorted.map((x) => x.unitCost)),
          max: Math.max(...sorted.map((x) => x.unitCost)),
        };
      })
      .sort((a, b) => a.productName.localeCompare(b.productName, 'ar'));
  }, [allPricePoints]);

  const productReport = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    let rows = allPricePoints.filter((p) => p.productName.toLowerCase().includes(q));
    if (unitFilter === 'PIECE') rows = rows.filter((p) => p.unit === 'قطعة');
    if (unitFilter === 'PACK') rows = rows.filter((p) => p.unit === 'علبة');
    if (rows.length === 0) {
      return {
        name: query.trim(),
        rows: [] as PricePoint[],
        bySupplier: [] as Array<{
          supplier: string;
          last: number;
          min: number;
          max: number;
          avg: number;
          count: number;
          lastDate: string;
        }>,
        stats: null as null,
      };
    }

    const prices = rows.map((r) => r.unitCost);
    const last = rows[rows.length - 1];
    const stats = {
      last: last.unitCost,
      min: Math.min(...prices),
      max: Math.max(...prices),
      avg: prices.reduce((s, x) => s + x, 0) / prices.length,
      count: rows.length,
      name: last.productName,
      unitLabel: unitFilter === 'PACK' ? 'علبة' : unitFilter === 'PIECE' ? 'قطعة' : 'كل الوحدات',
    };

    const supplierMap = new Map<string, typeof rows>();
    for (const r of rows) {
      if (!supplierMap.has(r.supplier)) supplierMap.set(r.supplier, []);
      supplierMap.get(r.supplier)!.push(r);
    }
    const bySupplier = Array.from(supplierMap.entries())
      .map(([supplier, list]) => {
        const ps = list.map((x) => x.unitCost);
        const lastRow = list[list.length - 1];
        return {
          supplier,
          last: lastRow.unitCost,
          lastDate: lastRow.date,
          min: Math.min(...ps),
          max: Math.max(...ps),
          avg: ps.reduce((s, x) => s + x, 0) / ps.length,
          count: list.length,
        };
      })
      .sort((a, b) => a.min - b.min);

    const history: PricePoint[] = rows
      .map((r, i) => {
        const prev = i > 0 ? rows[i - 1].unitCost : null;
        const change = prev === null ? null : r.unitCost - prev;
        return { ...r, change, isFirst: i === 0 };
      })
      .reverse();

    return { name: stats.name, rows: history, bySupplier, stats };
  }, [allPricePoints, query, unitFilter]);

  function printProductReport() {
    if (!productReport?.stats) {
      setNotice('اختر منتجًا له مشتريات أولًا.');
      return;
    }
    const w = window.open('', '_blank');
    if (!w) {
      setNotice('اسمح بالنوافذ المنبثقة للطباعة.');
      return;
    }
    const s = productReport.stats;
    const supplierRows = productReport.bySupplier
      .map(
        (r) =>
          `<tr><td>${escapeHtml(r.supplier)}</td><td>${r.last.toFixed(2)}</td><td>${r.lastDate}</td><td>${r.min.toFixed(2)}</td><td>${r.max.toFixed(2)}</td><td>${r.avg.toFixed(2)}</td><td>${r.count}</td></tr>`,
      )
      .join('');
    const histRows = productReport.rows
      .map((r) => {
        const ch =
          r.change === null
            ? 'أول شراء'
            : r.change > 0
              ? `+${r.change.toFixed(2)} ▲`
              : r.change < 0
                ? `${r.change.toFixed(2)} ▼`
                : 'بدون تغيير';
        return `<tr><td>${escapeHtml(r.date)}</td><td>${escapeHtml(r.supplier)}</td><td>${r.quantity} ${escapeHtml(r.unit)}</td><td>${r.unitCost.toFixed(2)}</td><td>${ch}</td><td>${escapeHtml(r.invoiceNumber)}</td></tr>`;
      })
      .join('');
    w.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>تقرير ${escapeHtml(s.name)}</title>
<style>body{font-family:Tahoma,Arial;padding:16px}table{width:100%;border-collapse:collapse;margin:12px 0;font-size:13px}
th,td{border:1px solid #ccc;padding:6px 8px;text-align:center}th{background:#eef5f3}
h1{color:#0f766e}.stats{display:flex;gap:12px;flex-wrap:wrap;margin:12px 0}
.stats div{border:1px solid #ddd;border-radius:8px;padding:8px 14px;background:#f7faf9}</style></head><body>
<h1>تقرير المنتج: ${escapeHtml(s.name)} (${escapeHtml(s.unitLabel)})</h1>
<div class="stats">
<div><b>آخر سعر</b><br>${s.last.toFixed(2)}</div>
<div><b>أقل</b><br>${s.min.toFixed(2)}</div>
<div><b>أعلى</b><br>${s.max.toFixed(2)}</div>
<div><b>المتوسط</b><br>${s.avg.toFixed(2)}</div>
<div><b>مرات الشراء</b><br>${s.count}</div>
</div>
<h2>المقارنة بين الشركات (الأرخص أولًا)</h2>
<table><thead><tr><th>الشركة</th><th>آخر سعر</th><th>تاريخه</th><th>أقل</th><th>أعلى</th><th>المتوسط</th><th>مرات</th></tr></thead>
<tbody>${supplierRows}</tbody></table>
<h2>تاريخ الأسعار</h2>
<table><thead><tr><th>التاريخ</th><th>الشركة</th><th>الكمية</th><th>السعر</th><th>التغير</th><th>رقم الفاتورة</th></tr></thead>
<tbody>${histRows}</tbody></table>
<script>window.print()</script></body></html>`);
    w.document.close();
  }

  if (loading) return <div className="empty-state">جارٍ تحميل أسعار الشراء...</div>;
  if (error)
    return (
      <div className="purchase-notice" role="alert">
        {error}
      </div>
    );

  return (
    <section className="purchase-panel product-report-panel">
      {!compact && (
        <div className="panel-heading">
          <div>
            <h2>تاريخ أسعار الشراء ومقارنة الموردين</h2>
            <p>
              من فواتير الوارد: آخر سعر، هل السعر ارتفع أم انخفض، ومقارنة نفس الصنف بين الشركات.
            </p>
          </div>
          <button className="secondary-btn small" type="button" onClick={() => void load()}>
            تحديث
          </button>
        </div>
      )}

      {notice && (
        <div className="purchase-notice" role="status">
          {notice}
        </div>
      )}

      <div className="product-report-search">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          list="product-price-report-list"
          placeholder="ابحث عن منتج (اسم أو جزء من الاسم)"
        />
        <datalist id="product-price-report-list">
          {productNames.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
      </div>

      {/* نظرة عامة على كل المنتجات */}
      {!query.trim() && (
        <div className="product-report-block" style={{ marginTop: 16 }}>
          <h3>كل المنتجات — آخر سعر مقارنة بالسعر اللي قبله</h3>
          {allProductsSummary.length === 0 ? (
            <div className="empty-state">لا فواتير وارد بعد. سجّل فاتورة من تبويب المشتريات.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>المنتج</th>
                    <th>الوحدة</th>
                    <th>آخر سعر</th>
                    <th>التغير</th>
                    <th>الشركة</th>
                    <th>التاريخ</th>
                    <th>مرات</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {allProductsSummary.map((r) => (
                    <tr key={`${r.productName}-${r.unit}`}>
                      <td>{r.productName}</td>
                      <td>{r.unit}</td>
                      <td>{r.lastPrice.toLocaleString('en-US')}</td>
                      <td>
                        {r.change === null ? (
                          <span style={{ color: '#647b80' }}>—</span>
                        ) : r.change > 0 ? (
                          <span className="price-up">{Math.abs(r.change).toFixed(0)}+ ▲</span>
                        ) : r.change < 0 ? (
                          <span className="price-down">{Math.abs(r.change).toFixed(0)}- ▼</span>
                        ) : (
                          <span className="price-same">—</span>
                        )}
                      </td>
                      <td>{r.supplier}</td>
                      <td>{r.lastDate}</td>
                      <td>{r.count}</td>
                      <td>
                        <button
                          className="secondary-btn small"
                          type="button"
                          onClick={() => {
                            setQuery(r.productName);
                            setUnitFilter(r.unit === 'علبة' ? 'PACK' : 'PIECE');
                          }}
                        >
                          التفاصيل
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {query.trim() && !productReport?.stats && (
        <div className="empty-state">لا مشتريات مسجّلة لهذا الاسم. سجّل فواتير وارد أولًا.</div>
      )}

      {productReport?.stats &&
        (() => {
          const s = productReport.stats;
          const chartPts = [...productReport.rows].reverse();
          const prices = chartPts.map((p) => p.unitCost);
          const minP = Math.min(...prices);
          const maxP = Math.max(...prices);
          const range = Math.max(1, maxP - minP);
          const w = 560;
          const h = 160;
          const pad = 20;
          const coords = chartPts.map((p, i) => {
            const x =
              pad + (chartPts.length === 1 ? (w - pad * 2) / 2 : (i / (chartPts.length - 1)) * (w - pad * 2));
            const y = pad + (1 - (p.unitCost - minP) / range) * (h - pad * 2);
            return { x, y, p };
          });
          const polyline = coords.map((c) => `${c.x},${c.y}`).join(' ');

          return (
            <div className="product-report-card">
              <div className="product-report-head">
                <h2>
                  تقرير المنتج: {s.name}
                  <span className="unit-tag">
                    (
                    {s.unitLabel === 'علبة'
                      ? 'بالعلبة'
                      : s.unitLabel === 'قطعة'
                        ? 'بالقطعة'
                        : s.unitLabel}
                    )
                  </span>
                </h2>
                <div className="product-report-kpis">
                  <div>
                    <span>آخر سعر</span>
                    <b>{s.last.toLocaleString('en-US')} ج</b>
                  </div>
                  <div>
                    <span>أقل سعر</span>
                    <b>{s.min.toLocaleString('en-US')}</b>
                  </div>
                  <div>
                    <span>أعلى سعر</span>
                    <b>{s.max.toLocaleString('en-US')}</b>
                  </div>
                  <div>
                    <span>المتوسط</span>
                    <b>{Math.round(s.avg).toLocaleString('en-US')}</b>
                  </div>
                  <div>
                    <span>مرات الشراء</span>
                    <b>{s.count}</b>
                  </div>
                </div>
                <div className="product-report-unit-row">
                  <label>
                    الوحدة (للمقارنة بنفس الوحدة)
                    <select
                      value={unitFilter}
                      onChange={(e) => setUnitFilter(e.target.value as 'ALL' | 'PIECE' | 'PACK')}
                    >
                      <option value="ALL">الكل</option>
                      <option value="PACK">علبة</option>
                      <option value="PIECE">قطعة</option>
                    </select>
                  </label>
                </div>
              </div>

              <div className="product-report-chart">
                <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="180" role="img" aria-label="منحنى الأسعار">
                  <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="#dbe5e5" />
                  <polyline fill="none" stroke="#0f766e" strokeWidth="2.5" points={polyline} />
                  {coords.map((c, i) => (
                    <g key={i}>
                      <circle cx={c.x} cy={c.y} r="5" fill="#0f766e" />
                      <text x={c.x} y={c.y - 10} textAnchor="middle" fontSize="11" fill="#5a7076">
                        {c.p.unitCost}
                      </text>
                    </g>
                  ))}
                </svg>
                <div className="product-report-actions">
                  <button className="secondary-btn" type="button" onClick={printProductReport}>
                    طباعة التقرير
                  </button>
                  <button className="secondary-btn" type="button" onClick={() => setQuery('')}>
                    كل المنتجات
                  </button>
                </div>
              </div>

              <div className="product-report-block">
                <h3>المقارنة بين الشركات (الأرخص أولًا)</h3>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>الشركة</th>
                        <th>آخر سعر</th>
                        <th>تاريخه</th>
                        <th>أقل</th>
                        <th>أعلى</th>
                        <th>المتوسط</th>
                        <th>مرات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {productReport.bySupplier.map((r) => (
                        <tr key={r.supplier}>
                          <td>{r.supplier}</td>
                          <td>{r.last.toLocaleString('en-US')}</td>
                          <td>{r.lastDate}</td>
                          <td>{r.min.toLocaleString('en-US')}</td>
                          <td>{r.max.toLocaleString('en-US')}</td>
                          <td>{Math.round(r.avg).toLocaleString('en-US')}</td>
                          <td>{r.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="product-report-block">
                <h3>تاريخ الأسعار</h3>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>التاريخ</th>
                        <th>الشركة</th>
                        <th>الكمية</th>
                        <th>السعر</th>
                        <th>التغير</th>
                        <th>الفاتورة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {productReport.rows.map((r, idx) => {
                        const ch =
                          r.change === null ? (
                            <span style={{ color: '#647b80' }}>أول شراء</span>
                          ) : r.change > 0 ? (
                            <span className="price-up">{Math.abs(r.change).toFixed(0)}+ ▲</span>
                          ) : r.change < 0 ? (
                            <span className="price-down">{Math.abs(r.change).toFixed(0)}- ▼</span>
                          ) : (
                            <span className="price-same">—</span>
                          );
                        return (
                          <tr key={`${r.invoiceId}-${idx}`}>
                            <td>{r.date}</td>
                            <td>{r.supplier}</td>
                            <td>
                              {r.unit} {r.quantity}
                            </td>
                            <td>{r.unitCost.toLocaleString('en-US')}</td>
                            <td>{ch}</td>
                            <td dir="ltr">{r.invoiceNumber}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          );
        })()}
    </section>
  );
}
