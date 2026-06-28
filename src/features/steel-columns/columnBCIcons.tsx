// Iconos SVG de las condiciones de apoyo (columna 10×28). Separados de
// columnBCOptions.ts para cumplir la regla react-refresh (un .tsx solo exporta
// componentes). Usados por BC_OPTIONS y compartidos entre pilares y compresión
// de sección compuesta.

export function SvgPP() {
  return (
    <svg width="10" height="28" viewBox="0 0 10 28" aria-hidden="true">
      <line x1="5" y1="5" x2="5" y2="23" stroke="currentColor" strokeWidth="1.5" />
      <polygon points="5,5 2,2 8,2" fill="none" stroke="currentColor" strokeWidth="1.25" />
      <polygon points="5,23 2,26 8,26" fill="none" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  );
}

export function SvgPF() {
  return (
    <svg width="10" height="28" viewBox="0 0 10 28" aria-hidden="true">
      <line x1="5" y1="5" x2="5" y2="23" stroke="currentColor" strokeWidth="1.5" />
      <polygon points="5,5 2,2 8,2" fill="none" stroke="currentColor" strokeWidth="1.25" />
      <rect x="0" y="23" width="10" height="5" fill="currentColor" opacity="0.35" />
      <line x1="0" y1="23" x2="5" y2="28" stroke="currentColor" strokeWidth="0.75" />
      <line x1="5" y1="23" x2="10" y2="28" stroke="currentColor" strokeWidth="0.75" />
    </svg>
  );
}

export function SvgFF() {
  return (
    <svg width="10" height="28" viewBox="0 0 10 28" aria-hidden="true">
      <rect x="0" y="0" width="10" height="5" fill="currentColor" opacity="0.35" />
      <line x1="0" y1="2" x2="5" y2="5" stroke="currentColor" strokeWidth="0.75" />
      <line x1="5" y1="2" x2="10" y2="5" stroke="currentColor" strokeWidth="0.75" />
      <line x1="5" y1="5" x2="5" y2="23" stroke="currentColor" strokeWidth="1.5" />
      <rect x="0" y="23" width="10" height="5" fill="currentColor" opacity="0.35" />
      <line x1="0" y1="23" x2="5" y2="28" stroke="currentColor" strokeWidth="0.75" />
      <line x1="5" y1="23" x2="10" y2="28" stroke="currentColor" strokeWidth="0.75" />
    </svg>
  );
}

export function SvgFC() {
  return (
    <svg width="10" height="28" viewBox="0 0 10 28" aria-hidden="true">
      <circle cx="5" cy="3" r="2" fill="none" stroke="currentColor" strokeWidth="1.25" />
      <line x1="5" y1="5" x2="5" y2="23" stroke="currentColor" strokeWidth="1.5" />
      <rect x="0" y="23" width="10" height="5" fill="currentColor" opacity="0.35" />
      <line x1="0" y1="23" x2="5" y2="28" stroke="currentColor" strokeWidth="0.75" />
      <line x1="5" y1="23" x2="10" y2="28" stroke="currentColor" strokeWidth="0.75" />
    </svg>
  );
}

export function SvgCustom() {
  return (
    <svg width="10" height="28" viewBox="0 0 10 28" aria-hidden="true">
      <circle cx="5" cy="3" r="2" fill="none" stroke="currentColor" strokeWidth="1.25" />
      <line x1="5" y1="5" x2="5" y2="23" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3,2" />
      <circle cx="5" cy="25" r="2" fill="none" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  );
}
