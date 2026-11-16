import type { ReactNode } from "react";
import { createPortal } from "react-dom";

/** Draw the pickup preview on document.body so the lane list cannot clip it. */
export function mountFilterPreview(node: ReactNode): ReactNode {
  if (typeof document === "undefined") return node;
  return createPortal(node, document.body);
}
