# V1.0.45 — Simulate restored for Trip Ops

## Fix: Simulate button hidden for all non-owner members
- Praveen's PR #93 marked `tripops.trips.simulate` as `ownerAdminOnly`, which hid the Simulate button for all Trip Ops members (dispatchers, etc.) — not just Cancel/Revoke as intended.
- Removed `ownerAdminOnly` from `tripops.trips.simulate` so Trip Ops members can simulate trip stages again.
- Added UI-level gate: "Revoke Last" from `delivered` status is still restricted to owner / admin only.
- Cancel trip (pre-pickup) remains owner / admin only via `tripops.trips.cancel` surface — unchanged.
- Migration `20261109144113` re-adds `tripops.trips.simulate` to the TripOps department-manager allowlist.
- Updated RBAC docs and tests.
