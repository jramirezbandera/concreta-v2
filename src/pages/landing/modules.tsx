// modules.tsx — module library for the landing's "Módulos" section.
// Each icon: 24×24 viewBox, currentColor stroke. Routes point into the real app.

import type { ReactNode } from 'react';

const ICON_PROPS = {
  viewBox: '0 0 24 24',
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'square' as const,
  strokeLinejoin: 'miter' as const,
  width: 24,
  height: 24,
};

const Icon = ({ children }: { children: ReactNode }) => <svg {...ICON_PROPS}>{children}</svg>;

export interface ModuleEntry {
  id: string;
  group: string;
  name: string;
  ref: string;
  short: string;
  route: string;
  icon: ReactNode;
}

export const MODULE_LIBRARY: ModuleEntry[] = [
  // ── HORMIGÓN ARMADO
  {
    id: 'rc-beams',
    group: 'HORMIGÓN ARMADO',
    name: 'Vigas',
    ref: 'CE art.42–49',
    short: 'Flexión, cortante, fisuración. Cuantías y anclaje.',
    route: '/horm/vigas',
    icon: (
      <Icon>
        <rect x="3" y="6" width="18" height="12" />
        <circle cx="6.5" cy="9.5" r="0.8" fill="currentColor" />
        <circle cx="17.5" cy="9.5" r="0.8" fill="currentColor" />
        <circle cx="6.5" cy="15" r="1.1" fill="currentColor" />
        <circle cx="10.8" cy="15" r="1.1" fill="currentColor" />
        <circle cx="15.2" cy="15" r="1.1" fill="currentColor" />
        <circle cx="17.5" cy="15" r="1.1" fill="currentColor" />
      </Icon>
    ),
  },
  {
    id: 'rc-columns',
    group: 'HORMIGÓN ARMADO',
    name: 'Pilares',
    ref: 'CE art.43',
    short: 'Flexocompresión, pandeo, cuantías geométricas.',
    route: '/horm/pilares',
    icon: (
      <Icon>
        <rect x="5" y="3" width="14" height="18" />
        <circle cx="7.5" cy="5.5" r="1" fill="currentColor" />
        <circle cx="16.5" cy="5.5" r="1" fill="currentColor" />
        <circle cx="7.5" cy="18.5" r="1" fill="currentColor" />
        <circle cx="16.5" cy="18.5" r="1" fill="currentColor" />
        <circle cx="12" cy="5.5" r="0.7" fill="currentColor" />
        <circle cx="12" cy="18.5" r="0.7" fill="currentColor" />
      </Icon>
    ),
  },
  {
    id: 'rc-punching',
    group: 'HORMIGÓN ARMADO',
    name: 'Punzonamiento',
    ref: 'CE art.45',
    short: 'Perímetro crítico u1 a 2d, cercos, capitel implícito.',
    route: '/horm/punzonamiento',
    icon: (
      <Icon>
        <rect x="9.5" y="9.5" width="5" height="5" />
        <rect x="3.5" y="3.5" width="17" height="17" rx="5" strokeDasharray="2 1.5" />
      </Icon>
    ),
  },
  {
    id: 'rc-slabs',
    group: 'HORMIGÓN ARMADO',
    name: 'Forjados',
    ref: 'CE art.42 · 44',
    short: 'Comprobaciones por tipologías predefinidas.',
    route: '/horm/forjados',
    icon: (
      <Icon>
        <line x1="3" y1="7" x2="21" y2="7" />
        <line x1="3" y1="11" x2="21" y2="11" />
        <line x1="3" y1="15" x2="21" y2="15" />
        <line x1="3" y1="19" x2="21" y2="19" strokeDasharray="2 1.5" />
      </Icon>
    ),
  },

  // ── ACERO
  {
    id: 'steel-beams',
    group: 'ACERO',
    name: 'Vigas',
    ref: 'DB-SE-A §6.2',
    short: 'Flexión, cortante, M-V, LTB, flecha, clasificación.',
    route: '/acero/vigas',
    icon: (
      <Icon>
        <line x1="4" y1="5" x2="20" y2="5" />
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="4" y1="19" x2="20" y2="19" />
      </Icon>
    ),
  },
  {
    id: 'steel-columns',
    group: 'ACERO',
    name: 'Pilares',
    ref: 'DB-SE-A §6.3',
    short: 'Pandeo biaxial, χ, esbeltez, capacidad N+M.',
    route: '/acero/pilares',
    icon: (
      <Icon>
        <line x1="5" y1="4" x2="5" y2="20" />
        <line x1="19" y1="4" x2="19" y2="20" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </Icon>
    ),
  },
  {
    id: 'steel-composite',
    group: 'ACERO',
    name: 'Sección compuesta',
    ref: 'DB-SE-A §6',
    short: 'Perfiles armados de chapa y angulares soldados.',
    route: '/acero/seccion-compuesta',
    icon: (
      <Icon>
        <rect x="3" y="5" width="18" height="3" />
        <line x1="12" y1="8" x2="12" y2="16" />
        <rect x="3" y="16" width="18" height="3" />
        <line x1="5" y1="11" x2="9" y2="11" strokeDasharray="1 1" />
        <line x1="15" y1="11" x2="19" y2="11" strokeDasharray="1 1" />
      </Icon>
    ),
  },
  {
    id: 'steel-baseplate',
    group: 'ACERO',
    name: 'Placas de anclaje',
    ref: 'DB-SE-A §8.7',
    short: 'Placa, pernos y hormigón soporte.',
    route: '/acero/placas-de-anclaje',
    icon: (
      <Icon>
        <rect x="3" y="9" width="18" height="6" />
        <circle cx="6.5" cy="12" r="1" fill="currentColor" />
        <circle cx="12" cy="12" r="1" fill="currentColor" />
        <circle cx="17.5" cy="12" r="1" fill="currentColor" />
        <line x1="9" y1="3" x2="9" y2="9" />
        <line x1="15" y1="3" x2="15" y2="9" />
      </Icon>
    ),
  },

  // ── CIMENTACIÓN
  {
    id: 'footings',
    group: 'CIMENTACIÓN',
    name: 'Zapatas aisladas',
    ref: 'DB-SE-C §4.3',
    short: 'Tensiones, excentricidad, vuelco, deslizamiento, armado.',
    route: '/ciment/zapatas',
    icon: (
      <Icon>
        <rect x="3" y="3" width="18" height="18" />
        <rect x="9" y="9" width="6" height="6" />
      </Icon>
    ),
  },
  {
    id: 'pile-caps',
    group: 'CIMENTACIÓN',
    name: 'Encepados',
    ref: 'DB-SE-C §5',
    short: 'Modelo de bielas y tirantes para pilotes.',
    route: '/ciment/encepados',
    icon: (
      <Icon>
        <rect x="3" y="3" width="18" height="10" />
        <circle cx="7.5" cy="18" r="2.2" fill="currentColor" fillOpacity="0.3" />
        <circle cx="16.5" cy="18" r="2.2" fill="currentColor" fillOpacity="0.3" />
        <line x1="9" y1="8" x2="7.5" y2="16" strokeDasharray="2 1.5" />
        <line x1="15" y1="8" x2="16.5" y2="16" strokeDasharray="2 1.5" />
      </Icon>
    ),
  },
  {
    id: 'walls',
    group: 'CIMENTACIÓN',
    name: 'Muros de contención',
    ref: 'DB-SE-C §6',
    short: 'Empuje activo, vuelco, deslizamiento, armado del fuste.',
    route: '/ciment/muros',
    icon: (
      <Icon>
        <polyline points="5,3 9,3 9,18 19,18 19,21 5,21 5,3" />
        <line x1="13" y1="6" x2="17" y2="6" strokeDasharray="1.5 1.5" />
        <line x1="13" y1="10" x2="17" y2="10" strokeDasharray="1.5 1.5" />
        <line x1="13" y1="14" x2="17" y2="14" strokeDasharray="1.5 1.5" />
      </Icon>
    ),
  },

  // ── MADERA
  {
    id: 'timber-beams',
    group: 'MADERA',
    name: 'Vigas',
    ref: 'EC5 (auxiliar)',
    short: 'Clases europeas C/GL, kmod, kcrit, flecha inst + final.',
    route: '/madera/vigas',
    icon: (
      <Icon>
        <rect x="3" y="6" width="18" height="12" />
        <path d="M3 9 Q 12 7.5 21 9" />
        <path d="M3 12 Q 12 13.5 21 12" />
        <path d="M3 15 Q 12 13.5 21 15" />
      </Icon>
    ),
  },
  {
    id: 'timber-columns',
    group: 'MADERA',
    name: 'Pilares',
    ref: 'EC5 (auxiliar)',
    short: 'Pandeo biaxial, clases C/GL y resistencia al fuego R30–R120.',
    route: '/madera/pilares',
    icon: (
      <Icon>
        <rect x="6" y="3" width="12" height="18" />
        <path d="M9 3 Q 7.5 12 9 21" />
        <path d="M12 3 Q 13.5 12 12 21" />
        <path d="M15 3 Q 13.5 12 15 21" />
      </Icon>
    ),
  },

  // ── REHABILITACIÓN
  {
    id: 'steel-batten',
    group: 'REHABILITACIÓN',
    name: 'Empresillado',
    ref: 'EC3 §6.4.2',
    short: 'Pilares empresillados: cordones, presillas, axil N_chord.',
    route: '/rehab/empresillado',
    icon: (
      <Icon>
        <line x1="6" y1="3" x2="6" y2="21" />
        <line x1="18" y1="3" x2="18" y2="21" />
        <line x1="6" y1="7" x2="18" y2="7" />
        <line x1="6" y1="12" x2="18" y2="12" />
        <line x1="6" y1="17" x2="18" y2="17" />
      </Icon>
    ),
  },
  {
    id: 'masonry-walls',
    group: 'REHABILITACIÓN',
    name: 'Muros de fábrica',
    ref: 'CTE DB-SE-F',
    short: 'Comprobación de muros de fábrica: compresión, esbeltez, excentricidad.',
    route: '/rehab/muros-fabrica',
    icon: (
      <Icon>
        <rect x="3" y="4" width="18" height="16" />
        <line x1="3" y1="9.33" x2="21" y2="9.33" />
        <line x1="3" y1="14.66" x2="21" y2="14.66" />
        <line x1="12" y1="4" x2="12" y2="9.33" />
        <line x1="7.5" y1="9.33" x2="7.5" y2="14.66" />
        <line x1="16.5" y1="9.33" x2="16.5" y2="14.66" />
        <line x1="12" y1="14.66" x2="12" y2="20" />
      </Icon>
    ),
  },

  // ── ANÁLISIS
  {
    id: 'fem',
    group: 'ANÁLISIS',
    name: 'FEM 2D',
    ref: 'CTE comb.',
    short: 'Vigas continuas, envolventes ELU/ELS, embeds reales.',
    route: '/analisis/fem',
    icon: (
      <Icon>
        <line x1="3" y1="11" x2="21" y2="11" />
        <polygon points="5,11 3.5,14 6.5,14" fill="currentColor" />
        <polygon points="12,11 10.5,14 13.5,14" fill="currentColor" />
        <polygon points="19,11 17.5,14 20.5,14" fill="currentColor" />
        <line x1="5" y1="6" x2="5" y2="10" />
        <line x1="8" y1="6" x2="8" y2="10" />
        <line x1="11" y1="6" x2="11" y2="10" />
        <line x1="14" y1="6" x2="14" y2="10" />
        <line x1="17" y1="6" x2="17" y2="10" />
        <line x1="19" y1="6" x2="19" y2="10" />
      </Icon>
    ),
  },
];
