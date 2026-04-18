import { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { steelBeamDefaults } from '../../data/defaults';
import { BEAM_CASES } from '../../lib/calculations/beamCases';
import { useModuleState } from '../../hooks/useModuleState';
import { useContainerWidth } from '../../hooks/useContainerWidth';
import { usePdfPreview } from '../../hooks/usePdfPreview';
import { useDrawer } from '../../components/layout/AppShell';
import { calcSteelBeam } from '../../lib/calculations/steelBeams';
import { deriveFromLoads } from '../../lib/calculations/loadGen';
import { exportSteelBeamsPDF } from '../../lib/pdf/steelBeams';
import { Topbar } from '../../components/layout/Topbar';
import { PdfPreviewModal } from '../../components/ui/PdfPreviewModal';
import { MobileTabBar, type MobileTab } from '../../components/ui/MobileTabBar';
import { SteelBeamsInputs } from './SteelBeamsInputs';
import { SteelBeamsSVG } from './SteelBeamsSVG';
import { SteelBeamsResults } from './SteelBeamsResults';
import { SteelBeamsDiagrams } from './SteelBeamsDiagrams';

export function SteelBeamsModule() {
  const { state, setField, reset } = useModuleState('steel-beams', steelBeamDefaults);
  const { openDrawer } = useDrawer();
  const [tab, setTab] = useState<MobileTab>('inputs');

  // Lcr auto-fill
  const [lcrManuallyOverridden, setLcrManuallyOverridden] = useState(false);
  useEffect(() => {
    setLcrManuallyOverridden(false);
  }, [state.beamType, state.L]);

  const autoLcr = Math.round(BEAM_CASES[state.beamType].Lcr_factor * state.L);
  const displayLcr = lcrManuallyOverridden ? state.Lcr : autoLcr;

  const handleLcrChange = (val: number) => {
    setField('Lcr', val);
    setLcrManuallyOverridden(Math.abs(val - autoLcr) > 5);
  };

  const [effectiveInputs, loadGen, result] = useMemo(() => {
    const lg = deriveFromLoads(state);
    const eff = {
      ...state,
      MEd:             lg.MEd,
      VEd:             lg.VEd,
      VEd_interaction: lg.VEd_interaction,
      Mser:            lg.Mser,
      Lcr:             lcrManuallyOverridden ? state.Lcr : autoLcr,
    };
    return [eff, lg, calcSteelBeam(eff)] as const;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, lcrManuallyOverridden, autoLcr]);

  const { pdfExporting, pdfPreview, handleExportPdf, handleDownloadPdf, closePdfPreview } =
    usePdfPreview(() => exportSteelBeamsPDF(effectiveInputs, result), result.valid);

  // Responsive SVG sizing — measure the canvas container
  const [canvasRef, canvasWidth] = useContainerWidth();

  const FIXED_SVG_W = 420;
  const FIXED_DIAG_W = 400;
  const CANVAS_PAD = 32; // px-4 each side
  const GAP = 32;
  const TOTAL_FIXED = FIXED_SVG_W + GAP + FIXED_DIAG_W + CANVAS_PAD;
  // Stack vertically below ~1280px viewport (canvas < 800px); side-by-side at xl+
  const STACK_THRESHOLD = 800;
  const isStacked = (canvasWidth ?? 0) < STACK_THRESHOLD;

  let svgW = FIXED_SVG_W;
  let diagW = FIXED_DIAG_W;

  if (isStacked && canvasWidth !== undefined && canvasWidth > 0) {
    // Each SVG takes full available width (up to its natural size)
    const available = canvasWidth - CANVAS_PAD;
    svgW = Math.min(FIXED_SVG_W, Math.max(180, available));
    diagW = Math.min(FIXED_DIAG_W, Math.max(180, available));
  } else if (!isStacked && canvasWidth !== undefined && canvasWidth > 0 && canvasWidth < TOTAL_FIXED) {
    // Side-by-side: scale both down proportionally to fit
    const available = canvasWidth - CANVAS_PAD - GAP;
    const ratio = FIXED_SVG_W / (FIXED_SVG_W + FIXED_DIAG_W);
    svgW = Math.max(160, Math.round(available * ratio));
    diagW = Math.max(160, Math.round(available * (1 - ratio)));
  }

  const svgH = Math.round(svgW * (280 / 420));
  const diagH = Math.round(diagW * (280 / 400));

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <Helmet>
        <title>Vigas de acero — Concreta</title>
        <meta name="description" content="Flexión, pandeo lateral-torsional y deflexión en vigas de acero laminado. EC3 §6.2–6.3." />
      </Helmet>
      <Topbar
        moduleLabel="Vigas"
        moduleGroup="Acero"
        onExportPdf={handleExportPdf}
        pdfExporting={pdfExporting}
        onMenuOpen={openDrawer}
      />
      <MobileTabBar tab={tab} setTab={setTab} />

      {/* Two-column layout (desktop) / Tabbed (mobile) */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Left: inputs panel */}
        <div
          className={[
            'flex flex-col min-h-0 overflow-hidden',
            'md:w-72 md:shrink-0 md:border-r md:border-border-main',
            tab === 'inputs' ? 'max-md:flex-1' : 'max-md:hidden',
            'md:flex',
          ].join(' ')}
        >
          <div className="flex-1 overflow-y-auto scroll-hide px-5 py-4">
            <SteelBeamsInputs
              state={state}
              setField={setField}
              displayLcr={displayLcr}
              lcrIsAuto={!lcrManuallyOverridden}
              onLcrChange={handleLcrChange}
              loadGen={loadGen}
            />
          </div>
          <div className="hidden md:block px-5 py-3 border-t border-border-main shrink-0">
            <button
              onClick={reset}
              className="text-[11px] text-text-disabled hover:text-text-secondary transition-colors"
              type="button"
            >
              Restablecer valores
            </button>
          </div>
        </div>

        {/* Right: SVG + results */}
        <div
          className={[
            'min-w-0 overflow-y-auto scroll-hide',
            'md:flex-1',
            tab === 'results' ? 'flex-1' : 'hidden',
            'md:block',
          ].join(' ')}
        >
          {/* SVG canvas — tablet+ only. Stacked (md–xl), side-by-side (xl+) */}
          <div
            ref={canvasRef}
            className="hidden md:flex md:flex-col xl:flex-row border-b border-border-main canvas-dot-grid items-center justify-center py-6 px-4 gap-6"
          >
            <SteelBeamsSVG inp={effectiveInputs} result={result} mode="screen" width={svgW} height={svgH} />
            {loadGen && result.valid && (
              <SteelBeamsDiagrams
                beamType={state.beamType}
                MEd={loadGen.MEd}
                VEdA={loadGen.VEd}
                VEdB={state.beamType === 'fp' ? loadGen.VEd * (3 / 5) : loadGen.VEd}
                L={effectiveInputs.L}
                deltaMax={result.delta_max}
                deltaAdm={result.delta_adm}
                deflLimit={state.deflLimit}
                mode="screen"
                width={diagW}
                height={diagH}
              />
            )}
          </div>

          {/* Results */}
          <div className="px-6 py-5">
            <SteelBeamsResults result={result} deflLimit={state.deflLimit} />
          </div>
        </div>

        {/* Mobile: Diagramas tab — cross-section + M/V/delta stacked */}
        {tab === 'diagramas' && (
          <div className="flex-1 overflow-y-auto scroll-hide md:hidden flex flex-col items-center py-4 px-4 gap-6 canvas-dot-grid">
            <SteelBeamsSVG inp={effectiveInputs} result={result} mode="screen" width={340} height={Math.round(340 * (280 / 420))} />
            {loadGen && result.valid && (
              <SteelBeamsDiagrams
                beamType={state.beamType}
                MEd={loadGen.MEd}
                VEdA={loadGen.VEd}
                VEdB={state.beamType === 'fp' ? loadGen.VEd * (3 / 5) : loadGen.VEd}
                L={effectiveInputs.L}
                deltaMax={result.delta_max}
                deltaAdm={result.delta_adm}
                deflLimit={state.deflLimit}
                mode="screen"
                width={340}
                height={Math.round(340 * (280 / 400))}
              />
            )}
          </div>
        )}

      </div>

      {/* Hidden PDF clones — wrapped to prevent mobile horizontal scroll */}
      <div className="overflow-hidden w-0 h-0" aria-hidden="true">
        <div
          id="steel-beams-svg-pdf"
          style={{ position: 'absolute', left: '-9999px', top: 0, pointerEvents: 'none' }}
        >
          <SteelBeamsSVG inp={effectiveInputs} result={result} mode="pdf" width={420} height={260} />
        </div>

        <div
          id="steel-beams-diagrams-pdf"
          style={{ position: 'absolute', left: '-9999px', top: 0, pointerEvents: 'none' }}
        >
          {loadGen && result.valid && (
            <SteelBeamsDiagrams
              beamType={state.beamType}
              MEd={loadGen.MEd}
              VEdA={loadGen.VEd}
              VEdB={state.beamType === 'fp' ? loadGen.VEd * (3 / 5) : loadGen.VEd}
              L={effectiveInputs.L}
              deltaMax={result.delta_max}
              deltaAdm={result.delta_adm}
              deflLimit={state.deflLimit}
              mode="pdf"
              width={420}
              height={220}
            />
          )}
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
