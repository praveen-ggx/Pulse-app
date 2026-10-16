# gowtham V1.0.4 — Finance search text visible on Customers / Suppliers / Garage / Drivers

## What
- Finance page (desktop): typed search text is now visible on the Customers, Suppliers, Garage and Drivers tabs. Cash was already fine.
- Finance tabs: switching tab (e.g. Cash → Customers) now clears the search box, so a query typed in one tab no longer carries over into the next. Tapping the tab you are already on keeps the text.

## Why
- On those tabs the search bar sits on the light toolbar, but the input kept the dark-toolbar text colour (white), so typed text was white on white. The Clear / Report / filter buttons already switched to dark on the light toolbar; the search input was missed.
- Search text was one shared value across all finance tabs, so a Cash search filtered the Customers list too.

## Areas
- features/finance/components/TreasurySummaryCard.tsx: new searchInputLight style (Theme.textPrimary) applied when toolbarTheme="light". Only place the light toolbar is used (FinanceSummarySection desktop dock). Dark toolbars unchanged.
- features/finance/components/FinanceScreen.tsx: handleTabPress clears searchQuery when the tab actually changes.

## Migrations
- None

## Tested
- eslint on the file (0 errors), ci-baseline lint 104/104, typecheck 64/89, cycles 111/111, lib-files 178/178; full jest 514 suites pass; git diff --check clean. Not clicked through in the UI.
- Tab-switch fix: eslint (no new errors; 2 existing ones are in V1 too), ci-baseline lint 104/104, typecheck 64/89, cycles 111/111, lib-files 178/178; full jest 514 suites pass. Not clicked through in the UI.
