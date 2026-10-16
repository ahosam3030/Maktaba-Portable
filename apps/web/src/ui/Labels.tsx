declare global {
  interface Window {
    maktabaDesktop?: {
      isDesktop?: boolean;
      printLabels?: (p: {
        images: string[];
        widthMm: number;
        heightMm: number;
      }) => Promise<{ ok?: boolean; error?: string | null }>;
      printLabelsTspl?: (p: {
        labels: Array<{ name: string; price: number; barcode: string; copies: number }>;
        widthMm: number;
        heightMm: number;
        printerName?: string;
      }) => Promise<{ ok?: boolean; error?: string | null; printerName?: string; printed?: number }>;
      listPrinters?: () => Promise<Array<{ name: string; isDefault?: boolean }>>;
    };
  }
}
import { useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../data/api';
import { loadInvoiceSettings } from '../data/invoiceSettings';
import { noticeClass, noticeKind } from './notice';
import { renderLabelPng } from '../data/code128';

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
type LabelSizeId = 'a4-auto' | '30x10' | '38x25' | '40x20' | '40x30' | '50x25' | '50x30' | '50x40' | '60x40' | '70x50' | '80x50' | 'custom';

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
  { id: 'a4-auto', label: 'ورقة A4 (شبكة)', widthMm: 0, heightMm: 30, defaultCols: 3, pageMode: 'sheet' },
  { id: '30x10', label: '30×10 مم (3×1 سم) — رول', widthMm: 30, heightMm: 10, defaultCols: 1, pageMode: 'roll' },
  { id: '38x25', label: '38×25 مم (عرض×ارتفاع) — رولك', widthMm: 38, heightMm: 25, defaultCols: 1, pageMode: 'roll' },
  { id: '40x20', label: '40×20 مم — رول', widthMm: 40, heightMm: 20, defaultCols: 1, pageMode: 'roll' },
  { id: '40x30', label: '40×30 مم — رول', widthMm: 40, heightMm: 30, defaultCols: 1, pageMode: 'roll' },
  { id: '50x25', label: '50×25 مم — رول', widthMm: 50, heightMm: 25, defaultCols: 1, pageMode: 'roll' },
  { id: '50x30', label: '50×30 مم — رول (شائع)', widthMm: 50, heightMm: 30, defaultCols: 1, pageMode: 'roll' },
  { id: '50x40', label: '50×40 مم — رول', widthMm: 50, heightMm: 40, defaultCols: 1, pageMode: 'roll' },
  { id: '60x40', label: '60×40 مم — رول', widthMm: 60, heightMm: 40, defaultCols: 1, pageMode: 'roll' },
  { id: '70x50', label: '70×50 مم', widthMm: 70, heightMm: 50, defaultCols: 1, pageMode: 'roll' },
  { id: '80x50', label: '80×50 مم — رول عريض', widthMm: 80, heightMm: 50, defaultCols: 1, pageMode: 'roll' },
  { id: 'custom', label: 'مخصص (مم)…', widthMm: 50, heightMm: 30, defaultCols: 1, pageMode: 'roll' },
];

const SIZE_STORAGE_KEY = 'maktaba.labelSize.v1';

function loadSavedSize(): { id: LabelSizeId; w: number; h: number; cols: number } {
  try {
    const raw = localStorage.getItem(SIZE_STORAGE_KEY);
    if (!raw) return { id: '38x25', w: 38, h: 25, cols: 1 };
    const j = JSON.parse(raw) as { id?: LabelSizeId; w?: number; h?: number; cols?: number };
    const preset = LABEL_SIZES.find((s) => s.id === j.id) || LABEL_SIZES[2];
    return {
      id: (j.id as LabelSizeId) || '50x30',
      w: Number(j.w) || preset.widthMm || 50,
      h: Number(j.h) || preset.heightMm || 30,
      cols: Number(j.cols) || preset.defaultCols,
    };
  } catch {
    return { id: '38x25', w: 38, h: 25, cols: 1 };
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

    const wMm = Math.max(20, labelW || 38);
    const hMm = Math.max(12, labelH || 25);
    const store = storeName.trim();

    const images: string[] = [];
    for (const p of items) {
      for (let c = 0; c < p.copies; c++) {
        const png = renderLabelPng({
          widthMm: wMm,
          heightMm: hMm,
          name: p.name || '',
          price: Number(p.salePrice) || 0,
          barcode: String(p.barcode),
          store: showStoreName ? store : '',
          showName,
          showPrice,
          showCode: showBarcodeText,
          dpi: 203,
        });
        if (png) images.push(png);
      }
    }

    if (images.length === 0) {
      setNotice('تعذر رسم الملصقات.');
      return;
    }

    // معاينة فقط — بدون إرسال تلقائي للطابعة (كان يسبب سحب ورق فاضي كثير)
    openLabelPreview(images, wMm, hMm, items);
    setNotice(
      `معاينة ${images.length} ملصق (${wMm}×${hMm} مم عرض×ارتفاع). حمّل PNG واطبع من الرسام — أو من المعاينة زر الطباعة المباشرة مرة واحدة.`,
    );
  }

  function openLabelPreview(
    images: string[],
    wMm: number,
    hMm: number,
    items?: Array<Product & { copies: number }>,
  ) {
    const previewW = Math.max(240, Math.round(wMm * 6));
    const pages = images
      .map(
        (src, i) =>
          `<div class="page">
  <img src="${src}" alt="label-${i + 1}" width="${previewW}"/>
  <div class="dl"><a download="maktaba-label-${i + 1}.png" href="${src}">تحميل الملصق ${i + 1} PNG</a></div>
</div>`,
      )
      .join('\n');

    const labelsJson = JSON.stringify(
      (items || []).map((p) => ({
        name: p.name || '',
        price: Number(p.salePrice) || 0,
        barcode: String(p.barcode || ''),
        copies: 1, // نسخة واحدة فقط لكل إرسال لتفادي سحب ورق زيادة
      })),
    );

    const w = window.open('', '_blank', 'width=580,height=760');
    if (!w) {
      setNotice('اسمح بالنوافذ المنبثقة للمعاينة.');
      return;
    }
    w.document.write(`<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"/>
<title>معاينة ${wMm}×${hMm} مم</title>
<style>
  body { font-family: Tahoma, Arial, sans-serif; margin: 0; padding: 14px; background: #eef2f7; color: #111; }
  h1 { font-size: 17px; margin: 0 0 8px; }
  .hint { background: #fff7ed; border: 1px solid #fdba74; border-radius: 8px; padding: 12px; margin-bottom: 12px; font-size: 13px; line-height: 1.55; }
  .ok { background: #ecfdf5; border-color: #6ee7b7; }
  .page { background: #fff; border: 1px solid #94a3b8; margin: 0 auto 16px; padding: 10px; width: fit-content; text-align: center; }
  .page img { image-rendering: pixelated; border: 1px solid #000; background: #fff; display: block; margin: 0 auto; }
  .dl a { color: #0f766e; font-weight: 700; font-size: 13px; }
  .row { display: flex; gap: 8px; flex-wrap: wrap; margin: 10px 0 14px; }
  button { padding: 10px 14px; cursor: pointer; border-radius: 8px; border: 1px solid #cbd5e1; background: #fff; font-family: inherit; }
  button.primary { background: #0f766e; color: #fff; border-color: #0f766e; }
  button:disabled { opacity: 0.5; }
  #msg { font-size: 13px; margin-top: 8px; }
</style></head><body>
<h1>معاينة ملصق — العرض ${wMm} مم × الارتفاع ${hMm} مم</h1>
<div class="hint">
  <b>مهم:</b> لا تُرسل الطباعة تلقائيًا حتى لا يُسحب ورق فاضي.<br/>
  <b>الأضمن مع XP-Q371U:</b> تحميل PNG → الرسام → طباعة → مقاس 38×25 → بدون Fit.
</div>
<div class="row">
  <button type="button" class="primary" id="btnPng">التعليمات: حمّل PNG من تحت كل ملصق</button>
</div>
<div id="msg"></div>
${pages}
<script>
(function(){
  var labels = ${labelsJson};
  var wMm = ${wMm}, hMm = ${hMm};
  // لا window.print تلقائيًا
})();
<\/script>
</body></html>`);
    w.document.close();
  }

  return (
    <div className="purchases-page labels-page">
      <div className="purchase-title"><div><span className="eyebrow">المخزون</span><h1>ملصقات الباركود</h1><p>اختر الأصناف والحجم ثم اطبع على الرول الحراري</p></div></div>
      <section className="purchase-panel labels-panel">
      <div className="panel-heading">
        <div>
          <h2>ملصقات الباركود</h2>
          <p className="muted-sm">
            للرول الحراري: الافتراضي 38×25 مم — اختر المقاس ثم اطبع. في الطباعة عطّل «ملاءمة للصفحة» وحدد مقاس الورق = الملصق.
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
      </section>
    </div>
  );
}
