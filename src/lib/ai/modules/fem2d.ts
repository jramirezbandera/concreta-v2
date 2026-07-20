/**
 * Adapter del asistente IA para el módulo FEM 2D (pórticos y cerchas) — ola 6.
 *
 * Es el hermano 2D del adapter FEM 1D (femAnalysis.ts): el estado del módulo
 * es un `Fem2DModel` anidado (nudos/barras/apoyos/cargas) editado vía
 * `setModel` con historial de undo. A diferencia de la tira colineal del 1D,
 * aquí la topología es LIBRE, así que el payload es la proyección plana del
 * modelo completo con referencias por ÍNDICE 1-based sobre las propias listas:
 *
 *   payload { nudos, barras, apoyos, cargas, peso_propio } ←→ Fem2DModel
 *
 * - Cada lista es un REEMPLAZO completo (null = sin cambio). Los ids del
 *   lienzo se preservan POSICIONALMENTE (nudo k del payload conserva el id del
 *   nudo k actual; ídem barras) para que la selección y las etiquetas del
 *   canvas sobrevivan. Los ids nuevos se acuñan sobre el pool COMPARTIDO de
 *   nodos+barras+cargas (la Pratt usa 'b0'…'bn' como ids de NUDO — la misma
 *   trampa que nextFreeId de modelOps).
 * - SIGNOS (decisión D5 del modelo): las cargas van en componentes CON SIGNO
 *   en ejes del mundo (+y ARRIBA ⇒ gravedad = fy negativo) o locales de la
 *   barra ('local', p. ej. presión de viento ⊥ faldón). Aquí NO existe el
 *   convenio "positivo = hacia abajo" del payload 1D: con direcciones
 *   arbitrarias no sobrevive. El prompt insiste y mapCarga2D avisa si una
 *   carga G/Q/S llega con fy > 0 (ascendente inusual).
 * - Cross-check final con el SOLVER real (solveFem2D es síncrono y <5 ms,
 *   decisión D4): además de validateModel2DBasic caza mecanismos y apoyos
 *   insuficientes. Semántica applyGuard: solo un fallo NUEVO respecto al
 *   modelo vigente descarta la propuesta (con el mensaje exacto para que el
 *   modelo corrija al turno siguiente).
 * - ATOMICIDAD del bloque estructural (2026-07-20): un error de validación en
 *   una lista veta las cuatro — las posteriores se saltan "por dependencia" y
 *   las aplicadas se retiran con el motivo raíz. Sin esto, "nudos aplicados +
 *   barras rechazadas" llegaba al cross-check como candidato incoherente y se
 *   descartaba todo con ids internos ('Barra cs1: nodo t2 no existe')
 *   inaccionables. Además, un rol incompatible con el tipo ya NO tumba la
 *   lista: se COACCIONA al rol automático con aviso (el modelo llama 'cordon'
 *   a los cordones-biela de una celosía; el motor enruta bielas por
 *   elementType, el rol no cambia la comprobación). Ídem una carga de barra
 *   sobre una biela (2026-07-20): se reparte como cargas de nudo equivalentes
 *   (lumpBielaLoad) en vez de vetar el bloque — era el bucle sin salida del
 *   camino "descríbela con IA" (celosía + repartida sobre un cordón-biela).
 * - Fase B (2026-07-19): las rótulas se EDITAN por chat con `rotulas` por barra
 *   ('i'/'j'/'ambas'/'ninguna', RELATIVAS a nudo_i→nudo_j del propio payload —
 *   sin el mapeo oculto izquierda/derecha del 1D) y el arrastre posicional es
 *   consciente de la ORIENTACIÓN (reenviar una barra con los nudos invertidos
 *   mantiene la rótula en el mismo nudo físico). El resumen de resultados
 *   añade las reacciones por apoyo (envolvente ELU multi-principal).
 *   El rol admite 'auto' (inferencia geométrica ±10° → pilar, como el editor).
 * - El CHAT solo edita barras de ACERO (el límite duro de 16 uniones de
 *   Anthropic impide añadir los campos HA — o los de madera — al schema): una
 *   barra HA o de MADERA existente se conserva COMPLETA (sección + armado HA /
 *   timberSection, comprobada por sus motores) si no se toca su perfil; darle
 *   perfil/acero la convierte a acero con aviso. El hormigón y la madera se
 *   editan en el inspector del lienzo (contexto solo-lectura barras_ha /
 *   barras_madera en el snapshot).
 * - Patrón plantilla (masonry/FEM 1D): `modelo_de_plantilla` marca que lo que
 *   ve el modelo es una semilla de la app, no datos del usuario. Cualquier
 *   cambio estructural aplicado estampa `templateId: 'custom'` (la misma
 *   procedencia honesta que las ops del lienzo).
 */
import { AiError } from "../types";
import type {
  AiApplyPlan,
  AiFieldChange,
  AiModuleAdapter,
  AiSkippedField,
} from "./types";
import { summarizeCalcResults, type AiResultsSummary } from "../resultsSummary";
import {
  detectElementRisks,
  detectSafetyRisks,
  higherIsSafer,
  lowerIsSafer,
  magnitudeIsSafer,
  offIsUnbounded,
  ordinalLevel,
  trueIsSafer,
  zeroIsOff,
  type ElementSafetyRule,
  type SafetyRule,
} from "../safety";
import { toStatus, type CheckRow } from "../../calculations/types";
import { buildLcCombinations } from "../../frame-core/lcCombinations";
import { STEEL_CATALOG } from "../../frame-core/sections";
import type { Reaction2D } from "../../../features/fem2d/solver2d";
import {
  FEM2D_MAX_MEMBERS,
  FEM2D_MAX_NODES,
  MIN_MEMBER_LENGTH_M,
  type Fem2DLoad,
  type Fem2DMember,
  type Fem2DModel,
  type Fem2DNode,
  type Fem2DSupport,
  type LoadCase,
  type MemberRole,
  type ModelError,
  type Support2DType,
  type UseCategoryCode,
} from "../../../features/fem2d/types";
import {
  DEFAULT_STEEL_2D,
  MIN_NODE_SEPARATION_M,
  inferRole,
} from "../../../features/fem2d/modelOps";
import {
  solveFem2D,
  type Fem2DAnalysisResult,
} from "../../../features/fem2d/pipeline";
import { FEM2D_TEMPLATES } from "../../../features/fem2d/templates";

// ── Catálogos del módulo ──────────────────────────────────────────────────────

/**
 * Perfiles proponibles por chat: nombre humano → clave del catálogo compartido
 * frame-core. Derivado del catálogo REAL para que no pueda desactualizarse.
 * Incluye 'L 80×8' (a diferencia del 1D): las bielas de celosía lo usan y el
 * chequeo axil 2D lo soporta; en una viga-columna deja la flexión PENDIENTE
 * (contrato F1: un motor que no corre nunca compra un verde).
 */
const PERFIL_CATALOG: Record<string, string> = Object.fromEntries(
  Object.entries(STEEL_CATALOG).map(([key, p]) => [p.name, key]),
);
const PERFIL_NAMES = Object.keys(PERFIL_CATALOG);

const ACEROS = ["S275", "S355"] as const;
const TIPOS_BARRA = ["viga-columna", "biela"] as const;
type TipoBarra = (typeof TIPOS_BARRA)[number];
/** 'auto' = inferencia geométrica del editor (vertical ±10° → pilar, si no viga). */
const ROLES = [
  "auto",
  "pilar",
  "viga",
  "cordon",
  "diagonal",
  "montante",
] as const;
type RolName = (typeof ROLES)[number];
const ROLES_AXIALES: readonly MemberRole[] = ["diagonal", "montante"];
const ROLES_FLEXION: readonly MemberRole[] = ["pilar", "viga", "cordon"];
const APOYOS = ["articulado", "empotrado", "deslizante"] as const;
type ApoyoName = (typeof APOYOS)[number];
/** Rótulas relativas a la orientación nudo_i→nudo_j DEL PAYLOAD (explícita). */
const ROTULAS = ["ninguna", "i", "j", "ambas"] as const;
type RotulaName = (typeof ROTULAS)[number];
const CARGA_TIPOS = ["nudo", "repartida", "puntual_barra"] as const;
type CargaTipo2D = (typeof CARGA_TIPOS)[number];
const EJES = ["global", "local"] as const;
type EjesName = (typeof EJES)[number];
const HIPOTESIS = ["G", "Q", "W", "S", "E"] as const;
/** Sin 'custom' a propósito (misma decisión que el 1D): sería la puerta de escape del ordinal. */
const CATEGORIAS = [
  "A1",
  "A2",
  "B",
  "C1",
  "C2",
  "C3",
  "D1",
  "E1",
  "G1",
] as const;
type CategoriaName = (typeof CATEGORIAS)[number];

const APOYO_TO_SUPPORT: Record<ApoyoName, Support2DType> = {
  articulado: "pinned",
  empotrado: "fixed",
  deslizante: "roller",
};
const SUPPORT_TO_APOYO: Record<Support2DType, ApoyoName> = {
  pinned: "articulado",
  fixed: "empotrado",
  roller: "deslizante",
};

// ── Payload schema ────────────────────────────────────────────────────────────
// Presupuesto de uniones Anthropic: 5 (listas + peso_propio) + 6 (campos
// anulables de barras, rotulas incluida) + 4 (pos/desde/hasta/categoria_uso de
// cargas) = 15, más la unión de `proposal` del envelope = 16 = el límite EXACTO
// → Anthropic soportado (la frontera 16→200 está verificada en vivo: masonry).
// OJO: el próximo campo anulable expulsa al módulo de Anthropic — antes de
// añadir uno, quitar otro o degradar (exceedsAnthropicUnionLimit).

export const FEM2D_PAYLOAD_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["nudos", "barras", "apoyos", "cargas", "peso_propio", "warnings"],
  properties: {
    nudos: {
      type: ["array", "null"],
      description:
        'Lista COMPLETA de nudos (REEMPLAZA la actual entera; null = sin cambio). Coordenadas en METROS, ejes del mundo: +x derecha, +y ARRIBA. El nudo k de esta lista es el "nudo k" al que apuntan barras, apoyos y cargas (1-based). Conserva el ORDEN de los nudos existentes y añade los nuevos AL FINAL. Si cambias nudos, revisa también "barras" y "apoyos".',
      items: {
        type: "object",
        additionalProperties: false,
        required: ["x", "y"],
        properties: {
          x: {
            type: "number",
            description: "Coordenada x en metros (+x derecha).",
          },
          y: {
            type: "number",
            description:
              "Coordenada y en metros (+y ARRIBA; la base suele ser y=0).",
          },
        },
      },
    },
    barras: {
      type: ["array", "null"],
      description:
        "Lista COMPLETA de barras (REEMPLAZA la actual entera; null = sin cambio). La barra k conserva la identidad de la barra k actual (posicional): dentro de una barra, un campo null = conservar su valor actual (o el default si la barra es nueva). Conserva el orden y añade las nuevas al final.",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "nudo_i",
          "nudo_j",
          "tipo",
          "rol",
          "perfil",
          "acero",
          "correas_m",
          "rotulas",
        ],
        properties: {
          nudo_i: {
            type: "integer",
            description:
              "Nº de nudo inicial (1-based sobre la lista final de nudos).",
          },
          nudo_j: {
            type: "integer",
            description: "Nº de nudo final (1-based).",
          },
          tipo: {
            type: ["string", "null"],
            enum: [...TIPOS_BARRA, null],
            description:
              "viga-columna = axil + flexión (lo normal); biela = solo axil (celosías), biarticulada por formulación y SIN cargas en la barra. null = conservar (viga-columna en barras nuevas).",
          },
          rol: {
            type: ["string", "null"],
            enum: [...ROLES, null],
            description:
              'Dirige la comprobación: pilar → motor de pilares; viga/cordon → motor de vigas; diagonal/montante → axil (solo bielas). "auto" = deducir de la geometría (vertical ±10° → pilar, si no viga). null = conservar.',
          },
          perfil: {
            type: ["string", "null"],
            enum: [...PERFIL_NAMES, null],
            description:
              'Perfil del catálogo (nombre EXACTO: "IPE 240", "HEB 200", "L 80×8"…). "L 80×8" solo sirve para bielas. null = conservar (o heredar de la barra anterior si es nueva).',
          },
          acero: {
            type: ["string", "null"],
            enum: [...ACEROS, null],
            description: "Grado del acero. null = conservar.",
          },
          correas_m: {
            type: ["number", "null"],
            description:
              "Separación (m) entre arriostramientos del ala comprimida (correas/viguetas/forjado) en vigas y cordones: limita la longitud de vuelco lateral (LTB). 0 = SIN arriostrar (lado seguro). null = conservar. Solo redúcela si el usuario confirma que esas correas existen.",
          },
          rotulas: {
            type: ["string", "null"],
            enum: [...ROTULAS, null],
            description:
              'Rótula (liberación de momento) en los extremos de la barra: "i" (en nudo_i), "j" (en nudo_j), "ambas" o "ninguna". Solo viga-columna: una biela ya es biarticulada por formulación. null = conservar las actuales.',
          },
        },
      },
    },
    apoyos: {
      type: ["array", "null"],
      description:
        "Lista COMPLETA de apoyos (REEMPLAZA la actual entera; null = sin cambio). Un elemento por nudo apoyado; los nudos no listados quedan libres.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["nudo", "tipo"],
        properties: {
          nudo: {
            type: "integer",
            description:
              "Nº de nudo apoyado (1-based sobre la lista final de nudos).",
          },
          tipo: {
            type: "string",
            enum: [...APOYOS],
            description:
              "articulado (fijo en x e y), empotrado (además impide el giro), deslizante (solo impide y).",
          },
        },
      },
    },
    cargas: {
      type: ["array", "null"],
      description:
        "Lista COMPLETA de cargas (REEMPLAZA la actual entera; [] = sin cargas; null = sin cambio). Componentes CON SIGNO: +x derecha, +y ARRIBA ⇒ la gravedad es fy NEGATIVO (10 kN hacia abajo = fy: -10). Valores CARACTERÍSTICOS sin mayorar. Conserva el orden de las existentes y añade las nuevas al final.",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "tipo",
          "objetivo",
          "fx",
          "fy",
          "ejes",
          "pos",
          "desde",
          "hasta",
          "hipotesis",
          "categoria_uso",
        ],
        properties: {
          tipo: {
            type: "string",
            enum: [...CARGA_TIPOS],
            description:
              "nudo (kN en un nudo), repartida (kN/m sobre una barra), puntual_barra (kN dentro de una barra).",
          },
          objetivo: {
            type: "integer",
            description:
              "Índice 1-based: nº de NUDO (tipo nudo) o nº de BARRA (repartida, puntual_barra) sobre las listas finales.",
          },
          fx: {
            type: "number",
            description:
              "Componente x CON SIGNO: kN (nudo, puntual_barra) o kN/m (repartida). Viento hacia la derecha = positivo.",
          },
          fy: {
            type: "number",
            description:
              "Componente y CON SIGNO: kN o kN/m. GRAVEDAD = NEGATIVO (hacia abajo). Succión de viento = positivo.",
          },
          ejes: {
            type: "string",
            enum: [...EJES],
            description:
              "global = ejes del mundo (lo normal); local = ejes de la barra (x_local de nudo_i a nudo_j, +y_local a su izquierda) para presiones ⊥, p. ej. viento sobre un faldón. Las cargas de nudo son siempre globales.",
          },
          pos: {
            type: ["number", "null"],
            description:
              "Posición relativa 0–1 desde nudo_i. OBLIGATORIA en puntual_barra; null en el resto.",
          },
          desde: {
            type: ["number", "null"],
            description:
              "Inicio relativo 0–1 de una repartida PARCIAL. null = 0 (todo el largo).",
          },
          hasta: {
            type: ["number", "null"],
            description: "Fin relativo 0–1 de una repartida PARCIAL. null = 1.",
          },
          hipotesis: {
            type: "string",
            enum: [...HIPOTESIS],
            description:
              "G permanente, Q sobrecarga de uso, W viento, S nieve, E sismo. La app aplica γ, ψ y las combinaciones.",
          },
          categoria_uso: {
            type: ["string", "null"],
            enum: [...CATEGORIAS, null],
            description:
              "Categoría de uso CTE Tabla 3.1 (fija las ψ). SOLO con hipotesis Q; null con Q ⇒ se asume B con aviso.",
          },
        },
      },
    },
    peso_propio: {
      type: ["boolean", "null"],
      description:
        'true = el programa añade automáticamente el peso propio de cada barra como carga G. NO lo dupliques en "cargas". null = sin cambio (lo normal). Envía false SOLO si el usuario pide explícitamente desactivar el peso propio automático.',
    },
    warnings: {
      type: "array",
      items: { type: "string" },
      description:
        "Avisos: conversiones de unidades, ambigüedades, datos del enunciado ignorados.",
    },
  },
};

// ── Prompt del módulo ─────────────────────────────────────────────────────────

const PROMPT_RULES = `Reglas específicas del módulo FEM 2D (pórticos y cerchas):
1. MODELO: nudos con coordenadas (x, y) en METROS (+y hacia ARRIBA), barras que unen nudos, apoyos en nudos y cargas. Todas las referencias son ÍNDICES 1-based: la barra {nudo_i: 1, nudo_j: 2} une el 1º y el 2º nudo de la lista "nudos"; el "objetivo" de una carga es el nº de barra (repartida, puntual_barra) o de nudo (tipo nudo). Los índices apuntan a la lista FINAL (la que envías en este turno, o la actual si esa lista va en null).
2. REEMPLAZO: cada lista se envía COMPLETA o null (= sin cambio). Conserva el ORDEN de los elementos existentes (las etiquetas del lienzo se preservan por posición) y añade los nuevos AL FINAL. Si cambias el número de nudos, envía SIEMPRE también "barras" y "apoyos" coherentes.
3. SIGNOS: las cargas son COMPONENTES CON SIGNO en ejes del mundo: +x derecha, +y ARRIBA. La gravedad es fy NEGATIVO (una carga de 10 kN hacia abajo es fy = -10; una repartida gravitatoria de 13 kN/m es fy = -13); el viento hacia la derecha es fx positivo. ejes "local" (solo cargas de barra) expresa las componentes en los ejes de la barra: para presión de viento perpendicular a un faldón que sube hacia la derecha, usa fy negativo en ejes local.
4. UNIDADES: m, kN y kN/m. Añade un warning por cada conversión que hagas.
5. TIPOS DE BARRA: "viga-columna" (axil + flexión, lo normal en pórticos) y "biela" (solo axil, para montantes y diagonales de celosía). Una biela NO admite cargas en la barra: aplícalas en los nudos (si aun así envías una carga de barra sobre una biela, la app la reparte en sus dos nudos como cargas equivalentes, con aviso). Su rol es diagonal o montante. El rol dirige la comprobación: pilar → motor de pilares (β=1 con amplificación por αcr), viga/cordon → motor de vigas (+ fila de axil concomitante), diagonal/montante → tracción / pandeo axil. rol "auto" (o null en barras nuevas) deja que la app lo deduzca de la geometría.
6. PERFILES: catálogo cerrado con nombres EXACTOS. "L 80×8" solo sirve para bielas: en una viga-columna deja la comprobación de flexión PENDIENTE.
7. CORREAS (correas_m): separación entre puntos de arriostramiento del ala comprimida de vigas y cordones; limita la longitud de vuelco lateral (LTB). 0 = sin arriostrar (lado seguro). Sin correas casi cualquier dintel falla por vuelco lateral: pregunta por ellas antes de dar el dintel por malo, pero solo pon un valor si el usuario confirma que esas correas EXISTEN.
8. HIPÓTESIS: G/Q/W/S/E por carga, con valores CARACTERÍSTICOS sin mayorar (la app aplica γ y ψ, las combinaciones multi-principal y la amplificación de 2º orden vía αcr). "categoria_uso" (CTE Tabla 3.1) solo con Q; si el usuario no la da, usa B con un aviso "Sugerencia:".
9. PESO PROPIO: con peso_propio = true el programa añade solo el peso de cada barra como carga G — no lo dupliques en "cargas". Si el usuario da una "carga total", pregunta si incluye el peso propio.
10. RÓTULAS: "rotulas" libera el momento en los extremos de una viga-columna ("i" = en nudo_i, "j" = en nudo_j, "ambas", "ninguna"; null = conservar). Úsalas para modelar uniones articuladas (viga apoyada entre pilares, correa continua…). Una biela ya es biarticulada por formulación: no le pongas rotulas. No crees mecanismos: una barra con rótulas en ambos extremos necesita que ALGO estabilice sus nudos (el solver descarta la propuesta si queda un mecanismo).
11. HORMIGÓN Y MADERA: las barras HA y de madera se COMPRUEBAN con su sección (y armado en HA), pero el chat NO puede editarlas (se hace en el inspector del lienzo — remite ahí al usuario). Una barra HA o de madera se conserva intacta si no tocas su perfil; darle "perfil"/"acero" la CONVIERTE a acero (hazlo solo si el usuario lo pide explícitamente). Una biela puede ser de acero o de madera, nunca de hormigón.
12. Si "modelo_de_plantilla" es true, TODO lo que ves (geometría, apoyos, cargas, perfiles) es una plantilla de la aplicación, NO datos del usuario: pregúntalos antes de dar por bueno ningún veredicto.
13. Si una propuesta estructural se descartó con un motivo del validador o del solver (mecanismo, apoyos insuficientes…), el motivo te llega en "errores_propuesta_anterior" del estado: corrígela en el turno siguiente atendiendo a ese motivo — no la repitas igual.
14. Lo ÚNICO que llega a la aplicación son las listas de "proposal" de ESTE turno, y solo cuando el usuario pulsa Aplicar: NUNCA afirmes en "reply" que ya has modelado, definido, configurado o aplicado algo, y "warnings" NO es un registro de acciones ("se ha aplicado…" ahí es falso siempre). Si el usuario dice que no ve la estructura, reenvía en "proposal" las CUATRO listas completas (nudos, barras, apoyos, cargas) en ese mismo turno.`;

const PLACEHOLDER_EXAMPLE =
  "Ej.: Pórtico de 6 m de luz y 3,5 m de altura, pilares HEB 200 y dintel IPE 240 " +
  "empotrados en base, permanente de 13 kN/m y sobrecarga de 5 kN/m en el dintel, " +
  "correas cada 1,5 m y viento de 8 kN en cabeza.";

// ── Parseo defensivo ──────────────────────────────────────────────────────────

interface NudoPayload {
  x: number | null;
  y: number | null;
}

interface BarraPayload {
  nudo_i: number | null;
  nudo_j: number | null;
  tipo: TipoBarra | null;
  rol: RolName | null;
  perfil: string | null;
  acero: "S275" | "S355" | null;
  correas_m: number | null;
  rotulas: RotulaName | null;
}

interface ApoyoPayload {
  nudo: number | null;
  tipo: ApoyoName | null;
}

interface CargaPayload2D {
  tipo: CargaTipo2D | null;
  objetivo: number | null;
  fx: number | null;
  fy: number | null;
  ejes: EjesName | null;
  pos: number | null;
  desde: number | null;
  hasta: number | null;
  hipotesis: LoadCase | null;
  categoria_uso: CategoriaName | null;
}

interface Fem2DPayload {
  nudos: NudoPayload[] | null;
  barras: BarraPayload[] | null;
  apoyos: ApoyoPayload[] | null;
  cargas: CargaPayload2D[] | null;
  peso_propio: boolean | null;
  warnings: string[];
}

function finiteNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[]): T | null {
  return (allowed as readonly unknown[]).includes(v) ? (v as T) : null;
}

function asRecord(raw: unknown): Record<string, unknown> {
  return typeof raw === "object" && raw !== null && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
}

function parseNudo(raw: unknown): NudoPayload {
  const r = asRecord(raw);
  return { x: finiteNumber(r.x), y: finiteNumber(r.y) };
}

function parseBarra(raw: unknown): BarraPayload {
  const r = asRecord(raw);
  return {
    nudo_i: finiteNumber(r.nudo_i),
    nudo_j: finiteNumber(r.nudo_j),
    tipo: oneOf(r.tipo, TIPOS_BARRA),
    rol: oneOf(r.rol, ROLES),
    perfil: typeof r.perfil === "string" ? r.perfil : null,
    acero: oneOf(r.acero, ACEROS),
    correas_m: finiteNumber(r.correas_m),
    rotulas: oneOf(r.rotulas, ROTULAS),
  };
}

function parseApoyo(raw: unknown): ApoyoPayload {
  const r = asRecord(raw);
  return { nudo: finiteNumber(r.nudo), tipo: oneOf(r.tipo, APOYOS) };
}

function parseCarga(raw: unknown): CargaPayload2D {
  const r = asRecord(raw);
  return {
    tipo: oneOf(r.tipo, CARGA_TIPOS),
    objetivo: finiteNumber(r.objetivo),
    fx: finiteNumber(r.fx),
    fy: finiteNumber(r.fy),
    ejes: oneOf(r.ejes, EJES),
    pos: finiteNumber(r.pos),
    desde: finiteNumber(r.desde),
    hasta: finiteNumber(r.hasta),
    hipotesis: oneOf(r.hipotesis, HIPOTESIS),
    categoria_uso: oneOf(r.categoria_uso, CATEGORIAS),
  };
}

function parsePayload(raw: unknown): Fem2DPayload {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new AiError(
      "bad-response",
      "La propuesta del modelo no es un objeto JSON.",
    );
  }
  const r = raw as Record<string, unknown>;
  return {
    nudos: Array.isArray(r.nudos) ? r.nudos.map(parseNudo) : null,
    barras: Array.isArray(r.barras) ? r.barras.map(parseBarra) : null,
    apoyos: Array.isArray(r.apoyos) ? r.apoyos.map(parseApoyo) : null,
    cargas: Array.isArray(r.cargas) ? r.cargas.map(parseCarga) : null,
    peso_propio: typeof r.peso_propio === "boolean" ? r.peso_propio : null,
    warnings: Array.isArray(r.warnings)
      ? r.warnings.filter((w): w is string => typeof w === "string")
      : [],
  };
}

// ── Proyecciones al espacio del payload ───────────────────────────────────────

interface NudoProj {
  x: number;
  y: number;
}

interface BarraProj {
  nudo_i: number;
  nudo_j: number;
  tipo: TipoBarra;
  rol: MemberRole;
  perfil: string | null;
  acero: string | null;
  /** 0 = sin arriostrar (proyección de ltbSpacing undefined). */
  correas_m: number;
  /** Relativa a nudo_i→nudo_j; una biela proyecta siempre 'ninguna'. */
  rotulas: RotulaName;
}

interface ApoyoProj {
  nudo: number;
  tipo: ApoyoName;
}

interface CargaProj2D {
  tipo: CargaTipo2D;
  objetivo: number;
  fx: number;
  fy: number;
  ejes: EjesName;
  pos: number | null;
  desde: number | null;
  hasta: number | null;
  hipotesis: LoadCase;
  /** Normalizada: Q sin categoría ⇒ 'B' (el default del motor); no-Q ⇒ null. */
  categoria_uso: string | null;
}

interface ModelProj {
  nudos: NudoProj[];
  barras: BarraProj[];
  apoyos: ApoyoProj[];
  cargas: CargaProj2D[];
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function perfilName(profileKey: string): string {
  return STEEL_CATALOG[profileKey]?.name ?? profileKey;
}

/** Proyección completa modelo → espacio del payload (índices 1-based por posición). */
export function projectModel2D(m: Fem2DModel): ModelProj {
  const nodeIdx = new Map(m.nodes.map((n, k) => [n.id, k + 1]));
  const memberIdx = new Map(m.members.map((mm, k) => [mm.id, k + 1]));

  const nudos: NudoProj[] = m.nodes.map((n) => ({
    x: round2(n.x),
    y: round2(n.y),
  }));

  const barras: BarraProj[] = m.members.map((mm) => ({
    nudo_i: nodeIdx.get(mm.i) ?? 0,
    nudo_j: nodeIdx.get(mm.j) ?? 0,
    tipo: mm.elementType === "two-force" ? "biela" : "viga-columna",
    rol: mm.role,
    perfil:
      mm.material === "steel" && mm.steelSelection !== undefined
        ? perfilName(mm.steelSelection.profileKey)
        : null,
    acero: mm.material === "steel" ? (mm.steelSelection?.steel ?? null) : null,
    correas_m: mm.ltbSpacing != null ? round2(mm.ltbSpacing) : 0,
    rotulas:
      mm.elementType === "beam-column"
        ? mm.releases.i && mm.releases.j
          ? "ambas"
          : mm.releases.i
            ? "i"
            : mm.releases.j
              ? "j"
              : "ninguna"
        : "ninguna",
  }));

  // Orden estable por nº de nudo: el array de supports del modelo no tiene
  // orden canónico y la comparación "ya coincide" es por JSON.
  const apoyos: ApoyoProj[] = m.supports
    .map((s) => ({
      nudo: nodeIdx.get(s.node) ?? 0,
      tipo: SUPPORT_TO_APOYO[s.type],
    }))
    .filter((a) => a.nudo > 0)
    .sort((a, b) => a.nudo - b.nudo);

  const cargas: CargaProj2D[] = [];
  for (const l of m.loads) {
    const categoria = l.lc === "Q" ? (l.useCategory ?? "B") : null;
    if (l.kind === "node") {
      const k = nodeIdx.get(l.node);
      if (k === undefined) continue; // referencia rota — la caza el validador
      cargas.push({
        tipo: "nudo",
        objetivo: k,
        fx: round2(l.Fx),
        fy: round2(l.Fy),
        ejes: "global",
        pos: null,
        desde: null,
        hasta: null,
        hipotesis: l.lc,
        categoria_uso: categoria,
      });
    } else if (l.kind === "udl") {
      const k = memberIdx.get(l.member);
      if (k === undefined) continue;
      cargas.push({
        tipo: "repartida",
        objetivo: k,
        fx: round2(l.wx),
        fy: round2(l.wy),
        ejes: l.frame,
        pos: null,
        desde: l.from ?? null,
        hasta: l.to ?? null,
        hipotesis: l.lc,
        categoria_uso: categoria,
      });
    } else {
      const k = memberIdx.get(l.member);
      if (k === undefined) continue;
      cargas.push({
        tipo: "puntual_barra",
        objetivo: k,
        fx: round2(l.Fx),
        fy: round2(l.Fy),
        ejes: l.frame,
        pos: l.pos,
        desde: null,
        hasta: null,
        hipotesis: l.lc,
        categoria_uso: categoria,
      });
    }
  }

  return { nudos, barras, apoyos, cargas };
}

// ── Baseline de plantilla (gate anti-ruido y bandera de plantilla) ────────────

function buildTemplateDefaults<P>(t: {
  defaults: () => P;
  build: (p: P) => Fem2DModel;
}): Fem2DModel {
  return t.build(t.defaults());
}

function presetBaseline(current: Fem2DModel): Fem2DModel | null {
  // El switch estrecha la clave: cada plantilla tiene su propio tipo de
  // parámetros y el acceso por unión no correlaciona defaults() con build().
  switch (current.templateId) {
    case "pratt-truss":
      return buildTemplateDefaults(FEM2D_TEMPLATES["pratt-truss"]);
    case "portal-frame":
      return buildTemplateDefaults(FEM2D_TEMPLATES["portal-frame"]);
    case "multistory":
      return buildTemplateDefaults(FEM2D_TEMPLATES["multistory"]);
    case "gable":
      return buildTemplateDefaults(FEM2D_TEMPLATES["gable"]);
    default:
      return null;
  }
}

const sameProj = (a: unknown, b: unknown): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

// ── Labels y helpers ──────────────────────────────────────────────────────────

const LABELS = {
  nudos: "Nudos (geometría)",
  barras: "Barras (topología y perfiles)",
  apoyos: "Apoyos",
  cargas: "Cargas",
  peso_propio: "Peso propio",
} as const;

type PayloadKey = keyof typeof LABELS;
const KEY_ORDER: readonly PayloadKey[] = [
  "nudos",
  "barras",
  "apoyos",
  "cargas",
  "peso_propio",
];

const ALREADY = "Ya coincide con el valor actual";

function mintId(prefix: "n" | "b" | "l", used: Set<string>): string {
  let i = 1;
  while (used.has(`${prefix}${i}`)) i++;
  const id = `${prefix}${i}`;
  used.add(id);
  return id;
}

function fmtNudos(nudos: readonly NudoProj[]): string {
  return (
    `${nudos.length} nudo${nudos.length === 1 ? "" : "s"}: ` +
    nudos.map((n, k) => `${k + 1}(${n.x}, ${n.y})`).join(" · ")
  );
}

function fmtBarra(b: BarraProj): string {
  // perfil null = sección no editable por chat (HA o madera — el payload no
  // distingue el material sin coste de unión; el contexto barras_ha /
  // barras_madera del snapshot sí).
  const perfil =
    b.perfil !== null
      ? `${b.perfil}${b.acero !== null ? ` ${b.acero}` : ""}`
      : "HA/madera";
  const biela = b.tipo === "biela" ? " biela" : "";
  const correas = b.correas_m > 0 ? ` correas ${b.correas_m} m` : "";
  const rotulas =
    b.rotulas !== "ninguna"
      ? ` rótula ${b.rotulas === "ambas" ? "i+j" : b.rotulas}`
      : "";
  return `${b.nudo_i}→${b.nudo_j} ${b.rol}${biela} ${perfil}${correas}${rotulas}`;
}

function fmtBarras(barras: readonly BarraProj[]): string {
  return `${barras.length} barra${barras.length === 1 ? "" : "s"}: ${barras.map(fmtBarra).join(" · ")}`;
}

function fmtApoyos(apoyos: readonly ApoyoProj[]): string {
  if (apoyos.length === 0) return "sin apoyos";
  return apoyos.map((a) => `${a.tipo} en nudo ${a.nudo}`).join(" · ");
}

function fmtCarga(c: CargaProj2D): string {
  const ejes = c.ejes === "local" ? " (ejes barra)" : "";
  const cat =
    c.categoria_uso !== null && c.categoria_uso !== "B"
      ? ` cat. ${c.categoria_uso}`
      : "";
  const hip = `[${c.hipotesis}${cat}]`;
  if (c.tipo === "nudo")
    return `(${c.fx}, ${c.fy}) kN en nudo ${c.objetivo} ${hip}`;
  if (c.tipo === "repartida") {
    const parcial =
      (c.desde ?? 0) !== 0 || (c.hasta ?? 1) !== 1
        ? ` (tramo ${c.desde ?? 0}–${c.hasta ?? 1})`
        : "";
    return `(${c.fx}, ${c.fy}) kN/m${ejes} en barra ${c.objetivo}${parcial} ${hip}`;
  }
  return `(${c.fx}, ${c.fy}) kN${ejes} en barra ${c.objetivo} @ ${c.pos ?? "?"} ${hip}`;
}

function fmtCargas(cargas: readonly CargaProj2D[]): string {
  if (cargas.length === 0) return "sin cargas";
  return `${cargas.length} carga${cargas.length === 1 ? "" : "s"}: ${cargas.map(fmtCarga).join(" · ")}`;
}

// ── Reglas de seguridad ───────────────────────────────────────────────────────

export const FEM2D_SAFETY_RULES: ReadonlyArray<SafetyRule<Fem2DModel>> = [
  {
    field: "selfWeight",
    confirmKey: "peso_propio",
    level: trueIsSafer,
    why: "El peso propio es una acción permanente REAL: desactivarlo borra de golpe parte de la carga G de todas las barras. Solo procede si las cargas introducidas ya lo incluyen — y entonces hay que decirlo explícitamente.",
  },
];

/** ψ₂ por categoría (CTE Tabla 4.2) — misma tabla que el adapter FEM 1D. */
const CATEGORIA_PSI2: Record<string, number> = {
  A1: 0.3,
  A2: 0.3,
  B: 0.3,
  C1: 0.6,
  C2: 0.6,
  C3: 0.6,
  D1: 0.6,
  E1: 0.8,
  G1: 0.0,
};

export const CARGAS2D_ELEMENT_RULES: ReadonlyArray<
  ElementSafetyRule<CargaProj2D>
> = [
  {
    // Componentes CON SIGNO: lo peligroso es rebajar la MAGNITUD (cambiar el
    // sentido de un viento es legítimo y no monótono — sin regla de signo, la
    // lección de la auditoría: ante una dirección dudosa, NO pongas regla).
    field: "fx",
    label: "componente Fx",
    level: magnitudeIsSafer,
    why: "Las cargas las fija el proyecto, no el cálculo: rebajar la magnitud de una componente hace cumplir la estructura sin que la obra haya cambiado.",
  },
  {
    field: "fy",
    label: "componente Fy",
    level: magnitudeIsSafer,
    why: "Las cargas las fija el proyecto, no el cálculo: rebajar la magnitud de una componente hace cumplir la estructura sin que la obra haya cambiado.",
  },
  {
    // Mismos dos centinelas no monótonos del 1D: γ de ELU y persistencia ψ₂.
    field: "hipotesis",
    key: "hipotesis_elu",
    label: "hipótesis (γ de mayoración ELU)",
    level: ordinalLevel({ G: 1.35, Q: 1.5, W: 1.5, S: 1.5, E: 1.0 }),
    why: "La naturaleza de una carga la fija el proyecto: pasar una sobrecarga (γ=1.5) a permanente (γ=1.35) o a sismo (γ=1.0) rebaja la demanda ELU sin tocar ningún número.",
  },
  {
    field: "hipotesis",
    key: "hipotesis_persistencia",
    label: "hipótesis (persistencia ψ₂)",
    level: ordinalLevel({ G: 1.0, Q: 0.3, W: 0.0, S: 0.0, E: 0.0 }),
    why: "Pasar una carga a una hipótesis menos persistente (G→Q, Q→viento/nieve) la borra de la flecha y de la combinación cuasipermanente, aunque el γ de ELU no baje.",
  },
  {
    field: "categoria_uso",
    label: "categoría de uso (ψ₂)",
    level: (v) => (typeof v === "string" ? (CATEGORIA_PSI2[v] ?? null) : null),
    why: "La categoría de uso (CTE Tabla 3.1) la fija el uso real del edificio: bajarla reduce las ψ y con ellas la sobrecarga que persiste en las combinaciones ELS y de acompañamiento.",
  },
  {
    field: "desde",
    label: "inicio de la banda",
    level: (v) => lowerIsSafer(v ?? 0),
    format: (v) => `${v ?? 0}`,
    why: "Encoger el tramo cargado de una repartida parcial reduce la resultante sobre la barra sin que nadie haya movido nada en obra.",
  },
  {
    field: "hasta",
    label: "fin de la banda",
    level: (v) => higherIsSafer(v ?? 1),
    format: (v) => `${v ?? 1}`,
    why: "Encoger el tramo cargado de una repartida parcial reduce la resultante sobre la barra sin que nadie haya movido nada en obra.",
  },
];

export const CARGAS2D_RISK_CTX = {
  field: "cargas",
  itemLabel: "Carga",
  collectionLabel: "Cargas",
  removalWhy:
    "Las acciones las fija el proyecto: eliminar cargas reduce la demanda de toda la estructura. Confírmalo solo si esas cargas realmente ya no existen.",
  identityKeys: [] as const,
} as const;

export const BARRAS_ELEMENT_RULES: ReadonlyArray<ElementSafetyRule<BarraProj>> =
  [
    {
      // correas_m es un DATO del problema (regla 7 del prompt base: "longitudes y
      // coeficientes de pandeo"): afirmar correas más juntas de las que existen
      // rebaja la Lcr de vuelco y el dintel "cumple" sin que la obra cambie.
      // 0 = sin arriostrar = el caso MÁS desfavorable ⇒ centinela +∞
      // (offIsUnbounded): pasar de 0 a un valor también es un riesgo.
      field: "correas_m",
      label: "separación de correas (arriostramiento LTB)",
      level: offIsUnbounded(zeroIsOff, higherIsSafer),
      format: (v) => (zeroIsOff(v) ? "sin arriostrar" : `${v as number} m`),
      why: "La separación de correas la fija la construcción real: acercarlas (o inventarlas donde no hay) acorta la longitud de vuelco lateral y hace cumplir la viga sin que exista ese arriostramiento.",
    },
    // Perfil/acero/tipo/rol: SIN regla — son RESISTENCIA o modelización que el
    // motor recalcula honestamente (variable de diseño libre, igual que el 1D).
  ];

export const BARRAS_RISK_CTX = {
  field: "barras",
  itemLabel: "Barra",
  collectionLabel: "Barras",
  removalWhy:
    "Quitar barras reescribe la estructura y elimina con ellas sus cargas: confírmalo solo si la geometría real ha cambiado.",
  identityKeys: [] as const,
} as const;

// Nudos: sin reglas por elemento a propósito. Mover un nudo en 2D REDISTRIBUYE
// esfuerzos sin dirección monótona de seguridad (subir el canto de una cercha
// DESCARGA los cordones; acortar un vano descarga el dintel pero recarga el
// pilar) y el motor recalcula honestamente — la misma doctrina que los apoyos
// del 1D. Eliminar nudos sí se marca: arrastra barras y cargas.
export const NUDOS_ELEMENT_RULES: ReadonlyArray<ElementSafetyRule<NudoProj>> =
  [];

export const NUDOS_RISK_CTX = {
  field: "nudos",
  itemLabel: "Nudo",
  collectionLabel: "Nudos",
  removalWhy:
    "Quitar nudos elimina en cascada las barras que los tocan y sus cargas: confírmalo solo si la geometría real ha cambiado.",
  identityKeys: [] as const,
} as const;

// Apoyos: SIN reglas (misma decisión razonada que el 1D): cambiar el esquema
// estático redistribuye esfuerzos y el motor lo recalcula; el caso degenerado
// (quitar apoyos hasta el mecanismo) lo corta el cross-check con el solver.

// ── Reconstrucción payload → Fem2DModel ───────────────────────────────────────

const LIMITS = {
  coord: 1000, // |x|, |y| máximos (m)
  w: 10000, // |componente| máxima de una repartida (kN/m)
  P: 100000, // |componente| máxima de una puntual (kN)
  correas: { min: 0.1, max: 30 }, // rango de correas_m cuando no es 0
} as const;

/** Valida y reconstruye la lista completa de nudos. String = motivo (todo-o-nada). */
function mapNudos(
  items: readonly NudoPayload[],
  current: Fem2DModel,
  used: Set<string>,
): Fem2DNode[] | string {
  if (items.length < 2) return "El modelo necesita al menos 2 nudos";
  if (items.length > FEM2D_MAX_NODES) {
    return `Demasiados nudos: ${items.length} (máx. ${FEM2D_MAX_NODES})`;
  }
  const out: Fem2DNode[] = [];
  for (let k = 0; k < items.length; k++) {
    const it = items[k];
    const n = k + 1;
    if (it.x === null || it.y === null)
      return `Nudo ${n}: faltan coordenadas x/y`;
    if (Math.abs(it.x) > LIMITS.coord || Math.abs(it.y) > LIMITS.coord) {
      return `Nudo ${n}: coordenadas fuera del rango ±${LIMITS.coord} m`;
    }
    const x = round2(it.x);
    const y = round2(it.y);
    for (let p = 0; p < out.length; p++) {
      if (Math.hypot(out[p].x - x, out[p].y - y) < MIN_NODE_SEPARATION_M) {
        return `Nudo ${n}: coincide con el nudo ${p + 1} en (${x}, ${y})`;
      }
    }
    const id =
      k < current.nodes.length ? current.nodes[k].id : mintId("n", used);
    out.push({ id, x, y });
  }
  return out;
}

/** Rol automático del editor: biela → montante/diagonal; resto → pilar/viga. */
function autoRole(tipo: TipoBarra, a: Fem2DNode, b: Fem2DNode): MemberRole {
  const vertical = inferRole(a, b) === "pilar";
  if (tipo === "biela") return vertical ? "montante" : "diagonal";
  return vertical ? "pilar" : "viga";
}

/** Valida y reconstruye la lista completa de barras. String = motivo (todo-o-nada). */
function mapBarras(
  items: readonly BarraPayload[],
  finalNodes: readonly Fem2DNode[],
  current: Fem2DModel,
  used: Set<string>,
  warnings: string[],
): Fem2DMember[] | string {
  if (items.length > FEM2D_MAX_MEMBERS) {
    return `Demasiadas barras: ${items.length} (máx. ${FEM2D_MAX_MEMBERS})`;
  }
  const out: Fem2DMember[] = [];
  const seenPairs = new Map<string, number>();

  for (let k = 0; k < items.length; k++) {
    const it = items[k];
    const n = k + 1;
    const prev = k < current.members.length ? current.members[k] : null;

    // --- Nudos ---
    if (
      it.nudo_i === null ||
      !Number.isInteger(it.nudo_i) ||
      it.nudo_j === null ||
      !Number.isInteger(it.nudo_j)
    ) {
      return `Barra ${n}: nudo_i/nudo_j ausentes o no enteros`;
    }
    if (
      it.nudo_i < 1 ||
      it.nudo_i > finalNodes.length ||
      it.nudo_j < 1 ||
      it.nudo_j > finalNodes.length
    ) {
      return `Barra ${n}: nudo ${it.nudo_i < 1 || it.nudo_i > finalNodes.length ? it.nudo_i : it.nudo_j} no existe (hay ${finalNodes.length})`;
    }
    if (it.nudo_i === it.nudo_j)
      return `Barra ${n}: nudo_i y nudo_j deben ser distintos`;
    const a = finalNodes[it.nudo_i - 1];
    const b = finalNodes[it.nudo_j - 1];
    const pairKey = `${Math.min(it.nudo_i, it.nudo_j)}-${Math.max(it.nudo_i, it.nudo_j)}`;
    const dup = seenPairs.get(pairKey);
    if (dup !== undefined)
      return `Barra ${n}: duplica la barra ${dup} (mismos nudos ${pairKey})`;
    seenPairs.set(pairKey, n);
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    if (L < MIN_MEMBER_LENGTH_M) {
      return `Barra ${n}: mide ${L.toFixed(3)} m (mínimo ${MIN_MEMBER_LENGTH_M} m)`;
    }

    // --- Tipo de elemento ---
    const prevTipo: TipoBarra | null =
      prev !== null
        ? prev.elementType === "two-force"
          ? "biela"
          : "viga-columna"
        : null;
    const tipo: TipoBarra = it.tipo ?? prevTipo ?? "viga-columna";
    const tipoCambia = prevTipo !== null && tipo !== prevTipo;

    // --- Rol ---
    let role: MemberRole;
    let roleManual: boolean;
    if (it.rol !== null && it.rol !== "auto") {
      const incompatible =
        tipo === "biela"
          ? ROLES_FLEXION.includes(it.rol)
          : ROLES_AXIALES.includes(it.rol);
      if (incompatible) {
        // Coacción, no rechazo: el motor enruta las bielas por elementType
        // (axil, ignora el rol) y el modelo llama 'cordon' a los cordones-biela
        // de una celosía una y otra vez — rechazarlo tumbaba la lista entera y
        // con ella toda la propuesta estructural (bucle sin salida en el chat).
        role = autoRole(tipo, a, b);
        roleManual = false;
        warnings.push(
          `Barra ${n}: el rol '${it.rol}' no corresponde a una ${tipo}; se usa '${role}' (deducido de la geometría).`,
        );
      } else {
        role = it.rol;
        roleManual = true;
      }
    } else if (it.rol === "auto" || prev === null || tipoCambia) {
      role = autoRole(tipo, a, b);
      // Espejo de setMemberTwoForce: pasar a biela fija el rol axial como
      // manual; volver a viga-columna (o barra nueva) queda en auto.
      roleManual = it.rol === null && tipoCambia && tipo === "biela";
    } else {
      // Conservar: los roles auto pilar/viga se re-infieren con la geometría
      // final (espejo de reinferRoles tras mover nudos).
      roleManual = prev.roleManual === true;
      role =
        !roleManual && (prev.role === "pilar" || prev.role === "viga")
          ? inferRole(a, b)
          : prev.role;
    }

    // --- Material / perfil ---
    let material: Fem2DMember["material"] = "steel";
    let steelSelection: Fem2DMember["steelSelection"];
    // La sección y el armado HA — y la sección de madera — se ARRASTRAN siempre
    // desde prev (también al convertir a acero): son datos del usuario editados
    // en el inspector y el chat no puede reconstruirlos — perderlos sería
    // destructivo.
    const rcSection = prev?.rcSection;
    const timberSection = prev?.timberSection;
    if (
      prev !== null &&
      prev.material === "rc" &&
      it.perfil === null &&
      it.acero === null
    ) {
      // Barra HA existente sin tocar su perfil: sigue siendo HA y se comprueba
      // con su sección+armado actuales (el chat no edita el hormigón).
      if (tipo === "biela") {
        return `Barra ${n}: una biela no puede ser de hormigón (sin motor axil HA) — dale un perfil de acero, pásala a madera o déjala como viga-columna`;
      }
      material = "rc";
      steelSelection = prev.steelSelection; // restaurable si vuelve a acero
    } else if (
      prev !== null &&
      prev.material === "timber" &&
      it.perfil === null &&
      it.acero === null
    ) {
      // Barra de MADERA existente sin tocar su perfil: sigue siendo madera y
      // se comprueba con su sección actual (el chat no edita la madera, mismo
      // patrón que el HA). Una biela de madera SÍ está soportada (axil EC5).
      material = "timber";
      steelSelection = prev.steelSelection; // restaurable si vuelve a acero
    } else {
      const prevSteel =
        prev !== null && prev.material === "steel"
          ? prev.steelSelection
          : undefined;
      const lastSteel =
        out.length > 0 && out[out.length - 1].material === "steel"
          ? out[out.length - 1].steelSelection
          : undefined;
      const base = prevSteel ?? lastSteel ?? DEFAULT_STEEL_2D;
      const sel = { ...base };
      if (it.perfil !== null) {
        const key = PERFIL_CATALOG[it.perfil];
        if (key === undefined) {
          return `Barra ${n}: perfil "${it.perfil}" fuera del catálogo (${PERFIL_NAMES.join(", ")})`;
        }
        sel.profileKey = key;
      }
      if (it.acero !== null) sel.steel = it.acero;
      steelSelection = sel;
      if (prev !== null && prev.material === "rc") {
        warnings.push(
          `Barra ${n} pasa de hormigón a acero (${perfilName(sel.profileKey)} ${sel.steel}).`,
        );
      } else if (prev !== null && prev.material === "timber") {
        warnings.push(
          `Barra ${n} pasa de madera a acero (${perfilName(sel.profileKey)} ${sel.steel}).`,
        );
      } else if (prev === null && it.perfil === null) {
        warnings.push(
          `Barra ${n} (nueva): hereda el perfil ${perfilName(sel.profileKey)} ${sel.steel} — revísalo.`,
        );
      }
    }

    // --- Correas (LTB) ---
    let ltbSpacing: number | undefined;
    if (it.correas_m === null) {
      ltbSpacing = prev?.ltbSpacing;
    } else if (it.correas_m === 0) {
      ltbSpacing = undefined;
    } else {
      if (
        it.correas_m < LIMITS.correas.min ||
        it.correas_m > LIMITS.correas.max
      ) {
        return `Barra ${n}: correas_m ${it.correas_m} fuera del rango ${LIMITS.correas.min}–${LIMITS.correas.max} m (0 = sin arriostrar)`;
      }
      ltbSpacing = round2(it.correas_m);
    }
    if (tipo === "biela") {
      if (it.correas_m !== null && it.correas_m !== 0) {
        warnings.push(
          `Barra ${n}: correas_m solo aplica a vigas/cordones; en una biela se ignora.`,
        );
      }
      ltbSpacing = undefined;
    }

    // --- Rótulas ---
    // Arrastre consciente de la ORIENTACIÓN: los flags i/j de prev son
    // relativos a SU i→j; si el payload reenvía la barra con los nudos
    // invertidos, la rótula debe seguir en el mismo nudo FÍSICO. Una biela es
    // biarticulada por formulación (flags irrelevantes → limpios).
    let releases = { i: false, j: false };
    if (
      tipo !== "biela" &&
      prev !== null &&
      prev.elementType === "beam-column"
    ) {
      const flipped = prev.i === b.id && prev.j === a.id;
      releases = flipped
        ? { i: prev.releases.j, j: prev.releases.i }
        : { ...prev.releases };
    }
    if (it.rotulas !== null) {
      if (tipo === "biela") {
        if (it.rotulas !== "ninguna") {
          warnings.push(
            `Barra ${n}: una biela ya es biarticulada por formulación; "rotulas" se ignora.`,
          );
        }
      } else {
        releases = {
          i: it.rotulas === "i" || it.rotulas === "ambas",
          j: it.rotulas === "j" || it.rotulas === "ambas",
        };
      }
    }

    out.push({
      id: prev?.id ?? mintId("b", used),
      i: a.id,
      j: b.id,
      role,
      elementType: tipo === "biela" ? "two-force" : "beam-column",
      material,
      steelSelection,
      ...(rcSection !== undefined ? { rcSection } : {}),
      ...(timberSection !== undefined ? { timberSection } : {}),
      ...(prev?.vanoArmado !== undefined
        ? { vanoArmado: prev.vanoArmado }
        : {}),
      ...(prev?.apoyoArmado !== undefined
        ? { apoyoArmado: prev.apoyoArmado }
        : {}),
      ...(prev?.columnCage !== undefined
        ? { columnCage: prev.columnCage }
        : {}),
      releases,
      ...(ltbSpacing !== undefined ? { ltbSpacing } : {}),
      ...(roleManual ? { roleManual: true } : {}),
    });
  }
  return out;
}

/** Valida y reconstruye la lista completa de apoyos. String = motivo. */
function mapApoyos(
  items: readonly ApoyoPayload[],
  finalNodes: readonly Fem2DNode[],
): Fem2DSupport[] | string {
  if (items.length === 0)
    return "La estructura necesita al menos un apoyo; la lista no puede quedar vacía";
  const out: Fem2DSupport[] = [];
  const seen = new Set<number>();
  for (let k = 0; k < items.length; k++) {
    const it = items[k];
    const n = k + 1;
    if (it.nudo === null || !Number.isInteger(it.nudo))
      return `Apoyo ${n}: falta el nº de nudo`;
    if (it.nudo < 1 || it.nudo > finalNodes.length) {
      return `Apoyo ${n}: nudo ${it.nudo} no existe (hay ${finalNodes.length})`;
    }
    if (it.tipo === null)
      return `Apoyo ${n}: tipo no reconocido (articulado/empotrado/deslizante)`;
    if (seen.has(it.nudo))
      return `Apoyo ${n}: el nudo ${it.nudo} ya tiene apoyo en esta lista`;
    seen.add(it.nudo);
    out.push({
      node: finalNodes[it.nudo - 1].id,
      type: APOYO_TO_SUPPORT[it.tipo],
    });
  }
  return out;
}

/**
 * Reparto estáticamente equivalente de una carga de barra sobre una BIELA:
 * (Px, Py) kN totales en ejes globales van a los nudos extremos con brazo
 * relativo `shareJ` (0–1 desde nudo_i). Coacción, no rechazo (2026-07-20,
 * mismo criterio que los roles): rechazar la carga vetaba el bloque
 * estructural entero y el chat entraba en bucle sin salida (el modelo dibuja
 * la celosía con la repartida sobre un cordón-biela una y otra vez). Es la
 * misma idealización que usa el motor con el peso propio de las bielas
 * (decompose.ts: "lump half the member weight at each end node") — la
 * formulación two-force no puede llevar carga transversal en la barra.
 */
function lumpBielaLoad(
  n: number,
  objetivo: number,
  tipoLabel: string,
  target: Fem2DMember,
  Px: number,
  Py: number,
  shareJ: number,
  finalNodes: readonly Fem2DNode[],
  lc: LoadCase,
  useCategory: UseCategoryCode | undefined,
  used: Set<string>,
  warnings: string[],
): Fem2DLoad[] | string {
  const idxI = finalNodes.findIndex((nd) => nd.id === target.i) + 1;
  const idxJ = finalNodes.findIndex((nd) => nd.id === target.j) + 1;
  const out: Fem2DLoad[] = [];
  const parts: ReadonlyArray<readonly [string, number]> = [
    [target.i, 1 - shareJ],
    [target.j, shareJ],
  ];
  for (const [nodeId, share] of parts) {
    const Fx = round2(Px * share);
    const Fy = round2(Py * share);
    if (Fx === 0 && Fy === 0) continue;
    out.push({
      id: mintId("l", used),
      kind: "node",
      lc,
      ...(useCategory !== undefined ? { useCategory } : {}),
      node: nodeId,
      Fx,
      Fy,
    });
  }
  if (out.length === 0) {
    return `Carga ${n}: el reparto sobre la biela deja componentes nulas en ambos nudos`;
  }
  warnings.push(
    `Carga ${n}: la barra ${objetivo} es una biela (solo axil) y no admite cargas en la barra — la ${tipoLabel} se reparte como cargas de nudo estáticamente equivalentes en los nudos ${idxI} y ${idxJ} (misma idealización que el peso propio de bielas). Si buscas flexión local en esa barra, cámbiala a viga-columna.`,
  );
  return out;
}

/** Valida y construye una carga sobre la geometría FINAL (una carga de barra
 *  sobre una biela produce DOS cargas de nudo — ver lumpBielaLoad).
 *  String = motivo. */
function mapCarga2D(
  raw: CargaPayload2D,
  index: number,
  finalNodes: readonly Fem2DNode[],
  finalMembers: readonly Fem2DMember[],
  used: Set<string>,
  warnings: string[],
): Fem2DLoad[] | string {
  const n = index + 1;
  if (raw.tipo === null)
    return `Carga ${n}: tipo ausente o no reconocido (nudo/repartida/puntual_barra)`;
  if (raw.hipotesis === null) return `Carga ${n}: falta hipotesis (G/Q/W/S/E)`;
  if (raw.fx === null || raw.fy === null)
    return `Carga ${n}: faltan las componentes fx/fy`;

  const fx = round2(raw.fx);
  const fy = round2(raw.fy);
  if (fx === 0 && fy === 0)
    return `Carga ${n}: componentes nulas (fx = fy = 0)`;
  const maxVal = raw.tipo === "repartida" ? LIMITS.w : LIMITS.P;
  if (Math.abs(fx) > maxVal || Math.abs(fy) > maxVal) {
    return `Carga ${n}: componente fuera del rango ±${maxVal} ${raw.tipo === "repartida" ? "kN/m" : "kN"}`;
  }

  let ejes: EjesName = raw.ejes ?? "global";
  if (raw.tipo === "nudo" && ejes === "local") {
    warnings.push(
      `Carga ${n}: las cargas de nudo son siempre globales; se ignora ejes "local".`,
    );
    ejes = "global";
  }

  // Aviso de signo: una acción gravitatoria (G/Q/S) con componente vertical
  // POSITIVA en ejes globales es casi siempre un signo equivocado del modelo.
  if (
    ejes === "global" &&
    fy > 0 &&
    (raw.hipotesis === "G" || raw.hipotesis === "Q" || raw.hipotesis === "S")
  ) {
    warnings.push(
      `Carga ${n} (${raw.hipotesis}): componente vertical positiva (hacia ARRIBA) — revisa el signo si es una carga gravitatoria.`,
    );
  }

  if (raw.objetivo === null || !Number.isInteger(raw.objetivo)) {
    return `Carga ${n}: objetivo ausente o no entero`;
  }
  const maxTarget =
    raw.tipo === "nudo" ? finalNodes.length : finalMembers.length;
  const targetLabel = raw.tipo === "nudo" ? "nudo" : "barra";
  if (raw.objetivo < 1 || raw.objetivo > maxTarget) {
    return `Carga ${n}: ${targetLabel} ${raw.objetivo} no existe (hay ${maxTarget})`;
  }

  let useCategory: UseCategoryCode | undefined;
  if (raw.hipotesis === "Q") {
    if (raw.categoria_uso === null) {
      warnings.push(
        `Carga ${n}: sobrecarga Q sin categoría de uso — se asume B (Tabla 3.1). Sugerencia: confírmala con el usuario.`,
      );
      useCategory = "B";
    } else {
      useCategory = raw.categoria_uso;
    }
  } else if (raw.categoria_uso !== null) {
    warnings.push(
      `Carga ${n}: categoria_uso solo aplica a sobrecargas Q; se ignora.`,
    );
  }

  const lc = raw.hipotesis;

  if (raw.tipo === "nudo") {
    if (raw.pos !== null || raw.desde !== null || raw.hasta !== null) {
      warnings.push(
        `Carga ${n}: pos/desde/hasta no aplican a cargas de nudo; se ignoran.`,
      );
    }
    return [
      {
        id: mintId("l", used),
        kind: "node",
        lc,
        ...(useCategory !== undefined ? { useCategory } : {}),
        node: finalNodes[raw.objetivo - 1].id,
        Fx: fx,
        Fy: fy,
      },
    ];
  }

  const target = finalMembers[raw.objetivo - 1];
  const esBiela = target.elementType === "two-force";
  // Componentes en ejes GLOBALES para el reparto sobre biela (las cargas de
  // nudo son siempre globales): x_local = i→j, y_local a su izquierda.
  let gx = fx;
  let gy = fy;
  if (esBiela && ejes === "local") {
    const a = finalNodes.find((nd) => nd.id === target.i);
    const b = finalNodes.find((nd) => nd.id === target.j);
    if (a === undefined || b === undefined) {
      return `Carga ${n}: la barra ${raw.objetivo} referencia nudos inexistentes`;
    }
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    const c = (b.x - a.x) / L;
    const s = (b.y - a.y) / L;
    gx = fx * c - fy * s;
    gy = fx * s + fy * c;
  }

  if (raw.tipo === "repartida") {
    if (raw.pos !== null)
      warnings.push(
        `Carga ${n}: "pos" solo aplica a puntual_barra; se ignora.`,
      );
    const desde = raw.desde ?? 0;
    const hasta = raw.hasta ?? 1;
    if (desde < 0 || hasta > 1 || desde >= hasta) {
      return `Carga ${n}: tramo parcial [${desde}, ${hasta}] inválido (debe estar en [0, 1] con desde < hasta)`;
    }
    if (esBiela) {
      const a = finalNodes.find((nd) => nd.id === target.i);
      const b = finalNodes.find((nd) => nd.id === target.j);
      if (a === undefined || b === undefined) {
        return `Carga ${n}: la barra ${raw.objetivo} referencia nudos inexistentes`;
      }
      // Resultante = w · longitud cargada (por metro DE BARRA en ambos ejes),
      // aplicada en el centroide del tramo → reparto por palanca.
      const len = (hasta - desde) * Math.hypot(b.x - a.x, b.y - a.y);
      return lumpBielaLoad(
        n,
        raw.objetivo,
        "repartida",
        target,
        gx * len,
        gy * len,
        (desde + hasta) / 2,
        finalNodes,
        lc,
        useCategory,
        used,
        warnings,
      );
    }
    return [
      {
        id: mintId("l", used),
        kind: "udl",
        lc,
        ...(useCategory !== undefined ? { useCategory } : {}),
        member: target.id,
        wx: fx,
        wy: fy,
        frame: ejes,
        ...(desde !== 0 || hasta !== 1 ? { from: desde, to: hasta } : {}),
      },
    ];
  }

  // puntual_barra
  if (raw.desde !== null || raw.hasta !== null) {
    warnings.push(
      `Carga ${n}: desde/hasta solo aplican a repartidas; se ignoran.`,
    );
  }
  if (raw.pos === null)
    return `Carga ${n}: falta pos (posición relativa 0–1 desde nudo_i)`;
  if (raw.pos < 0 || raw.pos > 1)
    return `Carga ${n}: pos ${raw.pos} fuera del rango [0, 1]`;
  if (esBiela) {
    return lumpBielaLoad(
      n,
      raw.objetivo,
      "puntual",
      target,
      gx,
      gy,
      raw.pos,
      finalNodes,
      lc,
      useCategory,
      used,
      warnings,
    );
  }
  return [
    {
      id: mintId("l", used),
      kind: "point-member",
      lc,
      ...(useCategory !== undefined ? { useCategory } : {}),
      member: target.id,
      pos: raw.pos,
      Fx: fx,
      Fy: fy,
      frame: ejes,
    },
  ];
}

// ── buildPlan ─────────────────────────────────────────────────────────────────

function structuralFieldsPresent(fields: Partial<Fem2DModel>): boolean {
  return (
    fields.nodes !== undefined ||
    fields.members !== undefined ||
    fields.supports !== undefined ||
    fields.loads !== undefined
  );
}

function buildFem2DPlan(
  payload: unknown,
  current: Fem2DModel,
  _system: unknown,
  confirmed?: ReadonlySet<string>,
): AiApplyPlan<Fem2DModel> {
  const x = parsePayload(payload);
  const fields: Partial<Fem2DModel> = {};
  const changes: AiFieldChange[] = [];
  const skipped: AiSkippedField[] = [];
  const warnings: string[] = [...x.warnings];
  const handled = new Set<PayloadKey>();

  // Pool COMPARTIDO de ids (nodos+barras+cargas): ver nextFreeId de modelOps.
  const usedIds = new Set<string>();
  for (const n of current.nodes) usedIds.add(n.id);
  for (const m of current.members) usedIds.add(m.id);
  for (const l of current.loads) usedIds.add(l.id);

  const curProj = projectModel2D(current);

  function skip(key: PayloadKey, reason: string): void {
    handled.add(key);
    skipped.push({ field: key, label: LABELS[key], reason });
  }

  function applied(key: PayloadKey, before: string, after: string): void {
    handled.add(key);
    changes.push({ field: key, label: LABELS[key], before, after });
  }

  // Atomicidad del bloque estructural: un error de VALIDACIÓN en una lista
  // veta las cuatro. Las posteriores ni se validan (validarlas contra una
  // topología a medias produce errores FANTASMA — "barra 1 no existe (hay 0)"
  // porque la lista de barras se descartó) y las ya aplicadas se retiran al
  // final con el motivo raíz. Antes, la mezcla "nudos nuevos + barras viejas"
  // llegaba al cross-check del solver y se rechazaba todo con ids internos
  // ('Barra cs1: nodo t2 no existe') inaccionables para el modelo y el usuario.
  // (skipInvalid devuelve el veto y se asigna en el sitio de llamada — una
  //  asignación dentro del closure sería invisible para el narrowing de TS.)
  let veto: { key: PayloadKey; error: string } | null = null;
  function skipInvalid(
    prev: { key: PayloadKey; error: string } | null,
    key: PayloadKey,
    error: string,
    suffix = "",
  ): { key: PayloadKey; error: string } {
    skip(key, `${error}${suffix}`);
    return prev ?? { key, error };
  }
  function skipDependiente(key: PayloadKey, rootKey: PayloadKey): void {
    skip(
      key,
      `No se aplica: forma bloque con "${LABELS[rootKey]}", que tiene un error — corrige ese error y reenvía las cuatro listas`,
    );
  }

  // Geometría/topología final vigente: apoyos y cargas se validan SIEMPRE
  // contra la lista final.
  let finalNodes: Fem2DNode[] = current.nodes;
  let finalMembers: Fem2DMember[] = current.members;
  let nudosApplied = false;
  let barrasApplied = false;

  // --- Nudos: REEMPLAZO completo, ids preservados posicionalmente ---
  if (x.nudos !== null) {
    const res = mapNudos(x.nudos, current, usedIds);
    if (typeof res === "string") {
      veto = skipInvalid(
        veto,
        "nudos",
        res,
        " — no se aplica ningún nudo (la lista reemplaza a la actual entera)",
      );
    } else {
      const afterProj: NudoProj[] = res.map((n) => ({ x: n.x, y: n.y }));
      if (sameProj(curProj.nudos, afterProj)) {
        skip("nudos", ALREADY);
      } else {
        fields.nodes = res;
        finalNodes = res;
        nudosApplied = true;
        applied("nudos", fmtNudos(curProj.nudos), fmtNudos(afterProj));
      }
    }
  }

  // --- Barras: REEMPLAZO completo con arrastre posicional ---
  if (x.barras !== null && !handled.has("barras")) {
    if (veto !== null) {
      skipDependiente("barras", veto.key);
    } else if (x.barras.length === 0) {
      veto = skipInvalid(
        veto,
        "barras",
        "El modelo necesita al menos una barra; la lista no puede quedar vacía",
      );
    } else {
      const barraWarnings: string[] = [];
      const res = mapBarras(
        x.barras,
        finalNodes,
        current,
        usedIds,
        barraWarnings,
      );
      if (typeof res === "string") {
        veto = skipInvalid(
          veto,
          "barras",
          res,
          " — no se aplica ninguna barra (la lista reemplaza a la actual entera)",
        );
      } else {
        const afterProj = projectModel2D({
          ...current,
          nodes: finalNodes,
          members: res,
        }).barras;
        if (!nudosApplied && sameProj(curProj.barras, afterProj)) {
          skip("barras", ALREADY);
        } else {
          warnings.push(...barraWarnings);
          fields.members = res;
          finalMembers = res;
          barrasApplied = true;
          applied("barras", fmtBarras(curProj.barras), fmtBarras(afterProj));
        }
      }
    }
  } else if (nudosApplied && x.barras === null) {
    // La geometría cambió sin lista de barras: sobreviven las que conservan
    // sus dos nudos (ids posicionales), se PODAN las huérfanas y se re-infieren
    // los roles auto pilar/viga (espejo de reinferRoles al mover nudos).
    const surviving = new Set(finalNodes.map((n) => n.id));
    const nodeById = new Map(finalNodes.map((n) => [n.id, n]));
    const kept: Fem2DMember[] = [];
    let pruned = 0;
    let touched = false;
    for (const m of current.members) {
      if (!surviving.has(m.i) || !surviving.has(m.j)) {
        pruned++;
        touched = true;
        continue;
      }
      let mm = m;
      if (m.roleManual !== true && (m.role === "pilar" || m.role === "viga")) {
        const role = inferRole(nodeById.get(m.i)!, nodeById.get(m.j)!);
        if (role !== m.role) {
          mm = { ...m, role };
          touched = true;
        }
      }
      kept.push(mm);
    }
    if (touched) fields.members = kept;
    finalMembers = kept;
    if (pruned > 0) {
      warnings.push(
        `${pruned} barra(s) eliminadas: su nudo desaparece con la nueva geometría. Al cambiar el número de nudos conviene enviar también "barras".`,
      );
    }
  }

  // --- Apoyos: lista completa sobre la geometría final ---
  if (x.apoyos !== null && !handled.has("apoyos")) {
    if (veto !== null) {
      skipDependiente("apoyos", veto.key);
    } else {
      const res = mapApoyos(x.apoyos, finalNodes);
      if (typeof res === "string") {
        veto = skipInvalid(
          veto,
          "apoyos",
          res,
          " — no se aplica ningún apoyo (la lista reemplaza a la actual entera)",
        );
      } else {
        const afterProj = projectModel2D({
          ...current,
          nodes: finalNodes,
          supports: res,
        }).apoyos;
        if (!nudosApplied && sameProj(curProj.apoyos, afterProj)) {
          skip("apoyos", ALREADY);
        } else {
          fields.supports = res;
          applied("apoyos", fmtApoyos(curProj.apoyos), fmtApoyos(afterProj));
        }
      }
    }
  } else if (nudosApplied && x.apoyos === null) {
    const surviving = new Set(finalNodes.map((n) => n.id));
    const kept = current.supports.filter((s) => surviving.has(s.node));
    if (kept.length !== current.supports.length) {
      fields.supports = kept;
      warnings.push(
        `${current.supports.length - kept.length} apoyo(s) eliminados: su nudo desaparece con la nueva geometría. Al cambiar el número de nudos conviene enviar también "apoyos".`,
      );
    }
  }

  // --- Cargas: REEMPLAZO completo, todo-o-nada, sobre la topología final ---
  if (x.cargas !== null && !handled.has("cargas")) {
    if (veto !== null) {
      skipDependiente("cargas", veto.key);
    } else {
      const cargaWarnings: string[] = [];
      const mapped: Fem2DLoad[] = [];
      let elementError: string | null = null;
      for (let i = 0; i < x.cargas.length; i++) {
        const res = mapCarga2D(
          x.cargas[i],
          i,
          finalNodes,
          finalMembers,
          usedIds,
          cargaWarnings,
        );
        if (typeof res === "string") {
          elementError = res;
          break;
        }
        mapped.push(...res);
      }
      if (elementError !== null) {
        veto = skipInvalid(
          veto,
          "cargas",
          elementError,
          " — no se aplica ninguna carga (la lista reemplaza a la actual entera)",
        );
      } else {
        const afterProj = projectModel2D({
          ...current,
          nodes: finalNodes,
          members: finalMembers,
          loads: mapped,
        }).cargas;
        if (
          !nudosApplied &&
          !barrasApplied &&
          sameProj(curProj.cargas, afterProj)
        ) {
          skip("cargas", ALREADY);
        } else {
          warnings.push(...cargaWarnings);
          fields.loads = mapped;
          applied("cargas", fmtCargas(curProj.cargas), fmtCargas(afterProj));
        }
      }
    }
  } else if ((nudosApplied || barrasApplied) && x.cargas === null) {
    const survivingMembers = new Set(finalMembers.map((m) => m.id));
    const survivingNodes = new Set(finalNodes.map((n) => n.id));
    const kept = current.loads.filter((l) =>
      l.kind === "node"
        ? survivingNodes.has(l.node)
        : survivingMembers.has(l.member),
    );
    if (kept.length !== current.loads.length) {
      fields.loads = kept;
      warnings.push(
        `${current.loads.length - kept.length} carga(s) eliminadas: su barra/nudo desaparece con la nueva geometría. Revisa la lista de cargas.`,
      );
    }
  }

  // --- Veto estructural: retirar lo ya aplicado con el motivo RAÍZ ---
  // (el cross-check del solver ya no ve candidatos incoherentes; sigue como
  //  red para propuestas coherentes que crean un mecanismo).
  if (veto !== null && structuralFieldsPresent(fields)) {
    const blockReason = `No se aplica en bloque: "${LABELS[veto.key]}" tiene un error (${veto.error}) — las cuatro listas deben quedar coherentes; corrige y reenvía la estructura completa`;
    for (const key of ["nudos", "barras", "apoyos", "cargas"] as const) {
      const idx = changes.findIndex((c) => c.field === key);
      if (idx !== -1) {
        changes.splice(idx, 1);
        skipped.push({ field: key, label: LABELS[key], reason: blockReason });
      }
    }
    delete fields.nodes;
    delete fields.members;
    delete fields.supports;
    delete fields.loads;
    // Las podas en cascada (nudos sin "barras"/"apoyos"/"cargas") quedaron sin
    // efecto: retirar sus avisos para no anunciar eliminaciones que no ocurren.
    for (let i = warnings.length - 1; i >= 0; i--) {
      if (
        warnings[i].includes("desaparece con la nueva geometría") ||
        warnings[i].includes("su barra/nudo desaparece")
      ) {
        warnings.splice(i, 1);
      }
    }
  }

  // --- Peso propio ---
  if (x.peso_propio !== null) {
    if (x.peso_propio === current.selfWeight) {
      skip("peso_propio", ALREADY);
    } else {
      fields.selfWeight = x.peso_propio;
      handled.add("peso_propio");
      changes.push({
        field: "selfWeight",
        label: LABELS.peso_propio,
        before: current.selfWeight ? "Automático (activado)" : "Desactivado",
        after: x.peso_propio ? "Automático (activado)" : "Desactivado",
      });
    }
  }

  // --- Procedencia: un cambio estructural aplicado estampa 'custom' (espejo
  //     de las ops del lienzo — el PDF deja de atribuir el modelo a la semilla).
  if (structuralFieldsPresent(fields) && current.templateId !== "custom") {
    fields.templateId = "custom";
  }

  // --- Cross-check final: el SOLVER sobre el candidato (semántica applyGuard:
  //     solo un fallo NUEVO respecto al modelo vigente descarta) ---
  if (structuralFieldsPresent(fields)) {
    const failKey = (e: ModelError): string => `${e.code}:${e.msg}`;
    const beforeFails = new Set(
      solveFem2D(current)
        .errors.filter((e) => e.severity === "fail")
        .map(failKey),
    );
    const candidate: Fem2DModel = { ...current, ...fields };
    const candRes = solveFem2D(candidate);
    const newFails = candRes.errors.filter(
      (e) => e.severity === "fail" && !beforeFails.has(failKey(e)),
    );
    if (newFails.length > 0) {
      const reason = `La propuesta dejaría el modelo inválido: ${newFails.map((e) => e.msg).join(" · ")} — corrige y reenvía la estructura completa`;
      for (const key of ["nudos", "barras", "apoyos", "cargas"] as const) {
        const idx = changes.findIndex((c) => c.field === key);
        if (idx !== -1) {
          changes.splice(idx, 1);
          skipped.push({ field: key, label: LABELS[key], reason });
        }
      }
      delete fields.nodes;
      delete fields.members;
      delete fields.supports;
      delete fields.loads;
      delete fields.templateId;
    } else {
      for (const e of candRes.errors) {
        if (e.severity === "warn")
          warnings.push(`Aviso de validación: ${e.msg}`);
      }
    }
  }

  // --- notFound ---
  const untouched: Record<PayloadKey, boolean> = {
    nudos: x.nudos === null,
    barras: x.barras === null,
    apoyos: x.apoyos === null,
    cargas: x.cargas === null,
    peso_propio: x.peso_propio === null,
  };
  const notFound: string[] = [];
  for (const key of KEY_ORDER) {
    if (untouched[key] && !handled.has(key)) notFound.push(LABELS[key]);
  }

  // --- Riesgos: escalares + elementos, en el ESPACIO DEL PAYLOAD ---
  const baseline = presetBaseline(current);
  const scalarDefaults: Fem2DModel = baseline ?? {
    ...current,
    selfWeight: !current.selfWeight,
  };
  const baseProj = baseline !== null ? projectModel2D(baseline) : null;

  const finalModel: Fem2DModel = { ...current, ...fields };
  const finalProj = structuralFieldsPresent(fields)
    ? projectModel2D(finalModel)
    : null;
  const proposedNudos =
    fields.nodes !== undefined && finalProj !== null
      ? finalProj.nudos
      : undefined;
  const proposedBarras =
    fields.members !== undefined && finalProj !== null
      ? finalProj.barras
      : undefined;
  const proposedCargas =
    fields.loads !== undefined && finalProj !== null
      ? finalProj.cargas
      : undefined;

  const risks = [
    ...detectSafetyRisks(
      FEM2D_SAFETY_RULES,
      changes,
      fields,
      current,
      scalarDefaults,
      confirmed,
    ),
    ...detectElementRisks(
      NUDOS_ELEMENT_RULES,
      proposedNudos,
      curProj.nudos,
      baseProj?.nudos ?? [],
      NUDOS_RISK_CTX,
      confirmed,
    ),
    ...detectElementRisks(
      BARRAS_ELEMENT_RULES,
      proposedBarras,
      curProj.barras,
      baseProj?.barras ?? [],
      BARRAS_RISK_CTX,
      confirmed,
    ),
    ...detectElementRisks(
      CARGAS2D_ELEMENT_RULES,
      proposedCargas,
      curProj.cargas,
      baseProj?.cargas ?? [],
      CARGAS2D_RISK_CTX,
      confirmed,
    ),
  ];

  return { fields, changes, skipped, notFound, warnings, notes: null, risks };
}

// ── Snapshot ──────────────────────────────────────────────────────────────────

function buildSnapshot2D(c: Fem2DModel): string {
  const proj = projectModel2D(c);

  const valores: Record<string, unknown> = {
    nudos: proj.nudos,
    barras: proj.barras,
    apoyos: proj.apoyos,
    cargas: proj.cargas,
    peso_propio: c.selfWeight,
  };

  // Contexto de SOLO LECTURA — dentro de `valores` (decorateSnapshot descarta
  // cualquier clave hermana de primer nivel tras la primera propuesta). Las
  // rótulas ya NO van aquí: desde la Fase B viajan en barras[].rotulas.
  const haPendientes = c.members
    .map((m, k) => ({ m, k }))
    .filter(({ m }) => m.material === "rc")
    .map(({ m, k }) => {
      const sec = m.rcSection
        ? `${m.rcSection.b}×${m.rcSection.h} cm HA-${m.rcSection.fck}`
        : "sin sección";
      return `Barra ${k + 1} es de hormigón (${sec}): se comprueba con su armado, pero el chat no puede editar su sección/armado (solo el inspector del lienzo)`;
    });
  if (haPendientes.length > 0) valores.barras_ha = haPendientes;

  const maderaPendientes = c.members
    .map((m, k) => ({ m, k }))
    .filter(({ m }) => m.material === "timber")
    .map(({ m, k }) => {
      const sec = m.timberSection
        ? `${m.timberSection.gradeId} ${m.timberSection.b}×${m.timberSection.h} mm, clase de servicio ${m.timberSection.serviceClass}`
        : "sin sección";
      return `Barra ${k + 1} es de madera (${sec}): se comprueba con esa sección EC5, pero el chat no puede editarla (solo el inspector del lienzo)`;
    });
  if (maderaPendientes.length > 0) valores.barras_madera = maderaPendientes;

  // sin_confirmar: claves cuya proyección coincide con la plantilla semilla.
  // templateId 'custom' ⇒ todo se considera ESTABLECIDO (lista vacía).
  const baseline = presetBaseline(c);
  const sinConfirmar: string[] = [];
  if (baseline !== null) {
    const baseProj = projectModel2D(baseline);
    if (sameProj(proj.nudos, baseProj.nudos)) sinConfirmar.push("nudos");
    if (sameProj(proj.barras, baseProj.barras)) sinConfirmar.push("barras");
    if (sameProj(proj.apoyos, baseProj.apoyos)) sinConfirmar.push("apoyos");
    if (sameProj(proj.cargas, baseProj.cargas)) sinConfirmar.push("cargas");
    if (c.selfWeight === baseline.selfWeight) sinConfirmar.push("peso_propio");
  }
  valores.plantilla = c.templateId;
  valores.modelo_de_plantilla = sinConfirmar.length === KEY_ORDER.length;

  return JSON.stringify({ valores, sin_confirmar: sinConfirmar });
}

// ── Resumen de resultados ─────────────────────────────────────────────────────

const ROL_LABEL: Record<MemberRole, string> = {
  pilar: "pilar",
  viga: "viga",
  cordon: "cordón",
  diagonal: "diagonal",
  montante: "montante",
};

function memberDesc(m: Fem2DMember, index: number): string {
  const perfil =
    m.material === "rc"
      ? m.rcSection
        ? `HA ${m.rcSection.b}×${m.rcSection.h}`
        : "HA"
      : m.material === "timber"
        ? m.timberSection
          ? `${m.timberSection.gradeId} ${m.timberSection.b}×${m.timberSection.h}`
          : "madera"
        : m.steelSelection !== undefined
          ? `${perfilName(m.steelSelection.profileKey)} ${m.steelSelection.steel}`
          : "acero";
  return `Barra ${index + 1} '${m.id}' (${ROL_LABEL[m.role]} ${perfil})`;
}

/**
 * Reacciones por apoyo, envolvente firmada de las combinaciones ELU
 * multi-principal (frame-core, factores Tabla 4.2 PLANOS: las reacciones son
 * equilibrio con las cargas reales — la amplificación αcr es un artificio de
 * diseño de barras y no se aplica aquí). Por componente se conserva el valor
 * de la combinación pésima en valor absoluto, con su signo.
 */
function reactionExtras(
  model: Fem2DModel,
  result: Fem2DAnalysisResult,
): string[] {
  if (model.supports.length === 0) return [];
  const eluCombos = buildLcCombinations(model.loads).ELU;
  const nodeIdx = new Map(model.nodes.map((n, k) => [n.id, k + 1]));
  const byLc = new Map<string, Map<string, Reaction2D>>();
  for (const [lc, list] of Object.entries(result.reactionsByLc)) {
    byLc.set(lc, new Map(list.map((r) => [r.node, r])));
  }
  const supports = [...model.supports].sort(
    (s1, s2) => (nodeIdx.get(s1.node) ?? 0) - (nodeIdx.get(s2.node) ?? 0),
  );
  const parts: string[] = [];
  for (const s of supports) {
    const idx = nodeIdx.get(s.node);
    if (idx === undefined) continue;
    let Rx = 0;
    let Ry = 0;
    let Mr = 0;
    for (const factors of eluCombos) {
      let rx = 0;
      let ry = 0;
      let mr = 0;
      for (const [lc, f] of Object.entries(factors)) {
        const r = byLc.get(lc)?.get(s.node);
        if (r === undefined || !f) continue;
        rx += f * r.Rx;
        ry += f * r.Ry;
        mr += f * r.Mr;
      }
      if (Math.abs(rx) > Math.abs(Rx)) Rx = rx;
      if (Math.abs(ry) > Math.abs(Ry)) Ry = ry;
      if (Math.abs(mr) > Math.abs(Mr)) Mr = mr;
    }
    const segs = [`Rx=${Rx.toFixed(1)} kN`, `Ry=${Ry.toFixed(1)} kN`];
    if (Math.abs(Mr) > 1e-9) segs.push(`Mr=${Mr.toFixed(1)} kN·m`);
    parts.push(`nudo ${idx} (${SUPPORT_TO_APOYO[s.type]}): ${segs.join(", ")}`);
  }
  if (parts.length === 0) return [];
  return [
    `Reacciones en apoyos (envolvente ELU, ejes del mundo, +y arriba): ${parts.join(" · ")}`,
  ];
}

/**
 * Fem2DAnalysisResult → resumen para el prompt. El veredicto del chat coincide
 * con el badge del módulo POR CONSTRUCCIÓN: cada MemberCheck se convierte en un
 * CheckRow con toStatus(eta) (el mismo toStatus/maxEta del bundle) y el estado
 * 'pending' contagioso del bundle (F1) fuerza el veredicto 'invalid' con un
 * rótulo PENDIENTE — un η bajo de las barras comprobadas nunca compra un verde
 * si otra barra quedó sin comprobar.
 */
export function summarizeFem2DResults(
  model: Fem2DModel,
  result: Fem2DAnalysisResult,
): AiResultsSummary {
  if (!result.ok || result.checks === null) {
    const failMsgs = result.errors
      .filter((e) => e.severity === "fail")
      .map((e) => e.msg);
    return summarizeCalcResults({
      valid: false,
      error:
        failMsgs.length > 0
          ? failMsgs.join(" · ")
          : "El modelo no se pudo resolver.",
      checks: [],
    });
  }
  const bundle = result.checks;

  const checks: CheckRow[] = [];
  const pendingLines: string[] = [];
  model.members.forEach((m, k) => {
    const verdict = bundle.perMember[m.id];
    if (verdict === undefined) return;
    const desc = memberDesc(m, k);
    if (verdict.status === "pending") {
      pendingLines.push(
        `${desc}: PENDIENTE — ${verdict.checks.map((c) => c.val).join("; ")}`,
      );
      return;
    }
    verdict.checks.forEach((c) => {
      checks.push({
        id: `${m.id}-${c.id}`,
        description: `${desc} — ${c.name}`,
        valueStr: c.val,
        utilization: c.eta,
        // El status explícito de fila (motor HA: fail N/A con η inexpresable)
        // gana a la derivación por η.
        status: c.status ?? toStatus(c.eta),
        article: c.ref,
      });
    });
  });

  for (const g of bundle.globalChecks) {
    checks.push({
      id: g.id,
      description: g.name,
      valueStr: g.val,
      utilization: g.eta,
      status: toStatus(g.eta),
      article: g.ref,
    });
  }

  const extras: string[] = [
    `η máximo global = ${Math.round(bundle.maxEta * 100)}%`,
  ];
  if (bundle.amplified) {
    extras.push(
      "Efectos de 2º orden: los factores de las hipótesis laterales (W/E) van amplificados por αcr (método de momentos amplificados, β=1).",
    );
  }
  extras.push(...reactionExtras(model, result));
  extras.push(...pendingLines);
  for (const e of result.errors) {
    if (e.severity === "warn") extras.push(`Aviso del modelo: ${e.msg}`);
  }

  const summary = summarizeCalcResults({ valid: true, checks }, extras);
  if (bundle.status === "pending") {
    const motivo =
      model.members.length === 0
        ? "el modelo no tiene barras"
        : "hay barras sin comprobar (armado HA o sección de madera sin definir, viga HA comprimida esbelta λ > λ_lim — compruébala como pilar —, rol o perfil no soportado)";
    return {
      verdict: "invalid",
      text: `PENDIENTE: ${motivo} — el veredicto global no está disponible todavía.\n${summary.text}`,
    };
  }
  return summary;
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export const fem2dAdapter: AiModuleAdapter<Fem2DModel> = {
  id: "fem-2d",
  label: "FEM 2D — Pórticos y cerchas",
  payloadSchema: FEM2D_PAYLOAD_SCHEMA,
  promptRules: PROMPT_RULES,
  placeholder: PLACEHOLDER_EXAMPLE,
  snapshot: buildSnapshot2D,
  buildPlan: buildFem2DPlan,
};
