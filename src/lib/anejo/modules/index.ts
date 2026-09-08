/**
 * Los adaptadores del anejo, uno por módulo, en el orden del sidebar.
 *
 * Espejo de `src/lib/ai/modules/`. `src/test/anejo/adaptadores.test.ts`
 * exige que cada entrada de `CLAVES_PROYECTO` (menos el propio anejo) tenga
 * exactamente un adaptador y al revés: el módulo 26 que no se dé de alta
 * aquí falla en el test, no en el botón.
 */

import type { AdaptadorAnejo } from '../types';
import { materialesAnejo } from './materiales';
import { memoriaDBSEAnejo } from './memoriaDBSE';
import { seismicNCSE02Anejo } from './seismicNCSE02';
import { vientoNieveAnejo } from './vientoNieve';
import { cargasPlantaAnejo } from './cargasPlanta';
import { rcBeamsAnejo } from './rcBeams';
import { rcColumnsAnejo } from './rcColumns';
import { steelBeamsAnejo } from './steelBeams';
import { steelColumnsAnejo } from './steelColumns';
import { isolatedFootingAnejo } from './isolatedFooting';
import { retainingWallAnejo } from './retainingWall';
import { punchingAnejo } from './punching';
import { forjadosAnejo } from './forjados';
import { pileCapAnejo } from './pileCap';
import { micropilesAnejo } from './micropiles';
import { empresilladoAnejo } from './empresillado';
import { timberBeamsAnejo } from './timberBeams';
import { timberColumnsAnejo } from './timberColumns';
import { anchorPlateAnejo } from './anchorPlate';
import { rockfillWallAnejo } from './rockfillWall';
import { compositeSectionAnejo } from './compositeSection';
import { masonryWallsAnejo } from './masonryWalls';
import { femAnalysisAnejo } from './femAnalysis';
import { fem2dAnejo } from './fem2d';
import { slopeStabilityAnejo } from './slopeStability';

export const ADAPTADORES_ANEJO: readonly AdaptadorAnejo[] = [
  materialesAnejo,
  memoriaDBSEAnejo,
  seismicNCSE02Anejo,
  vientoNieveAnejo,
  cargasPlantaAnejo,
  rcBeamsAnejo,
  rcColumnsAnejo,
  steelBeamsAnejo,
  steelColumnsAnejo,
  isolatedFootingAnejo,
  retainingWallAnejo,
  punchingAnejo,
  forjadosAnejo,
  pileCapAnejo,
  micropilesAnejo,
  empresilladoAnejo,
  timberBeamsAnejo,
  timberColumnsAnejo,
  anchorPlateAnejo,
  rockfillWallAnejo,
  compositeSectionAnejo,
  masonryWallsAnejo,
  femAnalysisAnejo,
  fem2dAnejo,
  slopeStabilityAnejo,
];

const porModulo: ReadonlyMap<string, AdaptadorAnejo> = new Map(ADAPTADORES_ANEJO.map((a) => [a.modulo, a]));

/** El adaptador del módulo, o `undefined` si no tiene (una pieza de otra versión de Concreta). */
export function buscarAdaptador(modulo: string): AdaptadorAnejo | undefined {
  return porModulo.get(modulo);
}

/** El adaptador del módulo. Lanza si no tiene: es un error de programación, no de datos. */
export function adaptadorDe(modulo: string): AdaptadorAnejo {
  const a = porModulo.get(modulo);
  if (!a) throw new Error(`anejo: el módulo '${modulo}' no tiene adaptador en src/lib/anejo/modules/`);
  return a;
}
