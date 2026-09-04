/**
 * Estado del módulo: puente entre la pregunta de obra y el motor,
 * persistencia, lectura defensiva y publicación.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  cargarEstado,
  datosPublicacion,
  defaultVientoNieveState,
  entradaNieve,
  entradaViento,
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

  it('la siguiente planta va tres metros por encima de la más alta', () => {
    const s = defaultVientoNieveState();
    expect(siguientePlanta(s.viento.plantas).h).toBe(12);
    expect(siguientePlanta([]).h).toBe(3);
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
    expect(s.viento.plantas[0].nombre).toBe('Planta 1');
    expect(s.viento.plantas[1]).toMatchObject({ id: 'a', nombre: 'Ático', h: 6 });
    expect(s.viento.dimensiones).toEqual({ x: 20, y: 12 });
    expect(s.nieve.exposicion).toBe('normal');
    expect(s.nieve.faldones[0]).toMatchObject({ inclinacion: 45, limahoya: 'ninguna', L: null, inclinacionOtro: 45 });
    expect(s.ayuda).toBe(true);
    expect(normalizar(null).viento.plantas).toHaveLength(3);
  });
});
