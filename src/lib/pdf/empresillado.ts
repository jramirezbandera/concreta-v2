// PDF export for Empresillado module — EC3 EN 1993-1-1 §6.4
// jsPDF + svg2pdf.js — A4 portrait, margins 20mm, single page.

import jsPDF from 'jspdf';
import { svg2pdf } from 'svg2pdf.js';
import { type EmpresalladoInputs } from '../../data/defaults';
import { type EmpresalladoResult } from '../../lib/calculations/empresillado';
import { PAGE_W, PAGE_H, setGray, pdfStr, STATUS_LABEL, type PdfResult } from './utils';

const M = 20;

export async function exportEmpresalladoPDF(
  inp: EmpresalladoInputs,
  result: EmpresalladoResult,
): Promise<PdfResult> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // ── Header ───────────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  setGray(doc, 30);
  doc.text('Concreta - Pilar compuesto empresillado - EC3 §6.4', M, M);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  setGray(doc, 120);
  doc.text(`Generado: ${new Date().toLocaleDateString('es-ES')}`, M, M + 5);

  doc.setLineWidth(0.3);
  setGray(doc, 200);
  doc.line(M, M + 8, PAGE_W - M, M + 8);

  // ── SVG ─────────────────────────────────────────────────────────────────────
  // EmpresalladoSvg renders as a single <svg> with both cross-section and elevation.
  const svgContainer = document.getElementById('empresillado-svg-pdf');
  const svgEl = svgContainer?.querySelector('svg') as SVGSVGElement | null;

  const SVG_X = M;
  const SVG_Y = M + 12;
  const SVG_W = 90;   // mm — takes left ~half of page
  const SVG_H = 90;   // mm — matches 600×480 hidden SVG aspect (wider elevation view)

  if (svgEl) {
    await svg2pdf(svgEl, doc, { x: SVG_X, y: SVG_Y, width: SVG_W, height: SVG_H });
  }

  // ── Right column: inputs ─────────────────────────────────────────────────────
  const COL_R  = M + SVG_W + 7;
  const COL_R2 = COL_R + 44;
  const LH     = 4.5;
  let ry = M + 14;

  const secHeader = (label: string) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    setGray(doc, 60);
    doc.text(label, COL_R, ry);
    ry += LH;
    doc.setFont('helvetica', 'normal');
    setGray(doc, 80);
  };

  const twoCol = (a: string, b = '') => {
    doc.setFontSize(8);
    doc.text(pdfStr(a), COL_R, ry);
    if (b) doc.text(pdfStr(b), COL_R2, ry);
    ry += LH;
  };

  const gap = () => { ry += 2; };

  // GEOMETRY
  secHeader('GEOMETRIA COLUMNA EXISTENTE');
  twoCol(`bc = ${inp.bc} cm`, `hc = ${inp.hc} cm`);
  twoCol(`L = ${inp.L} m`);
  twoCol(`beta_x = ${inp.beta_x}`, `beta_y = ${inp.beta_y}`);
  gap();

  // LOADS
  secHeader('CARGAS ELU');
  twoCol(`N_Ed = ${inp.N_Ed} kN`);
  twoCol(`Mx_Ed = ${inp.Mx_Ed} kNm`, `My_Ed = ${inp.My_Ed} kNm`);
  twoCol(`Vd = ${inp.Vd} kN`);
  gap();

  // PROFILE + BATTENS
  secHeader('PERFIL + PLETINAS');
  twoCol(`Perfil: ${inp.perfil}`, `fy = ${inp.fy} MPa`);
  twoCol(`s = ${inp.s} cm`, `lp = ${inp.lp} cm`);
  twoCol(`bp = ${inp.bp} cm`, `tp = ${inp.tp} mm`);
  gap();

  // KEY RESULTS
  secHeader('RESULTADOS CLAVE');
  twoCol(`chi = ${result.chi.toFixed(3)}`);
  twoCol(`N_b,Rd = ${result.N_b_Rd.toFixed(1)} kN`);
  twoCol(`N_chord = ${result.N_chord_max.toFixed(1)} kN`);
  twoCol(`lambda_eff X/Y: ${result.lambda_effX.toFixed(3)} / ${result.lambda_effY.toFixed(3)}`);

  // ── Checks table ─────────────────────────────────────────────────────────────
  // Start below whichever ends lower: the SVG or the right-column text block.
  const tableY = Math.max(SVG_Y + SVG_H + 8, ry + 4);

  doc.setLineWidth(0.3);
  setGray(doc, 180);
  doc.line(M, tableY - 2, PAGE_W - M, tableY - 2);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  setGray(doc, 60);
  doc.text('VERIFICACIONES', M, tableY + 3);

  const hasFail = result.checks.some((c) => c.status === 'fail');
  const hasWarn = result.checks.some((c) => c.status === 'warn');
  const overall = hasFail ? 'fail' : hasWarn ? 'warn' : 'ok';

  doc.setFontSize(11);
  setGray(doc, 30);
  doc.text(STATUS_LABEL[overall], PAGE_W - M, tableY + 3, { align: 'right' });

  const COL = {
    desc:   M,
    value:  M + 82,
    limit:  M + 118,
    util:   M + 150,
    status: M + 162,
  };

  let rowY = tableY + 9;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  setGray(doc, 100);
  doc.text('Verificacion', COL.desc,   rowY);
  doc.text('Valor',        COL.value,  rowY);
  doc.text('Limite',       COL.limit,  rowY);
  doc.text('Ut%',          COL.util,   rowY);
  doc.text('Estado',       COL.status, rowY);
  rowY += 2;

  doc.setLineWidth(0.2);
  setGray(doc, 160);
  doc.line(M, rowY, PAGE_W - M, rowY);
  rowY += 5;

  for (const ch of result.checks) {
    if (rowY > PAGE_H - M - 10) break;
    const isFail = ch.status === 'fail';
    const isWarn = ch.status === 'warn';

    doc.setFont('helvetica', isFail || isWarn ? 'bold' : 'normal');
    doc.setFontSize(7.5);
    setGray(doc, 60);
    doc.text(pdfStr(ch.description), COL.desc, rowY, { maxWidth: 78 });

    setGray(doc, 80);
    doc.text(pdfStr(ch.value ?? ''), COL.value, rowY);
    doc.text(pdfStr(ch.limit ?? ''), COL.limit, rowY);

    const textG = isFail ? 180 : isWarn ? 120 : 60;
    setGray(doc, textG);
    doc.text(`${(ch.utilization * 100).toFixed(0)}%`, COL.util, rowY);
    doc.text(STATUS_LABEL[ch.status], COL.status, rowY);

    setGray(doc, 220);
    doc.line(M, rowY + 2, PAGE_W - M, rowY + 2);
    rowY += 7;
  }

  // ── Footer ───────────────────────────────────────────────────────────────────
  const footerY = PAGE_H - 10;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  setGray(doc, 150);
  doc.text('Concreta - concreta.app | EC3 EN 1993-1-1 §6.4   gM0 = 1.05   gM1 = 1.05', M, footerY);
  doc.text('Pagina 1', PAGE_W - M, footerY, { align: 'right' });

  const filename = 'empresillado.pdf';
  const blob = doc.output('blob');
  const blobUrl = URL.createObjectURL(blob);
  const pageCount = (doc.internal as any).getNumberOfPages();
  return { blobUrl, filename, pageCount };
}
