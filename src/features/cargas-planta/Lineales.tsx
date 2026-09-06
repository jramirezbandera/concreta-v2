/**
 * M3 — Cargas lineales.
 *
 * Cerramientos, muros, petos y barandillas: lo que apoya en línea sobre vigas y
 * forjados, en kN/m. Son pesos permanentes; la columna azul es su valor de
 * cálculo con γG.
 *
 * Un muro se teclea COMO UN MURO: peso por m² de alzado y altura real, y la
 * carga por metro sale de multiplicarlos. Los cerramientos de la tabla C.5
 * están dados para unos 3 m de altura libre, y con la altura de verdad de la
 * planta el número deja de ser el de un edificio cualquiera. Lo que no es un
 * muro —una barandilla— sigue tecleándose directamente en kN/m.
 */

import { Trash2 } from 'lucide-react';
import { RawNumberInput } from '../../components/units/RawNumberInput';
import type { LinealResuelto } from '../../lib/acciones/cargas';
import { toDisplay } from '../../lib/units/convert';
import { getPrecision, getUnitLabel } from '../../lib/units/format';
import { useUnitSystem } from '../../lib/units/useUnitSystem';
import { CATALOGO_LINEALES } from './catalogos';
import type { LinealUI } from './state';

const INPUT =
  'w-full min-w-0 rounded border border-border-main bg-bg-primary px-2 py-1 text-[12px] text-text-primary focus:border-accent focus:outline-none';
const TH = 'border-b border-border-main px-2 py-1.5 text-left text-[10px] font-semibold uppercase text-text-disabled';
const TH_NUM = `${TH} text-right`;
const TH_DER = 'border-b border-border-main px-2 py-1.5 text-right text-[10px] font-semibold uppercase text-accent';
const TD_DER = 'px-2 py-1.5 text-right font-mono text-[12px] text-text-primary';
/** Una caja de número obedece al `text-right` de la celda sólo dentro de un flex. */
const CAJA_DER = 'flex justify-end';

interface Props {
  lineales: LinealUI[];
  resultado: LinealResuelto[];
  ayuda: boolean;
  onLineal: (id: string, cambio: Partial<LinealUI>) => void;
  onAnadir: (catalogoId: string) => void;
  onBorrar: (id: string) => void;
}

const dec = (v: number, d: number) => v.toFixed(d).replace('.', ',');

/** Lo que se le pone al desplegable detrás del nombre: la carga con la que arranca. */
function sufijoCatalogo(c: (typeof CATALOGO_LINEALES)[number]): string {
  if (c.valor !== null) return ` (${dec(c.valor, 1)} kN/m)`;
  if (c.alzado !== null && c.altura !== null && c.alzado > 0) return ` (${dec(c.alzado * c.altura, 1)} kN/m a ${dec(c.altura, 2)} m)`;
  return '';
}

export function Lineales({ lineales, resultado, ayuda, onLineal, onAnadir, onBorrar }: Props) {
  const { system } = useUnitSystem();
  const uL = getUnitLabel('linearLoad', system);
  const mostrar = (v: number) => dec(toDisplay(v, 'linearLoad', system), getPrecision('linearLoad', system));
  const porId = new Map(resultado.filter((l) => l.id).map((l) => [l.id as string, l]));

  return (
    <section className="rounded border border-border-main bg-bg-surface">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border-main px-4 py-2.5">
        <span className="rounded bg-bg-elevated px-1.5 py-0.5 font-mono text-[10px] text-text-disabled">M3</span>
        <h2 className="text-[13px] font-semibold text-text-primary">Cargas lineales</h2>
        <span className="text-[11px] text-text-disabled">DB SE-AE Anejo C, tabla C.5</span>
      </header>

      {ayuda && (
        <p className="border-b border-border-sub px-4 py-2 text-[11.5px] leading-snug text-text-disabled">
          Cerramientos de fachada, muros, tabiques pesados, petos y barandillas: cargas por metro que el programa de
          cálculo recibe sobre vigas y bordes de forjado. Un muro se mide por su alzado: teclee lo que pesa un metro
          cuadrado de fábrica y la altura de la planta, y la carga por metro sale sola. Los valores del catálogo son los
          de la tabla C.5, que los da para unos 3 m de altura libre.
        </p>
      )}

      <div className="overflow-x-auto">
        {/* Anchos fijos: con el reparto automático la papelera se llevaba 130 px
            y el valor quedaba lejos de su cabecera. El nombre se queda con el resto. */}
        <table className="w-full table-fixed border-collapse text-[12px]">
          <colgroup>
            <col />
            <col style={{ width: 112 }} />
            <col style={{ width: 96 }} />
            <col style={{ width: 112 }} />
            <col style={{ width: 104 }} />
            <col style={{ width: 44 }} />
          </colgroup>
          <thead>
            <tr>
              <th className={TH}>Elemento</th>
              <th className={TH_NUM} title="Lo que pesa un metro cuadrado de muro">
                Alzado (kN/m²)
              </th>
              <th className={TH_NUM}>Altura (m)</th>
              <th className={TH_NUM}>Carga (kN/m)</th>
              <th className={TH_DER} title="1,35 · gk">
                Gd ({uL})
              </th>
              <th className={TH} aria-label="Acciones" />
            </tr>
          </thead>
          <tbody>
            {lineales.map((l) => {
              const r = porId.get(l.id);
              const nombre = l.concepto || 'el elemento';
              // Un muro tiene alzado y altura; lo demás se teclea en kN/m.
              const esMuro = l.alzado !== null && l.altura !== null;
              return (
                <tr key={l.id} className="border-b border-border-sub last:border-0 align-top">
                  <td className="px-2 py-1.5">
                    <input type="text" value={l.concepto} aria-label="Elemento de carga lineal" placeholder="Elemento" className={INPUT} onChange={(ev) => onLineal(l.id, { concepto: ev.target.value })} />
                  </td>
                  <td className="px-2 py-1.5">
                    {esMuro ? (
                      <span className={CAJA_DER}>
                        <RawNumberInput value={l.alzado ?? 0} onChange={(alzado) => onLineal(l.id, { alzado })} ariaLabel={`Peso por metro cuadrado de alzado de ${nombre}`} min={0} precision={2} widthClass="w-16" hideUnit />
                      </span>
                    ) : (
                      <div className={`${TD_DER} text-text-disabled`}>—</div>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    {esMuro ? (
                      <span className={CAJA_DER}>
                        <RawNumberInput value={l.altura ?? 0} onChange={(altura) => onLineal(l.id, { altura })} ariaLabel={`Altura de ${nombre}`} min={0} widthClass="w-14" hideUnit />
                      </span>
                    ) : (
                      <div className={`${TD_DER} text-text-disabled`}>—</div>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    {esMuro ? (
                      // Derivado: alzado por altura. Va en acento, que es como
                      // el módulo dice «esto lo pone la app, no se teclea».
                      <div className={`${TD_DER} text-accent`}>{r ? dec(r.gk, 2) : '—'}</div>
                    ) : (
                      <span className={CAJA_DER}>
                        <RawNumberInput value={l.valor} onChange={(valor) => onLineal(l.id, { valor })} ariaLabel={`Carga de ${nombre}`} min={0} widthClass="w-16" hideUnit />
                      </span>
                    )}
                  </td>
                  <td className={TD_DER}>{r ? mostrar(r.Gd) : '—'}</td>
                  <td className="px-2 py-1.5 text-right">
                    <button type="button" onClick={() => onBorrar(l.id)} aria-label={`Borrar ${nombre}`} className="rounded p-1 text-text-disabled hover:text-state-fail">
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border-sub px-4 py-2">
        <select value="" aria-label="Añadir carga lineal" className={INPUT + ' max-w-[300px]'} onChange={(ev) => ev.target.value && onAnadir(ev.target.value)}>
          <option value="">+ Añadir del catálogo…</option>
          {CATALOGO_LINEALES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.etiqueta}
              {sufijoCatalogo(c)}
            </option>
          ))}
        </select>
      </div>
    </section>
  );
}
