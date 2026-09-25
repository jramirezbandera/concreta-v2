// SEO metadata per route — drives <Helmet> tags in each module.
// title: shown in browser tab and Google search result title.
// description: shown in Google snippet and og:description.
// Keep descriptions under 160 chars.
// Norm citations are the ones each module's engine prints (the `article`
// strings in lib/calculations), checked on 2026-09-25 — not the norm map's.
// /pricing speaks of the public beta: retire that sentence with BETA
// (pages/landing/constants.ts).

export interface RouteMeta {
  title: string;
  description: string;
}

export const BASE_URL = 'https://concreta.tools';

export const routeMeta: Record<string, RouteMeta> = {
  '/': {
    title: 'Concreta — Cálculo estructural para el día a día',
    description: 'Cálculo estructural con norma española (CE, CTE) para arquitectos e ingenieros: del cálculo suelto al anejo y la memoria de la obra. PWA local, sin cuentas.',
  },
  '/normativa': {
    title: 'Normativa — Concreta',
    description: 'Mapa norma a norma del Código Estructural, el CTE y la NCSE-02 que implementa Concreta: qué artículo cubre cada módulo y qué limitaciones tiene.',
  },
  '/about': {
    title: 'Sobre Concreta — Filosofía y autor',
    description: 'La filosofía detrás de Concreta, la historia de por qué nació y quién está detrás de cada commit. Una mesa de trabajo para el calculista, no un dashboard.',
  },
  '/pricing': {
    title: 'Precio — Concreta',
    description: 'Concreta es gratis durante la beta pública. Después: Libre, Pro (19 €/mes) y Estudio, por lo que sabe hacer el asistente y nunca por un contador de mensajes.',
  },
  '/blog': {
    title: 'Blog — Concreta',
    description: 'Notas técnicas y de producto: interpretaciones normativas del CE y el CTE, tutoriales con casos reales y registro de cambios. Escrito por gente que calcula.',
  },
  '/horm/vigas': {
    title: 'Vigas de hormigón armado — Concreta',
    description: 'Cálculo de vigas HA: flexión, cortante, fisuración, flecha, anclaje y solape según el Código Estructural, Anejo 19. Cuadro de vigas del plano en DXF.',
  },
  '/horm/pilares': {
    title: 'Pilares de hormigón armado — Concreta',
    description: 'Compresión y pandeo biaxial en pilares de HA. Código Estructural, Anejo 19 §5.8 y §6.1.',
  },
  '/horm/punzonamiento': {
    title: 'Punzonamiento en losa — Concreta',
    description: 'Comprobación de punzonamiento en losa maciza: perímetros críticos, cercos y crucetas de UPN. Código Estructural, Anejo 19 §6.4.',
  },
  '/horm/forjados': {
    title: 'Forjados (reticular / maciza) — Concreta',
    description: 'Comprobación de forjados reticular y losa maciza en una dirección. Flexión (sección T), cortante y fisuración. Código Estructural art. 21, 42, 44, 49.',
  },
  '/acero/vigas': {
    title: 'Vigas de acero — Concreta',
    description: 'Flexión, cortante, pandeo lateral y flecha en vigas de acero: IPE, HEA y HEB hasta el 1000, IPN, UPN, 2UPN y tubos. CTE DB-SE-A §6.2 y §6.3.',
  },
  '/acero/pilares': {
    title: 'Pilares de acero — Concreta',
    description: 'Pandeo por flexión y flexocompresión biaxial en pilares de acero laminado. CE Anejo 22 §6.3.',
  },
  '/acero/seccion-compuesta': {
    title: 'Sección compuesta — Concreta',
    description: 'Steiner, clase de sección y módulo plástico Wpl por bandas. CE Anejo 22.',
  },
  '/acero/placas-de-anclaje': {
    title: 'Placas de anclaje — Concreta',
    description: 'Cálculo de placa base de acero con barras corrugadas embebidas (B400S/B500S) ancladas en hormigón. Comprobaciones de fluencia, cono, splitting, edge breakout, pry-out y longitud de anclaje según el Código Estructural (RD 470/2021) —Anejo 26 (placa base) y Anejo 19 (longitud de anclaje)— y la EN 1992-4 (anclajes en hormigón).',
  },
  '/ciment/zapatas': {
    title: 'Zapatas aisladas — Concreta',
    description: 'Cálculo de zapata aislada en tres vistas —terreno, armado y modelo—: presiones, vuelco, deslizamiento y armado. CTE DB-SE-C §4.4 y CE Anejo 19.',
  },
  '/ciment/muros': {
    title: 'Muros de contención — Concreta',
    description: 'Muro ménsula de hormigón armado con nivel freático y sismo: vuelco, deslizamiento, hundimiento y armado. CTE DB-SE-C §6 y CE Anejo 19. Plano tipo en DXF.',
  },
  '/ciment/encepados': {
    title: 'Encepados de micropilotes — Concreta',
    description: 'Encepados de 2, 3, 4 y 6 micropilotes por bielas y tirantes, con el armado secundario y los mínimos de la EHE-08 58. Detalle tipo en DXF.',
  },
  '/ciment/micropilotes': {
    title: 'Micropilotes — Concreta · Guía de Fomento',
    description: 'Micropilotes según la Guía de Fomento 2005: hundimiento por fuste, tope estructural, asientos y conexión con el encepado. Detalle tipo en DXF.',
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
    description: 'Pilar compuesto batido (empresillado). CE Anejo 22 §6.4.2.',
  },
  '/rehab/muros-fabrica': {
    title: 'Muros de fábrica — Concreta · DB-SE-F',
    description: 'Verificación de muros de carga de fábrica multi-planta · DB-SE-F.',
  },
  '/analisis/fem': {
    title: 'FEM 1D — Concreta',
    description: 'Análisis FEM 1D real — viga continua y ménsula con comprobación HA + Acero según normativa española.',
  },
  '/analisis/fem2d': {
    title: 'FEM 2D — Pórticos y cerchas · Concreta',
    description: 'Pórticos y cerchas en 2D: esfuerzos N, V y M, pandeo y αcr de segundo orden, con barras de acero, hormigón o madera comprobadas con la norma española.',
  },
  '/analisis/sismo': {
    title: 'Acción sísmica — Concreta · NCSE-02',
    description: 'Acción sísmica por el método simplificado de la NCSE-02: obligatoriedad (art. 1.2.3), ámbito del art. 3.5.1, espectro, fuerzas por planta, reparto con torsión y la vía del art. 3.6.2.',
  },
  '/memorias/materiales': {
    title: 'Cuadro de materiales — Concreta · Código Estructural',
    description: 'Cuadro de materiales para plano y memoria: clase de exposición, recubrimiento, cemento y a/c derivados del Código Estructural, más el cuadro de madera del DB SE-M y las longitudes de anclaje.',
  },
  '/acciones/viento-nieve': {
    title: 'Viento y nieve — Concreta · DB SE-AE',
    description: 'Acción del viento por planta (presión dinámica por zona, coeficiente de exposición del Anejo D, coeficientes eólicos de la tabla 3.5) y carga de nieve por faldón (zona de clima invernal, altitud, coeficiente de forma, acumulación) según el CTE DB SE-AE.',
  },
  '/obra': {
    title: 'La obra — Concreta',
    description:
      'El estado de la obra de un vistazo: qué falta para poder exportar la justificación del DB SE, qué se ha calculado en cada módulo y qué hay guardado en el anejo de cálculo.',
  },
  '/ajustes/estudio': {
    title: 'Mi estudio — Concreta',
    description:
      'El perfil del despacho: programa de cálculo, límites de flecha, niveles de control y las redacciones fijas del método. Se rellena una vez y lo hereda cada obra nueva.',
  },
  '/proyecto/anejo': {
    title: 'Anejo de cálculo — Concreta',
    description: 'El anejo de cálculo de la obra en un solo PDF: portada, índice verificado y los cálculos guardados desde cada módulo, ordenados y con numeración continua.',
  },
  '/memorias/db-se': {
    title: 'Cumplimiento del DB SE — Concreta · CTE',
    description: 'Ficha de justificación del CTE DB SE (apartado 3.1 de la memoria): SE, SE-AE, SE-C, NCSE-02, Código Estructural, forjados, SE-A, SE-F y SE-M, ensamblada desde los módulos de materiales, viento y nieve, cargas, sismo e incendio. Word y PDF.',
  },
  '/acciones/cargas-planta': {
    title: 'Cargas por planta — Concreta · DB SE-AE',
    description: 'Cuadro de cargas por planta según el CTE DB SE-AE, donde se declara el edificio: peso propio del forjado (Anejo C), permanentes, sobrecarga de uso de la tabla 3.1 y nieve en lo que está a la intemperie, con Gd, Qd y qd.',
  },
  '/acciones/incendio': {
    title: 'Resistencia al fuego — Concreta · CTE DB SI 6',
    description: 'Resistencia al fuego exigida a la estructura según el CTE DB SI 6: la R de la tabla 3.1 por uso y altura de evacuación, el tiempo equivalente del Anejo B y la comprobación de secciones de hormigón y acero con los anejos C y D.',
  },
  '/geotec/taludes': {
    title: 'Taludes — Estabilidad de taludes · Concreta',
    description: 'Factor de seguridad de taludes por Bishop simplificado o Fellenius. Predimensionamiento geotécnico según CTE DB-SE-C art. 7.2.2.1.',
  },
  '/geotec/escollera': {
    title: 'Escollera — Muros de escollera y gaviones · Concreta',
    description: 'Muro de gravedad de escollera colocada o gaviones: deslizamiento piedra sobre piedra, vuelco, hundimiento y sismo según la Guía de Fomento 2006 y CTE DB-SE-C.',
  },
};

export const DEFAULT_META: RouteMeta = routeMeta['/'];
