import { useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { steelColumnDefaults } from '../../data/defaults';
import { useModuleState } from '../../hooks/useModuleState';
import { useContainerWidth } from '../../hooks/useContainerWidth';
import { usePdfPreview } from '../../hooks/usePdfPreview';
import { useDrawer } from '../../components/layout/AppShell';
import { calcSteelColumn } from '../../lib/calculations/steelColumns';
import { getBetaForBCType } from '../../lib/calculations/steelColumnBC';
import { exportSteelColumnsPDF } from '../../lib/pdf/steelColumns';
import { useUnitSystem } from '../../lib/units/useUnitSystem';
import { Topbar } from '../../components/layout/Topbar';
import { PdfPreviewModal } from '../../components/ui/PdfPreviewModal';
import { MobileTabBar, type MobileTab } from '../../components/ui/MobileTabBar';
import { SteelColumnsInputs } from './SteelColumnsInputs';
import { SteelColumnsSVG } from './SteelColumnsSVG';
import { SteelColumnsResults } from './SteelColumnsResults';

export function SteelColumnsModule() {
  const { state, setField, reset } = useModuleState('steel-columns', steelColumnDefaults);
  const { openDrawer } = useDrawer();
  const { system } = useUnitSystem();
  const [tab, setTab] = useState<MobileTab>('inputs');

  // Resolve effective inputs: derive beta from shared bcType (non-custom)
  const effectiveInputs = useMemo(() => {
    if (state.bcType === 'custom') return state;
    const { beta_y, beta_z } = getBetaForBCType(state.bcType, state.beta_y, state.beta_z);
    return { ...state, beta_y, beta_z };
  }, [state]);

  const result = useMemo(() => calcSteelColumn(effectiveInputs), [effectiveInputs]);

  const zeroLoads = state.Ned === 0 && state.My_Ed === 0 && state.Mz_Ed === 0;

  // PDF export stays available even when the result is invalid (e.g. Class 4,
  // overall INCUMPLE) — the user may want a PDF to document that a profile
  // doesn't meet EC3. Only require a result object.
  const { pdfExporting, pdfPreview, handleExportPdf, handleDownloadPdf, closePdfPreview } =
    usePdfPreview(() => exportSteelColumnsPDF(effectiveInputs, result, system), true);

  // Responsive SVG sizing
  const [canvasRef, canvasWidth] = useContainerWidth();

  const FIXED_SVG_W   = 360;  // cross-section (1:1)
  const FIXED_DIAG_W  = 260;  // geometry panel (portrait)
  const CANVAS_PAD    = 32;
  const GAP           = 32;
  const TOTAL_FIXED   = FIXED_SVG_W + GAP + FIXED_DIAG_W + CANVAS_PAD;
  const STACK_THRESHOLD = 700;
  const isStacked = (canvasWidth ?? 0) < STACK_THRESHOLD;

  let svgW = FIXED_SVG_W;

  if (isStacked && canvasWidth !== undefined && canvasWidth > 0) {
    const available = canvasWidth - CANVAS_PAD;
    svgW = Math.min(FIXED_SVG_W + FIXED_DIAG_W, Math.max(200, available));
  } else if (!isStacked && canvasWidth !== undefined && canvasWidth > 0 && canvasWidth < TOTAL_FIXED) {
    const available = canvasWidth - CANVAS_PAD - GAP;
    svgW = Math.max(200, Math.round(available));
  }

  // Single SVG with both panels side-by-side, fixed total width
  const totalSvgW = isStacked ? svgW : Math.min(FIXED_SVG_W + FIXED_DIAG_W, svgW);
  const svgH = Math.round(totalSvgW * 0.7); // taller to give column geometry more room

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <Helmet>
        <title>Pilares de acero — Concreta</title>
        <meta name="description" content="Pandeo y empresillado en pilares de acero. EC3 §6.4." />
      </Helmet>
      <Topbar
        moduleLabel="Pilares"
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
            'flex flex-col min-h-0 overflow-hidden bg-bg-surface',
            'md:w-72 md:shrink-0 md:border-r md:border-border-main',
            tab === 'inputs' ? 'max-md:flex-1' : 'max-md:hidden',
            'md:flex',
          ].join(' ')}
        >
          <div className="flex-1 overflow-y-auto scroll-hide px-5 py-4">
            <SteelColumnsInputs state={state} setField={setField} />
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

        {/* Right: SVG canvas + results */}
        <div
          className={[
            'min-w-0 overflow-y-auto scroll-hide',
            'md:flex-1',
            tab === 'results' ? 'flex-1' : 'hidden',
            'md:block',
          ].join(' ')}
        >
          {/* SVG canvas — desktop only */}
          <div
            ref={canvasRef}
            className="hidden md:flex border-b border-border-main canvas-dot-grid items-center justify-center py-6 px-4"
          >
            <SteelColumnsSVG
              inp={effectiveInputs}
              result={result}
              mode="screen"
              width={totalSvgW}
              height={svgH}
            />
          </div>

          {/* Results */}
          <div className="px-6 py-5">
            <SteelColumnsResults result={result} zeroLoads={zeroLoads} />
          </div>
        </div>

        {/* Mobile: Diagramas tab */}
        {tab === 'diagramas' && (
          <div className="flex-1 overflow-y-auto scroll-hide md:hidden flex flex-col items-center py-4 px-4 gap-4 canvas-dot-grid">
            <SteelColumnsSVG inp={effectiveInputs} result={result} mode="screen" width={340} height={Math.round(340 * 0.7)} />
          </div>
        )}

      </div>

      {/* Hidden PDF clone — off-screen */}
      <div className="overflow-hidden w-0 h-0" aria-hidden="true">
        <div
          id="steel-columns-svg-pdf"
          style={{ position: 'absolute', left: '-9999px', top: 0, pointerEvents: 'none' }}
        >
          <SteelColumnsSVG
            inp={effectiveInputs}
            result={result}
            mode="pdf"
            width={380}
            height={190}
          />
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

