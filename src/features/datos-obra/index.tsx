/**
 * Datos de obra: los seis campos del contexto compartido (`concreta-obra`) en
 * una página propia, dentro del grupo PROYECTO.
 *
 * Hasta ahora sólo se tecleaban desde la barra de Cargas por planta o de la
 * ficha DB SE. Con proyectos, la obra viaja en la raíz del `.concreta.json` y
 * da nombre al proyecto, así que necesita un sitio propio donde verla entera.
 * Cada cambio se escribe al momento: no hay «guardar» aparte de la obra.
 */

import { useState } from 'react';
import { useDrawer } from '../../components/layout/AppShell';
import { Topbar } from '../../components/layout/Topbar';
import { RawNumberInput } from '../../components/units/RawNumberInput';
import { guardarObra, leerObra, obraVacia, type Obra } from '../../lib/obra';
import { useNombreObra } from '../../lib/proyecto/useProyectoActivo';
import { USOS_SUGERIDOS } from '../memoria-dbse/catalogos';
import { PROVINCIA_OPCIONES } from '../viento-nieve/catalogos';

const INPUT =
  'w-full min-w-0 rounded border border-border-main bg-bg-primary px-2 py-1.5 text-[12.5px] text-text-primary placeholder:text-text-disabled focus:border-accent focus:outline-none';
const ETIQUETA = 'block text-[11.5px] text-text-secondary mb-1';
const NOTA = 'mt-1 text-[11px] text-text-disabled';

export function DatosObraModule() {
  const { openDrawer } = useDrawer();
  const nombreProyecto = useNombreObra();
  const [obra, setObra] = useState<Obra>(() => leerObra() ?? obraVacia());
  const [ineTexto, setIneTexto] = useState(obra.ine ?? '');

  const cambiar = (cambio: Partial<Obra>) => setObra(guardarObra(cambio));

  const cambiarIne = (v: string) => {
    const limpio = v.replace(/\D/g, '').slice(0, 5);
    setIneTexto(limpio);
    if (limpio === '') cambiar({ ine: null });
    else if (limpio.length === 5) cambiar({ ine: limpio });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Topbar moduleGroup="Proyecto" moduleLabel="Datos de obra" onMenuOpen={openDrawer} />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[720px] px-5 py-5">
          <p className="m-0 text-[12.5px] leading-relaxed text-text-secondary">
            Estos datos los heredan todos los módulos (materiales, viento y nieve, cargas, sismo, la ficha DB SE) y viajan con la
            obra al exportarla. La denominación es el nombre de la obra en el menú.
          </p>
          <p className={`${NOTA} mt-2`}>
            {nombreProyecto
              ? `Obra abierta: ${nombreProyecto}. Los cambios se guardan con ella.`
              : 'Todavía no hay obra guardada: estos datos se guardarán con ella cuando la guardes desde el menú de obra.'}
          </p>

          <div className="mt-5 grid grid-cols-1 gap-x-4 gap-y-3.5 md:grid-cols-2">
            <div className="md:col-span-2">
              <label htmlFor="obra-denominacion" className={ETIQUETA}>
                Denominación
              </label>
              <input
                id="obra-denominacion"
                type="text"
                value={obra.denominacion}
                placeholder="Reposición de nave industrial colindante"
                className={INPUT}
                onChange={(e) => cambiar({ denominacion: e.target.value })}
              />
            </div>

            <div className="md:col-span-2">
              <label htmlFor="obra-uso" className={ETIQUETA}>
                Uso
              </label>
              <input
                id="obra-uso"
                type="text"
                list="obra-usos"
                value={obra.uso}
                placeholder="Nave industrial"
                className={INPUT}
                onChange={(e) => cambiar({ uso: e.target.value })}
              />
              <datalist id="obra-usos">
                {USOS_SUGERIDOS.map((u) => (
                  <option key={u} value={u} />
                ))}
              </datalist>
            </div>

            <div>
              <label htmlFor="obra-provincia" className={ETIQUETA}>
                Provincia
              </label>
              <select id="obra-provincia" value={obra.provincia} className={INPUT} onChange={(e) => cambiar({ provincia: e.target.value })}>
                <option value="">Sin decir</option>
                {PROVINCIA_OPCIONES.map((o) => (
                  <option key={o.ine} value={o.ine}>
                    {o.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="obra-municipio" className={ETIQUETA}>
                Municipio
              </label>
              <input
                id="obra-municipio"
                type="text"
                value={obra.municipio}
                placeholder="Dos Hermanas"
                className={INPUT}
                onChange={(e) => cambiar({ municipio: e.target.value })}
              />
              <p className={NOTA}>Es lo que comprueba que lo publicado por un módulo es de esta obra.</p>
            </div>

            <div>
              <label htmlFor="obra-altitud" className={ETIQUETA}>
                Altitud
              </label>
              <RawNumberInput
                id="obra-altitud"
                value={obra.altitud ?? NaN}
                onChange={(v) => cambiar({ altitud: Number.isFinite(v) ? v : null })}
                ariaLabel="Altitud"
                unit="m"
                min={0}
                max={4000}
                widthClass="w-28"
              />
              <p className={NOTA}>Sin decirla va vacía, no a cero: cero es el mar. Cambia la nieve a partir de 1.000 m.</p>
            </div>

            <div>
              <label htmlFor="obra-ine" className={ETIQUETA}>
                Código INE del municipio
              </label>
              <input
                id="obra-ine"
                type="text"
                inputMode="numeric"
                value={ineTexto}
                placeholder="41038"
                className={`${INPUT} w-28`}
                onChange={(e) => cambiarIne(e.target.value)}
              />
              <p className={NOTA}>Cinco cifras; opcional. Lo usan sismo y nieve para reconocer el municipio.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
