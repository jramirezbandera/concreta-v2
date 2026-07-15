// Tests del serializador genérico de resultados (Fase 2, plan T2.1):
// summarizeCalcResults sobre fixtures CheckRow SINTÉTICOS (sin motores).
//   - Veredicto global: literales exactos ok/warn/fail y conteo N/M sobre
//     checks ACTIVOS (los neutral no cuentan).
//   - Línea por check: prefijo [CUMPLE|ADVERTENCIA|INCUMPLE], valor/límite en
//     SI (camino numérico valueQty vs legacy value/limit), segmentos omitidos
//     si vacíos, η=NN% redondeado solo con utilization finita (casos reales:
//     NaN en rc-columns, Infinity en bearing de zapatas).
//   - Neutrales agregados en UNA línea "Informativas" (ausente si no hay).
//   - Inválido: error != null → verdict 'invalid' + "CÁLCULO NO VÁLIDO".
//   - extraLines al final, tal cual y en orden.
// Función pura: sin mocks.

import { describe, it, expect } from 'vitest';
import { summarizeCalcResults, type CalcResultLike } from '../../lib/ai/resultsSummary';
import type { CheckRow } from '../../lib/calculations/types';

/** Fixture sintético: CheckRow legacy-ok por defecto, override por campos. */
function mkCheck(partial: Partial<CheckRow>): CheckRow {
  return {
    id: 'chk',
    description: 'Comprobación de prueba',
    utilization: 0.5,
    status: 'ok',
    article: 'CE art. 1',
    ...partial,
  };
}

function mkResult(checks: CheckRow[], error?: string): CalcResultLike {
  return { valid: error == null, error, checks };
}

describe('summarizeCalcResults — veredicto global', () => {
  it('todo ok → verdict ok con el literal exacto', () => {
    const out = summarizeCalcResults(
      mkResult([mkCheck({ id: 'a' }), mkCheck({ id: 'b' })]),
    );
    expect(out.verdict).toBe('ok');
    expect(out.text.split('\n')[0]).toBe(
      'VEREDICTO GLOBAL: CUMPLE (todas las comprobaciones cumplen)',
    );
  });

  it('un warn sin fails → verdict warn con el literal exacto', () => {
    const out = summarizeCalcResults(
      mkResult([
        mkCheck({ id: 'a' }),
        mkCheck({ id: 'b', utilization: 0.97, status: 'warn' }),
      ]),
    );
    expect(out.verdict).toBe('warn');
    expect(out.text.split('\n')[0]).toBe(
      'VEREDICTO GLOBAL: CUMPLE CON ADVERTENCIAS (alguna comprobación con margen < 5%)',
    );
  });

  it('mezcla ok/warn/fail (+neutral) → verdict fail con conteo N/M sobre ACTIVOS', () => {
    const out = summarizeCalcResults(
      mkResult([
        mkCheck({ id: 'a' }),
        mkCheck({ id: 'b', utilization: 0.97, status: 'warn' }),
        mkCheck({ id: 'c', utilization: 1.2, status: 'fail' }),
        mkCheck({ id: 'd', utilization: 1.5, status: 'fail' }),
        // El neutral NO cuenta ni en N ni en M:
        mkCheck({ id: 'n', status: 'neutral', neutral: true, tag: 'CLASE 1', utilization: 0 }),
      ]),
    );
    expect(out.verdict).toBe('fail');
    expect(out.text.split('\n')[0]).toBe(
      'VEREDICTO GLOBAL: INCUMPLE (2 de 4 comprobaciones fallan)',
    );
  });

  it('los prefijos de línea son palabras completas (ADVERTENCIA, no "ADVERT.")', () => {
    const out = summarizeCalcResults(
      mkResult([
        mkCheck({ id: 'a' }),
        mkCheck({ id: 'b', utilization: 0.96, status: 'warn' }),
        mkCheck({ id: 'c', utilization: 1.1, status: 'fail' }),
      ]),
    );
    expect(out.text).toContain('- [CUMPLE] ');
    expect(out.text).toContain('- [ADVERTENCIA] ');
    expect(out.text).toContain('- [INCUMPLE] ');
    expect(out.text).not.toContain('ADVERT.');
  });
});

describe('summarizeCalcResults — formato de línea por check', () => {
  it('camino numérico: valueQty/limitQty formateados en SI vía formatQuantity', () => {
    const out = summarizeCalcResults(
      mkResult([
        mkCheck({
          id: 'axil',
          description: 'Axil de cálculo',
          valueNum: 150,
          valueQty: 'force',
          limitNum: 200,
          limitQty: 'force',
          utilization: 0.75,
          article: 'CE art. 35',
        }),
      ]),
    );
    expect(out.text.split('\n')[1]).toBe(
      '- [CUMPLE] Axil de cálculo: 150.00 kN | límite: 200.00 kN | η=75% — CE art. 35',
    );
  });

  it('camino legacy: value/limit preformateados se emiten tal cual', () => {
    const out = summarizeCalcResults(
      mkResult([
        mkCheck({
          id: 'vuelco-x',
          description: 'Vuelco dir. x (FS ≥ 2.0)',
          value: 'FS = 1.62',
          limit: '≥ 2.00',
          utilization: 1.244,
          status: 'fail',
          article: 'CTE DB-SE-C 4.4.2',
        }),
      ]),
    );
    // η=124%: Math.round(1.244·100) — redondeo al entero.
    expect(out.text.split('\n')[1]).toBe(
      '- [INCUMPLE] Vuelco dir. x (FS ≥ 2.0): FS = 1.62 | límite: ≥ 2.00 | η=124% — CTE DB-SE-C 4.4.2',
    );
  });

  it('utilization NaN → línea SIN η= (caso real rc-columns)', () => {
    const out = summarizeCalcResults(
      mkResult([
        mkCheck({ id: 'nm', description: 'Interacción N-M', value: '0.42', utilization: NaN }),
      ]),
    );
    expect(out.text.split('\n')[1]).toBe('- [CUMPLE] Interacción N-M: 0.42 — CE art. 1');
    expect(out.text).not.toContain('η=');
  });

  it('utilization Infinity → línea SIN η= (caso real bearing de zapatas)', () => {
    const out = summarizeCalcResults(
      mkResult([
        mkCheck({
          id: 'bearing',
          description: 'σmax ≤ σadm',
          value: '∞',
          limit: '0.200 N/mm²',
          utilization: Infinity,
          status: 'fail',
        }),
      ]),
    );
    expect(out.text.split('\n')[1]).toBe(
      '- [INCUMPLE] σmax ≤ σadm: ∞ | límite: 0.200 N/mm² — CE art. 1',
    );
    expect(out.text).not.toContain('η=');
  });

  it('sin límite → sin segmento "| límite:"', () => {
    const out = summarizeCalcResults(
      mkResult([
        mkCheck({ id: 'ratio', description: 'Esbeltez', value: 'λ = 45', utilization: 0.6 }),
      ]),
    );
    expect(out.text.split('\n')[1]).toBe('- [CUMPLE] Esbeltez: λ = 45 | η=60% — CE art. 1');
    expect(out.text).not.toContain('límite:');
  });

  it('sin valor → sin dos puntos tras la descripción; el resto encadena con " | "', () => {
    const out = summarizeCalcResults(
      mkResult([
        mkCheck({ id: 'solo-lim', description: 'Flecha activa', limit: 'L/400', utilization: 0.9 }),
      ]),
    );
    expect(out.text.split('\n')[1]).toBe(
      '- [CUMPLE] Flecha activa | límite: L/400 | η=90% — CE art. 1',
    );
  });

  it('article vacío → sin segmento " — "', () => {
    const out = summarizeCalcResults(
      mkResult([
        mkCheck({ id: 'sin-art', description: 'Check sin norma', value: '1.0', utilization: 0.5, article: '' }),
      ]),
    );
    expect(out.text.split('\n')[1]).toBe('- [CUMPLE] Check sin norma: 1.0 | η=50%');
  });
});

describe('summarizeCalcResults — neutrales agregados', () => {
  it('agrega TODOS los neutrales en una única línea "Informativas" al final de los checks', () => {
    const out = summarizeCalcResults(
      mkResult([
        mkCheck({ id: 'a', description: 'Check activo', value: '0.5', utilization: 0.5 }),
        // Neutral sin valor → usa el tag:
        mkCheck({
          id: 'clase',
          description: 'Clasificación sección',
          value: '',
          utilization: 0,
          status: 'neutral',
          neutral: true,
          tag: 'CLASE 2',
        }),
        // Neutral con valueStr → prefiere el valor sobre el tag:
        mkCheck({
          id: 'flex-x',
          description: 'Flexión dir. x',
          valueStr: 'rígida',
          utilization: 0,
          status: 'neutral',
          neutral: true,
          tag: 'RÍGIDA',
        }),
      ]),
    );
    const lines = out.text.split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[2]).toBe('- Informativas: Clasificación sección = CLASE 2 · Flexión dir. x = rígida');
    // una sola línea agregada, no una por neutral:
    expect(out.text.match(/Informativas/g)).toHaveLength(1);
  });

  it('sin neutrales no hay línea "Informativas"', () => {
    const out = summarizeCalcResults(mkResult([mkCheck({ id: 'a' })]));
    expect(out.text).not.toContain('Informativas');
  });
});

describe('summarizeCalcResults — cálculo no válido', () => {
  it('error != null → verdict invalid y "CÁLCULO NO VÁLIDO: <error>" como primera línea', () => {
    const out = summarizeCalcResults(
      mkResult(
        [mkCheck({ id: 'a', description: 'Check previo', value: '0.5', utilization: 0.5 })],
        'Perfil inexistente',
      ),
    );
    expect(out.verdict).toBe('invalid');
    const lines = out.text.split('\n');
    expect(lines[0]).toBe('CÁLCULO NO VÁLIDO: Perfil inexistente');
    // sin línea de veredicto global; las líneas de checks conservan su formato:
    expect(out.text).not.toContain('VEREDICTO GLOBAL');
    expect(lines[1]).toBe('- [CUMPLE] Check previo: 0.5 | η=50% — CE art. 1');
  });

  it('error con checks vacíos → solo la línea de error', () => {
    const out = summarizeCalcResults(mkResult([], 'Geometría imposible'));
    expect(out.verdict).toBe('invalid');
    expect(out.text).toBe('CÁLCULO NO VÁLIDO: Geometría imposible');
  });

  it('el discriminador es error, no valid: valid=false SIN error → fail, no invalid', () => {
    // Caso real de zapatas: valid = !overall_fail, sin error.
    const out = summarizeCalcResults({
      valid: false,
      checks: [mkCheck({ id: 'v', utilization: 1.3, status: 'fail' })],
    });
    expect(out.verdict).toBe('fail');
    expect(out.text).not.toContain('CÁLCULO NO VÁLIDO');
  });
});

describe('summarizeCalcResults — extraLines', () => {
  it('se añaden al final, tal cual y en orden', () => {
    const out = summarizeCalcResults(
      mkResult([
        mkCheck({ id: 'a', description: 'Check activo', value: '0.5', utilization: 0.5 }),
        mkCheck({ id: 'n', status: 'neutral', neutral: true, tag: 'CLASE 1', utilization: 0, value: '' }),
      ]),
      ['Comprobación dominante: Flecha (η=90%)', 'Armado resultante: 4Ø16'],
    );
    expect(
      out.text.endsWith('\nComprobación dominante: Flecha (η=90%)\nArmado resultante: 4Ø16'),
    ).toBe(true);
    // tras la línea de informativas (los extras cierran el bloque):
    const lines = out.text.split('\n');
    expect(lines[lines.length - 2]).toBe('Comprobación dominante: Flecha (η=90%)');
    expect(lines[lines.length - 1]).toBe('Armado resultante: 4Ø16');
    expect(lines[lines.length - 3]).toContain('Informativas');
  });

  it('también con cálculo no válido (después de la línea de error)', () => {
    const out = summarizeCalcResults(mkResult([], 'Sin perfil'), ['Nota extra']);
    expect(out.text).toBe('CÁLCULO NO VÁLIDO: Sin perfil\nNota extra');
  });

  it('sin extraLines el texto no gana líneas', () => {
    const out = summarizeCalcResults(mkResult([mkCheck({ id: 'a' })]));
    expect(out.text.split('\n')).toHaveLength(2);
  });
});
