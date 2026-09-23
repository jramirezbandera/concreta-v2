// Provider del asistente IA — se monta UNA vez en el shell, junto al de la
// calculadora (rediseño 2026-09-22, T3).
//
// Es dueño de tres cosas y de nada más: si hay sesión (el chat montado, o sea
// la conversación viva), si está minimizada, y el estado que pinta la píldora.
// El adapter y los datos del cálculo siguen siendo del módulo, que es quien los
// tiene vivos; el chat se los pasa hacia arriba sólo como estado.
//
// Aquí vive también la píldora, por las mismas razones por las que el lanzador
// de la calculadora vive en su provider: tiene que sobrevivir a que el chat no
// esté montado.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { showToast } from '../ui/Toast';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { escribirClave, leerClave } from '../../lib/storage/seguro';
import { AiPill } from './AiPill';
import {
  AsistenteContext,
  type AsistenteContextValue,
  type EstadoAsistente,
  type OrigenApertura,
} from './asistente-context';

/**
 * D-I16 / D-I20: la píldora aparece desde 768 px, con umbral PROPIO. No usa
 * `useIsMobile` (1023 px) a propósito: ese umbral trata como «móvil» una
 * ventana a media pantalla junto al PDF de la norma, que es el uso más
 * frecuente de la app y justo donde el asistente hace más falta. Y el mismo
 * número gobierna la forma de la ventana: donde hay píldora, flotante; por
 * debajo, hoja inferior.
 */
const CONSULTA_FLOTANTE = '(min-width: 768px)';

/** Que el asistente se reinicia en cada módulo se cuenta UNA vez, no cada vez. */
const CLAVE_AVISO_MODULO = 'concreta-ai-aviso-modulo';

interface AsistenteProviderProps {
  children: ReactNode;
}

export function AsistenteProvider({ children }: AsistenteProviderProps) {
  const [disponible, setDisponible] = useState(false);
  const [sesion, setSesion] = useState(false);
  const [minimizado, setMinimizado] = useState(false);
  const [publicado, setPublicado] = useState<{ estado: EstadoAsistente; turnos: number }>({
    estado: 'reposo',
    turnos: 0,
  });
  const [claveSesion, setClaveSesion] = useState(0);
  const [desdeLaEsquina, setDesdeLaEsquina] = useState(false);
  const flotante = useMediaQuery(CONSULTA_FLOTANTE);

  // Espejo del estado vivo para poder leerlo desde callbacks estables (el
  // `cleanup` del módulo que se va). Se sincroniza en un efecto y NUNCA en
  // render: el compilador de React puede congelar una lectura hecha en render.
  const vivo = useRef({ sesion, estado: publicado.estado });
  useEffect(() => {
    vivo.current = { sesion, estado: publicado.estado };
  });

  /**
   * D-I8 — al cambiar de módulo la conversación muere. Es lo correcto (el
   * asistente construye su contexto con los datos de ESE módulo: arrastrar un
   * hilo de vigas a viento le daría un contexto que ya no corresponde), pero
   * hasta ahora pasaba MUDO, y una píldora permanente promete continuidad con
   * su sola presencia. Así que se dice.
   */
  const avisarDelReinicio = useCallback(() => {
    if (!vivo.current.sesion) return;
    if (vivo.current.estado === 'cargando') {
      // Este sí se cuenta siempre: se está perdiendo una respuesta concreta.
      showToast(
        'La pregunta que tenías en vuelo se ha cancelado: el asistente empieza de cero en cada módulo.',
        { autoDismiss: 7000 },
      );
      return;
    }
    if (leerClave(CLAVE_AVISO_MODULO) !== null) return;
    escribirClave(CLAVE_AVISO_MODULO, '1');
    showToast('El asistente empieza de cero en cada módulo.', { autoDismiss: 6000 });
  }, []);

  const registrarModulo = useCallback(
    (hayAsistente: boolean) => {
      setDisponible(hayAsistente);
      if (hayAsistente) return;
      // Se va el módulo: muere la conversación y la píldora vuelve a reposo.
      avisarDelReinicio();
      setSesion(false);
      setMinimizado(false);
      setPublicado({ estado: 'reposo', turnos: 0 });
    },
    [avisarDelReinicio],
  );

  const abrir = useCallback((origen: OrigenApertura) => {
    setDesdeLaEsquina(origen === 'pildora');
    setSesion(true);
    setMinimizado(false);
  }, []);

  const minimizar = useCallback(() => setMinimizado(true), []);

  const reiniciar = useCallback(() => {
    // La `key` del chat cambia ⇒ React lo remonta con el hilo a cero. No se
    // toca `sesion`: reiniciar no es salir.
    setClaveSesion((n) => n + 1);
    setPublicado({ estado: 'reposo', turnos: 0 });
    setMinimizado(false);
  }, []);

  const publicar = useCallback((estado: EstadoAsistente, turnos: number) => {
    setPublicado((prev) => (prev.estado === estado && prev.turnos === turnos ? prev : { estado, turnos }));
  }, []);

  /**
   * La píldora se ve cuando la ventana NO se ve: o está el asistente en
   * pantalla, o está su píldora. Nunca las dos (la ventana flotante nace justo
   * encima de ella) ni ninguna.
   */
  const hayPildora = disponible && flotante && (!sesion || minimizado);

  const ctx: AsistenteContextValue = {
    disponible,
    sesion,
    minimizado,
    estado: publicado.estado,
    turnos: publicado.turnos,
    claveSesion,
    desdeLaEsquina,
    flotante,
    abrir,
    minimizar,
    reiniciar,
    registrarModulo,
    publicar,
  };

  return (
    <AsistenteContext.Provider value={ctx}>
      {children}
      {hayPildora && (
        <AiPill
          estado={publicado.estado}
          turnos={publicado.turnos}
          onClick={() => (sesion ? setMinimizado(false) : abrir('pildora'))}
        />
      )}
    </AsistenteContext.Provider>
  );
}
