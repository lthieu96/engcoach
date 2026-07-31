ALTER TABLE "interviews" DROP CONSTRAINT "interviews_kind_check";--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "kind" text DEFAULT 'sentence' NOT NULL;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "example" text;--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_kind_check" CHECK ("cards"."kind" in ('sentence','vocab'));--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_kind_check" CHECK ("interviews"."kind" in ('system_design','dsa_walkthrough','tech_deep_dive'));