// Avisa antes de abandonar una pregunta en vuelo (T10 / D-I8).
//
// La conversación es de cada módulo, y eso está bien: el asistente construye su
// contexto con los datos de ESE módulo, así que arrastrar un hilo de vigas a
// viento le daría un contexto que ya no corresponde. Lo que no estaba bien era
// hacerlo callando. Cambiar de pantalla desmonta el chat, y su `cleanup` aborta
// el `fetch` en marcha: la pregunta moría sin que nadie dijera nada, y el
// usuario sólo veía que el asistente había dejado de pensar.
//
// Con hilo pero sin petición en vuelo basta con decirlo DESPUÉS, y una sola vez
// por usuario (lo hace el provider). Con una petición en vuelo no: ahí se está
// tirando algo que el usuario está esperando en ese momento, así que se le
// pregunta ANTES y decide él.
//
// Vive aparte del provider porque `useBlocker` EXIGE un data router y el
// provider se monta también suelto (en tests, y en cualquier montaje futuro
// fuera del shell). Por eso el provider lo enciende con `avisarAlSalir`, que
// viene encendido: apagarlo es lo excepcional.
import { useCallback } from 'react';
import { useBlocker } from 'react-router';
import { Sparkles } from 'lucide-react';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { useAsistente } from './asistente-context';

export function AvisoDeSalida() {
  const { estado, salidaYaAvisada } = useAsistente();
  const enVuelo = estado === 'cargando';

  /*
    Sólo se interpone cuando hay algo que perder Y se cambia de pantalla. Se
    compara el `pathname` y no la location entera a propósito: cambiar de
    parámetros de búsqueda o de hash no desmonta el módulo, así que ahí no se
    pierde ninguna petición y frenar al usuario sería impertinente.
  */
  const bloqueo = useBlocker(
    useCallback(
      ({ currentLocation, nextLocation }: { currentLocation: { pathname: string }; nextLocation: { pathname: string } }) =>
        enVuelo && currentLocation.pathname !== nextLocation.pathname,
      [enVuelo],
    ),
  );

  if (bloqueo.state !== 'blocked') return null;

  return (
    <ConfirmDialog
      title="El asistente está pensando"
      icon={Sparkles}
      confirmLabel="Salir igualmente"
      cancelLabel="Esperar aquí"
      /*
        `salidaYaAvisada()` antes de seguir: el provider tiene un aviso para
        cuando la petición se pierde, y repetirlo después de haberlo preguntado
        a la cara sería decirle dos veces lo mismo a quien acaba de contestar.
      */
      onConfirm={() => {
        salidaYaAvisada();
        bloqueo.proceed();
      }}
      onCancel={() => bloqueo.reset()}
    >
      Si cambias de pantalla ahora, la pregunta que está en marcha se cancela y la
      conversación empieza de cero. El asistente trabaja con los datos de cada
      módulo, así que no puede llevarse el hilo a otro.
    </ConfirmDialog>
  );
}
