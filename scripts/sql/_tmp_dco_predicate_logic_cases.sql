DO $probe$
DECLARE v jsonb;
BEGIN
  CREATE TEMP TABLE t_om (user_id uuid, organization_id uuid, role text, status text) ON COMMIT DROP;
  CREATE TEMP TABLE t_drv (id serial, user_id uuid, organization_id uuid, left_at timestamptz, deleted_at timestamptz, relationship_status text, tracking_only boolean) ON COMMIT DROP;
  CREATE TEMP TABLE cases (n int, label text, uid uuid, expected boolean) ON COMMIT DROP;
  EXECUTE $mig$CREATE OR REPLACE FUNCTION pg_temp.emp_logic(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $function$
  SELECT
    EXISTS (
      SELECT 1 FROM pg_temp.t_om om
      WHERE om.user_id = p_user_id AND om.role = 'driver' AND om.status = 'active'
        AND NOT (
          EXISTS (
            SELECT 1 FROM pg_temp.t_drv d
            WHERE d.user_id = om.user_id
              AND d.organization_id = om.organization_id
              AND d.left_at IS NULL
              AND d.deleted_at IS NULL
          )
          AND NOT EXISTS (
            SELECT 1 FROM pg_temp.t_drv d
            WHERE d.user_id = om.user_id
              AND d.organization_id = om.organization_id
              AND d.left_at IS NULL
              AND d.deleted_at IS NULL
              AND d.tracking_only IS NOT TRUE
              AND d.relationship_status IS DISTINCT FROM 'independent'
          )
        )
    )
    OR EXISTS (
      SELECT 1 FROM pg_temp.t_drv d
      WHERE d.user_id = p_user_id
        AND d.left_at IS NULL
        AND d.relationship_status = 'active_employee'
    );
$function$$mig$;
  INSERT INTO cases VALUES
   (1,'active_employee roster row, no membership','00000000-0000-0000-0000-000000000001',true),
   (2,'membership + independent roster (same org)','00000000-0000-0000-0000-000000000002',false),
   (3,'membership + NO roster row','00000000-0000-0000-0000-000000000003',true),
   (4,'membership + NULL-status roster row','00000000-0000-0000-0000-000000000004',true),
   (5,'membership + independent AND NULL rows (same org)','00000000-0000-0000-0000-000000000005',true),
   (6,'membership + independent row already left','00000000-0000-0000-0000-000000000006',true),
   (7,'membership + independent row soft-deleted','00000000-0000-0000-0000-000000000007',true),
   (8,'membership + independent row in a DIFFERENT org','00000000-0000-0000-0000-000000000008',true),
   (9,'membership + disconnected row with left_at NULL','00000000-0000-0000-0000-000000000009',true),
   (10,'independent in org A + no-roster membership in org B','00000000-0000-0000-0000-000000000010',true),
   (11,'independent membership + active_employee in org B','00000000-0000-0000-0000-000000000011',true),
   (12,'inactive membership only','00000000-0000-0000-0000-000000000012',false),
   (13,'two independent memberships (orgs A and B)','00000000-0000-0000-0000-000000000013',false),
   (14,'membership + independent and active_employee rows (same org)','00000000-0000-0000-0000-000000000014',true),
   (15,'no membership, no roster row','00000000-0000-0000-0000-000000000015',false),
   (16,'membership + tracking_only stub, NULL status','00000000-0000-0000-0000-000000000016',false),
   (17,'membership + tracking_only market_award stub (independent)','00000000-0000-0000-0000-000000000017',false),
   (18,'membership + tracking_only stub AND non-stub NULL row','00000000-0000-0000-0000-000000000018',true),
   (19,'tracking_only row with active_employee status','00000000-0000-0000-0000-000000000019',true),
   (20,'membership + tracking_only stub left_at set (no current row)','00000000-0000-0000-0000-000000000020',true);
  INSERT INTO t_drv (user_id, organization_id, left_at, deleted_at, relationship_status, tracking_only) VALUES
   ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000a',NULL,NULL,'active_employee',false),
   ('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-00000000000a',NULL,NULL,'independent',false),
   ('00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-00000000000a',NULL,NULL,NULL,false),
   ('00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-00000000000a',NULL,NULL,'independent',false),
   ('00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-00000000000a',NULL,NULL,NULL,false),
   ('00000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-00000000000a',now(),NULL,'independent',false),
   ('00000000-0000-0000-0000-000000000007','00000000-0000-0000-0000-00000000000a',NULL,now(),'independent',false),
   ('00000000-0000-0000-0000-000000000008','00000000-0000-0000-0000-00000000000b',NULL,NULL,'independent',false),
   ('00000000-0000-0000-0000-000000000009','00000000-0000-0000-0000-00000000000a',NULL,NULL,'disconnected',false),
   ('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-00000000000a',NULL,NULL,'independent',false),
   ('00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-00000000000a',NULL,NULL,'independent',false),
   ('00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-00000000000b',NULL,NULL,'active_employee',false),
   ('00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-00000000000a',NULL,NULL,'independent',false),
   ('00000000-0000-0000-0000-000000000013','00000000-0000-0000-0000-00000000000a',NULL,NULL,'independent',false),
   ('00000000-0000-0000-0000-000000000013','00000000-0000-0000-0000-00000000000b',NULL,NULL,'independent',false),
   ('00000000-0000-0000-0000-000000000014','00000000-0000-0000-0000-00000000000a',NULL,NULL,'independent',false),
   ('00000000-0000-0000-0000-000000000014','00000000-0000-0000-0000-00000000000a',NULL,NULL,'active_employee',false),
   ('00000000-0000-0000-0000-000000000016','00000000-0000-0000-0000-00000000000a',NULL,NULL,NULL,true),
   ('00000000-0000-0000-0000-000000000017','00000000-0000-0000-0000-00000000000a',NULL,NULL,'independent',true),
   ('00000000-0000-0000-0000-000000000018','00000000-0000-0000-0000-00000000000a',NULL,NULL,NULL,true),
   ('00000000-0000-0000-0000-000000000018','00000000-0000-0000-0000-00000000000a',NULL,NULL,NULL,false),
   ('00000000-0000-0000-0000-000000000019','00000000-0000-0000-0000-00000000000a',NULL,NULL,'active_employee',true),
   ('00000000-0000-0000-0000-000000000020','00000000-0000-0000-0000-00000000000a',now(),NULL,NULL,true);
  INSERT INTO t_om VALUES
   ('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-00000000000a','driver','active'),
   ('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-00000000000a','driver','active'),
   ('00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-00000000000a','driver','active'),
   ('00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-00000000000a','driver','active'),
   ('00000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-00000000000a','driver','active'),
   ('00000000-0000-0000-0000-000000000007','00000000-0000-0000-0000-00000000000a','driver','active'),
   ('00000000-0000-0000-0000-000000000008','00000000-0000-0000-0000-00000000000a','driver','active'),
   ('00000000-0000-0000-0000-000000000009','00000000-0000-0000-0000-00000000000a','driver','active'),
   ('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-00000000000a','driver','active'),
   ('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-00000000000b','driver','active'),
   ('00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-00000000000a','driver','active'),
   ('00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-00000000000a','driver','inactive'),
   ('00000000-0000-0000-0000-000000000013','00000000-0000-0000-0000-00000000000a','driver','active'),
   ('00000000-0000-0000-0000-000000000013','00000000-0000-0000-0000-00000000000b','driver','active'),
   ('00000000-0000-0000-0000-000000000014','00000000-0000-0000-0000-00000000000a','driver','active'),
   ('00000000-0000-0000-0000-000000000016','00000000-0000-0000-0000-00000000000a','driver','active'),
   ('00000000-0000-0000-0000-000000000017','00000000-0000-0000-0000-00000000000a','driver','active'),
   ('00000000-0000-0000-0000-000000000018','00000000-0000-0000-0000-00000000000a','driver','active'),
   ('00000000-0000-0000-0000-000000000020','00000000-0000-0000-0000-00000000000a','driver','active');
  SELECT jsonb_agg(jsonb_build_object('n',n,'case',label,'expected',expected,'actual',pg_temp.emp_logic(uid),'pass',pg_temp.emp_logic(uid)=expected) ORDER BY n) INTO v FROM cases;
  RAISE EXCEPTION 'LOGIC_RESULT %', v::text;
END
$probe$;
