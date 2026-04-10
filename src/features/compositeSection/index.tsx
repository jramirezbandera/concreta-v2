import { useMemo, useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet-async';
import { compositeSectionDefaults, type CompositeSectionInputs, type PlateEntry } from '../../data/defaults';
import { useContainerWidth } from '../../hooks/useContainerWidth';
import { useDrawer } from '../../components/layout/AppShell';
import { calcCompositeSection } from '../../lib/calculations/compositeSection';
import { exportCompositeSectionPDF } from '../../lib/pdf/compositeSection';
import { Topbar } from '../../components/layout/Topbar';
import { showToast } from '../../components/ui/Toast';
import { CompositeSectionInputsPanel } from './CompositeSectionInputs';
import { CompositeSectionResults } from './CompositeSectionResults';
import { CompositeSectionSVG } from './CompositeSectionSVG';

const STORAGE_KEY = 'concreta-composite-section';

function newPlate(existing: PlateEntry[]): PlateEntry {
  const maxId = existing.reduce((m, p) => {
    const n = parseInt(p.id.replace(/\D/g, ''), 10);
    return isNaN(n) ? m : Math.max(m, n);
  }, 0);
  return { id: `p${maxId + 1}`, b: 200, t: 10, posType: 'top', customYBottom: 0 };
}

function loadState(): CompositeSectionInputs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as CompositeSectionInputs;
  } catch { /* ignore */ }
  return compositeSectionDefaults;
}

export function CompositeSectionModule() {
  const { openDrawer } = useDrawer();
  const [tab, setTab] = useState<'inputs' | 'results' | 'esquema'>('inputs');

  const [inputs, setInputs] = useState<CompositeSectionInputs>(loadState);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(inputs));
  }, [inputs]);

  const addPlate = useCallback(() => {
    setInputs((prev) => {
      if (prev.plates.length >= 6) return prev;
      return { ...prev, plates: [...prev.plates, newPlate(prev.plates)] };
    });
  }, []);

  const removePlate = useCallback((id: string) => {
    setInputs((prev) => ({ ...prev, plates: prev.plates.filter((p) => p.id !== id) }));
  }, []);

  const updatePlate = useCallback(
    (id: string, field: keyof PlateEntry, val: PlateEntry[keyof PlateEntry]) => {
      setInputs((prev) => ({
        ...prev,
        plates: prev.plates.map((p) => p.id === id ? { ...p, [field]: val } : p),
      }));
    },
    [],
  );

  const setField = useCallback(
    <K extends keyof CompositeSectionInputs>(k: K, v: CompositeSectionInputs[K]) => {
      setInputs((prev) => ({ ...prev, [k]: v }));
    },
    [],
  );

  const result = useMemo(() => calcCompositeSection(inputs), [inputs]);

  const [pdfExporting, setPdfExporting] = useState(false);

  const handleExportPdf = useCallback(async () => {
    if (!result.valid) {
      showToast('Los datos de entrada no son válidos', { autoDismiss: 3000 });
      return;
    }
    setPdfExporting(true);
    try {
      await exportCompositeSectionPDF(inputs, result);
    } catch {
      showToast('Error al generar el PDF', { autoDismiss: 4000 });
    } finally {
      setPdfExporting(false);
    }
  }, [inputs, result]);

  const [canvasRef, canvasWidth] = useContainerWidth();
  const svgW = canvasWidth !== undefined && canvasWidth > 0
    ? Math.max(200, canvasWidth - 32)
    : 360;

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <Helmet>
        <title>Sección compuesta — Concreta</title>
        <meta name="description" content="Steiner, clase de sección y módulo plástico Wpl por bandas. EC3." />
      </Helmet>
      <Topbar
        moduleLabel="Sección compuesta"
        moduleGroup="Acero"
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
            <CompositeSectionInputsPanel
              state={inputs}
              addPlate={addPlate}
              removePlate={removePlate}
              updatePlate={updatePlate}
              setField={setField}
            />
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
            className="hidden md:flex justify-center border-b border-border-main canvas-dot-grid py-4 px-4 min-h-[280px] items-center"
          >
            <CompositeSectionSVG
              inp={inputs}
              result={result}
              width={Math.min(svgW, 480)}
              mode="screen"
            />
          </div>

          {/* Results */}
          <div className="px-2 py-3 pb-20 md:pb-5">
            <CompositeSectionResults result={result} />
          </div>
        </div>

        {/* Mobile: Esquema tab */}
        {tab === 'esquema' && (
          <div className="flex-1 overflow-y-auto scroll-hide canvas-dot-grid pb-20 md:hidden flex flex-col items-center py-4 px-4 gap-4">
            <CompositeSectionSVG
              inp={inputs}
              result={result}
              width={Math.min(340, 340)}
              mode="screen"
            />
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

      {/* Hidden PDF clone — off-screen, stable DOM id for svg2pdf */}
      <div className="overflow-hidden w-0 h-0" aria-hidden="true">
        <div
          id="composite-section-svg-pdf"
          style={{ position: 'absolute', left: '-9999px', top: 0, pointerEvents: 'none' }}
        >
          <CompositeSectionSVG inp={inputs} result={result} mode="pdf" width={320} />
        </div>
      </div>
    </div>
  );
}
