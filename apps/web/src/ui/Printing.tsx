import { loadInvoiceSettings } from '../data/invoiceSettings';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../data/api';
import { IconPrint, IconRefresh, IconReceipt, IconWallet } from './Icons';

type ChargeUnit = 'page' | 'copy' | 'job';

type Service = {
  id: string;
  name: string;
  unitPrice: number;
  chargeUnit: ChargeUnit;
  active: boolean;
  sortOrder: number;
  notes?: string | null;
};

type ReceiptItem = {
  id?: string;
  serviceId?: string | null;
  serviceName: string;
  description?: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

type Receipt = {
  id: string;
  receiptNo: string;
  date: string;
  customerName?: string | null;
  serviceId?: string | null;
  serviceName: string;
  service?: string;
  description?: string | null;
  paperSize?: string | null;
  colorMode?: string | null;
  pages: number;
  copies: number;
  sides?: string | null;
  unitPrice: number;
  extraFees: number;
  discount: number;
  total: number;
  paid: number;
  notes?: string | null;
  cashTransactionId?: string | null;
  items?: ReceiptItem[];
};

type DraftLine = {
  key: string;
  serviceId: string;
  serviceName: string;
  description: string;
  quantity: string;
  unitPrice: string;
};

const money = (n: number) =>
  `${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;

const makeReceiptNo = () =>
  `S-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(Date.now()).slice(-5)}`;

function escapeHtml(s: string) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));
}

const unitLabel = (u: ChargeUnit) =>
  u === 'page' ? 'حسب الصفحة' : u === 'copy' ? 'حسب النسخة' : 'سعر ثابت';

export function Printing() {
  const [jobs, setJobs] = useState<Receipt[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [tab, setTab] = useState<'new' | 'history' | 'services'>('new');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [receiptNo, setReceiptNo] = useState(makeReceiptNo());
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [customerName, setCustomerName] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [extraFees, setExtraFees] = useState('0');
  const [discount, setDiscount] = useState('0');
  const [paid, setPaid] = useState('');
  const [notes, setNotes] = useState('');
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const [editName, setEditName] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editUnit, setEditUnit] = useState<ChargeUnit>('job');
  const [editingId, setEditingId] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [svc, receipts] = await Promise.all([
        apiRequest<Service[]>('/services'),
        apiRequest<Receipt[]>('/service-receipts'),
      ]);
      setServices(svc);
      setJobs(receipts);
      const first = svc.find((s) => s.active) || svc[0];
      if (first) {
        setServiceId((cur) => (cur && svc.some((s) => s.id === cur) ? cur : first.id));
        setLines((prev) => {
          if (prev.length > 0) return prev;
          return [
            {
              key: crypto.randomUUID(),
              serviceId: first.id,
              serviceName: first.name,
              description: '',
              quantity: '1',
              unitPrice: String(first.unitPrice),
            },
          ];
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل الخدمات والإيصالات من الخادم.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const activeServices = useMemo(() => services.filter((s) => s.active), [services]);

  const computedLines = lines.map((l) => {
    const quantity = Math.max(0, Number(l.quantity) || 0);
    const unitPrice = Math.max(0, Number(l.unitPrice) || 0);
    return { ...l, quantity, unitPrice, lineTotal: quantity * unitPrice };
  });
  const subtotal = computedLines.reduce((s, l) => s + l.lineTotal, 0);
  const extras = Math.max(0, Number(extraFees) || 0);
  const discountN = Math.max(0, Number(discount) || 0);
  const total = Math.max(0, subtotal + extras - discountN);
  const paidN = paid.trim() === '' ? total : Math.max(0, Number(paid) || 0);

  function addLine() {
    const first = activeServices[0];
    setLines((prev) => [
      ...prev,
      {
        key: crypto.randomUUID(),
        serviceId: first?.id || '',
        serviceName: first?.name || '',
        description: '',
        quantity: '1',
        unitPrice: String(first?.unitPrice ?? 0),
      },
    ]);
  }

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function setLineService(key: string, id: string) {
    const s = services.find((x) => x.id === id);
    updateLine(key, {
      serviceId: id,
      serviceName: s?.name || '',
      unitPrice: String(s?.unitPrice ?? 0),
    });
  }

  function removeLine(key: string) {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.key !== key)));
  }

  const filtered = jobs.filter((j) =>
    `${j.receiptNo} ${j.customerName || ''} ${j.description || ''} ${j.serviceName || ''}`
      .toLowerCase()
      .includes(search.toLowerCase().trim()),
  );

  const stats = useMemo(() => {
    const income = jobs.reduce((s, j) => s + Number(j.total), 0);
    const collected = jobs.reduce((s, j) => s + Number(j.paid), 0);
    return { count: jobs.length, income, due: Math.max(0, income - collected) };
  }, [jobs]);

  function printJob(job: Receipt) {
    const inv = loadInvoiceSettings();
    const paper = inv.paperSize || 'thermal_80';
    const widthMm = paper === 'thermal_58' ? 58 : paper === 'a4' ? 210 : 80;
    const w = window.open('', '_blank', 'width=800,height=700');
    if (!w) {
      setNotice('اسمح بالنوافذ المنبثقة لإتمام الطباعة.');
      return;
    }
    const items =
      job.items && job.items.length > 0
        ? job.items
        : [
            {
              serviceName: job.serviceName || 'خدمة',
              description: job.description,
              quantity: 1,
              unitPrice: Number(job.unitPrice),
              lineTotal: Number(job.total) - Number(job.extraFees) + Number(job.discount),
            },
          ];
    const itemRows = items
      .map(
        (it) =>
          `<tr><td>${escapeHtml(it.serviceName)}</td><td>${escapeHtml(it.description || '—')}</td><td>${Number(it.quantity)}</td><td>${Number(it.unitPrice).toFixed(2)}</td><td>${Number(it.lineTotal).toFixed(2)}</td></tr>`,
      )
      .join('');
    w.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>@page{margin:2mm}body{width:${widthMm}mm;max-width:${widthMm}mm;margin:0 auto}</style><title>فاتورة ${escapeHtml(job.receiptNo)}</title>
<style>body{font-family:Tahoma,Arial,sans-serif;padding:24px;color:#111}h1{text-align:center;font-size:22px}p{margin:7px 0}.line{border-top:1px dashed #888;margin:14px 0}table{width:100%;border-collapse:collapse;margin-top:10px}th,td{padding:8px;border-bottom:1px solid #ddd;text-align:center;font-size:13px}th{background:#f3f6f6}.total{font-size:18px;font-weight:bold}</style>
</head><body>
<h1>فاتورة خدمات</h1>
<p style="text-align:center">${escapeHtml(job.receiptNo)}</p>
<div class="line"></div>
<p>التاريخ: ${escapeHtml(job.date)}</p>
<p>العميل: ${escapeHtml(job.customerName || 'عميل نقدي')}</p>
<table>
<thead><tr><th>الخدمة</th><th>الوصف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead>
<tbody>${itemRows}</tbody>
</table>
<table>
<tr><td>رسوم إضافية</td><td>${Number(job.extraFees).toFixed(2)} ج.م</td></tr>
<tr><td>الخصم</td><td>${Number(job.discount).toFixed(2)} ج.م</td></tr>
<tr><td class="total">الإجمالي</td><td class="total">${Number(job.total).toFixed(2)} ج.م</td></tr>
<tr><td>المدفوع</td><td>${Number(job.paid).toFixed(2)} ج.م</td></tr>
<tr><td>المتبقي</td><td>${(Number(job.total) - Number(job.paid)).toFixed(2)} ج.م</td></tr>
</table>
${job.notes ? `<p>ملاحظات: ${escapeHtml(job.notes)}</p>` : ''}
<div class="line"></div>
<p style="text-align:center">شكرًا لثقتكم بنا</p>
<script>window.onload=()=>{window.print()}</script>
</body></html>`);
    w.document.close();
  }

  async function saveJob() {
    if (!receiptNo.trim()) {
      setNotice('اكتب رقم الفاتورة.');
      return;
    }
    const valid = computedLines.filter((l) => l.serviceName && l.lineTotal >= 0 && l.quantity > 0);
    if (valid.length === 0) {
      setNotice('أضف بند خدمة واحدًا على الأقل.');
      return;
    }
    if (activeServices.length === 0) {
      setNotice('أضف خدمة من تبويب الخدمات والأسعار أولًا.');
      return;
    }
    setBusy(true);
    setNotice('');
    try {
      const job = await apiRequest<Receipt>(
        '/service-receipts',
        {
          method: 'POST',
          body: JSON.stringify({
            receiptNo: receiptNo.trim(),
            receiptDate: date,
            customerName: customerName.trim() || undefined,
            extraFees: extras,
            discount: discountN,
            total,
            paidAmount: Math.min(total, paidN),
            notes: notes.trim() || undefined,
            items: valid.map((l) => ({
              serviceId: l.serviceId || undefined,
              serviceName: l.serviceName,
              description: l.description || undefined,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              lineTotal: l.lineTotal,
            })),
          }),
        },
        { queueLabel: 'حفظ فاتورة خدمات' },
      );
      setNotice(
        `تم إنشاء الفاتورة ${job.receiptNo}` + (job.paid > 0 ? ' وتسجيل المدفوع في الخزينة.' : '.'),
      );
      setReceiptNo(makeReceiptNo());
      setCustomerName('');
      setExtraFees('0');
      setDiscount('0');
      setPaid('');
      setNotes('');
      const first = activeServices[0];
      setLines(
        first
          ? [
              {
                key: crypto.randomUUID(),
                serviceId: first.id,
                serviceName: first.name,
                description: '',
                quantity: '1',
                unitPrice: String(first.unitPrice),
              },
            ]
          : [],
      );
      await loadAll();
      printJob(job);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'تعذر حفظ الفاتورة.');
    } finally {
      setBusy(false);
    }
  }

  async function deleteJob(job: Receipt) {
    if (!confirm(`حذف الإيصال ${job.receiptNo}؟\nسيتم إلغاء قيده من الخزينة إن وُجد.`)) return;
    setBusy(true);
    try {
      await apiRequest(`/service-receipts/${job.id}`, { method: 'DELETE' }, { queueLabel: 'حذف — فاتورة خدمات' });
      setNotice(`تم حذف ${job.receiptNo}.`);
      await loadAll();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'تعذر الحذف.');
    } finally {
      setBusy(false);
    }
  }

  async function saveService() {
    const name = editName.trim();
    const price = Number(editPrice);
    if (!name || !Number.isFinite(price) || price < 0) {
      setNotice('أدخل اسم الخدمة وسعرًا صحيحًا.');
      return;
    }
    setBusy(true);
    try {
      if (editingId) {
        await apiRequest(`/services/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify({ name, unitPrice: price, chargeUnit: editUnit }),
        }, { queueLabel: 'تعديل — خدمة' });
        setNotice('تم تحديث الخدمة على الخادم.');
      } else {
        await apiRequest('/services', {
          method: 'POST',
          body: JSON.stringify({ name, unitPrice: price, chargeUnit: editUnit }),
        }, { queueLabel: 'خدمة' });
        setNotice('تم إضافة الخدمة على الخادم.');
      }
      setEditName('');
      setEditPrice('');
      setEditUnit('job');
      setEditingId(null);
      await loadAll();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'تعذر حفظ الخدمة.');
    } finally {
      setBusy(false);
    }
  }

  function startEdit(s: Service) {
    setEditingId(s.id);
    setEditName(s.name);
    setEditPrice(String(s.unitPrice));
    setEditUnit(s.chargeUnit);
    setTab('services');
  }

  async function toggleActive(s: Service) {
    setBusy(true);
    try {
      await apiRequest(`/services/${s.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !s.active }),
      }, { queueLabel: 'تعديل — خدمة' });
      await loadAll();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'تعذر التحديث.');
    } finally {
      setBusy(false);
    }
  }

  async function removeService(s: Service) {
    if (!confirm(`حذف الخدمة «${s.name}»؟`)) return;
    setBusy(true);
    try {
      const res = await apiRequest<{ deactivated?: boolean }>(`/services/${s.id}`, { method: 'DELETE' }, { queueLabel: 'حذف — خدمة' });
      if (serviceId === s.id) setServiceId('');
      setNotice(res.deactivated ? 'تم تعطيل الخدمة لارتباطها بإيصالات.' : 'تم حذف الخدمة.');
      await loadAll();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'تعذر الحذف.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="purchases-page">
      <div className="purchase-title">
        <div>
          <span className="eyebrow">مركز الخدمات</span>
          <h1>الخدمات والإيصالات</h1>
          <p>محفوظة على الخادم · المدفوع يُسجَّل تلقائيًا في الخزينة · مرتبطة بالمكتبة</p>
        </div>
        <button className="secondary-btn" type="button" onClick={() => void loadAll()}>
          <IconRefresh size={16} />
          <span>تحديث</span>
        </button>
      </div>

      {notice && (
        <div className="purchase-notice" role="status">
          {notice}
        </div>
      )}
      {error && (
        <div className="purchase-notice" role="alert">
          {error}
        </div>
      )}

      <div className="pur-stats">
        <div className="pur-stat">
          <span className="pur-stat-icon">
            <IconReceipt size={18} />
          </span>
          <div>
            <div className="label">الإيصالات</div>
            <div className="value">{stats.count}</div>
          </div>
        </div>
        <div className="pur-stat">
          <span className="pur-stat-icon">
            <IconPrint size={18} />
          </span>
          <div>
            <div className="label">إجمالي الخدمات</div>
            <div className="value" style={{ fontSize: 18 }}>
              {money(stats.income)}
            </div>
          </div>
        </div>
        <div className="pur-stat">
          <span className="pur-stat-icon">
            <IconWallet size={18} />
          </span>
          <div>
            <div className="label">المتبقي للتحصيل</div>
            <div className="value" style={{ fontSize: 18, color: stats.due > 0 ? '#b45309' : undefined }}>
              {money(stats.due)}
            </div>
          </div>
        </div>
      </div>

      <div className="pur-tabs" role="tablist">
        <button type="button" className={tab === 'new' ? 'active' : ''} onClick={() => setTab('new')}>
          <IconReceipt size={16} />
          <span>فاتورة جديدة</span>
        </button>
        <button type="button" className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>
          <IconPrint size={16} />
          <span>سجل الفواتير</span>
        </button>
        <button type="button" className={tab === 'services' ? 'active' : ''} onClick={() => setTab('services')}>
          <IconWallet size={16} />
          <span>الخدمات والأسعار</span>
        </button>
      </div>

      {loading && <div className="empty-state">جارٍ التحميل من الخادم...</div>}

      {tab === 'services' && !loading && (
        <section className="purchase-panel">
          <div className="panel-heading">
            <div>
              <h2>إدارة الخدمات</h2>
              <p>تُحفظ على PostgreSQL لكل مكتبة. عند أول فتح تُنشأ خدمات افتراضية.</p>
            </div>
          </div>
          <div className="settings-form-grid">
            <label className="pur-field">
              اسم الخدمة
              <input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="تجليد / تصوير / بحث..." />
            </label>
            <label className="pur-field">
              السعر (ج.م)
              <input type="number" min="0" step="0.01" value={editPrice} onChange={(e) => setEditPrice(e.target.value)} />
            </label>
            <label className="pur-field">
              طريقة الحساب
              <select value={editUnit} onChange={(e) => setEditUnit(e.target.value as ChargeUnit)}>
                <option value="job">سعر ثابت للخدمة</option>
                <option value="page">حسب الصفحة (صفحات × نسخ × السعر)</option>
                <option value="copy">حسب النسخة</option>
              </select>
            </label>
          </div>
          <div className="pur-footer-actions" style={{ justifyContent: 'flex-start', marginTop: 12 }}>
            <button className="primary-btn" type="button" disabled={busy} onClick={() => void saveService()}>
              {editingId ? 'حفظ التعديل' : 'إضافة خدمة'}
            </button>
            {editingId && (
              <button
                className="secondary-btn"
                type="button"
                onClick={() => {
                  setEditingId(null);
                  setEditName('');
                  setEditPrice('');
                  setEditUnit('job');
                }}
              >
                إلغاء
              </button>
            )}
          </div>
          <div className="table-wrap" style={{ marginTop: 16 }}>
            <table>
              <thead>
                <tr>
                  <th>الخدمة</th>
                  <th>السعر</th>
                  <th>الحساب</th>
                  <th>الحالة</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {services.map((s) => (
                  <tr key={s.id} style={{ opacity: s.active ? 1 : 0.5 }}>
                    <td>{s.name}</td>
                    <td>{money(s.unitPrice)}</td>
                    <td>{unitLabel(s.chargeUnit)}</td>
                    <td>{s.active ? <span className="tag synced">نشط</span> : <span className="tag local">معطّل</span>}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button className="secondary-btn small" type="button" onClick={() => startEdit(s)}>
                          تعديل
                        </button>
                        <button className="secondary-btn small" type="button" onClick={() => void toggleActive(s)}>
                          {s.active ? 'تعطيل' : 'تفعيل'}
                        </button>
                        <button className="danger-outline-btn small" type="button" onClick={() => void removeService(s)}>
                          حذف
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'new' && !loading && (
        <section className="purchase-panel pur-invoice">
          <div className="panel-heading">
            <div>
              <h2>إنشاء فاتورة خدمات</h2>
              <p>عدة بنود في فاتورة واحدة · المدفوع يُقيَّد في الخزينة تلقائيًا.</p>
            </div>
          </div>

          <div className="pur-section">
            <div className="pur-section-title">بيانات الفاتورة</div>
            <div className="settings-form-grid">
              <label className="pur-field">
                رقم الفاتورة
                <input value={receiptNo} onChange={(e) => setReceiptNo(e.target.value)} dir="ltr" />
              </label>
              <label className="pur-field">
                التاريخ
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </label>
              <label className="pur-field">
                العميل
                <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="عميل نقدي" />
              </label>
            </div>
          </div>

          <div className="pur-section">
            <div className="pur-section-title">بنود الفاتورة</div>
            <div className="sale-lines-wrap pur-lines">
              <table className="sale-lines-table">
                <thead>
                  <tr>
                    <th>الخدمة</th>
                    <th>الوصف</th>
                    <th>الكمية</th>
                    <th>سعر الوحدة</th>
                    <th>الإجمالي</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {computedLines.map((l) => (
                    <tr key={l.key}>
                      <td>
                        <select value={l.serviceId} onChange={(e) => setLineService(l.key, e.target.value)}>
                          {activeServices.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          value={l.description}
                          onChange={(e) => updateLine(l.key, { description: e.target.value })}
                          placeholder="اختياري"
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min={0.001}
                          step="1"
                          value={l.quantity}
                          onChange={(e) => updateLine(l.key, { quantity: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={l.unitPrice}
                          onChange={(e) => updateLine(l.key, { unitPrice: e.target.value })}
                        />
                      </td>
                      <td>{money(l.lineTotal)}</td>
                      <td>
                        <button className="danger-outline-btn small" type="button" onClick={() => removeLine(l.key)}>
                          حذف
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pur-lines-actions">
              <button className="add-line-btn" type="button" onClick={addLine}>
                + إضافة بند
              </button>
            </div>
          </div>

          <div className="pur-footer">
            <div className="pur-footer-fields">
              <label>
                رسوم إضافية
                <input type="number" min={0} step="0.01" value={extraFees} onChange={(e) => setExtraFees(e.target.value)} />
              </label>
              <label>
                خصم
                <input type="number" min={0} step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} />
              </label>
              <label>
                المدفوع (فارغ = كامل)
                <input type="number" min={0} step="0.01" value={paid} onChange={(e) => setPaid(e.target.value)} placeholder={String(total)} />
              </label>
              <label className="pur-field--grow">
                ملاحظات
                <input value={notes} onChange={(e) => setNotes(e.target.value)} />
              </label>
            </div>
            <div className="pur-footer-summary">
              <div className="sale-totals-grid">
                <div className="sale-total-item">
                  <span>المجموع</span>
                  <strong>{money(subtotal)}</strong>
                </div>
                <div className="sale-total-item">
                  <span>بعد الخصم/الرسوم</span>
                  <strong>{money(total)}</strong>
                </div>
              </div>
              <div className="pur-total-box">
                <span>إجمالي الفاتورة</span>
                <strong>{money(total)}</strong>
              </div>
              <div className="pur-footer-actions">
                <button className="primary-btn" type="button" disabled={busy} onClick={() => void saveJob()}>
                  إنشاء الفاتورة وطباعة
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {tab === 'history' && !loading && (
        <section className="purchase-panel">
          <div className="panel-heading">
            <div>
              <h2>سجل الإيصالات</h2>
              <p>من الخادم — الحذف يلغي قيد الخزينة المرتبط.</p>
            </div>
            <span className="count-badge">{filtered.length}</span>
          </div>
          <div className="filter-bar">
            <label className="grow">
              بحث
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="رقم / عميل / خدمة" />
            </label>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>الإيصال</th>
                  <th>التاريخ</th>
                  <th>العميل</th>
                  <th>الخدمة</th>
                  <th>الإجمالي</th>
                  <th>المدفوع</th>
                  <th>خزينة</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((j) => (
                  <tr key={j.id}>
                    <td dir="ltr">{j.receiptNo}</td>
                    <td>{j.date}</td>
                    <td>{j.customerName || '—'}</td>
                    <td>{j.serviceName}</td>
                    <td>{money(j.total)}</td>
                    <td>{money(j.paid)}</td>
                    <td>
                      {j.cashTransactionId ? (
                        <span className="tag synced">مقيّد</span>
                      ) : (
                        <span className="tag local">—</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="secondary-btn small" type="button" onClick={() => printJob(j)}>
                          طباعة
                        </button>
                        <button className="danger-outline-btn small" type="button" onClick={() => void deleteJob(j)}>
                          حذف
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && <div className="empty-state">لا إيصالات بعد.</div>}
          </div>
        </section>
      )}
    </div>
  );
}
