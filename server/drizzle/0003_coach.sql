CREATE TABLE `target_changes` (
	`id` varchar(24) NOT NULL,
	`user_id` varchar(24) NOT NULL,
	`date` date NOT NULL,
	`delta_kcal` int NOT NULL,
	`adjustment_after` int NOT NULL,
	`reason` text NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `target_changes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `water_logs` (
	`id` varchar(24) NOT NULL,
	`user_id` varchar(24) NOT NULL,
	`date` date NOT NULL,
	`amount_ml` int NOT NULL,
	`recorded_at` datetime(3) NOT NULL,
	CONSTRAINT `water_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `sex` enum('male','female');--> statement-breakpoint
ALTER TABLE `users` ADD `birth_year` int;--> statement-breakpoint
ALTER TABLE `users` ADD `activity_level` enum('sedentary','light','moderate','active','very_active');--> statement-breakpoint
ALTER TABLE `users` ADD `goal_weeks` int;--> statement-breakpoint
ALTER TABLE `users` ADD `coach_this_month` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `calorie_adjustment` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `last_check_in` date;--> statement-breakpoint
ALTER TABLE `target_changes` ADD CONSTRAINT `fk_target_changes_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `water_logs` ADD CONSTRAINT `fk_water_logs_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `target_changes_user_date_idx` ON `target_changes` (`user_id`,`date`);--> statement-breakpoint
CREATE INDEX `water_logs_user_date_idx` ON `water_logs` (`user_id`,`date`);