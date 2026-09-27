"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Desktop navigation for a person's private app; phones use the bottom TabBar instead.
export default function Sidebar({ token, name, ready, counts }: {
  token: string; name: string; ready: boolean; counts: { home?: number; shortlist?: number };
}) {
  const path = usePathname();
  const base = `/p/${token}`;
  const items = [
    { href: base, label: "Dashboard", icon: "⌂", exact: true, count: counts.home },
    { href: `${base}/listings`, label: "Listings", icon: "▦" },
    { href: `${base}/shortlist`, label: "Shortlist", icon: "✓", count: counts.shortlist },
    { href: `${base}/constraints`, label: "Constraints", icon: "≡" },
  ];
  return (
    <aside className="side" aria-label="Main navigation">
      <span className="brand"><span className="brand-mark">⌂</span>Phlatmatch</span>
      {items.map((i) => {
        const active = i.exact ? path === i.href : path.startsWith(i.href);
        return (
          <Link key={i.href} href={i.href} className={`nav-link${active ? " active" : ""}`} aria-current={active ? "page" : undefined}>
            <span aria-hidden style={{ width: 18, textAlign: "center" }}>{i.icon}</span>
            {i.label}
            {!!i.count && <span className="count">{i.count}</span>}
          </Link>
        );
      })}
      <div className="side-me">
        <span className="avatar" style={{ margin: 0 }}>{name[0]}</span>
        <div>
          <div style={{ fontWeight: 600, fontSize: ".9rem" }}>{name}</div>
          <div className="muted" style={{ fontSize: ".76rem" }}>{ready ? "Constraints in" : "Constraints needed"}</div>
        </div>
      </div>
    </aside>
  );
}
