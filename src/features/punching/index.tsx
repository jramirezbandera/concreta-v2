import { useMemo, useState } from 'react';
import { punchingDefaults } from '../../data/defaults';
import { useModuleState } from '../../hooks/useModuleState';
import { useContainerWidth } from '../../hooks/useContainerWidth';
import { usePdfPreview } from '../../hooks/usePdfPreview';
import { useDrawer } from '../../components/layout/AppShell';
import { calcPunching } from '../../lib/calculations/punching';
import { exportPunchingPDF } from '../../lib/pdf/punching';
import { useUnitSystem } from '../../lib/units/useUnitSystem';
import { Topbar } from '../../components/layout/Topbar';
import { PdfPreviewModal } from '../../components/ui/PdfPreviewModal';
import { MobileTabBar, type MobileTab } from '../../components/ui/MobileTabBar';
import { PunchingInputsPanel } from './PunchingInputs';
import { PunchingResults } from './PunchingResults';
import { PunchingSVG } from './PunchingSVG';

export function PunchingModule() {
  const { state, setField, reset } = useModuleState('punching', punchingDefaults);
  const { openDrawer } = useDrawer();
  const { system } = useUnitSystem();
  const [tab, setTab] = useState<MobileTab>('inputs');

  // Arm length auto-fill (cruceta): auto by default — the field shows the computed
  // L_eff,max; editing it switches to manual override (mirrors steel-beams Lcr).
  const [armManual, setArmManual] = useState(false);
  const calcState = useMemo(
    () => (armManual ? state : { ...state, armLength: 0 }),
    [state, armManual],
  );
  const result = useMemo(() => calcPunching(calcState), [calcState]);

  const autoLeffMax = result.cruceta?.LeffMax ?? 0;
  const displayArmLength = armManual ? state.armLength : Math.round(autoLeffMax);
  const handleArmLengthChange = (val: number) => {
    setField('armLength', val);
    setArmManual(Math.abs(val - autoLeffMax) > 2);
  };
  const handleArmLengthAuto = () => { setArmManual(false); setField('armLength', 0); };

  const { pdfExporting, pdfPreview, handleExportPdf, handleDownloadPdf, closePdfPreview } =
    usePdfPreview(() => exportPunchingPDF(calcState, result, system), true);

  const [canvasRef, canvasWidth] = useContainerWidth();
  const svgW = canvasWidth !== undefined && canvasWidth > 0
    ? Math.max(200, canvasWidth - 32)
    : 360;

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <Topbar
        moduleLabel="Punzonamiento"
        moduleGroup="Hormigón"
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
            'lg:w-72 lg:shrink-0 lg:border-r lg:border-border-main',
            tab === 'inputs' ? 'max-lg:flex-1' : 'max-lg:hidden',
            'lg:flex',
          ].join(' ')}
        >
          <div className="flex-1 overflow-y-auto scroll-hide px-4 py-4">
            <PunchingInputsPanel
              state={state}
              setField={setField}
              armLengthDisplay={displayArmLength}
              armLengthAuto={!armManual}
              onArmLengthChange={handleArmLengthChange}
              onArmLengthAuto={handleArmLengthAuto}
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
          {/* SVG canvas — desktop only (mobile has 'Esquema' tab) */}
          <div
            ref={canvasRef}
            className="hidden lg:flex justify-center border-b border-border-main canvas-dot-grid py-4 px-4"
          >
            <PunchingSVG inp={calcState} result={result} width={Math.min(svgW, 440)} mode="screen" />
          </div>

          {/* Results */}
          <div className="px-6 py-5">
            <PunchingResults result={result} />
          </div>
        </div>

        {/* Mobile: Diagramas tab */}
        {tab === 'diagramas' && (
          <div className="flex-1 overflow-y-auto scroll-hide canvas-dot-grid lg:hidden flex flex-col items-center py-4 px-4 gap-4">
            <PunchingSVG inp={calcState} result={result} width={340} mode="screen" />
          </div>
        )}

      </div>

      {/* Hidden PDF SVG */}
      <div className="overflow-hidden w-0 h-0" aria-hidden="true">
        <div
          id="punching-svg-pdf"
          style={{ position: 'absolute', left: '-9999px', top: 0, pointerEvents: 'none' }}
        >
          <PunchingSVG inp={calcState} result={result} width={440} mode="pdf" />
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
