// modules.tsx — module library for the landing's "Módulos" section.
// Icons come from the shared ModuleIcon component — the same SVGs the app
// sidebar uses, so the landing and the app never drift apart.
//
// Order is the sidebar's: groups in the order they first appear in
// moduleRegistry (components/layout/destinos.ts, GRUPOS) and modules in
// registry order within each group. The landing test pins it.
//
// `ref` is what the module's own engine cites, checked on 2026-09-25 against
// the `article` strings in lib/calculations — not what the norm map says the
// module should cite.

import type { ReactNode } from 'react';
import { ModuleIcon } from '../../components/ui/ModuleIcon';

export interface ModuleEntry {
  id: string;
  group: string;
  name: string;
  ref: string;
  short: string;
  route: string;
  icon: ReactNode;
  /** Release date of the module (ISO, the version it first shipped in). While
   *  it is recent the card says NUEVO — see `esNuevo`. */
  alta?: string;
}

/** How long a module is announced as new. */
export const DIAS_NUEVO = 60;

/** Whether the card says NUEVO on `hoy`. The badge expires on its own, so the
 *  landing never has to be edited to retire it — a hand-written «nuevo» is the
 *  kind of literal that is a lie within a fortnight. */
export function esNuevo(alta: string | undefined, hoy: Date): boolean {
  if (!alta) return false;
  const dias = (hoy.getTime() - new Date(`${alta}T00:00:00`).getTime()) / 86_400_000;
  return dias >= 0 && dias < DIAS_NUEVO;
}

const ICON_SIZE = 24;

export const MODULE_LIBRARY: ModuleEntry[] = [
  // ── MEMORIAS
  {
    id: 'materiales',
    group: 'MEMORIAS',
    name: 'Cuadro de materiales',
    ref: 'CE art. 27 · 43 · 44 · DB SE-M',
    short:
      'Clase de exposición, recubrimiento, cemento y a/c derivados de la situación de obra, y la resistencia al fuego que exige Incendio. Cuadro de memoria en Word, de plano en Excel y DXF, y longitudes de anclaje.',
    route: '/memorias/materiales',
    icon: <ModuleIcon moduleKey="concreta-materiales" size={ICON_SIZE} />,
    alta: '2026-09-03',
  },
  {
    id: 'memoria-dbse',
    group: 'MEMORIAS',
    name: 'Cumplimiento del DB SE',
    ref: 'CTE DB SE · SE-AE · SE-C · NCSE-02 · CE',
    short:
      'La ficha 3.1 de la memoria, ensamblada desde materiales, viento y nieve, cargas y sismo, con lo que falta preguntado en lenguaje de obra. Lee el PDF del geotécnico para el 3.1.3, y lo que viene de otra obra sale en ámbar hasta que lo revisas. Word y PDF.',
    route: '/memorias/db-se',
    icon: <ModuleIcon moduleKey="concreta-memoria-dbse" size={ICON_SIZE} />,
    alta: '2026-09-10',
  },

  // ── ACCIONES
  {
    id: 'cargas-planta',
    group: 'ACCIONES',
    name: 'Cargas por planta',
    ref: 'DB SE-AE art. 2.1 · 3.1 · Anejo C',
    short:
      'Aquí se declara el edificio: cubiertas, plantas y sótanos con su altura. Peso propio, permanentes, sobrecarga de uso y la nieve de lo que está a la intemperie. Tabla para la memoria, cuadro para el plano y predimensionado con Gd, Qd y qd.',
    route: '/acciones/cargas-planta',
    icon: <ModuleIcon moduleKey="concreta-cargas-planta" size={ICON_SIZE} />,
    alta: '2026-09-05',
  },
  {
    id: 'viento-nieve',
    group: 'ACCIONES',
    name: 'Viento y nieve',
    ref: 'DB SE-AE art. 3.3 · 3.5 · Anejos D y E',
    short:
      'Fuerza de viento por planta y presiones en cubiertas a dos aguas y fachadas, con las plantas del edificio de la obra; nieve por faldón a partir del municipio y la altitud. Memoria en Word y PDF, cuadro del plano en Excel y DXF.',
    route: '/acciones/viento-nieve',
    icon: <ModuleIcon moduleKey="concreta-viento-nieve" size={ICON_SIZE} />,
    alta: '2026-09-05',
  },
  {
    id: 'seismic-ncse02',
    group: 'ACCIONES',
    name: 'Acción sísmica',
    ref: 'NCSE-02 art. 3.5 a 3.7',
    short:
      'Peligrosidad del Anejo 1 del IGN por municipio, espectro, modos, cortantes por planta y reparto con torsión. Si el edificio lo calcula un programa, declara igualmente la acción para la memoria.',
    route: '/analisis/sismo',
    icon: <ModuleIcon moduleKey="concreta-seismic" size={ICON_SIZE} />,
    alta: '2026-08-27',
  },
  {
    id: 'incendio',
    group: 'ACCIONES',
    name: 'Incendio',
    ref: 'CTE DB SI 6 · Anejos B, C y D',
    short:
      'Resistencia al fuego exigida a la estructura por uso y altura de evacuación, con el tiempo equivalente de exposición del Anejo B como alternativa, la comprobación de lo que aguanta cada sección de hormigón y acero, y la protección que hace falta donde no llegue.',
    route: '/acciones/incendio',
    icon: <ModuleIcon moduleKey="concreta-incendio" size={ICON_SIZE} />,
    alta: '2026-09-24',
  },

  // ── HORMIGÓN ARMADO
  {
    id: 'rc-beams',
    group: 'HORMIGÓN ARMADO',
    name: 'Vigas',
    ref: 'CE Anejo 19 §6–§9',
    short: 'Flexión, cortante, fisuración y flecha. Cuantías, anclaje y solape. El cuadro de vigas del estudio en DXF.',
    route: '/horm/vigas',
    icon: <ModuleIcon moduleKey="concreta-rc-beams" size={ICON_SIZE} />,
  },
  {
    id: 'rc-columns',
    group: 'HORMIGÓN ARMADO',
    name: 'Pilares',
    ref: 'CE Anejo 19 §5.8 · §6.1',
    short: 'Flexocompresión, pandeo, cuantías geométricas.',
    route: '/horm/pilares',
    icon: <ModuleIcon moduleKey="concreta-rc-columns" size={ICON_SIZE} />,
  },
  {
    id: 'rc-punching',
    group: 'HORMIGÓN ARMADO',
    name: 'Punzonamiento',
    ref: 'CE Anejo 19 §6.4',
    short: 'Perímetro crítico u1 a 2d, cercos, capitel implícito y crucetas de UPN.',
    route: '/horm/punzonamiento',
    icon: <ModuleIcon moduleKey="concreta-punching" size={ICON_SIZE} />,
  },
  {
    id: 'rc-slabs',
    group: 'HORMIGÓN ARMADO',
    name: 'Forjados',
    ref: 'CE Anejo 19 §6.1 · §6.2',
    short: 'Forjado reticular y losa maciza: flexión, cortante y flecha por tipologías predefinidas.',
    route: '/horm/forjados',
    icon: <ModuleIcon moduleKey="concreta-forjados" size={ICON_SIZE} />,
  },

  // ── ACERO
  {
    id: 'steel-beams',
    group: 'ACERO',
    name: 'Vigas',
    ref: 'DB-SE-A §6.2',
    short: 'IPE, HEA y HEB hasta el 1000, IPN, UPN, 2UPN y tubos. Flexión, cortante, M-V, LTB, flecha y clasificación.',
    route: '/acero/vigas',
    icon: <ModuleIcon moduleKey="concreta-steel-beams" size={ICON_SIZE} />,
  },
  {
    id: 'steel-columns',
    group: 'ACERO',
    name: 'Pilares',
    ref: 'CE Anejo 22 §6.3',
    short: 'Pandeo biaxial, χ, esbeltez, capacidad N+M.',
    route: '/acero/pilares',
    icon: <ModuleIcon moduleKey="concreta-steel-columns" size={ICON_SIZE} />,
  },
  {
    id: 'steel-composite',
    group: 'ACERO',
    name: 'Sección compuesta',
    ref: 'CE Anejo 22 §5.5 · §6',
    short: 'Perfiles armados de chapa y angulares soldados.',
    route: '/acero/seccion-compuesta',
    icon: <ModuleIcon moduleKey="concreta-composite-section" size={ICON_SIZE} />,
  },
  {
    id: 'steel-baseplate',
    group: 'ACERO',
    name: 'Placas de anclaje',
    ref: 'CE Anejo 26 · EN 1992-4',
    short: 'Placa, barras corrugadas y hormigón soporte, con las cartelas en «#» y el pilar 2UPN en cajón.',
    route: '/acero/placas-de-anclaje',
    icon: <ModuleIcon moduleKey="concreta-anchor-plate" size={ICON_SIZE} />,
  },

  // ── CIMENTACIÓN
  {
    id: 'footings',
    group: 'CIMENTACIÓN',
    name: 'Zapatas aisladas',
    ref: 'DB-SE-C §4.4 · CE Anejo 19',
    short: 'Tensiones, excentricidad, vuelco, deslizamiento y armado, en tres vistas: terreno, armado y modelo.',
    route: '/ciment/zapatas',
    icon: <ModuleIcon moduleKey="concreta-footings" size={ICON_SIZE} />,
  },
  {
    id: 'walls',
    group: 'CIMENTACIÓN',
    name: 'Muros de contención',
    ref: 'DB-SE-C §6 · CE Anejo 19',
    short: 'Empuje activo con agua y sismo, vuelco, deslizamiento, hundimiento y armado. El plano tipo del estudio en DXF.',
    route: '/ciment/muros',
    icon: <ModuleIcon moduleKey="concreta-retaining-wall" size={ICON_SIZE} />,
  },
  {
    id: 'pile-caps',
    group: 'CIMENTACIÓN',
    name: 'Encepados',
    ref: 'EHE-08 58.4 · CE Anejo 19',
    short:
      'Encepados de 2, 3, 4 y 6 micropilotes por bielas y tirantes, con el armado secundario dispuesto. El detalle tipo del estudio en DXF.',
    route: '/ciment/encepados',
    icon: <ModuleIcon moduleKey="concreta-pile-cap" size={ICON_SIZE} />,
  },
  {
    id: 'micropiles',
    group: 'CIMENTACIÓN',
    name: 'Micropilotes',
    ref: 'Guía Fomento 2005 · CE Anejo 22',
    short: 'Hundimiento por fuste, tope estructural, asientos y conexión con el encepado. El detalle tipo del estudio en DXF.',
    route: '/ciment/micropilotes',
    icon: <ModuleIcon moduleKey="concreta-micropiles" size={ICON_SIZE} />,
  },

  // ── REHABILITACIÓN
  {
    id: 'steel-batten',
    group: 'REHABILITACIÓN',
    name: 'Empresillado',
    ref: 'CE Anejo 22 §6.4',
    short: 'Pilares empresillados: cordones, presillas, axil N_chord.',
    route: '/rehab/empresillado',
    icon: <ModuleIcon moduleKey="concreta-empresillado" size={ICON_SIZE} />,
  },
  {
    id: 'masonry-walls',
    group: 'REHABILITACIÓN',
    name: 'Muros de fábrica',
    ref: 'CTE DB-SE-F',
    short: 'Comprobación de muros de fábrica: compresión, esbeltez, excentricidad.',
    route: '/rehab/muros-fabrica',
    icon: <ModuleIcon moduleKey="concreta-masonry-walls" size={ICON_SIZE} />,
  },

  // ── MADERA
  {
    id: 'timber-beams',
    group: 'MADERA',
    name: 'Vigas',
    ref: 'EN 1995-1-1',
    short: 'Clases europeas C/GL, kmod, kcrit, flecha inst + final.',
    route: '/madera/vigas',
    icon: <ModuleIcon moduleKey="concreta-timber-beams" size={ICON_SIZE} />,
  },
  {
    id: 'timber-columns',
    group: 'MADERA',
    name: 'Pilares',
    ref: 'EN 1995-1-1 · 1-2',
    short: 'Pandeo biaxial, clases C/GL y resistencia al fuego R30–R120.',
    route: '/madera/pilares',
    icon: <ModuleIcon moduleKey="concreta-timber-columns" size={ICON_SIZE} />,
  },

  // ── ANÁLISIS
  {
    id: 'fem',
    group: 'ANÁLISIS',
    name: 'FEM 1D',
    ref: 'CTE comb.',
    short: 'Vigas continuas, envolventes ELU/ELS, embeds reales.',
    route: '/analisis/fem',
    icon: <ModuleIcon moduleKey="concreta-fem-2d" size={ICON_SIZE} />,
  },
  {
    id: 'fem2d',
    group: 'ANÁLISIS',
    name: 'FEM 2D',
    ref: 'CTE comb.',
    short: 'Pórticos y cerchas paramétricos: N/V/M, pandeo, αcr de 2º orden.',
    route: '/analisis/fem2d',
    icon: <ModuleIcon moduleKey="concreta-fem2d" size={ICON_SIZE} />,
  },

  // ── GEOTECNIA
  {
    id: 'slope-stability',
    group: 'GEOTECNIA',
    name: 'Taludes',
    ref: 'CTE DB-SE-C art. 7.2.2.1',
    short: 'Estabilidad de taludes por Bishop simplificado o Fellenius · factor de seguridad.',
    route: '/geotec/taludes',
    icon: <ModuleIcon moduleKey="concreta-slope-stability" size={ICON_SIZE} />,
  },
  {
    id: 'rockfill-wall',
    group: 'GEOTECNIA',
    name: 'Muros de escollera y gaviones',
    ref: 'Guía Fomento 2006',
    short: 'Muro de gravedad: deslizamiento entre hiladas, vuelco, hundimiento y sismo.',
    route: '/geotec/escollera',
    icon: <ModuleIcon moduleKey="concreta-rockfill-wall" size={ICON_SIZE} />,
    alta: '2026-08-30',
  },
];
