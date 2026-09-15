/**
 * Estado del módulo: puente entre la pregunta de obra y el motor,
 * persistencia, lectura defensiva y publicación.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  alturaCoronacionDerivada,
  cargarEstado,
  datosPublicacion,
  defaultVientoNieveState,
  ejemploVientoNieveState,
  entradaNieve,
  entradaViento,
  esEstadoInicial,
  evaluar,
  guardarEstado,
  MODULO_PUB,
  normalizar,
  plantasDelEdificio,
  PUB_VERSION,
  publicarResultado,
  SCHEMA_VERSION_KEY,
  STORAGE_KEY,
  zonasEfectivas,
  type VientoNieveState,
} from '../../features/viento-nieve/state';
import { edificioInicial, guardarEdificio, type Edificio } from '../../lib/edificio';
import { guardarObra } from '../../lib/obra';
import { leerPublicacion } from '../../lib/pub';

beforeEach(() => {
  localStorage.clear();
});

/** Un edificio tecleado en Cargas por planta: tres plantas sobre rasante y un sótano. */
function conSotano(): Edificio {
  return {
    plantas: [
      { id: 'c', nombre: 'Cubierta', tipo: 'cubierta', altura: null },
      { id: 'p2', nombre: 'Planta Segunda', tipo: 'planta', altura: 3 },
      { id: 'p1', nombre: 'Planta Primera', tipo: 'planta', altura: 3 },
      { id: 'pb', nombre: 'Planta Baja', tipo: 'planta', altura: 3.5 },
      { id: 's1', nombre: 'Sótano -1', tipo: 'sotano', altura: 3 },
    ],
  };
}

/** Madrid a 660 m con el faldón por defecto; las plantas, las del edificio compartido. */
function madrid(): VientoNieveState {
  const s = defaultVientoNieveState();
  s.emplazamiento = { ...s.emplazamiento, provincia: '28', municipio: 'Madrid', altitud: 660 };
  return s;
}

describe('estado por defecto', () => {
  it('sin obra guardada, el emplazamiento queda en hueco: nada de municipio fantasma', () => {
    const s = defaultVientoNieveState();
    expect(s.emplazamiento.provincia).toBe('');
    expect(s.emplazamiento.altitud).toBeNull();
    expect(s.nieve.faldones).toHaveLength(1);
    expect(s.ayuda).toBe(true);
  });

  it('con obra guardada, la hereda', () => {
    guardarObra({ provincia: '41', municipio: 'Sevilla', altitud: 10 });
    const s = defaultVientoNieveState();
    expect(s.emplazamiento).toMatchObject({ provincia: '41', municipio: 'Sevilla', altitud: 10 });
  });

  it('las plantas vienen del edificio compartido: sin él, el de arranque (dos forjados, a 3 y 6 m)', () => {
    expect(plantasDelEdificio(null).map((p) => [p.nombre, p.h])).toEqual([
      ['Planta Primera', 3],
      ['Cubierta', 6],
    ]);
    // Con edificio escrito: ni el forjado a ±0,00 ni los sótanos reciben viento.
    guardarEdificio(conSotano());
    expect(evaluar(madrid()).plantas.map((p) => [p.nombre, p.h])).toEqual([
      ['Planta Primera', 3.5],
      ['Planta Segunda', 6.5],
      ['Cubierta', 9.5],
    ]);
  });
});

describe('las plantas son del edificio compartido (2026-09-15)', () => {
  it('un estado guardado con plantas propias (por cota o por altura) las ignora: el edificio manda', () => {
    const viejo = normalizar({
      ...madrid(),
      viento: { ...madrid().viento, plantas: [{ id: 'c', nombre: 'Cubierta', h: 9 }, { id: 'a', nombre: 'Planta 1', altura: 3 }] },
    });
    expect('plantas' in viejo.viento).toBe(false);
    const fuerzas = (s: VientoNieveState) => datosPublicacion(s, evaluar(s))!.viento!.fuerzas.map((f) => [f.nombre, f.z]);
    expect(fuerzas(viejo)).toEqual([
      ['Planta Primera', 3],
      ['Cubierta', 6],
    ]);
  });

  it('el motor recibe cotas, no alturas, y la coronación parte del forjado más alto', () => {
    const s = madrid();
    guardarEdificio(conSotano());
    const ev = evaluar(s);
    expect(entradaViento(s, zonasEfectivas(s.emplazamiento), ev.plantas)?.plantas.map((p) => p.h)).toEqual([3.5, 6.5, 9.5]);
    // La coronación deducida parte del forjado más alto (9,5 m) y sube con la pendiente por defecto.
    expect(alturaCoronacionDerivada(s.viento, ev.plantas)).toBeCloseTo(9.5 + 6 * Math.tan(Math.PI / 9), 12);
  });

  it('una planta sin altura es un hueco que remite a Cargas por planta, y no se publica', () => {
    const e = conSotano();
    e.plantas[2].altura = null; // la primera no dice cuánto mide: la segunda y la cubierta no se sitúan
    guardarEdificio(e);
    const ev = evaluar(madrid());
    expect(ev.faltanAlturas).toEqual(['Planta Primera']);
    expect(ev.huecos).toEqual(['la altura de «Planta Primera» (en Cargas por planta)']);
    expect(ev.plantas.map((p) => p.nombre)).toEqual(['Planta Primera']);
    expect(ev.listo).toBe(false);
    // Con el viento omitido la altura no hace falta.
    const sinViento = madrid();
    sinViento.viento.activo = false;
    expect(evaluar(sinViento).huecos).toEqual([]);
  });

  it('el ejemplo es Aranda de Duero a 800 m, con cubierta a 40º, fachadas y acumulación de nieve, y está listo', () => {
    const s = ejemploVientoNieveState();
    const ev = evaluar(s);
    expect(ev.listo).toBe(true);
    expect(ev.zonas.zonaEolica).toBe('B');
    expect(ev.zonas.zonaInvernal).toBe(3);
    expect(ev.viento?.cubierta?.pendiente).toBe(40);
    expect(ev.viento?.paramentos).not.toBeNull();
    expect(ev.nieve?.sk).toBeCloseTo(0.5, 12);
    expect(ev.nieve?.faldones[1].acumulacion?.pd).toBeCloseTo((1 - 2 / 3) * 6 * 0.5, 9);
    expect(esEstadoInicial(s)).toBe(false);
  });

  it('esEstadoInicial mira la estructura del edificio, no el emplazamiento', () => {
    expect(esEstadoInicial(defaultVientoNieveState())).toBe(true);
    expect(esEstadoInicial(madrid())).toBe(true);
    // Tocar una altura en Cargas por planta configura este módulo.
    const tocado = edificioInicial();
    tocado.plantas[2].altura = 4;
    expect(esEstadoInicial(madrid(), tocado)).toBe(false);
    guardarEdificio(tocado);
    expect(esEstadoInicial(madrid())).toBe(false);
    const u = madrid();
    u.viento.cubierta.activa = true;
    expect(esEstadoInicial(u)).toBe(false);
  });
});

describe('zonas efectivas', () => {
  it('la provincia decide; el usuario puede forzar y queda marcado', () => {
    const z = zonasEfectivas({ provincia: '28', municipio: '', altitud: null, zonaEolica: null, zonaInvernal: null });
    expect(z.provincia?.nombre).toBe('Madrid');
    expect(z.zonaEolica).toBe('A');
    expect(z.zonaInvernal).toBe(4);
    expect(z.eolicaForzada).toBe(false);
    expect(z.esCapital).toBe(false);

    const f = zonasEfectivas({ provincia: '28', municipio: 'Madrid', altitud: null, zonaEolica: 'C', zonaInvernal: 4 });
    expect(f.zonaEolica).toBe('C');
    expect(f.eolicaForzada).toBe(true);
    expect(f.invernalForzada).toBe(false);
    expect(f.esCapital).toBe(true);
  });

  it('la capital se deduce del municipio, no se pregunta', () => {
    const en = (municipio: string, provincia = '28') => zonasEfectivas({ provincia, municipio, altitud: null, zonaEolica: null, zonaInvernal: null }).esCapital;
    expect(en('Madrid')).toBe(true);
    expect(en('madrid')).toBe(true);
    expect(en('Alcalá de Henares')).toBe(false);
    expect(en('')).toBe(false);
    // El nombre de la capital de OTRA provincia no cuela.
    expect(en('Segovia')).toBe(false);
    // Bilingües y nombres oficiales largos, que es como los teclea la gente.
    expect(en('Vitoria-Gasteiz', '01')).toBe(true);
    expect(en('Donostia / San Sebastián', '20')).toBe(true);
    expect(en('A Coruña', '15')).toBe(true);
    expect(en('La Coruña', '15')).toBe(true);
    expect(en('Santa Cruz de Tenerife', '38')).toBe(true);
    expect(en('Las Palmas de Gran Canaria', '35')).toBe(true);
    expect(en('Palma', '07')).toBe(true);
    expect(en('Castelló de la Plana', '12')).toBe(true);
  });

  it('sin provincia no hay zonas', () => {
    const z = zonasEfectivas({ provincia: '', municipio: 'Madrid', altitud: 100, zonaEolica: null, zonaInvernal: null });
    expect(z.provincia).toBeNull();
    expect(z.zonaEolica).toBeNull();
    expect(z.esCapital).toBe(false);
  });
});

describe('traducción al motor', () => {
  it('viento: qb según el modo, altitud y plantas con id', () => {
    const s = madrid();
    const z = zonasEfectivas(s.emplazamiento);
    const pl = plantasDelEdificio(null);
    expect(entradaViento(s, z, pl)).toMatchObject({ zona: 'A', aspereza: 'IV', altitud: 660 });
    expect(entradaViento(s, z, pl)?.qbManual).toBeUndefined();
    s.viento.qbModo = 'simplificado';
    expect(entradaViento(s, z, pl)?.qbManual).toBe(0.5);
    s.viento.qbModo = 'manual';
    s.viento.qbManual = 0.61;
    expect(entradaViento(s, z, pl)?.qbManual).toBe(0.61);
    expect(entradaViento(s, z, pl)?.plantas.map((p) => p.id)).toEqual(pl.map((p) => p.id));
    expect(entradaViento(s, z, pl)?.plantas.map((p) => p.h)).toEqual([3, 6]);
    s.viento.activo = false;
    expect(entradaViento(s, z, pl)).toBeNull();
  });

  it('nieve: capital, valor propio y limahoyas', () => {
    const s = madrid();
    s.nieve.faldones[0] = { ...s.nieve.faldones[0], inclinacion: 20, limahoya: 'contrario', inclinacionOtro: 30, L: 6 };
    const paso = () => entradaNieve(s, zonasEfectivas(s.emplazamiento));
    const e = paso()!;
    expect(e).toMatchObject({ zona: 4, altitud: 660, exposicion: 'normal' });
    // El municipio es «Madrid»: la tabla 3.8 entra sola, sin casilla ninguna.
    expect(e.skCapital).toBe(0.6);
    expect(e.faldones[0]).toMatchObject({ inclinacion: 20, L: 6, limahoya: { tipo: 'contrario', inclinacionOtro: 30 } });

    s.emplazamiento.municipio = 'Alcalá de Henares';
    expect(paso()?.skCapital).toBeUndefined();

    // Las dos correcciones a mano, en los dos sentidos.
    s.nieve.skModo = 'tabla38';
    expect(paso()?.skCapital).toBe(0.6);
    s.emplazamiento.municipio = 'Madrid';
    s.nieve.skModo = 'anejoE';
    expect(paso()?.skCapital).toBeUndefined();

    s.nieve.skModo = 'manual';
    s.nieve.skManual = 1.4;
    expect(paso()?.skManual).toBe(1.4);
    expect(paso()?.skCapital).toBeUndefined();

    s.emplazamiento.altitud = null;
    expect(paso()).toBeNull();
  });
});

describe('evaluar', () => {
  it('Madrid a 660 m: viento en zona A y nieve de la tabla 3.8', () => {
    const ev = evaluar(madrid());
    expect(ev.huecos).toEqual([]);
    expect(ev.viento?.qb).toBe(0.42);
    expect(ev.viento?.vb).toBe(26);
    expect(ev.viento?.x.plantas).toHaveLength(2);
    // El municipio es la capital: manda la tabla 3.8 (0,60), no la E.2 a 660 m
    // (0,56). Es la diferencia que antes dependía de marcar una casilla.
    expect(ev.nieve?.sk).toBeCloseTo(0.6, 12);
    expect(ev.nieve?.faldones[0].qn).toBeCloseTo(0.6, 12);
    expect(ev.errores).toBe(0);
    expect(ev.listo).toBe(true);
  });

  it('sin provincia: huecos, sin resultados y no listo', () => {
    const ev = evaluar(defaultVientoNieveState());
    expect(ev.huecos).toEqual(['la provincia', 'la altitud']);
    expect(ev.viento).toBeNull();
    expect(ev.nieve).toBeNull();
    expect(ev.listo).toBe(false);
  });

  it('con la nieve omitida la altitud deja de ser un hueco', () => {
    const s = madrid();
    s.emplazamiento.altitud = null;
    s.nieve.activo = false;
    const ev = evaluar(s);
    expect(ev.huecos).toEqual([]);
    expect(ev.viento).not.toBeNull();
    expect(ev.nieve).toBeNull();
    expect(ev.listo).toBe(true);
  });

  it('un error del motor (altitud > 2.000 m) bloquea', () => {
    const s = madrid();
    s.emplazamiento.altitud = 2100;
    const ev = evaluar(s);
    expect(ev.errores).toBeGreaterThan(0);
    expect(ev.listo).toBe(false);
  });
});

describe('publicación', () => {
  it('lo listo se publica con esquema v1, obra y fuerzas por planta', () => {
    const s = madrid();
    const ev = evaluar(s);
    publicarResultado(s, ev);
    const pub = leerPublicacion<ReturnType<typeof datosPublicacion>>(MODULO_PUB, PUB_VERSION);
    expect(pub).not.toBeNull();
    expect(pub!.obra).toEqual({ municipio: 'Madrid', provincia: 'Madrid', ine: '28' });
    const d = pub!.datos!;
    expect(d.viento?.zonaEolica).toBe('A');
    expect(d.viento?.fuerzas).toHaveLength(2);
    expect(d.viento?.fuerzas[0]).toMatchObject({ nombre: 'Planta Primera', z: 3 });
    expect(d.viento?.fuerzas[0].Fx).toBeCloseTo(ev.viento!.x.plantas[0].F, 12);
    expect(d.nieve?.zonaInvernal).toBe(4);
    expect(d.nieve?.qnMax).toBeCloseTo(0.6, 12);
  });

  it('lo que no está listo no se publica, y no pisa lo anterior', () => {
    const bueno = madrid();
    publicarResultado(bueno, evaluar(bueno));
    const antes = leerPublicacion(MODULO_PUB);
    const roto = defaultVientoNieveState();
    expect(datosPublicacion(roto, evaluar(roto))).toBeNull();
    publicarResultado(roto, evaluar(roto));
    expect(leerPublicacion(MODULO_PUB)).toEqual(antes);
  });
});

describe('persistencia y lectura defensiva', () => {
  it('ida y vuelta por localStorage', () => {
    const s = madrid();
    guardarEstado(s);
    expect(localStorage.getItem(SCHEMA_VERSION_KEY)).toBe('1');
    expect(cargarEstado()).toEqual(s);
  });

  it('otra versión de esquema o JSON roto: estado por defecto', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(madrid()));
    localStorage.setItem(SCHEMA_VERSION_KEY, '0');
    expect(cargarEstado().emplazamiento.provincia).toBe('');
    localStorage.setItem(SCHEMA_VERSION_KEY, '1');
    localStorage.setItem(STORAGE_KEY, '{');
    expect(cargarEstado().emplazamiento.provincia).toBe('');
  });

  it('normalizar tolera basura campo a campo', () => {
    const s = normalizar({
      emplazamiento: { provincia: '99', altitud: 'alta', zonaEolica: 'Z', zonaInvernal: 9, esCapital: 'sí' },
      viento: { qbModo: 'otro', aspereza: 'VII', plantas: [{ h: 3 }, 'x', { id: 'a', nombre: 'Ático', h: 6 }], dimensiones: { x: 'ancho' } },
      nieve: { exposicion: 'mucha', faldones: [{ inclinacion: 45, limahoya: 'raro', L: 'larga' }] },
      ayuda: 'no',
    });
    expect(s.emplazamiento.provincia).toBe('');
    expect(s.emplazamiento.altitud).toBeNull();
    expect(s.emplazamiento.zonaEolica).toBeNull();
    expect(s.emplazamiento.zonaInvernal).toBeNull();
    // La casilla «la obra está en la capital» ya no existe: un estado viejo la
    // trae y se cae sin dejar rastro (la decide el municipio).
    expect(Object.keys(s.emplazamiento)).not.toContain('esCapital');
    expect(s.viento.qbModo).toBe('zona');
    expect(s.viento.aspereza).toBe('IV');
    // Las plantas guardadas se ignoran: son del edificio compartido.
    expect('plantas' in s.viento).toBe(false);
    expect(s.viento.dimensiones).toEqual({ x: 20, y: 12 });
    expect(s.nieve.exposicion).toBe('normal');
    expect(s.nieve.faldones[0]).toMatchObject({ inclinacion: 45, limahoya: 'ninguna', L: null, inclinacionOtro: 45 });
    expect(s.ayuda).toBe(true);
    expect('plantas' in normalizar(null).viento).toBe(false);
  });
});

describe('auditoría 2026-09-05', () => {
  it('la superficie exterior arranca rugosa, viaja al motor y normalizar la rellena', () => {
    const s = madrid();
    expect(s.viento.superficie).toBe('rugosa');
    expect(entradaViento(s, zonasEfectivas(s.emplazamiento))?.superficie).toBe('rugosa');
    expect(normalizar({ viento: { superficie: 'lisa' } }).viento.superficie).toBe('lisa');
    expect(normalizar({ viento: { superficie: 'áspera' } }).viento.superficie).toBe('rugosa');
    expect(evaluar(s).viento?.x.rozamiento).not.toBeNull();
  });

  it('el cambio de nivel llega al motor como limahoya sin inclinación, y la capital lleva su altitud', () => {
    const s = madrid();
    s.nieve.faldones[0] = { ...s.nieve.faldones[0], inclinacion: 40, limahoya: 'cambioNivel', L: 5 };
    const e = entradaNieve(s, zonasEfectivas(s.emplazamiento))!;
    expect(e.faldones[0].limahoya).toEqual({ tipo: 'cambioNivel' });
    expect(e.skCapital).toBe(0.6);
    expect(e.altitudCapital).toBe(660);
    expect(normalizar({ nieve: { faldones: [{ inclinacion: 30, limahoya: 'cambioNivel' }] } }).nieve.faldones[0].limahoya).toBe('cambioNivel');
    s.emplazamiento.municipio = 'Aranjuez';
    expect(entradaNieve(s, zonasEfectivas(s.emplazamiento))?.altitudCapital).toBeUndefined();
  });

  it('la publicación lleva la altura del edificio, el rozamiento y lo que hay encima de la cubierta', () => {
    const s = madrid();
    s.viento.cubierta = { ...s.viento.cubierta, activa: true };
    const ev = evaluar(s);
    const v = ev.viento!;
    const d = datosPublicacion(s, ev)!;
    expect(d.viento?.alturaEdificio).toBeCloseTo(v.alturaEdificio, 12);
    expect(d.viento?.alturaEdificio).toBeGreaterThan(d.viento!.H);
    expect(d.viento?.x.encima).toEqual({ tipo: 'hastial', F: v.x.encima!.F });
    expect(d.viento?.y.encima).toEqual({ tipo: 'faldones', F: v.y.encima!.F });
    expect(d.viento?.x.rozamiento).toEqual({ cfr: 0.02, F: v.x.rozamiento!.F, aplicado: v.x.rozamiento!.aplicado });
    // El último forjado (la cubierta): con el edificio de arranque son dos.
    expect(d.viento?.fuerzas[1].Fx).toBeCloseTo(v.x.plantas[1].F, 12);
    expect(d.viento?.x.Ftotal).toBeCloseTo(v.x.Ftotal, 12);
    const plana = madrid();
    expect(datosPublicacion(plana, evaluar(plana))!.viento?.x.encima).toBeUndefined();
  });
});

describe('cubierta a dos aguas', () => {
  it('arranca omitida y no entra en el motor', () => {
    const s = madrid();
    expect(s.viento.cubierta.activa).toBe(false);
    expect(entradaViento(s, zonasEfectivas(s.emplazamiento))?.cubierta).toBeUndefined();
    expect(evaluar(s).viento?.cubierta).toBeNull();
  });

  it('activa: la altura de coronación se deduce del último forjado y la pendiente, y se puede teclear', () => {
    const s = madrid();
    s.viento.cubierta = { ...s.viento.cubierta, activa: true, pendiente: 20, cumbrera: 'x' };
    // Cubierta a 6 m (el edificio de arranque) y 12 m de ancho perpendicular a la cumbrera: 6 + 6·tan 20º.
    expect(alturaCoronacionDerivada(s.viento)).toBeCloseTo(6 + 6 * Math.tan(Math.PI / 9), 12);
    const z = zonasEfectivas(s.emplazamiento);
    const e = entradaViento(s, z)!;
    expect(e.cubierta).toMatchObject({ pendiente: 20, cumbrera: 'x' });
    expect(e.cubierta?.alturaCoronacion).toBeCloseTo(alturaCoronacionDerivada(s.viento), 12);
    expect(e.cubierta?.areaInfluencia).toBeUndefined();

    s.viento.cubierta.alturaCoronacion = 13;
    expect(entradaViento(s, z)?.cubierta?.alturaCoronacion).toBe(13);
    s.viento.cubierta.areaModo = 'local';
    expect(entradaViento(s, z)?.cubierta?.areaInfluencia).toBe(1);
    s.viento.cubierta.areaModo = 'propia';
    s.viento.cubierta.areaPropia = 4;
    expect(entradaViento(s, z)?.cubierta?.areaInfluencia).toBe(4);
    s.viento.cubierta.cumbrera = 'y';
    expect(alturaCoronacionDerivada(s.viento)).toBeCloseTo(6 + 10 * Math.tan(Math.PI / 9), 12);
  });

  it('se publica dentro del viento, con las zonas de las dos direcciones', () => {
    const s = madrid();
    s.viento.cubierta = { ...s.viento.cubierta, activa: true };
    const ev = evaluar(s);
    expect(ev.errores).toBe(0);
    expect(ev.listo).toBe(true);
    const d = datosPublicacion(s, ev)!;
    expect(d.viento?.cubierta?.perpendicular.zonas.map((z) => z.zona)).toEqual(['F', 'G', 'H', 'I', 'J']);
    expect(d.viento?.cubierta?.paralela.zonas).toHaveLength(4);
    expect(d.viento?.cubierta?.cumbrera).toBe('x');
    expect(d.viento?.cubierta?.areaInfluencia).toBeNull();
    const sin = madrid();
    expect(datosPublicacion(sin, evaluar(sin))!.viento?.cubierta).toBeUndefined();
  });

  it('normalizar rellena la cubierta que falta y descarta lo raro', () => {
    const s = normalizar({ viento: { cubierta: { activa: 'sí', pendiente: 'mucha', cumbrera: 'z', alturaCoronacion: 'alta', areaModo: 'raro', areaPropia: 'grande' } } });
    expect(s.viento.cubierta).toEqual({ activa: false, pendiente: 20, cumbrera: 'x', alturaCoronacion: null, areaModo: 'zona', areaPropia: 5 });
    expect(normalizar({ viento: {} }).viento.cubierta.activa).toBe(false);
    const t = normalizar({ viento: { cubierta: { activa: true, pendiente: 25, cumbrera: 'y', alturaCoronacion: 12.5, areaModo: 'local' } } });
    expect(t.viento.cubierta).toMatchObject({ activa: true, pendiente: 25, cumbrera: 'y', alturaCoronacion: 12.5, areaModo: 'local' });
  });
});

describe('paramentos verticales', () => {
  it('arrancan omitidos y no entran en el motor', () => {
    const s = madrid();
    expect(s.viento.paramentos).toEqual({ activos: false, areaModo: 'zona', areaPropia: 5 });
    expect(entradaViento(s, zonasEfectivas(s.emplazamiento))?.paramentos).toBeUndefined();
    expect(evaluar(s).viento?.paramentos).toBeNull();
  });

  it('activos: el área de influencia según el modo', () => {
    const s = madrid();
    s.viento.paramentos = { ...s.viento.paramentos, activos: true };
    const z = zonasEfectivas(s.emplazamiento);
    expect(entradaViento(s, z)?.paramentos).toEqual({});
    s.viento.paramentos.areaModo = 'local';
    expect(entradaViento(s, z)?.paramentos).toEqual({ areaInfluencia: 1 });
    s.viento.paramentos.areaModo = 'propia';
    s.viento.paramentos.areaPropia = 3;
    expect(entradaViento(s, z)?.paramentos).toEqual({ areaInfluencia: 3 });
  });

  it('se publican dentro del viento, con las zonas de las dos direcciones', () => {
    const s = madrid();
    s.viento.paramentos = { ...s.viento.paramentos, activos: true };
    const ev = evaluar(s);
    expect(ev.errores).toBe(0);
    expect(ev.listo).toBe(true);
    const d = datosPublicacion(s, ev)!;
    expect(d.viento?.paramentos?.h).toBe(6);
    expect(d.viento?.paramentos?.x.zonas.map((z) => z.zona)).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(d.viento?.paramentos?.y.zonas.map((z) => z.zona)).toEqual(['A', 'B', 'D', 'E']);
    expect(d.viento?.paramentos?.areaInfluencia).toBeNull();
    expect(d.viento?.cubierta).toBeUndefined();
    const sin = madrid();
    expect(datosPublicacion(sin, evaluar(sin))!.viento?.paramentos).toBeUndefined();
  });

  it('normalizar rellena los paramentos que faltan y descarta lo raro', () => {
    const s = normalizar({ viento: { paramentos: { activos: 'sí', areaModo: 'raro', areaPropia: 'grande' } } });
    expect(s.viento.paramentos).toEqual({ activos: false, areaModo: 'zona', areaPropia: 5 });
    expect(normalizar({ viento: {} }).viento.paramentos.activos).toBe(false);
    const t = normalizar({ viento: { paramentos: { activos: true, areaModo: 'propia', areaPropia: 2.5 } } });
    expect(t.viento.paramentos).toEqual({ activos: true, areaModo: 'propia', areaPropia: 2.5 });
  });
});
