/**
 * M3 — acero estructural.
 *
 * Tres preguntas de obra fijan la clase de ejecución EXC (CE tabla 91.1), que es
 * lo que de verdad va al plano y al pliego. El usuario nunca ve la tabla de
 * doce combinaciones: contesta qué pasaría si fallara, qué cargas soporta y
 * cómo se fabrica, y el módulo enseña el resultado y por qué.
 */

import { Trash2 } from 'lucide-react';
import type { DerivacionAcero, ProteccionAcero } from '../../lib/materiales/types';
import {
  CATEGORIA_EJECUCION_OPCIONES,
  CATEGORIA_USO_OPCIONES,
  CORROSIVIDAD_OPCIONES,
  EXPLICACION_EXC,
  NIVEL_RIESGO_OPCIONES,
  PROTECCION_SUGERIDA,
} from './catalogos';
import type { FilaAcero, MaterialesState } from './state';

const TH =
  'border-b border-border-main px-2 py-1.5 text-left text-[10px] font-semibold uppercase text-text-disabled';
const INPUT =
  'w-full min-w-0 rounded border border-border-main bg-bg-primary px-2 py-1 text-[12px] text-text-primary focus:border-accent focus:outline-none';

interface Props {
  datos: MaterialesState['aceroEstr'];
  derivacion: DerivacionAcero | null;
  ayuda: boolean;
  onCambiarClasificacion: (cambio: Partial<Omit<MaterialesState['aceroEstr'], 'elementos'>>) => void;
  onCambiarFila: (id: string, cambio: Partial<FilaAcero>) => void;
  onBorrar: (id: string) => void;
  onAnadir: () => void;
}

function Campo({
  etiqueta,
  valor,
  opciones,
  onChange,
}: {
  etiqueta: string;
  valor: string;
  opciones: readonly { id: string; etiqueta: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-[11px] text-text-secondary">{etiqueta}</span>
      <select value={valor} className={INPUT} onChange={(e) => onChange(e.target.value)}>
        {opciones.map((o) => (
          <option key={o.id} value={o.id}>
            {o.etiqueta}
          </option>
        ))}
      </select>
    </label>
  );
}

export function AceroEstructural({
  datos,
  derivacion,
  ayuda,
  onCambiarClasificacion,
  onCambiarFila,
  onBorrar,
  onAnadir,
}: Props) {
  const exc = derivacion?.claseEjecucion;

  return (
    <section className="rounded border border-border-main bg-bg-surface">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border-main px-4 py-2.5">
        <span className="rounded bg-bg-elevated px-1.5 py-0.5 font-mono text-[10px] text-text-disabled">
          M3
        </span>
        <h2 className="text-[13px] font-semibold text-text-primary">Acero estructural</h2>
      </header>

      {ayuda && (
        <p className="border-b border-border-sub px-4 py-2 text-[11.5px] leading-snug text-text-disabled">
          Tres preguntas fijan la «clase de ejecución» (EXC): cuánto control exigirá la fabricación y
          el montaje del acero.
        </p>
      )}

      <div className="grid gap-3 px-4 py-3 sm:grid-cols-3">
        <Campo
          etiqueta="¿Qué pasaría si fallara?"
          valor={datos.nivelRiesgo}
          opciones={NIVEL_RIESGO_OPCIONES}
          onChange={(v) => onCambiarClasificacion({ nivelRiesgo: v as typeof datos.nivelRiesgo })}
        />
        <Campo
          etiqueta="¿Qué tipo de cargas soporta?"
          valor={datos.categoriaUso}
          opciones={CATEGORIA_USO_OPCIONES}
          onChange={(v) => onCambiarClasificacion({ categoriaUso: v as typeof datos.categoriaUso })}
        />
        <Campo
          etiqueta="¿Cómo se fabrica y se monta?"
          valor={datos.categoriaEjecucion}
          opciones={CATEGORIA_EJECUCION_OPCIONES}
          onChange={(v) =>
            onCambiarClasificacion({ categoriaEjecucion: v as typeof datos.categoriaEjecucion })
          }
        />
      </div>

      {exc !== undefined && (
        <div
          className="mx-4 mb-3 rounded px-3 py-2"
          style={{ background: 'var(--color-tint-accent)' }}
        >
          <p className="text-[12px] text-text-primary">
            Clase de ejecución derivada:{' '}
            <b className="font-mono font-semibold text-accent">EXC{exc}</b>
          </p>
          {ayuda && (
            <p className="mt-0.5 text-[11px] leading-snug text-text-disabled">
              {EXPLICACION_EXC[exc]}
            </p>
          )}
        </div>
      )}

      {/* El motor corrige la categoría de ejecución cuando el acero soldado es
          S355 o superior (CE 91.2.2.2): hay que decirlo donde se contestó. */}
      {derivacion && derivacion.mensajes.length > 0 && (
        <ul className="mx-4 mb-3 space-y-1">
          {derivacion.mensajes.map((m, i) => (
            <li
              key={i}
              className={[
                'text-[11px] leading-snug',
                m.severidad === 'error' ? 'text-state-fail' : 'text-state-warn',
              ].join(' ')}
            >
              {m.texto}
              {m.referencia && (
                <span className="ml-1 font-mono text-text-disabled">({m.referencia})</span>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr>
              <th className={TH}>Elemento</th>
              <th className={TH}>Medio de unión</th>
              <th className={TH}>Características</th>
              <th className={TH}>Ambiente</th>
              <th className={TH} title="Sistema de protección: viene sugerido para esa corrosividad y se puede cambiar">
                Protección
              </th>
              <th className={TH}>Características</th>
              <th className={TH} aria-label="Acciones" />
            </tr>
          </thead>
          <tbody>
            {datos.elementos.map((fila) => {
              const sugerida = PROTECCION_SUGERIDA[fila.corrosividad];
              return (
                <tr key={fila.id} className="border-b border-border-sub last:border-0">
                  <td className="px-2 py-1.5" style={{ minWidth: 140 }}>
                    <input
                      value={fila.nombre}
                      aria-label="Elemento de acero"
                      placeholder="Soportes, jácenas…"
                      className={INPUT}
                      onChange={(e) => onCambiarFila(fila.id, { nombre: e.target.value })}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <select
                      value={fila.union}
                      aria-label="Medio de unión"
                      className={INPUT}
                      onChange={(e) =>
                        onCambiarFila(fila.id, { union: e.target.value as FilaAcero['union'] })
                      }
                    >
                      <option value="soldadura">Soldadura</option>
                      <option value="atornillado">Atornillado</option>
                    </select>
                  </td>
                  <td className="px-2 py-1.5" style={{ minWidth: 120 }}>
                    <input
                      value={fila.caracteristicasUnion}
                      aria-label="Características de la unión"
                      placeholder="En ángulo, 8.8…"
                      className={INPUT}
                      onChange={(e) =>
                        onCambiarFila(fila.id, { caracteristicasUnion: e.target.value })
                      }
                    />
                  </td>
                  <td className="px-2 py-1.5" style={{ minWidth: 210 }}>
                    <select
                      value={fila.corrosividad}
                      aria-label="Ambiente"
                      className={INPUT}
                      onChange={(e) =>
                        onCambiarFila(fila.id, {
                          corrosividad: e.target.value as FilaAcero['corrosividad'],
                        })
                      }
                    >
                      {CORROSIVIDAD_OPCIONES.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.etiqueta}
                        </option>
                      ))}
                    </select>
                  </td>
                  {/* Sugerido por la clase de corrosividad, pero es lo que se
                      imprime como prescripción: se puede cambiar en la fila. */}
                  <td className="px-2 py-1.5" style={{ minWidth: 120 }}>
                    <select
                      value={fila.proteccion ?? sugerida.proteccion}
                      aria-label="Sistema de protección"
                      className={INPUT}
                      onChange={(e) =>
                        onCambiarFila(fila.id, { proteccion: e.target.value as ProteccionAcero })
                      }
                    >
                      <option value="pintura">Pintura</option>
                      <option value="galvanizado">Galvanizado</option>
                      <option value="ninguna">Sin protección</option>
                    </select>
                  </td>
                  <td className="px-2 py-1.5" style={{ minWidth: 120 }}>
                    <input
                      value={fila.caracteristicasProteccion ?? sugerida.detalle}
                      aria-label="Características de la protección"
                      placeholder="Doble capa, en fábrica…"
                      className={INPUT}
                      onChange={(e) =>
                        onCambiarFila(fila.id, { caracteristicasProteccion: e.target.value })
                      }
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <button
                      type="button"
                      onClick={() => onBorrar(fila.id)}
                      aria-label={`Quitar ${fila.nombre || 'elemento de acero'}`}
                      className="text-text-disabled transition-colors hover:text-state-fail"
                    >
                      <Trash2 size={13} aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="border-t border-border-main px-4 py-2.5">
        <button
          type="button"
          onClick={onAnadir}
          className="rounded border border-border-main bg-bg-elevated px-2.5 py-1 text-[12px] text-text-secondary transition-colors hover:text-text-primary"
        >
          + Añadir elemento
        </button>
      </div>
    </section>
  );
}
