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
import type { Fem2DModel } from './types';

const ROUTE = '/analisis/fem2d';

/** Encode a Fem2DModel as a URL-safe compressed string (embeddable verbatim). */
export function encodeShareString(model: Fem2DModel): string {
  return compressToEncodedURIComponent(JSON.stringify(model));
}

/** Decode a shared link back to a Fem2DModel, or null when corrupt/degenerate.
 *  Accepts both v2 payloads (the model itself) and v1 payloads (parametric
 *  Fem2DUiState — rebuilt via the template generators). */
export function decodeShareString(encoded: string): Fem2DModel | null {
  if (!encoded) return null;
  try {
    const json = decompressFromEncodedURIComponent(encoded);
    if (!json) return null;
    const parsed = JSON.parse(json) as unknown;

    // v1 compat: parametric UI state shape → rebuild through the templates.
    if (isV1UiState(parsed)) {
      const { model } = buildModelFromState(parsed);
      return model; // null when the params fail template validation
    }

    if (!isPlausibleModel(parsed)) return null;
    const model = parsed as Fem2DModel;
    // Final gate: reject degenerate models (missing supports, bad refs, …).
    const errors = validateModel2DBasic(model);
    if (errors.some((e) => e.severity === 'fail')) return null;
    return model;
  } catch {
    return null;
  }
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
