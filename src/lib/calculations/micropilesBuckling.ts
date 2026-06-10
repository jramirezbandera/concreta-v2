// ─────────────────────────────────────────────────────────────────────────────
// Pandeo del micropilote — factor empírico CR / coeficiente R
// «Guía para el proyecto y la ejecución de micropilotes en obras de carretera»
// (Ministerio de Fomento, 2005), §3.6.1 y Tabla 3.6.
//
// El tope estructural a compresión se minora globalmente por:
//
//     R = 1,07 − 0,027 · CR        con doble acotación   0 ≤ R ≤ 1
//
//   · R = 1 para CR ≤ 2,59  (sin penalización por pandeo).
//   · R = 0 para CR ≥ 39,6  (≈40): el tope estructural se anula.
//
// CR no es un factor por tramo: se evalúa el CR que activaría CADA estrato/tramo
// que el pilote atraviesa y se ADOPTA EL MÁS DESFAVORABLE (mayor CR → menor R).
// Los tramos libres/inestables se acumulan en longitud H antes de CR = ΣH/D_R.
//
// Hipótesis acordadas con el proyectista (no derivadas de la propia Tabla 3.6,
// porque el modelo de estrato no almacena I_D, Cu ni subtipo orgánico):
//   · Granular: compacidad por NSPT (Terzaghi-Peck). N<10 floja, 10≤N<30 media,
//     N≥30 densa (competente).
//   · Cohesivo: su directo; si su=0 y NSPT>0 ⇒ su ≈ 6·N kPa (correlación, marcada).
//   · Cu = D60/D10 opcional por estrato; ausente ⇒ Cu<2.
//   · «sobre/bajo NF permanentemente» = tramo ÍNTEGRO por encima/debajo del NF.
// Toda hipótesis aplicada se devuelve en `hypotheses` para que quede trazada.
// ─────────────────────────────────────────────────────────────────────────────

import type { MicropilesInputs, SoilLayer } from '../../data/defaults';

/** CR a partir del cual R ≤ 0 (tope estructural nulo). 1.07/0.027 ≈ 39.63. */
export const CR_NULLIFIES = 1.07 / 0.027;

/**
 * Severidad de una nota de pandeo. `warn` = el proyectista DEBE revisarla
 * (fuera de tabla, terreno inestable, dato correlacionado, capa no evaluada);
 * `info` = traza normal del cálculo (interpolación en tabla, posición NF). La
 * UI las jerarquiza por color (ámbar vs text-secondary) — design review 2026-06-02.
 */
export type BucklingLevel = 'warn' | 'info';
export interface BucklingNote {
  text: string;
  level: BucklingLevel;
}

export interface BucklingResult {
  /** CR auto-calculado adoptado (el más desfavorable). 0 ⇒ no penaliza. */
  crAuto: number;
  /** Etiqueta del estrato/tramo que gobierna el CR adoptado. */
  governing: string;
  /** Hipótesis y notas aplicadas, etiquetadas por severidad. */
  hypotheses: BucklingNote[];
}

/** Interpolación lineal acotada: x en [x0,x1] → [y0,y1], clamp fuera del rango. */
function lerp(x: number, x0: number, x1: number, y0: number, y1: number): number {
  if (x1 === x0) return y0;
  const t = Math.min(1, Math.max(0, (x - x0) / (x1 - x0)));
  return y0 + t * (y1 - y0);
}

const f2 = (n: number) => n.toFixed(2);

interface Contributor {
  cr: number;
  source: string;
}

/**
 * Determina el CR de pandeo a partir de la estratigrafía y la geometría.
 *
 * @param inp   inputs del módulo (geometría, NF, esfuerzo…).
 * @param soil  perfil de estratos DESDE LA RASANTE (z=0 superficie).
 * @param deMm  diámetro EXTERIOR de la armadura tubular en mm (D_R para H/D_R).
 */
export function computeBucklingCR(
  inp: MicropilesInputs,
  soil: SoilLayer[],
  deMm: number,
): BucklingResult {
  const hypotheses: BucklingNote[] = [];
  const warn = (text: string) => hypotheses.push({ text, level: 'warn' });
  const info = (text: string) => hypotheses.push({ text, level: 'info' });
  const candidates: Contributor[] = [];

  const headDepth = inp.topDepth;          // m (profundidad cabeza desde rasante; <0 ⇒ sobre rasante)
  const toeDepth  = inp.toeDepth;          // m
  const nfDepth   = inp.waterTableDepth;   // m (profundidad NF desde rasante)
  const D_R       = deMm / 1000;           // m

  // ── Tramos libres (sin coacción lateral) — §3.6.1 caso libre ───────────────
  // El único tramo libre derivable del modelo es el que sobresale de la rasante
  // cuando la cabeza está sobre el terreno (topDepth<0). Cavidades/huecos no se
  // modelan, así que no se inventan. Se acumula H y se evalúa como H/D_R.
  let freeH = 0;
  const unstableSources: string[] = [];
  if (headDepth < 0) {
    freeH += -headDepth;
    unstableSources.push('libre sobre rasante');
    warn(`Tramo libre sobre rasante H=${f2(-headDepth)} m (cabeza a ${f2(headDepth)} m): sin coacción lateral.`);
  }

  // ── Recorrido por estratos entre cabeza y apoyo ────────────────────────────
  let layerTop = 0; // profundidad absoluta del techo del estrato (desde rasante)
  let softCohesiveSeen = false;

  for (const layer of soil) {
    const layerBase = layerTop + layer.thickness;

    // Solape del estrato con el tramo enterrado del pilote [max(0,head), toe].
    const segTop = Math.max(layerTop, Math.max(0, headDepth));
    const segBase = Math.min(layerBase, toeDepth);
    const H = segBase - segTop;
    if (H <= 1e-6) { layerTop = layerBase; continue; } // el pilote no cruza este estrato

    const tag = `E${layer.id}`;
    // Posición respecto al NF (criterio: tramo ÍNTEGRO por encima/debajo).
    const fullyAboveNF = segBase <= nfDepth + 1e-9;
    const fullyBelowNF = segTop >= nfDepth - 1e-9;
    const nfNote = fullyAboveNF ? 'sobre NF' : fullyBelowNF ? 'bajo NF' : 'atraviesa NF';

    if (layer.type === 'granular') {
      const N = layer.Nspt;
      const Cu = layer.Cu ?? 0;
      const cuGe2 = Cu >= 2;
      const cuNote = layer.Cu ? `Cu=${f2(Cu)}` : 'Cu n/d (→<2)';

      if (N >= 30) {
        // Densa / muy densa — competente, no penaliza.
      } else if (N >= 10) {
        // Compacidad media (0,35 < I_D < 0,65): la fila de la Tabla 3.6
        // («granulares de compacidad media sobre el nivel freático») penaliza
        // la porción permanentemente sobre el NF — o toda la capa si Cu ≥ 2.
        // Se PARTE el tramo por el NF igual que la rama floja: una capa que
        // CRUZA el freático penaliza por su porción seca (antes, fullyAboveNF
        // exigía el tramo ÍNTEGRO sobre el NF y la capa cruzante quedaba sin
        // candidato → R=1, no conservador). La porción saturada con Cu<2
        // queda sin tabular (solo la floja saturada es inestable).
        const hDry = Math.max(0, Math.min(segBase, nfDepth) - segTop); // m sobre NF
        if (hDry > 1e-6 || cuGe2) {
          const ID = lerp(N, 10, 30, 0.35, 0.65);     // I_D estimado por NSPT
          const cr = lerp(ID, 0.35, 0.65, 8, 7);       // más flojo → CR mayor
          candidates.push({ cr, source: `${tag} granular media` });
          info(
            `${tag}: granular media (N=${N}, I_D≈${f2(ID)}, ${nfNote}, ${cuNote}) → CR=${f2(cr)} ` +
            `(interp. 8…7 por I_D; activa por ${cuGe2 ? 'Cu≥2' : `${f2(hDry)} m sobre NF`}).`,
          );
        } else {
          info(
            `${tag}: granular media (N=${N}, ${nfNote}, ${cuNote}) → no penaliza ` +
            `(íntegra bajo NF y Cu<2; sin condición activadora).`,
          );
        }
      } else {
        // Compacidad floja (N<10, I_D<0,35): la Tabla 3.6 NO la tabula.
        // Se PARTE el tramo por el NF (Codex eng-review 2026-06-02): la porción
        // saturada (bajo NF) con Cu<2 es terreno inestable → H/D_R (caso 4); el
        // resto (seco, o saturado pero bien graduado con Cu≥2) adopta el extremo
        // desfavorable de la banda granular, CR=8 (fuera de tabla). Antes la
        // capa que CRUZABA el NF recibía CR=8 a todo el espesor, infra-penalizando
        // la parte saturada de una arena floja gruesa medio sumergida.
        const hSat = Math.max(0, segBase - Math.max(segTop, nfDepth)); // m bajo NF
        if (hSat > 1e-6 && !cuGe2) {
          freeH += hSat;
          unstableSources.push(tag);
          warn(
            `${tag}: arena floja saturada ${f2(hSat)} m bajo NF (N=${N}, ${cuNote}) → ` +
            `INESTABLE, aporta H=${f2(hSat)} m a CR=ΣH/D_R.`,
          );
        }
        // Espesor que va a la banda CR=8: si Cu≥2 toda la capa (no inestable);
        // si Cu<2, solo la parte no saturada.
        const hBand = cuGe2 ? H : H - hSat;
        if (hBand > 1e-6) {
          candidates.push({ cr: 8, source: `${tag} arena floja (fuera de tabla)` });
          warn(
            `${tag}: arena floja ${f2(hBand)} m (N=${N}, ${nfNote}, ${cuNote}) FUERA DE TABLA → ` +
            `adoptado CR=8 (conservador), revisar.`,
          );
        }
      }
    } else {
      // ── Cohesivo: clasificar por su ──────────────────────────────────────
      let su = layer.su;
      if (su <= 0 && layer.Nspt > 0) {
        su = 6 * layer.Nspt; // correlación su ≈ 6·N kPa (Stroud, arcillas)
        warn(`${tag}: su no dado → su≈6·N=${f2(su)} kPa (correlación NSPT), revisar.`);
      }

      // Bordes (inclusividad explícita): su>50 firme; 25≤su≤50 medio; 15≤su<25
      // blando; su<15 fuera de tabla. su=50 cae en "medio" (CR=7), su=25 en
      // "medio" (CR=8), su=15 en "blando" (CR=12). Igual criterio granular:
      // N≥30 densa, 10≤N<30 media, N<10 floja.
      if (su <= 0) {
        // Sin su ni NSPT: no clasificable, no se inventa penalización.
        warn(`${tag}: cohesivo sin su ni NSPT → no evaluado (no penaliza).`);
      } else if (su > 50) {
        // Firme o mayor — competente, no penaliza.
      } else if (su >= 25) {
        const cr = lerp(su, 25, 50, 8, 7);   // consistencia media: 8…7
        candidates.push({ cr, source: `${tag} cohesivo medio` });
        info(`${tag}: cohesivo consistencia media (su=${f2(su)} kPa) → CR=${f2(cr)} (interp. 8…7).`);
        softCohesiveSeen = true;
      } else if (su >= 15) {
        const cr = lerp(su, 15, 25, 12, 8);  // arcillas/limos blandos: 12…8
        candidates.push({ cr, source: `${tag} cohesivo blando` });
        info(`${tag}: cohesivo blando (su=${f2(su)} kPa) → CR=${f2(cr)} (interp. 12…8 arcilla/limo).`);
        softCohesiveSeen = true;
      } else {
        // su<15: por debajo del mínimo tabulado. Extremo desfavorable de la
        // banda de arcilla blanda (CR=12), marcado como fuera de tabla.
        candidates.push({ cr: 12, source: `${tag} cohesivo muy blando (fuera de tabla)` });
        warn(`${tag}: cohesivo muy blando (su=${f2(su)} kPa) FUERA DE TABLA → adoptado CR=12 (conservador), revisar.`);
        softCohesiveSeen = true;
      }
    }

    layerTop = layerBase;
  }

  // Aviso único: turba/fango orgánico (CR 18…12) no se autodetecta.
  if (softCohesiveSeen) {
    warn(
      'Cohesivos blandos tratados como arcilla/limo; turba o fango orgánico ' +
      '(CR 18…12, Tabla 3.6) no se distingue por falta de subtipo en el modelo.',
    );
  }

  // ── Tramos libres/inestables acumulados → CR = ΣH / D_R ────────────────────
  if (freeH > 1e-6) {
    // D_R inválido (≤0) NO debe borrar el peor caso (Codex #4): sin diámetro de
    // armadura no se puede acotar el pandeo, así que se anula el tope (CR_NULLIFIES
    // → R=0) en vez de devolver CR=0 (que ocultaría la inestabilidad).
    const cr = D_R > 0 ? freeH / D_R : CR_NULLIFIES;
    const who = unstableSources.join(', ');
    candidates.push({ cr, source: `tramo libre/inestable [${who}] ΣH=${f2(freeH)} m` });
    warn(
      D_R > 0
        ? `Tramos libres/inestables [${who}]: ΣH=${f2(freeH)} m, D_R=${f2(deMm)} mm → CR=ΣH/D_R=${f2(cr)}.`
        : `Tramos libres/inestables [${who}] ΣH=${f2(freeH)} m pero D_R inválido (${f2(deMm)} mm) → tope anulado.`,
    );
  }

  // ── Selección del CR más desfavorable ──────────────────────────────────────
  if (candidates.length === 0) {
    return {
      crAuto: 0,
      governing: 'sin estrato/tramo penalizante (terreno competente)',
      hypotheses: hypotheses.length
        ? hypotheses
        : [{ text: 'Todos los tramos competentes: R=1, sin penalización por pandeo.', level: 'info' }],
    };
  }

  const worst = candidates.reduce((a, b) => (b.cr > a.cr ? b : a));
  return { crAuto: worst.cr, governing: worst.source, hypotheses };
}
