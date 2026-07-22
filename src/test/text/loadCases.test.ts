import { describe, it, expect } from 'vitest';
import { LC_LABELS, LC_HELP, lcOptionLabel } from '../../lib/text/loadCases';
import type { LoadCase } from '../../lib/frame-core/types';

// Fuente única de la copia de UI de las hipótesis de carga. El objetivo del
// módulo es que ninguna hipótesis se quede sin nombre y que las dos cadenas hoy
// repetidas a mano (option + tooltip) tengan un solo origen (eng-review D2/2B).
const ALL_LCS: LoadCase[] = ['G', 'Q', 'W', 'S', 'E'];

describe('LC_LABELS — nombres de hipótesis para la UI', () => {
  it('cubre las 5 hipótesis, todas con nombre no vacío', () => {
    for (const lc of ALL_LCS) {
      expect(LC_LABELS[lc], `falta el nombre de ${lc}`).toBeTruthy();
      expect(LC_LABELS[lc].trim().length).toBeGreaterThan(0);
    }
  });

  it('no añade claves que no sean LoadCase', () => {
    expect(Object.keys(LC_LABELS).sort()).toEqual([...ALL_LCS].sort());
  });

  it('nombres canónicos CTE DB-SE-AE', () => {
    expect(LC_LABELS.G).toBe('Cargas permanentes');
    expect(LC_LABELS.Q).toBe('Sobrecarga de uso');
    expect(LC_LABELS.W).toBe('Viento');
    expect(LC_LABELS.S).toBe('Nieve');
    expect(LC_LABELS.E).toBe('Sismo');
  });
});

describe('lcOptionLabel — etiqueta del <option>', () => {
  it('compone "<letra> · <nombre>" para cada hipótesis', () => {
    expect(lcOptionLabel('G')).toBe('G · Cargas permanentes');
    expect(lcOptionLabel('Q')).toBe('Q · Sobrecarga de uso');
    expect(lcOptionLabel('E')).toBe('E · Sismo');
  });

  it('el prefijo de una letra es la propia LoadCase', () => {
    for (const lc of ALL_LCS) {
      expect(lcOptionLabel(lc).startsWith(`${lc} · `)).toBe(true);
    }
  });
});

describe('LC_HELP — texto de ayuda de la fila «Hipótesis»', () => {
  it('conserva la aclaración normativa de valores sin mayorar', () => {
    expect(LC_HELP).toContain('sin mayorar');
    expect(LC_HELP).toContain('γ');
    expect(LC_HELP).toContain('ψ');
  });

  // Byte-idéntico al help=/title= que hoy viven en Fem2DInspector.tsx:835 y
  // ToolPalette2D.tsx:169. Si esta cadena cambia, T2 dejaría de ser un refactor
  // sin cambios visibles — de ahí el pin exacto.
  it('coincide verbatim con el tooltip actual', () => {
    expect(LC_HELP).toBe(
      'G permanente · Q sobrecarga de uso · W viento · S nieve · E sismo. ' +
        'Valores característicos sin mayorar (el programa aplica γ y ψ).',
    );
  });
});
