/**
 * Nieve: lo que se contesta.
 *
 * Exposición, origen de sk y una tarjeta por faldón con sus tres preguntas de
 * obra: cuánta pendiente tiene, si algo impide que la nieve deslice y qué hay
 * al pie. μ, qn y la acumulación van en la vista Nieve del lienzo y en la
 * columna de resultados. El faldón seleccionado se resalta en los dos sitios.
 */

import { Trash2 } from 'lucide-react';
import { RawNumberInput } from '../../components/units/RawNumberInput';
import { ToggleChip } from '../../components/ui/ToggleChip';
import { CabeceraLista, Campo, FilaInterruptor, NotaSeccion } from './campos';
import { EXPOSICION_OPCIONES, LIMAHOYA_OPCIONES, SK_MODO_OPCIONES, type LimahoyaUI, type SkModo } from './catalogos';
import { BOTON_MENOR, INPUT, SELECCION } from './estilos';
import type { FaldonUI, NieveUI } from './state';

interface Props {
  n: NieveUI;
  ayuda: boolean;
  faldonSel: string | null;
  onSelectFaldon: (id: string | null) => void;
  onCambiar: (cambio: Partial<NieveUI>) => void;
  onFaldon: (id: string, cambio: Partial<FaldonUI>) => void;
  onAnadirFaldon: () => void;
  onBorrarFaldon: (id: string) => void;
}

export function Nieve({ n, ayuda, faldonSel, onSelectFaldon, onCambiar, onFaldon, onAnadirFaldon, onBorrarFaldon }: Props) {
  const exposicion = EXPOSICION_OPCIONES.find((o) => o.id === n.exposicion);
  const skModo = SK_MODO_OPCIONES.find((o) => o.id === n.skModo);

  return (
    <div className="flex flex-col gap-2.5">
      <FilaInterruptor etiqueta="¿Entra la nieve?">
        <ToggleChip on={n.activo} onToggle={() => onCambiar({ activo: !n.activo })} onLabel="Incluida" offLabel="Omitida" ariaLabel="Incluir la nieve" />
      </FilaInterruptor>

      {!n.activo ? (
        <p className="text-[11.5px] text-text-disabled">La nieve no entra en esta obra. Púlsela para incluirla.</p>
      ) : (
        <>
          {ayuda && (
            <NotaSeccion>
              sk la fija la norma por zona y altitud. Cada faldón la multiplica por su coeficiente de forma μ: 1 hasta 30º, 0
              a partir de 60º, y 1 siempre que algo impida deslizar la nieve. Si un faldón descarga hacia una limahoya o una
              cubierta más baja, dígalo en «¿Qué hay al pie?» e indique su proyección L para calcular la acumulación.
            </NotaSeccion>
          )}

          <Campo etiqueta="¿Cómo está de expuesta al viento?" ayuda={exposicion?.ayuda}>
            <select value={n.exposicion} aria-label="Exposición al viento" className={INPUT} onChange={(ev) => onCambiar({ exposicion: ev.target.value as NieveUI['exposicion'] })}>
              {EXPOSICION_OPCIONES.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.etiqueta}
                </option>
              ))}
            </select>
          </Campo>

          <Campo etiqueta="Sobrecarga sobre terreno horizontal sk" ayuda={skModo?.ayuda} nota={ayuda ? skModo?.ayuda : undefined}>
            <div className="flex gap-2">
              <select value={n.skModo} aria-label="Origen de sk" className={INPUT} onChange={(ev) => onCambiar({ skModo: ev.target.value as SkModo })}>
                {SK_MODO_OPCIONES.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.etiqueta}
                  </option>
                ))}
              </select>
              {n.skModo === 'manual' && <RawNumberInput value={n.skManual} onChange={(skManual) => onCambiar({ skManual })} ariaLabel="sk tecleada" unit="kN/m²" min={0} widthClass="w-16" />}
            </div>
          </Campo>

          <div className="flex flex-col gap-1.5">
            <CabeceraLista>Faldones · cada uno con su pendiente y lo que hay al pie</CabeceraLista>
            {n.faldones.map((f) => {
              const nombre = f.nombre || 'el faldón';
              const seleccionado = f.id === faldonSel;
              return (
                <div
                  key={f.id}
                  data-faldon={f.id}
                  onClick={() => onSelectFaldon(seleccionado ? null : f.id)}
                  className="flex flex-col gap-1.5 rounded border border-border-sub bg-bg-primary px-2 py-1.5"
                  style={seleccionado ? SELECCION : undefined}
                >
                  <div className="grid grid-cols-[minmax(0,1fr)_60px_18px] items-center gap-1.5">
                    <input type="text" value={f.nombre} aria-label="Nombre del faldón" className={INPUT} onChange={(ev) => onFaldon(f.id, { nombre: ev.target.value })} />
                    <RawNumberInput value={f.inclinacion} onChange={(inclinacion) => onFaldon(f.id, { inclinacion })} ariaLabel={`Pendiente de ${nombre}`} unit="º" min={0} max={89} fullWidth />
                    <button
                      type="button"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        onBorrarFaldon(f.id);
                      }}
                      aria-label={`Borrar ${nombre}`}
                      className="rounded p-0.5 text-text-disabled hover:text-state-fail"
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-text-secondary">
                    <label className="flex items-center gap-1.5" title="Petos, limatesas u otros elementos que impidan que la nieve deslice">
                      <input type="checkbox" checked={f.impedimento} aria-label={`Impedimento al deslizamiento en ${nombre}`} onChange={(ev) => onFaldon(f.id, { impedimento: ev.target.checked })} className="accent-[var(--color-accent)]" />
                      Impide deslizar (petos)
                    </label>
                    <label className="flex items-center gap-1.5" title="Para la carga de hielo en el borde por encima de 1.000 m">
                      <input type="checkbox" checked={f.voladizo} aria-label={`Voladizo en ${nombre}`} onChange={(ev) => onFaldon(f.id, { voladizo: ev.target.checked })} className="accent-[var(--color-accent)]" />
                      Voladizos
                    </label>
                  </div>
                  <div className="grid grid-cols-[72px_minmax(0,1fr)] items-end gap-1.5">
                    <Campo etiqueta="L" ayuda="Proyección horizontal de la línea de máxima pendiente, m. Sólo hace falta para la acumulación al pie.">
                      <div className="flex items-center gap-1">
                        <RawNumberInput value={f.L ?? 0} onChange={(L) => onFaldon(f.id, { L })} ariaLabel={`Proyección horizontal de ${nombre}`} unit="m" min={0} fullWidth />
                        {f.L !== null && (
                          <button type="button" onClick={() => onFaldon(f.id, { L: null })} className="text-[10px] text-text-disabled hover:text-text-secondary" title="Sin acumulación">
                            ×
                          </button>
                        )}
                      </div>
                    </Campo>
                    <Campo etiqueta="¿Qué hay al pie?" ayuda="Un alero por el que la nieve cae fuera, una limahoya con otro faldón, o una cubierta más baja sobre la que se acumula.">
                      <select value={f.limahoya} aria-label={`Limahoya de ${nombre}`} className={INPUT} onChange={(ev) => onFaldon(f.id, { limahoya: ev.target.value as LimahoyaUI })}>
                        {LIMAHOYA_OPCIONES.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.etiqueta}
                          </option>
                        ))}
                      </select>
                    </Campo>
                  </div>
                  {(f.limahoya === 'contrario' || f.limahoya === 'mismoSentido') && (
                    <span className="flex items-center gap-2 text-[11px] text-text-secondary">
                      pendiente del otro faldón:
                      <RawNumberInput value={f.inclinacionOtro} onChange={(inclinacionOtro) => onFaldon(f.id, { inclinacionOtro })} ariaLabel="Pendiente del otro faldón" unit="º" min={0} max={89} widthClass="w-14" />
                    </span>
                  )}
                </div>
              );
            })}
            <button type="button" onClick={onAnadirFaldon} className={`${BOTON_MENOR} self-start`}>
              + Añadir faldón
            </button>
          </div>
        </>
      )}
    </div>
  );
}
