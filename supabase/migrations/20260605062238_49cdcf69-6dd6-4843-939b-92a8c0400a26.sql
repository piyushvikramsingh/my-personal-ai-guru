CREATE TABLE public.briefings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  for_date date NOT NULL,
  content text NOT NULL,
  summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, for_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.briefings TO authenticated;
GRANT ALL ON public.briefings TO service_role;
ALTER TABLE public.briefings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own briefings" ON public.briefings FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX briefings_user_date_idx ON public.briefings (user_id, for_date DESC);