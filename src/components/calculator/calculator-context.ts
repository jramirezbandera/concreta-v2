import { createContext, useContext } from 'react';

type EditableInput = HTMLInputElement | HTMLTextAreaElement;

export interface FocusedTarget {
  element: EditableInput;
  label: string;
}

export interface CalculatorContextValue {
  open: () => void;
  close: () => void;
  toggle: () => void;
  isOpen: boolean;
  /** The most recently focused module input (outside the calculator). */
  focusedTarget: FocusedTarget | null;
  /** Insert a numeric value into the focused target, falling back to the clipboard. */
  insertValue: (value: number) => void;
}

export const CalculatorContext = createContext<CalculatorContextValue>({
  open: () => {},
  close: () => {},
  toggle: () => {},
  isOpen: false,
  focusedTarget: null,
  insertValue: () => {},
});

export function useCalculator() {
  return useContext(CalculatorContext);
}
