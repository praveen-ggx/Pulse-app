-- Godrej transaction 897a1bef-76c6-43bb-a4fa-b9d28df18a96.
-- Stated classification, 2026-10-14: DCO driver-owner payable for ₹3,500,
-- 100% of the applicable supplier cost, with no commission split.
-- The payee is the trip's existing dco_payee_id. This does not create a
-- suppliers row and does not write trips.supplier_id.
--
-- Written confirmation from the authorized Godrej India finance approver
-- is still required before this file is put in a release set or applied.
-- A database that never had this historical receipt is unchanged.

SET LOCAL lock_timeout = '5s';

do $$
declare
  v_tx constant uuid := '897a1bef-76c6-43bb-a4fa-b9d28df18a96';
  v_amount_in numeric;
  v_amount_out numeric;
  v_category text;
  v_contact uuid;
  v_contact_type text;
  v_supplier uuid;
  v_payee uuid;
begin
  select tx.amount_in, tx.amount_out, tx.ledger_category, tx.contact_id, tx.contact_type,
         t.supplier_id, t.dco_payee_id
    into v_amount_in, v_amount_out, v_category, v_contact, v_contact_type,
         v_supplier, v_payee
    from public.transactions tx
    join public.trips t on t.id = tx.trip_id
   where tx.id = v_tx;

  if not found then
    return;
  end if;

  if v_contact_type = 'dco'
     and v_contact = v_payee
     and v_amount_out = 3500
     and coalesce(v_amount_in, 0) = 0
     and v_supplier is null then
    return;
  end if;

  if v_supplier is not null or v_payee is null then
    raise exception 'Godrej trip is not a DCO payee with a null supplier';
  end if;

  if v_category is distinct from 'compliance_advance'
     or v_amount_in is distinct from 3500
     or coalesce(v_amount_out, 0) <> 0
     or v_contact is not null then
    raise exception 'Godrej transaction % is not the held 3500 compliance receipt', v_tx;
  end if;

  update public.transactions
     set amount_out = amount_in,
         amount_in = 0,
         contact_type = 'dco',
         contact_id = v_payee,
         ledger_entity_type = 'dco',
         ledger_flow_type = 'payable'
   where id = v_tx;
end $$;
