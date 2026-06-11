// CE partial safety factors and material coefficients
export const GAMMA_C = 1.5;   // concrete
export const GAMMA_S = 1.15;  // steel reinforcement
export const GAMMA_M0 = 1.05; // steel sections
export const GAMMA_M1 = 1.05; // steel sections (stability)
export const ALPHA_CC = 1.0;  // long-term concrete strength coefficient (CE art. 39.4)

// Derived design values helper
export const fcd = (fck: number) => (ALPHA_CC * fck) / GAMMA_C;
export const fyd = (fyk: number) => fyk / GAMMA_S;

// Límite de abertura de fisura wk por clase de exposición
// (CE Anejo 19 Tabla 7.1N / EC2 Tabla 7.1N, combinación cuasipermanente).
// XC2-XC4 → 0.3 mm; el 0.2 corresponde a clases con cloruros (XD/XS).
export const wkMax: Record<string, number> = {
  XC1: 0.4,
  XC2: 0.3,
  XC3: 0.3,
  XC4: 0.3,
};
