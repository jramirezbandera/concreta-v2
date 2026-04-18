// PDF export for RC Columns module — biaxial bending (CE Anejo 19 art. 5.8.9)
// A4 portrait, margins 20mm.

import jsPDF from 'jspdf';
import { svg2pdf } from 'svg2pdf.js';
import { type RCColumnInputs } from '../../data/defaults';
import { type RCColumnResult, type CheckStatus } from '../../lib/calculations/rcColumns';

import { PAGE_W, PAGE_H, setGray, STATUS_LABEL, type PdfResult } from './utils';

const M  = 20;
const CW = PAGE_W - 2 * M;

function hline(doc: jsPDF, y: number, gray = 200, lw = 0.2) {
  doc.setLineWidth(lw);
  setGray(doc, gray);
  doc.line(M, y, PAGE_W - M, y);
}

export async function exportRCColumnsPDF(inp: RCColumnInputs, result: RCColumnResult): Promise<PdfResult> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // ── Header ─────────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  setGray(doc, 30);
  doc.text('Concreta \u2014 ELU Pilar Rectangular (Flexi\u00f3n Esviada)', M, M);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  setGray(doc, 120);
  doc.text(`Generado: ${new Date().toLocaleDateString('es-ES')}`, M, M + 5);

  hline(doc, M + 8, 200, 0.3);

  // ── Input summary (4 rows × 3 columns) ────────────────────────────────────
  let infoY = M + 13;
  const lineH = 4;
  const COL1 = M, COL2 = M + 58, COL3 = M + 116;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  setGray(doc, 60);
  doc.text('GEOMETR\u00cdA Y MATERIALES', COL1, infoY);
  infoY += lineH;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  setGray(doc, 80);

  const Lk_str = `L=${inp.L}m \u03b2=${inp.beta} Lk=${(inp.L * inp.beta).toFixed(2)}m`;
  const lambdaStr = result.valid
    ? `\u03bby=${result.lambda_y.toFixed(1)} \u03bbz=${result.lambda_z.toFixed(1)}`
    : '\u2014';

  const infoLines: Array<[string, string, string]> = [
    [`b = ${inp.b} mm`,             `h = ${inp.h} mm`,          `Recub. = ${inp.cover} mm`],
    [`fck = ${inp.fck} MPa`,        `fyk = ${inp.fyk} MPa`,     `NEd = ${inp.Nd} kN`],
    [result.rebarSchedule,          '',                          Lk_str],
    [`MEdy = ${inp.MEdy} kNm`,      `MEdz = ${inp.MEdz} kNm`,  lambdaStr],
  ];

  for (const [c1, c2, c3] of infoLines) {
    if (c1) doc.text(c1, COL1, infoY);
    if (c2) doc.text(c2, COL2, infoY);
    if (c3) doc.text(c3, COL3, infoY);
    infoY += lineH;
  }

  hline(doc, infoY, 210, 0.2);
  infoY += 4;

  // ── SVG diagram ────────────────────────────────────────────────────────────
  const SVG_W = CW * 0.5;
  const SVG_H = 80;
  const svgX = M + (CW - SVG_W) / 2;
  const svgY = infoY;

  const svgEl = document.getElementById('rc-columns-svg-pdf')?.querySelector('svg') as SVGSVGElement | null;
  if (svgEl) {
    try {
      await svg2pdf(svgEl, doc, { x: svgX, y: svgY, width: SVG_W, height: SVG_H });
    } catch {
      console.warn('rc-columns PDF: failed to render SVG');
    }
  }

  const captionY = svgY + SVG_H + 3;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  setGray(doc, 120);
  doc.text('Secci\u00f3n transversal \u2014 compresi\u00f3n cara superior (MEdy+ positivo)', M + CW / 2, captionY, { align: 'center' });

  const diagramBlockEnd = captionY + 5;
  hline(doc, diagramBlockEnd, 200, 0.25);

  // ── Results section ────────────────────────────────────────────────────────
  let tableY = diagramBlockEnd + 5;

  if (!result.valid) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    setGray(doc, 30);
    doc.text(result.error ?? 'Datos inv\u00e1lidos', M, tableY);
  } else {
    const checks = result.checks;
    const hasFail = checks.some((c) => c.status === 'fail');
    const hasWarn = checks.some((c) => c.status === 'warn');
    const overallStatus: CheckStatus = hasFail ? 'fail' : hasWarn ? 'warn' : 'ok';

    // Verdict header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    setGray(doc, 30);
    doc.text('Flexi\u00f3n Esviada \u2014 CE Anejo 19 art. 5.8.9', M, tableY);
    doc.setFontSize(8);
    doc.text(STATUS_LABEL[overallStatus], PAGE_W - M, tableY, { align: 'right' });
    tableY += 5;

    // Key values line 1
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    setGray(doc, 70);
    const kv1 = [
      `d_y=${result.d_y.toFixed(0)}mm`,
      `d_z=${result.d_z.toFixed(0)}mm`,
      `As=${result.As_total.toFixed(0)}mm\u00b2`,
      `\u03bby=${result.lambda_y.toFixed(1)}`,
      `\u03bbz=${result.lambda_z.toFixed(1)}`,
      `NRd,max=${result.NRd_max.toFixed(0)}kN`,
    ].join('   ');
    doc.text(kv1, M, tableY);
    tableY += 4;

    // Key values line 2
    const kv2 = [
      `MEd,tot,y=${result.MEd_tot_y.toFixed(1)}kNm`,
      `MEd,tot,z=${result.MEd_tot_z.toFixed(1)}kNm`,
      `MRdy=${result.MRdy.toFixed(1)}kNm`,
      `MRdz=${result.MRdz.toFixed(1)}kNm`,
      `ned=${result.ned.toFixed(3)}\u2192a=${result.a.toFixed(2)}`,
      `util=${result.biaxialUtil.toFixed(3)}`,
    ].join('   ');
    doc.text(kv2, M, tableY);
    tableY += 4;

    // Rebar
    doc.text(`Despiece: ${result.rebarSchedule}    Solape m\u00edn: ${result.lapLength}mm (CE art. 69.5.2)`, M, tableY);
    tableY += 5;

    // Check table header
    hline(doc, tableY - 1, 180, 0.15);
    const COL = { desc: M, value: M + 80, limit: M + 120, util: M + 152, status: M + 165 };
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    setGray(doc, 100);
    doc.text('Verificaci\u00f3n', COL.desc, tableY);
    doc.text('Valor',           COL.value, tableY);
    doc.text('L\u00edmite',    COL.limit, tableY);
    doc.text('Ut%',             COL.util, tableY);
    doc.text('Estado',          COL.status, tableY);
    tableY += 1.5;
    hline(doc, tableY, 170, 0.15);
    tableY += 3.5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);

    // Informational check IDs
    const infoIds = new Set(['nm-y', 'nm-z', 'cond-5.38a', 'cond-5.38b']);

    for (const ch of checks) {
      if (tableY > PAGE_H - M - 10) {
        doc.addPage();
        tableY = M + 10;
      }

      const isInfo = infoIds.has(ch.id);
      setGray(doc, isInfo ? 120 : 50);
      const desc = doc.splitTextToSize(ch.description, 74)[0] as string;
      doc.text(desc, COL.desc, tableY);
      doc.text(ch.value, COL.value, tableY);
      doc.text(ch.limit, COL.limit, tableY);
      const utilStr = isInfo || !isFinite(ch.utilization) || isNaN(ch.utilization)
        ? '\u2014'
        : `${(ch.utilization * 100).toFixed(0)}%`;
      doc.text(utilStr, COL.util, tableY);
      setGray(doc, isInfo ? 140 : ch.status === 'ok' ? 70 : 30);
      doc.setFont('helvetica', isInfo ? 'normal' : 'bold');
      const statusStr = isInfo ? '(info)' : STATUS_LABEL[ch.status];
      doc.text(statusStr, COL.status, tableY);
      doc.setFont('helvetica', 'normal');
      tableY += 3.5;

      setGray(doc, 160);
      doc.setFontSize(5.5);
      doc.text(ch.article, COL.desc + 2, tableY);
      doc.setFontSize(6.5);
      setGray(doc, 50);
      tableY += 2;

      hline(doc, tableY, 230, 0.1);
      tableY += 3;
    }
  }

  // ── Footer ─────────────────────────────────────────────────────────────────
  const footerY = PAGE_H - 10;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  setGray(doc, 150);
  doc.text('Concreta \u2014 concreta.app | C\u00f3digo Estructural (CE) Espa\u00f1a', M, footerY);
  doc.text('P\u00e1gina 1', PAGE_W - M, footerY, { align: 'right' });

  const filename = `concreta-pilar-${new Date().toISOString().slice(0, 10)}.pdf`;
  const blob = doc.output('blob');
  const blobUrl = URL.createObjectURL(blob);
  const pageCount = doc.internal.getNumberOfPages();
  return { blobUrl, filename, pageCount };
}
