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

/** مقاسات ملصق شائعة (مم) — للطباعة الحرارية أو الورق */
type LabelSizeId = 'a4-auto' | '40x30' | '50x30' | '50x40' | '60x40' | '70x50' | '80x50' | 'custom';

type LabelSize = {
  id: LabelSizeId;
  label: string;
  widthMm: number;
  heightMm: number;
  /** عدد الأعمدة المقترح على A4؛ للطابعة الحرارية = 1 */
  defaultCols: number;
  pageMode: 'sheet' | 'roll';
};

const LABEL_SIZES: LabelSize[] = [
  { id: 'a4-auto', label: 'ورقة A4 (تلقائي)', widthMm: 0, heightMm: 30, defaultCols: 3, pageMode: 'sheet' },
  { id: '40x30', label: '40×30 مم (رف صغير)', widthMm: 40, heightMm: 30, defaultCols: 4, pageMode: 'sheet' },
  { id: '50x30', label: '50×30 مم (الأكثر شيوعًا)', widthMm: 50, heightMm: 30, defaultCols: 3, pageMode: 'sheet' },
  { id: '50x40', label: '50×40 مم', widthMm: 50, heightMm: 40, defaultCols: 3, pageMode: 'sheet' },
  { id: '60x40', label: '60×40 مم', widthMm: 60, heightMm: 40, defaultCols: 3, pageMode: 'sheet' },
  { id: '70x50', label: '70×50 مم', widthMm: 70, heightMm: 50, defaultCols: 2, pageMode: 'sheet' },
  { id: '80x50', label: '80×50 مم (رول حراري)', widthMm: 80, heightMm: 50, defaultCols: 1, pageMode: 'roll' },
  { id: 'custom', label: 'مخصص…', widthMm: 50, heightMm: 30, defaultCols: 3, pageMode: 'sheet' },
];

const SIZE_STORAGE_KEY = 'maktaba.labelSize.v1';

function loadSavedSize(): { id: LabelSizeId; w: number; h: number; cols: number } {
  try {
    const raw = localStorage.getItem(SIZE_STORAGE_KEY);
    if (!raw) return { id: '50x30', w: 50, h: 30, cols: 3 };
    const j = JSON.parse(raw) as { id?: LabelSizeId; w?: number; h?: number; cols?: number };
    const preset = LABEL_SIZES.find((s) => s.id === j.id) || LABEL_SIZES[2];
    return {
      id: (j.id as LabelSizeId) || '50x30',
      w: Number(j.w) || preset.widthMm || 50,
      h: Number(j.h) || preset.heightMm || 30,
      cols: Number(j.cols) || preset.defaultCols,
    };
  } catch {
    return { id: '50x30', w: 50, h: 30, cols: 3 };
  }
}


export function Labels() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [notice, setNotice] = useState('');
  const inv = loadInvoiceSettings();
  const saved = loadSavedSize();
  const [sizeId, setSizeId] = useState<LabelSizeId>(saved.id);
  const [customW, setCustomW] = useState(saved.w || 50);
  const [customH, setCustomH] = useState(saved.h || 30);
  const [cols, setCols] = useState(saved.cols);
  const [showPrice, setShowPrice] = useState(true);
  const [showName, setShowName] = useState(true);
  const [showBarcodeText, setShowBarcodeText] = useState(true);
  const [showStoreName, setShowStoreName] = useState(true);
  const [showPhone, setShowPhone] = useState(false);
  const [storeName, setStoreName] = useState(inv.brandTitle || inv.watermarkText || '');
  const [phone, setPhone] = useState(inv.phone || '');
  const [extraLine, setExtraLine] = useState('');
  const [onlyWithBarcode, setOnlyWithBarcode] = useState(false);

  const activePreset = LABEL_SIZES.find((s) => s.id === sizeId) || LABEL_SIZES[2];
  const labelW = sizeId === 'custom' ? Math.max(20, Math.min(120, customW || 50)) : (activePreset.widthMm || 0);
  const labelH = sizeId === 'custom' ? Math.max(15, Math.min(100, customH || 30)) : (activePreset.heightMm || 30);
  const isRoll = activePreset.pageMode === 'roll' || (sizeId === 'custom' && labelW >= 70 && cols === 1);
  const isFixedSize = sizeId !== 'a4-auto';

  useEffect(() => {
    try {
      localStorage.setItem(
        SIZE_STORAGE_KEY,
        JSON.stringify({ id: sizeId, w: labelW || customW, h: labelH || customH, cols }),
      );
    } catch { /* ignore */ }
  }, [sizeId, labelW, labelH, customW, customH, cols]);

  function applySize(id: LabelSizeId) {
    const p = LABEL_SIZES.find((s) => s.id === id);
    if (!p) return;
    setSizeId(id);
    if (id !== 'custom' && id !== 'a4-auto') {
      setCustomW(p.widthMm);
      setCustomH(p.heightMm);
    }
    setCols(p.defaultCols);
  }

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
    const gapMm = isFixedSize ? 2 : 4;
    const padMm = isFixedSize ? 1.5 : 2.5;
    const pageMargin = isRoll ? '2mm' : '6mm';
    const bcH = Math.max(22, Math.min(48, Math.round(labelH * 0.9)));
    const nameFs = labelH <= 30 ? 10 : labelH <= 40 ? 11 : 12;
    const priceFs = labelH <= 30 ? 11 : 13;
    const storeFs = labelH <= 30 ? 8 : 9;
    const sheetCols = isRoll ? 1 : cols;
    const labelSizeCss = isFixedSize
      ? `width: ${labelW}mm; height: ${labelH}mm; max-width: ${labelW}mm; max-height: ${labelH}mm; box-sizing: border-box; overflow: hidden;`
      : `min-height: ${labelH}mm;`;
    const sheetCss = isRoll
      ? `display: flex; flex-direction: column; align-items: center; gap: ${gapMm}mm; padding: 2mm;`
      : isFixedSize
        ? `display: flex; flex-wrap: wrap; gap: ${gapMm}mm; padding: 4mm; justify-content: flex-start;`
        : `display: grid; grid-template-columns: repeat(${sheetCols}, 1fr); gap: ${gapMm}mm; padding: 4mm;`;

    w.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<title>ملصقات باركود ${isFixedSize ? labelW + '×' + labelH + ' مم' : 'A4'}</title>
<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
<style>
  @page { margin: ${pageMargin}; ${isRoll && isFixedSize ? `size: ${labelW}mm ${labelH}mm;` : ''} }
  body { font-family: Tahoma, Arial, sans-serif; margin: 0; background: #fff; }
  .sheet { ${sheetCss} }
  .label {
    border: 1px dashed #94a3b8;
    border-radius: 3px;
    padding: ${padMm}mm 1.5mm;
    text-align: center;
    page-break-inside: avoid;
    ${isRoll ? 'page-break-after: always;' : ''}
    ${labelSizeCss}
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5px;
  }
  .store { font-size: ${storeFs}px; font-weight: 800; color: #0f766e; line-height: 1.15; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .name { font-size: ${nameFs}px; font-weight: 700; line-height: 1.15; max-width: 100%; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
  .price { font-size: ${priceFs}px; font-weight: 800; color: #0c4a6e; margin: 0; }
  .code { font-size: 8px; letter-spacing: 0.03em; color: #334155; }
  .phone { font-size: 7px; color: #64748b; }
  .extra { font-size: 7px; color: #475569; line-height: 1.15; max-width: 100%; overflow: hidden; }
  svg.bc { max-width: 96%; height: ${bcH}px; }
  @media print {
    .label { border-color: #cbd5e1; }
  }
</style></head><body>
<div class="sheet">${labelsHtml}</div>
<script>
  document.querySelectorAll('svg.bc').forEach(function(el) {
    var code = el.getAttribute('data-barcode') || '';
    if (!code) return;
    try {
      JsBarcode(el, code, { format: 'CODE128', width: ${labelH <= 30 ? 1.2 : 1.4}, height: ${bcH}, displayValue: false, margin: 0 });
    } catch (e) {}
  });
  window.onload = function() { setTimeout(function(){ window.print(); }, 300); };
<\/script>
</body></html>`);
    w.document.close();
    const totalCopies = items.reduce((s, i) => s + i.copies, 0);
    const sizeNote = isFixedSize ? ` — مقاس ${labelW}×${labelH} مم` : ' — ورقة A4';
    setNotice(`جاهز للطباعة: ${totalCopies} ملصق${sizeNote}. في نافذة الطباعة اختر المقاس/الورقة المناسبة.`);
  }

  return (
    <div className="panel labels-panel">
      <div className="panel-heading">
        <div>
          <h2>ملصقات الباركود</h2>
          <p className="muted-sm">
            اختر مقاس الملصق والأصناف ثم اطبع (CODE128). المقاس يُحفظ على هذا الجهاز.
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
          <span>مقاس الملصق</span>
          <select value={sizeId} onChange={(e) => applySize(e.target.value as LabelSizeId)}>
            {LABEL_SIZES.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </label>
        {sizeId === 'custom' && (
          <>
            <label>
              <span>العرض (مم)</span>
              <input type="number" min={20} max={120} value={customW} onChange={(e) => setCustomW(Number(e.target.value) || 50)} style={{ width: 72 }} />
            </label>
            <label>
              <span>الارتفاع (مم)</span>
              <input type="number" min={15} max={100} value={customH} onChange={(e) => setCustomH(Number(e.target.value) || 30)} style={{ width: 72 }} />
            </label>
          </>
        )}
        {!isRoll && (
          <label>
            <span>أعمدة الصفحة</span>
            <select value={cols} onChange={(e) => setCols(Number(e.target.value))}>
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
              <option value={4}>4</option>
            </select>
          </label>
        )}
        {isFixedSize && (
          <span className="muted-sm" style={{ alignSelf: 'end', paddingBottom: 6 }}>
            {labelW}×{labelH} مم
          </span>
        )}
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
