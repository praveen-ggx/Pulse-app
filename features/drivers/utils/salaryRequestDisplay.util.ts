import type { SalaryRequestRow } from '@/features/drivers/services/salaryRequests.service';

const SALARY_REQUEST_TYPE_LABELS: Record<string, string> = {
  monthly: 'Monthly salary',
  advance: 'Advance',
  trip_based: 'Trip commission',
  reward: 'Referral reward',
};

export function salaryRequestTypeLabel(type: string): string {
  return SALARY_REQUEST_TYPE_LABELS[type] ?? (type || 'Salary');
}

export function salaryRequestTypeShortLabel(type: string): string {
  return SALARY_REQUEST_TYPE_LABELS[type] ?? 'Salary';
}

export function salaryRequestStatusLabel(status: string): string {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'paid') return 'Paid';
  if (normalized === 'approved') return 'Approved';
  if (normalized === 'rejected') return 'Rejected';
  if (normalized === 'withdrawn') return 'Withdrawn';
  return 'Pending';
}

export type SalaryRequestStatusTone = 'pending' | 'approved' | 'paid' | 'rejected';

export function salaryRequestStatusTone(status: string): SalaryRequestStatusTone {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'paid') return 'paid';
  if (normalized === 'approved') return 'approved';
  // Withdrawn by the driver: closed, shown with the same muted-red tone as rejected.
  if (normalized === 'rejected' || normalized === 'withdrawn') return 'rejected';
  return 'pending';
}

export function salaryRequestStatusColors(tone: SalaryRequestStatusTone): {
  bg: string;
  border: string;
  text: string;
  icon: string;
} {
  switch (tone) {
    case 'paid':
      return { bg: 'rgba(4,120,87,0.12)', border: 'rgba(4,120,87,0.28)', text: '#047857', icon: '#047857' };
    case 'approved':
      return { bg: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.28)', text: '#1d4ed8', icon: '#2563eb' };
    case 'rejected':
      return { bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.28)', text: '#b91c1c', icon: '#dc2626' };
    default:
      return { bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.28)', text: '#d97706', icon: '#d97706' };
  }
}

export function salaryRequestStatusIconName(
  tone: SalaryRequestStatusTone,
): 'clock-o' | 'check-circle' | 'times-circle' | 'money' {
  if (tone === 'rejected') return 'times-circle';
  if (tone === 'pending') return 'clock-o';
  if (tone === 'paid') return 'money';
  return 'check-circle';
}

export function formatSalaryRequestMonth(value: string | null | undefined): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

export type SalaryRequestLogEntry = {
  id: string;
  title: string;
  detail: string;
  at: string;
  tone: SalaryRequestStatusTone | 'neutral';
};

export function buildSalaryRequestActivityLog(request: SalaryRequestRow): SalaryRequestLogEntry[] {
  const entries: SalaryRequestLogEntry[] = [];
  const typeLabel = salaryRequestTypeShortLabel(request.request_type);
  const amount = `₹${Math.round(Number(request.amount) || 0).toLocaleString('en-IN')}`;

  entries.push({
    id: 'submitted',
    title: 'Request submitted',
    detail: `${typeLabel} · ${amount} sent to fleet for review.`,
    at: request.created_at,
    tone: 'neutral',
  });

  const status = salaryRequestStatusTone(request.status);
  if (status === 'pending') {
    entries.push({
      id: 'pending',
      title: 'Awaiting fleet review',
      detail: 'Your fleet owner will approve, reject, or mark this as paid.',
      at: request.created_at,
      tone: 'pending',
    });
    return entries;
  }

  const withdrawnByDriver = String(request.status || '').trim().toLowerCase() === 'withdrawn';
  const statusTitle =
    status === 'paid'
      ? 'Marked paid by fleet'
      : status === 'approved'
        ? 'Approved by fleet'
        : withdrawnByDriver
          ? 'Withdrawn by you'
          : 'Rejected by fleet';

  const statusDetail = withdrawnByDriver
    ? 'You withdrew this request. Its trips can be requested again.'
    : status === 'paid'
      ? `${amount} recorded as paid. Check your settlement history if payment was via bank or cash.`
      : status === 'approved'
        ? 'Fleet approved this request. Payout may still be pending.'
        : request.note?.trim()
          ? `Fleet rejected this request. Your note: "${request.note.trim()}"`
          : 'Fleet rejected this request. Contact your fleet owner for details.';

  entries.push({
    id: 'resolved',
    title: statusTitle,
    detail: statusDetail,
    at: request.updated_at || request.created_at,
    tone: status,
  });

  return entries;
}
