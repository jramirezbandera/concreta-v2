/**
 * Una zona de carga: el forjado, lo que hay encima y para qué se usa, con la
 * tira de valores derivados (azules) a la derecha: peso propio, resto, G, la
 * sobrecarga de uso, la nieve si es cubierta, y Gd / Qd / qd.
 */

import { Trash2 } from 'lucide-react';
import { RawNumberInput } from '../../components/units/RawNumberInput';
import { HelpTooltip } from '../../components/ui/HelpTooltip';
import type { ZonaCargasResuelta } from '../../lib/acciones/cargas';
import type { CategoriaUso, FamiliaPsi } from '../../lib/acciones/tablasCargas';
import { HIPOTESIS_TEXTO } from '../../lib/acciones/cuadrosCargas';
import { toDisplay } from '../../lib/units/convert';
import { getPrecision, getUnitLabel } from '../../lib/units/format';
import { useUnitSystem } from '../../lib/units/useUnitSystem';
import {
  CANTOS_RETICULAR,
  CANTO_INICIAL,
  CATALOGO_PERMANENTES,
  FAMILIA_PSI_OPCIONES,
  FORJADO_OPCIONES,
  USO_OPCIONES,
} from './catalogos';
import { nuevoPermanente, type PermanenteUI, type ZonaUI } from './state';
import type { TipoForjado } from '../../lib/acciones/cargas';

const INPUT =
  'w-full min-w-0 rounded border border-border-main bg-bg-primary px-2 py-1 text-[12px] text-text-primary focus:border-accent focus:outline-none';

interface Props {
  planta: string;
  esCubierta: boolean;
  z: ZonaUI;
  r: ZonaCargasResuelta | undefined;
  /** La única zona de la planta: no se pide nombre ni se puede borrar. */
  unica: boolean;
  ayuda: boolean;
  onCambiar: (cambio: Partial<ZonaUI>) => void;
  onBorrar: () => void;
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

function Derivado({ etiqueta, valor, titulo }: { etiqueta: string; valor: string; titulo?: string }) {
  return (
    <div className="flex min-w-0 flex-col" title={titulo}>
      <span className="text-[10px] uppercase text-accent">{etiqueta}</span>
      <span className="font-mono text-[12px] text-text-primary">{valor}</span>
    </div>
  );
}

const dec = (v: number, d: number) => v.toFixed(d).replace('.', ',');

const USOS_ACCESO = USO_OPCIONES.filter((o) => o.id !== 'F' && o.id !== 'G' && o.id !== 'otro');

export function Zona({ planta, esCubierta, z, r, unica, ayuda, onCambiar, onBorrar }: Props) {
  const { system } = useUnitSystem();
  const uQ = getUnitLabel('areaLoad', system);
  const mostrar = (v: number) => dec(toDisplay(v, 'areaLoad', system), getPrecision('areaLoad', system));
  const quien = z.nombre.trim() ? `${planta} (${z.nombre.trim()})` : planta;

  const forjado = FORJADO_OPCIONES.find((o) => o.id === z.forjado.tipo);
  const uso = USO_OPCIONES.find((o) => o.id === z.uso.categoria);
  const sinCanto = z.forjado.tipo === 'madera' || z.forjado.tipo === 'otro';

  const cambiarTipo = (tipo: TipoForjado) => onCambiar({ forjado: { tipo, canto: CANTO_INICIAL[tipo], ppManual: null } });
  const cambiarUso = (cambio: Partial<ZonaUI['uso']>) => onCambiar({ uso: { ...z.uso, ...cambio } });
  const cambiarPermanente = (id: string, cambio: Partial<PermanenteUI>) =>
    onCambiar({ permanentes: z.permanentes.map((c) => (c.id === id ? { ...c, ...cambio } : c)) });
  const anadirPermanente = (catalogoId: string) => {
    if (!catalogoId) return;
    onCambiar({ permanentes: [...z.permanentes, nuevoPermanente(catalogoId)] });
  };

  return (
    <div className="grid gap-3 border-t border-border-sub px-4 py-3 lg:grid-cols-[1fr_auto]">
      <div className="flex min-w-0 flex-col gap-3">
        {!unica && (
          <div className="flex flex-wrap items-end gap-3">
            <Fila etiqueta="Zona (sub-uso de la planta)" ayuda="Un nombre para esta parte de la planta: «Vaso piscina», «Terrazas». Sale como «Planta Baja (Vaso piscina)».">
              <input type="text" value={z.nombre} aria-label={`Nombre de la zona de ${planta}`} placeholder="p. ej. Vaso piscina" className={INPUT + ' max-w-[240px]'} onChange={(ev) => onCambiar({ nombre: ev.target.value })} />
            </Fila>
            <button type="button" onClick={onBorrar} aria-label={`Borrar la zona ${quien}`} className="rounded p-1 text-text-disabled hover:text-state-fail">
              <Trash2 size={14} aria-hidden="true" />
            </button>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Fila etiqueta="¿Qué forjado tiene?" ayuda={forjado?.ayuda}>
            <select value={z.forjado.tipo} aria-label={`Tipo de forjado de ${quien}`} className={INPUT} onChange={(ev) => cambiarTipo(ev.target.value as TipoForjado)}>
              {FORJADO_OPCIONES.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.etiqueta}
                </option>
              ))}
            </select>
          </Fila>

          <Fila etiqueta="Canto total" ayuda={z.forjado.tipo === 'reticular' ? `Los cantos habituales del reticular son ${CANTOS_RETICULAR.join(', ')} cm (capa incluida).` : 'Grueso total del forjado, en centímetros.'}>
            <div className="flex items-center gap-2">
              <RawNumberInput value={z.forjado.canto} onChange={(canto) => onCambiar({ forjado: { ...z.forjado, canto } })} ariaLabel={`Canto del forjado de ${quien}`} unit="cm" min={0} max={200} widthClass="w-20" />
              {z.forjado.tipo === 'reticular' && (
                <span className="flex flex-wrap gap-x-1.5 text-[11px] text-text-disabled">
                  {CANTOS_RETICULAR.map((c) => (
                    <button key={c} type="button" onClick={() => onCambiar({ forjado: { ...z.forjado, canto: c } })} className={['underline decoration-dotted hover:text-text-secondary', c === z.forjado.canto ? 'text-accent' : ''].join(' ')}>
                      {c}
                    </button>
                  ))}
                </span>
              )}
            </div>
          </Fila>

          <Fila etiqueta="Peso propio del forjado" ayuda="La app propone el de la norma (25 kN/m³ por el canto en losas y soleras; tabla C.5 en el resto). Si tiene el del programa de cálculo o del fabricante, tecléelo: manda sobre la propuesta.">
            <div className="flex flex-wrap items-center gap-2">
              <RawNumberInput
                value={z.forjado.ppManual ?? r?.forjado.pp ?? 0}
                onChange={(pp) => onCambiar({ forjado: { ...z.forjado, ppManual: pp } })}
                ariaLabel={`Peso propio de ${quien}`}
                unit="kN/m²"
                min={0}
                widthClass="w-20"
              />
              {z.forjado.ppManual !== null ? (
                <span className="text-[11px] text-text-secondary">
                  valor propio
                  {!sinCanto && r && r.forjado.ppOrigen === 'manual' && (
                    <>
                      {' · '}
                      <button type="button" onClick={() => onCambiar({ forjado: { ...z.forjado, ppManual: null } })} className="underline decoration-dotted hover:text-text-primary">
                        usar el de la norma
                      </button>
                    </>
                  )}
                </span>
              ) : (
                <span className="text-[11px] text-accent">{r?.forjado.ppOrigen === 'densidad' ? '25 kN/m³ · canto' : r?.forjado.ppOrigen === 'tablaC5' ? 'tabla C.5' : 'tecléelo'}</span>
              )}
            </div>
          </Fila>
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="flex items-center gap-1 text-[11px] text-text-secondary">
            ¿Qué hay encima del forjado?
            <HelpTooltip text="Solados, tabiquería, formación de cubierta, rellenos: las cargas permanentes que no son el forjado. Se suman en «Resto de carga permanente». Los valores propuestos son los de la tabla C.5 del DB SE-AE." fieldLabel="Cargas permanentes" />
          </span>
          {z.permanentes.map((c) => {
            const cat = c.catalogoId ? CATALOGO_PERMANENTES.find((e) => e.id === c.catalogoId) : undefined;
            return (
              <div key={c.id} className="flex flex-wrap items-center gap-2">
                <input type="text" value={c.concepto} aria-label={`Concepto de carga permanente en ${quien}`} placeholder="Concepto" className={INPUT + ' max-w-[300px] flex-1'} onChange={(ev) => cambiarPermanente(c.id, { concepto: ev.target.value })} />
                {cat?.porEspesor !== null && cat?.porEspesor !== undefined && (
                  <span className="flex items-center gap-1 text-[11px] text-text-secondary">
                    espesor
                    <RawNumberInput
                      value={c.espesor ?? 0}
                      onChange={(espesor) => cambiarPermanente(c.id, { espesor, valor: Math.round(espesor * (cat.porEspesor ?? 0) * 100) / 100 })}
                      ariaLabel={`Espesor de ${c.concepto || 'la carga'} en ${quien}`}
                      unit="m"
                      min={0}
                      widthClass="w-16"
                    />
                    ×{cat.porEspesor} =
                  </span>
                )}
                <RawNumberInput value={c.valor} onChange={(valor) => cambiarPermanente(c.id, { valor })} ariaLabel={`Valor de ${c.concepto || 'la carga permanente'} en ${quien}`} unit="kN/m²" min={0} widthClass="w-20" />
                <button type="button" onClick={() => onCambiar({ permanentes: z.permanentes.filter((x) => x.id !== c.id) })} aria-label={`Quitar ${c.concepto || 'la carga permanente'} de ${quien}`} className="rounded p-1 text-text-disabled hover:text-state-fail">
                  <Trash2 size={13} aria-hidden="true" />
                </button>
              </div>
            );
          })}
          <select value="" aria-label={`Añadir carga permanente en ${quien}`} className={INPUT + ' max-w-[320px]'} onChange={(ev) => anadirPermanente(ev.target.value)}>
            <option value="">+ Añadir del catálogo…</option>
            {CATALOGO_PERMANENTES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.etiqueta}
                {c.valor !== null ? ` (${dec(c.valor, 1)} kN/m²)` : c.porEspesor !== null ? ` (${c.porEspesor} kN/m³)` : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Fila etiqueta="¿Para qué se usa?" ayuda={uso?.ayuda}>
            <select value={z.uso.categoria} aria-label={`Uso de ${quien}`} className={INPUT} onChange={(ev) => cambiarUso({ categoria: ev.target.value as CategoriaUso | 'otro' })}>
              {USO_OPCIONES.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.etiqueta}
                </option>
              ))}
            </select>
          </Fila>

          {z.uso.categoria === 'G' && (
            <>
              <Fila etiqueta="Inclinación de la cubierta" ayuda="0º = plana. Hasta 20º vale G1; entre 20º y 40º se interpola; a partir de 40º no hay sobrecarga (tabla 3.1, nota 3).">
                <RawNumberInput value={z.uso.inclinacion} onChange={(inclinacion) => cambiarUso({ inclinacion })} ariaLabel={`Inclinación de la cubierta de ${quien}`} unit="º" min={0} max={89} widthClass="w-16" />
              </Fila>
              <label className="flex items-center gap-2 self-end text-[12px] text-text-secondary">
                <input type="checkbox" checked={z.uso.ligera} aria-label={`Cubierta ligera sobre correas en ${quien}`} onChange={(ev) => cambiarUso({ ligera: ev.target.checked })} className="accent-[var(--color-accent)]" />
                <span>Ligera sobre correas, sin forjado (0,4 kN/m²)</span>
              </label>
            </>
          )}

          {z.uso.categoria === 'F' && (
            <Fila etiqueta="¿Desde qué uso se accede?" ayuda="Los coeficientes de simultaneidad de una terraza son los del uso desde el que se accede (tabla 3.1, nota 2).">
              <select value={z.uso.accesoDesde} aria-label={`Uso de acceso a ${quien}`} className={INPUT} onChange={(ev) => cambiarUso({ accesoDesde: ev.target.value as CategoriaUso })}>
                {USOS_ACCESO.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.etiqueta}
                  </option>
                ))}
              </select>
            </Fila>
          )}

          {z.uso.categoria === 'otro' && (
            <>
              <Fila etiqueta="Sobrecarga adoptada" ayuda="El valor del suministrador o de la propiedad. Se consigna en la memoria como valor adoptado (art. 3.1.1-5).">
                <RawNumberInput value={z.uso.qkManual} onChange={(qkManual) => cambiarUso({ qkManual })} ariaLabel={`Sobrecarga adoptada en ${quien}`} unit="kN/m²" min={0} widthClass="w-20" />
              </Fila>
              <Fila etiqueta="Coeficientes ψ como…" ayuda={FAMILIA_PSI_OPCIONES.find((o) => o.id === z.uso.psiComo)?.ayuda}>
                <select value={z.uso.psiComo} aria-label={`Familia ψ de ${quien}`} className={INPUT} onChange={(ev) => cambiarUso({ psiComo: ev.target.value as FamiliaPsi })}>
                  {FAMILIA_PSI_OPCIONES.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.etiqueta}
                    </option>
                  ))}
                </select>
              </Fila>
            </>
          )}
        </div>

        <div className="flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-text-secondary">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={z.uso.escalera} aria-label={`Portal, meseta o escalera en ${quien}`} onChange={(ev) => cambiarUso({ escalera: ev.target.checked })} className="accent-[var(--color-accent)]" />
            <span>Es portal, meseta o escalera (+1 kN/m² en viviendas y oficinas)</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={z.uso.balcon} aria-label={`Balcón volado en ${quien}`} onChange={(ev) => cambiarUso({ balcon: ev.target.checked })} className="accent-[var(--color-accent)]" />
            <span>Tiene balcones volados (2 kN/m en el borde)</span>
          </label>
        </div>

        {ayuda && r && r.uso.qkConcentrada !== null && (
          <p className="text-[11px] leading-snug text-text-disabled">
            Para comprobaciones locales, además, una carga concentrada de {dec(r.uso.qkConcentrada, 0)} kN (tabla 3.1).
          </p>
        )}
      </div>

      <div className="grid grid-cols-4 gap-x-4 gap-y-2 self-start rounded border border-border-sub bg-bg-primary px-3 py-2 sm:grid-cols-8 lg:grid-cols-4">
        <Derivado etiqueta="PP" valor={r ? mostrar(r.forjado.pp) : '—'} titulo="Peso propio del forjado" />
        <Derivado etiqueta="Resto" valor={r ? mostrar(r.resto) : '—'} titulo="Resto de carga permanente" />
        <Derivado etiqueta="G" valor={r ? mostrar(r.G) : '—'} titulo="Carga permanente total" />
        <Derivado etiqueta="Q uso" valor={r ? mostrar(r.uso.qUso) : '—'} titulo={r ? r.uso.etiqueta : 'Sobrecarga de uso'} />
        {esCubierta && <Derivado etiqueta="Nieve" valor={r && r.nieve !== null && r.nieve > 0 ? mostrar(r.nieve) : '—'} titulo="Carga de nieve de la cubierta" />}
        <Derivado etiqueta="Gd" valor={r ? mostrar(r.Gd) : '—'} titulo="1,35 · G" />
        <Derivado etiqueta="Qd" valor={r ? mostrar(r.Qd) : '—'} titulo={r ? `1,50 · Q, hipótesis ${HIPOTESIS_TEXTO[r.hipotesis]}` : '1,50 · Q'} />
        <Derivado etiqueta={`qd (${uQ})`} valor={r ? mostrar(r.qd) : '—'} titulo="Gd + Qd" />
      </div>
    </div>
  );
}
