/**
 * Guardarraíles de seguridad del asistente IA — detección genérica de
 * propuestas que REDUCEN la seguridad del cálculo.
 *
 * Origen (2026-07-13): el asistente escribió la nieve de Málaga (0.20 kN/m²)
 * encima de la sobrecarga de mantenimiento (1.0) y MEd se quedó a la mitad. El
 * arreglo de entonces fue un guardarraíl determinista para `qk` en vigas. Esto
 * generaliza la lección a todos los módulos.
 *
 * PRINCIPIO — demanda/criterio vs resistencia:
 * - Los DATOS del problema (cargas, esfuerzos, luces, coeficiente de pandeo,
 *   propiedades del terreno) y los CRITERIOS (límite de flecha, recubrimiento,
 *   naturaleza de las cargas) los fija el proyecto, la normativa o el estudio
 *   geotécnico. NO son variables de diseño.
 * - La RESISTENCIA (sección, perfil, armado, material, tamaño de zapata) SÍ lo
 *   es: subirla es la forma legítima de hacer que un cálculo cumpla.
 * Un modelo al que se le pide "haz que cumpla" tiene un incentivo estructural a
 * tocar lo primero, que es más barato y sale igual de "verde". Este módulo
 * detecta esos cambios para que NUNCA se apliquen sin que el usuario los vea.
 *
 * NO BLOQUEA (decisión deliberada — los guardarraíles que rechazan se reservan
 * para contradicciones internas comprobables, como `qk` por debajo de la
 * sobrecarga de la categoría en vigor, en mapExtraction.ts): aquí solo se
 * MARCA. La ProposalCard pinta los riesgos en rojo y exige una confirmación
 * explícita antes de dejar aplicar.
 *
 * GATE ANTI-RUIDO: un riesgo solo salta si el valor vigente está ESTABLECIDO.
 * Bajar la carga permanente del default al aportar los datos reales del
 * problema es rellenar el formulario, no debilitarlo; bajarla DESPUÉS, sobre un
 * valor ya establecido, es exactamente el patrón del incidente. Sin este gate
 * el aviso saltaría en casi toda primera extracción y se volvería papel pintado.
 *
 * Un valor está establecido si se cumple CUALQUIERA de estas dos (misma
 * disyunción, exactamente, que decide si una clave sale de `sin_confirmar` en el
 * snapshot decorado — ver pendingSnapshot.ts):
 *   (a) difiere del de fábrica (`current[field] !== defaults[field]`): alguien lo tocó;
 *   (b) el modelo ya lo trató en un turno ANTERIOR de este hilo (`confirmed`).
 *
 * (b) es el arreglo de 2026-07-14 (auditoría, fuga 1). Sin él, el gate se
 * desarmaba justo cuando el valor REAL del usuario coincidía con el default —
 * y los defaults son, por diseño, los valores más comunes: un pilar existente
 * de 30×30 (empresillado), un muro de un pie (240 mm), β = 1.0 biarticulado,
 * ψ₂ = 0.3 de vivienda. El modelo podía engordar el pilar existente a 40×40 sin
 * una sola fila roja. La invariante que restaura: si el asistente considera el
 * valor establecido (no lo re-pregunta), rebajarlo ES un riesgo.
 *
 * `confirmed` viene del hilo (AiChatModal.confirmedKeysRef) y está en el espacio
 * de claves del PAYLOAD (`t_cm`), no del estado (`t`): de ahí `SafetyRule.confirmKey`.
 *
 * `alwaysCheck: true` desactiva el gate entero para los campos que reinterpretan
 * el cálculo aunque vengan del default (loadsAreFactored, los γ de fábrica).
 */

/** Un cambio propuesto que reduce la seguridad, listo para pintar. */
export interface AiSafetyRisk {
  field: string;
  label: string;
  before: string; // formateado (el de AiFieldChange — respeta el sistema de unidades)
  after: string;
  why: string; // por qué ese campo no es una variable de diseño libre
}

/**
 * Subconjunto estructural de AiFieldChange que necesita el detector (evita que
 * safety.ts dependa de modules/types.ts, que a su vez importa AiSafetyRisk).
 */
export interface SafetyChange {
  field: string;
  label: string;
  before: string;
  after: string;
}

/**
 * Regla de seguridad de un campo del ESTADO de un módulo.
 *
 * `level` traduce el valor a un "nivel de seguridad": MAYOR = más conservador.
 * El riesgo salta cuando el cambio BAJA el nivel — así una única comparación
 * (`level(después) < level(antes)`) cubre tanto los campos donde lo peligroso es
 * disminuir (cargas, β, recubrimiento) como aquellos donde lo peligroso es
 * aumentar (σadm, μ: se invierte el signo en su `level`) y los booleanos.
 * `level` devuelve null si el valor no es del tipo esperado (defensivo: sin
 * nivel no hay comparación posible y no se inventa un riesgo).
 */
export interface SafetyRule<TInputs> {
  field: keyof TInputs & string;
  level: (value: unknown) => number | null;
  why: string;
  /** Salta aunque el valor vigente sea el de fábrica (ver GATE ANTI-RUIDO). */
  alwaysCheck?: boolean;
  /**
   * Clave del PAYLOAD que confirma este campo del estado (`t` ← `t_cm`). Por
   * defecto, `field` (sirve cuando payload y estado usan el mismo nombre).
   * Es lo que se busca en `confirmed` para levantar el gate anti-ruido; un
   * `confirmKey` que no exista en el payloadSchema deja el gate cerrado para
   * siempre y el campo desprotegido — lo asserta safetyRuleContract.test.ts.
   */
  confirmKey?: string;
}

const EPS = 1e-9;

/** Sin memoria de hilo (tests unitarios, primer turno): nada confirmado. */
const NO_CONFIRMED: ReadonlySet<string> = new Set<string>();

/** Nivel = el propio valor: lo peligroso es DISMINUIRLO (cargas, esfuerzos, β, recubrimiento). */
export const higherIsSafer = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

/** Nivel = valor invertido: lo peligroso es AUMENTARLO (σadm del terreno, μ de rozamiento). */
export const lowerIsSafer = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? -value : null;

/**
 * Nivel = |valor|: lo peligroso es reducir la MAGNITUD, con independencia del
 * signo. Para los esfuerzos con signo significativo (los momentos de encepados
 * entran con signo en Navier): cambiar +50 por −50 no rebaja la demanda, pero
 * pasar de 50 a 5 sí. `higherIsSafer` marcaría lo primero y no lo segundo.
 */
export const magnitudeIsSafer = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? Math.abs(value) : null;

/**
 * Nivel de un booleano donde ACTIVARLO relaja el cálculo: false es el lado
 * seguro. Cubre el conmutador "sin mayorar / mayoradas" de zapatas (marcar unas
 * cargas de servicio como mayoradas hace que el motor deje de aplicarles γ y la
 * demanda de cálculo cae de golpe) y el `isSystem` de vigas de madera (activar
 * el tablero colaborante regala el bonus ksys = 1.10 de resistencia).
 */
export const falseIsSafer = (value: unknown): number | null =>
  typeof value === 'boolean' ? (value ? 0 : 1) : null;

/** Alias histórico de `falseIsSafer` — el `loadsAreFactored` de zapatas. */
export const unfactoredIsSafer = falseIsSafer;

/**
 * Nivel de un booleano donde DESACTIVARLO relaja el cálculo: true es el lado
 * seguro. Simétrico de `falseIsSafer`. Hoy: el `hasWater` de muros de contención
 * — apagar el nivel freático borra de golpe el empuje hidrostático sobre el
 * trasdós, que es la acción que suele gobernar el vuelco.
 */
export const trueIsSafer = (value: unknown): number | null =>
  typeof value === 'boolean' ? (value ? 1 : 0) : null;

/**
 * Nivel de un campo APAGABLE: el valor `off` (típicamente 0, o null/undefined)
 * no significa "el mínimo de la escala", significa que la comprobación DEJA DE
 * HACERSE. Le da el nivel más bajo posible (−∞) para que apagarlo sea siempre un
 * riesgo, y deja el resto de la escala a `rest`.
 *
 * FUGA 3 de la auditoría (2026-07-14): los centinelas geotécnicos. `su → 0` en
 * taludes borra la comprobación sin drenaje entera (`hasUndrained` = algún estrato
 * con su > 0, slope.ts:95) y en micropilotes quita el tope del fuste y la
 * penalización de pandeo. La regla vigente (`su: lowerIsSafer`) leía esa caída
 * como "más seguro" y no avisaba de nada.
 *
 * OJO — `su` NO es monótona: subirla infla el terreno (riesgo) y anularla borra la
 * comprobación (riesgo), pero bajarla de 50 a 30 kPa sí es conservador. Eso no cabe
 * en una sola función de nivel: hacen falta DOS reglas sobre el mismo campo
 * (`lowerIsSafer` + este centinela con su propia `key`). Como cada una solo dispara
 * en un sentido, nunca se doble-reportan.
 */
export const offIsUnsafe = (
  isOff: (value: unknown) => boolean,
  rest: (value: unknown) => number | null = higherIsSafer,
) =>
  (value: unknown): number | null =>
    isOff(value) ? Number.NEGATIVE_INFINITY : rest(value);

/**
 * El centinela OPUESTO: el valor `off` no apaga nada — significa SIN LÍMITE, y por
 * tanto el caso MÁS desfavorable (el más conservador para el cálculo): +∞.
 *
 * Los dos conviven en el mismo módulo y por eso conviene no confundirlos. En
 * taludes, `su = 0` APAGA la comprobación sin drenaje (−∞), mientras que
 * `length = 0` en una sobrecarga NO es "una banda de cero metros": es una banda
 * que llega HASTA EL LÍMITE del análisis (pyslopeAnalyze.ts:50), o sea la carga
 * máxima (+∞). Con el mismo helper para ambos, acortar la banda de 0 a 2 m se
 * leería como una SUBIDA de carga cuando es justo lo contrario.
 */
export const offIsUnbounded = (
  isOff: (value: unknown) => boolean,
  rest: (value: unknown) => number | null = higherIsSafer,
) =>
  (value: unknown): number | null =>
    isOff(value) ? Number.POSITIVE_INFINITY : rest(value);

/** El centinela más común: 0 (o ausente) es la posición especial. */
export const zeroIsOff = (value: unknown): boolean =>
  value === 0 || value === null || value === undefined;

/**
 * Nivel para ENUMS de string: cada valor mapea a un ordinal donde MAYOR = más
 * conservador (mismo contrato que el resto de levels). Valor fuera del mapa o
 * no-string → null (sin nivel, sin riesgo inventado).
 *
 * CUIDADO (fuga 2 de la auditoría): un valor del enum que falte en el mapa es una
 * PUERTA DE ESCAPE silenciosa — sin nivel no hay comparación y no hay riesgo. Si un
 * valor no puede tener nivel fijo porque lo decide OTRO campo (el `'custom'` que
 * delega en β o en ψ₂), la regla no puede ser un ordinal: tiene que mirar la
 * magnitud resuelta (detectResolvedRisks). safetyRuleContract.test.ts lo asserta
 * sobre los enums reales de los 17 payloads.
 */
export const ordinalLevel = (map: Readonly<Record<string, number>>) =>
  (value: unknown): number | null =>
    typeof value === 'string' ? (map[value] ?? null) : null;

/**
 * Riesgos de un plan: recorre los cambios propuestos y devuelve los que bajan
 * el nivel de seguridad de un campo con regla. Puro y determinista; el orden es
 * el de `changes` (el de la tabla del módulo).
 *
 * `changes` aporta las etiquetas y los valores YA formateados (sistema de
 * unidades incluido); la comparación se hace sobre los valores CRUDOS de
 * `fields` (propuesto) y `current` (vigente), nunca sobre el texto.
 */
// ── Riesgos en ARRAYS del estado (estratos, sobrecargas) ─────────────────────
//
// Ola 3 (2026-07-13): los payloads admiten arrays homogéneos de objetos planos
// con semántica de REEMPLAZO completo. La detección de riesgos escalar no
// llega dentro de un array, así que detectElementRisks compara el array
// propuesto con el vigente ELEMENTO A ELEMENTO (matching POSICIONAL: los ids
// se regeneran al aplicar y no sirven para emparejar) con reglas por
// propiedad. La dirección la fija cada módulo: en taludes subir c'/φ'/su es
// riesgo y bajar γ es riesgo (peso desestabilizador); en micropilotes TODO lo
// que mejora el terreno es riesgo, γ incluido (dirección OPUESTA).

/**
 * Regla de seguridad de una PROPIEDAD de los elementos de un array del estado.
 * Mismo contrato de `level` que SafetyRule (MAYOR = más conservador).
 */
export interface ElementSafetyRule<TElement> {
  field: keyof TElement & string;
  /** Etiqueta humana de la propiedad: "cohesión c'" → "Estrato 2 — cohesión c'". */
  label: string;
  level: (value: unknown) => number | null;
  why: string;
  /** Valor crudo (SI) → texto para before/after. Default: String(value). */
  format?: (value: unknown) => string;
  /**
   * Sufijo del id del riesgo (`strata[0].su_anulado`). Default: `field`.
   *
   * Existe para los CENTINELAS (fuga 3, auditoría 2026-07-14): hay campos cuyo
   * peligro NO es monótono y por tanto no cabe en una sola función de nivel.
   * `su` es el ejemplo: SUBIRLA infla la resistencia del terreno (riesgo), y
   * ANULARLA borra la comprobación sin drenaje entera (riesgo), pero bajarla de
   * 50 a 30 kPa es conservador. Son dos reglas sobre el mismo `field`, y sin un
   * id distinto colisionarían en la misma clave de la tarjeta.
   */
  key?: string;
}

/** Contexto de presentación del array (no depende del tipo de elemento). */
export interface ElementRiskContext {
  /** Clave del array en el estado ("strata", "loads", "soil") — prefijo de AiSafetyRisk.field. */
  field: string;
  /** Sustantivo singular, capitalizado ("Estrato", "Sobrecarga"). */
  itemLabel: string;
  /** Sustantivo plural para el riesgo agregado de eliminación ("Estratos"). */
  collectionLabel: string;
  /** Motivo del riesgo de ELIMINAR elementos. Ausente ⇒ eliminar no se marca. */
  removalWhy?: string;
  /** Claves excluidas de comparación y gate (se regeneran). Default: ['id']. */
  identityKeys?: readonly string[];
  /**
   * Clave del PAYLOAD que confirma este array. Default: `field` (los arrays sí
   * suelen llamarse igual en payload y estado: `strata`, `soil`, `loads`).
   * Mismo papel que SafetyRule.confirmKey: levanta el gate de fábrica cuando el
   * modelo ya propuso el array en un turno anterior del hilo — sin esto, un
   * terreno propuesto y NO aplicado en el turno 1 se puede "mejorar" en el
   * turno 2 contra unos defaults vírgenes, sin riesgo.
   */
  confirmKey?: string;
}

/** Igualdad superficial de dos elementos planos, ignorando las claves de identidad. */
function sameElementIgnoringIds(a: object, b: object, identityKeys: readonly string[]): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of identityKeys) keys.delete(k);
  for (const k of keys) {
    if (!Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) return false;
  }
  return true;
}

/**
 * Riesgos de un array propuesto que REEMPLAZA al vigente entero. Comparación
 * POSICIONAL elemento a elemento sobre el prefijo compartido `min(len)`:
 * riesgo si una propiedad con regla baja de nivel. Elementos AÑADIDOS
 * (propuesto más largo) nunca son riesgo; propuesto MÁS CORTO genera un único
 * riesgo agregado de eliminación si el módulo declara `removalWhy`.
 *
 * GATE ANTI-RUIDO (análogo al escalar): si el array vigente es EXACTAMENTE el
 * de fábrica (igualdad profunda, ids fuera), nadie lo fijó ⇒ la primera
 * propuesta es rellenar el terreno del problema, no debilitar uno establecido.
 *
 * `proposed === undefined` ⇒ el turno no toca este array ⇒ sin riesgos.
 */
export function detectElementRisks<TElement extends object>(
  rules: ReadonlyArray<ElementSafetyRule<TElement>>,
  proposed: readonly TElement[] | undefined,
  current: readonly TElement[],
  defaults: readonly TElement[],
  ctx: ElementRiskContext,
  confirmed: ReadonlySet<string> = NO_CONFIRMED,
): AiSafetyRisk[] {
  if (proposed === undefined) return [];

  const identityKeys = ctx.identityKeys ?? ['id'];
  const isFactory =
    current.length === defaults.length &&
    current.every((el, i) => sameElementIgnoringIds(el, defaults[i], identityKeys));
  // Array de fábrica Y sin tratar en el hilo ⇒ nadie lo fijó (ver GATE ANTI-RUIDO).
  if (isFactory && !confirmed.has(ctx.confirmKey ?? ctx.field)) return [];

  const risks: AiSafetyRisk[] = [];
  const shared = Math.min(current.length, proposed.length);

  for (let i = 0; i < shared; i++) {
    for (const rule of rules) {
      const before = (current[i] as Record<string, unknown>)[rule.field];
      const after = (proposed[i] as Record<string, unknown>)[rule.field];
      const levelBefore = rule.level(before);
      const levelAfter = rule.level(after);
      if (levelBefore === null || levelAfter === null) continue; // campo ausente / tipo raro
      if (levelAfter >= levelBefore - EPS) continue;             // igual o más seguro
      const fmt = rule.format ?? String;
      risks.push({
        field: `${ctx.field}[${i}].${rule.key ?? rule.field}`, // único ⇒ key estable en la tarjeta
        label: `${ctx.itemLabel} ${i + 1} — ${rule.label}`,
        before: fmt(before),
        after: fmt(after),
        why: rule.why,
      });
    }
  }

  if (ctx.removalWhy !== undefined && proposed.length < current.length) {
    risks.push({
      field: `${ctx.field}.__removed`,
      label: ctx.collectionLabel,
      before: String(current.length),
      after: String(proposed.length),
      why: ctx.removalWhy,
    });
  }

  return risks;
}

// ── Riesgos sobre una MAGNITUD RESUELTA ──────────────────────────────────────
//
// Fuga 2 de la auditoría (2026-07-14): `ordinalLevel` devuelve null fuera del mapa
// y detectSafetyRisks salta los niveles nulos, así que un valor de enum sin
// entrada es una PUERTA DE ESCAPE silenciosa. Se colaba por ella `'custom'`:
//   - `bcType: 'custom'` + `beta: 0.5` (pilares de acero y sección compuesta) →
//     parte la longitud de pandeo por dos, χ sube, el pilar "cumple".
//   - `loadType: 'custom'` + `psi2Custom: 0` (vigas de hormigón y de madera) →
//     Ms = |M_G + ψ₂·M_Q| pasa a |M_G| y la fisuración se desvanece.
//
// Y NO tiene arreglo dentro del ordinal: 'custom' no puede tener un nivel fijo
// porque su nivel LO DECIDE OTRO CAMPO. La comprobación correcta no es sobre el
// enum ni sobre el campo delegado, sino sobre la MAGNITUD que el motor acaba
// usando (β efectiva, ψ₂ efectivo): una sola regla que cubre las tres puertas
// —cambiar el enum, cambiar el campo delegado, o ambos a la vez— y que no puede
// doble-reportar porque sustituye a las reglas por campo, no se suma a ellas.
//
// Es el mismo patrón que estrenó muros de fábrica con f_k (`fabricaRisks`), que
// conserva su versión propia por tener dos magnitudes y una cláusula de cambio de
// modo. Las magnitudes de aquí son ADIMENSIONALES (β, ψ₂): sin sistema de unidades.

/** Regla sobre una magnitud que el motor RESUELVE a partir de varios campos. */
export interface ResolvedSafetyRule<TInputs> {
  /** Id del riesgo — clave estable de la tarjeta; no es un campo del estado. */
  id: string;
  label: string;
  /** Magnitud efectiva de un estado. null ⇒ sin línea base ⇒ sin riesgo. */
  resolve: (state: TInputs) => number | null;
  /** MAYOR = más conservador, igual que en SafetyRule. */
  level: (value: unknown) => number | null;
  format: (value: number) => string;
  why: string;
  /** Campos del estado que caracterizan la magnitud (gate: ¿la tocó alguien?). */
  fields: ReadonlyArray<keyof TInputs & string>;
  /** Las mismas, en claves de PAYLOAD (gate: ¿las trató el hilo?). */
  confirmKeys: readonly string[];
  /**
   * Salta aunque ningún campo se haya tocado (mismo papel que en SafetyRule).
   * Para las magnitudes que reinterpretan el cálculo entero desde el propio
   * default: el par (loadsAreFactored, γ) de zapatas — declarar mayoradas unas
   * cargas de servicio no tiene "primer relleno legítimo".
   */
  alwaysCheck?: boolean;
}

/**
 * Riesgos por caída de una magnitud resuelta entre el estado VIGENTE y el FINAL
 * (vigente + propuesta). Gate anti-ruido con las MISMAS dos vías que
 * detectSafetyRisks: la magnitud está establecida si algún campo que la
 * caracteriza difiere del default o si el hilo ya trató alguna de sus claves.
 *
 * No mira `changes`: por eso también atrapa los campos DERIVADOS, que se escriben
 * en `fields` sin fila (β re-estimada al cambiar de condición de apoyo).
 */
export function detectResolvedRisks<TInputs extends object>(
  rules: ReadonlyArray<ResolvedSafetyRule<TInputs>>,
  fields: Partial<TInputs>,
  current: TInputs,
  defaults: TInputs,
  confirmed: ReadonlySet<string> = NO_CONFIRMED,
): AiSafetyRisk[] {
  const risks: AiSafetyRisk[] = [];
  const final = { ...current, ...fields };
  for (const rule of rules) {
    const established =
      rule.fields.some((k) => current[k] !== defaults[k]) ||
      rule.confirmKeys.some((k) => confirmed.has(k));
    if (rule.alwaysCheck !== true && !established) continue;

    const before = rule.resolve(current);
    const after = rule.resolve(final);
    if (before === null || after === null) continue;
    const levelBefore = rule.level(before);
    const levelAfter = rule.level(after);
    if (levelBefore === null || levelAfter === null) continue;
    if (levelAfter >= levelBefore - EPS) continue; // igual o más seguro

    risks.push({
      field: rule.id,
      label: rule.label,
      before: rule.format(before),
      after: rule.format(after),
      why: rule.why,
    });
  }
  return risks;
}

export function detectSafetyRisks<TInputs extends object>(
  rules: ReadonlyArray<SafetyRule<TInputs>>,
  changes: readonly SafetyChange[],
  fields: Partial<TInputs>,
  current: TInputs,
  defaults: TInputs,
  confirmed: ReadonlySet<string> = NO_CONFIRMED,
): AiSafetyRisk[] {
  const risks: AiSafetyRisk[] = [];
  for (const change of changes) {
    const rule = rules.find((r) => r.field === change.field);
    if (rule === undefined) continue; // campo sin regla: diseño libre (perfil, armado, material…)

    const key = rule.field as keyof TInputs;
    const after = fields[key];
    if (after === undefined) continue; // cambio sin valor aplicable (defensivo)
    const before = current[key];

    // Gate anti-ruido: el valor vigente es el de fábrica Y el hilo no lo ha
    // tratado ⇒ nadie lo fijó ⇒ el usuario está aportando su dato, no
    // debilitando uno establecido.
    const established =
      before !== defaults[key] || confirmed.has(rule.confirmKey ?? rule.field);
    if (rule.alwaysCheck !== true && !established) continue;

    const levelBefore = rule.level(before);
    const levelAfter = rule.level(after);
    if (levelBefore === null || levelAfter === null) continue;
    if (levelAfter >= levelBefore - EPS) continue; // igual o más seguro: nada que avisar

    risks.push({
      field: change.field,
      label: change.label,
      before: change.before,
      after: change.after,
      why: rule.why,
    });
  }
  return risks;
}
