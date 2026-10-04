import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../data/api';

type Preview = {
  businessDate: string;
  cashSales: number;
  cashIn: number;
  cashOut: number;
  closed: boolean;
  existing: null | {
    openingFloat: number;
    expectedCash: number;
    countedCash: number;
    variance: number;
    notes?: string | null;
  };
};

type DrawerRow = {
  id: string;
  kind: string;
  amount: number | string;
  reason?: string | null;
  createdAt: string;
};

export function DayClose() {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [opening, setOpening] = useState('0');
  const [counted, setCounted] = useState('0');
  const [notes, setNotes] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [closes, setCloses] = useState<Array<Record<string, unknown>>>([]);
  const [drawer, setDrawer] = useState<DrawerRow[]>([]);
  const [drawerKind, setDrawerKind] = useState('OPEN_DRAWER');
  const [drawerAmount, setDrawerAmount] = useState('');
  const [drawerReason, setDrawerReason] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    try {
      const [p, list, dr] = await Promise.all([
        apiRequest<Preview>(`/cash-ops/day-preview?date=${encodeURIComponent(date)}`),
        apiRequest<Array<Record<string, unknown>>>('/cash-ops/day-closes'),
        apiRequest<DrawerRow[]>('/cash-ops/drawer'),
      ]);
      setPreview(p);
      setCloses(Array.isArray(list) ? list : []);
      setDrawer(Array.isArray(dr) ? dr : []);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'تعذر التحميل');
    }
  }, [date]);

  useEffect(() => {
    void load();
  }, [load]);

  const expected =
    (Number(opening) || 0) +
    (preview?.cashSales || 0) +
    (preview?.cashIn || 0) -
    (preview?.cashOut || 0);

  async function closeDay() {
    try {
      const r = await apiRequest<{ variance: number }>('/cash-ops/day-close', {
        method: 'POST',
        body: JSON.stringify({
          date,
          openingFloat: Number(opening) || 0,
          countedCash: Number(counted) || 0,
          notes: notes.trim() || undefined,
        }),
      });
      setMsg(`تم إغلاق اليومية. الفرق: ${Number(r.variance).toFixed(2)}`);
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'فشل الإغلاق');
    }
  }

  async function postDrawer() {
    try {
      await apiRequest('/cash-ops/drawer', {
        method: 'POST',
        body: JSON.stringify({
          kind: drawerKind,
          amount: drawerKind === 'OPEN_DRAWER' ? 0 : Number(drawerAmount) || 0,
          reason: drawerReason.trim() || undefined,
        }),
      });
      setMsg(drawerKind === 'OPEN_DRAWER' ? 'تم تسجيل فتح الدرج.' : 'تم تسجيل حركة الدرج.');
      setDrawerAmount('');
      setDrawerReason('');
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'فشل التسجيل');
    }
  }

  return (
    <div className="home-dashboard">
      <div className="panel">
        <div className="panel-heading">
          <div>
            <h2>إغلاق اليومية</h2>
            <p className="muted-sm">عهدة + مبيعات نقدية − مصروف = المتوقع، ثم العد الفعلي.</p>
          </div>
        </div>
        {msg && (
          <p className="feedback" role="status">
            {msg}
          </p>
        )}
        <div className="form-grid">
          <label>
            تاريخ العمل
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label>
            عهدة الافتتاح
            <input type="number" min={0} step="0.01" value={opening} onChange={(e) => setOpening(e.target.value)} />
          </label>
          <label>
            المعدود في الدرج
            <input type="number" min={0} step="0.01" value={counted} onChange={(e) => setCounted(e.target.value)} />
          </label>
          <label>
            ملاحظات
            <input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
        </div>
        <div className="stats-grid" style={{ marginTop: 12 }}>
          <div className="stat-card">
            <span>مبيعات/وارد نقدي</span>
            <strong>{(preview?.cashSales || 0).toFixed(2)}</strong>
          </div>
          <div className="stat-card">
            <span>متوقع في الدرج</span>
            <strong>{expected.toFixed(2)}</strong>
          </div>
          <div className="stat-card">
            <span>الفرق</span>
            <strong style={{ color: Number(counted) - expected === 0 ? undefined : '#b42318' }}>
              {(Number(counted) - expected).toFixed(2)}
            </strong>
          </div>
        </div>
        <div className="form-actions" style={{ marginTop: 12 }}>
          <button type="button" className="primary-btn" disabled={preview?.closed} onClick={() => void closeDay()}>
            {preview?.closed ? 'اليوم مغلق' : 'إغلاق اليومية'}
          </button>
        </div>
      </div>

      <div className="panel">
        <div className="panel-heading">
          <div>
            <h2>حركة الدرج</h2>
            <p className="muted-sm">فتح درج، توريد، أو صرف نقدي مرتبط بالخزينة.</p>
          </div>
        </div>
        <div className="form-grid">
          <label>
            النوع
            <select value={drawerKind} onChange={(e) => setDrawerKind(e.target.value)}>
              <option value="OPEN_DRAWER">فتح الدرج</option>
              <option value="PAY_IN">توريد نقد</option>
              <option value="PAY_OUT">صرف من الدرج</option>
            </select>
          </label>
          {drawerKind !== 'OPEN_DRAWER' && (
            <label>
              المبلغ
              <input
                type="number"
                min={0}
                step="0.01"
                value={drawerAmount}
                onChange={(e) => setDrawerAmount(e.target.value)}
              />
            </label>
          )}
          <label>
            السبب
            <input value={drawerReason} onChange={(e) => setDrawerReason(e.target.value)} />
          </label>
        </div>
        <div className="form-actions">
          <button type="button" className="primary-btn" onClick={() => void postDrawer()}>
            تسجيل
          </button>
        </div>
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table>
            <thead>
              <tr>
                <th>الوقت</th>
                <th>النوع</th>
                <th>المبلغ</th>
                <th>السبب</th>
              </tr>
            </thead>
            <tbody>
              {drawer.slice(0, 30).map((d) => (
                <tr key={d.id}>
                  <td>{new Date(d.createdAt).toLocaleString('ar-EG')}</td>
                  <td>{d.kind}</td>
                  <td>{Number(d.amount).toFixed(2)}</td>
                  <td>{d.reason || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <h2>سجل الإغلاقات</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>التاريخ</th>
                <th>متوقع</th>
                <th>معدود</th>
                <th>فرق</th>
              </tr>
            </thead>
            <tbody>
              {closes.map((c) => (
                <tr key={String(c.id)}>
                  <td>{String(c.businessDate).slice(0, 10)}</td>
                  <td>{Number(c.expectedCash).toFixed(2)}</td>
                  <td>{Number(c.countedCash).toFixed(2)}</td>
                  <td>{Number(c.variance).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
