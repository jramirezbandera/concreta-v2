// normativaData.ts — single source of truth for all normativa content.
// Consumed by the landing's NormativaSection (summary table) and the dedicated
// /normativa page (full norm-by-norm map + per-module coverage docs).

export type NormStatus = 'ok' | 'warn' | 'dim';

// ── Landing summary table (6 rows) ─────────────────────────────────────────────
export interface NormSummaryRow {
  code: string;
  full: string;
  year: string;
  mods: string[];
  status: NormStatus;
}

export const NORM_SUMMARY: NormSummaryRow[] = [
  { code: 'CE', full: 'Código Estructural', year: '2021', mods: ['Hormigón', 'Cimentación'], status: 'ok' },
  { code: 'CTE DB-SE', full: 'Bases de cálculo', year: '2019', mods: ['Combinaciones'], status: 'ok' },
  { code: 'CTE DB-SE-A', full: 'Acero estructural', year: '2008', mods: ['Vigas y pilares acero'], status: 'ok' },
  { code: 'CTE DB-SE-C', full: 'Cimentaciones', year: '2008', mods: ['Zapatas · Muros'], status: 'ok' },
  { code: 'CTE DB-SE-M', full: 'Estructuras de madera', year: '2008', mods: ['Madera'], status: 'ok' },
  { code: 'EC2 · EC3 · EC5', full: 'Apoyo técnico secundario', year: '—', mods: ['Cuando la norma nacional remite'], status: 'warn' },
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
  /** Didactic intro: queEs + paraQue. Roadmap uses `note` instead. */
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
    code: 'CE · 2021',
    status: 'ok',
    statusLabel: '● implementado',
    reviewed: '05/2026',
    queEs: 'la norma de referencia para el hormigón estructural en España desde 2021 (Real Decreto 470/2021). Sustituye a la EHE-08 y a la EAE para todo el hormigón nuevo.',
    paraQue: 'es la norma que cita el visado cuando comprueba tu cálculo de una viga, un pilar o un forjado.',
    articles: [
      { code: 'art.42', desc: 'Estados límite últimos — flexión simple y compuesta', mod: 'Vigas · Pilares' },
      { code: 'art.43', desc: 'Flexocompresión y pandeo en pilares', mod: 'Pilares' },
      { code: 'art.44', desc: 'Cortante', mod: 'Vigas · Forjados' },
      { code: 'art.45', desc: 'Punzonamiento en placas', mod: 'Punzonamiento' },
      { code: 'art.46', desc: 'Torsión', mod: 'Vigas (parcial)' },
      { code: 'art.49', desc: 'Estados límite de servicio · fisuración', mod: 'Vigas' },
      { code: 'art.50', desc: 'Deformaciones diferidas y fluencia', mod: 'Roadmap v0.5' },
      { code: 'art.55', desc: 'Anclaje y empalmes de armaduras', mod: 'Vigas · Pilares' },
    ],
  },
  {
    id: 'cte-dbse',
    tocLabel: 'Bases de cálculo',
    title: 'Bases de cálculo',
    code: 'CTE DB-SE · 2019',
    status: 'ok',
    statusLabel: '● implementado',
    reviewed: '05/2026',
    queEs: 'el documento del Código Técnico de la Edificación que define las reglas comunes a todas las normas estructurales — cómo combinar acciones, qué coeficientes parciales aplicar, cómo categorizar los usos del edificio.',
    paraQue: 'es la «caja común» que usan en silencio todos los módulos de Concreta cuando combinan acciones para ELU y ELS.',
    articles: [
      { code: '§3', desc: 'Acciones permanentes, variables y accidentales', mod: 'Cargas' },
      { code: '§4', desc: 'Verificaciones basadas en coeficientes parciales', mod: 'Todos' },
      { code: 'tab.3.1', desc: 'Categorías de uso y sobrecargas características', mod: 'Generador cargas' },
      { code: '§4.3', desc: 'Combinaciones ELU · ELS-característica · frecuente · cuasi-permanente', mod: 'FEM 1D' },
    ],
  },
  {
    id: 'cte-dbsea',
    tocLabel: 'Acero estructural',
    title: 'Acero estructural',
    code: 'CTE DB-SE-A · 2008',
    status: 'ok',
    statusLabel: '● implementado',
    reviewed: '05/2026',
    queEs: 'el DB del CTE que cubre acero estructural: perfiles laminados, armados y huecos. Resistencia de la sección, pandeo de la pieza, pandeo lateral y aptitud al servicio.',
    paraQue: 'es lo que vas a citar cuando comprobar una viga IPE, un pilar HEB o una placa de anclaje. Concreta apoya en el EC3 sólo donde el DB-SE-A remite explícitamente.',
    articles: [
      { code: '§6.2', desc: 'Resistencia de las secciones — flexión, cortante, M-V', mod: 'Vigas acero' },
      { code: '§6.3.2', desc: 'Pandeo por compresión · curvas χ', mod: 'Pilares acero' },
      { code: '§6.3.3', desc: 'Pandeo lateral por flexión (LTB)', mod: 'Vigas acero' },
      { code: '§6.3.4', desc: 'Pandeo en barras a flexocompresión', mod: 'Pilares acero' },
      { code: '§5.2', desc: 'Clasificación de secciones — clases 1 a 4', mod: 'Vigas · Pilares' },
      { code: '§7', desc: 'Aptitud al servicio · flecha', mod: 'Vigas acero' },
      { code: '§8.7', desc: 'Uniones soldadas — placas de anclaje y nudos', mod: 'Placas anclaje (parcial)' },
      { code: 'EC3 §6.4.2', desc: 'Barras compuestas — empresillado', mod: 'Empresillado' },
    ],
  },
  {
    id: 'cte-dbsec',
    tocLabel: 'Cimentaciones',
    title: 'Cimentaciones',
    code: 'CTE DB-SE-C · 2008',
    status: 'ok',
    statusLabel: '● implementado',
    reviewed: '05/2026',
    queEs: 'el DB del CTE para cimentaciones: bases geotécnicas, comprobaciones de estabilidad (vuelco, deslizamiento, hundimiento), dimensionado de zapatas y muros de contención.',
    paraQue: 'es lo que respalda el dimensionado en planta de una zapata, las comprobaciones de un muro de sótano o los empujes de un muro de contención exterior.',
    articles: [
      { code: '§4.3', desc: 'Zapatas — tensiones admisibles y excentricidad', mod: 'Zapatas' },
      { code: '§4.3.2', desc: 'Estabilidad — vuelco y deslizamiento', mod: 'Zapatas · Muros' },
      { code: '§4.4', desc: 'Comprobaciones estructurales — flexión, punzonamiento, cortante', mod: 'Zapatas' },
      { code: '§6', desc: 'Elementos de contención — empuje activo, pasivo, reposo', mod: 'Muros' },
      { code: '§6.3', desc: 'Comprobaciones del muro — vuelco, deslizamiento, hundimiento', mod: 'Muros' },
      { code: '§5', desc: 'Pilotes y encepados', mod: 'Encepados (parcial)' },
    ],
  },
  {
    id: 'eurocodigos',
    tocLabel: 'Eurocódigos',
    title: 'Eurocódigos (referencia auxiliar)',
    code: 'EC3 · EC5',
    status: 'warn',
    statusLabel: '● parcial',
    reviewed: '05/2026',
    queEs: 'normas europeas armonizadas (EC2 hormigón, EC3 acero, EC5 madera). En España la norma resolutiva sigue siendo CE/CTE; los eurocódigos actúan de referencia cuando la norma nacional remite o no llega.',
    paraQue: 'en Concreta los usamos en madera (no hay DB-SE-M completo equivalente) y en algunos casos puntuales como el empresillado de pilares metálicos.',
    articles: [
      { code: 'EC5 §6', desc: 'Madera estructural — comprobaciones de resistencia y servicio', mod: 'Vigas madera' },
      { code: 'EC5 §6.3', desc: 'Pandeo en piezas comprimidas de madera', mod: 'Pilares madera' },
      { code: 'EC3 §6.4.2', desc: 'Pilares empresillados — cargas axiles N_chord', mod: 'Empresillado' },
      { code: 'EC2', desc: 'Hormigón — sólo donde el CE remite explícitamente', mod: 'Auxiliar' },
    ],
  },
  {
    id: 'roadmap',
    tocLabel: 'Roadmap',
    title: 'Roadmap normativo',
    code: 'v0.5 → v1.0',
    status: 'dim',
    statusLabel: '○ planificado',
    note: 'En este orden, en los próximos doce meses.',
    articles: [
      { code: 'v0.5', desc: 'CE art.50 — deformaciones diferidas, fluencia y retracción', mod: 'Vigas HA' },
      { code: 'v0.6', desc: 'CTE DB-SE-AE — acción sísmica y NCSE-02', mod: 'Pilares · FEM' },
      { code: 'v0.7', desc: 'CE — secciones en T, secciones huecas y vigas mixtas', mod: 'Vigas HA' },
      { code: 'v0.8', desc: 'CTE DB-SE-F — fábricas y muros portantes', mod: 'Módulo nuevo' },
      { code: 'v0.9', desc: 'CTE DB-SI — comprobaciones de resistencia al fuego', mod: 'Transversal' },
      { code: 'v1.0', desc: 'Cimentaciones profundas — pilotes, micropilotes', mod: 'Cimentación' },
    ],
  },
];

// ── Full /normativa page — per-module technical docs ───────────────────────────
export interface ModuleDoc {
  id: string;
  title: string;
  ref: string;
  usos: string[];
  limitaciones: string[];
}

export const MODULE_DOCS: ModuleDoc[] = [
  {
    id: 'doc-vigas-ha',
    title: 'Vigas HA',
    ref: 'CE art.42–49 · 55',
    usos: [
      'Flexión simple en sección rectangular y T.',
      'Flexión compuesta con N pequeño.',
      'Cortante con bielas comprimidas y cercos.',
      'Fisuración (ELS) bajo combinación frecuente.',
      'Cuantías mínimas y máximas según art.55.',
    ],
    limitaciones: [
      'No cubre torsión (parcial en roadmap v0.6).',
      'Sin deformaciones diferidas — fluencia/retracción en v0.5.',
      'Sólo sección constante; no aborda secciones variables.',
    ],
  },
  {
    id: 'doc-pilares-ha',
    title: 'Pilares HA',
    ref: 'CE art.42 · 43',
    usos: [
      'Sección rectangular con armado simétrico o asimétrico.',
      'Flexocompresión recta y esviada simplificada.',
      'Pandeo según método de la curvatura nominal.',
      'Cuantías geométricas y mecánicas.',
    ],
    limitaciones: [
      'No genera diagrama de interacción N-M completo.',
      'Sin pilares mixtos hormigón-acero.',
      'Sin secciones circulares o poligonales.',
    ],
  },
  {
    id: 'doc-punzonamiento',
    title: 'Punzonamiento',
    ref: 'CE art.45',
    usos: [
      'Pilar interior, de borde y de esquina con β tabulado.',
      'Comprobación en el borde del pilar y a u1 = 2d.',
      'Dimensionado de cercos de punzonamiento a 0.75d.',
      'Perímetro de control externo uout.',
    ],
    limitaciones: [
      'Sólo pilares rectangulares.',
      'No considera capitel explícito (sí implícito por β).',
      'Sin armadura de punzonamiento de prefabricados.',
    ],
  },
  {
    id: 'doc-vigas-acero',
    title: 'Vigas acero',
    ref: 'DB-SE-A §5 · 6 · 7',
    usos: [
      'Perfiles IPE, HEB, HEA, HEM, UPN, UPE.',
      'Flexión, cortante e interacción M-V.',
      'Pandeo lateral por flexión (LTB) con χLT.',
      'Flecha L/300, L/400, L/500 configurable.',
      'Clasificación de sección (clase 1 a 4).',
    ],
    limitaciones: [
      'Vano simple o continuo equivalente — no FEM multi-vano.',
      'Sin abolladura en almas esbeltas (clase 4 limitada).',
      'Sin secciones armadas no normalizadas (ver módulo Sección compuesta).',
    ],
  },
  {
    id: 'doc-muros',
    title: 'Muros de contención',
    ref: 'DB-SE-C §6',
    usos: [
      'Empuje activo de Rankine y empuje en reposo.',
      'Vuelco, deslizamiento y hundimiento.',
      'Distribución de tensiones bajo zapata.',
      'Armado de fuste y zapata (puntera + talón).',
    ],
    limitaciones: [
      'Sin coeficiente sísmico (NCSE-02) — roadmap v0.6.',
      'Sin contrafuertes ni muros de pantalla.',
      'Sin acción de agua (nivel freático constante simplificado).',
    ],
  },
  {
    id: 'doc-madera',
    title: 'Madera',
    ref: 'EC5 · CTE DB-SE-M',
    usos: [
      'Madera maciza C14 a C50 y laminada GL24h a GL32h.',
      'Clase de servicio 1, 2 y 3 con kmod.',
      'Flexión, cortante, compresión axial.',
      'Pandeo en pilares (kc), pandeo lateral en vigas (kcrit).',
      'Flecha instantánea y final con kdef.',
    ],
    limitaciones: [
      'Sin uniones mecánicas (clavijas, tornillos).',
      'Sin elementos en flexotracción ni compuestos.',
      'Sin resistencia al fuego — pendiente DB-SI.',
    ],
  },
];

// ── Legend ─────────────────────────────────────────────────────────────────────
export const NORM_LEGEND: { tag: string; cls: string; desc: string }[] = [
  { tag: '● implementado', cls: 'ok', desc: 'Vivo en la app y testeado.' },
  { tag: '● parcial', cls: 'warn', desc: 'Cubierto en sus casos comunes.' },
  { tag: '○ roadmap', cls: 'dim', desc: 'Planificado para próximas versiones.' },
];
