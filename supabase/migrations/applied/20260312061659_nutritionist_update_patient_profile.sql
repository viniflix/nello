CREATE POLICY "Nutritionists can update their patients profiles"
ON public.user_profiles
FOR UPDATE
TO authenticated
USING (
  user_type = 'patient' AND
  nutritionist_id = auth.uid()
)
WITH CHECK (
  user_type = 'patient' AND
  nutritionist_id = auth.uid()
);
