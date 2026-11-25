-- =============================================================================
-- OLD DATA: TN13Y7553 wrong size (24 MT → 20 FT) + identify Apollo mismatches
-- =============================================================================
-- Owner org: SIVAN E (not GOGOVAN). Run only after Daisy/Nihas approve.
-- Read-only sections are safe; the UPDATE is gated and must be run deliberately.
-- After UPDATE, Compliance/Advance still prefer indent type (app + migration
-- 20271125110000); fixing the vehicle cleans the master for fleet screens.
--
-- Capacity: peer Closed Container · 20 FT units in the same fleet are 6–7.
-- Daisy must confirm capacity before changing `capacity` from 12.
-- =============================================================================

-- 1) Current vehicle master
SELECT id, organization_id, vehicle_number, vehicle_type, vehicle_body_type,
       vehicle_size, capacity, created_at, updated_at
FROM public.vehicles
WHERE vehicle_number ILIKE '%TN13Y7553%';

-- 2) Affected Apollo trips on this plate (display will follow indent after code
--    deploy; this list is for Finance re-check of "truck type mismatch" rejects)
SELECT t.trip_operational_code, t.display_trip_id, t.trip_code, t.client_name,
       t.status, t.client_price, t.supplier_rate, t.compliance_decline_reason,
       i.vehicle_type AS indent_truck_type,
       v.vehicle_type AS vehicle_type, v.vehicle_size, v.capacity
FROM public.trips t
JOIN public.vehicles v ON v.id = t.vehicle_id
LEFT JOIN public.indents i ON i.id = COALESCE(t.indent_id, t.source_indent_id)
WHERE v.vehicle_number ILIKE '%TN13Y7553%'
  AND t.deleted_at IS NULL
ORDER BY t.created_at DESC;

-- 3) TN18AH7051 / trip 002650 — size already 20 FT; confirm body with Daisy
--    (Open Body Truck · Half Body vs Closed Container). No UPDATE in this PR.
SELECT id, organization_id, vehicle_number, vehicle_type, vehicle_body_type,
       vehicle_size, capacity, created_at, updated_at
FROM public.vehicles
WHERE vehicle_number ILIKE '%TN18AH7051%';

SELECT t.trip_operational_code, t.display_trip_id, t.trip_code, t.client_name,
       t.status, i.vehicle_type AS indent_truck_type,
       v.vehicle_type, v.vehicle_body_type, v.vehicle_size, v.capacity
FROM public.trips t
JOIN public.vehicles v ON v.id = t.vehicle_id
LEFT JOIN public.indents i ON i.id = COALESCE(t.indent_id, t.source_indent_id)
WHERE v.vehicle_number ILIKE '%TN18AH7051%'
  AND t.deleted_at IS NULL
  AND (
    t.display_trip_id ILIKE '%002650%'
    OR t.trip_operational_code ILIKE '%002650%'
    OR t.trip_code ILIKE '%002650%'
  )
ORDER BY t.created_at DESC;

-- 4) APPLY (owner-approved only): size → 20 FT. Capacity left unchanged until Daisy confirms.
-- UPDATE public.vehicles
-- SET vehicle_size = '20 FT',
--     updated_at = now()
-- WHERE id = '1a812c51-06ad-4c30-b226-8ac5cf133d4b'
--   AND vehicle_number ILIKE '%TN13Y7553%'
--   AND vehicle_size IS DISTINCT FROM '20 FT';

-- 5) Optional capacity once Daisy confirms (example peer value 6.5 — DO NOT run blindly)
-- UPDATE public.vehicles
-- SET capacity = '6.5',
--     updated_at = now()
-- WHERE id = '1a812c51-06ad-4c30-b226-8ac5cf133d4b'
--   AND vehicle_number ILIKE '%TN13Y7553%';
