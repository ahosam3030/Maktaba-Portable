import { useCallback, useEffect, useRef, useState } from 'react';

type Props = {
  open: boolean;
  title?: string;
  onClose: () => void;
  onScan: (code: string) => void;
};

type Mode = 'camera' | 'manual';

declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats?: string[] }) => {
      detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue: string }>>;
    };
  }
}

/**
 * مسح باركود بدون الاعتماد على ماسح لوحة المفاتيح (يتجنب فتح DevTools).
 * - كاميرا الجهاز عبر BarcodeDetector عند التوفر
 * - أو إدخال يدوي للرقم
 */
export function ScanModeOverlay({ open, title, onClose, onScan }: Props) {
  const [mode, setMode] = useState<Mode>('camera');
  const [manual, setManual] = useState('');
  const [error, setError] = useState('');
  const [cameraStatus, setCameraStatus] = useState('جاري تشغيل الكاميرا…');
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const lastScanRef = useRef('');
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  const stopCamera = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const accept = useCallback(
    (code: string) => {
      const c = code.trim();
      if (c.length < 3) return;
      if (c === lastScanRef.current) return;
      lastScanRef.current = c;
      stopCamera();
      onScanRef.current(c);
    },
    [stopCamera],
  );

  useEffect(() => {
    if (!open) {
      stopCamera();
      return;
    }
    lastScanRef.current = '';
    setManual('');
    setError('');
    setMode('camera');
  }, [open, stopCamera]);

  useEffect(() => {
    if (!open || mode !== 'camera') {
      stopCamera();
      return;
    }

    let cancelled = false;

    async function start() {
      setError('');
      setCameraStatus('جاري تشغيل الكاميرا…');

      if (!window.BarcodeDetector) {
        setError('المتصفح لا يدعم قراءة الباركود من الكاميرا. استخدم الإدخال اليدوي أو Edge/Chrome محدّث.');
        setMode('manual');
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        setCameraStatus('وجّه الباركود أمام الكاميرا');

        const detector = new window.BarcodeDetector!({
          formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'codabar', 'upc_a', 'upc_e', 'qr_code', 'itf'],
        });

        const tick = async () => {
          if (cancelled || !videoRef.current) return;
          try {
            if (videoRef.current.readyState >= 2) {
              const codes = await detector.detect(videoRef.current);
              if (codes?.length) {
                const value = codes[0]?.rawValue?.trim();
                if (value) {
                  accept(value);
                  return;
                }
              }
            }
          } catch {
            /* frame skip */
          }
          rafRef.current = requestAnimationFrame(() => {
            void tick();
          });
        };
        rafRef.current = requestAnimationFrame(() => {
          void tick();
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'تعذر فتح الكاميرا';
        setError(
          `تعذر الوصول للكاميرا (${msg}). اسمح بالكاميرا للموقع أو استخدم الإدخال اليدوي.`,
        );
        setMode('manual');
      }
    }

    void start();
    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [open, mode, accept, stopCamera]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: 'rgba(15, 23, 42, 0.94)',
        display: 'grid',
        placeItems: 'center',
        padding: 16,
        color: '#fff',
      }}
    >
      <div style={{ maxWidth: 520, width: '100%' }}>
        <div style={{ fontSize: 13, opacity: 0.75, marginBottom: 6 }}>مسح باركود — بدون لوحة مفاتيح</div>
        <h2 style={{ margin: '0 0 8px', fontSize: 22 }}>{title || 'امسح الصنف'}</h2>
        <p style={{ opacity: 0.85, lineHeight: 1.55, marginBottom: 14, fontSize: 14 }}>
          ماسح USB عندك يفتح أدوات المتصفح لأنه مبرمَج باختصار. استخدم <strong>الكاميرا</strong> أو
          اكتب الرقم يدويًا.
        </p>

        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <button
            type="button"
            className={mode === 'camera' ? 'primary-btn' : 'secondary-btn'}
            onClick={() => setMode('camera')}
          >
            كاميرا
          </button>
          <button
            type="button"
            className={mode === 'manual' ? 'primary-btn' : 'secondary-btn'}
            onClick={() => {
              stopCamera();
              setMode('manual');
            }}
          >
            إدخال يدوي
          </button>
        </div>

        {error && (
          <div
            style={{
              background: '#7f1d1d',
              borderRadius: 10,
              padding: '10px 12px',
              marginBottom: 12,
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            {error}
          </div>
        )}

        {mode === 'camera' && (
          <div>
            <div
              style={{
                position: 'relative',
                borderRadius: 14,
                overflow: 'hidden',
                background: '#000',
                aspectRatio: '4 / 3',
                marginBottom: 10,
              }}
            >
              <video
                ref={videoRef}
                muted
                playsInline
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
              <div
                style={{
                  position: 'absolute',
                  inset: '18% 12%',
                  border: '2px solid #34d399',
                  borderRadius: 12,
                  boxShadow: '0 0 0 9999px rgba(0,0,0,0.35)',
                  pointerEvents: 'none',
                }}
              />
            </div>
            <div style={{ textAlign: 'center', opacity: 0.9, fontSize: 14 }}>{cameraStatus}</div>
          </div>
        )}

        {mode === 'manual' && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              accept(manual);
            }}
          >
            <label style={{ display: 'block', fontSize: 13, marginBottom: 6, opacity: 0.85 }}>
              رقم الباركود
            </label>
            <input
              autoFocus
              dir="ltr"
              inputMode="numeric"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="مثال: 6976164824360"
              style={{
                width: '100%',
                padding: '12px 14px',
                fontSize: 20,
                borderRadius: 10,
                border: '1px solid #334155',
                background: '#0f172a',
                color: '#fff',
                marginBottom: 12,
                boxSizing: 'border-box',
              }}
            />
            <button type="submit" className="primary-btn" style={{ width: '100%', padding: '12px' }}>
              تأكيد
            </button>
          </form>
        )}

        <button
          type="button"
          className="secondary-btn"
          onClick={() => {
            stopCamera();
            onClose();
          }}
          style={{ width: '100%', marginTop: 14, padding: '10px' }}
        >
          إغلاق
        </button>
      </div>
    </div>
  );
}
