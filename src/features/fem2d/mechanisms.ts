// FEM 2D — Fase 1 del design doc "retirar el rol de barra del enrutado"
// (office-hours 2026-07-28): el REGISTRO mecanismo → filas, y el invariante de
// auditoría que lo usa.
//
// ┌───────────────────────────────────────────────────────────────────────────┐
// │ EL INVARIANTE                                                             │
// │                                                                           │
// │  Para toda barra y todo mecanismo cuya DEMANDA supere su umbral de        │
// │  relevancia, debe existir una fila MemberCheck emitida para ese           │
// │  mecanismo. Si falta, el miembro lee PENDIENTE con motivo explícito.      │
// └───────────────────────────────────────────────────────────────────────────┘
//
// Por qué está escrito SIN mirar el rol de la barra: la Fase 2 borra
// `Fem2DMember.role`. Un invariante especificado como "rol viga con Nc/Nb ≥ x"
// dejaría de compilar en cuanto se borre el campo, y el silencio posterior lo
// produciría BORRAR el oráculo, no corregir el fallo. Este invariante solo lee
// las filas ya emitidas (`routed.rows`), así que sobrevive a la migración y
// sirve de prueba de que no rompió nada.
//
// REBASE DE FASE 2 (2026-07-29): el enrutado por mecanismo emite ids del
// MISMO conjunto (la fusión acero cede 'LTB' de pilares a 'ltb' de vigas y
// 'bending'/'axial-*' a 'MyRd'/'Nby'/'Nbz' — todos ya clasificados aquí), así
// que el registro sobrevivió con listas intactas; lo que cambió es QUIÉN los
// emite. La guarda de cobertura de `mechanisms.test.ts` sigue vigilando: si un
// motor emite un id no clasificado, el test falla. Y desde D10 la flecha se
// audita de verdad (ver abajo) — la segunda dirección del Hallazgo 2 queda
// cazada.

import { WARN_UTIL } from '../../lib/calculations/types';
import type { MemberCheck } from './checks';

export type Material2D = 'steel' | 'rc' | 'timber';

export type MechanismId =
  | 'bending'
  | 'shear'
  | 'shear-interaction'
  | 'buckling'
  | 'tension'
  | 'mn-interaction'
  | 'deflection';

export interface MechanismSpec {
  /** Nombre en la UI cuando el invariante señala que falta. */
  label: string;
  /** Referencia normativa del mecanismo, no de una fila concreta. */
  ref: string;
  /** Ids de fila que ACREDITAN el mecanismo, por material. Una fila cualquiera
   *  de la lista basta: son rutas alternativas al mismo mecanismo (p. ej. la
   *  flexión la acredita `bending` del motor de vigas o `MyRd` del de pilares). */
  rows: Record<Material2D, readonly string[]>;
}

/**
 * REGISTRO. Origen de cada id (verificado contra el fuente, no de memoria):
 *
 *   acero · calcSteelBeam    → classification · bending · shear · interaction ·
 *                              ltb · deflection      (lib/calculations/steelBeams.ts)
 *   acero · calcSteelColumn  → class · NRd · MRes|MyRd|MzRd · Nby · Nbz · LTB ·
 *                              int1 · int2 · sy · sz (lib/calculations/steelColumns.ts)
 *   acero · checks.ts        → axial-tension · axial-buckling · deflection ·
 *                              engine-invalid · pending-profile · shear-invalid
 *   madera · timberFrameMember → shear · comb-623 · comb-624 · comb-635 ·
 *                              tension-bending · bending · ltb
 *   HA · calcRCBeam          → bending · bending-over · shear · shear-max ·
 *                              cracking · as-* · rho-w-min · stirrup-* · bar-spacing*
 *   HA · calcRCColumn        → lambda-y · lambda-z · nd-max · nm-y · nm-z ·
 *                              nm-res · biaxial-check · flexion-check · as-* · …
 *   HA · checks.ts           → mn-vano · mn-apoyo · slenderness-gate ·
 *                              deflection-cracked · tension-bending · rev:*
 */
export const MECHANISMS: Record<MechanismId, MechanismSpec> = {
  bending: {
    label: 'Flexión',
    ref: 'CE Anejo 22 §6.2.5 / Anejo 19 §6.1',
    rows: {
      steel: ['bending', 'MyRd', 'MzRd', 'MRes'],
      rc: ['bending', 'bending-over', 'mn-vano', 'mn-apoyo', 'nm-y', 'nm-z', 'nm-res', 'flexion-check'],
      timber: ['bending', 'comb-623', 'comb-624', 'tension-bending'],
    },
  },
  shear: {
    label: 'Cortante',
    ref: 'CE Anejo 22 §6.2.6 / Anejo 19 §6.2',
    rows: {
      steel: ['shear'],
      rc: ['shear', 'shear-max'],
      timber: ['shear'],
    },
  },
  'shear-interaction': {
    label: 'Interacción M-V',
    ref: 'CE Anejo 22 §6.2.8',
    rows: { steel: ['interaction'], rc: [], timber: [] },
  },
  buckling: {
    label: 'Compresión + pandeo',
    ref: 'CE Anejo 22 §6.3.1',
    rows: {
      steel: ['axial-buckling', 'Nby', 'Nbz'],
      rc: ['nm-y', 'nm-z', 'nm-res', 'lambda-y', 'lambda-z'],
      timber: ['comb-623', 'comb-624'],
    },
  },
  tension: {
    label: 'Tracción',
    ref: 'CE Anejo 22 §6.2.3',
    rows: {
      steel: ['axial-tension'],
      rc: ['tension-bending', 'mn-vano', 'mn-apoyo'],
      timber: ['tension-bending'],
    },
  },
  'mn-interaction': {
    label: 'Interacción M+N',
    ref: 'CE Anejo 22 §6.3.3',
    rows: {
      // ACERO: SOLO el motor de pilares la emite. Que `beamChecks` saque
      // 'bending' y 'axial-buckling' por separado NO acredita este mecanismo —
      // es exactamente el hueco de seguridad que el invariante caza.
      steel: ['int1', 'int2'],
      rc: ['mn-vano', 'mn-apoyo', 'nm-y', 'nm-z', 'nm-res', 'biaxial-check'],
      // EC5 §6.3.2 ecs. 6.23/6.24 SON la interacción: el motor de madera nunca
      // separa mecanismos, así que este mecanismo no puede faltar en madera.
      timber: ['comb-623', 'comb-624'],
    },
  },
  deflection: {
    // AUDITADA desde la Fase 2 (D10 cerró OQ2): la exigibilidad NO sale de
    // ninguna heurística geométrica sino del DATO del usuario — deflLimit por
    // barra. 'no aplica' ⇒ nada que exigir; un límite declarado ⇒ tiene que
    // existir fila. El llamante (checkMember) pasa la señal ya resuelta
    // (deflLimit + formulación viga-columna + rcDesignKind), así que aquí no
    // vive ninguna regla — solo el contrato. Cierra la segunda dirección del
    // Hallazgo 2 (viga etiquetada 'pilar' que perdía la fila de flecha).
    label: 'Flecha (ELS)',
    ref: 'CTE DB-SE 4.3.3',
    rows: {
      steel: ['deflection'],
      rc: ['deflection-cracked'],
      timber: ['deflection', 'deflection-fin'],
    },
  },
};

/** Filas que NO son un mecanismo resistente: armado de detalle, avisos,
 *  clasificación, esbeltez informativa, centinelas de la propia app. La guarda
 *  de cobertura las acepta como clasificadas. */
export const NON_MECHANISM_ROWS: readonly string[] = [
  // Estado / centinelas de checks.ts
  'pending', 'no-forces', 'engine-invalid', 'pending-profile', 'pending-armado',
  'shear-invalid', 'slenderness-gate', 'rev:engine-invalid',
  // Informativas
  'class', 'classification', 'sy', 'sz', 'lambda', 'nd-max', 'cracking',
  // Vuelco lateral: mecanismo de flexión, ya acreditado por la fila de flexión;
  // se lista aparte para no exigir su presencia (una barra arriostrada no la da).
  'ltb', 'LTB',
  // Armado y detalle (HA)
  'as-min', 'as-min-comp', 'as-min-mech', 'as-max', 'nBars-min',
  'bar-spacing', 'bar-spacing-x', 'bar-spacing-y', 'bar-spacing-circ',
  'bar-spacing-impossible', 'rho-w-min', 'stirrup-spacing-max',
  'stirrup-legs-spacing', 'stirrup-diam', 'stirrup-spacing',
  // Compresión de sección (acreditada por pandeo, que es más restrictiva)
  'NRd',
  // Fuego (madera)
  'fire-section-lost', 'fire-comb-623', 'fire-comb-624', 'comb-635',
];

// ── Umbral (OQ1) ────────────────────────────────────────────────────────────
//
// NO se usa AXIAL_ROW_MIN_ETA (0.01): ese es el suelo de ruido con el que
// checks.ts decide si IMPRIME una fila acompañante, no un umbral de relevancia
// mecánica. Auditar al 1 % sería ruido máximo.
//
// El criterio NO es "la demanda es grande" sino, exactamente:
//
//     dispara cuando la comprobación AUSENTE podría haber cambiado el color.
//
// Es la única formulación que se deriva de P4 (un verde falso es un fallo de
// seguridad) en vez de un número inventado, y reutiliza la frontera que la app
// ya usa en todas partes: WARN_UTIL. Por debajo de ese valor el miembro sale
// verde con la interacción o sin ella, así que auditarlo sería ruido; por
// encima, el verde que hoy se pinta puede ser falso.
//
// Para saber si "podría haber cambiado el color" hace falta una ESTIMACIÓN de
// la interacción, no la interacción. EN 1993-1-1 ec. 6.61:
//
//     N_Ed/(χ_y·N_Rk/γ) + k_yy·M_y,Ed/(χ_LT·M_y,Rk/γ) ≤ 1
//              └── η_N ──┘        └──── η_M (la fila de VUELCO, que ya lleva
//                                        χ_LT dentro) ────┘
//
// con k_yy = C_my·(1 + 0.6·λ̄_y·n) ≤ C_my·(1 + 0.6·n) (Anexo B). Se toma
// C_my = 1 como cota superior (C_my ≤ 1 en los casos usuales), así que
//
//     η_est = η_N + (1 + 0.6·η_N)·η_M
//
// es una estimación DEL LADO DE LA SEGURIDAD y con la ec. 6.62 (k_zy ≈ 0.6·k_yy)
// por debajo, así que 6.61 gobierna. Esto es un CRIBADO, no una comprobación: el
// número real solo sale de correr el motor de pilares, que es lo que hace la
// Fase 2. Aquí solo decide si merece la pena avisar.
export const MECH_PRESENT_MIN_ETA = 0.05;

/** Filas que llevan χ_LT dentro: son el denominador correcto del 2º término de
 *  la 6.61. Van aparte de MECHANISMS.bending porque el vuelco no es un
 *  mecanismo cuya AUSENCIA haya que exigir (una barra arriostrada no lo da). */
export const LTB_ROWS: readonly string[] = ['ltb', 'LTB'];

/** Estimación conservadora de la ec. 6.61 a partir de las filas separadas. */
export function estimateMnInteraction(etaN: number, etaM: number): number {
  return etaN + (1 + 0.6 * etaN) * etaM;
}

// ── Invariante ──────────────────────────────────────────────────────────────

/** η de la primera fila presente de la lista, 0 si ninguna. */
function etaOf(rows: readonly MemberCheck[], ids: readonly string[]): number {
  let best = 0;
  for (const r of rows) {
    if (ids.includes(r.id)) best = Math.max(best, r.eta);
  }
  return best;
}

function hasAny(rows: readonly MemberCheck[], ids: readonly string[]): boolean {
  return rows.some((r) => ids.includes(r.id));
}

export interface MechanismGap {
  mechanism: MechanismId;
  row: MemberCheck;
}

/**
 * Evalúa el invariante sobre las filas ya emitidas de UNA barra.
 *
 * Fase 1 evalúa el ÚNICO mecanismo con hueco real y no bloqueado: la
 * interacción M+N. Los otros cinco no pueden faltar hoy —`columnChecks` siempre
 * emite Nby/Nbz/shear, `beamChecks` emite axial-buckling por encima de η 0.01 y
 * el motor de madera hace la interacción EC5 siempre— y la flecha está
 * bloqueada por OQ2. Construir disparadores para mecanismos que no pueden
 * fallar sería relleno; lo que mantiene honesto al registro es la guarda de
 * cobertura del test, no un `if` más aquí.
 *
 * Devuelve las filas de discrepancia a añadir. Cada una lleva `eta: 0` y el
 * llamante debe marcar el miembro `incomplete` → el contrato F1 ya lo propaga
 * a PENDIENTE. No hay semántica nueva.
 */
export function auditMechanisms(
  material: Material2D,
  rows: readonly MemberCheck[],
  opts: {
    etaNMajor?: number;
    /** Señal de flecha YA RESUELTA por el llamante (D10): `expected` = el
     *  usuario declaró un límite y la barra puede flectar (viga-columna, y en
     *  HA con rcDesignKind 'beam'); `etaEst` = δ/adm estimada con ese límite. */
    deflection?: { expected: boolean; etaEst: number };
  } = {},
): MechanismGap[] {
  const gaps: MechanismGap[] = [];

  // ── Interacción M+N §6.3.3 ────────────────────────────────────────────────
  const spec = MECHANISMS['mn-interaction'];
  if (!hasAny(rows, spec.rows[material])) {
    // El 1er término de la 6.61 se divide por χ_y (eje FUERTE). La fila
    // `axial-buckling` que se muestra usa el eje DÉBIL: es la comprobación
    // autónoma correcta, pero NO es el número de esta ecuación (en el dintel
    // IPE240 del pórtico, 0.238 con Iz frente a 0.041 con Iy). Cuando el
    // llamante puede darlo bien, se usa el suyo.
    const etaN = opts.etaNMajor ?? etaOf(rows, MECHANISMS.buckling.rows[material]);
    // El 2º término de la 6.61 se divide por χ_LT·M_Rk: la fila de vuelco ya lo
    // lleva dentro, así que gobierna sobre la de flexión pura cuando existe.
    const etaM = Math.max(etaOf(rows, MECHANISMS.bending.rows[material]), etaOf(rows, LTB_ROWS));
    const etaEst = estimateMnInteraction(etaN, etaM);
    if (
      etaN >= MECH_PRESENT_MIN_ETA &&
      etaM >= MECH_PRESENT_MIN_ETA &&
      etaEst >= WARN_UTIL
    ) {
      gaps.push({
        mechanism: 'mn-interaction',
        row: {
          id: 'mn-no-comprobada',
          name: 'Interacción M+N NO comprobada',
          val:
            `compresión η=${etaN.toFixed(2)} y flexión η=${etaM.toFixed(2)} concomitantes ` +
            `⇒ interacción estimada ≈ ${etaEst.toFixed(2)}. Los dos mecanismos se han ` +
            'comprobado por separado, pero su interacción NO. Esta barra se comporta como ' +
            'pilar: compruébala como tal.',
          eta: 0,
          ref: spec.ref,
        },
      });
    }
  }

  // ── Flecha ELS (D10) ──────────────────────────────────────────────────────
  // Mismo criterio que la M+N: dispara solo cuando la fila ausente podría
  // haber cambiado el color (δ/adm ≥ WARN_UTIL con el límite que el usuario
  // declaró). Con el enrutado de la Fase 2 la fila se emite siempre que
  // `expected` — este bloque es el ORÁCULO que impide que un filtro futuro la
  // vuelva a perder en silencio, como hacía el rol 'pilar'.
  const defl = opts.deflection;
  if (defl?.expected && defl.etaEst >= WARN_UTIL && !hasAny(rows, MECHANISMS.deflection.rows[material])) {
    gaps.push({
      mechanism: 'deflection',
      row: {
        id: 'flecha-no-comprobada',
        name: 'Flecha ELS NO comprobada',
        val:
          `la barra declara un límite de flecha y la estimada lo agota (η ≈ ${defl.etaEst.toFixed(2)}), ` +
          'pero no se ha emitido ninguna fila de flecha. Revisa el límite declarado en el inspector.',
        eta: 0,
        ref: MECHANISMS.deflection.ref,
      },
    });
  }

  return gaps;
}
