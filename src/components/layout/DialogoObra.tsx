/**
 * Los cinco datos de la obra, en el sitio donde se crea la obra.
 *
 * Hasta 2026-09-12 vivían en una página propia (`/proyecto/datos`) Y, otra vez,
 * dentro de la ficha DB SE, con dos botones para copiarlos de un lado a otro.
 * Eran la misma información en dos formularios que podían discrepar, y era la
 * primera queja del usuario sobre la ficha.
 *
 * Compone `DialogoNombre`, que conserva su contrato de UN campo para «Guardar
 * obra», «Exportar obra» y «hay cálculos sin obra»: aquí sólo se le añaden los
 * otros cuatro por su hueco de campos extra.
 *
 * La PROVINCIA es obligatoria: sin ella no hay zona eólica, ni zona de nieve,
 * ni peligrosidad sísmica, y los tres módulos de acciones arrancan en blanco.
 * El municipio y la altitud no lo son —se pueden averiguar después—, pero la
 * altitud cambia la nieve por encima de los 1.000 m y por eso se pide aquí.
 */

import { useState } from 'react';
import { RawNumberInput } from '../units/RawNumberInput';
import { USOS_SUGERIDOS } from '../../features/memoria-dbse/catalogos';
import { PROVINCIA_OPCIONES } from '../../features/viento-nieve/catalogos';
import { obraVacia, type Obra } from '../../lib/obra';
import { DialogoNombre } from './DialogoNombre';

const INPUT =
  'w-full min-w-0 rounded border border-border-main bg-bg-primary px-2 py-1.5 text-[12.5px] text-text-primary placeholder:text-text-disabled focus:border-accent focus:outline-none';
const ETIQUETA = 'block text-[11.5px] text-text-secondary mb-1';

interface Props {
  titulo: string;
  texto: string;
  confirmar: string;
  /** Lo que ya se sabe de la obra. En «Nueva obra» viene vacía. */
  inicial?: Obra | null;
  onConfirm: (obra: Obra) => void;
  onCancel: () => void;
}

export function DialogoObra({ titulo, texto, confirmar, inicial, onConfirm, onCancel }: Props) {
  const base = inicial ?? obraVacia();
  const [uso, setUso] = useState(base.uso);
  const [provincia, setProvincia] = useState(base.provincia);
  const [municipio, setMunicipio] = useState(base.municipio);
  const [altitud, setAltitud] = useState<number | null>(base.altitud);

  const impedimento = provincia === '' ? 'Falta la provincia: de ella salen el viento, la nieve y el sismo.' : null;

  return (
    <DialogoNombre
      titulo={titulo}
      texto={texto}
      confirmar={confirmar}
      inicial={base.denominacion}
      impedimento={impedimento}
      onConfirm={(denominacion) => onConfirm({ denominacion, uso, provincia, municipio, altitud })}
      onCancel={onCancel}
    >
      <div className="mt-3.5 grid grid-cols-2 gap-x-3 gap-y-3">
        <div className="col-span-2">
          <label htmlFor="dialogo-obra-uso" className={ETIQUETA}>
            Uso
          </label>
          <input
            id="dialogo-obra-uso"
            type="text"
            list="dialogo-obra-usos"
            value={uso}
            placeholder="Nave industrial"
            className={INPUT}
            onChange={(e) => setUso(e.target.value)}
          />
          <datalist id="dialogo-obra-usos">
            {USOS_SUGERIDOS.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
        </div>

        <div className="col-span-2">
          <label htmlFor="dialogo-obra-provincia" className={ETIQUETA}>
            Provincia
          </label>
          <select id="dialogo-obra-provincia" value={provincia} className={INPUT} onChange={(e) => setProvincia(e.target.value)}>
            <option value="">Sin decir</option>
            {PROVINCIA_OPCIONES.map((o) => (
              <option key={o.ine} value={o.ine}>
                {o.nombre}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="dialogo-obra-municipio" className={ETIQUETA}>
            Municipio
          </label>
          <input
            id="dialogo-obra-municipio"
            type="text"
            value={municipio}
            placeholder="Dos Hermanas"
            className={INPUT}
            onChange={(e) => setMunicipio(e.target.value)}
          />
        </div>

        <div>
          <label htmlFor="dialogo-obra-altitud" className={ETIQUETA}>
            Altitud
          </label>
          <RawNumberInput
            id="dialogo-obra-altitud"
            value={altitud ?? NaN}
            onChange={(v) => setAltitud(Number.isFinite(v) ? v : null)}
            ariaLabel="Altitud"
            unit="m"
            min={0}
            max={4000}
            widthClass="w-full"
          />
        </div>
      </div>
    </DialogoNombre>
  );
}
