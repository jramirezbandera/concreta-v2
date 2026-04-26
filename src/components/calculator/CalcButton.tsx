interface CalcButtonProps {
  onClick: () => void;
}

// Split variant — selected design default. Mobile fallback is icon-only.
export function CalcButton({ onClick }: CalcButtonProps) {
  return (
    <>
      {/* Mobile: icon-only, accent-tinted */}
      <button
        onClick={onClick}
        title="Calculadora"
        aria-label="Abrir calculadora"
        className="sm:hidden inline-flex items-center justify-center w-9 h-9 rounded text-accent hover:bg-bg-elevated transition-colors"
        style={{ background: 'rgba(56,189,248,0.08)', border: '1px solid rgba(56,189,248,0.25)' }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25">
          <rect x="3" y="2" width="10" height="12" rx="0.5" />
          <path d="M5 5h6M5 8h1.5M7.5 8H9M10 8h1M5 11h1.5M7.5 11H9M10 11h1" strokeLinecap="round" />
        </svg>
      </button>

      {/* Desktop: split label + keycap */}
      <div className="hidden sm:inline-flex items-stretch border border-border-main rounded overflow-hidden">
        <button
          onClick={onClick}
          title="Calculadora (C)"
          aria-label="Abrir calculadora"
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] text-text-primary hover:bg-bg-elevated transition-colors"
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" className="text-accent">
            <rect x="3" y="2" width="10" height="12" rx="0.5" />
            <path d="M5 5h6" strokeLinecap="round" />
            <circle cx="5.5" cy="8" r="0.5" fill="currentColor" />
            <circle cx="8" cy="8" r="0.5" fill="currentColor" />
            <circle cx="10.5" cy="8" r="0.5" fill="currentColor" />
            <circle cx="5.5" cy="11" r="0.5" fill="currentColor" />
            <circle cx="8" cy="11" r="0.5" fill="currentColor" />
            <circle cx="10.5" cy="11" r="0.5" fill="currentColor" />
          </svg>
          <span className="font-medium">Calculadora</span>
        </button>
        <span className="w-px bg-border-main" />
        <span className="inline-flex items-center px-1.5 font-mono text-[10px] text-text-disabled bg-bg-elevated/50">C</span>
      </div>
    </>
  );
}
