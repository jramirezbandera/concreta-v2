// FEM 2D — module orchestrator
//
// Owns the DesignModel state, persistence (localStorage + URL share param),
// and wires the canvas + panels to the new solveDesignModel pipeline (Lane A
// solver + adapters via the Lane B.1 bridge).
//
// State priority on mount: ?model= URL param > localStorage > Landing.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useSearchParams } from 'react-router';
import { Topbar } from '../../components/layout/Topbar';
import { useDrawer } from '../../components/layout/AppShell';
import { showToast } from '../../components/ui/Toast';
import { PdfPreviewModal } from '../../components/ui/PdfPreviewModal';
import { usePdfPreview } from '../../hooks/usePdfPreview';
import { exportFemAnalysisPDF } from '../../lib/pdf/femAnalysis';
import { Canvas } from './Canvas';
import { FloatingControls } from './FloatingControls';
import { InputsPanel } from './InputsPanel';
import { Landing } from './Landing';
import { ResultsPanel } from './ResultsPanel';
import { ToolPalette } from './ToolPalette';
import { cloneDesignPreset, type DesignPresetId } from './presets';
import { solveDesignModel } from './solveDesignModel';
import { buildShareUrl, decodeShareString } from './serialize';
import { useModelHistory } from './useModelHistory';
import type { DesignModel, Selected, ToolId, ViewState } from './types';

import './styles.css';

const STORAGE_KEY = 'concreta-fem-2d-design';
const RECENT_KEY = 'concreta-fem-2d-recent';
const TIP_SEEN_KEY = 'concreta-fem-2d-inline-tip-seen';

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
  const [selected, setSelected] = useState<Selected>(null);
  const [hoveredBar, setHoveredBar] = useState<string | null>(null);
  const [view, setView] = useState<ViewState>({
    layer: 'none',           // default: cotas + cargas + bars (no overlay)
    combo: 'ELU',
    deformedScale: 1,
  });
  // Tablet auto-collapse (Codex final pass #8): below 1310px desktop layout
  // (190 sidebar + 240 inputs + 600 canvas mín + 280 results), inputs panel
  // collapses to 32px side-rail by default to keep the canvas dominant.
  // Mobile <768px stays read-only (V1.0 inheritance via app shell).
  const isTabletInitial = typeof window !== 'undefined' && window.innerWidth < 1310 && window.innerWidth >= 768;
  const [inputsOpen, setInputsOpen] = useState(!isTabletInitial);
  const [resultsOpen, setResultsOpen] = useState(true);

  // Vano/apoyo tab state — owned at the FEM level so <ResultsHeader> toggle
  // and the embedded <RCBeamsResults> share the same source of truth. Resets
  // to 'vano' when the selected bar changes (decision 2C from eng review).
  const [activeSection, setActiveSection] = useState<'vano' | 'apoyo'>('vano');
  useEffect(() => {
    setActiveSection('vano');
  }, [selected?.kind === 'bar' ? selected.id : null]);

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

  const result = useMemo(
    () => (model ? solveDesignModel(model) : { status: 'neutral' as const, maxEta: 0, perBar: {}, reactions: [], errors: [], elements: [] }),
    [model],
  );

  // PDF export — always available per project memory rule "PDF export never disabled".
  const { pdfExporting, pdfPreview, handleExportPdf, handleDownloadPdf, closePdfPreview } =
    usePdfPreview(
      () => exportFemAnalysisPDF(model!, result),
      true,
    );

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
      <div className="flex flex-col h-full min-h-0 overflow-hidden">
        <Helmet>
          <title>FEM 2D — Concreta</title>
          <meta name="description" content="Análisis FEM 2D — viga continua y ménsula con comprobación HA + Acero según normativa española." />
        </Helmet>
        <Topbar moduleLabel="FEM 2D" moduleGroup="Análisis" onMenuOpen={openDrawer} />
        <Landing onPick={pickPreset} recientes={loadRecent()} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <Helmet>
        <title>FEM 2D — Concreta</title>
        <meta name="description" content="Análisis FEM 2D real — viga continua y ménsula con comprobación HA + Acero según normativa española." />
      </Helmet>
      <Topbar
        moduleLabel="FEM 2D"
        moduleGroup="Análisis"
        onMenuOpen={openDrawer}
        onExportPdf={handleExportPdf}
        pdfExporting={pdfExporting}
        onCopyLink={handleShare}
      />

      <div style={{ flex: 1, display: 'flex', minHeight: 0, position: 'relative' }}>
        {/* Left: inputs (collapsible) */}
        <div
          style={{
            width: inputsOpen ? 240 : 32,
            flexShrink: 0,
            background: 'var(--color-bg-surface)',
            borderRight: '1px solid var(--color-border-main)',
            overflowY: inputsOpen ? 'auto' : 'hidden',
            transition: 'width 200ms ease',
            position: 'relative',
          }}
        >
          <CollapseToggle open={inputsOpen} onClick={() => setInputsOpen(!inputsOpen)} side="right" title="inputs" />
          {inputsOpen ? (
            <InputsPanel
              model={model}
              setModel={setModel}
              selected={selected}
              setSelected={setSelected}
              result={result}
              activeSection={activeSection}
              setActiveSection={setActiveSection}
            />
          ) : (
            <SideRail label="Inputs" />
          )}
        </div>

        {/* Center: canvas */}
        <div style={{ flex: 1, position: 'relative', minWidth: 0, display: 'flex' }}>
          <div style={{ padding: 8, paddingRight: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <ToolPalette tool={tool} setTool={setTool} />
          </div>
          <div style={{ flex: 1, position: 'relative' }}>
            <FloatingControls
              onBackToLanding={backToLanding}
              view={view}
              setView={setView}
              onUndo={undo}
              onRedo={redo}
              canUndo={canUndo}
              canRedo={canRedo}
            />
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
              view={view}
              showInlineTip={!inlineTipSeen}
              onDismissInlineTip={dismissInlineTip}
            />
          </div>
        </div>

        {/* Right: results (collapsible) */}
        <div
          style={{
            width: resultsOpen ? 300 : 32,
            flexShrink: 0,
            background: 'var(--color-bg-surface)',
            borderLeft: '1px solid var(--color-border-main)',
            overflow: resultsOpen ? 'auto' : 'hidden',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            transition: 'width 200ms ease',
            position: 'relative',
          }}
        >
          <CollapseToggle open={resultsOpen} onClick={() => setResultsOpen(!resultsOpen)} side="left" title="resultados" />
          {resultsOpen ? (
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
