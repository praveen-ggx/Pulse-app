/**
 * Full-screen detail page: back button, title, scrollable body. Safe area applied.
 * Aligns with pulse-unified-base detail panels (client, supplier, trip, driver, vehicle).
 */
import type { ReactNode } from 'react';
import { Platform, View, Text, TouchableOpacity, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import Layout from '@/constants/Layout';
import Theme from '@/constants/Theme';

interface DetailPageLayoutProps {
  title: string;
  onBack: () => void;
  children: ReactNode;
  /** Optional line below the title (e.g. driver rating). */
  titleSubline?: ReactNode;
  /** Optional floating action button (e.g. Add Transaction) shown bottom-right. */
  fab?: ReactNode;
  /** Optional right-side header action (e.g. profile icon). */
  rightAction?: ReactNode;
  /** Pull-to-refresh. */
  onRefresh?: () => void | Promise<void>;
  refreshing?: boolean;
}

export function DetailPageLayout({ title, onBack, children, titleSubline, fab, rightAction, onRefresh, refreshing = false }: DetailPageLayoutProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + Layout.headerPaddingBelowInset,
            backgroundColor: Theme.screenBackground,
          },
        ]}
      >
        <TouchableOpacity
          style={styles.backBtn}
          onPress={onBack}
          accessibilityLabel="Back"
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          activeOpacity={0.7}
        >
          <FontAwesome name="arrow-left" size={20} color={Theme.textPrimaryDark} />
        </TouchableOpacity>
        <View style={styles.titleWrap}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          {titleSubline != null ? <View style={styles.titleSubline}>{titleSubline}</View> : null}
        </View>
        {rightAction != null ? rightAction : <View style={styles.backBtn} />}
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 32 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Theme.primary}
            />
          ) : undefined
        }
      >
        {children}
      </ScrollView>
      {fab}
    </View>
  );
}

/** Section block for detail content (label + content). */
export function DetailSection({
  title: sectionTitle,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{sectionTitle}</Text>
      {children}
    </View>
  );
}

/** Row for key-value pair. */
export function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (value == null || value === '') return null;
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
    zIndex: 10,
    elevation: 2,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Theme.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleWrap: {
    flex: 1,
    marginHorizontal: 8,
    minWidth: 0,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: Theme.textPrimaryDark,
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0,
    ...Platform.select({
      web: { whiteSpace: 'pre-wrap' as const },
      default: {},
    }),
  },
  titleSubline: {
    marginTop: 2,
    alignItems: 'center',
  },
  scroll: { flex: 1 },
  scrollContent: { padding: 16 },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: Theme.textMutedDemo,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  row: {
    marginBottom: 10,
  },
  rowLabel: {
    fontSize: 10,
    color: Theme.textMutedDemo,
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  rowValue: {
    fontSize: 15,
    color: Theme.textPrimary,
  },
});
