/**
 * La mesa de trabajo: una fila por zona de carga, una columna por pregunta.
 *
 * Sustituye al formulario de tarjetas que repetía el mismo bloque de campos en
 * cada zona de cada planta. Las cabeceras de grupo llevan la pregunta en
 * lenguaje de obra («¿qué forjado tiene?», «¿qué hay encima?») y las de columna,
 * el nombre corto con su unidad.
 *
 * La fila abierta despliega debajo su ficha (`Ficha.tsx`) y se resalta en la
 * sección de la derecha; pulsarla otra vez la cierra. Cada `<tr>` lleva
 * `data-zona` para que `useCotasFilas` mida a qué altura cae cada forjado.
 */

import { Fragment } from 'react';
import { Trash2 } from 'lucide-react';
import type { CargasResultado, ZonaCargasResuelta } from '../../lib/acciones/cargas';
import { CATALOGO_PERMANENTES } from './catalogos';
import { columnasEncima } from './columnas';
import { Ficha } from './Ficha';
import { FilaZona } from './FilaZona';
import { BOTON_MENOR, INPUT, TD, TH, TH_DER, TH_GRUPO, TH_NUM, TH_QD_STICKY } from './estilos';
import type { NievePublicada } from './nievePub';
import type { PlantaUI, ZonaUI } from './state';

const dec = (v: number, d: number) => v.toFixed(d).replace('.', ',');

/** «Planta Baja (Vaso piscina)» o «Planta Baja»: el mismo rótulo que usa el motor. */
const rotulo = (planta: string, zona: string) => (zona.trim() ? `${planta || 'Planta'} (${zona.trim()})` : planta || 'Planta');

interface Props {
  plantas: PlantaUI[];
  resultado: CargasResultado;
  nievePub: NievePublicada | null;
  avisosNieve: string[];
  ayuda: boolean;
  /** Id de la zona con la ficha abierta. */
  zonaSel: string | null;
  onSeleccionar: (id: string | null) => void;
  onPlanta: (id: string, cambio: Partial<PlantaUI>) => void;
  onZona: (plantaId: string, zonaId: string, cambio: Partial<ZonaUI>) => void;
  onAnadirPlanta: () => void;
  onDuplicarPlanta: (id: string) => void;
  onBorrarPlanta: (id: string) => void;
  onAnadirZona: (plantaId: string) => void;
  onMoverPlanta: (id: string, sentido: -1 | 1) => void;
  onBorrarZona: (plantaId: string, zonaId: string) => void;
  onUsarNieve: (plantaId: string, faldon: string | null) => void;
  onQuitarColumna: (clave: string) => void;
  onAnadirColumna: (catalogoId: string) => void;
  onRenombrarColumna: (clave: string, concepto: string) => void;
}

export function Tabla({
  plantas,
  resultado,
  nievePub,
  avisosNieve,
  ayuda,
  zonaSel,
  onSeleccionar,
  onPlanta,
  onZona,
  onAnadirPlanta,
  onDuplicarPlanta,
  onBorrarPlanta,
  onAnadirZona,
  onMoverPlanta,
  onBorrarZona,
  onUsarNieve,
  onQuitarColumna,
  onAnadirColumna,
  onRenombrarColumna,
}: Props) {
  const columnas = columnasEncima(plantas);
  const porId = new Map<string, ZonaCargasResuelta>();
  resultado.plantas.forEach((p) => p.zonas.forEach((z) => z.id && porId.set(z.id, z)));
  /** Columnas de la tabla: planta, zona, forjado, canto, PP, las de encima, uso, q uso, nieve, G, Q, qd. */
  const anchoTotal = 9 + columnas.length;
  /** Anchos en px. Con `table-fixed` mandan estos y nada empuja al resto. */
  const ANCHO = { planta: 126, zona: 68, forjado: 102, canto: 40, pp: 56, encima: 58, uso: 114, quso: 46, nieve: 54, G: 46, Q: 44, qd: 54 };
  const anchoPx =
    ANCHO.planta + ANCHO.zona + ANCHO.forjado + ANCHO.canto + ANCHO.pp + Math.max(1, columnas.length) * ANCHO.encima + ANCHO.uso + ANCHO.quso + ANCHO.nieve + ANCHO.G + ANCHO.Q + ANCHO.qd;

  return (
    <div className="flex min-w-0 flex-col">
      {ayuda && (
        <p className="px-1 pb-2 text-[11.5px] leading-snug text-text-disabled">
          Una fila por zona de carga. Diga qué forjado tiene, qué hay encima y para qué se usa: la norma pone en azul
          el peso propio, la sobrecarga y el valor de cálculo qd que se lleva al programa. Si una planta tiene partes
          con distinto uso o forjado —vivienda y vaso de piscina—, añádale una zona. Pulse una fila para ver lo que
          dice la norma en ella.
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full table-fixed border-collapse text-[12px]" style={{ minWidth: anchoPx }}>
          <caption className="sr-only">Cargas por planta y zona</caption>
          <colgroup>
            <col style={{ width: ANCHO.planta }} />
            <col style={{ width: ANCHO.zona }} />
            <col style={{ width: ANCHO.forjado }} />
            <col style={{ width: ANCHO.canto }} />
            <col style={{ width: ANCHO.pp }} />
            {columnas.length === 0 ? <col style={{ width: ANCHO.encima }} /> : columnas.map((c) => <col key={c.clave} style={{ width: ANCHO.encima }} />)}
            <col style={{ width: ANCHO.uso }} />
            <col style={{ width: ANCHO.quso }} />
            <col style={{ width: ANCHO.nieve }} />
            <col style={{ width: ANCHO.G }} />
            <col style={{ width: ANCHO.Q }} />
            <col style={{ width: ANCHO.qd }} />
          </colgroup>
          <thead>
            {/* Cabecera de grupo: las preguntas de obra */}
            <tr>
              <th colSpan={2} scope="colgroup" className={TH_GRUPO + ' border-l-0'}>
                <span className="block truncate">Plantas</span>
              </th>
              <th colSpan={3} scope="colgroup" className={TH_GRUPO}>
                <span className="block truncate">¿Qué forjado tiene? · C.5</span>
              </th>
              <th colSpan={Math.max(1, columnas.length)} scope="colgroup" className={TH_GRUPO}>
                <span className="block truncate">¿Qué hay encima? · kN/m² · C.5</span>
              </th>
              <th colSpan={2} scope="colgroup" className={TH_GRUPO}>
                <span className="block truncate">¿Para qué se usa? · 3.1</span>
              </th>
              <th scope="colgroup" className={TH_GRUPO} aria-label="Nieve" />
              <th colSpan={3} scope="colgroup" className={TH_GRUPO}>
                <span className="block truncate">Cálculo · DB SE 4.1</span>
              </th>
            </tr>
            {/* Cabecera de columna */}
            <tr>
              <th scope="col" className={TH}>
                Planta
              </th>
              <th scope="col" className={TH}>
                Zona
              </th>
              <th scope="col" className={TH}>
                Forjado
              </th>
              <th scope="col" className={TH_NUM}>
                Canto <span className="font-normal normal-case">cm</span>
              </th>
              <th scope="col" className={TH_DER} title="Peso propio del forjado">
                PP
              </th>
              {columnas.length === 0 && (
                <th scope="col" className={TH + ' text-[10px] font-normal normal-case text-text-disabled'}>
                  nada encima del forjado
                </th>
              )}
              {columnas.map((c) => (
                <th key={c.clave} scope="col" className={TH_NUM}>
                  <span className="flex items-center justify-end gap-0.5">
                    {c.catalogoId ? (
                      <span className="truncate" title={`${c.etiqueta} — quitar la columna la quita de todas las zonas`}>
                        {c.etiqueta.split(/[ ,(]/)[0]}
                      </span>
                    ) : (
                      <input
                        type="text"
                        value={c.etiqueta}
                        aria-label={`Nombre de la carga ${c.etiqueta}`}
                        className={INPUT + ' text-right text-[9.5px] uppercase'}
                        onChange={(ev) => onRenombrarColumna(c.clave, ev.target.value)}
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => onQuitarColumna(c.clave)}
                      aria-label={`Quitar ${c.etiqueta} de todas las zonas`}
                      title={`Quitar «${c.etiqueta}» de todas las zonas`}
                      className="shrink-0 rounded p-px text-text-disabled hover:text-state-fail"
                    >
                      <Trash2 size={11} aria-hidden="true" />
                    </button>
                  </span>
                </th>
              ))}
              <th scope="col" className={TH}>
                Uso
              </th>
              <th scope="col" className={TH_DER} title="Sobrecarga de uso de la tabla 3.1">
                q uso
              </th>
              <th scope="col" className={TH_NUM}>
                Nieve
              </th>
              <th scope="col" className={TH_DER} title="Carga permanente total">
                G
              </th>
              <th scope="col" className={TH_DER} title="Variable que manda">
                Q
              </th>
              <th scope="col" className={TH_DER} title="1,35 · G + 1,50 · Q" style={TH_QD_STICKY}>
                qd
              </th>
            </tr>
          </thead>

          <tbody>
            {plantas.map((planta, iPlanta) => {
              const plantaTocada = planta.zonas.some((z) => z.id === zonaSel);
              return (
                <Fragment key={planta.id}>
                  {planta.zonas.map((z, i) => {
                    const quien = rotulo(planta.nombre, z.nombre);
                    const seleccionada = z.id === zonaSel;
                    return (
                      <Fragment key={z.id}>
                        <FilaZona
                          planta={planta}
                          z={z}
                          r={porId.get(z.id)}
                          indice={i}
                          columnas={columnas}
                          quien={quien}
                          seleccionada={seleccionada}
                          plantaTocada={plantaTocada}
                          nievePubHay={nievePub !== null}
                          onSeleccionar={() => onSeleccionar(seleccionada ? null : z.id)}
                          onZona={(cambio) => onZona(planta.id, z.id, cambio)}
                          onPlanta={(cambio) => onPlanta(planta.id, cambio)}
                          onDuplicarPlanta={() => onDuplicarPlanta(planta.id)}
                          onBorrarPlanta={() => onBorrarPlanta(planta.id)}
                          onAnadirZona={() => onAnadirZona(planta.id)}
                          onMoverPlanta={(sentido) => onMoverPlanta(planta.id, sentido)}
                          puedeSubir={iPlanta > 0}
                          puedeBajar={iPlanta < plantas.length - 1}
                        />
                        {seleccionada && (
                          <tr data-ficha={z.id}>
                            <td colSpan={anchoTotal} className="p-0">
                              <Ficha
                                planta={planta}
                                z={z}
                                r={porId.get(z.id)}
                                quien={quien}
                                unica={planta.zonas.length === 1 && !z.nombre}
                                ayuda={ayuda}
                                nievePub={nievePub}
                                onZona={(cambio) => onZona(planta.id, z.id, cambio)}
                                onPlanta={(cambio) => onPlanta(planta.id, cambio)}
                                onBorrarZona={() => onBorrarZona(planta.id, z.id)}
                                onUsarNieve={(faldon) => onUsarNieve(planta.id, faldon)}
                              />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </Fragment>
              );
            })}

            <tr>
              <td colSpan={anchoTotal} className={TD + ' border-b-0'}>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <button type="button" onClick={onAnadirPlanta} className={BOTON_MENOR}>
                    + Añadir planta
                  </button>
                  <select
                    value=""
                    aria-label="Añadir una carga permanente a todas las zonas"
                    title="Añade la carga a las zonas que no la tienen, con el valor de la norma"
                    className={INPUT + ' max-w-[280px]'}
                    onChange={(ev) => ev.target.value && onAnadirColumna(ev.target.value)}
                  >
                    <option value="">+ Añadir una carga encima del forjado…</option>
                    {CATALOGO_PERMANENTES.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.etiqueta}
                        {c.valor !== null ? ` (${dec(c.valor, 1)} kN/m²)` : c.porEspesor !== null ? ` (${c.porEspesor} kN/m³)` : ''}
                      </option>
                    ))}
                  </select>
                  {ayuda && (
                    <span className="text-[10.5px] text-text-disabled">
                      La sección dibuja las plantas en este orden: use las flechas de cada planta para ponerlas como en
                      obra, de la cubierta a la planta baja. Una planta con partes distintas lleva una zona por parte.
                    </span>
                  )}
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {resultado.errores.map((e) => (
        <p key={e} className="px-1 pt-2 text-[11.5px] leading-snug text-state-fail">
          {e}
        </p>
      ))}
      {[...resultado.avisos, ...avisosNieve].map((a) => (
        <p key={a} className="px-1 pt-2 text-[11.5px] leading-snug text-state-warn">
          ⚠ {a}
        </p>
      ))}
    </div>
  );
}
