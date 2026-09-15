/**
 * Estado del módulo: puente entre la pregunta de obra y el motor,
 * persistencia, lectura defensiva, la nieve tomada del sobre de Viento y
 * nieve (primer consumidor de una publicación) y la publicación propia.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  adoptarNievePublicada,
  cambioDeTipo,
  cargarEstado,
  datosPublicacion,
  defaultCargasState,
  duplicarPlanta,
  entradaMotor,
  esEstadoInicial,
  evaluar,
  guardarEstado,
  MODULO_PUB,
  normalizar,
  nuevaPlanta,
  nuevaZona,
  nuevoLineal,
  nuevoPermanente,
  PUB_VERSION,
  publicarResultado,
  SCHEMA_VERSION_KEY,
  STORAGE_KEY,
  tipoDePlanta,
  type CargasState,
  edificioDe,
  unirConEdificio,
} from '../../features/cargas-planta/state';
import { avisosNieve, leerNievePublicada, nieveDesdePublicacion, valorPublicado, type NievePublicada } from '../../features/cargas-planta/nievePub';
import { defaultVientoNieveState, evaluar as evaluarVN, publicarResultado as publicarVN } from '../../features/viento-nieve/state';
import { cotasEdificio, guardarEdificio, leerEdificio, suscribirEdificio, type Edificio } from '../../lib/edificio';
import { guardarObra } from '../../lib/obra';
import { leerPublicacion, publicar } from '../../lib/pub';

beforeEach(() => {
  localStorage.clear();
});

/** Sevilla, con las tres plantas por defecto. */
function sevilla(): CargasState {
  const s = defaultCargasState();
  s.emplazamiento = { provincia: '41', municipio: 'Sevilla', altitud: 10 };
  return s;
}

/** Viento y nieve publicado en Madrid a 660 m (sk 0,60 de la tabla 3.8, un faldón plano). */
function publicarMadrid() {
  const vn = defaultVientoNieveState();
  vn.emplazamiento = { ...vn.emplazamiento, provincia: '28', municipio: 'Madrid', altitud: 660 };
  // Un edificio TOCADO, no el de arranque: desde el 13-09-2026 el cuadro sólo
  // lee sobres configurados, y el emplazamiento por sí solo no configura nada.
  // La planta no cambia la nieve: qn sigue siendo la de Madrid a 660 m.
  vn.viento = { ...vn.viento, dimensiones: { x: 21, y: 12 } };
  publicarVN(vn, evaluarVN(vn));
}

/** Las plantas por su nombre: el orden del arranque es cosa de los catálogos. */
const planta = <T extends { nombre: string }>(ps: T[], nombre: string) => ps.find((p) => p.nombre === nombre)!;
const CUBIERTA = 'Cubierta';
const BAJA = 'Planta Baja';
const PRIMERA = 'Planta Primera';

describe('estado por defecto', () => {
  it('sin obra guardada, el emplazamiento queda vacío: nada de municipio fantasma', () => {
    const s = defaultCargasState();
    expect(s.emplazamiento).toEqual({ provincia: '', municipio: '', altitud: null });
    // De arriba abajo, que es como las dibuja la sección y como se lee un plano.
    expect(s.plantas.map((p) => [p.nombre, p.esCubierta, p.bajoRasante, p.altura])).toEqual([
      ['Cubierta', true, false, null],
      ['Planta Primera', false, false, 3],
      ['Planta Baja', false, false, 3],
    ]);
    const baja = planta(s.plantas, BAJA);
    const cubierta = planta(s.plantas, CUBIERTA);
    expect(baja.zonas).toHaveLength(1);
    expect(baja.zonas[0].forjado).toEqual({ tipo: 'reticular', canto: 30, ppManual: null });
    expect(baja.zonas[0].permanentes.map((c) => [c.concepto, c.valor])).toEqual([
      ['Solado cerámico, de madera o hidráulico', 1],
      ['Tabiquería', 1],
    ]);
    expect(baja.zonas[0].uso.categoria).toBe('A1');
    expect(cubierta.zonas[0].uso.categoria).toBe('G');
    expect(cubierta.zonas[0].permanentes.map((c) => c.valor)).toEqual([2.5]);
    expect(cubierta.nieve.modo).toBe('ninguna');
    // La fachada arranca como MURO: 2,33 kN/m² de alzado por los 3 m para los
    // que la tabla C.5 da sus 7 kN/m. Cambiada la altura, cambia la carga.
    expect(s.lineales.map((l) => [l.concepto, l.alzado, l.altura])).toEqual([['Cerramiento de fachada', 7 / 3, 3]]);
    expect(s.muros).toEqual({ hay: false, terreno: 'Terreno de relleno', phi: 30, gamma: 19, sobrecarga: 2 });
    expect(s.ayuda).toBe(true);
  });

  it('con obra guardada, la hereda', () => {
    guardarObra({ provincia: '41', municipio: 'Sevilla', altitud: 10 });
    expect(defaultCargasState().emplazamiento).toEqual({ provincia: '41', municipio: 'Sevilla', altitud: 10 });
  });

  it('catálogos: el agua va por espesor, «otro» se teclea, y duplicar renueva los ids', () => {
    expect(nuevoPermanente('agua', 1.6)).toMatchObject({ concepto: 'Agua (piscina, aljibe)', valor: 16, catalogoId: 'agua', espesor: 1.6 });
    expect(nuevoPermanente('otro')).toMatchObject({ concepto: '', valor: 0, catalogoId: null, espesor: null });
    expect(nuevoPermanente('no-existe')).toMatchObject({ valor: 0, catalogoId: null });
    expect(nuevoLineal('peto')).toMatchObject({ concepto: 'Peto de cubierta', alzado: 5, altura: 1, catalogoId: 'peto' });
    // Una barandilla no se mide por alzado: se teclea en kN/m y se queda sin altura.
    expect(nuevoLineal('barandilla')).toMatchObject({ concepto: 'Barandilla', valor: 1, alzado: null, altura: null });
    expect(nuevoLineal('otro')).toMatchObject({ concepto: '', valor: 0, alzado: null, altura: null, catalogoId: null });
    expect(nuevaZona(true).uso.categoria).toBe('G');
    const p = nuevaPlanta('Ático');
    const d = duplicarPlanta(p);
    expect(d.nombre).toBe('Ático (copia)');
    expect(d.id).not.toBe(p.id);
    expect(d.zonas[0].id).not.toBe(p.zonas[0].id);
    expect(d.zonas[0].permanentes[0].id).not.toBe(p.zonas[0].permanentes[0].id);
    expect(d.zonas[0].uso).toEqual(p.zonas[0].uso);
  });
});

describe('traducción al motor', () => {
  it('altitud, nieve sólo en cubiertas con modo, ppManual y los campos del uso según la categoría', () => {
    const s = sevilla();
    planta(s.plantas, CUBIERTA).nieve = { modo: 'manual', valor: 0.4, tsPub: null, inePub: null, faldon: null };
    planta(s.plantas, BAJA).zonas[0].forjado.ppManual = 4.49;
    const primera = planta(s.plantas, PRIMERA);
    primera.zonas[0].uso = { ...primera.zonas[0].uso, categoria: 'otro', qkManual: 35, psiComo: 'D' };
    const e = entradaMotor(s);
    expect(e.altitud).toBe(10);
    expect(planta(e.plantas, CUBIERTA).nieve).toBe(0.4);
    expect(planta(e.plantas, BAJA).nieve).toBeUndefined();
    expect(planta(e.plantas, BAJA).zonas[0].forjado).toEqual({ tipo: 'reticular', canto: 30, ppManual: 4.49 });
    expect(planta(e.plantas, PRIMERA).zonas[0].forjado).toEqual({ tipo: 'reticular', canto: 30 });
    expect(planta(e.plantas, PRIMERA).zonas[0].uso).toEqual({ categoria: 'otro', qkManual: 35, psiComo: 'D', escalera: false, balcon: false });
    expect(planta(e.plantas, CUBIERTA).zonas[0].uso).toEqual({ categoria: 'G', inclinacion: 0, ligera: false, escalera: false, balcon: false });
    expect(e.lineales).toEqual([{ id: s.lineales[0].id, concepto: 'Cerramiento de fachada', valor: 0, alzado: 7 / 3, altura: 3 }]);
    // Sin muros el bloque no viaja al motor; con ellos, entero.
    expect(e.muros).toBeUndefined();
    s.muros = { hay: true, terreno: 'Zahorra', phi: 32, gamma: 20, sobrecarga: 2 };
    expect(entradaMotor(s).muros).toEqual({ terreno: 'Zahorra', phi: 32, gamma: 20, sobrecarga: 2 });
    s.muros = { ...s.muros, hay: false };
    s.emplazamiento.altitud = null;
    planta(s.plantas, CUBIERTA).nieve.modo = 'ninguna';
    expect(entradaMotor(s).altitud).toBeUndefined();
    expect(planta(entradaMotor(s).plantas, CUBIERTA).nieve).toBeUndefined();
  });
});

describe('evaluar', () => {
  it('el edificio por defecto está listo: reticular de 30 → 5 de la C.5, A1 y G1', () => {
    const ev = evaluar(sevilla(), null);
    expect(ev.errores).toBe(0);
    expect(ev.listo).toBe(true);
    const baja = planta(ev.resultado.plantas, BAJA).zonas[0];
    expect(baja.forjado).toMatchObject({ pp: 5, ppOrigen: 'tablaC5' });
    expect(baja.G).toBe(7);
    expect(baja.qd).toBeCloseTo(9.45 + 3, 12);
    expect(planta(ev.resultado.plantas, CUBIERTA).zonas[0].uso.fila).toBe('G1');
  });

  it('un error del motor bloquea y sin plantas no hay nada que publicar', () => {
    const s = sevilla();
    planta(s.plantas, BAJA).zonas[0].forjado = { tipo: 'madera', canto: 0, ppManual: null };
    const ev = evaluar(s, null);
    expect(ev.errores).toBe(1);
    expect(ev.listo).toBe(false);
    const vacio = sevilla();
    vacio.plantas = [];
    expect(evaluar(vacio, null).listo).toBe(false);
  });
});

describe('la nieve del sobre de Viento y nieve', () => {
  it('sin publicación no hay nieve que leer; con ella, el máximo y los faldones', () => {
    expect(leerNievePublicada()).toBeNull();
    publicar('viento-nieve', 1, { nieve: null, viento: null });
    expect(leerNievePublicada()).toBeNull();
    publicarMadrid();
    const pub = leerNievePublicada()!;
    expect(pub).toMatchObject({ ine: '28', municipio: 'Madrid', provincia: 'Madrid' });
    // Madrid capital: sk de la tabla 3.8, que es lo que publica el otro módulo.
    expect(pub.qnMax).toBeCloseTo(0.6, 12);
    expect(pub.faldones).toHaveLength(1);
    expect(pub.faldones[0]).toMatchObject({ nombre: 'Cubierta', inclinacion: 0 });
    expect(valorPublicado(pub, null)).toBeCloseTo(0.6, 12);
    expect(valorPublicado(pub, 'Cubierta')).toBeCloseTo(0.6, 12);
    expect(valorPublicado(pub, 'Faldón que no existe')).toBeNull();
  });

  it('otra versión del esquema de Viento y nieve no se lee a medias', () => {
    publicar('viento-nieve', 2, { nieve: { qnMax: 9, faldones: [] } });
    expect(leerNievePublicada()).toBeNull();
  });

  it('tomarla congela valor, fecha y obra; el faldón que no existe cae al máximo', () => {
    publicarMadrid();
    const pub = leerNievePublicada()!;
    // `elegida`: la ha pedido el usuario, así que deja de seguir sola al sobre.
    expect(nieveDesdePublicacion(pub)).toEqual({ modo: 'publicada', valor: pub.qnMax, tsPub: pub.ts, inePub: '28', faldon: null, elegida: true });
    expect(nieveDesdePublicacion(pub, null, false).elegida).toBe(false);
    expect(nieveDesdePublicacion(pub, 'Cubierta').faldon).toBe('Cubierta');
    expect(nieveDesdePublicacion(pub, 'Nada')).toMatchObject({ valor: pub.qnMax, faldon: null });
  });

  it('por defecto la toman solas las plantas a la intemperie que nadie ha tocado', () => {
    publicarMadrid();
    const pub = leerNievePublicada()!;
    const s = sevilla();

    const plantas = adoptarNievePublicada(s.plantas, pub);
    expect(planta(plantas, CUBIERTA).nieve).toMatchObject({ modo: 'publicada', valor: pub.qnMax, tsPub: pub.ts, elegida: false });
    // La planta de viviendas no: ahí no cae nieve, y no hay nada que declarar.
    expect(planta(plantas, BAJA).nieve.modo).toBe('ninguna');
    // Puesta ya, no se vuelve a escribir: el mismo array, que es lo que corta
    // el efecto del módulo.
    expect(adoptarNievePublicada(plantas, pub)).toBe(plantas);
    // Y sin publicación no se toca nada.
    expect(adoptarNievePublicada(s.plantas, null)).toBe(s.plantas);
  });

  it('una terraza en planta baja también la toma; lo elegido a mano no se pisa', () => {
    publicarMadrid();
    const pub = leerNievePublicada()!;
    const s = sevilla();
    // La planta baja pasa a tener una terraza: uso F, a la intemperie.
    planta(s.plantas, BAJA).zonas[0].uso = { ...planta(s.plantas, BAJA).zonas[0].uso, categoria: 'F' };
    // Y la cubierta la ha dicho el usuario: «sin nieve» es una decisión suya.
    planta(s.plantas, CUBIERTA).nieve = { modo: 'ninguna', valor: 0, tsPub: null, inePub: null, faldon: null, elegida: true };

    const plantas = adoptarNievePublicada(s.plantas, pub);
    expect(planta(plantas, BAJA).nieve).toMatchObject({ modo: 'publicada', valor: pub.qnMax });
    expect(planta(plantas, CUBIERTA).nieve.modo).toBe('ninguna');
    // Esa nieve llega a la terraza y no a la cubierta, que dijo que no.
    const ev = evaluar({ ...s, plantas }, pub);
    expect(planta(ev.resultado.plantas, BAJA).zonas[0].nieve).toBeCloseTo(pub.qnMax, 12);
    expect(planta(ev.resultado.plantas, CUBIERTA).zonas[0].nieve).toBeNull();
  });

  it('la tomada sola sigue al sobre; no cuenta como obra configurada', () => {
    publicarMadrid();
    const s = sevilla();
    const plantas = adoptarNievePublicada(s.plantas, leerNievePublicada());
    // Sigue siendo el edificio de arranque: la nieve que pone la app sola no
    // es «algo que decir de esta obra».
    expect(esEstadoInicial({ ...s, plantas })).toBe(true);

    // Un sobre más nuevo se vuelve a tomar solo, sin aviso que atender.
    const masNuevo: NievePublicada = { ...leerNievePublicada()!, ts: '2099-01-01T00:00:00.000Z', qnMax: 0.9 };
    const alDia = adoptarNievePublicada(plantas, masNuevo);
    expect(planta(alDia, CUBIERTA).nieve).toMatchObject({ valor: 0.9, tsPub: masNuevo.ts });
    // Ya está al día: el aviso de «ha publicado de nuevo» no tiene nada que
    // pedirle a nadie. (El de emplazamiento distinto sigue, y hace falta: el
    // sobre es de Madrid y esta obra es de Sevilla.)
    expect(avisosNieve({ ...s, plantas: alDia }, masNuevo).filter((a) => /publicado de nuevo/.test(a))).toEqual([]);
  });

  it('avisos: sobre más nuevo, de otro sitio, desaparecido, faldón que ya no está', () => {
    const pub: NievePublicada = { ts: '2026-09-05T10:00:00.000Z', ine: '28', municipio: 'Madrid', provincia: 'Madrid', qnMax: 0.56, faldones: [{ nombre: 'Cubierta', inclinacion: 0, qn: 0.56 }] };
    const s = sevilla();
    s.emplazamiento.provincia = '28';
    planta(s.plantas, CUBIERTA).nieve = nieveDesdePublicacion(pub, 'Cubierta');
    expect(avisosNieve(s, pub)).toEqual([]);

    // Republicado con la MISMA nieve (viento republica cada vez que cambian las plantas del edificio): nada que revisar.
    const masNuevo = { ...pub, ts: '2026-09-06T10:00:00.000Z' };
    expect(avisosNieve(s, masNuevo)).toEqual([]);
    // Republicado con otra nieve: eso sí.
    const otraNieve = { ...masNuevo, qnMax: 0.6, faldones: [{ nombre: 'Cubierta', inclinacion: 0, qn: 0.6 }] };
    expect(avisosNieve(s, otraNieve)).toHaveLength(1);
    expect(avisosNieve(s, otraNieve)[0]).toMatch(/«Cubierta».*publicado de nuevo/);

    const otroSitio = { ...pub, ine: '41', municipio: 'Sevilla' };
    expect(avisosNieve(s, otroSitio)[0]).toMatch(/se calculó en otro sitio \(Sevilla\)/);
    const cincoDigitos = { ...pub, ine: '28079' };
    expect(avisosNieve(s, cincoDigitos)).toEqual([]);

    expect(avisosNieve(s, null)[0]).toMatch(/ya no existe/);

    const sinFaldon = { ...pub, faldones: [{ nombre: 'Otro', inclinacion: 0, qn: 0.5 }] };
    expect(avisosNieve(s, sinFaldon)[0]).toMatch(/faldón «Cubierta» ya no está/);

    // Sin provincia en la obra no se puede comparar: no se avisa del sitio.
    s.emplazamiento.provincia = '';
    expect(avisosNieve(s, otroSitio)).toEqual([]);
    // Nieve manual o sin nieve: nada que avisar.
    planta(s.plantas, CUBIERTA).nieve = { modo: 'manual', valor: 1, tsPub: null, inePub: null, faldon: null };
    expect(avisosNieve(s, null)).toEqual([]);
  });

  it('los avisos de nieve cuentan como avisos de la evaluación y no bloquean', () => {
    const s = sevilla();
    s.emplazamiento.provincia = '28';
    planta(s.plantas, CUBIERTA).nieve = { modo: 'publicada', valor: 0.56, tsPub: '2026-09-05T10:00:00.000Z', inePub: '28', faldon: null };
    const ev = evaluar(s, null);
    expect(ev.avisosNieve).toHaveLength(1);
    expect(ev.avisos).toBe(1);
    expect(ev.listo).toBe(true);
    expect(planta(ev.resultado.plantas, CUBIERTA).zonas[0].nieve).toBe(0.56);
  });
});

describe('publicación', () => {
  it('lo listo se publica con esquema v1, obra, plantas ya derivadas y el origen de la nieve', () => {
    publicarMadrid();
    const s = sevilla();
    s.emplazamiento = { provincia: '28', municipio: 'Madrid', altitud: 660 };
    planta(s.plantas, CUBIERTA).nieve = nieveDesdePublicacion(leerNievePublicada()!);
    const ev = evaluar(s);
    publicarResultado(s, ev);
    const pub = leerPublicacion<ReturnType<typeof datosPublicacion>>(MODULO_PUB, PUB_VERSION);
    expect(pub).not.toBeNull();
    expect(pub!.obra).toEqual({ municipio: 'Madrid', provincia: 'Madrid', ine: '28' });
    const d = pub!.datos!;
    expect(d).toMatchObject({ provincia: 'Madrid', provinciaIne: '28', municipio: 'Madrid', altitud: 660, gamma: { G: 1.35, Q: 1.5, A: 1 } });
    expect(d.plantas.map((p) => p.nombre)).toEqual(['Cubierta', 'Planta Primera', 'Planta Baja']);
    expect(planta(d.plantas, BAJA).zonas[0]).toMatchObject({ nombre: null, forjado: { tipo: 'reticular', canto: 30 }, pp: 5, resto: 2, G: 7, categoria: 'A1', fila: 'A1', qUso: 2, qkConcentrada: 2, nieve: null, psi: { psi0: 0.7, psi1: 0.5, psi2: 0.3 } });
    expect(planta(d.plantas, BAJA).zonas[0].qd).toBeCloseTo(12.45, 12);
    expect(planta(d.plantas, CUBIERTA).zonas[0].nieve).toBeCloseTo(0.6, 12);
    expect(d.lineales).toEqual([{ concepto: 'Cerramiento de fachada', alzado: 7 / 3, altura: 3, gk: 7, Gd: 9.450000000000001 }]);
    expect(d.muros).toBeNull();
    expect(d.nieveOrigen).toEqual({ ts: planta(s.plantas, CUBIERTA).nieve.tsPub, ine: '28' });
  });

  it('sin provincia el sobre va sin obra, y lo que no está listo no pisa lo anterior', () => {
    const s = defaultCargasState();
    publicarResultado(s, evaluar(s, null));
    const antes = leerPublicacion(MODULO_PUB);
    expect(antes!.obra).toEqual({ municipio: null, provincia: null, ine: null });
    const roto = defaultCargasState();
    planta(roto.plantas, BAJA).zonas[0].forjado = { tipo: 'otro', canto: 0, ppManual: null };
    expect(datosPublicacion(roto, evaluar(roto, null))).toBeNull();
    publicarResultado(roto, evaluar(roto, null));
    expect(leerPublicacion(MODULO_PUB)).toEqual(antes);
  });
});

describe('persistencia y lectura defensiva', () => {
  it('ida y vuelta por localStorage', () => {
    const s = sevilla();
    guardarEstado(s);
    expect(localStorage.getItem(SCHEMA_VERSION_KEY)).toBe('1');
    expect(cargarEstado()).toEqual(s);
  });

  it('las cargas libres guardadas sin id de columna lo reciben: por nombre, y sin nombre cada una el suyo', () => {
    const libre = (id: string, concepto: string) => ({ id, concepto, valor: 1, catalogoId: null, espesor: null });
    const s = normalizar({
      plantas: [
        { nombre: 'A', zonas: [{ permanentes: [libre('c1', 'Falso techo'), libre('c2', '')] }] },
        { nombre: 'B', zonas: [{ permanentes: [libre('c3', 'falso TECHO '), libre('c4', '')] }] },
      ],
    });
    const [a1, a2] = s.plantas[0].zonas[0].permanentes;
    const [b1, b2] = s.plantas[1].zonas[0].permanentes;
    expect(a1.columna).toEqual(expect.any(String));
    expect(a1.columna).toBe(b1.columna);
    expect(a2.columna).not.toBe(b2.columna);
    // Las del catálogo no lo necesitan: su columna es la entrada del catálogo.
    expect(defaultCargasState().plantas[0].zonas[0].permanentes[0].columna).toBeUndefined();
  });

  it('otra versión de esquema o JSON roto: estado por defecto', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sevilla()));
    localStorage.setItem(SCHEMA_VERSION_KEY, '0');
    expect(cargarEstado().emplazamiento.provincia).toBe('');
    localStorage.setItem(SCHEMA_VERSION_KEY, '1');
    localStorage.setItem(STORAGE_KEY, '{');
    expect(cargarEstado().emplazamiento.provincia).toBe('');
  });

  it('normalizar tolera basura campo a campo y rellena lo que falta', () => {
    const s = normalizar({
      emplazamiento: { provincia: '99', altitud: 'alta' },
      plantas: [
        { nombre: 'Sótano', esCubierta: 'no', zonas: [] },
        'x',
        {
          id: 'p2',
          nombre: 'Ático',
          esCubierta: true,
          nieve: { modo: 'raro', valor: 'mucha', faldon: 3 },
          zonas: [{ id: 'z1', forjado: { tipo: 'hielo', canto: 'x' }, permanentes: [{ concepto: 'Grava', valor: 2.5 }, null], uso: { categoria: 'Z', inclinacion: 30, escalera: 'sí' } }],
        },
      ],
      lineales: [{ concepto: 'Peto', valor: 5 }, 7],
      ayuda: 'no',
    });
    expect(s.emplazamiento).toEqual({ provincia: '', municipio: '', altitud: null });
    expect(s.plantas).toHaveLength(2);
    expect(s.plantas[0]).toMatchObject({ nombre: 'Sótano', esCubierta: false });
    expect(s.plantas[0].zonas).toHaveLength(1);
    expect(s.plantas[0].zonas[0].uso.categoria).toBe('A1');
    expect(s.plantas[1]).toMatchObject({ id: 'p2', nombre: 'Ático', esCubierta: true });
    expect(s.plantas[1].nieve).toEqual({ modo: 'ninguna', valor: 0, tsPub: null, inePub: null, faldon: null, elegida: false });
    expect(s.plantas[1].zonas[0]).toMatchObject({ id: 'z1', forjado: { tipo: 'reticular', canto: 30, ppManual: null } });
    // Una carga libre guardada sin id de columna lo recibe al leerse.
    expect(s.plantas[1].zonas[0].permanentes).toEqual([{ id: expect.any(String), concepto: 'Grava', valor: 2.5, catalogoId: null, espesor: null, columna: expect.any(String) }]);
    expect(s.plantas[1].zonas[0].uso).toMatchObject({ categoria: 'G', inclinacion: 30, escalera: false, ligera: false });
    // Un estado guardado antes de los muros no tenía alzado ni altura: su carga
    // por metro sigue siendo la que decía, y el bloque de muros arranca apagado.
    expect(s.lineales).toEqual([{ id: expect.any(String), concepto: 'Peto', valor: 5, alzado: null, altura: null, catalogoId: null }]);
    expect(s.muros).toEqual({ hay: false, terreno: 'Terreno de relleno', phi: 30, gamma: 19, sobrecarga: 2 });
    expect(s.ayuda).toBe(true);
    expect(normalizar(null).plantas).toHaveLength(3);
    expect(normalizar({ plantas: 'no' }).plantas).toHaveLength(3);
  });
});

describe('el tipo de planta: cubierta, planta o sótano', () => {
  it('es una proyección de los dos booleanos, y el parche nunca los enciende a la vez', () => {
    expect(tipoDePlanta({ esCubierta: true, bajoRasante: false })).toBe('cubierta');
    expect(tipoDePlanta({ esCubierta: false, bajoRasante: true })).toBe('sotano');
    expect(tipoDePlanta({ esCubierta: false, bajoRasante: false })).toBe('planta');
    expect(cambioDeTipo('cubierta')).toEqual({ esCubierta: true, bajoRasante: false });
    expect(cambioDeTipo('sotano')).toEqual({ esCubierta: false, bajoRasante: true });
    expect(cambioDeTipo('planta')).toEqual({ esCubierta: false, bajoRasante: false });
    // Una planta nueva nace sobre rasante, y una cubierta no puede ser sótano.
    expect(nuevaPlanta('Planta 4').bajoRasante).toBe(false);
    expect(nuevaPlanta('Sótano -1', false, true).bajoRasante).toBe(true);
    expect(nuevaPlanta('Cubierta', true, true).bajoRasante).toBe(false);
  });

  it('con un sótano ya no es el edificio de arranque: no se le ofrece el ejemplo encima', () => {
    const s = defaultCargasState();
    expect(esEstadoInicial(s)).toBe(true);
    Object.assign(planta(s.plantas, BAJA), cambioDeTipo('sotano'));
    expect(esEstadoInicial(s)).toBe(false);
  });

  it('normalizar: sin el campo es sobre rasante, y la cubierta manda sobre el sótano', () => {
    const s = normalizar({
      plantas: [
        { nombre: 'Cubierta', esCubierta: true, bajoRasante: true },
        { nombre: 'Planta Baja' },
        { nombre: 'Sótano', bajoRasante: true },
      ],
    });
    expect(s.plantas.map((p) => [p.nombre, tipoDePlanta(p)])).toEqual([
      ['Cubierta', 'cubierta'],
      ['Planta Baja', 'planta'],
      ['Sótano', 'sotano'],
    ]);
  });

  it('viaja al motor y al sobre sin cambiar ninguna carga ni la versión del esquema', () => {
    const antes = evaluar(sevilla(), null).resultado.plantas.map((p) => p.zonas[0].qd);
    const s = sevilla();
    s.plantas.push(nuevaPlanta('Sótano -1', false, true));
    const ev = evaluar(s, null);
    expect(planta(entradaMotor(s).plantas, 'Sótano -1').bajoRasante).toBe(true);
    expect(ev.resultado.plantas.map((p) => p.bajoRasante)).toEqual([false, false, false, true]);
    expect(ev.resultado.plantas.slice(0, 3).map((p) => p.zonas[0].qd)).toEqual(antes);
    const d = datosPublicacion(s, ev)!;
    expect(d.plantas.map((p) => p.bajoRasante)).toEqual([false, false, false, true]);
    expect(PUB_VERSION).toBe(1);
  });
});

describe('el edificio compartido (lib/edificio)', () => {
  it('la altura es la del espacio que apoya en el forjado, y la cota sale sola: ±0 en la baja', () => {
    const s = defaultCargasState();
    expect(cotasEdificio(edificioDe(s).plantas)).toEqual([6, 3, 0]);
    s.plantas.push(nuevaPlanta('Sótano -1', false, true));
    expect(cotasEdificio(edificioDe(s).plantas)).toEqual([6, 3, 0, -3]);
    // Una planta nueva nace con 3 m; una cubierta, sin altura (es la de arriba).
    expect(nuevaPlanta('Planta 4').altura).toBe(3);
    expect(nuevaPlanta('Cubierta ático', true).altura).toBeNull();
    // Viaja al motor y al sobre, con la cota, sin subir la versión.
    expect(planta(entradaMotor(s).plantas, BAJA).altura).toBe(3);
    const d = datosPublicacion(s, evaluar(s, null))!;
    expect(d.plantas.map((p) => [p.nombre, p.altura, p.cota])).toEqual([
      ['Cubierta', null, 6],
      ['Planta Primera', 3, 3],
      ['Planta Baja', 3, 0],
      ['Sótano -1', 3, -3],
    ]);
    expect(PUB_VERSION).toBe(1);
  });

  it('un estado guardado antes de la altura carga sin ella: no se inventa', () => {
    const s = normalizar({ plantas: [{ nombre: 'Cubierta', esCubierta: true }, { nombre: 'Planta Baja', altura: 'tres' }] });
    expect(s.plantas.map((p) => p.altura)).toEqual([null, null]);
    expect(cotasEdificio(edificioDe(s).plantas)).toEqual([null, 0]);
  });

  it('sin edificio escrito, cargar el estado lo SIEMBRA con sus plantas: viento lo necesita aunque aquí no se toque nada', () => {
    expect(leerEdificio()).toBeNull();
    const s = cargarEstado();
    expect(leerEdificio()).toEqual(edificioDe(s));
    expect(leerEdificio()!.plantas.map((p) => [p.nombre, p.tipo, p.altura])).toEqual([
      ['Cubierta', 'cubierta', null],
      ['Planta Primera', 'planta', 3],
      ['Planta Baja', 'planta', 3],
    ]);
  });

  it('guardar escribe el edificio sólo cuando cambia: teclear una zona no avisa a nadie', () => {
    const s = sevilla();
    const avisos = vi.fn();
    const soltar = suscribirEdificio(avisos);
    guardarEstado(s);
    expect(avisos).toHaveBeenCalledTimes(1);
    planta(s.plantas, BAJA).zonas[0].forjado.canto = 35;
    guardarEstado(s);
    expect(avisos).toHaveBeenCalledTimes(1);
    planta(s.plantas, BAJA).altura = 3.5;
    guardarEstado(s);
    expect(avisos).toHaveBeenCalledTimes(2);
    expect(leerEdificio()!.plantas[2].altura).toBe(3.5);
    soltar();
  });

  it('al cargar, el edificio manda en lista, orden, nombre, tipo y altura; la nieve y las zonas se pegan por id', () => {
    const s = sevilla();
    const baja = planta(s.plantas, BAJA);
    baja.zonas[0].forjado.canto = 35;
    baja.zonas.push({ ...nuevaZona(false, 'Garaje'), uso: { ...baja.zonas[0].uso, categoria: 'E' } });
    guardarEstado(s);
    // Otro sitio reordena, renombra, cambia la altura, quita la primera y añade un sótano.
    const edificio: Edificio = {
      plantas: [
        { id: planta(s.plantas, CUBIERTA).id, nombre: 'Cubierta', tipo: 'cubierta', altura: null },
        { id: baja.id, nombre: 'Planta Baja (nueva)', tipo: 'planta', altura: 4 },
        { id: 'nuevo', nombre: 'Sótano -1', tipo: 'sotano', altura: 2.8 },
      ],
    };
    guardarEdificio(edificio);
    const c = cargarEstado();
    expect(c.plantas.map((p) => [p.nombre, p.esCubierta, p.bajoRasante, p.altura, p.zonas.length])).toEqual([
      ['Cubierta', true, false, null, 1],
      ['Planta Baja (nueva)', false, false, 4, 2],
      ['Sótano -1', false, true, 2.8, 1],
    ]);
    // Lo propio de la baja sigue ahí, pegado por id; la primera se fue con sus zonas.
    expect(c.plantas[1].id).toBe(baja.id);
    expect(c.plantas[1].zonas[0].forjado.canto).toBe(35);
    expect(c.plantas[1].zonas[1].nombre).toBe('Garaje');
    expect(c.plantas[2].id).toBe('nuevo');
    expect(c.plantas.some((p) => p.nombre === PRIMERA)).toBe(false);
    // Y la unión es la misma función, sin pasar por el almacén.
    expect(unirConEdificio(s.plantas, edificio).map((p) => p.id)).toEqual([planta(s.plantas, CUBIERTA).id, baja.id, 'nuevo']);
  });
});
