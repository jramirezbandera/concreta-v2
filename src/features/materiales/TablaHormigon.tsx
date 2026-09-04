/**
 * M2 — los elementos de hormigón.
 *
 * La decisión de diseño que ordena todo esto: **los valores derivados son
 * columnas de la propia tabla**, no un panel aparte ni una previsualización al
 * lado. En un módulo cuyo resultado ES una tabla, lo «vivo» son las columnas
 * que se rellenan solas al cambiar la respuesta de la izquierda.
 *
 * Columnas blancas = las contesta el usuario. Columnas azules = las pone la
 * norma. Una fila sin situación elegida es un hueco rojo y bloquea exportar.
 */

import { Trash2, TriangleAlert } from 'lucide-react';
import { num } from '../../lib/materiales/cuadros';
import type { AgresividadQuimica, DerivacionHormigon } from '../../lib/materiales/types';
import {
  CONSISTENCIA_OPCIONES,
  FCK_OPCIONES,
  ORDEN_SITUACIONES,
  PRESETS_HORMIGON,
  SITUACIONES,
  TERRENO_OPCIONES,
  type SituacionId,
} from './catalogos';
import { MenuAnadir } from './MenuAnadir';
import { tipificacionLimpieza, type FilaHormigon } from './state';

interface Props {
  filas: FilaHormigon[];
  /** Tamaño máximo del árido del perfil de estudio: entra en la tipificación. */
  tamMaxArido: number;
  /** Derivación por id de fila. Las filas sin situación no aparecen. */
  derivaciones: Map<string, DerivacionHormigon>;
  costa: boolean;
  heladas: boolean;
  terrenoAgresivo: AgresividadQuimica;
  ayuda: boolean;
  onCambiar: (id: string, cambio: Partial<FilaHormigon>) => void;
  onBorrar: (id: string) => void;
  /** Recibe el nombre elegido en el menú, o '' para una fila en blanco. */
  onAnadir: (nombre: string) => void;
  onCosta: (valor: boolean) => void;
  onHeladas: (valor: boolean) => void;
  onTerreno: (valor: AgresividadQuimica) => void;
}

const TH_DER =
  'border-b border-border-main px-2 py-1.5 text-left text-[10px] font-semibold uppercase text-accent';
const TH =
  'border-b border-border-main px-2 py-1.5 text-left text-[10px] font-semibold uppercase text-text-disabled';
const TD_DER = 'px-2 py-1.5 font-mono text-[12px] text-text-primary';
const INPUT =
  'w-full min-w-0 rounded border border-border-main bg-bg-primary px-2 py-1 text-[12px] text-text-primary focus:border-accent focus:outline-none';

export function TablaHormigon({
  filas,
  tamMaxArido,
  derivaciones,
  costa,
  heladas,
  terrenoAgresivo,
  ayuda,
  onCambiar,
  onBorrar,
  onAnadir,
  onCosta,
  onHeladas,
  onTerreno,
}: Props) {
  return (
    <section className="rounded border border-border-main bg-bg-surface">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border-main px-4 py-2.5">
        <span className="rounded bg-bg-elevated px-1.5 py-0.5 font-mono text-[10px] text-text-disabled">
          M2
        </span>
        <h2 className="text-[13px] font-semibold text-text-primary">Elementos de hormigón</h2>
        {/* Los tres modificadores de obra: alcanzan a varios elementos a la vez y
            por eso viven aquí y no en cada fila. */}
        <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-text-secondary">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={costa}
              onChange={(e) => onCosta(e.target.checked)}
              className="accent-[var(--color-accent)]"
            />
            <span>
              La obra está <b className="font-semibold text-text-primary">en la costa</b>
            </span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={heladas}
              onChange={(e) => onHeladas(e.target.checked)}
              className="accent-[var(--color-accent)]"
            />
            <span>
              Zona con <b className="font-semibold text-text-primary">heladas</b>
            </span>
          </label>
          <label className="flex items-center gap-2">
            <span>Terreno</span>
            <select
              value={terrenoAgresivo}
              aria-label="Agresividad del terreno"
              className={INPUT}
              onChange={(e) => onTerreno(e.target.value as AgresividadQuimica)}
            >
              {TERRENO_OPCIONES.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.etiqueta}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      {ayuda && (
        <p className="border-b border-border-sub px-4 py-2 text-[11.5px] leading-snug text-text-disabled">
          Conteste dónde va a estar cada elemento; las columnas azules las pone el Código
          Estructural. Marcar «en la costa» añade el ambiente marino (XS1) a todo lo que tenga caras
          al aire libre: sube el cemento, baja el agua y engorda el recubrimiento. «Heladas» añade
          XF1 a las caras que reciben lluvia. El terreno agresivo lo dice el informe geotécnico
          (sulfatos, acidez, CO₂ agresivo) y añade XA1, XA2 o XA3 a todo lo enterrado.
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr>
              <th className={TH}>Elemento</th>
              <th className={TH}>¿Dónde va a estar?</th>
              <th className={TH}>Hormigón</th>
              <th className={TH}>Consist.</th>
              <th className={TH_DER} title="Clase de exposición derivada de la situación">
                Clase
              </th>
              <th className={TH_DER} title="Recubrimiento nominal de las armaduras">
                Recubr.
              </th>
              <th className={TH_DER} title="Contenido mínimo de cemento">
                Cemento
              </th>
              <th className={TH_DER} title="Máxima relación agua/cemento">
                a/c
              </th>
              <th className={TH_DER} title="Tipificación según el artículo 33.6">
                Tipificación
              </th>
              <th className={TH} aria-label="Acciones" />
            </tr>
          </thead>
          <tbody>
            {filas.map((fila) => {
              const d = derivaciones.get(fila.id);
              const esLimpieza = fila.situacion === 'limpieza';
              const hueco = fila.situacion === '';
              const aviso = d?.mensajes.find((m) => m.severidad === 'aviso');
              const error = d?.mensajes.find((m) => m.severidad === 'error');

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
                    {/* Texto libre a secas: el nombre es del usuario y puede ser
                        «Brochal del hueco de la escalera». Los elementos
                        habituales se eligen al añadir la fila, en el menú de
                        abajo, no escribiendo aquí. */}
                    <input
                      value={fila.nombre}
                      placeholder="Nombre del elemento"
                      aria-label="Nombre del elemento"
                      className={INPUT}
                      onChange={(e) => onCambiar(fila.id, { nombre: e.target.value })}
                    />
                  </td>

                  <td className="px-2 py-1.5" style={{ minWidth: 210 }}>
                    <select
                      value={fila.situacion}
                      aria-label="Dónde va a estar"
                      className={INPUT}
                      onChange={(e) =>
                        onCambiar(fila.id, { situacion: e.target.value as SituacionId | '' })
                      }
                    >
                      <option value="">— elegir —</option>
                      {ORDEN_SITUACIONES.map((id) => (
                        <option key={id} value={id}>
                          {SITUACIONES[id].etiqueta}
                        </option>
                      ))}
                    </select>
                  </td>

                  <td className="px-2 py-1.5">
                    {esLimpieza ? (
                      <span className="text-text-disabled">No estructural</span>
                    ) : (
                      <select
                        value={fila.fck}
                        aria-label="Resistencia del hormigón"
                        className={INPUT}
                        onChange={(e) => onCambiar(fila.id, { fck: Number(e.target.value) })}
                      >
                        {FCK_OPCIONES.map((v) => (
                          <option key={v} value={v}>
                            HA-{v}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    <select
                      value={fila.consistencia}
                      aria-label="Consistencia"
                      className={INPUT}
                      onChange={(e) =>
                        onCambiar(fila.id, {
                          consistencia: e.target.value as FilaHormigon['consistencia'],
                        })
                      }
                    >
                      {CONSISTENCIA_OPCIONES.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.etiqueta}
                        </option>
                      ))}
                    </select>
                  </td>

                  {esLimpieza ? (
                    <>
                      <td className={TD_DER}>—</td>
                      <td className={TD_DER}>—</td>
                      <td className={TD_DER}>150 kg</td>
                      <td className={TD_DER}>—</td>
                      <td className={TD_DER} style={{ whiteSpace: 'nowrap' }}>
                        {tipificacionLimpieza(fila.consistencia, tamMaxArido)}
                      </td>
                    </>
                  ) : (
                    <>
                      <td className={TD_DER}>{d ? d.clases.join(' + ') : '—'}</td>
                      <td className={TD_DER}>
                        {d && d.cnom !== null && d.cnom > 0 ? `${d.cnom} mm` : '—'}
                      </td>
                      <td className={TD_DER}>
                        {d?.cementoMin != null ? `${d.cementoMin} kg` : '—'}
                      </td>
                      <td className={TD_DER}>{d?.acMax != null ? num(d.acMax, 2) : '—'}</td>
                      <td className={TD_DER} style={{ whiteSpace: 'nowrap' }}>
                        {d ? d.tipificacion : '—'}
                      </td>
                    </>
                  )}

                  <td className="px-2 py-1.5 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {(aviso ?? error) && (
                        <span
                          title={(error ?? aviso)?.texto}
                          className={error ? 'text-state-fail' : 'text-state-warn'}
                        >
                          <TriangleAlert size={13} aria-hidden="true" />
                          <span className="sr-only">{(error ?? aviso)?.texto}</span>
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => onBorrar(fila.id)}
                        aria-label={`Quitar ${fila.nombre || 'elemento'}`}
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

      {/* Avisos y notas en largo, debajo de la tabla: en la fila sólo cabe el icono. */}
      {filas.some((f) => {
        const d = derivaciones.get(f.id);
        return d && (d.mensajes.length > 0 || d.notas.length > 0);
      }) && (
        <ul className="space-y-1 border-t border-border-sub px-4 py-2">
          {filas.flatMap((f) => {
            const d = derivaciones.get(f.id);
            if (!d) return [];
            return [
              ...d.mensajes.map((m, i) => (
                <li
                  key={`${f.id}-m${i}`}
                  className={[
                    'text-[11px] leading-snug',
                    m.severidad === 'error' ? 'text-state-fail' : 'text-state-warn',
                  ].join(' ')}
                >
                  <b className="font-semibold">{d.elemento.nombre}:</b> {m.texto}
                  {m.referencia && (
                    <span className="ml-1 font-mono text-text-disabled">({m.referencia})</span>
                  )}
                </li>
              )),
              ...d.notas.map((n, i) => (
                <li key={`${f.id}-n${i}`} className="text-[11px] leading-snug text-text-disabled">
                  <b className="font-semibold">{d.elemento.nombre}:</b> {n.texto}
                </li>
              )),
            ];
          })}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border-main px-4 py-2.5">
        <MenuAnadir
          etiqueta="+ Añadir elemento"
          nombres={Object.keys(PRESETS_HORMIGON)}
          etiquetaLibre="Otro… (fila en blanco)"
          onElegir={onAnadir}
        />
        {ayuda && (
          <span className="text-[11px] text-text-disabled">
            Elegir un elemento habitual trae la fila rellena; «Otro…» la deja en blanco.
          </span>
        )}
      </div>
    </section>
  );
}
