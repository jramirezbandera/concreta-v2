// Shared utilities for all Concreta PDF modules.
// jsPDF helpers — imported by every src/lib/pdf/*.ts export function.
//
// Page margins (M) are passed as parameter on every helper because they vary
// per module (15/18/20 mm). Do not export a default — modules choose.

import type jsPDF from 'jspdf';
import { ARIMO_RANGOS } from './cobertura';

export const PAGE_W = 210;  // A4 width mm (portrait)
export const PAGE_H = 297;  // A4 height mm (portrait)

/** Set both text and draw color to a gray value (0=black, 255=white). */
export function setGray(doc: jsPDF, g: number): void {
  doc.setTextColor(g, g, g);
  doc.setDrawColor(g, g, g);
}

/**
 * Deja una cadena lista para `doc.text()`. OBLIGATORIO en todo texto del PDF.
 *
 * Desde que los documentos llevan una Arimo embebida (ver `fuente.ts`), sanear
 * ya no es degradar: «Δcdev», «γc», «fck ≥ 30 N/mm²» y «Ø16» viajan tal cual, y
 * el PDF queda además BUSCABLE — «Deltacdev» no se encontraba buscando «Δ».
 *
 * Sólo queda por traducir lo que la fuente no puede dibujar:
 *
 *  1. el macrón combinante de «λ̄». U+0304 conserva anchura y jsPDF no lo monta
 *     sobre la letra, así que saldría «λ» y un hueco; y λ̄ (esbeltez reducida) y
 *     λ (esbeltez mecánica) son magnitudes distintas que no pueden imprimirse
 *     igual. Antes salían las dos «lam», que era el mismo error sin verse.
 *  2. los pocos símbolos que el subconjunto de Arimo no trae (`SIN_GLIFO`);
 *  3. cualquier otro carácter fuera del repertorio, que se marca con «?».
 *
 * Ese «?» final no es pereza: un carácter sin glifo se dibuja como `.notdef`,
 * que en jsPDF es INVISIBLE — no una caja. Sin el interrogante el dato
 * desaparecería del papel y nadie lo notaría.
 *
 * `src/test/pdf/unicodeEncoding.dom.test.ts` vigila la invariante sobre los
 * BYTES del PDF ya generado, no sobre el código, así que atrapa cualquier
 * `doc.text()` que alguien añada sin sanear.
 */
export function pdfStr(s: string): string {
  let out = '';
  // Recorrido por punto de código: `for..of` itera code points, no unidades
  // UTF-16, así que un par suplente cuenta como UN carácter y se sustituye
  // entero en vez de partirse en dos interrogantes.
  for (const ch of s.replace(/λ\u0304/g, 'λrel')) {
    const cp = ch.codePointAt(0)!;
    // Marcas combinantes sueltas: sin GPOS quedarían como un hueco. Fuera.
    if (cp >= 0x0300 && cp <= 0x036f) continue;
    if (tieneGlifo(cp)) out += ch;
    else out += SIN_GLIFO[ch] ?? '?';
  }
  return out;
}

/**
 * Lo que Arimo no dibuja y la app puede escribir, con su equivalente en ASCII.
 * La lista es corta a propósito: cada entrada es un símbolo que se imprime peor
 * de lo que se podría, así que antes de añadir una conviene mirar si el
 * carácter cabe en el repertorio de `scripts/subset-pdf-font.py`, que es donde
 * de verdad se arregla.
 */
const SIN_GLIFO: Record<string, string> = {
  '⇒': '=>',
  '⇄': '<->',
  '↳': '->',
  '∥': '||',
  '≪': '<<',
  '≫': '>>',
  '⊥': 'perp.',
  '∝': 'prop.',
  '∈': ' de ',
  '∪': ' U ',
  '∛': 'cbrt',
  '★': '*',
  '⚠': '!',
  '✓': 'OK',
  '✗': 'NO',
  '✕': 'x',
  '▽': 'v',
  '▸': '>',
};

/** Índice de los rangos cubiertos, montado una vez y consultado 344 veces. */
const CUBIERTOS: Set<number> = new Set(
  ARIMO_RANGOS.flatMap(([a, b]) => Array.from({ length: b - a + 1 }, (_, k) => a + k)),
);

/** ¿La fuente embebida sabe dibujar este punto de código? */
export function tieneGlifo(cp: number): boolean {
  return CUBIERTOS.has(cp);
}

/**
 * El saneador VIEJO, a Latin-1 puro. Sólo para los dos sitios que siguen
 * escribiendo con una fuente CORE de jsPDF —los bloques en `courier`, que no
 * tiene cara embebida—: ahí un carácter fuera de WinAnsi haría que jsPDF
 * emitiera la cadena entera en UTF-16BE, que el visor pinta byte a byte («E s
 * b e l t e z») y que ocupa el DOBLE del ancho que declara `getTextWidth`, de
 * modo que se sale de su columna y pisa la siguiente. Mojibake y descuadre son
 * el mismo bug, y era el motivo de que esta función existiera.
 *
 * Para todo lo demás, `pdfStr`.
 */
export function pdfStrLatin1(s: string): string {
  return s
    // Superscripts sin hueco en WinAnsi (² y ³ SÍ lo tienen: se preservan)
    .replace(/⁴/g, '^4')
    .replace(/⁶/g, '^6')
    // Subscripts
    .replace(/₀/g, '0')
    .replace(/₁/g, '1')
    .replace(/₂/g, '2')
    .replace(/₃/g, '3')
    .replace(/₄/g, '4')
    .replace(/₅/g, '5')
    // Greek uppercase — must come before lowercase to avoid double-replace
    .replace(/Φ/g, 'Phi')
    .replace(/Σ/g, 'Sum')
    .replace(/Δ/g, 'Delta')
    // Ω: amortiguamiento en % de la NCSE-02 (art. 2.5). Sin este mapeo caía en
    // el catch-all y el PDF de sismo imprimía «? = 5,0 %» — un dato normativo
    // convertido en interrogante, que es peor que no imprimirlo.
    .replace(/Ω/g, 'Omega')
    // Greek lowercase — lambda-bar (λ + combining macron) before plain λ
    .replace(/λ̄/g, 'lam')
    .replace(/λ/g, 'lam')
    .replace(/χ/g, 'chi')
    .replace(/σ/g, 'sigma')
    .replace(/γ/g, 'g')
    .replace(/φ/g, 'phi')
    .replace(/η/g, 'eta')
    .replace(/ζ/g, 'zeta')
    .replace(/δ/g, 'd')
    .replace(/β/g, 'beta')
    .replace(/τ/g, 't')
    .replace(/θ/g, 'th')
    .replace(/ε/g, 'eps')
    .replace(/ρ/g, 'rho')
    .replace(/α/g, 'alpha')
    .replace(/ψ/g, 'psi')
    .replace(/κ/g, 'k')
    .replace(/π/g, 'pi')
    .replace(/ν/g, 'nu')
    .replace(/μ/g, '\xB5')  // mu griega -> signo micro (Latin-1, mismo glifo)
    // Other symbols
    .replace(/≤/g, '<=')
    .replace(/≥/g, '>=')
    .replace(/≠/g, '!=')
    .replace(/≈/g, '~=')
    .replace(/√/g, 'sqrt')
    .replace(/∞/g, 'inf')
    .replace(/'/g, "'")
    .replace(/→/g, '->')    // sin hueco en WinAnsi
    .replace(/⇒/g, '=>')
    .replace(/−/g, '-')     // minus U+2212 (no es el guion ASCII)
    // Estos SÍ tienen hueco en WinAnsi: jsPDF los emite como UN byte y el visor
    // pinta el glifo real. Sin el mapeo caían en el catch-all -> '?'.
    .replace(/‰/g, '\x89')  // perthousand
    .replace(/•/g, '\x95')  // bullet
    .replace(/…/g, '\x85')  // ellipsis
    // Dashes
    .replace(/—/g, ' - ')   // em dash —
    .replace(/–/g, '-')     // en dash –
    // Catch-all: strip any remaining non-Latin-1 character. The NUL bound
    // is intentional — Latin-1 spans U+0000..U+00FF and we keep the whole
    // range (control codes included) for any rare embedded \n or \t.
    //
    // NOTA: `² ³ · ° Ø µ` NO se tocan. Son Latin-1 (0xB2 0xB3 0xB7 0xB0 0xD8
    // 0xB5) y jsPDF declara /WinAnsiEncoding, así que se pintan tal cual. Antes
    // se degradaban a `2 ^3 x deg ph` — de ahí el feo "ph16" en los despieces.
    // eslint-disable-next-line no-control-regex
    .replace(/[^\u0000-\u00FF]/g, '?');
}

/** Result returned by all PDF export functions for preview modal. */
export interface PdfResult {
  blobUrl: string;
  filename: string;
  pageCount: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Element-title → filename slug (shared by every module + the TitlePromptModal).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * El nombre del fichero descargado ya no es cosa del PDF: el capítulo Memorias
 * entrega Word, y detrás vienen Excel y DXF. `slugTitle` y `titledFilename`
 * viven ahora en `src/lib/export/filename.ts`, neutro respecto al formato. Se
 * re-exportan desde aquí para no tocar los 71 puntos de llamada existentes.
 */
export { slugTitle, titledFilename } from '../export/filename';

/**
 * Truncate `text` (already sanitized with pdfStr) to `maxW` mm by the MEASURED
 * width of the current font (not by character count), appending an ellipsis.
 * The caller must set font/size before calling (getTextWidth depends on them).
 */
export function truncateToWidth(doc: jsPDF, text: string, maxW: number): string {
  if (doc.getTextWidth(text) <= maxW) return text;
  let t = text;
  while (t.length > 1 && doc.getTextWidth(t + '...') > maxW) t = t.slice(0, -1);
  return t.replace(/\s+$/, '') + '...';
}

/**
 * Draw the identification heading for a bespoke (non-`drawHeader`) module and
 * return the `y` of the last title line written (the caller continues with the
 * date line below). Shared by every module's PDF exporter so the element-title
 * treatment is identical across the app.
 *
 *   - With a title: the element name is the H1 (bold 14) and `moduleTitle`
 *     becomes a gray subtitle underneath; returns `m + 5.5`.
 *   - Empty title: `moduleTitle` is the H1 (bold 13) — the historical header —
 *     and returns `m` unchanged, so the page is byte-identical to pre-feature.
 *
 * The H1 shifts subsequent content, so the caller must thread the returned `y`
 * instead of hardcoding `m + N` offsets.
 */
export function drawElementTitle(doc: jsPDF, title: string, moduleTitle: string, m: number): number {
  const clean = title.trim();
  if (clean) {
    // Metadatos /Title: los visores (Chrome, Acrobat) rotulan la pestaña con
    // esto en vez de con el UUID del blob. Sólo con título, para no alterar el
    // Info dict — y por tanto los bytes — del caso sin título.
    doc.setProperties({ title: clean, creator: 'Concreta' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    setGray(doc, 20);
    doc.text(truncateToWidth(doc, pdfStr(clean), PAGE_W - 2 * m), m, m);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    setGray(doc, 110);
    doc.text(pdfStr(moduleTitle), m, m + 5.5);
    return m + 5.5;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  setGray(doc, 30);
  doc.text(pdfStr(moduleTitle), m, m);
  return m;
}

/** Standard check status labels (Spanish). */
export const STATUS_LABEL: Record<string, string> = {
  ok:      'CUMPLE',
  warn:    'ADVERTENCIA',
  fail:    'INCUMPLE',
  neutral: 'N/A',
};

// ─────────────────────────────────────────────────────────────────────────────
// Pagination & layout helpers (extracted in this commit — used by masonryWalls
// rebuild and migration of isolatedFooting/pileCap latent bugs).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reserved bottom space in mm under each page for the footer band.
 * `ensureSpace` and `drawTable` keep content above PAGE_H − M − FOOTER_RESERVE.
 */
export const FOOTER_RESERVE = 10;

/**
 * Predictive page break.
 *
 * If `currentY + requiredH` would land in the footer area, adds a new page,
 * runs `onNewPage` (typically to redraw a repeated header), and returns the
 * new y. Otherwise returns `currentY` unchanged.
 *
 * Replaces the reactive "if (rowY > X) addPage()" pattern that risks splitting
 * rows mid-draw, overlapping the footer, or silently dropping content. The
 * caller computes the height needed for the next atomic unit (a table row,
 * a header band, a paragraph block) BEFORE drawing it.
 *
 * @param doc        jsPDF instance.
 * @param currentY   Current y cursor in mm.
 * @param requiredH  Vertical space needed for the next atomic block.
 * @param M          Module margin in mm (same constant the caller uses).
 * @param onNewPage  Optional callback after addPage. Receives the start-of-page
 *                   y (M + 10) and returns the y to continue from. Use this to
 *                   redraw a table header on continuation pages.
 */
export function ensureSpace(
  doc: jsPDF,
  currentY: number,
  requiredH: number,
  M: number,
  onNewPage?: (newY: number) => number,
): number {
  const maxY = PAGE_H - M - FOOTER_RESERVE;
  if (currentY + requiredH <= maxY) return currentY;
  doc.addPage();
  const startY = M + 10;
  return onNewPage ? onNewPage(startY) : startY;
}

/**
 * Column definition for `drawTable`. Width is in mm; align defaults to left.
 * `render` lets the caller format the cell value (e.g. formatQuantity, %, etc.)
 * — without it the cell prints `String(row[key])`.
 */
export interface TableCol<R> {
  key: string;
  label: string;
  w: number;
  align?: 'left' | 'right' | 'center';
  render?: (row: R) => string;
  /** Optional per-cell text color override (0–255 gray). */
  color?: (row: R) => number;
  /** Optional per-cell bold flag. */
  bold?: (row: R) => boolean;
  /**
   * Wrap the cell text into multiple lines inside the column width
   * (splitTextToSize); the row grows vertically to fit the tallest cell.
   * Without it, overflowing text is TRUNCATED with an ellipsis to the column
   * width — a cell can never invade its neighbour.
   */
  wrap?: boolean;
}

export interface DrawTableOpts<R> {
  /** X origin of the table (left edge of first column). */
  x: number;
  /** Y origin (top of header row). */
  y: number;
  cols: TableCol<R>[];
  rows: R[];
  M: number;
  /** Redraw header on each continuation page. Default true. */
  headerRepeat?: boolean;
  /** Alternating row background fill. Default true. */
  zebra?: boolean;
  /** Row height (cell) in mm. Default 5. */
  rowH?: number;
  /**
   * Header band height in mm. Default 5. Es la altura de UNA línea: si algún
   * rótulo no cabe en su columna, la banda crece sola para alojarlo.
   */
  headerH?: number;
  /** Header font size. Default 7.5. */
  headerFontSize?: number;
  /** Cell font size. Default 7.5. */
  cellFontSize?: number;
  /** Inner cell padding-left in mm (right-aligned cells use right padding). Default 1.5. */
  pad?: number;
  /**
   * Filas que no pueden quedarse SOLAS a un lado de un salto de página. Con 0
   * (el defecto, y lo que hacen los veintiún módulos que dimensionan su tabla a
   * mano) la paginación es fila a fila: la tabla se corta donde se acabe la
   * página, aunque eso deje dos filas al pie y una en la siguiente.
   *
   * Con un valor > 0 se añaden tres reglas de tipógrafo, en este orden:
   *
   *   1. una tabla que quepa ENTERA en una página no se parte nunca: si no cabe
   *      en lo que queda de ésta, empieza en la siguiente;
   *   2. si hay que partirla, la banda de cabecera exige sitio para tantas
   *      filas como diga esta opción, no para una sola;
   *   3. las últimas filas viajan juntas: la última fila no se queda huérfana
   *      al principio de una página.
   *
   * Lo usa `pdf/bloques.ts` (cuadros de materiales y de cargas), donde las
   * tablas son cortas y una partida en dos es siempre un error de maquetación.
   */
  keepTogether?: number;
}

/** Interlínea real de jsPDF: fontSize (pt) × lineHeightFactor (1.15) → mm. */
const PT2MM = 25.4 / 72;

/** Una celda ya medida: su texto repartido en líneas y cómo se dibuja. */
interface CeldaMedida<R> {
  col: TableCol<R>;
  lines: string[];
  bold: boolean;
  colorG: number;
}

/** Una tabla medida entera antes de dibujar un solo trazo. */
interface TablaMedida<R> {
  /** Alto de la banda de cabecera, con sus rótulos ya repartidos en líneas. */
  bandaH: number;
  /** Banda + el hueco que la separa de la primera fila. */
  altoCabecera: number;
  rotulos: string[][];
  filas: { cells: CeldaMedida<R>[]; rH: number }[];
  /** Cabecera + todas las filas: lo que ocuparía dibujada de una vez. */
  altoTotal: number;
}

/**
 * Mide una tabla SIN dibujarla: reparte los rótulos y las celdas `wrap` en
 * líneas, trunca las demás y suma los altos. `drawTable` la usa para paginar
 * con la tabla entera a la vista, y `pdf/bloques.ts` para saber si un
 * encabezado y su tabla caben juntos antes de escribir el encabezado.
 *
 * Mide con la fuente que se va a dibujar, y por eso la fija celda a celda: el
 * ancho de «HA-30/B/20/XC2» no es el mismo en negrita que en redonda.
 */
export function measureTable<R>(doc: jsPDF, opts: DrawTableOpts<R>): TablaMedida<R> {
  const {
    cols, rows, rowH = 5, headerH = 5, headerFontSize = 7.5, cellFontSize = 7.5, pad = 1.5,
  } = opts;
  const lineH = cellFontSize * 1.15 * PT2MM;
  const lineHCab = headerFontSize * 1.15 * PT2MM;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(headerFontSize);
  const rotulos = cols.map((col) => doc.splitTextToSize(pdfStr(col.label), col.w - 2 * pad) as string[]);
  const nLineasCab = rotulos.reduce((mx, l) => Math.max(mx, l.length), 1);
  const bandaH = headerH + (nLineasCab - 1) * lineHCab;

  const filas = rows.map((row) => {
    const cells = cols.map((col): CeldaMedida<R> => {
      const raw = col.render ? col.render(row) : String((row as Record<string, unknown>)[col.key] ?? '');
      const text = pdfStr(raw);
      const bold = !!(col.bold && col.bold(row));
      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      doc.setFontSize(cellFontSize);
      const lines = col.wrap
        ? (doc.splitTextToSize(text, col.w - 2 * pad) as string[])
        : [truncateToWidth(doc, text, col.w - pad)];
      return { col, lines, bold, colorG: col.color ? col.color(row) : 80 };
    });
    const nLines = cells.reduce((mx, c) => Math.max(mx, c.lines.length), 1);
    return { cells, rH: rowH + (nLines - 1) * lineH };
  });

  const altoCabecera = bandaH + 4;
  return {
    bandaH,
    altoCabecera,
    rotulos,
    filas,
    altoTotal: altoCabecera + filas.reduce((s, f) => s + f.rH, 0),
  };
}

/**
 * Draw a table with atomic-row pagination.
 *
 * Each row is drawn only if it fits in the remaining page space. Otherwise the
 * row triggers a page break (via `ensureSpace`) and the header band is
 * re-drawn on the continuation page (when `headerRepeat`).
 *
 * The header band itself is also protected: if it would not fit together with
 * the first data row, the whole table starts on the next page — no orphan
 * header stranded at the bottom of a page. Con `keepTogether` la protección va
 * más lejos y alcanza a la tabla entera — ver esa opción.
 *
 * Cells are MEASURED before drawing: `wrap` columns split into several lines
 * (the row grows to the tallest cell); the rest are truncated with an ellipsis
 * to their column width, so no cell can ever overlap its neighbour. Los
 * RÓTULOS de la cabecera también se miden y se reparten en líneas, y la banda
 * crece con ellos.
 *
 * Returns the y coordinate just below the last drawn row (caller advances).
 */
export function drawTable<R>(doc: jsPDF, opts: DrawTableOpts<R>): number {
  const {
    x,
    cols,
    M,
    headerRepeat = true,
    zebra = true,
    rowH = 5,
    headerH = 5,
    headerFontSize = 7.5,
    cellFontSize = 7.5,
    pad = 1.5,
    keepTogether = 0,
  } = opts;
  let y = opts.y;

  const totalW = cols.reduce((s, c) => s + c.w, 0);

  // La tabla se mide ENTERA antes de dibujar un solo trazo: los rótulos y las
  // celdas con `wrap` repartidos en líneas, las demás truncadas, y el alto de
  // cada fila. Sin medir los rótulos, uno más ancho que su columna se dibujaba
  // entero y se comía al de al lado («Elemento estructuraTipo de acero…») y el
  // último se salía de la página; sin medir las filas no hay forma de saber si
  // la tabla cabe entera, que es lo que necesita `keepTogether`. Con rótulos de
  // una sola línea —el caso de los 20 módulos que dimensionan sus columnas a
  // mano— esto no cambia ni un milímetro.
  const medida = measureTable(doc, opts);
  const { bandaH, rotulos, filas: medidas } = medida;

  const drawHeaderRow = (atY: number): number => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(headerFontSize);
    setGray(doc, 60);
    let cx = x;
    cols.forEach((col, j) => {
      // Alineadas por ARRIBA: con rótulos de distinto número de líneas, alinear
      // por la base dejaría unos flotando y otros pegados al subrayado.
      const base = atY + headerH - 1.5;
      if (col.align === 'right') {
        doc.text(rotulos[j], cx + col.w - pad, base, { align: 'right' });
      } else if (col.align === 'center') {
        doc.text(rotulos[j], cx + col.w / 2, base, { align: 'center' });
      } else {
        doc.text(rotulos[j], cx + pad, base);
      }
      cx += col.w;
    });
    // Header underline. The "+ 4" gap before returning the next y leaves
    // room for the first data row's text — fontSize ~7 extends ~2 mm above
    // the baseline, so a 1 mm gap (the previous value) made the underline
    // run through the top of the first data row's text.
    setGray(doc, 160);
    doc.setLineWidth(0.2);
    doc.line(x, atY + bandaH, x + totalW, atY + bandaH);
    return atY + bandaH + 4;
  };

  // Lo que cabe en una página vacía: `ensureSpace` arranca las páginas nuevas
  // en M + 10 y ninguna baja del suelo del pie.
  const suelo = PAGE_H - M - FOOTER_RESERVE;
  const altoPagina = suelo - (M + 10);
  /** Lo que se exige sin llegar a pedir más de lo que cabe en una página. */
  const exigir = (h: number) => ensureSpace(doc, y, Math.min(h, altoPagina), M);

  // La cabecera nunca queda huérfana al fondo de página: si no cabe junto con
  // la primera fila de datos, la tabla entera arranca en la página siguiente.
  if (keepTogether <= 0) {
    y = exigir(bandaH + 4 + rowH);
  } else if (y + medida.altoTotal > suelo && medida.altoTotal <= altoPagina) {
    // Regla 1: la tabla que cabe entera en una página no se parte NUNCA. Una de
    // tres filas cortada en dos y tres no es una tabla larga, es un error de
    // maquetación: se va entera a la página siguiente.
    doc.addPage();
    y = M + 10;
  } else {
    // Regla 2: si de verdad hay que partirla, la cabecera arranca acompañada.
    y = exigir(medida.altoCabecera + medidas.slice(0, keepTogether).reduce((s, f) => s + f.rH, 0));
  }
  y = drawHeaderRow(y);

  for (let i = 0; i < medidas.length; i++) {
    const { cells, rH } = medidas[i];

    // Regla 3: las últimas filas viajan juntas. Sin esto, una tabla que SÍ hay
    // que partir puede dejar su última fila sola al principio de la página
    // siguiente — una viuda, con la cabecera repetida encima para ella sola.
    const quedan = medidas.length - i;
    const necesita =
      keepTogether > 0 && quedan > 1 && quedan <= keepTogether
        ? medidas.slice(i).reduce((s, f) => s + f.rH, 0)
        : rH;

    // Atomic row: ensure rH fits, else page break + repeat header.
    y = ensureSpace(doc, y, Math.min(necesita, altoPagina), M, headerRepeat ? (newY) => drawHeaderRow(newY) : undefined);

    if (zebra && i % 2 === 1) {
      doc.setFillColor(248, 250, 252); // slate-50 — barely visible on print
      doc.rect(x, y - rowH + 1.5, totalW, rH, 'F');
    }

    let cx = x;
    for (const c of cells) {
      setGray(doc, c.colorG);
      doc.setFont('helvetica', c.bold ? 'bold' : 'normal');
      doc.setFontSize(cellFontSize);
      if (c.col.align === 'right') {
        doc.text(c.lines, cx + c.col.w - pad, y, { align: 'right' });
      } else if (c.col.align === 'center') {
        doc.text(c.lines, cx + c.col.w / 2, y, { align: 'center' });
      } else {
        doc.text(c.lines, cx + pad, y);
      }
      cx += c.col.w;
    }
    y += rH;
  }

  return y;
}

// ─────────────────────────────────────────────────────────────────────────────
// Header / Footer helpers (legal-safe — engine version on EVERY page).
// ─────────────────────────────────────────────────────────────────────────────

export interface PdfHeaderMeta {
  /** Main title line, e.g. "Concreta - Muros de fabrica - DB-SE-F". */
  title: string;
  /**
   * Optional element name ("Muro 1", "Talud acceso norte"). When present it
   * becomes the H1 and `title` drops to a gray subtitle; when empty the header
   * is byte-identical to before. Same treatment as `drawElementTitle` for the
   * bespoke-header modules.
   */
  elementTitle?: string;
  /** Generation timestamp. Default `new Date()`. */
  generatedAt?: Date;
  /** Calculation engine version, e.g. "2.0.0". Renders on cover header AND on every footer (see drawFootersAllPages). */
  engineVersion?: string;
  /** Optional 8-char fingerprint of the inputs (see inputsFingerprint). */
  inputsHash?: string;
  /** Optional project metadata. Empty fields render as "Sin especificar". */
  proyecto?: string;
  expediente?: string;
  autor?: string;
  fechaProyecto?: string;
}

/**
 * Draw the cover-page header band (title, generation date, engine version,
 * inputs fingerprint, and project metadata row). Returns the y coordinate
 * where document content can start drawing.
 *
 * Renders only on the current page — the per-page footer (with engine version
 * on every page) is handled by `drawFootersAllPages` in `finalize`.
 */
export function drawHeader(
  doc: jsPDF,
  meta: PdfHeaderMeta,
  M: number,
): { contentY: number } {
  const generatedAt = meta.generatedAt ?? new Date();
  const dateStr = generatedAt.toLocaleDateString('es-ES');

  // Title row. With an element title it becomes the H1 (bold 14) and the module
  // descriptor (meta.title) drops to a gray subtitle, shifting the rest of the
  // band down by `dy`. Empty element title ⇒ dy=0 ⇒ historical layout unchanged.
  const elementTitle = meta.elementTitle?.trim();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  setGray(doc, elementTitle ? 20 : 30);
  doc.text(pdfStr(elementTitle || meta.title), M, M);
  let dy = 0;
  if (elementTitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    setGray(doc, 110);
    doc.text(pdfStr(meta.title), M, M + 5.5);
    dy = 5.5;
  }

  // Right-aligned engine version + fingerprint on the H1 line
  if (meta.engineVersion || meta.inputsHash) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    setGray(doc, 150);
    const parts: string[] = [];
    if (meta.engineVersion) parts.push(`Motor v${meta.engineVersion}`);
    if (meta.inputsHash) parts.push(`Inputs ${meta.inputsHash}`);
    doc.text(parts.join('  ·  '), PAGE_W - M, M, { align: 'right' });
  }

  // Date line (under title, left)
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  setGray(doc, 120);
  doc.text(`Generado: ${dateStr}`, M, M + 5 + dy);

  // Project metadata row — render even when empty fields ("Sin especificar")
  // so the absence is visible and the inspector knows the document is missing
  // identification.
  const hasMetadata =
    meta.proyecto !== undefined ||
    meta.expediente !== undefined ||
    meta.autor !== undefined ||
    meta.fechaProyecto !== undefined;
  let bandBottom = M + 8 + dy;
  if (hasMetadata) {
    const SIN = 'Sin especificar';
    doc.setFontSize(8);
    setGray(doc, 90);
    const colA = M;
    const colB = M + (PAGE_W - 2 * M) / 3;
    const colC = M + 2 * (PAGE_W - 2 * M) / 3;
    const labelY = M + 10 + dy;
    const valY = M + 14 + dy;
    doc.setFont('helvetica', 'bold');
    setGray(doc, 100);
    doc.setFontSize(7);
    doc.text('PROYECTO', colA, labelY);
    doc.text('EXPEDIENTE', colB, labelY);
    doc.text('AUTOR', colC, labelY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    setGray(doc, 50);
    doc.text(pdfStr(meta.proyecto || SIN), colA, valY);
    doc.text(pdfStr(meta.expediente || SIN), colB, valY);
    doc.text(pdfStr(meta.autor || SIN), colC, valY);
    if (meta.fechaProyecto) {
      doc.setFontSize(7);
      setGray(doc, 120);
      doc.text(`Fecha proyecto: ${pdfStr(meta.fechaProyecto)}`, M, valY + 4);
      bandBottom = valY + 6;
    } else {
      bandBottom = valY + 2;
    }
  }

  // Separator line under header band
  doc.setLineWidth(0.3);
  setGray(doc, 200);
  doc.line(M, bandBottom, PAGE_W - M, bandBottom);

  return { contentY: bandBottom + 4 };
}

export interface PdfFooterMeta {
  /** Left text, default 'Concreta'. */
  leftText?: string;
  /** Engine version — printed on EVERY footer for legal traceability. */
  engineVersion?: string;
  /** Project name — printed on every footer when present. */
  proyecto?: string;
}

/**
 * Draw the footer band on EVERY page of the document.
 *
 * Footer pattern: `<leftText> · <proyecto?>` left,  `Motor v<X>  ·  pag. i/N` right.
 *
 * This is the LEGAL-INVARIANT footer (I1): a reviewer can print any single
 * page in isolation and still verify the engine version, project, and page
 * position. Call once from `finalize`, after all pages are rendered.
 */
export function drawFootersAllPages(
  doc: jsPDF,
  meta: PdfFooterMeta,
  M: number,
): void {
  const leftText = meta.leftText ?? 'Concreta';
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    setGray(doc, 140);
    const left = meta.proyecto
      ? `${leftText}  ·  ${pdfStr(meta.proyecto)}`
      : leftText;
    doc.text(left, M, PAGE_H - 8);
    const rightParts: string[] = [];
    if (meta.engineVersion) rightParts.push(`Motor v${meta.engineVersion}`);
    rightParts.push(`pag. ${i}/${pageCount}`);
    doc.text(rightParts.join('  ·  '), PAGE_W - M, PAGE_H - 8, { align: 'right' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Inputs fingerprint — provenance for signed PDFs.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Stable 32-bit FNV-1a fingerprint of any JSON-serializable value. Returns
 * 8 lowercase hex chars. Used on legal PDFs as proof that two exports share
 * the same input set (e.g. "did the engineer re-export the same case?").
 *
 * NOT a cryptographic hash. Collisions are vanishingly rare for engineering
 * state but theoretically possible for adversarial input. We use FNV-1a (sync,
 * zero-deps, browser-native) instead of SubtleCrypto (async + polyfill needed
 * in jsdom) because the use case is provenance, not security.
 *
 * Keys are sorted recursively so logically-identical states with different
 * insertion order produce the same fingerprint.
 */
export function inputsFingerprint(value: unknown): string {
  const json = canonicalStringify(value);
  // FNV-1a 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) {
    h ^= json.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // Force unsigned, pad to 8 hex chars
  return (h >>> 0).toString(16).padStart(8, '0');
}

function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalStringify).join(',') + ']';
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalStringify(obj[k])).join(',') + '}';
}

// ─────────────────────────────────────────────────────────────────────────────
// SVG → PNG embed (Acrobat-safe)
// ─────────────────────────────────────────────────────────────────────────────
//
// svg2pdf.js@2.7 traduce los degradados (linearGradient + stop-opacity) y la
// opacidad de grupo de nuestros SVG a diccionarios de shading/pattern y
// soft-mask (ExtGState) que PDF.js tolera pero Acrobat rechaza ("Hay un error
// en esta página"). Imprimir a la impresora "Adobe PDF" desde Chrome re-parsea
// el stream y falla igual.
//
// Solución: rasterizar el SVG a PNG en un canvas y meterlo como imagen
// (XObject) con addImage — un PNG lo lee CUALQUIER visor. Pierde nitidez
// vectorial (es un diagrama pequeño; a 3x apenas se nota) a cambio de
// compatibilidad total. Misma firma async que svg2pdf para sustitución directa.

const SVG_RASTER_SCALE = 3;            // sobre-muestreo para nitidez
const PX_PER_MM = 96 / 25.4;           // 96 dpi

interface EmbedBox { x: number; y: number; width: number; height: number; }

/**
 * Rasteriza `svgEl` a PNG y lo incrusta en `doc` dentro de la caja (mm) dada.
 * Devuelve true si se incrustó, false si falló (el llamador continúa sin
 * diagrama — un PDF sin la figura es mejor que un PDF que Acrobat no abre).
 *
 * Debe ejecutarse en navegador (usa Image/canvas); en jsdom los módulos ya
 * saltan el embed porque el elemento SVG no existe en el DOM de test.
 */
export async function embedSvgAsImage(
  doc: jsPDF,
  svgEl: SVGSVGElement,
  box: EmbedBox,
): Promise<boolean> {
  try {
    // Clon para no mutar el SVG vivo; xmlns explícito para que el data-URL
    // renderice fuera del DOM.
    const clone = svgEl.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const pxW = Math.max(1, Math.round(box.width * PX_PER_MM * SVG_RASTER_SCALE));
    const pxH = Math.max(1, Math.round(box.height * PX_PER_MM * SVG_RASTER_SCALE));
    // width/height explícitos en px: con viewBox presente, el navegador escala
    // el contenido a esta caja (preserveAspectRatio por defecto).
    clone.setAttribute('width', String(pxW));
    clone.setAttribute('height', String(pxH));

    const svgText = new XMLSerializer().serializeToString(clone);
    const svgUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgText);

    const img = new Image();
    img.width = pxW;
    img.height = pxH;
    img.src = svgUrl;
    // decode() resuelve cuando la imagen está lista para dibujar; fallback a
    // onload por si decode no está disponible.
    if (typeof img.decode === 'function') {
      await img.decode();
    } else {
      await new Promise<void>((res, rej) => {
        img.onload = () => res();
        img.onerror = () => rej(new Error('svg image load failed'));
      });
    }

    const canvas = document.createElement('canvas');
    canvas.width = pxW;
    canvas.height = pxH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    ctx.drawImage(img, 0, 0, pxW, pxH);
    const png = canvas.toDataURL('image/png');

    doc.addImage(png, 'PNG', box.x, box.y, box.width, box.height);
    return true;
  } catch {
    return false;
  }
}
