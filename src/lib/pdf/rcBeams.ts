// PDF export for RC Beams module
// Uses jsPDF + svg2pdf.js to render the hidden SVG into a PDF page.
// Page: A4 portrait, margins 20mm, grayscale section diagram + two results tables.

import jsPDF from 'jspdf';
import { svg2pdf } from 'svg2pdf.js';
import { type RCBeamInputs } from '../../data/defaults';
import { type RCBeamResult, type RCBeamSectionResult, type CheckStatus } from '../calculations/rcBeams';

const PAGE_W = 210;
const PAGE_H = 297;
const M = 20;

const STATUS_LABEL: Record<CheckStatus, string> = {
  ok:   'CUMPLE',
  warn: 'ADVERTENCIA',
  fail: 'INCUMPLE',
};

function setGray(doc: jsPDF, gray: number) {
  doc.setTextColor(gray, gray, gray);
  doc.setDrawColor(gray, gray, gray);
}

function drawSectionTable(
  doc: jsPDF,
  section: RCBeamSectionResult,
  title: string,
  startY: number,
): number {
  let y = startY;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  setGray(doc, 40);
  doc.text(title, M, y);

  if (!section.valid) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    setGray(doc, 80);
    doc.text(section.error ?? 'Datos invalidos', M + 4, y + 5);
    return y + 12;
  }

  // Overall verdict for this section
  const checks = section.checks;
  const hasFail = checks.some((c) => c.status === 'fail');
  const hasWarn = checks.some((c) => c.status === 'warn');
  const overallStatus: CheckStatus = hasFail ? 'fail' : hasWarn ? 'warn' : 'ok';
  doc.setFont('helvetica', 'bold');
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
    `As=${section.As.toFixed(0)}mm2`,
    `x=${section.x.toFixed(0)}mm`,
    `MRd=${section.MRd.toFixed(1)}kNm`,
    `VRd=${section.VRd.toFixed(1)}kN`,
    `wk=${section.wk.toFixed(3)}mm`,
  ].join('   ');
  doc.text(keyVals, M, y);
  y += 5;

  // Rebar schedule + lap length
  doc.setFontSize(7);
  setGray(doc, 70);
  doc.text(`Despiece: ${section.rebarSchedule}    Solape min: ${section.lapLength}mm (CE art. 69.5.2)`, M, y);
  y += 4;

  // Separator
  doc.setLineWidth(0.2);
  setGray(doc, 200);
  doc.line(M, y, PAGE_W - M, y);
  y += 3;

  // Check table header
  const COL = { desc: M, value: M + 80, limit: M + 120, util: M + 155, status: M + 172 };
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  setGray(doc, 100);
  doc.text('Verificacion', COL.desc, y);
  doc.text('Valor', COL.value, y);
  doc.text('Limite', COL.limit, y);
  doc.text('Ut%', COL.util, y);
  doc.text('Estado', COL.status, y);
  y += 2;
  doc.setLineWidth(0.15);
  setGray(doc, 180);
  doc.line(M, y, PAGE_W - M, y);
  y += 3;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);

  for (const ch of checks) {
    if (y > PAGE_H - M - 10) {
      doc.addPage();
      y = M + 10;
    }

    setGray(doc, 50);
    const desc = doc.splitTextToSize(ch.description, 74)[0] as string;
    doc.text(desc, COL.desc, y);
    doc.text(ch.value, COL.value, y);
    doc.text(ch.limit, COL.limit, y);

    const utilStr = isFinite(ch.utilization)
      ? `${(ch.utilization * 100).toFixed(0)}%`
      : '---';
    doc.text(utilStr, COL.util, y);

    setGray(doc, ch.status === 'ok' ? 60 : 30);
    doc.setFont('helvetica', 'bold');
    doc.text(STATUS_LABEL[ch.status], COL.status, y);
    doc.setFont('helvetica', 'normal');
    setGray(doc, 50);

    y += 4;

    setGray(doc, 160);
    doc.setFontSize(5.5);
    doc.text(ch.article, COL.desc + 2, y);
    doc.setFontSize(6.5);
    setGray(doc, 50);

    y += 3;

    doc.setLineWidth(0.1);
    setGray(doc, 225);
    doc.line(M, y - 0.5, PAGE_W - M, y - 0.5);
  }

  return y + 2;
}

export async function exportRCBeamsPDF(inp: RCBeamInputs, result: RCBeamResult): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  setGray(doc, 30);
  doc.text('Concreta — ELU/ELS Viga Rectangular', M, M);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  setGray(doc, 120);
  doc.text(`Generado: ${new Date().toLocaleDateString('es-ES')}`, M, M + 5);

  doc.setLineWidth(0.3);
  setGray(doc, 200);
  doc.line(M, M + 8, PAGE_W - M, M + 8);

  // SVG diagram
  const svgContainer = document.getElementById('rc-beams-svg-pdf');
  const svgEl = svgContainer?.querySelector('svg') as SVGSVGElement | null;

  let diagramH = 0;
  if (svgEl) {
    const SVG_W_MM = 65;
    const SVG_H_MM = 80;
    await svg2pdf(svgEl, doc, { x: M, y: M + 12, width: SVG_W_MM, height: SVG_H_MM });
    diagramH = SVG_H_MM + 4;
  }

  // Input summary (right of diagram)
  const infoX = M + 70;
  let infoY = M + 14;
  const lineH = 4.5;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  setGray(doc, 60);
  doc.text('GEOMETRIA Y MATERIALES', infoX, infoY);
  infoY += lineH;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  setGray(doc, 80);

  const infoRows = [
    [`b = ${inp.b} mm`,        `h = ${inp.h} mm`],
    [`Recub. = ${inp.cover} mm`, `Estribos f${inp.stirrupDiam} (${inp.stirrupLegs}R)`],
    [`fck = ${inp.fck} MPa`,   `fyk = ${inp.fyk} MPa`],
    [`Exposicion: ${inp.exposureClass}`, `Uso: ${inp.loadType}`],
    [`Vano: ${inp.midspan_nBars}f${inp.midspan_barDiam}, s=${inp.midspan_stirrupSpacing}mm`, ``],
    [`Apoyo: ${inp.support_nBars}f${inp.support_barDiam}, s=${inp.support_stirrupSpacing}mm`, ``],
  ];

  for (const [left, right] of infoRows) {
    doc.text(left, infoX, infoY);
    if (right) doc.text(right, infoX + 42, infoY);
    infoY += lineH;
  }

  // Results — two sections
  let tableY = M + 12 + diagramH + 4;

  doc.setLineWidth(0.3);
  setGray(doc, 200);
  doc.line(M, tableY - 2, PAGE_W - M, tableY - 2);

  tableY = drawSectionTable(doc, result.midspan, 'VANO (Barras inferiores)', tableY);
  tableY += 3;

  doc.setLineWidth(0.2);
  setGray(doc, 210);
  doc.line(M, tableY - 2, PAGE_W - M, tableY - 2);

  tableY = drawSectionTable(doc, result.support, 'APOYO (Barras superiores)', tableY);

  // Footer
  const footerY = PAGE_H - 10;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  setGray(doc, 150);
  doc.text('Concreta — concreta.app | Codigo Estructural (CE) Espana', M, footerY);
  doc.text('Pagina 1', PAGE_W - M, footerY, { align: 'right' });

  doc.save(`concreta-viga-${new Date().toISOString().slice(0, 10)}.pdf`);
}
