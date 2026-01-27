-- Migration: Add pilot-logos storage bucket and RLS policies
-- Enables uploading company logos for pilot pages

-- Create the pilot-logos storage bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'pilot-logos',
  'pilot-logos',
  true,  -- Public bucket so logos can be displayed on pilot pages
  5242880,  -- 5MB limit
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- RLS policies for pilot-logos bucket

-- Policy: Allow authenticated users to upload logos for assistants they have access to
CREATE POLICY "Users can upload pilot logos for their assistants"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'pilot-logos' AND
  EXISTS (
    SELECT 1 FROM assistants a
    JOIN organization_members om ON om.org_id = a.org_id
    WHERE om.user_id = auth.uid()
    AND a.id::text = (storage.foldername(name))[1]
  )
);

-- Policy: Allow authenticated users to update logos for assistants they have access to
CREATE POLICY "Users can update pilot logos for their assistants"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'pilot-logos' AND
  EXISTS (
    SELECT 1 FROM assistants a
    JOIN organization_members om ON om.org_id = a.org_id
    WHERE om.user_id = auth.uid()
    AND a.id::text = (storage.foldername(name))[1]
  )
)
WITH CHECK (
  bucket_id = 'pilot-logos' AND
  EXISTS (
    SELECT 1 FROM assistants a
    JOIN organization_members om ON om.org_id = a.org_id
    WHERE om.user_id = auth.uid()
    AND a.id::text = (storage.foldername(name))[1]
  )
);

-- Policy: Allow authenticated users to delete logos for assistants they have access to
CREATE POLICY "Users can delete pilot logos for their assistants"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'pilot-logos' AND
  EXISTS (
    SELECT 1 FROM assistants a
    JOIN organization_members om ON om.org_id = a.org_id
    WHERE om.user_id = auth.uid()
    AND a.id::text = (storage.foldername(name))[1]
  )
);

-- Policy: Allow public read access to all pilot logos (since bucket is public)
CREATE POLICY "Public can view pilot logos"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'pilot-logos');
