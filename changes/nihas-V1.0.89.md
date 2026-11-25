# nihas-V1.0.89

- Round started from V1 2e5a1a321.

## Trips RLS: evaluate two checks once per query
- Same access, computed once per statement instead of once per row (platform-admin read policy and the org-staff check in "Org members can manage trips"). Prod measurement: the two policy terms 185 ms -> 33 ms with an identical result set. Set trips-rls-hoist; preprod timing and the before/after equivalence diff come before any release.

- Measured on preprod (applied, equivalence diff empty for 333 users): count(*) on trips 345-436 ms -> ~52 ms. search_trips_for_org and the other trips RPCs are SECURITY DEFINER, so this does not change them.
