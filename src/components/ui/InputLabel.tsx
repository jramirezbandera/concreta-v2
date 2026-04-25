interface InputLabelProps {
  htmlFor: string;
  label: string;
  sub?: string;
}

// Stacked only for fck/fyk where the description (Característica hormigón /
// Característica acero) carries semantic weight; everything else inline.
export function InputLabel({ htmlFor, label, sub }: InputLabelProps) {
  const stack = label === 'fck' || label === 'fyk';
  if (stack) {
    return (
      <label
        htmlFor={htmlFor}
        className="flex flex-col min-w-0 leading-tight"
        title={`${label}${sub ? ' ' + sub : ''}`}
      >
        <span className="text-[13px] text-text-secondary truncate">{label}</span>
        {sub && <span className="text-[10px] text-text-disabled truncate">{sub}</span>}
      </label>
    );
  }
  return (
    <label
      htmlFor={htmlFor}
      className="text-[13px] text-text-secondary truncate min-w-0"
      title={`${label}${sub ? ' ' + sub : ''}`}
    >
      {label}
      {sub && <span className="text-[11px] text-text-disabled ml-1">{sub}</span>}
    </label>
  );
}
