/**
 * Estado del módulo: puente entre la pregunta de obra y el motor,
 * persistencia, lectura defensiva, la nieve tomada del sobre de Viento y
 * nieve (primer consumidor de una publicación) y la publicación propia.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  cargarEstado,
  datosPublicacion,
  defaultCargasState,
  duplicarPlanta,
  entradaMotor,
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
  type CargasState,
} from '../../features/cargas-planta/state';
import { avisosNieve, leerNievePublicada, nieveDesdePublicacion, valorPublicado, type NievePublicada } from '../../features/cargas-planta/nievePub';
import { defaultVientoNieveState, evaluar as evaluarVN, publicarResultado as publicarVN } from '../../features/viento-nieve/state';
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

/** Viento y nieve publicado en Madrid a 660 m (sk 0,56, un faldón plano). */
function publicarMadrid() {
  const vn = defaultVientoNieveState();
  vn.emplazamiento = { ...vn.emplazamiento, provincia: '28', municipio: 'Madrid', altitud: 660 };
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
    expect(s.plantas.map((p) => [p.nombre, p.esCubierta])).toEqual([
      ['Cubierta', true],
      ['Planta Primera', false],
      ['Planta Baja', false],
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
    expect(pub.qnMax).toBeCloseTo(0.56, 12);
    expect(pub.faldones).toHaveLength(1);
    expect(pub.faldones[0]).toMatchObject({ nombre: 'Cubierta', inclinacion: 0 });
    expect(valorPublicado(pub, null)).toBeCloseTo(0.56, 12);
    expect(valorPublicado(pub, 'Cubierta')).toBeCloseTo(0.56, 12);
    expect(valorPublicado(pub, 'Faldón que no existe')).toBeNull();
  });

  it('otra versión del esquema de Viento y nieve no se lee a medias', () => {
    publicar('viento-nieve', 2, { nieve: { qnMax: 9, faldones: [] } });
    expect(leerNievePublicada()).toBeNull();
  });

  it('tomarla congela valor, fecha y obra; el faldón que no existe cae al máximo', () => {
    publicarMadrid();
    const pub = leerNievePublicada()!;
    expect(nieveDesdePublicacion(pub)).toEqual({ modo: 'publicada', valor: pub.qnMax, tsPub: pub.ts, inePub: '28', faldon: null });
    expect(nieveDesdePublicacion(pub, 'Cubierta').faldon).toBe('Cubierta');
    expect(nieveDesdePublicacion(pub, 'Nada')).toMatchObject({ valor: pub.qnMax, faldon: null });
  });

  it('avisos: sobre más nuevo, de otra obra, desaparecido, faldón que ya no está', () => {
    const pub: NievePublicada = { ts: '2026-09-05T10:00:00.000Z', ine: '28', municipio: 'Madrid', provincia: 'Madrid', qnMax: 0.56, faldones: [{ nombre: 'Cubierta', inclinacion: 0, qn: 0.56 }] };
    const s = sevilla();
    s.emplazamiento.provincia = '28';
    planta(s.plantas, CUBIERTA).nieve = nieveDesdePublicacion(pub, 'Cubierta');
    expect(avisosNieve(s, pub)).toEqual([]);

    const masNuevo = { ...pub, ts: '2026-09-06T10:00:00.000Z' };
    expect(avisosNieve(s, masNuevo)).toHaveLength(1);
    expect(avisosNieve(s, masNuevo)[0]).toMatch(/«Cubierta».*publicado de nuevo/);

    const otraObra = { ...pub, ine: '41', municipio: 'Sevilla' };
    expect(avisosNieve(s, otraObra)[0]).toMatch(/otra obra \(Sevilla\)/);
    const cincoDigitos = { ...pub, ine: '28079' };
    expect(avisosNieve(s, cincoDigitos)).toEqual([]);

    expect(avisosNieve(s, null)[0]).toMatch(/ya no existe/);

    const sinFaldon = { ...pub, faldones: [{ nombre: 'Otro', inclinacion: 0, qn: 0.5 }] };
    expect(avisosNieve(s, sinFaldon)[0]).toMatch(/faldón «Cubierta» ya no está/);

    // Sin provincia en la obra no se puede comparar: no se avisa de obra.
    s.emplazamiento.provincia = '';
    expect(avisosNieve(s, otraObra)).toEqual([]);
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
    expect(planta(d.plantas, CUBIERTA).zonas[0].nieve).toBeCloseTo(0.56, 12);
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
    expect(s.plantas[1].nieve).toEqual({ modo: 'ninguna', valor: 0, tsPub: null, inePub: null, faldon: null });
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
