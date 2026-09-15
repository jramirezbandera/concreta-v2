/**
 * Las protecciones: la segunda vía del SI 6 § 3.1.
 *
 * Este es el apartado donde más fácil sería mentir, porque el DB SI NO tabula
 * ningún producto: remite a la UNE-EN 13381 y al marcado CE, y lo único que da
 * es la magnitud que hay que alcanzar. Todo lo que se fija aquí va de no
 * inventar:
 *
 *  1. Que sólo llevan λ tabulado las familias que el D.2.1 nombra —«materiales
 *     de tipo pétreo, cerámico, hormigones, morteros y yesos»—, y que una lana
 *     mineral o una intumescente NO dan espesor sin el dato del producto. Una
 *     lana de roca a su λ de catálogo saldría a 7 mm cuando en obra van 40.
 *  2. Que la equivalencia ×1,8 del C.2.4.2 arregla RECUBRIMIENTO, no sección:
 *     un pilar estrecho no se ensancha enfoscándolo.
 *  3. Que el redondeo es siempre al alza y al escalón comercial.
 *
 * Y el contraste: los espesores genéricos se cotejan contra la tabla de
 * masividades de un fabricante real (Pladur, edición 2014, que el estudio tiene
 * en «incendio ejemplos»). Tienen que salir del mismo orden y del lado grueso,
 * nunca por debajo del ensayo.
 */

import { describe, expect, it } from 'vitest';
import {
  alEscalon,
  EQUIVALENCIA_YESO,
  FAMILIAS,
  familiaPorId,
  familiasDe,
  proteccionAcero,
  proteccionHormigon,
  ROTULO_ORIENTATIVO,
} from '../../lib/incendio/protecciones';

const f = (id: string) => familiaPorId(id)!;

describe('el catálogo de familias', () => {
  it('sólo tabula λ donde el D.2.1 lo autoriza: yesos y morteros', () => {
    expect(f('placaYeso').lambda).toBe(0.25);
    expect(f('morteroVermiculita').lambda).toBe(0.12);
    // Fibrosa y silicato: su λ a 20 ºC no es el efectivo en incendio.
    expect(f('lanaMineral').lambda).toBeNull();
    expect(f('silicatoCalcico').lambda).toBeNull();
    // La intumescente no protege por conducción.
    expect(f('intumescente').lambda).toBeNull();
  });

  it('separa las del acero de las del hormigón', () => {
    expect(familiasDe('acero').map((x) => x.id)).toContain('placaYeso');
    expect(familiasDe('acero').map((x) => x.id)).not.toContain('morteroYeso');
    expect(familiasDe('hormigon').map((x) => x.id)).toContain('morteroYeso');
  });

  it('y toda familia explica por qué da o no da número', () => {
    for (const x of FAMILIAS) expect(x.nota.length).toBeGreaterThan(40);
  });
});

describe('el redondeo al escalón comercial', () => {
  it('siempre al alza', () => {
    expect(alEscalon(26, 12.5)).toBe(37.5);
    expect(alEscalon(12.5, 12.5)).toBe(12.5);
    expect(alEscalon(0.1, 12.5)).toBe(12.5);
    expect(alEscalon(17.2, 1)).toBe(18);
  });

  it('y sin escalón, al milímetro entero', () => {
    expect(alEscalon(17.2, 0)).toBe(18);
  });
});

describe('la protección de un elemento de acero', () => {
  const datos = { dLambda: 0.15, masividad: 193, clase: 90 as const };

  it('d = (d/λp)·λp, y el escalón es la placa', () => {
    const p = proteccionAcero(f('placaYeso'), datos, null);
    // 0,15 · 0,25 = 0,0375 m = 37,5 mm → tres placas de 12,5.
    expect(p.espesor).toBe(37.5);
    expect(p.cuenta).toContain('0,15 · 0,25 = 37,5 mm');
  });

  it('un mortero proyectado sale mucho más fino, y sin escalón', () => {
    expect(proteccionAcero(f('morteroVermiculita'), datos, null).espesor).toBe(18);
  });

  it('la lana mineral NO se estima con un λ de catálogo: pide el declarado', () => {
    const p = proteccionAcero(f('lanaMineral'), datos, null);
    expect(p.espesor).toBeNull();
    expect(p.avisos.join(' ')).toContain('λ a 20 ºC');
    expect(p.cuenta).toContain('0,15 m²K/W (objetivo)');
  });

  it('pero con el λp del producto tecleado sí da espesor', () => {
    const p = proteccionAcero(f('lanaMineral'), datos, 0.25);
    expect(p.espesor).toBe(40); // 0,15 · 0,25 = 37,5 → escalón de 10
    // Y entonces no se habla del rango de la familia, porque no se ha usado.
    expect(p.avisos.join(' ')).not.toContain('valor alto de la familia');
  });

  it('un λp que llega a una familia con λ tabulado se ignora: sería el de otro producto', () => {
    // El de la placa de yeso lo autoriza el D.2.1 y no se pregunta; si llega
    // uno manual es el que se tecleó para una lana antes de cambiar de
    // familia, y con 0,05 saldrían 12,5 mm donde tocan 37,5.
    const p = proteccionAcero(f('placaYeso'), datos, 0.05);
    expect(p.espesor).toBe(37.5);
    expect(p.cuenta).toContain('0,15 · 0,25');
    expect(p.avisos.join(' ')).toContain('valor alto de la familia');
  });

  it('la intumescente no da espesor nunca: se le pide al fabricante', () => {
    const p = proteccionAcero(f('intumescente'), datos, null);
    expect(p.espesor).toBeNull();
    expect(p.avisos.join(' ')).toContain('espesor de película seca');
    expect(p.avisos.join(' ')).toContain('Am/V = 193');
    expect(p.avisos.join(' ')).toContain('R 90');
  });

  it('toda cifra queda marcada como orientativa, pero la coletilla no se repite por elemento', () => {
    const p = proteccionAcero(f('placaYeso'), datos, null);
    expect(p.orientativo).toBe(true);
    // La frase es la misma para todos: la pone el documento UNA vez, y no cada
    // propuesta, o el panel de avisos se llena de la misma línea veinte veces.
    expect(p.avisos).not.toContain(ROTULO_ORIENTATIVO);
    expect(ROTULO_ORIENTATIVO).toContain('UNE-EN 13381');
    expect(proteccionAcero(f('intumescente'), datos, null).orientativo).toBe(false);
  });

  it('y se dice que el λ tabulado es el alto de la familia, para que nadie lo tome por exacto', () => {
    expect(proteccionAcero(f('placaYeso'), datos, null).avisos.join(' ')).toContain(
      'valor alto de la familia',
    );
  });

  it('sin d/λp no hay nada que proponer', () => {
    expect(proteccionAcero(f('placaYeso'), { ...datos, dLambda: null }, null).espesor).toBeNull();
  });
});

/**
 * El contraste con un ensayo real.
 *
 * La tabla de masividades de Pladur (trasdosado en cajón, placa FOC, edición
 * 2014) da, para un perfil de Am/V ≈ 100: R 60 → 1×15 o 2×13 (15 a 26 mm);
 * R 120 → 3×13 (39 mm); R 180 → 4×13 (52 mm). El documento del fabricante «no
 * tiene carácter contractual» y por eso no entra en el código, pero sirve para
 * comprobar que la cuenta genérica cae en el orden correcto y SIEMPRE por
 * arriba: si saliera por debajo del ensayo, estaríamos dejando pilares cortos.
 */
describe('contra la tabla de un fabricante', () => {
  const placa = (dLambda: number) =>
    proteccionAcero(f('placaYeso'), { dLambda, masividad: 100, clase: null }, null).espesor as number;

  it('cae del orden del ensayo y nunca por debajo', () => {
    // Am/V = 100, banda 0,70 > μfi ≥ 0,60: R 60 → 0,10; R 120 → 0,15; R 180 → 0,25.
    expect(placa(0.1)).toBe(25); // Pladur: 15 a 26 mm
    expect(placa(0.15)).toBe(37.5); // Pladur: 39 mm
    expect(placa(0.25)).toBe(62.5); // Pladur: 52 mm
    expect(placa(0.1)).toBeGreaterThanOrEqual(15);
    expect(placa(0.25)).toBeGreaterThanOrEqual(52);
  });
});

describe('la protección de un elemento de hormigón', () => {
  const base = { faltaAm: 9, faltaB: 0, clase: 120 as const, enTecho: false };

  it('el mortero de yeso cubre el déficit de recubrimiento con la equivalencia de 1,8', () => {
    const p = proteccionHormigon(f('morteroYeso'), base);
    expect(EQUIVALENCIA_YESO).toBe(1.8);
    expect(p.espesor).toBe(5); // 9 / 1,8 = 5 mm exactos
    expect(p.cuenta).toContain('9 / 1,8 = 5 mm');
  });

  it('y redondea al alza al escalón de 5 mm', () => {
    expect(proteccionHormigon(f('morteroYeso'), { ...base, faltaAm: 10 }).espesor).toBe(10);
  });

  it('pero NO arregla un déficit de sección: la equivalencia es a efectos del eje', () => {
    const p = proteccionHormigon(f('morteroYeso'), { ...base, faltaAm: 0, faltaB: 50 });
    expect(p.espesor).toBeNull();
    expect(p.aplicable).toBe(false);
    expect(p.avisos.join(' ')).toContain('50 mm de sección, no de recubrimiento');
    expect(p.avisos.join(' ')).toContain('UNE-EN 13381-3');
  });

  it('en techo y por encima de R 120, el C.2.4.2 lo manda a ensayo', () => {
    const p = proteccionHormigon(f('morteroYeso'), { ...base, clase: 180, enTecho: true });
    expect(p.avisos.join(' ')).toContain('sólo puede justificarse mediante ensayo');
  });

  it('y en techo hasta R 120, recomienda proyectarlo', () => {
    const p = proteccionHormigon(f('morteroYeso'), { ...base, enTecho: true });
    expect(p.avisos.join(' ')).toContain('por proyección');
    expect(p.espesor).toBe(5);
  });

  it('cualquier otro producto va a la UNE-EN 13381-3 y aquí no se calcula', () => {
    const p = proteccionHormigon(f('ensayoHormigon'), base);
    expect(p.espesor).toBeNull();
    expect(p.avisos.join(' ')).toContain('13381-3');
  });
});
