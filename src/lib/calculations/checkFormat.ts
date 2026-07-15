// Check formatting helpers shared by every calculation module.
//
// Extracted from src/components/checks/index.tsx so they can be used outside
// React (PDF export, AI assistant). They depend only on CheckRow/CheckStatus
// and lib/units — no React. components/checks re-exports them, so existing
// consumers keep importing from there unchanged.

import { type CheckRow, type CheckStatus } from './types';
import { formatQuantity } from '../units/format';
import type { UnitSystem } from '../units/types';

/**
 * Resolve a CheckRow's display value — prefers the numeric path (valueNum +
 * valueQty) for system-aware formatting, falling back to the legacy
 * `value`/`limit` strings. Pass `system` from the active unit system; callers
 * in a non-React context (PDF export) can pass 'si' until migrated.
 */
export function checkValueStr(c: CheckRow, system: UnitSystem = 'si'): string {
  if (c.valueNum !== undefined && c.valueQty) {
    return formatQuantity(c.valueNum, c.valueQty, system);
  }
  return c.valueStr ?? c.value ?? '';
}

export function checkLimitStr(c: CheckRow, system: UnitSystem = 'si'): string {
  if (c.limitNum !== undefined && c.limitQty) {
    return formatQuantity(c.limitNum, c.limitQty, system);
  }
  return c.limitStr ?? c.limit ?? '';
}

export function overallStatus(checks: CheckRow[]): Exclude<CheckStatus, 'neutral'> {
  const active = checks.filter((c) => c.status !== 'neutral');
  if (active.some((c) => c.status === 'fail')) return 'fail';
  if (active.some((c) => c.status === 'warn')) return 'warn';
  return 'ok';
}
