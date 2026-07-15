import { useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import {
  forjadosDefaults,
  type ForjadosInputs,
  type ForjadosTipologia,
  type ForjadosVariant,
} from '../../data/defaults';
import { tipologiaPatch, variantSwitchPatch } from '../../data/forjadoTipologias';
import { useModuleState } from '../../hooks/useModuleState';
import { useContainerWidth } from '../../hooks/useContainerWidth';
import { useTitledPdfExport } from '../../hooks/useTitledPdfExport';
import { useDrawer } from '../../components/layout/AppShell';
import { calcForjados } from '../../lib/calculations/rcSlabs';
import { exportForjadosPDF, forjadosFallbackFilename } from '../../lib/pdf/forjados';
import { useUnitSystem } from '../../lib/units/useUnitSystem';
import type { AiApplyPlan } from '../../lib/ai/modules/types';
import { forjadosAdapter, summarizeForjadoResults } from '../../lib/ai/modules/forjados';
import { Topbar } from '../../components/layout/Topbar';
import { AiChatModal } from '../../components/ai/AiChatModal';
import { PdfPreviewModal } from '../../components/ui/PdfPreviewModal';
import { TitlePromptModal } from '../../components/ui/TitlePromptModal';
import { MobileTabBar, type MobileTab } from '../../components/ui/MobileTabBar';
import { showToast } from '../../components/ui/Toast';
import { ForjadosInputsPanel } from './ForjadosInputs';
import { ForjadosResults } from './ForjadosResults';
import { ForjadosSVG } from './ForjadosSVG';

export function ForjadosModule() {
  const { state, setField, reset, copyShareLink } = useModuleState('forjados', forjadosDefaults);
  const { openDrawer } = useDrawer();
  const { system } = useUnitSystem();
  const [tab, setTab] = useState<MobileTab>('inputs');
  const [section, setSection] = useState<'vano' | 'apoyo'>('vano');

  const result = useMemo(() => calcForjados(state), [state]);

  const { pdfExporting, pdfPreview, handleDownloadPdf, closePdfPreview, titleOpen, openExport, confirmTitle, closeTitle } =
    useTitledPdfExport({
      exportFn: (title) => exportForjadosPDF(state, result, system, title),
      valid: true,
      onTitleChange: (t) => setField('title', t),
    });

  const [canvasRef, canvasWidth] = useContainerWidth();
  const svgW = canvasWidth !== undefined && canvasWidth > 0
    ? Math.max(220, canvasWidth - 32)
    : 380;
  // Mobile "Diagramas" tab measures its own container so the SVG scales to the
  // phone instead of a fixed 340px that overflowed on narrow screens.
  const [mobileCanvasRef, mobileCanvasWidth] = useContainerWidth();
  const mobileW = mobileCanvasWidth ? Math.min(480, Math.max(220, mobileCanvasWidth - 32)) : 300;

  // Variant switch: el patch (variant + armado a defaults + preset reticular)
  // vive en variantSwitchPatch — única fuente de verdad, compartida con el
  // apply del asistente IA.
  const handleVariantSwitch = (next: ForjadosVariant) => {
    const patch = variantSwitchPatch(state, next);
    const entries = Object.entries(patch) as [keyof ForjadosInputs, ForjadosInputs[keyof ForjadosInputs]][];
    if (entries.length === 0) return;
    for (const [f, v] of entries) {
      setField(f, v);
    }
    showToast('Armado reiniciado al cambiar de variante', { autoDismiss: 3000 });
  };

  // "Rellenar con IA" (ola 2)
  const [aiOpen, setAiOpen] = useState(false);

  // Los dos gates de este módulo NO son un setField suelto, y por eso el apply no
  // es un bucle plano: `variant` reinicia los 16 campos de armado
  // (variantSwitchPatch) y `tipologia` re-aplica el preset de geometría
  // (tipologiaPatch). Se escriben PRIMERO, y los campos del plan van DESPUÉS para
  // que el armado y la geometría propuestos por la IA ganen a los defaults que el
  // patch acaba de reponer. Ambos helpers son los mismos que usa la UI.
  const handleAiApply = (plan: AiApplyPlan<ForjadosInputs>) => {
    const writePatch = (patch: Partial<ForjadosInputs>) => {
      for (const [f, v] of Object.entries(patch) as [keyof ForjadosInputs, ForjadosInputs[keyof ForjadosInputs]][]) {
        setField(f, v);
      }
    };
    if (plan.fields.variant !== undefined) {
      writePatch(variantSwitchPatch(state, plan.fields.variant));
    }
    if (plan.fields.tipologia !== undefined) {
      writePatch(tipologiaPatch(plan.fields.tipologia as ForjadosTipologia));
    }

    const ORDER: (keyof ForjadosInputs)[] = [
      'variant', 'tipologia', 'h', 'hFlange', 'bWeb', 'intereje',
      'spanLength', 'tipoVano', 'cover', 'fck', 'fyk', 'exposureClass',
      'base_sup_nBars', 'base_sup_barDiam', 'base_inf_nBars', 'base_inf_barDiam',
      'refuerzo_vano_inf_nBars', 'refuerzo_vano_inf_barDiam',
      'refuerzo_apoyo_sup_nBars', 'refuerzo_apoyo_sup_barDiam',
      'base_sup_phi_mac', 'base_sup_s_mac', 'base_inf_phi_mac', 'base_inf_s_mac',
      'refuerzo_vano_inf_phi_mac', 'refuerzo_vano_inf_s_mac',
      'refuerzo_apoyo_sup_phi_mac', 'refuerzo_apoyo_sup_s_mac',
      'stirrupsEnabled',
      'vano_stirrupDiam', 'vano_stirrupSpacing', 'vano_stirrupLegs',
      'apoyo_stirrupDiam', 'apoyo_stirrupSpacing', 'apoyo_stirrupLegs',
      'vano_Md', 'apoyo_Md', 'VEd',
      'vano_M_G', 'vano_M_Q', 'apoyo_M_G', 'apoyo_M_Q',
    ];
    for (const k of ORDER) {
      const v = plan.fields[k];
      if (v !== undefined) setField(k, v as ForjadosInputs[typeof k]);
    }
    const n = plan.changes.length;
    const w = plan.warnings.length;
    showToast(
      `IA: ${n} campo${n === 1 ? '' : 's'} aplicado${n === 1 ? '' : 's'}${w ? ` · ${w} aviso${w === 1 ? '' : 's'}` : ''}`,
      { autoDismiss: 4000 },
    );
  };

  // Resumen de resultados para el prompt del chat IA (bucle de dimensionado)
  const aiResults = useMemo(() => summarizeForjadoResults(result), [result]);

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <Topbar
        moduleLabel="Forjados"
        moduleGroup="Hormigón"
        onExportPdf={openExport}
        pdfExporting={pdfExporting}
        onMenuOpen={openDrawer}
        onCopyLink={copyShareLink}
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
          <div className="flex-1 overflow-y-auto overflow-x-hidden scroll-hide px-4 py-4 min-w-0">
            <button
              type="button"
              onClick={() => setAiOpen(true)}
              className="w-full mb-3 inline-flex items-center justify-center gap-1.5 py-1.5 rounded border border-border-main text-sm text-text-secondary hover:border-accent/40 hover:text-accent transition-colors"
            >
              <Sparkles size={14} aria-hidden="true" />
              Rellenar con IA
            </button>
            <ForjadosInputsPanel
              state={state}
              section={section}
              setSection={setSection}
              setField={setField}
              onVariantSwitch={handleVariantSwitch}
            />
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

        {/* Right: SVG canvas + results */}
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
            className="hidden lg:flex justify-center border-b border-border-main canvas-dot-grid py-4 px-4"
          >
            <ForjadosSVG inp={state} result={result} section={section} width={Math.min(svgW, 480)} mode="screen" />
          </div>
          <div className="px-6 py-5">
            <ForjadosResults result={result} />
          </div>
        </div>

        {/* Mobile: Diagramas tab */}
        {tab === 'diagramas' && (
          <div ref={mobileCanvasRef} className="flex-1 overflow-y-auto scroll-hide canvas-dot-grid lg:hidden flex flex-col items-center py-4 px-4 gap-4">
            <ForjadosSVG inp={state} result={result} section={section} width={mobileW} mode="screen" />
          </div>
        )}
      </div>

      {/* Hidden PDF SVG */}
      <div className="overflow-hidden w-0 h-0" aria-hidden="true">
        <div
          id="forjados-svg-pdf"
          style={{ position: 'absolute', left: '-9999px', top: 0, pointerEvents: 'none' }}
        >
          <ForjadosSVG inp={state} result={result} section={section} width={480} mode="pdf" />
        </div>
      </div>

      {aiOpen && (
        <AiChatModal
          adapter={forjadosAdapter}
          current={state}
          results={aiResults}
          onApply={handleAiApply}
          onClose={() => setAiOpen(false)}
        />
      )}

      {titleOpen && (
        <TitlePromptModal
          initialTitle={state.title}
          fallbackFilename={forjadosFallbackFilename(result)}
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
