import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthProvider';
import { OrganizationProvider } from '@/context/OrganizationProvider';
import { CommerceProvider } from '@/context/CommerceProvider';
import { ExecutionProvider } from '@/context/ExecutionProvider';
import { LayoutProvider } from '@/layout/LayoutContext';
import { AuthGuard } from '@/layout/AuthGuard';
import { OnboardingGuard } from '@/layout/OnboardingGuard';
import { Main } from '@/layout/Main';
import { DashboardPage } from '@/pages/dashboard';
import { OrdersPage } from '@/pages/orders';
import { ExecutionPlanBuilderPage } from '@/pages/execution-plans/build';
import { ExecutionPlansPage } from '@/pages/execution-plans';
import { ProductsPage } from '@/pages/products';
import { CustomersPage } from '@/pages/customers';
import { WarehousesPage } from '@/pages/warehouses';
import { SettingsPage } from '@/pages/settings';
import { ProfilePage } from '@/pages/profile';
import { ObservatoryPage } from '@/pages/observatory';
import { OnboardingPage } from '@/pages/onboarding';
import { ExecutionDashboardPage } from '@/pages/execution';
import {
  CommerceAllocatePage,
  CommerceIndentDetailPage,
  CommerceTripDetailPage,
  ExecutionPlanStatusPage,
} from '@/pages/execution/detail';
import { DispatchPage } from '@/pages/execution/dispatch';
import { DriverTripPage } from '@/pages/execution/driver';
import { CommerceLockedPage } from '@/pages/locked';
import { isSuiteProductLocked } from '@pulse-suite/productLock';

export default function App() {
  if (isSuiteProductLocked('commerce')) {
    return <CommerceLockedPage />;
  }

  return (
    <AuthProvider>
      <OrganizationProvider>
        <CommerceProvider>
          <ExecutionProvider>
            <LayoutProvider>
              <Routes>
                <Route
                  path="/onboarding"
                  element={
                    <AuthGuard>
                      <OnboardingPage />
                    </AuthGuard>
                  }
                />
                <Route
                  element={
                    <AuthGuard>
                      <OnboardingGuard>
                        <Main />
                      </OnboardingGuard>
                    </AuthGuard>
                  }
                >
                <Route index element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/orders" element={<OrdersPage />} />
                <Route path="/execution-plans" element={<ExecutionPlansPage />} />
                <Route path="/execution-plans/build" element={<ExecutionPlanBuilderPage />} />
                <Route path="/products" element={<ProductsPage />} />
                <Route path="/customers" element={<CustomersPage />} />
                <Route path="/warehouses" element={<WarehousesPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="/observatory" element={<ObservatoryPage />} />
                <Route path="/execution" element={<ExecutionDashboardPage />} />
                <Route path="/execution/plan/:planId" element={<ExecutionPlanStatusPage />} />
                <Route path="/execution/indent/:indentId/allocate" element={<CommerceAllocatePage />} />
                <Route path="/execution/indent/:indentId" element={<CommerceIndentDetailPage />} />
                <Route path="/execution/trip/:tripId" element={<CommerceTripDetailPage />} />
                <Route path="/execution/dispatch/:jobId" element={<DispatchPage />} />
                <Route path="/execution/driver/:jobId" element={<DriverTripPage />} />
                <Route path="/indent-builder" element={<Navigate to="/execution-plans/build" replace />} />
                <Route path="/indents" element={<Navigate to="/execution-plans" replace />} />
                <Route path="/stock" element={<Navigate to="/warehouses" replace />} />
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Route>
            </Routes>
            </LayoutProvider>
          </ExecutionProvider>
        </CommerceProvider>
      </OrganizationProvider>
    </AuthProvider>
  );
}
