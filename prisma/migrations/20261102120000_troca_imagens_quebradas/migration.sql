-- Imagens da carga inicial que passaram a responder 404. Só altera produtos que ainda usam essas URLs.
UPDATE "products" SET "image_url" = 'https://images.unsplash.com/photo-1595515106969-1ce29566ff1c?w=400&h=400&fit=crop' WHERE "sku" = 'ESCR-003' AND "image_url" LIKE '%photo-1558618666-fcd25c85f82e%';
UPDATE "products" SET "image_url" = 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=400&h=400&fit=crop' WHERE "sku" = 'ESCR-004' AND "image_url" LIKE '%photo-1507473885765-e6ed057ab6fe%';
UPDATE "products" SET "image_url" = 'https://images.unsplash.com/photo-1572981779307-38b8cabb2407?w=400&h=400&fit=crop' WHERE "sku" = 'IND-001' AND "image_url" LIKE '%photo-1530124566582-a45a7e3f5803%';
UPDATE "products" SET "image_url" = 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=400&h=400&fit=crop' WHERE "sku" = 'LIMP-001' AND "image_url" LIKE '%photo-1558618666-fcd25c85f82e%';
UPDATE "products" SET "image_url" = 'https://images.unsplash.com/photo-1585421514284-efb74c2b69ba?w=400&h=400&fit=crop' WHERE "sku" = 'LIMP-004' AND "image_url" LIKE '%photo-1584813539510-2c8e0e16c851%';
