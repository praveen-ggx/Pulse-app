/**
 * Support S1 — Contact Support entry point + Create Ticket form.
 * Replaces the old external-link "Contact Support" card (NetworkSupportHelpCards)
 * with an in-app destination. Optional trip/indent/vehicle/market-bid context is
 * only ever read from route params set by whoever navigated here — this screen
 * never invents context that wasn't already available to the caller.
 */
import { DetailPageLayout } from '@/components/DetailPageLayout';
import Theme from '@/constants/Theme';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import {
  formatAttachmentSize,
  SUPPORT_ATTACHMENT_MAX_PER_UPLOAD,
  SUPPORT_TICKET_CATEGORIES,
  submitSupportTicket,
  supportTicketStatusLabel,
  uploadSupportTicketAttachment,
  validateSupportAttachment,
  type StagedSupportAttachment,
  type SupportTicketCategory,
  type SupportTicketListItem,
  type SupportTicketStatus,
} from '@/features/support/services/supportTickets.service';
import {
  countSupportTicketsWithUserUpdate,
  formatSupportUnreadBadge,
  supportTicketHasUserUpdate,
} from '@/features/support/utils/supportTicketUnread.util';
import {
  filesFromClipboardData,
  pickSupportTicketAttachments,
  resolveSupportAttachmentMime,
  supportAttachmentsFromFiles,
  type PickedSupportAttachment,
} from '@/features/support/utils/supportAttachmentPick.util';
import { showAppAlert } from '@/lib/appAlert';
import { useSafeBack } from '@/lib/useSafeBack';
import { useMySupportTicketsQuery } from '@/lib/queries/useMySupportTicketsQuery';
import { ROUTES } from '@/lib/routes';
import { uuidv7 } from '@/lib/uuidv7';
import { Paperclip, X } from 'lucide-react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

const MAX_ATTACHMENTS = SUPPORT_ATTACHMENT_MAX_PER_UPLOAD;
const RECENT_TICKETS_LIMIT = 5;
const WEB_COPY = Platform.select({
  web: { whiteSpace: 'pre-wrap' as const },
  default: {},
});

type StagedAttachment = StagedSupportAttachment & { localId: string };

function formatUpdatedAt(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMin = Math.max(0, Math.round((now - then) / 60_000));
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay === 1) return 'Yesterday';
  if (diffDay < 7) return `${diffDay} days ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function statusColor(status: SupportTicketStatus): string {
  switch (status) {
    case 'resolved':
      return Theme.success;
    case 'closed':
      return Theme.textMuted;
    case 'waiting_for_user':
      return Theme.warning;
    default:
      return Theme.primary;
  }
}

export function CreateSupportTicketScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { currentOrganization } = useOrganization();
  const params = useLocalSearchParams<{
    tripId?: string;
    indentId?: string;
    ownerVehicleId?: string;
    marketBidId?: string;
    sourceScreen?: string;
  }>();

  const [category, setCategory] = useState<SupportTicketCategory>(SUPPORT_TICKET_CATEGORIES[0]);
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [attachments, setAttachments] = useState<StagedAttachment[]>([]);
  const attachmentsRef = useRef(attachments);
  attachmentsRef.current = attachments;
  const [submitting, setSubmitting] = useState(false);
  const [picking, setPicking] = useState(false);

  const ticketsQ = useMySupportTicketsQuery(user?.uid);
  const recentTickets = useMemo(
    () => (ticketsQ.tickets as SupportTicketListItem[]).slice(0, RECENT_TICKETS_LIMIT),
    [ticketsQ.tickets],
  );
  const updateCount = useMemo(
    () => countSupportTicketsWithUserUpdate(ticketsQ.tickets),
    [ticketsQ.tickets],
  );
  const updateBadge = formatSupportUnreadBadge(updateCount);
  const backFallback =
    params.sourceScreen === 'workspace_hub'
      ? ROUTES.WORKSPACE
      : params.sourceScreen === 'my_account'
        ? ROUTES.WORKSPACE_ACCOUNT
        : params.sourceScreen === 'network_hub'
          ? ROUTES.TABS.NETWORK
          : '/';
  const handleBack = useSafeBack(backFallback);

  const ingestPicked = useCallback((picked: PickedSupportAttachment[]) => {
    if (!picked.length) return;
    const prev = attachmentsRef.current;
    const room = MAX_ATTACHMENTS - prev.length;
    if (room <= 0) {
      showAppAlert('Attachment limit reached', `You can attach up to ${MAX_ATTACHMENTS} files.`);
      return;
    }
    const toAdd = picked.slice(0, room);
    const errors: string[] = [];
    const valid: StagedAttachment[] = [];
    for (const file of toAdd) {
      const normalized = {
        ...file,
        mimeType: resolveSupportAttachmentMime(file.mimeType, file.fileName),
      };
      const err = validateSupportAttachment(normalized);
      if (err) errors.push(err);
      else valid.push({ ...normalized, localId: uuidv7() });
    }
    if (picked.length > toAdd.length) {
      errors.push(`Only ${MAX_ATTACHMENTS} attachments are allowed per ticket.`);
    }
    if (valid.length) {
      const next = [...prev, ...valid];
      attachmentsRef.current = next;
      setAttachments(next);
    }
    if (errors.length) showAppAlert("Some files weren't attached", errors.join('\n'));
  }, []);

  const handleAttach = async () => {
    if (attachments.length >= MAX_ATTACHMENTS) {
      showAppAlert('Attachment limit reached', `You can attach up to ${MAX_ATTACHMENTS} files.`);
      return;
    }
    setPicking(true);
    const picked = await pickSupportTicketAttachments().catch(() => []);
    setPicking(false);
    ingestPicked(picked);
  };

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onPaste = (event: Event) => {
      const clipboard = (event as ClipboardEvent).clipboardData;
      const files = filesFromClipboardData(clipboard).filter((file) => {
        const mime = resolveSupportAttachmentMime(file.type, file.name);
        return mime.startsWith('image/') || mime === 'application/pdf';
      });
      if (!files.length) return;
      event.preventDefault();
      void supportAttachmentsFromFiles(files).then(ingestPicked);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [ingestPicked]);

  const handleRemoveAttachment = (localId: string) => {
    setAttachments((prev) => prev.filter((a) => a.localId !== localId));
  };

  const handleSubmit = async () => {
    if (!user?.uid) {
      showAppAlert('Sign in required', 'Sign in to contact Support.');
      return;
    }
    const trimmedSubject = subject.trim();
    const trimmedDescription = description.trim();
    if (!trimmedSubject) {
      showAppAlert('Subject required', 'Enter a short subject for your issue.');
      return;
    }
    if (!trimmedDescription) {
      showAppAlert('Description required', 'Describe what went wrong.');
      return;
    }

    setSubmitting(true);
    const result = await submitSupportTicket({
      category,
      subject: trimmedSubject,
      description: trimmedDescription,
      organizationId: currentOrganization?.id ?? null,
      tripId: params.tripId ?? null,
      indentId: params.indentId ?? null,
      ownerVehicleId: params.ownerVehicleId ?? null,
      marketBidId: params.marketBidId ?? null,
      sourceScreen: params.sourceScreen ?? null,
    });

    if ('error' in result) {
      setSubmitting(false);
      showAppAlert("Couldn't submit ticket", result.error.message);
      return;
    }

    const failedNames: string[] = [];
    for (const file of attachments) {
      const uploadResult = await uploadSupportTicketAttachment(result.ticketId, user.uid, file);
      if ('error' in uploadResult) failedNames.push(file.fileName);
    }
    setSubmitting(false);

    if (failedNames.length) {
      showAppAlert(
        `${result.displayId} created — attachment${failedNames.length === 1 ? '' : 's'} missing`,
        `Your ticket was submitted, but ${failedNames.length === 1 ? 'this file did' : 'these files did'} not upload and ${failedNames.length === 1 ? "is" : "are"} NOT attached to it: ${failedNames.join(', ')}. You can mention this in a reply on the ticket.`,
      );
    }
    router.replace(ROUTES.supportTicket(result.ticketId) as Href);
  };

  return (
    <DetailPageLayout
      title="Contact Support"
      onBack={handleBack}
      rightAction={
        <Pressable
          onPress={() => router.push(ROUTES.SUPPORT_TICKETS as Href)}
          hitSlop={8}
          style={styles.myTicketsBtn}
          accessibilityRole="button"
          accessibilityLabel="My tickets"
        >
          <Text style={styles.myTicketsBtnText}>My tickets</Text>
        </Pressable>
      }
    >
      <View style={styles.page}>
      <View style={styles.formCard}>
        <View style={styles.formHead}>
          <Text style={styles.cardKicker}>New ticket</Text>
          <Text style={styles.cardHint}>
            Pick a category, add a short subject, then describe what went wrong.
          </Text>
        </View>

      <Text style={styles.fieldLabel}>Category</Text>
      <View style={styles.categoryRow}>
        {SUPPORT_TICKET_CATEGORIES.map((c) => {
          const on = c === category;
          return (
            <Pressable
              key={c}
              onPress={() => setCategory(c)}
              style={[styles.categoryChip, on && styles.categoryChipActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
            >
              <Text style={[styles.categoryChipText, on && styles.categoryChipTextActive]}>
                {c}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.fieldLabel}>Subject</Text>
      <TextInput
        style={styles.input}
        value={subject}
        onChangeText={setSubject}
        placeholder="Short summary of the issue"
        placeholderTextColor={Theme.placeholder}
        maxLength={120}
        returnKeyType="next"
      />

      <Text style={styles.fieldLabel}>Description</Text>
      <TextInput
        style={[styles.input, styles.descriptionInput]}
        value={description}
        onChangeText={setDescription}
        placeholder="What happened? Include as much detail as you can."
        placeholderTextColor={Theme.placeholder}
        multiline
        textAlignVertical="top"
        maxLength={2000}
      />

      <View
        {...(Platform.OS === 'web'
          ? {
              onDragOver: (e: { preventDefault?: () => void }) => {
                e.preventDefault?.();
              },
              onDrop: (e: { preventDefault?: () => void; nativeEvent?: { dataTransfer?: DataTransfer } }) => {
                e.preventDefault?.();
                const dropped = Array.from(e.nativeEvent?.dataTransfer?.files ?? []);
                if (dropped.length) void supportAttachmentsFromFiles(dropped).then(ingestPicked);
              },
            }
          : {})}
      >
        <TouchableOpacity
          style={styles.attachBtn}
          onPress={() => void handleAttach()}
          disabled={picking || submitting}
          activeOpacity={0.7}
        >
        {picking ? (
          <ActivityIndicator color={Theme.textMuted} size="small" />
        ) : (
          <Paperclip size={14} color={Theme.textMuted} />
        )}
        <View style={styles.attachCopy}>
          <Text style={styles.attachBtnText}>Attach files</Text>
          <Text style={styles.attachBtnSubtext}>
            Screenshots, documents or other evidence
            {Platform.OS === 'web' ? ' — paste or drop images' : ''}
          </Text>
        </View>
      </TouchableOpacity>
      </View>

      {attachments.length > 0 && (
        <View style={styles.attachmentList}>
          {attachments.map((a) => (
            <View key={a.localId} style={styles.attachmentRow}>
              <View style={styles.attachmentInfo}>
                <Text style={styles.attachmentName} numberOfLines={1}>
                  {a.fileName}
                </Text>
                <Text style={styles.attachmentMeta}>
                  {a.mimeType.split('/')[1]?.toUpperCase() ?? a.mimeType} ·{' '}
                  {formatAttachmentSize(a.sizeBytes)}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => handleRemoveAttachment(a.localId)}
                hitSlop={10}
                disabled={submitting}
              >
                <X size={14} color={Theme.textMuted} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      <TouchableOpacity
        style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
        onPress={() => void handleSubmit()}
        disabled={submitting}
        activeOpacity={0.88}
        accessibilityRole="button"
        accessibilityLabel="Submit ticket"
      >
        {submitting ? (
          <ActivityIndicator color={Theme.buttonDarkText} size="small" />
        ) : (
          <Text style={styles.submitBtnText}>Submit ticket</Text>
        )}
      </TouchableOpacity>
      </View>

      <View style={styles.recentSection}>
        <View style={styles.recentHeader}>
          <View style={styles.recentTitleRow}>
            <Text style={styles.sectionLabel}>Recent tickets</Text>
            {updateBadge ? (
              <View style={styles.updateBadge} accessibilityLabel={`${updateBadge} updates`}>
                <Text style={styles.updateBadgeText}>{updateBadge}</Text>
              </View>
            ) : null}
          </View>
          {ticketsQ.tickets.length > 0 ? (
            <Pressable
              onPress={() => router.push(ROUTES.SUPPORT_TICKETS as Href)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="See all support tickets"
            >
              <Text style={styles.seeAllText}>See all</Text>
            </Pressable>
          ) : null}
        </View>

        {ticketsQ.isLoading ? (
          <ActivityIndicator color={Theme.primary} style={{ marginTop: 8 }} />
        ) : recentTickets.length === 0 ? (
          <Text style={styles.recentEmpty}>
            No tickets yet. Submitted tickets will show up here.
          </Text>
        ) : (
          recentTickets.map((t) => {
            const hasUpdate = supportTicketHasUserUpdate(t);
            return (
              <Pressable
                key={t.id}
                onPress={() => router.push(ROUTES.supportTicket(t.id) as Href)}
                style={({ pressed }) => [
                  styles.recentCard,
                  hasUpdate && styles.recentCardUpdate,
                  pressed && styles.recentCardPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={`${t.display_id} ${t.subject}${hasUpdate ? ', update available' : ''}`}
              >
                <View style={styles.recentCardTop}>
                  <View style={styles.recentIdRow}>
                    {hasUpdate ? <View style={styles.updateDot} /> : null}
                    <Text style={styles.recentDisplayId}>{t.display_id}</Text>
                  </View>
                  <View
                    style={[
                      styles.recentStatusPill,
                      { backgroundColor: `${statusColor(t.status)}1A` },
                    ]}
                  >
                    <Text style={[styles.recentStatusText, { color: statusColor(t.status) }]}>
                      {supportTicketStatusLabel(t.status)}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.recentSubject, hasUpdate && styles.recentSubjectUpdate]} numberOfLines={1}>
                  {t.subject}
                </Text>
                <Text style={styles.recentMeta}>Updated {formatUpdatedAt(t.updated_at)}</Text>
              </Pressable>
            );
          })
        )}
      </View>
      </View>
    </DetailPageLayout>
  );
}

const styles = StyleSheet.create({
  page: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    gap: 16,
  },
  formCard: {
    borderWidth: 1,
    borderColor: Theme.actionBtnGhostBorder,
    borderRadius: 12,
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
  },
  formHead: {
    marginBottom: 12,
    gap: 4,
  },
  cardKicker: {
    fontSize: 13,
    fontWeight: '600',
    color: Theme.actionBtnInk,
    letterSpacing: 0,
    ...WEB_COPY,
  },
  cardHint: {
    fontSize: 11,
    fontWeight: '400',
    lineHeight: 16,
    color: Theme.textMuted,
    letterSpacing: 0,
    ...WEB_COPY,
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0,
    color: Theme.textMuted,
    marginBottom: 6,
    ...WEB_COPY,
  },
  categoryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  categoryChip: {
    minHeight: 28,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Theme.actionBtnGhostBorder,
    backgroundColor: Theme.cardWhite,
    justifyContent: 'center',
  },
  categoryChipActive: {
    backgroundColor: Theme.actionBtnInk,
    borderColor: Theme.actionBtnInk,
  },
  categoryChipText: {
    fontSize: 11,
    fontWeight: '500',
    color: Theme.textPrimaryDark,
    letterSpacing: 0,
    ...WEB_COPY,
  },
  categoryChipTextActive: {
    color: Theme.buttonDarkText,
  },
  input: {
    backgroundColor: Theme.surface,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    fontWeight: '400',
    color: Theme.textPrimaryDark,
    marginBottom: 12,
    minHeight: 40,
    borderWidth: 1,
    borderColor: Theme.actionBtnGhostBorder,
    borderRadius: 8,
  },
  descriptionInput: {
    minHeight: 96,
    paddingTop: 10,
  },
  attachBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Theme.actionBtnGhostBorder,
    borderRadius: 8,
    backgroundColor: Theme.surface,
  },
  attachCopy: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  attachBtnText: {
    fontSize: 12,
    fontWeight: '500',
    color: Theme.actionBtnInk,
    letterSpacing: 0,
    ...WEB_COPY,
  },
  attachBtnSubtext: {
    fontSize: 10,
    fontWeight: '400',
    color: Theme.textMuted,
    letterSpacing: 0,
    ...WEB_COPY,
  },
  attachmentList: {
    gap: 6,
    marginBottom: 12,
  },
  attachmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: Theme.actionBtnGhostBorder,
    borderRadius: 8,
    backgroundColor: Theme.surface,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
  },
  attachmentInfo: {
    flex: 1,
    gap: 1,
  },
  attachmentName: {
    fontSize: 12,
    fontWeight: '500',
    color: Theme.textPrimaryDark,
  },
  attachmentMeta: {
    fontSize: 10,
    color: Theme.textMuted,
  },
  submitBtn: {
    backgroundColor: Theme.actionBtnInk,
    minHeight: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  submitBtnDisabled: {
    opacity: 0.65,
  },
  submitBtnText: {
    fontSize: 12,
    fontWeight: '500',
    color: Theme.buttonDarkText,
    letterSpacing: 0,
    ...WEB_COPY,
  },
  recentSection: {
    gap: 8,
  },
  recentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  recentTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0,
    color: Theme.textMuted,
    ...WEB_COPY,
  },
  updateBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Theme.destructive,
  },
  updateBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: Theme.buttonDestructiveText,
  },
  seeAllText: {
    fontSize: 11,
    fontWeight: '500',
    color: Theme.actionBtnInk,
    letterSpacing: 0,
    ...WEB_COPY,
  },
  recentEmpty: {
    fontSize: 12,
    lineHeight: 17,
    color: Theme.textMuted,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: Theme.actionBtnGhostBorder,
    borderRadius: 8,
    backgroundColor: Theme.surface,
    letterSpacing: 0,
    ...WEB_COPY,
  },
  recentCard: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.actionBtnGhostBorder,
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 3,
  },
  recentCardUpdate: {
    borderColor: Theme.warning,
    backgroundColor: Theme.warningMuted,
  },
  recentCardPressed: { opacity: 0.92 },
  recentCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  recentIdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
    flex: 1,
  },
  updateDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Theme.destructive,
  },
  recentDisplayId: {
    fontSize: 11,
    fontWeight: '500',
    color: Theme.textMuted,
    letterSpacing: 0,
  },
  recentStatusPill: {
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  recentStatusText: {
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0,
    ...WEB_COPY,
  },
  recentSubject: {
    fontSize: 13,
    fontWeight: '500',
    color: Theme.textPrimaryDark,
    letterSpacing: 0,
    ...WEB_COPY,
  },
  recentSubjectUpdate: {
    fontWeight: '600',
  },
  recentMeta: {
    fontSize: 10,
    color: Theme.textMuted,
    letterSpacing: 0,
    ...WEB_COPY,
  },
  myTicketsBtn: {
    minHeight: 32,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.actionBtnGhostBorder,
    backgroundColor: Theme.cardWhite,
    justifyContent: 'center',
  },
  myTicketsBtnText: {
    fontSize: 12,
    fontWeight: '500',
    color: Theme.actionBtnInk,
    letterSpacing: 0,
    ...WEB_COPY,
  },
});
