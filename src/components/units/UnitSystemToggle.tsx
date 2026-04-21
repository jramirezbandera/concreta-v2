import { ArrowLeftRight } from "lucide-react";
import { useUnitSystem } from "../../lib/units/useUnitSystem";

const SI_LABEL = "N/mm²";
const TECNICO_LABEL = "kg/cm²";

const BUTTON_BASE =
  "px-2.5 py-1 text-[12px] font-mono transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-accent";

export function UnitSystemToggle() {
  const { system, setSystem, toggleDisabled } = useUnitSystem();
  if (toggleDisabled) return null;

  const currentLabel = system === "si" ? SI_LABEL : TECNICO_LABEL;
  const nextSystem = system === "si" ? "tecnico" : "si";
  const nextLabel = system === "si" ? TECNICO_LABEL : SI_LABEL;

  return (
    <>
      {/* Desktop: segmented control with both unit labels */}
      <div
        role="group"
        aria-label="Sistema de unidades"
        title="Cambiar sistema de unidades"
        className="hidden sm:inline-flex items-stretch rounded border border-border-main overflow-hidden"
      >
        <button
          type="button"
          onClick={() => setSystem("si")}
          aria-pressed={system === "si"}
          className={`${BUTTON_BASE} ${
            system === "si"
              ? "bg-accent/10 text-accent"
              : "text-text-secondary hover:text-text-primary hover:bg-bg-elevated"
          }`}
        >
          {SI_LABEL}
        </button>
        <span className="w-px bg-border-main" aria-hidden="true" />
        <button
          type="button"
          onClick={() => setSystem("tecnico")}
          aria-pressed={system === "tecnico"}
          className={`${BUTTON_BASE} ${
            system === "tecnico"
              ? "bg-accent/10 text-accent"
              : "text-text-secondary hover:text-text-primary hover:bg-bg-elevated"
          }`}
        >
          {TECNICO_LABEL}
        </button>
      </div>

      {/* Mobile: icon-only cycle button — accent when técnico is active */}
      <button
        type="button"
        onClick={() => setSystem(nextSystem)}
        aria-pressed={system === "tecnico"}
        aria-label={`Sistema de unidades: ${currentLabel}. Cambiar a ${nextLabel}.`}
        title={`Unidades: ${currentLabel} — toca para cambiar`}
        className={`sm:hidden inline-flex items-center justify-center p-1.5 rounded border transition-colors ${
          system === "tecnico"
            ? "bg-accent/10 border-accent/40 text-accent"
            : "border-border-main text-text-secondary hover:text-text-primary hover:bg-bg-elevated"
        }`}
      >
        <ArrowLeftRight size={14} aria-hidden="true" />
      </button>
    </>
  );
}
