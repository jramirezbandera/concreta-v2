// Shared utilities for all Concreta PDF modules.
// jsPDF helpers — imported by every src/lib/pdf/*.ts export function.
//
// Page margins (M) are passed as parameter on every helper because they vary
// per module (15/18/20 mm). Do not export a default — modules choose.

import type jsPDF from 'jspdf';

export const PAGE_W = 210;  // A4 width mm (portrait)
export const PAGE_H = 297;  // A4 height mm (portrait)

/** Set both text and draw color to a gray value (0=black, 255=white). */
export function setGray(doc: jsPDF, g: number): void {
  doc.setTextColor(g, g, g);
  doc.setDrawColor(g, g, g);
}

/**
 * Sanitize a string for jsPDF Helvetica (WinAnsi / Latin-1 encoding).
 * Replaces known Unicode symbols with ASCII approximations,
 * then strips any remaining non-Latin-1 characters.
 *
 * Covers all symbols used across Concreta modules:
 *   Greek lowercase: λ χ σ τ γ φ η δ β θ ε
 *   Greek uppercase: Φ Σ Δ (used in formulas for masonry / fem / steel)
 *   Super/subscripts: ⁴ ³ ² ₁ ₂
 *   Math / punctuation: √ · ≤ ≥ ° Ø ' — –
 */
export function pdfStr(s: string): string {
  return s
    // Superscripts
    .replace(/⁴/g, '^4')
    .replace(/³/g, '^3')
    .replace(/²/g, '2')
    // Subscripts
    .replace(/₁/g, '1')
    .replace(/₂/g, '2')
    // Greek uppercase — must come before lowercase to avoid double-replace
    .replace(/Φ/g, 'Phi')
    .replace(/Σ/g, 'Sum')
    .replace(/Δ/g, 'Delta')
    // Greek lowercase — lambda-bar (λ + combining macron) before plain λ
    .replace(/λ̄/g, 'lam')
    .replace(/λ/g, 'lam')
    .replace(/χ/g, 'chi')
    .replace(/σ/g, 'sigma')
    .replace(/γ/g, 'g')
    .replace(/φ/g, 'phi')
    .replace(/η/g, 'eta')
    .replace(/δ/g, 'd')
    .replace(/β/g, 'beta')
    .replace(/τ/g, 't')
    .replace(/θ/g, 'th')
    .replace(/ε/g, 'eps')
    // Other symbols
    .replace(/≤/g, '<=')
    .replace(/≥/g, '>=')
    .replace(/√/g, 'sqrt')
    .replace(/·/g, 'x')
    .replace(/°/g, 'deg')
    .replace(/Ø/g, 'ph')
    .replace(/'/g, "'")
    // Dashes
    .replace(/—/g, ' - ')   // em dash —
    .replace(/–/g, '-')     // en dash –
    // Catch-all: strip any remaining non-Latin-1 character. The NUL bound
    // is intentional — Latin-1 spans U+0000..U+00FF and we keep the whole
    // range (control codes included) for any rare embedded \n or \t.
    // eslint-disable-next-line no-control-regex
    .replace(/[^\u0000-\u00FF]/g, '?');
}

/** Result returned by all PDF export functions for preview modal. */
export interface PdfResult {
  blobUrl: string;
  filename: string;
  pageCount: number;
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
  /** Header band height in mm. Default 5. */
  headerH?: number;
  /** Header font size. Default 7.5. */
  headerFontSize?: number;
  /** Cell font size. Default 7.5. */
  cellFontSize?: number;
  /** Inner cell padding-left in mm (right-aligned cells use right padding). Default 1.5. */
  pad?: number;
}

/**
 * Draw a table with atomic-row pagination.
 *
 * Each row is drawn only if it fits in the remaining page space. Otherwise the
 * row triggers a page break (via `ensureSpace`) and the header band is
 * re-drawn on the continuation page (when `headerRepeat`).
 *
 * Returns the y coordinate just below the last drawn row (caller advances).
 */
export function drawTable<R>(doc: jsPDF, opts: DrawTableOpts<R>): number {
  const {
    x,
    cols,
    rows,
    M,
    headerRepeat = true,
    zebra = true,
    rowH = 5,
    headerH = 5,
    headerFontSize = 7.5,
    cellFontSize = 7.5,
    pad = 1.5,
  } = opts;
  let y = opts.y;

  const totalW = cols.reduce((s, c) => s + c.w, 0);

  const drawHeaderRow = (atY: number): number => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(headerFontSize);
    setGray(doc, 60);
    let cx = x;
    for (const col of cols) {
      const label = pdfStr(col.label);
      if (col.align === 'right') {
        doc.text(label, cx + col.w - pad, atY + headerH - 1.5, { align: 'right' });
      } else if (col.align === 'center') {
        doc.text(label, cx + col.w / 2, atY + headerH - 1.5, { align: 'center' });
      } else {
        doc.text(label, cx + pad, atY + headerH - 1.5);
      }
      cx += col.w;
    }
    // Header underline. The "+ 4" gap before returning the next y leaves
    // room for the first data row's text — fontSize ~7 extends ~2 mm above
    // the baseline, so a 1 mm gap (the previous value) made the underline
    // run through the top of the first data row's text.
    setGray(doc, 160);
    doc.setLineWidth(0.2);
    doc.line(x, atY + headerH, x + totalW, atY + headerH);
    return atY + headerH + 4;
  };

  y = drawHeaderRow(y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(cellFontSize);

  for (let i = 0; i < rows.length; i++) {
    // Atomic row: ensure rowH fits, else page break + repeat header.
    y = ensureSpace(doc, y, rowH, M, headerRepeat ? (newY) => drawHeaderRow(newY) : undefined);

    const row = rows[i];
    if (zebra && i % 2 === 1) {
      doc.setFillColor(248, 250, 252); // slate-50 — barely visible on print
      doc.rect(x, y - rowH + 1.5, totalW, rowH, 'F');
    }

    let cx = x;
    for (const col of cols) {
      const raw = col.render ? col.render(row) : String((row as Record<string, unknown>)[col.key] ?? '');
      const text = pdfStr(raw);
      const colorG = col.color ? col.color(row) : 80;
      setGray(doc, colorG);
      doc.setFont('helvetica', col.bold && col.bold(row) ? 'bold' : 'normal');
      if (col.align === 'right') {
        doc.text(text, cx + col.w - pad, y, { align: 'right' });
      } else if (col.align === 'center') {
        doc.text(text, cx + col.w / 2, y, { align: 'center' });
      } else {
        doc.text(text, cx + pad, y);
      }
      cx += col.w;
    }
    y += rowH;
  }

  return y;
}

// ─────────────────────────────────────────────────────────────────────────────
// Header / Footer helpers (legal-safe — engine version on EVERY page).
// ─────────────────────────────────────────────────────────────────────────────

export interface PdfHeaderMeta {
  /** Main title line, e.g. "Concreta - Muros de fabrica - DB-SE-F". */
  title: string;
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

  // Title row
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  setGray(doc, 30);
  doc.text(pdfStr(meta.title), M, M);

  // Right-aligned engine version + fingerprint on title line
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
  doc.text(`Generado: ${dateStr}`, M, M + 5);

  // Project metadata row — render even when empty fields ("Sin especificar")
  // so the absence is visible and the inspector knows the document is missing
  // identification.
  const hasMetadata =
    meta.proyecto !== undefined ||
    meta.expediente !== undefined ||
    meta.autor !== undefined ||
    meta.fechaProyecto !== undefined;
  let bandBottom = M + 8;
  if (hasMetadata) {
    const SIN = 'Sin especificar';
    doc.setFontSize(8);
    setGray(doc, 90);
    const colA = M;
    const colB = M + (PAGE_W - 2 * M) / 3;
    const colC = M + 2 * (PAGE_W - 2 * M) / 3;
    const labelY = M + 10;
    const valY = M + 14;
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
