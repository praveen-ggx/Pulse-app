/**
 * Renders children into document.body on web so overlays sit above an already-open
 * RN Modal (Review Hub drawer, sheets). Nested RN Web Modals inherit the first
 * modal's stacking context and can appear clipped at the viewport edge.
 *
 * A sheet opened from inside a Modal must mount inside that modal's focus trap.
 * RN Web pulls focus back into the trap whenever the active element is outside
 * it, which leaves a body-level search field visible but unable to take keys.
 */
import { type ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Platform, type ViewStyle } from "react-native";

/** Above RN Web Modal (~9999) and RegistryWebDrawer (5001). */
export const WEB_OVERLAY_Z = 20000;

export const webFixedFill: ViewStyle =
  Platform.OS === "web"
    ? {
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: WEB_OVERLAY_Z,
        width: "100%",
        height: "100%",
      }
    : {};

/**
 * Parent of the nearest open RN Web modal (`role="dialog"`). That node is the
 * focus trap. Falls back to `document.body` when the anchor is not inside one.
 */
export function resolveWebOverlayHost(anchor: HTMLElement | null): HTMLElement {
  if (typeof document === "undefined") {
    return anchor as HTMLElement;
  }
  let node: HTMLElement | null = anchor;
  while (node && typeof node.getAttribute === "function") {
    if (
      node.getAttribute("role") === "dialog" &&
      node.getAttribute("aria-modal") === "true"
    ) {
      return node.parentElement ?? document.body;
    }
    node = node.parentElement;
  }
  return document.body;
}

export function WebOverlayPortal({
  children,
  host,
}: {
  children: ReactNode;
  /** Mount target. Defaults to document.body. */
  host?: HTMLElement | null;
}) {
  const [ready, setReady] = useState(Platform.OS !== "web");

  useEffect(() => {
    if (Platform.OS === "web") setReady(true);
  }, []);

  if (!ready) return null;
  if (Platform.OS === "web" && typeof document !== "undefined") {
    const target = host && host.isConnected ? host : document.body;
    return createPortal(children, target);
  }
  return <>{children}</>;
}
