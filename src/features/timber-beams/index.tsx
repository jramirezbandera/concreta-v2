import { useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { timberBeamDefaults, type TimberBeamInputs } from '../../data/defaults';
import { useModuleState } from '../../hooks/useModuleState';
import { useContainerWidth } from '../../hooks/useContainerWidth';
import { useTitledPdfExport } from '../../hooks/useTitledPdfExport';
import { useDrawer } from '../../components/layout/AppShell';
import { calcTimberBeam } from '../../lib/calculations/timberBeams';
import { exportTimberBeamsPDF, timberBeamsFallbackFilename } from '../../lib/pdf/timberBeams';
import { useUnitSystem } from '../../lib/units/useUnitSystem';
import type { AiApplyPlan } from '../../lib/ai/modules/types';
import { timberBeamsAdapter, summarizeTimberBeamResults } from '../../lib/ai/modules/timberBeams';
import { Topbar } from '../../components/layout/Topbar';
import { AiChatModal } from '../../components/ai/AiChatModal';
import { PdfPreviewModal } from '../../components/ui/PdfPreviewModal';
import { TitlePromptModal } from '../../components/ui/TitlePromptModal';
import { MobileTabBar, type MobileTab } from '../../components/ui/MobileTabBar';
import { showToast } from '../../components/ui/Toast';
import { TimberBeamsInputs } from './TimberBeamsInputs';
import { TimberBeamsSVG } from './TimberBeamsSVG';
import { TimberBeamsResults } from './TimberBeamsResults';

export function TimberBeamsModule() {
  const { state, setField, reset, copyShareLink } = useModuleState('timber-beams', timberBeamDefaults);
  const { openDrawer } = useDrawer();
  const { system } = useUnitSystem();
  const [tab, setTab] = useState<MobileTab>('inputs');

  // "Rellenar con IA" (ola 1)
  const [aiOpen, setAiOpen] = useState(false);

  // ORDER del contrato: los gates antes que sus dependientes — `loadType` antes
  // que `psi2Custom` y `fireResistance` antes que `exposedFaces`.
  const handleAiApply = (plan: AiApplyPlan<TimberBeamInputs>) => {
    const ORDER: (keyof TimberBeamInputs)[] = [
      'gradeId', 'b', 'h', 'beamType', 'L', 'gk', 'qk',
      'serviceClass', 'loadDuration', 'loadType', 'psi2Custom',
      'fireResistance', 'exposedFaces', 'isSystem', 'partitionType',
    ];
    for (const k of ORDER) {
      const v = plan.fields[k];
      if (v !== undefined) setField(k as never, v as never);
    }
    const n = plan.changes.length;
    const w = plan.warnings.length;
    showToast(
      `IA: ${n} campo${n === 1 ? '' : 's'} aplicado${n === 1 ? '' : 's'}${w ? ` · ${w} aviso${w === 1 ? '' : 's'}` : ''}`,
      { autoDismiss: 4000 },
    );
  };

  const result = useMemo(() => calcTimberBeam(state as never), [state]);
  // Resumen de resultados para el prompt del chat IA (bucle de dimensionado)
  const aiResults = useMemo(() => summarizeTimberBeamResults(result), [result]);

  const { pdfExporting, pdfPreview, handleDownloadPdf, closePdfPreview, titleOpen, openExport, confirmTitle, closeTitle } =
    useTitledPdfExport({
      exportFn: (title) => exportTimberBeamsPDF(state as never, result, system, title),
      valid: true,
      onTitleChange: (t) => setField('title', t),
    });

  const [canvasRef, canvasWidth] = useContainerWidth();
  const SVG_W = Math.min(Math.max((canvasWidth ?? 0) - 32, 240), 760);
  const SVG_H = Math.round(SVG_W * (200 / 760));
  // Mobile "Diagramas" tab measures its own container so the SVG scales to the
  // phone instead of a fixed 340px that overflowed on narrow screens.
  const [mobileCanvasRef, mobileCanvasWidth] = useContainerWidth();
  const mobileW = mobileCanvasWidth ? Math.min(760, Math.max(240, mobileCanvasWidth - 32)) : 300;

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <Topbar
        moduleLabel="Vigas de madera"
        moduleGroup="Madera"
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
          <div className="flex-1 overflow-y-auto scroll-hide px-5 py-4">
            <button
              type="button"
              onClick={() => setAiOpen(true)}
              className="w-full mb-3 inline-flex items-center justify-center gap-1.5 py-1.5 rounded border border-border-main text-sm text-text-secondary hover:border-accent/40 hover:text-accent transition-colors"
            >
              <Sparkles size={14} aria-hidden="true" />
              Rellenar con IA
            </button>
            <TimberBeamsInputs state={state as never} setField={setField as never} />
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
              <TimberBeamsSVG inp={state as never} result={result} mode="screen" width={SVG_W} height={SVG_H} />
            )}
          </div>

          {/* Results */}
          <div className="px-6 py-5">
            <TimberBeamsResults result={result} />
          </div>
        </div>

        {/* Mobile: Diagramas tab */}
        {tab === 'diagramas' && (
          <div ref={mobileCanvasRef} className="flex-1 overflow-y-auto scroll-hide lg:hidden flex flex-col items-center py-4 px-4 gap-4 canvas-dot-grid">
            <TimberBeamsSVG inp={state as never} result={result} mode="screen" width={mobileW} height={Math.round(mobileW * (200 / 760))} />
          </div>
        )}

      </div>

      {/* Hidden PDF SVG */}
      <div className="overflow-hidden w-0 h-0" aria-hidden="true">
        <div
          id="timber-beams-svg-pdf"
          style={{ position: 'absolute', left: '-9999px', top: 0, pointerEvents: 'none' }}
        >
          <TimberBeamsSVG inp={state as never} result={result} mode="pdf" width={760} height={200} />
        </div>
      </div>

      {aiOpen && (
        <AiChatModal
          adapter={timberBeamsAdapter}
          current={state as TimberBeamInputs}
          results={aiResults}
          onApply={handleAiApply}
          onClose={() => setAiOpen(false)}
        />
      )}

      {titleOpen && (
        <TitlePromptModal
          initialTitle={state.title}
          fallbackFilename={timberBeamsFallbackFilename()}
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
