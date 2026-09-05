/**
 * Lo que este módulo publica: hechos ya derivados, nunca prosa ni bloques de
 * documento. Un consumidor (la ficha DB SE, sismo) razona con números, no con
 * cuadros ya rotulados.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { datosPublicacion, defaultCargasState, evaluar, MODULO_PUB, PUB_VERSION, publicarResultado } from '../../features/cargas-planta/state';
import { clavePublicacion, leerPublicacion } from '../../lib/pub';

beforeEach(() => {
  localStorage.clear();
});

function datos() {
  const s = defaultCargasState();
  s.emplazamiento = { provincia: '28', municipio: 'Madrid', altitud: 660 };
  s.plantas[2].nieve = { modo: 'manual', valor: 0.56, tsPub: null, inePub: null, faldon: null };
  s.plantas[0].zonas[0].uso = { ...s.plantas[0].zonas[0].uso, escalera: true, balcon: true };
  return datosPublicacion(s, evaluar(s, null))!;
}

describe('hechos, no prosa', () => {
  it('no viajan marcadores de nota, ni mensajes, ni bloques de documento', () => {
    const crudo = JSON.stringify(datos());
    expect(crudo).not.toContain('(*)');
    for (const clave of ['"mensajes"', '"trazas"', '"notas"', '"avisos"', '"errores"', '"kind"', '"severidad"', '"etiqueta"', '"rotulo"']) {
      expect(crudo, clave).not.toContain(clave);
    }
  });

  it('todo es serializable: ida y vuelta por JSON sin pérdida', () => {
    const d = datos();
    expect(JSON.parse(JSON.stringify(d))).toEqual(d);
  });

  it('viaja ya derivado: peso propio de la norma, sumas, ψ y qd, sin que el consumidor tenga el motor', () => {
    const d = datos();
    const baja = d.plantas[0].zonas[0];
    expect(baja.pp).toBe(5);
    expect(baja.qUso).toBe(3); // A1 con escaleras: 2 + 1
    expect(baja.psi).toEqual({ psi0: 0.7, psi1: 0.5, psi2: 0.3 });
    expect(baja.qd).toBeCloseTo(1.35 * 7 + 1.5 * 3, 12);
    const cubierta = d.plantas[2].zonas[0];
    expect(cubierta).toMatchObject({ categoria: 'G', fila: 'G1', qUso: 1, nieve: 0.56 });
    expect(cubierta.Qd).toBeCloseTo(1.5, 12);
    expect(d.nieveOrigen).toBeNull();
  });
});

describe('el sobre', () => {
  it('se escribe en concreta-pub-cargas-planta con la versión del esquema y la obra', () => {
    const s = defaultCargasState();
    s.emplazamiento = { provincia: '28', municipio: 'Madrid', altitud: 660 };
    publicarResultado(s, evaluar(s, null));
    const bruto = localStorage.getItem(clavePublicacion(MODULO_PUB));
    expect(bruto).not.toBeNull();
    const sobre = leerPublicacion(MODULO_PUB, PUB_VERSION)!;
    expect(sobre.modulo).toBe('cargas-planta');
    expect(sobre.v).toBe(1);
    expect(sobre.obra).toEqual({ municipio: 'Madrid', provincia: 'Madrid', ine: '28' });
    expect(leerPublicacion(MODULO_PUB, 2)).toBeNull();
  });
});
