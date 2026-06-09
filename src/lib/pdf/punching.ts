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
import { type PunchingInputs } from '../../data/defaults';
import { type PunchingResult } from '../../lib/calculations/punching';
import { embedSvgAsImage, PAGE_W, PAGE_H, setGray, pdfStr, STATUS_LABEL, type PdfResult } from './utils';
import { formatQuantity } from '../units/format';
import type { UnitSystem } from '../units/types';

const M = 20;
const CONTENT_W = PAGE_W - 2 * M;  // 170mm

const POSITION_LABEL: Record<string, string> = {
  interior: 'Interior',
  borde:    'Borde',
  esquina:  'Esquina',
};

export async function exportPunchingPDF(
  inp: PunchingInputs,
  result: PunchingResult,
  system: UnitSystem = 'si',
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

  // ── SVG: single plan view, centred ──────────────────────────────────────────
  const svgContainer = document.getElementById('punching-svg-pdf');
  const svgEls = svgContainer ? Array.from(svgContainer.querySelectorAll('svg')) as SVGSVGElement[] : [];

  const SVG_Y  = M + 12;
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
    lRow(`beta = ${cru.beta.toFixed(2)}`);
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
    lRow(`beta = ${result.beta.toFixed(2)}`);
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
  const pageCount = (doc.internal as any).getNumberOfPages();
  return { blobUrl, filename, pageCount };
}
