/**
 * El modelo de estado de la UI y su traducción al motor.
 *
 * Lo que más se protege aquí es la frontera: que la UI no invente números y que
 * lo que sale de ella sea exactamente lo que el motor espera. Un conmutador
 * "manual" con el campo a cero, o una `x` a la que se le pierde el signo, no
 * lanzan ningún error — producen un cortante distinto y callado.
 */
import { describe, expect, it } from 'vitest';

import {
  blankSeismicState,
  defaultSeismicState,
  evaluarSismo,
  excentricidadDe,
  normalizeSeismicState,
  toSeismicInput,
  type SeismicState,
} from '../../features/seismic-ncse02/state';
import { CASO_GRANADA } from '../fixtures/ncse02.fixtures';

const cerca = (a: number, b: number, tol = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(tol);

describe('el estado por defecto ES el caso congelado en los fixtures', () => {
  const ev = evaluarSismo(defaultSeismicState());

  it('la Norma es de aplicacion y el metodo simplificado vale', () => {
    expect(ev.aplicabilidad.obligatoriedad.estado).toBe('obligatoria');
    expect(ev.aplicabilidad.puedeCalcular).toBe(true);
    expect(ev.resultado).not.toBeNull();
  });

  it('el emplazamiento reproduce S, ac, T_A y T_B del fixture', () => {
    cerca(ev.emplazamiento.S, CASO_GRANADA.esperado.S, 5e-7);
    cerca(ev.emplazamiento.ac, CASO_GRANADA.esperado.ac);
    cerca(ev.emplazamiento.TA, CASO_GRANADA.esperado.TA);
    cerca(ev.emplazamiento.TB, CASO_GRANADA.esperado.TB);
  });

  it('el asistente de superficie produce los P_k del fixture', () => {
    // 9 plantas tipo a 8,0 kN/m2 (4,5 + 1,5 + 1,0 + 0,5·2,0) y cubierta a 6,0,
    // sobre 300 m2. Si alguien toca la tabla de fracciones del art. 3.2, el
    // peso sismico total deja de cuadrar y esto salta.
    expect(ev.resultado?.pesoSismico).toBe(CASO_GRANADA.cargas.pesoSismicoTotal);
    expect(ev.resultado?.plantas.map((p) => p.P)).toEqual(CASO_GRANADA.entrada.P);
    expect(ev.resultado?.plantas.map((p) => p.h)).toEqual(CASO_GRANADA.entrada.h);
  });

  it('la cadena de fuerzas da los cortantes del fixture', () => {
    const x = ev.resultado!.x;
    cerca(x.TF, CASO_GRANADA.entrada.TF);
    expect(x.nModos).toBe(CASO_GRANADA.entrada.nModos);
    for (let k = 0; k < x.Vk.length; k++) cerca(x.Vk[k], CASO_GRANADA.esperado.Vk[k], 1e-9);
    cerca(x.cortanteBasal, CASO_GRANADA.esperado.Vk[0]);
  });

  it('el modo 1 cae en la rama descendente de alpha, que es lo que cubre este caso', () => {
    const [m1, m2] = ev.resultado!.x.modos;
    cerca(m1.alpha, CASO_GRANADA.esperado.modos[0].alpha);
    cerca(m2.alpha, CASO_GRANADA.esperado.modos[1].alpha);
    expect(m1.T).toBeGreaterThan(ev.emplazamiento.TB);
  });
});

describe('toSeismicInput', () => {
  it('el override de T_F solo viaja si esta activo Y tiene valor', () => {
    const s = defaultSeismicState();
    expect(toSeismicInput(s).x.TFManual).toBeUndefined();

    // Conmutador en manual pero campo a cero: NO puede viajar. Un T_F de 0
    // produce una alpha sin sentido y un cortante callado.
    const cero: SeismicState = { ...s, x: { ...s.x, TFModo: 'manual', TFManual: 0 } };
    expect(toSeismicInput(cero).x.TFManual).toBeUndefined();

    const puesto: SeismicState = { ...s, x: { ...s.x, TFModo: 'manual', TFManual: 0.7 } };
    expect(toSeismicInput(puesto).x.TFManual).toBe(0.7);

    // Con valor pero el conmutador en auto, tampoco: manda el conmutador.
    const auto: SeismicState = { ...s, x: { ...s.x, TFModo: 'auto', TFManual: 0.7 } };
    expect(toSeismicInput(auto).x.TFManual).toBeUndefined();
  });

  it('el override del numero de modos sigue la misma regla', () => {
    const s = defaultSeismicState();
    expect(toSeismicInput(s).estructura.nModos).toBeUndefined();
    expect(toSeismicInput({ ...s, nModosModo: 'manual', nModosManual: 3 }).estructura.nModos).toBe(3);
    expect(
      toSeismicInput({ ...s, nModosModo: 'manual', nModosManual: 0 }).estructura.nModos,
    ).toBeUndefined();
  });

  it('el peso manual desplaza al asistente de superficie, y solo esa planta', () => {
    const s = defaultSeismicState();
    const plantas = s.plantas.map((p, i) => (i === 0 ? { ...p, pesoManual: true, P: 1234 } : p));
    const input = toSeismicInput({ ...s, plantas });
    expect(input.plantas[0].P).toBe(1234);
    expect(input.plantas[0].area).toBeUndefined();
    expect(input.plantas[1].P).toBeUndefined();
    expect(input.plantas[1].area).toBe(300);
  });

  it('el perfil de estratos solo se usa cuando el modo lo pide', () => {
    const s = defaultSeismicState();
    expect(toSeismicInput(s).emplazamiento.terreno).toBe('II');
    expect(toSeismicInput({ ...s, terrenoModo: 'perfil' }).emplazamiento.terreno).toEqual(s.estratos);
  });

  it('conserva el SIGNO de la coordenada de cada plano resistente', () => {
    // Guardar |x| destruiria la geometria: sin signo no hay centro de rigidez
    // ni requisito (6). El abs() vive dentro de gamma_a, no antes.
    const s = defaultSeismicState();
    const xs = toSeismicInput(s).x.elementos.map((e) => e.x);
    expect(xs.some((v) => v < 0)).toBe(true);
    expect(xs.some((v) => v > 0)).toBe(true);
  });
});

describe('excentricidadDe', () => {
  const dir = (elementos: { id: string; x: number; k: number }[], L = 20) => ({
    L,
    B: 0,
    elementos,
    TFModo: 'auto' as const,
    TFManual: 0,
  });

  it('un reparto simetrico no tiene excentricidad', () => {
    const e = excentricidadDe(dir([
      { id: 'a', x: -10, k: 1 },
      { id: 'b', x: 10, k: 1 },
    ]));
    expect(e).toEqual({ e: 0, dimension: 20 });
  });

  it('la rigidez desplaza el centro de torsion', () => {
    // Centro de rigidez = (1·(−10) + 3·10) / 4 = +5 m.
    const e = excentricidadDe(dir([
      { id: 'a', x: -10, k: 1 },
      { id: 'b', x: 10, k: 3 },
    ]));
    cerca(e!.e, 5);
    expect(e!.dimension).toBe(20);
  });

  it('devuelve null cuando no hay rigidez que repartir', () => {
    expect(excentricidadDe(dir([]))).toBeNull();
    expect(excentricidadDe(dir([{ id: 'a', x: 0, k: 0 }]))).toBeNull();
    expect(excentricidadDe(dir([{ id: 'a', x: 0, k: 1 }], 0))).toBeNull();
  });
});

describe('las puertas cortan antes de calcular', () => {
  it('un municipio con ab < 0,04 g deja el resultado en null', () => {
    const ev = evaluarSismo({ ...defaultSeismicState(), ab: 0.03 });
    expect(ev.aplicabilidad.obligatoriedad.estado).toBe('exenta');
    expect(ev.aplicabilidad.obligatoriedad.motivo).toBe('ab-inferior-0.04g');
    expect(ev.resultado).toBeNull();
    // El emplazamiento SI se resuelve: hace falta para decidir la puerta.
    expect(ev.emplazamiento.ac).toBeGreaterThan(0);
  });

  it('importancia moderada exime, aunque la aceleracion sea alta', () => {
    const ev = evaluarSismo({ ...defaultSeismicState(), importancia: 'moderada' });
    expect(ev.aplicabilidad.obligatoriedad.motivo).toBe('importancia-moderada');
    expect(ev.resultado).toBeNull();
  });

  it('pasarse de plantas invalida el metodo simplificado', () => {
    const ev = evaluarSismo({ ...defaultSeismicState(), n: 25, nTotal: 25 });
    expect(ev.aplicabilidad.obligatoriedad.estado).toBe('obligatoria');
    expect(ev.aplicabilidad.metodoSimplificado?.aplicable).toBe(false);
    expect(ev.resultado).toBeNull();
  });

  it('una declaracion sin contestar impide calcular, no la da por buena', () => {
    const ev = evaluarSismo({ ...defaultSeismicState(), regularidadGeometrica: null });
    expect(ev.aplicabilidad.puedeCalcular).toBe(false);
  });
});

describe('normalizeSeismicState', () => {
  it('sobrevive a basura sin producir NaN', () => {
    for (const basura of [null, undefined, 42, 'x', [], {}]) {
      const s = normalizeSeismicState(basura);
      const ev = evaluarSismo(s);
      expect(Number.isFinite(ev.emplazamiento.ac)).toBe(true);
      expect(Number.isFinite(ev.emplazamiento.S)).toBe(true);
    }
  });

  it('el round-trip por JSON no cambia el estado por defecto', () => {
    const s = defaultSeismicState();
    expect(normalizeSeismicState(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });

  it('repara campos numericos corruptos con el valor por defecto', () => {
    const s = normalizeSeismicState({
      ...defaultSeismicState(),
      ab: 'mucho',
      H: null,
      n: NaN,
      omega: undefined,
    });
    expect(Number.isFinite(s.ab)).toBe(true);
    expect(Number.isFinite(s.H)).toBe(true);
    expect(Number.isFinite(s.n)).toBe(true);
    expect(Number.isFinite(s.omega)).toBe(true);
  });

  it('rechaza enumerados que no existen', () => {
    const s = normalizeSeismicState({ terreno: 'V', importancia: 'urgente', sistema: 'chapuza' });
    expect(['I', 'II', 'III', 'IV']).toContain(s.terreno);
    expect(['moderada', 'normal', 'especial']).toContain(s.importancia);
    expect(s.sistema).toBe('porticos-ha');
  });

  it('una declaracion ausente queda en null, NUNCA en true', () => {
    // Dar por buena una declaración que nadie hizo es el único fallo del módulo
    // que no deja rastro: produce un proyecto sin justificación sísmica.
    const s = normalizeSeismicState({ regularidadGeometrica: 'sí', soportesContinuos: 1 });
    expect(s.regularidadGeometrica).toBeNull();
    expect(s.soportesContinuos).toBeNull();
    expect(s.regularidadMecanica).toBeNull();
    expect(s.excentricidadDeclarada).toBeNull();
    expect(s.porticosBienArriostrados).toBeNull();
  });

  it('conserva las plantas que traiga el estado, con sus ids', () => {
    const s = normalizeSeismicState({
      plantas: [
        { id: 'uno', nombre: 'Sótano', h: 3, area: 50, componentes: [], P: 0, pesoManual: false },
      ],
    });
    expect(s.plantas).toHaveLength(1);
    expect(s.plantas[0].id).toBe('uno');
    expect(s.plantas[0].nombre).toBe('Sótano');
  });
});

describe('blankSeismicState', () => {
  it('arranca sin municipio y sin declaraciones contestadas', () => {
    const s = blankSeismicState();
    expect(s.municipioIne).toBeNull();
    expect(s.ab).toBe(0);
    expect(s.plantas).toHaveLength(1);
    expect(s.regularidadGeometrica).toBeNull();
  });

  it('no revienta al evaluarlo con ab = 0', () => {
    const ev = evaluarSismo(blankSeismicState());
    expect(ev.aplicabilidad.obligatoriedad.estado).toBe('exenta');
    expect(ev.resultado).toBeNull();
  });
});
