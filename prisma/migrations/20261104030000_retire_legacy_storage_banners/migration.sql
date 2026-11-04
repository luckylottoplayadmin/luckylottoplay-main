-- Legacy storage files are intentionally not copied. Keep banner records for
-- history, but prevent old storage images from appearing on the public site.
UPDATE "banners"
SET "isActive" = false
WHERE "imageUrl" ~* '^https?://[^/]+[.]supabase[.]co/'
   OR "mobileUrl" ~* '^https?://[^/]+[.]supabase[.]co/';
