-- Product galleries hold videos as well as images (the table keeps its name).
-- media_url is the file's URL and media_type says which kind it is; rows saved
-- before videos existed are images.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='product_images' AND column_name='image_url') THEN
  ALTER TABLE product_images RENAME COLUMN image_url TO media_url;
 END IF;
END $$;
ALTER TABLE product_images ADD COLUMN IF NOT EXISTS media_type VARCHAR(10) NOT NULL DEFAULT 'image';
ALTER TABLE product_images DROP COLUMN IF EXISTS poster_url;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='product_images_media_type_check') THEN
  ALTER TABLE product_images ADD CONSTRAINT product_images_media_type_check CHECK (media_type IN ('image','video'));
 END IF;
END $$;
