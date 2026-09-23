import { useCallback, useEffect } from 'react';
import { useAsistente } from './asistente-context';

/**
 * Lo que un módulo necesita del asistente. Sustituye al viejo
 * `const [aiOpen, setAiOpen] = useState(false)` que tenían los 25 módulos.
 *
 * Al montarse DECLARA que en esta pantalla hay asistente, y al desmontarse lo
 * retira. De ese registro salen dos cosas: que haya píldora (sólo la hay donde
 * hay asistente) y que la fila del Menú salga viva o apagada con su razón
 * (D-I7). Las cuatro pantallas sin asistente —anejo, ficha DB SE, panel de obra
 * y Mi estudio— simplemente no llaman a este hook: el `cleanup` del módulo
 * anterior corre ANTES del efecto del siguiente, así que el registro queda
 * limpio sin que ellas tengan que declarar nada.
 */
export function useAsistenteDeModulo(): {
  /** El chat está montado: el módulo debe renderizarlo. */
  sesion: boolean;
  /** `key` del chat: cambia al reiniciar para remontarlo con el hilo a cero. */
  claveSesion: number;
  /** Para el `onOpenAssistant` de la Topbar (abre desde el Menú o el atajo). */
  abrir: () => void;
} {
  const { registrarModulo, sesion, claveSesion, abrir } = useAsistente();

  useEffect(() => {
    registrarModulo(true);
    return () => registrarModulo(false);
  }, [registrarModulo]);

  return {
    sesion,
    claveSesion,
    abrir: useCallback(() => abrir('menu'), [abrir]),
  };
}
