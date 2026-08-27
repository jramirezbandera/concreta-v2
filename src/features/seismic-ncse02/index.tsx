// Sismo NCSE-02 — orquestador del módulo.
//
// El estado es anidado (plantas → componentes de carga, direcciones → planos
// resistentes), así que NO usa `useModuleState`, que sólo maneja primitivos
// planos. Mismo enfoque que muros de fábrica y que el módulo de pórticos:
// clave propia en localStorage y estado manejado a mano.

import { useEffect, useMemo, useState } from 'react';
import { Topbar } from '../../components/layout/Topbar';
import { useDrawer } from '../../components/layout/AppShell';
import { MobileTabBar, type MobileTab } from '../../components/ui/MobileTabBar';
import { AiChatModal } from '../../components/ai/AiChatModal';
import { PdfPreviewModal } from '../../components/ui/PdfPreviewModal';
import { TitlePromptModal } from '../../components/ui/TitlePromptModal';
import { showToast } from '../../components/ui/Toast';
import { useContainerWidth } from '../../hooks/useContainerWidth';
import { useDocTitle } from '../../hooks/useDocTitle';
import { useTitledPdfExport } from '../../hooks/useTitledPdfExport';
import {
  aplicarPlanSismo,
  seismicNCSE02Adapter,
  summarizeSeismicResults,
} from '../../lib/ai/modules/seismicNCSE02';
import type { AiApplyPlan } from '../../lib/ai/modules/types';
import {
  exportSeismicNCSE02PDF,
  seismicNCSE02FallbackFilename,
  seismicPdfBlocker,
} from '../../lib/pdf/seismicNCSE02';
import { municipioPorIne } from './hazard';
import { buildShareUrl, decodeShareString } from './serialize';
import { SeismicInputs } from './SeismicInputs';
import { SeismicResults } from './SeismicResults';
import { AlzadoSVG, EspectroSVG } from './SeismicSVG';
import {
  defaultSeismicState,
  evaluarSismo,
  normalizeSeismicState,
  type SeismicState,
} from './state';

const STORAGE_KEY = 'concreta-seismic-ncse02-model';
const SCHEMA_VERSION_KEY = 'concreta-seismic-ncse02-model-version';
const SCHEMA_VERSION = '1';

/**
 * Lo que hay que hacer al abrir el módulo, resuelto de una vez.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ESTO NO PUEDE VIAJAR EN UNA VARIABLE DE MÓDULO
 * ─────────────────────────────────────────────────────────────────────────────
 * La versión anterior devolvía sólo el estado y dejaba los encargos —«avisa del
 * enlace corrupto»— en un `let` de módulo que el initializer de `useState`
 * escribía y un efecto leía. Con el compilador de React (activo en este repo,
 * `reactCompilerPreset`) esa comunicación NO se sostiene: el efecto llegaba a
 * leer la variable ANTES de que el initializer la escribiese, y se quedaba sin
 * nada que hacer. Falla en silencio y sólo en el bundle compilado.
 *
 * Ahora los encargos son parte del valor inicial y viajan por React.
 */
interface CasoInicial {
  estado: SeismicState;
  /** El enlace traía algo que no era un caso de sismo. */
  corrupto: boolean;
  /** Municipio del enlace, para refrescar ab y K contra la tabla instalada. */
  municipio: { ine: string; ab: number; K: number } | null;
}

function cargar(): CasoInicial {
  // Prioridad: URL > localStorage > caso por defecto. La URL gana porque quien
  // pega un enlace compartido espera ver ESE caso, no el suyo guardado.
  if (typeof window !== 'undefined') {
    const codificado = new URLSearchParams(window.location.search).get('model');
    if (codificado) {
      const deUrl = decodeShareString(codificado);
      if (deUrl) {
        return {
          estado: deUrl,
          corrupto: false,
          municipio: deUrl.municipioIne
            ? { ine: deUrl.municipioIne, ab: deUrl.ab, K: deUrl.K }
            : null,
        };
      }
      return { estado: guardado(), corrupto: true, municipio: null };
    }
  }
  return { estado: guardado(), corrupto: false, municipio: null };
}

function guardado(): SeismicState {
  try {
    if (localStorage.getItem(SCHEMA_VERSION_KEY) !== SCHEMA_VERSION) return defaultSeismicState();
    const bruto = localStorage.getItem(STORAGE_KEY);
    if (!bruto) return defaultSeismicState();
    return normalizeSeismicState(JSON.parse(bruto));
  } catch {
    return defaultSeismicState();
  }
}

export function SeismicNCSE02Module() {
  const { openDrawer } = useDrawer();
  const [inicial] = useState(cargar);
  const [state, setState] = useState<SeismicState>(inicial.estado);
  const [tab, setTab] = useState<MobileTab>('inputs');
  const [ejeDibujo, setEjeDibujo] = useState<'x' | 'y'>('x');

  // Nombre del elemento para el PDF. Vive FUERA del estado del edificio: si
  // estuviera dentro, teclearlo recalcularía la evaluación en cada pulsación y
  // contaminaría el hash de procedencia que va impreso en el documento.
  const [docTitle, setDocTitle] = useDocTitle('concreta-seismic-title');

  useEffect(() => {
    if (!inicial.corrupto) return;
    showToast('El enlace no traía un caso de sismo válido: se ha abierto el guardado.', {
      autoDismiss: 5000,
    });
  }, [inicial]);

  // ── El `?model=` se retira en cuanto se ha leído ────────────────────────────
  // Mismo patrón que muros de fábrica y taludes. Sin esto la URL seguía ahí, y
  // como la carga da prioridad a la URL sobre lo guardado, recargar la página
  // volvía a hidratar desde ella: quien abría un enlace, editaba y pulsaba F5
  // perdía sus cambios en silencio —y el autoguardado, que escribe en cada
  // cambio, ya los había machacado en localStorage—.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has('model')) return;
    url.searchParams.delete('model');
    window.history.replaceState(window.history.state, '', url.toString());
  }, []);

  // ── ab y K del enlace, refrescados contra la tabla instalada ────────────────
  // `serialize.ts` lo dice desde el primer día: el enlace manda el municipio por
  // su código INE y `ab`/`K` sólo de copia, porque "el enlace identifica un
  // edificio en un sitio, no una foto de la peligrosidad de aquel día"; al
  // abrirlo, la UI los refresca. La promesa estaba en el comentario y no en el
  // código, así que un enlace con la copia vieja —o manipulada— se pintaba y se
  // IMPRIMÍA rotulado «Anejo 1» con valores que el Anejo 1 no dice.
  useEffect(() => {
    const entrante = inicial.municipio;
    if (!entrante) return;
    void municipioPorIne(entrante.ine).then((m) => {
      // El código INE no está en la tabla instalada: puede ser un enlace hecho
      // con una versión más reciente del suplemento. Los números se conservan,
      // pero dejan de atribuirse al Anejo 1, que es lo único que no se puede
      // sostener.
      if (!m) {
        setState((s) =>
          s.municipioIne === entrante.ine
            ? { ...s, municipioIne: null, municipioProcedencia: null }
            : s,
        );
        showToast(
          `El municipio del enlace (INE ${entrante.ine}) no figura en el Anejo 1 instalado: `
            + 'ab y K quedan como entrada manual.',
          { autoDismiss: 6000 },
        );
        return;
      }
      if (m.ab === entrante.ab && m.k === entrante.K) return;
      setState((s) =>
        s.municipioIne === entrante.ine
          ? {
              ...s,
              municipioNombre: m.nombre,
              municipioProcedencia: m.procedencia,
              ab: m.ab,
              K: m.k,
            }
          : s,
      );
      showToast(
        `${m.nombre}: ab y K del enlace actualizados contra el Anejo 1 instalado `
          + `(ab ${m.ab.toFixed(2)} g · K ${m.k.toFixed(1)}).`,
        { autoDismiss: 6000 },
      );
    });
  }, [inicial]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      localStorage.setItem(SCHEMA_VERSION_KEY, SCHEMA_VERSION);
    } catch {
      // Cuota llena o almacenamiento bloqueado: el módulo sigue funcionando en
      // memoria, y perder el autoguardado no justifica romper el cálculo.
    }
  }, [state]);

  const evaluacion = useMemo(() => evaluarSismo(state), [state]);

  // El botón NO se deshabilita por «no hay resultado»: un caso exento produce
  // un documento completo y valioso —la justificación de que la Norma no rige—
  // y negárselo al usuario sería el error opuesto al que se quiere evitar. Sólo
  // se bloquea con la puerta SIN resolver, y `seismicPdfBlocker` es la única
  // regla: el mismo texto que avisa es el que decide.
  const bloqueoPdf = seismicPdfBlocker(evaluacion);
  const {
    pdfExporting,
    pdfPreview,
    handleDownloadPdf,
    closePdfPreview,
    titleOpen,
    openExport,
    confirmTitle,
    closeTitle,
  } = useTitledPdfExport({
    exportFn: (title) => exportSeismicNCSE02PDF({ state, evaluacion, title }),
    valid: !bloqueoPdf,
    onTitleChange: setDocTitle,
    ...(bloqueoPdf ? { invalidMessage: bloqueoPdf } : {}),
  });

  // ── Asistente ──────────────────────────────────────────────────────────────
  // Las plantas, los estratos y los planos resistentes viajan de solo lectura y
  // el plan nunca los toca. Las direcciones sí llegan enteras —L y B viven
  // dentro de ellas—, y por eso el estado vivo se mezcla en `aplicarPlanSismo`
  // en vez de a spread: la copia que trae el plan quedó congelada al proponerlo.
  const [aiOpen, setAiOpen] = useState(false);
  const aiResults = useMemo(() => summarizeSeismicResults(evaluacion), [evaluacion]);

  const handleAiApply = (plan: AiApplyPlan<SeismicState>) => {
    setState((s) => aplicarPlanSismo(s, plan.fields));
    const n = plan.changes.length;
    const w = plan.warnings.length;
    showToast(
      `IA: ${n} campo${n === 1 ? '' : 's'} aplicado${n === 1 ? '' : 's'}`
        + (w > 0 ? ` · ${w} aviso${w === 1 ? '' : 's'}` : ''),
      { autoDismiss: 4000 },
    );
  };

  const [lienzoRef, anchoLienzo] = useContainerWidth();
  const anchoSvg = anchoLienzo && anchoLienzo > 0 ? Math.max(220, Math.min(520, anchoLienzo - 32)) : 360;

  const copiarEnlace = async () => {
    try {
      await navigator.clipboard.writeText(buildShareUrl(state));
      showToast('Enlace copiado', { autoDismiss: 2500 });
    } catch {
      showToast('No se ha podido copiar el enlace', { autoDismiss: 3000 });
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <Topbar
        moduleLabel="Acción sísmica"
        moduleGroup="NCSE-02"
        onMenuOpen={openDrawer}
        onCopyLink={copiarEnlace}
        onExportPdf={openExport}
        pdfExporting={pdfExporting}
        onOpenAssistant={() => setAiOpen(true)}
      />
      <MobileTabBar tab={tab} setTab={setTab} />

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Entrada */}
        <div
          className={[
            'flex flex-col min-h-0 overflow-hidden bg-bg-surface',
            'lg:w-72 lg:shrink-0 lg:border-r lg:border-border-main',
            tab === 'inputs' ? 'max-lg:flex-1' : 'max-lg:hidden',
            'lg:flex',
          ].join(' ')}
        >
          <div className="flex-1 overflow-y-auto scroll-hide px-4 py-4">
            <SeismicInputs state={state} setState={setState} evaluacion={evaluacion} />
          </div>
          <div className="hidden lg:block px-5 py-3 border-t border-border-main shrink-0">
            <button
              onClick={() => setState(defaultSeismicState())}
              className="text-[11px] text-text-disabled hover:text-text-secondary transition-colors"
              type="button"
            >
              Restablecer valores
            </button>
          </div>
        </div>

        {/* Dibujos + resultados */}
        <div
          className={[
            'min-w-0 overflow-y-auto scroll-hide',
            'lg:flex-1',
            tab === 'results' ? 'flex-1' : 'hidden',
            'lg:block',
          ].join(' ')}
        >
          <div ref={lienzoRef} className="px-4 py-4 space-y-4">
            <div className="flex flex-wrap gap-4 items-start">
              {/* El selector de eje manda sobre los DOS dibujos: los modos que
                  se marcan sobre el espectro son los de esa misma direccion. */}
              <EspectroSVG evaluacion={evaluacion} width={anchoSvg} eje={ejeDibujo} />
              {evaluacion.resultado ? (
                <div>
                  <div className="flex gap-1 pb-1">
                    {(['x', 'y'] as const).map((e) => (
                      <button
                        key={e}
                        type="button"
                        onClick={() => setEjeDibujo(e)}
                        aria-pressed={ejeDibujo === e}
                        aria-label={`Dibujar la dirección ${e.toUpperCase()}`}
                        className={[
                          'px-2 py-0.5 text-[11px] rounded border transition-colors cursor-pointer',
                          ejeDibujo === e
                            ? 'border-accent text-text-primary'
                            : 'border-border-main text-text-disabled hover:border-accent/40',
                        ].join(' ')}
                      >
                        {e.toUpperCase()}
                      </button>
                    ))}
                  </div>
                  <AlzadoSVG evaluacion={evaluacion} eje={ejeDibujo} width={anchoSvg} />
                </div>
              ) : null}
            </div>

            <SeismicResults state={state} evaluacion={evaluacion} />
          </div>
        </div>
      </div>

      {/*
        Clones fuera de pantalla para el PDF. Van con medidas FIJAS y no con el
        ancho del contenedor: la figura del documento tiene que salir igual en
        un portátil y en un monitor de 32", y el exportador las busca por id.
        `AlzadoSVG` devuelve null sin resultado — el caso exento simplemente no
        lleva figuras, y el exportador lo tolera.
      */}
      <div className="overflow-hidden w-0 h-0" aria-hidden="true">
        <div id="seismic-espectro-svg-pdf" style={{ position: 'absolute', left: '-9999px', top: 0 }}>
          <EspectroSVG evaluacion={evaluacion} width={680} />
        </div>
        <div id="seismic-alzado-x-svg-pdf" style={{ position: 'absolute', left: '-9999px', top: 0 }}>
          <AlzadoSVG evaluacion={evaluacion} eje="x" width={520} />
        </div>
        <div id="seismic-alzado-y-svg-pdf" style={{ position: 'absolute', left: '-9999px', top: 0 }}>
          <AlzadoSVG evaluacion={evaluacion} eje="y" width={520} />
        </div>
      </div>

      {aiOpen && (
        <AiChatModal
          adapter={seismicNCSE02Adapter}
          current={state}
          results={aiResults}
          onApply={handleAiApply}
          onClose={() => setAiOpen(false)}
        />
      )}

      {titleOpen && (
        <TitlePromptModal
          initialTitle={docTitle}
          fallbackFilename={seismicNCSE02FallbackFilename(state)}
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
