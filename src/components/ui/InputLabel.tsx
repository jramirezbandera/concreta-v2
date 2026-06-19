import { LABELS, type Label, type LabelKey } from '../../lib/text/labels';
import { HelpTooltip } from './HelpTooltip';

interface InputLabelProps {
  htmlFor?: string;
  /**
   * Resuelve `sym`/`descShort`/`help`/`ref` desde el catálogo LABELS. Cuando se
   * pasa, los wrappers de módulo no tienen que resolver el catálogo a mano: un
   * campo nuevo del catálogo (hoy `help`) no obliga a re-tocar cada wrapper.
   */
  labelKey?: LabelKey;
  /** Override del label cuando no hay labelKey (campos no catalogados). */
  label?: string;
  /** Override del sub. */
  sub?: string;
  /**
   * Texto de ayuda → pinta el icono ⓘ. Override del `LABELS[labelKey].help`
   * (regla catálogo = default, call site = verdad). Permite ayuda dinámica
   * dependiente de estado (ej. Lcr según tipo de viga).
   */
  help?: string;
  /** Clases extra para el contenedor (ej. `whitespace-nowrap` en la fila L). */
  className?: string;
}

// Stacked solo para fck/fyk, donde el descShort (Característica hormigón /
// Característica acero) carga peso semántico; el resto inline.
export function InputLabel({ htmlFor, labelKey, label, sub, help, className }: InputLabelProps) {
  let resolvedLabel: string;
  let resolvedSub: string | undefined;
  let resolvedHelp: string | undefined;
  let resolvedRef: string | undefined;

  if (labelKey) {
    // `as const` en LABELS estrecha cada entrada y oculta los opcionales
    // (help/ref); tipar como Label los expone.
    const L: Label = LABELS[labelKey];
    // Cuando el símbolo está vacío (selects como loadType), el label ES el
    // descShort y no hay sub — así el icono ⓘ cae al final de ese texto.
    if (L.sym) {
      resolvedLabel = L.sym;
      resolvedSub = L.descShort;
    } else {
      resolvedLabel = L.descShort;
      resolvedSub = undefined;
    }
    resolvedHelp = help ?? L.help;
    resolvedRef = L.ref;
  } else {
    resolvedLabel = label ?? '';
    resolvedSub = sub;
    resolvedHelp = help;
    resolvedRef = undefined;
  }

  // Suprimir el title nativo cuando hay tooltip (evita doble tooltip).
  const title = resolvedHelp
    ? undefined
    : `${resolvedLabel}${resolvedSub ? ' ' + resolvedSub : ''}`;
  const fieldLabel = `${resolvedLabel}${resolvedSub ? ' ' + resolvedSub : ''}`.trim();

  const icon = resolvedHelp ? (
    <HelpTooltip text={resolvedHelp} refText={resolvedRef} fieldLabel={fieldLabel} />
  ) : null;

  const stack = resolvedLabel === 'fck' || resolvedLabel === 'fyk';

  if (stack) {
    return (
      <span className={`flex items-start gap-1 min-w-0 ${className ?? ''}`}>
        <label htmlFor={htmlFor} className="flex flex-col min-w-0 leading-tight" title={title}>
          <span className="text-[13px] text-text-secondary truncate">{resolvedLabel}</span>
          {resolvedSub && (
            <span className="text-[10px] text-text-disabled truncate">{resolvedSub}</span>
          )}
        </label>
        {icon}
      </span>
    );
  }

  return (
    <span className={`flex items-center gap-1 min-w-0 ${className ?? ''}`}>
      <label
        htmlFor={htmlFor}
        className="text-[13px] text-text-secondary truncate min-w-0"
        title={title}
      >
        {resolvedLabel}
        {resolvedSub && (
          <span className="text-[11px] text-text-disabled ml-1">{resolvedSub}</span>
        )}
      </label>
      {icon}
    </span>
  );
}
