// PDF export for Steel Beams module
// Uses jsPDF + svg2pdf.js to render the hidden PDF SVG clone into a PDF page.
// Page: A4 portrait, margins 20mm, grayscale section diagram + results table.

import jsPDF from 'jspdf';
import { svg2pdf } from 'svg2pdf.js';
import { type SteelBeamInputs } from '../../data/defaults';
import { type SteelBeamResult, type SteelCheckStatus } from '../../lib/calculations/steelBeams';

const PAGE_W = 210;  // mm A4
const PAGE_H = 297;
const M = 20;        // margin mm

type DisplayStatus = Exclude<SteelCheckStatus, 'neutral'>;

const STATUS_LABEL: Record<DisplayStatus, string> = {
  ok: 'CUMPLE',
  warn: 'ADVERTENCIA',
  fail: 'INCUMPLE',
};

function setGray(doc: jsPDF, gray: number) {
  doc.setTextColor(gray, gray, gray);
  doc.setDrawColor(gray, gray, gray);
}

export async function exportSteelBeamsPDF(inp: SteelBeamInputs, result: SteelBeamResult): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // ── Header ────────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  setGray(doc, 30);
  doc.text('Concreta — ELU/ELS Viga Acero', M, M);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  setGray(doc, 120);
  doc.text(`Generado: ${new Date().toLocaleDateString('es-ES')}`, M, M + 5);

  // Separator
  doc.setLineWidth(0.3);
  setGray(doc, 200);
  doc.line(M, M + 8, PAGE_W - M, M + 8);

  // ── SVG diagram (from hidden DOM element) ─────────────────────────────────
  const svgContainer = document.getElementById('steel-beams-svg-pdf');
  const svgEl = svgContainer?.querySelector('svg') as SVGSVGElement | null;

  let diagramH = 0;
  if (svgEl) {
    const SVG_W_MM = 100;
    const SVG_H_MM = 62;   // maintain 420:260 aspect ratio at 100mm width
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
  const infoX = M + 106;
  let infoY = M + 14;
  const lineH = 5;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  setGray(doc, 60);
  doc.text('PERFIL Y MATERIAL', infoX, infoY);
  infoY += lineH;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  setGray(doc, 80);

  const profileLabel = result.profile ? result.profile.label : `${inp.tipo} ${inp.size}`;
  const infoRows: Array<[string, string]> = [
    [profileLabel, inp.steel],
  ];

  for (const [left, right] of infoRows) {
    doc.text(left, infoX, infoY);
    if (right) doc.text(right, infoX + 30, infoY);
    infoY += lineH;
  }

  infoY += 2;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  setGray(doc, 60);
  doc.text('SOLICITACIONES ELU', infoX, infoY);
  infoY += lineH;

  doc.setFont('helvetica', 'normal');
  setGray(doc, 80);
  doc.text(`MEd = ${inp.MEd} kNm`, infoX, infoY);
  doc.text(`VEd = ${inp.VEd} kN`, infoX + 35, infoY);
  infoY += lineH;
  doc.text(`Lcr = ${inp.Lcr} mm`, infoX, infoY);
  doc.text(`C₁: ${inp.loadTypeLTB === 'uniform' ? '1.13' : '1.35'} (${inp.loadTypeLTB === 'uniform' ? 'unif.' : 'punt.'})`, infoX + 35, infoY);
  infoY += lineH;

  infoY += 2;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  setGray(doc, 60);
  doc.text('FLECHA ELS', infoX, infoY);
  infoY += lineH;

  doc.setFont('helvetica', 'normal');
  setGray(doc, 80);
  doc.text(`Mser = ${inp.Mser} kNm`, infoX, infoY);
  doc.text(`L = ${inp.L} mm`, infoX + 35, infoY);
  infoY += lineH;
  doc.text(`δadm = L/300 = ${(inp.L / 300).toFixed(1)} mm`, infoX, infoY);

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
    const checks = result.checks.filter((c) => !c.neutral);
    const hasFail = checks.some((c) => c.status === 'fail');
    const hasWarn = checks.some((c) => c.status === 'warn');
    const overallSt: DisplayStatus = hasFail ? 'fail' : hasWarn ? 'warn' : 'ok';
    const verdictLabel = STATUS_LABEL[overallSt];

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
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
    status: M + 170,
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

  for (const chk of result.checks) {
    if (rowY > PAGE_H - M - 10) {
      doc.addPage();
      rowY = M + 10;
    }

    if (chk.neutral) {
      // Classification row — show as info
      setGray(doc, 50);
      const desc = doc.splitTextToSize(chk.description, 75)[0] as string;
      doc.text(desc, COL.desc, rowY);
      doc.setFont('helvetica', 'bold');
      doc.text(chk.tag ?? '', COL.status, rowY);
      doc.setFont('helvetica', 'normal');
    } else {
      const st = chk.status as DisplayStatus;
      setGray(doc, 50);
      const desc = doc.splitTextToSize(chk.description, 75)[0] as string;
      doc.text(desc, COL.desc, rowY);
      doc.text(chk.value, COL.value, rowY);
      doc.text(chk.limit, COL.limit, rowY);
      doc.text(`${(chk.utilization * 100).toFixed(0)}%`, COL.util, rowY);

      setGray(doc, st === 'ok' ? 50 : 30);
      doc.setFont('helvetica', 'bold');
      doc.text(STATUS_LABEL[st], COL.status, rowY);
      doc.setFont('helvetica', 'normal');
    }

    rowY += 5;

    // Article reference
    setGray(doc, 150);
    doc.setFontSize(6);
    doc.text(chk.article, COL.desc + 2, rowY);
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
  doc.text('Concreta — concreta.app | CTE DB-SE-A España', M, footerY);
  doc.text('Página 1', PAGE_W - M, footerY, { align: 'right' });

  doc.save(`concreta-acero-viga-${new Date().toISOString().slice(0, 10)}.pdf`);
}
