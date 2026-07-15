/**
 * Adapter del asistente IA para el módulo Forjados (ola 2, CE Anejo 19 §5.3.2.1/§6.1/§6.2).
 *
 * Particularidades del módulo:
 * - GATE CON PATCH ATÓMICO. `variant` (reticular ↔ maciza) no es un `setField`
 *   suelto: los dos juegos de armado son disjuntos y el cambio resetea los 16
 *   campos vía `variantSwitchPatch`. Igual la `tipologia`, que re-aplica el preset
 *   de geometría (`tipologiaPatch`). Los dos helpers viven en `data/forjadoTipologias`
 *   y los comparten la UI y el `handleAiApply` del módulo.
 * - Campos inertes por variante: en maciza no existen tipología/capa/nervio/intereje
 *   ni el armado en paquetes n×Ø; en reticular no existen las parrillas Ø/s. Y con
 *   una tipología distinta de 'custom', la geometría la fija el preset (la UI la
 *   pone readOnly) → skip con motivo.
 * - `loadType` y `psi2Custom` NO van en el payload: el motor los usa para ψ₂ pero
 *   NO tienen control en la UI — la IA no escribe lo que el usuario no puede ver.
 * - El resumen NO es directo: el motor devuelve `{vano, apoyo, shearChecks,
 *   infoChecks}` y los `infoChecks` NO son `neutral` (ver `summarizeForjadoResults`).
 */
import { AiError } from '../types';
import type { AiApplyPlan, AiFieldChange, AiModuleAdapter, AiSkippedField } from './types';
import { summarizeCalcResults, type AiResultsSummary, type CalcResultLike } from '../resultsSummary';
import {
  detectSafetyRisks,
  higherIsSafer,
  lowerIsSafer,
  ordinalLevel,
  type SafetyRule,
} from '../safety';
import type { CheckRow } from '../../calculations/types';
import { checkValueStr, checkLimitStr } from '../../calculations/checkFormat';
import type { ForjadosResult } from '../../calculations/rcSlabs';
import { availableFck } from '../../../data/materials';
import { availableBarDiams } from '../../../data/rebar';
import { TIPOLOGIAS, TIPOS_VANO } from '../../../data/forjadoTipologias';
import {
  forjadosDefaults,
  type ForjadosInputs,
  type ForjadosTipoVano,
  type ForjadosTipologia,
  type ForjadosVariant,
} from '../../../data/defaults';
import { formatQuantity } from '../../units/format';
import type { UnitSystem } from '../../units/types';

// ── Catálogos del módulo ──────────────────────────────────────────────────────
const VARIANTS: readonly string[] = ['reticular', 'maciza'];
const TIPOLOGIA_KEYS: readonly string[] = [...TIPOLOGIAS.map((t) => t.key), 'custom'];
const TIPO_VANO_KEYS: readonly string[] = TIPOS_VANO.map((t) => t.key);
const FYK: readonly number[] = [400, 500, 600];
const EXPOSURE: readonly string[] = ['XC1', 'XC2', 'XC3', 'XC4'];
/** Ø de parrilla de losa maciza — catálogo PROPIO, distinto de `availableBarDiams`. */
const MAC_PHI: readonly number[] = [8, 10, 12, 16, 20];
const SW_DIAMS: readonly number[] = [6, 8, 10, 12];
const SW_LEGS: readonly number[] = [2, 3, 4];

const TIPOLOGIA_LABEL: Record<string, string> = {
  ...Object.fromEntries(TIPOLOGIAS.map((t) => [t.key, t.label])),
  custom: 'Personalizada',
};
const TIPO_VANO_LABEL: Record<string, string> = Object.fromEntries(
  TIPOS_VANO.map((t) => [t.key, t.label]),
);
const VARIANT_LABEL: Record<string, string> = {
  reticular: 'Reticular',
  maciza: 'Losa maciza',
};

// ── Payload schema (JSON Schema canónico PLANO, todo nullable) ────────────────

export const FORJADOS_PAYLOAD_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: [
    'variant', 'tipologia', 'h_mm', 'hFlange_mm', 'bWeb_mm', 'intereje_mm',
    'spanLength_m', 'tipoVano', 'cover_mm', 'fck_MPa', 'fyk_MPa', 'exposureClass',
    'base_sup_nBars', 'base_sup_barDiam_mm', 'base_inf_nBars', 'base_inf_barDiam_mm',
    'refuerzo_vano_inf_nBars', 'refuerzo_vano_inf_barDiam_mm',
    'refuerzo_apoyo_sup_nBars', 'refuerzo_apoyo_sup_barDiam_mm',
    'base_sup_phi_mac_mm', 'base_sup_s_mac_mm', 'base_inf_phi_mac_mm', 'base_inf_s_mac_mm',
    'refuerzo_vano_inf_phi_mac_mm', 'refuerzo_vano_inf_s_mac_mm',
    'refuerzo_apoyo_sup_phi_mac_mm', 'refuerzo_apoyo_sup_s_mac_mm',
    'stirrupsEnabled',
    'vano_stirrupDiam_mm', 'vano_stirrupSpacing_mm', 'vano_stirrupLegs',
    'apoyo_stirrupDiam_mm', 'apoyo_stirrupSpacing_mm', 'apoyo_stirrupLegs',
    'vano_Md_kNm', 'apoyo_Md_kNm', 'VEd_kN',
    'vano_M_G_kNm', 'vano_M_Q_kNm', 'apoyo_M_G_kNm', 'apoyo_M_Q_kNm',
    'warnings',
  ],
  properties: {
    variant: { type: ['string', 'null'], enum: [...VARIANTS, null], description: 'Tipo de forjado: "reticular" (nervios con casetones y capa de compresión) o "maciza" (losa maciza, se comprueba una franja de 1 m). CAMBIARLO REINICIA todo el armado, porque los dos sistemas se arman de forma distinta.' },
    tipologia: { type: ['string', 'null'], enum: [...TIPOLOGIA_KEYS, null], description: 'SOLO en reticular: tipología comercial (canto+capa). Al elegir una, la app autocompleta canto, capa de compresión, nervio e intereje, y los bloquea. Usa "custom" para introducir la geometría a mano.' },
    h_mm: { type: ['number', 'null'], description: 'Canto TOTAL del forjado en mm (incluida la capa de compresión). En reticular solo es editable con tipologia = "custom".' },
    hFlange_mm: { type: ['number', 'null'], description: 'SOLO en reticular: espesor de la capa de compresión, en mm. Solo editable con tipologia = "custom".' },
    bWeb_mm: { type: ['number', 'null'], description: 'SOLO en reticular: ancho del nervio, en mm. Solo editable con tipologia = "custom".' },
    intereje_mm: { type: ['number', 'null'], description: 'SOLO en reticular: distancia entre ejes de nervios, en mm. Solo editable con tipologia = "custom".' },
    spanLength_m: { type: ['number', 'null'], description: 'Luz del vano en METROS. Fija el ancho eficaz b_eff (en reticular) y la comprobación de esbeltez L/d (en ambas variantes).' },
    tipoVano: { type: ['string', 'null'], enum: [...TIPO_VANO_KEYS, null], description: 'Condición de continuidad del vano: "biapoyado" (L0 = L), "continuo-extremo" (0.85 L), "continuo-interior" (0.70 L) o "voladizo" (2 L). Fija la distancia entre puntos de momento nulo (y con ella el ancho eficaz) y el coeficiente K de la esbeltez.' },
    cover_mm: { type: ['number', 'null'], description: 'Recubrimiento mecánico de la armadura, en mm.' },
    fck_MPa: { type: ['integer', 'null'], enum: [...availableFck, null], description: 'Resistencia característica del hormigón en MPa (HA-25 → 25).' },
    fyk_MPa: { type: ['integer', 'null'], enum: [...FYK, null], description: 'Límite elástico del acero de armar en MPa (B500S → 500).' },
    exposureClass: { type: ['string', 'null'], enum: [...EXPOSURE, null], description: 'Clase de exposición (XC1–XC4). ATENCIÓN: con XC1 la app NO comprueba la fisuración; XC2–XC4 la comprueban con wk ≤ 0.30 mm.' },

    base_sup_nBars: { type: ['integer', 'null'], description: 'RETICULAR: número de barras del montaje SUPERIOR por nervio (armado base continuo).' },
    base_sup_barDiam_mm: { type: ['integer', 'null'], enum: [...availableBarDiams, null], description: 'RETICULAR: diámetro del montaje superior, en mm.' },
    base_inf_nBars: { type: ['integer', 'null'], description: 'RETICULAR: número de barras del montaje INFERIOR por nervio.' },
    base_inf_barDiam_mm: { type: ['integer', 'null'], enum: [...availableBarDiams, null], description: 'RETICULAR: diámetro del montaje inferior, en mm.' },
    refuerzo_vano_inf_nBars: { type: ['integer', 'null'], description: 'RETICULAR: barras de refuerzo INFERIOR en el vano (adicionales al montaje; 0 = sin refuerzo).' },
    refuerzo_vano_inf_barDiam_mm: { type: ['integer', 'null'], enum: [...availableBarDiams, null], description: 'RETICULAR: diámetro del refuerzo inferior de vano, en mm.' },
    refuerzo_apoyo_sup_nBars: { type: ['integer', 'null'], description: 'RETICULAR: barras de refuerzo SUPERIOR en el apoyo (adicionales al montaje; 0 = sin refuerzo).' },
    refuerzo_apoyo_sup_barDiam_mm: { type: ['integer', 'null'], enum: [...availableBarDiams, null], description: 'RETICULAR: diámetro del refuerzo superior de apoyo, en mm.' },

    base_sup_phi_mac_mm: { type: ['integer', 'null'], enum: [...MAC_PHI, null], description: 'MACIZA: diámetro de la parrilla base SUPERIOR, en mm.' },
    base_sup_s_mac_mm: { type: ['number', 'null'], description: 'MACIZA: separación de la parrilla base superior, en mm.' },
    base_inf_phi_mac_mm: { type: ['integer', 'null'], enum: [...MAC_PHI, null], description: 'MACIZA: diámetro de la parrilla base INFERIOR, en mm.' },
    base_inf_s_mac_mm: { type: ['number', 'null'], description: 'MACIZA: separación de la parrilla base inferior, en mm.' },
    refuerzo_vano_inf_phi_mac_mm: { type: ['integer', 'null'], enum: [0, ...MAC_PHI, null], description: 'MACIZA: diámetro del refuerzo INFERIOR de vano (parrilla adicional). 0 = sin refuerzo.' },
    refuerzo_vano_inf_s_mac_mm: { type: ['number', 'null'], description: 'MACIZA: separación del refuerzo inferior de vano, en mm.' },
    refuerzo_apoyo_sup_phi_mac_mm: { type: ['integer', 'null'], enum: [0, ...MAC_PHI, null], description: 'MACIZA: diámetro del refuerzo SUPERIOR de apoyo. 0 = sin refuerzo.' },
    refuerzo_apoyo_sup_s_mac_mm: { type: ['number', 'null'], description: 'MACIZA: separación del refuerzo superior de apoyo, en mm.' },

    stirrupsEnabled: { type: ['boolean', 'null'], description: 'true si se disponen cercos de cortante. Sin cercos el forjado resiste solo con VRd,c (hormigón).' },
    vano_stirrupDiam_mm: { type: ['integer', 'null'], enum: [...SW_DIAMS, null], description: 'Diámetro del cerco en el vano, en mm. Solo con cercos.' },
    vano_stirrupSpacing_mm: { type: ['number', 'null'], description: 'Separación entre cercos en el vano, en mm. Solo con cercos.' },
    vano_stirrupLegs: { type: ['integer', 'null'], enum: [...SW_LEGS, null], description: 'Ramas del cerco en el vano. Solo con cercos.' },
    apoyo_stirrupDiam_mm: { type: ['integer', 'null'], enum: [...SW_DIAMS, null], description: 'Diámetro del cerco en el apoyo, en mm. Solo con cercos. ES EL QUE GOBIERNA el cortante (ver reglas).' },
    apoyo_stirrupSpacing_mm: { type: ['number', 'null'], description: 'Separación entre cercos en el apoyo, en mm. Solo con cercos.' },
    apoyo_stirrupLegs: { type: ['integer', 'null'], enum: [...SW_LEGS, null], description: 'Ramas del cerco en el apoyo. Solo con cercos.' },

    vano_Md_kNm: { type: ['number', 'null'], description: 'Momento flector de CÁLCULO (ELU) positivo en el vano, en kNm. En reticular, POR NERVIO; en maciza, por metro de ancho.' },
    apoyo_Md_kNm: { type: ['number', 'null'], description: 'Momento flector de CÁLCULO (ELU) negativo en el apoyo, en kNm — da la MAGNITUD, sin el signo menos.' },
    VEd_kN: { type: ['number', 'null'], description: 'Esfuerzo cortante de CÁLCULO (ELU), en kN. Es ÚNICO para todo el forjado (no hay uno por sección).' },
    vano_M_G_kNm: { type: ['number', 'null'], description: 'Momento de SERVICIO (sin mayorar) por cargas permanentes en el vano, en kNm. Solo se usa en la fisuración.' },
    vano_M_Q_kNm: { type: ['number', 'null'], description: 'Momento de SERVICIO (sin mayorar) por sobrecargas en el vano, en kNm.' },
    apoyo_M_G_kNm: { type: ['number', 'null'], description: 'Momento de SERVICIO por cargas permanentes en el apoyo, en kNm (magnitud).' },
    apoyo_M_Q_kNm: { type: ['number', 'null'], description: 'Momento de SERVICIO por sobrecargas en el apoyo, en kNm (magnitud).' },

    warnings: { type: 'array', items: { type: 'string' }, description: 'Avisos: conversiones de unidades realizadas, ambigüedades, datos del enunciado ignorados.' },
  },
};

// ── Prompt del módulo ─────────────────────────────────────────────────────────

const PROMPT_RULES = `Reglas específicas del módulo Forjados:
1. DOS VARIANTES con armados incompatibles. En "reticular" el armado son PAQUETES de barras por nervio (nº + Ø: montaje base + refuerzos zonales). En "maciza" son PARRILLAS (Ø + separación) sobre una franja de 1 m. Propón solo el juego de la variante que toque: el del otro sistema no se aplica. Cambiar de variante REINICIA el armado a los valores por defecto, así que si cambias de variante propón también el armado nuevo en el mismo mensaje.
2. GEOMETRÍA EN RETICULAR: al elegir una tipología comercial (25+5, 30+5, 35+5, 40+5, 35+10) la app fija canto, capa de compresión, nervio e intereje, y los bloquea. Si el enunciado da una geometría que no encaja en ninguna, propón tipologia = "custom" y los cuatro valores.
3. Longitudes en MILÍMETROS salvo spanLength_m, que va en METROS.
4. ESFUERZOS: vano_Md, apoyo_Md y VEd son de CÁLCULO (ELU, ya mayorados) y como MAGNITUD positiva. El cortante VEd es ÚNICO para todo el forjado. Los M_G y M_Q son de SERVICIO (sin mayorar) y solo intervienen en la fisuración.
5. TRAMPA DEL CORTANTE: cuando hay cercos, la app calcula VRd,s con la configuración de cercos del APOYO (diámetro, separación y ramas). Los cercos del vano solo afectan al canto útil. Si quieres mejorar el cortante, aprieta los cercos del APOYO.
6. La comprobación de fisuración NO se hace con exposición XC1. Con XC2, XC3 o XC4 sí, con wk ≤ 0.30 mm.
7. Si ves la comprobación "El armado no cabe en el nervio" (separación de barras imposible), la salida NO es poner más barras: es subir el DIÁMETRO y bajar el número, o ensanchar el nervio.
8. En este módulo son DATOS del problema, no variables de diseño: los esfuerzos (vano_Md, apoyo_Md, VEd, y los M_G/M_Q), la luz (spanLength_m), el tipo de vano, la clase de exposición y el recubrimiento. Para que un forjado cumpla actúa SIEMPRE sobre la RESISTENCIA: más canto (una tipología mayor), más armadura (Ø mayor o menos separación), cercos, mejor hormigón, o un nervio más ancho. NUNCA rebajes un esfuerzo, ni acortes la luz, ni bajes la exposición a XC1 para que desaparezca la fisuración.`;

const PLACEHOLDER_EXAMPLE =
  'Ej.: Forjado reticular 30+5 de 6 m de luz, vano interior, HA-25 y B500S. '
  + 'Momento de cálculo en el vano 45 kNm por nervio y 32 kNm en el apoyo; cortante 30 kN.';

// ── Parseo defensivo del payload ──────────────────────────────────────────────

interface ForjadosPayload {
  variant: string | null;
  tipologia: string | null;
  h_mm: number | null;
  hFlange_mm: number | null;
  bWeb_mm: number | null;
  intereje_mm: number | null;
  spanLength_m: number | null;
  tipoVano: string | null;
  cover_mm: number | null;
  fck_MPa: number | null;
  fyk_MPa: number | null;
  exposureClass: string | null;
  base_sup_nBars: number | null;
  base_sup_barDiam_mm: number | null;
  base_inf_nBars: number | null;
  base_inf_barDiam_mm: number | null;
  refuerzo_vano_inf_nBars: number | null;
  refuerzo_vano_inf_barDiam_mm: number | null;
  refuerzo_apoyo_sup_nBars: number | null;
  refuerzo_apoyo_sup_barDiam_mm: number | null;
  base_sup_phi_mac_mm: number | null;
  base_sup_s_mac_mm: number | null;
  base_inf_phi_mac_mm: number | null;
  base_inf_s_mac_mm: number | null;
  refuerzo_vano_inf_phi_mac_mm: number | null;
  refuerzo_vano_inf_s_mac_mm: number | null;
  refuerzo_apoyo_sup_phi_mac_mm: number | null;
  refuerzo_apoyo_sup_s_mac_mm: number | null;
  stirrupsEnabled: boolean | null;
  vano_stirrupDiam_mm: number | null;
  vano_stirrupSpacing_mm: number | null;
  vano_stirrupLegs: number | null;
  apoyo_stirrupDiam_mm: number | null;
  apoyo_stirrupSpacing_mm: number | null;
  apoyo_stirrupLegs: number | null;
  vano_Md_kNm: number | null;
  apoyo_Md_kNm: number | null;
  VEd_kN: number | null;
  vano_M_G_kNm: number | null;
  vano_M_Q_kNm: number | null;
  apoyo_M_G_kNm: number | null;
  apoyo_M_Q_kNm: number | null;
  warnings: string[];
}

function finiteNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
function stringOrNull(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}
function boolOrNull(v: unknown): boolean | null {
  return typeof v === 'boolean' ? v : null;
}

function parsePayload(raw: unknown): ForjadosPayload {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new AiError('bad-response', 'La propuesta del modelo no es un objeto JSON.');
  }
  const r = raw as Record<string, unknown>;
  return {
    variant: stringOrNull(r.variant),
    tipologia: stringOrNull(r.tipologia),
    h_mm: finiteNumber(r.h_mm),
    hFlange_mm: finiteNumber(r.hFlange_mm),
    bWeb_mm: finiteNumber(r.bWeb_mm),
    intereje_mm: finiteNumber(r.intereje_mm),
    spanLength_m: finiteNumber(r.spanLength_m),
    tipoVano: stringOrNull(r.tipoVano),
    cover_mm: finiteNumber(r.cover_mm),
    fck_MPa: finiteNumber(r.fck_MPa),
    fyk_MPa: finiteNumber(r.fyk_MPa),
    exposureClass: stringOrNull(r.exposureClass),
    base_sup_nBars: finiteNumber(r.base_sup_nBars),
    base_sup_barDiam_mm: finiteNumber(r.base_sup_barDiam_mm),
    base_inf_nBars: finiteNumber(r.base_inf_nBars),
    base_inf_barDiam_mm: finiteNumber(r.base_inf_barDiam_mm),
    refuerzo_vano_inf_nBars: finiteNumber(r.refuerzo_vano_inf_nBars),
    refuerzo_vano_inf_barDiam_mm: finiteNumber(r.refuerzo_vano_inf_barDiam_mm),
    refuerzo_apoyo_sup_nBars: finiteNumber(r.refuerzo_apoyo_sup_nBars),
    refuerzo_apoyo_sup_barDiam_mm: finiteNumber(r.refuerzo_apoyo_sup_barDiam_mm),
    base_sup_phi_mac_mm: finiteNumber(r.base_sup_phi_mac_mm),
    base_sup_s_mac_mm: finiteNumber(r.base_sup_s_mac_mm),
    base_inf_phi_mac_mm: finiteNumber(r.base_inf_phi_mac_mm),
    base_inf_s_mac_mm: finiteNumber(r.base_inf_s_mac_mm),
    refuerzo_vano_inf_phi_mac_mm: finiteNumber(r.refuerzo_vano_inf_phi_mac_mm),
    refuerzo_vano_inf_s_mac_mm: finiteNumber(r.refuerzo_vano_inf_s_mac_mm),
    refuerzo_apoyo_sup_phi_mac_mm: finiteNumber(r.refuerzo_apoyo_sup_phi_mac_mm),
    refuerzo_apoyo_sup_s_mac_mm: finiteNumber(r.refuerzo_apoyo_sup_s_mac_mm),
    stirrupsEnabled: boolOrNull(r.stirrupsEnabled),
    vano_stirrupDiam_mm: finiteNumber(r.vano_stirrupDiam_mm),
    vano_stirrupSpacing_mm: finiteNumber(r.vano_stirrupSpacing_mm),
    vano_stirrupLegs: finiteNumber(r.vano_stirrupLegs),
    apoyo_stirrupDiam_mm: finiteNumber(r.apoyo_stirrupDiam_mm),
    apoyo_stirrupSpacing_mm: finiteNumber(r.apoyo_stirrupSpacing_mm),
    apoyo_stirrupLegs: finiteNumber(r.apoyo_stirrupLegs),
    vano_Md_kNm: finiteNumber(r.vano_Md_kNm),
    apoyo_Md_kNm: finiteNumber(r.apoyo_Md_kNm),
    VEd_kN: finiteNumber(r.VEd_kN),
    vano_M_G_kNm: finiteNumber(r.vano_M_G_kNm),
    vano_M_Q_kNm: finiteNumber(r.vano_M_Q_kNm),
    apoyo_M_G_kNm: finiteNumber(r.apoyo_M_G_kNm),
    apoyo_M_Q_kNm: finiteNumber(r.apoyo_M_Q_kNm),
    warnings: Array.isArray(r.warnings)
      ? r.warnings.filter((w): w is string => typeof w === 'string')
      : [],
  };
}

// ── Mapper payload → AiApplyPlan ─────────────────────────────────────────────

const LABELS = {
  variant: 'Tipo de forjado',
  tipologia: 'Tipología',
  h_mm: 'Canto h',
  hFlange_mm: 'Capa de compresión h_f',
  bWeb_mm: 'Ancho de nervio b_w',
  intereje_mm: 'Intereje',
  spanLength_m: 'Luz L',
  tipoVano: 'Tipo de vano',
  cover_mm: 'Recubrimiento',
  fck_MPa: 'Hormigón fck',
  fyk_MPa: 'Acero fyk',
  exposureClass: 'Clase de exposición',
  base_sup_nBars: 'Montaje superior — nº barras',
  base_sup_barDiam_mm: 'Montaje superior — Ø',
  base_inf_nBars: 'Montaje inferior — nº barras',
  base_inf_barDiam_mm: 'Montaje inferior — Ø',
  refuerzo_vano_inf_nBars: 'Refuerzo de vano — nº barras',
  refuerzo_vano_inf_barDiam_mm: 'Refuerzo de vano — Ø',
  refuerzo_apoyo_sup_nBars: 'Refuerzo de apoyo — nº barras',
  refuerzo_apoyo_sup_barDiam_mm: 'Refuerzo de apoyo — Ø',
  base_sup_phi_mac_mm: 'Parrilla superior — Ø',
  base_sup_s_mac_mm: 'Parrilla superior — separación',
  base_inf_phi_mac_mm: 'Parrilla inferior — Ø',
  base_inf_s_mac_mm: 'Parrilla inferior — separación',
  refuerzo_vano_inf_phi_mac_mm: 'Refuerzo de vano — Ø',
  refuerzo_vano_inf_s_mac_mm: 'Refuerzo de vano — separación',
  refuerzo_apoyo_sup_phi_mac_mm: 'Refuerzo de apoyo — Ø',
  refuerzo_apoyo_sup_s_mac_mm: 'Refuerzo de apoyo — separación',
  stirrupsEnabled: 'Cercos de cortante',
  vano_stirrupDiam_mm: 'Vano — Ø cerco',
  vano_stirrupSpacing_mm: 'Vano — separación de cercos',
  vano_stirrupLegs: 'Vano — ramas del cerco',
  apoyo_stirrupDiam_mm: 'Apoyo — Ø cerco',
  apoyo_stirrupSpacing_mm: 'Apoyo — separación de cercos',
  apoyo_stirrupLegs: 'Apoyo — ramas del cerco',
  vano_Md_kNm: 'Vano — Md',
  apoyo_Md_kNm: 'Apoyo — Md',
  VEd_kN: 'Cortante VEd',
  vano_M_G_kNm: 'Vano — M_G (servicio)',
  vano_M_Q_kNm: 'Vano — M_Q (servicio)',
  apoyo_M_G_kNm: 'Apoyo — M_G (servicio)',
  apoyo_M_Q_kNm: 'Apoyo — M_Q (servicio)',
} as const;

type PayloadKey = keyof typeof LABELS;

/** ORDER del contrato: `variant` → `tipologia` → geometría → `stirrupsEnabled` → resto. */
const KEY_ORDER: readonly PayloadKey[] = [
  'variant', 'tipologia', 'h_mm', 'hFlange_mm', 'bWeb_mm', 'intereje_mm',
  'spanLength_m', 'tipoVano', 'cover_mm', 'fck_MPa', 'fyk_MPa', 'exposureClass',
  'base_sup_nBars', 'base_sup_barDiam_mm', 'base_inf_nBars', 'base_inf_barDiam_mm',
  'refuerzo_vano_inf_nBars', 'refuerzo_vano_inf_barDiam_mm',
  'refuerzo_apoyo_sup_nBars', 'refuerzo_apoyo_sup_barDiam_mm',
  'base_sup_phi_mac_mm', 'base_sup_s_mac_mm', 'base_inf_phi_mac_mm', 'base_inf_s_mac_mm',
  'refuerzo_vano_inf_phi_mac_mm', 'refuerzo_vano_inf_s_mac_mm',
  'refuerzo_apoyo_sup_phi_mac_mm', 'refuerzo_apoyo_sup_s_mac_mm',
  'stirrupsEnabled',
  'vano_stirrupDiam_mm', 'vano_stirrupSpacing_mm', 'vano_stirrupLegs',
  'apoyo_stirrupDiam_mm', 'apoyo_stirrupSpacing_mm', 'apoyo_stirrupLegs',
  'vano_Md_kNm', 'apoyo_Md_kNm', 'VEd_kN',
  'vano_M_G_kNm', 'vano_M_Q_kNm', 'apoyo_M_G_kNm', 'apoyo_M_Q_kNm',
];

const ALREADY = 'Ya coincide con el valor actual';
const EPS = 1e-9;

export const MACIZA_INERT_REASON =
  'En losa maciza no hay tipología ni nervios: el canto es el único dato de sección (la app '
  + 'comprueba una franja de 1 m de ancho).';

export const RETICULAR_ARMADO_REASON =
  'El armado en paquetes de barras por nervio solo existe en el forjado reticular.';

export const MACIZA_ARMADO_REASON =
  'El armado en parrillas (Ø + separación) solo existe en la losa maciza.';

export const PRESET_GEOM_REASON =
  'Con una tipología comercial, la geometría la fija el preset y la app la bloquea. Propón '
  + 'tipologia = "custom" en el mismo mensaje para poder editarla.';

export const STIRRUPS_GATE_REASON =
  'Sin cercos de cortante (stirrupsEnabled), este campo no interviene en el cálculo.';

/**
 * Campos que NO son variables de diseño. El canto, el armado, el hormigón y el
 * nervio SÍ lo son.
 *
 * Ordinales calibrados con el factor real del motor:
 * - `exposureClass`: con XC1 el motor NO comprueba la fisuración (rcSlabs, "only
 *   when exposureClass ≠ XC1"); XC2–XC4 comparten el mismo wk = 0.30 mm, así que
 *   entre ellas no hay nivel que bajar. El único cambio que relaja algo — y aquí
 *   relaja MUCHO: se lleva una comprobación entera por delante — es bajar a XC1.
 * - `tipoVano`: nivel = −l0Factor (CE Anejo 19 §5.3.2.1). Un L0 mayor ensancha el ancho
 *   eficaz b_eff del nervio y regala capacidad a flexión en el vano; el voladizo
 *   (L0 = 2L) es el extremo. Es la vía que afecta al VEREDICTO. (El mismo campo
 *   fija además el K de la esbeltez, pero esa comprobación es informativa y no
 *   cuenta para el veredicto, así que no gobierna la calibración.)
 */
export const FORJADOS_SAFETY_RULES: ReadonlyArray<SafetyRule<ForjadosInputs>> = [
  { field: 'vano_Md', confirmKey: 'vano_Md_kNm', level: higherIsSafer, why: 'El momento de cálculo del vano lo fija el análisis de la estructura: rebajarlo hace "cumplir" la sección sin tocar el forjado.' },
  { field: 'apoyo_Md', confirmKey: 'apoyo_Md_kNm', level: higherIsSafer, why: 'El momento de cálculo del apoyo lo fija el análisis: rebajarlo hace "cumplir" la sección sin tocar el forjado.' },
  { field: 'VEd', confirmKey: 'VEd_kN', level: higherIsSafer, why: 'El cortante de cálculo lo fija el análisis: rebajarlo hace "cumplir" el cortante sin poner un solo cerco.' },
  { field: 'vano_M_G', confirmKey: 'vano_M_G_kNm', level: higherIsSafer, why: 'El momento de servicio por cargas permanentes sale de la composición real del forjado: rebajarlo reduce la fisura calculada.' },
  { field: 'vano_M_Q', confirmKey: 'vano_M_Q_kNm', level: higherIsSafer, why: 'El momento de servicio por sobrecarga lo fija la categoría de uso: rebajarlo reduce la fisura calculada.' },
  { field: 'apoyo_M_G', confirmKey: 'apoyo_M_G_kNm', level: higherIsSafer, why: 'El momento de servicio por cargas permanentes sale de la composición real del forjado: rebajarlo reduce la fisura calculada.' },
  { field: 'apoyo_M_Q', confirmKey: 'apoyo_M_Q_kNm', level: higherIsSafer, why: 'El momento de servicio por sobrecarga lo fija la categoría de uso: rebajarlo reduce la fisura calculada.' },
  {
    // OJO, dirección CONTRARIA a la de los demás módulos de vigas: aquí los
    // esfuerzos (Md, VEd) son entrada MANUAL — la luz no alimenta la demanda.
    // Solo alimenta (a) el ancho eficaz bEff = max(min(intereje, L0/5), bWeb),
    // que es CAPACIDAD del nervio en T y crece con L (activo con los defaults:
    // 700 < 820), y (b) la esbeltez L/d, que es informativa y no toca el
    // veredicto. Lo peligroso es ALARGARLA. Punto ciego asumido: acortarla
    // limpia la línea informativa de esbeltez, pero no puede volcar el
    // veredicto, así que no se marca.
    field: 'spanLength',
    confirmKey: 'spanLength_m',
    level: lowerIsSafer,
    why: 'La luz la fija la geometría del edificio, y en este módulo alimenta el ancho eficaz del nervio: alargarla ensancha bEff y regala capacidad a flexión en el vano sin tocar el forjado.',
  },
  { field: 'cover', confirmKey: 'cover_mm', level: higherIsSafer, why: 'El recubrimiento es un criterio de durabilidad que fija la clase de exposición: rebajarlo aumenta el canto útil y regala capacidad a flexión.' },
  {
    field: 'exposureClass', // payload `exposureClass`: mismo nombre ⇒ sin confirmKey
    level: ordinalLevel({ XC1: 0, XC2: 1, XC3: 1, XC4: 1 }),
    why: 'La clase de exposición la fija el ambiente real de la obra. Con XC1 la app NO comprueba la fisuración: bajar a XC1 no relaja el límite, lo ELIMINA.',
  },
  {
    field: 'tipoVano', // payload `tipoVano`: mismo nombre ⇒ sin confirmKey
    level: ordinalLevel({
      'continuo-interior': -0.70, 'continuo-extremo': -0.85, biapoyado: -1.0, voladizo: -2.0,
    }),
    why: 'La continuidad del vano la fija la estructura, y con ella la distancia entre puntos de momento nulo L0: declarar un L0 mayor (un voladizo es 2L) ensancha el ancho eficaz del nervio y regala capacidad a flexión sin tocar el forjado.',
  },
];

function rangeReason(value: number, min: number, max: number, unit: string): string {
  const u = unit === '' ? '' : ` ${unit}`;
  return `Valor ${value}${u} fuera del rango admisible ${min}–${max}${u}`;
}

const round2 = (v: number) => Math.round(v * 100) / 100;
const fmtMm = (mm: number) => `${mm} mm`;

function buildForjadosPlan(
  x: ForjadosPayload,
  current: ForjadosInputs,
  system: UnitSystem,
  confirmed?: ReadonlySet<string>,
): AiApplyPlan<ForjadosInputs> {
  const fields: Partial<ForjadosInputs> = {};
  const changes: AiFieldChange[] = [];
  const skipped: AiSkippedField[] = [];
  const warnings: string[] = [...x.warnings];
  const handled = new Set<PayloadKey>();

  function skip(key: PayloadKey, reason: string): void {
    handled.add(key);
    skipped.push({ label: LABELS[key], reason });
  }

  function apply<K extends keyof ForjadosInputs>(
    key: PayloadKey,
    field: K,
    value: ForjadosInputs[K],
    before: string,
    after: string,
  ): void {
    handled.add(key);
    fields[field] = value;
    changes.push({ field, label: LABELS[key], before, after });
  }

  // --- variant PRIMERO: decide qué armado y qué geometría existen ---
  if (x.variant !== null) {
    if (!VARIANTS.includes(x.variant)) {
      skip('variant', `Variante "${x.variant}" desconocida (reticular, maciza)`);
    } else if (x.variant === current.variant) {
      skip('variant', ALREADY);
    } else {
      apply(
        'variant', 'variant', x.variant as ForjadosVariant,
        VARIANT_LABEL[current.variant], VARIANT_LABEL[x.variant],
      );
      warnings.push(
        'Al cambiar de tipo de forjado se reinicia todo el armado a los valores por defecto '
        + '(los dos sistemas se arman de forma distinta).',
      );
    }
  }
  const variantFinal = (fields.variant ?? current.variant) as ForjadosVariant;
  const isReticular = variantFinal === 'reticular';

  // --- tipologia: solo en reticular; gatea la geometría ---
  if (x.tipologia !== null) {
    if (!isReticular) {
      skip('tipologia', MACIZA_INERT_REASON);
    } else if (!TIPOLOGIA_KEYS.includes(x.tipologia)) {
      skip('tipologia', `Tipología "${x.tipologia}" no está en el catálogo (${TIPOLOGIA_KEYS.join(', ')})`);
    } else if (x.tipologia === current.tipologia) {
      skip('tipologia', ALREADY);
    } else {
      apply(
        'tipologia', 'tipologia', x.tipologia as ForjadosTipologia,
        TIPOLOGIA_LABEL[current.tipologia] ?? current.tipologia, TIPOLOGIA_LABEL[x.tipologia],
      );
      // La geometría del preset se aplica vía tipologiaPatch en el apply, SIN
      // fila propia en la tabla (patrón de los campos derivados): el aviso es lo
      // que la hace visible al usuario.
      const preset = TIPOLOGIAS.find((t) => t.key === x.tipologia);
      if (preset !== undefined) {
        warnings.push(
          `La tipología ${preset.key} fija la geometría del preset: canto ${preset.h} mm, `
          + `capa ${preset.hFlange} mm, nervio ${preset.bWeb} mm e intereje ${preset.intereje} mm.`,
        );
      }
    }
  }
  const tipologiaFinal = (fields.tipologia ?? current.tipologia) as ForjadosTipologia;
  /** En reticular, una tipología comercial fija la geometría (la UI la bloquea). */
  const geomLocked = isReticular && tipologiaFinal !== 'custom';

  /** Longitud en mm con rango; ALREADY exacto. */
  function applyMm<K extends keyof ForjadosInputs>(
    key: PayloadKey,
    field: K,
    value: number | null,
    min: number,
    max: number,
  ): void {
    if (value === null) return;
    if (value < min || value > max) {
      skip(key, rangeReason(value, min, max, 'mm'));
      return;
    }
    const v = round2(value);
    const before = current[field] as number;
    if (Math.abs(v - before) <= EPS) skip(key, ALREADY);
    else apply(key, field, v as ForjadosInputs[K], fmtMm(before), fmtMm(v));
  }

  // --- Geometría de sección ---
  if (x.h_mm !== null && geomLocked) skip('h_mm', PRESET_GEOM_REASON);
  else applyMm('h_mm', 'h', x.h_mm, 50, 2000);

  for (const [key, field] of [
    ['hFlange_mm', 'hFlange'], ['bWeb_mm', 'bWeb'], ['intereje_mm', 'intereje'],
  ] as [PayloadKey, keyof ForjadosInputs][]) {
    const value = (x as unknown as Record<string, number | null>)[key];
    if (value === null) continue;
    if (!isReticular) skip(key, MACIZA_INERT_REASON);
    else if (geomLocked) skip(key, PRESET_GEOM_REASON);
    else applyMm(key, field, value, 10, 3000);
  }

  // --- Luz: payload en m, estado en mm ---
  if (x.spanLength_m !== null) {
    if (x.spanLength_m <= 0 || x.spanLength_m > 50) {
      skip('spanLength_m', rangeReason(x.spanLength_m, 0, 50, 'm'));
    } else {
      const mm = Math.round(x.spanLength_m * 1000);
      if (Math.abs(mm - current.spanLength) <= EPS) skip('spanLength_m', ALREADY);
      else apply('spanLength_m', 'spanLength', mm, `${current.spanLength / 1000} m`, `${mm / 1000} m`);
    }
  }

  if (x.tipoVano !== null) {
    if (!TIPO_VANO_KEYS.includes(x.tipoVano)) {
      skip('tipoVano', `Tipo de vano "${x.tipoVano}" desconocido (${TIPO_VANO_KEYS.join(', ')})`);
    } else if (x.tipoVano === current.tipoVano) {
      skip('tipoVano', ALREADY);
    } else {
      apply(
        'tipoVano', 'tipoVano', x.tipoVano as ForjadosTipoVano,
        TIPO_VANO_LABEL[current.tipoVano] ?? current.tipoVano, TIPO_VANO_LABEL[x.tipoVano],
      );
    }
  }

  applyMm('cover_mm', 'cover', x.cover_mm, 10, 100);

  // --- Materiales ---
  if (x.fck_MPa !== null) {
    if (!availableFck.includes(x.fck_MPa)) {
      skip('fck_MPa', `HA-${x.fck_MPa} no está en el catálogo (${availableFck.join(', ')} MPa)`);
    } else if (x.fck_MPa === current.fck) {
      skip('fck_MPa', ALREADY);
    } else {
      apply('fck_MPa', 'fck', x.fck_MPa, `HA-${current.fck}`, `HA-${x.fck_MPa}`);
    }
  }
  if (x.fyk_MPa !== null) {
    if (!FYK.includes(x.fyk_MPa)) {
      skip('fyk_MPa', `fyk ${x.fyk_MPa} no está en el catálogo (${FYK.join(', ')} MPa)`);
    } else if (x.fyk_MPa === current.fyk) {
      skip('fyk_MPa', ALREADY);
    } else {
      apply('fyk_MPa', 'fyk', x.fyk_MPa, `${current.fyk} MPa`, `${x.fyk_MPa} MPa`);
    }
  }
  if (x.exposureClass !== null) {
    if (!EXPOSURE.includes(x.exposureClass)) {
      skip('exposureClass', `Clase "${x.exposureClass}" no disponible (${EXPOSURE.join(', ')})`);
    } else if (x.exposureClass === current.exposureClass) {
      skip('exposureClass', ALREADY);
    } else {
      apply('exposureClass', 'exposureClass', x.exposureClass, current.exposureClass, x.exposureClass);
    }
  }

  // --- Armado: los dos juegos son disjuntos por variante ---
  function applyNBars(key: PayloadKey, field: keyof ForjadosInputs, value: number | null, min: number): void {
    if (value === null) return;
    if (!isReticular) {
      skip(key, RETICULAR_ARMADO_REASON);
      return;
    }
    if (!Number.isInteger(value) || value < min || value > 12) {
      skip(key, rangeReason(value, min, 12, 'barras'));
      return;
    }
    const before = current[field] as number;
    if (value === before) skip(key, ALREADY);
    else apply(key, field, value as ForjadosInputs[typeof field], `${before} barras`, `${value} barras`);
  }

  function applyBarDiam(key: PayloadKey, field: keyof ForjadosInputs, value: number | null): void {
    if (value === null) return;
    if (!isReticular) {
      skip(key, RETICULAR_ARMADO_REASON);
      return;
    }
    if (!availableBarDiams.includes(value)) {
      skip(key, `Ø${value} no es un diámetro del catálogo (Ø${availableBarDiams.join(', Ø')})`);
      return;
    }
    const before = current[field] as number;
    if (value === before) skip(key, ALREADY);
    else apply(key, field, value as ForjadosInputs[typeof field], `Ø${before} mm`, `Ø${value} mm`);
  }

  // Montaje base (obligatorio: el motor exige > 0) y refuerzos zonales (0 = sin refuerzo)
  applyNBars('base_sup_nBars', 'base_sup_nBars', x.base_sup_nBars, 1);
  applyBarDiam('base_sup_barDiam_mm', 'base_sup_barDiam', x.base_sup_barDiam_mm);
  applyNBars('base_inf_nBars', 'base_inf_nBars', x.base_inf_nBars, 1);
  applyBarDiam('base_inf_barDiam_mm', 'base_inf_barDiam', x.base_inf_barDiam_mm);
  applyNBars('refuerzo_vano_inf_nBars', 'refuerzo_vano_inf_nBars', x.refuerzo_vano_inf_nBars, 0);
  applyBarDiam('refuerzo_vano_inf_barDiam_mm', 'refuerzo_vano_inf_barDiam', x.refuerzo_vano_inf_barDiam_mm);
  applyNBars('refuerzo_apoyo_sup_nBars', 'refuerzo_apoyo_sup_nBars', x.refuerzo_apoyo_sup_nBars, 0);
  applyBarDiam('refuerzo_apoyo_sup_barDiam_mm', 'refuerzo_apoyo_sup_barDiam', x.refuerzo_apoyo_sup_barDiam_mm);

  /** Ø de parrilla maciza. `allowZero` en los refuerzos: 0 = sin refuerzo. */
  function applyMacPhi(
    key: PayloadKey,
    field: keyof ForjadosInputs,
    value: number | null,
    allowZero: boolean,
  ): void {
    if (value === null) return;
    if (isReticular) {
      skip(key, MACIZA_ARMADO_REASON);
      return;
    }
    const catalog = allowZero ? [0, ...MAC_PHI] : MAC_PHI;
    if (!catalog.includes(value)) {
      skip(key, `Ø${value} no es un diámetro de parrilla (${catalog.map((d) => (d === 0 ? '0 = sin refuerzo' : `Ø${d}`)).join(', ')})`);
      return;
    }
    const before = current[field] as number;
    if (value === before) skip(key, ALREADY);
    else {
      const fmt = (d: number) => (d === 0 ? 'sin refuerzo' : `Ø${d} mm`);
      apply(key, field, value as ForjadosInputs[typeof field], fmt(before), fmt(value));
    }
  }

  function applyMacSpacing(key: PayloadKey, field: keyof ForjadosInputs, value: number | null): void {
    if (value === null) return;
    if (isReticular) {
      skip(key, MACIZA_ARMADO_REASON);
      return;
    }
    applyMm(key, field, value, 50, 500);
  }

  applyMacPhi('base_sup_phi_mac_mm', 'base_sup_phi_mac', x.base_sup_phi_mac_mm, false);
  applyMacSpacing('base_sup_s_mac_mm', 'base_sup_s_mac', x.base_sup_s_mac_mm);
  applyMacPhi('base_inf_phi_mac_mm', 'base_inf_phi_mac', x.base_inf_phi_mac_mm, false);
  applyMacSpacing('base_inf_s_mac_mm', 'base_inf_s_mac', x.base_inf_s_mac_mm);
  applyMacPhi('refuerzo_vano_inf_phi_mac_mm', 'refuerzo_vano_inf_phi_mac', x.refuerzo_vano_inf_phi_mac_mm, true);
  applyMacSpacing('refuerzo_vano_inf_s_mac_mm', 'refuerzo_vano_inf_s_mac', x.refuerzo_vano_inf_s_mac_mm);
  applyMacPhi('refuerzo_apoyo_sup_phi_mac_mm', 'refuerzo_apoyo_sup_phi_mac', x.refuerzo_apoyo_sup_phi_mac_mm, true);
  applyMacSpacing('refuerzo_apoyo_sup_s_mac_mm', 'refuerzo_apoyo_sup_s_mac', x.refuerzo_apoyo_sup_s_mac_mm);

  // --- Cercos: stirrupsEnabled gatea los 6 campos ---
  if (x.stirrupsEnabled !== null) {
    if (x.stirrupsEnabled === current.stirrupsEnabled) {
      skip('stirrupsEnabled', ALREADY);
    } else {
      const fmt = (v: boolean) => (v ? 'Con cercos' : 'Sin cercos');
      apply(
        'stirrupsEnabled', 'stirrupsEnabled', x.stirrupsEnabled,
        fmt(current.stirrupsEnabled), fmt(x.stirrupsEnabled),
      );
    }
  }
  const stirrupsFinal = (fields.stirrupsEnabled ?? current.stirrupsEnabled) as boolean;

  function stirrupGate(key: PayloadKey, value: unknown): boolean {
    if (value === null) return false;
    if (!stirrupsFinal) {
      skip(key, STIRRUPS_GATE_REASON);
      return false;
    }
    return true;
  }

  for (const kind of ['vano', 'apoyo'] as const) {
    const dKey = `${kind}_stirrupDiam_mm` as PayloadKey;
    const sKey = `${kind}_stirrupSpacing_mm` as PayloadKey;
    const lKey = `${kind}_stirrupLegs` as PayloadKey;
    const vals = x as unknown as Record<string, number | null>;

    if (stirrupGate(dKey, vals[dKey])) {
      const v = vals[dKey] as number;
      const field = `${kind}_stirrupDiam` as keyof ForjadosInputs;
      if (!SW_DIAMS.includes(v)) skip(dKey, `Ø${v} no está entre los diámetros de cerco (Ø${SW_DIAMS.join(', Ø')})`);
      else if (v === (current[field] as number)) skip(dKey, ALREADY);
      else apply(dKey, field, v as ForjadosInputs[typeof field], `Ø${current[field] as number} mm`, `Ø${v} mm`);
    }
    if (stirrupGate(sKey, vals[sKey])) {
      applyMm(sKey, `${kind}_stirrupSpacing` as keyof ForjadosInputs, vals[sKey], 50, 600);
    }
    if (stirrupGate(lKey, vals[lKey])) {
      const v = vals[lKey] as number;
      const field = `${kind}_stirrupLegs` as keyof ForjadosInputs;
      if (!SW_LEGS.includes(v)) skip(lKey, `${v} ramas no está entre las opciones (${SW_LEGS.join(', ')})`);
      else if (v === (current[field] as number)) skip(lKey, ALREADY);
      else apply(lKey, field, v as ForjadosInputs[typeof field], `${current[field] as number} ramas`, `${v} ramas`);
    }
  }

  // --- Esfuerzos ---
  //
  // El motor normaliza Md con Math.abs() y combina Ms = |M_G + ψ₂·M_Q|: unos signos
  // mezclados en M_G/M_Q se CANCELARÍAN y bajarían la fisura calculada. Se guardan
  // siempre como magnitud.
  function applyEffort(
    key: PayloadKey,
    field: keyof ForjadosInputs,
    value: number | null,
    quantity: 'force' | 'moment',
  ): void {
    if (value === null) return;
    if (Math.abs(value) > 100000) {
      skip(key, rangeReason(value, -100000, 100000, quantity === 'force' ? 'kN' : 'kNm'));
      return;
    }
    if (value < 0) {
      warnings.push(
        `${LABELS[key]}: el valor se toma como magnitud (${Math.abs(value)}); el signo del momento lo `
        + 'fija la sección (vano = positivo, apoyo = negativo).',
      );
    }
    const v = round2(Math.abs(value));
    const before = current[field] as number;
    if (Math.abs(v - before) <= EPS) skip(key, ALREADY);
    else {
      apply(
        key, field, v as ForjadosInputs[typeof field],
        formatQuantity(before, quantity, system), formatQuantity(v, quantity, system),
      );
    }
  }

  applyEffort('vano_Md_kNm', 'vano_Md', x.vano_Md_kNm, 'moment');
  applyEffort('apoyo_Md_kNm', 'apoyo_Md', x.apoyo_Md_kNm, 'moment');
  applyEffort('VEd_kN', 'VEd', x.VEd_kN, 'force');
  applyEffort('vano_M_G_kNm', 'vano_M_G', x.vano_M_G_kNm, 'moment');
  applyEffort('vano_M_Q_kNm', 'vano_M_Q', x.vano_M_Q_kNm, 'moment');
  applyEffort('apoyo_M_G_kNm', 'apoyo_M_G', x.apoyo_M_G_kNm, 'moment');
  applyEffort('apoyo_M_Q_kNm', 'apoyo_M_Q', x.apoyo_M_Q_kNm, 'moment');

  // --- notFound ---
  const values = x as unknown as Record<PayloadKey, unknown>;
  const notFound: string[] = [];
  for (const key of KEY_ORDER) {
    if (values[key] === null && !handled.has(key)) notFound.push(LABELS[key]);
  }

  const risks = detectSafetyRisks(
    FORJADOS_SAFETY_RULES, changes, fields, current, forjadosDefaults, confirmed,
  );
  return { fields, changes, skipped, notFound, warnings, notes: null, risks };
}

// ── Snapshot del estado ───────────────────────────────────────────────────────

// `loadType` y `psi2Custom` quedan fuera a propósito: el motor los usa, pero NO
// tienen control en la UI (ver cabecera). `title` es metadato de documento.
type StateKey = Exclude<keyof ForjadosInputs, 'title' | 'loadType' | 'psi2Custom'>;

const SNAPSHOT_FIELDS: Readonly<Record<PayloadKey, StateKey>> = {
  variant: 'variant',
  tipologia: 'tipologia',
  h_mm: 'h',
  hFlange_mm: 'hFlange',
  bWeb_mm: 'bWeb',
  intereje_mm: 'intereje',
  spanLength_m: 'spanLength',
  tipoVano: 'tipoVano',
  cover_mm: 'cover',
  fck_MPa: 'fck',
  fyk_MPa: 'fyk',
  exposureClass: 'exposureClass',
  base_sup_nBars: 'base_sup_nBars',
  base_sup_barDiam_mm: 'base_sup_barDiam',
  base_inf_nBars: 'base_inf_nBars',
  base_inf_barDiam_mm: 'base_inf_barDiam',
  refuerzo_vano_inf_nBars: 'refuerzo_vano_inf_nBars',
  refuerzo_vano_inf_barDiam_mm: 'refuerzo_vano_inf_barDiam',
  refuerzo_apoyo_sup_nBars: 'refuerzo_apoyo_sup_nBars',
  refuerzo_apoyo_sup_barDiam_mm: 'refuerzo_apoyo_sup_barDiam',
  base_sup_phi_mac_mm: 'base_sup_phi_mac',
  base_sup_s_mac_mm: 'base_sup_s_mac',
  base_inf_phi_mac_mm: 'base_inf_phi_mac',
  base_inf_s_mac_mm: 'base_inf_s_mac',
  refuerzo_vano_inf_phi_mac_mm: 'refuerzo_vano_inf_phi_mac',
  refuerzo_vano_inf_s_mac_mm: 'refuerzo_vano_inf_s_mac',
  refuerzo_apoyo_sup_phi_mac_mm: 'refuerzo_apoyo_sup_phi_mac',
  refuerzo_apoyo_sup_s_mac_mm: 'refuerzo_apoyo_sup_s_mac',
  stirrupsEnabled: 'stirrupsEnabled',
  vano_stirrupDiam_mm: 'vano_stirrupDiam',
  vano_stirrupSpacing_mm: 'vano_stirrupSpacing',
  vano_stirrupLegs: 'vano_stirrupLegs',
  apoyo_stirrupDiam_mm: 'apoyo_stirrupDiam',
  apoyo_stirrupSpacing_mm: 'apoyo_stirrupSpacing',
  apoyo_stirrupLegs: 'apoyo_stirrupLegs',
  vano_Md_kNm: 'vano_Md',
  apoyo_Md_kNm: 'apoyo_Md',
  VEd_kN: 'VEd',
  vano_M_G_kNm: 'vano_M_G',
  vano_M_Q_kNm: 'vano_M_Q',
  apoyo_M_G_kNm: 'apoyo_M_G',
  apoyo_M_Q_kNm: 'apoyo_M_Q',
};

function buildSnapshot(c: ForjadosInputs): string {
  const valores: Record<string, number | string | boolean> = {};
  const sinConfirmar: PayloadKey[] = [];
  for (const key of KEY_ORDER) {
    const field = SNAPSHOT_FIELDS[key];
    const value = c[field];
    // La luz se serializa en las unidades humanas del payload (m).
    valores[key] = key === 'spanLength_m' ? (value as number) / 1000 : value;
    if (value === forjadosDefaults[field]) sinConfirmar.push(key);
  }
  return JSON.stringify({ valores, sin_confirmar: sinConfirmar });
}

// ── Resumen de resultados para el prompt ─────────────────────────────────────

/** Prefija la descripción de cada fila: los ids se repiten entre secciones. */
function prefixed(checks: CheckRow[], prefix: string): CheckRow[] {
  return checks.map((c) => ({ ...c, description: `${prefix}: ${c.description}` }));
}

/**
 * Resume el resultado del motor de forjados (sintético: el motor devuelve dos
 * secciones + cortante + informativas, no un `checks` plano).
 *
 * TRAMPA DE LOS `infoChecks`: sus filas NO son `neutral` — llevan `status: 'ok'`
 * o `'warn'` (la esbeltez L/d avisa en warn cuando se excede). La UI las EXCLUYE
 * del veredicto y las pinta aparte como "Información (no bloqueante)". Si se
 * colaran en el `checks` del resumen, un aviso de esbeltez volcaría el veredicto
 * a ADVERTENCIA y el prompt contradiría a la pantalla. Van como extraLines.
 */
export function summarizeForjadoResults(r: ForjadosResult): AiResultsSummary {
  if (r.error != null) return summarizeCalcResults({ valid: false, error: r.error, checks: [] });

  const checks: CheckRow[] = [
    ...prefixed(r.vano.checks, 'Vano'),
    ...prefixed(r.apoyo.checks, 'Apoyo'),
    ...r.shearChecks,
  ];
  const synthetic: CalcResultLike = { valid: r.valid, checks };

  const extras: string[] = [];
  if (r.variant === 'reticular') {
    extras.push(
      `Nervio: ancho eficaz b_eff = ${r.bEff.toFixed(0)} mm · L0 = ${r.L0.toFixed(0)} mm`,
    );
  } else {
    extras.push('Losa maciza: se comprueba una franja de 1000 mm de ancho.');
  }
  extras.push(
    `Cortante: VRd = ${r.VRd.toFixed(1)} kN (VRd,c = ${r.VRdc.toFixed(1)} kN`
    + `${r.VRds > 0 ? `, VRd,s = ${r.VRds.toFixed(1)} kN` : ' — sin cercos'})`,
  );
  extras.push(
    `Cantos útiles: vano d = ${r.vano.d.toFixed(0)} mm (MRd = ${r.vano.MRd.toFixed(1)} kNm) · `
    + `apoyo d = ${r.apoyo.d.toFixed(0)} mm (MRd = ${r.apoyo.MRd.toFixed(1)} kNm)`,
  );
  if (r.infoChecks.length > 0) {
    const info = r.infoChecks.map((c) => {
      const value = checkValueStr(c, 'si');
      const limit = checkLimitStr(c, 'si');
      const parts = [c.description, value, limit].filter((s) => s !== '' && s !== '—');
      return parts.join(' · ');
    });
    extras.push(
      `Informativas (NO cuentan para el veredicto, igual que en pantalla): ${info.join(' | ')}`,
    );
  }

  return summarizeCalcResults(synthetic, extras);
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export const forjadosAdapter: AiModuleAdapter<ForjadosInputs> = {
  id: 'forjados',
  label: 'Forjados',
  payloadSchema: FORJADOS_PAYLOAD_SCHEMA,
  promptRules: PROMPT_RULES,
  placeholder: PLACEHOLDER_EXAMPLE,
  snapshot: buildSnapshot,
  buildPlan: (payload, current, system, confirmed) =>
    buildForjadosPlan(parsePayload(payload), current, system, confirmed),
};
