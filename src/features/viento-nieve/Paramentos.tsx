/**
 * Fachadas por zonas (tabla D.3): lo que se contesta.
 *
 * No pregunta nada que el edificio no haya dicho ya (dimensiones, alturas,
 * cubierta): sólo qué se comprueba, para el área de influencia. Las zonas
 * A…E de cada fachada van en la vista Fachadas del lienzo y en resultados.
 */

import { ToggleChip } from '../../components/ui/ToggleChip';
import { RawNumberInput } from '../../components/units/RawNumberInput';
import type { ParamentosResueltos } from '../../lib/acciones/viento';
import { Campo, FilaInterruptor, NotaSeccion } from './campos';
import { AREA_MODO_PARAMENTOS_OPCIONES, type AreaModo } from './catalogos';
import { INPUT } from './estilos';
import type { ParamentosUI, VientoUI } from './state';

const dec = (v: number, n: number) => v.toFixed(n).replace('.', ',');

interface Props {
  v: VientoUI;
  resultado: ParamentosResueltos | null;
  ayuda: boolean;
  onCambiar: (cambio: Partial<ParamentosUI>) => void;
}

export function Paramentos({ v, resultado, ayuda, onCambiar }: Props) {
  const p = v.paramentos;
  const areaModo = AREA_MODO_PARAMENTOS_OPCIONES.find((o) => o.id === p.areaModo);

  return (
    <div className="flex flex-col gap-2.5">
      <FilaInterruptor etiqueta="¿Presión por zonas de fachada?">
        <ToggleChip on={p.activos} onToggle={() => onCambiar({ activos: !p.activos })} onLabel="Incluidas" offLabel="Omitidas" ariaLabel="Incluir los paramentos verticales" />
      </FilaInterruptor>

      {p.activos && (
        <>
          {ayuda && (
            <NotaSeccion>
              Para carpinterías, acristalamientos, aplacados, anclajes o correas de fachada. La norma reparte cada fachada en
              zonas —D la que recibe el viento, E la opuesta, y A, B y C a lo largo de las laterales— por la esbeltez h/d y el
              área del elemento. La estructura del edificio sigue con la fuerza por planta.
            </NotaSeccion>
          )}

          <Campo etiqueta="¿Qué se comprueba?" ayuda={areaModo?.ayuda} nota={ayuda ? areaModo?.ayuda : undefined}>
            <div className="flex gap-2">
              <select value={p.areaModo} aria-label="Área de influencia de las fachadas" className={INPUT} onChange={(ev) => onCambiar({ areaModo: ev.target.value as AreaModo })}>
                {AREA_MODO_PARAMENTOS_OPCIONES.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.etiqueta}
                  </option>
                ))}
              </select>
              {p.areaModo === 'propia' && (
                <RawNumberInput value={p.areaPropia} onChange={(areaPropia) => onCambiar({ areaPropia })} ariaLabel="Área de influencia de las fachadas tecleada" unit="m²" min={0} widthClass="w-16" />
              )}
            </div>
          </Campo>

          {resultado && (
            <Campo etiqueta="Lo que pone la norma" derivado>
              <p className="font-mono text-[11.5px] leading-relaxed text-text-primary">
                h = {dec(resultado.h, 2)} m → ce {dec(resultado.ce, 3)}
                <br />
                qb·ce = {dec(resultado.qe, 3)} kN/m²
                <br />
                fachadas de {dec(resultado.alturaFachada, 2)} m para las áreas
              </p>
            </Campo>
          )}
        </>
      )}
    </div>
  );
}
