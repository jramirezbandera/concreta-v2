import { useMemo, useState } from 'react';
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
import { ExportarPdfMenu } from '../../components/layout/ExportarPdfMenu';
import { PdfPreviewModal } from '../../components/ui/PdfPreviewModal';
import { TitlePromptModal } from '../../components/ui/TitlePromptModal';
import { MobileTabBar, type MobileTab } from '../../components/ui/MobileTabBar';
import { showToast } from '../../components/ui/Toast';
import { AiChatModal } from '../../components/ai/AiChatModal';
import { useAsistenteDeModulo } from '../../components/ai/useAsistenteDeModulo';
import { IsolatedFootingInputsPanel } from './IsolatedFootingInputsPanel';
import { IsolatedFootingResults } from './IsolatedFootingResults';
import { IsolatedFootingSVG, type IsolatedFootingView } from './IsolatedFootingSVG';

// Las tres vistas del lienzo, en el orden en que se comprueba una zapata:
// primero si el terreno la aguanta, luego lo que lleva dentro, y por último el
// modelo con el que se ha dimensionado ese armado.
const VIEW_TABS: { id: IsolatedFootingView; num: string; label: string; color: string }[] = [
  { id: 'terreno', num: '1', label: 'Terreno', color: '#ea580c' },
  { id: 'armado',  num: '2', label: 'Armado',  color: '#0284c7' },
  { id: 'modelo',  num: '3', label: 'Modelo',  color: '#64748b' },
];

function ViewTabButton({
  active, num, label, color, onClick,
}: { active: boolean; num: string; label: string; color: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        'group flex items-center gap-2 px-3 py-2 border-r border-border-main transition-colors text-left',
        active ? 'bg-bg-primary' : 'bg-bg-surface hover:bg-bg-elevated/70',
      ].join(' ')}
    >
      <span
        className="flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-mono font-semibold transition-colors"
        style={{
          background: active ? `${color}22` : 'var(--color-bg-elevated)',
          color:      active ? color : 'var(--color-text-secondary)',
          border:     `1px solid ${active ? `${color}66` : 'var(--color-border-main)'}`,
        }}
      >
        {num}
      </span>
      <span
        className={[
          'text-[11.5px] font-medium tracking-tight whitespace-nowrap transition-colors',
          active ? 'text-text-primary' : 'text-text-secondary group-hover:text-text-primary',
        ].join(' ')}
      >
        {label}
      </span>
    </button>
  );
}

export function IsolatedFootingModule() {
  const { state, setField, reset, copyShareLink } = useModuleState('isolated-footing', isolatedFootingDefaults);
  const { openDrawer } = useDrawer();
  const { system } = useUnitSystem();
  const [tab, setTab] = useState<MobileTab>('inputs');
  const [view, setView] = useState<IsolatedFootingView>('terreno');

  // "Rellenar con IA" (T4.3)
  const asistente = useAsistenteDeModulo();

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
  const {
    pdfExporting, pdfPreview, handleDownloadPdf, closePdfPreview,
    titleOpen, openExport, confirmTitle, closeTitle, propsTitulo, anejoDialogo,
  } =
    useTitledPdfExport({
      exportFn: (title) => exportIsolatedFootingPDF(state, result, system, title),
      valid: true,
      onTitleChange: (t) => setField('title', t),
    });

  const [canvasRef, canvasWidth] = useContainerWidth();
  // El tope de 1180 px deja la sección y la planta una al lado de la otra
  // (el lienzo cambia a esa maqueta a partir de 720) sin que en una pantalla
  // muy ancha el dibujo se estire hasta perder la proporción del papel.
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
        exportMenu={<ExportarPdfMenu onElegir={openExport} exportando={pdfExporting} />}
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
          {/* Pestañas de vista (escritorio) */}
          <div className="hidden lg:flex items-center bg-bg-surface border-b border-border-main">
            {VIEW_TABS.map((t) => (
              <ViewTabButton
                key={t.id}
                active={view === t.id}
                num={t.num}
                label={t.label}
                color={t.color}
                onClick={() => setView(t.id)}
              />
            ))}
            <span className="ml-auto pr-4 text-[10px] font-semibold uppercase tracking-[0.07em] text-text-disabled">
              Vistas del lienzo
            </span>
          </div>

          {/* SVG canvas — desktop */}
          <div
            ref={canvasRef}
            className="hidden lg:flex justify-center border-b border-border-main canvas-dot-grid py-4 px-4 min-h-90 items-start"
          >
            <IsolatedFootingSVG inp={state} result={result} width={Math.min(svgW, 1180)} mode="screen" view={view} system={system} />
          </div>

          {/* Results */}
          <div className="px-2 py-3">
            <IsolatedFootingResults inp={state} result={result} />
          </div>
        </div>

        {/* Mobile: Diagramas tab */}
        {tab === 'diagramas' && (
          <div className="flex-1 overflow-y-auto scroll-hide lg:hidden flex flex-col py-3 gap-3">
            <div className="flex items-stretch bg-bg-surface border-y border-border-main">
              {VIEW_TABS.map((t) => (
                <ViewTabButton
                  key={t.id}
                  active={view === t.id}
                  num={t.num}
                  label={t.label}
                  color={t.color}
                  onClick={() => setView(t.id)}
                />
              ))}
            </div>
            <div ref={mobileCanvasRef} className="flex flex-col items-center px-4 gap-4 canvas-dot-grid">
              <IsolatedFootingSVG inp={state} result={result} width={mobileW} mode="screen" view={view} system={system} />
            </div>
          </div>
        )}

      </div>

      {/* Clones ocultos para el PDF — uno por vista. Van a 560 px porque es el
          ancho con el que el lienzo apila sección y planta: a página completa
          (170 mm) un rótulo de 10 px sale a 3 mm, legible en papel. Con la
          maqueta ancha saldría a 1,5 mm. */}
      <div style={{ position: 'absolute', left: '-9999px', top: 0, pointerEvents: 'none' }} aria-hidden="true">
        <div id="isolated-footing-svg-pdf">
          <IsolatedFootingSVG inp={state} result={result} mode="pdf" width={560} view="terreno" system={system} />
        </div>
        <div id="isolated-footing-svg-pdf-armado">
          <IsolatedFootingSVG inp={state} result={result} mode="pdf" width={560} view="armado" system={system} />
        </div>
        <div id="isolated-footing-svg-pdf-modelo">
          <IsolatedFootingSVG inp={state} result={result} mode="pdf" width={560} view="modelo" system={system} />
        </div>
      </div>

      {asistente.sesion && (
        <AiChatModal key={asistente.claveSesion} adapter={isolatedFootingAdapter} current={state} results={aiResults} onApply={handleAiApply} />
      )}

      {titleOpen && (
        <TitlePromptModal
          initialTitle={state.title}
          fallbackFilename={isolatedFootingFallbackFilename()}
          exporting={pdfExporting}
          {...propsTitulo}
          onConfirm={confirmTitle}
          onCancel={closeTitle}
        />
      )}
      {/* El nombre de la obra, si guardar en el anejo tiene que crearla. */}
      {anejoDialogo}

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
