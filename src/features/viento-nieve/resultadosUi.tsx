/**
 * Piezas de la columna de resultados: cabecera ambiental con el estado del
 * cálculo, cabeceras de grupo, tabla compacta, avisos y notas. Las filas
 * etiqueta · valor son `ValueRow` de `components/checks`, como en el resto de
 * módulos; la insignia es propia porque aquí el estado no es CUMPLE/INCUMPLE
 * sino publicado / con avisos / sin publicar.
 */

import type { ReactNode } from 'react';
import { ambientStyle, STATUS_COLORS } from '../../components/checks';

export type Estado = 'ok' | 'warn' | 'fail';

const ETIQUETA: Record<Estado, string> = { ok: 'PUBLICADO', warn: 'AVISOS', fail: 'SIN PUBLICAR' };

export function Insignia({ estado, etiqueta }: { estado: Estado; etiqueta?: string }) {
  const c = STATUS_COLORS[estado];
  return (
    <span role="status" className="inline-flex items-center gap-1.5 rounded px-1.75 py-0.5 font-mono text-[10px] font-semibold tracking-[0.05em]" style={{ background: c.bg, color: c.fg }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'currentColor' }} aria-hidden="true" />
      {etiqueta ?? ETIQUETA[estado]}
    </span>
  );
}

export function CabeceraEstado({ estado, kicker, etiqueta, children }: { estado: Estado; kicker: string; etiqueta?: string; children: ReactNode }) {
  return (
    <div style={ambientStyle(estado)}>
      <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-2">
        <span className="text-[10px] font-semibold uppercase text-text-disabled" style={{ letterSpacing: '0.08em' }}>
          {kicker}
        </span>
        <Insignia estado={estado} etiqueta={etiqueta} />
      </div>
      <div className="px-4 pb-3">{children}</div>
    </div>
  );
}

/** El número grande de la cabecera. */
export function Grande({ valor, unidad, estado, sub }: { valor: string; unidad: string; estado: Estado; sub?: ReactNode }) {
  return (
    <>
      <div className="font-mono text-[26px] font-semibold tabular-nums" style={{ color: STATUS_COLORS[estado].fg }}>
        {valor} <span className="text-[13px] font-medium">{unidad}</span>
      </div>
      {sub && <div className="mt-0.5 text-[11px] leading-snug text-text-secondary">{sub}</div>}
    </>
  );
}

export function Grupo({ label, right }: { label: string; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-border-sub px-4 pt-3 pb-2">
      <p className="text-[10px] font-semibold uppercase text-text-disabled" style={{ letterSpacing: '0.08em' }}>
        {label}
      </p>
      {right && <span className="font-mono text-[10px] text-accent">{right}</span>}
    </div>
  );
}

export interface FilaTabla {
  clave: string;
  celdas: ReactNode[];
  seleccionada?: boolean;
  /** Fila de total: raya encima, negrita. */
  total?: boolean;
}

/** Tabla compacta: la primera columna alineada a la izquierda en sans, el resto números en mono a la derecha. */
export function Tabla({ columnas, filas, caption }: { columnas: string[]; filas: FilaTabla[]; caption?: string }) {
  return (
    <table className="w-full border-collapse text-[10.5px]">
      {caption && <caption className="px-4 pt-2 pb-1 text-left font-mono text-[10.5px] text-text-secondary">{caption}</caption>}
      <thead>
        <tr>
          {columnas.map((c, i) => (
            <th key={c} className={['border-b border-border-sub py-1 text-[9.5px] font-semibold uppercase text-text-disabled', i === 0 ? 'pl-4 pr-1 text-left' : 'px-1 text-right', i === columnas.length - 1 ? 'pr-4' : ''].join(' ')}>
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {filas.map((f) => (
          <tr
            key={f.clave}
            className={['border-b border-border-sub', f.total ? 'border-t border-t-border-main font-semibold' : ''].join(' ')}
            style={f.seleccionada ? { background: 'color-mix(in srgb, var(--color-accent) 8%, transparent)' } : undefined}
          >
            {f.celdas.map((c, i) => (
              <td key={i} className={['py-1 whitespace-nowrap', i === 0 ? 'pl-4 pr-1 text-left text-[11px] text-text-secondary' : 'px-1 text-right font-mono text-text-primary tabular-nums', i === f.celdas.length - 1 ? 'pr-4' : ''].join(' ')}>
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const TRIANGULO = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-0.5 shrink-0">
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
    <path d="M12 9v4M12 17h.01" />
  </svg>
);

/** Salvedad que el proyectista debe mirar: ámbar, con triángulo (regla de DESIGN.md). */
export function Aviso({ children }: { children: ReactNode }) {
  return (
    <div className="mx-4 my-2 flex gap-1.5 rounded px-2 py-1.5 text-[11px] leading-snug text-state-warn" style={{ background: 'color-mix(in srgb, var(--color-state-warn) 6%, transparent)' }}>
      {TRIANGULO}
      <span>{children}</span>
    </div>
  );
}

export function Nota({ children }: { children: ReactNode }) {
  return <p className="px-4 py-2 text-[11px] leading-relaxed text-text-disabled">{children}</p>;
}

/** Cómo salir del atasco, en lenguaje de obra (patrón de Muros de fábrica). */
export function Arreglo({ children }: { children: ReactNode }) {
  return (
    <div className="mx-4 mt-2 mb-3 rounded border border-accent/30 bg-accent/5 px-2 py-1.5">
      <div className="mb-0.5 font-mono text-[10px] uppercase text-accent" style={{ letterSpacing: '0.08em' }}>
        Cómo arreglarlo
      </div>
      <div className="text-[11px] leading-snug text-text-secondary">{children}</div>
    </div>
  );
}

export function Errores({ errores }: { errores: string[] }) {
  if (errores.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1 px-4 py-2">
      {errores.map((e) => (
        <li key={e} className="text-[11px] leading-snug text-state-fail">
          {e}
        </li>
      ))}
    </ul>
  );
}
