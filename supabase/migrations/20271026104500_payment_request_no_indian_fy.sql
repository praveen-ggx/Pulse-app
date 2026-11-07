-- Bank payout files reject SAT812-PAY-000020 (too long). New requests are
-- PAY-2627-001 (Indian FY Apr–Mar, 10–13 characters). Existing numbers stay.

create or replace function public.generate_payment_request_no(p_org_id uuid)
  returns text
  language plpgsql
  security definer
  set search_path to 'public'
as $$
declare
  v_today date;
  v_fy text;
  v_seq bigint;
  v_prefix text;
begin
  if p_org_id is null then
    raise exception 'organization is required to issue a payment request number';
  end if;

  v_today := (timezone('Asia/Kolkata', now()))::date;
  if extract(month from v_today) >= 4 then
    v_fy := to_char(v_today, 'YY') || to_char(v_today + interval '1 year', 'YY');
  else
    v_fy := to_char(v_today - interval '1 year', 'YY') || to_char(v_today, 'YY');
  end if;

  v_prefix := 'PAY-' || v_fy || '-';

  -- Serialize per organisation + FY so concurrent approvals do not collide.
  perform pg_advisory_xact_lock(hashtext(p_org_id::text || ':payfy:' || v_fy));

  select coalesce(max(substring(pr.request_no from '[0-9]+$')::bigint), 0) + 1
    into v_seq
  from public.payment_requests pr
  where pr.organization_id = p_org_id
    and pr.request_no ~ ('^' || v_prefix || '[0-9]+$');

  return v_prefix || lpad(v_seq::text, greatest(3, length(v_seq::text)), '0');
end;
$$;

revoke all on function public.generate_payment_request_no(uuid) from public, anon, authenticated;
