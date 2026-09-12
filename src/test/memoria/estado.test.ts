/**
 * El estado de la ficha: sus dos capas, «Nueva obra», confirmar y teclear por
 * ruta, la aceptación de un sobre, la lectura defensiva y la persistencia.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { cargarEstado, guardarEstado, SCHEMA_VERSION, SCHEMA_VERSION_KEY, STORAGE_KEY } from '../../features/memoria-dbse/state';
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
  aceptar,
} from '../../lib/memoria/estado';
import { guardarObra } from '../../lib/obra';

beforeEach(() => {
  localStorage.clear();
});

const conObra = () => estadoPorDefecto({ denominacion: 'Edificio en Ávila', municipio: 'Ávila', provincia: '05', altitud: 1130, uso: 'Residencial' });

describe('arranque', () => {
  it('los cinco datos de la obra entran como PROYECCIÓN; los defaults con criterio, heredados; lo demás, vacío', () => {
    const s = conObra();
    // No son campos de la ficha: son el reflejo de `concreta-obra`, sin origen
    // que confirmar, porque se teclean en el diálogo de obra y ya está.
    expect(s.datosObra).toEqual({ denominacion: 'Edificio en Ávila', municipio: 'Ávila', provincia: '05', altitud: 1130, uso: 'Residencial' });
    expect(s.obra).not.toHaveProperty('denominacion');
    expect(s.obra.sobrecargaTerreno).toEqual(campo(10, 'heredado'));
    expect(s.obra.juntas.separacionMax).toEqual(campo(40, 'heredado'));
    expect(s.obra.geotecnia.empresa).toEqual(campo(''));
    expect(s.obra.descripcionSistema).toEqual(campo(''));
    expect(s.obra.fabrica.procede).toBe(false);
    expect(s.aceptados).toEqual({ materiales: null, vientoNieve: null, cargasPlanta: null, sismo: null });
    expect(s.ayuda).toBe(true);
  });

  it('sin contexto de obra no hay datos de obra que reflejar', () => {
    expect(estadoPorDefecto(null).datosObra).toBeNull();
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
  it('el estudio sigue igual, la ficha queda heredada y lo dado por bueno se olvida', () => {
    let s = teclear(conObra(), 'obra.geotecnia.empresa', 'Geotecnia SL');
    s = aceptar(s, 'sismo', { datos: { ab: 0.23 } });
    s = { ...s, obra: { ...s.obra, fabrica: { ...s.obra.fabrica, procede: true } } };
    const n = nuevaObra(s);
    expect(n.estudio).toBe(s.estudio);
    // Los cinco datos no son suyos: los pide el diálogo de obra, y «Nueva
    // obra» del menú abre otra con los suyos propios.
    expect(n.datosObra).toBe(s.datosObra);
    expect(n.obra.geotecnia.empresa).toEqual(campo('Geotecnia SL', 'heredado'));
    expect(n.obra.juntas.existen.origen).toBe('heredado');
    expect(n.obra.fabrica.procede).toBe(true);
    expect(n.aceptados.sismo).toBeNull();
    expect(n.ayuda).toBe(true);
  });
});

describe('el silenciador del aviso de emplazamiento', () => {
  const so = { datos: { ab: 0.23, K: 1 } };

  it('la huella es del RESULTADO y del emplazamiento, no de la fecha', () => {
    const s = aceptar(conObra(), 'materiales', so);
    expect(s.aceptados.materiales).toEqual(expect.any(String));
    // Republicar lo mismo más tarde da la misma huella: no se vuelve a
    // preguntar por algo que no ha cambiado.
    expect(aceptar(conObra(), 'materiales', { datos: so.datos }).aceptados.materiales).toBe(s.aceptados.materiales);
  });

  it('cambiar el resultado la invalida', () => {
    const a = aceptar(conObra(), 'materiales', so).aceptados.materiales;
    expect(aceptar(conObra(), 'materiales', { datos: { ab: 0.19, K: 1 } }).aceptados.materiales).not.toBe(a);
  });

  it('mover la obra la invalida: provincia, municipio o altitud', () => {
    const base = conObra();
    const a = aceptar(base, 'materiales', so).aceptados.materiales;
    for (const cambio of [{ provincia: '29' }, { municipio: 'Otro' }, { altitud: 5 }]) {
      const movida = { ...base, datosObra: { ...base.datosObra!, ...cambio } };
      expect(aceptar(movida, 'materiales', so).aceptados.materiales, JSON.stringify(cambio)).not.toBe(a);
    }
  });

  it('sólo toca su módulo', () => {
    const s = aceptar(conObra(), 'materiales', so);
    expect(s.aceptados.sismo).toBeNull();
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
    for (const bruto of [null, 42, 'x', [], {}, { obra: 'no', estudio: [], aceptados: 7 }]) {
      const s = normalizar(bruto, null);
      expect(s.datosObra).toBeNull();
      expect(s.estudio.programa.nombre).toBe('Cypecad Espacial');
      expect(s.aceptados.materiales).toBeNull();
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
        aceptados: { sismo: 'deadbeef', materiales: 3 },
        ayuda: 'sí',
      },
      null,
    );
    expect(s.estudio.redistribucion).toBe(20);
    expect(s.estudio.flechas).toEqual({ total: 'L/400', activa: 'L/500', maxRecomendada: '1 cm' });
    expect(s.estudio.verificacionAcero).toBe('informatica');
    expect(s.estudio.control.vidaUtilAnios).toBe(100);
    expect(s.obra.geotecnia.empresa).toEqual(campo('Geo'));
    expect(s.obra.geotecnia.balasto).toEqual(campo(''));
    expect(Object.keys(s.obra.forjados)).toEqual(['reticular-30']);
    expect(s.obra.forjados['reticular-30'].intereje).toEqual(campo(84));
    expect(s.obra.forjados['reticular-30'].anchoNervio).toEqual(campo(null, 'heredado'));
    expect(s.obra.fabrica.procede).toBe(true);
    expect(s.obra.fabrica.pieza).toEqual(campo('macizo'));
    expect(s.obra.fabrica.categoriaControl).toEqual(campo('II', 'heredado'));
    expect(s.aceptados.sismo).toBe('deadbeef');
    expect(s.aceptados.materiales).toBeNull();
    expect(s.ayuda).toBe(true);
  });
});

describe('los datos de la obra son una proyección, no una copia', () => {
  it('lo guardado no manda: la obra viva repone los cinco en cada lectura', () => {
    // Una ficha guardada cuando la obra era otra. Antes esto era una copia
    // editable y podían discrepar; ahora se repone y la discrepancia no existe.
    const guardada = { ...conObra(), datosObra: { denominacion: 'La de antes', municipio: 'Soria', provincia: '42', altitud: 1065, uso: 'Nave' } };
    const viva = { denominacion: 'La de ahora', municipio: 'Ávila', provincia: '05', altitud: 1130, uso: 'Residencial' };

    expect(normalizar(JSON.parse(JSON.stringify(guardada)), viva).datosObra).toEqual(viva);
  });

  it('sin obra viva, lo guardado tampoco sobrevive', () => {
    const guardada = { ...conObra(), datosObra: { denominacion: 'Fantasma', municipio: '', provincia: '05', altitud: null, uso: '' } };
    expect(normalizar(JSON.parse(JSON.stringify(guardada)), null).datosObra).toBeNull();
  });
});

describe('persistencia', () => {
  it('ida y vuelta por localStorage, con la obra del contexto como arranque', () => {
    guardarObra({ denominacion: 'Nave', municipio: 'Ávila', provincia: '05', altitud: 1130, uso: 'Industrial' });
    expect(cargarEstado().datosObra?.denominacion).toBe('Nave');
    const s = teclear(cargarEstado(), 'obra.geotecnia.empresa', 'Geo');
    guardarEstado(s);
    expect(localStorage.getItem(SCHEMA_VERSION_KEY)).toBe(SCHEMA_VERSION);
    expect(cargarEstado()).toEqual(s);
    // Otra versión de esquema: se descarta lo guardado.
    localStorage.setItem(SCHEMA_VERSION_KEY, 'otra');
    expect(cargarEstado().obra.geotecnia.empresa.valor).toBe('');
    // Basura en la clave: arranque, sin lanzar.
    localStorage.setItem(SCHEMA_VERSION_KEY, SCHEMA_VERSION);
    localStorage.setItem(STORAGE_KEY, '{no es json');
    expect(cargarEstado().datosObra?.denominacion).toBe('Nave');
  });
});
