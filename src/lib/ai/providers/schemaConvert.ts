/**
 * Conversores RECURSIVOS de JSON Schema compartidos por los providers.
 *
 * El schema canónico (schema.ts y los payloads de módulos) expresa los campos
 * anulables como `type: ['X', 'null']`, con `null` dentro del `enum` cuando lo
 * hay. Cada validador de structured outputs habla un dialecto distinto:
 *
 * - Anthropic NO acepta `type` como array: responde 400 "Enum value 'IPE' does
 *   not match declared type" (verificado empíricamente y contra la doc, que
 *   solo lista `anyOf` como forma de composición) → `toAnthropicSchema`.
 * - OpenAI `strict: true` SÍ admite la unión en `type`, pero NO admite `null`
 *   dentro de un array `enum` (la guía oficial de Structured Outputs usa
 *   `{ "type": ["string","null"], "enum": [...sin null] }`) → `toOpenAiSchema`.
 * - Gemini acepta el canónico tal cual en `responseJsonSchema`: sin conversor.
 *
 * El envelope de chat anida el payload del módulo dentro de
 * `proposal.anyOf[0]`, así que la conversión superficial de Fase 0 (solo el
 * primer nivel de `properties`) ya no basta: ambos conversores recorren
 * `properties`, `items` y las ramas de `anyOf` a CUALQUIER profundidad.
 * Ninguno muta su entrada (copias nuevas): los schemas canónicos quedan
 * intactos para el resto de la app.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Copia un nodo recorriendo sus hijos estructurales (properties / items / ramas de anyOf). */
function convertChildren(
  node: Record<string, unknown>,
  convertNode: (child: unknown) => unknown,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...node };
  if (isRecord(node.properties)) {
    const properties: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node.properties)) {
      properties[key] = convertNode(value);
    }
    out.properties = properties;
  }
  if (node.items !== undefined) {
    out.items = Array.isArray(node.items) ? node.items.map(convertNode) : convertNode(node.items);
  }
  if (Array.isArray(node.anyOf)) {
    out.anyOf = node.anyOf.map(convertNode);
  }
  return out;
}

function convertAnthropicNode(node: unknown): unknown {
  if (!isRecord(node)) return node;

  const { type, enum: enumValues, description, ...rest } = node;
  if (!Array.isArray(type)) return convertChildren(node, convertAnthropicNode);

  // `type` array → una rama tipada por cada tipo no-null (con el enum sin
  // null y los hijos convertidos) + rama `{ type: 'null' }` si había 'null'.
  const nonNullTypes = type.filter((t) => t !== 'null');
  const branches: Record<string, unknown>[] = nonNullTypes.map((t) => {
    const branch: Record<string, unknown> = { ...rest, type: t };
    if (Array.isArray(enumValues)) {
      branch.enum = enumValues.filter((v) => v !== null);
    }
    return convertChildren(branch, convertAnthropicNode);
  });
  if (nonNullTypes.length < type.length) {
    branches.push({ type: 'null' });
  }

  // Caso degenerado `type: ['X']` (sin 'null'): colapsa a nodo tipado simple.
  const converted: Record<string, unknown> =
    branches.length === 1 ? { ...branches[0] } : { anyOf: branches };
  return description !== undefined ? { ...converted, description } : converted;
}

/**
 * Adapta un schema canónico al validador de structured outputs de Anthropic:
 * todo nodo con `type` array que incluye `'null'` (a cualquier profundidad) se
 * convierte a `anyOf: [rama tipada (enum sin null), { type: 'null' }]`, con la
 * `description` al nivel del nodo contenedor. Invariante: ningún nodo del
 * árbol resultante conserva `type` como array. No muta el schema de entrada.
 */
export function toAnthropicSchema(schema: Record<string, unknown>): Record<string, unknown> {
  return convertAnthropicNode(schema) as Record<string, unknown>;
}

/**
 * Límite DURO de Anthropic structured output: como máximo 16 parámetros con
 * tipo unión (`type` array o `anyOf`) por esquema. Por encima, su API responde
 * `400 invalid_request_error` («exponential compilation cost… limit: 16
 * parameters with unions»). Verificado contra la API real (2026-07-15): quitar
 * las uniones haciendo los campos OPCIONALES NO ayuda — dispara el mismo coste
 * y la petición cuelga ~90 s. Por eso los módulos con >16 campos anulables no
 * se pueden servir por Anthropic; sí por OpenAI/Gemini (sin ese tope).
 */
export const ANTHROPIC_UNION_LIMIT = 16;

/** Nodos con `anyOf` (uniones) en el árbol, a cualquier profundidad. */
function countUnionNodes(node: unknown): number {
  if (Array.isArray(node)) return node.reduce<number>((a, x) => a + countUnionNodes(x), 0);
  if (!isRecord(node)) return 0;
  let n = Array.isArray(node.anyOf) ? 1 : 0;
  if (isRecord(node.properties)) {
    for (const v of Object.values(node.properties)) n += countUnionNodes(v);
  }
  n += countUnionNodes(node.items);
  n += countUnionNodes(node.anyOf);
  return n;
}

/**
 * Nº de parámetros con tipo unión que Anthropic vería en `schema` una vez
 * convertido (cada campo anulable → `anyOf`, más las uniones ya presentes como
 * la de `proposal`). Es exactamente lo que Anthropic cuenta para su tope.
 */
export function countAnthropicUnions(schema: Record<string, unknown>): number {
  return countUnionNodes(toAnthropicSchema(schema));
}

/**
 * true si Anthropic rechazaría este esquema (envelope de chat) por exceso de
 * uniones. Se usa para degradar con elegancia: cuando el proveedor activo es
 * Anthropic y el módulo excede, el asistente se deshabilita con un aviso que
 * remite a OpenAI/Gemini, en vez de dejar que la petición dé 400 o cuelgue.
 */
export function exceedsAnthropicUnionLimit(schema: Record<string, unknown>): boolean {
  return countAnthropicUnions(schema) > ANTHROPIC_UNION_LIMIT;
}

function convertOpenAiNode(node: unknown): unknown {
  if (!isRecord(node)) return node;
  const out = convertChildren(node, convertOpenAiNode);
  if (Array.isArray(out.enum)) {
    out.enum = out.enum.filter((v) => v !== null);
  }
  return out;
}

/**
 * Adapta un schema canónico al validador `strict: true` de OpenAI: conserva
 * los `type` array (forma documentada para campos anulables) pero elimina
 * `null` de cualquier array `enum`, a cualquier profundidad. No muta el
 * schema de entrada.
 */
export function toOpenAiSchema(schema: Record<string, unknown>): Record<string, unknown> {
  return convertOpenAiNode(schema) as Record<string, unknown>;
}
