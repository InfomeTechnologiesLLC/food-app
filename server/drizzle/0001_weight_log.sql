CREATE TABLE `weight_logs` (
	`id` varchar(24) NOT NULL,
	`user_id` varchar(24) NOT NULL,
	`date` date NOT NULL,
	`weight_kg` double NOT NULL,
	`recorded_at` datetime(3) NOT NULL,
	CONSTRAINT `weight_logs_id` PRIMARY KEY(`id`),
	CONSTRAINT `weight_logs_user_date_unique` UNIQUE(`user_id`,`date`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `target_weight_kg` double;--> statement-breakpoint
ALTER TABLE `weight_logs` ADD CONSTRAINT `fk_weight_logs_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;