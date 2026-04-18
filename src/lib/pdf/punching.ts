// PDF export for Punching module — CE art. 6.4 (punzonamiento)
// jsPDF + svg2pdf.js — A4 portrait, margins 20mm, single page.
//
// Layout:
//   1. Header (title + date)
//   2. SVG full-width (170mm × ~55mm)
//   3. Inputs — 2 columns side-by-side
//   4. Checks table — 4 columns (Descripción | Valor | Límite | Ut%)
//   5. Footer

import jsPDF from 'jspdf';
import { svg2pdf } from 'svg2pdf.js';
import { type PunchingInputs } from '../../data/defaults';
import { type PunchingResult } from '../../lib/calculations/punching';
import { PAGE_W, PAGE_H, setGray, pdfStr, STATUS_LABEL, type PdfResult } from './utils';

const M = 20;
const CONTENT_W = PAGE_W - 2 * M;  // 170mm

const POSITION_LABEL: Record<string, string> = {
  interior: 'Interior',
  edge:     'Borde',
  corner:   'Esquina',
};

export async function exportPunchingPDF(
  inp: PunchingInputs,
  result: PunchingResult,
): Promise<PdfResult> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // ── Header ───────────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  setGray(doc, 30);
  doc.text('Concreta - Punzonamiento en losa - CE art. 6.4', M, M);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  setGray(doc, 130);
  doc.text(`Generado: ${new Date().toLocaleDateString('es-ES')}`, M, M + 5);

  doc.setLineWidth(0.3);
  setGray(doc, 200);
  doc.line(M, M + 8, PAGE_W - M, M + 8);

  // ── SVG: plan view (left) + section view (right) ────────────────────────────
  const svgContainer = document.getElementById('punching-svg-pdf');
  const svgEls = svgContainer ? Array.from(svgContainer.querySelectorAll('svg')) as SVGSVGElement[] : [];

  const SVG_Y   = M + 12;
  const HALF_W  = (CONTENT_W - 4) / 2;   // ~83mm each, 4mm gap
  const PLAN_H  = HALF_W;                 // plan is square
  const SECT_H  = Math.round(HALF_W * 0.5);

  if (svgEls[0]) {
    await svg2pdf(svgEls[0], doc, { x: M, y: SVG_Y, width: HALF_W, height: PLAN_H });
  }
  if (svgEls[1]) {
    const sectY = SVG_Y + (PLAN_H - SECT_H) / 2;  // vertically centered
    await svg2pdf(svgEls[1], doc, { x: M + HALF_W + 4, y: sectY, width: HALF_W, height: SECT_H });
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

  // Left: geometry + loads
  lSecHeader('GEOMETRIA Y CARGAS');
  if (inp.isCircular) {
    lRow(`Soporte circular: D = ${inp.cx} mm`);
  } else {
    lRow(`Soporte: cx = ${inp.cx} mm`, `cy = ${inp.cy} mm`);
  }
  lRow(`Canto eficaz: d = ${inp.d} mm`);
  lRow(`Posicion: ${POSITION_LABEL[inp.position] ?? inp.position}`);
  lRow(`beta = ${result.beta.toFixed(2)}`);
  ly += 1;
  lRow(`VEd = ${inp.VEd} kN`);
  lRow(`vEd,0 (u0) = ${result.vEd0.toFixed(3)} N/mm2`);
  lRow(`vEd (u1) = ${result.vEd.toFixed(3)} N/mm2`);

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
  rRow(`vRd,c = ${result.vRdc.toFixed(3)} N/mm·mm`);
  rRow(`vRd,max = ${result.vRdmax.toFixed(3)} N/mm·mm`);
  if (inp.hasShearReinf && result.vRdcs !== undefined) {
    rRow(`vRd,cs = ${result.vRdcs.toFixed(3)} N/mm·mm`);
    rRow(`ph${inp.swDiam} x ${inp.swLegs} ram., sr = ${inp.sr} mm`);
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

  for (const ch of result.checks) {
    if (rowY > PAGE_H - M - 8) break;

    const isFail = ch.status === 'fail';
    const isWarn = ch.status === 'warn';

    doc.setFont('helvetica', isFail || isWarn ? 'bold' : 'normal');
    doc.setFontSize(7.5);
    setGray(doc, 55);
    doc.text(pdfStr(ch.description), TC.desc, rowY, { maxWidth: 97 });

    if (ch.article) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      setGray(doc, 150);
      doc.text(pdfStr(ch.article), TC.desc, rowY + 3.5, { maxWidth: 97 });
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    setGray(doc, 75);
    doc.text(pdfStr(ch.value), TC.value, rowY, { maxWidth: 23 });
    doc.text(pdfStr(ch.limit), TC.limit, rowY, { maxWidth: 23 });

    const textG = isFail ? 60 : isWarn ? 80 : 100;
    doc.setFont('helvetica', isFail || isWarn ? 'bold' : 'normal');
    doc.setFontSize(7.5);
    setGray(doc, textG);
    const utText = ch.utilization <= 1
      ? `${(ch.utilization * 100).toFixed(0)}%`
      : STATUS_LABEL[ch.status];
    doc.text(utText, TC.util, rowY);

    setGray(doc, 215);
    doc.line(M, rowY + 5, PAGE_W - M, rowY + 5);
    rowY += 9;
  }

  // ── Footer ───────────────────────────────────────────────────────────────────
  const footerY = PAGE_H - 10;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  setGray(doc, 150);
  doc.text(
    'Concreta - concreta.app | Codigo Estructural art. 6.4   gC = 1.50, gS = 1.15',
    M, footerY,
  );
  doc.text('Pagina 1', PAGE_W - M, footerY, { align: 'right' });

  const filename = 'punzonamiento.pdf';
  const blob = doc.output('blob');
  const blobUrl = URL.createObjectURL(blob);
  const pageCount = doc.internal.getNumberOfPages();
  return { blobUrl, filename, pageCount };
}
