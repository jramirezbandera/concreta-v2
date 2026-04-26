import { useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { retainingWallDefaults } from '../../data/defaults';
import { useModuleState } from '../../hooks/useModuleState';
import { useContainerWidth } from '../../hooks/useContainerWidth';
import { usePdfPreview } from '../../hooks/usePdfPreview';
import { useDrawer } from '../../components/layout/AppShell';
import { calcRetainingWall } from '../../lib/calculations/retainingWall';
import { exportRetainingWallPDF } from '../../lib/pdf/retainingWall';
import { useUnitSystem } from '../../lib/units/useUnitSystem';
import { formatNumber, getUnitLabel } from '../../lib/units/format';
import { Topbar } from '../../components/layout/Topbar';
import { PdfPreviewModal } from '../../components/ui/PdfPreviewModal';
import { MobileTabBar, type MobileTab } from '../../components/ui/MobileTabBar';
import { RetainingWallInputsPanel } from './RetainingWallInputs';
import { RetainingWallSVG, type RetainingWallView } from './RetainingWallSVG';
import { RetainingWallResults } from './RetainingWallResults';

const VIEW_TABS: { id: RetainingWallView; num: string; label: string; color: string }[] = [
  { id: 'geometry', num: '1', label: 'Geometría',        color: '#38bdf8' },
  { id: 'loads',    num: '2', label: 'Cargas y empujes', color: '#fcd34d' },
  { id: 'rebar',    num: '3', label: 'Armado',           color: '#f8fafc' },
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
          background: active ? `${color}22` : '#1f2c47',
          color:      active ? color : '#cbd5e1',
          border:     `1px solid ${active ? `${color}66` : '#3a4a6e'}`,
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

function SummaryStrip({
  fsd, fsv, sigmaMaxKpa, okD, okV, okS,
}: { fsd: number; fsv: number; sigmaMaxKpa: number; okD: boolean; okV: boolean; okS: boolean }) {
  const { system } = useUnitSystem();
  const Stat = ({ ok, label, value, unit }: { ok: boolean; label: string; value: string; unit?: string }) => (
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
  return (
    <div className="flex items-center gap-5">
      <Stat ok={okD} label="Deslizamiento" value={isFinite(fsd) ? fsd.toFixed(2) : '∞'} />
      <div className="w-px h-7 bg-border-main" />
      <Stat ok={okV} label="Vuelco"        value={isFinite(fsv) ? fsv.toFixed(2) : '∞'} />
      <div className="w-px h-7 bg-border-main" />
      <Stat
        ok={okS}
        label="σ máx"
        value={formatNumber(sigmaMaxKpa, 'soilPressure', system, 3)}
        unit={getUnitLabel('soilPressure', system)}
      />
    </div>
  );
}

export function RetainingWallModule() {
  const { state, setField, reset } = useModuleState('retaining-wall', retainingWallDefaults);
  const { openDrawer } = useDrawer();
  const { system } = useUnitSystem();
  const [tab, setTab] = useState<MobileTab>('inputs');
  const [view, setView] = useState<RetainingWallView>('geometry');

  const result = useMemo(() => calcRetainingWall(state), [state]);

  const { pdfExporting, pdfPreview, handleExportPdf, handleDownloadPdf, closePdfPreview } =
    usePdfPreview(() => exportRetainingWallPDF(state, result, system), true);

  const [canvasRef, canvasWidth] = useContainerWidth();
  const svgW = canvasWidth !== undefined && canvasWidth > 0
    ? Math.max(200, canvasWidth - 32)
    : 380;
  const svgH = Math.round(svgW * (480 / 420));

  // Summary verdict — derive from active checks (handles seismic case automatically).
  const findCheck = (id: string) => result.checks.find((c) => c.id === id);
  const cVuelco  = findCheck('vuelco-sismico')         ?? findCheck('vuelco');
  const cDesliz  = findCheck('deslizamiento-sismico')  ?? findCheck('deslizamiento');
  const cSigma   = findCheck('sigma-max');
  const okV = cVuelco ? cVuelco.status !== 'fail' : true;
  const okD = cDesliz ? cDesliz.status !== 'fail' : true;
  const okS = cSigma  ? cSigma.status  !== 'fail' : true;
  const fsv = (result.kh_derived > 0 && result.FS_vuelco_seis !== undefined)
    ? result.FS_vuelco_seis : result.FS_vuelco;
  const fsd = (result.kh_derived > 0 && result.FS_desliz_seis !== undefined)
    ? result.FS_desliz_seis : result.FS_desliz;
  const sigmaMaxKpa = result.sigma_max ?? 0;

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <Helmet>
        <title>Muros de contención — Concreta</title>
        <meta name="description" content="Muro de hormigón armado con nivel freático. Código Estructural art. 9." />
      </Helmet>
      <Topbar
        moduleLabel="Muros"
        moduleGroup="Cimentación"
        onExportPdf={handleExportPdf}
        pdfExporting={pdfExporting}
        onMenuOpen={openDrawer}
      />
      <MobileTabBar tab={tab} setTab={setTab} />

      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Left: inputs panel */}
        <div
          className={[
            'flex flex-col min-h-0 overflow-hidden bg-bg-surface',
            'md:w-72 md:shrink-0 md:border-r md:border-border-main',
            tab === 'inputs' ? 'max-md:flex-1' : 'max-md:hidden',
            'md:flex',
          ].join(' ')}
        >
          <div className="flex-1 overflow-y-auto scroll-hide px-5 py-4">
            <RetainingWallInputsPanel state={state} setField={setField} />
          </div>
          <div className="hidden md:block px-5 py-3 border-t border-border-main shrink-0">
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
            'md:flex-1',
            tab === 'results' ? 'flex-1' : 'hidden',
            'md:block',
          ].join(' ')}
        >
          {/* View tabs + summary strip header (desktop only) */}
          <div className="hidden md:flex items-center bg-bg-surface border-b border-border-main">
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
                <SummaryStrip fsd={fsd} fsv={fsv} sigmaMaxKpa={sigmaMaxKpa} okD={okD} okV={okV} okS={okS} />
              )}
            </div>
          </div>

          {/* SVG canvas */}
          <div
            ref={canvasRef}
            className="hidden md:flex justify-center border-b border-border-main canvas-dot-grid py-4 px-4"
          >
            <RetainingWallSVG
              inp={state}
              result={result}
              mode="screen"
              width={Math.min(svgW, 500)}
              height={Math.min(svgH, 560)}
              view={view}
            />
          </div>

          {/* Results */}
          <div className="px-6 py-5">
            <RetainingWallResults result={result} inp={state} />
          </div>
        </div>

        {/* Mobile: Diagramas tab */}
        {tab === 'diagramas' && (
          <div className="flex-1 overflow-y-auto scroll-hide md:hidden flex flex-col py-3 gap-3">
            {/* Compact view tabs */}
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
            <div className="flex flex-col items-center px-4 canvas-dot-grid py-4">
              <RetainingWallSVG
                inp={state}
                result={result}
                mode="screen"
                width={340}
                height={Math.round(340 * (480 / 420))}
                view={view}
              />
            </div>
          </div>
        )}

      </div>

      {/* Hidden PDF clones — one per view, used by the PDF exporter */}
      <div style={{ position: 'absolute', left: '-9999px', top: 0, pointerEvents: 'none' }} aria-hidden="true">
        <div id="retaining-wall-svg-pdf">
          <RetainingWallSVG inp={state} result={result} mode="pdf" width={380} height={430} view="geometry" />
        </div>
        <div id="retaining-wall-svg-pdf-loads">
          <RetainingWallSVG inp={state} result={result} mode="pdf" width={560} height={460} view="loads" />
        </div>
        <div id="retaining-wall-svg-pdf-rebar">
          <RetainingWallSVG inp={state} result={result} mode="pdf" width={560} height={460} view="rebar" />
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
