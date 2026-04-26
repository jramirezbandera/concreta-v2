// Unit catalog and engineering formula snippets for the global calculator.
// Conversion factors are SI ratios: value_in_SI = value_in_unit * factor.

export type UnitGroupKey =
  | 'longitud'
  | 'fuerza'
  | 'momento'
  | 'tension'
  | 'area'
  | 'inercia'
  | 'carga_l'
  | 'carga_a';

export interface UnitGroup {
  label: string;
  units: Record<string, number>;
}

export const UNIT_GROUPS: Record<UnitGroupKey, UnitGroup> = {
  longitud: {
    label: 'Longitud',
    units: { mm: 0.001, cm: 0.01, m: 1, km: 1000, in: 0.0254, ft: 0.3048 },
  },
  fuerza: {
    label: 'Fuerza',
    units: { N: 1, kN: 1000, MN: 1e6, kp: 9.80665, t: 9806.65, lbf: 4.4482216 },
  },
  momento: {
    label: 'Momento',
    units: { 'N·m': 1, 'kN·m': 1000, 'kN·cm': 10, 'kp·m': 9.80665, 'lbf·ft': 1.355818 },
  },
  tension: {
    label: 'Tensión / presión',
    units: {
      Pa: 1, kPa: 1000, MPa: 1e6, GPa: 1e9,
      'N/mm²': 1e6, 'kN/m²': 1000, 'kg/cm²': 98066.5, psi: 6894.76, ksi: 6.89476e6,
    },
  },
  area: {
    label: 'Área',
    units: { 'mm²': 1e-6, 'cm²': 1e-4, 'm²': 1, 'in²': 6.4516e-4, 'ft²': 0.092903 },
  },
  inercia: {
    label: 'Inercia',
    units: { 'mm⁴': 1e-12, 'cm⁴': 1e-8, 'm⁴': 1, 'in⁴': 4.16231e-7 },
  },
  carga_l: {
    label: 'Carga lineal',
    units: { 'N/m': 1, 'kN/m': 1000, 'kp/m': 9.80665 },
  },
  carga_a: {
    label: 'Carga superficial',
    units: { 'N/m²': 1, 'kN/m²': 1000, 'kg/m²': 9.80665, 'kp/m²': 9.80665 },
  },
};

export interface FormulaInput {
  k: string;
  label: string;
  def: number;
  unit: string;
}

export interface Formula {
  id: string;
  label: string;
  desc: string;
  inputs: FormulaInput[];
  out: string;
  calc: (vals: Record<string, number>) => number;
}

export const FORMULAS: Formula[] = [
  {
    id: 'as_bars',
    label: 'As — n·π·Ø²/4',
    desc: 'Área de armadura longitudinal',
    inputs: [
      { k: 'n', label: 'nº barras', def: 4, unit: '' },
      { k: 'd', label: 'Ø', def: 16, unit: 'mm' },
    ],
    out: 'mm²',
    calc: ({ n, d }) => (n * Math.PI * d * d) / 4,
  },
  {
    id: 'as_per_m',
    label: 'As/m — Ø/sep (losa)',
    desc: 'Área de armadura por metro de banda — útil en losas y muros (n·π·Ø²/4 por banda de 1 m con separación s).',
    inputs: [
      { k: 'd', label: 'Ø', def: 12, unit: 'mm' },
      { k: 's', label: 'separación s', def: 150, unit: 'mm' },
    ],
    out: 'mm²/m',
    calc: ({ d, s }) => ((1000 / s) * Math.PI * d * d) / 4,
  },
  {
    id: 'm_udl',
    label: 'M — q·L²/8',
    desc: 'Momento máximo, viga simplemente apoyada UDL',
    inputs: [
      { k: 'q', label: 'q', def: 25, unit: 'kN/m' },
      { k: 'L', label: 'L', def: 6, unit: 'm' },
    ],
    out: 'kN·m',
    calc: ({ q, L }) => (q * L * L) / 8,
  },
  {
    id: 'v_udl',
    label: 'V — q·L/2',
    desc: 'Cortante máximo, viga simplemente apoyada UDL',
    inputs: [
      { k: 'q', label: 'q', def: 25, unit: 'kN/m' },
      { k: 'L', label: 'L', def: 6, unit: 'm' },
    ],
    out: 'kN',
    calc: ({ q, L }) => (q * L) / 2,
  },
  {
    id: 'm_emp',
    label: 'M — q·L²/12 (empotrada)',
    desc: 'Momento de empotramiento, biempotrada UDL',
    inputs: [
      { k: 'q', label: 'q', def: 25, unit: 'kN/m' },
      { k: 'L', label: 'L', def: 6, unit: 'm' },
    ],
    out: 'kN·m',
    calc: ({ q, L }) => (q * L * L) / 12,
  },
  {
    id: 'i_rect',
    label: 'I — b·h³/12',
    desc: 'Inercia rectángulo respecto a eje fuerte',
    inputs: [
      { k: 'b', label: 'b', def: 300, unit: 'mm' },
      { k: 'h', label: 'h', def: 500, unit: 'mm' },
    ],
    out: 'mm⁴',
    calc: ({ b, h }) => (b * h * h * h) / 12,
  },
  {
    id: 'w_rect',
    label: 'W — b·h²/6',
    desc: 'Módulo resistente rectángulo',
    inputs: [
      { k: 'b', label: 'b', def: 300, unit: 'mm' },
      { k: 'h', label: 'h', def: 500, unit: 'mm' },
    ],
    out: 'mm³',
    calc: ({ b, h }) => (b * h * h) / 6,
  },
  {
    id: 'fcd',
    label: 'fcd — fck/γc',
    desc: 'Resistencia de cálculo del hormigón',
    inputs: [
      { k: 'fck', label: 'fck', def: 25, unit: 'MPa' },
      { k: 'gc', label: 'γc', def: 1.5, unit: '' },
    ],
    out: 'MPa',
    calc: ({ fck, gc }) => fck / gc,
  },
  {
    id: 'fyd',
    label: 'fyd — fyk/γs',
    desc: 'Resistencia de cálculo del acero',
    inputs: [
      { k: 'fyk', label: 'fyk', def: 500, unit: 'MPa' },
      { k: 'gs', label: 'γs', def: 1.15, unit: '' },
    ],
    out: 'MPa',
    calc: ({ fyk, gs }) => fyk / gs,
  },
  {
    id: 'def_udl',
    label: 'δ — 5qL⁴/(384EI)',
    desc: 'Flecha viga simplemente apoyada UDL',
    inputs: [
      { k: 'q', label: 'q', def: 10, unit: 'kN/m' },
      { k: 'L', label: 'L', def: 6, unit: 'm' },
      { k: 'E', label: 'E', def: 210, unit: 'GPa' },
      { k: 'I', label: 'I', def: 8360, unit: 'cm⁴' },
    ],
    out: 'mm',
    calc: ({ q, L, E, I }) =>
      (5 * (q * 1000) * Math.pow(L, 4)) / (384 * (E * 1e9) * (I * 1e-8)) * 1000,
  },
];
