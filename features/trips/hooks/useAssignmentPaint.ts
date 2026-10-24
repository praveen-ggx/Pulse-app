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
  const fromQuery = data?.tripId === tripId ? data : null;
  return live ?? fromQuery;
}
