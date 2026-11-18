# praveen/V1.0.41

## What
- Business Sales Report includes a row only when that indent's own creation day (Asia/Kolkata) is inside the selected range.
- Indent Date, Awarded Date, and Created By stay on the original indent. Created By is the indent creator's name from the organization roster.
- Indent ID, Pulse ID, and Trip ID are separate columns: the indent display number, the indent operational code, and the trip display number. Trip ID is blank when no trip exists.
- The sales indent page read awaits its query, and sales party names are built from the sales-window trips rather than the hub list.

## Why
- A November download was including September and October indents because a later pickup or trip date matched, and Created By showed only the person who downloaded the file. The indent number and the Pulse operational code were also printed as one column.

## Areas
- `features/trips/screens/TripsScreen.tsx`
- `features/trips/services/tripIndentReport.service.ts`
- `features/trips/utils/tripIndentReport.model.ts`
- `features/trips/utils/tripIndentReportExport.util.ts`
- `features/trips/utils/salesReportWindow.util.ts`
- `features/trips/utils/__tests__/tripIndentReport.model.test.ts`
- `features/trips/utils/__tests__/tripIndentReportExport.util.test.ts`
- `features/trips/utils/__tests__/salesReportWindow.util.test.ts`

## Migrations
- None

## Tested
- `npx jest features/trips/utils/__tests__/salesReportWindow.util.test.ts features/trips/utils/__tests__/tripIndentReport.model.test.ts features/trips/utils/__tests__/tripIndentReportExport.util.test.ts features/trips/services/__tests__/tripIndentReport.pageSize.test.ts --ci --silent`
- Preprod rows for 1–7 Nov 2026 checked against the inclusion rule and the three ID fields. Downloaded Excel: not clicked through.
