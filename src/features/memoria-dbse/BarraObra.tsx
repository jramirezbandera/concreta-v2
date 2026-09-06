/**
 * ¿Qué obra es? — una fila con los cinco datos del contexto de obra (nombre,
 * uso, provincia, municipio, altitud), cada uno con su estado, y los dos
 * botones que lo sincronizan con `concreta-obra`. Es el primer módulo que
 * escribe la denominación y el uso en el contexto: los demás sólo leían.
 *
 * Duplicada de la de Cargas por planta a propósito: aquélla lleva su rótulo y
 * su nota de ψ de nieve, y ésta dos campos más y los estados. Cuando llegue el
 * Anejo habrá tres barras casi iguales y se extraerá una.
 */

import type { ReactNode } from 'react';
import { RawNumberInput } from '../../components/units/RawNumberInput';
import type { FichaDatos } from '../../lib/memoria/ensamblar';
import type { Obra } from '../../lib/obra';
import { PROVINCIA_OPCIONES } from '../viento-nieve/catalogos';
import { OBRA, USOS_SUGERIDOS } from './catalogos';
import { idDom } from './ids';
import { AMBAR, HUECO } from '../../components/ui/estados';
import { BOTON_CONFIRMAR, BOTON_MENOR, INPUT_SUELTO } from './estilos';

interface Props {
  obra: FichaDatos['obra'];
  obraGuardada: Obra | null;
  ayuda: boolean;
  onTeclear: (id: string, valor: unknown) => void;
  onConfirmar: (id: string) => void;
  onUsarObra: () => void;
  onGuardarObra: () => void;
  /** El contador de huecos y los botones, alineados a la derecha de la misma fila. */
  derecha?: ReactNode;
}

/** El tinte y el botón de confirmar de un dato de obra, alrededor de su caja. */
function Dato({ valor, children }: { valor: FichaDatos['obra'][keyof Omit<FichaDatos['obra'], 'provinciaNombre'>]; children: ReactNode; onConfirmar: (id: string) => void }) {
  const tinte = valor.estado === 'falta' ? HUECO : valor.estado === 'heredado' ? AMBAR : undefined;
  return (
    <span className={['flex shrink-0 items-center gap-1', tinte ? 'rounded px-1 py-0.5' : ''].join(' ')} style={tinte}>
      {children}
    </span>
  );
}

export function BarraObra({ obra, obraGuardada, ayuda, onTeclear, onConfirmar, onUsarObra, onGuardarObra, derecha }: Props) {
  const g = obraGuardada;
  const distinta =
    g !== null &&
    (g.denominacion !== (obra.denominacion.valor ?? '') ||
      g.uso !== (obra.uso.valor ?? '') ||
      g.provincia !== (obra.provincia.valor ?? '') ||
      g.municipio !== (obra.municipio.valor ?? '') ||
      g.altitud !== obra.altitud.valor);
  const hayAlgo = Boolean(obra.denominacion.valor || obra.provincia.valor || obra.municipio.valor);
  const confirmar = (v: { estado: string; id?: string }) =>
    v.estado === 'heredado' && v.id ? (
      <button type="button" className={BOTON_CONFIRMAR} onClick={() => onConfirmar(v.id!)} title="Es de la obra anterior: confírmelo o cámbielo">
        ✓
      </button>
    ) : null;

  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 border-b border-border-main bg-bg-surface px-3 py-1.5">
      <span className="shrink-0 text-[11.5px] text-text-secondary">¿Qué obra es?</span>

      <Dato valor={obra.denominacion} onConfirmar={onConfirmar}>
        <input
          type="text"
          id={idDom('obra.denominacion')}
          value={obra.denominacion.valor ?? ''}
          aria-label={OBRA.denominacion.etiqueta}
          placeholder={OBRA.denominacion.placeholder}
          title={OBRA.denominacion.ayuda}
          className={INPUT_SUELTO + ' w-56'}
          onChange={(ev) => onTeclear('obra.denominacion', ev.target.value)}
        />
        {confirmar(obra.denominacion)}
      </Dato>

      <Dato valor={obra.uso} onConfirmar={onConfirmar}>
        <input
          type="text"
          id={idDom('obra.uso')}
          list="memoria-usos"
          value={obra.uso.valor ?? ''}
          aria-label={OBRA.uso.etiqueta}
          placeholder={OBRA.uso.placeholder}
          title={OBRA.uso.ayuda}
          className={INPUT_SUELTO + ' w-44'}
          onChange={(ev) => onTeclear('obra.uso', ev.target.value)}
        />
        <datalist id="memoria-usos">
          {USOS_SUGERIDOS.map((u) => (
            <option key={u} value={u} />
          ))}
        </datalist>
        {confirmar(obra.uso)}
      </Dato>

      <Dato valor={obra.provincia} onConfirmar={onConfirmar}>
        <select id={idDom('obra.provincia')} value={obra.provincia.valor ?? ''} aria-label="Provincia" className={INPUT_SUELTO + ' w-36'} onChange={(ev) => onTeclear('obra.provincia', ev.target.value)}>
          <option value="">Provincia</option>
          {PROVINCIA_OPCIONES.map((o) => (
            <option key={o.ine} value={o.ine}>
              {o.nombre}
            </option>
          ))}
        </select>
        {confirmar(obra.provincia)}
      </Dato>

      <Dato valor={obra.municipio} onConfirmar={onConfirmar}>
        <input
          type="text"
          id={idDom('obra.municipio')}
          value={obra.municipio.valor ?? ''}
          aria-label="Municipio"
          placeholder="Municipio"
          className={INPUT_SUELTO + ' w-40'}
          onChange={(ev) => onTeclear('obra.municipio', ev.target.value)}
        />
        {confirmar(obra.municipio)}
      </Dato>

      <Dato valor={obra.altitud} onConfirmar={onConfirmar}>
        <label htmlFor={idDom('obra.altitud')} className="text-[11.5px] text-text-secondary">
          Altitud
        </label>
        <RawNumberInput id={idDom('obra.altitud')} value={obra.altitud.valor ?? NaN} onChange={(v) => onTeclear('obra.altitud', v)} ariaLabel="Altitud" unit="m" min={0} max={4000} widthClass="w-16" />
        {confirmar(obra.altitud)}
      </Dato>

      {g && distinta && (
        <button type="button" onClick={onUsarObra} className={BOTON_MENOR} title="Tomar nombre, uso, provincia, municipio y altitud de los datos de la obra">
          Usar los datos de la obra{g.denominacion ? ` (${g.denominacion})` : g.municipio ? ` (${g.municipio})` : ''}
        </button>
      )}
      {hayAlgo && (g === null || distinta) && (
        <button type="button" onClick={onGuardarObra} className={BOTON_MENOR} title="Guardar estos datos como los de la obra, para que los demás módulos los hereden">
          Guardar como datos de la obra
        </button>
      )}
      {ayuda && !hayAlgo && <span className="text-[11px] text-text-disabled">el nombre y el sitio de la obra encabezan la ficha y comprueban que las publicaciones son de aquí</span>}

      {derecha && <div className="ml-auto flex shrink-0 items-center gap-2">{derecha}</div>}
    </div>
  );
}
