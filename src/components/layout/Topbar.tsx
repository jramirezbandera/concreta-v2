import { Menu } from 'lucide-react';
import { showToast } from '../ui/Toast';
import { CalcButton } from '../calculator/CalcButton';
import { useCalculator } from '../calculator/calculator-context';
import { AiButton } from '../ai/AiButton';
import { AjustesMenu } from './AjustesMenu';

interface TopbarProps {
  moduleLabel: string;
  moduleGroup: string;
  onExportPdf?: () => void;
  pdfExporting?: boolean;
  /**
   * Etiqueta del botón de exportar. Por defecto «Exportar PDF»: los 21 módulos
   * que no la pasan siguen exactamente igual. El cuadro de materiales entrega
   * Word, y detrás vienen Excel y DXF del cuadro de plano — cuando existan de
   * verdad, este botón se convertirá en un menú de formatos. Construirlo hoy
   * sería especular sobre tres salidas que aún no están escritas.
   */
  exportLabel?: string;
  /**
   * Segunda salida de la misma vista, en un botón de menos peso a la izquierda
   * del principal. Lo estrena el cuadro de materiales: su vista de plano tiene
   * DOS destinos —Excel para capturar y DXF para el CAD— y nombrarlos es más
   * claro que esconderlos en un desplegable de formatos.
   */
  onExportSecondary?: () => void;
  exportSecondaryLabel?: string;
  onMenuOpen?: () => void;
  /**
   * Override for the "Copiar enlace" button. Modules that need a richer share
   * payload (e.g. FEM 1D encoding the model into the URL) pass their own
   * handler. When omitted, the button copies window.location.href.
   */
  onCopyLink?: () => void;
  /**
   * Abre el asistente IA del módulo. Cuando se pasa, la topbar muestra el botón
   * "Asistente IA" (acción primaria). Los módulos sin asistente lo omiten y el
   * botón no aparece.
   */
  onOpenAssistant?: () => void;
}

export function Topbar({ moduleLabel, moduleGroup, onExportPdf, pdfExporting, onMenuOpen, onCopyLink, onOpenAssistant, exportLabel = 'Exportar PDF', onExportSecondary, exportSecondaryLabel }: TopbarProps) {
  const { open: openCalc } = useCalculator();
  const handleCopyUrl = onCopyLink ?? (() => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      showToast('Enlace copiado', { autoDismiss: 2000 });
    }).catch(() => {
      showToast('No se pudo copiar el enlace', { autoDismiss: 3000 });
    });
  });

  return (
    <header className="h-12 shrink-0 flex items-center justify-between px-5 bg-bg-surface border-b border-border-main">
      <div className="flex items-center gap-2.5 min-w-0 overflow-hidden">
        {/* Hamburger — mobile only */}
        {onMenuOpen && (
          <button
            onClick={onMenuOpen}
            className="lg:hidden p-3 -ml-2 text-text-secondary hover:text-text-primary transition-colors"
            aria-label="Abrir menú"
          >
            <Menu size={18} aria-hidden="true" />
          </button>
        )}
        {/* Breadcrumb: GROUP / Module. En móvil se oculta el grupo (contexto
            redundante que ya da el drawer) para que el título del módulo tenga
            todo el ancho y no se corte a "V…". Aparece a partir de `sm`, donde
            los botones de la derecha también recuperan su etiqueta. */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="hidden sm:inline text-[11px] font-mono text-text-disabled uppercase whitespace-nowrap shrink-0" style={{ letterSpacing: '0.06em' }}>
            {moduleGroup}
          </span>
          <span className="hidden sm:inline text-text-disabled shrink-0">/</span>
          <span className="text-[13px] font-medium text-text-primary min-w-0 truncate">
            {moduleLabel}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {/* Asistente IA — acción primaria (único botón relleno). */}
        {onOpenAssistant && <AiButton onClick={onOpenAssistant} />}
        <CalcButton onClick={openCalc} />
        <span className="hidden sm:block w-px h-5 bg-border-main mx-1" />
        {/* Ajustes: recoge Unidades, Tema y Copiar enlace. */}
        <AjustesMenu onCopyLink={handleCopyUrl} />
        {/* Salida secundaria de la vista: mismo tamaño, sin el realce. */}
        {onExportSecondary && (
          <button
            onClick={onExportSecondary}
            disabled={pdfExporting}
            title={exportSecondaryLabel}
            aria-label={exportSecondaryLabel}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[12px] text-text-secondary hover:text-text-primary hover:bg-bg-elevated disabled:opacity-40 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" aria-hidden="true">
              <path d="M4 2h5l3 3v9H4zM9 2v3h3"/>
            </svg>
            <span className="hidden lg:inline">{exportSecondaryLabel}</span>
          </button>
        )}
        {/* Salida principal de la vista — resaltado sutil (accent-outline). */}
        {onExportPdf && (
          <button
            onClick={onExportPdf}
            disabled={pdfExporting}
            title={exportLabel}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[12px] text-accent disabled:opacity-40 transition-all"
            style={{
              border: '1px solid color-mix(in srgb, var(--color-accent) 25%, transparent)',
              background: 'color-mix(in srgb, var(--color-accent) 6%, transparent)',
            }}
            aria-label={exportLabel}
          >
            {pdfExporting ? (
              <span className="w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" aria-hidden="true" />
            ) : (
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" aria-hidden="true">
                <path d="M4 2h5l3 3v9H4zM9 2v3h3"/>
              </svg>
            )}
            <span className="hidden lg:inline">{exportLabel}</span>
          </button>
        )}
      </div>
    </header>
  );
}
