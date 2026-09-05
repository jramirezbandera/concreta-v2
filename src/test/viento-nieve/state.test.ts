/**
 * Estado del módulo: puente entre la pregunta de obra y el motor,
 * persistencia, lectura defensiva y publicación.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  alturaCoronacionDerivada,
  cargarEstado,
  cotasPlantas,
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
  PUB_VERSION,
  publicarResultado,
  SCHEMA_VERSION_KEY,
  siguientePlanta,
  STORAGE_KEY,
  zonasEfectivas,
  type VientoNieveState,
} from '../../features/viento-nieve/state';
import { guardarObra } from '../../lib/obra';
import { leerPublicacion } from '../../lib/pub';

beforeEach(() => {
  localStorage.clear();
});

/** Madrid a 660 m con las plantas y faldón por defecto. */
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
    expect(s.viento.plantas).toHaveLength(3);
    expect(s.nieve.faldones).toHaveLength(1);
    expect(s.ayuda).toBe(true);
  });

  it('con obra guardada, la hereda', () => {
    guardarObra({ provincia: '41', municipio: 'Sevilla', altitud: 10 });
    const s = defaultVientoNieveState();
    expect(s.emplazamiento).toMatchObject({ provincia: '41', municipio: 'Sevilla', altitud: 10 });
  });

  it('las plantas se teclean por altura y la cota se acumula en el orden de la lista', () => {
    const s = defaultVientoNieveState();
    expect(s.viento.plantas.map((p) => p.altura)).toEqual([3, 3, 3]);
    expect(cotasPlantas(s.viento.plantas)).toEqual([3, 6, 9]);
    expect(siguientePlanta(s.viento.plantas)).toMatchObject({ nombre: 'Planta 4', altura: 3 });
    expect(siguientePlanta([]).altura).toBe(3);
    expect(cotasPlantas([])).toEqual([]);
  });

  it('borrar una planta intermedia baja las de encima', () => {
    const s = defaultVientoNieveState();
    const sinSegunda = s.viento.plantas.filter((_, i) => i !== 1);
    expect(cotasPlantas(sinSegunda)).toEqual([3, 6]);
  });
});

describe('alturas relativas (2026-09-05)', () => {
  it('un estado guardado con cotas se convierte en alturas y publica las mismas fuerzas', () => {
    const viejo = normalizar({
      ...madrid(),
      viento: {
        ...madrid().viento,
        // Desordenadas a propósito: el estado viejo se leía por cota, no por posición.
        plantas: [
          { id: 'c', nombre: 'Cubierta', h: 9 },
          { id: 'a', nombre: 'Planta 1', h: 3 },
          { id: 'b', nombre: 'Planta 2', h: 6 },
        ],
      },
    });
    expect(viejo.viento.plantas.map((p) => [p.nombre, p.altura])).toEqual([
      ['Planta 1', 3],
      ['Planta 2', 3],
      ['Cubierta', 3],
    ]);
    const fuerzas = (s: VientoNieveState) => datosPublicacion(s, evaluar(s))!.viento!.fuerzas.map((f) => [f.nombre, f.z, f.Fx, f.Fy]);
    expect(fuerzas(viejo)).toEqual(fuerzas(madrid()));
  });

  it('una lista con alguna planta sin altura se trata entera como vieja; una cota que no sube da altura cero', () => {
    const s = normalizar({ viento: { plantas: [{ h: 3, altura: 3 }, { h: 3 }] } });
    expect(s.viento.plantas.map((p) => p.altura)).toEqual([3, 0]);
    const t = normalizar({ viento: { plantas: [{ altura: 4 }, { altura: 2.5 }] } });
    expect(cotasPlantas(t.viento.plantas)).toEqual([4, 6.5]);
  });

  it('el motor recibe cotas, no alturas', () => {
    const s = madrid();
    s.viento.plantas[1].altura = 4;
    expect(entradaViento(s, zonasEfectivas(s.emplazamiento))?.plantas.map((p) => p.h)).toEqual([3, 7, 10]);
    // La coronación deducida parte del forjado más alto (10 m) y sube con la pendiente por defecto.
    expect(alturaCoronacionDerivada(s.viento)).toBeCloseTo(10 + 6 * Math.tan(Math.PI / 9), 12);
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
    const t = madrid();
    t.viento.plantas[0].altura = 4;
    expect(esEstadoInicial(t)).toBe(false);
    const u = madrid();
    u.viento.cubierta.activa = true;
    expect(esEstadoInicial(u)).toBe(false);
  });
});

describe('zonas efectivas', () => {
  it('la provincia decide; el usuario puede forzar y queda marcado', () => {
    const z = zonasEfectivas({ provincia: '28', municipio: '', altitud: null, esCapital: false, zonaEolica: null, zonaInvernal: null });
    expect(z.provincia?.nombre).toBe('Madrid');
    expect(z.zonaEolica).toBe('A');
    expect(z.zonaInvernal).toBe(4);
    expect(z.eolicaForzada).toBe(false);
    expect(z.skCapital).toBeNull();

    const f = zonasEfectivas({ provincia: '28', municipio: '', altitud: null, esCapital: true, zonaEolica: 'C', zonaInvernal: 4 });
    expect(f.zonaEolica).toBe('C');
    expect(f.eolicaForzada).toBe(true);
    expect(f.invernalForzada).toBe(false);
    expect(f.skCapital).toBe(0.6);
  });

  it('sin provincia no hay zonas', () => {
    const z = zonasEfectivas({ provincia: '', municipio: '', altitud: 100, esCapital: true, zonaEolica: null, zonaInvernal: null });
    expect(z.provincia).toBeNull();
    expect(z.zonaEolica).toBeNull();
    expect(z.skCapital).toBeNull();
  });
});

describe('traducción al motor', () => {
  it('viento: qb según el modo, altitud y plantas con id', () => {
    const s = madrid();
    const z = zonasEfectivas(s.emplazamiento);
    expect(entradaViento(s, z)).toMatchObject({ zona: 'A', aspereza: 'IV', altitud: 660 });
    expect(entradaViento(s, z)?.qbManual).toBeUndefined();
    s.viento.qbModo = 'simplificado';
    expect(entradaViento(s, z)?.qbManual).toBe(0.5);
    s.viento.qbModo = 'manual';
    s.viento.qbManual = 0.61;
    expect(entradaViento(s, z)?.qbManual).toBe(0.61);
    expect(entradaViento(s, z)?.plantas.map((p) => p.id)).toEqual(s.viento.plantas.map((p) => p.id));
    expect(entradaViento(s, z)?.plantas.map((p) => p.h)).toEqual([3, 6, 9]);
    s.viento.activo = false;
    expect(entradaViento(s, z)).toBeNull();
  });

  it('nieve: capital, valor propio y limahoyas', () => {
    const s = madrid();
    s.nieve.faldones[0] = { ...s.nieve.faldones[0], inclinacion: 20, limahoya: 'contrario', inclinacionOtro: 30, L: 6 };
    const z = zonasEfectivas(s.emplazamiento);
    const e = entradaNieve(s, z)!;
    expect(e).toMatchObject({ zona: 4, altitud: 660, exposicion: 'normal' });
    expect(e.skCapital).toBeUndefined();
    expect(e.faldones[0]).toMatchObject({ inclinacion: 20, L: 6, limahoya: { tipo: 'contrario', inclinacionOtro: 30 } });

    s.emplazamiento.esCapital = true;
    expect(entradaNieve(s, zonasEfectivas(s.emplazamiento))?.skCapital).toBe(0.6);
    s.nieve.skModo = 'manual';
    s.nieve.skManual = 1.4;
    expect(entradaNieve(s, zonasEfectivas(s.emplazamiento))?.skManual).toBe(1.4);

    s.emplazamiento.altitud = null;
    expect(entradaNieve(s, zonasEfectivas(s.emplazamiento))).toBeNull();
  });
});

describe('evaluar', () => {
  it('Madrid a 660 m: viento en zona A y nieve de la zona 4', () => {
    const ev = evaluar(madrid());
    expect(ev.huecos).toEqual([]);
    expect(ev.viento?.qb).toBe(0.42);
    expect(ev.viento?.vb).toBe(26);
    expect(ev.viento?.x.plantas).toHaveLength(3);
    expect(ev.nieve?.sk).toBeCloseTo(0.56, 12);
    expect(ev.nieve?.faldones[0].qn).toBeCloseTo(0.56, 12);
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
    expect(d.viento?.fuerzas).toHaveLength(3);
    expect(d.viento?.fuerzas[0]).toMatchObject({ nombre: 'Planta 1', z: 3 });
    expect(d.viento?.fuerzas[0].Fx).toBeCloseTo(ev.viento!.x.plantas[0].F, 12);
    expect(d.nieve?.zonaInvernal).toBe(4);
    expect(d.nieve?.qnMax).toBeCloseTo(0.56, 12);
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
    expect(s.emplazamiento.esCapital).toBe(false);
    expect(s.viento.qbModo).toBe('zona');
    expect(s.viento.aspereza).toBe('IV');
    expect(s.viento.plantas).toHaveLength(2);
    // Plantas viejas, por cota: 3 y 6 m se convierten en dos alturas de 3 m.
    expect(s.viento.plantas[0]).toMatchObject({ nombre: 'Planta 1', altura: 3 });
    expect(s.viento.plantas[1]).toMatchObject({ id: 'a', nombre: 'Ático', altura: 3 });
    expect(s.viento.dimensiones).toEqual({ x: 20, y: 12 });
    expect(s.nieve.exposicion).toBe('normal');
    expect(s.nieve.faldones[0]).toMatchObject({ inclinacion: 45, limahoya: 'ninguna', L: null, inclinacionOtro: 45 });
    expect(s.ayuda).toBe(true);
    expect(normalizar(null).viento.plantas).toHaveLength(3);
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
    s.emplazamiento.esCapital = true;
    const e = entradaNieve(s, zonasEfectivas(s.emplazamiento))!;
    expect(e.faldones[0].limahoya).toEqual({ tipo: 'cambioNivel' });
    expect(e.skCapital).toBe(0.6);
    expect(e.altitudCapital).toBe(660);
    expect(normalizar({ nieve: { faldones: [{ inclinacion: 30, limahoya: 'cambioNivel' }] } }).nieve.faldones[0].limahoya).toBe('cambioNivel');
    s.emplazamiento.esCapital = false;
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
    expect(d.viento?.fuerzas[2].Fx).toBeCloseTo(v.x.plantas[2].F, 12);
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
    // Cubierta a 9 m y 12 m de ancho perpendicular a la cumbrera: 9 + 6·tan 20º.
    expect(alturaCoronacionDerivada(s.viento)).toBeCloseTo(9 + 6 * Math.tan(Math.PI / 9), 12);
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
    expect(alturaCoronacionDerivada(s.viento)).toBeCloseTo(9 + 10 * Math.tan(Math.PI / 9), 12);
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
    expect(d.viento?.paramentos?.h).toBe(9);
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
