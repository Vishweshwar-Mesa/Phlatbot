"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Bottom navigation for a person's private app (/p/[token]/...).
export default function TabBar({ token, alerts }: { token: string; alerts: { home?: boolean; shortlist?: boolean } }) {
  const path = usePathname();
  const base = `/p/${token}`;
  const tabs = [
    { href: base, icon: "🏠", label: "Home", exact: true, dot: alerts.home },
    { href: `${base}/constraints`, icon: "🎚️", label: "Constraints" },
    { href: `${base}/shortlist`, icon: "🗳️", label: "Shortlist", dot: alerts.shortlist },
    { href: `${base}/history`, icon: "🕘", label: "History" },
  ];
  return (
    <nav className="tabbar" aria-label="App sections">
      <div className="tabbar-inner">
        {tabs.map((t) => {
          const active = t.exact ? path === t.href : path.startsWith(t.href);
          return (
            <Link key={t.href} href={t.href} className={`tab${active ? " active" : ""}`} aria-current={active ? "page" : undefined}>
              <span className="tab-icon" aria-hidden>
                {t.icon}
              </span>
              {t.label}
              {t.dot && <span className="dot" aria-label="needs attention" />}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
