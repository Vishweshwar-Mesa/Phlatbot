import ThemeToggle from "./ThemeToggle";

// Page title row: eyebrow, title, one-line subtitle, and the theme switch.
export default function PageHeader({ title, subtitle, eyebrow }: { title: string; subtitle?: React.ReactNode; eyebrow?: string; who?: string }) {
  return (
    <header className="page-top">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <ThemeToggle />
    </header>
  );
}
