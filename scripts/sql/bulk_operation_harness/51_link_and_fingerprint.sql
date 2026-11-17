-- Production creates this trigger once, AFTER INSERT OR DELETE. Later
-- migrations replace the function and do not recreate the trigger.
DROP TRIGGER IF EXISTS trg_transactions_link_payment_request ON public.transactions;
CREATE TRIGGER trg_transactions_link_payment_request
  AFTER INSERT OR DELETE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.tg_transactions_link_payment_request();

INSERT INTO public.function_fingerprint (name, src, owner)
SELECT 'mark_trip_finance_verified', md5(prosrc), proowner
  FROM pg_proc
 WHERE proname = 'mark_trip_finance_verified'
   AND pronargs = 4;

INSERT INTO public.function_fingerprint (name, src, owner)
SELECT 'tg_transactions_link_payment_request', md5(prosrc), proowner
  FROM pg_proc
 WHERE proname = 'tg_transactions_link_payment_request';

INSERT INTO public.function_fingerprint (name, src, owner)
SELECT 'issue_payment_request', md5(prosrc), proowner
  FROM pg_proc
 WHERE proname = 'issue_payment_request';

INSERT INTO public.function_fingerprint (name, src, owner)
SELECT 'compliance_advance_calculation', md5(prosrc), proowner
  FROM pg_proc
 WHERE proname = 'compliance_advance_calculation';
