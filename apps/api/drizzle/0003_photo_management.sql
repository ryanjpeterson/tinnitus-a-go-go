ALTER TABLE "photos" ADD COLUMN "set_order" integer;--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN "content_hash" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "photos_concert_hash_idx" ON "photos" ("concert_id","content_hash") WHERE content_hash IS NOT NULL;