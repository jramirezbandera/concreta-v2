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

// jsdom no trae `matchMedia`, y eso era una trampa latente: `useMediaQuery`
// se protege devolviendo `false`, lo que ACIERTA por accidente con las
// consultas `max-width` —«no es móvil», que es lo que los tests esperan— y
// FALLA con las `min-width`, donde «false» significa lo contrario de escritorio.
// Con el umbral propio del asistente (`min-width: 768px`) eso dejaba al
// asistente en modo estrecho en todos los tests sin que nadie lo pidiera.
//
// Este doble contesta contra un ancho de escritorio fijo, que es el contexto en
// el que corren los tests salvo que uno diga otra cosa. Un test que quiera
// pantalla estrecha sobrescribe `window.matchMedia` a su gusto.
const ANCHO_TEST = 1280;
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = ((query: string): MediaQueryList => {
    const min = /\(min-width:\s*(\d+)px\)/.exec(query);
    const max = /\(max-width:\s*(\d+)px\)/.exec(query);
    let matches = false;
    if (min) matches = ANCHO_TEST >= Number(min[1]);
    else if (max) matches = ANCHO_TEST <= Number(max[1]);
    // El resto (prefers-reduced-motion, prefers-color-scheme…) se queda en
    // `false`, que es el valor por defecto del navegador.
    return {
      matches,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    } as unknown as MediaQueryList;
  }) as typeof window.matchMedia;
}

// jsdom URL.createObjectURL is unimplemented; PDF export needs it.
if (typeof URL.createObjectURL !== 'function') {
  URL.createObjectURL = () => 'blob:mock';
}
if (typeof URL.revokeObjectURL !== 'function') {
  URL.revokeObjectURL = () => {};
}
