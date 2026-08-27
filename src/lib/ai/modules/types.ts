/**
 * Contrato de los adapters de módulo del asistente IA (Fase 1 — chat).
 * Cada módulo (steel-beams, rc-columns, isolated-footing) exporta un
 * `AiModuleAdapter<TInputs>` que encapsula su schema de payload, sus reglas
 * de prompt y el mapeo propuesta → plan de aplicación.
 */
import type { AiSafetyRisk } from '../safety';
import type { UnitSystem } from '../../units/types';

export type AiModuleId =
  | 'steel-beams'
  | 'rc-columns'
  | 'isolated-footing'
  | 'composite-section'
  | 'micropiles'
  | 'slope-stability'
  // Ola 1 — encaje directo (estado plano en useModuleState, motor {valid, error?, checks})
  | 'pile-cap'
  | 'timber-columns'
  | 'timber-beams'
  | 'steel-columns'
  | 'empresillado'
  | 'punching'
  // Ola 2 — planos con particularidades (doble sección, gates con patch atómico,
  // campos legacy sincronizados)
  | 'rc-beams'
  | 'forjados'
  | 'retaining-wall'
  | 'anchor-plate'
  // Ola 4 — modelo anidado: la IA solo propone los escalares globales; las
  // plantas (con huecos y puntuales) viajan al snapshot como contexto de lectura
  | 'masonry-walls'
  // Ola 5 — modelo estructural completo (FEM 1D): el payload es una PROYECCIÓN
  // plana de la tira colineal (vanos/apoyos/cargas) que buildPlan reconstruye
  // en un DesignModel; el armado y las rótulas viajan como contexto de lectura
  | 'fem-1d'
  // Ola 6 — topología LIBRE 2D (pórticos y cerchas): el payload es la
  // proyección plana del Fem2DModel completo con referencias por índice
  // 1-based; cargas en componentes CON SIGNO y cross-check con el solver real
  | 'fem-2d'
  // Ola 7 — NORMA con puertas de aplicabilidad. El payload es el subconjunto
  // más reducido de todos los adapters a propósito: quedan FUERA la
  // peligrosidad del emplazamiento (sale del IGN, no de la memoria del
  // modelo), las declaraciones del proyectista (las firma él) y el T_F
  // impuesto del art. 3.6.2.3.2. Ver la cabecera de `seismicNCSE02.ts`.
  | 'seismic-ncse02';

export interface AiFieldChange {
  field: string;      // clave de TInputs (string por varianza)
  label: string;
  before: string;     // formateado
  after: string;      // formateado
}

export interface AiSkippedField {
  /**
   * Clave del PAYLOAD a la que corresponde el skip (opcional). La usa
   * decorateSnapshot (pendingSnapshot.ts) para retirar de
   * `pendientes_de_aplicar` las claves cuyo skip es un RECHAZO (motivo
   * distinto de "Ya coincide con el valor actual") — sin ella el rechazo se
   * realimenta igualmente en `errores_propuesta_anterior`, pero la clave
   * seguiría presentándose como pendiente/acordada.
   */
  field?: string;
  label: string;
  reason: string;
}

export interface AiApplyPlan<TInputs> {
  fields: Partial<TInputs>;     // SI interno, listo para setField
  changes: AiFieldChange[];
  skipped: AiSkippedField[];
  notFound: string[];
  warnings: string[];
  notes?: string | null;        // steel lo rellena desde extraction.notes
  /**
   * Cambios propuestos que REDUCEN la seguridad del cálculo (rebajan una carga
   * o un esfuerzo, relajan un criterio, mejoran un dato del terreno…). Los
   * produce `detectSafetyRisks` (../safety) con la tabla de reglas del módulo;
   * la ProposalCard los pinta en rojo y exige confirmación explícita antes de
   * dejar aplicar. Es un campo REQUERIDO a propósito: obliga a todo módulo
   * nuevo a declarar sus reglas (aunque sea `[]`) en vez de quedar sin red.
   */
  risks: AiSafetyRisk[];
}

export interface AiModuleAdapter<TInputs> {
  id: AiModuleId;
  label: string;                                    // "Vigas de acero" — cabecera modal y prompt
  payloadSchema: Record<string, unknown>;           // JSON Schema canónico del payload de `proposal` (plano; se admiten arrays homogéneos de objetos planos con semántica de REEMPLAZO completo)
  promptRules: string;                              // bloque de reglas del módulo (se concatena al prompt base)
  placeholder: string;                              // enunciado de ejemplo del estado vacío del chat
  /**
   * Cómo se actualizan los resultados tras aplicar una propuesta.
   * 'auto' (default, ausente) — recálculo síncrono en render: valen las
   * CHAT_RESULTS_RULES de siempre. 'manual' — el cálculo lo lanza el usuario
   * (botón "Calcular", motor asíncrono — hoy taludes/Pyodide): el prompt usa
   * CHAT_RESULTS_RULES_MANUAL y el modelo debe pedir recalcular e interpretar
   * los bloques "SIN CALCULAR" / "AVISO: RESULTADOS DESACTUALIZADOS".
   */
  resultsRecalc?: 'auto' | 'manual';
  /**
   * Ventana de historial que viaja en cada request (nº de turnos
   * user+assistant; ausente ⇒ MAX_HISTORY_TURNS de chatHistory.ts). Los
   * módulos de entrevista LARGA (FEM: la geometría se confirma dato a dato,
   * a una pregunta por turno) piden una ventana mayor. Es un amortiguador,
   * no la memoria: lo durable sigue siendo la propuesta arrastrada en
   * `pendientes_de_aplicar` (regla CHECKPOINT de sus promptRules) — ninguna
   * ventana aguanta una entrevista suficientemente larga.
   */
  historyTurns?: number;
  /**
   * Estado del formulario → JSON `{"valores":{…},"sin_confirmar":[…]}`.
   * `valores`: claves del payloadSchema en unidades humanas.
   * `sin_confirmar`: claves que siguen con el valor por defecto del módulo (nadie
   * las ha tocado) — el prompt las trata como NO confirmadas por el usuario.
   */
  snapshot(current: TInputs): string;
  /**
   * `confirmed`: claves del PAYLOAD que el modelo ya trató en turnos ANTERIORES de
   * este hilo (AiChatModal.threadValuesRef pasado por `establishedKeys`). Levanta
   * el gate anti-ruido de los guardarraíles: un valor ya acordado en la
   * conversación está ESTABLECIDO aunque coincida con el default de fábrica, y
   * rebajarlo es un riesgo (ver safety.ts).
   *
   * Queda fuera UNA sola situación: que la tarjeta pendiente VIVA arrastre la clave
   * con el mismo valor que el hilo le dio la primera vez. Eso es la misma propuesta
   * re-planificada —la tarjeta se fusiona y el plan se rehace entero cada turno— y
   * marcarla convertía cada primera introducción en fila roja a partir del 2º
   * turno. En cambio, re-proponer ese valor SIN tarjeta viva sí entra: la anterior
   * se aplicó y el usuario ha podido corregir el formulario a mano.
   *
   * NO es el mismo conjunto que filtra `sin_confirmar`: ahí van todas las claves
   * tratadas, para no re-preguntar. Ausente ⇒ hilo virgen (tests unitarios, primer
   * turno).
   */
  buildPlan(
    payload: unknown,
    current: TInputs,
    system: UnitSystem,
    confirmed?: ReadonlySet<string>,
  ): AiApplyPlan<TInputs>;
}
