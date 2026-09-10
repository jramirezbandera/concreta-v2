/**
 * Las exigencias de resistencia al fuego, dentro de M0.
 *
 * Era un desplegable suelto con UNA R para toda la obra, y eso no se puede
 * decir de casi ningún edificio: el DB SI 6 le exige al sótano con aparcamiento
 * una cosa, a las plantas sobre rasante otra y a la cubierta ligera otra. Aquí
 * se teclean tantas como haga falta.
 *
 * Va en M0 —y no en una columna de las tablas de material— porque las filas de
 * aquellas están agrupadas por exposición, no por sector de incendio: pedirle
 * su R a cada fila obligaría a partir «Forjados» en dos para separar el techo
 * del sótano, y el cuadro del plano imprimiría dos HA-30 idénticos.
 *
 * La R no la propone el módulo: la fija el proyecto de incendios.
 */

import { Trash2 } from 'lucide-react';
import { AMBITOS_FUEGO } from '../../lib/materiales/fuego';
import { RESISTENCIA_FUEGO_OPCIONES } from './catalogos';
import { MenuAnadir } from './MenuAnadir';
import type { FilaFuego } from './state';

interface Props {
  filas: FilaFuego[];
  ayuda: boolean;
  onCambiar: (id: string, cambio: Partial<FilaFuego>) => void;
  onBorrar: (id: string) => void;
  /** Recibe el ámbito elegido en el menú, o '' para una fila en blanco. */
  onAnadir: (ambito: string) => void;
}

const INPUT =
  'w-full min-w-0 rounded border border-border-main bg-bg-primary px-2 py-1 text-[12px] text-text-primary focus:border-accent focus:outline-none';
const TH =
  'px-2 pb-1 text-left text-[10px] font-semibold uppercase text-text-disabled';

export function ExigenciasFuego({ filas, ayuda, onCambiar, onBorrar, onAnadir }: Props) {
  return (
    <div className="border-t border-border-sub px-4 py-3">
      <p className="pb-1.5 text-[11px] text-text-secondary">
        Resistencia al fuego exigida (DB SI 6)
      </p>

      {filas.length === 0 ? (
        <p className="pb-2 text-[12px] text-text-disabled">
          Sin indicar: no se imprime en el cuadro.
        </p>
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={TH}>¿Qué parte de la estructura?</th>
              <th className={TH} style={{ width: 96 }}>
                R
              </th>
              <th className={TH} aria-label="Acciones" style={{ width: 28 }} />
            </tr>
          </thead>
          <tbody>
            {filas.map((fila) => {
              // Mismo criterio que las tablas de material: a medio rellenar es
              // un hueco rojo, y bloquea exportar y publicar.
              const hueco = fila.ambito.trim() === '' || fila.minutos === null;
              return (
                <tr
                  key={fila.id}
                  style={
                    hueco
                      ? { background: 'color-mix(in srgb, var(--color-state-fail) 8%, transparent)' }
                      : undefined
                  }
                >
                  <td className="px-2 py-1">
                    {/* Texto libre: los ámbitos habituales se eligen al añadir
                        la fila, pero una obra puede exigirle R90 a «los
                        soportes del voladizo de la cafetería». */}
                    <input
                      value={fila.ambito}
                      placeholder="Sótano, cubierta ligera…"
                      aria-label="Parte de la estructura"
                      className={INPUT}
                      onChange={(e) => onCambiar(fila.id, { ambito: e.target.value })}
                    />
                  </td>
                  <td className="px-2 py-1">
                    <select
                      value={fila.minutos ?? ''}
                      aria-label={`Resistencia al fuego de ${fila.ambito || 'la fila sin nombre'}`}
                      className={INPUT}
                      onChange={(e) =>
                        onCambiar(fila.id, {
                          minutos: e.target.value === '' ? null : Number(e.target.value),
                        })
                      }
                    >
                      <option value="">— elegir —</option>
                      {RESISTENCIA_FUEGO_OPCIONES.map((r) => (
                        <option key={r} value={r}>
                          R{r}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-1 text-right">
                    <button
                      type="button"
                      onClick={() => onBorrar(fila.id)}
                      aria-label={`Quitar ${fila.ambito || 'la exigencia sin nombre'}`}
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
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-2">
        <MenuAnadir
          etiqueta="+ Añadir exigencia"
          nombres={AMBITOS_FUEGO.map((a) => a.etiqueta)}
          etiquetaLibre="Otra parte… (fila en blanco)"
          onElegir={onAnadir}
        />
        {ayuda && (
          <span className="text-[11px] text-text-disabled">
            Una línea por cada R distinta que exija el proyecto de incendios.
          </span>
        )}
      </div>
    </div>
  );
}
