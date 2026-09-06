import { type SteelBeamInputs, type ElsCombo } from '../../data/defaults';
import { BEAM_CASES } from './beamCases';

export const GAMMA_G = 1.35;
export const GAMMA_Q = 1.50;

/**
 * CTE DB-SE-AE Tabla 3.1 — use categories with characteristic Qk loads.
 * Single source of truth for both steel-beams and FEM 1D modules.
 * Each category links to a row of ψ factors in PSI_VALUES below (ELU/ELS).
 *
 * Los `qk` se cotejan en el test contra `lib/acciones/tablasCargas.ts`, que
 * transcribe la tabla 3.1 entera con sus quince filas. Este es un SUBCONJUNTO
 * suyo: aquí sólo están las categorías que un selector de una sola acción
 * variable necesita ofrecer, y ninguna puede apartarse del valor de la norma.
 * B llevaba 3,0 kN/m² donde la tabla dice 2,0 (zonas administrativas).
 *
 * EXCEPCIÓN: 'E1 Almacén' con 7,5 kN/m² NO es de la tabla 3.1 —la E del CTE es
 * «tráfico y aparcamiento de vehículos ligeros», 2,0 kN/m²— sino de la tabla
 * 6.2 del EN 1991-1-1 (áreas de almacenamiento, qk ≥ 7,5), igual que su fila de
 * ψ (1,0/0,9/0,8). Se conserva porque es la única forma de pedir un almacén en
 * este selector y porque es del lado seguro, pero no cotiza como fila del CTE.
 */
export const USE_CATEGORIES = [
  { value: 'A1', label: 'A1  Residencial privado',  qk: 2.0 },
  { value: 'A2', label: 'A2  Trasteros',             qk: 3.0 },
  { value: 'B',  label: 'B   Administrativa',        qk: 2.0 },
  { value: 'C1', label: 'C1  Zonas con mesas',       qk: 3.0 },
  { value: 'C2', label: 'C2  Asientos fijos',        qk: 4.0 },
  { value: 'C3', label: 'C3  Sin obstáculos',        qk: 5.0 },
  { value: 'D1', label: 'D1  Comercio local',        qk: 5.0 },
  { value: 'E1', label: 'E1  Almacén',               qk: 7.5 },
  { value: 'G1', label: 'G1  Cubierta accesible',    qk: 1.0 },
  { value: 'custom', label: 'Personalizada',         qk: null },
] as const;

export type UseCategoryCode = typeof USE_CATEGORIES[number]['value'];

/**
 * Acciones variables NO ligadas a un uso (CTE DB-SE Tabla 4.2). Solo tienen
 * sentido en los módulos de UNA SOLA acción variable (steel-beams), donde `qk`
 * es la ENVOLVENTE — la hipótesis más desfavorable entre uso, nieve y viento —
 * y la categoría elegida es la que fija sus ψ. `qk: null` = sin valor de
 * catálogo (lo teclea el usuario), igual que 'custom'.
 *
 * NO entran en USE_CATEGORIES: el FEM modela nieve y viento como hipótesis
 * propias (S, W) y su selector de categoría solo aplica a la hipótesis Q.
 */
const NON_USE_ACTIONS = [
  { value: 'snow',      label: 'Nieve (alt. <= 1000 m)', qk: null },
  { value: 'snow_high', label: 'Nieve (alt. > 1000 m)',  qk: null },
  { value: 'wind',      label: 'Viento (descendente)',   qk: null },
] as const;

/**
 * Opciones del campo "acción variable" de steel-beams: las categorías de uso de
 * la Tabla 3.1 + nieve/viento + personalizada (que va SIEMPRE la última).
 */
export const VARIABLE_ACTIONS = [
  ...USE_CATEGORIES.filter((c) => c.value !== 'custom'),
  ...NON_USE_ACTIONS,
  ...USE_CATEGORIES.filter((c) => c.value === 'custom'),
] as ReadonlyArray<{ value: string; label: string; qk: number | null }>;

/** Label legible de una categoría/acción variable ('custom' → "Personalizada"). */
export function categoryLabel(value: string): string {
  return VARIABLE_ACTIONS.find((c) => c.value === value)?.label ?? value;
}

/**
 * qk de catálogo de una categoría de uso (Tabla 3.1), o null si no lo tiene
 * ('custom', nieve, viento): ahí el valor lo fija el usuario y NO hay sobrecarga
 * de tabla que la envolvente deba respetar.
 */
export function categoryQk(value: string): number | null {
  return VARIABLE_ACTIONS.find((c) => c.value === value)?.qk ?? null;
}

/** ψ factors per use category / variable action — CTE DB-SE Tabla 4.2 */
const PSI_VALUES: Record<string, { psi0: number; psi1: number; psi2: number }> = {
  A1:     { psi0: 0.7, psi1: 0.5, psi2: 0.3 },
  A2:     { psi0: 0.7, psi1: 0.5, psi2: 0.3 },
  B:      { psi0: 0.7, psi1: 0.5, psi2: 0.3 },
  C1:     { psi0: 0.7, psi1: 0.7, psi2: 0.6 },
  C2:     { psi0: 0.7, psi1: 0.7, psi2: 0.6 },
  C3:     { psi0: 0.7, psi1: 0.7, psi2: 0.6 },
  D1:     { psi0: 0.7, psi1: 0.7, psi2: 0.6 },
  E1:     { psi0: 1.0, psi1: 0.9, psi2: 0.8 },
  // Categoría G (cubiertas accesibles únicamente para conservación):
  // CTE DB-SE Tabla 4.2 → ψ0 = ψ1 = ψ2 = 0 (auditoría #74).
  G1:        { psi0: 0.0, psi1: 0.0, psi2: 0.0 },
  // Nieve y viento (Tabla 4.2): ψ de la ACCIÓN, no del uso. Sin ellas, una
  // envolvente gobernada por nieve heredaba las ψ genéricas de 'custom'.
  snow:      { psi0: 0.5, psi1: 0.2, psi2: 0.0 },
  snow_high: { psi0: 0.7, psi1: 0.5, psi2: 0.2 },
  wind:      { psi0: 0.6, psi1: 0.5, psi2: 0.0 },
  custom:    { psi0: 0.7, psi1: 0.5, psi2: 0.3 },
};

/** Returns the ψ multiplier applied to Qk for the given ELS combination. */
export function getPsiForCategory(useCategory: string, combo: ElsCombo): number {
  const row = PSI_VALUES[useCategory] ?? PSI_VALUES['custom'];
  if (combo === 'characteristic')   return 1.0;
  if (combo === 'frequent')         return row.psi1;
  /* quasi-permanent */             return row.psi2;
}

/** Returns the full ψ row (ψ0, ψ1, ψ2) for a category. */
export function getPsiRow(useCategory: string): { psi0: number; psi1: number; psi2: number } {
  return PSI_VALUES[useCategory] ?? PSI_VALUES['custom'];
}

export interface LoadGenResult {
  Gk_line: number;        // kN/m
  Qk_line: number;        // kN/m
  wEd: number;            // kN/m (ELU fundamental combination)
  wSer: number;           // kN/m (ELS combination, psi-weighted)
  psi: number;            // ψ coefficient applied to Qk in wSer
  MEd: number;            // kNm
  VEd: number;            // kN
  VEd_interaction: number;// kN (at critical M section, beam-type specific)
  Mser: number;           // kNm
}

export function deriveFromLoads(inp: SteelBeamInputs): LoadGenResult {
  const L_m = inp.L / 1000;  // mm → m
  const Gk_line = inp.gk * inp.bTrib;
  const Qk_line = inp.qk * inp.bTrib;
  const wEd  = GAMMA_G * Gk_line + GAMMA_Q * Qk_line;
  const psi  = getPsiForCategory(inp.useCategory, inp.elsCombo ?? 'characteristic');
  const wSer = Gk_line + psi * Qk_line;
  const spec = BEAM_CASES[inp.beamType];
  return {
    Gk_line,
    Qk_line,
    wEd,
    wSer,
    psi,
    MEd:             spec.MEd(wEd, L_m),
    VEd:             spec.VEd(wEd, L_m),
    VEd_interaction: spec.VEd_interaction(wEd, L_m),
    Mser:            spec.MEd(wSer, L_m),
  };
}
