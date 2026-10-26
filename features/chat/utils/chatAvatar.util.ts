import type { IntegratedChat } from "@/features/chat/contexts/IntegratedChatContext";
import type {
  ConversationPartyType,
  TripConversation,
  TripMessageRow,
} from "@/features/chat/types/chat.types";
import type { TripForCompose } from "@/features/chat/services/chat.service";
import type { ResolvedPartyAvatarIdentity } from "@/lib/entityIdentity";
import {
  driverAvatarSeedFromId,
  type PartyEntityType,
} from "@/lib/partyAvatarDisplay";
import type { LinkedOrgDisplay } from "@/lib/useLinkedOrgProfileMap";

export type ChatOrgBranding =
  | LinkedOrgDisplay
  | {
      logoUrl?: string | null;
      orgAvatarSeed?: string | null;
      avatarUrl?: string | null;
      avatarSeed?: string | null;
    };

export function partyEntityTypeFromConversation(
  partyType: ConversationPartyType,
): PartyEntityType {
  if (partyType === "driver") return "driver";
  if (partyType === "supplier") return "supplier";
  return "client";
}

function linkedOrgBrandingFields(
  linkedOrgId: string | null | undefined,
  brandingMap: Record<string, ChatOrgBranding>,
): Pick<
  ResolvedPartyAvatarIdentity,
  "organizationImageUrl" | "organizationAvatarSeed"
> {
  const id = (linkedOrgId ?? "").trim();
  if (!id) return {};
  const branding = brandingMap[id];
  if (!branding) return {};
  const logo =
    "logoUrl" in branding
      ? (branding.logoUrl ?? "").trim() || null
      : (branding.avatarUrl ?? "").trim() || null;
  const seed =
    "orgAvatarSeed" in branding
      ? (branding.orgAvatarSeed ?? "").trim() || null
      : (branding.avatarSeed ?? "").trim() || null;
  return {
    organizationImageUrl: logo,
    organizationAvatarSeed: seed,
  };
}

function hasOrgBranding(
  fields: Pick<
    ResolvedPartyAvatarIdentity,
    "organizationImageUrl" | "organizationAvatarSeed"
  >,
): boolean {
  return Boolean(
    (fields.organizationImageUrl ?? "").trim() ||
      (fields.organizationAvatarSeed ?? "").trim(),
  );
}

export { driverAvatarSeedFromId } from "@/lib/partyAvatarDisplay";

function resolveDriverAvatarIdentity(params: {
  driverId: string | null | undefined;
  displayName: string;
  avatarUrl?: string | null;
  avatarSeed?: string | null;
}): ResolvedPartyAvatarIdentity {
  const driverId = (params.driverId ?? "").trim() || null;
  const url = (params.avatarUrl ?? "").trim() || null;
  const dbSeed = (params.avatarSeed ?? "").trim() || null;
  return {
    displayName: params.displayName,
    entityType: "driver",
    avatarUrl: url,
    avatarSeed: dbSeed || (driverId ? driverAvatarSeedFromId(driverId) : null),
  };
}

function resolveClientAvatarIdentity(params: {
  displayName: string;
  clientId: string | null | undefined;
  composeTrip: TripForCompose | null | undefined;
  brandingMap: Record<string, ChatOrgBranding>;
}): ResolvedPartyAvatarIdentity {
  const linkedOrgId = params.composeTrip?.client_linked_organization_id ?? null;
  const orgFields = linkedOrgBrandingFields(linkedOrgId, params.brandingMap);
  const contactUrl =
    params.clientId &&
    params.composeTrip?.client_id === params.clientId
      ? (params.composeTrip.client_avatar_url ?? "").trim() || null
      : null;
  const contactSeed =
    params.clientId &&
    params.composeTrip?.client_id === params.clientId
      ? (params.composeTrip.client_avatar_seed ?? "").trim() || null
      : null;

  return {
    displayName: params.displayName,
    entityType: "client",
    ...orgFields,
    avatarUrl: hasOrgBranding(orgFields) ? null : contactUrl,
    avatarSeed: hasOrgBranding(orgFields) ? null : contactSeed,
    isIntegrated: Boolean((linkedOrgId ?? "").trim()),
  };
}

function resolveSupplierAvatarIdentity(params: {
  displayName: string;
  supplierId: string | null | undefined;
  composeTrip: TripForCompose | null | undefined;
  brandingMap: Record<string, ChatOrgBranding>;
}): ResolvedPartyAvatarIdentity {
  const linkedOrgId = params.composeTrip?.supplier_linked_organization_id ?? null;
  const orgFields = linkedOrgBrandingFields(linkedOrgId, params.brandingMap);
  const contactUrl =
    params.supplierId &&
    params.composeTrip?.supplier_id === params.supplierId
      ? (params.composeTrip.supplier_avatar_url ?? "").trim() || null
      : null;
  const contactSeed =
    params.supplierId &&
    params.composeTrip?.supplier_id === params.supplierId
      ? (params.composeTrip.supplier_avatar_seed ?? "").trim() || null
      : null;

  return {
    displayName: params.displayName,
    entityType: "supplier",
    ...orgFields,
    avatarUrl: hasOrgBranding(orgFields) ? null : contactUrl,
    avatarSeed: hasOrgBranding(orgFields) ? null : contactSeed,
    isIntegrated: Boolean((linkedOrgId ?? "").trim()),
  };
}

export function resolveNetworkPartnerAvatar(
  chat: Pick<
    IntegratedChat,
    "partnerId" | "partnerName" | "partnerLogoUrl" | "partnerAvatarSeed"
  >,
): ResolvedPartyAvatarIdentity {
  return {
    displayName: chat.partnerName,
    entityType: "client",
    organizationImageUrl: chat.partnerLogoUrl ?? null,
    organizationAvatarSeed: chat.partnerAvatarSeed ?? null,
    avatarUrl: null,
    avatarSeed: chat.partnerAvatarSeed ?? null,
  };
}

function normalizePartyLabelKey(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Linked org user is the trip's integrated client (shipper-hosted trip). */
export function viewerIsLinkedTripClientViewer(params: {
  clientLanePartyName: string | null | undefined;
  viewerOrgId: string;
  viewerOrgName: string | null | undefined;
  tripHostOrgId: string | null | undefined;
  composeClientLinkedOrgId: string | null | undefined;
}): boolean {
  const v = params.viewerOrgId.trim();
  const host = (params.tripHostOrgId ?? "").trim();
  if (!v || !host || v === host) return false;
  const linked = (params.composeClientLinkedOrgId ?? "").trim();
  if (linked && v === linked) return true;
  const pn = normalizePartyLabelKey(params.clientLanePartyName);
  const on = normalizePartyLabelKey(params.viewerOrgName);
  return pn.length > 0 && on.length > 0 && pn === on;
}

/** Linked org user is the trip's integrated supplier. */
export function viewerIsLinkedTripSupplierViewer(params: {
  supplierLanePartyName: string | null | undefined;
  viewerOrgId: string;
  viewerOrgName: string | null | undefined;
  tripHostOrgId: string | null | undefined;
  composeSupplierLinkedOrgId: string | null | undefined;
}): boolean {
  const v = params.viewerOrgId.trim();
  const host = (params.tripHostOrgId ?? "").trim();
  if (!v || !host || v === host) return false;
  const linked = (params.composeSupplierLinkedOrgId ?? "").trim();
  if (linked && v === linked) return true;
  const pn = normalizePartyLabelKey(params.supplierLanePartyName);
  const on = normalizePartyLabelKey(params.viewerOrgName);
  return pn.length > 0 && on.length > 0 && pn === on;
}

export type TripConversationAvatarViewerContext = {
  viewerOrgId?: string | null;
  viewerOrgName?: string | null;
  tripHostOrgId?: string | null;
};

const TRIP_AVATAR_FALLBACK_ORDER: ConversationPartyType[] = [
  "client",
  "supplier",
  "driver",
];

function resolveTripConversationPartyAvatar(
  conv: Pick<
    TripConversation,
    "party_type" | "party_name" | "client_id" | "supplier_id" | "driver_id"
  >,
  composeTrip: TripForCompose | null | undefined,
  brandingMap: Record<string, ChatOrgBranding>,
): ResolvedPartyAvatarIdentity {
  const name = (conv.party_name ?? "").trim() || "Partner";

  if (conv.party_type === "driver") {
    const driverId = composeTrip?.driver_id ?? conv.driver_id ?? null;
    const displayName =
      (composeTrip?.driver_display_name ?? "").trim() || name || "Driver";
    return resolveDriverAvatarIdentity({
      driverId,
      displayName,
      avatarUrl: composeTrip?.driver_avatar_url,
      avatarSeed: composeTrip?.driver_avatar_seed,
    });
  }

  if (conv.party_type === "supplier") {
    return resolveSupplierAvatarIdentity({
      displayName: name,
      supplierId: conv.supplier_id,
      composeTrip,
      brandingMap,
    });
  }

  return resolveClientAvatarIdentity({
    displayName: name,
    clientId: conv.client_id,
    composeTrip,
    brandingMap,
  });
}

function tripPartyExistsOnCompose(
  partyType: ConversationPartyType,
  conv: Pick<
    TripConversation,
    "client_id" | "supplier_id" | "driver_id"
  >,
  composeTrip: TripForCompose | null | undefined,
): boolean {
  if (partyType === "driver") {
    return Boolean(String(composeTrip?.driver_id ?? conv.driver_id ?? "").trim());
  }
  if (partyType === "client") {
    return Boolean(String(composeTrip?.client_id ?? conv.client_id ?? "").trim());
  }
  return Boolean(String(composeTrip?.supplier_id ?? conv.supplier_id ?? "").trim());
}

function syntheticConvForParty(
  partyType: ConversationPartyType,
  conv: Pick<
    TripConversation,
    "party_type" | "party_name" | "client_id" | "supplier_id" | "driver_id"
  >,
  composeTrip: TripForCompose | null | undefined,
): Pick<
  TripConversation,
  "party_type" | "party_name" | "client_id" | "supplier_id" | "driver_id"
> {
  if (partyType === "driver") {
    return {
      party_type: "driver",
      party_name:
        (composeTrip?.driver_display_name ?? conv.party_name ?? "").trim() ||
        "Driver",
      client_id: conv.client_id,
      supplier_id: conv.supplier_id,
      driver_id: composeTrip?.driver_id ?? conv.driver_id ?? null,
    };
  }
  if (partyType === "client") {
    return {
      party_type: "client",
      party_name:
        (composeTrip?.client_name ?? conv.party_name ?? "").trim() || "Client",
      client_id: composeTrip?.client_id ?? conv.client_id ?? null,
      supplier_id: conv.supplier_id,
      driver_id: conv.driver_id,
    };
  }
  return {
    party_type: "supplier",
    party_name:
      (composeTrip?.supplier_name ?? conv.party_name ?? "").trim() ||
      "Supplier",
    client_id: conv.client_id,
    supplier_id: composeTrip?.supplier_id ?? conv.supplier_id ?? null,
    driver_id: conv.driver_id,
  };
}

function viewerIsSelfTripParty(
  partyType: ConversationPartyType,
  conv: Pick<TripConversation, "party_name">,
  composeTrip: TripForCompose | null | undefined,
  viewerContext: TripConversationAvatarViewerContext,
): boolean {
  const viewerOrgId = (viewerContext.viewerOrgId ?? "").trim();
  if (!viewerOrgId) return false;

  if (partyType === "client") {
    return viewerIsLinkedTripClientViewer({
      clientLanePartyName:
        composeTrip?.client_name ?? conv.party_name ?? null,
      viewerOrgId,
      viewerOrgName: viewerContext.viewerOrgName ?? null,
      tripHostOrgId: viewerContext.tripHostOrgId ?? null,
      composeClientLinkedOrgId: composeTrip?.client_linked_organization_id ?? null,
    });
  }

  if (partyType === "supplier") {
    return viewerIsLinkedTripSupplierViewer({
      supplierLanePartyName:
        composeTrip?.supplier_name ?? conv.party_name ?? null,
      viewerOrgId,
      viewerOrgName: viewerContext.viewerOrgName ?? null,
      tripHostOrgId: viewerContext.tripHostOrgId ?? null,
      composeSupplierLinkedOrgId:
        composeTrip?.supplier_linked_organization_id ?? null,
    });
  }

  return false;
}

/** Driver avatar for unified trip team room inbox rows. */
export function resolveTripRoomDriverAvatar(params: {
  driverId?: string | null;
  title?: string | null;
  composeTrip?: TripForCompose | null;
}): ResolvedPartyAvatarIdentity {
  const driverId = params.driverId ?? params.composeTrip?.driver_id ?? null;
  const displayName =
    params.composeTrip?.driver_display_name?.trim() ||
    params.title?.trim() ||
    "Driver";
  return resolveDriverAvatarIdentity({
    driverId,
    displayName,
    avatarUrl: params.composeTrip?.driver_avatar_url,
    avatarSeed: params.composeTrip?.driver_avatar_seed,
  });
}

/**
 * Stable lane / list / header avatar for a trip conversation.
 * Assigned driver DP wins for every lane; without a driver, show the lane party
 * unless that party is the viewer — then fall back to the next counterparty.
 */
export function resolveTripConversationAvatar(
  conv: Pick<
    TripConversation,
    "party_type" | "party_name" | "client_id" | "supplier_id" | "driver_id"
  >,
  composeTrip: TripForCompose | null | undefined,
  brandingMap: Record<string, ChatOrgBranding>,
  viewerContext?: TripConversationAvatarViewerContext,
): ResolvedPartyAvatarIdentity {
  const driverId = composeTrip?.driver_id ?? conv.driver_id ?? null;
  if (String(driverId ?? "").trim()) {
    const displayName =
      (composeTrip?.driver_display_name ?? "").trim() ||
      (conv.party_type === "driver" ? (conv.party_name ?? "").trim() : "") ||
      "Driver";
    return resolveDriverAvatarIdentity({
      driverId,
      displayName,
      avatarUrl: composeTrip?.driver_avatar_url,
      avatarSeed: composeTrip?.driver_avatar_seed,
    });
  }

  const laneAvatar = resolveTripConversationPartyAvatar(
    conv,
    composeTrip,
    brandingMap,
  );
  if (!viewerContext?.viewerOrgId?.trim()) {
    return laneAvatar;
  }

  if (!viewerIsSelfTripParty(conv.party_type, conv, composeTrip, viewerContext)) {
    return laneAvatar;
  }

  for (const partyType of TRIP_AVATAR_FALLBACK_ORDER) {
    if (partyType === conv.party_type) continue;
    if (!tripPartyExistsOnCompose(partyType, conv, composeTrip)) continue;
    if (viewerIsSelfTripParty(partyType, conv, composeTrip, viewerContext)) {
      continue;
    }
    return resolveTripConversationPartyAvatar(
      syntheticConvForParty(partyType, conv, composeTrip),
      composeTrip,
      brandingMap,
    );
  }

  return laneAvatar;
}

function cleanSystemUpdateDriverName(name: string): string | null {
  const n = name
    .trim()
    .replace(/\.$/, "")
    .replace(/\s*[-–—]\s*Driver\s*$/i, "")
    .trim();
  if (!n || /^(the driver|driver|assigned|tbd)$/i.test(n)) return null;
  return n;
}

/** Parse driver name from assignment / status broadcast copy in trip chat. */
export function extractDriverNameFromSystemUpdateContent(
  content: string,
): string | null {
  const c = (content ?? "").trim();
  if (!c) return null;

  let m = c.match(
    /assigned\.\s*(?:Driver\s+)?([A-Za-z][A-Za-z\s.'-]{0,40}?)\s+will report shortly/i,
  );
  if (m?.[1]) return cleanSystemUpdateDriverName(m[1]);

  m = c.match(/^([A-Za-z][A-Za-z\s.'-]{0,40}?)\s+assigned as driver/i);
  if (m?.[1]) return cleanSystemUpdateDriverName(m[1]);

  m = c.match(/Driver changed from .+ to ([A-Za-z][A-Za-z\s.'-]+)/i);
  if (m?.[1]) return cleanSystemUpdateDriverName(m[1]);

  m = c.match(/Driver reassigned to ([A-Za-z][A-Za-z\s.'-]+)/i);
  if (m?.[1]) return cleanSystemUpdateDriverName(m[1]);

  m = c.match(/Driver reassigned to ([A-Za-z][A-Za-z\s.'-]+)/i);
  if (m?.[1]) return cleanSystemUpdateDriverName(m[1]);

  m = c.match(/^Driver\s+([A-Za-z][A-Za-z\s.'-]+)\s+unassigned/i);
  if (m?.[1]) return cleanSystemUpdateDriverName(m[1]);

  m = c.match(
    /([A-Za-z][A-Za-z\s.'-]{0,40}?)\s+has accepted the trip and is heading to pickup/i,
  );
  if (m?.[1]) return cleanSystemUpdateDriverName(m[1]);

  return null;
}

function readAssignmentEventPayload(
  meta: Record<string, unknown> | null,
): Record<string, unknown> | null {
  const ep = meta?.event_payload;
  if (ep && typeof ep === "object" && !Array.isArray(ep)) {
    return ep as Record<string, unknown>;
  }
  return meta;
}

export type AssignmentDriverProfileRef = {
  displayName?: string;
  avatarUrl?: string | null;
  avatarSeed?: string | null;
};

export type SystemUpdateDriverContext = {
  composeTrip?: Pick<
    TripForCompose,
    | "driver_id"
    | "driver_display_name"
    | "driver_avatar_url"
    | "driver_avatar_seed"
  > | null;
  /** Driver photos keyed by id — from assignment audit resolution. */
  driverProfiles?: Record<string, AssignmentDriverProfileRef>;
};

function driverProfileFromContext(
  driverId: string | null | undefined,
  context?: SystemUpdateDriverContext,
): AssignmentDriverProfileRef | null {
  const id = (driverId ?? "").trim();
  if (!id || !context?.driverProfiles) return null;
  return context.driverProfiles[id] ?? null;
}

/** Driver avatar for SYSTEM UPDATE cards (assignment + assigned status broadcasts). */
export function resolveSystemUpdateDriverAvatar(
  message: Pick<TripMessageRow, "content" | "metadata">,
  context?: SystemUpdateDriverContext,
): ResolvedPartyAvatarIdentity | null {
  const meta = (message.metadata ?? null) as Record<string, unknown> | null;
  const ep = readAssignmentEventPayload(meta);

  const driverId =
    (typeof ep?.driver_id_new === "string" ? ep.driver_id_new : null) ||
    (typeof meta?.driver_id_new === "string" ? meta.driver_id_new : null) ||
    (context?.composeTrip?.driver_id ?? null);

  const metaName =
    (typeof ep?.driver_display_name === "string"
      ? ep.driver_display_name
      : null
    )?.trim() || null;
  const metaAvatarUrl =
    (typeof ep?.driver_avatar_url === "string" ? ep.driver_avatar_url : null) ||
    (typeof meta?.driver_avatar_url === "string" ? meta.driver_avatar_url : null);
  const metaAvatarSeed =
    (typeof ep?.driver_avatar_seed === "string"
      ? ep.driver_avatar_seed
      : null) ||
    (typeof meta?.driver_avatar_seed === "string"
      ? meta.driver_avatar_seed
      : null);

  const contentName = extractDriverNameFromSystemUpdateContent(
    message.content ?? "",
  );
  const composeName =
    (context?.composeTrip?.driver_display_name ?? "").trim() || null;
  const profile = driverProfileFromContext(driverId, context);

  let displayName =
    metaName ||
    profile?.displayName ||
    contentName ||
    (driverId &&
    composeName &&
    context?.composeTrip?.driver_id === driverId
      ? composeName
      : null) ||
    composeName;

  if (displayName && /^(driver|assigned|the driver)$/i.test(displayName)) {
    displayName = contentName || profile?.displayName || null;
  }

  if (!driverId && !displayName) return null;

  const composeTrip = context?.composeTrip;
  const composeDriverId = (composeTrip?.driver_id ?? "").trim() || null;
  const useComposeAvatar =
    Boolean(composeTrip) &&
    (!driverId || !composeDriverId || composeDriverId === driverId);

  return resolveDriverAvatarIdentity({
    driverId: driverId || composeDriverId,
    displayName: displayName ?? "Driver",
    avatarUrl:
      metaAvatarUrl ||
      profile?.avatarUrl ||
      (useComposeAvatar ? composeTrip?.driver_avatar_url : null),
    avatarSeed:
      metaAvatarSeed ||
      profile?.avatarSeed ||
      (useComposeAvatar ? composeTrip?.driver_avatar_seed : null),
  });
}

export type DriverSwapPair = {
  previous: ResolvedPartyAvatarIdentity;
  next: ResolvedPartyAvatarIdentity;
};

/** Inbox / list preview for driver reassignment rows. */
export function isDriverSwapPreviewMessage(
  message: Pick<TripMessageRow, "content" | "message_type"> | null | undefined,
): boolean {
  if (!message) return false;
  const content = (message.content ?? "").trim();
  if (/Driver changed from|Driver reassigned to/i.test(content)) return true;
  return message.message_type === "assignment_update" && content.length > 0;
}

export function stripChatPreviewEmojiPrefix(text: string): string {
  return text.replace(/^(?:🚚|📋|📄|💰|📍)\s*/u, "").trim();
}

/** Parse old + new driver names from assignment swap copy. */
export function extractDriverSwapNamesFromContent(content: string): {
  previousName: string | null;
  nextName: string | null;
} {
  const c = (content ?? "").trim();
  if (!c) return { previousName: null, nextName: null };

  let m = c.match(/Driver changed from (.+?) to ([^.]+)\./i);
  if (m?.[1] && m?.[2]) {
    return {
      previousName: cleanSystemUpdateDriverName(m[1]),
      nextName: cleanSystemUpdateDriverName(m[2]),
    };
  }

  m = c.match(/Driver reassigned to ([^.]+)\./i);
  if (m?.[1]) {
    return {
      previousName: null,
      nextName: cleanSystemUpdateDriverName(m[1]),
    };
  }

  return { previousName: null, nextName: null };
}

function readDriverSwapIds(
  meta: Record<string, unknown> | null,
): { prevId: string | null; newId: string | null } {
  const ep = readAssignmentEventPayload(meta);
  const prevId =
    (typeof ep?.driver_id_prev === "string" ? ep.driver_id_prev : null) ||
    (typeof meta?.driver_id_prev === "string" ? meta.driver_id_prev : null);
  const newId =
    (typeof ep?.driver_id_new === "string" ? ep.driver_id_new : null) ||
    (typeof meta?.driver_id_new === "string" ? meta.driver_id_new : null);
  return { prevId, newId };
}

/** Both driver avatars for assignment swap cards (old → new). */
export function resolveDriverSwapAvatars(
  message: Pick<TripMessageRow, "content" | "metadata" | "message_type">,
  context?: SystemUpdateDriverContext,
): DriverSwapPair | null {
  const content = (message.content ?? "").trim();
  const meta = (message.metadata ?? null) as Record<string, unknown> | null;
  const ep = readAssignmentEventPayload(meta);
  const { prevId, newId } = readDriverSwapIds(meta);

  const composeTrip = context?.composeTrip;
  const composeDriverId = (composeTrip?.driver_id ?? "").trim() || null;

  const swapFromContent = /Driver changed from/i.test(content);
  const reassignFromContent = /Driver reassigned to/i.test(content);
  const idsDiffer =
    Boolean(prevId && newId && prevId !== newId);

  if (!swapFromContent && !reassignFromContent && !idsDiffer) return null;
  if (swapFromContent && !prevId && !newId) {
    const names = extractDriverSwapNamesFromContent(content);
    if (!names.previousName || !names.nextName) return null;
    const nextNameKey = names.nextName.trim().toLowerCase();
    const composeName = (composeTrip?.driver_display_name ?? "").trim().toLowerCase();
    const nextMatchesCompose =
      Boolean(composeName) && composeName === nextNameKey;
    return {
      previous: resolveDriverAvatarIdentity({
        driverId: null,
        displayName: names.previousName,
      }),
      next: resolveDriverAvatarIdentity({
        driverId: nextMatchesCompose ? composeDriverId : null,
        displayName: names.nextName,
        avatarUrl: nextMatchesCompose ? composeTrip?.driver_avatar_url : null,
        avatarSeed: nextMatchesCompose ? composeTrip?.driver_avatar_seed : null,
      }),
    };
  }
  if (!prevId || !newId || prevId === newId) return null;

  const names = extractDriverSwapNamesFromContent(content);
  const metaPrevName =
    (typeof ep?.driver_display_name_prev === "string"
      ? ep.driver_display_name_prev
      : null
    )?.trim() || null;
  const metaNewName =
    (typeof ep?.driver_display_name === "string"
      ? ep.driver_display_name
      : null
    )?.trim() || null;
  const metaNewAvatarUrl =
    (typeof ep?.driver_avatar_url === "string" ? ep.driver_avatar_url : null) ||
    (typeof meta?.driver_avatar_url === "string" ? meta.driver_avatar_url : null);
  const metaNewAvatarSeed =
    (typeof ep?.driver_avatar_seed === "string"
      ? ep.driver_avatar_seed
      : null) ||
    (typeof meta?.driver_avatar_seed === "string"
      ? meta.driver_avatar_seed
      : null);
  const metaPrevAvatarUrl =
    typeof ep?.driver_avatar_url_prev === "string"
      ? ep.driver_avatar_url_prev
      : null;
  const metaPrevAvatarSeed =
    typeof ep?.driver_avatar_seed_prev === "string"
      ? ep.driver_avatar_seed_prev
      : null;

  const useComposeForNew =
    Boolean(composeTrip) &&
    (!newId || !composeDriverId || composeDriverId === newId);

  const prevProfile = driverProfileFromContext(prevId, context);
  const nextProfile = driverProfileFromContext(newId, context);

  const previous = resolveDriverAvatarIdentity({
    driverId: prevId,
    displayName:
      names.previousName ||
      metaPrevName ||
      prevProfile?.displayName ||
      "Driver",
    avatarUrl: metaPrevAvatarUrl || prevProfile?.avatarUrl,
    avatarSeed: metaPrevAvatarSeed || prevProfile?.avatarSeed,
  });

  const next = resolveDriverAvatarIdentity({
    driverId: newId,
    displayName:
      names.nextName ||
      metaNewName ||
      nextProfile?.displayName ||
      extractDriverNameFromSystemUpdateContent(content) ||
      (useComposeForNew ? composeTrip?.driver_display_name : null) ||
      "Driver",
    avatarUrl:
      metaNewAvatarUrl ||
      nextProfile?.avatarUrl ||
      (useComposeForNew ? composeTrip?.driver_avatar_url : null),
    avatarSeed:
      metaNewAvatarSeed ||
      nextProfile?.avatarSeed ||
      (useComposeForNew ? composeTrip?.driver_avatar_seed : null),
  });

  return { previous, next };
}

export type LocationPingDriverContext = SystemUpdateDriverContext & {
  /** `trip_conversations.driver_id` or live trip driver when metadata omits it. */
  conversationDriverId?: string | null;
};

/** Driver avatar for location / tracking pings (always prefers trip driver context). */
export function resolveLocationPingDriverAvatar(
  message: Pick<TripMessageRow, "content" | "metadata">,
  context?: LocationPingDriverContext,
): ResolvedPartyAvatarIdentity {
  const composeTrip = context?.composeTrip;
  const driverId =
    (composeTrip?.driver_id ?? "").trim() ||
    (context?.conversationDriverId ?? "").trim() ||
    null;
  const displayName =
    (composeTrip?.driver_display_name ?? "").trim() ||
    resolveSystemUpdateDriverAvatar(message, context)?.displayName?.trim() ||
    "Driver";

  return resolveDriverAvatarIdentity({
    driverId,
    displayName,
    avatarUrl: composeTrip?.driver_avatar_url,
    avatarSeed: composeTrip?.driver_avatar_seed,
  });
}

export function resolveTripMessagePeerAvatar(params: {
  message: Pick<TripMessageRow, "sender_role" | "sender_name" | "sender_avatar_seed">;
  conversationPartyType: ConversationPartyType;
  composeTrip: TripForCompose | null | undefined;
  brandingMap: Record<string, ChatOrgBranding>;
  fallbackName: string;
  driverId?: string | null;
  clientId?: string | null;
  supplierId?: string | null;
}): ResolvedPartyAvatarIdentity {
  const role = params.message.sender_role;
  const displayName =
    (params.message.sender_name ?? "").trim() ||
    params.fallbackName ||
    "Partner";

  if (role === "driver") {
    const driverId =
      params.driverId ?? params.composeTrip?.driver_id ?? null;
    return resolveDriverAvatarIdentity({
      driverId,
      displayName,
      avatarUrl: params.composeTrip?.driver_avatar_url,
      avatarSeed: params.composeTrip?.driver_avatar_seed,
    });
  }

  if (role === "client") {
    return resolveClientAvatarIdentity({
      displayName,
      clientId: params.clientId ?? params.composeTrip?.client_id ?? null,
      composeTrip: params.composeTrip,
      brandingMap: params.brandingMap,
    });
  }

  if (role === "supplier") {
    return resolveSupplierAvatarIdentity({
      displayName,
      supplierId: params.supplierId ?? params.composeTrip?.supplier_id ?? null,
      composeTrip: params.composeTrip,
      brandingMap: params.brandingMap,
    });
  }

  const entityType = partyEntityTypeFromConversation(params.conversationPartyType);

  let linkedOrgId: string | null = null;
  if (entityType === "client") {
    linkedOrgId = params.composeTrip?.client_linked_organization_id ?? null;
  } else if (entityType === "supplier") {
    linkedOrgId = params.composeTrip?.supplier_linked_organization_id ?? null;
  }

  return {
    displayName,
    entityType,
    ...linkedOrgBrandingFields(linkedOrgId, params.brandingMap),
    avatarSeed: (params.message.sender_avatar_seed ?? "").trim() || null,
  };
}
