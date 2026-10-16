/**
 * قوالب طباعة حرارية 80 مم — متوافقة مع Xprinter XP-Q807K وأشباهها.
 */
export const THERMAL_WIDTH_MM = 80;

export function thermal80Css(extra = ''): string {
  return `
@page { size: 80mm auto; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: Tahoma, 'Segoe UI', Arial, sans-serif;
  font-size: 12px;
  line-height: 1.35;
  color: #111;
  background: #fff;
  width: ${THERMAL_WIDTH_MM}mm;
  max-width: ${THERMAL_WIDTH_MM}mm;
  margin: 0 auto;
  padding: 3mm 3mm 6mm;
  direction: rtl;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.center { text-align: center; }
.brand { font-size: 15px; font-weight: 800; margin-bottom: 2px; }
.sub { font-size: 10px; color: #333; margin-bottom: 2px; }
.tags { font-size: 9px; color: #555; margin: 4px 0; }
.hr { border: none; border-top: 1px dashed #333; margin: 6px 0; }
.title { font-size: 13px; font-weight: 700; text-align: center; margin: 4px 0; }
.meta { font-size: 11px; margin: 2px 0; }
table { width: 100%; border-collapse: collapse; margin: 6px 0; font-size: 11px; }
th, td { padding: 3px 1px; vertical-align: top; text-align: right; }
th { border-bottom: 1px solid #333; font-weight: 700; font-size: 10px; }
td.num, th.num { text-align: center; width: 18px; }
td.qty, th.qty { text-align: center; width: 28px; }
td.money, th.money { text-align: left; direction: ltr; white-space: nowrap; }
.totals { margin-top: 4px; font-size: 12px; }
.totals .row { display: flex; justify-content: space-between; padding: 2px 0; }
.totals .grand { font-size: 14px; font-weight: 800; border-top: 1px dashed #333; margin-top: 4px; padding-top: 4px; }
.badge {
  display: inline-block;
  border: 1px solid #333;
  padding: 1px 8px;
  font-size: 10px;
  font-weight: 700;
  margin: 4px 0;
}
.foot { text-align: center; font-size: 10px; margin-top: 8px; color: #333; }
.amt-big { font-size: 20px; font-weight: 800; text-align: center; margin: 8px 0; direction: ltr; }
@media print {
  body { padding: 2mm 2mm 4mm; }
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
        setTimeout(cleanup, 1000);
      }
    }, 250);
  } catch {
    const w = window.open('', '_blank', 'width=400,height=700');
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
<title>${escapePrintHtml(title)}</title>
<style>${thermal80Css(extraCss)}</style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}
