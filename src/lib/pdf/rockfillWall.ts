// Informe PDF — Muro de escollera / gaviones (Guía Fomento 2006 + CTE DB-SE-C).
// Usa la API moderna de utils.ts (drawHeader/drawTable/drawFootersAllPages/
// embedSvgAsImage/ensureSpace) — no dibujo manual de tablas.

import jsPDF from 'jspdf';
import type { RockfillWallInputs } from '../../data/defaults';
import type { RockfillWallResult, CourseCutPoint } from '../calculations/rockfillWall';
import { checkValueStr, checkLimitStr, overallStatus } from '../calculations/checkFormat';
import type { CheckRow } from '../calculations/types';
import { formatQuantity } from '../units/format';
import type { UnitSystem } from '../units/types';
import {
  PAGE_W,
  setGray,
  pdfStr,
  titledFilename,
  drawHeader,
  drawFootersAllPages,
  drawTable,
  ensureSpace,
  embedSvgAsImage,
  inputsFingerprint,
  STATUS_LABEL,
  type PdfResult,
  type TableCol,
} from './utils';

const M = 18;

export function rockfillWallFallbackFilename(): string {
  return `muro-escollera-${new Date().toISOString().slice(0, 10)}.pdf`;
}

const statusGray = (s: string): number => (s === 'fail' ? 0 : s === 'warn' ? 60 : 110);

export async function exportRockfillWallPDF(
  inp: RockfillWallInputs,
  result: RockfillWallResult,
  system: UnitSystem = 'si',
  title?: string,
): Promise<PdfResult> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const isGavion = inp.wallType === 'gaviones';
  const headerMeta = {
    title: `Concreta - Muros de ${isGavion ? 'gaviones' : 'escollera'} - Guia Fomento 2006`,
    elementTitle: title ?? '',
    inputsHash: inputsFingerprint({ ...inp, title: undefined }),
  };
  const footerMeta = {};

  const fmt = (v: number, q: 'linearLoad' | 'soilPressure' | 'weightDensity' | 'areaLoad', p = 2) =>
    formatQuantity(v, q, system, { precision: p });

  // ── Página 1: portada — datos + SVG geometría + comprobaciones ───────────
  const { contentY } = drawHeader(doc, headerMeta, M);
  let y = contentY;

  if (!result.valid) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    setGray(doc, 80);
    doc.text('Datos no validos — no se ha podido verificar el muro', M, y + 20);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(pdfStr(result.error ?? ''), M, y + 28, { maxWidth: PAGE_W - 2 * M });
    drawFootersAllPages(doc, footerMeta, M);
    const blob = doc.output('blob');
    return {
      blobUrl: URL.createObjectURL(blob),
      filename: titledFilename(title ?? '', rockfillWallFallbackFilename()),
      pageCount: doc.getNumberOfPages(),
    };
  }

  // SVG de geometría en columna derecha
  const svgGeom = document.getElementById('rockfill-wall-svg-pdf')?.querySelector('svg') as SVGSVGElement | null;
  const SVG_W = 88;
  const SVG_H = 100;
  if (svgGeom) {
    await embedSvgAsImage(doc, svgGeom, { x: PAGE_W - M - SVG_W, y, width: SVG_W, height: SVG_H });
  }

  // Columna izquierda: datos de entrada
  const colW = PAGE_W - 2 * M - SVG_W - 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  setGray(doc, 40);
  doc.text('DATOS DE ENTRADA', M, y + 2);
  y += 6;

  const dataRow = (label: string, value: string) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    setGray(doc, 110);
    doc.text(pdfStr(label), M, y);
    setGray(doc, 30);
    doc.text(pdfStr(value), M + colW, y, { align: 'right' });
    y += 4.1;
  };

  dataRow('Tipologia', isGavion ? 'Gaviones' : 'Escollera colocada');
  dataRow('Altura del cuerpo H', `${(result.H_eff ?? inp.H).toFixed(2)} m`);
  dataRow('Ancho de coronacion a', `${inp.a.toFixed(2)} m`);
  if (isGavion) {
    dataRow('Filas de cajas', `${result.nRows} x ${inp.hCaja.toFixed(2)} m (escalon ${inp.stepCaja.toFixed(2)} m)`);
    dataRow('Contrainclinacion pila', `${inp.alphaBatter.toFixed(1)} deg`);
  } else {
    dataRow('Talud intrados / trasdos', `${inp.mIntra.toFixed(2)} / ${inp.mTras.toFixed(2)} H:1V`);
    dataRow('Contrainclinacion hiladas', `${inp.alphaHiladas.toFixed(1)} deg`);
  }
  dataRow('Cimiento hz / x0 / xT', `${inp.hz.toFixed(2)} / ${inp.x0.toFixed(2)} / ${inp.xT.toFixed(2)} m`);
  dataRow('Contrainclinacion base', `${inp.alphaBase.toFixed(1)} deg`);
  dataRow('Peso especifico aparente', fmt(inp.gammaAp, 'weightDensity'));
  dataRow('phi del muro', `${result.phiEff.toFixed(1)} deg${inp.phiMode === 'guia' ? ' (Guia 4.1.3)' : ''}`);
  dataRow('phi entre hiladas', `${result.phiPP.toFixed(1)} deg${inp.contactoMejorado ? '' : ' (2/3 phi)'}`);
  dataRow('Relleno: gamma / phi / delta', `${fmt(inp.gammaSuelo, 'weightDensity')} / ${inp.phiRelleno.toFixed(1)} / ${inp.delta.toFixed(1)} deg`);
  dataRow('Talud del terreno beta', `${inp.beta.toFixed(1)} deg`);
  dataRow('Sobrecarga q', fmt(inp.q, 'areaLoad'));
  dataRow('Tension admisible', fmt(inp.sigmaAdm, 'soilPressure', 3));
  dataRow('mu base / Ep', `${inp.muBase.toFixed(2)} / ${inp.usePassive ? 'considerado' : 'ignorado'}`);
  dataRow('Nivel freatico', inp.hasWater ? `hw = ${inp.hw.toFixed(2)} m` : 'sin NF');
  dataRow('Sismo', result.kh_derived > 0 ? `kh = ${result.kh_derived.toFixed(3)} · kv = ${result.kv_derived.toFixed(3)}` : 'no considerado');

  y += 2;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  setGray(doc, 40);
  doc.text('VALORES CALCULADOS', M, y + 2);
  y += 6;
  dataRow('Ka (Coulomb, plano virtual)', result.Ka.toFixed(4));
  if (result.KAD !== undefined) dataRow('KAD (Mononobe-Okabe)', result.KAD.toFixed(4));
  dataRow('Ea / EAH total', `${fmt(result.Ea, 'linearLoad', 1)} / ${fmt(result.EAH_total, 'linearLoad', 1)}`);
  dataRow('W muro / cimiento', `${fmt(result.W_muro, 'linearLoad', 1)} / ${fmt(result.W_cimiento, 'linearLoad', 1)}`);
  dataRow('Sum V / e', `${fmt(result.ΣV, 'linearLoad', 1)} / ${result.e.toFixed(3)} m`);
  dataRow("b' Meyerhof / sigma ref", `${result.bEq.toFixed(2)} m / ${fmt(result.sigma_ref, 'soilPressure', 3)}`);
  dataRow('FS vuelco / FS deslizamiento',
    `${isFinite(result.FS_vuelco) ? result.FS_vuelco.toFixed(2) : 'inf'} / ${isFinite(result.FS_desliz) ? result.FS_desliz.toFixed(2) : 'inf'}`);

  y = Math.max(y, contentY + SVG_H + 6);

  // Veredicto
  const overall = overallStatus(result.checks);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  setGray(doc, overall === 'fail' ? 0 : 40);
  doc.text(
    `VEREDICTO: ${STATUS_LABEL[overall]}`,
    M, y + 2,
  );
  y += 7;

  // Tabla de comprobaciones
  const checkCols: TableCol<CheckRow>[] = [
    { key: 'desc', label: 'Comprobacion', w: 62, render: (c) => pdfStr(c.description), wrap: true },
    { key: 'value', label: 'Valor', w: 34, render: (c) => pdfStr(checkValueStr(c, system)) },
    { key: 'limit', label: 'Limite', w: 34, render: (c) => pdfStr(checkLimitStr(c, system)) },
    {
      key: 'status', label: 'Estado', w: 22, align: 'center',
      render: (c) => STATUS_LABEL[c.status] ?? '',
      color: (c) => statusGray(c.status),
      bold: (c) => c.status === 'fail',
    },
    { key: 'art', label: 'Referencia', w: 22, render: (c) => pdfStr(c.article), wrap: true },
  ] as TableCol<CheckRow>[];

  y = drawTable(doc, {
    x: M,
    y,
    cols: checkCols,
    rows: result.checks,
    M,
  });

  // ── Página 2: cargas ─────────────────────────────────────────────────────
  doc.addPage('a4', 'portrait');
  const { contentY: y2 } = drawHeader(doc, headerMeta, M);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  setGray(doc, 40);
  doc.text('CARGAS Y EMPUJES', M, y2 + 2);
  const svgLoads = document.getElementById('rockfill-wall-svg-pdf-loads')?.querySelector('svg') as SVGSVGElement | null;
  if (svgLoads) {
    const w = PAGE_W - 2 * M;
    await embedSvgAsImage(doc, svgLoads, { x: M, y: y2 + 6, width: w, height: w * (460 / 560) });
  }

  // ── Página 3: hiladas ────────────────────────────────────────────────────
  doc.addPage('a4', 'portrait');
  const { contentY: y3raw } = drawHeader(doc, headerMeta, M);
  let y3 = y3raw;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  setGray(doc, 40);
  doc.text(isGavion ? 'COMPROBACION JUNTA A JUNTA' : 'COMPROBACION HILADA A HILADA', M, y3 + 2);
  const svgHiladas = document.getElementById('rockfill-wall-svg-pdf-hiladas')?.querySelector('svg') as SVGSVGElement | null;
  if (svgHiladas) {
    const w = PAGE_W - 2 * M;
    const h = w * (460 / 560) * 0.7;
    await embedSvgAsImage(doc, svgHiladas, { x: M, y: y3 + 6, width: w, height: h });
    y3 += 6 + h + 6;
  } else {
    y3 += 8;
  }

  // Tabla de cortes (cada 5º corte + el pésimo)
  const step = Math.max(1, Math.floor(result.courses.length / 10));
  const worstZs = new Set([result.worstSlide.z, result.worstOvert.z]);
  const rows = result.courses.filter((c, i) =>
    i === result.courses.length - 1 || i % step === step - 1 || worstZs.has(c.z));
  const courseCols: TableCol<CourseCutPoint>[] = [
    { key: 'z', label: 'z (m)', w: 20, align: 'right', render: (c) => c.z.toFixed(2) },
    { key: 'b', label: 'b (m)', w: 20, align: 'right', render: (c) => c.b.toFixed(2) },
    { key: 'N', label: 'N (kN/m)', w: 26, align: 'right', render: (c) => c.N.toFixed(1) },
    { key: 'Q', label: 'Q (kN/m)', w: 26, align: 'right', render: (c) => c.Q.toFixed(1) },
    { key: 'e', label: 'e (m)', w: 22, align: 'right', render: (c) => c.e.toFixed(3) },
    {
      key: 'is', label: 'I desliz.', w: 30, align: 'right',
      render: (c) => c.utilSlide.toFixed(2) + (worstZs.has(c.z) && c.z === result.worstSlide.z ? ' *' : ''),
      color: (c) => (c.utilSlide >= 1 ? 0 : 110),
      bold: (c) => c.utilSlide >= 1,
    },
    {
      key: 'iv', label: 'I vuelco', w: 30, align: 'right',
      render: (c) => c.utilOvert.toFixed(2) + (worstZs.has(c.z) && c.z === result.worstOvert.z ? ' *' : ''),
      color: (c) => (c.utilOvert >= 1 ? 0 : 110),
      bold: (c) => c.utilOvert >= 1,
    },
  ];
  y3 = ensureSpace(doc, y3, 20, M);
  y3 = drawTable(doc, { x: M, y: y3, cols: courseCols, rows, M });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  setGray(doc, 140);
  doc.text(pdfStr('* corte pesimo · indices con coeficiente de seguridad incluido (gammaR = 1.5 deslizamiento, gammav = 2 vuelco); limite 1.0'), M, y3 + 4);

  drawFootersAllPages(doc, footerMeta, M);
  const blob = doc.output('blob');
  return {
    blobUrl: URL.createObjectURL(blob),
    filename: titledFilename(title ?? '', rockfillWallFallbackFilename()),
    pageCount: doc.getNumberOfPages(),
  };
}
