// PDF export for Timber Beams module — EN 1995-1-1 (EC5) + EN 1995-1-2 (fire)
// jsPDF + svg2pdf.js — A4 portrait, margins 20mm, single page.
//
// Layout:
//   1. Header (title + date)
//   2. SVG full-width (170mm × 44mm)
//   3. Inputs — 2 columns side-by-side (85mm each)
//   4. Checks table — 4 columns (Descripción + normativa subscript | Valor | Límite | Ut%)
//   5. ELU/ELS key values
//   6. Footer

import { crearPdf } from './fuente';
import { type TimberBeamInputs } from '../../data/defaults';
import { type TimberBeamResult } from '../../lib/calculations/timberBeams';
import { embedSvgAsImage, ensureSpace, PAGE_W, PAGE_H, setGray, pdfStr, STATUS_LABEL, titledFilename, drawElementTitle, type PdfResult } from './utils';
import { formatQuantity } from '../units/format';
import type { Quantity, UnitSystem } from '../units/types';

const M = 20;
const CONTENT_W = PAGE_W - 2 * M;  // 170mm

const SC_LABEL: Record<number, string> = {
  1: 'SC 1 - Interior seco',
  2: 'SC 2 - Exterior cubierto',
  3: 'SC 3 - Exterior intemperie',
};

const DURATION_LABEL: Record<string, string> = {
  permanent:     'Permanente',
  long:          'Larga duracion',
  medium:        'Media duracion',
  short:         'Corta duracion',
  instantaneous: 'Instantanea',
};

/** Nombre de archivo por defecto cuando el título va vacío. Fuente única
 *  compartida por el exportador y el TitlePromptModal (preview). */
export function timberBeamsFallbackFilename(): string {
  return 'viga-madera.pdf';
}

export async function exportTimberBeamsPDF(
  inp: TimberBeamInputs,
  result: TimberBeamResult,
  system: UnitSystem = 'si',
  title?: string,
): Promise<PdfResult> {
  const elementTitle = title ?? inp.title ?? '';
  const fmtSi = (v: number, q: Quantity, precision = 2) =>
    formatQuantity(v, q, system, { precision });
  const doc = await crearPdf();

  // ── Header ───────────────────────────────────────────────────────────────────
  const titleBaseY = drawElementTitle(doc, elementTitle, 'Concreta - Viga de madera - EC5 EN 1995-1-1 / 1995-1-2', M);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  setGray(doc, 130);
  doc.text(`Generado: ${new Date().toLocaleDateString('es-ES')}`, M, titleBaseY + 5);

  doc.setLineWidth(0.3);
  setGray(doc, 200);
  doc.line(M, titleBaseY + 8, PAGE_W - M, titleBaseY + 8);

  // ── SVG full-width ───────────────────────────────────────────────────────────
  const svgContainer = document.getElementById('timber-beams-svg-pdf');
  const svgEl = svgContainer?.querySelector('svg') as SVGSVGElement | null;

  const SVG_Y  = titleBaseY + 12;
  const SVG_W  = CONTENT_W;                         // 170mm
  const SVG_H  = Math.round(SVG_W * 200 / 760);     // ~44mm (exact aspect of 760×200)

  if (svgEl) {
    await embedSvgAsImage(doc, svgEl, { x: M, y: SVG_Y, width: SVG_W, height: SVG_H });
  }

  // ── Inputs — 2 columns (85mm each) ──────────────────────────────────────────
  const COL_L  = M;                    // left column x
  const COL_R  = M + CONTENT_W / 2;   // right column x = 105mm
  const LH     = 4.5;
  let   ly     = SVG_Y + SVG_H + 5;   // shared y cursor (left side drives height)
  let   ry     = ly;

  const lSecHeader = (label: string) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    setGray(doc, 70);
    doc.text(label, COL_L, ly);
    ly += LH;
    doc.setFont('helvetica', 'normal');
    setGray(doc, 80);
  };

  const rSecHeader = (label: string) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    setGray(doc, 70);
    doc.text(label, COL_R, ry);
    ry += LH;
    doc.setFont('helvetica', 'normal');
    setGray(doc, 80);
  };

  const lRow = (a: string, b = '') => {
    doc.setFontSize(8);
    doc.text(pdfStr(a), COL_L, ly);
    if (b) doc.text(pdfStr(b), COL_L + 40, ly);
    ly += LH;
  };

  const rRow = (a: string, b = '') => {
    doc.setFontSize(8);
    doc.text(pdfStr(a), COL_R, ry);
    if (b) doc.text(pdfStr(b), COL_R + 38, ry);
    ry += LH;
  };

  // Left column: section + geometry + loads + fire
  lSecHeader('SECCION Y CARGAS');
  lRow(`Clase: ${inp.gradeId}`);
  lRow(`b = ${inp.b} mm`, `h = ${inp.h} mm`);
  lRow(`L = ${inp.L} m`);
  lRow(`gk = ${fmtSi(inp.gk, 'linearLoad')}`, `qk = ${fmtSi(inp.qk, 'linearLoad')}`);
  if (inp.P_G + inp.P_Q > 0) {
    lRow(`P_G = ${fmtSi(inp.P_G, 'force')}`, `P_Q = ${fmtSi(inp.P_Q, 'force')}`);
    lRow(`Puntual en a = ${inp.aP} m`, `(del extremo izq.)`);
  }
  ly += 2;

  // ── Reacciones en apoyos ────────────────────────────────────────────────────
  // No son comprobaciones (no llevan estado ni entran en el veredicto): son el
  // dato que hay que bajar al pilar o a la zapata, y por eso va también el
  // desglose característico Gk/Qk — es lo único que esos módulos pueden usar
  // con SUS propias combinaciones.
  //
  // Van en la columna IZQUIERDA, que sobraba ~45 mm de blanco, y no en una banda
  // a ancho completo: esta última empujaba las dos últimas comprobaciones a una
  // segunda página en el caso por defecto, y este informe cabe en una.
  if (result.reactions.length > 0) {
    lSecHeader('REACCIONES EN APOYOS');
    for (const r of result.reactions) {
      lRow(pdfStr(r.label), `Rd = ${fmtSi(r.R_d, 'force')}`);
      lRow(`  Gk = ${fmtSi(r.R_Gk, 'force')}`, `Qk = ${fmtSi(r.R_Qk, 'force')}`);
      if (r.kind === 'fixed') {
        lRow(`  Md = ${fmtSi(r.M_d, 'moment')}`, `Gk ${fmtSi(r.M_Gk, 'moment')} / Qk ${fmtSi(r.M_Qk, 'moment')}`);
      }
    }
    ly += 2;
  }

  if (result.fireActive) {
    lSecHeader('INCENDIO');
    lRow(`R${result.t_fire} - ${inp.exposedFaces} caras expuestas`);
    lRow(`dchar = ${result.dchar.toFixed(1)} mm`, `def = ${result.def.toFixed(1)} mm`);
    lRow(`Secc. residual: ${result.b_ef.toFixed(0)} x ${result.h_ef.toFixed(0)} mm`);
  }

  // Right column: service conditions + material factors
  rSecHeader('CONDICIONES DE USO');
  rRow(SC_LABEL[inp.serviceClass] ?? `SC ${inp.serviceClass}`);
  rRow(pdfStr(DURATION_LABEL[inp.loadDuration] ?? inp.loadDuration));
  ry += 1;
  rSecHeader('FACTORES EC5');
  rRow(`kmod = ${result.kmod.toFixed(2)}`, `kdef = ${result.kdef.toFixed(2)}`);
  rRow(`kh = ${result.kh.toFixed(3)}`, `kcr = ${result.kcr.toFixed(2)}`);
  rRow(`ksys = ${result.ksys.toFixed(2)}`, `gM = ${result.gammaM.toFixed(2)}`);
  rRow(`psi2 = ${result.psi2.toFixed(2)}`);
  ry += 1;
  rSecHeader('ELU / ELS');
  rRow(`MEd = ${fmtSi(result.MEd, 'moment')}`, `VEd = ${fmtSi(result.VEd, 'force')}`);
  rRow(`lam_rel = ${result.lambda_rel_m.toFixed(3)}`, `kcrit = ${result.kcrit.toFixed(3)}`);
  rRow(`u_act (integridad) = ${result.u_active.toFixed(1)} mm <= ${result.u_active_lim.toFixed(1)}`);
  rRow(`u_Q (confort) = ${result.u_confort.toFixed(1)} mm <= ${result.u_confort_lim.toFixed(1)} (L/350)`);
  rRow(`u_fin (apariencia) = ${result.u_fin.toFixed(1)} mm <= ${result.u_fin_lim.toFixed(1)} (L/300)`);

  // ── Checks table ─────────────────────────────────────────────────────────────
  // Start below whichever column ended lower. `ensureSpace` reserva cabecera +
  // primera fila para que no quede huérfana al pie de página.
  const tableY = ensureSpace(doc, Math.max(ly, ry) + 4, 20, M);

  doc.setLineWidth(0.3);
  setGray(doc, 180);
  doc.line(M, tableY - 2, PAGE_W - M, tableY - 2);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  setGray(doc, 60);
  doc.text('VERIFICACIONES', M, tableY + 3);

  const activeChecks = result.checks.filter(c => !c.neutral);
  const hasFail = activeChecks.some(c => c.status === 'fail');
  const hasWarn = activeChecks.some(c => c.status === 'warn');
  const overall = hasFail ? 'fail' : hasWarn ? 'warn' : 'ok';

  doc.setFontSize(11);
  setGray(doc, 30);
  doc.text(STATUS_LABEL[overall], PAGE_W - M, tableY + 3, { align: 'right' });

  // 4-column layout: Descripción(+normativa subscript) | Valor | Límite | Ut%
  const TC = {
    desc:   M,           // description — 100mm wide
    value:  M + 100,     // valor       — 25mm
    limit:  M + 125,     // límite      — 25mm
    util:   M + 150,     // ut% + state — 20mm
  };

  let rowY = tableY + 9;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  setGray(doc, 100);
  doc.text('Verificacion',      TC.desc,  rowY);
  doc.text('Valor',             TC.value, rowY);
  doc.text('Limite',            TC.limit, rowY);
  doc.text('Ut% / Estado',      TC.util,  rowY);
  rowY += 2;

  doc.setLineWidth(0.2);
  setGray(doc, 160);
  doc.line(M, rowY, PAGE_W - M, rowY);
  rowY += 5;

  const DESC_W = 97;              // ancho útil de la descripción (hasta Valor)
  const NOTE_W = TC.util - M - 3; // fila neutra: se para ANTES de la etiqueta
  const ROW_LH = 3.1;             // interlínea a cuerpo 7.5 (7.5pt·1.15·25.4/72)
  const LH_N = 2.9;               // interlínea a cuerpo 7 (filas neutras)

  for (const ch of result.checks) {
    if (ch.neutral) {
      // Group separator (e.g. "ELU - Estado Límite Último"). La descripción
      // envuelve ANTES de la etiqueta: si un día llega una nota larga (como la
      // de kmod en timberColumns) no se le meterá por debajo.
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      const noteL = doc.splitTextToSize(pdfStr(ch.description), NOTE_W) as string[];
      rowY = ensureSpace(doc, rowY, (noteL.length - 1) * LH_N + 6, M);
      setGray(doc, 70);
      noteL.forEach((t, i) => doc.text(t, TC.desc, rowY + i * LH_N));
      if (ch.tag) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        setGray(doc, 120);
        doc.text(pdfStr(ch.tag), TC.util, rowY);
      }
      const noteEndY = rowY + (noteL.length - 1) * LH_N;
      setGray(doc, 205);
      doc.line(M, noteEndY + 2, PAGE_W - M, noteEndY + 2);
      rowY = noteEndY + 6;
      continue;
    }

    const isFail = ch.status === 'fail';
    const isWarn = ch.status === 'warn';

    // Description — se trocea a mano para saber CUÁNTAS líneas ocupa. Antes iba
    // con `maxWidth: 97` (jsPDF la partía él solo) pero la fila medía 9 mm fijos
    // y el artículo colgaba de `rowY + 3.5`: en cuanto la descripción envolvía,
    // su 2ª línea aterrizaba encima del artículo — y la última, sobre el
    // separador y la fila de abajo.
    doc.setFont('helvetica', isFail || isWarn ? 'bold' : 'normal');
    doc.setFontSize(7.5);
    const descL = doc.splitTextToSize(pdfStr(ch.description), DESC_W) as string[];
    // Alto de fila: (n-1) interlíneas + artículo (3.5) + regla (1.5) + hueco (3.5).
    const rowH = (descL.length - 1) * ROW_LH + 8.5;

    // Antes: `if (rowY > PAGE_H - M - 8) break` — DESCARTABA en silencio las
    // comprobaciones que no cupieran. Ahora saltan a la página siguiente.
    rowY = ensureSpace(doc, rowY, rowH, M);
    const artY = rowY + (descL.length - 1) * ROW_LH + 3.5;   // DESPUÉS del salto

    doc.setFont('helvetica', isFail || isWarn ? 'bold' : 'normal');
    doc.setFontSize(7.5);
    setGray(doc, 55);
    descL.forEach((t, i) => doc.text(t, TC.desc, rowY + i * ROW_LH));

    // Normative ref — bajo la ÚLTIMA línea de la descripción
    if (ch.article) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      setGray(doc, 150);
      doc.text(pdfStr(ch.article), TC.desc, artY, { maxWidth: DESC_W });
    }

    // Valor + Límite
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    setGray(doc, 75);
    doc.text(pdfStr(ch.value), TC.value, rowY, { maxWidth: 23 });
    doc.text(pdfStr(ch.limit), TC.limit, rowY, { maxWidth: 23 });

    // Ut% — bold if failing/warning
    const textG = isFail ? 60 : isWarn ? 80 : 100;
    doc.setFont('helvetica', isFail || isWarn ? 'bold' : 'normal');
    doc.setFontSize(7.5);
    setGray(doc, textG);
    const utText = ch.utilization <= 1
      ? `${(ch.utilization * 100).toFixed(0)}%`
      : STATUS_LABEL[ch.status];
    doc.text(utText, TC.util, rowY);

    setGray(doc, 215);
    doc.line(M, artY + 1.5, PAGE_W - M, artY + 1.5);
    rowY = artY + 5;
  }

  // ── Footer ───────────────────────────────────────────────────────────────────
  // En TODAS las páginas: la tabla ya puede desbordar a una segunda (antes las
  // filas sobrantes se descartaban en silencio, así que el pie siempre caía en
  // la única página y podía rotularse "Pagina 1" a pelo).
  const footerY = PAGE_H - 10;
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    setGray(doc, 150);
    doc.text(
      'Concreta - concreta.app | EC5 EN 1995-1-1 + EN 1995-1-2   gM = 1.30 (aserrada) / 1.25 (laminada)',
      M, footerY,
    );
    doc.text(`Pagina ${p}/${pages}`, PAGE_W - M, footerY, { align: 'right' });
  }

  const filename = titledFilename(elementTitle, timberBeamsFallbackFilename());
  const blob = doc.output('blob');
  const blobUrl = URL.createObjectURL(blob);
  const pageCount = (doc.internal as unknown as { getNumberOfPages(): number }).getNumberOfPages();
  return { blobUrl, filename, pageCount };
}
