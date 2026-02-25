-- Allow users to update their own interest checks (text, max_squad_size, etc.)
CREATE POLICY "Users can update own interest checks" ON public.interest_checks
  FOR UPDATE USING (author_id = (SELECT auth.uid()));
