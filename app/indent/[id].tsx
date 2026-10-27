import { LazySuspenseInlineFallback } from "@/components/LazySuspenseFallback";
import { setLastOpenedHubItem } from "@/features/trips/utils/lastOpenedHubItem.util";
import { INDENT_DETAIL_ANONYMOUS_CONTEXT } from "@/lib/routes";
import { useSafeBack } from "@/lib/useSafeBack";
import { useLocalSearchParams, useRouter } from "expo-router";
import { lazy, Suspense } from "react";

const IndentDetailScreen = lazy(() =>
  import("@/features/indents/components/IndentDetailScreen").then((m) => ({
    default: m.IndentDetailScreen,
  })),
);

export default function IndentDetailRoute() {
  const { id, context } = useLocalSearchParams<{ id: string; context?: string }>();
  const router = useRouter();
  const safeBack = useSafeBack();
  const indentId = typeof id === "string" ? id : (id?.[0] ?? "");
  if (indentId) setLastOpenedHubItem(indentId);
  const anonymous = context === INDENT_DETAIL_ANONYMOUS_CONTEXT;

  return (
    <Suspense fallback={<LazySuspenseInlineFallback message="Loading indent…" />}>
      <IndentDetailScreen
        indentId={indentId}
        anonymous={anonymous}
        onBack={safeBack}
        onEditPress={(indent) =>
          router.push(
            `/create-indent?draftId=${encodeURIComponent(indent.id)}` as import("expo-router").Href,
          )
        }
      />
    </Suspense>
  );
}
