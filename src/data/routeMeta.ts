// SEO metadata per route — drives <Helmet> tags in each module.
// title: shown in browser tab and Google search result title.
// description: shown in Google snippet and og:description.
// Keep descriptions under 160 chars.

export interface RouteMeta {
  title: string;
  description: string;
}

export const BASE_URL = 'https://concreta.app';

export const routeMeta: Record<string, RouteMeta> = {
  '/': {
    title: 'Concreta — Cálculo estructural online',
    description: 'Hormigón, acero, cimentaciones y madera según normativa española. Código Estructural y CTE. Sin instalación, directo al navegador.',
  },
  '/horm/vigas': {
    title: 'Vigas de hormigón armado — Concreta',
    description: 'Cálculo de vigas HA: flexión, cortante y fisuración según el Código Estructural art. 22–26. Resultados instantáneos.',
  },
  '/horm/pilares': {
    title: 'Pilares de hormigón armado — Concreta',
    description: 'Compresión y pandeo biaxial en pilares de HA. Código Estructural art. 35.',
  },
  '/horm/punzonamiento': {
    title: 'Punzonamiento en losa — Concreta',
    description: 'Comprobación de punzonamiento en losa maciza, perímetros críticos. Código Estructural art. 6.4.',
  },
  '/acero/vigas': {
    title: 'Vigas de acero — Concreta',
    description: 'Flexión, pandeo lateral-torsional y deflexión en vigas de acero laminado. EC3 §6.2–6.3.',
  },
  '/acero/pilares': {
    title: 'Pilares de acero — Concreta',
    description: 'Pandeo y empresillado en pilares de acero. EC3 §6.4.',
  },
  '/acero/seccion-compuesta': {
    title: 'Sección compuesta — Concreta',
    description: 'Steiner, clase de sección y módulo plástico Wpl por bandas. EC3.',
  },
  '/ciment/zapatas': {
    title: 'Zapatas aisladas — Concreta',
    description: 'Cálculo de zapata aislada: presiones, armadura y comprobaciones. CTE DB-SE-C art. 4.3.',
  },
  '/ciment/muros': {
    title: 'Muros de contención — Concreta',
    description: 'Muro de hormigón armado con nivel freático. Código Estructural art. 9.',
  },
  '/ciment/encepados': {
    title: 'Encepados de micropilotes — Concreta',
    description: 'Encepado por bielas y tirantes. Código Estructural art. 48.',
  },
  '/madera/vigas': {
    title: 'Vigas de madera — Concreta',
    description: 'Flexión, cortante y resistencia al fuego R30–R120 en vigas de madera. EC5 EN 1995-1-1 §6.1.',
  },
  '/madera/pilares': {
    title: 'Pilares de madera — Concreta',
    description: 'Pandeo biaxial y resistencia al fuego en pilares de madera. EC5 EN 1995-1-1 §6.3.',
  },
  '/rehab/empresillado': {
    title: 'Pilar empresillado — Concreta',
    description: 'Pilar compuesto batido (empresillado). EC3 §6.4.2.',
  },
};
