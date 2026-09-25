import ThemeToggle from "./ThemeToggle";

// Pastel gradient app header shared by every page.
export default function PageHeader({
  title,
  subtitle,
  who,
}: {
  title: string;
  subtitle?: React.ReactNode;
  who?: string;
}) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <span className="brand">
          <span className="brand-mark">⌂</span>
          Phlatmatch
        </span>
        <span className="top-actions">
          {who && <span className="who">{who}</span>}
          <ThemeToggle />
        </span>
      </div>
      <div className="hero">
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
    </header>
  );
}
