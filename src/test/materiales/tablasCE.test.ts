/**
 * Integridad de las tablas del Código Estructural transcritas a mano.
 *
 * Una tabla de 21 columnas × 3 filas copiada de un PDF del BOE se estropea de
 * dos maneras: una columna desplazada (todos los valores corridos un puesto) o
 * un dedo. Los tests de forma cazan lo primero; las verificaciones puntuales,
 * releídas del boletín, cazan lo segundo.
 */

import { describe, expect, it } from 'vitest';
import {
  AC_MAX,
  CEMENTO_MIN,
  CLASE_EJECUCION,
  CMIN_CLORUROS_ARMADO,
  CMIN_XC123,
  CMIN_XC4,
  DELTA_CDEV,
  FCK_MIN,
  FCTK_005,
  FCTM_TABULADA,
  ORDEN_CLASES,
  familiaCarbonatacion,
  familiaCloruros,
} from '../../lib/materiales/tablasCE';
import type { ClaseExposicion, TipoHormigon } from '../../lib/materiales/types';

const TIPOS: TipoHormigon[] = ['masa', 'armado', 'pretensado'];
const CORROSION: ClaseExposicion[] = ['XC1', 'XC2', 'XC3', 'XC4', 'XS1', 'XS2', 'XS3', 'XD1', 'XD2', 'XD3'];

describe('forma de las tablas 43.2.1.a y 43.2.1.b', () => {
  it('las 21 clases de la tabla 27.1.a están todas y en orden', () => {
    expect(ORDEN_CLASES).toHaveLength(21);
    expect(new Set(ORDEN_CLASES).size).toBe(21);
    expect(ORDEN_CLASES[0]).toBe('X0');
    expect(ORDEN_CLASES.at(-1)).toBe('XM3');
  });

  it('cada tabla cubre las 21 clases para los tres tipos de hormigón', () => {
    for (const tipo of TIPOS) {
      for (const clase of ORDEN_CLASES) {
        expect(AC_MAX[tipo]).toHaveProperty(clase);
        expect(CEMENTO_MIN[tipo]).toHaveProperty(clase);
        expect(FCK_MIN[tipo]).toHaveProperty(clase);
      }
    }
  });

  it('el hormigón en masa tiene guion exactamente en las clases de corrosión', () => {
    // Es la comprobación que detecta un desplazamiento de columna: si la fila
    // «masa» se corre un puesto, los null dejan de caer sobre XC/XS/XD.
    for (const clase of ORDEN_CLASES) {
      const esCorrosion = CORROSION.includes(clase);
      expect(AC_MAX.masa[clase] === null).toBe(esCorrosion);
      expect(CEMENTO_MIN.masa[clase] === null).toBe(esCorrosion);
      expect(FCK_MIN.masa[clase] === null).toBe(esCorrosion);
    }
  });

  it('armado y pretensado no tienen ningún hueco', () => {
    for (const tipo of ['armado', 'pretensado'] as const) {
      for (const clase of ORDEN_CLASES) {
        expect(AC_MAX[tipo][clase]).not.toBeNull();
        expect(CEMENTO_MIN[tipo][clase]).not.toBeNull();
        expect(FCK_MIN[tipo][clase]).not.toBeNull();
      }
    }
  });

  it('el pretensado nunca es menos exigente que el armado', () => {
    for (const clase of ORDEN_CLASES) {
      const acA = AC_MAX.armado[clase]!;
      const acP = AC_MAX.pretensado[clase]!;
      expect(acP).toBeLessThanOrEqual(acA);
      expect(CEMENTO_MIN.pretensado[clase]!).toBeGreaterThanOrEqual(CEMENTO_MIN.armado[clase]!);
      expect(FCK_MIN.pretensado[clase]!).toBeGreaterThanOrEqual(FCK_MIN.armado[clase]!);
    }
  });

  it('dentro de XC la exigencia crece de XC1 a XC4', () => {
    const ac = (['XC1', 'XC2', 'XC3', 'XC4'] as const).map((c) => AC_MAX.armado[c]!);
    const cem = (['XC1', 'XC2', 'XC3', 'XC4'] as const).map((c) => CEMENTO_MIN.armado[c]!);
    for (let i = 1; i < ac.length; i++) {
      expect(ac[i]).toBeLessThanOrEqual(ac[i - 1]);
      expect(cem[i]).toBeGreaterThanOrEqual(cem[i - 1]);
    }
  });
});

describe('verificación puntual contra el BOE-A-2021-13681', () => {
  it('tabla 43.2.1.a, hormigón armado', () => {
    expect(CEMENTO_MIN.armado.X0).toBe(250);
    expect(CEMENTO_MIN.armado.XC2).toBe(275);
    expect(CEMENTO_MIN.armado.XS3).toBe(350);
    expect(CEMENTO_MIN.armado.XD2).toBe(325);
    expect(CEMENTO_MIN.armado.XA3).toBe(350);
    expect(AC_MAX.armado.XC4).toBe(0.55);
    expect(AC_MAX.armado.XS3).toBe(0.45);
    expect(AC_MAX.armado.XF1).toBe(0.55);
  });

  it('tabla 43.2.1.a, hormigón en masa', () => {
    expect(CEMENTO_MIN.masa.X0).toBe(200);
    expect(CEMENTO_MIN.masa.XF2).toBe(300);
    expect(AC_MAX.masa.XA3).toBe(0.45);
  });

  it('tabla 43.2.1.b, resistencias mínimas esperadas', () => {
    expect(FCK_MIN.masa.X0).toBe(20);
    expect(FCK_MIN.armado.XC1).toBe(25);
    expect(FCK_MIN.armado.XC3).toBe(30);
    expect(FCK_MIN.armado.XS3).toBe(35);
    expect(FCK_MIN.pretensado.XD1).toBe(35);
  });

  it('tabla 44.2.1.1.a — recubrimientos por carbonatación', () => {
    const xc123 = (familia: 'CEM I' | 'otros', fckAlta: boolean) =>
      CMIN_XC123.find((f) => f.familia === familia && f.fckAlta === fckAlta)!.cmin;
    expect(xc123('CEM I', false)[50]).toBe(15);
    expect(xc123('otros', false)[50]).toBe(20);
    expect(xc123('otros', true)[100]).toBe(25);

    const xc4 = CMIN_XC4.find((f) => f.familia === 'otros' && !f.fckAlta)!.cmin;
    expect(xc4[50]).toBe(25);
    expect(xc4[100]).toBe(35);
  });

  it('tabla 44.2.1.1.b — recubrimientos por cloruros, hormigón armado', () => {
    expect(CMIN_CLORUROS_ARMADO.A[50].XS1).toBe(25);
    expect(CMIN_CLORUROS_ARMADO.B[50].XS1).toBe(30);
    expect(CMIN_CLORUROS_ARMADO.B[50].XD).toBe(40);
    expect(CMIN_CLORUROS_ARMADO.resto[50].XS1).toBe(40);
    // Las casillas «*» del boletín se guardan como null, nunca como número.
    expect(CMIN_CLORUROS_ARMADO.resto[50].XS3).toBeNull();
    expect(CMIN_CLORUROS_ARMADO.resto[100].XD).toBeNull();
  });

  it('los 100 años nunca piden menos recubrimiento que los 50', () => {
    for (const familia of ['A', 'B', 'resto'] as const) {
      for (const col of ['XS1', 'XS2', 'XS3', 'XD'] as const) {
        const a50 = CMIN_CLORUROS_ARMADO[familia][50][col];
        const a100 = CMIN_CLORUROS_ARMADO[familia][100][col];
        if (a50 !== null && a100 !== null) expect(a100).toBeGreaterThanOrEqual(a50);
      }
    }
  });

  it('tabla 43.4.1 — margen de recubrimiento', () => {
    expect(DELTA_CDEV.prefabricado_intenso).toBe(0);
    expect(DELTA_CDEV.in_situ_intenso).toBe(5);
    expect(DELTA_CDEV.normal).toBe(10);
  });

  it('tabla A19.3.1 — fctk;0,05 es el 70 % de fctm, redondeado a una décima', () => {
    for (const fck of Object.keys(FCTM_TABULADA).map(Number)) {
      const derivado = 0.7 * FCTM_TABULADA[fck];
      // 0,06 es la mayor diferencia real (fck 55, donde el boletín redondea a
      // partir de la fctm sin redondear). Más holgura escondería un dedo.
      expect(Math.abs(FCTK_005[fck] - derivado)).toBeLessThanOrEqual(0.061);
    }
  });

  it('tabla 91.1 — las doce combinaciones de clase de ejecución', () => {
    expect(Object.keys(CLASE_EJECUCION)).toHaveLength(12);
    expect(CLASE_EJECUCION['CC1|SC1|PC1']).toBe(1);
    expect(CLASE_EJECUCION['CC2|SC1|PC1']).toBe(2);
    expect(CLASE_EJECUCION['CC2|SC2|PC1']).toBe(3);
    expect(CLASE_EJECUCION['CC3|SC2|PC2']).toBe(4);
    for (const v of Object.values(CLASE_EJECUCION)) expect([1, 2, 3, 4]).toContain(v);
  });
});

describe('clasificación de cementos por familia', () => {
  it('la tabla 44.2.1.1.a sólo separa CEM I puro del resto', () => {
    expect(familiaCarbonatacion('CEM I', false)).toBe('CEM I');
    expect(familiaCarbonatacion('CEM I', true)).toBe('otros'); // con adiciones deja de serlo
    expect(familiaCarbonatacion('CEM II/B-S', false)).toBe('otros');
  });

  it('la tabla 44.2.1.1.b separa tres familias', () => {
    expect(familiaCloruros('CEM III/A', false, false)).toBe('A');
    expect(familiaCloruros('CEM II/A-D', false, false)).toBe('A');
    expect(familiaCloruros('CEM II/B-S', false, false)).toBe('B');
    expect(familiaCloruros('CEM II/B-P', false, false)).toBe('B');
    expect(familiaCloruros('CEM I', false, false)).toBe('resto');
    // Las adiciones suben a la familia A cualquiera que sea el cemento.
    expect(familiaCloruros('CEM I', true, false)).toBe('A');
    expect(familiaCloruros('CEM I', false, true)).toBe('A');
  });
});
