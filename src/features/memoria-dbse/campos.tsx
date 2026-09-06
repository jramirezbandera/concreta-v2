/**
 * Los campos de la ficha: un dato de la obra con su estado y su botón de
 * confirmar, una frase derivada en azul con el chip de su origen, y las cajas
 * de texto, número, área, desplegable e interruptor que van dentro.
 *
 * El `id` de cada control es la ruta del campo con los puntos cambiados por
 * guiones (`campo-obra-geotecnia-empresa`): es lo que «Siguiente hueco» busca
 * en el DOM para llevar el foco. Los controles de un dato heredado confirman
 * con Enter (ver `index.tsx`), así que aquí no se escucha el teclado.
 */

import type { ReactNode } from 'react';
import { Campo } from '../../components/ui/Campo';
import { RawNumberInput } from '../../components/units/RawNumberInput';
import type { Valor } from '../../lib/memoria/model';
import type { Ayuda } from './catalogos';
import { AREA, BOTON_CONFIRMAR, INPUT } from './estilos';

import { idDom } from './ids';

const ORIGEN_TEXTO: Record<string, string> = {
  estudio: 'perfil de estudio',
  norma: 'lo pone la norma',
  obra: 'datos de la obra',
  materiales: 'Cuadro de materiales',
  'viento-nieve': 'Viento y nieve',
  'cargas-planta': 'Cargas por planta',
  sismo: 'Acción sísmica',
};

interface CampoObraProps<T> {
  valor: Valor<T>;
  ayuda: boolean;
  texto: Ayuda;
  onConfirmar: (id: string) => void;
  children: ReactNode;
}

/** Un dato de la capa de obra: etiqueta con su color, tinte del estado, botón «Confirmar» si está heredado. */
export function CampoObra<T>({ valor, ayuda, texto, onConfirmar, children }: CampoObraProps<T>) {
  const accion =
    valor.estado === 'heredado' && valor.id ? (
      <button type="button" className={BOTON_CONFIRMAR} onClick={() => onConfirmar(valor.id!)} title="Es de la obra anterior: confírmelo o cámbielo">
        ✓ Confirmar
      </button>
    ) : null;
  return (
    <Campo etiqueta={texto.etiqueta} ayuda={texto.ayuda} nota={ayuda ? texto.nota : undefined} estado={valor.estado} accion={accion}>
      {children}
    </Campo>
  );
}

/** Una frase que se imprimirá tal cual, en azul, con el chip de dónde sale. */
export function Derivado({ valor, ayuda, etiqueta, children }: { valor: Valor<unknown>; ayuda: boolean; etiqueta?: string; children: ReactNode }) {
  const chip = valor.estado === 'derivado' || valor.estado === 'ok' ? ORIGEN_TEXTO[valor.origen] : valor.estado === 'falta' ? 'falta' : 'revisar';
  const color = valor.estado === 'falta' ? 'text-state-fail' : valor.estado === 'revisar' || valor.estado === 'heredado' ? 'text-state-warn' : 'text-accent';
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      {etiqueta && <span className="text-[11px] text-text-secondary">{etiqueta}</span>}
      <p className={`text-[12px] leading-snug ${color}`}>{children}</p>
      <span className="flex flex-wrap items-center gap-x-2 text-[10px] text-text-disabled">
        <span className="rounded border border-border-sub px-1">{chip}</span>
        {ayuda && valor.nota ? <span>{valor.nota}</span> : null}
      </span>
    </div>
  );
}

// ── Cajas ───────────────────────────────────────────────────────────────────

interface TextoProps {
  id: string;
  valor: string | null;
  placeholder?: string;
  onChange: (v: string) => void;
}

export function Texto({ id, valor, placeholder, onChange }: TextoProps) {
  return <input id={idDom(id)} type="text" className={INPUT} value={valor ?? ''} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />;
}

export function Area({ id, valor, placeholder, onChange }: TextoProps) {
  return <textarea id={idDom(id)} className={AREA} value={valor ?? ''} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />;
}

/** Texto con sugerencias: un `datalist`, que deja escribir otra cosa. */
export function TextoConSugerencias({ id, valor, placeholder, onChange, sugerencias }: TextoProps & { sugerencias: readonly string[] }) {
  const lista = `${idDom(id)}-lista`;
  return (
    <>
      <input id={idDom(id)} type="text" list={lista} className={INPUT} value={valor ?? ''} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      <datalist id={lista}>
        {sugerencias.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </>
  );
}

interface NumeroProps {
  id: string;
  valor: number | null;
  unidad?: string;
  min?: number;
  max?: number;
  onChange: (v: number) => void;
}

export function Numero({ id, valor, unidad, min, max, onChange }: NumeroProps) {
  return <RawNumberInput id={idDom(id)} value={valor ?? NaN} onChange={onChange} unit={unidad} min={min} max={max} widthClass="w-24" />;
}

interface SelectorProps<T extends string> {
  id: string;
  valor: T | null;
  opciones: readonly { id: T; etiqueta: string }[];
  vacio?: string;
  onChange: (v: T | null) => void;
}

export function Selector<T extends string>({ id, valor, opciones, vacio = 'Sin decir', onChange }: SelectorProps<T>) {
  return (
    <select id={idDom(id)} className={INPUT} value={valor ?? ''} onChange={(e) => onChange((e.target.value || null) as T | null)}>
      <option value="">{vacio}</option>
      {opciones.map((o) => (
        <option key={o.id} value={o.id}>
          {o.etiqueta}
        </option>
      ))}
    </select>
  );
}

/** Sí / No, como dos botones: un booleano no tiene estado vacío y con Enter se confirma sin cambiarlo. */
export function Interruptor({ id, valor, onChange, si = 'Sí', no = 'No' }: { id: string; valor: boolean; onChange: (v: boolean) => void; si?: string; no?: string }) {
  const boton = (activo: boolean, texto: string, v: boolean) => (
    <button
      type="button"
      id={v ? idDom(id) : undefined}
      aria-pressed={activo}
      onClick={() => onChange(v)}
      className={[
        'rounded border px-2.5 py-0.5 text-[11.5px]',
        activo ? 'border-accent/40 bg-accent/15 text-accent' : 'border-border-main bg-bg-elevated text-text-disabled hover:text-text-secondary',
      ].join(' ')}
    >
      {texto}
    </button>
  );
  return (
    <div className="flex gap-1.5">
      {boton(valor, si, true)}
      {boton(!valor, no, false)}
    </div>
  );
}
