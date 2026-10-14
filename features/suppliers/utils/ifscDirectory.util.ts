/**
 * IFSC → bank / branch lookup via the public Razorpay IFSC directory.
 * Results (including unknown codes) are cached for the session; network failures resolve to null.
 */

export type IfscDirectoryEntry = { bank: string; branch: string };

const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/;
/** Exports and tables wait on this, so a slow directory must not stall them. */
const LOOKUP_TIMEOUT_MS = 4000;
const cache = new Map<string, Promise<IfscDirectoryEntry | null>>();

export function isWellFormedIfsc(value: string | null | undefined): boolean {
  return IFSC_PATTERN.test((value ?? "").trim().toUpperCase());
}

export function lookupIfsc(value: string | null | undefined): Promise<IfscDirectoryEntry | null> {
  const ifsc = (value ?? "").trim().toUpperCase();
  if (!IFSC_PATTERN.test(ifsc)) return Promise.resolve(null);
  let pending = cache.get(ifsc);
  if (!pending) {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS) : null;
    pending = fetch(`https://ifsc.razorpay.com/${ifsc}`, controller ? { signal: controller.signal } : undefined)
      .then(async (res) => {
        if (!res.ok) return null;
        const body = (await res.json()) as { BANK?: string; BRANCH?: string };
        const entry = { bank: (body.BANK ?? "").trim(), branch: (body.BRANCH ?? "").trim() };
        return entry.bank || entry.branch ? entry : null;
      })
      .catch(() => {
        // Timeouts / offline are not cached so a later call can retry.
        cache.delete(ifsc);
        return null;
      })
      .finally(() => {
        if (timer) clearTimeout(timer);
      });
    cache.set(ifsc, pending);
  }
  return pending;
}

/** Stored branch wins; otherwise the directory branch for the IFSC. */
export async function resolveBankBranch(stored: string | null | undefined, ifsc: string | null | undefined) {
  const saved = stored?.trim();
  if (saved) return saved;
  return (await lookupIfsc(ifsc))?.branch ?? "";
}
