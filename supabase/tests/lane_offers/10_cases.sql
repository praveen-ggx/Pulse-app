-- Lane offers suite. Runs after pooled_marketplace/05_helpers.sql and
-- 06_fixtures_stub.sql. Fixture visibility: SHIP1 -> B1 (Network). B2 is not
-- linked to SHIP1. u_ship is SHIP1 admin, u_dco_m is a SHIP1 driver member.

CREATE TABLE t_lo (name text PRIMARY KEY, id uuid NOT NULL);
GRANT SELECT ON t_lo TO PUBLIC;
CREATE FUNCTION t_lo(p text) RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT id FROM t_lo WHERE name = p $$;
CREATE FUNCTION t_lo_put(p text, p_id uuid) RETURNS uuid LANGUAGE sql AS $$ INSERT INTO t_lo VALUES (p, p_id) RETURNING id $$;

CREATE FUNCTION t_lane(p_uid uuid, p_indent uuid, p_limit int DEFAULT 50, p_amount numeric DEFAULT NULL, p_key text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql AS $$
  SELECT t_exec_as(p_uid, format('SELECT public.list_lane_offers_for_indent(%L, %s, %L, %L)', p_indent, p_limit, p_amount, p_key))
$$;
CREATE FUNCTION t_invite(p_uid uuid, p_indent uuid, p_kind text, p_source uuid) RETURNS jsonb LANGUAGE sql AS $$
  SELECT t_exec_as(p_uid, format('SELECT public.invite_lane_bidder(%L, %L, %L)', p_indent, p_kind, p_source))
$$;
CREATE FUNCTION t_respond(p_uid uuid, p_invite uuid, p_accept boolean) RETURNS jsonb LANGUAGE sql AS $$
  SELECT t_exec_as(p_uid, format('SELECT public.respond_lane_bid_invite(%L, %L)', p_invite, p_accept))
$$;
CREATE FUNCTION t_my_invites(p_uid uuid) RETURNS jsonb LANGUAGE sql AS $$
  SELECT t_exec_as(p_uid, 'SELECT public.list_my_lane_bid_invites(50, NULL, NULL)')
$$;
CREATE FUNCTION t_commit(p_org uuid, p_key text, p_amount numeric, p_limit int, p_awarded int DEFAULT 0,
  p_valid timestamptz DEFAULT now() + interval '7 days', p_status text DEFAULT 'active')
RETURNS uuid LANGUAGE sql AS $$
  INSERT INTO public.network_pool_bid_commits (bidder_organization_id, pool_key, amount, vehicle_limit, awarded_count, valid_until, status)
  VALUES (p_org, p_key, p_amount, p_limit, p_awarded, p_valid, p_status) RETURNING id
$$;
CREATE FUNCTION t_pool_quote(p_indent uuid, p_org uuid) RETURNS public.direct_quotes LANGUAGE sql STABLE AS $$
  SELECT * FROM public.direct_quotes WHERE indent_id = p_indent AND bidder_organization_id = p_org
$$;
CREATE FUNCTION t_item(p jsonb, p_kind text, p_source uuid) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT e FROM jsonb_array_elements(coalesce(p -> 'items', '[]'::jsonb)) e
  WHERE e ->> 'kind' = p_kind AND (e ->> 'source_id')::uuid = p_source LIMIT 1
$$;

UPDATE public.profiles SET full_name = 'Dco Ravi' WHERE id = t_id('u_dco');
INSERT INTO public.organizations (id, name) VALUES ('e1000000-0000-0000-0000-0000000000a1', 'Unlinked Carrier');
INSERT INTO t_ids VALUES ('B3', 'e1000000-0000-0000-0000-0000000000a1'), ('u_b3', 'e2000000-0000-0000-0000-0000000000a1');
INSERT INTO public.profiles (id, role) VALUES (t_id('u_b3'), 'member');
INSERT INTO public.organization_members (organization_id, user_id, role) VALUES (t_id('B3'), t_id('u_b3'), 'admin');

-- ── A. Offers on sibling indents of the same lane ───────────────────────────
SELECT t_lo_put('s1', t_indent(t_id('SHIP1'), 'LO Periya', 'LO Coimbatore', '32FT', 'both'));
SELECT t_lo_put('other_lane', t_indent(t_id('SHIP1'), 'LO Periya', 'LO Coimbatore', '20FT', 'both'));
SELECT t_lo_put('ship2_s', t_indent(t_id('SHIP2'), 'LO Periya', 'LO Coimbatore', '32FT', 'both'));
SELECT t_lo_put('s_cxl', t_indent(t_id('SHIP1'), 'LO Periya', 'LO Coimbatore', '32FT', 'both', 'cancelled'));

SELECT t_lo_put('bid_dco', (t_bid(t_id('u_dco'), t_lo('s1'), 31500, NULL, t_id('V1')) ->> 'bid_id')::uuid);
SELECT t_lo_put('bid_b2', (t_bid(t_id('u_other'), t_lo('s1'), 32000, t_id('B2'), NULL) ->> 'bid_id')::uuid);
SELECT t_lo_put('q_b1', (t_exec_as(t_id('u_bid1'), t_quote_sql(t_lo('s1'), t_id('B1'), 30000)) ->> 'quote_id')::uuid);
SELECT t_bid(t_id('u_dco'), t_lo('other_lane'), 15000, NULL, t_id('V1'));
SELECT t_bid(t_id('u_other'), t_lo('ship2_s'), 25000, t_id('B2'), NULL);
INSERT INTO public.market_bids (indent_id, bidder_type, bidder_user_id, amount)
VALUES (t_lo('s_cxl'), 'dco', t_id('u_dco_m'), 1000);

-- Same lane after trim + case folding, Network only.
SELECT t_lo_put('n1', t_indent(t_id('SHIP1'), '  lo periya ', 'LO COIMBATORE', '32ft', 'integrated_supplier'));

DO $$
DECLARE
  r jsonb := t_lane(t_id('u_ship'), t_lo('n1'));
  dco jsonb := t_item(r, 'market_bid', t_lo('bid_dco'));
  b2 jsonb := t_item(r, 'market_bid', t_lo('bid_b2'));
  b1 jsonb := t_item(r, 'network_quote', t_lo('q_b1'));
BEGIN
  PERFORM t_ok('Lane: new indent sees all 3 pending offers from its open sibling',
    (r ->> 'total_count')::int = 3 AND jsonb_array_length(r -> 'items') = 3, r::text);
  PERFORM t_ok('Lane: channel counts and cheapest per channel',
    (r ->> 'network_count')::int = 1 AND (r ->> 'marketplace_count')::int = 2
      AND (r ->> 'min_network_amount')::numeric = 30000 AND (r ->> 'min_marketplace_amount')::numeric = 31500, r::text);
  PERFORM t_ok('Lane: ordered cheapest first',
    (r -> 'items' -> 0 ->> 'amount')::numeric = 30000 AND (r -> 'items' -> 2 ->> 'amount')::numeric = 32000, r::text);
  PERFORM t_ok('Lane: DCO name, source indent and Marketplace blocker on a Network-only load',
    dco ->> 'bidder_name' = 'Dco Ravi' AND (dco ->> 'source_indent_id')::uuid = t_lo('s1')
      AND dco ->> 'invite_blocker' = 'needs_marketplace' AND dco ->> 'channel' = 'marketplace', coalesce(dco::text, r::text));
  PERFORM t_ok('Lane: org Marketplace bidder named by org',
    b2 ->> 'bidder_name' = 'Other Org' AND b2 ->> 'bidder_type' = 'organization', coalesce(b2::text, r::text));
  PERFORM t_ok('Lane: Network quote from a linked carrier is invitable',
    b1 IS NOT NULL AND b1 ->> 'invite_blocker' IS NULL AND b1 ->> 'channel' = 'network', coalesce(b1::text, r::text));
  PERFORM t_ok('Lane: no other vehicle type, other shipper or cancelled sibling leaks in',
    NOT EXISTS (SELECT 1 FROM jsonb_array_elements(r -> 'items') e WHERE (e ->> 'amount')::numeric IN (15000, 25000, 1000)), r::text);
  PERFORM t_ok('Lane: flags for the target channels', (r ->> 'network_open')::boolean AND NOT (r ->> 'marketplace_open')::boolean, r::text);
END $$;

SELECT t_err_as('Lane: carrier staff cannot read a shipper''s lane offers', t_id('u_bid1'),
  format('SELECT public.list_lane_offers_for_indent(%L)', t_lo('n1')), 'unauthorized');
SELECT t_err_as('Lane: shipper driver member cannot read lane offers', t_id('u_dco_m'),
  format('SELECT public.list_lane_offers_for_indent(%L)', t_lo('n1')), 'unauthorized');
SELECT t_err_as('Lane: anon has no execute', NULL,
  format('SELECT public.list_lane_offers_for_indent(%L)', t_lo('n1')), 'permission denied', 'anon');
SELECT t_err_as('Lane: half a cursor is rejected', t_id('u_ship'),
  format('SELECT public.list_lane_offers_for_indent(%L, 10, 100, NULL)', t_lo('n1')), 'invalid_cursor');
SELECT t_err_as('Lane: internal link helper is not callable by clients', t_id('u_ship'),
  format('SELECT public._org_network_link_exists(%L, %L)', t_id('SHIP1'), t_id('B1')), 'permission denied');
SELECT t_err_as('Lane: internal attach is not callable by clients', t_id('u_ship'),
  format('SELECT public._attach_lane_commitments(%L)', t_lo('n1')), 'permission denied');

-- ── B. Invite, carrier consent ──────────────────────────────────────────────
SELECT t_err_as('Invite: Marketplace bidder needs a Marketplace-shared load', t_id('u_ship'),
  format('SELECT public.invite_lane_bidder(%L, %L, %L)', t_lo('n1'), 'market_bid', t_lo('bid_dco')), 'needs_marketplace');
SELECT t_err_as('Invite: carrier cannot invite itself onto a shipper load', t_id('u_bid1'),
  format('SELECT public.invite_lane_bidder(%L, %L, %L)', t_lo('n1'), 'network_quote', t_lo('q_b1')), 'unauthorized');
SELECT t_err_as('Invite: source from another lane is refused', t_id('u_ship'),
  format('SELECT public.invite_lane_bidder(%L, %L, %L)', t_lo('other_lane'), 'network_quote', t_lo('q_b1')), 'source_not_found');

DO $$
DECLARE
  a jsonb := t_invite(t_id('u_ship'), t_lo('n1'), 'network_quote', t_lo('q_b1'));
  b jsonb := t_invite(t_id('u_ship'), t_lo('n1'), 'network_quote', t_lo('q_b1'));
  nn public.network_notifications;
BEGIN
  PERFORM t_lo_put('inv_b1', (a ->> 'invite_id')::uuid);
  SELECT * INTO nn FROM public.network_notifications WHERE dedupe_key = 'lane_invite:' || (a ->> 'invite_id');
  PERFORM t_ok('Invite: Network invite created once, repeat returns the same pending invite',
    (a ->> 'created')::boolean AND NOT (b ->> 'created')::boolean AND a ->> 'invite_id' = b ->> 'invite_id', a::text || b::text);
  PERFORM t_ok('Invite: Network carrier gets a rate-request notification naming the shipper and load',
    nn.organization_id = t_id('B1') AND nn.actor_org_id = t_id('SHIP1') AND nn.event_type = 'quote_requested'
      AND nn.amount_meta = 30000 AND nn.indent_id = t_lo('n1')
      AND nn.payload_json ->> 'kind' = 'lane_bid_invite' AND nn.payload_json ->> 'channel' = 'network'
      AND (nn.payload_json ->> 'lane_invite_id')::uuid = (a ->> 'invite_id')::uuid
      AND nn.payload_json ? 'indent_code', coalesce(row_to_json(nn)::text, 'none'));
  PERFORM t_ok('Invite: no bid exists on the new load until the carrier accepts',
    NOT EXISTS (SELECT 1 FROM public.direct_quotes WHERE indent_id = t_lo('n1') AND bidder_organization_id = t_id('B1')), '');
  PERFORM t_ok('Invite: lane list shows the pending invite',
    t_item(t_lane(t_id('u_ship'), t_lo('n1')), 'network_quote', t_lo('q_b1')) ->> 'invite_status' = 'pending', '');
END $$;

UPDATE public.indents SET circulation_target = 'both' WHERE id = t_lo('n1');

DO $$
DECLARE
  a jsonb := t_invite(t_id('u_ship'), t_lo('n1'), 'market_bid', t_lo('bid_dco'));
  mine jsonb;
BEGIN
  PERFORM t_lo_put('inv_dco', (a ->> 'invite_id')::uuid);
  mine := t_my_invites(t_id('u_dco'));
  PERFORM t_ok('Invite: Marketplace invite after posting to Marketplace',
    (a ->> 'created')::boolean, a::text);
  PERFORM t_ok('Invite: DCO inbox lists it, shipper name hidden on Marketplace',
    (mine ->> 'total_count')::int = 1 AND mine -> 'items' -> 0 ->> 'shipper_name' IS NULL
      AND (mine -> 'items' -> 0 ->> 'amount')::numeric = 31500, mine::text);
  PERFORM t_ok('Invite: B1 inbox shows the Network invite with the shipper name',
    (t_my_invites(t_id('u_bid1')) -> 'items' -> 0 ->> 'shipper_name') = 'Shipper One', '');
  PERFORM t_ok('Invite: other carriers see nothing',
    (t_my_invites(t_id('u_other')) ->> 'total_count')::int = 0, '');
END $$;

-- Marketplace anonymity: the bidder learns the lane and rate, never the shipper
-- or the load, in the notification row, the inbox RPC, or the table itself.
SELECT t_lo_put('inv_b2', (t_invite(t_id('u_ship'), t_lo('n1'), 'market_bid', t_lo('bid_b2')) ->> 'invite_id')::uuid);
DO $$
DECLARE
  nn public.network_notifications;
  mine jsonb := t_my_invites(t_id('u_other'));
  item jsonb := mine -> 'items' -> 0;
  b1_item jsonb := t_my_invites(t_id('u_bid1')) -> 'items' -> 0;
  code text := (SELECT coalesce(to_jsonb(i) ->> 'indent_operational_code', i.indent_number)
                FROM public.indents i WHERE i.id = t_lo('n1'));
BEGIN
  SELECT * INTO nn FROM public.network_notifications WHERE dedupe_key = 'lane_invite:' || t_lo('inv_b2');
  PERFORM t_ok('Privacy: Marketplace notification has no shipper org, no load id, no load code',
    nn.organization_id = t_id('B2') AND nn.actor_org_id IS NULL AND nn.indent_id IS NULL
      AND nn.title = 'Marketplace rate request' AND nn.amount_meta = 32000
      AND nn.payload_json ->> 'kind' = 'lane_bid_invite' AND nn.payload_json ->> 'channel' = 'marketplace'
      AND NOT nn.payload_json ? 'indent_code' AND NOT nn.payload_json ? 'indent_id'
      AND position(code IN row_to_json(nn)::text) = 0
      AND position('Shipper One' IN row_to_json(nn)::text) = 0
      AND position(t_id('SHIP1')::text IN row_to_json(nn)::text) = 0,
    coalesce(row_to_json(nn)::text, 'none'));
  PERFORM t_ok('Privacy: Marketplace inbox RPC returns no shipper name and no load code',
    (mine ->> 'total_count')::int = 1 AND item ->> 'channel' = 'marketplace'
      AND item ->> 'shipper_name' IS NULL AND item ->> 'indent_number' IS NULL
      AND position(code IN mine::text) = 0 AND position('Shipper One' IN mine::text) = 0
      AND position(t_id('SHIP1')::text IN mine::text) = 0, mine::text);
  PERFORM t_ok('Privacy: Network inbox keeps the shipper name and load code',
    b1_item ->> 'channel' = 'network' AND b1_item ->> 'shipper_name' = 'Shipper One'
      AND b1_item ->> 'indent_number' = code, coalesce(b1_item::text, 'none'));
  PERFORM t_ok('Privacy: Marketplace bidders cannot read invite rows directly (org and DCO)',
    (t_exec_as(t_id('u_other'), 'SELECT to_jsonb(count(*)) FROM public.lane_bid_invites'))::text::int = 0
      AND (t_exec_as(t_id('u_dco'), 'SELECT to_jsonb(count(*)) FROM public.lane_bid_invites'))::text::int = 0, '');
  PERFORM t_ok('Privacy: Network bidder and shipper still read their invite rows',
    (t_exec_as(t_id('u_bid1'), 'SELECT to_jsonb(count(*)) FROM public.lane_bid_invites'))::text::int = 1
      AND (t_exec_as(t_id('u_ship'), 'SELECT to_jsonb(count(*)) FROM public.lane_bid_invites'))::text::int = 3, '');
END $$;

SELECT t_err_as('Respond: another carrier cannot accept', t_id('u_other'),
  format('SELECT public.respond_lane_bid_invite(%L, true)', t_lo('inv_dco')), 'unauthorized');
SELECT t_err_as('Respond: shipper cannot accept on the carrier''s behalf', t_id('u_ship'),
  format('SELECT public.respond_lane_bid_invite(%L, true)', t_lo('inv_dco')), 'unauthorized');

DO $$
DECLARE
  a jsonb := t_respond(t_id('u_dco'), t_lo('inv_dco'), true);
  d jsonb := t_respond(t_id('u_bid2'), t_lo('inv_b1'), false);
  mb public.market_bids;
  r jsonb;
BEGIN
  SELECT * INTO mb FROM public.market_bids WHERE indent_id = t_lo('n1') AND bidder_user_id = t_id('u_dco');
  PERFORM t_ok('Respond: DCO accept writes a normal pending Marketplace bid at the invited rate',
    a ->> 'status' = 'accepted' AND mb.amount = 31500 AND mb.status = 'pending' AND mb.owner_vehicle_id = t_id('V1')
      AND (SELECT result_market_bid_id FROM public.lane_bid_invites WHERE id = t_lo('inv_dco')) = mb.id,
    a::text);
  PERFORM t_ok('Respond: B1 dispatcher declines; no quote written',
    d ->> 'status' = 'declined'
      AND NOT EXISTS (SELECT 1 FROM public.direct_quotes WHERE indent_id = t_lo('n1') AND bidder_organization_id = t_id('B1')), d::text);
  r := t_lane(t_id('u_ship'), t_lo('n1'));
  PERFORM t_ok('Lane: carrier now bidding on this load drops out; declined shows as declined',
    t_item(r, 'market_bid', t_lo('bid_dco')) IS NULL
      AND t_item(r, 'network_quote', t_lo('q_b1')) ->> 'invite_status' = 'declined', r::text);
  PERFORM t_ok('Respond: inboxes are empty after answering',
    (t_my_invites(t_id('u_dco')) ->> 'total_count')::int = 0 AND (t_my_invites(t_id('u_bid1')) ->> 'total_count')::int = 0, '');
END $$;

DO $$
DECLARE
  again jsonb := t_respond(t_id('u_dco'), t_lo('inv_dco'), true);
BEGIN
  PERFORM t_ok('Respond: a repeated accept returns the first outcome and writes nothing new',
    again ->> 'status' = 'accepted' AND (again ->> 'already_responded')::boolean
      AND (again ->> 'market_bid_id')::uuid = (SELECT result_market_bid_id FROM public.lane_bid_invites WHERE id = t_lo('inv_dco'))
      AND (SELECT count(*) FROM public.market_bids WHERE indent_id = t_lo('n1') AND bidder_user_id = t_id('u_dco')) = 1,
    again::text);
END $$;
SELECT t_err_as('Respond: an accepted invite cannot be declined afterwards', t_id('u_dco'),
  format('SELECT public.respond_lane_bid_invite(%L, false)', t_lo('inv_dco')), 'invite_not_pending');
SELECT t_err_as('Invite: carrier already on the load cannot be invited', t_id('u_ship'),
  format('SELECT public.invite_lane_bidder(%L, %L, %L)', t_lo('n1'), 'market_bid', t_lo('bid_dco')), 'already_bid');

-- Re-invite after decline is allowed (a new pending row), then the load closes.
DO $$
DECLARE
  a jsonb := t_invite(t_id('u_ship'), t_lo('n1'), 'network_quote', t_lo('q_b1'));
  x jsonb;
BEGIN
  UPDATE public.indents SET status = 'cancelled' WHERE id = t_lo('n1');
  PERFORM t_ok('Respond: invite on a closed load is hidden from the inbox',
    (t_my_invites(t_id('u_bid1')) ->> 'total_count')::int = 0, '');
  x := t_respond(t_id('u_bid1'), (a ->> 'invite_id')::uuid, true);
  PERFORM t_ok('Respond: accepting on a closed load expires the invite, writes no quote',
    x ->> 'status' = 'expired'
      AND NOT EXISTS (SELECT 1 FROM public.direct_quotes WHERE indent_id = t_lo('n1') AND bidder_organization_id = t_id('B1')), x::text);
END $$;

-- Network invite accepted: quote written through submit_network_quote.
SELECT t_lo_put('n1b', t_indent(t_id('SHIP1'), 'LO Periya', 'LO Coimbatore', '32FT', 'integrated_supplier'));
DO $$
DECLARE
  a jsonb := t_invite(t_id('u_ship'), t_lo('n1b'), 'network_quote', t_lo('q_b1'));
  x jsonb := t_respond(t_id('u_bid1'), (a ->> 'invite_id')::uuid, true);
  q public.direct_quotes := t_pool_quote(t_lo('n1b'), t_id('B1'));
BEGIN
  PERFORM t_ok('Respond: Network accept writes a pending quote at the rate, not awarded',
    x ->> 'status' = 'accepted' AND q.amount = 30000 AND q.status = 'pending' AND q.pool_commit_id IS NULL, x::text);
END $$;

-- ── G. Accepting never overwrites an offer the carrier already has ─────────
SELECT t_lo_put('g1', t_indent(t_id('SHIP1'), 'LO Periya', 'LO Coimbatore', '32FT', 'both'));
SELECT t_lo_put('g1_inv_b1', (t_invite(t_id('u_ship'), t_lo('g1'), 'network_quote', t_lo('q_b1')) ->> 'invite_id')::uuid);
SELECT t_lo_put('g1_inv_dco', (t_invite(t_id('u_ship'), t_lo('g1'), 'market_bid', t_lo('bid_dco')) ->> 'invite_id')::uuid);
-- After being invited, both carriers offer on the load themselves.
SELECT t_exec_as(t_id('u_bid2'), t_quote_sql(t_lo('g1'), t_id('B1'), 30500));
SELECT t_bid(t_id('u_dco'), t_lo('g1'), 31000, NULL, t_id('V1'));

DO $$
DECLARE
  a jsonb := t_respond(t_id('u_bid1'), t_lo('g1_inv_b1'), true);
  d jsonb := t_respond(t_id('u_dco'), t_lo('g1_inv_dco'), true);
  again jsonb;
BEGIN
  PERFORM t_ok('Protect: a direct quote placed after the invite is kept; the invite is superseded',
    a ->> 'status' = 'superseded' AND a ->> 'reason' = 'already_offered'
      AND (t_pool_quote(t_lo('g1'), t_id('B1'))).amount = 30500
      AND (SELECT count(*) FROM public.direct_quotes WHERE indent_id = t_lo('g1') AND bidder_organization_id = t_id('B1')) = 1
      AND (SELECT status FROM public.lane_bid_invites WHERE id = t_lo('g1_inv_b1')) = 'superseded', a::text);
  PERFORM t_ok('Protect: a Marketplace bid placed after the invite is kept; the invite is superseded',
    d ->> 'status' = 'superseded'
      AND (SELECT amount FROM public.market_bids WHERE indent_id = t_lo('g1') AND bidder_user_id = t_id('u_dco')) = 31000
      AND (SELECT count(*) FROM public.market_bids WHERE indent_id = t_lo('g1') AND bidder_user_id = t_id('u_dco')) = 1, d::text);
  again := t_respond(t_id('u_bid2'), t_lo('g1_inv_b1'), true);
  PERFORM t_ok('Protect: retrying a superseded invite returns the same outcome',
    again ->> 'status' = 'superseded' AND (again ->> 'already_responded')::boolean
      AND (t_pool_quote(t_lo('g1'), t_id('B1'))).amount = 30500, again::text);
END $$;

-- A lane rate attached after the invite: the pool quote and its commitment are untouched.
SELECT t_lo_put('g2', t_indent(t_id('SHIP1'), 'LO Periya', 'LO Coimbatore', '32FT', 'both'));
SELECT t_lo_put('g2_inv', (t_invite(t_id('u_ship'), t_lo('g2'), 'network_quote', t_lo('q_b1')) ->> 'invite_id')::uuid);
SELECT t_lo_put('c_g', t_commit(t_id('B1'), 'lo periya|lo coimbatore|32ft', 28000, 2));
SELECT t_exec_as(t_id('u_ship'), format('SELECT public.attach_lane_commitments_for_indent(%L)', t_lo('g2')));
DO $$
DECLARE
  x jsonb := t_respond(t_id('u_bid1'), t_lo('g2_inv'), true);
  q public.direct_quotes := t_pool_quote(t_lo('g2'), t_id('B1'));
  c public.network_pool_bid_commits;
BEGIN
  SELECT * INTO c FROM public.network_pool_bid_commits WHERE id = t_lo('c_g');
  PERFORM t_ok('Protect: a lane rate attached after the invite keeps its rate and pool_commit_id',
    x ->> 'status' = 'superseded' AND q.amount = 28000 AND q.pool_commit_id = t_lo('c_g') AND q.status = 'pending'
      AND q.notes IS NULL, x::text || coalesce(row_to_json(q)::text, 'none'));
  PERFORM t_ok('Protect: the commitment is not consumed and has exactly one attached quote',
    c.awarded_count = 0 AND c.status = 'active'
      AND (SELECT count(*) FROM public.direct_quotes WHERE pool_commit_id = t_lo('c_g')) = 1, row_to_json(c)::text);
END $$;
UPDATE public.network_pool_bid_commits SET status = 'superseded' WHERE id = t_lo('c_g');

-- Concurrency, with real separate sessions (dblink inside this disposable container).
CREATE EXTENSION IF NOT EXISTS dblink;
CREATE FUNCTION t_session(p_name text, p_uid uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM dblink_connect(p_name, 'dbname=postgres user=postgres');
  PERFORM dblink_exec(p_name, format('SET request.jwt.claim.sub TO %L', p_uid));
  PERFORM dblink_exec(p_name, 'SET role authenticated');
END $$;
-- True once a session other than this one is blocked on a lock running p_like.
CREATE FUNCTION t_wait_blocked(p_like text) RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  FOR i IN 1..200 LOOP
    PERFORM pg_stat_clear_snapshot();
    IF EXISTS (
      SELECT 1 FROM pg_stat_activity
      WHERE pid <> pg_backend_pid() AND wait_event_type = 'Lock' AND query LIKE p_like
    ) THEN
      RETURN true;
    END IF;
    PERFORM pg_sleep(0.05);
  END LOOP;
  RETURN false;
END $$;
CREATE FUNCTION t_session_result(p_name text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text;
BEGIN
  SELECT x INTO v FROM dblink_get_result(p_name) AS t(x text);
  PERFORM 1 FROM dblink_get_result(p_name) AS t(x text);
  RETURN v;
END $$;

SELECT t_lo_put('g3', t_indent(t_id('SHIP1'), 'LO Periya', 'LO Coimbatore', '32FT', 'both'));
SELECT t_lo_put('g3_inv', (t_invite(t_id('u_ship'), t_lo('g3'), 'network_quote', t_lo('q_b1')) ->> 'invite_id')::uuid);
DO $$
DECLARE
  r1 jsonb;
  r2 jsonb;
  v_blocked boolean;
BEGIN
  PERFORM t_session('c1', t_id('u_bid1'));
  PERFORM t_session('c2', t_id('u_bid2'));
  PERFORM dblink_exec('c1', 'BEGIN');
  SELECT x::jsonb INTO r1 FROM dblink('c1',
    format('SELECT public.respond_lane_bid_invite(%L, true)::text', t_lo('g3_inv'))) AS t(x text);
  PERFORM dblink_send_query('c2', format('SELECT public.respond_lane_bid_invite(%L, true)::text', t_lo('g3_inv')));
  v_blocked := t_wait_blocked('%respond_lane_bid_invite%');
  PERFORM dblink_exec('c1', 'COMMIT');
  r2 := t_session_result('c2')::jsonb;
  PERFORM dblink_disconnect('c1');
  PERFORM dblink_disconnect('c2');
  PERFORM t_ok('Concurrency: two staff accept one invite at once; the second waits, gets the first outcome, one quote',
    v_blocked AND r1 ->> 'status' = 'accepted' AND r2 ->> 'status' = 'accepted' AND (r2 ->> 'already_responded')::boolean
      AND (SELECT count(*) FROM public.direct_quotes WHERE indent_id = t_lo('g3') AND bidder_organization_id = t_id('B1')) = 1,
    format('blocked=%s r1=%s r2=%s', v_blocked, r1, r2));
END $$;

-- An offer committed while the accept is in flight is restored, not overwritten.
SELECT t_lo_put('g4', t_indent(t_id('SHIP1'), 'LO Periya', 'LO Coimbatore', '32FT', 'both'));
SELECT t_lo_put('g4_inv', (t_invite(t_id('u_ship'), t_lo('g4'), 'network_quote', t_lo('q_b1')) ->> 'invite_id')::uuid);
SELECT t_lo_put('g4_inv_dco', (t_invite(t_id('u_ship'), t_lo('g4'), 'market_bid', t_lo('bid_dco')) ->> 'invite_id')::uuid);
DO $$
DECLARE
  r jsonb;
  v_blocked boolean;
BEGIN
  PERFORM t_session('c1', t_id('u_bid2'));
  PERFORM t_session('c2', t_id('u_bid1'));
  PERFORM dblink_exec('c1', 'BEGIN');
  PERFORM x FROM dblink('c1', t_quote_sql(t_lo('g4'), t_id('B1'), 29500) || '::text') AS t(x text);
  PERFORM dblink_send_query('c2', format('SELECT public.respond_lane_bid_invite(%L, true)::text', t_lo('g4_inv')));
  v_blocked := t_wait_blocked('%respond_lane_bid_invite%');
  PERFORM dblink_exec('c1', 'COMMIT');
  r := t_session_result('c2')::jsonb;
  PERFORM dblink_disconnect('c1');
  PERFORM dblink_disconnect('c2');
  PERFORM t_ok('Concurrency: a Network quote committed during the accept keeps its amount; the invite is superseded',
    v_blocked AND r ->> 'status' = 'superseded' AND (t_pool_quote(t_lo('g4'), t_id('B1'))).amount = 29500
      AND (t_pool_quote(t_lo('g4'), t_id('B1'))).notes IS NULL
      AND (SELECT status FROM public.lane_bid_invites WHERE id = t_lo('g4_inv')) = 'superseded',
    format('blocked=%s r=%s quote=%s', v_blocked, r, row_to_json(t_pool_quote(t_lo('g4'), t_id('B1')))));
END $$;

DO $$
DECLARE
  r jsonb;
  v_blocked boolean;
BEGIN
  PERFORM t_session('c1', t_id('u_dco'));
  PERFORM t_session('c2', t_id('u_dco'));
  PERFORM dblink_exec('c1', 'BEGIN');
  PERFORM x FROM dblink('c1', t_bid_sql(t_lo('g4'), 31200, NULL, t_id('V1')) || '::text') AS t(x text);
  PERFORM dblink_send_query('c2', format('SELECT public.respond_lane_bid_invite(%L, true)::text', t_lo('g4_inv_dco')));
  v_blocked := t_wait_blocked('%respond_lane_bid_invite%');
  PERFORM dblink_exec('c1', 'COMMIT');
  r := t_session_result('c2')::jsonb;
  PERFORM dblink_disconnect('c1');
  PERFORM dblink_disconnect('c2');
  PERFORM t_ok('Concurrency: a Marketplace bid committed during the accept keeps its amount; the invite is superseded',
    v_blocked AND r ->> 'status' = 'superseded'
      AND (SELECT amount FROM public.market_bids WHERE indent_id = t_lo('g4') AND bidder_user_id = t_id('u_dco')) = 31200
      AND (SELECT count(*) FROM public.market_bids WHERE indent_id = t_lo('g4') AND bidder_user_id = t_id('u_dco')) = 1,
    format('blocked=%s r=%s', v_blocked, r));
END $$;

-- ── C. Lane commitments attach automatically ────────────────────────────────
-- Lane K: SHIP1 -> B1 linked. B3 commits too but is not linked to SHIP1.
SELECT t_lo_put('c_b1', t_commit(t_id('B1'), 'lo salem|lo erode|32ft', 29000, 2));
SELECT t_lo_put('c_b3', t_commit(t_id('B3'), 'lo salem|lo erode|32ft', 27000, 5));
SELECT t_lo_put('c_self', t_commit(t_id('SHIP1'), 'lo salem|lo erode|32ft', 26000, 5));

SELECT t_lo_put('k1', t_indent(t_id('SHIP1'), 'LO Salem', 'LO Erode', '32FT', 'integrated_supplier', 'broadcast'));
SELECT t_lo_put('k_mkt', t_indent(t_id('SHIP1'), 'LO Salem', 'LO Erode', '32FT', 'marketplace', 'broadcast'));
SELECT t_lo_put('k_draft', t_indent(t_id('SHIP1'), 'LO Salem', 'LO Erode', '32FT', 'integrated_supplier', 'draft'));

DO $$
DECLARE
  q public.direct_quotes := t_pool_quote(t_lo('k1'), t_id('B1'));
BEGIN
  PERFORM t_ok('Attach: new Network indent gets the linked carrier''s committed rate as a pending pool quote',
    q.amount = 29000 AND q.status = 'pending' AND q.pool_commit_id = t_lo('c_b1'), coalesce(row_to_json(q)::text, 'none'));
  PERFORM t_ok('Attach: indent moves to quoted like any first quote',
    (SELECT status FROM public.indents WHERE id = t_lo('k1')) = 'quoted', '');
  PERFORM t_ok('Attach: unlinked carrier and own-org commitments never attach',
    t_pool_quote(t_lo('k1'), t_id('B3')) IS NULL AND t_pool_quote(t_lo('k1'), t_id('SHIP1')) IS NULL, '');
  PERFORM t_ok('Attach: Marketplace-only and draft indents get nothing',
    t_pool_quote(t_lo('k_mkt'), t_id('B1')) IS NULL AND t_pool_quote(t_lo('k_draft'), t_id('B1')) IS NULL, '');
  PERFORM t_ok('Attach: exactly one quote per indent for the commitment',
    (SELECT count(*) FROM public.direct_quotes WHERE pool_commit_id = t_lo('c_b1')) = 1, '');
END $$;

DO $$
DECLARE
  r jsonb := t_lane(t_id('u_ship'), t_lo('k_mkt'));
  pc jsonb := t_item(r, 'pool_commitment', t_lo('c_b1'));
BEGIN
  PERFORM t_ok('Lane: live linked commitment listed on a Marketplace-only load with needs_network',
    pc IS NOT NULL AND pc ->> 'invite_blocker' = 'needs_network' AND (pc ->> 'vehicles_left')::int = 2
      AND t_item(r, 'pool_commitment', t_lo('c_b3')) IS NULL AND t_item(r, 'pool_commitment', t_lo('c_self')) IS NULL,
    r::text);
END $$;

SELECT t_err_as('Invite: commitment needs a Network-shared load', t_id('u_ship'),
  format('SELECT public.invite_lane_bidder(%L, %L, %L)', t_lo('k_mkt'), 'pool_commitment', t_lo('c_b1')), 'needs_network');

UPDATE public.indents SET circulation_target = 'both' WHERE id = t_lo('k_mkt');
UPDATE public.indents SET status = 'broadcast' WHERE id = t_lo('k_draft');

SELECT t_ok('Attach: sharing to Network later attaches (circulation change)',
  (t_pool_quote(t_lo('k_mkt'), t_id('B1'))).pool_commit_id = t_lo('c_b1'), '');
SELECT t_ok('Attach: publishing a draft attaches (status change)',
  (t_pool_quote(t_lo('k_draft'), t_id('B1'))).pool_commit_id = t_lo('c_b1'), '');

-- Exhausted, expired and superseded commitments do not attach.
UPDATE public.network_pool_bid_commits SET awarded_count = 2, status = 'exhausted' WHERE id = t_lo('c_b1');
SELECT t_lo_put('c_exp', t_commit(t_id('B1'), 'lo salem|lo erode|32ft', 28000, 3, 0, now() - interval '1 minute'));
SELECT t_lo_put('k2', t_indent(t_id('SHIP1'), 'LO Salem', 'LO Erode', '32FT', 'integrated_supplier', 'broadcast'));
SELECT t_ok('Attach: exhausted or past valid_until commitments do not attach',
  t_pool_quote(t_lo('k2'), t_id('B1')) IS NULL, '');
SELECT t_ok('Lane: dead commitments are not listed',
  t_item(t_lane(t_id('u_ship'), t_lo('k2')), 'pool_commitment', t_lo('c_b1')) IS NULL
    AND t_item(t_lane(t_id('u_ship'), t_lo('k2')), 'pool_commitment', t_lo('c_exp')) IS NULL, '');

-- On demand: an indent that existed before the commitment.
SELECT t_lo_put('k3', t_indent(t_id('SHIP1'), 'LO Salem', 'LO Erode', '32FT', 'integrated_supplier', 'broadcast'));
UPDATE public.network_pool_bid_commits SET status = 'superseded' WHERE id = t_lo('c_exp');
SELECT t_lo_put('c_new', t_commit(t_id('B1'), 'lo salem|lo erode|32ft', 28500, 4));
SELECT t_ok('Attach: existing indent has no quote before the on-demand call',
  t_pool_quote(t_lo('k3'), t_id('B1')) IS NULL, '');
SELECT t_err_as('Attach: carrier staff cannot run the shipper attach', t_id('u_bid1'),
  format('SELECT public.attach_lane_commitments_for_indent(%L)', t_lo('k3')), 'unauthorized');
DO $$
DECLARE
  a jsonb := t_exec_as(t_id('u_ship'), format('SELECT public.attach_lane_commitments_for_indent(%L)', t_lo('k3')));
  b jsonb;
BEGIN
  b := t_exec_as(t_id('u_ship'), format('SELECT public.attach_lane_commitments_for_indent(%L)', t_lo('k3')));
  PERFORM t_ok('Attach: on-demand RPC attaches exactly one quote, second call is a no-op',
    (a ->> 'attached')::int = 1 AND (b ->> 'attached')::int = 0
      AND (t_pool_quote(t_lo('k3'), t_id('B1'))).amount = 28500,
    format('first=%s second=%s quote=%s', a, b, row_to_json(t_pool_quote(t_lo('k3'), t_id('B1')))));
END $$;

-- pool_commitment invite attaches directly on a Network load.
SELECT t_lo_put('k4', t_indent(t_id('SHIP1'), 'LO Salem', 'LO Erode', '32FT', 'marketplace', 'broadcast'));
UPDATE public.indents SET circulation_target = 'both' WHERE id = t_lo('k4');
SELECT t_ok('Attach: circulation change attached k4 already; invite on the commitment is idempotent',
  NOT ((t_invite(t_id('u_ship'), t_lo('k4'), 'pool_commitment', t_lo('c_new'))) ->> 'attached')::boolean
    AND (t_pool_quote(t_lo('k4'), t_id('B1'))).pool_commit_id = t_lo('c_new'), '');

-- ── D. End to end: carrier pool bid first, shipper indent after ─────────────
SELECT t_lo_put('e_old', t_indent(t_id('SHIP1'), 'LO Hosur', 'LO Chennai', '32FT', 'integrated_supplier', 'broadcast'));
SELECT t_ok('E2E: carrier posts a Network pool bid on the lane',
  (t_exec_as(t_id('u_bid1'), format(
    'SELECT public.submit_network_pool_quote(%L, %L, %L, %L, 31000, 1, now() + interval ''5 days'')',
    t_id('B1'), 'LO Hosur', 'LO Chennai', '32FT')) ->> 'quoted')::int = 1, '');
SELECT t_lo_put('e_new', t_indent(t_id('SHIP1'), 'LO Hosur', 'LO Chennai', '32FT', 'integrated_supplier', 'broadcast'));
SELECT t_ok('E2E: indent created after the pool bid receives it at the same rate',
  (t_pool_quote(t_lo('e_new'), t_id('B1'))).amount = 31000
    AND (t_pool_quote(t_lo('e_new'), t_id('B1'))).pool_commit_id = (t_pool_quote(t_lo('e_old'), t_id('B1'))).pool_commit_id, '');
SELECT t_ok('E2E: the shipper''s Review Hub read returns the attached quote',
  EXISTS (SELECT 1 FROM jsonb_array_elements(t_exec_as(t_id('u_ship'), format(
    'SELECT coalesce(jsonb_agg(to_jsonb(q)), ''[]'') FROM public.get_direct_quotes_with_bidder_names(%L) q', t_lo('e_new')))) e
    WHERE (e ->> 'bidder_organization_id')::uuid = t_id('B1') AND (e ->> 'amount')::numeric = 31000), '');

-- ── E. Link helper parity with market_indents_for_org ───────────────────────
INSERT INTO public.suppliers (organization_id, linked_organization_id) VALUES (t_id('SHIP2'), t_id('B1'));
INSERT INTO public.clients (organization_id, linked_organization_id, status) VALUES (t_id('B3'), t_id('SHIP2'), 'active');
INSERT INTO public.organization_relations (from_organization_id, to_organization_id, relation_type, status)
VALUES (t_id('B2'), t_id('SHIP2'), 'supplier_client', 'active'),
       (t_id('SHIP1'), t_id('B2'), 'client_supplier', 'inactive');
SELECT t_lo_put('p_s1', t_indent(t_id('SHIP1'), 'LO Par', 'LO Ity', '32FT', 'integrated_supplier'));
SELECT t_lo_put('p_s2', t_indent(t_id('SHIP2'), 'LO Par', 'LO Ity', '32FT', 'integrated_supplier'));

DO $$
DECLARE
  v_ind text;
  v_org text;
  v_uid uuid;
  v_seen boolean;
  v_helper boolean;
  v_n int := 0;
BEGIN
  FOREACH v_ind IN ARRAY ARRAY['p_s1', 'p_s2'] LOOP
    FOREACH v_org IN ARRAY ARRAY['B1', 'B2', 'B3'] LOOP
      v_uid := CASE v_org WHEN 'B1' THEN t_id('u_bid1') WHEN 'B2' THEN t_id('u_other') ELSE t_id('u_b3') END;
      v_seen := (t_exec_as(v_uid, format(
        'SELECT to_jsonb(EXISTS (SELECT 1 FROM public.market_indents_for_org(%L) m WHERE m.id = %L))', t_id(v_org), t_lo(v_ind))))::text::boolean;
      SELECT public._org_network_link_exists(i.organization_id, t_id(v_org)) AND public._indent_network_open(i.id)
        INTO v_helper FROM public.indents i WHERE i.id = t_lo(v_ind);
      IF v_seen IS DISTINCT FROM v_helper THEN
        RAISE EXCEPTION 'FAIL Parity % / %: market_indents_for_org=% helper=%', v_ind, v_org, v_seen, v_helper;
      END IF;
      v_n := v_n + 1;
    END LOOP;
  END LOOP;
  PERFORM t_ok(format('Parity: link helper matches market_indents_for_org on %s indent/carrier pairs (relations both ways, suppliers, clients, inactive)', v_n), true);
END $$;

-- ── F. Complete logical access: page past 1,000 offers ──────────────────────
SELECT t_lo_put('big_src', t_indent(t_id('SHIP1'), 'LO Scale', 'LO Lane', '32FT', 'both'));
SELECT t_lo_put('big_src2', t_indent(t_id('SHIP1'), 'LO Scale', 'LO Lane', '32FT', 'both'));
INSERT INTO public.market_bids (indent_id, bidder_type, bidder_user_id, amount, created_at)
SELECT t_lo('big_src'), 'dco', gen_random_uuid(), 20000 + (g % 37), now() - (g || ' seconds')::interval
FROM generate_series(1, 1205) g;
-- A second, higher bid by 300 of the same carriers on another sibling: one row per carrier.
INSERT INTO public.market_bids (indent_id, bidder_type, bidder_user_id, amount)
SELECT t_lo('big_src2'), 'dco', b.bidder_user_id, b.amount + 500
FROM public.market_bids b WHERE b.indent_id = t_lo('big_src') ORDER BY b.id LIMIT 300;
SELECT t_lo_put('big', t_indent(t_id('SHIP1'), 'LO Scale', 'LO Lane', '32FT', 'both'));

DO $$
DECLARE
  r jsonb;
  v_amount numeric := NULL;
  v_key text := NULL;
  v_pages int := 0;
  v_keys text[] := '{}';
  v_prev_amount numeric := -1;
  v_prev_key text := '';
  e jsonb;
  v_total int;
BEGIN
  LOOP
    r := t_lane(t_id('u_ship'), t_lo('big'), 100, v_amount, v_key);
    v_pages := v_pages + 1;
    v_total := (r ->> 'total_count')::int;
    FOR e IN SELECT * FROM jsonb_array_elements(r -> 'items') LOOP
      IF (e ->> 'amount')::numeric < v_prev_amount
         OR ((e ->> 'amount')::numeric = v_prev_amount AND (e ->> 'offer_key') COLLATE "C" <= v_prev_key COLLATE "C") THEN
        RAISE EXCEPTION 'FAIL Paging: order broke at %', e;
      END IF;
      v_prev_amount := (e ->> 'amount')::numeric;
      v_prev_key := e ->> 'offer_key';
      v_keys := v_keys || (e ->> 'offer_key');
    END LOOP;
    EXIT WHEN NOT (r ->> 'has_more')::boolean;
    v_amount := (r -> 'next_cursor' ->> 'amount')::numeric;
    v_key := r -> 'next_cursor' ->> 'key';
    IF v_pages > 50 THEN RAISE EXCEPTION 'FAIL Paging: did not terminate'; END IF;
  END LOOP;
  PERFORM t_ok(format('Paging: 1,205 carriers reached in %s keyset pages, no duplicates, cheapest offer per carrier', v_pages),
    cardinality(v_keys) = 1205 AND v_total = 1205
      AND (SELECT count(DISTINCT k) FROM unnest(v_keys) k) = 1205
      AND NOT EXISTS (SELECT 1 FROM unnest(v_keys) k WHERE k IN (
        SELECT 'market_bid:' || id FROM public.market_bids WHERE indent_id = t_lo('big_src2'))),
    format('keys=%s total=%s', cardinality(v_keys), v_total));
  PERFORM t_ok('Paging: total_count is independent of page size',
    (t_lane(t_id('u_ship'), t_lo('big'), 1) ->> 'total_count')::int = 1205
      AND (t_lane(t_id('u_ship'), t_lo('big'), 1) ->> 'has_more')::boolean, '');
END $$;

-- Index use for the sibling lookup at volume.
INSERT INTO public.indents (organization_id, indent_number, pickup_area, drop_location, vehicle_type, circulation_target, status)
SELECT t_id('SHIP1'), 'BULK-' || g, 'Bulk ' || (g % 400), 'Lane ' || (g % 13), '32FT', 'both', 'open'
FROM generate_series(1, 20000) g;
ANALYZE public.indents;
DO $$
DECLARE
  v_plan text := '';
  v_line text;
BEGIN
  FOR v_line IN EXECUTE format($q$EXPLAIN SELECT s.id FROM public.indents s
    WHERE s.organization_id = %L AND s.deleted_at IS NULL
      AND public._pool_key(s.pickup_area, s.drop_location, s.vehicle_type) = 'lo scale|lo lane|32ft'$q$, t_id('SHIP1'))
  LOOP
    v_plan := v_plan || v_line || E'\n';
  END LOOP;
  PERFORM t_ok('Index: sibling lookup uses indents_org_pool_key_live_idx', v_plan LIKE '%indents_org_pool_key_live_idx%', v_plan);
END $$;

DO $$
BEGIN
  RAISE NOTICE 'ALL % LANE OFFERS CHECKS PASSED', (SELECT count(*) FROM t_log);
END $$;
