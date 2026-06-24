// Hook del solver async de taludes. A diferencia del resto de módulos (cálculo
// síncrono en useMemo), aquí el cómputo cruza al worker de Pyodide y cuesta
// cientos de ms–s, por eso hay botón "Calcular" explícito y una máquina de
// estados (eng-review §9.2 #1, design-review §10.3).
//
//   idle      → motor no solicitado
//   loading   → primer arranque (descarga/boot de Pyodide)
//   computing → una corrida en curso
//   ready     → resultado listo
//   error     → fallo de carga/cálculo
//
// `isStale` lo deriva la UI comparando el fingerprint de los inputs con el de la
// última corrida (badge "resultados desactualizados").

import { useCallback, useRef, useState } from "react";
import type { SlopeInputs } from "../../data/defaults";
import type { SlopeResult, SlopeEngineState } from "../../lib/calculations/geotech/types";
import { calcSlope } from "../../lib/calculations/geotech/slope";
import { getPySlope, cancelAndRewarm } from "../../lib/calculations/geotech/client";

/** Señaliza una corrida obsoleta (cancelada/superada) — no es un error real. */
class ObsoleteRun extends Error {}

export interface SlopeSolver {
  engineState: SlopeEngineState;
  result: SlopeResult | null;
  error: string | null;
  isStale: boolean;
  calculate: () => void;
  cancel: () => void;
  /** Para el PDF: garantiza un resultado fresco (botón nunca deshabilitado). */
  ensureResult: () => Promise<SlopeResult>;
}

export function useSlopeSolver(inputs: SlopeInputs, valid: boolean): SlopeSolver {
  const [engineState, setEngineState] = useState<SlopeEngineState>("idle");
  const [result, setResult] = useState<SlopeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [computedFingerprint, setComputedFingerprint] = useState<string | null>(null);

  const reqRef = useRef(0);
  const warmedRef = useRef(false);

  const fingerprint = JSON.stringify(inputs);
  const isStale = result !== null && computedFingerprint !== fingerprint;

  const compute = useCallback(
    async (reqId: number): Promise<SlopeResult> => {
      if (!warmedRef.current) setEngineState("loading");
      await getPySlope();
      warmedRef.current = true;
      if (reqId !== reqRef.current) throw new ObsoleteRun();
      setEngineState("computing");
      const res = await calcSlope(inputs);
      if (reqId !== reqRef.current) throw new ObsoleteRun();
      setResult(res);
      setComputedFingerprint(JSON.stringify(inputs));
      setError(null);
      setEngineState("ready");
      return res;
    },
    [inputs],
  );

  const calculate = useCallback(() => {
    if (!valid) return;
    const reqId = ++reqRef.current;
    compute(reqId).catch((e) => {
      if (e instanceof ObsoleteRun || reqId !== reqRef.current) return;
      setError((e as Error).message ?? "Error de cálculo");
      setEngineState("error");
    });
  }, [valid, compute]);

  const cancel = useCallback(() => {
    reqRef.current++; // invalida la corrida en curso
    cancelAndRewarm(); // terminate + re-warm en segundo plano
    warmedRef.current = false;
    setEngineState(result ? "ready" : "idle");
  }, [result]);

  const ensureResult = useCallback(async (): Promise<SlopeResult> => {
    if (result && !isStale) return result;
    const reqId = ++reqRef.current;
    return compute(reqId);
  }, [result, isStale, compute]);

  return { engineState, result, error, isStale, calculate, cancel, ensureResult };
}
