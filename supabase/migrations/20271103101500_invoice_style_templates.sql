-- Named invoice layouts (format, colour, logo) and the client each one is assigned to.
SET LOCAL lock_timeout = '5s';

CREATE TABLE public.invoice_style_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  format text NOT NULL,
  accent text NOT NULL,
  logo_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoice_style_templates_name_len CHECK (char_length(btrim(name)) BETWEEN 1 AND 40),
  CONSTRAINT invoice_style_templates_format_chk CHECK (format IN ('classic', 'band', 'ledger', 'studio')),
  CONSTRAINT invoice_style_templates_accent_chk CHECK (accent IN ('brown', 'navy', 'forest', 'indigo'))
);

CREATE UNIQUE INDEX invoice_style_templates_org_name_uidx
  ON public.invoice_style_templates (organization_id, lower(btrim(name)));

CREATE INDEX invoice_style_templates_org_idx
  ON public.invoice_style_templates (organization_id);

ALTER TABLE public.clients
  ADD COLUMN invoice_style_template_id uuid
  REFERENCES public.invoice_style_templates(id) ON DELETE SET NULL;

COMMENT ON TABLE public.invoice_style_templates IS
  'Workspace invoice layout templates. A client may be assigned one via clients.invoice_style_template_id.';

ALTER TABLE public.invoice_style_templates ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.invoice_style_templates FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_style_templates TO authenticated;

CREATE POLICY "org_members_manage_invoice_style_templates"
  ON public.invoice_style_templates
  FOR ALL
  TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));
