-- Bank, terms, and signatory stored with each invoice layout template.
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.invoice_style_templates
  ADD COLUMN IF NOT EXISTS details jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.invoice_style_templates.details IS
  'Layout copy for the template: bank account, terms and conditions, signatory.';
