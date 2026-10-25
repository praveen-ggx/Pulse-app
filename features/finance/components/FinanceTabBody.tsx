/**
 * Finance sub-tab bodies — eager imports so party lists bundle with FinanceScreen.
 * Panels stay mounted after first visit to preserve scroll position and local UI state.
 */
import { LazySuspenseInlineFallback } from '@/components/LazySuspenseFallback';
import { PersistentTabPanel } from '@/components/PersistentTabPanel';
import type { ComponentType } from 'react';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import type { FinanceSubTab } from '../types';
import { TABS } from '../types';
import { FinanceCashTab } from './finance-tabs/FinanceCashTab';
import { FinanceCustomersTab } from './finance-tabs/FinanceCustomersTab';
import { FinanceDriversTab } from './finance-tabs/FinanceDriversTab';
import { FinanceGarageTab } from './finance-tabs/FinanceGarageTab';
import { FinanceSuppliersTab } from './finance-tabs/FinanceSuppliersTab';
import {
  isFinancePartyTabBlocking,
  shouldShowFinancePartyCatalogLoading,
} from '@/features/finance/utils/financePartyTabLoading.util';
import type { FinanceTabBodyProps } from './FinanceTabBody.types';

export type { FinanceTabBodyProps } from './FinanceTabBody.types';

const TAB_COMPONENTS: Partial<
  Record<FinanceSubTab, ComponentType<FinanceTabBodyProps>>
> = {
  cash: FinanceCashTab,
  customers: FinanceCustomersTab,
  suppliers: FinanceSuppliersTab,
  garage: FinanceGarageTab,
  drivers: FinanceDriversTab,
};

export function FinanceTabBody(props: FinanceTabBodyProps) {
  const activeTab = props.financeSubTab;
  const tabs = props.visibleTabs ?? TABS;
  const [mountedTabs, setMountedTabs] = useState<Set<FinanceSubTab>>(
    () => new Set([activeTab]),
  );

  useEffect(() => {
    setMountedTabs((prev) => {
      if (prev.has(activeTab)) return prev;
      const next = new Set(prev);
      next.add(activeTab);
      return next;
    });
  }, [activeTab]);

  if (
    isFinancePartyTabBlocking({
      activeTab,
      clientsLoading: shouldShowFinancePartyCatalogLoading({
        hasRows: (props.clientRows?.length ?? 0) > 0,
        catalogPending: props.clientsLoading ?? props.entitiesLoading,
      }),
      suppliersLoading: shouldShowFinancePartyCatalogLoading({
        hasRows: (props.supplierRows?.length ?? 0) > 0,
        catalogPending: props.suppliersLoading ?? props.entitiesLoading,
      }),
      entitiesLoading: props.entitiesLoading,
    })
  ) {
    return <LazySuspenseInlineFallback message="Loading parties…" />;
  }

  return (
    <View
      style={
        props.embedInParentScroll
          ? { width: "100%", minWidth: 0 }
          : { flex: 1, minHeight: 0 }
      }
    >
      {tabs.map((tab) => {
        const TabPanel = TAB_COMPONENTS[tab.id];
        if (!TabPanel || !mountedTabs.has(tab.id)) return null;
        return (
          <PersistentTabPanel
            key={tab.id}
            active={activeTab === tab.id}
            style={
              props.embedInParentScroll
                ? { width: "100%", minWidth: 0 }
                : { flex: 1, minHeight: 0 }
            }
          >
            <TabPanel {...props} financeSubTab={tab.id} />
          </PersistentTabPanel>
        );
      })}
    </View>
  );
}
