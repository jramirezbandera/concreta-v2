import { Moon, Sun } from "lucide-react";
import { useTheme } from "../../lib/theme/useTheme";

/**
 * Two-state theme switch (sun/moon), mirrors UnitSystemToggle's icon button.
 * The icon shows the theme you'll switch TO: moon while light, sun while dark.
 * OS-aware default happens on first visit (pre-paint script); this persists a
 * manual choice. No "System" state by design — set once, desk tool.
 */
export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  const nextLabel = isDark ? "claro" : "oscuro";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={`Tema ${isDark ? "oscuro" : "claro"}. Cambiar a tema ${nextLabel}.`}
      title={`Tema ${isDark ? "oscuro" : "claro"} — toca para cambiar a ${nextLabel}`}
      className="inline-flex items-center justify-center p-1.5 rounded border border-border-main text-text-secondary transition-colors hover:text-text-primary hover:bg-bg-elevated focus:outline-none focus-visible:ring-1 focus-visible:ring-accent"
    >
      {isDark ? (
        <Sun size={14} aria-hidden="true" />
      ) : (
        <Moon size={14} aria-hidden="true" />
      )}
    </button>
  );
}
