import { useEffect } from "react";
import { Platform } from "react-native";

import type { IndianVehicleKeyboardKind } from "@/lib/indianVehicleInput.util";

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable;
}

function numpadDigit(key: string): string | null {
  if (!key.startsWith("Numpad") || key.length !== 7) return null;
  const digit = key.slice(6);
  return /^[0-9]$/.test(digit) ? digit : null;
}

function allowedFromKind(kind: IndianVehicleKeyboardKind): {
  letters: boolean;
  digits: boolean;
} {
  return kind === "letters"
    ? { letters: true, digits: false }
    : { letters: false, digits: true };
}

/**
 * Maps physical keyboard keys to Indian plate / DL keypad presses (web desktop).
 *
 * Prefer `allowed` when both letters and digits can be legal next (variable-length
 * plates). `kind` alone is exclusive and is kept for callers that only need one class.
 */
export function useIndianVehiclePhysicalKeypad({
  enabled,
  kind,
  allowed,
  onKey,
}: {
  enabled: boolean;
  kind?: IndianVehicleKeyboardKind;
  allowed?: { letters: boolean; digits: boolean };
  onKey: (key: string) => void;
}): void {
  useEffect(() => {
    if (!enabled || Platform.OS !== "web") return;
    if (typeof window === "undefined") return;

    const next = allowed ?? (kind ? allowedFromKind(kind) : { letters: false, digits: false });

    const handler = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;

      const { key } = event;

      if (key === "Backspace" || key === "Delete") {
        event.preventDefault();
        onKey("⌫");
        return;
      }

      if (next.letters && /^[a-zA-Z]$/.test(key)) {
        event.preventDefault();
        onKey(key.toUpperCase());
        return;
      }

      if (next.digits) {
        if (/^[0-9]$/.test(key)) {
          event.preventDefault();
          onKey(key);
          return;
        }
        const digit = numpadDigit(key);
        if (digit) {
          event.preventDefault();
          onKey(digit);
        }
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [enabled, kind, allowed, allowed?.letters, allowed?.digits, onKey]);
}
