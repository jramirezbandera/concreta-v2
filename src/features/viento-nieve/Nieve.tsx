/**
 * M3 — Nieve.
 *
 * sk lo pone la norma (o el usuario, si la altitud se sale de las tablas) y
 * cada faldón contesta a tres preguntas de obra: cuánto pendiente tiene, si
 * algo impide que la nieve deslice y si acaba en una limahoya. Las columnas
 * azules son el coeficiente de forma, la carga y la acumulación.
 */

import { Trash2 } from 'lucide-react';
import { RawNumberInput } from '../../components/units/RawNumberInput';
import { HelpTooltip } from '../../components/ui/HelpTooltip';
import { ToggleChip } from '../../components/ui/ToggleChip';
import type { FaldonResuelto, NieveResultado } from '../../lib/acciones/nieve';
import { toDisplay } from '../../lib/units/convert';
import { getPrecision, getUnitLabel } from '../../lib/units/format';
import type { Quantity } from '../../lib/units/types';
import { useUnitSystem } from '../../lib/units/useUnitSystem';
import { EXPOSICION_OPCIONES, LIMAHOYA_OPCIONES, SK_MODO_OPCIONES, type LimahoyaUI, type SkModo } from './catalogos';
import type { FaldonUI, NieveUI } from './state';

const INPUT =
  'w-full min-w-0 rounded border border-border-main bg-bg-primary px-2 py-1 text-[12px] text-text-primary focus:border-accent focus:outline-none';
const TH = 'border-b border-border-main px-2 py-1.5 text-left text-[10px] font-semibold uppercase text-text-disabled';
const TH_DER = 'border-b border-border-main px-2 py-1.5 text-right text-[10px] font-semibold uppercase text-accent';
const TD_DER = 'px-2 py-1.5 text-right font-mono text-[12px] text-text-primary';

const ORIGEN_SK: Record<NieveResultado['skOrigen'], string> = {
  'tabla3.8': 'tabla 3.8, capital',
  anejoE: 'tabla E.2',
  manual: 'valor propio',
};

interface Props {
  n: NieveUI;
  resultado: NieveResultado | null;
  motivoSinResultado: string | null;
  ayuda: boolean;
  onCambiar: (cambio: Partial<NieveUI>) => void;
  onFaldon: (id: string, cambio: Partial<FaldonUI>) => void;
  onAnadirFaldon: () => void;
  onBorrarFaldon: (id: string) => void;
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

const dec = (v: number, d: number) => v.toFixed(d).replace('.', ',');

export function Nieve({ n, resultado, motivoSinResultado, ayuda, onCambiar, onFaldon, onAnadirFaldon, onBorrarFaldon }: Props) {
  const { system } = useUnitSystem();
  const mostrar = (valor: number, q: Quantity) => dec(toDisplay(valor, q, system), getPrecision(q, system));
  const uQ = getUnitLabel('areaLoad', system);
  const uL = getUnitLabel('linearLoad', system);

  const porId = new Map<string, FaldonResuelto>();
  resultado?.faldones.forEach((f) => {
    if (f.id) porId.set(f.id, f);
  });
  const exposicion = EXPOSICION_OPCIONES.find((o) => o.id === n.exposicion);
  const skModo = SK_MODO_OPCIONES.find((o) => o.id === n.skModo);

  return (
    <section className="rounded border border-border-main bg-bg-surface">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border-main px-4 py-2.5">
        <span className="rounded bg-bg-elevated px-1.5 py-0.5 font-mono text-[10px] text-text-disabled">M3</span>
        <h2 className="text-[13px] font-semibold text-text-primary">Nieve</h2>
        <span className="text-[11px] text-text-disabled">DB SE-AE art. 3.5 · Anejo E</span>
        <div className="ml-auto">
          <ToggleChip on={n.activo} onToggle={() => onCambiar({ activo: !n.activo })} onLabel="Incluida" offLabel="Omitida" ariaLabel="Incluir la nieve" />
        </div>
      </header>

      {!n.activo ? (
        <p className="px-4 py-3 text-[12px] text-text-disabled">La nieve no entra en esta obra. Púlsela para incluirla.</p>
      ) : (
        <>
          {ayuda && (
            <p className="border-b border-border-sub px-4 py-2 text-[11.5px] leading-snug text-text-disabled">
              La sobrecarga sobre terreno horizontal sk la fija la norma por zona y altitud. Cada faldón la
              multiplica por su coeficiente de forma μ: 1 hasta 30º de pendiente, 0 a partir de 60º, y 1 siempre
              que algo impida deslizar la nieve (petos, limatesas). Si un faldón inclinado descarga nieve hacia una
              limahoya o un cambio de nivel, dígalo en «¿Qué hay al pie?» e indique su proyección horizontal L para
              calcular la acumulación; con alero la nieve cae fuera y no se acumula.
            </p>
          )}

          <div className="grid gap-3 px-4 py-3 sm:grid-cols-2 lg:grid-cols-4">
            <Fila etiqueta="¿Cómo está de expuesta al viento?" ayuda={exposicion?.ayuda}>
              <select
                value={n.exposicion}
                aria-label="Exposición al viento"
                className={INPUT}
                onChange={(ev) => onCambiar({ exposicion: ev.target.value as NieveUI['exposicion'] })}
              >
                {EXPOSICION_OPCIONES.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.etiqueta}
                  </option>
                ))}
              </select>
            </Fila>

            <Fila etiqueta="Sobrecarga sobre terreno horizontal sk" ayuda={skModo?.ayuda}>
              <div className="flex gap-2">
                <select value={n.skModo} aria-label="Origen de sk" className={INPUT} onChange={(ev) => onCambiar({ skModo: ev.target.value as SkModo })}>
                  {SK_MODO_OPCIONES.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.etiqueta}
                    </option>
                  ))}
                </select>
                {n.skModo === 'manual' && (
                  <RawNumberInput value={n.skManual} onChange={(skManual) => onCambiar({ skManual })} ariaLabel="sk tecleada" unit="kN/m²" min={0} widthClass="w-16" />
                )}
              </div>
            </Fila>

            <div className="flex min-w-0 flex-col gap-1 sm:col-span-2">
              <span className="text-[11px] text-accent">Lo que pone la norma</span>
              <span className="font-mono text-[12px] text-text-primary">
                {resultado && resultado.sk !== null
                  ? `sk = ${mostrar(resultado.sk, 'areaLoad')} ${uQ} (${ORIGEN_SK[resultado.skOrigen]})${
                      resultado.factorExposicion !== 1 && resultado.skEfectiva !== null
                        ? ` × ${dec(resultado.factorExposicion, 1)} = ${mostrar(resultado.skEfectiva, 'areaLoad')} ${uQ}`
                        : ''
                    }`
                  : '—'}
              </span>
            </div>
          </div>

          <div className="overflow-x-auto border-t border-border-sub">
            <table className="w-full border-collapse text-[12px]">
              <thead>
                <tr>
                  <th className={TH}>Faldón</th>
                  <th className={TH}>Pendiente</th>
                  <th className={TH} title="Petos, limatesas u otros elementos que impidan que la nieve deslice">¿Algo impide deslizar?</th>
                  <th className={TH} title="Proyección horizontal de la línea de máxima pendiente, para la acumulación">L</th>
                  <th className={TH} title="Qué hay al pie del faldón: un alero por el que la nieve cae fuera, una limahoya o una cubierta más baja">¿Qué hay al pie?</th>
                  <th className={TH}>Voladizo</th>
                  <th className={TH_DER} title="Coeficiente de forma">μ</th>
                  <th className={TH_DER} title="Carga de nieve en proyección horizontal">qn ({uQ})</th>
                  <th className={TH_DER} title="Descarga pd / acumulación pa en la discontinuidad">pd / pa ({uL})</th>
                  <th className={TH} aria-label="Acciones" />
                </tr>
              </thead>
              <tbody>
                {n.faldones.map((f) => {
                  const r = porId.get(f.id);
                  return (
                    <tr key={f.id} className="border-b border-border-sub last:border-0 align-top">
                      <td className="px-2 py-1.5">
                        <input type="text" value={f.nombre} aria-label="Nombre del faldón" className={INPUT} onChange={(ev) => onFaldon(f.id, { nombre: ev.target.value })} />
                      </td>
                      <td className="px-2 py-1.5">
                        <RawNumberInput value={f.inclinacion} onChange={(inclinacion) => onFaldon(f.id, { inclinacion })} ariaLabel={`Pendiente de ${f.nombre || 'el faldón'}`} unit="º" min={0} max={89} widthClass="w-14" />
                      </td>
                      <td className="px-2 py-1.5">
                        <input type="checkbox" checked={f.impedimento} aria-label={`Impedimento al deslizamiento en ${f.nombre || 'el faldón'}`} onChange={(ev) => onFaldon(f.id, { impedimento: ev.target.checked })} className="accent-[var(--color-accent)]" />
                      </td>
                      <td className="px-2 py-1.5">
                        <div className="flex items-center gap-1">
                          <RawNumberInput value={f.L ?? 0} onChange={(L) => onFaldon(f.id, { L })} ariaLabel={`Proyección horizontal de ${f.nombre || 'el faldón'}`} unit="m" min={0} widthClass="w-14" />
                          {f.L !== null && (
                            <button type="button" onClick={() => onFaldon(f.id, { L: null })} className="text-[10px] text-text-disabled hover:text-text-secondary" title="Sin acumulación">
                              ×
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-1.5">
                        <div className="flex flex-col gap-1">
                          <select value={f.limahoya} aria-label={`Limahoya de ${f.nombre || 'el faldón'}`} className={INPUT} onChange={(ev) => onFaldon(f.id, { limahoya: ev.target.value as LimahoyaUI })}>
                            {LIMAHOYA_OPCIONES.map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.etiqueta}
                              </option>
                            ))}
                          </select>
                          {(f.limahoya === 'contrario' || f.limahoya === 'mismoSentido') && (
                            <span className="flex items-center gap-1 text-[11px] text-text-secondary">
                              el otro:
                              <RawNumberInput value={f.inclinacionOtro} onChange={(inclinacionOtro) => onFaldon(f.id, { inclinacionOtro })} ariaLabel="Pendiente del otro faldón" unit="º" min={0} max={89} widthClass="w-12" />
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-1.5">
                        <input type="checkbox" checked={f.voladizo} aria-label={`Voladizo en ${f.nombre || 'el faldón'}`} onChange={(ev) => onFaldon(f.id, { voladizo: ev.target.checked })} className="accent-[var(--color-accent)]" />
                      </td>
                      <td className={TD_DER}>
                        {r ? dec(r.mu, 2) : '—'}
                        {r?.limahoya && <div className="text-[10px] text-text-secondary">limahoya {dec(r.limahoya.mu, 2)}</div>}
                      </td>
                      <td className={TD_DER}>
                        {r ? mostrar(r.qn, 'areaLoad') : '—'}
                        {r?.limahoya && <div className="text-[10px] text-text-secondary">{mostrar(r.limahoya.qn, 'areaLoad')} en 2 m</div>}
                        {r?.hielo !== undefined && <div className="text-[10px] text-text-secondary">hielo {mostrar(r.hielo, 'linearLoad')} {uL}</div>}
                      </td>
                      <td className={TD_DER}>{r?.acumulacion ? `${mostrar(r.acumulacion.pd, 'linearLoad')} / ${mostrar(r.acumulacion.pa, 'linearLoad')}` : '—'}</td>
                      <td className="px-2 py-1.5 text-right">
                        <button type="button" onClick={() => onBorrarFaldon(f.id)} aria-label={`Borrar ${f.nombre || 'el faldón'}`} className="rounded p-1 text-text-disabled hover:text-state-fail">
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
            <button type="button" onClick={onAnadirFaldon} className="rounded border border-border-main bg-bg-elevated px-2.5 py-1 text-[11.5px] text-text-secondary hover:text-text-primary">
              + Añadir faldón
            </button>
          </div>

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
