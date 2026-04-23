// PDF export for Zapata aislada module.
// jsPDF + svg2pdf.js — A4 portrait, margins 20mm.
// Single SVG (planta + sección + diagrama). Inputs in InputsPanel order.

import jsPDF from 'jspdf';
import { svg2pdf } from 'svg2pdf.js';
import { type IsolatedFootingInputs } from '../../data/defaults';
import { type IsolatedFootingResult } from '../../lib/calculations/isolatedFooting';
import { formatQuantity } from '../units/format';
import type { Quantity, UnitSystem } from '../units/types';
import { PAGE_W, PAGE_H, setGray, pdfStr, STATUS_LABEL, type PdfResult } from './utils';

const M = 20;

export async function exportIsolatedFootingPDF(
  inp: IsolatedFootingInputs,
  result: IsolatedFootingResult,
  system: UnitSystem = 'si',
): Promise<PdfResult> {
  const fmtSi = (v: number, q: Quantity) => formatQuantity(v, q, system);
  const checkValueStr = (c: { valueNum?: number; valueQty?: Quantity; valueStr?: string; value?: string }) =>
    c.valueNum !== undefined && c.valueQty
      ? formatQuantity(c.valueNum, c.valueQty, system)
      : (c.valueStr ?? c.value ?? '');
  const checkLimitStr = (c: { limitNum?: number; limitQty?: Quantity; limitStr?: string; limit?: string }) =>
    c.limitNum !== undefined && c.limitQty
      ? formatQuantity(c.limitNum, c.limitQty, system)
      : (c.limitStr ?? c.limit ?? '');

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // ── Header ──────────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  setGray(doc, 30);
  doc.text('Concreta - Zapata aislada', M, M);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  setGray(doc, 120);
  doc.text(`Generado: ${new Date().toLocaleDateString('es-ES')}`, M, M + 5);

  doc.setLineWidth(0.3);
  setGray(doc, 200);
  doc.line(M, M + 8, PAGE_W - M, M + 8);

  // ── SVG (single — planta + sección + diagrama) ───────────────────────────────
  const svgContainer = document.getElementById('isolated-footing-svg-pdf');
  const svgEl = svgContainer ? (svgContainer.querySelector('svg') as SVGSVGElement | null) : null;

  const SVG_X = M;
  const SVG_Y = M + 12;
  const SVG_W = 80;    // viewBox 320×~426 → preserve aspect ratio
  const SVG_H = 107;

  if (svgEl) {
    await svg2pdf(svgEl, doc, { x: SVG_X, y: SVG_Y, width: SVG_W, height: SVG_H });
  }

  // ── Right column: inputs in panel order ──────────────────────────────────────
  const COL_R  = M + SVG_W + 7;            // 107
  const COL_R2 = COL_R + 38;               // 145
  const LH     = 4.5;
  let ry = M + 14;

  const secHeader = (label: string, badge?: { text: string }) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    setGray(doc, 60);
    doc.text(label, COL_R, ry);
    if (badge) {
      // mono caps badge after the section header (per plan §4.5.1)
      doc.setFont('courier', 'normal');
      doc.setFontSize(6.5);
      setGray(doc, 102);  // #666666
      doc.text(badge.text, COL_R + doc.getTextWidth(label) + 2, ry);
    }
    ry += LH;
    doc.setFont('helvetica', 'normal');
    setGray(doc, 80);
  };

  const twoCol = (a: string, b = '') => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    setGray(doc, 80);
    doc.text(pdfStr(a), COL_R, ry);
    if (b) doc.text(pdfStr(b), COL_R2, ry);
    ry += LH;
  };

  const gap = () => { ry += 2; };

  // 1. GEOMETRIA
  secHeader('GEOMETRIA');
  twoCol(`B = ${inp.B} m`,    `L = ${inp.L} m`);
  twoCol(`h = ${inp.h} m`,    `Df = ${inp.Df} m`);
  twoCol(`bc = ${inp.bc} m`,  `hc = ${inp.hc} m`);
  twoCol(`recubr. = ${inp.cover} mm`);
  gap();

  // 2. TENSION ADMISIBLE
  secHeader('TENSION ADMISIBLE');
  twoCol(`sigma_adm = ${fmtSi(inp.sigma_adm, 'soilPressure')}`);
  gap();

  // 3. CARGAS — with mode badge
  const modeBadge = inp.loadsAreFactored
    ? `[MAYORADAS · gamma=${inp.loadFactor}]`
    : `[SIN MAYORAR · gamma=${inp.loadFactor}]`;
  secHeader('CARGAS', { text: modeBadge });
  twoCol(`N = ${fmtSi(inp.N, 'force')}`,    `H = ${fmtSi(inp.H, 'force')}`);
  twoCol(`Mx = ${fmtSi(inp.Mx, 'moment')}`, `My = ${fmtSi(inp.My, 'moment')}`);
  gap();

  // 4. MATERIALES
  secHeader('MATERIALES');
  twoCol(`fck = ${inp.fck} MPa`, `fyk = ${inp.fyk} MPa`);
  gap();

  // 5. ARMADURA
  secHeader('ARMADURA');
  twoCol(`Barras x: ph${inp.phi_x}@${inp.s_x}mm`, `As,x = ${result.As_prov_x.toFixed(0)} mm2/m`);
  twoCol(`Barras y: ph${inp.phi_y}@${inp.s_y}mm`, `As,y = ${result.As_prov_y.toFixed(0)} mm2/m`);
  gap();

  // 6. SUELO
  secHeader('SUELO');
  twoCol(`gamma_s = ${inp.gamma_soil_kN_m3} kN/m3`, `mu = ${inp.mu_friction.toFixed(2)}`);

  // ── Cargas derivadas (below SVG, full-width 2-col SLS|ELU) ───────────────────
  const derY = SVG_Y + SVG_H + 6;
  doc.setLineWidth(0.3);
  setGray(doc, 180);
  doc.line(M, derY - 2, PAGE_W - M, derY - 2);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  setGray(doc, 60);
  doc.text('CARGAS DERIVADAS', M, derY + 3);

  // Sub-headers
  const SLS_X = M;
  const ELU_X = M + 90;
  const SLS_X2 = SLS_X + 35;
  const ELU_X2 = ELU_X + 35;
  let dy = derY + 8;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  setGray(doc, 100);
  doc.text('SLS (suelo)', SLS_X, dy);
  doc.text('ELU (armado)', ELU_X, dy);
  dy += 4;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  setGray(doc, 80);
  doc.text(pdfStr(`N_sls = ${fmtSi(result.N_sls, 'force')}`),   SLS_X,  dy);
  doc.text(pdfStr(`H_sls = ${fmtSi(result.H_sls, 'force')}`),   SLS_X2, dy);
  doc.text(pdfStr(`N_elu = ${fmtSi(result.N_elu, 'force')}`),   ELU_X,  dy);
  doc.text(pdfStr(`H_elu = ${fmtSi(result.H_elu, 'force')}`),   ELU_X2, dy);
  dy += LH;
  doc.text(pdfStr(`Mx_sls = ${fmtSi(result.Mx_sls, 'moment')}`), SLS_X,  dy);
  doc.text(pdfStr(`My_sls = ${fmtSi(result.My_sls, 'moment')}`), SLS_X2, dy);
  doc.text(pdfStr(`Mx_elu = ${fmtSi(result.Mx_elu, 'moment')}`), ELU_X,  dy);
  doc.text(pdfStr(`My_elu = ${fmtSi(result.My_elu, 'moment')}`), ELU_X2, dy);
  dy += LH;

  // Distribution + tensions summary line
  const distLabel = ({
    trapezoidal:           'trapecial',
    bitriangular_uniaxial: 'bitri uniaxial',
    bitriangular_biaxial:  'bitri biaxial',
    overturning_fail:      'vuelco geometrico',
  } as const)[result.distributionType];
  const sigmaMaxStr = result.sigma_max === Infinity ? '∞' : fmtSi(result.sigma_max, 'soilPressure');
  const sigmaMinStr = result.distributionType === 'overturning_fail'
    ? '—'
    : result.distributionType === 'trapezoidal'
      ? fmtSi(result.sigma_min, 'soilPressure')
      : '0 (despegue)';
  doc.text(pdfStr(`Distribucion: ${distLabel}`), SLS_X, dy);
  doc.text(pdfStr(`sigma_max = ${sigmaMaxStr}`), ELU_X, dy);
  doc.text(pdfStr(`sigma_min = ${sigmaMinStr}`), ELU_X2, dy);
  dy += LH;

  // FS row
  const fsX = result.FS_overturn_x === Infinity ? '∞' : result.FS_overturn_x.toFixed(2);
  const fsY = result.FS_overturn_y === Infinity ? '∞' : result.FS_overturn_y.toFixed(2);
  const fsS = result.FS_sliding === Infinity ? '∞' : result.FS_sliding.toFixed(2);
  doc.text(`FS_vuelco_x = ${fsX}`, SLS_X,  dy);
  doc.text(`FS_vuelco_y = ${fsY}`, SLS_X2, dy);
  doc.text(`FS_desliz = ${fsS}`,   ELU_X,  dy);
  doc.text(`Clasif: ${result.isRigid ? 'rigida' : 'flexible'}`, ELU_X2, dy);
  dy += LH;

  // ── Checks table ─────────────────────────────────────────────────────────────
  const tableY = dy + 4;

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
    doc.text(pdfStr(checkValueStr(ch)), COL.value, rowY);
    doc.text(pdfStr(checkLimitStr(ch)), COL.limit, rowY);
    setGray(doc, textG);
    const utStr = !isFinite(ch.utilization)
      ? '∞'
      : `${(ch.utilization * 100).toFixed(0)}%`;
    doc.text(utStr, COL.util, rowY);
    doc.text(STATUS_LABEL[ch.status], COL.status, rowY);

    setGray(doc, 220);
    doc.line(M, rowY + 2, PAGE_W - M, rowY + 2);
    rowY += 7;
  }

  // ── Footer ───────────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  setGray(doc, 160);
  doc.text(
    `Concreta — CTE DB-SE-C / CE  ·  gamma_aplicado=${inp.loadFactor} (CTE DB-SE 4.2.4)`,
    M, PAGE_H - M,
  );
  doc.text('Pagina 1', PAGE_W - M, PAGE_H - M, { align: 'right' });

  const filename = 'zapata-aislada.pdf';
  const blob = doc.output('blob');
  const blobUrl = URL.createObjectURL(blob);
  const pageCount = (doc.internal as any).getNumberOfPages();
  return { blobUrl, filename, pageCount };
}
