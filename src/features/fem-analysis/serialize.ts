// FEM 2D — model serialization for share-URL
//
// Encodes a DesignModel as a URL-safe base64 string compressed with lz-string.
// Used by the "Compartir modelo" button (Pass 5 design decision) to produce
// a shareable URL that another engineer can paste in their browser to load
// the same model.
//
// Why compression: the DesignModel JSON has nested arrays (nodes, bars,
// supports, loads) and per-bar armado fields. A typical V1 model serializes
// to ~2-5KB raw JSON, which produces a ~3-7KB URL — many environments choke
// on URLs over 4-8KB. lz-string's base64-URL variant typically compresses
// 3-5x for repetitive structural-engineering data, keeping URLs comfortably
// under the safe limit.

import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import type { DesignModel, Load } from './types';

/** Result of decoding a share URL — includes count of legacy fallbacks
 *  applied so the UI can surface a toast (Codex final pass #2 fix). */
export interface DecodeResult {
  model: DesignModel | null;
  qFallbacks: number;
}

/**
 * Encode a DesignModel as a URL-safe compressed string. The output is safe
 * to paste directly into a query parameter (no further encoding needed).
 *
 * Round-trip: decodeShareString(encodeShareString(m)) deep-equals m.
 */
export function encodeShareString(model: DesignModel): string {
  const json = JSON.stringify(model);
  return compressToEncodedURIComponent(json);
}

/**
 * Decode a URL-safe compressed share string back to a DesignModel. Returns
 * null when the input is not a valid encoded model (corrupted, empty, or
 * not produced by encodeShareString).
 *
 * V1.1 migration: legacy `combo` field stripped silently; Q loads without
 * `useCategory` default to 'B'. The `qFallbacks` count enables the host to
 * show an informational toast.
 */
export function decodeShareString(encoded: string): DecodeResult {
  if (!encoded) return { model: null, qFallbacks: 0 };
  try {
    const json = decompressFromEncodedURIComponent(encoded);
    if (!json) return { model: null, qFallbacks: 0 };
    const parsed = JSON.parse(json);
    if (!isValidDesignModel(parsed)) return { model: null, qFallbacks: 0 };
    return migrateLegacyShape(parsed as Record<string, unknown>);
  } catch {
    return { model: null, qFallbacks: 0 };
  }
}

/**
 * Strip legacy `combo` + default `useCategory='B'` on Q loads. Mirrors the
 * migration in index.tsx > loadFromStorage so URL-share and localStorage paths
 * apply the same defaults.
 */
function migrateLegacyShape(raw: Record<string, unknown>): DecodeResult {
  // Drop legacy combo (moved from DesignModel to ViewState in R1).
  delete raw.combo;
  let qFallbacks = 0;
  if (Array.isArray(raw.loads)) {
    raw.loads = (raw.loads as Load[]).map((l) => {
      if (l && typeof l === 'object' && (l as Load).lc === 'Q' && !(l as Load).useCategory) {
        qFallbacks++;
        return { ...l, useCategory: 'B' as const };
      }
      return l;
    });
  }
  return { model: raw as unknown as DesignModel, qFallbacks };
}

/**
 * Lightweight runtime shape check. Doesn't verify deep structural correctness
 * (autoDecompose + invariants do that downstream); just guards against the
 * obviously-corrupted "empty object" or "wrong shape" cases. Note: the legacy
 * `combo` field is no longer required (V1.1 moved it to ViewState).
 */
function isValidDesignModel(x: unknown): boolean {
  if (!x || typeof x !== 'object') return false;
  const m = x as Record<string, unknown>;
  if (typeof m.presetCode !== 'string') return false;
  if (typeof m.selfWeight !== 'boolean') return false;
  if (!Array.isArray(m.nodes)) return false;
  if (!Array.isArray(m.bars)) return false;
  if (!Array.isArray(m.supports)) return false;
  if (!Array.isArray(m.loads)) return false;
  return true;
}

/**
 * Build a full /analisis/fem URL with the given model encoded in the
 * `?model=` query param. Useful for the "Copy share URL" UI affordance.
 *
 * `origin` defaults to `window.location.origin + window.location.pathname`
 * stripped of any existing query/hash, so the URL points to the FEM module
 * regardless of where the share button is invoked from.
 */
export function buildShareUrl(model: DesignModel, baseUrl?: string): string {
  const encoded = encodeShareString(model);
  const url = baseUrl ?? defaultBaseUrl();
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}model=${encoded}`;
}

function defaultBaseUrl(): string {
  if (typeof window === 'undefined') return '/concreta-v2/analisis/fem';
  const { origin, pathname } = window.location;
  return `${origin}${pathname}`;
}
