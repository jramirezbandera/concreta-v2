/**
 * Cubierta a dos aguas (Anejo D.6): lo que se contesta.
 *
 * Cuatro preguntas de obra —pendiente, hacia dónde va la cumbrera, altura de
 * coronación y qué se comprueba—. Las zonas F…J con sus presiones van en la
 * vista Cubierta del lienzo y en la columna de resultados.
 */

import { ToggleChip } from '../../components/ui/ToggleChip';
import { RawNumberInput } from '../../components/units/RawNumberInput';
import { PENDIENTE_D6 } from '../../lib/acciones/tablasAE';
import { Campo, FilaInterruptor, NotaSeccion } from './campos';
import { AREA_MODO_OPCIONES, CUMBRERA_OPCIONES, type AreaModo, type EjeCumbrera } from './catalogos';
import { INPUT } from './estilos';
import type { CubiertaUI, VientoUI } from './state';

const dec = (v: number, n: number) => v.toFixed(n).replace('.', ',');

interface Props {
  v: VientoUI;
  /** Altura de coronación deducida del último forjado y la pendiente, m. */
  hDerivada: number;
  ayuda: boolean;
  onCambiar: (cambio: Partial<CubiertaUI>) => void;
}

export function Cubierta({ v, hDerivada, ayuda, onCambiar }: Props) {
  const c = v.cubierta;
  const cumbrera = CUMBRERA_OPCIONES.find((o) => o.id === c.cumbrera);
  const areaModo = AREA_MODO_OPCIONES.find((o) => o.id === c.areaModo);

  return (
    <div className="flex flex-col gap-2.5">
      <FilaInterruptor etiqueta="¿Cubierta inclinada?">
        <ToggleChip on={c.activa} onToggle={() => onCambiar({ activa: !c.activa })} onLabel="Incluida" offLabel="Plana u omitida" ariaLabel="Incluir la cubierta a dos aguas" />
      </FilaInterruptor>

      {c.activa && (
        <>
          {ayuda && (
            <NotaSeccion>
              La norma reparte cada faldón en zonas —F y G en los bordes por donde entra el viento, H e I en el cuerpo, J tras
              la cumbrera— y da a cada una su coeficiente por la pendiente. Lo que sale es la presión sobre la estructura de la
              cubierta; las fachadas siguen con su fuerza por planta.
            </NotaSeccion>
          )}

          <Campo
            etiqueta="Pendiente de los faldones"
            ayuda={`Ángulo de los faldones con la horizontal. Negativo si bajan hacia el centro (cubierta en V). La tabla D.6 va de ${PENDIENTE_D6.min}º a ${PENDIENTE_D6.max}º.`}
            nota={ayuda ? `Negativa si bajan hacia el centro. La tabla D.6 va de ${PENDIENTE_D6.min}º a ${PENDIENTE_D6.max}º.` : undefined}
          >
            <RawNumberInput value={c.pendiente} onChange={(pendiente) => onCambiar({ pendiente })} ariaLabel="Pendiente de los faldones" unit="º" min={PENDIENTE_D6.min} max={PENDIENTE_D6.max} widthClass="w-16" />
          </Campo>

          <Campo etiqueta="¿Hacia dónde va la cumbrera?" ayuda={cumbrera?.ayuda}>
            <select value={c.cumbrera} aria-label="Dirección de la cumbrera" className={INPUT} onChange={(ev) => onCambiar({ cumbrera: ev.target.value as EjeCumbrera })}>
              {CUMBRERA_OPCIONES.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.etiqueta} ({dec(v.dimensiones[o.id], 2)} m)
                </option>
              ))}
            </select>
          </Campo>

          <Campo
            etiqueta="Altura de coronación"
            ayuda="El punto más alto de la cubierta sobre rasante: la cumbrera si la pendiente es positiva, el alero si es negativa. Si no se teclea, se toma el último forjado más lo que sube el faldón."
          >
            <div className="flex flex-wrap items-center gap-2">
              <RawNumberInput value={c.alturaCoronacion ?? hDerivada} onChange={(alturaCoronacion) => onCambiar({ alturaCoronacion })} ariaLabel="Altura de coronación" unit="m" min={0} widthClass="w-20" />
              {c.alturaCoronacion === null ? (
                <span className="text-[10.5px] text-accent">último forjado + pendiente</span>
              ) : (
                <button type="button" onClick={() => onCambiar({ alturaCoronacion: null })} className="text-[10.5px] text-text-disabled hover:text-text-secondary" title="Volver a deducirla del último forjado y la pendiente">
                  deducir ({dec(hDerivada, 2)} m)
                </button>
              )}
            </div>
          </Campo>

          <Campo etiqueta="¿Qué se comprueba?" ayuda={areaModo?.ayuda} nota={ayuda ? areaModo?.ayuda : undefined}>
            <div className="flex gap-2">
              <select value={c.areaModo} aria-label="Área de influencia" className={INPUT} onChange={(ev) => onCambiar({ areaModo: ev.target.value as AreaModo })}>
                {AREA_MODO_OPCIONES.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.etiqueta}
                  </option>
                ))}
              </select>
              {c.areaModo === 'propia' && (
                <RawNumberInput value={c.areaPropia} onChange={(areaPropia) => onCambiar({ areaPropia })} ariaLabel="Área de influencia tecleada" unit="m²" min={0} widthClass="w-16" />
              )}
            </div>
          </Campo>
        </>
      )}
    </div>
  );
}
