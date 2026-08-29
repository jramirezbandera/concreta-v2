import { useMemo, useState } from 'react';
import { rockfillWallDefaults, type RockfillWallInputs } from '../../data/defaults';
import { useModuleState } from '../../hooks/useModuleState';
import { useContainerWidth } from '../../hooks/useContainerWidth';
import { useTitledPdfExport } from '../../hooks/useTitledPdfExport';
import { useDrawer } from '../../components/layout/AppShell';
import { calcRockfillWall } from '../../lib/calculations/rockfillWall';
import { exportRockfillWallPDF, rockfillWallFallbackFilename } from '../../lib/pdf/rockfillWall';
import { useUnitSystem } from '../../lib/units/useUnitSystem';
import { formatNumber, getUnitLabel } from '../../lib/units/format';
import type { AiApplyPlan } from '../../lib/ai/modules/types';
import { rockfillWallAdapter, summarizeRockfillWallResults } from '../../lib/ai/modules/rockfillWall';
import { Topbar } from '../../components/layout/Topbar';
import { AiChatModal } from '../../components/ai/AiChatModal';
import { PdfPreviewModal } from '../../components/ui/PdfPreviewModal';
import { TitlePromptModal } from '../../components/ui/TitlePromptModal';
import { MobileTabBar, type MobileTab } from '../../components/ui/MobileTabBar';
import { showToast } from '../../components/ui/Toast';
import { RockfillWallInputsPanel } from './RockfillWallInputs';
import { RockfillWallSVG, type RockfillWallView } from './RockfillWallSVG';
import { RockfillWallResults } from './RockfillWallResults';

const VIEW_TABS: { id: RockfillWallView; num: string; label: string; color: string }[] = [
  { id: 'geometry', num: '1', label: 'Geometría',        color: '#38bdf8' },
  { id: 'loads',    num: '2', label: 'Cargas y empujes', color: '#fcd34d' },
  { id: 'hiladas',  num: '3', label: 'Hiladas',          color: '#22c55e' },
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

function Stat({ ok, label, value, unit }: { ok: boolean; label: string; value: string; unit?: string }) {
  return (
    <div className="flex flex-col items-end leading-none">
      <span className="text-[9px] uppercase tracking-[0.08em] text-text-disabled font-mono">{label}</span>
      <span
        className={[
          'text-[14px] font-mono font-semibold mt-0.5',
          ok ? 'text-state-ok' : 'text-state-fail',
        ].join(' ')}
      >
        {value}
        {unit && <span className="text-[9.5px] font-normal text-text-disabled ml-0.5">{unit}</span>}
      </span>
    </div>
  );
}

function SummaryStrip({
  fsd, hiladaUtil, sigmaKpa, okD, okH, okS,
}: { fsd: number; hiladaUtil: number; sigmaKpa: number; okD: boolean; okH: boolean; okS: boolean }) {
  const { system } = useUnitSystem();
  return (
    <div className="flex items-center gap-5">
      <Stat ok={okD} label="Deslizamiento" value={isFinite(fsd) ? fsd.toFixed(2) : '∞'} />
      <div className="w-px h-7 bg-border-main" />
      <Stat ok={okH} label="Peor hilada" value={hiladaUtil.toFixed(2)} />
      <div className="w-px h-7 bg-border-main" />
      <Stat
        ok={okS}
        label="σ ref"
        value={formatNumber(sigmaKpa, 'soilPressure', system, 3)}
        unit={getUnitLabel('soilPressure', system)}
      />
    </div>
  );
}

export function RockfillWallModule() {
  const { state, setField, reset, copyShareLink } = useModuleState('rockfill-wall', rockfillWallDefaults);
  const { openDrawer } = useDrawer();
  const { system } = useUnitSystem();
  const [tab, setTab] = useState<MobileTab>('inputs');
  const [view, setView] = useState<RockfillWallView>('geometry');

  const result = useMemo(() => calcRockfillWall(state), [state]);

  // "Rellenar con IA"
  const [aiOpen, setAiOpen] = useState(false);

  // ORDER del contrato: `wallType` primero (gatea familias), `phiMode` antes que
  // `phi`/`litologia`, `hasWater` antes que `hw` y `Ab` antes que `S`.
  const handleAiApply = (plan: AiApplyPlan<RockfillWallInputs>) => {
    const ORDER: (keyof RockfillWallInputs)[] = [
      'wallType',
      'H', 'a', 'mIntra', 'mTras', 'alphaHiladas',
      'hCaja', 'stepCaja', 'stepAlign', 'alphaBatter',
      'hz', 'x0', 'xT', 'alphaBase', 'df',
      'gammaAp', 'phiMode', 'phi', 'litologia', 'dPhiE', 'contactoMejorado',
      'gammaSuelo', 'gammaSat', 'phiRelleno', 'delta', 'beta', 'q', 'sigmaAdm', 'muBase',
      'usePassive', 'hasWater', 'hw', 'Ab', 'S',
    ];
    for (const k of ORDER) {
      const v = plan.fields[k];
      if (v !== undefined) setField(k, v as RockfillWallInputs[typeof k]);
    }
    const n = plan.changes.length;
    const w = plan.warnings.length;
    showToast(
      `IA: ${n} campo${n === 1 ? '' : 's'} aplicado${n === 1 ? '' : 's'}${w ? ` · ${w} aviso${w === 1 ? '' : 's'}` : ''}`,
      { autoDismiss: 4000 },
    );
  };

  const aiResults = useMemo(() => summarizeRockfillWallResults(result), [result]);

  const { pdfExporting, pdfPreview, handleDownloadPdf, closePdfPreview, titleOpen, openExport, confirmTitle, closeTitle } =
    useTitledPdfExport({
      exportFn: (title) => exportRockfillWallPDF(state, result, system, title),
      valid: true,
      onTitleChange: (t) => setField('title', t),
    });

  const [canvasRef, canvasWidth] = useContainerWidth();
  const svgW = canvasWidth !== undefined && canvasWidth > 0
    ? Math.max(200, canvasWidth - 32)
    : 380;
  const svgH = Math.round(svgW * (460 / 560));
  const [mobileCanvasRef, mobileCanvasWidth] = useContainerWidth();
  const mobileW = mobileCanvasWidth ? Math.min(480, Math.max(240, mobileCanvasWidth - 32)) : 300;

  // Veredicto de la tira: el sismo desplaza al estático automáticamente.
  const findCheck = (id: string) => result.checks.find((c) => c.id === id);
  const cDesliz = findCheck('deslizamiento-sismico') ?? findCheck('deslizamiento');
  const cHilada = findCheck('hilada-deslizamiento-sismico') ?? findCheck('hilada-deslizamiento');
  const cSigma  = findCheck('sigma-max');
  const okD = cDesliz ? cDesliz.status !== 'fail' : true;
  const okH = cHilada ? cHilada.status !== 'fail' : true;
  const okS = cSigma ? cSigma.status !== 'fail' : true;
  const fsd = (result.kh_derived > 0 && result.FS_desliz_seis !== undefined)
    ? result.FS_desliz_seis : result.FS_desliz;
  const hiladaUtil = (result.kh_derived > 0 && result.worstSlideSeis !== undefined)
    ? Math.max(result.worstSlideSeis.util, result.worstSlide.util)
    : Math.max(result.worstSlide.util, result.worstOvert.util);

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <Topbar
        moduleLabel="Escollera"
        moduleGroup="Geotecnia"
        onExportPdf={openExport}
        pdfExporting={pdfExporting}
        onMenuOpen={openDrawer}
        onCopyLink={copyShareLink}
        onOpenAssistant={() => setAiOpen(true)}
      />
      <MobileTabBar tab={tab} setTab={setTab} />

      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Izquierda: panel de datos */}
        <div
          className={[
            'flex flex-col min-h-0 overflow-hidden bg-bg-surface',
            'lg:w-72 lg:shrink-0 lg:border-r lg:border-border-main',
            tab === 'inputs' ? 'max-lg:flex-1' : 'max-lg:hidden',
            'lg:flex',
          ].join(' ')}
        >
          <div className="flex-1 overflow-y-auto scroll-hide px-5 py-4">
            <RockfillWallInputsPanel state={state} setField={setField} />
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

        {/* Derecha: SVG + resultados */}
        <div
          className={[
            'min-w-0 overflow-y-auto scroll-hide',
            'lg:flex-1',
            tab === 'results' ? 'flex-1' : 'hidden',
            'lg:block',
          ].join(' ')}
        >
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
                <SummaryStrip fsd={fsd} hiladaUtil={hiladaUtil} sigmaKpa={result.sigma_ref} okD={okD} okH={okH} okS={okS} />
              )}
            </div>
          </div>

          <div
            ref={canvasRef}
            className="hidden lg:flex justify-center border-b border-border-main canvas-dot-grid py-4 px-4"
          >
            <RockfillWallSVG
              inp={state}
              result={result}
              mode="screen"
              width={Math.min(svgW, 560)}
              height={Math.min(svgH, 480)}
              view={view}
            />
          </div>

          <div className="px-6 py-5">
            <RockfillWallResults result={result} inp={state} />
          </div>
        </div>

        {/* Móvil: pestaña Diagramas */}
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
            <div ref={mobileCanvasRef} className="flex flex-col items-center px-4 canvas-dot-grid py-4">
              <RockfillWallSVG
                inp={state}
                result={result}
                mode="screen"
                width={mobileW}
                height={Math.round(mobileW * (460 / 560))}
                view={view}
              />
            </div>
          </div>
        )}

      </div>

      {/* Clones ocultos para el PDF — uno por vista */}
      <div style={{ position: 'absolute', left: '-9999px', top: 0, pointerEvents: 'none' }} aria-hidden="true">
        <div id="rockfill-wall-svg-pdf">
          <RockfillWallSVG inp={state} result={result} mode="pdf" width={380} height={430} view="geometry" />
        </div>
        <div id="rockfill-wall-svg-pdf-loads">
          <RockfillWallSVG inp={state} result={result} mode="pdf" width={560} height={460} view="loads" />
        </div>
        <div id="rockfill-wall-svg-pdf-hiladas">
          <RockfillWallSVG inp={state} result={result} mode="pdf" width={560} height={460} view="hiladas" />
        </div>
      </div>

      {aiOpen && (
        <AiChatModal
          adapter={rockfillWallAdapter}
          current={state}
          results={aiResults}
          onApply={handleAiApply}
          onClose={() => setAiOpen(false)}
        />
      )}

      {titleOpen && (
        <TitlePromptModal
          initialTitle={state.title}
          fallbackFilename={rockfillWallFallbackFilename()}
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
