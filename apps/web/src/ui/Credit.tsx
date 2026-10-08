import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../data/api';

type CustomerRow = {
  id: string;
  name: string;
  phone: string | null;
  invoicesCount: number;
  salesTotal: number;
  paidTotal: number;
  balance: number;
};

type CustomerDetail = {
  id: string;
  name: string;
  phone: string | null;
  salesTotal: number;
  paidTotal: number;
  balance: number;
  sales: Array<{
    id: string;
    invoiceNumber: string;
    saleDate: string;
    total: number;
    paidAmount: number;
    remaining: number;
    paymentStatus: string;
  }>;
};

export function Credit() {
  const [list, setList] = useState<CustomerRow[]>([]);
  const [selected, setSelected] = useState<CustomerDetail | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payNotes, setPayNotes] = useState('');
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

  async function openCustomer(id: string) {
    setBusy(true);
    setMsg('');
    try {
      const d = await apiRequest<CustomerDetail>(`/customers/${id}`);
      setSelected(d);
      setPayAmount(d.balance > 0 ? String(d.balance) : '');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'تعذر فتح الحساب');
    } finally {
      setBusy(false);
    }
  }

  async function collect() {
    if (!selected) return;
    const amount = Number(payAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setMsg('أدخل مبلغ تحصيل صحيح');
      return;
    }
    setBusy(true);
    setMsg('');
    try {
      await apiRequest(`/customers/${selected.id}/payments`, {
        method: 'POST',
        body: JSON.stringify({ amount, notes: payNotes.trim() || undefined }),
      });
      setMsg('تم تسجيل التحصيل');
      setPayNotes('');
      await load();
      await openCustomer(selected.id);
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

  return (
    <div className="settings-stack">
      <section className="panel">
        <h3 style={{ marginTop: 0 }}>العملاء الآجل</h3>
        <p className="muted">
          يُنشأ حساب العميل تلقائيًا من أول فاتورة آجل. الفواتير التالية لنفس الاسم تُسجَّل في نفس الحساب.
        </p>
        <label>
          بحث
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="اسم أو هاتف" />
        </label>
        <p style={{ marginTop: 12 }}>
          <strong>إجمالي المستحقات:</strong> {totalDebt.toFixed(2)}
        </p>
        {msg ? <p className="purchase-notice">{msg}</p> : null}
        <table className="data-table">
          <thead>
            <tr>
              <th>العميل</th>
              <th>هاتف</th>
              <th>فواتير</th>
              <th>إجمالي</th>
              <th>مدفوع</th>
              <th>متبقي</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="muted">
                  لا يوجد عملاء آجل بعد
                </td>
              </tr>
            ) : (
              filtered.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>{c.phone || '—'}</td>
                  <td>{c.invoicesCount}</td>
                  <td>{Number(c.salesTotal).toFixed(2)}</td>
                  <td>{Number(c.paidTotal).toFixed(2)}</td>
                  <td>
                    <strong>{Number(c.balance).toFixed(2)}</strong>
                  </td>
                  <td>
                    <button type="button" className="secondary-btn" disabled={busy} onClick={() => void openCustomer(c.id)}>
                      التفاصيل
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      {selected && (
        <section className="panel">
          <h3>
            حساب: {selected.name}{' '}
            <button type="button" className="secondary-btn" onClick={() => setSelected(null)}>
              إغلاق
            </button>
          </h3>
          <p>
            إجمالي: <strong>{selected.salesTotal.toFixed(2)}</strong> · مدفوع:{' '}
            <strong>{selected.paidTotal.toFixed(2)}</strong> · متبقي:{' '}
            <strong>{selected.balance.toFixed(2)}</strong>
          </p>
          <table className="data-table">
            <thead>
              <tr>
                <th>رقم</th>
                <th>التاريخ</th>
                <th>الإجمالي</th>
                <th>مدفوع</th>
                <th>متبقي</th>
                <th>الحالة</th>
              </tr>
            </thead>
            <tbody>
              {selected.sales.map((s) => (
                <tr key={s.id}>
                  <td>{s.invoiceNumber}</td>
                  <td>{new Date(s.saleDate).toLocaleDateString('en-GB')}</td>
                  <td>{Number(s.total).toFixed(2)}</td>
                  <td>{Number(s.paidAmount).toFixed(2)}</td>
                  <td>{Number(s.remaining).toFixed(2)}</td>
                  <td>
                    {s.paymentStatus === 'PAID' ? 'مسدد' : s.paymentStatus === 'PARTIAL' ? 'جزئي' : 'آجل'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {selected.balance > 0.001 && (
            <div className="form-grid" style={{ marginTop: 16, maxWidth: 480 }}>
              <label>
                تحصيل مبلغ
                <input type="number" min={0} step={0.01} value={payAmount} onChange={(e) => setPayAmount(e.target.value)} dir="ltr" />
              </label>
              <label>
                ملاحظة
                <input value={payNotes} onChange={(e) => setPayNotes(e.target.value)} />
              </label>
              <button type="button" className="primary-btn" disabled={busy} onClick={() => void collect()}>
                تسجيل التحصيل
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
