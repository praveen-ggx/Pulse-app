/**
 * How createIndent should pick warehouse_id (PR #15 / personal V1.0.1).
 * Lane pickup warehouse wins over an address-line match.
 */

export function resolveIndentWarehouseId(input: {
  explicitWarehouseId?: string | null;
  laneOriginWarehouseId?: string | null;
  pickupMatchedWarehouseId?: string | null;
}): string | null {
  return (
    input.explicitWarehouseId?.trim() ||
    input.laneOriginWarehouseId?.trim() ||
    input.pickupMatchedWarehouseId?.trim() ||
    null
  );
}
