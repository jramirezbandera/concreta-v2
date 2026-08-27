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
import { showToast } from '../../components/ui/Toast';
import { useContainerWidth } from '../../hooks/useContainerWidth';
import { useDocTitle } from '../../hooks/useDocTitle';
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

/** Marcador para avisar del enlace corrupto: `showToast` no puede correr en el initializer. */
let enlaceCorrupto = false;

function cargar(): SeismicState {
  // Prioridad: URL > localStorage > caso por defecto. La URL gana porque quien
  // pega un enlace compartido espera ver ESE caso, no el suyo guardado.
  if (typeof window !== 'undefined') {
    const codificado = new URLSearchParams(window.location.search).get('model');
    if (codificado) {
      const deUrl = decodeShareString(codificado);
      if (deUrl) return deUrl;
      enlaceCorrupto = true;
    }
  }
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
  const [state, setState] = useState<SeismicState>(cargar);
  const [tab, setTab] = useState<MobileTab>('inputs');
  const [ejeDibujo, setEjeDibujo] = useState<'x' | 'y'>('x');

  useDocTitle('Acción sísmica NCSE-02');

  useEffect(() => {
    if (!enlaceCorrupto) return;
    enlaceCorrupto = false;
    showToast('El enlace no traía un caso de sismo válido: se ha abierto el guardado.', {
      autoDismiss: 5000,
    });
  }, []);

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
              <EspectroSVG evaluacion={evaluacion} width={anchoSvg} />
              {evaluacion.resultado ? (
                <div>
                  <div className="flex gap-1 pb-1">
                    {(['x', 'y'] as const).map((e) => (
                      <button
                        key={e}
                        type="button"
                        onClick={() => setEjeDibujo(e)}
                        aria-pressed={ejeDibujo === e}
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
    </div>
  );
}
