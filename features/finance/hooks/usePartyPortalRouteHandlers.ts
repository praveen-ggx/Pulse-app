/**
 * Same entity mutations as Finance party portal, for modal routes that render
 * {@link PartyRegistrationPortal} (no Finance modal visibility flags).
 */
import { useOrganization } from "@/contexts/OrganizationContext";
import { useCallback, useState } from "react";
import { useFinanceAddEntityHandlers } from "./useFinanceAddEntityHandlers";

export function usePartyPortalRouteHandlers() {
  const { currentOrganization, refreshOrganization } = useOrganization();
  const [, setEntitiesRefreshKey] = useState(0);
  const noop = useCallback(() => {}, []);

  const handlers = useFinanceAddEntityHandlers({
    organizationId: currentOrganization?.id ?? null,
    organizationName: currentOrganization?.name ?? undefined,
    setEntitiesRefreshKey,
    setShowAddClientModal: noop,
    setShowAddSupplierModal: noop,
    setShowAddDriverModal: noop,
  });

  return {
    ...handlers,
    refreshOrganization,
    organizationId: currentOrganization?.id ?? null,
  };
}
