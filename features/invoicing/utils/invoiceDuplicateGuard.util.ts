/**
 * A trip belongs to one open draft and one issued invoice.
 * Draft save reuses that draft. Issue stops and says how to clear the trip.
 */

export type GuardInvoice = {
  id: string;
  invoiceNumber: string;
  tripIds: string[];
};

export type DraftSavePlan =
  | { action: "insert" }
  | { action: "update"; draftId: string; invoiceNumber: string }
  | { action: "blocked"; message: string };

function unique(ids: readonly string[]): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
}

function sharesTrip(invoice: GuardInvoice, tripIds: readonly string[]): boolean {
  const wanted = new Set(tripIds);
  return invoice.tripIds.some((id) => wanted.has(id));
}

export function planDraftSave(args: {
  tripIds: readonly string[];
  drafts: readonly GuardInvoice[];
  activeDraftId?: string | null;
}): DraftSavePlan {
  const tripIds = unique(args.tripIds);
  const activeId = args.activeDraftId?.trim() || null;
  const others = args.drafts.filter((draft) => draft.id !== activeId && sharesTrip(draft, tripIds));
  if (others.length > 1 || (others.length === 1 && activeId && others[0].id !== activeId)) {
    const lines = others.map((draft) => {
      const count = draft.tripIds.filter((id) => tripIds.includes(id)).length;
      const name = draft.invoiceNumber.trim() || "A draft";
      return `${name} already includes ${count} of these trips. Open that draft, or cancel it before drafting again.`;
    });
    return { action: "blocked", message: lines.join("\n") };
  }
  if (others.length === 1) {
    return {
      action: "update",
      draftId: others[0].id,
      invoiceNumber: others[0].invoiceNumber,
    };
  }
  if (activeId) {
    const active = args.drafts.find((draft) => draft.id === activeId);
    return {
      action: "update",
      draftId: activeId,
      invoiceNumber: active?.invoiceNumber ?? "",
    };
  }
  return { action: "insert" };
}

export function alreadyInvoicedGuidance(args: {
  tripIds: readonly string[];
  invoices: readonly GuardInvoice[];
  labelForTrip?: (tripId: string) => string;
}): string | null {
  const tripIds = unique(args.tripIds);
  const groups = new Map<string, { invoice: GuardInvoice; labels: string[] }>();
  for (const tripId of tripIds) {
    const invoice = args.invoices.find((row) => row.tripIds.includes(tripId));
    if (!invoice) continue;
    const label = args.labelForTrip?.(tripId)?.trim() || "This trip";
    const group = groups.get(invoice.id) ?? { invoice, labels: [] };
    group.labels.push(label);
    groups.set(invoice.id, group);
  }
  if (groups.size === 0) return null;
  return [...groups.values()]
    .map(({ invoice, labels }) => {
      const names = labels.join(", ");
      const number = invoice.invoiceNumber.trim() || "the issued invoice";
      if (invoice.tripIds.length <= 1) {
        return `Remove ${names} from this selection. It is already invoiced. Cancel invoice ${number}. That invoice covers only this trip.`;
      }
      return `Remove ${names} from this selection. It is already invoiced. Remove ${names} from invoice ${number}. That invoice is a bulk invoice for ${invoice.tripIds.length} trips.`;
    })
    .join("\n");
}
