import { resolveWizardContactPhone } from "@/features/clients/utils/clientContactDisplay.util";

/** Normalize party / assigner names for match (case, spacing). */
export function normalizePartyName(name: string | null | undefined): string {
  return String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** True when a saved party is the fleet / assigned-by name. */
export function partyMatchesAssigner(
  partyName: string,
  assignerName: string | null | undefined,
): boolean {
  const assigner = normalizePartyName(assignerName);
  const party = normalizePartyName(partyName);
  if (!assigner || !party) return false;
  return assigner === party || assigner.includes(party) || party.includes(assigner);
}

type SortableParty = {
  name: string;
  matchesAssigner?: boolean;
  linkedToTrip?: boolean;
};

/**
 * Non-DCO: fleet assigner first (recommended), then the tagged party.
 * DCO: tagged party first, then assigner match.
 */
export function sortTagPartyOptions<T extends SortableParty>(
  rows: readonly T[],
  recommendFleetFirst: boolean,
): T[] {
  return [...rows].sort((a, b) => {
    if (recommendFleetFirst) {
      if (a.matchesAssigner !== b.matchesAssigner) return a.matchesAssigner ? -1 : 1;
      if (a.linkedToTrip !== b.linkedToTrip) return a.linkedToTrip ? -1 : 1;
    } else {
      if (a.linkedToTrip !== b.linkedToTrip) return a.linkedToTrip ? -1 : 1;
      if (a.matchesAssigner !== b.matchesAssigner) return a.matchesAssigner ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
}

/** Picker subtitle. Never surface linked-org placeholder phones or raw UUIDs. */
export function tagPartyListDetail(input: {
  phone?: string | null;
  contactPerson?: string | null;
  linkedOrganizationId?: string | null;
  matchesAssigner?: boolean;
  linkedToTrip?: boolean;
  recommendFleet?: boolean;
}): string {
  if (input.linkedToTrip) return "Tagged to this trip";
  const phone = resolveWizardContactPhone(input.phone);
  const contact = String(input.contactPerson ?? "").trim();
  const identity =
    contact && phone && contact.toLowerCase() !== phone.toLowerCase()
      ? `${contact} · ${phone}`
      : phone || contact || (input.linkedOrganizationId ? "Linked on Pulse" : "Saved in Self");
  if (input.recommendFleet && input.matchesAssigner && identity === "Saved in Self") {
    return "Recommended · Fleet";
  }
  if (input.recommendFleet && input.matchesAssigner) {
    return `Recommended · Fleet · ${identity}`;
  }
  return identity;
}
