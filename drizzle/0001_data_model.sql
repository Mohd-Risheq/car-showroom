CREATE TYPE "public"."accent_preset" AS ENUM('scan_cyan', 'electric_blue', 'mint', 'ivory', 'violet');--> statement-breakpoint
CREATE TYPE "public"."audio_clip_type" AS ENUM('cold_start', 'idle', 'rev');--> statement-breakpoint
CREATE TYPE "public"."audio_source" AS ENUM('this_car', 'same_engine');--> statement-breakpoint
CREATE TYPE "public"."body_type" AS ENUM('suv', 'sedan', 'hatchback', 'pickup', 'coupe', 'convertible', 'van', 'truck');--> statement-breakpoint
CREATE TYPE "public"."car_condition" AS ENUM('used', 'new');--> statement-breakpoint
CREATE TYPE "public"."car_status" AS ENUM('draft', 'published', 'reserved', 'sold', 'archived');--> statement-breakpoint
CREATE TYPE "public"."color_family" AS ENUM('white', 'black', 'silver', 'gray', 'blue', 'red', 'green', 'beige', 'brown', 'gold', 'orange', 'yellow', 'other');--> statement-breakpoint
CREATE TYPE "public"."consumption_source" AS ENUM('dealer', 'epa');--> statement-breakpoint
CREATE TYPE "public"."customs_status" AS ENUM('cleared', 'not_cleared');--> statement-breakpoint
CREATE TYPE "public"."drivetrain" AS ENUM('fwd', 'rwd', 'awd', 'four_wd');--> statement-breakpoint
CREATE TYPE "public"."event_name" AS ENUM('page_home', 'page_inventory', 'car_view', 'sig_body_scan', 'sig_sound_play', 'sig_spin', 'sig_journey', 'sig_cost', 'race_run', 'contact_whatsapp', 'contact_call', 'contact_viewing', 'share_family', 'share_native', 'window_scan', 'garage_save', 'compare_add', 'demo_dealer_entered', 'car_published', 'share_kit_generate', 'reel_generated', 'client_error');--> statement-breakpoint
CREATE TYPE "public"."fuel_type" AS ENUM('gasoline', 'diesel', 'electric', 'hybrid', 'mild_hybrid', 'plugin_hybrid');--> statement-breakpoint
CREATE TYPE "public"."insurance_type" AS ENUM('comprehensive', 'compulsory', 'none');--> statement-breakpoint
CREATE TYPE "public"."license_status" AS ENUM('licensed', 'unlicensed');--> statement-breakpoint
CREATE TYPE "public"."locale" AS ENUM('ar', 'en');--> statement-breakpoint
CREATE TYPE "public"."mech_state" AS ENUM('sound', 'notes', 'issue', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."media_kind" AS ENUM('photo', 'spin_frame', 'engine_audio', 'inspection_report', 'og_image', 'blueprint', 'logo');--> statement-breakpoint
CREATE TYPE "public"."media_status" AS ENUM('pending', 'ready');--> statement-breakpoint
CREATE TYPE "public"."milestone_type" AS ENUM('built', 'first_sold', 'auction', 'shipped', 'arrived_port', 'free_zone', 'customs_cleared', 'inspected', 'in_showroom');--> statement-breakpoint
CREATE TYPE "public"."paint_finish" AS ENUM('solid', 'metallic', 'pearl', 'matte');--> statement-breakpoint
CREATE TYPE "public"."panel_id" AS ENUM('front_bumper', 'hood', 'roof', 'trunk', 'rear_bumper', 'fender_front_left', 'fender_front_right', 'door_front_left', 'door_front_right', 'door_rear_left', 'door_rear_right', 'quarter_rear_left', 'quarter_rear_right');--> statement-breakpoint
CREATE TYPE "public"."panel_state" AS ENUM('original', 'touch_up', 'repainted', 'replaced', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('cash', 'instalments');--> statement-breakpoint
CREATE TYPE "public"."photo_group" AS ENUM('exterior', 'interior', 'engine', 'imperfection');--> statement-breakpoint
CREATE TYPE "public"."place_kind" AS ENUM('port', 'city', 'free_zone', 'auction_yard', 'plant', 'region');--> statement-breakpoint
CREATE TYPE "public"."regional_specs" AS ENUM('american', 'european', 'gcc', 'chinese', 'korean', 'japanese', 'agency', 'other');--> statement-breakpoint
CREATE TYPE "public"."soh_source" AS ENUM('diagnostic_scan', 'service_report', 'car_display');--> statement-breakpoint
CREATE TYPE "public"."spin_direction" AS ENUM('cw', 'ccw');--> statement-breakpoint
CREATE TYPE "public"."spin_status" AS ENUM('processing', 'ready');--> statement-breakpoint
CREATE TYPE "public"."title_brand" AS ENUM('clean', 'salvage', 'rebuilt', 'flood', 'hail', 'other', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."transmission" AS ENUM('automatic', 'manual');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"dealer_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"actor_demo_session_id" varchar(32),
	"action" varchar(60) NOT NULL,
	"target_type" varchar(30),
	"target_id" uuid,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_log_one_actor" CHECK ("audit_log"."actor_user_id" IS NULL OR "audit_log"."actor_demo_session_id" IS NULL)
);
--> statement-breakpoint
CREATE TABLE "blob_ledger" (
	"month" char(7) PRIMARY KEY NOT NULL,
	"advanced_ops" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blob_ledger_month_format" CHECK ("blob_ledger"."month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
	CONSTRAINT "blob_ledger_advanced_ops_min" CHECK ("blob_ledger"."advanced_ops" >= 0)
);
--> statement-breakpoint
CREATE TABLE "car" (
	"id" uuid PRIMARY KEY NOT NULL,
	"dealer_id" uuid NOT NULL,
	"demo_session_id" varchar(32),
	"seed_key" varchar(40),
	"seed_offsets" jsonb,
	"copied_from_car_id" uuid,
	"client_draft_id" uuid,
	"ref_code" varchar(10) NOT NULL,
	"slug" varchar(160) NOT NULL,
	"status" "car_status" DEFAULT 'draft' NOT NULL,
	"make_key" varchar(40),
	"model_key" varchar(60),
	"trim" varchar(60),
	"model_year" smallint,
	"body_type" "body_type",
	"fuel_type" "fuel_type",
	"transmission" "transmission",
	"drivetrain" "drivetrain",
	"engine_cc" integer,
	"power_hp" smallint,
	"seats" smallint,
	"exterior_color_name_ar" varchar(40),
	"exterior_color_name_en" varchar(40),
	"exterior_color_hex" char(7),
	"paint_finish" "paint_finish",
	"color_family" "color_family",
	"interior_color_name_ar" varchar(40),
	"interior_color_name_en" varchar(40),
	"mileage_km" integer,
	"condition" "car_condition" DEFAULT 'used' NOT NULL,
	"regional_specs" "regional_specs",
	"customs_status" "customs_status",
	"license_status" "license_status",
	"license_expiry" date,
	"insurance_type" "insurance_type",
	"payment_methods" "payment_method"[] DEFAULT '{"cash"}' NOT NULL,
	"owners_count" smallint,
	"warranty_until" date,
	"vin" char(17),
	"vin_public" boolean DEFAULT false NOT NULL,
	"price_jod" integer,
	"description_ar" text,
	"description_en" text,
	"features" varchar(40)[] DEFAULT '{}' NOT NULL,
	"recommended_octane" smallint,
	"length_mm" integer,
	"wheelbase_mm" integer,
	"consumption_l_per_100km" numeric(4, 1),
	"consumption_kwh_per_100km" numeric(4, 1),
	"consumption_source" "consumption_source",
	"phev_electric_share_pct" smallint,
	"battery_soh_pct" smallint,
	"battery_soh_source" "soh_source",
	"cover_media_id" uuid,
	"og_media_id" uuid,
	"blueprint_media_id" uuid,
	"plates_confirmed" boolean DEFAULT false NOT NULL,
	"published_at" timestamp with time zone,
	"sold_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"draft_step" smallint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "car_seed_key_unique" UNIQUE("seed_key"),
	CONSTRAINT "car_demo_ref_code_key" UNIQUE("demo_session_id","ref_code"),
	CONSTRAINT "car_demo_slug_key" UNIQUE("demo_session_id","slug"),
	CONSTRAINT "car_demo_copied_from_key" UNIQUE("demo_session_id","copied_from_car_id"),
	CONSTRAINT "car_demo_client_draft_key" UNIQUE("demo_session_id","client_draft_id"),
	CONSTRAINT "car_model_needs_make" CHECK ("car"."model_key" IS NULL OR "car"."make_key" IS NOT NULL),
	CONSTRAINT "car_seed_live" CHECK ("car"."seed_key" IS NULL OR "car"."demo_session_id" IS NULL),
	CONSTRAINT "car_seed_offsets_seed_only" CHECK ("car"."seed_offsets" IS NULL OR "car"."seed_key" IS NOT NULL),
	CONSTRAINT "car_copy_in_session" CHECK ("car"."copied_from_car_id" IS NULL OR "car"."demo_session_id" IS NOT NULL),
	CONSTRAINT "car_ref_code_format" CHECK ("car"."ref_code" ~ '^[A-Z]{2}-[2-9A-HJKMNP-Z]{4}$'),
	CONSTRAINT "car_slug_format" CHECK ("car"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "car_model_year_min" CHECK ("car"."model_year" >= 1990),
	CONSTRAINT "car_engine_cc_range" CHECK ("car"."engine_cc" BETWEEN 0 AND 10000),
	CONSTRAINT "car_power_hp_range" CHECK ("car"."power_hp" BETWEEN 30 AND 2000),
	CONSTRAINT "car_seats_range" CHECK ("car"."seats" BETWEEN 2 AND 15),
	CONSTRAINT "car_exterior_color_hex_format" CHECK ("car"."exterior_color_hex" ~ '^#[0-9a-f]{6}$'),
	CONSTRAINT "car_mileage_km_range" CHECK ("car"."mileage_km" BETWEEN 0 AND 1500000),
	CONSTRAINT "car_license_expiry_month" CHECK (EXTRACT(DAY FROM "car"."license_expiry") = 1),
	CONSTRAINT "car_owners_count_range" CHECK ("car"."owners_count" BETWEEN 1 AND 20),
	CONSTRAINT "car_vin_format" CHECK ("car"."vin" ~ '^[A-HJ-NPR-Z0-9]{17}$'),
	CONSTRAINT "car_price_jod_range" CHECK ("car"."price_jod" BETWEEN 300 AND 1000000),
	CONSTRAINT "car_description_ar_length" CHECK (char_length("car"."description_ar") <= 3000),
	CONSTRAINT "car_description_en_length" CHECK (char_length("car"."description_en") <= 3000),
	CONSTRAINT "car_features_max" CHECK (cardinality("car"."features") <= 80),
	CONSTRAINT "car_recommended_octane" CHECK ("car"."recommended_octane" IN (90, 95, 98)),
	CONSTRAINT "car_length_mm_range" CHECK ("car"."length_mm" BETWEEN 2500 AND 6500),
	CONSTRAINT "car_wheelbase_mm_range" CHECK ("car"."wheelbase_mm" BETWEEN 1800 AND 4200 AND "car"."wheelbase_mm" < "car"."length_mm"),
	CONSTRAINT "car_consumption_l_range" CHECK ("car"."consumption_l_per_100km" BETWEEN 1 AND 40),
	CONSTRAINT "car_consumption_kwh_range" CHECK ("car"."consumption_kwh_per_100km" BETWEEN 5 AND 60),
	CONSTRAINT "car_phev_electric_share_range" CHECK ("car"."phev_electric_share_pct" BETWEEN 0 AND 100),
	CONSTRAINT "car_battery_soh_range" CHECK ("car"."battery_soh_pct" BETWEEN 0 AND 100),
	CONSTRAINT "car_battery_soh_source" CHECK ("car"."battery_soh_pct" IS NULL OR "car"."battery_soh_source" IS NOT NULL),
	CONSTRAINT "car_published_at_set" CHECK ("car"."status" NOT IN ('published', 'reserved', 'sold') OR "car"."published_at" IS NOT NULL),
	CONSTRAINT "car_sold_at_set" CHECK ("car"."status" <> 'sold' OR "car"."sold_at" IS NOT NULL),
	CONSTRAINT "car_archived_at_set" CHECK ("car"."status" <> 'archived' OR "car"."archived_at" IS NOT NULL),
	CONSTRAINT "car_version_min" CHECK ("car"."version" >= 1),
	CONSTRAINT "car_draft_step_range" CHECK ("car"."draft_step" BETWEEN 1 AND 10)
);
--> statement-breakpoint
CREATE TABLE "car_slug_history" (
	"car_id" uuid NOT NULL,
	"dealer_id" uuid NOT NULL,
	"demo_session_id" varchar(32),
	"slug" varchar(160) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "car_slug_history_car_id_slug_pk" PRIMARY KEY("car_id","slug"),
	CONSTRAINT "car_slug_history_demo_key" UNIQUE("demo_session_id","slug")
);
--> statement-breakpoint
CREATE TABLE "dealer" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" varchar(40) NOT NULL,
	"ref_prefix" char(2) DEFAULT 'MU' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dealer_slug_unique" UNIQUE("slug"),
	CONSTRAINT "dealer_slug_format" CHECK ("dealer"."slug" ~ '^[a-z0-9-]+$'),
	CONSTRAINT "dealer_ref_prefix_format" CHECK ("dealer"."ref_prefix" ~ '^[A-Z]{2}$')
);
--> statement-breakpoint
CREATE TABLE "dealer_settings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"dealer_id" uuid NOT NULL,
	"demo_session_id" varchar(32),
	"brand_name_ar" varchar(60) NOT NULL,
	"brand_name_en" varchar(60) NOT NULL,
	"tagline_ar" varchar(120),
	"tagline_en" varchar(120),
	"logo_media_id" uuid,
	"accent_preset" "accent_preset" DEFAULT 'scan_cyan' NOT NULL,
	"whatsapp_e164" varchar(16),
	"phone_e164" varchar(16),
	"email" varchar(254),
	"address_ar" varchar(200),
	"address_en" varchar(200),
	"lat" numeric(9, 6),
	"lng" numeric(9, 6),
	"social" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"hours" jsonb DEFAULT '{"sat":[{"open":"09:00","close":"21:00","overnight":false}],"sun":[{"open":"09:00","close":"21:00","overnight":false}],"mon":[{"open":"09:00","close":"21:00","overnight":false}],"tue":[{"open":"09:00","close":"21:00","overnight":false}],"wed":[{"open":"09:00","close":"21:00","overnight":false}],"thu":[{"open":"09:00","close":"21:00","overnight":false}],"fri":[{"open":"14:00","close":"21:00","overnight":false}]}'::jsonb NOT NULL,
	"ramadan" jsonb,
	"closures" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"fuel_price_90" numeric(6, 3) DEFAULT 1.05,
	"fuel_price_95" numeric(6, 3) DEFAULT 1.36,
	"fuel_price_98" numeric(6, 3) DEFAULT 1.51,
	"fuel_price_diesel" numeric(6, 3) DEFAULT 0.9,
	"elec_home_offpeak_kwh" numeric(6, 3) DEFAULT 0.108,
	"elec_home_peak_kwh" numeric(6, 3) DEFAULT 0.16,
	"elec_public_kwh" numeric(6, 3) DEFAULT 0.133,
	"baseline_l_per_100km" jsonb DEFAULT '{"sedan":8,"suv":11,"hatchback":7,"pickup":12,"coupe":9,"convertible":9.5,"van":12,"truck":16}'::jsonb NOT NULL,
	"prices_updated_at" timestamp with time zone,
	"hero_car_id" uuid,
	"hero_media_id" uuid,
	"hero_marks" jsonb,
	"featured_car_ids" uuid[] DEFAULT '{}' NOT NULL,
	"sold_visible_days" smallint DEFAULT 14 NOT NULL,
	"mileage_bands" jsonb DEFAULT '{"low":12000,"high":25000}'::jsonb NOT NULL,
	"micron_bands" jsonb DEFAULT '{"factoryMax":180,"refinishMax":300}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dealer_settings_dealer_demo_key" UNIQUE("dealer_id","demo_session_id"),
	CONSTRAINT "dealer_settings_brand_name_length" CHECK (char_length("dealer_settings"."brand_name_ar") BETWEEN 2 AND 60 AND char_length("dealer_settings"."brand_name_en") BETWEEN 2 AND 60),
	CONSTRAINT "dealer_settings_whatsapp_format" CHECK ("dealer_settings"."whatsapp_e164" ~ '^[+][1-9][0-9]{7,14}$'),
	CONSTRAINT "dealer_settings_phone_format" CHECK ("dealer_settings"."phone_e164" ~ '^[+][1-9][0-9]{7,14}$'),
	CONSTRAINT "dealer_settings_coordinates" CHECK (("dealer_settings"."lat" IS NULL) = ("dealer_settings"."lng" IS NULL) AND "dealer_settings"."lat" BETWEEN -90 AND 90 AND "dealer_settings"."lng" BETWEEN -180 AND 180),
	CONSTRAINT "dealer_settings_unit_prices_range" CHECK ("dealer_settings"."fuel_price_90" BETWEEN 0.05 AND 5 AND "dealer_settings"."fuel_price_95" BETWEEN 0.05 AND 5 AND "dealer_settings"."fuel_price_98" BETWEEN 0.05 AND 5 AND "dealer_settings"."fuel_price_diesel" BETWEEN 0.05 AND 5 AND "dealer_settings"."elec_home_offpeak_kwh" BETWEEN 0.05 AND 5 AND "dealer_settings"."elec_home_peak_kwh" BETWEEN 0.05 AND 5 AND "dealer_settings"."elec_public_kwh" BETWEEN 0.05 AND 5),
	CONSTRAINT "dealer_settings_featured_max" CHECK (cardinality("dealer_settings"."featured_car_ids") <= 8),
	CONSTRAINT "dealer_settings_sold_visible_days_range" CHECK ("dealer_settings"."sold_visible_days" BETWEEN 0 AND 60)
);
--> statement-breakpoint
CREATE TABLE "demo_session" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"token_hash" char(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone DEFAULT now() + interval '24 hours' NOT NULL,
	"cars_created" smallint DEFAULT 0 NOT NULL,
	"copies_count" smallint DEFAULT 0 NOT NULL,
	"photos_count" smallint DEFAULT 0 NOT NULL,
	"spin_frames" smallint DEFAULT 0 NOT NULL,
	"audio_count" smallint DEFAULT 0 NOT NULL,
	"reports_count" smallint DEFAULT 0 NOT NULL,
	"decodes_count" smallint DEFAULT 0 NOT NULL,
	"logo_count" smallint DEFAULT 0 NOT NULL,
	"upload_tokens" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "demo_session_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "demo_session_id_format" CHECK ("demo_session"."id" ~ '^[A-Za-z0-9_-]{22}$'),
	CONSTRAINT "demo_session_token_hash_format" CHECK ("demo_session"."token_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "demo_session_counters_min" CHECK (least("demo_session"."cars_created", "demo_session"."copies_count", "demo_session"."photos_count", "demo_session"."spin_frames", "demo_session"."audio_count", "demo_session"."reports_count", "demo_session"."decodes_count", "demo_session"."logo_count", "demo_session"."upload_tokens") >= 0)
);
--> statement-breakpoint
CREATE TABLE "event_daily" (
	"day" date NOT NULL,
	"event" "event_name" NOT NULL,
	"car_id" uuid NOT NULL,
	"locale" "locale" NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "event_daily_day_event_car_id_locale_pk" PRIMARY KEY("day","event","car_id","locale"),
	CONSTRAINT "event_daily_count_min" CHECK ("event_daily"."count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "inspection" (
	"id" uuid PRIMARY KEY NOT NULL,
	"car_id" uuid NOT NULL,
	"inspected_on" date,
	"test_center_name" varchar(80),
	"report_media_id" uuid,
	"chassis_state" "mech_state" DEFAULT 'unknown' NOT NULL,
	"engine_state" "mech_state" DEFAULT 'unknown' NOT NULL,
	"gearbox_state" "mech_state" DEFAULT 'unknown' NOT NULL,
	"chassis_note_ar" varchar(200),
	"chassis_note_en" varchar(200),
	"engine_note_ar" varchar(200),
	"engine_note_en" varchar(200),
	"gearbox_note_ar" varchar(200),
	"gearbox_note_en" varchar(200),
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inspection_car_id_unique" UNIQUE("car_id")
);
--> statement-breakpoint
CREATE TABLE "inspection_panel" (
	"id" uuid PRIMARY KEY NOT NULL,
	"inspection_id" uuid NOT NULL,
	"panel_id" "panel_id" NOT NULL,
	"state" "panel_state" DEFAULT 'unknown' NOT NULL,
	"microns" smallint,
	"note_ar" varchar(200),
	"note_en" varchar(200),
	"closeup_media_id" uuid,
	CONSTRAINT "inspection_panel_key" UNIQUE("inspection_id","panel_id"),
	CONSTRAINT "inspection_panel_microns_range" CHECK ("inspection_panel"."microns" BETWEEN 0 AND 2000)
);
--> statement-breakpoint
CREATE TABLE "journey_milestone" (
	"id" uuid PRIMARY KEY NOT NULL,
	"car_id" uuid NOT NULL,
	"sort_order" smallint NOT NULL,
	"type" "milestone_type" NOT NULL,
	"place_id" uuid,
	"occurred_month" date,
	"note_ar" varchar(240),
	"note_en" varchar(240),
	"auction_house" varchar(60),
	"title_brand" "title_brand",
	"damage_note_ar" varchar(240),
	"damage_note_en" varchar(240),
	CONSTRAINT "journey_milestone_key" UNIQUE("car_id","sort_order"),
	CONSTRAINT "journey_milestone_sort_order_range" CHECK ("journey_milestone"."sort_order" BETWEEN 0 AND 9),
	CONSTRAINT "journey_milestone_month" CHECK (EXTRACT(DAY FROM "journey_milestone"."occurred_month") = 1),
	CONSTRAINT "journey_milestone_auction_title" CHECK ("journey_milestone"."type" <> 'auction' OR "journey_milestone"."title_brand" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "make" (
	"key" varchar(40) PRIMARY KEY NOT NULL,
	"name_en" varchar(40) NOT NULL,
	"name_ar" varchar(40) NOT NULL,
	CONSTRAINT "make_key_format" CHECK ("make"."key" ~ '^[a-z0-9-]+$')
);
--> statement-breakpoint
CREATE TABLE "media" (
	"id" uuid PRIMARY KEY NOT NULL,
	"dealer_id" uuid NOT NULL,
	"car_id" uuid,
	"demo_session_id" varchar(32),
	"kind" "media_kind" NOT NULL,
	"photo_group" "photo_group",
	"sort_order" integer DEFAULT 0 NOT NULL,
	"alt_ar" varchar(200),
	"alt_en" varchar(200),
	"width" integer,
	"height" integer,
	"dominant_color" char(7),
	"placeholder" varchar(64),
	"variants" jsonb,
	"mime" varchar(40),
	"bytes" integer,
	"duration_ms" integer,
	"peaks" jsonb,
	"audio_clip_type" "audio_clip_type",
	"audio_source" "audio_source",
	"description_ar" varchar(300),
	"description_en" varchar(300),
	"recorded_at" timestamp with time zone,
	"storage_prefix" varchar(200) NOT NULL,
	"deleted_at" timestamp with time zone,
	"status" "media_status" DEFAULT 'pending' NOT NULL,
	"client_upload_id" uuid NOT NULL,
	"expected_paths" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_client_upload_key" UNIQUE("dealer_id","client_upload_id"),
	CONSTRAINT "media_car_unless_logo" CHECK (("media"."kind" = 'logo') = ("media"."car_id" IS NULL)),
	CONSTRAINT "media_photo_group_photos_only" CHECK ("media"."photo_group" IS NULL OR "media"."kind" = 'photo'),
	CONSTRAINT "media_sort_order_min" CHECK ("media"."sort_order" >= 0),
	CONSTRAINT "media_size_positive" CHECK ("media"."width" > 0 AND "media"."height" > 0),
	CONSTRAINT "media_dominant_color_format" CHECK ("media"."dominant_color" ~ '^#[0-9a-f]{6}$'),
	CONSTRAINT "media_mime_allowed" CHECK ("media"."mime" IN ('image/jpeg', 'image/webp', 'image/png', 'audio/wav', 'application/pdf')),
	CONSTRAINT "media_bytes_positive" CHECK ("media"."bytes" > 0),
	CONSTRAINT "media_duration_ms_range" CHECK ("media"."duration_ms" BETWEEN 5000 AND 30000),
	CONSTRAINT "media_peaks_shape" CHECK (CASE WHEN jsonb_typeof("media"."peaks") = 'array' THEN jsonb_array_length("media"."peaks") = 200 ELSE "media"."peaks" IS NULL END),
	CONSTRAINT "media_audio_fields" CHECK ("media"."kind" = 'engine_audio' OR ("media"."audio_source" IS NULL AND "media"."audio_clip_type" IS NULL)),
	CONSTRAINT "media_ready_registered" CHECK ("media"."status" = 'pending' OR ("media"."variants" IS NOT NULL AND "media"."mime" IS NOT NULL AND "media"."bytes" IS NOT NULL)),
	CONSTRAINT "media_ready_photo_group" CHECK ("media"."kind" <> 'photo' OR "media"."status" = 'pending' OR "media"."photo_group" IS NOT NULL),
	CONSTRAINT "media_ready_audio" CHECK ("media"."kind" <> 'engine_audio' OR "media"."status" = 'pending' OR ("media"."audio_source" IS NOT NULL AND "media"."audio_clip_type" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "model" (
	"key" varchar(60) PRIMARY KEY NOT NULL,
	"make_key" varchar(40) NOT NULL,
	"name_en" varchar(60) NOT NULL,
	"name_ar" varchar(60) NOT NULL,
	"default_body_type" "body_type",
	CONSTRAINT "model_make_key" UNIQUE("make_key","key"),
	CONSTRAINT "model_key_format" CHECK ("model"."key" ~ '^[a-z0-9-]+$')
);
--> statement-breakpoint
CREATE TABLE "model_alias" (
	"id" uuid PRIMARY KEY NOT NULL,
	"model_key" varchar(60) NOT NULL,
	"alias" varchar(60) NOT NULL,
	CONSTRAINT "model_alias_key" UNIQUE("model_key","alias")
);
--> statement-breakpoint
CREATE TABLE "place" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" varchar(60),
	"name_ar" varchar(80) NOT NULL,
	"name_en" varchar(80) NOT NULL,
	"country_code" char(2),
	"lat" numeric(9, 6),
	"lng" numeric(9, 6),
	"kind" "place_kind",
	"is_preset" boolean DEFAULT false NOT NULL,
	"dealer_id" uuid,
	"demo_session_id" varchar(32),
	CONSTRAINT "place_key_unique" UNIQUE("key"),
	CONSTRAINT "place_owner" CHECK ("place"."is_preset" = ("place"."dealer_id" IS NULL) AND NOT ("place"."is_preset" AND "place"."demo_session_id" IS NOT NULL)),
	CONSTRAINT "place_preset_complete" CHECK (NOT "place"."is_preset" OR ("place"."key" IS NOT NULL AND "place"."country_code" IS NOT NULL AND "place"."lat" IS NOT NULL AND "place"."kind" IS NOT NULL)),
	CONSTRAINT "place_key_format" CHECK ("place"."key" ~ '^[a-z0-9_]+$'),
	CONSTRAINT "place_country_code_format" CHECK ("place"."country_code" ~ '^[A-Z]{2}$'),
	CONSTRAINT "place_coordinates" CHECK (("place"."lat" IS NULL) = ("place"."lng" IS NULL) AND "place"."lat" BETWEEN -90 AND 90 AND "place"."lng" BETWEEN -180 AND 180)
);
--> statement-breakpoint
CREATE TABLE "price_change" (
	"id" uuid PRIMARY KEY NOT NULL,
	"car_id" uuid NOT NULL,
	"old_price_jod" integer NOT NULL,
	"new_price_jod" integer NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"changed_by" uuid,
	CONSTRAINT "price_change_prices_range" CHECK ("price_change"."old_price_jod" BETWEEN 300 AND 1000000 AND "price_change"."new_price_jod" BETWEEN 300 AND 1000000),
	CONSTRAINT "price_change_changed" CHECK ("price_change"."new_price_jod" <> "price_change"."old_price_jod")
);
--> statement-breakpoint
CREATE TABLE "rate_limit" (
	"key" varchar(80) PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone DEFAULT now() NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"blocked_until" timestamp with time zone,
	CONSTRAINT "rate_limit_count_min" CHECK ("rate_limit"."count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "spin_frame" (
	"spin_set_id" uuid NOT NULL,
	"index" smallint NOT NULL,
	"media_id" uuid NOT NULL,
	CONSTRAINT "spin_frame_spin_set_id_index_pk" PRIMARY KEY("spin_set_id","index"),
	CONSTRAINT "spin_frame_index_range" CHECK ("spin_frame"."index" BETWEEN 0 AND 71)
);
--> statement-breakpoint
CREATE TABLE "spin_hotspot" (
	"id" uuid PRIMARY KEY NOT NULL,
	"spin_set_id" uuid NOT NULL,
	"key_frame" smallint NOT NULL,
	"x" numeric(5, 4) NOT NULL,
	"y" numeric(5, 4) NOT NULL,
	"window" smallint DEFAULT 3 NOT NULL,
	"note_ar" varchar(160),
	"note_en" varchar(160),
	"closeup_media_id" uuid,
	"sort_order" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "spin_hotspot_key_frame_range" CHECK ("spin_hotspot"."key_frame" BETWEEN 0 AND 71),
	CONSTRAINT "spin_hotspot_position_range" CHECK ("spin_hotspot"."x" BETWEEN 0 AND 1 AND "spin_hotspot"."y" BETWEEN 0 AND 1),
	CONSTRAINT "spin_hotspot_window_range" CHECK ("spin_hotspot"."window" BETWEEN 0 AND 12),
	CONSTRAINT "spin_hotspot_note_present" CHECK ("spin_hotspot"."note_ar" IS NOT NULL OR "spin_hotspot"."note_en" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "spin_set" (
	"id" uuid PRIMARY KEY NOT NULL,
	"car_id" uuid NOT NULL,
	"frame_count" smallint NOT NULL,
	"direction" "spin_direction" DEFAULT 'cw' NOT NULL,
	"crop" jsonb DEFAULT '{"x":0,"y":0,"w":1,"h":1}'::jsonb NOT NULL,
	"poster_frame" smallint DEFAULT 0 NOT NULL,
	"status" "spin_status" DEFAULT 'processing' NOT NULL,
	CONSTRAINT "spin_set_car_id_unique" UNIQUE("car_id"),
	CONSTRAINT "spin_set_frame_count_range" CHECK ("spin_set"."frame_count" BETWEEN 24 AND 72),
	CONSTRAINT "spin_set_poster_frame_range" CHECK ("spin_set"."poster_frame" >= 0 AND "spin_set"."poster_frame" < "spin_set"."frame_count")
);
--> statement-breakpoint
CREATE TABLE "vin_decode_cache" (
	"vin" char(17) PRIMARY KEY NOT NULL,
	"payload" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vin_decode_cache_vin_format" CHECK ("vin_decode_cache"."vin" ~ '^[A-HJ-NPR-Z0-9]{17}$')
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "dealer_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_dealer_id_dealer_id_fk" FOREIGN KEY ("dealer_id") REFERENCES "public"."dealer"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "car" ADD CONSTRAINT "car_dealer_id_dealer_id_fk" FOREIGN KEY ("dealer_id") REFERENCES "public"."dealer"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "car" ADD CONSTRAINT "car_demo_session_id_demo_session_id_fk" FOREIGN KEY ("demo_session_id") REFERENCES "public"."demo_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "car" ADD CONSTRAINT "car_copied_from_car_id_car_id_fk" FOREIGN KEY ("copied_from_car_id") REFERENCES "public"."car"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "car" ADD CONSTRAINT "car_make_key_make_key_fk" FOREIGN KEY ("make_key") REFERENCES "public"."make"("key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "car" ADD CONSTRAINT "car_cover_media_id_media_id_fk" FOREIGN KEY ("cover_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "car" ADD CONSTRAINT "car_og_media_id_media_id_fk" FOREIGN KEY ("og_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "car" ADD CONSTRAINT "car_blueprint_media_id_media_id_fk" FOREIGN KEY ("blueprint_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "car" ADD CONSTRAINT "car_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "car" ADD CONSTRAINT "car_model_fk" FOREIGN KEY ("make_key","model_key") REFERENCES "public"."model"("make_key","key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "car_slug_history" ADD CONSTRAINT "car_slug_history_car_id_car_id_fk" FOREIGN KEY ("car_id") REFERENCES "public"."car"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "car_slug_history" ADD CONSTRAINT "car_slug_history_dealer_id_dealer_id_fk" FOREIGN KEY ("dealer_id") REFERENCES "public"."dealer"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "car_slug_history" ADD CONSTRAINT "car_slug_history_demo_session_id_demo_session_id_fk" FOREIGN KEY ("demo_session_id") REFERENCES "public"."demo_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dealer_settings" ADD CONSTRAINT "dealer_settings_dealer_id_dealer_id_fk" FOREIGN KEY ("dealer_id") REFERENCES "public"."dealer"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dealer_settings" ADD CONSTRAINT "dealer_settings_demo_session_id_demo_session_id_fk" FOREIGN KEY ("demo_session_id") REFERENCES "public"."demo_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dealer_settings" ADD CONSTRAINT "dealer_settings_logo_media_id_media_id_fk" FOREIGN KEY ("logo_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dealer_settings" ADD CONSTRAINT "dealer_settings_hero_car_id_car_id_fk" FOREIGN KEY ("hero_car_id") REFERENCES "public"."car"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dealer_settings" ADD CONSTRAINT "dealer_settings_hero_media_id_media_id_fk" FOREIGN KEY ("hero_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection" ADD CONSTRAINT "inspection_car_id_car_id_fk" FOREIGN KEY ("car_id") REFERENCES "public"."car"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection" ADD CONSTRAINT "inspection_report_media_id_media_id_fk" FOREIGN KEY ("report_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection" ADD CONSTRAINT "inspection_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_panel" ADD CONSTRAINT "inspection_panel_inspection_id_inspection_id_fk" FOREIGN KEY ("inspection_id") REFERENCES "public"."inspection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_panel" ADD CONSTRAINT "inspection_panel_closeup_media_id_media_id_fk" FOREIGN KEY ("closeup_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey_milestone" ADD CONSTRAINT "journey_milestone_car_id_car_id_fk" FOREIGN KEY ("car_id") REFERENCES "public"."car"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey_milestone" ADD CONSTRAINT "journey_milestone_place_id_place_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."place"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_dealer_id_dealer_id_fk" FOREIGN KEY ("dealer_id") REFERENCES "public"."dealer"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_car_id_car_id_fk" FOREIGN KEY ("car_id") REFERENCES "public"."car"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_demo_session_id_demo_session_id_fk" FOREIGN KEY ("demo_session_id") REFERENCES "public"."demo_session"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model" ADD CONSTRAINT "model_make_key_make_key_fk" FOREIGN KEY ("make_key") REFERENCES "public"."make"("key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_alias" ADD CONSTRAINT "model_alias_model_key_model_key_fk" FOREIGN KEY ("model_key") REFERENCES "public"."model"("key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place" ADD CONSTRAINT "place_dealer_id_dealer_id_fk" FOREIGN KEY ("dealer_id") REFERENCES "public"."dealer"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place" ADD CONSTRAINT "place_demo_session_id_demo_session_id_fk" FOREIGN KEY ("demo_session_id") REFERENCES "public"."demo_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_change" ADD CONSTRAINT "price_change_car_id_car_id_fk" FOREIGN KEY ("car_id") REFERENCES "public"."car"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_change" ADD CONSTRAINT "price_change_changed_by_user_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spin_frame" ADD CONSTRAINT "spin_frame_spin_set_id_spin_set_id_fk" FOREIGN KEY ("spin_set_id") REFERENCES "public"."spin_set"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spin_frame" ADD CONSTRAINT "spin_frame_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spin_hotspot" ADD CONSTRAINT "spin_hotspot_spin_set_id_spin_set_id_fk" FOREIGN KEY ("spin_set_id") REFERENCES "public"."spin_set"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spin_hotspot" ADD CONSTRAINT "spin_hotspot_closeup_media_id_media_id_fk" FOREIGN KEY ("closeup_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spin_set" ADD CONSTRAINT "spin_set_car_id_car_id_fk" FOREIGN KEY ("car_id") REFERENCES "public"."car"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_at_idx" ON "audit_log" USING btree ("at");--> statement-breakpoint
CREATE INDEX "audit_log_action_at_idx" ON "audit_log" USING btree ("action","at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "audit_log_dealer_action_at_idx" ON "audit_log" USING btree ("dealer_id","action","at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "car_dealer_status_published_idx" ON "car" USING btree ("dealer_id","status","published_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "car_dealer_price_idx" ON "car" USING btree ("dealer_id","price_jod");--> statement-breakpoint
CREATE INDEX "car_dealer_mileage_idx" ON "car" USING btree ("dealer_id","mileage_km");--> statement-breakpoint
CREATE INDEX "car_dealer_model_year_idx" ON "car" USING btree ("dealer_id","model_year");--> statement-breakpoint
CREATE INDEX "car_dealer_make_model_idx" ON "car" USING btree ("dealer_id","make_key","model_key");--> statement-breakpoint
CREATE INDEX "car_features_idx" ON "car" USING gin ("features");--> statement-breakpoint
CREATE INDEX "car_demo_session_id_idx" ON "car" USING btree ("demo_session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "car_live_ref_code_key" ON "car" USING btree ("dealer_id","ref_code") WHERE "car"."demo_session_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "car_live_slug_key" ON "car" USING btree ("dealer_id","slug") WHERE "car"."demo_session_id" IS NULL;--> statement-breakpoint
CREATE INDEX "car_public_published_idx" ON "car" USING btree ("dealer_id","published_at" DESC NULLS FIRST) WHERE "car"."status" IN ('published', 'reserved');--> statement-breakpoint
CREATE UNIQUE INDEX "car_live_client_draft_key" ON "car" USING btree ("dealer_id","client_draft_id") WHERE "car"."demo_session_id" IS NULL;--> statement-breakpoint
CREATE INDEX "car_dealer_vin_idx" ON "car" USING btree ("dealer_id","vin") WHERE "car"."vin" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "car_archived_at_idx" ON "car" USING btree ("archived_at") WHERE "car"."status" = 'archived';--> statement-breakpoint
CREATE INDEX "car_copied_from_car_id_idx" ON "car" USING btree ("copied_from_car_id");--> statement-breakpoint
CREATE INDEX "car_cover_media_id_idx" ON "car" USING btree ("cover_media_id");--> statement-breakpoint
CREATE INDEX "car_og_media_id_idx" ON "car" USING btree ("og_media_id");--> statement-breakpoint
CREATE INDEX "car_blueprint_media_id_idx" ON "car" USING btree ("blueprint_media_id");--> statement-breakpoint
CREATE INDEX "car_created_by_idx" ON "car" USING btree ("created_by");--> statement-breakpoint
CREATE UNIQUE INDEX "car_slug_history_live_key" ON "car_slug_history" USING btree ("dealer_id","slug") WHERE "car_slug_history"."demo_session_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "dealer_settings_live_key" ON "dealer_settings" USING btree ("dealer_id") WHERE "dealer_settings"."demo_session_id" IS NULL;--> statement-breakpoint
CREATE INDEX "dealer_settings_demo_session_id_idx" ON "dealer_settings" USING btree ("demo_session_id");--> statement-breakpoint
CREATE INDEX "dealer_settings_logo_media_id_idx" ON "dealer_settings" USING btree ("logo_media_id");--> statement-breakpoint
CREATE INDEX "dealer_settings_hero_car_id_idx" ON "dealer_settings" USING btree ("hero_car_id");--> statement-breakpoint
CREATE INDEX "dealer_settings_hero_media_id_idx" ON "dealer_settings" USING btree ("hero_media_id");--> statement-breakpoint
CREATE INDEX "demo_session_expires_at_idx" ON "demo_session" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "inspection_report_media_id_idx" ON "inspection" USING btree ("report_media_id");--> statement-breakpoint
CREATE INDEX "inspection_updated_by_idx" ON "inspection" USING btree ("updated_by");--> statement-breakpoint
CREATE INDEX "inspection_panel_closeup_media_id_idx" ON "inspection_panel" USING btree ("closeup_media_id");--> statement-breakpoint
CREATE INDEX "journey_milestone_place_id_idx" ON "journey_milestone" USING btree ("place_id");--> statement-breakpoint
CREATE INDEX "media_car_kind_sort_idx" ON "media" USING btree ("car_id","kind","sort_order");--> statement-breakpoint
CREATE INDEX "media_demo_session_id_idx" ON "media" USING btree ("demo_session_id");--> statement-breakpoint
CREATE INDEX "media_status_created_idx" ON "media" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "media_deleted_at_idx" ON "media" USING btree ("deleted_at") WHERE "media"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "model_alias_alias_idx" ON "model_alias" USING btree ("alias");--> statement-breakpoint
CREATE INDEX "place_dealer_demo_idx" ON "place" USING btree ("dealer_id","demo_session_id");--> statement-breakpoint
CREATE INDEX "place_demo_session_id_idx" ON "place" USING btree ("demo_session_id");--> statement-breakpoint
CREATE INDEX "price_change_car_changed_idx" ON "price_change" USING btree ("car_id","changed_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "price_change_changed_by_idx" ON "price_change" USING btree ("changed_by");--> statement-breakpoint
CREATE INDEX "rate_limit_window_start_idx" ON "rate_limit" USING btree ("window_start");--> statement-breakpoint
CREATE INDEX "spin_frame_media_id_idx" ON "spin_frame" USING btree ("media_id");--> statement-breakpoint
CREATE INDEX "spin_hotspot_set_sort_idx" ON "spin_hotspot" USING btree ("spin_set_id","sort_order");--> statement-breakpoint
CREATE INDEX "spin_hotspot_closeup_media_id_idx" ON "spin_hotspot" USING btree ("closeup_media_id");--> statement-breakpoint
CREATE INDEX "vin_decode_cache_fetched_at_idx" ON "vin_decode_cache" USING btree ("fetched_at");--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_dealer_id_dealer_id_fk" FOREIGN KEY ("dealer_id") REFERENCES "public"."dealer"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_dealer_id_idx" ON "user" USING btree ("dealer_id");