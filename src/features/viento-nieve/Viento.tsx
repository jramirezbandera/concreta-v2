/**
 * Viento: lo que se contesta.
 *
 * Entorno, presión dinámica, superficie, lados en planta y la lista de
 * plantas por su altura de forjado a forjado, con la cota que resulta al
 * lado en azul. Nada de tablas derivadas: la norma habla en la columna de
 * resultados y en el alzado. La planta seleccionada se resalta aquí y en el
 * dibujo, y se elige desde cualquiera de los dos.
 */

import { Trash2 } from 'lucide-react';
import { RawNumberInput } from '../../components/units/RawNumberInput';
import { ToggleChip } from '../../components/ui/ToggleChip';
import { CabeceraLista, Campo, FilaInterruptor, NotaSeccion } from './campos';
import { ASPEREZA_OPCIONES, QB_MODO_OPCIONES, SUPERFICIE_OPCIONES, type QbModo } from './catalogos';
import { BOTON_MENOR, INPUT, SELECCION } from './estilos';
import { cotasPlantas, type PlantaUI, type VientoUI } from './state';

const dec = (v: number, n: number) => v.toFixed(n).replace('.', ',');

interface Props {
  v: VientoUI;
  ayuda: boolean;
  plantaSel: string | null;
  onSelectPlanta: (id: string | null) => void;
  onCambiar: (cambio: Partial<VientoUI>) => void;
  onPlanta: (id: string, cambio: Partial<PlantaUI>) => void;
  onAnadirPlanta: () => void;
  onBorrarPlanta: (id: string) => void;
}

export function Viento({ v, ayuda, plantaSel, onSelectPlanta, onCambiar, onPlanta, onAnadirPlanta, onBorrarPlanta }: Props) {
  const aspereza = ASPEREZA_OPCIONES.find((o) => o.id === v.aspereza);
  const qbModo = QB_MODO_OPCIONES.find((o) => o.id === v.qbModo);
  const superficie = SUPERFICIE_OPCIONES.find((o) => o.id === v.superficie);
  const cotas = cotasPlantas(v.plantas);

  return (
    <div className="flex flex-col gap-2.5">
      <FilaInterruptor etiqueta="¿Entra el viento?">
        <ToggleChip on={v.activo} onToggle={() => onCambiar({ activo: !v.activo })} onLabel="Incluido" offLabel="Omitido" ariaLabel="Incluir el viento" />
      </FilaInterruptor>

      {!v.activo ? (
        <p className="text-[11.5px] text-text-disabled">El viento no entra en esta obra. Púlselo para incluirlo.</p>
      ) : (
        <>
          {ayuda && (
            <NotaSeccion>
              Diga cómo es el entorno, cuánto mide el edificio y cuánto tiene cada planta. La norma pone la presión, el
              coeficiente de exposición de cada forjado y la fuerza por planta que se lleva al programa de cálculo.
            </NotaSeccion>
          )}

          <Campo etiqueta="¿Cómo es el entorno del edificio?" ayuda={aspereza?.ayuda} nota={ayuda ? aspereza?.ayuda : undefined}>
            <select value={v.aspereza} aria-label="Grado de aspereza del entorno" className={INPUT} onChange={(ev) => onCambiar({ aspereza: ev.target.value as VientoUI['aspereza'] })}>
              {ASPEREZA_OPCIONES.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.etiqueta}
                </option>
              ))}
            </select>
          </Campo>

          <Campo etiqueta="Presión dinámica qb" ayuda={qbModo?.ayuda}>
            <div className="flex gap-2">
              <select value={v.qbModo} aria-label="Presión dinámica" className={INPUT} onChange={(ev) => onCambiar({ qbModo: ev.target.value as QbModo })}>
                {QB_MODO_OPCIONES.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.etiqueta}
                  </option>
                ))}
              </select>
              {v.qbModo === 'manual' && (
                <RawNumberInput value={v.qbManual} onChange={(qbManual) => onCambiar({ qbManual })} ariaLabel="Presión dinámica tecleada" unit="kN/m²" min={0} widthClass="w-16" />
              )}
            </div>
          </Campo>

          <Campo
            etiqueta="¿Cómo es la superficie exterior?"
            ayuda={`${superficie?.ayuda ?? ''} El rozamiento del viento sobre las fachadas laterales y la cubierta (art. 3.3.2-3) se suma a las fuerzas por planta cuando pasa del 10 % de la fuerza perpendicular.`}
          >
            <select value={v.superficie} aria-label="Superficie exterior" className={INPUT} onChange={(ev) => onCambiar({ superficie: ev.target.value as VientoUI['superficie'] })}>
              {SUPERFICIE_OPCIONES.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.etiqueta}
                </option>
              ))}
            </select>
          </Campo>

          <div className="grid grid-cols-2 gap-2.5">
            <Campo etiqueta="Lado X en planta" ayuda="Lado del edificio paralelo al eje X. El viento «según X» sopla a lo largo de este lado y empuja la fachada Y.">
              <RawNumberInput value={v.dimensiones.x} onChange={(x) => onCambiar({ dimensiones: { ...v.dimensiones, x } })} ariaLabel="Dimensión en planta según X" unit="m" min={0} fullWidth />
            </Campo>
            <Campo etiqueta="Lado Y en planta" ayuda="Lado del edificio paralelo al eje Y. El viento «según Y» sopla a lo largo de este lado y empuja la fachada X.">
              <RawNumberInput value={v.dimensiones.y} onChange={(y) => onCambiar({ dimensiones: { ...v.dimensiones, y } })} ariaLabel="Dimensión en planta según Y" unit="m" min={0} fullWidth />
            </Campo>
          </div>

          <div className="flex flex-col gap-1">
            <CabeceraLista>Plantas · altura de cada planta, de forjado a forjado</CabeceraLista>
            {ayuda && <p className="text-[10px] leading-tight text-text-disabled">Se teclea la altura entre forjados; la cota sobre rasante la pone el programa y es la que usa la norma.</p>}
            <div className="grid grid-cols-[minmax(0,1fr)_64px_44px_18px] gap-1.5 px-0.5 text-[10px] font-semibold uppercase text-text-disabled">
              <span>Planta</span>
              <span className="text-right">Altura</span>
              <span className="text-right text-accent">Cota z</span>
              <span />
            </div>
            {v.plantas.map((p, i) => {
              const seleccionada = p.id === plantaSel;
              return (
                <div
                  key={p.id}
                  data-planta={p.id}
                  onClick={() => onSelectPlanta(seleccionada ? null : p.id)}
                  className="-mx-0.5 grid grid-cols-[minmax(0,1fr)_64px_44px_18px] items-center gap-1.5 rounded px-0.5 py-0.5"
                  style={seleccionada ? SELECCION : undefined}
                >
                  <input type="text" value={p.nombre} aria-label="Nombre de la planta" className={INPUT} onChange={(ev) => onPlanta(p.id, { nombre: ev.target.value })} />
                  <RawNumberInput value={p.altura} onChange={(altura) => onPlanta(p.id, { altura })} ariaLabel={`Altura de ${p.nombre || 'la planta'}`} unit="m" min={0} fullWidth />
                  <span className="text-right font-mono text-[11px] text-accent tabular-nums">{dec(cotas[i], 2)}</span>
                  <button
                    type="button"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      onBorrarPlanta(p.id);
                    }}
                    aria-label={`Borrar ${p.nombre || 'la planta'}`}
                    className="rounded p-0.5 text-text-disabled hover:text-state-fail"
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                </div>
              );
            })}
            <div className="flex items-center justify-between gap-2 pt-0.5">
              <button type="button" onClick={onAnadirPlanta} className={BOTON_MENOR}>
                + Añadir planta
              </button>
              <span className="text-[10px] text-text-disabled">{plantaSel ? 'seleccionada en el dibujo' : 'clic en el dibujo para seleccionar'}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
