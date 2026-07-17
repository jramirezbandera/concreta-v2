import { useEffect, useMemo, useRef, useState } from 'react';
import { steelBeamDefaults, type SteelBeamInputs } from '../../data/defaults';
import { BEAM_CASES } from '../../lib/calculations/beamCases';
import { useModuleState } from '../../hooks/useModuleState';
import { useContainerWidth } from '../../hooks/useContainerWidth';
import { useTitledPdfExport } from '../../hooks/useTitledPdfExport';
import { useDrawer } from '../../components/layout/AppShell';
import { calcSteelBeam } from '../../lib/calculations/steelBeams';
import { deriveFromLoads } from '../../lib/calculations/loadGen';
import { exportSteelBeamsPDF, steelBeamsFallbackFilename } from '../../lib/pdf/steelBeams';
import { useUnitSystem } from '../../lib/units/useUnitSystem';
import type { AiApplyPlan } from '../../lib/ai/modules/types';
import { steelBeamsAdapter, summarizeSteelBeamResults } from '../../lib/ai/modules/steelBeams';
import { Topbar } from '../../components/layout/Topbar';
import { PdfPreviewModal } from '../../components/ui/PdfPreviewModal';
import { TitlePromptModal } from '../../components/ui/TitlePromptModal';
import { MobileTabBar, type MobileTab } from '../../components/ui/MobileTabBar';
import { showToast } from '../../components/ui/Toast';
import { AiChatModal } from '../../components/ai/AiChatModal';
import { SteelBeamsInputs } from './SteelBeamsInputs';
import { SteelBeamsSVG } from './SteelBeamsSVG';
import { SteelBeamsResults } from './SteelBeamsResults';
import { SteelBeamsDiagrams } from './SteelBeamsDiagrams';

export function SteelBeamsModule() {
  const { state, setField, reset, copyShareLink } = useModuleState('steel-beams', steelBeamDefaults);
  const { openDrawer } = useDrawer();
  const { system } = useUnitSystem();
  const [tab, setTab] = useState<MobileTab>('inputs');

  // "Rellenar con IA" (T3.1)
  const [aiOpen, setAiOpen] = useState(false);
  // Cuando la IA aplica una Lcr explícita junto a un cambio de L/beamType, el
  // efecto de reset de abajo debe saltarse UNA vez para no pisar el override.
  const skipLcrResetRef = useRef(false);

  // Lcr auto-fill
  const [lcrManuallyOverridden, setLcrManuallyOverridden] = useState(false);
  useEffect(() => {
    if (skipLcrResetRef.current) {
      skipLcrResetRef.current = false;
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset the manual-override flag when the beam type/length changes (derived-from-prop reset)
    setLcrManuallyOverridden(false);
  }, [state.beamType, state.L]);

  const autoLcr = Math.round(BEAM_CASES[state.beamType].Lcr_factor * state.L);
  const displayLcr = lcrManuallyOverridden ? state.Lcr : autoLcr;

  const handleLcrChange = (val: number) => {
    setField('Lcr', val);
    setLcrManuallyOverridden(Math.abs(val - autoLcr) > 5);
  };

  // Aplica el plan confirmado en AiChatModal: orden tipo→size garantizado (el
  // useEffect de SteelBeamsInputs re-valida size tras el commit) y gestión del
  // flag de Lcr (explícita → override manual; L/beamType nuevos sin Lcr → auto).
  const handleAiApply = (plan: AiApplyPlan<SteelBeamInputs>) => {
    const f = plan.fields;
    const lChanged = f.L !== undefined && f.L !== state.L;
    const btChanged = f.beamType !== undefined && f.beamType !== state.beamType;
    if (f.Lcr !== undefined) {
      if (lChanged || btChanged) skipLcrResetRef.current = true; // el effect de reset se salta UNA vez
      setLcrManuallyOverridden(true);
    } else if (lChanged || btChanged) {
      setLcrManuallyOverridden(false); // Lcr vuelve a auto con la nueva L/beamType
    }
    const ORDER: (keyof SteelBeamInputs)[] =
      ['tipo', 'size', 'steel', 'beamType', 'L', 'deflLimit', 'elsCombo', 'useCategory', 'gk', 'qk', 'bTrib', 'Lcr'];
    for (const k of ORDER) {
      const v = f[k];
      if (v !== undefined) setField(k, v as SteelBeamInputs[typeof k]);
    }
    const n = plan.changes.length;
    const w = plan.warnings.length;
    showToast(
      `IA: ${n} campo${n === 1 ? '' : 's'} aplicado${n === 1 ? '' : 's'}${w ? ` · ${w} aviso${w === 1 ? '' : 's'}` : ''}`,
      { autoDismiss: 4000 },
    );
  };

  const [effectiveInputs, loadGen, result] = useMemo(() => {
    const lg = deriveFromLoads(state);
    const eff = {
      ...state,
      MEd:             lg.MEd,
      VEd:             lg.VEd,
      VEd_interaction: lg.VEd_interaction,
      Mser:            lg.Mser,
      Lcr:             lcrManuallyOverridden ? state.Lcr : autoLcr,
    };
    return [eff, lg, calcSteelBeam(eff)] as const;
  }, [state, lcrManuallyOverridden, autoLcr]);

  // Resumen de resultados para el prompt del chat IA (Fase 2, T3.2)
  const aiResults = useMemo(() => summarizeSteelBeamResults(result), [result]);

  const { pdfExporting, pdfPreview, handleDownloadPdf, closePdfPreview, titleOpen, openExport, confirmTitle, closeTitle } =
    useTitledPdfExport({
      exportFn: (title) => exportSteelBeamsPDF(effectiveInputs, result, system, title),
      valid: true,
      onTitleChange: (t) => setField('title', t),
    });

  // Responsive SVG sizing — measure the canvas container
  const [canvasRef, canvasWidth] = useContainerWidth();

  // Perfil (estrecho, alto) + rejilla 2×2 de carga/M/V/δ (ancha)
  const FIXED_SVG_W = 210;
  const FIXED_DIAG_W = 620;
  const SVG_ASPECT = 270 / 210;   // alto/ancho del perfil
  const DIAG_ASPECT = 300 / 620;  // alto/ancho de la rejilla 2×2
  const CANVAS_PAD = 32; // px-4 each side
  const GAP = 32;
  const TOTAL_FIXED = FIXED_SVG_W + GAP + FIXED_DIAG_W + CANVAS_PAD;
  // Stack vertically below ~1280px viewport (canvas < 800px); side-by-side at xl+
  const STACK_THRESHOLD = 800;
  const isStacked = (canvasWidth ?? 0) < STACK_THRESHOLD;

  let svgW = FIXED_SVG_W;
  let diagW = FIXED_DIAG_W;

  if (isStacked && canvasWidth !== undefined && canvasWidth > 0) {
    // Each SVG takes full available width (up to its natural size)
    const available = canvasWidth - CANVAS_PAD;
    svgW = Math.min(FIXED_SVG_W, Math.max(180, available));
    diagW = Math.min(FIXED_DIAG_W, Math.max(180, available));
  } else if (!isStacked && canvasWidth !== undefined && canvasWidth > 0 && canvasWidth < TOTAL_FIXED) {
    // Side-by-side: scale both down proportionally to fit
    const available = canvasWidth - CANVAS_PAD - GAP;
    const ratio = FIXED_SVG_W / (FIXED_SVG_W + FIXED_DIAG_W);
    svgW = Math.max(160, Math.round(available * ratio));
    diagW = Math.max(160, Math.round(available * (1 - ratio)));
  }

  const svgH = Math.round(svgW * SVG_ASPECT);
  const diagH = Math.round(diagW * DIAG_ASPECT);

  // Mobile "Diagramas" tab — measure its own width so the stacked SVGs scale to
  // the phone instead of a fixed 340px that scrolled sideways on ≤372px screens.
  // En móvil los diagramas van en 1 columna (4 celdas apiladas), no en 2×2.
  const MOBILE_DIAG_ASPECT = 1.8;
  const [mobileCanvasRef, mobileCanvasWidth] = useContainerWidth();
  const mobileAvail = (mobileCanvasWidth ?? 0) - CANVAS_PAD;
  const mobileSvgW = mobileCanvasWidth ? Math.min(FIXED_SVG_W, Math.max(180, mobileAvail)) : 210;
  const mobileDiagW = mobileCanvasWidth ? Math.min(400, Math.max(180, mobileAvail)) : 300;

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <Topbar
        moduleLabel="Vigas"
        moduleGroup="Acero"
        onExportPdf={openExport}
        pdfExporting={pdfExporting}
        onMenuOpen={openDrawer}
        onCopyLink={copyShareLink}
        onOpenAssistant={() => setAiOpen(true)}
      />
      <MobileTabBar tab={tab} setTab={setTab} />

      {/* Two-column layout (desktop) / Tabbed (mobile) */}
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
          <div className="flex-1 overflow-y-auto overflow-x-hidden scroll-hide px-5 py-4">
            <SteelBeamsInputs
              state={state}
              setField={setField}
              displayLcr={displayLcr}
              lcrIsAuto={!lcrManuallyOverridden}
              onLcrChange={handleLcrChange}
              loadGen={loadGen}
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

        {/* Right: SVG + results */}
        <div
          className={[
            'min-w-0 overflow-y-auto overflow-x-hidden scroll-hide',
            'lg:flex-1',
            tab === 'results' ? 'flex-1' : 'hidden',
            'lg:block',
          ].join(' ')}
        >
          {/* SVG canvas — tablet+ only. Stacked (md–xl), side-by-side (xl+) */}
          <div
            ref={canvasRef}
            className="hidden lg:flex lg:flex-col xl:flex-row border-b border-border-main canvas-dot-grid items-center justify-center py-6 px-4 gap-6"
          >
            <SteelBeamsSVG result={result} mode="screen" width={svgW} height={svgH} />
            {loadGen && result.valid && (
              <SteelBeamsDiagrams
                beamType={state.beamType}
                wEd={loadGen.wEd}
                MEd={loadGen.MEd}
                VEdA={loadGen.VEd}
                VEdB={state.beamType === 'fp' ? loadGen.VEd * (3 / 5) : loadGen.VEd}
                L={effectiveInputs.L}
                deltaMax={result.delta_max}
                deltaAdm={result.delta_adm}
                deflLimit={state.deflLimit}
                mode="screen"
                width={diagW}
                height={diagH}
              />
            )}
          </div>

          {/* Results */}
          <div className="px-6 py-5">
            <SteelBeamsResults result={result} deflLimit={state.deflLimit} />
          </div>
        </div>

        {/* Mobile: Diagramas tab — cross-section + M/V/delta stacked */}
        {tab === 'diagramas' && (
          <div ref={mobileCanvasRef} className="flex-1 overflow-y-auto overflow-x-hidden scroll-hide lg:hidden flex flex-col items-center py-4 px-4 gap-6 canvas-dot-grid">
            <SteelBeamsSVG result={result} mode="screen" width={mobileSvgW} height={Math.round(mobileSvgW * SVG_ASPECT)} />
            {loadGen && result.valid && (
              <SteelBeamsDiagrams
                beamType={state.beamType}
                wEd={loadGen.wEd}
                MEd={loadGen.MEd}
                VEdA={loadGen.VEd}
                VEdB={state.beamType === 'fp' ? loadGen.VEd * (3 / 5) : loadGen.VEd}
                L={effectiveInputs.L}
                deltaMax={result.delta_max}
                deltaAdm={result.delta_adm}
                deflLimit={state.deflLimit}
                mode="screen"
                width={mobileDiagW}
                height={Math.round(mobileDiagW * MOBILE_DIAG_ASPECT)}
                columns={1}
              />
            )}
          </div>
        )}

      </div>

      {/* Hidden PDF clones — wrapped to prevent mobile horizontal scroll */}
      <div className="overflow-hidden w-0 h-0" aria-hidden="true">
        <div
          id="steel-beams-svg-pdf"
          style={{ position: 'absolute', left: '-9999px', top: 0, pointerEvents: 'none' }}
        >
          <SteelBeamsSVG result={result} mode="pdf" width={210} height={270} />
        </div>

        <div
          id="steel-beams-diagrams-pdf"
          style={{ position: 'absolute', left: '-9999px', top: 0, pointerEvents: 'none' }}
        >
          {loadGen && result.valid && (
            <SteelBeamsDiagrams
              beamType={state.beamType}
              wEd={loadGen.wEd}
              MEd={loadGen.MEd}
              VEdA={loadGen.VEd}
              VEdB={state.beamType === 'fp' ? loadGen.VEd * (3 / 5) : loadGen.VEd}
              L={effectiveInputs.L}
              deltaMax={result.delta_max}
              deltaAdm={result.delta_adm}
              deflLimit={state.deflLimit}
              mode="pdf"
              width={460}
              height={250}
            />
          )}
        </div>
      </div>

      {aiOpen && (
        <AiChatModal adapter={steelBeamsAdapter} current={state} results={aiResults} onApply={handleAiApply} onClose={() => setAiOpen(false)} />
      )}

      {titleOpen && (
        <TitlePromptModal
          initialTitle={state.title}
          fallbackFilename={steelBeamsFallbackFilename()}
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
