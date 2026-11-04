-- Rename only known legacy branding; preserve custom values and all accounts/game identifiers.
UPDATE "settings" SET "value" = 'Lucky Lotto Play'
WHERE "key" = 'site_name' AND "value" IN ('MegaDraw', 'MegaDraw Lottery');
UPDATE "settings" SET "value" = 'support@luckylottoplay.live'
WHERE "key" = 'contact_email' AND lower("value") = 'support@megadraw.com';
UPDATE "settings" SET "value" = ''
WHERE "key" = 'contact_phone' AND "value" = '1800 MegaDraw';

UPDATE "system_settings" SET "data" = jsonb_set("data", '{platformName}', '"Lucky Lotto Play"', false)
WHERE "category" = 'general' AND "data"->>'platformName' IN ('MegaDraw', 'MegaDraw Lottery');
UPDATE "system_settings" SET "data" = jsonb_set("data", '{companyName}', '"Lucky Lotto Play"', false)
WHERE "category" = 'general' AND "data"->>'companyName' IN ('MegaDraw Global Ltd.', 'MegaDraw Pty Ltd.');
UPDATE "system_settings" SET "data" = jsonb_set("data", '{supportEmail}', '"support@luckylottoplay.live"', false)
WHERE "category" = 'general' AND lower("data"->>'supportEmail') = 'support@megadraw.com';
UPDATE "system_settings" SET "data" = jsonb_set("data", '{websiteUrl}', '"https://luckylottoplay.live"', false)
WHERE "category" = 'general' AND "data"->>'websiteUrl' IN ('https://megadraw.example.com', 'https://megadraw.com');
UPDATE "system_settings" SET "data" = jsonb_set("data", '{copyright}', to_jsonb(replace(replace("data"->>'copyright', 'MegaDraw Global Ltd.', 'Lucky Lotto Play'), 'MegaDraw Pty Ltd.', 'Lucky Lotto Play')), false)
WHERE "category" = 'general' AND "data"->>'copyright' LIKE '%MegaDraw%';

UPDATE "cms_pages" SET
 "title" = replace("title", 'MegaDraw', 'Lucky Lotto Play'),
 "content" = replace("content", 'MegaDraw', 'Lucky Lotto Play'),
 "metaTitle" = replace("metaTitle", 'MegaDraw', 'Lucky Lotto Play'),
 "metaDesc" = replace("metaDesc", 'MegaDraw', 'Lucky Lotto Play')
WHERE "slug" IN ('about', 'about-us', 'terms', 'terms-and-conditions', 'privacy', 'privacy-policy', 'responsible-gaming');
