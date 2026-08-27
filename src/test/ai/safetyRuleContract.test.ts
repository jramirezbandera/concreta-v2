// Contrato de las TABLAS DE SEGURIDAD de los 20 adapters (auditoría 2026-07-14).
//
// El gate anti-ruido de safety.ts levanta la protección de un campo cuando el
// hilo ya lo trató, y busca la clave en el espacio del PAYLOAD (`t_cm`), no del
// estado (`t`) — de ahí `SafetyRule.confirmKey`. La consecuencia de un
// confirmKey mal escrito (o ausente cuando los nombres no coinciden) es SILENCIOSA
// y peligrosa: la clave nunca aparece en `confirmed`, el gate no se levanta jamás
// y el campo queda desprotegido justo en el caso que motivó el arreglo — el valor
// real del usuario coincidiendo con el default de fábrica.
//
// Ningún test unitario del mapper lo vería (el riesgo simplemente no sale), así
// que la invariante se asserta aquí, sobre los 20 adapters a la vez:
//
//   toda regla: (confirmKey ?? field) ∈ payloadSchema.properties
//
// Es la misma doctrina que payloadSchemaContract.test.ts: los fallos que solo se
// manifiestan en producción se cazan con una invariante estructural.

import { describe, it, expect } from 'vitest';
import type { AiModuleAdapter } from '../../lib/ai/modules/types';
import type {
  ElementRiskContext, ElementSafetyRule, ResolvedSafetyRule, SafetyRule,
} from '../../lib/ai/safety';

import { STEEL_SAFETY_RULES } from '../../lib/ai/mapExtraction';
import { steelBeamsAdapter } from '../../lib/ai/modules/steelBeams';
import { rcColumnsAdapter, RC_COLUMNS_SAFETY_RULES } from '../../lib/ai/modules/rcColumns';
import { isolatedFootingAdapter, FOOTING_SAFETY_RULES } from '../../lib/ai/modules/isolatedFooting';
import {
  compositeSectionAdapter, COMPOSITE_SAFETY_RULES, COMPOSITE_RESOLVED_RULES,
} from '../../lib/ai/modules/compositeSection';
import {
  micropilesAdapter, MICROPILES_SAFETY_RULES, SOIL_ELEMENT_RULES, SOIL_RISK_CTX,
} from '../../lib/ai/modules/micropiles';
import {
  slopeStabilityAdapter, SLOPE_SAFETY_RULES,
  STRATA_ELEMENT_RULES, STRATA_RISK_CTX, LOADS_ELEMENT_RULES, LOADS_RISK_CTX,
} from '../../lib/ai/modules/slopeStability';
import { pileCapAdapter, PILE_CAP_SAFETY_RULES } from '../../lib/ai/modules/pileCap';
import { timberColumnsAdapter, TIMBER_COLUMN_SAFETY_RULES } from '../../lib/ai/modules/timberColumns';
import {
  timberBeamsAdapter, TIMBER_BEAM_SAFETY_RULES, TIMBER_BEAM_RESOLVED_RULES,
} from '../../lib/ai/modules/timberBeams';
import {
  steelColumnsAdapter, STEEL_COLUMN_SAFETY_RULES, STEEL_COLUMN_RESOLVED_RULES,
} from '../../lib/ai/modules/steelColumns';
import { empresalladoAdapter, EMPRESILLADO_SAFETY_RULES } from '../../lib/ai/modules/empresillado';
import { punchingAdapter, PUNCHING_SAFETY_RULES } from '../../lib/ai/modules/punching';
import {
  rcBeamsAdapter, RC_BEAMS_SAFETY_RULES, RC_BEAMS_RESOLVED_RULES,
} from '../../lib/ai/modules/rcBeams';
import { forjadosAdapter, FORJADOS_SAFETY_RULES } from '../../lib/ai/modules/forjados';
import { retainingWallAdapter, RETAINING_WALL_SAFETY_RULES } from '../../lib/ai/modules/retainingWall';
import { anchorPlateAdapter, ANCHOR_PLATE_SAFETY_RULES } from '../../lib/ai/modules/anchorPlate';
import { masonryWallsAdapter, MASONRY_SAFETY_RULES } from '../../lib/ai/modules/masonryWalls';
import {
  femAnalysisAdapter, FEM_SAFETY_RULES,
  VANOS_ELEMENT_RULES, VANOS_RISK_CTX, CARGAS_ELEMENT_RULES, CARGAS_RISK_CTX,
} from '../../lib/ai/modules/femAnalysis';
import {
  fem2dAdapter, FEM2D_SAFETY_RULES,
  NUDOS_ELEMENT_RULES, NUDOS_RISK_CTX, BARRAS_ELEMENT_RULES, BARRAS_RISK_CTX,
  CARGAS2D_ELEMENT_RULES, CARGAS2D_RISK_CTX,
} from '../../lib/ai/modules/fem2d';
import {
  seismicNCSE02Adapter, SEISMIC_SAFETY_RULES, SEISMIC_RESOLVED_RULES,
} from '../../lib/ai/modules/seismicNCSE02';

/* eslint-disable @typescript-eslint/no-explicit-any -- el contrato es estructural: recorre 20 TInputs distintos */

interface Entry {
  adapter: AiModuleAdapter<any>;
  rules: ReadonlyArray<SafetyRule<any>>;
  /** Arrays del payload con reglas por elemento (ola 3). */
  elements?: ReadonlyArray<{
    ctx: ElementRiskContext;
    rules: ReadonlyArray<ElementSafetyRule<any>>;
  }>;
  /** Reglas sobre magnitudes RESUELTAS (β efectiva, ψ₂ efectivo) — fuga 2. */
  resolved?: ReadonlyArray<ResolvedSafetyRule<any>>;
}

const ENTRIES: readonly Entry[] = [
  { adapter: steelBeamsAdapter, rules: STEEL_SAFETY_RULES },
  { adapter: rcColumnsAdapter, rules: RC_COLUMNS_SAFETY_RULES },
  { adapter: isolatedFootingAdapter, rules: FOOTING_SAFETY_RULES },
  { adapter: compositeSectionAdapter, rules: COMPOSITE_SAFETY_RULES, resolved: COMPOSITE_RESOLVED_RULES },
  {
    adapter: micropilesAdapter,
    rules: MICROPILES_SAFETY_RULES,
    elements: [{ ctx: SOIL_RISK_CTX, rules: SOIL_ELEMENT_RULES }],
  },
  {
    adapter: slopeStabilityAdapter,
    rules: SLOPE_SAFETY_RULES,
    elements: [
      { ctx: STRATA_RISK_CTX, rules: STRATA_ELEMENT_RULES },
      { ctx: LOADS_RISK_CTX, rules: LOADS_ELEMENT_RULES },
    ],
  },
  { adapter: pileCapAdapter, rules: PILE_CAP_SAFETY_RULES },
  { adapter: timberColumnsAdapter, rules: TIMBER_COLUMN_SAFETY_RULES },
  { adapter: timberBeamsAdapter, rules: TIMBER_BEAM_SAFETY_RULES, resolved: TIMBER_BEAM_RESOLVED_RULES },
  { adapter: steelColumnsAdapter, rules: STEEL_COLUMN_SAFETY_RULES, resolved: STEEL_COLUMN_RESOLVED_RULES },
  { adapter: empresalladoAdapter, rules: EMPRESILLADO_SAFETY_RULES },
  { adapter: punchingAdapter, rules: PUNCHING_SAFETY_RULES },
  { adapter: rcBeamsAdapter, rules: RC_BEAMS_SAFETY_RULES, resolved: RC_BEAMS_RESOLVED_RULES },
  { adapter: forjadosAdapter, rules: FORJADOS_SAFETY_RULES },
  { adapter: retainingWallAdapter, rules: RETAINING_WALL_SAFETY_RULES },
  { adapter: anchorPlateAdapter, rules: ANCHOR_PLATE_SAFETY_RULES },
  { adapter: masonryWallsAdapter, rules: MASONRY_SAFETY_RULES },
  {
    adapter: femAnalysisAdapter,
    rules: FEM_SAFETY_RULES,
    elements: [
      { ctx: VANOS_RISK_CTX, rules: VANOS_ELEMENT_RULES },
      { ctx: CARGAS_RISK_CTX, rules: CARGAS_ELEMENT_RULES },
    ],
  },
  {
    adapter: fem2dAdapter,
    rules: FEM2D_SAFETY_RULES,
    elements: [
      { ctx: NUDOS_RISK_CTX, rules: NUDOS_ELEMENT_RULES },
      { ctx: BARRAS_RISK_CTX, rules: BARRAS_ELEMENT_RULES },
      { ctx: CARGAS2D_RISK_CTX, rules: CARGAS2D_ELEMENT_RULES },
    ],
  },
  {
    adapter: seismicNCSE02Adapter,
    rules: SEISMIC_SAFETY_RULES,
    resolved: SEISMIC_RESOLVED_RULES,
  },
];

function payloadKeys(adapter: AiModuleAdapter<any>): string[] {
  const schema = adapter.payloadSchema as { properties?: Record<string, unknown> };
  return Object.keys(schema.properties ?? {});
}

describe('los 20 adapters están en el contrato', () => {
  it('no falta ninguno (el próximo módulo tiene que entrar aquí)', () => {
    expect(ENTRIES).toHaveLength(20);
    expect(new Set(ENTRIES.map((e) => e.adapter.id)).size).toBe(20);
  });
});

describe.each(ENTRIES.map((e) => [e.adapter.id, e] as const))(
  'reglas de seguridad de %s',
  (_id, entry) => {
    const keys = payloadKeys(entry.adapter);

    it('toda regla se confirma con una clave REAL del payloadSchema', () => {
      const huerfanas = entry.rules
        .map((r) => ({ field: r.field, confirmKey: r.confirmKey ?? r.field }))
        .filter((r) => !keys.includes(r.confirmKey));
      // Un confirmKey huérfano deja el gate anti-ruido cerrado para siempre: el
      // campo queda sin red justo cuando su valor real coincide con el default.
      expect(huerfanas).toEqual([]);
    });

    it('ninguna regla duplicada (la primera ganaría y la segunda sería letra muerta)', () => {
      const fields = entry.rules.map((r) => r.field);
      expect(fields).toEqual([...new Set(fields)]);
    });

    it('todo `why` es una explicación de verdad, no un hueco', () => {
      for (const r of entry.rules) expect(r.why.length).toBeGreaterThan(30);
    });

    // FUGA 2 de la auditoría: `ordinalLevel` devuelve `map[value] ?? null` y
    // detectSafetyRisks SALTA los niveles nulos. Un valor del enum que no esté en
    // el mapa es, por tanto, una PUERTA DE ESCAPE silenciosa: el modelo lo propone,
    // no hay nivel que comparar y no hay riesgo. Así se colaba `'custom'` — que
    // está en los enums del payload y NO estaba en los mapas ordinales.
    //
    // La invariante: si una regla gobierna un campo cuyo payload es un enum, TODOS
    // los valores de ese enum tienen que tener nivel. Si un valor no puede tener un
    // nivel fijo (porque delega en otro campo, como 'custom' delega en β o en ψ₂),
    // la regla NO puede ser un ordinal sobre el enum: tiene que ser un riesgo sobre
    // la MAGNITUD RESUELTA (detectResolvedRisks).
    it('ningún valor del enum se escapa sin nivel (la puerta de "custom")', () => {
      const props = (entry.adapter.payloadSchema as any).properties ?? {};
      const escapes: string[] = [];
      for (const rule of entry.rules) {
        const prop = props[rule.confirmKey ?? rule.field];
        // Un confirmKey puede apuntar a un OBJETO que agrupa varios campos (el
        // `fuego` de vigas de madera, agrupado para no reventar el tope de
        // uniones de Anthropic). El enum vive entonces un nivel más abajo, en la
        // property que se llama como el campo del estado: sin mirar ahí, esta
        // invariante dejaría de proteger en silencio a los campos agrupados.
        const nested = prop?.properties?.[rule.field];
        const values: unknown[] = prop?.enum ?? nested?.enum ?? [];
        for (const v of values) {
          if (v === null) continue; // null = "sin cambio", no es un valor
          if (rule.level(v) === null) escapes.push(`${rule.field} ← ${String(v)}`);
        }
      }
      expect(escapes).toEqual([]);
    });

    if (entry.resolved !== undefined) {
      it('toda regla de magnitud RESUELTA se confirma con claves REALES del payload', () => {
        const huerfanas = entry.resolved!
          .flatMap((r) => r.confirmKeys.map((k) => ({ id: r.id, confirmKey: k })))
          .filter((r) => !keys.includes(r.confirmKey));
        expect(huerfanas).toEqual([]);
      });

      it('su id NO colisiona con un campo del estado (sería una clave duplicada en la tarjeta)', () => {
        const fields = new Set(entry.rules.map((r) => r.field));
        for (const r of entry.resolved!) expect(fields.has(r.id)).toBe(false);
      });

      it('ningún campo delegado conserva ADEMÁS su regla por campo (doble reporte)', () => {
        // El detector resuelto SUSTITUYE a las reglas por campo, no se suma a
        // ellas: si sobreviviera la regla de `beta_y` o la de `psi2Custom`, un
        // mismo cambio saldría en DOS filas rojas de la misma tarjeta.
        const scalarFields = new Set(entry.rules.map((r) => r.field));
        const solapadas = entry.resolved!
          .flatMap((r) => r.fields)
          .filter((f) => scalarFields.has(f));
        expect(solapadas).toEqual([]);
      });
    }

    if (entry.elements !== undefined) {
      it('todo array con reglas por elemento se confirma con una clave REAL del payload', () => {
        const huerfanos = entry.elements!
          .map((e) => e.ctx.confirmKey ?? e.ctx.field)
          .filter((k) => !keys.includes(k));
        expect(huerfanos).toEqual([]);
      });
    }
  },
);
