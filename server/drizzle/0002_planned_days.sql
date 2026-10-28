CREATE TABLE `planned_days` (
	`user_id` varchar(24) NOT NULL,
	`kind` enum('meal','workout') NOT NULL,
	`date` date NOT NULL,
	`planned` int NOT NULL,
	CONSTRAINT `planned_days_pk` PRIMARY KEY(`user_id`,`kind`,`date`)
);
--> statement-breakpoint
ALTER TABLE `planned_days` ADD CONSTRAINT `fk_planned_days_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;