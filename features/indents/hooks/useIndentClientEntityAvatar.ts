import { useEffect, useState } from "react";

import {
  getClientById,
  getLinkedOrgProfile,
  getLinkedOrgProfilesBatch,
} from "@/features/clients/services/clients.service";
import {
  resolveIndentPartnerPublicProfile,
  type IndentPartnerPublicProfileTarget,
} from "@/features/indents/utils/indentPartnerPublicProfile.util";
import { resolvePartyAvatarIdentityFromClient } from "@/lib/entityIdentity";
import { pickPartyOrganizationImageUrl } from "@/lib/partyAvatarDisplay";
import type { LinkedOrgDisplay } from "@/lib/useLinkedOrgProfileMap";

export type IndentClientAvatarFields = {
  avatarUrl: string | null;
  avatarSeed: string | null;
  organizationImageUrl: string | null;
  organizationAvatarSeed: string | null;
  /** Secondary line under the name (contact · phone, or org). */
  detailLine: string | null;
  /** null while loading — avoids offline-role flash before resolve. */
  isIntegrated: boolean | null;
};

const EMPTY: IndentClientAvatarFields = {
  avatarUrl: null,
  avatarSeed: null,
  organizationImageUrl: null,
  organizationAvatarSeed: null,
  detailLine: null,
  isIntegrated: null,
};

function isUuid(value: string | null | undefined): boolean {
  const s = (value ?? "").trim();
  if (!s) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    s,
  );
}

function detailFromPartnerProfile(profile: {
  contactPerson?: string;
  phone?: string;
  email?: string;
  organizationName?: string;
}): string | null {
  const contact = (profile.contactPerson ?? "").trim();
  const phone = (profile.phone ?? "").trim();
  const email = (profile.email ?? "").trim();
  const org = (profile.organizationName ?? "").trim();
  if (contact && phone) return `${contact} · ${phone}`;
  if (contact) return contact;
  if (phone) return phone;
  if (email) return email;
  if (org && org !== "Connected") return org;
  return null;
}

/**
 * Resolves avatar fields for the freight card "Client entity" row.
 * Owners: client record (+ linked org). Suppliers: shipper org display via partner RPC.
 * Avatar hierarchy matches `resolvePartyAvatarIdentityFromClient` (public URL + seeds).
 */
export function useIndentClientEntityAvatar(options: {
  clientId: string | null | undefined;
  ownerOrgId: string | null;
  shipperOrgId: string | null | undefined;
  isOwner: boolean;
  enabled: boolean;
}): {
  fields: IndentClientAvatarFields;
  canOpenPublicProfile: boolean;
  publicProfileClientId: string | null;
  publicProfileTarget: IndentPartnerPublicProfileTarget | null;
} {
  const { clientId, ownerOrgId, shipperOrgId, isOwner, enabled } = options;
  const [fields, setFields] = useState<IndentClientAvatarFields>(EMPTY);
  const [publicProfileTarget, setPublicProfileTarget] =
    useState<IndentPartnerPublicProfileTarget | null>(null);

  const publicProfileClientId =
    isOwner && isUuid(clientId) ? (clientId as string) : null;
  const canOpenPublicProfile = isOwner
    ? !!publicProfileClientId
    : !!publicProfileTarget;

  useEffect(() => {
    if (!enabled) {
      setFields(EMPTY);
      setPublicProfileTarget(null);
      return;
    }

    let cancelled = false;

    async function loadOwnerClient() {
      if (!ownerOrgId || !isUuid(clientId)) return;
      const { client } = await getClientById(ownerOrgId, clientId as string);
      if (cancelled || !client) return;

      let linked: LinkedOrgDisplay | null = null;
      let detailLine: string | null = null;

      const linkedOrgId = (client.linked_organization_id ?? "").trim();
      if (linkedOrgId) {
        const { profile } = await getLinkedOrgProfile(linkedOrgId);
        if (!cancelled && profile) {
          linked = {
            avatarUrl: (profile.avatarUrl ?? "").trim() || undefined,
            avatarSeed: (profile.avatarSeed ?? "").trim() || undefined,
          };
          detailLine = detailFromPartnerProfile(profile);
        }
      }

      if (!detailLine) {
        const phone = (client.phone ?? "").trim();
        const contact = (client.contact_person ?? "").trim();
        if (contact && phone) detailLine = `${contact} · ${phone}`;
        else if (phone) detailLine = phone;
        else if (contact) detailLine = contact;
      }

      if (cancelled) return;

      const identity = resolvePartyAvatarIdentityFromClient(client, linked);
      setFields({
        avatarUrl: identity.avatarUrl ?? null,
        avatarSeed: identity.avatarSeed ?? null,
        organizationImageUrl: identity.organizationImageUrl ?? null,
        organizationAvatarSeed: identity.organizationAvatarSeed ?? null,
        detailLine,
        isIntegrated: identity.isIntegrated === true,
      });
    }

    async function loadShipperOrg() {
      const orgId = (shipperOrgId ?? "").trim();
      if (!orgId) return;

      const batch = await getLinkedOrgProfilesBatch([orgId]);
      const batchProfile = batch[orgId];
      if (batchProfile) {
        if (cancelled) return;
        setFields({
          avatarUrl: null,
          avatarSeed: null,
          organizationImageUrl: pickPartyOrganizationImageUrl({
            logoUrl: batchProfile.logoUrl,
            organizationImageUrl: batchProfile.avatarUrl,
          }),
          organizationAvatarSeed:
            (batchProfile.orgAvatarSeed ?? "").trim() || null,
          detailLine: detailFromPartnerProfile(batchProfile),
          isIntegrated: true,
        });
        return;
      }

      const { profile } = await getLinkedOrgProfile(orgId);
      if (cancelled || !profile) return;
      setFields({
        avatarUrl: null,
        avatarSeed: null,
        organizationImageUrl: pickPartyOrganizationImageUrl({
          organizationImageUrl: profile.avatarUrl,
        }),
        organizationAvatarSeed: (profile.avatarSeed ?? "").trim() || null,
        detailLine: detailFromPartnerProfile(profile),
        isIntegrated: true,
      });
    }

    async function loadSupplierPublicProfileTarget() {
      const viewerOrgId = (ownerOrgId ?? "").trim();
      const partnerOrgId = (shipperOrgId ?? "").trim();
      if (!viewerOrgId || !partnerOrgId) return;
      const target = await resolveIndentPartnerPublicProfile(
        viewerOrgId,
        partnerOrgId,
      );
      if (!cancelled) setPublicProfileTarget(target);
    }

    setFields(EMPTY);
    setPublicProfileTarget(null);

    if (isOwner) {
      void loadOwnerClient();
    } else {
      void loadShipperOrg();
      void loadSupplierPublicProfileTarget();
    }

    return () => {
      cancelled = true;
    };
  }, [clientId, ownerOrgId, shipperOrgId, isOwner, enabled]);

  return {
    fields,
    canOpenPublicProfile,
    publicProfileClientId,
    publicProfileTarget,
  };
}
