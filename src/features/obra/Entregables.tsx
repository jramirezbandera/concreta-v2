/**
 * Los documentos que salen de una obra, dibujados: la justificación del DB SE,
 * el anejo de cálculo y los cuadros del plano.
 *
 * Viven aparte del panel porque los usa también la landing, para enseñar lo
 * que se entrega con la misma pieza que lo enseña la app —como la vista previa
 * del asistente usa la `ProposalCard` de verdad—, y así no pueden divergir.
 */

import { Link } from 'react-router';
import { destinoDe, palabraDe } from '../../components/ui/estadoFila';
import { Marca } from '../../components/ui/FilaEstado';

export type HojaTipo = 'ficha' | 'anejo' | 'plano';

/**
 * Una de las salidas de la obra: su hoja dibujada, qué es, y en qué está.
 *
 * Lleva a su pantalla (`a`) o hace algo (`onClick`), nunca las dos. Las dos
 * primeras navegan —la ficha y el anejo tienen dónde mirarse—; los cuadros del
 * plano no tienen pantalla y lo único que se hace con ellos es bajarlos, así
 * que su tarjeta es un botón. Se dice en voz alta con `accion`, porque una
 * tarjeta que descarga con la misma pinta que una que navega sería una
 * descarga sorpresa.
 */
export function Documento({
  hoja,
  titulo,
  nota,
  estado,
  pie,
  a,
  onClick,
  accion,
  ocupado,
}: {
  hoja: HojaTipo;
  titulo: string;
  nota: string;
  estado: 'hecho' | 'falta' | 'revisar' | 'sinEmpezar';
  pie?: string;
  a?: string;
  onClick?: () => void;
  accion?: string;
  /** Mientras se genera el fichero: ni un segundo clic ni dos descargas. */
  ocupado?: boolean;
}) {
  const caja = 'flex w-full gap-3.5 border-b border-border-sub p-3.5 text-left transition-colors last:border-b-0 hover:bg-bg-elevated';
  const etiqueta = `${titulo}: ${palabraDe(estado)}${pie ? `, ${pie}` : ''}. ${nota} ${a ? destinoDe(estado) : (accion ?? '')}`;
  const dentro = (
    <>
      <Hoja tipo={hoja} apagada={estado === 'falta' || estado === 'sinEmpezar'} />
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="text-[13px] font-medium text-text-primary">{titulo}</span>
        <span className="text-[11.5px] leading-relaxed text-text-secondary">{nota}</span>
        <span className="flex items-center gap-1.5">
          <Marca estado={estado} />
          {pie && <span className="min-w-0 truncate text-[11px] text-text-secondary">{pie}</span>}
          {accion && <span className="min-w-0 truncate text-[11px] text-accent">{accion}</span>}
        </span>
      </span>
    </>
  );
  return a !== undefined ? (
    <Link to={a} className={caja} aria-label={etiqueta}>
      {dentro}
    </Link>
  ) : (
    <button type="button" onClick={onClick} disabled={ocupado} className={`${caja} disabled:opacity-60`} aria-label={etiqueta}>
      {dentro}
    </button>
  );
}

/**
 * La hoja de un documento. Es lo único de esta pantalla que no es texto, y va
 * a propósito: sin ella el panel no enseña en ningún sitio LO QUE SE ENTREGA,
 * que es para lo que se abre la app.
 */
export function Hoja({ tipo, apagada }: { tipo: HojaTipo; apagada: boolean }) {
  const borde = apagada ? 'var(--color-border-main)' : 'var(--color-text-disabled)';
  const linea = 'var(--color-border-main)';
  /** Lo que la hoja destaca. Apagada, se funde con el resto del dibujo. */
  const acento = apagada ? linea : 'var(--color-accent)';
  return (
    <svg width="56" height="74" viewBox="0 0 64 85" className="shrink-0" aria-hidden="true">
      <rect x="7" y="5" width="52" height="76" rx="1" fill="var(--color-bg-primary)" stroke={linea} />
      <rect x="1" y="0.5" width="52" height="76" rx="1" fill="var(--color-bg-primary)" stroke={borde} />
      <g transform="translate(-7,-9)">
        {tipo === 'ficha' ? (
          <>
            <rect x="12" y="14" width="22" height="3" rx="1" fill={linea} />
            <rect x="12" y="23" width="32" height="1.6" rx="0.8" fill={linea} />
            <rect x="12" y="28" width="28" height="1.6" rx="0.8" fill={linea} />
            <rect x="12" y="36" width="32" height="20" fill="none" stroke={linea} strokeWidth="1" />
            <path d="M12 43h32M12 50h32M23 36v20M34 36v20" stroke={linea} strokeWidth="0.8" />
            <rect x="12" y="62" width="20" height="1.6" rx="0.8" fill={linea} />
          </>
        ) : tipo === 'plano' ? (
          // Un plano, no un documento: sin un solo renglón —un plano no se lee,
          // se mira— y con su cajetín en el pie. Lo que lleva encima son los
          // cuadros, que es exactamente lo que se entrega aquí: tres, del
          // tamaño que salen, no una planta dibujada. Se probó con la planta a
          // un lado y a este tamaño no se distinguía de otra tabla.
          //
          // El contorno va en acento y la rejilla de dentro en gris: con los
          // tres cuadros enteros en acento, la hoja pesaba el triple que la del
          // anejo, que es su vecina en el raíl.
          <>
            <path d="M12 15h34v12H12z" fill="none" stroke={acento} strokeWidth="1" />
            <path d="M12 19h34M24 15v12M35 15v12" stroke={linea} strokeWidth="0.6" />
            <path d="M12 31h34v10H12z" fill="none" stroke={acento} strokeWidth="1" />
            <path d="M12 35h34M24 31v10M35 31v10" stroke={linea} strokeWidth="0.6" />
            <path d="M12 45h22v8H12z" fill="none" stroke={acento} strokeWidth="1" />
            <path d="M12 49h22M24 45v8" stroke={linea} strokeWidth="0.6" />
            <path d="M30 58h16v8H30z" fill="none" stroke={linea} strokeWidth="1" />
            <path d="M30 62h16" stroke={linea} strokeWidth="0.7" />
          </>
        ) : (
          <>
            <rect x="12" y="14" width="18" height="3" rx="1" fill={linea} />
            <rect x="12" y="23" width="32" height="1.6" rx="0.8" fill={linea} />
            <rect x="12" y="28" width="30" height="1.6" rx="0.8" fill={linea} />
            <rect x="12" y="33" width="32" height="1.6" rx="0.8" fill={linea} />
            <path d="M12 40v20h33" stroke={linea} strokeWidth="0.9" fill="none" />
            <path d="M13 57l7-9 6 5 5-8 5 6 6-11" fill="none" stroke={acento} strokeWidth="1.2" strokeLinejoin="round" />
            <rect x="12" y="66" width="22" height="1.6" rx="0.8" fill={linea} />
          </>
        )}
      </g>
    </svg>
  );
}
