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
  /**
   * La salida del módulo: un desplegable con sus destinos, que la barra sólo
   * coloca. Lo compone el módulo —él sabe qué produce y qué hacer con cada
   * cosa—: los de un solo documento con `ExportarPdfMenu` (el PDF y el anejo)
   * y los de varios con `ExportarMenu` y sus grupos.
   *
   * Aquí hubo un botón «Exportar PDF» que disparaba la exportación directa.
   * Murió cuando guardar en el anejo dejó de ser el epílogo de una descarga y
   * pasó a ser un destino: con dos destinos ya no hay un solo gesto que
   * ofrecer, y tener las dos formas convivía mal —la mitad de los módulos
   * enseñaba un botón y la otra mitad un menú para lo mismo—.
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

export function Topbar({ moduleLabel, moduleGroup, onMenuOpen, onCopyLink, onOpenAssistant, exportMenu }: TopbarProps) {
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
    /*
      Por debajo de `sm` la barra va en DOS filas: las acciones arriba y la miga
      abajo, a todo el ancho. Por encima, una sola fila de 48 px como siempre.

      Por qué: a 375 px la fila estaba sobresuscrita. Hamburguesa 42 + obra 77 +
      botonera 172 + padding 40 = 331 de 375, así que al título del módulo le
      quedaban 18 px para los 91 que necesita «Acción sísmica». No es que se
      truncara: se borraba a una letra, y pasaba con cualquier obra cargada, no
      sólo con el marcador «Sin obra». La barra dejaba de contestar «¿en qué
      pantalla estoy?», que es la pregunta que una miga existe para contestar.

      Se probaron las alternativas de una fila y ninguna cabe: repartir el ancho
      deja obra y título cortados a la vez («Casa… / Acción…»), y plegar la
      calculadora dentro de Ajustes sólo sube el título a 69 de 91. Con dos
      filas cabe entero, medido.

      El precio es el alto en móvil, que es justo donde escasea. Por eso la
      segunda fila es la miga y no las acciones: la miga es texto de 13 px y
      cabe en ~20 px, mientras que mover la botonera dejaría la fila de arriba
      casi vacía.
    */
    <header className="shrink-0 flex flex-wrap items-center justify-between gap-y-0.5 px-5 py-1 bg-bg-surface border-b border-border-main sm:h-12 sm:flex-nowrap sm:gap-y-0 sm:py-0">
      <div className="order-2 w-full flex items-center gap-2.5 min-w-0 overflow-hidden sm:order-none sm:w-auto">
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
            className="sm:hidden inline-flex items-center gap-1 max-w-[65%] shrink-0 py-1.5 -my-1.5 text-[11px] font-mono uppercase text-text-secondary hover:text-text-primary transition-colors"
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
      {/* `order-1` + `ml-auto` la suben a la primera fila y la pegan a la
          derecha mientras la barra va en dos filas. A partir de `sm` vuelve a
          su sitio natural. */}
      <div className="order-1 ml-auto flex items-center gap-1 shrink-0 sm:order-none sm:ml-0">
        {/* Asistente IA — acción primaria (único botón relleno). */}
        {onOpenAssistant && <AiButton onClick={onOpenAssistant} />}
        <CalcButton onClick={openCalc} />
        <span className="hidden sm:block w-px h-5 bg-border-main mx-1" />
        {/* Ajustes: recoge Unidades, Tema y Copiar enlace. */}
        <AjustesMenu onCopyLink={handleCopyUrl} />
        {/* Salida del módulo: el desplegable que trae el propio módulo. */}
        {exportMenu}
      </div>
    </header>
  );
}
