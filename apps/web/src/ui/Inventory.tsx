import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiRequest, getToken } from '../data/api';

const API_BASE =
  (import.meta.env.VITE_API_URL as string | undefined)?.trim() ||
  (import.meta.env.DEV ? 'http://127.0.0.1:3000/api' : '/api');
const API_ORIGIN = API_BASE.replace(/\/api\/?$/, '') || (typeof window !== 'undefined' ? window.location.origin : '');

function resolveMediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  return `${API_ORIGIN}${url.startsWith('/') ? url : `/${url}`}`;
}

async function uploadProductImage(file: File): Promise<string> {
  const token = getToken();
  const fd = new FormData();
  fd.append('file', file);
  const base = API_BASE;
  const res = await fetch(`${base}/inventory/upload-image`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { message?: string }).message || 'تعذر رفع الصورة.');
  return (data as { imageUrl: string }).imageUrl;
}

import { IconBoxes, IconRefresh, IconPackage, IconSearch, IconPlus, IconTrash } from './Icons';
import { noticeClass, noticeKind } from './notice';
import { loadSaleUnits, addSaleUnit } from '../data/units';

type InventoryItem = {
  id: string;
  name: string;
  barcode?: string | null;
  unit: string;
  piecesPerPack: number;
  currentCost: number;
  salePrice: number;
  minStock: number;
  imageUrl?: string | null;
  notes?: string | null;
  active: boolean;
  purchased: number;
  returned: number;
  sold: number;
  adjusted: number;
  stock: number;
  lowStock?: boolean;
};

const qty = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 3 });
const money = (n: number) =>
  `${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;

const emptyForm = {
  name: '',
  barcode: '',
  unit: 'قطعة',
  piecesPerPack: '1',
  currentCost: '0',
  salePrice: '0',
  minStock: '0',
  initialStock: '',
  imageUrl: '',
  notes: '',
  active: true,
};

export function Inventory({ embedded = false }: { embedded?: boolean } = {}) {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'in' | 'zero' | 'negative' | 'low' | 'inactive'>('all');
  const [pageTab, setPageTab] = useState<'products' | 'adjust' | 'movements'>('products');
  const [sortBy, setSortBy] = useState<'name' | 'stock' | 'value' | 'sale'>('name');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({ ...emptyForm });
  const [saleUnits, setSaleUnits] = useState<string[]>(() => loadSaleUnits());
  const [newUnit, setNewUnit] = useState('');
  const [editId, setEditId] = useState<string | null>(null);

  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('جرد فعلي');
  const [adjNotes, setAdjNotes] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await apiRequest<InventoryItem[]>('/inventory');
      setItems(result);
      setProductId((current) =>
        current && result.some((item) => item.id === current) ? current : result[0]?.id || '',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل المخزون.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = items.filter((item) => {
      if (q) {
        const hay = `${item.name} ${item.barcode || ''} ${item.notes || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      const stock = Number(item.stock) || 0;
      if (stockFilter === 'in' && stock <= 0) return false;
      if (stockFilter === 'zero' && stock !== 0) return false;
      if (stockFilter === 'negative' && stock >= 0) return false;
      if (stockFilter === 'low' && !item.lowStock) return false;
      if (stockFilter === 'inactive' && item.active !== false) return false;
      if (stockFilter !== 'inactive' && stockFilter !== 'all' && item.active === false) return false;
      return true;
    });
    list = [...list].sort((a, b) => {
      if (sortBy === 'stock') return (Number(b.stock) || 0) - (Number(a.stock) || 0);
      if (sortBy === 'value') {
        const va = Math.max(0, Number(a.stock) || 0) * (Number(a.currentCost) || 0);
        const vb = Math.max(0, Number(b.stock) || 0) * (Number(b.currentCost) || 0);
        return vb - va;
      }
      if (sortBy === 'sale') return (Number(b.salePrice) || 0) - (Number(a.salePrice) || 0);
      return a.name.localeCompare(b.name, 'ar');
    });
    return list;
  }, [items, query, stockFilter, sortBy]);

  const totals = useMemo(() => {
    const activeItems = items.filter((i) => i.active !== false);
    const units = activeItems.reduce((s, i) => s + i.stock, 0);
    const low = activeItems.filter((i) => i.lowStock).length;
    const zero = activeItems.filter((i) => (Number(i.stock) || 0) === 0).length;
    const value = activeItems.reduce((s, i) => s + Math.max(0, i.stock) * (Number(i.currentCost) || 0), 0);
    const saleValue = activeItems.reduce((s, i) => s + Math.max(0, i.stock) * (Number(i.salePrice) || 0), 0);
    return { units, low, zero, value, saleValue, count: activeItems.length };
  }, [items]);

  function setField<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function startCreate() {
    setEditId(null);
    setForm({ ...emptyForm });
    setNotice('');
  }

  function startEdit(item: InventoryItem) {
    setEditId(item.id);
    setForm({
      name: item.name,
      barcode: item.barcode || '',
      unit: !item.unit || item.unit === 'PIECE' ? 'قطعة' : item.unit === 'PACK' ? 'علبة' : item.unit,
      piecesPerPack: String(item.piecesPerPack || 1),
      currentCost: String(item.currentCost ?? 0),
      salePrice: String(item.salePrice ?? 0),
      minStock: String(item.minStock ?? 0),
      initialStock: '',
      imageUrl: item.imageUrl || '',
      notes: item.notes || '',
      active: item.active !== false,
    });
    setNotice(`تعديل «${item.name}»`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function saveProduct() {
    if (!form.name.trim()) {
      setNotice('اسم الصنف مطلوب.');
      return;
    }
    setBusy(true);
    setNotice('');
    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      barcode: form.barcode.trim() || null,
      unit: form.unit,
      piecesPerPack: Number(form.piecesPerPack) || 1,
      currentCost: Number(form.currentCost) || 0,
      salePrice: Number(form.salePrice) || 0,
      minStock: Number(form.minStock) || 0,
      imageUrl: form.imageUrl.trim() || null,
      notes: form.notes.trim() || null,
      active: form.active,
    };
    if (!editId && form.initialStock.trim() !== '') {
      const openQty = Number(form.initialStock);
      if (Number.isFinite(openQty) && openQty > 0) payload.initialStock = openQty;
    }
    try {
      if (editId) {
        await apiRequest(`/inventory/products/${editId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        }, { queueLabel: 'تعديل — منتج' });
        setNotice('تم حفظ تعديلات الصنف.');
      } else {
        await apiRequest('/inventory/products', {
          method: 'POST',
          body: JSON.stringify(payload),
        }, { queueLabel: 'منتج' });
        setNotice('تم إضافة الصنف.');
      }
      setEditId(null);
      setForm({ ...emptyForm });
      await refresh();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'تعذر حفظ الصنف.');
    } finally {
      setBusy(false);
    }
  }

  async function deleteProduct(item: InventoryItem) {
    if (
      !confirm(
        `حذف الصنف «${item.name}»؟\nيُسمح فقط إن لم يكن مربوطًا بفواتير. وإلا عطّله من التعديل.`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await apiRequest(`/inventory/products/${item.id}`, { method: 'DELETE' }, { queueLabel: 'حذف — منتج' });
      setNotice(`تم حذف «${item.name}».`);
      if (editId === item.id) startCreate();
      await refresh();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'تعذر حذف الصنف.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(item: InventoryItem) {
    setBusy(true);
    try {
      await apiRequest(`/inventory/products/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !item.active }),
      }, { queueLabel: 'تعديل — منتج' });
      setNotice(item.active ? `تم تعطيل «${item.name}».` : `تم تفعيل «${item.name}».`);
      await refresh();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'تعذر تحديث الحالة.');
    } finally {
      setBusy(false);
    }
  }

  async function saveAdjustment() {
    const amount = Number(quantity);
    if (!productId || !Number.isFinite(amount) || amount === 0 || !reason.trim()) {
      setNotice('اختر الصنف وأدخل كمية تعديل غير صفرية وسببًا.');
      return;
    }
    setBusy(true);
    try {
      await apiRequest('/inventory/adjustments', {
        method: 'POST',
        body: JSON.stringify({
          productId,
          quantity: amount,
          reason: reason.trim(),
          notes: adjNotes.trim() || undefined,
        }),
      }, { queueLabel: 'تسوية مخزون' });
      setNotice('تم تسجيل التسوية.');
      setQuantity('');
      setAdjNotes('');
      await refresh();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'تعذر تسجيل التسوية.');
    } finally {
      setBusy(false);
    }
  }

  function exportCatalog() {
    const lines = [['الاسم', 'باركود', 'وحدة', 'رصيد', 'تكلفة', 'بيع', 'حد أدنى', 'قيمة تكلفة', 'قيمة بيع', 'حالة']];
    for (const i of filtered) {
      const st = Number(i.stock) || 0;
      const cost = Number(i.currentCost) || 0;
      const sale = Number(i.salePrice) || 0;
      lines.push([
        i.name,
        i.barcode || '',
        i.unit,
        String(st),
        String(cost),
        String(sale),
        String(i.minStock ?? 0),
        String(st * cost),
        String(st * sale),
        i.active === false ? 'معطّل' : 'نشط',
      ]);
    }
    const esc = (c: string) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c);
    const bom = '\ufeff';
    const body = bom + lines.map((r) => r.map(esc).join(',')).join('\n');
    const blob = new Blob([body], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `inventory-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    setNotice('تم تصدير قائمة المخزون.');
  }

  function openAdjustFor(item: InventoryItem) {
    setProductId(item.id);
    setQuantity('');
    setReason('جرد فعلي');
    setAdjNotes('');
    setPageTab('adjust');
    setNotice(`تسوية رصيد: «${item.name}» (الحالي ${qty(item.stock)})`);
  }


  return (
    <div className={`purchases-page${embedded ? " purchases-page--embedded" : ""}`}>
      {!embedded && (
      <div className="purchase-title">
        <div>
          <span className="eyebrow">المخزون</span>
          <h1>إدارة المنتجات</h1>
          <p>إضافة · تعديل · باركود · وحدات · حد أدنى · تسوية الرصيد</p>
        </div>
        <button className="secondary-btn" type="button" onClick={() => void refresh()}>
          <IconRefresh size={16} />
          <span>تحديث</span>
        </button>
      </div>
      )}
      {embedded && (
        <div className="products-suite-head">
          <div className="products-suite-mark" aria-hidden>
            <IconBoxes size={22} />
          </div>
          <div>
            <h2>المنتجات والأصناف</h2>
            <p>أضف صنفًا بالاسم والباركود والسعر — يظهر فورًا في المبيعات والمشتريات والمخزون.</p>
          </div>
          <button className="secondary-btn small" type="button" onClick={() => void refresh()}>
            <IconRefresh size={14} />
            <span>تحديث</span>
          </button>
        </div>
      )}

      <div className={`pur-stats${embedded ? ' pur-stats--compact' : ''}`}>
        <div className="pur-stat">
          <span className="pur-stat-icon"><IconBoxes size={18} /></span>
          <div>
            <div className="label">أصناف نشطة</div>
            <div className="value">{totals.count}</div>
          </div>
        </div>
        <div className="pur-stat">
          <span className="pur-stat-icon"><IconPackage size={18} /></span>
          <div>
            <div className="label">إجمالي الوحدات</div>
            <div className="value">{qty(totals.units)}</div>
          </div>
        </div>
        <div className="pur-stat">
          <span className="pur-stat-icon"><IconSearch size={18} /></span>
          <div>
            <div className="label">تحت الحد الأدنى</div>
            <div className="value" style={{ color: totals.low ? '#b45309' : undefined }}>{totals.low}</div>
          </div>
        </div>
        <div className="pur-stat">
          <span className="pur-stat-icon"><IconBoxes size={18} /></span>
          <div>
            <div className="label">رصيد صفر</div>
            <div className="value">{totals.zero}</div>
          </div>
        </div>
        <div className="pur-stat">
          <span className="pur-stat-icon"><IconBoxes size={18} /></span>
          <div>
            <div className="label">قيمة بالتكلفة</div>
            <div className="value" style={{ fontSize: 16 }}>{money(totals.value)}</div>
          </div>
        </div>
        <div className="pur-stat">
          <span className="pur-stat-icon"><IconPackage size={18} /></span>
          <div>
            <div className="label">قيمة بسعر البيع</div>
            <div className="value" style={{ fontSize: 16 }}>{money(totals.saleValue)}</div>
          </div>
        </div>
      </div>

      {!embedded && (
      <div className="pur-tabs" role="tablist">
        <button type="button" className={pageTab === 'products' ? 'active' : ''} onClick={() => setPageTab('products')}>
          <IconBoxes size={16} /><span>المنتجات</span>
        </button>
        <button type="button" className={pageTab === 'adjust' ? 'active' : ''} onClick={() => setPageTab('adjust')}>
          <IconPackage size={16} /><span>تسوية رصيد</span>
        </button>
        <button type="button" className={pageTab === 'movements' ? 'active' : ''} onClick={() => setPageTab('movements')}>
          <IconRefresh size={16} /><span>حركة المخزون</span>
        </button>
      </div>
      )}

      {notice && <div className={noticeClass(notice)} role={noticeKind(notice) === "error" ? "alert" : "status"}>{notice}</div>}
      {error && <div className="app-notice app-notice--error" role="alert">{error}</div>}
      {loading && <div className="empty-state">جارٍ التحميل...</div>}

      {pageTab === 'products' && !loading && (
        <>
          <section className={`purchase-panel pur-invoice${embedded ? ' product-form-card' : ''}`}>
            <div className="panel-heading">
              <div>
                <h2>{editId ? 'تعديل صنف' : 'صنف جديد في المخزون'}</h2>
                <p>نفس تصميم فاتورة البيع: بيانات الصنف · الأسعار والرصيد · حفظ سريع</p>
              </div>
              {editId ? (
                <button className="secondary-btn small" type="button" onClick={startCreate}>إلغاء التعديل</button>
              ) : null}
            </div>

            <div className="pur-section">
              <div className="pur-section-title">بيانات الصنف</div>
              <div className="pur-meta-grid sale-meta-grid">
                <label className="pur-field pur-field--wide">
                  اسم الصنف *
                  <input value={form.name} onChange={(e) => setField('name', e.target.value)} placeholder="مثال: قلم جاف أزرق" autoComplete="off" />
                </label>
                <label className="pur-field">
                  الباركود
                  <input value={form.barcode} onChange={(e) => setField('barcode', e.target.value)} dir="ltr" placeholder="اختياري" autoComplete="off" />
                </label>
                <label className="pur-field">
                  الوحدة
                  <select value={form.unit} onChange={(e) => {
                    const u = e.target.value;
                    setField('unit', u);
                    if (u === 'قطعة') setField('piecesPerPack', '1');
                  }}>
                    {saleUnits.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                    {!saleUnits.includes(form.unit) && form.unit ? (
                      <option value={form.unit}>{form.unit}</option>
                    ) : null}
                  </select>
                </label>
                <label className="pur-field">
                  قطع في العبوة
                  <input
                    type="number"
                    min={1}
                    value={form.piecesPerPack}
                    disabled={form.unit === 'قطعة'}
                    onChange={(e) => setField('piecesPerPack', e.target.value)}
                    dir="ltr"
                    title="لو الوحدة علبة/دستة: كم قطعة داخلها"
                  />
                </label>
                <label className="pur-field pur-field--wide">
                  إضافة وحدة جديدة
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      value={newUnit}
                      onChange={(e) => setNewUnit(e.target.value)}
                      placeholder="مثال: كيس · لفة · متر"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const n = newUnit.trim();
                          if (!n) return;
                          const list = addSaleUnit(n);
                          setSaleUnits(list);
                          setField('unit', n);
                          setNewUnit('');
                          setNotice(`تمت إضافة الوحدة «${n}» (تظهر أيضًا في المبيعات)`);
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="secondary-btn small"
                      onClick={() => {
                        const n = newUnit.trim();
                        if (!n) return;
                        const list = addSaleUnit(n);
                        setSaleUnits(list);
                        setField('unit', n);
                        setNewUnit('');
                        setNotice(`تمت إضافة الوحدة «${n}»`);
                      }}
                    >
                      إضافة
                    </button>
                  </div>
                </label>
              </div>
            </div>

            <div className="pur-section">
              <div className="pur-section-title">الأسعار والرصيد</div>
              <div className="sale-lines-wrap pur-lines">
                <table className="sale-lines-table">
                  <thead>
                    <tr>
                      <th>تكلفة القطعة</th>
                      <th>سعر البيع</th>
                      <th>المكسب / قطعة</th>
                      <th>الحد الأدنى</th>
                      {!editId ? <th>رصيد افتتاحي</th> : null}
                      <th>قيمة الرصيد</th>
                      <th>ملاحظات</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>
                        <input type="number" min={0} step="0.01" value={form.currentCost} onChange={(e) => setField('currentCost', e.target.value)} dir="ltr" />
                      </td>
                      <td>
                        <input type="number" min={0} step="0.01" value={form.salePrice} onChange={(e) => setField('salePrice', e.target.value)} dir="ltr" />
                      </td>
                      <td>
                        <span className={(Number(form.salePrice) || 0) - (Number(form.currentCost) || 0) >= 0 ? 'num-ok' : 'num-bad'}>
                          {money((Number(form.salePrice) || 0) - (Number(form.currentCost) || 0))}
                        </span>
                      </td>
                      <td>
                        <input type="number" min={0} step="any" value={form.minStock} onChange={(e) => setField('minStock', e.target.value)} dir="ltr" />
                      </td>
                      {!editId ? (
                        <td>
                          <input
                            type="number"
                            min={0}
                            step="any"
                            value={form.initialStock}
                            onChange={(e) => setField('initialStock', e.target.value)}
                            dir="ltr"
                            placeholder="0"
                          />
                        </td>
                      ) : null}
                      <td>
                        <span className="num-ok">
                          {money((Number(form.initialStock) || 0) * (Number(form.currentCost) || 0))}
                        </span>
                      </td>
                      <td>
                        <input value={form.notes} onChange={(e) => setField('notes', e.target.value)} placeholder="اختياري" />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="pur-lines-actions" style={{ marginTop: 10 }}>
                <label className="pur-field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, margin: 0 }}>
                  <input type="checkbox" checked={form.active} onChange={(e) => setField('active', e.target.checked)} />
                  <span>الصنف نشط (بيع وشراء)</span>
                </label>
                <label className="pur-field" style={{ margin: 0, minWidth: 200 }}>
                  صورة / رابط
                  <input value={form.imageUrl} onChange={(e) => setField('imageUrl', e.target.value)} dir="ltr" placeholder="https:// أو ارفع لاحقًا" />
                </label>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (!file) return;
                    if (file.size > 2 * 1024 * 1024) {
                      setNotice('الحد الأقصى للصورة 2 ميجابايت.');
                      return;
                    }
                    setBusy(true);
                    void uploadProductImage(file)
                      .then((url) => {
                        setField('imageUrl', url);
                        setNotice('تم رفع الصورة.');
                      })
                      .catch((err) => setNotice(err instanceof Error ? err.message : 'تعذر الرفع'))
                      .finally(() => setBusy(false));
                  }}
                />
              </div>
            </div>

            <div className="pur-footer sale-footer">
              <div className="pur-footer-fields">
                <span className="muted">{editId ? 'تعديل صنف محفوظ' : 'إضافة مباشرة للمخزون — بدون فاتورة مشتريات'}</span>
              </div>
              <div className="pur-footer-summary">
                <div className="pur-total-box">
                  <div className="label">تكلفة القطعة</div>
                  <div className="value">{money(Number(form.currentCost) || 0)}</div>
                </div>
                <div className="pur-total-box">
                  <div className="label">سعر البيع</div>
                  <div className="value">{money(Number(form.salePrice) || 0)}</div>
                </div>
                <div className="pur-total-box">
                  <div className="label">رصيد افتتاحي</div>
                  <div className="value">{qty(Number(form.initialStock) || 0)}</div>
                </div>
                <div className="pur-footer-actions">
                  <button className="primary-btn" type="button" disabled={busy} onClick={() => void saveProduct()}>
                    {editId ? 'حفظ التعديل' : 'حفظ الصنف'}
                  </button>
                  <button className="secondary-btn" type="button" disabled={busy} onClick={startCreate}>
                    {editId ? 'صنف جديد' : 'تفريغ'}
                  </button>
                </div>
              </div>
            </div>
          </section>

<section className="purchase-panel">
            <div className="panel-heading">
              <div>
                <h2>سجل الأصناف</h2>
                <p>بحث · فلترة · ترتيب · تصدير — نفس أسلوب سجل فواتير الوارد</p>
              </div>
              <span className="count-badge">{filtered.length}</span>
            </div>
            <div className="filter-bar">
              <label className="grow">
                بحث
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="اسم / باركود / ملاحظات" autoComplete="off" />
              </label>
              <label>
                الرصيد
                <select value={stockFilter} onChange={(e) => setStockFilter(e.target.value as typeof stockFilter)}>
                  <option value="all">الكل</option>
                  <option value="in">متوفر</option>
                  <option value="zero">صفر</option>
                  <option value="negative">سالب</option>
                  <option value="low">تحت الحد الأدنى</option>
                  <option value="inactive">معطّل</option>
                </select>
              </label>
              <label>
                ترتيب
                <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}>
                  <option value="name">الاسم</option>
                  <option value="stock">الأعلى رصيدًا</option>
                  <option value="value">الأعلى قيمة تكلفة</option>
                  <option value="sale">الأعلى سعر بيع</option>
                </select>
              </label>
              <button type="button" className="secondary-btn small" onClick={() => exportCatalog()}>
                تصدير CSV
              </button>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th></th>
                    <th>الصنف</th>
                    <th>باركود</th>
                    <th>الوحدة</th>
                    <th>الرصيد</th>
                    <th>حد أدنى</th>
                    <th>تكلفة</th>
                    <th>بيع</th>
                    <th>مكسب</th>
                    <th>حالة</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item) => {
                    const profit = (Number(item.salePrice) || 0) - (Number(item.currentCost) || 0);
                    return (
                      <tr key={item.id} style={{ opacity: item.active === false ? 0.55 : 1 }}>
                        <td>
                          {item.imageUrl ? (
                            <img src={resolveMediaUrl(item.imageUrl) || ""} alt="" className="product-thumb" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                          ) : (
                            <span className="product-thumb product-thumb--empty"><IconPackage size={16} /></span>
                          )}
                        </td>
                        <td>
                          <strong>{item.name}</strong>
                          {item.notes ? <div style={{ fontSize: 11, color: '#8a9da1' }}>{item.notes}</div> : null}
                        </td>
                        <td dir="ltr">{item.barcode || '—'}</td>
                        <td>{item.unit === 'PACK' || item.unit === 'علبة' ? `علبة (${item.piecesPerPack})` : (item.unit === 'PIECE' ? 'قطعة' : item.unit)}{item.piecesPerPack > 1 && item.unit !== 'PACK' && item.unit !== 'علبة' ? ` (${item.piecesPerPack})` : ''}</td>
                        <td className={item.stock < 0 ? 'num-bad' : item.lowStock ? 'num-warn' : 'num-ok'}>
                          {qty(item.stock)}
                          {item.lowStock ? ' ⚠' : ''}
                        </td>
                        <td>{qty(item.minStock || 0)}</td>
                        <td>{money(item.currentCost)}</td>
                        <td>{money(item.salePrice)}</td>
                        <td className={profit >= 0 ? 'num-ok' : 'num-bad'}>{money(profit)}</td>
                        <td>
                          {item.active === false ? (
                            <span className="tag local">معطّل</span>
                          ) : item.lowStock ? (
                            <span className="tag local">منخفض</span>
                          ) : (
                            <span className="tag synced">نشط</span>
                          )}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            <button className="secondary-btn small" type="button" onClick={() => startEdit(item)}>
                              تعديل
                            </button>
                            <button className="secondary-btn small" type="button" onClick={() => openAdjustFor(item)}>
                              تسوية
                            </button>
                            <button className="secondary-btn small" type="button" onClick={() => void toggleActive(item)}>
                              {item.active === false ? 'تفعيل' : 'تعطيل'}
                            </button>
                            <button className="danger-outline-btn small" type="button" onClick={() => void deleteProduct(item)}>
                              <IconTrash size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filtered.length === 0 && (
                <div className="empty-state">لا أصناف مطابقة. أضف منتجًا من النموذج أعلاه أو سجّل فاتورة وارد.</div>
              )}
            </div>
          </section>
        </>
      )}

      {pageTab === 'adjust' && !loading && (
        <section className="purchase-panel">
          <div className="panel-heading">
            <div>
              <h2>تسوية رصيد</h2>
              <p>زيادة أو تخفيض الكمية (جرد · تلف · تصحيح). لا يُسمح برصيد سالب.</p>
            </div>
          </div>
          <div className="settings-form-grid">
            <label className="pur-field" style={{ gridColumn: '1 / -1' }}>
              الصنف
              <select value={productId} onChange={(e) => setProductId(e.target.value)}>
                <option value="">اختر...</option>
                {items.filter((i) => i.active !== false).map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} — رصيد {qty(i.stock)}
                  </option>
                ))}
              </select>
            </label>
            <label className="pur-field">
              الكمية (+ زيادة / − تخفيض)
              <input type="number" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </label>
            <label className="pur-field">
              السبب
              <input value={reason} onChange={(e) => setReason(e.target.value)} />
            </label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', gridColumn: '1 / -1' }}>
              {['رصيد افتتاحي', 'جرد فعلي', 'تلف', 'تصحيح خطأ', 'هدية/عينة'].map((r) => (
                <button key={r} type="button" className="secondary-btn small" onClick={() => setReason(r)}>
                  {r}
                </button>
              ))}
            </div>
            <label className="pur-field" style={{ gridColumn: '1 / -1' }}>
              ملاحظات
              <input value={adjNotes} onChange={(e) => setAdjNotes(e.target.value)} />
            </label>
          </div>
          <div className="pur-footer-actions" style={{ justifyContent: 'flex-start', marginTop: 14 }}>
            <button className="primary-btn" type="button" disabled={busy} onClick={() => void saveAdjustment()}>
              حفظ التسوية
            </button>
          </div>
        </section>
      )}

      {pageTab === 'movements' && !loading && (
        <section className="purchase-panel">
          <div className="panel-heading">
            <div>
              <h2>ملخص حركة المخزون</h2>
              <p>من واقع الفواتير والتسويات — مشتراة / مرتجع / مباع / تسوية / رصيد.</p>
            </div>
            <button type="button" className="secondary-btn small" onClick={() => exportCatalog()}>تصدير CSV</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>الصنف</th>
                  <th>مشتريات</th>
                  <th>مرتجع</th>
                  <th>مبيعات</th>
                  <th>تسوية</th>
                  <th>الرصيد</th>
                  <th>قيمة تكلفة</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr key={item.id} className={item.lowStock ? 'row-warn' : undefined}>
                    <td>
                      <strong>{item.name}</strong>
                      {item.barcode ? <div className="muted" dir="ltr">{item.barcode}</div> : null}
                    </td>
                    <td dir="ltr">{qty(item.purchased)}</td>
                    <td dir="ltr">{qty(item.returned)}</td>
                    <td dir="ltr">{qty(item.sold)}</td>
                    <td dir="ltr">{qty(item.adjusted)}</td>
                    <td dir="ltr"><strong>{qty(item.stock)}</strong></td>
                    <td dir="ltr">{money(Math.max(0, item.stock) * (Number(item.currentCost) || 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && <div className="empty-state">لا بيانات.</div>}
          </div>
        </section>
      )}

    </div>
  );
}
