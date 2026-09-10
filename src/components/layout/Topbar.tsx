import type { ReactNode } from 'react';
import { Folder, Menu } from 'lucide-react';
import { showToast } from '../ui/Toast';
import { CalcButton } from '../calculator/CalcButton';
import { useCalculator } from '../calculator/calculator-context';
import { AiButton } from '../ai/AiButton';
import { AjustesMenu } from './AjustesMenu';
import { PiezaMenu } from './PiezaMenu';
import { useDrawer } from './AppShell';
import { useNombreObra } from '../../lib/proyecto/useProyectoActivo';

interface TopbarProps {
  moduleLabel: string;
  moduleGroup: string;
  onExportPdf?: () => void;
  pdfExporting?: boolean;
  /**
   * Etiqueta del botón de exportar. Por defecto «Exportar PDF»: los 21 módulos
   * que no la pasan siguen exactamente igual. Viento y nieve la cambia con la
   * pestaña (Word o Excel). Cuando una vista tiene VARIAS salidas a la vez, el
   * botón se sustituye por `exportMenu`.
   */
  exportLabel?: string;
  /**
   * Desplegable de formatos que ocupa el sitio del botón de exportar, para las
   * vistas con más de una salida. Lo estrena el cuadro de materiales, con
   * cuatro (Word y PDF del cuadro de memoria, Excel y DXF del de plano): el
   * módulo compone el `ExportarMenu` —él sabe qué formatos tiene y qué hacer
   * con cada uno— y la barra sólo lo coloca. Excluyente con `onExportPdf`.
   */
  exportMenu?: ReactNode;
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

export function Topbar({ moduleLabel, moduleGroup, onExportPdf, pdfExporting, onMenuOpen, onCopyLink, onOpenAssistant, exportLabel = 'Exportar PDF', exportMenu }: TopbarProps) {
  const { open: openCalc } = useCalculator();
  const { openDrawer } = useDrawer();
  const nombreObra = useNombreObra();
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
          {/* Por debajo de `sm` el grupo se oculta y su hueco lo ocupa la OBRA:
              el sidebar es un cajón y, sin esto, en móvil no se ve en qué obra
              estás. Es pulsable y abre el cajón con el menú de obra desplegado.
              Al truncar gana la obra: es `shrink-0` y el título del módulo cede. */}
          <button
            type="button"
            onClick={() => openDrawer({ menuObra: true })}
            className="sm:hidden inline-flex items-center gap-1 max-w-[65%] shrink-0 text-[11px] font-mono uppercase text-text-secondary hover:text-text-primary transition-colors"
            style={{ letterSpacing: '0.06em' }}
            aria-label={`Obra: ${nombreObra ?? 'sin obra'}. Abrir menú de obra`}
          >
            <Folder size={12} className="shrink-0 text-accent" aria-hidden="true" />
            <span className="truncate">{nombreObra ?? 'Sin obra'}</span>
          </button>
          <span className="hidden sm:inline text-[11px] font-mono text-text-disabled uppercase whitespace-nowrap shrink-0" style={{ letterSpacing: '0.06em' }}>
            {moduleGroup}
          </span>
          <span className="text-text-disabled shrink-0">/</span>
          <span className="text-[13px] font-medium text-text-primary min-w-0 truncate">
            {moduleLabel}
          </span>
          {/* La miga sigue con el cálculo abierto: «HORMIGÓN / Vigas / V-3». Se
              coloca sola —sabe qué módulo es por la ruta— y no aparece en los
              módulos sin nada guardado en el anejo. */}
          <PiezaMenu />
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {/* Asistente IA — acción primaria (único botón relleno). */}
        {onOpenAssistant && <AiButton onClick={onOpenAssistant} />}
        <CalcButton onClick={openCalc} />
        <span className="hidden sm:block w-px h-5 bg-border-main mx-1" />
        {/* Ajustes: recoge Unidades, Tema y Copiar enlace. */}
        <AjustesMenu onCopyLink={handleCopyUrl} />
        {/* Salida del módulo — resaltado sutil (accent-outline). Con varias
            salidas, el módulo pasa su desplegable y ocupa el mismo sitio. */}
        {exportMenu}
        {!exportMenu && onExportPdf && (
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
