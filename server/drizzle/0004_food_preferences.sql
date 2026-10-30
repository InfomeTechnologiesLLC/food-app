ALTER TABLE `users` ADD `cuisine` varchar(60);--> statement-breakpoint
ALTER TABLE `users` ADD `disliked_foods` json DEFAULT ('[]') NOT NULL;