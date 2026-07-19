// FEM 2D — mock-solver quarantine (Lane A, eng-review hard rule)
//
// The legacy fem-analysis/solver.ts is a MOCK ("NOT a real FEM solver") that
// FABRICATES plausible frame/truss numbers per preset. If it ever leaked into
// the 2D path, the app could export a plausible-looking but WRONG design PDF.
// This test bans any import of that module from anywhere under features/fem2d
// — the 2D module may only ever route through a real solver.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const FEM2D_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../features/fem2d',
);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

describe('mock solver quarantine', () => {
  it('fem2d exists and has source files (guard against vacuous pass)', () => {
    expect(walk(FEM2D_DIR).length).toBeGreaterThanOrEqual(3);
  });

  it('no file under features/fem2d imports fem-analysis/solver (the mock)', () => {
    const offenders: string[] = [];
    for (const file of walk(FEM2D_DIR)) {
      const src = readFileSync(file, 'utf8');
      // Any module specifier ending in fem-analysis/solver (with or without
      // extension) is banned — solveModel and etaColor live only there.
      if (/from\s+['"][^'"]*fem-analysis\/solver(\.ts)?['"]/.test(src)) {
        offenders.push(path.relative(FEM2D_DIR, file));
      }
    }
    expect(offenders).toEqual([]);
  });

  it('architectural lint: fem2d imports NOTHING from fem-analysis (share via frame-core)', () => {
    // Since the Lane B frame-core extraction, anything both modules need lives
    // in src/lib/frame-core. A new fem-analysis import here means a shared
    // concern that must be extracted first — move it, then import it.
    const offenders: string[] = [];
    for (const file of walk(FEM2D_DIR)) {
      const src = readFileSync(file, 'utf8');
      if (/from\s+['"][^'"]*fem-analysis\//.test(src)) {
        offenders.push(path.relative(FEM2D_DIR, file));
      }
    }
    expect(offenders).toEqual([]);
  });
});
