// PDF export for Encepados de Micropilotes module.
// jsPDF + svg2pdf.js — A4 portrait, margins 20mm.
// jsPDF built-in fonts (Helvetica) only cover latin-1; replace non-latin chars.

import jsPDF from 'jspdf';
import { type PileCapInputs } from '../../data/defaults';
import { type PileCapResult } from '../../lib/calculations/pileCap';
import { embedSvgAsImage, PAGE_W, PAGE_H, setGray, pdfStr, STATUS_LABEL, ensureSpace, titledFilename, drawElementTitle, type PdfResult } from './utils';
import { formatQuantity } from '../units/format';
import type { Quantity, UnitSystem } from '../units/types';

const M = 20;  // mm margin

/** Nombre de archivo por defecto cuando el título va vacío. Fuente única
 *  compartida por el exportador y el TitlePromptModal (preview). */
export function pileCapFallbackFilename(inp: PileCapInputs): string {
  const n = inp.n as number;
  return `concreta-encepado-${n}p-${new Date().toISOString().slice(0, 10)}.pdf`;
}

export async function exportPileCapPDF(
  inp: PileCapInputs,
  result: PileCapResult,
  system: UnitSystem = 'si',
  title?: string,
): Promise<PdfResult> {
  const elementTitle = title ?? inp.title ?? '';
  const fmtSi = (v: number, q: Quantity, precision = 1) =>
    formatQuantity(v, q, system, { precision });
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const n       = inp.n as number;
  const phi_tie = inp.phi_tie as number;
  const modeLabel = `Encepado ${n} micropilotes — bielas y tirantes`;

  // ── Header ─────────────────────────────────────────────────────────────────
  const titleBaseY = drawElementTitle(doc, elementTitle, `Concreta - ${modeLabel}`, M);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  setGray(doc, 120);
  doc.text(`Generado: ${new Date().toLocaleDateString('es-ES')}`, M, titleBaseY + 5);

  doc.setLineWidth(0.3);
  setGray(doc, 200);
  doc.line(M, titleBaseY + 8, PAGE_W - M, titleBaseY + 8);

  // ── SVG: dual plan + section view ──────────────────────────────────────────
  const svgContainer = document.getElementById('pile-cap-svg-pdf');
  const svgEl = svgContainer?.querySelector('svg') as SVGSVGElement | null;

  const SVG_W = 85;
  const SVG_H = 110;
  const svgX  = M;
  const svgY  = titleBaseY + 12;

  if (svgEl) {
    await embedSvgAsImage(doc, svgEl, { x: svgX, y: svgY, width: SVG_W, height: SVG_H });
  }

  // ── Right column: inputs + key results ─────────────────────────────────────
  const COL_R  = M + 93;
  const COL_R2 = COL_R + 42;
  const LH     = 4.5;
  // `titleBaseY`, no `M`: con título la regla (titleBaseY+8) baja 5.5mm y pisaba
  // la primera cabecera de esta columna.
  let ry = titleBaseY + 14;

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
  const plateOn = (inp.plate_on as boolean | undefined) ?? false;
  secHeader('ENTRADA');
  twoCol(`n = ${n} pilotes`, `d_p = ${inp.d_p} mm`);
  if (plateOn) {
    twoCol(
      `Placa reparto: ${inp.plate_shape === 'cuad' ? 'cuadrada' : 'circular'}`,
      `${inp.plate_shape === 'cuad' ? 'lado' : 'D'} = ${inp.d_plate} mm`,
    );
  }
  twoCol(`s = ${inp.s} mm`, `h = ${inp.h_enc} mm`);
  twoCol(`fck = ${inp.fck} MPa`, `fyk = ${inp.fyk} MPa`);
  twoCol(`N_Ed = ${fmtSi(inp.N_Ed, 'force')}`, `R_adm = ${fmtSi(inp.R_adm, 'force')}`);
  if (inp.Mx_Ed !== 0) twoCol(`Mx = ${fmtSi(inp.Mx_Ed, 'moment', 2)}`, `My = ${fmtSi(inp.My_Ed, 'moment', 2)}`);
  gap();

  // GEOMETRIA ENCEPADO — indica si las dims en planta son auto o del usuario
  const dimsAuto = (inp.dims_auto as boolean | undefined) ?? true;
  secHeader(dimsAuto ? 'GEOMETRIA ENCEPADO (DIMS. AUTO)' : 'GEOMETRIA ENCEPADO (DIMS. USUARIO)');
  twoCol(`Lx = ${result.L_x.toFixed(0)} mm`, `Ly = ${result.L_y.toFixed(0)} mm`);
  twoCol(`e_borde = ${result.e_borde.toFixed(0)} mm`, `h_min = ${result.h_min.toFixed(0)} mm`);
  gap();

  // BIELAS Y TIRANTES
  secHeader('BIELAS Y TIRANTES (CE Anejo 19 §6.5)');
  twoCol(`th = ${result.theta_deg.toFixed(1)} deg`, `z_eff = ${result.z_eff.toFixed(0)} mm`);
  // Apoyo del nodo comprimido: placa de reparto o seccion del micro
  twoCol(
    plateOn
      ? `Nodo: placa ${inp.plate_shape === 'cuad' ? 'cuadrada' : 'circular'} ${inp.d_plate} mm`
      : `Nodo: micro d_p = ${inp.d_p} mm`,
    `A_nodo = ${result.A_node.toFixed(0)} mm2`,
  );
  twoCol(`sigma_biela = ${result.sigma_strut.toFixed(2)} MPa`, `sigma_Rd = ${result.sigma_Rd_max.toFixed(2)} MPa`);
  twoCol(`Ft,x = ${fmtSi(result.Ft_x, 'force')}`,
    result.Ft_y !== null ? `Ft,y = ${fmtSi(result.Ft_y, 'force')}` : '');
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
  twoCol(`lb,req = ${result.lb_net.toFixed(0)} mm`, `lb,disp = ${result.lb_avail.toFixed(0)} mm`);

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
    util:   M + 150,      // borde DERECHO (align:'right')
    status: PAGE_W - M,   // borde DERECHO (align:'right')
  };

  let rowY = tableY + 9;

  // Re-drawable column header — repeated on each continuation page so the
  // reader sees Valor/Limite/Ut%/Estado labels above continuation rows.
  // (Previously the page break only ran addPage without redrawing, leaving
  // anonymous columns on page 2+.)
  const drawChecksHeader = (atY: number): number => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    setGray(doc, 100);
    doc.text('Verificacion', COL.desc,   atY);
    doc.text('Valor',        COL.value,  atY);
    doc.text('Limite',       COL.limit,  atY);
    doc.text('Ut%',          COL.util,   atY, { align: 'right' });
    doc.text('Estado',       COL.status, atY, { align: 'right' });
    const lineY = atY + 2;
    doc.setLineWidth(0.2);
    setGray(doc, 160);
    doc.line(M, lineY, PAGE_W - M, lineY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    return lineY + 5;
  };

  rowY = drawChecksHeader(rowY);

  for (const chk of result.checks) {
    // Each row is description (4mm) + article (3mm) + separator (4mm) ≈ 11mm.
    // Predictive break with header repeat — never lose a check on overflow.
    rowY = ensureSpace(doc, rowY, 11, M, drawChecksHeader);

    const st = chk.status;
    setGray(doc, 50);
    doc.text(pdfStr(chk.description), COL.desc,   rowY);
    doc.text(pdfStr(chk.value ?? ''), COL.value,  rowY);
    doc.text(pdfStr(chk.limit ?? ''), COL.limit,  rowY);
    doc.text(`${(chk.utilization * 100).toFixed(0)}%`, COL.util, rowY, { align: 'right' });
    doc.setFont('helvetica', 'bold');
    setGray(doc, st === 'ok' ? 60 : 30);
    doc.text(STATUS_LABEL[st], COL.status, rowY, { align: 'right' });
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

  // ── Footer (every page) ─────────────────────────────────────────────────────
  // Previously hardcoded "Pagina 1" + only rendered on the active page after
  // pagination, so continuation pages had no footer AND the last page lied
  // about being page 1. Now: render on every page with correct N/M.
  const pageCount = doc.getNumberOfPages();
  const footerY = PAGE_H - 10;
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    setGray(doc, 150);
    doc.text('Concreta - concreta.app | CE Anejo 19 §6.5 / CTE DB-SE-C', M, footerY);
    doc.text(`Pagina ${i}/${pageCount}`, PAGE_W - M, footerY, { align: 'right' });
  }

  const filename = titledFilename(elementTitle, pileCapFallbackFilename(inp));
  const blob = doc.output('blob');
  const blobUrl = URL.createObjectURL(blob);
  return { blobUrl, filename, pageCount };
}
