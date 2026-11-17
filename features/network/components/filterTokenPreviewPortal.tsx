import type { ReactNode } from "react";

/** Native keeps the preview in the filter tree. Web portals it above the list. */
export function mountFilterPreview(node: ReactNode): ReactNode {
  return node;
}
