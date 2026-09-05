/**
 * ¿Dónde está la obra?
 *
 * Provincia, municipio y altitud; de ahí salen la zona eólica y la zona de
 * clima invernal. Las dos zonas se enseñan como valores derivados (azul) con
 * su aviso de frontera cuando el mapa parte la provincia, y se pueden forzar:
 * la norma va por mapa, no por provincia, y el usuario que ve que su municipio
 * está al otro lado de la línea tiene que poder decirlo. Sólo entrada: lo que
 * la norma pone con estos datos va en la columna de resultados.
 */

import { RawNumberInput } from '../../components/units/RawNumberInput';
import { ZONAS_EOLICAS, ZONAS_INVERNALES, type ZonaEolica, type ZonaInvernal } from '../../lib/acciones/tablasAE';
import type { Obra } from '../../lib/obra';
import { Campo, NotaSeccion } from './campos';
import { PROVINCIA_OPCIONES } from './catalogos';
import { BOTON_MENOR, INPUT } from './estilos';
import type { Emplazamiento as EmplazamientoUI, Zonas } from './state';

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

export function Emplazamiento({ e, zonas, ayuda, obra, onCambiar, onUsarObra, onGuardarObra }: Props) {
  const p = zonas.provincia;
  const obraDistinta = obra !== null && (obra.provincia !== e.provincia || obra.municipio !== e.municipio || obra.altitud !== e.altitud);

  return (
    <div className="flex flex-col gap-2.5">
      {ayuda && (
        <NotaSeccion>
          La provincia decide la zona eólica (mapa D.1) y la de clima invernal (mapa E.2); la altitud, la nieve. Los mapas van
          por líneas, no por provincias: si el municipio está cerca de una frontera, el aviso lo dice y la zona se puede forzar.
        </NotaSeccion>
      )}

      <Campo etiqueta="Provincia" hueco={!e.provincia}>
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
      </Campo>

      <Campo etiqueta="Municipio">
        <input
          type="text"
          value={e.municipio}
          aria-label="Municipio"
          placeholder="Se imprime en el cuadro"
          className={INPUT}
          onChange={(ev) => onCambiar({ municipio: ev.target.value })}
        />
      </Campo>

      <Campo etiqueta="Altitud sobre el nivel del mar" hueco={e.altitud === null}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <RawNumberInput value={e.altitud ?? 0} onChange={(v) => onCambiar({ altitud: v })} ariaLabel="Altitud" unit="m" min={0} max={4000} widthClass="w-20" />
          {/* En hueco la caja enseña «0» pero no hay dato: teclear otro 0 no
              dispara nada. Dos atajos honestos: nivel del mar, o la altitud de
              la capital de la tabla 3.8. */}
          {e.altitud === null && (
            <span className="flex flex-wrap gap-x-2 text-[11px] text-text-secondary">
              <button type="button" onClick={() => onCambiar({ altitud: 0 })} className="underline decoration-dotted hover:text-text-primary">
                0 m
              </button>
              {p && (
                <button type="button" onClick={() => onCambiar({ altitud: p.capital.altitud })} className="underline decoration-dotted hover:text-text-primary">
                  {`la de ${p.capital.capital.split(' / ')[0]}: ${p.capital.altitud} m`}
                </button>
              )}
            </span>
          )}
        </div>
      </Campo>

      <label className="flex items-center gap-2 text-[12px] text-text-secondary">
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

      <Campo etiqueta="Zona eólica (mapa D.1)" derivado nota={ayuda ? 'La de la provincia, salvo que se fuerce: el mapa cruza provincias.' : undefined}>
        <select
          value={e.zonaEolica ?? ''}
          aria-label="Zona eólica"
          disabled={!p}
          className={INPUT}
          onChange={(ev) => onCambiar({ zonaEolica: ev.target.value === '' ? null : (ev.target.value as ZonaEolica) })}
        >
          <option value="">{p ? `${p.zonaEolica} — la de la provincia (vb ${ZONAS_EOLICAS[p.zonaEolica].vb} m/s)` : 'Elija antes la provincia'}</option>
          {(['A', 'B', 'C'] as ZonaEolica[]).map((z) => (
            <option key={z} value={z}>
              {z} — vb {ZONAS_EOLICAS[z].vb} m/s, qb {ZONAS_EOLICAS[z].qb.toFixed(2).replace('.', ',')} kN/m²
              {p && z === p.zonaEolica ? ' (la de la provincia)' : ''}
            </option>
          ))}
        </select>
        {zonas.eolicaForzada && <span className="text-[11px] text-state-warn">forzada, la provincia es {p?.zonaEolica}</span>}
        {p?.frontera?.eolica && <p className="text-[11px] leading-snug text-state-warn">{p.frontera.eolica}</p>}
      </Campo>

      <Campo etiqueta="Zona de clima invernal (mapa E.2)" derivado>
        <select
          value={e.zonaInvernal ?? ''}
          aria-label="Zona de clima invernal"
          disabled={!p}
          className={INPUT}
          onChange={(ev) => onCambiar({ zonaInvernal: ev.target.value === '' ? null : (Number(ev.target.value) as ZonaInvernal) })}
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
        {p?.frontera?.invernal && <p className="text-[11px] leading-snug text-state-warn">{p.frontera.invernal}</p>}
      </Campo>

      {((obra && obraDistinta) || ((e.provincia || e.municipio) && (obra === null || obraDistinta))) && (
        <div className="flex flex-wrap gap-1.5">
          {obra && obraDistinta && (
            <button type="button" onClick={onUsarObra} className={BOTON_MENOR} title="Tomar provincia, municipio y altitud de los datos de la obra">
              Usar los datos de la obra{obra.municipio ? ` (${obra.municipio})` : ''}
            </button>
          )}
          {(e.provincia || e.municipio) && (obra === null || obraDistinta) && (
            <button type="button" onClick={onGuardarObra} className={BOTON_MENOR} title="Guardar este emplazamiento como datos de la obra, para que los demás módulos lo hereden">
              Guardar como datos de la obra
            </button>
          )}
        </div>
      )}
    </div>
  );
}
