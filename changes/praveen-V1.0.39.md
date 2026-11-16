# praveen/V1.0.39

## What
- Editing the Invoice Date in the manual invoice pane updates the date printed on the invoice preview immediately.
- Save, update, and convert-to-invoice store that day. Reopening a saved manual invoice, including a refresh of that draft, puts the stored day back in the pane and on the paper.

## Why
- The paper kept the date from when the preview first opened, so the pane and the invoice showed different days. Saving also wrote today and skipped the date on later updates.

## Areas
- `features/invoicing/components/InvoicePreviewPanel.tsx`
- `features/invoicing/InvoicingExecuteScreen.tsx`
- `features/invoicing/services/manualInvoice.service.ts`
- `features/invoicing/utils/financeInvoicePreview.util.ts`
- `features/invoicing/utils/__tests__/financeInvoicePreview.util.test.ts`

## Migrations
- None

## Tested
- `npx jest features/invoicing/utils/__tests__/financeInvoicePreview.util.test.ts --ci --silent --no-coverage`
- UI: not clicked through

## Saved-date precedence
- A date on the draft wins: the left-pane edit while composing, and the stored `invoice_date` after reopen.
- The preview panel's own date is used only when the draft has no date.
- A valid edited day is written on create, update, and issue. An empty or invalid edit is stored as today.
- Reopening does not invent a date. A blank saved day leaves the form as it is.
