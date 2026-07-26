// FEM 1D — module orchestrator
//
// Owns the DesignModel state, persistence (localStorage + URL share param),
// and wires the canvas + panels to the new solveDesignModel pipeline (Lane A
// solver + adapters via the Lane B.1 bridge).
//
// State priority on mount: ?model= URL param > localStorage > Landing.
//
// Responsive layout (post mobile-adaptation plan, 2026-05-06):
//   - Mobile (<768px): MobileTabBar (Datos / Diagramas / Resultados). Canvas
//     runs in read-only mode (Canvas `readOnly` prop) — pan/pinch/tap-to-select
//     work, drag-to-edit and click-to-add do not. Tool palette is hidden.
//   - Tablet (768-1310px): inputs panel auto-collapses to a 32px side-rail by
//     default (the `isTabletInitial` flag below) so the canvas stays dominant.
//     User can expand inputs via the CollapseToggle.
//   - Desktop (≥1310px): full 3-panel layout, all controls visible.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Plus, Redo2, Undo2 } from 'lucide-react';
import { Topbar } from '../../components/layout/Topbar';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { ViewTabs, type ViewTab } from '../../components/ui/ViewTabs';
import { AiChatModal } from '../../components/ai/AiChatModal';
import { femAnalysisAdapter, summarizeFemResults } from '../../lib/ai/modules/femAnalysis';
import type { AiApplyPlan } from '../../lib/ai/modules/types';
import { useDrawer } from '../../components/layout/AppShell';
import { showToast } from '../../components/ui/Toast';
import { MobileTabBar, type MobileTab } from '../../components/ui/MobileTabBar';
import { PdfPreviewModal } from '../../components/ui/PdfPreviewModal';
import { TitlePromptModal } from '../../components/ui/TitlePromptModal';
import { useTitledPdfExport } from '../../hooks/useTitledPdfExport';
import { useDocTitle } from '../../hooks/useDocTitle';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useUnitSystem } from '../../lib/units/useUnitSystem';
import { exportFemAnalysisPDF, femAnalysisFallbackFilename } from '../../lib/pdf/femAnalysis';
import { Canvas } from './Canvas';
import { EtaPill } from './EtaPill';
import { InputsPanel } from './InputsPanel';
import { Landing } from './Landing';
import { ReadOnlyBanner } from './ReadOnlyBanner';
import { ResultsPanel } from './ResultsPanel';
import { ToolPalette } from './ToolPalette';
import { DEFAULT_LOAD_DRAFTS, type LoadDrafts, type LoadToolId } from './loadDrafts';
import type { LoadDraft } from '../../components/ui/ToolPalette';
import { cloneDesignPreset, type DesignPresetId } from './presets';
import { useLazyDesignSolver } from './useLazyDesignSolver';
import { buildShareUrl, decodeShareString } from './serialize';
import { useModelHistory } from './useModelHistory';
import type { DesignModel, Selected, ToolId, ViewLayer, ViewState } from './types';

import './styles.css';

const STORAGE_KEY = 'concreta-fem-2d-design';
const RECENT_KEY = 'concreta-fem-2d-recent';
const TIP_SEEN_KEY = 'concreta-fem-2d-inline-tip-seen';

/** Pestañas de la barra del lienzo — mismo control que el FEM 2D. */
const VIEW_TABS: ReadonlyArray<ViewTab<ViewLayer>> = [
  { id: 'model', label: 'Modelo' },
  { id: 'M', label: 'M', title: 'Diagrama de momentos' },
  { id: 'V', label: 'V', title: 'Diagrama de cortantes' },
  { id: 'reactions', label: 'R', title: 'Reacciones en apoyos' },
  { id: 'deformed', label: 'δ', title: 'Deformada' },
  { id: 'eta', label: 'η%', title: 'Utilización η%' },
];

/**
 * Envolventes que se pueden dibujar. El 1D trabaja con ENVOLVENTES (peor caso
 * punto a punto) y no con combinaciones individuales como el 2D: es una
 * decisión de cálculo de cada módulo, no de interfaz, y aquí no se toca.
 * Fórmulas por CTE Tabla 4.1/4.2 — los ψ dependen de la categoría de cada carga.
 */
const COMBO_META: Record<ViewState['combo'], { name: string; formula: string; tooltip: string }> = {
  ELU: {
    name: 'ELU fundamental',
    formula: '1.35·G + 1.5·Q + 1.5·ψ₀·Qi',
    tooltip: 'Estado Límite Último (CTE Tabla 4.1): γG=1.35 sobre permanente; γQ=1.5 sobre la variable principal y γQ·ψ₀ sobre las concomitantes. Se evalúa la envolvente multiprincipal.',
  },
  ELS_frec: {
    name: 'ELS frecuente',
    formula: 'G + ψ₁·Q + ψ₂·Qi',
    tooltip: 'Estado Límite de Servicio frecuente (CTE Tabla 4.2): combinación para fisuración y deformaciones reversibles.',
  },
  ELS_cp: {
    name: 'ELS cuasi-permanente',
    formula: 'G + ψ₂·Q',
    tooltip: 'Estado Límite de Servicio cuasi-permanente: usado para deformaciones a largo plazo y fisuración por carga sostenida.',
  },
};

/** Result of hydrating a model from persistence — includes fallback count for
 *  the migration toast (Codex final pass #2 — silent-fallback trust bug fix). */
interface HydrationResult {
  model: DesignModel | null;
  /** Number of Q loads that received default useCategory='B' silently. */
  qFallbacks: number;
}

/**
 * Migrate a deserialized model to the V1.1 shape:
 *   - Strip legacy `combo` field (moved from DesignModel to ViewState in R1).
 *   - Default `useCategory='B'` on Q loads missing the field.
 * Returns the migrated model + count of Q-load fallbacks applied (used to
 * show a toast informing the user about silent defaults).
 */
function migrateLegacyModel(raw: unknown): HydrationResult {
  if (!raw || typeof raw !== 'object') return { model: null, qFallbacks: 0 };
  const m = raw as Record<string, unknown> & Partial<DesignModel>;
  // Drop legacy field — TypeScript shape no longer has `combo`.
  if ('combo' in m) {
    delete m.combo;
  }
  // Default useCategory on Q loads.
  let qFallbacks = 0;
  if (Array.isArray(m.loads)) {
    m.loads = m.loads.map((l) => {
      if (l && typeof l === 'object' && (l as { lc?: unknown }).lc === 'Q' && !(l as { useCategory?: unknown }).useCategory) {
        qFallbacks++;
        return { ...(l as object), useCategory: 'B' };
      }
      return l;
    }) as DesignModel['loads'];
  }
  return { model: m as DesignModel, qFallbacks };
}

function loadFromStorage(): HydrationResult {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { model: null, qFallbacks: 0 };
    return migrateLegacyModel(JSON.parse(raw));
  } catch {
    return { model: null, qFallbacks: 0 };
  }
}

function saveToStorage(model: DesignModel | null) {
  try {
    if (model) localStorage.setItem(STORAGE_KEY, JSON.stringify(model));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // private mode / quota — ignore
  }
}

interface RecentEntry {
  id: string;
  preset: DesignPresetId;
  ts: number;
  eta: number;
}

function loadRecent(): RecentEntry[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as RecentEntry[]) : [];
  } catch {
    return [];
  }
}

function pushRecent(preset: DesignPresetId, eta: number) {
  try {
    const list = loadRecent();
    const next: RecentEntry = {
      id: `${preset}-${Date.now()}`,
      preset,
      ts: Date.now(),
      eta,
    };
    const merged = [next, ...list.filter((r) => r.preset !== preset)].slice(0, 5);
    localStorage.setItem(RECENT_KEY, JSON.stringify(merged));
  } catch {
    // ignore
  }
}

export function FemAnalysisModule() {
  const { openDrawer } = useDrawer();
  const { system } = useUnitSystem();
  const [searchParams, setSearchParams] = useSearchParams();
  const tipSeenRef = useRef<boolean>(false);

  // Initial state: URL share param > localStorage > null (Landing).
  // V1.1: hydration returns `{ model, qFallbacks }` so we can surface a toast
  // when default useCategory='B' was applied silently to legacy data.
  const initialResult = useState<{ model: DesignModel | null; qFallbacks: number }>(() => {
    if (typeof window !== 'undefined') {
      tipSeenRef.current = localStorage.getItem(TIP_SEEN_KEY) === 'true';
    }
    const shareParam = searchParams.get('model');
    if (shareParam) {
      const { model, qFallbacks } = decodeShareString(shareParam);
      if (model) return { model, qFallbacks };
      // Corrupted share URL — toast on next tick (dispatch is during render).
      setTimeout(() => {
        showToast('Modelo compartido inválido — empezamos en blanco', { autoDismiss: 4000 });
      }, 0);
    }
    return loadFromStorage();
  })[0];
  const initialModel = initialResult.model;
  const initialFallbacks = initialResult.qFallbacks;

  // Surface migration toast on first mount (Codex final pass #2 — silent
  // useCategory='B' fallback was a trust bug; an explicit notice fixes it).
  useEffect(() => {
    if (initialFallbacks > 0) {
      showToast(
        `Se asumió categoría 'B' (administrativa) en ${initialFallbacks} carga(s) sin clasificar. Revisa la categoría de uso en el panel.`,
        { autoDismiss: 6000 },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // History-aware state. setModel pushes to undo stack; resetModel clears it
  // (preset picks, back-to-landing, URL hydration aren't user edits).
  const { model, setModel, resetModel, undo, redo, canUndo, canRedo } = useModelHistory(initialModel);

  const [tool, setTool] = useState<ToolId>('select');
  // Carga armada por herramienta: valor e hipótesis de lo que soltará el
  // próximo clic. Vive en el shell (no en la paleta) porque también lo
  // necesita el lienzo, que es quien crea la carga.
  const [loadDrafts, setLoadDrafts] = useState<LoadDrafts>(DEFAULT_LOAD_DRAFTS);
  const setLoadDraft = (t: LoadToolId, draft: LoadDraft) =>
    setLoadDrafts((prev) => ({ ...prev, [t]: draft }));
  const [selected, setSelected] = useState<Selected>(null);
  const [hoveredBar, setHoveredBar] = useState<string | null>(null);

  // Asistente IA (ola 5). Con model === null (pantalla de plantillas) el chat
  // arranca sobre una SEMILLA de plantilla que no se persiste ni entra en la
  // historia hasta que el usuario aplica una propuesta (handleAiApply).
  const [aiOpen, setAiOpen] = useState(false);
  const aiSeed = useMemo(() => cloneDesignPreset('beam'), []);
  const aiCurrent = model ?? aiSeed;
  const [view, setView] = useState<ViewState>({
    layer: 'model',          // pestaña de trabajo: cotas + cargas + barras
    combo: 'ELU',
    deformedScale: 1,
  });
  const [confirmNew, setConfirmNew] = useState(false);
  // Layout strategy:
  //   - Mobile  (<768px) : MobileTabBar (Datos / Diagramas / Resultados),
  //                        canvas read-only via the `readOnly` Canvas prop.
  //                        `inputsOpen` / `resultsOpen` are no-ops here.
  //   - Tablet  (768-1310): inputs panel auto-collapses to a 32px side-rail
  //                        so the canvas stays dominant; user can expand.
  //   - Desktop (>=1310) : everything open.
  const isTabletInitial = typeof window !== 'undefined' && window.innerWidth < 1310 && window.innerWidth >= 768;
  const [inputsOpen, setInputsOpen] = useState(!isTabletInitial);
  const [resultsOpen, setResultsOpen] = useState(true);
  const isMobile = useIsMobile();
  const [tab, setTab] = useState<MobileTab>('diagramas');

  // Vano/apoyo tab state — owned at the FEM level so <ResultsHeader> toggle
  // and the embedded <RCBeamsResults> share the same source of truth. Resets
  // to 'vano' when the selected bar changes (decision 2C from eng review).
  const [activeSection, setActiveSection] = useState<'vano' | 'apoyo'>('vano');
  // Extraído a variable para que la regla exhaustive-deps pueda comprobarlo
  // estáticamente (un ternario en el array de deps no lo permite). Resetea a
  // 'vano' solo cuando cambia la BARRA seleccionada (no en nodos/cargas).
  const selectedBarId = selected?.kind === 'bar' ? selected.id : null;
  useEffect(() => {
    setActiveSection('vano');
  }, [selectedBarId]);

  // Mobile UX: when the user taps an element in the canvas (Diagramas tab),
  // jump to Datos tab so they immediately see the inspector. Skip the auto-jump
  // on null selection so deselecting (tapping empty canvas) doesn't trap them.
  useEffect(() => {
    if (isMobile && selected && tab === 'diagramas') {
      setTab('inputs');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.kind, selected?.kind === 'bar' ? selected.id : selected?.kind === 'node' ? selected.id : selected?.kind === 'load' ? selected.id : null]);

  // Strip the share param after consuming it so the URL stays clean.
  useEffect(() => {
    if (searchParams.get('model')) {
      const next = new URLSearchParams(searchParams);
      next.delete('model');
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist model on every change.
  useEffect(() => {
    saveToStorage(model);
  }, [model]);

  // Ctrl/Cmd+Z (undo) and Ctrl/Cmd+Shift+Z or Ctrl+Y (redo).
  // Skip when the focused element is a text input — let the browser handle
  // text-level undo there.
  useEffect(() => {
    if (!model) return;
    function isTextField(el: EventTarget | null): boolean {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
      if (el.isContentEditable) return true;
      return false;
    }
    function onKey(e: KeyboardEvent) {
      const meta = e.ctrlKey || e.metaKey;
      if (!meta) return;
      const key = e.key.toLowerCase();
      if (key === 'z') {
        if (isTextField(e.target)) return;
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (key === 'y') {
        if (isTextField(e.target)) return;
        e.preventDefault();
        redo();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [model, undo, redo]);

  function pickPreset(id: DesignPresetId) {
    const m = cloneDesignPreset(id);
    resetModel(m);
    setSelected(null);
  }

  function backToLanding() {
    if (model) {
      pushRecent((model.presetCode as DesignPresetId) ?? 'beam', result.maxEta);
    }
    resetModel(null);
    setSelected(null);
  }

  // Solver loads lazily — see useLazyDesignSolver for rationale. `result`
  // returns `status: 'pending'` while the solver chunk is in flight, then
  // re-runs synchronously on every model change once loaded.
  // Con el chat abierto desde la landing se calcula la SEMILLA: sin esto el
  // asistente vería status 'neutral' en vez de resultados reales.
  const { result, ensureSolver } = useLazyDesignSolver(model ?? (aiOpen ? aiSeed : null));

  // Resumen de resultados para el prompt del chat (prop viva: se rehace por turno).
  const aiResults = useMemo(() => summarizeFemResults(aiCurrent, result), [aiCurrent, result]);

  // Aplica una propuesta del asistente con UN solo setModel: la propuesta
  // entera es UN paso de undo (Ctrl+Z la revierte de golpe). Desde la landing,
  // resetModel(aiSeed) siembra primero (setModel no-opea con present null) y el
  // updater encolado ve la semilla — undo vuelve a la plantilla, no a null.
  function handleAiApply(plan: AiApplyPlan<DesignModel>) {
    const structural = plan.fields.nodes !== undefined || plan.fields.bars !== undefined
      || plan.fields.supports !== undefined || plan.fields.loads !== undefined;
    if (!model) resetModel(aiSeed);
    setModel((m) => ({ ...m, ...plan.fields }));
    // La selección puede apuntar a ids que desaparecen con la nueva geometría.
    if (structural) setSelected(null);
    const n = plan.changes.length;
    const w = plan.warnings.length;
    showToast(
      `IA: ${n} cambio${n === 1 ? '' : 's'} aplicado${n === 1 ? '' : 's'}${w > 0 ? ` · ${w} aviso${w === 1 ? '' : 's'}` : ''}`,
      { autoDismiss: 4000 },
    );
  }

  // PDF export — always available per project memory rule "PDF export never disabled".
  // If the solver chunk isn't loaded yet, await it inside the click handler so
  // the button stays clickable from first paint.
  // Título del documento: fuera del modelo FEM (ver useDocTitle) para no
  // recomputar el solver ni alterar el hash al teclearlo.
  const [docTitle, setDocTitle] = useDocTitle('concreta-fem-title');

  const { pdfExporting, pdfPreview, handleDownloadPdf, closePdfPreview, titleOpen, openExport, confirmTitle, closeTitle } =
    useTitledPdfExport({
      exportFn: async (title) => {
        const solver = await ensureSolver();
        const r = model ? solver(model) : result;
        return exportFemAnalysisPDF(model!, r, system, title);
      },
      valid: true,
      onTitleChange: setDocTitle,
    });

  function handleShare() {
    if (!model) return;
    const url = buildShareUrl(model);
    navigator.clipboard.writeText(url).then(
      () => showToast('Enlace del modelo copiado al portapapeles', { autoDismiss: 2500 }),
      () => showToast('No se pudo copiar el enlace', { autoDismiss: 3000 }),
    );
  }

  const inlineTipSeen = tipSeenRef.current;
  function dismissInlineTip() {
    tipSeenRef.current = true;
    try { localStorage.setItem(TIP_SEEN_KEY, 'true'); } catch { /* noop */ }
  }

  if (!model) {
    return (
      <div className="fem-root flex flex-col h-full min-h-0 overflow-hidden">
        <Topbar moduleLabel="FEM 1D" moduleGroup="Análisis" onMenuOpen={openDrawer} onOpenAssistant={() => setAiOpen(true)} />
        <Landing onPick={pickPreset} recientes={loadRecent()} onStartAi={() => setAiOpen(true)} />
        {aiOpen && (
          <AiChatModal
            adapter={femAnalysisAdapter}
            current={aiCurrent}
            results={aiResults}
            onApply={handleAiApply}
            onClose={() => setAiOpen(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="fem-root flex flex-col h-full min-h-0 overflow-hidden">
      <Topbar
        moduleLabel="FEM 1D"
        moduleGroup="Análisis"
        onMenuOpen={openDrawer}
        onExportPdf={openExport}
        pdfExporting={pdfExporting}
        onCopyLink={handleShare}
        onOpenAssistant={() => setAiOpen(true)}
      />
      <MobileTabBar tab={tab} setTab={setTab} />

      <div className="flex flex-1 min-h-0 overflow-hidden relative">
        {/* Left: inputs (collapsible on tablet+, tab-controlled on mobile) */}
        <div
          className={[
            'relative flex flex-col min-h-0 bg-bg-surface',
            'lg:border-r lg:border-border-main lg:shrink-0',
            inputsOpen ? 'lg:w-72' : 'lg:w-8',
            'lg:transition-[width] lg:duration-200',
            inputsOpen ? 'lg:overflow-y-auto' : 'lg:overflow-hidden',
            tab === 'inputs' ? 'max-lg:flex-1 max-lg:overflow-y-auto' : 'max-lg:hidden',
          ].join(' ')}
        >
          <div className="hidden lg:block">
            <CollapseToggle open={inputsOpen} onClick={() => setInputsOpen(!inputsOpen)} side="right" title="inputs" />
          </div>
          {(inputsOpen || isMobile) ? (
            <>
              <InputsPanel
                model={model}
                setModel={setModel}
                selected={selected}
                setSelected={setSelected}
                result={result}
                activeSection={activeSection}
                setActiveSection={setActiveSection}
                readOnly={isMobile}
              />
            </>
          ) : (
            <SideRail label="Inputs" />
          )}
        </div>

        {/* Center: barra de vistas + lienzo (mismo cromo que el FEM 2D) */}
        <div
          className={[
            'min-w-0 flex-col overflow-hidden',
            'lg:flex lg:flex-1',
            tab === 'diagramas' ? 'flex flex-1' : 'hidden',
          ].join(' ')}
        >
          <div className="flex shrink-0 flex-wrap items-center border-b border-border-main bg-bg-surface">
            <ViewTabs
              tabs={VIEW_TABS}
              active={view.layer}
              onSelect={(layer) => setView({ ...view, layer })}
            />
            {/* La envolvente alimenta diagramas Y reacciones, y el panel derecho
                las lista en todas las pestañas — por eso el selector no se
                oculta en «Modelo» como hace el del 2D. */}
            <div className="flex min-w-0 items-center gap-1 py-1 pl-3 pr-1 max-lg:order-last max-lg:w-full max-lg:basis-full">
              <span className="hidden shrink-0 pr-1 font-mono text-[9px] uppercase tracking-[0.05em] text-text-disabled lg:inline">Comb</span>
              <select
                aria-label="Combinación visual"
                value={view.combo}
                onChange={(e) => setView({ ...view, combo: e.target.value as ViewState['combo'] })}
                className="min-w-0 max-w-[26rem] flex-1 truncate rounded border border-border-main bg-bg-elevated px-2 py-2 font-mono text-[12px]! font-semibold text-text-secondary transition-colors hover:text-text-primary focus:border-accent/40 focus:text-text-primary focus:outline-none disabled:opacity-50 lg:flex-none lg:py-1 lg:text-[10.5px]!"
              >
                {(Object.keys(COMBO_META) as ViewState['combo'][]).map((id) => (
                  <option key={id} value={id}>{COMBO_META[id].name}</option>
                ))}
              </select>
            </div>
            <div className="flex-1" />
            {/* Controles de EDICIÓN — fuera en móvil, donde el lienzo es de
                consulta (readOnly) y deshacer/rehacer serían botones muertos.
                Las pestañas y la combinación sí se quedan: son VISTA. */}
            {!isMobile && (
              <>
                <button
                  type="button"
                  onClick={() => setConfirmNew(true)}
                  title="Nueva estructura — volver a las plantillas"
                  aria-label="Nueva estructura"
                  className="p-2 text-text-secondary hover:text-text-primary transition-colors"
                >
                  <Plus size={14} />
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
                  title="Rehacer (Ctrl+Shift+Z)"
                  aria-label="Rehacer"
                  className="p-2 mr-1 text-text-secondary hover:text-text-primary disabled:opacity-30 transition-colors"
                >
                  <Redo2 size={14} />
                </button>
              </>
            )}
          </div>

          <div className="relative flex min-h-0 flex-1">
            {/* Mobile-only chrome:
                - EtaPill: top-right (verdict at a glance, cross-tab).
                - ReadOnlyBanner: bottom-center (informativo, dismissible).
                La barra de vistas ya vive fuera del lienzo, así que no hay nada
                flotante con lo que la píldora pueda solaparse. */}
            {isMobile && <EtaPill result={result} onClick={() => setTab('results')} />}
            {isMobile && <ReadOnlyBanner />}

            {/* Paleta flotante sobre el lienzo, solo en la pestaña de trabajo —
                espejo exacto de la del 2D (left-3 top-3). */}
            {view.layer === 'model' && !isMobile && (
              <div className="absolute left-3 top-3 z-10 hidden lg:block">
                <ToolPalette
                  tool={tool}
                  setTool={setTool}
                  loadDrafts={loadDrafts}
                  setLoadDraft={setLoadDraft}
                />
              </div>
            )}

            <Canvas
              model={model}
              setModel={setModel}
              result={result}
              tool={tool}
              setTool={setTool}
              selected={selected}
              setSelected={setSelected}
              hoveredBar={hoveredBar}
              setHoveredBar={setHoveredBar}
              loadDrafts={loadDrafts}
              view={view}
              showInlineTip={!inlineTipSeen && !isMobile}
              onDismissInlineTip={dismissInlineTip}
              readOnly={isMobile}
            />

            {/* Qué envolvente se está dibujando. Píldora por encima del grupo de
                zoom, con el mismo anclaje que el aviso de combinación del 2D.
                Fuera en móvil: ahí abajo ya vive el banner de modo consulta. */}
            {!isMobile && (
            <div
              className="pointer-events-none absolute bottom-16 left-2 right-2 z-10 mx-auto w-fit rounded bg-bg-surface/90 px-2.5 py-1 text-center font-mono text-[10.5px] text-text-secondary shadow-sm ring-1 ring-border-main/60 backdrop-blur-sm lg:bottom-14"
              title={COMBO_META[view.combo].tooltip}
            >
              {COMBO_META[view.combo].name} · {COMBO_META[view.combo].formula}
            </div>
            )}
          </div>
        </div>

        {/* Right: results (collapsible on tablet+, tab-controlled on mobile) */}
        <div
          className={[
            'relative flex flex-col min-h-0 bg-bg-surface',
            'lg:border-l lg:border-border-main lg:shrink-0',
            resultsOpen ? 'lg:w-80' : 'lg:w-8',
            'lg:transition-[width] lg:duration-200',
            resultsOpen ? 'lg:overflow-y-auto' : 'lg:overflow-hidden',
            tab === 'results' ? 'max-lg:flex-1 max-lg:overflow-y-auto' : 'max-lg:hidden',
          ].join(' ')}
        >
          <div className="hidden lg:block">
            <CollapseToggle open={resultsOpen} onClick={() => setResultsOpen(!resultsOpen)} side="left" title="resultados" />
          </div>
          {(resultsOpen || isMobile) ? (
            <ResultsPanel
              model={model}
              result={result}
              selected={selected}
              setSelected={setSelected}
              activeSection={activeSection}
              setActiveSection={setActiveSection}
              combo={view.combo}
            />
          ) : (
            <SideRail
              label={`Resultados · η=${(result.maxEta * 100).toFixed(0)}%`}
              color={
                result.status === 'ok' ? 'var(--color-state-ok)' :
                result.status === 'warn' ? 'var(--color-state-warn)' :
                result.status === 'fail' ? 'var(--color-state-fail)' :
                'var(--color-text-disabled)'
              }
            />
          )}
        </div>
      </div>

      {confirmNew && (
        <ConfirmDialog
          title="Nueva estructura"
          confirmLabel="Volver a plantillas"
          icon={Plus}
          onConfirm={() => { setConfirmNew(false); backToLanding(); }}
          onCancel={() => setConfirmNew(false)}
        >
          Se cerrará el cálculo actual y volverás a la pantalla de plantillas. El
          modelo queda guardado en «Recientes».
        </ConfirmDialog>
      )}

      {titleOpen && (
        <TitlePromptModal
          initialTitle={docTitle}
          fallbackFilename={femAnalysisFallbackFilename()}
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

      {aiOpen && (
        <AiChatModal
          adapter={femAnalysisAdapter}
          current={aiCurrent}
          results={aiResults}
          onApply={handleAiApply}
          onClose={() => setAiOpen(false)}
        />
      )}
    </div>
  );
}

// ── Layout helpers ──────────────────────────────────────────────────────────

function CollapseToggle({ open, onClick, side, title }: { open: boolean; onClick: () => void; side: 'left' | 'right'; title: string }) {
  const positionStyle: React.CSSProperties = side === 'right'
    ? { right: 6 }
    : { left: 6 };
  return (
    <button
      type="button"
      onClick={onClick}
      title={open ? `Colapsar ${title}` : `Expandir ${title}`}
      style={{
        position: 'absolute',
        top: 8,
        ...positionStyle,
        zIndex: 5,
        width: 20, height: 20,
        borderRadius: 4,
        background: 'var(--color-bg-elevated)',
        border: '1px solid var(--color-border-main)',
        color: 'var(--color-text-secondary)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer',
      }}
    >
      <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" style={{ transform: open ? 'none' : 'rotate(180deg)' }}>
        <path d={side === 'right' ? 'M5 2 L2 4 L5 6' : 'M3 2 L6 4 L3 6'} />
      </svg>
    </button>
  );
}

function SideRail({ label, color }: { label: string; color?: string }) {
  return (
    <div
      className="font-mono"
      style={{
        writingMode: 'vertical-rl',
        transform: 'rotate(180deg)',
        padding: '40px 8px 8px',
        fontSize: 10,
        letterSpacing: '0.1em',
        color: color ?? 'var(--color-text-disabled)',
        textTransform: 'uppercase',
      }}
    >
      {label}
    </div>
  );
}
