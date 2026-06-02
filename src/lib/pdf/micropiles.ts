// PDF export for Micropilotes module
// A4 portrait — input summary + 4 SVG views (perfil, Rfc curva, sección, semáforos)
// + tabla de comprobaciones.

import jsPDF from 'jspdf';
import { svg2pdf } from 'svg2pdf.js';
import { type MicropilesInputs, type SoilLayer } from '../../data/defaults';
import { type MicropilesResult } from '../calculations/micropiles';
import type { CheckStatus } from '../calculations/types';
import { CUSTOM_TUBE_SENTINEL } from '../../data/micropileTubes';

import { PAGE_W, PAGE_H, setGray, pdfStr, type PdfResult } from './utils';

/**
 * Renderiza la línea "Tubo: ..." del PDF. Si es del catálogo, usa el label
 * (Ø88,9 × 9 mm). Si es custom, sintetiza la descripción con los valores
 * tecleados — antes mostraba literal "custom" y el técnico se quedaba sin
 * datos del armado en el PDF entregable.
 *
 * Exportado SOLO para tests. No usar fuera de pdf/micropiles.ts.
 */
export function tubeLabelForPdf(inp: MicropilesInputs): string {
  if (inp.tube === CUSTOM_TUBE_SENTINEL) {
    const de = inp.customTubeDe.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    const e  = inp.customTubeE.toLocaleString('es-ES',  { minimumFractionDigits: 0, maximumFractionDigits: 1 });
    return `Ø${de} × ${e} mm (personalizado)`;
  }
  return inp.tube;
}

const M = 18;

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

export async function exportMicropilesPDF(
  inp: MicropilesInputs,
  soil: SoilLayer[],
  result: MicropilesResult,
): Promise<PdfResult> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // ── Header ──────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  setGray(doc, 30);
  doc.text(pdfStr('Concreta — Micropilotes'), M, M);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  setGray(doc, 120);
  doc.text(`Generado: ${new Date().toLocaleDateString('es-ES')}`, M, M + 5);

  hline(doc, M + 8, 200, 0.3);

  // ── Input summary (left) + Perfil SVG (right) ───────────────────────────
  const startY = M + 13;
  let y = startY;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  setGray(doc, 60);
  doc.text('GEOMETRIA Y MATERIALES', M, y);
  y += 4;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  setGray(doc, 80);

  const col1 = M;
  const col2 = M + 40;
  const L = inp.toeDepth - inp.topDepth;
  const pairs: Array<[string, string]> = [
    [`z cabeza = ${inp.topDepth.toFixed(2)} m`,               `z apoyo = ${inp.toeDepth.toFixed(2)} m`],
    [`L = ${L.toFixed(2)} m`,                                 `Dn = ${inp.drillDiameter.toFixed(0)} mm`],
    [`NF z = ${inp.waterTableDepth.toFixed(2)} m`,            `p,inj = ${inp.injectionPressure.toFixed(0)} kPa`],
    [`Nc,d = ${inp.designLoad.toFixed(0)} kN`,                `Esfuerzo: ${inp.effort}`],
    [`Método: ${inp.method}`,                                 `Estratos: ${soil.length}`],
    [pdfStr(`Hormigón HA-${inp.concreteGrade}`),              pdfStr(`Tubo: ${tubeLabelForPdf(inp)}`)],
    [pdfStr(`fy = ${inp.steelGrade} N/mm²`),                  `CR = ${result.crAdopted.toFixed(2)} (${inp.crManualOverride ? 'manual' : 'auto'})`],
    [`Ejecución: Fe=${result.Fe.toFixed(2)}`,                 `Corrosión: re=${result.re.toFixed(2)} mm`],
    [pdfStr(`Aplicación: ${inp.application === 'new' ? 'nueva' : 'existente'}`),
     pdfStr(`Duración: ${inp.duration === 'short' ? '≤6m' : '>6m'}`)],
  ];

  for (const [a, b] of pairs) {
    doc.text(pdfStr(a), col1, y);
    if (b) doc.text(pdfStr(b), col2, y);
    y += 3.5;
  }
  const textEndY = y;

  // SVG perfil (zona derecha)
  const svgZoneX = M + 92;
  const svgZoneW = PAGE_W - M - svgZoneX;
  let svgEndY = startY;
  const profileEl = document.getElementById('micropiles-svg-pdf-profile');
  if (profileEl) {
    const node = profileEl.querySelector('svg');
    if (node) {
      const sW = svgZoneW;
      const sH = sW * (460 / 500);
      try {
        await svg2pdf(node, doc, { x: svgZoneX, y: startY, width: sW, height: sH });
        svgEndY = startY + sH;
      } catch {
        // continue without diagram
      }
    }
  }

  y = Math.max(textEndY, svgEndY) + 2;
  hline(doc, y, 180, 0.2);
  y += 4;

  // ── Valores calculados ─────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  setGray(doc, 60);
  doc.text('VALORES CALCULADOS', M, y);
  y += 4;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  setGray(doc, 70);

  const kv: [string, string][] = [
    ['Rfc,d teórico',  `${result.RfcTheoretical.toFixed(2)} kN`],
    ['Rfc,d empírico', `${result.RfcEmpirical.toFixed(2)} kN`],
    ['Rfc,d adoptado', `${result.RfcAdopted.toFixed(2)} kN`],
    ['As,y',           `${result.As_y.toFixed(2)} mm²`],
    ['As,d',           `${result.As_d.toFixed(2)} mm²`],
    ['Fc,h',           `${result.Fc_h.toFixed(2)} kN`],
    ['Fa,h',           `${result.Fa_h.toFixed(2)} kN`],
    ['Nc,rd',          `${result.Nc_rd.toFixed(2)} kN`],
    ['Tc,rd',          `${result.Tc_rd.toFixed(2)} kN`],
    ['CR pandeo',      `${result.crAdopted.toFixed(2)} (${inp.crManualOverride ? 'manual' : 'auto'})`],
    ['R pandeo',       result.R.toFixed(3)],
    ['Le / Lef',       `${result.Le.toFixed(2)} / ${result.Lef.toFixed(2)} m`],
    ['Mpl,rd',         `${result.Mpl_rd.toFixed(2)} kNm`],
    ['Vpl,rd',         `${result.Vpl_rd.toFixed(2)} kN`],
  ];

  for (const [label, val] of kv) {
    doc.text(pdfStr(`${label}:`), M + 2, y);
    doc.text(pdfStr(val), M + 55, y);
    y += 3.2;
  }

  hline(doc, y + 1, 180, 0.2);
  y += 4;

  // ── Pandeo (Guía Fomento §3.6.1 / Tabla 3.6) ──────────────────────────
  // El documento entregable debe llevar las salvedades del cálculo de pandeo
  // (fuera de tabla, terreno inestable, dato correlacionado), no solo el R.
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  setGray(doc, 60);
  doc.text('PANDEO (R = 1.07 - 0.027·CR)', M, y);
  y += 4;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  setGray(doc, 70);
  doc.text(pdfStr(`CR adoptado: ${result.crAdopted.toFixed(2)} (${inp.crManualOverride ? 'manual' : 'auto'})  ·  R = ${result.R.toFixed(3)}`), M + 2, y);
  y += 3.2;
  if (result.crGoverning) {
    doc.text(pdfStr(`Gobierna: ${result.crGoverning}`), M + 2, y);
    y += 3.2;
  }
  if (result.R <= 0) {
    setGray(doc, 150);  // rojo no disponible en escala gris: se marca con texto
    doc.text(pdfStr('AVISO: tope estructural nulo por pandeo (CR >= 40).'), M + 2, y);
    setGray(doc, 70);
    y += 3.2;
  }
  // Hipótesis: los avisos ('warn') se prefijan con [!] para destacarlos en el
  // documento; las notas informativas van en gris más claro.
  for (const h of result.crHypotheses) {
    const isWarn = h.level === 'warn';
    setGray(doc, isWarn ? 60 : 120);
    const prefix = isWarn ? '[!] ' : '- ';
    const wrapped = doc.splitTextToSize(pdfStr(prefix + h.text), 172) as string[];
    for (const line of wrapped) {
      doc.text(line, M + 2, y);
      y += 2.8;
    }
  }
  setGray(doc, 70);

  hline(doc, y + 1, 180, 0.2);
  y += 4;

  // ── Disposición en planta (Guía Fomento §3.10 + Fig. 3.6) ─────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  setGray(doc, 60);
  doc.text('DISPOSICION EN PLANTA', M, y);
  y += 4;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  setGray(doc, 70);
  const spacingKv: [string, string][] = [
    ['Sep. mínima (2D)',              `${(result.spacingMin * 100).toFixed(2)} cm`],
    ['Sep. máx. recomendada (5D, 1m)', `${(result.spacingMaxRec * 100).toFixed(2)} cm`],
    ['Sin efecto grupo (S >= 4D)',    `${(result.spacingForNoGroup * 100).toFixed(2)} cm`],
  ];
  for (const [label, val] of spacingKv) {
    doc.text(pdfStr(`${label}:`), M + 2, y);
    doc.text(pdfStr(val), M + 55, y);
    y += 3.2;
  }

  doc.setFontSize(6);
  setGray(doc, 110);
  const noteLines = [
    pdfStr(`Concreta calcula un pilote individual. Si en el encepado hay mas de uno, mantener S >= ${(result.spacingForNoGroup * 100).toFixed(0)} cm`),
    pdfStr('entre ejes para evitar el coeficiente g de la Tabla 3.10 (rango 3D-4D). Para S menor, el calculo individual'),
    pdfStr('queda del lado de la inseguridad y procede minorar la capacidad del grupo (Concreta no lo computa).'),
  ];
  for (const line of noteLines) {
    doc.text(line, M + 2, y);
    y += 2.8;
  }

  hline(doc, y + 1, 180, 0.2);
  y += 4;

  // ── Tabla de comprobaciones ─────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  setGray(doc, 60);
  doc.text('COMPROBACIONES', M, y);
  y += 3;

  const COL = { desc: M, value: M + 76, limit: M + 116, util: M + 148, status: M + 161 };

  hline(doc, y - 0.5, 180, 0.15);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  setGray(doc, 100);
  doc.text('Verificacion', COL.desc,   y);
  doc.text('Valor',        COL.value,  y);
  doc.text('Limite',       COL.limit,  y);
  doc.text('Ut%',          COL.util,   y);
  doc.text('Estado',       COL.status, y);
  y += 1.5;
  hline(doc, y, 170, 0.15);
  y += 3.5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);

  for (const ch of result.checks) {
    if (y > PAGE_H - M - 10) {
      doc.addPage();
      y = M + 10;
    }

    setGray(doc, 50);
    const desc = doc.splitTextToSize(pdfStr(ch.description), 70)[0] as string;
    doc.text(desc, COL.desc, y);
    doc.text(pdfStr(ch.value ?? ''), COL.value, y);
    doc.text(pdfStr(ch.limit ?? ''), COL.limit, y);
    const utilStr = isFinite(ch.utilization)
      ? `${(ch.utilization * 100).toFixed(0)}%`
      : '---';
    doc.text(utilStr, COL.util, y);
    setGray(doc, ch.status === 'ok' ? 70 : 30);
    doc.setFont('helvetica', 'bold');
    doc.text(STATUS_LABEL[ch.status], COL.status, y);
    doc.setFont('helvetica', 'normal');
    y += 3.5;

    setGray(doc, 160);
    doc.setFontSize(5.5);
    doc.text(pdfStr(ch.article), COL.desc + 2, y);
    doc.setFontSize(6.5);
    setGray(doc, 50);
    y += 2;

    hline(doc, y, 230, 0.1);
    y += 3;
  }

  // ── Páginas adicionales: Rfc curva, sección, semáforos ──────────────────
  const diagramPages: Array<{ id: string; title: string; aspect: number }> = [
    { id: 'micropiles-svg-pdf-rfc',     title: 'RFC ACUMULADA',  aspect: 400 / 500 },
    { id: 'micropiles-svg-pdf-section', title: 'SECCIÓN DEL TOPE', aspect: 400 / 500 },
    { id: 'micropiles-svg-pdf-sema',    title: 'SEMÁFOROS',       aspect: 360 / 500 },
  ];

  for (const { id, title, aspect } of diagramPages) {
    const node = document.getElementById(id)?.querySelector('svg') as SVGSVGElement | null;
    if (!node) continue;

    doc.addPage();

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    setGray(doc, 30);
    doc.text(pdfStr('Concreta — Micropilotes'), M, M);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    setGray(doc, 60);
    doc.text(pdfStr(title), M, M + 5);
    hline(doc, M + 8, 200, 0.3);

    const dW = PAGE_W - 2 * M;
    const dH = dW * aspect;
    try {
      await svg2pdf(node, doc, { x: M, y: M + 14, width: dW, height: dH });
    } catch {
      // continue
    }
  }

  // ── Footer ──────────────────────────────────────────────────────────────
  const totalPages = (doc.internal as unknown as { getNumberOfPages: () => number }).getNumberOfPages();
  for (let pg = 1; pg <= totalPages; pg++) {
    doc.setPage(pg);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    setGray(doc, 180);
    doc.text(pdfStr('Concreta — Herramienta de cálculo estructural. Verificar resultados antes de su uso en proyecto.'), M, PAGE_H - 10);
  }

  const filename = 'micropilotes.pdf';
  const blob = doc.output('blob');
  const blobUrl = URL.createObjectURL(blob);
  const pageCount = totalPages;
  return { blobUrl, filename, pageCount };
}
