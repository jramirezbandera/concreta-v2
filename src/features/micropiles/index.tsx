import { useMemo, useState, useEffect, useCallback } from 'react';
import { micropilesDefaults, micropilesSoilDefaults, type MicropilesInputs, type SoilLayer } from '../../data/defaults';
import { type SoilType } from '../../data/micropileLookups';
import type { AiApplyPlan } from '../../lib/ai/modules/types';
import { micropilesAdapter, summarizeMicropilesResults, type MicropilesAiInputs } from '../../lib/ai/modules/micropiles';
import { AiChatModal } from '../../components/ai/AiChatModal';
import { useModuleState } from '../../hooks/useModuleState';
import { useContainerWidth } from '../../hooks/useContainerWidth';
import { useTitledPdfExport } from '../../hooks/useTitledPdfExport';
import { useDrawer } from '../../components/layout/AppShell';
import { calcMicropiles } from '../../lib/calculations/micropiles';
import { WARN_UTIL } from '../../lib/calculations/types';
import { exportMicropilesPDF, micropilesFallbackFilename } from '../../lib/pdf/micropiles';
import { Topbar } from '../../components/layout/Topbar';
import { PdfPreviewModal } from '../../components/ui/PdfPreviewModal';
import { TitlePromptModal } from '../../components/ui/TitlePromptModal';
import { MobileTabBar, type MobileTab } from '../../components/ui/MobileTabBar';
import { showToast } from '../../components/ui/Toast';
import { MicropilesInputsPanel } from './MicropilesInputsPanel';
import { MicropilesSVG, type MicropilesView } from './MicropilesSVG';
import { MicropilesResults } from './MicropilesResults';
import { loadSoil, saveSoil } from './soilStorage';
import { buildShareUrl, readSoilFromUrl } from './serialize';

// Pestañas de vista. "Semáforos" se retiró (2026-06-02): sus utilizaciones
// ih/ic/im/iv ya están en el topbar (IH/IC/IM/IV) y en las comprobaciones del
// panel de resultados — info redundante en pantalla. La vista sigue existiendo
// en MicropilesSVG para el PDF, donde no hay topbar.
const VIEW_TABS: { id: MicropilesView; num: string; label: string; color: string }[] = [
  { id: 'profile',    num: '1', label: 'Perfil',     color: '#a8825a' },
  { id: 'rfcCurve',   num: '2', label: 'Rfc curva',  color: '#38bdf8' },
  { id: 'topSection', num: '3', label: 'Sección tope', color: '#f8fafc' },
];

function ViewTabButton({
  active, num, label, color, onClick,
}: { active: boolean; num: string; label: string; color: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
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

function UtilStat({ label, util }: { label: string; util: number }) {
  const color =
    util >= 1.0 ? 'text-state-fail' :
    util >= WARN_UTIL ? 'text-state-warn' :
                  'text-state-ok';
  return (
    <div className="flex flex-col items-end leading-none">
      <span className="text-[9px] uppercase tracking-[0.08em] text-text-disabled font-mono">{label}</span>
      <span className={['text-[14px] font-mono font-semibold mt-0.5', color].join(' ')}>
        {isFinite(util) ? util.toFixed(2) : '∞'}
      </span>
    </div>
  );
}

function SummaryStrip({ ih, ic, im, iv }: { ih: number; ic: number; im: number; iv: number }) {
  return (
    <div className="flex items-center gap-4">
      <UtilStat label="ih" util={ih} />
      <div className="w-px h-7 bg-border-main" />
      <UtilStat label="ic" util={ic} />
      <div className="w-px h-7 bg-border-main" />
      <UtilStat label="im" util={im} />
      <div className="w-px h-7 bg-border-main" />
      <UtilStat label="iv" util={iv} />
    </div>
  );
}

export function MicropilesModule() {
  const { state, setField, reset, getShareUrl } = useModuleState<MicropilesInputs>('micropiles', micropilesDefaults);
  const { openDrawer } = useDrawer();
  const [tab, setTab] = useState<MobileTab>('inputs');
  const [view, setView] = useState<MicropilesView>('profile');
  // Share-URL: si la URL trae `?soil=<lz-string>`, el destinatario hereda los
  // estratos del emisor. Se lee aquí (initializer) ANTES de que useModuleState
  // limpie la URL en su efecto de montaje, así que el estado queda cargado y
  // persiste en localStorage del destinatario. Si no hay param, fallback al
  // loader local.
  const [soil, setSoil] = useState<SoilLayer[]>(() => readSoilFromUrl() ?? loadSoil());

  useEffect(() => { saveSoil(soil); }, [soil]);

  const addLayer = useCallback(() => {
    setSoil((prev) => {
      const maxId = prev.reduce((m, l) => Math.max(m, l.id), 0);
      return [...prev, {
        id: maxId + 1,
        type: 'granular',
        thickness: 2.0,
        gamma: 19, c: 0, phi: 25, Nspt: 15, su: 0, rflim: 0.10,
      }];
    });
  }, []);

  const removeLayer = useCallback((id: number) => {
    setSoil((prev) => prev.length > 1 ? prev.filter((l) => l.id !== id) : prev);
  }, []);

  const updateLayer = useCallback((id: number, field: keyof SoilLayer, value: number | SoilType) => {
    setSoil((prev) => prev.map((l) => l.id === id ? { ...l, [field]: value } : l));
  }, []);

  const resetAll = useCallback(() => {
    reset();
    setSoil(micropilesSoilDefaults.map((l) => ({ ...l })));
  }, [reset]);

  const result = useMemo(() => calcMicropiles(state, soil), [state, soil]);

  // "Rellenar con IA" (ola 3 — fases A+B: escalares y estratos). El adapter
  // tipa sobre el COMBINADO escalares+soil; aquí se compone y se separa.
  const [aiOpen, setAiOpen] = useState(false);
  const aiCurrent = useMemo<MicropilesAiInputs>(() => ({ ...state, soil }), [state, soil]);
  const aiResults = useMemo(() => summarizeMicropilesResults(result), [result]);

  // ORDER del contrato: overrides ANTES que sus campos gateados (crManualOverride
  // antes que CR, coverManualOverride antes que structuralCover, tube antes que
  // customTube*); `soil` va aparte por setSoil (reemplazo completo).
  const handleAiApply = (plan: AiApplyPlan<MicropilesAiInputs>) => {
    const { soil: proposedSoil, ...scalars } = plan.fields;
    const ORDER: (keyof MicropilesInputs)[] = [
      'topDepth', 'toeDepth', 'drillDiameter', 'waterTableDepth',
      'injectionPressure', 'designLoad', 'effort', 'method', 'groutType',
      'concreteGrade', 'tube', 'customTubeDe', 'customTubeE', 'steelGrade',
      'execution', 'corrosionEnv', 'designLifeYears', 'connection', 'application', 'duration',
      'crManualOverride', 'CR', 'coverManualOverride', 'structuralCover',
      'baseMoment', 'baseShear', 'soilModulusTop', 'soilModulusEmbed',
    ];
    for (const k of ORDER) {
      const v = (scalars as Partial<MicropilesInputs>)[k];
      if (v !== undefined) setField(k, v as MicropilesInputs[typeof k]);
    }
    if (proposedSoil !== undefined) setSoil(proposedSoil);
    const n = plan.changes.length;
    const w = plan.warnings.length;
    showToast(
      `IA: ${n} campo${n === 1 ? '' : 's'} aplicado${n === 1 ? '' : 's'}${w ? ` · ${w} aviso${w === 1 ? '' : 's'}` : ''}`,
      { autoDismiss: 4000 },
    );
  };

  const { pdfExporting, pdfPreview, handleDownloadPdf, closePdfPreview, titleOpen, openExport, confirmTitle, closeTitle } =
    useTitledPdfExport({
      exportFn: (title) => exportMicropilesPDF(state, soil, result, title),
      valid: true,
      onTitleChange: (t) => setField('title', t),
    });

  // Share enlace: construimos el enlace bajo demanda combinando los inputs
  // escalares (getShareUrl, desde el estado EN MEMORIA de useModuleState) con
  // el array soil comprimido (`?soil=<lz-string>`). Así el destinatario ve
  // EXACTAMENTE el mismo cálculo — escalares y estratos — sin depender de lo
  // que haya en la barra de direcciones. Patrón build-on-demand igual que el
  // resto de módulos.
  const handleCopyLink = useCallback(() => {
    try {
      const url = buildShareUrl(soil, getShareUrl());
      navigator.clipboard.writeText(url).then(() => {
        showToast('Enlace copiado — incluye estratos', { autoDismiss: 2500 });
      }).catch(() => {
        showToast('No se pudo copiar el enlace', { autoDismiss: 3500 });
      });
    } catch {
      showToast('Error al generar el enlace', { autoDismiss: 3500 });
    }
  }, [soil, getShareUrl]);

  const [canvasRef, canvasWidth] = useContainerWidth();
  const svgW = canvasWidth !== undefined && canvasWidth > 0
    ? Math.max(280, canvasWidth - 32)
    : 560;
  const svgH = Math.min(520, Math.round(svgW * (430 / 560)));
  // Mobile "Diagramas" tab measures its own container so the SVG scales to the
  // phone instead of a fixed 340px that overflowed on narrow screens.
  const [mobileCanvasRef, mobileCanvasWidth] = useContainerWidth();
  const mobileW = mobileCanvasWidth ? Math.min(480, Math.max(240, mobileCanvasWidth - 32)) : 300;

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <Topbar
        moduleLabel="Micropilotes"
        moduleGroup="Cimentación"
        onExportPdf={openExport}
        pdfExporting={pdfExporting}
        onMenuOpen={openDrawer}
        onCopyLink={handleCopyLink}
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
            <MicropilesInputsPanel
              state={state}
              setField={setField}
              soil={soil}
              addLayer={addLayer}
              removeLayer={removeLayer}
              updateLayer={updateLayer}
              autoCR={result.crAdopted}
              autoCover={result.coverAdopted}
            />
          </div>
          <div className="hidden lg:block px-5 py-3 border-t border-border-main shrink-0">
            <button
              onClick={resetAll}
              className="text-[11px] text-text-disabled hover:text-text-secondary transition-colors"
              type="button"
            >
              Restablecer valores
            </button>
          </div>
        </div>

        {/* Right: canvas + results */}
        <div
          className={[
            'min-w-0 overflow-y-auto scroll-hide',
            'lg:flex-1',
            tab === 'results' ? 'flex-1' : 'hidden',
            'lg:block',
          ].join(' ')}
        >
          {/* View tabs */}
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
            <div className="ml-auto pr-4 flex items-center whitespace-nowrap shrink-0">
              {result.valid && (
                <SummaryStrip ih={result.ih} ic={result.ic} im={result.im} iv={result.iv} />
              )}
            </div>
          </div>

          {/* SVG canvas */}
          <div
            ref={canvasRef}
            className="hidden lg:flex justify-center border-b border-border-main canvas-dot-grid py-4 px-4 min-h-[360px] items-center"
          >
            <MicropilesSVG
              inp={state}
              soil={soil}
              result={result}
              view={view}
              width={Math.min(svgW, 760)}
              height={Math.min(svgH, 520)}
            />
          </div>

          {/* Results */}
          <div className="px-6 py-5">
            <MicropilesResults result={result} inp={state} />
          </div>
        </div>

        {/* Mobile diagramas */}
        {tab === 'diagramas' && (
          <div className="flex-1 overflow-y-auto scroll-hide lg:hidden flex flex-col py-3 gap-3">
            <div className="flex items-stretch bg-bg-surface border-y border-border-main overflow-x-auto">
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
            <div ref={mobileCanvasRef} className="flex flex-col items-center px-4 canvas-dot-grid py-4">
              <MicropilesSVG
                inp={state}
                soil={soil}
                result={result}
                view={view}
                width={mobileW}
                height={Math.round(mobileW * (430 / 560))}
              />
            </div>
          </div>
        )}

      </div>

      {/* Hidden PDF clones */}
      <div style={{ position: 'absolute', left: '-9999px', top: 0, pointerEvents: 'none' }} aria-hidden="true">
        <div id="micropiles-svg-pdf-profile">
          <MicropilesSVG inp={state} soil={soil} result={result} view="profile" mode="pdf" width={500} height={460} />
        </div>
        <div id="micropiles-svg-pdf-rfc">
          <MicropilesSVG inp={state} soil={soil} result={result} view="rfcCurve" mode="pdf" width={500} height={400} />
        </div>
        <div id="micropiles-svg-pdf-section">
          <MicropilesSVG inp={state} soil={soil} result={result} view="topSection" mode="pdf" width={500} height={400} />
        </div>
        <div id="micropiles-svg-pdf-sema">
          <MicropilesSVG inp={state} soil={soil} result={result} view="semaphores" mode="pdf" width={500} height={360} />
        </div>
      </div>

      {aiOpen && (
        <AiChatModal adapter={micropilesAdapter} current={aiCurrent} results={aiResults} onApply={handleAiApply} onClose={() => setAiOpen(false)} />
      )}

      {titleOpen && (
        <TitlePromptModal
          initialTitle={state.title}
          fallbackFilename={micropilesFallbackFilename()}
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
