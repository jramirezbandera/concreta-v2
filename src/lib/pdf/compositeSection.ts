// PDF export for Composite Section module
// Uses jsPDF + svg2pdf.js to render the hidden PDF SVG into an A4 page.
// Page: A4 portrait, margins 20mm.
//
// jsPDF built-in fonts (Helvetica) only cover latin-1.
// Superscripts (⁴, ³, ²) and mid-dots must be substituted before passing to doc.text().

import jsPDF from 'jspdf';
import { svg2pdf } from 'svg2pdf.js';
import { type CompositeSectionInputs } from '../../data/defaults';
import { type CompositeSectionResult } from '../../lib/calculations/compositeSection';
import { type CheckRow } from '../calculations/types';

// CheckRow.status is 'ok' | 'warn' | 'fail' (no neutral for composite section checks)
const PAGE_W = 210;
const PAGE_H = 297;
const M      = 20;   // page margin mm

function setGray(doc: jsPDF, g: number) {
  doc.setTextColor(g, g, g);
  doc.setDrawColor(g, g, g);
}

/** Replace non-latin-1 characters with ASCII equivalents. */
function pdfStr(s: string): string {
  return s
    .replace(/⁴/g, '^4')
    .replace(/³/g, '^3')
    .replace(/²/g, '^2')
    .replace(/·/g, 'x')
    .replace(/γ/g, 'gM0')
    .replace(/ε/g, 'eps')
    .replace(/\u2014/g, ' - ')
    .replace(/\u2013/g, '-')
    .replace(/[^\x00-\xFF]/g, '?');
}

function fmt(v: number, decimals = 1): string {
  return v.toFixed(decimals);
}

type CheckStatus = CheckRow['status'];

const STATUS_LABEL: Record<CheckStatus, string> = {
  ok:   'CUMPLE',
  warn: 'ADVERTENCIA',
  fail: 'INCUMPLE',
};

export async function exportCompositeSectionPDF(
  inp: CompositeSectionInputs,
  result: CompositeSectionResult,
): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // ── Header ───────────────────────────────────────────────────────────────────
  const modeLabel = inp.mode === 'reinforced'
    ? `${inp.profileType} ${inp.profileSize} + chapas`
    : 'Modo personalizado';

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  setGray(doc, 30);
  doc.text(`Concreta - Seccion Compuesta Acero - ${modeLabel}`, M, M);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  setGray(doc, 120);
  doc.text(`Generado: ${new Date().toLocaleDateString('es-ES')}`, M, M + 5);

  doc.setLineWidth(0.3);
  setGray(doc, 200);
  doc.line(M, M + 8, PAGE_W - M, M + 8);

  // ── SVG: cross-section ───────────────────────────────────────────────────────
  const svgContainer = document.getElementById('composite-section-svg-pdf');
  const svgEl = svgContainer?.querySelector('svg') as SVGSVGElement | null;

  const SVG_W = 80;
  const SVG_H = 90;   // taller than steelBeams — composite sections can be tall
  const svgX  = M;
  const svgY  = M + 12;

  if (svgEl) {
    await svg2pdf(svgEl, doc, { x: svgX, y: svgY, width: SVG_W, height: SVG_H });
  }

  // ── Right column: inputs + key section properties ───────────────────────────
  const COL_R  = M + 88;
  const COL_R2 = COL_R + 40;
  const LH     = 4.5;
  let ry = M + 14;

  const sectionHeader = (label: string) => {
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

  // PERFIL Y MATERIAL
  sectionHeader('PERFIL Y MATERIAL');
  twoCol(modeLabel, inp.grade);
  if (inp.mode === 'reinforced') {
    twoCol(`fy = ${result.fy_MPa} MPa`, `gM0 = 1.05`);
  } else {
    twoCol(`fy = ${result.fy_MPa} MPa`, '');
  }
  gap();

  // PROPIEDADES COMPUESTAS
  sectionHeader('PROPIEDADES COMPUESTAS');
  twoCol(`A = ${fmt(result.A_cm2, 1)} cm^2`,  `yc = ${fmt(result.yc_mm, 1)} mm`);
  twoCol(`Iy = ${fmt(result.Iy_cm4, 0)} cm^4`, `Wel,min = ${fmt(result.Wel_min_cm3, 0)} cm^3`);
  twoCol(`Wpl = ${fmt(result.Wpl_cm3, 0)} cm^3`, `alfa = ${result.shapeFactor.toFixed(3)}`);
  gap();

  // CLASIFICACION
  if (result.sectionClass !== null) {
    sectionHeader('CLASIFICACION CE art. 5.2');
    twoCol(`eps = ${result.epsilon?.toFixed(3) ?? '—'}`, `Clase ${result.sectionClass}`);
    if (result.webRatio !== null) {
      twoCol(`c/tw = ${result.webRatio.toFixed(1)} (alma)`, `Clase alma: ${result.webClass}`);
    }
    if (result.flangeTopRatio !== null) {
      twoCol(`c/tf = ${result.flangeTopRatio.toFixed(1)} (ala sup)`, `Clase: ${result.flangeTopClass}`);
    }
    if (result.flangeBotRatio !== null) {
      twoCol(`c/tf = ${result.flangeBotRatio.toFixed(1)} (ala inf)`, `Clase: ${result.flangeBotClass}`);
    }
    gap();
  }

  // MOMENTO RESISTENTE
  sectionHeader('MOMENTO RESISTENTE');
  if (result.sectionClass === 4) {
    twoCol('MRd = N/D (Clase 4)', 'Requiere seccion eficaz EN 1993-1-5');
  } else if (result.sectionClass !== null && result.sectionClass <= 2) {
    twoCol(`MRd = Wpl x fy / gM0`, `= ${fmt(result.Mrd_kNm)} kNm`);
  } else {
    twoCol(`MRd = Wel,min x fy / gM0`, `= ${fmt(result.Mrd_kNm)} kNm`);
  }

  // ── Divider before classification checks table ───────────────────────────────
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
  const overall: CheckStatus = hasFail ? 'fail' : hasWarn ? 'warn' : 'ok';

  if (result.sectionClass !== null && result.checks.length > 0) {
    doc.setFontSize(11);
    setGray(doc, 30);
    doc.text(STATUS_LABEL[overall], PAGE_W - M, tableY + 3, { align: 'right' });
  } else if (result.sectionClass === null) {
    doc.setFontSize(9);
    setGray(doc, 120);
    doc.text('Modo personalizado — sin clasificacion EC3', PAGE_W - M, tableY + 3, { align: 'right' });
  }

  // Table column positions
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
  doc.text('Verificacion',  COL.desc,   rowY);
  doc.text('Valor',         COL.value,  rowY);
  doc.text('Limite',        COL.limit,  rowY);
  doc.text('Ut%',           COL.util,   rowY);
  doc.text('Estado',        COL.status, rowY);
  rowY += 2;

  doc.setLineWidth(0.2);
  setGray(doc, 160);
  doc.line(M, rowY, PAGE_W - M, rowY);
  rowY += 5;

  // Data rows
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);

  if (result.checks.length === 0) {
    // Custom mode: no classification checks, just show Mrd summary
    setGray(doc, 80);
    doc.setFontSize(7);
    doc.text('Sin verificaciones de clasificacion (modo personalizado).', M, rowY);
    rowY += LH;
    doc.text(
      result.class4Warning
        ? 'MRd = N/D (Clase 4 — requiere seccion eficaz per EN 1993-1-5)'
        : `MRd = ${fmt(result.Mrd_kNm)} kNm`,
      M, rowY,
    );
  } else {
    for (const chk of result.checks) {
      if (rowY > PAGE_H - M - 14) {
        doc.addPage();
        rowY = M + 10;
      }

      const st = chk.status;
      setGray(doc, 50);
      doc.text(pdfStr(chk.description), COL.desc, rowY);
      doc.text(pdfStr(chk.value),        COL.value,  rowY);
      doc.text(pdfStr(chk.limit),        COL.limit,  rowY);
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
  }

  // ── Footer ───────────────────────────────────────────────────────────────────
  const footerY = PAGE_H - 10;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  setGray(doc, 150);
  doc.text('Concreta - concreta.app | CE art. 5.2 / EN 1993-1-1 Espana', M, footerY);
  doc.text('Pagina 1', PAGE_W - M, footerY, { align: 'right' });

  doc.save(`concreta-seccion-compuesta-${new Date().toISOString().slice(0, 10)}.pdf`);
}
