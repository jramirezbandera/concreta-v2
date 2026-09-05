/**
 * M2 — Plantas y cargas.
 *
 * Una tarjeta por planta: su nombre, si es cubierta (y entonces la nieve,
 * tomada de lo que publica Viento y nieve o tecleada), y una zona de carga o
 * varias («Vivienda», «Vaso piscina») con su forjado, lo que hay encima y su
 * uso. Las columnas azules las pone el motor.
 */

import { Copy, Trash2 } from 'lucide-react';
import { RawNumberInput } from '../../components/units/RawNumberInput';
import { HelpTooltip } from '../../components/ui/HelpTooltip';
import { ToggleChip } from '../../components/ui/ToggleChip';
import type { CargasResultado, ZonaCargasResuelta } from '../../lib/acciones/cargas';
import { NIEVE_MODO_OPCIONES, type NieveModo } from './catalogos';
import type { NievePublicada } from './nievePub';
import type { PlantaUI, ZonaUI } from './state';
import { Zona } from './Zona';

const INPUT =
  'w-full min-w-0 rounded border border-border-main bg-bg-primary px-2 py-1 text-[12px] text-text-primary focus:border-accent focus:outline-none';

interface Props {
  plantas: PlantaUI[];
  resultado: CargasResultado;
  nievePub: NievePublicada | null;
  avisosNieve: string[];
  ayuda: boolean;
  onPlanta: (id: string, cambio: Partial<PlantaUI>) => void;
  onZona: (plantaId: string, zonaId: string, cambio: Partial<ZonaUI>) => void;
  onAnadirPlanta: () => void;
  onDuplicarPlanta: (id: string) => void;
  onBorrarPlanta: (id: string) => void;
  onAnadirZona: (plantaId: string) => void;
  onBorrarZona: (plantaId: string, zonaId: string) => void;
  onUsarNieve: (plantaId: string, faldon: string | null) => void;
}

const dec = (v: number, d: number) => v.toFixed(d).replace('.', ',');

export function Plantas({ plantas, resultado, nievePub, avisosNieve, ayuda, onPlanta, onZona, onAnadirPlanta, onDuplicarPlanta, onBorrarPlanta, onAnadirZona, onBorrarZona, onUsarNieve }: Props) {
  const porId = new Map<string, ZonaCargasResuelta>();
  resultado.plantas.forEach((p) => p.zonas.forEach((z) => z.id && porId.set(z.id, z)));

  return (
    <section className="rounded border border-border-main bg-bg-surface">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border-main px-4 py-2.5">
        <span className="rounded bg-bg-elevated px-1.5 py-0.5 font-mono text-[10px] text-text-disabled">M2</span>
        <h2 className="text-[13px] font-semibold text-text-primary">Plantas y cargas</h2>
        <span className="text-[11px] text-text-disabled">DB SE-AE art. 2.1 · 3.1 · Anejo C</span>
      </header>

      {ayuda && (
        <p className="border-b border-border-sub px-4 py-2 text-[11.5px] leading-snug text-text-disabled">
          Por cada planta: qué forjado tiene (la app propone su peso propio y usted lo corrige con el del programa),
          qué hay encima (solado, tabiquería, cubierta, agua…) y para qué se usa (la sobrecarga sale de la tabla
          3.1). Si una planta tiene partes con distinto uso o forjado —vivienda y vaso de piscina—, añádale una
          zona. En las cubiertas, la nieve se toma de lo que publica Viento y nieve y en el predimensionado manda
          la mayor de uso y nieve (no son concomitantes).
        </p>
      )}

      {plantas.map((p) => {
        const modo = NIEVE_MODO_OPCIONES.find((o) => o.id === p.nieve.modo);
        return (
          <div key={p.id} className="border-b border-border-sub last:border-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 bg-bg-elevated/40 px-4 py-2">
              <input type="text" value={p.nombre} aria-label="Nombre de la planta" className={INPUT + ' max-w-[220px] font-semibold'} onChange={(ev) => onPlanta(p.id, { nombre: ev.target.value })} />
              <ToggleChip on={p.esCubierta} onToggle={() => onPlanta(p.id, { esCubierta: !p.esCubierta })} onLabel="Cubierta" offLabel="Planta de piso" ariaLabel={`${p.nombre || 'La planta'} es cubierta`} />
              <div className="ml-auto flex items-center gap-1">
                <button type="button" onClick={() => onAnadirZona(p.id)} className="rounded border border-border-main bg-bg-elevated px-2 py-0.5 text-[11.5px] text-text-secondary hover:text-text-primary" title="Otra parte de la misma planta con distinto uso o forjado">
                  + Añadir zona
                </button>
                <button type="button" onClick={() => onDuplicarPlanta(p.id)} aria-label={`Duplicar ${p.nombre || 'la planta'}`} className="rounded p-1 text-text-disabled hover:text-text-primary" title="Duplicar la planta">
                  <Copy size={14} aria-hidden="true" />
                </button>
                <button type="button" onClick={() => onBorrarPlanta(p.id)} aria-label={`Borrar ${p.nombre || 'la planta'}`} className="rounded p-1 text-text-disabled hover:text-state-fail" title="Borrar la planta">
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </div>
            </div>

            {p.esCubierta && (
              <div className="flex flex-wrap items-end gap-3 px-4 py-2">
                <label className="flex min-w-0 flex-col gap-1">
                  <span className="flex items-center gap-1 text-[11px] text-text-secondary">
                    Nieve sobre la cubierta
                    {modo ? <HelpTooltip text={modo.ayuda} fieldLabel="Nieve" /> : null}
                  </span>
                  <select value={p.nieve.modo} aria-label={`Origen de la nieve de ${p.nombre || 'la cubierta'}`} className={INPUT + ' max-w-[260px]'} onChange={(ev) => {
                    const m = ev.target.value as NieveModo;
                    if (m === 'publicada') onUsarNieve(p.id, p.nieve.faldon);
                    else onPlanta(p.id, { nieve: { ...p.nieve, modo: m, tsPub: null, inePub: null } });
                  }}>
                    {NIEVE_MODO_OPCIONES.map((o) => (
                      <option key={o.id} value={o.id} disabled={o.id === 'publicada' && !nievePub}>
                        {o.etiqueta}
                        {o.id === 'publicada' && !nievePub ? ' (no hay publicación)' : ''}
                      </option>
                    ))}
                  </select>
                </label>
                {p.nieve.modo === 'manual' && (
                  <RawNumberInput value={p.nieve.valor} onChange={(valor) => onPlanta(p.id, { nieve: { ...p.nieve, valor } })} ariaLabel={`Nieve tecleada en ${p.nombre || 'la cubierta'}`} unit="kN/m²" min={0} widthClass="w-20" />
                )}
                {p.nieve.modo === 'publicada' && (
                  <>
                    {nievePub && nievePub.faldones.length > 1 && (
                      <select value={p.nieve.faldon ?? ''} aria-label={`Faldón de la nieve publicada en ${p.nombre || 'la cubierta'}`} className={INPUT + ' max-w-[220px]'} onChange={(ev) => onUsarNieve(p.id, ev.target.value === '' ? null : ev.target.value)}>
                        <option value="">El máximo ({dec(nievePub.qnMax, 2)} kN/m²)</option>
                        {nievePub.faldones.map((f) => (
                          <option key={f.nombre} value={f.nombre}>
                            {f.nombre} ({dec(f.qn, 2)} kN/m²)
                          </option>
                        ))}
                      </select>
                    )}
                    <span className="font-mono text-[12px] text-accent">qn = {dec(p.nieve.valor, 2)} kN/m²</span>
                    {nievePub && (
                      <button type="button" onClick={() => onUsarNieve(p.id, p.nieve.faldon)} className="rounded border border-border-main bg-bg-elevated px-2 py-0.5 text-[11.5px] text-text-secondary hover:text-text-primary" title="Volver a tomar la nieve del sobre de Viento y nieve">
                        Usar la nieve publicada
                      </button>
                    )}
                  </>
                )}
                {p.nieve.modo === 'ninguna' && nievePub && (
                  <button type="button" onClick={() => onUsarNieve(p.id, null)} className="rounded border border-border-main bg-bg-elevated px-2 py-0.5 text-[11.5px] text-text-secondary hover:text-text-primary" title={`Viento y nieve publica ${dec(nievePub.qnMax, 2)} kN/m²${nievePub.municipio ? ` en ${nievePub.municipio}` : ''}`}>
                    Usar la nieve publicada ({dec(nievePub.qnMax, 2)} kN/m²)
                  </button>
                )}
              </div>
            )}

            {p.zonas.map((z) => (
              <Zona
                key={z.id}
                planta={p.nombre || 'Planta'}
                esCubierta={p.esCubierta}
                z={z}
                r={porId.get(z.id)}
                unica={p.zonas.length === 1 && !z.nombre}
                ayuda={ayuda}
                onCambiar={(cambio) => onZona(p.id, z.id, cambio)}
                onBorrar={() => onBorrarZona(p.id, z.id)}
              />
            ))}
          </div>
        );
      })}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border-sub px-4 py-2">
        <button type="button" onClick={onAnadirPlanta} className="rounded border border-border-main bg-bg-elevated px-2.5 py-1 text-[11.5px] text-text-secondary hover:text-text-primary">
          + Añadir planta
        </button>
        <span className="font-mono text-[11px] text-text-disabled">
          {plantas.length} {plantas.length === 1 ? 'planta' : 'plantas'} · {resultado.plantas.reduce((n, p) => n + p.zonas.length, 0)} zonas
        </span>
      </div>

      {resultado.errores.map((e) => (
        <p key={e} className="px-4 pb-2 text-[12px] text-state-fail">
          {e}
        </p>
      ))}
      {[...resultado.avisos, ...avisosNieve].map((a) => (
        <p key={a} className="px-4 pb-2 text-[12px] text-state-warn">
          {a}
        </p>
      ))}
    </section>
  );
}
