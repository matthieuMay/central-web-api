ALTER TABLE "cards" ADD COLUMN "assignees" text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "comments" text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "checklist_items" text DEFAULT '[]' NOT NULL;