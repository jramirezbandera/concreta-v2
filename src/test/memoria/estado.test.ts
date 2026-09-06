/**
 * El estado de la ficha: sus dos capas, «Nueva obra», confirmar y teclear por
 * ruta, la aceptación de un sobre, la lectura defensiva y la persistencia.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { cargarEstado, guardarEstado, SCHEMA_VERSION_KEY, STORAGE_KEY } from '../../features/memoria-dbse/state';
import {
  asegurarForjados,
  campo,
  claveForjado,
  confirmar,
  datosForjadoInicial,
  estadoPorDefecto,
  leerCampo,
  normalizar,
  nuevaObra,
  teclear,
  tomarPublicacion,
} from '../../lib/memoria/estado';
import { guardarObra } from '../../lib/obra';

beforeEach(() => {
  localStorage.clear();
});

const conObra = () => estadoPorDefecto({ denominacion: 'Edificio en Ávila', municipio: 'Ávila', ine: '05019', provincia: '05', altitud: 1130, uso: 'Residencial' });

describe('arranque', () => {
  it('lo que el contexto de obra ya sabe entra CONFIRMADO; los defaults con criterio, heredados; lo demás, vacío', () => {
    const s = conObra();
    expect(s.obra.denominacion).toEqual(campo('Edificio en Ávila'));
    expect(s.obra.provincia).toEqual(campo('05'));
    expect(s.obra.altitud).toEqual(campo(1130));
    expect(s.obra.sobrecargaTerreno).toEqual(campo(10, 'heredado'));
    expect(s.obra.juntas.separacionMax).toEqual(campo(40, 'heredado'));
    expect(s.obra.geotecnia.empresa).toEqual(campo(''));
    expect(s.obra.descripcionSistema).toEqual(campo(''));
    expect(s.obra.fabrica.procede).toBe(false);
    expect(s.pubs).toEqual({ materiales: null, vientoNieve: null, cargasPlanta: null, sismo: null });
    expect(s.ayuda).toBe(true);
  });

  it('sin contexto de obra, los cinco campos de obra quedan vacíos', () => {
    const s = estadoPorDefecto(null);
    expect(s.obra.denominacion.valor).toBe('');
    expect(s.obra.provincia.valor).toBe('');
    expect(s.obra.altitud.valor).toBeNull();
  });

  it('el perfil de estudio trae los defaults de la ficha colegial', () => {
    const e = estadoPorDefecto(null).estudio;
    expect(e.programa.nombre).toBe('Cypecad Espacial');
    expect(e.redistribucion).toBe(15);
    expect(e.flechas).toEqual({ total: 'L/300', activa: 'L/500', maxRecomendada: '1 cm' });
    expect(e.forjados.losa.total).toBe('L/300');
    expect(e.forjados.reticular.total).toBe('L/250');
    expect(e.control.vidaUtilAnios).toBe(50);
  });
});

describe('confirmar y teclear por ruta', () => {
  it('confirmar pasa un heredado a tecleado sin cambiarle el valor', () => {
    const s = confirmar(conObra(), 'obra.sobrecargaTerreno');
    expect(s.obra.sobrecargaTerreno).toEqual(campo(10));
  });

  it('teclear escribe y confirma, también en rutas anidadas', () => {
    const s = teclear(conObra(), 'obra.geotecnia.empresa', 'Geotecnia SL');
    expect(s.obra.geotecnia.empresa).toEqual(campo('Geotecnia SL'));
    const t = teclear(s, 'obra.juntas.existen', false);
    expect(t.obra.juntas.existen).toEqual(campo(false));
  });

  it('una ruta que no es un campo no toca nada', () => {
    const s = conObra();
    expect(confirmar(s, 'obra.noExiste')).toBe(s);
    expect(teclear(s, 'pub.materiales', 1)).toBe(s);
    expect(teclear(s, 'obra.fabrica.procede', true)).toBe(s); // es un booleano suelto, no un Campo
    expect(leerCampo(s, 'obra.geotecnia.empresa')).toEqual(campo(''));
    expect(leerCampo(s, 'estudio.programa')).toBeUndefined();
  });

  it('no muta el estado anterior', () => {
    const s = conObra();
    teclear(s, 'obra.geotecnia.empresa', 'X');
    expect(s.obra.geotecnia.empresa.valor).toBe('');
  });
});

describe('Nueva obra', () => {
  it('el estudio sigue igual, la obra queda heredada, la denominación vacía y las publicaciones olvidadas', () => {
    let s = teclear(conObra(), 'obra.geotecnia.empresa', 'Geotecnia SL');
    s = tomarPublicacion(s, 'sismo', { ts: '2026-09-06T10:00:00.000Z', obra: { ine: '05019' } });
    s = { ...s, obra: { ...s.obra, fabrica: { ...s.obra.fabrica, procede: true } } };
    const n = nuevaObra(s);
    expect(n.estudio).toBe(s.estudio);
    expect(n.obra.denominacion).toEqual(campo(''));
    expect(n.obra.municipio).toEqual(campo('Ávila', 'heredado'));
    expect(n.obra.geotecnia.empresa).toEqual(campo('Geotecnia SL', 'heredado'));
    expect(n.obra.juntas.existen.origen).toBe('heredado');
    expect(n.obra.fabrica.procede).toBe(true);
    expect(n.pubs.sismo).toBeNull();
    expect(n.ayuda).toBe(true);
  });
});

describe('sobres aceptados', () => {
  it('tomarPublicacion guarda la fecha del sobre, su obra y la provincia de la ficha en ese momento', () => {
    const s = tomarPublicacion(conObra(), 'materiales', { ts: '2026-09-06T10:00:00.000Z', obra: { ine: null } });
    expect(s.pubs.materiales).toEqual({ ts: '2026-09-06T10:00:00.000Z', ine: null, provinciaFicha: '05' });
  });
});

describe('forjados residuales', () => {
  it('asegurarForjados da de alta los que faltan con los defaults de su tipología y no toca los que están', () => {
    const s0 = conObra();
    const s1 = asegurarForjados(s0, [
      { tipo: 'reticular', canto: 30 },
      { tipo: 'losa', canto: 25 },
    ]);
    expect(Object.keys(s1.obra.forjados)).toEqual(['reticular-30', 'losa-25']);
    // 25+5 → h 300, intereje 820 mm, nervio 120, capa 50: en cm y heredados.
    expect(s1.obra.forjados['reticular-30']).toEqual(datosForjadoInicial('reticular', 30));
    expect(s1.obra.forjados['reticular-30'].intereje).toEqual(campo(82, 'heredado'));
    expect(s1.obra.forjados['losa-25'].intereje).toEqual(campo(null, 'heredado'));
    const s2 = teclear(s1, 'obra.forjados.reticular-30.intereje', 84);
    const s3 = asegurarForjados(s2, [{ tipo: 'reticular', canto: 30 }]);
    expect(s3).toBe(s2);
    expect(s3.obra.forjados['reticular-30'].intereje).toEqual(campo(84));
  });

  it('la clave no lleva puntos: el separador de las rutas', () => {
    expect(claveForjado('reticular', 32.5)).toBe('reticular-32,5');
  });
});

describe('lectura defensiva', () => {
  it('basura, null o una versión con otra forma caen al arranque sin lanzar', () => {
    for (const bruto of [null, 42, 'x', [], {}, { obra: 'no', estudio: [], pubs: 7 }]) {
      const s = normalizar(bruto, null);
      expect(s.obra.denominacion).toEqual(campo(''));
      expect(s.estudio.programa.nombre).toBe('Cypecad Espacial');
      expect(s.pubs.materiales).toBeNull();
    }
  });

  it('conserva lo válido y corrige lo inválido campo a campo', () => {
    const s = normalizar(
      {
        estudio: { redistribucion: 20, flechas: { total: 'L/400' }, verificacionAcero: 'a mano', control: { vidaUtilAnios: 100 } },
        obra: {
          provincia: { valor: '2', origen: 'tecleado' }, // no es un INE de dos dígitos
          municipio: { valor: 'Vitoria', origen: 'heredado' },
          altitud: { valor: 'alto', origen: 'tecleado' },
          geotecnia: { empresa: { valor: 'Geo', origen: 'tecleado' }, balasto: 'x' },
          forjados: { 'reticular-30': { intereje: { valor: 84, origen: 'tecleado' } }, 'con.punto': {}, mal: 'x' },
          fabrica: { procede: true, pieza: { valor: 'macizo', origen: 'tecleado' }, categoriaControl: { valor: 'IV', origen: 'tecleado' } },
        },
        pubs: { sismo: { ts: '2026-01-01T00:00:00.000Z', ine: 5, provinciaFicha: '05' }, materiales: { ts: 3 } },
        ayuda: 'sí',
      },
      null,
    );
    expect(s.estudio.redistribucion).toBe(20);
    expect(s.estudio.flechas).toEqual({ total: 'L/400', activa: 'L/500', maxRecomendada: '1 cm' });
    expect(s.estudio.verificacionAcero).toBe('informatica');
    expect(s.estudio.control.vidaUtilAnios).toBe(100);
    expect(s.obra.provincia).toEqual(campo(''));
    expect(s.obra.municipio).toEqual(campo('Vitoria', 'heredado'));
    expect(s.obra.altitud).toEqual(campo(null));
    expect(s.obra.geotecnia.empresa).toEqual(campo('Geo'));
    expect(s.obra.geotecnia.balasto).toEqual(campo(''));
    expect(Object.keys(s.obra.forjados)).toEqual(['reticular-30']);
    expect(s.obra.forjados['reticular-30'].intereje).toEqual(campo(84));
    expect(s.obra.forjados['reticular-30'].anchoNervio).toEqual(campo(null, 'heredado'));
    expect(s.obra.fabrica.procede).toBe(true);
    expect(s.obra.fabrica.pieza).toEqual(campo('macizo'));
    expect(s.obra.fabrica.categoriaControl).toEqual(campo('II', 'heredado'));
    expect(s.pubs.sismo).toEqual({ ts: '2026-01-01T00:00:00.000Z', ine: null, provinciaFicha: '05' });
    expect(s.pubs.materiales).toBeNull();
    expect(s.ayuda).toBe(true);
  });
});

describe('persistencia', () => {
  it('ida y vuelta por localStorage, con la obra del contexto como arranque', () => {
    guardarObra({ denominacion: 'Nave', municipio: 'Ávila', ine: '05019', provincia: '05', altitud: 1130, uso: 'Industrial' });
    expect(cargarEstado().obra.denominacion.valor).toBe('Nave');
    const s = teclear(cargarEstado(), 'obra.geotecnia.empresa', 'Geo');
    guardarEstado(s);
    expect(localStorage.getItem(SCHEMA_VERSION_KEY)).toBe('1');
    expect(cargarEstado()).toEqual(s);
    // Otra versión de esquema: se descarta lo guardado.
    localStorage.setItem(SCHEMA_VERSION_KEY, '0');
    expect(cargarEstado().obra.geotecnia.empresa.valor).toBe('');
    // Basura en la clave: arranque, sin lanzar.
    localStorage.setItem(SCHEMA_VERSION_KEY, '1');
    localStorage.setItem(STORAGE_KEY, '{no es json');
    expect(cargarEstado().obra.denominacion.valor).toBe('Nave');
  });
});
