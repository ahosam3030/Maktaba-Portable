/**
 * طباعة حرارية 80 مم — Xprinter XP-Q807K
 * المنطقة القابلة للطباعة ≈ 72 مم؛ الهوامش الجانبية ضيقة لتفادي القص.
 */
export const THERMAL_WIDTH_MM = 80;
export const THERMAL_CONTENT_MM = 72;

export function thermal80Css(extra = ''): string {
  return `
@page { size: 80mm auto; margin: 0; }
* { box-sizing: border-box; }
html, body {
  margin: 0;
  padding: 0;
  width: 80mm;
  max-width: 80mm;
}
body {
  font-family: Tahoma, 'Segoe UI', Arial, sans-serif;
  font-size: 11px;
  line-height: 1.3;
  color: #000;
  background: #fff;
  width: ${THERMAL_CONTENT_MM}mm;
  max-width: ${THERMAL_CONTENT_MM}mm;
  margin: 0 auto;
  padding: 2mm 0 5mm;
  direction: rtl;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
  overflow: hidden;
}
.center { text-align: center; }
.brand { font-size: 14px; font-weight: 800; margin-bottom: 2px; word-wrap: break-word; }
.sub { font-size: 10px; color: #222; margin-bottom: 1px; word-wrap: break-word; }
.tags { font-size: 9px; color: #444; margin: 3px 0; word-wrap: break-word; }
.hr { border: none; border-top: 1px dashed #000; margin: 5px 0; }
.title { font-size: 12px; font-weight: 700; text-align: center; margin: 3px 0; }
.meta { font-size: 10px; margin: 2px 0; word-wrap: break-word; }
.meta strong { font-weight: 700; }
table {
  width: 100%;
  border-collapse: collapse;
  margin: 4px 0;
  font-size: 10px;
  table-layout: fixed;
}
th, td {
  padding: 2px 1px;
  vertical-align: top;
  text-align: right;
  word-wrap: break-word;
  overflow-wrap: anywhere;
}
th {
  border-bottom: 1px solid #000;
  font-weight: 700;
  font-size: 9px;
}
td.num, th.num { text-align: center; width: 12%; }
td.name, th.name { width: 40%; }
td.qty, th.qty { text-align: center; width: 14%; }
td.money, th.money { text-align: left; direction: ltr; width: 17%; white-space: nowrap; }
.totals { margin-top: 3px; font-size: 11px; }
.totals .row {
  display: flex;
  justify-content: space-between;
  gap: 4px;
  padding: 2px 0;
}
.totals .row span:last-child,
.totals .row strong:last-child {
  direction: ltr;
  text-align: left;
  white-space: nowrap;
  flex-shrink: 0;
}
.totals .grand {
  font-size: 12px;
  font-weight: 800;
  border-top: 1px dashed #000;
  margin-top: 3px;
  padding-top: 3px;
}
.badge {
  display: inline-block;
  border: 1px solid #000;
  padding: 1px 6px;
  font-size: 9px;
  font-weight: 700;
  margin: 3px 0;
}
.foot { text-align: center; font-size: 9px; margin-top: 6px; color: #222; word-wrap: break-word; }
.amt-big { font-size: 18px; font-weight: 800; text-align: center; margin: 6px 0; direction: ltr; }
.box {
  border: 1px solid #000;
  padding: 4px;
  margin: 4px 0;
}
@media print {
  html, body { width: 80mm; }
  body { width: ${THERMAL_CONTENT_MM}mm; max-width: ${THERMAL_CONTENT_MM}mm; padding: 1.5mm 0 4mm; }
  .no-print { display: none !important; }
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
