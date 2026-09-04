/**
 * Golden: la tabla de anclajes y solapes del plano del usuario.
 *
 * 48 números (2 hormigones × 2 posiciones × 6 diámetros × anclaje y solape)
 * transcritos de «cuadro long anclaje.png». No hay ni un valor aproximado: los
 * 48 salen exactos del Anejo 19 del Código Estructural.
 *
 * Lo que este test fija, y que ningún comentario podría defender igual de bien:
 *
 *  1. fctk;0,05 se lee de la tabla A19.3.1 TABULADA (1,8 y 2,0), no de
 *     0,7·0,30·fck^(2/3) (1,796 y 2,027). La diferencia es del 1 % y mueve
 *     HA-30 ø25 de 91 a 89 cm.
 *  2. El redondeo a cm se hace por separado sobre anclaje y solape. Por eso
 *     HA-25 ø16 sale 64 y 97, y no 64 y 96 (= 64·1,5).
 *  3. El método simplificado del artículo 49.5.1.2 NO reproduce esta tabla.
 */

import { describe, expect, it } from 'vitest';
import {
  longitudBasicaAnclaje,
  longitudBasicaSimplificada,
  longitudMinimaAnclaje,
  longitudMinimaSolape,
  longitudSolape,
  tablaAnclajes,
  tensionAdherencia,
} from '../../lib/materiales/anclajes';
import { cuadroAnclajes } from '../../lib/materiales/cuadros';

const DIAMETROS = [8, 10, 12, 16, 20, 25];
const FYK = 500; // B500SD

// «cuadro long anclaje.png», longitudes en cm.
const ORACULO = {
  25: {
    anclaje: { I: [32, 40, 48, 64, 81, 101], II: [46, 58, 69, 92, 115, 144] },
    solape: { I: [48, 60, 72, 97, 121, 151], II: [69, 86, 104, 138, 173, 216] },
  },
  30: {
    anclaje: { I: [29, 36, 43, 58, 72, 91], II: [41, 52, 62, 83, 104, 129] },
    solape: { I: [43, 54, 65, 87, 109, 136], II: [62, 78, 93, 124, 155, 194] },
  },
} as const;

describe('longitudes de anclaje — cuadro de plano del usuario', () => {
  for (const fck of [25, 30] as const) {
    describe(`HA-${fck}/B500SD`, () => {
      const t = tablaAnclajes(fck, FYK, [...DIAMETROS]);

      it('anclaje en prolongación recta, posiciones I y II', () => {
        expect(t.anclaje.I).toEqual([...ORACULO[fck].anclaje.I]);
        expect(t.anclaje.II).toEqual([...ORACULO[fck].anclaje.II]);
      });

      it('solape con α6 = 1,5 (más del 50 % de barras solapadas en la misma sección)', () => {
        expect(t.solape.I).toEqual([...ORACULO[fck].solape.I]);
        expect(t.solape.II).toEqual([...ORACULO[fck].solape.II]);
      });
    });
  }

  it('la posición II es la I dividida por η1 = 0,7', () => {
    const i = longitudBasicaAnclaje({ fck: 30, fyk: FYK, phi: 20, posicion: 'I' });
    const ii = longitudBasicaAnclaje({ fck: 30, fyk: FYK, phi: 20, posicion: 'II' });
    expect(ii / i).toBeCloseTo(1 / 0.7, 10);
  });

  it('fbd sale de la tabla A19.3.1: HA-30 posición I da exactamente 3,00 N/mm²', () => {
    // fctd = 2,0/1,5 = 1,3333 → fbd = 2,25·1,3333 = 3,00. Con fctm calculada
    // (2,896) saldría 3,04 y ø25 caería a 89 cm en vez de los 91 del cuadro.
    expect(tensionAdherencia(30, 'I', 20)).toBeCloseTo(3.0, 10);
    expect(tensionAdherencia(25, 'I', 20)).toBeCloseTo(2.7, 10);
  });

  it('el redondeo independiente de anclaje y solape explica el 64/97 de HA-25 ø16', () => {
    const lb = longitudBasicaAnclaje({ fck: 25, fyk: FYK, phi: 16, posicion: 'I' });
    expect(lb / 10).toBeCloseTo(64.41, 2); // 64,41 cm → 64
    expect((lb * 1.5) / 10).toBeCloseTo(96.62, 2); // 96,62 cm → 97
  });

  it('η2 reduce la adherencia por encima de ø32', () => {
    const lb32 = longitudBasicaAnclaje({ fck: 30, fyk: FYK, phi: 32, posicion: 'I' });
    const lb40 = longitudBasicaAnclaje({ fck: 30, fyk: FYK, phi: 40, posicion: 'I' });
    // Sin η2 la relación sería 40/32 = 1,25; con η2 = (132-40)/100 = 0,92 sube.
    expect(lb40 / lb32).toBeCloseTo(1.25 / 0.92, 6);
  });
});

describe('el bloque de anclajes que va al plano', () => {
  const blocks = cuadroAnclajes([25, 30], FYK, [...DIAMETROS]);

  it('lleva las dos tablas de anclaje y las dos de solape, rotuladas por hormigón', () => {
    const tablas = blocks.filter((b) => b.kind === 'table');
    expect(tablas.map((t) => (t.kind === 'table' ? t.caption : ''))).toEqual([
      'HA-25/B500SD',
      'HA-30/B500SD',
      'HA-25/B500SD',
      'HA-30/B500SD',
    ]);
    const primera = tablas[0];
    if (primera.kind !== 'table') throw new Error('sin tabla');
    expect(primera.head).toEqual(['', 'Ø8', 'Ø10', 'Ø12', 'Ø16', 'Ø20', 'Ø25']);
    expect(primera.rows[0]).toEqual(['Posición I', '32', '40', '48', '64', '81', '101']);
    expect(primera.rows[1]).toEqual(['Posición II', '46', '58', '69', '92', '115', '144']);
  });

  it('arrastra las notas de posición I/II y patilla del plano', () => {
    const notas = blocks.find((b) => b.kind === 'notes');
    if (notas?.kind !== 'notes') throw new Error('sin notas');
    const texto = notas.items.join(' ');
    expect(texto).toContain('POSICIÓN I');
    expect(texto).toContain('0,7');
    expect(texto).toContain('patilla mínima de 15 cm');
  });

  it('declara el método y su condición de aplicación, que no se elige a gusto', () => {
    // El artículo 49.5 reparte los dos métodos según cómo esté certificada la
    // adherencia de la barra. Una tabla de plano que no lo diga no se puede
    // defender en obra: no se sabe cuál de los dos se ha usado.
    const notas = blocks.find((b) => b.kind === 'notes');
    if (notas?.kind !== 'notes') throw new Error('sin notas');
    const texto = notas.items.join(' ');
    expect(texto).toContain('Anejo 19');
    expect(texto).toContain('geometría de corrugas');
    expect(texto).toContain('σsd = fyd');
  });

  it('la posición I se define por la figura A19.8.2, no por el artículo 49.5.1.1', () => {
    // No son lo mismo: el 49.5.1.1 da por buena la mitad inferior de la pieza;
    // la figura A19.8.2 da los 250 mm inferiores. En un forjado de 300 mm eso
    // son 150 mm frente a 250. Citar el artículo junto a números del Anejo 19
    // dejaba el cuadro descuadrado consigo mismo.
    const notas = blocks.find((b) => b.kind === 'notes');
    if (notas?.kind !== 'notes') throw new Error('sin notas');
    const posicionI = notas.items.find((n) => n.startsWith('POSICIÓN I'))!;
    expect(posicionI).toContain('A19.8.2');
    expect(posicionI).toContain('250 mm');
    expect(posicionI).not.toContain('mitad inferior');
  });
});

describe('longitudes mínimas — expresiones (8.6) y (8.11)', () => {
  it('con los diámetros del plano no gobierna ninguna: los 48 valores no se mueven', () => {
    for (const fck of [25, 30] as const) {
      for (const posicion of ['I', 'II'] as const) {
        for (const phi of DIAMETROS) {
          const lb = longitudBasicaAnclaje({ fck, fyk: FYK, phi, posicion });
          expect(longitudMinimaAnclaje(lb, phi, 'traccion')).toBeLessThan(lb);
          expect(longitudMinimaSolape(lb, phi, 1.5)).toBeLessThan(1.5 * lb);
        }
      }
    }
  });

  it('pero cuando la barra trabaja lejos de fyd, el mínimo sí manda', () => {
    // σsd = 100 N/mm² en HA-30 posición I: lb,rqd = 66,7 mm para un ø8, y el
    // solape se va a los 200 mm de la expresión (8.11) en lugar de a 100.
    const p = { fck: 30, fyk: FYK, phi: 8, posicion: 'I' as const, sigmaSd: 100 };
    expect(longitudBasicaAnclaje(p)).toBeCloseTo(66.67, 2);
    expect(longitudSolape(p)).toBe(200);
  });
});

describe('DISCREPANCIA — el método simplificado del artículo 49.5.1.2 no da esta tabla', () => {
  /**
   * El CE mantiene el método de la EHE-08 (lbI = m·ø² ≥ fyk·ø/20) además del
   * Anejo 19. Para diámetros pequeños gobierna el mínimo fyk·ø/20 y da valores
   * mucho más cortos. El cuadro del usuario, rotulado «(COD-E)», sigue el
   * Anejo 19; se deja constancia para que nadie «corrija» el motor al 49.5.
   */
  it('HA-25 ø8 posición I: 20 cm por el artículo 49.5 frente a los 32 cm del cuadro', () => {
    expect(longitudBasicaSimplificada(25, 'B500', 8, 'I') / 10).toBeCloseTo(20, 6);
    expect(ORACULO[25].anclaje.I[0]).toBe(32);
  });

  it('ningún diámetro del cuadro coincide con el método simplificado en HA-25', () => {
    const simplificado = DIAMETROS.map((phi) =>
      Math.round(longitudBasicaSimplificada(25, 'B500', phi, 'I') / 10),
    );
    expect(simplificado).toEqual([20, 25, 30, 40, 60, 94]);
    for (let i = 0; i < DIAMETROS.length; i++) {
      expect(simplificado[i]).not.toBe(ORACULO[25].anclaje.I[i]);
    }
  });
});
