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
