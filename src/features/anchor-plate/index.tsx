import { useDeferredValue, useMemo, useState } from 'react';
import { anchorPlateDefaults, type AnchorPlateInputs } from '../../data/defaults';
import { useModuleState } from '../../hooks/useModuleState';
import { useContainerWidth } from '../../hooks/useContainerWidth';
import { useTitledPdfExport } from '../../hooks/useTitledPdfExport';
import { useDrawer } from '../../components/layout/AppShell';
import { calcAnchorPlate } from '../../lib/calculations/anchorPlate';
import { exportAnchorPlatePDF, anchorPlateFallbackFilename } from '../../lib/pdf/anchorPlate';
import { useUnitSystem } from '../../lib/units/useUnitSystem';
import type { AiApplyPlan } from '../../lib/ai/modules/types';
import { anchorPlateAdapter, summarizeAnchorPlateResults } from '../../lib/ai/modules/anchorPlate';
import { Topbar } from '../../components/layout/Topbar';
import { AiChatModal } from '../../components/ai/AiChatModal';
import { PdfPreviewModal } from '../../components/ui/PdfPreviewModal';
import { TitlePromptModal } from '../../components/ui/TitlePromptModal';
import { MobileTabBar, type MobileTab } from '../../components/ui/MobileTabBar';
import { showToast } from '../../components/ui/Toast';
import { AnchorPlateInputsPanel } from './AnchorPlateInputs';
import { AnchorPlateSVG } from './AnchorPlateSVG';
import { AnchorPlateResults } from './AnchorPlateResults';

export function AnchorPlateModule() {
  const { state, setField, reset, copyShareLink } = useModuleState('anchor-plate', anchorPlateDefaults);
  const { openDrawer } = useDrawer();
  const { system } = useUnitSystem();
  const [tab, setTab] = useState<MobileTab>('inputs');

  // M6 (Phase 2 Tier 3): el solver biaxial puede ejecutar ~25-50k clips
  // poligonales (multi-seed M22 incluido). Recomputar en cada keystroke
  // bloquea el input en móvil. useDeferredValue marca la recomputación como
  // baja prioridad: React aplaza el render hasta que el input está idle.
  // El PDF recibe deferredState/result para que ambos estén siempre en sync.
  const deferredState = useDeferredValue(state);
  const result = useMemo(() => calcAnchorPlate(deferredState, system), [deferredState, system]);

  // "Rellenar con IA" (ola 2)
  const [aiOpen, setAiOpen] = useState(false);

  // ORDER del contrato: familia antes que tamaño, y los gates (`bottom_anchorage`,
  // `rib_count`) antes que sus dependientes. Los campos legacy (`VEd`,
  // `pedestal_cX`/`cY`) NO se escriben aquí a mano: el buildPlan ya los ha dejado
  // en `plan.fields` a través de shearPatch/edgeAxisPatch, que es la única forma
  // sancionada de mantenerlos coherentes con los resolvers del motor.
  const handleAiApply = (plan: AiApplyPlan<AnchorPlateInputs>) => {
    const ORDER: (keyof AnchorPlateInputs)[] = [
      'sectionType', 'sectionSize',
      'NEd', 'NEd_G', 'Mx', 'My', 'Vx', 'Vy', 'VEd',
      'plate_a', 'plate_b', 'plate_t', 'plate_steel',
      'bar_nLayout', 'bar_diam', 'bar_grade', 'bar_edge_x', 'bar_edge_y', 'bar_hef',
      'bottom_anchorage', 'top_connection', 'washer_od',
      'rib_count', 'rib_h', 'rib_t',
      'fck',
      'pedestal_cX1', 'pedestal_cX2', 'pedestal_cY1', 'pedestal_cY2',
      'pedestal_cX', 'pedestal_cY',
      'pedestal_h', 'plate_margin_x', 'plate_margin_y', 'surface_type', 'weld_throat',
    ];
    for (const k of ORDER) {
      const v = plan.fields[k];
      if (v !== undefined) setField(k, v as AnchorPlateInputs[typeof k]);
    }
    const n = plan.changes.length;
    const w = plan.warnings.length;
    showToast(
      `IA: ${n} campo${n === 1 ? '' : 's'} aplicado${n === 1 ? '' : 's'}${w ? ` · ${w} aviso${w === 1 ? '' : 's'}` : ''}`,
      { autoDismiss: 4000 },
    );
  };

  // Resumen de resultados para el prompt del chat IA. Sale de `result`, que va un
  // tick por detrás del estado (useDeferredValue) — igual que la pantalla.
  const aiResults = useMemo(() => summarizeAnchorPlateResults(result), [result]);

  const { pdfExporting, pdfPreview, handleDownloadPdf, closePdfPreview, titleOpen, openExport, confirmTitle, closeTitle } =
    useTitledPdfExport({
      exportFn: (title) => exportAnchorPlatePDF(deferredState, result, system, title),
      valid: true,
      onTitleChange: (t) => setField('title', t),
    });

  const [canvasRef, canvasWidth] = useContainerWidth();
  const [mobileCanvasRef, mobileCanvasWidth] = useContainerWidth();

  // M24 (Phase 4): cap desktop subido de 420 → 720 px. La placa es el "trust
  // anchor" del módulo y la tabla de resultados pesaba más en pantalla.
  // 720 sigue siendo conservador vs el sibling isolated-footing (960).
  const FIXED_SVG_W = 720;
  const CANVAS_PAD = 32;
  const svgW = canvasWidth !== undefined && canvasWidth > 0
    ? Math.min(FIXED_SVG_W, Math.max(260, canvasWidth - CANVAS_PAD))
    : FIXED_SVG_W;
  const svgH = Math.round(svgW * 1.1);

  // M13 (Phase 4): mobile responsive. Antes width=320 hardcoded → en layouts
  // 8/9 los círculos de barras caían a 3-4 px. Usamos el ancho real del
  // contenedor con cap 480 (típico phone landscape) y min 280.
  const MOBILE_PAD = 24;
  const mobileSvgW = mobileCanvasWidth !== undefined && mobileCanvasWidth > 0
    ? Math.min(480, Math.max(280, mobileCanvasWidth - MOBILE_PAD))
    : 320;
  const mobileSvgH = Math.round(mobileSvgW * 1.1);

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <Topbar
        moduleLabel="Placas de anclaje"
        moduleGroup="Acero + cimentación"
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
            <AnchorPlateInputsPanel state={state} setField={setField} warnings={result.warnings} />
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
          <div
            ref={canvasRef}
            className="hidden lg:flex border-b border-border-main canvas-dot-grid items-center justify-center py-6 px-4"
          >
            <AnchorPlateSVG
              inp={deferredState}
              result={result}
              mode="screen"
              width={svgW}
              height={svgH}
            />
          </div>

          <div className="px-6 py-5">
            <AnchorPlateResults result={result} />
          </div>
        </div>

        {/* Mobile: Diagramas tab */}
        {tab === 'diagramas' && (
          <div
            ref={mobileCanvasRef}
            className="flex-1 overflow-y-auto scroll-hide lg:hidden flex flex-col items-center py-4 px-4 gap-4 canvas-dot-grid"
          >
            <AnchorPlateSVG
              inp={deferredState}
              result={result}
              mode="screen"
              width={mobileSvgW}
              height={mobileSvgH}
            />
          </div>
        )}
      </div>

      {/* Hidden PDF clone */}
      <div className="overflow-hidden w-0 h-0" aria-hidden="true">
        <div
          id="anchor-plate-svg-pdf"
          style={{ position: 'absolute', left: '-9999px', top: 0, pointerEvents: 'none' }}
        >
          <AnchorPlateSVG
            inp={deferredState}
            result={result}
            mode="pdf"
            width={420}
            height={460}
          />
        </div>
      </div>

      {aiOpen && (
        <AiChatModal
          adapter={anchorPlateAdapter}
          current={state}
          results={aiResults}
          onApply={handleAiApply}
          onClose={() => setAiOpen(false)}
        />
      )}

      {titleOpen && (
        <TitlePromptModal
          initialTitle={state.title}
          fallbackFilename={anchorPlateFallbackFilename(state)}
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
