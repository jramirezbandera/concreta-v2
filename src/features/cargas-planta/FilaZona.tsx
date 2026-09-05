/**
 * Una fila de la tabla: una zona de carga.
 *
 * Lo tecleado va en cajas blancas; lo que pone la norma, en azul y sin caja
 * (ese es el código de color del módulo). Las celdas de la planta y de la nieve
 * abarcan con `rowSpan` todas las zonas de su planta, porque son de la planta y
 * no de la zona.
 *
 * Los aria-label se componen con el mismo `quien` de siempre —«Canto del
 * forjado de Planta Baja (Vaso piscina)»— para que dos zonas de la misma planta
 * no compartan nombre accesible.
 */

import { Copy, Trash2 } from 'lucide-react';
import { RawNumberInput } from '../../components/units/RawNumberInput';
import type { TipoForjado, ZonaCargasResuelta } from '../../lib/acciones/cargas';
import { HIPOTESIS_TEXTO } from '../../lib/acciones/cuadrosCargas';
import { toDisplay } from '../../lib/units/convert';
import { getPrecision } from '../../lib/units/format';
import { useUnitSystem } from '../../lib/units/useUnitSystem';
import { CANTO_INICIAL, FORJADO_OPCIONES, USO_OPCIONES } from './catalogos';
import { permanenteDe, ponerEnCelda, ponerEspesor, type ColumnaEncima } from './columnas';
import { COLUMNA_QD, COLUMNA_QD_SEL, INPUT, SELECCION, TD, TD_NUM } from './estilos';
import type { PlantaUI, ZonaUI } from './state';

const dec = (v: number, d: number) => v.toFixed(d).replace('.', ',');

interface Props {
  planta: PlantaUI;
  z: ZonaUI;
  r: ZonaCargasResuelta | undefined;
  /** Índice de la zona dentro de su planta: la primera lleva las celdas con rowSpan. */
  indice: number;
  columnas: ColumnaEncima[];
  quien: string;
  seleccionada: boolean;
  /** Alguna zona de esta planta está seleccionada: la celda de planta se tinta igual. */
  plantaTocada: boolean;
  nievePubHay: boolean;
  onSeleccionar: () => void;
  onZona: (cambio: Partial<ZonaUI>) => void;
  onPlanta: (cambio: Partial<PlantaUI>) => void;
  onDuplicarPlanta: () => void;
  onBorrarPlanta: () => void;
  onAnadirZona: () => void;
}

/** Un valor que pone la norma: azul, mono, sin caja. */
function Derivado({ valor, titulo, sub, fuerte, fallo }: { valor: string; titulo: string; sub?: string; fuerte?: boolean; fallo?: boolean }) {
  return (
    <span title={titulo} className="flex flex-col items-end leading-tight">
      <span className={['font-mono text-[11.5px] tabular-nums', fallo ? 'text-state-fail' : 'text-accent', fuerte ? 'font-semibold' : ''].join(' ')}>{valor}</span>
      {sub && <span className="font-mono text-[8.5px] text-text-disabled">{sub}</span>}
    </span>
  );
}

export function FilaZona({
  planta,
  z,
  r,
  indice,
  columnas,
  quien,
  seleccionada,
  plantaTocada,
  nievePubHay,
  onSeleccionar,
  onZona,
  onPlanta,
  onDuplicarPlanta,
  onBorrarPlanta,
  onAnadirZona,
}: Props) {
  const { system } = useUnitSystem();
  const mostrar = (v: number) => dec(toDisplay(v, 'areaLoad', system), getPrecision('areaLoad', system));
  const nZonas = planta.zonas.length;
  const primera = indice === 0;
  const uso = USO_OPCIONES.find((o) => o.id === z.uso.categoria);
  const sinCanto = z.forjado.tipo === 'madera' || z.forjado.tipo === 'otro';
  const huecoPP = r?.forjado.ppOrigen === 'sinDato';
  const tinte = seleccionada ? SELECCION : undefined;

  /** Cambiar de tipo reinicia el canto y suelta el peso tecleado: era de otro forjado. */
  const cambiarTipo = (tipo: TipoForjado) => onZona({ forjado: { tipo, canto: CANTO_INICIAL[tipo], ppManual: null } });

  const celdaEncima = (c: ColumnaEncima) => {
    const p = permanenteDe(z, c.clave);
    const etiqueta = `${c.etiqueta} en ${quien}`;
    if (c.porEspesor !== null) {
      return (
        <span className="flex flex-col items-end gap-0.5">
          <RawNumberInput value={p?.espesor ?? 0} onChange={(espesor) => onZona({ permanentes: ponerEspesor(z, c, espesor).permanentes })} ariaLabel={`Espesor de ${etiqueta}`} unit="m" min={0} widthClass="w-10" />
          {p && <span className="font-mono text-[9px] text-accent">= {mostrar(p.valor)}</span>}
        </span>
      );
    }
    return <RawNumberInput value={p?.valor ?? 0} onChange={(valor) => onZona({ permanentes: ponerEnCelda(z, c, valor).permanentes })} ariaLabel={`Valor de ${etiqueta}`} min={0} widthClass="w-11" hideUnit />;
  };

  return (
    <tr data-zona={z.id} onClick={onSeleccionar} style={tinte} className="cursor-pointer">
      {/* Planta — abarca sus zonas */}
      {primera && (
        <td rowSpan={nZonas} className={TD + ' align-middle'} style={plantaTocada && !seleccionada ? SELECCION : undefined}>
          <div className="flex min-w-0 flex-col gap-0.5" onClick={(ev) => ev.stopPropagation()}>
            <input
              type="text"
              value={planta.nombre}
              aria-label="Nombre de la planta"
              className={INPUT + ' font-medium'}
              onChange={(ev) => onPlanta({ nombre: ev.target.value })}
            />
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onPlanta({ esCubierta: !planta.esCubierta })}
                aria-pressed={planta.esCubierta}
                aria-label={`${planta.nombre || 'La planta'} es cubierta`}
                title="La nieve y la sobrecarga de conservación sólo se piden en las cubiertas"
                className={[
                  'rounded px-1.5 py-px font-mono text-[9px] font-semibold tracking-[0.05em] transition-colors',
                  planta.esCubierta ? 'border border-accent/40 bg-accent/15 text-accent' : 'border border-border-main bg-bg-elevated text-text-disabled',
                ].join(' ')}
              >
                {planta.esCubierta ? 'CUBIERTA' : 'PISO'}
              </button>
              <span className="ml-auto flex items-center gap-0.5">
                <button type="button" onClick={onAnadirZona} className="rounded px-1 text-[10px] text-text-secondary hover:text-text-primary" title="Otra parte de la misma planta con distinto uso o forjado">
                  + zona
                </button>
                <button type="button" onClick={onDuplicarPlanta} aria-label={`Duplicar ${planta.nombre || 'la planta'}`} title="Duplicar la planta" className="rounded p-0.5 text-text-disabled hover:text-text-primary">
                  <Copy size={12} aria-hidden="true" />
                </button>
                <button type="button" onClick={onBorrarPlanta} aria-label={`Borrar ${planta.nombre || 'la planta'}`} title="Borrar la planta" className="rounded p-0.5 text-text-disabled hover:text-state-fail">
                  <Trash2 size={12} aria-hidden="true" />
                </button>
              </span>
            </div>
          </div>
        </td>
      )}

      {/* Zona */}
      <td className={TD}>
        {nZonas === 1 && !z.nombre ? (
          <span className="text-[11px] text-text-disabled">toda la planta</span>
        ) : (
          <input type="text" value={z.nombre} aria-label={`Nombre de la zona de ${planta.nombre || 'la planta'}`} placeholder="Zona" className={INPUT} onClick={(ev) => ev.stopPropagation()} onChange={(ev) => onZona({ nombre: ev.target.value })} />
        )}
      </td>

      {/* Forjado */}
      <td className={TD} onClick={(ev) => ev.stopPropagation()}>
        <select value={z.forjado.tipo} aria-label={`Tipo de forjado de ${quien}`} className={INPUT} onChange={(ev) => cambiarTipo(ev.target.value as TipoForjado)}>
          {FORJADO_OPCIONES.map((o) => (
            <option key={o.id} value={o.id}>
              {o.etiqueta}
            </option>
          ))}
        </select>
      </td>
      <td className={TD_NUM} onClick={(ev) => ev.stopPropagation()}>
        {sinCanto ? (
          <span className="font-mono text-[11px] text-text-disabled">—</span>
        ) : (
          <RawNumberInput value={z.forjado.canto} onChange={(canto) => onZona({ forjado: { ...z.forjado, canto } })} ariaLabel={`Canto del forjado de ${quien}`} min={0} max={200} widthClass="w-10" hideUnit />
        )}
      </td>
      <td className={TD_NUM} onClick={(ev) => ev.stopPropagation()}>
        <span className="flex flex-col items-end gap-0.5">
          <RawNumberInput
            value={z.forjado.ppManual ?? r?.forjado.pp ?? 0}
            onChange={(pp) => onZona({ forjado: { ...z.forjado, ppManual: pp } })}
            ariaLabel={`Peso propio de ${quien}`}
            min={0}
            widthClass="w-12"
            hideUnit
          />
          {z.forjado.ppManual !== null ? (
            sinCanto ? (
              <span className="font-mono text-[8.5px] text-text-disabled">tecleado</span>
            ) : (
              <button type="button" onClick={() => onZona({ forjado: { ...z.forjado, ppManual: null } })} className="font-mono text-[8.5px] text-text-disabled underline decoration-dotted hover:text-text-secondary">
                usar el de la norma
              </button>
            )
          ) : (
            <span className="font-mono text-[8.5px] text-accent" title="Peso propio del forjado">
              {r?.forjado.ppOrigen === 'densidad' ? '25 · canto' : r?.forjado.ppOrigen === 'tablaC5' ? 'tabla C.5' : 'tecléelo'}
            </span>
          )}
        </span>
      </td>

      {/* ¿Qué hay encima? — una columna por carga de la obra */}
      {columnas.map((c) => (
        <td key={c.clave} className={TD_NUM} onClick={(ev) => ev.stopPropagation()}>
          {celdaEncima(c)}
        </td>
      ))}

      {/* Uso */}
      <td className={TD} onClick={(ev) => ev.stopPropagation()}>
        <div className="flex items-center gap-1">
          <select value={z.uso.categoria} aria-label={`Uso de ${quien}`} className={INPUT} onChange={(ev) => onZona({ uso: { ...z.uso, categoria: ev.target.value as ZonaUI['uso']['categoria'] } })}>
            {USO_OPCIONES.map((o) => (
              <option key={o.id} value={o.id}>
                {o.etiqueta}
              </option>
            ))}
          </select>
          <span className="shrink-0 font-mono text-[9.5px] text-text-disabled" title={uso?.ayuda}>
            {z.uso.categoria === 'otro' ? '—' : z.uso.categoria}
          </span>
        </div>
      </td>
      <td className={TD_NUM}>
        <Derivado valor={r ? mostrar(r.uso.qUso) : '—'} titulo={r ? r.uso.etiqueta : 'Sobrecarga de uso'} />
      </td>

      {/* Nieve — de la planta */}
      {primera && (
        <td rowSpan={nZonas} className={TD_NUM} style={plantaTocada && !seleccionada ? SELECCION : undefined}>
          {!planta.esCubierta ? (
            <span className="font-mono text-[11px] text-text-disabled">—</span>
          ) : planta.nieve.modo === 'ninguna' ? (
            <span className="text-[10px] text-text-disabled underline decoration-dotted" title={nievePubHay ? 'Abra la ficha de la fila para tomar la nieve publicada' : 'Viento y nieve todavía no ha publicado'}>
              sin nieve
            </span>
          ) : (
            <Derivado
              valor={dec(planta.nieve.valor, 2)}
              titulo="Carga de nieve de la cubierta"
              sub={planta.nieve.modo === 'publicada' ? 'publicada' : 'propia'}
            />
          )}
        </td>
      )}

      {/* Cálculo */}
      <td className={TD_NUM}>
        <Derivado valor={r && !huecoPP ? mostrar(r.G) : '—'} titulo="Carga permanente total" fallo={huecoPP} />
      </td>
      <td className={TD_NUM}>
        <Derivado valor={r ? mostrar(r.Q) : '—'} titulo={r ? `1,50 · Q, hipótesis ${HIPOTESIS_TEXTO[r.hipotesis]}` : 'Variable que manda'} />
      </td>
      <td className={TD_NUM} style={seleccionada ? COLUMNA_QD_SEL : COLUMNA_QD}>
        <Derivado valor={r && !huecoPP ? mostrar(r.qd) : '—'} titulo="Gd + Qd" fuerte fallo={huecoPP} />
      </td>
    </tr>
  );
}
