/**
 * Las tablas 3.1 y 3.2 del DB SI 6, celda a celda contra el papel.
 *
 * La tabla se copia del PDF del CTE (Ministerio de Vivienda y Agenda Urbana),
 * sección SI 6, apartado 3. Se asevera entera y no por muestreo: una celda mal
 * copiada no se nota nunca —sale una R plausible— y acaba en una memoria
 * firmada.
 *
 * Las cuatro llamadas al pie son la mitad de la tabla y la mitad del riesgo:
 *
 *   (1) la R de un suelo que separa sectores la manda el sector INFERIOR;
 *   (2) en unifamiliares adosadas, la estructura común va como Residencial Vivienda;
 *   (3) R 180 en el sótano de Comercial / Pública concurrencia / Hospitalario
 *       si el edificio pasa de 28 m de altura de evacuación;
 *   (4) R 180 en aparcamiento robotizado.
 */

import { describe, expect, it } from 'vitest';
import {
  rExigida,
  rRiesgoEspecial,
  REGLAS_SUELTAS,
  TABLA_3_1,
  TABLA_3_2,
  USOS_DB_SI,
  type UsoDbSi,
} from '../../lib/incendio/tabla31';

/** La tabla tal como está impresa: sótano · ≤15 m · ≤28 m · >28 m. */
const PAPEL: Record<UsoDbSi, [number | null, number | null, number | null, number | null]> = {
  viviendaUnifamiliar: [30, 30, null, null],
  residencialVivienda: [120, 60, 90, 120],
  residencialPublico: [120, 60, 90, 120],
  docente: [120, 60, 90, 120],
  administrativo: [120, 60, 90, 120],
  comercial: [120, 90, 120, 180],
  publicaConcurrencia: [120, 90, 120, 180],
  hospitalario: [120, 90, 120, 180],
  aparcamientoExclusivo: [90, 90, 90, 90],
  aparcamientoBajoOtroUso: [120, 120, 120, 120],
};

describe('la tabla 3.1, contra el papel', () => {
  it('tiene las diez filas de la norma y ninguna más', () => {
    expect(Object.keys(TABLA_3_1).sort()).toEqual(Object.keys(PAPEL).sort());
    expect(USOS_DB_SI.map((u) => u.id).sort()).toEqual(Object.keys(PAPEL).sort());
  });

  for (const [uso, [sotano, h15, h28, mas28]] of Object.entries(PAPEL) as [
    UsoDbSi,
    [number | null, number | null, number | null, number | null],
  ][]) {
    it(`${uso}: ${sotano} / ${h15} / ${h28} / ${mas28}`, () => {
      expect(TABLA_3_1[uso]).toEqual({ sotano, h15, h28, mas28 });
      // Y por la puerta de delante, que es la que usa el módulo.
      expect(rExigida({ uso, bajoRasante: true, alturaEvacuacion: 10 }).minutos).toBe(sotano);
      expect(rExigida({ uso, bajoRasante: false, alturaEvacuacion: 10 }).minutos).toBe(h15);
      expect(rExigida({ uso, bajoRasante: false, alturaEvacuacion: 20 }).minutos).toBe(h28);
      expect(rExigida({ uso, bajoRasante: false, alturaEvacuacion: 40 }).minutos).toBe(mas28);
    });
  }

  it('los bordes de banda caen donde dice la tabla', () => {
    const r = (h: number) => rExigida({ uso: 'residencialVivienda', bajoRasante: false, alturaEvacuacion: h }).minutos;
    expect(r(15)).toBe(60);
    expect(r(15.01)).toBe(90);
    expect(r(28)).toBe(90);
    expect(r(28.01)).toBe(120);
  });
});

describe('las llamadas al pie', () => {
  it('(2) la estructura común de unas adosadas va como Residencial Vivienda', () => {
    const suelta = rExigida({ uso: 'viviendaUnifamiliar', bajoRasante: false, alturaEvacuacion: 6 });
    expect(suelta.minutos).toBe(30);

    const comun = rExigida({ uso: 'viviendaUnifamiliar', bajoRasante: false, alturaEvacuacion: 6, adosada: true });
    expect(comun.minutos).toBe(60);
    expect(comun.referencia).toContain('Residencial Vivienda');
    expect(comun.avisos.join(' ')).toContain('estructura común');
  });

  it('(3) el sótano de un comercial pasa a R 180 por encima de 28 m', () => {
    expect(rExigida({ uso: 'comercial', bajoRasante: true, alturaEvacuacion: 28 }).minutos).toBe(120);
    const alto = rExigida({ uso: 'comercial', bajoRasante: true, alturaEvacuacion: 28.5 });
    expect(alto.minutos).toBe(180);
    expect(alto.referencia).toContain('llamada 3');
  });

  it('(3) no toca a los usos que no la llevan', () => {
    expect(rExigida({ uso: 'residencialVivienda', bajoRasante: true, alturaEvacuacion: 40 }).minutos).toBe(120);
    expect(rExigida({ uso: 'docente', bajoRasante: true, alturaEvacuacion: 40 }).minutos).toBe(120);
  });

  it('(4) el aparcamiento robotizado bajo otro uso sube a R 180, en sótano y sobre rasante', () => {
    const s = rExigida({ uso: 'aparcamientoBajoOtroUso', bajoRasante: true, alturaEvacuacion: 10, robotizado: true });
    expect(s.minutos).toBe(180);
    expect(s.referencia).toContain('robotizado');
    expect(
      rExigida({ uso: 'aparcamientoBajoOtroUso', bajoRasante: false, alturaEvacuacion: 10, robotizado: true }).minutos,
    ).toBe(180);
  });
});

describe('lo que la tabla no dice', () => {
  it('una unifamiliar de más de 15 m no está contemplada: no es «sin exigencia»', () => {
    const r = rExigida({ uso: 'viviendaUnifamiliar', bajoRasante: false, alturaEvacuacion: 20 });
    expect(r.minutos).toBeNull();
    expect(r.avisos.join(' ')).toContain('no contempla');
  });

  it('sin altura de evacuación no se entra en la tabla sobre rasante', () => {
    const r = rExigida({ uso: 'administrativo', bajoRasante: false, alturaEvacuacion: null });
    expect(r.minutos).toBeNull();
    expect(r.avisos.join(' ')).toContain('Sin la altura de evacuación');
  });

  it('pero el sótano sí se sabe sin ella, salvo donde manda la llamada (3)', () => {
    expect(rExigida({ uso: 'administrativo', bajoRasante: true, alturaEvacuacion: null }).minutos).toBe(120);
    // Sin saber la altura no se puede aplicar la llamada 3: se queda en R 120.
    expect(rExigida({ uso: 'comercial', bajoRasante: true, alturaEvacuacion: null }).minutos).toBe(120);
  });
});

/**
 * El garaje: la frontera está en el DB SI 1 y en el Anejo SI A, no en la tabla
 * 3.1, y por eso es la fila que más se equivoca. Ninguno de los dos casos vale
 * R 30: el de la unifamiliar sube a R 90 por la tabla 3.2, y el de hasta
 * 100 m² tampoco llega a la fila de aparcamiento.
 */
describe('el garaje no cabe en la fila que parece', () => {
  it('la vivienda unifamiliar avisa de que su garaje va aparte, y de que son R 90', () => {
    const r = rExigida({ uso: 'viviendaUnifamiliar', bajoRasante: true, alturaEvacuacion: 8 });
    // La fila sigue siendo la que dice el papel para la VIVIENDA.
    expect(r.minutos).toBe(30);
    const dicho = r.avisos.join(' ');
    expect(dicho).toContain('garaje de una vivienda unifamiliar');
    expect(dicho).toContain('riesgo especial bajo');
    expect(dicho).toContain('R 90');
    expect(dicho).toContain('tabla 2.1 del DB SI 1');
  });

  it('y lo avisa esté donde esté, que el garaje de una unifamiliar no siempre es el sótano', () => {
    const r = rExigida({ uso: 'viviendaUnifamiliar', bajoRasante: false, alturaEvacuacion: 8 });
    expect(r.avisos.join(' ')).toContain('garaje de una vivienda unifamiliar');
  });

  it('las dos filas de aparcamiento recuerdan que empiezan en los 100 m²', () => {
    for (const uso of ['aparcamientoExclusivo', 'aparcamientoBajoOtroUso'] as const) {
      const r = rExigida({ uso, bajoRasante: true, alturaEvacuacion: 10 });
      expect(r.avisos.join(' ')).toContain('más de 100 m² construidos');
      expect(r.avisos.join(' ')).toContain('riesgo especial bajo');
    }
  });

  it('a los demás usos no les dice nada de garajes', () => {
    for (const uso of ['residencialVivienda', 'comercial', 'docente'] as const) {
      expect(rExigida({ uso, bajoRasante: false, alturaEvacuacion: 10 }).avisos).toEqual([]);
    }
  });

  it('el garaje declarado como toca no baja de la estructura de su planta', () => {
    // Un garaje en el sótano de una unifamiliar: R 90 por la 3.2, no el R 30
    // de la casa. Y en un edificio de viviendas, R 120 por la llamada (1).
    expect(rRiesgoEspecial('bajo', 30).minutos).toBe(90);
    expect(rRiesgoEspecial('bajo', 120).minutos).toBe(120);
  });
});

describe('la tabla 3.2, zonas de riesgo especial', () => {
  it('son R 90, R 120 y R 180', () => {
    expect(TABLA_3_2).toEqual({ bajo: 90, medio: 120, alto: 180 });
  });

  it('no baja de la R de la estructura portante de la planta (llamada 1)', () => {
    expect(rRiesgoEspecial('bajo', null).minutos).toBe(90);
    expect(rRiesgoEspecial('bajo', 60).minutos).toBe(90);
    const elevada = rRiesgoEspecial('bajo', 120);
    expect(elevada.minutos).toBe(120);
    expect(elevada.avisos.join(' ')).toContain('no admite menos que la estructura portante');
  });

  it('y baja a R 30 bajo una cubierta cuyo fallo no compromete nada', () => {
    const r = rRiesgoEspecial('alto', 180, true);
    expect(r.minutos).toBe(30);
    expect(r.referencia).toContain('llamada 1');
  });
});

describe('las reglas que no están tabuladas', () => {
  it('están las cinco del § 3.2 al § 4.2', () => {
    expect(REGLAS_SUELTAS.map((r) => r.id)).toEqual([
      'cubiertaLigera',
      'escaleraProtegida',
      'escaleraEspecialmenteProtegida',
      'secundario',
      'carpa',
    ]);
  });

  it('la escalera especialmente protegida y el elemento secundario no exigen nada', () => {
    const sinR = REGLAS_SUELTAS.filter((r) => r.minutos === null).map((r) => r.id);
    expect(sinR).toEqual(['escaleraEspecialmenteProtegida', 'secundario']);
  });

  it('y las demás son R 30', () => {
    for (const r of REGLAS_SUELTAS.filter((x) => x.minutos !== null)) expect(r.minutos).toBe(30);
  });
});
