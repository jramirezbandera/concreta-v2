/**
 * M3 — Cargas lineales.
 *
 * Cerramientos, petos y barandillas: lo que apoya en línea sobre vigas y
 * forjados, en kN/m. Son pesos permanentes; la columna azul es su valor de
 * cálculo con γG.
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
const TH_DER = 'border-b border-border-main px-2 py-1.5 text-right text-[10px] font-semibold uppercase text-accent';
const TD_DER = 'px-2 py-1.5 text-right font-mono text-[12px] text-text-primary';

interface Props {
  lineales: LinealUI[];
  resultado: LinealResuelto[];
  ayuda: boolean;
  onLineal: (id: string, cambio: Partial<LinealUI>) => void;
  onAnadir: (catalogoId: string) => void;
  onBorrar: (id: string) => void;
}

const dec = (v: number, d: number) => v.toFixed(d).replace('.', ',');

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
          Cerramientos de fachada, tabiques pesados, petos y barandillas: cargas por metro que el programa de
          cálculo recibe sobre vigas y bordes de forjado. Los valores del catálogo son los de la tabla C.5 para unos
          3 m de altura libre; ajústelos a la altura real.
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr>
              <th className={TH}>Elemento</th>
              <th className={TH}>Carga</th>
              <th className={TH_DER} title="1,35 · gk">Gd ({uL})</th>
              <th className={TH} aria-label="Acciones" />
            </tr>
          </thead>
          <tbody>
            {lineales.map((l) => {
              const r = porId.get(l.id);
              return (
                <tr key={l.id} className="border-b border-border-sub last:border-0 align-top">
                  <td className="px-2 py-1.5">
                    <input type="text" value={l.concepto} aria-label="Elemento de carga lineal" placeholder="Elemento" className={INPUT} onChange={(ev) => onLineal(l.id, { concepto: ev.target.value })} />
                  </td>
                  <td className="px-2 py-1.5">
                    <RawNumberInput value={l.valor} onChange={(valor) => onLineal(l.id, { valor })} ariaLabel={`Carga de ${l.concepto || 'el elemento'}`} unit="kN/m" min={0} widthClass="w-20" />
                  </td>
                  <td className={TD_DER}>{r ? mostrar(r.Gd) : '—'}</td>
                  <td className="px-2 py-1.5 text-right">
                    <button type="button" onClick={() => onBorrar(l.id)} aria-label={`Borrar ${l.concepto || 'el elemento'}`} className="rounded p-1 text-text-disabled hover:text-state-fail">
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
              {c.valor !== null ? ` (${dec(c.valor, 1)} kN/m)` : ''}
            </option>
          ))}
        </select>
      </div>
    </section>
  );
}
