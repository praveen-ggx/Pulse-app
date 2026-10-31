# nihas V1.0.32

## What
- Compliance-only members who open Pulse on a Trips/Finance/Network URL are sent to Compliance instead of the "No workspace access yet" screen.

## Why
- Vaishnave (GOGOVAN Compliance) hit "No workspace access yet" every time she reopened Pulse or a new tab: the restored /trips URL has no Trips access for her, and the gate only knew Trips/Finance/Network as a home. Login worked because boot landing already knew Compliance.

## Areas
components/MemberDomainGate.tsx.

## Migrations
None.

## Tested
- Full Jest 5016 passed; lint 102, cycles 92, lib-files 178, typecheck 320 (all at/below baseline); git diff --check clean.
- Not tested: clicking through as a Compliance member on web.
