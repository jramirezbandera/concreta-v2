// Panel de resultados del módulo de estabilidad de taludes (Geotecnia).
//
// ÚNICO en la app: NO recalcula en vivo. El motor cruza al worker de Pyodide
// (PySlope) y cuesta cientos de ms–s, por eso hay un botón "Calcular" explícito
// y una máquina de estados (design-review §10.1 D2, §10.3). El botón y los
// estados son las superficies novedosas; el resto reutiliza el sistema de checks
// compartido (verdict ambiental, CheckRowItem, VerdictBadge) como cualquier otro
// módulo.
//
// Mapa estado del solver → UI:
//   idle      → hint "Pulsa Calcular…" (o resultado previo si lo hubiera)
//   loading   → spinner "Cargando motor geotécnico…" + Cancelar
//   computing → spinner "Calculando… Bishop · N dovelas" + Cancelar
//   ready     → verdict ambiental + FoS destacado + checks + traza motor
//   error     → bloque de error con solver.error + Reintentar
// `isStale` (derivado, no es estado del motor) → badge "Resultados desactualizados".

import type { JSX } from 'react';
import { Loader2, Check, TriangleAlert, X } from 'lucide-react';
import {
  CheckRowItem, VerdictBadge,
  overallStatus, ambientStyle,
} from '../../components/checks';
import { HelpTooltip } from '../../components/ui/HelpTooltip';
import type { SlopeSolver } from './useSlopeSolver';
import type { SlopeInputs } from '../../data/defaults';

interface SlopeResultsProps {
  solver: SlopeSolver;
  /** Situación de proyecto — fija el límite de FoS y su etiqueta. */
  situation: SlopeInputs['situation'];
}

// Límite de factor de seguridad por situación — CTE DB-SE-C art. 7.2.2.1 (γR):
// persistente y transitoria 1,5; extraordinaria 1,1 (doc §4.2).
const FOS_LIMIT: Record<SlopeInputs['situation'], number> = {
  persistent:    1.5,
  transient:     1.5,
  extraordinary: 1.1,
};

const SITUATION_LABEL: Record<SlopeInputs['situation'], string> = {
  persistent:    'persistente',
  transient:     'transitoria',
  extraordinary: 'extraordinaria',
};

// Texto largo del disclaimer — compartido conceptualmente con el PDF (design-review D4).
const DISCLAIMER_FULL =
  'Método Bishop simplificado (superficie circular). Sin métodos no-circulares ni ' +
  'Spencer/Janbu. Predimensionamiento — no sustituye un estudio geotécnico.';

export function SlopeResults({ solver, situation }: SlopeResultsProps): JSX.Element {
  const { engineState, result, error, isStale, calculate, cancel } = solver;

  const isBusy = engineState === 'loading' || engineState === 'computing';
  const limit = FOS_LIMIT[situation];

  // Región aria-live: un único string que resume el estado del motor.
  let liveMessage = '';
  if (engineState === 'loading') liveMessage = 'Cargando motor geotécnico…';
  else if (engineState === 'computing') liveMessage = 'Calculando factor de seguridad…';
  else if (engineState === 'error') liveMessage = `Error de cálculo: ${error ?? ''}`;
  else if (result) {
    liveMessage = isStale
      ? `Resultados desactualizados. Último FoS ${result.fos.toFixed(2)}.`
      : `Cálculo listo. Factor de seguridad ${result.fos.toFixed(2)}.`;
  }

  return (
    <div className="flex flex-col px-2 py-3 gap-3">

      {/* ── Cabecera: botón Calcular (full width) + estado ───────────────── */}
      <div className="flex flex-col gap-2 px-2">
        <button
          type="button"
          onClick={calculate}
          disabled={isBusy}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded bg-btn-primary-bg text-btn-primary-fg text-[13px] font-semibold tracking-[0.01em] hover:bg-btn-primary-bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60 disabled:cursor-progress transition-colors"
        >
          {isBusy ? (
            <>
              <Loader2 size={15} className="animate-spin" aria-hidden="true" />
              {engineState === 'loading'
                ? 'Cargando motor geotécnico…'
                : `Calculando… Bishop · ${result?.run.slicesN ?? ''} dovelas`}
            </>
          ) : (
            'Calcular'
          )}
        </button>

        {/* Cancelar — solo durante una corrida en curso. */}
        {isBusy && (
          <button
            type="button"
            onClick={cancel}
            className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-1.5 rounded border border-border-main text-[12px] text-text-secondary hover:text-text-primary hover:border-accent/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent transition-colors"
          >
            <X size={13} aria-hidden="true" />
            Cancelar
          </button>
        )}

        {/* Badge de obsolescencia — inputs cambiados desde la última corrida. */}
        {isStale && !isBusy && (
          <span className="inline-flex items-center gap-1.5 self-start font-mono text-[10px] font-semibold px-1.75 py-0.5 rounded tracking-[0.05em] bg-state-warn/10 text-state-warn">
            <TriangleAlert size={11} aria-hidden="true" />
            Resultados desactualizados
          </span>
        )}
      </div>

      {/* ── Región aria-live (anuncio del estado del motor) ──────────────── */}
      <div className="sr-only" aria-live="polite" role="status">
        {liveMessage}
      </div>

      {/* ── Pre-cálculo: sin resultado y sin corrida en curso ────────────── */}
      {result === null && engineState !== 'error' && !isBusy && (
        <div className="mx-2 rounded border border-accent/30 bg-accent/5 px-4 py-3">
          <p className="text-[12px] text-accent leading-relaxed">
            Pulsa <span className="font-semibold">Calcular</span> para el factor de seguridad.
          </p>
        </div>
      )}

      {/* ── Error: motor falló (carga o cálculo) ─────────────────────────── */}
      {engineState === 'error' && (
        <div className="mx-2 rounded border border-state-fail/40 bg-state-fail/5 px-4 py-3 flex flex-col gap-2">
          <p className="text-[12px] text-state-fail leading-relaxed">
            <span className="font-semibold">Error de cálculo.</span>{' '}
            {error ?? 'No se pudo completar la corrida.'}
          </p>
          <button
            type="button"
            onClick={calculate}
            className="self-start inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-state-fail/40 text-[12px] text-state-fail hover:bg-state-fail/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent transition-colors"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* ── Resultado: verdict ambiental + FoS + checks + traza ──────────── */}
      {result !== null && (() => {
        const status = overallStatus(result.checks);
        const fos = result.fos;
        const fosOk: 'ok' | 'warn' | 'fail' =
          fos >= limit ? 'ok' : fos >= limit * 0.95 ? 'warn' : 'fail';
        const FosGlyph = fosOk === 'ok' ? Check : fosOk === 'warn' ? TriangleAlert : X;
        const fosColor =
          fosOk === 'ok' ? 'text-state-ok' : fosOk === 'warn' ? 'text-state-warn' : 'text-state-fail';

        return (
          <div className="mx-2 rounded overflow-hidden transition-colors" style={ambientStyle(status)}>

            {/* Cabecera del verdict */}
            <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-border-main">
              <span className="text-[10px] font-semibold uppercase tracking-[0.07em] text-text-disabled">
                Factor de seguridad
              </span>
              <VerdictBadge status={status} />
            </div>

            {/* FoS destacado — fila prominente (mono, grande). */}
            <div className="flex items-baseline justify-between px-4 py-3 border-b border-border-sub">
              <span className={`inline-flex items-center gap-2 font-mono text-2xl font-semibold tabular-nums ${fosColor}`}>
                <FosGlyph size={20} strokeWidth={2.25} aria-hidden="true" />
                {fos.toFixed(2)}
              </span>
              <span className="font-mono text-[11px] text-text-disabled tabular-nums">
                ≥ {limit.toFixed(2)}
                <span className="ml-1 normal-case">· {SITUATION_LABEL[situation]}</span>
              </span>
            </div>

            {/* Comprobaciones normativas (CTE 7.2.2.1 + EC7-DA3). */}
            {result.checks.map((c) => (
              <CheckRowItem key={c.id} check={c} />
            ))}

            {/* Disclaimer permanente del método (neutro) + ayuda larga. */}
            <div className="flex items-center gap-1.5 px-4 py-2.5 border-t border-border-sub">
              <span className="text-[11px] text-text-secondary">
                Bishop circular · predimensionamiento
              </span>
              <HelpTooltip text={DISCLAIMER_FULL} fieldLabel="Alcance del método" />
            </div>

            {/* Traza del motor (discreta) — versiones para defensibilidad. */}
            <div className="px-4 pb-2.5">
              <p className="font-mono text-[10px] text-text-disabled tabular-nums">
                PySlope {result.engine.pyslopeVersion} · Pyodide {result.engine.pyodideVersion}
              </p>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
