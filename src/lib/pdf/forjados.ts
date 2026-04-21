// PDF export for Forjados (reticular / losa maciza) — CE art. 21, 42, 44, 49.2.4.
// jsPDF + svg2pdf.js — A4 portrait, margins 20mm.
//
// Layout:
//   1. Header (title + date + variant)
//   2. SVG (section for the active tab; uses vano SVG)
//   3. Inputs — 2 columns
//   4. Resultados — por zona (Vano, Apoyo) + Cortante
//   5. Checks table (Vano + Apoyo + cortante + info)
//   6. Footer

import jsPDF from 'jspdf';
import { svg2pdf } from 'svg2pdf.js';
import { type ForjadosInputs } from '../../data/defaults';
import { type ForjadosResult } from '../calculations/rcSlabs';
import { type CheckRow } from '../calculations/types';
import { PAGE_W, PAGE_H, setGray, pdfStr, STATUS_LABEL, type PdfResult } from './utils';
import { formatQuantity } from '../units/format';
import type { Quantity, UnitSystem } from '../units/types';

const M = 20;
const CONTENT_W = PAGE_W - 2 * M;  // 170mm

export async function exportForjadosPDF(
  inp: ForjadosInputs,
  result: ForjadosResult,
  system: UnitSystem = 'si',
): Promise<PdfResult> {
  const fmtSi = (v: number, q: Quantity, precision = 1) =>
    formatQuantity(v, q, system, { precision });
  // Freeze state at export start — the user may mutate inputs while svg2pdf is
  // rasterizing, causing visually inconsistent output. structuredClone gives us
  // a deep snapshot of primitives (ForjadosInputs is flat key:value) and the
  // result object (plain objects + arrays of CheckRow). No DOM refs involved.
  const frozenInp: ForjadosInputs = structuredClone(inp);
  const frozenResult: ForjadosResult = structuredClone(result);

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const isReticular = frozenResult.variant === 'reticular';

  // ── Header ───────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  setGray(doc, 30);
  const titleVariant = isReticular ? 'Forjado reticular' : 'Losa maciza';
  doc.text(`Concreta - ${titleVariant} - CE art. 21, 42, 44`, M, M);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  setGray(doc, 130);
  doc.text(`Generado: ${new Date().toLocaleDateString('es-ES')}`, M, M + 5);

  doc.setLineWidth(0.3);
  setGray(doc, 200);
  doc.line(M, M + 8, PAGE_W - M, M + 8);

  // ── SVG ──────────────────────────────────────────────────────────────────
  const svgContainer = document.getElementById('forjados-svg-pdf');
  const svgEls = svgContainer ? Array.from(svgContainer.querySelectorAll('svg')) as SVGSVGElement[] : [];
  const SVG_Y = M + 12;
  const SVG_H = 65;
  if (svgEls[0]) {
    await svg2pdf(svgEls[0], doc, { x: M, y: SVG_Y, width: CONTENT_W, height: SVG_H });
  }

  // ── Inputs — 2 columns ───────────────────────────────────────────────────
  const COL_L = M;
  const COL_R = M + CONTENT_W / 2;
  const LH = 4.5;
  let ly = SVG_Y + SVG_H + 5;
  let ry = ly;

  const secHeader = (label: string, side: 'L' | 'R') => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    setGray(doc, 70);
    if (side === 'L') {
      doc.text(label, COL_L, ly); ly += LH;
    } else {
      doc.text(label, COL_R, ry); ry += LH;
    }
    doc.setFont('helvetica', 'normal');
    setGray(doc, 80);
  };
  const lRow = (a: string, b = '') => {
    doc.setFontSize(8);
    doc.text(pdfStr(a), COL_L, ly);
    if (b) doc.text(pdfStr(b), COL_L + 40, ly);
    ly += LH;
  };
  const rRow = (a: string, b = '') => {
    doc.setFontSize(8);
    doc.text(pdfStr(a), COL_R, ry);
    if (b) doc.text(pdfStr(b), COL_R + 38, ry);
    ry += LH;
  };

  // Left: geometría + materiales
  secHeader('GEOMETRIA', 'L');
  if (isReticular) {
    lRow(`Tipologia: ${frozenInp.tipologia}`);
    lRow(`h = ${frozenInp.h} mm`,        `h_f = ${frozenInp.hFlange} mm`);
    lRow(`b_w = ${frozenInp.bWeb} mm`,   `Intereje = ${frozenInp.intereje} mm`);
    lRow(`L = ${frozenInp.spanLength} mm`, `Tipo: ${frozenInp.tipoVano}`);
    lRow(`L0 = ${frozenResult.L0.toFixed(0)} mm`, `b_eff = ${frozenResult.bEff.toFixed(0)} mm`);
  } else {
    lRow(`Losa maciza — franja b = 1000 mm`);
    lRow(`h = ${frozenInp.h} mm`);
  }
  lRow(`Recubrimiento = ${frozenInp.cover} mm`);
  ly += 1;
  secHeader('MATERIALES', 'L');
  lRow(`fck = ${frozenInp.fck} N/mm2`, `fyk = ${frozenInp.fyk} N/mm2`);
  lRow(`Exposicion: ${frozenInp.exposureClass}`);

  // Right: armado + esfuerzos
  secHeader('ARMADO', 'R');
  if (isReticular) {
    rRow(`Base sup (montaje): ${frozenInp.base_sup_nBars} ph${frozenInp.base_sup_barDiam}`);
    rRow(`Base inf (montaje): ${frozenInp.base_inf_nBars} ph${frozenInp.base_inf_barDiam}`);
    rRow(`Ref. vano (inf):    ${frozenInp.refuerzo_vano_inf_nBars} ph${frozenInp.refuerzo_vano_inf_barDiam}`);
    rRow(`Ref. apoyo (sup):   ${frozenInp.refuerzo_apoyo_sup_nBars} ph${frozenInp.refuerzo_apoyo_sup_barDiam}`);
  } else {
    rRow(`Base sup: ph${frozenInp.base_sup_phi_mac}/${frozenInp.base_sup_s_mac}`);
    rRow(`Base inf: ph${frozenInp.base_inf_phi_mac}/${frozenInp.base_inf_s_mac}`);
    const refV = (frozenInp.refuerzo_vano_inf_phi_mac as number) > 0
      ? `ph${frozenInp.refuerzo_vano_inf_phi_mac}/${frozenInp.refuerzo_vano_inf_s_mac}`
      : '—';
    const refA = (frozenInp.refuerzo_apoyo_sup_phi_mac as number) > 0
      ? `ph${frozenInp.refuerzo_apoyo_sup_phi_mac}/${frozenInp.refuerzo_apoyo_sup_s_mac}`
      : '—';
    rRow(`Ref. vano (inf):  ${refV}`);
    rRow(`Ref. apoyo (sup): ${refA}`);
  }
  if (frozenInp.stirrupsEnabled) {
    rRow(`Cercos apoyo: ph${frozenInp.apoyo_stirrupDiam}x${frozenInp.apoyo_stirrupLegs} r., s=${frozenInp.apoyo_stirrupSpacing}`);
  } else {
    rRow('Sin armadura de cortante');
  }
  ry += 1;
  secHeader('ESFUERZOS (ELU)', 'R');
  rRow(`Md+ vano = ${fmtSi(frozenInp.vano_Md, 'moment', 2)}`);
  rRow(`|M-| apoyo = ${fmtSi(frozenInp.apoyo_Md, 'moment', 2)}`);
  rRow(`VEd = ${fmtSi(frozenInp.VEd, 'force')}`);

  // ── Resultados (por zona) ────────────────────────────────────────────────
  const resY = Math.max(ly, ry) + 3;
  doc.setLineWidth(0.3);
  setGray(doc, 180);
  doc.line(M, resY - 1, PAGE_W - M, resY - 1);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  setGray(doc, 60);
  doc.text('RESULTADOS', M, resY + 4);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  setGray(doc, 80);
  const rY1 = resY + 9;
  const vanoTxt = `Vano: d=${frozenResult.vano.d.toFixed(0)} As(base+ref)=${frozenResult.vano.AsBase.toFixed(0)}+${frozenResult.vano.AsRef.toFixed(0)}=${frozenResult.vano.As.toFixed(0)} MRd=${fmtSi(frozenResult.vano.MRd, 'moment', 1)}`;
  const apoyoTxt = `Apoyo: d=${frozenResult.apoyo.d.toFixed(0)} As(base+ref)=${frozenResult.apoyo.AsBase.toFixed(0)}+${frozenResult.apoyo.AsRef.toFixed(0)}=${frozenResult.apoyo.As.toFixed(0)} MRd=${fmtSi(frozenResult.apoyo.MRd, 'moment', 1)}`;
  doc.text(pdfStr(vanoTxt),  M, rY1);
  doc.text(pdfStr(apoyoTxt), M, rY1 + LH);
  const shearTxt = frozenInp.stirrupsEnabled
    ? `Cortante: VRd,c=${fmtSi(frozenResult.VRdc, 'force', 1)} VRd,s=${fmtSi(frozenResult.VRds, 'force', 1)} VRd,max=${fmtSi(frozenResult.VRdmax, 'force', 1)}`
    : `Cortante (sin cercos): VRd,c = ${fmtSi(frozenResult.VRdc, 'force', 2)}`;
  doc.text(pdfStr(shearTxt), M, rY1 + 2 * LH);

  // ── Checks table ─────────────────────────────────────────────────────────
  const tableY = rY1 + 3 * LH + 3;

  doc.setLineWidth(0.3);
  setGray(doc, 180);
  doc.line(M, tableY - 2, PAGE_W - M, tableY - 2);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  setGray(doc, 60);
  doc.text('VERIFICACIONES', M, tableY + 3);

  // Build labeled check list: prefix with zone
  type LabeledCheck = { check: CheckRow; zone: string };
  const labeled: LabeledCheck[] = [
    ...frozenResult.vano.checks.map((c): LabeledCheck => ({ check: c, zone: 'Vano' })),
    ...frozenResult.apoyo.checks.map((c): LabeledCheck => ({ check: c, zone: 'Apoyo' })),
    ...frozenResult.shearChecks.map((c): LabeledCheck => ({ check: c, zone: 'Cortante' })),
    ...frozenResult.infoChecks.map((c): LabeledCheck => ({ check: c, zone: 'Info' })),
  ];

  const blockingChecks = labeled
    .filter((x) => x.zone !== 'Info')
    .map((x) => x.check);
  const hasFail = blockingChecks.some((c) => c.status === 'fail');
  const hasWarn = blockingChecks.some((c) => c.status === 'warn');
  const overall = hasFail ? 'fail' : hasWarn ? 'warn' : 'ok';

  doc.setFontSize(11);
  setGray(doc, 30);
  doc.text(STATUS_LABEL[overall], PAGE_W - M, tableY + 3, { align: 'right' });

  const TC = {
    zone:  M,
    desc:  M + 18,
    value: M + 95,
    limit: M + 122,
    util:  M + 150,
  };

  let rowY = tableY + 9;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  setGray(doc, 100);
  doc.text('Zona',         TC.zone,  rowY);
  doc.text('Verificacion', TC.desc,  rowY);
  doc.text('Valor',        TC.value, rowY);
  doc.text('Limite',       TC.limit, rowY);
  doc.text('Ut% / Estado', TC.util,  rowY);
  rowY += 2;

  doc.setLineWidth(0.2);
  setGray(doc, 160);
  doc.line(M, rowY, PAGE_W - M, rowY);
  rowY += 5;

  for (const { check: ch, zone } of labeled) {
    if (rowY > PAGE_H - M - 8) break;

    const isFail = ch.status === 'fail';
    const isWarn = ch.status === 'warn';

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    setGray(doc, 100);
    doc.text(zone, TC.zone, rowY);

    doc.setFont('helvetica', isFail || isWarn ? 'bold' : 'normal');
    doc.setFontSize(7.5);
    setGray(doc, 55);
    doc.text(pdfStr(ch.description), TC.desc, rowY, { maxWidth: 73 });

    if (ch.article) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      setGray(doc, 150);
      doc.text(pdfStr(ch.article), TC.desc, rowY + 3.5, { maxWidth: 73 });
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    setGray(doc, 75);
    doc.text(pdfStr(ch.value ?? ''), TC.value, rowY, { maxWidth: 25 });
    doc.text(pdfStr(ch.limit ?? ''), TC.limit, rowY, { maxWidth: 25 });

    const textG = isFail ? 60 : isWarn ? 80 : 100;
    doc.setFont('helvetica', isFail || isWarn ? 'bold' : 'normal');
    doc.setFontSize(7.5);
    setGray(doc, textG);
    const utText = isFinite(ch.utilization) && ch.utilization <= 1
      ? `${(ch.utilization * 100).toFixed(0)}%`
      : STATUS_LABEL[ch.status];
    doc.text(utText, TC.util, rowY);

    setGray(doc, 215);
    doc.line(M, rowY + 5, PAGE_W - M, rowY + 5);
    rowY += 9;
  }

  // ── Footer ───────────────────────────────────────────────────────────────
  const footerY = PAGE_H - 10;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  setGray(doc, 150);
  doc.text(
    'Concreta - concreta.app | Codigo Estructural art. 21/42/44/49   gC = 1.50, gS = 1.15',
    M, footerY,
  );
  doc.text('Pagina 1', PAGE_W - M, footerY, { align: 'right' });

  const filename = isReticular ? 'forjado-reticular.pdf' : 'losa-maciza.pdf';
  const blob = doc.output('blob');
  const blobUrl = URL.createObjectURL(blob);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pageCount = (doc.internal as any).getNumberOfPages();
  return { blobUrl, filename, pageCount };
}
