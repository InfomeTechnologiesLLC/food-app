CREATE TABLE `period_checkins` (
	`id` varchar(24) NOT NULL,
	`user_id` varchar(24) NOT NULL,
	`date` date NOT NULL,
	`pain` enum('none','mild','strong') NOT NULL,
	`recorded_at` datetime(3) NOT NULL,
	CONSTRAINT `period_checkins_id` PRIMARY KEY(`id`),
	CONSTRAINT `period_checkins_user_date_unique` UNIQUE(`user_id`,`date`)
);
--> statement-breakpoint
CREATE TABLE `period_logs` (
	`id` varchar(24) NOT NULL,
	`user_id` varchar(24) NOT NULL,
	`start_date` date NOT NULL,
	`end_date` date,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `period_logs_id` PRIMARY KEY(`id`),
	CONSTRAINT `period_logs_user_start_unique` UNIQUE(`user_id`,`start_date`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `period_tracking` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `period_exercise` enum('light','rest') DEFAULT 'light' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `period_comfort_foods` json DEFAULT ('[]') NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `cycle_length` int DEFAULT 28 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `period_length` int DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE `period_checkins` ADD CONSTRAINT `fk_period_checkins_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `period_logs` ADD CONSTRAINT `fk_period_logs_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;