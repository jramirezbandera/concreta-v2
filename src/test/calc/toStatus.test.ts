import { describe, it, expect } from 'vitest';
import { toStatus, WARN_UTIL } from '../../lib/calculations/types';

// Umbral de utilización — fuente única para TODA la app (vigas FEM, muros de
// fábrica, micropilotes, punzonamiento, acero, madera...). Subido de 0.8 a 0.95
// para que el aviso ámbar solo aparezca cuando el margen es realmente escaso
// (<5%); al 80% un elemento es buen diseño, no un aviso.
//
//   util < 0.95          -> 'ok'   (cumple holgado)
//   0.95 <= util < 1.0   -> 'warn' (cumple al borde)
//   util >= 1.0          -> 'fail' (incumple)
describe('toStatus / WARN_UTIL — umbral de aviso', () => {
  it('WARN_UTIL = 0.95', () => {
    expect(WARN_UTIL).toBe(0.95);
  });

  it('util bajo → ok', () => {
    expect(toStatus(0)).toBe('ok');
    expect(toStatus(0.5)).toBe('ok');
  });

  it('80–94% ahora CUMPLE sin aviso (antes del cambio era warn)', () => {
    expect(toStatus(0.80)).toBe('ok');
    expect(toStatus(0.88)).toBe('ok');
    expect(toStatus(0.94)).toBe('ok');
    expect(toStatus(WARN_UTIL - 0.0001)).toBe('ok');
  });

  it('[0.95, 1.0) → warn (banda estrecha, ≥ WARN_UTIL inclusive)', () => {
    expect(toStatus(WARN_UTIL)).toBe('warn');
    expect(toStatus(0.95)).toBe('warn');
    expect(toStatus(0.999)).toBe('warn');
  });

  it('util >= 1 → fail', () => {
    expect(toStatus(1)).toBe('fail');
    expect(toStatus(1.5)).toBe('fail');
  });
});
