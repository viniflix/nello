DROP POLICY IF EXISTS "Nutritionists can manage patient avatars" ON storage.objects;
CREATE POLICY "Nutritionists can manage patient avatars"
ON storage.objects FOR ALL TO authenticated
USING (
  bucket_id = 'avatars' AND
  EXISTS (
    SELECT 1 FROM public.user_profiles p
    WHERE p.id::text = (storage.foldername(objects.name))[1]
    AND p.nutritionist_id = auth.uid()
  )
)
WITH CHECK (
  bucket_id = 'avatars' AND
  EXISTS (
    SELECT 1 FROM public.user_profiles p
    WHERE p.id::text = (storage.foldername(objects.name))[1]
    AND p.nutritionist_id = auth.uid()
  )
);
