/**
 * M2 — Paramentos verticales (tabla D.3), dentro del bloque de viento.
 *
 * No pregunta nada que el edificio no haya dicho ya (dimensiones, alturas,
 * cubierta): sólo qué se comprueba, para el área de influencia. Salen dos
 * tablas, una por dirección del viento, con las zonas A…E de cada fachada,
 * su ancho, el coeficiente y la presión.
 */

import { HelpTooltip } from '../../components/ui/HelpTooltip';
import { ToggleChip } from '../../components/ui/ToggleChip';
import { RawNumberInput } from '../../components/units/RawNumberInput';
import { rotuloParamentos } from '../../lib/acciones/cuadros';
import type { DireccionParamentos } from '../../lib/acciones/paramentos';
import type { ParamentosResueltos } from '../../lib/acciones/viento';
import { toDisplay } from '../../lib/units/convert';
import { getPrecision, getUnitLabel } from '../../lib/units/format';
import type { Quantity } from '../../lib/units/types';
import { useUnitSystem } from '../../lib/units/useUnitSystem';
import { AREA_MODO_PARAMENTOS_OPCIONES, type AreaModo } from './catalogos';
import type { ParamentosUI, VientoUI } from './state';

const INPUT =
  'w-full min-w-0 rounded border border-border-main bg-bg-primary px-2 py-1 text-[12px] text-text-primary focus:border-accent focus:outline-none';
const TH = 'border-b border-border-main px-2 py-1.5 text-left text-[10px] font-semibold uppercase text-text-disabled';
const TH_DER = 'border-b border-border-main px-2 py-1.5 text-right text-[10px] font-semibold uppercase text-accent';
const TD_DER = 'px-2 py-1.5 text-right font-mono text-[12px] text-text-primary';

interface Props {
  v: VientoUI;
  resultado: ParamentosResueltos | null;
  ayuda: boolean;
  onCambiar: (cambio: Partial<ParamentosUI>) => void;
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

const dec = (v: number, n: number) => v.toFixed(n).replace('.', ',');

function TablaDireccion({ d, mostrar, uQ }: { d: DireccionParamentos; mostrar: (valor: number, q: Quantity) => string; uQ: string }) {
  return (
    <div className="min-w-0">
      <p className="px-2 pb-1 font-mono text-[11px] text-text-secondary">
        {rotuloParamentos(d)} · d = {dec(d.d, 2)} m, b = {dec(d.b, 2)} m
      </p>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr>
              <th className={TH}>Zona</th>
              <th className={TH}>Dónde está</th>
              <th className={TH_DER} title="Ancho en planta de la zona">
                Ancho (m)
              </th>
              <th className={TH_DER} title="Ancho por altura de fachada, de una sola fachada">
                Área (m²)
              </th>
              <th className={TH_DER} title="Tabla D.3 interpolada en h/d y en el área de influencia A">
                cpe
              </th>
              <th className={TH_DER} title="qb·ce·cpe; negativa es succión">
                Presión ({uQ})
              </th>
            </tr>
          </thead>
          <tbody>
            {d.zonas.map((z) => (
              <tr key={z.zona} className="border-b border-border-sub align-top last:border-0">
                <td className="px-2 py-1.5 font-mono font-semibold text-text-primary">{z.zona}</td>
                <td className="px-2 py-1.5 text-[11px] text-text-secondary">
                  {z.descripcion}
                  {z.piezas > 1 && <span className="text-text-disabled"> (×{z.piezas})</span>}
                </td>
                <td className={TD_DER}>{dec(z.ancho, 2)}</td>
                <td className={TD_DER}>{dec(z.area, 2)}</td>
                <td className={TD_DER}>
                  {dec(z.cpe, 2)}
                  <div className="text-[10px] text-text-secondary">A = {dec(z.A, 1)} m²</div>
                </td>
                <td className={TD_DER}>{z.presion > 0 ? `+${mostrar(z.presion, 'areaLoad')}` : mostrar(z.presion, 'areaLoad')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function Paramentos({ v, resultado, ayuda, onCambiar }: Props) {
  const { system } = useUnitSystem();
  const mostrar = (valor: number, q: Quantity) => dec(toDisplay(valor, q, system), getPrecision(q, system));
  const uQ = getUnitLabel('areaLoad', system);
  const p = v.paramentos;
  const areaModo = AREA_MODO_PARAMENTOS_OPCIONES.find((o) => o.id === p.areaModo);

  return (
    <div className="border-t border-border-main">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
        <h3 className="text-[12.5px] font-semibold text-text-primary">Paramentos verticales</h3>
        <span className="text-[11px] text-text-disabled">tabla D.3 · presión por zonas de las fachadas</span>
        <div className="ml-auto">
          <ToggleChip
            on={p.activos}
            onToggle={() => onCambiar({ activos: !p.activos })}
            onLabel="Incluidos"
            offLabel="Omitidos"
            ariaLabel="Incluir los paramentos verticales"
          />
        </div>
      </div>

      {p.activos && (
        <>
          {ayuda && (
            <p className="border-t border-border-sub px-4 py-2 text-[11.5px] leading-snug text-text-disabled">
              Para carpinterías, acristalamientos, aplacados, anclajes o correas de fachada. La norma reparte cada
              fachada en zonas —D la que recibe el viento, E la opuesta, y A, B y C a lo largo de las laterales, de
              más a menos succión— y da a cada una su coeficiente por la esbeltez h/d del edificio y el área del
              elemento. La estructura del edificio de pisos sigue con la fuerza por planta de arriba.
            </p>
          )}

          <div className="grid gap-3 border-t border-border-sub px-4 py-3 sm:grid-cols-2 lg:grid-cols-4">
            <Fila etiqueta="¿Qué se comprueba?" ayuda={areaModo?.ayuda}>
              <div className="flex gap-2">
                <select
                  value={p.areaModo}
                  aria-label="Área de influencia de las fachadas"
                  className={INPUT}
                  onChange={(ev) => onCambiar({ areaModo: ev.target.value as AreaModo })}
                >
                  {AREA_MODO_PARAMENTOS_OPCIONES.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.etiqueta}
                    </option>
                  ))}
                </select>
                {p.areaModo === 'propia' && (
                  <RawNumberInput
                    value={p.areaPropia}
                    onChange={(areaPropia) => onCambiar({ areaPropia })}
                    ariaLabel="Área de influencia de las fachadas tecleada"
                    unit="m²"
                    min={0}
                    widthClass="w-16"
                  />
                )}
              </div>
            </Fila>

            {resultado && (
              <div className="flex min-w-0 flex-col gap-1 sm:col-span-2 lg:col-span-3">
                <span className="text-[11px] text-accent">Lo que pone la norma</span>
                <span className="font-mono text-[12px] text-text-primary">
                  h = {dec(resultado.h, 2)} m → ce = {dec(resultado.ce, 3)} → qb·ce = {mostrar(resultado.qe, 'areaLoad')} {uQ}; fachadas de{' '}
                  {dec(resultado.alturaFachada, 2)} m para las áreas
                </span>
              </div>
            )}
          </div>

          {resultado && (
            <div className="flex flex-col gap-3 border-t border-border-sub px-2 py-2">
              <TablaDireccion d={resultado.x} mostrar={mostrar} uQ={uQ} />
              <TablaDireccion d={resultado.y} mostrar={mostrar} uQ={uQ} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
