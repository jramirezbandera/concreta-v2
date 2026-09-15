/**
 * Asa para cambiar de sitio la fila de una tabla: se arrastra, o se mueve con
 * las flechas del teclado.
 *
 * El orden de las filas NO es decorativo. El cuadro de materiales se lee en el
 * plano y en la memoria en el mismo orden en el que está aquí, y ese orden es
 * el del proyectista —cimentación, muros, forjados—, no el del día en que se
 * añadió cada elemento. Hasta ahora la única manera de colocar un elemento en
 * su sitio era borrar las filas de debajo y volver a teclearlas.
 *
 * Tres decisiones que no son de estilo:
 *
 *   1. **Eventos de puntero, no `draggable`.** La lista de piezas del anejo
 *      (`anejo/ListaPiezas`) usa el arrastre nativo de HTML, que en una pantalla
 *      táctil no dispara NADA: el dedo hace scroll y la fila se queda quieta.
 *      Con `pointerdown`/`pointermove` valen ratón, dedo y lápiz con el mismo
 *      código, y `touch-action: none` en el asa es lo que impide que el
 *      navegador se quede el gesto.
 *   2. **La fila se recoloca mientras se arrastra**, sin fantasma ni hueco: la
 *      tabla misma es la previsualización. Por eso el asa no necesita medir
 *      nada, sólo preguntar al DOM qué fila hay bajo el puntero.
 *   3. **Las flechas mueven la fila.** Con el asa enfocada, ↑ y ↓ la suben y la
 *      bajan un puesto. Es lo único que funciona sin ratón, y de paso es lo más
 *      cómodo para el ajuste fino. Como React identifica cada fila por su `id`,
 *      el nodo del asa viaja con ella y el foco no se pierde al moverla.
 */

import { GripVertical } from 'lucide-react';
import { useRef, type KeyboardEvent, type PointerEvent } from 'react';

interface Props {
  /** Posición de la fila dentro del cuerpo de la tabla; 0 es la primera. */
  indice: number;
  /** Cuántas filas hay: acota el movimiento por teclado. */
  total: number;
  /** Nombre de la fila, para el lector de pantalla. */
  etiqueta: string;
  /** Saca la fila de `desde` y la mete en `hasta`. */
  onMover: (desde: number, hasta: number) => void;
}

/** Fondo de la fila mientras se arrastra: el ojo la sigue cuando cambia de sitio. */
const RESALTE = 'color-mix(in srgb, var(--color-accent) 14%, transparent)';

export function AsaOrden({ indice, total, etiqueta, onMover }: Props) {
  const asa = useRef<HTMLButtonElement>(null);

  function empezar(e: PointerEvent<HTMLButtonElement>) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const fila = asa.current?.closest('tr');
    const cuerpo = fila?.parentElement;
    if (!fila || !cuerpo) return;
    // Sin esto el navegador se pone a seleccionar el texto de la fila.
    e.preventDefault();
    // Y como `preventDefault` también se lleva por delante el foco que daría el
    // clic, se pone a mano: si no, pinchar el asa y seguir con las flechas —lo
    // natural después de un arrastre— no haría nada.
    e.currentTarget.focus();

    // La fila puede traer estilo propio (el fondo rojo del hueco sin resolver):
    // se guarda tal cual y se le devuelve entero al soltar.
    const estiloPrevio = fila.getAttribute('style');
    fila.style.background = RESALTE;
    document.body.style.cursor = 'grabbing';
    let actual = indice;

    const mover = (ev: globalThis.PointerEvent) => {
      // El cuerpo se vuelve a leer en cada movimiento: la tabla se ha
      // recolocado desde el anterior y los nodos de antes ya no valen.
      const filas = Array.from(cuerpo.children) as HTMLElement[];
      let destino = filas.findIndex((f) => ev.clientY < f.getBoundingClientRect().bottom);
      // Por debajo de la última fila el índice se acota al final en vez de
      // perder el arrastre: sacar el puntero de la tabla al bajar es lo normal.
      if (destino < 0) destino = filas.length - 1;
      if (destino === actual) return;
      onMover(actual, destino);
      actual = destino;
    };

    const soltar = () => {
      window.removeEventListener('pointermove', mover);
      window.removeEventListener('pointerup', soltar);
      window.removeEventListener('pointercancel', soltar);
      if (estiloPrevio === null) fila.removeAttribute('style');
      else fila.setAttribute('style', estiloPrevio);
      document.body.style.cursor = '';
    };

    // En `window` y no en el asa: el puntero se adelanta a la fila —se adelanta
    // siempre—, así que los eventos caen sobre otro elemento, pero suben hasta
    // aquí igual. Y `pointerup` acaba el arrastre se suelte donde se suelte.
    window.addEventListener('pointermove', mover);
    window.addEventListener('pointerup', soltar);
    window.addEventListener('pointercancel', soltar);
  }

  function teclas(e: KeyboardEvent<HTMLButtonElement>) {
    const paso = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
    if (paso === 0) return;
    const hasta = indice + paso;
    if (hasta < 0 || hasta >= total) return;
    // Sin esto la página entera se desplaza mientras se mueve la fila.
    e.preventDefault();
    onMover(indice, hasta);
  }

  return (
    <button
      ref={asa}
      type="button"
      onPointerDown={empezar}
      onKeyDown={teclas}
      aria-label={`Cambiar de sitio ${etiqueta}, ahora en el puesto ${indice + 1} de ${total}: arrástrelo, o muévalo con las flechas arriba y abajo`}
      title="Arrastrar para cambiar el orden (o flechas ↑ ↓)"
      style={{ touchAction: 'none' }}
      className="cursor-grab rounded p-0.5 text-text-disabled transition-colors hover:text-text-primary focus-visible:text-accent active:cursor-grabbing"
    >
      <GripVertical size={13} aria-hidden="true" />
    </button>
  );
}
