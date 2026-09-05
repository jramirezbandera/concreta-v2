/**
 * M1 — ¿Dónde está la obra?
 *
 * Provincia, municipio y altitud. Aquí no deciden ninguna tabla salvo los ψ
 * de la nieve (cambian a 1.000 m): son sobre todo el nombre del sobre de la
 * publicación y lo que comprueba que la nieve publicada es de la misma obra.
 */

import { RawNumberInput } from '../../components/units/RawNumberInput';
import type { Obra } from '../../lib/obra';
import { PROVINCIA_OPCIONES } from '../viento-nieve/catalogos';
import type { Emplazamiento } from './state';

const INPUT =
  'w-full min-w-0 rounded border border-border-main bg-bg-primary px-2 py-1 text-[12px] text-text-primary focus:border-accent focus:outline-none';

interface Props {
  e: Emplazamiento;
  ayuda: boolean;
  /** Obra guardada en el contexto compartido, si la hay. */
  obra: Obra | null;
  onCambiar: (cambio: Partial<Emplazamiento>) => void;
  onUsarObra: () => void;
  onGuardarObra: () => void;
}

function Fila({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1 rounded px-1 py-0.5">
      <span className="text-[11px] text-text-secondary">{etiqueta}</span>
      {children}
    </label>
  );
}

export function Cabecera({ e, ayuda, obra, onCambiar, onUsarObra, onGuardarObra }: Props) {
  const obraDistinta = obra !== null && (obra.provincia !== e.provincia || obra.municipio !== e.municipio || obra.altitud !== e.altitud);

  return (
    <section className="rounded border border-border-main bg-bg-surface">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border-main px-4 py-2.5">
        <span className="rounded bg-bg-elevated px-1.5 py-0.5 font-mono text-[10px] text-text-disabled">M1</span>
        <h2 className="text-[13px] font-semibold text-text-primary">¿Dónde está la obra?</h2>
        <div className="ml-auto flex flex-wrap items-center gap-2 text-[11.5px]">
          {obra && obraDistinta && (
            <button
              type="button"
              onClick={onUsarObra}
              className="rounded border border-border-main bg-bg-elevated px-2 py-0.5 text-text-secondary hover:text-text-primary"
              title="Tomar provincia, municipio y altitud de los datos de la obra"
            >
              Usar los datos de la obra
              {obra.municipio ? ` (${obra.municipio})` : ''}
            </button>
          )}
          {(e.provincia || e.municipio) && (obra === null || obraDistinta) && (
            <button
              type="button"
              onClick={onGuardarObra}
              className="rounded border border-border-main bg-bg-elevated px-2 py-0.5 text-text-secondary hover:text-text-primary"
              title="Guardar este emplazamiento como datos de la obra, para que los demás módulos lo hereden"
            >
              Guardar como datos de la obra
            </button>
          )}
        </div>
      </header>

      {ayuda && (
        <p className="border-b border-border-sub px-4 py-2 text-[11.5px] leading-snug text-text-disabled">
          El emplazamiento se imprime en el cuadro y va en la publicación, y es lo que comprueba que la nieve
          tomada de Viento y nieve es de la misma obra. La altitud sólo cambia los coeficientes de simultaneidad de
          la nieve por encima de 1.000 m.
        </p>
      )}

      <div className="grid gap-3 px-4 py-3 sm:grid-cols-3">
        <Fila etiqueta="Provincia">
          <select value={e.provincia} aria-label="Provincia" className={INPUT} onChange={(ev) => onCambiar({ provincia: ev.target.value })}>
            <option value="">Sin decir</option>
            {PROVINCIA_OPCIONES.map((o) => (
              <option key={o.ine} value={o.ine}>
                {o.nombre}
              </option>
            ))}
          </select>
        </Fila>
        <Fila etiqueta="Municipio">
          <input type="text" value={e.municipio} aria-label="Municipio" placeholder="Se imprime en el cuadro" className={INPUT} onChange={(ev) => onCambiar({ municipio: ev.target.value })} />
        </Fila>
        <Fila etiqueta="Altitud sobre el nivel del mar">
          <div className="flex items-center gap-2">
            <RawNumberInput value={e.altitud ?? 0} onChange={(v) => onCambiar({ altitud: v })} ariaLabel="Altitud" unit="m" min={0} max={4000} widthClass="w-24" />
            {e.altitud === null ? (
              <span className="text-[11px] text-text-disabled">sin decir (ψ de nieve de ≤ 1.000 m)</span>
            ) : (
              <button type="button" onClick={() => onCambiar({ altitud: null })} className="text-[11px] text-text-disabled underline decoration-dotted hover:text-text-secondary">
                borrar
              </button>
            )}
          </div>
        </Fila>
      </div>
    </section>
  );
}
