import { useState } from "react";
import { useContainerWidth } from "../../hooks/useContainerWidth";
import { usePdfPreview } from "../../hooks/usePdfPreview";
import { useDrawer } from "../../components/layout/AppShell";
import { useUnitSystem } from "../../lib/units/useUnitSystem";
import { Topbar } from "../../components/layout/Topbar";
import { PdfPreviewModal } from "../../components/ui/PdfPreviewModal";
import { MobileTabBar, type MobileTab } from "../../components/ui/MobileTabBar";
import { validateSlope } from "../../lib/calculations/geotech/validate";
import { exportSlopeStabilityPDF } from "../../lib/pdf/slopeStability";
import { useSlopeState } from "./useSlopeState";
import { useSlopeSolver } from "./useSlopeSolver";
import { SlopeInputs } from "./SlopeInputs";
import { SlopeStabilitySVG } from "./SlopeStabilitySVG";
import { SlopeResults } from "./SlopeResults";

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

export function SlopeStabilityModule() {
  const { state, setState, reset } = useSlopeState();
  const { openDrawer } = useDrawer();
  const { system } = useUnitSystem();
  const [tab, setTab] = useState<MobileTab>("inputs");

  const validation = validateSlope(state);
  const solver = useSlopeSolver(state, validation.valid);

  // El botón PDF nunca se deshabilita → garantizar un resultado fresco antes de
  // exportar (await ensureResult), y dejar pintar el clon oculto antes de
  // rasterizarlo (nextFrame) por si el resultado se acababa de calcular.
  const { pdfExporting, pdfPreview, handleExportPdf, handleDownloadPdf, closePdfPreview } = usePdfPreview(
    async () => {
      const res = await solver.ensureResult();
      await nextFrame();
      return exportSlopeStabilityPDF(state, res, system);
    },
    true,
  );

  const [canvasRef, canvasWidth] = useContainerWidth();
  const CANVAS_PAD = 32;
  const svgW = canvasWidth && canvasWidth > 0 ? Math.max(280, canvasWidth - CANVAS_PAD) : 520;
  const svgH = Math.round(svgW * 0.62);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <Topbar
        moduleLabel="Taludes"
        moduleGroup="Geotecnia"
        onExportPdf={handleExportPdf}
        pdfExporting={pdfExporting}
        onMenuOpen={openDrawer}
      />
      <MobileTabBar tab={tab} setTab={setTab} />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Izquierda: inputs */}
        <div
          className={[
            "flex min-h-0 flex-col overflow-hidden bg-bg-surface",
            "lg:flex lg:w-72 lg:shrink-0 lg:border-r lg:border-border-main",
            tab === "inputs" ? "max-lg:flex-1" : "max-lg:hidden",
          ].join(" ")}
        >
          <div className="scroll-hide flex-1 overflow-y-auto px-4 py-4">
            <SlopeInputs value={state} onChange={setState} validation={validation} />
          </div>
          <div className="hidden shrink-0 border-t border-border-main px-4 py-3 lg:block">
            <button
              onClick={reset}
              type="button"
              className="text-[11px] text-text-disabled transition-colors hover:text-text-secondary"
            >
              Restablecer valores
            </button>
          </div>
        </div>

        {/* Centro: lienzo SVG (dot-grid) */}
        <div
          ref={canvasRef}
          className={[
            "canvas-dot-grid min-w-0 items-center justify-center overflow-auto p-6",
            "lg:flex lg:flex-1",
            tab === "diagramas" ? "flex flex-1" : "hidden",
          ].join(" ")}
        >
          <SlopeStabilitySVG inputs={state} result={solver.result} width={svgW} height={svgH} mode="screen" />
        </div>

        {/* Derecha: resultados + Calcular */}
        <div
          className={[
            "scroll-hide min-h-0 overflow-y-auto bg-bg-surface",
            "lg:flex lg:w-80 lg:shrink-0 lg:flex-col lg:border-l lg:border-border-main",
            tab === "results" ? "flex-1" : "hidden",
          ].join(" ")}
        >
          <SlopeResults solver={solver} situation={state.situation} />
        </div>
      </div>

      {/* Clon oculto para el PDF (mode='pdf', escala de grises) */}
      <div className="h-0 w-0 overflow-hidden" aria-hidden="true">
        <div id="slope-stability-svg-pdf" style={{ position: "absolute", left: "-9999px", top: 0 }}>
          <SlopeStabilitySVG inputs={state} result={solver.result} width={640} height={400} mode="pdf" />
        </div>
      </div>

      {pdfPreview && (
        <PdfPreviewModal
          blobUrl={pdfPreview.blobUrl}
          filename={pdfPreview.filename}
          pageCount={pdfPreview.pageCount}
          onDownload={handleDownloadPdf}
          onClose={closePdfPreview}
        />
      )}
    </div>
  );
}
