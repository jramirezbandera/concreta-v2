import { useMemo, useState, useCallback } from 'react';
import { isolatedFootingDefaults } from '../../data/defaults';
import { useModuleState } from '../../hooks/useModuleState';
import { useContainerWidth } from '../../hooks/useContainerWidth';
import { useDrawer } from '../../components/layout/AppShell';
import { calcIsolatedFooting } from '../../lib/calculations/isolatedFooting';
import { exportIsolatedFootingPDF } from '../../lib/pdf/isolatedFooting';
import { Topbar } from '../../components/layout/Topbar';
import { showToast } from '../../components/ui/Toast';
import { IsolatedFootingInputsPanel } from './IsolatedFootingInputsPanel';
import { IsolatedFootingResults } from './IsolatedFootingResults';
import { IsolatedFootingSVG } from './IsolatedFootingSVG';

export function IsolatedFootingModule() {
  const { state, setField } = useModuleState('isolated-footing', isolatedFootingDefaults);
  const { openDrawer } = useDrawer();
  const [tab, setTab] = useState<'inputs' | 'results' | 'esquema'>('inputs');

  const result = useMemo(() => calcIsolatedFooting(state), [state]);

  const [pdfExporting, setPdfExporting] = useState(false);

  const handleExportPdf = useCallback(async () => {
    if (result.error) {
      showToast('Los datos de entrada no son válidos', { autoDismiss: 3000 });
      return;
    }
    setPdfExporting(true);
    try {
      await exportIsolatedFootingPDF(state, result);
    } catch {
      showToast('Error al generar el PDF', { autoDismiss: 4000 });
    } finally {
      setPdfExporting(false);
    }
  }, [state, result]);

  const [canvasRef, canvasWidth] = useContainerWidth();
  const svgW = canvasWidth !== undefined && canvasWidth > 0
    ? Math.max(200, canvasWidth - 32)
    : 360;

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <Topbar
        moduleLabel="Zapatas"
        moduleGroup="Cimentación"
        onExportPdf={handleExportPdf}
        pdfExporting={pdfExporting}
        onMenuOpen={openDrawer}
      />

      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Left: inputs */}
        <div
          className={[
            'flex flex-col min-h-0 overflow-hidden',
            'md:w-72 md:shrink-0 md:border-r md:border-border-main',
            tab === 'inputs' ? 'max-md:flex-1' : 'max-md:hidden',
            'md:flex',
          ].join(' ')}
        >
          <div className="flex-1 overflow-y-auto scroll-hide px-4 py-4 pb-20 md:pb-4">
            <IsolatedFootingInputsPanel state={state} setField={setField} />
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
          {/* SVG canvas — desktop */}
          <div
            ref={canvasRef}
            className="hidden md:flex justify-center border-b border-border-main canvas-dot-grid py-4 px-4 min-h-90 items-start"
          >
            <IsolatedFootingSVG inp={state} result={result} width={Math.min(svgW, 440)} mode="screen" />
          </div>

          {/* Results */}
          <div className="px-2 py-3 pb-20 md:pb-5">
            <IsolatedFootingResults inp={state} result={result} />
          </div>
        </div>

        {/* Mobile: Esquema tab */}
        {tab === 'esquema' && (
          <div className="flex-1 overflow-y-auto scroll-hide pb-20 md:hidden flex flex-col items-center py-4 px-4 gap-4">
            <IsolatedFootingSVG inp={state} result={result} width={Math.min(340, 340)} mode="screen" />
          </div>
        )}

      </div>

      {/* Mobile bottom tab bar */}
      <nav
        className="fixed bottom-0 left-0 right-0 md:hidden flex border-t border-border-main bg-bg-surface z-10"
        aria-label="Secciones"
      >
        {(['inputs', 'esquema', 'results'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-3.5 text-sm font-medium transition-colors ${tab === t ? 'text-accent' : 'text-text-secondary'}`}
          >
            {t === 'inputs' ? 'Datos' : t === 'esquema' ? 'Esquema' : 'Resultados'}
          </button>
        ))}
      </nav>

      {/* Hidden PDF clone */}
      <div className="overflow-hidden w-0 h-0" aria-hidden="true">
        <div
          id="isolated-footing-svg-pdf"
          style={{ position: 'absolute', left: '-9999px', top: 0, pointerEvents: 'none' }}
        >
          <IsolatedFootingSVG inp={state} result={result} mode="pdf" width={320} />
        </div>
      </div>
    </div>
  );
}
