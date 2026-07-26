// Bloque de propiedades de la sección — helper PURO sobre las 4 ramas de
// `SectionKind` (+ la variante SHS).
//
// Por qué se testea sin DOM: la tabla de etiquetas por familia es una cuestión
// de CORRECCIÓN, no de estética. Rotular "espesor de ala" en un tubo circular
// o pintar "radio de acuerdo: 0 mm" en un cajón de 2UPN es un error que acaba
// en un plano — el bloque existe para detallar la obra. Verificarlo
// renderizando sería verificar una rama por test; aquí se barren las cinco.

import { describe, it, expect } from 'vitest';
import {
  sectionPropertyRows,
  sectionHeaderLabel,
  type SectionPropertyRow,
} from '../../components/checks/sectionPropertyRows';
import { makeISectionBySize, makeUPNBoxBySize, makeCHS, makeRHS } from '../../lib/sections';
import type { SectionGeometry } from '../../lib/sections';

const ipe300 = makeISectionBySize('IPE', 300)!;
const ipe80 = makeISectionBySize('IPE', 80)!;
const heb200 = makeISectionBySize('HEB', 200)!;
const upn200 = makeUPNBoxBySize(200)!;
const chs168 = makeCHS(168.3, 8, 'hot-finished');
const rhs150 = makeRHS(150, 100, 8, 'cold-formed');
const shs100 = makeRHS(100, 100, 5, 'hot-finished');

const labels = (s: SectionGeometry) => sectionPropertyRows(s).map((r) => r.label);
const geom = (s: SectionGeometry) => sectionPropertyRows(s).filter((r) => r.group === 'geom');
const props = (s: SectionGeometry) => sectionPropertyRows(s).filter((r) => r.group === 'props');
const valueOf = (s: SectionGeometry, startsWith: string): string | undefined =>
  sectionPropertyRows(s).find((r) => r.label.startsWith(startsWith))?.value;

describe('sectionPropertyRows — recuento y etiquetas por familia', () => {
  it('perfil en I: 5 filas de geometría + 10 de propiedades', () => {
    expect(geom(ipe300)).toHaveLength(5);
    expect(props(ipe300)).toHaveLength(10);
    expect(labels(ipe300)).toEqual([
      'h — canto (mm)',
      'b — ancho de ala (mm)',
      'tf — espesor de ala (mm)',
      'tw — espesor de alma (mm)',
      'r — radio de acuerdo (mm)',
      'A (cm²)',
      'peso (kg/m, derivado)',
      'Iy (cm⁴)',
      'Iz (cm⁴)',
      'Wel,y (cm³)',
      'Wel,z (cm³, derivado)',
      'Wpl,y (cm³)',
      'Wpl,z (cm³, derivado)',
      'It (cm⁴)',
      'Iw (10³ cm⁶)',
    ]);
  });

  it('2UPN: sin fila de r (el adaptador lo fija a 0), b es la del cajón y añade b_UPN', () => {
    expect(geom(upn200)).toHaveLength(5);
    expect(props(upn200)).toHaveLength(9);
    expect(labels(upn200).some((l) => l.startsWith('r '))).toBe(false);
    expect(labels(upn200)).toContain('b — ancho del cajón (mm)');
    expect(labels(upn200)).toContain('b_UPN — ancho de cada UPN (mm)');
    // b_UPN = b/2 — la envolvente son las dos UPN espalda contra espalda.
    expect(valueOf(upn200, 'b_UPN')).toBe((upn200.b / 2).toFixed(1));
    expect(labels(upn200)).toContain('tf — espesor de ala UPN (mm)');
  });

  it('RHS: UNA sola fila de espesor (tf = tw = t) y el radio es el exterior', () => {
    expect(geom(rhs150)).toHaveLength(4);
    expect(props(rhs150)).toHaveLength(9);
    expect(labels(rhs150)).toContain('t — espesor de pared (mm)');
    expect(labels(rhs150)).toContain('r — radio exterior de esquina (mm)');
    expect(labels(rhs150).filter((l) => /espesor/.test(l))).toHaveLength(1);
    expect(labels(rhs150).some((l) => /ala|alma/.test(l))).toBe(false);
  });

  it('SHS: el lado se pinta UNA vez (3 filas de geometría)', () => {
    expect(geom(shs100)).toHaveLength(3);
    expect(labels(shs100)).toContain('a — lado exterior (mm)');
    expect(labels(shs100).some((l) => l.startsWith('h —') || l.startsWith('b —'))).toBe(false);
  });

  it('CHS: D y t, sin radio y sin nomenclatura de ala/alma', () => {
    expect(geom(chs168)).toHaveLength(2);
    expect(labels(chs168)).toEqual([
      'D — diámetro exterior (mm)',
      't — espesor de pared (mm)',
      'A (cm²)',
      'peso (kg/m, derivado)',
      'I (cm⁴)',
      'Wel (cm³)',
      'Wpl (cm³)',
      'It (cm⁴)',
    ]);
  });

  it('Iw solo aparece donde existe: cerrada ⇒ Iw = 0 ⇒ sin fila', () => {
    expect(labels(ipe300)).toContain('Iw (10³ cm⁶)');
    for (const closed of [upn200, rhs150, shs100, chs168]) {
      expect(closed.Iw).toBe(0);
      expect(labels(closed).some((l) => l.startsWith('Iw'))).toBe(false);
    }
  });

  it('CHS colapsa los tres pares axisimétricos en una fila cada uno', () => {
    const ls = labels(chs168);
    expect(ls.filter((l) => l.startsWith('I ('))).toHaveLength(1);
    expect(ls.filter((l) => l.startsWith('Wel'))).toHaveLength(1);
    expect(ls.filter((l) => l.startsWith('Wpl'))).toHaveLength(1);
    expect(ls.some((l) => /,y|,z/.test(l))).toBe(false);
  });
});

describe('sectionPropertyRows — peso derivado contra oráculo de catálogo', () => {
  // ρ = 7850 kg/m³ ⇒ peso [kg/m] = A [cm²] · 0.785. Tolerancia ~1%: el
  // catálogo redondea el peso publicado.
  const weight = (s: SectionGeometry) => Number(valueOf(s, 'peso'));

  it.each([
    ['IPE 300', ipe300, 42.2],
    ['HEB 200', heb200, 61.3],
    ['CHS 168.3×8', chs168, 31.6],
  ])('%s → %s kg/m', (_name, section, oracle) => {
    expect(weight(section as SectionGeometry)).toBeCloseTo(oracle, 1);
  });
});

describe('sectionPropertyRows — formato', () => {
  it('It con 2 decimales por debajo de 10: IPE 80 sale 0.70, no 1', () => {
    expect(valueOf(ipe80, 'It')).toBe('0.70');
    expect(valueOf(ipe300, 'It')).toBe('20.1');
  });

  it('Iw se expresa en 10³ cm⁶: IPE 300 → 125.9', () => {
    expect(ipe300.Iw).toBe(125900);
    expect(valueOf(ipe300, 'Iw')).toBe('125.9');
  });

  it('Wel/Wpl: 1 decimal por debajo de 100, 0 por encima', () => {
    expect(valueOf(ipe80, 'Wel,y')).toBe('20.0');
    expect(valueOf(ipe300, 'Wel,y')).toBe('557');
  });

  it('la unidad vive en la etiqueta — ningún valor la lleva', () => {
    for (const s of [ipe300, upn200, rhs150, shs100, chs168]) {
      for (const row of sectionPropertyRows(s)) {
        expect(row.value).toMatch(/^-?[\d.]+$/);
      }
    }
  });
});

describe('sectionPropertyRows — marca de derivado', () => {
  const derived = (s: SectionGeometry): SectionPropertyRow[] =>
    sectionPropertyRows(s).filter((r) => r.derived);

  it('en perfil en I: peso, Wel,z y Wpl,z (el catálogo no trae los débiles)', () => {
    expect(derived(ipe300).map((r) => r.label)).toEqual([
      'peso (kg/m, derivado)',
      'Wel,z (cm³, derivado)',
      'Wpl,z (cm³, derivado)',
    ]);
  });

  it('en 2UPN / RHS / SHS / CHS: SOLO el peso', () => {
    // No porque allí las propiedades sean de catálogo (no lo son: se derivan
    // todas), sino porque la marca señala CONTRASTE con hermanas de catálogo
    // y en esas familias no hay ninguna.
    for (const s of [upn200, rhs150, shs100, chs168]) {
      expect(derived(s).map((r) => r.label)).toEqual(['peso (kg/m, derivado)']);
    }
  });

  it('la marca viaja en la etiqueta, no en un prop nuevo del ValueRow', () => {
    for (const row of sectionPropertyRows(ipe300)) {
      expect(row.label.includes('derivado')).toBe(row.derived === true);
    }
  });
});

describe('sectionHeaderLabel — prefijo de familia solo en CHS', () => {
  it('CHS: el label del adaptador no dice "CHS" — la cabecera sí', () => {
    expect(chs168.label).toBe('Ø168.3×8 (EN 10210)');
    expect(sectionHeaderLabel(chs168)).toBe('CHS Ø168.3×8 (EN 10210)');
  });

  it('las otras tres ramas se pintan tal cual, sin duplicar el token de familia', () => {
    for (const s of [ipe300, upn200, rhs150, shs100]) {
      const header = sectionHeaderLabel(s);
      expect(header).toBe(s.label);
      const family = header.split(' ')[0];
      expect(header.split(' ').filter((tok) => tok === family)).toHaveLength(1);
    }
    // El adaptador de tubo rectangular YA distingue SHS de RHS él mismo.
    expect(sectionHeaderLabel(shs100).startsWith('SHS ')).toBe(true);
    expect(sectionHeaderLabel(rhs150).startsWith('RHS ')).toBe(true);
  });
});
