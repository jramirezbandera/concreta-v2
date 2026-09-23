import { useCallback, useEffect } from 'react';
import { useAsistente } from './asistente-context';

/**
 * Lo que un módulo necesita del asistente. Sustituye al viejo
 * `const [aiOpen, setAiOpen] = useState(false)` que tenían los 25 módulos.
 *
 * Al montarse DECLARA que en esta pantalla hay asistente, y al desmontarse lo
 * retira. Ese registro es la ÚNICA fuente de «aquí hay asistente», y de él
 * salen tres cosas: que haya píldora (sólo la hay donde hay asistente), que la
 * fila del Menú salga viva o apagada con su razón (D-I7) y que la tecla «A»
 * responda (D-I15). Las cuatro pantallas sin asistente —anejo, ficha DB SE,
 * panel de obra y Mi estudio— simplemente no llaman a este hook: el `cleanup`
 * del módulo anterior corre ANTES del efecto del siguiente, así que el registro
 * queda limpio sin que ellas tengan que declarar nada.
 *
 * Que sea una sola fuente no es cosmético: mientras «hay asistente» viajó
 * ADEMÁS como prop hasta la Topbar, mover el botón de sitio bastó para dejar el
 * atajo colgando sin un solo error. La prop murió en T2.
 */
export function useAsistenteDeModulo(): {
  /** El chat está montado: el módulo debe renderizarlo. */
  sesion: boolean;
  /** `key` del chat: cambia al reiniciar para remontarlo con el hilo a cero. */
  claveSesion: number;
  /**
   * Abre el asistente desde DENTRO del módulo —hoy sólo las portadas de FEM,
   * con su «empezar con el asistente»—. El Menú, la píldora y el atajo no pasan
   * por aquí: van directos al provider, que es quien los tiene.
   */
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
