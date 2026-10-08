import { useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../data/api';
import { loadInvoiceSettings } from '../data/invoiceSettings';
import { noticeClass, noticeKind } from './notice';

type Product = {
  id: string;
  name: string;
  barcode?: string | null;
  salePrice?: number | string;
  unit?: string | null;
  active?: boolean;
};

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function Labels() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [notice, setNotice] = useState('');
  const inv = loadInvoiceSettings();
  const [cols, setCols] = useState(3);
  const [showPrice, setShowPrice] = useState(true);
  const [showName, setShowName] = useState(true);
  const [showBarcodeText, setShowBarcodeText] = useState(true);
  const [showStoreName, setShowStoreName] = useState(true);
  const [showPhone, setShowPhone] = useState(false);
  const [storeName, setStoreName] = useState(inv.brandTitle || inv.watermarkText || '');
  const [phone, setPhone] = useState(inv.phone || '');
  const [extraLine, setExtraLine] = useState('');
  const [onlyWithBarcode, setOnlyWithBarcode] = useState(false);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setNotice('');
      try {
        const rows = await apiRequest<Product[]>('/inventory');
        const list = Array.isArray(rows) ? rows : [];
        setProducts(list);
        if (list.length === 0) {
          setNotice('لا توجد أصناف في المخزون. أضف منتجات من الإعدادات أو من فاتورة وارد أولًا.');
        }
      } catch (e) {
        setNotice(e instanceof Error ? e.message : 'تعذر تحميل الأصناف');
        setProducts([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return products.filter((p) => {
      if (onlyWithBarcode && !String(p.barcode || '').trim()) return false;
      if (!term) return true;
      const s = `${p.name} ${p.barcode || ''}`.toLowerCase();
      return s.includes(term);
    });
  }, [products, q, onlyWithBarcode]);

  const withBarcodeCount = products.filter((p) => String(p.barcode || '').trim()).length;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[id]) delete next[id];
      else next[id] = 1;
      return next;
    });
  }

  function setQty(id: string, n: number) {
    setSelected((prev) => ({ ...prev, [id]: Math.max(1, Math.min(50, n || 1)) }));
  }

  function selectAllWithBarcode() {
    const next: Record<string, number> = {};
    for (const p of filtered) {
      if (String(p.barcode || '').trim()) next[p.id] = selected[p.id] || 1;
    }
    setSelected(next);
    setNotice(`تم تحديد ${Object.keys(next).length} صنفًا له باركود.`);
  }

  function clearSelection() {
    setSelected({});
  }

  function printLabels() {
    const items: Array<Product & { copies: number }> = [];
    for (const p of products) {
      const copies = selected[p.id];
      if (!copies) continue;
      const code = String(p.barcode || '').trim();
      if (!code) {
        setNotice(`«${p.name}» بدون باركود — ألغِ تحديده أو أضف باركودًا من المنتجات.`);
        return;
      }
      items.push({ ...p, copies, barcode: code });
    }
    if (items.length === 0) {
      setNotice('حدّد أصنافًا لها باركود من الجدول أولًا.');
      return;
    }

    const store = storeName.trim();
    const phoneLine = phone.trim();
    const extra = extraLine.trim();

    const labelsHtml = items
      .flatMap((p) =>
        Array.from({ length: p.copies }, () => {
          const price = Number(p.salePrice) || 0;
          return `<div class="label">
  ${showStoreName && store ? `<div class="store">${escapeHtml(store)}</div>` : ''}
  ${showName ? `<div class="name">${escapeHtml(p.name)}</div>` : ''}
  ${showPrice ? `<div class="price">${price.toFixed(2)} ج.م</div>` : ''}
  <svg class="bc" data-barcode="${escapeHtml(String(p.barcode))}"></svg>
  ${showBarcodeText ? `<div class="code" dir="ltr">${escapeHtml(String(p.barcode))}</div>` : ''}
  ${showPhone && phoneLine ? `<div class="phone" dir="ltr">${escapeHtml(phoneLine)}</div>` : ''}
  ${extra ? `<div class="extra">${escapeHtml(extra)}</div>` : ''}
</div>`;
        }),
      )
      .join('\n');

    const w = window.open('', '_blank', 'width=900,height=700');
    if (!w) {
      setNotice('اسمح بالنوافذ المنبثقة للطباعة.');
      return;
    }
    w.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<title>ملصقات باركود</title>
<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
<style>
  @page { margin: 6mm; }
  body { font-family: Tahoma, Arial, sans-serif; margin: 0; background: #fff; }
  .sheet { display: grid; grid-template-columns: repeat(${cols}, 1fr); gap: 4mm; padding: 4mm; }
  .label {
    border: 1px dashed #94a3b8;
    border-radius: 4px;
    padding: 2.5mm 2mm;
    text-align: center;
    page-break-inside: avoid;
    min-height: 30mm;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1px;
  }
  .store { font-size: 9px; font-weight: 800; color: #0f766e; line-height: 1.25; margin-bottom: 1px; }
  .name { font-size: 11px; font-weight: 700; margin-bottom: 1px; line-height: 1.25; }
  .price { font-size: 12px; font-weight: 800; color: #0c4a6e; margin: 1px 0; }
  .code { font-size: 9px; letter-spacing: 0.04em; margin-top: 1px; color: #334155; }
  .phone { font-size: 8px; color: #64748b; margin-top: 1px; }
  .extra { font-size: 8px; color: #475569; margin-top: 1px; line-height: 1.2; }
  svg.bc { max-width: 100%; height: 34px; }
</style></head><body>
<div class="sheet">${labelsHtml}</div>
<script>
  document.querySelectorAll('svg.bc').forEach(function(el) {
    var code = el.getAttribute('data-barcode') || '';
    if (!code) return;
    try {
      JsBarcode(el, code, { format: 'CODE128', width: 1.4, height: 36, displayValue: false, margin: 0 });
    } catch (e) {}
  });
  window.onload = function() { setTimeout(function(){ window.print(); }, 300); };
<\/script>
</body></html>`);
    w.document.close();
    setNotice(`جاهز للطباعة: ${items.reduce((s, i) => s + i.copies, 0)} ملصق.`);
  }

  return (
    <div className="panel labels-panel">
      <div className="panel-heading">
        <div>
          <h2>ملصقات الباركود</h2>
          <p className="muted-sm">
            اختر الأصناف واطبع ملصقات للرف أو العبوة (CODE128).
            {products.length > 0 && (
              <>
                {' '}
                — {products.length} صنف، منها {withBarcodeCount} بباركود
              </>
            )}
          </p>
        </div>
        <button type="button" className="primary-btn" onClick={printLabels} disabled={loading}>
          طباعة الملصقات
        </button>
      </div>

      {notice && (
        <div className={noticeClass(notice)} role={noticeKind(notice) === 'error' ? 'alert' : 'status'}>
          {notice}
        </div>
      )}

      <div className="labels-toolbar">
        <label className="labels-search">
          <span>بحث</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="اسم أو باركود"
            dir="auto"
          />
        </label>
        <label>
          <span>أعمدة الصفحة</span>
          <select value={cols} onChange={(e) => setCols(Number(e.target.value))}>
            <option value={2}>2</option>
            <option value={3}>3</option>
            <option value={4}>4</option>
          </select>
        </label>
        <label className="labels-check">
          <input type="checkbox" checked={showStoreName} onChange={(e) => setShowStoreName(e.target.checked)} />
          <span>اسم المكتبة</span>
        </label>
        <label className="labels-check">
          <input type="checkbox" checked={showName} onChange={(e) => setShowName(e.target.checked)} />
          <span>اسم الصنف</span>
        </label>
        <label className="labels-check">
          <input type="checkbox" checked={showPrice} onChange={(e) => setShowPrice(e.target.checked)} />
          <span>السعر</span>
        </label>
        <label className="labels-check">
          <input type="checkbox" checked={showBarcodeText} onChange={(e) => setShowBarcodeText(e.target.checked)} />
          <span>رقم الباركود</span>
        </label>
        <label className="labels-check">
          <input type="checkbox" checked={showPhone} onChange={(e) => setShowPhone(e.target.checked)} />
          <span>الهاتف</span>
        </label>
        <label className="labels-check">
          <input
            type="checkbox"
            checked={onlyWithBarcode}
            onChange={(e) => setOnlyWithBarcode(e.target.checked)}
          />
          <span>باركود فقط</span>
        </label>
        <div className="labels-actions">
          <button type="button" className="secondary-btn" onClick={selectAllWithBarcode}>
            تحديد الكل (بباركود)
          </button>
          <button type="button" className="secondary-btn" onClick={clearSelection}>
            إلغاء التحديد
          </button>
          {q && (
            <button type="button" className="secondary-btn" onClick={() => setQ('')}>
              مسح البحث
            </button>
          )}
        </div>
      </div>

      <div className="purchase-panel" style={{ padding: '14px 16px', marginBottom: 12 }}>
        <h3 style={{ margin: '0 0 10px', fontSize: 14 }}>نصوص الملصق</h3>
        <div className="purchase-form-grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
          <label>
            <span>اسم المكتبة / المركز</span>
            <input
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              placeholder="مثال: اسم منشأتك"
              dir="auto"
            />
          </label>
          <label>
            <span>رقم الهاتف</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="01xxxxxxxxx"
              dir="ltr"
            />
          </label>
          <label>
            <span>سطر إضافي</span>
            <input
              value={extraLine}
              onChange={(e) => setExtraLine(e.target.value)}
              placeholder="مثال: جودة عالية · ضمان"
              dir="auto"
            />
          </label>
        </div>
        <p style={{ margin: '8px 0 0', fontSize: 12, color: '#64748b' }}>
          الاسم يُجلب تلقائيًا من إعدادات الطباعة. فعّل «اسم المكتبة» و«الهاتف» من الخيارات أعلاه ليظهرا على الملصق.
        </p>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 40 }}></th>
              <th>الصنف</th>
              <th>الباركود</th>
              <th>السعر</th>
              <th style={{ width: 110 }}>عدد الملصقات</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: 24 }}>
                  جاري تحميل الأصناف…
                </td>
              </tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: 24, color: '#64748b' }}>
                  {products.length === 0
                    ? 'لا توجد أصناف. أضف منتجات من «الإعدادات → المنتجات» أو من المشتريات.'
                    : q
                      ? `لا نتائج للبحث «${q}». امسح البحث لعرض كل الأصناف.`
                      : 'لا أصناف تطابق الفلتر الحالي.'}
                </td>
              </tr>
            )}
            {!loading &&
              filtered.map((p) => {
                const hasBc = Boolean(String(p.barcode || '').trim());
                return (
                  <tr key={p.id} style={{ opacity: hasBc ? 1 : 0.75 }}>
                    <td>
                      <input
                        type="checkbox"
                        checked={Boolean(selected[p.id])}
                        onChange={() => toggle(p.id)}
                        disabled={!hasBc}
                        title={hasBc ? 'تحديد' : 'أضف باركودًا أولًا'}
                      />
                    </td>
                    <td>
                      <strong>{p.name}</strong>
                      {!hasBc && (
                        <div className="muted-sm" style={{ color: '#b45309' }}>
                          بدون باركود — عدّل المنتج من الإعدادات
                        </div>
                      )}
                    </td>
                    <td dir="ltr">{p.barcode || '—'}</td>
                    <td>{Number(p.salePrice || 0).toFixed(2)}</td>
                    <td>
                      <input
                        type="number"
                        min={1}
                        max={50}
                        style={{ width: 72 }}
                        disabled={!selected[p.id]}
                        value={selected[p.id] || 1}
                        onChange={(e) => setQty(p.id, Number(e.target.value))}
                      />
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
