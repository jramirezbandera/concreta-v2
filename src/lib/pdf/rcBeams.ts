// PDF export for RC Beams module
// Uses jsPDF + svg2pdf.js to render the hidden SVG into a PDF page.
// Page: A4 portrait, margins 20mm, grayscale section diagram + two results tables.

import jsPDF from 'jspdf';
import { type RCBeamInputs } from '../../data/defaults';
import { type RCBeamResult, type RCBeamSectionResult, type CheckStatus, pickSectionInputs } from '../calculations/rcBeams';
import { solveSectionAtMoment } from '../calculations/rcBeamsSection';
import { buildSectionNarrative } from '../../features/rc-beams/rcBeamNarrative';
import { formatQuantity } from '../units/format';
import type { Quantity, UnitSystem } from '../units/types';

import { embedSvgAsImage, PAGE_W, PAGE_H, setGray, STATUS_LABEL, type PdfResult } from './utils';

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
  system: UnitSystem,
): number {
  const fmtSi = (v: number, q: Quantity) => formatQuantity(v, q, system);
  const checkValueStr = (c: { valueNum?: number; valueQty?: Quantity; valueStr?: string; value?: string }) =>
    c.valueNum !== undefined && c.valueQty
      ? formatQuantity(c.valueNum, c.valueQty, system)
      : (c.valueStr ?? c.value ?? '');
  const checkLimitStr = (c: { limitNum?: number; limitQty?: Quantity; limitStr?: string; limit?: string }) =>
    c.limitNum !== undefined && c.limitQty
      ? formatQuantity(c.limitNum, c.limitQty, system)
      : (c.limitStr ?? c.limit ?? '');
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
    `MRd=${fmtSi(section.MRd, 'moment')}`,
    `VRd=${fmtSi(section.VRd, 'force')}`,
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
    doc.text(checkValueStr(ch), COL.value, y);
    doc.text(checkLimitStr(ch), COL.limit, y);
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

export async function exportRCBeamsPDF(
  inp: RCBeamInputs,
  result: RCBeamResult,
  system: UnitSystem = 'si',
): Promise<PdfResult> {
  // Simple-mode PDF: 3-SVG layout focused on una sola sección + narrativa.
  if (inp.mode === 'simple') {
    return exportRCBeamsSimplePDF(inp, result, system);
  }

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
      await embedSvgAsImage(doc, svgVano, { x: xVano, y: svgY, width: SVG_W, height: SVG_H });
    } catch {
      console.warn('rc-beams PDF: failed to render VANO SVG');
    }
  }
  if (svgApoyo) {
    try {
      await embedSvgAsImage(doc, svgApoyo, { x: xApoyo, y: svgY, width: SVG_W, height: SVG_H });
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

  tableY = drawSectionTable(doc, result.vano, 'VANO (M+, barras inf. traccion)', tableY, system);
  tableY += 2;

  hline(doc, tableY - 1, 210, 0.2);
  tableY += 3;

  tableY = drawSectionTable(doc, result.apoyo, 'APOYO (M\u2212, barras sup. traccion)', tableY, system);

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
  const pageCount = (doc.internal as unknown as { getNumberOfPages(): number }).getNumberOfPages();
  return { blobUrl, filename, pageCount };
}

// ── Simple mode PDF (3 SVGs + section state data + narrative) ───────────────
async function exportRCBeamsSimplePDF(
  inp: RCBeamInputs,
  result: RCBeamResult,
  system: UnitSystem,
): Promise<PdfResult> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const fmtSi = (v: number, q: Quantity) => formatQuantity(v, q, system);

  // Resolver la sección al Md (mismo motor que el viewer).
  const secInp = pickSectionInputs(inp, 'vano');
  const sectionResult = solveSectionAtMoment(secInp, secInp.Md);
  const MRd = result.vano?.MRd ?? 0;
  const Md = sectionResult.Md;
  const utilization = MRd > 0 ? (Md / MRd) * 100 : 0;
  const resists = Md <= MRd && !sectionResult.exceededCapacity;

  // ── Header ────────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  setGray(doc, 30);
  doc.text('Concreta — Sección de Viga (modo simple)', M, M);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  setGray(doc, 120);
  doc.text(`Generado: ${new Date().toLocaleDateString('es-ES')}`, M, M + 5);

  hline(doc, M + 8, 200, 0.3);

  // ── Verdict block — Md vs MRd, prominent ───────────────────────────────────
  let y = M + 13;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  setGray(doc, 30);
  doc.text(
    `Md = ${fmtSi(Md, 'moment')}   /   MRd = ${fmtSi(MRd, 'moment')}   →   ${utilization.toFixed(0)}% capacidad   ·   ${resists ? 'RESISTE' : 'NO RESISTE'}`,
    M,
    y,
  );
  y += 6;

  // ── Section inputs summary ────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  setGray(doc, 60);
  doc.text('GEOMETRIA Y ARMADO', M, y);
  y += 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  setGray(doc, 80);
  const lineH = 4;
  const COL2X = M + 58;
  const COL3X = M + 116;
  const infoLines: Array<[string, string, string]> = [
    [`b = ${inp.b} mm`, `h = ${inp.h} mm`, `Recub. = ${inp.cover} mm`],
    [`fck = ${inp.fck} MPa`, `fyk = ${inp.fyk} MPa`, `Exp.: ${inp.exposureClass}`],
    [
      `Tracción: ${inp.vano_bot_nBars}Ø${inp.vano_bot_barDiam}`,
      `Compresión: ${inp.vano_top_nBars}Ø${inp.vano_top_barDiam}`,
      `Estr.: Ø${inp.vano_stirrupDiam}/c${inp.vano_stirrupSpacing} (${inp.vano_stirrupLegs}R)`,
    ],
  ];
  for (const [c1, c2, c3] of infoLines) {
    doc.text(c1, M, y);
    doc.text(c2, COL2X, y);
    doc.text(c3, COL3X, y);
    y += lineH;
  }
  hline(doc, y, 210, 0.2);
  y += 4;

  // ── 3 SVGs en fila ────────────────────────────────────────────────────────
  const SVG_GAP = 4;
  const SVG_W = (CW - 2 * SVG_GAP) / 3; // ~54mm cada uno
  const SVG_H = 60;
  const xStrain = M;
  const xSection = M + SVG_W + SVG_GAP;
  const xForces = M + 2 * (SVG_W + SVG_GAP);

  const svgStrain  = document.getElementById('rc-beams-svg-pdf-strain')?.querySelector('svg')  as SVGSVGElement | null;
  const svgSection = document.getElementById('rc-beams-svg-pdf-vano')?.querySelector('svg')    as SVGSVGElement | null;
  const svgForces  = document.getElementById('rc-beams-svg-pdf-forces')?.querySelector('svg')  as SVGSVGElement | null;

  if (svgStrain) {
    try {
      await embedSvgAsImage(doc, svgStrain, { x: xStrain, y, width: SVG_W, height: SVG_H });
    } catch { console.warn('rc-beams PDF simple: failed to render STRAIN SVG'); }
  }
  if (svgSection) {
    try {
      await embedSvgAsImage(doc, svgSection, { x: xSection, y, width: SVG_W, height: SVG_H });
    } catch { console.warn('rc-beams PDF simple: failed to render SECTION SVG'); }
  }
  if (svgForces) {
    try {
      await embedSvgAsImage(doc, svgForces, { x: xForces, y, width: SVG_W, height: SVG_H });
    } catch { console.warn('rc-beams PDF simple: failed to render FORCES SVG'); }
  }

  const captionY = y + SVG_H + 3;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  setGray(doc, 120);
  doc.text('Deformación (ε)', xStrain, captionY);
  doc.text('Sección', xSection, captionY);
  doc.text('Fuerzas movilizadas', xForces, captionY);

  y = captionY + 5;
  hline(doc, y, 200, 0.25);
  y += 4;

  // ── Section state data row ─────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  setGray(doc, 60);
  doc.text('ESTADO DE LA SECCIÓN AL Md', M, y);
  y += 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  setGray(doc, 80);

  const epsTopP = (sectionResult.epsilon_top * 1000).toFixed(2);
  const epsBotP = (sectionResult.epsilon_bot * 1000).toFixed(2);
  const epsSP   = (sectionResult.epsilon_s_tens * 1000).toFixed(2);
  const epsSCP  = (sectionResult.epsilon_s_comp * 1000).toFixed(2);

  const stateLines: Array<[string, string, string]> = [
    [
      `x (eje neutro) = ${sectionResult.x.toFixed(0)} mm`,
      `d (canto util) = ${sectionResult.d.toFixed(0)} mm`,
      `Modo: ${sectionResult.mode}`,
    ],
    [
      `ε_top = ${epsTopP}‰`,
      `ε_bot = ${epsBotP}‰`,
      `ε_s (tracc) = ${epsSP}‰    ε_s' (comp) = ${epsSCP}‰`,
    ],
    [
      `F_c = ${fmtSi(Math.abs(sectionResult.F_concrete), 'force')}`,
      `F_s' = ${fmtSi(Math.abs(sectionResult.F_s_comp), 'force')}`,
      `F_s = ${fmtSi(Math.abs(sectionResult.F_s_tens), 'force')}`,
    ],
    [
      `σ_s (tracc) = ${sectionResult.sigma_s_tens.toFixed(0)} MPa`,
      `σ_s' (comp) = ${sectionResult.sigma_s_comp.toFixed(0)} MPa`,
      `${sectionResult.steelYielded_tens ? 'Acero tracción yielded' : ''}${sectionResult.concreteCrushed ? ' · Hormigón crushed' : ''}`,
    ],
  ];
  for (const [c1, c2, c3] of stateLines) {
    doc.text(c1, M, y);
    doc.text(c2, COL2X, y);
    doc.text(c3, COL3X, y);
    y += lineH;
  }

  hline(doc, y, 210, 0.2);
  y += 4;

  // ── Narrative ─────────────────────────────────────────────────────────────
  const narrative = buildSectionNarrative(sectionResult, MRd);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  setGray(doc, 60);
  const wrapped = doc.splitTextToSize(narrative, CW);
  for (const line of wrapped) {
    if (y > PAGE_H - M - 15) break;
    doc.text(line, M, y);
    y += 4;
  }
  y += 2;
  hline(doc, y, 210, 0.2);
  y += 4;

  // ── ELU/ELS checks ────────────────────────────────────────────────────────
  drawSectionTable(doc, result.vano, 'Sección — verificaciones ELU/ELS (CE)', y, system);

  // ── Footer ────────────────────────────────────────────────────────────────
  const footerY = PAGE_H - 10;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  setGray(doc, 150);
  doc.text('Concreta — concreta.app | Codigo Estructural (CE) Espana · CE 21.3.3 (parábola-rectángulo)', M, footerY);
  doc.text('Pagina 1', PAGE_W - M, footerY, { align: 'right' });

  const filename = `concreta-viga-simple-${new Date().toISOString().slice(0, 10)}.pdf`;
  const blob = doc.output('blob');
  const blobUrl = URL.createObjectURL(blob);
  const pageCount = (doc.internal as unknown as { getNumberOfPages(): number }).getNumberOfPages();
  return { blobUrl, filename, pageCount };
}
