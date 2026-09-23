import { memo, useMemo } from "react";
import { Pressable, Text, View } from "react-native";

import { HUB_PURPLE } from "@/components/profile/workspaceHubMenu.styles";
import { ProductLogo } from "@/features/organization/components/workspace/ProductLogo";
import { productGridStyles as styles } from "@/features/organization/components/workspace/workspaceHubProductGrid.styles";
import {
  countActivePlatformModules,
  getPlatformModuleCount,
  isPlatformModuleActive,
  PULSE_PLATFORM_CATALOG,
  PULSE_PLATFORM_TITLE,
  type PlatformModule,
} from "@/lib/pulsePlatformCatalog";
import { type ProductId } from "@/lib/productRegistry";
import { ChevronRight, Lock } from "lucide-react-native";
import Theme from "@/constants/Theme";

type WorkspaceHubProductGridProps = {
  activeProductIds: Set<ProductId>;
  onOpenCatalogue: () => void;
  onSelectProduct?: (productId: ProductId) => void;
};

function ModuleChip({
  module,
  isActive,
  onPress,
}: {
  module: PlatformModule;
  isActive: boolean;
  onPress?: () => void;
}) {
  return (
    <View style={styles.gridCell}>
      <Pressable
        style={({ pressed }) => [
          styles.chip,
          isActive && styles.chipActive,
          pressed && isActive && styles.chipPressed,
        ]}
        onPress={onPress}
        disabled={!isActive || !onPress}
        accessibilityRole="button"
        accessibilityLabel={`${module.label}${isActive ? ", connected" : ", locked"}`}
      >
        <View style={styles.logoSlot}>
          <ProductLogo
            productId={module.productId}
            size={36}
            active={isActive}
          />
          {!isActive ? (
            <View style={styles.lockBadge} accessibilityElementsHidden>
              <Lock size={10} color={Theme.textMuted} strokeWidth={2.4} />
            </View>
          ) : null}
        </View>
        <Text
          style={[
            styles.chipName,
            isActive ? styles.chipNameActive : styles.chipNameLocked,
          ]}
          numberOfLines={2}
        >
          {module.label}
        </Text>
      </Pressable>
    </View>
  );
}

/** Pulse Platform — suite-grouped module grid in the workspace hub. */
export const WorkspaceHubProductGrid = memo(function WorkspaceHubProductGrid({
  activeProductIds,
  onOpenCatalogue,
  onSelectProduct,
}: WorkspaceHubProductGridProps) {
  const moduleCount = useMemo(() => getPlatformModuleCount(), []);
  const activeCount = useMemo(
    () => countActivePlatformModules(activeProductIds),
    [activeProductIds],
  );

  return (
    <View style={styles.section}>
      <Pressable
        style={({ pressed }) => [
          styles.sectionHeader,
          pressed && styles.sectionHeaderPressed,
        ]}
        onPress={onOpenCatalogue}
        accessibilityRole="button"
        accessibilityLabel="Open Pulse Platform catalogue"
      >
        <View style={styles.sectionHeaderLeft}>
          <View style={styles.sectionAccent} />
          <View style={styles.sectionTitleBlock}>
            <Text style={styles.sectionEyebrow}>{PULSE_PLATFORM_TITLE}</Text>
            <Text style={styles.sectionMeta}>
              {activeCount} connected · {moduleCount} modules
            </Text>
          </View>
        </View>
        <View style={styles.catalogueLink}>
          <Text style={styles.catalogueLinkText}>Catalogue</Text>
          <ChevronRight size={12} color={HUB_PURPLE} strokeWidth={2.2} />
        </View>
      </Pressable>

      <View style={styles.suiteStack}>
        {PULSE_PLATFORM_CATALOG.map((suite, suiteIndex) => (
          <View
            key={suite.id}
            style={[
              styles.pillarBlock,
              suiteIndex > 0 && styles.pillarBlockSpaced,
            ]}
          >
            <Text style={styles.pillarLabel}>{suite.label}</Text>
            <View style={styles.grid}>
              {suite.modules.map((module) => {
                const isActive = isPlatformModuleActive(
                  module,
                  activeProductIds,
                );
                return (
                  <ModuleChip
                    key={module.id}
                    module={module}
                    isActive={isActive}
                    onPress={
                      isActive
                        ? () => {
                            onSelectProduct?.(module.productId);
                            onOpenCatalogue();
                          }
                        : undefined
                    }
                  />
                );
              })}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
});
