import { useEffect, useState } from 'react';
import { FORMULAS } from '../data';
import { fmt } from '../eval';
import { useCalculator } from '../calculator-context';
import { RawNumberInput } from '../../units/RawNumberInput';

export function FormulaMode() {
  const [pickedId, setPickedId] = useState(FORMULAS[0].id);
  const f = FORMULAS.find((x) => x.id === pickedId) ?? FORMULAS[0];
  const [inputs, setInputs] = useState<Record<string, number>>(
    () => Object.fromEntries(f.inputs.map((i) => [i.k, i.def]))
  );
  const { focusedTarget, insertValue } = useCalculator();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset inputs to defaults when the selected formula changes (derived-from-prop reset)
    setInputs(Object.fromEntries(f.inputs.map((i) => [i.k, i.def])));
  }, [pickedId, f.inputs]);

  const result: number | null = (() => {
    try {
      const v = f.calc(inputs);
      return isFinite(v) ? v : null;
    } catch {
      return null;
    }
  })();

  const send = () => {
    if (result == null) return;
    insertValue(result);
  };

  return (
    <div className="p-3">
      {/* Formula picker */}
      <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-text-disabled mb-1.5">Fórmula</p>
      <div className="space-y-0 mb-3 max-h-40 overflow-y-auto border border-border-sub rounded">
        {FORMULAS.map((form) => (
          <button
            key={form.id}
            onClick={() => setPickedId(form.id)}
            className={`w-full text-left px-2 py-1.5 text-[12px] flex items-center justify-between border-b border-border-sub last:border-b-0 transition-colors ${
              pickedId === form.id ? 'bg-accent/10' : 'hover:bg-bg-elevated'
            }`}
          >
            <span className={pickedId === form.id ? 'text-accent' : 'text-text-secondary'}>{form.label}</span>
            <span className="font-mono text-[10px] text-text-disabled">{form.out}</span>
          </button>
        ))}
      </div>

      {/* Description */}
      <p className="text-[11px] text-text-secondary mb-2 leading-snug">{f.desc}</p>

      {/* Inputs */}
      <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-text-disabled mb-1.5">Datos</p>
      <div className="space-y-1 mb-3">
        {f.inputs.map((i) => (
          <div key={i.k} className="flex items-center justify-between gap-2 min-w-0">
            <span className="text-[12px] text-text-secondary truncate">{i.label}</span>
            <RawNumberInput
              value={inputs[i.k]}
              onChange={(v) => setInputs((s) => ({ ...s, [i.k]: v }))}
              unit={i.unit ?? ''}
              ariaLabel={i.label}
              widthClass="w-20"
            />
          </div>
        ))}
      </div>

      {/* Result */}
      <div
        className="flex items-center justify-between border border-accent/40 rounded px-3 py-2 mb-2"
        style={{ background: 'var(--color-tint-accent-soft)' }}
      >
        <span className="text-[11px] font-mono text-accent uppercase tracking-[0.07em]">Resultado</span>
        <span className="font-mono text-[15px] text-accent tabular-nums font-medium">
          {result != null ? `${fmt(result)} ${f.out}` : '—'}
        </span>
      </div>

      <button
        onClick={send}
        disabled={result == null}
        title={focusedTarget ? `Insertar resultado en ${focusedTarget.label}` : 'Copiar resultado al portapapeles'}
        className="w-full py-1.5 text-[11px] font-medium border border-border-main rounded text-text-secondary hover:text-accent hover:border-accent/40 disabled:opacity-40 transition-colors truncate"
      >
        {focusedTarget ? `↳ Insertar en ${focusedTarget.label}` : '⧉ Copiar resultado'}
      </button>
    </div>
  );
}
