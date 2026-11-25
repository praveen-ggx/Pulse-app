# Driver Rejection, Reassignment & Notifications

When a driver **rejects** (declines) an assigned trip, the trip becomes unassigned and the dispatcher (and supplier for aggregate trips) must be able to see this, be notified, and reassign.

## Current behavior

- **Backend:** RPC `driver_reject_trip(p_trip_id)` unassigns the driver (`trips.driver_id = null`), keeps the vehicle, and inserts a `trip_assignment_audit` row with `event_type = 'reassignment'`, `driver_id_prev` = previous driver, `driver_id_new = null`, `changed_by = auth.uid()` (the driver’s user id).
- **Dispatcher view:** Trip detail shows Current Assignment with "No driver assigned", "+ ASSIGN", Previous Driver, and Activity Log. Realtime subscription on `trips` refetches the trip when the row changes.
- **Supplier view:** Same trip detail screen when the supplier has access to the trip (e.g. aggregate trip where they are the partner). Assignment block is read-only for them (`canAssign` is per capabilities); they see status and Activity Log.
- **Activity Log:** Shows "Reassignment" with " · by dispatcher" when `changed_by !== currentUserId`, but when the driver rejected, `changed_by` is the driver — so the label is misleading.

## Implemented

1. **Activity Log label**  
   For reassignment rows where the driver was removed (`driver_id_prev` set, `driver_id_new` null), show **" · Driver rejected"** instead of " · by dispatcher", so dispatcher and supplier see that the change was a driver rejection.

2. **Realtime: full refresh on trip update**  
   When the trip row updates (e.g. after driver reject), the trip detail screen runs a full refresh: `load()`, `loadAssignmentAudit()`, and OTP/transactions as needed. So the Assignment block and Activity Log update without leaving the screen.

3. **In-app alert when viewing the trip**  
   If the user (dispatcher or supplier) has the trip detail open and the driver rejects, after the refetch we detect "had driver → now no driver" and show an alert: **"Driver declined"** with **"Update the driver details…"**, and (when `canAssign`) open the **Change driver** popup. Cold-open of an already-unassigned trip with a decline audit does the same.

4. **Notification plan (ops alerts)**  
   Synthetic `unassigned_trip` alerts fire immediately for assigned-without-driver and for decline-shaped `assignment_update` recent events (no 30-minute wait). Copy: **"Driver declined · Update driver details"**; action opens Change driver.

5. **Locales**  
   Keys: `driverRejected`, `driverRejectedNotify`, `updateDriver`, `later` for Activity Log and alert text.

## Supplier view (reassignment)

- **Who can assign:** Only the **trip owner** (dispatcher org) can assign drivers. The supplier sees the same Current Assignment block but with **+ ASSIGN** disabled (or hidden) when they don’t have `canAssign` capability.
- **What supplier sees after rejection:** "No driver assigned", "Previous driver: …", "LAST CHANGE: Driver rejected …", and Activity Log with "Driver rejected". They are informed that a new driver is needed; actual reassignment is done by the dispatcher.
- **RLS:** If the supplier org can `SELECT` the trip (e.g. trips where `supplier_id` is their entity or via shared ledger), they see the same screen. If not, backend must allow read access for the supplier org for those trips.

## Edge cases covered

| Case | Handling |
|------|----------|
| Driver rejects while dispatcher has trip open | Realtime refetch; Activity Log shows "Driver rejected"; alert "Driver rejected. Assign a new driver." |
| Driver rejects while supplier has trip open | Same as above; supplier sees status and alert but cannot assign. |
| Driver rejects and no one is on trip detail | Trip list / next open of trip detail shows "No driver assigned" and Activity Log; **persistent notifications** (below) would notify. |
| Multiple rejections | Each rejection adds a new audit row; Activity Log shows each "Driver rejected" with timestamp. |
| Dispatcher removes driver (not driver reject) | Audit row has `changed_by = dispatcher`; label remains " · by you" or " · by dispatcher"; no "Driver rejected". |
| OTP after rejection | Dispatcher can **Regenerate OTP** when assigning a new driver; existing OTP remains valid until regenerated (backend may optionally invalidate on reject — product decision). |
| Trip list badge | Trip card shows "UNASSIGNED" when `driver_id` is null; no change needed. |

## Future: persistent notifications

To notify **dispatcher and supplier when they are not on the trip screen**:

- **Option A:** Add an **in-app notifications** table (e.g. `user_notifications`: `user_id`, `type`, `title`, `body`, `trip_id`, `read_at`, `created_at`). On `driver_reject_trip`, a trigger or Edge Function creates rows for: (1) org members with dispatch capability, (2) supplier org members if `trip.supplier_id` is set. App: bell icon shows unread count; list screen; tap opens trip detail.
- **Option B:** Push notifications (FCM/APNs) with the same targeting and payload (e.g. "Driver rejected trip TRP007").
- **Option C:** Reuse or extend existing "Notifications" entry point in the driver app for dispatcher/supplier in the main app (same table or a dedicated feed).

Schema and triggers belong in **pulse-unified-base** (or shared Supabase migrations); the app consumes the feed and optionally marks as read.

## Files touched (implementation)

- `docs/DRIVER_REJECTION_REASSIGNMENT_AND_NOTIFICATIONS.md` — this plan.
- `features/trips/components/trip-detail/TripDetailFinanceView.tsx` — Activity Log: "Driver rejected" for driver-removed reassignments; use `t()` for labels.
- `features/trips/components/trip-detail/TripDetailScreen.tsx` — Realtime callback does full refresh (trip + audit); detect driver rejection and show alert; ref to track previous `driver_id`.
- `locales/en.json` — `driverRejected`, `driverRejectedNotify`.
