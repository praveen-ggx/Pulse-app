import type {
  NetworkNotificationEventType,
  NetworkNotificationRow,
} from '@/features/network/services/networkNotifications.service';

/** Primary CTA per network lifecycle event. */
export function networkNotificationActionLabel(
  eventType: NetworkNotificationEventType,
): string {
  if (eventType === 'driver_disconnected') return 'View drivers';
  if (eventType === 'expense_reminder') return 'Review expense';
  if (eventType === 'indent_created') return 'Place bid';
  if (eventType === 'bid_received') return 'Review bid';
  if (eventType === 'awarded') return 'View award';
  if (eventType === 'quote_requested') return 'Send quote';
  return 'Review offer';
}

/** Short tag shown on the card. */
export function networkNotificationTagLabel(
  eventType: NetworkNotificationEventType,
): string {
  if (eventType === 'driver_disconnected') return 'Left fleet';
  if (eventType === 'expense_reminder') return 'Expense reminder';
  if (eventType === 'indent_created') return 'New load';
  if (eventType === 'bid_received') return 'Bid';
  if (eventType === 'awarded') return 'Awarded';
  if (eventType === 'quote_requested') return 'Quote request';
  return 'Counter offer';
}

/** Verb used in the "<actor> <verb> <highlight>" card headline. */
export function networkNotificationActionText(
  eventType: NetworkNotificationEventType,
): string {
  if (eventType === 'driver_disconnected') return 'left your fleet';
  if (eventType === 'expense_reminder') return 'reminded you about';
  if (eventType === 'indent_created') return 'posted';
  if (eventType === 'bid_received') return 'quoted';
  if (eventType === 'awarded') return 'awarded';
  if (eventType === 'quote_requested') return 'requested';
  return 'countered';
}

/** Card highlight override; null keeps the caller's default (amount or title). */
export function networkNotificationHighlightText(row: NetworkNotificationRow): string | null {
  if (row.event_type === 'driver_disconnected') return 'Disconnected';
  if (row.event_type === 'expense_reminder') {
    const kind = payloadString(row, 'expense_kind');
    const label = kind === 'fuel' ? 'Fuel expense' : kind === 'toll' ? 'Toll expense' : 'Expense';
    const amount = Number(row.payload_json?.amount_inr ?? 0);
    return amount > 0 ? `${label} · ₹${amount.toLocaleString('en-IN')}` : label;
  }
  return null;
}

function payloadString(row: NetworkNotificationRow, key: string): string {
  const value = row.payload_json?.[key];
  return typeof value === 'string' ? value.trim() : '';
}

/** Driver who left: payload name, else the legacy "<Name> disconnected from your fleet" title. */
export function networkDisconnectDriverName(row: NetworkNotificationRow): string {
  const fromPayload = payloadString(row, 'driver_name');
  if (fromPayload) return fromPayload;
  const title = (row.title ?? '').trim();
  const legacy = /^(.+?)\s+disconnected from your fleet\.?$/i.exec(title);
  return (legacy?.[1] ?? title).trim() || 'Driver';
}

export function networkDisconnectDriverId(row: NetworkNotificationRow): string | null {
  return payloadString(row, 'driver_id') || null;
}
