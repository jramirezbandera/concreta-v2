import { useState } from "react";
import { useContainerWidth } from "../../hooks/useContainerWidth";
import { usePdfPreview } from "../../hooks/usePdfPreview";
import { useDrawer } from "../../components/layout/AppShell";
import { useUnitSystem } from "../../lib/units/useUnitSystem";
import { Topbar } from "../../components/layout/Topbar";
import { showToast } from "../../components/ui/Toast";
import { PdfPreviewModal } from "../../components/ui/PdfPreviewModal";
import { MobileTabBar, type MobileTab } from "../../components/ui/MobileTabBar";
import { validateSlope } from "../../lib/calculations/geotech/validate";
import { exportSlopeStabilityPDF } from "../../lib/pdf/slopeStability";
import { useSlopeState, buildShareUrl } from "./useSlopeState";
import { useSlopeSolver } from "./useSlopeSolver";
import { SlopeInputs } from "./SlopeInputs";
import { SlopeStabilitySVG } from "./SlopeStabilitySVG";
import { SlopeSearchSVG } from "./SlopeSearchSVG";
import { SlopeResults } from "./SlopeResults";
import { Loader2 } from "lucide-react";
import { engineStatusText } from "../../lib/text/labels";

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

// Conmutador de vistas del lienzo central. Dos vistas:
//   section  → SlopeStabilitySVG (vista 1: sección + círculo crítico)
//   search   → SlopeSearchSVG    (vista 2: malla de centros / mapa de FoS)
// Segmentado simple con tokens (sin rounded-lg/full): divisores border-r y la
// pestaña activa en bg-bg-primary, como el resto de conmutadores del producto
// (retaining-wall/micropiles) pero sin chrome de badge de color.
type SlopeView = "section" | "search";

// "Malla FoS" (no "Diagramas") evita la colisión con el tab "Diagramas" del
// MobileTabBar (Datos/Diagramas/Resultados): en móvil ambos quedaban apilados y
// ambiguos. "Malla FoS" describe la vista 2 (malla de centros / mapa de FoS).
const VIEW_TABS: { id: SlopeView; label: string }[] = [
  { id: "section", label: "Sección" },
  { id: "search", label: "Malla FoS" },
];

function ViewTabButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        "px-3 py-2 border-r border-border-main text-[11.5px] font-medium tracking-tight whitespace-nowrap transition-colors",
        active
          ? "bg-bg-primary text-text-primary"
          : "bg-bg-surface text-text-secondary hover:bg-bg-elevated/70 hover:text-text-primary",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

export function SlopeStabilityModule() {
  const { state, setState, reset } = useSlopeState();
  const { openDrawer } = useDrawer();
  const { system } = useUnitSystem();
  const [tab, setTab] = useState<MobileTab>("inputs");
  const [view, setView] = useState<SlopeView>("section");

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

  // Enlace compartible: codifica los inputs anidados (estratos/cargas/contexto)
  // en ?model= vía lz-string y lo copia al portapapeles. Mismo patrón que FEM
  // (fem-analysis/index.tsx handleShare). La hidratación desde ?model= ya la
  // hace useSlopeState al montar — aquí solo emitimos el enlace.
  function handleShare() {
    const url = buildShareUrl(state);
    navigator.clipboard.writeText(url).then(
      () => showToast("Enlace del modelo copiado al portapapeles", { autoDismiss: 2500 }),
      () => showToast("No se pudo copiar el enlace", { autoDismiss: 3000 }),
    );
  }

  const [canvasRef, canvasWidth] = useContainerWidth();
  const CANVAS_PAD = 32;
  const svgW = canvasWidth && canvasWidth > 0 ? Math.max(280, canvasWidth - CANVAS_PAD) : 520;
  const svgH = Math.round(svgW * 0.62);

  const run = solver.result?.run ?? null;

  // Motor ocupado (cold-start o corrida): overlay del lienzo + tarjeta del panel.
  const engineBusy = solver.engineState === "loading" || solver.engineState === "computing";
  const busyText = engineBusy ? engineStatusText(solver.engineState as "loading" | "computing") : null;

  // Anuncio para lectores de pantalla. Vive en el SHELL (siempre montado), no en
  // el panel de resultados: en móvil ese panel puede ir display:none según la
  // pestaña, y el overlay del lienzo es aria-hidden → sin esto, cero anuncio
  // durante la carga (eng-review · voz externa a11y).
  let liveMessage = "";
  if (solver.engineState === "loading") liveMessage = engineStatusText("loading").title;
  else if (solver.engineState === "computing") liveMessage = engineStatusText("computing").title;
  else if (solver.engineState === "error") liveMessage = `Error de cálculo: ${solver.error ?? ""}`;
  else if (solver.result) {
    liveMessage = solver.isStale
      ? `Resultados desactualizados. Último FoS ${solver.result.fos.toFixed(2)}.`
      : `Cálculo listo. Factor de seguridad ${solver.result.fos.toFixed(2)}.`;
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* Región aria-live única y SIEMPRE montada (independiente de la pestaña). */}
      <div className="sr-only" aria-live="polite" role="status">
        {liveMessage}
      </div>
      <Topbar
        moduleLabel="Taludes"
        moduleGroup="Geotecnia"
        onExportPdf={handleExportPdf}
        pdfExporting={pdfExporting}
        onCopyLink={handleShare}
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

        {/* Centro: conmutador de vistas + lienzo SVG (dot-grid) */}
        <div
          className={[
            "min-w-0 flex-col overflow-hidden",
            "lg:flex lg:flex-1",
            tab === "diagramas" ? "flex flex-1" : "hidden",
          ].join(" ")}
        >
          {/* Conmutador Sección / Diagramas */}
          <div className="flex shrink-0 items-center border-b border-border-main bg-bg-surface">
            {VIEW_TABS.map((t) => (
              <ViewTabButton
                key={t.id}
                active={view === t.id}
                label={t.label}
                onClick={() => setView(t.id)}
              />
            ))}
          </div>

          {/* Lienzo (relative: contexto de posición para el overlay de carga) */}
          <div
            ref={canvasRef}
            className="canvas-dot-grid relative flex min-h-0 flex-1 items-center justify-center overflow-auto p-6"
          >
            {view === "section" ? (
              <SlopeStabilitySVG inputs={state} result={solver.result} width={svgW} height={svgH} mode="screen" />
            ) : (
              <SlopeSearchSVG inp={state} run={run} width={svgW} height={svgH} mode="screen" />
            )}

            {/* Overlay de carga: el motor (Pyodide) arranca o calcula. El spinner
                anima en el hilo principal (el cómputo va en un worker) → demuestra
                que la pantalla NO está congelada. aria-hidden: el anuncio lo da la
                región aria-live del shell. */}
            {busyText && (
              <div
                className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-bg-surface/70 px-6 text-center"
                aria-hidden="true"
              >
                <Loader2 size={30} className="animate-spin text-accent" />
                <p className="text-[13px] font-medium text-text-primary">{busyText.title}</p>
                {busyText.subtitle && (
                  <p className="max-w-xs text-[11px] text-text-secondary">{busyText.subtitle}</p>
                )}
              </div>
            )}
          </div>
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

      {/* Clones ocultos para el PDF (mode='pdf', escala de grises). Ambas vistas
          se montan SIEMPRE — independiente de la pestaña activa — para que el
          export PDF (T4.2) pueda rasterizar las dos figuras sin swap de estado. */}
      <div className="h-0 w-0 overflow-hidden" aria-hidden="true">
        <div id="slope-stability-svg-pdf" style={{ position: "absolute", left: "-9999px", top: 0 }}>
          <SlopeStabilitySVG inputs={state} result={solver.result} width={640} height={400} mode="pdf" />
        </div>
        <div id="slope-search-svg-pdf" style={{ position: "absolute", left: "-9999px", top: 0 }}>
          <SlopeSearchSVG inp={state} run={run} width={640} height={400} mode="pdf" />
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
