/**
 * Cargas por planta. Golden: el Excel del estudio
 * `0_evaluacion de cargas, fuego y recubrimientos 2.xlsx`, hoja «Evaluación
 * de cargas» («Estudio de Pintura en Espartinas»). Tres plantas con sus
 * permanentes, peso propio tecleado, SCU por VLOOKUP de la tabla 3.1 y
 * Gd/Qd/qd con 1,35/1,50. Reproducible ENTERO; la única DISCREPANCIA es que
 * la hoja anota «+1 kN/m² en escaleras y portales» y no lo aplica.
 *
 * Después, las reglas de la norma que la hoja no ejercita: el peso propio del
 * Anejo C, las notas de la tabla 3.1 (G por inclinación, ligera, F, escaleras,
 * balcones) y la combinación con nieve en cubiertas (DB SE 4.2.2).
 */

import { describe, expect, it } from 'vitest';
import {
  calcularCargas,
  combinarCubierta,
  familiaPsiDe,
  pesoPropioForjado,
  psiNieve,
  rotuloZona,
  sobrecargaUso,
  type CargasInput,
} from '../../lib/acciones/cargas';

/** La hoja tal cual: Primera (filas 12-22), Cubierta (23-32), Baja (36-43) y las cargas lineales (46-50). */
function espartinas(): CargasInput {
  return {
    altitud: 120,
    plantas: [
      {
        nombre: 'Planta Primera',
        esCubierta: false,
        zonas: [
          {
            forjado: { tipo: 'reticular', canto: 30, ppManual: 5 }, // E17 «Peso propio estructura forjado reticular»
            permanentes: [
              { concepto: 'Acabado de suelo', valor: 1 }, // E14
              { concepto: 'Tabiquerías', valor: 1 }, // E15
            ],
            uso: { categoria: 'A1' }, // B21
          },
        ],
      },
      {
        nombre: 'Planta Cubierta',
        esCubierta: true,
        zonas: [
          {
            forjado: { tipo: 'reticular', canto: 30, ppManual: 5 }, // E29
            permanentes: [{ concepto: 'Acabados de cubierta', valor: 2.5 }], // E25
            uso: { categoria: 'G', inclinacion: 0 }, // B32 «G1_ Cubiertas con inclinación inferior a 20º»
          },
        ],
      },
      {
        nombre: 'Planta Baja',
        esCubierta: false,
        zonas: [
          {
            forjado: { tipo: 'losa', canto: 60, ppManual: 15 }, // E40
            permanentes: [{ concepto: 'Acabados, solados y pavimentos', valor: 2 }], // E38
            uso: { categoria: 'A1' }, // B43
          },
        ],
      },
    ],
    lineales: [
      { concepto: 'Cerramientos de fachada', valor: 7 }, // E48
      { concepto: 'Cerramientos de vidrio', valor: 4 }, // E49
      { concepto: 'Barandillas', valor: 1 }, // E50
    ],
  };
}

describe('golden Excel de cargas — «Evaluación de cargas», Espartinas', () => {
  const r = calcularCargas(espartinas());
  const [primera, cubierta, baja] = r.plantas.map((p) => p.zonas[0]);

  it('sin errores ni avisos: todo tecleado como en la hoja', () => {
    expect(r.errores).toEqual([]);
    expect(r.avisos).toEqual([]);
  });

  it('Planta Primera: 2 + 5 = 7 → Gd 9,45; A1 = 2 → Qd 3; qd 12,45', () => {
    expect(primera.resto).toBe(2); // E16 «Total sin peso propio»
    expect(primera.forjado.pp).toBe(5); // E17
    expect(primera.forjado.ppOrigen).toBe('manual');
    expect(primera.G).toBe(7); // E19
    expect(primera.Gd).toBeCloseTo(9.45, 12); // H19 = E19·1,35
    expect(primera.uso.fila).toBe('A1');
    expect(primera.uso.qk).toBe(2); // E21 = VLOOKUP tabla 3.1
    expect(primera.uso.qUso).toBe(2);
    expect(primera.Qd).toBeCloseTo(3, 12); // H21 = E21·1,5
    expect(primera.qd).toBeCloseTo(12.45, 12); // J21 = H19 + H21
    expect(primera.hipotesis).toBe('uso');
    expect(primera.Q).toBe(2);
    expect(primera.nieve).toBeNull();
  });

  it('Planta Cubierta: 2,5 + 5 = 7,5 → Gd 10,125; G1 = 1 → Qd 1,5; qd 11,625', () => {
    expect(cubierta.resto).toBe(2.5); // E27
    expect(cubierta.G).toBe(7.5); // E30
    expect(cubierta.Gd).toBeCloseTo(10.125, 12); // H30
    expect(cubierta.uso.fila).toBe('G1');
    expect(cubierta.uso.qUso).toBe(1); // E32
    expect(cubierta.Qd).toBeCloseTo(1.5, 12); // H32
    expect(cubierta.qd).toBeCloseTo(11.625, 12); // J32
  });

  it('Planta Baja: 2 + 15 = 17 → Gd 22,95; A1 → qd 25,95', () => {
    expect(baja.G).toBe(17); // E41
    expect(baja.Gd).toBeCloseTo(22.95, 12); // H41
    expect(baja.qd).toBeCloseTo(25.95, 12); // J43
  });

  it('cargas lineales: cerramientos 7 → Gd 9,45; vidrio 4 → 5,4; barandillas 1 → 1,35', () => {
    expect(r.lineales.map((l) => l.gk)).toEqual([7, 4, 1]);
    expect(r.lineales[0].Gd).toBeCloseTo(9.45, 12); // H48
    expect(r.lineales[1].Gd).toBeCloseTo(5.4, 12);
    expect(r.lineales[2].Gd).toBeCloseTo(1.35, 12);
  });

  it('la nieve de la hoja (E54: 0,2 en Espartinas) no cambia la cubierta G1: manda el uso, 1 > 0,2', () => {
    const e = espartinas();
    e.plantas[1].nieve = 0.2;
    const c = calcularCargas(e).plantas[1].zonas[0];
    expect(c.nieve).toBe(0.2);
    expect(c.hipotesis).toBe('uso');
    expect(c.Q).toBe(1);
    expect(c.qd).toBeCloseTo(11.625, 12);
    // Y si la nieve pasara del uso, mandaría ella, sin sumar (nota 7).
    e.plantas[1].nieve = 1.2;
    const n = calcularCargas(e).plantas[1].zonas[0];
    expect(n.hipotesis).toBe('nieve');
    expect(n.Q).toBe(1.2);
    expect(n.qd).toBeCloseTo(10.125 + 1.8, 12);
  });

  it('DISCREPANCIA escaleras: la hoja anota «+1 kN/m² en escaleras y portales» (D22) y no lo aplica; el motor sí, si se marca', () => {
    const e = espartinas();
    e.plantas[0].zonas[0].uso = { categoria: 'A1', escalera: true };
    const z = calcularCargas(e).plantas[0].zonas[0];
    expect(z.uso.qk).toBe(2);
    expect(z.uso.incrementoEscaleras).toBe(1);
    expect(z.uso.qUso).toBe(3);
    expect(z.Qd).toBeCloseTo(4.5, 12);
    expect(z.qd).toBeCloseTo(13.95, 12);
  });

  it('notas: tabiquería (art. 2.1-3), la G no concomitante y los γ del DB SE', () => {
    expect(r.notas.some((n) => n.includes('art. 2.1-3'))).toBe(true);
    expect(r.notas.some((n) => n.includes('nota 7'))).toBe(true);
    expect(r.notas.some((n) => n.includes('γG = 1,35') && n.includes('γQ = 1,50'))).toBe(true);
    expect(r.notas.some((n) => n.includes('3.1.1-3'))).toBe(false);
    expect(r.gamma).toEqual({ G: 1.35, Q: 1.5, A: 1.0 });
  });

  it('ψ presentes: sólo A y G, en el orden de la tabla 4.2', () => {
    expect(r.psiPresentes.map((p) => p.clave)).toEqual(['A', 'G']);
    expect(r.psiPresentes[0].psi).toEqual({ psi0: 0.7, psi1: 0.5, psi2: 0.3 });
  });
});

describe('golden memorias del estudio — rótulos y sumas', () => {
  it('«Planta Baja (Vaso piscina)»: losa de 30 con 7,5 y 16 kN/m² de agua encima', () => {
    const r = calcularCargas({
      plantas: [
        {
          nombre: 'Planta Baja',
          esCubierta: false,
          zonas: [
            { nombre: 'Vivienda', forjado: { tipo: 'reticular', canto: 40, ppManual: 4.49 }, permanentes: [{ concepto: 'Resto', valor: 2.5 }], uso: { categoria: 'A1' } },
            { nombre: 'Vaso piscina', forjado: { tipo: 'losa', canto: 30, ppManual: 7.5 }, permanentes: [{ concepto: 'Agua (1,6 m)', valor: 16 }], uso: { categoria: 'A1' } },
          ],
        },
      ],
      lineales: [],
    });
    const [vivienda, vaso] = r.plantas[0].zonas;
    expect(vivienda.rotulo).toBe('Planta Baja (Vivienda)');
    expect(vivienda.forjado).toMatchObject({ tipo: 'reticular', canto: 40, pp: 4.49, ppOrigen: 'manual' });
    expect(vaso.rotulo).toBe('Planta Baja (Vaso piscina)');
    expect(vaso.resto).toBe(16);
    expect(vaso.G).toBe(23.5);
    expect(rotuloZona('Planta Baja')).toBe('Planta Baja');
    expect(rotuloZona('Planta Baja', '  ')).toBe('Planta Baja');
  });
});

describe('pesoPropioForjado — Anejo C', () => {
  it('losas y soleras: 25 kN/m³ por el canto', () => {
    expect(pesoPropioForjado({ tipo: 'losa', canto: 25 })).toMatchObject({ pp: 6.25, ppOrigen: 'densidad', fueraDeTabla: false });
    expect(pesoPropioForjado({ tipo: 'losa', canto: 35 })).toMatchObject({ pp: 8.75 }); // memoria Abayalde
    expect(pesoPropioForjado({ tipo: 'losa', canto: 50 })).toMatchObject({ pp: 12.5 }); // memoria Natalia
    expect(pesoPropioForjado({ tipo: 'solera', canto: 30 })).toMatchObject({ pp: 7.5, ppOrigen: 'densidad' });
  });

  it('reticular, unidireccional y chapa: el tramo de la tabla C.5 (grueso < tope), el último con aviso', () => {
    expect(pesoPropioForjado({ tipo: 'reticular', canto: 25 })).toMatchObject({ pp: 4, ppOrigen: 'tablaC5', fueraDeTabla: false });
    expect(pesoPropioForjado({ tipo: 'reticular', canto: 29 })).toMatchObject({ pp: 4, fueraDeTabla: false });
    expect(pesoPropioForjado({ tipo: 'reticular', canto: 30 })).toMatchObject({ pp: 5, fueraDeTabla: false }); // «< 0,30» no incluye 0,30
    expect(pesoPropioForjado({ tipo: 'reticular', canto: 35 })).toMatchObject({ pp: 5, fueraDeTabla: true });
    expect(pesoPropioForjado({ tipo: 'reticular', canto: 40 })).toMatchObject({ pp: 5, fueraDeTabla: true });
    expect(pesoPropioForjado({ tipo: 'unidireccional', canto: 25 })).toMatchObject({ pp: 3, fueraDeTabla: false });
    expect(pesoPropioForjado({ tipo: 'unidireccional', canto: 28 })).toMatchObject({ pp: 4, fueraDeTabla: false });
    expect(pesoPropioForjado({ tipo: 'unidireccional', canto: 30 })).toMatchObject({ pp: 4, fueraDeTabla: true });
    expect(pesoPropioForjado({ tipo: 'chapa', canto: 10 })).toMatchObject({ pp: 2, fueraDeTabla: false });
    expect(pesoPropioForjado({ tipo: 'chapa', canto: 12 })).toMatchObject({ pp: 2, fueraDeTabla: true });
  });

  it('madera y «otro» no tienen número en la norma; el tecleado manda siempre', () => {
    expect(pesoPropioForjado({ tipo: 'madera', canto: 0 })).toMatchObject({ pp: 0, ppOrigen: 'sinDato' });
    expect(pesoPropioForjado({ tipo: 'otro', canto: 0 })).toMatchObject({ pp: 0, ppOrigen: 'sinDato' });
    expect(pesoPropioForjado({ tipo: 'madera', canto: 0, ppManual: 1.2 })).toMatchObject({ pp: 1.2, ppOrigen: 'manual' });
    expect(pesoPropioForjado({ tipo: 'reticular', canto: 30, ppManual: 3.85 })).toMatchObject({ pp: 3.85, ppOrigen: 'manual', fueraDeTabla: false });
  });
});

describe('sobrecargaUso — tabla 3.1 y sus notas', () => {
  it('cubiertas G: G1 hasta 20º, interpolada hasta 40º, G2 desde 40º; ligera 0,4', () => {
    expect(sobrecargaUso({ categoria: 'G' })).toMatchObject({ fila: 'G1', qk: 1, qkConcentrada: 2, etiqueta: 'G1 — cubierta no transitable' });
    expect(sobrecargaUso({ categoria: 'G', inclinacion: 20 })).toMatchObject({ fila: 'G1', qk: 1 });
    expect(sobrecargaUso({ categoria: 'G', inclinacion: 30 })).toMatchObject({ fila: 'G1-G2', qk: 0.5, qkConcentrada: 2, etiqueta: 'G — cubierta a 30º (entre G1 y G2)' });
    expect(sobrecargaUso({ categoria: 'G', inclinacion: 35 }).qk).toBeCloseTo(0.25, 12);
    expect(sobrecargaUso({ categoria: 'G', inclinacion: 40 })).toMatchObject({ fila: 'G2', qk: 0, qkConcentrada: 2 });
    expect(sobrecargaUso({ categoria: 'G', inclinacion: 45 })).toMatchObject({ fila: 'G2', qk: 0 });
    expect(sobrecargaUso({ categoria: 'G', ligera: true })).toMatchObject({ fila: 'G1ligera', qk: 0.4, qkConcentrada: 1, etiqueta: 'G1 — cubierta ligera sobre correas' });
    expect(sobrecargaUso({ categoria: 'G', ligera: true, inclinacion: 30 }).qk).toBeCloseTo(0.2, 12);
    expect(sobrecargaUso({ categoria: 'G' }).psi).toEqual({ psi0: 0, psi1: 0, psi2: 0 });
  });

  it('F: 1 kN/m² y el ψ del uso desde el que se accede (nota 2)', () => {
    expect(sobrecargaUso({ categoria: 'F' })).toMatchObject({ fila: 'F', qk: 1, qkConcentrada: 2, familiaPsi: 'A' });
    expect(sobrecargaUso({ categoria: 'F', accesoDesde: 'C3' }).familiaPsi).toBe('C');
    expect(sobrecargaUso({ categoria: 'F', accesoDesde: 'C3' }).psi).toEqual({ psi0: 0.7, psi1: 0.7, psi2: 0.6 });
  });

  it('escaleras y portales: +1 sólo en A y B (art. 3.1.1-3)', () => {
    expect(sobrecargaUso({ categoria: 'A1', escalera: true })).toMatchObject({ qk: 2, qUso: 3, incrementoEscaleras: 1 });
    expect(sobrecargaUso({ categoria: 'A2', escalera: true })).toMatchObject({ qk: 3, qUso: 4 });
    expect(sobrecargaUso({ categoria: 'B', escalera: true })).toMatchObject({ qk: 2, qUso: 3 });
    expect(sobrecargaUso({ categoria: 'C1', escalera: true })).toMatchObject({ qk: 3, qUso: 3, incrementoEscaleras: 0 });
    expect(sobrecargaUso({ categoria: 'A1' })).toMatchObject({ qUso: 2, incrementoEscaleras: 0 });
  });

  it('balcones (art. 3.1.1-4) y usos adoptados (art. 3.1.1-5)', () => {
    expect(sobrecargaUso({ categoria: 'A1', balcon: true }).bordeBalcon).toBe(2);
    expect(sobrecargaUso({ categoria: 'A1' }).bordeBalcon).toBeUndefined();
    expect(sobrecargaUso({ categoria: 'otro', qkManual: 35 })).toMatchObject({ fila: 'otro', qk: 35, qUso: 35, qkConcentrada: null, etiqueta: 'valor adoptado', familiaPsi: 'A' });
    expect(sobrecargaUso({ categoria: 'otro', qkManual: 35, psiComo: 'D' }).familiaPsi).toBe('D');
    expect(sobrecargaUso({ categoria: 'otro', qkManual: 35, escalera: true }).qUso).toBe(35);
  });

  it('el resto de categorías, literal', () => {
    expect(sobrecargaUso({ categoria: 'C4' })).toMatchObject({ qk: 5, qkConcentrada: 7, etiqueta: 'C4 — gimnasios', familiaPsi: 'C' });
    expect(sobrecargaUso({ categoria: 'E' })).toMatchObject({ qk: 2, qkConcentrada: 20, familiaPsi: 'E' });
    expect(sobrecargaUso({ categoria: 'D2' })).toMatchObject({ qk: 5, qkConcentrada: 7, familiaPsi: 'D' });
  });
});

describe('ψ (DB SE tabla 4.2)', () => {
  it('familia por categoría', () => {
    const casos: [Parameters<typeof familiaPsiDe>[0], string][] = [
      [{ categoria: 'A1' }, 'A'],
      [{ categoria: 'A2' }, 'A'],
      [{ categoria: 'B' }, 'B'],
      [{ categoria: 'C4' }, 'C'],
      [{ categoria: 'D2' }, 'D'],
      [{ categoria: 'E' }, 'E'],
      [{ categoria: 'G' }, 'G'],
      [{ categoria: 'F' }, 'A'],
      [{ categoria: 'F', accesoDesde: 'D1' }, 'D'],
      [{ categoria: 'otro' }, 'A'],
      [{ categoria: 'otro', psiComo: 'E' }, 'E'],
    ];
    for (const [uso, familia] of casos) expect(familiaPsiDe(uso), JSON.stringify(uso)).toBe(familia);
  });

  it('nieve: fila baja hasta 1.000 m, alta por encima; sin altitud, baja y supuesta', () => {
    expect(psiNieve(660)).toMatchObject({ clave: 'nieveBaja', supuesta: false });
    expect(psiNieve(1000)).toMatchObject({ clave: 'nieveBaja' });
    expect(psiNieve(1001)).toMatchObject({ clave: 'nieveAlta', psi: { psi0: 0.7, psi1: 0.5, psi2: 0.2 } });
    expect(psiNieve()).toMatchObject({ clave: 'nieveBaja', supuesta: true });
  });
});

describe('combinarCubierta — DB SE 4.2.2', () => {
  it('sin nieve manda el uso; G con nieve: la mayor (no concomitantes)', () => {
    const sinNieve = combinarCubierta({ G: 6, qUso: 2, nieve: null, noConcomitante: false, psi0Uso: 0.7, psi0Nieve: 0.5 });
    expect(sinNieve).toMatchObject({ Q: 2, Qd: 3, hipotesis: 'uso' });
    expect(sinNieve.Gd).toBeCloseTo(8.1, 12);
    expect(sinNieve.qd).toBeCloseTo(11.1, 12);
    expect(combinarCubierta({ G: 6, qUso: 1, nieve: 0.56, noConcomitante: true, psi0Uso: 0, psi0Nieve: 0.5 })).toMatchObject({ Q: 1, hipotesis: 'uso' });
    expect(combinarCubierta({ G: 6, qUso: 1, nieve: 1.5, noConcomitante: true, psi0Uso: 0, psi0Nieve: 0.5 })).toMatchObject({ Q: 1.5, hipotesis: 'nieve', Qd: 2.25 });
  });

  it('F con nieve: la peor de uso + ψ0·nieve y nieve + ψ0·uso', () => {
    // Madrid (sk 0,56, plana) sobre una terraza de vivienda: 1 + 0,5·0,56 = 1,28 contra 0,56 + 0,7·1 = 1,26.
    const a = combinarCubierta({ G: 6, qUso: 1, nieve: 0.56, noConcomitante: false, psi0Uso: 0.7, psi0Nieve: 0.5 });
    expect(a.hipotesis).toBe('uso+nieve');
    expect(a.Q).toBeCloseTo(1.28, 12);
    expect(a.qd).toBeCloseTo(8.1 + 1.92, 12);
    // Con más nieve manda ella: 1 + 0,5 = 1,5 contra 1 + 0,7 = 1,7.
    const b = combinarCubierta({ G: 6, qUso: 1, nieve: 1, noConcomitante: false, psi0Uso: 0.7, psi0Nieve: 0.5 });
    expect(b.hipotesis).toBe('nieve+uso');
    expect(b.Q).toBeCloseTo(1.7, 12);
  });
});

describe('calcularCargas — composición, avisos y errores', () => {
  const zonaBase = () => ({ forjado: { tipo: 'reticular' as const, canto: 30 }, permanentes: [{ concepto: 'Solado', valor: 1 }], uso: { categoria: 'A1' as const } });

  it('la cubierta F con nieve y sin altitud avisa de los ψ supuestos; con G no hace falta', () => {
    const sinAltitud = calcularCargas({
      plantas: [{ nombre: 'Terraza', esCubierta: true, nieve: 0.5, zonas: [{ ...zonaBase(), uso: { categoria: 'F' } }] }],
      lineales: [],
    });
    expect(sinAltitud.avisos.some((a) => a.includes('altitud'))).toBe(true);
    expect(sinAltitud.plantas[0].zonas[0].psiNieve).toEqual({ psi0: 0.5, psi1: 0.2, psi2: 0 });
    expect(sinAltitud.psiPresentes.map((p) => p.clave)).toEqual(['A', 'nieveBaja']);
    const conG = calcularCargas({
      plantas: [{ nombre: 'Cubierta', esCubierta: true, nieve: 0.5, zonas: [{ ...zonaBase(), uso: { categoria: 'G' } }] }],
      lineales: [],
    });
    expect(conG.avisos).toEqual([]);
    const alta = calcularCargas({
      altitud: 1130,
      plantas: [{ nombre: 'Terraza', esCubierta: true, nieve: 2, zonas: [{ ...zonaBase(), uso: { categoria: 'F' } }] }],
      lineales: [],
    });
    expect(alta.psiPresentes.map((p) => p.clave)).toEqual(['A', 'nieveAlta']);
    expect(alta.plantas[0].zonas[0].hipotesis).toBe('nieve+uso');
  });

  it('la nieve sólo cuenta en cubiertas, y la nieve nula no pinta hipótesis', () => {
    const r = calcularCargas({
      plantas: [
        { nombre: 'P1', esCubierta: false, nieve: 0.5, zonas: [zonaBase()] },
        { nombre: 'Cubierta', esCubierta: true, nieve: 0, zonas: [{ ...zonaBase(), uso: { categoria: 'G' } }] },
      ],
      lineales: [],
    });
    expect(r.plantas[0].nieve).toBeNull();
    expect(r.plantas[0].zonas[0].nieve).toBeNull();
    expect(r.plantas[1].zonas[0]).toMatchObject({ nieve: 0, psiNieve: null, hipotesis: 'uso' });
    expect(r.psiPresentes.map((p) => p.clave)).toEqual(['A', 'G']);
  });

  it('avisos: canto fuera de la C.5, escaleras fuera de A/B, tabiquería pesada', () => {
    const r = calcularCargas({
      plantas: [
        { nombre: 'P1', esCubierta: false, zonas: [{ ...zonaBase(), forjado: { tipo: 'reticular', canto: 40 } }] },
        { nombre: 'P2', esCubierta: false, zonas: [{ ...zonaBase(), uso: { categoria: 'C3', escalera: true } }] },
        { nombre: 'P3', esCubierta: false, zonas: [{ ...zonaBase(), permanentes: [{ concepto: 'Tabiquería pesada', valor: 1.5 }] }] },
      ],
      lineales: [],
    });
    expect(r.errores).toEqual([]);
    expect(r.avisos).toHaveLength(3);
    expect(r.avisos[0]).toContain('«P1»');
    expect(r.avisos[0]).toContain('40 cm');
    expect(r.avisos[0]).toContain('5,00 kN/m²');
    expect(r.avisos[1]).toContain('«P2»');
    expect(r.avisos[1]).toContain('3.1.1-3');
    expect(r.plantas[1].zonas[0].uso.qUso).toBe(5);
    expect(r.avisos[2]).toContain('«P3»');
    expect(r.avisos[2]).toContain('2.1-3');
    expect(r.plantas[0].zonas[0].forjado).toMatchObject({ pp: 5, fueraDeTabla: true });
  });

  it('errores: sin plantas, sin zonas, sin peso propio, canto nulo, uso adoptado sin valor, negativos, inclinación', () => {
    expect(calcularCargas({ plantas: [], lineales: [] }).errores).toEqual(['Hace falta al menos una planta.']);
    const r = calcularCargas({
      plantas: [
        { nombre: 'Vacía', esCubierta: false, zonas: [] },
        { nombre: 'Madera', esCubierta: false, zonas: [{ ...zonaBase(), forjado: { tipo: 'madera', canto: 0 } }] },
        { nombre: 'Losa', esCubierta: false, zonas: [{ ...zonaBase(), forjado: { tipo: 'losa', canto: 0 } }] },
        { nombre: 'Trafo', esCubierta: false, zonas: [{ ...zonaBase(), uso: { categoria: 'otro' } }] },
        { nombre: 'Negativa', esCubierta: false, zonas: [{ ...zonaBase(), permanentes: [{ concepto: 'Solado', valor: -1 }] }] },
        { nombre: 'Cubierta', esCubierta: true, nieve: -0.1, zonas: [{ ...zonaBase(), uso: { categoria: 'G', inclinacion: 95 } }] },
        { nombre: 'PP', esCubierta: false, zonas: [{ ...zonaBase(), forjado: { tipo: 'reticular', canto: 30, ppManual: -1 } }] },
      ],
      lineales: [{ concepto: 'Peto', valor: -5 }],
    });
    expect(r.errores).toEqual([
      '«Vacía»: no tiene ninguna zona de carga.',
      '«Madera»: indique el peso propio del forjado; la norma no da un valor para este tipo.',
      '«Losa»: el canto del forjado tiene que ser mayor que cero.',
      '«Trafo»: indique la sobrecarga de uso adoptada.',
      '«Negativa»: «Solado» no puede ser negativa.',
      '«Cubierta»: la carga de nieve no puede ser negativa.',
      '«Cubierta»: la inclinación de la cubierta tiene que estar entre 0º y 90º.',
      '«PP»: el peso propio no puede ser negativo.',
      '«Peto»: una carga lineal no puede ser negativa.',
    ]);
  });

  it('notas según lo que hay: escaleras, balcones, interpolación G, F, uso adoptado', () => {
    const r = calcularCargas({
      plantas: [
        { nombre: 'P1', esCubierta: false, zonas: [{ ...zonaBase(), uso: { categoria: 'B', escalera: true, balcon: true } }] },
        { nombre: 'Terraza', esCubierta: true, zonas: [{ ...zonaBase(), uso: { categoria: 'F', accesoDesde: 'A1' } }] },
        { nombre: 'Tejado', esCubierta: true, zonas: [{ ...zonaBase(), uso: { categoria: 'G', inclinacion: 25 } }] },
        { nombre: 'CT', esCubierta: false, zonas: [{ ...zonaBase(), uso: { categoria: 'otro', qkManual: 35, psiComo: 'D' } }] },
      ],
      lineales: [],
    });
    const cita = (s: string) => r.notas.some((n) => n.includes(s));
    expect(cita('3.1.1-3')).toBe(true);
    expect(cita('3.1.1-4')).toBe(true);
    expect(cita('nota 3')).toBe(true);
    expect(cita('nota 2')).toBe(true);
    expect(cita('3.1.1-5')).toBe(true);
    expect(cita('art. 2.1-3')).toBe(false);
    expect(r.psiPresentes.map((p) => p.clave)).toEqual(['A', 'B', 'D', 'G']);
    expect(r.plantas[2].zonas[0].uso.qUso).toBeCloseTo(0.75, 12);
  });

  it('los ids viajan al resultado y los nombres vacíos reciben uno', () => {
    const r = calcularCargas({
      plantas: [{ id: 'p1', nombre: '  ', esCubierta: false, zonas: [{ id: 'z1', nombre: ' Terraza ', ...zonaBase() }] }],
      lineales: [{ id: 'l1', concepto: '', valor: 3 }],
    });
    expect(r.plantas[0]).toMatchObject({ id: 'p1', nombre: 'Planta' });
    expect(r.plantas[0].zonas[0]).toMatchObject({ id: 'z1', nombre: 'Terraza', rotulo: 'Planta (Terraza)' });
    expect(r.lineales[0]).toMatchObject({ id: 'l1', concepto: 'Carga lineal', gk: 3 });
  });
});
