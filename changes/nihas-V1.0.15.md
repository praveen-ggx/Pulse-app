# nihas V1.0.15 — LR upload from Document Upload asks for the LR number

## What broke / root cause
- Uploading an LR from Compliance → Document Upload only picked files, so the LR number stayed empty. Trip detail and the Trips hub ask for the number; Document Upload had its own plain file upload.

## What
- Document Upload's LR row (Upload / Add) opens the same "Add LR" dialog as the Trips hub: LR number (required) + one or more LR copies, preview, one submit. Pre-filled with the trip's current LR number when there is one. Other document types unchanged.
- The shared dialog now refuses an LR number already used on another trip in the org (same rule and message as trip detail), so the Trips hub gets the check too.

## Areas
- features/tripCompliance/components/ComplianceDocumentWorkspace.tsx, features/trips/components/HubTripLrUpdateModal.tsx.

## Migrations
- None.

## Tested
- Typecheck 62 (≤89), lint no new errors, cycles no regression; Jest tripCompliance + trips 1102 pass.
- localhost (preprod) as owner: Document Upload → TRP001421 → LR Upload opens "Add LR" (number + copies). Not submitted. Duplicate-number path not clicked through.

## Also: Document Upload did not scroll on phones (All tab)
- What broke: Ground Ops on a phone (web, gx-pulse) could not scroll a trip's documents on the All tab; on a laptop (mouse wheel, device emulation) it worked. The phone pane scrolls as one page, and the documents list inside it was a ScrollView with scrollEnabled={false}. React Native Web gives that `touch-action: none`, so a swipe that starts on the list never scrolls the page. The All list is long enough that almost every swipe starts on it; the shorter tabs left room around it.
- What: on the phone pane the documents list is a plain View (the page already scrolls); desktop keeps its own scrolling list. Rows are rendered once (`checklistDocRows`) for both.
- Tested: typecheck 62, lint no new errors, Jest tripCompliance 642 pass. Root cause confirmed in react-native-web ScrollViewBase (scrollDisabled → touchAction: 'none'). Not tried on a real phone yet.
