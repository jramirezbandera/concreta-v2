/**
 * De qué está hecho el cuadro de PLANO del cuadro de materiales, sin React.
 *
 * Esto vivía en tres `useMemo` dentro de `index.tsx`. Se saca aquí porque a
 * partir del 15-09-2026 hay un SEGUNDO consumidor: la exportación conjunta de
 * la obra (`lib/plano/obra.ts`), que junta los cuadros de los cuatro módulos
 * en un solo DXF sin abrir ninguno. Escribir allí otra vez el mismo ensamblado
 * era garantizar que un día el plano de la obra y el plano del módulo dijeran
 * cosas distintas; con esto sólo hay una manera de construirlo.
 *
 * Las funciones son puras y reciben el estado ya cargado: el módulo les pasa
 * el suyo —el vivo, el que se está tecleando— y el panel de la obra el que hay
 * guardado. `cuadroDePlanoGuardado()` es el atajo del segundo caso.
 */

import {
  cuadroAceroEstructural,
  cuadroAceros,
  cuadroAnclajes,
  cuadroCoeficientesMinoracion,
  cuadroDurabilidadMadera,
  cuadroHormigonPlano,
  cuadroMadera,
  type Block,
} from '../../lib/materiales/cuadros';
import { FYK_ACERO_PASIVO } from '../../lib/materiales/tablasCE';
import type { ExigenciaFuego } from '../../lib/incendio/exigencias';
import { exigenciasDelCuadro } from './incendioPub';
import { cargarEstado, estaConfigurado, evaluar, limpiezaPrescrita, type Evaluacion, type MaterialesState } from './state';

/**
 * Los anclajes no son un apartado que se pida: salen solos del acero corrugado
 * elegido —un B 400 tiene otras longitudes que un B 500— y de los hormigones
 * que la obra usa de verdad. En pantalla y en el Word van pegados al cuadro de
 * acero, que es de donde sale el fyk que los gobierna; en el Excel se van a su
 * propia pestaña, porque sus celdas son números de dos cifras y compartir
 * columna con «Mín. contenido de cemento» los dejaba estirados. Por eso se
 * calculan aparte en vez de dentro de `bloquesComunes`.
 *
 * Los hormigones que se tabulan son los de los elementos; el par por defecto
 * sólo cubre el arranque, cuando aún no hay ninguno resuelto: una tabla de
 * anclajes de un HA que no aparece en ningún elemento es ruido en el plano.
 */
export function bloquesDeAnclajes(state: MaterialesState, ev: Evaluacion): Block[] {
  if (!state.usaHormigon) return [];
  const enObra = [...new Set(ev.hormigon.map((h) => h.derivacion.fckAdoptada))].sort((a, b) => a - b);
  return cuadroAnclajes(
    enObra.length > 0 ? enObra : state.hormigonesAnclaje,
    FYK_ACERO_PASIVO[state.estudio.aceroPasivo],
    state.diametrosAnclaje,
    state.estudio.aceroPasivo,
  );
}

/**
 * Lo que llevan las DOS vistas del documento: aceros, madera y coeficientes.
 * Plano y memoria sólo se diferencian en la tabla de hormigón —una fila por
 * elemento frente a una columna—, así que el resto se construye una vez. Que
 * estuviera escrito sólo dentro del plano era el motivo de que la memoria
 * saliera con el hormigón y nada más.
 */
export function bloquesComunes(
  state: MaterialesState,
  ev: Evaluacion,
  anclajes: Block[],
  fuego: readonly ExigenciaFuego[],
): Block[] {
  const bloques: Block[] = [];
  bloques.push(
    ...cuadroAceros({
      aceroPasivo: state.estudio.aceroPasivo,
      malla: state.estudio.malla,
      aceroEstructural: state.usaAceroEstructural ? state.estudio.aceroEstructural : null,
      nivelControl: state.estudio.nivelControlAcero,
    }),
  );
  bloques.push(...anclajes);
  if (state.usaAceroEstructural && ev.acero) {
    bloques.push(...cuadroAceroEstructural(ev.acero, state.estudio.vidaUtilAnios));
  }
  if (state.usaMadera && ev.madera.length > 0) {
    const derivaciones = ev.madera.map((m) => m.derivacion);
    bloques.push(...cuadroMadera(derivaciones), ...cuadroDurabilidadMadera(derivaciones));
  }
  bloques.push(
    ...cuadroCoeficientesMinoracion(
      {
        maderaLaminada: state.usaMadera && ev.madera.some((m) => m.fila.tipo === 'laminada'),
        maderaMaciza: state.usaMadera && ev.madera.some((m) => m.fila.tipo === 'maciza'),
        aceroLaminado: state.usaAceroEstructural,
        aceroDeArmar: state.usaHormigon,
        hormigon: state.usaHormigon,
      },
      fuego,
    ),
  );
  return bloques;
}

/** El cuadro del plano entero: la tabla de hormigón por columnas, más lo común. */
export function bloquesDePlano(
  state: MaterialesState,
  ev: Evaluacion,
  comunes: Block[],
): Block[] {
  const bloques: Block[] = [];
  if (state.usaHormigon) {
    bloques.push(
      ...cuadroHormigonPlano(
        ev.hormigon.map((h) => h.derivacion),
        ev.limpieza.map((f) => ({
          ...limpiezaPrescrita(f, state.estudio.tamMaxArido),
          nivelControl: 'Según capítulos 13 y 14',
        })),
      ),
    );
  }
  return [...bloques, ...comunes];
}

/**
 * El cuadro de plano de lo que hay GUARDADO, y sus dos pestañas de Excel.
 * `null` cuando el módulo sigue con los valores de partida: un cuadro de
 * materiales que nadie ha tocado no es un cuadro de esta obra.
 */
export function cuadroDePlanoGuardado(): { blocks: Block[]; secciones: { nombre: string; blocks: Block[] }[] } | null {
  const state = cargarEstado();
  if (!estaConfigurado(state)) return null;
  const ev = evaluar(state);
  const anclajes = bloquesDeAnclajes(state, ev);
  const comunes = bloquesComunes(state, ev, anclajes, exigenciasDelCuadro());
  const blocks = bloquesDePlano(state, ev, comunes);
  return {
    blocks,
    // Las mismas dos pestañas que exporta el módulo, y por sustracción para
    // que no puedan divergir el día que se añada un cuadro.
    secciones: [
      { nombre: 'Cuadro de materiales', blocks: blocks.filter((b) => !anclajes.includes(b)) },
      { nombre: 'Anclajes', blocks: anclajes },
    ],
  };
}
