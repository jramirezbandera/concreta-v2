interface CalcLauncherProps {
  onClick: () => void;
}

// Floating restore button shown when the calculator is minimized.
// Anchored bottom-left to match the docked panel position.
export function CalcLauncher({ onClick }: CalcLauncherProps) {
  return (
    <button
      onClick={onClick}
      title="Abrir calculadora (C)"
      aria-label="Abrir calculadora"
      className="hidden sm:inline-flex fixed bottom-6 left-6 z-50 items-center gap-2 px-3 py-2.5 bg-bg-surface border border-border-main rounded text-[12px] text-text-primary hover:border-accent/50 transition-colors group"
      style={{ boxShadow: '0 12px 24px -8px rgba(0,0,0,0.6)' }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full bg-accent"
        style={{ boxShadow: '0 0 6px rgba(56,189,248,0.6)' }}
      />
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" className="text-text-secondary group-hover:text-accent transition-colors">
        <rect x="3" y="2" width="10" height="12" rx="0.5" />
        <path d="M5 5h6M5 8h1.5M7.5 8H9M10 8h1M5 11h1.5M7.5 11H9M10 11h1" strokeLinecap="round" />
      </svg>
      <span className="font-medium">Calculadora</span>
      <span className="font-mono text-[10px] text-text-disabled border border-border-sub rounded px-1">C</span>
    </button>
  );
}
