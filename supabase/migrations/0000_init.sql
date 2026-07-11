CREATE TABLE "cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"front" text NOT NULL,
	"back" text NOT NULL,
	"source" text NOT NULL,
	"correction_id" uuid,
	"rule_tag" text,
	"seen_count" integer DEFAULT 1 NOT NULL,
	"fsrs" jsonb NOT NULL,
	"due" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cards_source_check" CHECK ("cards"."source" in ('correction','manual','chat'))
);
--> statement-breakpoint
ALTER TABLE "cards" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "chat_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"scenario" text,
	"messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"report" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "corrections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"span_start" integer NOT NULL,
	"span_end" integer NOT NULL,
	"original" text NOT NULL,
	"replacement" text NOT NULL,
	"category" text NOT NULL,
	"rule_tag" text NOT NULL,
	"severity" text DEFAULT 'error' NOT NULL,
	"explanation" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "corrections_category_check" CHECK ("corrections"."category" in ('grammar','clarity','tone')),
	CONSTRAINT "corrections_severity_check" CHECK ("corrections"."severity" in ('error','suggestion')),
	CONSTRAINT "corrections_status_check" CHECK ("corrections"."status" in ('pending','accepted','dismissed'))
);
--> statement-breakpoint
ALTER TABLE "corrections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text,
	"context" text,
	"mode" text DEFAULT 'compose',
	"original_text" text NOT NULL,
	"natural_rewrite" text,
	"overall_comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "documents_context_check" CHECK ("documents"."context" in ('email','slack','pr_description','pr_comment')),
	CONSTRAINT "documents_mode_check" CHECK ("documents"."mode" in ('compose','translate','paste'))
);
--> statement-breakpoint
ALTER TABLE "documents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"settings" jsonb DEFAULT '{"theme":"system","llm_provider":"google","daily_limit":1500}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "review_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"card_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	"reviewed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "review_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_correction_id_corrections_id_fk" FOREIGN KEY ("correction_id") REFERENCES "public"."corrections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corrections" ADD CONSTRAINT "corrections_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corrections" ADD CONSTRAINT "corrections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_id_users_id_fk" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_logs" ADD CONSTRAINT "review_logs_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_logs" ADD CONSTRAINT "review_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cards_user_due_idx" ON "cards" USING btree ("user_id","due");--> statement-breakpoint
CREATE INDEX "corrections_user_tag_idx" ON "corrections" USING btree ("user_id","rule_tag","created_at");--> statement-breakpoint
CREATE INDEX "review_logs_reviewed_idx" ON "review_logs" USING btree ("reviewed_at");--> statement-breakpoint
CREATE POLICY "cards_owner" ON "cards" AS PERMISSIVE FOR ALL TO public USING ((select auth.uid()) = "cards"."user_id") WITH CHECK ((select auth.uid()) = "cards"."user_id");--> statement-breakpoint
CREATE POLICY "chat_sessions_owner" ON "chat_sessions" AS PERMISSIVE FOR ALL TO public USING ((select auth.uid()) = "chat_sessions"."user_id") WITH CHECK ((select auth.uid()) = "chat_sessions"."user_id");--> statement-breakpoint
CREATE POLICY "corrections_owner" ON "corrections" AS PERMISSIVE FOR ALL TO public USING ((select auth.uid()) = "corrections"."user_id") WITH CHECK ((select auth.uid()) = "corrections"."user_id");--> statement-breakpoint
CREATE POLICY "documents_owner" ON "documents" AS PERMISSIVE FOR ALL TO public USING ((select auth.uid()) = "documents"."user_id") WITH CHECK ((select auth.uid()) = "documents"."user_id");--> statement-breakpoint
CREATE POLICY "profiles_owner" ON "profiles" AS PERMISSIVE FOR ALL TO public USING ((select auth.uid()) = "profiles"."id") WITH CHECK ((select auth.uid()) = "profiles"."id");--> statement-breakpoint
CREATE POLICY "review_logs_owner" ON "review_logs" AS PERMISSIVE FOR ALL TO public USING ((select auth.uid()) = "review_logs"."user_id") WITH CHECK ((select auth.uid()) = "review_logs"."user_id");