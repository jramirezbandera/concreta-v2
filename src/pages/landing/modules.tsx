// modules.tsx — module library for the landing's "Módulos" section.
// Icons come from the shared ModuleIcon component — the same SVGs the app
// sidebar uses, so the landing and the app never drift apart.

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
}

const ICON_SIZE = 24;

export const MODULE_LIBRARY: ModuleEntry[] = [
  // ── HORMIGÓN ARMADO
  {
    id: 'rc-beams',
    group: 'HORMIGÓN ARMADO',
    name: 'Vigas',
    ref: 'CE art.42–49',
    short: 'Flexión, cortante, fisuración. Cuantías y anclaje.',
    route: '/horm/vigas',
    icon: <ModuleIcon moduleKey="concreta-rc-beams" size={ICON_SIZE} />,
  },
  {
    id: 'rc-columns',
    group: 'HORMIGÓN ARMADO',
    name: 'Pilares',
    ref: 'CE art.43',
    short: 'Flexocompresión, pandeo, cuantías geométricas.',
    route: '/horm/pilares',
    icon: <ModuleIcon moduleKey="concreta-rc-columns" size={ICON_SIZE} />,
  },
  {
    id: 'rc-punching',
    group: 'HORMIGÓN ARMADO',
    name: 'Punzonamiento',
    ref: 'CE art.45',
    short: 'Perímetro crítico u1 a 2d, cercos, capitel implícito.',
    route: '/horm/punzonamiento',
    icon: <ModuleIcon moduleKey="concreta-punching" size={ICON_SIZE} />,
  },
  {
    id: 'rc-slabs',
    group: 'HORMIGÓN ARMADO',
    name: 'Forjados',
    ref: 'CE art.42 · 44',
    short: 'Comprobaciones por tipologías predefinidas.',
    route: '/horm/forjados',
    icon: <ModuleIcon moduleKey="concreta-forjados" size={ICON_SIZE} />,
  },

  // ── ACERO
  {
    id: 'steel-beams',
    group: 'ACERO',
    name: 'Vigas',
    ref: 'DB-SE-A §6.2',
    short: 'Flexión, cortante, M-V, LTB, flecha, clasificación.',
    route: '/acero/vigas',
    icon: <ModuleIcon moduleKey="concreta-steel-beams" size={ICON_SIZE} />,
  },
  {
    id: 'steel-columns',
    group: 'ACERO',
    name: 'Pilares',
    ref: 'DB-SE-A §6.3',
    short: 'Pandeo biaxial, χ, esbeltez, capacidad N+M.',
    route: '/acero/pilares',
    icon: <ModuleIcon moduleKey="concreta-steel-columns" size={ICON_SIZE} />,
  },
  {
    id: 'steel-composite',
    group: 'ACERO',
    name: 'Sección compuesta',
    ref: 'DB-SE-A §6',
    short: 'Perfiles armados de chapa y angulares soldados.',
    route: '/acero/seccion-compuesta',
    icon: <ModuleIcon moduleKey="concreta-composite-section" size={ICON_SIZE} />,
  },
  {
    id: 'steel-baseplate',
    group: 'ACERO',
    name: 'Placas de anclaje',
    ref: 'DB-SE-A §8.7',
    short: 'Placa, pernos y hormigón soporte.',
    route: '/acero/placas-de-anclaje',
    icon: <ModuleIcon moduleKey="concreta-anchor-plate" size={ICON_SIZE} />,
  },

  // ── CIMENTACIÓN
  {
    id: 'footings',
    group: 'CIMENTACIÓN',
    name: 'Zapatas aisladas',
    ref: 'DB-SE-C §4.3',
    short: 'Tensiones, excentricidad, vuelco, deslizamiento, armado.',
    route: '/ciment/zapatas',
    icon: <ModuleIcon moduleKey="concreta-footings" size={ICON_SIZE} />,
  },
  {
    id: 'pile-caps',
    group: 'CIMENTACIÓN',
    name: 'Encepados',
    ref: 'DB-SE-C §5',
    short: 'Modelo de bielas y tirantes para pilotes.',
    route: '/ciment/encepados',
    icon: <ModuleIcon moduleKey="concreta-pile-cap" size={ICON_SIZE} />,
  },
  {
    id: 'walls',
    group: 'CIMENTACIÓN',
    name: 'Muros de contención',
    ref: 'DB-SE-C §6',
    short: 'Empuje activo, vuelco, deslizamiento, armado del fuste.',
    route: '/ciment/muros',
    icon: <ModuleIcon moduleKey="concreta-retaining-wall" size={ICON_SIZE} />,
  },

  // ── MADERA
  {
    id: 'timber-beams',
    group: 'MADERA',
    name: 'Vigas',
    ref: 'EC5 (auxiliar)',
    short: 'Clases europeas C/GL, kmod, kcrit, flecha inst + final.',
    route: '/madera/vigas',
    icon: <ModuleIcon moduleKey="concreta-timber-beams" size={ICON_SIZE} />,
  },
  {
    id: 'timber-columns',
    group: 'MADERA',
    name: 'Pilares',
    ref: 'EC5 (auxiliar)',
    short: 'Pandeo biaxial, clases C/GL y resistencia al fuego R30–R120.',
    route: '/madera/pilares',
    icon: <ModuleIcon moduleKey="concreta-timber-columns" size={ICON_SIZE} />,
  },

  // ── REHABILITACIÓN
  {
    id: 'steel-batten',
    group: 'REHABILITACIÓN',
    name: 'Empresillado',
    ref: 'EC3 §6.4.2',
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
];
