// PDF export for Masonry Walls module — DB-SE-F multi-floor verification.
// jsPDF + svg2pdf.js — A4 portrait, margins 18mm. Single page when posible;
// auto-extiende a 2 si el resumen por planta lo requiere (hasta 8 plantas).

import jsPDF from 'jspdf';
import { svg2pdf } from 'svg2pdf.js';
import {
  type MasonryWallState,
  type PlantaResult,
  type CriticoResult,
  type OverallStatus,
  type EdificioInvalid,
  resolverFabrica,
} from '../calculations/masonryWalls';
import { PAGE_W, PAGE_H, setGray, pdfStr, type PdfResult } from './utils';

const M = 18;

// Helpers de unidades — el motor guarda mm pero el PDF muestra m/cm para
// coincidir con la UI (commits 53e1a0c y posteriores).
const mToM = (mm: number, dp = 2) => `${(mm / 1000).toFixed(dp)} m`;
const mToCm = (mm: number, dp = 1) => `${(mm / 10).toFixed(dp)} cm`;

interface ExportArgs {
  state: MasonryWallState;
  plantasCalc: PlantaResult[];
  critico: CriticoResult | null;
  overall: OverallStatus;
  invalid: EdificioInvalid | null;
}

export async function exportMasonryWallsPDF({
  state, plantasCalc, critico, overall, invalid,
}: ExportArgs): Promise<PdfResult> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // ── Header ───────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  setGray(doc, 30);
  doc.text('Concreta - Muros de fabrica - DB-SE-F', M, M);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  setGray(doc, 120);
  doc.text(`Generado: ${new Date().toLocaleDateString('es-ES')}`, M, M + 5);

  doc.setLineWidth(0.3);
  setGray(doc, 200);
  doc.line(M, M + 8, PAGE_W - M, M + 8);

  // ── Banner si el modelo es inválido ──────────────────────────────────────
  if (invalid) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    setGray(doc, 80);
    doc.text('Datos no validos — no se ha podido verificar el muro', M, M + 18);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    setGray(doc, 100);
    doc.text(pdfStr(invalid.reason), M, M + 25);
    return finalize(doc, 'muros-fabrica');
  }

  // ── SVG ──────────────────────────────────────────────────────────────────
  const svgEl = document.getElementById('masonry-walls-svg-pdf')?.querySelector('svg') as SVGSVGElement | null;
  const SVG_X = M;
  const SVG_Y = M + 12;
  const SVG_W = 95;
  const SVG_H = 130;
  if (svgEl) {
    await svg2pdf(svgEl, doc, { x: SVG_X, y: SVG_Y, width: SVG_W, height: SVG_H });
  }

  // ── Right column: parámetros + veredicto ─────────────────────────────────
  const COL_R = M + SVG_W + 6;
  const COL_R2 = COL_R + 44;
  const LH = 4.5;
  let ry = M + 14;

  const secHeader = (label: string) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    setGray(doc, 60);
    doc.text(label, COL_R, ry);
    ry += LH;
    doc.setFont('helvetica', 'normal');
    setGray(doc, 80);
  };

  const twoCol = (a: string, b = '') => {
    doc.setFontSize(8);
    doc.text(pdfStr(a), COL_R, ry);
    if (b) doc.text(pdfStr(b), COL_R2, ry);
    ry += LH;
  };

  const gap = () => { ry += 2; };

  // GEOMETRIA — unidades en m/cm para coincidir con la UI
  secHeader('GEOMETRIA');
  twoCol(`L = ${mToM(state.L)}`, `t = ${mToCm(state.t)}`);
  twoCol(`Plantas: ${state.plantas.length}`);
  gap();

  // FABRICA
  secHeader('FABRICA');
  const fab = resolverFabrica(state);
  twoCol(`Modo: ${fab.label}`);
  if (fab.modo === 'tabla') {
    twoCol(`fb = ${state.fb} N/mm2`, `fm = ${state.fm} N/mm2`);
  }
  if (fab.fk) {
    twoCol(`fk = ${fab.fk} N/mm2`, `gM = ${state.gamma_M}`);
    twoCol(`fd = ${(fab.fk / state.gamma_M).toFixed(2)} N/mm2`);
  }
  twoCol(`gam = ${fab.gamma} kN/m3`);
  gap();

  // ACCIONES
  secHeader('ACCIONES (DB-SE 4.2.4)');
  twoCol(`gG = ${state.gamma_G}`, `gQ = ${state.gamma_Q}`);
  twoCol('q_d = gG.G + gQ.Q');
  gap();

  // VEREDICTO
  secHeader('VEREDICTO');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  setGray(doc, overall.v === 'fail' ? 30 : overall.v === 'warn' ? 60 : 50);
  doc.text(`${overall.label}  ${(overall.eta * 100).toFixed(0)}%`, COL_R, ry);
  ry += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  setGray(doc, 100);
  if (critico) {
    twoCol(`Critico: ${critico.planta.nombre} / ${critico.id}`);
    twoCol(`N_Ed cab = ${critico.N_Ed.toFixed(0)} kN`, `N_Ed pie = ${critico.N_Ed_pie.toFixed(0)} kN`);
    twoCol(`N_Rd = ${critico.N_Rd.toFixed(0)} kN`, `Phi = ${critico.Phi.toFixed(3)}`);
    twoCol(`lam = ${critico.planta.lambda.toFixed(1)}`, `e_t = ${mToCm(critico.planta.e_total)}`);
  }
  gap();

  // RESUMEN POR PLANTA
  secHeader('RESUMEN POR PLANTA');
  doc.setFontSize(7.5);
  setGray(doc, 100);
  // Header row
  const hY = ry;
  doc.text('Planta', COL_R, hY);
  doc.text('q_d kN/m', COL_R + 22, hY);
  doc.text('lam', COL_R + 44, hY);
  doc.text('eta max', COL_R + 60, hY);
  ry += 4;
  setGray(doc, 200);
  doc.line(COL_R, ry - 1, COL_R + 80, ry - 1);
  setGray(doc, 80);
  // Rows (de cubierta hacia abajo)
  for (const pl of plantasCalc.slice().reverse()) {
    const eMax = Math.max(...pl.machones.map((m) => m.etaMax));
    const status = eMax >= 1 ? 'INCUMPLE' : eMax >= 0.8 ? 'REVISAR' : 'CUMPLE';
    doc.text(pdfStr(pl.nombre), COL_R, ry);
    doc.text(pl.q_planta.toFixed(1), COL_R + 22, ry);
    doc.text(pl.lambda.toFixed(1), COL_R + 44, ry);
    doc.text(`${(eMax * 100).toFixed(0)}% ${status}`, COL_R + 60, ry);
    ry += 4;
  }

  // ── Bottom: comprobaciones DB-SE-F del crítico ───────────────────────────
  if (critico) {
    let by = M + SVG_H + 18;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    setGray(doc, 60);
    doc.text('COMPROBACIONES DB-SE-F (machon critico)', M, by);
    by += 5;

    doc.setLineWidth(0.2);
    setGray(doc, 200);
    doc.line(M, by - 2, PAGE_W - M, by - 2);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    setGray(doc, 80);

    const checkRow = (desc: string, art: string, val: string, eta: number) => {
      const pct = (eta * 100).toFixed(0);
      const status = eta < 0.8 ? 'CUMPLE' : eta < 1 ? 'REVISAR' : 'INCUMPLE';
      doc.text(pdfStr(desc), M, by);
      doc.text(pdfStr(art), M + 60, by);
      doc.text(pdfStr(val), M + 100, by);
      doc.text(`${pct}% ${status}`, M + 140, by);
      by += 5;
    };

    checkRow(
      'Compresion excentrica',
      'DB-SE-F §5.2',
      `${critico.N_Ed.toFixed(0)} / ${critico.N_Rd.toFixed(0)} kN`,
      critico.eta,
    );
    checkRow(
      'Pandeo (esbeltez lam)',
      'DB-SE-F §5.2.4',
      `lam = ${critico.planta.lambda.toFixed(1)} / 27`,
      critico.planta.lambda / 27,
    );
    if (critico.etaConc > 0) {
      checkRow(
        'Concentracion bajo apoyo',
        'DB-SE-F §5.4',
        `s_loc / b.fd`,
        critico.etaConc,
      );
    }
  }

  return finalize(doc, 'muros-fabrica');
}

function finalize(doc: jsPDF, slug: string): PdfResult {
  const pageCount = doc.getNumberOfPages();
  // Footer en cada página
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    setGray(doc, 140);
    doc.text(`Concreta`, M, PAGE_H - 8);
    doc.text(`pag. ${i}/${pageCount}`, PAGE_W - M, PAGE_H - 8, { align: 'right' });
  }

  const blob = doc.output('blob');
  const blobUrl = URL.createObjectURL(blob);
  const filename = `${slug}-${new Date().toISOString().slice(0, 10)}.pdf`;
  return { blobUrl, filename, pageCount };
}
