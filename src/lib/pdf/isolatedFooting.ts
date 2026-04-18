// PDF export for Zapata aislada module.
// jsPDF + svg2pdf.js — A4 portrait, margins 20mm.

import jsPDF from 'jspdf';
import { svg2pdf } from 'svg2pdf.js';
import { type IsolatedFootingInputs } from '../../data/defaults';
import { type IsolatedFootingResult } from '../../lib/calculations/isolatedFooting';
import { PAGE_W, PAGE_H, setGray, pdfStr, STATUS_LABEL, type PdfResult } from './utils';

const M = 20;

export async function exportIsolatedFootingPDF(
  inp: IsolatedFootingInputs,
  result: IsolatedFootingResult,
): Promise<PdfResult> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const soilLabel = inp.soilType === 'cohesive' ? 'cohesivo (art. 4.3.2)' : 'granular (art. 4.3.3)';

  // ── Header ──────────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  setGray(doc, 30);
  doc.text(`Concreta - Zapata aislada - ${soilLabel}`, M, M);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  setGray(doc, 120);
  doc.text(`Generado: ${new Date().toLocaleDateString('es-ES')}`, M, M + 5);

  doc.setLineWidth(0.3);
  setGray(doc, 200);
  doc.line(M, M + 8, PAGE_W - M, M + 8);

  // ── SVG (plan view — first SVG in the hidden container) ─────────────────────
  const svgContainer = document.getElementById('isolated-footing-svg-pdf');
  const svgEls = svgContainer ? Array.from(svgContainer.querySelectorAll('svg')) : [];
  const planSvg    = svgEls[0] as SVGSVGElement | null;
  const sectionSvg = svgEls[1] as SVGSVGElement | null;

  const SVG_X  = M;
  const SVG_Y  = M + 12;
  // Plan SVG is square (260×260 viewBox) — allocate 60×60mm to avoid wasted space.
  // Section SVG is wide (320×192 viewBox) — allocate 80mm wide to fill the column.
  const SVG_W1 = 60;  // plan (square)
  const SVG_H1 = 60;
  const SVG_W2 = 80;  // section (wider)
  const SVG_H2 = 50;

  if (planSvg) {
    await svg2pdf(planSvg, doc, { x: SVG_X, y: SVG_Y, width: SVG_W1, height: SVG_H1 });
  }
  if (sectionSvg) {
    await svg2pdf(sectionSvg, doc, { x: SVG_X, y: SVG_Y + SVG_H1 + 3, width: SVG_W2, height: SVG_H2 });
  }

  // ── Right column ─────────────────────────────────────────────────────────────
  // Start at M + SVG_W2 + 7 = M+87. Use SVG_W2 as the binding width (wider of the two).
  const COL_R  = M + SVG_W2 + 7;
  const COL_R2 = COL_R + 50;
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
  secHeader('GEOMETRIA');
  twoCol(`B = ${inp.B} m`, `L = ${inp.L} m`);
  twoCol(`h = ${inp.h} m`, `Df = ${inp.Df} m`);
  twoCol(`bc = ${inp.bc} m`, `hc = ${inp.hc} m`);
  twoCol(`recubr. = ${inp.cover} mm`);
  gap();

  // LOADS SLS
  secHeader('CARGAS SLS (SUELO)');
  twoCol(`N_k = ${inp.N_k} kN`, `H_k = ${inp.H_k} kN`);
  twoCol(`Mx_k = ${inp.Mx_k} kNm`, `My_k = ${inp.My_k} kNm`);
  gap();

  // LOADS ELU
  secHeader('CARGAS ELU (ARMADO)');
  twoCol(`N_Ed = ${inp.N_Ed} kN`);
  if (inp.Mx_Ed !== 0 || inp.My_Ed !== 0) {
    twoCol(`Mx_Ed = ${inp.Mx_Ed} kNm`, `My_Ed = ${inp.My_Ed} kNm`);
  }
  gap();

  // SOIL
  secHeader(`SUELO (${soilLabel.toUpperCase()})`);
  if (inp.soilType === 'cohesive') {
    twoCol(`c = ${inp.c_soil} kPa`, `phi = ${inp.phi_soil} deg`);
    twoCol(`gamma = ${inp.gamma_soil} kN/m3`, `gamma_R = ${inp.gamma_R}`);
    twoCol(`qh = ${result.qh.toFixed(1)} kPa`, `qadm = ${result.qadm.toFixed(1)} kPa`);
  } else {
    twoCol(`N_SPT = ${inp.N_spt}`, `B' = ${result.B_eff.toFixed(2)} m`);
    twoCol(`qadm = ${result.qadm.toFixed(1)} kPa`);
  }
  twoCol(`sigma_max = ${result.sigma_max.toFixed(1)} kPa`, `sigma_eff = ${result.sigma_eff.toFixed(1)} kPa`);
  gap();

  // STRUCTURAL
  secHeader('ARMADO');
  twoCol(`fck = ${inp.fck} MPa`, `fyk = ${inp.fyk} MPa`);
  twoCol(`Barras x: ph${inp.phi_x}@${inp.s_x}mm`, `As,x = ${result.As_prov_x.toFixed(0)} mm2/m`);
  twoCol(`Barras y: ph${inp.phi_y}@${inp.s_y}mm`, `As,y = ${result.As_prov_y.toFixed(0)} mm2/m`);
  twoCol(`d_x = ${result.d_x.toFixed(0)} mm`, `d_y = ${result.d_y.toFixed(0)} mm`);
  // Classification — method depends on v/h ratio (CE art. 55)
  const v_ratio = Math.max(result.v_max_x, result.v_max_y) / (inp.h as number);
  twoCol(
    `Clasif: ${result.is_rigid ? 'rigida' : 'flexible'}`,
    `v/h = ${v_ratio.toFixed(2)}`,
  );
  if (result.is_rigid) {
    // Biela-tirante (CE art. 55.2): Td drives tie reinforcement, no punching
    twoCol(`Td,x = ${result.Td_x.toFixed(1)} kN`, `Td,y = ${result.Td_y.toFixed(1)} kN`);
    twoCol('Punzonamiento: N/A (rigida)');
  } else {
    twoCol(`MEd,x = ${result.MEd_x.toFixed(2)} kNm/m`, `MEd,y = ${result.MEd_y.toFixed(2)} kNm/m`);
    twoCol(`vEd,pun = ${result.vEd_punch.toFixed(3)} MPa`, `vRd,c = ${result.vRdc_punch.toFixed(3)} MPa`);
  }

  // ── Checks table ─────────────────────────────────────────────────────────────
  const tableY = SVG_Y + SVG_H1 + SVG_H2 + 10;

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
    const textG  = isFail ? 180 : isWarn ? 120 : 60;

    doc.setFont('helvetica', isFail || isWarn ? 'bold' : 'normal');
    doc.setFontSize(7.5);
    setGray(doc, 60);
    doc.text(pdfStr(ch.description), COL.desc, rowY, { maxWidth: 78 });

    setGray(doc, 80);
    doc.text(pdfStr(ch.value), COL.value, rowY);
    doc.text(pdfStr(ch.limit), COL.limit, rowY);
    setGray(doc, textG);
    doc.text(`${(ch.utilization * 100).toFixed(0)}%`, COL.util, rowY);
    doc.text(STATUS_LABEL[ch.status], COL.status, rowY);

    setGray(doc, 220);
    doc.line(M, rowY + 2, PAGE_W - M, rowY + 2);
    rowY += 7;
  }

  // ── Footer ───────────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  setGray(doc, 160);
  doc.text('Concreta — CTE DB-SE-C / CE (Codigo Estructural espanol)', M, PAGE_H - M);
  doc.text('Pagina 1', PAGE_W - M, PAGE_H - M, { align: 'right' });

  const filename = 'zapata-aislada.pdf';
  const blob = doc.output('blob');
  const blobUrl = URL.createObjectURL(blob);
  const pageCount = (doc.internal as any).getNumberOfPages();
  return { blobUrl, filename, pageCount };
}
