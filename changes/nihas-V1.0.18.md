# nihas V1.0.18 — Read-only "see all Compliance tabs" permission

## What broke / root cause
- Amilthan and Dhira (Finance) need to watch every Compliance tab without acting. Each tab was shown only to members who hold that tab's action permission (Verification needs verify / mark verified, hard-copy POD tabs need Record hard-copy POD), so showing a tab meant also granting Approve or Log hard-copy POD.

## What
- New member permission "See all Compliance tabs (read-only)" (`trip_compliance.tab.view_all`, Compliance section, requires View compliance documents). With it the Compliance page shows every stage tab. Every action button keeps its own permission (verify, mark verified, finance manage / reject, POD manage, resubmit), and the RPCs re-check those on the server.

## Areas
- lib/memberSurfaces.ts (catalog + Compliance section), app/compliance/index.tsx (visible tabs).

## Migrations
- None.

## Tested
- Full Jest, navigation-policy, ci-baseline lint / typecheck / cycles / lib-files (clean worktree), git diff --check. Checked by Nihas in the app. Not tested on preprod.
