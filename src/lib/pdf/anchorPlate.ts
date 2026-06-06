// PDF export for Anchor Plate module (PR-3 — rebar model)
// A4 portrait, 20mm margins. Layout:
//   1. Header
//   2. Inputs — two columns
//   3. SVG (planta + alzado, from #anchor-plate-svg-pdf)
//   4. Checks table
//   5. Solver summary
//   6. Verdict banner + footer

import jsPDF from 'jspdf';
import type { AnchorPlateInputs, PedestalSurface } from '../../data/defaults';
import { BOTTOM_ANCHORAGE_LABEL, TOP_CONNECTION_LABEL } from '../../data/anchorBars';
import type { AnchorPlateResult } from '../calculations/anchorPlate';
import { embedSvgAsImage, PAGE_W, PAGE_H, setGray, pdfStr, STATUS_LABEL, type PdfResult } from './utils';
import { formatQuantity } from '../units/format';
import type { Quantity, UnitSystem } from '../units/types';

const M = 20;
const CW = PAGE_W - 2 * M;

// L2 (Phase 5): los labels de anclaje inferior y unión a placa vivían
// duplicados aquí ("Patilla 90 deg") y en anchorBars.ts ("Patilla 90°"),
// con drift entre UI y PDF. Ahora son single-source desde anchorBars; el
// boundary unicode→ASCII se aplica vía pdfStr() en cada uso.

const SURF_LABEL: Record<PedestalSurface, string> = {
  smooth:    'Lisa (mu = 0.20)',
  roughened: 'Rugosa (mu = 0.40)',
};

// M11 (Phase 3) — etiquetas humanas del modo del solver. ASCII para PDF.
const SOLVER_MODE_LABEL_PDF: Record<string, string> = {
  'uniform-compression':    'Compresion uniforme',
  'partial-lift':           'Traccion parcial (plastico)',
  'partial-lift-saturated': 'Traccion parcial - seccion agotada',
  'biaxial-plastic':        'Biaxial plastico',
  'biaxial-grid':           'Biaxial aproximado (grid-search)',
  'pure-tension':           'Traccion pura (sin compresion)',
};
const labelSolverMode = (mode: string): string =>
  SOLVER_MODE_LABEL_PDF[mode] ?? mode;

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
  doc.text('Concreta - Placa de anclaje con barras corrugadas (CE Anejo 18 / Anejo 11)', M, M);

  setGray(doc, 130);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`Generado: ${new Date().toLocaleDateString('es-ES')}`, M, M + 5);
  // H17 (Phase 3) — distinción explícita verificación vs dimensionado.
  // El módulo verifica una solución introducida por el usuario; no la
  // dimensiona. Sin esta nota el lector puede leer los resultados como
  // un diseño optimizado.
  doc.text(
    'Verificacion de la solucion introducida por el usuario - no dimensiona.',
    PAGE_W - M, M + 5, { align: 'right' },
  );

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
  rRow('Anclaje inferior', pdfStr(BOTTOM_ANCHORAGE_LABEL[inp.bottom_anchorage]));
  rRow('Union a placa',    pdfStr(TOP_CONNECTION_LABEL[inp.top_connection]));
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

  // Page-break helper (hoisted above SVG so we can ensure() the diagram fits).
  const footerMargin = 16;
  const ensure = (need: number) => {
    if (y + need > PAGE_H - footerMargin) {
      doc.addPage();
      y = M;
    }
  };

  setGray(doc, 200);
  doc.setLineWidth(0.2);
  doc.line(M, y, PAGE_W - M, y);
  y += 4;

  // ── 3. SVG diagram ─────────────────────────────────────────────────────
  // H16 (Phase 2): el diagrama ocupa ~186 mm con la escala actual; en hojas
  // densas chocaba con el footer. Reservamos el bloque entero (SVG + caption
  // + divisor) y forzamos nueva página si no cabe.
  const svgContainer = document.getElementById('anchor-plate-svg-pdf');
  const svgEl = svgContainer?.querySelector('svg') as SVGSVGElement | null;

  if (svgEl) {
    const SVG_NATIVE_W = 420;
    const SVG_NATIVE_H = 460;
    const scale = CW / SVG_NATIVE_W;
    const rendH = SVG_NATIVE_H * scale;
    const CAPTION_H = 4;
    const DIVIDER_H = 4;
    ensure(rendH + 2 + CAPTION_H + DIVIDER_H);
    try {
      await embedSvgAsImage(doc, svgEl, { x: M, y, width: CW, height: rendH });
      y += rendH + 2;
    } catch {
      // L6 (Phase 4): si el render del SVG falla, en lugar de un hueco
      // silencioso (donde aparecía la leyenda flotando sobre nada), pinta
      // un placeholder visible para que el lector sepa que falta el diagrama.
      setGray(doc, 235);
      doc.rect(M, y, CW, 40, 'F');
      setGray(doc, 120);
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(9);
      doc.text('Diagrama no disponible en esta versión del PDF', PAGE_W / 2, y + 22, { align: 'center' });
      y += 42;
    }

    setGray(doc, 140);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.text(
      `Planta + alzado  |  Modo solver: ${pdfStr(labelSolverMode(result.solver.mode))}`,
      PAGE_W / 2, y, { align: 'center' },
    );
    y += CAPTION_H;
  }

  setGray(doc, 200);
  doc.setLineWidth(0.2);
  doc.line(M, y, PAGE_W - M, y);
  y += 4;

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
    ['Modo solver', pdfStr(labelSolverMode(solver.mode))],
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
  // H11 — name the governing check so reviewers see which limit drives util.
  const governing = result.checks
    .filter((c) => c.status !== 'neutral' && isFinite(c.utilization))
    .reduce<typeof result.checks[number] | null>(
      (best, c) => (best === null || c.utilization > best.utilization ? c : best),
      null,
    );
  const govSuffix = governing ? `  (rige: ${pdfStr(governing.id)})` : '';
  doc.text(
    `VEREDICTO GLOBAL: ${STATUS_LABEL[st]}  (utilizacion max: ${isFinite(utMax) ? utMax.toFixed(1) : '---'}%)${govSuffix}`,
    PAGE_W / 2, y + 1.5, { align: 'center' },
  );
  y += 10;

  // ── Footer on every page ──────────────────────────────────────────────
  // PR9 — disclaimer "metodo en revision" eliminado: los calculos del modulo
  // estan corregidos (CR1/CR2/CR3/CR6) y las citaciones normativas remapeadas
  // a Codigo Estructural (RD 470/2021). El PDF puede firmarse como memoria
  // de calculo defendible bajo normativa espanola vigente.
  //
  // H18 (Phase 3) — disclaimer de combinacion unica. El modulo solo verifica
  // una combinacion ELU por sesion; la envolvente queda como responsabilidad
  // del proyectista hasta que se introduzca M15.
  const footerY = PAGE_H - 10;
  const pageCount = (doc.internal as any).getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    setGray(doc, 150);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text(
      'Concreta - concreta.app  |  CE Anejo 18 (placa base) + Anejo 11 (anclajes) + Anejo 19 (hormigon)  |  gM0=1.05, gMc=1.50',
      M, footerY,
    );
    setGray(doc, 150);
    doc.setFontSize(6);
    doc.text(
      'Resultado para 1 combinacion ELU - el proyectista debe verificar la envolvente completa.',
      M, footerY - 3,
    );
    setGray(doc, 150);
    doc.setFontSize(7);
    doc.text(`Pag. ${i} / ${pageCount}`, PAGE_W - M, footerY, { align: 'right' });
  }

  const filename = `concreta-placa-anclaje-${inp.sectionType}${inp.sectionSize}-${inp.plate_a}x${inp.plate_b}.pdf`;
  const blob = doc.output('blob');
  const blobUrl = URL.createObjectURL(blob);
  return { blobUrl, filename, pageCount };
}
