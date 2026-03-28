import { Link, Download } from 'lucide-react';
import { showToast } from '../ui/Toast';

interface TopbarProps {
  moduleLabel: string;
  moduleGroup: string;
  onExportPdf?: () => void;
  pdfExporting?: boolean;
}

export function Topbar({ moduleLabel, moduleGroup, onExportPdf, pdfExporting }: TopbarProps) {
  const handleCopyUrl = () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      showToast('Enlace copiado', { autoDismiss: 2000 });
    }).catch(() => {
      showToast('No se pudo copiar el enlace', { autoDismiss: 3000 });
    });
  };

  return (
    <header className="h-12 shrink-0 flex items-center justify-between px-4 bg-bg-primary border-b border-border-main">
      <span className="text-base font-medium text-text-primary">
        {moduleLabel}
        <span className="text-text-secondary font-normal"> — {moduleGroup}</span>
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={handleCopyUrl}
          title="Copiar enlace a este cálculo"
          className="flex items-center gap-1.5 px-2.5 h-7 rounded text-text-secondary hover:text-text-primary hover:bg-bg-surface transition-colors text-[11px]"
          aria-label="Copiar enlace a este cálculo"
        >
          <Link size={13} aria-hidden="true" />
          <span>Copiar enlace</span>
        </button>
        {onExportPdf && (
          <button
            onClick={onExportPdf}
            disabled={pdfExporting}
            title="Exportar PDF"
            className="flex items-center gap-1.5 px-2.5 h-7 rounded text-text-secondary hover:text-text-primary hover:bg-bg-surface transition-colors disabled:opacity-40 text-[11px]"
            aria-label="Exportar PDF"
          >
            {pdfExporting ? (
              <span className="w-3 h-3 border-2 border-text-secondary border-t-transparent rounded-full animate-spin" aria-hidden="true" />
            ) : (
              <Download size={13} aria-hidden="true" />
            )}
            <span>Exportar PDF</span>
          </button>
        )}
      </div>
    </header>
  );
}
