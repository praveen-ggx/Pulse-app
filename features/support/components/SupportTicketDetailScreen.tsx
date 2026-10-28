/**
 * Support ticket detail + reply — same chrome as Contact Support.
 */
import { CenteredLoadingView } from '@/components/CenteredLoadingView';
import { DetailPageLayout } from '@/components/DetailPageLayout';
import Theme from '@/constants/Theme';
import { useAuth } from '@/contexts/AuthContext';
import { useDocumentPreview } from '@/features/chat/components/DocumentPreviewModal';
import {
  formatAttachmentSize,
  getSupportAttachmentSignedUrl,
  isImageAttachment,
  isSupportTicketClosed,
  markSupportTicketReadByUser,
  replyToSupportTicket,
  supportTicketStatusLabel,
  type SupportTicketAttachmentRow,
  type SupportTicketPriority,
  type SupportTicketStatus,
} from '@/features/support/services/supportTickets.service';
import { showAppAlert } from '@/lib/appAlert';
import { useSafeBack } from '@/lib/useSafeBack';
import { useSupportTicketDetailQuery } from '@/lib/queries/useSupportTicketDetailQuery';
import { queryKeys } from '@/lib/queryKeys';
import { ROUTES } from '@/lib/routes';
import { FileText, Send } from 'lucide-react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

const WEB_COPY = Platform.select({
  web: { whiteSpace: 'pre-wrap' as const },
  default: {},
});

function fileNameFromPath(storagePath: string): string {
  return storagePath.split('/').pop() ?? 'Attachment';
}

function displayFileName(storagePath: string): string {
  const raw = fileNameFromPath(storagePath);
  const stripped = raw.replace(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i,
    '',
  );
  return stripped || raw;
}

function useAttachmentUrls(attachments: SupportTicketAttachmentRow[]) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const attachmentKey = useMemo(
    () => attachments.map((a) => a.id).join(','),
    [attachments],
  );

  useEffect(() => {
    let active = true;
    (async () => {
      for (const a of attachments) {
        const url = await getSupportAttachmentSignedUrl(a.storage_path);
        if (active && url) setUrls((prev) => ({ ...prev, [a.id]: url }));
      }
    })();
    return () => {
      active = false;
    };
  }, [attachmentKey, attachments]);

  return urls;
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

function priorityLabel(priority: SupportTicketPriority): string {
  return priority.charAt(0).toUpperCase() + priority.slice(1);
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function AttachmentRows({
  attachments,
  onPreview,
}: {
  attachments: SupportTicketAttachmentRow[];
  onPreview: (url: string, mime: string | null, fileName: string) => void;
}) {
  const urls = useAttachmentUrls(attachments);
  if (!attachments.length) return null;
  return (
    <View style={styles.attachmentList}>
      {attachments.map((a) => {
        const fileName = fileNameFromPath(a.storage_path);
        const label = displayFileName(a.storage_path);
        const url = urls[a.id];
        const mimeShort = a.mime_type?.split('/')[1]?.toUpperCase() ?? 'FILE';
        const isImage = isImageAttachment(a.mime_type);
        return (
          <Pressable
            key={a.id}
            onPress={() => url && onPreview(url, a.mime_type, fileName)}
            disabled={!url}
            style={({ pressed }) => [styles.attachmentRow, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={`Preview ${label}`}
          >
            <View style={styles.attachmentThumb}>
              {isImage && url ? (
                <Image
                  source={{ uri: url }}
                  style={styles.attachmentImage}
                  resizeMode="cover"
                  accessibilityIgnoresInvertColors
                />
              ) : (
                <FileText size={14} color={Theme.actionBtnInk} />
              )}
            </View>
            <View style={styles.attachmentInfo}>
              <Text style={styles.attachmentName} numberOfLines={1}>
                {label}
              </Text>
              <Text style={styles.attachmentMeta}>
                {[mimeShort, formatAttachmentSize(a.size_bytes)].filter(Boolean).join(' · ')}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

export function SupportTicketDetailScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const ticketId = typeof id === 'string' ? id : '';
  const { ticket, comments, attachments, isLoading, error, invalidate } =
    useSupportTicketDetailQuery(ticketId);
  const { open: openPreview, node: previewNode } = useDocumentPreview();
  const markedReadRef = useRef<string | null>(null);

  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);

  const openingAttachments = useMemo(
    () => attachments.filter((a) => a.comment_id === null),
    [attachments],
  );
  const closed = ticket ? isSupportTicketClosed(ticket.status) : true;

  useEffect(() => {
    if (!ticketId || !ticket || markedReadRef.current === ticketId) return;
    markedReadRef.current = ticketId;
    void (async () => {
      const result = await markSupportTicketReadByUser(ticketId);
      if ('error' in result) return;
      if (user?.uid) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.support.myTickets(user.uid) });
      }
      invalidate();
    })();
  }, [ticketId, ticket, user?.uid, queryClient, invalidate]);

  const handlePreview = (url: string, mime: string | null, fileName: string) => {
    void openPreview(url, mime, fileName);
  };

  const handleBack = useSafeBack(ROUTES.SUPPORT_TICKETS);

  const handleSend = async () => {
    const body = reply.trim();
    if (!body || !ticketId || sending || closed) return;
    setSending(true);
    try {
      const result = await replyToSupportTicket(ticketId, body);
      if ('error' in result) {
        showAppAlert('Could not send reply', result.error.message);
        return;
      }
      setReply('');
      invalidate();
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <DetailPageLayout
        title={ticket?.display_id ?? 'Ticket'}
        onBack={handleBack}
        rightAction={
          <Pressable
            onPress={() => router.push(ROUTES.SUPPORT_TICKETS as Href)}
            hitSlop={8}
            style={styles.headerBtn}
            accessibilityRole="button"
            accessibilityLabel="My tickets"
          >
            <Text style={styles.headerBtnText}>My tickets</Text>
          </Pressable>
        }
      >
        {isLoading ? (
          <CenteredLoadingView />
        ) : error || !ticket ? (
          <Text style={styles.errorText}>
            {error instanceof Error ? error.message : 'Ticket not found.'}
          </Text>
        ) : (
          <View style={styles.page}>
            <View style={styles.card}>
              <View style={styles.cardHead}>
                <View style={styles.headCopy}>
                  <Text style={styles.cardKicker}>{ticket.subject}</Text>
                  <Text style={styles.cardHint}>
                    {ticket.category} · {priorityLabel(ticket.priority)} priority ·{' '}
                    {formatTimestamp(ticket.created_at)}
                  </Text>
                </View>
                <View
                  style={[
                    styles.statusPill,
                    { backgroundColor: `${statusColor(ticket.status)}1A` },
                  ]}
                >
                  <Text style={[styles.statusPillText, { color: statusColor(ticket.status) }]}>
                    {supportTicketStatusLabel(ticket.status)}
                  </Text>
                </View>
              </View>
              <Text style={styles.body}>{ticket.description}</Text>
              {openingAttachments.length > 0 ? (
                <>
                  <Text style={styles.fieldLabel}>Attachments</Text>
                  <AttachmentRows
                    attachments={openingAttachments}
                    onPreview={handlePreview}
                  />
                </>
              ) : null}
            </View>

            {comments.length > 0 ? (
              <View style={styles.threadSection}>
                <Text style={styles.sectionLabel}>Discussion</Text>
                {comments.map((c) => {
                  const commentAttachments = attachments.filter((a) => a.comment_id === c.id);
                  const isOwn =
                    c.author_type === 'user' ||
                    (c.author_type !== 'agent' && c.author_user_id === user?.uid);
                  return (
                    <View key={c.id} style={styles.card}>
                      <View style={styles.threadHead}>
                        <Text style={styles.threadAuthor}>{isOwn ? 'You' : 'Support'}</Text>
                        <Text style={styles.threadTime}>{formatTimestamp(c.created_at)}</Text>
                      </View>
                      <Text style={styles.body}>{c.body}</Text>
                      {commentAttachments.length > 0 ? (
                        <AttachmentRows
                          attachments={commentAttachments}
                          onPreview={handlePreview}
                        />
                      ) : null}
                    </View>
                  );
                })}
              </View>
            ) : null}

            {closed ? (
              <Text style={styles.closedHint}>This ticket is closed.</Text>
            ) : (
              <View style={styles.card}>
                <Text style={styles.fieldLabel}>Reply</Text>
                <TextInput
                  style={[styles.input, styles.replyInput]}
                  value={reply}
                  onChangeText={setReply}
                  placeholder="Add a reply..."
                  placeholderTextColor={Theme.placeholder}
                  multiline
                  textAlignVertical="top"
                />
                <TouchableOpacity
                  style={[styles.submitBtn, (!reply.trim() || sending) && styles.submitBtnDisabled]}
                  onPress={() => void handleSend()}
                  disabled={!reply.trim() || sending}
                  activeOpacity={0.88}
                  accessibilityRole="button"
                  accessibilityLabel="Send reply"
                >
                  {sending ? (
                    <ActivityIndicator color={Theme.buttonDarkText} size="small" />
                  ) : (
                    <View style={styles.submitInner}>
                      <Send size={13} color={Theme.buttonDarkText} />
                      <Text style={styles.submitBtnText}>Send reply</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      </DetailPageLayout>
      {previewNode}
    </>
  );
}

const styles = StyleSheet.create({
  page: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    gap: 16,
  },
  card: {
    borderWidth: 1,
    borderColor: Theme.actionBtnGhostBorder,
    borderRadius: 12,
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
    gap: 8,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  headCopy: { flex: 1, minWidth: 0, gap: 4 },
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
  body: {
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 19,
    color: Theme.textPrimaryDark,
    letterSpacing: 0,
    ...WEB_COPY,
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0,
    color: Theme.textMuted,
    marginTop: 4,
    ...WEB_COPY,
  },
  statusPill: {
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    flexShrink: 0,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0,
    ...WEB_COPY,
  },
  attachmentList: { gap: 6 },
  attachmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Theme.actionBtnGhostBorder,
    borderRadius: 8,
    backgroundColor: Theme.surface,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
  },
  attachmentThumb: {
    width: 36,
    height: 36,
    borderRadius: 6,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.actionBtnGhostBorder,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  attachmentImage: { width: '100%', height: '100%' },
  attachmentInfo: { flex: 1, minWidth: 0, gap: 1 },
  attachmentName: {
    fontSize: 12,
    fontWeight: '500',
    color: Theme.textPrimaryDark,
    letterSpacing: 0,
    ...WEB_COPY,
  },
  attachmentMeta: {
    fontSize: 10,
    color: Theme.textMuted,
    letterSpacing: 0,
    ...WEB_COPY,
  },
  threadSection: { gap: 8 },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0,
    color: Theme.textMuted,
    ...WEB_COPY,
  },
  threadHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  threadAuthor: {
    fontSize: 11,
    fontWeight: '600',
    color: Theme.actionBtnInk,
    letterSpacing: 0,
    ...WEB_COPY,
  },
  threadTime: {
    fontSize: 10,
    color: Theme.textMuted,
    letterSpacing: 0,
    ...WEB_COPY,
  },
  input: {
    backgroundColor: Theme.surface,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    fontWeight: '400',
    color: Theme.textPrimaryDark,
    minHeight: 40,
    borderWidth: 1,
    borderColor: Theme.actionBtnGhostBorder,
    borderRadius: 8,
  },
  replyInput: {
    minHeight: 96,
    paddingTop: 10,
  },
  submitBtn: {
    backgroundColor: Theme.actionBtnInk,
    minHeight: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  submitBtnDisabled: { opacity: 0.65 },
  submitInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  submitBtnText: {
    fontSize: 12,
    fontWeight: '500',
    color: Theme.buttonDarkText,
    letterSpacing: 0,
    ...WEB_COPY,
  },
  closedHint: {
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
  headerBtn: {
    minHeight: 32,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.actionBtnGhostBorder,
    backgroundColor: Theme.cardWhite,
    justifyContent: 'center',
  },
  headerBtnText: {
    fontSize: 12,
    fontWeight: '500',
    color: Theme.actionBtnInk,
    letterSpacing: 0,
    ...WEB_COPY,
  },
  errorText: {
    color: Theme.negative,
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 0,
    ...WEB_COPY,
  },
  pressed: { opacity: 0.88 },
});
