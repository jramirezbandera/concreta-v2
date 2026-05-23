import { useMemo, useState, useEffect, useCallback } from 'react';
import { micropilesDefaults, micropilesSoilDefaults, type MicropilesInputs, type SoilLayer } from '../../data/defaults';
import { type SoilType } from '../../data/micropileLookups';
import { useModuleState } from '../../hooks/useModuleState';
import { useContainerWidth } from '../../hooks/useContainerWidth';
import { usePdfPreview } from '../../hooks/usePdfPreview';
import { useDrawer } from '../../components/layout/AppShell';
import { calcMicropiles } from '../../lib/calculations/micropiles';
import { exportMicropilesPDF } from '../../lib/pdf/micropiles';
import { Topbar } from '../../components/layout/Topbar';
import { PdfPreviewModal } from '../../components/ui/PdfPreviewModal';
import { MobileTabBar, type MobileTab } from '../../components/ui/MobileTabBar';
import { MicropilesInputsPanel } from './MicropilesInputsPanel';
import { MicropilesSVG, type MicropilesView } from './MicropilesSVG';
import { MicropilesResults } from './MicropilesResults';
import { loadSoil, saveSoil } from './soilStorage';

const VIEW_TABS: { id: MicropilesView; num: string; label: string; color: string }[] = [
  { id: 'profile',    num: '1', label: 'Perfil',     color: '#a8825a' },
  { id: 'rfcCurve',   num: '2', label: 'Rfc curva',  color: '#38bdf8' },
  { id: 'topSection', num: '3', label: 'Sección tope', color: '#f8fafc' },
  { id: 'semaphores', num: '4', label: 'Semáforos',  color: '#22c55e' },
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

function UtilStat({ label, util }: { label: string; util: number }) {
  const color =
    util >= 1.0 ? 'text-state-fail' :
    util >= 0.8 ? 'text-state-warn' :
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
  const { state, setField, reset } = useModuleState<MicropilesInputs>('micropiles', micropilesDefaults);
  const { openDrawer } = useDrawer();
  const [tab, setTab] = useState<MobileTab>('inputs');
  const [view, setView] = useState<MicropilesView>('profile');
  const [soil, setSoil] = useState<SoilLayer[]>(loadSoil);

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

  const { pdfExporting, pdfPreview, handleExportPdf, handleDownloadPdf, closePdfPreview } =
    usePdfPreview(() => exportMicropilesPDF(state, soil, result), true);

  const [canvasRef, canvasWidth] = useContainerWidth();
  const svgW = canvasWidth !== undefined && canvasWidth > 0
    ? Math.max(280, canvasWidth - 32)
    : 560;
  const svgH = Math.min(520, Math.round(svgW * (430 / 560)));

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <Topbar
        moduleLabel="Micropilotes"
        moduleGroup="Cimentación"
        onExportPdf={handleExportPdf}
        pdfExporting={pdfExporting}
        onMenuOpen={openDrawer}
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
            <div className="flex flex-col items-center px-4 canvas-dot-grid py-4">
              <MicropilesSVG
                inp={state}
                soil={soil}
                result={result}
                view={view}
                width={340}
                height={Math.round(340 * (430 / 560))}
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
