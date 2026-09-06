/**
 * Columna de datos: las cinco secciones colapsables, en el orden en que se
 * contestan. Cada una resume en una línea lo que tiene cuando está cerrada,
 * para que el usuario que trabaja en la cubierta siga viendo dónde está la
 * obra sin abrir el emplazamiento.
 *
 * El lienzo SIGUE a la sección que se está tocando: tocar un faldón enseña la
 * vista Nieve, tocar la pendiente enseña la Cubierta. Sin eso, teclear en una
 * sección no se veía en ninguna parte —que era justo lo que este módulo tenía
 * que arreglar—. El emplazamiento no cambia de vista: afecta a las cuatro.
 */

import type { ReactNode } from 'react';
import { CollapsibleSection } from '../../components/ui/CollapsibleSection';
import type { Obra } from '../../lib/obra';
import type { VistaLienzo } from './catalogos';
import { Cubierta } from './Cubierta';
import { Emplazamiento } from './Emplazamiento';
import { Nieve } from './Nieve';
import { Paramentos } from './Paramentos';
import {
  alturaCoronacionEfectiva,
  cotasPlantas,
  type Emplazamiento as EmplazamientoUI,
  type Evaluacion,
  type FaldonUI,
  type PlantaUI,
  type VientoNieveState,
  type VientoUI,
  type CubiertaUI,
  type ParamentosUI,
  type NieveUI,
} from './state';
import { Viento } from './Viento';

const dec = (v: number, n: number) => v.toFixed(n).replace('.', ',');

export interface AccionesDatos {
  onEmplazamiento: (cambio: Partial<EmplazamientoUI>) => void;
  onUsarObra: () => void;
  onGuardarObra: () => void;
  onViento: (cambio: Partial<VientoUI>) => void;
  onPlanta: (id: string, cambio: Partial<PlantaUI>) => void;
  onAnadirPlanta: () => void;
  onBorrarPlanta: (id: string) => void;
  onCubierta: (cambio: Partial<CubiertaUI>) => void;
  onParamentos: (cambio: Partial<ParamentosUI>) => void;
  onNieve: (cambio: Partial<NieveUI>) => void;
  onFaldon: (id: string, cambio: Partial<FaldonUI>) => void;
  onAnadirFaldon: () => void;
  onBorrarFaldon: (id: string) => void;
}

interface Props extends AccionesDatos {
  state: VientoNieveState;
  evaluacion: Evaluacion;
  obra: Obra | null;
  plantaSel: string | null;
  faldonSel: string | null;
  onSelectPlanta: (id: string | null) => void;
  onSelectFaldon: (id: string | null) => void;
  /** Pone el lienzo en la vista de la sección que se está tocando. */
  onVista: (v: VistaLienzo) => void;
}

/**
 * Envuelve una sección para que, en cuanto se toque algo dentro —pulsar,
 * enfocar con el ratón o llegar tabulando—, el lienzo salte a su vista. Se
 * escucha en captura y antes del cambio, así el dibujo ya está delante cuando
 * el valor cambia.
 */
function SeccionVista({ vista, onVista, children }: { vista: VistaLienzo; onVista: (v: VistaLienzo) => void; children: ReactNode }) {
  const ir = () => onVista(vista);
  return (
    <div onFocusCapture={ir} onPointerDownCapture={ir}>
      {children}
    </div>
  );
}

export function Datos({ state, evaluacion, obra, plantaSel, faldonSel, onSelectPlanta, onSelectFaldon, onVista, ...a }: Props) {
  const { emplazamiento: e, viento: v, nieve: n, ayuda } = state;
  const { zonas } = evaluacion;
  const H = cotasPlantas(v.plantas).reduce((m, z) => Math.max(m, z), 0);

  const resumenEmplazamiento = zonas.provincia
    ? `${zonas.provincia.nombre} · eólica ${zonas.zonaEolica ?? '—'} · invernal ${zonas.zonaInvernal ?? '—'} · ${e.altitud === null ? 'sin altitud' : `${e.altitud} m`}`
    : 'sin provincia · sin altitud';
  const resumenViento = v.activo
    ? `${v.aspereza} · ${evaluacion.viento ? `qb ${dec(evaluacion.viento.qb, 2)} · ` : ''}${dec(v.dimensiones.x, 0)} × ${dec(v.dimensiones.y, 0)} m · ${v.plantas.length} plantas · H ${dec(H, 2)} m`
    : 'omitido';
  const resumenCubierta = v.cubierta.activa
    ? `incluida · ${dec(v.cubierta.pendiente, 0)}º · cumbrera ∥ ${v.cubierta.cumbrera.toUpperCase()} · coronación ${dec(alturaCoronacionEfectiva(v), 2)} m`
    : 'plana u omitida';
  const resumenFachadas = v.paramentos.activos ? `incluidas · ${v.paramentos.areaModo === 'zona' ? 'cerramientos grandes' : v.paramentos.areaModo === 'local' ? 'carpinterías y anclajes' : `A = ${dec(v.paramentos.areaPropia, 1)} m²`}` : 'omitidas';
  const resumenNieve = n.activo
    ? `incluida · ${evaluacion.nieve?.sk != null ? `sk ${dec(evaluacion.nieve.sk, 2)} · ` : e.altitud === null ? 'falta la altitud · ' : ''}${n.faldones.length} ${n.faldones.length === 1 ? 'faldón' : 'faldones'}`
    : 'omitida';

  return (
    <div className="flex flex-col">
      <CollapsibleSection label="Emplazamiento" refNorma="D.1 · E.2" summary={resumenEmplazamiento}>
        <Emplazamiento e={e} zonas={zonas} ayuda={ayuda} obra={obra} onCambiar={a.onEmplazamiento} onUsarObra={a.onUsarObra} onGuardarObra={a.onGuardarObra} />
      </CollapsibleSection>

      <SeccionVista vista="edificio" onVista={onVista}>
        <CollapsibleSection label="Viento" refNorma="art. 3.3" summary={resumenViento}>
          <Viento v={v} ayuda={ayuda} plantaSel={plantaSel} onSelectPlanta={onSelectPlanta} onCambiar={a.onViento} onPlanta={a.onPlanta} onAnadirPlanta={a.onAnadirPlanta} onBorrarPlanta={a.onBorrarPlanta} />
        </CollapsibleSection>
      </SeccionVista>

      {v.activo && (
        <>
          <SeccionVista vista="cubierta" onVista={onVista}>
            <CollapsibleSection label="Cubierta a dos aguas" refNorma="Anejo D.6" summary={resumenCubierta}>
              <Cubierta v={v} hDerivada={alturaCoronacionEfectiva({ ...v, cubierta: { ...v.cubierta, alturaCoronacion: null } })} ayuda={ayuda} onCambiar={a.onCubierta} />
            </CollapsibleSection>
          </SeccionVista>

          <SeccionVista vista="fachadas" onVista={onVista}>
            <CollapsibleSection label="Fachadas por zonas" refNorma="tabla D.3" summary={resumenFachadas}>
              <Paramentos v={v} resultado={evaluacion.viento?.paramentos ?? null} ayuda={ayuda} onCambiar={a.onParamentos} />
            </CollapsibleSection>
          </SeccionVista>
        </>
      )}

      <SeccionVista vista="nieve" onVista={onVista}>
        <CollapsibleSection label="Nieve" refNorma="art. 3.5 · Anejo E" summary={resumenNieve}>
          <Nieve n={n} ayuda={ayuda} faldonSel={faldonSel} onSelectFaldon={onSelectFaldon} onCambiar={a.onNieve} onFaldon={a.onFaldon} onAnadirFaldon={a.onAnadirFaldon} onBorrarFaldon={a.onBorrarFaldon} />
        </CollapsibleSection>
      </SeccionVista>
    </div>
  );
}
