// FEM 1D — LC-combinations shim.
//
// The implementation moved to the shared frame-core (Lane B extraction,
// eng-review D12). This re-export keeps every existing 1D import path
// working unchanged — pure refactor, zero behavior change.

export * from '../../lib/frame-core/lcCombinations';
