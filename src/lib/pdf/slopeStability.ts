// PDF export del módulo de Estabilidad de taludes (Geotecnia).
// jsPDF — A4 retrato, márgenes 20 mm. Figuras rasterizadas (embedSvgAsImage)
// porque los estratos y el mapa de FoS usan gradiente+opacidad y svg2pdf vectorial
// rompe Acrobat.
//
// Trazabilidad legal (eng-review §9.2 #3): versión del motor (PySlope+Pyodide) +
// hash del parche del vendor + hash de los inputs van en cabecera y en TODOS los
// footers (drawFootersAllPages). El botón PDF nunca se deshabilita → el llamador
// hace `await ensureResult()` antes de exportar.
//
// Estructura del documento (orden):
//   1. Cabecera (título + fecha + motor v + inputs hash) + línea de trazabilidad
//      (normativa + contexto + situación + motor/parche/malla).
//   2. Figura 1 — sección (clon #slope-stability-svg-pdf) + columna de inputs
//      (geometría, agua/situación, contexto, cargas).
//   3. Tabla de estratos.
//   4. Resultados clave (FoS crítico, centro O, radio R).
//   5. Figura 2 — malla de centros / mapa de FoS (clon #slope-search-svg-pdf).
//      Defensiva: si el clon no existe (T4.1 aún no montado o sin resultado),
//      se omite SIN romper el resto del PDF.
//   6. Tabla de verificaciones completa (result.checks, paginada por fila; la
//      fila sísmica neutra se muestra "N/A" sin η% numérico).
//   7. Tabla de física por dovela (nº · x · b · W · α · u) desde result.run.slices;
//      campos ausentes → "—" (no se reconstruye física en JS).
//   8. Disclaimer de alcance (incl. sísmico pendiente · Phase 3).
//   9. Footers en todas las páginas.

import jsPDF from "jspdf";
import type { SlopeInputs } from "../../data/defaults";
import type { SlopeResult, SlopeSlice } from "../../lib/calculations/geotech/types";
import { formatQuantity, formatNumber, getUnitLabel } from "../units/format";
import type { Quantity, UnitSystem } from "../units/types";
import {
  drawHeader,
  drawFootersAllPages,
  drawTable,
  ensureSpace,
  embedSvgAsImage,
  setGray,
  pdfStr,
  STATUS_LABEL,
  PAGE_W,
  type PdfResult,
  type TableCol,
} from "./utils";
import type { CheckRow } from "../../lib/calculations/types";
import { slopeMethodLabel } from "../text/labels";

const M = 20;

const SITUATION_LABEL: Record<SlopeInputs["situation"], string> = {
  persistent: "Persistente / transitoria",
  transient: "Transitoria (construcción)",
  extraordinary: "Extraordinaria",
};

const CONTEXT_LABEL: Record<SlopeInputs["context"], string> = {
  excavation: "Talud de excavacion",
  "global-foundation": "Estabilidad global de cimentacion",
};

const disclaimer = (method: string): string =>
  `Predimensionamiento — método ${slopeMethodLabel(method)} (superficie circular). ` +
  "Sin métodos no-circulares ni Spencer/Janbu. El análisis sísmico pseudo-estático " +
  "queda pendiente (Phase 3) y figura como verificación informativa. " +
  "No sustituye un estudio geotécnico.";

export async function exportSlopeStabilityPDF(
  inp: SlopeInputs,
  result: SlopeResult,
  system: UnitSystem = "si",
): Promise<PdfResult> {
  // Valores del modelo SIEMPRE en SI; solo se convierte al MOSTRAR (convención
  // formatQuantity del producto). fmtQ incluye la unidad; numQ solo el número
  // (para columnas con la unidad en la cabecera); unit da el sufijo de cabecera.
  const fmtQ = (v: number, q: Quantity, precision?: number) =>
    formatQuantity(v, q, system, { precision });
  const numQ = (v: number | undefined, q: Quantity, precision?: number) =>
    v === undefined || !isFinite(v) ? "—" : formatNumber(v, q, system, precision);
  const unit = (q: Quantity) => getUnitLabel(q, system);
  // W/u por dovela: en técnico los valores son ~10× más pequeños (Tn, kg/cm²)
  // → 2 decimales para no perder lectura; en SI se mantiene 1 (como la UI).
  const slicePrec = system === "si" ? 1 : 2;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const engineVersion = `PySlope ${result.engine.pyslopeVersion}`;

  // ── Cabecera (título + fecha + versión motor + hash inputs) ──────────────────
  const { contentY } = drawHeader(
    doc,
    {
      title: "Concreta - Estabilidad de taludes",
      engineVersion: result.engine.pyslopeVersion,
      inputsHash: result.engine.inputsHash,
    },
    M,
  );

  // Línea de trazabilidad: normativa + contexto/situación + motor + parche + malla.
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  setGray(doc, 110);
  doc.text(
    pdfStr(
      `CTE DB-SE-C art. 7.2.2.1 · UNE-EN 1997-1 (EC7 DA3)  ·  ` +
        `${CONTEXT_LABEL[inp.context]} · ${SITUATION_LABEL[inp.situation]}  ·  ` +
        `Motor: PySlope ${result.engine.pyslopeVersion} · Pyodide ${result.engine.pyodideVersion} · ` +
        `parche ${result.engine.patchHash.slice(0, 8)} · malla ${result.engine.mesh.iterations}/${result.engine.mesh.slices} (${slopeMethodLabel(result.run.method)})`,
    ),
    M,
    contentY,
  );

  // ── Figura 1: SVG sección rasterizado (clon oculto del shell) ────────────────
  const sectionContainer = document.getElementById("slope-stability-svg-pdf");
  const sectionSvg = sectionContainer
    ? (sectionContainer.querySelector("svg") as SVGSVGElement | null)
    : null;
  const SVG_X = M;
  const SVG_Y = contentY + 4;
  const SVG_W = 120;
  const SVG_H = 72;
  if (sectionSvg) {
    await embedSvgAsImage(doc, sectionSvg, { x: SVG_X, y: SVG_Y, width: SVG_W, height: SVG_H });
  }

  // ── Columna derecha: datos de entrada ────────────────────────────────────────
  const COL_R = M + SVG_W + 6;
  const LH = 4.5;
  let ry = SVG_Y + 2;
  const secHeader = (label: string) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    setGray(doc, 60);
    doc.text(label, COL_R, ry);
    ry += LH;
    doc.setFont("helvetica", "normal");
    setGray(doc, 80);
  };
  const line = (s: string) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    setGray(doc, 80);
    doc.text(pdfStr(s), COL_R, ry);
    ry += LH;
  };
  const gap = () => { ry += 2; };

  secHeader("GEOMETRIA");
  line(`H = ${inp.height} m`);
  line(`beta = ${inp.angle} deg`);
  gap();

  secHeader("AGUA / SITUACION");
  line(inp.waterTableDepth !== null ? `NF a ${inp.waterTableDepth} m` : "Sin nivel freatico");
  line(SITUATION_LABEL[inp.situation]);
  gap();

  secHeader("CONTEXTO");
  line(CONTEXT_LABEL[inp.context]);
  gap();

  secHeader("CARGAS");
  if (inp.loads.length === 0) {
    line("Sin sobrecargas");
  } else {
    for (const ld of inp.loads) {
      line(
        ld.kind === "udl"
          ? `UDL ${fmtQ(ld.magnitude, "areaLoad")} @ ${ld.offset} m${ld.length ? ` (L=${ld.length} m)` : ""}`
          : `Lineal ${fmtQ(ld.magnitude, "linearLoad")} @ ${ld.offset} m`,
      );
    }
  }

  // ── Estratos (bajo la figura) ────────────────────────────────────────────────
  let by = SVG_Y + SVG_H + 6;
  doc.setLineWidth(0.3);
  setGray(doc, 180);
  doc.line(M, by - 2, PAGE_W - M, by - 2);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  setGray(doc, 60);
  doc.text("ESTRATOS", M, by + 3);
  by += 8;

  by = drawTable(doc, {
    x: M,
    y: by,
    M,
    cols: [
      { key: "i", label: "#", w: 10, render: (r) => String(r.i) },
      { key: "tipo", label: "Tipo", w: 30 },
      { key: "esp", label: "Espesor", w: 28, align: "right" },
      // Unidades de cabecera según el sistema activo (drawTable pasa las labels
      // por pdfStr: ³→^3, ²→2). Los valores se convierten con la misma quantity.
      { key: "gamma", label: `g (${unit("weightDensity")})`, w: 32, align: "right" },
      { key: "phi", label: "phi (deg)", w: 30, align: "right" },
      { key: "c", label: `c' (${unit("cohesion")})`, w: 30, align: "right" },
    ] as TableCol<{ i: number; tipo: string; esp: string; gamma: string; phi: string; c: string }>[],
    rows: inp.strata.map((st, i) => ({
      i: i + 1,
      tipo: st.type === "granular" ? "Granular" : "Cohesivo",
      esp: `${st.thickness} m`,
      gamma: numQ(st.gamma, "weightDensity"),
      phi: `${st.phi}`,
      c: numQ(st.c, "cohesion"),
    })),
  });

  // ── Resultados clave ─────────────────────────────────────────────────────────
  by += 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  setGray(doc, 60);
  doc.text("RESULTADOS", M, by + 3);
  by += 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  setGray(doc, 80);
  const { cx, cy, r } = result.run.circle;
  doc.text(pdfStr(`FoS critico = ${result.fos.toFixed(3)}`), M, by);
  doc.text(pdfStr(`Centro O = (${cx.toFixed(2)}, ${cy.toFixed(2)}) m`), M + 70, by);
  doc.text(pdfStr(`Radio R = ${r.toFixed(2)} m`), M + 140, by);
  by += LH + 2;

  // ── Figura 2: malla de centros / mapa de FoS (clon #slope-search-svg-pdf) ─────
  // El clon lo monta T4.1; si no existe (todavía no montado, sin resultado, o
  // jsdom de test), se omite la subsección entera sin romper el resto del PDF.
  const searchContainer = document.getElementById("slope-search-svg-pdf");
  const searchSvg = searchContainer
    ? (searchContainer.querySelector("svg") as SVGSVGElement | null)
    : null;
  if (searchSvg) {
    const MAP_W = 120;
    const MAP_H = 72;
    // El bloque (cabecera + figura) es atómico: si no cabe, salta de página.
    by = ensureSpace(doc, by, MAP_H + 12, M);
    doc.setLineWidth(0.3);
    setGray(doc, 180);
    doc.line(M, by - 2, PAGE_W - M, by - 2);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    setGray(doc, 60);
    doc.text(pdfStr("MALLA DE CENTROS / MAPA DE FoS"), M, by + 3);
    by += 6;
    await embedSvgAsImage(doc, searchSvg, { x: M, y: by, width: MAP_W, height: MAP_H });
    by += MAP_H + 4;
  }

  // ── Tabla de verificaciones ──────────────────────────────────────────────────
  by += 4;
  by = ensureSpace(doc, by, 14, M);
  doc.setLineWidth(0.3);
  setGray(doc, 180);
  doc.line(M, by - 2, PAGE_W - M, by - 2);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  setGray(doc, 60);
  doc.text("VERIFICACIONES", M, by + 3);
  // Estado global: las filas neutras (sísmico diferido) no degradan el veredicto.
  const overall = result.checks.some((c) => c.status === "fail")
    ? "fail"
    : result.checks.some((c) => c.status === "warn")
      ? "warn"
      : "ok";
  doc.setFontSize(11);
  setGray(doc, 30);
  doc.text(STATUS_LABEL[overall], PAGE_W - M, by + 3, { align: "right" });
  by += 8;

  const checkCols: TableCol<CheckRow>[] = [
    {
      key: "description",
      label: "Verificacion",
      w: 62,
      render: (c) => (c.tag ? `${c.description} [${c.tag}]` : c.description),
    },
    { key: "article", label: "Articulo", w: 40, render: (c) => c.article },
    {
      key: "value",
      label: "FoS",
      w: 16,
      align: "right",
      // La fila neutra (sísmico) no trae FoS numérico → en blanco.
      render: (c) => (c.neutral ? "" : c.valueStr ?? c.value ?? ""),
    },
    {
      key: "limit",
      label: "Limite",
      w: 18,
      align: "right",
      render: (c) => (c.neutral ? "" : c.limitStr ?? c.limit ?? ""),
    },
    {
      key: "util",
      label: "Ut%",
      w: 14,
      align: "right",
      // Neutra → "—" (sin η% numérico, plan T4.2 #2); resto → % de utilización.
      render: (c) =>
        c.neutral ? "—" : !isFinite(c.utilization) ? "inf" : `${(c.utilization * 100).toFixed(0)}%`,
    },
    { key: "status", label: "Estado", w: 20, align: "right", render: (c) => STATUS_LABEL[c.status] },
  ];
  by = drawTable(doc, { x: M, y: by, M, cols: checkCols, rows: result.checks });

  // ── Tabla de física por dovela ───────────────────────────────────────────────
  // Geometría/física EXACTA emitida por el worker (result.run.slices); nunca se
  // reconstruye en JS. b = xR − xL; α de rad a grados. Campos ausentes → "—".
  const slices = result.run.slices ?? [];
  if (slices.length > 0) {
    by += 4;
    by = ensureSpace(doc, by, 14, M);
    doc.setLineWidth(0.3);
    setGray(doc, 180);
    doc.line(M, by - 2, PAGE_W - M, by - 2);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    setGray(doc, 60);
    doc.text(pdfStr("DOVELAS (circulo critico)"), M, by + 3);
    by += 8;

    const sliceCols: TableCol<{ s: SlopeSlice; n: number }>[] = [
      { key: "n", label: "n", w: 14, align: "right", render: (r) => String(r.n) },
      { key: "x", label: "x (m)", w: 30, align: "right", render: (r) => r.s.x.toFixed(2) },
      {
        key: "b",
        label: "b (m)",
        w: 30,
        align: "right",
        render: (r) => (r.s.xR - r.s.xL).toFixed(2),
      },
      { key: "W", label: `W (${unit("force")})`, w: 32, align: "right", render: (r) => numQ(r.s.weight, "force", slicePrec) },
      {
        key: "alpha",
        label: "alpha (deg)",
        w: 32,
        align: "right",
        render: (r) =>
          r.s.alpha === undefined || !isFinite(r.s.alpha)
            ? "—"
            : ((r.s.alpha * 180) / Math.PI).toFixed(1),
      },
      { key: "u", label: `u (${unit("cohesion")})`, w: 32, align: "right", render: (r) => numQ(r.s.u, "cohesion", slicePrec) },
    ];
    by = drawTable(doc, {
      x: M,
      y: by,
      M,
      cols: sliceCols,
      rows: slices.map((s, i) => ({ s, n: i + 1 })),
    });
  }

  // ── Disclaimer de alcance ────────────────────────────────────────────────────
  by += 4;
  by = ensureSpace(doc, by, 14, M);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7);
  setGray(doc, 120);
  doc.text(pdfStr(disclaimer(result.run.method)), M, by, { maxWidth: PAGE_W - 2 * M });

  // ── Footers en todas las páginas (versión motor en cada una) ─────────────────
  drawFootersAllPages(doc, { engineVersion }, M);

  const filename = "estabilidad-talud.pdf";
  const blob = doc.output("blob");
  const blobUrl = URL.createObjectURL(blob);
  const pageCount = doc.getNumberOfPages();
  return { blobUrl, filename, pageCount };
}
