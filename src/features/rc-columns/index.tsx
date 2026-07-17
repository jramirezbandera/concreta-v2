import { useMemo, useState } from 'react';
import { rcColumnDefaults, type RCColumnInputs } from '../../data/defaults';
import { useModuleState } from '../../hooks/useModuleState';
import { useContainerWidth } from '../../hooks/useContainerWidth';
import { useTitledPdfExport } from '../../hooks/useTitledPdfExport';
import { useDrawer } from '../../components/layout/AppShell';
import { calcRCColumn, buildColumnInteraction } from '../../lib/calculations/rcColumns';
import { exportRCColumnsPDF, rcColumnsFallbackFilename } from '../../lib/pdf/rcColumns';
import { useUnitSystem } from '../../lib/units/useUnitSystem';
import type { AiApplyPlan } from '../../lib/ai/modules/types';
import { rcColumnsAdapter, summarizeRCColumnResults } from '../../lib/ai/modules/rcColumns';
import { Topbar } from '../../components/layout/Topbar';
import { PdfPreviewModal } from '../../components/ui/PdfPreviewModal';
import { TitlePromptModal } from '../../components/ui/TitlePromptModal';
import { MobileTabBar, type MobileTab } from '../../components/ui/MobileTabBar';
import { showToast } from '../../components/ui/Toast';
import { AiChatModal } from '../../components/ai/AiChatModal';
import { RCColumnsInputs } from './RCColumnsInputs';
import { RCColumnsSVG } from './RCColumnsSVG';
import { RCColumnInteractionSVG } from './RCColumnInteractionSVG';
import { RCColumnsResults } from './RCColumnsResults';

export function RCColumnsModule() {
  const { state, setField, reset, copyShareLink } = useModuleState('rc-columns', rcColumnDefaults);
  const { openDrawer } = useDrawer();
  const { system } = useUnitSystem();
  const [tab, setTab] = useState<MobileTab>('inputs');

  // "Rellenar con IA" (T4.2)
  const [aiOpen, setAiOpen] = useState(false);

  // Aplica el plan confirmado en AiChatModal. ORDER del contrato con
  // sectionType PRIMERO: el gate de forma (b/h vs D, armado rect vs anillo)
  // depende de él. El modal NO se cierra al aplicar (la conversación sigue).
  const handleAiApply = (plan: AiApplyPlan<RCColumnInputs>) => {
    const ORDER: (keyof RCColumnInputs)[] = [
      'sectionType', 'b', 'h', 'D', 'cover', 'L', 'beta', 'fck', 'fyk',
      'cornerBarDiam', 'nBarsX', 'barDiamX', 'nBarsY', 'barDiamY',
      'nBarsCirc', 'circBarDiam', 'stirrupDiam', 'stirrupSpacing',
      'Nd', 'MEdy', 'MEdz',
    ];
    for (const k of ORDER) {
      const v = plan.fields[k];
      if (v !== undefined) setField(k, v as RCColumnInputs[typeof k]);
    }
    const n = plan.changes.length;
    const w = plan.warnings.length;
    showToast(
      `IA: ${n} campo${n === 1 ? '' : 's'} aplicado${n === 1 ? '' : 's'}${w ? ` · ${w} aviso${w === 1 ? '' : 's'}` : ''}`,
      { autoDismiss: 4000 },
    );
  };

  const result = useMemo(() => calcRCColumn(state), [state]);
  // Resumen de resultados para el prompt del chat IA (Fase 2 — T3.3)
  const aiResults = useMemo(() => summarizeRCColumnResults(result), [result]);
  // Diagrama de interacción N-M (ambos ejes) — memoizado junto al result para
  // no recomputar el barrido por cada instancia de SVG (pantalla/móvil/PDF).
  const interaction = useMemo(() => buildColumnInteraction(state, result), [state, result]);

  // PDF export stays available even when result is invalid — engineers may
  // need a PDF to document a failing/non-conforming section (memory note).
  const { pdfExporting, pdfPreview, handleDownloadPdf, closePdfPreview, titleOpen, openExport, confirmTitle, closeTitle } =
    useTitledPdfExport({
      exportFn: (title) => exportRCColumnsPDF(state, result, system, title),
      valid: true,
      onTitleChange: (t) => setField('title', t),
    });

  const [canvasRef, canvasWidth] = useContainerWidth();
  const CANVAS_PAD = 32;
  const MAX_SVG_H  = 300;  // cap height so canvas doesn't dominate — matches RC beams
  // Layout del canvas:
  //  · pantalla ancha (sobremesa): sección + 2 diagramas en UNA fila
  //  · pantalla estrecha (portátil): sección arriba, 2 diagramas debajo
  // El breakpoint se autoajusta: fila única sólo si cada SVG recibe ≥ 300px.
  const GAP = 12;
  const wideRow = !!canvasWidth && (canvasWidth - CANVAS_PAD - 2 * GAP) / 3 >= 300;

  // Estrecho: sección a su ancho, los 2 diagramas comparten fila.
  const svgW = canvasWidth ? Math.max(180, Math.min(320, canvasWidth - CANVAS_PAD)) : 260;
  const svgH = Math.min(MAX_SVG_H, Math.round(svgW * 1.15));
  const diagW = canvasWidth
    ? Math.max(200, Math.min(340, Math.floor((canvasWidth - CANVAS_PAD - GAP) / 2)))
    : 280;

  // Ancho: los 3 SVGs comparten fila a tamaño uniforme.
  const triW = canvasWidth
    ? Math.max(300, Math.min(360, Math.floor((canvasWidth - CANVAS_PAD - 2 * GAP) / 3)))
    : 320;
  const triSecH = Math.min(MAX_SVG_H, Math.round(triW * 1.15));
  // Mobile "Diagramas" tab measures its own container so the SVGs scale to the
  // phone instead of a fixed 340px that overflowed on narrow screens.
  const [mobileCanvasRef, mobileCanvasWidth] = useContainerWidth();
  const mobileW = mobileCanvasWidth ? Math.min(420, Math.max(240, mobileCanvasWidth - CANVAS_PAD)) : 300;

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <Topbar
        moduleLabel="Pilares"
        moduleGroup="Hormigón Armado"
        onExportPdf={openExport}
        pdfExporting={pdfExporting}
        onMenuOpen={openDrawer}
        onCopyLink={copyShareLink}
        onOpenAssistant={() => setAiOpen(true)}
      />
      <MobileTabBar tab={tab} setTab={setTab} />

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left: inputs panel */}
        <div
          className={[
            'flex flex-col min-h-0 overflow-hidden bg-bg-surface',
            'lg:w-72 lg:shrink-0 lg:border-r lg:border-border-main',
            tab === 'inputs' ? 'max-lg:flex-1' : 'max-lg:hidden',
            'lg:flex',
          ].join(' ')}
        >
          <div className="flex-1 overflow-y-auto scroll-hide px-5 py-4">
            <RCColumnsInputs state={state} setField={setField} />
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
          {/* SVG canvas — sección + diagramas de interacción N-M.
              Ancho: los 3 en una fila. Estrecho: sección arriba, diagramas debajo. */}
          <div
            ref={canvasRef}
            className="hidden lg:flex justify-center border-b border-border-main canvas-dot-grid py-4 px-4"
          >
            {wideRow ? (
              <div className="flex flex-row items-start justify-center gap-3">
                <RCColumnsSVG inp={state} result={result} mode="screen" width={triW} height={triSecH} />
                {interaction.valid && interaction.y && (
                  <>
                    <RCColumnInteractionSVG data={interaction.y} mode="screen" width={triW} height={triW} />
                    {interaction.z && <RCColumnInteractionSVG data={interaction.z} mode="screen" width={triW} height={triW} />}
                  </>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4">
                <RCColumnsSVG inp={state} result={result} mode="screen" width={svgW} height={svgH} />
                {interaction.valid && interaction.y && (
                  <div className="flex flex-row items-start justify-center gap-3">
                    <RCColumnInteractionSVG data={interaction.y} mode="screen" width={diagW} height={diagW} />
                    {interaction.z && <RCColumnInteractionSVG data={interaction.z} mode="screen" width={diagW} height={diagW} />}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Results */}
          <div className="px-6 py-5">
            <RCColumnsResults result={result} />
          </div>
        </div>
        {/* Mobile: Diagramas tab */}
        {tab === 'diagramas' && (
          <div ref={mobileCanvasRef} className="flex-1 overflow-y-auto scroll-hide lg:hidden flex flex-col items-center py-4 px-4 gap-4 canvas-dot-grid">
            <RCColumnsSVG inp={state} result={result} mode="screen" width={mobileW} height={Math.round(mobileW * 1.15)} />
            {interaction.valid && interaction.y && (
              <>
                <RCColumnInteractionSVG data={interaction.y} mode="screen" width={mobileW} height={320} />
                {interaction.z && <RCColumnInteractionSVG data={interaction.z} mode="screen" width={mobileW} height={320} />}
              </>
            )}
          </div>
        )}

      </div>

      {/* Hidden PDF clones — sección + interacción y/z */}
      <div className="overflow-hidden w-0 h-0" aria-hidden="true">
        <div
          id="rc-columns-svg-pdf"
          style={{ position: 'absolute', left: '-9999px', top: 0, pointerEvents: 'none' }}
        >
          <RCColumnsSVG inp={state} result={result} mode="pdf" width={320} height={370} />
        </div>
        {interaction.valid && interaction.y && (
          <>
            <div
              id="rc-columns-interaction-y-pdf"
              style={{ position: 'absolute', left: '-9999px', top: 0, pointerEvents: 'none' }}
            >
              <RCColumnInteractionSVG data={interaction.y} mode="pdf" width={300} height={300} />
            </div>
            {interaction.z && (
              <div
                id="rc-columns-interaction-z-pdf"
                style={{ position: 'absolute', left: '-9999px', top: 0, pointerEvents: 'none' }}
              >
                <RCColumnInteractionSVG data={interaction.z} mode="pdf" width={300} height={300} />
              </div>
            )}
          </>
        )}
      </div>

      {aiOpen && (
        <AiChatModal
          adapter={rcColumnsAdapter}
          current={state}
          results={aiResults}
          onApply={handleAiApply}
          onClose={() => setAiOpen(false)}
        />
      )}

      {titleOpen && (
        <TitlePromptModal
          initialTitle={state.title}
          fallbackFilename={rcColumnsFallbackFilename()}
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
