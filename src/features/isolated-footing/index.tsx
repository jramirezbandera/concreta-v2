import { useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { isolatedFootingDefaults, type IsolatedFootingInputs } from '../../data/defaults';
import { useModuleState } from '../../hooks/useModuleState';
import { useContainerWidth } from '../../hooks/useContainerWidth';
import { useTitledPdfExport } from '../../hooks/useTitledPdfExport';
import { useDrawer } from '../../components/layout/AppShell';
import { calcIsolatedFooting } from '../../lib/calculations/isolatedFooting';
import { exportIsolatedFootingPDF, isolatedFootingFallbackFilename } from '../../lib/pdf/isolatedFooting';
import { useUnitSystem } from '../../lib/units/useUnitSystem';
import type { AiApplyPlan } from '../../lib/ai/modules/types';
import { isolatedFootingAdapter, summarizeIsolatedFootingResults } from '../../lib/ai/modules/isolatedFooting';
import { Topbar } from '../../components/layout/Topbar';
import { PdfPreviewModal } from '../../components/ui/PdfPreviewModal';
import { TitlePromptModal } from '../../components/ui/TitlePromptModal';
import { MobileTabBar, type MobileTab } from '../../components/ui/MobileTabBar';
import { showToast } from '../../components/ui/Toast';
import { AiChatModal } from '../../components/ai/AiChatModal';
import { IsolatedFootingInputsPanel } from './IsolatedFootingInputsPanel';
import { IsolatedFootingResults } from './IsolatedFootingResults';
import { IsolatedFootingSVG } from './IsolatedFootingSVG';

export function IsolatedFootingModule() {
  const { state, setField, reset, copyShareLink } = useModuleState('isolated-footing', isolatedFootingDefaults);
  const { openDrawer } = useDrawer();
  const { system } = useUnitSystem();
  const [tab, setTab] = useState<MobileTab>('inputs');

  // "Rellenar con IA" (T4.3)
  const [aiOpen, setAiOpen] = useState(false);

  // Aplica el plan confirmado en AiChatModal. ORDER del contrato:
  // loadsAreFactored PRIMERO (el toggle condiciona la interpretación de las cargas).
  const handleAiApply = (plan: AiApplyPlan<IsolatedFootingInputs>) => {
    const ORDER: (keyof IsolatedFootingInputs)[] =
      ['loadsAreFactored', 'loadFactor', 'N', 'Mx', 'My', 'H', 'B', 'L', 'h', 'bc', 'hc', 'Df', 'cover',
       'sigma_adm', 'fck', 'fyk', 'phi_x', 's_x', 'phi_y', 's_y', 'gamma_soil_kN_m3', 'mu_friction'];
    for (const k of ORDER) {
      const v = plan.fields[k];
      if (v !== undefined) setField(k, v as IsolatedFootingInputs[typeof k]);
    }
    const n = plan.changes.length;
    const w = plan.warnings.length;
    showToast(
      `IA: ${n} campo${n === 1 ? '' : 's'} aplicado${n === 1 ? '' : 's'}${w ? ` · ${w} aviso${w === 1 ? '' : 's'}` : ''}`,
      { autoDismiss: 4000 },
    );
  };

  const result = useMemo(() => calcIsolatedFooting(state), [state]);
  const aiResults = useMemo(() => summarizeIsolatedFootingResults(result), [result]);

  // PDF export stays available even when result is invalid — engineers may
  // need a PDF to document a failing/non-conforming section (memory note).
  const { pdfExporting, pdfPreview, handleDownloadPdf, closePdfPreview, titleOpen, openExport, confirmTitle, closeTitle } =
    useTitledPdfExport({
      exportFn: (title) => exportIsolatedFootingPDF(state, result, system, title),
      valid: true,
      onTitleChange: (t) => setField('title', t),
    });

  const [canvasRef, canvasWidth] = useContainerWidth();
  const svgW = canvasWidth !== undefined && canvasWidth > 0
    ? Math.max(200, canvasWidth - 32)
    : 360;
  // Mobile "Diagramas" tab measures its own container so the SVG scales to the
  // phone instead of a fixed 340px that overflowed on narrow screens.
  const [mobileCanvasRef, mobileCanvasWidth] = useContainerWidth();
  const mobileW = mobileCanvasWidth ? Math.min(480, Math.max(200, mobileCanvasWidth - 32)) : 300;

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <Topbar
        moduleLabel="Zapatas"
        moduleGroup="Cimentación"
        onExportPdf={openExport}
        pdfExporting={pdfExporting}
        onMenuOpen={openDrawer}
        onCopyLink={copyShareLink}
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
          <div className="flex-1 overflow-y-auto scroll-hide px-4 py-4">
            <button
              type="button"
              onClick={() => setAiOpen(true)}
              className="w-full mb-3 inline-flex items-center justify-center gap-1.5 py-1.5 rounded border border-border-main text-sm text-text-secondary hover:border-accent/40 hover:text-accent transition-colors"
            >
              <Sparkles size={14} aria-hidden="true" />
              Rellenar con IA
            </button>
            <IsolatedFootingInputsPanel state={state} setField={setField} />
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
          {/* SVG canvas — desktop */}
          <div
            ref={canvasRef}
            className="hidden lg:flex justify-center border-b border-border-main canvas-dot-grid py-4 px-4 min-h-90 items-start"
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
          <div ref={mobileCanvasRef} className="flex-1 overflow-y-auto scroll-hide lg:hidden flex flex-col items-center py-4 px-4 gap-4 canvas-dot-grid">
            <IsolatedFootingSVG inp={state} result={result} width={mobileW} mode="screen" system={system} />
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

      {aiOpen && (
        <AiChatModal adapter={isolatedFootingAdapter} current={state} results={aiResults} onApply={handleAiApply} onClose={() => setAiOpen(false)} />
      )}

      {titleOpen && (
        <TitlePromptModal
          initialTitle={state.title}
          fallbackFilename={isolatedFootingFallbackFilename()}
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
