/**
 * Trip detail — Ratings for own/asset, aggregate (OTP), and indent-based trips.
 * - Own trip (asset): Organization→Driver
 * - Aggregate (OTP): Client→Supplier (clients.id or org when no client_id), Client→Driver (when client_id), Supplier→Driver, Org→Driver (when no client_id)
 * - Indent-based: Client→Supplier, Client→Driver, Supplier→Driver
 */
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { PartyAvatar as SharedPartyAvatar } from "@/components/PartyAvatar";
import { TripFeedbackModal } from '@/components/TripFeedbackModal';
import { FinanceTxnTypography } from '@/constants/FinanceTxnTypography';
import Theme from '@/constants/Theme';
import { useOrganization } from '@/contexts/OrganizationContext';
import {
    getClientById,
    getClientDetails,
    getLinkedOrgProfile,
} from '@/features/clients/services/clients.service';
import {
    getDriverById,
    getDriversByOrganization,
} from '@/features/drivers/services/drivers.service';
import { getTripOperationalDisplay } from "@/features/operations/display";
import {
    getLinkedOrgProfileForSupplier,
    getSupplierById,
    getSupplierDetails,
} from '@/features/suppliers/services/suppliers.service';
import type { TripPartyAvatarFields } from "@/features/trips/components/trip-detail/hooks/useTripDetail";
import type { TripRow } from '@/features/trips/services/trips.service';
import { getSignedAvatarUrl } from '@/lib/avatarUpload';
import type { PartyEntityType } from "@/lib/partyAvatarDisplay";
import { VALIDATION } from '@/lib/validation';
import Feather from '@expo/vector-icons/Feather';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    Alert,
    Animated,
    Easing,
    Image,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    useWindowDimensions,
    View,
    type TextStyle,
    type ViewStyle,
} from 'react-native';
import {
    averageScore,
    createRating,
    getRatingsForClient,
    getRatingsForDriver,
    getRatingsForSupplier,
    getRatingsForTrip,
    resolveRatedClientIdForTrip,
    type RatingRow,
} from '../services/ratings.service';
import type { RatedType, RaterType } from '../types';

export interface TripRatingsBlockProps {
  trip: TripRow;
  organizationId: string | null;
  /** Resolved supplier/partner display name */
  partnerName?: string | null;
  /** Resolved driver display name */
  driverName?: string | null;
  /** Resolved driver profile avatar uri (signed/public URL). */
  driverAvatarUri?: string | null;
  /** Called when trip ratings have been loaded (so parent can show driver rating in tracking block) */
  onRatingsLoaded?: (ratings: RatingRow[]) => void;
  /** Resolved client display name for settlement feedback prompt. */
  clientName?: string | null;
  /** Linked-org + contact avatar fields from trip detail (preferred for registry layout). */
  clientPartyAvatarFields?: TripPartyAvatarFields | null;
  supplierPartyAvatarFields?: TripPartyAvatarFields | null;
  /** True when customer payment has been captured on this trip. */
  paymentCaptured?: boolean;
  /**
   * Web trip detail: large “workspace” ratings panel (stakeholder cards + audit list).
   * Default keeps the compact layout used on native.
   */
  layoutVariant?: 'default' | 'workspace' | 'registry';
  /** Desktop manifest sidebar — larger registry cards inside the parent side panel. */
  embeddedSidebar?: boolean;
  /**
   * `modalOnly` — TripFeedbackModal auto-popup only (e.g. chat overlay).
   * `inline` (default) — full ratings panel on trip detail + modals.
   */
  surface?: 'inline' | 'modalOnly';
  /** Skip driver/supplier/client-wide rating list fetches (completed trip open). */
  skipHistoricalPartyRatings?: boolean;
  /** When false, do not auto-open the feedback modal (other copies on the page own that). */
  enableAutoPrompt?: boolean;
}

type RateFlow = { type: 'client_supplier' } | { type: 'supplier_driver' } | null;
type CommentPayload = { tags: string[]; note: string };
type LocalClientFeedback = {
  score: number;
  tags: string[];
  note: string;
  created_at: string;
};

type QuickTag = { id: string; label: string };

const DRIVER_RATING_TAGS: readonly QuickTag[] = [
  { id: 'on_time', label: 'On time' },
  { id: 'professional', label: 'Professional' },
  { id: 'safe_driving', label: 'Safe driving' },
  { id: 'good_communication', label: 'Helpful' },
  { id: 'well_maintained_vehicle', label: 'Well maintained vehicle' },
] as const;

const SUPPLIER_RATING_TAGS: readonly QuickTag[] = [
  { id: 'reliable_service', label: 'Reliable' },
  { id: 'on_time_assignment', label: 'Good pricing' },
  { id: 'good_coordination', label: 'Accurate paperwork' },
  { id: 'quick_response', label: 'Quick response' },
  { id: 'professional', label: 'Professional' },
] as const;
const CLIENT_RATING_TAGS: readonly QuickTag[] = [
  { id: 'prompt_payment', label: 'Prompt payment' },
  { id: 'clear_docs', label: 'Clear docs' },
  { id: 'smooth_coordination', label: 'Smooth coordination' },
  { id: 'quick_approval', label: 'Quick approvals' },
] as const;

const LEGACY_TAG_LABELS: Record<string, string> = {
  clean: 'Clean ride',
  navigation: 'Great navigation',
  communication: 'Good communication',
  safe: 'Safe driving',
  ontime: 'On time',
};

const COMMENT_TAG_PREFIX = '[[tags:';
const COMMENT_TAG_SUFFIX = ']]';
const COMMENT_EDIT_REASON_PREFIX = '[[edit_reason:';
const COMMENT_EDIT_REASON_SUFFIX = ']]';

function getQuickTagsForRatedType(ratedType: RatedType): readonly QuickTag[] {
  if (ratedType === 'client') return CLIENT_RATING_TAGS;
  return ratedType === 'supplier' ? SUPPLIER_RATING_TAGS : DRIVER_RATING_TAGS;
}

function getQuickTagLabel(tagId: string, ratedType: RatedType): string {
  return (
    getQuickTagsForRatedType(ratedType).find((item) => item.id === tagId)?.label ||
    LEGACY_TAG_LABELS[tagId] ||
    tagId
  );
}

function parseCommentPayload(raw: string | null): CommentPayload {
  if (!raw) return { tags: [], note: '' };
  if (!raw.startsWith(COMMENT_TAG_PREFIX)) {
    const plain = raw.trim();
    if (
      plain.startsWith(COMMENT_EDIT_REASON_PREFIX) &&
      plain.indexOf(COMMENT_EDIT_REASON_SUFFIX) !== -1
    ) {
      const suffixIndex = plain.indexOf(COMMENT_EDIT_REASON_SUFFIX);
      return { tags: [], note: plain.slice(suffixIndex + COMMENT_EDIT_REASON_SUFFIX.length).trim() };
    }
    return { tags: [], note: plain };
  }
  const suffixIndex = raw.indexOf(COMMENT_TAG_SUFFIX);
  if (suffixIndex === -1) {
    return { tags: [], note: raw.trim() };
  }
  const encodedTags = raw.slice(COMMENT_TAG_PREFIX.length, suffixIndex);
  const tags = encodedTags
    .split('|')
    .map((item) => item.trim())
    .filter(Boolean);
  let note = raw.slice(suffixIndex + COMMENT_TAG_SUFFIX.length).trim();
  if (
    note.startsWith(COMMENT_EDIT_REASON_PREFIX) &&
    note.indexOf(COMMENT_EDIT_REASON_SUFFIX) !== -1
  ) {
    const editSuffixIndex = note.indexOf(COMMENT_EDIT_REASON_SUFFIX);
    note = note.slice(editSuffixIndex + COMMENT_EDIT_REASON_SUFFIX.length).trim();
  }
  return { tags, note };
}

function buildCommentPayload(tags: string[], note: string, editReason?: string): string | null {
  const trimmedNote = note.trim();
  const trimmedEditReason = (editReason ?? '').trim();
  const editMeta = trimmedEditReason
    ? `${COMMENT_EDIT_REASON_PREFIX}${trimmedEditReason}${COMMENT_EDIT_REASON_SUFFIX}`
    : '';
  const body = editMeta ? (trimmedNote ? `${editMeta}\n${trimmedNote}` : editMeta) : trimmedNote;
  if (tags.length === 0) {
    return body || null;
  }
  const encoded = `${COMMENT_TAG_PREFIX}${tags.join('|')}${COMMENT_TAG_SUFFIX}`;
  return body ? `${encoded}\n${body}` : encoded;
}

function hasEditReason(raw: string | null): boolean {
  return !!raw && raw.includes(COMMENT_EDIT_REASON_PREFIX);
}

function formatDate(s: string) {
  if (!s) return '—';
  const d = s.slice(0, 10);
  const [y, m, day] = d.split('-');
  const months = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');
  return `${day} ${months[Number(m) - 1]} ${y}`;
}

/** Soft title-case when the source string is ALL CAPS (common in party records). */
function formatPartyDisplayName(name: string): string {
  const t = (name ?? '').trim();
  if (!t) return '—';
  const letters = t.replace(/[^A-Za-z]/g, '');
  if (letters.length >= 2 && letters === letters.toUpperCase()) {
    return t
      .toLowerCase()
      .replace(/\b([a-z])/g, (ch) => ch.toUpperCase());
  }
  return t;
}

async function resolveAvatarUri(raw: string | null | undefined): Promise<string | null> {
  const t = (raw ?? '').trim();
  if (!t) return null;
  if (t.startsWith('http://') || t.startsWith('https://')) return t;
  return (await getSignedAvatarUrl(t)) ?? null;
}

function PartyAvatar({
  uri,
  name,
  size = 40,
  initialTextStyle,
  containerStyle,
}: {
  uri?: string | null;
  name: string;
  size?: number;
  initialTextStyle?: TextStyle;
  containerStyle?: ViewStyle;
}) {
  const initial = (name || '—').trim().slice(0, 1).toUpperCase() || '—';
  return (
    <View
      style={[
        styles.partyAvatarWrap,
        { width: size, height: size, borderRadius: size / 2 },
        containerStyle,
      ]}
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={[styles.partyAvatarImage, { width: size, height: size }]}
          resizeMode="cover"
        />
      ) : (
        <Text
          style={[
            styles.partyAvatarInitial,
            { fontSize: Math.max(12, size * 0.38) },
            initialTextStyle,
          ]}
        >
          {initial}
        </Text>
      )}
    </View>
  );
}

function isSupplierRatingForTrip(r: RatingRow, trip: TripRow): boolean {
  if (r.rated_type !== 'supplier' || !trip.supplier_id) return false;
  return r.rated_id === trip.supplier_id;
}

/** Who submits “rate the client” for this trip: fleet org on own trips; supplier when viewing as partner. */
function resolveClientRatingRater(
  trip: TripRow,
  effectiveOrganizationId: string,
  isClientViewer: boolean,
): { rater_type: RaterType; rater_id: string } {
  const orgId = trip.organization_id?.trim();
  if (isClientViewer) {
    return {
      rater_type: 'organization',
      rater_id: orgId ?? effectiveOrganizationId,
    };
  }
  const supId = trip.supplier_id?.trim();
  if (supId) {
    return { rater_type: 'supplier', rater_id: supId };
  }
  return { rater_type: 'organization', rater_id: effectiveOrganizationId };
}

/** Trip-level client score row for the current viewer (org vs supplier can both exist on one trip). */
function resolveClientTripRating(
  ratings: RatingRow[],
  trip: TripRow,
  isClientViewer: boolean,
  effectiveOrganizationId: string,
): RatingRow | undefined {
  const cid = trip.client_id?.trim();
  const rows = ratings.filter((r) => {
    if (r.rated_type !== 'client') return false;
    if (cid) return r.rated_id === cid;
    return true;
  });
  if (rows.length === 0) return undefined;
  if (rows.length === 1) return rows[0];
  const expected = resolveClientRatingRater(trip, effectiveOrganizationId, isClientViewer);
  return (
    rows.find((r) => r.rater_type === expected.rater_type && r.rater_id === expected.rater_id) ??
    rows[0]
  );
}

type RatedPartyKind = 'client' | 'supplier' | 'driver';

function RatedPartyBadge({ kind }: { kind: RatedPartyKind }) {
  const style =
    kind === 'client'
      ? styles.wsRatedTagClient
      : kind === 'supplier'
        ? styles.wsRatedTagSupplier
        : styles.wsRatedTagDriver;
  const label = kind === 'client' ? 'Client' : kind === 'supplier' ? 'Supplier' : 'Driver';
  return (
    <View style={[styles.wsRatedTag, style]}>
      <Text style={styles.wsRatedTagText}>{label}</Text>
    </View>
  );
}

/** Pulse-style modal variant: supplier = client→supplier rating; driver = supplier/org→driver. */
type FeedbackPresentationKind = 'DRIVER' | 'SUPPLIER';

function presentationKindFromFlow(flow: RateFlow): FeedbackPresentationKind {
  if (!flow) return 'DRIVER';
  return flow.type === 'client_supplier' ? 'SUPPLIER' : 'DRIVER';
}

const FEEDBACK_PRESENTATION: Record<
  FeedbackPresentationKind,
  {
    formTitle: string;
    promptWord: string;
  }
> = {
  DRIVER: {
    formTitle: 'Trip feedback',
    promptWord: 'driver',
  },
  SUPPLIER: {
    formTitle: 'Partner feedback',
    promptWord: 'supplier',
  },
};

export function TripRatingsBlock({
  trip,
  organizationId,
  partnerName,
  driverName,
  driverAvatarUri,
  onRatingsLoaded,
  clientName,
  clientPartyAvatarFields: clientPartyAvatarFieldsProp,
  supplierPartyAvatarFields: supplierPartyAvatarFieldsProp,
  paymentCaptured = false,
  layoutVariant = 'default',
  surface = 'inline',
  embeddedSidebar = false,
  skipHistoricalPartyRatings = false,
  enableAutoPrompt = true,
}: TripRatingsBlockProps) {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;
  const { currentOrganization } = useOrganization();
  void paymentCaptured;
  const [ratings, setRatings] = useState<RatingRow[]>([]);
  const [clientAvatarUri, setClientAvatarUri] = useState<string | null>(null);
  const [supplierAvatarUri, setSupplierAvatarUri] = useState<string | null>(null);
  const [resolvedDriverAvatarUri, setResolvedDriverAvatarUri] = useState<string | null>(driverAvatarUri ?? null);
  /** All-time average from `ratings` for this client (all trips). */
  const [histClientAvg, setHistClientAvg] = useState<number | null>(null);
  /** All-time average from `ratings` for this driver (all trips). */
  const [histDriverAvg, setHistDriverAvg] = useState<number | null>(null);
  /** All-time average from `ratings` for this supplier (all trips). */
  const [histSupplierAvg, setHistSupplierAvg] = useState<number | null>(null);
  /** When trip has supplier_id but no denormalized/display name yet. */
  const [supplierResolvedLabel, setSupplierResolvedLabel] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [flow, setFlow] = useState<RateFlow>(null);
  const [score, setScore] = useState(0);
  const [comment, setComment] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showCommentBox, setShowCommentBox] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [showClientFeedbackModal, setShowClientFeedbackModal] = useState(false);
  const [clientScore, setClientScore] = useState(0);
  const [clientTags, setClientTags] = useState<string[]>([]);
  const [clientComment, setClientComment] = useState('');
  const [clientSubmitting, setClientSubmitting] = useState(false);
  const [clientFeedback, setClientFeedback] = useState<LocalClientFeedback | null>(null);
  const [clientFeedbackLoaded, setClientFeedbackLoaded] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editReason, setEditReason] = useState('');
  const [showEditConfirm, setShowEditConfirm] = useState(false);
  const [pendingEditTarget, setPendingEditTarget] = useState<'driver' | 'supplier' | 'client' | null>(null);
  const [isClientEditMode, setIsClientEditMode] = useState(false);
  const [clientEditReason, setClientEditReason] = useState('');
  const hasAutoOpenedRef = useRef(false);
  const hasAutoOpenedClientRef = useRef(false);
  const modalOpacity = useRef(new Animated.Value(0)).current;
  const modalTranslateY = useRef(new Animated.Value(24)).current;
  const composerOpacity = useRef(new Animated.Value(0)).current;
  const composerTranslateY = useRef(new Animated.Value(10)).current;
  const successScale = useRef(new Animated.Value(0.96)).current;
  const successOpacity = useRef(new Animated.Value(0)).current;

  const isCompleted =
    (trip.status || '').toLowerCase() === 'completed' ||
    !!(trip as { completed_at?: string }).completed_at;
  const effectiveOrganizationId =
    organizationId || currentOrganization?.id || trip.organization_id || null;
  const isClientViewer =
    !!trip.organization_id && !!effectiveOrganizationId && trip.organization_id === effectiveOrganizationId;
  /**
   * Client→Supplier when a clients row exists (rater_id = clients.id), or
   * fleet (trip owner) rates supplier when there is no client_id on the trip.
   */
  const canRateSupplier =
    !!trip.supplier_id &&
    !!effectiveOrganizationId &&
    (!!trip.client_id || (isClientViewer && !!trip.organization_id));

  const hasRatedSupplier = ratings.some(
    (r) =>
      isSupplierRatingForTrip(r, trip) &&
      ((r.rater_type === 'client' &&
        !!trip.client_id &&
        r.rater_id === trip.client_id) ||
        (r.rater_type === 'organization' &&
          !!trip.organization_id &&
          r.rater_id === trip.organization_id)),
  );
  const hasRatedDriver = ratings.some(
    (r) =>
      r.rated_type === 'driver' &&
      (r.rater_type === 'client' || r.rater_type === 'supplier' || r.rater_type === 'organization')
  );
  const hasRatedClient =
    !!effectiveOrganizationId &&
    ratings.some((r) => {
      if (r.rated_type !== 'client') return false;
      if (trip.client_id && r.rated_id !== trip.client_id) return false;
      const exp = resolveClientRatingRater(trip, effectiveOrganizationId, isClientViewer);
      return r.rater_type === exp.rater_type && r.rater_id === exp.rater_id;
    });

  const hasSupplier = !!trip.supplier_id;
  const hasClient = !!trip.client_id;

  /** Client→Driver: indent or aggregate with client_id (trip owner). */
  const canRateDriverAsClient =
    hasClient &&
    hasSupplier &&
    !!trip.driver_id &&
    !!effectiveOrganizationId &&
    isClientViewer;
  /** Supplier→Driver: aggregate/indent when viewing as supplier org. */
  const canRateDriverAsSupplier =
    hasSupplier &&
    !!trip.driver_id &&
    !!effectiveOrganizationId &&
    !isClientViewer;
  /** Organization→Driver: own trip (asset) or aggregate without client_id (buyer org rates driver). */
  const canRateDriverAsOrg =
    !!trip.driver_id &&
    !!effectiveOrganizationId &&
    isClientViewer &&
    (!hasSupplier || !hasClient);

  const canRateDriver = canRateDriverAsClient || canRateDriverAsSupplier || canRateDriverAsOrg;
  // Client feedback should be allowed anytime once trip has a client link,
  // independent of transaction/payment capture state or client name resolution.
  const canRateClient =
    (!!trip.client_id || !!trip.client_name?.trim()) &&
    !!effectiveOrganizationId;

  const clientFeedbackStorageKey = `trip_client_feedback:${trip.id}`;

  const loadRatings = useCallback(async () => {
    if (!trip.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { error, ratings: list } = await getRatingsForTrip(trip.id);
    setLoading(false);
    if (!error) {
      setRatings(list);
      onRatingsLoaded?.(list);
    }
  }, [trip.id, onRatingsLoaded]);

  useEffect(() => {
    loadRatings();
  }, [loadRatings]);

  useEffect(() => {
    let cancelled = false;
    const id = trip.driver_id?.trim();
    if (skipHistoricalPartyRatings || !id) {
      setHistDriverAvg(null);
      return;
    }
    getRatingsForDriver(id).then(({ error, ratings: rows }) => {
      if (cancelled || error) return;
      setHistDriverAvg(averageScore(rows));
    });
    return () => {
      cancelled = true;
    };
  }, [trip.driver_id, skipHistoricalPartyRatings]);

  useEffect(() => {
    let cancelled = false;
    const id = trip.supplier_id?.trim();
    if (skipHistoricalPartyRatings || !id) {
      setHistSupplierAvg(null);
      return;
    }
    getRatingsForSupplier(id).then(({ error, ratings: rows }) => {
      if (cancelled || error) return;
      setHistSupplierAvg(averageScore(rows));
    });
    return () => {
      cancelled = true;
    };
  }, [trip.supplier_id, skipHistoricalPartyRatings]);

  useEffect(() => {
    let cancelled = false;
    const id = trip.client_id?.trim();
    if (skipHistoricalPartyRatings || !id) {
      setHistClientAvg(null);
      return;
    }
    getRatingsForClient(id).then(({ error, ratings: rows }) => {
      if (cancelled || error) return;
      setHistClientAvg(averageScore(rows));
    });
    return () => {
      cancelled = true;
    };
  }, [trip.client_id, skipHistoricalPartyRatings]);

  useEffect(() => {
    let cancelled = false;
    const sid = trip.supplier_id?.trim();
    if (!sid) {
      setSupplierResolvedLabel(null);
      return;
    }
    const fromTrip = (trip.supplier_name ?? '').trim();
    const fromPartner = (partnerName ?? "").trim();
    if (fromTrip || fromPartner) {
      setSupplierResolvedLabel(null);
      return;
    }
    const ownerOrg = trip.organization_id;
    const pickSupplierDisplayName = (s: {
      company_name?: string | null;
      name?: string | null;
      contact_person?: string | null;
    } | null) => (s?.company_name || s?.name || s?.contact_person || "").trim() || null;

    void (async () => {
      const { supplier: fromRpc } = await getSupplierDetails(sid);
      if (cancelled) return;
      let label = pickSupplierDisplayName(fromRpc);
      if (!label && ownerOrg) {
        const { supplier } = await getSupplierById(ownerOrg, sid);
        if (cancelled) return;
        label = pickSupplierDisplayName(supplier);
      }
      const viewerOrgId = currentOrganization?.id;
      if (!label && viewerOrgId && viewerOrgId !== ownerOrg) {
        const { supplier: supViewer } = await getSupplierById(viewerOrgId, sid);
        if (cancelled) return;
        label = pickSupplierDisplayName(supViewer);
      }
      if (!cancelled) setSupplierResolvedLabel(label);
    })();

    return () => {
      cancelled = true;
    };
  }, [trip.supplier_id, trip.organization_id, partnerName, trip.supplier_name, currentOrganization?.id]);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(clientFeedbackStorageKey)
      .then((raw) => {
        if (cancelled) return;
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as LocalClientFeedback;
            if (parsed && typeof parsed.score === 'number') {
              setClientFeedback(parsed);
            }
          } catch {
            // ignore bad local payload
          }
        }
        setClientFeedbackLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setClientFeedbackLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [clientFeedbackStorageKey]);

  useEffect(() => {
    let cancelled = false;
    const ownerOrg = trip.organization_id;
    const tripAny = trip as unknown as Record<string, unknown>;
    const tripClientAvatar =
      typeof tripAny.client_avatar_url === 'string'
        ? tripAny.client_avatar_url
        : typeof tripAny.client_avatar === 'string'
          ? tripAny.client_avatar
          : null;
    const tripSupplierAvatar =
      typeof tripAny.supplier_avatar_url === 'string'
        ? tripAny.supplier_avatar_url
        : typeof tripAny.supplier_avatar === 'string'
          ? tripAny.supplier_avatar
          : null;
    setClientAvatarUri(tripClientAvatar?.trim() ? tripClientAvatar : null);
    setSupplierAvatarUri(tripSupplierAvatar?.trim() ? tripSupplierAvatar : null);
    if (!ownerOrg) return;

    void (async () => {
      if (trip.client_id) {
        let rawAvatar = '';
        const d1 = await getClientDetails(trip.client_id);
        if (!cancelled && d1.client?.avatar_url) rawAvatar = d1.client.avatar_url;
        if (!rawAvatar && d1.client?.linked_organization_id) {
          const linked = await getLinkedOrgProfile(d1.client.linked_organization_id);
          if (!cancelled && linked.profile?.avatarUrl) rawAvatar = linked.profile.avatarUrl;
        }
        if (!rawAvatar) {
          const { client } = await getClientById(ownerOrg, trip.client_id);
          if (!cancelled && client?.avatar_url) rawAvatar = client.avatar_url;
          if (!rawAvatar && client?.linked_organization_id) {
            const linked = await getLinkedOrgProfile(client.linked_organization_id);
            if (!cancelled && linked.profile?.avatarUrl) rawAvatar = linked.profile.avatarUrl;
          }
        }
        const u = await resolveAvatarUri(rawAvatar || null);
        if (!cancelled) setClientAvatarUri(u);
      }

      if (trip.supplier_id) {
        let rawAvatar = '';
        const d1 = await getSupplierDetails(trip.supplier_id);
        if (!cancelled && d1.supplier?.avatar_url) rawAvatar = d1.supplier.avatar_url;
        if (!rawAvatar && d1.supplier?.linked_organization_id) {
          const linked = await getLinkedOrgProfileForSupplier(d1.supplier.linked_organization_id);
          if (!cancelled && linked.profile?.avatarUrl) rawAvatar = linked.profile.avatarUrl;
        }
        if (!rawAvatar) {
          const s2 = await getSupplierById(ownerOrg, trip.supplier_id);
          if (!cancelled && s2.supplier?.avatar_url) rawAvatar = s2.supplier.avatar_url ?? '';
          if (!rawAvatar && s2.supplier?.linked_organization_id) {
            const linked = await getLinkedOrgProfileForSupplier(s2.supplier.linked_organization_id);
            if (!cancelled && linked.profile?.avatarUrl) rawAvatar = linked.profile.avatarUrl;
          }
        }
        const viewerId = currentOrganization?.id;
        if (!rawAvatar && viewerId && viewerId !== ownerOrg) {
          const s3 = await getSupplierById(viewerId, trip.supplier_id);
          if (!cancelled && s3.supplier?.avatar_url) rawAvatar = s3.supplier.avatar_url ?? '';
        }
        const u = await resolveAvatarUri(rawAvatar || null);
        if (!cancelled) setSupplierAvatarUri(u);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [trip.id, trip.client_id, trip.supplier_id, trip.organization_id, currentOrganization?.id]);

  useEffect(() => {
    let cancelled = false;
    const tripAny = trip as unknown as Record<string, unknown>;
    const tripDriverAvatar =
      typeof tripAny.driver_avatar_url === 'string'
        ? tripAny.driver_avatar_url
        : typeof tripAny.driver_avatar === 'string'
          ? tripAny.driver_avatar
          : null;
    setResolvedDriverAvatarUri(driverAvatarUri ?? tripDriverAvatar ?? null);
    if (driverAvatarUri || !trip.driver_id) return;

    void (async () => {
      const candidateOrgIds = Array.from(
        new Set([currentOrganization?.id, trip.organization_id].filter(Boolean) as string[]),
      );
      for (const candidateOrgId of candidateOrgIds) {
        const { drivers } = await getDriversByOrganization(candidateOrgId);
        if (cancelled) return;
        const joinedDriver = drivers.find((item) => item.id === trip.driver_id);
        const joinedResolved = await resolveAvatarUri(joinedDriver?.avatar_url);
        if (joinedResolved) {
          if (!cancelled) setResolvedDriverAvatarUri(joinedResolved);
          return;
        }
        const { driver } = await getDriverById(candidateOrgId, trip.driver_id!);
        if (cancelled) return;
        const resolved = await resolveAvatarUri(driver?.avatar_url);
        if (resolved) {
          if (!cancelled) setResolvedDriverAvatarUri(resolved);
          return;
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentOrganization?.id, driverAvatarUri, trip.driver_id, trip.organization_id]);

  useEffect(() => {
    if (!flow) {
      modalOpacity.setValue(0);
      modalTranslateY.setValue(24);
      return;
    }
    Animated.parallel([
      Animated.timing(modalOpacity, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.quad),
        useNativeDriver: Platform.OS !== 'web',
      }),
      Animated.spring(modalTranslateY, {
        toValue: 0,
        useNativeDriver: Platform.OS !== 'web',
        damping: 18,
        stiffness: 180,
        mass: 0.9,
      }),
    ]).start();
  }, [flow, modalOpacity, modalTranslateY]);

  useEffect(() => {
    if (score <= 0 || submitSuccess) {
      composerOpacity.setValue(0);
      composerTranslateY.setValue(10);
      return;
    }
    Animated.parallel([
      Animated.timing(composerOpacity, {
        toValue: 1,
        duration: 180,
        easing: Easing.out(Easing.quad),
        useNativeDriver: Platform.OS !== 'web',
      }),
      Animated.timing(composerTranslateY, {
        toValue: 0,
        duration: 180,
        easing: Easing.out(Easing.quad),
        useNativeDriver: Platform.OS !== 'web',
      }),
    ]).start();
  }, [score, submitSuccess, composerOpacity, composerTranslateY]);

  useEffect(() => {
    if (!submitSuccess) {
      successOpacity.setValue(0);
      successScale.setValue(0.96);
      return;
    }
    Animated.parallel([
      Animated.timing(successOpacity, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.quad),
        useNativeDriver: Platform.OS !== 'web',
      }),
      Animated.spring(successScale, {
        toValue: 1,
        useNativeDriver: Platform.OS !== 'web',
        damping: 16,
        stiffness: 220,
        mass: 0.9,
      }),
    ]).start();
  }, [submitSuccess, successOpacity, successScale]);

  const nextFlowAfterSuccess: RateFlow =
    flow?.type === 'client_supplier'
      ? (canRateDriver && !hasRatedDriver ? { type: 'supplier_driver' } : null)
      : flow?.type === 'supplier_driver'
        ? (canRateSupplier && !hasRatedSupplier ? { type: 'client_supplier' } : null)
        : null;

  useEffect(() => {
    if (!submitSuccess) return;
    const timeout = setTimeout(() => {
      if (nextFlowAfterSuccess) {
        resetComposer(nextFlowAfterSuccess);
        return;
      }
      closeModal();
    }, nextFlowAfterSuccess ? 1200 : 2000);
    return () => clearTimeout(timeout);
  }, [submitSuccess, nextFlowAfterSuccess]);

  // Auto-popup rating modal when trip is completed and a rating is missing (once per mount)
  useEffect(() => {
    if (!enableAutoPrompt || loading || !isCompleted || hasAutoOpenedRef.current) return;
    if (canRateSupplier && !hasRatedSupplier) {
      hasAutoOpenedRef.current = true;
      setFlow({ type: 'client_supplier' });
      setScore(0);
      setComment('');
      setSelectedTags([]);
      setShowCommentBox(false);
      setSubmitSuccess(false);
      return;
    }
    if (canRateDriver && !hasRatedDriver) {
      hasAutoOpenedRef.current = true;
      setFlow({ type: 'supplier_driver' });
      setScore(0);
      setComment('');
      setSelectedTags([]);
      setShowCommentBox(false);
      setSubmitSuccess(false);
    }
  }, [enableAutoPrompt, loading, isCompleted, canRateSupplier, canRateDriver, hasRatedSupplier, hasRatedDriver]);

  const supplierTripRating = ratings.find((r) => isSupplierRatingForTrip(r, trip));
  const driverTripRating = ratings.find(
    (r) => r.rated_type === 'driver' && (!trip.driver_id || r.rated_id === trip.driver_id),
  );
  const clientTripRating =
    effectiveOrganizationId != null
      ? resolveClientTripRating(ratings, trip, isClientViewer, effectiveOrganizationId)
      : undefined;

  const resetComposer = (nextFlow: RateFlow) => {
    setFlow(nextFlow);
    setScore(0);
    setComment('');
    setSelectedTags([]);
    setShowCommentBox(false);
    setSubmitSuccess(false);
    setSubmitError(null);
    setIsEditMode(false);
    setEditReason('');
  };

  const openRateSupplier = () => {
    resetComposer({ type: 'client_supplier' });
  };
  const openRateDriver = () => {
    resetComposer({ type: 'supplier_driver' });
  };

  const requestEdit = (target: 'driver' | 'supplier' | 'client') => {
    setPendingEditTarget(target);
    setEditReason('');
    setShowEditConfirm(true);
  };

  const confirmEdit = () => {
    if (!editReason.trim()) {
      Alert.alert('Reason required', 'Please provide a reason for editing the feedback.');
      return;
    }
    setShowEditConfirm(false);
    const target = pendingEditTarget;
    setPendingEditTarget(null);

    if (target === 'supplier' && supplierTripRating) {
      const parsed = parseCommentPayload(supplierTripRating.comment ?? null);
      setFlow({ type: 'client_supplier' });
      setScore(Math.round(supplierTripRating.score));
      setSelectedTags(parsed.tags);
      setComment(parsed.note);
      setShowCommentBox(!!parsed.note);
      setSubmitSuccess(false);
      setIsEditMode(true);
    } else if (target === 'driver' && driverTripRating) {
      const parsed = parseCommentPayload(driverTripRating.comment ?? null);
      setFlow({ type: 'supplier_driver' });
      setScore(Math.round(driverTripRating.score));
      setSelectedTags(parsed.tags);
      setComment(parsed.note);
      setShowCommentBox(!!parsed.note);
      setSubmitSuccess(false);
      setIsEditMode(true);
    } else if (target === 'client') {
      const existingScore = clientTripRating?.score ?? clientFeedback?.score ?? 0;
      const parsed = clientTripRating
        ? parseCommentPayload(clientTripRating.comment)
        : clientFeedback
          ? { tags: clientFeedback.tags, note: clientFeedback.note }
          : { tags: [], note: '' };
      setClientScore(Math.round(existingScore) || 0);
      setClientTags(parsed.tags);
      setClientComment(parsed.note);
      setIsClientEditMode(true);
      setClientEditReason(editReason.trim());
      setShowClientFeedbackModal(true);
    }
  };
  const openRateSupplierAtScore = (nextScore: number) => {
    resetComposer({ type: 'client_supplier' });
    setScore(nextScore);
  };
  const openRateDriverAtScore = (nextScore: number) => {
    resetComposer({ type: 'supplier_driver' });
    setScore(nextScore);
  };
  const openRateClientAtScore = (nextScore: number) => {
    setIsClientEditMode(false);
    setClientEditReason('');
    setClientScore(nextScore);
    setShowClientFeedbackModal(true);
  };
  const canOpenSupplierRate = canRateSupplier;
  const canOpenDriverRate = canRateDriver;
  const canOpenClientRate = canRateClient;
  const closeModal = () => {
    setFlow(null);
    setSubmitting(false);
    setSubmitSuccess(false);
    setIsEditMode(false);
    setEditReason('');
  };
  const handleTagToggle = (tagId: string) => {
    setSelectedTags((prev) =>
      prev.includes(tagId) ? prev.filter((item) => item !== tagId) : [...prev, tagId]
    );
  };
  const handleClientTagToggle = (tagId: string) => {
    setClientTags((prev) =>
      prev.includes(tagId) ? prev.filter((item) => item !== tagId) : [...prev, tagId]
    );
  };

  const handleSubmit = () => {
    if (!flow) return;
    void (async () => {
    if (!effectiveOrganizationId) {
      setSubmitError('Organization context is missing. Please refresh and try again.');
      return;
    }
    if (score < 1 || score > 5) {
      setSubmitError('Choose a star rating before submitting.');
      return;
    }
    const trimmedComment = comment.trim();
    if (trimmedComment.length > VALIDATION.NOTES_MAX_LENGTH) {
      setSubmitError(`Comment must be at most ${VALIDATION.NOTES_MAX_LENGTH} characters.`);
      return;
    }
    const isClientSupplier = flow.type === 'client_supplier';
    const rated_type: RatedType = isClientSupplier ? 'supplier' : 'driver';
    const rated_id = (isClientSupplier ? trip.supplier_id : trip.driver_id)?.trim() ?? '';
    if (!rated_id) {
      setSubmitError(
        isClientSupplier
          ? 'This trip has no supplier to rate.'
          : 'This trip has no driver to rate.',
      );
      return;
    }
    let rater_type: RaterType;
    let rater_id: string;
    if (isClientSupplier) {
      if (trip.client_id?.trim()) {
      rater_type = 'client';
        rater_id = trip.client_id.trim();
      } else {
        rater_type = 'organization';
        rater_id = (trip.organization_id ?? effectiveOrganizationId).trim();
      }
    } else {
      if (canRateDriverAsClient) {
        rater_type = 'client';
        rater_id = trip.client_id!.trim();
      } else if (canRateDriverAsSupplier) {
        rater_type = 'supplier';
        rater_id = trip.supplier_id!.trim();
      } else {
        rater_type = 'organization';
        rater_id = effectiveOrganizationId;
      }
    }
    if (!rater_id) {
      setSubmitError('Could not determine who is submitting this rating.');
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    const commentPayload = buildCommentPayload(
      selectedTags,
      trimmedComment.slice(0, VALIDATION.NOTES_MAX_LENGTH),
      isEditMode ? editReason : undefined,
    );
    const payload = {
      trip_id: trip.id,
      rater_type,
      rater_id,
      rated_type,
      rated_id,
      score,
      comment: commentPayload,
      existingRatingId: isEditMode
        ? rated_type === "supplier"
          ? supplierTripRating?.id
          : driverTripRating?.id
        : undefined,
    };
    try {
      let result = await createRating(effectiveOrganizationId, payload);
      if (
        result.error &&
        isClientSupplier &&
        rater_type === 'client' &&
        !isEditMode
      ) {
        result = await createRating(effectiveOrganizationId, {
          ...payload,
          rater_type: 'organization',
          rater_id: effectiveOrganizationId,
        });
      }
      if (!result.error) {
        setSubmitSuccess(true);
        loadRatings();
        if (rated_type === 'supplier') {
          getRatingsForSupplier(rated_id).then(({ ratings: rows }) => {
            setHistSupplierAvg(averageScore(rows));
          });
        } else if (rated_type === 'driver') {
          getRatingsForDriver(rated_id).then(({ ratings: rows }) => {
            setHistDriverAvg(averageScore(rows));
          });
        }
      } else {
        setSubmitError(result.error.message);
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Could not save this rating.');
    } finally {
      setSubmitting(false);
    }
    })();
  };

  const supplierTripAvg = supplierTripRating?.score ?? null;
  const driverTripAvg = driverTripRating?.score ?? null;
  const clientTripAvg = clientTripRating?.score ?? clientFeedback?.score ?? null;

  useEffect(() => {
    if (loading || !isCompleted || !clientFeedbackLoaded) return;
    if (hasAutoOpenedClientRef.current) return;
    if (!canRateClient) return;
    if (clientTripRating || clientFeedback || hasRatedClient) return;
    hasAutoOpenedClientRef.current = true;
    setShowClientFeedbackModal(true);
  }, [
    loading,
    isCompleted,
    canRateClient,
    clientFeedbackLoaded,
    clientTripRating,
    clientFeedback,
    hasRatedClient,
  ]);

  const displaySupplierAvg = histSupplierAvg;
  const displayDriverAvg = histDriverAvg;
  const displayClientAvg = histClientAvg;
  const clientDisplayName = (clientName || trip.client_name || 'Client').trim();
  const resolvedPartnerLabel =
    (partnerName ?? '').trim() ||
    (trip.supplier_name ?? '').trim() ||
    (supplierResolvedLabel ?? '').trim() ||
    'Supplier';
  const hasSupplierParty = !!trip.supplier_id?.trim();
  const supplierDisplayName = hasSupplierParty ? resolvedPartnerLabel : 'No supplier';
  const hasDriverParty = !!trip.driver_id?.trim();
  const hasClientParty = !!(
    trip.client_id?.trim() ||
    trip.client_name?.trim() ||
    (clientName ?? '').trim()
  );
  const showRegistryDriverParty = hasDriverParty;
  const showRegistryClientParty = hasClientParty;
  const showRegistrySupplierParty = hasSupplierParty;
  const registryDriverAvatarFields: TripPartyAvatarFields | null =
    showRegistryDriverParty
      ? {
          organizationImageUrl: null,
          organizationAvatarSeed: null,
          organizationName: null,
          avatarUrl:
            (driverAvatarUri ?? resolvedDriverAvatarUri ?? "").trim() || null,
          avatarSeed: trip.driver_id?.trim() ?? null,
        }
      : null;
  const driverDisplayName = (
    driverName ||
    trip.driver_display_name ||
    'Driver'
  ).trim();
  const clientFeedbackSourceLabel = isClientViewer
    ? 'Fleet'
    : trip.supplier_id?.trim()
      ? 'Supplier'
      : 'Fleet';
  const isWorkspace = layoutVariant === 'workspace';
  const isRegistry = layoutVariant === 'registry';
  const isRegistrySidebar = isRegistry && embeddedSidebar;
  const isWidePanel = isWorkspace || isRegistry;
  const isCompactWorkspace = isWidePanel && width < 1100;
  const operationalTripLabel = getTripOperationalDisplay({
    trip_operational_code: trip.trip_operational_code ?? null,
    trip_code: trip.trip_code ?? null,
    display_trip_id: trip.display_trip_id ?? null,
    trip_number: trip.trip_number ?? null,
  });
  const activeSubjectName = flow?.type === 'client_supplier'
    ? resolvedPartnerLabel
    : (driverName || trip.driver_display_name || 'Driver');
  const activeSubjectMeta = flow?.type === 'client_supplier'
    ? (operationalTripLabel !== "—" ? operationalTripLabel : 'Trip')
    : (trip.vehicle_display_number || (operationalTripLabel !== "—" ? operationalTripLabel : 'Trip'));
  const activeQuickTags = flow?.type === 'client_supplier' ? SUPPLIER_RATING_TAGS : DRIVER_RATING_TAGS;
  // Driver accepted/assigned via app identity => connected party (global performance scope).
  const isDriverConnectedInApp = !!trip.driver_id?.trim();
  const isOfflineParty =
    flow?.type === 'client_supplier'
      ? !supplierPartyAvatarFieldsProp?.organizationImageUrl
      : !isDriverConnectedInApp;
  const presentationKind = flow ? presentationKindFromFlow(flow) : 'DRIVER';
  const pulseUi = FEEDBACK_PRESENTATION[presentationKind];
  const pulseModalEntityType: PartyEntityType =
    flow?.type === 'client_supplier' ? 'supplier' : 'driver';
  const pulseModalPartyFields =
    flow?.type === 'client_supplier'
      ? supplierPartyAvatarFieldsProp
      : registryDriverAvatarFields;
  const pulseModalAvatarUrl =
    (pulseModalPartyFields?.avatarUrl ?? '').trim() ||
    (flow?.type === 'client_supplier'
      ? (supplierAvatarUri ?? '').trim()
      : (resolvedDriverAvatarUri ?? '').trim()) ||
    undefined;
  const pulseModalEntitySeed =
    flow?.type === 'client_supplier'
      ? trip.supplier_id?.trim()
      : trip.driver_id?.trim();
  // Seed fallback for initials / deterministic avatars.
  // Prefer linked-organization seed (integrated brands) before entity/contact id.
  const pulseModalInitialsSeed =
    pulseModalPartyFields?.organizationAvatarSeed ??
    pulseModalPartyFields?.avatarSeed ??
    pulseModalEntitySeed ??
    undefined;
  const clientModalAvatarUrl =
    (clientPartyAvatarFieldsProp?.avatarUrl ?? '').trim() ||
    (clientAvatarUri ?? '').trim() ||
    undefined;
  const renderPartyScores = (
    tripScore: number | null,
    globalScore: number | null,
  ) => (
    <View style={[styles.wsPartyMetricsRow, isCompactWorkspace && styles.wsPartyMetricsRowCompact]}>
      <View style={styles.wsPartyScoreBlock}>
        <View style={styles.wsPartyScoreRow}>
          <Text style={[styles.wsPartyScore, isCompactWorkspace && styles.wsPartyScoreCompact]}>
            {tripScore != null ? tripScore.toFixed(1) : '—'}
          </Text>
          <FontAwesome name="star" size={isCompactWorkspace ? 9 : 12} color={Theme.feedbackModalStarActive} />
        </View>
        <Text style={[styles.wsPartyAvgCaption, isCompactWorkspace && styles.wsPartyAvgCaptionCompact]}>This trip</Text>
      </View>
      <View style={[styles.wsPartyScoreBlock, styles.wsPartyScoreBlockRight]}>
        <View style={styles.wsPartyScoreRow}>
          <Text style={[styles.wsPartyScore, isCompactWorkspace && styles.wsPartyScoreCompact]}>
            {globalScore != null ? globalScore.toFixed(1) : '—'}
          </Text>
          <FontAwesome name="star" size={isCompactWorkspace ? 9 : 12} color={Theme.feedbackModalStarActive} />
        </View>
        <Text style={[styles.wsPartyAvgCaption, isCompactWorkspace && styles.wsPartyAvgCaptionCompact]}>Global avg</Text>
      </View>
    </View>
  );

  if (
    layoutVariant !== 'registry' &&
    layoutVariant !== 'workspace' &&
    !canRateSupplier &&
    !canRateDriver &&
    !canRateClient &&
    ratings.length === 0 &&
    !clientFeedback
  ) {
    return null;
  }

  const summaryPillsEl = (
    <>
      {displaySupplierAvg != null && (
        <View style={[styles.summaryPill, isWidePanel && styles.wsSummaryPill]}>
                    <Feather name="briefcase" size={12} color={Theme.textPrimaryDark} />
          <Text style={[styles.summaryText, isWidePanel && styles.wsSummaryPillText]}>
            Supplier {displaySupplierAvg.toFixed(1)} ★
          </Text>
                  </View>
                )}
      {displayDriverAvg != null && (
        <View style={[styles.summaryPill, isWidePanel && styles.wsSummaryPill]}>
                    <Feather name="truck" size={12} color={Theme.textPrimaryDark} />
          <Text style={[styles.summaryText, isWidePanel && styles.wsSummaryPillText]}>
            Driver {displayDriverAvg.toFixed(1)} ★
          </Text>
                  </View>
                )}
                {displayClientAvg != null && (
        <View style={[styles.summaryPill, isWidePanel && styles.wsSummaryPill]}>
                    <Feather name="user" size={12} color={Theme.textPrimaryDark} />
          <Text style={[styles.summaryText, isWidePanel && styles.wsSummaryPillText]}>
            Client {displayClientAvg.toFixed(1)} ★
          </Text>
                  </View>
                )}
    </>
  );

  const ratingsList =
    ratings.length > 0 ? (
    <View style={[styles.list, isWidePanel && styles.wsList]}>
      {ratings.map((r) => {
                    const parsed = parseCommentPayload(r.comment);
        const fromLabel =
          r.rater_type === 'client' ? 'Client' : r.rater_type === 'organization' ? 'Fleet' : 'Supplier';
        const toLabel =
          r.rated_type === 'client'
            ? clientDisplayName
            : r.rated_type === 'supplier'
              ? supplierDisplayName
              : driverDisplayName;
        const ratedAvatarUri =
          r.rated_type === 'client'
            ? clientAvatarUri
            : r.rated_type === 'supplier'
              ? supplierAvatarUri
              : resolvedDriverAvatarUri;
                    return (
          <View key={r.id} style={[styles.row, isWidePanel && styles.wsAuditCard]}>
            {isWorkspace ? (
              <View style={styles.wsAuditMainRow}>
                <PartyAvatar uri={ratedAvatarUri} name={toLabel} size={44} />
                <View style={styles.wsAuditLeft}>
                  <RatedPartyBadge kind={r.rated_type} />
                  <Text style={styles.wsAuditFromTo}>
                    {fromLabel} → {toLabel}
                  </Text>
                  <View style={styles.wsScoreRow}>
                    <Text style={styles.wsAuditScore}>{r.score}</Text>
                    <FontAwesome name="star" size={16} color={Theme.feedbackModalStarActive} />
                    {hasEditReason(r.comment) ? (
                      <View style={styles.regEditedBadge}>
                        <Feather name="edit-2" size={8} color={Theme.textMuted} />
                        <Text style={styles.regEditedText}>Edited</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
                <Text style={styles.wsAuditDate}>{formatDate(r.updated_at ?? r.created_at)}</Text>
              </View>
            ) : (
              <View style={styles.rowTopWithAvatar}>
                <PartyAvatar uri={ratedAvatarUri} name={toLabel} size={36} />
                <View style={styles.rowTopTextCol}>
                        <Text style={styles.rowLabel}>
                    {fromLabel} → {toLabel}
                        </Text>
                        <Text style={styles.rowScore}>{r.score} ★</Text>
                </View>
              </View>
            )}
                        {parsed.tags.length > 0 ? (
              <View style={[styles.rowTags, isWorkspace && styles.wsRowTags]}>
                            {parsed.tags.map((tagId) => {
                              const tagLabel = getQuickTagLabel(tagId, r.rated_type);
                              return (
                    <View key={`${r.id}-${tagId}`} style={[styles.rowTagChip, isWorkspace && styles.wsTagChip]}>
                      <Text style={[styles.rowTagText, isWorkspace && styles.wsTagChipText]}>{tagLabel}</Text>
                                </View>
                              );
                            })}
                          </View>
                        ) : null}
                        {parsed.note ? (
              <Text style={[styles.rowComment, isWorkspace && styles.wsRowComment]} numberOfLines={2}>
                            {parsed.note}
                          </Text>
                        ) : null}
            {!isWorkspace ? <Text style={styles.rowDate}>{formatDate(r.created_at)}</Text> : null}
                      </View>
                    );
      })}
              </View>
  ) : null;

  const clientFeedbackList = clientFeedback != null ? (
    <View style={[styles.list, isWidePanel && styles.wsList]}>
      <View style={[styles.row, isWidePanel && styles.wsAuditCard]}>
        {isWorkspace ? (
          <View style={styles.wsAuditMainRow}>
            <PartyAvatar uri={clientAvatarUri} name={clientDisplayName} size={44} />
            <View style={styles.wsAuditLeft}>
              <RatedPartyBadge kind="client" />
              <Text style={styles.wsAuditFromTo}>
                {clientFeedbackSourceLabel} → {clientDisplayName}
              </Text>
              <View style={styles.wsScoreRow}>
                <Text style={styles.wsAuditScore}>{clientFeedback.score}</Text>
                <FontAwesome name="star" size={16} color={Theme.feedbackModalStarActive} />
              </View>
            </View>
            <Text style={styles.wsAuditDate}>{formatDate(clientFeedback.created_at)}</Text>
          </View>
        ) : (
          <View style={styles.rowTopWithAvatar}>
            <PartyAvatar uri={clientAvatarUri} name={clientDisplayName} size={36} />
            <View style={styles.rowTopTextCol}>
              <Text style={styles.rowLabel}>
                {clientFeedbackSourceLabel} → {clientDisplayName}
              </Text>
                  <Text style={styles.rowScore}>{clientFeedback.score} ★</Text>
            </View>
          </View>
        )}
                  {clientFeedback.tags.length > 0 ? (
          <View style={[styles.rowTags, isWorkspace && styles.wsRowTags]}>
                      {clientFeedback.tags.map((tagId) => {
              const tagLabel = CLIENT_RATING_TAGS.find((t) => t.id === tagId)?.label || tagId;
                        return (
                <View key={`client-${tagId}`} style={[styles.rowTagChip, isWorkspace && styles.wsTagChip]}>
                  <Text style={[styles.rowTagText, isWorkspace && styles.wsTagChipText]}>{tagLabel}</Text>
                          </View>
                        );
                      })}
                    </View>
                  ) : null}
                  {clientFeedback.note ? (
          <Text style={[styles.rowComment, isWorkspace && styles.wsRowComment]} numberOfLines={2}>
                      {clientFeedback.note}
                    </Text>
                  ) : null}
        {!isWorkspace ? (
                  <Text style={styles.rowDate}>{formatDate(clientFeedback.created_at)}</Text>
        ) : null}
                </View>
              </View>
  ) : null;
  void ratingsList;
  void clientFeedbackList;

  const driverRegistryFeedback = parseCommentPayload(driverTripRating?.comment ?? null);
  const supplierRegistryFeedback = parseCommentPayload(supplierTripRating?.comment ?? null);
  const clientRegistryFeedback: CommentPayload = clientTripRating
    ? parseCommentPayload(clientTripRating.comment)
    : clientFeedback
      ? { tags: clientFeedback.tags, note: clientFeedback.note }
      : { tags: [], note: '' };

  const renderRegistryCard = (
    roleKicker: string,
    partyName: string,
    entityType: PartyEntityType,
    partyAvatar: TripPartyAvatarFields | null | undefined,
    entitySeed: string | null | undefined,
    resolvedAvatarUri: string | null | undefined,
    tripScore: number | null,
    globalScore: number | null,
    onAudit: () => void,
    auditDisabled: boolean,
    onSelectScore: ((score: number) => void) | undefined,
    feedback: CommentPayload,
    ratedTypeForTags: RatedType,
    wasEdited?: boolean,
  ) => {
    const filledStars =
      tripScore != null ? Math.min(5, Math.max(0, Math.round(Number(tripScore)))) : 0;
    const perfUp =
      tripScore != null &&
      globalScore != null &&
      Number(tripScore) >= Number(globalScore);
    const perfLabel =
      tripScore == null || globalScore == null
        ? 'Pending'
        : perfUp
          ? 'Above avg'
          : 'Below avg';
    const perfColor =
      tripScore == null || globalScore == null
        ? Theme.textMuted
        : perfUp
          ? Theme.positive
          : Theme.warning;
    const noteTrimmed = (feedback.note ?? '').trim();
    const hasFeedbackBody = feedback.tags.length > 0 || !!noteTrimmed;

    const avatarUrl =
      (partyAvatar?.avatarUrl ?? "").trim() ||
      (resolvedAvatarUri ?? "").trim() ||
      undefined;

    const hasExistingRating = tripScore != null;
    const ratePrompt = hasExistingRating
      ? 'Your rating'
      : `Rate this ${roleKicker.toLowerCase()}`;
    const displayName = formatPartyDisplayName(partyName);

    return (
      <View
        style={[styles.regCard, isRegistrySidebar && styles.regCardSidebar]}
      >
        <TouchableOpacity
          style={[
            styles.regCardMain,
            isRegistrySidebar && styles.regCardMainSidebar,
            !hasFeedbackBody && styles.regCardMainTight,
          ]}
          activeOpacity={hasExistingRating ? 1 : auditDisabled ? 1 : 0.82}
          disabled={hasExistingRating || (auditDisabled && !onSelectScore)}
          onPress={() => {
            if (!hasExistingRating && !auditDisabled) onAudit();
          }}
        >
          <View style={styles.regCardTop}>
            <SharedPartyAvatar
              name={partyName}
              entityType={entityType}
              size={isRegistrySidebar ? 32 : 40}
              avatarUrl={avatarUrl}
              avatarSeed={partyAvatar?.avatarSeed ?? entitySeed ?? undefined}
              initialsColorSeed={entitySeed ?? partyAvatar?.avatarSeed ?? undefined}
              organizationImageUrl={partyAvatar?.organizationImageUrl ?? undefined}
              organizationAvatarSeed={partyAvatar?.organizationAvatarSeed ?? undefined}
            />
            <View style={styles.regCardBody}>
              <Text
                style={[styles.regKicker, isRegistrySidebar && styles.regKickerSidebar]}
                numberOfLines={1}
              >
                {roleKicker.toUpperCase()}
              </Text>
              <Text
                style={[styles.regPartyName, isRegistrySidebar && styles.regPartyNameSidebar]}
                numberOfLines={1}
              >
                {displayName}
              </Text>
              <View style={styles.regStatusRow}>
                <Text
                  style={[
                    styles.regPerfLbl,
                    isRegistrySidebar && styles.regPerfLblSidebar,
                    { color: perfColor },
                  ]}
                  numberOfLines={1}
                >
                  {perfLabel}
                </Text>
                {wasEdited ? (
                  <View style={styles.regEditedBadge}>
                    <Feather name="edit-2" size={8} color={Theme.textMuted} />
                    <Text style={styles.regEditedText}>Edited</Text>
                  </View>
                ) : null}
              </View>
            </View>
            <View style={styles.regScoresCol}>
              <View style={styles.regAvgScoreBlock}>
                <Text
                  style={[
                    styles.regMetricEyebrowMuted,
                    isRegistrySidebar && styles.regMetricEyebrowMutedSidebar,
                  ]}
                >
                  Avg
                </Text>
                <View style={styles.regGlobalPill}>
                  <Text
                    style={[
                      styles.regGlobalPillText,
                      isRegistrySidebar && styles.regGlobalPillTextSidebar,
                    ]}
                  >
                    {globalScore != null ? globalScore.toFixed(1) : '—'}
                  </Text>
                  <FontAwesome
                    name="star"
                    size={isRegistrySidebar ? 9 : 8}
                    color={Theme.feedbackModalStarActive}
                  />
                </View>
              </View>
            </View>
          </View>
          {hasFeedbackBody ? (
            <View style={styles.regFeedbackSection}>
              <Text style={styles.regFeedbackHeading}>Given feedback</Text>
              {feedback.tags.length > 0 ? (
                <View style={styles.regFeedbackTags}>
                  {feedback.tags.map((tagId) => (
                    <View key={tagId} style={styles.regFeedbackTagChip}>
                      <Text style={styles.regFeedbackTagText}>
                        {getQuickTagLabel(tagId, ratedTypeForTags)}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
              {noteTrimmed ? (
                <Text style={styles.regFeedbackNote} numberOfLines={3}>
                  {noteTrimmed}
                </Text>
              ) : null}
            </View>
          ) : null}
        </TouchableOpacity>

        <View style={[styles.regCardFoot, isRegistrySidebar && styles.regCardFootSidebar]}>
          <View style={styles.regFootSide}>
            <Text style={styles.regRatePrompt} numberOfLines={1}>
              {ratePrompt}
            </Text>
          </View>
          <View style={styles.regStarsRow}>
            {[1, 2, 3, 4, 5].map((step) => {
              const filled = tripScore != null && step <= filledStars;
              return (
                <TouchableOpacity
                  key={step}
                  disabled={hasExistingRating || auditDisabled || !onSelectScore}
                  activeOpacity={0.8}
                  onPress={() => onSelectScore?.(step)}
                  style={[
                    styles.regStarHit,
                    hasExistingRating || auditDisabled || !onSelectScore
                      ? null
                      : styles.regRungDotTap,
                  ]}
                  hitSlop={{ top: 8, bottom: 8, left: 2, right: 2 }}
                  accessibilityRole="button"
                  accessibilityLabel={`Rate ${step} stars`}
                >
                  <FontAwesome
                    name={filled ? 'star' : 'star-o'}
                    size={isRegistrySidebar ? 18 : 19}
                    color={
                      filled ? Theme.feedbackModalStarActive : '#C8C8C8'
                    }
                  />
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={[styles.regFootSide, styles.regFootSideEnd]}>
            {tripScore != null ? (
              <TouchableOpacity
                onPress={() => {
                  requestEdit(
                    ratedTypeForTags === "client"
                      ? "client"
                      : ratedTypeForTags === "supplier"
                        ? "supplier"
                        : "driver",
                  );
                }}
                activeOpacity={0.85}
                style={styles.regEditTap}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Edit rating"
              >
                <Feather name="edit-2" size={12} color="#616161" />
                <Text style={styles.regEditTxt}>Edit</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </View>
    );
  };

  const isModalOnly = surface === 'modalOnly';

  return (
    <>
      {!isModalOnly ? (
    <View style={[styles.wrapper, isWidePanel && styles.wsWrapper, isRegistrySidebar && styles.wsWrapperSidebar]}>
      {!isWidePanel ? (
        <View style={styles.sectionHeading}>
          <View style={styles.sectionIconWrap}>
            <Feather name="award" size={14} color={Theme.textOnPrimary} />
          </View>
          <View style={styles.sectionHeadingTextWrap}>
            <Text style={styles.sectionTitle}>Ratings</Text>
            <Text style={styles.sectionSubtitle}>Track service quality across completed trips</Text>
          </View>
        </View>
      ) : null}
      <View
        style={[
          styles.card,
          isWidePanel && styles.wsCard,
          isRegistry && styles.wsCardRegistry,
          isRegistrySidebar && styles.wsCardRegistrySidebar,
        ]}
      >
        {loading ? (
          <View style={styles.loading}>
            <LoadingIndicator size="small" color={Theme.textMuted} />
            <Text style={styles.loadingText}>Loading…</Text>
          </View>
        ) : (
          <>
            {isRegistry ? (
              <View style={[styles.regWrap, isRegistrySidebar && styles.regWrapSidebar]}>
                <View style={[styles.regStack, isRegistrySidebar && styles.regStackSidebar]}>
                  {showRegistryDriverParty
                    ? renderRegistryCard(
                        'Driver',
                        driverDisplayName,
                        'driver',
                        registryDriverAvatarFields,
                        trip.driver_id,
                        resolvedDriverAvatarUri,
                        driverTripAvg,
                        displayDriverAvg,
                        () => {
                          if (canOpenDriverRate) openRateDriver();
                        },
                        !canOpenDriverRate,
                        canOpenDriverRate ? openRateDriverAtScore : undefined,
                        driverRegistryFeedback,
                        'driver',
                        hasEditReason(driverTripRating?.comment ?? null),
                      )
                    : null}
                  {showRegistryClientParty
                    ? renderRegistryCard(
                        'Client',
                        clientDisplayName,
                        'client',
                        clientPartyAvatarFieldsProp,
                        trip.client_id,
                        clientAvatarUri,
                        clientTripAvg,
                        displayClientAvg,
                        () => {
                          if (canOpenClientRate) {
                            setIsClientEditMode(false);
                            setClientEditReason('');
                            setShowClientFeedbackModal(true);
                          }
                        },
                        !canOpenClientRate,
                        canOpenClientRate ? openRateClientAtScore : undefined,
                        clientRegistryFeedback,
                        'client',
                        hasEditReason(clientTripRating?.comment ?? null),
                      )
                    : null}
                  {showRegistrySupplierParty
                    ? renderRegistryCard(
                        'Supplier',
                        supplierDisplayName,
                        'supplier',
                        supplierPartyAvatarFieldsProp,
                        trip.supplier_id,
                        supplierAvatarUri,
                        supplierTripAvg,
                        displaySupplierAvg,
                        () => {
                          if (canOpenSupplierRate) openRateSupplier();
                        },
                        !canOpenSupplierRate,
                        canOpenSupplierRate ? openRateSupplierAtScore : undefined,
                        supplierRegistryFeedback,
                        'supplier',
                        hasEditReason(supplierTripRating?.comment ?? null),
                      )
                    : null}
                </View>
              </View>
            ) : null}

            {isWorkspace ? (
              <View style={[styles.wsHeaderRow, isCompactWorkspace && styles.wsHeaderRowCompact]}>
                <View style={styles.wsTitleCluster}>
                  <View style={styles.wsAwardCircle}>
                    <Feather name="award" size={28} color={Theme.primary} />
                  </View>
                  <View style={styles.wsTitleTextWrap}>
                    <Text style={styles.wsTitle}>Ratings</Text>
                    <Text style={styles.wsSubtitle}>Track service quality across completed trips</Text>
                  </View>
                </View>
                <View style={[styles.wsPillRow, isCompactWorkspace && styles.wsPillRowCompact]}>
                  {summaryPillsEl}
                </View>
              </View>
            ) : null}

            {!isWidePanel && ratings.length > 0 && (
              <View style={styles.summary}>{summaryPillsEl}</View>
            )}

            {isWorkspace ? (
              <View style={[styles.wsPartyGrid, isCompactWorkspace && styles.wsPartyGridCompact]}>
                <TouchableOpacity
                  style={[styles.wsPartyCard, isCompactWorkspace && styles.wsPartyCardCompact]}
                  onPress={() => {
                    if (canRateClient && !hasRatedClient) {
                      setIsClientEditMode(false);
                      setClientEditReason('');
                      setShowClientFeedbackModal(true);
                    }
                  }}
                  activeOpacity={canRateClient && !hasRatedClient ? 0.85 : 1}
                  disabled={!canRateClient || hasRatedClient}
                >
                  <View style={[styles.wsPartyIcon, styles.wsPartyIconDark, isCompactWorkspace && styles.wsPartyIconCompact]}>
                    <PartyAvatar
                      uri={clientAvatarUri}
                      name={clientDisplayName}
                      size={isCompactWorkspace ? 40 : 72}
                      initialTextStyle={{ color: Theme.textOnPrimary }}
                      containerStyle={{ borderWidth: 0, backgroundColor: 'rgba(255,255,255,0.12)' }}
                    />
                  </View>
                  <Text style={[styles.wsPartyRole, isCompactWorkspace && styles.wsPartyRoleCompact]}>Client</Text>
                  <Text style={[styles.wsPartyName, isCompactWorkspace && styles.wsPartyNameCompact]} numberOfLines={2}>
                    {clientDisplayName}
                  </Text>
                  <View style={[styles.wsPartyDivider, isCompactWorkspace && styles.wsPartyDividerCompact]} />
                  {renderPartyScores(clientTripAvg, displayClientAvg)}
                  <View style={styles.wsPartyFooter}>
                    {canRateClient && !hasRatedClient ? (
                      <Text style={[styles.wsRateCta, isCompactWorkspace && styles.wsRateCtaCompact]}>Rate party</Text>
                    ) : hasRatedClient ? (
                      <Text style={[styles.wsRateCtaMuted, isCompactWorkspace && styles.wsRateCtaMutedCompact]}>Recorded</Text>
                    ) : (
                      <Text style={[styles.wsRateCtaMuted, isCompactWorkspace && styles.wsRateCtaMutedCompact]}>—</Text>
                    )}
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.wsPartyCard, isCompactWorkspace && styles.wsPartyCardCompact]}
                  onPress={() => {
                    if (canRateSupplier && !hasRatedSupplier) openRateSupplier();
                  }}
                  activeOpacity={canRateSupplier && !hasRatedSupplier ? 0.85 : 1}
                  disabled={!canRateSupplier || hasRatedSupplier}
                >
                  <View style={[styles.wsPartyIcon, styles.wsPartyIconMuted, isCompactWorkspace && styles.wsPartyIconCompact]}>
                    <PartyAvatar uri={supplierAvatarUri} name={supplierDisplayName} size={isCompactWorkspace ? 40 : 72} />
                  </View>
                  <Text style={[styles.wsPartyRole, isCompactWorkspace && styles.wsPartyRoleCompact]}>Supplier</Text>
                  <Text style={[styles.wsPartyName, isCompactWorkspace && styles.wsPartyNameCompact]} numberOfLines={2}>
                    {supplierDisplayName}
                  </Text>
                  <View style={[styles.wsPartyDivider, isCompactWorkspace && styles.wsPartyDividerCompact]} />
                  {renderPartyScores(supplierTripAvg, displaySupplierAvg)}
                  <View style={styles.wsPartyFooter}>
                    {canRateSupplier && !hasRatedSupplier ? (
                      <Text style={[styles.wsRateCta, isCompactWorkspace && styles.wsRateCtaCompact]}>Rate party</Text>
                    ) : hasRatedSupplier ? (
                      <Text style={[styles.wsRateCtaMuted, isCompactWorkspace && styles.wsRateCtaMutedCompact]}>Recorded</Text>
                    ) : (
                      <Text style={[styles.wsRateCtaMuted, isCompactWorkspace && styles.wsRateCtaMutedCompact]}>—</Text>
                    )}
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.wsPartyCard, isCompactWorkspace && styles.wsPartyCardCompact]}
                  onPress={() => {
                    if (canRateDriver && !hasRatedDriver) openRateDriver();
                  }}
                  activeOpacity={canRateDriver && !hasRatedDriver ? 0.85 : 1}
                  disabled={!canRateDriver || hasRatedDriver}
                >
                  <View style={[styles.wsPartyIcon, styles.wsPartyIconDriver, isCompactWorkspace && styles.wsPartyIconCompact]}>
                    <PartyAvatar
                      uri={resolvedDriverAvatarUri}
                      name={driverDisplayName}
                      size={isCompactWorkspace ? 40 : 72}
                      initialTextStyle={{ color: Theme.primary }}
                      containerStyle={{ borderWidth: 0, backgroundColor: 'transparent' }}
                    />
                  </View>
                  <Text style={[styles.wsPartyRole, isCompactWorkspace && styles.wsPartyRoleCompact]}>Driver</Text>
                  <Text style={[styles.wsPartyName, isCompactWorkspace && styles.wsPartyNameCompact]} numberOfLines={2}>
                    {driverDisplayName}
                  </Text>
                  <View style={[styles.wsPartyDivider, isCompactWorkspace && styles.wsPartyDividerCompact]} />
                  {renderPartyScores(driverTripAvg, displayDriverAvg)}
                  <View style={styles.wsPartyFooter}>
                    {canRateDriver && !hasRatedDriver ? (
                      <Text style={[styles.wsRateCta, isCompactWorkspace && styles.wsRateCtaCompact]}>Rate party</Text>
                    ) : hasRatedDriver ? (
                      <Text style={[styles.wsRateCtaMuted, isCompactWorkspace && styles.wsRateCtaMutedCompact]}>Recorded</Text>
                    ) : (
                      <Text style={[styles.wsRateCtaMuted, isCompactWorkspace && styles.wsRateCtaMutedCompact]}>—</Text>
                    )}
                  </View>
                </TouchableOpacity>
              </View>
            ) : null}

            {!isRegistry ? (
              <View style={[styles.actions, isWorkspace && styles.wsActions]}>
                {canRateSupplier && !hasRatedSupplier && (
                  <TouchableOpacity
                    style={[styles.btn, styles.btnSupplier, isWorkspace && styles.wsPrimaryCta]}
                    onPress={openRateSupplier}
                    activeOpacity={0.8}
                  >
                    <Feather name="briefcase" size={14} color={isWorkspace ? Theme.textOnPrimary : Theme.darkGreen} />
                    <Text style={[styles.btnText, isWorkspace && styles.wsPrimaryCtaText]}>Rate supplier</Text>
                  </TouchableOpacity>
                )}
                {canRateSupplier && hasRatedSupplier && (
                  <TouchableOpacity
                    style={[styles.btn, styles.btnEditFeedback]}
                    onPress={() => requestEdit('supplier')}
                    activeOpacity={0.8}
                  >
                    <Feather name="edit-2" size={13} color={Theme.textSecondary} />
                    <Text style={styles.btnEditText}>Edit supplier feedback</Text>
                  </TouchableOpacity>
                )}
                {canRateDriver && !hasRatedDriver && (
                  <TouchableOpacity
                    style={[styles.btn, styles.btnDriver, isWorkspace && styles.wsPrimaryCta]}
                    onPress={openRateDriver}
                    activeOpacity={0.8}
                  >
                    <Feather name="truck" size={14} color={Theme.textOnPrimary} />
                    <Text style={[styles.btnText, isWorkspace && styles.wsPrimaryCtaText]}>Rate driver</Text>
                  </TouchableOpacity>
                )}
                {canRateDriver && hasRatedDriver && (
                  <TouchableOpacity
                    style={[styles.btn, styles.btnEditFeedback]}
                    onPress={() => requestEdit('driver')}
                    activeOpacity={0.8}
                  >
                    <Feather name="edit-2" size={13} color={Theme.textSecondary} />
                    <Text style={styles.btnEditText}>Edit driver feedback</Text>
                  </TouchableOpacity>
                )}
                {canRateClient && !hasRatedClient && (
                  <TouchableOpacity
                    style={[styles.btn, styles.btnDriver, isWorkspace && styles.wsOutlineCta]}
                    onPress={() => {
                      setIsClientEditMode(false);
                      setClientEditReason('');
                      setShowClientFeedbackModal(true);
                    }}
                    activeOpacity={0.8}
                  >
                    <Feather name="user" size={14} color={Theme.textPrimaryDark} />
                    <Text style={[styles.btnText, isWorkspace && styles.wsOutlineCtaText]}>
                      Rate client performance
                    </Text>
                  </TouchableOpacity>
                )}
                {canRateClient && hasRatedClient && (
                  <TouchableOpacity
                    style={[styles.btn, styles.btnEditFeedback]}
                    onPress={() => requestEdit('client')}
                    activeOpacity={0.8}
                  >
                    <Feather name="edit-2" size={13} color={Theme.textSecondary} />
                    <Text style={styles.btnEditText}>Edit client feedback</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : null}
          </>
        )}
      </View>
    </View>
      ) : null}

      <TripFeedbackModal
        visible={flow !== null}
        onRequestClose={closeModal}
        animatedCardStyle={{
          opacity: modalOpacity,
          transform: [{ translateY: modalTranslateY }],
        }}
      >
            {submitSuccess ? (
              <Animated.View
                style={[
                  styles.successWrap,
                  { opacity: successOpacity, transform: [{ scale: successScale }] },
                ]}
              >
                <View style={styles.successIconWrap}>
                  <Feather name="check" size={30} color={Theme.positive} />
                </View>
                <Text style={styles.successTitle}>Thank you for the rating</Text>
                <Text style={styles.successSubtitle}>
                  Your feedback helps maintain service quality across the network.
                </Text>
                <TouchableOpacity
                  style={styles.doneButton}
                  onPress={closeModal}
                  activeOpacity={0.85}
                >
                  <Text style={styles.doneButtonText}>Done</Text>
                </TouchableOpacity>
              </Animated.View>
            ) : (
              <>
                <View style={[styles.bizFormWrap, isDesktop && styles.bizFormWrapDesktop]}>
                  <View style={styles.bizTopBar}>
                    <TouchableOpacity
                      style={styles.bizBackBtn}
                      onPress={closeModal}
                      activeOpacity={0.8}
                      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                      accessibilityRole="button"
                      accessibilityLabel="Close feedback"
                    >
                      <Feather name="chevron-left" size={20} color={Theme.textPrimaryDark} />
                    </TouchableOpacity>
                    <View style={styles.bizTopBarText}>
                      <View style={styles.bizFormHeader}>
                        <View style={styles.bizLiveDot} />
                        <Text style={styles.bizFormTitle} numberOfLines={1}>
                          {isEditMode ? 'Edit feedback' : pulseUi.formTitle}
                        </Text>
                      </View>
                      <Text style={styles.bizFormHint}>
                        {isEditMode
                          ? 'Update the fields below, then submit.'
                          : 'Rate this trip to keep the network reliable.'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.bizPartyRow}>
                    <SharedPartyAvatar
                      name={activeSubjectName}
                      entityType={pulseModalEntityType}
                      size={isDesktop ? 44 : 36}
                      avatarUrl={pulseModalAvatarUrl}
                      avatarSeed={
                        pulseModalPartyFields?.avatarSeed ?? pulseModalEntitySeed ?? undefined
                      }
                      initialsColorSeed={pulseModalInitialsSeed}
                      organizationImageUrl={
                        pulseModalPartyFields?.organizationImageUrl ?? undefined
                      }
                      organizationAvatarSeed={
                        pulseModalPartyFields?.organizationAvatarSeed ?? undefined
                      }
                    />
                    <View style={styles.bizPartyTextCol}>
                      <Text style={styles.bizFieldLabel}>
                        {pulseUi.promptWord}
                      </Text>
                      <Text style={styles.bizPartyName} numberOfLines={2}>
                        {activeSubjectName}
                      </Text>
                      <Text style={styles.bizPartyMeta} numberOfLines={1}>
                        {activeSubjectMeta}
                      </Text>
                    </View>
                  </View>

                  {isOfflineParty ? (
                    <Text style={styles.bizHelperHint}>
                      This is an offline party — feedback is used for internal performance tracking only.
                    </Text>
                  ) : null}

                  <Text style={styles.bizFieldLabel}>Rating</Text>
                  <View style={[styles.starsPulse, isDesktop && styles.starsPulseDesktop]}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <TouchableOpacity
                        key={n}
                        onPress={() => setScore(n)}
                        style={styles.starBtnPulse}
                        hitSlop={12}
                        activeOpacity={0.85}
                      >
                        <FontAwesome
                          name={n <= score ? 'star' : 'star-o'}
                          size={isDesktop ? 34 : 28}
                          color={
                            n <= score
                              ? Theme.feedbackModalStarActive
                              : Theme.borderMedium
                          }
                        />
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={[styles.bizFieldLabel, styles.bizFieldLabelSpaced]}>Quick tags</Text>
                  <View style={[styles.tagsWrapPulse, styles.clientTagsWrapPulse, isDesktop && styles.clientTagsWrapPulseDesktop]}>
                    {activeQuickTags.map((tag) => {
                      const selected = selectedTags.includes(tag.id);
                      return (
                        <TouchableOpacity
                          key={tag.id}
                          onPress={() => handleTagToggle(tag.id)}
                          style={[
                            styles.tagChipPulse,
                            styles.clientTagChipPulse,
                            isDesktop && styles.clientTagChipPulseDesktop,
                            selected ? styles.tagChipPulseActive : styles.tagChipPulseIdle,
                          ]}
                          activeOpacity={0.85}
                        >
                          <Text
                            style={[
                              styles.tagChipTextPulse,
                              isDesktop && styles.tagChipTextPulseDesktop,
                              selected
                                ? styles.tagChipTextPulseActive
                                : styles.tagChipTextPulseIdle,
                            ]}
                            numberOfLines={2}
                          >
                            {tag.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <Text style={[styles.bizFieldLabel, styles.bizFieldLabelSpaced]}>Note</Text>
                  <View style={styles.commentBoxWrapPulse}>
                    <TextInput
                      style={[styles.commentInputPulse, isDesktop && styles.commentInputPulseDesktop]}
                      value={comment}
                      onChangeText={setComment}
                      placeholder="Optional note"
                      placeholderTextColor={Theme.textMuted}
                      multiline
                      numberOfLines={3}
                      maxLength={VALIDATION.NOTES_MAX_LENGTH}
                      textAlignVertical="top"
                    />
                  </View>

                  {submitError ? (
                    <Text style={styles.submitErrorText}>{submitError}</Text>
                  ) : null}

                  <TouchableOpacity
                    style={[
                      styles.bizPrimaryBtn,
                      (score < 1 || submitting) && styles.bizPrimaryBtnDisabled,
                      Platform.OS === "web" ? ({ cursor: "pointer" } as object) : null,
                    ]}
                    onPress={handleSubmit}
                    disabled={score < 1 || submitting}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel={isEditMode ? "Update feedback" : "Submit feedback"}
                  >
                    {submitting ? (
                      <LoadingIndicator size="small" color={Theme.buttonDarkText} />
                    ) : (
                      <>
                        <Text style={styles.bizPrimaryBtnText}>
                          {isEditMode ? 'Update' : 'Submit'}
                        </Text>
                        <Feather name="arrow-right" size={16} color={Theme.buttonDarkText} />
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}
      </TripFeedbackModal>
      <TripFeedbackModal
        visible={showClientFeedbackModal}
        onRequestClose={() => {
          setShowClientFeedbackModal(false);
          setIsClientEditMode(false);
          setClientEditReason('');
        }}
      >
            <View style={[styles.bizFormWrap, isDesktop && styles.bizFormWrapDesktop]}>
              <View style={styles.bizTopBar}>
                <TouchableOpacity
                  style={styles.bizBackBtn}
                  onPress={() => {
                    setShowClientFeedbackModal(false);
                    setIsClientEditMode(false);
                    setClientEditReason('');
                  }}
                  activeOpacity={0.8}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  accessibilityRole="button"
                  accessibilityLabel="Close feedback"
                >
                  <Feather name="chevron-left" size={20} color={Theme.textPrimaryDark} />
                </TouchableOpacity>
                <View style={styles.bizTopBarText}>
                  <View style={styles.bizFormHeader}>
                    <View style={styles.bizLiveDot} />
                    <Text style={styles.bizFormTitle} numberOfLines={1}>
                      {isClientEditMode ? 'Edit feedback' : 'Settlement feedback'}
                    </Text>
                  </View>
                  <Text style={styles.bizFormHint}>
                    {isClientEditMode
                      ? 'Update the fields below, then submit.'
                      : 'Rate this settlement to keep the network reliable.'}
                  </Text>
                </View>
              </View>

              <View style={styles.bizPartyRow}>
                <SharedPartyAvatar
                  name={clientDisplayName}
                  entityType="client"
                  size={isDesktop ? 44 : 36}
                  avatarUrl={clientModalAvatarUrl}
                  avatarSeed={
                    clientPartyAvatarFieldsProp?.avatarSeed ??
                    trip.client_id?.trim() ??
                    undefined
                  }
                  initialsColorSeed={
                    clientPartyAvatarFieldsProp?.organizationAvatarSeed ??
                    clientPartyAvatarFieldsProp?.avatarSeed ??
                    trip.client_id?.trim() ??
                    undefined
                  }
                  organizationImageUrl={
                    clientPartyAvatarFieldsProp?.organizationImageUrl ?? undefined
                  }
                  organizationAvatarSeed={
                    clientPartyAvatarFieldsProp?.organizationAvatarSeed ?? undefined
                  }
                />
                <View style={styles.bizPartyTextCol}>
                  <Text style={styles.bizFieldLabel}>Client</Text>
                  <Text style={styles.bizPartyName} numberOfLines={2}>
                    {clientDisplayName}
                  </Text>
                  <Text style={styles.bizPartyMeta}>Payment captured</Text>
                </View>
              </View>

              {!clientPartyAvatarFieldsProp?.organizationImageUrl ? (
                <Text style={styles.bizHelperHint}>
                  This is an offline party — feedback is used for internal performance tracking only.
                </Text>
              ) : null}

              <Text style={styles.bizFieldLabel}>Rating</Text>
              <View style={[styles.starsPulse, isDesktop && styles.starsPulseDesktop]}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <TouchableOpacity
                    key={`client-rate-${n}`}
                    onPress={() => setClientScore(n)}
                    style={styles.starBtnPulse}
                    hitSlop={12}
                    activeOpacity={0.85}
                  >
                    <FontAwesome
                      name={n <= clientScore ? 'star' : 'star-o'}
                      size={isDesktop ? 34 : 28}
                      color={n <= clientScore ? Theme.feedbackModalStarActive : Theme.borderMedium}
                    />
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.bizFieldLabel, styles.bizFieldLabelSpaced]}>Quick tags</Text>
              <View style={[styles.tagsWrapPulse, styles.clientTagsWrapPulse, isDesktop && styles.clientTagsWrapPulseDesktop]}>
                {CLIENT_RATING_TAGS.map((tag) => {
                  const selected = clientTags.includes(tag.id);
                  return (
                    <TouchableOpacity
                      key={tag.id}
                      onPress={() => handleClientTagToggle(tag.id)}
                      style={[
                        styles.tagChipPulse,
                        styles.clientTagChipPulse,
                        isDesktop && styles.clientTagChipPulseDesktop,
                        selected ? styles.tagChipPulseActive : styles.tagChipPulseIdle,
                      ]}
                      activeOpacity={0.85}
                    >
                      <Text
                        style={[
                          styles.tagChipTextPulse,
                          isDesktop && styles.tagChipTextPulseDesktop,
                          selected
                            ? styles.tagChipTextPulseActive
                            : styles.tagChipTextPulseIdle,
                        ]}
                        numberOfLines={2}
                      >
                        {tag.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={[styles.bizFieldLabel, styles.bizFieldLabelSpaced]}>Note</Text>
              <View style={styles.commentBoxWrapPulse}>
                <TextInput
                  style={[styles.commentInputPulse, isDesktop && styles.commentInputPulseDesktop]}
                  value={clientComment}
                  onChangeText={setClientComment}
                  placeholder="Optional note"
                  placeholderTextColor={Theme.textMuted}
                  multiline
                  numberOfLines={3}
                  maxLength={VALIDATION.NOTES_MAX_LENGTH}
                  textAlignVertical="top"
                />
              </View>

              <TouchableOpacity
                style={[
                  styles.bizPrimaryBtn,
                  (clientScore < 1 || clientSubmitting) && styles.bizPrimaryBtnDisabled,
                ]}
                disabled={clientScore < 1 || clientSubmitting}
                onPress={async () => {
                  if (clientScore < 1) return;
                  if (!effectiveOrganizationId) {
                    Alert.alert('Rating failed', 'Organization context is missing for this trip.');
                    return;
                  }
                  setClientSubmitting(true);
                  const payload: LocalClientFeedback = {
                    score: clientScore,
                    tags: clientTags,
                    note: clientComment.trim(),
                    created_at: new Date().toISOString(),
                  };
                  const commentPayload = buildCommentPayload(
                    clientTags,
                    clientComment.trim().slice(0, VALIDATION.NOTES_MAX_LENGTH),
                    isClientEditMode ? clientEditReason : undefined,
                  );
                  let error: { message: string } | null = null;
                  let usedSchemaFallback = false;

                  // Client rows / name→id resolution live under the trip owner's org.
                  const tripOwnerOrgForClientResolution =
                    trip.organization_id?.trim() ?? effectiveOrganizationId ?? '';
                  // Ratings RLS: INSERT must use an org the current user belongs to (see ratings policies).
                  const ratingsRowOrganizationId = effectiveOrganizationId;
                  let ratedClientId = trip.client_id?.trim() ?? null;
                  if (!ratedClientId && tripOwnerOrgForClientResolution) {
                    ratedClientId = await resolveRatedClientIdForTrip(
                      trip,
                      tripOwnerOrgForClientResolution,
                    );
                  }

                  if (ratingsRowOrganizationId && ratedClientId) {
                    const { rater_type, rater_id } = resolveClientRatingRater(
                      trip,
                      effectiveOrganizationId,
                      isClientViewer,
                    );
                    const submitRes = await createRating(ratingsRowOrganizationId, {
                      trip_id: trip.id,
                      rater_type,
                      rater_id,
                      rated_type: 'client',
                      rated_id: ratedClientId,
                      score: clientScore,
                      comment: commentPayload,
                      existingRatingId: isClientEditMode
                        ? clientTripRating?.id
                        : undefined,
                    });
                    error = submitRes.error;
                    const allowLocalClientFallback =
                      !!error &&
                      (error.message.toLowerCase().includes('ratings_rated_type_check') ||
                        error.message.toLowerCase().includes('check constraint') ||
                        error.message.toLowerCase().includes('rated_type'));
                    if (allowLocalClientFallback) usedSchemaFallback = true;
                    if (error && !allowLocalClientFallback) {
                      setClientSubmitting(false);
                      Alert.alert('Rating failed', error.message);
                      return;
                    }
                  } else if (!ratedClientId && (trip.client_name?.trim() || trip.client_id)) {
                    setClientSubmitting(false);
                    Alert.alert(
                      'Cannot save customer rating',
                      'Match this trip to a customer in Customers (same name as on the trip), or set the trip’s customer so ratings sync to the database.',
                    );
                    return;
                  }
                  await AsyncStorage.setItem(clientFeedbackStorageKey, JSON.stringify(payload));
                  setClientFeedback(payload);
                  await loadRatings();
                  if (ratedClientId) {
                    const { ratings: clientRatings } = await getRatingsForClient(ratedClientId);
                    setHistClientAvg(averageScore(clientRatings));
                  }
                  if (usedSchemaFallback) {
                    Alert.alert(
                      'Saved on this device only',
                      'The database rejected client ratings (missing rated_type “client”). Apply migration ratings_add_client_rated_type on Supabase, then submit again to sync.',
                    );
                  }
                  setClientSubmitting(false);
                  setShowClientFeedbackModal(false);
                  setIsClientEditMode(false);
                  setClientEditReason('');
                }}
                activeOpacity={0.85}
              >
                {clientSubmitting ? (
                  <LoadingIndicator size="small" color={Theme.buttonDarkText} />
                ) : (
                  <>
                    <Text style={styles.bizPrimaryBtnText}>
                      {isClientEditMode ? 'Update' : 'Submit'}
                    </Text>
                    <Feather name="arrow-right" size={16} color={Theme.buttonDarkText} />
                  </>
                )}
              </TouchableOpacity>
            </View>
      </TripFeedbackModal>

      {showEditConfirm ? (
        <TripFeedbackModal
          visible
          onRequestClose={() => { setShowEditConfirm(false); setPendingEditTarget(null); }}
        >
          <View style={[styles.bizFormWrap, isDesktop && styles.bizFormWrapDesktop]}>
            <View style={styles.bizTopBar}>
              <TouchableOpacity
                style={styles.bizBackBtn}
                onPress={() => { setShowEditConfirm(false); setPendingEditTarget(null); }}
                activeOpacity={0.8}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Feather name="chevron-left" size={20} color={Theme.textPrimaryDark} />
              </TouchableOpacity>
              <View style={styles.bizTopBarText}>
                <View style={styles.bizFormHeader}>
                  <View style={styles.bizLiveDot} />
                  <Text style={styles.bizFormTitle} numberOfLines={2}>
                    Edit submitted feedback?
                  </Text>
                </View>
                <Text style={styles.bizFormHint}>
                  Your previous rating will be replaced. Tell us why you are updating it.
                </Text>
              </View>
            </View>
            <Text style={styles.bizFieldLabel}>Reason</Text>
            <TextInput
              style={styles.editConfirmInput}
              value={editReason}
              onChangeText={setEditReason}
              placeholder="Reason"
              placeholderTextColor={Theme.textMuted}
              multiline
              numberOfLines={2}
              maxLength={200}
              textAlignVertical="top"
              autoFocus
            />
            <View style={styles.editConfirmActions}>
              <TouchableOpacity
                style={styles.editConfirmCancel}
                onPress={() => { setShowEditConfirm(false); setPendingEditTarget(null); }}
                activeOpacity={0.85}
              >
                <Text style={styles.editConfirmCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.editConfirmSubmit, !editReason.trim() && styles.editConfirmSubmitDisabled]}
                onPress={confirmEdit}
                disabled={!editReason.trim()}
                activeOpacity={0.85}
              >
                <Text style={styles.editConfirmSubmitText}>Continue</Text>
                <Feather name="arrow-right" size={14} color={Theme.buttonDarkText} />
              </TouchableOpacity>
            </View>
          </View>
        </TripFeedbackModal>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: 12, alignSelf: 'stretch' as const },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 10,
  },
  sectionIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Theme.textPrimaryDark,
  },
  sectionHeadingTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: Theme.textPrimaryDark,
    textTransform: 'capitalize',
  },
  sectionSubtitle: {
    marginTop: 2,
    fontSize: 11,
    color: Theme.textMuted,
  },
  card: {
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 12,
    padding: 16,
  },
  loading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  loadingText: {
    fontSize: 11,
    color: Theme.textMuted,
  },
  summary: {
    marginBottom: 12,
    gap: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  summaryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  summaryText: {
    fontSize: 11,
    fontWeight: '700',
    color: Theme.textPrimaryDark,
  },
  list: { gap: 8, marginBottom: 12 },
  row: {
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 10,
    backgroundColor: Theme.surface,
  },
  rowLabel: { fontSize: 8, fontWeight: '700', color: Theme.textMutedDemo, textTransform: 'uppercase', letterSpacing: 0.8 },
  rowScore: { fontSize: 12, fontWeight: '700', color: Theme.driverGold, marginTop: 4 },
  rowTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  rowTagChip: {
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  rowTagText: {
    fontSize: 10,
    fontWeight: '600',
    color: Theme.textPrimary,
  },
  rowComment: { fontSize: 11, color: Theme.textSecondary, marginTop: 4 },
  rowDate: { fontSize: 10, color: Theme.textMuted, marginTop: 2 },
  actions: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', marginTop: 6 },
  btn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    minWidth: 120,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  btnSupplier: {
    backgroundColor: Theme.darkGreen + '22',
    borderWidth: 1,
    borderColor: Theme.darkGreen,
  },
  btnDriver: {
    backgroundColor: Theme.textPrimaryDark + '14',
    borderWidth: 1,
    borderColor: Theme.textPrimaryDark,
  },
  btnText: {
    fontSize: 12,
    fontWeight: '700',
    color: Theme.textPrimary,
    textAlign: 'center',
  },
  // ── Workspace layout (web trip detail) ─────────────────────────────────────
  wsWrapper: {
    marginBottom: 20,
  },
  wsWrapperSidebar: {
    marginBottom: 0,
    width: "100%",
  },
  wsCard: {
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderRadius: 36,
    padding: 24,
    borderColor: Theme.borderLight,
    ...Platform.select({
      web: {
        boxShadow: '0 40px 100px rgba(15, 23, 42, 0.06)',
      },
      default: {},
    }),
  },
  wsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 20,
  },
  wsHeaderRowCompact: {
    gap: 10,
  },
  wsTitleCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flex: 1,
    minWidth: 200,
  },
  wsAwardCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Theme.primary + '18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  wsTitleTextWrap: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  wsTitle: {
    fontSize: 18,
    fontWeight: '900',
    fontStyle: 'italic',
    color: Theme.textPrimaryDark,
    textTransform: 'uppercase',
    letterSpacing: -0.3,
  },
  wsSubtitle: {
    fontSize: 10,
    fontWeight: '700',
    color: Theme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 2,
  },
  wsPillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'flex-end',
    alignItems: 'center',
    alignSelf: 'flex-end',
    flexShrink: 0,
  },
  wsPillRowCompact: {
    width: '100%',
    justifyContent: 'flex-start',
    alignSelf: 'stretch',
  },
  wsSummaryPill: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  wsSummaryPillText: {
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.2,
  },
  wsPartyGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'stretch',
  },
  wsPartyGridCompact: {
    gap: 6,
    marginBottom: 10,
  },
  wsPartyCard: {
    flex: 1,
    flexBasis: 0,
    minWidth: 140,
    maxWidth: 360,
    borderWidth: 2,
    borderColor: Theme.borderLight,
    borderRadius: 28,
    paddingVertical: 18,
    paddingHorizontal: 14,
    backgroundColor: Theme.surface,
    alignItems: 'center',
  },
  wsPartyCardCompact: {
    minWidth: 0,
    borderRadius: 14,
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderWidth: 1.4,
  },
  wsPartyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    overflow: 'hidden',
  },
  wsPartyIconCompact: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginBottom: 6,
  },
  wsPartyIconDark: {
    backgroundColor: Theme.textPrimaryDark,
  },
  wsPartyIconMuted: {
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  wsPartyIconDriver: {
    backgroundColor: Theme.primary + '22',
    borderWidth: 1,
    borderColor: Theme.primary + '44',
  },
  wsPartyRole: {
    fontSize: 9,
    fontWeight: '900',
    color: Theme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
  },
  wsPartyRoleCompact: {
    fontSize: 7,
    marginBottom: 3,
    letterSpacing: 0.55,
  },
  wsPartyName: {
    fontSize: 13,
    fontWeight: '900',
    fontStyle: 'italic',
    color: Theme.textPrimaryDark,
    textTransform: 'uppercase',
    textAlign: 'center',
    marginBottom: 8,
  },
  wsPartyNameCompact: {
    fontSize: 9,
    marginBottom: 4,
    lineHeight: 11,
  },
  wsPartyDividerCompact: {
    marginVertical: 5,
  },
  wsPartyMetricsRowCompact: {
    gap: 6,
    paddingTop: 0,
  },
  wsPartyScoreCompact: {
    fontSize: 11,
  },
  wsPartyAvgCaptionCompact: {
    fontSize: 7,
    letterSpacing: 0.45,
  },
  wsRateCtaCompact: {
    fontSize: 8,
  },
  wsRateCtaMutedCompact: {
    fontSize: 11,
  },
  wsPartyDivider: {
    width: '100%',
    height: 1,
    backgroundColor: Theme.borderLight,
    marginVertical: 8,
  },
  wsPartyFooter: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    paddingTop: 8,
  },
  wsPartyMetricsRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
    paddingTop: 2,
  },
  wsPartyScoreBlock: {
    flex: 1,
    minWidth: 0,
    alignItems: 'flex-start',
    gap: 2,
  },
  wsPartyScoreBlockRight: {
    alignItems: 'flex-end',
  },
  wsPartyAvgCaption: {
    fontSize: 8,
    fontWeight: '800',
    color: Theme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  wsPartyScoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  wsPartyScore: {
    fontSize: 14,
    fontWeight: '900',
    fontStyle: 'italic',
    color: Theme.textPrimaryDark,
  },
  wsRateCta: {
    fontSize: 9,
    fontWeight: '900',
    color: Theme.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.2,
  },
  wsRateCtaMuted: {
    fontSize: 9,
    fontWeight: '700',
    color: Theme.textMuted,
    textTransform: 'uppercase',
  },
  wsList: {
    gap: 12,
    marginBottom: 16,
  },
  wsAuditCard: {
    borderRadius: 24,
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: Theme.surface,
    borderColor: Theme.borderLight,
  },
  wsAuditMainRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 8,
  },
  rowTopWithAvatar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 4,
  },
  rowTopTextCol: {
    flex: 1,
    minWidth: 0,
  },
  partyAvatarWrap: {
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  partyAvatarImage: {
    borderRadius: 999,
  },
  partyAvatarInitial: {
    fontWeight: '800',
    color: Theme.textPrimaryDark,
  },
  wsAuditLeft: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  wsRatedTag: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  wsRatedTagClient: {
    backgroundColor: Theme.screenBackground,
    borderWidth: 1.5,
    borderColor: Theme.textPrimaryDark,
  },
  wsRatedTagSupplier: {
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  wsRatedTagDriver: {
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.primary + '55',
  },
  wsRatedTagText: {
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: Theme.textPrimaryDark,
  },
  wsAuditFromTo: {
    fontSize: 9,
    fontWeight: '900',
    color: Theme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  wsScoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  wsAuditScore: {
    fontSize: 20,
    fontWeight: '900',
    fontStyle: 'italic',
    color: Theme.textPrimaryDark,
  },
  wsAuditDate: {
    fontSize: 10,
    fontWeight: '700',
    color: Theme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  wsRowTags: {
    marginTop: 4,
  },
  wsTagChip: {
    backgroundColor: Theme.screenBackground,
    borderRadius: 999,
  },
  wsTagChipText: {
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.2,
  },
  wsRowComment: {
    marginTop: 8,
  },
  wsEmptyAudits: {
    fontSize: 12,
    fontWeight: '600',
    color: Theme.textMuted,
    textAlign: 'center',
    marginBottom: 12,
    fontStyle: 'italic',
  },
  wsActions: {
    marginTop: 8,
    justifyContent: 'center',
    gap: 12,
  },
  wsCardRegistry: {
    padding: 0,
    borderRadius: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
    ...Platform.select({
      web: { boxShadow: 'none' },
      default: {},
    }),
  },
  wsCardRegistrySidebar: {
    padding: 0,
    borderRadius: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
    ...Platform.select({
      web: { boxShadow: 'none' },
      default: {},
    }),
  },
  regWrap: {
    width: "100%",
    alignSelf: "stretch",
    gap: 10,
  },
  regWrapSidebar: {
    gap: 0,
    width: "100%",
  },
  regStack: {
    width: "100%",
    alignSelf: "stretch",
    gap: 10,
  },
  regStackSidebar: {
    gap: 8,
    width: "100%",
  },
  regCard: {
    width: "100%",
    alignSelf: "stretch",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: Theme.shadow,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
      },
      android: { elevation: 1 },
      default: {},
    }),
  },
  regCardSidebar: {
    borderRadius: 12,
    borderColor: Theme.borderLight,
  },
  regCardMain: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    gap: 10,
  },
  regCardMainSidebar: {
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 6,
    gap: 6,
  },
  regCardMainTight: {
    paddingBottom: 10,
    gap: 0,
  },
  regCardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  regCardBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
    paddingTop: 2,
  },
  regStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 2,
  },
  regScoresCol: {
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "flex-start",
    paddingTop: 2,
  },
  regAvgScoreBlock: {
    alignItems: "flex-end",
    gap: 2,
    minWidth: 44,
  },
  regKicker: {
    ...FinanceTxnTypography.chipLabel,
    fontSize: 9,
    lineHeight: 11,
    color: Theme.textMuted,
    letterSpacing: 0.8,
    fontWeight: '700',
  },
  regKickerSidebar: {
    fontSize: 10,
    lineHeight: 12,
  },
  regPartyName: {
    ...FinanceTxnTypography.partyTitle,
    fontStyle: 'normal',
    fontWeight: '700',
    fontSize: 14,
    lineHeight: 18,
    color: Theme.textPrimaryDark,
    letterSpacing: -0.1,
    textTransform: 'none',
  },
  regPartyNameSidebar: {
    fontSize: 14,
    lineHeight: 18,
  },
  regMetricEyebrowMuted: {
    ...FinanceTxnTypography.fieldLabel,
    fontSize: 8,
    lineHeight: 10,
    color: Theme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: '600',
    textAlign: 'right',
    alignSelf: 'stretch',
  },
  regMetricEyebrowMutedSidebar: {
    fontSize: 9,
    lineHeight: 11,
  },
  regGlobalPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 3,
  },
  regGlobalPillText: {
    ...FinanceTxnTypography.fieldValue,
    fontStyle: 'normal',
    fontWeight: '700',
    fontSize: 13,
    lineHeight: 16,
    fontVariant: ['tabular-nums'],
    color: Theme.textPrimaryDark,
    textAlign: 'right',
  },
  regGlobalPillTextSidebar: {
    fontSize: 13,
    lineHeight: 16,
  },
  regPerfLbl: {
    ...FinanceTxnTypography.chipLabel,
    fontWeight: '700',
    fontSize: 10,
    lineHeight: 12,
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  regPerfLblSidebar: {
    fontSize: 10,
    lineHeight: 12,
  },
  regCardFoot: {
    marginTop: 0,
    paddingTop: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    backgroundColor: Theme.surfaceGray,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 48,
  },
  regCardFootSidebar: {
    marginTop: 0,
    paddingTop: 0,
    paddingVertical: 8,
    paddingHorizontal: 12,
    minHeight: 44,
  },
  regFootSide: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  regFootSideEnd: {
    alignItems: 'flex-end',
  },
  regRatePrompt: {
    fontSize: 13,
    fontWeight: '600',
    color: Theme.textSecondary,
    lineHeight: 18,
  },
  regStarsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 2,
    flexShrink: 0,
  },
  regStarHit: {
    paddingVertical: 4,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 28,
    minHeight: 36,
  },
  regRungDotTap: {
    opacity: 1,
  },
  regFeedbackSection: {
    marginTop: 2,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
    gap: 8,
  },
  regFeedbackHeading: {
    ...FinanceTxnTypography.fieldLabel,
    fontSize: 9,
    lineHeight: 11,
    color: Theme.textMuted,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  regFeedbackTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  regFeedbackTagChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 0,
  },
  regFeedbackTagText: {
    ...FinanceTxnTypography.chipLabel,
    color: Theme.textSecondary,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  regFeedbackNote: {
    ...FinanceTxnTypography.fieldValue,
    fontSize: 12,
    lineHeight: 17,
    color: Theme.textSecondary,
    marginTop: 2,
  },
  regAuditTap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
    ...(Platform.OS === 'web'
      ? ({ cursor: 'pointer', transitionProperty: 'opacity', transitionDuration: '140ms' } as object)
      : null),
  },
  regAuditTxt: {
    ...FinanceTxnTypography.buttonLabel,
    fontSize: 10,
    fontWeight: '600',
    color: Theme.analyticsHeroBg,
  },
  regAuditTxtSidebar: {
    fontSize: 11,
    letterSpacing: 0.2,
  },
  regAuditTxtDis: { color: Theme.textMuted },
  wsPrimaryCta: {
    backgroundColor: Theme.textPrimaryDark,
    borderColor: Theme.textPrimaryDark,
    minWidth: 160,
    paddingVertical: 12,
    borderRadius: 14,
  },
  wsPrimaryCtaText: {
    color: Theme.textOnPrimary,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  wsOutlineCta: {
    backgroundColor: Theme.screenBackground,
    borderWidth: 2,
    borderColor: Theme.textPrimaryDark,
    minWidth: 220,
    paddingVertical: 14,
    borderRadius: 16,
  },
  wsOutlineCtaText: {
    color: Theme.textPrimaryDark,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  heroHeaderPulse: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 14,
    position: 'relative',
    overflow: 'hidden',
  },
  heroHeaderPulseDesktop: {
    paddingHorizontal: 28,
    paddingTop: 24,
    paddingBottom: 20,
  },
  heroGlowOnePulse: {
    position: 'absolute',
    width: 110,
    height: 110,
    borderRadius: 55,
    right: -44,
    top: -40,
  },
  heroGlowTwoPulse: {
    position: 'absolute',
    width: 96,
    height: 96,
    borderRadius: 48,
    left: -32,
    top: 32,
  },
  closeButtonPulse: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: Theme.driverWhiteMutedStrong,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  heroTopRowPulse: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingRight: 44,
  },
  avatarWrapPulse: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Theme.screenBackground,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: Theme.onPrimaryMuted,
    overflow: 'visible',
  },
  avatarWrapPulseDesktop: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  avatarBadgePulse: {
    position: 'absolute',
    right: -3,
    bottom: -3,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Theme.feedbackModalBadgeRing,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  heroTextWrapPulse: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  heroEyebrowPulse: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 3,
    textTransform: 'uppercase',
    color: Theme.textOnDarkMuted,
  },
  heroEyebrowPulseDesktop: {
    fontSize: 10,
    letterSpacing: 3.2,
  },
  heroNamePulse: {
    fontSize: 16,
    fontWeight: '900',
    fontStyle: 'italic',
    color: Theme.textOnPrimary,
    letterSpacing: -0.3,
    textTransform: 'uppercase',
  },
  heroNamePulseDesktop: {
    fontSize: 20,
    letterSpacing: -0.4,
    lineHeight: 24,
  },
  heroMetaPulse: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: 'rgba(248, 250, 252, 0.45)',
  },
  heroMetaPulseDesktop: {
    fontSize: 11,
    letterSpacing: 2.2,
  },
  modalBodyPulse: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 20,
    backgroundColor: Theme.screenBackground,
    alignItems: 'center',
    gap: 6,
  },
  modalBodyPulseDesktop: {
    paddingHorizontal: 28,
    paddingTop: 22,
    paddingBottom: 24,
    gap: 4,
  },
  ratingHeadlinePulse: {
    fontSize: 16,
    fontWeight: '900',
    fontStyle: 'italic',
    color: Theme.textPrimaryDark,
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: -0.4,
    marginBottom: 10,
    lineHeight: 21,
  },
  ratingHeadlinePulseDesktop: {
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: -0.5,
    marginBottom: 14,
  },
  offlinePartyHint: {
    fontSize: 11,
    lineHeight: 15,
    color: Theme.textMuted,
    textAlign: 'center',
    fontStyle: 'italic',
    marginBottom: 2,
    paddingHorizontal: 8,
  },
  bizFormWrap: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
    backgroundColor: Theme.screenBackground,
  },
  bizFormWrapDesktop: {
    paddingHorizontal: 24,
    paddingTop: 18,
    paddingBottom: 22,
  },
  bizTopBar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 16,
  },
  bizTopBarText: {
    flex: 1,
    minWidth: 0,
    paddingTop: 2,
  },
  bizBackBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  bizFormHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  bizLiveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Theme.positive,
    flexShrink: 0,
  },
  bizFormTitle: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
    flexShrink: 1,
    minWidth: 0,
  },
  bizFormHint: {
    fontSize: 13,
    lineHeight: 18,
    color: Theme.textSecondary,
  },
  bizPartyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 18,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.surface,
  },
  bizPartyTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  bizPartyName: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
    color: Theme.textPrimaryDark,
  },
  bizPartyMeta: {
    fontSize: 13,
    lineHeight: 18,
    color: Theme.textSecondary,
  },
  bizFieldLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    color: Theme.textSecondary,
    letterSpacing: 0.2,
    marginBottom: 8,
    alignSelf: 'flex-start',
  },
  bizFieldLabelSpaced: {
    marginTop: 16,
  },
  bizHelperHint: {
    fontSize: 12,
    lineHeight: 17,
    color: Theme.textMuted,
    marginBottom: 14,
  },
  bizPrimaryBtn: {
    marginTop: 20,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Theme.buttonDark,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    width: '100%',
  },
  bizPrimaryBtnDisabled: {
    opacity: 0.4,
  },
  bizPrimaryBtnText: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
    color: Theme.buttonDarkText,
  },
  submitErrorText: {
    marginTop: 12,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    color: Theme.negative,
  },
  regEditTap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderRadius: 8,
    flexShrink: 0,
  },
  regEditTxt: {
    fontSize: 12,
    fontWeight: '600',
    color: '#616161',
  },
  regEditedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: '#F0F0F0',
  },
  regEditedText: {
    fontSize: 9,
    fontWeight: '600',
    color: Theme.textMuted,
    letterSpacing: 0.2,
  },
  btnEditFeedback: {
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
  },
  btnEditText: {
    fontSize: 12,
    fontWeight: '500',
    color: Theme.textSecondary,
  },
  editConfirmWrap: {
    padding: 24,
    backgroundColor: Theme.screenBackground,
    borderRadius: 16,
    gap: 12,
  },
  editConfirmHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  editConfirmTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Theme.textPrimaryDark,
  },
  editConfirmDesc: {
    fontSize: 13,
    lineHeight: 18,
    color: Theme.textSecondary,
  },
  editConfirmInput: {
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.screenBackground,
    borderRadius: 14,
    padding: 12,
    fontSize: 13,
    color: Theme.textPrimaryDark,
    minHeight: 60,
    marginBottom: 8,
  },
  editConfirmActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 4,
  },
  editConfirmCancel: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  editConfirmCancelText: {
    fontSize: 13,
    fontWeight: '600',
    color: Theme.textSecondary,
  },
  editConfirmSubmit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: Theme.buttonDark,
  },
  editConfirmSubmitDisabled: {
    opacity: 0.45,
  },
  editConfirmSubmitText: {
    ...FinanceTxnTypography.buttonLabel,
    fontSize: 11,
    fontWeight: '700',
    color: Theme.buttonDarkText,
    letterSpacing: 0.75,
  },
  ratingHeadlineAccent: {
    color: Theme.primary,
    fontWeight: '900',
    fontStyle: 'italic',
  },
  starsPulse: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    alignSelf: 'stretch',
    marginBottom: 4,
  },
  starsPulseDesktop: {
    justifyContent: 'space-between',
    maxWidth: 280,
    marginBottom: 4,
  },
  starBtnPulse: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  composerSectionPulse: {
    width: '100%',
    marginTop: 4,
    gap: 12,
    alignItems: 'stretch',
  },
  tagsWrapPulse: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    gap: 8,
  },
  tagsWrapPulseDesktop: {
    gap: 8,
  },
  clientTagsWrapPulse: {
    width: '100%',
    justifyContent: 'flex-start',
    rowGap: 8,
    columnGap: 8,
  },
  clientTagsWrapPulseDesktop: {
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    gap: 8,
  },
  tagChipPulse: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
  },
  tagChipPulseDesktop: {
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  clientTagChipPulse: {
    minHeight: 40,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clientTagChipPulseDesktop: {
    width: 'auto',
    flexGrow: 0,
    flexShrink: 1,
    minWidth: 0,
    minHeight: 40,
    paddingHorizontal: 14,
  },
  tagChipPulseIdle: {
    backgroundColor: Theme.surface,
    borderColor: Theme.borderInput,
  },
  tagChipPulseActive: {
    backgroundColor: Theme.buttonPrimary,
    borderColor: Theme.primary,
  },
  tagChipTextPulse: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  tagChipTextPulseDesktop: {
    fontSize: 13,
    lineHeight: 18,
  },
  tagChipTextPulseIdle: {
    color: Theme.textSecondary,
  },
  tagChipTextPulseActive: {
    color: Theme.buttonPrimaryText,
  },
  noteTogglePulse: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 4,
  },
  noteToggleTextPulse: {
    fontSize: 12,
    fontWeight: '500',
    color: Theme.textMuted,
  },
  commentBoxWrapPulse: {
    marginTop: 6,
    marginBottom: 0,
    width: '100%',
  },
  commentInputPulse: {
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.screenBackground,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: Theme.textPrimaryDark,
    minHeight: 76,
    marginBottom: 0,
  },
  commentInputPulseDesktop: {
    minHeight: 96,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    borderRadius: 14,
  },
  commentCounterPulse: {
    fontSize: 11,
    fontWeight: '500',
    color: Theme.textMuted,
    textAlign: 'right',
  },
  modalSubmitPulse: {
    marginTop: 8,
    backgroundColor: Theme.textPrimaryDark,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 14,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  modalSubmitPulseDesktop: {
    paddingVertical: 16,
    borderRadius: 16,
    marginTop: 4,
  },
  modalSubmitTextPulse: {
    fontSize: 13,
    fontWeight: '900',
    color: Theme.textOnPrimary,
    letterSpacing: 4,
    textTransform: 'uppercase',
  },
  helperTextPulse: {
    fontSize: 11,
    fontWeight: '700',
    fontStyle: 'italic',
    color: Theme.textMuted,
    textAlign: 'center',
    marginTop: 6,
    paddingHorizontal: 12,
  },
  successWrap: {
    paddingHorizontal: 22,
    paddingVertical: 28,
    alignItems: 'center',
  },
  successIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Theme.surfaceGray,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: Theme.textPrimaryDark,
    textAlign: 'center',
  },
  successSubtitle: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: Theme.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
  },
  doneButton: {
    width: '100%',
    backgroundColor: Theme.textPrimaryDark,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: Theme.buttonDarkText,
  },
});
