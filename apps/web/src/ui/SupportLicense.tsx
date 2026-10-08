import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../data/api';

function deviceId(): string {
  const key = 'maktaba_device_id';
  let id = localStorage.getItem(key);
  if (!id) {
    id = `portable-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
    localStorage.setItem(key, id);
  }
  return id;
}

export function SupportLicense() {
  const [status, setStatus] = useState<{
    activated: boolean;
    trialActive?: boolean;
    trialExpired?: boolean;
    daysLeft?: number | null;
    writeAllowed?: boolean;
    trialDays?: number;
    maxDevices: number;
    usedDevices: number;
    scheme?: string;
    devices: Array<{ deviceId: string; deviceName: string | null; activatedAt: string }>;
  } | null>(null);
  const [serial, setSerial] = useState('');
  const [msg, setMsg] = useState('');
  const [supportCfg, setSupportCfg] = useState<{ whatsappUrl: string; whatsapp: string } | null>(null);
  const [tickets, setTickets] = useState<
    Array<{ id: string; subject: string; body: string; status: string; createdAt: string }>
  >([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [st, cfg, tix] = await Promise.all([
        apiRequest<NonNullable<typeof status>>('/license/status'),
        apiRequest<{ whatsappUrl: string; whatsapp: string }>('/support/config'),
        apiRequest<typeof tickets>('/support/tickets'),
      ]);
      setStatus(st);
      setSupportCfg(cfg);
      setTickets(Array.isArray(tix) ? tix : []);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'تعذر التحميل');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function activate() {
    setBusy(true);
    setMsg('');
    try {
      const res = await apiRequest<{ message: string }>('/license/activate', {
        method: 'POST',
        body: JSON.stringify({
          serialKey: serial.trim(),
          deviceId: deviceId(),
          deviceName: 'Maktaba Portable',
        }),
      });
      setMsg(res.message || 'تم التفعيل');
      setSerial('');
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'فشل التفعيل');
    } finally {
      setBusy(false);
    }
  }

  async function sendTicket() {
    setBusy(true);
    setMsg('');
    try {
      await apiRequest('/support/tickets', {
        method: 'POST',
        body: JSON.stringify({ subject: subject.trim(), body: body.trim() }),
      });
      setSubject('');
      setBody('');
      setMsg('تم إرسال البلاغ');
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'فشل الإرسال');
    } finally {
      setBusy(false);
    }
  }

  async function downloadSupportReport() {
    setBusy(true);
    setMsg('');
    try {
      const data = await apiRequest<unknown>('/maintenance/support-report');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Maktaba-Support-Report-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMsg('تم تنزيل تقرير الدعم');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'تعذر إنشاء التقرير');
    } finally {
      setBusy(false);
    }
  }

  const statusLabel = !status
    ? '—'
    : status.activated
      ? 'مفعّل'
      : status.trialActive
        ? `تجربة (${status.daysLeft ?? '—'} يوم متبقي)`
        : status.trialExpired
          ? 'انتهت التجربة'
          : 'غير مفعّل';

  return (
    <div className="settings-stack">
      <section className="panel">
        <h3>ترخيص هذا الجهاز</h3>
        <p className="muted">النسخة المحمولة لجهاز واحد. المفاتيح من نوع MAK2 تصدر من البائع فقط.</p>
        {status && (
          <p>
            الحالة: <strong>{statusLabel}</strong>
            {status.activated ? ` · ${status.usedDevices}/${status.maxDevices || '—'}` : ''}
            {status.trialExpired && !status.activated ? ' — الكتابة متوقفة حتى التفعيل' : ''}
            {status.scheme ? ` · ${status.scheme}` : ''}
          </p>
        )}
        <div className="form-grid" style={{ maxWidth: 520 }}>
          <label>
            مفتاح الترخيص
            <input
              value={serial}
              onChange={(e) => setSerial(e.target.value)}
              placeholder="MAK2...."
              dir="ltr"
            />
          </label>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="primary-btn"
            disabled={busy || !serial.trim()}
            onClick={() => void activate()}
          >
            تفعيل
          </button>
          <button
            type="button"
            className="secondary-btn"
            disabled={busy}
            onClick={() => void downloadSupportReport()}
          >
            تنزيل تقرير الدعم
          </button>
        </div>
        <p className="muted" style={{ marginTop: 8 }}>
          لإصدار مفتاح عند البائع: <code dir="ltr">node tools/issue-license.js 1</code>
        </p>
      </section>

      <section className="panel">
        <h3>الدعم الفني</h3>
        {supportCfg?.whatsappUrl ? (
          <p>
            <a href={supportCfg.whatsappUrl} target="_blank" rel="noreferrer">
              تواصل واتساب
            </a>
          </p>
        ) : (
          <p className="muted">لم يُضبط رقم واتساب الدعم بعد.</p>
        )}
        <div className="form-grid">
          <label>
            عنوان البلاغ
            <input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </label>
          <label style={{ gridColumn: '1 / -1' }}>
            الوصف
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} />
          </label>
        </div>
        <button
          type="button"
          className="primary-btn"
          disabled={busy || !subject.trim() || !body.trim()}
          onClick={() => void sendTicket()}
        >
          إرسال بلاغ
        </button>
        {tickets.length > 0 && (
          <table className="data-table" style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th>العنوان</th>
                <th>الحالة</th>
                <th>التاريخ</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((t) => (
                <tr key={t.id}>
                  <td>{t.subject}</td>
                  <td>{t.status}</td>
                  <td>{new Date(t.createdAt).toLocaleString('en-GB')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      {msg ? <p className="purchase-notice">{msg}</p> : null}
    </div>
  );
}
