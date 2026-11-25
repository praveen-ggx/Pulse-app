# praveen/V1.0.44

## What
- Mobile-only layout fixes for Customer profile (Overview, Route Contracts, Agreement, Finance Statement, Performance, Margin), Network home, Workspace hub menu, and Supplier Documents & Data vault.
- Horizontal scroll for clipped tabs/chips (profile tabs, Agreement/vault nav, FY year pills, ledger tables) so every control stays reachable on narrow viewports.
- Network / Workspace white dead-space fixes when stacking under a phone-width CSS viewport.
- Supplier Advance % accepts typing without a prior Edit tap; locked vault fields no longer show a dead caret; Save still persists Advance.
- `useWebLayoutWidth` prefers the CSS-narrow width under device emulation so mobile layout actually runs.

## Why
- Phone / DevTools emulation clipped tabs, chips, ledger Balance headers, and lane Distance fields, and left large empty scroll gaps on Network and Workspace.
- Supplier Advance looked focusable while read-only after a saved vault record, so users could not enter a percentage until they found Edit.

## Areas
- `components/CounterpartyProfileSystemCard.tsx`
- `components/profile/WorkspaceHubMenu.tsx`
- `components/profile/workspaceHubMenu.styles.ts`
- `features/clients/components/ClientProfileAgingBucketStrip.tsx`
- `features/clients/components/ClientProfileAgreementSection.tsx`
- `features/clients/components/ClientProfileFinanceStatementModal.tsx`
- `features/clients/components/ClientProfileHubsEditSection.tsx`
- `features/clients/components/ClientProfileLanesEditSection.tsx`
- `features/clients/components/ClientProfileMarginAnalysisSection.tsx`
- `features/clients/components/ClientProfilePerformanceSection.tsx`
- `features/network/components/ConnectionsView.tsx`
- `features/network/components/NetworkLoadsQuickCards.tsx`
- `features/network/screens/NetworkScreen.tsx`
- `features/suppliers/components/vendor-onboarding/SupplierVendorOnboardingVault.tsx`
- `features/suppliers/components/vendor-onboarding/__tests__/SupplierVendorOnboardingVault.tds.test.tsx`
- `lib/useWebLayoutWidth.ts`

## Migrations
- None.

## Tested
- Supplier vault unit suite (Advance type + save + existing TDS cases): pass.
- Customer / Supplier / Network / Workspace mobile layouts: clicked through in local web device emulation during the fix pass.
- Desktop / wide layout: unchanged by design (guards on `wide` / layout width).
