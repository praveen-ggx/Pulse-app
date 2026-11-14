import { createContext, useContext, type ReactNode } from "react";

export type FinanceFilterDockParts = {
  filters: ReactNode;
  actions: ReactNode;
};

/** Publishes the finance filters and the chart/report icons onto the date row. */
export const FinanceFilterDockContext = createContext<
  ((parts: FinanceFilterDockParts | null) => void) | null
>(null);

export function useFinanceFilterDock() {
  return useContext(FinanceFilterDockContext);
}
