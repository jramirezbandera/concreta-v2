import type { SteelBeamExtraction } from './types';
import {
  detectResolvedRisks,
  detectSafetyRisks,
  higherIsSafer,
  ordinalLevel,
  type AiSafetyRisk,
  type SafetyRule,
} from './safety';
import { beamSchemeRules } from './beamScheme';
import { steelBeamDefaults, type BeamType, type ElsCombo, type SteelBeamInputs } from '../../data/defaults';
import { getSizesForTipo } from '../../data/steelProfiles';
import { categoryLabel, categoryQk } from '../calculations/loadGen';
import { formatQuantity } from '../units/format';
import type { UnitSystem } from '../units/types';

export interface FieldChange {
  field: keyof SteelBeamInputs;
  label: string;      // "Luz L", etc.
  before: string;     // valor actual formateado
  after: string;      // valor propuesto formateado
  value: SteelBeamInputs[keyof SteelBeamInputs]; // en SI interno, listo para setField
}

export interface SkippedField {
  label: string;
  reason: string;
}

export interface ApplyPlan {
  fields: Partial<SteelBeamInputs>; // SOLO campos aplicables, en SI interno (L y Lcr en mm)
  changes: FieldChange[];
  skipped: SkippedField[];          // extraídos pero descartados (catálogo/rango/igual al actual)
  notFound: string[];               // labels de campos null
  warnings: string[];               // del LLM + del validador
  lcrExplicit: boolean;             // true si fields.Lcr presente
  risks: AiSafetyRisk[];            // cambios que reducen la seguridad (safety.ts)
}

/**
 * Campos de vigas de acero que NO son variables de diseño: los fija el proyecto
 * o la normativa. Bajar su nivel hace que el cálculo cumpla sin tocar la viga
 * (ver safety.ts). El perfil (tipo/size) y el acero SÍ son diseño: subirlos es
 * la salida legítima cuando no cumple, y por eso no tienen regla.
 *
 * `qk` tiene ADEMÁS un guardarraíl que RECHAZA (más abajo): un qk por debajo de
 * la sobrecarga de la categoría en vigor es una contradicción interna
 * comprobable, no solo un riesgo. Las dos capas se complementan: aquella corta
 * el caso demostrable, esta marca cualquier otra rebaja de un qk ya establecido.
 */
export const STEEL_SAFETY_RULES: ReadonlyArray<SafetyRule<SteelBeamInputs>> = [
  {
    field: 'gk',
    confirmKey: 'gk_kNm2',
    level: higherIsSafer,
    why: 'La carga permanente la fija el proyecto (peso propio, solados, tabiquería): rebajarla baja el momento de cálculo. Las acciones permanentes se ACUMULAN — comprueba que el valor nuevo las incluye todas y no es solo la última mencionada.',
  },
  {
    // Dos rutas llegan aquí, y el texto debe ser cierto en ambas: una rebaja
    // directa de qk (la que el guardarraíl de envolvente no corta, p. ej. sobre
    // categoría 'custom') y una BAJADA INDIRECTA al cambiar de categoría de uso
    // — el mapper autorrellena entonces el qk de tabla, que puede desplomarse
    // (5.0 en almacén → 1.0 en cubierta de mantenimiento). Esa segunda también
    // merece confirmación: reclasificar el uso cambia la acción variable entera.
    field: 'qk',
    confirmKey: 'qk_kNm2',
    level: higherIsSafer,
    why: 'qk es la acción variable de proyecto y debe ser la ENVOLVENTE: la más desfavorable entre uso, nieve y viento, no la última de la que se ha hablado. Rebajarla —directamente o al cambiar la categoría de uso, que arrastra su sobrecarga de tabla— baja el momento de cálculo.',
  },
  {
    field: 'bTrib',
    confirmKey: 'bTrib_m',
    level: higherIsSafer,
    why: 'El ancho tributario lo fija la separación real entre vigas: rebajarlo reduce proporcionalmente la carga que recibe esta viga.',
  },
  {
    field: 'L',
    confirmKey: 'L_m',
    level: higherIsSafer,
    why: 'La luz es un dato de la estructura: rebajarla baja el momento y la flecha de cálculo.',
  },
  {
    field: 'Lcr',
    confirmKey: 'Lcr_m',
    level: higherIsSafer,
    why: 'La longitud de pandeo lateral la fija la separación real entre arriostramientos del ala comprimida: rebajarla sube artificialmente la resistencia a pandeo lateral (LTB).',
  },
  {
    field: 'deflLimit',
    level: higherIsSafer, // denominador de L/n: mayor = más estricto (L/400 > L/250)
    why: 'El límite de flecha lo fija el uso y la tabiquería que soporta el forjado (CTE DB-SE 4.3.3.1): relajarlo hace que la flecha "cumpla" sin cambiar la viga.',
  },
  {
    // FUGA 4 (auditoría 2026-07-14): `elsCombo` no tenía regla, y elige con qué
    // combinación se comprueba la flecha. El motor la traduce a un ψ que multiplica
    // la SOBRECARGA (getPsiForCategory, loadGen.ts:89): característica → ψ = 1.0
    // (la sobrecarga entera), frecuente → ψ₁, cuasipermanente → ψ₂ (0.3 en
    // vivienda). Es un descuento directo sobre la carga de servicio, y ψ₁ ≥ ψ₂
    // siempre, así que el ordinal es exacto.
    field: 'elsCombo',
    level: ordinalLevel({ characteristic: 2, frequent: 1, 'quasi-permanent': 0 }),
    why: 'La combinación de servicio la fija el criterio de flecha que se comprueba (CTE DB-SE 4.3.3): pasar de característica a frecuente o cuasipermanente multiplica la SOBRECARGA por ψ₁ o ψ₂ (0.3 en vivienda) y la flecha calculada se desploma sin tocar la viga.',
  },
];

/** Esquema estático: M, V y flecha del `beamType` (ver beamScheme.ts). */
export const STEEL_BEAM_SCHEME_RULES = beamSchemeRules<SteelBeamInputs>();

// Labels españoles (regla 9) por campo del extraction.
const LABELS = {
  tipo: 'Tipo de perfil',
  size: 'Perfil',
  steel: 'Acero',
  beamType: 'Tipo de viga',
  L_m: 'Luz L',
  Lcr_m: 'Long. pandeo Lcr',
  deflLimit: 'Límite de flecha',
  elsCombo: 'Combinación ELS',
  useCategory: 'Categoría de uso',
  gk_kNm2: 'Carga permanente gk',
  qk_kNm2: 'Sobrecarga qk',
  bTrib_m: 'Ancho tributario',
} as const;

type ExtractionKey = keyof typeof LABELS;

const KEY_ORDER: readonly ExtractionKey[] = [
  'tipo', 'size', 'steel', 'beamType', 'L_m', 'Lcr_m', 'deflLimit',
  'elsCombo', 'useCategory', 'gk_kNm2', 'qk_kNm2', 'bTrib_m',
];

const BEAM_TYPE_LABELS: Record<BeamType, string> = {
  ss: 'Biarticulada',
  cantilever: 'Ménsula',
  fp: 'Empotrada-Articulada',
  ff: 'Biempotrada',
};

const ELS_COMBO_LABELS: Record<ElsCombo, string> = {
  characteristic: 'Característica',
  frequent: 'Frecuente',
  'quasi-permanent': 'Cuasi-permanente',
};

const DEFL_LIMITS: readonly number[] = [250, 300, 400, 500, 600];

const ALREADY = 'Ya coincide con el valor actual';
const EPS = 1e-9;

const round2 = (v: number) => Math.round(v * 100) / 100;
const fmtMm = (mm: number) => (mm / 1000).toFixed(2) + ' m';
const fmtM = (m: number) => m.toFixed(2) + ' m';

function rangeReason(value: number, min: number, max: number, unit: string): string {
  return `Valor ${value} ${unit} fuera del rango admisible ${min}–${max} ${unit}`;
}

/**
 * Convierte un SteelBeamExtraction (unidades humanas, nullable) en un plan de
 * aplicación sobre SteelBeamInputs (SI interno). Nunca aplica en silencio:
 * fuera de rango / fuera de catálogo / igual al actual → skipped con motivo.
 * NUNCA produce MEd/VEd/VEd_interaction/Mser/title (derivados / metadatos).
 */
export function buildApplyPlan(
  x: SteelBeamExtraction,
  current: SteelBeamInputs,
  system: UnitSystem,
  confirmed?: ReadonlySet<string>,
): ApplyPlan {
  const fields: Partial<SteelBeamInputs> = {};
  const changes: FieldChange[] = [];
  const skipped: SkippedField[] = [];
  const warnings: string[] = [...x.warnings];
  // Campos del extraction ya resueltos (change o skip) — el resto de nulls va a notFound.
  const handled = new Set<ExtractionKey>();

  function skip(key: ExtractionKey, reason: string): void {
    handled.add(key);
    skipped.push({ label: LABELS[key], reason });
  }

  function apply<K extends keyof SteelBeamInputs>(
    key: ExtractionKey,
    field: K,
    value: SteelBeamInputs[K],
    before: string,
    after: string,
  ): void {
    handled.add(key);
    fields[field] = value;
    changes.push({ field, label: LABELS[key], before, after, value });
  }

  // --- tipo (regla 3: se aplica aunque el size no exista en catálogo) ---
  const tipoEfectivo = x.tipo ?? current.tipo;
  if (x.tipo !== null) {
    if (x.tipo === current.tipo) skip('tipo', ALREADY);
    else apply('tipo', 'tipo', x.tipo, current.tipo, x.tipo);
  }

  // --- size contra catálogo (regla 3) ---
  if (x.size !== null) {
    if (!getSizesForTipo(tipoEfectivo).includes(x.size)) {
      skip('size', `${tipoEfectivo} ${x.size} no existe en el catálogo`);
    } else if (x.size === current.size) {
      skip('size', ALREADY);
    } else {
      apply('size', 'size', x.size, `${current.tipo} ${current.size}`, `${tipoEfectivo} ${x.size}`);
    }
  }

  // --- steel ---
  if (x.steel !== null) {
    if (x.steel === current.steel) skip('steel', ALREADY);
    else apply('steel', 'steel', x.steel, current.steel, x.steel);
  }

  // --- beamType ---
  if (x.beamType !== null) {
    if (x.beamType === current.beamType) skip('beamType', ALREADY);
    else apply('beamType', 'beamType', x.beamType, BEAM_TYPE_LABELS[current.beamType], BEAM_TYPE_LABELS[x.beamType]);
  }

  // --- L (m → mm enteros, regla 1; rango regla 2) ---
  if (x.L_m !== null) {
    if (x.L_m < 0.5 || x.L_m > 40) {
      skip('L_m', rangeReason(x.L_m, 0.5, 40, 'm'));
    } else {
      const mm = Math.round(x.L_m * 1000);
      if (mm === current.L) skip('L_m', ALREADY);
      else apply('L_m', 'L', mm, fmtMm(current.L), fmtMm(mm));
    }
  }

  // --- Lcr (solo si el enunciado la da explícitamente) ---
  if (x.Lcr_m !== null) {
    if (x.Lcr_m < 0.1 || x.Lcr_m > 80) {
      skip('Lcr_m', rangeReason(x.Lcr_m, 0.1, 80, 'm'));
    } else {
      const mm = Math.round(x.Lcr_m * 1000);
      if (mm === current.Lcr) skip('Lcr_m', ALREADY);
      else apply('Lcr_m', 'Lcr', mm, fmtMm(current.Lcr), fmtMm(mm));
    }
  }

  // --- deflLimit (doble check defensivo, regla 5) ---
  if (x.deflLimit !== null) {
    if (!DEFL_LIMITS.includes(x.deflLimit)) {
      skip('deflLimit', `L/${x.deflLimit} no es un límite admitido (L/250, L/300, L/400, L/500, L/600)`);
    } else if (x.deflLimit === current.deflLimit) {
      skip('deflLimit', ALREADY);
    } else {
      apply('deflLimit', 'deflLimit', x.deflLimit, `L/${current.deflLimit}`, `L/${x.deflLimit}`);
    }
  }

  // --- elsCombo ---
  if (x.elsCombo !== null) {
    if (x.elsCombo === current.elsCombo) skip('elsCombo', ALREADY);
    else apply('elsCombo', 'elsCombo', x.elsCombo, ELS_COMBO_LABELS[current.elsCombo], ELS_COMBO_LABELS[x.elsCombo]);
  }

  // --- useCategory + qk (regla 4) ---
  let qkValid: number | null = null;
  if (x.qk_kNm2 !== null) {
    if (x.qk_kNm2 < 0 || x.qk_kNm2 > 50) skip('qk_kNm2', rangeReason(x.qk_kNm2, 0, 50, 'kN/m²'));
    else qkValid = round2(x.qk_kNm2);
  }

  // Guardarraíl de envolvente: qk es la acción variable MÁS DESFAVORABLE (uso,
  // nieve, viento...), no la última mencionada. Un qk por debajo de la
  // sobrecarga de la categoría en vigor (la propuesta, o la actual si no se
  // propone ninguna) contradice esa categoría: es una acción que no gobierna
  // (típicamente nieve escrita encima de la sobrecarga de mantenimiento) y se
  // rechaza. Escape: con la categoría 'custom' NO hay qk de catálogo que
  // contradecir, así que el usuario puede fijar cualquier valor eligiéndola en
  // el formulario.
  const catInForce = x.useCategory ?? current.useCategory;
  const catFloorQk = categoryQk(catInForce);
  if (qkValid !== null && catFloorQk !== null && qkValid < catFloorQk - 0.01) {
    const reason =
      `Inferior a la sobrecarga de uso de la categoría ${categoryLabel(catInForce)} ` +
      `(${catFloorQk.toFixed(2)} kN/m²): qk debe ser la acción variable MÁS DESFAVORABLE`;
    warnings.push(
      `Aviso de seguridad: el qk propuesto (${qkValid.toFixed(2)} kN/m²) es inferior a la sobrecarga de uso de la ` +
      `categoría ${categoryLabel(catInForce)} (${catFloorQk.toFixed(2)} kN/m²), que sigue gobernando. qk es la acción ` +
      `variable envolvente (la más desfavorable entre uso, nieve y viento), no la última mencionada: no se aplica la ` +
      `reducción. Si la sobrecarga real está fuera de la Tabla 3.1, elige la categoría "Personalizada" en el formulario.`,
    );
    // Con categoría propuesta, el flujo de abajo la aplica con su qk de catálogo
    // (el desfavorable). Sin ella, nadie más fijaría qk: se marca como no aplicado.
    if (x.useCategory === null) skip('qk_kNm2', reason);
    qkValid = null;
  }

  let catToApply: string | null = null;
  let qkToApply: number | null = null;
  if (x.useCategory !== null) {
    const catQk = categoryQk(x.useCategory);
    if (qkValid !== null && catQk !== null && Math.abs(qkValid - catQk) > 0.01) {
      // Categoría + qk distinto → personalizada con el qk extraído.
      catToApply = 'custom';
      qkToApply = qkValid;
      warnings.push(
        `El qk extraído (${qkValid.toFixed(2)} kN/m²) no coincide con el de la categoría ${x.useCategory} (${catQk.toFixed(2)} kN/m²); se aplica como categoría personalizada.`,
      );
    } else {
      // Solo categoría, o categoría + qk coincidente (±0.01) → categoría + su qk (imita autorrelleno UI).
      catToApply = x.useCategory;
      qkToApply = catQk;
    }
  } else if (qkValid !== null) {
    // Solo qk → personalizada.
    catToApply = 'custom';
    qkToApply = qkValid;
  }

  if (catToApply !== null) {
    if (catToApply === current.useCategory) skip('useCategory', ALREADY);
    else apply('useCategory', 'useCategory', catToApply, categoryLabel(current.useCategory), categoryLabel(catToApply));
  }
  if (qkToApply !== null) {
    if (Math.abs(qkToApply - current.qk) <= EPS) skip('qk_kNm2', ALREADY);
    else apply('qk_kNm2', 'qk', qkToApply, formatQuantity(current.qk, 'areaLoad', system), formatQuantity(qkToApply, 'areaLoad', system));
  }

  // --- gk ---
  if (x.gk_kNm2 !== null) {
    if (x.gk_kNm2 < 0 || x.gk_kNm2 > 50) {
      skip('gk_kNm2', rangeReason(x.gk_kNm2, 0, 50, 'kN/m²'));
    } else {
      const v = round2(x.gk_kNm2);
      if (Math.abs(v - current.gk) <= EPS) skip('gk_kNm2', ALREADY);
      else apply('gk_kNm2', 'gk', v, formatQuantity(current.gk, 'areaLoad', system), formatQuantity(v, 'areaLoad', system));
    }
  }

  // --- bTrib (en m, sin redondeo — regla 1) ---
  if (x.bTrib_m !== null) {
    if (x.bTrib_m < 0.05 || x.bTrib_m > 20) {
      skip('bTrib_m', rangeReason(x.bTrib_m, 0.05, 20, 'm'));
    } else if (Math.abs(x.bTrib_m - current.bTrib) <= EPS) {
      skip('bTrib_m', ALREADY);
    } else {
      apply('bTrib_m', 'bTrib', x.bTrib_m, fmtM(current.bTrib), fmtM(x.bTrib_m));
    }
  }

  // --- notFound: campos null no resueltos por el mapper ---
  const values: Record<ExtractionKey, unknown> = {
    tipo: x.tipo, size: x.size, steel: x.steel, beamType: x.beamType,
    L_m: x.L_m, Lcr_m: x.Lcr_m, deflLimit: x.deflLimit, elsCombo: x.elsCombo,
    useCategory: x.useCategory, gk_kNm2: x.gk_kNm2, qk_kNm2: x.qk_kNm2, bTrib_m: x.bTrib_m,
  };
  const notFound: string[] = [];
  for (const key of KEY_ORDER) {
    if (values[key] === null && !handled.has(key)) notFound.push(LABELS[key]);
  }

  return {
    fields,
    changes,
    skipped,
    notFound,
    warnings,
    lcrExplicit: fields.Lcr !== undefined,
    risks: [
      ...detectSafetyRisks(
        STEEL_SAFETY_RULES, changes, fields, current, steelBeamDefaults, confirmed,
      ),
      // Esquema estático: `beamType` no tenía NINGUNA regla (fuga 4). Va por
      // magnitud resuelta porque mueve M, V y flecha a la vez, y no de forma
      // monótona — ver beamScheme.ts.
      ...detectResolvedRisks(
        STEEL_BEAM_SCHEME_RULES, fields, current, steelBeamDefaults, confirmed,
      ),
    ],
  };
}
