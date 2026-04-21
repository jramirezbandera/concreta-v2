import { useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { rcColumnDefaults } from '../../data/defaults';
import { useModuleState } from '../../hooks/useModuleState';
import { useContainerWidth } from '../../hooks/useContainerWidth';
import { usePdfPreview } from '../../hooks/usePdfPreview';
import { useDrawer } from '../../components/layout/AppShell';
import { calcRCColumn } from '../../lib/calculations/rcColumns';
import { exportRCColumnsPDF } from '../../lib/pdf/rcColumns';
import { useUnitSystem } from '../../lib/units/useUnitSystem';
import { Topbar } from '../../components/layout/Topbar';
import { PdfPreviewModal } from '../../components/ui/PdfPreviewModal';
import { MobileTabBar, type MobileTab } from '../../components/ui/MobileTabBar';
import { RCColumnsInputs } from './RCColumnsInputs';
import { RCColumnsSVG } from './RCColumnsSVG';
import { RCColumnsResults } from './RCColumnsResults';

export function RCColumnsModule() {
  const { state, setField, reset } = useModuleState('rc-columns', rcColumnDefaults);
  const { openDrawer } = useDrawer();
  const { system } = useUnitSystem();
  const [tab, setTab] = useState<MobileTab>('inputs');

  const result = useMemo(() => calcRCColumn(state), [state]);

  // PDF export stays available even when result is invalid — engineers may
  // need a PDF to document a failing/non-conforming section (memory note).
  const { pdfExporting, pdfPreview, handleExportPdf, handleDownloadPdf, closePdfPreview } =
    usePdfPreview(() => exportRCColumnsPDF(state, result, system), true);

  const [canvasRef, canvasWidth] = useContainerWidth();
  const CANVAS_PAD = 32;
  const MAX_SVG_H  = 300;  // cap height so canvas doesn't dominate — matches RC beams
  const svgW = canvasWidth ? Math.max(180, Math.min(320, canvasWidth - CANVAS_PAD)) : 260;
  const svgH = Math.min(MAX_SVG_H, Math.round(svgW * 1.15));

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <Helmet>
        <title>Pilares de hormigón armado — Concreta</title>
        <meta name="description" content="Compresión y pandeo biaxial en pilares de HA. Código Estructural art. 35." />
      </Helmet>
      <Topbar
        moduleLabel="Pilares"
        moduleGroup="Hormigón Armado"
        onExportPdf={handleExportPdf}
        pdfExporting={pdfExporting}
        onMenuOpen={openDrawer}
      />
      <MobileTabBar tab={tab} setTab={setTab} />

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
            <RCColumnsInputs state={state} setField={setField} />
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
          {/* SVG canvas */}
          <div
            ref={canvasRef}
            className="hidden md:flex justify-center items-start border-b border-border-main canvas-dot-grid py-4 px-4"
          >
            <RCColumnsSVG
              inp={state}
              result={result}
              mode="screen"
              width={svgW}
              height={svgH}
            />
          </div>

          {/* Results */}
          <div className="px-6 py-5">
            <RCColumnsResults result={result} />
          </div>
        </div>
        {/* Mobile: Diagramas tab */}
        {tab === 'diagramas' && (
          <div className="flex-1 overflow-y-auto scroll-hide md:hidden flex flex-col items-center py-4 px-4 gap-4 canvas-dot-grid">
            <RCColumnsSVG inp={state} result={result} mode="screen" width={340} height={Math.round(340 * 1.15)} />
          </div>
        )}

      </div>

      {/* Hidden PDF clone */}
      <div className="overflow-hidden w-0 h-0" aria-hidden="true">
        <div
          id="rc-columns-svg-pdf"
          style={{ position: 'absolute', left: '-9999px', top: 0, pointerEvents: 'none' }}
        >
          <RCColumnsSVG inp={state} result={result} mode="pdf" width={320} height={370} />
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
