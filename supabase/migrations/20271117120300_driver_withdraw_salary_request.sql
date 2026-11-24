-- A driver could not take back a payment / salary request once sent.
--
-- Adds status 'withdrawn' and an RPC the driver calls. Only the driver's own
-- request, and only while it is still 'pending' (approved / paid / rejected
-- requests cannot be withdrawn). Fleet screens list 'pending' only, so a
-- withdrawn request leaves the fleet's queue and its trips can be requested again.

ALTER TABLE public.driver_salary_requests
  DROP CONSTRAINT IF EXISTS driver_salary_requests_status_check;

ALTER TABLE public.driver_salary_requests
  ADD CONSTRAINT driver_salary_requests_status_check
  CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'paid'::text, 'withdrawn'::text]));

CREATE OR REPLACE FUNCTION public.driver_withdraw_salary_request(p_request_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated int;
BEGIN
  UPDATE public.driver_salary_requests r
  SET status = 'withdrawn', updated_at = now()
  WHERE r.id = p_request_id
    AND r.status = 'pending'
    AND EXISTS (
      SELECT 1 FROM public.drivers d
      WHERE d.id = r.driver_id AND d.user_id = auth.uid()
    );
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

ALTER FUNCTION public.driver_withdraw_salary_request(uuid) OWNER TO postgres;

COMMENT ON FUNCTION public.driver_withdraw_salary_request(uuid) IS
  'Driver withdraws their own still-pending salary / payment request. Returns false when not pending or not theirs.';

REVOKE ALL ON FUNCTION public.driver_withdraw_salary_request(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.driver_withdraw_salary_request(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.driver_withdraw_salary_request(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
