/**
 * Growth > Credits — manual credit grant workspace.
 *
 * Why this exists: Reach's "Earn Credits" flow (referrals, verification
 * rewards surfaced to the customer) is intentionally deferred. Until it
 * ships, a customer with 0 credits has no way to ever get any, and Boost
 * hits a dead end. This gives Customer Success / Ops a way to unblock a
 * demo or compensate a user right now, using the exact same
 * increment_credit_wallet RPC the real growth loop already uses (admin_
 * adjustment path, service-role-authorized — see
 * 20261228000000_reach_credits_admin_grant_and_payment_state.sql).
 *
 * Auditability note: pulse_credit_transactions.created_by is populated from
 * auth.uid() — which is NULL for every grant made through this console,
 * because analytics/ has no real login (service-role key only). "Granted
 * by" below is a self-reported text field folded into the ledger note as a
 * pragmatic stand-in, not a real identity — that only becomes possible once
 * Control Tower (real Supabase Auth + Platform IAM) exists.
 *
 * "Source" in the ledger is derived from the existing `type` column, not a
 * new stored column — SYSTEM (earn_verification/earn_referral), ADMIN
 * (admin_adjustment), USER (spend_reach/refund) map 1:1 onto types that
 * already exist, so storing a second overlapping field would just be a
 * second place for the two to drift out of sync.
 */
import { useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  BadgeCheck,
  Building2,
  ChevronRight,
  Coins,
  History,
  Loader2,
  MapPin,
  RefreshCw,
  Search,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { useAdmin } from '@/context/AdminDataProvider';
// Session client, not service_role: pulse_credit_wallets/transactions already
// grant read to holders of the 'credits.issue' platform permission, and
// increment_credit_wallet is SECURITY DEFINER with its own credits.issue guard
// and created_by = auth.uid(). See 20270306050000_credits_rpc_type_guard.sql.
import { supabaseAuth as supabase } from '@/lib/supabaseAuth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface WalletState {
  balance: number;
  lifetime_earned: number;
  lifetime_spent: number;
}

interface LedgerRow {
  id: string;
  type: string;
  amount: number;
  balance_after: number;
  notes: string | null;
  created_at: string;
}

const PRESET_AMOUNTS = [500, 1000, 5000];

const REASON_OPTIONS = [
  'Demo',
  'Customer Compensation',
  'Verification Reward',
  'Promotional Campaign',
  'Manual Adjustment',
  'Support Resolution',
  'Other',
] as const;

const SOURCE_BY_TYPE: Record<string, { label: string; variant: 'info' | 'primary' | 'secondary' }> = {
  earn_verification: { label: 'System', variant: 'info' },
  earn_referral: { label: 'System', variant: 'info' },
  admin_adjustment: { label: 'Admin', variant: 'primary' },
  spend_reach: { label: 'User', variant: 'secondary' },
  refund: { label: 'User', variant: 'secondary' },
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function orgInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function formatCredits(n: number): string {
  return n.toLocaleString('en-IN');
}

function StatCard({
  label,
  value,
  sub,
  icon,
  emphasis,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  emphasis?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-3.5 ${
        emphasis ? 'border-primary/25 bg-primary/[0.04]' : 'border-border bg-card'
      }`}
    >
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1.5 text-xl font-bold tabular-nums text-foreground">{value}</div>
      {sub ? <div className="mt-0.5 text-[10px] text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

export function CreditsPanel() {
  const { applications } = useAdmin();
  const [query, setQuery] = useState('');
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [wallet, setWallet] = useState<WalletState | null>(null);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [loadingWallet, setLoadingWallet] = useState(false);

  const [direction, setDirection] = useState<'grant' | 'deduct'>('grant');
  const [amount, setAmount] = useState<number | null>(500);
  const [customAmount, setCustomAmount] = useState('');
  const [reasonOption, setReasonOption] = useState<(typeof REASON_OPTIONS)[number]>('Demo');
  const [customReason, setCustomReason] = useState('');
  const [grantedBy, setGrantedBy] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const sortedOrgs = useMemo(
    () => [...applications].sort((a, b) => a.company_name.localeCompare(b.company_name)),
    [applications],
  );

  const filteredOrgs = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sortedOrgs;
    return sortedOrgs.filter((o) => o.company_name.toLowerCase().includes(q));
  }, [sortedOrgs, query]);

  const selectedOrg = applications.find((o) => o.id === selectedOrgId) ?? null;

  const effectiveAmount = amount ?? (Number(customAmount) || 0);
  const effectiveReason = reasonOption === 'Other' ? customReason.trim() : reasonOption;
  const amountValid = Number.isFinite(effectiveAmount) && effectiveAmount > 0;
  const deductExceedsBalance = direction === 'deduct' && wallet != null && effectiveAmount > wallet.balance;
  const canSubmit = amountValid && !!effectiveReason && !submitting && !deductExceedsBalance;

  async function loadWallet(orgId: string) {
    setLoadingWallet(true);
    setFeedback(null);
    const [{ data: walletRow }, { data: ledgerRows }] = await Promise.all([
      supabase.from('pulse_credit_wallets').select('balance, lifetime_earned, lifetime_spent').eq('org_id', orgId).maybeSingle(),
      supabase
        .from('pulse_credit_transactions')
        .select('id, type, amount, balance_after, notes, created_at')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .limit(15),
    ]);
    setWallet(walletRow ?? { balance: 0, lifetime_earned: 0, lifetime_spent: 0 });
    setLedger((ledgerRows ?? []) as LedgerRow[]);
    setLoadingWallet(false);
  }

  function selectOrg(orgId: string) {
    if (orgId === selectedOrgId) return;
    setSelectedOrgId(orgId);
    setFeedback(null);
    loadWallet(orgId);
  }

  async function submitAdjustment() {
    if (!selectedOrgId || !canSubmit) return;
    setSubmitting(true);
    setFeedback(null);
    const signedAmount = direction === 'grant' ? effectiveAmount : -effectiveAmount;
    const notes = `${effectiveReason}${grantedBy.trim() ? ` — granted by ${grantedBy.trim()}` : ''}`;
    const { error } = await supabase.rpc('increment_credit_wallet', {
      p_org_id: selectedOrgId,
      p_type: 'admin_adjustment',
      p_amount: signedAmount,
      p_reference_type: null,
      p_reference_id: null,
      p_notes: notes,
    });
    setSubmitting(false);
    if (error) {
      setFeedback({ kind: 'error', text: error.message });
      return;
    }
    setFeedback({
      kind: 'success',
      text: `${direction === 'grant' ? 'Granted' : 'Deducted'} ${formatCredits(effectiveAmount)} credits to ${selectedOrg?.company_name ?? 'organization'}.`,
    });
    setCustomReason('');
    loadWallet(selectedOrgId);
  }

  const inputClass =
    'w-full rounded-md border border-input bg-background px-2.5 py-2 text-xs text-foreground outline-none transition-shadow placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/25';
  const labelClass = 'text-[10px] font-semibold uppercase tracking-wider text-muted-foreground';

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Page header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span>Growth</span>
            <ChevronRight className="size-3" />
            <span className="font-semibold text-foreground">Credits</span>
            <Badge variant="secondary" appearance="light" size="sm" className="ml-1">
              Manual grants
            </Badge>
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Credit wallet operations — stand-in for Earn Credits until the growth loop ships. Every
            adjustment writes an auditable ledger entry.
          </p>
        </div>
        {selectedOrgId ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadWallet(selectedOrgId)}
            disabled={loadingWallet}
          >
            <RefreshCw className={`size-3.5 ${loadingWallet ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        ) : null}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Organization directory ── */}
        <aside className="flex w-72 shrink-0 flex-col border-r border-border">
          <div className="border-b border-border p-3">
            <div className="flex items-center gap-1.5 rounded-md border border-input bg-background px-2.5 py-2 transition-shadow focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/25">
              <Search className="size-3.5 shrink-0 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search organizations…"
                className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
              />
            </div>
            <div className="mt-2 flex items-center justify-between px-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <span>Organizations</span>
              <span className="tabular-nums">{filteredOrgs.length}</span>
            </div>
          </div>
          <div className="flex-1 space-y-0.5 overflow-y-auto p-2">
            {filteredOrgs.map((org) => {
              const selected = org.id === selectedOrgId;
              const location = [org.city, org.state].filter((v) => v && v !== '—').join(', ');
              return (
                <button
                  key={org.id}
                  onClick={() => selectOrg(org.id)}
                  className={`group flex w-full items-center gap-2.5 rounded-md border px-2 py-2 text-left transition-colors ${
                    selected
                      ? 'border-primary/30 bg-primary/[0.06]'
                      : 'border-transparent hover:bg-accent'
                  }`}
                >
                  <span
                    className={`flex size-7 shrink-0 items-center justify-center rounded-md text-[10px] font-bold ${
                      selected
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground group-hover:bg-background'
                    }`}
                  >
                    {orgInitials(org.company_name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1">
                      <span
                        className={`truncate text-xs ${
                          selected ? 'font-semibold text-foreground' : 'font-medium text-foreground/90'
                        }`}
                      >
                        {org.company_name}
                      </span>
                      {org.status === 'Approved' ? (
                        <BadgeCheck className="size-3 shrink-0 text-emerald-500" />
                      ) : null}
                    </span>
                    <span className="block truncate text-[10px] text-muted-foreground">
                      {location || 'Location not set'}
                    </span>
                  </span>
                  <ChevronRight
                    className={`size-3.5 shrink-0 text-muted-foreground transition-opacity ${
                      selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-60'
                    }`}
                  />
                </button>
              );
            })}
            {filteredOrgs.length === 0 ? (
              <div className="px-2 py-8 text-center">
                <Building2 className="mx-auto size-5 text-muted-foreground/50" />
                <p className="mt-2 text-[11px] text-muted-foreground">No organizations match "{query}".</p>
              </div>
            ) : null}
          </div>
        </aside>

        {/* ── Workspace ── */}
        <div className="flex-1 overflow-y-auto">
          {!selectedOrg ? (
            <div className="flex h-full items-center justify-center p-8">
              <div className="max-w-xs text-center">
                <div className="mx-auto flex size-12 items-center justify-center rounded-full border border-border bg-muted/40">
                  <Wallet className="size-5 text-muted-foreground" />
                </div>
                <h3 className="mt-3 text-sm font-semibold text-foreground">Select an organization</h3>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  Choose an organization from the directory to review its credit wallet, grant or
                  deduct credits, and audit recent ledger activity.
                </p>
              </div>
            </div>
          ) : loadingWallet ? (
            <div className="flex h-full items-center justify-center">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Loading wallet for {selectedOrg.company_name}…
              </div>
            </div>
          ) : (
            <div className="space-y-4 p-4">
              {/* Org identity */}
              <div className="flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">
                  {orgInitials(selectedOrg.company_name)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate text-base font-bold text-foreground">
                      {selectedOrg.company_name}
                    </h2>
                    {selectedOrg.status === 'Approved' ? (
                      <Badge variant="success" appearance="light" size="sm">
                        <BadgeCheck className="size-3" />
                        Verified
                      </Badge>
                    ) : (
                      <Badge variant="secondary" appearance="light" size="sm">
                        {selectedOrg.status}
                      </Badge>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                    <MapPin className="size-3" />
                    {[selectedOrg.city, selectedOrg.state].filter((v) => v && v !== '—').join(', ') ||
                      'Location not set'}
                  </div>
                </div>
              </div>

              {/* Wallet KPIs */}
              <div className="grid grid-cols-3 gap-3">
                <StatCard
                  emphasis
                  label="Current Balance"
                  value={`${formatCredits(wallet?.balance ?? 0)} cr`}
                  sub="Available to spend on Pulse Boost"
                  icon={<Coins className="size-3" />}
                />
                <StatCard
                  label="Lifetime Earned"
                  value={formatCredits(wallet?.lifetime_earned ?? 0)}
                  sub="Grants + system rewards"
                  icon={<TrendingUp className="size-3" />}
                />
                <StatCard
                  label="Lifetime Spent"
                  value={formatCredits(wallet?.lifetime_spent ?? 0)}
                  sub="Campaigns + escrow"
                  icon={<TrendingDown className="size-3" />}
                />
              </div>

              <div className="grid grid-cols-[minmax(0,5fr)_minmax(0,7fr)] items-start gap-4">
                {/* ── Adjustment form ── */}
                <section className="rounded-lg border border-border bg-card">
                  <header className="border-b border-border px-3.5 py-2.5">
                    <h3 className="text-xs font-semibold text-foreground">Credit Adjustment</h3>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      Writes an <span className="font-medium">admin_adjustment</span> ledger entry.
                    </p>
                  </header>

                  <div className="space-y-3.5 p-3.5">
                    {/* Direction */}
                    <div className="grid grid-cols-2 gap-1 rounded-md border border-border bg-muted/40 p-1">
                      {(['grant', 'deduct'] as const).map((d) => (
                        <button
                          key={d}
                          onClick={() => setDirection(d)}
                          className={`flex items-center justify-center gap-1.5 rounded px-2 py-1.5 text-xs font-semibold transition-colors ${
                            direction === d
                              ? d === 'grant'
                                ? 'bg-background text-emerald-600 shadow-sm'
                                : 'bg-background text-rose-600 shadow-sm'
                              : 'text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {d === 'grant' ? (
                            <ArrowUpRight className="size-3.5" />
                          ) : (
                            <ArrowDownLeft className="size-3.5" />
                          )}
                          {d === 'grant' ? 'Grant' : 'Deduct'}
                        </button>
                      ))}
                    </div>

                    {/* Amount */}
                    <div>
                      <label className={labelClass}>Amount (credits)</label>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {PRESET_AMOUNTS.map((preset) => (
                          <button
                            key={preset}
                            onClick={() => {
                              setAmount(preset);
                              setCustomAmount('');
                            }}
                            className={`rounded-md border px-3 py-1.5 text-xs font-semibold tabular-nums transition-colors ${
                              amount === preset
                                ? 'border-primary/40 bg-primary/10 text-foreground'
                                : 'border-input text-muted-foreground hover:bg-accent hover:text-foreground'
                            }`}
                          >
                            {formatCredits(preset)}
                          </button>
                        ))}
                        <button
                          onClick={() => setAmount(null)}
                          className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors ${
                            amount === null
                              ? 'border-primary/40 bg-primary/10 text-foreground'
                              : 'border-input text-muted-foreground hover:bg-accent hover:text-foreground'
                          }`}
                        >
                          Custom
                        </button>
                      </div>
                      {amount === null ? (
                        <input
                          type="number"
                          min={1}
                          value={customAmount}
                          onChange={(e) => setCustomAmount(e.target.value)}
                          placeholder="Enter amount, e.g. 750"
                          className={`mt-1.5 ${inputClass}`}
                        />
                      ) : null}
                    </div>

                    {/* Reason */}
                    <div>
                      <label className={labelClass}>Reason</label>
                      <select
                        value={reasonOption}
                        onChange={(e) => setReasonOption(e.target.value as (typeof REASON_OPTIONS)[number])}
                        className={`mt-1 ${inputClass}`}
                      >
                        {REASON_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                      {reasonOption === 'Other' ? (
                        <input
                          value={customReason}
                          onChange={(e) => setCustomReason(e.target.value)}
                          placeholder="Describe the reason…"
                          className={`mt-1.5 ${inputClass}`}
                        />
                      ) : null}
                    </div>

                    {/* Operator */}
                    <div>
                      <label className={labelClass}>Granted by</label>
                      <input
                        value={grantedBy}
                        onChange={(e) => setGrantedBy(e.target.value)}
                        placeholder="Your name"
                        className={`mt-1 ${inputClass}`}
                      />
                      <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                        Self-reported until console login exists — recorded in the ledger note.
                      </p>
                    </div>

                    {/* Review + submit */}
                    <div className="space-y-2 border-t border-border pt-3">
                      <div className="flex items-center justify-between rounded-md bg-muted/40 px-2.5 py-2 text-[11px]">
                        <span className="text-muted-foreground">This will record</span>
                        <span
                          className={`font-semibold tabular-nums ${
                            direction === 'grant' ? 'text-emerald-600' : 'text-rose-600'
                          }`}
                        >
                          {direction === 'grant' ? '+' : '−'}
                          {formatCredits(amountValid ? effectiveAmount : 0)} credits
                        </span>
                      </div>

                      {deductExceedsBalance ? (
                        <div className="flex items-start gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-700 dark:text-amber-400">
                          <ShieldAlert className="mt-px size-3.5 shrink-0" />
                          Deduction exceeds the current balance of{' '}
                          {formatCredits(wallet?.balance ?? 0)} credits.
                        </div>
                      ) : null}

                      <Button
                        variant={direction === 'grant' ? 'primary' : 'destructive'}
                        size="sm"
                        className="w-full"
                        onClick={submitAdjustment}
                        disabled={!canSubmit}
                      >
                        {submitting ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : direction === 'grant' ? (
                          <ArrowUpRight className="size-3.5" />
                        ) : (
                          <ArrowDownLeft className="size-3.5" />
                        )}
                        {direction === 'grant' ? 'Grant Credits' : 'Deduct Credits'}
                      </Button>

                      {feedback ? (
                        <div
                          className={`rounded-md px-2.5 py-2 text-[11px] font-medium ${
                            feedback.kind === 'success'
                              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                              : 'bg-rose-500/10 text-rose-700 dark:text-rose-400'
                          }`}
                        >
                          {feedback.text}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </section>

                {/* ── Ledger ── */}
                <section className="rounded-lg border border-border bg-card">
                  <header className="flex items-center justify-between border-b border-border px-3.5 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <History className="size-3.5 text-muted-foreground" />
                      <h3 className="text-xs font-semibold text-foreground">Ledger Activity</h3>
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      Last {ledger.length} transaction{ledger.length === 1 ? '' : 's'}
                    </span>
                  </header>

                  {ledger.length === 0 ? (
                    <div className="px-3.5 py-10 text-center">
                      <History className="mx-auto size-5 text-muted-foreground/50" />
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        No transactions yet — the first adjustment will appear here.
                      </p>
                    </div>
                  ) : (
                    <div>
                      <div className="grid grid-cols-[64px_minmax(0,1fr)_72px_88px] items-center gap-2 border-b border-border px-3.5 py-1.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                        <span>Source</span>
                        <span>Note</span>
                        <span className="text-right">Amount</span>
                        <span className="text-right">Balance · When</span>
                      </div>
                      <div className="divide-y divide-border/60">
                        {ledger.map((row) => {
                          const source = SOURCE_BY_TYPE[row.type] ?? {
                            label: row.type,
                            variant: 'secondary' as const,
                          };
                          return (
                            <div
                              key={row.id}
                              className="grid grid-cols-[64px_minmax(0,1fr)_72px_88px] items-center gap-2 px-3.5 py-2 text-[11px]"
                            >
                              <Badge variant={source.variant} appearance="light" size="xs">
                                {source.label}
                              </Badge>
                              <span className="truncate font-medium text-foreground" title={row.notes ?? row.type}>
                                {row.notes ?? row.type}
                              </span>
                              <span
                                className={`text-right font-semibold tabular-nums ${
                                  row.amount >= 0 ? 'text-emerald-600' : 'text-rose-600'
                                }`}
                              >
                                {row.amount >= 0 ? '+' : ''}
                                {formatCredits(row.amount)}
                              </span>
                              <span className="text-right text-[10px] tabular-nums text-muted-foreground">
                                {formatCredits(row.balance_after)} · {timeAgo(row.created_at)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </section>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
