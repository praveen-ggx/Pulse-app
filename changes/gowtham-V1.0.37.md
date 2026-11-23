# gowtham V1.0.37 — Driver / DCO operating-mode batch + booking_ref & offline market-hire

## Flow checklist (one PR when every row is ☑ — per Vasanth)
☐ not started · ◐ in progress · ☑ done and tested

| # | Flow | DCO / Non-DCO | Status |
|---|---|---|---|
| A | Fleet trip | Non-DCO | ☐ |
| B | Offline: hired by phone (OTP) | Both | ☐ |
| C | Offline: supplier-tagged | Non-DCO | ☐ |
| D | Marketplace trip | DCO | ☐ |
| E | Own client: Self book | DCO | ☐ |
| F | Own client: Independent book | Non-DCO | ☐ |
| G | Become a DCO: leave fleet → KYC + PAN + bank proof → admin verifies → approve (existing approved DCOs untouched) | DCO | ◐ |

Open questions for Vasanth: "DIRECT TRIP" card label renamed to "OFFLINE TRIP" — OK?

## What
- Odometer / Pulse Scan web fingerprint: `sha256File` now reads `blob:` and web URIs via `fetch` so OCR enqueue no longer crashes with `expo-file-system.readAsStringAsync is not available on web` (native FileSystem path unchanged).
- Odometer OCR auto-fill: when the Start/End field is empty, a detected KM is written into the keypad immediately so Trip distance (End − Start) can calculate; confirm only if the field already has a different value. Monthly Pulse Scan quota hard-block / SCAN NOTICE soft-disabled via `OCR_QUOTA_ENFORCEMENT_ENABLED` (off) — flip on later to restore.
- Driver tab bar (Android APK): dock now sits above the 3-button system nav bar — bottom padding uses the full safe-area inset + 8dp gap (was 35%), shared via `components/driver/driverTabBarInsets.ts` so Home / Dashboard / Salary / Chat clearance matches the dock.
- Driver map (APK / MapLibre): map host no longer overrides the caller's `absoluteFill`, which collapsed the dashboard preview and full-screen map to 0 height (grey box).
- Map tiles (all platforms): Carto keyless basemaps now return "API KEY REQUIRED" watermark tiles to apps/WebViews, so every driver map — native MapLibre (APK / dev client), Expo Go WebView (Leaflet) and web (maplibre-gl) — uses Mapbox Light raster tiles with the existing `EXPO_PUBLIC_MAPBOX_TOKEN` (`lib/maps/nativeBasemapStyle.ts`); plain light background if the token is missing.
- Odometer photo slot (web): Remove/Retake are no longer nested inside the preview `Pressable` (fixes `<button>` inside `<button>` hydration warning).
- Migration `20271113110000_ocr_jobs_insert_allow_trip_access`: restore trip-linked INSERT on `ocr_jobs` so assigned drivers (not only `organization_members`) can create OCR jobs — fixes RLS 403 / “new row violates row-level security policy for table ocr_jobs”.
- Driver app operating-mode / DCO Self batch: tab bar and driver home routes, trip flow / completed modal, multi-order job card, trip history, control / profile / party receivable / level screens, and related tests.
- Operating-mode helpers and query wiring so Self / DCO / fleet surfaces pick the right book and gates.
- DCO Self offline + receivable issue paths (clearer errors, sync/offline util tweaks) and exchange payment test coverage for DCO Self book routing.
- Assigner display util + unit test; RBAC operating-model changelog note; DCO operating-model boundary SQL test updates.
- Migration `20271113100000_booking_ref_skip_taken_refs`: booking_ref trigger skips refs already on `trips` and can walk past a lagged sequence (paid DCO award confirm failure).
- Migration `20271113101500_dco_allow_offline_market_hire_trip`: allow Aggregate/market-hire FLEET trips to assign a `tracking_only` DCO driver (offline hire by phone); employee/fleet DCO assignment stays blocked.
- Fleet disconnect: themed confirm warns about pending trip pay / open salary requests before leave; `leave_fleet` notifies the fleet org (`driver_disconnected` network inbox) and soft-closes driver membership; DCO request is refused while still employed (admin approve already required disconnect).
- Fleet owner bell card for a driver who left reads "<Driver> left your fleet · Disconnected" (tag "Left fleet"); driver name from the payload, or parsed from the legacy "<Name> disconnected from your fleet" title.
- DCO status screen: disconnect-first CTA (Wallet Self) then request; copy matches two-gate order (fleet leave → admin approve).
- DCO now needs identity proofs: driver must submit KYC (Licence, Aadhaar, Selfie) before requesting DCO; admin can approve only after KYC is verified. DCO also needs PAN + bank proof (DCO-only, still optional for normal drivers); Driver Documents screen = driver documents only. DCO screen is a 4-step upgrade (leave fleet → identity docs reused → DCO docs PAN + bank proof uploaded inline → one "Submit for DCO approval" that also submits unsent identity KYC). Shared upload hook `features/drivers/hooks/useDriverKycDocUpload.ts`. Approved DCO with no vehicle: Market + DCO screens show "Add vehicle" (opens the add form) instead of "Manage my vehicle"; "Manage my vehicle" only once a vehicle exists. Admin KYC queue fills missing driver name/phone from profile (`get_driver_kyc_reviewer_profiles`) — DCO drivers have no fleet row, so it showed "Unknown driver". Self receivables: offline parties no longer borrow the trip owner org's logo (`partyAvatarLookup`); they show initials unless the client has its own photo / linked-org logo. Marketplace keeps the listing shipper logo. "Mark … fleet trip" wording → "party trip". "Verified DCO" badge (`components/driver/VerifiedDcoBadge.tsx`) for approved DCOs, shown once on Profile (hero, under the name) and on the DCO status card. Profile for a DCO: rank line reads "<tier> rank · <name> level" (so a level named "Verified" is not a second badge), DCO row is "DCO account", and the vehicle row is "MY VEHICLES · Manage my trucks" → My Fleet instead of "FLEET ASSIGNED". Already-verified drivers who upload DCO docs return to the admin KYC "Awaiting" queue with a "DCO docs" badge (`driver_kyc_review_queue.dco_docs_pending`). DCO screen shows a KYC step card; admin DCO panel shows KYC + DCO-doc status and disables Approve until all verified; Driver KYC panel can verify PAN/bank proof even for already-verified drivers.
- Driver live tracking (3 lanes): Lane 1 LIVE — driver phone broadcasts position over Supabase Realtime every ≥50 m or 15 s (min gap 5 s), zero DB writes; Lane 2 CHECKPOINT — `tracking_record_checkpoint` RPC every 2 min or 500 m (trip_location_checkpoints + driver_presence, server re-gates 50 m/30 s, `session_id` null); Lane 3 HISTORY — existing 12-ping `driver_locations` loop untouched (chat log / long-haul health). Background GPS via `expo-task-manager` + Android foreground service ("Pulse · trip in progress" notification) once driver allows location "all the time" (asked once per trip; foreground-only otherwise). Controller `features/tracking/services/driverLiveTracking.service.ts` (ref-counted, 5 s release debounce, drops fixes >150 m accuracy, headless restore from AsyncStorage, self-stops when trip completed/cancelled). Dispatcher trip map listens to the broadcast whenever driver map data is shown (additive — legacy `driver_locations` realtime unchanged unless `EXPO_PUBLIC_TRACKING_BROADCAST_V1=1`); DB seed never moves the marker behind a newer live point. Kill switch: `EXPO_PUBLIC_DRIVER_LIVE_TRACKING=0` (rebuild).
- Location labels: OpenStreetMap ward numbers ("Ward 185", "Zone 10 …" prefix) no longer become the trip pickup/drop name — Add Trip falls back to the searched place name (e.g. "Madhavaram, Tamil Nadu"); same guard on reverse-geocoded map labels and on recent places cached on the phone. New trips only; existing trip labels unchanged.
- Place search (Add Trip pickup/drop): when `EXPO_PUBLIC_GOOGLE_PLACES_API_KEY` is set, suggestions come from Google Places API (New) first — same list as Google Maps; exact lat/lon + area/city/state/PIN fetched with one Place Details call only for the picked result (one billing session per search). Google fails → Mapbox → OSM; no key → unchanged (Mapbox → OSM). Old legacy Places calls (10 details per keystroke) removed.
- Completed trip map: shows the driven path (GPS history + checkpoints) instead of only pickup/drop. Read once (no realtime), only points between trip creation and completion (+10 min) so the history RPC's driver-wide fallback never draws unrelated places; GPS wobble (<30 m steps) skipped; driver never moved (all within 100 m, e.g. office test) → one last-location dot, no line. Open/live trips unchanged.
- Completed trip map (web): driven path drawn bold (solid orange, white casing) and road-snapped via `routingService` (≤12 points, ≤11 cached calls, 3 at a time; failed/detour gaps stay straight); planned route faded; start / end dots with times; legend (Driven / Planned); map card reads "Trip completed · Driven route shown on map" (or last location / no GPS). Live trips unchanged; native map unchanged.
- Trip map halts + GPS pings (web), in the existing map colours (orange route, blue planned band, green pickup / amber drop pins unchanged): pings where the driver stayed within 100 m for ≥5 min become one dark halt pill ("25 min"; red dot when > 1 hr; turns orange while its card is open). Every GPS ping is a white bead with a dark-orange ring, always visible (thinned only when dots overlap on screen; hover = time, tap = card with place looked up on tap). Completed trips: green start ring + "Start · time" tag, dark-orange end ring + "End · time" tag, moving gaps with no GPS drawn dashed grey along the road (road-routed like the rest of the path) with "No signal · 40 min" — only on trails that normally ping every ≤ 5 min and only when the gap is ≥ 15 min and ≥ 4× the usual step (sparse 12-ping trails never show it); gap tags hide while they would overlap the start/end tags or a halt, top-left trip card (Completed · date, pickup → drop, time range, Moving / Stopped / GPS pings, collapsible timeline Started → halts → Ended with place names, key). Replaces the earlier top-right legend. Live trips: ping dots restyled to the same bead, halt pills, and a collapsed "Tracked so far" card only when there are halts; dashed line, arrows, ETA box, driver pin unchanged. Completed path builder keeps the last point of a ≥5 min stay so halt length is known. Display only — no tracking, interval or DB change.
- Fleet invite popup (driver): with two or more pending invites, ‹ 1/2 › arrows in the header switch between offers (newest first). Accept closes the popup and hides the other invites for the session (they stay pending; driver can still decline them; server already refuses a second fleet). Decline shows the next invite. Remind me later still hides all at once. No DB change.

## Why
- Driver / DCO Self surfaces needed mode-aware UI and book routing so Self vs fleet work does not hit the wrong gates or books.
- Lagged `booking_ref_seq` vs existing refs caused unique violations after paid DCO awards (“could not confirm your job after payment”).
- Offline market hire of an approved DCO’s truck was refused as an employee-driver assignment even when the row was `tracking_only` on a market-hire trip.
- Drivers were leaving fleets without a pending-pay warning or owner notification, and could request DCO while still employed; approval must follow disconnect + admin.
- Live tracking showed the driver every ~30 min+ (ETA ÷ 12 pings) and stopped when the screen was off; pushing faster pings into `driver_locations` would spam trip chat and fan out `trips` updates, so live position goes over broadcast instead.
- OSM tags Chennai corporation wards as the area's neighbourhood, so picking "Madhavaram" in search saved "Ward 30, Tamil Nadu".
- Fleet invites: only the newest invite was reachable — the popup showed `[0]` with a 1/2 badge and no way to see Fleet A's offer once Fleet B invited the same driver.

## Areas
- `lib/crypto/sha256File.util.ts` (+ unit test) — web odometer / Pulse Scan fingerprint
- `features/trips/verification/hooks/useOdometerPhotoOcr.ts`, `features/ocr/services/ocrQuota.service.ts`
- `features/trips/operations/shared/OpsEntryBodyPhotoSlot.tsx`
- `supabase/migrations/20271113110000_ocr_jobs_insert_allow_trip_access.sql`
- `app/(driver)/**`, `components/driver/DriverTabBar.tsx`
- `features/driver/**`, `features/drivers/**`, `features/dco-self/**`
- `features/marketplace/services/exchangePayments.service.ts` (+ tests)
- `features/trips/utils/driverAssignerDisplay.util.ts` (+ tests)
- `features/drivers/utils/fleetDisconnectWarning.util.ts` (+ tests)
- `features/network/services/networkNotifications.service.ts`, `networkNotificationLabels.util.ts`
- `components/AlertRegistryPanel.tsx`, `lib/globalSync/registryFeed.util.ts`
- `lib/queries/useDriverOperatingModeQuery.ts`
- `docs/RBAC_OPERATING_MODEL_CHANGELOG.md`
- `supabase/migrations/20271113100000_booking_ref_skip_taken_refs.sql`
- `supabase/migrations/20271113101500_dco_allow_offline_market_hire_trip.sql`
- `supabase/migrations/20271113103000_fleet_disconnect_notify_and_dco_request_gate.sql`
- `supabase/migrations/20271113104500_dco_require_verified_kyc.sql`, `features/driver/components/DcoStatusScreen.tsx`, `lib/queryKeys.ts`, `analytics/src/lib/dco.ts`, `analytics/src/components/queue/DcoReviewPanel.tsx`, `analytics/src/components/queue/DriverKycPanel.tsx`, `analytics/src/lib/driverKyc.ts`, `features/drivers/screens/DriverDocumentsScreen.tsx`, `features/drivers/services/driverKycDocuments.service.ts`
- `supabase/tests/dco_operating_model_boundary.sql`
- `features/tracking/**` (driverLiveTracking.service, driverLiveLocationTask.service, useDriverLiveTracking, constants, flags, movement filter, map store, checkpoint service + tests), `features/driver/communication/hooks/useDriverLocationStream.ts`, `features/trips/components/trip-detail/hooks/useTripDetail.ts`, `app/_layout.tsx`, `app.config.js` (expo-location plugin: background + foreground service), `types/expo-location.d.ts`, `package.json` (`expo-task-manager`)
- `components/driver/DriverInviteModal.tsx` (queue arrows), `contexts/DriverInviteModalContext.tsx` (active invite, next/prev, hide others after accept)

## Migrations
- `20271113100000_booking_ref_skip_taken_refs.sql`
- `20271113101500_dco_allow_offline_market_hire_trip.sql`
- `20271113103000_fleet_disconnect_notify_and_dco_request_gate.sql`
- `20271113104500_dco_require_verified_kyc.sql`
- `20271113110000_ocr_jobs_insert_allow_trip_access.sql`
- Not applied from this branch. Nihas applies to preprod after merge; Vasanth applies to prod on release.
- `lib/maps/placeSearch.util.ts` (`cleanOsmAreaName`), `lib/placesService.ts`, `lib/placeCityState.util.ts`, `lib/mapLocationLabel.service.ts` (+ `lib/__tests__/placeWardName.test.ts`)
- `lib/placesService.ts` (`searchGooglePlaces` → Places API (New), `resolvePlaceSelection`, `isPendingGooglePlace`), `features/trips/components/add-trip/LocationSearchField.tsx` (+ `lib/__tests__/placesGoogleNew.test.ts`)
- `features/trips/utils/completedTripPath.util.ts`, `features/trips/hooks/useCompletedTripPath.ts` (+ test), `useTripDetail.ts` (`completedTripPath`), `TripDetailScreen.tsx` (map trail for completed trips), `lib/queryKeys.ts` (`tracking.completedTripPath`)
- `features/trips/components/trip-detail/TripMap.web.tsx` (`completedTrip` prop, `snapDrivenPathToRoads`), `TripMap.tsx` (prop type), `TripDetailScreen.tsx` (pass prop, card text)
- `features/trips/utils/tripHalts.util.ts` (+ test), `features/trips/components/trip-detail/tripMapTrailMarkers.web.ts`, `TripMap.web.tsx` (halt pills, cards, timeline, arrows, zoom-gated dots), `completedTripPath.util.ts` (keep halt end point, + tests)

## Tested
- not clicked through
