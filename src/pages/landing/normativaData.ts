// normativaData.ts — single source of truth for all normativa content.
// Consumed by the landing's NormativaSection (summary table) and the dedicated
// /normativa page (full norm-by-norm map + per-module coverage docs).
//
// Re-audited on 2026-09-25 against the code AND the official texts: every
// article, module and limitation below is the one the engine actually cites
// (the `article` strings in lib/calculations) and checked against the CTE PDFs.
// When a module's citation and the norm disagree, this page follows the norm
// and the discrepancy is a bug in the module, not here.
// No roadmap block (decision 2026-09-25): it promised five items «en los
// próximos doce meses» and three had shipped. What is missing is said where it
// applies — each module's limitaciones and the blocks marked «parcial».

export type NormStatus = 'ok' | 'warn' | 'dim';

// ── Landing summary table ──────────────────────────────────────────────────────
export interface NormSummaryRow {
  code: string;
  full: string;
  year: string;
  mods: string[];
  status: NormStatus;
  /** The tag's text. `status` only colours it: «parcial» and «de apoyo» are
   *  both amber-ish but mean different things, and the table used to print
   *  «auxiliar» for anything that was not `ok`. */
  label: string;
}

export const NORM_SUMMARY: NormSummaryRow[] = [
  { code: 'CE', full: 'Código Estructural', year: '2021', mods: ['Hormigón', 'Acero (Anejos 22 y 26)', 'Cimentación', 'Materiales'], status: 'ok', label: '● implementada' },
  { code: 'CTE DB-SE', full: 'Bases de cálculo', year: '2019', mods: ['Combinaciones', 'Flechas'], status: 'ok', label: '● implementada' },
  { code: 'CTE DB-SE-AE', full: 'Acciones en la edificación', year: '2009', mods: ['Cargas por planta', 'Viento y nieve'], status: 'warn', label: '● parcial' },
  { code: 'NCSE-02', full: 'Construcción sismorresistente', year: '2002', mods: ['Acción sísmica', 'Muros', 'Escollera'], status: 'warn', label: '● parcial' },
  { code: 'CTE DB-SE-A', full: 'Acero estructural', year: '2008', mods: ['Vigas acero', 'Esbeltez de pilares'], status: 'ok', label: '● implementada' },
  { code: 'CTE DB-SE-C', full: 'Cimentaciones', year: '2019', mods: ['Zapatas', 'Muros', 'Encepados', 'Escollera', 'Taludes'], status: 'ok', label: '● implementada' },
  { code: 'CTE DB-SE-F', full: 'Estructuras de fábrica', year: '—', mods: ['Muros de fábrica'], status: 'warn', label: '● parcial' },
  { code: 'CTE DB-SE-M', full: 'Estructuras de madera', year: '2019', mods: ['Cuadro de materiales', 'FEM 2D'], status: 'ok', label: '● implementada' },
  { code: 'CTE DB-SI', full: 'Seguridad en caso de incendio', year: '2019', mods: ['Incendio'], status: 'warn', label: '● parcial' },
  { code: 'Guías de Fomento', full: 'Micropilotes y escolleras', year: '2005/06', mods: ['Micropilotes', 'Escollera'], status: 'ok', label: '● implementada' },
  { code: 'Eurocódigos', full: 'EN 1992-4 · EN 1995 · EN 1997 · EN 1998-5', year: '—', mods: ['Madera', 'Anclajes', 'Taludes', 'Sismo en muros'], status: 'dim', label: '○ donde la norma remite' },
];

// ── Full /normativa page — norm blocks ─────────────────────────────────────────
export interface NormArticle {
  code: string;
  desc: string;
  mod: string;
}

export interface NormBlock {
  id: string;
  tocLabel: string;
  title: string;
  code: string;
  status: NormStatus;
  statusLabel: string;
  /** Didactic intro: queEs + paraQue. A block without them shows `note`. */
  queEs?: string;
  paraQue?: string;
  note?: string;
  /** "MM/AAAA" — última revisión del contenido del bloque. */
  reviewed?: string;
  articles: NormArticle[];
}

export const NORM_BLOCKS: NormBlock[] = [
  {
    id: 'ce-hormigon',
    tocLabel: 'Hormigón armado',
    title: 'Hormigón armado',
    code: 'CE · Anejo 19 · 2021',
    status: 'ok',
    statusLabel: '● implementado',
    reviewed: '09/2026',
    queEs: 'la norma de referencia para el hormigón estructural en España desde 2021 (Real Decreto 470/2021). Sustituye a la EHE-08 y a la EAE. El cálculo (flexión, cortante, punzonamiento…) vive en su Anejo 19, que reproduce la estructura del Eurocódigo 2; el articulado del CE solo remite a él.',
    paraQue: 'es la norma que cita el visado cuando comprueba tu cálculo de una viga, un pilar, un forjado o una zapata.',
    articles: [
      { code: '§6.1', desc: 'Estados límite últimos — flexión simple y compuesta', mod: 'Vigas · Pilares · Forjados · Muros · FEM 2D' },
      { code: '§5.8', desc: 'Flexocompresión y pandeo en pilares', mod: 'Pilares · FEM 2D' },
      { code: '§6.2', desc: 'Cortante', mod: 'Vigas · Forjados · Zapatas · Muros · FEM 2D' },
      { code: '§6.4', desc: 'Punzonamiento en placas y zapatas', mod: 'Punzonamiento · Zapatas' },
      { code: '§6.5', desc: 'Bielas y tirantes', mod: 'Zapatas rígidas · Encepados' },
      { code: '§7.3', desc: 'Estados límite de servicio · fisuración', mod: 'Vigas · Forjados' },
      { code: '§7.4', desc: 'Flechas — esbeltez L/d y flecha diferida con fluencia', mod: 'Vigas · Forjados · FEM 2D' },
      { code: '§8.4', desc: 'Anclaje de armaduras', mod: 'Forjados · Encepados · Placas · Cuadro de materiales' },
      { code: '§8.7', desc: 'Solapes', mod: 'Vigas · Pilares' },
      { code: '§9', desc: 'Disposiciones de armado — cuantías y separaciones', mod: 'Vigas · Pilares · Forjados' },
    ],
  },
  {
    id: 'ce-acero',
    tocLabel: 'Acero en el CE',
    title: 'Acero estructural en el Código Estructural',
    code: 'CE · Anejos 22 y 26 · 2021',
    status: 'ok',
    statusLabel: '● implementado',
    reviewed: '09/2026',
    queEs: 'el Código Estructural cubre también el acero. Su Anejo 22 reproduce el Eurocódigo 3 para las barras —resistencia de secciones, pandeo, barras compuestas— y su Anejo 26, las uniones, entre ellas las placas base.',
    paraQue: 'es lo que respalda el pandeo de un pilar metálico, un empresillado, una sección armada o una placa de anclaje. En vigas de acero, Concreta cita el DB SE-A para la sección y el Anejo 22 para el pandeo lateral.',
    articles: [
      { code: 'Anejo 22 §5.5', desc: 'Clasificación de secciones', mod: 'Pilares acero · Sección compuesta' },
      { code: 'Anejo 22 §6.2', desc: 'Resistencia de las secciones', mod: 'Sección compuesta · Micropilotes · FEM 2D' },
      { code: 'Anejo 22 §6.3.1', desc: 'Pandeo por flexión — curvas χ', mod: 'Pilares acero · FEM 2D' },
      { code: 'Anejo 22 §6.3.2', desc: 'Pandeo lateral', mod: 'Vigas acero · FEM 2D' },
      { code: 'Anejo 22 §6.3.3', desc: 'Flexocompresión con pandeo', mod: 'Pilares acero' },
      { code: 'Anejo 22 §6.4', desc: 'Barras compuestas — empresillado', mod: 'Empresillado' },
      { code: 'Anejo 26 §6.2', desc: 'Placa base — T-stub, compresión bajo la placa y soldaduras', mod: 'Placas de anclaje' },
    ],
  },
  {
    id: 'cte-dbse',
    tocLabel: 'Bases de cálculo',
    title: 'Bases de cálculo',
    code: 'CTE DB-SE · 2019',
    status: 'ok',
    statusLabel: '● implementado',
    reviewed: '09/2026',
    queEs: 'el documento del Código Técnico de la Edificación que define las reglas comunes a todas las normas estructurales — cómo combinar acciones, qué coeficientes parciales aplicar y qué flechas se admiten.',
    paraQue: 'es la «caja común» que usan en silencio todos los módulos de Concreta cuando combinan acciones para ELU y ELS.',
    articles: [
      { code: '§3.3.2', desc: 'Clasificación de las acciones — permanentes, variables y accidentales', mod: 'Cargas por planta' },
      { code: '§4', desc: 'Verificaciones basadas en coeficientes parciales', mod: 'Todos' },
      { code: '§4.2.2', desc: 'Combinaciones ELU — situación persistente o transitoria', mod: 'FEM 1D · FEM 2D' },
      { code: 'tablas 4.1 · 4.2', desc: 'Coeficientes parciales γ y de simultaneidad ψ', mod: 'Cargas por planta · FEM 1D · FEM 2D' },
      { code: '§4.3.2', desc: 'Combinaciones ELS — característica, frecuente y cuasipermanente', mod: 'FEM 1D · FEM 2D' },
      { code: '§4.3.3', desc: 'Flechas — integridad, confort y apariencia', mod: 'Vigas HA · Vigas acero · Madera · FEM 2D' },
    ],
  },
  {
    id: 'cte-dbseae',
    tocLabel: 'Acciones',
    title: 'Acciones en la edificación',
    code: 'CTE DB-SE-AE · 2009',
    status: 'warn',
    statusLabel: '● parcial',
    reviewed: '09/2026',
    queEs: 'el DB del CTE que fija las acciones sobre el edificio: peso propio, sobrecargas de uso, viento y nieve. Sus anejos traen los pesos de materiales y elementos (C), los coeficientes de viento (D) y la nieve por zonas y altitud (E).',
    paraQue: 'es lo que respalda cada kN/m² del cuadro de cargas por planta y la fuerza de viento por planta que se lleva al programa de cálculo. Falta la cubierta plana por zonas (tabla D.4) y las acciones térmicas y accidentales.',
    articles: [
      { code: '§2.1 · Anejo C', desc: 'Peso propio — forjados, solados, cubiertas y tabiquería de la tabla C.5', mod: 'Cargas por planta' },
      { code: 'tabla 3.1', desc: 'Sobrecargas de uso por categoría, con sus notas y el §3.1.1', mod: 'Cargas por planta · Vigas acero · FEM 1D' },
      { code: '§3.3 · tabla 3.5', desc: 'Viento — presión dinámica, coeficientes globales, excentricidad y rozamiento', mod: 'Viento y nieve' },
      { code: 'Anejo D.1 · D.2', desc: 'Zona eólica y coeficiente de exposición a la cota de cada forjado', mod: 'Viento y nieve' },
      { code: 'tabla D.3', desc: 'Presiones por zonas en paramentos verticales', mod: 'Viento y nieve' },
      { code: 'tabla D.6', desc: 'Cubierta a dos aguas — zonas F a J en las dos direcciones', mod: 'Viento y nieve' },
      { code: '§3.5 · tabla 3.8 · Anejo E', desc: 'Nieve — sk, coeficiente de forma, acumulación y hielo en voladizos', mod: 'Viento y nieve · Cargas por planta' },
    ],
  },
  {
    id: 'ncse02',
    tocLabel: 'Sismo',
    title: 'Construcción sismorresistente',
    code: 'NCSE-02 · RD 997/2002',
    status: 'warn',
    statusLabel: '● parcial',
    reviewed: '09/2026',
    queEs: 'la Norma de Construcción Sismorresistente (Real Decreto 997/2002). Dice cuándo hay que considerar el sismo, con qué aceleración según el municipio (su Anejo 1) y cómo se obtienen las fuerzas: por un método simplificado o por análisis modal con ordenador.',
    paraQue: 'es lo que respalda el apartado 3.1.4 de la memoria —ab, K, ρ, S y ac— y las fuerzas por planta del método simplificado. El análisis modal no lo calcula Concreta: se declara y sale del programa.',
    articles: [
      { code: 'art. 1.2.2 · 1.2.3', desc: 'Importancia de la construcción, obligatoriedad y prohibiciones', mod: 'Acción sísmica' },
      { code: 'art. 2.2 · 2.4 · Anejo 1', desc: 'ab y K por municipio, coeficiente del terreno C, S y ac', mod: 'Acción sísmica' },
      { code: 'art. 2.3 · 2.5', desc: 'Espectro de respuesta elástica y corrección por amortiguamiento', mod: 'Acción sísmica' },
      { code: 'art. 3.2', desc: 'Masas — fracción de cada carga que cuenta como masa sísmica', mod: 'Acción sísmica' },
      { code: 'art. 3.5.1', desc: 'Condiciones del método simplificado', mod: 'Acción sísmica' },
      { code: 'art. 3.6.2', desc: 'Análisis modal por ordenador — se declara, no se calcula', mod: 'Acción sísmica (parcial)' },
      { code: 'art. 3.7', desc: 'Método simplificado — período, fuerzas y cortantes por planta, torsión', mod: 'Acción sísmica' },
      { code: 'art. 2.2 (S)', desc: 'Coeficiente sísmico kh = S·ab para el empuje de Mononobe-Okabe', mod: 'Muros · Escollera' },
    ],
  },
  {
    id: 'cte-dbsea',
    tocLabel: 'Acero en el CTE',
    title: 'Acero estructural en el CTE',
    code: 'CTE DB-SE-A · 2008',
    status: 'ok',
    statusLabel: '● implementado',
    reviewed: '09/2026',
    queEs: 'el DB del CTE que cubre acero estructural: perfiles laminados, armados y huecos. Resistencia de la sección, pandeo de la pieza, pandeo lateral y aptitud al servicio.',
    paraQue: 'Concreta lo cita para las vigas de acero —clasificación y resistencia de la sección— y para el límite de esbeltez de los pilares. El pandeo de pilares, las barras compuestas y las placas van por el Código Estructural (bloque anterior).',
    articles: [
      { code: '§5.2.4', desc: 'Clasificación de secciones — clases 1 a 4', mod: 'Vigas acero' },
      { code: '§6.2', desc: 'Resistencia de las secciones — cortante (6.2.4), flexión (6.2.6) e interacción M-V (6.2.8)', mod: 'Vigas acero' },
      { code: '§6.3', desc: 'Esbeltez reducida λ̄ ≤ 2 (recomendación)', mod: 'Pilares acero · Sección compuesta' },
    ],
  },
  {
    id: 'cte-dbsec',
    tocLabel: 'Cimentaciones',
    title: 'Cimentaciones',
    code: 'CTE DB-SE-C · 2019',
    status: 'ok',
    statusLabel: '● implementado',
    reviewed: '09/2026',
    queEs: 'el DB del CTE para cimentaciones: bases geotécnicas, comprobaciones de estabilidad (vuelco, deslizamiento, hundimiento), zapatas, pilotes, muros de contención y taludes.',
    paraQue: 'es lo que respalda el dimensionado en planta de una zapata, las comprobaciones de un muro de sótano o los empujes de un muro de contención exterior. La comprobación estructural de zapatas y muros la remite al Código Estructural.',
    articles: [
      { code: 'tabla 2.1', desc: 'Coeficientes de seguridad parciales', mod: 'Zapatas · Muros · Escollera · Taludes' },
      { code: '§4.2.2.1', desc: 'Zapatas — deslizamiento, vuelco y comprobación estructural (remite al CE)', mod: 'Zapatas' },
      { code: '§4.3', desc: 'Presión admisible y de hundimiento', mod: 'Zapatas' },
      { code: '§5.1.3', desc: 'Geometría del encepado', mod: 'Encepados' },
      { code: '§6.2.3 · §6.2.6', desc: 'Empuje activo y pasivo, y empuje del agua', mod: 'Muros · Escollera' },
      { code: '§6.3.3.2', desc: 'Estabilidad del muro — hundimiento, deslizamiento y vuelco', mod: 'Muros · Escollera' },
      { code: '§7.2.2.1', desc: 'Estabilidad de taludes en suelos', mod: 'Taludes' },
    ],
  },
  {
    id: 'cte-dbsef',
    tocLabel: 'Fábrica',
    title: 'Estructuras de fábrica',
    code: 'CTE DB-SE-F',
    status: 'warn',
    statusLabel: '● parcial',
    reviewed: '09/2026',
    queEs: 'el DB del CTE para estructuras de fábrica: resistencia de piezas y mortero, coeficientes de seguridad y comprobación de muros de carga.',
    paraQue: 'es lo que respalda la comprobación de un muro de carga existente en una rehabilitación y el apartado 3.1.8 de la memoria. Comprueba cargas verticales; el viento, el sismo y el cortante en su plano quedan fuera.',
    articles: [
      { code: '§4.6.2 · tabla 4.4', desc: 'Resistencia característica fk según pieza, fb y fm', mod: 'Muros de fábrica · Cumplimiento del DB SE' },
      { code: 'Anejo C · ec. C.1', desc: 'fk calculada cuando la pareja fb–fm no está en la tabla (mortero ordinario)', mod: 'Muros de fábrica' },
      { code: '§4.6.7 · tabla 4.8', desc: 'Coeficiente γM por categoría de control y clase de ejecución', mod: 'Muros de fábrica · Cumplimiento del DB SE' },
      { code: '§5.2', desc: 'Compresión excéntrica en cabeza y pie de cada machón', mod: 'Muros de fábrica' },
      { code: '§5.2.3', desc: 'Excentricidad de la reacción del forjado y excentricidad mínima', mod: 'Muros de fábrica' },
      { code: '§5.2.4', desc: 'Esbeltez λ = hef/t ≤ 27 y reducción por pandeo', mod: 'Muros de fábrica' },
      { code: '§5.4', desc: 'Cargas concentradas bajo apoyo de viga', mod: 'Muros de fábrica' },
    ],
  },
  {
    id: 'cte-dbsi',
    tocLabel: 'Incendio',
    title: 'Resistencia al fuego de la estructura',
    code: 'CTE DB-SI 6 · 2019',
    status: 'warn',
    statusLabel: '● parcial',
    reviewed: '09/2026',
    queEs: 'el DB del CTE para la seguridad en caso de incendio. Su sección 6 es la que afecta a la estructura: dice qué resistencia al fuego (R 30, R 60, R 90…) hay que exigirle a cada parte del edificio, y sus anejos traen las tablas con las que se comprueba si una sección la alcanza.',
    paraQue: 'es lo que respalda la R que se escribe en la memoria y en el cuadro del plano, y la que decide si un pilar necesita un revestimiento o llega con su propia sección.',
    articles: [
      { code: 'SI 6, tabla 3.1', desc: 'R exigida según el uso del sector y la altura de evacuación', mod: 'Incendio' },
      { code: 'SI 6, tabla 3.2', desc: 'Cubierta ligera no prevista para evacuación', mod: 'Incendio' },
      { code: 'SI 6 §3.3 y §4', desc: 'Escaleras protegidas, elementos secundarios y carpas', mod: 'Incendio' },
      { code: 'Anejo A', desc: 'Altura de evacuación — cotas y origen de evacuación', mod: 'Incendio' },
      { code: 'Anejo B', desc: 'Tiempo equivalente de exposición al fuego (alternativa del §3.1.b)', mod: 'Incendio' },
      { code: 'Anejo C', desc: 'Hormigón — tablas C.1 a C.5 y capas protectoras del C.2.4', mod: 'Incendio' },
      { code: 'Anejo D', desc: 'Acero — masividad, tabla D.1 y elementos revestidos', mod: 'Incendio' },
      { code: 'Anejo E', desc: 'Madera — sección residual carbonizada', mod: 'Vigas y pilares madera (por la EN 1995-1-2)' },
    ],
  },
  {
    id: 'guias-fomento',
    tocLabel: 'Guías de Fomento',
    title: 'Guías del Ministerio de Fomento',
    code: 'Micropilotes 2005 · Escollera 2006',
    status: 'ok',
    statusLabel: '● implementado',
    reviewed: '09/2026',
    queEs: 'dos guías técnicas del Ministerio de Fomento para obras de carretera: la de proyecto y ejecución de micropilotes (2005) y la de muros de escollera (2006). Los módulos las completan con el Código Estructural (sección del tubo) y el DB SE-C (estabilidad de la base).',
    paraQue: 'es lo que respalda el tope estructural y el rozamiento por fuste de un micropilote, y la geometría y la estabilidad hilada a hilada de un muro de escollera.',
    articles: [
      { code: 'Guía 2005 §3.4 · §3.5', desc: 'Hundimiento por fuste — método teórico y empírico, y arranque a tracción', mod: 'Micropilotes' },
      { code: 'Guía 2005 §3.6 · tablas 3.5 a 3.7', desc: 'Tope estructural a compresión y tracción, con pandeo por CR (§3.6.1)', mod: 'Micropilotes' },
      { code: 'Guía 2005 §3.7 · tablas 3.8 y 3.9', desc: 'Empujes horizontales — empotramiento ficticio y reducción del momento', mod: 'Micropilotes' },
      { code: 'Guía 2005 tablas 2.3 y 2.4', desc: 'Recubrimiento mínimo y pérdida de espesor por corrosión', mod: 'Micropilotes' },
      { code: 'Guía 2005 §3.8 · tabla A-5.1', desc: 'Conexión con el encepado — garganta mínima de soldadura', mod: 'Micropilotes' },
      { code: 'Guía 2006 §2.2 · §2.3', desc: 'Prescripciones geométricas — coronación, taludes, contrainclinación y cimiento', mod: 'Escollera' },
      { code: 'Guía 2006 §4.1.3 · tabla 4.2', desc: 'Rozamiento de la escollera por litología — φb + Δφe − Δφn', mod: 'Escollera' },
      { code: 'Guía 2006 §4.2.2.3 · §4.2.2.4', desc: 'Estabilidad global y estabilidad local hilada a hilada', mod: 'Escollera · Taludes' },
    ],
  },
  {
    id: 'eurocodigos',
    tocLabel: 'Eurocódigos',
    title: 'Eurocódigos (donde la norma española remite)',
    code: 'EN 1992-4 · EN 1995 · EN 1997 · EN 1998-5',
    status: 'ok',
    statusLabel: '● implementado',
    reviewed: '09/2026',
    queEs: 'normas europeas armonizadas. En España la norma resolutiva sigue siendo el CE y el CTE, que en buena parte las reproducen —el Anejo 19 del CE es el Eurocódigo 2 y el 22, el 3—; Concreta cita la EN directamente sólo donde la norma española no llega o remite a ella.',
    paraQue: 'en Concreta, la madera se calcula por la EN 1995 con su Anejo Nacional, los anclajes de las placas por la EN 1992-4, los taludes con el enfoque de la EN 1997-1 y el sismo en muros con la EN 1998-5.',
    articles: [
      { code: 'EN 1995-1-1 §6', desc: 'Madera — resistencia, pandeo y servicio', mod: 'Vigas y pilares madera · FEM 2D' },
      { code: 'EN 1995-1-2 §4.2.2', desc: 'Madera al fuego — sección residual', mod: 'Vigas y pilares madera' },
      { code: 'EN 1992-4 §7.2', desc: 'Anclajes en hormigón — cono, splitting, edge breakout y pry-out', mod: 'Placas de anclaje' },
      { code: 'EN 1997-1 (DA3)', desc: 'Enfoque de proyecto de los taludes', mod: 'Taludes' },
      { code: 'EN 1998-5 Anejo E', desc: 'Empuje sísmico de Mononobe-Okabe', mod: 'Muros · Escollera' },
    ],
  },
];

// ── Full /normativa page — per-module technical docs ───────────────────────────
// Order: the sidebar's. Every line was checked against the module on 2026-09-25.
export interface ModuleDoc {
  id: string;
  title: string;
  ref: string;
  usos: string[];
  limitaciones: string[];
}

export const MODULE_DOCS: ModuleDoc[] = [
  {
    id: 'doc-materiales',
    title: 'Cuadro de materiales',
    ref: 'CE art. 27 · 33 · 43 · 44 · 91 · Anejo 19 §8 · DB SE-M',
    usos: [
      'Clases de exposición de la tabla 27.1 a partir de dónde está cada elemento, dicho en lenguaje de obra.',
      'a/c máxima, cemento mínimo y resistencia mínima de la tabla 43.2.1, con el criterio más exigente de las clases presentes.',
      'Recubrimiento nominal: el mínimo por durabilidad (tablas 44.2.1.1 a 44.5) o por adherencia, más el margen de la tabla 43.4.1.',
      'Madera con las clases de la EN 338 y la EN 14080: clase de servicio y de uso, protección, γM y la calidad que hay que pedir (DB SE-M tabla C.1).',
      'Clase de ejecución del acero estructural (tabla 91.1) y tabla de anclajes y solapes por el Anejo 19.',
      'La R exigida la trae del módulo Incendio. Memoria en Word o PDF; cuadro de plano en Excel o DXF.',
    ],
    limitaciones: [
      'Donde el CE no da recubrimiento (casillas «*», XA2 y XA3) el cuadro lo deja en rojo: lo fija el proyectista.',
      'Vida útil de 50 o 100 años: son los dos únicos valores que tabulan las tablas de recubrimiento.',
      'La durabilidad natural de la madera sale de la UNE-EN 350-2 y la UNE-EN 460, fuera del DB SE-M; eucalipto y castaño no tienen clase resistente en el DB.',
      'Anclajes para barras con adherencia por geometría de corrugas, calculados para σsd = fyd y solapes con α6 = 1,5.',
    ],
  },
  {
    id: 'doc-dbse',
    title: 'Cumplimiento del DB SE',
    ref: 'CTE DB SE · SE-AE · SE-C · NCSE-02 · CE · SE-A · SE-F · SE-M',
    usos: [
      'La ficha 3.1 de la memoria, apartados 3.1.1 a 3.1.9, sobre la plantilla de la ficha colegial.',
      'Se rellena con lo que publican Cuadro de materiales, Viento y nieve, Cargas por planta, Acción sísmica e Incendio.',
      'Acero y madera entran solos si están en el cuadro de materiales; la fábrica se marca a mano.',
      'Lee el PDF del estudio geotécnico con el asistente y propone los datos del 3.1.3 en ámbar, con la página de cada uno.',
      'Rojo lo que falta, ámbar lo heredado o por revisar, azul lo que pone la norma o un módulo. «Siguiente hueco» los recorre en orden.',
      'Word y PDF. Sólo lo que falta impide exportar.',
    ],
    limitaciones: [
      'Sin publicación de materiales, cargas por planta o sismo, su apartado queda en rojo. Viento y nieve e Incendio son opcionales.',
      'Una publicación calculada en otra provincia queda pendiente hasta darla por buena.',
      'Del geotécnico se envía el texto, no el PDF; si está escaneado, sólo sus primeras páginas como imagen. Cada dato leído se confirma a mano.',
      'Los apartados 3.1.8 (fábrica) y 3.1.9 (madera) los redacta Concreta con la estructura del 3.1.7: la ficha colegial no los desarrolla.',
    ],
  },
  {
    id: 'doc-cargas-planta',
    title: 'Cargas por planta',
    ref: 'DB SE-AE art. 2.1 · 3.1 · Anejo C · DB SE tablas 4.1 y 4.2',
    usos: [
      'Peso propio del forjado por la tabla C.5 según tipo y canto; losas y soleras, a 25 kN/m³.',
      'Sobrecarga de uso de la tabla 3.1 con sus notas: cubierta por inclinación, cubierta ligera, +1 kN/m² en escaleras de A y B y borde de balcón.',
      'Nieve de Viento y nieve sólo en las zonas a la intemperie, combinada con el uso con los ψ0 de la tabla 4.2 del DB SE.',
      'Muros y cerramientos como carga lineal: peso por m² de alzado por su altura.',
      'Valores de cálculo para predimensionado: Gd = 1,35·G, Qd = 1,50·Q y qd = Gd + Qd.',
      'Declara las plantas del edificio: Viento y nieve las lee con sus alturas e Incendio las toma de su publicación.',
    ],
    limitaciones: [
      'Forjados de madera, «otro» o con canto fuera de la tabla C.5: la norma no da peso propio y hay que teclearlo.',
      'El viento y el sismo no entran en estas sumas: se tratan en sus módulos.',
      'Muros de sótano: sólo se declaran los parámetros del terreno; el empuje se calcula aparte (DB SE-C, cap. 6).',
      'Sin la altitud de la obra, los ψ de la nieve son los de altitud ≤ 1.000 m.',
    ],
  },
  {
    id: 'doc-viento-nieve',
    title: 'Viento y nieve',
    ref: 'DB SE-AE art. 3.3 · 3.5 · Anejo D (D.3, D.6) · Anejo E',
    usos: [
      'Zona eólica y de clima invernal por provincia, con municipio y altitud heredados de la obra.',
      'Presión dinámica de la zona (0,42, 0,45 o 0,52 kN/m²), la simplificada de 0,5 kN/m² o una tecleada.',
      'Fuerza de viento por planta en X e Y: ce a la cota de cada forjado (Anejo D.2), cp y cs de la tabla 3.5, excentricidad del 5 % y rozamiento si pasa del 10 %.',
      'Cubierta a dos aguas por zonas F a J (tabla D.6) y fachadas por zonas A a E (tabla D.3) para las comprobaciones locales.',
      'Nieve: sk de la tabla 3.8 si la obra está en la capital y de la E.2 si no; μ por faldón, limahoyas, acumulación y hielo en voladizos.',
      'Las plantas se leen de Cargas por planta, y la nieve calculada vuelve a ese módulo y a la ficha del DB SE.',
    ],
    limitaciones: [
      'La fuerza por planta es para edificios de pisos (tabla 3.5). En naves la acción se individualiza por elemento (art. 3.3.5).',
      'La cubierta plana no se reparte por zonas: no está la tabla D.4.',
      'No aplica por encima de 2.000 m de altitud ni con esbeltez mayor de 6 (art. 3.3.1).',
      'Las zonas son las de la capital de la provincia. Si la provincia tiene frontera, se avisa y se puede cambiar.',
    ],
  },
  {
    id: 'doc-sismo',
    title: 'Acción sísmica',
    ref: 'NCSE-02 art. 1.2.3 · 2 · 3.5.1 · 3.6.2 · 3.7 · Anejo 1',
    usos: [
      'Decide si la Norma es obligatoria (art. 1.2.3) y aplica sus prohibiciones: adobe, tapial y alturas máximas de la fábrica.',
      'ab y K del Anejo 1 por municipio, enlazado con el de la obra. Si no figura, se teclean a mano.',
      'Terreno por tipo o por estratos ponderados en los 30 m superiores; de ahí S y ac = S·ρ·ab.',
      'Comprueba los seis requisitos del método simplificado (art. 3.5.1) y la vía de hasta cuatro plantas en total.',
      'Método simplificado: T_F, modos, fuerzas y cortantes por planta, reparto con torsión y ocho combinaciones direccionales.',
      'Con cálculo por ordenador (art. 3.6.2) da los datos del emplazamiento para el programa y lo deja escrito en la memoria.',
    ],
    limitaciones: [
      'Termina en la fuerza de cada plano resistente: no da esfuerzos por pilar ni comprueba secciones ni la ductilidad del cap. 4.',
      'Si el edificio no cumple el art. 3.5.1, el método simplificado no calcula: hay que ir al análisis modal (art. 3.6.2).',
      'Con cálculo por ordenador no obtiene períodos, masas ni cortantes: salen de los listados del programa.',
      'Por la vía de hasta cuatro plantas exige un estudio especial de torsión (art. 3.7.5).',
    ],
  },
  {
    id: 'doc-incendio',
    title: 'Incendio',
    ref: 'CTE DB-SI 6 · Anejos A a D',
    usos: [
      'R exigida por la tabla 3.1, sector a sector, con la altura de evacuación del Anejo A.',
      'Zonas de riesgo especial, cubierta ligera, escaleras protegidas y elementos secundarios.',
      'Tiempo equivalente de exposición al fuego (Anejo B) como alternativa a la tabla.',
      'Hormigón: distancia al eje y dimensiones mínimas por las tablas C.2 a C.5.',
      'Acero: masividad según el modo de calentamiento y d/λp por la tabla D.1.',
      'Espesor orientativo del revestimiento cuando la sección no llega sola.',
    ],
    limitaciones: [
      'Sin madera ni fábrica: la madera se comprueba en su propio módulo por sección residual.',
      'Sin el método de la isoterma de 500 ºC ni los métodos avanzados del §6.1.b y c.',
      'Los espesores de protección son orientativos: el DB SI no tabula ningún producto y remite al marcado CE o al ensayo UNE-EN 13381.',
    ],
  },
  {
    id: 'doc-vigas-ha',
    title: 'Vigas HA',
    ref: 'CE Anejo 19 §6 · §7 · §8 · §9',
    usos: [
      'Flexión simple en sección rectangular, con armadura de compresión.',
      'Cortante con bielas comprimidas y cercos.',
      'Fisuración (ELS) con la combinación cuasipermanente.',
      'Flecha por esbeltez L/d o por cálculo directo con sección fisurada y fluencia.',
      'Cuantías mínimas y máximas según §9.2.1.1, longitud de solape (§8.7.3) y separación entre barras (§8.2).',
      'Las vigas guardadas en el anejo van al cuadro de vigas del plano, en DXF.',
    ],
    limitaciones: [
      'No cubre torsión ni flexión compuesta: el axil de una viga se comprueba en el FEM 2D.',
      'La flecha diferida incluye la fluencia (φef lo pone el usuario), pero no la retracción.',
      'Sólo sección rectangular constante; las secciones en T están en Forjados.',
    ],
  },
  {
    id: 'doc-pilares-ha',
    title: 'Pilares HA',
    ref: 'CE Anejo 19 §5.8 · §6.1 · §9.5',
    usos: [
      'Sección rectangular o circular, con armado simétrico (barras de esquina y de cara en cada dirección).',
      'Flexocompresión recta y esviada, con diagrama de interacción N-M por eje.',
      'Pandeo según método de la curvatura nominal.',
      'Cuantías geométricas y mecánicas, y estribos a no más de min(15Ø, lado menor, 300 mm) (§9.5.3).',
      'Longitud de solape.',
    ],
    limitaciones: [
      'La esviada se comprueba con la fórmula simplificada del §5.8.9, sin superficie de interacción 3D.',
      'Sin pilares mixtos hormigón-acero.',
      'Sin secciones poligonales, en L ni en T.',
    ],
  },
  {
    id: 'doc-punzonamiento',
    title: 'Punzonamiento',
    ref: 'CE Anejo 19 §6.4',
    usos: [
      'Pilar interior, de borde y de esquina con β simplificado (1,15 / 1,4 / 1,5) o el β del proyectista.',
      'Comprobación en el borde del pilar y a u1 = 2d.',
      'Comprobación de cercos (vRd,cs) con separación radial ≤ 0,75d.',
      'Perímetro de control externo uout.',
      'Pilar metálico con crucetas de UPN: se comprueban la placa y el perfil.',
    ],
    limitaciones: [
      'Pilar circular sólo en posición interior.',
      'Sin huecos junto al pilar, ni capiteles ni ábacos.',
      'Sólo cercos verticales; su disposición y el reparto de las crucetas los revisa el ingeniero.',
    ],
  },
  {
    id: 'doc-vigas-acero',
    title: 'Vigas acero',
    ref: 'DB SE-A §5.2.4 · §6.2 · CE Anejo 22 §6.3.2 · DB SE §4.3.3',
    usos: [
      'IPE, IPN, HEA y HEB (hasta el 1000), cajón 2UPN y tubos SHS, RHS y CHS.',
      'Flexión, cortante e interacción M-V.',
      'Pandeo lateral por flexión (LTB) con χLT.',
      'Flecha de L/250 a L/600, con combinación característica, frecuente o cuasipermanente.',
      'Clasificación de la sección.',
    ],
    limitaciones: [
      'Un solo vano con cuatro condiciones de apoyo; las vigas continuas van por el FEM.',
      'Sin clase 4 ni abolladura del alma por cortante.',
      'Sin secciones armadas no normalizadas (ver módulo Sección compuesta).',
    ],
  },
  {
    id: 'doc-muros',
    title: 'Muros de contención',
    ref: 'DB SE-C §6 · CE Anejo 19 · NCSE-02',
    usos: [
      'Empuje activo de Coulomb con rozamiento tierras-muro; pasivo de Rankine opcional, al 50 %.',
      'Nivel freático en el trasdós: empuje del agua y subpresión.',
      'Sismo por Mononobe-Okabe con kh = S·ab (NCSE-02).',
      'Vuelco, deslizamiento, tercio central y tensión admisible bajo la zapata.',
      'Armado de fuste y zapata (puntera + talón), y el plano tipo del estudio en DXF, en tres tipos.',
    ],
    limitaciones: [
      'Sin empuje al reposo: el muro de sótano atado en cabeza no se modela.',
      'Sin contrafuertes ni muros pantalla.',
      'La estabilidad global se comprueba en Taludes.',
    ],
  },
  {
    id: 'doc-madera',
    title: 'Madera',
    ref: 'UNE-EN 1995-1-1 · EN 1995-1-2',
    usos: [
      'Aserrada C14 a C50 y D18 a D80; laminada GL24h a GL32h.',
      'Clase de servicio 1, 2 y 3 con kmod.',
      'Flexión, cortante, compresión y flexocompresión.',
      'Pandeo en pilares (kc), pandeo lateral en vigas (kcrit).',
      'Flecha instantánea y final con kdef.',
      'Resistencia al fuego por sección residual carbonizada (EN 1995-1-2).',
    ],
    limitaciones: [
      'Sin uniones mecánicas (clavijas, tornillos).',
      'Sin elementos compuestos; la flexotracción de barras de madera se comprueba en el FEM 2D.',
      'La R se elige a mano; la que exige el edificio sale del módulo Incendio.',
    ],
  },
  {
    id: 'doc-escollera',
    title: 'Muros de escollera y gaviones',
    ref: 'Guía Fomento 2006 §2.2 · 2.3 · 4.1.3 · 4.2.2 · DB SE-C',
    usos: [
      'Muro de gravedad de escollera colocada o de gaviones, por metro de muro.',
      'Empuje de Coulomb sobre un plano vertical virtual; el terreno entre el trasdós y ese plano cuenta como peso a favor.',
      'Prescripciones geométricas de la Guía: coronación, talud del intradós, contrainclinación 3H:1V y cimiento de 1 m como mínimo.',
      'Estabilidad hilada a hilada: deslizamiento piedra sobre piedra y vuelco parcial en la peor hilada.',
      'Vuelco, deslizamiento en la base contrainclinada, tercio central y tensión en el terreno por Meyerhof.',
      'Rozamiento de la escollera por litología (tabla 4.2), nivel freático y sismo por Mononobe-Okabe.',
    ],
    limitaciones: [
      'La estabilidad global no se calcula aquí: se abre Taludes con el modelo preparado, y sólo cuando el muro ya cumple.',
      'En ese modelo el estrato de cimentación va con un valor genérico, el talud β no pasa y no hay sismo.',
      'ab y S se teclean a mano; kh = S·ab y kv = kh/2.',
      'Gaviones en cajas de 0,5 o 1,0 m: la altura se ajusta a un número entero de filas.',
    ],
  },
];

// ── Legend ─────────────────────────────────────────────────────────────────────
export const NORM_LEGEND: { tag: string; cls: string; desc: string }[] = [
  { tag: '● implementado', cls: 'ok', desc: 'Vivo en la app y testeado.' },
  { tag: '● parcial', cls: 'warn', desc: 'Cubierto en sus casos comunes; el bloque dice qué falta.' },
];
