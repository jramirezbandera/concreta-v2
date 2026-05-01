// PDF export for FEM 2D module
//
// Multi-bar layout (per design review Pass 7):
//   Page 1 — Cover
//     · Header (title + date)
//     · Global verdict + breakdown counter
//     · Summary table (one row per bar: id, material, section/profile, η, status)
//     · Geometry overview (simple horizontal schematic of bars + supports + loads)
//
//   Page 2+ — One section per bar
//     · Header: bar id, material, section/profile
//     · Envelope values (M_Ed, V_Ed, vano/apoyo for HA, peak for steel)
//     · Checks table (verification + value + utilization + status)
//     · Page-break to next bar when current section won't fit
//
// Mandatory even when verdict is INCUMPLE or there are model errors —
// engineers may need a PDF to document a non-compliant section.

import jsPDF from 'jspdf';
import { MAT } from '../../features/fem-analysis/presets';
import type { DesignBar, DesignModel, SolveResult } from '../../features/fem-analysis/types';
import { PAGE_H, PAGE_W, setGray, STATUS_LABEL, type PdfResult } from './utils';

const M = 18;                 // page margin (mm)
const CW = PAGE_W - 2 * M;    // content width (mm)
const FOOTER_Y = PAGE_H - 10;

function hline(doc: jsPDF, y: number, gray = 200, lw = 0.2) {
  doc.setLineWidth(lw);
  setGray(doc, gray);
  doc.line(M, y, PAGE_W - M, y);
}

/** Page footer with page number. */
function drawFooter(doc: jsPDF, totalPages: number) {
  const cur = doc.getCurrentPageInfo().pageNumber;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  setGray(doc, 150);
  doc.text('Concreta — concreta.app | FEM 2D | CE 2021 + CTE DB-SE-A', M, FOOTER_Y);
  doc.text(`Pagina ${cur} / ${totalPages}`, PAGE_W - M, FOOTER_Y, { align: 'right' });
}

/** Ensure space for `needed` mm before drawing; add page break if not. */
function ensureSpace(doc: jsPDF, y: number, needed: number): number {
  if (y + needed > PAGE_H - M - 8) {
    doc.addPage();
    return M + 8;
  }
  return y;
}

// ── Cover page ──────────────────────────────────────────────────────────────

function drawCover(doc: jsPDF, model: DesignModel, result: SolveResult): number {
  let y = M;

  // Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  setGray(doc, 30);
  doc.text('Concreta — Análisis FEM 2D', M, y);
  y += 6;

  // Date + preset
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  setGray(doc, 120);
  const presetLabel = model.presetCode === 'continuous' ? 'Viga continua'
    : model.presetCode === 'cantilever' ? 'Mensula'
    : model.presetCode === 'beam' ? 'Viga simple'
    : model.presetCode;
  doc.text(`Generado: ${new Date().toLocaleDateString('es-ES')}    ${presetLabel}    Combinacion: ${model.combo}`, M, y);
  y += 6;
  hline(doc, y, 200, 0.3);
  y += 6;

  // Global verdict block
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  setGray(doc, 50);
  doc.text('VEREDICTO GLOBAL', M, y);
  y += 5;

  const breakdown = countByStatus(model, result);
  const statusLabel =
    result.status === 'ok' ? 'CUMPLE'
    : result.status === 'warn' ? 'REVISION'
    : result.status === 'fail' ? 'INCUMPLE'
    : result.status === 'pending' ? 'PENDIENTE'
    : 'SIN DATOS';
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  setGray(doc, result.status === 'fail' ? 30 : 50);
  doc.text(statusLabel, M, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  setGray(doc, 100);
  doc.text(
    `eta_max = ${(result.maxEta * 100).toFixed(0)}%`,
    M + 50, y,
  );
  y += 5;

  doc.setFontSize(8);
  setGray(doc, 80);
  if (breakdown.total > 0) {
    doc.text(
      `${breakdown.ok} CUMPLE   ${breakdown.warn} REVISION   ${breakdown.fail} INCUMPLE   ${breakdown.pending} PENDIENTE`,
      M, y,
    );
    y += 6;
  }

  // Errors / warnings
  if (result.errors.length > 0) {
    hline(doc, y, 230, 0.15);
    y += 4;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    setGray(doc, 80);
    doc.text('AVISOS DEL MODELO', M, y);
    y += 4;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    for (const e of result.errors) {
      const tag = e.severity === 'fail' ? '[ERROR]' : '[AVISO]';
      setGray(doc, e.severity === 'fail' ? 50 : 80);
      const lines = doc.splitTextToSize(`${tag} ${e.msg}`, CW) as string[];
      for (const ln of lines) {
        y = ensureSpace(doc, y, 4);
        doc.text(ln, M, y);
        y += 3.5;
      }
    }
    y += 2;
  }

  hline(doc, y, 200, 0.3);
  y += 5;

  // Summary table
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  setGray(doc, 50);
  doc.text('RESUMEN POR BARRA', M, y);
  y += 5;

  // Header row
  const COL = {
    id:      M,
    mat:     M + 18,
    sec:     M + 38,
    L:       M + 88,
    Mmax:    M + 108,
    Vmax:    M + 134,
    eta:     M + 158,
    status:  M + 174,
  };
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  setGray(doc, 100);
  doc.text('Barra',     COL.id, y);
  doc.text('Material',  COL.mat, y);
  doc.text('Seccion',   COL.sec, y);
  doc.text('L (m)',     COL.L, y);
  doc.text('|M| (kNm)', COL.Mmax, y);
  doc.text('|V| (kN)',  COL.Vmax, y);
  doc.text('eta',       COL.eta, y);
  doc.text('Estado',    COL.status, y);
  y += 1.5;
  hline(doc, y, 170, 0.15);
  y += 3.5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  for (const bar of model.bars) {
    const r = result.perBar[bar.id];
    y = ensureSpace(doc, y, 5);
    setGray(doc, 50);
    doc.text(bar.id, COL.id, y);
    doc.text(bar.material === 'rc' ? 'HA' : 'Acero', COL.mat, y);
    doc.text(sectionLabel(bar), COL.sec, y);
    doc.text(r ? r.L.toFixed(2) : '-', COL.L, y);
    doc.text(r ? Math.abs(r.Mmax).toFixed(1) : '-', COL.Mmax, y);
    doc.text(r ? Math.abs(r.Vmax).toFixed(1) : '-', COL.Vmax, y);
    doc.text(r && r.status !== 'pending' ? `${(r.eta * 100).toFixed(0)}%` : '-', COL.eta, y);
    setGray(doc, statusGrayFor(r?.status));
    doc.setFont('helvetica', 'bold');
    doc.text(STATUS_LABEL[r?.status ?? 'neutral'] ?? '-', COL.status, y);
    doc.setFont('helvetica', 'normal');
    setGray(doc, 50);
    y += 4;
  }
  y += 4;
  hline(doc, y, 200, 0.3);
  y += 6;

  // Geometry schematic
  y = drawGeometrySchematic(doc, model, y);

  return y;
}

// ── Geometry schematic ─────────────────────────────────────────────────────

function drawGeometrySchematic(doc: jsPDF, model: DesignModel, startY: number): number {
  let y = startY;
  if (model.bars.length === 0 || model.nodes.length === 0) return y;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  setGray(doc, 50);
  doc.text('GEOMETRIA', M, y);
  y += 6;

  const xs = model.nodes.map((n) => n.x);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const dataW = Math.max(1, maxX - minX);
  // Scale to fit content width with some padding for "+vano" margin.
  const drawW = CW - 16;
  const sx = (worldX: number) => M + 8 + ((worldX - minX) / dataW) * drawW;
  const stripY = y + 14;

  // Strip line.
  doc.setLineWidth(0.5);
  setGray(doc, 50);
  doc.line(sx(minX), stripY, sx(maxX), stripY);

  // Nodes + supports.
  for (const n of model.nodes) {
    const x = sx(n.x);
    setGray(doc, 80);
    doc.setFillColor(60, 60, 60);
    doc.circle(x, stripY, 0.7, 'F');
    setGray(doc, 130);
    doc.setFontSize(6);
    doc.text(n.id, x + 1, stripY - 1.5);
  }
  for (const s of model.supports) {
    const node = model.nodes.find((n) => n.id === s.node);
    if (!node) continue;
    const x = sx(node.x);
    setGray(doc, 80);
    doc.setLineWidth(0.4);
    if (s.type === 'fixed') {
      doc.line(x - 2, stripY, x + 2, stripY);
      doc.line(x - 2, stripY, x - 2.5, stripY + 1.5);
      doc.line(x - 1, stripY, x - 1.5, stripY + 1.5);
      doc.line(x, stripY, x - 0.5, stripY + 1.5);
      doc.line(x + 1, stripY, x + 0.5, stripY + 1.5);
      doc.line(x + 2, stripY, x + 1.5, stripY + 1.5);
    } else if (s.type === 'pinned') {
      doc.line(x, stripY, x - 1.5, stripY + 2);
      doc.line(x, stripY, x + 1.5, stripY + 2);
      doc.line(x - 1.5, stripY + 2, x + 1.5, stripY + 2);
      doc.line(x - 2, stripY + 2.5, x + 2, stripY + 2.5);
    } else {
      // roller
      doc.line(x, stripY, x - 1.5, stripY + 1.8);
      doc.line(x, stripY, x + 1.5, stripY + 1.8);
      doc.line(x - 1.5, stripY + 1.8, x + 1.5, stripY + 1.8);
      doc.circle(x - 0.8, stripY + 2.4, 0.4);
      doc.circle(x + 0.8, stripY + 2.4, 0.4);
    }
  }

  // Loads (only UDL + point-bar render in schematic; point-node skipped to keep clean).
  for (const ld of model.loads) {
    if (ld.kind === 'udl') {
      const bar = model.bars.find((b) => b.id === ld.bar);
      if (!bar) continue;
      const ni = model.nodes.find((n) => n.id === bar.i);
      const nj = model.nodes.find((n) => n.id === bar.j);
      if (!ni || !nj) continue;
      const xLow = sx(Math.min(ni.x, nj.x));
      const xHigh = sx(Math.max(ni.x, nj.x));
      setGray(doc, 120);
      doc.setLineWidth(0.3);
      const arrowY = stripY - 5;
      doc.line(xLow, arrowY, xHigh, arrowY);
      const arrows = Math.min(8, Math.max(3, Math.round((xHigh - xLow) / 8)));
      for (let i = 0; i <= arrows; i++) {
        const t = i / arrows;
        const ax = xLow + (xHigh - xLow) * t;
        doc.line(ax, arrowY, ax, stripY - 0.5);
      }
      doc.setFontSize(5.5);
      doc.text(`${ld.w} kN/m [${ld.lc}]`, (xLow + xHigh) / 2, arrowY - 1, { align: 'center' });
    }
  }

  // Dimensions below.
  setGray(doc, 100);
  doc.setLineWidth(0.2);
  for (const bar of model.bars) {
    const ni = model.nodes.find((n) => n.id === bar.i);
    const nj = model.nodes.find((n) => n.id === bar.j);
    if (!ni || !nj) continue;
    const x1 = sx(Math.min(ni.x, nj.x));
    const x2 = sx(Math.max(ni.x, nj.x));
    const dimY = stripY + 8;
    doc.line(x1, dimY, x2, dimY);
    doc.line(x1, dimY - 1, x1, dimY + 1);
    doc.line(x2, dimY - 1, x2, dimY + 1);
    doc.setFontSize(6);
    doc.text(`${Math.abs(nj.x - ni.x).toFixed(2)} m`, (x1 + x2) / 2, dimY + 3, { align: 'center' });
  }

  return y + 28;
}

// ── Per-bar detail page ─────────────────────────────────────────────────────

function drawBarSection(
  doc: jsPDF,
  bar: DesignBar,
  result: SolveResult,
  startY: number,
): number {
  let y = ensureSpace(doc, startY, 60);

  const r = result.perBar[bar.id];

  // Bar header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  setGray(doc, 30);
  doc.text(`Barra ${bar.id}`, M, y);

  doc.setFontSize(8);
  setGray(doc, 80);
  const matLabel = bar.material === 'rc' ? 'HA' : 'Acero';
  doc.text(`${matLabel}  -  ${sectionLabel(bar)}`, M + 35, y);

  if (r) {
    setGray(doc, statusGrayFor(r.status));
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(STATUS_LABEL[r.status] ?? r.status, PAGE_W - M, y, { align: 'right' });
    doc.setFont('helvetica', 'normal');
  }
  y += 4;
  hline(doc, y, 200, 0.25);
  y += 5;

  // Properties grid (HA: section + armado; Steel: profile + LTB params)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  setGray(doc, 70);
  doc.text('PROPIEDADES', M, y);
  y += 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  setGray(doc, 100);

  if (bar.material === 'rc' && bar.rcSection) {
    const sec = bar.rcSection;
    doc.text(`b = ${sec.b} cm    h = ${sec.h} cm    cover = ${sec.cover} mm    fck = ${sec.fck} MPa    fyk = ${sec.fyk} MPa    Exp.: ${sec.exposureClass}    Uso: ${sec.loadType}`, M, y);
    y += 4;
    if (bar.vano_armado) {
      const a = bar.vano_armado;
      doc.text(`Vano (M+):  ${a.tens_nBars}ph${a.tens_barDiam} inf.(t) + ${a.comp_nBars}ph${a.comp_barDiam} sup.(c)    estr. ph${a.stirrupDiam}/c${a.stirrupSpacing} (${a.stirrupLegs}R)`, M, y);
      y += 4;
    } else {
      doc.text('Vano: armado pendiente', M, y);
      y += 4;
    }
    if (bar.apoyo_armado) {
      const a = bar.apoyo_armado;
      doc.text(`Apoyo (M-): ${a.tens_nBars}ph${a.tens_barDiam} sup.(t) + ${a.comp_nBars}ph${a.comp_barDiam} inf.(c)    estr. ph${a.stirrupDiam}/c${a.stirrupSpacing} (${a.stirrupLegs}R)`, M, y);
      y += 4;
    } else {
      doc.text('Apoyo: armado pendiente', M, y);
      y += 4;
    }
  } else if (bar.material === 'steel' && bar.steelSelection) {
    const sel = bar.steelSelection;
    const profile = MAT[sel.profileKey];
    const profileName = profile?.name ?? sel.profileKey;
    doc.text(`Perfil: ${profileName}    ${sel.steel}    Tipo: ${sel.beamType}    L/${sel.deflLimit}    ELS: ${sel.elsCombo}    Categoria: ${sel.useCategory}`, M, y);
    y += 4;
    if (profile && profile.kind === 'steel') {
      doc.text(`A = ${profile.A} cm^2    I = ${profile.I} cm^4    fy = ${sel.steel === 'S275' ? 275 : 355} MPa`, M, y);
      y += 4;
    }
  }

  hline(doc, y, 220, 0.15);
  y += 4;

  // Envelope summary
  if (r) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    setGray(doc, 70);
    doc.text('ENVOLVENTE (ELU)', M, y);
    y += 4;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    setGray(doc, 100);
    doc.text(
      `L = ${r.L.toFixed(2)} m    |M_max| = ${Math.abs(r.Mmax).toFixed(1)} kNm    |V_max| = ${Math.abs(r.Vmax).toFixed(1)} kN    |N_max| = ${Math.abs(r.Nmax).toFixed(1)} kN`,
      M, y,
    );
    y += 5;
    hline(doc, y, 220, 0.15);
    y += 4;
  }

  // Checks table
  if (r && r.checks.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    setGray(doc, 70);
    doc.text('COMPROBACIONES', M, y);
    y += 4;

    const COL = { desc: M, value: M + 96, util: M + 138, status: M + 158 };
    doc.setFontSize(6.5);
    setGray(doc, 100);
    doc.text('Verificacion', COL.desc, y);
    doc.text('Valor', COL.value, y);
    doc.text('Ut%', COL.util, y);
    doc.text('Estado', COL.status, y);
    y += 1.2;
    hline(doc, y, 200, 0.1);
    y += 3;

    doc.setFont('helvetica', 'normal');
    for (const c of r.checks) {
      y = ensureSpace(doc, y, 6);
      setGray(doc, 60);
      doc.setFontSize(6.5);
      const desc = doc.splitTextToSize(c.name, 92)[0] as string;
      doc.text(desc, COL.desc, y);
      const valStr = c.val ?? '';
      doc.text(valStr, COL.value, y);
      const utilStr = isFinite(c.eta) ? `${(c.eta * 100).toFixed(0)}%` : '---';
      doc.text(utilStr, COL.util, y);
      const status: 'ok' | 'warn' | 'fail' =
        c.eta >= 1 ? 'fail' : c.eta >= 0.8 ? 'warn' : 'ok';
      setGray(doc, status === 'ok' ? 70 : 30);
      doc.setFont('helvetica', 'bold');
      doc.text(STATUS_LABEL[status], COL.status, y);
      doc.setFont('helvetica', 'normal');
      y += 3.5;
      // Article ref.
      if (c.ref) {
        setGray(doc, 160);
        doc.setFontSize(5.5);
        doc.text(c.ref, COL.desc + 2, y);
        doc.setFontSize(6.5);
        y += 2.5;
      }
      hline(doc, y, 230, 0.08);
      y += 2.5;
    }
  } else if (r && r.status === 'pending') {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    setGray(doc, 120);
    doc.text('Armado pendiente — introduce armado en la barra para ver comprobaciones.', M, y);
    y += 6;
  }

  return y + 4;
}

// ── Main entry point ────────────────────────────────────────────────────────

export async function exportFemAnalysisPDF(
  model: DesignModel,
  result: SolveResult,
): Promise<PdfResult> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // Cover page.
  drawCover(doc, model, result);

  // One section per bar — start each on a new page when the bar's spec
  // would overflow current page; otherwise continue on current.
  for (const bar of model.bars) {
    doc.addPage();
    drawBarSection(doc, bar, result, M + 6);
  }

  // Footers (after all pages exist so totalPages is correct).
  const totalPages = (doc.internal as unknown as { getNumberOfPages: () => number }).getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    drawFooter(doc, totalPages);
  }

  const filename = `concreta-fem-${new Date().toISOString().slice(0, 10)}.pdf`;
  const blob = doc.output('blob');
  const blobUrl = URL.createObjectURL(blob);
  return { blobUrl, filename, pageCount: totalPages };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function sectionLabel(bar: DesignBar): string {
  if (bar.material === 'rc' && bar.rcSection) {
    return `${bar.rcSection.b}x${bar.rcSection.h} HA-${bar.rcSection.fck}`;
  }
  if (bar.material === 'steel' && bar.steelSelection) {
    const profile = MAT[bar.steelSelection.profileKey];
    return profile?.name ?? bar.steelSelection.profileKey;
  }
  return '-';
}

function statusGrayFor(status?: string): number {
  if (status === 'ok') return 70;
  if (status === 'warn') return 30;
  if (status === 'fail') return 30;
  return 120;
}

function countByStatus(model: DesignModel, result: SolveResult) {
  let ok = 0, warn = 0, fail = 0, pending = 0;
  for (const b of model.bars) {
    const r = result.perBar[b.id];
    if (!r || r.status === 'pending' || r.status === 'none') pending++;
    else if (r.status === 'ok') ok++;
    else if (r.status === 'warn') warn++;
    else if (r.status === 'fail') fail++;
  }
  return { ok, warn, fail, pending, total: model.bars.length };
}
