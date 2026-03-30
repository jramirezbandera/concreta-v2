import { type ColumnBCType } from '../../data/defaults';

/** Effective length factors for standard boundary conditions (EC3 / CTE DB-SE-A). */
const BC_BETA: Record<Exclude<ColumnBCType, 'custom'>, { beta_y: number; beta_z: number }> = {
  pp: { beta_y: 1.0, beta_z: 1.0 }, // articulado–articulado
  pf: { beta_y: 0.7, beta_z: 0.7 }, // articulado–empotrado
  ff: { beta_y: 0.5, beta_z: 0.5 }, // empotrado–empotrado
  fc: { beta_y: 2.0, beta_z: 2.0 }, // empotrado–libre (ménsula)
};

export function getBetaForBCType(
  bcType: ColumnBCType,
  beta_y_custom: number,
  beta_z_custom: number,
): { beta_y: number; beta_z: number } {
  if (bcType === 'custom') return { beta_y: beta_y_custom, beta_z: beta_z_custom };
  return BC_BETA[bcType];
}
