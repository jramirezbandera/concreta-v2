/**
 * Las vigas de la obra que van al cuadro del plano.
 *
 * Es el mismo papel que hacen los `plano.ts` de materiales, viento y nieve,
 * cargas e incendio: leer lo que la obra tiene guardado y devolverlo en la
 * forma que el exportador necesita. Con una diferencia de fondo, y es la que
 * explica por qué este fichero existe: aquellos leen UN estado de módulo —el
 * cuadro de materiales de la obra es uno solo—, y una obra tiene tantas vigas
 * como se hayan calculado.
 *
 * **De dónde salen las vigas: del anejo.** Guardar una viga en el anejo es lo
 * que ya se hace para que entre en la memoria de cálculo, y la pieza guarda los
 * datos del cálculo además del PDF (ver `lib/anejo/types.ts`), así que el
 * cuadro del plano y el anejo no pueden discrepar: son las mismas vigas. La
 * viga que está en pantalla y no se ha guardado NO entra, y es lo correcto —un
 * cálculo a medias no es una viga de la obra—, pero conviene decirlo, que para
 * eso está `hayTrabajoSinGuardar`.
 *
 * **Cómo se lee una pieza.** Igual que la restaura `restaurarPieza`: se mira
 * primero `motivoDeNoAbrir`, que es el que sabe si la pieza es de un esquema ya
 * cambiado o si viene de una versión que no guardaba datos, y sólo entonces se
 * parsea. Una pieza vieja no tumba el cuadro: se salta y se dice cuál.
 *
 * **Y el resumen de una viga de pórtico**, que es la única regla de ingeniería
 * de aquí, está explicada en `lib/dxf/vigas.ts`: arriba el apoyo, abajo el
 * vano, zona A los cercos del apoyo y zona B los del vano.
 */

import { rcBeamDefaults, type RCBeamInputs } from '../../data/defaults';
import { getModuleSchemaVersion } from '../../data/moduleRegistry';
import { motivoDeNoAbrir, piezas } from '../../lib/anejo';
import { calcRCBeam } from '../../lib/calculations/rcBeams';
import type { BarrasCuadro, CercoCuadro, VigaDeCuadro } from '../../lib/dxf/vigas';

/** `moduleRegistry.key` del módulo, y su clave de localStorage. */
const MODULO = 'concreta-rc-beams';
const CLAVE = 'rc-beams';

export interface VigasDeLaObra {
  /** En el orden del anejo, que es el del documento. */
  vigas: VigaDeCuadro[];
  /** Rótulo de las piezas que no se pudieron leer, para poder decirlo. */
  descartadas: string[];
  /**
   * Rótulo de las vigas que NO cumplen alguna comprobación.
   *
   * El cuadro es un plano: dice qué hay que poner en obra y no lleva
   * utilizaciones ni semáforos, así que una viga que no verifica saldría en él
   * indistinguible de una que sí. Es la misma razón por la que el detalle tipo
   * de encepado no se exporta con comprobaciones en rojo, y quien decide qué
   * hacer con esto es el módulo: aquí sólo se cuenta.
   */
  noVerifican: string[];
}

/**
 * Cercos de dos ramas por sección.
 *
 * El módulo pide RAMAS y el plano del estudio escribe CERCOS: «eØ8c/20» es un
 * cerco de dos ramas y «2eØ8c/15» son dos, o sea cuatro ramas. Con un número
 * impar —tres ramas: un cerco y una rama suelta— se redondea hacia arriba, que
 * es lo que decidió el usuario (2026-09-22): el plano pide un poco más de acero
 * del comprobado, que es el lado seguro.
 */
function cercosDeRamas(ramas: number): number {
  return Math.max(1, Math.ceil((Number.isFinite(ramas) ? ramas : 2) / 2));
}

/**
 * La viga tal como entra en el cuadro.
 *
 * En pórtico la sección es el resumen de las dos que calcula el módulo; en
 * simple es la única que hay, y entonces los cercos van en una sola línea sin
 * zona: el cálculo no distingue dos y escribirlas sería inventarse una.
 */
export function vigaDeCuadro(inp: RCBeamInputs, rotulo: string): VigaDeCuadro {
  const portico = inp.mode === 'portico';
  const sup: BarrasCuadro = portico
    ? { n: inp.apoyo_top_nBars, phi: inp.apoyo_top_barDiam }
    : { n: inp.vano_top_nBars, phi: inp.vano_top_barDiam };
  const inf: BarrasCuadro = { n: inp.vano_bot_nBars, phi: inp.vano_bot_barDiam };
  const vano: CercoCuadro = {
    zona: portico ? 'B' : null,
    phi: inp.vano_stirrupDiam,
    s: inp.vano_stirrupSpacing,
    cercos: cercosDeRamas(inp.vano_stirrupLegs),
  };
  const cercos: CercoCuadro[] = portico
    ? [
        {
          zona: 'A',
          phi: inp.apoyo_stirrupDiam,
          s: inp.apoyo_stirrupSpacing,
          cercos: cercosDeRamas(inp.apoyo_stirrupLegs),
        },
        vano,
      ]
    : [vano];
  return {
    rotulo,
    b: inp.b,
    h: inp.h,
    rec: inp.cover,
    sup,
    inf,
    cercos,
    fck: inp.fck,
    fyk: inp.fyk,
  };
}

/** El rótulo de una viga sin nombre: V-01, V-02… por su sitio en el anejo. */
function rotuloPorDefecto(i: number): string {
  return `V-${String(i + 1).padStart(2, '0')}`;
}

/**
 * Los datos de una pieza del anejo, leídos como los lee `useModuleState`: se
 * comprueba la versión de esquema y se mezclan con los valores de partida, para
 * que una pieza guardada antes de que existiera un campo no llegue sin él.
 */
function inputsDePieza(datos: Record<string, string>): RCBeamInputs | null {
  if (datos[`${CLAVE}-version`] !== getModuleSchemaVersion(CLAVE)) return null;
  const crudo = datos[CLAVE];
  if (crudo === undefined) return null;
  try {
    const parsed = JSON.parse(crudo) as Partial<RCBeamInputs>;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    return { ...rcBeamDefaults, ...parsed };
  } catch {
    return null;
  }
}

/**
 * Las vigas que hoy tiene esta obra, en el orden del anejo.
 *
 * Se lee todo en cada llamada, sin cachear: el anejo puede haber cambiado en
 * otra pestaña, y un cuadro viejo en el plano no se nota hasta que está en obra.
 */
export function vigasDelAnejo(): VigasDeLaObra {
  const vigas: VigaDeCuadro[] = [];
  const descartadas: string[] = [];
  const noVerifican: string[] = [];
  let i = 0;
  for (const pieza of piezas()) {
    if (pieza.modulo !== MODULO) continue;
    const nombre = pieza.titulo.trim();
    const inp = motivoDeNoAbrir(pieza) === null && pieza.datos ? inputsDePieza(pieza.datos) : null;
    if (!inp) {
      descartadas.push(nombre || rotuloPorDefecto(i));
      i++;
      continue;
    }
    // El nombre que vale es el del CALCULO, no el del capítulo: una pieza
    // guardada sin nombre entra en el índice del anejo con el rótulo del
    // módulo («Vigas de hormigón»), y eso encima de una sección es ruido.
    const rotulo = inp.title.trim() || rotuloPorDefecto(i);
    if (!cumple(inp)) noVerifican.push(rotulo);
    vigas.push(vigaDeCuadro(inp, rotulo));
    i++;
  }
  return { vigas, descartadas, noVerifican };
}

/**
 * ¿Verifica la viga?
 *
 * Se vuelve a calcular, que es barato y es la única manera de saberlo: la pieza
 * guarda los datos, no el veredicto. En pórtico tienen que cumplir las DOS
 * secciones, porque las dos salen en la sección del cuadro —la de arriba es la
 * del apoyo y la de abajo la del vano—; en simple la pieza es una sección y el
 * apoyo no es de nadie.
 *
 * Los avisos (`warn`) no cuentan: son recomendaciones, no incumplimientos.
 */
function cumple(inp: RCBeamInputs): boolean {
  const res = calcRCBeam(inp);
  if (!res.valid) return false;
  const secciones = inp.mode === 'portico' ? [res.vano, res.apoyo] : [res.vano];
  return secciones.every((s) => s && s.valid && !s.checks.some((c) => c.status === 'fail'));
}
