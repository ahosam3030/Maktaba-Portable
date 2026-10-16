/**
 * طباعة حرارية 80 مم — Xprinter XP-Q807K
 * الأرقام تُعرض داخل عرض آمن حتى لا تُقص من حافة الرول.
 */
export const THERMAL_WIDTH_MM = 80;

export function money2(n: number): string {
  const v = Number(n);
  if (!Number.isFinite(v)) return '0.00';
  return v.toFixed(2);
}

export function thermal80Css(extra = ''): string {
  return `
@page { size: 80mm auto; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body {
  width: 80mm;
  max-width: 80mm;
  margin: 0;
  padding: 0;
}
body {
  font-family: Tahoma, 'Segoe UI', Arial, sans-serif;
  font-size: 12px;
  line-height: 1.35;
  color: #000;
  background: #fff;
  padding: 3mm 4mm 6mm;
  direction: rtl;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.center { text-align: center; }
.brand { font-size: 15px; font-weight: 800; margin-bottom: 2px; }
.sub { font-size: 10px; color: #222; margin-bottom: 2px; }
.tags { font-size: 9px; color: #444; margin: 3px 0; }
.hr { border: none; border-top: 1px dashed #000; margin: 6px 0; }
.title { font-size: 13px; font-weight: 700; text-align: center; margin: 4px 0; }
.meta { font-size: 11px; margin: 3px 0; }
.badge {
  display: inline-block;
  border: 1px solid #000;
  padding: 2px 8px;
  font-size: 10px;
  font-weight: 700;
  margin: 4px 0;
}
.item {
  margin: 6px 0;
  padding-bottom: 4px;
  border-bottom: 1px dotted #999;
  font-size: 11px;
}
.item .nm { font-weight: 700; margin-bottom: 2px; }
.item .ln {
  direction: ltr;
  text-align: left;
  font-variant-numeric: tabular-nums;
  font-size: 11px;
}
.tot-table { width: 100%; border-collapse: collapse; margin-top: 4px; font-size: 12px; }
.tot-table td { padding: 3px 0; vertical-align: middle; }
.tot-table td.k { text-align: right; }
.tot-table td.v {
  text-align: left;
  direction: ltr;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  white-space: nowrap;
  width: 40%;
}
.tot-table tr.grand td {
  font-size: 13px;
  font-weight: 800;
  border-top: 1px dashed #000;
  padding-top: 5px;
}
.amt-big {
  font-size: 22px;
  font-weight: 800;
  text-align: center;
  margin: 8px 0;
  direction: ltr;
  font-variant-numeric: tabular-nums;
}
.box { border: 1px solid #000; padding: 5px; margin: 6px 0; }
.foot { text-align: center; font-size: 10px; margin-top: 8px; color: #333; }
@media print {
  body { padding: 2mm 3mm 5mm; }
}
${extra}
`.trim();
}

export function escapePrintHtml(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function printThermalHtml(htmlDocument: string, title = 'طباعة'): void {
  try {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('title', title);
    iframe.style.cssText =
      'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none';
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) throw new Error('iframe');
    doc.open();
    doc.write(htmlDocument);
    doc.close();
    const win = iframe.contentWindow;
    const cleanup = () => {
      try {
        document.body.removeChild(iframe);
      } catch {
        /* ignore */
      }
    };
    setTimeout(() => {
      try {
        win?.focus();
        win?.print();
      } finally {
        setTimeout(cleanup, 1200);
      }
    }, 300);
  } catch {
    const w = window.open('', '_blank', 'width=360,height=700');
    if (!w) {
      window.alert('اسمح بالنوافذ المنبثقة لطباعة الفاتورة.');
      return;
    }
    w.document.write(htmlDocument);
    w.document.close();
  }
}

export function thermalDoc(title: string, bodyHtml: string, extraCss = ''): string {
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=80mm"/>
<title>${escapePrintHtml(title)}</title>
<style>${thermal80Css(extraCss)}</style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

/** صف مجاميع: تسمية + رقم كامل بدون قص */
export function totRow(label: string, value: number | string, grand = false): string {
  const v = typeof value === 'number' ? money2(value) : escapePrintHtml(String(value));
  return `<tr class="${grand ? 'grand' : ''}"><td class="k">${escapePrintHtml(label)}</td><td class="v">${v}</td></tr>`;
}
