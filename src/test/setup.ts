import "@testing-library/jest-dom";

// jsdom doesn't ship ResizeObserver — Canvas (and other SVG-based components)
// expect it to exist.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

// jsdom doesn't ship IntersectionObserver — the blog post TOC scroll-spy needs it.
if (typeof globalThis.IntersectionObserver === 'undefined') {
  globalThis.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return []; }
    root = null;
    rootMargin = '';
    thresholds = [];
  } as unknown as typeof IntersectionObserver;
}

// jsdom URL.createObjectURL is unimplemented; PDF export needs it.
if (typeof URL.createObjectURL !== 'function') {
  URL.createObjectURL = () => 'blob:mock';
}
if (typeof URL.revokeObjectURL !== 'function') {
  URL.revokeObjectURL = () => {};
}
