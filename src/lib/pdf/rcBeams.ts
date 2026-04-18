// PDF export for RC Beams module
// Uses jsPDF + svg2pdf.js to render the hidden SVG into a PDF page.
// Page: A4 portrait, margins 20mm, grayscale section diagram + two results tables.

import jsPDF from 'jspdf';
import { svg2pdf } from 'svg2pdf.js';
import { type RCBeamInputs } from '../../data/defaults';
import { type RCBeamResult, type RCBeamSectionResult, type CheckStatus } from '../calculations/rcBeams';

import { PAGE_W, PAGE_H, setGray, STATUS_LABEL, type PdfResult } from './utils';

const M  = 20;          // margin
const CW = PAGE_W - 2 * M;  // content width = 170mm

function hline(doc: jsPDF, y: number, gray = 200, lw = 0.2) {
  doc.setLineWidth(lw);
  setGray(doc, gray);
  doc.line(M, y, PAGE_W - M, y);
}

function drawSectionTable(
  doc: jsPDF,
  section: RCBeamSectionResult,
  title: string,
  startY: number,
): number {
  let y = startY;

  // Section title + verdict on same line
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  setGray(doc, 30);
  doc.text(title, M, y);

  if (!section.valid) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    setGray(doc, 80);
    doc.text(section.error ?? 'Datos invalidos', M + 4, y + 5);
    return y + 12;
  }

  const checks = section.checks;
  const hasFail = checks.some((c) => c.status === 'fail');
  const hasWarn = checks.some((c) => c.status === 'warn');
  const overallStatus: CheckStatus = hasFail ? 'fail' : hasWarn ? 'warn' : 'ok';
  doc.setFontSize(8);
  setGray(doc, 30);
  doc.text(STATUS_LABEL[overallStatus], PAGE_W - M, y, { align: 'right' });

  y += 5;

  // Key values row
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  setGray(doc, 70);
  const keyVals = [
    `d=${section.d.toFixed(0)}mm`,
    `As,t=${section.As.toFixed(0)}mm²`,
    `As,c=${section.AsComp.toFixed(0)}mm²`,
    `x=${section.x.toFixed(0)}mm`,
    `MRd=${section.MRd.toFixed(1)}kNm`,
    `VRd=${section.VRd.toFixed(1)}kN`,
    `wk=${section.wk.toFixed(3)}mm`,
  ].join('   ');
  doc.text(keyVals, M, y);
  y += 5;

  // Rebar schedule + lap length
  doc.text(`Despiece: ${section.rebarSchedule}    Solape min: ${section.lapLength}mm (CE art. 69.5.2)`, M, y);
  y += 5;

  // Table header
  hline(doc, y - 1, 180, 0.15);
  const COL = { desc: M, value: M + 80, limit: M + 120, util: M + 152, status: M + 165 };
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  setGray(doc, 100);
  doc.text('Verificacion',  COL.desc,   y);
  doc.text('Valor',         COL.value,  y);
  doc.text('Limite',        COL.limit,  y);
  doc.text('Ut%',           COL.util,   y);
  doc.text('Estado',        COL.status, y);
  y += 1.5;
  hline(doc, y, 170, 0.15);
  y += 3.5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);

  for (const ch of checks) {
    if (y > PAGE_H - M - 10) {
      doc.addPage();
      y = M + 10;
    }

    // Description
    setGray(doc, 50);
    const desc = doc.splitTextToSize(ch.description, 74)[0] as string;
    doc.text(desc, COL.desc, y);
    doc.text(ch.value, COL.value, y);
    doc.text(ch.limit, COL.limit, y);
    const utilStr = isFinite(ch.utilization)
      ? `${(ch.utilization * 100).toFixed(0)}%`
      : '---';
    doc.text(utilStr, COL.util, y);
    setGray(doc, ch.status === 'ok' ? 70 : 30);
    doc.setFont('helvetica', 'bold');
    doc.text(STATUS_LABEL[ch.status], COL.status, y);
    doc.setFont('helvetica', 'normal');
    y += 3.5;

    // Article reference — smaller, below the row
    setGray(doc, 160);
    doc.setFontSize(5.5);
    doc.text(ch.article, COL.desc + 2, y);
    doc.setFontSize(6.5);
    setGray(doc, 50);
    y += 2;

    // Separator AFTER article text, with enough clearance for next row
    hline(doc, y, 230, 0.1);
    y += 3;
  }

  return y + 1;
}

export async function exportRCBeamsPDF(inp: RCBeamInputs, result: RCBeamResult): Promise<PdfResult> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // ── Header ────────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  setGray(doc, 30);
  doc.text('Concreta — ELU/ELS Viga Rectangular', M, M);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  setGray(doc, 120);
  doc.text(`Generado: ${new Date().toLocaleDateString('es-ES')}`, M, M + 5);

  hline(doc, M + 8, 200, 0.3);

  // ── Input summary — compact, 3-column grid ─────────────────────────────────
  let infoY = M + 13;
  const lineH = 4;

  const COL1 = M;
  const COL2 = M + 58;
  const COL3 = M + 116;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  setGray(doc, 60);
  doc.text('GEOMETRIA Y MATERIALES', COL1, infoY);
  infoY += lineH;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  setGray(doc, 80);

  const infoLines: Array<[string, string, string]> = [
    [`b = ${inp.b} mm`,              `h = ${inp.h} mm`,            `Recub. = ${inp.cover} mm`],
    [`fck = ${inp.fck} MPa`,         `fyk = ${inp.fyk} MPa`,       `Exp.: ${inp.exposureClass}  Uso: ${inp.loadType}`],
    [`Vano inf.(t): ${inp.vano_bot_nBars}\u00d8${inp.vano_bot_barDiam}`,  `sup.(c): ${inp.vano_top_nBars}\u00d8${inp.vano_top_barDiam}`, `estr.: \u00d8${inp.vano_stirrupDiam}/c${inp.vano_stirrupSpacing} (${inp.vano_stirrupLegs}R)`],
    [`Apoyo sup.(t): ${inp.apoyo_top_nBars}\u00d8${inp.apoyo_top_barDiam}`, `inf.(c): ${inp.apoyo_bot_nBars}\u00d8${inp.apoyo_bot_barDiam}`, `estr.: \u00d8${inp.apoyo_stirrupDiam}/c${inp.apoyo_stirrupSpacing} (${inp.apoyo_stirrupLegs}R)`],
  ];

  for (const [c1, c2, c3] of infoLines) {
    doc.text(c1, COL1, infoY);
    doc.text(c2, COL2, infoY);
    doc.text(c3, COL3, infoY);
    infoY += lineH;
  }

  hline(doc, infoY, 210, 0.2);
  infoY += 4;

  // ── SVG diagrams — side by side ───────────────────────────────────────────
  const SVG_GAP = 6;
  const SVG_W = (CW - SVG_GAP) / 2;   // ~82mm each
  const SVG_H = 68;

  const xVano  = M;
  const xApoyo = M + SVG_W + SVG_GAP;
  const svgY   = infoY;

  const svgVano  = document.getElementById('rc-beams-svg-pdf-vano')?.querySelector('svg')  as SVGSVGElement | null;
  const svgApoyo = document.getElementById('rc-beams-svg-pdf-apoyo')?.querySelector('svg') as SVGSVGElement | null;

  if (svgVano) {
    try {
      await svg2pdf(svgVano, doc, { x: xVano, y: svgY, width: SVG_W, height: SVG_H });
    } catch {
      console.warn('rc-beams PDF: failed to render VANO SVG');
    }
  }
  if (svgApoyo) {
    try {
      await svg2pdf(svgApoyo, doc, { x: xApoyo, y: svgY, width: SVG_W, height: SVG_H });
    } catch {
      console.warn('rc-beams PDF: failed to render APOYO SVG');
    }
  }

  // Captions below each SVG
  const captionY = svgY + SVG_H + 3;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  setGray(doc, 120);
  doc.text('VANO \u2014 M+  (compresion cara superior)', xVano, captionY);
  doc.text('APOYO \u2014 M\u2212  (compresion cara inferior)', xApoyo, captionY);

  const diagramBlockEnd = captionY + 5;

  hline(doc, diagramBlockEnd, 200, 0.25);

  // ── Results tables ─────────────────────────────────────────────────────────
  let tableY = diagramBlockEnd + 5;

  tableY = drawSectionTable(doc, result.vano, 'VANO (M+, barras inf. traccion)', tableY);
  tableY += 2;

  hline(doc, tableY - 1, 210, 0.2);
  tableY += 3;

  tableY = drawSectionTable(doc, result.apoyo, 'APOYO (M\u2212, barras sup. traccion)', tableY);

  // ── Footer ─────────────────────────────────────────────────────────────────
  const footerY = PAGE_H - 10;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  setGray(doc, 150);
  doc.text('Concreta \u2014 concreta.app | Codigo Estructural (CE) Espana', M, footerY);
  doc.text('Pagina 1', PAGE_W - M, footerY, { align: 'right' });

  const filename = `concreta-viga-${new Date().toISOString().slice(0, 10)}.pdf`;
  const blob = doc.output('blob');
  const blobUrl = URL.createObjectURL(blob);
  const pageCount = doc.internal.getNumberOfPages();
  return { blobUrl, filename, pageCount };
}
