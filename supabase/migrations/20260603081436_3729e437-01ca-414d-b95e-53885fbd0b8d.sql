
DROP POLICY IF EXISTS "own memory" ON public.user_memory;
CREATE POLICY "own memory"
  ON public.user_memory FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own connections" ON public.user_connections;
CREATE POLICY "own connections"
  ON public.user_connections FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
