/**
 * Support S2 — Admin Support Console. Master-detail: ticket queue on the
 * left, ticket workspace (context + conversation + internal notes + reply +
 * status/priority + activity) on the right. Mirrors DriverKycPanel's shape.
 *
 * No agent identity, no assignment UI — deliberately S3 (see
 * docs/SUPPORT_SYSTEM_PLAN.md §15 Decision B). Every ticket is Unassigned
 * today; the filter below is real, it just always matches everything until
 * S3 introduces agents to assign to.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Clock3,
  FileText,
  Loader2,
  Lock,
  MessageSquare,
  RefreshCw,
  Search,
  StickyNote,
  Ticket,
} from 'lucide-react';
// Realtime subscribes on the admin's own session client, not the service_role
// client: Phase 1 moved every Support read/write onto the session, and a channel
// opened on a second client would both authenticate differently from the queries
// it invalidates and keep an extra socket open for the panel's lifetime.
import { supabaseAuth as supabase } from '@/lib/supabaseAuth';
import { useSupportQueue, type StatusFilter } from './useSupportQueue';
import { SupportTicketList } from './SupportTicketList';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  addSupportTicketInternalNote,
  changeSupportTicketPriority,
  changeSupportTicketStatus,
  fetchSupportTicketAttachments,
  fetchSupportTicketConversation,
  formatAttachmentSize,
  getSupportAttachmentSignedUrls,
  isImageAttachment,
  markSupportTicketReadAsAgent,
  replyToSupportTicketAsAgent,
  resolveSupportTicketContextLabels,
  SUPPORT_PRIORITY_ORDER,
  SUPPORT_STATUS_LABEL,
  SUPPORT_STATUS_ORDER,
  type SupportTicketActivityRow,
  type SupportTicketAttachmentRow,
  type SupportTicketCommentRow,
  type SupportTicketContextLabels,
  type SupportTicketPriority,
  type SupportTicketStatus,
} from '@/lib/supportTickets';

/** Shared empty array: a fresh [] per render would defeat the memoization above. */
const EMPTY_ATTACHMENTS: SupportTicketAttachmentRow[] = [];

function AttachmentStrip({ attachments }: { attachments: SupportTicketAttachmentRow[] }) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  // Latest rows, readable inside the effect without making the (freshly
  // allocated) array a dependency.
  const attachmentsRef = useRef(attachments);
  attachmentsRef.current = attachments;
  const [lightbox, setLightbox] = useState<{ url: string; name: string } | null>(null);

  // One batched Storage request for every attachment, then a single state update
  // -- previously this awaited one signed URL per file in sequence and re-rendered
  // after each. (Storage HTTP requests; unrelated to Postgres connections.)
  // Depend on a stable STRING of the paths, never on the array itself. Callers
  // build this list with attachments.filter(...), which yields a new array on
  // every render -- keying the effect on that identity re-ran it after each
  // setUrls, which re-rendered, which re-ran it: an endless signed-URL loop.
  const pathKey = attachments.map((a) => a.storage_path).join('|');

  useEffect(() => {
    let active = true;
    if (!pathKey) {
      setUrls({});
      return;
    }
    void (async () => {
      const paths = pathKey.split('|');
      const byPath = await getSupportAttachmentSignedUrls(paths);
      if (!active) return;
      const byId: Record<string, string> = {};
      for (const a of attachmentsRef.current) {
        const url = byPath[a.storage_path];
        if (url) byId[a.id] = url;
      }
      setUrls(byId);
    })();
    return () => {
      active = false;
    };
    // attachmentsRef is read inside, deliberately not a dependency.
     
  }, [pathKey]);

  if (!attachments.length) return null;

  return (
    <>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {attachments.map((a) => {
          const url = urls[a.id];
          const fileName = a.storage_path.split('/').pop() ?? 'attachment';
          if (isImageAttachment(a.mime_type) && url) {
            return (
              <button
                key={a.id}
                type="button"
                className="rounded-md border border-border p-0 overflow-hidden"
                onClick={() => setLightbox({ url, name: fileName })}
                aria-label={`Preview ${fileName}`}
              >
                <img
                  src={url}
                  alt={fileName}
                  className="size-16 object-cover block"
                />
              </button>
            );
          }
          return (
            <a
              key={a.id}
              href={url ?? undefined}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-[10px] text-foreground hover:bg-accent"
            >
              <FileText className="size-3 text-muted-foreground" />
              <span className="max-w-[140px] truncate">{fileName}</span>
              <span className="text-muted-foreground">{formatAttachmentSize(a.size_bytes)}</span>
            </a>
          );
        })}
      </div>
      {lightbox ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
          role="dialog"
          aria-modal="true"
          aria-label={lightbox.name}
          onClick={() => setLightbox(null)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setLightbox(null);
          }}
        >
          <button
            type="button"
            className="absolute right-5 top-5 rounded-full bg-black/55 px-3 py-1.5 text-sm font-semibold text-white"
            onClick={() => setLightbox(null)}
          >
            Close
          </button>
          <img
            src={lightbox.url}
            alt={lightbox.name}
            className="max-h-[85vh] max-w-[90vw] rounded-md object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}
    </>
  );
}

const PRIORITY_BADGE: Record<SupportTicketPriority, 'secondary' | 'info' | 'warning' | 'destructive'> = {
  low: 'secondary',
  medium: 'info',
  high: 'warning',
  critical: 'destructive',
};



function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function activityLabel(a: SupportTicketActivityRow): string {
  switch (a.action) {
    case 'created':
      return 'Ticket created';
    case 'user_replied':
      return 'User replied';
    case 'agent_replied':
      return 'Support replied';
    case 'internal_note_added':
      return 'Internal note added';
    case 'status_changed':
      return `Status changed${a.detail ? `: ${a.detail}` : ''}`;
    case 'priority_changed':
      return `Priority changed to ${a.detail ?? ''}`;
    default:
      return a.action;
  }
}

export function SupportPanel() {
  const {
    tickets,
    loading,
    search,
    setSearch,
    statusFilter,
    setStatusFilter,
    unassignedOnly,
    setUnassignedOnly,
    page,
    setPage,
    total,
    totalPages,
    statusCounts,
    needsAttentionCount,
    reload: load,
    patchTicket,
  } = useSupportQueue();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Ticket id we have already sent a mark-read for, so realtime-driven re-renders
  // do not re-send it.
  const markedReadRef = useRef<string | null>(null);

  const [comments, setComments] = useState<SupportTicketCommentRow[]>([]);
  const [activity, setActivity] = useState<SupportTicketActivityRow[]>([]);
  const [attachments, setAttachments] = useState<SupportTicketAttachmentRow[]>([]);
  const [conversationLoading, setConversationLoading] = useState(false);
  const [contextLabels, setContextLabels] = useState<SupportTicketContextLabels | null>(null);

  const [composerMode, setComposerMode] = useState<'reply' | 'internal'>('reply');
  const [composerBody, setComposerBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Conversation only. Attachments are loaded by their own effect below: this
  // runs on every comment/activity realtime event, and re-setting `attachments`
  // each time replaced the array identity and re-triggered signed-URL fetches
  // even when the attachment set had not changed.
  const loadConversation = useCallback(async (ticketId: string) => {
    setConversationLoading(true);
    const { comments: c, activity: a } = await fetchSupportTicketConversation(ticketId);
    setComments(c);
    setActivity(a);
    setConversationLoading(false);
  }, []);

  // Attachments change only when a comment carrying one is added, which is rare
  // compared to activity rows -- so this keys off the ticket, not the conversation.
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    void fetchSupportTicketAttachments(selectedId).then((atts) => {
      if (!cancelled) setAttachments(atts);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedId, comments.length]);

  useEffect(() => {
    if (!selectedId) {
      setComments([]);
      setActivity([]);
      setAttachments([]);
      return;
    }
    void loadConversation(selectedId);

    // Mark-read writes to support_tickets, which emits a realtime UPDATE, which
    // re-renders this component. Without this guard the effect re-ran and marked
    // read again, looping through the database indefinitely. Once per ticket.
    if (markedReadRef.current !== selectedId) {
      markedReadRef.current = selectedId;
      void (async () => {
        const { error: markErr } = await markSupportTicketReadAsAgent(selectedId);
        if (markErr) {
          markedReadRef.current = null;
          return;
        }
        // Optimistic: clears the unread marker on the row without a refetch.
        patchTicket(selectedId, { agent_last_read_at: new Date().toISOString() });
      })();
    }
  }, [selectedId, loadConversation, patchTicket]);

  useEffect(() => {
    const t = tickets.find((row) => row.id === selectedId) ?? null;
    if (!t) {
      setContextLabels(null);
      return;
    }
    let cancelled = false;
    void resolveSupportTicketContextLabels(t).then((labels) => {
      if (!cancelled) setContextLabels(labels);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // Live updates to the open ticket's conversation (a user replying while an
  // agent has it open should show up without a manual refresh).
  useEffect(() => {
    if (!selectedId) return;
    const channel = supabase
      .channel(`support-ticket-${selectedId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'support_ticket_comments', filter: `ticket_id=eq.${selectedId}` },
        () => void loadConversation(selectedId),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'support_ticket_activity', filter: `ticket_id=eq.${selectedId}` },
        () => void loadConversation(selectedId),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [selectedId, loadConversation]);

  // Filtering, searching and counting all happen in admin_list_support_tickets --
  // `tickets` is already the matching page, so there is nothing left to filter here.
  const filtered = tickets;

  const selected = tickets.find((t) => t.id === selectedId) ?? null;

  // Group once per attachments change. Filtering inline in JSX allocated a new
  // array on every render for every comment, which is what drove the signed-URL
  // effect to re-fire continuously.
  const ticketAttachments = useMemo(
    () => attachments.filter((a) => a.comment_id === null),
    [attachments],
  );
  const attachmentsByComment = useMemo(() => {
    const map = new Map<string, SupportTicketAttachmentRow[]>();
    for (const a of attachments) {
      if (!a.comment_id) continue;
      const list = map.get(a.comment_id);
      if (list) list.push(a);
      else map.set(a.comment_id, [a]);
    }
    return map;
  }, [attachments]);


  // `total` is the count for the CURRENT filter, so it cannot serve as the "All"
  // tab -- with a status tab active it would report that status's count. The
  // per-status counts come back describing the whole queue (narrowed only by
  // search/unassigned, which the tabs do not override), so "All" is their sum.
  const tabCounts = useMemo(() => {
    const counts: Partial<Record<StatusFilter, number>> = {};
    let all = 0;
    for (const st of SUPPORT_STATUS_ORDER) {
      const n = statusCounts[st] ?? 0;
      counts[st] = n;
      all += n;
    }
    counts.all = all;
    return counts;
  }, [statusCounts]);

  const handleSend = async () => {
    if (!selected || !composerBody.trim()) return;
    setSending(true);
    setError(null);
    const result =
      composerMode === 'reply'
        ? await replyToSupportTicketAsAgent(selected.id, composerBody.trim())
        : await addSupportTicketInternalNote(selected.id, composerBody.trim());
    setSending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setComposerBody('');
    await loadConversation(selected.id);
    await load();
  };

  const handleStatusChange = async (status: SupportTicketStatus) => {
    if (!selected) return;
    setError(null);
    const result = await changeSupportTicketStatus(selected.id, status);
    if (result.error) setError(result.error);
    await loadConversation(selected.id);
    await load();
  };

  const handlePriorityChange = async (priority: SupportTicketPriority) => {
    if (!selected) return;
    setError(null);
    const result = await changeSupportTicketPriority(selected.id, priority);
    if (result.error) setError(result.error);
    await loadConversation(selected.id);
    await load();
  };

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* ── Left: ticket queue ─────────────────────────────────────────────── */}
      <aside className="flex w-80 shrink-0 flex-col overflow-hidden border-r border-border">
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
          <Ticket className="size-3.5 text-muted-foreground" />
          <span className="text-[12px] font-semibold">Support</span>
          <Badge variant="secondary" appearance="light" size="xs">
            {total}
          </Badge>
          {needsAttentionCount > 0 ? (
            <Badge variant="warning" appearance="light" size="xs">
              {needsAttentionCount} update{needsAttentionCount === 1 ? '' : 's'}
            </Badge>
          ) : null}
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
              placeholder="SUP-000123, subject, reporter, org"
              className="w-full rounded-md border border-border bg-background py-1.5 pl-7 pr-2 text-[12px] outline-none focus:border-primary"
            />
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            <button
              onClick={() => setStatusFilter('all')}
              className={`rounded px-2 py-0.5 text-[10px] font-medium ${
                statusFilter === 'all'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/70'
              }`}
            >
              All · {tabCounts.all ?? 0}
            </button>
            {SUPPORT_STATUS_ORDER.map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`rounded px-2 py-0.5 text-[10px] font-medium ${
                  statusFilter === s
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/70'
                }`}
              >
                {SUPPORT_STATUS_LABEL[s]} · {tabCounts[s] ?? 0}
              </button>
            ))}
          </div>
          <label className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <input
              type="checkbox"
              checked={unassignedOnly}
              onChange={(e) => setUnassignedOnly(e.target.checked)}
              className="size-3"
            />
            Unassigned only
          </label>
        </div>

        <SupportTicketList
          tickets={filtered}
          loading={loading}
          selectedId={selectedId}
          onSelect={setSelectedId}
          isFiltered={statusFilter !== 'all'}
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
        />
      </aside>

      {/* ── Right: ticket workspace ─────────────────────────────────────────── */}
      <section className="flex flex-1 flex-col overflow-hidden">
        {!selected ? (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-[12px] text-muted-foreground">Select a ticket to review it.</p>
          </div>
        ) : (
          <>
            <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border bg-muted/30 px-4 py-2">
              <span className="font-mono text-[11px] text-muted-foreground">{selected.display_id}</span>
              <span className="text-[12px] font-semibold">{selected.subject}</span>
              <span className="text-[11px] text-muted-foreground">
                {selected.reporter_display_name ?? 'Unknown reporter'}
                {selected.organization_name ? ` · ${selected.organization_name}` : ''}
              </span>
              <div className="ml-auto flex items-center gap-3">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Priority
                  </span>
                  <Select value={selected.priority} onValueChange={(v) => void handlePriorityChange(v as SupportTicketPriority)}>
                    <SelectTrigger size="sm" className="h-7 w-[130px] text-[11px] font-semibold">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SUPPORT_PRIORITY_ORDER.map((p) => (
                        <SelectItem key={p} value={p}>
                          {p.charAt(0).toUpperCase() + p.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Status
                  </span>
                  <Select value={selected.status} onValueChange={(v) => void handleStatusChange(v as SupportTicketStatus)}>
                    <SelectTrigger size="sm" className="h-7 w-[160px] text-[11px] font-semibold">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SUPPORT_STATUS_ORDER.map((s) => (
                        <SelectItem key={s} value={s}>
                          {SUPPORT_STATUS_LABEL[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {error ? (
              <div className="shrink-0 border-b border-border bg-destructive/10 px-4 py-2 text-[11px] text-destructive">
                {error}
              </div>
            ) : null}

            <div className="flex-1 overflow-y-auto p-4">
              <div className="mb-4 rounded-lg border border-border bg-muted/20 p-3">
                <div className="mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <span>{selected.category}</span>
                  <span>·</span>
                  <span>Reported {formatDate(selected.created_at)}</span>
                </div>
                <p className="text-[12px] leading-relaxed text-foreground">{selected.description}</p>
                <AttachmentStrip attachments={ticketAttachments} />
                {selected.trip_id || selected.indent_id || selected.owner_vehicle_id || selected.market_bid_id ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {selected.trip_id ? (
                      <Badge variant="secondary" appearance="light" size="xs" title={selected.trip_id}>
                        Trip · {contextLabels?.trip ?? selected.trip_id.slice(0, 8)}
                      </Badge>
                    ) : null}
                    {selected.indent_id ? (
                      <Badge variant="secondary" appearance="light" size="xs" title={selected.indent_id}>
                        Indent · {contextLabels?.indent ?? selected.indent_id.slice(0, 8)}
                      </Badge>
                    ) : null}
                    {selected.owner_vehicle_id ? (
                      <Badge variant="secondary" appearance="light" size="xs" title={selected.owner_vehicle_id}>
                        Vehicle · {contextLabels?.vehicle ?? selected.owner_vehicle_id.slice(0, 8)}
                      </Badge>
                    ) : null}
                    {selected.market_bid_id ? (
                      <Badge variant="secondary" appearance="light" size="xs" title={selected.market_bid_id}>
                        Market bid · {contextLabels?.marketBid ?? selected.market_bid_id.slice(0, 8)}
                      </Badge>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {conversationLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="space-y-2">
                  {comments.map((c) => (
                    <div
                      key={c.id}
                      className={`max-w-[85%] rounded-lg border p-2.5 ${
                        c.visibility === 'internal'
                          ? 'ml-0 border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30'
                          : c.author_type === 'agent'
                            ? 'ml-auto border-primary/30 bg-primary/5'
                            : 'mr-auto border-border bg-card'
                      }`}
                    >
                      <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground">
                        {c.visibility === 'internal' ? (
                          <>
                            <Lock className="size-3" /> Internal note
                          </>
                        ) : c.author_type === 'agent' ? (
                          <>
                            <MessageSquare className="size-3" /> Support
                          </>
                        ) : (
                          'User'
                        )}
                        <span className="ml-auto font-normal">{formatDate(c.created_at)}</span>
                      </div>
                      <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-foreground">{c.body}</p>
                      <AttachmentStrip attachments={attachmentsByComment.get(c.id) ?? EMPTY_ATTACHMENTS} />
                    </div>
                  ))}

                  {activity.length > 0 ? (
                    <div className="mt-4 border-t border-border pt-3">
                      <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        <Clock3 className="size-3" /> Activity
                      </div>
                      <div className="space-y-1">
                        {activity.map((a) => (
                          <div key={a.id} className="flex items-center gap-2 text-[10px] text-muted-foreground">
                            <span>{activityLabel(a)}</span>
                            <span className="ml-auto">{formatDate(a.created_at)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            <div className="shrink-0 border-t border-border bg-muted/20 p-3">
              <div className="mb-2 flex gap-1">
                <button
                  onClick={() => setComposerMode('reply')}
                  className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium ${
                    composerMode === 'reply'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted/70'
                  }`}
                >
                  <MessageSquare className="size-3" /> Reply to user
                </button>
                <button
                  onClick={() => setComposerMode('internal')}
                  className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium ${
                    composerMode === 'internal'
                      ? 'bg-amber-500 text-white'
                      : 'bg-muted text-muted-foreground hover:bg-muted/70'
                  }`}
                >
                  <StickyNote className="size-3" /> Internal note
                </button>
              </div>
              <textarea
                value={composerBody}
                onChange={(e) => setComposerBody(e.target.value)}
                placeholder={
                  composerMode === 'reply'
                    ? 'Reply to the user — they will see this…'
                    : 'Internal note — visible to Support staff only…'
                }
                rows={3}
                className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30"
              />
              <div className="mt-2 flex justify-end">
                <Button
                  size="sm"
                  variant={composerMode === 'internal' ? 'outline' : 'primary'}
                  onClick={() => void handleSend()}
                  disabled={sending || !composerBody.trim()}
                >
                  {sending ? (
                    <>
                      <Loader2 className="size-3 animate-spin" /> Sending…
                    </>
                  ) : composerMode === 'reply' ? (
                    'Send reply'
                  ) : (
                    'Add internal note'
                  )}
                </Button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
