// Tests de la decoración del snapshot con la memoria del hilo
// (src/lib/ai/pendingSnapshot.ts): pendientes_de_aplicar + filtrado de
// sin_confirmar por claves confirmadas. El caso que motiva todo: un valor
// confirmado en conversación que COINCIDE con el default de fábrica no podía
// salir nunca de sin_confirmar y el asistente lo re-preguntaba en bucle.
// Desde 2026-07-20 también errores_propuesta_anterior: los skips-RECHAZO del
// plan pendiente se realimentan al modelo y sus claves salen de pendientes.
import { describe, expect, it } from 'vitest';
import {
  collectThreadValues,
  decorateSnapshot,
  establishedKeys,
  rejectedSkips,
} from '../../lib/ai/pendingSnapshot';

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
    const thread = new Map<string, unknown>();
    collectThreadValues({ L_m: 3.5, bTrib_m: 3, tipo: null, warnings: [] }, thread);
    const out = JSON.parse(
      decorateSnapshot(SNAPSHOT, { L_m: 3.5, bTrib_m: 3, warnings: [] }, new Set(thread.keys())),
    ) as Record<string, unknown>;
    expect(out.pendientes_de_aplicar).toEqual({ L_m: 3.5, bTrib_m: 3 });
    expect(out.sin_confirmar).toEqual(['tipo']);
  });
});

describe('decorateSnapshot — errores_propuesta_anterior', () => {
  const ALREADY = 'Ya coincide con el valor actual';

  it('un skip-rechazo se realimenta y su clave sale de pendientes_de_aplicar', () => {
    // El caso real del veto FEM 2D: cargas rechazada (biela con carga en
    // barra) — antes el modelo la veía en pendientes como "acordada" y la
    // reenviaba igual en bucle.
    const out = JSON.parse(
      decorateSnapshot(SNAPSHOT, { L_m: 3.5, tipo: 'HEB' }, NONE, [
        { field: 'tipo', label: 'Tipo de perfil', reason: 'HEB 999 no existe en el catálogo' },
      ]),
    ) as Record<string, unknown>;
    expect(out.pendientes_de_aplicar).toEqual({ L_m: 3.5 });
    expect(out.errores_propuesta_anterior).toEqual([
      'tipo: HEB 999 no existe en el catálogo',
    ]);
  });

  it('el skip benigno ("Ya coincide…") NO es un rechazo: passthrough byte-idéntico', () => {
    expect(
      decorateSnapshot(SNAPSHOT, null, NONE, [
        { field: 'L_m', label: 'Luz L', reason: ALREADY },
      ]),
    ).toBe(SNAPSHOT);
  });

  it('un rechazo sin `field` se realimenta con el label y no filtra pendientes', () => {
    const out = JSON.parse(
      decorateSnapshot(SNAPSHOT, { L_m: 3.5 }, NONE, [
        { label: 'Luz L', reason: 'Valor 99 m fuera del rango admisible 0.5–40 m' },
      ]),
    ) as Record<string, unknown>;
    expect(out.pendientes_de_aplicar).toEqual({ L_m: 3.5 });
    expect(out.errores_propuesta_anterior).toEqual([
      'Luz L: Valor 99 m fuera del rango admisible 0.5–40 m',
    ]);
  });

  it('con TODAS las claves rechazadas no se emite pendientes pero sí los errores', () => {
    const out = JSON.parse(
      decorateSnapshot(SNAPSHOT, { cargas: [{ fy: -3 }] }, NONE, [
        { field: 'cargas', label: 'Cargas', reason: 'Carga 1: componentes nulas' },
      ]),
    ) as Record<string, unknown>;
    expect('pendientes_de_aplicar' in out).toBe(false);
    expect(out.errores_propuesta_anterior).toEqual([
      'cargas: Carga 1: componentes nulas',
    ]);
  });

  it('rejectedSkips separa rechazos de skips benignos', () => {
    const rej = rejectedSkips([
      { field: 'L_m', label: 'Luz L', reason: ALREADY },
      { field: 'tipo', label: 'Tipo', reason: 'fuera de catálogo' },
    ]);
    expect(rej).toEqual([{ field: 'tipo', label: 'Tipo', reason: 'fuera de catálogo' }]);
  });
});

describe('collectThreadValues', () => {
  it('añade las claves no-null e ignora null/undefined y las META', () => {
    const into = new Map<string, unknown>();
    collectThreadValues(
      { L_m: 3.5, bTrib_m: null, qk_kNm2: undefined, warnings: ['w'], notes: 'n' },
      into,
    );
    expect([...into]).toEqual([['L_m', 3.5]]);
  });

  it('acumula entre llamadas (el Map es la memoria del hilo)', () => {
    const into = new Map<string, unknown>();
    collectThreadValues({ L_m: 3.5 }, into);
    collectThreadValues({ bTrib_m: 3, L_m: null }, into);
    expect(into.has('L_m')).toBe(true);
    expect(into.has('bTrib_m')).toBe(true);
  });

  it('PRIMERO GANA: un turno posterior no reescribe la línea base de la clave', () => {
    // Si la sobrescribiera, la propuesta arrastrada sería su propia línea base y
    // un riesgo ya detectado desaparecería de la tarjeta acumulada.
    const into = new Map<string, unknown>();
    collectThreadValues({ qk_kNm2: 2 }, into);
    collectThreadValues({ qk_kNm2: 0.2 }, into);
    expect(into.get('qk_kNm2')).toBe(2);
  });

  it('no lanza con proposal no-objeto', () => {
    const into = new Map<string, unknown>();
    expect(() => {
      collectThreadValues(null, into);
      collectThreadValues('texto', into);
      collectThreadValues([1, 2], into);
    }).not.toThrow();
    expect(into.size).toBe(0);
  });
});

describe('establishedKeys — el gate anti-ruido con memoria de VALORES', () => {
  it('el valor arrastrado igual NO establece la clave (la primera introducción no se re-juzga)', () => {
    // Turno 1: el modelo introduce bTrib 1.5 (gate cerrado, sin fila roja).
    // Turno 2: la fusión arrastra el mismo 1.5 → no puede volver como riesgo.
    const thread = new Map<string, unknown>([['bTrib_m', 1.5]]);
    expect([...establishedKeys(thread, { bTrib_m: 1.5, L_m: 6 })]).toEqual([]);
  });

  it('mover el valor SÍ establece la clave (fuga 1: el 30×30 que se engorda a 40×40)', () => {
    const thread = new Map<string, unknown>([['bc_cm', 30]]);
    expect([...establishedKeys(thread, { bc_cm: 40 })]).toEqual(['bc_cm']);
  });

  it('el riesgo PERSISTE en los turnos siguientes: la línea base no se mueve', () => {
    // Turno 1 confirma qk = 2 (el default), turno 2 lo rebaja a 0.2 (riesgo) y
    // turno 3 lo arrastra: sigue difiriendo de la línea base ⇒ sigue en rojo.
    const thread = new Map<string, unknown>([['qk_kNm2', 2]]);
    expect([...establishedKeys(thread, { qk_kNm2: 0.2 })]).toEqual(['qk_kNm2']);
    expect([...establishedKeys(thread, { qk_kNm2: 0.2, L_m: 6 })]).toEqual(['qk_kNm2']);
  });

  it('una clave que la propuesta no toca (null/ausente) sigue establecida', () => {
    const thread = new Map<string, unknown>([['gk_kNm2', 4]]);
    expect([...establishedKeys(thread, { gk_kNm2: null, L_m: 6 })]).toEqual(['gk_kNm2']);
    expect([...establishedKeys(thread, { L_m: 6 })]).toEqual(['gk_kNm2']);
  });

  it('arrays y objetos se comparan en profundidad (estratos, cargas)', () => {
    const strata = [{ h: 2, phi: 30 }, { h: 3, phi: 32 }];
    const thread = new Map<string, unknown>([['strata', strata]]);
    // Mismo contenido en otra instancia ⇒ arrastre, no cambio.
    expect([...establishedKeys(thread, { strata: [{ h: 2, phi: 30 }, { h: 3, phi: 32 }] })])
      .toEqual([]);
    // Terreno "mejorado" ⇒ establecida (y el detector de elementos ya la juzga).
    expect([...establishedKeys(thread, { strata: [{ h: 2, phi: 38 }, { h: 3, phi: 32 }] })])
      .toEqual(['strata']);
  });

  it('payload no-objeto → todas las claves de la memoria siguen establecidas', () => {
    const thread = new Map<string, unknown>([['L_m', 6]]);
    expect([...establishedKeys(thread, null)]).toEqual(['L_m']);
    expect([...establishedKeys(new Map(), { L_m: 6 })]).toEqual([]);
  });
});
