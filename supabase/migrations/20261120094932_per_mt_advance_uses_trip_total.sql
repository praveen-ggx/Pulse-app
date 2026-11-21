-- trips.supplier_rate is the total supplier freight, also for per-MT loads.
-- A blank trip basis used to inherit the indent's per_mt basis, so the total
-- was multiplied by load_tons again (TRP002851: 205,920 x 64.35 = 1,32,50,952).
-- A blank trip basis now always means per_trip. An explicit per_mt trip basis
-- is unchanged. Same function body as 20261118114448 otherwise.

SET LOCAL lock_timeout = '5s';

create or replace function public.compliance_advance_calculation(
  p_trip_id uuid,
  p_advance_percent numeric
)
  returns jsonb
  language plpgsql
  stable
  security definer
  set search_path to 'public'
as $$
declare
  v_org uuid;
  v_supplier uuid;
  v_rate numeric;
  v_basis text;
  v_tons numeric;
  v_base numeric;
  v_percent numeric;
  v_fy text;
  v_tds_fy text;
  v_tds_rate numeric;
  v_tds numeric;
  v_enabled boolean;
  v_from numeric;
  v_to numeric;
  v_charge numeric;
  v_doc numeric := 0;
  v_slab jsonb;
  v_raw numeric;
  v_payable numeric;
  v_indent uuid;
begin
  if p_advance_percent is null or p_advance_percent < 0 or p_advance_percent > 100 then
    raise exception 'advance percent must be between 0 and 100';
  end if;
  v_percent := p_advance_percent;

  select organization_id, supplier_id, supplier_rate, supplier_rate_basis, load_tons,
         coalesce(indent_id, source_indent_id)
    into v_org, v_supplier, v_rate, v_basis, v_tons, v_indent
    from public.trips
   where id = p_trip_id;
  if v_org is null then
    raise exception 'trip not found: %', p_trip_id;
  end if;

  v_basis := lower(btrim(coalesce(v_basis, '')));
  if v_basis = '' then
    v_basis := 'per_trip';
  end if;

  if v_basis = 'per_mt' then
    if v_rate is not null and v_rate > 0 and v_tons is not null and v_tons > 0 then
      v_base := v_rate * v_tons;
    end if;
  elsif v_basis = 'per_trip' then
    if v_rate is not null and v_rate > 0 then
      v_base := v_rate;
    end if;
  else
    raise exception 'supplier rate basis is not valid';
  end if;
  if v_base is null or v_base <= 0 then
    raise exception 'trip freight is not set; the advance cannot be approved';
  end if;

  v_fy := public.compliance_indian_financial_year(now());
  if v_supplier is not null then
    select financial_year, rate_percent
      into v_tds_fy, v_tds_rate
      from public.supplier_tds_rates
     where organization_id = v_org
       and supplier_id = v_supplier
       and deleted_at is null
       and financial_year = v_fy
     limit 1;
    if v_tds_rate is null then
      select financial_year, rate_percent
        into v_tds_fy, v_tds_rate
        from public.supplier_tds_rates
       where organization_id = v_org
         and supplier_id = v_supplier
         and deleted_at is null
         and financial_year < v_fy
       order by financial_year desc
       limit 1;
    end if;
  end if;
  if v_tds_rate is not null and v_tds_rate > 0 then
    v_tds := round(v_base * (least(100, greatest(0, v_tds_rate)) / 100), 2);
  else
    v_tds := 0;
  end if;

  select enabled into v_enabled
    from public.org_document_charge_settings
   where organization_id = v_org;
  if coalesce(v_enabled, false) then
    select min_freight, max_freight, charge
      into v_from, v_to, v_charge
      from public.org_document_charge_slabs
     where organization_id = v_org
       and v_base >= min_freight
       and (max_freight is null or v_base <= max_freight)
     order by sort_order
     limit 1;
    if v_charge is not null then
      v_doc := greatest(0, v_charge);
      v_slab := jsonb_build_object('from', v_from, 'to', v_to, 'charge', v_doc);
    end if;
  else
    v_enabled := false;
  end if;

  v_raw := v_base * (v_percent / 100) - v_doc - v_tds;
  if v_raw is null or v_raw <= 0 then
    raise exception 'calculated advance is not positive';
  end if;
  v_payable := round(v_raw, 2);
  if v_payable <= 0 then
    raise exception 'calculated advance is not positive';
  end if;

  return jsonb_build_object(
    'formula_version', 1,
    'supplier_rate', v_rate,
    'supplier_rate_basis', v_basis,
    'load_tons', v_tons,
    'base_freight', v_base,
    'advance_percent', v_percent,
    'tds_financial_year', v_tds_fy,
    'tds_rate_percent', v_tds_rate,
    'tds_amount', v_tds,
    'documentation_enabled', v_enabled,
    'documentation_charges', v_doc,
    'documentation_slab', v_slab,
    'payable', v_payable
  );
end;
$$;

revoke all on function public.compliance_advance_calculation(uuid, numeric) from public, anon, authenticated;
