import { useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
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

  const result = useMemo(() => calcAnchorPlate(state, system), [state, system]);

  const { pdfExporting, pdfPreview, handleExportPdf, handleDownloadPdf, closePdfPreview } =
    usePdfPreview(() => exportAnchorPlatePDF(state, result, system), true);

  const [canvasRef, canvasWidth] = useContainerWidth();

  const FIXED_SVG_W = 420;
  const CANVAS_PAD = 32;
  const svgW = canvasWidth !== undefined && canvasWidth > 0
    ? Math.min(FIXED_SVG_W, Math.max(260, canvasWidth - CANVAS_PAD))
    : FIXED_SVG_W;
  const svgH = Math.round(svgW * 1.1);

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <Helmet>
        <title>Placas de anclaje — Concreta</title>
        <meta
          name="description"
          content="Placas de anclaje atornilladas. EC3 §6.2.5 (T-stub), EN 1992-4 (pernos)."
        />
      </Helmet>
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
            'md:w-72 md:shrink-0 md:border-r md:border-border-main',
            tab === 'inputs' ? 'max-md:flex-1' : 'max-md:hidden',
            'md:flex',
          ].join(' ')}
        >
          <div className="flex-1 overflow-y-auto scroll-hide px-5 py-4">
            <AnchorPlateInputsPanel state={state} setField={setField} warnings={result.warnings} />
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
          <div
            ref={canvasRef}
            className="hidden md:flex border-b border-border-main canvas-dot-grid items-center justify-center py-6 px-4"
          >
            <AnchorPlateSVG
              inp={state}
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
          <div className="flex-1 overflow-y-auto scroll-hide md:hidden flex flex-col items-center py-4 px-4 gap-4 canvas-dot-grid">
            <AnchorPlateSVG
              inp={state}
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
            inp={state}
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
