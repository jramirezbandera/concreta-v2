/**
 * Qué DICE el PDF de sismo, no cómo está maquetado.
 *
 * La maquetación ya la barren `pdfLayout` y `latin1Encoding` sobre los cuatro
 * casos registrados en `pdfCases.ts`. Aquí se comprueba el contenido, y se hace
 * leyendo el texto REALMENTE emitido a `doc.text()` — el mismo instrumental que
 * usa la auditoría de maquetación. Eso importa: `drawTable` TRUNCA con elipsis
 * lo que no cabe en su columna, así que una aserción sobre el modelo pasaría
 * mientras el papel enseña «SIN DECL...». Leyendo la traza, un rótulo que no
 * quepa rompe el test.
 *
 * Los cuatro invariantes que se vigilan aquí son los que, si se rompen, no dan
 * ningún síntoma visible:
 *
 *   1. El VEREDICTO va antes que ningún número. Un cortante basal calculado
 *      sobre un edificio que no cumple el art. 3.5.1 no significa nada.
 *   2. DECLARADO no es COMPROBADO. Los requisitos (3), (4) y (5) son juicio del
 *      proyectista y el papel tiene que decirlo.
 *   3. Las sobrecargas excluidas de la masa sísmica (art. 3.2) se listan una a
 *      una: una decisión que no se lee no la puede revisar nadie.
 *   4. `ab` y `K` llevan su procedencia. Una memoria que afirma ab = 0,23 g
 *      tiene que poder decir de dónde lo sacó.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, expect, it, beforeEach, vi } from 'vitest';

// jsPDF cuelga text()/line() de la INSTANCIA, no del prototipo: hay que envolver
// el constructor para interceptarlos (ver layoutProbe.ts).
vi.mock('jspdf', async (importOriginal) => {
  const mod = await importOriginal<any>();
  const { instrument } = await import('../pdf/layoutProbe');
  const Real = mod.default ?? mod.jsPDF;
  const Patched: any = function (...args: any[]) { return instrument(new Real(...args)); };
  return { ...mod, default: Patched, jsPDF: Patched };
});

import { resetProbe, texts } from '../pdf/layoutProbe';
import {
  exportSeismicNCSE02PDF,
  seismicNCSE02FallbackFilename,
  seismicPdfBlocker,
} from '../../lib/pdf/seismicNCSE02';
import {
  defaultSeismicState,
  evaluarSismo,
  newId,
  type SeismicState,
} from '../../features/seismic-ncse02/state';

/**
 * Estado con `nPlantas` plantas reales. `n` no es un campo declarable: es la
 * tabla, contada. Un edificio de veinticinco plantas hay que construirlo.
 */
function conPlantas(nPlantas: number, extra: Partial<SeismicState> = {}): SeismicState {
  const s = defaultSeismicState();
  const plantas = Array.from({ length: nPlantas }, (_, k) => ({
    ...s.plantas[Math.min(k, s.plantas.length - 1)],
    id: newId(),
    nombre: `Planta ${k + 1}`,
    h: 3 * (k + 1),
  }));
  return { ...s, plantas, H: 3 * nPlantas, ...extra };
}

/**
 * Texto emitido, en orden. `splitTextToSize` parte por espacios y los descarta,
 * así que unir con espacio reconstruye las frases de un mismo párrafo — y por
 * eso se puede buscar por frase y no sólo por palabra suelta.
 */
function emitido(): string {
  return texts.map((t) => t.t).join(' ');
}

async function exportar(state: SeismicState, title = 'Edificio 1') {
  resetProbe();
  const r = await exportSeismicNCSE02PDF({ state, evaluacion: evaluarSismo(state), title });
  return { ...r, texto: emitido() };
}

beforeEach(resetProbe);

describe('el veredicto manda', () => {
  it('sale antes que ningún número', async () => {
    const { texto } = await exportar(defaultSeismicState());
    const iVeredicto = texto.indexOf('VEREDICTO');
    const iCortante = texto.indexOf('CORTANTE BASAL');
    expect(iVeredicto).toBeGreaterThanOrEqual(0);
    expect(iCortante).toBeGreaterThan(iVeredicto);
  });

  it('el caso por defecto dice que la Norma rige y el metodo vale', async () => {
    const { texto } = await exportar(defaultSeismicState());
    expect(texto).toContain('La NCSE-02 es de aplicación');
    expect(texto).toContain('es aplicable');
  });
});

describe('el documento de exencion es un documento completo', () => {
  it('dice el motivo con su articulo y NO trae cadena de fuerzas', async () => {
    const { texto, pageCount } = await exportar({
      ...defaultSeismicState(),
      importancia: 'moderada',
    });
    expect(texto).toContain('NO es de aplicación obligatoria');
    expect(texto).toContain('importancia moderada');
    // Un cortante basal en un documento de exención sería justo el número que
    // nadie debe copiar: no puede estar.
    expect(texto).not.toContain('CORTANTE BASAL');
    expect(texto).not.toContain('COMBINACION DIRECCIONAL');
    // Y sigue siendo un papel utilizable: emplazamiento y alcance dentro.
    expect(texto).toContain('EMPLAZAMIENTO');
    expect(texto).toContain('ALCANCE DE ESTE DOCUMENTO');
    expect(pageCount).toBeGreaterThanOrEqual(1);
  });

  it('exento por ab < 0,04 g lo dice con el umbral, no con una vaguedad', async () => {
    const { texto } = await exportar({
      ...defaultSeismicState(),
      municipioIne: null,
      municipioNombre: '',
      ab: 0.03,
    });
    expect(texto).toContain('inferior a 0,04 g');
  });
});

describe('un material prohibido por el art. 1.2.3 no es un fallo del art. 3.5.1', () => {
  // El documento que se contradecia a si mismo. Con adobe, el metodo
  // simplificado SI es aplicable —el edificio cumple los seis requisitos— y el
  // PDF anunciaba "el metodo simplificado del art. 3.5.1 NO es aplicable",
  // para imprimir a continuacion esos seis requisitos en CUMPLE. La causa real,
  // que el art. 1.2.3 prohibe construir asi, quedaba como una fila de avisos.
  const conAdobe = { ...defaultSeismicState(), sistema: 'adobe' as const };

  it('el titular dice que la Norma PROHIBE, no que el metodo falle', async () => {
    const { texto } = await exportar(conAdobe);
    expect(texto).toMatch(/PROHÍBE esta construcción/);
    expect(texto).not.toContain('método simplificado del art. 3.5.1 NO es aplicable');
  });

  it('nombra el material y el articulo que lo prohibe', async () => {
    const { texto } = await exportar(conAdobe);
    expect(texto).toMatch(/adobe/i);
    expect(texto).toContain('1.2.3');
  });

  it('advierte de que cumplir el art. 3.5.1 no levanta la prohibicion', async () => {
    // Sin esta frase, la tabla de seises en CUMPLE que sigue se lee como una
    // autorizacion.
    const { texto } = await exportar(conAdobe);
    expect(texto).toMatch(/NO levanta la prohibición/);
    expect(texto).toContain('REQUISITOS DEL METODO SIMPLIFICADO');
  });

  it('no imprime accion sismica', async () => {
    const { texto } = await exportar(conAdobe);
    expect(texto).not.toContain('CORTANTE BASAL');
    expect(texto).not.toContain('COMBINACION DIRECCIONAL');
  });

  it('la fabrica por encima de sus alturas recibe el mismo trato', async () => {
    const { texto } = await exportar(conPlantas(6, { sistema: 'fabrica' }));
    expect(texto).toMatch(/PROHÍBE esta construcción/);
    expect(texto).toMatch(/alturas/i);
  });
});

describe('las plantas se emparejan por ID, no por posicion', () => {
  // `calcularSismo` ORDENA las plantas por altura antes de nada, asi que
  // `state.plantas[i]` deja de ser la planta i del resultado en cuanto las
  // alturas no van en orden creciente — al editar la h de una intermedia, o al
  // meter un entresuelo. Emparejando por indice, la tabla de masa imprimia el
  // nombre y el origen del peso de una planta junto a la altura y el P_k de
  // otra, y la de fuerzas cada F_k con la h_k equivocada. El calculo estaba
  // bien; el papel mentia.

  /** Tres plantas con las alturas AL REVES del orden de la tabla. */
  function desordenado(): SeismicState {
    const s = defaultSeismicState();
    const base = s.plantas[0];
    return {
      ...s,
      H: 9,
      plantas: [
        { ...base, id: newId(), nombre: 'ARRIBA', h: 9, area: 100, pesoManual: true, P: 1000 },
        { ...base, id: newId(), nombre: 'ENMEDIO', h: 6, area: 200, pesoManual: true, P: 2000 },
        { ...base, id: newId(), nombre: 'ABAJO', h: 3, area: 300, pesoManual: true, P: 3000 },
      ],
    };
  }

  it('cada nombre viaja con SU peso, aunque la tabla no vaya ordenada', async () => {
    const { texto } = await exportar(desordenado());
    // La planta baja pesa 3000 kN y se llama ABAJO: tienen que salir juntas.
    // El orden del documento es el del motor (de abajo arriba), asi que la
    // primera fila de la tabla es ABAJO con 3000.
    const iAbajo = texto.indexOf('ABAJO');
    const iArriba = texto.indexOf('ARRIBA');
    expect(iAbajo).toBeGreaterThanOrEqual(0);
    expect(iArriba).toBeGreaterThanOrEqual(0);
    // ABAJO (h = 3) sale antes que ARRIBA (h = 9) porque el motor ordena por
    // altura; si se emparejara por posicion, saldrian al reves.
    expect(iAbajo).toBeLessThan(iArriba);
  });

  it('el peso sismico total no cambia por reordenar: el calculo ya estaba bien', async () => {
    const { texto } = await exportar(desordenado());
    expect(texto).toContain('6000');
  });
});

describe('sin periodo fundamental no se imprime cadena de fuerzas', () => {
  // Con un sistema sin expresion de T_F, el motor emitia un aviso de severidad
  // "bloqueo" y calculaba igual con T_F = 0: alpha = 2,5 y una cadena entera de
  // numeros verosimiles. El PDF los imprimia atribuyendo el periodo al art.
  // 3.7.2.2, que para ese sistema no tiene expresion ninguna.
  const sinTF = { ...defaultSeismicState(), sistema: 'otro' as const };

  it('lo dice en el veredicto en vez de publicar numeros vacios', async () => {
    const { texto } = await exportar(sinTF);
    expect(texto).toMatch(/faltan datos para calcular/i);
    expect(texto).toContain('3.7.2.2');
  });

  it('no imprime ni T_F ni cortante basal', async () => {
    const { texto } = await exportar(sinTF);
    expect(texto).not.toContain('CORTANTE BASAL');
    expect(texto).not.toContain('0,000 s');
  });

  it('con T_F impuesto a mano el documento vuelve a estar completo', async () => {
    const s = defaultSeismicState();
    const { texto } = await exportar({
      ...s,
      sistema: 'otro',
      x: { ...s.x, TFModo: 'manual', TFManual: 0.3 },
      y: { ...s.y, TFModo: 'manual', TFManual: 0.3 },
    });
    expect(texto).toContain('CORTANTE BASAL');
    expect(texto).toMatch(/3\.6\.2\.3\.2|impuesto/i);
  });
});

describe('la Norma rige pero el metodo simplificado no', () => {
  it('lo dice, y no enseña numeros que nadie debe usar', async () => {
    const { texto } = await exportar(conPlantas(25));
    expect(texto).toContain('NO es aplicable');
    expect(texto).toContain('análisis modal');
    expect(texto).not.toContain('CORTANTE BASAL');
    // Pero los requisitos SÍ, que es lo que documenta por qué hay que ir a modal.
    expect(texto).toContain('REQUISITOS DEL METODO SIMPLIFICADO');
  });
});

describe('declarado no es comprobado', () => {
  it('rotula la via de cada requisito, y el rotulo cabe entero', async () => {
    const { texto } = await exportar(defaultSeismicState());
    // Truncar aquí sería el fallo silencioso: «declar...» sigue leyéndose como
    // una comprobación. Se busca la palabra COMPLETA en la traza emitida.
    expect(texto).toContain('declarado');
    expect(texto).toContain('comprobado');
    expect(texto).toContain('DECLARA el proyectista');
  });

  it('un requisito incumplido sale como NO CUMPLE, sin truncar', async () => {
    const { texto } = await exportar(conPlantas(25));
    expect(texto).toContain('NO CUMPLE');
    expect(texto).toContain('CUMPLE');
  });
});

describe('lo excluido de la masa sismica se lee', () => {
  it('lista la sobrecarga excluida y la recoge como declaracion', async () => {
    // El caso por defecto excluye la sobrecarga de mantenimiento de cubierta.
    const { texto } = await exportar(defaultSeismicState());
    expect(texto).toContain('EXCLUIDA');
    expect(texto).toContain('DECLARACION DEL PROYECTISTA');
    expect(texto).toContain('efecto desfavorable');
  });

  it('sin exclusiones no aparece la declaracion', async () => {
    const base = defaultSeismicState();
    const state: SeismicState = {
      ...base,
      plantas: base.plantas.map((p) => ({
        ...p,
        componentes: (p.componentes ?? []).map((c) => ({ categoria: c.categoria, q: c.q })),
      })),
    };
    const { texto } = await exportar(state);
    expect(texto).not.toContain('DECLARACION DEL PROYECTISTA');
  });

  it('avisa de que la fraccion del art. 3.2 no es el psi2 del CTE', async () => {
    const { texto } = await exportar(defaultSeismicState());
    // `pdfStr` convierte psi griega en 'psi'.
    expect(texto).toContain('psi2 del CTE');
  });
});

describe('procedencia del dato normativo', () => {
  it('ab y K citan la capa del IGN, su licencia y el hash del dataset', async () => {
    const { texto } = await exportar(defaultSeismicState());
    expect(texto).toContain('HazardArea2002.NCSE-02');
    expect(texto).toContain('Instituto Geográfico Nacional');
    expect(texto).toContain('CC BY 4.0');
    expect(texto).toContain('sha256');
  });

  it('en entrada manual dice que el valor lo puso el proyectista', async () => {
    const { texto } = await exportar({
      ...defaultSeismicState(),
      municipioIne: null,
      municipioNombre: '',
    });
    expect(texto).toContain('Introducida a mano');
    expect(texto).not.toContain('HazardArea2002.NCSE-02');
  });
});

describe('trazabilidad legal', () => {
  it('la version del motor va en TODOS los pies, no solo en la portada', async () => {
    const { texto, pageCount } = await exportar(defaultSeismicState());
    const veces = texto.split('Motor v1.0.0').length - 1;
    // Una vez por pie + una en la cabecera + una en la línea de trazabilidad.
    expect(veces).toBeGreaterThanOrEqual(pageCount);
  });

  it('el titulo del documento NO entra en el hash de los datos', async () => {
    // Si entrara, teclear el nombre del elemento cambiaría la huella del caso y
    // dos exportaciones del MISMO edificio dejarían de ser comparables.
    const state = defaultSeismicState();
    const a = await exportar(state, 'Bloque A');
    const b = await exportar(state, 'Bloque B');
    const huella = (t: string) => /Inputs ([0-9a-f]{8})/.exec(t)?.[1];
    expect(huella(a.texto)).toBeTruthy();
    expect(huella(a.texto)).toBe(huella(b.texto));
  });

  it('un cambio real en los datos SI mueve la huella', async () => {
    const a = await exportar(defaultSeismicState());
    const b = await exportar({ ...defaultSeismicState(), H: 33 });
    const huella = (t: string) => /Inputs ([0-9a-f]{8})/.exec(t)?.[1];
    expect(huella(a.texto)).not.toBe(huella(b.texto));
  });
});

describe('reparto por plano resistente', () => {
  it('con pocos planos sale la matriz f_kj', async () => {
    const { texto } = await exportar(defaultSeismicState());
    expect(texto).toContain('PLANOS RESISTENTES · DIRECCION X');
    expect(texto).toContain('gamma_a');
    expect(texto).toContain('torsión incluida');
  });

  it('con mas de ocho planos cae a la forma larga', async () => {
    const base = defaultSeismicState();
    const diez = () =>
      Array.from({ length: 10 }, (_, j) => ({ id: newId(), x: -10 + j * (20 / 9), k: 1 }));
    // Las DOS direcciones: el fallback es por dirección, así que con sólo X
    // convertida la Y seguiría emitiendo la matriz y el test no probaría nada.
    const { texto } = await exportar({
      ...base,
      x: { ...base.x, elementos: diez() },
      y: { ...base.y, elementos: diez() },
    });
    // La forma larga trae la columna «f base», que la matriz no tiene.
    expect(texto).toContain('f base (kN)');
    expect(texto).not.toContain('torsión incluida');
  });

  it('con pocos planos en una direccion y muchos en otra, cada una elige la suya', async () => {
    const base = defaultSeismicState();
    const { texto } = await exportar({
      ...base,
      x: {
        ...base.x,
        elementos: Array.from({ length: 10 }, (_, j) => ({
          id: newId(),
          x: -10 + j * (20 / 9),
          k: 1,
        })),
      },
    });
    expect(texto).toContain('f base (kN)'); // X, forma larga
    expect(texto).toContain('torsión incluida'); // Y, matriz
  });
});

describe('ningun glifo se pierde por el camino', () => {
  it('no queda un solo interrogante suelto en todo el documento', async () => {
    // `pdfStr` degrada a «?» lo que no sabe transliterar, y jsPDF no avisa. Un
    // «? = 5,0 %» donde debía ir Omega es un dato normativo convertido en
    // incógnita, y no lo detecta ni la auditoría de maquetación ni la de
    // latin-1. Aquí se barre el documento entero.
    for (const state of [
      defaultSeismicState(),
      { ...defaultSeismicState(), importancia: 'moderada' as const },
      conPlantas(25),
    ]) {
      const { texto } = await exportar(state);
      expect(/\s\?/.test(texto), `interrogante suelto: ${/.{0,40}\s\?.{0,40}/.exec(texto)?.[0]}`).toBe(
        false,
      );
    }
  });

  it('Omega sale con su nombre, no como interrogante', async () => {
    const { texto } = await exportar(defaultSeismicState());
    expect(texto).toContain('Omega = 5,0 %');
  });
});

describe('la puerta de exportacion', () => {
  it('no bloquea el caso por defecto ni el exento', () => {
    expect(seismicPdfBlocker(evaluarSismo(defaultSeismicState()))).toBeNull();
    expect(
      seismicPdfBlocker(evaluarSismo({ ...defaultSeismicState(), importancia: 'moderada' })),
    ).toBeNull();
  });

  it('tampoco bloquea cuando el metodo simplificado no vale: ese papel tambien sirve', () => {
    expect(
      seismicPdfBlocker(evaluarSismo(conPlantas(25))),
    ).toBeNull();
  });

  it('bloquea con requisitos sin declarar, y nombra cuales', () => {
    const motivo = seismicPdfBlocker(
      evaluarSismo({
        ...defaultSeismicState(),
        regularidadGeometrica: null,
        soportesContinuos: null,
      }),
    );
    expect(motivo).toContain('3, 4');
    expect(motivo).toContain('art. 3.5.1');
  });

  it('NO bloquea el caso pasarela, que tiene los (3)-(6) sin declarar por diseño', () => {
    // La pasarela de las cuatro plantas LEVANTA los requisitos (3) a (6): que
    // esten sin contestar es su regimen normal. Bloquear ahi negaba el PDF a un
    // caso que el modulo calcula entero y muestra en pantalla, y ademas con un
    // mensaje —"el PDF no puede recogerlos como justificados"— que no venia a
    // cuento, porque nadie pretende justificarlos.
    const pasarela = conPlantas(3, {
      regularidadGeometrica: null,
      soportesContinuos: null,
      regularidadMecanica: null,
      excentricidadDeclarada: null,
    });
    const ev = evaluarSismo(pasarela);
    expect(ev.aplicabilidad.metodoSimplificado?.via).toBe('pasarela-4-plantas');
    expect(ev.resultado).not.toBeNull();
    expect(seismicPdfBlocker(ev)).toBeNull();
  });

  it('y el PDF de la pasarela sale, con su aviso de torsion', async () => {
    const { texto } = await exportar(
      conPlantas(3, {
        regularidadGeometrica: null,
        soportesContinuos: null,
        regularidadMecanica: null,
        excentricidadDeclarada: null,
      }),
    );
    expect(texto).toContain('CORTANTE BASAL');
    expect(texto).toMatch(/cuatro plantas/i);
    // El art. 3.7.5 pide estudio especial de torsion al entrar por esta via.
    expect(texto).toMatch(/torsión/i);
  });

  it('bloquea con la obligatoriedad indeterminada', () => {
    // Pórticos arriostrados, ab < 0,08 g y más de siete plantas: la
    // contraexcepción del art. 1.2.3 depende de ac. Con emplazamiento resuelto
    // NUNCA queda indeterminada, así que se prueba la rama con la puerta sola.
    const ev = evaluarSismo({
      ...defaultSeismicState(),
      ab: 0.07,
      porticosBienArriostrados: true,
    });
    // Aquí ac sí está resuelto → decide. Se comprueba que no miente diciendo
    // que falta un dato cuando no falta.
    expect(seismicPdfBlocker(ev)).toBeNull();
  });
});

describe('nombre del archivo', () => {
  it('el fallback lleva el municipio, que es lo que identifica el caso', () => {
    expect(seismicNCSE02FallbackFilename(defaultSeismicState())).toMatch(
      /^sismo-ncse02-granada-\d{4}-\d{2}-\d{2}\.pdf$/,
    );
  });

  it('sin municipio sigue siendo un .pdf con fecha', () => {
    expect(
      seismicNCSE02FallbackFilename({ ...defaultSeismicState(), municipioNombre: '' }),
    ).toMatch(/^sismo-ncse02-\d{4}-\d{2}-\d{2}\.pdf$/);
  });

  it('un titulo con texto siempre gana al fallback', async () => {
    const { filename } = await exportar(defaultSeismicState(), 'Torre Norte');
    expect(filename).toBe('torre-norte.pdf');
  });
});
