/**
 * طباعة حرارية 80 مم — تصميم بسيط مقاوم للقص (Xprinter XP-Q807K)
 * كل مبلغ في سطر لوحده تحت التسمية حتى لا يُقطع من الحافة.
 */

export function money2(n: number | string | null | undefined): string {
  const v = Number(n);
  if (!Number.isFinite(v)) return '0.00';
  return v.toFixed(2);
}

export function escapePrintHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** سطر تسمية + قيمة رقمية تحتها (الأضمن على الرول) */
export function fieldBlock(label: string, value: string, opts?: { big?: boolean; bold?: boolean }): string {
  const vClass = opts?.big ? 'val big' : opts?.bold ? 'val bold' : 'val';
  return `<div class="fld">
  <div class="lbl">${escapePrintHtml(label)}</div>
  <div class="${vClass}">${escapePrintHtml(value)}</div>
</div>`;
}

export function moneyBlock(label: string, amount: number | string, grand = false): string {
  return fieldBlock(label, money2(amount), { big: grand, bold: true });
}

export function thermal80Css(): string {
  return `
@page { size: 80mm auto; margin: 0; }
* { box-sizing: border-box; }
html, body {
  margin: 0;
  padding: 0;
  width: 80mm;
  background: #fff;
  color: #000;
}
body {
  font-family: Tahoma, Arial, sans-serif;
  font-size: 13px;
  line-height: 1.4;
  padding: 4mm 5mm 8mm;
  direction: rtl;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.center { text-align: center; }
.brand { font-size: 16px; font-weight: 800; margin: 0 0 2px; }
.sub { font-size: 11px; margin: 1px 0; }
.hr {
  border: none;
  border-top: 1px dashed #000;
  margin: 8px 0;
}
.title { font-size: 14px; font-weight: 800; text-align: center; margin: 6px 0 4px; }
.badge {
  display: inline-block;
  border: 1px solid #000;
  padding: 2px 10px;
  font-size: 11px;
  font-weight: 700;
  margin: 4px 0 8px;
}
.meta { font-size: 12px; margin: 4px 0; }
.meta b { font-weight: 700; }
.item {
  margin: 8px 0;
  padding-bottom: 6px;
  border-bottom: 1px dotted #666;
}
.item .nm { font-weight: 700; font-size: 13px; margin-bottom: 2px; }
.item .det { font-size: 12px; margin: 2px 0; }
.item .sum {
  font-size: 13px;
  font-weight: 800;
  direction: ltr;
  text-align: left;
  margin-top: 2px;
  font-variant-numeric: tabular-nums;
}
.fld { margin: 6px 0; }
.fld .lbl { font-size: 12px; color: #111; }
.fld .val {
  direction: ltr;
  text-align: left;
  font-size: 14px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  margin-top: 1px;
  padding: 2px 0;
}
.fld .val.big { font-size: 20px; font-weight: 800; }
.fld .val.bold { font-weight: 800; }
.amt-big {
  text-align: center;
  font-size: 24px;
  font-weight: 800;
  direction: ltr;
  margin: 10px 0;
  font-variant-numeric: tabular-nums;
}
.box {
  border: 1px solid #000;
  padding: 6px;
  margin: 8px 0;
}
.foot { text-align: center; font-size: 11px; margin-top: 10px; }
@media print {
  html, body { width: 80mm; }
  body { padding: 3mm 4mm 6mm; }
}
`.trim();
}

export function thermalDoc(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escapePrintHtml(title)}</title>
<style>${thermal80Css()}</style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

/**
 * طباعة عبر نافذة منفصلة بعرض ~80مم ثم window.print
 * (أثبت من iframe المخفي مع بعض درايفرات Xprinter)
 */
export function printThermalHtml(htmlDocument: string, title = 'طباعة'): void {
  const w = window.open('', '_blank', 'width=320,height=640,scrollbars=yes');
  if (!w) {
    // احتياطي iframe
    try {
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:fixed;left:-9999px;top:0;width:80mm;height:100vh;border:0';
      document.body.appendChild(iframe);
      const doc = iframe.contentDocument;
      if (!doc) throw new Error('no doc');
      doc.open();
      doc.write(htmlDocument);
      doc.close();
      setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => iframe.remove(), 2000);
      }, 400);
      return;
    } catch {
      window.alert('اسمح بالنوافذ المنبثقة لطباعة الفاتورة.');
      return;
    }
  }
  w.document.open();
  w.document.write(htmlDocument);
  w.document.close();
  w.document.title = title;
  const trigger = () => {
    try {
      w.focus();
      w.print();
    } catch {
      /* ignore */
    }
  };
  // انتظر تحميل الخطوط/التخطيط
  if (w.document.readyState === 'complete') {
    setTimeout(trigger, 350);
  } else {
    w.onload = () => setTimeout(trigger, 350);
  }
}

/** توافق مع الاستدعاءات القديمة */
export function totRow(label: string, value: number | string, grand = false): string {
  return moneyBlock(label, value, grand);
}
