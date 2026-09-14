/**
 * De los sectores tecleados a la R que se declara.
 *
 * Lo que se fija aquí: que la R sale de la tabla, que pisarla a mano deja
 * rastro —una memoria firmada tiene que distinguir la norma de la decisión de
 * alguien—, y que «la norma no exige nada» NO es lo mismo que «falta un dato».
 * Confundir esos dos bloquearía la exportación de una obra que está completa.
 */

import { describe, expect, it } from 'vitest';
import {
  claseRegla,
  claseRiesgo,
  claseUso,
  clasesValidas,
  resolverSectores,
  type SectorEntrada,
} from '../../lib/incendio/sectores';
import { datosAnejoBIniciales } from '../../lib/incendio/sectores';
import { USOS_DB_SI } from '../../lib/incendio/tabla31';

const sector = (o: Partial<SectorEntrada> = {}): SectorEntrada => ({
  id: 's1',
  nombre: 'Plantas sobre rasante',
  clase: claseUso('residencialVivienda'),
  sotano: false,
  robotizado: false,
  adosada: false,
  bajoCubiertaSinRiesgo: false,
  minutosManual: null,
  anejoB: null,
  ...o,
});

const uno = (o: Partial<SectorEntrada> = {}, altura: number | null = 10) =>
  resolverSectores([sector(o)], altura)[0];

describe('un sector de uso', () => {
  it('saca su R de la tabla 3.1 y dice de dónde', () => {
    const r = uno();
    expect(r.minutos).toBe(60);
    expect(r.derivada).toBe(60);
    expect(r.aMano).toBe(false);
    expect(r.referencia).toContain('tabla 3.1');
    expect(r.referencia).toContain('Residencial Vivienda');
    expect(r.hueco).toBe(false);
  });

  it('bajo rasante entra por la columna de sótano', () => {
    expect(uno({ sotano: true }).minutos).toBe(120);
  });

  it('sin altura de evacuación se queda sin resolver, y es un hueco', () => {
    const r = uno({}, null);
    expect(r.minutos).toBeNull();
    expect(r.hueco).toBe(true);
    expect(r.avisos.join(' ')).toContain('Sin la altura de evacuación');
  });
});

describe('pisar la tabla a mano', () => {
  it('se declara lo tecleado, y el documento dice que lo declaró el proyectista', () => {
    const r = uno({ minutosManual: 120 });
    expect(r.minutos).toBe(120);
    expect(r.derivada).toBe(60);
    expect(r.aMano).toBe(true);
    expect(r.referencia).toBe('declarado por el proyectista');
    expect(r.avisos.join(' ')).toContain('Declarado R 120 a mano; la tabla 3.1');
  });

  it('coincidir con la tabla no deja aviso', () => {
    expect(uno({ minutosManual: 60 }).avisos).toEqual([]);
  });

  it('y rellena un sector que la tabla no sabe resolver', () => {
    const r = uno({ clase: claseUso('viviendaUnifamiliar'), minutosManual: 90 }, 20);
    expect(r.minutos).toBe(90);
    expect(r.hueco).toBe(false);
  });
});

describe('las zonas de riesgo especial', () => {
  it('no bajan de la R de la estructura portante de su lado de la rasante', () => {
    // El sector de uso de sobre rasante pide R 90; la zona de riesgo bajo
    // pediría R 90 también, así que no se mueve.
    const rs = resolverSectores(
      [
        sector({ id: 'a', nombre: 'Plantas', clase: claseUso('comercial') }),
        sector({ id: 'b', nombre: 'Sala de calderas', clase: claseRiesgo('bajo') }),
      ],
      10,
    );
    expect(rs[0].minutos).toBe(90);
    expect(rs[1].minutos).toBe(90);
  });

  it('y sí suben cuando la planta pide más', () => {
    const rs = resolverSectores(
      [
        sector({ id: 'a', nombre: 'Plantas', clase: claseUso('comercial') }),
        sector({ id: 'b', nombre: 'Almacén', clase: claseRiesgo('bajo') }),
      ],
      40, // comercial > 28 m → R 180
    );
    expect(rs[0].minutos).toBe(180);
    expect(rs[1].minutos).toBe(180);
    expect(rs[1].avisos.join(' ')).toContain('no admite menos que la estructura portante');
  });

  it('salvo bajo una cubierta cuyo fallo no compromete nada', () => {
    const rs = resolverSectores(
      [
        sector({ id: 'a', nombre: 'Plantas', clase: claseUso('comercial') }),
        sector({ id: 'b', nombre: 'Trastero bajo cubierta', clase: claseRiesgo('alto'), bajoCubiertaSinRiesgo: true }),
      ],
      40,
    );
    expect(rs[1].minutos).toBe(30);
  });
});

describe('los casos que la norma deja sin exigencia', () => {
  it('una escalera especialmente protegida no exige nada, y eso NO es un hueco', () => {
    const r = uno({ nombre: 'Escalera especialmente protegida', clase: claseRegla('escaleraEspecialmenteProtegida') });
    expect(r.minutos).toBeNull();
    expect(r.sinExigencia).toBe(true);
    expect(r.hueco).toBe(false);
    expect(r.referencia).toContain('§ 3.3');
  });

  it('un elemento secundario, igual', () => {
    expect(uno({ nombre: 'Entreplanta', clase: claseRegla('secundario') }).sinExigencia).toBe(true);
  });

  it('pero si se le pone una R a mano, deja de ser «sin exigencia»', () => {
    const r = uno({
      nombre: 'Escalera especialmente protegida',
      clase: claseRegla('escaleraEspecialmenteProtegida'),
      minutosManual: 30,
    });
    expect(r.sinExigencia).toBe(false);
    expect(r.minutos).toBe(30);
  });

  it('la cubierta ligera y la carpa son R 30 sin más cuenta', () => {
    expect(uno({ nombre: 'Cubierta', clase: claseRegla('cubiertaLigera') }).minutos).toBe(30);
    expect(uno({ nombre: 'Carpa', clase: claseRegla('carpa') }).minutos).toBe(30);
  });
});

describe('los huecos', () => {
  it('un sector sin decir qué es', () => {
    const r = uno({ clase: '' });
    expect(r.hueco).toBe(true);
    expect(r.minutos).toBeNull();
  });

  it('un sector sin nombre, aunque tenga R', () => {
    // Sin nombre no se puede imprimir: saldría «R60 en .».
    expect(uno({ nombre: '   ' }).hueco).toBe(true);
  });

  it('una clase que ya no existe se reconoce y no revienta', () => {
    const r = uno({ clase: 'uso:loQueSea' });
    expect(r.minutos).toBeNull();
    expect(r.hueco).toBe(true);
  });
});

describe('el catálogo de clases', () => {
  it('lista los diez usos, los tres riesgos y las cinco reglas', () => {
    const v = clasesValidas(USOS_DB_SI.map((u) => u.id));
    expect(v).toHaveLength(10 + 3 + 5);
    expect(v).toContain('uso:administrativo');
    expect(v).toContain('riesgo:medio');
    expect(v).toContain('regla:cubiertaLigera');
  });
});

/**
 * El tiempo equivalente del Anejo B, cuando un sector se acoge a él.
 *
 * El SI 6 § 3.1.b lo admite COMO ALTERNATIVA a la clase de la tabla 3.1, así
 * que la sustituye, y en minutos exactos. Lo que no puede pasar es que se
 * calcule y luego se declare la tabla igualmente: entonces no habría servido
 * de nada.
 */
describe('el tiempo equivalente sustituye a la tabla 3.1', () => {
  /** La geometría del caso de la hoja del estudio. */
  const geometria = {
    ...datosAnejoBIniciales(),
    af: 663,
    av: 15,
    ah: 0,
    h: 4.5,
    medidas: { deteccion: false, alarmaBomberos: false, extincion: true },
  };

  it('manda el te,d, y la referencia lo dice', () => {
    // Pública concurrencia a 20 m: la tabla 3.1 pediría R 120.
    const r = uno({ clase: claseUso('publicaConcurrencia'), anejoB: geometria }, 20);
    expect(r.deLaTabla).toBe(120);
    expect(r.minutos).toBe(97);
    expect(r.derivada).toBe(97);
    expect(r.referencia).toContain('Anejo B');
    expect(r.referencia).toContain('3.1.b');
    expect(r.hueco).toBe(false);
  });

  it('y saca de su uso la actividad y la carga de fuego, sin teclearlas', () => {
    const r = uno({ clase: claseUso('publicaConcurrencia'), anejoB: geometria }, 20);
    // Tabla B.3: pública concurrencia → 1,25. Tabla B.6: 365 MJ/m².
    expect(r.ted?.carga.dq2).toBe(1.25);
    expect(r.ted?.ted).toBeCloseTo(96.230172, 6);
  });

  it('y de la altura del edificio la fila de consecuencias', () => {
    // A 20 m, δc = 1,5; por encima de 28, 2,0.
    expect(uno({ clase: claseUso('publicaConcurrencia'), anejoB: geometria }, 20).ted?.carga.dc).toBe(1.5);
    expect(uno({ clase: claseUso('publicaConcurrencia'), anejoB: geometria }, 35).ted?.carga.dc).toBe(2);
  });

  it('avisa cuando el cálculo ha compensado, y cuánto', () => {
    const r = uno({ clase: claseUso('publicaConcurrencia'), anejoB: geometria }, 20);
    expect(r.avisos.join(' ')).toContain('97 min frente a los R 120 de la tabla 3.1');
  });

  it('y también cuando NO ha compensado, que es lo que nadie mira', () => {
    // Una vivienda pequeña: la tabla le pide R 60 y el anejo puede pedir más.
    const r = uno(
      {
        clase: claseUso('residencialVivienda'),
        anejoB: { ...geometria, af: 300, av: 6, h: 3 },
      },
      10,
    );
    expect(r.deLaTabla).toBe(60);
    if ((r.minutos as number) > 60) {
      expect(r.avisos.join(' ')).toContain('MÁS que los R 60');
      expect(r.avisos.join(' ')).toContain('no ha compensado');
    }
  });

  it('sin la geometría no se inventa un número: es un hueco y dice qué falta', () => {
    const r = uno({ clase: claseUso('publicaConcurrencia'), anejoB: datosAnejoBIniciales() }, 20);
    expect(r.minutos).toBeNull();
    expect(r.hueco).toBe(true);
    expect(r.avisos.join(' ')).toContain('la superficie del sector');
    expect(r.avisos.join(' ')).toContain('la altura del sector');
  });

  it('una zona de riesgo especial entra por su fila de la tabla B.3', () => {
    // Riesgo medio → δq2 = 1,40, y la carga de fuego hay que teclearla: la
    // tabla B.6 no tiene fila para un local de riesgo especial.
    const r = uno(
      { clase: claseRiesgo('medio'), anejoB: { ...geometria, qfkManual: 800 } },
      20,
    );
    expect(r.ted?.carga.dq2).toBe(1.4);
    expect(r.minutos).not.toBeNull();
  });

  it('y sin carga de fuego tecleada, una zona de riesgo no cierra', () => {
    const r = uno({ clase: claseRiesgo('medio'), anejoB: geometria }, 20);
    expect(r.minutos).toBeNull();
    expect(r.avisos.join(' ')).toContain('la densidad de carga de fuego');
  });

  it('declarar a mano sigue mandando por encima del te,d', () => {
    const r = uno(
      { clase: claseUso('publicaConcurrencia'), anejoB: geometria, minutosManual: 120 },
      20,
    );
    expect(r.minutos).toBe(120);
    expect(r.aMano).toBe(true);
    expect(r.avisos.join(' ')).toContain('el tiempo equivalente daba 97');
  });
});
