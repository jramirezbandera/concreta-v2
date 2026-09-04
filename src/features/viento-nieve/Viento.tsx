/**
 * M2 — Viento.
 *
 * Como en el cuadro de materiales, los valores derivados son columnas de la
 * propia tabla de plantas: a la izquierda lo que se contesta (nombre, altura),
 * a la derecha lo que pone la norma (ce, qb·ce y la fuerza en cada dirección).
 * Debajo, el resumen por dirección: esbeltez, coeficientes y fuerza total, y
 * el bloque opcional de la cubierta a dos aguas (`Cubierta.tsx`).
 */

import { Trash2 } from 'lucide-react';
import { RawNumberInput } from '../../components/units/RawNumberInput';
import { HelpTooltip } from '../../components/ui/HelpTooltip';
import { ToggleChip } from '../../components/ui/ToggleChip';
import type { DireccionViento, VientoResultado } from '../../lib/acciones/viento';
import { toDisplay } from '../../lib/units/convert';
import { getPrecision, getUnitLabel } from '../../lib/units/format';
import type { Quantity } from '../../lib/units/types';
import { useUnitSystem } from '../../lib/units/useUnitSystem';
import { ASPEREZA_OPCIONES, QB_MODO_OPCIONES, type QbModo } from './catalogos';
import { Cubierta } from './Cubierta';
import { alturaCoronacionDerivada, type PlantaUI, type VientoUI } from './state';

const INPUT =
  'w-full min-w-0 rounded border border-border-main bg-bg-primary px-2 py-1 text-[12px] text-text-primary focus:border-accent focus:outline-none';
const TH = 'border-b border-border-main px-2 py-1.5 text-left text-[10px] font-semibold uppercase text-text-disabled';
const TH_DER = 'border-b border-border-main px-2 py-1.5 text-right text-[10px] font-semibold uppercase text-accent';
const TD_DER = 'px-2 py-1.5 text-right font-mono text-[12px] text-text-primary';

interface Props {
  v: VientoUI;
  resultado: VientoResultado | null;
  /** Por qué no hay resultado, en lenguaje de obra. */
  motivoSinResultado: string | null;
  ayuda: boolean;
  onCambiar: (cambio: Partial<VientoUI>) => void;
  onPlanta: (id: string, cambio: Partial<PlantaUI>) => void;
  onAnadirPlanta: () => void;
  onBorrarPlanta: (id: string) => void;
}

function Fila({ etiqueta, ayuda, children }: { etiqueta: string; ayuda?: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="flex items-center gap-1 text-[11px] text-text-secondary">
        {etiqueta}
        {ayuda ? <HelpTooltip text={ayuda} fieldLabel={etiqueta} /> : null}
      </span>
      {children}
    </label>
  );
}

const dec = (v: number, n: number) => v.toFixed(n).replace('.', ',');

export function Viento({ v, resultado, motivoSinResultado, ayuda, onCambiar, onPlanta, onAnadirPlanta, onBorrarPlanta }: Props) {
  const { system } = useUnitSystem();
  const mostrar = (valor: number, q: Quantity) => dec(toDisplay(valor, q, system), getPrecision(q, system));
  const uF = getUnitLabel('force', system);
  const uQ = getUnitLabel('areaLoad', system);

  // Las plantas resueltas, por id: la tabla se pinta en el orden del usuario y
  // el motor las ordena por altura, así que no se pueden emparejar por índice.
  const porId = new Map<string, { x: DireccionViento['plantas'][number]; y: DireccionViento['plantas'][number] }>();
  if (resultado) {
    resultado.x.plantas.forEach((px, i) => {
      if (px.id) porId.set(px.id, { x: px, y: resultado.y.plantas[i] });
    });
  }
  const aspereza = ASPEREZA_OPCIONES.find((o) => o.id === v.aspereza);
  const qbModo = QB_MODO_OPCIONES.find((o) => o.id === v.qbModo);

  return (
    <section className="rounded border border-border-main bg-bg-surface">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border-main px-4 py-2.5">
        <span className="rounded bg-bg-elevated px-1.5 py-0.5 font-mono text-[10px] text-text-disabled">M2</span>
        <h2 className="text-[13px] font-semibold text-text-primary">Viento</h2>
        <span className="text-[11px] text-text-disabled">DB SE-AE art. 3.3 · Anejo D</span>
        <div className="ml-auto">
          <ToggleChip on={v.activo} onToggle={() => onCambiar({ activo: !v.activo })} onLabel="Incluido" offLabel="Omitido" ariaLabel="Incluir el viento" />
        </div>
      </header>

      {!v.activo ? (
        <p className="px-4 py-3 text-[12px] text-text-disabled">El viento no entra en esta obra. Púlselo para incluirlo.</p>
      ) : (
        <>
          {ayuda && (
            <p className="border-b border-border-sub px-4 py-2 text-[11.5px] leading-snug text-text-disabled">
              Diga cómo es el entorno, cuánto mide el edificio en planta y a qué altura está cada forjado. La norma
              pone la presión dinámica (por la zona), el coeficiente de exposición a la altura de cada planta y los
              coeficientes de presión y succión según la esbeltez. La <b>fuerza por planta</b> es lo que se lleva al
              programa de cálculo: la presión más la succión, sobre la fachada perpendicular al viento, por la banda de
              media planta por debajo y media por encima de cada forjado.
            </p>
          )}

          <div className="grid gap-3 px-4 py-3 sm:grid-cols-2 lg:grid-cols-4">
            <Fila etiqueta="¿Cómo es el entorno del edificio?" ayuda={aspereza?.ayuda}>
              <select
                value={v.aspereza}
                aria-label="Grado de aspereza del entorno"
                className={INPUT}
                onChange={(ev) => onCambiar({ aspereza: ev.target.value as VientoUI['aspereza'] })}
              >
                {ASPEREZA_OPCIONES.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.etiqueta}
                  </option>
                ))}
              </select>
            </Fila>

            <Fila etiqueta="Presión dinámica qb" ayuda={qbModo?.ayuda}>
              <div className="flex gap-2">
                <select
                  value={v.qbModo}
                  aria-label="Presión dinámica"
                  className={INPUT}
                  onChange={(ev) => onCambiar({ qbModo: ev.target.value as QbModo })}
                >
                  {QB_MODO_OPCIONES.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.etiqueta}
                    </option>
                  ))}
                </select>
                {v.qbModo === 'manual' && (
                  <RawNumberInput
                    value={v.qbManual}
                    onChange={(qbManual) => onCambiar({ qbManual })}
                    ariaLabel="Presión dinámica tecleada"
                    unit="kN/m²"
                    min={0}
                    widthClass="w-16"
                  />
                )}
              </div>
            </Fila>

            <Fila etiqueta="Dimensión en planta según X" ayuda="Lado del edificio paralelo al eje X. El viento «según X» sopla a lo largo de este lado y empuja la fachada Y.">
              <RawNumberInput value={v.dimensiones.x} onChange={(x) => onCambiar({ dimensiones: { ...v.dimensiones, x } })} ariaLabel="Dimensión en planta según X" unit="m" min={0} widthClass="w-20" />
            </Fila>
            <Fila etiqueta="Dimensión en planta según Y" ayuda="Lado del edificio paralelo al eje Y. El viento «según Y» sopla a lo largo de este lado y empuja la fachada X.">
              <RawNumberInput value={v.dimensiones.y} onChange={(y) => onCambiar({ dimensiones: { ...v.dimensiones, y } })} ariaLabel="Dimensión en planta según Y" unit="m" min={0} widthClass="w-20" />
            </Fila>
          </div>

          <div className="overflow-x-auto border-t border-border-sub">
            <table className="w-full border-collapse text-[12px]">
              <thead>
                <tr>
                  <th className={TH}>Planta</th>
                  <th className={TH}>Altura del forjado sobre rasante</th>
                  <th className={TH_DER} title="Coeficiente de exposición a la altura del forjado (Anejo D.2)">ce</th>
                  <th className={TH_DER} title="Presión dinámica por coeficiente de exposición">qb·ce ({uQ})</th>
                  <th className={TH_DER} title="Fuerza horizontal con viento según X">Fx ({uF})</th>
                  <th className={TH_DER} title="Fuerza horizontal con viento según Y">Fy ({uF})</th>
                  <th className={TH} aria-label="Acciones" />
                </tr>
              </thead>
              <tbody>
                {v.plantas.map((p) => {
                  const r = porId.get(p.id);
                  return (
                    <tr key={p.id} className="border-b border-border-sub last:border-0">
                      <td className="px-2 py-1.5">
                        <input
                          type="text"
                          value={p.nombre}
                          aria-label="Nombre de la planta"
                          className={INPUT}
                          onChange={(ev) => onPlanta(p.id, { nombre: ev.target.value })}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <RawNumberInput value={p.h} onChange={(h) => onPlanta(p.id, { h })} ariaLabel={`Altura de ${p.nombre || 'la planta'}`} unit="m" min={0} widthClass="w-20" />
                      </td>
                      <td className={TD_DER}>{r ? dec(r.x.ce, 3) : '—'}</td>
                      <td className={TD_DER}>{r ? mostrar(r.x.qe, 'areaLoad') : '—'}</td>
                      <td className={TD_DER}>{r ? mostrar(r.x.F, 'force') : '—'}</td>
                      <td className={TD_DER}>{r ? mostrar(r.y.F, 'force') : '—'}</td>
                      <td className="px-2 py-1.5 text-right">
                        <button
                          type="button"
                          onClick={() => onBorrarPlanta(p.id)}
                          aria-label={`Borrar ${p.nombre || 'la planta'}`}
                          className="rounded p-1 text-text-disabled hover:text-state-fail"
                        >
                          <Trash2 size={14} aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {resultado && (
                <tfoot>
                  <tr className="border-t border-border-main">
                    <td className="px-2 py-1.5 text-[11px] text-text-secondary" colSpan={4}>
                      Total
                    </td>
                    <td className={TD_DER}>{mostrar(resultado.x.Ftotal, 'force')}</td>
                    <td className={TD_DER}>{mostrar(resultado.y.Ftotal, 'force')}</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border-sub px-4 py-2">
            <button
              type="button"
              onClick={onAnadirPlanta}
              className="rounded border border-border-main bg-bg-elevated px-2.5 py-1 text-[11.5px] text-text-secondary hover:text-text-primary"
            >
              + Añadir planta
            </button>
            {resultado && (
              <span className="font-mono text-[11px] text-text-secondary">
                {(['x', 'y'] as const).map((eje) => {
                  const d = resultado[eje];
                  return (
                    <span key={eje} className="mr-4">
                      Según {eje.toUpperCase()}: esbeltez {dec(d.esbeltez, 2)} → cp {dec(d.cp, 2)} / cs {dec(d.cs, 2)}
                    </span>
                  );
                })}
                <span>qb = {dec(resultado.qb, 2)} kN/m²{resultado.vb !== null ? ` (vb ${resultado.vb} m/s)` : ''}</span>
              </span>
            )}
          </div>

          <Cubierta
            v={v}
            resultado={resultado?.cubierta ?? null}
            hDerivada={alturaCoronacionDerivada(v)}
            ayuda={ayuda}
            onCambiar={(cambio) => onCambiar({ cubierta: { ...v.cubierta, ...cambio } })}
          />

          {motivoSinResultado && <p className="px-4 pb-3 text-[12px] text-state-fail">{motivoSinResultado}</p>}
          {resultado?.errores.map((e) => (
            <p key={e} className="px-4 pb-2 text-[12px] text-state-fail">
              {e}
            </p>
          ))}
          {resultado?.avisos.map((a) => (
            <p key={a} className="px-4 pb-2 text-[12px] text-state-warn">
              {a}
            </p>
          ))}
        </>
      )}
    </section>
  );
}
