import { useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { rcBeamDefaults } from '../../data/defaults';
import { useModuleState } from '../../hooks/useModuleState';
import { useContainerWidth } from '../../hooks/useContainerWidth';
import { useDrawer } from '../../components/layout/AppShell';
import { calcRCBeam } from '../../lib/calculations/rcBeams';
import { exportRCBeamsPDF } from '../../lib/pdf/rcBeams';
import { Topbar } from '../../components/layout/Topbar';
import { showToast } from '../../components/ui/Toast';
import { RCBeamsInputs } from './RCBeamsInputs';
import { RCBeamsSVG } from './RCBeamsSVG';
import { RCBeamsResults } from './RCBeamsResults';

export function RCBeamsModule() {
  const { state, setField, reset } = useModuleState('rc-beams', rcBeamDefaults);
  const { openDrawer } = useDrawer();
  const [tab, setTab] = useState<'inputs' | 'results'>('inputs');
  const [section, setSection] = useState<'vano' | 'apoyo'>('vano');

  const result = useMemo(() => calcRCBeam(state), [state]);
  const [pdfExporting, setPdfExporting] = useState(false);

  const handleExportPdf = async () => {
    if (!result.valid) {
      showToast('Los datos de entrada no son validos', { autoDismiss: 3000 });
      return;
    }
    setPdfExporting(true);
    try {
      await exportRCBeamsPDF(state, result);
    } catch {
      showToast('Error al generar el PDF', { autoDismiss: 4000 });
    } finally {
      setPdfExporting(false);
    }
  };

  // Responsive SVG sizing — two SVGs side by side, stacked below STACK_THRESHOLD
  const [canvasRef, canvasWidth] = useContainerWidth();
  const CANVAS_PAD      = 32;
  const GAP             = 16;
  const STACK_THRESHOLD = 560;
  const MAX_SVG_H       = 300;  // cap height so canvas doesn't dominate the panel
  const isStacked = (canvasWidth ?? 0) < STACK_THRESHOLD;
  let rcSvgW: number;
  if (isStacked && canvasWidth !== undefined && canvasWidth > 0) {
    rcSvgW = Math.max(180, canvasWidth - CANVAS_PAD);
  } else if (canvasWidth !== undefined && canvasWidth > 0) {
    rcSvgW = Math.max(150, Math.floor((canvasWidth - CANVAS_PAD - GAP) / 2));
  } else {
    rcSvgW = 220;
  }
  // Aspect ratio ~1.3 (portrait — beams are taller than wide)
  const rcSvgH = Math.min(MAX_SVG_H, Math.round(rcSvgW * 1.3));

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <Helmet>
        <title>Vigas de hormigón armado — Concreta</title>
        <meta name="description" content="Cálculo de vigas HA: flexión, cortante y fisuración según el Código Estructural art. 22–26. Resultados instantáneos." />
      </Helmet>
      <Topbar
        moduleLabel="Vigas"
        moduleGroup="Hormigon Armado"
        onExportPdf={handleExportPdf}
        pdfExporting={pdfExporting}
        onMenuOpen={openDrawer}
      />

      {/* Two-column (desktop) / Tabbed (mobile) */}
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
          <div className="flex-1 overflow-y-auto scroll-hide px-5 py-4 pb-20 md:pb-4">
            <RCBeamsInputs
              state={state}
              section={section}
              setSection={setSection}
              setField={setField}
            />
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
          {/* SVG canvas — desktop only, two sections side by side */}
          <div
            ref={canvasRef}
            className={[
              'hidden md:flex border-b border-border-main canvas-dot-grid py-4 px-4',
              isStacked ? 'flex-col items-center gap-3' : 'flex-row items-start justify-center gap-4',
            ].join(' ')}
          >
            {result.vano && (
              <div className="flex flex-col items-center gap-1">
                <span className="text-[11px] text-text-secondary font-mono tracking-wide">VANO — M+</span>
                <RCBeamsSVG
                  inp={state}
                  result={result}
                  momentSign="positive"
                  mode="screen"
                  width={rcSvgW}
                  height={rcSvgH}
                />
              </div>
            )}
            {result.apoyo && (
              <div className="flex flex-col items-center gap-1">
                <span className="text-[11px] text-text-secondary font-mono tracking-wide">APOYO — M−</span>
                <RCBeamsSVG
                  inp={state}
                  result={result}
                  momentSign="negative"
                  mode="screen"
                  width={rcSvgW}
                  height={rcSvgH}
                />
              </div>
            )}
          </div>

          {/* Results */}
          <div className="px-6 py-5 pb-20 md:pb-5">
            <RCBeamsResults result={result} activeSection={section} />
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

      {/* Hidden PDF clones — vano (M+) and apoyo (M-) */}
      <div className="overflow-hidden w-0 h-0" aria-hidden="true">
        <div
          id="rc-beams-svg-pdf-vano"
          style={{ position: 'absolute', left: '-9999px', top: 0, pointerEvents: 'none' }}
        >
          <RCBeamsSVG inp={state} result={result} momentSign="positive" mode="pdf" width={300} height={370} />
        </div>
        <div
          id="rc-beams-svg-pdf-apoyo"
          style={{ position: 'absolute', left: '-9999px', top: 0, pointerEvents: 'none' }}
        >
          <RCBeamsSVG inp={state} result={result} momentSign="negative" mode="pdf" width={300} height={370} />
        </div>
      </div>
    </div>
  );
}
