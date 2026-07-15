// Contrato estructural de los payloadSchema de TODOS los adapters del asistente.
//
// Las tres invariantes que rompen un proveedor si se violan:
// 1. `required` debe listar TODAS las properties (y ninguna más): el modo strict
//    de OpenAI exige required exhaustivo — una property fuera de required es un
//    400 en runtime que ningún test unitario del mapper detecta.
// 2. `additionalProperties: false` — mismo motivo.
// 3. Toda property salvo `warnings` debe ser NULLABLE (type con 'null', enum con
//    null, o anyOf con {type:'null'}): null = "sin cambio" es el contrato del
//    merge de propuestas y del prompt.
//
// Este test recorre los 16 adapters para que el próximo módulo no pueda
// olvidarse de una clave en required (el error solo se vería con una API key
// real de OpenAI).

import { describe, it, expect } from 'vitest';
import { steelBeamsAdapter } from '../../lib/ai/modules/steelBeams';
import { rcColumnsAdapter } from '../../lib/ai/modules/rcColumns';
import { isolatedFootingAdapter } from '../../lib/ai/modules/isolatedFooting';
import { compositeSectionAdapter } from '../../lib/ai/modules/compositeSection';
import { micropilesAdapter } from '../../lib/ai/modules/micropiles';
import { slopeStabilityAdapter } from '../../lib/ai/modules/slopeStability';
import { pileCapAdapter } from '../../lib/ai/modules/pileCap';
import { timberColumnsAdapter } from '../../lib/ai/modules/timberColumns';
import { timberBeamsAdapter } from '../../lib/ai/modules/timberBeams';
import { steelColumnsAdapter } from '../../lib/ai/modules/steelColumns';
import { empresalladoAdapter } from '../../lib/ai/modules/empresillado';
import { punchingAdapter } from '../../lib/ai/modules/punching';
import { rcBeamsAdapter } from '../../lib/ai/modules/rcBeams';
import { forjadosAdapter } from '../../lib/ai/modules/forjados';
import { retainingWallAdapter } from '../../lib/ai/modules/retainingWall';
import { anchorPlateAdapter } from '../../lib/ai/modules/anchorPlate';
import { masonryWallsAdapter } from '../../lib/ai/modules/masonryWalls';

const ADAPTERS = [
  steelBeamsAdapter, rcColumnsAdapter, isolatedFootingAdapter,
  compositeSectionAdapter, micropilesAdapter, slopeStabilityAdapter,
  pileCapAdapter, timberColumnsAdapter, timberBeamsAdapter,
  steelColumnsAdapter, empresalladoAdapter, punchingAdapter,
  rcBeamsAdapter, forjadosAdapter, retainingWallAdapter, anchorPlateAdapter,
  masonryWallsAdapter,
] as const;

interface SchemaLike {
  type?: unknown;
  required?: unknown;
  additionalProperties?: unknown;
  properties?: Record<string, Record<string, unknown>>;
}

function isNullable(prop: Record<string, unknown>): boolean {
  if (Array.isArray(prop.type) && prop.type.includes('null')) return true;
  if (Array.isArray(prop.enum) && prop.enum.includes(null)) return true;
  if (Array.isArray(prop.anyOf) && prop.anyOf.some(
    (s) => typeof s === 'object' && s !== null && (s as Record<string, unknown>).type === 'null',
  )) return true;
  return false;
}

describe.each(ADAPTERS.map((a) => [a.id, a] as const))('payloadSchema de %s', (_id, adapter) => {
  const schema = adapter.payloadSchema as SchemaLike;
  const props = schema.properties ?? {};
  const propKeys = Object.keys(props);
  const required = Array.isArray(schema.required) ? (schema.required as string[]) : [];

  it('required lista exactamente las properties (strict de OpenAI)', () => {
    expect([...required].sort()).toEqual([...propKeys].sort());
  });

  it('additionalProperties es false', () => {
    expect(schema.additionalProperties).toBe(false);
  });

  it('toda property salvo warnings/notes es nullable (null = sin cambio)', () => {
    const notNullable = propKeys.filter(
      (k) => k !== 'warnings' && k !== 'notes' && !isNullable(props[k]),
    );
    expect(notNullable).toEqual([]);
  });
});
