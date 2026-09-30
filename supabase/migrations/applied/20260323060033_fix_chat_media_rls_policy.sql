-- Drop the restrictive policy
DROP POLICY IF EXISTS "Access chat_media read" ON storage.objects;

-- Create a more flexible policy that handles both relative paths and full URLs
CREATE POLICY "Access chat_media read" ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'chat_media' AND (
    EXISTS (
      SELECT 1 FROM chats c
      WHERE (
        -- Match exact path OR the path at the end of a URL
        c.media_url = name OR 
        c.media_url LIKE '%/' || name
      )
      AND (c.from_id = auth.uid() OR c.to_id = auth.uid())
    )
  )
);
