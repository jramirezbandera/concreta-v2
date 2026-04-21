/**
 * Canonical terminology catalog for Concreta.
 *
 * Source of truth: docs/terminology-spec.md
 * Derived from:    docs/terminology-catalog.md, docs/terminology-decisions.md
 *
 * Every pan-module symbol, result row and input label in the 12 calculation
 * modules should pull its text from here so the app speaks one consistent
 * dialect across RC / steel / timber / geotechnical work.
 *
 * Format conventions (from terminology-decisions.md):
 *   Input panel label  →  `{descLong} ({sym}) — {unit}`
 *   Result row label   →  `{sym} — {descShort}  ({ref})`
 *   Check row          →  separate `label` + `article` fields
 *
 * No module imports this file yet. The first consumer will be the timber
 * beams exemplar rewrite. Until then this file is the single place to edit
 * the app's vocabulary.
 */

export type Label = {
  /** Symbol as rendered. May include ₀₁₂ ʸᶻ Ø γ σ τ λ χ ψ ε β. */
  sym: string;
  /** Full Spanish noun phrase — used as the input field label. */
  descLong: string;
  /** ≤ 60 chars — used as the result row label. */
  descShort: string;
  /**
   * Unit string in SI, or `—` for dimensionless. NOT a runtime fallback for
   * components that render across the SI/técnico unit toggle — those
   * components should pass the explicit `quantity` prop and let the unit
   * system context resolve the suffix. The `unit` field here is text-only
   * documentation of the canonical SI label.
   */
  unit: string;
  /**
   * Quantity for SI/técnico-aware rendering. When set, components like
   * UnitNumberInput will derive the unit suffix from the active system
   * instead of reading `unit` verbatim. Omit for dimensionless / mixed-unit
   * fields where conversion does not apply.
   */
  quantity?: import("../units/types").Quantity;
  /**
   * Norm + article + equation/table reference.
   * Required for computed outputs; omitted for user-entered inputs.
   */
  ref?: string;
  /** Which module files use this entry (audit aid, not runtime). */
  modules: readonly string[];
};

// ---------------------------------------------------------------------------
// Load-type option set (CTE DB-SE-AE §3 Tabla 3.1)
// Unified from the per-module `useCategory` / `loadType` variants.
// ---------------------------------------------------------------------------

export const LOAD_TYPE_OPTIONS = [
  { key: 'residential', label: 'Viviendas (Cat. A)', psi2: 0.3 },
  { key: 'office', label: 'Oficinas (Cat. B)', psi2: 0.3 },
  { key: 'public', label: 'Zonas públicas (Cat. C)', psi2: 0.6 },
  { key: 'commercial', label: 'Comercial (Cat. D)', psi2: 0.6 },
  { key: 'storage', label: 'Almacenamiento (Cat. E)', psi2: 0.8 },
  { key: 'parking', label: 'Aparcamiento (Cat. F)', psi2: 0.6 },
  { key: 'roof', label: 'Cubierta (Cat. G)', psi2: 0.0 },
  { key: 'custom', label: 'Personalizado', psi2: null },
] as const;

export type LoadTypeKey = (typeof LOAD_TYPE_OPTIONS)[number]['key'];

// ---------------------------------------------------------------------------
// LABELS — pan-module terminology
// Organised to mirror docs/terminology-spec.md sections 1–14.
// ---------------------------------------------------------------------------

export const LABELS = {
  // -------------------------------------------------------------------------
  // Section 1 — Geometry
  // -------------------------------------------------------------------------

  b_section: {
    sym: 'b',
    descLong: 'Ancho de la sección',
    descShort: 'Ancho',
    unit: 'mm',
    modules: [
      'rcBeams',
      'rcColumns',
      'steelBeams',
      'steelColumns',
      'timberBeams',
      'timberColumns',
      'compositeSection',
      'punching',
    ],
  },

  h_section: {
    sym: 'h',
    descLong: 'Canto de la sección',
    descShort: 'Canto',
    unit: 'mm',
    modules: [
      'rcBeams',
      'rcColumns',
      'timberBeams',
      'timberColumns',
      'compositeSection',
      'punching',
    ],
  },

  d_effective: {
    sym: 'd',
    descLong: 'Canto útil',
    descShort: 'Canto útil',
    unit: 'mm',
    ref: 'CE art. 40.3.2',
    modules: ['rcBeams', 'rcColumns', 'punching'],
  },

  d_prime: {
    sym: "d'",
    descLong: 'Canto útil de la armadura de compresión',
    descShort: 'Armadura compresión',
    unit: 'mm',
    ref: 'CE art. 40.3.2',
    modules: ['rcColumns'],
  },

  L_span: {
    sym: 'L',
    descLong: 'Luz entre apoyos',
    descShort: 'Luz',
    unit: 'm',
    modules: ['rcBeams', 'steelBeams', 'timberBeams'],
  },

  L_column: {
    sym: 'L',
    descLong: 'Altura libre del pilar',
    descShort: 'Altura',
    unit: 'm',
    modules: ['rcColumns', 'timberColumns', 'empresillado'],
  },

  Ly_strong: {
    sym: 'Ly',
    descLong: 'Longitud libre — eje fuerte',
    descShort: 'Libre eje y',
    unit: 'm',
    ref: 'EC3 §6.3.1.3',
    modules: ['steelColumns', 'timberColumns'],
  },

  Lz_weak: {
    sym: 'Lz',
    descLong: 'Longitud libre — eje débil',
    descShort: 'Libre eje z',
    unit: 'm',
    ref: 'EC3 §6.3.1.3',
    modules: ['steelColumns', 'timberColumns'],
  },

  Lk_buckling: {
    sym: 'Lk',
    descLong: 'Longitud de pandeo',
    descShort: 'Lk = β·L',
    unit: 'm',
    ref: 'CE art. 43.1.2 / EC3 §6.3.1.3',
    modules: ['rcColumns'],
  },

  B_footing: {
    sym: 'B',
    descLong: 'Ancho de la zapata (lado x)',
    descShort: 'Ancho zapata',
    unit: 'm',
    modules: ['isolatedFooting'],
  },

  L_footing: {
    sym: 'L',
    descLong: 'Largo de la zapata (lado y)',
    descShort: 'Largo zapata',
    unit: 'm',
    modules: ['isolatedFooting'],
  },

  h_footing: {
    sym: 'h',
    descLong: 'Canto de la zapata',
    descShort: 'Canto zapata',
    unit: 'm',
    modules: ['isolatedFooting'],
  },

  Df_embedment: {
    sym: 'Df',
    descLong: 'Profundidad de cimentación',
    descShort: 'Profundidad',
    unit: 'm',
    ref: 'CTE DB-SE-C §4.3',
    modules: ['isolatedFooting'],
  },

  bc_column: {
    sym: 'bc',
    descLong: 'Ancho del pilar (lado x)',
    descShort: 'Ancho pilar',
    unit: 'cm',
    modules: ['isolatedFooting', 'empresillado'],
  },

  hc_column: {
    sym: 'hc',
    descLong: 'Canto del pilar (lado y)',
    descShort: 'Canto pilar',
    unit: 'cm',
    modules: ['isolatedFooting', 'empresillado'],
  },

  b_col: {
    sym: 'b_col',
    descLong: 'Ancho del pilar (lado x)',
    descShort: 'Ancho pilar',
    unit: 'mm',
    modules: ['pileCap'],
  },

  h_col: {
    sym: 'h_col',
    descLong: 'Canto del pilar (lado y)',
    descShort: 'Canto pilar',
    unit: 'mm',
    modules: ['pileCap'],
  },

  h_encepado: {
    sym: 'h_enc',
    descLong: 'Canto del encepado',
    descShort: 'Canto encepado',
    unit: 'mm',
    modules: ['pileCap'],
  },

  H_wall: {
    sym: 'H',
    descLong: 'Altura del fuste',
    descShort: 'Altura fuste',
    unit: 'm',
    modules: ['retainingWall'],
  },

  hf_footing: {
    sym: 'hf',
    descLong: 'Canto de la zapata corrida',
    descShort: 'Canto zapata',
    unit: 'm',
    modules: ['retainingWall'],
  },

  cover_mechanical: {
    sym: 'r',
    descLong: 'Recubrimiento mecánico (al eje de la barra)',
    descShort: 'Recubrimiento',
    unit: 'mm',
    ref: 'CE art. 37.2.4',
    modules: ['rcBeams', 'rcColumns', 'isolatedFooting', 'pileCap', 'punching'],
  },

  cover_geometric: {
    sym: 'c',
    descLong: 'Recubrimiento geométrico (a la superficie de la barra)',
    descShort: 'Recubrimiento',
    unit: 'm',
    ref: 'CE art. 37.2.4',
    modules: ['retainingWall'],
  },

  // -------------------------------------------------------------------------
  // Section 2 — Materials (concrete and rebar steel)
  // -------------------------------------------------------------------------

  fck: {
    sym: 'fck',
    descLong: 'Resistencia característica del hormigón',
    descShort: 'Característica hormigón',
    unit: 'N/mm²',
    ref: 'CE art. 39.2 Tabla 39.2',
    modules: [
      'rcBeams',
      'rcColumns',
      'isolatedFooting',
      'pileCap',
      'punching',
      'retainingWall',
    ],
  },

  fyk: {
    sym: 'fyk',
    descLong: 'Límite elástico característico del acero de armar',
    descShort: 'Característica acero',
    unit: 'N/mm²',
    ref: 'CE art. 32.2 Tabla 32.2.a',
    modules: [
      'rcBeams',
      'rcColumns',
      'isolatedFooting',
      'pileCap',
      'punching',
      'retainingWall',
    ],
  },

  fcd: {
    sym: 'fcd',
    descLong: 'Resistencia de cálculo del hormigón',
    descShort: 'De cálculo hormigón',
    unit: 'N/mm²',
    ref: 'CE art. 39.4 eq. 39.4.a',
    modules: ['rcBeams', 'rcColumns', 'punching'],
  },

  fyd: {
    sym: 'fyd',
    descLong: 'Resistencia de cálculo del acero de armar',
    descShort: 'De cálculo acero',
    unit: 'N/mm²',
    ref: 'CE art. 38.4 eq. 38.4',
    modules: ['rcBeams', 'rcColumns'],
  },

  exposureClass: {
    sym: '',
    descLong: 'Clase de exposición ambiental',
    descShort: 'Clase exposición',
    unit: '—',
    ref: 'CE art. 27 Tabla 27',
    modules: ['rcBeams', 'rcColumns'],
  },

  // -------------------------------------------------------------------------
  // Section 3 — Materials (steel profiles)
  // -------------------------------------------------------------------------

  fy_steel: {
    sym: 'fy',
    descLong: 'Límite elástico del acero estructural',
    descShort: 'Límite elástico',
    unit: 'N/mm²',
    ref: 'EN 10025 / EC3 §3.2.1 Tabla 3.1',
    modules: ['steelBeams', 'steelColumns', 'compositeSection', 'empresillado'],
  },

  steel_grade: {
    sym: '',
    descLong: 'Grado del acero estructural',
    descShort: 'Acero',
    unit: '—',
    ref: 'EC3 §3.2.1 Tabla 3.1',
    modules: ['steelBeams', 'steelColumns', 'compositeSection'],
  },

  profile_type: {
    sym: '',
    descLong: 'Tipo de perfil metálico',
    descShort: 'Tipo',
    unit: '—',
    modules: ['steelBeams', 'steelColumns', 'compositeSection'],
  },

  profile_size: {
    sym: '',
    descLong: 'Designación del perfil',
    descShort: 'Tamaño',
    unit: '—',
    modules: ['steelBeams', 'steelColumns', 'compositeSection'],
  },

  // -------------------------------------------------------------------------
  // Section 4 — Materials (timber)
  // -------------------------------------------------------------------------

  grade_timber: {
    sym: '',
    descLong: 'Clase resistente',
    descShort: 'Clase',
    unit: '—',
    ref: 'EN 338 (madera aserrada) / EN 14080 (laminada encolada)',
    modules: ['timberBeams', 'timberColumns'],
  },

  serviceClass: {
    sym: '',
    descLong: 'Clase de servicio',
    descShort: 'Clase servicio',
    unit: '—',
    ref: 'EC5 §2.3.1.3',
    modules: ['timberBeams', 'timberColumns'],
  },

  loadDuration: {
    sym: '',
    descLong: 'Duración de carga',
    descShort: 'Duración',
    unit: '—',
    ref: 'EC5 §2.3.1.2 Tabla 2.1',
    modules: ['timberBeams', 'timberColumns'],
  },

  fm_d: {
    sym: 'fm,d',
    descLong: 'Resistencia de cálculo a flexión',
    descShort: 'Resist. flexión',
    unit: 'N/mm²',
    ref: 'EC5 §2.4.1 eq. 2.14',
    modules: ['timberBeams', 'timberColumns'],
  },

  fv_d: {
    sym: 'fv,d',
    descLong: 'Resistencia de cálculo a cortante',
    descShort: 'Resist. cortante',
    unit: 'N/mm²',
    ref: 'EC5 §2.4.1 eq. 2.14',
    modules: ['timberBeams', 'timberColumns'],
  },

  fc0_d: {
    sym: 'fc,0,d',
    descLong: 'Resistencia de cálculo a compresión paralela',
    descShort: 'Resist. compresión ∥',
    unit: 'N/mm²',
    ref: 'EC5 §2.4.1 eq. 2.14',
    modules: ['timberColumns'],
  },

  // -------------------------------------------------------------------------
  // Section 5 — Actions (loads)
  // -------------------------------------------------------------------------

  gk_distributed: {
    sym: 'gk',
    descLong: 'Carga permanente característica',
    descShort: 'Permanente',
    unit: 'kN/m',
    ref: 'CTE DB-SE-AE §2',
    modules: ['rcBeams', 'timberBeams'],
  },

  qk_distributed: {
    sym: 'qk',
    descLong: 'Sobrecarga de uso característica',
    descShort: 'Variable',
    unit: 'kN/m',
    ref: 'CTE DB-SE-AE §3 Tabla 3.1',
    modules: ['rcBeams', 'timberBeams'],
  },

  gk_surface: {
    sym: 'g',
    descLong: 'Carga permanente adicional',
    descShort: 'Permanente adicional',
    unit: 'kN/m²',
    ref: 'CTE DB-SE-AE §2',
    modules: ['steelBeams'],
  },

  qk_surface: {
    sym: 'q',
    descLong: 'Sobrecarga de uso',
    descShort: 'Sobrecarga de uso',
    unit: 'kN/m²',
    ref: 'CTE DB-SE-AE §3 Tabla 3.1',
    modules: ['steelBeams'],
  },

  b_trib: {
    sym: 'b',
    descLong: 'Ancho tributario',
    descShort: 'Ancho tributario',
    unit: 'm',
    modules: ['steelBeams'],
  },

  loadType: {
    sym: '',
    descLong: 'Categoría de uso',
    descShort: 'Categoría',
    unit: '—',
    ref: 'CTE DB-SE-AE §3 Tabla 3.1',
    modules: ['rcBeams', 'steelBeams', 'timberBeams'],
  },

  Lcr_LTB: {
    sym: 'Lcr',
    descLong: 'Longitud de pandeo lateral',
    descShort: 'Longitud pandeo lateral',
    unit: 'm',
    ref: 'EC3 §6.3.2.2',
    modules: ['steelBeams'],
  },

  deflLimit: {
    sym: '',
    descLong: 'Límite de flecha',
    descShort: 'Límite flecha',
    unit: '—',
    ref: 'CTE DB-SE §4.3.3',
    modules: ['steelBeams'],
  },

  elsCombo: {
    sym: '',
    descLong: 'Combinación ELS para flecha',
    descShort: 'Combinación ELS',
    unit: '—',
    ref: 'CTE DB-SE §4.3.3',
    modules: ['steelBeams'],
  },

  Mser: {
    sym: 'Mser',
    descLong: 'Momento característico (ELS)',
    descShort: 'Momento ELS',
    unit: 'kNm',
    ref: 'CTE DB-SE §4.3',
    modules: ['steelBeams'],
  },

  psi2: {
    sym: 'ψ₂',
    descLong: 'Coeficiente de combinación cuasipermanente',
    descShort: 'Combinación cuasipermanente',
    unit: '—',
    ref: 'CTE DB-SE §4.2.4 Tabla 4.2 / CE art. 13.2',
    modules: ['rcBeams', 'timberBeams'],
  },

  NEd: {
    sym: 'NEd',
    descLong: 'Axil de cálculo — compresión',
    descShort: 'Axil de cálculo',
    unit: 'kN',
    quantity: 'force',
    ref: 'CTE DB-SE §4.2.1',
    modules: [
      'rcColumns',
      'steelColumns',
      'isolatedFooting',
      'pileCap',
      'empresillado',
      'timberColumns',
    ],
  },

  VEd: {
    sym: 'VEd',
    descLong: 'Cortante de cálculo',
    descShort: 'Cortante de cálculo',
    unit: 'kN',
    quantity: 'force',
    ref: 'CTE DB-SE §4.2.1',
    modules: [
      'rcBeams',
      'steelBeams',
      'timberBeams',
      'timberColumns',
      'punching',
      'empresillado',
      'forjados',
    ],
  },

  MEd: {
    sym: 'MEd',
    descLong: 'Momento de cálculo',
    descShort: 'Momento de cálculo',
    unit: 'kNm',
    quantity: 'moment',
    ref: 'CTE DB-SE §4.2.1',
    modules: ['rcBeams', 'steelBeams', 'timberBeams', 'timberColumns'],
  },

  My_Ed: {
    sym: 'My,Ed',
    descLong: 'Momento de cálculo — eje fuerte',
    descShort: 'Momento eje fuerte',
    unit: 'kNm',
    quantity: 'moment',
    ref: 'CTE DB-SE §4.2.1',
    modules: ['rcColumns', 'steelColumns'],
  },

  Mz_Ed: {
    sym: 'Mz,Ed',
    descLong: 'Momento de cálculo — eje débil',
    descShort: 'Momento eje débil',
    unit: 'kNm',
    quantity: 'moment',
    ref: 'CTE DB-SE §4.2.1',
    modules: ['rcColumns', 'steelColumns'],
  },

  Mx_Ed_plan: {
    sym: 'Mx,Ed',
    descLong: 'Momento en planta — eje x',
    descShort: 'Momento eje x',
    unit: 'kNm',
    quantity: 'moment',
    ref: 'CE art. 42',
    modules: ['isolatedFooting', 'pileCap', 'empresillado'],
  },

  My_Ed_plan: {
    sym: 'My,Ed',
    descLong: 'Momento en planta — eje y',
    descShort: 'Momento eje y',
    unit: 'kNm',
    quantity: 'moment',
    ref: 'CE art. 42',
    modules: ['isolatedFooting', 'pileCap', 'empresillado'],
  },

  N_k: {
    sym: 'Nk',
    descLong: 'Axil característico',
    descShort: 'Axil característico',
    unit: 'kN',
    ref: 'CTE DB-SE §4.2',
    modules: ['isolatedFooting'],
  },

  Mx_k: {
    sym: 'Mx,k',
    descLong: 'Momento característico en planta — eje x',
    descShort: 'Momento eje x',
    unit: 'kNm',
    ref: 'CTE DB-SE §4.2',
    modules: ['isolatedFooting'],
  },

  My_k: {
    sym: 'My,k',
    descLong: 'Momento característico en planta — eje y',
    descShort: 'Momento eje y',
    unit: 'kNm',
    ref: 'CTE DB-SE §4.2',
    modules: ['isolatedFooting'],
  },

  H_k: {
    sym: 'Hk',
    descLong: 'Fuerza horizontal característica',
    descShort: 'Horizontal característica',
    unit: 'kN',
    ref: 'CTE DB-SE §4.2',
    modules: ['isolatedFooting'],
  },

  // -------------------------------------------------------------------------
  // Section 6 — Partial safety factors
  // -------------------------------------------------------------------------

  gamma_c: {
    sym: 'γc',
    descLong: 'Coeficiente parcial del hormigón',
    descShort: 'γc',
    unit: '—',
    ref: 'CE art. 15.3 Tabla 15.3.a',
    modules: ['rcBeams', 'rcColumns', 'punching', 'isolatedFooting', 'pileCap', 'retainingWall'],
  },

  gamma_s: {
    sym: 'γs',
    descLong: 'Coeficiente parcial del acero de armar',
    descShort: 'γs',
    unit: '—',
    ref: 'CE art. 15.3 Tabla 15.3.a',
    modules: ['rcBeams', 'rcColumns', 'punching', 'isolatedFooting', 'pileCap', 'retainingWall'],
  },

  gamma_M0: {
    sym: 'γM0',
    descLong: 'Coeficiente parcial — resistencia de la sección',
    descShort: 'Resistencia sección',
    unit: '—',
    ref: 'EC3 §6.1(1)',
    modules: ['steelBeams', 'steelColumns', 'compositeSection', 'empresillado'],
  },

  gamma_M1: {
    sym: 'γM1',
    descLong: 'Coeficiente parcial — resistencia al pandeo',
    descShort: 'Resistencia pandeo',
    unit: '—',
    ref: 'EC3 §6.1(1)',
    modules: ['steelColumns', 'empresillado'],
  },

  gamma_M_timber: {
    sym: 'γM',
    descLong: 'Coeficiente parcial del material (madera)',
    descShort: 'Parcial material madera',
    unit: '—',
    ref: 'EC5 §2.4.1 Tabla 2.3',
    modules: ['timberBeams', 'timberColumns'],
  },

  gamma_R_geo: {
    sym: 'γR',
    descLong: 'Coeficiente parcial de resistencia geotécnica',
    descShort: 'γR',
    unit: '—',
    ref: 'CTE DB-SE-C §2.3.3',
    modules: ['isolatedFooting'],
  },

  // -------------------------------------------------------------------------
  // Section 7 — Coefficients: timber (EC5)
  // -------------------------------------------------------------------------

  kmod: {
    sym: 'kmod',
    descLong: 'Factor de modificación por duración y clase de servicio',
    descShort: 'Duración y clase de servicio',
    unit: '—',
    ref: 'EC5 §3.1.3 Tabla 3.1',
    modules: ['timberBeams', 'timberColumns'],
  },

  kdef: {
    sym: 'kdef',
    descLong: 'Factor de deformación diferida',
    descShort: 'Deformación diferida',
    unit: '—',
    ref: 'EC5 §3.1.4 Tabla 3.2',
    modules: ['timberBeams'],
  },

  kh_sawn: {
    sym: 'kh',
    descLong: 'Factor de tamaño (madera aserrada)',
    descShort: 'Kh madera aserrada',
    unit: '—',
    ref: 'EC5 §3.2(3) eq. 3.1',
    modules: ['timberBeams', 'timberColumns'],
  },

  kh_glulam: {
    sym: 'kh',
    descLong: 'Factor de tamaño (madera laminada encolada)',
    descShort: 'Kh madera laminada',
    unit: '—',
    ref: 'EC5 §3.3(3) eq. 3.2',
    modules: ['timberBeams', 'timberColumns'],
  },

  kcr: {
    sym: 'kcr',
    descLong: 'Factor de área eficaz a cortante',
    descShort: 'Área eficaz cortante',
    unit: '—',
    ref: 'EC5 §6.1.7(2)',
    modules: ['timberBeams'],
  },

  ksys: {
    sym: 'ksys',
    descLong: 'Factor de sistema (láminas solidarias)',
    descShort: 'Sistema láminas solidarias',
    unit: '—',
    ref: 'EC5 §6.6',
    modules: ['timberBeams'],
  },

  kcrit: {
    sym: 'kcrit',
    descLong: 'Factor de vuelco lateral',
    descShort: 'Reducción por vuelco lateral',
    unit: '—',
    ref: 'EC5 §6.3.3',
    modules: ['timberBeams'],
  },

  kc_y: {
    sym: 'kc,y',
    descLong: 'Coeficiente de pandeo por compresión — eje y',
    descShort: 'Kc,y',
    unit: '—',
    ref: 'EC5 §6.3.2 eq. 6.25',
    modules: ['timberColumns'],
  },

  kc_z: {
    sym: 'kc,z',
    descLong: 'Coeficiente de pandeo por compresión — eje z',
    descShort: 'Kc,z',
    unit: '—',
    ref: 'EC5 §6.3.2 eq. 6.26',
    modules: ['timberColumns'],
  },

  lambda_rel: {
    sym: 'λrel',
    descLong: 'Esbeltez relativa',
    descShort: 'Esbeltez relativa',
    unit: '—',
    ref: 'EC5 §6.3.2 eq. 6.21',
    modules: ['timberBeams', 'timberColumns'],
  },

  // -------------------------------------------------------------------------
  // Section 8 — Coefficients: steel (EC3)
  // -------------------------------------------------------------------------

  chi_LT: {
    sym: 'χLT',
    descLong: 'Factor de reducción por pandeo lateral',
    descShort: 'Reducción vuelco',
    unit: '—',
    ref: 'EC3 §6.3.2.2 eq. 6.56',
    modules: ['steelBeams', 'steelColumns'],
  },

  chi_y: {
    sym: 'χy',
    descLong: 'Factor de reducción por pandeo por flexión — eje y',
    descShort: 'Reducción pandeo y',
    unit: '—',
    ref: 'EC3 §6.3.1.2 eq. 6.49',
    modules: ['steelColumns'],
  },

  chi_z: {
    sym: 'χz',
    descLong: 'Factor de reducción por pandeo por flexión — eje z',
    descShort: 'Reducción pandeo z',
    unit: '—',
    ref: 'EC3 §6.3.1.2 eq. 6.49',
    modules: ['steelColumns'],
  },

  lambda_bar_LT: {
    sym: 'λ̄LT',
    descLong: 'Esbeltez reducida — pandeo lateral',
    descShort: 'Esbeltez vuelco',
    unit: '—',
    ref: 'EC3 §6.3.2.2 eq. 6.56',
    modules: ['steelBeams', 'steelColumns'],
  },

  lambda_bar_y: {
    sym: 'λ̄y',
    descLong: 'Esbeltez reducida — eje y',
    descShort: 'Esbeltez eje y',
    unit: '—',
    ref: 'EC3 §6.3.1.3 eq. 6.50',
    modules: ['steelColumns'],
  },

  lambda_bar_z: {
    sym: 'λ̄z',
    descLong: 'Esbeltez reducida — eje z',
    descShort: 'Esbeltez eje z',
    unit: '—',
    ref: 'EC3 §6.3.1.3 eq. 6.50',
    modules: ['steelColumns'],
  },

  beta_buckling: {
    sym: 'β',
    descLong: 'Factor de longitud de pandeo',
    descShort: 'β pandeo',
    unit: '—',
    ref: 'CE art. 43.1.2 Tabla 43.1.2 / EC3 §6.3.1.3',
    modules: ['rcColumns', 'steelColumns', 'timberColumns', 'empresillado'],
  },

  beta_punching: {
    sym: 'β',
    descLong: 'Factor de excentricidad de carga',
    descShort: 'β excentricidad',
    unit: '—',
    ref: 'CE art. 46.3.2',
    modules: ['punching'],
  },

  Mcr: {
    sym: 'Mcr',
    descLong: 'Momento crítico elástico — pandeo lateral',
    descShort: 'Crítico elástico',
    unit: 'kNm',
    ref: 'EC3 §6.3.2.2 (anejo informativo)',
    modules: ['steelColumns'],
  },

  // -------------------------------------------------------------------------
  // Section 9 — Resistances
  // -------------------------------------------------------------------------

  MRd_rc: {
    sym: 'MRd',
    descLong: 'Momento resistente de la sección',
    descShort: 'Resistente sección',
    unit: 'kNm',
    ref: 'CE art. 42.1.2',
    modules: ['rcBeams'],
  },

  MRd_y: {
    sym: 'MRd,y',
    descLong: 'Momento resistente — eje y',
    descShort: 'Resistente eje y',
    unit: 'kNm',
    ref: 'EC3 §6.2.5 / CE art. 42.1.2',
    modules: ['rcColumns', 'steelColumns'],
  },

  MRd_z: {
    sym: 'MRd,z',
    descLong: 'Momento resistente — eje z',
    descShort: 'Resistente eje z',
    unit: 'kNm',
    ref: 'EC3 §6.2.5 / CE art. 42.1.2',
    modules: ['rcColumns', 'steelColumns'],
  },

  NRd_max: {
    sym: 'NRd,max',
    descLong: 'Axil resistente máximo',
    descShort: 'Axil máximo',
    unit: 'kN',
    ref: 'CE art. 42.1.2',
    modules: ['rcColumns'],
  },

  VRd_c: {
    sym: 'VRd,c',
    descLong: 'Cortante resistente sin armadura',
    descShort: 'Sin armadura',
    unit: 'kN',
    ref: 'CE art. 44.2.3.2.1',
    modules: ['rcBeams'],
  },

  VRd_s: {
    sym: 'VRd,s',
    descLong: 'Cortante resistente con cercos',
    descShort: 'Con cercos',
    unit: 'kN',
    ref: 'CE art. 44.2.3.2.2',
    modules: ['rcBeams'],
  },

  Mc_Rd: {
    sym: 'Mc,Rd',
    descLong: 'Momento resistente de la sección',
    descShort: 'Resistente sección',
    unit: 'kNm',
    ref: 'EC3 §6.2.5 eq. 6.12-6.14',
    modules: ['steelBeams'],
  },

  Vc_Rd: {
    sym: 'Vc,Rd',
    descLong: 'Cortante resistente de la sección',
    descShort: 'Resistente sección',
    unit: 'kN',
    ref: 'EC3 §6.2.6 eq. 6.17-6.18',
    modules: ['steelBeams'],
  },

  Mb_Rd: {
    sym: 'Mb,Rd',
    descLong: 'Momento resistente a vuelco lateral',
    descShort: 'Resistente vuelco',
    unit: 'kNm',
    ref: 'EC3 §6.3.2.1 eq. 6.54',
    modules: ['steelBeams', 'steelColumns'],
  },

  NRd_steel: {
    sym: 'NRd',
    descLong: 'Axil resistente de la sección',
    descShort: 'Resistente sección',
    unit: 'kN',
    ref: 'EC3 §6.2.4 eq. 6.10',
    modules: ['steelColumns'],
  },

  Nb_Rd_y: {
    sym: 'Nb,Rd,y',
    descLong: 'Axil resistente a pandeo — eje y',
    descShort: 'Pandeo eje y',
    unit: 'kN',
    ref: 'EC3 §6.3.1.1 eq. 6.46',
    modules: ['steelColumns', 'empresillado'],
  },

  Nb_Rd_z: {
    sym: 'Nb,Rd,z',
    descLong: 'Axil resistente a pandeo — eje z',
    descShort: 'Pandeo eje z',
    unit: 'kN',
    ref: 'EC3 §6.3.1.1 eq. 6.46',
    modules: ['steelColumns', 'empresillado'],
  },

  vRd_c_punching: {
    sym: 'vRd,c',
    descLong: 'Cortante resistente sin cercos',
    descShort: 'Sin cercos',
    unit: 'N/mm²',
    ref: 'CE art. 46.3.3',
    modules: ['punching', 'isolatedFooting'],
  },

  vRd_cs: {
    sym: 'vRd,cs',
    descLong: 'Cortante resistente con cercos',
    descShort: 'Con cercos',
    unit: 'N/mm²',
    ref: 'CE art. 46.3.4',
    modules: ['punching'],
  },

  vRd_max: {
    sym: 'vRd,max',
    descLong: 'Cortante resistente máximo en cara de pilar',
    descShort: 'Máximo cara pilar',
    unit: 'N/mm²',
    ref: 'CE art. 46.3.2',
    modules: ['punching'],
  },

  vEd_punching: {
    sym: 'vEd',
    descLong: 'Cortante de punzonamiento actuante',
    descShort: 'Punzonamiento actuante',
    unit: 'N/mm²',
    ref: 'CE art. 46.3.2',
    modules: ['punching', 'isolatedFooting'],
  },

  u1_perimeter: {
    sym: 'u1',
    descLong: 'Perímetro crítico',
    descShort: 'Crítico a 2d del pilar',
    unit: 'mm',
    ref: 'CE art. 46.3.2',
    modules: ['punching', 'isolatedFooting'],
  },

  // -------------------------------------------------------------------------
  // Section 10 — Rebar geometry
  // -------------------------------------------------------------------------

  bar_diameter: {
    sym: 'Ø',
    descLong: 'Diámetro de la barra',
    descShort: 'Ø',
    unit: 'mm',
    modules: [
      'rcBeams',
      'rcColumns',
      'isolatedFooting',
      'pileCap',
      'punching',
      'retainingWall',
    ],
  },

  // Per-context variants — overloading resolution per decision #8.
  bar_diameter_corner: {
    sym: 'Ø',
    descLong: 'Diámetro de la barra de esquina',
    descShort: 'Ø esquina',
    unit: 'mm',
    modules: ['rcColumns'],
  },

  bar_diameter_intermediate: {
    sym: 'Ø',
    descLong: 'Diámetro de la barra intermedia',
    descShort: 'Ø intermedia',
    unit: 'mm',
    modules: ['rcColumns'],
  },

  bar_diameter_stirrup: {
    sym: 'Ø',
    descLong: 'Diámetro del cerco',
    descShort: 'Ø cerco',
    unit: 'mm',
    modules: ['rcBeams', 'rcColumns', 'punching'],
  },

  bar_diameter_tie: {
    sym: 'Ø',
    descLong: 'Diámetro del tirante',
    descShort: 'Ø tirante',
    unit: 'mm',
    modules: ['pileCap'],
  },

  bar_diameter_x: {
    sym: 'Ø',
    descLong: 'Diámetro de la barra (dirección x)',
    descShort: 'Ø x',
    unit: 'mm',
    modules: ['isolatedFooting'],
  },

  bar_diameter_y: {
    sym: 'Ø',
    descLong: 'Diámetro de la barra (dirección y)',
    descShort: 'Ø y',
    unit: 'mm',
    modules: ['isolatedFooting'],
  },

  bar_diameter_top: {
    sym: 'Ø',
    descLong: 'Diámetro de la barra (cara superior)',
    descShort: 'Ø superior',
    unit: 'mm',
    modules: ['punching'],
  },

  bar_diameter_bottom: {
    sym: 'Ø',
    descLong: 'Diámetro de la barra (cara inferior)',
    descShort: 'Ø inferior',
    unit: 'mm',
    modules: ['punching'],
  },

  bar_spacing: {
    sym: 's',
    descLong: 'Separación entre barras',
    descShort: 'Separación',
    unit: 'mm',
    ref: 'CE art. 42.3.1 (separación máxima)',
    modules: [
      'rcBeams',
      'rcColumns',
      'isolatedFooting',
      'pileCap',
      'punching',
    ],
  },

  n_bars: {
    sym: 'n',
    descLong: 'Número de barras',
    descShort: 'Nº barras',
    unit: 'ud',
    modules: ['rcBeams', 'rcColumns'],
  },

  n_stirrup_legs: {
    sym: 'nr',
    descLong: 'Número de ramas del cerco',
    descShort: 'Nº ramas',
    unit: 'ud',
    modules: ['rcBeams', 'punching'],
  },

  As_total: {
    sym: 'As',
    descLong: 'Área total de armadura longitudinal',
    descShort: 'Total longitudinal',
    unit: 'mm²',
    ref: 'CE art. 42.3 (cuantía mínima)',
    modules: ['rcBeams', 'rcColumns'],
  },

  As_tension: {
    sym: 'As',
    descLong: 'Armadura de tracción',
    descShort: 'Tracción',
    unit: 'mm²',
    ref: 'CE art. 42.3.2',
    modules: ['rcBeams'],
  },

  As_compression: {
    sym: 'As,c',
    descLong: 'Armadura de compresión',
    descShort: 'Compresión',
    unit: 'mm²',
    ref: 'CE art. 42.3.3',
    modules: ['rcBeams'],
  },

  As_req_x: {
    sym: 'As,req,x',
    descLong: 'Armadura requerida — dirección x',
    descShort: 'Requerida x',
    unit: 'mm²/m',
    ref: 'CE art. 42.1.2 / art. 58.4.2',
    modules: ['isolatedFooting', 'pileCap'],
  },

  As_req_y: {
    sym: 'As,req,y',
    descLong: 'Armadura requerida — dirección y',
    descShort: 'Requerida y',
    unit: 'mm²/m',
    ref: 'CE art. 42.1.2 / art. 58.4.2',
    modules: ['isolatedFooting', 'pileCap'],
  },

  As_min_x: {
    sym: 'As,min,x',
    descLong: 'Armadura mínima geométrica — dirección x',
    descShort: 'Mínima x',
    unit: 'mm²/m',
    ref: 'CE art. 42.3.5',
    modules: ['isolatedFooting', 'pileCap'],
  },

  As_min_y: {
    sym: 'As,min,y',
    descLong: 'Armadura mínima geométrica — dirección y',
    descShort: 'Mínima y',
    unit: 'mm²/m',
    ref: 'CE art. 42.3.5',
    modules: ['isolatedFooting', 'pileCap'],
  },

  As_adopted_x: {
    sym: 'As,adoptado,x',
    descLong: 'Armadura adoptada — dirección x',
    descShort: 'Adoptada x',
    unit: 'mm²/m',
    modules: ['isolatedFooting', 'pileCap'],
  },

  As_adopted_y: {
    sym: 'As,adoptado,y',
    descLong: 'Armadura adoptada — dirección y',
    descShort: 'Adoptada y',
    unit: 'mm²/m',
    modules: ['isolatedFooting', 'pileCap'],
  },

  // -------------------------------------------------------------------------
  // Section 11 — Geotechnical (soils)
  // -------------------------------------------------------------------------

  phi_soil: {
    sym: 'φ',
    descLong: 'Ángulo de rozamiento interno del terreno',
    descShort: 'Rozamiento interno',
    unit: '°',
    ref: 'CTE DB-SE-C §4.3',
    modules: ['isolatedFooting', 'retainingWall'],
  },

  c_soil: {
    sym: 'c',
    descLong: 'Cohesión del terreno',
    descShort: 'Cohesión',
    unit: 'kPa',
    ref: 'CTE DB-SE-C §4.3',
    modules: ['isolatedFooting'],
  },

  gamma_soil: {
    sym: 'γs',
    descLong: 'Peso específico del terreno',
    descShort: 'Peso específico suelo',
    unit: 'kN/m³',
    ref: 'CTE DB-SE-C §4.3',
    modules: ['isolatedFooting', 'retainingWall'],
  },

  mu_base: {
    sym: 'μ',
    descLong: 'Coeficiente de rozamiento suelo-base',
    descShort: 'μ rozamiento',
    unit: '—',
    ref: 'CTE DB-SE-C §4.4.3',
    modules: ['isolatedFooting', 'retainingWall'],
  },

  delta_wall: {
    sym: 'δ',
    descLong: 'Ángulo de rozamiento muro-terreno',
    descShort: 'δ rozam. pared',
    unit: '°',
    ref: 'CTE DB-SE-C §7.3',
    modules: ['retainingWall'],
  },

  sigma_adm: {
    sym: 'σadm',
    descLong: 'Tensión admisible del terreno',
    descShort: 'Admisible terreno',
    unit: 'kPa',
    ref: 'CTE DB-SE-C §4.3 / §4.3.1',
    modules: ['isolatedFooting', 'retainingWall'],
  },

  sigma_max: {
    sym: 'σmax',
    descLong: 'Tensión máxima en base',
    descShort: 'Máxima base',
    unit: 'kPa',
    ref: 'CTE DB-SE-C §4.4 (Meyerhof)',
    modules: ['isolatedFooting', 'retainingWall'],
  },

  sigma_min: {
    sym: 'σmin',
    descLong: 'Tensión mínima en base',
    descShort: 'Mínima base',
    unit: 'kPa',
    ref: 'CTE DB-SE-C §4.4 (Meyerhof)',
    modules: ['isolatedFooting', 'retainingWall'],
  },

  N_SPT: {
    sym: 'NSPT',
    descLong: 'Valor SPT representativo',
    descShort: 'NSPT',
    unit: '—',
    ref: 'CTE DB-SE-C §3.5',
    modules: ['isolatedFooting'],
  },

  // -------------------------------------------------------------------------
  // Section 12 — Seismic (NCSP-07)
  // -------------------------------------------------------------------------

  Ab_accel: {
    sym: 'Ab',
    descLong: 'Aceleración sísmica básica',
    descShort: 'Aceleración básica',
    unit: 'g',
    ref: 'NCSP-07 §2',
    modules: ['retainingWall'],
  },

  S_site: {
    sym: 'S',
    descLong: 'Coeficiente de amplificación del suelo',
    descShort: 'Amplificación suelo',
    unit: '—',
    ref: 'NCSP-07 §2.2',
    modules: ['retainingWall'],
  },

  kh_seismic: {
    sym: 'kh',
    descLong: 'Coeficiente sísmico horizontal',
    descShort: 'Sísmico horizontal',
    unit: '—',
    ref: 'NCSP-07 §4.2',
    modules: ['retainingWall'],
  },

  kv_seismic: {
    sym: 'kv',
    descLong: 'Coeficiente sísmico vertical',
    descShort: 'Sísmico vertical',
    unit: '—',
    ref: 'NCSP-07 §4.2',
    modules: ['retainingWall'],
  },

  K_AE: {
    sym: 'KAE',
    descLong: 'Coeficiente de empuje activo sísmico (Mononobe-Okabe)',
    descShort: 'Mononobe-Okabe',
    unit: '—',
    ref: 'NCSP-07 Anejo A',
    modules: ['retainingWall'],
  },

  Ka_coulomb: {
    sym: 'Ka',
    descLong: 'Coeficiente de empuje activo (Coulomb)',
    descShort: 'Coulomb',
    unit: '—',
    ref: 'CTE DB-SE-C §7.3',
    modules: ['retainingWall'],
  },

  // -------------------------------------------------------------------------
  // Section 13 — Serviceability
  // -------------------------------------------------------------------------

  wk: {
    sym: 'wk',
    descLong: 'Abertura característica de fisura',
    descShort: 'Abertura fisura',
    unit: 'mm',
    ref: 'CE art. 49.2.4 eq. 49.2.3.b',
    modules: ['rcBeams'],
  },

  delta_max: {
    sym: 'δmax',
    descLong: 'Flecha máxima',
    descShort: 'Flecha máxima',
    unit: 'mm',
    ref: 'CE art. 50 / EC3 §7.2.1',
    modules: ['steelBeams'],
  },

  delta_adm: {
    sym: 'δadm',
    descLong: 'Flecha admisible',
    descShort: 'Admisible (L/n)',
    unit: 'mm',
    ref: 'CTE DB-SE §4.3.3',
    modules: ['steelBeams'],
  },

  u_inst: {
    sym: 'uinst',
    descLong: 'Flecha instantánea',
    descShort: 'Flecha instantánea',
    unit: 'mm',
    ref: 'EC5 §7.2',
    modules: ['timberBeams'],
  },

  u_fin: {
    sym: 'ufin',
    descLong: 'Flecha final (incluye fluencia)',
    descShort: 'Flecha final (con fluencia)',
    unit: 'mm',
    ref: 'EC5 §7.2 eq. 7.2',
    modules: ['timberBeams'],
  },

  u_active: {
    sym: 'uactiva',
    descLong: 'Flecha activa',
    descShort: 'Flecha activa',
    unit: 'mm',
    ref: 'EC5 §7.2',
    modules: ['timberBeams'],
  },

  // -------------------------------------------------------------------------
  // Section 14 — Fire (EC5 §4)
  // -------------------------------------------------------------------------

  fireResistance: {
    sym: '',
    descLong: 'Resistencia al fuego',
    descShort: 'R (min)',
    unit: 'min',
    ref: 'CTE DB-SI §6 / EC5 §4.2',
    modules: ['timberBeams', 'timberColumns'],
  },

  exposedFaces: {
    sym: '',
    descLong: 'Caras expuestas',
    descShort: 'Caras expuestas',
    unit: '—',
    ref: 'EC5 §4.2.2',
    modules: ['timberBeams', 'timberColumns'],
  },

  beta_n: {
    sym: 'βn',
    descLong: 'Velocidad de carbonización nominal',
    descShort: 'Velocidad carbonización',
    unit: 'mm/min',
    ref: 'EC5 §4.2.2 Tabla 3.1',
    modules: ['timberBeams', 'timberColumns'],
  },

  dchar: {
    sym: 'dchar',
    descLong: 'Profundidad carbonizada',
    descShort: 'Dchar = βn·t',
    unit: 'mm',
    ref: 'EC5 §4.2.2 eq. 4.1',
    modules: ['timberBeams', 'timberColumns'],
  },

  d0_zeroStrength: {
    sym: 'd0',
    descLong: 'Capa de resistencia nula',
    descShort: 'Capa de resistencia nula',
    unit: 'mm',
    ref: 'EC5 §4.2.2',
    modules: ['timberBeams', 'timberColumns'],
  },

  def_penetration: {
    sym: 'def',
    descLong: 'Penetración eficaz del fuego',
    descShort: 'Def = dchar + d0',
    unit: 'mm',
    ref: 'EC5 §4.2.2 eq. 4.2',
    modules: ['timberBeams', 'timberColumns'],
  },

  b_ef_fire: {
    sym: 'b_ef',
    descLong: 'Ancho residual tras el fuego',
    descShort: 'Ancho residual',
    unit: 'mm',
    ref: 'EC5 §4.2.2',
    modules: ['timberBeams', 'timberColumns'],
  },

  h_ef_fire: {
    sym: 'h_ef',
    descLong: 'Canto residual tras el fuego',
    descShort: 'Canto residual',
    unit: 'mm',
    ref: 'EC5 §4.2.2',
    modules: ['timberBeams', 'timberColumns'],
  },

  eta_fi: {
    sym: 'ηfi',
    descLong: 'Factor de reducción de carga en incendio',
    descShort: 'ηfi',
    unit: '—',
    ref: 'EC5 §2.4.2 eq. 2.8',
    modules: ['timberColumns'],
  },
} as const satisfies Record<string, Label>;

export type LabelKey = keyof typeof LABELS;

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/**
 * Input field label — `{descLong} ({sym}) — {unit}`.
 * If the symbol is empty (dropdowns) the parenthesised symbol is dropped.
 */
export function inputLabel(key: LabelKey): string {
  const l = LABELS[key];
  const symPart = l.sym ? ` (${l.sym})` : '';
  const unitPart = l.unit && l.unit !== '—' ? ` — ${l.unit}` : '';
  return `${l.descLong}${symPart}${unitPart}`;
}

/**
 * Result row label — `{sym} — {descShort}  ({ref})`.
 * If there is no `ref`, the parenthesised reference is dropped.
 */
export function resultLabel(key: LabelKey): string {
  const l = LABELS[key];
  const head = l.sym ? `${l.sym} — ${l.descShort}` : l.descShort;
  return 'ref' in l && l.ref ? `${head}  (${l.ref})` : head;
}

/**
 * Rebar schedule format — `Ø{d} c/{s} ({As} mm²/m)`.
 * Single format for isolatedFooting, pileCap, retainingWall.
 */
export function formatRebarSchedule(
  diameter_mm: number,
  spacing_mm: number,
  As_mm2_per_m: number,
): string {
  return `Ø${diameter_mm} c/${spacing_mm} (${Math.round(As_mm2_per_m)} mm²/m)`;
}
