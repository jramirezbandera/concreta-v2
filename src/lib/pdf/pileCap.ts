// PDF export for Encepados de Micropilotes module.
// jsPDF + svg2pdf.js — A4 portrait, margins 20mm.
// jsPDF built-in fonts (Helvetica) only cover latin-1; replace non-latin chars.

import { crearPdf } from './fuente';
import { type PileCapInputs } from '../../data/defaults';
import { type PileCapResult } from '../../lib/calculations/pileCap';
import { embedSvgAsImage, svgBoxHeight, PAGE_W, PAGE_H, setGray, pdfStr, STATUS_LABEL, ensureSpace, titledFilename, drawElementTitle, type PdfResult } from './utils';
import { checkValueStr, checkLimitStr } from '../calculations/checkFormat';
import { formatQuantity } from '../units/format';
import type { Quantity, UnitSystem } from '../units/types';

const M = 20;  // mm margin

/** Nombre de archivo por defecto cuando el título va vacío. Fuente única
 *  compartida por el exportador y el TitlePromptModal (preview). */
export function pileCapFallbackFilename(inp: PileCapInputs): string {
  const n = inp.n as number;
  return `concreta-encepado-${n}p-${new Date().toISOString().slice(0, 10)}.pdf`;
}

export async function exportPileCapPDF(
  inp: PileCapInputs,
  result: PileCapResult,
  system: UnitSystem = 'si',
  title?: string,
): Promise<PdfResult> {
  const elementTitle = title ?? inp.title ?? '';
  const fmtSi = (v: number, q: Quantity, precision = 1) =>
    formatQuantity(v, q, system, { precision });
  const doc = await crearPdf();

  const n       = inp.n as number;
  const phi_tie = inp.phi_tie as number;
  const modeLabel = `Encepado ${n} micropilotes — bielas y tirantes`;

  // ── Header ─────────────────────────────────────────────────────────────────
  const titleBaseY = drawElementTitle(doc, elementTitle, `Concreta - ${modeLabel}`, M);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  setGray(doc, 120);
  doc.text(`Generado: ${new Date().toLocaleDateString('es-ES')}`, M, titleBaseY + 5);

  doc.setLineWidth(0.3);
  setGray(doc, 200);
  doc.line(M, titleBaseY + 8, PAGE_W - M, titleBaseY + 8);

  // ── Figura: planta Y sección, una debajo de otra ─────────────────────
  //
  // `querySelectorAll`, no `querySelector`: el clon oculto trae las DOS vistas
  // —la planta y la sección transversal— y quedarse con la primera dejaba la
  // sección fuera del PDF sin que nadie lo notara, con su hueco reservado en
  // blanco (la caja era de 85 × 110 mm: la de las dos juntas).
  //
  // Cada vista va en una caja de SU proporción (`svgBoxHeight`). Meterlas en
  // una caja de otra forma no las agranda: las centra con franjas en blanco a
  // los lados, que era la otra mitad de «el dibujo sale minúsculo».
  const svgContainer = document.getElementById('pile-cap-svg-pdf');
  const svgEls = Array.from(svgContainer?.querySelectorAll('svg') ?? []) as SVGSVGElement[];

  const SVG_W = 85;      // mm — ancho de la columna de la figura
  const svgX  = M;
  const svgY  = titleBaseY + 12;
  const CAPTION = 3.5;   // mm del rótulo de cada vista
  const GAP     = 3;     // mm entre vistas

  // ── Right column: inputs + key results ─────────────────────────────────────
  const COL_R  = M + 93;
  const COL_R2 = COL_R + 42;
  const LH     = 4.5;
  // `titleBaseY`, no `M`: con título la regla (titleBaseY+8) baja 5.5mm y pisaba
  // la primera cabecera de esta columna.
  let ry = titleBaseY + 14;

  const secHeader = (label: string) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    setGray(doc, 60);
    doc.text(label, COL_R, ry);
    ry += LH;
    doc.setFont('helvetica', 'normal');
    setGray(doc, 80);
  };

  // Las dos celdas se parten a su ancho Útil en vez de escribirse a pelo: la
  // de la derecha acaba en el margen de la página, y con 6 micropilotes
  // «As,y = 13 ph12 (1470 mm^2)» se salía 1,2 mm por fuera. Al partirse, la
  // fila crece hacia abajo en vez de hacia fuera.
  const W_A = COL_R2 - COL_R - 2;
  const W_B = PAGE_W - M - COL_R2;
  const twoCol = (a: string, b: string) => {
    doc.setFontSize(8);
    const la = doc.splitTextToSize(pdfStr(a), W_A) as string[];
    const lb = b ? (doc.splitTextToSize(pdfStr(b), W_B) as string[]) : [];
    la.forEach((t, i) => doc.text(t, COL_R, ry + i * LH));
    lb.forEach((t, i) => doc.text(t, COL_R2, ry + i * LH));
    ry += Math.max(la.length, lb.length, 1) * LH;
  };

  const gap = () => { ry += 2; };

  // ENTRADA
  const plateOn = (inp.plate_on as boolean | undefined) ?? false;
  secHeader('ENTRADA');
  twoCol(`n = ${n} micropilotes`, `d_p = ${inp.d_p} mm`);
  if (plateOn) {
    twoCol(
      `Placa reparto: ${inp.plate_shape === 'cuad' ? 'cuadrada' : 'circular'}`,
      `${inp.plate_shape === 'cuad' ? 'lado' : 'D'} = ${inp.d_plate} mm`,
    );
  }
  twoCol(n === 6 ? `s_y = ${inp.s} / s_x = ${inp.s_x} mm` : `s = ${inp.s} mm`, `h = ${inp.h_enc} mm`);
  twoCol(`fck = ${inp.fck} MPa`, `fyk = ${inp.fyk} MPa`);
  twoCol(`N_Ed = ${fmtSi(inp.N_Ed, 'force')}`, `R_adm = ${fmtSi(inp.R_adm, 'force')}`);
  if (inp.Mx_Ed !== 0) twoCol(`Mx = ${fmtSi(inp.Mx_Ed, 'moment', 2)}`, `My = ${fmtSi(inp.My_Ed, 'moment', 2)}`);
  gap();

  // GEOMETRIA ENCEPADO — indica si las dims en planta son auto o del usuario
  const dimsAuto = (inp.dims_auto as boolean | undefined) ?? true;
  secHeader(dimsAuto ? 'GEOMETRIA ENCEPADO (DIMS. AUTO)' : 'GEOMETRIA ENCEPADO (DIMS. USUARIO)');
  if (n === 3) {
    // Planta triangular achaflanada: la cota es e; Lx x Ly solo es la envolvente
    twoCol('Planta triangular (chaflanes a e)', `envolv. ${result.L_x.toFixed(0)} x ${result.L_y.toFixed(0)} mm`);
  } else {
    twoCol(`Lx = ${result.L_x.toFixed(0)} mm`, `Ly = ${result.L_y.toFixed(0)} mm`);
  }
  twoCol(`e_borde = ${result.e_borde.toFixed(0)} mm`, `h_min = ${result.h_min.toFixed(0)} mm`);
  twoCol(`A_planta = ${(result.A_cap / 1e6).toFixed(2)} m2`, '');
  gap();

  // BIELAS Y TIRANTES
  secHeader('BIELAS Y TIRANTES (CE Anejo 19 §6.5)');
  twoCol(`th = ${result.theta_deg.toFixed(1)} deg`, `z_eff = ${result.z_eff.toFixed(0)} mm`);
  // Apoyo del nodo comprimido: placa de reparto o seccion del micro
  twoCol(
    plateOn
      ? `Nodo: placa ${inp.plate_shape === 'cuad' ? 'cuadrada' : 'circular'} ${inp.d_plate} mm`
      : `Nodo: micro d_p = ${inp.d_p} mm`,
    `A_nodo = ${result.A_node.toFixed(0)} mm2`,
  );
  twoCol(`sigma_biela = ${result.sigma_strut.toFixed(2)} MPa`, `sigma_Rd = ${result.sigma_Rd_max.toFixed(2)} MPa`);
  twoCol(`Ft,x = ${fmtSi(result.Ft_x, 'force')}`,
    result.Ft_y !== null ? `Ft,y = ${fmtSi(result.Ft_y, 'force')}` : '');
  gap();

  // ARMADURA TIRANTES
  secHeader('ARMADURA TIRANTES');
  twoCol(`fyd = ${result.fyd.toFixed(0)} MPa (tope EHE)`, '');
  twoCol(
    `As,x = ${result.n_bars_x} ph${phi_tie} (${result.As_prov_x.toFixed(0)} mm^2)`,
    result.n_bars_y !== null
      ? `As,y = ${result.n_bars_y} ph${phi_tie} (${result.As_prov_y?.toFixed(0)} mm^2)`
      : '',
  );
  // Cuando el nº de barras lo pone el usuario se deja dicho, y con cuál era el
  // mínimo al lado: en el documento que se entrega tiene que verse que las
  // barras de más están puestas a propósito, no por descuido.
  const barsAuto = (inp.bars_auto as boolean | undefined) ?? true;
  if (!barsAuto) {
    twoCol(
      'Barras: puestas a mano',
      result.n_bars_min_y !== null
        ? `minimo ${result.n_bars_min_x} en x, ${result.n_bars_min_y} en y`
        : `minimo ${result.n_bars_min_x}`,
    );
  }
  if (n === 2) {
    // Con 2 pilotes el tirante barre todo el ancho y comparte capa con la malla
    // inferior: el As,min de seccion lo cubren las dos, y la separacion que
    // manda es la de la capa completa.
    twoCol(
      `Malla inf. x = ${result.As_g_x_inf.toFixed(0)} mm^2`,
      `Total inf. x = ${result.As_bot_tot_x.toFixed(0)} mm^2`,
    );
    twoCol(
      `As,min sec. = ${result.As_min_x.toFixed(0)} mm^2`,
      `s capa inf. = ${result.s_layer_x.toFixed(0)} mm`,
    );
  }
  twoCol(`s_bar,x = ${result.s_bar_x.toFixed(0)} mm`, `s_max = ${result.s_max.toFixed(0)} mm`);
  twoCol(`lb,req = ${result.lb_net.toFixed(0)} mm`, `lb,disp = ${result.lb_avail.toFixed(0)} mm`);
  gap();

  // ARMADURA SECUNDARIA — dispuesta por el usuario vs mínimo ex-EHE 58.4.1.4
  // EHE-08 art. 58.4.1.2 (el CE no fija minimos propios): 2 pilotes → 58.4.1.2.1.2;
  // 3 y 4 → 58.4.1.2.2. Lo no exigido para ese n se lista sin requerido.
  if (n === 2) {
    secHeader('ARMADURA SECUNDARIA (disp. / req., EHE-08 58.4.1.2.1.2)');
    twoCol(`Superior ${inp.n_top} ph${inp.phi_top}`, `${result.As_top_prov.toFixed(0)} / ${result.As_top_req.toFixed(0)} mm2`);
    twoCol(`Cercos ph${inp.phi_cv} c/${inp.s_cv} x${inp.n_cv}`, `${result.As_cv_prov.toFixed(0)} / ${result.As_cv_req.toFixed(0)} mm2/m`);
    twoCol(`Horiz. caras ph${inp.phi_ch} c/${inp.s_ch}`, `${result.As_ch_prov.toFixed(0)} / ${result.As_ch_req.toFixed(0)} mm2/m`);
    twoCol(`Malla sup+inf ph${inp.phi_g} c/${inp.s_g}`, `${result.As_g_prov.toFixed(0)} mm2/m por cara`);
  } else {
    secHeader('ARMADURA SECUNDARIA (disp. / req., EHE-08 58.4.1.2.2)');
    twoCol(`Malla sup+inf ph${inp.phi_g} c/${inp.s_g}`, `${result.As_g_prov.toFixed(0)} / ${result.As_g_req.toFixed(0)} mm2/m`);
    twoCol(`Cercos banda ph${inp.phi_cv} c/${inp.s_cv} x${inp.n_cv}`, `${result.As_cv_prov.toFixed(0)} / ${result.As_cv_req.toFixed(0)} mm2/m`);
    twoCol(`Sup. ${inp.n_top}ph${inp.phi_top}, caras ph${inp.phi_ch}c/${inp.s_ch}`, 'no exigidas');
  }

  // CUANTIA GEOMETRICA (EHE-08 42.3.5 + 58.8.2)
  gap();
  secHeader('CUANTIA GEOMETRICA (EHE-08 42.3.5 y 58.8.2)');
  twoCol(`rho x = ${(result.rho_x * 1000).toFixed(2)} por mil`, `rho y = ${(result.rho_y * 1000).toFixed(2)} por mil`);
  twoCol(`minimo ${(result.rho_min * 1000).toFixed(1)} por mil (B${inp.fyk})`, `hueco max ${result.hueco_max.toFixed(0)} mm`);

  // ── La figura, ya sabiendo hasta dónde baja la columna de datos ────────
  //
  // El alto disponible es el de la columna de la derecha: la figura ocupa la
  // columna izquierda y las dos acaban a la vez, de modo que la tabla empieza
  // donde acabe la más larga y no queda hueco muerto. Si las dos vistas a 85
  // mm de ancho no caben en ese alto (plantas muy alargadas), se estrechan las
  // dos lo justo para que quepan, que es preferible a recortar una.
  const ROTULOS = ['PLANTA', 'SECCIÓN TRANSVERSAL'];
  const altoDisponible = Math.max(110, ry + 4 - svgY);
  let figH = 0;
  if (svgEls.length > 0) {
    const altos = svgEls.map((el) => svgBoxHeight(el, SVG_W));
    const bruto = altos.reduce((a, b) => a + b, 0)
      + svgEls.length * CAPTION + (svgEls.length - 1) * GAP;
    const k = bruto > altoDisponible ? altoDisponible / bruto : 1;
    const anchoFig = SVG_W * k;
    let yFig = svgY;
    for (let i = 0; i < svgEls.length; i++) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      setGray(doc, 120);
      doc.text(pdfStr(ROTULOS[i] ?? ''), svgX, yFig + CAPTION - 1);
      yFig += CAPTION;
      const h = altos[i] * k;
      await embedSvgAsImage(doc, svgEls[i], { x: svgX, y: yFig, width: anchoFig, height: h });
      yFig += h + (i < svgEls.length - 1 ? GAP : 0);
    }
    figH = yFig - svgY;
  }

  // ── Divider + checks table ──────────────────────────────────────────────────
  // Empieza bajo la figura o bajo la columna derecha, lo que quede mas abajo:
  // con Mx, placa y la secundaria la columna ya baja mas que la figura.
  const tableY = Math.max(svgY + figH + 6, ry + 4);

  doc.setLineWidth(0.3);
  setGray(doc, 180);
  doc.line(M, tableY - 2, PAGE_W - M, tableY - 2);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  setGray(doc, 60);
  doc.text('VERIFICACIONES', M, tableY + 3);

  // Overall verdict
  const hasFail = result.checks.some((c) => c.status === 'fail');
  const hasWarn = result.checks.some((c) => c.status === 'warn');
  const overall = hasFail ? 'fail' : hasWarn ? 'warn' : 'ok';

  doc.setFontSize(11);
  setGray(doc, 30);
  doc.text(STATUS_LABEL[overall], PAGE_W - M, tableY + 3, { align: 'right' });

  // `COL` es el origen de cada celda y `CW` su ancho ÚTIL. Todo texto se parte
  // a ese ancho (celdas multilínea), que es lo que faltaba: con 3 o más
  // micropilotes hay descripciones de 90 caracteres —«Retícula inferior entre
  // bandas Ø12 c/100 (capacidad por sentido ≥ 1/4 de las bandas)»— que,
  // escritas sin medir, se metían dentro de la columna Valor y se leían
  // encabalgadas con el número. Mismo arreglo que micropilotes y muros.
  const COL = {
    desc:   M,
    value:  M + 80,
    limit:  M + 112,
    util:   M + 148,      // borde DERECHO (align:'right')
    status: PAGE_W - M,   // borde DERECHO (align:'right')
  };
  const CW = { desc: 78, value: 30, limit: 28 };
  const LH_CELDA = 3.2;   // interlínea dentro de una celda

  let rowY = tableY + 9;

  // Re-drawable column header — repeated on each continuation page so the
  // reader sees Valor/Limite/Ut%/Estado labels above continuation rows.
  // (Previously the page break only ran addPage without redrawing, leaving
  // anonymous columns on page 2+.)
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
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    return lineY + 5;
  };

  rowY = drawChecksHeader(rowY);

  for (const chk of result.checks) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    // checkValueStr/checkLimitStr y no `chk.value`: las filas construidas con
    // `makeCheckQty` (la biela y el nodo bajo el pilar, que llevan tensiones)
    // sólo traen el par numérico valueNum/valueQty, así que leyendo el campo
    // legacy salían con las columnas Valor y Límite EN BLANCO —dos
    // comprobaciones sin números en el documento que se entrega—. Y de paso
    // se formatean en el sistema de unidades activo.
    const descL = doc.splitTextToSize(pdfStr(chk.description), CW.desc) as string[];
    const valL  = doc.splitTextToSize(pdfStr(checkValueStr(chk, system)), CW.value) as string[];
    const limL  = doc.splitTextToSize(pdfStr(checkLimitStr(chk, system)), CW.limit) as string[];
    const nLines = Math.max(descL.length, valL.length, limL.length, 1);
    // Avance de fila: (n−1) interlíneas + artículo (4) + regla (3) + hueco (4).
    const rowH = (nLines - 1) * LH_CELDA + 11;

    // Salto de página predictivo, con la cabecera repetida.
    rowY = ensureSpace(doc, rowY, rowH, M, drawChecksHeader);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);

    const st = chk.status;
    setGray(doc, 50);
    descL.forEach((t, i) => doc.text(t, COL.desc,  rowY + i * LH_CELDA));
    valL .forEach((t, i) => doc.text(t, COL.value, rowY + i * LH_CELDA));
    limL .forEach((t, i) => doc.text(t, COL.limit, rowY + i * LH_CELDA));
    // Las filas informativas (la placa de reparto, la secundaria no exigida)
    // no tienen utilización: escribir «0%» las hacía parecer comprobadas y
    // sobradas.
    const utilStr = st === 'neutral' || !isFinite(chk.utilization)
      ? '—'
      : `${(chk.utilization * 100).toFixed(0)}%`;
    doc.text(utilStr, COL.util, rowY, { align: 'right' });
    doc.setFont('helvetica', 'bold');
    setGray(doc, st === 'ok' ? 60 : 30);
    doc.text(STATUS_LABEL[st], COL.status, rowY, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    setGray(doc, 50);

    rowY += (nLines - 1) * LH_CELDA + 4;
    doc.setFontSize(6);
    setGray(doc, 160);
    doc.text(pdfStr(chk.article), COL.desc + 2, rowY);
    doc.setFontSize(7);
    setGray(doc, 50);

    rowY += 3;
    doc.setLineWidth(0.1);
    setGray(doc, 215);
    doc.line(M, rowY, PAGE_W - M, rowY);
    rowY += 4;
  }

  // ── Figura de armado (planta + secciones + leyenda), en una sola imagen ───
  const rebarContainer = document.getElementById('pile-cap-rebar-svg-pdf');
  const rebarEl = rebarContainer?.querySelector('svg') as SVGSVGElement | null;
  if (rebarEl) {
    const REBAR_W = PAGE_W - 2 * M;
    const REBAR_H = svgBoxHeight(rebarEl, REBAR_W);
    rowY = ensureSpace(doc, rowY + 2, REBAR_H + 8, M);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    setGray(doc, 60);
    doc.text('ARMADO', M, rowY + 3);
    await embedSvgAsImage(doc, rebarEl, { x: M, y: rowY + 6, width: REBAR_W, height: REBAR_H });
  }

  // ── Footer (every page) ─────────────────────────────────────────────────────
  // Previously hardcoded "Pagina 1" + only rendered on the active page after
  // pagination, so continuation pages had no footer AND the last page lied
  // about being page 1. Now: render on every page with correct N/M.
  const pageCount = doc.getNumberOfPages();
  const footerY = PAGE_H - 10;
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    setGray(doc, 150);
    doc.text('Concreta - concreta.app | CE Anejo 19 §6.5 / CTE DB-SE-C', M, footerY);
    doc.text(`Pagina ${i}/${pageCount}`, PAGE_W - M, footerY, { align: 'right' });
  }

  const filename = titledFilename(elementTitle, pileCapFallbackFilename(inp));
  const blob = doc.output('blob');
  const blobUrl = URL.createObjectURL(blob);
  return { blobUrl, filename, pageCount };
}
