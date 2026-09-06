/**
 * El `id` DOM de un campo de la ficha: la ruta del campo con los puntos
 * cambiados por guiones (`campo-obra-geotecnia-empresa`). Es lo que
 * «Siguiente hueco» busca para llevar el foco, y lo que el test de módulo usa
 * para encontrar un control concreto.
 */
export const idDom = (id: string) => `campo-${id.replace(/\./g, '-')}`;
