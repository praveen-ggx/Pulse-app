/**
 * Support S1 — My Support Tickets: this user's own tickets, most recently
 * updated first (RLS + query already scope/sort this; no client-side re-sort).
 */
import { DetailPageLayout } from '@/components/DetailPageLayout';
import Theme from '@/constants/Theme';
import { useAuth } from '@/contexts/AuthContext';
import { useDocumentPreview } from '@/features/chat/components/DocumentPreviewModal';
import {
  getSupportAttachmentSignedUrl,
  isImageAttachment,
  supportTicketStatusLabel,
  type SupportTicketAttachmentPreview,
  type SupportTicketListItem,
  type SupportTicketStatus,
} from '@/features/support/services/supportTickets.service';
import {
  countSupportTicketsWithUserUpdate,
  formatSupportUnreadBadge,
  supportTicketHasUserUpdate,
} from '@/features/support/utils/supportTicketUnread.util';
import { useMySupportTicketsQuery } from '@/lib/queries/useMySupportTicketsQuery';
import { ROUTES } from '@/lib/routes';
import { useRouter, type Href } from 'expo-router';
import { Inbox } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

const WEB_COPY = Platform.select({
  web: { whiteSpace: 'pre-wrap' as const },
  default: {},
});

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

function TicketAttachmentPreviewRow({
  attachments,
  onPreview,
}: {
  attachments: SupportTicketAttachmentPreview[];
  onPreview: (url: string, mime: string | null, fileName: string) => void;
}) {
  const images = useMemo(
    () => attachments.filter((a) => isImageAttachment(a.mime_type)).slice(0, 3),
    [attachments],
  );
  const [urls, setUrls] = useState<Record<string, string>>({});
  const key = useMemo(() => images.map((a) => a.id).join(','), [images]);

  useEffect(() => {
    let active = true;
    (async () => {
      for (const a of images) {
        const url = await getSupportAttachmentSignedUrl(a.storage_path);
        if (active && url) setUrls((prev) => ({ ...prev, [a.id]: url }));
      }
    })();
    return () => {
      active = false;
    };
  }, [key, images]);

  if (images.length === 0) return null;

  return (
    <View style={styles.previewRow}>
      {images.map((a) => {
        const url = urls[a.id];
        if (!url) {
          return <View key={a.id} style={[styles.previewThumb, styles.previewThumbPlaceholder]} />;
        }
        const fileName = a.storage_path.split('/').pop() ?? 'Attachment';
        return (
          <Pressable
            key={a.id}
            onPress={() => onPreview(url, a.mime_type, fileName)}
            accessibilityRole="button"
            accessibilityLabel={`Preview ${fileName}`}
            style={styles.previewThumbPress}
          >
            <Image
              source={{ uri: url }}
              style={styles.previewThumb}
              resizeMode="cover"
            />
          </Pressable>
        );
      })}
      {attachments.length > images.length ? (
        <Text style={styles.previewMore}>+{attachments.length - images.length}</Text>
      ) : null}
    </View>
  );
}

export function MySupportTicketsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { tickets, isLoading, isRefetching, refetch, error } = useMySupportTicketsQuery(
    user?.uid,
  );
  const { open: openPreview, node: previewNode } = useDocumentPreview();
  const updateCount = useMemo(
    () => countSupportTicketsWithUserUpdate(tickets),
    [tickets],
  );
  const updateBadge = formatSupportUnreadBadge(updateCount);

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/' as Href);
  };

  return (
    <>
      <DetailPageLayout
        title={updateBadge ? `My tickets (${updateBadge})` : 'My tickets'}
        onBack={handleBack}
        onRefresh={() => void refetch()}
        refreshing={isRefetching}
        rightAction={
          <Pressable
            onPress={() => router.push(ROUTES.support() as Href)}
            hitSlop={8}
            style={styles.headerBtn}
            accessibilityRole="button"
            accessibilityLabel="New ticket"
          >
            <Text style={styles.headerBtnText}>New ticket</Text>
          </Pressable>
        }
      >
        <View style={styles.page}>
        {error ? (
          <Text style={styles.errorText}>
            {error instanceof Error ? error.message : 'Could not load your tickets.'}
          </Text>
        ) : null}

        {isLoading ? (
          <ActivityIndicator color={Theme.primary} style={{ marginTop: 8 }} />
        ) : tickets.length === 0 ? (
          <View style={styles.empty}>
            <Inbox size={18} color={Theme.textMuted} />
            <Text style={styles.emptyTitle}>No tickets yet</Text>
            <Text style={styles.emptyBody}>
              Submitted tickets will show up here.
            </Text>
          </View>
        ) : (
          (tickets as SupportTicketListItem[]).map((t) => {
            const hasUpdate = supportTicketHasUserUpdate(t);
            return (
            <Pressable
              key={t.id}
              onPress={() => router.push(ROUTES.supportTicket(t.id) as Href)}
              style={({ pressed }) => [
                styles.card,
                hasUpdate && styles.cardUpdate,
                pressed && styles.cardPressed,
              ]}
              accessibilityLabel={`${t.display_id} ${t.subject}${hasUpdate ? ', update available' : ''}`}
            >
              <View style={styles.cardTop}>
                <View style={styles.idRow}>
                  {hasUpdate ? <View style={styles.updateDot} /> : null}
                  <Text style={styles.displayId}>{t.display_id}</Text>
                </View>
                <View style={[styles.statusPill, { backgroundColor: `${statusColor(t.status)}1A` }]}>
                  <Text style={[styles.statusPillText, { color: statusColor(t.status) }]}>
                    {supportTicketStatusLabel(t.status)}
                  </Text>
                </View>
              </View>
              <Text style={[styles.subject, hasUpdate && styles.subjectUpdate]} numberOfLines={1}>
                {t.subject}
              </Text>
              <TicketAttachmentPreviewRow
                attachments={t.attachments ?? []}
                onPreview={(url, mime, fileName) => {
                  void openPreview(url, mime, fileName);
                }}
              />
              <Text style={styles.meta}>
                {hasUpdate ? 'Update available · ' : ''}Updated {formatUpdatedAt(t.updated_at)}
              </Text>
            </Pressable>
            );
          })
        )}
        </View>
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
    gap: 8,
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
  card: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.actionBtnGhostBorder,
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 3,
  },
  cardUpdate: {
    borderColor: Theme.warning,
    backgroundColor: Theme.warningMuted,
  },
  cardPressed: { opacity: 0.92 },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  idRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
    flex: 1,
  },
  updateDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: Theme.destructive,
  },
  displayId: {
    fontSize: 11,
    fontWeight: '500',
    color: Theme.textMuted,
    letterSpacing: 0,
    ...WEB_COPY,
  },
  statusPill: {
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0,
    ...WEB_COPY,
  },
  subject: {
    fontSize: 13,
    fontWeight: '500',
    color: Theme.textPrimaryDark,
    letterSpacing: 0,
    ...WEB_COPY,
  },
  subjectUpdate: {
    fontWeight: '600',
  },
  meta: {
    fontSize: 10,
    color: Theme.textMuted,
    letterSpacing: 0,
    ...WEB_COPY,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    marginBottom: 2,
  },
  previewThumbPress: {
    width: 52,
    height: 52,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
  },
  previewThumb: {
    width: 52,
    height: 52,
    backgroundColor: Theme.borderLight,
  },
  previewThumbPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 8,
    opacity: 0.5,
    backgroundColor: Theme.borderLight,
  },
  previewMore: {
    fontSize: 11,
    fontWeight: '700',
    color: Theme.textMuted,
    marginLeft: 2,
  },
  empty: {
    alignItems: 'flex-start',
    gap: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.actionBtnGhostBorder,
    backgroundColor: Theme.surface,
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  emptyTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: Theme.actionBtnInk,
    letterSpacing: 0,
    ...WEB_COPY,
  },
  emptyBody: {
    fontSize: 12,
    lineHeight: 17,
    color: Theme.textMuted,
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
});
