import { useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { retainingWallDefaults } from '../../data/defaults';
import { useModuleState } from '../../hooks/useModuleState';
import { useContainerWidth } from '../../hooks/useContainerWidth';
import { useDrawer } from '../../components/layout/AppShell';
import { calcRetainingWall } from '../../lib/calculations/retainingWall';
import { exportRetainingWallPDF } from '../../lib/pdf/retainingWall';
import { Topbar } from '../../components/layout/Topbar';
import { showToast } from '../../components/ui/Toast';
import { RetainingWallInputsPanel } from './RetainingWallInputs';
import { RetainingWallSVG } from './RetainingWallSVG';
import { RetainingWallResults } from './RetainingWallResults';

export function RetainingWallModule() {
  const { state, setField, reset } = useModuleState('retaining-wall', retainingWallDefaults);
  const { openDrawer } = useDrawer();
  const [tab, setTab] = useState<'inputs' | 'results'>('inputs');
  const [pdfExporting, setPdfExporting] = useState(false);

  const result = useMemo(() => calcRetainingWall(state), [state]);

  const handleExportPdf = async () => {
    if (!result.valid) {
      showToast('Los datos de entrada no son validos', { autoDismiss: 3000 });
      return;
    }
    setPdfExporting(true);
    try {
      await exportRetainingWallPDF(state, result);
    } catch {
      showToast('Error al generar el PDF', { autoDismiss: 4000 });
    } finally {
      setPdfExporting(false);
    }
  };

  const [canvasRef, canvasWidth] = useContainerWidth();
  const svgW = canvasWidth !== undefined && canvasWidth > 0
    ? Math.max(200, canvasWidth - 32)
    : 380;
  const svgH = Math.round(svgW * (480 / 420));

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

      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Left: inputs panel */}
        <div
          className={[
            'flex flex-col min-h-0 overflow-hidden',
            'md:w-72 md:shrink-0 md:border-r md:border-border-main',
            tab === 'inputs' ? 'max-md:flex-1' : 'max-md:hidden',
            'md:flex',
          ].join(' ')}
        >
          <div className="flex-1 overflow-y-auto scroll-hide px-4 py-4 pb-20 md:pb-4">
            <RetainingWallInputsPanel state={state} setField={setField} />
          </div>
          <div className="hidden md:block px-4 py-3 border-t border-border-main shrink-0">
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
            className="hidden md:flex justify-center border-b border-border-main canvas-dot-grid py-4 px-4"
          >
            <RetainingWallSVG
              inp={state}
              result={result}
              mode="screen"
              width={Math.min(svgW, 500)}
              height={Math.min(svgH, 560)}
            />
          </div>

          {/* Results */}
          <div className="px-6 py-5 pb-20 md:pb-5">
            <RetainingWallResults result={result} inp={state} />
          </div>
        </div>

      </div>

      {/* Mobile bottom tab bar */}
      <nav
        className="fixed bottom-0 left-0 right-0 md:hidden flex border-t border-border-main bg-bg-surface z-10"
        aria-label="Secciones"
      >
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

      {/* Hidden PDF clone */}
      <div style={{ position: 'absolute', left: '-9999px', top: 0, pointerEvents: 'none' }} aria-hidden="true">
        <div id="retaining-wall-svg-pdf">
          <RetainingWallSVG inp={state} result={result} mode="pdf" width={380} height={430} />
        </div>
      </div>
    </div>
  );
}
