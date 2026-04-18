// PDF export for Retaining Wall module
// A4 portrait — input summary, SVG section diagram, check table.

import jsPDF from 'jspdf';
import { svg2pdf } from 'svg2pdf.js';
import { type RetainingWallInputs } from '../../data/defaults';
import { type RetainingWallResult } from '../calculations/retainingWall';
import type { CheckStatus } from '../calculations/types';

import { PAGE_W, PAGE_H, setGray, type PdfResult } from './utils';

const M  = 18;

// NOTE: retainingWall uses abbreviated 'ADVERT.' — differs from shared STATUS_LABEL
const STATUS_LABEL: Record<CheckStatus, string> = {
  ok:   'CUMPLE',
  warn: 'ADVERT.',
  fail: 'INCUMPLE',
};

function hline(doc: jsPDF, y: number, gray = 200, lw = 0.2) {
  doc.setLineWidth(lw);
  setGray(doc, gray);
  doc.line(M, y, PAGE_W - M, y);
}

export async function exportRetainingWallPDF(
  inp: RetainingWallInputs,
  result: RetainingWallResult,
): Promise<PdfResult> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // ── Header ──────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  setGray(doc, 30);
  doc.text('Concreta \u2014 Muro de Contenci\u00f3n RC', M, M);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  setGray(doc, 120);
  doc.text(`Generado: ${new Date().toLocaleDateString('es-ES')}`, M, M + 5);

  hline(doc, M + 8, 200, 0.3);

  // ── Input summary ────────────────────────────────────────────────────────
  let y = M + 13;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  setGray(doc, 60);
  doc.text('GEOMETRIA Y MATERIALES', M, y);
  y += 4;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  setGray(doc, 80);

  const col1 = M;
  const col2 = M + 56;
  const col3 = M + 112;

  const B_m = (inp.bPunta as number) + (inp.tFuste as number) + (inp.bTalon as number);
  const rows: [string, string, string][] = [
    [`H = ${(inp.H as number).toFixed(2)} m`, `hf = ${(inp.hf as number).toFixed(2)} m`, `tFuste = ${(inp.tFuste as number).toFixed(2)} m`],
    [`bPunta = ${(inp.bPunta as number).toFixed(2)} m`, `bTalon = ${(inp.bTalon as number).toFixed(2)} m`, `B = ${B_m.toFixed(2)} m`],
    [`fck = ${inp.fck} N/mm\u00b2`, `fyk = ${inp.fyk} N/mm\u00b2`, `recub. = ${(inp.cover as number).toFixed(3)} m`],
    [`\u03b3s = ${inp.gammaSuelo} kN/m\u00b3`, `\u03b3sat = ${inp.gammaSat} kN/m\u00b3`, `\u03c6 = ${inp.phi}\u00b0  \u03b4 = ${inp.delta}\u00b0`],
    [`q = ${inp.q} kN/m\u00b2`, `\u03c3adm = ${inp.sigmaAdm} kPa`, `\u03bc = ${inp.mu}`],
    [`hw = ${(inp.hw as number).toFixed(2)} m`, `Ab = ${inp.Ab} g`, `S = ${inp.S}`],
  ];

  for (const [a, b, c] of rows) {
    doc.text(a, col1, y);
    doc.text(b, col2, y);
    doc.text(c, col3, y);
    y += 3.5;
  }

  hline(doc, y + 1, 180, 0.2);
  y += 4;

  // ── SVG section diagram ──────────────────────────────────────────────────
  const svgEl = document.getElementById('retaining-wall-svg-pdf');
  if (svgEl) {
    const svgNode = svgEl.querySelector('svg');
    if (svgNode) {
      const svgW = 80;
      const svgH = svgW * (430 / 380);
      try {
        await svg2pdf(svgNode, doc, { x: PAGE_W - M - svgW, y: M + 10, width: svgW, height: svgH });
      } catch {
        // SVG render failed — continue without diagram
      }
    }
  }

  // ── Key values ───────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  setGray(doc, 60);
  doc.text('VALORES CALCULADOS', M, y);
  y += 4;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  setGray(doc, 70);

  const kv: [string, string][] = [
    ['Ka (Coulomb)', result.Ka.toFixed(4)],
    ...(result.KAD !== undefined ? [['KAD (M-O)', result.KAD.toFixed(4)] as [string, string]] : []),
    ['EAH total', `${result.EAH_total.toFixed(2)} kN/m`],
    ['\u03a3V', `${result.ΣV.toFixed(2)} kN/m`],
    ['e', `${result.e.toFixed(3)} m`],
    ['\u03c3max', `${result.sigma_max.toFixed(1)} kPa`],
    ['\u03c3min', `${result.sigma_min.toFixed(1)} kPa`],
    ['FS vuelco', result.FS_vuelco.toFixed(2)],
    ['FS desliz.', result.FS_desliz.toFixed(2)],
  ];

  for (const [label, val] of kv) {
    doc.text(`${label}:`, M + 2, y);
    doc.text(val, M + 50, y);
    y += 3.2;
  }

  hline(doc, y + 1, 180, 0.2);
  y += 4;

  // ── Check table ──────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  setGray(doc, 60);
  doc.text('COMPROBACIONES', M, y);
  y += 3;

  const COL = { desc: M, value: M + 76, limit: M + 116, util: M + 148, status: M + 161 };

  hline(doc, y - 0.5, 180, 0.15);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  setGray(doc, 100);
  doc.text('Verificacion', COL.desc,   y);
  doc.text('Valor',        COL.value,  y);
  doc.text('Limite',       COL.limit,  y);
  doc.text('Ut%',          COL.util,   y);
  doc.text('Estado',       COL.status, y);
  y += 1.5;
  hline(doc, y, 170, 0.15);
  y += 3.5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);

  for (const ch of result.checks) {
    if (y > PAGE_H - M - 10) {
      doc.addPage();
      y = M + 10;
    }

    setGray(doc, 50);
    const desc = doc.splitTextToSize(ch.description, 70)[0] as string;
    doc.text(desc,       COL.desc,   y);
    doc.text(ch.value,   COL.value,  y);
    doc.text(ch.limit,   COL.limit,  y);
    const utilStr = isFinite(ch.utilization)
      ? `${(ch.utilization * 100).toFixed(0)}%`
      : '---';
    doc.text(utilStr, COL.util, y);
    setGray(doc, ch.status === 'ok' ? 70 : 30);
    doc.setFont('helvetica', 'bold');
    doc.text(STATUS_LABEL[ch.status], COL.status, y);
    doc.setFont('helvetica', 'normal');
    y += 3.5;

    setGray(doc, 160);
    doc.setFontSize(5.5);
    doc.text(ch.article, COL.desc + 2, y);
    doc.setFontSize(6.5);
    setGray(doc, 50);
    y += 2;

    hline(doc, y, 230, 0.1);
    y += 3;
  }

  // ── Footer ───────────────────────────────────────────────────────────────
  doc.setFontSize(6);
  setGray(doc, 180);
  doc.text('Concreta \u2014 Herramienta de c\u00e1lculo estructural. Verificar resultados antes de su uso en proyecto.', M, PAGE_H - 10);

  const filename = 'muro-contencion.pdf';
  const blob = doc.output('blob');
  const blobUrl = URL.createObjectURL(blob);
  const pageCount = (doc.internal as any).getNumberOfPages();
  return { blobUrl, filename, pageCount };
}
