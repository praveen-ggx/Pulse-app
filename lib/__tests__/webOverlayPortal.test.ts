import { resolveWebOverlayHost } from "@/lib/webOverlayPortal";

describe("resolveWebOverlayHost", () => {
  const dom = typeof document !== "undefined";

  it("mounts inside the open modal focus trap", () => {
    if (!dom) return;
    const trap = document.createElement("div");
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    const field = document.createElement("div");
    trap.appendChild(dialog);
    dialog.appendChild(field);
    document.body.appendChild(trap);

    expect(resolveWebOverlayHost(field)).toBe(trap);

    trap.remove();
  });

  it("falls back to document.body when no modal is open", () => {
    if (!dom) return;
    const field = document.createElement("div");
    document.body.appendChild(field);

    expect(resolveWebOverlayHost(field)).toBe(document.body);
    expect(resolveWebOverlayHost(null)).toBe(document.body);

    field.remove();
  });
});
