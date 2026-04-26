import { Menu } from 'lucide-react';
import { showToast } from '../ui/Toast';
import { UnitSystemToggle } from '../units/UnitSystemToggle';
import { CalcButton } from '../calculator/CalcButton';
import { useCalculator } from '../calculator/calculator-context';

interface TopbarProps {
  moduleLabel: string;
  moduleGroup: string;
  onExportPdf?: () => void;
  pdfExporting?: boolean;
  onMenuOpen?: () => void;
}

export function Topbar({ moduleLabel, moduleGroup, onExportPdf, pdfExporting, onMenuOpen }: TopbarProps) {
  const { open: openCalc } = useCalculator();
  const handleCopyUrl = () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      showToast('Enlace copiado', { autoDismiss: 2000 });
    }).catch(() => {
      showToast('No se pudo copiar el enlace', { autoDismiss: 3000 });
    });
  };

  return (
    <header className="h-12 shrink-0 flex items-center justify-between px-5 bg-bg-surface border-b border-border-main">
      <div className="flex items-center gap-2.5 min-w-0 overflow-hidden">
        {/* Hamburger — mobile only */}
        {onMenuOpen && (
          <button
            onClick={onMenuOpen}
            className="md:hidden p-3 -ml-2 text-text-secondary hover:text-text-primary transition-colors"
            aria-label="Abrir menú"
          >
            <Menu size={18} aria-hidden="true" />
          </button>
        )}
        {/* Breadcrumb: GROUP / Module */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[11px] font-mono text-text-disabled uppercase" style={{ letterSpacing: '0.06em' }}>
            {moduleGroup}
          </span>
          <span className="text-text-disabled">/</span>
          <span className="text-[13px] font-medium text-text-primary">
            {moduleLabel}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <CalcButton onClick={openCalc} />
        <span className="hidden sm:block w-px h-5 bg-border-main mx-1" />
        <UnitSystemToggle />
        {/* Copy link */}
        <button
          onClick={handleCopyUrl}
          title="Copiar enlace a este cálculo"
          className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors text-[12px]"
          aria-label="Copiar enlace a este cálculo"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" aria-hidden="true">
            <path d="M6 10a3 3 0 0 0 4 0l2-2a3 3 0 0 0-4-4l-1 1M10 6a3 3 0 0 0-4 0L4 8a3 3 0 0 0 4 4l1-1"/>
          </svg>
          <span>Copiar enlace</span>
        </button>
        {/* PDF export — accent styled */}
        {onExportPdf && (
          <button
            onClick={onExportPdf}
            disabled={pdfExporting}
            title="Exportar PDF"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[12px] text-accent disabled:opacity-40 transition-all"
            style={{
              border: '1px solid rgba(56,189,248,0.25)',
              background: 'rgba(56,189,248,0.06)',
            }}
            aria-label="Exportar PDF"
          >
            {pdfExporting ? (
              <span className="w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" aria-hidden="true" />
            ) : (
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" aria-hidden="true">
                <path d="M4 2h5l3 3v9H4zM9 2v3h3"/>
              </svg>
            )}
            <span className="hidden sm:inline">Exportar PDF</span>
          </button>
        )}
      </div>
    </header>
  );
}
