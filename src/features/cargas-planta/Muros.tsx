/**
 * M4 — Muros.
 *
 * El terreno de relleno tras los muros de sótano o de contención, DECLARADO
 * como se declaran la nieve o el viento: ángulo de rozamiento interno, peso
 * específico aparente y sobrecarga sobre el terreno. Con ellos y con la
 * geometría de cada muro —que este módulo no conoce— se obtiene el empuje;
 * quien lo calcula es el módulo Muros, y aquí sólo se dice con qué números.
 *
 * Por eso el bloque se apaga entero: un edificio sin muros no tiene nada que
 * decir del terreno, y una memoria que declara un φ que nadie usa miente.
 */

import { RawNumberInput } from '../../components/units/RawNumberInput';
import { ToggleChip } from '../../components/ui/ToggleChip';
import { INPUT_SUELTO } from './estilos';
import type { MurosUI } from './state';

interface Props {
  muros: MurosUI;
  ayuda: boolean;
  onCambiar: (cambio: Partial<MurosUI>) => void;
}

export function Muros({ muros, ayuda, onCambiar }: Props) {
  return (
    <section className="rounded border border-border-main bg-bg-surface">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border-main px-4 py-2.5">
        <span className="rounded bg-bg-elevated px-1.5 py-0.5 font-mono text-[10px] text-text-disabled">M4</span>
        <h2 className="text-[13px] font-semibold text-text-primary">Muros</h2>
        <span className="text-[11px] text-text-disabled">DB SE-C, capítulos 3 y 6</span>
        <div className="ml-auto">
          <ToggleChip
            on={muros.hay}
            onToggle={() => onCambiar({ hay: !muros.hay })}
            onLabel="Con muros"
            offLabel="Sin muros"
            ariaLabel="La obra tiene muros de sótano o de contención"
          />
        </div>
      </header>

      {ayuda && (
        <p className="border-b border-border-sub px-4 py-2 text-[11.5px] leading-snug text-text-disabled">
          ¿Hay muros de sótano o de contención? Entonces la memoria y el cuadro del plano tienen que decir con qué
          terreno se han calculado. Estos valores los da el estudio geotécnico; el empuje sobre cada muro sale de ellos
          y de su altura, y se calcula en el módulo Muros.
        </p>
      )}

      {muros.hay ? (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2.5">
          <div className="flex shrink-0 items-center gap-1.5">
            <label htmlFor="cargas-muros-terreno" className="text-[11.5px] text-text-secondary">
              Terreno
            </label>
            <input
              id="cargas-muros-terreno"
              type="text"
              value={muros.terreno}
              placeholder="Terreno de relleno"
              title="Como lo llame el estudio geotécnico; es lo que se imprime en el cuadro"
              className={INPUT_SUELTO + ' w-52'}
              onChange={(ev) => onCambiar({ terreno: ev.target.value })}
            />
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <label htmlFor="cargas-muros-phi" className="text-[11.5px] text-text-secondary">
              Ángulo de rozamiento interno φ
            </label>
            <RawNumberInput
              id="cargas-muros-phi"
              value={muros.phi}
              onChange={(phi) => onCambiar({ phi })}
              ariaLabel="Ángulo de rozamiento interno del terreno"
              unit="º"
              min={0}
              max={89}
              widthClass="w-14"
            />
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <label htmlFor="cargas-muros-gamma" className="text-[11.5px] text-text-secondary">
              Peso específico aparente γ
            </label>
            <RawNumberInput
              id="cargas-muros-gamma"
              value={muros.gamma}
              onChange={(gamma) => onCambiar({ gamma })}
              ariaLabel="Peso específico aparente del terreno"
              unit="kN/m³"
              min={0}
              widthClass="w-14"
            />
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <label htmlFor="cargas-muros-sobrecarga" className="text-[11.5px] text-text-secondary">
              Sobrecarga sobre el terreno
            </label>
            <RawNumberInput
              id="cargas-muros-sobrecarga"
              value={muros.sobrecarga}
              onChange={(sobrecarga) => onCambiar({ sobrecarga })}
              ariaLabel="Sobrecarga sobre el terreno"
              unit="kN/m²"
              min={0}
              widthClass="w-14"
            />
          </div>
        </div>
      ) : (
        <p className="px-4 py-2.5 text-[11.5px] text-text-disabled">
          La obra no tiene muros de sótano ni de contención: la memoria y el cuadro del plano no dicen nada del terreno.
        </p>
      )}
    </section>
  );
}
