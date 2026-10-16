/**
 * مولّد CODE128B بسيط → Data URL PNG (بدون مكتبات خارجية)
 * مناسب لملصقات الباركود أوفلاين داخل Electron.
 */

/** أنماط CODE128: كل قيمة 11 بت كشريط/فراغ (1=شريط أسود، 0=فراغ) */
const PATTERNS: string[] = [
  '11011001100','11001101100','11001100110','10010011000','10010001100','10001001100','10011001000','10011000100','10001100100','11001001000',
  '11001000100','11000100100','10110011100','10011011100','10011001110','10111001100','10011101100','10011100110','11001110010','11001011100',
  '11001001110','11011100100','11001110100','11101101110','11101001100','11100101100','11100100110','11101100100','11100110100','11100110010',
  '11011011000','11011000110','11000110110','10100011000','10001011000','10001000110','10110001000','10001101000','10001100010','11010001000',
  '11000101000','11000100010','10110111000','10110001110','10001101110','10111011000','10111000110','10001110110','11101110110','11010001110',
  '11000101110','11011101000','11011100010','11011101110','11101011000','11101000110','11100010110','11101101000','11101100010','11100011010',
  '11101111010','11001000010','11110001010','10100110000','10100001100','10010110000','10010000110','10000101100','10000100110','10110010000',
  '10110000100','10011010000','10011000010','10000110100','10000110010','11000010010','11001010000','11110111010','11000010100','10001111010',
  '10100111100','10010111100','10010011110','10111100100','10011110100','10011110010','11110100100','11110010100','11110010010','11011011110',
  '11011110110','11110110110','10101111000','10100011110','10001011110','10111101000','10111100010','11110101000','11110100010','10111011110',
  '10111101110','11101011110','11110101110','11010000100','11010010000','11010011100','11000111010',
];

const START_B = 104;
const STOP = 106;

function codeValue(ch: number): number {
  // CODE128B: ASCII 32..127 → 0..95
  if (ch >= 32 && ch <= 127) return ch - 32;
  return 0; // fallback space
}

/** يرسم CODE128 على canvas ويرجع data URL */
export function code128DataUrl(
  text: string,
  opts?: { height?: number; moduleWidth?: number; margin?: number },
): string {
  const raw = String(text || '').trim();
  if (!raw) return '';

  const height = Math.max(12, opts?.height ?? 40);
  const moduleWidth = Math.max(1, opts?.moduleWidth ?? 2);
  const margin = Math.max(0, opts?.margin ?? 4);

  const codes: number[] = [START_B];
  let checksum = START_B;
  for (let i = 0; i < raw.length; i++) {
    const v = codeValue(raw.charCodeAt(i));
    codes.push(v);
    checksum += v * (i + 1);
  }
  codes.push(checksum % 103);
  codes.push(STOP);

  // كل رمز 11 وحدة، ورمز التوقف + شريطين إضافيين (نمط التوقف في الجدول 13 بت تقريباً)
  // نمط STOP القياسي: 1100011101011
  const stopExtra = '11'; // termination bars

  let binary = '';
  for (let i = 0; i < codes.length; i++) {
    const idx = codes[i];
    if (idx === STOP) {
      binary += '1100011101011'; // full stop pattern
    } else {
      binary += PATTERNS[idx] || PATTERNS[0];
    }
  }
  binary += stopExtra;

  const width = margin * 2 + binary.length * moduleWidth;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#000000';

  let x = margin;
  for (let i = 0; i < binary.length; i++) {
    if (binary[i] === '1') {
      ctx.fillRect(x, 0, moduleWidth, height);
    }
    x += moduleWidth;
  }

  try {
    return canvas.toDataURL('image/png');
  } catch {
    return '';
  }
}
