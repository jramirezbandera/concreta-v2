/**
 * Adapter del asistente IA para el módulo Acero/Sección compuesta (ola 3 —
 * PILOTO del patrón de ARRAYS en el payload).
 *
 * Novedad respecto a los adapters planos: el campo `plates` es un array
 * homogéneo de objetos planos con semántica de REEMPLAZO COMPLETO — la lista
 * propuesta sustituye entera a la vigente (null = sin cambio). Un elemento
 * inválido invalida la propuesta del array ENTERO (skip con motivo): con
 * reemplazo no existen las aplicaciones a medias. Los ids de chapa se
 * regeneran (`p1..pn`) — no son significativos.
 *
 * Unidades humanas: chapas y desfases en mm, luces de pandeo en METROS (el
 * estado interno guarda Ly/Lz en mm → ×1000 al aplicar), axil en kN.
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
  detectResolvedRisks,
  detectSafetyRisks,
  higherIsSafer,
  type ResolvedSafetyRule,
  type SafetyRule,
} from '../safety';
import { getBetaForBCType } from '../../calculations/steelColumnBC';
import type { CompositeSectionResult } from '../../calculations/compositeSection';
import type { CheckRow } from '../../calculations/types';
import {
  compositeSectionDefaults,
  type ColumnBCType,
  type CompositePlateLateralAnchor,
  type CompositePlatePos,
  type CompositeSectionInputs,
  type CompositeSectionMode,
  type PlateEntry,
  type SteelGrade,
} from '../../../data/defaults';
import { getSizesForTipo } from '../../../data/steelProfiles';
import { formatQuantity } from '../../units/format';
import type { UnitSystem } from '../../units/types';

// ── Catálogos del módulo ──────────────────────────────────────────────────────

const MODES = ['reinforced', 'custom'] as const;
const PROFILE_TYPES = ['IPE', 'HEA', 'HEB'] as const;
const GRADES = ['S235', 'S275', 'S355', 'S450'] as const;
const BC_TYPES = ['pp', 'pf', 'ff', 'fc', 'custom'] as const;
const POS_TYPES = ['top', 'bottom', 'left', 'right', 'custom'] as const;
/** En modo custom no hay perfil: las laterales (pegadas al alma/ala) no existen. */
const POS_TYPES_CUSTOM_MODE = ['top', 'bottom', 'custom'] as const;
const ANCHORS = ['web', 'flange'] as const;

/** Tope de chapas del módulo (la UI usa el mismo literal en dos sitios). */
const MAX_PLATES = 6;

type ProfileType = (typeof PROFILE_TYPES)[number];

// ── Payload schema (canónico; plano + array homogéneo `plates`) ───────────────

export const COMPOSITE_SECTION_PAYLOAD_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: [
    'mode', 'profileType', 'profileSize', 'grade', 'plates',
    'Ly_m', 'Lz_m', 'bcType', 'beta_y', 'beta_z', 'Ned_kN', 'warnings',
  ],
  properties: {
    mode: { type: ['string', 'null'], enum: [...MODES, null], description: 'Modo de la sección: "reinforced" = perfil laminado base + chapas de refuerzo (el habitual); "custom" = solo chapas sueltas, sin perfil.' },
    profileType: { type: ['string', 'null'], enum: [...PROFILE_TYPES, null], description: 'Familia del perfil base (solo modo reinforced).' },
    profileSize: { type: ['integer', 'null'], description: 'Tamaño del perfil base (IPE 300 → 300). Solo modo reinforced; debe existir en la familia.' },
    grade: { type: ['string', 'null'], enum: [...GRADES, null], description: 'Acero de perfil y chapas (S235/S275/S355/S450).' },
    plates: {
      type: ['array', 'null'],
      description: 'Lista COMPLETA de chapas de refuerzo (máx 6). REEMPLAZA la lista actual entera: incluye SIEMPRE todas las chapas que deban quedar, no solo las nuevas. null = sin cambio.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['posType', 'b_mm', 't_mm', 'customYBottom_mm', 'lateralAnchor', 'lateralOffset_mm'],
        properties: {
          posType: { type: 'string', enum: [...POS_TYPES], description: 'Posición: "top"/"bottom" = platabanda horizontal sobre/bajo el perfil; "left"/"right" = chapa VERTICAL lateral (solo modo reinforced); "custom" = platabanda horizontal a cota libre.' },
          b_mm: { type: 'number', description: 'top/bottom/custom: ANCHO horizontal de la platabanda en mm. left/right: ESPESOR de la chapa vertical en mm.' },
          t_mm: { type: ['number', 'null'], description: 'ESPESOR de la platabanda en mm (top/bottom/custom). En left/right se ignora: déjalo en null.' },
          customYBottom_mm: { type: ['number', 'null'], description: 'Solo posType "custom": cota de la cara inferior de la chapa desde la base de la sección, en mm. Resto: null.' },
          lateralAnchor: { type: ['string', 'null'], enum: [...ANCHORS, null], description: 'Solo left/right: "web" = pegada al alma (altura libre entre acuerdos, lo habitual); "flange" = en la punta de las alas (cierra cajón). Resto: null.' },
          lateralOffset_mm: { type: ['number', 'null'], description: 'Solo left/right: desfase fino hacia afuera desde el anclaje, en mm (normalmente 0). Resto: null.' },
        },
      },
    },
    Ly_m: { type: ['number', 'null'], description: 'Luz de pandeo eje fuerte y-y en METROS (solo modo reinforced con comprobación de compresión).' },
    Lz_m: { type: ['number', 'null'], description: 'Luz de pandeo eje débil z-z en METROS (solo modo reinforced).' },
    bcType: { type: ['string', 'null'], enum: [...BC_TYPES, null], description: 'Vinculaciones de pandeo: pp = biarticulado (β=1.0), pf = articulado-empotrado (β=0.7), ff = biempotrado (β=0.5), fc = ménsula (β=2.0), custom = β manuales.' },
    beta_y: { type: ['number', 'null'], description: 'β eje y-y. SOLO con bcType "custom" y si el enunciado da su valor numérico explícito.' },
    beta_z: { type: ['number', 'null'], description: 'β eje z-z. SOLO con bcType "custom".' },
    Ned_kN: { type: ['number', 'null'], description: 'Axil de compresión NEd en kN (0 = solo capacidad, sin comprobación de compresión). Solo modo reinforced.' },
    warnings: { type: 'array', items: { type: 'string' }, description: 'Avisos: conversiones de unidades realizadas, ambigüedades, datos del enunciado ignorados.' },
  },
};

// ── Prompt del módulo ─────────────────────────────────────────────────────────

const PROMPT_RULES = `Reglas específicas del módulo Sección compuesta:
1. El módulo calcula las propiedades (A, Iy/Iz, Wel/Wpl), la CLASE de la sección (CE Anejo 22) y las resistencias MRd (flexión) y Nc,Rd (compresión con pandeo, si NEd > 0) de un perfil laminado REFORZADO con chapas soldadas. No comprueba flexión frente a un momento del usuario: no hay campo MEd.
2. El campo "plates" REEMPLAZA la lista de chapas ENTERA: incluye siempre TODAS las chapas que deban quedar (las existentes que se conservan y las nuevas), no solo las que cambian. Máximo ${MAX_PLATES} chapas.
3. Geometría de chapa: en top/bottom/custom, b_mm es el ANCHO y t_mm el ESPESOR ("chapa de 200×15" → b_mm 200, t_mm 15). En left/right (verticales), b_mm es el ESPESOR de la chapa y t_mm va en null; lateralAnchor "web" (alma, lo habitual) o "flange" (punta de alas, cierra cajón).
4. Unidades: chapas, desfases y cotas en MILÍMETROS; luces de pandeo Ly_m/Lz_m en METROS; NEd en kN. Convierte lo que venga en otras unidades y añade un warning con la conversión.
5. En modo "custom" (sin perfil base) solo existen chapas top/bottom/custom y NO hay bloque de compresión ni clasificación completa: no propongas perfil, laterales, luces de pandeo ni NEd en ese modo. Y al CAMBIAR a "custom", si la sección tenía chapas laterales, propón en el MISMO turno la lista "plates" completa SIN laterales (conviértelas en platabandas o quítalas) y con al menos una chapa: pasar a "custom" dejando las laterales deja el cálculo en "Datos no válidos".
6. beta_y/beta_z SOLO con bcType "custom" y si el enunciado da el valor numérico. Si describe las vinculaciones con palabras, usa bcType (pp/pf/ff/fc) y deja los β en null.
7. En este módulo son DATOS del problema, no variables de diseño: el axil NEd_kN, las luces de pandeo Ly_m/Lz_m y las vinculaciones (bcType, beta_y, beta_z) — los fija la estructura. Las CHAPAS, el perfil base y el acero SÍ son diseño: para que la sección cumpla, añade o engrosa chapas, sube el perfil o el acero. NUNCA rebajes el axil ni acortes las luces de pandeo para que salga el cálculo. Si la sección sale CLASE 4, la salida es engrosar o rigidizar las chapas esbeltas (más espesor, menos vuelo), no tocar los datos.`;

const PLACEHOLDER_EXAMPLE =
  'Ej.: IPE 300 en S275 reforzado con platabanda superior de 200×15 y platabanda inferior '
  + 'de 200×15. Luz de pandeo 3,5 m biarticulado y axil de 400 kN.';

// ── Parseo defensivo del payload ──────────────────────────────────────────────

interface CompositePlatePayload {
  posType: CompositePlatePos | null;
  b_mm: number | null;
  t_mm: number | null;
  customYBottom_mm: number | null;
  lateralAnchor: CompositePlateLateralAnchor | null;
  lateralOffset_mm: number | null;
}

interface CompositeSectionPayload {
  mode: CompositeSectionMode | null;
  profileType: ProfileType | null;
  profileSize: number | null;
  grade: SteelGrade | null;
  plates: CompositePlatePayload[] | null;
  Ly_m: number | null;
  Lz_m: number | null;
  bcType: ColumnBCType | null;
  beta_y: number | null;
  beta_z: number | null;
  Ned_kN: number | null;
  warnings: string[];
}

function finiteNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function oneOf<T extends string | number>(v: unknown, allowed: readonly T[]): T | null {
  return (allowed as readonly unknown[]).includes(v) ? (v as T) : null;
}

function parsePlate(raw: unknown): CompositePlatePayload {
  const r = (typeof raw === 'object' && raw !== null && !Array.isArray(raw))
    ? (raw as Record<string, unknown>)
    : {};
  return {
    posType: oneOf(r.posType, POS_TYPES),
    b_mm: finiteNumber(r.b_mm),
    t_mm: finiteNumber(r.t_mm),
    customYBottom_mm: finiteNumber(r.customYBottom_mm),
    lateralAnchor: oneOf(r.lateralAnchor, ANCHORS),
    lateralOffset_mm: finiteNumber(r.lateralOffset_mm),
  };
}

function parsePayload(raw: unknown): CompositeSectionPayload {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new AiError('bad-response', 'La propuesta del modelo no es un objeto JSON.');
  }
  const r = raw as Record<string, unknown>;
  return {
    mode: oneOf(r.mode, MODES),
    profileType: oneOf(r.profileType, PROFILE_TYPES),
    profileSize: finiteNumber(r.profileSize),
    grade: oneOf(r.grade, GRADES),
    plates: Array.isArray(r.plates) ? r.plates.map(parsePlate) : null,
    Ly_m: finiteNumber(r.Ly_m),
    Lz_m: finiteNumber(r.Lz_m),
    bcType: oneOf(r.bcType, BC_TYPES),
    beta_y: finiteNumber(r.beta_y),
    beta_z: finiteNumber(r.beta_z),
    Ned_kN: finiteNumber(r.Ned_kN),
    warnings: Array.isArray(r.warnings)
      ? r.warnings.filter((w): w is string => typeof w === 'string')
      : [],
  };
}

// ── Mapper payload → AiApplyPlan ─────────────────────────────────────────────

const LABELS = {
  mode: 'Modo de la sección',
  profileType: 'Familia del perfil',
  profileSize: 'Tamaño del perfil',
  grade: 'Acero',
  plates: 'Chapas de refuerzo',
  Ly_m: 'Luz de pandeo Ly',
  Lz_m: 'Luz de pandeo Lz',
  bcType: 'Vinculaciones de pandeo',
  beta_y: 'Coeficiente β eje y',
  beta_z: 'Coeficiente β eje z',
  Ned_kN: 'Axil NEd',
} as const;

type PayloadKey = keyof typeof LABELS;

const KEY_ORDER: readonly PayloadKey[] = [
  'mode', 'profileType', 'profileSize', 'grade', 'plates',
  'Ly_m', 'Lz_m', 'bcType', 'beta_y', 'beta_z', 'Ned_kN',
];

const MODE_LABELS: Record<CompositeSectionMode, string> = {
  reinforced: 'Perfil reforzado',
  custom: 'Personalizada (solo chapas)',
};

const BC_LABELS: Record<ColumnBCType, string> = {
  pp: 'Biarticulado (β=1.0)',
  pf: 'Articulado-empotrado (β=0.7)',
  ff: 'Biempotrado (β=0.5)',
  fc: 'Ménsula (β=2.0)',
  custom: 'Personalizado (β manuales)',
};

const ALREADY = 'Ya coincide con el valor actual';
const EPS = 1e-9;

/**
 * Campos de sección compuesta que NO son variables de diseño: el axil, las
 * luces de pandeo y las vinculaciones los fija la estructura. Las chapas, el
 * perfil y el acero SÍ son diseño (subirlos es la salida legítima): sin regla.
 */
export const COMPOSITE_SAFETY_RULES: ReadonlyArray<SafetyRule<CompositeSectionInputs>> = [
  {
    field: 'Ned',
    confirmKey: 'Ned_kN',
    level: higherIsSafer,
    why: 'El axil de compresión lo fija el análisis de la estructura: rebajarlo baja la demanda de pandeo.',
  },
  {
    field: 'Ly',
    confirmKey: 'Ly_m',
    level: higherIsSafer,
    why: 'La luz de pandeo Ly es un dato de la estructura: acortarla reduce la esbeltez y sube χ artificialmente.',
  },
  {
    field: 'Lz',
    confirmKey: 'Lz_m',
    level: higherIsSafer,
    why: 'La luz de pandeo Lz es un dato de la estructura: acortarla reduce la esbeltez y sube χ artificialmente.',
  },
];

/**
 * FUGA 2 (auditoría 2026-07-14) — β EFECTIVA, no `bcType` ni `beta_y/beta_z`.
 * Misma historia y mismo arreglo que en pilares de acero (steelColumns.ts), con
 * el que este módulo COMPARTE el resolvedor `getBetaForBCType` y la curva de
 * pandeo: `{bcType:'custom', beta_y:0.5, beta_z:0.5}` partía la longitud de
 * pandeo por dos sin producir un solo riesgo, porque `ordinalLevel` no tenía
 * entrada para 'custom' y el gate anti-ruido desarmaba las reglas de β (su
 * default, 1.0, es también el caso real más común).
 */
export const COMPOSITE_RESOLVED_RULES: ReadonlyArray<ResolvedSafetyRule<CompositeSectionInputs>> = [
  {
    id: 'beta_y_efectiva',
    label: 'Coef. de pandeo efectivo β_y',
    resolve: (s) => getBetaForBCType(s.bcType, s.beta_y, s.beta_z).beta_y,
    level: higherIsSafer,
    format: (v) => v.toFixed(2),
    why: 'β describe cómo está CONSTRUIDO el pilar (las vinculaciones reales), no es una variable de diseño: rebajarlo —cambiando la condición de apoyo o escribiéndolo a mano en modo "custom"— acorta la longitud de pandeo, sube χ y hace "cumplir" la sección sin tocar la obra.',
    fields: ['bcType', 'beta_y', 'beta_z'],
    confirmKeys: ['bcType', 'beta_y', 'beta_z'],
  },
  {
    id: 'beta_z_efectiva',
    label: 'Coef. de pandeo efectivo β_z',
    resolve: (s) => getBetaForBCType(s.bcType, s.beta_y, s.beta_z).beta_z,
    level: higherIsSafer,
    format: (v) => v.toFixed(2),
    why: 'β describe cómo está CONSTRUIDO el pilar (las vinculaciones reales), no es una variable de diseño: rebajarlo acorta la longitud de pandeo del eje débil y sube χ sin tocar la obra.',
    fields: ['bcType', 'beta_y', 'beta_z'],
    confirmKeys: ['bcType', 'beta_y', 'beta_z'],
  },
];

const fmtM = (mm: number) => (mm / 1000).toFixed(2) + ' m';
const round2 = (v: number) => Math.round(v * 100) / 100;

function rangeReason(value: number, min: number, max: number, unit: string): string {
  const u = unit === '' ? '' : ` ${unit}`;
  return `Valor ${value}${u} fuera del rango admisible ${min}–${max}${u}`;
}

/** Texto compacto de una chapa para la tabla de cambios de la tarjeta. */
function fmtPlate(p: PlateEntry): string {
  switch (p.posType) {
    case 'top': return `sup. ${p.b}×${p.t}`;
    case 'bottom': return `inf. ${p.b}×${p.t}`;
    case 'left': return `lat. izq. e=${p.b}${(p.lateralAnchor ?? 'web') === 'flange' ? ' (alas)' : ''}`;
    case 'right': return `lat. dcha. e=${p.b}${(p.lateralAnchor ?? 'web') === 'flange' ? ' (alas)' : ''}`;
    case 'custom': return `y=${p.customYBottom} ${p.b}×${p.t}`;
  }
}

function fmtPlates(plates: readonly PlateEntry[]): string {
  if (plates.length === 0) return 'sin chapas';
  return `${plates.length} chapa${plates.length === 1 ? '' : 's'} (${plates.map(fmtPlate).join(' · ')})`;
}

/** Igualdad de chapa ignorando `id` (se regeneran) y con los fallbacks de opcionales. */
function samePlate(a: PlateEntry, b: PlateEntry): boolean {
  return a.posType === b.posType
    && a.b === b.b
    && a.t === b.t
    && a.customYBottom === b.customYBottom
    && (a.lateralAnchor ?? 'web') === (b.lateralAnchor ?? 'web')
    && (a.lateralOffset ?? 0) === (b.lateralOffset ?? 0);
}

function samePlates(a: readonly PlateEntry[], b: readonly PlateEntry[]): boolean {
  return a.length === b.length && a.every((p, i) => samePlate(p, b[i]));
}

/**
 * Valida y normaliza UNA chapa del payload a PlateEntry (sin id — se asigna al
 * final). Devuelve string = motivo de invalidez del ELEMENTO (que invalida la
 * propuesta del array entero).
 */
function mapPlate(
  raw: CompositePlatePayload,
  index: number,
  mode: CompositeSectionMode,
  warnings: string[],
): Omit<PlateEntry, 'id'> | string {
  const n = index + 1;
  if (raw.posType === null) return `Chapa ${n}: posType ausente o no reconocido`;
  const pos = raw.posType;
  if (mode === 'custom' && !(POS_TYPES_CUSTOM_MODE as readonly string[]).includes(pos)) {
    return `Chapa ${n}: la posición "${pos}" solo existe en modo perfil reforzado`;
  }
  if (raw.b_mm === null) return `Chapa ${n}: falta b_mm`;

  if (pos === 'left' || pos === 'right') {
    // b = ESPESOR de la chapa vertical; t se ignora.
    if (raw.b_mm < 3 || raw.b_mm > 100) return `Chapa ${n}: espesor ${raw.b_mm} mm fuera del rango 3–100 mm`;
    if (raw.t_mm !== null) {
      warnings.push(`Chapa ${n}: t_mm se ignora en las chapas laterales (el espesor es b_mm).`);
    }
    const offset = raw.lateralOffset_mm ?? 0;
    if (offset < 0 || offset > 200) return `Chapa ${n}: desfase lateral ${offset} mm fuera del rango 0–200 mm`;
    return {
      b: round2(raw.b_mm),
      t: 10, // inerte en laterales; valor neutro por si la chapa cambia luego de posición
      posType: pos,
      customYBottom: 0,
      lateralAnchor: raw.lateralAnchor ?? 'web',
      lateralOffset: offset,
    };
  }

  // top / bottom / custom — platabanda horizontal b×t.
  if (raw.b_mm < 30 || raw.b_mm > 1000) return `Chapa ${n}: ancho ${raw.b_mm} mm fuera del rango 30–1000 mm`;
  if (raw.t_mm === null) return `Chapa ${n}: falta t_mm (espesor de la platabanda)`;
  if (raw.t_mm < 3 || raw.t_mm > 100) return `Chapa ${n}: espesor ${raw.t_mm} mm fuera del rango 3–100 mm`;
  if (raw.lateralAnchor !== null || (raw.lateralOffset_mm !== null && raw.lateralOffset_mm !== 0)) {
    warnings.push(`Chapa ${n}: lateralAnchor/lateralOffset solo aplican a chapas laterales; se ignoran.`);
  }
  let customY = 0;
  if (pos === 'custom') {
    if (raw.customYBottom_mm === null) return `Chapa ${n}: posType "custom" requiere customYBottom_mm`;
    if (raw.customYBottom_mm < 0 || raw.customYBottom_mm > 3000) {
      return `Chapa ${n}: cota ${raw.customYBottom_mm} mm fuera del rango 0–3000 mm`;
    }
    customY = round2(raw.customYBottom_mm);
  } else if (raw.customYBottom_mm !== null && raw.customYBottom_mm !== 0) {
    warnings.push(`Chapa ${n}: customYBottom_mm solo aplica a posType "custom"; se ignora.`);
  }
  return {
    b: round2(raw.b_mm),
    t: round2(raw.t_mm),
    posType: pos,
    customYBottom: customY,
  };
}

function buildCompositePlan(
  payload: unknown,
  current: CompositeSectionInputs,
  system: UnitSystem,
  confirmed?: ReadonlySet<string>,
): AiApplyPlan<CompositeSectionInputs> {
  const x = parsePayload(payload);
  const fields: Partial<CompositeSectionInputs> = {};
  const changes: AiFieldChange[] = [];
  const skipped: AiSkippedField[] = [];
  const warnings: string[] = [...x.warnings];
  const handled = new Set<PayloadKey>();

  function skip(key: PayloadKey, reason: string): void {
    handled.add(key);
    skipped.push({ label: LABELS[key], reason });
  }

  function apply<K extends keyof CompositeSectionInputs>(
    key: PayloadKey,
    field: K,
    value: CompositeSectionInputs[K],
    before: string,
    after: string,
  ): void {
    handled.add(key);
    fields[field] = value;
    changes.push({ field, label: LABELS[key], before, after });
  }

  // --- Gate de modo: modo EFECTIVO = propuesto ?? vigente (patrón rc-columns) ---
  const mode: CompositeSectionMode = x.mode ?? current.mode;
  const REINFORCED_ONLY =
    'Solo aplica al modo perfil reforzado y el modo efectivo es "custom" (solo chapas); propone el cambio de modo explícitamente si procede';

  if (x.mode !== null) {
    if (x.mode === current.mode) skip('mode', ALREADY);
    else apply('mode', 'mode', x.mode, MODE_LABELS[current.mode], MODE_LABELS[x.mode]);
  }

  // --- Perfil base (solo reinforced) ---
  const profileType: ProfileType = (x.profileType ?? current.profileType) as ProfileType;
  if (x.profileType !== null) {
    if (mode !== 'reinforced') skip('profileType', REINFORCED_ONLY);
    else if (x.profileType === current.profileType) skip('profileType', ALREADY);
    else {
      apply('profileType', 'profileType', x.profileType, current.profileType, x.profileType);
      // La UI reajusta el tamaño al cambiar de familia; el plan replica ese
      // ajuste si el payload no trae tamaño y el vigente no existe en la nueva.
      if (x.profileSize === null) {
        const sizes = getSizesForTipo(x.profileType);
        if (!sizes.includes(current.profileSize)) {
          const snapped = sizes[0];
          fields.profileSize = snapped;
          changes.push({
            field: 'profileSize',
            label: LABELS.profileSize,
            before: `${current.profileType} ${current.profileSize}`,
            after: `${x.profileType} ${snapped}`,
          });
          warnings.push(`El tamaño ${current.profileSize} no existe en la familia ${x.profileType}; se ajusta al primero disponible (${snapped}).`);
          handled.add('profileSize');
        }
      }
    }
  }
  if (x.profileSize !== null && !handled.has('profileSize')) {
    if (mode !== 'reinforced') skip('profileSize', REINFORCED_ONLY);
    else {
      const sizes = getSizesForTipo(profileType);
      const v = Math.round(x.profileSize);
      if (!sizes.includes(v)) {
        skip('profileSize', `${profileType} ${v} no está en el catálogo (${sizes.join(', ')})`);
      } else if (v === current.profileSize && profileType === current.profileType) {
        skip('profileSize', ALREADY);
      } else {
        apply('profileSize', 'profileSize', v, `${current.profileType} ${current.profileSize}`, `${profileType} ${v}`);
      }
    }
  }

  // --- Acero (aplica en ambos modos) ---
  if (x.grade !== null) {
    if (x.grade === current.grade) skip('grade', ALREADY);
    else apply('grade', 'grade', x.grade, current.grade, x.grade);
  }

  // --- Chapas: REEMPLAZO completo, validación por elemento, todo-o-nada ---
  if (x.plates !== null) {
    if (x.plates.length === 0) {
      skip('plates', 'La lista de chapas no puede quedar vacía: la sección compuesta necesita al menos una chapa');
    } else if (x.plates.length > MAX_PLATES) {
      skip('plates', `${x.plates.length} chapas superan el máximo del módulo (${MAX_PLATES})`);
    } else {
      const mapped: PlateEntry[] = [];
      let elementError: string | null = null;
      const plateWarnings: string[] = [];
      for (let i = 0; i < x.plates.length; i++) {
        const res = mapPlate(x.plates[i], i, mode, plateWarnings);
        if (typeof res === 'string') { elementError = res; break; }
        mapped.push({ id: `p${i + 1}`, ...res });
      }
      if (elementError !== null) {
        skip('plates', `${elementError} — no se aplica ninguna chapa (la lista reemplaza a la actual entera)`);
      } else if (samePlates(mapped, current.plates)) {
        skip('plates', ALREADY);
      } else {
        warnings.push(...plateWarnings);
        apply('plates', 'plates', mapped, fmtPlates(current.plates), fmtPlates(mapped));
      }
    }
  }

  // --- Bloque de compresión (solo reinforced) ---
  function applyBucklingLength(key: 'Ly_m' | 'Lz_m', field: 'Ly' | 'Lz', value: number | null): void {
    if (value === null) return;
    if (mode !== 'reinforced') { skip(key, REINFORCED_ONLY); return; }
    if (value < 0.5 || value > 30) { skip(key, rangeReason(value, 0.5, 30, 'm')); return; }
    const mm = Math.round(value * 1000);
    if (mm === current[field]) skip(key, ALREADY);
    else apply(key, field, mm, fmtM(current[field]), fmtM(mm));
  }
  applyBucklingLength('Ly_m', 'Ly', x.Ly_m);
  applyBucklingLength('Lz_m', 'Lz', x.Lz_m);

  const bcType: ColumnBCType = x.bcType ?? current.bcType;
  if (x.bcType !== null) {
    if (mode !== 'reinforced') skip('bcType', REINFORCED_ONLY);
    else if (x.bcType === current.bcType) skip('bcType', ALREADY);
    else apply('bcType', 'bcType', x.bcType, BC_LABELS[current.bcType], BC_LABELS[x.bcType]);
  }

  function applyBeta(key: 'beta_y' | 'beta_z', field: 'beta_y' | 'beta_z', value: number | null): void {
    if (value === null) return;
    if (mode !== 'reinforced') { skip(key, REINFORCED_ONLY); return; }
    if (bcType !== 'custom') {
      skip(key, 'β solo es editable con vinculaciones "custom"; con las estándar lo fija el propio tipo de apoyo');
      return;
    }
    if (value < 0.5 || value > 4) { skip(key, rangeReason(value, 0.5, 4, '')); return; }
    if (Math.abs(value - current[field]) <= EPS) skip(key, ALREADY);
    else apply(key, field, value, current[field].toFixed(2), value.toFixed(2));
  }
  applyBeta('beta_y', 'beta_y', x.beta_y);
  applyBeta('beta_z', 'beta_z', x.beta_z);

  if (x.Ned_kN !== null) {
    if (mode !== 'reinforced') skip('Ned_kN', REINFORCED_ONLY);
    else if (x.Ned_kN < 0 || x.Ned_kN > 50000) skip('Ned_kN', rangeReason(x.Ned_kN, 0, 50000, 'kN'));
    else {
      const v = round2(x.Ned_kN);
      if (Math.abs(v - current.Ned) <= EPS) skip('Ned_kN', ALREADY);
      else apply('Ned_kN', 'Ned', v, formatQuantity(current.Ned, 'force', system), formatQuantity(v, 'force', system));
    }
  }

  // --- notFound ---
  const values: Record<PayloadKey, unknown> = {
    mode: x.mode, profileType: x.profileType, profileSize: x.profileSize,
    grade: x.grade, plates: x.plates,
    Ly_m: x.Ly_m, Lz_m: x.Lz_m, bcType: x.bcType,
    beta_y: x.beta_y, beta_z: x.beta_z, Ned_kN: x.Ned_kN,
  };
  const notFound: string[] = [];
  for (const key of KEY_ORDER) {
    if (values[key] === null && !handled.has(key)) notFound.push(LABELS[key]);
  }

  // ── Guard de modo custom: nunca dejar el módulo INVÁLIDO ────────────────────
  //
  // Auditoría 2026-07-14 (5ª familia): el modo "custom" (solo chapas) NO admite
  // chapas laterales (left/right) y exige al menos una chapa (calcCompositeSection:
  // "Posición lateral no disponible en modo personalizado" / "Sin elementos").
  // Si el modelo propone `mode:'custom'` SIN reproponer unas chapas compatibles,
  // las laterales vigentes (o la lista vacía) quedan y el módulo cae a inválido de
  // un clic. Cuando el estado FINAL sería custom + laterales/vacío, se REVIERTE el
  // cambio de modo propuesto (la sección se queda en "reforzado", que sí admite
  // laterales) con un motivo que dice qué reproponer. Si el modo ya venía custom
  // del estado del usuario, no se toca: reproponer el modo sería un no-op.
  {
    const finalMode = fields.mode ?? current.mode;
    const finalPlates = fields.plates ?? current.plates;
    const hasLateral = finalPlates.some((pl) => pl.posType === 'left' || pl.posType === 'right');
    const empty = finalPlates.length === 0;
    if (finalMode === 'custom' && (hasLateral || empty) && 'mode' in fields) {
      delete fields.mode;
      const i = changes.findIndex((c) => c.field === 'mode');
      if (i >= 0) changes.splice(i, 1);
      const detalle = empty
        ? 'no hay ninguna chapa y el modo personalizado (solo chapas) necesita al menos una'
        : 'la sección tiene chapas laterales y el modo personalizado no las admite (solo platabandas superior/inferior o a cota libre)';
      skip('mode', `No se cambia a modo personalizado: ${detalle}. Para pasar a personalizado, propón en el MISMO turno la lista de chapas compatible (sin laterales y con al menos una).`);
    }
  }

  // Las chapas son diseño libre: sin reglas de elemento (a diferencia de los
  // estratos geotécnicos de micropilotes/taludes).
  const risks = [
    ...detectSafetyRisks(
      COMPOSITE_SAFETY_RULES, changes, fields, current, compositeSectionDefaults, confirmed,
    ),
    // β efectiva: sustituye a las reglas por campo de bcType/beta_y/beta_z (fuga 2).
    ...detectResolvedRisks(
      COMPOSITE_RESOLVED_RULES, fields, current, compositeSectionDefaults, confirmed,
    ),
  ];
  return { fields, changes, skipped, notFound, warnings, notes: null, risks };
}

// ── Snapshot del estado ───────────────────────────────────────────────────────

/** Chapa en la forma del payload (unidades humanas) para el snapshot. */
function plateToPayloadShape(p: PlateEntry): Record<string, unknown> {
  const lateral = p.posType === 'left' || p.posType === 'right';
  return {
    posType: p.posType,
    b_mm: p.b,
    t_mm: lateral ? null : p.t,
    customYBottom_mm: p.posType === 'custom' ? p.customYBottom : null,
    lateralAnchor: lateral ? (p.lateralAnchor ?? 'web') : null,
    lateralOffset_mm: lateral ? (p.lateralOffset ?? 0) : null,
  };
}

function buildSnapshot(c: CompositeSectionInputs): string {
  const valores: Record<string, unknown> = {
    mode: c.mode,
    profileType: c.profileType,
    profileSize: c.profileSize,
    grade: c.grade,
    plates: c.plates.map(plateToPayloadShape),
    Ly_m: c.Ly / 1000,
    Lz_m: c.Lz / 1000,
    bcType: c.bcType,
    beta_y: c.beta_y,
    beta_z: c.beta_z,
    Ned_kN: c.Ned,
  };
  const sinConfirmar: PayloadKey[] = [];
  const d = compositeSectionDefaults;
  const scalarDefaults: Record<Exclude<PayloadKey, 'plates'>, [unknown, unknown]> = {
    mode: [c.mode, d.mode],
    profileType: [c.profileType, d.profileType],
    profileSize: [c.profileSize, d.profileSize],
    grade: [c.grade, d.grade],
    Ly_m: [c.Ly, d.Ly],
    Lz_m: [c.Lz, d.Lz],
    bcType: [c.bcType, d.bcType],
    beta_y: [c.beta_y, d.beta_y],
    beta_z: [c.beta_z, d.beta_z],
    Ned_kN: [c.Ned, d.Ned],
  };
  for (const key of KEY_ORDER) {
    if (key === 'plates') {
      if (samePlates(c.plates, d.plates)) sinConfirmar.push(key);
    } else {
      const [cur, def] = scalarDefaults[key];
      if (cur === def) sinConfirmar.push(key);
    }
  }
  return JSON.stringify({ valores, sin_confirmar: sinConfirmar });
}

// ── Resumen de resultados para el prompt ─────────────────────────────────────

/**
 * Fila sintética que traslada al chat el MISMO veredicto que ve el usuario:
 * el badge de CompositeSectionResults se deriva del sectionClass (≤2 ok,
 * 3 warn, 4/class4Warning fail; custom sin clase → neutro), NO de
 * overallStatus(checks). utilization = NaN ⇒ el serializador omite η.
 */
function sectionClassRow(r: CompositeSectionResult): CheckRow {
  if (r.class4Warning) {
    return {
      id: 'ai-section-class', description: 'Clase de la sección',
      value: r.sectionClass !== null ? `CLASE ${r.sectionClass}` : 'CLASE 4 (chapa esbelta)',
      limit: 'clase ≤ 3', utilization: NaN, status: 'fail',
      article: 'CE Anejo 22 §5.2',
    };
  }
  if (r.sectionClass === null) {
    return {
      id: 'ai-section-class', description: 'Clase de la sección',
      value: '', limit: '', utilization: NaN, status: 'neutral',
      tag: 'N/A (modo custom)', article: '',
    };
  }
  return {
    id: 'ai-section-class', description: 'Clase de la sección',
    value: `CLASE ${r.sectionClass}`,
    limit: r.sectionClass <= 2 ? 'cálculo plástico (Wpl)' : 'cálculo elástico (Wel)',
    utilization: NaN, status: r.sectionClass <= 2 ? 'ok' : 'warn',
    article: 'CE Anejo 22 §5.2',
  };
}

export function summarizeCompositeSectionResults(r: CompositeSectionResult): AiResultsSummary {
  if (r.error != null) return summarizeCalcResults(r);

  const checks: CheckRow[] = [
    sectionClassRow(r),
    ...r.checks,
    ...(r.compApplicable ? r.compChecks : []),
  ];

  const extra: string[] = [
    `Propiedades: A = ${r.A_cm2.toFixed(1)} cm² · Iy = ${r.Iy_cm4.toFixed(0)} cm⁴ · Iz = ${r.Iz_cm4.toFixed(0)} cm⁴`,
    r.class4Warning
      ? 'MRd no disponible — clase 4: exigiría sección eficaz (EN 1993-1-5), no implementada. La salida es engrosar o rigidizar las chapas esbeltas.'
      : `MRd,y = ${r.Mrd_kNm.toFixed(1)} kNm · MRd,z = ${r.Mrd_z_kNm.toFixed(1)} kNm (fy = ${r.fy_MPa} MPa)`,
  ];
  if (r.compApplicable) {
    extra.push(
      r.compClass4
        ? 'Compresión: sección clase 4 — Nc,Rd no disponible.'
        : `Compresión: Nc,Rd = ${r.Nc_Rd_kN.toFixed(0)} kN · NEd = ${r.Ned_kN.toFixed(0)} kN`
          + (Number.isFinite(r.compUtil) && r.compUtil > 0 ? ` · aprovechamiento ${Math.round(r.compUtil * 100)}%` : ''),
    );
  }

  return summarizeCalcResults({ valid: r.valid, checks }, extra);
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export const compositeSectionAdapter: AiModuleAdapter<CompositeSectionInputs> = {
  id: 'composite-section',
  label: 'Sección compuesta',
  payloadSchema: COMPOSITE_SECTION_PAYLOAD_SCHEMA,
  promptRules: PROMPT_RULES,
  placeholder: PLACEHOLDER_EXAMPLE,
  snapshot: buildSnapshot,
  buildPlan: buildCompositePlan,
};
