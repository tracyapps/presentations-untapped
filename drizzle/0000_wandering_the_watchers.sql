CREATE TYPE "public"."comment_subject" AS ENUM('deck', 'slide', 'block', 'library_item');--> statement-breakpoint
CREATE TYPE "public"."deck_status" AS ENUM('draft', 'in_review', 'approved');--> statement-breakpoint
CREATE TYPE "public"."library_kind" AS ENUM('block', 'slide');--> statement-breakpoint
CREATE TYPE "public"."library_status" AS ENUM('draft', 'in_review', 'approved');--> statement-breakpoint
CREATE TYPE "public"."tag_kind" AS ENUM('category', 'tag', 'person');--> statement-breakpoint
CREATE TYPE "public"."taggable_type" AS ENUM('library_item', 'media_asset', 'client');--> statement-breakpoint
CREATE TYPE "public"."theme_mode" AS ENUM('light', 'dark');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'approver', 'editor', 'viewer');--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo_url" text,
	"logo_dark_url" text,
	"logo_mark_url" text,
	"website" text,
	"industry" text,
	"brand_primary" text,
	"brand_secondary" text,
	"bitrix_id" text,
	"airtable_base_id" text,
	"airtable_table_id" text,
	"airtable_record_id" text,
	"last_synced_at" timestamp with time zone,
	"notes" text,
	"archived_at" timestamp with time zone,
	"contact_name" text,
	"contact_email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_type" "comment_subject" DEFAULT 'slide' NOT NULL,
	"subject_id" uuid NOT NULL,
	"deck_id" uuid,
	"slide_id" uuid,
	"block_id" text,
	"parent_id" uuid,
	"author_id" text NOT NULL,
	"body" text NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"name" text NOT NULL,
	"title" text,
	"email" text,
	"phone" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "decks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"event_id" uuid,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"status" "deck_status" DEFAULT 'draft' NOT NULL,
	"theme_default" "theme_mode" DEFAULT 'light' NOT NULL,
	"published_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"name" text NOT NULL,
	"logo_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "favorites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"subject_type" "taggable_type" NOT NULL,
	"subject_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "library_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "library_kind" NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"payload" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"status" "library_status" DEFAULT 'draft' NOT NULL,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"locked" boolean DEFAULT false NOT NULL,
	"parent_id" uuid,
	"variant_name" text,
	"created_by" text NOT NULL,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"url" text NOT NULL,
	"pathname" text NOT NULL,
	"name" text NOT NULL,
	"size" integer NOT NULL,
	"mime" text NOT NULL,
	"width" integer,
	"height" integer,
	"default_alt" text,
	"default_caption" text,
	"decorative" boolean DEFAULT false NOT NULL,
	"uploaded_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "slides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deck_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"layout_key" text DEFAULT 'title-paragraph' NOT NULL,
	"blocks" jsonb NOT NULL,
	"library_item_id" uuid,
	"library_version" integer,
	"library_variant_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "taggings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tag_id" uuid NOT NULL,
	"subject_type" "taggable_type" NOT NULL,
	"subject_id" uuid NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "tag_kind" DEFAULT 'tag' NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"color" text,
	"description" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"clerk_user_id" text PRIMARY KEY NOT NULL,
	"role" "user_role" DEFAULT 'editor' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "variables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"group" text NOT NULL,
	"source" text DEFAULT 'computed' NOT NULL,
	"default_value" text,
	"description" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voiceovers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slide_id" uuid NOT NULL,
	"audio_url" text NOT NULL,
	"mime" text NOT NULL,
	"duration_sec" real NOT NULL,
	"cues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_deck_id_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "public"."decks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_slide_id_slides_id_fk" FOREIGN KEY ("slide_id") REFERENCES "public"."slides"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_contacts" ADD CONSTRAINT "company_contacts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decks" ADD CONSTRAINT "decks_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decks" ADD CONSTRAINT "decks_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slides" ADD CONSTRAINT "slides_deck_id_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "public"."decks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slides" ADD CONSTRAINT "slides_library_item_id_library_items_id_fk" FOREIGN KEY ("library_item_id") REFERENCES "public"."library_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taggings" ADD CONSTRAINT "taggings_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voiceovers" ADD CONSTRAINT "voiceovers_slide_id_slides_id_fk" FOREIGN KEY ("slide_id") REFERENCES "public"."slides"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "clients_slug_idx" ON "clients" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "comments_slide_idx" ON "comments" USING btree ("slide_id");--> statement-breakpoint
CREATE INDEX "comments_subject_idx" ON "comments" USING btree ("subject_type","subject_id","created_at");--> statement-breakpoint
CREATE INDEX "company_contacts_client_idx" ON "company_contacts" USING btree ("client_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "decks_client_slug_idx" ON "decks" USING btree ("client_id","slug");--> statement-breakpoint
CREATE INDEX "decks_status_idx" ON "decks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "events_client_idx" ON "events" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "favorites_unique_idx" ON "favorites" USING btree ("user_id","subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "favorites_user_idx" ON "favorites" USING btree ("user_id","subject_type");--> statement-breakpoint
CREATE INDEX "library_items_kind_status_idx" ON "library_items" USING btree ("kind","status");--> statement-breakpoint
CREATE INDEX "library_items_parent_idx" ON "library_items" USING btree ("parent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "media_assets_pathname_idx" ON "media_assets" USING btree ("pathname");--> statement-breakpoint
CREATE INDEX "slides_deck_idx" ON "slides" USING btree ("deck_id","position");--> statement-breakpoint
CREATE INDEX "slides_library_item_idx" ON "slides" USING btree ("library_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "taggings_unique_idx" ON "taggings" USING btree ("tag_id","subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "taggings_subject_idx" ON "taggings" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_kind_slug_idx" ON "tags" USING btree ("kind","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "variables_key_idx" ON "variables" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "voiceovers_slide_idx" ON "voiceovers" USING btree ("slide_id");