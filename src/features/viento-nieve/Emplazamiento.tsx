/**
 * M1 — ¿Dónde está la obra?
 *
 * Provincia, municipio y altitud; de ahí salen la zona eólica y la zona de
 * clima invernal. Las dos zonas se enseñan como valores derivados (azul) con
 * su aviso de frontera cuando el mapa parte la provincia, y se pueden forzar:
 * la norma va por mapa, no por provincia, y el usuario que ve que su municipio
 * está al otro lado de la línea tiene que poder decirlo.
 */

import { RawNumberInput } from '../../components/units/RawNumberInput';
import { ZONAS_EOLICAS, ZONAS_INVERNALES, type ZonaEolica, type ZonaInvernal } from '../../lib/acciones/tablasAE';
import type { Obra } from '../../lib/obra';
import { PROVINCIA_OPCIONES } from './catalogos';
import type { Emplazamiento as EmplazamientoUI, Zonas } from './state';

const INPUT =
  'w-full min-w-0 rounded border border-border-main bg-bg-primary px-2 py-1 text-[12px] text-text-primary focus:border-accent focus:outline-none';
const HUECO = { background: 'color-mix(in srgb, var(--color-state-fail) 8%, transparent)' };

interface Props {
  e: EmplazamientoUI;
  zonas: Zonas;
  ayuda: boolean;
  /** Obra guardada en el contexto compartido, si la hay. */
  obra: Obra | null;
  onCambiar: (cambio: Partial<EmplazamientoUI>) => void;
  onUsarObra: () => void;
  onGuardarObra: () => void;
}

function Fila({ etiqueta, children, hueco }: { etiqueta: string; children: React.ReactNode; hueco?: boolean }) {
  return (
    <label className="flex min-w-0 flex-col gap-1 rounded px-1 py-0.5" style={hueco ? HUECO : undefined}>
      <span className={['text-[11px]', hueco ? 'text-state-fail' : 'text-text-secondary'].join(' ')}>{etiqueta}</span>
      {children}
    </label>
  );
}

function Derivado({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 px-1 py-0.5">
      <span className="text-[11px] text-accent">{etiqueta}</span>
      {children}
    </div>
  );
}

export function Emplazamiento({ e, zonas, ayuda, obra, onCambiar, onUsarObra, onGuardarObra }: Props) {
  const p = zonas.provincia;
  const obraDistinta =
    obra !== null &&
    (obra.provincia !== e.provincia || obra.municipio !== e.municipio || obra.altitud !== e.altitud);

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
          La provincia decide la zona eólica (mapa D.1 del DB SE-AE) y la zona de clima invernal (mapa E.2);
          la altitud, junto con la zona, la carga de nieve. Los mapas van por líneas, no por provincias: si su
          municipio está cerca de una frontera, el aviso se lo dice y puede forzar la zona. Si la obra está en
          la capital, la nieve sale directamente de la tabla 3.8.
        </p>
      )}

      <div className="grid gap-3 px-4 py-3 sm:grid-cols-2 lg:grid-cols-4">
        <Fila etiqueta="Provincia" hueco={!e.provincia}>
          <select
            value={e.provincia}
            aria-label="Provincia"
            className={INPUT}
            onChange={(ev) => onCambiar({ provincia: ev.target.value, zonaEolica: null, zonaInvernal: null, esCapital: false })}
          >
            <option value="">Elija la provincia</option>
            {PROVINCIA_OPCIONES.map((o) => (
              <option key={o.ine} value={o.ine}>
                {o.nombre}
              </option>
            ))}
          </select>
        </Fila>

        <Fila etiqueta="Municipio">
          <input
            type="text"
            value={e.municipio}
            aria-label="Municipio"
            placeholder="Se imprime en el cuadro"
            className={INPUT}
            onChange={(ev) => onCambiar({ municipio: ev.target.value })}
          />
        </Fila>

        <Fila etiqueta="Altitud sobre el nivel del mar" hueco={e.altitud === null}>
          <div className="flex items-center gap-2">
            <RawNumberInput
              value={e.altitud ?? 0}
              onChange={(v) => onCambiar({ altitud: v })}
              ariaLabel="Altitud"
              unit="m"
              min={0}
              max={4000}
              widthClass="w-24"
            />
            {/* En hueco la caja enseña «0» pero no hay dato: teclear otro 0 no
                dispara nada. Dos atajos honestos: nivel del mar, o la altitud de
                la capital de la tabla 3.8. */}
            {e.altitud === null && (
              <span className="flex flex-wrap gap-x-2 text-[11px] text-text-secondary">
                <button
                  type="button"
                  onClick={() => onCambiar({ altitud: 0 })}
                  className="underline decoration-dotted hover:text-text-primary"
                >
                  0 m
                </button>
                {p && (
                  <button
                    type="button"
                    onClick={() => onCambiar({ altitud: p.capital.altitud })}
                    className="underline decoration-dotted hover:text-text-primary"
                  >
                    {`la de ${p.capital.capital.split(' / ')[0]}: ${p.capital.altitud} m`}
                  </button>
                )}
              </span>
            )}
          </div>
        </Fila>

        <label className="flex items-center gap-2 self-end px-1 py-1 text-[12px] text-text-secondary">
          <input
            type="checkbox"
            checked={e.esCapital}
            disabled={!p}
            onChange={(ev) => onCambiar({ esCapital: ev.target.checked, ...(ev.target.checked && p ? { altitud: p.capital.altitud } : {}) })}
            className="accent-[var(--color-accent)]"
          />
          <span>
            La obra está en <b className="font-semibold text-text-primary">la capital</b>
            {p ? ` (${p.capital.capital.split(' / ')[0]})` : ''}
          </span>
        </label>
      </div>

      <div className="grid gap-3 border-t border-border-sub px-4 py-3 sm:grid-cols-2">
        <Derivado etiqueta="Zona eólica (mapa D.1)">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={e.zonaEolica ?? ''}
              aria-label="Zona eólica"
              disabled={!p}
              className={INPUT + ' max-w-[260px]'}
              onChange={(ev) => onCambiar({ zonaEolica: ev.target.value === '' ? null : (ev.target.value as ZonaEolica) })}
            >
              <option value="">
                {p ? `${p.zonaEolica} — la de la provincia (vb ${ZONAS_EOLICAS[p.zonaEolica].vb} m/s)` : 'Elija antes la provincia'}
              </option>
              {(['A', 'B', 'C'] as ZonaEolica[]).map((z) => (
                <option key={z} value={z}>
                  {z} — vb {ZONAS_EOLICAS[z].vb} m/s, qb {ZONAS_EOLICAS[z].qb.toFixed(2).replace('.', ',')} kN/m²
                  {p && z === p.zonaEolica ? ' (la de la provincia)' : ''}
                </option>
              ))}
            </select>
            {zonas.eolicaForzada && <span className="text-[11px] text-state-warn">forzada, la provincia es {p?.zonaEolica}</span>}
          </div>
          {p?.frontera?.eolica && (
            <p className="text-[11px] leading-snug text-state-warn">{p.frontera.eolica}</p>
          )}
        </Derivado>

        <Derivado etiqueta="Zona de clima invernal (mapa E.2)">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={e.zonaInvernal ?? ''}
              aria-label="Zona de clima invernal"
              disabled={!p}
              className={INPUT + ' max-w-[260px]'}
              onChange={(ev) =>
                onCambiar({ zonaInvernal: ev.target.value === '' ? null : (Number(ev.target.value) as ZonaInvernal) })
              }
            >
              <option value="">{p ? `${p.zonaInvernal} — la de la provincia` : 'Elija antes la provincia'}</option>
              {ZONAS_INVERNALES.map((z) => (
                <option key={z} value={z}>
                  Zona {z}
                  {p && z === p.zonaInvernal ? ' (la de la provincia)' : ''}
                </option>
              ))}
            </select>
            {zonas.invernalForzada && <span className="text-[11px] text-state-warn">forzada, la provincia es {p?.zonaInvernal}</span>}
          </div>
          {p?.frontera?.invernal && (
            <p className="text-[11px] leading-snug text-state-warn">{p.frontera.invernal}</p>
          )}
        </Derivado>
      </div>
    </section>
  );
}
