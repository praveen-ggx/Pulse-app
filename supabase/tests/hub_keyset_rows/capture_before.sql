-- Before 20271116100100: walk the deployed function (counts on every page).
CREATE TEMP TABLE hub_before ON COMMIT DROP AS
SELECT c.case_id, w.* FROM hub_cases c, LATERAL pg_temp.hub_walk(c, 'list_org_hub_trips_keyset', 'list_org_hub_trips_keyset') w;
