DROP INDEX "car_public_published_idx";--> statement-breakpoint
ALTER TABLE "dealer_settings" ADD COLUMN "story_ar" text;--> statement-breakpoint
ALTER TABLE "dealer_settings" ADD COLUMN "story_en" text;--> statement-breakpoint
CREATE INDEX "car_public_sold_idx" ON "car" USING btree ("dealer_id","sold_at") WHERE "car"."status" = 'sold' AND "car"."demo_session_id" IS NULL;--> statement-breakpoint
CREATE INDEX "car_public_published_idx" ON "car" USING btree ("dealer_id","published_at" DESC NULLS FIRST) WHERE "car"."status" IN ('published', 'reserved') AND "car"."demo_session_id" IS NULL;--> statement-breakpoint
ALTER TABLE "dealer_settings" ADD CONSTRAINT "dealer_settings_story_length" CHECK (char_length("dealer_settings"."story_ar") <= 1000 AND char_length("dealer_settings"."story_en") <= 1000);--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_ready_size" CHECK ("media"."kind" NOT IN ('photo', 'spin_frame', 'og_image', 'blueprint', 'logo') OR "media"."status" = 'pending' OR ("media"."width" IS NOT NULL AND "media"."height" IS NOT NULL));