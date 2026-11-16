-- Extra stubs for the marketplace lane rate suite.
CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY);

-- Shippers create indents as authenticated in the app; the trigger and index
-- expressions must be executable by that role.
GRANT INSERT, UPDATE ON public.indents TO authenticated;
GRANT SELECT, UPDATE ON public.market_bids TO authenticated;
