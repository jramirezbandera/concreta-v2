/**
 * Golden: los tres cuadros reales del estudio.
 *
 *   1. «cuadro  hormigon.png»  — cuadro de plano con 5 localizaciones (piscina)
 *   2. MEMORIA ABAYALDE        — el mismo cuadro transpuesto, obra en la costa
 *   3. «cuadro acero .png»     — acero estructural + forjados (obra de Málaga)
 *   4. «cuadro madera.png» + «acciones madera.png»
 *
 * Regla acordada para esta fase: **donde el cuadro del usuario y el Código
 * Estructural discrepen, manda el CE y la discrepancia se documenta aquí**. Los
 * bloques `DISCREPANCIA` de abajo no son fallos: son el inventario de lo que el
 * módulo va a cambiar respecto a los planos que el estudio viene entregando, y
 * cada uno lleva la referencia con la que defenderlo ante un visado.
 *
 * Hipótesis común: cemento CEM II/B-S. Ninguno de los cuadros declara el tipo
 * de cemento, y las tablas 44.2.1.1.a/b del CE dan recubrimientos distintos
 * según la familia. CEM II/B-S es la que reproduce los 30 mm de forjados y los
 * 50 mm de la piscina; con CEM I saldrían 25 y 50, y con «resto de cementos» la
 * piscina sería directamente inviable (casilla «*» de la tabla 44.2.1.1.b).
 */

import { describe, expect, it } from 'vitest';
import { deriveAcero, deriveHormigon, deriveMadera } from '../../lib/materiales/derive';
import {
  cuadroAceros,
  cuadroCoeficientesMinoracion,
  cuadroHormigonMemoria,
  cuadroHormigonPlano,
} from '../../lib/materiales/cuadros';
import { TIPIFICACION_HORMIGON_LIMPIEZA } from '../../lib/materiales/tablasCE';
import type { ElementoHormigon, GrupoMadera, OpcionesObra } from '../../lib/materiales/types';

const OBRA: OpcionesObra = {
  vidaUtil: 50,
  cemento: 'CEM II/B-S',
  nivelControlEjecucion: 'normal', // Δcdev = 10 mm
};

const base = {
  tipoHormigon: 'armado',
  fckEspecificada: 30,
  tamMaxArido: 20,
  nivelControl: 'estadistico',
} as const satisfies Partial<ElementoHormigon>;

// ── Oráculo 1: cuadro de plano con piscina ──────────────────────────────────

describe('cuadro de plano con piscina («cuadro  hormigon.png»)', () => {
  const muros: ElementoHormigon = {
    ...base,
    id: 'muros',
    nombre: 'Muros',
    situacion: { ubicacion: 'enterrado' },
    consistencia: 'blanda',
    contraTerreno: true,
  };
  const cimentacion: ElementoHormigon = {
    ...base,
    id: 'cimentacion',
    nombre: 'Cimentación',
    situacion: { ubicacion: 'enterrado' },
    consistencia: 'blanda',
    contraTerreno: true,
  };
  const forjados: ElementoHormigon = {
    ...base,
    id: 'forjados',
    nombre: 'Forjados',
    situacion: { ubicacion: 'interior_seco' },
    consistencia: 'fluida',
  };
  const piscina: ElementoHormigon = {
    ...base,
    id: 'piscina',
    nombre: 'Piscina',
    situacion: { ubicacion: 'enterrado', cloruros: 'piscina' },
    consistencia: 'fluida',
    hidrofugo: true,
  };

  const d = {
    muros: deriveHormigon(muros, OBRA),
    cimentacion: deriveHormigon(cimentacion, OBRA),
    forjados: deriveHormigon(forjados, OBRA),
    piscina: deriveHormigon(piscina, OBRA),
  };

  it('deriva las clases de exposición de la situación de obra, sin teclearlas', () => {
    expect(d.muros.clases).toEqual(['XC2']);
    expect(d.cimentacion.clases).toEqual(['XC2']);
    expect(d.forjados.clases).toEqual(['XC1']);
    // El vaso de la piscina está a la vez enterrado (XC2) y expuesto a cloruros
    // no marinos (XD2). El cuadro del usuario sólo rotula XD2 — ver DISCREPANCIA 5.
    expect(d.piscina.clases).toEqual(['XC2', 'XD2']);
  });

  it('resistencia de cálculo: 20,0 N/mm² en los cuatro', () => {
    for (const der of Object.values(d)) expect(der.fcd).toBeCloseTo(20.0, 6);
  });

  it('tipificación igual a la del plano en muros, cimentación y forjados', () => {
    expect(d.muros.tipificacion).toBe('HA-30/B/20/XC2');
    expect(d.cimentacion.tipificacion).toBe('HA-30/B/20/XC2');
    expect(d.forjados.tipificacion).toBe('HA-30/F/20/XC1');
  });

  it('dosificación igual a la del plano en XC1 y XC2: 275 kg y a/c 0,60', () => {
    expect(d.muros.cementoMin).toBe(275);
    expect(d.muros.acMax).toBe(0.6);
    expect(d.cimentacion.cementoMin).toBe(275);
    expect(d.cimentacion.acMax).toBe(0.6);
    expect(d.forjados.cementoMin).toBe(275);
    expect(d.forjados.acMax).toBe(0.6);
  });

  it('recubrimiento del plano reproducido en forjados (30 mm) y piscina (50 mm)', () => {
    expect(d.forjados.cnom).toBe(30); // XC1, cmin 20 + Δcdev 10
    expect(d.piscina.cnom).toBe(50); // XD2 con CEM II/B-S, cmin 40 + Δcdev 10
  });

  it('la nota «Contra el terreno: 70 mm» se emite sola en muros y cimentación', () => {
    expect(d.muros.notas.map((n) => n.texto)).toContain('Contra el terreno: 70 mm.');
    expect(d.cimentacion.notas.map((n) => n.texto)).toContain('Contra el terreno: 70 mm.');
    expect(d.forjados.notas).toHaveLength(0);
  });

  it('la nota de hormigón hidrófugo del vaso de la piscina se conserva', () => {
    expect(d.piscina.notas.map((n) => n.texto)).toContain('Se dispondrá hormigón hidrófugo.');
  });

  it('el cuadro de plano se compone con las columnas y el formato del oráculo', () => {
    const blocks = cuadroHormigonPlano([d.muros, d.cimentacion, d.forjados, d.piscina], [
      {
        nombre: 'Horm. limpieza y masa',
        tipificacion: TIPIFICACION_HORMIGON_LIMPIEZA,
        nivelControl: 'Según Capítulo 13 y 14',
      },
    ]);

    const tabla = blocks.find((b) => b.kind === 'table');
    expect(tabla).toBeDefined();
    if (tabla?.kind !== 'table') throw new Error('sin tabla');

    expect(tabla.head).toEqual([
      'Localización',
      'Tipificación',
      'Resistencia de cálculo',
      'Mín. contenido de cemento',
      'Máx. relación A/C',
      'Valor nominal recubrimientos',
      'Nivel de control',
      'γc',
    ]);
    expect(tabla.rows[2]).toEqual([
      'Forjados',
      'HA-30/F/20/XC1',
      '20,0 N/mm²',
      '275 kg',
      '0,60',
      '30 mm',
      'Estadístico',
      '1,5/1,3',
    ]);
    // La llamada de nota (*) va pegada al recubrimiento, como en el plano.
    // (El plano dice «35 mm (*)»; el CE da 30 — ver DISCREPANCIA 2.)
    expect(tabla.rows[0][5]).toBe('30 mm (*)');
    expect(tabla.rows[4][1]).toBe(TIPIFICACION_HORMIGON_LIMPIEZA);

    const notas = blocks.find((b) => b.kind === 'notes');
    if (notas?.kind !== 'notes') throw new Error('sin notas');
    expect(notas.items[0]).toBe('(*) Contra el terreno: 70 mm.');
  });

  describe('DISCREPANCIAS con el Código Estructural', () => {
    it('1 — el cuadro pide 275 kg de cemento en la piscina; el CE exige 325 para XD2', () => {
      // CE tabla 43.2.1.a, hormigón armado, columna XD2: 325 kg/m³.
      expect(d.piscina.cementoMin).toBe(325);
      expect(d.piscina.acMax).toBe(0.5); // esto sí coincide con el cuadro
    });

    it('2 — el cuadro pone 35 mm en muros XC2; el CE da 30 mm (cmin 20 + Δcdev 10)', () => {
      // Los 35 mm son herencia de la EHE-08 (ambiente IIa: 25 + 10). La tabla
      // 44.2.1.1.a del CE, con HA-30 y cemento distinto de CEM I, da cmin 20.
      expect(d.muros.cminDurabilidad).toBe(20);
      expect(d.muros.deltaCdev).toBe(10);
      expect(d.muros.cnom).toBe(30);
    });

    it('3 — el cuadro pone 50 mm en cimentación XC2; el CE da los mismos 30 mm', () => {
      // Los 50 mm son costumbre de estudio para cimentación, no prescripción.
      // El 70 mm contra el terreno sí es del CE y sale como nota.
      expect(d.cimentacion.cnom).toBe(30);
    });

    it('4 — el cuadro tipifica el hormigón de limpieza «HL[HM]-20/B/30/X0»; el CE sólo admite HL-150/C/TM', () => {
      // CE Anejo 10 §3: «el único hormigón utilizable para esta aplicación se
      // tipifica HL-150/C/TM», donde 150 es la dosificación mínima de cemento.
      expect(TIPIFICACION_HORMIGON_LIMPIEZA).toBe('HL-150/C/TM');
    });

    it('5 — el cuadro rotula la piscina sólo como XD2; el CE obliga a declarar todas las clases', () => {
      // CE 43.2.1: con varias clases se toma el criterio más exigente de cada
      // parámetro. El resultado numérico coincide con XD2 sola, pero la
      // designación del ambiente (CE 33.6, campo A) debe recogerlas todas.
      expect(d.piscina.tipificacion).toBe('HA-30/F/20/XC2+XD2');
    });
  });
});

// ── Oráculo 2: memoria ABAYALDE, obra en la costa ───────────────────────────

describe('memoria ABAYALDE — el modificador «obra en la costa»', () => {
  const OBRA_COSTA: OpcionesObra = { ...OBRA, costa: true };

  const muros: ElementoHormigon = {
    ...base,
    id: 'muros',
    nombre: 'Muros',
    situacion: { ubicacion: 'enterrado' },
    consistencia: 'blanda',
    contraTerreno: true,
    expuestoAireExterior: true, // tiene caras vistas: le entra el aerosol marino
  };
  const cimentacion: ElementoHormigon = {
    ...base,
    id: 'cimentacion',
    nombre: 'Cimentación',
    situacion: { ubicacion: 'enterrado' },
    consistencia: 'blanda',
    contraTerreno: true,
  };
  const forjados: ElementoHormigon = {
    ...base,
    id: 'forjados',
    nombre: 'Forjados',
    situacion: { ubicacion: 'interior_seco' },
    consistencia: 'fluida',
  };

  const dMuros = deriveHormigon(muros, OBRA_COSTA);
  const dCimentacion = deriveHormigon(cimentacion, OBRA_COSTA);
  const dForjados = deriveHormigon(forjados, OBRA_COSTA);

  it('el toggle endurece los muros a XS1 y deja en paz lo enterrado y lo interior', () => {
    expect(dMuros.clases).toEqual(['XC2', 'XS1']);
    expect(dCimentacion.clases).toEqual(['XC2']);
    expect(dForjados.clases).toEqual(['XC1']);
  });

  it('reproduce los 300 kg y a/c 0,50 de los muros de la memoria', () => {
    // Es el hallazgo del oráculo: en el mismo cuadro los muros llevan 300/0,50
    // y la cimentación 275/0,60. La diferencia es exactamente XS1.
    expect(dMuros.cementoMin).toBe(300);
    expect(dMuros.acMax).toBe(0.5);
    expect(dCimentacion.cementoMin).toBe(275);
    expect(dCimentacion.acMax).toBe(0.6);
  });

  it('reproduce los 40 mm de recubrimiento de las caras marinas de los muros', () => {
    // Tabla 44.2.1.1.b, XS1, CEM II/B-S, 50 años: cmin 30 → cnom 40.
    expect(dMuros.cminDurabilidad).toBe(30);
    expect(dMuros.cnom).toBe(40);
  });

  it('DISCREPANCIA 6 — la memoria dosifica para XS1 pero sigue tipificando XC2', () => {
    // CE 33.6: el campo A de la tipificación es la designación del ambiente
    // según la tabla 27.1.a. Si se dosifica para XS1, hay que declararlo.
    expect(dMuros.tipificacion).toBe('HA-30/B/20/XC2+XS1');
  });

  it('el cuadro de memoria es el mismo estado transpuesto: propiedades en filas', () => {
    // Es la segunda salida del módulo. El de plano lleva una fila por
    // localización; el de memoria, una fila por propiedad y una columna por
    // elemento, que es como lo escribe el .docx del estudio.
    const blocks = cuadroHormigonMemoria([dMuros, dCimentacion, dForjados]);
    const tabla = blocks.find((b) => b.kind === 'table');
    if (tabla?.kind !== 'table') throw new Error('sin tabla');

    expect(tabla.head).toEqual(['ELEMENTO ESTRUCTURAL', 'MUROS', 'CIMENTACIÓN', 'FORJADOS']);
    expect(tabla.rows.map((f) => f[0])).toEqual([
      'Tipificación',
      'Resistencia característica fck (N/mm²)',
      'Consistencia',
      'Tamaño máximo del árido (mm)',
      'Tipo de exposición',
      'Contenido mínimo de cemento (kg/m³)',
      'Máxima relación agua/cemento',
      'Recubrimiento nominal de las armaduras (mm)',
    ]);
    expect(tabla.rows[4]).toEqual(['Tipo de exposición', 'XC2 + XS1', 'XC2', 'XC1']);
    expect(tabla.rows[5]).toEqual(['Contenido mínimo de cemento (kg/m³)', '300', '275', '275']);
    expect(tabla.rows[6]).toEqual(['Máxima relación agua/cemento', '0,50', '0,60', '0,60']);
    // Las llamadas de nota viajan con el recubrimiento, que es la celda a la
    // que se refieren, igual que en el .docx del estudio. Los muros llevan dos:
    // el «contra el terreno» y la del recubrimiento por caras.
    expect(tabla.rows[7]).toEqual([
      'Recubrimiento nominal de las armaduras (mm)',
      '40 (*) (**)',
      '30 (**)',
      '30',
    ]);
  });

  it('avisa de que los 40 mm son de la cara marina y en el resto bastan 30', () => {
    // Es el «40 / 35» del cuadro real, dicho con los números del CE: 40 lo pide
    // XS1 y 30 basta donde sólo llega XC2. Sin esta nota, el plano pediría 40 mm
    // en toda la sección del muro.
    const nota = dMuros.notas.find((n) => n.texto.includes('caras no expuestas'));
    expect(nota?.texto).toContain('40 mm lo exige la clase XS1');
    expect(nota?.texto).toContain('bastaría 30 mm (XC2)');
    expect(nota?.columna).toBe('recubrimiento');
  });
});

// ── Oráculo 3: obra de Málaga, acero estructural ────────────────────────────

describe('obra de Málaga («cuadro acero .png»)', () => {
  it('CC2 + SC1 + PC1 dan clase de ejecución 2, como el cuadro', () => {
    const d = deriveAcero({
      nivelRiesgo: 'CC2',
      categoriaUso: 'SC1',
      categoriaEjecucion: 'PC1',
      elementos: [],
    });
    expect(d.claseEjecucion).toBe(2);
  });

  it('el bloque de forjados coincide con el CE en los cuatro valores', () => {
    const forjados = deriveHormigon(
      {
        ...base,
        id: 'forjados',
        nombre: 'Forjados',
        situacion: { ubicacion: 'interior_seco' },
        consistencia: 'fluida',
      },
      OBRA,
    );
    expect(forjados.tipificacion).toBe('HA-30/F/20/XC1');
    expect(forjados.fcd).toBeCloseTo(20.0, 6);
    expect(forjados.cementoMin).toBe(275);
    expect(forjados.acMax).toBe(0.6);
    expect(forjados.cnom).toBe(30);
  });

  it('las resistencias de cálculo del cuadro de aceros: 435 y 262 N/mm²', () => {
    const blocks = cuadroAceros({ aceroPasivo: 'B500SD', aceroEstructural: 'S275JR' });
    const tabla = blocks.find((b) => b.kind === 'table');
    if (tabla?.kind !== 'table') throw new Error('sin tabla');
    expect(tabla.rows).toEqual([
      ['Corrugado para armar', 'B 500 SD', '435 N/mm²', 'Normal', '1,15/1,00'],
      ['Acero estructural', 'S275 JR', '262 N/mm²', 'Normal', '1,05/1,00'],
    ]);
  });
});

// ── Oráculo 4: cuadros de madera ────────────────────────────────────────────

describe('cuadros de madera («cuadro madera.png» y «acciones madera.png»)', () => {
  const vigas: GrupoMadera = {
    id: 'vigas',
    nombre: 'Vigas y pilares (V y VP)',
    situacion: 'cubierto_abierto',
    tipo: 'laminada',
    claseResistente: 'GL24h',
    especie: 'Pinus sylvestris',
    claseLaminas: 'T14',
  };
  const correas: GrupoMadera = {
    id: 'correas',
    nombre: 'Correas y riostras (V2 y V3)',
    situacion: 'cubierto_abierto',
    tipo: 'maciza',
    claseResistente: 'C24',
    especie: 'Pinus pinaster',
    calidad: 'ME-1',
  };

  const dVigas = deriveMadera(vigas);
  const dCorreas = deriveMadera(correas);

  it('clase de servicio 2 (II en el cuadro) para ambos grupos', () => {
    expect(dVigas.claseServicio).toBe(2);
    expect(dCorreas.claseServicio).toBe(2);
  });

  it('γM: 1,25 en laminada encolada y 1,30 en aserrada; 1,00 en extraordinaria', () => {
    expect(dVigas.gammaM).toBe(1.25);
    expect(dCorreas.gammaM).toBe(1.3);
    expect(dVigas.gammaMExtraordinaria).toBe(1.0);
  });

  it('clase de uso 2 y tratamiento NP1, como el cuadro de durabilidad', () => {
    expect(dVigas.claseUso).toBe('2');
    expect(dVigas.nivelPenetracion).toBe('NP1');
  });

  it('la tabla de coeficientes de minoración del cuadro de acciones, con su columna de incendio', () => {
    const blocks = cuadroCoeficientesMinoracion({
      maderaLaminada: true,
      maderaMaciza: true,
      aceroLaminado: true,
      aceroDeArmar: true,
      hormigon: true,
    });
    const tabla = blocks.find((b) => b.kind === 'table');
    if (tabla?.kind !== 'table') throw new Error('sin tabla');
    expect(tabla.rows).toEqual([
      ['Madera laminada', '1,25', '1,00'],
      ['Madera maciza', '1,30', '1,00'],
      ['Acero laminado', '1,05', '1,00'],
      ['Acero de armar', '1,15', '1,00'],
      ['Hormigón', '1,50', '1,00'],
    ]);
  });

  it('DISCREPANCIA 7 — el cuadro anota sólo insecticida; en clase de uso 2 el DB SE-M pide también fungicida', () => {
    // DB SE-M tabla 3.1, nota (2): «el elemento de madera deberá recibir un
    // tratamiento superficial con un producto insecticida y fungicida».
    expect(dVigas.notas.join(' ')).toContain('insecticida y fungicida');
  });
});
