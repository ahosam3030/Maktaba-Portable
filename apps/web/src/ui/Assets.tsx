import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../data/api';
import { IconBoxes, IconMoney, IconPlus, IconRefresh, IconTrash } from './Icons';

type AssetRow = {
  id: string;
  name: string;
  category: string;
  purchaseDate: string;
  cost: number;
  quantity: number;
  lineTotal: number;
  status: string;
  serialNumber?: string | null;
  location?: string | null;
  supplierName?: string | null;
  notes?: string | null;
  postedToCash: boolean;
};

type ListRes = {
  items: AssetRow[];
  summary: { count: number; totalCost: number; activeCost: number };
};

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'نشط',
  MAINTENANCE: 'صيانة',
  SOLD: 'مباع',
  SCRAPPED: 'خردة',
};

const CATEGORIES = ['معدات', 'أجهزة', 'أثاث', 'تكييف', 'طباعة', 'حاسب آلي', 'أخرى'];

function fmtDate(v?: string) {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB');
}

export function Assets() {
  const [list, setList] = useState<AssetRow[]>([]);
  const [summary, setSummary] = useState({ count: 0, totalCost: 0, activeCost: 0 });
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('معدات');
  const [cost, setCost] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [purchaseDate, setPurchaseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [serialNumber, setSerialNumber] = useState('');
  const [location, setLocation] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [notes, setNotes] = useState('');
  const [postToCash, setPostToCash] = useState(true);
  const [status, setStatus] = useState('ACTIVE');

  const load = useCallback(async () => {
    setBusy(true);
    setMsg('');
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      if (statusFilter) params.set('status', statusFilter);
      const qs = params.toString();
      const res = await apiRequest<ListRes>(`/assets${qs ? `?${qs}` : ''}`);
      setList(res.items || []);
      setSummary(res.summary || { count: 0, totalCost: 0, activeCost: 0 });
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'تعذر التحميل');
    } finally {
      setBusy(false);
    }
  }, [q, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createAsset() {
    if (!name.trim()) {
      setMsg('اكتب اسم الأصل / المعدة');
      return;
    }
    setBusy(true);
    setMsg('');
    try {
      await apiRequest('/assets', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          category,
          cost: Number(cost) || 0,
          quantity: Number(quantity) || 1,
          purchaseDate: purchaseDate ? new Date(purchaseDate).toISOString() : undefined,
          serialNumber: serialNumber.trim() || undefined,
          location: location.trim() || undefined,
          supplierName: supplierName.trim() || undefined,
          notes: notes.trim() || undefined,
          status,
          postToCash,
        }),
      });
      setName('');
      setCost('');
      setQuantity('1');
      setSerialNumber('');
      setLocation('');
      setSupplierName('');
      setNotes('');
      setMsg(postToCash ? 'تم إضافة الأصل وتسجيل المصروف في الخزينة' : 'تم إضافة الأصل');
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'فشل الحفظ');
    } finally {
      setBusy(false);
    }
  }

  async function removeAsset(id: string, label: string) {
    if (!confirm(`حذف الأصل «${label}»؟`)) return;
    setBusy(true);
    try {
      await apiRequest(`/assets/${id}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'فشل الحذف');
    } finally {
      setBusy(false);
    }
  }

  async function setAssetStatus(id: string, next: string) {
    setBusy(true);
    try {
      await apiRequest(`/assets/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: next }),
      });
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'فشل التحديث');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="purchases-page assets-page">
      <div className="purchase-title page-enter">
        <div>
          <span className="eyebrow">المالية</span>
          <h1 className="page-title-with-icon">
            <span className="page-title-icon" aria-hidden>
              <IconBoxes size={26} />
            </span>
            أصول المكان
          </h1>
          <p>سجّل المعدات والأجهزة وتكلفة تجهيز المكان — مع إمكانية تسجيلها كمصروف في الخزينة</p>
        </div>
        <button className="secondary-btn btn-with-icon" type="button" disabled={busy} onClick={() => void load()}>
          <IconRefresh size={16} className={busy ? 'icon-spin' : undefined} />
          تحديث
        </button>
      </div>

      <div className="pur-stats stats-enter">
        <div className="pur-stat pur-stat--icon">
          <span className="pur-stat-icon pur-stat-icon--teal">
            <IconBoxes size={22} />
          </span>
          <div>
            <div className="label">عدد الأصول</div>
            <div className="value">{summary.count}</div>
          </div>
        </div>
        <div className="pur-stat pur-stat--icon">
          <span className="pur-stat-icon pur-stat-icon--amber">
            <IconMoney size={22} />
          </span>
          <div>
            <div className="label">قيمة النشط</div>
            <div className="value" dir="ltr">
              {Number(summary.activeCost).toFixed(2)}
            </div>
          </div>
        </div>
        <div className="pur-stat pur-stat--icon">
          <span className="pur-stat-icon pur-stat-icon--rose">
            <IconMoney size={22} />
          </span>
          <div>
            <div className="label">إجمالي التكلفة</div>
            <div className="value" dir="ltr">
              {Number(summary.totalCost).toFixed(2)}
            </div>
          </div>
        </div>
      </div>

      {msg ? <p className="notice">{msg}</p> : null}

      <div className="credit-layout" style={{ gridTemplateColumns: 'minmax(300px, 380px) 1fr' }}>
        <section className="purchase-panel">
          <div className="panel-heading">
            <div>
              <h2 className="heading-with-icon">
                <IconPlus size={18} /> إضافة أصل
              </h2>
              <p>طابعة · كمبيوتر · تكييف · أثاث · أجهزة تشغيل</p>
            </div>
          </div>
          <div className="credit-collect-grid" style={{ gridTemplateColumns: '1fr' }}>
            <label>
              اسم الأصل *
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: طابعة ليزر" />
            </label>
            <label>
              التصنيف
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label>
              التكلفة
              <input value={cost} onChange={(e) => setCost(e.target.value)} inputMode="decimal" dir="ltr" placeholder="0.00" />
            </label>
            <label>
              الكمية
              <input value={quantity} onChange={(e) => setQuantity(e.target.value)} inputMode="numeric" dir="ltr" />
            </label>
            <label>
              تاريخ الشراء
              <input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} dir="ltr" />
            </label>
            <label>
              الحالة
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                {Object.entries(STATUS_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label>
              الرقم التسلسلي
              <input value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} dir="ltr" placeholder="اختياري" />
            </label>
            <label>
              المكان / الغرفة
              <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="مثال: صالة الطباعة" />
            </label>
            <label>
              المورد
              <input value={supplierName} onChange={(e) => setSupplierName(e.target.value)} placeholder="اختياري" />
            </label>
            <label>
              ملاحظات
              <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="اختياري" />
            </label>
            <label className="assets-check">
              <input type="checkbox" checked={postToCash} onChange={(e) => setPostToCash(e.target.checked)} />
              تسجيل التكلفة كمصروف في الخزينة
            </label>
          </div>
          <div className="actions" style={{ marginTop: 14 }}>
            <button className="primary-btn" type="button" disabled={busy} onClick={() => void createAsset()}>
              حفظ الأصل
            </button>
          </div>
        </section>

        <section className="purchase-panel">
          <div className="panel-heading">
            <div>
              <h2>سجل الأصول</h2>
              <p>ابحث أو صفِّ حسب الحالة</p>
            </div>
            <span className="count-badge">{list.length}</span>
          </div>
          <div className="filter-bar" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
            <label className="grow" style={{ flex: 1, minWidth: 160 }}>
              بحث
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="اسم أو تصنيف أو مكان" />
            </label>
            <label style={{ minWidth: 140 }}>
              الحالة
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="">الكل</option>
                {Object.entries(STATUS_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>الأصل</th>
                  <th>التصنيف</th>
                  <th>التاريخ</th>
                  <th>التكلفة</th>
                  <th>الكمية</th>
                  <th>الإجمالي</th>
                  <th>الحالة</th>
                  <th>خزينة</th>
                  <th>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {list.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="muted" style={{ textAlign: 'center', padding: 24 }}>
                      لا توجد أصول بعد — أضف المعدات والأجهزة من النموذج
                    </td>
                  </tr>
                ) : (
                  list.map((a) => (
                    <tr key={a.id}>
                      <td>
                        <strong>{a.name}</strong>
                        {a.location ? <div className="muted" style={{ fontSize: 12 }}>{a.location}</div> : null}
                        {a.serialNumber ? (
                          <div className="muted" style={{ fontSize: 12 }} dir="ltr">
                            {a.serialNumber}
                          </div>
                        ) : null}
                      </td>
                      <td>
                        <span className="credit-chip credit-chip--id">{a.category}</span>
                      </td>
                      <td>
                        <span className="credit-chip credit-chip--time" dir="ltr">
                          {fmtDate(a.purchaseDate)}
                        </span>
                      </td>
                      <td dir="ltr">{Number(a.cost).toFixed(2)}</td>
                      <td dir="ltr">{a.quantity}</td>
                      <td dir="ltr">
                        <strong>{Number(a.lineTotal).toFixed(2)}</strong>
                      </td>
                      <td>
                        <select
                          value={a.status}
                          disabled={busy}
                          onChange={(e) => void setAssetStatus(a.id, e.target.value)}
                          style={{ minWidth: 100 }}
                        >
                          {Object.entries(STATUS_LABEL).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>{a.postedToCash ? 'نعم' : '—'}</td>
                      <td>
                        <button
                          className="secondary-btn small"
                          type="button"
                          disabled={busy}
                          onClick={() => void removeAsset(a.id, a.name)}
                          title="حذف"
                        >
                          <IconTrash size={14} /> حذف
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
