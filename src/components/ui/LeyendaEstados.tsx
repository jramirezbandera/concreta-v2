/**
 * La leyenda de los cuatro estados de un valor del capítulo Memorias, al pie
 * de la página: azul derivado, ámbar por confirmar o revisar, rojo hueco, y el
 * normal de lo confirmado. Materiales y Cargas por planta llevan la suya
 * escrita a mano con tres colores; la ficha DB SE estrena ésta con los cuatro.
 */

const CUADRO = 'inline-block h-2.5 w-2.5 rounded-[2px]';

export function LeyendaEstados() {
  return (
    <p className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 pb-2 text-[11px] text-text-disabled">
      <span className="flex items-center gap-1.5">
        <i className={CUADRO} style={{ background: 'var(--color-accent)' }} aria-hidden="true" />
        derivado: lo pone la norma o una publicación
      </span>
      <span className="flex items-center gap-1.5">
        <i className={CUADRO} style={{ background: 'var(--color-state-warn)' }} aria-hidden="true" />
        por confirmar o por revisar, bloquea exportar
      </span>
      <span className="flex items-center gap-1.5">
        <i className={CUADRO} style={{ background: 'var(--color-state-fail)' }} aria-hidden="true" />
        hueco sin resolver, bloquea exportar
      </span>
      <span className="flex items-center gap-1.5">
        <i className={`${CUADRO} border border-border-main`} aria-hidden="true" />
        confirmado en esta obra
      </span>
    </p>
  );
}
