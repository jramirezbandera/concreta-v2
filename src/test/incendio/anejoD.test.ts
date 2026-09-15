/**
 * El Anejo D: cuánto revestimiento necesita un elemento de acero.
 *
 * La tabla D.1 es la más peligrosa de transcribir de todo el DB SI: está
 * construida con CELDAS COMBINADAS VERTICALMENTE, y el texto extraído del PDF
 * las colapsa dejando una tabla mal alineada que sigue teniendo pinta de tabla.
 * Los tests de abajo fijan a mano las casillas de los bordes de cada bloque
 * combinado —las que se moverían primero si alguien la volviera a transcribir
 * mal— y comprueban la forma: seis clases, siete masividades, tres bandas.
 *
 * La transcripción se hizo reconstruyendo la rejilla de la propia página 70 del
 * PDF (sus líneas horizontales, columna a columna) y cotejando después contra
 * la página rasterizada. Si alguna vez hay que repetirlo, hágase igual.
 *
 * Y lo otro que se fija aquí es lo que la tabla NO dice: no hay columna para
 * μfi ≥ 0,70, no hay filas por encima de 300 m⁻¹, y hay casillas con un guion.
 * En los tres casos extrapolar sería inventarse un espesor de protección.
 */

import { describe, expect, it } from 'vitest';
import { CLASES_R } from '../../lib/incendio/anejoC';
import {
  bandaDeMufi,
  entradaAceroInicial,
  filaDeMasividad,
  masividadDePerfil,
  MASIVIDADES_D1,
  resistenciaAcero,
  TABLA_D1,
  type EntradaAcero,
} from '../../lib/incendio/anejoD';
import { getProfile } from '../../data/steelProfiles';

const acero = (o: Partial<EntradaAcero> = {}): EntradaAcero => ({ ...entradaAceroInicial(), ...o });

/** Las tres columnas de una fila, para cotejarlas de un vistazo. */
const fila = (clase: (typeof CLASES_R)[number], amv: number) =>
  TABLA_D1[clase].find(([m]) => m === amv)?.slice(1);

describe('la tabla D.1, celda a celda en los bordes de los bloques combinados', () => {
  it('tiene las seis clases con sus siete masividades', () => {
    for (const c of CLASES_R) {
      expect(TABLA_D1[c]).toHaveLength(MASIVIDADES_D1.length);
      expect(TABLA_D1[c].map(([m]) => m)).toEqual([...MASIVIDADES_D1]);
    }
  });

  it('el 0,00 de la R 30 sólo está en las dos columnas de menos carga, y sólo a 30 m⁻¹', () => {
    expect(fila(30, 30)).toEqual([0.05, 0, 0]);
    expect(fila(30, 50)).toEqual([0.05, 0.05, 0.05]);
  });

  it('la R 30 sube a 0,10 a partir de 250, salvo en la columna de menos carga', () => {
    expect(fila(30, 200)).toEqual([0.05, 0.05, 0.05]);
    expect(fila(30, 250)).toEqual([0.1, 0.1, 0.05]);
    expect(fila(30, 300)).toEqual([0.1, 0.1, 0.05]);
  });

  it('el salto de la R 90 entre 30 y 50 m⁻¹ es de los grandes, y es real', () => {
    expect(fila(90, 30)).toEqual([0.05, 0.05, 0.05]);
    expect(fila(90, 50)).toEqual([0.15, 0.1, 0.05]);
    expect(fila(90, 100)).toEqual([0.15, 0.1, 0.1]);
    expect(fila(90, 300)).toEqual([0.2, 0.2, 0.15]);
  });

  it('la R 60 y la R 120 en sus filas de cambio', () => {
    expect(fila(60, 200)).toEqual([0.15, 0.1, 0.1]);
    expect(fila(120, 30)).toEqual([0.1, 0.05, 0.05]);
    expect(fila(120, 150)).toEqual([0.2, 0.2, 0.15]);
    expect(fila(120, 300)).toEqual([0.25, 0.25, 0.2]);
  });

  it('la R 180 llega a 0,30 por escalones distintos en cada columna', () => {
    expect(fila(180, 100)).toEqual([0.25, 0.2, 0.2]);
    expect(fila(180, 200)).toEqual([0.3, 0.25, 0.25]);
    expect(fila(180, 300)).toEqual([0.3, 0.3, 0.3]);
  });

  it('y la R 240 se queda sin valor donde la tabla escribe un guion', () => {
    expect(fila(240, 100)).toEqual([0.3, 0.25, 0.25]);
    expect(fila(240, 150)).toEqual([null, 0.3, 0.3]);
    expect(fila(240, 200)).toEqual([null, null, 0.3]);
    expect(fila(240, 250)).toEqual([null, null, null]);
    expect(fila(240, 300)).toEqual([null, null, null]);
  });

  it('dentro de una fila, más carga nunca pide menos protección', () => {
    for (const c of CLASES_R) {
      for (const [, a, b, d] of TABLA_D1[c]) {
        if (a !== null && b !== null) expect(a).toBeGreaterThanOrEqual(b);
        if (b !== null && d !== null) expect(b).toBeGreaterThanOrEqual(d);
      }
    }
  });
});

describe('la masividad', () => {
  const ipe300 = getProfile('IPE', 300)!;

  it('un IPE 300 da los cuatro valores clásicos según cómo se caliente', () => {
    // h = 300, b = 150, tw = 7,1, A = 53,8 cm².
    expect(masividadDePerfil(ipe300, 'contorno4').amv).toBe(220); // 4b + 2h − 2tw
    expect(masividadDePerfil(ipe300, 'contorno3').amv).toBe(193); // sin la cara de arriba
    expect(masividadDePerfil(ipe300, 'cajon4').amv).toBe(167); // 2(h + b)
    expect(masividadDePerfil(ipe300, 'cajon3').amv).toBe(139); // 2h + b
  });

  it('el cajón siempre expone menos que el contorno, en todo el catálogo', () => {
    for (const p of [getProfile('IPE', 80)!, getProfile('HEB', 300)!, getProfile('IPN', 400)!]) {
      expect(masividadDePerfil(p, 'cajon4').amv).toBeLessThan(masividadDePerfil(p, 'contorno4').amv);
      expect(masividadDePerfil(p, 'cajon3').amv).toBeLessThan(masividadDePerfil(p, 'contorno3').amv);
    }
  });

  it('y la cuenta va escrita, que es lo que permite rehacerla', () => {
    expect(masividadDePerfil(ipe300, 'contorno3').cuenta).toContain('3·150 + 2·300 − 2·7,1');
  });

  it('la fila de la tabla es la siguiente masividad hacia arriba, nunca hacia abajo', () => {
    expect(filaDeMasividad(30)).toBe(30);
    expect(filaDeMasividad(31)).toBe(50);
    expect(filaDeMasividad(193)).toBe(200);
    expect(filaDeMasividad(300)).toBe(300);
    expect(filaDeMasividad(301)).toBeNull();
    // Por debajo de la primera fila también entra por ella.
    expect(filaDeMasividad(12)).toBe(30);
  });
});

describe('la banda de μfi', () => {
  it('cae en la columna que le toca', () => {
    expect(bandaDeMufi(0.65).indice).toBe(0);
    expect(bandaDeMufi(0.6).indice).toBe(0);
    expect(bandaDeMufi(0.55).indice).toBe(1);
    expect(bandaDeMufi(0.45).indice).toBe(2);
  });

  it('sin declarar se toma la más exigente, y se avisa de que se ha supuesto', () => {
    const b = bandaDeMufi(null);
    expect(b.indice).toBe(0);
    expect(b.aviso).toContain('más exigente');
  });

  it('por encima de 0,70 la tabla NO aplica: no hay columna y no se extrapola', () => {
    const b = bandaDeMufi(0.7);
    expect(b.indice).toBeNull();
    expect(b.banda).toBeNull();
    expect(b.aviso).toContain('D.2.2.1.3');
  });

  it('y por debajo de 0,40 se acota en la banda menor, diciéndolo', () => {
    const b = bandaDeMufi(0.25);
    expect(b.indice).toBe(2);
    expect(b.aviso).toContain('no baja más');
  });

  it('pero un μfi de cero no es un μfi: va a la banda MÁS exigente, como si no estuviera', () => {
    // Tecleado en sesión caía en la banda blanda (0,50 > μfi ≥ 0,40) y al
    // recargar `normalizar` lo tiraba y volvía a la exigente: dos documentos
    // del mismo estado. Ahora el motor lo trata como `normalizar`.
    const b = bandaDeMufi(0);
    expect(b.indice).toBe(0);
    expect(b.aviso).toContain('no es un coeficiente de sobredimensionado');
    expect(bandaDeMufi(-0.5).indice).toBe(0);
  });
});

describe('lo que hace falta para una R', () => {
  const viga = (o: Partial<EntradaAcero> = {}) => acero({ perfil: 'IPE 300', modo: 'contorno3', ...o });

  it('un IPE 300 con forjado encima pide 0,15 para R 90', () => {
    const r = resistenciaAcero(viga(), 90);
    expect(r.masividad).toBe(193);
    expect(r.filaAmV).toBe(200);
    expect(r.dLambda).toBe(0.15);
    expect(r.claseComprobada).toBe(90);
  });

  it('y los 97 minutos del Anejo B entran por la fila de la R 120', () => {
    const r = resistenciaAcero(viga(), 97);
    expect(r.claseComprobada).toBe(120);
    expect(r.dLambda).toBe(0.2);
  });

  it('el perfil desnudo no llega ni a R 30, y eso se dice sin rodeos', () => {
    const r = resistenciaAcero(viga(), 90);
    expect(r.alcanzaDesnudo).toBeNull();
    expect(r.avisos.join(' ')).toContain('no alcanza ni R 30');
  });

  it('salvo en la esquina de la tabla donde sí llega', () => {
    // 30 m⁻¹ es una sección muy maciza; con μfi < 0,60 la tabla escribe 0,00.
    const r = resistenciaAcero(acero({ masividadManual: 30, mufi: 0.55 }), 30);
    expect(r.alcanzaDesnudo).toBe(30);
    expect(r.dLambda).toBe(0);
    expect(r.avisos.join(' ')).toContain('sin revestir');
  });

  it('en cajón el mismo perfil baja de fila y de protección', () => {
    expect(resistenciaAcero(viga({ modo: 'cajon3' }), 90).filaAmV).toBe(150);
    expect(resistenciaAcero(viga({ modo: 'cajon3' }), 90).dLambda).toBe(0.15);
    expect(resistenciaAcero(viga({ modo: 'cajon3' }), 60).dLambda).toBe(0.1);
    expect(resistenciaAcero(viga({ modo: 'contorno4' }), 60).dLambda).toBe(0.15);
  });
});

describe('lo que la tabla no resuelve', () => {
  it('un perfil pequeño se sale por arriba de la tabla y no se extrapola', () => {
    // Un IPE 80 por su contorno pasa de 400 m⁻¹.
    const r = resistenciaAcero(acero({ perfil: 'IPE 80', modo: 'contorno4' }), 60);
    expect(r.masividad).toBeGreaterThan(300);
    expect(r.dLambda).toBeNull();
    expect(r.filaAmV).toBeNull();
    expect(r.avisos.join(' ')).toContain('fuera de tabla');
  });

  it('una casilla con guion se enuncia como lo que es, no como un cero', () => {
    const r = resistenciaAcero(acero({ masividadManual: 200, mufi: 0.65 }), 240);
    expect(r.dLambda).toBeNull();
    expect(r.avisos.join(' ')).toContain('no da valor');
    expect(r.avisos.join(' ')).toContain('bajar la masividad');
  });

  it('con μfi de 0,75 no hay columna a la que ir', () => {
    const r = resistenciaAcero(acero({ masividadManual: 100, mufi: 0.75 }), 60);
    expect(r.dLambda).toBeNull();
    expect(r.banda).toBeNull();
  });

  it('sin perfil ni masividad no se dice nada', () => {
    const r = resistenciaAcero(acero(), 60);
    expect(r.faltan.join(' ')).toContain('masividad');
    expect(r.dLambda).toBeNull();
  });

  it('y por encima de la R 240 la tabla se acaba', () => {
    const r = resistenciaAcero(acero({ masividadManual: 100 }), 300);
    expect(r.dLambda).toBeNull();
    expect(r.avisos.join(' ')).toContain('llega a R 240');
  });
});

describe('los soportes, que tienen sus propias condiciones', () => {
  it('sin estructura arriostrada la D.1 no vale, y se remite al método general', () => {
    const r = resistenciaAcero(
      acero({ tipo: 'soporte', perfil: 'HEB 300', arriostrado: false }),
      90,
    );
    expect(r.avisos.join(' ')).toContain('D.2.2.1.2');
    expect(r.avisos.join(' ')).toContain('D.2.2.1.3');
  });

  it('revestido de fábrica no pasa por la tabla: vale lo que valga la fábrica', () => {
    const r = resistenciaAcero(
      acero({ tipo: 'soporte', revestidoFabrica: true, rFabrica: 120 }),
      90,
    );
    expect(r.alcanzaDesnudo).toBe(120);
    expect(r.dLambda).toBe(0);
    expect(r.avisos.join(' ')).toContain('D.2.2.1.1');
  });

  it('y sin decir cuánto vale esa fábrica, es un hueco', () => {
    const r = resistenciaAcero(acero({ tipo: 'soporte', revestidoFabrica: true }), 90);
    expect(r.faltan.join(' ')).toContain('fábrica');
  });

  it('la clase 4 arrastra el tope de 350 ºC, que la tabla no comprueba', () => {
    const r = resistenciaAcero(acero({ masividadManual: 100, clase4: true }), 60);
    expect(r.avisos.join(' ')).toContain('350 ºC');
  });
});
