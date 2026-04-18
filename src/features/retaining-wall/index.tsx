import { useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { retainingWallDefaults } from '../../data/defaults';
import { useModuleState } from '../../hooks/useModuleState';
import { useContainerWidth } from '../../hooks/useContainerWidth';
import { usePdfPreview } from '../../hooks/usePdfPreview';
import { useDrawer } from '../../components/layout/AppShell';
import { calcRetainingWall } from '../../lib/calculations/retainingWall';
import { exportRetainingWallPDF } from '../../lib/pdf/retainingWall';
import { Topbar } from '../../components/layout/Topbar';
import { PdfPreviewModal } from '../../components/ui/PdfPreviewModal';
import { MobileTabBar, type MobileTab } from '../../components/ui/MobileTabBar';
import { RetainingWallInputsPanel } from './RetainingWallInputs';
import { RetainingWallSVG } from './RetainingWallSVG';
import { RetainingWallResults } from './RetainingWallResults';

export function RetainingWallModule() {
  const { state, setField, reset } = useModuleState('retaining-wall', retainingWallDefaults);
  const { openDrawer } = useDrawer();
  const [tab, setTab] = useState<MobileTab>('inputs');

  const result = useMemo(() => calcRetainingWall(state), [state]);

  const { pdfExporting, pdfPreview, handleExportPdf, handleDownloadPdf, closePdfPreview } =
    usePdfPreview(() => exportRetainingWallPDF(state, result), result.valid);

  const [canvasRef, canvasWidth] = useContainerWidth();
  const svgW = canvasWidth !== undefined && canvasWidth > 0
    ? Math.max(200, canvasWidth - 32)
    : 380;
  const svgH = Math.round(svgW * (480 / 420));

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <Helmet>
        <title>Muros de contención — Concreta</title>
        <meta name="description" content="Muro de hormigón armado con nivel freático. Código Estructural art. 9." />
      </Helmet>
      <Topbar
        moduleLabel="Muros"
        moduleGroup="Cimentación"
        onExportPdf={handleExportPdf}
        pdfExporting={pdfExporting}
        onMenuOpen={openDrawer}
      />
      <MobileTabBar tab={tab} setTab={setTab} />

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
          <div className="flex-1 overflow-y-auto scroll-hide px-4 py-4">
            <RetainingWallInputsPanel state={state} setField={setField} />
          </div>
          <div className="hidden md:block px-4 py-3 border-t border-border-main shrink-0">
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
          {/* SVG canvas */}
          <div
            ref={canvasRef}
            className="hidden md:flex justify-center border-b border-border-main canvas-dot-grid py-4 px-4"
          >
            <RetainingWallSVG
              inp={state}
              result={result}
              mode="screen"
              width={Math.min(svgW, 500)}
              height={Math.min(svgH, 560)}
            />
          </div>

          {/* Results */}
          <div className="px-6 py-5">
            <RetainingWallResults result={result} inp={state} />
          </div>
        </div>

        {/* Mobile: Diagramas tab */}
        {tab === 'diagramas' && (
          <div className="flex-1 overflow-y-auto scroll-hide md:hidden flex flex-col items-center py-4 px-4 gap-4 canvas-dot-grid">
            <RetainingWallSVG inp={state} result={result} mode="screen" width={340} height={Math.round(340 * (480 / 420))} />
          </div>
        )}

      </div>

      {/* Hidden PDF clone */}
      <div style={{ position: 'absolute', left: '-9999px', top: 0, pointerEvents: 'none' }} aria-hidden="true">
        <div id="retaining-wall-svg-pdf">
          <RetainingWallSVG inp={state} result={result} mode="pdf" width={380} height={430} />
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
