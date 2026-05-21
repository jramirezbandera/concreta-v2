import { useDeferredValue, useMemo, useState } from 'react';
import { anchorPlateDefaults } from '../../data/defaults';
import { useModuleState } from '../../hooks/useModuleState';
import { useContainerWidth } from '../../hooks/useContainerWidth';
import { usePdfPreview } from '../../hooks/usePdfPreview';
import { useDrawer } from '../../components/layout/AppShell';
import { calcAnchorPlate } from '../../lib/calculations/anchorPlate';
import { exportAnchorPlatePDF } from '../../lib/pdf/anchorPlate';
import { useUnitSystem } from '../../lib/units/useUnitSystem';
import { Topbar } from '../../components/layout/Topbar';
import { PdfPreviewModal } from '../../components/ui/PdfPreviewModal';
import { MobileTabBar, type MobileTab } from '../../components/ui/MobileTabBar';
import { AnchorPlateInputsPanel } from './AnchorPlateInputs';
import { AnchorPlateSVG } from './AnchorPlateSVG';
import { AnchorPlateResults } from './AnchorPlateResults';

export function AnchorPlateModule() {
  const { state, setField, reset } = useModuleState('anchor-plate', anchorPlateDefaults);
  const { openDrawer } = useDrawer();
  const { system } = useUnitSystem();
  const [tab, setTab] = useState<MobileTab>('inputs');

  // M6 (Phase 2 Tier 3): el solver biaxial puede ejecutar ~25-50k clips
  // poligonales (multi-seed M22 incluido). Recomputar en cada keystroke
  // bloquea el input en móvil. useDeferredValue marca la recomputación como
  // baja prioridad: React aplaza el render hasta que el input está idle.
  // El PDF recibe deferredState/result para que ambos estén siempre en sync.
  const deferredState = useDeferredValue(state);
  const result = useMemo(() => calcAnchorPlate(deferredState, system), [deferredState, system]);

  const { pdfExporting, pdfPreview, handleExportPdf, handleDownloadPdf, closePdfPreview } =
    usePdfPreview(() => exportAnchorPlatePDF(deferredState, result, system), true);

  const [canvasRef, canvasWidth] = useContainerWidth();

  const FIXED_SVG_W = 420;
  const CANVAS_PAD = 32;
  const svgW = canvasWidth !== undefined && canvasWidth > 0
    ? Math.min(FIXED_SVG_W, Math.max(260, canvasWidth - CANVAS_PAD))
    : FIXED_SVG_W;
  const svgH = Math.round(svgW * 1.1);

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <Topbar
        moduleLabel="Placas de anclaje"
        moduleGroup="Acero"
        onExportPdf={handleExportPdf}
        pdfExporting={pdfExporting}
        onMenuOpen={openDrawer}
      />
      <MobileTabBar tab={tab} setTab={setTab} />

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left: inputs */}
        <div
          className={[
            'flex flex-col min-h-0 overflow-hidden bg-bg-surface',
            'lg:w-72 lg:shrink-0 lg:border-r lg:border-border-main',
            tab === 'inputs' ? 'max-lg:flex-1' : 'max-lg:hidden',
            'lg:flex',
          ].join(' ')}
        >
          <div className="flex-1 overflow-y-auto scroll-hide px-5 py-4">
            <AnchorPlateInputsPanel state={state} setField={setField} warnings={result.warnings} />
          </div>
          <div className="hidden lg:block px-5 py-3 border-t border-border-main shrink-0">
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
            'lg:flex-1',
            tab === 'results' ? 'flex-1' : 'hidden',
            'lg:block',
          ].join(' ')}
        >
          <div
            ref={canvasRef}
            className="hidden lg:flex border-b border-border-main canvas-dot-grid items-center justify-center py-6 px-4"
          >
            <AnchorPlateSVG
              inp={deferredState}
              result={result}
              mode="screen"
              width={svgW}
              height={svgH}
            />
          </div>

          <div className="px-6 py-5">
            <AnchorPlateResults result={result} />
          </div>
        </div>

        {/* Mobile: Diagramas tab */}
        {tab === 'diagramas' && (
          <div className="flex-1 overflow-y-auto scroll-hide lg:hidden flex flex-col items-center py-4 px-4 gap-4 canvas-dot-grid">
            <AnchorPlateSVG
              inp={deferredState}
              result={result}
              mode="screen"
              width={320}
              height={Math.round(320 * 1.1)}
            />
          </div>
        )}
      </div>

      {/* Hidden PDF clone */}
      <div className="overflow-hidden w-0 h-0" aria-hidden="true">
        <div
          id="anchor-plate-svg-pdf"
          style={{ position: 'absolute', left: '-9999px', top: 0, pointerEvents: 'none' }}
        >
          <AnchorPlateSVG
            inp={deferredState}
            result={result}
            mode="pdf"
            width={420}
            height={460}
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
