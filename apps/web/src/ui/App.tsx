import { useEffect, useState } from 'react';
import { startSyncWatchers, processSyncQueue, subscribeSyncQueue, countPending } from '../data/sync';
import { fetchInvoiceSettings } from '../data/invoiceSettings';
import { db, type LocalOrganization } from '../data/db';
import {
  apiHealth,
  apiRequest,
  registerOrganization,
  login,
  fetchSetupStatus,
  saveSession,
  clearSession,
  getToken,
  getStoredUser,
  getStoredOrganization,
  hasPermission,
} from '../data/api';
import { Purchases } from './Purchases';
import { Inventory } from './Inventory';
import { Sales } from './Sales';
import { Credit } from './Credit';
import { Printing } from './Printing';
import { Accounting } from './Accounting';
import { Settings } from './Settings';
import { Labels } from './Labels';
import { DayClose } from './DayClose';
import { Reports } from './Reports';
import { SectionIcon, IconLogout, IconLock, BrandLogo, WelcomeArt, type SectionIconKey } from './Icons';

function isStrongPassword(password: string): boolean {
  if (!password) return false;
  if (!/[A-Z]/.test(password)) return false;
  if (!/[a-z]/.test(password)) return false;
  if (!/[0-9]/.test(password)) return false;
  if (!/[^A-Za-z0-9]/.test(password)) return false;
  return true;
}

type ConnectionState = 'checking' | 'online' | 'offline';
type AuthMode = 'login' | 'register';

export function App() {
  const [lowStockCount, setLowStockCount] = useState(0);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [connection, setConnection] = useState<ConnectionState>(navigator.onLine ? 'checking' : 'offline');
  const [pendingSync, setPendingSync] = useState(0);
  const [syncBusy, setSyncBusy] = useState(false);
  const [apiStatus, setApiStatus] = useState('جارٍ الفحص');
  const [organizations, setOrganizations] = useState<LocalOrganization[]>([]);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [phone, setPhone] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [sessionUser, setSessionUser] = useState(getStoredUser());
  const [sessionOrg, setSessionOrg] = useState(getStoredOrganization());
  const [activeSection, setActiveSection] = useState<
    'dashboard' | 'purchases' | 'inventory' | 'sales' | 'credit' | 'printing' | 'accounting' | 'reports' | 'settings' | 'labels' | 'dayclose'
  >('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try {
      const v = localStorage.getItem('maktaba_sidebar_open');
      if (v === '0') return false;
      if (v === '1') return true;
    } catch { /* ignore */ }
    return true;
  });
  function toggleSidebar() {
    setSidebarOpen((open) => {
      const next = !open;
      try { localStorage.setItem('maktaba_sidebar_open', next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  }
  const [confirmSlug, setConfirmSlug] = useState('');
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [deleteEmail, setDeleteEmail] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteSlug, setDeleteSlug] = useState('');

  const isLoggedIn = Boolean(getToken() && sessionUser);


  async function refreshLocal() {
    setOrganizations(await db.organizations.orderBy('updatedAt').reverse().toArray());
  }

  async function checkApi() {
    if (!navigator.onLine) {
      setConnection('offline');
      setApiStatus('غير متصل');
      return;
    }
    try {
      await apiHealth();
      setConnection('online');
      setApiStatus('متصل');
    } catch {
      setConnection('offline');
      setApiStatus('الخادم غير متاح');
    }
  }

  
  useEffect(() => {
    if (!getToken()) {
      setLowStockCount(0);
      return;
    }
    let cancelled = false;
    const loadAlerts = () => {
      apiRequest<{ count: number }>('/inventory/alerts/low-stock')
        .then((d) => { if (!cancelled) setLowStockCount(d.count || 0); })
        .catch(() => { if (!cancelled) setLowStockCount(0); });
    };
    loadAlerts();
    const id = window.setInterval(loadAlerts, 120000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [connection]);

  useEffect(() => {
    fetchSetupStatus()
      .then((s) => setNeedsSetup(!!s.needsSetup))
      .catch(() => setNeedsSetup(false));
  }, [connection, apiStatus]);


useEffect(() => {
    void refreshLocal();
    void checkApi();
    const unsubSync = subscribeSyncQueue(setPendingSync);
    const stopWatchers = startSyncWatchers();
    const onOnline = () => {
      void checkApi();
      void processSyncQueue();
    };
    const onOffline = () => {
      setConnection('offline');
      setApiStatus('غير متصل');
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      unsubSync();
      stopWatchers();
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  async function handleRegister() {
    if (!name.trim() || !slug.trim() || !ownerName.trim() || !email.trim()) {
      setMessage('أكمل كل الحقول المطلوبة.');
      return;
    }
    if (!isStrongPassword(password)) {
      setMessage('كلمة المرور يجب أن تشمل حرفًا كبيرًا وصغيرًا ورقمًا ورمزًا.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const result = await registerOrganization({
        organizationName: name.trim(),
        slug: slug.trim().toLowerCase(),
        phone: phone.trim() || undefined,
        fullName: ownerName.trim(),
        email: email.trim(),
        password,
      });
      saveSession(result);
      void fetchInvoiceSettings();
      setSessionUser(result.user);
      setSessionOrg(result.organization);
      await db.organizations.put({
        id: result.organization.id,
        name: result.organization.name,
        slug: result.organization.slug,
        phone: result.organization.phone || phone.trim() || undefined,
        localOnly: false,
        linkedUserId: result.user.id,
        linkedUserEmail: result.user.email,
        updatedAt: new Date().toISOString(),
      });
      await refreshLocal();
      setNeedsSetup(false);
      setMessage(`تم إعداد البرنامج — مرحبًا بك في «${result.organization.name}»`);
      setPassword('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'تعذر إنشاء الحساب.');
    } finally {
      setBusy(false);
    }
  }

  async function handleLogin() {
    if (!loginEmail.trim() || !loginPassword) {
      setMessage('أدخل البريد وكلمة المرور.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const result = await login(loginEmail.trim(), loginPassword);
      saveSession(result);
      void fetchInvoiceSettings();
      setSessionUser(result.user);
      setSessionOrg(result.organization);
      await db.organizations.put({
        id: result.organization.id,
        name: result.organization.name,
        slug: result.organization.slug,
        phone: result.organization.phone || undefined,
        localOnly: false,
        linkedUserId: result.user.id,
        linkedUserEmail: result.user.email,
        updatedAt: new Date().toISOString(),
      });
      await refreshLocal();
      setMessage(`مرحبًا ${result.user.fullName} — مكتبة «${result.organization.name}»`);
      setLoginPassword('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'تعذر تسجيل الدخول.');
    } finally {
      setBusy(false);
    }
  }

  function handleLogout() {
    clearSession();
    setSessionUser(null);
    setSessionOrg(null);
    setMessage('تم تسجيل الخروج.');
    setActiveSection('dashboard');
  }

  async function removeLocalOrg(org: LocalOrganization) {
    if (!confirm(`إزالة «${org.name}» من قائمة هذا الجهاز فقط؟\n(لا يحذف بيانات الخادم)`)) return;
    await db.organizations.delete(org.id);
    await refreshLocal();
    setMessage(`تمت إزالة «${org.name}» من الجهاز.`);
  }

  async function deleteAccountFromLogin() {
    if (!deleteEmail.trim() || !deletePassword || !deleteSlug.trim()) {
      setMessage('أدخل البريد وكلمة المرور ومعرّف المكتبة.');
      return;
    }
    if (
      !confirm(
        `سيتم حذف المكتبة ذات المعرّف «${deleteSlug.trim()}» وكل بياناتها نهائيًا من الخادم. هل أنت متأكد؟`,
      )
    ) {
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const res = await apiRequest<{ name: string; deleted: string }>('/auth/delete-organization', {
        method: 'POST',
        body: JSON.stringify({
          email: deleteEmail.trim(),
          password: deletePassword,
          confirmSlug: deleteSlug.trim(),
        }),
      });
      // إزالة من القائمة المحلية إن وُجدت
      const local = await db.organizations.where('slug').equals(res.deleted).toArray();
      for (const row of local) await db.organizations.delete(row.id);
      await refreshLocal();
      setDeletePassword('');
      setDeleteSlug('');
      setShowDeleteAccount(false);
      setMessage(`تم حذف مكتبة «${res.name}» من الخادم نهائيًا.`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'تعذر حذف الحساب.');
    } finally {
      setBusy(false);
    }
  }

  async function deleteServerOrganization() {
    if (!sessionOrg || sessionUser?.role !== 'OWNER') {
      setMessage('حذف المكتبة من الخادم متاح للمالك فقط.');
      return;
    }
    if (confirmSlug.trim() !== sessionOrg.slug) {
      setMessage(`للتأكيد اكتب المعرّف: ${sessionOrg.slug}`);
      return;
    }
    if (
      !confirm(
        `تحذير نهائي: سيتم حذف مكتبة «${sessionOrg.name}» وكل فواتيرها ومخزونها ومبيعاتها ومستخدمينها نهائيًا. هل أنت متأكد؟`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await apiRequest('/auth/organization', {
        method: 'DELETE',
        body: JSON.stringify({ confirmSlug: confirmSlug.trim() }),
      });
      await db.organizations.delete(sessionOrg.id);
      clearSession();
      setSessionUser(null);
      setSessionOrg(null);
      setConfirmSlug('');
      await refreshLocal();
      setMessage('تم حذف المكتبة من الخادم نهائيًا.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'تعذر حذف المكتبة.');
    } finally {
      setBusy(false);
    }
  }

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? 'صباح الخير' : hour < 18 ? 'مساء الخير' : 'مساء النور';

  const roleLabel =
    sessionUser?.role === 'OWNER' ? 'مالك' : sessionUser?.role === 'ADMIN' ? 'أدمن' : 'مستخدم';

  const quickLinks: Array<{
    key: typeof activeSection;
    icon: SectionIconKey;
    label: string;
    desc: string;
    show: boolean;
  }> = [
    { key: 'purchases', icon: 'purchases', label: 'المشتريات', desc: 'فواتير الوارد والموردين', show: hasPermission(sessionUser, 'purchases') },
    { key: 'sales', icon: 'sales', label: 'المبيعات', desc: 'نقطة البيع والفواتير', show: hasPermission(sessionUser, 'sales') },
    { key: 'inventory', icon: 'inventory', label: 'المخزون', desc: 'الأرصدة والتسويات', show: hasPermission(sessionUser, 'inventory') },
    { key: 'accounting', icon: 'accounting', label: 'الخزينة', desc: 'الوارد والمنصرف', show: hasPermission(sessionUser, 'accounting') },
    { key: 'reports', icon: 'reports', label: 'التقارير', desc: 'الأرباح ورأس المال', show: hasPermission(sessionUser, 'reports') },
    { key: 'printing', icon: 'printing', label: 'الخدمات', desc: 'الخدمات والإيصالات', show: hasPermission(sessionUser, 'printing') },
    { key: 'labels', icon: 'inventory', label: 'ملصقات', desc: 'طباعة باركود', show: hasPermission(sessionUser, 'inventory') },
    { key: 'dayclose', icon: 'accounting', label: 'إغلاق يومية', desc: 'الدرج والعد', show: hasPermission(sessionUser, 'accounting') },
    { key: 'settings', icon: 'settings', label: 'الإعدادات', desc: 'حسابات، طباعة، الجهاز', show: isLoggedIn },
  ];


  if (!isLoggedIn) {
    return (
      <div className="product-login">
        <div className="product-login-bg" aria-hidden />
        <header className="product-login-header">
          <div className="product-brand">
            <span className="product-brand-mark" aria-hidden>م</span>
            <div>
              <strong>Maktaba</strong>
              <span>نظام إدارة مراكز الخدمات والمكتبات</span>
            </div>
          </div>
          <span className="product-version">Portable v1.3.1</span>
        </header>
        <div className="product-login-body">
          <section className="product-login-pitch">
            <p className="product-eyebrow">منتج تشغيلي للمراكز</p>
            <h1>إدارة المشتريات والمبيعات والخدمات في منصة واحدة</h1>
            <p className="product-lead">
              صُمّم لمراكز الخدمات والمكتبات: مخزون، فواتير، خزينة، تقارير، وصلاحيات للموظفين.
            </p>
            <ul className="product-points">
              <li>
                <strong>عمليات مترابطة</strong>
                <span>وارد ← مخزون ← بيع ← خزينة</span>
              </li>
              <li>
                <strong>خدمات وإيصالات</strong>
                <span>طباعة وتصوير وخدمات المركز</span>
              </li>
              <li>
                <strong>صلاحيات واضحة</strong>
                <span>المالك يضيف الموظفين من الإعدادات</span>
              </li>
            </ul>
          </section>
          <section className="product-login-card">
            {needsSetup ? (
              <>
                <div className="product-login-card-head">
                  <h2>إعداد البرنامج لأول مرة</h2>
                  <p>أنشئ حساب المالك — مرة واحدة فقط على هذا الجهاز</p>
                </div>
                <div className="form-grid auth-form">
                  <label>
                    اسم المركز / المكتبة
                    <input value={name} onChange={(e) => setName(e.target.value)} placeholder="مركز الخدمات" />
                  </label>
                  <label>
                    المعرّف المختصر (إنجليزي)
                    <input value={slug} onChange={(e) => setSlug(e.target.value)} dir="ltr" placeholder="my-center" />
                  </label>
                  <label>
                    هاتف (اختياري)
                    <input value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" />
                  </label>
                  <label>
                    اسم المالك
                    <input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} />
                  </label>
                  <label>
                    البريد الإلكتروني
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" />
                  </label>
                  <label>
                    كلمة المرور (كبير+صغير+رقم+رمز)
                    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} dir="ltr" />
                  </label>
                </div>
                <button className="primary-btn product-login-submit" type="button" onClick={() => void handleRegister()} disabled={busy}>
                  {busy ? 'جارٍ الإعداد...' : 'بدء استخدام البرنامج'}
                </button>
              </>
            ) : (
              <>
                <div className="product-login-card-head">
                  <h2>تسجيل الدخول</h2>
                  <p>استخدم بريد وكلمة مرور المالك أو الموظف</p>
                </div>
                <div className="form-grid auth-form">
                  <label>
                    البريد الإلكتروني
                    <input type="email" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} dir="ltr" placeholder="name@example.com" autoComplete="username" />
                  </label>
                  <label>
                    كلمة المرور
                    <input type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} dir="ltr" autoComplete="current-password" onKeyDown={(e) => { if (e.key === 'Enter') void handleLogin(); }} />
                  </label>
                </div>
                <button className="primary-btn product-login-submit" type="button" onClick={() => void handleLogin()} disabled={busy}>
                  {busy ? 'جارٍ الدخول...' : 'دخول إلى النظام'}
                </button>
              </>
            )}
            {message ? (
              <p className={'feedback product-login-msg' + (/فشل|غير|خطأ|غير صحيحة/i.test(message) ? ' is-error' : '')} role="status">
                {message}
              </p>
            ) : null}
            <p className="product-login-footnote">
              {needsSetup
                ? 'بعد الإعداد لن تظهر هذه الشاشة مرة أخرى. احفظ بريدك وكلمة المرور.'
                : 'حسابات الموظفين يُنشئها المالك من الإعدادات بعد الدخول.'}
            </p>
          </section>
        </div>
        <footer className="product-login-footer">
          <span>© Maktaba — للاستخدام الداخلي للمركز</span>
        </footer>
      </div>
    );
  }

  return (
    <>
    <div
      className={`app-top-progress${connection === 'checking' ? ' is-active' : ''}`}
      aria-hidden
    />
    <div className={`app-shell${sidebarOpen ? "" : " app-shell--sidebar-collapsed"}`}>
      <aside className={`sidebar${sidebarOpen ? "" : " sidebar--collapsed"}`} aria-hidden={!sidebarOpen}>
        <div className="brand">
          <BrandLogo size={46} className="brand-logo" />
          <div className="brand-copy">
            <strong>مكتبة</strong>
            <span>إدارة وتشغيل</span>
          </div>
        </div>
        <nav className="side-nav">
          <div className="nav-group-label">نظرة عامة</div>
          <button type="button" tabIndex={-1} className={activeSection === 'dashboard' ? 'active' : ''} onClick={() => setActiveSection('dashboard')}>
            <SectionIcon name="dashboard" className="nav-icon" />
            <span>الرئيسية</span>
          </button>
          <div className="nav-group-label">العمليات</div>
          {hasPermission(sessionUser, 'purchases') && (
            <button type="button" tabIndex={-1} className={activeSection === 'purchases' ? 'active' : ''} onClick={() => setActiveSection('purchases')}>
              <SectionIcon name="purchases" className="nav-icon" /><span>المشتريات</span>
            </button>
          )}
          {hasPermission(sessionUser, 'sales') && (
            <button type="button" tabIndex={-1} className={activeSection === 'sales' ? 'active' : ''} onClick={() => setActiveSection('sales')}>
              <SectionIcon name="sales" className="nav-icon" /><span>المبيعات</span>
            </button>
            <button type="button" tabIndex={-1} className={activeSection === 'credit' ? 'active' : ''} onClick={() => setActiveSection('credit')}>
              <SectionIcon name="sales" className="nav-icon" /><span>الآجل</span>
            </button>
          )}
          {hasPermission(sessionUser, 'inventory') && (
            <button type="button" tabIndex={-1} className={activeSection === 'inventory' ? 'active' : ''} onClick={() => setActiveSection('inventory')}>
              <SectionIcon name="inventory" className="nav-icon" /><span>المخزون</span>
            </button>
          )}
          {hasPermission(sessionUser, 'inventory') && (
            <button type="button" tabIndex={-1} className={activeSection === 'labels' ? 'active' : ''} onClick={() => setActiveSection('labels')}>
              <SectionIcon name="inventory" className="nav-icon" /><span>ملصقات</span>
            </button>
          )}
          {hasPermission(sessionUser, 'accounting') && (
            <button type="button" tabIndex={-1} className={activeSection === 'dayclose' ? 'active' : ''} onClick={() => setActiveSection('dayclose')}>
              <SectionIcon name="accounting" className="nav-icon" /><span>إغلاق يومية</span>
            </button>
          )}
          {hasPermission(sessionUser, 'printing') && (
            <button type="button" tabIndex={-1} className={activeSection === 'printing' ? 'active' : ''} onClick={() => setActiveSection('printing')}>
              <SectionIcon name="printing" className="nav-icon" /><span>الخدمات</span>
            </button>
          )}
          <div className="nav-group-label">المالية</div>
          {hasPermission(sessionUser, 'accounting') && (
            <button type="button" tabIndex={-1} className={activeSection === 'accounting' ? 'active' : ''} onClick={() => setActiveSection('accounting')}>
              <SectionIcon name="accounting" className="nav-icon" /><span>الخزينة</span>
            </button>
          )}
          {hasPermission(sessionUser, 'reports') && (
            <button type="button" tabIndex={-1} className={activeSection === 'reports' ? 'active' : ''} onClick={() => setActiveSection('reports')}>
              <SectionIcon name="reports" className="nav-icon" /><span>التقارير</span>
            </button>
          )}
          {isLoggedIn && (
            <>
              <div className="nav-group-label">النظام</div>
              <button type="button" tabIndex={-1} className={activeSection === 'settings' ? 'active' : ''} onClick={() => setActiveSection('settings')}>
              <SectionIcon name="settings" className="nav-icon" /><span>الإعدادات</span>
            </button>
            </>
          )}
        </nav>
        <div className="sidebar-footer">
          {isLoggedIn && sessionUser ? (
            <>
              <div className="user-chip">
                <strong>{sessionUser.fullName}</strong>
                <span>{sessionOrg?.name}</span>
                <span className="role-pill">{roleLabel}</span>
              </div>
              <button type="button" className="secondary-btn small logout-btn" style={{ width: '100%' }} onClick={handleLogout}>
                <IconLogout size={16} />
                <span>تسجيل الخروج</span>
              </button>
            </>
          ) : (
            <span className="muted-sm">سجّل الدخول للمتابعة</span>
          )}
        </div>
      </aside>

      <main className="main-content page-stage" id="dashboard" key={activeSection}>
        <div className="topbar">
          <div className="topbar-start">
          <button
            type="button"
            className="sidebar-toggle-btn"
            title={sidebarOpen ? 'إخفاء القائمة الجانبية' : 'إظهار القائمة الجانبية'}
            aria-label={sidebarOpen ? 'إخفاء القائمة الجانبية' : 'إظهار القائمة الجانبية'}
            aria-expanded={sidebarOpen}
            onClick={toggleSidebar}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
              {sidebarOpen ? (
                <>
                  <path d="M4 6h16" />
                  <path d="M4 12h10" />
                  <path d="M4 18h16" />
                </>
              ) : (
                <>
                  <path d="M4 6h16" />
                  <path d="M4 12h16" />
                  <path d="M4 18h16" />
                </>
              )}
            </svg>
          </button>
          <div className="topbar-titles">
          <h1 className="page-title">
            {activeSection === 'dashboard'
              ? isLoggedIn
                ? 'لوحة التحكم'
                : 'تسجيل الدخول'
              : activeSection === 'purchases'
                ? 'المشتريات'
                : activeSection === 'sales'
                  ? 'المبيعات'
                  : activeSection === 'credit'
                    ? 'الآجل'
                  : activeSection === 'inventory'
                    ? 'المخزون'
                    : activeSection === 'accounting'
                      ? 'الخزينة'
                      : activeSection === 'reports'
                        ? 'التقارير'
                        : activeSection === 'printing'
                          ? 'الخدمات'
                          : activeSection === 'settings'
                              ? 'الإعدادات'
                              : activeSection === 'labels'
                                ? 'ملصقات الباركود'
                                : activeSection === 'dayclose'
                                  ? 'إغلاق اليومية'
                                  : 'لوحة التحكم'}
          </h1>
          <p className="topbar-sub">{isLoggedIn ? (sessionOrg?.name || 'نظام إدارة المكتبة') : 'أدخل بياناتك للمتابعة'}</p>
            <span className="ui-build-badge" title="إصدار الواجهة">واجهة · أكتوبر 2026</span>
          </div>
          </div>
          <div className="status-pills">
            <span className={`pill ${connection === 'online' ? 'ok' : connection === 'checking' ? 'warn' : 'bad'}`}>
              {connection === 'online' ? 'الخادم متصل' : connection === 'checking' ? 'فحص الاتصال' : 'الخادم غير متاح'}
            </span>
            <span className={`pill ${isLoggedIn ? 'ok' : 'warn'}`}>
              {isLoggedIn ? 'مسجّل الدخول' : 'غير مسجّل'}
            </span>
            {pendingSync > 0 && (
              <span className="pill warn" title="عمليات محفوظة محليًا بانتظار المزامنة">
                مزامنة معلّقة: {pendingSync}
              </span>
            )}
            {pendingSync > 0 && (
              <button
                type="button"
                className="btn secondary"
                style={{ padding: '0.25rem 0.65rem', fontSize: '0.8rem' }}
                disabled={syncBusy || connection !== 'online'}
                onClick={async () => {
                  setSyncBusy(true);
                  try {
                    const r = await processSyncQueue();
                    if (r.remaining === 0) setApiStatus(`تمت مزامنة ${r.synced} عملية`);
                    else setApiStatus(`مزامنة: ${r.synced} نجحت · ${r.remaining} متبقية`);
                  } catch {
                    setApiStatus('تعذرت المزامنة');
                  } finally {
                    setSyncBusy(false);
                  }
                }}
              >
                {syncBusy ? 'جارٍ المزامنة…' : 'مزامنة الآن'}
              </button>
            )}
            <span className="pill muted">{apiStatus}</span>
          </div>
        </div>

        {lowStockCount > 0 && isLoggedIn ? (
          <div className="purchase-notice" role="status" style={{ marginBottom: 12 }}>
            تنبيه: {lowStockCount} صنف تحت الحد الأدنى للمخزون
            <button type="button" className="secondary-btn" style={{ marginInlineStart: 8 }} onClick={() => setActiveSection('inventory')}>فتح المخزون</button>
          </div>
        ) : null}

        {activeSection === 'dashboard' && isLoggedIn && (
          <div className="home-dashboard">
            {message && (
              <div className="purchase-notice" role="status">
                {message}
              </div>
            )}

            <section className="welcome-banner">
              <div className="welcome-banner-text">
                <p className="welcome-greeting">{greeting} · لوحة التحكم</p>
                <h2>{sessionUser?.fullName}</h2>
                <p className="welcome-sub">
                  {sessionOrg?.name}
                  {sessionOrg?.slug ? (
                    <>
                      {' '}
                      · <span dir="ltr">{sessionOrg.slug}</span>
                    </>
                  ) : null}
                </p>
                <div className="welcome-meta">
                  <span className="role-pill">{roleLabel}</span>
                  <span className={`pill ${connection === 'online' ? 'ok' : 'bad'}`}>
                    {connection === 'online' ? 'قاعدة البيانات جاهزة' : 'تحقق من تشغيل الخادم'}
                  </span>
                </div>
              </div>
              <div className="welcome-art" aria-hidden>
                <WelcomeArt />
              </div>
            </section>

            <section className="quick-grid">
              {quickLinks
                .filter((l) => l.show)
                .map((l) => (
                  <button
                    key={l.key}
                    type="button"
                    className="quick-card"
                    onClick={() => setActiveSection(l.key)}
                  >
                    <span className="quick-card-icon">
                      <SectionIcon name={l.icon} size={22} />
                    </span>
                    <strong>{l.label}</strong>
                    <span>{l.desc}</span>
                  </button>
                ))}
            </section>
</div>
        )}

        {activeSection === 'purchases' && hasPermission(sessionUser, 'purchases') ? (
          <Purchases />
        ) : activeSection === 'inventory' && hasPermission(sessionUser, 'inventory') ? (
          <Inventory />
        ) : activeSection === 'sales' && hasPermission(sessionUser, 'sales') ? (
          <Sales />
        ) : activeSection === 'credit' && hasPermission(sessionUser, 'sales') ? (
          <Credit />
        ) : activeSection === 'printing' && hasPermission(sessionUser, 'printing') ? (
          <Printing />
        ) : activeSection === 'accounting' && hasPermission(sessionUser, 'accounting') ? (
          <Accounting />
        ) : activeSection === 'reports' && hasPermission(sessionUser, 'reports') ? (
          <Reports />
        ) : activeSection === 'settings' && isLoggedIn ? (
          <Settings />
        ) : activeSection === 'labels' && hasPermission(sessionUser, 'inventory') ? (
          <Labels />
        ) : activeSection === 'dayclose' && hasPermission(sessionUser, 'accounting') ? (
          <DayClose />
        ) : null}
      </main>
    </div>
    </>
  );
}
