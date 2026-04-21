import { useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { timberColumnDefaults } from '../../data/defaults';
import { useModuleState } from '../../hooks/useModuleState';
import { useContainerWidth } from '../../hooks/useContainerWidth';
import { usePdfPreview } from '../../hooks/usePdfPreview';
import { useDrawer } from '../../components/layout/AppShell';
import { calcTimberColumn } from '../../lib/calculations/timberColumns';
import { exportTimberColumnsPDF } from '../../lib/pdf/timberColumns';
import { useUnitSystem } from '../../lib/units/useUnitSystem';
import { Topbar } from '../../components/layout/Topbar';
import { PdfPreviewModal } from '../../components/ui/PdfPreviewModal';
import { MobileTabBar, type MobileTab } from '../../components/ui/MobileTabBar';
import { TimberColumnsInputs } from './TimberColumnsInputs';
import { TimberColumnsSVG } from './TimberColumnsSVG';
import { TimberColumnsResults } from './TimberColumnsResults';

export function TimberColumnsModule() {
  const { state, setField, reset } = useModuleState('timber-columns', timberColumnDefaults);
  const { openDrawer } = useDrawer();
  const { system } = useUnitSystem();
  const [tab, setTab] = useState<MobileTab>('inputs');

  const result = useMemo(() => calcTimberColumn(state as never), [state]);

  const { pdfExporting, pdfPreview, handleExportPdf, handleDownloadPdf, closePdfPreview } =
    usePdfPreview(() => exportTimberColumnsPDF(state as never, result, system), true);

  const [canvasRef, canvasWidth] = useContainerWidth();
  const SVG_W = Math.min(Math.max((canvasWidth ?? 0) - 32, 240), 760);
  const SVG_H = Math.round(SVG_W * (200 / 760));

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <Helmet>
        <title>Pilares de madera — Concreta</title>
        <meta name="description" content="Pandeo biaxial y resistencia al fuego en pilares de madera. EC5 EN 1995-1-1 §6.3." />
      </Helmet>
      <Topbar
        moduleLabel="Pilares de madera"
        moduleGroup="Madera"
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
            <TimberColumnsInputs state={state as never} setField={setField as never} />
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
            className="hidden md:flex border-b border-border-main canvas-dot-grid items-center justify-center py-6 px-4"
          >
            {SVG_W > 0 && (
              <TimberColumnsSVG inp={state as never} result={result} mode="screen" width={SVG_W} height={SVG_H} />
            )}
          </div>

          {/* Results */}
          <div className="px-6 py-5">
            <TimberColumnsResults result={result} />
          </div>
        </div>

        {/* Mobile: Diagramas tab */}
        {tab === 'diagramas' && (
          <div className="flex-1 overflow-y-auto scroll-hide md:hidden flex flex-col items-center py-4 px-4 gap-4 canvas-dot-grid">
            <TimberColumnsSVG inp={state as never} result={result} mode="screen" width={340} height={Math.round(340 * (200 / 760))} />
          </div>
        )}

      </div>

      {/* Hidden PDF SVG */}
      <div className="overflow-hidden w-0 h-0" aria-hidden="true">
        <div
          id="timber-columns-svg-pdf"
          style={{ position: 'absolute', left: '-9999px', top: 0, pointerEvents: 'none' }}
        >
          <TimberColumnsSVG inp={state as never} result={result} mode="pdf" width={760} height={200} />
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
