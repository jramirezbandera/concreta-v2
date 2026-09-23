// La píldora del asistente — abajo a la derecha, siempre puesta (T3).
//
// Antes era un sub-estado del modal y estaba a TRES gestos del arranque (abrir
// → reducir a esquina → minimizar), así que casi nadie la había visto. Ahora es
// la casa del asistente en escritorio y, con ella, el ÚNICO acento fuerte de la
// pantalla: al salir el asistente de la topbar, el acento se mudó aquí (D-I4).
//
// Como va a estar siempre en pantalla, es un INDICADOR, no un botón: cuenta seis
// estados (D-I5) por color de punto y por copy. El copy es el canal fiable —el
// color se pierde en un monitor malo o con daltonismo, el texto no—, así que
// cada estado dice lo suyo con palabras además de con color.
//
// Va por `createPortal` a `document.body` a propósito: un ancestro con
// `translate`/`scale`/`rotate` convierte a sus descendientes `position: fixed`
// en hijos suyos, y `Sidebar.tsx` lleva `max-lg:translate-x-0`. Ya pasó con el
// diálogo de Nueva obra, que se quedó encajado en 204 px. El provider hoy cuelga
// fuera del Sidebar, así que no haría falta; el portal es lo que garantiza que
// siga siendo verdad si alguien lo mueve de sitio.
import { createPortal } from 'react-dom';
import { Sparkles } from 'lucide-react';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { useTheme } from '../../lib/theme/useTheme';
import type { EstadoAsistente } from './asistente-context';

interface AiPillProps {
  estado: EstadoAsistente;
  turnos: number;
  onClick: () => void;
}

interface Pinta {
  /** Token del punto. */
  color: string;
  /** Anillo de «hay algo que atender», reservado a la propuesta pendiente. */
  anillo: boolean;
  /** Atenuado: aún no ha pasado nada en este módulo. */
  tenue: boolean;
}

function pinta(estado: EstadoAsistente): Pinta {
  switch (estado) {
    case 'propuesta':
      return { color: 'var(--color-accent)', anillo: true, tenue: false };
    case 'error':
      return { color: 'var(--color-state-fail)', anillo: false, tenue: false };
    case 'sin-clave':
      return { color: 'var(--color-state-neutral)', anillo: false, tenue: false };
    case 'reposo':
      return { color: 'var(--color-accent)', anillo: false, tenue: true };
    default:
      return { color: 'var(--color-accent)', anillo: false, tenue: false };
  }
}

function rotulo(estado: EstadoAsistente, turnos: number): string {
  switch (estado) {
    case 'cargando':
      return 'Pensando…';
    case 'propuesta':
      return 'Asistente · propuesta';
    case 'error':
      return 'Asistente · error';
    case 'sin-clave':
      return 'Asistente · configurar';
    case 'viva':
      return turnos > 0 ? `Asistente · ${turnos}` : 'Asistente';
    default:
      return 'Asistente';
  }
}

/** Lo que oye quien no ve el punto: el estado, en palabras, dentro del propio botón. */
function etiquetaAccesible(estado: EstadoAsistente, turnos: number): string {
  switch (estado) {
    case 'cargando':
      return 'El asistente está pensando. Abrir';
    case 'propuesta':
      return 'El asistente tiene una propuesta sin aplicar. Abrir';
    case 'error':
      return 'El último turno del asistente falló. Abrir';
    case 'sin-clave':
      return 'El asistente necesita una clave. Configurar';
    case 'viva':
      return `Asistente con ${turnos} ${turnos === 1 ? 'turno' : 'turnos'}. Abrir`;
    default:
      return 'Abrir asistente IA';
  }
}

export function AiPill({ estado, turnos, onClick }: AiPillProps) {
  const isDark = useTheme().theme === 'dark';
  const menosMovimiento = useMediaQuery('(prefers-reduced-motion: reduce)');
  const { color, anillo, tenue } = pinta(estado);

  const pildora = (
    <button
      type="button"
      onClick={onClick}
      data-estado={estado}
      title="Asistente IA (A)"
      aria-label={etiquetaAccesible(estado, turnos)}
      className="fixed z-50 inline-flex items-center gap-2.5 h-[38px] px-3.5 rounded-md overflow-hidden bg-bg-surface border border-border-main text-[12px] text-text-primary hover:border-accent/40 transition-colors"
      style={{
        right: 16,
        bottom: 16,
        background: isDark
          ? 'linear-gradient(180deg, var(--color-bg-elevated), var(--color-bg-surface))'
          : undefined,
        // Sombra con desplazamiento y desenfoque: eso es profundidad. (El halo
        // sin desplazamiento del punto es otra cosa, y es decoración: se
        // mantiene por decisión expresa del usuario, ver I10.)
        boxShadow: isDark
          ? '0 14px 30px -8px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.06)'
          : '0 12px 24px -8px rgba(15,23,42,0.28)',
      }}
    >
      <span
        className="w-[7px] h-[7px] rounded-full shrink-0"
        aria-hidden="true"
        style={{
          background: color,
          opacity: tenue ? 0.55 : 1,
          boxShadow: anillo
            ? `0 0 0 3px color-mix(in srgb, ${color} 30%, transparent)`
            : `0 0 6px color-mix(in srgb, ${color} 60%, transparent)`,
        }}
      />
      <Sparkles size={14} className="text-accent shrink-0" aria-hidden="true" />
      <span className="font-medium whitespace-nowrap">{rotulo(estado, turnos)}</span>
      <span className="font-mono text-[10px] text-text-disabled border border-border-sub rounded px-1">
        A
      </span>

      {/*
        «Cargando» NO es un punto que parpadea: el punto pulsante es uno de los
        tics que delatan una interfaz generada, y además chocaría con el anillo
        de «propuesta pendiente», que ya usa ese mismo recurso. Es una hebra que
        recorre el borde inferior — la misma receta que la barra de progreso de
        ruta de la casa, incluido el respeto por «menos movimiento». Un solo
        momento de movimiento en toda la pantalla.
      */}
      {estado === 'cargando' && (
        <span
          aria-hidden="true"
          className={[
            'absolute left-0 right-0 bottom-0 h-[2px]',
            menosMovimiento
              ? 'bg-accent/50'
              : 'bg-gradient-to-r from-transparent via-accent to-transparent bg-[length:40%_100%] bg-no-repeat animate-route-progress',
          ].join(' ')}
        />
      )}
    </button>
  );

  if (typeof document === 'undefined') return pildora;
  return createPortal(pildora, document.body);
}
