/**
 * WhatsApp-style chat load helpers.
 *
 * Inbox = meta-only pages. Thread = newest window on open, older on scroll-up.
 * Prefetch is idle/low-priority and must never outrun the open-thread path.
 */

/** Denorm `last_message_at` vs last bubble — same skew as store heal logic. */
export const THREAD_HISTORY_FRESH_SKEW_MS = 1_500;

/** Initial mobile inbox rows before scroll expands the window. */
export const MOBILE_INBOX_INITIAL_VISIBLE = 15;

/** Expand mobile inbox by this many rows on near-end scroll. */
export const MOBILE_INBOX_PAGE_STEP = 20;

/** Neighbor threads to warm after open (idle). */
export const CHAT_PREFETCH_NEIGHBOR_COUNT = 2;

export function isThreadHistoryFresh(
  denormLastMessageAt: string | null | undefined,
  lastBubbleCreatedAt: string | null | undefined,
  skewMs: number = THREAD_HISTORY_FRESH_SKEW_MS,
): boolean {
  if (!denormLastMessageAt) return true;
  const denormMs = Date.parse(denormLastMessageAt);
  if (!Number.isFinite(denormMs)) return true;
  if (!lastBubbleCreatedAt) return false;
  const laneMs = Date.parse(lastBubbleCreatedAt);
  if (!Number.isFinite(laneMs)) return false;
  return denormMs <= laneMs + skewMs;
}

/**
 * Pick conversation ids above/below the open row for idle prefetch.
 * `rows` should be the visible inbox order (newest / focused first).
 */
export function neighborConversationIds(
  rows: ReadonlyArray<{ id: string }>,
  openId: string,
  count: number = CHAT_PREFETCH_NEIGHBOR_COUNT,
): string[] {
  const idx = rows.findIndex((r) => r.id === openId);
  if (idx < 0 || count <= 0) return [];
  const out: string[] = [];
  for (let dist = 1; out.length < count; dist += 1) {
    const before = idx - dist;
    const after = idx + dist;
    if (before < 0 && after >= rows.length) break;
    if (before >= 0) out.push(rows[before]!.id);
    if (out.length >= count) break;
    if (after < rows.length) out.push(rows[after]!.id);
  }
  return out;
}

type IdleHandle = { cancel: () => void };

/**
 * Schedule low-priority work after paint. Uses `requestIdleCallback` when
 * available; otherwise a deferred timeout (WhatsApp-style warm).
 */
export function scheduleChatIdleWork(
  work: () => void,
  timeoutMs: number = 800,
): IdleHandle {
  const ric = (
    globalThis as unknown as {
      requestIdleCallback?: (
        cb: () => void,
        opts?: { timeout: number },
      ) => number;
      cancelIdleCallback?: (id: number) => void;
    }
  ).requestIdleCallback;
  const cic = (
    globalThis as unknown as {
      cancelIdleCallback?: (id: number) => void;
    }
  ).cancelIdleCallback;

  if (typeof ric === "function") {
    const id = ric(() => work(), { timeout: timeoutMs });
    return {
      cancel: () => {
        if (typeof cic === "function") cic(id);
      },
    };
  }

  const t = setTimeout(work, Math.min(timeoutMs, 1_200));
  return { cancel: () => clearTimeout(t) };
}
