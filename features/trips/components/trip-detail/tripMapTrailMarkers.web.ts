/**
 * HTML for the trip map's trail markers (Leaflet divIcons, popup cards and the
 * trip card). Uses only colours already on the Pulse trip map: orange driven
 * route, green pickup, dark orange end, neutral ink for halts, red only for
 * halts over an hour. Pure string builders — no Leaflet import.
 */
import type { TripHalt } from '@/features/trips/utils/tripHalts.util';

export const TRAIL_COLORS = {
  route: '#ea580c',
  routeDark: '#9a3412',
  start: '#059669',
  ink: '#0f172a',
  slate: '#94a3b8',
  longHalt: '#ef4444',
  longHaltText: '#b91c1c',
  selectedHalo: 'rgba(234,88,12,0.22)',
  selectedRow: '#fff7ed',
} as const;

/** Pings closer than this on screen are thinned (zoomed out); all show when zoomed in. */
export const TRAIL_PING_MIN_SPACING_PX = 12;

const FONT = 'Inter,system-ui,-apple-system,Segoe UI,sans-serif';
const NUMS = 'font-variant-numeric:tabular-nums;';

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** True when the trail covers more than one IST calendar day (times then carry the date). */
export function trailSpansDays(pts: { recorded_at?: string }[]): boolean {
  const days = new Set<string>();
  for (const p of pts) {
    if (!p.recorded_at) continue;
    const d = new Date(p.recorded_at);
    if (!Number.isFinite(d.getTime())) continue;
    days.add(d.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }));
    if (days.size > 1) return true;
  }
  return false;
}

export function formatTrailTime(iso: string | undefined, withDate: boolean): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    ...(withDate ? { day: '2-digit', month: 'short' } : {}),
  });
}

export function formatTrailDate(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** "8 min", "1 h 20 min", "2 h". */
export function formatStopDuration(ms: number): string {
  const totalMin = Math.max(0, Math.round(ms / 60_000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** "7 h 22 m" — compact form for the stats row. */
export function formatStatDuration(ms: number): string {
  const totalMin = Math.max(0, Math.round(ms / 60_000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} m`;
  return `${h} h ${m} m`;
}

/** First part of an address ("Peenya Industrial Area, Bengaluru" → "Peenya Industrial Area"). */
export function shortPlaceName(s: string | null | undefined): string {
  const first = (s ?? '').split(',')[0]?.trim() ?? '';
  return first.length > 28 ? `${first.slice(0, 27)}…` : first;
}

// ── Map markers ──────────────────────────────────────────────────────────────

const PILL_BASE =
  `display:flex;align-items:center;gap:6px;height:22px;box-sizing:border-box;padding:0 8px;border-radius:6px;` +
  `color:#ffffff;border:2px solid #ffffff;font:600 11px/1 ${FONT};${NUMS}white-space:nowrap;cursor:pointer;`;
const PILL_SHADOW = '0 1px 4px rgba(15,23,42,0.3)';

/**
 * Halt pill (0×0 divIcon; the pill centres itself on the point).
 * `lifted`: the halt sits on the start/end ring → float the pill above it.
 */
export function haltPillHtml(halt: TripHalt, lifted: boolean): string {
  const ty = lifted ? 'calc(-100% - 14px)' : '-50%';
  const dot =
    halt.severity === 'long'
      ? `<span style="width:6px;height:6px;border-radius:50%;background:${TRAIL_COLORS.longHalt};"></span>`
      : '';
  return (
    `<div data-halt-pill style="position:absolute;left:0;top:0;transform:translate(-50%,${ty});${PILL_BASE}` +
    `background:${TRAIL_COLORS.ink};box-shadow:${PILL_SHADOW};">${dot}${formatStopDuration(halt.durationMs)}</div>`
  );
}

/** Selected halt (card open): route orange with a soft halo. */
export function setHaltPillSelected(markerEl: HTMLElement | null | undefined, selected: boolean): void {
  const pill = markerEl?.querySelector('[data-halt-pill]') as HTMLElement | null;
  if (!pill) return;
  pill.style.background = selected ? TRAIL_COLORS.route : TRAIL_COLORS.ink;
  pill.style.boxShadow = selected ? `0 0 0 4px ${TRAIL_COLORS.selectedHalo},${PILL_SHADOW}` : PILL_SHADOW;
}

const TIME_TAG =
  `position:absolute;top:0;transform:translateY(-50%);padding:3px 8px;background:#ffffff;border-radius:6px;` +
  `box-shadow:0 1px 3px rgba(15,23,42,0.18);font:600 11px/1.3 ${FONT};${NUMS}color:${TRAIL_COLORS.ink};white-space:nowrap;`;

/** Start of tracking: green hollow ring + "Start · 9:05 am" tag (0×0 divIcon). */
export function startMarkerHtml(timeLabel: string): string {
  return (
    `<div style="position:absolute;left:0;top:0;width:16px;height:16px;transform:translate(-50%,-50%);box-sizing:border-box;` +
    `border-radius:50%;background:#ffffff;border:3.5px solid ${TRAIL_COLORS.start};box-shadow:0 1px 3px rgba(15,23,42,0.25);cursor:pointer;"></div>` +
    `<div style="${TIME_TAG}left:14px;pointer-events:none;">Start · ${escapeHtml(timeLabel)}</div>`
  );
}

/** End of tracking: dark-orange solid ring + "End · 6:20 pm" tag, tag on the left. */
export function endMarkerHtml(timeLabel: string): string {
  return (
    `<div style="position:absolute;left:0;top:0;width:18px;height:18px;transform:translate(-50%,-50%);box-sizing:border-box;` +
    `border-radius:50%;background:${TRAIL_COLORS.routeDark};border:3px solid #ffffff;box-shadow:0 1px 4px rgba(15,23,42,0.3);cursor:pointer;` +
    `display:flex;align-items:center;justify-content:center;"><span style="width:5px;height:5px;border-radius:50%;background:#ffffff;"></span></div>` +
    `<div style="${TIME_TAG}right:14px;pointer-events:none;">End · ${escapeHtml(timeLabel)}</div>`
  );
}

/** "No signal · 40 min" tag at the middle of a tracking gap (0×0 divIcon). */
export function gapTagHtml(durationMs: number): string {
  return (
    `<div style="position:absolute;left:0;top:0;transform:translate(-50%,-50%);padding:2px 7px;background:#ffffff;` +
    `border:1px solid #e2e8f0;border-radius:6px;font:500 10px/1.4 ${FONT};${NUMS}color:#64748b;white-space:nowrap;pointer-events:none;">` +
    `No signal · ${formatStopDuration(durationMs)}</div>`
  );
}

// ── Tap card (Leaflet popup content) ─────────────────────────────────────────

export const TRAIL_PLACE_PENDING = 'Finding place…';

/**
 * One card style for every marker: small grey label, one big value, details.
 * `place`: undefined = still looking up, null = not found (line hidden).
 */
export function trailCardHtml(opts: {
  label: string;
  value: string;
  lines: string[];
  place: string | null | undefined;
  warn?: string;
}): string {
  const placeLine =
    opts.place === undefined
      ? `<div style="color:#94a3b8;">${TRAIL_PLACE_PENDING}</div>`
      : opts.place
        ? `<div style="color:#64748b;">Near ${escapeHtml(opts.place)}</div>`
        : '';
  return (
    `<div style="font-family:${FONT};${NUMS}min-width:190px;color:${TRAIL_COLORS.ink};">` +
    `<div style="font-size:10px;font-weight:600;letter-spacing:0.08em;color:#64748b;">${escapeHtml(opts.label.toUpperCase())}</div>` +
    `<div style="margin-top:4px;font-size:19px;font-weight:700;letter-spacing:-0.01em;">${escapeHtml(opts.value)}</div>` +
    `<div style="margin-top:6px;font-size:13px;line-height:1.55;color:#334155;">` +
    opts.lines.map((l) => `<div>${escapeHtml(l)}</div>`).join('') +
    placeLine +
    `</div>` +
    (opts.warn
      ? `<div style="display:flex;align-items:center;gap:6px;margin-top:6px;font-size:12px;font-weight:600;color:${TRAIL_COLORS.longHaltText};">` +
        `<span style="width:6px;height:6px;border-radius:50%;background:${TRAIL_COLORS.longHalt};"></span>${escapeHtml(opts.warn)}</div>`
      : '') +
    `</div>`
  );
}

export function haltCardHtml(
  halt: TripHalt,
  index: number,
  total: number,
  withDate: boolean,
  place: string | null | undefined,
): string {
  return trailCardHtml({
    label: total > 1 ? `Halt ${index + 1} of ${total}` : 'Halt',
    value: formatStopDuration(halt.durationMs),
    lines: [`${formatTrailTime(halt.startAt, withDate)} – ${formatTrailTime(halt.endAt, withDate)}`],
    place,
    warn: halt.severity === 'long' ? 'Long halt' : undefined,
  });
}

// ── Trip card (top-left) ─────────────────────────────────────────────────────

export type TripCardRow =
  | { kind: 'start' | 'end'; title: string; iso?: string; placeKey: string }
  | { kind: 'halt'; halt: TripHalt; index: number; placeKey: string };

/**
 * Trip summary + timeline. Halt rows carry `data-halt-index`; the header toggle
 * carries `data-trip-card-toggle`; place lines carry `data-place-key` so the
 * caller can fill them in as reverse-geocodes return.
 */
export function tripCardHtml(opts: {
  status: 'completed' | 'tracking';
  dateLabel: string;
  title: string;
  subtitle: string;
  stats: { label: string; value: string }[];
  rows: TripCardRow[];
  withDate: boolean;
  expanded: boolean;
  selectedHaltIndex: number | null;
  places: Record<string, string | null | undefined>;
  showGapKey: boolean;
}): string {
  const statusDot = opts.status === 'completed' ? TRAIL_COLORS.slate : TRAIL_COLORS.route;
  const statusText = opts.status === 'completed' ? 'COMPLETED' : 'TRACKED SO FAR';
  const chevron =
    `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#475569" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ` +
    `style="flex-shrink:0;transform:rotate(${opts.expanded ? 180 : 0}deg);"><path d="M6 9l6 6 6-6"/></svg>`;
  const halts = opts.rows.filter((r) => r.kind === 'halt').length;

  // Compact header — one tap target that opens/closes the details. Collapsed it is
  // three short lines so the route underneath stays visible.
  const moving = opts.stats.find((s) => s.label === 'Moving');
  const summary = [
    opts.subtitle,
    moving ? `${moving.value} moving` : '',
    `${halts} halt${halts === 1 ? '' : 's'}`,
  ]
    .filter(Boolean)
    .map(escapeHtml)
    .join(' · ');
  const header =
    `<button type="button" data-trip-card-toggle aria-expanded="${opts.expanded}" ` +
    `aria-label="${opts.expanded ? 'Hide trip details' : 'Show trip details'}" ` +
    `style="display:flex;align-items:flex-start;gap:10px;width:100%;min-height:44px;padding:10px 12px;border:0;background:#ffffff;` +
    `cursor:pointer;font-family:${FONT};color:${TRAIL_COLORS.ink};text-align:left;">` +
    `<div style="flex:1;min-width:0;">` +
    `<div style="display:flex;align-items:center;gap:6px;font-size:10px;color:#64748b;">` +
    `<span style="display:inline-flex;align-items:center;gap:5px;font-weight:600;letter-spacing:0.06em;">` +
    `<span style="width:6px;height:6px;border-radius:50%;background:${statusDot};"></span>${statusText}</span>` +
    (opts.dateLabel ? `<span style="color:#94a3b8;">·</span><span>${escapeHtml(opts.dateLabel)}</span>` : '') +
    `</div>` +
    (opts.title
      ? `<div style="margin-top:3px;font-size:13px;font-weight:700;letter-spacing:-0.01em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(opts.title)}</div>`
      : '') +
    `<div style="margin-top:2px;font-size:11px;color:#475569;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${summary}</div>` +
    `</div>` +
    `<span style="padding-top:2px;">${chevron}</span>` +
    `</button>`;

  if (!opts.expanded) {
    return `<div style="font-family:${FONT};${NUMS}color:${TRAIL_COLORS.ink};">${header}</div>`;
  }

  const stats =
    `<div style="display:grid;grid-template-columns:repeat(${opts.stats.length},minmax(0,1fr));border-top:1px solid #eef0f3;">` +
    opts.stats
      .map(
        (s, i) =>
          `<div style="padding:8px ${i === 0 ? 12 : 10}px;${i > 0 ? 'border-left:1px solid #eef0f3;' : ''}">` +
          `<div style="font-size:10px;color:#64748b;">${escapeHtml(s.label)}</div>` +
          `<div style="margin-top:1px;font-size:13px;font-weight:700;">${escapeHtml(s.value)}</div></div>`,
      )
      .join('') +
    `</div>`;

  const placeLine = (key: string) => {
    const p = opts.places[key];
    const text = p === undefined ? '' : p ? escapeHtml(p) : '';
    return `<div data-place-key="${key}" style="font-size:11px;color:#64748b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${text}</div>`;
  };
  const rail = (marker: string, last: boolean) =>
    `<span style="display:flex;flex-direction:column;align-items:center;width:12px;flex-shrink:0;padding-top:4px;">${marker}` +
    (last ? '' : `<span style="flex:1;width:1.5px;min-height:12px;background:#dbe0e8;margin-top:4px;"></span>`) +
    `</span>`;

  const rowsHtml = opts.rows
    .map((r, i) => {
      const last = i === opts.rows.length - 1;
      if (r.kind !== 'halt') {
        const marker =
          r.kind === 'start'
            ? `<span style="width:10px;height:10px;box-sizing:border-box;border-radius:50%;border:2.5px solid ${TRAIL_COLORS.start};background:#ffffff;"></span>`
            : `<span style="width:10px;height:10px;border-radius:50%;background:${TRAIL_COLORS.routeDark};"></span>`;
        return (
          `<div style="display:flex;gap:10px;padding:6px 10px;">${rail(marker, last)}` +
          `<div style="flex:1;min-width:0;display:flex;justify-content:space-between;gap:8px;padding-bottom:2px;">` +
          `<div style="min-width:0;"><div style="font-size:12px;font-weight:600;">${escapeHtml(r.title)}</div>${placeLine(r.placeKey)}</div>` +
          `<div style="font-size:11px;color:#475569;white-space:nowrap;">${formatTrailTime(r.iso, opts.withDate)}</div></div></div>`
        );
      }
      const selected = opts.selectedHaltIndex === r.index;
      const marker = `<span style="width:10px;height:10px;border-radius:3px;background:${selected ? TRAIL_COLORS.route : TRAIL_COLORS.ink};"></span>`;
      const long =
        r.halt.severity === 'long'
          ? `<span style="display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:600;color:${TRAIL_COLORS.longHaltText};">` +
            `<span style="width:6px;height:6px;border-radius:50%;background:${TRAIL_COLORS.longHalt};"></span>Long</span>`
          : '';
      return (
        `<button type="button" data-halt-index="${r.index}" style="display:flex;gap:10px;width:100%;padding:6px 10px;border:0;border-radius:8px;` +
        `background:${selected ? TRAIL_COLORS.selectedRow : 'transparent'};cursor:pointer;font-family:${FONT};text-align:left;color:${TRAIL_COLORS.ink};">` +
        rail(marker, last) +
        `<div style="flex:1;min-width:0;display:flex;justify-content:space-between;gap:8px;padding-bottom:2px;">` +
        `<div style="min-width:0;"><div style="display:flex;align-items:center;gap:6px;font-size:12px;font-weight:600;">Halt · ${formatStopDuration(r.halt.durationMs)}${long}</div>` +
        `${placeLine(r.placeKey)}</div>` +
        `<div style="font-size:11px;color:#475569;white-space:nowrap;">${formatTrailTime(r.halt.startAt, opts.withDate)}</div></div></button>`
      );
    })
    .join('');

  const keyItem = (swatch: string, label: string) =>
    `<span style="display:inline-flex;align-items:center;gap:5px;">${swatch}${label}</span>`;
  const key =
    `<div style="display:flex;flex-wrap:wrap;gap:4px 10px;padding:6px 12px;border-top:1px solid #eef0f3;background:#f8fafc;font-size:10px;color:#475569;">` +
    keyItem(`<span style="width:16px;height:4px;border-radius:2px;background:${TRAIL_COLORS.route};"></span>`, 'Driven') +
    keyItem(`<span style="width:16px;height:7px;border-radius:4px;background:#2196F3;opacity:0.45;"></span>`, 'Planned') +
    keyItem(`<span style="width:6px;height:6px;border-radius:50%;background:#ffffff;border:2px solid ${TRAIL_COLORS.routeDark};"></span>`, 'GPS ping') +
    keyItem(`<span style="width:12px;height:8px;border-radius:2px;background:${TRAIL_COLORS.ink};"></span>`, 'Halt') +
    (opts.showGapKey
      ? keyItem(
          `<svg width="16" height="4" aria-hidden="true"><line x1="1" y1="2" x2="15" y2="2" stroke="${TRAIL_COLORS.slate}" stroke-width="3" stroke-dasharray="4 3"/></svg>`,
          'No signal',
        )
      : '') +
    `</div>`;

  return (
    `<div style="font-family:${FONT};${NUMS}color:${TRAIL_COLORS.ink};">${header}${stats}` +
    `<div style="max-height:200px;overflow-y:auto;padding:4px 6px;border-top:1px solid #eef0f3;">${rowsHtml}</div>` +
    `${key}</div>`
  );
}
