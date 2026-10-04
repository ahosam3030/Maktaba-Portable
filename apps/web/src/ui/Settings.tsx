import { useCallback, useEffect, useState } from 'react';
import {
  fetchInvoiceSettings,
  loadInvoiceSettings,
  resetInvoiceSettings,
  saveInvoiceSettings,
  type InvoiceSettings,
} from '../data/invoiceSettings';
import { db, type LocalOrganization } from '../data/db';
import {
  apiRequest,
  clearSession,
  getStoredOrganization,
  getStoredUser,
  hasPermission,
} from '../data/api';
import { AdminUsers } from './AdminUsers';
import { Inventory } from './Inventory';
import { loadSaleUnits, saveSaleUnits, resetSaleUnits, DEFAULT_SALE_UNITS } from '../data/units';
import { IconUsers, IconPrint, IconSettings, IconPackage, IconLock, IconRefresh, IconBoxes } from './Icons';

type Tab = 'invoice' | 'users' | 'products' | 'libraries' | 'danger';

export function Settings() {
  const sessionUser = getStoredUser();
  const sessionOrg = getStoredOrganization();
  const isOwner = sessionUser?.role === 'OWNER';
  const canProducts = isOwner || hasPermission(sessionUser, 'inventory');

  const [tab, setTab] = useState<Tab>(isOwner ? 'users' : canProducts ? 'products' : 'invoice');
  const [form, setForm] = useState<InvoiceSettings>(() => loadInvoiceSettings());
  const [tagsText, setTagsText] = useState(() => loadInvoiceSettings().serviceTags.join('\n'));
  const [notice, setNotice] = useState('');
  const [organizations, setOrganizations] = useState<LocalOrganization[]>([]);
  const [confirmSlug, setConfirmSlug] = useState('');
  const [busy, setBusy] = useState(false);
  const [unitsText, setUnitsText] = useState(() => loadSaleUnits().join('\n'));
  const [newUnit, setNewUnit] = useState('');

  const refreshLocal = useCallback(async () => {
    setOrganizations(await db.organizations.orderBy('updatedAt').reverse().toArray());
  }, []);

  useEffect(() => {
    void refreshLocal();
    void fetchInvoiceSettings().then((s) => {
      setForm(s);
      setTagsText(s.serviceTags.join('\n'));
    });
  }, [refreshLocal]);

  function update<K extends keyof InvoiceSettings>(key: K, value: InvoiceSettings[K]) {
    setForm((old) => ({ ...old, [key]: value }));
  }

  async function handleBackupExport() {
    if (!isOwner) return;
    setBusy(true);
    setNotice('');
    try {
      const data = await apiRequest<unknown>('/backup/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `maktaba-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setNotice('تم تنزيل النسخة الاحتياطية JSON.');
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'فشل التصدير');
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveInvoice() {

    const tags = tagsText
      .split(/\n|,/)
      .map((t) => t.trim())
      .filter(Boolean);
    const next: InvoiceSettings = { ...form, serviceTags: tags };
    setBusy(true);
    setNotice('');
    try {
      const saved = await saveInvoiceSettings(next);
      setForm(saved);
      setTagsText(saved.serviceTags.join('\n'));
      setNotice('تم حفظ بيانات الطباعة والإيصالات على الخادم (ومزامنتها لهذا الجهاز).');
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'تعذر حفظ الإعدادات على الخادم.');
    } finally {
      setBusy(false);
    }
  }

  async function handleResetInvoice() {
    if (!confirm('استعادة القيم الافتراضية لبيانات الطباعة على الخادم؟')) return;
    setBusy(true);
    setNotice('');
    try {
      const defaults = await resetInvoiceSettings();
      setForm(defaults);
      setTagsText(defaults.serviceTags.join('\n'));
      setNotice('تمت استعادة القيم الافتراضية على الخادم.');
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'تعذر الاستعادة.');
    } finally {
      setBusy(false);
    }
  }

  async function removeLocalOrg(org: LocalOrganization) {
    const isCurrent = sessionOrg?.slug === org.slug;
    if (
      !confirm(
        isCurrent
          ? `إزالة «${org.name}» من قائمة هذا الجهاز؟\nلن تُحذف من الخادم، وستبقى مسجّل الدخول حتى تضغط تسجيل الخروج.`
          : `إزالة «${org.name}» من قائمة هذا الجهاز فقط؟ (لا يحذف بيانات الخادم)`,
      )
    ) {
      return;
    }
    await db.organizations.delete(org.id);
    await refreshLocal();
    setNotice(`تمت إزالة «${org.name}» من قائمة الجهاز.`);
  }

  async function deleteServerOrganization() {
    if (!isOwner || !sessionOrg) return;
    if (confirmSlug.trim() !== sessionOrg.slug) {
      setNotice(`للتأكيد اكتب المعرّف بالضبط: ${sessionOrg.slug}`);
      return;
    }
    if (
      !confirm(
        `تحذير نهائي: سيتم حذف «${sessionOrg.name}» من الخادم مع كل الفواتير والمخزون والمبيعات والمستخدمين. لا يمكن التراجع.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setNotice('');
    try {
      await apiRequest('/auth/organization', {
        method: 'DELETE',
        body: JSON.stringify({ confirmSlug: confirmSlug.trim() }),
      });
      const local = await db.organizations.where('slug').equals(sessionOrg.slug).toArray();
      for (const row of local) {
        await db.organizations.delete(row.id);
      }
      clearSession();
      window.location.reload();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'تعذر حذف المكتبة من الخادم.');
    } finally {
      setBusy(false);
    }
  }

  const tabs: Array<{ id: Tab; label: string; desc: string; show: boolean; Icon: typeof IconUsers }> = [
    { id: 'users', label: 'الحسابات', desc: 'مستخدمون وصلاحيات', show: isOwner, Icon: IconUsers },
    { id: 'products', label: 'المنتجات', desc: 'أصناف وباركود وأسعار', show: canProducts, Icon: IconBoxes },
    { id: 'invoice', label: 'الطباعة', desc: 'بيانات الإيصالات', show: true, Icon: IconPrint },
    { id: 'libraries', label: 'هذا الجهاز', desc: 'المكتبة والذاكرة', show: true, Icon: IconPackage },
    { id: 'danger', label: 'حذف نهائي', desc: 'للمالك فقط', show: isOwner, Icon: IconLock },
  ];

  function switchTab(id: Tab) {
    setTab(id);
    setNotice('');
  }

  function addUnitFromInput() {
    const n = newUnit.trim();
    if (!n) {
      setNotice('اكتب اسم الوحدة أولًا.');
      return;
    }
    const list = unitsText.split(/\n/).map((x) => x.trim()).filter(Boolean);
    if (list.includes(n)) {
      setNotice(`«${n}» موجودة بالفعل.`);
      setNewUnit('');
      return;
    }
    const next = [...list, n];
    setUnitsText(next.join('\n'));
    saveSaleUnits(next);
    setNewUnit('');
    setNotice(`تمت إضافة «${n}».`);
  }

  function removeUnit(name: string) {
    const next = unitsText
      .split(/\n/)
      .map((x) => x.trim())
      .filter((x) => x && x !== name);
    setUnitsText(next.join('\n'));
    saveSaleUnits(next);
    setNotice(`تم حذف «${name}».`);
  }

  const unitList = unitsText.split(/\n/).map((x) => x.trim()).filter(Boolean);

  const roleLabel =
    sessionUser?.role === 'OWNER' ? 'مالك' : sessionUser?.role === 'ADMIN' ? 'أدمن' : 'مستخدم';

  return (
    <div className="purchases-page settings-page">
      <div className="purchase-title">
        <div>
          <span className="eyebrow">النظام</span>
          <h1>الإعدادات</h1>
          <p>
            {sessionOrg ? sessionOrg.name : 'إعدادات النظام'}
            {sessionUser ? ` · ${sessionUser.fullName}` : ''}
          </p>
        </div>
        {tab === 'libraries' && (
          <button className="secondary-btn" type="button" onClick={() => void refreshLocal()}>
            <IconRefresh size={16} />
            <span>تحديث</span>
          </button>
        )}
      </div>

      {(sessionUser || sessionOrg) && (
        <div className="settings-identity">
          <div className="settings-identity-mark">
            <IconSettings size={22} />
          </div>
          <div className="settings-identity-body">
            <strong>{sessionUser?.fullName || '—'}</strong>
            <span>
              {sessionOrg?.name || 'بدون مكتبة'}
              {sessionUser ? ` · ${roleLabel}` : ''}
            </span>
          </div>
          {sessionUser && <span className="role-pill settings-role">{roleLabel}</span>}
        </div>
      )}

      {notice && (
        <div className="purchase-notice" role="status">
          {notice}
        </div>
      )}

      <div className="rpt-tabs settings-nav" role="tablist">
        {tabs
          .filter((t) => t.show)
          .map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={tab === t.id ? 'active' : ''}
              onClick={() => switchTab(t.id)}
            >
              <t.Icon size={20} className="rpt-tab-icon" />
              <div className="rpt-tab-text">
                <strong>{t.label}</strong>
                <span>{t.desc}</span>
              </div>
            </button>
          ))}
      </div>

      {tab === 'users' && isOwner && (
        <div className="settings-tab-panel">
          <AdminUsers embedded />
        </div>
      )}

      {tab === 'products' && canProducts && (
        <div className="settings-tab-panel products-suite">
          <section className="purchase-panel units-panel">
            <div className="units-hero">
              <div className="units-hero-icon" aria-hidden>
                <IconPackage size={22} />
              </div>
              <div className="units-hero-text">
                <h2>وحدات القياس</h2>
                <p>تظهر تلقائيًا في قائمة «الوحدة» بفاتورة البيع. أضف أو احذف في ثوانٍ.</p>
              </div>
              <div className="units-hero-badge">
                {unitList.length}
                <span>وحدة</span>
              </div>
            </div>

            <div className="units-add-card">
              <label className="units-add-label" htmlFor="new-unit-input">
                وحدة جديدة
              </label>
              <div className="units-add-row">
                <input
                  id="new-unit-input"
                  className="units-add-input"
                  value={newUnit}
                  onChange={(e) => setNewUnit(e.target.value)}
                  placeholder="مثال: كورة · متر · ملف · كيلو"
                  maxLength={40}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const n = newUnit.trim();
                      if (!n) return;
                      const list = unitsText.split(/\n/).map((x) => x.trim()).filter(Boolean);
                      if (list.includes(n)) {
                        setNotice(`«${n}» موجودة بالفعل.`);
                        setNewUnit('');
                        return;
                      }
                      const next = [...list, n];
                      setUnitsText(next.join('\n'));
                      saveSaleUnits(next);
                      setNewUnit('');
                      setNotice(`تمت إضافة «${n}».`);
                    }
                  }}
                />
                <button
                  className="primary-btn units-add-btn"
                  type="button"
                  onClick={() => {
                    const n = newUnit.trim();
                    if (!n) {
                      setNotice('اكتب اسم الوحدة أولًا.');
                      return;
                    }
                    const list = unitsText.split(/\n/).map((x) => x.trim()).filter(Boolean);
                    if (list.includes(n)) {
                      setNotice(`«${n}» موجودة بالفعل.`);
                      setNewUnit('');
                      return;
                    }
                    const next = [...list, n];
                    setUnitsText(next.join('\n'));
                    saveSaleUnits(next);
                    setNewUnit('');
                    setNotice(`تمت إضافة «${n}».`);
                  }}
                >
                  + إضافة
                </button>
              </div>
              <p className="units-hint">اضغط Enter للإضافة السريعة · الحفظ فوري على هذا الجهاز</p>
            </div>

            <div className="units-list-head">
              <strong>الوحدات الحالية</strong>
              <button
                className="ghost-btn"
                type="button"
                onClick={() => {
                  if (!confirm('استعادة الوحدات الافتراضية؟')) return;
                  const list = resetSaleUnits();
                  setUnitsText(list.join('\n'));
                  setNotice('تمت استعادة الوحدات الافتراضية.');
                }}
              >
                استعادة الافتراضي
              </button>
            </div>

            <div className="units-chips" role="list">
              {unitList.length === 0 ? (
                <div className="units-empty">
                  <span className="units-empty-icon">＋</span>
                  <strong>لا وحدات بعد</strong>
                  <span>اكتب اسم الوحدة أعلاه ثم اضغط إضافة</span>
                </div>
              ) : (
                unitList.map((u) => (
                  <span key={u} className="unit-chip" role="listitem">
                    <span className="unit-chip-dot" aria-hidden />
                    <span className="unit-chip-label">{u}</span>
                    <button
                      type="button"
                      className="unit-chip-remove"
                      title={`حذف ${u}`}
                      aria-label={`حذف ${u}`}
                      onClick={() => removeUnit(u)}
                    >
                      ×
                    </button>
                  </span>
                ))
              )}
            </div>
          </section>
          <Inventory embedded />
        </div>
      )}

      {tab === 'invoice' && (
        <div className="settings-tab-panel">
          <section className="purchase-panel pur-invoice">
            <div className="panel-heading">
              <div>
                <h2>بيانات الطباعة والإيصالات</h2>
                <p>تظهر على فواتير البيع والإيصالات. تُحفظ في هذا المتصفح فقط — عند تغيير الجهاز أعد ضبطها هنا.</p>
              </div>
            </div>

            <div className="pur-section">
              <div className="pur-section-title">هوية المركز</div>
              <div className="settings-form-grid">
                <label className="pur-field">
                  عنوان المركز
                  <input
                    value={form.brandTitle}
                    onChange={(e) => update('brandTitle', e.target.value)}
                    placeholder="اسم يظهر أعلى الفاتورة"
                  />
                </label>
                <label className="pur-field">
                  السطر التوضيحي
                  <input
                    value={form.brandSubtitle}
                    onChange={(e) => update('brandSubtitle', e.target.value)}
                    placeholder="نشاط المركز باختصار"
                  />
                </label>
                <label className="pur-field">
                  تليفون / واتساب
                  <input
                    value={form.phone}
                    onChange={(e) => update('phone', e.target.value)}
                    dir="ltr"
                    placeholder="01xxxxxxxxx"
                  />
                </label>
                <label className="pur-field">
                  العنوان
                  <input
                    value={form.address}
                    onChange={(e) => update('address', e.target.value)}
                    placeholder="العنوان الظاهر على الفاتورة"
                  />
                </label>
              </div>
            </div>

            <div className="pur-section">
              <div className="pur-section-title">شكل المستند</div>
              <div className="settings-form-grid">
                <label className="pur-field">
                  عنوان المستند
                  <input
                    value={form.invoiceTitle}
                    onChange={(e) => update('invoiceTitle', e.target.value)}
                    placeholder="مثل: فاتورة مبيعات"
                  />
                </label>
                <label className="pur-field">
                  نص العلامة المائية
                  <input
                    value={form.watermarkText}
                    onChange={(e) => update('watermarkText', e.target.value)}
                    placeholder="نص خفيف خلف الفاتورة"
                  />
                </label>
                <label className="pur-field" style={{ gridColumn: '1 / -1' }}>
                  تذييل المستند
                  <input
                    value={form.footerText}
                    onChange={(e) => update('footerText', e.target.value)}
                    placeholder="شكرًا لثقتكم بنا"
                  />
                </label>
                <label className="pur-field">
                  حجم ورقة الفاتورة (حراري / A4)
                  <select
                    value={form.paperSize || 'thermal_80'}
                    onChange={(e) =>
                      update('paperSize', e.target.value as InvoiceSettings['paperSize'])
                    }
                  >
                    <option value="thermal_58">حراري 58 مم</option>
                    <option value="thermal_80">حراري 80 مم</option>
                    <option value="a4">A4 عادي</option>
                  </select>
                </label>
                <label className="pur-field" style={{ gridColumn: '1 / -1' }}>
                  وسوم الخدمات (سطر لكل وسم)
                  <textarea
                    rows={4}
                    value={tagsText}
                    onChange={(e) => setTagsText(e.target.value)}
                    placeholder={'خدمات علمية\nتصوير وطباعة'}
                    className="settings-textarea"
                  />
                </label>
              </div>
            </div>

            <div className="pur-footer-actions" style={{ justifyContent: 'flex-start', marginTop: 8 }}>
              <button className="primary-btn" type="button" onClick={handleSaveInvoice}>
                حفظ بيانات الطباعة
              </button>
              <button className="secondary-btn" type="button" onClick={handleResetInvoice}>
                استعادة الافتراضي
              </button>
              {isOwner && (
                <button className="secondary-btn" type="button" disabled={busy} onClick={() => void handleBackupExport()}>
                  تنزيل نسخة احتياطية
                </button>
              )}
            </div>
          </section>
        </div>
      )}

      {tab === 'libraries' && (
        <div className="settings-tab-panel">
          <section className="purchase-panel">
            <div className="panel-heading">
              <div>
                <h2>مكتبة الحساب (على الخادم)</h2>
                <p>كل مستخدم مرتبط بمكتبة واحدة. الفواتير والمخزون والمستخدمون تابعون لها.</p>
              </div>
            </div>
            {sessionOrg ? (
              <div className="settings-org-card">
                <div className="settings-org-main">
                  <strong>{sessionOrg.name}</strong>
                  <span className="tag synced">مرتبطة بالحساب</span>
                </div>
                <div className="settings-org-grid">
                  <div>
                    <span>المعرّف</span>
                    <b dir="ltr">{sessionOrg.slug}</b>
                  </div>
                  <div>
                    <span>الهاتف</span>
                    <b dir="ltr">{sessionOrg.phone || '—'}</b>
                  </div>
                  <div>
                    <span>الحساب</span>
                    <b>{sessionUser?.fullName || '—'}</b>
                  </div>
                  <div>
                    <span>الدور</span>
                    <b>{roleLabel}</b>
                  </div>
                </div>
              </div>
            ) : (
              <div className="empty-state">لا توجد جلسة نشطة. سجّل الدخول أولًا.</div>
            )}
          </section>

          <section className="purchase-panel">
            <div className="panel-heading">
              <div>
                <h2>ذاكرة المتصفح</h2>
                <p>
                  قائمة مساعدة على هذا الجهاز فقط — ليست مكتبات منفصلة. الحذف من هنا لا يمس بيانات
                  الخادم.
                </p>
              </div>
              <span className="count-badge">{organizations.length}</span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>الاسم</th>
                    <th>المعرّف</th>
                    <th>الهاتف</th>
                    <th>آخر تحديث</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {organizations.map((org) => {
                    const isCurrent = sessionOrg?.slug === org.slug;
                    return (
                      <tr key={org.id}>
                        <td>
                          {org.name}
                          {isCurrent && (
                            <span className="tag synced" style={{ marginInlineStart: 8 }}>
                              الجلسة الحالية
                            </span>
                          )}
                        </td>
                        <td dir="ltr">{org.slug}</td>
                        <td dir="ltr">{org.phone || '—'}</td>
                        <td>{org.updatedAt ? new Date(org.updatedAt).toLocaleString('en-GB') : '—'}</td>
                        <td>
                          <button
                            className="danger-outline-btn small"
                            type="button"
                            onClick={() => void removeLocalOrg(org)}
                          >
                            إزالة من الجهاز
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {organizations.length === 0 && (
                <div className="empty-state">لا توجد بيانات محلية محفوظة على هذا المتصفح.</div>
              )}
            </div>
          </section>
        </div>
      )}

      {tab === 'danger' && isOwner && sessionOrg && (
        <div className="settings-tab-panel">
          <section className="purchase-panel danger-zone">
            <div className="panel-heading">
              <div>
                <h2>حذف المكتبة نهائيًا من الخادم</h2>
                <p>
                  للمالك فقط. يحذف المكتبة <strong>{sessionOrg.name}</strong> مع كل الفواتير
                  والمخزون والمبيعات والمستخدمين. لا يمكن التراجع.
                </p>
              </div>
            </div>
            <div className="settings-danger-box">
              <label className="pur-field">
                اكتب المعرّف للتأكيد
                <input
                  value={confirmSlug}
                  onChange={(e) => setConfirmSlug(e.target.value)}
                  placeholder={sessionOrg.slug}
                  dir="ltr"
                  autoComplete="off"
                />
              </label>
              <p className="settings-danger-hint">
                المعرّف المطلوب: <code dir="ltr">{sessionOrg.slug}</code>
              </p>
              <button
                className="danger-btn"
                type="button"
                disabled={busy || confirmSlug.trim() !== sessionOrg.slug}
                onClick={() => void deleteServerOrganization()}
              >
                {busy ? 'جارٍ الحذف...' : 'حذف المكتبة نهائيًا'}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
