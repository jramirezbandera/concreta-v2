// PDF export for Steel Beams module
// Uses jsPDF + svg2pdf.js to render the hidden PDF SVG clone into a PDF page.
// Page: A4 portrait, margins 20mm.
//
// jsPDF built-in fonts (Helvetica/Times/Courier) only cover latin-1.
// Greek letters (δ, λ, χ) and Unicode subscripts (₁) must be substituted
// with ASCII equivalents before passing to doc.text().

import jsPDF from 'jspdf';
import { svg2pdf } from 'svg2pdf.js';
import { type SteelBeamInputs, type BeamType } from '../../data/defaults';
import { type SteelBeamResult, type SteelCheckStatus } from '../../lib/calculations/steelBeams';
import { BEAM_CASES } from '../calculations/beamCases';
import { getPsiForCategory, getPsiRow } from '../calculations/loadGen';

import { PAGE_W, PAGE_H, setGray, pdfStr, STATUS_LABEL, type PdfResult } from './utils';

const M = 20;   // page margin mm

type DisplayStatus = Exclude<SteelCheckStatus, 'neutral'>;

function fmt(v: number, decimals = 1): string {
  return v.toFixed(decimals);
}

/** Mser formula label per beam type (ASCII). */
const MSER_FORMULA: Record<BeamType, string> = {
  ss:         'wSer*L^2/8',
  cantilever: 'wSer*L^2/2',
  fp:         'wSer*L^2/8 (emp.)',
  ff:         'wSer*L^2/12 (emp.)',
};

export async function exportSteelBeamsPDF(inp: SteelBeamInputs, result: SteelBeamResult): Promise<PdfResult> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const beamCase = BEAM_CASES[inp.beamType];
  const C1 = beamCase.C1;

  // ── Derived load quantities ──────────────────────────────────────────────────
  const Gk_line = inp.gk * inp.bTrib;
  const Qk_line = inp.qk * inp.bTrib;
  const psiRow  = getPsiRow(inp.useCategory);
  const psi     = getPsiForCategory(inp.useCategory, inp.elsCombo ?? 'characteristic');
  const wEd     = 1.35 * Gk_line + 1.50 * Qk_line;
  const wSer    = Gk_line + psi * Qk_line;

  // ELS combination label and psi symbol (ASCII)
  const elsCombo = inp.elsCombo ?? 'characteristic';
  const elsComboLabel: Record<typeof elsCombo, string> = {
    characteristic:   'Caracteristica',
    frequent:         'Frecuente',
    'quasi-permanent':'Cuasi-perm.',
  };
  const psiSymbol: Record<typeof elsCombo, string> = {
    characteristic:   'psi=1.00',
    frequent:         `psi1=${psiRow.psi1.toFixed(2)}`,
    'quasi-permanent':`psi2=${psiRow.psi2.toFixed(2)}`,
  };
  const wSerFormula: Record<typeof elsCombo, string> = {
    characteristic:   `wSer = ${fmt(Gk_line)} + ${fmt(Qk_line)} = ${fmt(wSer)} kN/m`,
    frequent:         `wSer = ${fmt(Gk_line)} + ${psiRow.psi1.toFixed(2)}x${fmt(Qk_line)} = ${fmt(wSer)} kN/m`,
    'quasi-permanent':`wSer = ${fmt(Gk_line)} + ${psiRow.psi2.toFixed(2)}x${fmt(Qk_line)} = ${fmt(wSer)} kN/m`,
  };

  // ── Header ───────────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  setGray(doc, 30);
  doc.text(pdfStr(`Concreta - ELU/ELS Viga Acero - ${beamCase.labelShort}`), M, M);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  setGray(doc, 120);
  doc.text(`Generado: ${new Date().toLocaleDateString('es-ES')}`, M, M + 5);

  doc.setLineWidth(0.3);
  setGray(doc, 200);
  doc.line(M, M + 8, PAGE_W - M, M + 8);

  // ── SVG: beam cross-section ──────────────────────────────────────────────────
  const svgContainer = document.getElementById('steel-beams-svg-pdf');
  const svgEl = svgContainer?.querySelector('svg') as SVGSVGElement | null;

  const SVG_W = 90;
  const SVG_H = 56;   // 420:260 aspect at 90mm width → 55.7mm
  const svgX  = M;
  const svgY  = M + 12;

  if (svgEl) {
    await svg2pdf(svgEl, doc, { x: svgX, y: svgY, width: SVG_W, height: SVG_H });
  }

  // ── SVG: M/V/δ diagrams ──────────────────────────────────────────────────────
  let diagramsH = 0;
  const diagContainer = document.getElementById('steel-beams-diagrams-pdf');
  const diagSvg = diagContainer?.querySelector('svg') as SVGSVGElement | null;
  if (diagSvg) {
    const DIAG_W = 90;
    const DIAG_H = 48;   // 420:220 at 90mm → 47mm
    await svg2pdf(diagSvg, doc, { x: M, y: svgY + SVG_H + 3, width: DIAG_W, height: DIAG_H });
    diagramsH = DIAG_H + 3;
  }

  // ── Right column: input summary + computed key values ───────────────────────
  const COL_R  = M + 98;   // right column x
  const COL_R2 = COL_R + 34; // second value in right column
  const LH     = 4;         // line height mm (compact to fit all sections)
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

  const oneCol = (a: string) => {
    doc.setFontSize(8);
    doc.text(pdfStr(a), COL_R, ry);
    ry += LH;
  };

  const gap = () => { ry += 2; };

  // PERFIL Y MATERIAL
  sectionHeader('PERFIL Y MATERIAL');
  const profileLabel = result.profile?.label ?? `${inp.tipo} ${inp.size}`;
  twoCol(profileLabel, inp.steel);
  twoCol(`Tipo: ${beamCase.label}`, `L = ${(inp.L / 1000).toFixed(2)} m`);
  gap();

  // SOLICITACIONES ELU
  sectionHeader('SOLICITACIONES ELU');
  twoCol(`MEd = ${fmt(inp.MEd)} kNm`, `VEd = ${fmt(inp.VEd)} kN`);
  twoCol(
    `Lcr = ${(inp.Lcr / 1000).toFixed(2)} m`,
    pdfStr(`C1 = ${C1.toFixed(2)} (${beamCase.labelShort})`),
  );
  gap();

  // GENERADOR DE CARGAS
  sectionHeader('GENERADOR DE CARGAS');
  twoCol(`Cat.: ${inp.useCategory}`, `qk = ${fmt(inp.qk)} kN/m\xB2`);
  twoCol(`gk = ${fmt(inp.gk)} kN/m\xB2`, `bTrib = ${fmt(inp.bTrib)} m`);
  // Line loads
  twoCol(`Gk = ${fmt(Gk_line)} kN/m`, `Qk = ${fmt(Qk_line)} kN/m`);
  // ELU combination
  oneCol(`wEd = 1.35x${fmt(Gk_line)} + 1.50x${fmt(Qk_line)} = ${fmt(wEd)} kN/m`);
  // ELS combination
  oneCol(`${wSerFormula[elsCombo]}  [ELS ${elsComboLabel[elsCombo]}, ${psiSymbol[elsCombo]}]`);
  gap();

  // FLECHA ELS
  sectionHeader('FLECHA ELS');
  oneCol(`Combo: ${elsComboLabel[elsCombo]}  (${psiSymbol[elsCombo]})`);
  oneCol(`Mser = ${MSER_FORMULA[inp.beamType]} = ${fmt(inp.Mser)} kNm`);
  twoCol(`dadm = L/${inp.deflLimit}`, `${(inp.L / inp.deflLimit).toFixed(1)} mm`);
  gap();

  // RESULTADOS CLAVE
  sectionHeader('RESULTADOS CLAVE');
  twoCol(`Mc,Rd = ${fmt(result.Mc_Rd)} kNm`, `Clase ${result.sectionClass}`);
  twoCol(`Vc,Rd = ${fmt(result.Vc_Rd)} kN`,  `Av = ${fmt(result.Av, 0)} mm\xB2`);
  twoCol(`Mb,Rd = ${fmt(result.Mb_Rd)} kNm`, `chiLT = ${result.chi_LT.toFixed(3)}`);
  twoCol(`lamLT = ${result.lambda_LT.toFixed(3)}`, `Mcr = ${fmt(result.Mcr)} kNm`);
  twoCol(`dmax = ${fmt(result.delta_max)} mm`, `dadm = ${fmt(result.delta_adm)} mm`);

  // ── Results table ────────────────────────────────────────────────────────────
  const tableY = M + 12 + SVG_H + diagramsH + 6;

  doc.setLineWidth(0.3);
  setGray(doc, 180);
  doc.line(M, tableY - 2, PAGE_W - M, tableY - 2);

  // "RESULTADOS" label + overall verdict on same line
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  setGray(doc, 60);
  doc.text('RESULTADOS', M, tableY + 3);

  if (result.valid) {
    const active  = result.checks.filter((c) => !c.neutral);
    const hasFail = active.some((c) => c.status === 'fail');
    const hasWarn = active.some((c) => c.status === 'warn');
    const overall: DisplayStatus = hasFail ? 'fail' : hasWarn ? 'warn' : 'ok';
    doc.setFontSize(11);
    setGray(doc, 30);
    doc.text(STATUS_LABEL[overall], PAGE_W - M, tableY + 3, { align: 'right' });
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
  doc.text('Verificacion',       COL.desc,   rowY);
  doc.text('Valor',              COL.value,  rowY);
  doc.text('Limite',             COL.limit,  rowY);
  doc.text('Ut%',                COL.util,   rowY);
  doc.text('Estado',             COL.status, rowY);
  rowY += 2;

  doc.setLineWidth(0.2);
  setGray(doc, 160);
  doc.line(M, rowY, PAGE_W - M, rowY);
  rowY += 5;

  // Data rows
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);

  for (const chk of result.checks) {
    if (rowY > PAGE_H - M - 14) {
      doc.addPage();
      rowY = M + 10;
    }

    if (chk.neutral) {
      setGray(doc, 50);
      doc.text(pdfStr(chk.description), COL.desc, rowY);
      doc.setFont('helvetica', 'bold');
      doc.text(chk.tag ?? '', COL.status, rowY);
      doc.setFont('helvetica', 'normal');
    } else {
      const st = chk.status as DisplayStatus;
      setGray(doc, 50);
      doc.text(pdfStr(chk.description), COL.desc, rowY);
      doc.text(pdfStr(chk.value),        COL.value,  rowY);
      doc.text(pdfStr(chk.limit),        COL.limit,  rowY);
      doc.text(`${(chk.utilization * 100).toFixed(0)}%`, COL.util, rowY);
      doc.setFont('helvetica', 'bold');
      setGray(doc, st === 'ok' ? 60 : 30);
      doc.text(STATUS_LABEL[st],          COL.status, rowY);
      doc.setFont('helvetica', 'normal');
      setGray(doc, 50);
    }

    // Article reference
    rowY += 4;
    doc.setFontSize(6);
    setGray(doc, 160);
    doc.text(chk.article, COL.desc + 2, rowY);
    doc.setFontSize(7);
    setGray(doc, 50);

    // Separator — drawn below article, with gap before next row
    rowY += 3;
    doc.setLineWidth(0.1);
    setGray(doc, 215);
    doc.line(M, rowY, PAGE_W - M, rowY);
    rowY += 4;  // gap: next description baseline is 4mm below separator
  }

  // ── Footer ───────────────────────────────────────────────────────────────────
  const footerY = PAGE_H - 10;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  setGray(doc, 150);
  doc.text('Concreta - concreta.app | CTE DB-SE-A Espana', M, footerY);
  doc.text('Pagina 1', PAGE_W - M, footerY, { align: 'right' });

  const filename = `concreta-acero-viga-${new Date().toISOString().slice(0, 10)}.pdf`;
  const blob = doc.output('blob');
  const blobUrl = URL.createObjectURL(blob);
  const pageCount = (doc.internal as any).getNumberOfPages();
  return { blobUrl, filename, pageCount };
}
