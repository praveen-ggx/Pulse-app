import type { MarketplaceLoadSearch } from "@/features/network/utils/marketplaceSearch.util";
import { poolKey, poolKeyId } from "@/features/network/utils/pooledOpportunity.util";
import {
  buildShipperPoolModel,
  EMPTY_SHIPPER_POOL_SELECTION,
  selectShownPoolIndents,
  SHIPPER_POOL_PAGE_SIZE,
  shipperPoolLanes,
  toggleShipperPoolIndent,
  type ShipperPoolSelection,
} from "@/features/network/utils/shipperPoolIndents.util";
import { useCallback, useMemo, useState } from "react";

export type ShipperIndentStageView = "cards" | "indents";

type PoolIndent = {
  id: string;
  pickup_area: string | null;
  drop_location: string | null;
  vehicle_type: string | null;
};

/**
 * View mode, selected pool, selection and paging for the shipper's Indent
 * Pool. Owned by the screen so switching between Card View and Indent Pool
 * keeps the pool and selection; changing the pool drops the selection.
 */
export function useShipperPoolIndentView<I extends PoolIndent>(input: {
  poolIndents: readonly I[];
  visibleIndents: readonly I[];
  allocatedIndents?: readonly I[];
}) {
  const { poolIndents, visibleIndents, allocatedIndents } = input;
  const [view, setView] = useState<ShipperIndentStageView>("cards");
  const [poolSearch, setPoolSearchState] =
    useState<MarketplaceLoadSearch | null>(null);
  const [selection, setSelection] = useState<ShipperPoolSelection>(
    EMPTY_SHIPPER_POOL_SELECTION,
  );
  const [shownCount, setShownCount] = useState(SHIPPER_POOL_PAGE_SIZE);

  const lanes = useMemo(() => shipperPoolLanes(poolIndents), [poolIndents]);
  const model = useMemo(
    () =>
      buildShipperPoolModel({
        poolSearch,
        poolIndents,
        visibleIndents,
        allocatedIndents,
        selection,
        shownCount,
      }),
    [poolSearch, poolIndents, visibleIndents, allocatedIndents, selection, shownCount],
  );

  const setPoolSearch = useCallback((next: MarketplaceLoadSearch) => {
    setPoolSearchState(next);
    setShownCount(SHIPPER_POOL_PAGE_SIZE);
    setSelection((s) =>
      s.poolId === poolKeyId(poolKey(next)) ? s : EMPTY_SHIPPER_POOL_SELECTION,
    );
  }, []);
  const { poolId, memberIds, shown } = model;
  const toggle = useCallback(
    (indentId: string) =>
      setSelection((s) => toggleShipperPoolIndent(s, poolId, indentId, memberIds)),
    [poolId, memberIds],
  );
  const selectAllShown = useCallback(
    () =>
      setSelection((s) =>
        selectShownPoolIndents(
          s,
          poolId,
          shown.map((i) => i.id),
          memberIds,
        ),
      ),
    [poolId, shown, memberIds],
  );
  const clearSelection = useCallback(
    () => setSelection(EMPTY_SHIPPER_POOL_SELECTION),
    [],
  );
  const showMore = useCallback(
    () => setShownCount((n) => n + SHIPPER_POOL_PAGE_SIZE),
    [],
  );

  return {
    view,
    setView,
    lanes,
    poolIndents,
    allocatedIndents,
    poolSearch,
    setPoolSearch,
    model,
    toggle,
    selectAllShown,
    clearSelection,
    showMore,
  };
}
