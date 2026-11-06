/**
 * DCO (driver-cum-owner / independent owner-operator) review console.
 * A single list of dco_profiles rows, newest request first, with per-row
 * lifecycle actions. Identity proofs are reviewed in the Driver KYC panel;
 * Approve stays disabled here until that driver's KYC is approved (the
 * platform_approve_dco RPC enforces the same rule).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Gavel,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  ShieldX,
} from 'lucide-react';
import { supabaseAuth as supabase } from '@/lib/supabaseAuth';
import {
  approveDco,
  fetchDcoProfiles,
  reinstateDco,
  rejectDco,
  suspendDco,
  type DcoKycStatus,
  type DcoProfileStatus,
  type DcoReviewRow,
} from '@/lib/dco';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const REJECTION_REASONS = [
  'Employed as a driver elsewhere',
  'Unable to verify identity',
  'Incomplete information',
  'Other',
] as const;

const SUSPENSION_REASONS = [
  'Compliance issue reported',
  'Suspected policy violation',
  'Under investigation',
  'Other',
] as const;

type PendingAction =
  | { kind: 'approve'; userId: string }
  | { kind: 'reject'; userId: string }
  | { kind: 'suspend'; userId: string }
  | { kind: 'reinstate'; userId: string }
  | null;

const STATUS_FILTERS: { key: 'all' | DcoProfileStatus; label: string }[] = [
  { key: 'PENDING', label: 'Pending' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'SUSPENDED', label: 'Suspended' },
  { key: 'REJECTED', label: 'Rejected' },
  { key: 'all', label: 'All' },
];

const STATUS_BADGE: Record<
  DcoProfileStatus,
  { label: string; variant: 'info' | 'success' | 'secondary' | 'destructive' }
> = {
  PENDING: { label: 'Pending', variant: 'info' },
  APPROVED: { label: 'Approved', variant: 'success' },
  REJECTED: { label: 'Rejected', variant: 'secondary' },
  SUSPENDED: { label: 'Suspended', variant: 'destructive' },
};

const KYC_BADGE: Record<
  DcoKycStatus,
  { label: string; variant: 'info' | 'success' | 'secondary' | 'destructive' }
> = {
  none: { label: 'Not submitted', variant: 'secondary' },
  submitted: { label: 'Awaiting verification', variant: 'info' },
  approved: { label: 'Verified', variant: 'success' },
  rejected: { label: 'Rejected', variant: 'destructive' },
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function DcoReviewPanel() {
  const [rows, setRows] = useState<DcoReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | DcoProfileStatus>('PENDING');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction>(null);
  const [reasonPreset, setReasonPreset] = useState('');
  const [reasonNotes, setReasonNotes] = useState('');
  const [dialogBusy, setDialogBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await fetchDcoProfiles();
    setRows(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel('dco-review-console')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'dco_profiles' },
        () => void load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter !== 'all' && r.status !== filter) return false;
      if (!q) return true;
      return (
        (r.driver_name ?? '').toLowerCase().includes(q) ||
        (r.driver_phone ?? '').toLowerCase().includes(q) ||
        (r.driver_email ?? '').toLowerCase().includes(q)
      );
    });
  }, [rows, filter, search]);

  const openAction = (action: PendingAction) => {
    setReasonPreset('');
    setReasonNotes('');
    setError(null);
    setPending(action);
  };

  const composedReason = [reasonPreset, reasonNotes.trim()].filter(Boolean).join(' — ');
  const reasonComplete = !!reasonPreset && reasonNotes.trim().length > 0;

  const confirmAction = async () => {
    if (!pending) return;
    setDialogBusy(true);
    setError(null);
    setBusyId(pending.userId);

    const result =
      pending.kind === 'approve'
        ? await approveDco(pending.userId)
        : pending.kind === 'reject'
          ? await rejectDco(pending.userId, composedReason)
          : pending.kind === 'suspend'
            ? await suspendDco(pending.userId, composedReason)
            : await reinstateDco(pending.userId);

    setDialogBusy(false);
    setBusyId(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    setPending(null);
    await load();
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <Gavel className="size-3.5 text-muted-foreground" />
        <span className="text-[12px] font-semibold">DCO Review</span>
        <Badge variant="secondary" appearance="light" size="xs">
          {filtered.length}
        </Badge>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto size-7 p-0"
          onClick={() => void load()}
          title="Refresh"
        >
          <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      <div className="shrink-0 border-b border-border px-3 py-2">
        <div className="relative max-w-xs">
          <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, phone"
            className="w-full rounded-md border border-border bg-background py-1.5 pl-7 pr-2 text-[12px] outline-none focus:border-primary"
          />
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded px-2 py-0.5 text-[10px] font-medium ${
                filter === f.key
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/70'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div className="shrink-0 border-b border-border bg-destructive/10 px-4 py-2 text-[11px] text-destructive">
          {error}
        </div>
      ) : null}

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="px-3 py-8 text-center text-[11px] text-muted-foreground">
            No DCO requests{filter !== 'all' ? ' in this state' : ''}.
          </p>
        ) : (
          <table className="w-full text-left text-[12px]">
            <thead className="sticky top-0 bg-muted/40 text-[10px] uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Driver</th>
                <th className="px-3 py-2 font-medium">Requested</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">KYC docs</th>
                <th className="px-3 py-2 font-medium">Reviewed</th>
                <th className="px-3 py-2 font-medium">Reason</th>
                <th className="px-3 py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const badge = STATUS_BADGE[r.status];
                const busy = busyId === r.user_id;
                const kycBadge = KYC_BADGE[r.kyc_review_status];
                const kycVerified =
                  r.kyc_review_status === 'approved' && !r.dco_docs_unverified;
                return (
                  <tr key={r.user_id} className="border-t border-border">
                    <td className="px-3 py-2">
                      <div className="font-semibold">{r.driver_name ?? 'Unknown driver'}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {r.driver_phone ?? 'No phone'}
                      </div>
                      {r.driver_email ? (
                        <div className="text-[10px] text-muted-foreground">{r.driver_email}</div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-[11px] text-muted-foreground">
                      {formatDate(r.requested_at)}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={badge.variant} appearance="light" size="xs">
                        {badge.label}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={kycBadge.variant} appearance="light" size="xs">
                        {kycBadge.label}
                      </Badge>
                      {r.dco_docs_unverified ? (
                        <div className="mt-1 text-[10px] text-muted-foreground">
                          DCO docs to verify: {r.dco_docs_unverified}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-[11px] text-muted-foreground">
                      {formatDate(r.reviewed_at)}
                    </td>
                    <td className="px-3 py-2 max-w-[220px] truncate text-[11px] text-muted-foreground">
                      {r.decision_reason ?? '—'}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1.5">
                        {r.status === 'PENDING' ? (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 gap-1 px-2 text-[11px]"
                              disabled={busy}
                              onClick={() => openAction({ kind: 'reject', userId: r.user_id })}
                            >
                              <ShieldX className="size-3" />
                              Reject
                            </Button>
                            <Button
                              size="sm"
                              className="h-7 gap-1 px-2 text-[11px]"
                              disabled={busy || !kycVerified}
                              title={
                                kycVerified
                                  ? undefined
                                  : 'Verify this driver\'s KYC and DCO documents (PAN, bank proof) in the Driver KYC panel first'
                              }
                              onClick={() => openAction({ kind: 'approve', userId: r.user_id })}
                            >
                              <ShieldCheck className="size-3" />
                              Approve
                            </Button>
                          </>
                        ) : r.status === 'APPROVED' ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 gap-1 px-2 text-[11px]"
                            disabled={busy}
                            onClick={() => openAction({ kind: 'suspend', userId: r.user_id })}
                          >
                            <ShieldX className="size-3" />
                            Suspend
                          </Button>
                        ) : r.status === 'SUSPENDED' ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 gap-1 px-2 text-[11px]"
                            disabled={busy}
                            onClick={() => openAction({ kind: 'reinstate', userId: r.user_id })}
                          >
                            <RotateCcw className="size-3" />
                            Reinstate
                          </Button>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">
                            Driver may re-request
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <Dialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open && !dialogBusy) setPending(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pending?.kind === 'approve' ? (
                <>
                  <ShieldCheck className="size-4 text-emerald-600" />
                  Approve DCO status
                </>
              ) : pending?.kind === 'reinstate' ? (
                <>
                  <RotateCcw className="size-4 text-amber-600" />
                  Reinstate DCO status
                </>
              ) : pending?.kind === 'suspend' ? (
                <>
                  <ShieldX className="size-4 text-destructive" />
                  Suspend DCO status
                </>
              ) : (
                <>
                  <ShieldX className="size-4 text-destructive" />
                  Reject DCO request
                </>
              )}
            </DialogTitle>
          </DialogHeader>

          {pending?.kind === 'approve' ? (
            <p className="mt-3 text-[11px] text-muted-foreground">
              Creates this driver's permanent DCO payee record and lets them bid in the
              marketplace as an independent owner-operator.
            </p>
          ) : pending?.kind === 'reinstate' ? (
            <p className="mt-3 text-[11px] text-muted-foreground">
              Returns this driver straight to Approved — no re-review.
            </p>
          ) : (
            <div className="mt-3 space-y-2.5">
              <select
                value={reasonPreset}
                onChange={(e) => setReasonPreset(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs text-foreground focus:border-ring focus:outline-none"
              >
                <option value="" disabled>
                  Select a reason…
                </option>
                {(pending?.kind === 'suspend' ? SUSPENSION_REASONS : REJECTION_REASONS).map(
                  (r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ),
                )}
              </select>
              <textarea
                value={reasonNotes}
                onChange={(e) => setReasonNotes(e.target.value)}
                placeholder="Tell the driver exactly what to fix (required)…"
                rows={3}
                className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30"
              />
              {pending?.kind === 'suspend' ? (
                <div className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 dark:border-amber-800 dark:bg-amber-950/40">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
                  <p className="text-[11px] leading-snug text-amber-800 dark:text-amber-300">
                    Suspension blocks future bidding only — it does not unwind any trip
                    already created from an accepted bid.
                  </p>
                </div>
              ) : null}
              {reasonComplete ? (
                <p className="text-[11px] text-muted-foreground">
                  Driver sees: <span className="text-foreground">{composedReason}</span>
                </p>
              ) : null}
            </div>
          )}

          {error ? <p className="mt-2 text-[11px] text-destructive">{error}</p> : null}

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPending(null)}
              disabled={dialogBusy}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant={pending?.kind === 'approve' || pending?.kind === 'reinstate' ? 'primary' : 'destructive'}
              onClick={() => void confirmAction()}
              disabled={
                dialogBusy ||
                (pending?.kind === 'reject' || pending?.kind === 'suspend' ? !reasonComplete : false)
              }
            >
              {dialogBusy ? (
                <>
                  <Loader2 className="size-3 animate-spin" /> Saving…
                </>
              ) : pending?.kind === 'approve' ? (
                'Confirm Approve'
              ) : pending?.kind === 'reinstate' ? (
                'Confirm Reinstate'
              ) : pending?.kind === 'suspend' ? (
                'Confirm Suspend'
              ) : (
                'Confirm Reject'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
