/**
 * Hueco provisional del lienzo para las vistas cuyo dibujo llega en la fase
 * siguiente de la rama `viento-nieve-lienzo`. Se retira cuando existan
 * `CubiertaSVG`, `FachadasSVG` y `NieveSVG`.
 */

export function LienzoPendiente({ titulo }: { titulo: string }) {
  return (
    <div className="flex h-full items-center justify-center px-6 text-center text-[12px] text-text-disabled">
      {titulo}: el dibujo de esta vista llega en la siguiente fase. Los números están en la columna de la derecha.
    </div>
  );
}
