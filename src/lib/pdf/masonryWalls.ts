// PDF export for Masonry Walls module — DB-SE-F multi-floor verification.
//
// Structure (hierarchy verdict→governing→appendix, /autoplan-approved):
//   Page 1  — Cover & Verdict: header+metadata, SVG planta crítica, veredicto,
//             matriz η por planta×machón, TOC, banner LIMITACIONES.
//   Page 2  — Datos de partida: geometría, fábrica, acciones, plantas declaradas.
//   Page 2b — (CONDICIONAL) Resistencia característica fk · Anejo C eq. C.1.
//             Solo cuando state.fabricaModo === 'custom' &&
//             state.customMethod === 'anejoC'. Trazabilidad legal first-class:
//             K + fb + fm + cap aplicado + fórmula con sustitución de números.
//   Page 3  — Casos gobernantes: 1 machón por planta con derivación LITERAL
//             (substitución de números — estilo CYPE — para que el reviewer
//             pueda re-derivar con calculadora a mano).
//   Pages 4..N — Apéndice por planta (LANDSCAPE): header de planta, dinteles,
//             cargas puntuales, sub-tabla A (cabeza/pie/geometría) y sub-tabla
//             B (capacidad/verificación) por machón. Sin truncación.
//   Última  — Anexo metodológico: fórmulas, cascada, banner LIMITACIONES (full).
//
// Invariantes legales (eng review CRITICAL):
//   I1. Engine version + nº página + proyecto en footer de TODAS las páginas.
//   I2. Sin truncación silenciosa. Cada planta y cada machón aparecen siempre.
//   I3. Estado `invalid` → 1 página con banner, metadata y footer intactos.

import type jsPDF from 'jspdf';
import { crearPdf } from './fuente';
import { WARN_UTIL } from '../calculations/types';
import {
  MASONRY_ENGINE_VERSION,
  MASONRY_LAMBDA_MAX,
  type MasonryWallState,
  type PlantaResult,
  type CriticoResult,
  type OverallStatus,
  type EdificioInvalid,
  type MachonResult,
  type DintelResult,
  type Puntual,
  resolverFabrica,
  calcFkAnejoC,
  TIPO_MURO_LABELS,
  findGammaMCell,
  CATEGORIA_LABELS,
  EJECUCION_LABELS,
} from '../calculations/masonryWalls';
import { formatQuantity } from '../units/format';
import type { UnitSystem } from '../units/types';
import {
  PAGE_W,
  PAGE_H,
  setGray,
  pdfStr,
  pdfStrLatin1,
  ensureSpace,
  drawHeader,
  drawFootersAllPages,
  drawTable,
  embedSvgAsImage,
  inputsFingerprint,
  titledFilename,
  truncateToWidth,
  FOOTER_RESERVE,
  type TableCol,
  type PdfResult,
} from './utils';

const M = 18;

// Unidades — el motor guarda mm; el PDF muestra m/cm como la UI.
const mToM = (mm: number, dp = 2) => `${(mm / 1000).toFixed(dp)} m`;
const mToCm = (mm: number, dp = 1) => `${(mm / 10).toFixed(dp)} cm`;
const num = (v: number, dp = 1) => v.toFixed(dp);
const pct = (v: number) => `${(v * 100).toFixed(0)}%`;
const statusLabel = (eta: number): 'CUMPLE' | 'REVISAR' | 'INCUMPLE' =>
  eta >= 1 ? 'INCUMPLE' : eta >= WARN_UTIL ? 'REVISAR' : 'CUMPLE';
const statusGray = (eta: number): number =>
  eta >= 1 ? 30 : 60;
const statusRGB = (eta: number): [number, number, number] =>
  eta >= 1 ? [239, 68, 68] : eta >= WARN_UTIL ? [245, 158, 11] : [34, 197, 94];

/** Nombre de archivo por defecto cuando el título va vacío. Fuente única
 *  compartida por el exportador y el TitlePromptModal (preview). */
export function masonryWallsFallbackFilename(): string {
  return `muros-fabrica-${new Date().toISOString().slice(0, 10)}.pdf`;
}

interface ExportArgs {
  state: MasonryWallState;
  plantasCalc: PlantaResult[];
  critico: CriticoResult | null;
  overall: OverallStatus;
  invalid: EdificioInvalid | null;
  /** Sistema de unidades activo (SI o técnico). El PDF refleja el sistema del
   *  usuario para mantener consistencia con la UI on-screen (trazabilidad
   *  legal + evita confusión del ingeniero firmante). */
  system: UnitSystem;
  /** Nombre del elemento (H1 de la cabecera + nombre de archivo). Metadato de
   *  documento: NO entra en inputsFingerprint(state) — llega aparte. */
  title?: string;
}

export async function exportMasonryWallsPDF({
  state, plantasCalc, critico, overall, invalid, system, title,
}: ExportArgs): Promise<PdfResult> {
  const doc = await crearPdf();
  const hash = inputsFingerprint(state);
  const elementTitle = title ?? '';
  const headerMeta = {
    title: 'Concreta - Muros de fabrica - DB-SE-F',
    elementTitle,
    engineVersion: MASONRY_ENGINE_VERSION,
    inputsHash: hash,
    proyecto: state.proyecto,
    expediente: state.expediente,
    autor: state.autor,
    fechaProyecto: state.fechaProyecto,
  };

  // ── Caso invalid: 1 página con banner, metadata y footer (I3) ───────────
  if (invalid) {
    drawHeader(doc, headerMeta, M);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    setGray(doc, 80);
    doc.text('Datos no validos — no se ha podido verificar el muro', M, M + 40);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    setGray(doc, 100);
    doc.text(pdfStr(invalid.reason), M, M + 48, { maxWidth: PAGE_W - 2 * M });
    if (invalid.fix) {
      doc.setFontSize(8);
      setGray(doc, 120);
      doc.text(`Como arreglarlo: ${pdfStr(invalid.fix)}`, M, M + 60, { maxWidth: PAGE_W - 2 * M });
    }
    drawFootersAllPages(doc, {
      engineVersion: MASONRY_ENGINE_VERSION,
      proyecto: state.proyecto,
    }, M);
    return finalize(doc, elementTitle);
  }

  // ── Pre-cálculos derivados (compartidos entre páginas) ──────────────────
  const fab = resolverFabrica(state);
  const gammaCell = findGammaMCell(state.gamma_M);

  // Gobernante por planta = machón con η_max mayor. Cubierta sin huecos:
  // 1 machón = todo el muro = gobernante por defecto.
  const gobernantes: Array<{ planta: PlantaResult; machon: MachonResult }> = plantasCalc.map((pl) => {
    const peor = pl.machones.reduce((a, b) => (b.etaMax > a.etaMax ? b : a));
    return { planta: pl, machon: peor };
  });

  // Map sección → nº de página. Se rellena conforme dibujamos; el TOC en
  // página 1 se renderiza al final con setPage(1).
  const toc: Array<{ label: string; page: number }> = [];

  // ── Página 1: Cover & Veredicto ──────────────────────────────────────────
  const { contentY } = drawHeader(doc, headerMeta, M);
  toc.push({ label: 'Portada y veredicto', page: 1 });

  // SVG (col izquierda)
  const svgEl = document.getElementById('masonry-walls-svg-pdf')?.querySelector('svg') as SVGSVGElement | null;
  const SVG_W = 95;
  const SVG_H = 110;
  const SVG_X = M;
  const SVG_Y = contentY;
  if (svgEl) {
    // Se incrusta sobre la página activa (la 1) antes de cualquier addPage().
    // Rasterizado a PNG en vez de svg2pdf: los degradados/opacidad del SVG
    // generaban un stream que Acrobat rechazaba ("error en esta página").
    // Ver embedSvgAsImage en utils.ts. Canary: muros primero; el resto de
    // módulos siguen con svg2pdf hasta confirmar en Acrobat.
    await embedSvgAsImage(doc, svgEl, { x: SVG_X, y: SVG_Y, width: SVG_W, height: SVG_H });
  }

  // Veredicto (col derecha)
  const COL_R = M + SVG_W + 6;
  let ry = SVG_Y;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  setGray(doc, 60);
  doc.text('VEREDICTO EDIFICIO', COL_R, ry);
  ry += 5;

  doc.setFontSize(22);
  setGray(doc, statusGray(overall.eta));
  doc.text(`${pct(overall.eta)}`, COL_R, ry + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  setGray(doc, 60);
  doc.text(overall.label, COL_R + 32, ry + 6);
  ry += 12;

  if (critico) {
    doc.setFontSize(7.5);
    setGray(doc, 100);
    doc.text(`Critico: ${pdfStr(critico.planta.nombre)} / ${critico.id}`, COL_R, ry);
    ry += 4;
    doc.text(`N_Ed = ${pdfStr(formatQuantity(critico.N_Ed, 'force', system))}`, COL_R, ry);
    ry += 3.5;
    doc.text(`N_Rd = ${pdfStr(formatQuantity(critico.N_Rd, 'force', system))}`, COL_R, ry);
    ry += 3.5;
    doc.text(`lam = ${critico.planta.lambda.toFixed(1)}`, COL_R, ry);
    ry += 3.5;
    doc.text(`Phi = ${critico.Phi.toFixed(3)}`, COL_R, ry);
    ry += 5;
  }

  // Resumen por planta (col derecha, debajo del veredicto)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  setGray(doc, 60);
  doc.text('RESUMEN POR PLANTA', COL_R, ry);
  ry += 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  setGray(doc, 100);
  doc.text('Planta',  COL_R,      ry);
  doc.text('huecos',  COL_R + 32, ry);
  doc.text('M',       COL_R + 45, ry);
  doc.text('eta max', COL_R + 54, ry);
  ry += 1.5;
  setGray(doc, 200);
  // Hasta PAGE_W − M, no COL_R+80: eso son 199 mm, 7 mm dentro del margen.
  doc.line(COL_R, ry, PAGE_W - M, ry);
  ry += 3.5;
  // De cubierta hacia abajo (orden visual estándar en memoria estructural)
  for (const pl of plantasCalc.slice().reverse()) {
    const eMax = Math.max(...pl.machones.map((m) => m.etaMax));
    setGray(doc, 80);
    doc.text(pdfStr(pl.nombre), COL_R, ry);
    doc.text(`${pl.huecos.length}`, COL_R + 32, ry);
    doc.text(`${pl.machones.length}`, COL_R + 45, ry);
    const [r, g, b] = statusRGB(eMax);
    doc.setTextColor(r, g, b);
    // Alineado a la derecha contra el margen: "104% INCUMPLE" left-aligned
    // desde +54 acababa en 192.7 mm, fuera de página (layout probe C). Solo
    // se veía con el edificio en fallo. OJO: no anclar a COL_R+80 — el borde
    // de la tabla ya vive a 199 mm, también fuera del margen.
    doc.text(`${pct(eMax)} ${statusLabel(eMax)}`, PAGE_W - M, ry, { align: 'right' });
    ry += 3.8;
  }
  setGray(doc, 100);

  // Matriz η por planta × machón (full-width, debajo de SVG/veredicto)
  let mtxY = Math.max(SVG_Y + SVG_H + 8, ry + 6);
  mtxY = drawEtaMatrix(doc, plantasCalc, mtxY);

  // TOC reservation — espacio reservado, se rellena al final con setPage(1)
  const TOC_RESERVE_Y = mtxY + 4;
  const TOC_RESERVE_H = 24;

  // Banner LIMITACIONES (final de página 1)
  drawLimitationsBanner(doc, TOC_RESERVE_Y + TOC_RESERVE_H + 2, 'compact');

  // ── Página 2: Datos de partida ───────────────────────────────────────────
  doc.addPage('a4', 'portrait');
  toc.push({ label: 'Datos de partida', page: doc.getNumberOfPages() });
  const { contentY: pg2y } = drawHeader(doc, headerMeta, M);
  drawDataPartida(doc, state, plantasCalc, fab, gammaCell, system, pg2y);

  // ── Página opcional: trazabilidad fk · Anejo C eq. C.1 ──────────────────
  // Solo se inserta cuando estamos en Personalizada · Anejo C. Trazabilidad
  // legal first-class: K + fb + fm introducido + fm aplicado (si capped) +
  // fórmula explícita con sustitución de números. Permite al ingeniero
  // firmar el documento citando exactamente la subcláusula normativa.
  if (state.fabricaModo === 'custom' && state.customMethod === 'anejoC') {
    doc.addPage('a4', 'portrait');
    toc.push({
      label: 'Resistencia caracteristica fk · Anejo C',
      page: doc.getNumberOfPages(),
    });
    const { contentY: pgFkY } = drawHeader(doc, headerMeta, M);
    drawAnejoCBlock(doc, state, pgFkY);
  }

  // ── Página 3+: Casos gobernantes ─────────────────────────────────────────
  doc.addPage('a4', 'portrait');
  toc.push({ label: 'Casos gobernantes (1 machon por planta)', page: doc.getNumberOfPages() });
  const { contentY: pg3y } = drawHeader(doc, headerMeta, M);
  drawGovernantes(doc, gobernantes, state, fab, system, pg3y);

  // ── Apéndice por planta (portrait, mismo formato que el resto) ───────────
  for (const pl of plantasCalc.slice().reverse()) {
    doc.addPage('a4', 'portrait');
    toc.push({
      label: `Apendice planta: ${pl.nombre}`,
      page: doc.getNumberOfPages(),
    });
    const { contentY: apY } = drawHeader(doc, headerMeta, M);
    drawAppendixPlanta(doc, pl, state, system, apY);
  }

  // ── Última página: Anexo metodológico ────────────────────────────────────
  doc.addPage('a4', 'portrait');
  toc.push({ label: 'Anexo metodologico', page: doc.getNumberOfPages() });
  const { contentY: anexoY } = drawHeader(doc, headerMeta, M);
  drawMetodologia(doc, anexoY);

  // ── 2-pass: pinta el TOC en página 1 (espacio reservado) ────────────────
  doc.setPage(1);
  drawTOC(doc, toc, TOC_RESERVE_Y);

  // ── Footers en TODAS las páginas (invariante I1) ─────────────────────────
  drawFootersAllPages(doc, {
    engineVersion: MASONRY_ENGINE_VERSION,
    proyecto: state.proyecto,
  }, M);

  return finalize(doc, elementTitle);
}

// ─────────────────────────────────────────────────────────────────────────────
// Cover helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Matriz η por planta × machón. Trunca columnas con marcador "…+N" si la
 *  planta tiene más machones de los que caben en el ancho disponible (el
 *  detalle completo aparece igual en el apéndice). */
function drawEtaMatrix(doc: jsPDF, plantasCalc: PlantaResult[], y: number): number {
  // Determinar nº máximo de machones por planta
  const maxMachones = Math.max(...plantasCalc.map((p) => p.machones.length));
  const labelW = 28;
  const availW = PAGE_W - 2 * M - labelW;
  const cellW = Math.min(14, Math.max(8, availW / Math.max(1, maxMachones)));
  const fitCols = Math.min(maxMachones, Math.floor(availW / cellW));

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  setGray(doc, 60);
  doc.text('MATRIZ DE UTILIZACION — eta_max por planta y machon', M, y);
  y += 4;

  // Header de columnas: M1..Mk + truncation marker if needed
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  setGray(doc, 100);
  doc.text('Planta', M, y);
  for (let i = 0; i < fitCols; i++) {
    doc.text(`M${i + 1}`, M + labelW + i * cellW + cellW / 2, y, { align: 'center' });
  }
  if (maxMachones > fitCols) {
    doc.text(`+${maxMachones - fitCols}`, M + labelW + fitCols * cellW + 2, y);
  }
  y += 1.5;
  setGray(doc, 180);
  doc.setLineWidth(0.2);
  doc.line(M, y, M + labelW + fitCols * cellW + (maxMachones > fitCols ? 8 : 0), y);
  y += 3.5;

  // Filas (de cubierta hacia abajo)
  for (const pl of plantasCalc.slice().reverse()) {
    setGray(doc, 80);
    doc.setFontSize(7);
    doc.text(pdfStr(pl.nombre), M, y);
    for (let i = 0; i < Math.min(pl.machones.length, fitCols); i++) {
      const m = pl.machones[i];
      const [r, g, b] = statusRGB(m.etaMax);
      // Background pill
      doc.setFillColor(r, g, b);
      doc.rect(M + labelW + i * cellW + 1, y - 2.8, cellW - 2, 3.6, 'F');
      // Text on pill (white for contrast)
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(6);
      doc.text(pct(m.etaMax), M + labelW + i * cellW + cellW / 2, y, { align: 'center' });
    }
    setGray(doc, 80);
    doc.setFontSize(7);
    y += 4.5;
  }

  return y;
}

function drawTOC(doc: jsPDF, toc: Array<{ label: string; page: number }>, y: number): void {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  setGray(doc, 60);
  doc.text('INDICE', M, y);
  y += 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  setGray(doc, 80);

  // Pinta una entrada con label alineado a la izquierda, "p.N" alineado a la
  // derecha del bloque, y dots dinámicos rellenando el hueco — así todos los
  // page numbers caen en la misma columna, independientemente de la longitud
  // del título. (Antes eran 12 dots hardcoded → el p.N bailaba.)
  const lineH = 3.5;
  const dotW = doc.getTextWidth('.');
  const drawEntry = (label: string, page: number, leftX: number, rightX: number, atY: number) => {
    const labelText = pdfStr(label);
    const pageText = `p.${page}`;
    doc.text(labelText, leftX, atY);
    doc.text(pageText, rightX, atY, { align: 'right' });
    const labelW = doc.getTextWidth(labelText);
    const pageW = doc.getTextWidth(pageText);
    const gapStart = leftX + labelW + 1.5;
    const gapEnd = rightX - pageW - 1.5;
    if (gapEnd > gapStart && dotW > 0) {
      const nDots = Math.floor((gapEnd - gapStart) / dotW);
      if (nDots > 0) {
        setGray(doc, 160);
        doc.text('.'.repeat(nDots), gapStart, atY);
        setGray(doc, 80);
      }
    }
  };

  const useTwoCol = toc.length > 6;
  if (useTwoCol) {
    const half = Math.ceil(toc.length / 2);
    const gap = 6;
    const colW = (PAGE_W - 2 * M - gap) / 2;
    for (let i = 0; i < half; i++) {
      drawEntry(toc[i].label, toc[i].page, M, M + colW, y + i * lineH);
      const right = toc[i + half];
      if (right) {
        const rx = M + colW + gap;
        drawEntry(right.label, right.page, rx, rx + colW, y + i * lineH);
      }
    }
  } else {
    for (let i = 0; i < toc.length; i++) {
      drawEntry(toc[i].label, toc[i].page, M, PAGE_W - M, y + i * lineH);
    }
  }
}

function drawLimitationsBanner(doc: jsPDF, y: number, mode: 'compact' | 'full'): number {
  const bannerH = mode === 'compact' ? 12 : 22;
  // Borde y fondo ámbar suave
  doc.setDrawColor(245, 158, 11);
  doc.setFillColor(254, 252, 232);
  doc.setLineWidth(0.3);
  doc.rect(M, y, PAGE_W - 2 * M, bannerH, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(180, 83, 9);
  doc.text('LIMITACIONES — solo solicitaciones verticales', M + 3, y + 4);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(60, 60, 60);
  if (mode === 'compact') {
    doc.text('No comprueba: viento (DB-SE-AE 3.3), sismo (NCSE-02), empuje terreno, cortante en plano, vuelco.', M + 3, y + 8);
  } else {
    doc.text('Este modulo verifica SOLO compresion excentrica + pandeo vertical. NO comprueba:', M + 3, y + 8);
    doc.text('  - Viento sobre fachada (DB-SE-AE 3.3). Empuje horizontal genera flexion fuera de plano y vuelco.', M + 3, y + 11);
    doc.text('  - Sismo (NCSE-02). Fuerzas inerciales horizontales sobre el muro y sobre la masa de los forjados.', M + 3, y + 14);
    doc.text('  - Empuje del terreno si el muro es de sotano o contencion.', M + 3, y + 17);
    doc.text('  - Cortante en plano por accion horizontal del edificio transmitida a muros de arriostramiento.', M + 3, y + 20);
  }
  setGray(doc, 80);
  return y + bannerH + 4;
}

// ─────────────────────────────────────────────────────────────────────────────
// Page 2: Datos de partida
// ─────────────────────────────────────────────────────────────────────────────

function drawDataPartida(
  doc: jsPDF,
  state: MasonryWallState,
  plantasCalc: PlantaResult[],
  fab: ReturnType<typeof resolverFabrica>,
  gammaCell: ReturnType<typeof findGammaMCell>,
  system: UnitSystem,
  startY: number,
): void {
  let y = startY;

  // Section helpers
  const sectionTitle = (label: string) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    setGray(doc, 50);
    doc.text(label, M, y);
    // La regla es el SUBRAYADO del título: 2 mm bajo su línea base (1,3 mm
    // libres bajo el descendente) y 3 mm por encima de la mayúscula de la
    // primera fila. Antes se pintaba a y+3 con la fila a y+5: a 8 pt la
    // mayúscula sube 2,03 mm, así que la regla nacía EXACTAMENTE en el techo de
    // las letras y se leía pegada a la fila en vez de al título.
    setGray(doc, 200);
    doc.setLineWidth(0.2);
    doc.line(M, y + 2, PAGE_W - M, y + 2);
    y += 7;
  };
  const kv = (k: string, v: string, col = 0, wide = false) => {
    const x = M + col * 90;
    const valX = x + 35;
    // Ancho útil del valor: hasta la columna siguiente, o hasta el margen en las
    // filas `wide`. Se MIDE y se trunca. Sin esto, la referencia del modo Anejo C
    // («Anejo C eq. C.1 · Una hoja · piezas macizas (grueso = tizón/soga)», 82 mm
    // a 8 pt) acababa en 225 mm: 33 mm fuera del margen y RECORTADA por el borde
    // del papel. Ninguna fixture de layout cubría ese modo (ver pdfCases).
    const rightX = wide ? PAGE_W - M : Math.min(x + 90, PAGE_W - M);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    setGray(doc, 120);
    doc.text(pdfStr(k), x, y);
    setGray(doc, 30);
    doc.text(truncateToWidth(doc, pdfStr(v), rightX - valX), valX, y);
  };

  sectionTitle('1. Geometria global');
  kv('Longitud L', mToM(state.L), 0);
  kv('Espesor t', mToCm(state.t), 1);
  y += 4;
  kv('Nº plantas', `${state.plantas.length}`, 0);
  y += 6;

  sectionTitle('2. Fabrica (DB-SE-F §4.6)');
  // El modo Anejo C deriva fk de (tipo de muro, fb, fm) vía eq. C.1. Esos tres
  // inputs son los que hacen el fk re-derivable: sin ellos el documento
  // publicaba SOLO el fk global y nadie podía re-calcularlo. Van aquí además de
  // en la página de trazabilidad — la página de datos de partida es la que se
  // lee para saber qué se introdujo.
  const esAnejoC = fab.modo === 'custom' && state.customMethod === 'anejoC';
  const anejoC = esAnejoC
    ? calcFkAnejoC(state.anejoC_tipoMuro, state.anejoC_fb, state.anejoC_fm)
    : null;
  kv('Modo', fab.label, 0);
  // `fab.ref` arrastra el tipo de muro completo en Anejo C: en la columna
  // derecha no cabe. Aquí queda la subcláusula y el tipo baja a su propia fila
  // a ancho completo, donde se lee entero sin truncar.
  kv('Referencia', esAnejoC ? 'Anejo C eq. C.1' : fab.ref, 1);
  y += 4;
  if (esAnejoC && anejoC) {
    kv('Tipo de muro', `${TIPO_MURO_LABELS[state.anejoC_tipoMuro]}  ·  K = ${anejoC.K.toFixed(2)}`, 0, true);
    y += 4;
  }
  if (fab.modo === 'tabla') {
    // Sin formatQuantity a propósito: en Tabla 4.4 fb y fm son GRADOS discretos
    // de un desplegable, y la UI los rotula siempre en N/mm² (`${v} N/mm²`).
    // Convertirlos a kg/cm² aquí haría que el PDF no dijera lo mismo que la
    // pantalla. En Anejo C sí son NumField quantity="stress" → sí se convierten.
    kv('fb (pieza)', `${state.fb} N/mm2`, 0);
    kv('fm (mortero)', `${state.fm} N/mm2`, 1);
    y += 4;
  } else if (esAnejoC && anejoC) {
    kv('fb (pieza)', pdfStr(formatQuantity(state.anejoC_fb, 'stress', system)), 0);
    kv('fm (mortero)', pdfStr(formatQuantity(anejoC.fmInput, 'stress', system)), 1);
    y += 4;
    if (anejoC.capped) {
      // fm introducido > min(20; 0,75·fb): el fk de la fila siguiente NO se
      // re-deriva con el fm introducido, sino con el acotado. Publicar el
      // aplicado es lo que mantiene el documento auditable.
      doc.setFontSize(6.5);
      setGray(doc, 140);
      doc.text(
        pdfStr(`  fm aplicado en calculo: ${formatQuantity(anejoC.fmApplied, 'stress', system)}  ·  nota eq. C.1: min(20; 0,75·fb)`),
        M,
        y,
      );
      y += 4;
    }
  }
  if (fab.fk != null) {
    kv('fk (caracteristica)', pdfStr(formatQuantity(fab.fk, 'stress', system)), 0);
    kv('fd = fk/gM', pdfStr(formatQuantity(fab.fk / state.gamma_M, 'stress', system)), 1);
    y += 4;
  }
  kv('gamma_M', `${state.gamma_M}${gammaCell ? ` (Tabla 4.8: Cat. ${gammaCell.cat}, Clase ${gammaCell.ejec})` : ' (personalizado)'}`, 0);
  y += 4;
  if (gammaCell) {
    doc.setFontSize(6.5);
    setGray(doc, 140);
    doc.text(`  ${pdfStr(CATEGORIA_LABELS[gammaCell.cat])}  ·  ${pdfStr(EJECUCION_LABELS[gammaCell.ejec])}`, M, y);
    y += 4;
  }
  kv('gamma (peso especifico)', pdfStr(formatQuantity(fab.gamma, 'weightDensity', system)), 0);
  y += 6;

  sectionTitle('3. Acciones (DB-SE §4.2.4)');
  kv('gamma_G (permanente)', `${state.gamma_G}`, 0);
  kv('gamma_Q (variable)', `${state.gamma_Q}`, 1);
  y += 4;
  doc.setFontSize(7.5);
  setGray(doc, 100);
  doc.text('Combinacion ELU fundamental:  q_d = gamma_G x G_k + gamma_Q x Q_k', M, y);
  y += 6;

  sectionTitle('4. Plantas declaradas');
  const plantaCols: TableCol<PlantaResult>[] = [
    { key: 'nombre', label: 'Nombre', w: 32 },
    { key: 'H',      label: 'H (m)',     w: 16, align: 'right', render: (p) => mToM(p.H, 2).replace(' m', '') },
    { key: 'q_G',    label: 'q_G (kN/m)', w: 22, align: 'right', render: (p) => num(p.q_G, 1) },
    { key: 'q_Q',    label: 'q_Q (kN/m)', w: 22, align: 'right', render: (p) => num(p.q_Q, 1) },
    // e_apoyo ≤ 0 es el centinela "auto" (t/2 − a/3): imprimir el 0 literal
    // parecería una excentricidad nula tecleada. El valor resuelto sale en el
    // bloque por planta (e_apoyo = … mm).
    { key: 'e_apoyo', label: 'e_apoyo (mm)', w: 22, align: 'right', render: (p) => (p.e_apoyo > 0 ? num(p.e_apoyo, 0) : 'auto') },
    { key: 'a_apoyo', label: 'a_apoyo (mm)', w: 22, align: 'right', render: (p) => num(p.a_apoyo, 0) },
    { key: 'rho_n',   label: 'rho_n',    w: 14, align: 'right', render: (p) => num(p.rho_n, 2) },
    { key: 'huecos',  label: 'nh', w: 10, align: 'right', render: (p) => `${p.huecos.length}` },
    { key: 'puntuales', label: 'np', w: 10, align: 'right', render: (p) => `${p.puntuales.length}` },
  ];
  // De cubierta hacia abajo
  drawTable(doc, {
    x: M,
    y,
    cols: plantaCols,
    rows: plantasCalc.slice().reverse(),
    M,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Página opcional · Trazabilidad fk · DB SE-F Anejo C eq. C.1
// ─────────────────────────────────────────────────────────────────────────────
//
// Renderizada SOLO cuando `state.fabricaModo === 'custom'` y
// `state.customMethod === 'anejoC'`. La trazabilidad expone la subcláusula
// normativa (C.1, juntas ordinarias, mortero ordinario), el K aplicado, los
// inputs fb/fm introducidos por el usuario, el fm efectivo tras la nota al
// pie de C.1 (cap), y la fórmula con sustitución de números — para que el
// firmante o un building official pueda re-derivar el fk a mano.

function drawAnejoCBlock(
  doc: jsPDF,
  state: MasonryWallState,
  startY: number,
): void {
  let y = startY;
  const r = calcFkAnejoC(state.anejoC_tipoMuro, state.anejoC_fb, state.anejoC_fm);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  setGray(doc, 30);
  doc.text(
    pdfStr('Resistencia caracteristica fk · DB SE-F Anejo C eq. C.1'),
    M,
    y,
  );
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  setGray(doc, 90);
  doc.text(
    pdfStr('Juntas ordinarias (mortero ordinario). Subclausula C.1 unica soportada en esta version del modulo.'),
    M,
    y,
  );
  y += 8;

  // Marco visual: caja con borde fino que contiene la derivación literal.
  const boxX = M;
  const boxW = PAGE_W - 2 * M;
  const boxY = y;
  const lineH = 5;
  const rowsBase = 4; // tipo+K, fb·fm, fórmula, resultado
  const rows = rowsBase + (r.capped ? 1 : 0);
  const boxH = 8 + rows * lineH + 4;

  setGray(doc, 200);
  doc.setLineWidth(0.3);
  doc.rect(boxX, boxY, boxW, boxH);

  // Padding interno
  y = boxY + 6;
  const colX = boxX + 4;

  // Este recuadro va en `courier`, que NO tiene cara embebida: sigue siendo
  // una fuente core de jsPDF y por tanto Latin-1. De ahí `pdfStrLatin1` en
  // sus filas — con `pdfStr` un símbolo Unicode saldría en UTF-16 y pisaría
  // la columna de al lado.
  doc.setFont('courier', 'normal');
  doc.setFontSize(9);
  setGray(doc, 30);

  // Row 1: tipo de muro + K
  doc.text(
    pdfStrLatin1(
      `Tipo de muro: ${TIPO_MURO_LABELS[state.anejoC_tipoMuro]} · K = ${r.K.toFixed(2)}`,
    ),
    colX,
    y,
  );
  y += lineH;

  // Row 2: fb / fm introducidos
  doc.text(
    pdfStrLatin1(
      `fb (pieza) = ${state.anejoC_fb} N/mm² · fm (mortero introducido) = ${state.anejoC_fm} N/mm²`,
    ),
    colX,
    y,
  );
  y += lineH;

  // Row 3 (opcional): cap aplicado
  if (r.capped) {
    setGray(doc, 60);
    doc.text(
      pdfStrLatin1(
        `fm aplicado en calculo: ${r.fmApplied.toFixed(2)} N/mm² · nota C.1: min(20; 0,75·fb)`,
      ),
      colX,
      y,
    );
    setGray(doc, 30);
    y += lineH;
  }

  // Row 4: fórmula con sustitución literal
  doc.text(
    pdfStrLatin1(
      `fk = K · fb^0,65 · fm^0,25 = ${r.K.toFixed(2)} · ${state.anejoC_fb}^0,65 · ${r.fmApplied.toFixed(2)}^0,25`,
    ),
    colX,
    y,
  );
  y += lineH;

  // Row 5: resultado final (negrita, ligeramente más grande)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  setGray(doc, 30);
  const fkStr = r.fk != null ? `${r.fk.toFixed(3)} N/mm²` : 'no aplicable';
  doc.text(pdfStr(`→ fk = ${fkStr}`), colX, y);

  // Voids el TS lint
  void ensureSpace;
}

// ─────────────────────────────────────────────────────────────────────────────
// Page 3: Casos gobernantes — derivación literal (estilo CYPE)
// ─────────────────────────────────────────────────────────────────────────────

function drawGovernantes(
  doc: jsPDF,
  gobernantes: Array<{ planta: PlantaResult; machon: MachonResult }>,
  state: MasonryWallState,
  fab: ReturnType<typeof resolverFabrica>,
  system: UnitSystem,
  startY: number,
): void {
  let y = startY;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  setGray(doc, 50);
  doc.text('CASOS GOBERNANTES — Machon mas solicitado por planta', M, y);
  y += 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  setGray(doc, 120);
  doc.text('Substitucion literal de valores para que el reviewer pueda re-derivar a mano cada eta.', M, y);
  y += 6;

  // Cada gobernante: bloque de ~50mm
  for (const g of gobernantes.slice().reverse()) {
    y = ensureSpace(doc, y, 56, M);
    y = drawGovernanteBlock(doc, g.planta, g.machon, state, fab, system, y);
    y += 3;
  }
}

function drawGovernanteBlock(
  doc: jsPDF,
  pl: PlantaResult,
  m: MachonResult,
  state: MasonryWallState,
  fab: ReturnType<typeof resolverFabrica>,
  _system: UnitSystem,    // mantenido en la firma por paridad con resto de helpers; no se usa dentro
  startY: number,
): number {
  let y = startY;
  const [r, g, b] = statusRGB(m.etaMax);

  // Title bar
  doc.setFillColor(r, g, b);
  doc.rect(M, y - 3, PAGE_W - 2 * M, 5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text(`${pdfStr(pl.nombre)}  -  Machon ${m.id}  -  ${pct(m.etaMax)} ${statusLabel(m.etaMax)}`, M + 2, y);
  y += 5;
  setGray(doc, 80);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);

  // Geometría
  setGray(doc, 100);
  doc.text('Geometria:', M, y);
  setGray(doc, 40);
  doc.text(`x [${mToCm(m.x1)} - ${mToCm(m.x2)}],  ancho = ${mToCm(m.ancho)},  A = ${num(m.A, 0)} mm2,  t = ${mToCm(state.t)}`, M + 22, y);
  y += 4;

  // Cabeza — derivación literal del axil
  setGray(doc, 100);
  doc.text('Cabeza:', M, y);
  setGray(doc, 40);
  doc.text(`N_Ed = N_her + N_for + N_din + N_pun = ${num(m.N_heredado, 1)} + ${num(m.N_lineal_forjado, 1)} + ${num(m.N_dinteles, 1)} + ${num(m.N_puntual, 1)} = ${num(m.N_Ed, 1)} kN`, M + 22, y);
  y += 4;

  // Capacidad — derivación literal de N_Rd
  setGray(doc, 100);
  doc.text('Capacidad:', M, y);
  setGray(doc, 40);
  const fd_val = fab.fk != null ? fab.fk / state.gamma_M : m.f_d;
  doc.text(`N_Rd = Phi x fd x A = ${m.Phi.toFixed(3)} x ${fd_val.toFixed(2)} x ${num(m.A, 0)} / 1000 = ${num(m.N_Rd, 1)} kN`, M + 22, y);
  y += 4;

  // Pie
  setGray(doc, 100);
  doc.text('Pie:', M, y);
  setGray(doc, 40);
  doc.text(`N_Ed_pie = N_Ed + peso propio muro = ${num(m.N_Ed, 1)} + ${num(m.N_Ed_pie - m.N_Ed, 1)} = ${num(m.N_Ed_pie, 1)} kN`, M + 22, y);
  y += 4;

  // Tensiones
  setGray(doc, 100);
  doc.text('Tensiones:', M, y);
  setGray(doc, 40);
  doc.text(`sigma_top = ${num(m.sigma_top, 2)} N/mm2,  sigma_bot = ${num(m.sigma_bottom, 2)} N/mm2,  fd = ${fd_val.toFixed(2)} N/mm2`, M + 22, y);
  y += 5;

  // Comprobaciones §5.2 / §5.2.4 / §5.4
  // El criterio es el del motor (fail sii λ > 27), no `< 27`: en λ = 27 exacto
  // el PDF decía INCUMPLE y el veredicto del motor decía CUMPLE.
  const lambdaPass = pl.lambda <= MASONRY_LAMBDA_MAX;
  doc.setFont('helvetica', 'bold');
  setGray(doc, 60);
  doc.text('§5.2:', M, y);
  doc.setFont('helvetica', 'normal');
  setGray(doc, 40);
  doc.text(`eta = max(eta_cab, eta_pie) = max(${m.eta_cabeza.toFixed(3)}, ${m.eta_pie.toFixed(3)}) = ${m.eta.toFixed(3)}  -> ${statusLabel(m.eta)}`, M + 16, y);
  y += 3.5;
  doc.setFont('helvetica', 'bold');
  setGray(doc, 60);
  doc.text('§5.2.4:', M, y);
  doc.setFont('helvetica', 'normal');
  setGray(doc, 40);
  doc.text(`lam = h_ef/t = ${num(pl.h_ef, 0)}/${state.t} = ${pl.lambda.toFixed(1)}  ${lambdaPass ? `<= ${MASONRY_LAMBDA_MAX} (CUMPLE)` : `> ${MASONRY_LAMBDA_MAX} (INCUMPLE)`}`, M + 16, y);
  y += 3.5;
  if (m.etaConc > 0) {
    doc.setFont('helvetica', 'bold');
    setGray(doc, 60);
    doc.text('§5.4:', M, y);
    doc.setFont('helvetica', 'normal');
    setGray(doc, 40);
    doc.text(`eta_conc = sigma_loc/(beta x fd) = ${m.etaConc.toFixed(3)}  -> ${statusLabel(m.etaConc)}`, M + 16, y);
    y += 3.5;
  } else {
    doc.setFont('helvetica', 'bold');
    setGray(doc, 60);
    doc.text('§5.4:', M, y);
    doc.setFont('helvetica', 'normal');
    setGray(doc, 120);
    doc.text('No aplica (sin concentracion bajo apoyo en este machon)', M + 16, y);
    y += 3.5;
  }

  // Separador entre bloques
  setGray(doc, 220);
  doc.line(M, y + 1, PAGE_W - M, y + 1);
  return y + 2;
}

// ─────────────────────────────────────────────────────────────────────────────
// Apéndice por planta (LANDSCAPE) — sub-tabla A + sub-tabla B + dinteles + puntuales
// ─────────────────────────────────────────────────────────────────────────────

function drawAppendixPlanta(
  doc: jsPDF,
  pl: PlantaResult,
  _state: MasonryWallState,    // paridad con drawGovernanteBlock; no se usa dentro
  system: UnitSystem,
  startY: number,
): void {
  let y = startY;

  // Título de la sección dentro del cover-header común
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  setGray(doc, 30);
  doc.text(`Apendice — ${pdfStr(pl.nombre)}`, M, y);
  y += 6;

  // Derivación de la planta (1 sub-bloque)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  setGray(doc, 60);
  doc.text('Derivacion de la planta (§5.2.4)', M, y);
  y += 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  setGray(doc, 80);
  // Reformateado a 4 líneas más cortas para entrar en 174mm sin descuajar.
  const row1 = `H = ${mToM(pl.H)}  ·  rho_n = ${pl.rho_n.toFixed(2)}  ·  h_ef = ${num(pl.h_ef, 0)} mm  ·  lam = ${pl.lambda.toFixed(1)}`;
  const row2 = `e_apoyo = ${num(pl.e_apoyo, 1)} mm  ·  k_reparto = ${pl.k_reparto.toFixed(2)}`;
  const row3 = `e_cabeza = ${num(pl.e_cabeza, 1)} mm  ·  e_pie = ${num(pl.e_pie, 1)} mm  ·  e_a = ${num(pl.e_a, 1)} mm  ·  e_min = ${num(pl.e_min, 1)} mm`;
  const row4 = `e_total = ${num(pl.e_total, 1)} mm  ·  Phi = ${pl.Phi.toFixed(3)}  ·  fd = ${pl.f_d.toFixed(2)} N/mm2`;
  doc.text(row1, M, y); y += 3.5;
  doc.text(row2, M, y); y += 3.5;
  doc.text(row3, M, y); y += 3.5;
  doc.text(row4, M, y); y += 5;

  // ── Tabla DINTELES (si hay huecos en la planta) ─────────────────────────
  if (pl.dinteles.length > 0) {
    y = ensureSpace(doc, y, 10 + 5 * pl.dinteles.length, M);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    setGray(doc, 60);
    doc.text('Dinteles', M, y);
    y += 3;
    // Columnas siempre necesarias; las opcionales (P_hueco) se omiten si la
    // planta no tiene puntuales que caigan sobre huecos (ahorra anchura).
    const hayPSobreHueco = pl.dinteles.some((d) => d.P_sobre_hueco > 0);
    const dCols: TableCol<DintelResult>[] = [
      { key: 'id',           label: 'ID',                 w: 14 },
      { key: 'tipo',         label: 'Tipo',               w: 16, render: (d) => {
        const orig = pl.huecos.find((h) => h.id === d.id);
        return orig?.tipo ?? '-';
      }},
      { key: 'luz',          label: 'Luz cm',             w: 16, align: 'right', render: (d) => num(d.luz / 10, 1) },
      { key: 'h_muro_sobre', label: 'h_muro cm',          w: 18, align: 'right', render: (d) => num(d.h_muro_sobre / 10, 1) },
      { key: 'q_dintel',     label: 'q_dintel kN/m',      w: 22, align: 'right', render: (d) => num(d.q_dintel, 2) },
      { key: 'R_izq',        label: 'R_izq kN',           w: 18, align: 'right', render: (d) => num(d.R_izq, 1) },
      { key: 'R_dch',        label: 'R_dch kN',           w: 18, align: 'right', render: (d) => num(d.R_dch, 1) },
      ...(hayPSobreHueco ? [
        { key: 'P_sobre_hueco', label: 'P_hueco kN',      w: 18, align: 'right' as const, render: (d: DintelResult) => num(d.P_sobre_hueco, 1) },
      ] : []),
      { key: 'M_Ed',         label: 'M_Ed kNm',           w: 18, align: 'right', render: (d) => num(d.M_Ed, 2) },
      { key: 'V_Ed',         label: 'V_Ed kN',            w: 16, align: 'right', render: (d) => num(d.V_Ed, 1) },
    ];
    y = drawTable(doc, { x: M, y, cols: dCols, rows: pl.dinteles, M, cellFontSize: 7, headerFontSize: 7 });
    y += 4;
  }

  // ── Tabla CARGAS PUNTUALES (si hay) ──────────────────────────────────────
  if (pl.puntuales.length > 0) {
    y = ensureSpace(doc, y, 10 + 5 * pl.puntuales.length, M);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    setGray(doc, 60);
    doc.text('Cargas puntuales declaradas', M, y);
    y += 3;
    const pCols: TableCol<Puntual>[] = [
      { key: 'id',      label: 'ID',           w: 14 },
      { key: 'x',       label: 'x cm',         w: 22, align: 'right', render: (p) => num(p.x / 10, 1) },
      { key: 'P_G',     label: 'P_G kN',       w: 22, align: 'right', render: (p) => num(p.P_G, 1) },
      { key: 'P_Q',     label: 'P_Q kN',       w: 22, align: 'right', render: (p) => num(p.P_Q, 1) },
      { key: 'b_apoyo', label: 'b_apoyo mm',   w: 26, align: 'right', render: (p) => num(p.b_apoyo, 0) },
    ];
    y = drawTable(doc, { x: M, y, cols: pCols, rows: pl.puntuales, M, cellFontSize: 7, headerFontSize: 7 });
    y += 4;
  }

  // ── Sub-tabla A: Cabeza/pie/geometría (axil en kN) — portrait fit ───────
  // Total: 12+22+14+14+14+14+14+18+18 = 140 mm  ≤ 174 mm content
  y = ensureSpace(doc, y, 10 + 5 * pl.machones.length, M);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  setGray(doc, 60);
  doc.text('Machones — Sub-tabla A: cabeza/pie/geometria (axil en kN)', M, y);
  y += 3;
  const colsA: TableCol<MachonResult>[] = [
    { key: 'id',               label: 'ID',           w: 12 },
    { key: 'range',            label: '[x1-x2] cm',   w: 22, render: (m) => `${num(m.x1/10,0)}-${num(m.x2/10,0)}` },
    { key: 'ancho',            label: 'ancho cm',     w: 14, align: 'right', render: (m) => num(m.ancho/10, 1) },
    { key: 'N_heredado',       label: 'N_her',        w: 14, align: 'right', render: (m) => num(m.N_heredado, 1) },
    { key: 'N_lineal_forjado', label: 'N_for',        w: 14, align: 'right', render: (m) => num(m.N_lineal_forjado, 1) },
    { key: 'N_dinteles',       label: 'N_din',        w: 14, align: 'right', render: (m) => num(m.N_dinteles, 1) },
    { key: 'N_puntual',        label: 'N_pun',        w: 14, align: 'right', render: (m) => num(m.N_puntual, 1) },
    { key: 'N_Ed',             label: 'N_Ed cab',     w: 18, align: 'right', render: (m) => num(m.N_Ed, 1), bold: () => true },
    { key: 'N_Ed_pie',         label: 'N_Ed pie',     w: 18, align: 'right', render: (m) => num(m.N_Ed_pie, 1), bold: () => true },
  ];
  y = drawTable(doc, { x: M, y, cols: colsA, rows: pl.machones, M, cellFontSize: 7, headerFontSize: 7 });
  y += 4;

  // ── Sub-tabla B: Capacidad y verificación — portrait fit ────────────────
  // Total: 12+16+22+22+18+14+14+14+14+20 = 166 mm ≤ 174 mm content
  // (Mantener η_cab y η_pie es lo que justifica el max(); A y N_Rd repetidos
  //  desde sub-tabla A para que la sub-tabla B se lea aislada y un lector
  //  cruce las dos por ID sin tener que comparar fila por fila.)
  y = ensureSpace(doc, y, 10 + 5 * pl.machones.length, M);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  setGray(doc, 60);
  doc.text('Machones — Sub-tabla B: capacidad y verificacion', M, y);
  y += 3;
  const colsB: TableCol<MachonResult>[] = [
    { key: 'id',           label: 'ID',           w: 12 },
    { key: 'A',            label: 'A mm2',        w: 16, align: 'right', render: (m) => num(m.A, 0) },
    { key: 'sigma_top',    label: 's_top N/mm2',  w: 22, align: 'right', render: (m) => num(m.sigma_top, 2) },
    { key: 'sigma_bottom', label: 's_bot N/mm2',  w: 22, align: 'right', render: (m) => num(m.sigma_bottom, 2) },
    { key: 'N_Rd',         label: 'N_Rd kN',      w: 18, align: 'right', render: (m) => num(m.N_Rd, 1) },
    { key: 'eta_cabeza',   label: 'eta_cab',      w: 14, align: 'right', render: (m) => m.eta_cabeza.toFixed(3) },
    { key: 'eta_pie',      label: 'eta_pie',      w: 14, align: 'right', render: (m) => m.eta_pie.toFixed(3) },
    { key: 'etaConc',      label: 'eta_conc',     w: 14, align: 'right', render: (m) => m.etaConc > 0 ? m.etaConc.toFixed(3) : '-' },
    { key: 'etaMax',       label: 'eta_max',      w: 14, align: 'right', render: (m) => pct(m.etaMax), bold: () => true, color: (m) => statusGray(m.etaMax) },
    { key: 'status',       label: 'Estado',       w: 20, render: (m) => statusLabel(m.etaMax), color: (m) => statusGray(m.etaMax), bold: () => true },
  ];
  y = drawTable(doc, { x: M, y, cols: colsB, rows: pl.machones, M, cellFontSize: 7, headerFontSize: 7 });

  // Referencia normativa aplicada (1 línea, no tabla — el dato es uniforme
  // dentro de la planta: §5.2 + §5.2.4 siempre, §5.4 si algún etaConc > 0).
  y += 4;
  const algunaConc = pl.machones.some((m) => m.etaConc > 0);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  setGray(doc, 120);
  doc.text(`Comprobaciones aplicadas: §5.2 (compresion excentrica), §5.2.4 (pandeo lam <= ${MASONRY_LAMBDA_MAX})${algunaConc ? ', §5.4 (concentracion bajo apoyo)' : ''}.`, M, y);

  if (system !== 'si') {
    y += 4;
    doc.setFontSize(6.5);
    setGray(doc, 140);
    doc.text(`Sistema de unidades: ${system}. Geometria en m/cm; axil/tension en unidades nativas.`, M, y);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Última página: Anexo metodológico
// ─────────────────────────────────────────────────────────────────────────────

function drawMetodologia(doc: jsPDF, startY: number): void {
  let y = startY;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  setGray(doc, 30);
  doc.text('Anexo metodologico', M, y);
  y += 6;

  const block = (title: string, lines: string[]) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    setGray(doc, 60);
    doc.text(title, M, y);
    y += 4;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    setGray(doc, 80);
    for (const line of lines) {
      doc.text(pdfStr(line), M + 2, y, { maxWidth: PAGE_W - 2 * M - 2 });
      y += 3.5;
    }
    y += 3;
  };

  block('Comprobaciones implementadas (DB-SE-F)', [
    'Compresion excentrica (§5.2):  N_Ed <= N_Rd = Phi x fd x A.  Verificada en cabeza Y en pie de cada machon; eta = max(eta_cab, eta_pie).',
    'Pandeo (§5.2.4):  esbeltez lam = h_ef / t.  h_ef = rho_n x H.',
    'Concentracion bajo apoyo (§5.4):  sigma_loc / (beta x fd).  beta = 1 + 0.3 x (a/h), acotado [1.0, 1.5].',
    'Resistencia caracteristica fk (§4.6.2): Tabla 4.4 segun pieza x fb x fm.',
    'Coeficiente parcial gamma_M (§4.6.7): Tabla 4.8 segun categoria de control x clase de ejecucion.',
  ]);

  block('Excentricidad de calculo', [
    'e_a = h_ef / 450  (excentricidad accidental por imperfecciones)',
    'e_min = max(0.05 x t, 20 mm)  (excentricidad minima)',
    'e_m = 0.6 x max(e_cab, e_pie) + 0.4 x min(e_cab, e_pie)  (excentricidad media)',
    'e_total = max(e_m + e_a, e_min)',
    'Phi unificado linealizado:  Phi = (1 - 2 x e_total/t) x (1 - (lam - 10)/30)  para lam > 10',
  ]);

  block('Combinacion de acciones ELU (DB-SE §4.2.4 fundamental)', [
    'q_d = gamma_G x G_k + gamma_Q x Q_k',
    'El motor mayora internamente; los inputs son siempre caracteristicos.',
    'Para multiples acciones variables (Q1 + Q2 + ...), el usuario debe sumar manualmente la combinacion mas desfavorable en q_Q.',
  ]);

  block('Cascada multi-planta (transmision top-down)', [
    'Cada planta i emite al piso inferior i-1 dos tipos de segments:',
    '  - distributed: N_lineal + peso_machon, repartido como UDL sobre [x1, x2] del machon emisor.',
    '  - concentrated: N_puntual + N_dinteles, con originX = centro del machon emisor, para re-evaluar §5.4 abajo.',
    'En cada machon inferior se re-integra topPlusFloor sobre su intervalo [x1, x2].',
    'Esto preserva: puntuales arriba propagan, reacciones de dinteles propagan, peso propio NO aparece bajo huecos.',
  ]);

  block('Simplificaciones declaradas (S1..S5)', [
    'S1. Phi unificado linealizado (entre version simplificada CTE y rigurosa EC6 Annex G).',
    'S2. beta(§5.4) depende solo de a/h (no modula por A_ef/A_b).',
    'S3. rho_n por defecto: 0.75 (planta intermedia) / 1.0 (cubierta). Usuario puede sobrescribir.',
    'S4. Una sola variable Q por planta. Si hay multiples acciones variables, sumar manualmente.',
    'S5. Tabla 4.4 simplificada; modo Personalizado para fk fuera de tabla.',
  ]);

  // Banner LIMITACIONES (full)
  drawLimitationsBanner(doc, y, 'full');
}

// ─────────────────────────────────────────────────────────────────────────────
// Finalize
// ─────────────────────────────────────────────────────────────────────────────

function finalize(doc: jsPDF, elementTitle: string): PdfResult {
  const pageCount = doc.getNumberOfPages();
  const blob = doc.output('blob');
  const blobUrl = URL.createObjectURL(blob);
  const filename = titledFilename(elementTitle, masonryWallsFallbackFilename());
  return { blobUrl, filename, pageCount };
}

// Compatibilidad: el código del componente usa FOOTER_RESERVE y PAGE_H/PAGE_W
// implícitamente vía utils. No requiere re-exports aquí.
void FOOTER_RESERVE;
void PAGE_H;
