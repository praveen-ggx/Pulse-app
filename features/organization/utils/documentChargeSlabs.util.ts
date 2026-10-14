/**
 * Org-wise document charge slabs — freight cost range → flat document charge.
 * `to: null` means open-ended ("Above <from>"); only the last slab may be open.
 */

export type DocumentChargeSlab = {
  id: string;
  from: number;
  to: number | null;
  charge: number;
};

let slabSeq = 0;
export function newSlabId(): string {
  slabSeq += 1;
  return `slab_${Date.now().toString(36)}_${slabSeq}`;
}

export const DEFAULT_DOCUMENT_CHARGE_SLABS: readonly Omit<DocumentChargeSlab, "id">[] = [
  { from: 1000, to: 15000, charge: 200 },
  { from: 15001, to: 25000, charge: 300 },
  { from: 25001, to: 60000, charge: 500 },
  { from: 60001, to: 100000, charge: 600 },
  { from: 100001, to: null, charge: 700 },
];

export function defaultDocumentChargeSlabs(): DocumentChargeSlab[] {
  return DEFAULT_DOCUMENT_CHARGE_SLABS.map((s) => ({ ...s, id: newSlabId() }));
}

/** Returns the first validation error, or null when slabs are valid. */
export function validateDocumentChargeSlabs(
  slabs: DocumentChargeSlab[],
): string | null {
  if (slabs.length === 0) return "Add at least one slab.";
  for (let i = 0; i < slabs.length; i += 1) {
    const s = slabs[i];
    const row = `Row ${i + 1}`;
    const isLast = i === slabs.length - 1;
    if (!Number.isFinite(s.from) || s.from < 0) return `${row}: enter a valid "From" amount.`;
    if (s.to === null && !isLast) return `${row}: only the last slab can be open-ended.`;
    if (s.to !== null && (!Number.isFinite(s.to) || s.to <= s.from)) {
      return `${row}: "To" must be greater than "From".`;
    }
    if (!Number.isFinite(s.charge) || s.charge < 0) return `${row}: enter a valid charge.`;
    if (i > 0) {
      const prev = slabs[i - 1];
      if (prev.to !== null && s.from <= prev.to) {
        return `${row}: overlaps with row ${i}. Start above ${prev.to}.`;
      }
    }
  }
  return null;
}

/** Charge for a freight amount, or null when no slab matches. */
export function documentChargeForFreight(
  slabs: DocumentChargeSlab[],
  freight: number,
): number | null {
  const hit = slabs.find(
    (s) => freight >= s.from && (s.to === null || freight <= s.to),
  );
  return hit ? hit.charge : null;
}

export function formatSlabRange(s: Pick<DocumentChargeSlab, "from" | "to">): string {
  const fmt = (n: number) => n.toLocaleString("en-IN");
  return s.to === null ? `Above ${fmt(s.from - 1)}` : `${fmt(s.from)} – ${fmt(s.to)}`;
}
