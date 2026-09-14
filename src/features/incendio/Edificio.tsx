/**
 * El edificio: las plantas, sus alturas y la altura de evacuación.
 *
 * Las plantas NO se teclean aquí. Vienen de «Cargas por planta», que es donde
 * ya están, y este tablero sólo les añade lo que aquel módulo no necesita: la
 * altura de cada una y si está bajo rasante.
 *
 * EL CONVENIO DE ALTURAS SE ELIGE Y SE ROTULA, porque «la altura de una planta»
 * significa dos cosas y de confundirlas salen cotas equivocadas en el canto de
 * un forjado por planta:
 *
 *   TOTAL  de forjado a forjado, con el canto dentro. Es como se acotan los
 *          planos de estructura y no depende de ningún otro dato.
 *   LIBRE  de su forjado a la cara inferior del de encima. Es la que se lee en
 *          una sección de arquitectura; para subir a la planta siguiente se le
 *          suma el canto del forjado de arriba, que «Cargas por planta» publica.
 *
 * Se teclee la que se teclee, la tabla enseña las dos y el canto que ha usado:
 * así se ve la suma y no hay que fiarse de haber entendido bien el rótulo.
 */

import { ExternalLink } from 'lucide-react';
import { Link } from 'react-router';
import type { ModoAltura } from '../../lib/incendio/altura';
import { AYUDA, INPUT, ROTULO, TH } from './estilos';
import type { AnotacionPlanta, Evaluacion } from './state';

interface Props {
  evaluacion: Evaluacion;
  ayuda: boolean;
  modoAltura: ModoAltura;
  alturaManual: number | null;
  onPlanta: (nombre: string, cambio: Partial<AnotacionPlanta>) => void;
  onAlturaManual: (v: number | null) => void;
  onModoAltura: (modo: ModoAltura) => void;
}

const m2 = (v: number) => v.toFixed(2).replace('.', ',');

export function Edificio({
  evaluacion,
  ayuda,
  modoAltura,
  alturaManual,
  onPlanta,
  onAlturaManual,
  onModoAltura,
}: Props) {
  const { plantas, alturas, alturaEvacuacion, alturaAMano, sinPlantas } = evaluacion;
  // De arriba abajo en pantalla, que es como se mira un edificio; la cuenta va
  // al revés y la hace `alturasDeEvacuacion`.
  const filas = [...alturas.plantas].reverse();
  const libre = modoAltura === 'libre';

  return (
    <section className="border-b border-border-sub px-1 pb-4">
      <p className={ROTULO}>El edificio</p>

      {sinPlantas ? (
        <div className="rounded border border-border-sub bg-bg-elevated px-3 py-2.5">
          <p className="text-[12px] text-text-secondary">
            Las plantas salen de <strong className="font-semibold">Cargas por planta</strong>.
          </p>
          <p className={`${AYUDA} pt-1`}>
            Calcule allí las cargas de la obra y aquí aparecerán solas, con su uso y su canto.
            Mientras tanto, teclee abajo la altura de evacuación.
          </p>
          <Link
            to="/acciones/cargas-planta"
            className="mt-2 inline-flex items-center gap-1 text-[11px] text-accent hover:underline"
          >
            Abrir Cargas por planta <ExternalLink size={11} aria-hidden="true" />
          </Link>
        </div>
      ) : (
        <>
          {/* Qué se teclea. Va ARRIBA de la tabla porque cambia lo que
              significa cada casilla de la columna de altura. */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pb-2">
            <span className="text-[11px] text-text-secondary">Las alturas que tecleo son la</span>
            <select
              value={modoAltura}
              aria-label="Qué altura se teclea en cada planta"
              className={`${INPUT} max-w-[190px]`}
              onChange={(e) => onModoAltura(e.target.value === 'libre' ? 'libre' : 'total')}
            >
              <option value="total">total (forjado a forjado)</option>
              <option value="libre">libre (bajo el forjado)</option>
            </select>
          </div>

          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={TH}>Planta</th>
                <th
                  className={TH}
                  style={{ width: 72 }}
                  title={
                    libre
                      ? 'De la cara superior de su forjado a la cara inferior del forjado de encima'
                      : 'De la cara superior de su forjado a la cara superior del forjado de encima'
                  }
                >
                  {libre ? 'Libre' : 'Total'}
                </th>
                <th
                  className={TH}
                  style={{ width: 92 }}
                  title={
                    libre
                      ? 'Canto del forjado de encima, y la altura total que resulta'
                      : 'La altura libre que resulta de descontar el canto del forjado de encima'
                  }
                >
                  {libre ? '+ canto' : 'Libre'}
                </th>
                <th className={TH} style={{ width: 56 }}>Cota</th>
                <th className={TH} style={{ width: 40 }} title="Planta bajo rasante">Sót.</th>
                <th className={TH} style={{ width: 40 }} title="¿Es origen de evacuación?">Ocup.</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((p) => {
                const anotada = plantas.find((x) => x.nombre === p.nombre);
                const faltaAltura = !p.esLaMasAlta && (p.altura === null || p.altura <= 0);
                // En modo libre, un canto que falta corta la cuenta igual que
                // una altura: hay que poder teclearlo.
                const cantoPedido = libre && !p.esLaMasAlta && p.cantoUsado === null;
                return (
                  <tr key={p.nombre} className="border-b border-border-sub last:border-0">
                    <td className="px-2 py-1 text-[12px] text-text-primary">
                      {p.nombre}
                      {p.esSalida && (
                        <span
                          className="ml-1 text-[10px] text-text-disabled"
                          title="Planta de salida del edificio: cota 0"
                        >
                          · salida
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1">
                      {p.esLaMasAlta ? (
                        <span className="text-[11px] text-text-disabled" title="No tiene forjado encima que medir">
                          —
                        </span>
                      ) : (
                        <input
                          type="number"
                          step="0.05"
                          min="0"
                          value={p.altura ?? ''}
                          aria-label={`Altura de ${p.nombre}`}
                          className={INPUT}
                          style={faltaAltura ? { borderColor: 'var(--color-state-fail)' } : undefined}
                          onChange={(e) =>
                            onPlanta(p.nombre, {
                              altura: e.target.value === '' ? null : Number(e.target.value),
                            })
                          }
                        />
                      )}
                    </td>
                    {/* La otra altura, y en modo libre el canto que se le suma. */}
                    <td className="px-2 py-1">
                      {p.esLaMasAlta ? (
                        <span className="text-[11px] text-text-disabled">—</span>
                      ) : cantoPedido ? (
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={anotada?.canto ?? ''}
                          placeholder="canto"
                          aria-label={`Canto del forjado sobre ${p.nombre}`}
                          className={INPUT}
                          style={{ borderColor: 'var(--color-state-fail)' }}
                          title={
                            anotada?.cantosDistintos
                              ? 'Esa planta tiene zonas con cantos distintos en Cargas por planta: elija uno'
                              : 'Cargas por planta no publica el canto de esa planta'
                          }
                          onChange={(e) =>
                            onPlanta(p.nombre, {
                              cantoManual: e.target.value === '' ? null : Number(e.target.value),
                            })
                          }
                        />
                      ) : (
                        <span
                          className="font-mono text-[11px] text-text-disabled"
                          title={
                            libre
                              ? `Canto del forjado de encima, de Cargas por planta. Total: ${p.subida !== null ? `${m2(p.subida)} m` : '—'}`
                              : 'Descontando el canto del forjado de encima'
                          }
                        >
                          {libre
                            ? p.cantoUsado === null
                              ? '—'
                              : `+${m2(p.cantoUsado)} = ${p.subida !== null ? m2(p.subida) : '—'}`
                            : p.otraAltura === null
                              ? '—'
                              : m2(p.otraAltura)}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1 font-mono text-[11px] text-text-secondary">
                      {p.cota === null ? '—' : `${p.cota > 0 ? '+' : ''}${m2(p.cota)}`}
                    </td>
                    <td className="px-2 py-1 text-center">
                      <input
                        type="checkbox"
                        checked={p.bajoRasante}
                        aria-label={`${p.nombre} está bajo rasante`}
                        onChange={(e) => onPlanta(p.nombre, { bajoRasante: e.target.checked })}
                      />
                    </td>
                    <td className="px-2 py-1 text-center">
                      <input
                        type="checkbox"
                        checked={p.cuenta}
                        aria-label={`${p.nombre} cuenta para la altura de evacuación`}
                        title={
                          anotada?.decidida === null
                            ? `Propuesto por el uso del forjado: ${anotada.propuesta ? 'sí cuenta' : 'de ocupación nula'}`
                            : 'Decidido a mano'
                        }
                        onChange={(e) => onPlanta(p.nombre, { cuenta: e.target.checked })}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {ayuda && (
            <p className={`${AYUDA} pt-2`}>
              {libre
                ? 'La altura libre va de la cara superior del forjado de cada planta a la cara inferior del forjado de encima. Para subir a la planta siguiente se le suma el canto de ese forjado, que trae Cargas por planta; la columna de al lado enseña la suma. Si una planta tiene allí zonas con cantos distintos, el canto se teclea aquí.'
                : 'La altura total va de la cara superior del forjado de cada planta a la cara superior del forjado de encima: el canto ya está dentro. Es como se acotan los forjados en los planos de estructura. La columna de al lado enseña la libre que resulta.'}{' '}
              La más alta no lleva altura: no tiene forjado encima que medir. Las cotas salen de ahí,
              con el cero en el forjado de la planta de salida. «Ocup.» es si esa planta es origen de
              evacuación: se propone por el uso con el que se dimensionó su forjado, y las cubiertas
              accesibles sólo para conservación quedan fuera (Anejo A del DB SI). Los trasteros
              también son de ocupación nula, pero eso hay que decirlo a mano.
            </p>
          )}
        </>
      )}

      {/* La altura de evacuación: derivada, y pisable. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-3">
        <span className="text-[11px] text-text-secondary">Altura de evacuación</span>
        <input
          type="number"
          step="0.05"
          min="0"
          value={alturaManual ?? ''}
          placeholder={alturas.descendente !== null ? m2(alturas.descendente) : '—'}
          aria-label="Altura de evacuación del edificio"
          className={`${INPUT} max-w-[90px]`}
          onChange={(e) => onAlturaManual(e.target.value === '' ? null : Number(e.target.value))}
        />
        <span className="text-[11px] text-text-disabled">m</span>
        {alturaAMano ? (
          <button
            type="button"
            className="text-[11px] text-accent hover:underline"
            onClick={() => onAlturaManual(null)}
          >
            volver a la de las plantas
          </button>
        ) : (
          alturaEvacuacion !== null && (
            <span className="text-[11px] text-text-disabled">
              de las plantas
              {alturas.ascendente !== null && alturas.ascendente > 0
                ? ` · ${m2(alturas.ascendente)} m ascendente`
                : ''}
            </span>
          )
        )}
      </div>
      {ayuda && (
        <p className={`${AYUDA} pt-1`}>
          Máxima diferencia de cotas entre un origen de evacuación y la salida del edificio (Anejo A
          del DB SI). Es la que entra en la tabla 3.1.
        </p>
      )}
    </section>
  );
}
