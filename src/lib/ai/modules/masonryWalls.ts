/**
 * Adapter del asistente IA para el módulo Muros de fábrica (ola 4, DB-SE-F):
 * muro de carga de fábrica EXISTENTE, multi-planta, con huecos y dinteles.
 *
 * Particularidades del módulo:
 * - ALCANCE REDUCIDO (v1). La IA solo propone los ESCALARES GLOBALES: la
 *   fábrica (modo, pieza/fb/fm o Anejo C o f_k directo), los coeficientes de
 *   seguridad y la geometría global (L, t). Las PLANTAS —con sus huecos y sus
 *   cargas puntuales— viajan al snapshot como CONTEXTO DE SOLO LECTURA dentro de
 *   `valores`: el modelo las ve y explica los resultados por planta y por
 *   machón, pero no las edita (no son claves del payload y el schema es
 *   `additionalProperties:false`, así que ni siquiera puede intentarlo).
 *   Van dentro de `valores` a propósito: `decorateSnapshot` reconstruye el
 *   objeto quedándose SOLO con valores/sin_confirmar/pendientes_de_aplicar, de
 *   modo que una clave extra de primer nivel desaparecería en silencio en cuanto
 *   el modelo hiciera su primera propuesta.
 * - EN REHABILITACIÓN, LO EXISTENTE ES DATO (2º caso, tras empresillado). Aquí
 *   el dato medido no es solo la geometría (`t`, `L` → `lowerIsSafer`: engordar
 *   el muro sube N_Rd, baja λ y alivia la concentración de una sola escritura),
 *   sino la RESISTENCIA de la fábrica: subir f_k de una fábrica ensayada es la
 *   trampa perfecta. Y en este módulo NO hay variable de diseño libre: si no
 *   cumple, la salida es una intervención real (recrecido, zunchado, redistribuir
 *   cargas), no un número mejor en el formulario.
 * - RIESGO SINTÉTICO sobre la fábrica RESUELTA, en vez de reglas campo a campo.
 *   Las reglas por campo (fb/fm/fk_custom → lowerIsSafer) son a la vez ruidosas
 *   y agujereadas: subir fm de 5 a 7.5 con fb=10/macizo deja f_k = 4 IGUAL (rojo
 *   falso), mientras que cambiar `pieza`, `fabricaModo` o `customMethod` sube la
 *   capacidad SIN disparar ninguna regla. `fabricaRisks` compara
 *   `resolverFabrica(vigente)` con `resolverFabrica(estado FINAL)` y marca lo
 *   único que importa: que suba f_k o que baje γ (aligerar el muro rebaja el
 *   peso propio, que es demanda). Cero solape con la tabla escalar ⇒ cero
 *   doble-reporte.
 * - PATCH ATÓMICO: la terna (pieza, fb, fm) tiene celdas NULAS en Tabla 4.4, y
 *   media terna deja el cálculo sin f_k → o se aplica entera o no se aplica.
 *   El cambio de tipo de muro (Anejo C) re-estima γ y resetea
 *   `gamma_custom_edited` vía `tipoMuroPatch`, el mismo helper que usa la UI:
 *   escribir γ sin marcar el flag haría que el siguiente cambio de tipo de muro
 *   pisara en silencio el dato de la IA.
 * - El motor devuelve una UNIÓN DISCRIMINADA (`EdificioResult`) y no trae
 *   `checks`: el resumen los reconstruye con `masonryBuildingChecks`, cuya fila
 *   de esbeltez es de EDIFICIO y sin banda ámbar para que el veredicto del chat
 *   sea idéntico al del badge (ver la invariante en el motor).
 */
import { AiError } from '../types';
import type { AiApplyPlan, AiFieldChange, AiModuleAdapter, AiSkippedField } from './types';
import { summarizeCalcResults, type AiResultsSummary } from '../resultsSummary';
import {
  detectSafetyRisks,
  higherIsSafer,
  lowerIsSafer,
  type AiSafetyRisk,
  type SafetyRule,
} from '../safety';
import {
  FB_VALUES,
  GAMMA_ESTIMADO,
  K_ANEJO_C,
  MASONRY_LAMBDA_MAX,
  TABLA_4_4,
  TIPO_MURO_LABELS_SHORT,
  calcFkAnejoC,
  defaultMasonryState,
  eApoyoForjado,
  fbValidosPara,
  fmValidosPara,
  gammaCustomPatch,
  getCriticoEdificio,
  huecoGeom,
  lookupFk,
  masonryBuildingChecks,
  masonryPlantasSonDeFabrica,
  plantaMasEsbelta,
  resolverFabrica,
  tipoMuroPatch,
  type CustomMethod,
  type EdificioResult,
  type FabricaModo,
  type MasonryWallState,
  type PiezaTipo,
  type TipoMuroAnejoC,
} from '../../calculations/masonryWalls';
import { formatQuantity } from '../../units/format';
import type { UnitSystem } from '../../units/types';

// ── Catálogo del módulo ───────────────────────────────────────────────────────

const MODOS: readonly FabricaModo[] = ['tabla', 'custom'];
const METHODS: readonly CustomMethod[] = ['anejoC', 'manual'];
const PIEZAS = Object.keys(TABLA_4_4) as PiezaTipo[];
const TIPOS_MURO = Object.keys(K_ANEJO_C) as TipoMuroAnejoC[];
/** Los fm que aparecen en alguna fila de Tabla 4.4. La validación real es la
 *  terna completa (pieza × fb × fm) — esto solo filtra basura evidente. */
const FM_VALUES = [2.5, 5, 7.5, 10, 15] as const;

/** Defaults ESTABLES: `defaultMasonryState()` mintea ids aleatorios en cada
 *  llamada, así que se congela una sola instancia para el snapshot y el gate
 *  anti-ruido de las reglas de seguridad. */
const MASONRY_DEFAULTS: MasonryWallState = defaultMasonryState();

const MODO_LABEL: Record<FabricaModo, string> = {
  tabla: 'Tabla 4.4',
  custom: 'Personalizada',
};
const METHOD_LABEL: Record<CustomMethod, string> = {
  anejoC: 'Anejo C (eq. C.1)',
  manual: 'f_k directo',
};

/** Sub-modo vigente con el mismo pliegue defensivo que `resolverFabrica`: un
 *  estado legacy sin `customMethod` es 'manual', NUNCA 'anejoC'. */
function methodOf(s: Pick<MasonryWallState, 'customMethod'>): CustomMethod {
  return s.customMethod === 'anejoC' ? 'anejoC' : 'manual';
}

// ── Payload schema (JSON Schema canónico PLANO, todo nullable) ────────────────

export const MASONRY_PAYLOAD_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: [
    'fabrica_modo', 'pieza', 'fb_MPa', 'fm_MPa',
    'custom_method', 'anejoC_tipo_muro', 'anejoC_fb_MPa', 'anejoC_fm_MPa', 'fk_MPa',
    'gamma_fabrica_kNm3', 'gamma_M', 'gamma_G', 'gamma_Q',
    'L_m', 't_cm', 'warnings',
  ],
  properties: {
    fabrica_modo: {
      type: ['string', 'null'],
      enum: [...MODOS, null],
      description: 'Cómo se obtiene la resistencia f_k de la fábrica: "tabla" (Tabla 4.4 DB-SE-F, con pieza + fb + fm) o "custom" (personalizada: Anejo C eq. C.1, o f_k directo de un ensayo).',
    },
    pieza: {
      type: ['string', 'null'],
      enum: [...PIEZAS, null],
      description: 'Tipo de pieza de Tabla 4.4: "macizo" (ladrillo macizo), "macizo_junta_delgada" (macizo con mortero de junta delgada), "perforado", "bloque_aligerado", "bloque_hueco". Solo se aplica en modo "tabla".',
    },
    fb_MPa: {
      type: ['number', 'null'],
      enum: [...FB_VALUES, null],
      description: 'Resistencia normalizada de la PIEZA, en N/mm². Solo los valores tabulados: 5, 10, 15, 20 o 25. Solo se aplica en modo "tabla".',
    },
    fm_MPa: {
      type: ['number', 'null'],
      enum: [...FM_VALUES, null],
      description: 'Resistencia del MORTERO, en N/mm². Depende de fb: fb=5 → 2.5 o 5; fb=10 → 5 o 7.5; fb=15 → 7.5 o 10; fb=20 → 10 o 15; fb=25 → 15. Solo se aplica en modo "tabla".',
    },
    custom_method: {
      type: ['string', 'null'],
      enum: [...METHODS, null],
      description: 'Método de la fábrica personalizada: "anejoC" (calcula f_k = K·fb^0.65·fm^0.25 con el tipo de muro) o "manual" (f_k directo, el del ensayo o la documentación). Solo se aplica en modo "custom".',
    },
    anejoC_tipo_muro: {
      type: ['string', 'null'],
      enum: [...TIPOS_MURO, null],
      description: 'Topología del muro para el coeficiente K del Anejo C: "una_hoja_macizo", "una_hoja_perforado", "una_hoja_aligerado", "una_hoja_hueco", "dos_hojas_macizo", "dos_hojas_perforado", "dos_hojas_aligerado". Solo en modo "custom" + "anejoC". Al cambiarlo se re-estima el peso específico γ de la fábrica.',
    },
    anejoC_fb_MPa: {
      type: ['number', 'null'],
      description: 'Resistencia de la pieza fb en N/mm² para la eq. C.1 del Anejo C (valor libre, no tabulado). Solo en modo "custom" + "anejoC".',
    },
    anejoC_fm_MPa: {
      type: ['number', 'null'],
      description: 'Resistencia del mortero fm en N/mm² para la eq. C.1. La ecuación la limita a min(20, 0.75·fb): si te pasas, el motor aplica el tope. Solo en modo "custom" + "anejoC".',
    },
    fk_MPa: {
      type: ['number', 'null'],
      description: 'Resistencia característica f_k de la fábrica, en N/mm², introducida DIRECTAMENTE (ensayo, inspección o documentación de obra). Solo en modo "custom" + "manual".',
    },
    gamma_fabrica_kNm3: {
      type: ['number', 'null'],
      description: 'Peso específico de la fábrica, en kN/m³ (macizo ≈ 18, perforado ≈ 15, aligerado ≈ 14, hueco ≈ 12). Solo en modo "custom" (en modo "tabla" lo fija la pieza).',
    },
    gamma_M: {
      type: ['number', 'null'],
      description: 'Coeficiente parcial del material γ_M (Tabla 4.8: categoría de control I/II/III × clase de ejecución A/B → 1.7, 2.0, 2.2, 2.5, 3.0). En rehabilitación sin ensayos lo normal es 2.5.',
    },
    gamma_G: { type: ['number', 'null'], description: 'Coeficiente de mayoración de las acciones permanentes (ELU, DB-SE §4.2.4). Normalmente 1.35.' },
    gamma_Q: { type: ['number', 'null'], description: 'Coeficiente de mayoración de las acciones variables (ELU, DB-SE §4.2.4). Normalmente 1.5.' },
    L_m: { type: ['number', 'null'], description: 'Longitud total del muro, en METROS (medida de obra).' },
    t_cm: { type: ['number', 'null'], description: 'Espesor del muro, en CENTÍMETROS (medida de obra): medio pie ≈ 12 cm, un pie ≈ 24 cm, pie y medio ≈ 36 cm.' },
    warnings: { type: 'array', items: { type: 'string' }, description: 'Avisos: conversiones de unidades realizadas, ambigüedades, datos del enunciado ignorados.' },
  },
};

// ── Prompt del módulo ─────────────────────────────────────────────────────────

const PROMPT_RULES = `Reglas específicas del módulo Muros de fábrica (muro de carga EXISTENTE, DB-SE-F):
1. UNIDADES: L_m en METROS y t_cm en CENTÍMETROS (medio pie ≈ 12 cm, un pie ≈ 24 cm, pie y medio ≈ 36 cm); fb, fm y f_k en N/mm²; el peso específico γ en kN/m³. El estado interno guarda mm, pero tú escribes m y cm. Añade un warning con cada conversión que hagas.
2. EL MURO YA EXISTE: TODO lo que puedes escribir es un DATO, no una variable de diseño. El espesor (t_cm) y la longitud (L_m) son medidas de obra; la fábrica (pieza + fb + fm, o el f_k del ensayo) la fija la inspección. En este módulo NO hay ninguna variable de diseño libre: si el muro no cumple, la salida es una intervención real (recrecido o trasdosado, zunchado, redistribuir cargas a otro elemento, reducir la altura libre) y eso se EXPLICA en la respuesta, no se escribe en el formulario. Nunca subas f_k ni engordes t o L para que salga el cálculo: estarías firmando un muro que nadie ha vuelto a medir.
3. Las CARGAS son CARACTERÍSTICAS (sin mayorar): el motor mayora con q_d = γ_G·G_k + γ_Q·Q_k (DB-SE §4.2.4). Los coeficientes γ_M (Tabla 4.8: categoría de control × clase de ejecución), γ_G y γ_Q NUNCA se tocan para compensar un cálculo que no sale; γ_M solo baja si el usuario declara ensayos y control reales.
4. LAS PLANTAS SON DE SOLO LECTURA. En el estado ves "plantas" (altura, cargas del forjado, huecos y cargas puntuales de cada una) para poder explicar los resultados por planta y por machón, pero NO puedes modificarlas: no son campos de tu propuesta. Si el usuario quiere cambiar una planta, un hueco o una carga puntual, dile que lo haga en el panel izquierdo. Y si "plantas_por_defecto" es true, lo que ves es una PLANTILLA de la aplicación (alturas y cargas inventadas), NO datos del usuario: pregúntaselos antes de dar ningún veredicto por bueno.
5. Tabla 4.4: la pieza, fb y fm van SIEMPRE juntos — los pares válidos son fb=5 → fm 2.5 o 5; fb=10 → 5 o 7.5; fb=15 → 7.5 o 10; fb=20 → 10 o 15; fb=25 → 15. Con la pieza "macizo_junta_delgada" NO existe fb=5. Una combinación que no esté en la tabla deja el módulo en "Datos no válidos", así que la terna se aplica entera o no se aplica.
6. MODOS: si el usuario tiene un ENSAYO con f_k, usa fabrica_modo="custom" + custom_method="manual" + fk_MPa. Si la fábrica es antigua y no encaja en la tabla, "custom" + "anejoC" (tipo de muro + fb + fm; la eq. C.1 limita fm a min(20, 0.75·fb)). Si encaja en la tabla, "tabla". Solo se aplican los campos del modo ACTIVO: el resto se descartan con motivo.
7. λ ≤ ${MASONRY_LAMBDA_MAX} es un límite ABSOLUTO de esbeltez (§5.2.4): si una sola planta lo supera, el edificio INCUMPLE aunque todos los η estén por debajo de 1.
8. ALCANCE: el módulo solo comprueba solicitaciones VERTICALES (compresión excéntrica + pandeo + concentración bajo apoyo). NO comprueba viento sobre fachada, sismo, empuje del terreno, cortante en el plano ni vuelco del conjunto. Dilo si el usuario pregunta por ellos.`;

const PLACEHOLDER_EXAMPLE =
  'Ej.: Muro de carga existente de ladrillo macizo, un pie (24 cm) y 6 m de largo, '
  + 'en un edificio de 4 plantas. Fábrica ensayada con f_k = 4 N/mm² y control normal.';

// ── Parseo defensivo del payload ──────────────────────────────────────────────

interface MasonryPayload {
  fabrica_modo: string | null;
  pieza: string | null;
  fb_MPa: number | null;
  fm_MPa: number | null;
  custom_method: string | null;
  anejoC_tipo_muro: string | null;
  anejoC_fb_MPa: number | null;
  anejoC_fm_MPa: number | null;
  fk_MPa: number | null;
  gamma_fabrica_kNm3: number | null;
  gamma_M: number | null;
  gamma_G: number | null;
  gamma_Q: number | null;
  L_m: number | null;
  t_cm: number | null;
  warnings: string[];
}

function finiteNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function str(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function parsePayload(raw: unknown): MasonryPayload {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new AiError('bad-response', 'La propuesta del modelo no es un objeto JSON.');
  }
  const r = raw as Record<string, unknown>;
  return {
    fabrica_modo: str(r.fabrica_modo),
    pieza: str(r.pieza),
    fb_MPa: finiteNumber(r.fb_MPa),
    fm_MPa: finiteNumber(r.fm_MPa),
    custom_method: str(r.custom_method),
    anejoC_tipo_muro: str(r.anejoC_tipo_muro),
    anejoC_fb_MPa: finiteNumber(r.anejoC_fb_MPa),
    anejoC_fm_MPa: finiteNumber(r.anejoC_fm_MPa),
    fk_MPa: finiteNumber(r.fk_MPa),
    gamma_fabrica_kNm3: finiteNumber(r.gamma_fabrica_kNm3),
    gamma_M: finiteNumber(r.gamma_M),
    gamma_G: finiteNumber(r.gamma_G),
    gamma_Q: finiteNumber(r.gamma_Q),
    L_m: finiteNumber(r.L_m),
    t_cm: finiteNumber(r.t_cm),
    warnings: Array.isArray(r.warnings)
      ? r.warnings.filter((w): w is string => typeof w === 'string')
      : [],
  };
}

// ── Mapper payload → AiApplyPlan ─────────────────────────────────────────────

const LABELS = {
  fabrica_modo: 'Modo de la fábrica',
  pieza: 'Pieza (Tabla 4.4)',
  fb_MPa: 'fb · resistencia de la pieza',
  fm_MPa: 'fm · resistencia del mortero',
  custom_method: 'Método de f_k',
  anejoC_tipo_muro: 'Tipo de muro (Anejo C)',
  anejoC_fb_MPa: 'fb · Anejo C',
  anejoC_fm_MPa: 'fm · Anejo C',
  fk_MPa: 'f_k directo de la fábrica',
  gamma_fabrica_kNm3: 'γ · peso específico de la fábrica',
  gamma_M: 'γ_M · coef. del material',
  gamma_G: 'γ_G · mayoración permanentes',
  gamma_Q: 'γ_Q · mayoración variables',
  L_m: 'L · longitud del muro',
  t_cm: 't · espesor del muro',
} as const;

type PayloadKey = keyof typeof LABELS;

const KEY_ORDER: readonly PayloadKey[] = [
  'fabrica_modo', 'pieza', 'fb_MPa', 'fm_MPa',
  'custom_method', 'anejoC_tipo_muro', 'anejoC_fb_MPa', 'anejoC_fm_MPa', 'fk_MPa',
  'gamma_fabrica_kNm3', 'gamma_M', 'gamma_G', 'gamma_Q', 'L_m', 't_cm',
];

const ALREADY = 'Ya coincide con el valor actual';
const EPS = 1e-9;

export const TABLA_INERT_REASON =
  'La fábrica está en modo Tabla 4.4: este campo pertenece al modo Personalizada y no se aplica.';
export const CUSTOM_INERT_REASON =
  'La fábrica está en modo Personalizada: la terna de Tabla 4.4 (pieza, fb, fm) no se aplica.';
export const ANEJO_C_INERT_REASON =
  'La fábrica personalizada usa f_k directo: los datos del Anejo C (tipo de muro, fb, fm) no se aplican.';
export const MANUAL_INERT_REASON =
  'La fábrica personalizada se calcula por el Anejo C: el f_k directo no se aplica.';

/**
 * Reglas de seguridad ESCALARES. La resistencia de la fábrica NO está aquí: la
 * cubre `fabricaRisks` sobre la fábrica resuelta (ver cabecera).
 *
 * t y L llevan `lowerIsSafer` — la regla INVERTIDA de la rehabilitación (2º caso,
 * tras bc/hc de empresillado): son medidas de obra, así que aquí lo peligroso es
 * AGRANDARLAS. Van SIN `alwaysCheck` a propósito: con t en su valor de fábrica
 * (240 mm) el gate anti-ruido se traga la primera subida, que es justo cuando el
 * usuario está aportando el dato de su muro.
 *
 * Los tres γ, en cambio, SÍ llevan `alwaysCheck`: un coeficiente parcial nunca es
 * "un dato que el usuario rellena" (no hay primer relleno legítimo de γ_G = 1.0),
 * así que el gate anti-ruido no debe protegerlos.
 */
export const MASONRY_SAFETY_RULES: ReadonlyArray<SafetyRule<MasonryWallState>> = [
  {
    field: 't',
    confirmKey: 't_cm',
    level: lowerIsSafer, // rehabilitación: lo peligroso es AGRANDAR lo existente
    why: 'El muro es EXISTENTE: t es una medida de obra, no una variable de diseño. Engordarlo sube el axil resistente (N_Rd = Φ·f_d·ancho·t), baja la esbeltez (λ = h_ef/t) y alivia la concentración bajo apoyo — arregla las TRES comprobaciones de una sola escritura, sin que nadie haya vuelto a medir el muro.',
  },
  {
    field: 'L',
    confirmKey: 'L_m',
    level: lowerIsSafer,
    why: 'El muro es EXISTENTE: L es una medida de obra. Alargarlo (con los huecos donde están) ensancha los machones y diluye en ellos las cargas puntuales y las reacciones de los dinteles.',
  },
  {
    field: 'gamma_M',
    level: higherIsSafer,
    alwaysCheck: true,
    why: 'γ_M sale de la Tabla 4.8 (categoría de control × clase de ejecución). Bajarlo sube f_d = f_k/γ_M sin tocar el muro; en rehabilitación sin ensayos el valor que corresponde es 2.5.',
  },
  {
    field: 'gamma_G',
    level: higherIsSafer,
    alwaysCheck: true,
    why: 'γ_G es el coeficiente de mayoración de las acciones permanentes (DB-SE §4.2.4): bajarlo rebaja toda la demanda del muro de golpe.',
  },
  {
    field: 'gamma_Q',
    level: higherIsSafer,
    alwaysCheck: true,
    why: 'γ_Q es el coeficiente de mayoración de las acciones variables (DB-SE §4.2.4): bajarlo rebaja toda la demanda del muro de golpe.',
  },
];

/** Campos que caracterizan la fábrica — el gate anti-ruido del riesgo sintético. */
const FABRICA_FIELDS: ReadonlyArray<keyof MasonryWallState> = [
  'fabricaModo', 'pieza', 'fb', 'fm', 'customMethod',
  'anejoC_tipoMuro', 'anejoC_fb', 'anejoC_fm', 'fk_custom', 'gamma_custom',
];

/** Las mismas, en el espacio de claves del PAYLOAD (memoria del hilo). */
const FABRICA_PAYLOAD_KEYS: readonly string[] = [
  'fabrica_modo', 'pieza', 'fb_MPa', 'fm_MPa', 'custom_method',
  'anejoC_tipo_muro', 'anejoC_fb_MPa', 'anejoC_fm_MPa', 'fk_MPa', 'gamma_fabrica_kNm3',
];

/**
 * Riesgo sintético sobre la fábrica RESUELTA: compara `resolverFabrica` del
 * estado vigente con la del estado FINAL (vigente + propuesta de este turno).
 *
 * Cubre de una vez todos los caminos por los que la IA podría "mejorar" una
 * fábrica existente —fb, fm, pieza, modo, método, f_k directo, Anejo C— y no
 * marca los cambios que no mueven f_k (subir fm de 5 a 7.5 con fb=10 y ladrillo
 * macizo deja f_k = 4: no hay nada que avisar).
 *
 * Gate anti-ruido propio, en el espíritu de `detectSafetyRisks` (y con las MISMAS
 * dos vías de "establecido", ver safety.ts): solo dispara si alguien YA caracterizó
 * la fábrica —algún campo distinto del de fábrica, o alguna clave de fábrica ya
 * tratada en un turno anterior del hilo— o si la propuesta cambia de modo/método,
 * que nunca es "rellenar el formulario": reinterpreta el cálculo entero.
 */
function fabricaRisks(
  fields: Partial<MasonryWallState>,
  current: MasonryWallState,
  system: UnitSystem,
  confirmed: ReadonlySet<string>,
): AiSafetyRisk[] {
  const cambiaModo = fields.fabricaModo !== undefined || fields.customMethod !== undefined;
  const caracterizada =
    FABRICA_FIELDS.some((k) => current[k] !== MASONRY_DEFAULTS[k]) ||
    FABRICA_PAYLOAD_KEYS.some((k) => confirmed.has(k));
  if (!cambiaModo && !caracterizada) return [];

  const antes = resolverFabrica(current);
  const despues = resolverFabrica({ ...current, ...fields });
  const risks: AiSafetyRisk[] = [];

  // Un f_k inválido no es línea base (ese camino es un skip, no un riesgo).
  if (antes.fk != null && despues.fk != null && despues.fk > antes.fk + EPS) {
    risks.push({
      field: 'fk_fabrica',
      label: 'Resistencia de la fábrica f_k',
      before: formatQuantity(antes.fk, 'stress', system),
      after: formatQuantity(despues.fk, 'stress', system),
      why: 'La fábrica es EXISTENTE: su resistencia la fija el ensayo o la inspección, no el cálculo. Subir f_k (por la pieza, por fb/fm, por el modo o por el f_k directo) sube f_d = f_k/γ_M y hace "cumplir" el muro sin tocarlo.',
    });
  }
  if (despues.gamma < antes.gamma - EPS) {
    risks.push({
      field: 'gamma_fabrica',
      label: 'Peso específico de la fábrica γ',
      before: formatQuantity(antes.gamma, 'weightDensity', system),
      after: formatQuantity(despues.gamma, 'weightDensity', system),
      why: 'El peso específico de la fábrica es DEMANDA: el peso propio del muro se suma al axil en el pie de cada machón. Aligerarlo descarga el muro sin que nadie haya cambiado la fábrica.',
    });
  }
  return risks;
}

function rangeReason(value: number, min: number, max: number, unit: string): string {
  const u = unit === '' ? '' : ` ${unit}`;
  return `Valor ${value}${u} fuera del rango admisible ${min}–${max}${u}`;
}

/** Motivo de la terna rota: dice exactamente qué celdas SÍ existen. */
function ternaReason(pieza: PiezaTipo, fb: number, fm: number): string {
  const label = TABLA_4_4[pieza].label;
  const fms = fmValidosPara(pieza, fb);
  const detalle = fms.length === 0
    ? `Tabla 4.4 no tiene NINGUNA celda para ${label} con fb = ${fb} N/mm² (fb válidos: ${fbValidosPara(pieza).join(', ')})`
    : `Tabla 4.4 no tiene celda para ${label} con fb = ${fb} y fm = ${fm} N/mm² (fm válidos con ese fb: ${fms.join(', ')})`;
  return `${detalle}. La terna pieza + fb + fm se aplica entera o no se aplica: media terna dejaría el cálculo sin f_k.`;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

function buildMasonryPlan(
  x: MasonryPayload,
  current: MasonryWallState,
  system: UnitSystem,
  confirmed: ReadonlySet<string> = new Set(),
): AiApplyPlan<MasonryWallState> {
  const fields: Partial<MasonryWallState> = {};
  const changes: AiFieldChange[] = [];
  const skipped: AiSkippedField[] = [];
  const warnings: string[] = [...x.warnings];
  const handled = new Set<PayloadKey>();

  function skip(key: PayloadKey, reason: string): void {
    handled.add(key);
    skipped.push({ label: LABELS[key], reason });
  }

  function apply<K extends keyof MasonryWallState>(
    key: PayloadKey,
    field: K,
    value: MasonryWallState[K],
    before: string,
    after: string,
  ): void {
    handled.add(key);
    fields[field] = value;
    changes.push({ field, label: LABELS[key], before, after });
  }

  const fmtStress = (v: number) => formatQuantity(v, 'stress', system);

  /** Numérico continuo con rango: fuera → skip; igual al vigente → skip; si no, apply. */
  function applyNumber<K extends keyof MasonryWallState>(
    key: PayloadKey,
    field: K & ('anejoC_fb' | 'anejoC_fm' | 'fk_custom' | 'gamma_M' | 'gamma_G' | 'gamma_Q'),
    value: number | null,
    min: number,
    max: number,
    unit: string,
    fmt: (v: number) => string,
  ): void {
    if (value === null) return;
    if (value < min || value > max) {
      skip(key, rangeReason(value, min, max, unit));
      return;
    }
    const v = round2(value);
    const before = current[field] as number;
    if (Math.abs(v - before) <= EPS) skip(key, ALREADY);
    else apply(key, field, v as MasonryWallState[K], fmt(before), fmt(v));
  }

  // ── 1. Modo de la fábrica (gate raíz) ──────────────────────────────────────
  if (x.fabrica_modo !== null) {
    if (!MODOS.includes(x.fabrica_modo as FabricaModo)) {
      skip('fabrica_modo', `Modo "${x.fabrica_modo}" desconocido (tabla, custom)`);
    } else if (x.fabrica_modo === current.fabricaModo) {
      skip('fabrica_modo', ALREADY);
    } else {
      const m = x.fabrica_modo as FabricaModo;
      apply('fabrica_modo', 'fabricaModo', m, MODO_LABEL[current.fabricaModo], MODO_LABEL[m]);
    }
  }
  const modoFinal = (fields.fabricaModo ?? current.fabricaModo) as FabricaModo;
  const esTabla = modoFinal === 'tabla';

  // ── 2. Sub-modo de la fábrica personalizada (gate anidado) ─────────────────
  if (x.custom_method !== null) {
    if (esTabla) {
      skip('custom_method', TABLA_INERT_REASON);
    } else if (!METHODS.includes(x.custom_method as CustomMethod)) {
      skip('custom_method', `Método "${x.custom_method}" desconocido (anejoC, manual)`);
    } else if (x.custom_method === methodOf(current)) {
      skip('custom_method', ALREADY);
    } else {
      const m = x.custom_method as CustomMethod;
      apply('custom_method', 'customMethod', m, METHOD_LABEL[methodOf(current)], METHOD_LABEL[m]);
    }
  }
  const methodFinal = methodOf({ customMethod: fields.customMethod ?? current.customMethod });
  const esAnejoC = !esTabla && methodFinal === 'anejoC';
  const esManual = !esTabla && methodFinal === 'manual';

  // ── 3. Terna de Tabla 4.4: se aplica ENTERA o no se aplica ─────────────────
  if (!esTabla) {
    if (x.pieza !== null) skip('pieza', CUSTOM_INERT_REASON);
    if (x.fb_MPa !== null) skip('fb_MPa', CUSTOM_INERT_REASON);
    if (x.fm_MPa !== null) skip('fm_MPa', CUSTOM_INERT_REASON);
  } else {
    let piezaProp: PiezaTipo | null = null;
    if (x.pieza !== null) {
      if (!PIEZAS.includes(x.pieza as PiezaTipo)) {
        skip('pieza', `La pieza "${x.pieza}" no está en el catálogo de Tabla 4.4 (${PIEZAS.join(', ')})`);
      } else {
        piezaProp = x.pieza as PiezaTipo;
      }
    }
    let fbProp: number | null = null;
    if (x.fb_MPa !== null) {
      if (!FB_VALUES.includes(x.fb_MPa as (typeof FB_VALUES)[number])) {
        skip('fb_MPa', `fb = ${x.fb_MPa} N/mm² no está tabulado en Tabla 4.4 (${FB_VALUES.join(', ')})`);
      } else {
        fbProp = x.fb_MPa;
      }
    }
    let fmProp: number | null = null;
    if (x.fm_MPa !== null) {
      if (!FM_VALUES.includes(x.fm_MPa as (typeof FM_VALUES)[number])) {
        skip('fm_MPa', `fm = ${x.fm_MPa} N/mm² no está tabulado en Tabla 4.4 (${FM_VALUES.join(', ')})`);
      } else {
        fmProp = x.fm_MPa;
      }
    }

    const piezaFinal = piezaProp ?? current.pieza;
    const fbFinal = fbProp ?? current.fb;
    const fmFinal = fmProp ?? current.fm;

    if (lookupFk(piezaFinal, fbFinal, fmFinal) == null) {
      const reason = ternaReason(piezaFinal, fbFinal, fmFinal);
      if (piezaProp !== null) skip('pieza', reason);
      if (fbProp !== null) skip('fb_MPa', reason);
      if (fmProp !== null) skip('fm_MPa', reason);
    } else {
      if (piezaProp !== null) {
        if (piezaProp === current.pieza) skip('pieza', ALREADY);
        else apply('pieza', 'pieza', piezaProp, TABLA_4_4[current.pieza].label, TABLA_4_4[piezaProp].label);
      }
      if (fbProp !== null) {
        if (Math.abs(fbProp - current.fb) <= EPS) skip('fb_MPa', ALREADY);
        else apply('fb_MPa', 'fb', fbProp, fmtStress(current.fb), fmtStress(fbProp));
      }
      if (fmProp !== null) {
        if (Math.abs(fmProp - current.fm) <= EPS) skip('fm_MPa', ALREADY);
        else apply('fm_MPa', 'fm', fmProp, fmtStress(current.fm), fmtStress(fmProp));
      }
    }
  }

  // ── 4. Anejo C — tipo de muro (patch atómico con el γ estimado) ────────────
  const anejoCInert = esTabla ? TABLA_INERT_REASON : ANEJO_C_INERT_REASON;
  if (x.anejoC_tipo_muro !== null) {
    if (!esAnejoC) {
      skip('anejoC_tipo_muro', anejoCInert);
    } else if (!TIPOS_MURO.includes(x.anejoC_tipo_muro as TipoMuroAnejoC)) {
      skip('anejoC_tipo_muro', `El tipo de muro "${x.anejoC_tipo_muro}" no está en el catálogo del Anejo C (${TIPOS_MURO.join(', ')})`);
    } else if (x.anejoC_tipo_muro === current.anejoC_tipoMuro) {
      skip('anejoC_tipo_muro', ALREADY);
    } else {
      const t = x.anejoC_tipo_muro as TipoMuroAnejoC;
      const patch = tipoMuroPatch(current, t);
      apply(
        'anejoC_tipo_muro', 'anejoC_tipoMuro', t,
        TIPO_MURO_LABELS_SHORT[current.anejoC_tipoMuro], TIPO_MURO_LABELS_SHORT[t],
      );
      // El γ re-estimado y el flag van a `fields` SIN fila propia (patrón de los
      // campos derivados): el aviso es lo que los hace visibles al usuario.
      fields.gamma_custom = patch.gamma_custom;
      fields.gamma_custom_edited = patch.gamma_custom_edited;
      if (!current.gamma_custom_edited && patch.gamma_custom !== current.gamma_custom) {
        warnings.push(
          `El tipo de muro re-estima el peso específico de la fábrica: γ = ${GAMMA_ESTIMADO[t]} kN/m³ `
          + '(cámbialo si lo has medido en obra).',
        );
      }
    }
  }
  if (esAnejoC) {
    applyNumber('anejoC_fb_MPa', 'anejoC_fb', x.anejoC_fb_MPa, 0.5, 100, 'N/mm²', fmtStress);
    applyNumber('anejoC_fm_MPa', 'anejoC_fm', x.anejoC_fm_MPa, 0.5, 40, 'N/mm²', fmtStress);
    // Tope de la eq. C.1 sobre el estado FINAL: fm ≤ min(20, 0.75·fb). El motor
    // lo aplica solo; aquí lo hacemos VISIBLE en vez de dejar que el usuario vea
    // un f_k que no cuadra con el fm que pidió.
    const fbFin = (fields.anejoC_fb ?? current.anejoC_fb) as number;
    const fmFin = (fields.anejoC_fm ?? current.anejoC_fm) as number;
    const capped = calcFkAnejoC(
      (fields.anejoC_tipoMuro ?? current.anejoC_tipoMuro) as TipoMuroAnejoC, fbFin, fmFin,
    );
    if (capped.capped && (fields.anejoC_fm !== undefined || fields.anejoC_fb !== undefined)) {
      warnings.push(
        `La eq. C.1 limita el mortero a fm ≤ min(20, 0.75·fb): con fb = ${fbFin} N/mm², `
        + `el fm de ${capped.fmInput} se aplica como ${capped.fmApplied} N/mm².`,
      );
    }
  } else {
    if (x.anejoC_fb_MPa !== null) skip('anejoC_fb_MPa', anejoCInert);
    if (x.anejoC_fm_MPa !== null) skip('anejoC_fm_MPa', anejoCInert);
  }

  // ── 5. f_k directo (solo modo Personalizada · manual) ──────────────────────
  if (esManual) {
    applyNumber('fk_MPa', 'fk_custom', x.fk_MPa, 0.5, 30, 'N/mm²', fmtStress);
  } else if (x.fk_MPa !== null) {
    skip('fk_MPa', esTabla ? TABLA_INERT_REASON : MANUAL_INERT_REASON);
  }

  // ── 6. γ de la fábrica (solo Personalizada; marca el flag `edited`) ────────
  if (x.gamma_fabrica_kNm3 !== null) {
    if (esTabla) {
      skip('gamma_fabrica_kNm3', 'En modo Tabla 4.4 el peso específico lo fija la pieza: no se puede escribir.');
    } else if (x.gamma_fabrica_kNm3 < 5 || x.gamma_fabrica_kNm3 > 30) {
      skip('gamma_fabrica_kNm3', rangeReason(x.gamma_fabrica_kNm3, 5, 30, 'kN/m³'));
    } else {
      const v = round2(x.gamma_fabrica_kNm3);
      // El γ que el patch del tipo de muro pueda haber dejado en `fields` NO
      // cuenta como "vigente": si el modelo lo declara explícitamente, gana él
      // (y con el flag `edited`, para que nadie lo vuelva a re-estimar).
      const pendiente = fields.gamma_custom;
      const igualAlVigente = Math.abs(v - current.gamma_custom) <= EPS;
      const pisariaElPatch = pendiente !== undefined && Math.abs(pendiente - v) > EPS;
      if (igualAlVigente && !pisariaElPatch) {
        skip('gamma_fabrica_kNm3', ALREADY);
      } else {
        const patch = gammaCustomPatch(v);
        fields.gamma_custom_edited = patch.gamma_custom_edited;
        apply(
          'gamma_fabrica_kNm3', 'gamma_custom', patch.gamma_custom,
          formatQuantity(current.gamma_custom, 'weightDensity', system),
          formatQuantity(v, 'weightDensity', system),
        );
      }
    }
  }

  // ── 7. Coeficientes parciales ─────────────────────────────────────────────
  const fmtCoef = (v: number) => v.toFixed(2);
  applyNumber('gamma_M', 'gamma_M', x.gamma_M, 1.0, 4.0, '', fmtCoef);
  applyNumber('gamma_G', 'gamma_G', x.gamma_G, 1.0, 2.0, '', fmtCoef);
  applyNumber('gamma_Q', 'gamma_Q', x.gamma_Q, 1.0, 2.0, '', fmtCoef);

  // ── 8. Geometría global (payload en m/cm, estado en mm) ───────────────────
  // Las longitudes no se convierten de sistema (siempre métricas): sin Quantity.
  const fmtLen = (mm: number) => `${(mm / 1000).toFixed(2)} m`;
  if (x.L_m !== null) {
    if (x.L_m < 0.2 || x.L_m > 100) {
      skip('L_m', rangeReason(x.L_m, 0.2, 100, 'm'));
    } else {
      const mm = Math.round(x.L_m * 1000);
      if (mm === current.L) skip('L_m', ALREADY);
      else apply('L_m', 'L', mm, fmtLen(current.L), fmtLen(mm));
    }
  }
  if (x.t_cm !== null) {
    if (x.t_cm < 5 || x.t_cm > 200) {
      skip('t_cm', rangeReason(x.t_cm, 5, 200, 'cm'));
    } else {
      const mm = Math.round(x.t_cm * 10);
      if (mm === current.t) skip('t_cm', ALREADY);
      else apply('t_cm', 't', mm, `${(current.t / 10).toFixed(1)} cm`, `${(mm / 10).toFixed(1)} cm`);
    }
  }

  // ── notFound ──────────────────────────────────────────────────────────────
  const values: Record<PayloadKey, unknown> = {
    fabrica_modo: x.fabrica_modo, pieza: x.pieza, fb_MPa: x.fb_MPa, fm_MPa: x.fm_MPa,
    custom_method: x.custom_method, anejoC_tipo_muro: x.anejoC_tipo_muro,
    anejoC_fb_MPa: x.anejoC_fb_MPa, anejoC_fm_MPa: x.anejoC_fm_MPa, fk_MPa: x.fk_MPa,
    gamma_fabrica_kNm3: x.gamma_fabrica_kNm3,
    gamma_M: x.gamma_M, gamma_G: x.gamma_G, gamma_Q: x.gamma_Q,
    L_m: x.L_m, t_cm: x.t_cm,
  };
  const notFound: string[] = [];
  for (const key of KEY_ORDER) {
    if (values[key] === null && !handled.has(key)) notFound.push(LABELS[key]);
  }

  const risks = [
    ...detectSafetyRisks(
      MASONRY_SAFETY_RULES, changes, fields, current, MASONRY_DEFAULTS, confirmed,
    ),
    ...fabricaRisks(fields, current, system, confirmed),
  ];
  return { fields, changes, skipped, notFound, warnings, notes: null, risks };
}

// ── Snapshot del estado ───────────────────────────────────────────────────────

const SNAPSHOT_READ: Record<PayloadKey, (c: MasonryWallState) => number | string> = {
  fabrica_modo: (c) => c.fabricaModo,
  pieza: (c) => c.pieza,
  fb_MPa: (c) => c.fb,
  fm_MPa: (c) => c.fm,
  custom_method: (c) => methodOf(c),
  anejoC_tipo_muro: (c) => c.anejoC_tipoMuro,
  anejoC_fb_MPa: (c) => c.anejoC_fb,
  anejoC_fm_MPa: (c) => c.anejoC_fm,
  fk_MPa: (c) => c.fk_custom,
  gamma_fabrica_kNm3: (c) => c.gamma_custom,
  gamma_M: (c) => c.gamma_M,
  gamma_G: (c) => c.gamma_G,
  gamma_Q: (c) => c.gamma_Q,
  L_m: (c) => c.L / 1000,
  t_cm: (c) => c.t / 10,
};

/** Plantas → contexto de solo lectura, en unidades humanas y sin ids. */
function plantasContext(c: MasonryWallState): unknown[] {
  return c.plantas.map((p) => ({
    nombre: p.nombre,
    H_m: p.H / 1000,
    q_G_kN_m: p.q_G,
    q_Q_kN_m: p.q_Q,
    // e_apoyo ≤ 0 es el centinela "auto" del motor (deriva t/2 − a/3):
    // mandar el 0 literal haría creer al modelo que la reacción está
    // centrada. Se manda el valor RESUELTO + bandera, como plantas_por_defecto.
    e_apoyo_cm: (p.e_apoyo > 0 ? p.e_apoyo : eApoyoForjado(c.t, p.a_apoyo)) / 10,
    ...(p.e_apoyo > 0 ? {} : { e_apoyo_auto: true }),
    a_apoyo_cm: p.a_apoyo / 10,
    ...(p.rho_n !== undefined ? { rho_n: p.rho_n } : {}),
    // Geometría vertical RESUELTA (`huecoGeom`): en un hueco 'pasante' el alto
    // lo manda la altura libre de la planta, no el `h` almacenado — mandar el
    // almacenado le haría creer al modelo que hay fábrica sobre el dintel.
    huecos: p.huecos.map((h) => {
      const g = huecoGeom(h, p.H);
      return {
        tipo: h.tipo, x_m: h.x / 1000, y_m: g.y / 1000, ancho_m: h.w / 1000, alto_m: g.h / 1000,
      };
    }),
    puntuales: p.puntuales.map((q) => ({
      x_m: q.x / 1000, P_G_kN: q.P_G, P_Q_kN: q.P_Q, b_apoyo_cm: q.b_apoyo / 10,
    })),
  }));
}

function buildSnapshot(c: MasonryWallState): string {
  const valores: Record<string, unknown> = {};
  const sinConfirmar: PayloadKey[] = [];
  for (const key of KEY_ORDER) {
    const read = SNAPSHOT_READ[key];
    valores[key] = read(c);
    if (read(c) === read(MASONRY_DEFAULTS)) sinConfirmar.push(key);
  }
  // Contexto de SOLO LECTURA. Dentro de `valores` porque `decorateSnapshot` se
  // queda únicamente con valores/sin_confirmar/pendientes_de_aplicar: una clave
  // hermana de primer nivel se perdería tras la primera propuesta del modelo.
  valores.plantas = plantasContext(c);
  valores.plantas_por_defecto = masonryPlantasSonDeFabrica(c);
  return JSON.stringify({ valores, sin_confirmar: sinConfirmar });
}

// ── Resumen de resultados para el prompt ─────────────────────────────────────

/**
 * Resume el `EdificioResult` (unión discriminada: el motor no devuelve `checks`).
 *
 * Discriminador de cálculo no válido: la rama `invalid` de la unión — que es el
 * `error != null` de este módulo (fábrica inviable, geometría degenerada, huecos
 * que se comen toda la planta), con su `fix` incorporado para que el modelo pueda
 * proponer la corrección concreta.
 *
 * Los checks salen de `masonryBuildingChecks`, NO de las filas del machón que
 * pinta el panel: la fila de pandeo del machón avisa en ámbar entre λ = 22 y 27,
 * donde el motor sigue diciendo CUMPLE, y solo mira la planta del machón crítico
 * (la planta esbelta puede ser otra). Con las filas del panel, el chat habría
 * contradicho al badge en los dos casos.
 */
export function summarizeMasonryResults(res: EdificioResult): AiResultsSummary {
  if (res.invalid) {
    const error = res.fix ? `${res.reason} — ${res.fix}` : res.reason;
    return summarizeCalcResults({ valid: false, error, checks: [] });
  }
  const plantas = res.plantas;
  const critico = getCriticoEdificio(plantas);
  if (critico === null) {
    return summarizeCalcResults({
      valid: false,
      error: 'El edificio no tiene ningún machón que comprobar.',
      checks: [],
    });
  }

  const extras: string[] = [
    `Machón crítico: ${critico.planta.nombre} / ${critico.id} `
      + `(ancho ${(critico.ancho / 10).toFixed(0)} cm) — η = ${(critico.etaMax * 100).toFixed(0)}%`,
    'η máximo por planta: '
      + [...plantas].reverse().map((pl) => {
        const eta = Math.max(...pl.machones.map((m) => m.etaMax));
        return `${pl.nombre} = ${(eta * 100).toFixed(0)}% (λ=${pl.lambda.toFixed(1)})`;
      }).join(' · '),
    `Resistencia de cálculo f_d = f_k/γ_M = ${plantas[0].f_d.toFixed(2)} N/mm² `
      + `· Φ del machón crítico = ${critico.Phi.toFixed(3)}`,
  ];

  // La banda 22–27 es un aviso de la PANTALLA, no del motor: va como extraLine,
  // nunca como CheckRow (volcaría el veredicto a ADVERTENCIA con el badge verde).
  const peor = plantaMasEsbelta(plantas);
  if (peor !== null && peor.lambda >= 22 && peor.lambda <= MASONRY_LAMBDA_MAX) {
    extras.push(
      `Aviso: λ máx = ${peor.lambda.toFixed(1)} (${peor.nombre}) — por debajo del límite `
      + `${MASONRY_LAMBDA_MAX}, así que NO cuenta para el veredicto, pero la pantalla la marca `
      + 'en ámbar: el muro está en la banda alta de esbeltez.',
    );
  }

  return summarizeCalcResults(
    { valid: true, checks: masonryBuildingChecks(plantas, critico) },
    extras,
  );
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export const masonryWallsAdapter: AiModuleAdapter<MasonryWallState> = {
  id: 'masonry-walls',
  label: 'Muros de fábrica',
  payloadSchema: MASONRY_PAYLOAD_SCHEMA,
  promptRules: PROMPT_RULES,
  placeholder: PLACEHOLDER_EXAMPLE,
  snapshot: buildSnapshot,
  buildPlan: (payload, current, system, confirmed) =>
    buildMasonryPlan(parsePayload(payload), current, system, confirmed),
};
