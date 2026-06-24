// PDF export del módulo de Estabilidad de taludes (Geotecnia).
// jsPDF — A4 retrato, márgenes 20 mm. Figura rasterizada (embedSvgAsImage) porque
// los estratos usan gradiente+opacidad y svg2pdf vectorial rompe Acrobat.
//
// Trazabilidad legal (eng-review §9.2 #3): versión del motor (PySlope+Pyodide) +
// hash del parche del vendor + hash de los inputs van en cabecera y en TODOS los
// footers (drawFootersAllPages). El botón PDF nunca se deshabilita → el llamador
// hace `await ensureResult()` antes de exportar.

import jsPDF from "jspdf";
import type { SlopeInputs } from "../../data/defaults";
import type { SlopeResult } from "../../lib/calculations/geotech/types";
import type { UnitSystem } from "../units/types";
import {
  drawHeader,
  drawFootersAllPages,
  drawTable,
  embedSvgAsImage,
  setGray,
  pdfStr,
  STATUS_LABEL,
  PAGE_W,
  type PdfResult,
  type TableCol,
} from "./utils";
import type { CheckRow } from "../../lib/calculations/types";

const M = 20;

const SITUATION_LABEL: Record<SlopeInputs["situation"], string> = {
  persistent: "Persistente / transitoria",
  transient: "Transitoria (construcción)",
  extraordinary: "Extraordinaria",
};

const DISCLAIMER =
  "Predimensionamiento — método Bishop simplificado (superficie circular). " +
  "Sin métodos no-circulares ni Spencer/Janbu. No sustituye un estudio geotécnico.";

export async function exportSlopeStabilityPDF(
  inp: SlopeInputs,
  result: SlopeResult,
  _system: UnitSystem = "si",
): Promise<PdfResult> {
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

  // Línea de trazabilidad: normativa + motor + parche + malla.
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  setGray(doc, 110);
  doc.text(
    pdfStr(
      `CTE DB-SE-C art. 7.2.2.1 · UNE-EN 1997-1 (EC7 DA3)  ·  ` +
        `Motor: PySlope ${result.engine.pyslopeVersion} · Pyodide ${result.engine.pyodideVersion} · ` +
        `parche ${result.engine.patchHash.slice(0, 8)} · malla ${result.engine.mesh.iterations}/${result.engine.mesh.slices} (Bishop)`,
    ),
    M,
    contentY,
  );

  // ── Figura: SVG sección rasterizado (clon oculto del shell) ──────────────────
  const svgContainer = document.getElementById("slope-stability-svg-pdf");
  const svgEl = svgContainer ? (svgContainer.querySelector("svg") as SVGSVGElement | null) : null;
  const SVG_X = M;
  const SVG_Y = contentY + 4;
  const SVG_W = 120;
  const SVG_H = 72;
  if (svgEl) {
    await embedSvgAsImage(doc, svgEl, { x: SVG_X, y: SVG_Y, width: SVG_W, height: SVG_H });
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

  secHeader("CARGAS");
  if (inp.loads.length === 0) {
    line("Sin sobrecargas");
  } else {
    for (const ld of inp.loads) {
      line(
        ld.kind === "udl"
          ? `UDL ${ld.magnitude} kPa @ ${ld.offset} m${ld.length ? ` (L=${ld.length} m)` : ""}`
          : `Lineal ${ld.magnitude} kN/m @ ${ld.offset} m`,
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
      { key: "gamma", label: "g (kN/m3)", w: 32, align: "right" },
      { key: "phi", label: "phi (deg)", w: 30, align: "right" },
      { key: "c", label: "c' (kPa)", w: 30, align: "right" },
    ] as TableCol<{ i: number; tipo: string; esp: string; gamma: string; phi: string; c: string }>[],
    rows: inp.strata.map((st, i) => ({
      i: i + 1,
      tipo: st.type === "granular" ? "Granular" : "Cohesivo",
      esp: `${st.thickness} m`,
      gamma: `${st.gamma}`,
      phi: `${st.phi}`,
      c: `${st.c}`,
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

  // ── Tabla de verificaciones ──────────────────────────────────────────────────
  doc.setLineWidth(0.3);
  setGray(doc, 180);
  doc.line(M, by - 2, PAGE_W - M, by - 2);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  setGray(doc, 60);
  doc.text("VERIFICACIONES", M, by + 3);
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
    { key: "description", label: "Verificacion", w: 62, render: (c) => c.description },
    { key: "article", label: "Articulo", w: 40, render: (c) => c.article },
    { key: "value", label: "FoS", w: 16, align: "right", render: (c) => c.valueStr ?? c.value ?? "" },
    { key: "limit", label: "Limite", w: 18, align: "right", render: (c) => c.limitStr ?? c.limit ?? "" },
    {
      key: "util",
      label: "Ut%",
      w: 14,
      align: "right",
      render: (c) => (!isFinite(c.utilization) ? "inf" : `${(c.utilization * 100).toFixed(0)}%`),
    },
    { key: "status", label: "Estado", w: 20, align: "right", render: (c) => STATUS_LABEL[c.status] },
  ];
  by = drawTable(doc, { x: M, y: by, M, cols: checkCols, rows: result.checks });

  // ── Disclaimer de alcance ────────────────────────────────────────────────────
  by += 4;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7);
  setGray(doc, 120);
  doc.text(pdfStr(DISCLAIMER), M, by, { maxWidth: PAGE_W - 2 * M });

  // ── Footers en todas las páginas (versión motor en cada una) ─────────────────
  drawFootersAllPages(doc, { engineVersion }, M);

  const filename = "estabilidad-talud.pdf";
  const blob = doc.output("blob");
  const blobUrl = URL.createObjectURL(blob);
  const pageCount = doc.getNumberOfPages();
  return { blobUrl, filename, pageCount };
}
