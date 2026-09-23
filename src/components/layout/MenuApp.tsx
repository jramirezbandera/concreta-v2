// Menú de la topbar (rediseño 2026-09-22). Sucede al «Ajustes» de 2026-07-17 y
// recoge, además de lo que aquél tenía, las dos herramientas que vivían sueltas
// en la barra: el Asistente IA y la Calculadora. La barra queda con `Menú` +
// `Exportar`, y el acento fuerte se muda con el asistente a su píldora de la
// esquina (ver DESIGN.md, entrada 2026-09-22, que REVOCA la de 2026-07-17).
//
// Decisiones que este componente encarna (plan «Menú + asistente siempre
// visible», revisión de diseño del 2026-09-22):
//
// - D-I3 — se llama «Menú», y la hamburguesa del Sidebar pasa a anunciarse como
//   «Abrir navegación»: eran dos controles de la misma barra que se anunciaban
//   igual al lector de pantalla.
// - D-I7 — UNA sola forma en las 29 pantallas. Las filas que no aplican NO se
//   esconden: salen apagadas y con la razón. Antes «Unidades» desaparecía y el
//   menú tenía cuatro formas distintas, así que «la tercera de la lista» dejaba
//   de ser un sitio y la memoria muscular no servía.
// - D-I11 — el icono es `MoreHorizontal`, no `SlidersHorizontal`: por debajo de
//   `sm` el disparador va sin rótulo, y unos deslizadores prometen preferencias
//   cuando detrás están las dos acciones principales.
// - D-I14 — al elegir una herramienta el foco vuelve AL DISPARADOR antes de
//   abrirla. Si no, el asistente memoriza como origen una fila que se desmonta
//   con el menú, y al cerrarlo el foco cae al <body>. Mismo patrón que
//   `ExportarMenu` (DESIGN.md, 2026-09-05).
// - D-I18 — ya NO se anuncia `role="menu"`: eso promete navegación por flechas,
//   y aquí hay dos conmutadores y un enlace, que no son `menuitem`. Un panel con
//   botones es accesible de serie (Tab recorre, Intro activa, Escape cierra) y
//   no miente. Los grupos son `role="group"` con su cabecera.
// - R7 / D-I18 — las filas de Herramientas miden 44 px siempre; el resto, 44 px
//   por debajo de `lg` y 36 px en escritorio, para no perder densidad.
import { useEffect, useId, useRef, useState } from 'react';
import { NavLink } from 'react-router';
import { Building2, ChevronDown, Link2, MoreHorizontal, Sparkles } from 'lucide-react';
import { ThemeToggle } from '../theme/ThemeToggle';
import { UnitSystemToggle } from '../units/UnitSystemToggle';
import { useAsistente, type EstadoAsistente } from '../ai/asistente-context';
import { useUnitSystem } from '../../lib/units/useUnitSystem';
import { getRouteLoader } from '../../data/routeLoaders';
import { useRoutePrefetch } from '../../hooks/useRoutePrefetch';

const RUTA_ESTUDIO = '/ajustes/estudio';

// Alturas (R7 / D-I18): las herramientas, 44 px siempre —es el mínimo táctil y
// son las dos acciones más usadas—; el resto, 44 px por debajo de `lg` y 36 px
// en escritorio, para no perder la densidad de la casa.
const FILA = 'w-full px-3 text-[12.5px] text-left transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-accent';
const EN_FILA = 'flex items-center gap-2.5';
const ALTO_HERRAMIENTA = 'min-h-11';
const ALTO_NORMAL = 'min-h-11 lg:min-h-9';

const FILA_HERRAMIENTA = `${FILA} ${EN_FILA} ${ALTO_HERRAMIENTA}`;
const FILA_NORMAL = `${FILA} ${EN_FILA} ${ALTO_NORMAL}`;
/** Fila apagada: no es `flex` porque la razón va en su propia línea, debajo. */
const FILA_APAGADA = `${FILA} py-2 text-text-disabled`;

const KEYCAP = 'ml-auto font-mono text-[10px] text-text-disabled border border-border-sub rounded px-1 py-px';

interface MenuAppProps {
  /** Copia el enlace del cálculo. */
  onCopyLink: () => void;
  /** Abre la calculadora (el provider global del shell). */
  onOpenCalculator: () => void;
}

/** Cabecera de grupo — misma receta que los section headers de DESIGN.md. */
function GrupoHeader({ id, children }: { id: string; children: string }) {
  return (
    <p
      id={id}
      className="px-3 pt-2.5 pb-1 text-[10px] font-semibold uppercase text-text-disabled"
      style={{ letterSpacing: '0.08em' }}
    >
      {children}
    </p>
  );
}

/**
 * Motivo de una fila apagada: por qué no se puede usar aquí (D-I7). `sangria`
 * la alinea con el rótulo cuando la fila lleva icono (14 px + el gap de 10),
 * en vez de dejarla colgando debajo del icono.
 */
function Razon({ children, sangria = false }: { children: string; sangria?: boolean }) {
  return (
    <span className={`block text-[11px] leading-snug text-text-disabled ${sangria ? 'pl-6' : ''}`}>
      {children}
    </span>
  );
}

/**
 * El mismo punto de estado que lleva la píldora, aquí en la fila (D-I19).
 *
 * Por debajo de 768 px NO hay píldora, así que esta fila es el único sitio
 * donde se ve que el asistente dejó algo esperando: una propuesta sin aplicar,
 * un error, o una conversación viva escondida con la ✕. Sin esto, en el
 * teléfono «esconder en vez de descartar» sería un estado invisible, que es
 * peor que descartar.
 */
function PuntoEstado({ estado }: { estado: EstadoAsistente }) {
  if (estado === 'reposo') return null;
  const color =
    estado === 'error'
      ? 'var(--color-state-fail)'
      : estado === 'sin-clave'
        ? 'var(--color-state-neutral)'
        : 'var(--color-accent)';
  return (
    <span
      className="w-[7px] h-[7px] rounded-full shrink-0"
      aria-hidden="true"
      style={{
        background: color,
        boxShadow:
          estado === 'propuesta'
            ? `0 0 0 3px color-mix(in srgb, ${color} 30%, transparent)`
            : `0 0 6px color-mix(in srgb, ${color} 60%, transparent)`,
      }}
    />
  );
}

/** Lo mismo que dice el punto, para quien no lo ve. */
function textoEstado(estado: EstadoAsistente): string {
  switch (estado) {
    case 'cargando':
      return ' (pensando)';
    case 'propuesta':
      return ' (propuesta sin aplicar)';
    case 'error':
      return ' (el último turno falló)';
    case 'sin-clave':
      return ' (falta la clave)';
    case 'viva':
      return ' (conversación abierta)';
    default:
      return '';
  }
}

export function MenuApp({ onCopyLink, onOpenCalculator }: MenuAppProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Las unidades siguen siendo condicionales (algunos módulos las fijan), pero
  // ahora la fila se queda y se apaga en vez de desaparecer.
  const { toggleDisabled } = useUnitSystem();
  const { prefetch } = useRoutePrefetch();
  /**
   * El asistente entero sale del provider y no de una prop (T2). «Hay asistente
   * en esta pantalla» lo sabe él, porque es el módulo quien se lo dice al
   * montarse; pasarlo además por prop era la misma verdad en dos sitios, que es
   * justo lo que dejó el atajo «A» colgando cuando se movió su botón. Sin
   * provider —tests del menú aislado— no hay asistente y la fila sale apagada.
   */
  const { disponible: hayAsistente, estado, abrir } = useAsistente();
  const base = useId();
  const idHerramientas = `${base}-herramientas`;
  const idPreferencias = `${base}-preferencias`;
  const idEstudio = `${base}-estudio`;

  // Mismo trato que en el sidebar: al pasar por encima se trae el chunk, que
  // llega antes de que el puntero baje a soltar el clic.
  const prefetchEstudio = () => {
    const loader = getRouteLoader(RUTA_ESTUDIO);
    if (loader) prefetch(RUTA_ESTUDIO, loader);
  };

  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  /**
   * D-I14: cerrar, devolver el foco al disparador y SÓLO ENTONCES abrir. El
   * orden importa: la herramienta memoriza `document.activeElement` al montarse
   * para devolverle el foco al cerrarse, y si eso es una fila del menú, para
   * entonces ya no existe.
   */
  const abrirHerramienta = (abrir: () => void) => {
    setOpen(false);
    triggerRef.current?.focus();
    abrir();
  };

  return (
    <div ref={ref} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        title="Menú"
        aria-label="Menú"
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[12px] text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors"
      >
        <MoreHorizontal size={14} aria-hidden="true" />
        {/* D-I16: el rótulo aparece desde `sm`, no desde `lg`. Entre 640 y 1023
            px el icono iba solo y era toda la información disponible para
            decidir si pulsar, justo cuando detrás están asistente y calculadora. */}
        <span className="hidden sm:inline">Menú</span>
        <ChevronDown
          size={12}
          aria-hidden="true"
          className={`transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1.5 w-64 rounded-md border border-border-main bg-bg-surface z-50 overflow-hidden"
          style={{ boxShadow: '0 12px 30px -12px rgba(0,0,0,0.45)' }}
        >
          <div role="group" aria-labelledby={idHerramientas}>
            <GrupoHeader id={idHerramientas}>Herramientas</GrupoHeader>
            {hayAsistente ? (
              <button
                type="button"
                onClick={() => abrirHerramienta(() => abrir('menu'))}
                aria-label={`Asistente IA${textoEstado(estado)}`}
                className={`${FILA_HERRAMIENTA} text-text-primary hover:bg-bg-elevated`}
              >
                <Sparkles size={14} className="text-accent shrink-0" aria-hidden="true" />
                Asistente IA
                <PuntoEstado estado={estado} />
                {/* D-I15 / R6: el atajo sigue a la vista aunque el botón ya no
                    esté en la barra. El listener vive en el provider. */}
                <span className={KEYCAP}>A</span>
              </button>
            ) : (
              <div className={FILA_APAGADA}>
                <span className={EN_FILA}>
                  <Sparkles size={14} className="shrink-0" aria-hidden="true" />
                  Asistente IA
                </span>
                <Razon sangria>El asistente no trabaja en esta pantalla.</Razon>
              </div>
            )}
            <button
              type="button"
              onClick={() => abrirHerramienta(onOpenCalculator)}
              className={`${FILA_HERRAMIENTA} text-text-primary hover:bg-bg-elevated`}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                className="text-accent shrink-0"
                aria-hidden="true"
              >
                <rect x="3" y="2" width="10" height="12" rx="0.5" />
                <path d="M5 5h6" strokeLinecap="round" />
                <circle cx="5.5" cy="8" r="0.5" fill="currentColor" />
                <circle cx="8" cy="8" r="0.5" fill="currentColor" />
                <circle cx="10.5" cy="8" r="0.5" fill="currentColor" />
                <circle cx="5.5" cy="11" r="0.5" fill="currentColor" />
                <circle cx="8" cy="11" r="0.5" fill="currentColor" />
                <circle cx="10.5" cy="11" r="0.5" fill="currentColor" />
              </svg>
              Calculadora
              <span className={KEYCAP}>C</span>
            </button>
          </div>

          <div role="group" aria-labelledby={idPreferencias} className="border-t border-border-sub">
            <GrupoHeader id={idPreferencias}>Preferencias</GrupoHeader>
            {toggleDisabled ? (
              <div className={FILA_APAGADA}>
                Unidades
                <Razon>Este módulo fija las unidades.</Razon>
              </div>
            ) : (
              <div className={`${FILA_NORMAL} text-text-primary`}>
                <span>Unidades</span>
                <span className="ml-auto">
                  <UnitSystemToggle />
                </span>
              </div>
            )}
            <div className={`${FILA_NORMAL} text-text-primary`}>
              <span>Tema</span>
              <span className="ml-auto">
                <ThemeToggle />
              </span>
            </div>
          </div>

          <div role="group" aria-labelledby={idEstudio} className="border-t border-border-sub">
            <GrupoHeader id={idEstudio}>Estudio y compartir</GrupoHeader>
            <NavLink
              to={RUTA_ESTUDIO}
              onClick={() => setOpen(false)}
              onMouseEnter={prefetchEstudio}
              onFocus={prefetchEstudio}
              className={({ isActive }) =>
                [FILA_NORMAL, isActive ? 'text-accent' : 'text-text-primary hover:bg-bg-elevated'].join(' ')
              }
            >
              {({ isActive }) => (
                <>
                  <Building2
                    size={14}
                    className={`shrink-0 ${isActive ? 'text-accent' : 'text-text-secondary'}`}
                    aria-hidden="true"
                  />
                  Mi estudio
                </>
              )}
            </NavLink>
            <button
              type="button"
              onClick={() => {
                onCopyLink();
                setOpen(false);
              }}
              className={`${FILA_NORMAL} text-text-primary hover:bg-bg-elevated`}
            >
              <Link2 size={14} className="text-text-secondary shrink-0" aria-hidden="true" />
              Copiar enlace
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
