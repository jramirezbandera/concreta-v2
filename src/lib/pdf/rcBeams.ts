// PDF export for RC Beams module
// Uses jsPDF + svg2pdf.js to render the hidden PDF SVG clone into a PDF page.
// Page: A4 portrait, margins 20mm, grayscale section diagram + results table.

import jsPDF from 'jspdf';
import { svg2pdf } from 'svg2pdf.js';
import { type RCBeamInputs } from '../../data/defaults';
import { type RCBeamResult, type CheckStatus } from '../calculations/rcBeams';

const PAGE_W = 210;  // mm A4
const PAGE_H = 297;
const M = 20;        // margin mm

const STATUS_LABEL: Record<CheckStatus, string> = {
  ok: 'CUMPLE',
  warn: 'ADVERTENCIA',
  fail: 'INCUMPLE',
};

function setGray(doc: jsPDF, gray: number) {
  doc.setTextColor(gray, gray, gray);
  doc.setDrawColor(gray, gray, gray);
}

export async function exportRCBeamsPDF(inp: RCBeamInputs, result: RCBeamResult): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // ── Header ────────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  setGray(doc, 30);
  doc.text('Concreta — ELU/ELS Viga Rectangular', M, M);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  setGray(doc, 120);
  doc.text(`Generado: ${new Date().toLocaleDateString('es-ES')}`, M, M + 5);

  // Separator
  doc.setLineWidth(0.3);
  setGray(doc, 200);
  doc.line(M, M + 8, PAGE_W - M, M + 8);

  // ── SVG diagram (from hidden DOM element) ─────────────────────────────────
  const svgContainer = document.getElementById('rc-beams-svg-pdf');
  const svgEl = svgContainer?.querySelector('svg') as SVGSVGElement | null;

  let diagramH = 0;
  if (svgEl) {
    const SVG_W_MM = 70;
    const SVG_H_MM = 84;  // maintain 300:360 aspect ratio at 70mm width
    const svgX = M;
    const svgY = M + 12;

    await svg2pdf(svgEl, doc, {
      x: svgX,
      y: svgY,
      width: SVG_W_MM,
      height: SVG_H_MM,
    });

    diagramH = SVG_H_MM + 4;
  }

  // ── Input summary (right of diagram) ─────────────────────────────────────
  const infoX = M + 76;
  let infoY = M + 14;
  const lineH = 5;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  setGray(doc, 60);
  doc.text('GEOMETRÍA Y MATERIALES', infoX, infoY);
  infoY += lineH;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  setGray(doc, 80);

  const infoRows = [
    [`b = ${inp.b} mm`, `h = ${inp.h} mm`],
    [`Recub. = ${inp.cover} mm`, `d = ${result.d.toFixed(0)} mm`],
    [`${inp.nBars}φ${inp.barDiam}`, `As = ${result.As.toFixed(0)} mm²`],
    [`Est. φ${inp.stirrupDiam}/${inp.stirrupSpacing}`, `${inp.stirrupLegs} ramas`],
    [`fck = ${inp.fck} MPa`, `fyk = ${inp.fyk} MPa`],
    [`Exp. ${inp.exposureClass}`, ``],
  ];

  for (const [left, right] of infoRows) {
    doc.text(left, infoX, infoY);
    if (right) doc.text(right, infoX + 40, infoY);
    infoY += lineH;
  }

  infoY += 3;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  setGray(doc, 60);
  doc.text('SOLICITACIONES', infoX, infoY);
  infoY += lineH;

  doc.setFont('helvetica', 'normal');
  setGray(doc, 80);
  doc.text(`Md = ${inp.Md} kNm`, infoX, infoY);
  doc.text(`VEd = ${inp.VEd} kN`, infoX + 40, infoY);
  infoY += lineH;
  doc.text(`Ms = ${inp.Ms} kNm`, infoX, infoY);

  // ── Computed values ────────────────────────────────────────────────────────
  const tableY = M + 12 + diagramH + 4;

  doc.setLineWidth(0.3);
  setGray(doc, 200);
  doc.line(M, tableY - 2, PAGE_W - M, tableY - 2);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  setGray(doc, 60);
  doc.text('RESULTADOS', M, tableY + 3);

  // Overall verdict
  if (result.valid) {
    const checks = result.checks;
    const hasFail = checks.some((c) => c.status === 'fail');
    const hasWarn = checks.some((c) => c.status === 'warn');
    const overallStatus: CheckStatus = hasFail ? 'fail' : hasWarn ? 'warn' : 'ok';
    const verdictLabel = STATUS_LABEL[overallStatus];

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    // grayscale: ok→dark, warn→mid, fail→dark (no color in PDF)
    setGray(doc, 30);
    doc.text(verdictLabel, PAGE_W - M, tableY + 3, { align: 'right' });
  }

  // Check table
  let rowY = tableY + 9;
  const COL = {
    desc: M,
    value: M + 80,
    limit: M + 120,
    util: M + 155,
    status: M + 175,
  };

  // Table header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  setGray(doc, 100);
  doc.text('Verificación', COL.desc, rowY);
  doc.text('Valor', COL.value, rowY);
  doc.text('Límite', COL.limit, rowY);
  doc.text('Ut%', COL.util, rowY);
  doc.text('Estado', COL.status, rowY);
  rowY += 2;

  doc.setLineWidth(0.2);
  setGray(doc, 180);
  doc.line(M, rowY, PAGE_W - M, rowY);
  rowY += 4;

  // Table rows
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);

  for (const check of result.checks) {
    if (rowY > PAGE_H - M - 10) {
      doc.addPage();
      rowY = M + 10;
    }

    setGray(doc, 50);
    // Truncate description if too long
    const descMaxW = 75;
    const desc = doc.splitTextToSize(check.description, descMaxW)[0] as string;
    doc.text(desc, COL.desc, rowY);
    doc.text(check.value, COL.value, rowY);
    doc.text(check.limit, COL.limit, rowY);
    doc.text(`${(check.utilization * 100).toFixed(0)}%`, COL.util, rowY);

    setGray(doc, check.status === 'ok' ? 50 : 30);
    doc.setFont('helvetica', 'bold');
    doc.text(STATUS_LABEL[check.status], COL.status, rowY);
    doc.setFont('helvetica', 'normal');

    rowY += 5;

    // Article reference
    setGray(doc, 150);
    doc.setFontSize(6);
    doc.text(check.article, COL.desc + 2, rowY);
    doc.setFontSize(7);
    setGray(doc, 50);

    rowY += 4;

    // Row separator
    doc.setLineWidth(0.1);
    setGray(doc, 220);
    doc.line(M, rowY - 1, PAGE_W - M, rowY - 1);
  }

  // ── Footer ─────────────────────────────────────────────────────────────────
  const footerY = PAGE_H - 10;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  setGray(doc, 150);
  doc.text('Concreta — concreta.app | Código Estructural (CE) España', M, footerY);
  doc.text(`Página 1`, PAGE_W - M, footerY, { align: 'right' });

  doc.save(`concreta-viga-${new Date().toISOString().slice(0, 10)}.pdf`);
}
