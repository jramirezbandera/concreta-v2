// PDF export for Steel Columns module — Technical memoir / visado quality
// A4 portrait, margins 15mm, structured as:
//   1. Header (branding + module + normative refs + date)
//   2. Two-column inputs block (section/geometry | loads)
//   3. SVG diagram (cross-section + column geometry)
//   4. Checks table (description, value, limit, ut%, status, article)
//   5. Key intermediate values
//   6. Footer on every page
//
// jsPDF built-in fonts (Helvetica) cover latin-1 only.
// Greek letters (λ, χ, β) and special chars must be substituted with ASCII.

import jsPDF from 'jspdf';
import { svg2pdf } from 'svg2pdf.js';
import { type SteelColumnInputs, type ColumnBCType } from '../../data/defaults';
import { type SteelColumnResult } from '../calculations/steelColumns';
import { type SteelCheckStatus } from '../calculations/steelBeams';

import { PAGE_W, PAGE_H, setGray, pdfStr, STATUS_LABEL, type PdfResult } from './utils';

const M  = 15;   // margin mm
const CW = PAGE_W - 2 * M;  // content width = 180mm

type DisplayStatus = Exclude<SteelCheckStatus, 'neutral'>;

// Table column x-positions for checks table
const COL = {
  desc:   M,           // description
  value:  M + 88,      // demand value
  limit:  M + 113,     // capacity / limit
  util:   M + 139,     // utilization %
  status: M + 152,     // CUMPLE / INCUMPLE
  art:    PAGE_W - M,  // normative article (right-aligned)
};

function fmt(v: number, d = 1): string {
  return v.toFixed(d);
}

const BC_LABEL: Record<ColumnBCType, string> = {
  pp:     'Art.-Art. (beta=1.0)',
  pf:     'Art.-Emp. (beta=0.7)',
  ff:     'Emp.-Emp. (beta=0.5)',
  fc:     'Emp.-Libre (beta=2.0)',
  custom: 'Personalizado',
};

let _pageNum = 1;

function drawPageFooter(doc: jsPDF) {
  const footerY = PAGE_H - 7;
  setGray(doc, 150);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.text(
    'concreta.app  |  Codigo Estructural DB-SE-A / EC3  |  gamM0 = 1.05  |  gamM1 = 1.05',
    M, footerY,
  );
  doc.text(`Pag. ${_pageNum}`, PAGE_W - M, footerY, { align: 'right' });
  // thin rule above footer
  setGray(doc, 210);
  doc.setLineWidth(0.1);
  doc.line(M, footerY - 2, PAGE_W - M, footerY - 2);
}

function addPage(doc: jsPDF): number {
  drawPageFooter(doc);
  doc.addPage();
  _pageNum++;
  return M + 5;
}

function checkPageBreak(doc: jsPDF, y: number, need = 8): number {
  if (y > PAGE_H - M - 14 - need) {
    return addPage(doc);
  }
  return y;
}

export async function exportSteelColumnsPDF(
  inp: SteelColumnInputs,
  result: SteelColumnResult,
): Promise<PdfResult> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  _pageNum = 1;
  let y = M;

  // ── 1. Header ──────────────────────────────────────────────────────────────
  setGray(doc, 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('concreta', M, y);

  const dateStr = new Date().toLocaleDateString('es-ES', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
  setGray(doc, 100);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(dateStr, PAGE_W - M, y, { align: 'right' });

  y += 5;
  setGray(doc, 20);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Pilares de Acero — Verificacion ELU  (EC3 §6.3 / CE DB-SE-A)', M, y);

  y += 4;
  setGray(doc, 110);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(
    'Codigo Estructural DB-SE-A  |  Eurocodigo 3 EN 1993-1-1  |  Clasificacion seccion, pandeo, pandeo lateral, interaccion N+M',
    M, y,
  );

  y += 3;
  setGray(doc, 200);
  doc.setLineWidth(0.3);
  doc.line(M, y, PAGE_W - M, y);
  y += 5;

  // ── 2. Inputs — two-column layout ──────────────────────────────────────────
  const colW = (CW - 6) / 2;  // two equal columns with 6mm gap

  // Left column: section & geometry
  setGray(doc, 50);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('DATOS DE SECCION Y GEOMETRIA', M, y);

  // Right column: loads
  doc.text('ESFUERZOS DE CALCULO', M + colW + 6, y);
  y += 4;

  const rowH = 4.5;
  const leftRows: [string, string][] = [
    ['Perfil',           `${inp.sectionType} ${inp.size}`],
    ['Acero',            inp.steel],
    ['Ly (eje fuerte)',  `${fmt(inp.Ly / 1000, 2)} m`],
    ['Lz (eje debil)',   `${fmt(inp.Lz / 1000, 2)} m`],
    ['Cond. de apoyo',   BC_LABEL[inp.bcType]],
    ['betay / betaz',    `${inp.beta_y.toFixed(2)}  /  ${inp.beta_z.toFixed(2)}`],
    ['Lky (eje fuerte)', `${fmt(inp.beta_y * inp.Ly / 1000, 2)} m`],
    ['Lkz (eje debil)',  `${fmt(inp.beta_z * inp.Lz / 1000, 2)} m`],
  ];
  const rightRows: [string, string][] = [
    ['NEd',    `${fmt(inp.Ned, 1)} kN`],
    ['My,Ed',  `${fmt(inp.My_Ed, 1)} kNm`],
    ['Mz,Ed',  `${fmt(inp.Mz_Ed, 1)} kNm`],
  ];

  doc.setFontSize(7.5);
  const maxRows = Math.max(leftRows.length, rightRows.length);
  for (let i = 0; i < maxRows; i++) {
    if (leftRows[i]) {
      const [lbl, val] = leftRows[i];
      setGray(doc, 90);
      doc.setFont('helvetica', 'normal');
      doc.text(pdfStr(lbl), M, y);
      setGray(doc, 20);
      doc.setFont('helvetica', 'bold');
      doc.text(pdfStr(val), M + 42, y);
    }
    if (rightRows[i]) {
      const [lbl, val] = rightRows[i];
      setGray(doc, 90);
      doc.setFont('helvetica', 'normal');
      doc.text(pdfStr(lbl), M + colW + 6, y);
      setGray(doc, 20);
      doc.setFont('helvetica', 'bold');
      doc.text(pdfStr(val), M + colW + 6 + 30, y);
    }
    y += rowH;
  }

  y += 3;
  setGray(doc, 200);
  doc.setLineWidth(0.2);
  doc.line(M, y, PAGE_W - M, y);
  y += 4;

  // ── 3. SVG diagram ────────────────────────────────────────────────────────
  const container = document.getElementById('steel-columns-svg-pdf');
  const svgEl = container?.querySelector('svg') as SVGSVGElement | null;

  if (svgEl) {
    const SVG_NATIVE_W = 380;
    const SVG_NATIVE_H = 190;
    const scale  = CW / SVG_NATIVE_W;
    const rendH  = SVG_NATIVE_H * scale;

    y = checkPageBreak(doc, y, rendH + 10);

    try {
      await svg2pdf(svgEl, doc, { x: M, y, width: CW, height: rendH });
      y += rendH + 2;
    } catch {
      // svg2pdf failed — skip diagram silently
    }

    // diagram caption
    setGray(doc, 140);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.text(
      `Seccion transversal y geometria de pandeo  |  ${inp.sectionType} ${inp.size}  ${inp.steel}`,
      PAGE_W / 2, y, { align: 'center' },
    );
    y += 4;
  }

  setGray(doc, 200);
  doc.setLineWidth(0.2);
  doc.line(M, y, PAGE_W - M, y);
  y += 4;

  // ── 4. Checks table ────────────────────────────────────────────────────────
  setGray(doc, 30);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('VERIFICACIONES', M, y);
  y += 4;

  // Table header
  setGray(doc, 90);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.text('Verificacion', COL.desc, y);
  doc.text('Valor', COL.value, y);
  doc.text('Limite', COL.limit, y);
  doc.text('Ut%', COL.util, y);
  doc.text('Estado', COL.status, y);
  doc.text('Normativa', COL.art, y, { align: 'right' });
  y += 2;
  setGray(doc, 180);
  doc.setLineWidth(0.15);
  doc.line(M, y, PAGE_W - M, y);
  y += 3;

  for (const c of result.checks) {
    y = checkPageBreak(doc, y, 10);

    if (c.neutral) {
      // Neutral row — classification etc.
      setGray(doc, 90);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.text(pdfStr(c.description), COL.desc, y);
      setGray(doc, 60);
      doc.setFont('helvetica', 'bold');
      doc.text(pdfStr(c.tag ?? '—'), COL.status, y);
      setGray(doc, 150);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      doc.text(pdfStr(c.article), COL.art, y, { align: 'right' });
    } else {
      const status = c.status as DisplayStatus;
      const utilPct = c.utilization * 100;

      // Description
      setGray(doc, 40);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      const descLine = doc.splitTextToSize(pdfStr(c.description), 84)[0] as string;
      doc.text(descLine, COL.desc, y);

      // Value
      setGray(doc, 30);
      doc.setFont('helvetica', 'normal');
      doc.text(pdfStr(c.value), COL.value, y);

      // Limit
      doc.text(pdfStr(c.limit), COL.limit, y);

      // Utilization %
      setGray(doc, 20);
      doc.setFont('helvetica', 'bold');
      doc.text(
        isFinite(c.utilization) ? `${Math.min(utilPct, 999).toFixed(0)}%` : '---',
        COL.util, y,
      );

      // Status label
      const statusColor = status === 'ok' ? 50 : status === 'warn' ? 30 : 0;
      setGray(doc, statusColor);
      doc.text(STATUS_LABEL[status], COL.status, y);

      // Normative article
      setGray(doc, 140);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(5.5);
      doc.text(pdfStr(c.article), COL.art, y, { align: 'right' });

      // Utilization bar — drawn below text, spans value→status columns
      const barX  = COL.value;
      const barW  = COL.status - COL.value - 2;
      const barH  = 1.4;
      const fillW = barW * Math.min(c.utilization, 1);
      // track: y+1 … y+2.4  (bar) | y+5 (separator line) | y+8 (next row)
      doc.setFillColor(220, 220, 220);
      doc.rect(barX, y + 1.5, barW, barH, 'F');
      const barRgb = status === 'ok' ? 110 : status === 'warn' ? 60 : 20;
      doc.setFillColor(barRgb, barRgb, barRgb);
      if (fillW > 0) doc.rect(barX, y + 1.5, fillW, barH, 'F');
    }

    // Separator — drawn at y+5.5, well below bar and above next row text (y+8)
    setGray(doc, 225);
    doc.setLineWidth(0.08);
    doc.line(M, y + 5.5, PAGE_W - M, y + 5.5);
    y += 8;
  }

  y += 2;
  setGray(doc, 180);
  doc.setLineWidth(0.2);
  doc.line(M, y, PAGE_W - M, y);
  y += 5;

  // ── 5. Key intermediate values ─────────────────────────────────────────────
  y = checkPageBreak(doc, y, 40);

  setGray(doc, 30);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('VALORES CLAVE', M, y);
  y += 4;

  // Two-column layout for key values
  const kvLeft: [string, string][] = [
    ['NRd',      `${fmt(result.NRd, 1)} kN`],
    ['My,Rd',    `${fmt(result.My_Rd, 1)} kNm`],
    ['Mz,Rd',    `${fmt(result.Mz_Rd, 1)} kNm`],
    ['Nb,Rd,y',  `${fmt(result.Nb_Rd_y, 1)} kN`],
    ['Nb,Rd,z',  `${fmt(result.Nb_Rd_z, 1)} kN`],
  ];
  const kvRight: [string, string][] = [
    ['lam_y',  result.lambda_y.toFixed(3)],
    ['lam_z',  result.lambda_z.toFixed(3)],
    ['chi_y',  result.chi_y.toFixed(3)],
    ['chi_z',  result.chi_z.toFixed(3)],
  ];
  if (!result.isBox && result.Mcr > 0) {
    kvRight.push(
      ['lam_LT', result.lambda_LT.toFixed(3)],
      ['chi_LT', result.chi_LT.toFixed(3)],
      ['Mcr',    `${fmt(result.Mcr, 1)} kNm`],
      ['Mb,Rd',  `${fmt(result.Mb_Rd, 1)} kNm`],
    );
  }

  doc.setFontSize(7.5);
  const kvMaxRows = Math.max(kvLeft.length, kvRight.length);
  for (let i = 0; i < kvMaxRows; i++) {
    y = checkPageBreak(doc, y, 6);
    if (kvLeft[i]) {
      const [lbl, val] = kvLeft[i];
      setGray(doc, 90);
      doc.setFont('helvetica', 'normal');
      doc.text(pdfStr(lbl), M, y);
      setGray(doc, 20);
      doc.setFont('helvetica', 'bold');
      doc.text(pdfStr(val), M + 28, y);
    }
    if (kvRight[i]) {
      const [lbl, val] = kvRight[i];
      setGray(doc, 90);
      doc.setFont('helvetica', 'normal');
      doc.text(pdfStr(lbl), M + colW + 6, y);
      setGray(doc, 20);
      doc.setFont('helvetica', 'bold');
      doc.text(pdfStr(val), M + colW + 6 + 28, y);
    }
    y += rowH;
  }

  // ── 6. Overall verdict banner ──────────────────────────────────────────────
  y += 3;
  y = checkPageBreak(doc, y, 12);

  const hasFail = result.checks.some((c) => !c.neutral && c.status === 'fail');
  const hasWarn = result.checks.some((c) => !c.neutral && c.status === 'warn');
  const overallStatus: DisplayStatus = hasFail ? 'fail' : hasWarn ? 'warn' : 'ok';

  // Light-gray banner — use setFillColor (not setGray) so 'F' rect picks it up
  doc.setFillColor(235, 235, 235);
  doc.rect(M, y - 4, CW, 10, 'F');
  // Thin border
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.3);
  doc.rect(M, y - 4, CW, 10, 'S');

  const textGray = hasFail ? 20 : hasWarn ? 40 : 50;
  setGray(doc, textGray);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(
    `VEREDICTO GLOBAL:  ${STATUS_LABEL[overallStatus]}  (utilizacion maxima: ${(result.utilization * 100).toFixed(1)}%)`,
    PAGE_W / 2, y + 1.5, { align: 'center' },
  );
  y += 10;

  // ── Final footer ──────────────────────────────────────────────────────────
  drawPageFooter(doc);

  // ── Return preview ───────────────────────────────────────────────────────
  const filename = `concreta-pilar-acero-${inp.sectionType}${inp.size}-Ly${Math.round(inp.Ly / 100)}-Lz${Math.round(inp.Lz / 100)}.pdf`;
  const blob = doc.output('blob');
  const blobUrl = URL.createObjectURL(blob);
  const pageCount = doc.internal.getNumberOfPages();
  return { blobUrl, filename, pageCount };
}
