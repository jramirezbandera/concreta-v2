// PDF export for Steel Beams module
// Uses jsPDF + svg2pdf.js to render the hidden PDF SVG clone into a PDF page.
// Page: A4 portrait, margins 20mm.
//
// jsPDF built-in fonts (Helvetica/Times/Courier) only cover latin-1.
// Greek letters (δ, λ, χ) and Unicode subscripts (₁) must be substituted
// with ASCII equivalents before passing to doc.text().

import jsPDF from 'jspdf';
import { type SteelBeamInputs, type BeamType } from '../../data/defaults';
import { type SteelBeamResult, type SteelCheckStatus } from '../../lib/calculations/steelBeams';
import { BEAM_CASES } from '../calculations/beamCases';
import { categoryLabel, getPsiForCategory, getPsiRow } from '../calculations/loadGen';
import { formatQuantity, formatNumber, getUnitLabel } from '../units/format';
import type { Quantity, UnitSystem } from '../units/types';

import { embedSvgAsImage, PAGE_W, PAGE_H, setGray, pdfStr, STATUS_LABEL, titledFilename, drawElementTitle, truncateToWidth, type PdfResult } from './utils';

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

/** Nombre de archivo por defecto cuando el título va vacío. Fuente única
 *  compartida por el exportador y el TitlePromptModal (preview). */
export function steelBeamsFallbackFilename(): string {
  return `concreta-acero-viga-${new Date().toISOString().slice(0, 10)}.pdf`;
}

export async function exportSteelBeamsPDF(
  inp: SteelBeamInputs,
  result: SteelBeamResult,
  system: UnitSystem = 'si',
  title?: string,
): Promise<PdfResult> {
  const elementTitle = title ?? inp.title ?? '';
  const fmtSi = (v: number, q: Quantity) => formatQuantity(v, q, system);
  const checkValueStr = (c: { valueNum?: number; valueQty?: Quantity; valueStr?: string; value?: string }) =>
    c.valueNum !== undefined && c.valueQty
      ? formatQuantity(c.valueNum, c.valueQty, system)
      : (c.valueStr ?? c.value ?? '');
  const checkLimitStr = (c: { limitNum?: number; limitQty?: Quantity; limitStr?: string; limit?: string }) =>
    c.limitNum !== undefined && c.limitQty
      ? formatQuantity(c.limitNum, c.limitQty, system)
      : (c.limitStr ?? c.limit ?? '');
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
  const ll = (v: number) => formatNumber(v, 'linearLoad', system);
  const llUnit = getUnitLabel('linearLoad', system);
  const wSerFormula: Record<typeof elsCombo, string> = {
    characteristic:   `wSer = ${ll(Gk_line)} + ${ll(Qk_line)} = ${ll(wSer)} ${llUnit}`,
    frequent:         `wSer = ${ll(Gk_line)} + ${psiRow.psi1.toFixed(2)}x${ll(Qk_line)} = ${ll(wSer)} ${llUnit}`,
    'quasi-permanent':`wSer = ${ll(Gk_line)} + ${psiRow.psi2.toFixed(2)}x${ll(Qk_line)} = ${ll(wSer)} ${llUnit}`,
  };

  // ── Header ───────────────────────────────────────────────────────────────────
  const titleBaseY = drawElementTitle(doc, elementTitle, `Concreta - ELU/ELS Viga Acero - ${beamCase.labelShort}`, M);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  setGray(doc, 120);
  doc.text(`Generado: ${new Date().toLocaleDateString('es-ES')}`, M, titleBaseY + 5);

  doc.setLineWidth(0.3);
  setGray(doc, 200);
  doc.line(M, titleBaseY + 8, PAGE_W - M, titleBaseY + 8);

  // ── SVG: sección del perfil ──────────────────────────────────────────────────
  const svgContainer = document.getElementById('steel-beams-svg-pdf');
  const svgEl = svgContainer?.querySelector('svg') as SVGSVGElement | null;

  const SVG_W = 52;
  const SVG_H = 66.9;         // 210:270 aspect at 52mm width
  const svgX  = M + 19;       // centrado en la columna izquierda de 90mm
  const svgY  = titleBaseY + 12;

  if (svgEl) {
    await embedSvgAsImage(doc, svgEl, { x: svgX, y: svgY, width: SVG_W, height: SVG_H });
  }

  // ── SVG: esquema de carga + diagramas M/V/δ (rejilla 2×2) ────────────────────
  let diagramsH = 0;
  const diagContainer = document.getElementById('steel-beams-diagrams-pdf');
  const diagSvg = diagContainer?.querySelector('svg') as SVGSVGElement | null;
  if (diagSvg) {
    const DIAG_W = 90;
    const DIAG_H = 48.9;   // 460:250 at 90mm
    await embedSvgAsImage(doc, diagSvg, { x: M, y: svgY + SVG_H + 3, width: DIAG_W, height: DIAG_H });
    diagramsH = DIAG_H + 3;
  }

  // ── Right column: input summary + computed key values ───────────────────────
  // El SVG izquierdo acaba en M+90, así que la columna arranca en M+94. Nada
  // puede cruzar PAGE_W-M: `twoCol` trunca cada celda a su ancho y `oneCol`
  // envuelve — antes la línea de wSer se salía del margen derecho.
  const COL_R   = M + 94;                 // right column x
  const COL_R2  = COL_R + 40;             // second value in right column
  const RIGHT_W = PAGE_W - M - COL_R;     // 76mm — ancho útil de la columna
  const COL_A_W = COL_R2 - COL_R - 2;     // 38mm — celda izquierda de twoCol
  const COL_B_W = PAGE_W - M - COL_R2;    // 36mm — celda derecha de twoCol
  const LH     = 4;         // line height mm (compact to fit all sections)
  // `titleBaseY`, no `M`: con título el H1 baja la cabecera 5.5mm y la regla
  // separadora (titleBaseY+8) pasaba por encima de "PERFIL Y MATERIAL".
  let ry = titleBaseY + 14;

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
    doc.text(truncateToWidth(doc, pdfStr(a), COL_A_W), COL_R, ry);
    if (b) doc.text(truncateToWidth(doc, pdfStr(b), COL_B_W), COL_R2, ry);
    ry += LH;
  };

  const oneCol = (a: string) => {
    doc.setFontSize(8);
    for (const line of doc.splitTextToSize(pdfStr(a), RIGHT_W) as string[]) {
      doc.text(line, COL_R, ry);
      ry += LH;
    }
  };

  const gap = () => { ry += 2; };

  // PERFIL Y MATERIAL
  sectionHeader('PERFIL Y MATERIAL');
  // section.label cubre tubos y 2UPN (sin registro I); profile.label, los I/H.
  const profileLabel = result.section?.label ?? result.profile?.label ?? `${inp.tipo} ${inp.size}`;
  twoCol(profileLabel, inp.steel);
  // Una sola celda: "Tipo: Empotrada-Articulada" no cabe en COL_A_W y pisaba
  // el "L = ..." de la segunda columna.
  oneCol(`Tipo: ${beamCase.label} (L = ${(inp.L / 1000).toFixed(2)} m)`);
  gap();

  // SOLICITACIONES ELU
  sectionHeader('SOLICITACIONES ELU');
  twoCol(`MEd = ${fmtSi(inp.MEd, 'moment')}`, `VEd = ${fmtSi(inp.VEd, 'force')}`);
  twoCol(
    `Lcr = ${(inp.Lcr / 1000).toFixed(2)} m`,
    pdfStr(`C1 = ${C1.toFixed(2)} (${beamCase.labelShort})`),
  );
  gap();

  // GENERADOR DE CARGAS — qk es la ENVOLVENTE de las acciones variables (una
  // sola casilla): el encabezado lo dice y la nota al pie lo justifica.
  sectionHeader('CARGAS (qk = ENVOLVENTE)');
  twoCol(`Cat.: ${categoryLabel(inp.useCategory)}`, `qk = ${fmtSi(inp.qk, 'areaLoad')}`);
  twoCol(`gk = ${fmtSi(inp.gk, 'areaLoad')}`, `bTrib = ${fmt(inp.bTrib)} m`);
  // Line loads
  twoCol(`Gk = ${fmtSi(Gk_line, 'linearLoad')}`, `Qk = ${fmtSi(Qk_line, 'linearLoad')}`);
  // ELU combination
  oneCol(`wEd = 1.35x${ll(Gk_line)} + 1.50x${ll(Qk_line)} = ${ll(wEd)} ${llUnit}`);
  // ELS combination
  oneCol(`${wSerFormula[elsCombo]}  [ELS ${elsComboLabel[elsCombo]}, ${psiSymbol[elsCombo]}]`);
  gap();

  // FLECHA ELS
  sectionHeader('FLECHA ELS');
  oneCol(`Combo: ${elsComboLabel[elsCombo]}  (${psiSymbol[elsCombo]})`);
  oneCol(`Mser = ${MSER_FORMULA[inp.beamType]} = ${fmtSi(inp.Mser, 'moment')}`);
  twoCol(`dadm = L/${inp.deflLimit}`, `${(inp.L / inp.deflLimit).toFixed(1)} mm`);
  gap();

  // RESULTADOS CLAVE
  sectionHeader('RESULTADOS CLAVE');
  twoCol(`Mc,Rd = ${fmtSi(result.Mc_Rd, 'moment')}`, `Clase ${result.sectionClass}`);
  twoCol(`Vc,Rd = ${fmtSi(result.Vc_Rd, 'force')}`,  `Av = ${fmt(result.Av, 0)} mm\xB2`);
  twoCol(`Mb,Rd = ${fmtSi(result.Mb_Rd, 'moment')}`, `chiLT = ${result.chi_LT.toFixed(3)}`);
  twoCol(`lamLT = ${result.lambda_LT.toFixed(3)}`, `Mcr = ${fmtSi(result.Mcr, 'moment')}`);
  twoCol(`dmax = ${fmt(result.delta_max)} mm`, `dadm = ${fmt(result.delta_adm)} mm`);

  // ── Results table ────────────────────────────────────────────────────────────
  // Anclado a `svgY` (= titleBaseY + 12), no a `M + 12`: con título los
  // diagramas bajan 5.5mm y la regla de la tabla los cortaba por abajo.
  //
  // Y cuelga de lo que ACABE MÁS ABAJO: los diagramas (columna izquierda) o el
  // resumen de la derecha (`ry`). Antes sólo miraba los diagramas, y como la
  // columna derecha crece con el contenido (`oneCol` envuelve, el generador de
  // cargas añade filas), sus últimas líneas —Vc,Rd / Av / Mb,Rd / chiLT— caían
  // DENTRO de la tabla: la regla separadora las tachaba y las columnas Valor y
  // Ut% de la primera fila se les montaban encima.
  const tableY = Math.max(svgY + SVG_H + diagramsH + 6, ry + 6);

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

  // Table column positions. `status` se ancla al margen derecho (align:'right')
  // porque las etiquetas largas ("ADVERTENCIA") desbordaban la caja.
  const COL = {
    desc:   M,
    value:  M + 76,
    limit:  M + 114,
    util:   M + 146,
    status: PAGE_W - M,
  };
  const DESC_W = 74;   // ancho máximo de la descripción, antes de "Valor"

  let rowY = tableY + 9;

  // Header row
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  setGray(doc, 100);
  doc.text('Verificacion',       COL.desc,   rowY);
  doc.text('Valor',              COL.value,  rowY);
  doc.text('Limite',             COL.limit,  rowY);
  doc.text('Ut%',                COL.util,   rowY);
  doc.text('Estado',             COL.status, rowY, { align: 'right' });
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
      doc.text(truncateToWidth(doc, pdfStr(chk.description), DESC_W), COL.desc, rowY);
      doc.setFont('helvetica', 'bold');
      doc.text(pdfStr(chk.tag ?? ''), COL.status, rowY, { align: 'right' });
      doc.setFont('helvetica', 'normal');
    } else {
      const st = chk.status as DisplayStatus;
      setGray(doc, 50);
      doc.text(truncateToWidth(doc, pdfStr(chk.description), DESC_W), COL.desc, rowY);
      doc.text(pdfStr(checkValueStr(chk)), COL.value,  rowY);
      doc.text(pdfStr(checkLimitStr(chk)), COL.limit,  rowY);
      doc.text(`${(chk.utilization * 100).toFixed(0)}%`, COL.util, rowY);
      doc.setFont('helvetica', 'bold');
      setGray(doc, st === 'ok' ? 60 : 30);
      doc.text(STATUS_LABEL[st],          COL.status, rowY, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      setGray(doc, 50);
    }

    // Article reference — pdfStr: el guion largo de "§6.3.2.3 — Pandeo…" no es
    // Latin-1 y jsPDF lo emitiría como basura.
    rowY += 4;
    doc.setFontSize(6);
    setGray(doc, 160);
    doc.text(pdfStr(chk.article), COL.desc + 2, rowY);
    doc.setFontSize(7);
    setGray(doc, 50);

    // Separator — drawn below article, with gap before next row
    rowY += 3;
    doc.setLineWidth(0.1);
    setGray(doc, 215);
    doc.line(M, rowY, PAGE_W - M, rowY);
    rowY += 4;  // gap: next description baseline is 4mm below separator
  }

  // ── Nota de cargas ───────────────────────────────────────────────────────────
  // El módulo tiene UNA sola acción variable: sin esta nota la memoria se lee
  // como "sobrecarga de uso" a secas y oculta que qk debe ser la envolvente.
  // Va sobre el pie (banda libre: las filas saltan de página en PAGE_H - M - 14).
  const footerY = PAGE_H - 10;
  const LOADS_NOTE =
    'qk = accion variable ENVOLVENTE: la mas desfavorable de las hipotesis (sobrecarga de uso, nieve, ' +
    'viento). En cubiertas de categoria G la sobrecarga de uso no es concomitante con nieve ni viento ' +
    '(CTE DB-SE-AE 3.1.1): gobierna la mayor.';
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  setGray(doc, 150);
  const noteLines = doc.splitTextToSize(pdfStr(LOADS_NOTE), PAGE_W - 2 * M) as string[];
  noteLines.forEach((line, i) => {
    doc.text(line, M, footerY - 4 - (noteLines.length - 1 - i) * 2.6);
  });

  // ── Footer ───────────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  setGray(doc, 150);
  doc.text('Concreta - concreta.app | CTE DB-SE-A Espana', M, footerY);
  doc.text('Pagina 1', PAGE_W - M, footerY, { align: 'right' });

  const filename = titledFilename(elementTitle, steelBeamsFallbackFilename());
  const blob = doc.output('blob');
  const blobUrl = URL.createObjectURL(blob);
  const pageCount = (doc.internal as unknown as { getNumberOfPages(): number }).getNumberOfPages();
  return { blobUrl, filename, pageCount };
}
