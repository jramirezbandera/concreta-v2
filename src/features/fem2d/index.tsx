// FEM 2D — module shell (free-editor era).
//
// The module state IS the Fem2DModel (model-centric v2): templates are SEEDS
// via the "Nueva estructura" dialog, and the model is edited directly (canvas
// tools land in later phases; this shell already wires history + persistence +
// share links + PDF over the live model). Solve is synchronous (D4): a useMemo
// over the model runs analyzeFem2D on every committed edit.
//
// Left panel (provisional until the selection inspector lands): new-structure
// button, model summary, self-weight toggle, read-only load list.

import { useEffect, useMemo, useState, type JSX } from 'react';
import { Redo2, Tag, Undo2 } from 'lucide-react';
import { useContainerWidth } from '../../hooks/useContainerWidth';
import { useDocTitle } from '../../hooks/useDocTitle';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useTitledPdfExport } from '../../hooks/useTitledPdfExport';
import { useDrawer } from '../../components/layout/AppShell';
import { Topbar } from '../../components/layout/Topbar';
import { MobileTabBar, type MobileTab } from '../../components/ui/MobileTabBar';
import { showToast } from '../../components/ui/Toast';
import { PdfPreviewModal } from '../../components/ui/PdfPreviewModal';
import { TitlePromptModal } from '../../components/ui/TitlePromptModal';
import { useUnitSystem } from '../../lib/units/useUnitSystem';
import { AiChatModal } from '../../components/ai/AiChatModal';
import { fem2dAdapter, summarizeFem2DResults } from '../../lib/ai/modules/fem2d';
import type { AiApplyPlan } from '../../lib/ai/modules/types';
import { exportFem2DPDF, fem2dFallbackFilename } from '../../lib/pdf/fem2d';
import { useFem2DState, buildShareUrl } from './useFem2DState';
import { analyzeFem2D } from './pipeline';
import type { Fem2DComboId } from './checks';
import { NewStructureDialog } from './NewStructureDialog';
import { Landing } from './Landing';
import { loadRecent, pushRecent } from './recents';
import { buildTemplateWithDefaults } from './templates';
import { Fem2DCanvas, type Fem2DCanvasView } from './Fem2DCanvas';
import { Fem2DEditorCanvas } from './Fem2DEditorCanvas';
import { Fem2DInspector } from './Fem2DInspector';
import { Fem2DMemberDetail } from './Fem2DMemberDetail';
import { Fem2DResults } from './Fem2DResults';
import { ToolPalette2D } from './ToolPalette2D';
import type { Selected2D, Tool2DId } from './modelOps';
import type { Fem2DModel, Fem2DTemplateId } from './types';
import './styles.css';

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

const VIEW_TABS: { id: Fem2DCanvasView; label: string; title?: string }[] = [
  { id: 'model', label: 'Modelo' },
  { id: 'N', label: 'N', title: 'Diagrama de axiles' },
  { id: 'V', label: 'V', title: 'Diagrama de cortantes' },
  { id: 'M', label: 'M', title: 'Diagrama de momentos' },
  { id: 'def', label: 'δ', title: 'Deformada' },
];

// Grupos de combinación visualizables (los envolventes que materializa el
// chequeo). Mismo patrón que el selector "Comb" del FEM 1D.
const COMBO_TABS: { id: Fem2DComboId; label: string; title: string }[] = [
  { id: 'ELU', label: 'ELU', title: 'ELU fundamental: 1.35·G + 1.5·Q + 1.5·ψ₀·Qi (envolvente multiprincipal)' },
  { id: 'ELS_c', label: 'ELS-c', title: 'ELS característica: G + Q + ψ₀·Qi — límite de flechas (CTE DB-SE 4.3.2.3)' },
  { id: 'ELS_cp', label: 'ELS-cp', title: 'ELS cuasi-permanente: G + ψ₂·Q — deformaciones a largo plazo' },
];

function ViewTabButton({ active, label, title, onClick }: { active: boolean; label: string; title?: string; onClick: () => void }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={title}
      className={[
        'px-3 py-2 border-r border-border-main text-[11.5px] font-medium tracking-tight whitespace-nowrap transition-colors',
        active ? 'bg-bg-primary text-text-primary' : 'bg-bg-surface text-text-secondary hover:bg-bg-elevated/70 hover:text-text-primary',
      ].join(' ')}
    >
      {label}
    </button>
  );
}

export function Fem2DModule(): JSX.Element {
  const { model, setModel, resetModel, undo, redo, canUndo, canRedo, startedEmpty } = useFem2DState();
  // Pantalla de plantillas (paridad con FEM 1D): en el primer arranque (sin URL
  // ni modelo guardado) se muestra sobre la semilla viva; elegir una plantilla,
  // "Nueva estructura" o aplicar una propuesta de IA entra al editor.
  const [showLanding, setShowLanding] = useState(startedEmpty);
  const { openDrawer } = useDrawer();
  const { system } = useUnitSystem();
  const isMobile = useIsMobile();
  const [tab, setTab] = useState<MobileTab>('inputs');
  const [view, setView] = useState<Fem2DCanvasView>('model');
  const [combo, setCombo] = useState<Fem2DComboId>('ELU');
  const [newOpen, setNewOpen] = useState(false);
  const [tool, setTool] = useState<Tool2DId>('select');
  const [selected, setSelected] = useState<Selected2D>(null);
  const [showLabels, setShowLabels] = useState(true);
  const [aiOpen, setAiOpen] = useState(false);
  // Ficha de cálculo grande por barra (modal). Se abre desde el icono de la
  // fila de resultados o el botón del inspector; seleccionar acompaña.
  const [detailMemberId, setDetailMemberId] = useState<string | null>(null);
  // Título del documento: fuera del estado del solver (useDocTitle) para no
  // reejecutar el solve ni alterar la huella de procedencia al teclearlo.
  const [docTitle, setDocTitle] = useDocTitle('concreta-fem2d-title');

  // Synchronous solve+checks, memoized on the model (D4).
  const result = useMemo(() => analyzeFem2D(model), [model]);

  // Resumen de resultados para el prompt del chat (prop viva: se rehace por turno).
  const aiResults = useMemo(() => summarizeFem2DResults(model, result), [model, result]);

  // Aplica una propuesta del asistente con UN solo setModel: la propuesta
  // entera es UN paso de undo (Ctrl+Z la revierte de golpe). La selección se
  // limpia con cambios estructurales — puede apuntar a ids que desaparecen.
  function handleAiApply(plan: AiApplyPlan<Fem2DModel>) {
    const structural = plan.fields.nodes !== undefined || plan.fields.members !== undefined
      || plan.fields.supports !== undefined || plan.fields.loads !== undefined;
    setModel((m) => ({ ...m, ...plan.fields }));
    setShowLanding(false); // la propuesta aplicada es ya un modelo del editor
    if (structural) setSelected(null);
    const n = plan.changes.length;
    const w = plan.warnings.length;
    showToast(
      `IA: ${n} cambio${n === 1 ? '' : 's'} aplicado${n === 1 ? '' : 's'}${w > 0 ? ` · ${w} aviso${w === 1 ? '' : 's'}` : ''}`,
      { autoDismiss: 4000 },
    );
  }

  // Landing → editor: build the picked template with its FTUX-green defaults
  // (one click, like FEM 1D). resetModel clears history — a template pick is
  // not a user edit. Parametric tuning stays available via "Nueva estructura".
  function pickTemplate(id: Fem2DTemplateId) {
    resetModel(buildTemplateWithDefaults(id));
    setSelected(null);
    setShowLanding(false);
  }

  // Editor → landing: la estructura que dejas atrás pasa a "recientes" (su
  // plantilla + el último η), como en el FEM 1D. El modelo sigue vivo por
  // debajo, así que volver a él (o recargar) no lo pierde.
  function backToLanding() {
    // Un modelo 'custom' (editado libremente o dibujado por IA sin plantilla) no
    // tiene plantilla que reabrir → no entra en recientes; el modelo sigue vivo.
    if (model.templateId !== 'custom') {
      pushRecent(model.templateId, result.checks?.maxEta ?? 0);
    }
    setSelected(null);
    setShowLanding(true);
  }

  // First fail-severity message → editor canvas banner (mechanisms, refs…).
  const firstFail = useMemo(
    () => result.errors.find((e) => e.severity === 'fail')?.msg ?? null,
    [result],
  );

  // Selecting something on mobile jumps to the Datos tab (the inspector lives
  // there and the canvas tab has no editing surface) — mirrors the 1D.
  const selectAnd = (s: Selected2D) => {
    setSelected(s);
    if (s !== null && isMobile && tab !== 'inputs') setTab('inputs');
  };

  // Abrir la ficha selecciona también la barra (el canvas la resalta al
  // cerrar), pero SIN salto de pestaña móvil: el modal cubre la pantalla.
  const openDetail = (id: string) => {
    setSelected({ kind: 'member', id });
    setDetailMemberId(id);
  };

  // Datos vivos de la ficha (el modelo puede cambiar bajo el modal vía undo):
  // si la barra o sus checks desaparecen, el modal se cierra solo en render.
  const detailMember = detailMemberId ? model.members.find((mm) => mm.id === detailMemberId) : undefined;
  const detailVerdict = detailMemberId ? result.checks?.perMember[detailMemberId] : undefined;
  const detailEnvelopes = detailMemberId ? result.checks?.envelopes[detailMemberId] : undefined;

  // Undo/redo keyboard (Ctrl/Cmd+Z, +Shift+Z, Ctrl+Y) — skip when typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) return;
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      if (e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  // PDF export: gated on a fully-solved model so a degenerate model never
  // produces a plausible-looking but wrong document.
  const pdfValid = result.ok && !!result.checks;
  const { pdfExporting, pdfPreview, handleDownloadPdf, closePdfPreview, titleOpen, openExport, confirmTitle, closeTitle } =
    useTitledPdfExport({
      exportFn: async (title) => {
        await nextFrame(); // let the hidden pdf clones paint the current model
        return exportFem2DPDF(model, result, system, title);
      },
      valid: pdfValid,
      onTitleChange: setDocTitle,
    });

  const [canvasRef, canvasWidth] = useContainerWidth();
  const CANVAS_PAD = 32;
  const svgW = canvasWidth && canvasWidth > 0 ? Math.max(280, canvasWidth - CANVAS_PAD) : 520;
  const svgH = Math.round(svgW * 0.66);

  function handleShare() {
    const url = buildShareUrl(model);
    navigator.clipboard.writeText(url).then(
      () => showToast('Enlace del modelo copiado al portapapeles', { autoDismiss: 2500 }),
      () => showToast('No se pudo copiar el enlace', { autoDismiss: 3000 }),
    );
  }

  // aria-live summary of the verdict for screen readers (the panel may be
  // display:none on mobile depending on the tab).
  const live = !result.ok
    ? 'El modelo no se pudo resolver.'
    : result.checks
      ? `Cálculo listo. Utilización máxima ${(result.checks.maxEta * 100).toFixed(0)} por ciento.`
      : '';

  // Pantalla de plantillas (primer arranque). El modelo semilla vive por debajo
  // (no persistido hasta un pick/edit/IA), así que el asistente arranca sobre él
  // con current={model} — sin necesidad de una semilla aparte como en el 1D.
  if (showLanding) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <Topbar
          moduleLabel="FEM 2D"
          moduleGroup="Análisis"
          onMenuOpen={openDrawer}
          onOpenAssistant={() => setAiOpen(true)}
        />
        <Landing onPick={pickTemplate} recientes={loadRecent()} onStartAi={() => setAiOpen(true)} />
        {aiOpen && (
          <AiChatModal
            adapter={fem2dAdapter}
            current={model}
            results={aiResults}
            onApply={handleAiApply}
            onClose={() => setAiOpen(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="sr-only" aria-live="polite" role="status">{live}</div>

      <Topbar
        moduleLabel="FEM 2D"
        moduleGroup="Análisis"
        onExportPdf={openExport}
        pdfExporting={pdfExporting}
        onCopyLink={handleShare}
        onMenuOpen={openDrawer}
        onOpenAssistant={() => setAiOpen(true)}
      />
      <MobileTabBar tab={tab} setTab={setTab} />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left: provisional panel (selection inspector lands later) */}
        <div
          className={[
            'flex min-h-0 flex-col overflow-hidden bg-bg-surface',
            'lg:flex lg:w-72 lg:shrink-0 lg:border-r lg:border-border-main',
            tab === 'inputs' ? 'max-lg:flex-1' : 'max-lg:hidden',
          ].join(' ')}
        >
          <div className="scroll-hide flex-1 overflow-y-auto px-4 py-4">
            <Fem2DInspector
              model={model}
              setModel={setModel}
              selected={selected}
              setSelected={setSelected}
              onNewStructure={() => setNewOpen(true)}
              onBackToLanding={backToLanding}
              onOpenDetail={openDetail}
              readOnly={isMobile}
            />
          </div>
        </div>

        {/* Center: view selector + undo/redo + 2D canvas */}
        <div
          className={[
            'min-w-0 flex-col overflow-hidden',
            'lg:flex lg:flex-1',
            tab === 'diagramas' ? 'flex flex-1' : 'hidden',
          ].join(' ')}
        >
          <div className="flex shrink-0 flex-wrap items-center border-b border-border-main bg-bg-surface">
            {VIEW_TABS.map((t) => (
              <ViewTabButton key={t.id} active={view === t.id} label={t.label} title={t.title} onClick={() => setView(t.id)} />
            ))}
            {/* Selector de combinación — solo con una vista de resultados. */}
            {view !== 'model' && (
              <div className="flex items-center gap-1 pl-3 pr-1 py-1" role="radiogroup" aria-label="Combinación visual">
                <span className="font-mono text-[9px] uppercase tracking-[0.05em] text-text-disabled pr-1">Comb</span>
                {COMBO_TABS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    role="radio"
                    aria-checked={combo === c.id}
                    title={c.title}
                    onClick={() => setCombo(c.id)}
                    className={`px-2 py-1 rounded text-[10.5px] font-mono font-semibold transition-colors ${
                      combo === c.id
                        ? 'bg-accent/15 text-accent border border-accent/40'
                        : 'bg-bg-elevated text-text-disabled border border-border-main hover:text-text-secondary'
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            )}
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => setShowLabels((v) => !v)}
              aria-pressed={showLabels}
              title="Etiquetas de nudos y barras"
              aria-label="Etiquetas"
              className={`p-2 transition-colors ${showLabels ? 'text-accent' : 'text-text-secondary hover:text-text-primary'}`}
            >
              <Tag size={14} />
            </button>
            <span className="w-px h-4 bg-border-main mx-0.5" aria-hidden="true" />
            <button
              type="button"
              onClick={undo}
              disabled={!canUndo}
              title="Deshacer (Ctrl+Z)"
              aria-label="Deshacer"
              className="p-2 text-text-secondary hover:text-text-primary disabled:opacity-30 transition-colors"
            >
              <Undo2 size={14} />
            </button>
            <button
              type="button"
              onClick={redo}
              disabled={!canRedo}
              title="Rehacer (Ctrl+Y)"
              aria-label="Rehacer"
              className="p-2 mr-1 text-text-secondary hover:text-text-primary disabled:opacity-30 transition-colors"
            >
              <Redo2 size={14} />
            </button>
          </div>
          <div
            ref={canvasRef}
            className="canvas-dot-grid relative flex min-h-0 flex-1 items-center justify-center overflow-auto p-6"
          >
            {/* Tool palette — desktop/tablet only, floating over the canvas. */}
            {view === 'model' && !isMobile && (
              <div className="absolute left-3 top-3 z-10 hidden lg:block">
                <ToolPalette2D tool={tool} setTool={setTool} />
              </div>
            )}
            {view === 'model' ? (
              <Fem2DEditorCanvas
                model={model}
                checks={result.checks}
                setModel={setModel}
                selected={selected}
                setSelected={selectAnd}
                tool={tool}
                showLabels={showLabels}
                width={svgW}
                height={svgH}
                errorMsg={firstFail}
                readOnly={isMobile}
              />
            ) : (
              <Fem2DCanvas
                model={model} checks={result.checks} view={view}
                combo={combo} elements={result.elements}
                width={svgW} height={svgH} mode="screen"
              />
            )}
          </div>
        </div>

        {/* Right: results */}
        <div
          className={[
            'scroll-hide min-h-0 overflow-y-auto bg-bg-surface',
            'lg:flex lg:w-80 lg:shrink-0 lg:flex-col lg:border-l lg:border-border-main',
            tab === 'results' ? 'flex-1' : 'hidden',
          ].join(' ')}
        >
          <Fem2DResults
            model={model}
            result={result}
            validationErrors={[]}
            selected={selected}
            onSelectMember={(id) => selectAnd(id ? { kind: 'member', id } : null)}
            onOpenDetail={openDetail}
          />
        </div>
      </div>

      {/* Hidden clones for the PDF (mode='pdf', rasterized by embedSvgAsImage). */}
      <div className="h-0 w-0 overflow-hidden" aria-hidden="true">
        <div id="fem2d-model-svg-pdf" style={{ position: 'absolute', left: '-9999px', top: 0 }}>
          <Fem2DCanvas model={model} checks={result.checks} view="model" width={640} height={420} mode="pdf" />
        </div>
        <div id="fem2d-N-svg-pdf" style={{ position: 'absolute', left: '-9999px', top: 0 }}>
          <Fem2DCanvas model={model} checks={result.checks} view="N" width={560} height={415} mode="pdf" />
        </div>
        <div id="fem2d-V-svg-pdf" style={{ position: 'absolute', left: '-9999px', top: 0 }}>
          <Fem2DCanvas model={model} checks={result.checks} view="V" width={560} height={415} mode="pdf" />
        </div>
        <div id="fem2d-M-svg-pdf" style={{ position: 'absolute', left: '-9999px', top: 0 }}>
          <Fem2DCanvas model={model} checks={result.checks} view="M" width={560} height={415} mode="pdf" />
        </div>
      </div>

      {detailMember && detailVerdict && detailEnvelopes && (
        <Fem2DMemberDetail
          member={detailMember}
          verdict={detailVerdict}
          envelopes={detailEnvelopes}
          amplified={result.checks?.amplified ?? false}
          onClose={() => setDetailMemberId(null)}
        />
      )}

      {aiOpen && (
        <AiChatModal
          adapter={fem2dAdapter}
          current={model}
          results={aiResults}
          onApply={handleAiApply}
          onClose={() => setAiOpen(false)}
        />
      )}

      {newOpen && (
        <NewStructureDialog
          onCreate={(next) => {
            resetModel(next);
            setSelected(null); // la selección apuntaba al modelo anterior
            setShowLanding(false);
            setNewOpen(false);
          }}
          onCancel={() => setNewOpen(false)}
        />
      )}

      {titleOpen && (
        <TitlePromptModal
          initialTitle={docTitle}
          fallbackFilename={fem2dFallbackFilename(model.templateId)}
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

export default Fem2DModule;
