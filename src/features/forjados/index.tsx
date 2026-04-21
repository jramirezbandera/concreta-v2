import { useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { forjadosDefaults, type ForjadosVariant } from '../../data/defaults';
import { useModuleState } from '../../hooks/useModuleState';
import { useContainerWidth } from '../../hooks/useContainerWidth';
import { usePdfPreview } from '../../hooks/usePdfPreview';
import { useDrawer } from '../../components/layout/AppShell';
import { calcForjados } from '../../lib/calculations/rcSlabs';
import { exportForjadosPDF } from '../../lib/pdf/forjados';
import { useUnitSystem } from '../../lib/units/useUnitSystem';
import { Topbar } from '../../components/layout/Topbar';
import { PdfPreviewModal } from '../../components/ui/PdfPreviewModal';
import { MobileTabBar, type MobileTab } from '../../components/ui/MobileTabBar';
import { showToast } from '../../components/ui/Toast';
import { ForjadosInputsPanel } from './ForjadosInputs';
import { ForjadosResults } from './ForjadosResults';
import { ForjadosSVG } from './ForjadosSVG';

export function ForjadosModule() {
  const { state, setField } = useModuleState('forjados', forjadosDefaults);
  const { openDrawer } = useDrawer();
  const { system } = useUnitSystem();
  const [tab, setTab] = useState<MobileTab>('inputs');
  const [section, setSection] = useState<'vano' | 'apoyo'>('vano');

  const result = useMemo(() => calcForjados(state), [state]);

  const { pdfExporting, pdfPreview, handleExportPdf, handleDownloadPdf, closePdfPreview } =
    usePdfPreview(() => exportForjadosPDF(state, result, system), true);

  const [canvasRef, canvasWidth] = useContainerWidth();
  const svgW = canvasWidth !== undefined && canvasWidth > 0
    ? Math.max(220, canvasWidth - 32)
    : 380;

  // Variant switch: reset armado fields to defaults for the new variant + toast.
  // Reason: reticular uses n×Ø bundles; maciza uses Ø/s parrillas; the base/refuerzo
  // field sets differ, so stale values across the switch are confusing.
  const handleVariantSwitch = (next: ForjadosVariant) => {
    if (next === state.variant) return;
    setField('variant', next);
    const armadoFields = [
      // Reticular: montaje base + refuerzos zonales (n × Ø)
      'base_sup_nBars', 'base_sup_barDiam',
      'base_inf_nBars', 'base_inf_barDiam',
      'refuerzo_vano_inf_nBars',  'refuerzo_vano_inf_barDiam',
      'refuerzo_apoyo_sup_nBars', 'refuerzo_apoyo_sup_barDiam',
      // Maciza: parrilla base + refuerzos zonales (Ø / s)
      'base_sup_phi_mac', 'base_sup_s_mac',
      'base_inf_phi_mac', 'base_inf_s_mac',
      'refuerzo_vano_inf_phi_mac',  'refuerzo_vano_inf_s_mac',
      'refuerzo_apoyo_sup_phi_mac', 'refuerzo_apoyo_sup_s_mac',
    ] as const;
    for (const f of armadoFields) {
      setField(f, forjadosDefaults[f]);
    }
    // For reticular, also re-apply preset tipología geometry
    if (next === 'reticular') {
      setField('tipologia', forjadosDefaults.tipologia);
      setField('h',        forjadosDefaults.h);
      setField('hFlange',  forjadosDefaults.hFlange);
      setField('bWeb',     forjadosDefaults.bWeb);
      setField('intereje', forjadosDefaults.intereje);
    }
    showToast('Armado reiniciado al cambiar de variante', { autoDismiss: 3000 });
  };

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <Helmet>
        <title>Forjados (reticular / maciza) — Concreta</title>
        <meta
          name="description"
          content="Comprobación de forjados reticular y losa maciza en una dirección. Flexión (sección T), cortante y fisuración. Código Estructural art. 21, 42, 44, 49."
        />
      </Helmet>
      <Topbar
        moduleLabel="Forjados"
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
            'md:w-72 md:shrink-0 md:border-r md:border-border-main',
            tab === 'inputs' ? 'max-md:flex-1' : 'max-md:hidden',
            'md:flex',
          ].join(' ')}
        >
          <div className="flex-1 overflow-y-auto overflow-x-hidden scroll-hide px-4 py-4 min-w-0">
            <ForjadosInputsPanel
              state={state}
              section={section}
              setSection={setSection}
              setField={setField}
              onVariantSwitch={handleVariantSwitch}
            />
          </div>
        </div>

        {/* Right: SVG canvas + results */}
        <div
          className={[
            'min-w-0 overflow-y-auto scroll-hide',
            'md:flex-1',
            tab === 'results' ? 'flex-1' : 'hidden',
            'md:block',
          ].join(' ')}
        >
          <div
            ref={canvasRef}
            className="hidden md:flex justify-center border-b border-border-main canvas-dot-grid py-4 px-4"
          >
            <ForjadosSVG inp={state} result={result} section={section} width={Math.min(svgW, 480)} mode="screen" />
          </div>
          <div className="px-6 py-5">
            <ForjadosResults result={result} />
          </div>
        </div>

        {/* Mobile: Diagramas tab */}
        {tab === 'diagramas' && (
          <div className="flex-1 overflow-y-auto scroll-hide canvas-dot-grid md:hidden flex flex-col items-center py-4 px-4 gap-4">
            <ForjadosSVG inp={state} result={result} section={section} width={340} mode="screen" />
          </div>
        )}
      </div>

      {/* Hidden PDF SVG */}
      <div className="overflow-hidden w-0 h-0" aria-hidden="true">
        <div
          id="forjados-svg-pdf"
          style={{ position: 'absolute', left: '-9999px', top: 0, pointerEvents: 'none' }}
        >
          <ForjadosSVG inp={state} result={result} section={section} width={480} mode="pdf" />
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
