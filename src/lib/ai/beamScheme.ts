/**
 * Guardarraíl del ESQUEMA ESTÁTICO de una viga (`beamType`), compartido por vigas
 * de acero y de madera — los dos módulos que leen `BEAM_CASES`.
 *
 * FUGA 4 de la auditoría (2026-07-14). Dos agujeros distintos, un mismo origen:
 *
 * 1. En vigas de ACERO, `beamType` NO TENÍA REGLA. Declarar biempotrada una viga
 *    biapoyada baja MEd un 33% (wL²/8 → wL²/12) y la flecha un 70% (k = 5/48 →
 *    1/32). Es la rebaja de demanda más barata del módulo, y de paso arrastra
 *    `Lcr` —que sí tenía regla— por la puerta de atrás, porque el mapper
 *    reautorrellena la longitud de pandeo con el `Lcr_factor` del nuevo esquema.
 *
 * 2. En vigas de MADERA la regla existía pero estaba MAL CALIBRADA: el ordinal se
 *    construía con `MEd(1,1)`, y ahí `ss` y `fp` EMPATAN (los dos wL²/8), mientras
 *    que sus flechas son 5/48 = 0.1042 y 8/185.185 = 0.0432 — un 59% menos. En
 *    madera la flecha es quien suele dimensionar: declarar "empotrada en el muro"
 *    una viga biapoyada la hacía cumplir sin mover un número, con riesgo CERO.
 *
 * Un solo ordinal no puede cubrirlo, porque el esquema mueve TRES demandas a la vez
 * y no lo hace de forma monótona (ss→fp: mismo M, MENOS flecha, MÁS cortante). Así
 * que hay una regla por demanda, cada una sobre el coeficiente que el motor usa de
 * verdad (`BEAM_CASES`), y cada una salta solo si SU demanda baja. Un cambio de
 * esquema típico enciende una o dos, no las tres.
 *
 * Los coeficientes se evalúan con w = 1 y L = 1 para aislar la contribución del
 * ESQUEMA: la carga y la luz tienen sus propias reglas y no deben contaminar esta.
 */
import { BEAM_CASES } from '../calculations/beamCases';
import type { BeamType } from '../../data/defaults';
import { higherIsSafer, type ResolvedSafetyRule } from './safety';

/** Todo estado que declare un esquema estático de viga. */
interface HasBeamType {
  beamType: BeamType;
}

const WHY_COMMON =
  'El esquema estático (biapoyada, en voladizo, empotrada en un extremo o biempotrada) '
  + 'describe cómo está CONSTRUIDA la viga, no es una variable de diseño: un empotramiento '
  + 'solo es real si el nudo puede transmitir el momento y el apoyo no gira.';

/**
 * Las tres reglas del esquema. Genérica sobre TInputs para que acero y madera
 * compartan una única definición (y una única calibración).
 */
export function beamSchemeRules<T extends HasBeamType>(): ReadonlyArray<ResolvedSafetyRule<T>> {
  return [
    {
      id: 'esquema_MEd',
      label: 'Momento del esquema estático',
      resolve: (s) => BEAM_CASES[s.beamType].MEd(1, 1),
      level: higherIsSafer,
      format: (v) => `${v.toFixed(3)}·wL²`,
      why: `${WHY_COMMON} Cambiarlo rebaja el momento de cálculo sin tocar el perfil: de biapoyada (wL²/8) a biempotrada (wL²/12) son un 33% menos.`,
      fields: ['beamType'],
      confirmKeys: ['beamType'],
    },
    {
      id: 'esquema_cortante',
      label: 'Cortante del esquema estático',
      resolve: (s) => BEAM_CASES[s.beamType].VEd(1, 1),
      level: higherIsSafer,
      format: (v) => `${v.toFixed(3)}·wL`,
      why: `${WHY_COMMON} Cambiarlo rebaja el cortante de cálculo sin tocar el perfil.`,
      fields: ['beamType'],
      confirmKeys: ['beamType'],
    },
    {
      id: 'esquema_flecha',
      label: 'Flecha del esquema estático',
      resolve: (s) => BEAM_CASES[s.beamType].k_defl,
      level: higherIsSafer,
      format: (v) => `k = ${v.toFixed(4)}`,
      why: `${WHY_COMMON} Y la flecha es lo que más se mueve: de biapoyada (k = 5/48) a biempotrada (k = 1/32) hay un 70% menos, y de biapoyada a empotrada-apoyada un 59% — con el MISMO momento, así que un guardarraíl que solo mirase M no lo vería. En madera, además, la flecha es quien suele dimensionar la viga.`,
      fields: ['beamType'],
      confirmKeys: ['beamType'],
    },
  ];
}
