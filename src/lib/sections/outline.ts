// Contorno REAL de la sección para dibujarla — módulo puro, sin React.
//
// Por qué existe: el perímetro de un perfil estaba escrito DOS veces y mal las
// dos. `SteelBeamsSVG` componía la sección con las primitivas del adaptador
// (rectángulos sueltos), así que un tubo salía con las esquinas en pico;
// `SteelColumnsSVG` tenía su propio juego de componentes y sí redondeaba el
// tubo. Y ninguna de las dos dibujaba los ACUERDOS del perfil en I: un IPE se
// pintaba como tres rectángulos pegados, que es la silueta de un perfil
// soldado, no la de uno laminado.
//
// `getPrimitives()` NO se toca: sigue siendo lo que era —bloques y bbox— y lo
// usan el cajón de 2UPN y el encuadre del panel. Esto es el CONTORNO, que es
// otra cosa: un perímetro cerrado con arcos, en mm y con origen en el
// centroide, que cada renderizador mapea a sus píxeles.
//
// Convenio de coordenadas, el mismo que `CrossSectionPrimitives`: mm, origen
// en el centroide, +x a la derecha, +y HACIA ABAJO (coordenadas de pantalla).
// De ahí que los arcos cóncavos lleven sweep 0 y los convexos sweep 1
// recorriendo el contorno en sentido horario.

import type { SectionGeometry, SectionKind } from './types';

/** Un tramo del contorno: recta hasta `to`, o arco de radio `r` hasta `to`. */
export type OutlineSegment =
  | { to: readonly [number, number] }
  | { to: readonly [number, number]; r: number; sweep: 0 | 1 };

export interface OutlineContour {
  start: readonly [number, number];
  segments: OutlineSegment[];
}

export interface SectionOutline {
  /** Contornos cerrados en mm. Más de uno ⇒ hace falta `fillRule`. */
  contours: OutlineContour[];
  /** 'evenodd' cuando un contorno interior tiene que perforar al exterior. */
  fillRule?: 'evenodd';
}

/** Lo que hace falta para dibujar: `SectionGeometry` lo cumple, y también el
 *  registro de catálogo `SteelProfile` acompañado de su `kind`. */
export interface OutlineGeometry {
  kind: SectionKind;
  h: number;
  b: number;
  tf: number;
  tw: number;
  r: number;
}

const line = (x: number, y: number): OutlineSegment => ({ to: [x, y] });
const arc = (x: number, y: number, r: number, sweep: 0 | 1): OutlineSegment =>
  ({ to: [x, y], r, sweep });

/**
 * Perfil en I / H laminado con sus acuerdos alma-ala.
 *
 * Se recorre en sentido horario desde la esquina superior izquierda. Los
 * cuatro acuerdos son CÓNCAVOS (el material está fuera del arco), y en el
 * convenio +y hacia abajo eso son arcos con sweep 0.
 *
 * Las puntas del ala se dejan en pico: el catálogo solo publica el radio de
 * acuerdo `r`, no el redondeo del borde del ala, y la conicidad del IPN
 * tampoco está en el modelo (todo el motor lo trata como ala rectangular).
 */
function iOutline(g: OutlineGeometry): SectionOutline {
  const hx = g.b / 2;
  const hy = g.h / 2;
  const tw2 = g.tw / 2;
  // El acuerdo no puede comerse ni el vuelo del ala ni el medio canto del
  // alma: un dato corrupto (URL manipulada, catálogo futuro) dibujaría un
  // contorno cruzado en vez de una sección.
  const r = Math.max(0, Math.min(g.r, hx - tw2, hy - g.tf));

  // Cara interior del ala y cara del alma, por cuadrante.
  //   sx: +1 derecha, −1 izquierda   ·   sy: +1 ala inferior, −1 ala superior
  const yFace = (sy: 1 | -1) => sy * (hy - g.tf);
  const xFace = (sx: 1 | -1) => sx * tw2;

  /** Acuerdo entrando POR EL ALA: recta hasta la tangente y giro hacia el alma. */
  const filletToWeb = (sx: 1 | -1, sy: 1 | -1): OutlineSegment[] =>
    r === 0
      ? [line(xFace(sx), yFace(sy))]        // sin radio: vértice en pico
      : [line(xFace(sx) + sx * r, yFace(sy)), arc(xFace(sx), yFace(sy) - sy * r, r, 0)];

  /** Acuerdo saliendo POR EL ALMA: la recta del alma ya dejó el trazo en la
   *  tangente, así que solo queda el giro (o nada, si no hay radio). */
  const filletToFlange = (sx: 1 | -1, sy: 1 | -1): OutlineSegment[] =>
    r === 0 ? [] : [arc(xFace(sx) + sx * r, yFace(sy), r, 0)];

  const segments: OutlineSegment[] = [
    line(hx, -hy),                    // ala superior, cara exterior
    line(hx, -hy + g.tf),             // canto del ala superior
    ...filletToWeb(1, -1),            // acuerdo superior derecho
    line(tw2, hy - g.tf - r),         // alma, cara derecha
    ...filletToFlange(1, 1),          // acuerdo inferior derecho
    line(hx, hy - g.tf),              // cara superior del ala inferior
    line(hx, hy),                     // canto del ala inferior
    line(-hx, hy),                    // ala inferior, cara exterior
    line(-hx, hy - g.tf),             // canto del ala inferior, lado izquierdo
    ...filletToWeb(-1, 1),            // acuerdo inferior izquierdo
    line(-tw2, -hy + g.tf + r),       // alma, cara izquierda
    ...filletToFlange(-1, -1),        // acuerdo superior izquierdo
    line(-hx, -hy + g.tf),            // cara inferior del ala superior, izquierda
  ];

  return { contours: [{ start: [-hx, -hy], segments }] };
}

/** Rectángulo de esquinas redondeadas, horario desde el inicio del lado superior. */
function roundedRect(w: number, h: number, rad: number): OutlineContour {
  const hx = w / 2;
  const hy = h / 2;
  const r = Math.max(0, Math.min(rad, hx, hy));
  if (r === 0) {
    return {
      start: [-hx, -hy],
      segments: [line(hx, -hy), line(hx, hy), line(-hx, hy), line(-hx, -hy)],
    };
  }
  return {
    start: [-hx + r, -hy],
    segments: [
      line(hx - r, -hy),
      arc(hx, -hy + r, r, 1),
      line(hx, hy - r),
      arc(hx - r, hy, r, 1),
      line(-hx + r, hy),
      arc(-hx, hy - r, r, 1),
      line(-hx, -hy + r),
      arc(-hx + r, -hy, r, 1),
    ],
  };
}

/**
 * Tubo rectangular o cuadrado: pared entre dos rectángulos redondeados.
 *
 * `r` del adaptador es el radio EXTERIOR de esquina (1.5t en acabado en
 * caliente, 2-3t en conformado en frío); el interior es r − t, que es
 * exactamente la geometría con la que el adaptador calcula A, I y W. El
 * agujero se hace con `evenodd`, no pintando encima.
 */
function rhsOutline(g: OutlineGeometry): SectionOutline {
  const t = g.tf;   // tf = tw = t en un tubo
  return {
    contours: [
      roundedRect(g.b, g.h, g.r),
      roundedRect(g.b - 2 * t, g.h - 2 * t, g.r - t),
    ],
    fillRule: 'evenodd',
  };
}

/**
 * Contorno dibujable, o `null` cuando esta familia no tiene uno y el llamante
 * debe seguir con su dibujo de siempre.
 *
 * `null` en CHS (una corona de dos circunferencias ya se dibuja bien en los
 * dos módulos y no gana nada pasando por aquí) y en 2UPN (dos perfiles en U
 * enfrentados, con sus cordones de soldadura; el adaptador además fija r = 0,
 * así que no hay acuerdos que añadir).
 */
export function sectionOutline(g: OutlineGeometry | SectionGeometry): SectionOutline | null {
  if (!(g.h > 0) || !(g.b > 0)) return null;
  switch (g.kind) {
    case 'I':   return iOutline(g);
    case 'RHS': return g.tf > 0 ? rhsOutline(g) : null;
    default:    return null;
  }
}

/** Redondeo a 3 decimales — evita `d` con 17 cifras por coordenada. */
const n = (v: number): number => Math.round(v * 1000) / 1000;

/**
 * Compone el atributo `d` mapeando mm → píxeles del panel. El llamante pasa
 * su propia proyección, que es lo que le permite conservar su encuadre, sus
 * cotas y su escala: aquí solo vive la FORMA.
 *
 * @param X escala y traslada una coordenada x en mm
 * @param Y ídem para y
 * @param L escala una LONGITUD en mm (radios) — sin traslación
 */
export function outlinePathD(
  outline: SectionOutline,
  X: (mm: number) => number,
  Y: (mm: number) => number,
  L: (mm: number) => number,
): string {
  return outline.contours
    .map(({ start, segments }) => {
      const parts = [`M ${n(X(start[0]))},${n(Y(start[1]))}`];
      for (const seg of segments) {
        const [x, y] = seg.to;
        if ('r' in seg && seg.r > 0) {
          const rp = n(L(seg.r));
          // large-arc-flag siempre 0: ningún tramo pasa de 90°.
          parts.push(`A ${rp},${rp} 0 0 ${seg.sweep} ${n(X(x))},${n(Y(y))}`);
        } else {
          parts.push(`L ${n(X(x))},${n(Y(y))}`);
        }
      }
      parts.push('Z');
      return parts.join(' ');
    })
    .join(' ');
}
