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
  newId,
  normalizeSeismicState,
  plantasSobreRasante,
  plantasTotales,
  toSeismicInput,
  type SeismicState,
} from '../../features/seismic-ncse02/state';
import { CASO_GRANADA } from '../fixtures/ncse02.fixtures';

const cerca = (a: number, b: number, tol = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(tol);

/**
 * Estado con `nPlantas` plantas de verdad.
 *
 * `n` ya no es un campo que se pueda declarar: es la tabla, contada. Un test
 * que quiera un edificio de veinticinco plantas tiene que construirlo, y eso es
 * exactamente lo que se pretende — declarar `n: 25` sobre diez filas de plantas
 * era lo que producía estados imposibles.
 */
export function conPlantas(nPlantas: number, extra: Partial<SeismicState> = {}): SeismicState {
  const s = defaultSeismicState();
  const plantas = Array.from({ length: nPlantas }, (_, k) => ({
    ...s.plantas[Math.min(k, s.plantas.length - 1)],
    id: newId(),
    nombre: `Planta ${k + 1}`,
    h: 3 * (k + 1),
  }));
  return { ...s, plantas, H: 3 * nPlantas, ...extra };
}

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
    const e = excentricidadDe(
      dir([
        { id: 'a', x: -10, k: 1 },
        { id: 'b', x: 10, k: 1 },
      ]),
      15,
    );
    expect(e).toEqual({ e: 0, dimension: 15 });
  });

  it('la rigidez desplaza el centro de torsion', () => {
    // Centro de rigidez = (1·(−10) + 3·10) / 4 = +5 m.
    const e = excentricidadDe(
      dir([
        { id: 'a', x: -10, k: 1 },
        { id: 'b', x: 10, k: 3 },
      ]),
      15,
    );
    cerca(e!.e, 5);
    expect(e!.dimension).toBe(15);
  });

  it('normaliza con la dimension PERPENDICULAR, no con la de la propia direccion', () => {
    // El caso de la auditoría (A4). Planta de 20 × 15 m: los planos que
    // resisten el sismo en X se reparten sobre el eje Y, así que la
    // excentricidad que sale de ellos es un desplazamiento EN Y y se compara
    // con los 15 m de Y, no con los 20 m de X.
    //
    // Centro de rigidez = (1·(−7,5) + 1,5·7,5) / 2,5 = +1,5 m.
    const e = excentricidadDe(
      dir(
        [
          { id: 'a', x: -7.5, k: 1 },
          { id: 'b', x: 7.5, k: 1.5 },
        ],
        20, // L de la propia dirección: ya NO interviene
      ),
      15,
    );
    cerca(e!.e, 1.5);
    expect(e!.dimension).toBe(15);
    // 1,5 / 15 = 10,0 % → incumple. Con la L propia habría dado 7,5 % y habría
    // pasado: el convenio cruzado caía siempre del lado inseguro.
    expect(e!.e / e!.dimension).toBeGreaterThanOrEqual(0.1);
  });

  it('devuelve null cuando no hay rigidez que repartir', () => {
    expect(excentricidadDe(dir([]), 15)).toBeNull();
    expect(excentricidadDe(dir([{ id: 'a', x: 0, k: 0 }]), 15)).toBeNull();
    expect(excentricidadDe(dir([{ id: 'a', x: 0, k: 1 }]), 0)).toBeNull();
  });

  it('los planos por defecto caben dentro del edificio', () => {
    // La geometría de arranque repartía los cuatro planos de X sobre 20 m
    // —la dimensión de X— a lo largo de un eje que mide 15: dos de ellos
    // quedaban FUERA del edificio.
    const s = defaultSeismicState();
    const semiancho = (d: { elementos: { x: number }[] }) =>
      Math.max(...d.elementos.map((e) => Math.abs(e.x)));
    expect(semiancho(s.x)).toBeLessThanOrEqual(s.y.L / 2);
    expect(semiancho(s.y)).toBeLessThanOrEqual(s.x.L / 2);
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
    const ev = evaluarSismo(conPlantas(25));
    expect(ev.aplicabilidad.obligatoriedad.estado).toBe('obligatoria');
    expect(ev.aplicabilidad.metodoSimplificado?.aplicable).toBe(false);
    expect(ev.resultado).toBeNull();
  });

  it('una declaracion sin contestar impide calcular, no la da por buena', () => {
    const ev = evaluarSismo({ ...defaultSeismicState(), regularidadGeometrica: null });
    expect(ev.aplicabilidad.puedeCalcular).toBe(false);
  });

  it('cada corte dice POR QUE, y solo hay impedimento cuando no hay resultado', () => {
    const ok = evaluarSismo(defaultSeismicState());
    expect(ok.resultado).not.toBeNull();
    expect(ok.impedimento).toBeNull();

    const casos: Array<[SeismicState, string]> = [
      [{ ...defaultSeismicState(), ab: 0.03 }, 'norma-no-obligatoria'],
      [{ ...defaultSeismicState(), importancia: 'moderada' }, 'norma-no-obligatoria'],
      [conPlantas(25), 'metodo-simplificado-no-aplicable'],
      [{ ...defaultSeismicState(), sistema: 'adobe' }, 'prohibicion-art-1.2.3'],
      [{ ...defaultSeismicState(), sistema: 'otro' }, 'faltan-datos-de-calculo'],
    ];
    for (const [estado, motivo] of casos) {
      const ev = evaluarSismo(estado);
      expect(ev.resultado, motivo).toBeNull();
      expect(ev.impedimento?.motivo, motivo).toBe(motivo);
      expect(ev.impedimento?.texto.length, motivo).toBeGreaterThan(20);
    }
  });
});

describe('sin periodo fundamental NO se calcula', () => {
  // El fallo que esto impide: el aviso `sin-expresion-tf` tiene severidad
  // "bloqueo" y nadie lo honraba. El motor seguia con T_F = 0, que en la
  // expresion de alpha da 2,5 —el maximo del espectro—, y salia una cadena
  // entera de fuerzas con aspecto razonable levantada sobre nada. El PDF la
  // imprimia atribuyendo el T_F al art. 3.7.2.2, que para ese sistema no
  // tiene expresion ninguna.

  it('un sistema sin expresion de T_F no produce resultado', () => {
    const ev = evaluarSismo({ ...defaultSeismicState(), sistema: 'otro' });
    // La Norma rige y el metodo simplificado vale: el problema es otro.
    expect(ev.aplicabilidad.puedeCalcular).toBe(true);
    expect(ev.aplicabilidad.metodoSimplificado?.aplicable).toBe(true);
    // Y aun asi no se calcula, porque no hay periodo fundamental.
    expect(ev.resultado).toBeNull();
    expect(ev.impedimento?.motivo).toBe('faltan-datos-de-calculo');
    expect(ev.impedimento?.articulo).toBe('3.7.2.2');
  });

  it('con T_F impuesto a mano SI calcula: es la salida del art. 3.6.2.3.2', () => {
    const s = defaultSeismicState();
    const ev = evaluarSismo({
      ...s,
      sistema: 'otro',
      x: { ...s.x, TFModo: 'manual', TFManual: 0.3 },
      y: { ...s.y, TFModo: 'manual', TFManual: 0.3 },
    });
    expect(ev.resultado).not.toBeNull();
    expect(ev.impedimento).toBeNull();
    expect(ev.resultado?.x.TF).toBeCloseTo(0.3, 12);
    expect(ev.resultado?.x.TFManual).toBe(true);
  });

  it('un T_F manual de cero no vale como T_F', () => {
    const s = defaultSeismicState();
    const ev = evaluarSismo({
      ...s,
      sistema: 'otro',
      x: { ...s.x, TFModo: 'manual', TFManual: 0 },
      y: { ...s.y, TFModo: 'manual', TFManual: 0 },
    });
    expect(ev.resultado).toBeNull();
    expect(ev.impedimento?.motivo).toBe('faltan-datos-de-calculo');
  });

  it('la fabrica sin dimension en planta tampoco tiene T_F', () => {
    // La expresion (1) lleva un /sqrt(L): con L = 0 no hay periodo, aunque el
    // sistema si tenga expresion tabulada.
    //
    // El edificio es de dos alturas a proposito: con ab = 0,23 g el art. 1.2.3
    // limita la fabrica a dos, y una prohibicion de material manda sobre la
    // falta de datos. Lo que se prueba aqui es lo segundo.
    const dos = conPlantas(2, { sistema: 'fabrica' });
    const ev = evaluarSismo({ ...dos, x: { ...dos.x, L: 0 } });
    expect(ev.aplicabilidad.puedeCalcular).toBe(true);
    expect(ev.resultado).toBeNull();
    expect(ev.impedimento?.motivo).toBe('faltan-datos-de-calculo');
    // Y nombra la direccion que falla, que es la mitad del trabajo de arreglarlo.
    expect(ev.impedimento?.texto).toMatch(/direcci.n X/i);
  });

  it('nombra las dos direcciones cuando fallan las dos', () => {
    const ev = evaluarSismo({ ...defaultSeismicState(), sistema: 'otro' });
    expect(ev.impedimento?.texto).toMatch(/ninguna de las dos direcciones/i);
  });
});

describe('n y n total son derivados: no se pueden contradecir', () => {
  // El fallo que esto impide: `n`, `nTotal` y la tabla de plantas eran tres
  // numeros independientes. «+ planta» subia `n` y no tocaba `nTotal`; borrar
  // una fila no tocaba ninguno. Con `n = 5` y `nTotal = 3` —imposible, porque
  // los sotanos SUMAN— la pasarela del art. 3.5.1, que mira `nTotal <= 4`,
  // declaraba aplicable el metodo simplificado a un edificio de cinco plantas
  // sin una sola declaracion de regularidad.

  it('n es la tabla de plantas, contada', () => {
    for (const k of [1, 3, 10, 25]) {
      const s = conPlantas(k);
      expect(plantasSobreRasante(s)).toBe(k);
      expect(toSeismicInput(s).estructura.n).toBe(k);
    }
  });

  it('n total es n mas los sotanos, y nunca puede quedar por debajo', () => {
    for (const nP of [1, 4, 10])
      for (const sotanos of [0, 1, 2, 5]) {
        const s = conPlantas(nP, { sotanos });
        expect(plantasTotales(s)).toBe(nP + sotanos);
        expect(plantasTotales(s)).toBeGreaterThanOrEqual(plantasSobreRasante(s));
      }
  });

  it('un sotanos negativo o fraccionario no rompe el recuento', () => {
    expect(plantasTotales(conPlantas(4, { sotanos: -3 }))).toBe(4);
    expect(plantasTotales(conPlantas(4, { sotanos: 1.7 }))).toBe(5);
  });

  it('la pasarela NO se abre para un edificio de cinco plantas', () => {
    // El escenario exacto del fallo: cinco plantas de verdad, con las
    // declaraciones sin contestar. Antes bastaba con que `nTotal` se hubiera
    // quedado en 3 para que el modulo calculara como si fueran cuatro.
    const cinco = conPlantas(5, {
      regularidadGeometrica: null,
      soportesContinuos: null,
      regularidadMecanica: null,
      excentricidadDeclarada: null,
    });
    const ev = evaluarSismo(cinco);
    expect(plantasTotales(cinco)).toBe(5);
    expect(ev.aplicabilidad.metodoSimplificado?.via).not.toBe('pasarela-4-plantas');
    expect(ev.aplicabilidad.puedeCalcular).toBe(false);
    expect(ev.resultado).toBeNull();
  });

  it('y SI se abre para cuatro plantas sin sotanos, que es su caso', () => {
    const cuatro = conPlantas(4, {
      regularidadGeometrica: null,
      soportesContinuos: null,
      regularidadMecanica: null,
      excentricidadDeclarada: null,
    });
    const ev = evaluarSismo(cuatro);
    expect(ev.aplicabilidad.metodoSimplificado?.via).toBe('pasarela-4-plantas');
    expect(ev.resultado).not.toBeNull();
  });

  it('dos sotanos cierran la pasarela a un edificio de cuatro plantas', () => {
    // El caso que la Norma distingue y que el modulo documenta desde el
    // principio: 4 sobre rasante + 2 sotanos = 6 en total, y NO entra.
    const conSotanos = conPlantas(4, {
      sotanos: 2,
      regularidadGeometrica: null,
      soportesContinuos: null,
      regularidadMecanica: null,
      excentricidadDeclarada: null,
    });
    expect(plantasTotales(conSotanos)).toBe(6);
    const ev = evaluarSismo(conSotanos);
    expect(ev.aplicabilidad.metodoSimplificado?.via).not.toBe('pasarela-4-plantas');
    expect(ev.resultado).toBeNull();
  });

  it('anadir o quitar plantas mueve n sin que nadie lo mantenga a mano', () => {
    const s = conPlantas(3);
    const masUna: SeismicState = { ...s, plantas: [...s.plantas, { ...s.plantas[0], id: newId(), h: 12 }] };
    const menosUna: SeismicState = { ...s, plantas: s.plantas.slice(0, 2) };
    expect(plantasSobreRasante(masUna)).toBe(4);
    expect(plantasSobreRasante(menosUna)).toBe(2);
    expect(toSeismicInput(menosUna).estructura.n).toBe(2);
  });
});

describe('normalizeSeismicState', () => {
  it('migra un caso guardado con el modelo antiguo de n y nTotal', () => {
    // Los casos archivados llevan `n` y `nTotal` sueltos. La conversion honesta
    // es sotanos = nTotal - plantas.length.
    const s = normalizeSeismicState({
      ...defaultSeismicState(),
      n: 10,
      nTotal: 12,
      sotanos: undefined,
    });
    expect(s.sotanos).toBe(2);
    expect(plantasTotales(s)).toBe(12);
  });

  it('un estado antiguo INCOHERENTE no revive con sotanos negativos', () => {
    // `nTotal < n` era justamente el fallo. Al migrarlo se acota a cero: el
    // edificio pasa a no tener sotanos, que es lo unico que puede afirmarse.
    const s = normalizeSeismicState({ ...defaultSeismicState(), n: 10, nTotal: 3, sotanos: undefined });
    expect(s.sotanos).toBe(0);
    expect(plantasTotales(s)).toBe(plantasSobreRasante(s));
  });

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
      sotanos: NaN,
      omega: undefined,
    });
    expect(Number.isFinite(s.ab)).toBe(true);
    expect(Number.isFinite(s.H)).toBe(true);
    expect(Number.isFinite(s.sotanos)).toBe(true);
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
