CREATE TABLE "interview_turns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"interview_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"idx" integer NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "interview_turns_order" UNIQUE("interview_id","idx"),
	CONSTRAINT "interview_turns_role_check" CHECK ("interview_turns"."role" in ('interviewer','candidate'))
);
--> statement-breakpoint
ALTER TABLE "interview_turns" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "interviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"question" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"evaluation" jsonb,
	"english_report" jsonb,
	"overall_score" integer,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	CONSTRAINT "interviews_kind_check" CHECK ("interviews"."kind" in ('system_design','dsa_walkthrough')),
	CONSTRAINT "interviews_status_check" CHECK ("interviews"."status" in ('active','completed','abandoned'))
);
--> statement-breakpoint
ALTER TABLE "interviews" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "cards" DROP CONSTRAINT "cards_source_check";--> statement-breakpoint
ALTER TABLE "interview_turns" ADD CONSTRAINT "interview_turns_interview_id_interviews_id_fk" FOREIGN KEY ("interview_id") REFERENCES "public"."interviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_turns" ADD CONSTRAINT "interview_turns_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "interviews_user_started_idx" ON "interviews" USING btree ("user_id","started_at");--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_source_check" CHECK ("cards"."source" in ('correction','manual','chat','interview'));--> statement-breakpoint
CREATE POLICY "interview_turns_owner" ON "interview_turns" AS PERMISSIVE FOR ALL TO public USING ((select auth.uid()) = "interview_turns"."user_id") WITH CHECK ((select auth.uid()) = "interview_turns"."user_id");--> statement-breakpoint
CREATE POLICY "interviews_owner" ON "interviews" AS PERMISSIVE FOR ALL TO public USING ((select auth.uid()) = "interviews"."user_id") WITH CHECK ((select auth.uid()) = "interviews"."user_id");