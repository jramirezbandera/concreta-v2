/**
 * El comodín de rutas: adonde cae una URL desconocida.
 *
 * Existe como componente porque `rutaDeEntrada()` tiene que evaluarse AL
 * PINTAR, no al construir el router. `createBrowserRouter` se llama una vez al
 * cargar `App.tsx`; un `<Navigate to={rutaDeEntrada()} />` escrito ahí dentro
 * miraba si había obra en ese instante y se quedaba con la respuesta para
 * siempre: quien arrancaba sin obra, la creaba desde «Datos de la obra…» (que
 * no recarga) y tecleaba una URL mala, seguía cayendo en el cuadro de
 * materiales en vez de en su obra.
 */

import { Navigate } from 'react-router';
import { rutaDeEntrada } from '../../lib/obra/entrada';

export function Entrada() {
  return <Navigate to={rutaDeEntrada()} replace />;
}
