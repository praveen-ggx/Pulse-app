import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import {
  peekAssignmentPaint,
  subscribeAssignmentPaint,
  type AssignmentPaint,
} from "@/features/trips/utils/assignmentPaint.util";
import { queryKeys } from "@/lib/queryKeys";

export function useAssignmentPaint(tripId: string | null | undefined): AssignmentPaint | null {
  const [live, setLive] = useState<AssignmentPaint | null>(() => {
    const current = peekAssignmentPaint();
    return current?.tripId === tripId ? current : null;
  });
  useEffect(() => {
    const apply = (next: AssignmentPaint | null) => {
      setLive(next?.tripId === tripId ? next : null);
    };
    apply(peekAssignmentPaint());
    return subscribeAssignmentPaint(apply);
  }, [tripId]);
  const { data } = useQuery({
    queryKey: queryKeys.trips.assignmentPaint(tripId ?? ""),
    queryFn: async () => peekAssignmentPaint(),
    enabled: Boolean(tripId),
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
    initialData: () => {
      const current = peekAssignmentPaint();
      return current?.tripId === tripId ? current : undefined;
    },
  });
  // The cached copy only keeps the painted names so a trip page does not flash
  // stale values. It must never carry the "Assignment updated" popup: the
  // popup is shown from the live state only, because Done closes the live
  // state. A cached `confirm: true` could not be closed and kept reopening the
  // trip page for up to 30 minutes.
  const fromQuery: AssignmentPaint | null =
    data && data.tripId === tripId ? { ...data, confirm: false } : null;
  return live ?? fromQuery ?? null;
}
