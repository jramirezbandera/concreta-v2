/**
 * Smoke de integración del módulo de sismo en jsdom.
 *
 * Lo que se prueba aquí y no se puede probar en los tests puros: que el
 * cableado entre estado, motor y pantalla existe de verdad. Los tres fallos que
 * busca son de los que no lanzan ninguna excepción:
 *
 *   1. que el veredicto de aplicabilidad NO aparezca, y el usuario lea un
 *      cortante basal calculado sobre un edificio que no cumple el art. 3.5.1;
 *   2. que una declaración sin contestar se dé por buena y el módulo calcule
 *      igual, produciendo un proyecto sin justificación sísmica;
 *   3. que el buscador diga "no figura en el Anejo 1" —que significa "la Norma
 *      no te obliga"— por un fallo de indexado.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { UnitSystemProvider } from '../../lib/units/UnitSystemProvider';
import { ThemeProvider } from '../../lib/theme/ThemeProvider';
import { ToastContainer } from '../../components/ui/Toast';
import { AiSettingsProvider } from '../../lib/ai/AiSettingsProvider';

import { SeismicNCSE02Module } from '../../features/seismic-ncse02';
import { encodeShareString } from '../../features/seismic-ncse02/serialize';
import { defaultSeismicState, type SeismicState } from '../../features/seismic-ncse02/state';
import { moduleRegistry } from '../../data/moduleRegistry';
import { MODULE_LIBRARY } from '../../pages/landing/modules';

// El módulo usa el drawer del AppShell; fuera de él, `useDrawer` necesita el
// contexto. Se sustituye por un doble mínimo para poder montar el módulo solo.
vi.mock('../../components/layout/AppShell', () => ({
  useDrawer: () => ({ openDrawer: vi.fn(), closeDrawer: vi.fn(), drawerOpen: false }),
}));

function montar() {
  return render(
    <MemoryRouter initialEntries={['/analisis/sismo']}>
      <ThemeProvider>
        <UnitSystemProvider>
          {/* El aviso de «no se puede exportar» viaja por showToast, que
              necesita un contenedor montado para llegar al DOM. Va ANTES que el
              módulo porque `showToast` reparte entre los suscriptores del
              momento, sin cola: los efectos corren en orden de árbol, así que un
              aviso emitido al montar —el del enlace corrupto— se perdería si el
              contenedor se suscribiera después. En la app real lo cubre la carga
              perezosa de la ruta, que monta el módulo mucho más tarde. */}
          <ToastContainer />
          {/* El chat del asistente lee sus ajustes del contexto. */}
          <AiSettingsProvider>
            <SeismicNCSE02Module />
          </AiSettingsProvider>
        </UnitSystemProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState({}, '', '/analisis/sismo');
});
afterEach(() => cleanup());

describe('arranque', () => {
  it('monta y enseña el caso Granada por defecto', () => {
    montar();
    expect(screen.getByText('Acción sísmica')).toBeTruthy();
    // El municipio del caso por defecto aparece en el panel de resultados.
    expect(screen.getAllByText(/Granada/).length).toBeGreaterThan(0);
  });

  it('el VEREDICTO sale antes que ningún número', () => {
    const { container } = montar();
    const texto = container.textContent ?? '';
    const iVeredicto = texto.indexOf('La Norma rige');
    const iCortante = texto.indexOf('Cortante basal');
    expect(iVeredicto).toBeGreaterThanOrEqual(0);
    expect(iCortante).toBeGreaterThan(iVeredicto);
  });

  it('enseña el cortante basal del caso congelado', () => {
    const { container } = montar();
    // CASO_GRANADA da 2277,31 kN. Sin punto de millar a proposito: el espanol
    // no agrupa los numeros de cuatro cifras (minimumGroupingDigits = 2), y
    // toLocaleString('es-ES') lo respeta.
    expect(container.textContent).toContain('2277');
  });

  it('dibuja el espectro con las DOS curvas y rotula las zonas de alpha', () => {
    montar();
    const svg = screen.getByRole('img', { name: /espectro/i });
    // Dos <path> de curva: la elástica del art. 2.3 y la alpha del art. 3.7.3.
    expect(svg.querySelectorAll('path[stroke]').length).toBeGreaterThanOrEqual(2);
    expect(svg.textContent).toContain('α = 2,5');
    expect(svg.textContent).toContain('T_A');
    expect(svg.textContent).toContain('T_B');
  });

  it('dibuja el alzado con fuerzas y el diagrama de cortantes', () => {
    montar();
    // Por el nombre completo: el espectro también dice de qué dirección son sus
    // modos, y antes no lo decía — pintaba siempre los de X sin rotularlo.
    expect(screen.getByRole('img', { name: /Fuerzas y cortantes en dirección X/i })).toBeTruthy();
  });

  it('el espectro dice de qué dirección son los modos que marca', () => {
    // M12. En los sistemas con T_F dependiente de la dimensión en planta
    // —fábrica, pantallas, acero triangulado— X e Y caen en puntos distintos de
    // la curva, y los de Y no se veían nunca.
    montar();
    const svg = screen.getByRole('img', { name: /espectro/i });
    expect(svg.getAttribute('aria-label')).toMatch(/dirección X/i);
    expect(svg.textContent).toMatch(/T_F · X/);
  });
});

describe('las puertas cortan en pantalla, no solo en el motor', () => {
  it('una declaración sin contestar impide el cálculo y lo dice', async () => {
    const { container } = montar();
    fireEvent.click(screen.getByText('Declaraciones'));

    // "Regularidad geométrica" a sin contestar. La fila es el ancestro que
    // contiene tanto el rotulo como los tres botones.
    const rotulo = screen.getByText('Regularidad geométrica');
    const fila = rotulo.closest('div.flex.items-start');
    expect(fila).toBeTruthy();
    fireEvent.click(within(fila as HTMLElement).getByText('—'));

    await waitFor(() => {
      expect(container.textContent).toContain('NO es aplicable');
    });
    // Y desaparece el cortante: no puede quedar un número calculado a la vista
    // de un edificio cuya aplicabilidad está sin resolver.
    expect(container.textContent).not.toContain('Cortante basal');
  });

  it('bajar ab por debajo de 0,04 g exime y retira el cálculo', async () => {
    // Este test antes decía esto en el título y comprobaba otra cosa: subía n a
    // 25, o sea el requisito (1) del art. 3.5.1, y la exención por ab no
    // quedaba cubierta en integración. Ahora se prueba de verdad, por la vía de
    // la entrada manual.
    const { container } = montar();
    fireEvent.click(screen.getByText(/introducir a mano/i));

    const ab = screen.getByLabelText('ab (g)');
    fireEvent.change(ab, { target: { value: '0.03' } });

    await waitFor(() => {
      expect(container.textContent).toMatch(/no es de aplicación obligatoria/i);
    });
    expect(container.textContent).not.toContain('Cortante basal');
  });
});

describe('n sale de la tabla de plantas, no de un campo aparte', () => {
  // El escenario de C4: «+ planta» subía `n` y dejaba `n total` quieto, y
  // borrar una fila no tocaba ninguno de los dos. Con `n total` por debajo de
  // `n` —imposible, porque los sótanos suman— la pasarela de las cuatro plantas
  // del art. 3.5.1 se abría para edificios que no le corresponden.

  /** Las plantas se editan en su cuadro: la barra sólo lleva el resumen. */
  const abrirPlantas = () => fireEvent.click(screen.getByText('Editar plantas y cargas'));

  it('añadir una planta mueve n, que ya no es un campo aparte', async () => {
    const { container } = montar();
    abrirPlantas();
    // El caso por defecto son diez plantas.
    await waitFor(() => expect(container.textContent).toContain('10 plantas'));

    fireEvent.click(screen.getByText('+ planta'));
    await waitFor(() => expect(container.textContent).toContain('11 plantas'));
  });

  it('borrar una planta también lo mueve: antes sólo lo hacía añadir', async () => {
    // La mitad exacta del fallo. «+ planta» actualizaba `n` a mano y el botón
    // de borrar no tocaba nada, así que quitar filas dejaba `n` inflado y con
    // él T_F, el número de modos y el requisito (1) del art. 3.5.1.
    const { container } = montar();
    abrirPlantas();
    await waitFor(() => expect(container.textContent).toContain('10 plantas'));

    fireEvent.click(screen.getAllByLabelText(/^Eliminar /)[0]);
    await waitFor(() => expect(container.textContent).toContain('9 plantas'));
  });

  it('unos sótanos negativos no bajan el total por debajo de n', async () => {
    const { container } = montar();
    fireEvent.change(screen.getByLabelText('Sótanos'), { target: { value: '-5' } });

    abrirPlantas();
    await waitFor(() => expect(container.textContent).toContain('10 plantas'));
    // El recuento se acota a cero sótanos: n total = n = 10, nunca menos.
    expect(container.textContent).not.toMatch(/\b[1-9] plantas\b/);
  });
});

describe('cuadro de plantas y cargas', () => {
  // Las plantas se editaban en la barra de 288 px: el desplegable de categoria
  // se cortaba a mitad de palabra y no habia forma de ver dos plantas a la vez.
  // Ahora tienen cuadro propio, con el alzado del edificio a la izquierda. Lo
  // que sigue es lo que ese cambio tenia que conservar, y lo que anade.

  const abrir = () => fireEvent.click(screen.getByText('Editar plantas y cargas'));
  const guardado = () => JSON.parse(localStorage.getItem('concreta-seismic-ncse02-model')!);

  it('se abre desde la barra y trae el edificio entero en el alzado', async () => {
    montar();
    abrir();
    const cuadro = await screen.findByRole('dialog');
    // Una banda por planta: el caso por defecto son diez.
    expect(within(cuadro).getAllByLabelText(/: cota .+ m, peso /)).toHaveLength(10);
  });

  it('se edita la planta resaltada, y la selecciona el alzado', async () => {
    // El detalle es de UNA planta, asi que apuntar a la equivocada seria un
    // fallo mudo: el area entraria en otra fila y el peso cuadraria igual.
    montar();
    abrir();
    const cuadro = await screen.findByRole('dialog');
    fireEvent.click(within(cuadro).getByLabelText(/^Planta 3:/));
    fireEvent.change(within(cuadro).getByLabelText('Área (m²)'), { target: { value: '250' } });
    await waitFor(() => {
      const g = guardado();
      expect(g.plantas[2].area).toBe(250);
      expect(g.plantas[0].area).toBe(300);
    });
  });

  it('copiar las cargas a las demas alcanza a todas las plantas', async () => {
    montar();
    abrir();
    const cuadro = await screen.findByRole('dialog');
    fireEvent.change(within(cuadro).getByLabelText('Área (m²)'), { target: { value: '250' } });
    fireEvent.click(within(cuadro).getByText('Copiar cargas a las demás'));
    // En dos pasos: sobrescribe nueve plantas y no hay deshacer en el modulo.
    fireEvent.click(within(cuadro).getByText(/^Sobrescribir las 9 restantes$/));
    await waitFor(() => {
      const g = guardado();
      expect(g.plantas.map((p: { area: number }) => p.area)).toEqual(Array(10).fill(250));
      // La cubierta traia una sobrecarga excluida: la copia la lleva tambien,
      // porque va la definicion de peso ENTERA y no solo las cargas.
      expect(g.plantas[9].componentes).toHaveLength(4);
    });
  });

  it('un componente se puede quitar: antes solo se podian anadir', async () => {
    montar();
    abrir();
    const cuadro = await screen.findByRole('dialog');
    expect(guardado().plantas[0].componentes).toHaveLength(4);
    fireEvent.click(within(cuadro).getByLabelText('Quitar componente 4'));
    await waitFor(() => expect(guardado().plantas[0].componentes).toHaveLength(3));
  });
});

describe('cuadro de geometría en planta', () => {
  // Las direcciones se editaban en la barra con la coordenada FIRMADA respecto
  // al centro: la convención del motor (art. 3.7.5), no la de quien mide un
  // plano desde la fachada. Un signo cambiado no lo delata ningún número. En el
  // cuadro la posición se teclea desde el borde y el signo es un derivado; lo
  // que sigue comprueba que esa traducción guarda EXACTAMENTE lo de antes.

  const abrir = () => fireEvent.click(screen.getByText('Editar geometría en planta'));
  const guardado = () => JSON.parse(localStorage.getItem('concreta-seismic-ncse02-model')!);

  it('se abre desde la barra, con la planta dibujada y las posiciones desde el borde', async () => {
    montar();
    abrir();
    const cuadro = await screen.findByRole('dialog');
    expect(within(cuadro).getByRole('img', { name: /planta con los planos/i })).toBeTruthy();
    // Los planos de X (sismo en X) se reparten sobre los 15 m de Y: el primero
    // está guardado en x = −7,5, que desde el borde inferior es 0.
    const campo = within(cuadro).getByLabelText(
      'Plano 1: posición desde el borde inferior, en metros',
    ) as HTMLInputElement;
    expect(campo.value).toBe('0');
    // Y la lectura ordenada de la crujía, para comprobarla contra el plano.
    expect(cuadro.textContent).toContain('vanos: 3,75 · 7,50 · 3,75 m');
  });

  it('teclear desde el borde guarda la coordenada firmada del motor', async () => {
    montar();
    abrir();
    const cuadro = await screen.findByRole('dialog');
    fireEvent.change(
      within(cuadro).getByLabelText('Plano 1: posición desde el borde inferior, en metros'),
      { target: { value: '3' } },
    );
    // 3 m desde el borde inferior de una planta de 15 m es −4,5 del centro.
    await waitFor(() => expect(guardado().x.elementos[0].x).toBe(-4.5));
    // El derivado con signo queda a la vista, que es donde se reconoce la
    // convención de la Norma.
    expect(within(cuadro).getByText('x = -4,50 m')).toBeTruthy();
  });

  it('mover un plano no reordena la tabla mientras se teclea, pero sí al salir de ella', async () => {
    montar();
    abrir();
    const cuadro = await screen.findByRole('dialog');
    const xs = () => guardado().x.elementos.map((e: { x: number }) => e.x);
    const campo = within(cuadro).getByLabelText(
      'Plano 1: posición desde el borde inferior, en metros',
    ) as HTMLInputElement;
    // El plano 1 pasa del borde (0) a 5 m: por delante del plano 2 (3,75).
    fireEvent.change(campo, { target: { value: '5' } });
    await waitFor(() => expect(guardado().x.elementos[0].x).toBe(-2.5));
    // Sigue en la fila 1: una fila que salta bajo el cursor es ineditable.
    expect(xs()).toEqual([-2.5, -3.75, 3.75, 7.5]);
    // Al salir de la tabla se ordena, y el número vuelve a ser el orden en planta.
    fireEvent.blur(campo);
    await waitFor(() => expect(xs()).toEqual([-3.75, -2.5, 3.75, 7.5]));
    const fila2 = within(cuadro).getByLabelText(
      'Plano 2: posición desde el borde inferior, en metros',
    ) as HTMLInputElement;
    expect(fila2.value).toBe('5');
  });

  it('cerrar con Escape también deja los planos en orden', async () => {
    montar();
    abrir();
    const cuadro = await screen.findByRole('dialog');
    fireEvent.change(
      within(cuadro).getByLabelText('Plano 1: posición desde el borde inferior, en metros'),
      { target: { value: '5' } },
    );
    await waitFor(() => expect(guardado().x.elementos[0].x).toBe(-2.5));
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() =>
      expect(guardado().x.elementos.map((e: { x: number }) => e.x)).toEqual([-3.75, -2.5, 3.75, 7.5]),
    );
  });

  it('el selector de dirección cambia de lista y de borde de referencia', async () => {
    montar();
    abrir();
    const cuadro = await screen.findByRole('dialog');
    fireEvent.click(within(cuadro).getByText('Sismo en Y'));
    // Los planos de Y se reparten sobre los 20 m de X, desde el borde izquierdo.
    const campo = within(cuadro).getByLabelText(
      'Plano 2: posición desde el borde izquierdo, en metros',
    ) as HTMLInputElement;
    expect(campo.value).toBe('5'); // guardado: x = −5 sobre L_X = 20
    fireEvent.change(campo, { target: { value: '4' } });
    await waitFor(() => expect(guardado().y.elementos[1].x).toBe(-6));
    // La dirección X no se ha tocado.
    expect(guardado().x.elementos[1].x).toBe(-3.75);
  });

  it('el reparto uniforme sustituye la lista en dos pasos', async () => {
    montar();
    abrir();
    const cuadro = await screen.findByRole('dialog');
    fireEvent.change(
      within(cuadro).getByLabelText('Número de planos a repartir uniformemente'),
      { target: { value: '5' } },
    );
    fireEvent.click(within(cuadro).getByText('Repartir uniformemente'));
    // En dos pasos: machaca los cuatro planos actuales y no hay deshacer.
    expect(guardado().x.elementos).toHaveLength(4);
    fireEvent.click(within(cuadro).getByText(/^Sustituir los 4 actuales$/));
    await waitFor(() => {
      const els = guardado().x.elementos as { x: number; k: number }[];
      // Cinco planos de fachada a fachada sobre los 15 m de Y, con k = 1.
      expect(els.map((e) => e.x)).toEqual([-7.5, -3.75, 0, 3.75, 7.5]);
      expect(els.every((e) => e.k === 1)).toBe(true);
    });
  });

  it('quitar un plano lo quita del estado, no sólo de la tabla', async () => {
    montar();
    abrir();
    const cuadro = await screen.findByRole('dialog');
    fireEvent.click(within(cuadro).getByLabelText('Quitar el plano 4'));
    await waitFor(() => expect(guardado().x.elementos).toHaveLength(3));
  });

  it('descentrar la rigidez enseña la excentricidad del requisito (6) en vivo', async () => {
    montar();
    abrir();
    const cuadro = await screen.findByRole('dialog');
    // Todo simétrico: e = 0 sobre L_Y.
    expect(cuadro.textContent).toContain('e = 0,00 m');
    fireEvent.change(within(cuadro).getByLabelText('Rigidez relativa del plano 4'), {
      target: { value: '9' },
    });
    // CR = (−7,5 − 3,75 + 3,75 + 9·7,5)/12 = 5,00 m → 33,3 % de L_Y = 15.
    await waitFor(() => expect(cuadro.textContent).toContain('e = 5,00 m'));
    expect(cuadro.textContent).toContain('33,3 %');
  });
});

describe('buscador de municipios', () => {
  it('encuentra Alicante tecleando su forma valenciana', async () => {
    montar();
    const caja = screen.getByLabelText(/^Municipio/i);
    fireEvent.change(caja, { target: { value: 'alacant' } });

    await waitFor(
      () => {
        expect(screen.getByText('Alicante/Alacant')).toBeTruthy();
      },
      { timeout: 3000 },
    );
  });

  it('un nombre que no está da el mensaje de las tres causas, sin afirmar la exención', async () => {
    montar();
    fireEvent.change(screen.getByLabelText(/^Municipio/i), { target: { value: 'zzzzqqq' } });

    await waitFor(
      () => {
        expect(screen.getByText(/No figura en el Anejo 1/)).toBeTruthy();
      },
      { timeout: 3000 },
    );
    const aviso = screen.getByText(/No figura en el Anejo 1/).textContent ?? '';
    expect(aviso).toMatch(/art\. 1\.2\.3/);
    expect(aviso).toMatch(/errata/i);
    expect(aviso).toMatch(/2002/);
    expect(aviso).not.toMatch(/significa/i);
  });

  it('un material prohibido se anuncia como prohibición, no como fallo del método', async () => {
    // Los seis requisitos del art. 3.5.1 salen en CUMPLE en la misma pantalla,
    // así que el veredicto no puede decir que el método falle: se desmentiría
    // a sí mismo a dos centímetros de distancia.
    const { container } = montar();
    fireEvent.change(screen.getByLabelText(/^Sistema/i), { target: { value: 'adobe' } });

    await waitFor(() => expect(container.textContent).toMatch(/PROHÍBE/));
    expect(container.textContent).not.toMatch(/método simplificado NO es aplicable/);
    expect(container.textContent).toMatch(/adobe/i);
    // Y no se publica acción sísmica.
    expect(container.textContent).not.toMatch(/Cortante basal/);
  });

  it('un sistema sin expresión de T_F no publica una cadena de fuerzas', async () => {
    // Antes calculaba con T_F = 0, que da alpha = 2,5 y unas fuerzas de aspecto
    // impecable levantadas sobre nada.
    const { container } = montar();
    fireEvent.change(screen.getByLabelText(/^Sistema/i), { target: { value: 'otro' } });

    await waitFor(() => expect(container.textContent).toMatch(/faltan datos para calcular/i));
    expect(container.textContent).toMatch(/3\.7\.2\.2/);
    expect(container.textContent).not.toMatch(/Cortante basal/);
  });

  it('MELILLA existe, y la Norma le resulta OBLIGATORIA', async () => {
    // El fallo más grave que tenía el módulo, de extremo a extremo. La capa del
    // IGN publica Melilla sin aceleración, así que el buscador respondía "no
    // figura en el Anejo 1" — leído como exención. El Anejo 1 le da 0,08 g, que
    // además cae JUSTO en el umbral: la exención de pórticos arriostrados del
    // art. 1.2.3 pide ab < 0,08 g, y con 0,08 g exactamente no aplica.
    const { container } = montar();
    fireEvent.change(screen.getByLabelText(/^Municipio/i), { target: { value: 'melilla' } });
    const opcion = await screen.findByText('Melilla', {}, { timeout: 3000 });
    fireEvent.click(opcion);

    await waitFor(() => expect(container.textContent).toContain('Melilla'));
    expect(container.textContent).toContain('0,08 g');
    // Y el veredicto no puede ser de exención.
    expect(container.textContent).not.toContain('La Norma no es de aplicación obligatoria');
    expect(container.textContent).toContain('La Norma rige');
  });

  it('un municipio creado después de 2002 declara de quién hereda', async () => {
    // Fornes se segregó de Arenas del Rey en 2018 y hereda sus 0,24 g, de las
    // aceleraciones más altas de España. Heredar es exacto —la Norma clasificó
    // ese mismo territorio bajo el término de origen— pero no es lo que dice el
    // Anejo 1 con este nombre, así que la pantalla tiene que decirlo.
    const { container } = montar();
    fireEvent.change(screen.getByLabelText(/^Municipio/i), { target: { value: 'fornes' } });
    const opcion = await screen.findByText('Fornes', {}, { timeout: 3000 });
    fireEvent.click(opcion);

    await waitFor(() => expect(container.textContent).toContain('0,24 g'));
    expect(container.textContent).toMatch(/Heredado de Arenas del Rey/i);
    expect(container.textContent).toContain('2018');
  });

  it('el "no encontrado" ofrece la salida a mano, y usarla deja ab y K editables', async () => {
    // Sin esta salida, un municipio que la capa del IGN no publica —Ceuta,
    // Melilla, cualquier segregación posterior a 2002— deja el módulo
    // inservible: no hay forma de introducir su peligrosidad.
    montar();
    fireEvent.change(screen.getByLabelText(/^Municipio/i), { target: { value: 'zzzzqqq' } });

    const boton = await screen.findByText(/Introducir ab y K a mano/i, {}, { timeout: 3000 });
    fireEvent.click(boton);

    // ab y K pasan de derivados de sólo lectura a campos con los que se decide.
    const ab = screen.getByLabelText('ab (g)') as HTMLInputElement;
    const k = screen.getByLabelText('K') as HTMLInputElement;
    fireEvent.change(ab, { target: { value: '0.08' } });
    fireEvent.change(k, { target: { value: '1.3' } });
    expect(ab.value).toBe('0.08');
    expect(k.value).toBe('1.3');
  });

  it('elegir un municipio actualiza ab y K', async () => {
    const { container } = montar();
    fireEvent.change(screen.getByLabelText(/^Municipio/i), { target: { value: 'lorca' } });
    const opcion = await screen.findByText('Lorca', {}, { timeout: 3000 });
    fireEvent.click(opcion);

    await waitFor(() => {
      expect(container.textContent).toContain('Lorca');
    });
  });
});

describe('entrada de datos', () => {
  /** Las plantas se editan en su cuadro: la barra sólo lleva el resumen. */
  const abrirPlantas = () => fireEvent.click(screen.getByText('Editar plantas y cargas'));

  /**
   * Tecleo de verdad: el campo se vacía y luego entra UNA pulsación por
   * carácter. Con un solo `change` al valor final no se reproduce nada, porque
   * el fallo estaba justo en los estados intermedios: «4,» no es un número, y
   * «4,5» sólo lo es si alguien traduce la coma. Ahí desaparecía el separador.
   */
  const teclear = (el: HTMLElement, texto: string) => {
    fireEvent.change(el, { target: { value: '' } });
    for (let i = 1; i <= texto.length; i++) {
      fireEvent.change(el, { target: { value: texto.slice(0, i) } });
    }
  };

  it('la coma decimal sobrevive al tecleo', async () => {
    montar();
    const h = screen.getByLabelText('H (m)') as HTMLInputElement;
    teclear(h, '32,5');
    expect(h.value).toBe('32,5');
    await waitFor(() => {
      expect(JSON.parse(localStorage.getItem('concreta-seismic-ncse02-model')!).H).toBe(32.5);
    });
  });

  it('y también en los campos en línea: «4,5» kN/m² ya no se guarda como 45', async () => {
    // A1, en el campo más editado del módulo. Los seis campos en línea hacían
    // parseFloat sobre el value controlado, así que la coma se borraba bajo el
    // cursor y la cifra siguiente se pegaba a la anterior: un factor diez en la
    // carga de una planta, sin ningún aviso.
    montar();
    abrirPlantas();
    const q = screen.getAllByLabelText(/Carga del componente 1 en kN\/m²/)[0] as HTMLInputElement;
    teclear(q, '4,5');
    expect(q.value).toBe('4,5');
    await waitFor(() => {
      const guardado = JSON.parse(localStorage.getItem('concreta-seismic-ncse02-model')!);
      expect(guardado.plantas[0].componentes[0].q).toBe(4.5);
    });
  });

  it('un texto que no es un número no llega al estado ni se queda a la vista', () => {
    // `parseFloat('4x')` vale 4: el estado se quedaba con 4 y la pantalla con
    // «4x», dos cosas distintas a la vez.
    montar();
    const h = screen.getByLabelText('H (m)') as HTMLInputElement;
    fireEvent.change(h, { target: { value: '4x' } });
    fireEvent.blur(h);
    expect(h.value).toBe('30');
  });

  it('un valor fuera de rango no se queda contradiciendo al cálculo', () => {
    // M11: el commit no pasaba del mínimo y el blur sólo restauraba con NaN, así
    // que un «-2» en Ω se quedaba a la vista indefinidamente mientras la cadena
    // seguía calculando con el 5 % anterior.
    const { container } = montar();
    const omega = screen.getByLabelText('Ω (%)') as HTMLInputElement;
    fireEvent.change(omega, { target: { value: '-2' } });
    // Mientras se teclea manda el texto: nada se corrige bajo el cursor.
    expect(omega.value).toBe('-2');
    expect(container.textContent).toContain('Ω = 5 %');
    // Al salir del campo manda el estado.
    fireEvent.blur(omega);
    expect(omega.value).toBe('5');
  });
});

describe('el enlace compartido se consume una sola vez', () => {
  const conEnlace = (s: SeismicState) =>
    window.history.replaceState({}, '', `/analisis/sismo?model=${encodeShareString(s)}`);

  it('retira ?model= de la barra de direcciones al abrirlo', async () => {
    conEnlace({ ...defaultSeismicState(), H: 41 });
    montar();
    await waitFor(() => expect(window.location.search).toBe(''));
    expect((screen.getByLabelText('H (m)') as HTMLInputElement).value).toBe('41');
  });

  it('editar tras abrir un enlace y recargar ya no revierte a la URL', async () => {
    // A2 de extremo a extremo. La carga da prioridad a la URL sobre lo guardado
    // y el módulo no la limpiaba nunca, así que F5 volvía a hidratar del enlace
    // y el autoguardado escribía encima: las ediciones desaparecían sin aviso.
    conEnlace({ ...defaultSeismicState(), H: 41 });
    const { unmount } = montar();
    await waitFor(() => expect(window.location.search).toBe(''));

    fireEvent.change(screen.getByLabelText('H (m)'), { target: { value: '52' } });
    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem('concreta-seismic-ncse02-model')!).H).toBe(52),
    );
    unmount();

    montar(); // la recarga
    expect((screen.getByLabelText('H (m)') as HTMLInputElement).value).toBe('52');
  });

  it('refresca ab y K contra la tabla instalada, y con eso se cae una exención', async () => {
    // M4. El enlace manda el municipio por su código INE y ab/K sólo de copia
    // —lo dice `serialize.ts` desde el primer día—, pero el refresco prometido
    // no estaba escrito. Un enlace con la copia vieja o manipulada se pintaba y
    // se imprimía rotulado «Anejo 1» con valores que el Anejo 1 no dice; aquí,
    // con 0,01 g, declarando exento el mismo Granada que la Norma obliga.
    conEnlace({ ...defaultSeismicState(), ab: 0.01 });
    const { container } = montar();
    expect(container.textContent).toMatch(/no es de aplicación obligatoria/i);

    await waitFor(() => expect(container.textContent).toContain('La Norma rige'), {
      timeout: 3000,
    });
    expect(container.textContent).toContain('0.23');
  });

  it('un enlace corrupto avisa, en vez de abrir otro caso en silencio', async () => {
    // El aviso viajaba por una variable de módulo que el initializer de
    // `useState` escribía y un efecto leía. Con el compilador de React (activo
    // en este repo) esa comunicación NO llega: el efecto lee antes de que el
    // initializer escriba. El usuario veía un caso que no era el del enlace y
    // nada se lo decía. No tenía ninguna prueba.
    window.history.replaceState({}, '', '/analisis/sismo?model=esto-no-es-un-caso');
    montar();
    expect(await screen.findByText(/no traía un caso de sismo válido/i)).toBeTruthy();
  });

  it('un municipio que la tabla instalada no tiene deja de atribuirse al Anejo 1', async () => {
    // Puede pasar con un enlace hecho por una versión más reciente del
    // suplemento. Los números se conservan; lo que no se sostiene es seguir
    // llamando Anejo 1 a lo que la tabla instalada no dice.
    conEnlace({
      ...defaultSeismicState(),
      municipioIne: '99999',
      municipioNombre: 'Término Nuevo',
    });
    const { container } = montar();
    await waitFor(() => expect(container.textContent).toMatch(/sin municipio del Anejo 1/i), {
      timeout: 3000,
    });
  });
});

describe('persistencia y enlace', () => {
  it('guarda el caso en localStorage al tocarlo', async () => {
    montar();
    fireEvent.change(screen.getByLabelText('H (m)'), { target: { value: '33' } });
    await waitFor(() => {
      const bruto = localStorage.getItem('concreta-seismic-ncse02-model');
      expect(bruto).toBeTruthy();
      expect(JSON.parse(bruto!).H).toBe(33);
    });
  });

  it('copia un enlace que contiene el caso', async () => {
    const escribir = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText: escribir } });
    montar();
    // Vive dentro del menu de Ajustes de la topbar, no suelto.
    fireEvent.click(screen.getAllByLabelText('Ajustes')[0]);
    fireEvent.click(await screen.findByText('Copiar enlace'));
    await waitFor(() => expect(escribir).toHaveBeenCalled());
    expect(String(escribir.mock.calls[0][0])).toContain('?model=');
  });
});

describe('exportación a PDF', () => {
  it('el botón está en la barra y abre el modal de título', async () => {
    montar();
    fireEvent.click(screen.getByLabelText('Exportar PDF'));
    const dialogo = await screen.findByRole('dialog');
    expect(dialogo.getAttribute('aria-labelledby')).toBe('title-prompt-heading');
    // La vista previa del nombre sale del MISMO fallback que usa el
    // exportador: si se separasen, el usuario vería un nombre y descargaría
    // otro.
    expect(dialogo.textContent).toMatch(/sismo-ncse02-granada-\d{4}-\d{2}-\d{2}\.pdf/);
  });

  it('con un requisito sin declarar NO abre el modal, y dice por qué', async () => {
    montar();
    fireEvent.click(screen.getByText('Declaraciones'));
    const fila = screen.getByText('Regularidad geométrica').closest('div.flex.items-start');
    fireEvent.click(within(fila as HTMLElement).getByText('—'));

    fireEvent.click(screen.getByLabelText('Exportar PDF'));

    // Un PDF con la puerta sin resolver parecería una justificación sin serlo.
    await waitFor(() => {
      expect(screen.getByText(/Quedan sin declarar los requisitos/)).toBeTruthy();
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('un caso EXENTO sí exporta: ese papel es el que se adjunta a la memoria', async () => {
    montar();
    fireEvent.change(screen.getByLabelText('Importancia'), { target: { value: 'moderada' } });
    await waitFor(() => {
      expect(document.body.textContent).toContain('no es de aplicación obligatoria');
    });
    fireEvent.click(screen.getByLabelText('Exportar PDF'));
    expect(await screen.findByRole('dialog')).toBeTruthy();
  });

  it('monta los clones fuera de pantalla que el exportador rasteriza', () => {
    montar();
    for (const id of ['seismic-espectro-svg-pdf', 'seismic-alzado-x-svg-pdf', 'seismic-alzado-y-svg-pdf']) {
      const nodo = document.getElementById(id);
      expect(nodo, `falta el clon ${id}: el PDF saldría sin esa figura`).toBeTruthy();
      expect(nodo!.querySelector('svg')).toBeTruthy();
    }
  });
});

describe('asistente IA', () => {
  it('el botón está en la barra y abre el chat del módulo de sismo', async () => {
    montar();
    fireEvent.click(screen.getAllByLabelText('Abrir asistente IA')[0]);
    const chat = await screen.findByRole('dialog');
    expect(chat.textContent).toContain('Acción sísmica NCSE-02');
  });

  it('el placeholder del chat es un enunciado de sismo, no de otro módulo', async () => {
    montar();
    fireEvent.click(screen.getAllByLabelText('Abrir asistente IA')[0]);
    await screen.findByRole('dialog');
    expect(document.body.textContent).toMatch(/plantas/i);
  });
});

describe('sistema de unidades', () => {
  // El estado y el motor viven SIEMPRE en kN: el conmutador sólo cambia lo que
  // se enseña y lo que se teclea. Antes el módulo lo ignoraba por completo.

  it('en técnico las fuerzas salen en Tn, en pantalla y en los dibujos', () => {
    localStorage.setItem('unitSystem', 'tecnico');
    const { container } = montar();
    // El cortante basal del caso congelado: 2277 kN → 232,2 Tn. Que no quede
    // NINGÚN 2277 a la vista: también los dibujos convierten.
    expect(container.textContent).toContain('232,2');
    expect(container.textContent).toContain('Tn');
    expect(container.textContent).not.toContain('2277');
  });

  it('en técnico las cargas se teclean en kg/m² y el estado sigue en kN/m²', async () => {
    localStorage.setItem('unitSystem', 'tecnico');
    montar();
    fireEvent.click(screen.getByText('Editar plantas y cargas'));
    await screen.findByRole('dialog');
    const q = screen.getAllByLabelText(/Carga del componente 1 en kg\/m²/)[0] as HTMLInputElement;
    fireEvent.change(q, { target: { value: '102' } });
    await waitFor(() => {
      const guardado = JSON.parse(localStorage.getItem('concreta-seismic-ncse02-model')!);
      // Lo guardado es el SI exacto de lo tecleado: 102 kg/m² = 102/101,97… kN/m².
      expect(guardado.plantas[0].componentes[0].q).toBeCloseTo(102 / 101.971621, 9);
    });
  });
});

describe('registro del módulo', () => {
  it('está en moduleRegistry con su ruta y su grupo', () => {
    const e = moduleRegistry.find((m) => m.key === 'concreta-seismic');
    expect(e).toBeTruthy();
    // La URL NO cambió al mover el módulo de grupo: hay enlaces compartidos
    // vivos apuntando a /analisis/sismo (decisión D7 del diseño de Memorias).
    expect(e?.route).toBe('/analisis/sismo');
    expect(e?.group).toBe('Acciones');
    expect(e?.shipped).toBe(true);
  });

  it('está en la biblioteca de la landing, con la misma ruta', () => {
    const e = MODULE_LIBRARY.find((m) => m.id === 'seismic-ncse02');
    expect(e).toBeTruthy();
    expect(e?.route).toBe('/analisis/sismo');
    // Si la landing y el registro se separan, el usuario pincha y no llega.
    expect(e?.route).toBe(moduleRegistry.find((m) => m.key === 'concreta-seismic')?.route);
  });
});
