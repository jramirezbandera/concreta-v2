// FEM 2D — shareable-link serialization (v2, model-centric).
//
// v2 encodes the COMPLETE Fem2DModel (lz-string compressed JSON), mirroring the
// FEM 1D pattern: with a free editor the model is no longer derivable from
// template params, so the link must carry nodes/members/supports/loads.
//
// Backwards compat: v1 links encoded the parametric Fem2DUiState (templateId +
// params per template). decodeShareString detects that shape and rebuilds the
// model through buildModelFromState — links shared before the editor keep
// opening (cost: ~15 lines; uiState.ts still owns the parametric build).
//
// Safety gate: a decoded model must pass validateModel2DBasic without fails —
// never hydrate the editor with a degenerate model (the "plausible but wrong
// PDF" guard, same philosophy as the pipeline).

import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import { validateModel2DBasic } from './builder';
import { buildModelFromState, TEMPLATE_ORDER, type Fem2DUiState } from './uiState';
import type { DeflLimit2D, DisplayGroup2D, Fem2DMember, Fem2DModel } from './types';

const ROUTE = '/analisis/fem2d';

/** Encode a Fem2DModel as a URL-safe compressed string (embeddable verbatim). */
export function encodeShareString(model: Fem2DModel): string {
  return compressToEncodedURIComponent(JSON.stringify(model));
}

export interface DecodedShare {
  model: Fem2DModel;
  /** true = el payload venía del modelo de datos ANTERIOR a la Fase 2 (rol de
   *  barra / elementType) y el normalizador lo migró — la UI debe mostrar el
   *  banner de migración no descartable. */
  migrated: boolean;
}

/** Campos del modelo de datos pre-Fase 2 que el normalizador consume. */
interface LegacyMemberFields {
  role?: 'pilar' | 'viga' | 'cordon' | 'diagonal' | 'montante';
  elementType?: 'beam-column' | 'two-force';
  roleManual?: boolean;
}

/**
 * Normalizador de la Fase 2 (paso 2 del design doc): migra un miembro del
 * modelo de datos antiguo (rol + elementType) al nuevo. Reglas, en la
 * dirección SEGURA siempre:
 *
 *   rol + HA:  'pilar' → rcDesignKind 'column' · 'viga'/'cordon' → 'beam' ·
 *              'diagonal'/'montante' → undefined, que lee PENDIENTE — nunca a
 *              un valor que pueda dar verde (PENDIENTE → verde viola P5).
 *   flecha:    'viga'/'cordon' → L/300 (la fila que ya tenían) ·
 *              'pilar'/'diagonal'/'montante' → 'none' (no la tenían).
 *   biela:     elementType 'two-force' → releases {i,j} = true (la biela es
 *              derivada ahora; una birrotulada descargada ES la biela).
 *   displayGroup: el rol viejo mapea 1:1 — el agrupado de resultados y PDF de
 *              los enlaces antiguos se conserva EXACTO.
 *   weakAxisBracing: NO se siembra desde ltbSpacing — que unas correas no
 *              coaccionan el eje débil entero es exactamente la tesis de D13.
 *   roleManual: se descarta.
 */
function normalizeLegacyMember(raw: Fem2DMember & LegacyMemberFields): { member: Fem2DMember; migrated: boolean } {
  const hasLegacy = raw.role !== undefined || raw.elementType !== undefined || raw.roleManual !== undefined;
  if (!hasLegacy) return { member: raw, migrated: false };

  const { role, elementType, roleManual: _roleManual, ...rest } = raw;
  void _roleManual;
  const member: Fem2DMember = { ...rest };

  if (member.material === 'rc' && member.rcDesignKind === undefined && role !== undefined) {
    member.rcDesignKind = role === 'pilar' ? 'column' : role === 'viga' || role === 'cordon' ? 'beam' : undefined;
  }
  if (member.deflLimit === undefined && role !== undefined) {
    const limit: DeflLimit2D = role === 'viga' || role === 'cordon' ? 300 : 'none';
    member.deflLimit = limit;
  }
  if (member.displayGroup === undefined && role !== undefined) {
    member.displayGroup = role as DisplayGroup2D;
  }
  if (elementType === 'two-force') {
    member.releases = { i: true, j: true };
    member.deflLimit = member.deflLimit ?? 'none';
  }
  return { member, migrated: true };
}

/** Normaliza un modelo v2 completo. Exportada para la carga de localStorage
 *  (useFem2DState), que guarda el mismo shape que los enlaces. */
export function normalizeLegacyModel(model: Fem2DModel): DecodedShare {
  let migrated = false;
  const members = model.members.map((m) => {
    const r = normalizeLegacyMember(m as Fem2DMember & LegacyMemberFields);
    migrated = migrated || r.migrated;
    return r.member;
  });
  return { model: migrated ? { ...model, members } : model, migrated };
}

/** Decode a shared link back to a Fem2DModel + migration flag, or null when
 *  corrupt/degenerate. Accepts v2 payloads (the model itself, pre- or
 *  post-Fase 2) and v1 payloads (parametric Fem2DUiState — rebuilt via the
 *  template generators, which stamp the NEW fields and need no migration). */
export function decodeShareStringDetailed(encoded: string): DecodedShare | null {
  if (!encoded) return null;
  try {
    const json = decompressFromEncodedURIComponent(encoded);
    if (!json) return null;
    const parsed = JSON.parse(json) as unknown;

    // v1 compat: parametric UI state shape → rebuild through the templates.
    if (isV1UiState(parsed)) {
      const { model } = buildModelFromState(parsed);
      return model ? { model, migrated: false } : null;
    }

    if (!isPlausibleModel(parsed)) return null;
    const normalized = normalizeLegacyModel(parsed as Fem2DModel);
    // Final gate: reject degenerate models (missing supports, bad refs, …).
    const errors = validateModel2DBasic(normalized.model);
    if (errors.some((e) => e.severity === 'fail')) return null;
    return normalized;
  } catch {
    return null;
  }
}

/** Compat: la forma histórica sin el flag de migración. */
export function decodeShareString(encoded: string): Fem2DModel | null {
  return decodeShareStringDetailed(encoded)?.model ?? null;
}

/** v1 payload sniff: templateId + params map (the old Fem2DUiState). */
function isV1UiState(x: unknown): x is Fem2DUiState {
  if (!x || typeof x !== 'object') return false;
  const m = x as Record<string, unknown>;
  if (typeof m.templateId !== 'string') return false;
  if (!TEMPLATE_ORDER.includes(m.templateId as Fem2DUiState['templateId'])) return false;
  if (!m.params || typeof m.params !== 'object') return false;
  // A v2 model never carries `params`; a v1 state never carries `nodes`.
  return !Array.isArray(m.nodes);
}

/** Lightweight runtime shape check for a v2 model payload. Structural validity
 *  (refs, supports, lengths) is enforced by validateModel2DBasic downstream. */
export function isPlausibleModel(x: unknown): x is Fem2DModel {
  if (!x || typeof x !== 'object') return false;
  const m = x as Record<string, unknown>;
  if (typeof m.templateId !== 'string') return false;
  if (typeof m.selfWeight !== 'boolean') return false;
  if (!Array.isArray(m.nodes) || !Array.isArray(m.members)) return false;
  if (!Array.isArray(m.supports) || !Array.isArray(m.loads)) return false;
  return m.nodes.every((n) => n && typeof (n as { id?: unknown }).id === 'string')
    && m.members.every((b) => b && typeof (b as { id?: unknown }).id === 'string');
}

/** Build the full /analisis/fem2d URL with the model encoded in `?model=`. */
export function buildShareUrl(model: Fem2DModel, baseUrl?: string): string {
  const encoded = encodeShareString(model);
  const url = baseUrl ?? defaultBaseUrl();
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}model=${encoded}`;
}

function defaultBaseUrl(): string {
  if (typeof window === 'undefined') return ROUTE;
  const { origin, pathname } = window.location;
  return `${origin}${pathname}`;
}
