/**
 * `concreta-pub-sismo`: lo que el módulo NCSE-02 deja escrito para el cuadro de
 * acciones del plano y, mañana, la ficha DB SE.
 *
 * El formato del sobre lo prueba `src/test/pub/pub.test.ts`; lo que se fija
 * aquí es QUÉ viaja dentro, con las mismas reglas que materiales y viento:
 *
 *  - viajan HECHOS ya derivados (ac con su ρ y su S dentro, la ductilidad
 *    traducida a su palabra), no la prosa de la pantalla ni el estado interno;
 *  - un caso EXENTO se publica igual que uno calculado. Es la diferencia con
 *    los otros dos módulos: «este edificio no lleva sismo, y éste es el
 *    artículo por el que no lo lleva» es justo lo que se firma en un plano;
 *  - las fuerzas por planta van emparejadas con SU planta, no con la que
 *    ocupaba su posición antes de que el motor ordenara por altura.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { guardarObra } from '../../lib/obra';
import { clavePublicacion, leerPublicacion } from '../../lib/pub';
import {
  MODULO_PUB,
  PUB_VERSION,
  blankSeismicState,
  datosPublicacion,
  defaultSeismicState,
  evaluarSismo,
  nombreDuctilidad,
  publicarResultado,
  type PubSismo,
  type SeismicState,
} from '../../features/seismic-ncse02/state';

beforeEach(() => {
  localStorage.clear();
});

/** Granada, diez plantas: el caso del arranque, que sí calcula. */
const datosDe = (s: SeismicState) => datosPublicacion(s, evaluarSismo(s));
const granada = () => datosDe(defaultSeismicState());

describe('hechos, no prosa', () => {
  it('no viajan bloques de documento, ni avisos, ni el estado interno del módulo', () => {
    const crudo = JSON.stringify(granada());
    for (const clave of ['"kind"', '"severidad"', '"avisos"', '"modos"', '"pesoManual"', '"TFModo"', '"nModosModo"', '"municipioProcedencia"']) {
      expect(crudo, clave).not.toContain(clave);
    }
  });

  it('todo es serializable: ida y vuelta por JSON sin pérdida', () => {
    const d = granada();
    expect(JSON.parse(JSON.stringify(d))).toEqual(d);
  });

  it('viaja ya derivado: ac con ρ y S dentro, β = ν/μ y el peso sísmico sumado', () => {
    const s = defaultSeismicState();
    const ev = evaluarSismo(s);
    const d = datosPublicacion(s, ev);
    expect(d.ab).toBe(0.23);
    expect(d.K).toBe(1);
    expect(d.rho).toBe(1); // importancia normal
    // ac = ρ · S · ab: el consumidor no tiene el motor y no puede rehacerlo.
    expect(d.ac).toBeCloseTo(ev.emplazamiento.ac, 12);
    expect(d.ac).not.toBe(d.ab);
    expect(d.C).toBe(ev.emplazamiento.C);
    expect(d.S).toBe(ev.emplazamiento.S);
    expect(d.calculo).not.toBeNull();
    expect(d.calculo!.beta).toBeCloseTo(d.calculo!.nu / d.mu, 12);
    expect(d.calculo!.pesoSismico).toBeGreaterThan(0);
    expect(d.calculo!.cortanteBasal.x).toBeGreaterThan(0);
    expect(d.calculo!.TF.x).toBeGreaterThan(0);
  });

  it('la ductilidad viaja en palabras, y sólo las cuatro del art. 3.7.3.1', () => {
    expect([1, 2, 3, 4].map(nombreDuctilidad)).toEqual(['sin ductilidad', 'baja', 'alta', 'muy alta']);
    // Un μ justificado aparte no tiene nombre en la Norma: inventarle uno sería
    // publicar una declaración que el proyectista no ha hecho.
    expect(nombreDuctilidad(2.5)).toBeNull();
    expect(granada().ductilidad).toBe('alta'); // μ = 3 en el arranque
  });

  it('cada fuerza va con SU planta, aunque el motor las haya reordenado por altura', () => {
    const s = defaultSeismicState();
    // Se desordenan las alturas: el motor ordena, la publicación no puede
    // emparejar por posición sin cruzar nombres con fuerzas.
    const alturas = s.plantas.map((p) => p.h);
    s.plantas = [...s.plantas].reverse().map((p, i) => ({ ...p, h: alturas[i] }));
    const d = datosDe(s);
    const fuerzas = d.calculo!.fuerzas;
    expect(fuerzas).toHaveLength(s.plantas.length);
    for (const f of fuerzas) {
      const ui = s.plantas.find((p) => p.nombre === f.nombre)!;
      expect(ui, f.nombre).toBeDefined();
      expect(f.h, f.nombre).toBe(ui.h);
    }
    // Y las alturas del resultado van ordenadas, que es lo que las cruzaba.
    expect([...fuerzas].map((f) => f.h)).toEqual([...fuerzas].map((f) => f.h).sort((a, b) => a - b));
  });
});

describe('un caso exento también se publica', () => {
  /** ab = 0,02 g: por debajo del umbral del art. 1.2.3. */
  function exento(): SeismicState {
    const s = defaultSeismicState();
    return { ...s, municipioIne: null, municipioNombre: '', ab: 0.02, K: 1.0 };
  }

  it('sin cálculo, pero con el emplazamiento y el motivo por el que no lo hay', () => {
    const d = datosDe(exento());
    expect(d.obligatoria).toBe(false);
    expect(d.calculo).toBeNull();
    // Lo que justifica la exención sigue viajando: sin ac y K, el cuadro del
    // plano no podría enseñar por qué el edificio está exento.
    expect(d.ab).toBe(0.02);
    expect(d.ac).toBeGreaterThan(0);
    expect(d.impedimento).not.toBeNull();
    expect(d.impedimento!.articulo).toBeTruthy();
    expect(d.impedimento!.texto).toBeTruthy();
  });

  it('el sobre se escribe igualmente: publicar no espera a que haya fuerzas', () => {
    publicarResultado(exento(), evaluarSismo(exento()));
    const sobre = leerPublicacion<PubSismo>(MODULO_PUB, PUB_VERSION);
    expect(sobre).not.toBeNull();
    expect(sobre!.datos.calculo).toBeNull();
  });

  it('un estado en blanco no revienta: publica lo que sabe', () => {
    const s = blankSeismicState();
    expect(() => publicarResultado(s, evaluarSismo(s))).not.toThrow();
    expect(leerPublicacion<PubSismo>(MODULO_PUB, PUB_VERSION)).not.toBeNull();
  });
});

describe('el sobre', () => {
  it('se escribe en concreta-pub-sismo con la versión del esquema y la obra del módulo', () => {
    const s = defaultSeismicState();
    publicarResultado(s, evaluarSismo(s));
    expect(localStorage.getItem(clavePublicacion(MODULO_PUB))).not.toBeNull();
    const sobre = leerPublicacion<PubSismo>(MODULO_PUB, PUB_VERSION)!;
    expect(sobre.modulo).toBe('sismo');
    expect(sobre.v).toBe(PUB_VERSION);
    // La obra sale del emplazamiento con el que se sacaron ab y K, no de una
    // referencia de despacho.
    expect(sobre.obra).toEqual({ municipio: 'Granada', provincia: null, ine: '18087' });
  });

  it('en entrada manual de ab y K, la obra cae a `concreta-obra`', () => {
    guardarObra({ municipio: 'Espartinas', ine: '41038', provincia: '41' });
    const s = { ...defaultSeismicState(), municipioIne: null, municipioNombre: '' };
    publicarResultado(s, evaluarSismo(s));
    const sobre = leerPublicacion<PubSismo>(MODULO_PUB, PUB_VERSION)!;
    expect(sobre.obra.municipio).toBe('Espartinas');
    expect(sobre.obra.ine).toBe('41038');
  });

  it('pedir otra versión del esquema devuelve null, no un objeto a medias', () => {
    const s = defaultSeismicState();
    publicarResultado(s, evaluarSismo(s));
    expect(leerPublicacion<PubSismo>(MODULO_PUB, PUB_VERSION + 1)).toBeNull();
  });
});
