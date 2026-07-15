// Tests de la decoración del snapshot con la memoria del hilo
// (src/lib/ai/pendingSnapshot.ts): pendientes_de_aplicar + filtrado de
// sin_confirmar por claves confirmadas. El caso que motiva todo: un valor
// confirmado en conversación que COINCIDE con el default de fábrica no podía
// salir nunca de sin_confirmar y el asistente lo re-preguntaba en bucle.
import { describe, expect, it } from 'vitest';
import { collectConfirmedKeys, decorateSnapshot } from '../../lib/ai/pendingSnapshot';

const SNAPSHOT =
  '{"valores":{"L_m":6,"bTrib_m":3,"tipo":"IPE"},"sin_confirmar":["L_m","bTrib_m","tipo"]}';

const NONE = new Set<string>();

describe('decorateSnapshot — passthrough', () => {
  it('sin pendiente ni confirmados devuelve el string ORIGINAL byte-idéntico', () => {
    // toBe, no toEqual: los tests de integración asertan el snapshot literal
    // del adapter y el camino base no debe reserializar nada.
    expect(decorateSnapshot(SNAPSHOT, null, NONE)).toBe(SNAPSHOT);
  });

  it('pendiente solo con nulls/META equivale a no tener pendiente', () => {
    const pending = { L_m: null, qk_kNm2: null, warnings: ['aviso'], notes: 'nota' };
    expect(decorateSnapshot(SNAPSHOT, pending, NONE)).toBe(SNAPSHOT);
  });

  it('JSON malformado → passthrough defensivo, nunca lanza', () => {
    const confirmed = new Set(['L_m']);
    expect(decorateSnapshot('{esto no es json', { L_m: 3.5 }, confirmed)).toBe('{esto no es json');
  });

  it('JSON que no es objeto (array / string) → passthrough', () => {
    const confirmed = new Set(['L_m']);
    expect(decorateSnapshot('[1,2]', { L_m: 3.5 }, confirmed)).toBe('[1,2]');
    expect(decorateSnapshot('"hola"', { L_m: 3.5 }, confirmed)).toBe('"hola"');
  });

  it('pendiente que no es objeto (string / array) se ignora', () => {
    expect(decorateSnapshot(SNAPSHOT, 'L_m=3.5', NONE)).toBe(SNAPSHOT);
    expect(decorateSnapshot(SNAPSHOT, [3.5], NONE)).toBe(SNAPSHOT);
  });
});

describe('decorateSnapshot — pendientes_de_aplicar', () => {
  it('las claves no-null del pendiente aparecen en pendientes_de_aplicar y salen de sin_confirmar', () => {
    const out = JSON.parse(
      decorateSnapshot(SNAPSHOT, { L_m: 3.5, bTrib_m: null, warnings: [] }, NONE),
    ) as Record<string, unknown>;
    expect(out.pendientes_de_aplicar).toEqual({ L_m: 3.5 });
    expect(out.sin_confirmar).toEqual(['bTrib_m', 'tipo']);
    // valores queda intacto:
    expect(out.valores).toEqual({ L_m: 6, bTrib_m: 3, tipo: 'IPE' });
  });

  it('warnings y notes (claves META) nunca entran en pendientes', () => {
    const out = JSON.parse(
      decorateSnapshot(SNAPSHOT, { L_m: 3.5, warnings: ['w'], notes: 'n' }, NONE),
    ) as Record<string, unknown>;
    expect(out.pendientes_de_aplicar).toEqual({ L_m: 3.5 });
  });

  it('0 y false cuentan como valores pendientes (no-null)', () => {
    const out = JSON.parse(
      decorateSnapshot(SNAPSHOT, { L_m: 0, tipo: false }, NONE),
    ) as Record<string, unknown>;
    expect(out.pendientes_de_aplicar).toEqual({ L_m: 0, tipo: false });
  });
});

describe('decorateSnapshot — confirmados del hilo', () => {
  it('las claves confirmadas salen de sin_confirmar sin emitir pendientes_de_aplicar', () => {
    const out = JSON.parse(
      decorateSnapshot(SNAPSHOT, null, new Set(['bTrib_m'])),
    ) as Record<string, unknown>;
    expect(out.sin_confirmar).toEqual(['L_m', 'tipo']);
    expect('pendientes_de_aplicar' in out).toBe(false);
  });

  it('sin_confirmar ausente o no-array → se emite []', () => {
    const confirmed = new Set(['x']);
    const noList = JSON.parse(
      decorateSnapshot('{"valores":{"x":1}}', null, confirmed),
    ) as Record<string, unknown>;
    expect(noList.sin_confirmar).toEqual([]);
    const badList = JSON.parse(
      decorateSnapshot('{"valores":{"x":1},"sin_confirmar":"x"}', null, confirmed),
    ) as Record<string, unknown>;
    expect(badList.sin_confirmar).toEqual([]);
  });

  it('caso del bug real: valor confirmado igual al default + luz pendiente → sin_confirmar vacío', () => {
    // El modelo propuso {L_m:3.5, bTrib_m:3} (bTrib_m COINCIDE con el default:
    // antes era inconfirmable). Todo propuesto queda registrado como
    // confirmado; el pendiente acumulado sigue vivo sin aplicar.
    const confirmed = new Set<string>();
    collectConfirmedKeys({ L_m: 3.5, bTrib_m: 3, tipo: null, warnings: [] }, confirmed);
    const out = JSON.parse(
      decorateSnapshot(SNAPSHOT, { L_m: 3.5, bTrib_m: 3, warnings: [] }, confirmed),
    ) as Record<string, unknown>;
    expect(out.pendientes_de_aplicar).toEqual({ L_m: 3.5, bTrib_m: 3 });
    expect(out.sin_confirmar).toEqual(['tipo']);
  });
});

describe('collectConfirmedKeys', () => {
  it('añade las claves no-null e ignora null/undefined y las META', () => {
    const into = new Set<string>();
    collectConfirmedKeys(
      { L_m: 3.5, bTrib_m: null, qk_kNm2: undefined, warnings: ['w'], notes: 'n' },
      into,
    );
    expect([...into]).toEqual(['L_m']);
  });

  it('acumula entre llamadas (el Set es la memoria del hilo)', () => {
    const into = new Set<string>();
    collectConfirmedKeys({ L_m: 3.5 }, into);
    collectConfirmedKeys({ bTrib_m: 3, L_m: null }, into);
    expect(into.has('L_m')).toBe(true);
    expect(into.has('bTrib_m')).toBe(true);
  });

  it('no lanza con proposal no-objeto', () => {
    const into = new Set<string>();
    expect(() => {
      collectConfirmedKeys(null, into);
      collectConfirmedKeys('texto', into);
      collectConfirmedKeys([1, 2], into);
    }).not.toThrow();
    expect(into.size).toBe(0);
  });
});
