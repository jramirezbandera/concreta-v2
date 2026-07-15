// PDF export for Punching module — CE Anejo 19 §6.4 (punzonamiento)
// jsPDF + svg2pdf.js — A4 portrait, margins 20mm, single page.
//
// Layout:
//   1. Header (title + date)
//   2. SVG full-width (170mm × ~55mm)
//   3. Inputs — 2 columns side-by-side
//   4. Checks table — 4 columns (Descripción | Valor | Límite | Ut%)
//   5. Footer

import jsPDF from 'jspdf';
import { type PunchingInputs } from '../../data/defaults';
import { type PunchingResult } from '../../lib/calculations/punching';
import { embedSvgAsImage, ensureSpace, PAGE_W, PAGE_H, setGray, pdfStr, STATUS_LABEL, titledFilename, drawElementTitle, type PdfResult } from './utils';
import { formatQuantity } from '../units/format';
import type { UnitSystem } from '../units/types';

const M = 20;
const CONTENT_W = PAGE_W - 2 * M;  // 170mm

const POSITION_LABEL: Record<string, string> = {
  interior: 'Interior',
  borde:    'Borde',
  esquina:  'Esquina',
};

/** Nombre de archivo por defecto cuando el título va vacío. Fuente única
 *  compartida por el exportador y el TitlePromptModal (preview). */
export function punchingFallbackFilename(): string {
  return 'punzonamiento.pdf';
}

export async function exportPunchingPDF(
  inp: PunchingInputs,
  result: PunchingResult,
  system: UnitSystem = 'si',
  title?: string,
): Promise<PdfResult> {
  const elementTitle = title ?? inp.title ?? '';
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // ── Header ───────────────────────────────────────────────────────────────────
  const titleBaseY = drawElementTitle(doc, elementTitle, 'Concreta - Punzonamiento en losa - CE Anejo 19 §6.4', M);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  setGray(doc, 130);
  doc.text(`Generado: ${new Date().toLocaleDateString('es-ES')}`, M, titleBaseY + 5);

  doc.setLineWidth(0.3);
  setGray(doc, 200);
  doc.line(M, titleBaseY + 8, PAGE_W - M, titleBaseY + 8);

  // ── SVG: single plan view, centred ──────────────────────────────────────────
  const svgContainer = document.getElementById('punching-svg-pdf');
  const svgEls = svgContainer ? Array.from(svgContainer.querySelectorAll('svg')) as SVGSVGElement[] : [];

  const SVG_Y  = titleBaseY + 12;
  const PLAN_H = 85;                         // mm — square plan
  const PLAN_W = PLAN_H;
  const PLAN_X = M + (CONTENT_W - PLAN_W) / 2; // centred

  if (svgEls[0]) {
    await embedSvgAsImage(doc, svgEls[0], { x: PLAN_X, y: SVG_Y, width: PLAN_W, height: PLAN_H });
  }

  // ── Inputs — 2 columns ───────────────────────────────────────────────────────
  const COL_L = M;
  const COL_R = M + CONTENT_W / 2;
  const LH    = 4.5;
  let   ly    = SVG_Y + PLAN_H + 5;
  let   ry    = ly;

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

  const cru = result.cruceta;
  if (cru) {
    // ── Cruceta mode ──────────────────────────────────────────────────────────
    // Left: pilar + placa + cruceta + carga
    lSecHeader('PILAR Y PLACA');
    lRow(`Pilar: ${inp.colType} ${inp.colSize}`, `Pos: ${POSITION_LABEL[inp.position] ?? inp.position}`);
    lRow(`Placa: ${inp.plateA}x${inp.plateB}x${inp.plateT} mm`);
    lRow(`beta = ${cru.beta.toFixed(2)}${inp.betaMode === 'custom' ? ' (personalizado)' : ''}`);
    if (inp.position !== 'interior') {
      const edge = inp.position === 'esquina' ? `ay=${inp.edgeY} ax=${inp.edgeX} mm` : `ay=${inp.edgeY} mm`;
      lRow(`Dist. borde libre: ${edge}`);
    }
    ly += 1;
    lSecHeader('CRUCETA');
    lRow(`Punzonamiento conservador de la PLACA. El reparto de la`);
    lRow(`cruceta (alarga u1) lo verifica el ingeniero a mano.`);
    lRow(`UPN ${cru.upnSize} (${cru.steelGrade}), Clase ${cru.upnClass}`);
    lRow(`M_Rd = ${cru.MRd.toFixed(1)} kN.m`, `Vpl,Rd = ${cru.VplRd.toFixed(0)} kN`);
    lRow(`Garganta a = ${inp.weldThroat} mm`);
    ly += 1;
    lSecHeader('CARGA');
    lRow(`N (axil ELU) = ${formatQuantity(inp.VEd, 'force', system, { precision: 1 })}`);

    // Right: losa + perimetros + resistencias
    rSecHeader('LOSA / ZAPATA');
    rRow(`d = ${inp.d} mm`);
    rRow(`fck = ${inp.fck} N/mm2`, `fyk = ${inp.fyk} N/mm2`);
    rRow(`ph sup: ph${inp.barDiamSup}/${inp.sSup} mm`);
    rRow(`rhoL = ${(result.rhoL * 100).toFixed(3)} %`);
    ry += 1;
    rSecHeader('PERIMETROS CRITICOS (PLACA)');
    rRow(`u0 (placa) = ${cru.u0.toFixed(0)} mm`);
    rRow(`u1 (placa, 2d) = ${cru.u1.toFixed(0)} mm`);
    ry += 1;
    rSecHeader('RESISTENCIAS');
    rRow(`vRd,c = ${formatQuantity(result.vRdc, 'stress', system)}`, `vEd = ${formatQuantity(result.vEd, 'stress', system)}`);
    rRow(`vRd,max = ${formatQuantity(result.vRdmax, 'stress', system)}`, `vEd,0 = ${formatQuantity(result.vEd0, 'stress', system)}`);
    rRow(`u1/vEd: sin reparto de cruceta (conservador)`);
  } else {
    // Left: geometry + loads
    lSecHeader('GEOMETRIA Y CARGAS');
    if (inp.isCircular) {
      lRow(`Soporte circular: D = ${inp.cx} mm`);
    } else {
      lRow(`Soporte: cx = ${inp.cx} mm`, `cy = ${inp.cy} mm`);
    }
    lRow(`Canto eficaz: d = ${inp.d} mm`);
    lRow(`Posicion: ${POSITION_LABEL[inp.position] ?? inp.position}`);
    lRow(`beta = ${result.beta.toFixed(2)}${inp.betaMode === 'custom' ? ' (personalizado)' : ''}`);
    ly += 1;
    lRow(`VEd = ${formatQuantity(inp.VEd, 'force', system, { precision: 1 })}`);
    lRow(`vEd,0 (u0) = ${formatQuantity(result.vEd0, 'stress', system)}`);
    lRow(`vEd (u1) = ${formatQuantity(result.vEd, 'stress', system)}`);

    // Right: materials + armadura + resultados
    rSecHeader('MATERIALES');
    rRow(`fck = ${inp.fck} N/mm2`, `fyk = ${inp.fyk} N/mm2`);
    ry += 1;
    rSecHeader('ARMADURA FLEXION');
    rRow(`ph sup: ph${inp.barDiamSup}/${inp.sSup} mm`);
    rRow(`ph inf: ph${inp.barDiamInf}/${inp.sInf} mm`);
    rRow(`rhoL = ${(result.rhoL * 100).toFixed(3)} %`);
    ry += 1;
    rSecHeader('PERIMETROS CRITICOS');
    rRow(`u0 = ${result.u0.toFixed(0)} mm`);
    rRow(`u1 = ${result.u1.toFixed(0)} mm`);
    rRow(`uout = ${result.uout.toFixed(0)} mm`);
    rRow(`rout = ${result.rOut.toFixed(0)} mm`);
    ry += 1;
    rSecHeader('RESISTENCIAS');
    rRow(`vRd,c = ${formatQuantity(result.vRdc, 'stress', system)}`);
    rRow(`vRd,max = ${formatQuantity(result.vRdmax, 'stress', system)}`);
    if (inp.hasShearReinf && result.vRdcs !== undefined) {
      rRow(`vRd,cs = ${formatQuantity(result.vRdcs, 'stress', system)}`);
      rRow(`ph${inp.swDiam} x ${inp.swLegs} ram., sr = ${inp.sr} mm`);
    }
  }

  // ── Checks table ─────────────────────────────────────────────────────────────
  const tableY = Math.max(ly, ry) + 4;

  doc.setLineWidth(0.3);
  setGray(doc, 180);
  doc.line(M, tableY - 2, PAGE_W - M, tableY - 2);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  setGray(doc, 60);
  doc.text('VERIFICACIONES', M, tableY + 3);

  const hasFail = result.checks.some(c => c.status === 'fail');
  const hasWarn = result.checks.some(c => c.status === 'warn');
  const overall = hasFail ? 'fail' : hasWarn ? 'warn' : 'ok';

  doc.setFontSize(11);
  setGray(doc, 30);
  doc.text(STATUS_LABEL[overall], PAGE_W - M, tableY + 3, { align: 'right' });

  const TC = {
    desc:  M,
    value: M + 100,
    limit: M + 125,
    util:  M + 150,
  };

  let rowY = tableY + 9;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  setGray(doc, 100);
  doc.text('Verificacion', TC.desc,  rowY);
  doc.text('Valor',        TC.value, rowY);
  doc.text('Limite',       TC.limit, rowY);
  doc.text('Ut% / Estado', TC.util,  rowY);
  rowY += 2;

  doc.setLineWidth(0.2);
  setGray(doc, 160);
  doc.line(M, rowY, PAGE_W - M, rowY);
  rowY += 5;

  // Altura de fila VARIABLE. La descripción se pintaba con `maxWidth: 97`, así
  // que jsPDF la partía él solo y bajaba la 2ª línea ~3.1 mm... justo encima
  // del artículo (que iba a `rowY + 3.5`, offset fijo). Ahora se trocea a mano,
  // el artículo cuelga de la ÚLTIMA línea y la fila crece lo que haga falta.
  const DESC_W = 97;
  const ROW_LH = 3.1;   // interlínea a cuerpo 7.5 (7.5pt · 1.15 · 25.4/72)

  for (const ch of result.checks) {
    const isFail = ch.status === 'fail';
    const isWarn = ch.status === 'warn';

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

    if (ch.article) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      setGray(doc, 150);
      doc.text(pdfStr(ch.article), TC.desc, artY, { maxWidth: DESC_W });
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    setGray(doc, 75);
    doc.text(pdfStr(ch.value ?? ''), TC.value, rowY, { maxWidth: 23 });
    doc.text(pdfStr(ch.limit ?? ''), TC.limit, rowY, { maxWidth: 23 });

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
  // filas sobrantes se descartaban, así que el pie siempre caía en la única
  // página y podía rotularse "Pagina 1" a pelo).
  const footerY = PAGE_H - 10;
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    setGray(doc, 150);
    doc.text(
      'Concreta - concreta.app | Codigo Estructural art. 6.4   gC = 1.50, gS = 1.15',
      M, footerY,
    );
    doc.text(`Pagina ${p}/${pages}`, PAGE_W - M, footerY, { align: 'right' });
  }

  const filename = titledFilename(elementTitle, punchingFallbackFilename());
  const blob = doc.output('blob');
  const blobUrl = URL.createObjectURL(blob);
  const pageCount = (doc.internal as unknown as { getNumberOfPages(): number }).getNumberOfPages();
  return { blobUrl, filename, pageCount };
}
