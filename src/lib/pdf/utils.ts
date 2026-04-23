// Shared utilities for all Concreta PDF modules.
// jsPDF helpers — imported by every src/lib/pdf/*.ts export function.
//
// NOT exported: M (page margin) — varies per module (15/18/20 mm).

import type jsPDF from 'jspdf';

export const PAGE_W = 210;  // A4 width mm
export const PAGE_H = 297;  // A4 height mm

/** Set both text and draw color to a gray value (0=black, 255=white). */
export function setGray(doc: jsPDF, g: number): void {
  doc.setTextColor(g, g, g);
  doc.setDrawColor(g, g, g);
}

/**
 * Sanitize a string for jsPDF Helvetica (WinAnsi / Latin-1 encoding).
 * Replaces known Unicode symbols with ASCII approximations,
 * then strips any remaining non-Latin-1 characters.
 *
 * Covers all symbols used across Concreta modules:
 *   Greek: λ χ σ τ γ φ η δ β θ ε
 *   Super/subscripts: ⁴ ³ ² ₁ ₂
 *   Math / punctuation: √ · ≤ ≥ ° Ø ' — –
 */
export function pdfStr(s: string): string {
  return s
    // Superscripts
    .replace(/⁴/g, '^4')
    .replace(/³/g, '^3')
    .replace(/²/g, '2')
    // Subscripts
    .replace(/₁/g, '1')
    .replace(/₂/g, '2')
    // Greek — lambda-bar (λ + combining macron) must come before plain λ
    .replace(/λ̄/g, 'lam')
    .replace(/λ/g, 'lam')
    .replace(/χ/g, 'chi')
    .replace(/σ/g, 'sigma')
    .replace(/γ/g, 'g')
    .replace(/φ/g, 'phi')
    .replace(/η/g, 'eta')
    .replace(/δ/g, 'd')
    .replace(/β/g, 'beta')
    .replace(/τ/g, 't')
    .replace(/θ/g, 'th')
    .replace(/ε/g, 'eps')
    // Other symbols
    .replace(/≤/g, '<=')
    .replace(/≥/g, '>=')
    .replace(/√/g, 'sqrt')
    .replace(/·/g, 'x')
    .replace(/°/g, 'deg')
    .replace(/Ø/g, 'ph')
    .replace(/'/g, "'")
    // Dashes
    .replace(/\u2014/g, ' - ')   // em dash —
    .replace(/\u2013/g, '-')     // en dash –
    // Catch-all: strip any remaining non-Latin-1 character
    .replace(/[^\x00-\xFF]/g, '?');
}

/** Result returned by all PDF export functions for preview modal. */
export interface PdfResult {
  blobUrl: string;
  filename: string;
  pageCount: number;
}

/** Standard check status labels (Spanish). */
export const STATUS_LABEL: Record<string, string> = {
  ok:      'CUMPLE',
  warn:    'ADVERTENCIA',
  fail:    'INCUMPLE',
  neutral: 'N/A',
};
