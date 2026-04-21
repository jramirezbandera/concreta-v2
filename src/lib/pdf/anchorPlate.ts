// PDF export for Anchor Plate module (PR-3 — rebar model)
// A4 portrait, 20mm margins. Layout:
//   1. Header
//   2. Inputs — two columns
//   3. SVG (planta + alzado, from #anchor-plate-svg-pdf)
//   4. Checks table
//   5. Solver summary
//   6. Verdict banner + footer

import jsPDF from 'jspdf';
import { svg2pdf } from 'svg2pdf.js';
import type { AnchorPlateInputs, PedestalSurface } from '../../data/defaults';
import type { BottomAnchorage, TopConnection } from '../../data/anchorBars';
import type { AnchorPlateResult } from '../calculations/anchorPlate';
import { PAGE_W, PAGE_H, setGray, pdfStr, STATUS_LABEL, type PdfResult } from './utils';
import { formatQuantity } from '../units/format';
import type { Quantity, UnitSystem } from '../units/types';

const M = 20;
const CW = PAGE_W - 2 * M;

const BOTTOM_LABEL: Record<BottomAnchorage, string> = {
  prolongacion_recta: 'Prolongacion recta',
  patilla:            'Patilla 90 deg',
  gancho:             'Gancho >= 135 deg',
  arandela_tuerca:    'Arandela + tuerca (cabeza)',
};

const TOP_LABEL: Record<TopConnection, string> = {
  soldada:         'Soldada a placa',
  tuerca_arandela: 'Tuerca + arandela',
};

const SURF_LABEL: Record<PedestalSurface, string> = {
  smooth:    'Lisa (mu = 0.20)',
  roughened: 'Rugosa (mu = 0.40)',
};

function fmt(v: number, d = 1): string {
  if (!isFinite(v)) return '---';
  return v.toFixed(d);
}

export async function exportAnchorPlatePDF(
  inp: AnchorPlateInputs,
  result: AnchorPlateResult,
  system: UnitSystem = 'si',
): Promise<PdfResult> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const fmtSi = (v: number, q: Quantity) => formatQuantity(v, q, system, { precision: 1 });

  // ── 1. Header ──────────────────────────────────────────────────────────
  setGray(doc, 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('Concreta - Placa de anclaje (EC3 §6.2.5 / EN 1992-4)', M, M);

  setGray(doc, 130);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`Generado: ${new Date().toLocaleDateString('es-ES')}`, M, M + 5);

  setGray(doc, 200);
  doc.setLineWidth(0.3);
  doc.line(M, M + 8, PAGE_W - M, M + 8);

  // ── 2. Inputs — two columns ────────────────────────────────────────────
  const COL_L = M;
  const COL_R = M + CW / 2;
  const LH = 4.2;
  let ly = M + 13;
  let ry = ly;

  const sectionHeader = (x: number, label: string, yRef: 'l' | 'r') => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    setGray(doc, 70);
    doc.text(label, x, yRef === 'l' ? ly : ry);
    if (yRef === 'l') ly += LH; else ry += LH;
    doc.setFont('helvetica', 'normal');
    setGray(doc, 60);
  };

  const lRow = (k: string, v: string) => {
    doc.setFontSize(8);
    setGray(doc, 90); doc.text(pdfStr(k), COL_L, ly);
    setGray(doc, 20); doc.setFont('helvetica', 'bold'); doc.text(pdfStr(v), COL_L + 42, ly);
    doc.setFont('helvetica', 'normal');
    ly += LH;
  };
  const rRow = (k: string, v: string) => {
    doc.setFontSize(8);
    setGray(doc, 90); doc.text(pdfStr(k), COL_R, ry);
    setGray(doc, 20); doc.setFont('helvetica', 'bold'); doc.text(pdfStr(v), COL_R + 42, ry);
    doc.setFont('helvetica', 'normal');
    ry += LH;
  };

  sectionHeader(COL_L, 'PERFIL Y ACCIONES', 'l');
  lRow('Perfil', `${inp.sectionType} ${inp.sectionSize}`);
  lRow('NEd / NEd,G', `${fmtSi(inp.NEd, 'force')} / ${fmtSi(inp.NEd_G, 'force')}`);
  lRow('Mx', fmtSi(inp.Mx, 'moment'));
  lRow('My', fmtSi(inp.My, 'moment'));
  lRow('VEd', fmtSi(inp.VEd, 'force'));
  ly += 1;

  sectionHeader(COL_L, 'PLACA Y RIGIDIZADORES', 'l');
  lRow('Placa a x b x t', `${inp.plate_a} x ${inp.plate_b} x ${inp.plate_t} mm`);
  lRow('Acero placa', inp.plate_steel);
  lRow('Rigidizadores', `${inp.rib_count} x (${inp.rib_h} x ${inp.rib_t}) mm`);
  lRow('Cordon soldadura', `a = ${inp.weld_throat} mm`);

  sectionHeader(COL_R, 'BARRAS DE ANCLAJE', 'r');
  rRow('Disposicion', `${inp.bar_nLayout} barras`);
  rRow('Diametro / calidad', `O${inp.bar_diam}  ${inp.bar_grade}`);
  rRow('Separacion x / y', `${inp.bar_spacing_x} / ${inp.bar_spacing_y} mm`);
  rRow('Borde x / y', `${inp.bar_edge_x} / ${inp.bar_edge_y} mm`);
  rRow('Empotramiento hef', `${inp.bar_hef} mm`);
  rRow('Anclaje inferior', pdfStr(BOTTOM_LABEL[inp.bottom_anchorage]));
  rRow('Union a placa',    pdfStr(TOP_LABEL[inp.top_connection]));
  if (inp.bottom_anchorage === 'arandela_tuerca') {
    rRow('OD arandela', `${inp.washer_od} mm`);
  }
  ry += 1;

  sectionHeader(COL_R, 'PEDESTAL / HORMIGON', 'r');
  rRow('fck', `${inp.fck} N/mm2`);
  rRow('Perno-borde cX / cY', `${inp.pedestal_cX} / ${inp.pedestal_cY} mm`);
  rRow('Placa-borde mX / mY', `${inp.plate_margin_x} / ${inp.plate_margin_y} mm`);
  rRow('Superficie', pdfStr(SURF_LABEL[inp.surface_type]));

  let y = Math.max(ly, ry) + 2;

  setGray(doc, 200);
  doc.setLineWidth(0.2);
  doc.line(M, y, PAGE_W - M, y);
  y += 4;

  // ── 3. SVG diagram ─────────────────────────────────────────────────────
  const svgContainer = document.getElementById('anchor-plate-svg-pdf');
  const svgEl = svgContainer?.querySelector('svg') as SVGSVGElement | null;

  if (svgEl) {
    const SVG_NATIVE_W = 420;
    const SVG_NATIVE_H = 460;
    const scale = CW / SVG_NATIVE_W;
    const rendH = SVG_NATIVE_H * scale;
    try {
      await svg2pdf(svgEl, doc, { x: M, y, width: CW, height: rendH });
      y += rendH + 2;
    } catch {
      // silently skip diagram
    }

    setGray(doc, 140);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.text(
      `Planta + alzado  |  Modo solver: ${pdfStr(result.solver.mode)}`,
      PAGE_W / 2, y, { align: 'center' },
    );
    y += 4;
  }

  setGray(doc, 200);
  doc.setLineWidth(0.2);
  doc.line(M, y, PAGE_W - M, y);
  y += 4;

  // Page-break helper
  const footerMargin = 16;
  const ensure = (need: number) => {
    if (y + need > PAGE_H - footerMargin) {
      doc.addPage();
      y = M;
    }
  };

  // ── 4. Checks table ────────────────────────────────────────────────────
  ensure(10);
  setGray(doc, 30);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('VERIFICACIONES', M, y);
  y += 4;

  // Layout: two logical lines per check.
  //   line1: description (left)  ·  Ut% + state badge (right)
  //   line2: value / limit (grey, smaller)  ·  article (right)
  //   + utilization bar on a dedicated strip under line1.
  const COL_DESC_W   = CW * 0.62;  // ~105 mm
  const COL_META_W   = CW - COL_DESC_W - 2;
  const BAR_X        = M;
  const BAR_W        = CW;

  setGray(doc, 100);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.text('Verificacion', M, y);
  doc.text('Ut% / Estado', PAGE_W - M, y, { align: 'right' });
  y += 2;
  setGray(doc, 180);
  doc.setLineWidth(0.15);
  doc.line(M, y, PAGE_W - M, y);
  y += 3.2;

  for (const c of result.checks) {
    // Measure wrapped description height to keep row compact but legible.
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    const descLines = doc.splitTextToSize(pdfStr(c.description), COL_DESC_W) as string[];

    doc.setFontSize(6);
    const valueLimit = `${pdfStr(c.value ?? '')}  |  <= ${pdfStr(c.limit ?? '')}`;
    const vlLines = doc.splitTextToSize(valueLimit, COL_DESC_W) as string[];

    const rowH = 3.4 + descLines.length * 3 + vlLines.length * 2.8 + 2.5; // bar + padding
    ensure(rowH + 1);

    // line 1 — description (left) + Ut% / status (right)
    setGray(doc, 40);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text(descLines, M, y);

    const utPct = Math.min(c.utilization * 100, 999);
    const utStr = isFinite(c.utilization) ? `${utPct.toFixed(0)}%` : '---';
    const stLbl = STATUS_LABEL[c.status];

    setGray(doc, 20);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.text(utStr, PAGE_W - M - 22, y, { align: 'right' });

    const stGray = c.status === 'ok' ? 50 : c.status === 'warn' ? 35 : 0;
    setGray(doc, stGray);
    doc.setFontSize(7);
    doc.text(stLbl, PAGE_W - M, y, { align: 'right' });

    let cursorY = y + descLines.length * 3 + 0.8;

    // line 2 — value / limit (grey) + article (right, tiny)
    setGray(doc, 105);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.text(vlLines, M, cursorY);

    setGray(doc, 140);
    doc.setFontSize(5.5);
    doc.text(pdfStr(c.article), PAGE_W - M, cursorY, { align: 'right', maxWidth: COL_META_W - 2 });

    cursorY += vlLines.length * 2.8 + 1.2;

    // utilization bar across full content width
    if (isFinite(c.utilization)) {
      const barH = 1.1;
      const fillW = BAR_W * Math.min(c.utilization, 1);
      doc.setFillColor(225, 225, 225);
      doc.rect(BAR_X, cursorY, BAR_W, barH, 'F');
      const g = c.status === 'ok' ? 110 : c.status === 'warn' ? 60 : 20;
      doc.setFillColor(g, g, g);
      if (fillW > 0) doc.rect(BAR_X, cursorY, fillW, barH, 'F');
      cursorY += barH;
    }

    cursorY += 1.6;
    setGray(doc, 228);
    doc.setLineWidth(0.08);
    doc.line(M, cursorY, PAGE_W - M, cursorY);
    y = cursorY + 2.2;
  }

  y += 2;

  // ── 5. Solver summary ─────────────────────────────────────────────────
  ensure(30);
  setGray(doc, 30);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('ESTADO DEL NUDO', M, y);
  y += 4;

  const solver = result.solver;
  const kv: [string, string][] = [
    ['Modo solver', pdfStr(solver.mode)],
    ['Nc (compresion)', fmtSi(solver.Nc, 'force')],
    ['Ft total (grupo)', fmtSi(solver.Ft_total, 'force')],
    ['Barras traccionadas', `${solver.n_t} de ${solver.bolts.length}`],
    ['Brazo palanca x_c', `${fmt(solver.x_c, 0)} mm`],
  ];

  doc.setFontSize(7.5);
  for (const [k, v] of kv) {
    ensure(5);
    setGray(doc, 90); doc.setFont('helvetica', 'normal'); doc.text(pdfStr(k), M, y);
    setGray(doc, 20); doc.setFont('helvetica', 'bold'); doc.text(pdfStr(v), M + 55, y);
    y += 4;
  }

  // D2 — APROX disclaimer when biaxial solver did not converge
  if (!solver.converged) {
    y += 2;
    ensure(10);
    doc.setFillColor(255, 243, 205);   // soft amber
    doc.rect(M, y - 3, CW, 7, 'F');
    doc.setDrawColor(200, 160, 50);
    doc.setLineWidth(0.2);
    doc.rect(M, y - 3, CW, 7, 'S');
    setGray(doc, 60);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.8);
    doc.text('APROX (grid-search)', M + 2, y + 1);
    setGray(doc, 80);
    doc.setFont('helvetica', 'normal');
    doc.text(pdfStr(solver.note), M + 42, y + 1);
    y += 6;
  }

  // D16 — Per-bar tension breakdown table (only if any bar in tension)
  const tensioned = solver.bolts.filter((b) => b.inTension && b.Ft > 0);
  if (tensioned.length > 0) {
    y += 3;
    ensure(12);
    setGray(doc, 30);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text('TRACCION POR BARRA', M, y);
    y += 4;

    const BC = {
      bar: M,
      x:   M + 25,
      ycol: M + 50,
      ft:  M + 75,
    };

    setGray(doc, 100);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.text('Barra', BC.bar, y);
    doc.text('x [mm]', BC.x, y);
    doc.text('y [mm]', BC.ycol, y);
    doc.text(`Ft [${system === 'si' ? 'kN' : 'Tn'}]`, BC.ft, y);
    y += 2;
    setGray(doc, 180);
    doc.setLineWidth(0.15);
    doc.line(M, y, PAGE_W - M, y);
    y += 3;

    doc.setFontSize(7);
    for (const b of solver.bolts) {
      ensure(5);
      setGray(doc, 40);
      doc.setFont('helvetica', 'normal');
      doc.text(`#${b.index + 1}`, BC.bar, y);
      doc.text(b.x.toFixed(0), BC.x, y);
      doc.text(b.y.toFixed(0), BC.ycol, y);
      if (b.inTension && b.Ft > 0) {
        setGray(doc, 20);
        doc.setFont('helvetica', 'bold');
        doc.text(formatQuantity(b.Ft, 'force', system, { precision: 1, withUnit: false }), BC.ft, y);
      } else {
        setGray(doc, 140);
        doc.setFont('helvetica', 'italic');
        doc.text('comprimida', BC.ft, y);
      }
      setGray(doc, 230);
      doc.setLineWidth(0.08);
      doc.line(M, y + 1.8, PAGE_W - M, y + 1.8);
      y += 4;
    }
    doc.setFont('helvetica', 'normal');
  }

  // Simplificaciones vigentes
  if (result.pr1Limitations.length > 0) {
    y += 2;
    ensure(8 + result.pr1Limitations.length * 4);
    setGray(doc, 110);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.text('SIMPLIFICACIONES', M, y);
    y += 3.5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    for (const note of result.pr1Limitations) {
      doc.text(pdfStr(`- ${note}`), M, y);
      y += 3.5;
    }
  }

  // ── 6. Verdict banner ─────────────────────────────────────────────────
  y += 4;
  ensure(14);
  doc.setFillColor(235, 235, 235);
  doc.rect(M, y - 4, CW, 10, 'F');
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.3);
  doc.rect(M, y - 4, CW, 10, 'S');

  const st = result.overallStatus;
  const textGray = st === 'fail' ? 20 : st === 'warn' ? 40 : 50;
  setGray(doc, textGray);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  const utMax = result.worstUtil * 100;
  doc.text(
    `VEREDICTO GLOBAL: ${STATUS_LABEL[st]}  (utilizacion max: ${isFinite(utMax) ? utMax.toFixed(1) : '---'}%)`,
    PAGE_W / 2, y + 1.5, { align: 'center' },
  );
  y += 10;

  // ── Footer on every page ──────────────────────────────────────────────
  const footerY = PAGE_H - 10;
  const pageCount = (doc.internal as any).getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    setGray(doc, 150);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text(
      'Concreta - concreta.app  |  EC3 1-8 §6.2.5, EN 1992-4  |  gM0=1.05, gM2=1.25, gC=1.50',
      M, footerY,
    );
    doc.text(`Pag. ${i} / ${pageCount}`, PAGE_W - M, footerY, { align: 'right' });
  }

  const filename = `concreta-placa-anclaje-${inp.sectionType}${inp.sectionSize}-${inp.plate_a}x${inp.plate_b}.pdf`;
  const blob = doc.output('blob');
  const blobUrl = URL.createObjectURL(blob);
  return { blobUrl, filename, pageCount };
}
