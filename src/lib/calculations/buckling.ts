// Pandeo por flexión — helpers EC3/CE compartidos entre módulos de acero
// (pilares, sección compuesta…). Extraído de steelColumns.ts para reutilizarlo
// sin duplicar la fórmula de la Tabla 6.1.

/** Factores de imperfección α de las curvas de pandeo (EC3 §6.3.1.2 Tabla 6.2). */
export const BUCKLING_ALPHA = {
  a0: 0.13,
  a: 0.21,
  b: 0.34,
  c: 0.49,
  d: 0.76,
} as const;

/** Buckling reduction factor χ from EC3 Table 6.1. */
export function bucklingChi(lambda_bar: number, alpha: number): number {
  if (lambda_bar <= 0.2) return 1.0;
  const phi = 0.5 * (1 + alpha * (lambda_bar - 0.2) + lambda_bar * lambda_bar);
  return Math.min(1.0, 1 / (phi + Math.sqrt(Math.max(0, phi * phi - lambda_bar * lambda_bar))));
}
