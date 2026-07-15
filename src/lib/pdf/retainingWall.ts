// PDF export for Retaining Wall module
// A4 portrait — input summary, SVG section diagram, check table.

import jsPDF from 'jspdf';
import { type RetainingWallInputs } from '../../data/defaults';
import { type RetainingWallResult } from '../calculations/retainingWall';
import type { CheckStatus } from '../calculations/types';

import { embedSvgAsImage, ensureSpace, PAGE_W, PAGE_H, setGray, pdfStr, titledFilename, drawElementTitle, type PdfResult } from './utils';
import { formatQuantity } from '../units/format';
import type { Quantity, UnitSystem } from '../units/types';

const M  = 18;

// NOTE: retainingWall uses abbreviated 'ADVERT.' — differs from shared STATUS_LABEL
const STATUS_LABEL: Record<CheckStatus, string> = {
  ok:      'CUMPLE',
  warn:    'ADVERT.',
  fail:    'INCUMPLE',
  neutral: '—',
};

function hline(doc: jsPDF, y: number, gray = 200, lw = 0.2) {
  doc.setLineWidth(lw);
  setGray(doc, gray);
  doc.line(M, y, PAGE_W - M, y);
}

/** Nombre de archivo por defecto cuando el título va vacío. Fuente única
 *  compartida por el exportador y el TitlePromptModal (preview). */
export function retainingWallFallbackFilename(): string {
  return 'muro-contencion.pdf';
}

export async function exportRetainingWallPDF(
  inp: RetainingWallInputs,
  result: RetainingWallResult,
  system: UnitSystem = 'si',
  title?: string,
): Promise<PdfResult> {
  const elementTitle = title ?? inp.title ?? '';
  const fmtSi = (v: number, q: Quantity, precision = 2) =>
    formatQuantity(v, q, system, { precision });
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // ── Header ──────────────────────────────────────────────────────────────
  const titleBaseY = drawElementTitle(doc, elementTitle, 'Concreta — Muro de Contención RC', M);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  setGray(doc, 120);
  doc.text(`Generado: ${new Date().toLocaleDateString('es-ES')}`, M, titleBaseY + 5);

  hline(doc, titleBaseY + 8, 200, 0.3);

  // ── Input summary (left 2 cols) + SVG (right) ────────────────────────────
  const startY = titleBaseY + 13;
  let y = startY;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  setGray(doc, 60);
  doc.text('GEOMETRIA Y MATERIALES', M, y);
  y += 4;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  setGray(doc, 80);

  // Left zone (text) — narrower so the SVG on the right gets more space.
  const col1 = M;
  const col2 = M + 38;

  const B_m = (inp.bPunta as number) + (inp.tFuste as number) + (inp.bTalon as number);
  const pairs: Array<[string, string]> = [
    [`H = ${(inp.H as number).toFixed(2)} m`,                           `hf = ${(inp.hf as number).toFixed(2)} m`],
    [`tFuste = ${(inp.tFuste as number).toFixed(2)} m`,                 `df = ${(inp.df as number).toFixed(2)} m`],
    [`bPunta = ${(inp.bPunta as number).toFixed(2)} m`,                 `bTalon = ${(inp.bTalon as number).toFixed(2)} m`],
    [`B = ${B_m.toFixed(2)} m`,                                         `recub. = ${(inp.cover as number).toFixed(0)} mm`],
    [pdfStr(`fck = ${inp.fck} N/mm²`),                                  pdfStr(`fyk = ${inp.fyk} N/mm²`)],
    [pdfStr(`g_s = ${fmtSi(inp.gammaSuelo as number, 'weightDensity')}`), pdfStr(`g_sat = ${fmtSi(inp.gammaSat as number, 'weightDensity')}`)],
    [pdfStr(`phi = ${inp.phi}°`),                                       pdfStr(`d = ${inp.delta}°`)],
    [pdfStr(`q = ${fmtSi(inp.q as number, 'areaLoad')}`),               pdfStr(`sigma_adm = ${fmtSi(inp.sigmaAdm as number, 'soilPressure', 3)}`)],
    [`mu = ${inp.mu}`,                                                  `hw = ${(inp.hw as number).toFixed(2)} m`],
    [`Ab = ${inp.Ab} g`,                                                `S = ${inp.S}`],
    [`Ep: ${inp.usePassive ? 'considerado' : 'ignorado'}`,              ''],
  ];

  for (const [a, b] of pairs) {
    doc.text(a, col1, y);
    if (b) doc.text(b, col2, y);
    y += 3.5;
  }
  const textEndY = y;

  // Geometry SVG (right zone) — sized to occupy the full right half for legibility.
  const svgZoneX = M + 80;
  const svgZoneW = PAGE_W - M - svgZoneX;
  let svgEndY = startY;
  const svgEl = document.getElementById('retaining-wall-svg-pdf');
  if (svgEl) {
    const svgNode = svgEl.querySelector('svg');
    if (svgNode) {
      const svgW = svgZoneW;
      const svgH = svgW * (430 / 380);
      try {
        await embedSvgAsImage(doc, svgNode, { x: svgZoneX, y: startY, width: svgW, height: svgH });
        svgEndY = startY + svgH;
      } catch {
        // SVG render failed — continue without diagram
      }
    }
  }

  y = Math.max(textEndY, svgEndY) + 2;
  hline(doc, y, 180, 0.2);
  y += 4;

  // ── Key values ───────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  setGray(doc, 60);
  doc.text('VALORES CALCULADOS', M, y);
  y += 4;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  setGray(doc, 70);

  const kv: [string, string][] = [
    ['Ka (Coulomb)', result.Ka.toFixed(4)],
    ...(result.KAD !== undefined ? [['KAD (M-O)', result.KAD.toFixed(4)] as [string, string]] : []),
    ...(result.Kp !== undefined ? [['Kp (Rankine)', result.Kp.toFixed(4)] as [string, string]] : []),
    ['EAH total', fmtSi(result.EAH_total, 'linearLoad')],
    ...(result.Ep !== undefined ? [['Ep (pasiva)', fmtSi(result.Ep, 'linearLoad')] as [string, string]] : []),
    ['Sum V', fmtSi(result.ΣV, 'linearLoad')],
    ['e', `${result.e.toFixed(3)} m`],
    ['sigma_max', fmtSi(result.sigma_max, 'soilPressure', 3)],
    ['sigma_min', fmtSi(result.sigma_min, 'soilPressure', 3)],
    ['FS vuelco', result.FS_vuelco.toFixed(2)],
    ['FS desliz.', result.FS_desliz.toFixed(2)],
  ];

  for (const [label, val] of kv) {
    doc.text(pdfStr(`${label}:`), M + 2, y);
    doc.text(pdfStr(val), M + 50, y);
    y += 3.2;
  }

  hline(doc, y + 1, 180, 0.2);
  y += 4;

  // ── Check table ──────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  setGray(doc, 60);
  doc.text('COMPROBACIONES', M, y);
  y += 5.5;

  // Columnas: `x` es el origen de cada celda y `CW` su ancho ÚTIL real. Todo
  // texto se parte a ese ancho (celdas multilínea). Antes value/limit se
  // pintaban sin medir: `As,min = 565 mm²/m (30% As,long; mín. Ø12@20)` mide
  // 52 mm en una columna de 32 y se comía Ut% y Estado. Y la descripción se
  // truncaba en silencio (`splitTextToSize(...)[0]`, sin elipsis).
  const COL = { desc: M, value: M + 66, limit: M + 98, utilR: M + 158, status: M + 160 };
  const CW  = { desc: 64, value: 30, limit: 46 };
  const LH  = 3.2;   // interlínea dentro de una celda

  // Cabecera de la tabla. La regla superior va 3.2 mm POR ENCIMA de la línea
  // base: a cuerpo 6 el texto sube ~2.1 mm, así que la anterior (`y - 0.5`)
  // caía DENTRO de las letras y las tachaba.
  const drawCheckHeader = (atY: number): number => {
    hline(doc, atY - 3.2, 180, 0.15);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    setGray(doc, 100);
    doc.text('Verificacion', COL.desc,   atY);
    doc.text('Valor',        COL.value,  atY);
    doc.text('Limite',       COL.limit,  atY);
    doc.text('Ut%',          COL.utilR,  atY, { align: 'right' });
    doc.text('Estado',       COL.status, atY);
    hline(doc, atY + 1.5, 170, 0.15);
    return atY + 5;
  };

  y = drawCheckHeader(y);

  for (const ch of result.checks) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    const descL = doc.splitTextToSize(pdfStr(ch.description), CW.desc)  as string[];
    const valL  = doc.splitTextToSize(pdfStr(ch.value ?? ''), CW.value) as string[];
    const limL  = doc.splitTextToSize(pdfStr(ch.limit ?? ''), CW.limit) as string[];
    const nLines = Math.max(descL.length, valL.length, limL.length, 1);
    // Avance de fila: (n-1) interlíneas + artículo (3.5) + regla (2) + hueco (3).
    const rowH = (nLines - 1) * LH + 8.5;

    // Salto de página predictivo: la fila entera cabe o pasa a la siguiente
    // página con su cabecera repetida (antes se partía a media fila).
    y = ensureSpace(doc, y, rowH, M, drawCheckHeader);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);

    setGray(doc, 50);
    descL.forEach((t, i) => doc.text(t, COL.desc,  y + i * LH));
    valL .forEach((t, i) => doc.text(t, COL.value, y + i * LH));
    limL .forEach((t, i) => doc.text(t, COL.limit, y + i * LH));

    const utilStr = isFinite(ch.utilization)
      ? `${(ch.utilization * 100).toFixed(0)}%`
      : '---';
    doc.text(utilStr, COL.utilR, y, { align: 'right' });

    setGray(doc, ch.status === 'ok' ? 70 : 30);
    doc.setFont('helvetica', 'bold');
    doc.text(STATUS_LABEL[ch.status], COL.status, y);

    const artY = y + (nLines - 1) * LH + 3.5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.5);
    setGray(doc, 160);
    doc.text(pdfStr(ch.article), COL.desc + 2, artY);

    hline(doc, artY + 2, 230, 0.1);
    y = artY + 5;
  }

  // ── Extra diagram pages: Cargas y empujes + Armado ──────────────────────
  // Each diagram lives on its own page so it can render at full width without
  // overlapping the input/results blocks on page 1.
  const diagramPages: Array<{ id: string; title: string; aspect: number }> = [
    { id: 'retaining-wall-svg-pdf-loads', title: 'CARGAS Y EMPUJES', aspect: 460 / 560 },
    { id: 'retaining-wall-svg-pdf-rebar', title: 'ARMADO',           aspect: 460 / 560 },
  ];

  for (const { id, title, aspect } of diagramPages) {
    const node = document.getElementById(id)?.querySelector('svg') as SVGSVGElement | null;
    if (!node) continue;

    doc.addPage();

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    setGray(doc, 30);
    doc.text(pdfStr('Concreta — Muro de Contención RC'), M, M);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    setGray(doc, 60);
    doc.text(title, M, M + 5);
    hline(doc, M + 8, 200, 0.3);

    const dW = PAGE_W - 2 * M;
    const dH = dW * aspect;
    try {
      await embedSvgAsImage(doc, node, { x: M, y: M + 14, width: dW, height: dH });
    } catch {
      // SVG render failed — leave page blank rather than crashing the export
    }
  }

  // ── Footer (every page) ──────────────────────────────────────────────────
  const totalPages = (doc.internal as unknown as { getNumberOfPages(): number }).getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    setGray(doc, 180);
    doc.text(pdfStr('Concreta — Herramienta de cálculo estructural. Verificar resultados antes de su uso en proyecto.'), M, PAGE_H - 10);
  }

  const filename = titledFilename(elementTitle, retainingWallFallbackFilename());
  const blob = doc.output('blob');
  const blobUrl = URL.createObjectURL(blob);
  const pageCount = (doc.internal as unknown as { getNumberOfPages(): number }).getNumberOfPages();
  return { blobUrl, filename, pageCount };
}
