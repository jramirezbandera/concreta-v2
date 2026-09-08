/**
 * La unidad NO se escribe dentro de la fila de comprobación.
 *
 * Una fila con `value: \`${VEd.toFixed(1)} kN\`` se queda en el SI haga lo que
 * haga el conmutador, porque el texto ya viene montado del motor. La ruta buena
 * es la numérica —`valueNum` + `valueQty`—: el motor entrega el número EN SI y
 * su magnitud, y quien la pinta la convierte (`checkValueStr(check, system)`).
 * De regalo, el asistente de IA recibe un número y no el texto del usuario.
 *
 * Esta red no mira el código: monta los motores con sus valores por defecto,
 * pide las filas EN TÉCNICO y exige que no quede un símbolo del SI. Así da
 * igual por dónde llegue la unidad —el `value` legacy, un `valueStr`, la
 * descripción o el `tag`—: si se lee en pantalla, aquí se ve.
 */

import { describe, expect, it } from 'vitest';
import { checkLimitStr, checkValueStr } from '../../lib/calculations/checkFormat';
import type { CheckRow } from '../../lib/calculations/types';
import { calcForjados } from '../../lib/calculations/rcSlabs';
import { calcPileCap } from '../../lib/calculations/pileCap';
import { calcRetainingWall } from '../../lib/calculations/retainingWall';
import { calcMicropiles } from '../../lib/calculations/micropiles';
import { calcTimberBeam } from '../../lib/calculations/timberBeams';
import { calcTimberColumn } from '../../lib/calculations/timberColumns';
import { calcAnchorPlate } from '../../lib/calculations/anchorPlate';
import {
  forjadosDefaults,
  pileCapDefaults,
  retainingWallDefaults,
  micropilesDefaults,
  micropilesSoilDefaults,
  timberBeamDefaults,
  timberColumnDefaults,
  anchorPlateDefaults,
} from '../../data/defaults';

const SIMBOLOS_SI = /kN\/m³|kN\/m²|kN·m|kNm|kN\/m|kN\b|N\/mm²|kPa|MPa/;

/** Todo lo que una fila enseña, ya pintado en el sistema técnico. */
function textoDeFila(c: CheckRow): string[] {
  return [
    c.description,
    c.tag ?? '',
    checkValueStr(c, 'tecnico'),
    checkLimitStr(c, 'tecnico'),
  ].filter(Boolean);
}

function fugas(checks: CheckRow[]): string[] {
  // Un motor que no devuelve filas pasaría el test sin comprobar nada.
  expect(checks.length, 'el motor no devolvió ninguna fila que comprobar').toBeGreaterThan(3);
  return checks.flatMap(textoDeFila).filter((t) => SIMBOLOS_SI.test(t));
}

describe('Filas de comprobación — la unidad la pone el sistema, no el motor', () => {
  it('forjados: flexión de vano y apoyo, y los tres cortantes', () => {
    const r = calcForjados(forjadosDefaults);
    expect(fugas([...r.vano.checks, ...r.apoyo.checks, ...r.shearChecks])).toEqual([]);
  });

  it('encepados: reacción de pilote y las dos tensiones nodales', () => {
    expect(fugas(calcPileCap(pileCapDefaults).checks)).toEqual([]);
  });

  it('muros de contención: el momento por metro del fuste, la punta y el talón', () => {
    expect(fugas(calcRetainingWall(retainingWallDefaults).checks)).toEqual([]);
  });

  it('vigas de madera: las seis comprobaciones de tensión', () => {
    expect(fugas(calcTimberBeam(timberBeamDefaults).checks)).toEqual([]);
  });

  it('pilares de madera: cortante en frío y en incendio', () => {
    expect(fugas(calcTimberColumn(timberColumnDefaults).checks)).toEqual([]);
  });

  it('placas de anclaje: el motor recibe el sistema y lo usa hasta en los paréntesis', () => {
    expect(fugas(calcAnchorPlate(anchorPlateDefaults, 'tecnico').checks)).toEqual([]);
  });

  /**
   * La correlación de Stroud del pandeo —«su ≈ 6·N kPa»— se queda en el SI: la
   * constante 6 está DEFINIDA para kPa, así que convertir el resultado sin
   * tocar la fórmula la volvería falsa. Es una cita, como el articulado que
   * emite el motor de acciones, y `micropilesBuckling` es un motor puro que no
   * conoce el sistema de unidades. Se enumeran una a una a propósito:
   * cualquier OTRO símbolo del SI rompe el test.
   */
  const CITAS_EN_SI = [
    'E2: su no dado → su≈6·N=120.00 kPa (correlación NSPT), revisar.',
    'E3: su no dado → su≈6·N=210.00 kPa (correlación NSPT), revisar.',
  ];

  it('micropilotes: flexión, cortante y el Rfc que no se adopta', () => {
    const r = calcMicropiles(micropilesDefaults, micropilesSoilDefaults.map((l) => ({ ...l })));
    expect(fugas(r.checks)).toEqual([]);
    // Las hipótesis de pandeo van fuera de las filas, en su propia lista.
    expect(r.crHypotheses.map((h) => h.text).filter((t) => SIMBOLOS_SI.test(t))).toEqual(CITAS_EN_SI);
  });

  /**
   * El complemento del anterior: en el SI las filas dicen lo que decían. Sin
   * esto, un motor que devolviera cadenas vacías pasaría el test de arriba.
   */
  it('en el SI las mismas filas siguen rotulando en kN y N/mm²', () => {
    const madera = calcTimberBeam(timberBeamDefaults).checks;
    const flexion = madera.find((c) => c.id === 'bending')!;
    expect(checkValueStr(flexion, 'si')).toMatch(/N\/mm²$/);
    expect(checkValueStr(flexion, 'tecnico')).toMatch(/kg\/cm²$/);

    const forjado = calcForjados(forjadosDefaults);
    const cortante = forjado.shearChecks.find((c) => c.id === 'shear')!;
    expect(checkValueStr(cortante, 'si')).toMatch(/kN$/);
    expect(checkValueStr(cortante, 'tecnico')).toMatch(/Tn$/);

    // El muro por defecto va en modo dimensionado (sin armadura tecleada), que
    // es la rama donde la fila enseña el MEd por metro.
    const muro = calcRetainingWall(retainingWallDefaults).checks.find((c) => c.id === 'fuste-bending')!;
    expect(muro.valueQty, 'la fila del fuste ya no lleva el momento por metro').toBe('momentPerLength');
    expect(checkValueStr(muro, 'si')).toMatch(/kNm\/m$/);
    expect(checkValueStr(muro, 'tecnico')).toMatch(/mt\/m$/);
  });
});
