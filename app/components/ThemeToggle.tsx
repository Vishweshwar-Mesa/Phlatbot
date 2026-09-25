"use client";

// Light/dark switch. The initial theme is set by the inline script in the root layout;
// which icon shows is pure CSS off <html data-theme>, so there is no hydration mismatch.
export default function ThemeToggle() {
  function toggle() {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {}
  }

  return (
    <button type="button" className="theme-btn" onClick={toggle} aria-label="Switch light/dark mode">
      <span className="show-light">☾</span>
      <span className="show-dark">☀︎</span>
    </button>
  );
}
