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
    title: 'Concreta — Cálculo estructural para el día a día',
    description: 'Herramienta web de cálculo estructural para arquitectos e ingenieros. Normativa española (CE, CTE). PWA local, sin backend, sin cuentas.',
  },
  '/normativa': {
    title: 'Normativa — Concreta',
    description: 'Mapa norma a norma del Código Estructural y el CTE que implementa Concreta: qué artículo cubre cada módulo, qué está vivo y qué queda en roadmap.',
  },
  '/about': {
    title: 'Sobre Concreta — Filosofía y autor',
    description: 'La filosofía detrás de Concreta, la historia de por qué nació y quién está detrás de cada commit. Una mesa de trabajo para el calculista, no un dashboard.',
  },
  '/pricing': {
    title: 'Precio — Concreta',
    description: 'Suscripción mensual a Concreta: plan Libre, Pro (19 €/mes) y Studio. Sin sorpresas, sin «contacta con ventas». Comparativa completa y preguntas frecuentes.',
  },
  '/blog': {
    title: 'Blog — Concreta',
    description: 'Notas técnicas y de producto: interpretaciones normativas del CE y el CTE, tutoriales con casos reales y registro de cambios. Escrito por gente que calcula.',
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
  '/horm/forjados': {
    title: 'Forjados (reticular / maciza) — Concreta',
    description: 'Comprobación de forjados reticular y losa maciza en una dirección. Flexión (sección T), cortante y fisuración. Código Estructural art. 21, 42, 44, 49.',
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
  '/acero/placas-de-anclaje': {
    title: 'Placas de anclaje — Concreta',
    description: 'Placas de anclaje atornilladas. EC3 §6.2.5 (T-stub), EN 1992-4 (pernos).',
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
  '/rehab/muros-fabrica': {
    title: 'Muros de fábrica — Concreta · DB-SE-F',
    description: 'Verificación de muros de carga de fábrica multi-planta · DB-SE-F.',
  },
  '/analisis/fem': {
    title: 'FEM 1D — Concreta',
    description: 'Análisis FEM 1D real — viga continua y ménsula con comprobación HA + Acero según normativa española.',
  },
};

export const DEFAULT_META: RouteMeta = routeMeta['/'];
