ALTER TABLE "media" DROP CONSTRAINT "media_client_upload_key";--> statement-breakpoint
CREATE UNIQUE INDEX "media_live_client_upload_key" ON "media" USING btree ("dealer_id","client_upload_id") WHERE "media"."demo_session_id" IS NULL;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_demo_client_upload_key" UNIQUE("demo_session_id","client_upload_id");