/* eslint-disable react-refresh/only-export-components -- el parseo decimal y el hook que lo usa viven CON los campos que los aplican: separarlos es justo lo que permitiría que el modal de plantas leyera "4,5" de otra manera. HMR full-reload aceptable. */
// Campos numéricos y clases de caja del módulo de sismo.
//
// Vivían dentro de `SeismicInputs.tsx`, que era el único sitio donde se
// tecleaba. Al salir las plantas a su propio cuadro dejó de serlo, y la
// alternativa —copiar el parseo decimal en el segundo editor— es exactamente el
// fallo que este código existe para evitar: dos lecturas distintas de «4,5».

import { useId, useState, type ChangeEvent } from 'react';
import { HelpTooltip } from '../../components/ui/HelpTooltip';
import { InputLabel } from '../../components/ui/InputLabel';
import { textoEditable } from './formato';

export const INPUT_CLS =
  'w-15 text-right bg-bg-primary border border-border-main rounded-l px-1.75 py-1 ' +
  'text-[12px] font-mono text-text-primary outline-none hover:border-accent/40 ' +
  'hover:bg-bg-elevated focus:border-accent focus:bg-bg-elevated transition-colors';
export const UNIT_CLS =
  'bg-bg-elevated border border-l-0 border-border-main rounded-r px-1.25 py-1 ' +
  'text-[10px] text-text-disabled font-mono whitespace-nowrap flex items-center';
export const SELECT_CLS =
  'bg-bg-primary border border-border-main rounded px-1.5 py-1 text-[12px] ' +
  'text-text-primary outline-none hover:border-accent/40 focus:border-accent transition-colors';

// ── Campos numéricos ─────────────────────────────────────────────────────────
//
// TODO input numérico del módulo pasa por `useCampoNumerico`. Antes había dos
// comportamientos distintos: `Num` guardaba el texto tecleado en estado local,
// y los seis campos en línea —las cargas q, la coordenada y la rigidez de cada
// plano, los dos de cada estrato y el T_F impuesto— hacían `parseFloat` sobre
// el value controlado en cada pulsación. En esos seis el separador decimal
// desaparecía bajo el cursor: teclear "4,5" dejaba "45" en pantalla Y 45 en el
// estado. Un factor diez en la carga de una planta, sin ningún aviso, en los
// campos más editados del módulo.

/**
 * Parseo ESTRICTO de un decimal, con coma o con punto.
 *
 * `parseFloat` no vale aquí: se traga la cola y devuelve un número para textos
 * que no lo son ("4x" → 4, y con la coma sin traducir "1,5" → 1). Eso deja en
 * pantalla algo distinto de lo que se ha guardado, que es justo lo que estos
 * campos tienen que dejar de hacer.
 *
 * Devuelve `null` para todo lo que no sea un decimal completo. Ahí caen también
 * los estados intermedios legítimos de tecleo —"", "-", "3,"—, que no se comiten
 * pero tampoco se corrigen bajo el cursor.
 */
export function parsearDecimal(txt: string): number | null {
  const t = txt.trim().replace(',', '.');
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

interface Rango {
  min?: number;
  max?: number;
}

const dentro = (n: number, { min, max }: Rango) =>
  (min === undefined || n >= min) && (max === undefined || n <= max);

/**
 * Estado de texto de un campo numérico. Devuelve las tres props del `<input>`.
 *
 * Dos invariantes:
 *
 *  1. Mientras se teclea manda el texto, para que un decimal a medio escribir no
 *     se reformatee bajo el cursor. Cuando el valor cambia DESDE FUERA (cargar
 *     un caso, elegir municipio, aplicar el asistente) se resincroniza, y se
 *     hace ajustando en render contra el valor anterior —el patrón de React para
 *     esto— y no con un efecto, que encadenaría un render de más.
 *  2. Al salir del campo, lo que se ve ES lo que hay en el estado. Antes el
 *     `onBlur` sólo restauraba con NaN, así que un valor rechazado por el rango
 *     —"0" en K, que tiene mínimo 1— se quedaba en pantalla indefinidamente
 *     mientras el cálculo seguía con el anterior.
 */
export function useCampoNumerico(
  value: number,
  onChange: (v: number) => void,
  rango: Rango = {},
) {
  const [txt, setTxt] = useState(() => textoEditable(value));
  const [previo, setPrevio] = useState(value);
  if (previo !== value) {
    setPrevio(value);
    // Si el texto en pantalla ya representa ese número no se toca: así "0,05"
    // sobrevive a su propio commit en vez de reescribirse como "0.05".
    if (parsearDecimal(txt) !== value) setTxt(textoEditable(value));
  }
  return {
    value: txt,
    onChange: (e: ChangeEvent<HTMLInputElement>) => {
      setTxt(e.target.value);
      const n = parsearDecimal(e.target.value);
      if (n !== null && dentro(n, rango)) onChange(n);
    },
    onBlur: () => {
      if (parsearDecimal(txt) !== value) setTxt(textoEditable(value));
    },
  };
}

/** Input numérico desnudo, para las tablas. Mismo comportamiento que `Num`. */
export function NumIn({
  value,
  onChange,
  etiqueta,
  min,
  max,
  ancho = 'w-14',
}: {
  value: number;
  onChange: (v: number) => void;
  etiqueta: string;
  min?: number;
  max?: number;
  ancho?: string;
}) {
  const campo = useCampoNumerico(value, onChange, { min, max });
  return (
    <input
      type="text"
      inputMode="decimal"
      {...campo}
      className={`${INPUT_CLS} ${ancho} rounded`}
      aria-label={etiqueta}
    />
  );
}

export function Num({
  label,
  sub,
  help,
  value,
  unit,
  onChange,
  min,
  max,
  ancho = 'w-15',
}: {
  label: string;
  sub?: string;
  help?: string;
  value: number;
  unit?: string;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  ancho?: string;
}) {
  const campo = useCampoNumerico(value, onChange, { min, max });
  // `htmlFor`/`id` de verdad: sin ellos el rótulo era decorativo y pulsarlo no
  // llevaba el foco al campo, que es la única forma cómoda de acertar en un
  // input de 60 píxeles. El `aria-label` se mantiene porque lleva la unidad, que
  // el rótulo visible no dice.
  const id = useId();
  return (
    <div className="flex items-center justify-between py-0.75 max-lg:min-h-11 gap-2">
      <InputLabel htmlFor={id} label={label} sub={sub} help={help} />
      <div className="flex shrink-0">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          {...campo}
          className={`${INPUT_CLS} ${ancho}`}
          aria-label={`${label}${unit ? ` (${unit})` : ''}`}
        />
        {unit ? <span className={UNIT_CLS}>{unit}</span> : null}
      </div>
    </div>
  );
}

/**
 * Campo numérico con el rótulo ENCIMA, para los cuadros modales: allí sobra
 * ancho y se lee mejor que la fila rótulo-izquierda / campo-derecha del panel.
 * Nació en el cuadro de plantas; el de geometría lo comparte.
 */
export function Campo({
  label,
  sub,
  help,
  unit,
  value,
  min,
  onChange,
  ancho = 'w-24',
}: {
  label: string;
  sub?: string;
  help?: string;
  unit?: string;
  value: number;
  min?: number;
  onChange: (v: number) => void;
  ancho?: string;
}) {
  const id = useId();
  const campo = useCampoNumerico(value, onChange, { min });
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <span className="flex items-center gap-1 min-w-0">
        <label
          htmlFor={id}
          className="text-[10px] uppercase tracking-[0.07em] text-text-disabled truncate"
        >
          {label}
          {sub ? <span className="normal-case tracking-normal"> · {sub}</span> : null}
        </label>
        {help ? <HelpTooltip text={help} fieldLabel={label} /> : null}
      </span>
      <div className="flex">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          {...campo}
          className={`${INPUT_CLS} ${ancho}`}
          aria-label={`${label}${unit ? ` (${unit})` : ''}`}
        />
        {unit ? <span className={UNIT_CLS}>{unit}</span> : null}
      </div>
    </div>
  );
}
