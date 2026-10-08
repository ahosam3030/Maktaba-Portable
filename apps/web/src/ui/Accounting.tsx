import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiRequest, getToken } from '../data/api';
import { noticeClass, noticeKind } from './notice';

type CashRow = {
  id: string; kind: string; date: string; category: string; amount: number | string;
  method: string; reference?: string | null; notes?: string | null;
};

const money = (n: number) => `${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;
const today = () => new Date().toISOString().slice(0, 10);
const categories = {
  INCOME: ['إيراد عام', 'تحصيل مديونية عميل', 'إيراد خدمات طباعة', 'إيراد مبيعات', 'رأس مال / رصيد افتتاحي', 'أخرى'],
  EXPENSE: ['ورق ومستلزمات', 'حبر وتونر', 'صيانة', 'كهرباء ومرافق', 'إيجار', 'أجور', 'نقل وشحن', 'مصروفات إدارية', 'أخرى'],
} as const;

export function Accounting() {
  const [rows, setRows] = useState<CashRow[]>([]);
  const [kind, setKind] = useState<'INCOME' | 'EXPENSE'>('INCOME');
  const [date, setDate] = useState(today());
  const [category, setCategory] = useState<string>(categories.INCOME[0]);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('CASH');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState<'all' | 'INCOME' | 'EXPENSE'>('all');
  const [methodFilter, setMethodFilter] = useState('all');
  const [fromDate, setFromDate] = useState(today().slice(0, 7) + '-01');
  const [toDate, setToDate] = useState(today());
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [pageTab, setPageTab] = useState<'entry' | 'ledger'>('entry');

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setError('سجّل الدخول أولًا لاستخدام الخزينة المشتركة.');
      setLoading(false);
      return;
    }
    setLoading(true); setError('');
    try {
      const qs = new URLSearchParams();
      if (fromDate) qs.set('from', fromDate);
      if (toDate) qs.set('to', toDate);
      if (search.trim()) qs.set('search', search.trim());
      const data = await apiRequest<CashRow[]>(`/accounting/cash-transactions?${qs.toString()}`);
      setRows(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل حركات الخزينة.');
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, search]);

  useEffect(() => { void refresh(); }, [refresh]);

  const displayRows = useMemo(() => {
    return rows.filter((r) => {
      if (kindFilter !== 'all' && r.kind !== kindFilter) return false;
      if (methodFilter !== 'all' && r.method !== methodFilter) return false;
      return true;
    });
  }, [rows, kindFilter, methodFilter]);

  const totals = useMemo(() => {
    const income = displayRows.filter((r) => r.kind === 'INCOME').reduce((s, r) => s + Number(r.amount), 0);
    const expense = displayRows.filter((r) => r.kind === 'EXPENSE').reduce((s, r) => s + Number(r.amount), 0);
    return { income, expense, net: income - expense };
  }, [displayRows]);

  async function save() {
    const value = Number(amount);
    if (!date || !category || !Number.isFinite(value) || value <= 0) {
      setNotice('أدخل تاريخًا صحيحًا، وبندًا، ومبلغًا أكبر من صفر.');
      return;
    }
    try {
      await apiRequest('/accounting/cash-transactions', {
        method: 'POST',
        body: JSON.stringify({
          kind, date, category, amount: value, method,
          reference: reference.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      }, { queueLabel: 'حفظ حركة خزينة' });
      setNotice('تم حفظ الحركة على الخادم.');
      setAmount(''); setReference(''); setNotes('');
      await refresh();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'تعذر حفظ الحركة.');
    }
  }

  async function remove(id: string) {
    try {
      await apiRequest(`/accounting/cash-transactions/${id}`, { method: 'DELETE' }, { queueLabel: 'حذف حركة خزينة' });
      setNotice('تم حذف الحركة.');
      await refresh();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'تعذر حذف الحركة.');
    }
  }

  function exportCsv() {
    const header = 'النوع,التاريخ,البند,المبلغ,الطريقة,المرجع,ملاحظات\n';
    const body = rows.map((r) =>
      [r.kind, String(r.date).slice(0, 10), r.category, Number(r.amount), r.method, r.reference || '', (r.notes || '').replace(/,/g, ' ')].join(',')
    ).join('\n');
    const blob = new Blob(['\ufeff' + header + body], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `cash-${today()}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="purchases-page">
      <div className="purchase-title">
        <div>
          <span className="eyebrow">المحاسبة</span>
          <h1>الخزينة</h1>
          <p>إيرادات ومصروفات مشتركة على الخادم، مع فلترة وتصدير للفترة.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="secondary-btn" type="button" onClick={() => void refresh()}>تحديث</button>
          <button className="secondary-btn" type="button" onClick={exportCsv}>تصدير CSV</button>
        </div>
      </div>

      <div className="stat-cards">
        <div className="stat-card"><div className="label">إيرادات الفترة</div><div className="value positive">{money(totals.income)}</div></div>
        <div className="stat-card"><div className="label">مصروفات الفترة</div><div className="value negative">{money(totals.expense)}</div></div>
        <div className="stat-card"><div className="label">صافي الحركة</div><div className={`value ${totals.net >= 0 ? 'positive' : 'negative'}`}>{money(totals.net)}</div></div>
        <div className="stat-card"><div className="label">عدد الحركات</div><div className="value">{rows.length}</div></div>
      </div>

      <div className="page-tabs" role="tablist">
        <button type="button" className={pageTab === 'entry' ? 'active' : ''} onClick={() => setPageTab('entry')}>حركة جديدة</button>
        <button type="button" className={pageTab === 'ledger' ? 'active' : ''} onClick={() => setPageTab('ledger')}>السجل</button>
      </div>

      {notice && <div className={noticeClass(notice)} role={noticeKind(notice) === "error" ? "alert" : "status"}>{notice}</div>}
      {error && <div className="app-notice app-notice--error" role="alert">{error}</div>}

      {pageTab === 'entry' && (
      <section className="purchase-panel">
        <div className="panel-heading"><div><h2>حركة جديدة</h2><p>تسجيل إيراد أو مصروف يدويًا.</p></div></div>
        <div className="purchase-form-grid">
          <label>النوع<select value={kind} onChange={(e) => { const k = e.target.value as 'INCOME' | 'EXPENSE'; setKind(k); setCategory(categories[k][0]); }}>
            <option value="INCOME">إيراد</option><option value="EXPENSE">مصروف</option>
          </select></label>
          <label>التاريخ<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <label>البند<select value={category} onChange={(e) => setCategory(e.target.value)}>
            {categories[kind].map((c) => <option key={c} value={c}>{c}</option>)}
          </select></label>
          <label>المبلغ<input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
          <label>الطريقة<select value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="CASH">نقدي</option><option value="WALLET">محفظة</option><option value="BANK">بنك</option><option value="CARD">بطاقة</option>
          </select></label>
          <label>المرجع<input value={reference} onChange={(e) => setReference(e.target.value)} /></label>
          <label>ملاحظات<input value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
          <button className="primary-btn" type="button" onClick={() => void save()}>حفظ الحركة</button>
        </div>
      </section>

      )}

      {pageTab === 'ledger' && (
      <section className="purchase-panel">
        <div className="panel-heading"><div><h2>السجل</h2><p>فلترة حسب التاريخ أو البحث في البند والمرجع.</p></div><span className="count-badge">{displayRows.length}</span></div>
        <div className="filter-bar">
          <label className="grow">بحث
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بند / مرجع / ملاحظات" />
          </label>
          <label>من
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </label>
          <label>إلى
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </label>
          <label>النوع
            <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value as typeof kindFilter)}>
              <option value="all">الكل</option>
              <option value="INCOME">إيراد</option>
              <option value="EXPENSE">مصروف</option>
            </select>
          </label>
          <label>الطريقة
            <select value={methodFilter} onChange={(e) => setMethodFilter(e.target.value)}>
              <option value="all">الكل</option>
              <option value="CASH">نقدي</option>
              <option value="WALLET">محفظة</option>
              <option value="BANK">بنك</option>
              <option value="CARD">بطاقة</option>
            </select>
          </label>
          <div className="filter-actions">
            <button type="button" className="secondary-btn small" onClick={() => { setSearch(''); setKindFilter('all'); setMethodFilter('all'); }}>مسح</button>
          </div>
        </div>
        {loading ? <div className="empty-state">جارٍ التحميل...</div> : (
          <div className="table-wrap"><table><thead><tr><th>النوع</th><th>التاريخ</th><th>البند</th><th>المبلغ</th><th>الطريقة</th><th>المرجع</th><th></th></tr></thead>
            <tbody>{displayRows.map((r) => (
              <tr key={r.id}>
                <td>{r.kind === 'INCOME' ? 'إيراد' : 'مصروف'}</td>
                <td>{String(r.date).slice(0, 10)}</td>
                <td>{r.category}</td>
                <td>{money(Number(r.amount))}</td>
                <td>{r.method}</td>
                <td>{r.reference || '—'}</td>
                <td><button className="icon-btn" type="button" onClick={() => void remove(r.id)}>×</button></td>
              </tr>
            ))}</tbody></table>
            {displayRows.length === 0 && <div className="empty-state">لا توجد حركات في الفترة المحددة.</div>}
          </div>
        )}
      </section>
      )}
    </div>
  );
}
