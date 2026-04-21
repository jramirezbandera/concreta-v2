import { useUnitSystem } from "../../lib/units/useUnitSystem";

const BUTTON_BASE =
  "px-2.5 py-1 text-[12px] font-mono transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-accent";

export function UnitSystemToggle() {
  const { system, setSystem, toggleDisabled } = useUnitSystem();
  if (toggleDisabled) return null;

  return (
    <div
      role="group"
      aria-label="Sistema de unidades"
      title="Cambiar sistema de unidades (SI ↔ técnico)"
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
        SI
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
        Téc
      </button>
    </div>
  );
}
