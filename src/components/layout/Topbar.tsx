import { useEffect, type ReactNode } from 'react';
import { Folder, Menu } from 'lucide-react';
import { showToast } from '../ui/Toast';
import { useCalculator } from '../calculator/calculator-context';
import { MenuApp } from './MenuApp';
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
   * Abre el asistente IA del módulo. Cuando se pasa, la fila «Asistente IA» del
   * Menú está viva; los módulos sin asistente lo omiten y la fila sale apagada
   * con la razón, que no es lo mismo que esconderla (D-I7).
   *
   * Desde el rediseño de 2026-09-22 el asistente ya NO tiene botón propio en la
   * barra: vive en el Menú y —cuando aterrice su píldora— en la esquina.
   */
  onOpenAssistant?: () => void;
}

export function Topbar({ moduleLabel, moduleGroup, onMenuOpen, onCopyLink, onOpenAssistant, exportMenu }: TopbarProps) {
  const { open: openCalc } = useCalculator();
  const { openDrawer } = useDrawer();
  const nombreObra = useNombreObra();

  /*
    Atajo «A» — vivía dentro de `AiButton`, que era un componente de la barra.
    Al mudarse el asistente al Menú, el botón desaparece y el atajo se habría
    ido con él SIN un solo error: un día la «A» deja de hacer nada. Por eso sube
    aquí, a la Topbar, que es tan global como lo es `onOpenAssistant` (una sola
    montada por módulo ⇒ un solo listener).

    Sigue guardado contra el foco en campos de texto, para no secuestrar la
    escritura, y contra los modificadores. Espeja la «C» de la calculadora, cuyo
    listener vive en `CalculatorProvider`. Cuando el asistente tenga su propio
    provider global (tarea T2 del plan), los dos atajos acabarán en el mismo
    sitio; esto es el paso intermedio que evita la regresión.
  */
  useEffect(() => {
    if (!onOpenAssistant) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'a' || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return;
      onOpenAssistant();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onOpenAssistant]);
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

      PENDIENTE (tarea T7 del plan de 2026-09-22): ese cálculo es de cuando la
      botonera llevaba cuatro controles. Plegando asistente Y calculadora se van
      unos 80 px (36 + 36 + gaps), o sea ~251 de 375, y al título le quedarían
      ~124 px para los 91 que pide. La fila podría volver a ser UNA, que es el
      único premio que este rediseño le da al móvil —allí no hay píldora que
      compense—. No se toca aquí: hay que medirlo con el nombre de obra más
      largo y el título más largo a la vez antes de dar el cambio por bueno.

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
            /* D-I3: se llamaba «Abrir menú», igual que el desplegable de la
               derecha. Dos controles de la misma barra que se anunciaban igual
               al lector de pantalla y abrían sitios distintos. */
            aria-label="Abrir navegación"
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
        {/* Menú: las dos herramientas (Asistente, Calculadora) + Preferencias +
            Estudio y compartir. Sucede al viejo «Ajustes». */}
        <MenuApp
          onCopyLink={handleCopyUrl}
          onOpenAssistant={onOpenAssistant}
          onOpenCalculator={openCalc}
        />
        {/* Salida del módulo: el desplegable que trae el propio módulo.
            D-I4: conserva su outline SUTIL y no hereda el fuerte. Nadie es ya
            la acción primaria de la barra —el acento se muda con el asistente a
            su píldora—, y la barra queda tranquila a propósito. */}
        {exportMenu}
      </div>
    </header>
  );
}
