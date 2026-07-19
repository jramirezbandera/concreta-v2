// FEM 2D — MemberCheck → CheckRow mapping (shared, non-component).
//
// Lives apart from Fem2DResults.tsx so BOTH the results panel and the detail
// sheet (Fem2DMemberDetail) map a bar's checks with the EXACT same function —
// fila and ficha can never disagree — without tripping react-refresh's
// "component files only export components" rule.

import { toStatus, type CheckRow, type CheckStatus } from '../../lib/calculations/types';
import type { MemberCheck, MemberStatus } from './checks';

export const memberStatusToCheck = (s: MemberStatus): CheckStatus => (s === 'pending' ? 'neutral' : s);

/** MemberCheck → CheckRow. Pending members render as neutral (info) rows; an
 *  info row inside a real member (η=0, no article) also stays neutral. An
 *  explicit row status (engine-declared, e.g. an N/A fail with η inexpresable)
 *  wins over the eta derivation. */
export function toCheckRow(c: MemberCheck, memberStatus: MemberStatus): CheckRow {
  const neutral = memberStatus === 'pending' || (c.status === undefined && c.eta === 0 && c.ref === '');
  return {
    id: c.id,
    description: c.name,
    valueStr: c.val,
    utilization: c.eta,
    status: neutral ? 'neutral' : (c.status ?? toStatus(c.eta)),
    article: c.ref,
  };
}
