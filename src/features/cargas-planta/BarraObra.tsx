/**
 * ¿Dónde está la obra? — una fila, no una tarjeta.
 *
 * Provincia, municipio y altitud no deciden ninguna tabla de este módulo salvo
 * los ψ de la nieve (cambian a 1.000 m): son sobre todo el nombre del sobre de
 * la publicación y lo que comprueba que la nieve tomada de Viento y nieve es de
 * esta obra. Por eso van arriba, en una línea, y no ocupan una sección entera.
 */

import type { ReactNode } from 'react';
import { RawNumberInput } from '../../components/units/RawNumberInput';
import type { Obra } from '../../lib/obra';
import { PROVINCIA_OPCIONES } from '../viento-nieve/catalogos';
import { BOTON_MENOR, INPUT_SUELTO } from './estilos';
import type { Emplazamiento } from './state';

interface Props {
  e: Emplazamiento;
  ayuda: boolean;
  /** Obra guardada en el contexto compartido, si la hay. */
  obra: Obra | null;
  onCambiar: (cambio: Partial<Emplazamiento>) => void;
  onUsarObra: () => void;
  onGuardarObra: () => void;
  /** El estado del módulo y el botón de Ayuda, alineados a la derecha de la misma fila. */
  derecha?: ReactNode;
}

export function BarraObra({ e, ayuda, obra, onCambiar, onUsarObra, onGuardarObra, derecha }: Props) {
  const obraDistinta = obra !== null && (obra.provincia !== e.provincia || obra.municipio !== e.municipio || obra.altitud !== e.altitud);

  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 border-b border-border-main bg-bg-surface px-3 py-1.5">
      <span className="shrink-0 text-[11.5px] text-text-secondary">¿Dónde está la obra?</span>

      <select
        value={e.provincia}
        aria-label="Provincia"
        className={INPUT_SUELTO + ' w-36 shrink-0'}
        onChange={(ev) => onCambiar({ provincia: ev.target.value })}
      >
        <option value="">Sin decir</option>
        {PROVINCIA_OPCIONES.map((o) => (
          <option key={o.ine} value={o.ine}>
            {o.nombre}
          </option>
        ))}
      </select>

      <input
        type="text"
        value={e.municipio}
        aria-label="Municipio"
        placeholder="Municipio"
        title="Se imprime en el cuadro y viaja en la publicación"
        className={INPUT_SUELTO + ' w-44 shrink-0'}
        onChange={(ev) => onCambiar({ municipio: ev.target.value })}
      />

      {/* La altitud sin rótulo era una caja con un número suelto: nadie sabe qué
          se le pide. Y sin decirla la caja va VACÍA, no a cero: cero es el mar. */}
      <div className="flex shrink-0 items-center gap-1.5">
        <label htmlFor="cargas-altitud" className="text-[11.5px] text-text-secondary">
          Altitud
        </label>
        <RawNumberInput
          id="cargas-altitud"
          value={e.altitud ?? NaN}
          onChange={(v) => onCambiar({ altitud: v })}
          ariaLabel="Altitud"
          unit="m"
          min={0}
          max={4000}
          widthClass="w-16"
        />
      </div>

      {e.altitud === null ? (
        ayuda && <span className="text-[11px] text-text-disabled">sin decir · ψ de nieve de ≤ 1.000 m</span>
      ) : (
        <button type="button" onClick={() => onCambiar({ altitud: null })} className="text-[11px] text-text-disabled underline decoration-dotted hover:text-text-secondary">
          borrar la altitud
        </button>
      )}

      {obra && obraDistinta && (
        <button type="button" onClick={onUsarObra} className={BOTON_MENOR} title="Tomar provincia, municipio y altitud de los datos de la obra">
          Usar los datos de la obra
          {obra.municipio ? ` (${obra.municipio})` : ''}
        </button>
      )}
      {(e.provincia || e.municipio) && (obra === null || obraDistinta) && (
        <button type="button" onClick={onGuardarObra} className={BOTON_MENOR} title="Guardar este emplazamiento como datos de la obra, para que los demás módulos lo hereden">
          Guardar como datos de la obra
        </button>
      )}

      {derecha && <div className="ml-auto flex shrink-0 items-center gap-2">{derecha}</div>}
    </div>
  );
}
