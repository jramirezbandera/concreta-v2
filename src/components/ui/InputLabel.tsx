interface InputLabelProps {
  htmlFor: string;
  label: string;
  sub?: string;
}

// Inline when short, stacked when the combined symbol+description would
// otherwise truncate inside the narrow inputs panel.
const STACK_THRESHOLD = 14;

export function InputLabel({ htmlFor, label, sub }: InputLabelProps) {
  const combinedLen = label.length + (sub ? sub.length + 1 : 0);
  const stack = combinedLen > STACK_THRESHOLD;
  return (
    <label
      htmlFor={htmlFor}
      className={`flex ${stack ? 'flex-col' : 'flex-row items-baseline gap-1'} min-w-0 leading-tight`}
      title={`${label}${sub ? ' ' + sub : ''}`}
    >
      <span className="text-[13px] text-text-secondary truncate">{label}</span>
      {sub && (
        <span className={stack ? 'text-[10px] text-text-disabled truncate' : 'text-[11px] text-text-disabled truncate'}>
          {sub}
        </span>
      )}
    </label>
  );
}
