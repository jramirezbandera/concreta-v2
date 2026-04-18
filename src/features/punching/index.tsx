import { useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { punchingDefaults } from '../../data/defaults';
import { useModuleState } from '../../hooks/useModuleState';
import { useContainerWidth } from '../../hooks/useContainerWidth';
import { usePdfPreview } from '../../hooks/usePdfPreview';
import { useDrawer } from '../../components/layout/AppShell';
import { calcPunching } from '../../lib/calculations/punching';
import { exportPunchingPDF } from '../../lib/pdf/punching';
import { Topbar } from '../../components/layout/Topbar';
import { PdfPreviewModal } from '../../components/ui/PdfPreviewModal';
import { MobileTabBar, type MobileTab } from '../../components/ui/MobileTabBar';
import { PunchingInputsPanel } from './PunchingInputs';
import { PunchingResults } from './PunchingResults';
import { PunchingSVG } from './PunchingSVG';

export function PunchingModule() {
  const { state, setField } = useModuleState('punching', punchingDefaults);
  const { openDrawer } = useDrawer();
  const [tab, setTab] = useState<MobileTab>('inputs');

  const result = useMemo(() => calcPunching(state), [state]);

  const { pdfExporting, pdfPreview, handleExportPdf, handleDownloadPdf, closePdfPreview } =
    usePdfPreview(() => exportPunchingPDF(state, result), result.valid);

  const [canvasRef, canvasWidth] = useContainerWidth();
  const svgW = canvasWidth !== undefined && canvasWidth > 0
    ? Math.max(200, canvasWidth - 32)
    : 360;

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <Helmet>
        <title>Punzonamiento en losa — Concreta</title>
        <meta name="description" content="Comprobación de punzonamiento en losa maciza, perímetros críticos. Código Estructural art. 6.4." />
      </Helmet>
      <Topbar
        moduleLabel="Punzonamiento"
        moduleGroup="Hormigón"
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
            <PunchingInputsPanel state={state} setField={setField} />
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
          {/* SVG canvas — desktop only (mobile has 'Esquema' tab) */}
          <div
            ref={canvasRef}
            className="hidden md:flex justify-center border-b border-border-main canvas-dot-grid py-4 px-4"
          >
            <PunchingSVG inp={state} result={result} width={Math.min(svgW, 440)} mode="screen" />
          </div>

          {/* Results */}
          <div className="px-6 py-5">
            <PunchingResults result={result} />
          </div>
        </div>

        {/* Mobile: Diagramas tab */}
        {tab === 'diagramas' && (
          <div className="flex-1 overflow-y-auto scroll-hide canvas-dot-grid md:hidden flex flex-col items-center py-4 px-4 gap-4">
            <PunchingSVG inp={state} result={result} width={340} mode="screen" />
          </div>
        )}

      </div>

      {/* Hidden PDF SVG */}
      <div className="overflow-hidden w-0 h-0" aria-hidden="true">
        <div
          id="punching-svg-pdf"
          style={{ position: 'absolute', left: '-9999px', top: 0, pointerEvents: 'none' }}
        >
          <PunchingSVG inp={state} result={result} width={440} mode="pdf" />
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
