/**
 * La ficha de la fila abierta: una fila de detalle bajo la zona seleccionada.
 *
 * Recoge lo que no merece una columna propia —los casos raros de la tabla 3.1,
 * que casi ninguna obra usa pero que cuando hacen falta hacen falta— y, a la
 * derecha, lo que dice la norma para ESTA zona con los números ya hechos. Antes
 * todo esto se repetía en cada zona aunque estuviera vacío; ahora se pide.
 *
 * La nieve vive aquí y no en una columna porque es de la PLANTA, no de la zona,
 * y porque su origen (el sobre de Viento y nieve, un valor propio o ninguna)
 * necesita más sitio del que da una celda.
 */

import { Trash2 } from 'lucide-react';
import { RawNumberInput } from '../../components/units/RawNumberInput';
import type { ZonaCargasResuelta } from '../../lib/acciones/cargas';
import type { CategoriaUso, FamiliaPsi } from '../../lib/acciones/tablasCargas';
import { HIPOTESIS_TEXTO } from '../../lib/acciones/cuadrosCargas';
import { toDisplay } from '../../lib/units/convert';
import { getPrecision, getUnitLabel } from '../../lib/units/format';
import { useUnitSystem } from '../../lib/units/useUnitSystem';
import { CATALOGO_PERMANENTES, FAMILIA_PSI_OPCIONES, NIEVE_MODO_OPCIONES, USO_OPCIONES, type NieveModo } from './catalogos';
import { BOTON_MENOR, INPUT_ANCHO } from './estilos';
import type { NievePublicada } from './nievePub';
import type { PlantaUI, UsoUI, ZonaUI } from './state';

const dec = (v: number, d: number) => v.toFixed(d).replace('.', ',');

/** Los usos desde los que se puede acceder a una terraza: ni ella misma ni una cubierta ni un valor propio. */
const USOS_ACCESO = USO_OPCIONES.filter((o) => o.id !== 'F' && o.id !== 'G' && o.id !== 'otro');

interface Props {
  planta: PlantaUI;
  z: ZonaUI;
  r: ZonaCargasResuelta | undefined;
  /** Nombre de la zona en los aria-label: «Planta Baja (Vaso piscina)». */
  quien: string;
  unica: boolean;
  ayuda: boolean;
  nievePub: NievePublicada | null;
  onZona: (cambio: Partial<ZonaUI>) => void;
  onPlanta: (cambio: Partial<PlantaUI>) => void;
  onBorrarZona: () => void;
  onUsarNieve: (faldon: string | null) => void;
}

/** Un bloque de «lo que dice la norma»: rótulo pequeño arriba, la explicación debajo. */
function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="font-mono text-[9px] uppercase tracking-[0.06em] text-text-disabled">{titulo}</span>
      <p className="text-[11px] leading-snug text-text-secondary">{children}</p>
    </div>
  );
}

/** Un número dentro de la explicación: mono y en el color del texto principal. */
function N({ children }: { children: React.ReactNode }) {
  return <b className="font-mono text-[10.5px] font-semibold text-text-primary">{children}</b>;
}

/** Una casilla de caso raro, con su explicación al lado. */
function Casilla({ on, onCambiar, ariaLabel, children }: { on: boolean; onCambiar: (v: boolean) => void; ariaLabel: string; children: React.ReactNode }) {
  return (
    <label className="flex items-start gap-2 text-[11.5px] leading-snug text-text-secondary">
      <input type="checkbox" checked={on} aria-label={ariaLabel} onChange={(ev) => onCambiar(ev.target.checked)} className="mt-0.5 accent-[var(--color-accent)]" />
      <span>{children}</span>
    </label>
  );
}

export function Ficha({ planta, z, r, quien, unica, ayuda, nievePub, onZona, onPlanta, onBorrarZona, onUsarNieve }: Props) {
  const { system } = useUnitSystem();
  const uQ = getUnitLabel('areaLoad', system);
  const mostrar = (v: number) => dec(toDisplay(v, 'areaLoad', system), getPrecision('areaLoad', system));
  const cambiarUso = (cambio: Partial<UsoUI>) => onZona({ uso: { ...z.uso, ...cambio } });

  const permanentes = z.permanentes.filter((p) => p.valor !== 0 || p.concepto.trim() !== '');
  const nombreCatalogo = (catalogoId: string | null) => CATALOGO_PERMANENTES.find((e) => e.id === catalogoId)?.etiqueta;

  return (
    <div className="flex flex-col gap-4 border-b border-border-main bg-bg-surface px-3 py-2.5 lg:flex-row lg:gap-6">
      {/* Lo que se contesta: los casos raros de esta zona. */}
      <div className="flex w-full shrink-0 flex-col gap-2 lg:w-64">
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate font-mono text-[10px] uppercase tracking-[0.06em] text-accent">{quien}</span>
          {!unica && (
            <button type="button" onClick={onBorrarZona} aria-label={`Borrar la zona ${quien}`} className="rounded p-0.5 text-text-disabled hover:text-state-fail" title="Borrar esta zona">
              <Trash2 size={13} aria-hidden="true" />
            </button>
          )}
        </div>

        {!unica && (
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-text-secondary">Nombre de la zona</span>
            <input type="text" value={z.nombre} aria-label={`Nombre de la zona de ${planta.nombre || 'la planta'}`} placeholder="p. ej. Vaso piscina" className={INPUT_ANCHO} onChange={(ev) => onZona({ nombre: ev.target.value })} />
          </label>
        )}

        <Casilla on={z.uso.escalera} onCambiar={(escalera) => cambiarUso({ escalera })} ariaLabel={`Portal, meseta o escalera en ${quien}`}>
          Es portal, meseta o escalera <span className="text-text-disabled">(+1 kN/m² en viviendas y oficinas)</span>
        </Casilla>
        <Casilla on={z.uso.balcon} onCambiar={(balcon) => cambiarUso({ balcon })} ariaLabel={`Balcón volado en ${quien}`}>
          Tiene balcones volados <span className="text-text-disabled">(2 kN/m en el borde)</span>
        </Casilla>

        {z.uso.categoria === 'G' && (
          <>
            <label className="flex items-center gap-2">
              <span className="text-[11px] text-text-secondary">Inclinación de la cubierta</span>
              <RawNumberInput value={z.uso.inclinacion} onChange={(inclinacion) => cambiarUso({ inclinacion })} ariaLabel={`Inclinación de la cubierta de ${quien}`} unit="º" min={0} max={89} widthClass="w-14" />
            </label>
            <Casilla on={z.uso.ligera} onCambiar={(ligera) => cambiarUso({ ligera })} ariaLabel={`Cubierta ligera sobre correas en ${quien}`}>
              Ligera sobre correas, sin forjado <span className="text-text-disabled">(0,4 kN/m²)</span>
            </Casilla>
          </>
        )}

        {z.uso.categoria === 'F' && (
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-text-secondary">¿Desde qué uso se accede?</span>
            <select value={z.uso.accesoDesde} aria-label={`Uso de acceso a ${quien}`} className={INPUT_ANCHO} onChange={(ev) => cambiarUso({ accesoDesde: ev.target.value as CategoriaUso })}>
              {USOS_ACCESO.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.etiqueta}
                </option>
              ))}
            </select>
          </label>
        )}

        {z.uso.categoria === 'otro' && (
          <>
            <label className="flex items-center gap-2">
              <span className="text-[11px] text-text-secondary">Sobrecarga adoptada</span>
              <RawNumberInput value={z.uso.qkManual} onChange={(qkManual) => cambiarUso({ qkManual })} ariaLabel={`Sobrecarga adoptada en ${quien}`} unit="kN/m²" min={0} widthClass="w-16" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-text-secondary">Coeficientes ψ como…</span>
              <select value={z.uso.psiComo} aria-label={`Familia ψ de ${quien}`} className={INPUT_ANCHO} onChange={(ev) => cambiarUso({ psiComo: ev.target.value as FamiliaPsi })}>
                {FAMILIA_PSI_OPCIONES.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.etiqueta}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}

        {planta.esCubierta && (
          <div className="flex flex-col gap-1.5 border-t border-border-sub pt-2">
            <span className="text-[11px] text-text-secondary">Nieve sobre la cubierta</span>
            <select
              value={planta.nieve.modo}
              aria-label={`Origen de la nieve de ${planta.nombre || 'la cubierta'}`}
              className={INPUT_ANCHO}
              onChange={(ev) => {
                const m = ev.target.value as NieveModo;
                if (m === 'publicada') onUsarNieve(planta.nieve.faldon);
                else onPlanta({ nieve: { ...planta.nieve, modo: m, tsPub: null, inePub: null } });
              }}
            >
              {NIEVE_MODO_OPCIONES.map((o) => (
                <option key={o.id} value={o.id} disabled={o.id === 'publicada' && !nievePub}>
                  {o.etiqueta}
                  {o.id === 'publicada' && !nievePub ? ' (no hay publicación)' : ''}
                </option>
              ))}
            </select>
            {planta.nieve.modo === 'manual' && (
              <RawNumberInput value={planta.nieve.valor} onChange={(valor) => onPlanta({ nieve: { ...planta.nieve, valor } })} ariaLabel={`Nieve tecleada en ${planta.nombre || 'la cubierta'}`} unit="kN/m²" min={0} widthClass="w-20" />
            )}
            {planta.nieve.modo === 'publicada' && nievePub && nievePub.faldones.length > 1 && (
              <select value={planta.nieve.faldon ?? ''} aria-label={`Faldón de la nieve publicada en ${planta.nombre || 'la cubierta'}`} className={INPUT_ANCHO} onChange={(ev) => onUsarNieve(ev.target.value === '' ? null : ev.target.value)}>
                <option value="">El máximo ({dec(nievePub.qnMax, 2)} kN/m²)</option>
                {nievePub.faldones.map((f) => (
                  <option key={f.nombre} value={f.nombre}>
                    {f.nombre} ({dec(f.qn, 2)} kN/m²)
                  </option>
                ))}
              </select>
            )}
            {planta.nieve.modo === 'publicada' && (
              <span className="font-mono text-[11.5px] text-accent">qn = {dec(planta.nieve.valor, 2)} kN/m²</span>
            )}
            {nievePub && planta.nieve.modo !== 'manual' && (
              <button type="button" onClick={() => onUsarNieve(planta.nieve.faldon)} className={BOTON_MENOR + ' self-start'} title="Volver a tomar la nieve del sobre de Viento y nieve">
                Usar la nieve publicada ({dec(nievePub.qnMax, 2)} kN/m²)
              </button>
            )}
          </div>
        )}

        {ayuda && <p className="text-[10.5px] leading-snug text-text-disabled">Casos raros de esta zona. Vuelva a pulsar la fila para cerrarla.</p>}
      </div>

      {/* Lo que dice la norma, con los números de esta zona. */}
      {r && (
        <div className="grid min-w-0 flex-1 gap-x-5 gap-y-3 sm:grid-cols-2 xl:grid-cols-4">
          <Bloque titulo="Peso propio">
            {r.forjado.ppOrigen === 'manual' ? (
              <>
                Valor propio: <N>{mostrar(r.forjado.pp)}</N> {uQ}.{' '}
                <button type="button" onClick={() => onZona({ forjado: { ...z.forjado, ppManual: null } })} className="underline decoration-dotted hover:text-text-primary">
                  usar el de la norma
                </button>
              </>
            ) : r.forjado.ppOrigen === 'densidad' ? (
              <>
                25 kN/m³ × {dec(r.forjado.canto / 100, 2)} m = <N>{mostrar(r.forjado.pp)}</N> {uQ} (tabla C.1).
              </>
            ) : r.forjado.ppOrigen === 'tablaC5' ? (
              <>
                Tabla C.5 para un grueso de {dec(r.forjado.canto, 0)} cm: <N>{mostrar(r.forjado.pp)}</N> {uQ}.{r.forjado.fueraDeTabla ? ' El canto se sale de la tabla y se ha tomado el último tramo.' : ''}
              </>
            ) : (
              <>La norma no da un valor para este forjado: tecléelo en la columna PP.</>
            )}
            {r.forjado.ppOrigen !== 'manual' && r.forjado.ppOrigen !== 'sinDato' && ' Si tiene el del programa o del fabricante, tecléelo en PP.'}
          </Bloque>

          <Bloque titulo="Encima del forjado">
            {permanentes.length === 0 ? (
              <>Nada encima del forjado: G es sólo el peso propio.</>
            ) : (
              <>
                {permanentes.map((p, i) => (
                  <span key={p.id}>
                    {i > 0 ? ' · ' : ''}
                    {p.concepto.trim() || nombreCatalogo(p.catalogoId) || 'Carga'} {mostrar(p.valor)}
                  </span>
                ))}
                {'. '}
                G = {mostrar(r.forjado.pp)} + {mostrar(r.resto)} = <N>{mostrar(r.G)}</N> {uQ}.
              </>
            )}
          </Bloque>

          <Bloque titulo="Sobrecarga de uso">
            {r.uso.etiqueta}: <N>{mostrar(r.uso.qUso)}</N> {uQ}
            {r.uso.incrementoEscaleras > 0 ? ` (${mostrar(r.uso.qk)} + ${mostrar(r.uso.incrementoEscaleras)} por escalera)` : ''}
            {r.uso.qkConcentrada !== null ? ` y ${dec(r.uso.qkConcentrada, 0)} kN concentrados para comprobaciones locales` : ''} (tabla 3.1). ψ0 {dec(r.uso.psi.psi0, 1)} · ψ1 {dec(r.uso.psi.psi1, 1)} · ψ2 {dec(r.uso.psi.psi2, 1)} (DB SE, tabla 4.2).
            {r.uso.bordeBalcon !== undefined ? ` En el borde del balcón, ${dec(r.uso.bordeBalcon, 0)} kN/m.` : ''}
          </Bloque>

          <Bloque titulo="Predimensionado">
            Gd = 1,35 × {mostrar(r.G)} = <N>{mostrar(r.Gd)}</N> · Qd = 1,50 × {mostrar(r.Q)} = <N>{mostrar(r.Qd)}</N> · qd = <N>{mostrar(r.qd)}</N> {uQ}.{' '}
            {r.nieve !== null && r.nieve > 0 ? `Manda ${HIPOTESIS_TEXTO[r.hipotesis].toLocaleLowerCase('es')}. ` : ''}
            Gd y Qd van a la pestaña Predimensionado del Excel.
          </Bloque>
        </div>
      )}
    </div>
  );
}
