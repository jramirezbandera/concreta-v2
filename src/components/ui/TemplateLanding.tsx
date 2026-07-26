// Pantalla de arranque por plantillas de un módulo de análisis.
//
// Los dos FEM la tenían copiada al 90 %: mismo encabezado, misma rejilla de
// tarjetas, misma tarjeta punteada del asistente y misma lista de recientes —
// ~230 líneas por módulo que había que tocar DOS veces para cambiar una. Lo
// único genuinamente propio de cada uno son los croquis de las plantillas
// (una viga continua no se dibuja como una cercha Pratt), que entran como
// `sketch` de cada elemento.
//
// El identificador de plantilla viaja como `string`: cada módulo tiene su
// propia unión de literales y aquí no hay nada que decidir según cuál sea; el
// llamante recupera su tipo en el `onPick`.

import type { JSX, ReactNode } from 'react';
import { Sparkles } from 'lucide-react';

export interface TemplateLandingItem {
  id: string;
  name: string;
  description: string;
  /** Croquis de la plantilla, propio de cada módulo. */
  sketch: ReactNode;
}

export interface TemplateLandingRecent {
  /** Clave de la ENTRADA (dos recientes pueden ser la misma plantilla). */
  key: string;
  /** Plantilla que reabrir. */
  id: string;
  name: string;
  /** Epoch ms; se pinta en horario español. */
  ts: number;
}

interface Props {
  /** Migaja superior en versalitas ("Análisis · FEM 1D"). */
  eyebrow: string;
  subtitle: string;
  items: TemplateLandingItem[];
  onPick: (id: string) => void;
  /** Tarjeta punteada del asistente. Ausente ⇒ no se pinta. */
  ai?: { description: string; onStart: () => void };
  recientes: TemplateLandingRecent[];
  title?: string;
}

const CARD_BASE =
  'flex flex-col gap-2.5 rounded-md bg-bg-surface p-4 text-left text-text-secondary transition-colors hover:border-accent hover:bg-bg-elevated';
const SKETCH_BOX =
  'flex h-20 items-center justify-center rounded border border-border-sub bg-bg-primary px-2 py-2.5';

export function TemplateLanding({
  eyebrow, subtitle, items, onPick, ai, recientes, title = 'Empieza con una plantilla',
}: Props): JSX.Element {
  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <div className="canvas-dot-grid flex flex-1 flex-col overflow-y-auto px-14 py-12 max-md:px-5 max-md:py-8">
        <div className="m-auto w-full max-w-[880px]">
          <div className="mb-8">
            <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-text-disabled">{eyebrow}</p>
            <h1 className="mt-2 mb-1.5 text-[28px] font-semibold tracking-[-0.01em] text-text-primary">{title}</h1>
            <p className="max-w-[640px] text-[14px] leading-relaxed text-text-secondary">{subtitle}</p>
          </div>

          <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
            {items.map((it) => (
              <button
                key={it.id}
                type="button"
                onClick={() => onPick(it.id)}
                className={`${CARD_BASE} border border-border-main`}
              >
                <div className={SKETCH_BOX}>{it.sketch}</div>
                <div>
                  <p className="mb-0.75 text-[14px] font-semibold text-text-primary">{it.name}</p>
                  <p className="font-mono text-[11px] leading-[1.45] text-text-disabled">{it.description}</p>
                </div>
              </button>
            ))}

            {ai && (
              <button
                type="button"
                onClick={ai.onStart}
                // Punteada: no es una plantilla más, es otra forma de empezar.
                className={`${CARD_BASE} border border-dashed border-border-main`}
              >
                <div className={`${SKETCH_BOX} text-accent`}>
                  <Sparkles size={28} aria-hidden="true" />
                </div>
                <div>
                  <p className="mb-0.75 text-[14px] font-semibold text-text-primary">Descríbela con IA</p>
                  <p className="font-mono text-[11px] leading-[1.45] text-text-disabled">{ai.description}</p>
                </div>
              </button>
            )}
          </div>

          {recientes.length > 0 && (
            <div className="mt-8">
              <p className="mb-2 border-b border-border-sub pb-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.07em] text-text-disabled">
                Recientes
              </p>
              {recientes.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => onPick(r.id)}
                  className="mb-1 flex w-full items-center justify-between rounded border border-border-sub px-3 py-2 text-text-secondary transition-colors hover:border-accent max-md:min-h-11"
                >
                  <span className="flex flex-col items-start">
                    <span className="text-[13px] text-text-primary">{r.name}</span>
                    <span className="font-mono text-[10px] text-text-disabled">
                      {new Date(r.ts).toLocaleString('es-ES')}
                    </span>
                  </span>
                  <span className="font-mono text-[11px] text-accent">Abrir →</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
