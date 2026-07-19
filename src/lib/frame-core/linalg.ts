// frame-core — dense linear algebra for the bar solvers (Lane B, D12)
//
// Moved VERBATIM from features/fem-analysis/femSolver.ts (they were private
// there; exported here so both the 1D beam solver and the 2D frame solver
// share one implementation). Behavior is identical — the full 1D test suite
// is the regression net for this move.

/**
 * Gauss elimination with partial pivoting + singularity guard. Solves K·x = b.
 * Throws if any pivot magnitude falls below pivotEps · max|K_diag_initial|.
 */
export function gaussSolve(K: number[][], b: number[], pivotEps: number): number[] {
  const N = K.length;
  // Copy to avoid mutating caller's matrix.
  const A: number[][] = K.map((row) => row.slice());
  const x: number[] = b.slice();

  // Initial scale for singularity tolerance.
  let maxDiag = 0;
  for (let i = 0; i < N; i++) maxDiag = Math.max(maxDiag, Math.abs(A[i][i]));
  const tol = pivotEps * Math.max(1, maxDiag);

  for (let k = 0; k < N; k++) {
    // Partial pivot: find row r ≥ k with max |A[r][k]|.
    let maxAbs = Math.abs(A[k][k]);
    let pivotRow = k;
    for (let r = k + 1; r < N; r++) {
      if (Math.abs(A[r][k]) > maxAbs) {
        maxAbs = Math.abs(A[r][k]);
        pivotRow = r;
      }
    }
    if (maxAbs < tol) {
      throw new Error(
        `Pivot below tolerance at row ${k}: |pivot|=${maxAbs.toExponential(3)} < ${tol.toExponential(3)} (matrix singular or ill-conditioned)`,
      );
    }
    if (pivotRow !== k) {
      [A[k], A[pivotRow]] = [A[pivotRow], A[k]];
      [x[k], x[pivotRow]] = [x[pivotRow], x[k]];
    }
    // Eliminate.
    const pivot = A[k][k];
    for (let r = k + 1; r < N; r++) {
      const factor = A[r][k] / pivot;
      if (factor === 0) continue;
      for (let c = k; c < N; c++) A[r][c] -= factor * A[k][c];
      x[r] -= factor * x[k];
    }
  }

  // Back substitution.
  const out = new Array<number>(N).fill(0);
  for (let i = N - 1; i >= 0; i--) {
    let s = x[i];
    for (let j = i + 1; j < N; j++) s -= A[i][j] * out[j];
    out[i] = s / A[i][i];
  }
  return out;
}

export function subMatrix(K: number[][], rows: number[], cols: number[]): number[][] {
  const M: number[][] = [];
  for (const r of rows) {
    const row: number[] = [];
    for (const c of cols) row.push(K[r][c]);
    M.push(row);
  }
  return M;
}

export function matrixRowDot(row: number[], u: number[]): number {
  let s = 0;
  for (let i = 0; i < row.length; i++) s += row[i] * u[i];
  return s;
}
