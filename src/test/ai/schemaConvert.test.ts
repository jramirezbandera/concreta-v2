import { describe, expect, it } from 'vitest';
import {
  ANTHROPIC_UNION_LIMIT,
  countAnthropicUnions,
  exceedsAnthropicUnionLimit,
  toAnthropicSchema,
  toOpenAiSchema,
} from '../../lib/ai/providers/schemaConvert';
import { STEEL_BEAM_EXTRACTION_SCHEMA } from '../../lib/ai/schema';
import { buildChatSchema } from '../../lib/ai/chatSchema';
import { steelBeamsAdapter } from '../../lib/ai/modules/steelBeams';
import { isolatedFootingAdapter } from '../../lib/ai/modules/isolatedFooting';
import { masonryWallsAdapter } from '../../lib/ai/modules/masonryWalls';
import { punchingAdapter } from '../../lib/ai/modules/punching';
import { timberBeamsAdapter } from '../../lib/ai/modules/timberBeams';

/**
 * Envelope de chat transcrito del contrato `buildChatSchema` del plan.
 * NO se importa `chatSchema.ts` (lo escribe otra tarea en paralelo): aquí solo
 * interesa la FORMA anidada (payload dentro de `proposal.anyOf[0]`).
 */
function buildChatEnvelope(payloadSchema: Record<string, unknown>): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['reply', 'proposal'],
    properties: {
      reply: {
        type: 'string',
        description: 'Respuesta conversacional breve en español (máx ~80 palabras). Sin JSON ni markdown.',
      },
      proposal: {
        anyOf: [payloadSchema, { type: 'null' }],
        description:
          'Propuesta de datos SOLO si este turno aporta datos nuevos o corregidos; null en turnos puramente conversacionales. Campos no mencionados → null (significa "sin cambio").',
      },
    },
  };
}

/** Walker recursivo: recoge TODOS los nodos-objeto del árbol (properties, items, ramas anyOf). */
function collectNodes(node: unknown, acc: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(node)) {
    for (const item of node) collectNodes(item, acc);
    return acc;
  }
  if (typeof node !== 'object' || node === null) return acc;
  const record = node as Record<string, unknown>;
  acc.push(record);
  if (typeof record.properties === 'object' && record.properties !== null) {
    for (const value of Object.values(record.properties)) collectNodes(value, acc);
  }
  collectNodes(record.items, acc);
  collectNodes(record.anyOf, acc);
  return acc;
}

function propsOf(schema: Record<string, unknown>): Record<string, Record<string, unknown>> {
  return schema.properties as Record<string, Record<string, unknown>>;
}

/** Enum de `tipo` sin null (I/H/IPN + cajón 2UPN + tubos SHS/RHS/CHS). */
const TIPO_ENUM = ['IPE', 'HEA', 'HEB', 'IPN', '2UPN', 'SHS', 'RHS', 'CHS'];

// El validador de Anthropic rechaza `type` como array (400 "Enum value 'IPE'
// does not match declared type"); estos tests fijan la conversión a `anyOf`.
describe('toAnthropicSchema', () => {
  const converted = toAnthropicSchema(STEEL_BEAM_EXTRACTION_SCHEMA);
  const props = propsOf(converted);

  it('convierte enums anulables a anyOf con enum sin null y rama type:null', () => {
    expect(props.tipo).toEqual({
      anyOf: [
        { type: 'string', enum: TIPO_ENUM },
        { type: 'null' },
      ],
      description: expect.stringContaining('Familia del perfil'),
    });
    const deflLimit = props.deflLimit as { anyOf: [{ type: string; enum: number[] }, { type: string }] };
    expect(deflLimit.anyOf[0]).toEqual({ type: 'integer', enum: [250, 300, 400, 500, 600] });
    expect(deflLimit.anyOf[1]).toEqual({ type: 'null' });
  });

  it('convierte campos anulables sin enum a anyOf tipado + null', () => {
    const lm = props.L_m as { anyOf: unknown[]; description: string };
    expect(lm.anyOf).toEqual([{ type: 'number' }, { type: 'null' }]);
    expect(lm.description).toContain('METROS');
  });

  it('no toca campos no anulables ni la estructura raíz', () => {
    expect(props.warnings).toEqual(
      (STEEL_BEAM_EXTRACTION_SCHEMA.properties as Record<string, unknown>).warnings,
    );
    expect(converted.type).toBe('object');
    expect(converted.additionalProperties).toBe(false);
    expect(converted.required).toEqual(STEEL_BEAM_EXTRACTION_SCHEMA.required);
  });

  it('ninguna propiedad convertida conserva type como array', () => {
    for (const prop of Object.values(props)) {
      expect(Array.isArray(prop.type)).toBe(false);
    }
  });

  it('no muta el schema canónico', () => {
    const tipo = (STEEL_BEAM_EXTRACTION_SCHEMA.properties as Record<string, Record<string, unknown>>).tipo;
    expect(tipo.type).toEqual(['string', 'null']);
    expect(tipo.enum).toContain(null);
  });

  it('convierte el envelope anidado a cualquier profundidad (riesgo #1)', () => {
    const envelope = buildChatEnvelope(STEEL_BEAM_EXTRACTION_SCHEMA);
    const convertedEnvelope = toAnthropicSchema(envelope);
    const nodes = collectNodes(convertedEnvelope);

    // Invariante: cero type-arrays y cero null dentro de enum, a CUALQUIER profundidad.
    for (const node of nodes) {
      expect(Array.isArray(node.type)).toBe(false);
      if (Array.isArray(node.enum)) {
        expect(node.enum).not.toContain(null);
      }
    }

    const proposal = propsOf(convertedEnvelope).proposal;
    const anyOf = proposal.anyOf as Record<string, unknown>[];
    expect(anyOf).toHaveLength(2);
    // La rama {type:'null'} de proposal sobrevive intacta.
    expect(anyOf[1]).toEqual({ type: 'null' });

    // Los enums anidados del payload quedaron sin null y convertidos a anyOf.
    const payloadProps = propsOf(anyOf[0] as Record<string, unknown>);
    expect(payloadProps.tipo).toEqual({
      anyOf: [
        { type: 'string', enum: TIPO_ENUM },
        { type: 'null' },
      ],
      description: expect.stringContaining('Familia del perfil'),
    });
    expect(payloadProps.L_m).toEqual({
      anyOf: [{ type: 'number' }, { type: 'null' }],
      description: expect.stringContaining('METROS'),
    });
    // reply (no anulable) queda intacto.
    expect(propsOf(convertedEnvelope).reply).toEqual(propsOf(envelope).reply);
  });

  it('convierte booleanos anulables anidados (loadsAreFactored)', () => {
    const schema: Record<string, unknown> = {
      type: 'object',
      properties: {
        options: {
          type: 'object',
          properties: {
            loadsAreFactored: { type: ['boolean', 'null'], description: 'Cargas ya mayoradas.' },
          },
        },
      },
    };
    const convertedSchema = toAnthropicSchema(schema);
    const options = propsOf(convertedSchema).options;
    expect(propsOf(options).loadsAreFactored).toEqual({
      anyOf: [{ type: 'boolean' }, { type: 'null' }],
      description: 'Cargas ya mayoradas.',
    });
  });

  it('recorre items de arrays', () => {
    const schema: Record<string, unknown> = {
      type: 'object',
      properties: {
        list: {
          type: 'array',
          items: { type: ['string', 'null'], enum: ['a', 'b', null] },
        },
      },
    };
    const convertedSchema = toAnthropicSchema(schema);
    expect(propsOf(convertedSchema).list.items).toEqual({
      anyOf: [{ type: 'string', enum: ['a', 'b'] }, { type: 'null' }],
    });
  });
});

// OpenAI strict admite `type` como array pero no `null` dentro de `enum`;
// estos tests fijan el filtrado recursivo sin tocar los type-arrays.
describe('toOpenAiSchema', () => {
  it('filtra null de los enums del primer nivel conservando el type array', () => {
    const converted = toOpenAiSchema(STEEL_BEAM_EXTRACTION_SCHEMA);
    const props = propsOf(converted);
    expect(props.tipo.enum).toEqual(TIPO_ENUM);
    expect(props.tipo.type).toEqual(['string', 'null']);
    expect(props.deflLimit.enum).toEqual([250, 300, 400, 500, 600]);
    // Campos sin enum quedan intactos.
    expect(props.L_m).toEqual(
      (STEEL_BEAM_EXTRACTION_SCHEMA.properties as Record<string, Record<string, unknown>>).L_m,
    );
    expect(props.warnings).toEqual(
      (STEEL_BEAM_EXTRACTION_SCHEMA.properties as Record<string, unknown>).warnings,
    );
  });

  it('filtra enums anidados a cualquier profundidad recorriendo las ramas anyOf', () => {
    const envelope = buildChatEnvelope(STEEL_BEAM_EXTRACTION_SCHEMA);
    const converted = toOpenAiSchema(envelope);
    const nodes = collectNodes(converted);

    // Cero null dentro de enum a cualquier profundidad; type-arrays CONSERVADOS.
    for (const node of nodes) {
      if (Array.isArray(node.enum)) {
        expect(node.enum).not.toContain(null);
      }
    }
    const proposal = propsOf(converted).proposal;
    const payload = (proposal.anyOf as Record<string, unknown>[])[0] as Record<string, unknown>;
    const payloadProps = propsOf(payload);
    expect(payloadProps.tipo.type).toEqual(['string', 'null']);
    expect(payloadProps.tipo.enum).toEqual(TIPO_ENUM);
    expect(payloadProps.deflLimit.type).toEqual(['integer', 'null']);
    expect(payloadProps.deflLimit.enum).toEqual([250, 300, 400, 500, 600]);
    // La rama {type:'null'} de proposal sobrevive.
    expect((proposal.anyOf as unknown[])[1]).toEqual({ type: 'null' });
  });

  it('recorre items de arrays', () => {
    const schema: Record<string, unknown> = {
      type: 'object',
      properties: {
        list: {
          type: 'array',
          items: { type: ['string', 'null'], enum: ['a', 'b', null] },
        },
      },
    };
    const converted = toOpenAiSchema(schema);
    expect(propsOf(converted).list.items).toEqual({
      type: ['string', 'null'],
      enum: ['a', 'b'],
    });
  });
});

describe('no-mutación profunda', () => {
  it('ninguno de los conversores muta el canónico ni el envelope', () => {
    const canonicalBefore = JSON.stringify(STEEL_BEAM_EXTRACTION_SCHEMA);
    const envelope = buildChatEnvelope(STEEL_BEAM_EXTRACTION_SCHEMA);
    const envelopeBefore = JSON.stringify(envelope);

    toAnthropicSchema(STEEL_BEAM_EXTRACTION_SCHEMA);
    toOpenAiSchema(STEEL_BEAM_EXTRACTION_SCHEMA);
    toAnthropicSchema(envelope);
    toOpenAiSchema(envelope);

    expect(JSON.stringify(STEEL_BEAM_EXTRACTION_SCHEMA)).toBe(canonicalBefore);
    expect(JSON.stringify(envelope)).toBe(envelopeBefore);
  });
});

// ── Arrays de OBJETOS en el payload (ola 3: plates/strata/loads/soil) ─────────
// Hasta ahora solo se probaban `items` hoja (enum). Los payloads de ola 3
// anidan array → objeto → propiedades nullables con enum+null: la conversión
// debe llegar a esa profundidad por los DOS conversores.

const ARRAY_OF_OBJECTS_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['strata'],
  properties: {
    strata: {
      type: ['array', 'null'],
      description: 'Estratos de arriba hacia abajo. REEMPLAZA la lista entera.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'thickness_m', 'su_kPa'],
        properties: {
          type: { type: 'string', enum: ['granular', 'cohesive'] },
          thickness_m: { type: 'number', description: 'Espesor en m.' },
          su_kPa: { type: ['number', 'null'], description: 'Solo cohesivos.' },
        },
      },
    },
  },
};

describe('conversión de arrays de objetos (ola 3)', () => {
  it('toAnthropicSchema convierte los type-arrays DENTRO de los items del array', () => {
    const converted = toAnthropicSchema(ARRAY_OF_OBJECTS_SCHEMA);
    const strata = propsOf(converted).strata as Record<string, unknown>;
    // el propio campo array nullable → anyOf
    expect(strata.anyOf).toBeDefined();
    const arrayBranch = (strata.anyOf as Record<string, unknown>[])
      .find((b) => b.type === 'array') as Record<string, unknown>;
    expect(arrayBranch).toBeDefined();
    const items = arrayBranch.items as Record<string, unknown>;
    const itemProps = propsOf(items);
    // hoja nullable dentro del objeto del array → anyOf
    expect(itemProps.su_kPa).toEqual({
      anyOf: [{ type: 'number' }, { type: 'null' }],
      description: 'Solo cohesivos.',
    });
    // hojas no-nullables intactas
    expect(itemProps.type).toEqual({ type: 'string', enum: ['granular', 'cohesive'] });
    expect(itemProps.thickness_m).toEqual({ type: 'number', description: 'Espesor en m.' });
  });

  it('toOpenAiSchema conserva type-arrays y filtra null de enums DENTRO de los items', () => {
    const withNullEnum: Record<string, unknown> = JSON.parse(JSON.stringify(ARRAY_OF_OBJECTS_SCHEMA));
    const strataDef = (withNullEnum.properties as Record<string, Record<string, unknown>>).strata;
    const items = strataDef.items as Record<string, Record<string, unknown>>;
    (items.properties as Record<string, Record<string, unknown>>).type = {
      type: ['string', 'null'],
      enum: ['granular', 'cohesive', null],
    };
    const converted = toOpenAiSchema(withNullEnum);
    const strata = propsOf(converted).strata as Record<string, unknown>;
    expect(strata.type).toEqual(['array', 'null']);
    const convertedItems = strata.items as Record<string, unknown>;
    const itemProps = propsOf(convertedItems);
    expect(itemProps.type.type).toEqual(['string', 'null']);
    expect(itemProps.type.enum).toEqual(['granular', 'cohesive']);
    expect(itemProps.su_kPa).toEqual({ type: ['number', 'null'], description: 'Solo cohesivos.' });
  });
});

// ── Tope de uniones de Anthropic (degradación de módulos grandes) ─────────────
// Anthropic rechaza (400) los esquemas con >16 parámetros de unión. El conteo
// de `countAnthropicUnions` coincide EXACTAMENTE con el de la API (verificado en
// vivo 2026-07-15: footing=23→400 "22 params"+proposal, punching=28→400,
// masonry=16→200, composite=16→200). El predicado gobierna la degradación en UI.
describe('límite de uniones de Anthropic', () => {
  /** Envelope con `n` campos anulables (buildChatSchema añade la unión de proposal). */
  const envelopeWith = (n: number): Record<string, unknown> => {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (let i = 0; i < n; i++) {
      properties[`f${i}`] = { type: ['number', 'null'] };
      required.push(`f${i}`);
    }
    return buildChatSchema({ type: 'object', additionalProperties: false, required, properties });
  };

  it('el límite es 16 (mensaje literal de la API de Anthropic)', () => {
    expect(ANTHROPIC_UNION_LIMIT).toBe(16);
  });

  it('cuenta cada campo anulable + la unión de proposal', () => {
    expect(countAnthropicUnions(envelopeWith(0))).toBe(1); // solo proposal
    expect(countAnthropicUnions(envelopeWith(15))).toBe(16);
    expect(countAnthropicUnions(envelopeWith(16))).toBe(17);
  });

  it('frontera exacta: 16 uniones NO excede (200 en vivo); 17 sí (400)', () => {
    expect(exceedsAnthropicUnionLimit(envelopeWith(15))).toBe(false); // = 16 uniones
    expect(exceedsAnthropicUnionLimit(envelopeWith(16))).toBe(true); // = 17 uniones
  });

  it('módulos reales: grandes exceden, pequeños y los de 16 no (anclado a la prueba en vivo)', () => {
    // Grandes (>16) → bloqueados.
    expect(countAnthropicUnions(buildChatSchema(isolatedFootingAdapter.payloadSchema))).toBe(23);
    expect(exceedsAnthropicUnionLimit(buildChatSchema(isolatedFootingAdapter.payloadSchema))).toBe(true);
    expect(exceedsAnthropicUnionLimit(buildChatSchema(punchingAdapter.payloadSchema))).toBe(true);
    // En el límite de 16 exacto → soportados (masonry dio 200 en vivo).
    // steel-beams: 15 uniones de payload (con las 3 dims de tubo, sin notes) +
    // la de `proposal` = 16. Centinela: el próximo campo anulable lo expulsa de
    // Anthropic — habría que compactar (p. ej. anidar las dims de tubo).
    expect(countAnthropicUnions(buildChatSchema(steelBeamsAdapter.payloadSchema))).toBe(16);
    expect(exceedsAnthropicUnionLimit(buildChatSchema(steelBeamsAdapter.payloadSchema))).toBe(false);
    expect(countAnthropicUnions(buildChatSchema(masonryWallsAdapter.payloadSchema))).toBe(16);
    expect(exceedsAnthropicUnionLimit(buildChatSchema(masonryWallsAdapter.payloadSchema))).toBe(false);
  });

  // Vigas de madera cabía justo en 16 y hubo que meterle la carga puntual. La
  // salida fue AGRUPAR: un objeto ANULABLE con hijos NO anulables cuesta UNA
  // unión, así que `fireResistance`+`exposedFaces` (2) pasaron a `fuego` (1) y
  // eso pagó la `cargaPuntual` nueva (1). Centinela: el próximo campo anulable
  // suelto vuelve a expulsar el módulo de Anthropic — hay que agrupar otro par.
  it('vigas de madera: 13 escalares + fuego + cargaPuntual + proposal = 16', () => {
    const envelope = buildChatSchema(timberBeamsAdapter.payloadSchema);
    expect(countAnthropicUnions(envelope)).toBe(16);
    expect(exceedsAnthropicUnionLimit(envelope)).toBe(false);
  });

  it('un objeto anulable con hijos NO anulables cuesta 1 unión, no una por hijo', () => {
    const props = (timberBeamsAdapter.payloadSchema as {
      properties: Record<string, Record<string, unknown>>;
    }).properties;
    expect(countAnthropicUnions(props.fuego)).toBe(1);
    expect(countAnthropicUnions(props.cargaPuntual)).toBe(1);
  });
});
