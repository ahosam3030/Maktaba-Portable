/** أيقونات SVG خفيفة بدون مكتبات خارجية */
import type { ReactNode } from 'react';

type IconProps = { size?: number; className?: string };

function Svg({ size = 20, className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

export function IconHome(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 10v10h14V10" />
      <path d="M10 20v-6h4v6" />
    </Svg>
  );
}

export function IconCart(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="9" cy="20" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="18" cy="20" r="1.5" fill="currentColor" stroke="none" />
      <path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.8a2 2 0 0 0 2-1.5L21 8H7" />
    </Svg>
  );
}

export function IconReceipt(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M6 3h12v18l-2-1.2L14 21l-2-1.2L10 21l-2-1.2L6 21V3z" />
      <path d="M9 8h6M9 12h6M9 16h4" />
    </Svg>
  );
}

export function IconBoxes(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <path d="M3.3 7 12 12l8.7-5M12 12v9.5" />
    </Svg>
  );
}

export function IconWallet(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H19a1 1 0 0 1 1 1v2" />
      <path d="M3 7.5V18a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6H13a2 2 0 0 0 0 4h7" />
      <circle cx="16.5" cy="14" r="1" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function IconChart(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 19V5M4 19h16" />
      <path d="M8 16v-5M12 16V8M16 16v-3M20 16v-8" />
    </Svg>
  );
}

export function IconPrint(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M6 9V3h12v6" />
      <path d="M6 17H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" />
      <path d="M6 13h12v8H6z" />
    </Svg>
  );
}

export function IconSettings(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </Svg>
  );
}

export function IconUsers(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 19a6 6 0 0 1 12 0" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M21 19a4.5 4.5 0 0 0-4.5-4.5" />
    </Svg>
  );
}

export function IconLogout(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" />
      <path d="M16 8l4 4-4 4M20 12H10" />
    </Svg>
  );
}

export function IconTag(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M20 12 12 4H5v7l8 8 7-7z" />
      <circle cx="8.5" cy="8.5" r="1.2" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function IconTrend(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3 17 10 10l4 4 7-7" />
      <path d="M14 7h7v7" />
    </Svg>
  );
}

export function IconPackage(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 3 4 7.5v9L12 21l8-4.5v-9L12 3z" />
      <path d="M12 12 4 7.5M12 12l8-4.5M12 12v9" />
    </Svg>
  );
}

export function IconLock(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </Svg>
  );
}

export function IconClock(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </Svg>
  );
}

export function IconMoney(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6 12h.01M18 12h.01" />
    </Svg>
  );
}

export function IconUser(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 19a7 7 0 0 1 14 0" />
    </Svg>
  );
}

export function IconCalendar(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </Svg>
  );
}

export function IconRefresh(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M21 12a9 9 0 1 1-2.6-6.4" />
      <path d="M21 3v6h-6" />
    </Svg>
  );
}

const SECTION_ICONS = {
  dashboard: IconHome,
  purchases: IconCart,
  sales: IconReceipt,
  inventory: IconBoxes,
  accounting: IconWallet,
  reports: IconChart,
  printing: IconPrint,
  settings: IconSettings,
} as const;

export type SectionIconKey = keyof typeof SECTION_ICONS;

export function SectionIcon({ name, size = 18, className }: { name: SectionIconKey; size?: number; className?: string }) {
  const C = SECTION_ICONS[name] || IconHome;
  return <C size={size} className={className} />;
}

/** شعار النظام — حرف م داخل شكل كتاب/لوحة */
export function BrandLogo({ size = 44, className }: { size?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden
    >
      <defs>
        <linearGradient id="brandGrad" x1="8" y1="4" x2="42" y2="44" gradientUnits="userSpaceOnUse">
          <stop stopColor="#2dd4bf" />
          <stop offset="1" stopColor="#0f766e" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="44" height="44" rx="14" fill="url(#brandGrad)" />
      <path
        d="M14 12h12.5c4.2 0 7.5 2.8 7.5 6.8 0 2.6-1.3 4.7-3.4 5.8 2.6 1.1 4.2 3.5 4.2 6.4 0 4.3-3.5 7-8.2 7H14V12z"
        fill="none"
        stroke="#fff"
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      <path d="M14 12v32" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M14 24h11.5" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" opacity=".9" />
    </svg>
  );
}

/** رسمة ترحيب للوحة الرئيسية */
export function WelcomeArt({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 220 160" width="220" height="160" fill="none" aria-hidden>
      <defs>
        <linearGradient id="wa1" x1="40" y1="20" x2="180" y2="140" gradientUnits="userSpaceOnUse">
          <stop stopColor="#5eead4" stopOpacity=".9" />
          <stop offset="1" stopColor="#99f6e4" stopOpacity=".35" />
        </linearGradient>
        <linearGradient id="wa2" x1="100" y1="30" x2="190" y2="130">
          <stop stopColor="#fff" stopOpacity=".35" />
          <stop offset="1" stopColor="#fff" stopOpacity=".05" />
        </linearGradient>
      </defs>
      <ellipse cx="110" cy="140" rx="78" ry="12" fill="#0b4f4a" opacity=".25" />
      {/* desk */}
      <rect x="28" y="108" width="164" height="10" rx="3" fill="url(#wa2)" />
      {/* monitor */}
      <rect x="58" y="42" width="104" height="66" rx="8" fill="url(#wa1)" stroke="#fff" strokeOpacity=".35" />
      <rect x="68" y="52" width="84" height="42" rx="4" fill="#0f766e" opacity=".55" />
      <path d="M78 62h40M78 72h28M78 82h34" stroke="#99f6e4" strokeWidth="2.5" strokeLinecap="round" opacity=".9" />
      <rect x="96" y="108" width="28" height="8" rx="2" fill="#ccfbf1" opacity=".7" />
      {/* chart bars */}
      <rect x="168" y="78" width="12" height="30" rx="2" fill="#fff" opacity=".45" />
      <rect x="184" y="64" width="12" height="44" rx="2" fill="#fff" opacity=".55" />
      <rect x="200" y="88" width="12" height="20" rx="2" fill="#fff" opacity=".4" />
      {/* floating coin */}
      <circle cx="42" cy="58" r="16" fill="#fde68a" opacity=".85" />
      <circle cx="42" cy="58" r="11" fill="none" stroke="#b45309" strokeWidth="1.5" opacity=".5" />
      <text x="42" y="63" textAnchor="middle" fontSize="12" fontWeight="700" fill="#92400e">ج</text>
    </svg>
  );
}

/** أيقونة حالة فارغة */
export function EmptyArt({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 100" width="88" height="72" fill="none" aria-hidden>
      <rect x="22" y="28" width="76" height="52" rx="8" fill="#e8f4f1" stroke="#b7d9d1" strokeWidth="1.5" />
      <path d="M22 40h76" stroke="#b7d9d1" strokeWidth="1.5" />
      <circle cx="36" cy="34" r="2.5" fill="#99c9be" />
      <circle cx="46" cy="34" r="2.5" fill="#99c9be" />
      <circle cx="56" cy="34" r="2.5" fill="#99c9be" />
      <path d="M40 58h40M40 68h28" stroke="#9ebbb9" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="88" cy="72" r="16" fill="#0f766e" opacity=".12" />
      <path d="M88 64v16M80 72h16" stroke="#0f766e" strokeWidth="2.2" strokeLinecap="round" opacity=".6" />
    </svg>
  );
}

export function IconSearch(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </Svg>
  );
}

export function IconPlus(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

export function IconTrash(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </Svg>
  );
}

export function IconCheck(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M20 6 9 17l-5-5" />
    </Svg>
  );
}
