/**
 * El parser y las claves de busqueda del harvester del Anejo 1.
 *
 * Vive como `*.golden.test.ts` (proyecto `node`, excluido del typecheck de
 * `tsconfig.app.json`) porque importa un `.mjs` de `scripts/`, que no esta bajo
 * `include: ["src"]`. No usa red: el harvester solo barre cuando se le invoca
 * como programa.
 *
 * Lo que se protege aqui no es cosmetico. Si una clave de busqueda deja de
 * generarse, el municipio existe en el dataset pero el usuario NO lo encuentra,
 * y el modulo le dice "no figura en el Anejo 1", que ademas es un mensaje que
 * significa "la Norma no te obliga". Un fallo de indexado se disfraza de
 * exencion normativa.
 */
import { describe, expect, it } from 'vitest';

// @ts-expect-error - script de desarrollo en JS, sin tipos
import { clavesDe, parsearFila, plegar } from '../../../scripts/harvest-ign-hazard.mjs';

/** Fila tal cual la devuelve el servicio del IGN (verificada el 2026-08-26). */
const GRANADA = {
  gid: 1599,
  ine_mun: '18087',
  ine_pro: '18',
  nombre: 'Granada',
  x: '-33555.46',
  y: '371039.63',
  aceleracion: '0.23',
  coeficient: '(1.0)',
};

describe('parsearFila', () => {
  it('lee la fila real de Granada', () => {
    expect(parsearFila(GRANADA)).toEqual({
      ine: '18087',
      nombre: 'Granada',
      gid: 1599,
      ab: 0.23,
      k: 1.0,
    });
  });

  it('K viene entre parentesis, que es como lo denota el Anejo 1', () => {
    expect(parsearFila({ ...GRANADA, coeficient: '(1.3)' }).k).toBe(1.3);
    expect(parsearFila({ ...GRANADA, coeficient: '1.3' }).k).toBe(1.3);
  });

  it('ab y K nulos son DATO, no fallo: el municipio no figura en el Anejo 1', () => {
    const fuera = parsearFila({ ...GRANADA, ine_mun: '33044', nombre: 'Oviedo', aceleracion: null, coeficient: null });
    expect(fuera.ab).toBeNull();
    expect(fuera.k).toBeNull();
  });

  it('rompe si ab y K vienen desparejados', () => {
    expect(() => parsearFila({ ...GRANADA, aceleracion: null })).toThrow(/desparejados/);
    expect(() => parsearFila({ ...GRANADA, coeficient: null })).toThrow(/desparejados/);
  });

  it('rompe ante ab o K ilegibles en vez de escribir basura', () => {
    expect(() => parsearFila({ ...GRANADA, aceleracion: 'o,o4' })).toThrow(/ab ilegible/);
    expect(() => parsearFila({ ...GRANADA, coeficient: '(l,o)' })).toThrow(/K ilegible/);
  });

  it('rellena el codigo INE a cinco digitos', () => {
    expect(parsearFila({ ...GRANADA, ine_mun: '1001' }).ine).toBe('01001');
  });
});

describe('plegar', () => {
  it('quita acentos y enyes y baja a minusculas', () => {
    expect(plegar('Jávea')).toBe('javea');
    expect(plegar('A Coruña')).toBe('a coruna');
    expect(plegar('Sant Hipòlit de Voltregà')).toBe('sant hipolit de voltrega');
  });

  it('colapsa la puntuacion en espacios', () => {
    expect(plegar("L'Hospitalet de Llobregat")).toBe('l hospitalet de llobregat');
    expect(plegar('Vitoria-Gasteiz')).toBe('vitoria gasteiz');
  });
});

describe('clavesDe', () => {
  it('desinvierte el articulo que el IGN pone al final', () => {
    // 8,5 % de los nombres. Quien busca teclea "la union", no "union la".
    expect(clavesDe('Unión (La)')).toEqual(expect.arrayContaining(['union', 'la union']));
    expect(clavesDe('Coruña (A)')).toEqual(expect.arrayContaining(['coruna', 'a coruna']));
    expect(clavesDe('Bòrdes (Es)')).toEqual(expect.arrayContaining(['bordes', 'es bordes']));
  });

  it('indexa las DOS formas de un nombre bilingue', () => {
    // 1,4 % de los nombres. Sin esto, quien escribe "Alacant" no encuentra
    // Alicante, que es capital de provincia con ab alta.
    expect(clavesDe('Alicante/Alacant')).toEqual(expect.arrayContaining(['alicante', 'alacant']));
    expect(clavesDe('Jávea/Xàbia')).toEqual(expect.arrayContaining(['javea', 'xabia']));
    expect(clavesDe('Alcoy/Alcoi')).toEqual(expect.arrayContaining(['alcoy', 'alcoi']));
  });

  it('combina barra y articulo en el mismo nombre', () => {
    const c = clavesDe('Benitachell/Poble Nou de Benitatxell (el)');
    expect(c).toEqual(
      expect.arrayContaining([
        'benitachell',
        'poble nou de benitatxell',
        'el poble nou de benitatxell',
      ]),
    );
  });

  it('NO desinvierte un parentesis que no es articulo', () => {
    const c = clavesDe('Villanueva (Zaragoza)');
    expect(c).toContain('villanueva zaragoza');
    expect(c).not.toContain('zaragoza villanueva');
  });

  it('no devuelve claves vacias ni repetidas', () => {
    for (const n of ['Granada', 'Unión (La)', 'Alicante/Alacant', 'Vitoria-Gasteiz']) {
      const c: string[] = clavesDe(n);
      expect(c.every((s) => s.length > 0)).toBe(true);
      expect(new Set(c).size).toBe(c.length);
    }
  });
});
