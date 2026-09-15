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
import { CampoSugerido } from '../ui/CampoSugerido';
import { HelpTooltip } from '../ui/HelpTooltip';
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
          <CampoSugerido
            id="dialogo-obra-uso"
            value={uso}
            onChange={setUso}
            sugerencias={USOS_SUGERIDOS}
            etiquetaLista="Usos habituales"
            placeholder="Nave industrial"
            className={INPUT}
          />
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
          {/* Qué altitud es: la del TERRENO, no la del edificio, y es la que
              decide la nieve. El ⓘ va FUERA del <label> —dentro, pulsarlo
              llevaría el foco a la caja en vez de abrir la ayuda—. */}
          <span className="mb-1 flex items-center gap-1 text-[11.5px] text-text-secondary">
            <label htmlFor="dialogo-obra-altitud">Altitud</label>
            <HelpTooltip
              text="La del terreno donde se construye, sobre el nivel del mar; no la altura del edificio. De ella sale la nieve por zona y altitud y, por encima de 1.000 m, el hielo en los voladizos y los ψ de nieve alta."
              refText="DB SE-AE 3.5.2 · tabla E.2 · DB SE tabla 4.2"
              fieldLabel="Altitud"
            />
          </span>
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

        {/* Opcionales para CREAR la obra, no para entregarla: la memoria los
            necesita, y sin ellos el panel los pedirá. Decirlo aquí evita que
            «opcional» se lea como «da igual». */}
        <p className="col-span-2 m-0 text-[11px] leading-snug text-text-disabled">
          El municipio y la altitud se pueden dejar para después, pero la memoria los necesita: el panel de la obra los pedirá.
        </p>
      </div>
    </DialogoNombre>
  );
}
