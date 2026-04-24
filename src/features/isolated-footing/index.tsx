import { useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { isolatedFootingDefaults } from '../../data/defaults';
import { useModuleState } from '../../hooks/useModuleState';
import { useContainerWidth } from '../../hooks/useContainerWidth';
import { usePdfPreview } from '../../hooks/usePdfPreview';
import { useDrawer } from '../../components/layout/AppShell';
import { calcIsolatedFooting } from '../../lib/calculations/isolatedFooting';
import { exportIsolatedFootingPDF } from '../../lib/pdf/isolatedFooting';
import { useUnitSystem } from '../../lib/units/useUnitSystem';
import { Topbar } from '../../components/layout/Topbar';
import { PdfPreviewModal } from '../../components/ui/PdfPreviewModal';
import { MobileTabBar, type MobileTab } from '../../components/ui/MobileTabBar';
import { IsolatedFootingInputsPanel } from './IsolatedFootingInputsPanel';
import { IsolatedFootingResults } from './IsolatedFootingResults';
import { IsolatedFootingSVG } from './IsolatedFootingSVG';

export function IsolatedFootingModule() {
  const { state, setField, reset } = useModuleState('isolated-footing', isolatedFootingDefaults);
  const { openDrawer } = useDrawer();
  const { system } = useUnitSystem();
  const [tab, setTab] = useState<MobileTab>('inputs');

  const result = useMemo(() => calcIsolatedFooting(state), [state]);

  // PDF export stays available even when result is invalid — engineers may
  // need a PDF to document a failing/non-conforming section (memory note).
  const { pdfExporting, pdfPreview, handleExportPdf, handleDownloadPdf, closePdfPreview } =
    usePdfPreview(() => exportIsolatedFootingPDF(state, result, system), true);

  const [canvasRef, canvasWidth] = useContainerWidth();
  const svgW = canvasWidth !== undefined && canvasWidth > 0
    ? Math.max(200, canvasWidth - 32)
    : 360;

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <Helmet>
        <title>Zapatas aisladas — Concreta</title>
        <meta name="description" content="Cálculo de zapata aislada: presiones, armadura y comprobaciones. CTE DB-SE-C art. 4.3." />
      </Helmet>
      <Topbar
        moduleLabel="Zapatas"
        moduleGroup="Cimentación"
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
          <div className="flex-1 overflow-y-auto scroll-hide px-4 py-4">
            <IsolatedFootingInputsPanel state={state} setField={setField} />
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
          {/* SVG canvas — desktop */}
          <div
            ref={canvasRef}
            className="hidden md:flex justify-center border-b border-border-main canvas-dot-grid py-4 px-4 min-h-90 items-start"
          >
            <IsolatedFootingSVG inp={state} result={result} width={Math.min(svgW, 960)} mode="screen" system={system} />
          </div>

          {/* Results */}
          <div className="px-2 py-3">
            <IsolatedFootingResults inp={state} result={result} />
          </div>
        </div>

        {/* Mobile: Diagramas tab */}
        {tab === 'diagramas' && (
          <div className="flex-1 overflow-y-auto scroll-hide md:hidden flex flex-col items-center py-4 px-4 gap-4 canvas-dot-grid">
            <IsolatedFootingSVG inp={state} result={result} width={340} mode="screen" system={system} />
          </div>
        )}

      </div>

      {/* Hidden PDF clone */}
      <div className="overflow-hidden w-0 h-0" aria-hidden="true">
        <div
          id="isolated-footing-svg-pdf"
          style={{ position: 'absolute', left: '-9999px', top: 0, pointerEvents: 'none' }}
        >
          <IsolatedFootingSVG inp={state} result={result} mode="pdf" width={320} system={system} />
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
