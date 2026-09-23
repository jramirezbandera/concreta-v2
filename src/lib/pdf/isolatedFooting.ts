// PDF de Zapatas aisladas. jsPDF — A4 vertical, márgenes de 20 mm.
//
// Página 1: datos de entrada (en el orden del panel), cargas derivadas y la
// tabla de comprobaciones. Detrás, una página por vista del lienzo —Terreno,
// Armado y Modelo— a plana entera, que es lo que hace falta para que un rótulo
// de 10 px del SVG llegue al papel a 3 mm y se lea.
//
// El SVG NO pasa por svg2pdf: `embedSvgAsImage` lo serializa a un data-URL y lo
// rasteriza el navegador. Por eso valen patrones, degradados y `paint-order`, y
// también los símbolos que no son Latin-1 (σ, ≤, Ø) DENTRO del dibujo. El texto
// que escribe jsPDF, en cambio, sigue pasando por `pdfStr`.

import { crearPdf } from './fuente';
import { type IsolatedFootingInputs } from '../../data/defaults';
import { type IsolatedFootingResult } from '../../lib/calculations/isolatedFooting';
import { formatQuantity } from '../units/format';
import type { Quantity, UnitSystem } from '../units/types';
import { embedSvgAsImage, svgBoxHeight, PAGE_W, PAGE_H, setGray, pdfStr,
  pdfStrLatin1, STATUS_LABEL, ensureSpace, titledFilename, drawElementTitle, type PdfResult } from './utils';

const M = 20;

/** Nombre de archivo por defecto cuando el título va vacío. Fuente única
 *  compartida por el exportador y el TitlePromptModal (preview). */
export function isolatedFootingFallbackFilename(): string {
  return 'zapata-aislada.pdf';
}

export async function exportIsolatedFootingPDF(
  inp: IsolatedFootingInputs,
  result: IsolatedFootingResult,
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

  const doc = await crearPdf();

  // ── Header ──────────────────────────────────────────────────────────────────
  const titleBaseY = drawElementTitle(doc, elementTitle, 'Concreta - Zapata aislada', M);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  setGray(doc, 120);
  doc.text(`Generado: ${new Date().toLocaleDateString('es-ES')}`, M, titleBaseY + 5);

  doc.setLineWidth(0.3);
  setGray(doc, 200);
  doc.line(M, titleBaseY + 8, PAGE_W - M, titleBaseY + 8);

  // ── Datos de entrada, a dos columnas de ancho completo ───────────────────────
  // Los tres dibujos se han ido a sus propias páginas: a 80 mm de ancho un
  // rótulo de 10 px salía a 2 mm (5,7 pt) y no se leía en papel. Aquí queda el
  // documento —datos y comprobaciones— y detrás va el lienzo a plana entera.
  const COL_A = M;
  const COL_B = M + 88;
  const SUB   = 38;                        // segunda sub-columna de cada grupo
  const LH    = 4.5;
  // `titleBaseY`, no `M`: con título la regla (titleBaseY+8) baja 5.5mm y pisaba
  // la primera cabecera de esta columna.
  const RY0 = titleBaseY + 14;
  let colX = COL_A;
  let ry = RY0;

  const secHeader = (label: string, badge?: { text: string }) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    setGray(doc, 60);
    doc.text(label, colX, ry);
    if (badge) {
      // mono caps badge after the section header (per plan §4.5.1).
      // El ancho del título se mide ANTES de cambiar de fuente: getTextWidth
      // usa la fuente ACTIVA, y al medirlo con courier 6.5 (más estrecha que
      // helvetica bold 7.5) la insignia arrancaba demasiado a la izquierda y se
      // montaba sobre el propio "CARGAS".
      const labelW = doc.getTextWidth(label);
      doc.setFont('courier', 'normal');
      doc.setFontSize(6.5);
      setGray(doc, 102);  // #666666
      // `courier` es una fuente CORE de jsPDF: Latin-1 y nada mas, asi que
      // la insignia se sanea con el saneador viejo. Con `pdfStr` un simbolo
      // Unicode saldria en UTF-16 y con el doble de ancho del declarado.
      doc.text(pdfStrLatin1(badge.text), colX + labelW + 2, ry);
    }
    ry += LH;
    doc.setFont('helvetica', 'normal');
    setGray(doc, 80);
  };

  const twoCol = (a: string, b = '') => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    setGray(doc, 80);
    doc.text(pdfStr(a), colX, ry);
    if (b) doc.text(pdfStr(b), colX + SUB, ry);
    ry += LH;
  };

  const gap = () => { ry += 2; };

  // 1. GEOMETRIA
  secHeader('GEOMETRIA');
  twoCol(`B = ${inp.B} m`,    `L = ${inp.L} m`);
  twoCol(`h = ${inp.h} m`,    `Df = ${inp.Df} m`);
  twoCol(`bc = ${inp.bc} m`,  `hc = ${inp.hc} m`);
  twoCol(`recubr. = ${inp.cover} mm`);
  gap();

  // 2. TENSION ADMISIBLE
  secHeader('TENSION ADMISIBLE');
  twoCol(`sigma_adm = ${fmtSi(inp.sigma_adm, 'soilPressure')}`);
  gap();

  // 3. CARGAS — with mode badge
  const modeBadge = inp.loadsAreFactored
    ? `[MAYORADAS · gamma=${inp.loadFactor}]`
    : `[SIN MAYORAR · gamma=${inp.loadFactor}]`;
  secHeader('CARGAS', { text: modeBadge });
  twoCol(`N = ${fmtSi(inp.N, 'force')}`,    `H = ${fmtSi(inp.H, 'force')}`);
  twoCol(`Mx = ${fmtSi(inp.Mx, 'moment')}`, `My = ${fmtSi(inp.My, 'moment')}`);
  const finColA = ry;

  // La segunda columna arranca a la altura de la primera.
  colX = COL_B;
  ry = RY0;

  // 4. MATERIALES
  secHeader('MATERIALES');
  twoCol(`fck = ${inp.fck} MPa`, `fyk = ${inp.fyk} MPa`);
  gap();

  // 5. ARMADURA
  secHeader('ARMADURA');
  twoCol(`Barras x: ph${inp.phi_x}@${inp.s_x}mm`, `As,x = ${result.As_prov_x.toFixed(0)} mm2/m`);
  twoCol(`Barras y: ph${inp.phi_y}@${inp.s_y}mm`, `As,y = ${result.As_prov_y.toFixed(0)} mm2/m`);
  gap();

  // 6. SUELO
  secHeader('SUELO');
  twoCol(`gamma_s = ${inp.gamma_soil_kN_m3} kN/m3`, `mu = ${inp.mu_friction.toFixed(2)}`);

  // ── Cargas derivadas (full-width 2-col SLS|ELU) ──────────────────────────────
  const derY = Math.max(finColA, ry) + 6;
  doc.setLineWidth(0.3);
  setGray(doc, 180);
  doc.line(M, derY - 2, PAGE_W - M, derY - 2);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  setGray(doc, 60);
  doc.text('CARGAS DERIVADAS', M, derY + 3);

  // Sub-headers
  const SLS_X = M;
  const ELU_X = M + 90;
  const SLS_X2 = SLS_X + 35;
  const ELU_X2 = ELU_X + 35;
  let dy = derY + 8;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  setGray(doc, 100);
  doc.text('SLS (suelo)', SLS_X, dy);
  doc.text('ELU (armado)', ELU_X, dy);
  dy += 4;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  setGray(doc, 80);
  doc.text(pdfStr(`N_sls = ${fmtSi(result.N_sls, 'force')}`),   SLS_X,  dy);
  doc.text(pdfStr(`H_sls = ${fmtSi(result.H_sls, 'force')}`),   SLS_X2, dy);
  doc.text(pdfStr(`N_elu = ${fmtSi(result.N_elu, 'force')}`),   ELU_X,  dy);
  doc.text(pdfStr(`H_elu = ${fmtSi(result.H_elu, 'force')}`),   ELU_X2, dy);
  dy += LH;
  doc.text(pdfStr(`Mx_sls = ${fmtSi(result.Mx_sls, 'moment')}`), SLS_X,  dy);
  doc.text(pdfStr(`My_sls = ${fmtSi(result.My_sls, 'moment')}`), SLS_X2, dy);
  doc.text(pdfStr(`Mx_elu = ${fmtSi(result.Mx_elu, 'moment')}`), ELU_X,  dy);
  doc.text(pdfStr(`My_elu = ${fmtSi(result.My_elu, 'moment')}`), ELU_X2, dy);
  dy += LH;

  // Distribution + tensions summary line
  const distLabel = ({
    trapezoidal:           'trapecial',
    bitriangular_uniaxial: 'bitri uniaxial',
    bitriangular_biaxial:  'bitri biaxial',
    overturning_fail:      'vuelco geometrico',
  } as const)[result.distributionType];
  const sigmaMaxStr = result.sigma_max === Infinity ? '∞' : fmtSi(result.sigma_max, 'soilPressure');
  const sigmaMinStr = result.distributionType === 'overturning_fail'
    ? '—'
    : result.distributionType === 'trapezoidal'
      ? fmtSi(result.sigma_min, 'soilPressure')
      : '0 (despegue)';
  doc.text(pdfStr(`Distribucion: ${distLabel}`), SLS_X, dy);
  doc.text(pdfStr(`sigma_max = ${sigmaMaxStr}`), ELU_X, dy);
  doc.text(pdfStr(`sigma_min = ${sigmaMinStr}`), ELU_X2, dy);
  dy += LH;

  // FS row
  const fsX = result.FS_overturn_x === Infinity ? '∞' : result.FS_overturn_x.toFixed(2);
  const fsY = result.FS_overturn_y === Infinity ? '∞' : result.FS_overturn_y.toFixed(2);
  const fsS = result.FS_sliding === Infinity ? '∞' : result.FS_sliding.toFixed(2);
  // pdfStr: el '∞' de un FS infinito no es Latin-1 y sin sanear arrastraba la
  // línea entera a UTF-16 (doble de ancho + basura).
  doc.text(pdfStr(`FS_vuelco_x = ${fsX}`), SLS_X,  dy);
  doc.text(pdfStr(`FS_vuelco_y = ${fsY}`), SLS_X2, dy);
  doc.text(pdfStr(`FS_desliz = ${fsS}`),   ELU_X,  dy);
  doc.text(pdfStr(`Clasif: ${result.isRigid ? 'rigida' : 'flexible'}`), ELU_X2, dy);
  dy += LH;

  // ── Checks table ─────────────────────────────────────────────────────────────
  const tableY = dy + 4;

  doc.setLineWidth(0.3);
  setGray(doc, 180);
  doc.line(M, tableY - 2, PAGE_W - M, tableY - 2);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  setGray(doc, 60);
  doc.text('VERIFICACIONES', M, tableY + 3);

  const hasFail = result.checks.some((c) => c.status === 'fail');
  const hasWarn = result.checks.some((c) => c.status === 'warn');
  const overall = hasFail ? 'fail' : hasWarn ? 'warn' : 'ok';

  doc.setFontSize(11);
  setGray(doc, 30);
  doc.text(STATUS_LABEL[overall], PAGE_W - M, tableY + 3, { align: 'right' });

  const COL = {
    desc:   M,
    value:  M + 82,
    limit:  M + 118,
    util:   M + 150,      // borde DERECHO (align:'right')
    status: PAGE_W - M,   // borde DERECHO (align:'right')
  };

  let rowY = tableY + 9;

  // Re-drawable column header — invoked on each page so a continuation page
  // still labels its columns. Returns the y to continue from. (Used by
  // ensureSpace as onNewPage callback below — replaces the previous silent
  // `if (rowY > PAGE_H - M - 10) break;` which dropped checks on overflow.)
  const drawChecksHeader = (atY: number): number => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    setGray(doc, 100);
    doc.text('Verificacion', COL.desc,   atY);
    doc.text('Valor',        COL.value,  atY);
    doc.text('Limite',       COL.limit,  atY);
    doc.text('Ut%',          COL.util,   atY, { align: 'right' });
    doc.text('Estado',       COL.status, atY, { align: 'right' });
    const lineY = atY + 2;
    doc.setLineWidth(0.2);
    setGray(doc, 160);
    doc.line(M, lineY, PAGE_W - M, lineY);
    return lineY + 5;
  };

  rowY = drawChecksHeader(rowY);

  // Paso de fila. 6,5 mm y no 7: con 7 la última comprobación se iba sola a una
  // segunda página por 1 mm (medido con el caso de 16 filas, que es el de una
  // zapata flexible con momento y cortante).
  const ALTO_FILA = 6.5;

  for (const ch of result.checks) {
    // Predictive page break: each row is ALTO_FILA tall (text + separator). On
    // overflow, addPage + redraw header. NEVER silently break out of the loop:
    // a signed legal document must document every check.
    rowY = ensureSpace(doc, rowY, ALTO_FILA, M, drawChecksHeader);
    const isFail = ch.status === 'fail';
    const isWarn = ch.status === 'warn';
    const textG  = isFail ? 180 : isWarn ? 120 : 60;

    doc.setFont('helvetica', isFail || isWarn ? 'bold' : 'normal');
    doc.setFontSize(7.5);
    setGray(doc, 60);
    doc.text(pdfStr(ch.description), COL.desc, rowY, { maxWidth: 78 });

    setGray(doc, 80);
    doc.text(pdfStr(checkValueStr(ch)), COL.value, rowY);
    doc.text(pdfStr(checkLimitStr(ch)), COL.limit, rowY);
    setGray(doc, textG);
    const utStr = !isFinite(ch.utilization)
      ? pdfStr('∞')
      : `${(ch.utilization * 100).toFixed(0)}%`;
    doc.text(utStr, COL.util, rowY, { align: 'right' });
    doc.text(STATUS_LABEL[ch.status], COL.status, rowY, { align: 'right' });

    setGray(doc, 220);
    doc.line(M, rowY + 2, PAGE_W - M, rowY + 2);
    rowY += ALTO_FILA;
  }

  // ── Páginas de lienzo: una por vista, a plana entera ─────────────────────────
  // Cada dibujo va solo en su página para poder ir a 170 mm de ancho. El clon
  // oculto se sirve a 560 px, así que un rótulo de 10 px sale a 3 mm (8,6 pt).
  const paginasLienzo: Array<{ id: string; titulo: string; pie: string }> = [
    {
      id: 'isolated-footing-svg-pdf',
      titulo: 'TERRENO — TENSIONES EN SERVICIO',
      pie: 'El diagrama se dibuja a escala de sigma_adm: la linea de trazos es el limite del geotecnico.',
    },
    {
      id: 'isolated-footing-svg-pdf-armado',
      titulo: 'ARMADO — PARRILLA INFERIOR',
      pie: 'Canto util d = h - recubrimiento - diametro/2. La cota de anclaje compara lbd con el vuelo disponible.',
    },
    {
      id: 'isolated-footing-svg-pdf-modelo',
      titulo: result.isRigid
        ? 'MODELO DE CALCULO — ZAPATA RIGIDA (BIELA-TIRANTE)'
        : 'MODELO DE CALCULO — ZAPATA FLEXIBLE (FLEXION Y CORTANTE)',
      pie: result.isRigid
        ? 'v <= 2h: el armado lo rige el tirante del modelo de bielas (CE Anejo 19 art. 6.5).'
        : 'v > 2h: flexion en la cara del pilar (S1), cortante a d (S2) y punzonamiento en u1 (a 2d).',
    },
  ];

  for (const { id, titulo, pie } of paginasLienzo) {
    const nodo = document.getElementById(id)?.querySelector('svg') as SVGSVGElement | null;
    if (!nodo) continue;

    doc.addPage();

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    setGray(doc, 30);
    doc.text(pdfStr(elementTitle || 'Concreta - Zapata aislada'), M, M);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    setGray(doc, 60);
    doc.text(titulo, M, M + 5);
    doc.setLineWidth(0.3);
    setGray(doc, 200);
    doc.line(M, M + 8, PAGE_W - M, M + 8);

    const dW = PAGE_W - 2 * M;
    // El alto sale del viewBox del propio clon: cada vista es de una altura y
    // una proporción fija aquí recortaría el dibujo o lo dejaría flotando.
    const dH = Math.min(svgBoxHeight(nodo, dW), PAGE_H - M - (M + 14) - 10);
    await embedSvgAsImage(doc, nodo, { x: M, y: M + 14, width: dW, height: dH });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    setGray(doc, 120);
    doc.text(pdfStr(pie), M, M + 14 + dH + 5, { maxWidth: dW });
  }

  // ── Pie de todas las páginas ────────────────────────────────────────────────
  const totalPaginas = doc.getNumberOfPages();
  for (let p = 1; p <= totalPaginas; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    setGray(doc, 160);
    doc.text(
      `Concreta — CTE DB-SE-C / CE  ·  gamma_aplicado=${inp.loadFactor} (CTE DB-SE 4.2.4)`,
      M, PAGE_H - M,
    );
    doc.text(`Pagina ${p} de ${totalPaginas}`, PAGE_W - M, PAGE_H - M, { align: 'right' });
  }

  const filename = titledFilename(elementTitle, isolatedFootingFallbackFilename());
  const blob = doc.output('blob');
  const blobUrl = URL.createObjectURL(blob);
  const pageCount = doc.getNumberOfPages();
  return { blobUrl, filename, pageCount };
}
