/**
 * M4 — los grupos de elementos de madera.
 *
 * Mismo patrón que la tabla de hormigón: preguntas a la izquierda, derivados en
 * columnas azules. Aquí lo derivado es la clase de servicio (que gobierna kmod y
 * kdef), la clase de uso (que gobierna el tratamiento), el nivel de penetración
 * y el γM del material.
 */

import { Trash2, TriangleAlert } from 'lucide-react';
import { num } from '../../lib/materiales/cuadros';
import type { DerivacionMadera } from '../../lib/materiales/types';
import {
  ESPECIES,
  ORDEN_SITUACIONES_MADERA,
  PRESETS_MADERA,
  SITUACIONES_MADERA,
  TIPOS_MADERA,
  type SituacionMaderaId,
} from './catalogos';
import type { FilaMadera } from './state';

const LISTA_NOMBRES = 'materiales-nombres-madera';
const ROMANO: Record<number, string> = { 1: 'I', 2: 'II', 3: 'III' };

const TH_DER =
  'border-b border-border-main px-2 py-1.5 text-left text-[10px] font-semibold uppercase text-accent';
const TH =
  'border-b border-border-main px-2 py-1.5 text-left text-[10px] font-semibold uppercase text-text-disabled';
const TD_DER = 'px-2 py-1.5 font-mono text-[12px] text-text-primary';
const INPUT =
  'w-full min-w-0 rounded border border-border-main bg-bg-primary px-2 py-1 text-[12px] text-text-primary focus:border-accent focus:outline-none';

interface Props {
  filas: FilaMadera[];
  derivaciones: Map<string, DerivacionMadera>;
  ayuda: boolean;
  onCambiar: (id: string, cambio: Partial<FilaMadera>) => void;
  onBorrar: (id: string) => void;
  onAnadir: () => void;
}

export function TablaMadera({ filas, derivaciones, ayuda, onCambiar, onBorrar, onAnadir }: Props) {
  return (
    <section className="rounded border border-border-main bg-bg-surface">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border-main px-4 py-2.5">
        <span className="rounded bg-bg-elevated px-1.5 py-0.5 font-mono text-[10px] text-text-disabled">
          M4
        </span>
        <h2 className="text-[13px] font-semibold text-text-primary">Elementos de madera</h2>
      </header>

      {ayuda && (
        <p className="border-b border-border-sub px-4 py-2 text-[11.5px] leading-snug text-text-disabled">
          La situación fija dos cosas distintas que suelen confundirse: la <b>clase de servicio</b>{' '}
          (cuánta humedad coge la madera, y por tanto cuánto resiste) y la <b>clase de uso</b> (qué
          riesgo tiene de que la ataquen hongos o insectos, y por tanto qué tratamiento lleva).
        </p>
      )}

      {filas.length === 0 ? (
        <p className="px-4 py-4 text-[12px] text-text-disabled">
          Todavía no hay grupos de madera. Añada uno para que aparezcan en el cuadro.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr>
                <th className={TH}>Grupo</th>
                <th className={TH}>¿Dónde va a estar?</th>
                <th className={TH}>Tipo</th>
                <th className={TH}>Clase</th>
                <th className={TH}>Especie</th>
                <th className={TH_DER} title="Clase de servicio del DB SE-M: humedad de equilibrio">
                  Servicio
                </th>
                <th className={TH_DER} title="Clase de uso: riesgo de ataque biológico">
                  Uso
                </th>
                <th className={TH_DER} title="Nivel de penetración del tratamiento protector">
                  Tratamiento
                </th>
                <th className={TH_DER} title="Coeficiente parcial del material (1,00 en incendio)">
                  γM
                </th>
                <th className={TH} aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              {filas.map((fila) => {
                const d = derivaciones.get(fila.id);
                const hueco = fila.situacion === '';
                const tipo = TIPOS_MADERA.find((t) => t.id === fila.tipo) ?? TIPOS_MADERA[0];
                const aviso = d?.mensajes.find((m) => m.severidad !== 'info');

                return (
                  <tr
                    key={fila.id}
                    className="border-b border-border-sub last:border-0"
                    style={
                      hueco
                        ? { background: 'color-mix(in srgb, var(--color-state-fail) 8%, transparent)' }
                        : undefined
                    }
                  >
                    <td className="px-2 py-1.5" style={{ minWidth: 150 }}>
                      <input
                        value={fila.nombre}
                        list={LISTA_NOMBRES}
                        placeholder="Nombre o elegir…"
                        aria-label="Nombre del grupo"
                        className={INPUT}
                        onChange={(e) => {
                          const nombre = e.target.value;
                          const preset = PRESETS_MADERA[nombre];
                          onCambiar(
                            fila.id,
                            preset && fila.situacion === ''
                              ? {
                                  nombre,
                                  situacion: preset.situacion,
                                  tipo: preset.tipo,
                                  claseResistente: preset.claseResistente,
                                  especie: preset.especie,
                                }
                              : { nombre },
                          );
                        }}
                      />
                    </td>

                    <td className="px-2 py-1.5" style={{ minWidth: 200 }}>
                      <select
                        value={fila.situacion}
                        aria-label="Dónde va a estar"
                        className={INPUT}
                        onChange={(e) =>
                          onCambiar(fila.id, {
                            situacion: e.target.value as SituacionMaderaId | '',
                          })
                        }
                      >
                        <option value="">— elegir —</option>
                        {ORDEN_SITUACIONES_MADERA.map((id) => (
                          <option key={id} value={id}>
                            {SITUACIONES_MADERA[id].etiqueta}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td className="px-2 py-1.5">
                      <select
                        value={fila.tipo}
                        aria-label="Tipo de madera"
                        className={INPUT}
                        onChange={(e) => {
                          const nuevo = TIPOS_MADERA.find((t) => t.id === e.target.value);
                          if (!nuevo) return;
                          // Al cambiar de aserrada a laminada la clase resistente
                          // deja de existir: se recoloca en la primera del tipo.
                          onCambiar(fila.id, {
                            tipo: nuevo.id,
                            claseResistente: nuevo.clases.includes(fila.claseResistente)
                              ? fila.claseResistente
                              : nuevo.clases[0],
                          });
                        }}
                      >
                        {TIPOS_MADERA.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.etiqueta}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td className="px-2 py-1.5">
                      <select
                        value={fila.claseResistente}
                        aria-label="Clase resistente"
                        className={INPUT}
                        onChange={(e) => onCambiar(fila.id, { claseResistente: e.target.value })}
                      >
                        {tipo.clases.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td className="px-2 py-1.5" style={{ minWidth: 130 }}>
                      <select
                        value={fila.especie}
                        aria-label="Especie"
                        className={INPUT}
                        onChange={(e) => onCambiar(fila.id, { especie: e.target.value })}
                      >
                        {ESPECIES.map((e) => (
                          <option key={e} value={e}>
                            {e}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td className={TD_DER}>{d ? ROMANO[d.claseServicio] : '—'}</td>
                    <td className={TD_DER}>{d ? d.claseUso : '—'}</td>
                    <td className={TD_DER}>{d ? d.nivelPenetracion : '—'}</td>
                    <td className={TD_DER}>{d ? num(d.gammaM, 2) : '—'}</td>

                    <td className="px-2 py-1.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {aviso && (
                          <span title={aviso.texto} className="text-state-warn">
                            <TriangleAlert size={13} aria-hidden="true" />
                            <span className="sr-only">{aviso.texto}</span>
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => onBorrar(fila.id)}
                          aria-label={`Quitar ${fila.nombre || 'grupo'}`}
                          className="text-text-disabled transition-colors hover:text-state-fail"
                        >
                          <Trash2 size={13} aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border-main px-4 py-2.5">
        <button
          type="button"
          onClick={onAnadir}
          className="rounded border border-border-main bg-bg-elevated px-2.5 py-1 text-[12px] text-text-secondary transition-colors hover:text-text-primary"
        >
          + Añadir grupo
        </button>
        {ayuda && (
          <span className="text-[11px] text-text-disabled">
            «Vigas y pilares», «Correas y riostras»… los nombres conocidos rellenan la fila sola.
          </span>
        )}
      </div>

      <datalist id={LISTA_NOMBRES}>
        {Object.keys(PRESETS_MADERA).map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
    </section>
  );
}
