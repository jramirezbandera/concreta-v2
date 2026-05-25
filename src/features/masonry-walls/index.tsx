// Masonry walls — DB-SE-F multi-floor module orchestrator.
//
// State model: complex nested (plantas → huecos + puntuales) lives in a
// dedicated localStorage key, not via useModuleState (which only handles
// flat primitives). Same approach as the FEM 1D module.

import { useEffect, useMemo, useState } from 'react';
import { Topbar } from '../../components/layout/Topbar';
import { useDrawer } from '../../components/layout/AppShell';
import { MobileTabBar, type MobileTab } from '../../components/ui/MobileTabBar';
import { PdfPreviewModal } from '../../components/ui/PdfPreviewModal';
import { usePdfPreview } from '../../hooks/usePdfPreview';
import {
  blankMasonryState,
  calcularEdificio,
  defaultMasonryState,
  getCriticoEdificio,
  isBlankMasonryState,
  newId,
  normalizeMasonryState,
  overallStatus,
  plantaTemplate,
  renumberPlantas,
  type EdificioInvalid,
  type Hueco,
  type MasonryWallState,
  type PlantaResult,
  type Puntual,
} from '../../lib/calculations/masonryWalls';
import { exportMasonryWallsPDF } from '../../lib/pdf/masonryWalls';
import { useUnitSystem } from '../../lib/units/useUnitSystem';
import { showToast } from '../../components/ui/Toast';
import { buildShareUrl, decodeShareStringWithMeta } from './serialize';
import { MasonryWallsInputs } from './MasonryWallsInputs';
import { MasonryWallsResults } from './MasonryWallsResults';
import { MasonryWallsSVG } from './MasonryWallsSVG';

const STORAGE_KEY = 'concreta-masonry-walls-model';
const SCHEMA_VERSION_KEY = 'concreta-masonry-walls-model-version';
const SCHEMA_VERSION = '1';
// Persistencia del aviso "¿Quieres ver un caso de ejemplo?" — una vez aceptado
// o descartado, el globo no vuelve a aparecer (ni al recargar).
const EXAMPLE_PROMPT_DISMISSED_KEY = 'concreta-masonry-walls-example-prompt-dismissed';

interface LoadResult {
  state: MasonryWallState;
  /** True cuando se ha cargado un estado pre-feature Anejo C (sin campos
   *  customMethod / anejoC_*) y se ha normalizado al modo 'manual'. La UI
   *  enseña un toast informativo una sola vez en montaje. */
  migratedLegacy: boolean;
}

function loadState(): LoadResult {
  // Prioridad: URL > localStorage > blank. La URL gana porque alguien que
  // pega un enlace compartido espera ver ESE caso, no el suyo guardado.
  // En ausencia de URL/localStorage el módulo arranca con el caso blank
  // (una sola planta sin huecos) — el "edificio de ejemplo" se carga bajo
  // demanda vía el aviso del lienzo, no como punto de partida obligatorio.
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const encoded = params.get('model');
    if (encoded) {
      const fromUrl = decodeShareStringWithMeta(encoded);
      if (fromUrl) return fromUrl;
      // Si el query param existe pero está corrupto, lo notificamos por toast
      // (no bloqueante) y seguimos con localStorage / blank. NO usamos
      // showToast aquí (es initializer); en su lugar dejamos un marcador y
      // el useEffect lo dispara una vez.
      pendingInvalidLinkToast = true;
    }
  }
  try {
    const v = localStorage.getItem(SCHEMA_VERSION_KEY);
    if (v !== SCHEMA_VERSION) return { state: blankMasonryState(), migratedLegacy: false };
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { state: blankMasonryState(), migratedLegacy: false };
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return { state: blankMasonryState(), migratedLegacy: false };
    const arr = (parsed as { plantas?: unknown }).plantas;
    // El motor acepta n>=1. Antes restringiamos a >=2 por defecto cosmético
    // pero un muro de una sola altura es valido (edificio una planta).
    if (!Array.isArray(arr) || arr.length < 1) return { state: blankMasonryState(), migratedLegacy: false };
    return normalizeMasonryState(parsed);
  } catch {
    return { state: blankMasonryState(), migratedLegacy: false };
  }
}

// Marcadores module-scope para toast-en-mount. NO son state: queremos que se
// disparen una sola vez por carga de página, no por re-render. React Strict
// Mode dispara `useState` initializers dos veces en dev pero el useEffect
// que los consume solo corre una vez por mount.
let pendingInvalidLinkToast = false;

function saveState(s: MasonryWallState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    localStorage.setItem(SCHEMA_VERSION_KEY, SCHEMA_VERSION);
  } catch {
    // ignore quota/serialization errors
  }
}

export function MasonryWallsModule() {
  // loadState devuelve { state, migratedLegacy }. Inicializamos con un objeto
  // que captura ambos para poder disparar el toast desde useEffect (no desde
  // el initializer, que React Strict Mode invoca dos veces en dev).
  const initial = useState<LoadResult>(() => loadState())[0];
  const [state, setState] = useState<MasonryWallState>(initial.state);
  const [selectedHueco, setSelectedHueco] = useState<string | null>(null);
  const [selectedPlantaIdx, setSelectedPlantaIdx] = useState(0);
  const [selectedMachonKey, setSelectedMachonKey] = useState<string | null>(null);
  const [mostrarMapa, setMostrarMapa] = useState(true);
  // El aviso de bienvenida vive sobre el lienzo (tab='diagramas' en mobile).
  // Si el usuario abre el módulo por primera vez quedaría en 'inputs' por
  // defecto y no vería el CTA hasta cambiar de pestaña. Arrancamos en
  // 'diagramas' SOLO cuando el aviso todavía procede (blank + no dismissed).
  const initialPromptDismissed = (() => {
    try {
      return localStorage.getItem(EXAMPLE_PROMPT_DISMISSED_KEY) === '1';
    } catch {
      return false;
    }
  })();
  const initialIsBlank = isBlankMasonryState(initial.state);
  const [tab, setTab] = useState<MobileTab>(
    initialIsBlank && !initialPromptDismissed ? 'diagramas' : 'inputs',
  );
  // Aviso "¿Quieres ver un caso de ejemplo?" — solo en la primera visita al
  // módulo. Una vez aceptado o descartado, se guarda el flag y no vuelve a
  // aparecer aunque el estado vuelva a quedar en blanco. El globo nunca debe
  // interrumpir un trabajo en curso, así que arranca oculto si ya hay un
  // edificio cargado desde URL/localStorage (estado no-blank).
  const [examplePromptDismissed, setExamplePromptDismissed] = useState<boolean>(initialPromptDismissed);
  const { openDrawer } = useDrawer();
  const { system } = useUnitSystem();

  // Toasts diferidos del initializer: una sola vez por mount.
  useEffect(() => {
    if (pendingInvalidLinkToast) {
      pendingInvalidLinkToast = false;
      showToast('Enlace inválido o corrupto — cargando estado guardado', { autoDismiss: 4000 });
    }
    if (initial.migratedLegacy) {
      showToast('Caso anterior cargado como Personalizada · fk directo', { autoDismiss: 4000 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist with debounce so rapid edits don't thrash localStorage.
  useEffect(() => {
    const t = setTimeout(() => saveState(state), 300);
    return () => clearTimeout(t);
  }, [state]);

  // El aviso del ejemplo solo procede si el edificio sigue en su forma canónica
  // blank (1 planta, 0 huecos, 0 puntuales) — no queremos taparle el lienzo a
  // alguien que ya está modelando un edificio. La detección vive con
  // `blankMasonryState` en el calc engine para que ambas no diverjan.
  const showExamplePrompt = isBlankMasonryState(state) && !examplePromptDismissed;

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
      () => exportMasonryWallsPDF({ state, plantasCalc, critico, overall, invalid, system }),
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

  // Limpia los tres selectores. Lo usamos cada vez que el state cambia de
  // edificio (reset, cargar ejemplo) porque la selección anterior — hueco,
  // machón, planta no-cero — apunta a entidades que ya no existen.
  const resetSelectionState = () => {
    setSelectedHueco(null);
    setSelectedPlantaIdx(0);
    setSelectedMachonKey(null);
  };

  // Reset: vuelve al estado en blanco (1 planta, sin huecos) y limpia la
  // persistencia local. El edificio de ejemplo no se considera el "punto cero"
  // del módulo: se carga bajo demanda vía el aviso del lienzo.
  const reset = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(SCHEMA_VERSION_KEY);
    } catch {
      // ignore — quota / private mode
    }
    setState(blankMasonryState());
    resetSelectionState();
  };

  // Acepta el aviso: carga el edificio de ejemplo (4 plantas con huecos y
  // cargas puntuales) y persiste la decisión para no volver a preguntar.
  const acceptExample = () => {
    setState(defaultMasonryState());
    resetSelectionState();
    try {
      localStorage.setItem(EXAMPLE_PROMPT_DISMISSED_KEY, '1');
    } catch {
      // ignore
    }
    setExamplePromptDismissed(true);
  };

  // Descarta el aviso sin cargar el ejemplo — el usuario prefiere partir del
  // estado en blanco. En mobile, tras descartar el lienzo queda con un muro
  // vacío sin pistas; lleva al usuario directamente al panel de inputs donde
  // está el "+ Añadir planta" / "+ Hueco" para que el siguiente paso sea
  // obvio. En desktop no afecta (ambos paneles siempre visibles).
  const dismissExample = () => {
    try {
      localStorage.setItem(EXAMPLE_PROMPT_DISMISSED_KEY, '1');
    } catch {
      // ignore
    }
    setExamplePromptDismissed(true);
    setTab('inputs');
  };

  // CRUD
  const addPlanta = () => {
    setState((s) => {
      // N=1: la planta existente queda como "Planta 1" abajo, y la nueva
      // (vacía, sin huecos ni puntuales) se añade encima como "Cubierta".
      // N>=2: se inserta una nueva planta intermedia justo debajo de la
      // cubierta — la cubierta mantiene su identidad y sus cargas; el
      // renombrado lo aplica renumberPlantas tras la inserción.
      if (s.plantas.length === 0) {
        return { ...s, plantas: renumberPlantas([plantaTemplate(0, false)]) };
      }
      if (s.plantas.length === 1) {
        const nueva = plantaTemplate(1, true);
        return { ...s, plantas: renumberPlantas([...s.plantas, nueva]) };
      }
      const cubIdx = s.plantas.length - 1;
      const nueva = plantaTemplate(cubIdx, false);
      const plantas = [...s.plantas.slice(0, cubIdx), nueva, ...s.plantas.slice(cubIdx)];
      return { ...s, plantas: renumberPlantas(plantas) };
    });
  };

  const removePlanta = (idx: number) => {
    // La planta inferior (idx=0) no se puede borrar: representa siempre el
    // muro apoyado en la cimentación. El motor también acepta n=1 — la planta
    // restante se trata como "cubierta" (topmost, rho_n=1.0, e_pie=e_min).
    if (idx === 0) return;
    setState((s) => {
      if (s.plantas.length <= 1) return s;
      const plantas = s.plantas.filter((_, i) => i !== idx);
      return { ...s, plantas: renumberPlantas(plantas) };
    });
    if (selectedPlantaIdx >= idx) setSelectedPlantaIdx(Math.max(0, selectedPlantaIdx - 1));
  };

  const addHueco = (plIdx: number, tipo: 'puerta' | 'ventana') => {
    // Generamos el id fuera del setState callback para poder seleccionar el
    // nuevo hueco inmediatamente — así su panel de edición se abre solo,
    // sin obligar al usuario a clicar otra vez para empezar a editarlo.
    const nuevo: Hueco = tipo === 'puerta'
      ? { id: newId('h'), x: 200, y: 0,    w: 900, h: 2100, tipo: 'puerta'  }
      : { id: newId('h'), x: 200, y: 1000, w: 900, h: 1300, tipo: 'ventana' };
    setState((s) => ({
      ...s,
      plantas: s.plantas.map((p, i) =>
        i === plIdx ? { ...p, huecos: [...p.huecos, nuevo] } : p,
      ),
    }));
    setSelectedPlantaIdx(plIdx);
    setSelectedHueco(nuevo.id);
    setSelectedMachonKey(null);
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
        {/* Inputs (left) — patrón estándar del repo: lg:w-72 + shrink-0 fija
            el ancho en desktop. max-lg:flex-1 hace que ocupe pantalla en
            móvil cuando tab='inputs'. Scroll interno + footer fijo con el
            botón "Restablecer valores" al pie (hidden en mobile, donde el
            tab bar y el flujo de edición ya cubren ese caso). */}
        <div className={[
          'flex flex-col min-h-0 overflow-hidden bg-bg-surface',
          'lg:w-72 lg:shrink-0 lg:border-r lg:border-border-main lg:flex',
          tab === 'inputs' ? 'max-lg:flex-1' : 'max-lg:hidden',
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
          <div className="hidden lg:block px-5 py-3 border-t border-border-main shrink-0">
            <button
              type="button"
              onClick={() => {
                if (window.confirm('Restablecer todos los valores al estado inicial (Planta 1 sin huecos)? Se perderán los cambios.')) {
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
          'lg:flex-1 lg:flex',
          tab === 'diagramas' ? 'flex-1 flex' : 'hidden lg:flex',
        ].join(' ')}>
          <div className="relative flex-1 min-h-0 p-4 canvas-dot-grid">
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
            {showExamplePrompt && (
              // Banda de bienvenida sobre la parte superior del lienzo. Se
              // muestra solo cuando el edificio sigue en su forma blank
              // canónica (Planta 1 sin huecos ni puntuales) y el usuario no
              // lo ha descartado antes. Patrón coherente con el banner
              // LIMITACIONES y el banner "Cómo arreglarlo" — banda no-modal
              // dentro del flujo, sin sombras decorativas ni `rounded-lg`.
              // El lienzo es la "mesa de trabajo" (DESIGN.md): nada flota
              // sobre él sin razón funcional.
              <div
                role="region"
                aria-label="Aviso de caso de ejemplo"
                className="absolute top-4 left-4 right-4 z-10 flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center md:gap-x-3 md:gap-y-2 rounded border border-accent/40 bg-bg-surface/95 px-3 py-2"
              >
                {/* Mobile: stack vertical (label → copy → botones).
                    Desktop (md+): row con flex-wrap; label izquierda, copy
                    flexible al centro, botones a la derecha. El switch evita
                    que el copy se rompa palabra a palabra en viewports
                    estrechos. */}
                <span
                  className="text-[10px] font-mono uppercase text-accent shrink-0"
                  style={{ letterSpacing: '0.07em' }}
                >
                  Bienvenido
                </span>
                <p className="text-[12px] text-text-secondary leading-snug md:flex-1 md:min-w-0">
                  Carga un caso de ejemplo (4 plantas con huecos y cargas
                  puntuales) o parte de Planta 1 sin huecos y modela el tuyo.
                </p>
                <div className="flex gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={acceptExample}
                    className="flex-1 md:flex-none text-[11px] font-mono py-1 px-2.5 rounded cursor-pointer border border-accent text-accent bg-accent/10 hover:bg-accent/15 transition-colors"
                  >
                    Ver ejemplo
                  </button>
                  <button
                    type="button"
                    onClick={dismissExample}
                    className="flex-1 md:flex-none text-[11px] font-mono py-1 px-2.5 rounded cursor-pointer border border-border-main text-text-secondary hover:text-text-primary hover:border-text-secondary transition-colors"
                  >
                    Descartar
                  </button>
                </div>
              </div>
            )}
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

        {/* Results (right) — fija 300px en el layout de escritorio (lg+).
            Por debajo de lg el layout de tabs alterna inputs/diagramas/results. */}
        <div className={[
          'shrink-0 border-l border-border-main bg-bg-surface overflow-y-auto scroll-hide',
          'lg:w-75 lg:block',
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
            forPdf
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
