// Masonry walls — DB-SE-F multi-floor module orchestrator.
//
// State model: complex nested (plantas → huecos + puntuales) lives in a
// dedicated localStorage key, not via useModuleState (which only handles
// flat primitives). Same approach as the FEM 2D module.

import { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Topbar } from '../../components/layout/Topbar';
import { useDrawer } from '../../components/layout/AppShell';
import { MobileTabBar, type MobileTab } from '../../components/ui/MobileTabBar';
import { PdfPreviewModal } from '../../components/ui/PdfPreviewModal';
import { usePdfPreview } from '../../hooks/usePdfPreview';
import {
  calcularEdificio,
  defaultMasonryState,
  getCriticoEdificio,
  newId,
  overallStatus,
  plantaTemplate,
  type EdificioInvalid,
  type Hueco,
  type MasonryWallState,
  type PlantaResult,
  type Puntual,
} from '../../lib/calculations/masonryWalls';
import { exportMasonryWallsPDF } from '../../lib/pdf/masonryWalls';
import { showToast } from '../../components/ui/Toast';
import { buildShareUrl, decodeShareString } from './serialize';
import { MasonryWallsInputs } from './MasonryWallsInputs';
import { MasonryWallsResults } from './MasonryWallsResults';
import { MasonryWallsSVG } from './MasonryWallsSVG';

const STORAGE_KEY = 'concreta-masonry-walls-model';
const SCHEMA_VERSION_KEY = 'concreta-masonry-walls-model-version';
const SCHEMA_VERSION = '1';

function loadState(): MasonryWallState {
  // Prioridad: URL > localStorage > default. La URL gana porque alguien que
  // pega un enlace compartido espera ver ESE caso, no el suyo guardado.
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const encoded = params.get('model');
    if (encoded) {
      const fromUrl = decodeShareString(encoded);
      if (fromUrl) return fromUrl;
      // Si el query param existe pero está corrupto, lo notificamos por toast
      // (no bloqueante) y seguimos con localStorage / default.
      showToast('Enlace inválido o corrupto — cargando estado guardado', { autoDismiss: 4000 });
    }
  }
  try {
    const v = localStorage.getItem(SCHEMA_VERSION_KEY);
    if (v !== SCHEMA_VERSION) return defaultMasonryState();
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultMasonryState();
    const parsed = JSON.parse(raw) as MasonryWallState;
    // sanity check
    if (!parsed.plantas || parsed.plantas.length < 2) return defaultMasonryState();
    return parsed;
  } catch {
    return defaultMasonryState();
  }
}

function saveState(s: MasonryWallState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    localStorage.setItem(SCHEMA_VERSION_KEY, SCHEMA_VERSION);
  } catch {
    // ignore quota/serialization errors
  }
}

export function MasonryWallsModule() {
  const [state, setState] = useState<MasonryWallState>(() => loadState());
  const [selectedHueco, setSelectedHueco] = useState<string | null>(null);
  const [selectedPlantaIdx, setSelectedPlantaIdx] = useState(0);
  const [selectedMachonKey, setSelectedMachonKey] = useState<string | null>(null);
  const [mostrarMapa, setMostrarMapa] = useState(true);
  const [tab, setTab] = useState<MobileTab>('inputs');
  const { openDrawer } = useDrawer();

  // Persist with debounce so rapid edits don't thrash localStorage.
  useEffect(() => {
    const t = setTimeout(() => saveState(state), 300);
    return () => clearTimeout(t);
  }, [state]);

  // Motor devuelve discriminated union {invalid, reason} | {plantas[]}.
  // Cuando la entrada es degenerada (combinación Tabla 4.4 inviable, t=0,
  // L=0, etc.) la UI muestra un banner en lugar de números sin sentido.
  const edificioResult = useMemo(() => calcularEdificio(state), [state]);
  const invalid: EdificioInvalid | null = edificioResult.invalid ? edificioResult : null;
  const plantasCalc: PlantaResult[] = edificioResult.invalid ? [] : edificioResult.plantas;
  const overall = useMemo(() => overallStatus(plantasCalc), [plantasCalc]);
  const critico = useMemo(() => getCriticoEdificio(plantasCalc), [plantasCalc]);

  // PDF export — invalid disables the button (toast en su lugar).
  const { pdfExporting, pdfPreview, handleExportPdf, handleDownloadPdf, closePdfPreview } =
    usePdfPreview(
      () => exportMasonryWallsPDF({ state, plantasCalc, critico, overall, invalid }),
      !invalid,
    );

  // Compartir enlace: serializa el state actual + lz-string + base64 y lo
  // copia al portapapeles. El receptor pega el enlace y carga el mismo caso.
  // Sobreescribe el handler por defecto del Topbar (que copiaría la URL
  // pelada sin el modelo).
  const handleCopyLink = () => {
    try {
      const url = buildShareUrl(state);
      navigator.clipboard.writeText(url).then(() => {
        showToast('Enlace copiado — el destinatario verá este edificio', { autoDismiss: 2500 });
      }).catch(() => {
        showToast('No se pudo copiar el enlace al portapapeles', { autoDismiss: 3500 });
      });
    } catch {
      showToast('Error al generar el enlace', { autoDismiss: 3500 });
    }
  };

  // Reset: vuelve al edificio de ejemplo y limpia la persistencia local. Útil
  // cuando el state queda corrupto o el usuario quiere descartar todo.
  const reset = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(SCHEMA_VERSION_KEY);
    } catch {
      // ignore — quota / private mode
    }
    setState(defaultMasonryState());
    setSelectedHueco(null);
    setSelectedPlantaIdx(0);
    setSelectedMachonKey(null);
  };

  // CRUD
  const addPlanta = () => {
    setState((s) => {
      const idx = s.plantas.length - 1; // insert before cubierta
      const nueva = plantaTemplate(idx, false);
      nueva.nombre = `Planta ${idx}`;
      return { ...s, plantas: [...s.plantas.slice(0, idx), nueva, ...s.plantas.slice(idx)] };
    });
  };

  const removePlanta = (idx: number) => {
    setState((s) => {
      if (s.plantas.length <= 2) return s; // mantener PB + cubierta
      return { ...s, plantas: s.plantas.filter((_, i) => i !== idx) };
    });
    if (selectedPlantaIdx >= idx) setSelectedPlantaIdx(Math.max(0, selectedPlantaIdx - 1));
  };

  const addHueco = (plIdx: number, tipo: 'puerta' | 'ventana') => {
    setState((s) => ({
      ...s,
      plantas: s.plantas.map((p, i) => {
        if (i !== plIdx) return p;
        const nuevo: Hueco = tipo === 'puerta'
          ? { id: newId('h'), x: 200, y: 0,    w: 900, h: 2050, tipo: 'puerta'  }
          : { id: newId('h'), x: 200, y: 1000, w: 900, h: 1300, tipo: 'ventana' };
        return { ...p, huecos: [...p.huecos, nuevo] };
      }),
    }));
  };

  const removeHueco = (plIdx: number, id: string) => {
    setState((s) => ({
      ...s,
      plantas: s.plantas.map((p, i) =>
        i === plIdx ? { ...p, huecos: p.huecos.filter((h) => h.id !== id) } : p,
      ),
    }));
    if (selectedHueco === id) setSelectedHueco(null);
  };

  const addPuntual = (plIdx: number) => {
    const nuevo: Puntual = { id: newId('p'), x: 1000, P_G: 15, P_Q: 5, b_apoyo: 250 };
    setState((s) => ({
      ...s,
      plantas: s.plantas.map((p, i) =>
        i === plIdx ? { ...p, puntuales: [...p.puntuales, nuevo] } : p,
      ),
    }));
  };

  const removePuntual = (plIdx: number, id: string) => {
    setState((s) => ({
      ...s,
      plantas: s.plantas.map((p, i) =>
        i === plIdx ? { ...p, puntuales: p.puntuales.filter((q) => q.id !== id) } : p,
      ),
    }));
  };

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <Helmet>
        <title>Muros de fábrica — Concreta · DB-SE-F</title>
        <meta name="description" content="Verificación de muros de carga de fábrica multi-planta · DB-SE-F." />
      </Helmet>
      <Topbar
        moduleLabel="Muros de fábrica"
        moduleGroup="Rehabilitación"
        onExportPdf={handleExportPdf}
        pdfExporting={pdfExporting}
        onMenuOpen={openDrawer}
        onCopyLink={handleCopyLink}
      />
      <MobileTabBar tab={tab} setTab={setTab} />

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Inputs (left) — patrón estándar del repo: md:w-72 + shrink-0 fija
            el ancho en desktop. max-md:flex-1 hace que ocupe pantalla en
            móvil cuando tab='inputs'. Scroll interno + footer fijo con el
            botón "Restablecer valores" al pie (hidden en mobile, donde el
            tab bar y el flujo de edición ya cubren ese caso). */}
        <div className={[
          'flex flex-col min-h-0 overflow-hidden bg-bg-surface',
          'md:w-72 md:shrink-0 md:border-r md:border-border-main md:flex',
          tab === 'inputs' ? 'max-md:flex-1' : 'max-md:hidden',
        ].join(' ')}>
          <div className="flex-1 overflow-y-auto overflow-x-hidden scroll-hide">
            <MasonryWallsInputs
              state={state}
              setState={setState}
              selectedPlantaIdx={selectedPlantaIdx}
              selectedHueco={selectedHueco}
              setSelectedHueco={setSelectedHueco}
              setSelectedPlantaIdx={setSelectedPlantaIdx}
              plantasCalc={plantasCalc}
              onAddPlanta={addPlanta}
              onRemovePlanta={removePlanta}
              onAddHueco={addHueco}
              onRemoveHueco={removeHueco}
              onAddPuntual={addPuntual}
              onRemovePuntual={removePuntual}
            />
          </div>
          <div className="hidden md:block px-4 py-2.5 border-t border-border-main shrink-0">
            <button
              type="button"
              onClick={() => {
                if (window.confirm('Restablecer todos los valores al edificio de ejemplo? Se perderán los cambios.')) {
                  reset();
                }
              }}
              className="text-[11px] text-text-disabled hover:text-text-secondary transition-colors cursor-pointer"
            >
              Restablecer valores
            </button>
          </div>
        </div>

        {/* Center canvas — desktop always; mobile when tab='diagramas' */}
        <div className={[
          'min-w-0 flex flex-col overflow-hidden',
          'md:flex-1 md:flex',
          tab === 'diagramas' ? 'flex-1 flex' : 'hidden md:flex',
        ].join(' ')}>
          <div className="flex-1 min-h-0 p-4 canvas-dot-grid">
            <MasonryWallsSVG
              state={state}
              plantasCalc={plantasCalc}
              critico={critico}
              mostrarMapa={mostrarMapa}
              selectedHueco={selectedHueco}
              selectedPlantaIdx={selectedPlantaIdx}
              selectedMachonKey={selectedMachonKey}
              onSelectHueco={(id, plIdx) => {
                setSelectedHueco(id === selectedHueco ? null : id);
                setSelectedPlantaIdx(plIdx);
                setSelectedMachonKey(null);
              }}
              onSelectMachon={(plIdx, mid) => {
                const k = `${plIdx}|${mid}`;
                setSelectedMachonKey(k === selectedMachonKey ? null : k);
                setSelectedPlantaIdx(plIdx);
                setSelectedHueco(null);
              }}
              onSelectPlanta={(i) => {
                setSelectedPlantaIdx(i);
                setSelectedHueco(null);
                setSelectedMachonKey(null);
              }}
            />
          </div>

          {/* Legend / mapa toggle */}
          <div className="px-6 py-2 flex items-center gap-4 text-[11px] font-mono text-text-disabled border-t border-border-main bg-bg-surface flex-wrap">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-sm" style={{ background: 'rgba(34,197,94,0.4)' }} />η&lt;80%
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-sm" style={{ background: 'rgba(245,158,11,0.5)' }} />80–99%
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-sm" style={{ background: 'rgba(239,68,68,0.5)' }} />η≥100%
            </span>
            <span className="ml-auto hidden lg:inline">Click en planta, hueco o machón para seleccionar</span>
            <button
              type="button"
              onClick={() => setMostrarMapa(!mostrarMapa)}
              className="px-2.5 py-1 rounded font-mono text-[11px] font-semibold transition-colors cursor-pointer border"
              style={{
                background: mostrarMapa ? 'rgba(56,189,248,0.18)' : 'transparent',
                borderColor: mostrarMapa ? 'var(--color-accent)' : 'var(--color-text-disabled)',
                color: mostrarMapa ? '#7dd3fc' : 'var(--color-text-secondary)',
                letterSpacing: '0.04em',
              }}
            >
              {mostrarMapa ? '● Mapa σ' : '○ Mapa σ'}
            </button>
          </div>
        </div>

        {/* Results (right) — desktop visible desde md (250px en tablet, 300px
            en lg+) para que iPad portrait/landscape pueda ver el veredicto.
            Mobile <md alterna por tab. */}
        <div className={[
          'shrink-0 border-l border-border-main bg-bg-surface overflow-y-auto scroll-hide',
          'md:w-[250px] md:block lg:w-[300px]',
          tab === 'results' ? 'flex-1' : 'hidden',
        ].join(' ')}>
          <MasonryWallsResults
            state={state}
            plantasCalc={plantasCalc}
            critico={critico}
            overall={overall}
            invalid={invalid}
            selectedMachonKey={selectedMachonKey}
            setSelectedMachonKey={setSelectedMachonKey}
          />
        </div>
      </div>

      {/* Hidden SVG for PDF export — fixed dimensions, offscreen. The PDF
          generator queries this DOM node via id and rasterizes via svg2pdf. */}
      <div className="overflow-hidden w-0 h-0" aria-hidden="true">
        <div
          id="masonry-walls-svg-pdf"
          style={{ position: 'absolute', left: '-9999px', top: 0, pointerEvents: 'none' }}
        >
          <MasonryWallsSVG
            state={state}
            plantasCalc={plantasCalc}
            critico={critico}
            mostrarMapa
            selectedHueco={null}
            selectedPlantaIdx={-1}
            selectedMachonKey={null}
            onSelectHueco={() => undefined}
            onSelectPlanta={() => undefined}
            onSelectMachon={() => undefined}
            forceWidth={760}
            forceHeight={1020}
          />
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
