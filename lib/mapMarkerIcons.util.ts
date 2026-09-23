import { resolveDriverAvatarUriForSeed } from '@/constants/DriverLevels';
import Theme from '@/constants/Theme';

/**
 * Shared map marker HTML (TripMap Leaflet + MapLibre LeafletMap.web).
 * Live / truck pin: same circular driver avatar as the driver app map
 * ({@link buildDriverAvatarMarkerHtml} / DriverMapAvatarMarker).
 */

export function resolveDriverMapAvatarSrc(
  avatarUri?: string | null,
  avatarSeed?: string | null,
): string {
  const trimmed = avatarUri?.trim();
  if (trimmed && (trimmed.startsWith('http') || trimmed.startsWith('data:'))) {
    return trimmed;
  }
  return resolveDriverAvatarUriForSeed(avatarSeed);
}

let _driverMapMarkerStylesInjected = false;

function ensureDriverMapMarkerStyles(): void {
  if (typeof document === 'undefined') return;
  const id = 'pulse-driver-map-marker-styles-v4';
  if (document.getElementById(id)) {
    _driverMapMarkerStylesInjected = true;
    return;
  }
  // Drop legacy stylesheets so hot reloads pick up clickable status + alignment.
  document.getElementById('pulse-driver-map-marker-styles')?.remove();
  document.getElementById('pulse-driver-map-marker-styles-v2')?.remove();
  document.getElementById('pulse-driver-map-marker-styles-v3')?.remove();
  const el = document.createElement('style');
  el.id = id;
  el.textContent = `
@keyframes pulseDriverMapPulse{0%,100%{transform:scale(1);opacity:0.55;}50%{transform:scale(1.22);opacity:0.18;}}
.pulse-driver-map-marker{position:relative;display:flex;flex-direction:column;align-items:center;width:44px;filter:drop-shadow(0 4px 10px rgba(15,23,42,0.35));pointer-events:auto;cursor:pointer;}
.pulse-driver-map-pulse{position:absolute;top:-4px;left:50%;width:52px;height:52px;margin-left:-26px;border-radius:50%;border:2px solid var(--ring);box-sizing:border-box;pointer-events:none;transform-origin:center center;}
.pulse-driver-map-pulse.on{animation:pulseDriverMapPulse 1.8s ease-in-out infinite;}
.pulse-driver-map-pulse.off{opacity:0.32;}
.pulse-driver-map-avatar-wrap{position:relative;width:44px;height:44px;z-index:1;pointer-events:none;flex-shrink:0;}
.pulse-driver-map-avatar{width:100%;height:100%;border-radius:50%;border:3px solid var(--ring);background:#fff;overflow:hidden;box-sizing:border-box;}
.pulse-driver-map-avatar img{width:100%;height:100%;object-fit:cover;display:block;}
.pulse-driver-map-dot{position:absolute;top:-1px;right:-1px;width:12px;height:12px;border-radius:50%;background:var(--ring);border:2px solid #fff;box-sizing:border-box;z-index:2;pointer-events:auto;cursor:pointer;}
.pulse-driver-map-pointer{width:0;height:0;border-left:8px solid transparent;border-right:8px solid transparent;border-top:9px solid var(--ring);margin-top:-1px;align-self:center;pointer-events:none;flex-shrink:0;}
`;
  document.head.appendChild(el);
  _driverMapMarkerStylesInjected = true;
}

export function buildDriverAvatarMarkerHtml(
  avatarUri?: string | null,
  avatarSeed?: string | null,
  isOnline = false,
): string {
  ensureDriverMapMarkerStyles();
  const src = resolveDriverMapAvatarSrc(avatarUri, avatarSeed);
  const ring = isOnline ? Theme.darkGreen : Theme.teslaRed;
  const pulseClass = isOnline ? 'on' : 'off';
  const safeSrc = src.replace(/"/g, '&quot;');
  const statusTitle = isOnline ? 'View live location' : 'View location';
  return `<div class="pulse-driver-map-marker" style="--ring:${ring};" title="${statusTitle}">
  <div class="pulse-driver-map-pulse ${pulseClass}"></div>
  <div class="pulse-driver-map-avatar-wrap">
    <div class="pulse-driver-map-avatar">
      <img src="${safeSrc}" alt="" crossorigin="anonymous" referrerpolicy="no-referrer" />
    </div>
    <span class="pulse-driver-map-dot" aria-hidden="true" title="${statusTitle}"></span>
  </div>
  <div class="pulse-driver-map-pointer"></div>
</div>`;
}

export const MAP_SOURCE_PIN_HTML = `<svg width="28" height="40" viewBox="0 0 28 40" style="filter:drop-shadow(0 3px 6px rgba(0,0,0,0.16));">
  <path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 26 14 26s14-15.5 14-26c0-7.73-6.27-14-14-14z" fill="#059669"/>
  <path d="M14 2C7.37 2 2 7.37 2 14c0 9.25 12 24 12 24s12-14.75 12-24c0-6.63-5.37-12-12-12z" fill="#10b981"/>
  <circle cx="14" cy="14" r="6" fill="#fff"/><circle cx="14" cy="14" r="3" fill="#059669"/>
</svg>`;

export const MAP_DESTINATION_PIN_HTML = `<svg width="28" height="40" viewBox="0 0 28 40" style="filter:drop-shadow(0 3px 8px rgba(180,83,9,0.28));">
  <path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 26 14 26s14-15.5 14-26c0-7.73-6.27-14-14-14z" fill="#b45309"/>
  <path d="M14 2C7.37 2 2 7.37 2 14c0 9.25 12 24 12 24s12-14.75 12-24c0-6.63-5.37-12-12-12z" fill="#f59e0b"/>
  <circle cx="14" cy="14" r="6" fill="#fff"/><circle cx="14" cy="14" r="3" fill="#d97706"/>
</svg>`;

/** Leaflet divIcon size/anchor for {@link buildDriverAvatarMarkerHtml} (live pin). */
export const MAP_DRIVER_AVATAR_MARKER_ICON_SIZE: [number, number] = [44, 53];
/** Anchor at the tip of the pointer under the avatar. */
export const MAP_DRIVER_AVATAR_MARKER_ICON_ANCHOR: [number, number] = [22, 53];

/**
 * @deprecated Prefer {@link buildDriverAvatarMarkerHtml} — kept for any residual references.
 * Live markers now use the driver-app circular avatar (same as DriverMapAvatarMarker).
 */
export const MAP_TRUCK_MARKER_HTML = buildDriverAvatarMarkerHtml(null, null, true);

/** @deprecated Use {@link MAP_DRIVER_AVATAR_MARKER_ICON_SIZE}. */
export const MAP_TRUCK_MARKER_ICON_SIZE = MAP_DRIVER_AVATAR_MARKER_ICON_SIZE;
/** @deprecated Use {@link MAP_DRIVER_AVATAR_MARKER_ICON_ANCHOR}. */
export const MAP_TRUCK_MARKER_ICON_ANCHOR = MAP_DRIVER_AVATAR_MARKER_ICON_ANCHOR;

export function numberedMapPinHtml(kind: 'pickup' | 'drop', index: number): string {
  const n = Math.max(1, Math.min(99, Math.floor(index)));
  if (kind === 'drop') {
    return `<svg width="28" height="40" viewBox="0 0 28 40" style="filter:drop-shadow(0 3px 8px rgba(180,83,9,0.28));">
  <path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 26 14 26s14-15.5 14-26c0-7.73-6.27-14-14-14z" fill="#b45309"/>
  <path d="M14 2C7.37 2 2 7.37 2 14c0 9.25 12 24 12 24s12-14.75 12-24c0-6.63-5.37-12-12-12z" fill="#f59e0b"/>
  <circle cx="14" cy="14" r="8" fill="#fff"/>
  <text x="14" y="18" text-anchor="middle" font-size="11" font-weight="700" font-family="system-ui,sans-serif" fill="#b45309">${n}</text>
</svg>`;
  }
  return `<svg width="28" height="40" viewBox="0 0 28 40" style="filter:drop-shadow(0 3px 6px rgba(0,0,0,0.16));">
  <path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 26 14 26s14-15.5 14-26c0-7.73-6.27-14-14-14z" fill="#059669"/>
  <path d="M14 2C7.37 2 2 7.37 2 14c0 9.25 12 24 12 24s12-14.75 12-24c0-6.63-5.37-12-12-12z" fill="#10b981"/>
  <circle cx="14" cy="14" r="8" fill="#fff"/>
  <text x="14" y="18" text-anchor="middle" font-size="11" font-weight="700" font-family="system-ui,sans-serif" fill="#059669">${n}</text>
</svg>`;
}

/**
 * Small orange dot for a GPS ping marker. Restored from 6ba500e6: a later
 * refactor dropped the constant but kept its use below, so the 'ping' branch
 * referenced an undefined identifier and would throw at runtime on web maps.
 */
export const MAP_PING_DOT_HTML = `<div style="width:12px;height:12px;border-radius:50%;background:#fb923c;border:2px solid #c2410c;box-shadow:0 1px 4px rgba(0,0,0,0.25);"></div>`;

export type TripMapMarkerRole =
  | 'origin'
  | 'destination'
  | 'live'
  | 'truck'
  | 'driver'
  | 'ping'
  | 'past'
  | 'default';

export function tripMapMarkerRoleFromId(id: string): TripMapMarkerRole {
  if (id === 'origin' || id === 'pickup' || id.startsWith('pickup-') || id.startsWith('plan-pickup')) {
    return 'origin';
  }
  if (id === 'destination' || id === 'drop' || id.startsWith('drop-') || id.startsWith('plan-drop')) {
    return 'destination';
  }
  if (id === 'you') return 'driver';
  if (id === 'live' || id === 'truck') return 'truck';
  if (id.startsWith('ping-') || id.startsWith('past-')) return id.startsWith('ping-') ? 'ping' : 'past';
  return 'default';
}

export function kindIndexFromMarkerId(id: string): number | null {
  const match = /^(?:pickup|drop)-(\d+)$/.exec(id);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export type DriverMapMarkerOptions = {
  avatarUri?: string | null;
  avatarSeed?: string | null;
  isOnline?: boolean;
  /** Pulse ring on pickup/drop when this stop is the active guidance target. */
  highlighted?: boolean;
  kindIndex?: number;
};

let tripMapMarkerStylesInjected = false;

function ensureTripMapMarkerStyles(): void {
  if (typeof document === 'undefined' || tripMapMarkerStylesInjected) return;
  const id = 'pulse-trip-map-marker-styles-v2';
  if (document.getElementById(id)) {
    tripMapMarkerStylesInjected = true;
    return;
  }
  const el = document.createElement('style');
  el.id = id;
  el.textContent = `
@keyframes pulseTripMapPinRing{0%,100%{transform:scale(0.88);opacity:0.45;}50%{transform:scale(1.18);opacity:0.12;}}
.pulse-trip-map-marker{display:flex;flex-direction:column;align-items:center;gap:5px;cursor:pointer;pointer-events:auto;}
.pulse-trip-map-chip{background:rgba(255,255,255,0.94);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);color:#065f46;font-size:11px;font-weight:600;padding:4px 11px;border-radius:999px;border:1px solid rgba(4,120,87,0.24);white-space:nowrap;max-width:168px;overflow:hidden;text-overflow:ellipsis;letter-spacing:0.02em;box-shadow:0 2px 10px rgba(15,23,42,0.1),0 0 0 1px rgba(255,255,255,0.5) inset;line-height:1.2;}
.pulse-trip-map-chip--drop{color:#92400e;border-color:rgba(245,158,11,0.38);}
.pulse-trip-map-chip--active{box-shadow:0 2px 12px rgba(5,150,105,0.22),0 0 0 1px rgba(5,150,105,0.18) inset;}
.pulse-trip-map-chip--drop.pulse-trip-map-chip--active{box-shadow:0 2px 12px rgba(245,158,11,0.28),0 0 0 1px rgba(245,158,11,0.2) inset;}
.pulse-trip-map-pin-host{position:relative;display:flex;justify-content:center;}
.pulse-trip-map-pin-host--pulse::before{content:'';position:absolute;bottom:5px;left:50%;width:34px;height:34px;margin-left:-17px;border-radius:50%;border:2px solid var(--pin-accent,#059669);animation:pulseTripMapPinRing 2.2s ease-in-out infinite;pointer-events:none;}
.pulse-trip-map-pin-host--drop.pulse-trip-map-pin-host--pulse::before{border-color:#f59e0b;}
.pulse-route-distance-label{background:rgba(255,255,255,0.96);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);color:#065f46;font-size:11px;font-weight:700;padding:5px 11px;border-radius:999px;border:1px solid rgba(4,120,87,0.28);box-shadow:0 2px 10px rgba(15,23,42,0.12),0 0 0 1px rgba(255,255,255,0.55) inset;white-space:nowrap;pointer-events:none;letter-spacing:0.02em;line-height:1.2;}
`;
  document.head.appendChild(el);
  tripMapMarkerStylesInjected = true;
}

/** Distance badge rendered on a route segment midpoint (web MapLibre). */
export function createRouteDistanceLabelElement(text: string): HTMLDivElement {
  ensureTripMapMarkerStyles();
  const el = document.createElement('div');
  el.className = 'pulse-route-distance-label';
  el.textContent = text.trim();
  return el;
}

function appendTripMapLabelChip(
  wrap: HTMLDivElement,
  label: string,
  role: TripMapMarkerRole,
  highlighted?: boolean,
): void {
  ensureTripMapMarkerStyles();
  const chip = document.createElement('div');
  chip.textContent = label.trim();
  chip.className = 'pulse-trip-map-chip';
  if (role === 'destination') chip.classList.add('pulse-trip-map-chip--drop');
  if (highlighted) chip.classList.add('pulse-trip-map-chip--active');
  wrap.appendChild(chip);
}

/** Build a DOM element for MapLibre markers (web). */
export function createTripMapMarkerElement(
  role: TripMapMarkerRole,
  label?: string,
  fallbackColor?: string,
  driverOptions?: DriverMapMarkerOptions,
): HTMLDivElement {
  ensureTripMapMarkerStyles();
  const wrap = document.createElement('div');
  wrap.className = 'pulse-trip-map-marker';

  const isPin = role === 'origin' || role === 'destination';
  const trimmedLabel = label?.trim();

  if (trimmedLabel && isPin) {
    appendTripMapLabelChip(wrap, trimmedLabel, role, driverOptions?.highlighted);
  }

  const iconHost = document.createElement('div');
  if (isPin) {
    iconHost.className = `pulse-trip-map-pin-host${role === 'destination' ? ' pulse-trip-map-pin-host--drop' : ''}${driverOptions?.highlighted ? ' pulse-trip-map-pin-host--pulse' : ''}`;
    iconHost.style.setProperty('--pin-accent', role === 'destination' ? '#f59e0b' : Theme.driverPrimary);
  }
  if (role === 'origin') {
    const n = driverOptions?.kindIndex;
    iconHost.innerHTML =
      n != null && n > 0 ? numberedMapPinHtml('pickup', n) : MAP_SOURCE_PIN_HTML;
  } else if (role === 'destination') {
    const n = driverOptions?.kindIndex;
    iconHost.innerHTML =
      n != null && n > 0 ? numberedMapPinHtml('drop', n) : MAP_DESTINATION_PIN_HTML;
  } else if (role === 'truck' || role === 'live' || role === 'driver') {
    iconHost.innerHTML = buildDriverAvatarMarkerHtml(
      driverOptions?.avatarUri,
      driverOptions?.avatarSeed,
      driverOptions?.isOnline ?? (role === 'truck' || role === 'live'),
    );
  } else if (role === 'ping') {
    iconHost.innerHTML = MAP_PING_DOT_HTML;
  } else {
    const dot = document.createElement('div');
    dot.style.width = '14px';
    dot.style.height = '14px';
    dot.style.borderRadius = '50%';
    dot.style.background = fallbackColor ?? '#3b82f6';
    dot.style.border = '3px solid #ffffff';
    dot.style.boxShadow = '0 2px 8px rgba(0,0,0,0.35)';
    iconHost.appendChild(dot);
  }
  wrap.appendChild(iconHost);

  // Avatar markers tip-anchor at the pointer — never stack a chip under them
  // (would shift MapLibre/Leaflet bottom anchors off the GPS point).
  if (trimmedLabel && !isPin && role !== 'driver' && role !== 'truck' && role !== 'live') {
    appendTripMapLabelChip(wrap, trimmedLabel, role, driverOptions?.highlighted);
  }

  return wrap;
}
