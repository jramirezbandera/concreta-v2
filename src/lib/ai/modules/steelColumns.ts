/**
 * Adapter del asistente IA para el módulo Pilares de acero (ola 1, EC3).
 *
 * Particularidades del módulo:
 * - `Ly`/`Lz` viven en MILÍMETROS en el estado pero se editan (y se proponen) en
 *   METROS: `buildPlan` multiplica por 1000 (mismo patrón que `Lcr` en vigas).
 * - VALIDACIÓN CRUZADA familia↔tamaño: el catálogo de tamaños depende de la
 *   familia FINAL del plan (HEA/HEB/IPE → `getSizesForTipo`; 2UPN →
 *   `getSizesUPN`; CHS ignora `size` y usa D/t). Si la familia cambia y el
 *   tamaño vigente no existe en la nueva, se ajusta al primero disponible con un
 *   warning — el mismo auto-ajuste que hace la UI.
 * - β es DERIVADO salvo con `bcType = 'custom'`. El motor lee `beta_y`/`beta_z`
 *   del estado directamente, así que al cambiar `bcType` hay que reescribirlos
 *   (lo mismo que hace `handleBCType` en el panel): se escriben en `fields` sin
 *   fila propia en la tabla de cambios (son consecuencia, no decisión) y con un
 *   warning que lo explica.
 */
import { AiError } from '../types';
import type { AiApplyPlan, AiFieldChange, AiModuleAdapter, AiSkippedField } from './types';
import { summarizeCalcResults, type AiResultsSummary } from '../resultsSummary';
import {
  detectResolvedRisks,
  detectSafetyRisks,
  higherIsSafer,
  type ResolvedSafetyRule,
  type SafetyRule,
} from '../safety';
import type { SteelColumnResult } from '../../calculations/steelColumns';
import { getBetaForBCType } from '../../calculations/steelColumnBC';
import { getSizesForTipo, getSizesUPN } from '../../../data/steelProfiles';
import {
  steelColumnDefaults,
  type ColumnBCType,
  type SteelColumnInputs,
  type SteelColumnSectionType,
} from '../../../data/defaults';
import { formatQuantity } from '../../units/format';
import type { UnitSystem } from '../../units/types';

// ── Catálogos del módulo ──────────────────────────────────────────────────────
const SECTION_TYPES: readonly string[] = ['HEA', 'HEB', 'IPE', '2UPN', 'CHS'];
const STEELS: readonly string[] = ['S275', 'S355'];
const CHS_PROCESSES: readonly string[] = ['hot-finished', 'cold-formed'];
const BC_TYPES: readonly string[] = ['pp', 'pf', 'ff', 'fc', 'custom'];

/** Tamaños disponibles de una familia. CHS no usa `size` (se define con D y t). */
function sizesFor(sectionType: SteelColumnSectionType): number[] {
  if (sectionType === 'CHS') return [];
  if (sectionType === '2UPN') return getSizesUPN();
  return getSizesForTipo(sectionType);
}

// ── Payload schema (JSON Schema canónico PLANO, todo nullable) ────────────────

export const STEEL_COLUMN_PAYLOAD_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: [
    'sectionType', 'size', 'steel', 'chs_D_mm', 'chs_t_mm', 'chs_process',
    'Ly_m', 'Lz_m', 'bcType', 'beta_y', 'beta_z',
    'Ned_kN', 'My_kNm', 'Mz_kNm', 'warnings',
  ],
  properties: {
    sectionType: { type: ['string', 'null'], enum: [...SECTION_TYPES, null], description: 'Familia del perfil: "HEA", "HEB", "IPE", "2UPN" (dos UPN en cajón) o "CHS" (tubo circular hueco).' },
    size: { type: ['integer', 'null'], description: 'Designación del perfil dentro de su familia (HEB 200 → 200; 2UPN 160 → 160). NO se usa con CHS: el tubo se define con chs_D_mm y chs_t_mm.' },
    steel: { type: ['string', 'null'], enum: [...STEELS, null], description: 'Grado del acero: "S275" o "S355".' },
    chs_D_mm: { type: ['number', 'null'], description: 'SOLO para CHS: diámetro exterior del tubo en mm.' },
    chs_t_mm: { type: ['number', 'null'], description: 'SOLO para CHS: espesor de pared del tubo en mm.' },
    chs_process: { type: ['string', 'null'], enum: [...CHS_PROCESSES, null], description: 'SOLO para CHS: proceso de fabricación — "hot-finished" (acabado en caliente, EN 10210, curva de pandeo a) o "cold-formed" (conformado en frío, EN 10219, curva c).' },
    Ly_m: { type: ['number', 'null'], description: 'Longitud de pandeo del eje FUERTE (y) en METROS: distancia entre arriostramientos en ese plano.' },
    Lz_m: { type: ['number', 'null'], description: 'Longitud de pandeo del eje DÉBIL (z) en METROS: distancia entre arriostramientos laterales.' },
    bcType: { type: ['string', 'null'], enum: [...BC_TYPES, null], description: 'Condición de apoyo del pilar: "pp" biarticulado (β=1.0), "pf" articulado-empotrado (β=0.7), "ff" biempotrado (β=0.5), "fc" empotrado-libre / ménsula (β=2.0) o "custom" para dar β a mano. Con cualquier valor distinto de "custom", β lo deriva la aplicación.' },
    beta_y: { type: ['number', 'null'], description: 'Coeficiente de pandeo del eje fuerte. SOLO se usa si bcType = "custom".' },
    beta_z: { type: ['number', 'null'], description: 'Coeficiente de pandeo del eje débil. SOLO se usa si bcType = "custom".' },
    Ned_kN: { type: ['number', 'null'], description: 'Axil de cálculo N_Ed en kN (ELU, compresión positiva).' },
    My_kNm: { type: ['number', 'null'], description: 'Momento de cálculo del eje fuerte My,Ed en kNm (ELU).' },
    Mz_kNm: { type: ['number', 'null'], description: 'Momento de cálculo del eje débil Mz,Ed en kNm (ELU).' },
    warnings: { type: 'array', items: { type: 'string' }, description: 'Avisos: conversiones de unidades realizadas, ambigüedades, datos del enunciado ignorados.' },
  },
};

// ── Prompt del módulo ─────────────────────────────────────────────────────────

const PROMPT_RULES = `Reglas específicas del módulo Pilares de acero:
1. Las longitudes de pandeo Ly_m y Lz_m van en METROS. Son las distancias entre arriostramientos de cada plano: si el pilar está arriostrado a media altura en el plano débil, Lz es la MITAD de la altura mientras que Ly es la altura completa. Si el enunciado no distingue, usa la altura del pilar para las dos y dilo en un warning.
2. Ned, My y Mz son esfuerzos de CÁLCULO, YA MAYORADOS (ELU). Si el enunciado da cargas de servicio, mayóralas (γG=1.35 / γQ=1.5 salvo indicación) y explícalo en un warning. My es el momento del eje FUERTE y Mz el del DÉBIL.
3. El perfil: con las familias HEA, HEB, IPE y 2UPN el perfil se elige con "size" (HEB 200 → size 200). Con la familia CHS (tubo circular) "size" NO se usa: el tubo se define con chs_D_mm (diámetro exterior) y chs_t_mm (espesor de pared). Propón siempre la familia junto al tamaño cuando cambies de una a otra.
4. bcType fija β automáticamente: "pp" biarticulado β=1.0, "pf" articulado-empotrado β=0.7, "ff" biempotrado β=0.5, "fc" ménsula β=2.0. Propón bcType, NO β: los campos beta_y y beta_z solo se usan con bcType="custom" y en cualquier otro caso los sobrescribe la aplicación.
5. Sección de clase 4: el módulo no la soporta. Si el resultado dice "Clase 4", la salida es un perfil de más espesor (subir de HEA a HEB, o engrosar la pared del tubo), no reducir el axil.
6. En este módulo son DATOS del problema, no variables de diseño: los esfuerzos (Ned, My, Mz), las longitudes de pandeo (Ly, Lz) y la condición de apoyo (bcType y, en su caso, β). Para que el pilar cumpla actúa SIEMPRE sobre la RESISTENCIA: perfil mayor o de más espesor (HEB frente a HEA, tamaño superior, más pared en el tubo) o acero de más límite elástico (S275 → S355). NUNCA rebajes un esfuerzo, ni acortes una longitud de pandeo, ni "empotres" un pilar articulado para que salga el cálculo: β lo fija cómo está construido el nudo, no la comprobación.`;

const PLACEHOLDER_EXAMPLE =
  'Ej.: Pilar HEB 200 de acero S275 y 3.5 m de altura, biarticulado, con un axil de cálculo '
  + 'de 400 kN y un momento de 50 kNm en el eje fuerte.';

// ── Parseo defensivo del payload ──────────────────────────────────────────────

interface SteelColumnPayload {
  sectionType: string | null;
  size: number | null;
  steel: string | null;
  chs_D_mm: number | null;
  chs_t_mm: number | null;
  chs_process: string | null;
  Ly_m: number | null;
  Lz_m: number | null;
  bcType: string | null;
  beta_y: number | null;
  beta_z: number | null;
  Ned_kN: number | null;
  My_kNm: number | null;
  Mz_kNm: number | null;
  warnings: string[];
}

function finiteNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
function stringOrNull(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function parsePayload(raw: unknown): SteelColumnPayload {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new AiError('bad-response', 'La propuesta del modelo no es un objeto JSON.');
  }
  const r = raw as Record<string, unknown>;
  return {
    sectionType: stringOrNull(r.sectionType),
    size: finiteNumber(r.size),
    steel: stringOrNull(r.steel),
    chs_D_mm: finiteNumber(r.chs_D_mm),
    chs_t_mm: finiteNumber(r.chs_t_mm),
    chs_process: stringOrNull(r.chs_process),
    Ly_m: finiteNumber(r.Ly_m),
    Lz_m: finiteNumber(r.Lz_m),
    bcType: stringOrNull(r.bcType),
    beta_y: finiteNumber(r.beta_y),
    beta_z: finiteNumber(r.beta_z),
    Ned_kN: finiteNumber(r.Ned_kN),
    My_kNm: finiteNumber(r.My_kNm),
    Mz_kNm: finiteNumber(r.Mz_kNm),
    warnings: Array.isArray(r.warnings)
      ? r.warnings.filter((w): w is string => typeof w === 'string')
      : [],
  };
}

// ── Mapper payload → AiApplyPlan ─────────────────────────────────────────────

const LABELS = {
  sectionType: 'Familia del perfil',
  size: 'Tamaño del perfil',
  steel: 'Acero',
  chs_D_mm: 'Diámetro del tubo D',
  chs_t_mm: 'Espesor del tubo t',
  chs_process: 'Proceso del tubo',
  Ly_m: 'Longitud de pandeo Ly',
  Lz_m: 'Longitud de pandeo Lz',
  bcType: 'Condición de apoyo',
  beta_y: 'Coef. pandeo βy',
  beta_z: 'Coef. pandeo βz',
  Ned_kN: 'Axil N_Ed',
  My_kNm: 'Momento My,Ed',
  Mz_kNm: 'Momento Mz,Ed',
} as const;

type PayloadKey = keyof typeof LABELS;

/** ORDER del contrato: `sectionType` antes que `size`/`chs_*`; `bcType` antes que β. */
const KEY_ORDER: readonly PayloadKey[] = [
  'sectionType', 'size', 'steel', 'chs_D_mm', 'chs_t_mm', 'chs_process',
  'Ly_m', 'Lz_m', 'bcType', 'beta_y', 'beta_z',
  'Ned_kN', 'My_kNm', 'Mz_kNm',
];

const ALREADY = 'Ya coincide con el valor actual';
const EPS = 1e-9;

const BC_ES: Record<string, string> = {
  pp: 'Biarticulado (β=1.0)',
  pf: 'Articulado-empotrado (β=0.7)',
  ff: 'Biempotrado (β=0.5)',
  fc: 'Ménsula (β=2.0)',
  custom: 'Personalizado',
};
const PROCESS_ES: Record<string, string> = {
  'hot-finished': 'Caliente (EN 10210)',
  'cold-formed': 'Frío (EN 10219)',
};

/**
 * Campos que NO son variables de diseño. El perfil (familia, tamaño, D/t del
 * tubo) y el acero SÍ lo son: subir de HEA a HEB o de S275 a S355 es la salida
 * legítima.
 *
 * β NO está aquí: vive en STEEL_COLUMN_RESOLVED_RULES, sobre la magnitud que el
 * motor acaba usando (ver abajo).
 */
export const STEEL_COLUMN_SAFETY_RULES: ReadonlyArray<SafetyRule<SteelColumnInputs>> = [
  { field: 'Ned', confirmKey: 'Ned_kN', level: higherIsSafer, why: 'El axil de cálculo lo fija el análisis de la estructura: rebajarlo baja la compresión y la utilización de pandeo.' },
  { field: 'My_Ed', confirmKey: 'My_kNm', level: higherIsSafer, why: 'El momento del eje fuerte lo fija el análisis de la estructura: rebajarlo alivia la interacción N+My+Mz y el pandeo lateral.' },
  { field: 'Mz_Ed', confirmKey: 'Mz_kNm', level: higherIsSafer, why: 'El momento del eje débil lo fija el análisis de la estructura: rebajarlo alivia la interacción N+My+Mz.' },
  { field: 'Ly', confirmKey: 'Ly_m', level: higherIsSafer, why: 'La longitud de pandeo del eje fuerte la fija la distancia real entre arriostramientos: acortarla baja la esbeltez y sube χ sin tocar el pilar.' },
  { field: 'Lz', confirmKey: 'Lz_m', level: higherIsSafer, why: 'La longitud de pandeo del eje débil la fija la distancia real entre arriostramientos laterales: acortarla baja la esbeltez y, además, infla el Mcr del pandeo lateral.' },
];

/**
 * FUGA 2 (auditoría 2026-07-14) — β EFECTIVA, no `bcType` ni `beta_y/beta_z`.
 *
 * Antes había tres reglas por campo: un ordinal sobre `bcType` con el β de cada
 * condición, y `higherIsSafer` sobre `beta_y`/`beta_z`. Las tres juntas dejaban
 * abierta la puerta que el motor sí ve:
 *   - `ordinalLevel` no tenía entrada para `'custom'` (no puede tenerla: el nivel
 *     de 'custom' LO DECIDE otro campo), y sin nivel no hay comparación ⇒ el
 *     cambio a 'custom' no era riesgo;
 *   - las reglas de `beta_y`/`beta_z` no lo tapaban, porque su valor vigente es el
 *     default (1.0, biarticulado) y el gate anti-ruido las desarmaba.
 * Resultado: `{bcType:'custom', beta_y:0.5, beta_z:0.5}` partía la longitud de
 * pandeo por dos, χ subía, el pilar cumplía — y `plan.risks` salía VACÍO.
 *
 * La regla correcta mira `getBetaForBCType`, que es exactamente lo que resuelve el
 * motor: cubre las tres puertas (cambiar la condición, cambiar β en 'custom', o
 * ambas) con una sola comparación, y de paso atrapa la β DERIVADA que buildPlan
 * escribe sin fila en `changes` al cambiar de condición de apoyo.
 */
export const STEEL_COLUMN_RESOLVED_RULES: ReadonlyArray<ResolvedSafetyRule<SteelColumnInputs>> = [
  {
    id: 'beta_y_efectiva',
    label: 'Coef. de pandeo efectivo β_y',
    resolve: (s) => getBetaForBCType(s.bcType, s.beta_y, s.beta_z).beta_y,
    level: higherIsSafer,
    format: (v) => v.toFixed(2),
    why: 'β describe cómo está CONSTRUIDO el pilar (los nudos reales), no es una variable de diseño: rebajarlo —cambiando la condición de apoyo o escribiéndolo a mano— acorta la longitud de pandeo Ly·β, sube χ y hace "cumplir" el pilar sin tocar la obra. Un empotramiento solo es real si el nudo puede transmitir el momento.',
    fields: ['bcType', 'beta_y', 'beta_z'],
    confirmKeys: ['bcType', 'beta_y', 'beta_z'],
  },
  {
    id: 'beta_z_efectiva',
    label: 'Coef. de pandeo efectivo β_z',
    resolve: (s) => getBetaForBCType(s.bcType, s.beta_y, s.beta_z).beta_z,
    level: higherIsSafer,
    format: (v) => v.toFixed(2),
    why: 'β describe cómo está CONSTRUIDO el pilar (los nudos reales), no es una variable de diseño: rebajarlo acorta la longitud de pandeo del eje débil —que es el que suele gobernar— y sube χ sin tocar la obra.',
    fields: ['bcType', 'beta_y', 'beta_z'],
    confirmKeys: ['bcType', 'beta_y', 'beta_z'],
  },
];

function rangeReason(value: number, min: number, max: number, unit: string): string {
  const u = unit === '' ? '' : ` ${unit}`;
  return `Valor ${value}${u} fuera del rango admisible ${min}–${max}${u}`;
}

const round2 = (v: number) => Math.round(v * 100) / 100;
const fmtM = (mm: number) => `${(mm / 1000).toFixed(2)} m`;

export const CHS_SIZE_REASON =
  'La familia CHS (tubo circular) no usa el tamaño de catálogo: el tubo se define con su '
  + 'diámetro exterior (chs_D_mm) y su espesor de pared (chs_t_mm).';

export const CHS_ONLY_REASON =
  'Los datos del tubo (D, espesor, proceso) solo se usan con la familia CHS.';

export const BETA_GATE_REASON =
  'β lo deriva la condición de apoyo: solo es editable con bcType = "custom".';

function buildSteelColumnPlan(
  x: SteelColumnPayload,
  current: SteelColumnInputs,
  system: UnitSystem,
  confirmed?: ReadonlySet<string>,
): AiApplyPlan<SteelColumnInputs> {
  const fields: Partial<SteelColumnInputs> = {};
  const changes: AiFieldChange[] = [];
  const skipped: AiSkippedField[] = [];
  const warnings: string[] = [...x.warnings];
  const handled = new Set<PayloadKey>();

  function skip(key: PayloadKey, reason: string): void {
    handled.add(key);
    skipped.push({ label: LABELS[key], reason });
  }

  function apply<K extends keyof SteelColumnInputs>(
    key: PayloadKey,
    field: K,
    value: SteelColumnInputs[K],
    before: string,
    after: string,
  ): void {
    handled.add(key);
    fields[field] = value;
    changes.push({ field, label: LABELS[key], before, after });
  }

  // --- Familia PRIMERO (gate del catálogo de tamaños y del bloque CHS) ---
  if (x.sectionType !== null) {
    if (!SECTION_TYPES.includes(x.sectionType)) {
      skip('sectionType', `Familia "${x.sectionType}" desconocida (HEA, HEB, IPE, 2UPN, CHS)`);
    } else if (x.sectionType === current.sectionType) {
      skip('sectionType', ALREADY);
    } else {
      apply(
        'sectionType', 'sectionType', x.sectionType as SteelColumnSectionType,
        current.sectionType, x.sectionType,
      );
    }
  }
  const typeFinal = (fields.sectionType ?? current.sectionType) as SteelColumnSectionType;
  const isCHS = typeFinal === 'CHS';
  const catalog = sizesFor(typeFinal);
  const sizeLabel = (s: number) => (typeFinal === '2UPN' ? `2UPN ${s}` : `${typeFinal} ${s}`);

  // --- Tamaño, validado contra la familia FINAL ---
  if (x.size !== null) {
    if (isCHS) {
      skip('size', CHS_SIZE_REASON);
    } else if (!catalog.includes(x.size)) {
      skip('size', `${typeFinal} ${x.size} no está en el catálogo (${catalog.join(', ')})`);
    } else if (x.size === current.size && fields.sectionType === undefined) {
      skip('size', ALREADY);
    } else {
      apply('size', 'size', x.size, `${current.sectionType} ${current.size}`, sizeLabel(x.size));
    }
  } else if (!isCHS && fields.sectionType !== undefined && !catalog.includes(current.size)) {
    // Cambio de familia sin tamaño: el vigente no existe en la nueva → se ajusta
    // al primero disponible, igual que el auto-ajuste del panel.
    const first = catalog[0];
    fields.size = first;
    warnings.push(
      `El tamaño ${current.size} no existe en la familia ${typeFinal}: se ajusta al primero `
      + `disponible (${sizeLabel(first)}). Revisa si necesitas otro.`,
    );
  }

  // --- Acero ---
  if (x.steel !== null) {
    if (!STEELS.includes(x.steel)) {
      skip('steel', `Acero "${x.steel}" no disponible en este módulo (S275 o S355)`);
    } else if (x.steel === current.steel) {
      skip('steel', ALREADY);
    } else {
      apply('steel', 'steel', x.steel as SteelColumnInputs['steel'], current.steel, x.steel);
    }
  }

  // --- Bloque CHS (inerte con perfiles abiertos / cajón) ---
  function applyChsDim(key: 'chs_D_mm' | 'chs_t_mm', field: 'chs_D' | 'chs_t', value: number | null, min: number, max: number): void {
    if (value === null) return;
    if (!isCHS) {
      skip(key, CHS_ONLY_REASON);
      return;
    }
    if (value < min || value > max) {
      skip(key, rangeReason(value, min, max, 'mm'));
      return;
    }
    const v = round2(value);
    if (Math.abs(v - current[field]) <= EPS) skip(key, ALREADY);
    else apply(key, field, v, `${current[field]} mm`, `${v} mm`);
  }
  applyChsDim('chs_D_mm', 'chs_D', x.chs_D_mm, 20, 2000);
  applyChsDim('chs_t_mm', 'chs_t', x.chs_t_mm, 1, 100);

  if (x.chs_process !== null) {
    if (!isCHS) {
      skip('chs_process', CHS_ONLY_REASON);
    } else if (!CHS_PROCESSES.includes(x.chs_process)) {
      skip('chs_process', `Proceso "${x.chs_process}" desconocido (hot-finished, cold-formed)`);
    } else if (x.chs_process === current.chs_process) {
      skip('chs_process', ALREADY);
    } else {
      apply(
        'chs_process', 'chs_process', x.chs_process as SteelColumnInputs['chs_process'],
        PROCESS_ES[current.chs_process], PROCESS_ES[x.chs_process],
      );
    }
  }

  // --- Longitudes de pandeo: payload en m, estado en mm (×1000) ---
  function applyLength(key: 'Ly_m' | 'Lz_m', field: 'Ly' | 'Lz', value: number | null): void {
    if (value === null) return;
    if (value <= 0 || value > 50) {
      skip(key, rangeReason(value, 0.1, 50, 'm'));
      return;
    }
    const mm = Math.round(value * 1000);
    if (mm === current[field]) skip(key, ALREADY);
    else apply(key, field, mm, fmtM(current[field]), fmtM(mm));
  }
  applyLength('Ly_m', 'Ly', x.Ly_m);
  applyLength('Lz_m', 'Lz', x.Lz_m);

  // --- Condición de apoyo (gate de β) ---
  if (x.bcType !== null) {
    if (!BC_TYPES.includes(x.bcType)) {
      skip('bcType', `Condición de apoyo "${x.bcType}" desconocida (pp, pf, ff, fc, custom)`);
    } else if (x.bcType === current.bcType) {
      skip('bcType', ALREADY);
    } else {
      apply(
        'bcType', 'bcType', x.bcType as ColumnBCType,
        BC_ES[current.bcType] ?? current.bcType, BC_ES[x.bcType] ?? x.bcType,
      );
    }
  }
  const bcFinal = (fields.bcType ?? current.bcType) as ColumnBCType;
  const bcChanged = fields.bcType !== undefined;

  /** β editable solo con bcType='custom': se propone y se aplica como cualquier otro campo. */
  const applyBeta = (key: 'beta_y' | 'beta_z', value: number | null): void => {
    if (value === null) return;
    if (value <= 0 || value > 5) {
      skip(key, rangeReason(value, 0.1, 5, ''));
      return;
    }
    const v = round2(value);
    if (Math.abs(v - current[key]) <= EPS) skip(key, ALREADY);
    else apply(key, key, v, current[key].toFixed(2), v.toFixed(2));
  };

  if (bcFinal === 'custom') {
    applyBeta('beta_y', x.beta_y);
    applyBeta('beta_z', x.beta_z);
  } else {
    if (x.beta_y !== null) skip('beta_y', BETA_GATE_REASON);
    if (x.beta_z !== null) skip('beta_z', BETA_GATE_REASON);
    // El motor lee beta_y/beta_z del ESTADO (no los deriva), así que al cambiar
    // de condición de apoyo hay que reescribirlos — lo mismo que hace el panel.
    // Van a `fields` SIN fila de cambio: son consecuencia de bcType, no una
    // decisión propia (y una fila por β duplicaría el riesgo que ya marca bcType).
    if (bcChanged) {
      const derived = getBetaForBCType(bcFinal, current.beta_y, current.beta_z);
      if (Math.abs(derived.beta_y - current.beta_y) > EPS) fields.beta_y = derived.beta_y;
      if (Math.abs(derived.beta_z - current.beta_z) > EPS) fields.beta_z = derived.beta_z;
      if (fields.beta_y !== undefined || fields.beta_z !== undefined) {
        warnings.push(
          `La condición de apoyo fija β: βy y βz pasan a ${derived.beta_y.toFixed(2)} y `
          + `${derived.beta_z.toFixed(2)}.`,
        );
      }
    }
  }

  // --- Esfuerzos (kN / kNm) ---
  const fmtForce = (v: number) => formatQuantity(v, 'force', system);
  const fmtMoment = (v: number) => formatQuantity(v, 'moment', system);

  if (x.Ned_kN !== null) {
    if (x.Ned_kN < 0 || x.Ned_kN > 100000) {
      skip('Ned_kN', rangeReason(x.Ned_kN, 0, 100000, 'kN'));
    } else {
      const v = round2(x.Ned_kN);
      if (Math.abs(v - current.Ned) <= EPS) skip('Ned_kN', ALREADY);
      else apply('Ned_kN', 'Ned', v, fmtForce(current.Ned), fmtForce(v));
    }
  }

  /** Momentos: el motor los normaliza con |·|; un negativo se aplica en módulo + warning. */
  function applyMoment(key: 'My_kNm' | 'Mz_kNm', field: 'My_Ed' | 'Mz_Ed', value: number | null): void {
    if (value === null) return;
    if (Math.abs(value) > 50000) {
      skip(key, rangeReason(value, 0, 50000, 'kNm'));
      return;
    }
    let v = round2(value);
    if (v < 0) {
      v = Math.abs(v);
      warnings.push(`El momento ${LABELS[key]} venía con signo negativo; se aplica su valor absoluto (${v} kNm).`);
    }
    if (Math.abs(v - current[field]) <= EPS) skip(key, ALREADY);
    else apply(key, field, v, fmtMoment(current[field]), fmtMoment(v));
  }
  applyMoment('My_kNm', 'My_Ed', x.My_kNm);
  applyMoment('Mz_kNm', 'Mz_Ed', x.Mz_kNm);

  // --- notFound ---
  const values: Record<PayloadKey, unknown> = {
    sectionType: x.sectionType, size: x.size, steel: x.steel,
    chs_D_mm: x.chs_D_mm, chs_t_mm: x.chs_t_mm, chs_process: x.chs_process,
    Ly_m: x.Ly_m, Lz_m: x.Lz_m, bcType: x.bcType, beta_y: x.beta_y, beta_z: x.beta_z,
    Ned_kN: x.Ned_kN, My_kNm: x.My_kNm, Mz_kNm: x.Mz_kNm,
  };
  const notFound: string[] = [];
  for (const key of KEY_ORDER) {
    if (values[key] === null && !handled.has(key)) notFound.push(LABELS[key]);
  }

  const risks = [
    ...detectSafetyRisks(
      STEEL_COLUMN_SAFETY_RULES, changes, fields, current, steelColumnDefaults, confirmed,
    ),
    // β efectiva: sustituye a las reglas por campo de bcType/beta_y/beta_z (fuga 2).
    ...detectResolvedRisks(
      STEEL_COLUMN_RESOLVED_RULES, fields, current, steelColumnDefaults, confirmed,
    ),
  ];
  return { fields, changes, skipped, notFound, warnings, notes: null, risks };
}

// ── Snapshot del estado ───────────────────────────────────────────────────────

/**
 * Estado → `{valores, sin_confirmar}`. `Ly`/`Lz` se serializan en METROS (las
 * unidades del payload); la comparación con el default se hace sobre el valor
 * INTERNO (mm) para no introducir ruido de redondeo.
 */
function buildSnapshot(c: SteelColumnInputs): string {
  const valores: Record<string, number | string> = {
    sectionType: c.sectionType,
    size: c.size,
    steel: c.steel,
    chs_D_mm: c.chs_D,
    chs_t_mm: c.chs_t,
    chs_process: c.chs_process,
    Ly_m: c.Ly / 1000,
    Lz_m: c.Lz / 1000,
    bcType: c.bcType,
    beta_y: c.beta_y,
    beta_z: c.beta_z,
    Ned_kN: c.Ned,
    My_kNm: c.My_Ed,
    Mz_kNm: c.Mz_Ed,
  };
  const stateOf: Record<PayloadKey, keyof SteelColumnInputs> = {
    sectionType: 'sectionType', size: 'size', steel: 'steel',
    chs_D_mm: 'chs_D', chs_t_mm: 'chs_t', chs_process: 'chs_process',
    Ly_m: 'Ly', Lz_m: 'Lz', bcType: 'bcType', beta_y: 'beta_y', beta_z: 'beta_z',
    Ned_kN: 'Ned', My_kNm: 'My_Ed', Mz_kNm: 'Mz_Ed',
  };
  const sinConfirmar = KEY_ORDER.filter(
    (key) => c[stateOf[key]] === steelColumnDefaults[stateOf[key]],
  );
  return JSON.stringify({ valores, sin_confirmar: sinConfirmar });
}

// ── Resumen de resultados para el prompt ─────────────────────────────────────

/**
 * Resume el resultado del motor de pilares de acero. Discriminador de cálculo no
 * válido: `error != null` — que aquí cubre además los dos estados especiales del
 * módulo (sección de clase 4 y perfil inexistente), ambos con `error`.
 */
export function summarizeSteelColumnResults(r: SteelColumnResult): AiResultsSummary {
  if (r.error != null) return summarizeCalcResults(r);
  const extras = [
    `Utilización gobernante η = ${Math.round(r.utilization * 100)}% `
      + `(interacción ec.1 ${r.util_check1.toFixed(2)} · ec.2 ${r.util_check2.toFixed(2)})`,
    `Pandeo: λ̄y = ${r.lambda_y.toFixed(2)} (χy = ${r.chi_y.toFixed(2)}) · `
      + `λ̄z = ${r.lambda_z.toFixed(2)} (χz = ${r.chi_z.toFixed(2)})`,
  ];
  if (r.chi_LT < 1) {
    extras.push(`Pandeo lateral: χLT = ${r.chi_LT.toFixed(2)} → Mb,Rd = ${r.Mb_Rd.toFixed(1)} kNm`);
  }
  return summarizeCalcResults(r, extras);
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export const steelColumnsAdapter: AiModuleAdapter<SteelColumnInputs> = {
  id: 'steel-columns',
  label: 'Pilares de acero',
  payloadSchema: STEEL_COLUMN_PAYLOAD_SCHEMA,
  promptRules: PROMPT_RULES,
  placeholder: PLACEHOLDER_EXAMPLE,
  snapshot: buildSnapshot,
  buildPlan: (payload, current, system, confirmed) =>
    buildSteelColumnPlan(parsePayload(payload), current, system, confirmed),
};
