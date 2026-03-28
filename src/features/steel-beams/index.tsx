import { useMemo, useState } from 'react';
import { steelBeamDefaults } from '../../data/defaults';
import { useModuleState } from '../../hooks/useModuleState';
import { calcSteelBeam } from '../../lib/calculations/steelBeams';
import { exportSteelBeamsPDF } from '../../lib/pdf/steelBeams';
import { Topbar } from '../../components/layout/Topbar';
import { showToast } from '../../components/ui/Toast';
import { SteelBeamsInputs } from './SteelBeamsInputs';
import { SteelBeamsSVG } from './SteelBeamsSVG';
import { SteelBeamsResults } from './SteelBeamsResults';

export function SteelBeamsModule() {
  const { state, setField, reset } = useModuleState('steel-beams', steelBeamDefaults);
  const result = useMemo(() => calcSteelBeam(state), [state]);
  const [pdfExporting, setPdfExporting] = useState(false);

  const handleExportPdf = async () => {
    if (!result.valid) {
      showToast('Los datos de entrada no son válidos', { autoDismiss: 3000 });
      return;
    }
    setPdfExporting(true);
    try {
      await exportSteelBeamsPDF(state, result);
    } catch {
      showToast('Error al generar el PDF', { autoDismiss: 4000 });
    } finally {
      setPdfExporting(false);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <Topbar
        moduleLabel="Vigas"
        moduleGroup="Acero"
        onExportPdf={handleExportPdf}
        pdfExporting={pdfExporting}
      />

      {/* Two-column layout */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Left: inputs panel */}
        <div className="w-75 shrink-0 border-r border-border-main flex flex-col min-h-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto scroll-hide px-5 py-4">
            <SteelBeamsInputs state={state} setField={setField} />
          </div>
          <div className="px-5 py-3 border-t border-border-main shrink-0">
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
        <div className="flex-1 min-w-0 overflow-y-auto scroll-hide">
          {/* SVG canvas */}
          <div className="border-b border-border-main canvas-dot-grid flex items-center justify-center py-8">
            <SteelBeamsSVG inp={state} result={result} mode="screen" width={340} height={220} />
          </div>

          {/* Results */}
          <div className="px-6 py-5">
            <SteelBeamsResults result={result} />
          </div>
        </div>

      </div>

      {/* Hidden PDF clone */}
      <div
        id="steel-beams-svg-pdf"
        aria-hidden="true"
        style={{ position: 'absolute', left: '-9999px', top: 0, pointerEvents: 'none' }}
      >
        <SteelBeamsSVG inp={state} result={result} mode="pdf" width={420} height={260} />
      </div>
    </div>
  );
}
