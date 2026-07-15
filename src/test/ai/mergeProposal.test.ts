// Tests de mergeProposalPayloads (acumulación de propuestas no aplicadas):
//   - Conflicto: incoming gana (L_m 9 sobre 8); false/0 entrantes también
//     ganan (solo null/undefined ceden).
//   - Arrastre: claves pendientes no contradichas (null/undefined entrantes
//     o ausentes) se conservan; claves nuevas del incoming se añaden.
//   - warnings: unión pendientes-primero, filtrada a strings, sin duplicados.
//   - Caminos "tal cual": incoming no-objeto (string/null/array) se devuelve
//     idéntico (preserva el camino de error de buildPlan); pending no-objeto
//     o array → incoming idéntico.
//   - No-mutación: ninguno de los dos payloads cambia (JSON.stringify
//     antes/después) y el resultado es SIEMPRE un objeto nuevo.
// Función pura: sin mocks.

import { describe, it, expect } from 'vitest';
import { mergeProposalPayloads } from '../../lib/ai/mergeProposal';

describe('mergeProposalPayloads — reglas por clave', () => {
  it('en conflicto gana el valor entrante', () => {
    expect(mergeProposalPayloads({ L_m: 8 }, { L_m: 9 })).toEqual({ L_m: 9 });
  });

  it('arrastra las claves pendientes no contradichas y añade las nuevas', () => {
    expect(
      mergeProposalPayloads({ L_m: 8, tipo: 'HEB' }, { size: 200, L_m: null }),
    ).toEqual({ L_m: 8, tipo: 'HEB', size: 200 });
  });

  it('null y undefined entrantes NO machacan el valor pendiente', () => {
    expect(
      mergeProposalPayloads(
        { L_m: 8, tipo: 'HEB', steel: 'S275' },
        { L_m: null, tipo: undefined, steel: 'S355' },
      ),
    ).toEqual({ L_m: 8, tipo: 'HEB', steel: 'S355' });
  });

  it('false y 0 entrantes SÍ ganan (solo null/undefined ceden)', () => {
    expect(
      mergeProposalPayloads({ conectada: true, N_kN: 120 }, { conectada: false, N_kN: 0 }),
    ).toEqual({ conectada: false, N_kN: 0 });
  });

  it('una clave solo presente en incoming con null se conserva tal cual', () => {
    expect(mergeProposalPayloads({ L_m: 8 }, { Lcr_m: null })).toEqual({ L_m: 8, Lcr_m: null });
  });
});

describe('mergeProposalPayloads — warnings', () => {
  it('une ambos arrays en orden (pendientes primero) y deduplica', () => {
    expect(
      mergeProposalPayloads(
        { warnings: ['a', 'b'] },
        { warnings: ['b', 'c'] },
      ),
    ).toEqual({ warnings: ['a', 'b', 'c'] });
  });

  it('filtra a strings y tolera warnings no-array en cualquiera de los dos', () => {
    expect(
      mergeProposalPayloads(
        { warnings: ['a', 42, 'b'] },
        { warnings: null },
      ),
    ).toEqual({ warnings: ['a', 'b'] });
    expect(
      mergeProposalPayloads({ warnings: 'no-array' }, { warnings: ['x'] })).toEqual({
      warnings: ['x'],
    });
  });

  it('no inventa la clave warnings si ninguno de los dos la trae', () => {
    const merged = mergeProposalPayloads({ L_m: 8 }, { size: 200 });
    expect(merged).toEqual({ L_m: 8, size: 200 });
    expect('warnings' in (merged as Record<string, unknown>)).toBe(false);
  });
});

describe('mergeProposalPayloads — caminos "tal cual"', () => {
  it('incoming no-objeto (string/null/array) se devuelve idéntico', () => {
    expect(mergeProposalPayloads({ L_m: 8 }, 'texto')).toBe('texto');
    expect(mergeProposalPayloads({ L_m: 8 }, null)).toBe(null);
    const arr = [1, 2];
    expect(mergeProposalPayloads({ L_m: 8 }, arr)).toBe(arr);
  });

  it('pending no-objeto o array → incoming idéntico', () => {
    const incoming = { L_m: 9 };
    expect(mergeProposalPayloads('texto', incoming)).toBe(incoming);
    expect(mergeProposalPayloads(null, incoming)).toBe(incoming);
    expect(mergeProposalPayloads(undefined, incoming)).toBe(incoming);
    expect(mergeProposalPayloads([1, 2], incoming)).toBe(incoming);
  });
});

describe('mergeProposalPayloads — no-mutación y frescura', () => {
  it('no muta ninguno de los dos payloads', () => {
    const pending = { L_m: 8, tipo: 'HEB', warnings: ['a'] };
    const incoming = { L_m: null, size: 200, warnings: ['b'] };
    const pendingBefore = JSON.stringify(pending);
    const incomingBefore = JSON.stringify(incoming);
    mergeProposalPayloads(pending, incoming);
    expect(JSON.stringify(pending)).toBe(pendingBefore);
    expect(JSON.stringify(incoming)).toBe(incomingBefore);
  });

  it('devuelve siempre un objeto nuevo al fusionar', () => {
    const pending = { L_m: 8 };
    const incoming = { L_m: 9 };
    const merged = mergeProposalPayloads(pending, incoming);
    expect(merged).not.toBe(pending);
    expect(merged).not.toBe(incoming);
  });
});

// ── Arrays en el payload (ola 3): valor ATÓMICO, jamás merge profundo ─────────
// Los payloads de ola 3 llevan arrays de objetos (plates/strata/loads/soil)
// con semántica de REEMPLAZO completo: en la fusión de propuestas pendientes
// un array entrante no-null pisa al pendiente ENTERO (no se combinan
// elementos), y null/undefined entrantes arrastran el pendiente tal cual.

describe('mergeProposalPayloads — arrays de objetos como valor atómico', () => {
  const pendingStrata = [
    { type: 'cohesive', thickness_m: 20, c_kPa: 10 },
    { type: 'granular', thickness_m: 5, c_kPa: 0 },
  ];

  it('array entrante no-null reemplaza al pendiente ENTERO (sin fusión de elementos)', () => {
    const incoming = [{ type: 'granular', thickness_m: 8, c_kPa: 0 }];
    const merged = mergeProposalPayloads(
      { strata: pendingStrata, height_m: 5 },
      { strata: incoming, height_m: null },
    ) as Record<string, unknown>;
    expect(merged.strata).toBe(incoming);      // el MISMO array, no una mezcla
    expect(merged.height_m).toBe(5);           // el escalar pendiente se arrastra
  });

  it('array entrante null/undefined conserva el pendiente tal cual', () => {
    const mergedNull = mergeProposalPayloads(
      { strata: pendingStrata },
      { strata: null, angle_deg: 30 },
    ) as Record<string, unknown>;
    expect(mergedNull.strata).toBe(pendingStrata);
    expect(mergedNull.angle_deg).toBe(30);
  });

  it('array VACÍO entrante también gana (es un valor, no una ausencia)', () => {
    const merged = mergeProposalPayloads(
      { loads: [{ kind: 'udl', magnitude: 10 }] },
      { loads: [] },
    ) as Record<string, unknown>;
    expect(merged.loads).toEqual([]);
  });
});
