/**
 * Los cuadros de plano de varios módulos en UN dibujo, en columnas.
 *
 * El planificador de `cuadro.ts` compone los cuadros de UN módulo apilándolos
 * hacia abajo, que es lo que quiere una hoja. Puestos los cuatro módulos
 * seguidos, el dibujo salía de medio metro de alto a tamaño de papel: más que
 * el margen de un A1, y con el usuario haciendo cuatro copiar-pegar de todos
 * modos. Aquí cada módulo va en su columna, alineadas arriba y con su rótulo,
 * que es como se colocan los cuadros en el margen de un plano.
 *
 * No se reimplanta nada del planificador: cada columna se planifica con
 * `planificarDibujo` —las mismas medidas, los mismos anchos, las mismas
 * capas— y lo único que se hace aquí es TRASLADAR sus entidades y ponerles un
 * rótulo encima. Un cuadro sacado desde su módulo y el mismo cuadro dentro del
 * conjunto son, entidad a entidad, el mismo dibujo movido.
 *
 * Las capas siguen siendo las tres de siempre (`CUADRO-TITULO`, `CUADRO-TEXTO`,
 * `CUADRO-LINEAS`): son las que el plano del estudio ya tiene definidas, y una
 * capa por módulo obligaría a darlas de alta en cada plantilla.
 */

import type { Block } from '../memoria/model';
import { planificarDibujo, type Dibujo, type Entidad, type OpcionesDxf } from './cuadro';

export interface CuadroConjunto {
  /** El rótulo de la columna: se dibuja en mayúsculas sobre el cuadro. */
  etiqueta: string;
  blocks: Block[];
}

// ── Proporciones, todas relativas a la altura del texto ─────────────────────

/**
 * El rótulo de la columna, en alturas de texto. Va por encima de la del cuadro
 * —que dibuja sus propios rótulos a 1— porque nombra el módulo entero: sin esa
 * diferencia, «CUADRO DE MATERIALES» y «HORMIGONES» pesaban lo mismo y no se
 * veía dónde acababa un módulo y empezaba el siguiente.
 */
const ALTURA_ROTULO = 1.5;
/** Aire entre el rótulo y su filete, y entre el filete y el cuadro. */
const TRAS_ROTULO = 0.7;
const TRAS_FILETE = 1.6;
/**
 * Calle entre una columna y la siguiente. Generosa a propósito: es por donde
 * se corta al llevar los cuadros al plano, y con la separación de dentro del
 * cuadro (2,2) los dos módulos parecían uno solo con más tablas.
 */
const CALLE = 8;
/** Ancho mínimo de una columna sin tablas, para que su filete no salga de cero. */
const ANCHO_MINIMO = 40;

/** Traslada una entidad sin tocar nada más: mismo tipo, misma capa, misma altura. */
function trasladar(e: Entidad, dx: number, dy: number): Entidad {
  return e.tipo === 'linea'
    ? { ...e, x1: e.x1 + dx, y1: e.y1 + dy, x2: e.x2 + dx, y2: e.y2 + dy }
    : { ...e, x: e.x + dx, y: e.y + dy };
}

/**
 * Los cuadros en columnas, de izquierda a derecha y alineados arriba. Un
 * cuadro sin bloques no ocupa columna: no se dibuja un rótulo con nada debajo.
 */
export function planificarConjunto(cuadros: CuadroConjunto[], opciones: OpcionesDxf = {}): Dibujo {
  const h = opciones.altura ?? 0.0025;
  const conCuadro = cuadros.filter((c) => c.blocks.length > 0);

  // Con un solo módulo esto ES el dibujo del módulo: ni rótulo de columna ni
  // calle. Poner la cabecera igualmente añadiría al fichero un título que el
  // mismo cuadro sacado desde su módulo no lleva.
  if (conCuadro.length <= 1) {
    return planificarDibujo(conCuadro[0]?.blocks ?? [], opciones);
  }

  const entidades: Entidad[] = [];
  let x = 0;
  let alto = 0;

  for (const c of conCuadro) {
    const d = planificarDibujo(c.blocks, { altura: h });
    const ancho = d.ancho > 0 ? d.ancho : ANCHO_MINIMO * h;
    const alturaRotulo = ALTURA_ROTULO * h;
    const yFilete = -(alturaRotulo + TRAS_ROTULO * h);
    const desplazamiento = -yFilete + TRAS_FILETE * h;

    entidades.push({
      tipo: 'texto',
      capa: 'CUADRO-TITULO',
      x,
      y: -alturaRotulo,
      altura: alturaRotulo,
      texto: c.etiqueta.toUpperCase(),
      centrado: false,
    });
    entidades.push({ tipo: 'linea', capa: 'CUADRO-LINEAS', x1: x, y1: yFilete, x2: x + ancho, y2: yFilete });
    for (const e of d.entidades) entidades.push(trasladar(e, x, -desplazamiento));

    alto = Math.max(alto, desplazamiento + d.alto);
    x += ancho + CALLE * h;
  }

  return { entidades, ancho: x - CALLE * h, alto };
}
