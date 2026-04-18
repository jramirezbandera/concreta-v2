// PDF export for Encepados de Micropilotes module.
// jsPDF + svg2pdf.js — A4 portrait, margins 20mm.
// jsPDF built-in fonts (Helvetica) only cover latin-1; replace non-latin chars.

import jsPDF from 'jspdf';
import { svg2pdf } from 'svg2pdf.js';
import { type PileCapInputs } from '../../data/defaults';
import { type PileCapResult } from '../../lib/calculations/pileCap';
import { PAGE_W, PAGE_H, setGray, pdfStr, STATUS_LABEL, type PdfResult } from './utils';

const M = 20;  // mm margin

export async function exportPileCapPDF(
  inp: PileCapInputs,
  result: PileCapResult,
): Promise<PdfResult> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const n       = inp.n as number;
  const phi_tie = inp.phi_tie as number;
  const modeLabel = `Encepado ${n} micropilotes — bielas y tirantes`;

  // ── Header ─────────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  setGray(doc, 30);
  doc.text(`Concreta - ${modeLabel}`, M, M);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  setGray(doc, 120);
  doc.text(`Generado: ${new Date().toLocaleDateString('es-ES')}`, M, M + 5);

  doc.setLineWidth(0.3);
  setGray(doc, 200);
  doc.line(M, M + 8, PAGE_W - M, M + 8);

  // ── SVG: dual plan + section view ──────────────────────────────────────────
  const svgContainer = document.getElementById('pile-cap-svg-pdf');
  const svgEl = svgContainer?.querySelector('svg') as SVGSVGElement | null;

  const SVG_W = 85;
  const SVG_H = 110;
  const svgX  = M;
  const svgY  = M + 12;

  if (svgEl) {
    await svg2pdf(svgEl, doc, { x: svgX, y: svgY, width: SVG_W, height: SVG_H });
  }

  // ── Right column: inputs + key results ─────────────────────────────────────
  const COL_R  = M + 93;
  const COL_R2 = COL_R + 42;
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

  const twoCol = (a: string, b: string) => {
    doc.setFontSize(8);
    doc.text(pdfStr(a), COL_R, ry);
    if (b) doc.text(pdfStr(b), COL_R2, ry);
    ry += LH;
  };

  const gap = () => { ry += 2; };

  // ENTRADA
  secHeader('ENTRADA');
  twoCol(`n = ${n} pilotes`, `d_p = ${inp.d_p} mm`);
  twoCol(`s = ${inp.s} mm`, `h = ${inp.h_enc} mm`);
  twoCol(`fck = ${inp.fck} MPa`, `fyk = ${inp.fyk} MPa`);
  twoCol(`N_Ed = ${inp.N_Ed} kN`, `R_adm = ${inp.R_adm} kN`);
  if (inp.Mx_Ed !== 0) twoCol(`Mx = ${inp.Mx_Ed} kNm`, `My = ${inp.My_Ed} kNm`);
  gap();

  // GEOMETRIA ENCEPADO
  secHeader('GEOMETRIA ENCEPADO');
  twoCol(`Lx = ${result.L_x.toFixed(0)} mm`, `Ly = ${result.L_y.toFixed(0)} mm`);
  twoCol(`e_borde = ${result.e_borde.toFixed(0)} mm`, `h_min = ${result.h_min.toFixed(0)} mm`);
  gap();

  // BIELAS Y TIRANTES
  secHeader('BIELAS Y TIRANTES (CE art. 48)');
  twoCol(`th = ${result.theta_deg.toFixed(1)} deg`, `z_eff = ${result.z_eff.toFixed(0)} mm`);
  twoCol(`sigma_biela = ${result.sigma_strut.toFixed(2)} MPa`, `sigma_Rd = ${result.sigma_Rd_max.toFixed(2)} MPa`);
  twoCol(`Ft,x = ${result.Ft_x.toFixed(1)} kN`,
    result.Ft_y !== null ? `Ft,y = ${result.Ft_y.toFixed(1)} kN` : '');
  gap();

  // ARMADURA TIRANTES
  secHeader('ARMADURA TIRANTES');
  twoCol(
    `As,x = ${result.n_bars_x} ph${phi_tie} (${result.As_prov_x.toFixed(0)} mm^2)`,
    result.n_bars_y !== null
      ? `As,y = ${result.n_bars_y} ph${phi_tie} (${result.As_prov_y?.toFixed(0)} mm^2)`
      : '',
  );
  twoCol(`s_bar,x = ${result.s_bar_x.toFixed(0)} mm`, `s_max = ${result.s_max.toFixed(0)} mm`);
  twoCol(`lb,neta = ${result.lb_net.toFixed(0)} mm`, `lb,disp = ${result.lb_avail.toFixed(0)} mm`);

  // ── Divider + checks table ──────────────────────────────────────────────────
  const tableY = svgY + SVG_H + 6;

  doc.setLineWidth(0.3);
  setGray(doc, 180);
  doc.line(M, tableY - 2, PAGE_W - M, tableY - 2);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  setGray(doc, 60);
  doc.text('VERIFICACIONES', M, tableY + 3);

  // Overall verdict
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

  // Header row
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

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);

  for (const chk of result.checks) {
    if (rowY > PAGE_H - M - 14) {
      doc.addPage();
      rowY = M + 10;
    }

    const st = chk.status;
    setGray(doc, 50);
    doc.text(pdfStr(chk.description), COL.desc,   rowY);
    doc.text(pdfStr(chk.value),       COL.value,  rowY);
    doc.text(pdfStr(chk.limit),       COL.limit,  rowY);
    doc.text(`${(chk.utilization * 100).toFixed(0)}%`, COL.util, rowY);
    doc.setFont('helvetica', 'bold');
    setGray(doc, st === 'ok' ? 60 : 30);
    doc.text(STATUS_LABEL[st], COL.status, rowY);
    doc.setFont('helvetica', 'normal');
    setGray(doc, 50);

    rowY += 4;
    doc.setFontSize(6);
    setGray(doc, 160);
    doc.text(chk.article, COL.desc + 2, rowY);
    doc.setFontSize(7);
    setGray(doc, 50);

    rowY += 3;
    doc.setLineWidth(0.1);
    setGray(doc, 215);
    doc.line(M, rowY, PAGE_W - M, rowY);
    rowY += 4;
  }

  // ── Footer ─────────────────────────────────────────────────────────────────
  const footerY = PAGE_H - 10;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  setGray(doc, 150);
  doc.text('Concreta - concreta.app | CE art. 48 / CTE DB-SE-C', M, footerY);
  doc.text('Pagina 1', PAGE_W - M, footerY, { align: 'right' });

  const filename = `concreta-encepado-${n}p-${new Date().toISOString().slice(0, 10)}.pdf`;
  const blob = doc.output('blob');
  const blobUrl = URL.createObjectURL(blob);
  const pageCount = (doc.internal as any).getNumberOfPages();
  return { blobUrl, filename, pageCount };
}
