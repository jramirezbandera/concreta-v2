import { useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { empresalladoDefaults } from '../../data/defaults';
import { useModuleState } from '../../hooks/useModuleState';
import { useContainerWidth } from '../../hooks/useContainerWidth';
import { usePdfPreview } from '../../hooks/usePdfPreview';
import { useDrawer } from '../../components/layout/AppShell';
import { calcEmpresillado } from '../../lib/calculations/empresillado';
import { exportEmpresalladoPDF } from '../../lib/pdf/empresillado';
import { Topbar } from '../../components/layout/Topbar';
import { PdfPreviewModal } from '../../components/ui/PdfPreviewModal';
import { MobileTabBar, type MobileTab } from '../../components/ui/MobileTabBar';
import { EmpresalladoInputsPanel } from './EmpresalladoInputs';
import { EmpresalladoSvg } from './EmpresalladoSvg';
import { EmpresalladoResults } from './EmpresalladoResults';

export function EmpresalladoModule() {
  const { state, setField, reset } = useModuleState('empresillado', empresalladoDefaults);
  const { openDrawer } = useDrawer();
  const [tab, setTab] = useState<MobileTab>('inputs');

  const result = useMemo(() => calcEmpresillado(state), [state]);
  const sError = state.s <= state.lp;

  const { pdfExporting, pdfPreview, handleExportPdf, handleDownloadPdf, closePdfPreview } =
    usePdfPreview(() => exportEmpresalladoPDF(state, result), result.valid);

  const [canvasRef, canvasWidth] = useContainerWidth();
  const SVG_W = Math.min(Math.max((canvasWidth ?? 0) - 32, 240), 760);
  const SVG_H = Math.round(SVG_W * (240 / 760));

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <Helmet>
        <title>Pilar empresillado — Concreta</title>
        <meta name="description" content="Pilar compuesto batido (empresillado). EC3 §6.4.2." />
      </Helmet>
      <Topbar
        moduleLabel="Empresillado"
        moduleGroup="Rehabilitación"
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
            <EmpresalladoInputsPanel state={state} setField={setField} sError={sError} />
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
              <EmpresalladoSvg inp={state} result={result} mode="screen" width={SVG_W} height={SVG_H} />
            )}
          </div>

          {/* Error banner when s ≤ lp */}
          {sError && (
            <div className="mx-6 mt-4 flex items-center gap-2 rounded border border-state-fail/30 bg-state-fail/5 px-3 py-2">
              <span className="text-[11px] text-state-fail">⚠ Geometría inválida — s ≤ lp. Corrija la separación de pletinas.</span>
            </div>
          )}

          {/* Results */}
          <div className="px-6 py-5">
            <EmpresalladoResults result={result} inp={state} />
          </div>
        </div>

        {/* Mobile: Diagramas tab */}
        {tab === 'diagramas' && (
          <div className="flex-1 overflow-y-auto scroll-hide md:hidden flex flex-col items-center py-4 px-4 gap-4 canvas-dot-grid">
            <EmpresalladoSvg inp={state} result={result} mode="screen" width={340} height={Math.round(340 * (240 / 760))} />
          </div>
        )}

      </div>

      {/* Hidden PDF SVG */}
      <div className="overflow-hidden w-0 h-0" aria-hidden="true">
        <div
          id="empresillado-svg-pdf"
          style={{ position: 'absolute', left: '-9999px', top: 0, pointerEvents: 'none' }}
        >
          <EmpresalladoSvg inp={state} result={result} mode="pdf" width={600} height={480} />
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
