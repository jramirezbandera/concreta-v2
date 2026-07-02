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

import { useCallback, useEffect, useRef, useState } from "react";
import type { SlopeInputs } from "../../data/defaults";
import type { SlopeResult, SlopeEngineState } from "../../lib/calculations/geotech/types";
import { calcSlope } from "../../lib/calculations/geotech/slope";
import { getPySlope, cancelAndRewarm, isWarm } from "../../lib/calculations/geotech/client";

/** Señaliza una corrida obsoleta (cancelada/superada) — no es un error real. */
class ObsoleteRun extends Error {}

export interface SlopeSolver {
  engineState: SlopeEngineState;
  result: SlopeResult | null;
  error: string | null;
  isStale: boolean;
  /** Pyodide arrancado y listo: Calcular será rápido (sin cold-start). NO es lo
   *  mismo que engineState==='ready' (eso = "result listo"). */
  engineReady: boolean;
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
  // Init desde el singleton: si el worker ya está caliente (revisita del módulo),
  // arrancamos `ready` y evitamos un falso "preparando motor".
  const [engineReady, setEngineReady] = useState<boolean>(() => isWarm());

  const reqRef = useRef(0);
  const warmedRef = useRef(isWarm());
  // Token de generación del warm: lo incrementa cancel() (terminate+rewarm). Toda
  // escritura engineReady=true se gatea con él, para que un warm/preload OBSOLETO
  // que resuelva DESPUÉS de un cancel no marque listo un worker ya muerto
  // (carrera señalada por la voz externa, eng-review).
  const warmGenRef = useRef(0);

  const fingerprint = JSON.stringify(inputs);
  const isStale = result !== null && computedFingerprint !== fingerprint;

  /** Arranca/espera el worker en segundo plano y marca engineReady (gen-gated). */
  const startWarm = useCallback(() => {
    const gen = warmGenRef.current;
    getPySlope()
      .then(() => {
        if (gen === warmGenRef.current) {
          warmedRef.current = true;
          setEngineReady(true);
        }
      })
      .catch(() => {
        // Boot falló: client.ts ya reseteó apiPromise → el próximo intento
        // reintenta. No marcamos listo; el error real se gestiona al Calcular.
        if (gen === warmGenRef.current) setEngineReady(false);
      });
  }, []);

  // Precarga al montar, DIFERIDA: evita malgastar ~16 MB en visitas fugaces
  // (un navigate-in/out cancela el timer antes de arrancar). El cleanup NUNCA
  // termina el worker (StrictMode-safe: el doble-invoke en dev no spawnea dos
  // ni mata el singleton). Si ya está caliente, no se difiere.
  useEffect(() => {
    // Ya caliente: engineReady/warmedRef se iniciaron en true desde isWarm() — no
    // programamos warm (evita un getPySlope redundante y un setState en el effect).
    if (isWarm()) return;
    let cancelled = false;
    const run = () => {
      if (!cancelled) startWarm();
    };
    let idleId: number | undefined;
    let timerId: ReturnType<typeof setTimeout> | undefined;
    if (typeof requestIdleCallback === "function") {
      idleId = requestIdleCallback(run);
    } else {
      timerId = setTimeout(run, 600);
    }
    return () => {
      cancelled = true;
      if (idleId !== undefined && typeof cancelIdleCallback === "function") cancelIdleCallback(idleId);
      if (timerId !== undefined) clearTimeout(timerId);
    };
  }, [startWarm]);

  const compute = useCallback(
    async (reqId: number): Promise<SlopeResult> => {
      const gen = warmGenRef.current;
      if (!warmedRef.current) setEngineState("loading");
      await getPySlope();
      warmedRef.current = true;
      if (gen === warmGenRef.current) setEngineReady(true);
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
    warmGenRef.current++; // invalida cualquier warm/preload en vuelo
    setEngineReady(false);
    cancelAndRewarm(); // terminate + re-warm en segundo plano
    warmedRef.current = false;
    setEngineState(result ? "ready" : "idle");
    startWarm(); // re-calienta con el nuevo gen → engineReady cuando esté listo
  }, [result, startWarm]);

  const ensureResult = useCallback(async (): Promise<SlopeResult> => {
    // Mismo gate que calculate(): nunca correr el motor con datos inválidos
    // (extendería estratos / ignoraría inputs en silencio). El llamador (PDF)
    // ya bloquea con toast vía usePdfPreview; esto es el cinturón de seguridad.
    if (!valid) throw new Error("Los datos de entrada no son válidos");
    if (result && !isStale) return result;
    const reqId = ++reqRef.current;
    return compute(reqId);
  }, [valid, result, isStale, compute]);

  return { engineState, result, error, isStale, engineReady, calculate, cancel, ensureResult };
}
