/**
 * Adapter del asistente IA para el módulo FEM 1D (ola 5 — el 18 de 18).
 *
 * FEM es el único módulo cuyo estado NO es un formulario plano: es un
 * `DesignModel` anidado (nodos/barras/apoyos/cargas) editado vía
 * `setModel` con historial de undo. El adapter salva esa distancia con una
 * PROYECCIÓN plana de la tira colineal V1:
 *
 *   payload  { vanos, apoyos, cargas, peso_propio }  ←→  DesignModel
 *
 * - `vanos` es la lista de luces+secciones de izquierda a derecha (REEMPLAZO
 *   completo; un null DENTRO de un vano = conservar el dato actual de ese
 *   vano, posicional). `apoyos` tiene SIEMPRE vanos+1 entradas ('libre' =
 *   sin apoyo: voladizos y nodos de paso). `cargas` reemplaza la lista entera.
 * - buildPlan RECONSTRUYE nodos/barras/apoyos/cargas con ids preservados
 *   posicionalmente (nunca reindexa: la selección del canvas y el diff visual
 *   sobreviven) y ARRASTRE de sección/armado en los vanos que ya existían.
 * - Cross-check final: `validateModel` (invariants.ts) sobre el modelo
 *   candidato — una propuesta que dejaría el lienzo inválido (sin apoyos,
 *   mecanismo) se convierte en skip con el mensaje del validador, para que el
 *   modelo corrija al turno siguiente en vez de romper el módulo.
 * - El armado HA, los detalles de acero (Lcr, límite de flecha) y las rótulas
 *   internas son de SOLO LECTURA en esta fase: viajan como contexto DENTRO de
 *   `valores` (decorateSnapshot descarta cualquier clave hermana). Sus nombres
 *   (`armados`, `acero_detalles`, `rotulas`) ya coinciden con las futuras
 *   claves del payload de la Fase B para no cambiar de vocabulario.
 * - Patrón plantilla (masonry): `modelo_de_plantilla` marca que lo que ve el
 *   modelo es un preset de la app, no datos del usuario.
 *
 * Trampa de signos verificada: `PointNodeLoad.Py` es SIGNADO con positivo =
 * HACIA ABAJO (autoDecompose lo niega en la frontera al solver), mientras que
 * UDL y puntuales de barra usan magnitud positiva + `dir`. El payload unifica
 * todo en `valor` positivo + `dir` ('abajo' = gravedad) y la conversión vive
 * solo aquí.
 */
import { AiError } from '../types';
import type {
  AiApplyPlan,
  AiFieldChange,
  AiModuleAdapter,
  AiSkippedField,
} from './types';
import { summarizeCalcResults, type AiResultsSummary } from '../resultsSummary';
import {
  detectElementRisks,
  detectSafetyRisks,
  higherIsSafer,
  lowerIsSafer,
  ordinalLevel,
  trueIsSafer,
  type ElementSafetyRule,
  type SafetyRule,
} from '../safety';
import { toStatus, type CheckRow } from '../../calculations/types';
import { STEEL_SECTION_ENTRIES } from '../../sections';
import type {
  ArmadoHA,
  DesignBar,
  DesignModel,
  Load,
  LoadCase,
  Node,
  RcSection,
  SolveResult,
  SteelSelection,
  Support,
  SupportType,
  UseCategoryCode,
} from '../../../features/fem-analysis/types';
import {
  DEFAULT_APOYO_ARMADO,
  DEFAULT_RC_SECTION,
  DEFAULT_STEEL_SELECTION,
  DEFAULT_VANO_ARMADO,
  FCK_OPTIONS,
  MAT,
  cloneDesignPreset,
  type DesignPresetId,
} from '../../../features/fem-analysis/presets';
import {
  MIN_BAR_LENGTH_M,
  validateModel,
} from '../../../features/fem-analysis/invariants';

// ── Catálogos del módulo ──────────────────────────────────────────────────────

/**
 * Perfiles proponibles por chat: nombre humano → clave del catálogo unificado.
 * Enum CERRADO a propósito: `autoDecompose` hace `MAT[profileKey]` y una clave
 * inexistente da EI = 0 EN SILENCIO (viga de goma con diagramas plausibles).
 * DERIVADO del registro (todas las familias con motor de flexión: I/H, 2UPN,
 * SHS/RHS/CHS); se excluye la familia L: los angulares son solo-axil y el
 * check de barra 1D mentiría sobre el perfil realmente comprobado.
 */
const PERFIL_CATALOG: Record<string, string> = Object.fromEntries(
  STEEL_SECTION_ENTRIES.filter((e) => e.family !== 'L').map((e) => [e.label, e.key]),
);
const PERFIL_NAMES = Object.keys(PERFIL_CATALOG);

const MATERIALS = ['rc', 'steel'] as const;
const ACEROS = ['S275', 'S355'] as const;
const APOYOS = ['articulado', 'deslizante', 'empotrado', 'muelle', 'libre'] as const;
type ApoyoName = (typeof APOYOS)[number];
const CARGA_TIPOS = ['repartida', 'puntual_vano', 'puntual_nudo'] as const;
type CargaTipo = (typeof CARGA_TIPOS)[number];
const DIRS = ['abajo', 'arriba'] as const;
type DirName = (typeof DIRS)[number];
const HIPOTESIS = ['G', 'Q', 'W', 'S', 'E'] as const;
/** Sin 'custom': su ψ₂ lo decidiría otro campo y sería la puerta de escape del ordinal (fuga 2). */
const CATEGORIAS = ['A1', 'A2', 'B', 'C1', 'C2', 'C3', 'D1', 'E1', 'G1'] as const;
type CategoriaName = (typeof CATEGORIAS)[number];

const APOYO_TO_SUPPORT: Record<Exclude<ApoyoName, 'libre'>, SupportType> = {
  articulado: 'pinned',
  deslizante: 'roller',
  empotrado: 'fixed',
  muelle: 'spring',
};
const SUPPORT_TO_APOYO: Record<SupportType, ApoyoName> = {
  pinned: 'articulado',
  roller: 'deslizante',
  fixed: 'empotrado',
  spring: 'muelle',
};

// ── Payload schema ────────────────────────────────────────────────────────────

export const FEM_PAYLOAD_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['vanos', 'apoyos', 'cargas', 'peso_propio', 'warnings'],
  properties: {
    vanos: {
      type: ['array', 'null'],
      description: 'Lista COMPLETA de vanos de IZQUIERDA a DERECHA (REEMPLAZA la actual entera; null = sin cambio de geometría/secciones). El vano k va del apoyo k al k+1. Dentro de un vano, un campo null = conservar el valor actual de ese vano (posicional) o el default si el vano es nuevo. Si cambias el NÚMERO de vanos, envía también "apoyos".',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['longitud_m', 'material', 'b_cm', 'h_cm', 'fck', 'perfil', 'acero'],
        properties: {
          longitud_m: { type: ['number', 'null'], description: 'Luz del vano en METROS. null = conservar la actual (solo en vanos que ya existen).' },
          material: { type: ['string', 'null'], enum: [...MATERIALS, null], description: 'rc = hormigón armado, steel = perfil de acero. null = conservar.' },
          b_cm: { type: ['number', 'null'], description: 'Ancho b de la sección HA en cm. Solo material rc.' },
          h_cm: { type: ['number', 'null'], description: 'Canto h de la sección HA en cm. Solo material rc.' },
          fck: { type: ['integer', 'null'], enum: [...FCK_OPTIONS, null], description: 'Resistencia del hormigón en MPa. Solo rc.' },
          perfil: { type: ['string', 'null'], enum: [...PERFIL_NAMES, null], description: 'Perfil del catálogo (nombre EXACTO: "IPE 240", "HEB 200"…). Solo material steel.' },
          acero: { type: ['string', 'null'], enum: [...ACEROS, null], description: 'Grado del acero. Solo material steel.' },
        },
      },
    },
    apoyos: {
      type: ['array', 'null'],
      description: 'Condición de apoyo de CADA nudo, de izquierda a derecha. Longitud OBLIGATORIA = vanos + 1. "libre" = sin apoyo (extremo de voladizo o nudo de paso). "muelle" se comporta como deslizante en V1. REEMPLAZA la lista entera; null = sin cambio.',
      items: { type: 'string', enum: [...APOYOS] },
    },
    cargas: {
      type: ['array', 'null'],
      description: 'Lista COMPLETA de cargas (REEMPLAZA la actual entera; [] = sin cargas; null = sin cambio). CONSERVA el orden de las cargas existentes y añade las nuevas al final.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['tipo', 'objetivo', 'valor', 'dir', 'pos', 'desde', 'hasta', 'hipotesis', 'categoria_uso'],
        properties: {
          tipo: { type: 'string', enum: [...CARGA_TIPOS], description: 'repartida (kN/m sobre un vano), puntual_vano (kN dentro de un vano), puntual_nudo (kN en un nudo).' },
          objetivo: { type: 'integer', description: 'Índice 1-based: nº de VANO (repartida, puntual_vano) o nº de NUDO (puntual_nudo).' },
          valor: { type: 'number', description: 'Magnitud SIEMPRE POSITIVA: kN/m (repartida) o kN (puntuales). El sentido va en "dir".' },
          dir: { type: 'string', enum: [...DIRS], description: '"abajo" = gravedad (lo normal); "arriba" = ascendente.' },
          pos: { type: ['number', 'null'], description: 'Posición relativa 0–1 dentro del vano. OBLIGATORIA en puntual_vano; null en el resto.' },
          desde: { type: ['number', 'null'], description: 'Inicio relativo 0–1 de una repartida PARCIAL. null = 0 (desde el inicio del vano).' },
          hasta: { type: ['number', 'null'], description: 'Fin relativo 0–1 de una repartida PARCIAL. null = 1 (hasta el final del vano).' },
          hipotesis: { type: 'string', enum: [...HIPOTESIS], description: 'G permanente, Q sobrecarga de uso, W viento, S nieve, E sismo.' },
          categoria_uso: { type: ['string', 'null'], enum: [...CATEGORIAS, null], description: 'Categoría de uso CTE Tabla 3.1 (fija las ψ). SOLO con hipotesis Q; null con Q ⇒ se asume B con aviso.' },
        },
      },
    },
    peso_propio: { type: ['boolean', 'null'], description: 'true = el programa añade automáticamente el peso propio de cada barra como carga G. NO lo dupliques en "cargas".' },
    warnings: { type: 'array', items: { type: 'string' }, description: 'Avisos: conversiones de unidades, ambigüedades, datos del enunciado ignorados.' },
  },
};

// ── Prompt del módulo ─────────────────────────────────────────────────────────

const PROMPT_RULES = `Reglas específicas del módulo FEM 1D (viga continua):
1. UNIDADES: luces en m, cargas en kN/m y kN, secciones HA en cm, fck en MPa. Añade un warning por cada conversión que hagas.
2. ÍNDICES 1-based: el vano k va del nudo k al k+1. "apoyos" DEBE tener exactamente vanos+1 entradas ("libre" donde no hay apoyo: así se hacen los voladizos). Si cambias el NÚMERO de vanos, envía SIEMPRE también "apoyos" con la longitud nueva.
3. REEMPLAZO: cada array se envía COMPLETO o null (= sin cambio). Dentro de "vanos", un campo null = conservar el dato actual de ese vano. NO reordenes las cargas existentes: mismas posiciones, las nuevas al final.
4. SIGNOS: "valor" es SIEMPRE positivo; el sentido va en "dir" ("abajo" = gravedad, lo normal). No propongas valores negativos.
5. PESO PROPIO: con peso_propio=true el programa lo añade solo como carga G — no lo dupliques en "cargas". Si el usuario da una "carga total", pregunta si incluye el peso propio.
6. HIPÓTESIS: G/Q/W/S/E por carga; "categoria_uso" (CTE Tabla 3.1) solo con Q. Si el usuario no da la categoría, usa B con un aviso "Sugerencia:". Las cargas son valores CARACTERÍSTICOS sin mayorar (el programa aplica γ y ψ).
7. LÍMITES V1: viga continua COLINEAL (sin pórticos, cerchas ni pilares); el apoyo "muelle" se comporta como deslizante. El ARMADO del hormigón, los detalles de acero (Lcr, límite de flecha) y las RÓTULAS internas aparecen en el estado pero son de SOLO LECTURA: se editan en el panel del módulo (en móvil, pestaña Datos) — dilo cuando el usuario pida cambiarlos.
8. MATERIALES: rc necesita b_cm/h_cm/fck; steel necesita "perfil" EXACTO del catálogo y "acero". Al cambiar el material de un vano se aplican defaults razonables donde falte dato (avísalo y sugiere revisar el armado).
9. Si "modelo_de_plantilla" es true, TODO lo que ves (luces, apoyos, cargas, secciones) es una plantilla de la aplicación, NO datos del usuario: pregúntalos antes de dar por bueno ningún veredicto.
10. Si una propuesta estructural se descartó con un motivo del validador (estructura inestable, apoyos insuficientes…), corrígela en el turno siguiente — no la repitas igual.`;

const PLACEHOLDER_EXAMPLE =
  'Ej.: Viga continua de dos vanos de 5 y 4 m en HA 30×50, apoyos articulados, '
  + 'carga permanente de 15 kN/m y sobrecarga de uso de 10 kN/m (vivienda).';

// ── Parseo defensivo ──────────────────────────────────────────────────────────

interface VanoPayload {
  longitud_m: number | null;
  material: 'rc' | 'steel' | null;
  b_cm: number | null;
  h_cm: number | null;
  fck: number | null;
  perfil: string | null;
  acero: 'S275' | 'S355' | null;
}

interface CargaPayload {
  tipo: CargaTipo | null;
  objetivo: number | null;
  valor: number | null;
  dir: DirName | null;
  pos: number | null;
  desde: number | null;
  hasta: number | null;
  hipotesis: LoadCase | null;
  categoria_uso: CategoriaName | null;
}

interface FemPayload {
  vanos: VanoPayload[] | null;
  apoyos: (ApoyoName | null)[] | null;
  cargas: CargaPayload[] | null;
  peso_propio: boolean | null;
  warnings: string[];
}

function finiteNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[]): T | null {
  return (allowed as readonly unknown[]).includes(v) ? (v as T) : null;
}

function parseVano(raw: unknown): VanoPayload {
  const r = (typeof raw === 'object' && raw !== null && !Array.isArray(raw))
    ? (raw as Record<string, unknown>)
    : {};
  return {
    longitud_m: finiteNumber(r.longitud_m),
    material: oneOf(r.material, MATERIALS),
    b_cm: finiteNumber(r.b_cm),
    h_cm: finiteNumber(r.h_cm),
    fck: finiteNumber(r.fck),
    perfil: typeof r.perfil === 'string' ? r.perfil : null,
    acero: oneOf(r.acero, ACEROS),
  };
}

function parseCarga(raw: unknown): CargaPayload {
  const r = (typeof raw === 'object' && raw !== null && !Array.isArray(raw))
    ? (raw as Record<string, unknown>)
    : {};
  return {
    tipo: oneOf(r.tipo, CARGA_TIPOS),
    objetivo: finiteNumber(r.objetivo),
    valor: finiteNumber(r.valor),
    dir: oneOf(r.dir, DIRS),
    pos: finiteNumber(r.pos),
    desde: finiteNumber(r.desde),
    hasta: finiteNumber(r.hasta),
    hipotesis: oneOf(r.hipotesis, HIPOTESIS),
    categoria_uso: oneOf(r.categoria_uso, CATEGORIAS),
  };
}

function parsePayload(raw: unknown): FemPayload {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new AiError('bad-response', 'La propuesta del modelo no es un objeto JSON.');
  }
  const r = raw as Record<string, unknown>;
  return {
    vanos: Array.isArray(r.vanos) ? r.vanos.map(parseVano) : null,
    apoyos: Array.isArray(r.apoyos) ? r.apoyos.map((a) => oneOf(a, APOYOS)) : null,
    cargas: Array.isArray(r.cargas) ? r.cargas.map(parseCarga) : null,
    peso_propio: typeof r.peso_propio === 'boolean' ? r.peso_propio : null,
    warnings: Array.isArray(r.warnings)
      ? r.warnings.filter((w): w is string => typeof w === 'string')
      : [],
  };
}

// ── Proyección DesignModel → tira colineal ────────────────────────────────────

interface StripSpan {
  bar: DesignBar;
  leftNodeId: string;
  rightNodeId: string;
  L: number; // m
}

interface StripProjection {
  /** Nodos ordenados por x (nodes[k] = nudo k del payload, 1-based hacia fuera). */
  nodes: Node[];
  /** spans[k] une nodes[k] con nodes[k+1]. */
  spans: StripSpan[];
}

/**
 * Ordena los nodos por x y exige que cada par consecutivo esté unido por
 * exactamente una barra (en cualquier orientación i/j). La UI V1 solo produce
 * tiras limpias; un ?model= manipulado podría no serlo → null y el adapter
 * degrada a "estructura de solo lectura".
 */
export function projectStrip(model: DesignModel): StripProjection | null {
  if (model.nodes.length < 2) return null;
  if (model.bars.length !== model.nodes.length - 1) return null;
  if (!model.nodes.every((n) => n.y === 0)) return null;
  const nodes = [...model.nodes].sort((a, b) => a.x - b.x);
  const spans: StripSpan[] = [];
  for (let k = 0; k < nodes.length - 1; k++) {
    const a = nodes[k].id;
    const b = nodes[k + 1].id;
    const bar = model.bars.find(
      (bb) => (bb.i === a && bb.j === b) || (bb.i === b && bb.j === a),
    );
    if (bar === undefined) return null;
    spans.push({ bar, leftNodeId: a, rightNodeId: b, L: round2(nodes[k + 1].x - nodes[k].x) });
  }
  return { nodes, spans };
}

// ── Proyecciones al espacio del payload ───────────────────────────────────────

interface VanoProj {
  longitud_m: number;
  material: 'rc' | 'steel';
  b_cm: number | null;
  h_cm: number | null;
  fck: number | null;
  perfil: string | null;
  acero: string | null;
}

interface CargaProj {
  tipo: CargaTipo;
  objetivo: number;
  valor: number;
  dir: DirName;
  pos: number | null;
  desde: number | null;
  hasta: number | null;
  hipotesis: LoadCase;
  /** Normalizada: Q sin categoría ⇒ 'B' (el default del motor); no-Q ⇒ null. */
  categoria_uso: string | null;
}

function perfilName(profileKey: string): string {
  return MAT[profileKey]?.name ?? profileKey;
}

function projectVanos(strip: StripProjection): VanoProj[] {
  return strip.spans.map((s) => {
    if (s.bar.material === 'rc') {
      const sec = s.bar.rcSection;
      return {
        longitud_m: s.L, material: 'rc' as const,
        b_cm: sec?.b ?? null, h_cm: sec?.h ?? null, fck: sec?.fck ?? null,
        perfil: null, acero: null,
      };
    }
    const sel = s.bar.steelSelection;
    return {
      longitud_m: s.L, material: 'steel' as const,
      b_cm: null, h_cm: null, fck: null,
      perfil: sel ? perfilName(sel.profileKey) : null,
      acero: sel?.steel ?? null,
    };
  });
}

function projectApoyos(strip: StripProjection, supports: readonly Support[]): ApoyoName[] {
  const byNode = new Map(supports.map((s) => [s.node, s.type]));
  return strip.nodes.map((n) => {
    const t = byNode.get(n.id);
    return t === undefined ? 'libre' : SUPPORT_TO_APOYO[t];
  });
}

function projectCargas(strip: StripProjection, loads: readonly Load[]): CargaProj[] {
  const barIdx = new Map(strip.spans.map((s, k) => [s.bar.id, k + 1]));
  const nodeIdx = new Map(strip.nodes.map((n, k) => [n.id, k + 1]));
  const out: CargaProj[] = [];
  for (const l of loads) {
    const categoria = l.lc === 'Q' ? (l.useCategory ?? 'B') : null;
    if (l.kind === 'udl') {
      const k = barIdx.get(l.bar);
      if (k === undefined) continue; // referencia rota — la caza validateModel
      out.push({
        tipo: 'repartida', objetivo: k, valor: round2(l.w),
        dir: l.dir === '-y' ? 'abajo' : 'arriba',
        pos: null, desde: l.from ?? null, hasta: l.to ?? null,
        hipotesis: l.lc, categoria_uso: categoria,
      });
    } else if (l.kind === 'point-bar') {
      const k = barIdx.get(l.bar);
      if (k === undefined) continue;
      out.push({
        tipo: 'puntual_vano', objetivo: k, valor: round2(l.P),
        dir: l.dir === '-y' ? 'abajo' : 'arriba',
        pos: l.pos, desde: null, hasta: null,
        hipotesis: l.lc, categoria_uso: categoria,
      });
    } else {
      const k = nodeIdx.get(l.node);
      if (k === undefined) continue;
      const py = l.Py ?? 0;
      // Py SIGNADO, positivo = hacia abajo (convención del modelo de datos).
      out.push({
        tipo: 'puntual_nudo', objetivo: k, valor: round2(Math.abs(py)),
        dir: py >= 0 ? 'abajo' : 'arriba',
        pos: null, desde: null, hasta: null,
        hipotesis: l.lc, categoria_uso: categoria,
      });
    }
  }
  return out;
}

// ── Baseline de plantilla (gate anti-ruido y bandera de plantilla) ────────────

function presetBaseline(current: DesignModel): DesignModel | null {
  const id = current.presetCode;
  if (id === 'beam' || id === 'cantilever' || id === 'continuous') {
    return cloneDesignPreset(id as DesignPresetId);
  }
  return null;
}

const sameProj = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

// ── Labels y helpers ──────────────────────────────────────────────────────────

const LABELS = {
  vanos: 'Vanos (geometría y secciones)',
  apoyos: 'Apoyos',
  cargas: 'Cargas',
  peso_propio: 'Peso propio',
} as const;

type PayloadKey = keyof typeof LABELS;
const KEY_ORDER: readonly PayloadKey[] = ['vanos', 'apoyos', 'cargas', 'peso_propio'];

const ALREADY = 'Ya coincide con el valor actual';

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function mintId(prefix: string, used: Set<string>): string {
  let max = 0;
  const re = new RegExp(`^${prefix}(\\d+)$`);
  for (const id of used) {
    const m = id.match(re);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  const id = `${prefix}${max + 1}`;
  used.add(id);
  return id;
}

function fmtVano(v: VanoProj): string {
  const desc = v.material === 'rc'
    ? `HA ${v.b_cm ?? '?'}×${v.h_cm ?? '?'}`
    : `${v.perfil ?? 'perfil ?'} ${v.acero ?? ''}`.trim();
  return `${v.longitud_m} m ${desc}`;
}

function fmtVanos(vanos: readonly VanoProj[]): string {
  return `${vanos.length} vano${vanos.length === 1 ? '' : 's'}: ${vanos.map(fmtVano).join(' · ')}`;
}

function fmtApoyos(apoyos: readonly ApoyoName[]): string {
  return apoyos.join(' · ');
}

function fmtCarga(c: CargaProj): string {
  const dir = c.dir === 'arriba' ? ' ↑' : '';
  const cat = c.categoria_uso !== null && c.categoria_uso !== 'B' ? ` cat. ${c.categoria_uso}` : '';
  if (c.tipo === 'repartida') {
    const parcial = (c.desde ?? 0) !== 0 || (c.hasta ?? 1) !== 1
      ? ` (tramo ${c.desde ?? 0}–${c.hasta ?? 1})`
      : '';
    return `${c.valor} kN/m${dir} en vano ${c.objetivo}${parcial} [${c.hipotesis}${cat}]`;
  }
  if (c.tipo === 'puntual_vano') {
    return `${c.valor} kN${dir} en vano ${c.objetivo} @ ${c.pos ?? '?'} [${c.hipotesis}${cat}]`;
  }
  return `${c.valor} kN${dir} en nudo ${c.objetivo} [${c.hipotesis}${cat}]`;
}

function fmtCargas(cargas: readonly CargaProj[]): string {
  if (cargas.length === 0) return 'sin cargas';
  return `${cargas.length} carga${cargas.length === 1 ? '' : 's'}: ${cargas.map(fmtCarga).join(' · ')}`;
}

// ── Reglas de seguridad ───────────────────────────────────────────────────────

export const FEM_SAFETY_RULES: ReadonlyArray<SafetyRule<DesignModel>> = [
  {
    field: 'selfWeight',
    confirmKey: 'peso_propio',
    level: trueIsSafer,
    why: 'El peso propio es una acción permanente REAL: desactivarlo borra de golpe parte de la carga G de todas las barras. Solo procede si las cargas introducidas ya lo incluyen — y entonces hay que decirlo explícitamente.',
  },
];

/**
 * ψ₂ por categoría (CTE Tabla 4.2, misma tabla que getPsiRow): la magnitud
 * que decide cuánta sobrecarga persiste en flecha activa y ELS-cuasipermanente.
 * null (carga no-Q, normalizada) → sin nivel → sin comparación.
 */
const CATEGORIA_PSI2: Record<string, number> = {
  A1: 0.3, A2: 0.3, B: 0.3, C1: 0.6, C2: 0.6, C3: 0.6, D1: 0.6, E1: 0.8, G1: 0.0,
};

export const CARGAS_ELEMENT_RULES: ReadonlyArray<ElementSafetyRule<CargaProj>> = [
  {
    field: 'valor',
    label: 'magnitud',
    level: higherIsSafer,
    why: 'Las cargas las fija el proyecto, no el cálculo: rebajar una hace cumplir la viga sin que la obra haya cambiado.',
  },
  {
    // El cambio de hipótesis NO es monótono en una sola escala: bajar γ (Q→G)
    // y bajar ψ₂ (G→Q, Q→W) son relajaciones DISTINTAS. Dos reglas centinela
    // sobre el mismo campo con `key` propia (patrón su/su_anulada de taludes);
    // cada una dispara en un solo sentido.
    field: 'hipotesis',
    key: 'hipotesis_elu',
    label: 'hipótesis (γ de mayoración ELU)',
    level: ordinalLevel({ G: 1.35, Q: 1.5, W: 1.5, S: 1.5, E: 1.0 }),
    why: 'La naturaleza de una carga la fija el proyecto: pasar una sobrecarga (γ=1.5) a permanente (γ=1.35) o a sismo (γ=1.0) rebaja la demanda ELU sin tocar ningún número.',
  },
  {
    field: 'hipotesis',
    key: 'hipotesis_persistencia',
    label: 'hipótesis (persistencia ψ₂)',
    level: ordinalLevel({ G: 1.0, Q: 0.3, W: 0.0, S: 0.0, E: 0.0 }),
    why: 'Pasar una carga a una hipótesis menos persistente (G→Q, Q→viento/nieve) la borra de la flecha activa y de la combinación cuasipermanente, aunque el γ de ELU no baje.',
  },
  {
    field: 'categoria_uso',
    label: 'categoría de uso (ψ₂)',
    level: (v) => (typeof v === 'string' ? (CATEGORIA_PSI2[v] ?? null) : null),
    why: 'La categoría de uso (CTE Tabla 3.1) la fija el uso real del edificio: bajarla reduce las ψ y con ellas la sobrecarga que persiste en las combinaciones ELS y de acompañamiento.',
  },
  {
    field: 'dir',
    label: 'sentido',
    level: ordinalLevel({ abajo: 1, arriba: 0 }),
    why: 'Invertir una carga de gravedad a ascendente aniquila el momento positivo del vano: el sentido lo fija la física del problema, no el cálculo.',
  },
  {
    field: 'desde',
    label: 'inicio de la banda',
    level: (v) => lowerIsSafer(v ?? 0),
    format: (v) => `${v ?? 0}`,
    why: 'Encoger el tramo cargado de una repartida parcial reduce la resultante sobre el vano sin que nadie haya movido nada en obra.',
  },
  {
    field: 'hasta',
    label: 'fin de la banda',
    level: (v) => higherIsSafer(v ?? 1),
    format: (v) => `${v ?? 1}`,
    why: 'Encoger el tramo cargado de una repartida parcial reduce la resultante sobre el vano sin que nadie haya movido nada en obra.',
  },
];

export const CARGAS_RISK_CTX = {
  field: 'cargas',
  itemLabel: 'Carga',
  collectionLabel: 'Cargas',
  removalWhy: 'Las acciones las fija el proyecto: eliminar cargas reduce la demanda de toda la viga. Confírmalo solo si esas cargas realmente ya no existen.',
  identityKeys: [] as const,
} as const;

export const VANOS_ELEMENT_RULES: ReadonlyArray<ElementSafetyRule<VanoProj>> = [
  {
    field: 'longitud_m',
    label: 'luz',
    level: higherIsSafer,
    format: (v) => `${v} m`,
    why: 'La luz la fija la geometría del edificio: acortar un vano rebaja momentos y flechas sin que la obra haya cambiado. La sección y el material, en cambio, sí son variables de diseño libres.',
  },
  // Sección/perfil/fck/material: SIN regla — son RESISTENCIA (variable de
  // diseño libre), igual que en rc-beams y steel-beams. Subir la sección es la
  // salida legítima de "haz que cumpla".
];

export const VANOS_RISK_CTX = {
  field: 'vanos',
  itemLabel: 'Vano',
  collectionLabel: 'Vanos',
  removalWhy: 'Quitar vanos reescribe la estructura entera y elimina con ellos sus cargas: confírmalo solo si la geometría real ha cambiado.',
  identityKeys: [] as const,
} as const;

// Apoyos: SIN reglas a propósito. Cambiar el esquema estático (empotrado ↔
// articulado) REDISTRIBUYE esfuerzos — el vano sube cuando el empotramiento
// baja — y el motor recalcula honestamente: no hay dirección monótona de
// seguridad que vigilar. El caso degenerado (quitar apoyos hasta la
// inestabilidad) lo corta validateModel en el cross-check de buildPlan.

// ── Reconstrucción payload → DesignModel ──────────────────────────────────────

const LIMITS = {
  longitud: { min: MIN_BAR_LENGTH_M, max: 100 },
  b_cm: { min: 10, max: 200 },
  h_cm: { min: 10, max: 300 },
  w: { max: 10000 },
  P: { max: 100000 },
} as const;

interface VanosResolution {
  nodes: Node[];
  bars: DesignBar[];
}

/** Sección/material/armado resueltos de un vano (sin identidad id/i/j). */
type BarShape = Pick<
  DesignBar,
  'material' | 'rcSection' | 'steelSelection' | 'vano_armado' | 'apoyo_armado'
>;

/** Valida y reconstruye la geometría entera. String = motivo (todo-o-nada). */
function mapVanos(
  items: readonly VanoPayload[],
  strip: StripProjection,
  current: DesignModel,
  warnings: string[],
): VanosResolution | string {
  const usedNodeIds = new Set(current.nodes.map((n) => n.id));
  const usedBarIds = new Set(current.bars.map((b) => b.id));
  const origin = strip.nodes[0].x;

  // 1. Resolver cada vano (longitud + sección) con ARRASTRE posicional. Un vano
  //    NUEVO (índice más allá de la tira actual) hereda del vano ANTERIOR ya
  //    resuelto — la misma semántica clone-last del botón "+ vano" del lienzo.
  const lengths: number[] = [];
  const shapes: BarShape[] = [];

  for (let k = 0; k < items.length; k++) {
    const item = items[k];
    const n = k + 1;
    const prev = k < strip.spans.length ? strip.spans[k] : null;
    // Base para conservar sección/armado: el vano superviviente k, o el vano
    // anterior resuelto si k es nuevo (k=0 siempre tiene prev: la tira tiene
    // al menos un vano).
    const base: BarShape | null = prev !== null ? prev.bar : (shapes[k - 1] ?? null);

    const L = item.longitud_m ?? prev?.L ?? lengths[k - 1] ?? null;
    if (L === null) return `Vano ${n}: falta longitud_m`;
    if (L < LIMITS.longitud.min || L > LIMITS.longitud.max) {
      return `Vano ${n}: luz ${L} m fuera del rango ${LIMITS.longitud.min}–${LIMITS.longitud.max} m`;
    }
    lengths.push(round2(L));

    const material = item.material ?? base?.material ?? null;
    if (material === null) return `Vano ${n}: falta material (rc/steel)`;

    if (material === 'rc') {
      const baseRc = base !== null && base.material === 'rc' && base.rcSection !== undefined ? base : null;
      const sec: RcSection = baseRc !== null
        ? { ...(baseRc.rcSection as RcSection) }
        : { ...DEFAULT_RC_SECTION };
      if (item.b_cm !== null) {
        if (item.b_cm < LIMITS.b_cm.min || item.b_cm > LIMITS.b_cm.max) {
          return `Vano ${n}: ancho b ${item.b_cm} cm fuera del rango ${LIMITS.b_cm.min}–${LIMITS.b_cm.max} cm`;
        }
        sec.b = round2(item.b_cm);
      }
      if (item.h_cm !== null) {
        if (item.h_cm < LIMITS.h_cm.min || item.h_cm > LIMITS.h_cm.max) {
          return `Vano ${n}: canto h ${item.h_cm} cm fuera del rango ${LIMITS.h_cm.min}–${LIMITS.h_cm.max} cm`;
        }
        sec.h = round2(item.h_cm);
      }
      if (item.fck !== null) {
        if (!(FCK_OPTIONS as readonly number[]).includes(item.fck)) {
          return `Vano ${n}: fck ${item.fck} fuera del catálogo (${FCK_OPTIONS.join('/')} MPa)`;
        }
        sec.fck = item.fck;
      }
      if (item.perfil !== null || item.acero !== null) {
        warnings.push(`Vano ${n} es de hormigón: perfil/acero no aplican y se ignoran.`);
      }
      if (prev !== null && prev.bar.material !== 'rc') {
        warnings.push(`Vano ${n} pasa a hormigón: sección/armado por defecto donde no se indique — revisa el armado en el panel.`);
      } else if (prev === null) {
        warnings.push(baseRc !== null
          ? `Vano ${n} (nuevo): hereda sección y armado del vano anterior — revísalo.`
          : `Vano ${n} (nuevo, hormigón): sección y armado por defecto — revísalo en el panel.`);
      }
      shapes.push({
        material: 'rc',
        rcSection: sec,
        vano_armado: baseRc?.vano_armado !== undefined ? { ...baseRc.vano_armado } : { ...DEFAULT_VANO_ARMADO },
        apoyo_armado: baseRc?.apoyo_armado !== undefined ? { ...baseRc.apoyo_armado } : { ...DEFAULT_APOYO_ARMADO },
      });
    } else {
      const baseSt = base !== null && base.material === 'steel' && base.steelSelection !== undefined ? base : null;
      const sel: SteelSelection = baseSt !== null
        ? { ...(baseSt.steelSelection as SteelSelection) }
        : { ...DEFAULT_STEEL_SELECTION };
      if (item.perfil !== null) {
        const key = PERFIL_CATALOG[item.perfil];
        if (key === undefined) {
          return `Vano ${n}: perfil "${item.perfil}" fuera del catálogo (${PERFIL_NAMES.join(', ')})`;
        }
        sel.profileKey = key;
      }
      if (item.acero !== null) sel.steel = item.acero;
      if (item.b_cm !== null || item.h_cm !== null || item.fck !== null) {
        warnings.push(`Vano ${n} es de acero: b/h/fck no aplican y se ignoran.`);
      }
      if (prev !== null && prev.bar.material !== 'steel') {
        warnings.push(`Vano ${n} pasa a acero${item.perfil === null ? ' (IPE 240 S275 por defecto)' : ''}: revisa Lcr y límite de flecha en el panel.`);
      } else if (prev === null) {
        warnings.push(baseSt !== null
          ? `Vano ${n} (nuevo): hereda el perfil del vano anterior — revísalo.`
          : `Vano ${n} (nuevo, acero${item.perfil === null ? ', IPE 240 S275 por defecto' : ''}): revisa Lcr y límite de flecha en el panel.`);
      }
      shapes.push({
        material: 'steel',
        steelSelection: sel,
        // Se conserva el armado aunque el vano pase a acero: es inofensivo
        // para el motor y preserva el dato si el usuario revierte el cambio.
        ...(base?.vano_armado !== undefined ? { vano_armado: { ...base.vano_armado } } : {}),
        ...(base?.apoyo_armado !== undefined ? { apoyo_armado: { ...base.apoyo_armado } } : {}),
      });
    }
  }

  // 2. Nodos: x acumulado desde el origen actual; ids preservados posicionalmente.
  const nodes: Node[] = [];
  let x = origin;
  for (let k = 0; k <= items.length; k++) {
    const id = k < strip.nodes.length ? strip.nodes[k].id : mintId('n', usedNodeIds);
    nodes.push({ id, x: round2(x), y: 0 });
    if (k < items.length) x += lengths[k];
  }

  // 3. Barras: los vanos supervivientes conservan id, orientación i/j y
  //    rótulas; los nuevos acuñan id (las rótulas NO se heredan del clone-last:
  //    clonarlas sorprendería y puede crear mecanismos).
  const bars: DesignBar[] = shapes.map((shape, k) => {
    const own = k < strip.spans.length ? strip.spans[k].bar : null;
    return {
      id: own?.id ?? mintId('b', usedBarIds),
      i: own?.i ?? nodes[k].id,
      j: own?.j ?? nodes[k + 1].id,
      internalHinges: own !== null ? { ...own.internalHinges } : { i: false, j: false },
      ...shape,
    };
  });

  return { nodes, bars };
}

/** Valida y construye UNA carga sobre la geometría FINAL. String = motivo. */
function mapCarga(
  raw: CargaPayload,
  index: number,
  finalBars: readonly DesignBar[],
  finalNodes: readonly Node[],
  usedLoadIds: Set<string>,
  warnings: string[],
): Load | string {
  const n = index + 1;
  if (raw.tipo === null) return `Carga ${n}: tipo ausente o no reconocido (repartida/puntual_vano/puntual_nudo)`;
  if (raw.hipotesis === null) return `Carga ${n}: falta hipotesis (G/Q/W/S/E)`;
  if (raw.valor === null) return `Carga ${n}: falta valor`;

  let valor = raw.valor;
  if (valor < 0) {
    warnings.push(`Carga ${n}: valor negativo — se usa |${raw.valor}| (el sentido va en "dir").`);
    valor = Math.abs(valor);
  }
  if (valor === 0) return `Carga ${n}: el valor debe ser mayor que 0`;
  const maxVal = raw.tipo === 'repartida' ? LIMITS.w.max : LIMITS.P.max;
  if (valor > maxVal) {
    return `Carga ${n}: valor ${valor} fuera del rango 0–${maxVal} ${raw.tipo === 'repartida' ? 'kN/m' : 'kN'}`;
  }
  valor = round2(valor);

  let dir = raw.dir;
  if (dir === null) {
    warnings.push(`Carga ${n}: sin sentido indicado — se asume "abajo" (gravedad).`);
    dir = 'abajo';
  }

  if (raw.objetivo === null || !Number.isInteger(raw.objetivo)) {
    return `Carga ${n}: objetivo ausente o no entero`;
  }
  const maxTarget = raw.tipo === 'puntual_nudo' ? finalNodes.length : finalBars.length;
  const targetLabel = raw.tipo === 'puntual_nudo' ? 'nudo' : 'vano';
  if (raw.objetivo < 1 || raw.objetivo > maxTarget) {
    return `Carga ${n}: ${targetLabel} ${raw.objetivo} no existe (hay ${maxTarget})`;
  }

  let useCategory: UseCategoryCode | undefined;
  if (raw.hipotesis === 'Q') {
    if (raw.categoria_uso === null) {
      warnings.push(`Carga ${n}: sobrecarga Q sin categoría de uso — se asume B (Tabla 3.1). Sugerencia: confírmala con el usuario.`);
      useCategory = 'B';
    } else {
      useCategory = raw.categoria_uso;
    }
  } else if (raw.categoria_uso !== null) {
    warnings.push(`Carga ${n}: categoria_uso solo aplica a sobrecargas Q; se ignora.`);
  }

  const id = mintId('l', usedLoadIds);
  const lc = raw.hipotesis;

  if (raw.tipo === 'repartida') {
    if (raw.pos !== null) warnings.push(`Carga ${n}: "pos" solo aplica a puntual_vano; se ignora.`);
    const desde = raw.desde ?? 0;
    const hasta = raw.hasta ?? 1;
    if (desde < 0 || hasta > 1 || desde >= hasta) {
      return `Carga ${n}: tramo parcial [${desde}, ${hasta}] inválido (debe estar en [0, 1] con desde < hasta)`;
    }
    return {
      id, kind: 'udl', lc,
      ...(useCategory !== undefined ? { useCategory } : {}),
      bar: finalBars[raw.objetivo - 1].id,
      w: valor,
      dir: dir === 'abajo' ? '-y' : '+y',
      ...(desde !== 0 || hasta !== 1 ? { from: desde, to: hasta } : {}),
    };
  }

  if (raw.tipo === 'puntual_vano') {
    if (raw.desde !== null || raw.hasta !== null) {
      warnings.push(`Carga ${n}: desde/hasta solo aplican a repartidas; se ignoran.`);
    }
    if (raw.pos === null) return `Carga ${n}: falta pos (posición relativa 0–1 dentro del vano)`;
    if (raw.pos < 0 || raw.pos > 1) return `Carga ${n}: pos ${raw.pos} fuera del rango [0, 1]`;
    return {
      id, kind: 'point-bar', lc,
      ...(useCategory !== undefined ? { useCategory } : {}),
      bar: finalBars[raw.objetivo - 1].id,
      pos: raw.pos,
      P: valor,
      dir: dir === 'abajo' ? '-y' : '+y',
    };
  }

  // puntual_nudo — OJO: Py es SIGNADO con positivo = HACIA ABAJO.
  if (raw.pos !== null || raw.desde !== null || raw.hasta !== null) {
    warnings.push(`Carga ${n}: pos/desde/hasta no aplican a cargas de nudo; se ignoran.`);
  }
  return {
    id, kind: 'point-node', lc,
    ...(useCategory !== undefined ? { useCategory } : {}),
    node: finalNodes[raw.objetivo - 1].id,
    Py: dir === 'abajo' ? valor : -valor,
  };
}

// ── buildPlan ─────────────────────────────────────────────────────────────────

const NOT_STRIP_REASON =
  'El modelo actual no es una viga colineal editable por el asistente (topología manipulada): la estructura solo se puede cambiar desde el lienzo';

function buildFemPlan(
  payload: unknown,
  current: DesignModel,
  _system: unknown,
  confirmed?: ReadonlySet<string>,
): AiApplyPlan<DesignModel> {
  const x = parsePayload(payload);
  const fields: Partial<DesignModel> = {};
  const changes: AiFieldChange[] = [];
  const skipped: AiSkippedField[] = [];
  const warnings: string[] = [...x.warnings];
  const handled = new Set<PayloadKey>();

  const strip = projectStrip(current);
  const baseline = presetBaseline(current);
  const baselineStrip = baseline !== null ? projectStrip(baseline) : null;

  function skip(key: PayloadKey, reason: string): void {
    handled.add(key);
    skipped.push({ label: LABELS[key], reason });
  }

  function applied(key: PayloadKey, before: string, after: string): void {
    handled.add(key);
    changes.push({ field: key, label: LABELS[key], before, after });
  }

  // --- Estructura no editable (modelo no colineal) ---
  if (strip === null) {
    if (x.vanos !== null) skip('vanos', NOT_STRIP_REASON);
    if (x.apoyos !== null) skip('apoyos', NOT_STRIP_REASON);
    if (x.cargas !== null) skip('cargas', NOT_STRIP_REASON);
  }

  // Geometría final vigente (se actualiza si "vanos" se aplica): las cargas y
  // los apoyos se validan y mapean SIEMPRE contra la geometría final.
  let finalNodes: Node[] = strip !== null ? strip.nodes : current.nodes;
  let finalBars: DesignBar[] = strip !== null ? strip.spans.map((s) => s.bar) : current.bars;
  let vanosApplied = false;

  // --- Vanos: REEMPLAZO completo con arrastre posicional ---
  if (strip !== null && x.vanos !== null) {
    if (x.vanos.length === 0) {
      skip('vanos', 'La viga necesita al menos un vano; la lista no puede quedar vacía');
    } else {
      const vanoWarnings: string[] = [];
      const res = mapVanos(x.vanos, strip, current, vanoWarnings);
      if (typeof res === 'string') {
        skip('vanos', `${res} — no se aplica ningún vano (la lista reemplaza a la actual entera)`);
      } else {
        const beforeProj = projectVanos(strip);
        const afterStrip = projectStrip({ ...current, nodes: res.nodes, bars: res.bars });
        const afterProj = afterStrip !== null ? projectVanos(afterStrip) : [];
        if (sameProj(beforeProj, afterProj)) {
          skip('vanos', ALREADY);
        } else {
          warnings.push(...vanoWarnings);
          fields.nodes = res.nodes;
          fields.bars = res.bars;
          finalNodes = res.nodes;
          finalBars = res.bars;
          vanosApplied = true;
          applied('vanos', fmtVanos(beforeProj), fmtVanos(afterProj));
        }
      }
    }
  }

  // --- Apoyos: lista completa de vanos+1 entradas ---
  if (strip !== null && x.apoyos !== null && !handled.has('apoyos')) {
    const expected = finalBars.length + 1;
    const badIdx = x.apoyos.findIndex((a) => a === null);
    if (x.apoyos.length !== expected) {
      skip('apoyos', `La lista de apoyos debe tener ${expected} entradas (vanos + 1); llegaron ${x.apoyos.length}`);
    } else if (badIdx !== -1) {
      skip('apoyos', `Apoyo ${badIdx + 1}: valor no reconocido (articulado/deslizante/empotrado/muelle/libre)`);
    } else {
      const supports: Support[] = [];
      x.apoyos.forEach((tipo, i) => {
        if (tipo !== null && tipo !== 'libre') {
          supports.push({ node: finalNodes[i].id, type: APOYO_TO_SUPPORT[tipo] });
        }
      });
      const beforeProj = projectApoyos(strip, current.supports);
      if (!vanosApplied && sameProj(beforeProj, x.apoyos)) {
        skip('apoyos', ALREADY);
      } else {
        fields.supports = supports;
        applied('apoyos', fmtApoyos(beforeProj), fmtApoyos(x.apoyos as ApoyoName[]));
      }
    }
  } else if (vanosApplied && x.apoyos === null) {
    // La geometría cambió sin lista de apoyos: se conservan los que sobreviven
    // (los ids de nodo se preservan posicionalmente) y se PODAN los huérfanos.
    const surviving = new Set(finalNodes.map((n) => n.id));
    const kept = current.supports.filter((s) => surviving.has(s.node));
    if (kept.length !== current.supports.length) {
      fields.supports = kept;
      warnings.push(`${current.supports.length - kept.length} apoyo(s) eliminados: su nudo desaparece con la nueva geometría. Al cambiar el número de vanos conviene enviar también "apoyos".`);
    }
  }

  // --- Cargas: REEMPLAZO completo, todo-o-nada, sobre la geometría final ---
  if (strip !== null && x.cargas !== null && !handled.has('cargas')) {
    const usedLoadIds = new Set<string>();
    const cargaWarnings: string[] = [];
    const mapped: Load[] = [];
    let elementError: string | null = null;
    for (let i = 0; i < x.cargas.length; i++) {
      const res = mapCarga(x.cargas[i], i, finalBars, finalNodes, usedLoadIds, cargaWarnings);
      if (typeof res === 'string') { elementError = res; break; }
      mapped.push(res);
    }
    if (elementError !== null) {
      skip('cargas', `${elementError} — no se aplica ninguna carga (la lista reemplaza a la actual entera)`);
    } else {
      const beforeProj = projectCargas(strip, current.loads);
      const finalStripForProj = projectStrip({ ...current, nodes: finalNodes, bars: finalBars });
      const afterProj = finalStripForProj !== null ? projectCargas(finalStripForProj, mapped) : [];
      if (!vanosApplied && sameProj(beforeProj, afterProj)) {
        skip('cargas', ALREADY);
      } else {
        warnings.push(...cargaWarnings);
        fields.loads = mapped;
        applied('cargas', fmtCargas(beforeProj), fmtCargas(afterProj));
      }
    }
  } else if (vanosApplied && x.cargas === null) {
    const survivingBars = new Set(finalBars.map((b) => b.id));
    const survivingNodes = new Set(finalNodes.map((n) => n.id));
    const kept = current.loads.filter((l) =>
      l.kind === 'point-node' ? survivingNodes.has(l.node) : survivingBars.has(l.bar));
    if (kept.length !== current.loads.length) {
      fields.loads = kept;
      warnings.push(`${current.loads.length - kept.length} carga(s) eliminadas: su vano/nudo desaparece con la nueva geometría. Revisa la lista de cargas.`);
    }
  }

  // Cargas horizontales (Px) no representables en el payload: nunca en silencio.
  if (fields.loads !== undefined) {
    const px = current.loads.filter((l) => l.kind === 'point-node' && (l.Px ?? 0) !== 0);
    if (px.length > 0) {
      warnings.push(`El modelo tenía ${px.length} carga(s) horizontales (Px) que el asistente no puede representar: se pierden con el reemplazo.`);
    }
  }

  // --- Peso propio ---
  if (x.peso_propio !== null) {
    if (x.peso_propio === current.selfWeight) {
      skip('peso_propio', ALREADY);
    } else {
      fields.selfWeight = x.peso_propio;
      handled.add('peso_propio');
      changes.push({
        field: 'selfWeight',
        label: LABELS.peso_propio,
        before: current.selfWeight ? 'Automático (activado)' : 'Desactivado',
        after: x.peso_propio ? 'Automático (activado)' : 'Desactivado',
      });
    }
  }

  // --- Cross-check final: validateModel sobre el candidato ---
  const structural = fields.nodes !== undefined || fields.bars !== undefined
    || fields.supports !== undefined || fields.loads !== undefined;
  if (structural) {
    const candidate: DesignModel = { ...current, ...fields };
    const validation = validateModel(candidate);
    const failMsgs = validation.errors.filter((e) => e.severity === 'fail').map((e) => e.msg);
    if (failMsgs.length > 0) {
      // Una propuesta aplicable que rompe el lienzo es peor que un skip: el
      // motivo lleva el mensaje EXACTO del validador para que el modelo
      // corrija al turno siguiente (regla 10 del prompt).
      const reason = `La propuesta dejaría el modelo inválido: ${failMsgs.join(' · ')} — corrige y reenvía la estructura completa`;
      for (const key of ['vanos', 'apoyos', 'cargas'] as const) {
        const idx = changes.findIndex((c) => c.field === key);
        if (idx !== -1) {
          changes.splice(idx, 1);
          skipped.push({ label: LABELS[key], reason });
        }
      }
      delete fields.nodes;
      delete fields.bars;
      delete fields.supports;
      delete fields.loads;
      vanosApplied = false;
    } else {
      for (const e of validation.errors) {
        if (e.severity === 'warn') warnings.push(`Aviso de validación: ${e.msg}`);
      }
    }
  }

  // --- notFound ---
  const untouched: Record<PayloadKey, boolean> = {
    vanos: x.vanos === null,
    apoyos: x.apoyos === null,
    cargas: x.cargas === null,
    peso_propio: x.peso_propio === null,
  };
  const notFound: string[] = [];
  for (const key of KEY_ORDER) {
    if (untouched[key] && !handled.has(key)) notFound.push(LABELS[key]);
  }

  // --- Riesgos: escalares + elementos, en el ESPACIO DEL PAYLOAD ---
  // El gate de los escalares necesita un baseline: la plantilla si se conoce;
  // con presetCode desconocido (share manipulado) se usa un centinela con
  // selfWeight invertido para que el gate quede ABIERTO (todo establecido).
  const scalarDefaults: DesignModel = baseline ?? { ...current, selfWeight: !current.selfWeight };

  const currentVanosProj = strip !== null ? projectVanos(strip) : [];
  const currentCargasProj = strip !== null ? projectCargas(strip, current.loads) : [];
  const baseVanosProj = baselineStrip !== null ? projectVanos(baselineStrip) : [];
  const baseCargasProj = baselineStrip !== null && baseline !== null
    ? projectCargas(baselineStrip, baseline.loads)
    : [];

  const finalModel: DesignModel = { ...current, ...fields };
  const finalStrip = structuralFieldsPresent(fields) ? projectStrip(finalModel) : null;
  const proposedVanos = fields.bars !== undefined && finalStrip !== null
    ? projectVanos(finalStrip)
    : undefined;
  const proposedCargas = fields.loads !== undefined && finalStrip !== null
    ? projectCargas(finalStrip, finalModel.loads)
    : undefined;

  const risks = [
    ...detectSafetyRisks(FEM_SAFETY_RULES, changes, fields, current, scalarDefaults, confirmed),
    ...detectElementRisks(VANOS_ELEMENT_RULES, proposedVanos, currentVanosProj, baseVanosProj, VANOS_RISK_CTX, confirmed),
    ...detectElementRisks(CARGAS_ELEMENT_RULES, proposedCargas, currentCargasProj, baseCargasProj, CARGAS_RISK_CTX, confirmed),
  ];

  return { fields, changes, skipped, notFound, warnings, notes: null, risks };
}

function structuralFieldsPresent(fields: Partial<DesignModel>): boolean {
  return fields.nodes !== undefined || fields.bars !== undefined
    || fields.supports !== undefined || fields.loads !== undefined;
}

// ── Snapshot ──────────────────────────────────────────────────────────────────

function fmtArmadoHA(a: ArmadoHA): string {
  return `${a.tens_nBars}Ø${a.tens_barDiam} tracción + ${a.comp_nBars}Ø${a.comp_barDiam} compresión, cercos Ø${a.stirrupDiam} c/${a.stirrupSpacing} mm (${a.stirrupLegs} ramas)`;
}

function buildSnapshot(c: DesignModel): string {
  const strip = projectStrip(c);
  if (strip === null) {
    return JSON.stringify({
      valores: {
        modelo_no_lineal: true,
        nota: 'El modelo actual no es una viga colineal: la estructura es de solo lectura para el asistente. Solo peso_propio es editable.',
        peso_propio: c.selfWeight,
      },
      sin_confirmar: [],
    });
  }

  const vanos = projectVanos(strip);
  const apoyos = projectApoyos(strip, c.supports);
  const cargas = projectCargas(strip, c.loads);

  const valores: Record<string, unknown> = {
    vanos,
    apoyos,
    cargas,
    peso_propio: c.selfWeight,
  };

  // Contexto de SOLO LECTURA — dentro de `valores` porque decorateSnapshot se
  // queda únicamente con valores/sin_confirmar/pendientes_de_aplicar: una
  // clave hermana de primer nivel desaparecería tras la primera propuesta.
  // Los nombres coinciden ya con las futuras claves del payload de Fase B.
  const armados = strip.spans
    .map((s, k) => ({ s, k }))
    .filter(({ s }) => s.bar.material === 'rc')
    .map(({ s, k }) => {
      const sec = s.bar.rcSection;
      const seccion = sec !== undefined
        ? `fyk ${sec.fyk}, recubrimiento ${sec.cover} mm, ${sec.exposureClass}`
        : 'sección sin definir';
      const vano = s.bar.vano_armado !== undefined ? fmtArmadoHA(s.bar.vano_armado) : 'sin definir';
      const apoyo = s.bar.apoyo_armado !== undefined ? fmtArmadoHA(s.bar.apoyo_armado) : 'sin definir';
      return `Vano ${k + 1}: M+ ${vano} · M− ${apoyo} · ${seccion}`;
    });
  if (armados.length > 0) valores.armados = armados;

  const aceroDetalles = strip.spans
    .map((s, k) => ({ s, k }))
    .filter(({ s }) => s.bar.material === 'steel' && s.bar.steelSelection !== undefined)
    .map(({ s, k }) => {
      const sel = s.bar.steelSelection as SteelSelection;
      const lcr = sel.Lcr != null ? `${sel.Lcr} m` : `auto (= luz)`;
      return `Vano ${k + 1}: Lcr ${lcr}, flecha L/${sel.deflLimit} (combo ${sel.elsCombo}, cat. ${sel.useCategory}), tipo ${sel.beamType}`;
    });
  if (aceroDetalles.length > 0) valores.acero_detalles = aceroDetalles;

  const rotulas = strip.spans
    .map((s, k) => ({ s, k }))
    .filter(({ s }) => s.bar.internalHinges.i || s.bar.internalHinges.j)
    .map(({ s, k }) => {
      // internalHinges es relativo a la orientación i/j de la barra, que puede
      // no coincidir con izquierda→derecha.
      const iEsIzq = s.bar.i === s.leftNodeId;
      const izq = iEsIzq ? s.bar.internalHinges.i : s.bar.internalHinges.j;
      const der = iEsIzq ? s.bar.internalHinges.j : s.bar.internalHinges.i;
      const donde = izq && der ? 'ambos extremos' : izq ? 'extremo izquierdo' : 'extremo derecho';
      return `Vano ${k + 1}: rótula en ${donde}`;
    });
  if (rotulas.length > 0) valores.rotulas = rotulas;

  const px = c.loads.filter((l) => l.kind === 'point-node' && (l.Px ?? 0) !== 0);
  if (px.length > 0) {
    valores.cargas_horizontales = px.map((l) =>
      `Carga horizontal Px=${(l as { Px?: number }).Px} kN (no editable por el asistente; el axil se ignora en V1)`);
  }

  // sin_confirmar: claves cuya proyección coincide con la plantilla de origen.
  // presetCode desconocido ⇒ todo se considera ESTABLECIDO (lista vacía).
  const baseline = presetBaseline(c);
  const baselineStrip = baseline !== null ? projectStrip(baseline) : null;
  const sinConfirmar: string[] = [];
  if (baseline !== null && baselineStrip !== null) {
    if (sameProj(vanos, projectVanos(baselineStrip))) sinConfirmar.push('vanos');
    if (sameProj(apoyos, projectApoyos(baselineStrip, baseline.supports))) sinConfirmar.push('apoyos');
    if (sameProj(cargas, projectCargas(baselineStrip, baseline.loads))) sinConfirmar.push('cargas');
    if (c.selfWeight === baseline.selfWeight) sinConfirmar.push('peso_propio');
  }
  valores.plantilla = c.presetCode;
  valores.modelo_de_plantilla = sinConfirmar.length === KEY_ORDER.length;

  return JSON.stringify({ valores, sin_confirmar: sinConfirmar });
}

// ── Resumen de resultados ─────────────────────────────────────────────────────

function barDesc(bar: DesignBar): string {
  if (bar.material === 'rc') {
    return bar.rcSection !== undefined ? `HA ${bar.rcSection.b}×${bar.rcSection.h}` : 'HA';
  }
  return bar.steelSelection !== undefined
    ? `${perfilName(bar.steelSelection.profileKey)} ${bar.steelSelection.steel}`
    : 'acero';
}

/**
 * SolveResult → resumen para el prompt. El veredicto del chat coincide con el
 * badge del módulo POR CONSTRUCCIÓN: cada BarCheck se convierte en un CheckRow
 * con toStatus(eta) — el mismo toStatus/maxEta que fija ResultsHeader.
 *
 * `resultsRecalc` queda en 'auto' (default): tras cargar el chunk, el solver
 * es SÍNCRONO en cada setModel. La ventana 'pending' inicial (import del
 * chunk, ~ms) la cubre el bloque "SIN CALCULAR" de aquí — con 'manual' el
 * modelo pediría pulsar un botón "Calcular" que no existe.
 */
export function summarizeFemResults(model: DesignModel, result: SolveResult): AiResultsSummary {
  if (result.status === 'pending') {
    if (Object.keys(result.perBar).length === 0) {
      return {
        verdict: 'invalid',
        text: 'SIN CALCULAR: el motor FEM aún se está cargando; los resultados aparecerán en el siguiente turno. No hay veredicto ni comprobaciones que citar todavía.',
      };
    }
    return {
      verdict: 'invalid',
      text: 'PENDIENTE: ninguna barra tiene el armado o el perfil completos, así que no hay comprobaciones. El armado se edita en el panel del módulo (solo lectura para el asistente).',
    };
  }

  const failMsgs = result.errors.filter((e) => e.severity === 'fail').map((e) => e.msg);
  if (failMsgs.length > 0) {
    return summarizeCalcResults({ valid: false, error: failMsgs.join(' · '), checks: [] });
  }
  if (result.status === 'neutral' || model.bars.length === 0) {
    return summarizeCalcResults({
      valid: false,
      error: 'El modelo no tiene barras: añade al menos un vano para calcular.',
      checks: [],
    });
  }

  const strip = projectStrip(model);
  const orderedBars = strip !== null ? strip.spans.map((s) => s.bar) : model.bars;

  const checks: CheckRow[] = [];
  const pendingLines: string[] = [];
  orderedBars.forEach((bar, k) => {
    const br = result.perBar[bar.id];
    if (br === undefined) return;
    const desc = barDesc(bar);
    if (br.status === 'pending') {
      pendingLines.push(`Vano ${k + 1} (${desc}): PENDIENTE — armado o perfil sin completar; sin comprobaciones.`);
      return;
    }
    br.checks.forEach((c, i) => {
      checks.push({
        id: `vano${k + 1}-${i}`,
        description: `Vano ${k + 1} (${desc}) — ${c.name}`,
        valueStr: c.unit !== '' ? `${c.val} ${c.unit}` : c.val,
        utilization: c.eta,
        status: toStatus(c.eta),
        article: c.ref,
      });
    });
  });

  const extras: string[] = [`η máximo global = ${Math.round(result.maxEta * 100)}%`];
  extras.push(...pendingLines);
  const reactions = result.reactionsByCombo?.ELU ?? result.reactions;
  if (reactions.length > 0) {
    const parts = [...reactions]
      .sort((a, b) => a.x - b.x)
      .map((r) => `x=${round2(r.x)} m: Ry=${r.Ry.toFixed(1)} kN${Math.abs(r.Mr) > 1e-9 ? `, Mr=${r.Mr.toFixed(1)} kN·m` : ''}`);
    extras.push(`Reacciones (ELU): ${parts.join(' · ')}`);
  }
  for (const e of result.errors) {
    if (e.severity === 'warn') extras.push(`Aviso del modelo: ${e.msg}`);
  }

  return summarizeCalcResults({ valid: true, checks }, extras);
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export const femAnalysisAdapter: AiModuleAdapter<DesignModel> = {
  id: 'fem-1d',
  label: 'FEM 1D — Viga continua',
  payloadSchema: FEM_PAYLOAD_SCHEMA,
  promptRules: PROMPT_RULES,
  placeholder: PLACEHOLDER_EXAMPLE,
  snapshot: buildSnapshot,
  buildPlan: buildFemPlan,
};
