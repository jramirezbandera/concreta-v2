/**
 * M2 — Cubierta a dos aguas (Anejo D.6), dentro del bloque de viento.
 *
 * Cuatro preguntas de obra —pendiente, hacia dónde va la cumbrera, altura de
 * coronación y qué se comprueba— y dos tablas derivadas, una por dirección
 * del viento, con las zonas F…J de la figura D.6: dónde están, su área, los
 * dos coeficientes de la norma, el adoptado y la presión que resulta.
 */

import { HelpTooltip } from '../../components/ui/HelpTooltip';
import { ToggleChip } from '../../components/ui/ToggleChip';
import { RawNumberInput } from '../../components/units/RawNumberInput';
import { rotuloDireccionCubierta, textoCpe } from '../../lib/acciones/cuadros';
import type { DireccionResuelta } from '../../lib/acciones/dosAguas';
import { PENDIENTE_D6 } from '../../lib/acciones/tablasAE';
import type { CubiertaResuelta } from '../../lib/acciones/viento';
import { toDisplay } from '../../lib/units/convert';
import { getPrecision, getUnitLabel } from '../../lib/units/format';
import type { Quantity } from '../../lib/units/types';
import { useUnitSystem } from '../../lib/units/useUnitSystem';
import { AREA_MODO_OPCIONES, CUMBRERA_OPCIONES, type AreaModo, type EjeCumbrera } from './catalogos';
import type { CubiertaUI, VientoUI } from './state';

const INPUT =
  'w-full min-w-0 rounded border border-border-main bg-bg-primary px-2 py-1 text-[12px] text-text-primary focus:border-accent focus:outline-none';
const TH = 'border-b border-border-main px-2 py-1.5 text-left text-[10px] font-semibold uppercase text-text-disabled';
const TH_DER = 'border-b border-border-main px-2 py-1.5 text-right text-[10px] font-semibold uppercase text-accent';
const TD_DER = 'px-2 py-1.5 text-right font-mono text-[12px] text-text-primary';

interface Props {
  v: VientoUI;
  resultado: CubiertaResuelta | null;
  /** Altura de coronación deducida del último forjado y la pendiente, m. */
  hDerivada: number;
  ayuda: boolean;
  onCambiar: (cambio: Partial<CubiertaUI>) => void;
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

function TablaDireccion({
  d,
  cumbrera,
  mostrar,
  uQ,
}: {
  d: DireccionResuelta;
  cumbrera: EjeCumbrera;
  mostrar: (valor: number, q: Quantity) => string;
  uQ: string;
}) {
  return (
    <div className="min-w-0">
      <p className="px-2 pb-1 font-mono text-[11px] text-text-secondary">
        {rotuloDireccionCubierta(d, cumbrera)} · b = {dec(d.b, 2)} m, d = {dec(d.d, 2)} m, e = min(b, 2h) = {dec(d.e, 2)} m
      </p>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr>
              <th className={TH}>Zona</th>
              <th className={TH}>Dónde está</th>
              <th className={TH_DER} title="Área en planta de cada pieza de la zona">
                Área (m²)
              </th>
              <th className={TH_DER} title="Coeficiente para áreas de influencia de 10 m² o más">
                cpe,10
              </th>
              <th className={TH_DER} title="Coeficiente para áreas de influencia de 1 m² o menos">
                cpe,1
              </th>
              <th className={TH_DER} title="El adoptado para el área de influencia A (fórmula D.4 entre 1 y 10 m²)">
                cpe (A)
              </th>
              <th className={TH_DER} title="qb·ce·cpe, hacia fuera de la cubierta">
                Succión ({uQ})
              </th>
              <th className={TH_DER} title="qb·ce·cpe, hacia dentro de la cubierta">
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
                  <div className="text-[10px] text-text-disabled">
                    {z.piezas} × {dec(z.ancho, 2)} × {dec(z.fondo, 2)} m
                  </div>
                </td>
                <td className={TD_DER}>{dec(z.area, 2)}</td>
                <td className={TD_DER}>{textoCpe(z.cpe10)}</td>
                <td className={TD_DER}>{textoCpe(z.cpe1)}</td>
                <td className={TD_DER}>
                  {textoCpe(z.cpe)}
                  <div className="text-[10px] text-text-secondary">A = {dec(z.A, 1)} m²</div>
                </td>
                <td className={TD_DER}>{z.succion === null ? '—' : mostrar(z.succion, 'areaLoad')}</td>
                <td className={TD_DER}>{z.presion === null ? '—' : `+${mostrar(z.presion, 'areaLoad')}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function Cubierta({ v, resultado, hDerivada, ayuda, onCambiar }: Props) {
  const { system } = useUnitSystem();
  const mostrar = (valor: number, q: Quantity) => dec(toDisplay(valor, q, system), getPrecision(q, system));
  const uQ = getUnitLabel('areaLoad', system);
  const c = v.cubierta;
  const cumbrera = CUMBRERA_OPCIONES.find((o) => o.id === c.cumbrera);
  const areaModo = AREA_MODO_OPCIONES.find((o) => o.id === c.areaModo);

  return (
    <div className="border-t border-border-main">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
        <h3 className="text-[12.5px] font-semibold text-text-primary">Cubierta a dos aguas</h3>
        <span className="text-[11px] text-text-disabled">Anejo D.6 · presión por zonas de la cubierta</span>
        <div className="ml-auto">
          <ToggleChip
            on={c.activa}
            onToggle={() => onCambiar({ activa: !c.activa })}
            onLabel="Incluida"
            offLabel="Cubierta plana u omitida"
            ariaLabel="Incluir la cubierta a dos aguas"
          />
        </div>
      </div>

      {c.activa && (
        <>
          {ayuda && (
            <p className="border-t border-border-sub px-4 py-2 text-[11.5px] leading-snug text-text-disabled">
              Diga la pendiente de los faldones, hacia dónde va la cumbrera y a qué altura está su coronación. La
              norma reparte cada faldón en zonas —F y G en los bordes por donde entra el viento, H e I en el cuerpo
              de los faldones, J justo detrás de la cumbrera— y da a cada una un coeficiente por la pendiente, con
              dos posibilidades cuando puede pasar de succión a presión. Lo que sale es la presión sobre cada zona,
              para la estructura de la cubierta; las fachadas siguen con su fuerza por planta.
            </p>
          )}

          <div className="grid gap-3 border-t border-border-sub px-4 py-3 sm:grid-cols-2 lg:grid-cols-4">
            <Fila
              etiqueta="Pendiente de los faldones"
              ayuda={`Ángulo de los faldones con la horizontal. Negativo si bajan hacia el centro (cubierta en V). La tabla D.6 va de ${PENDIENTE_D6.min}º a ${PENDIENTE_D6.max}º.`}
            >
              <RawNumberInput
                value={c.pendiente}
                onChange={(pendiente) => onCambiar({ pendiente })}
                ariaLabel="Pendiente de los faldones"
                unit="º"
                min={PENDIENTE_D6.min}
                max={PENDIENTE_D6.max}
                widthClass="w-16"
              />
            </Fila>

            <Fila etiqueta="¿Hacia dónde va la cumbrera?" ayuda={cumbrera?.ayuda}>
              <select
                value={c.cumbrera}
                aria-label="Dirección de la cumbrera"
                className={INPUT}
                onChange={(ev) => onCambiar({ cumbrera: ev.target.value as EjeCumbrera })}
              >
                {CUMBRERA_OPCIONES.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.etiqueta} ({dec(v.dimensiones[o.id], 2)} m)
                  </option>
                ))}
              </select>
            </Fila>

            <Fila
              etiqueta="Altura de coronación"
              ayuda="El punto más alto de la cubierta sobre rasante: la cumbrera si la pendiente es positiva, el alero si es negativa. Si no se teclea, se toma el último forjado más lo que sube el faldón."
            >
              <div className="flex flex-wrap items-center gap-2">
                <RawNumberInput
                  value={c.alturaCoronacion ?? hDerivada}
                  onChange={(alturaCoronacion) => onCambiar({ alturaCoronacion })}
                  ariaLabel="Altura de coronación"
                  unit="m"
                  min={0}
                  widthClass="w-20"
                />
                {c.alturaCoronacion === null ? (
                  <span className="text-[10.5px] text-accent">último forjado + pendiente</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onCambiar({ alturaCoronacion: null })}
                    className="text-[10.5px] text-text-disabled hover:text-text-secondary"
                    title="Volver a deducirla del último forjado y la pendiente"
                  >
                    deducir ({dec(hDerivada, 2)} m)
                  </button>
                )}
              </div>
            </Fila>

            <Fila etiqueta="¿Qué se comprueba?" ayuda={areaModo?.ayuda}>
              <div className="flex gap-2">
                <select
                  value={c.areaModo}
                  aria-label="Área de influencia"
                  className={INPUT}
                  onChange={(ev) => onCambiar({ areaModo: ev.target.value as AreaModo })}
                >
                  {AREA_MODO_OPCIONES.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.etiqueta}
                    </option>
                  ))}
                </select>
                {c.areaModo === 'propia' && (
                  <RawNumberInput
                    value={c.areaPropia}
                    onChange={(areaPropia) => onCambiar({ areaPropia })}
                    ariaLabel="Área de influencia tecleada"
                    unit="m²"
                    min={0}
                    widthClass="w-16"
                  />
                )}
              </div>
            </Fila>
          </div>

          {resultado && (
            <>
              <p className="border-t border-border-sub px-4 pt-2 font-mono text-[11px] text-text-secondary">
                A la coronación (h = {dec(resultado.alturaCoronacion, 2)} m): ce = {dec(resultado.ce, 3)} → qb·ce ={' '}
                {mostrar(resultado.qe, 'areaLoad')} {uQ}
              </p>
              <div className="flex flex-col gap-3 px-2 py-2">
                <TablaDireccion d={resultado.perpendicular} cumbrera={resultado.cumbrera} mostrar={mostrar} uQ={uQ} />
                <TablaDireccion d={resultado.paralela} cumbrera={resultado.cumbrera} mostrar={mostrar} uQ={uQ} />
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
