// CE Table 39.1 — Concrete properties
export interface ConcreteGrade {
  fck: number;   // MPa
  fcd: number;   // MPa (αcc·fck/γc, αcc=1.0, γc=1.5)
  fctm: number;  // MPa mean tensile strength
  Ecm: number;   // GPa  secant modulus
}

// fctm = 0.30 * fck^(2/3) for fck <= 50 MPa
// fctm = 2.12 * ln(1 + (fcm/10)) for fck > 50 MPa, fcm = fck + 8
// Ecm = 22000 * ((fck+8)/10)^0.3  MPa → stored as GPa
const concrete: ConcreteGrade[] = [
  { fck: 12, fcd: 8.0,  fctm: 1.57, Ecm: 27.1 },
  { fck: 16, fcd: 10.7, fctm: 1.90, Ecm: 29.0 },
  { fck: 20, fcd: 13.3, fctm: 2.21, Ecm: 30.0 },
  { fck: 25, fcd: 16.7, fctm: 2.56, Ecm: 31.5 },
  { fck: 30, fcd: 20.0, fctm: 2.90, Ecm: 32.8 },
  { fck: 35, fcd: 23.3, fctm: 3.21, Ecm: 34.1 },
  { fck: 40, fcd: 26.7, fctm: 3.51, Ecm: 35.2 },
  { fck: 45, fcd: 30.0, fctm: 3.80, Ecm: 36.3 },
  { fck: 50, fcd: 33.3, fctm: 4.07, Ecm: 37.3 },
];

export const availableFck = concrete.map((c) => c.fck);

export function getConcrete(fck: number): ConcreteGrade {
  const found = concrete.find((c) => c.fck === fck);
  if (found) return found;
  // Interpolate for non-standard values
  const fctm = fck <= 50
    ? 0.3 * Math.pow(fck, 2 / 3)
    : 2.12 * Math.log(1 + (fck + 8) / 10);
  const Ecm = (22000 * Math.pow((fck + 8) / 10, 0.3)) / 1000; // GPa
  return { fck, fcd: fck / 1.5, fctm, Ecm };
}

// Steel reinforcement
export const Es = 200000; // MPa (200 GPa)
export const availableFyk = [400, 500, 600];

export function getFyd(fyk: number): number {
  return fyk / 1.15;
}
