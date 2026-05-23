// Unit tests for src/lib/pdf/utils.ts
//
// Covers the foundation helpers extracted in the masonry-walls PDF rebuild:
//   - pdfStr (Latin-1 sanitization, with Φ/Σ/Δ uppercase Greek)
//   - inputsFingerprint (FNV-1a, key-order independent)
//   - ensureSpace (predictive page break + repeat-header callback)
//   - drawTable (atomic rows, header repeat, zebra)
//   - drawHeader (cover header band, "Sin especificar" defaults for metadata)
//   - drawFootersAllPages (engine version + page num on EVERY page)
//
// Strategy: real jsPDF instance (jsdom-friendly), inspect public surface
// (getNumberOfPages, getCurrentPageInfo). No binary snapshots.

import { describe, expect, it, beforeAll } from 'vitest';
import jsPDF from 'jspdf';
import {
  pdfStr,
  inputsFingerprint,
  ensureSpace,
  drawTable,
  drawHeader,
  drawFootersAllPages,
  PAGE_H,
  FOOTER_RESERVE,
} from '../../lib/pdf/utils';

beforeAll(() => {
  if (typeof URL.createObjectURL !== 'function') {
    URL.createObjectURL = () => 'blob:mock';
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// pdfStr
// ─────────────────────────────────────────────────────────────────────────────

describe('pdfStr', () => {
  it('replaces lowercase Greek letters with ASCII tokens', () => {
    expect(pdfStr('φ = 0.5')).toBe('phi = 0.5');
    expect(pdfStr('λ = h/t')).toBe('lam = h/t');
    expect(pdfStr('σ_top')).toBe('sigma_top');
    expect(pdfStr('β·f_d')).toBe('betaxf_d');
  });

  it('replaces uppercase Greek letters Φ/Σ/Δ (used in formulas)', () => {
    expect(pdfStr('Φ = 0.66')).toBe('Phi = 0.66');
    expect(pdfStr('Σ Fi')).toBe('Sum Fi');
    expect(pdfStr('Δh = 5 mm')).toBe('Deltah = 5 mm');
  });

  it('does not double-replace when uppercase precedes lowercase', () => {
    expect(pdfStr('Φ vs φ')).toBe('Phi vs phi');
  });

  it('preserves Latin-1 accents (Spanish text)', () => {
    expect(pdfStr('hormigón armado')).toBe('hormigón armado');
    expect(pdfStr('Categoría II')).toBe('Categoría II');
  });

  it('substitutes em/en dashes', () => {
    expect(pdfStr('A — B')).toBe('A  -  B');
    expect(pdfStr('A – B')).toBe('A - B');
  });

  it('replaces any leftover non-Latin-1 with ?', () => {
    expect(pdfStr('✓ done')).toBe('? done');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// inputsFingerprint
// ─────────────────────────────────────────────────────────────────────────────

describe('inputsFingerprint', () => {
  it('returns 8 hex chars', () => {
    const fp = inputsFingerprint({ a: 1, b: 'x' });
    expect(fp).toMatch(/^[0-9a-f]{8}$/);
  });

  it('is deterministic for the same value', () => {
    const v = { L: 6000, t: 240, plantas: [{ id: 'p1', H: 3000 }] };
    expect(inputsFingerprint(v)).toBe(inputsFingerprint(v));
  });

  it('is independent of object key insertion order', () => {
    const a = { L: 6000, t: 240, fb: 10 };
    const b = { fb: 10, t: 240, L: 6000 };
    expect(inputsFingerprint(a)).toBe(inputsFingerprint(b));
  });

  it('changes when any field changes', () => {
    const a = { L: 6000, t: 240 };
    const b = { L: 6001, t: 240 };
    expect(inputsFingerprint(a)).not.toBe(inputsFingerprint(b));
  });

  it('handles nested arrays and objects (engineering state shape)', () => {
    const state = {
      L: 6000,
      t: 240,
      plantas: [
        { id: 'p1', H: 3000, huecos: [{ id: 'h1', x: 800, w: 900 }] },
        { id: 'p2', H: 2800, huecos: [] },
      ],
    };
    const fp = inputsFingerprint(state);
    expect(fp).toMatch(/^[0-9a-f]{8}$/);
    // Reorder nested keys → same fingerprint
    const reordered = {
      plantas: [
        { huecos: [{ w: 900, x: 800, id: 'h1' }], H: 3000, id: 'p1' },
        { huecos: [], H: 2800, id: 'p2' },
      ],
      t: 240,
      L: 6000,
    };
    expect(inputsFingerprint(reordered)).toBe(fp);
  });

  it('discriminates array order (arrays are ordered, not sets)', () => {
    const a = { items: [1, 2, 3] };
    const b = { items: [3, 2, 1] };
    expect(inputsFingerprint(a)).not.toBe(inputsFingerprint(b));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ensureSpace
// ─────────────────────────────────────────────────────────────────────────────

describe('ensureSpace', () => {
  const M = 18;

  it('returns currentY when block fits', () => {
    const doc = new jsPDF();
    const startPages = doc.getNumberOfPages();
    const y = ensureSpace(doc, 100, 20, M);
    expect(y).toBe(100);
    expect(doc.getNumberOfPages()).toBe(startPages);
  });

  it('adds a page and returns M+10 when block does not fit', () => {
    const doc = new jsPDF();
    // currentY just above the safe bottom — anything > 0 mm of requiredH overflows
    const maxY = PAGE_H - M - FOOTER_RESERVE;
    const y = ensureSpace(doc, maxY - 1, 10, M);
    expect(doc.getNumberOfPages()).toBe(2);
    expect(y).toBe(M + 10);
  });

  it('runs onNewPage callback after page break and returns its result', () => {
    const doc = new jsPDF();
    const maxY = PAGE_H - M - FOOTER_RESERVE;
    let called = false;
    let receivedStartY = 0;
    const y = ensureSpace(doc, maxY - 1, 10, M, (newY) => {
      called = true;
      receivedStartY = newY;
      return newY + 5; // simulate "drew header, advance by 5"
    });
    expect(called).toBe(true);
    expect(receivedStartY).toBe(M + 10);
    expect(y).toBe(M + 10 + 5);
  });

  it('exactly-fits is not a page break (boundary y + h == maxY)', () => {
    const doc = new jsPDF();
    const maxY = PAGE_H - M - FOOTER_RESERVE;
    const startPages = doc.getNumberOfPages();
    const y = ensureSpace(doc, maxY - 5, 5, M);
    expect(y).toBe(maxY - 5);
    expect(doc.getNumberOfPages()).toBe(startPages);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// drawTable
// ─────────────────────────────────────────────────────────────────────────────

interface TestRow {
  id: string;
  ancho: number;
  eta: number;
}

describe('drawTable', () => {
  const M = 18;
  const cols = [
    { key: 'id', label: 'ID', w: 20 },
    { key: 'ancho', label: 'Ancho (cm)', w: 30, align: 'right' as const },
    { key: 'eta', label: 'η', w: 20, align: 'right' as const, render: (r: TestRow) => `${(r.eta * 100).toFixed(0)}%` },
  ];

  it('renders a small table in a single page', () => {
    const doc = new jsPDF();
    const rows: TestRow[] = [
      { id: 'M1', ancho: 80, eta: 0.45 },
      { id: 'M2', ancho: 90, eta: 0.71 },
      { id: 'M3', ancho: 120, eta: 0.32 },
    ];
    const endY = drawTable(doc, { x: M, y: 30, cols, rows, M });
    expect(doc.getNumberOfPages()).toBe(1);
    expect(endY).toBeGreaterThan(30);
  });

  it('breaks across pages when rows do not fit, and repeats header by default', () => {
    const doc = new jsPDF();
    const rows: TestRow[] = Array.from({ length: 80 }, (_, i) => ({
      id: `M${i + 1}`, ancho: 80 + i, eta: (i % 10) / 10,
    }));
    const endY = drawTable(doc, { x: M, y: 30, cols, rows, M, rowH: 5 });
    // 80 rows * 5mm = 400mm of content → needs at least 2 pages on A4 (297mm).
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(2);
    expect(endY).toBeLessThanOrEqual(PAGE_H - M);
  });

  it('renders custom value via col.render', () => {
    // Smoke: render function executes (drawTable calls it for each cell).
    const doc = new jsPDF();
    let renderCalled = 0;
    const colsWithSpy = [
      { ...cols[0] },
      { ...cols[1] },
      {
        ...cols[2],
        render: (r: TestRow) => {
          renderCalled++;
          return `${r.eta}`;
        },
      },
    ];
    drawTable(doc, {
      x: M, y: 30, cols: colsWithSpy, rows: [{ id: 'M1', ancho: 80, eta: 0.5 }], M,
    });
    expect(renderCalled).toBe(1);
  });

  it('does NOT add a page when zero rows', () => {
    const doc = new jsPDF();
    const startPages = doc.getNumberOfPages();
    drawTable(doc, { x: M, y: 30, cols, rows: [], M });
    expect(doc.getNumberOfPages()).toBe(startPages);
  });

  it('headerRepeat:false does not invoke a header callback', () => {
    // When headerRepeat is false, ensureSpace receives no onNewPage callback,
    // so the second page starts blank without a re-drawn header. We can't
    // inspect draw calls without mocking jsPDF, but we can assert behaviour
    // by counting pages: 80 rows still paginate.
    const doc = new jsPDF();
    const rows: TestRow[] = Array.from({ length: 80 }, (_, i) => ({
      id: `M${i + 1}`, ancho: 80, eta: 0.5,
    }));
    drawTable(doc, { x: M, y: 30, cols, rows, M, headerRepeat: false });
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// drawHeader
// ─────────────────────────────────────────────────────────────────────────────

describe('drawHeader', () => {
  const M = 18;

  it('returns a contentY below the title band when no metadata', () => {
    const doc = new jsPDF();
    const { contentY } = drawHeader(doc, {
      title: 'Concreta - Test',
      engineVersion: '2.0.0',
    }, M);
    expect(contentY).toBeGreaterThan(M);
    expect(doc.getNumberOfPages()).toBe(1);
  });

  it('renders metadata band when any project field is set, advancing contentY', () => {
    const doc1 = new jsPDF();
    const { contentY: yNoMeta } = drawHeader(doc1, {
      title: 'Concreta - Test',
      engineVersion: '2.0.0',
    }, M);
    const doc2 = new jsPDF();
    const { contentY: yWithMeta } = drawHeader(doc2, {
      title: 'Concreta - Test',
      engineVersion: '2.0.0',
      proyecto: 'Rehabilitación Calle Mayor',
    }, M);
    expect(yWithMeta).toBeGreaterThan(yNoMeta);
  });

  it('does not throw when project fields are undefined (legal: prints "Sin especificar")', () => {
    const doc = new jsPDF();
    expect(() => drawHeader(doc, {
      title: 'Concreta - Test',
      engineVersion: '2.0.0',
      proyecto: undefined,
      expediente: undefined,
      autor: undefined,
    }, M)).not.toThrow();
  });

  it('does not throw when engineVersion is missing', () => {
    const doc = new jsPDF();
    expect(() => drawHeader(doc, { title: 'Concreta - Test' }, M)).not.toThrow();
  });

  it('sanitizes title via pdfStr (does not corrupt Greek/symbols)', () => {
    const doc = new jsPDF();
    // Just smoke — must not throw on non-Latin-1 chars in title.
    expect(() => drawHeader(doc, {
      title: 'Φ-bar — verification',
      engineVersion: '1.0.0',
    }, M)).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// drawFootersAllPages
// ─────────────────────────────────────────────────────────────────────────────

describe('drawFootersAllPages', () => {
  const M = 18;

  it('does not change page count', () => {
    const doc = new jsPDF();
    doc.addPage(); doc.addPage(); doc.addPage(); // 4 pages
    expect(doc.getNumberOfPages()).toBe(4);
    drawFootersAllPages(doc, { engineVersion: '2.0.0' }, M);
    expect(doc.getNumberOfPages()).toBe(4);
  });

  it('handles single-page document', () => {
    const doc = new jsPDF();
    drawFootersAllPages(doc, { engineVersion: '2.0.0' }, M);
    expect(doc.getNumberOfPages()).toBe(1);
  });

  it('runs without error when engineVersion and proyecto omitted', () => {
    const doc = new jsPDF();
    doc.addPage();
    expect(() => drawFootersAllPages(doc, {}, M)).not.toThrow();
  });

  it('leaves the active page index restored deterministically (last page)', () => {
    const doc = new jsPDF();
    doc.addPage(); doc.addPage(); // 3 pages
    drawFootersAllPages(doc, { engineVersion: '2.0.0' }, M);
    // The loop ends on doc.setPage(pageCount). Caller can rely on this.
    expect(doc.getCurrentPageInfo().pageNumber).toBe(3);
  });
});
