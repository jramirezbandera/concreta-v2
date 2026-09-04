/**
 * Lo que un DXF R12 sabe escribir, y cómo se le llega.
 *
 * Vive aparte del escritor porque lo necesitan los DOS lados: el que escribe el
 * fichero y el que MIDE si un texto cabe en su celda. Si cada uno aplicara su
 * propio criterio, la maqueta mediría «≤» (un carácter) y el fichero escribiría
 * «<=» (dos), y la nota se saldría del cuadro por la diferencia.
 */

// ── Texto ───────────────────────────────────────────────────────────────────

/**
 * Deja el texto dentro de lo que cp1252 sabe escribir.
 *
 * NO es `pdfStr`: aquel aplana las griegas a palabras («Delta») porque en un
 * anejo de cálculo se lee en prosa. En un cuadro de plano manda la brevedad y
 * la convención de obra, así que γ va a «g» y Δ a «D» — que además es lo que la
 * fuente Symbol dibuja como esas letras.
 */
export function dxfStr(s: string): string {
  return (
    s
      // Griegas: la letra latina que Symbol dibuja como esa griega.
      .replace(/[γϒ]/g, 'g')
      .replace(/Δ/g, 'D')
      .replace(/α/g, 'a')
      .replace(/σ/g, 's')
      .replace(/β/g, 'b')
      .replace(/ρ/g, 'r')
      .replace(/λ/g, 'l')
      .replace(/φ/g, 'f')
      .replace(/ψ/g, 'y')
      .replace(/θ/g, 'q')
      .replace(/ε/g, 'e')
      .replace(/τ/g, 't')
      .replace(/η/g, 'h')
      .replace(/ω/g, 'w')
      .replace(/Ω/g, 'W')
      .replace(/Σ/g, 'S')
      .replace(/Φ/g, 'F')
      .replace(/π/g, 'p')
      .replace(/χ/g, 'c')
      .replace(/δ/g, 'd')
      .replace(/ν/g, 'n')
      .replace(/κ/g, 'k')
      .replace(/ζ/g, 'z')
      .replace(/μ/g, '\xB5') // mu → signo micro, que sí está en cp1252
      // Matemáticos
      .replace(/≤/g, '<=')
      .replace(/≥/g, '>=')
      .replace(/≠/g, '!=')
      .replace(/≈/g, '~')
      .replace(/√/g, 'raiz')
      .replace(/∞/g, 'inf')
      .replace(/[→⇒]/g, '->')
      // Tipografía que Word y el navegador cuelan y cp1252 escribe distinto
      .replace(/[—–]/g, '-')
      .replace(/[''‘’]/g, "'")
      .replace(/[""“”]/g, '"')
      .replace(/…/g, '...')
      .replace(/[⁰¹⁴-⁹]/g, '') // ² y ³ SÍ están en cp1252 y se preservan
      .replace(/[₀-₉]/g, (d) => String('₀₁₂₃₄₅₆₇₈₉'.indexOf(d)))
      // Red de seguridad: cualquier cosa que siga fuera de cp1252 se cae, para
      // que no acabe en el fichero como un byte inventado.
      .replace(/[\u0100-\uFFFF]/g, '')
  );
}

/** cp1252 en el rango que usamos coincide con Latin-1: un carácter, un byte. */
export function aLatin1(s: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(s.length));
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i) & 0xff;
  return bytes;
}
