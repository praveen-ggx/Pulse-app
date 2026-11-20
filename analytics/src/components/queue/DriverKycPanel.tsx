/**
 * Driver KYC review console — the driver-side counterpart to the organization
 * verification workspace. Separate panel by design: driver identity documents
 * are keyed by auth.uid() and carry no org application, so they don't fit the
 * org queue's application/entity model.
 *
 * Left: drivers who submitted for verification. Right: their documents with
 * inline viewer + per-document approve/reject, then a driver-level decision.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BadgeCheck,
  FileText,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  ShieldX,
  UserRound,
} from 'lucide-react';
// Realtime on the session client so the channel authenticates the same way as
// the queries it refreshes (Realtime enforces RLS for `authenticated`).
import { supabaseAuth as supabase } from '@/lib/supabaseAuth';
import {
  approveDriverKycDocument,
  fetchDriverKycDocumentsForDriver,
  fetchDriverKycSubmissions,
  rejectDriverKycDocument,
  reopenDriverKycSubmission,
  reviewDriverKycSubmission,
  type DriverKycQueueRow,
  type DriverKycReviewStatus,
  type DriverKycSubmissionRow,
} from '@/lib/driverKyc';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/** Preset reasons keep wording consistent between reviewers; notes add specifics. */
const DOC_REJECTION_REASONS = [
  'Blurred / unreadable',
  'Expired document',
  'Wrong document type',
  'Name does not match driver',
  'Details not fully visible',
  'Suspected tampering',
  'Other',
] as const;

const DRIVER_REJECTION_REASONS = [
  'Documents do not match the driver',
  'Incomplete document set',
  'Failed identity verification',
  'Duplicate driver record',
  'Other',
] as const;

/** Which confirmation dialog is open, and what it will act on. */
type PendingAction =
  | { kind: 'reject-doc'; docId: string; docLabel: string }
  | { kind: 'reject-driver' }
  | { kind: 'approve-driver' }
  | { kind: 'reopen-driver' }
  | null;

const STATUS_FILTERS: { key: 'all' | DriverKycReviewStatus; label: string }[] = [
  { key: 'submitted', label: 'Awaiting' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'all', label: 'All' },
];

const SUBMISSION_BADGE: Record<
  DriverKycReviewStatus,
  { label: string; variant: 'info' | 'success' | 'secondary' }
> = {
  submitted: { label: 'Awaiting review', variant: 'info' },
  approved: { label: 'Approved', variant: 'success' },
  rejected: { label: 'Rejected', variant: 'secondary' },
};

const DOC_BADGE: Record<string, 'info' | 'success' | 'destructive' | 'secondary'> = {
  pending: 'info',
  verified: 'success',
  rejected: 'destructive',
  expired: 'secondary',
};

/** Mirrors driver_kyc_doc_requirements.is_mandatory = false. */
const OPTIONAL_DOC_TYPES = new Set(['pan', 'bank_proof', 'other']);

/** Mirrors driver_kyc_doc_requirements.required_for_dco (needed for DCO approval). */
const DCO_DOC_TYPES = new Set(['pan', 'bank_proof']);

const DOC_TYPE_LABEL: Record<string, string> = {
  license: 'Driving licence',
  aadhaar: 'Aadhaar',
  pan: 'PAN',
  selfie: 'Selfie',
  bank_proof: 'Bank proof',
  other: 'Other',
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

export function DriverKycPanel() {
  const [rows, setRows] = useState<DriverKycSubmissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | DriverKycReviewStatus>('submitted');
  const [search, setSearch] = useState('');
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [docs, setDocs] = useState<DriverKycQueueRow[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction>(null);
  const [reasonPreset, setReasonPreset] = useState('');
  const [reasonNotes, setReasonNotes] = useState('');
  const [dialogBusy, setDialogBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await fetchDriverKycSubmissions();
    setRows(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Live updates: a driver submitting (or a reviewer elsewhere deciding) should
  // land in this queue without a manual refresh.
  useEffect(() => {
    const channel = supabase
      .channel('driver-kyc-console')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'driver_kyc_submissions' },
        () => void load(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'driver_kyc_documents' },
        () => void load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load]);

  const loadDocs = useCallback(async (uid: string) => {
    setDocsLoading(true);
    const data = await fetchDriverKycDocumentsForDriver(uid);
    setDocs(data);
    setDocsLoading(false);
  }, []);

  useEffect(() => {
    if (!selectedUid) {
      setDocs([]);
      return;
    }
    void loadDocs(selectedUid);
  }, [selectedUid, loadDocs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      // DCO document review rides the normal "Awaiting" queue even when the
      // driver's base KYC is already decided.
      const awaitingDco = filter === 'submitted' && r.dco_docs_pending > 0;
      if (filter !== 'all' && r.review_status !== filter && !awaitingDco) return false;
      if (!q) return true;
      return (
        (r.driver_name ?? '').toLowerCase().includes(q) ||
        (r.driver_phone ?? '').toLowerCase().includes(q) ||
        (r.organization_name ?? '').toLowerCase().includes(q)
      );
    });
  }, [rows, filter, search]);

  const selected = rows.find((r) => r.driver_user_id === selectedUid) ?? null;

  const runDocAction = async (fn: () => Promise<{ error: string | null }>, id: string) => {
    setBusyId(id);
    setError(null);
    const { error: err } = await fn();
    if (err) setError(err);
    if (selectedUid) await loadDocs(selectedUid);
    await load();
    setBusyId(null);
  };

  const handleApproveDoc = (docId: string) =>
    runDocAction(() => approveDriverKycDocument(docId), docId);

  const openAction = (action: PendingAction) => {
    setReasonPreset('');
    setReasonNotes('');
    setError(null);
    setPending(action);
  };

  /** Sent to the driver: category plus the reviewer's specifics. */
  const composedReason = [reasonPreset, reasonNotes.trim()].filter(Boolean).join(' — ');
  const reasonComplete = !!reasonPreset && reasonNotes.trim().length > 0;

  const confirmAction = async () => {
    if (!pending) return;
    setDialogBusy(true);
    setError(null);

    const result =
      pending.kind === 'reject-doc'
        ? await rejectDriverKycDocument(pending.docId, composedReason)
        : pending.kind === 'reopen-driver' && selectedUid
          ? await reopenDriverKycSubmission(selectedUid, reasonNotes.trim())
          : pending.kind === 'reject-driver' && selectedUid
            ? await reviewDriverKycSubmission(selectedUid, 'rejected', composedReason)
            : pending.kind === 'approve-driver' && selectedUid
              ? await reviewDriverKycSubmission(
                  selectedUid,
                  'approved',
                  reasonNotes.trim() || undefined,
                )
              : { error: 'No driver selected' };

    setDialogBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setPending(null);
    if (selectedUid) await loadDocs(selectedUid);
    await load();
  };

  // Rejecting the driver while documents sit at 'pending' lets them re-submit
  // the same files unchanged — surfaced inline rather than as a second popup.
  const undecidedDocCount = docs.filter((d) => d.status === 'pending').length;

  // A driver who has already been approved or rejected is decided: the review
  // is over. Leaving the live Approve/Reject buttons up implied the decision
  // hadn't been made yet, and clicking them silently overwrote it — there is no
  // reason for a one-click "un-approve" to sit next to a verified driver.
  // Changing a decision is now deliberate: reopen first, then decide.
  const isDecided = selected?.review_status === 'approved' || selected?.review_status === 'rejected';

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* ── Left: submission queue ─────────────────────────────────────────── */}
      <aside className="flex w-80 shrink-0 flex-col overflow-hidden border-r border-border">
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
          <UserRound className="size-3.5 text-muted-foreground" />
          <span className="text-[12px] font-semibold">Driver KYC</span>
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
          <div className="relative">
            <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name, phone, org"
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

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="px-3 py-8 text-center text-[11px] text-muted-foreground">
              No driver submissions
              {filter !== 'all' ? ' in this state' : ''}.
            </p>
          ) : (
            filtered.map((r) => {
              const badge = SUBMISSION_BADGE[r.review_status];
              const active = r.driver_user_id === selectedUid;
              return (
                <button
                  key={r.driver_user_id}
                  onClick={() => setSelectedUid(r.driver_user_id)}
                  className={`flex w-full flex-col gap-1 border-b border-border px-3 py-2 text-left hover:bg-muted/40 ${
                    active ? 'bg-muted/60' : ''
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[12px] font-semibold">
                      {r.driver_name ?? 'Unknown driver'}
                    </span>
                    {r.dco_docs_pending > 0 ? (
                      <Badge variant="info" appearance="light" size="xs" className="ml-auto shrink-0">
                        DCO docs
                      </Badge>
                    ) : null}
                    <Badge
                      variant={badge.variant}
                      appearance="light"
                      size="xs"
                      className={`${r.dco_docs_pending > 0 ? '' : 'ml-auto '}shrink-0`}
                    >
                      {badge.label}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span>{r.driver_phone ?? '—'}</span>
                    {r.organization_name ? <span>· {r.organization_name}</span> : null}
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span>{formatDate(r.submitted_at)}</span>
                    {r.attempt_count > 1 ? (
                      <span className="font-semibold text-amber-600">
                        attempt {r.attempt_count}
                      </span>
                    ) : null}
                    <span className="ml-auto">
                      {r.verified_count}/{r.document_count} verified
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* ── Right: documents for the selected driver ───────────────────────── */}
      <section className="flex flex-1 flex-col overflow-hidden">
        {!selected ? (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-[12px] text-muted-foreground">
              Select a driver to review their documents.
            </p>
          </div>
        ) : (
          <>
            <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border bg-muted/30 px-4 py-2">
              <BadgeCheck className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="text-[12px] font-semibold">{selected.driver_name ?? 'Unknown driver'}</span>
              <span className="text-[11px] text-muted-foreground">{selected.driver_phone ?? '—'}</span>
              {selected.organization_name ? (
                <span className="text-[11px] text-muted-foreground">· {selected.organization_name}</span>
              ) : null}
              <Badge
                variant={SUBMISSION_BADGE[selected.review_status].variant}
                appearance="light"
                size="sm"
                className="ml-auto"
              >
                {SUBMISSION_BADGE[selected.review_status].label}
              </Badge>
            </div>

            {error ? (
              <div className="shrink-0 border-b border-border bg-destructive/10 px-4 py-2 text-[11px] text-destructive">
                {error}
              </div>
            ) : null}

            <div className="flex-1 overflow-y-auto p-4">
              {docsLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                </div>
              ) : docs.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">No documents found for this driver.</p>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {docs.map((d) => (
                    <div key={d.id} className="overflow-hidden rounded-lg border border-border">
                      <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-3 py-2">
                        <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="text-[12px] font-semibold">
                          {DOC_TYPE_LABEL[d.doc_type] ?? d.doc_type}
                        </span>
                        {/* Rejecting an optional doc does not block the driver —
                            they can withdraw it — so label it to avoid a
                            reviewer chasing a doc that isn't required. */}
                        {DCO_DOC_TYPES.has(d.doc_type) ? (
                          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            optional · required for DCO
                          </span>
                        ) : OPTIONAL_DOC_TYPES.has(d.doc_type) ? (
                          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            optional
                          </span>
                        ) : null}
                        <Badge
                          variant={DOC_BADGE[d.status] ?? 'secondary'}
                          appearance="light"
                          size="xs"
                          className="ml-auto"
                        >
                          {d.status}
                        </Badge>
                      </div>

                      <div className="bg-muted/10 p-2">
                        {d.signed_url ? (
                          d.mime_type === 'application/pdf' ? (
                            <a
                              href={d.signed_url}
                              target="_blank"
                              rel="noreferrer"
                              className="block py-6 text-center text-[11px] font-medium text-primary underline"
                            >
                              Open PDF
                            </a>
                          ) : (
                            <a href={d.signed_url} target="_blank" rel="noreferrer">
                              <img
                                src={d.signed_url}
                                alt={DOC_TYPE_LABEL[d.doc_type] ?? d.doc_type}
                                className="max-h-56 w-full rounded object-contain"
                              />
                            </a>
                          )
                        ) : (
                          <p className="py-6 text-center text-[11px] text-muted-foreground">
                            Preview unavailable
                          </p>
                        )}
                      </div>

                      {d.rejection_notes ? (
                        <p className="border-t border-border px-3 py-1.5 text-[10px] text-destructive">
                          {d.rejection_notes}
                        </p>
                      ) : null}

                      <div className="flex items-center gap-2 border-t border-border px-3 py-2">
                        <span className="text-[10px] text-muted-foreground">
                          {formatDate(d.created_at)}
                        </span>
                        {/* Once the driver-level decision is made, per-document
                            actions would contradict it (rejecting a doc under an
                            approved driver leaves them verified with a rejected
                            document). Reopen the review to change anything. */}
                        {/* Exception: DCO-only docs (PAN, bank proof) uploaded after
                            the driver was already verified still need a decision —
                            they don't affect base KYC, only DCO approval. */}
                        {isDecided &&
                        !(DCO_DOC_TYPES.has(d.doc_type) && d.status === 'pending') ? null : (
                          <div className="ml-auto flex gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 gap-1 px-2 text-[11px]"
                              disabled={busyId === d.id || d.status === 'verified'}
                              onClick={() => void handleApproveDoc(d.id)}
                            >
                              <ShieldCheck className="size-3" />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 gap-1 px-2 text-[11px]"
                              disabled={busyId === d.id || d.status === 'rejected'}
                              onClick={() =>
                                openAction({
                                  kind: 'reject-doc',
                                  docId: d.id,
                                  docLabel: DOC_TYPE_LABEL[d.doc_type] ?? d.doc_type,
                                })
                              }
                            >
                              <ShieldX className="size-3" />
                              Reject
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-2 border-t border-border bg-muted/20 px-4 py-2.5">
              <span className="text-[11px] text-muted-foreground">
                {selected.verified_count}/{selected.document_count} documents verified
                {selected.rejected_count > 0
                  ? ` · ${selected.rejected_count} rejected`
                  : ''}
                {/* Optional docs are allowed to be absent — say so explicitly so
                    a reviewer doesn't hold the driver for a doc they don't need. */}
                {selected.optional_not_provided
                  ? ` · ${selected.optional_not_provided} not provided (optional)`
                  : ''}
                {selected.attempt_count > 1 ? ` · attempt ${selected.attempt_count}` : ''}
              </span>
              <div className="ml-auto flex items-center gap-2">
                {isDecided ? (
                  <>
                    <span className="text-[11px] font-medium text-muted-foreground">
                      {selected.review_status === 'approved'
                        ? 'Approved'
                        : 'Rejected'}
                      {selected.reviewed_at ? ` · ${formatDate(selected.reviewed_at)}` : ''}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1.5 text-[12px]"
                      disabled={busyId === selected.driver_user_id}
                      onClick={() => openAction({ kind: 'reopen-driver' })}
                    >
                      <RotateCcw className="size-3.5" />
                      Reopen review
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1.5 text-[12px]"
                      disabled={busyId === selected.driver_user_id}
                      onClick={() => openAction({ kind: 'reject-driver' })}
                    >
                      <ShieldX className="size-3.5" />
                      Reject driver
                    </Button>
                    <Button
                      size="sm"
                      className="h-8 gap-1.5 text-[12px]"
                      disabled={busyId === selected.driver_user_id}
                      onClick={() => openAction({ kind: 'approve-driver' })}
                    >
                      <ShieldCheck className="size-3.5" />
                      Approve driver
                    </Button>
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </section>

      {/* ─── Decision dialog (replaces window.prompt/confirm) ─────────────── */}
      <Dialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open && !dialogBusy) setPending(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pending?.kind === 'approve-driver' ? (
                <>
                  <ShieldCheck className="size-4 text-emerald-600" />
                  Approve {selected?.driver_name ?? 'driver'}
                </>
              ) : pending?.kind === 'reopen-driver' ? (
                <>
                  <RotateCcw className="size-4 text-amber-600" />
                  Reopen review for {selected?.driver_name ?? 'driver'}
                </>
              ) : pending?.kind === 'reject-driver' ? (
                <>
                  <ShieldX className="size-4 text-destructive" />
                  Reject {selected?.driver_name ?? 'driver'}
                </>
              ) : (
                <>
                  <ShieldX className="size-4 text-destructive" />
                  Reject {pending?.kind === 'reject-doc' ? pending.docLabel : 'document'}
                </>
              )}
            </DialogTitle>
          </DialogHeader>

          {pending?.kind === 'reopen-driver' ? (
            <div className="mt-3 space-y-2.5">
              <textarea
                value={reasonNotes}
                onChange={(e) => setReasonNotes(e.target.value)}
                placeholder="Why is this decision being reopened? (required)…"
                rows={3}
                className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30"
              />
              <div className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 dark:border-amber-800 dark:bg-amber-950/40">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
                <p className="text-[11px] leading-snug text-amber-800 dark:text-amber-300">
                  {selected?.review_status === 'approved'
                    ? 'This driver is currently verified. Reopening removes their verified status until you decide again.'
                    : 'Reopening puts this driver back in the awaiting queue so you can decide again.'}{' '}
                  Recorded in the audit trail.
                </p>
              </div>
            </div>
          ) : pending?.kind === 'approve-driver' ? (
            <div className="mt-3 space-y-2.5">
              <textarea
                value={reasonNotes}
                onChange={(e) => setReasonNotes(e.target.value)}
                placeholder="Optional note for the audit trail…"
                rows={2}
                className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30"
              />
              <p className="text-[11px] text-muted-foreground">
                Marks this driver verified. They will not be able to submit again.
              </p>
            </div>
          ) : (
            <div className="mt-3 space-y-2.5">
              <Select value={reasonPreset} onValueChange={setReasonPreset}>
                <SelectTrigger size="sm">
                  <SelectValue placeholder="Select a reason…" />
                </SelectTrigger>
                <SelectContent>
                  {(pending?.kind === 'reject-driver'
                    ? DRIVER_REJECTION_REASONS
                    : DOC_REJECTION_REASONS
                  ).map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <textarea
                value={reasonNotes}
                onChange={(e) => setReasonNotes(e.target.value)}
                placeholder="Tell the driver exactly what to fix (required)…"
                rows={3}
                className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30"
              />

              {pending?.kind === 'reject-driver' && undecidedDocCount > 0 ? (
                <div className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 dark:border-amber-800 dark:bg-amber-950/40">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
                  <p className="text-[11px] leading-snug text-amber-800 dark:text-amber-300">
                    {undecidedDocCount} document{undecidedDocCount === 1 ? '' : 's'} still
                    pending. Reject the specific documents too, or the driver can re-submit
                    the same files unchanged.
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

          {error ? (
            <p className="mt-2 text-[11px] text-destructive">{error}</p>
          ) : null}

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
              variant={pending?.kind === 'approve-driver' ? 'primary' : 'destructive'}
              onClick={() => void confirmAction()}
              disabled={
                dialogBusy ||
                (pending?.kind === 'reopen-driver'
                  ? reasonNotes.trim().length === 0
                  : pending?.kind !== 'approve-driver' && !reasonComplete)
              }
            >
              {dialogBusy ? (
                <>
                  <Loader2 className="size-3 animate-spin" /> Saving…
                </>
              ) : pending?.kind === 'approve-driver' ? (
                'Confirm Approve'
              ) : pending?.kind === 'reopen-driver' ? (
                'Confirm Reopen'
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
