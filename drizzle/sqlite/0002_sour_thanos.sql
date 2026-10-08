ALTER TABLE `cards` ADD `assignees` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `cards` ADD `comments` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `cards` ADD `checklist_items` text DEFAULT '[]' NOT NULL;