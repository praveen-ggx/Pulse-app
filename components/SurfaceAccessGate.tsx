/**
 * Soft RBAC gate for a single member surface (`lib/memberSurfaces.ts`).
 *
 * Wraps a screen whose access is controlled by exactly one surface id. Owner /
 * admin bypass happens inside `useMemberAccess`, so this only ever blocks
 * non-admin members whose surface map has the id off.
 *
 * Use this for whole-screen access. For an action *inside* an allowed screen
 * (an edit button, an approve control), call `useMemberAccess().can(id)`
 * directly instead of nesting a gate.
 *
 * Renders the screen while surfaces hydrate so first paint is not blank.
 * Only deny after access has resolved (same rule as ModelAccessGate).
 */
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { useOptionalLanguage } from "@/contexts/LanguageContext";
import type { MemberSurfaceId } from "@/lib/memberSurfaces";
import { useMemberAccess } from "@/lib/useMemberAccess";
import { type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

type Props = {
  surface: MemberSurfaceId;
  children: ReactNode;
  /** Optional override for the denial copy (defaults to the shared notice). */
  message?: string;
};

export function SurfaceAccessGate({ surface, children, message }: Props) {
  const { can, isLoading } = useMemberAccess();
  const { t } = useOptionalLanguage();

  if (isLoading || can(surface)) return <>{children}</>;

  return (
    <View style={styles.noticeWrap}>
      <Text style={styles.noticeTitle}>{t("surfaceNoAccessTitle")}</Text>
      <Text style={styles.noticeBody}>{message ?? t("surfaceNoAccessBody")}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  noticeWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Layout.screenPaddingHorizontal,
    backgroundColor: Theme.screenBackground,
  },
  noticeTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Theme.textPrimary,
    textAlign: "center",
    marginBottom: Layout.spacingSmall,
  },
  noticeBody: {
    fontSize: 14,
    color: Theme.textSecondary,
    textAlign: "center",
    maxWidth: 320,
  },
});
