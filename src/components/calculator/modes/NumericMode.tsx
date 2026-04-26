import { useEffect, useRef, useState } from 'react';
import { evalExpr, fmt } from '../eval';
import { showToast } from '../../ui/Toast';

interface NumericModeProps {
  density: 'compact' | 'normal';
}

interface HistEntry { expr: string; val: number; }

export function NumericMode({ density }: NumericModeProps) {
  const [expr, setExpr] = useState('');
  const [history, setHistory] = useState<HistEntry[]>([]);
  const [ans, setAns] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const result = evalExpr(expr);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const append = (s: string) => {
    setExpr((e) => e + s);
    inputRef.current?.focus();
  };
  const clear = () => setExpr('');
  const back = () => setExpr((e) => e.slice(0, -1));
  const equals = () => {
    if (result.ok && result.val != null) {
      setHistory((h) => [{ expr, val: result.val as number }, ...h].slice(0, 8));
      setAns(result.val);
      window.__concretaAns = result.val;
      setExpr(String(result.val));
    }
  };
  const copyResult = () => {
    if (!result.ok || result.val == null) return;
    navigator.clipboard?.writeText(String(result.val));
    showToast('Copiado al portapapeles', { autoDismiss: 1500 });
  };

  const py = density === 'compact' ? 'py-2' : 'py-2.5';
  const btn = `text-[13px] ${py} bg-bg-primary border border-border-main rounded text-text-primary hover:border-accent/50 hover:text-accent transition-colors font-mono active:bg-bg-elevated`;
  const opBtn = `text-[13px] ${py} border rounded font-mono transition-colors`;

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); equals(); }
  };

  return (
    <div className="p-3">
      {/* Display */}
      <div className="bg-bg-primary border border-border-main rounded p-2.5 mb-2.5">
        <input
          ref={inputRef}
          value={expr}
          onChange={(e) => setExpr(e.target.value)}
          onKeyDown={onKey}
          placeholder="0"
          spellCheck={false}
          className="w-full bg-transparent border-0 outline-none text-right font-mono text-[18px] text-text-primary placeholder-text-disabled"
          aria-label="Expresión"
        />
        <div
          className="text-right font-mono text-[12px] mt-1 min-h-[16px]"
          style={{ color: result.ok ? '#38bdf8' : (expr ? '#ef4444' : '#475569') }}
        >
          {expr ? (result.ok ? `= ${fmt(result.val)}` : result.err) : (ans != null ? `ANS = ${fmt(ans)}` : '—')}
        </div>
      </div>

      {/* History strip */}
      {history.length > 0 && (
        <div className="mb-2.5 max-h-16 overflow-y-auto border-b border-border-sub pb-2">
          {history.slice(0, 3).map((h, i) => (
            <button
              key={i}
              onClick={() => setExpr(String(h.val))}
              className="flex items-center justify-between w-full text-left px-1 py-0.5 hover:bg-bg-elevated rounded"
            >
              <span className="font-mono text-[10px] text-text-disabled truncate">{h.expr}</span>
              <span className="font-mono text-[11px] text-accent ml-2">{fmt(h.val)}</span>
            </button>
          ))}
        </div>
      )}

      {/* Function row */}
      <div className="grid grid-cols-5 gap-1 mb-1">
        {['sin(', 'cos(', 'tan(', 'ln(', 'log('].map((s) => (
          <button
            key={s}
            onClick={() => append(s)}
            className={`${opBtn} text-[11px] py-1.5 bg-bg-surface border-border-sub text-text-secondary hover:text-accent hover:border-accent/40`}
          >
            {s.replace('(', '')}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-5 gap-1 mb-1">
        <button onClick={() => append('sqrt(')} className={`${opBtn} py-1.5 bg-bg-surface border-border-sub text-text-secondary hover:text-accent`}>√</button>
        <button onClick={() => append('^')} className={`${opBtn} py-1.5 bg-bg-surface border-border-sub text-text-secondary hover:text-accent`}>x^y</button>
        <button onClick={() => append('PI')} className={`${opBtn} py-1.5 bg-bg-surface border-border-sub text-text-secondary hover:text-accent`}>π</button>
        <button onClick={() => append('(')} className={`${opBtn} py-1.5 bg-bg-surface border-border-sub text-text-secondary hover:text-accent`}>(</button>
        <button onClick={() => append(')')} className={`${opBtn} py-1.5 bg-bg-surface border-border-sub text-text-secondary hover:text-accent`}>)</button>
      </div>

      {/* Number pad */}
      <div className="grid grid-cols-4 gap-1 mb-1">
        <button onClick={clear} className={`${opBtn} ${py} bg-state-fail/10 border-state-fail/30 text-state-fail hover:bg-state-fail/15`}>C</button>
        <button onClick={back} className={btn}>←</button>
        <button onClick={() => append('%')} className={btn}>%</button>
        <button onClick={() => append('/')} className={`${btn} text-accent`}>÷</button>

        <button onClick={() => append('7')} className={btn}>7</button>
        <button onClick={() => append('8')} className={btn}>8</button>
        <button onClick={() => append('9')} className={btn}>9</button>
        <button onClick={() => append('*')} className={`${btn} text-accent`}>×</button>

        <button onClick={() => append('4')} className={btn}>4</button>
        <button onClick={() => append('5')} className={btn}>5</button>
        <button onClick={() => append('6')} className={btn}>6</button>
        <button onClick={() => append('-')} className={`${btn} text-accent`}>−</button>

        <button onClick={() => append('1')} className={btn}>1</button>
        <button onClick={() => append('2')} className={btn}>2</button>
        <button onClick={() => append('3')} className={btn}>3</button>
        <button onClick={() => append('+')} className={`${btn} text-accent`}>+</button>

        <button onClick={() => append('0')} className={`${btn} col-span-2`}>0</button>
        <button onClick={() => append('.')} className={btn}>.</button>
        <button onClick={equals} className={`${opBtn} ${py} bg-accent/15 border-accent/40 text-accent hover:bg-accent/25 font-semibold`}>=</button>
      </div>

      {/* Copy footer */}
      <button
        onClick={copyResult}
        disabled={!result.ok}
        className="w-full mt-2 py-1.5 text-[11px] font-medium border border-border-main rounded text-text-secondary hover:text-accent hover:border-accent/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        ⧉ Copiar al portapapeles
      </button>
    </div>
  );
}
