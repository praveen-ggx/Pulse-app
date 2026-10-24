import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { ChangeDriverPopupHost } from "@/features/trips/components/reassign/ChangeDriverPopupHost";

export type ChangeDriverPopupContextValue = {
  openChangeDriver: (tripId: string) => void;
  closeChangeDriver: () => void;
  activeTripId: string | null;
};

const ChangeDriverPopupContext =
  createContext<ChangeDriverPopupContextValue | null>(null);

export function useOptionalChangeDriverPopup(): ChangeDriverPopupContextValue | null {
  return useContext(ChangeDriverPopupContext);
}

export function useChangeDriverPopup(): ChangeDriverPopupContextValue {
  const value = useContext(ChangeDriverPopupContext);
  if (!value) {
    throw new Error("useChangeDriverPopup must be used within ChangeDriverPopupProvider");
  }
  return value;
}

export function ChangeDriverPopupProvider({ children }: { children: ReactNode }) {
  const [tripId, setTripId] = useState<string | null>(null);

  const openChangeDriver = useCallback((nextTripId: string) => {
    const id = nextTripId.trim();
    if (!id) return;
    setTripId(id);
  }, []);

  const closeChangeDriver = useCallback(() => {
    setTripId(null);
  }, []);

  const value = useMemo(
    (): ChangeDriverPopupContextValue => ({
      openChangeDriver,
      closeChangeDriver,
      activeTripId: tripId,
    }),
    [closeChangeDriver, openChangeDriver, tripId],
  );

  return (
    <ChangeDriverPopupContext.Provider value={value}>
      {children}
      <ChangeDriverPopupHost tripId={tripId} onClose={closeChangeDriver} />
    </ChangeDriverPopupContext.Provider>
  );
}
