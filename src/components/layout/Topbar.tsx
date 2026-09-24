import type { ReactNode } from 'react';
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
}

export function Topbar({ moduleLabel, moduleGroup, onMenuOpen, onCopyLink, exportMenu }: TopbarProps) {
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
      Por debajo de `sm` la barra va en DOS filas. Arriba, lo que se PULSA:
      hamburguesa, obra y los dos desplegables. Abajo, a todo el ancho, lo que
      se LEE: el título del módulo. Por encima de `sm`, una sola fila de 48 px.

      Por qué dos filas y no una. Se midió a 375 px (T7 del plan de 2026-09-22),
      y no cabe ni de lejos. Descontando padding quedan 335 px de los que la
      hamburguesa se lleva 42, los desplegables 110 y los huecos más la barra
      «/» otros 34: al título le quedan 75. «Acción sísmica» pide 91 y
      «Cumplimiento del DB SE» —el más largo de los 27 módulos— pide 148. En una
      fila salía «EDIFICIO 12 V… / Cum…», las dos cosas cortadas a la vez, que
      es justo lo que la barra existe para no hacer.

      (El plan estimaba ~124 px libres y daba «Acción sísmica» por el peor caso.
      Las dos cosas eran falsas: se dejó fuera los 34 px de huecos y hay un
      título 57 % más largo. Medido, no estimado, para que nadie lo reintente.)

      Por qué ESTE reparto y no el anterior. Hasta hoy la fila de arriba llevaba
      sólo los desplegables —con toda la mitad izquierda vacía— y abajo iban
      hamburguesa, obra y título apretados. El título cabía de milagro: sólo
      porque el marcador «Sin obra» mide 74 px. Con una obra de verdad se
      cortaba igualmente («EDIFICIO 12 VIVIENDAS» lo dejaba en 99 de 148), y con
      una larga se cortaban las dos. Subiendo la obra a la fila de arriba, que
      estaba desaprovechada, el título se queda solo con los 335 px enteros y no
      se corta NUNCA; y quien cede al truncar pasa a ser la obra, que es lo
      correcto: en qué obra estás lo contesta también el cajón, en qué pantalla
      estás sólo lo contesta esto. De paso la barra baja de 81 px a ~72.

      La obra va con `flex-1 min-w-0` y no con un ancho máximo a ojo. No es
      cosmética: con su ancho natural, un nombre largo empuja los desplegables a
      una TERCERA fila, porque el reparto por líneas se decide con el tamaño
      base de cada pieza y sólo después se encoge. Con base 0 no puede empujar a
      nadie, y luego crece hasta ocupar lo que sobre.
    */
    <header className="shrink-0 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 px-5 py-1 bg-bg-surface border-b border-border-main sm:h-12 sm:flex-nowrap sm:gap-y-0 sm:py-0">
      {/* Hamburguesa — hasta `lg`, que es donde el sidebar deja de ser cajón. */}
      {onMenuOpen && (
        <button
          onClick={onMenuOpen}
          className="order-1 lg:hidden p-3 -ml-2 text-text-secondary hover:text-text-primary transition-colors"
          /* D-I3: se llamaba «Abrir menú», igual que el desplegable de la
             derecha. Dos controles de la misma barra que se anunciaban igual
             al lector de pantalla y abrían sitios distintos. */
          aria-label="Abrir navegación"
        >
          <Menu size={18} aria-hidden="true" />
        </button>
      )}

      {/* La obra, sólo en móvil: el sidebar es un cajón y sin esto no se ve en
          qué obra estás. Es pulsable y abre el cajón con el menú de obra
          desplegado. Al truncar cede ella, no el título. */}
      <button
        type="button"
        onClick={() => openDrawer({ menuObra: true })}
        className="order-2 flex-1 min-w-0 inline-flex items-center gap-1 py-1.5 -my-1.5 text-[11px] font-mono uppercase text-text-secondary hover:text-text-primary transition-colors sm:hidden"
        style={{ letterSpacing: '0.06em' }}
        aria-label={`Obra: ${nombreObra ?? 'sin obra'}. Abrir menú de obra`}
      >
        <Folder size={12} className="shrink-0 text-accent" aria-hidden="true" />
        <span className="truncate">{nombreObra ?? 'Sin obra'}</span>
      </button>

      {/* Los dos desplegables. En móvil cierran la fila de arriba; a partir de
          `sm` se van a la derecha con `ml-auto` (en móvil NO lo llevan: un
          margen automático se come el hueco libre ANTES de que la obra pueda
          crecer, y la dejaría en nada). */}
      <div className="order-3 flex items-center gap-1 shrink-0 sm:order-4 sm:ml-auto">
        {/* Ajustes: las dos herramientas (Asistente, Calculadora) +
            Preferencias + Estudio y compartir. Se llamó «Menú» entre el
            2026-09-22 y el 24; el componente conserva el nombre `MenuApp`. */}
        <MenuApp onCopyLink={handleCopyUrl} onOpenCalculator={openCalc} />
        {/* Salida del módulo: el desplegable que trae el propio módulo.
            D-I4: conserva su outline SUTIL y no hereda el fuerte. Nadie es ya
            la acción primaria de la barra —el acento se muda con el asistente a
            su píldora—, y la barra queda tranquila a propósito. */}
        {exportMenu}
      </div>

      {/* La miga. `w-full` la baja a su propia fila en móvil, donde tiene los
          335 px para ella sola; a partir de `sm` vuelve a la fila única, entre
          la hamburguesa y los desplegables. El grupo y la barra «/» sólo salen
          desde `sm`: en móvil la obra ya no está al lado, así que un «/» suelto
          delante del título no separaría nada, y el grupo es contexto que ya da
          el cajón. */}
      <div className="order-4 w-full flex items-center gap-2 min-w-0 sm:order-3 sm:w-auto">
        <span className="hidden sm:inline text-[11px] font-mono text-text-disabled uppercase whitespace-nowrap shrink-0" style={{ letterSpacing: '0.06em' }}>
          {moduleGroup}
        </span>
        <span className="hidden sm:inline text-text-disabled shrink-0">/</span>
        <span className="text-[13px] font-medium text-text-primary min-w-0 truncate">
          {moduleLabel}
        </span>
        {/* La miga sigue con el cálculo abierto: «HORMIGÓN / Vigas / V-3». Se
            coloca sola —sabe qué módulo es por la ruta— y no aparece en los
            módulos sin nada guardado en el anejo. */}
        <PiezaMenu />
      </div>
    </header>
  );
}
