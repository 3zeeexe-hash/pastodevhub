DROP POLICY IF EXISTS "hosting public read" ON storage.objects;
CREATE POLICY "hosting public read" ON storage.objects FOR SELECT TO anon, authenticated
USING (
  bucket_id = 'hosting'
  AND EXISTS (SELECT 1 FROM public.hosted_files h WHERE h.storage_path = storage.objects.name)
);