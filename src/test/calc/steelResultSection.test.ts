// `section` en el resultado de los dos motores de acero.
//
// Prerrequisito del bloque de propiedades de la UI: sin este campo el bloque
// no tiene de dónde leer. Y en la rama de CLASE 4 importa el doble — el aviso
// dice «elija un perfil más robusto» y enseñarlo con cero propiedades empuja
// al usuario de vuelta al prontuario, que es justo lo que la feature elimina.

import { describe, it, expect } from 'vitest';
import { calcSteelBeam } from '../../lib/calculations/steelBeams';
import { calcSteelColumn } from '../../lib/calculations/steelColumns';
import { steelColumnProfileLabel } from '../../lib/pdf/steelColumns';
import { steelBeamDefaults, steelColumnDefaults } from '../../data/defaults';

// CHS 508×5 en S275: D/t = 101.6 > 90·ε² = 76.9 ⇒ clase 4 en ambos motores.
const class4Tube = { chs_D: 508, chs_t: 5 } as const;

describe('SteelBeamResult.section', () => {
  it('presente en el resultado válido', () => {
    const r = calcSteelBeam(steelBeamDefaults);
    expect(r.valid).toBe(true);
    expect(r.section?.label).toBe('IPE 300');
  });

  it('presente en el resultado de clase 4', () => {
    const r = calcSteelBeam({ ...steelBeamDefaults, tipo: 'CHS', ...class4Tube, tube_process: 'hot-finished' });
    expect(r.valid).toBe(false);
    expect(r.governing).toBe('class4');
    expect(r.sectionClass).toBe(4);
    // Sin este label el PDF y el SVG caen al fallback `${tipo} ${size}`, que
    // en un tubo imprime "CHS 300": los tubos no usan `size`.
    expect(r.section?.label).toBe('Ø508×5 (EN 10210)');
  });

  it('ausente cuando createSection no resuelve nada', () => {
    const r = calcSteelBeam({ ...steelBeamDefaults, size: 999 });
    expect(r.valid).toBe(false);
    expect(r.section).toBeUndefined();
  });

  // El SVG de la sección y el label del PDF leen este mismo `label`: con
  // tipo = 'RHS' y h = b rotulaban SHS y desmentían al selector de familia.
  it('RHS con h = b conserva la familia declarada en el label', () => {
    const r = calcSteelBeam({ ...steelBeamDefaults, tipo: 'RHS', rhs_h: 100, rhs_b: 100, rhs_t: 8 });
    expect(r.section?.label).toBe('RHS 100×100×8 (EN 10219)');
  });

  it('SHS sigue rotulando SHS', () => {
    const r = calcSteelBeam({ ...steelBeamDefaults, tipo: 'SHS', rhs_h: 100, rhs_t: 8 });
    expect(r.section?.label).toBe('SHS 100×100×8 (EN 10219)');
  });
});

describe('SteelColumnResult.section', () => {
  it('presente en el resultado válido', () => {
    const r = calcSteelColumn(steelColumnDefaults);
    expect(r.valid).toBe(true);
    expect(r.section?.label).toBe('HEB 200');
  });

  it('presente en el resultado de clase 4', () => {
    const r = calcSteelColumn({
      ...steelColumnDefaults, sectionType: 'CHS', ...class4Tube, chs_process: 'hot-finished',
    });
    expect(r.valid).toBe(false);
    expect(r.sectionClass).toBe(4);
    expect(r.section?.label).toBe('Ø508×5 (EN 10210)');
  });

  it('ausente cuando createSection no resuelve nada', () => {
    const r = calcSteelColumn({ ...steelColumnDefaults, size: 999 });
    expect(r.valid).toBe(false);
    expect(r.section).toBeUndefined();
  });

  // En pilares el desacuerdo era además INTERNO: steelColumnProfileLabel (PDF)
  // ya rotulaba por familia declarada mientras el SVG leía este label.
  it('RHS con h = b conserva la familia declarada — el SVG y el PDF coinciden', () => {
    const inp = { ...steelColumnDefaults, sectionType: 'RHS' as const, rhs_h: 120, rhs_b: 120, rhs_t: 6 };
    const r = calcSteelColumn(inp);
    expect(r.section?.label).toBe('RHS 120×120×6 (EN 10219)');
    expect(steelColumnProfileLabel(inp)).toBe('RHS 120x120x6');
  });
});
