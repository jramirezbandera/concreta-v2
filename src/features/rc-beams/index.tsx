import { useMemo, useState } from 'react';
import { rcBeamDefaults } from '../../data/defaults';
import { useModuleState } from '../../hooks/useModuleState';
import { useContainerWidth } from '../../hooks/useContainerWidth';
import { useTitledPdfExport } from '../../hooks/useTitledPdfExport';
import { useDrawer } from '../../components/layout/AppShell';
import { calcRCBeam } from '../../lib/calculations/rcBeams';
import { exportRCBeamsPDF, rcBeamsFallbackFilename } from '../../lib/pdf/rcBeams';
import { useUnitSystem } from '../../lib/units/useUnitSystem';
import { Topbar } from '../../components/layout/Topbar';
import { PdfPreviewModal } from '../../components/ui/PdfPreviewModal';
import { TitlePromptModal } from '../../components/ui/TitlePromptModal';
import { MobileTabBar, type MobileTab } from '../../components/ui/MobileTabBar';
import { RCBeamsInputs } from './RCBeamsInputs';
import { RCBeamsSVG } from './RCBeamsSVG';
import { RCBeamsResults } from './RCBeamsResults';
import { RCBeamSimpleView } from './RCBeamSimpleView';
import { RCBeamStrainSVG } from './RCBeamStrainSVG';
import { RCBeamForcesSVG } from './RCBeamForcesSVG';
import { pickSectionInputs } from '../../lib/calculations/rcBeams';
import { solveSectionAtMoment } from '../../lib/calculations/rcBeamsSection';

export function RCBeamsModule() {
  const { state, setField, reset, copyShareLink } = useModuleState('rc-beams', rcBeamDefaults);
  const { openDrawer } = useDrawer();
  const { system } = useUnitSystem();
  const [tab, setTab] = useState<MobileTab>('inputs');
  const [section, setSection] = useState<'vano' | 'apoyo'>('vano');
  const isSimple = state.mode === 'simple';

  const result = useMemo(() => calcRCBeam(state), [state]);

  // PDF export stays available even when result is invalid — engineers may
  // need a PDF to document a failing/non-conforming section (memory note).
  // "Preguntar al exportar": openExport valida y abre el TitlePromptModal; al
  // confirmar se persiste el título y se genera el PDF con él.
  const { pdfExporting, pdfPreview, handleDownloadPdf, closePdfPreview, titleOpen, openExport, confirmTitle, closeTitle } =
    useTitledPdfExport({
      exportFn: (title) => exportRCBeamsPDF(state, result, system, title),
      valid: true,
      onTitleChange: (t) => setField('title', t),
    });

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
  // Mobile "Diagramas" tab measures its own container so the SVGs scale to the
  // phone instead of a fixed 340px that overflowed on narrow screens.
  const [mobileCanvasRef, mobileCanvasWidth] = useContainerWidth();
  const mobileW = mobileCanvasWidth ? Math.min(420, Math.max(240, mobileCanvasWidth - CANVAS_PAD)) : 300;

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <Topbar
        moduleLabel="Vigas"
        moduleGroup="Hormigon Armado"
        onExportPdf={openExport}
        pdfExporting={pdfExporting}
        onMenuOpen={openDrawer}
        onCopyLink={copyShareLink}
      />
      <MobileTabBar
        tab={isSimple && tab === 'diagramas' ? 'results' : tab}
        setTab={setTab}
        hide={isSimple ? ['diagramas'] : undefined}
      />

      {/* Two-column (desktop) / Tabbed (mobile) */}
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
          <div className="flex-1 overflow-y-auto scroll-hide px-5 py-4">
            <RCBeamsInputs
              state={state}
              section={section}
              setSection={setSection}
              setField={setField}
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

        {/* Right: SVG + results */}
        <div
          className={[
            'min-w-0 overflow-y-auto scroll-hide',
            'lg:flex-1',
            tab === 'results' ? 'flex-1' : 'hidden',
            'lg:block',
          ].join(' ')}
        >
          {isSimple ? (
            <RCBeamSimpleView state={state} result={result} />
          ) : (
            <>
              {/* SVG canvas — desktop only, two sections side by side */}
              <div
                ref={canvasRef}
                className={[
                  'hidden lg:flex border-b border-border-main canvas-dot-grid py-4 px-4',
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
              <div className="px-6 py-5">
                <RCBeamsResults result={result} activeSection={section} />
              </div>
            </>
          )}
        </div>

        {/* Mobile: Diagramas tab — portico only (simple mode lives in main panel) */}
        {tab === 'diagramas' && !isSimple && (
          <div ref={mobileCanvasRef} className="flex-1 overflow-y-auto scroll-hide lg:hidden flex flex-col items-center py-4 px-4 gap-4 canvas-dot-grid">
            {result.vano && (
              <div className="flex flex-col items-center gap-1">
                <span className="text-[11px] text-text-secondary font-mono tracking-wide">VANO — M+</span>
                <RCBeamsSVG inp={state} result={result} momentSign="positive" mode="screen" width={mobileW} height={Math.round(mobileW * 1.3)} />
              </div>
            )}
            {result.apoyo && (
              <div className="flex flex-col items-center gap-1">
                <span className="text-[11px] text-text-secondary font-mono tracking-wide">APOYO — M−</span>
                <RCBeamsSVG inp={state} result={result} momentSign="negative" mode="screen" width={mobileW} height={Math.round(mobileW * 1.3)} />
              </div>
            )}
          </div>
        )}

      </div>

      {/* Hidden PDF clones — vano (M+) and apoyo (M-) for portico mode */}
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
        {/* Simple-mode PDF clones — strain | section | forces */}
        {isSimple && (() => {
          const secInp = pickSectionInputs(state, 'vano');
          const sectionResult = solveSectionAtMoment(secInp, secInp.Md);
          const h = state.h as number;
          return (
            <>
              <div
                id="rc-beams-svg-pdf-strain"
                style={{ position: 'absolute', left: '-9999px', top: 0, pointerEvents: 'none' }}
              >
                <RCBeamStrainSVG sectionResult={sectionResult} h={h} mode="pdf" width={300} height={370} />
              </div>
              <div
                id="rc-beams-svg-pdf-forces"
                style={{ position: 'absolute', left: '-9999px', top: 0, pointerEvents: 'none' }}
              >
                <RCBeamForcesSVG sectionResult={sectionResult} h={h} fck={state.fck as number} mode="pdf" width={300} height={370} />
              </div>
            </>
          );
        })()}
      </div>

      {titleOpen && (
        <TitlePromptModal
          initialTitle={state.title}
          fallbackFilename={rcBeamsFallbackFilename(state)}
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
