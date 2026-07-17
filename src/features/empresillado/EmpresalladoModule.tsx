import { useMemo, useState } from 'react';
import { empresalladoDefaults, type EmpresalladoInputs } from '../../data/defaults';
import { useModuleState } from '../../hooks/useModuleState';
import { useContainerWidth } from '../../hooks/useContainerWidth';
import { useTitledPdfExport } from '../../hooks/useTitledPdfExport';
import { useDrawer } from '../../components/layout/AppShell';
import { calcEmpresillado } from '../../lib/calculations/empresillado';
import { exportEmpresalladoPDF, empresalladoFallbackFilename } from '../../lib/pdf/empresillado';
import { useUnitSystem } from '../../lib/units/useUnitSystem';
import type { AiApplyPlan } from '../../lib/ai/modules/types';
import { empresalladoAdapter, summarizeEmpresalladoResults } from '../../lib/ai/modules/empresillado';
import { Topbar } from '../../components/layout/Topbar';
import { AiChatModal } from '../../components/ai/AiChatModal';
import { PdfPreviewModal } from '../../components/ui/PdfPreviewModal';
import { TitlePromptModal } from '../../components/ui/TitlePromptModal';
import { MobileTabBar, type MobileTab } from '../../components/ui/MobileTabBar';
import { showToast } from '../../components/ui/Toast';
import { EmpresalladoInputsPanel } from './EmpresalladoInputs';
import { EmpresalladoSvg } from './EmpresalladoSvg';
import { EmpresalladoResults } from './EmpresalladoResults';

export function EmpresalladoModule() {
  const { state, setField, reset, copyShareLink } = useModuleState('empresillado', empresalladoDefaults);
  const { openDrawer } = useDrawer();
  const { system } = useUnitSystem();
  const [tab, setTab] = useState<MobileTab>('inputs');

  // "Rellenar con IA" (ola 1)
  const [aiOpen, setAiOpen] = useState(false);

  const handleAiApply = (plan: AiApplyPlan<EmpresalladoInputs>) => {
    const ORDER: (keyof EmpresalladoInputs)[] = [
      'bc', 'hc', 'L', 'N_Ed', 'Mx_Ed', 'My_Ed', 'Vd',
      'perfil', 'fy', 'beta_x', 'beta_y',
      's', 'lp', 'bp', 'tp',
    ];
    for (const k of ORDER) {
      const v = plan.fields[k];
      if (v !== undefined) setField(k, v as EmpresalladoInputs[typeof k]);
    }
    const n = plan.changes.length;
    const w = plan.warnings.length;
    showToast(
      `IA: ${n} campo${n === 1 ? '' : 's'} aplicado${n === 1 ? '' : 's'}${w ? ` · ${w} aviso${w === 1 ? '' : 's'}` : ''}`,
      { autoDismiss: 4000 },
    );
  };

  const result = useMemo(() => calcEmpresillado(state), [state]);
  // Resumen de resultados para el prompt del chat IA (bucle de dimensionado)
  const aiResults = useMemo(() => summarizeEmpresalladoResults(result), [result]);
  const sError = state.s <= state.lp;

  const { pdfExporting, pdfPreview, handleDownloadPdf, closePdfPreview, titleOpen, openExport, confirmTitle, closeTitle } =
    useTitledPdfExport({
      exportFn: (title) => exportEmpresalladoPDF(state, result, system, title),
      valid: true,
      onTitleChange: (t) => setField('title', t),
    });

  const [canvasRef, canvasWidth] = useContainerWidth();
  const SVG_W = Math.min(Math.max((canvasWidth ?? 0) - 32, 240), 760);
  const SVG_H = Math.round(SVG_W * (240 / 760));
  // Mobile "Diagramas" tab measures its own container so the SVG scales to the
  // phone instead of a fixed 340px that overflowed on narrow screens.
  const [mobileCanvasRef, mobileCanvasWidth] = useContainerWidth();
  const mobileW = mobileCanvasWidth ? Math.min(760, Math.max(240, mobileCanvasWidth - 32)) : 300;

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <Topbar
        moduleLabel="Empresillado"
        moduleGroup="Rehabilitación"
        onExportPdf={openExport}
        pdfExporting={pdfExporting}
        onMenuOpen={openDrawer}
        onCopyLink={copyShareLink}
        onOpenAssistant={() => setAiOpen(true)}
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
            <EmpresalladoInputsPanel state={state} setField={setField} sError={sError} />
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
          {/* SVG canvas */}
          <div
            ref={canvasRef}
            className="hidden lg:flex border-b border-border-main canvas-dot-grid items-center justify-center py-6 px-4"
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
          <div ref={mobileCanvasRef} className="flex-1 overflow-y-auto scroll-hide lg:hidden flex flex-col items-center py-4 px-4 gap-4 canvas-dot-grid">
            <EmpresalladoSvg inp={state} result={result} mode="screen" width={mobileW} height={Math.round(mobileW * (240 / 760))} />
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

      {aiOpen && (
        <AiChatModal
          adapter={empresalladoAdapter}
          current={state}
          results={aiResults}
          onApply={handleAiApply}
          onClose={() => setAiOpen(false)}
        />
      )}

      {titleOpen && (
        <TitlePromptModal
          initialTitle={state.title}
          fallbackFilename={empresalladoFallbackFilename()}
          exporting={pdfExporting}
          onConfirm={confirmTitle}
          onCancel={closeTitle}
        />
      )}

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
