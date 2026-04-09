import { useMemo, useState, useCallback } from 'react';
import { empresalladoDefaults } from '../../data/defaults';
import { useModuleState } from '../../hooks/useModuleState';
import { useContainerWidth } from '../../hooks/useContainerWidth';
import { useDrawer } from '../../components/layout/AppShell';
import { calcEmpresillado } from '../../lib/calculations/empresillado';
import { exportEmpresalladoPDF } from '../../lib/pdf/empresillado';
import { Topbar } from '../../components/layout/Topbar';
import { showToast } from '../../components/ui/Toast';
import { EmpresalladoInputsPanel } from './EmpresalladoInputs';
import { EmpresalladoSvg } from './EmpresalladoSvg';
import { EmpresalladoResults } from './EmpresalladoResults';

export function EmpresalladoModule() {
  const { state, setField, reset } = useModuleState('empresillado', empresalladoDefaults);
  const { openDrawer } = useDrawer();
  const [tab, setTab] = useState<'inputs' | 'results'>('inputs');

  const result = useMemo(() => calcEmpresillado(state), [state]);
  const sError = state.s <= state.lp;

  const [pdfExporting, setPdfExporting] = useState(false);
  const handleExportPdf = useCallback(async () => {
    if (!result.valid) {
      showToast('Los datos de entrada no son válidos', { autoDismiss: 3000 });
      return;
    }
    setPdfExporting(true);
    try {
      await exportEmpresalladoPDF(state, result);
    } catch {
      showToast('Error al generar el PDF', { autoDismiss: 4000 });
    } finally {
      setPdfExporting(false);
    }
  }, [state, result]);

  const [canvasRef, canvasWidth] = useContainerWidth();
  const SVG_W = Math.min(Math.max((canvasWidth ?? 0) - 32, 240), 760);
  const SVG_H = Math.round(SVG_W * (240 / 760));

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <Topbar
        moduleLabel="Empresillado"
        moduleGroup="Rehabilitación"
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
          <div className="flex-1 overflow-y-auto scroll-hide px-5 py-4 pb-20 md:pb-4">
            <EmpresalladoInputsPanel state={state} setField={setField} sError={sError} />
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
          {/* SVG canvas */}
          <div
            ref={canvasRef}
            className="hidden md:flex border-b border-border-main canvas-dot-grid items-center justify-center py-6 px-4"
          >
            {SVG_W > 0 && (
              <EmpresalladoSvg inp={state} result={result} mode="screen" width={SVG_W} height={SVG_H} />
            )}
          </div>

          {/* Error banner when s ≤ lp */}
          {sError && (
            <div className="mx-6 mt-4 flex items-center gap-2 rounded border border-state-fail/30 bg-state-fail/5 px-3 py-2">
              <span className="text-[11px] text-state-fail">⚠ Geometría inválida — s ≤ lp. Corrija la separación de pletinas.</span>
            </div>
          )}

          {/* Results */}
          <div className="px-6 py-5 pb-20 md:pb-5">
            <EmpresalladoResults result={result} inp={state} />
          </div>
        </div>

      </div>

      {/* Mobile bottom tab bar */}
      <nav className="fixed bottom-0 left-0 right-0 md:hidden flex border-t border-border-main bg-bg-surface z-10" aria-label="Secciones">
        <button
          onClick={() => setTab('inputs')}
          className={`flex-1 py-3.5 text-sm font-medium transition-colors ${tab === 'inputs' ? 'text-accent' : 'text-text-secondary'}`}
        >
          Datos
        </button>
        <button
          onClick={() => setTab('results')}
          className={`flex-1 py-3.5 text-sm font-medium transition-colors ${tab === 'results' ? 'text-accent' : 'text-text-secondary'}`}
        >
          Resultados
        </button>
      </nav>

      {/* Hidden PDF SVG */}
      <div className="overflow-hidden w-0 h-0" aria-hidden="true">
        <div
          id="empresillado-svg-pdf"
          style={{ position: 'absolute', left: '-9999px', top: 0, pointerEvents: 'none' }}
        >
          <EmpresalladoSvg inp={state} result={result} mode="pdf" width={760} height={240} />
        </div>
      </div>
    </div>
  );
}
