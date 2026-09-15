/**
 * Los cuadros de plano de toda la obra, reunidos sin abrir ningún módulo.
 *
 * Lo que aquí importa no es la geometría —de eso va `conjunto.test.ts`— sino
 * QUIÉN entra: un módulo que nadie ha tocado no puede colar en el plano su
 * cuadro de valores de partida, y el cuadro que sale tiene que ser el mismo que
 * exporta el módulo por su cuenta. Esto último es la razón de existir de los
 * cuatro `plano.ts`, y si un día alguien vuelve a escribir el ensamblado en
 * `lib/plano/obra.ts` este fichero lo dice.
 */

import { beforeEach, describe, it, expect } from 'vitest';
import { cuadrosDeLaObra } from '../../lib/plano/obra';
import {
  cuadroDePlanoGuardado as cuadroMateriales,
  bloquesComunes,
  bloquesDeAnclajes,
  bloquesDePlano,
} from '../../features/materiales/plano';
import {
  defaultMaterialesState,
  evaluar as evaluarMateriales,
  guardarEstado as guardarMateriales,
  nuevoId,
  filaDesdePreset,
} from '../../features/materiales/state';
import { defaultIncendioState, guardarEstado as guardarIncendio, nuevoSector } from '../../features/incendio/state';
import { claseUso } from '../../lib/incendio/sectores';
import { exigenciasDelCuadro } from '../../features/materiales/incendioPub';

beforeEach(() => {
  localStorage.clear();
});

describe('cuadrosDeLaObra', () => {
  it('una obra en blanco no trae ningún cuadro', () => {
    // Ni uno: los valores de partida de un módulo no son el cuadro de esta
    // obra, y llevados al plano se ejecutan.
    expect(cuadrosDeLaObra()).toEqual([]);
  });

  it('un módulo relleno entra, y con el MISMO cuadro que exporta él', () => {
    const state = defaultMaterialesState();
    state.elementos = [
      { ...filaDesdePreset('Cimentación'), id: nuevoId(), fck: 35 },
      { ...filaDesdePreset('Forjados'), id: nuevoId(), fck: 35 },
    ];
    guardarMateriales(state);

    const cuadros = cuadrosDeLaObra();
    expect(cuadros).toHaveLength(1);
    expect(cuadros[0].modulo).toBe('concreta-materiales');

    // El cuadro reconstruido a mano por el camino del módulo: mismos bloques.
    const ev = evaluarMateriales(state);
    const anclajes = bloquesDeAnclajes(state, ev);
    const esperado = bloquesDePlano(state, ev, bloquesComunes(state, ev, anclajes, exigenciasDelCuadro()));
    expect(cuadros[0].blocks).toEqual(esperado);
  });

  it('el orden es el del capítulo, no el de terminación', () => {
    // En el plano los cuadros se leen siempre igual: no puede depender de por
    // dónde empezó el usuario. Incendio se rellena ANTES que materiales y aun
    // así sale detrás.
    const incendio = defaultIncendioState();
    incendio.sectores = [{ ...nuevoSector('Viviendas'), clase: claseUso('residencialVivienda'), minutosManual: 120 }];
    guardarIncendio(incendio);

    const materiales = defaultMaterialesState();
    materiales.elementos = [{ ...filaDesdePreset('Cimentación'), id: nuevoId(), fck: 35 }];
    guardarMateriales(materiales);

    expect(cuadrosDeLaObra().map((c) => c.modulo)).toEqual(['concreta-materiales', 'concreta-incendio']);
  });

  it('un módulo relleno cuyo cuadro sale vacío tampoco ocupa columna', () => {
    // Un sector sin nombre y sin R no produce cuadro: la columna sería un
    // rótulo con nada debajo.
    const incendio = defaultIncendioState();
    incendio.sectores = [nuevoSector('')];
    guardarIncendio(incendio);
    expect(cuadrosDeLaObra()).toEqual([]);
  });

  it('cada cuadro trae sus pestañas de Excel, y ninguna vacía', () => {
    const state = defaultMaterialesState();
    state.elementos = [{ ...filaDesdePreset('Cimentación'), id: nuevoId(), fck: 35 }];
    guardarMateriales(state);
    const [cuadro] = cuadrosDeLaObra();
    expect(cuadro.secciones.length).toBeGreaterThan(0);
    for (const s of cuadro.secciones) expect(s.blocks.length).toBeGreaterThan(0);
  });

  it('un estado guardado ilegible no tumba los cuadros de los demás', () => {
    // Un `.concreta` de otra versión, o un almacén a medio escribir. Antes de
    // que esto estuviera envuelto, el DXF entero fallaba por uno de los cuatro.
    const state = defaultMaterialesState();
    state.elementos = [{ ...filaDesdePreset('Cimentación'), id: nuevoId(), fck: 35 }];
    guardarMateriales(state);
    localStorage.setItem('concreta-incendio-model', '{ esto no es JSON');
    expect(cuadrosDeLaObra().map((c) => c.modulo)).toEqual(['concreta-materiales']);
  });
});

describe('cuadroDePlanoGuardado de materiales', () => {
  it('devuelve null mientras el módulo sigue con los valores de partida', () => {
    guardarMateriales(defaultMaterialesState());
    expect(cuadroMateriales()).toBeNull();
  });
});
