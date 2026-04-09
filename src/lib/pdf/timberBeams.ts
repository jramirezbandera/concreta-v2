// PDF export for Timber Beams module — EN 1995-1-1 (EC5) + EN 1995-1-2 (fire)
// jsPDF + svg2pdf.js — A4 portrait, margins 20mm, single page.
//
// Layout:
//   1. Header (title + date)
//   2. SVG full-width (170mm × 44mm)
//   3. Inputs — 2 columns side-by-side (85mm each)
//   4. Checks table — 4 columns (Descripción + normativa subscript | Valor | Límite | Ut%)
//   5. ELU/ELS key values
//   6. Footer

import jsPDF from 'jspdf';
import { svg2pdf } from 'svg2pdf.js';
import { type TimberBeamInputs } from '../../data/defaults';
import { type TimberBeamResult } from '../../lib/calculations/timberBeams';
import { PAGE_W, PAGE_H, setGray, pdfStr, STATUS_LABEL } from './utils';

const M = 20;
const CONTENT_W = PAGE_W - 2 * M;  // 170mm

const SC_LABEL: Record<number, string> = {
  1: 'SC 1 - Interior seco',
  2: 'SC 2 - Exterior cubierto',
  3: 'SC 3 - Exterior intemperie',
};

const DURATION_LABEL: Record<string, string> = {
  permanent:     'Permanente',
  long:          'Larga duracion',
  medium:        'Media duracion',
  short:         'Corta duracion',
  instantaneous: 'Instantanea',
};

export async function exportTimberBeamsPDF(
  inp: TimberBeamInputs,
  result: TimberBeamResult,
): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // ── Header ───────────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  setGray(doc, 30);
  doc.text('Concreta - Viga de madera - EC5 EN 1995-1-1 / 1995-1-2', M, M);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  setGray(doc, 130);
  doc.text(`Generado: ${new Date().toLocaleDateString('es-ES')}`, M, M + 5);

  doc.setLineWidth(0.3);
  setGray(doc, 200);
  doc.line(M, M + 8, PAGE_W - M, M + 8);

  // ── SVG full-width ───────────────────────────────────────────────────────────
  const svgContainer = document.getElementById('timber-beams-svg-pdf');
  const svgEl = svgContainer?.querySelector('svg') as SVGSVGElement | null;

  const SVG_Y  = M + 12;
  const SVG_W  = CONTENT_W;                         // 170mm
  const SVG_H  = Math.round(SVG_W * 200 / 760);     // ~44mm (exact aspect of 760×200)

  if (svgEl) {
    await svg2pdf(svgEl, doc, { x: M, y: SVG_Y, width: SVG_W, height: SVG_H });
  }

  // ── Inputs — 2 columns (85mm each) ──────────────────────────────────────────
  const COL_L  = M;                    // left column x
  const COL_R  = M + CONTENT_W / 2;   // right column x = 105mm
  const LH     = 4.5;
  let   ly     = SVG_Y + SVG_H + 5;   // shared y cursor (left side drives height)
  let   ry     = ly;

  const lSecHeader = (label: string) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    setGray(doc, 70);
    doc.text(label, COL_L, ly);
    ly += LH;
    doc.setFont('helvetica', 'normal');
    setGray(doc, 80);
  };

  const rSecHeader = (label: string) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    setGray(doc, 70);
    doc.text(label, COL_R, ry);
    ry += LH;
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

  // Left column: section + geometry + loads + fire
  lSecHeader('SECCION Y CARGAS');
  lRow(`Clase: ${inp.gradeId}`);
  lRow(`b = ${inp.b} mm`, `h = ${inp.h} mm`);
  lRow(`L = ${inp.L} m`);
  lRow(`gk = ${inp.gk} kN/m`, `qk = ${inp.qk} kN/m`);
  ly += 2;

  if (result.fireActive) {
    lSecHeader('INCENDIO');
    lRow(`R${result.t_fire} - ${inp.exposedFaces} caras expuestas`);
    lRow(`dchar = ${result.dchar.toFixed(1)} mm`, `def = ${result.def.toFixed(1)} mm`);
    lRow(`Secc. residual: ${result.b_ef.toFixed(0)} x ${result.h_ef.toFixed(0)} mm`);
  }

  // Right column: service conditions + material factors
  rSecHeader('CONDICIONES DE USO');
  rRow(SC_LABEL[inp.serviceClass] ?? `SC ${inp.serviceClass}`);
  rRow(pdfStr(DURATION_LABEL[inp.loadDuration] ?? inp.loadDuration));
  ry += 1;
  rSecHeader('FACTORES EC5');
  rRow(`kmod = ${result.kmod.toFixed(2)}`, `kdef = ${result.kdef.toFixed(2)}`);
  rRow(`kh = ${result.kh.toFixed(3)}`, `kcr = ${result.kcr.toFixed(2)}`);
  rRow(`ksys = ${result.ksys.toFixed(2)}`, `gM = ${result.gammaM.toFixed(2)}`);
  rRow(`psi2 = ${result.psi2.toFixed(2)}`);
  ry += 1;
  rSecHeader('ELU / ELS');
  rRow(`MEd = ${result.MEd.toFixed(2)} kNm`, `VEd = ${result.VEd.toFixed(2)} kN`);
  rRow(`lam_rel = ${result.lambda_rel_m.toFixed(3)}`, `kcrit = ${result.kcrit.toFixed(3)}`);
  rRow(`u_inst = ${result.u_inst.toFixed(1)} mm (L/300)`);
  rRow(`u_fin = ${result.u_fin.toFixed(1)} mm (L/250)`);
  rRow(`u_act = ${result.u_active.toFixed(1)} mm (L/350)`);

  // ── Checks table ─────────────────────────────────────────────────────────────
  // Start below whichever column ended lower
  const tableY = Math.max(ly, ry) + 4;

  doc.setLineWidth(0.3);
  setGray(doc, 180);
  doc.line(M, tableY - 2, PAGE_W - M, tableY - 2);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  setGray(doc, 60);
  doc.text('VERIFICACIONES', M, tableY + 3);

  const activeChecks = result.checks.filter(c => !c.neutral);
  const hasFail = activeChecks.some(c => c.status === 'fail');
  const hasWarn = activeChecks.some(c => c.status === 'warn');
  const overall = hasFail ? 'fail' : hasWarn ? 'warn' : 'ok';

  doc.setFontSize(11);
  setGray(doc, 30);
  doc.text(STATUS_LABEL[overall], PAGE_W - M, tableY + 3, { align: 'right' });

  // 4-column layout: Descripción(+normativa subscript) | Valor | Límite | Ut%
  const TC = {
    desc:   M,           // description — 100mm wide
    value:  M + 100,     // valor       — 25mm
    limit:  M + 125,     // límite      — 25mm
    util:   M + 150,     // ut% + state — 20mm
  };

  let rowY = tableY + 9;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  setGray(doc, 100);
  doc.text('Verificacion',      TC.desc,  rowY);
  doc.text('Valor',             TC.value, rowY);
  doc.text('Limite',            TC.limit, rowY);
  doc.text('Ut% / Estado',      TC.util,  rowY);
  rowY += 2;

  doc.setLineWidth(0.2);
  setGray(doc, 160);
  doc.line(M, rowY, PAGE_W - M, rowY);
  rowY += 5;

  for (const ch of result.checks) {
    if (rowY > PAGE_H - M - 8) break;

    if (ch.neutral) {
      // Group separator (e.g. "ELU - Estado Límite Último")
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      setGray(doc, 70);
      doc.text(pdfStr(ch.description), TC.desc, rowY);
      if (ch.tag) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        setGray(doc, 120);
        doc.text(pdfStr(ch.tag), TC.util, rowY);
      }
      setGray(doc, 205);
      doc.line(M, rowY + 2, PAGE_W - M, rowY + 2);
      rowY += 6;
      continue;
    }

    const isFail = ch.status === 'fail';
    const isWarn = ch.status === 'warn';

    // Description — line 1
    doc.setFont('helvetica', isFail || isWarn ? 'bold' : 'normal');
    doc.setFontSize(7.5);
    setGray(doc, 55);
    doc.text(pdfStr(ch.description), TC.desc, rowY, { maxWidth: 97 });

    // Normative ref — line 2 (grey subscript, same x)
    if (ch.article) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      setGray(doc, 150);
      doc.text(pdfStr(ch.article), TC.desc, rowY + 3.5, { maxWidth: 97 });
    }

    // Valor + Límite
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    setGray(doc, 75);
    doc.text(pdfStr(ch.value), TC.value, rowY, { maxWidth: 23 });
    doc.text(pdfStr(ch.limit), TC.limit, rowY, { maxWidth: 23 });

    // Ut% — bold if failing/warning
    const textG = isFail ? 60 : isWarn ? 80 : 100;
    doc.setFont('helvetica', isFail || isWarn ? 'bold' : 'normal');
    doc.setFontSize(7.5);
    setGray(doc, textG);
    const utText = ch.utilization <= 1
      ? `${(ch.utilization * 100).toFixed(0)}%`
      : STATUS_LABEL[ch.status];
    doc.text(utText, TC.util, rowY);

    setGray(doc, 215);
    doc.line(M, rowY + 5, PAGE_W - M, rowY + 5);
    rowY += 9;  // taller row to fit 2-line description
  }

  // ── Footer ───────────────────────────────────────────────────────────────────
  const footerY = PAGE_H - 10;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  setGray(doc, 150);
  doc.text(
    'Concreta - concreta.app | EC5 EN 1995-1-1 + EN 1995-1-2   gM = 1.30 (aserrada) / 1.25 (laminada)',
    M, footerY,
  );
  doc.text('Pagina 1', PAGE_W - M, footerY, { align: 'right' });

  doc.save('viga-madera.pdf');
}
