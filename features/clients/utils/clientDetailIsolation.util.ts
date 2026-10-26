export type ClientPageIdentity = {
  orgId: string | null;
  clientId: string | null;
};

export function shouldAcceptClientPageWrite(
  active: ClientPageIdentity,
  incoming: ClientPageIdentity,
): boolean {
  const org = (active.orgId ?? "").trim();
  const client = (active.clientId ?? "").trim();
  return (
    org.length > 0 &&
    client.length > 0 &&
    org === (incoming.orgId ?? "").trim() &&
    client === (incoming.clientId ?? "").trim()
  );
}

export function emptyClientPagePartyState() {
  return {
    trips: [] as never[],
    transactions: [] as never[],
    allOrgTransactions: [] as never[],
    suppliers: [] as never[],
    drivers: [] as never[],
    organizationClients: [] as never[],
    tripSubcontractByTripId: {} as Record<string, never>,
    partnerOrgNamesByOrgId: {} as Record<string, string>,
    partnerOrgBrandingByOrgId: {} as Record<string, never>,
  };
}
