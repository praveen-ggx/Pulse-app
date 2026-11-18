/**
 * DEV-ONLY diagnostic: records AppSessionTree branch selection (splash /
 * public / data-plane) and its inputs, so a branch ping-pong behind a React
 * "Maximum update depth exceeded" can be seen in the console.
 *
 * Pure bookkeeping — no React state, no scheduling. The caller decides when
 * to record (a layout effect) and gates on __DEV__.
 *
 * Privacy: never receives tokens or user ids. Pathname id-like segments
 * (uuids, long numbers, opaque codes) are redacted to `:id`.
 */

export type SessionTreeBranch = 'data-plane' | 'public' | 'splash';

export type SessionTreeSnapshot = {
  branch: SessionTreeBranch;
  pathname: string;
  status: string;
  sessionAttached: boolean;
  cacheOwnedByUser: boolean;
  /** AppSessionTree instance (increments on each mount). */
  instance: number;
};

export type SessionTreeTraceEntry = SessionTreeSnapshot & {
  n: number;
  at: string;
  prevBranch: SessionTreeBranch | null;
  branchChanged: boolean;
  changed: string[];
  /** Set when the branch sequence repeats (A→B→A→B) or flips in a burst. */
  marker: string | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LONG_DIGITS_RE = /^\d{4,}$/;
const OPAQUE_RE = /^(?=.*\d)[A-Za-z0-9_-]{16,}$/;

export function redactPathname(pathname: string | null | undefined): string {
  if (!pathname) return '';
  const [path] = pathname.split(/[?#]/, 1);
  return path
    .split('/')
    .map((seg) =>
      UUID_RE.test(seg) || LONG_DIGITS_RE.test(seg) || OPAQUE_RE.test(seg) ? ':id' : seg,
    )
    .join('/');
}

const BURST_WINDOW_MS = 1000;
const BURST_THRESHOLD = 6;
const HISTORY = 16;

export function createSessionTreeTracer(opts: {
  now?: () => number;
  log?: (entry: SessionTreeTraceEntry) => void;
} = {}) {
  const now = opts.now ?? (() => Date.now());
  const log = opts.log ?? (() => {});
  let n = 0;
  let last: SessionTreeSnapshot | null = null;
  const branchHistory: SessionTreeBranch[] = [];
  const branchChangeTimes: number[] = [];

  return {
    record(input: SessionTreeSnapshot): SessionTreeTraceEntry | null {
      const snap: SessionTreeSnapshot = { ...input, pathname: redactPathname(input.pathname) };
      const changed = last
        ? (Object.keys(snap) as (keyof SessionTreeSnapshot)[]).filter((k) => snap[k] !== last![k])
        : ['initial'];
      if (changed.length === 0) return null;

      const t = now();
      const prevBranch = last?.branch ?? null;
      const branchChanged = prevBranch !== snap.branch;
      let marker: string | null = null;

      if (branchChanged) {
        branchHistory.push(snap.branch);
        if (branchHistory.length > HISTORY) branchHistory.shift();
        branchChangeTimes.push(t);
        while (branchChangeTimes.length && t - branchChangeTimes[0] > BURST_WINDOW_MS) {
          branchChangeTimes.shift();
        }
        const h = branchHistory;
        const len = h.length;
        if (len >= 4 && h[len - 1] === h[len - 3] && h[len - 2] === h[len - 4] && h[len - 1] !== h[len - 2]) {
          marker = `REPEAT ${h[len - 2]}<->${h[len - 1]}`;
        }
        if (branchChangeTimes.length >= BURST_THRESHOLD) {
          const burst = `BURST ${branchChangeTimes.length} branch changes in ${BURST_WINDOW_MS}ms`;
          marker = marker ? `${marker}; ${burst}` : burst;
        }
      }

      n += 1;
      last = snap;
      const entry: SessionTreeTraceEntry = {
        ...snap,
        n,
        at: new Date(t).toISOString(),
        prevBranch,
        branchChanged,
        changed,
        marker,
      };
      log(entry);
      return entry;
    },
  };
}

export function formatSessionTreeTraceEntry(e: SessionTreeTraceEntry): string {
  const head = e.marker ? `[SessionTreeTrace] ⚠ ${e.marker} ` : '[SessionTreeTrace] ';
  return (
    `${head}#${e.n} ${e.at} ${e.prevBranch ?? '∅'} -> ${e.branch}` +
    ` | pathname=${e.pathname || '∅'} status=${e.status}` +
    ` sessionAttached=${e.sessionAttached} cacheOwnedByUser=${e.cacheOwnedByUser}` +
    ` instance=${e.instance} changed=[${e.changed.join(',')}]`
  );
}
