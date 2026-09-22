/**
 * Entidades nuevas para un DXF moderno: el dibujo que se AÑADE a un plano tipo
 * del estudio.
 *
 * `plantilla.ts` sabe leer un plano del estudio y reescribir sus textos, y para
 * lo poco que hacía falta añadir —una nota al pie, la segunda línea de una
 * celda— le bastaba con `entidadTexto` y `clonTexto`. El cuadro de vigas ya no
 * rellena: dibuja. Tantas secciones como vigas tenga la obra, cada una con su
 * contorno, su cerco, sus barras, sus líneas de referencia y sus dos cotas. De
 * ahí este fichero: los emisores de las entidades que ese dibujo necesita.
 *
 * **Por qué no vale `escribir.ts`.** Ese escribe un R12 entero desde cero, con
 * su cabecera y sus tablas, y es lo que quiere un cuadro que se entrega solo.
 * Aquí las entidades se meten DENTRO de un fichero que ya existe y que trae sus
 * propias capas, sus estilos de texto y su bloque de marca de cota: hay que
 * hablar su idioma, que es el de un AC1032 con manejadores.
 *
 * **Las tres reglas de un AC1032, que un R12 no tiene:**
 *
 *  1. **Manejador** (grupo 5): un hexadecimal único en todo el fichero. Dos
 *     entidades con el mismo y AutoCAD se niega a abrirlo.
 *  2. **Dueño** (grupo 330): el registro de bloque del espacio modelo. Se toma
 *     del que ya traiga cualquier entidad de la plantilla, no se inventa.
 *  3. **Marcas de subclase** (grupo 100): `AcDbEntity` antes de la capa y la
 *     marca de la clase concreta antes de su geometría. Sin ellas hay
 *     programas que se saltan la entidad sin decir nada.
 *
 * **El color va en la entidad, no en la capa.** Las cotas del plano del estudio
 * llevan la línea de cota en cian, las de referencia en gris y la cifra en
 * amarillo, las tres en la capa `CV-COTAS`, que es gris. Son forzados de color
 * (grupo 62) y hay que reproducirlos: dibujar «por capa» daría una cota gris
 * entera, que no es la suya.
 */

import { lineasDeParrafo, par } from './plantilla';

/** Lo común a toda entidad: dónde vive y de qué color se pinta. */
export interface Comun {
  capa: string;
  /** Forzado de color (grupo 62). Sin él, el color de la capa. */
  color?: number;
}

/**
 * Un vértice de polilínea. `bulge` es la curvatura del tramo que EMPIEZA en él:
 * 0 recto, tan(a/4) para un arco de a grados, positivo en sentido antihorario.
 * Un arco de 90 grados es 0,414214 y uno de 180 es 1.
 */
export interface Vertice {
  x: number;
  y: number;
  bulge?: number;
}

/** tan(90/4): el bulge de un cuarto de círculo, que es como se redondea un cerco. */
export const BULGE_90 = Math.tan(Math.PI / 8);
/** Media vuelta: el bulge del gancho de una rama. */
export const BULGE_180 = 1;

/**
 * Dónde se agarra un MTEXT a su punto de inserción (grupo 71). Los nombres son
 * los de AutoCAD; se usan los cinco que hacen falta.
 */
export const ANCLAJE = {
  arribaIzquierda: 1,
  arribaCentro: 2,
  centro: 5,
  abajoIzquierda: 7,
  abajoDerecha: 9,
} as const;

export type Anclaje = (typeof ANCLAJE)[keyof typeof ANCLAJE];

export type Entidad =
  | ({ tipo: 'linea'; x1: number; y1: number; x2: number; y2: number } & Comun)
  | ({ tipo: 'polilinea'; puntos: Vertice[]; cerrada?: boolean } & Comun)
  | ({ tipo: 'circulo'; x: number; y: number; r: number } & Comun)
  | ({
      tipo: 'texto';
      x: number;
      y: number;
      altura: number;
      texto: string;
      estilo: string;
      anclaje: Anclaje;
      /** Escrito de abajo arriba, como la cifra del canto de una sección. */
      vertical?: boolean;
    } & Comun)
  | ({
      tipo: 'bloque';
      nombre: string;
      x: number;
      y: number;
      escala: number;
      /** Grados. */
      rotacion: number;
    } & Comun);

const r6 = (v: number) => v.toFixed(6);

/**
 * El texto de un MTEXT, escapado.
 *
 * Un MTEXT no guarda texto plano: la llave abre un grupo de formato, la barra
 * introduce un código y el punto y coma lo cierra. El rótulo de una viga lo
 * teclea el usuario, y un nombre como «V-3 {planta 1}» dejaría el dibujo con
 * media palabra invisible y el resto en otro color. Los tres caracteres se
 * escapan con barra delante, que es como lo hace el propio AutoCAD.
 *
 * El «%%C» de la Ø NO se toca: es un código de la fuente, no del formato, y el
 * plano del estudio lo usa así en todas sus celdas.
 */
export function textoMtext(texto: string): string {
  return texto.replace(/([\\{}])/g, '\\$1');
}

/**
 * Las líneas de una entidad, listas para insertarse en la sección ENTITIES.
 *
 * `manejador` lo sirve quien llama, normalmente un contador que arranca en
 * `primerManejadorLibre`; `dueno` es el grupo 330 de cualquier entidad de la
 * plantilla.
 */
export function lineasDeEntidad(e: Entidad, manejador: string, dueno: string): string[] {
  const l: string[] = [];
  const cabecera = (tipo: string, subclase: string) => {
    par(l, 0, tipo);
    par(l, 5, manejador);
    if (dueno) par(l, 330, dueno);
    par(l, 100, 'AcDbEntity');
    par(l, 8, e.capa);
    if (e.color !== undefined) par(l, 62, e.color);
    par(l, 100, subclase);
  };

  switch (e.tipo) {
    case 'linea':
      cabecera('LINE', 'AcDbLine');
      par(l, 10, r6(e.x1));
      par(l, 20, r6(e.y1));
      par(l, 30, '0.0');
      par(l, 11, r6(e.x2));
      par(l, 21, r6(e.y2));
      par(l, 31, '0.0');
      break;

    case 'polilinea':
      cabecera('LWPOLYLINE', 'AcDbPolyline');
      par(l, 90, e.puntos.length);
      par(l, 70, e.cerrada ? 1 : 0);
      par(l, 43, '0.0');
      for (const p of e.puntos) {
        par(l, 10, r6(p.x));
        par(l, 20, r6(p.y));
        // El 42 va DETRÁS de su vértice y solo si curva: un 42 a cero en cada
        // vértice es legal pero engorda el fichero sin decir nada.
        if (p.bulge) par(l, 42, r6(p.bulge));
      }
      break;

    case 'circulo':
      cabecera('CIRCLE', 'AcDbCircle');
      par(l, 10, r6(e.x));
      par(l, 20, r6(e.y));
      par(l, 30, '0.0');
      par(l, 40, r6(e.r));
      break;

    case 'texto': {
      cabecera('MTEXT', 'AcDbMText');
      par(l, 10, r6(e.x));
      par(l, 20, r6(e.y));
      par(l, 30, '0.0');
      par(l, 40, r6(e.altura));
      // Ancho de referencia 0: el MTEXT no envuelve solo. Lo que se escribe
      // aquí son rótulos de una o dos líneas cuyos saltos se deciden fuera; un
      // ancho de caja los partiría por donde no toca.
      par(l, 41, '0.0');
      par(l, 71, e.anclaje);
      par(l, 72, 5); // por estilo
      for (const linea of lineasDeParrafo(e.texto)) l.push(linea);
      par(l, 7, e.estilo);
      par(l, 73, 1);
      par(l, 44, '1.0');
      // El vector de dirección del texto. El plano del estudio gira así la
      // cifra del canto de sus secciones, y no con el grupo 50: un MTEXT no
      // tiene rotación, tiene eje.
      par(l, 11, r6(e.vertical ? 0 : 1));
      par(l, 21, r6(e.vertical ? 1 : 0));
      par(l, 31, '0.0');
      break;
    }

    case 'bloque':
      cabecera('INSERT', 'AcDbBlockReference');
      par(l, 2, e.nombre);
      par(l, 10, r6(e.x));
      par(l, 20, r6(e.y));
      par(l, 30, '0.0');
      par(l, 41, r6(e.escala));
      par(l, 42, r6(e.escala));
      par(l, 43, r6(e.escala));
      par(l, 50, r6(e.rotacion));
      break;
  }
  return l;
}
