/**
 * Medida estimada de los rótulos de un lienzo SVG, para los tests.
 *
 * jsdom no implementa `getBBox`, así que no hay forma de preguntarle al DOM
 * cuánto ocupa un `<text>`. Se estima con el MISMO ancho por carácter que usan
 * los dibujos para reservar sus márgenes (`anchoEstimado` de
 * `components/canvas/primitivas`), de modo que si el dibujo se equivoca al
 * colocar un rótulo el test se equivoca igual y lo caza.
 *
 * El patrón viene de `src/test/viento-nieve/lienzo.dom.test.tsx`, que lo tenía
 * dentro; aquí sale fuera para que lo use cualquier lienzo. Ese fichero
 * conserva su copia de momento.
 */

export interface CajaRotulo {
  texto: string;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** Caja estimada de cada `<text>` del SVG, en coordenadas del viewBox. */
export function cajasTexto(svg: SVGSVGElement): CajaRotulo[] {
  return [...svg.querySelectorAll('text')].map((t) => {
    const x = Number(t.getAttribute('x'));
    const y = Number(t.getAttribute('y'));
    const tam = Number(t.getAttribute('font-size') ?? 11);
    const texto = t.textContent ?? '';
    const estilo = t.getAttribute('style') ?? '';
    const porCaracter = estilo.includes('mono') ? 0.6 : t.hasAttribute('letter-spacing') ? 0.66 : 0.52;
    const negrita = Number(t.getAttribute('font-weight') ?? 400) >= 600 ? 1.05 : 1;
    const w = texto.length * tam * porCaracter * negrita;
    const ancla = t.getAttribute('text-anchor') ?? 'start';
    const x0 = ancla === 'end' ? x - w : ancla === 'middle' ? x - w / 2 : x;
    return { texto, x0, x1: x0 + w, y0: y - tam * 0.75, y1: y + tam * 0.2 };
  });
}

/** Pares de rótulos cuyas cajas se cruzan más de 2 px en las dos direcciones. */
export function solapes(cajas: CajaRotulo[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < cajas.length; i++) {
    for (let j = i + 1; j < cajas.length; j++) {
      const a = cajas[i];
      const b = cajas[j];
      const dx = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
      const dy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
      if (dx > 2 && dy > 2) out.push(`«${a.texto}» ∩ «${b.texto}»`);
    }
  }
  return out;
}

/** Rótulos que se salen del lienzo (más de 2 px). */
export function fuera(cajas: CajaRotulo[], width: number, height: number): string[] {
  return cajas
    .filter((c) => c.x0 < -2 || c.x1 > width + 2 || c.y0 < -2 || c.y1 > height + 2)
    .map((c) => `«${c.texto}» [${c.x0.toFixed(0)}…${c.x1.toFixed(0)} × ${c.y0.toFixed(0)}…${c.y1.toFixed(0)}]`);
}
