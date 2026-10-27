CREATE TABLE `admin_accounts` (
	`id` varchar(24) NOT NULL,
	`email` varchar(255) NOT NULL,
	`password_hash` varchar(255) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `admin_accounts_id` PRIMARY KEY(`id`),
	CONSTRAINT `admin_accounts_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `admin_sessions` (
	`id` varchar(24) NOT NULL,
	`admin_id` varchar(24) NOT NULL,
	`token_hash` char(64) NOT NULL,
	`expires_at` datetime(3) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `admin_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `admin_sessions_token_unique` UNIQUE(`token_hash`)
);
--> statement-breakpoint
CREATE TABLE `food_history` (
	`id` varchar(24) NOT NULL,
	`user_id` varchar(24) NOT NULL,
	`meal_id` varchar(24) NOT NULL,
	`source_plan_id` varchar(24) NOT NULL,
	`source_plan_title` varchar(200) NOT NULL,
	`date` date NOT NULL,
	`recorded_at` datetime(3) NOT NULL,
	`reversed` boolean NOT NULL DEFAULT false,
	`reversed_at` datetime(3),
	`meal_type` enum('breakfast','lunch','dinner','snack') NOT NULL,
	`meal_title` varchar(200) NOT NULL,
	`meal_description` text NOT NULL,
	`meal_prep_minutes` int NOT NULL,
	`meal_calories` int NOT NULL,
	`meal_protein_grams` double NOT NULL,
	`meal_carbs_grams` double NOT NULL,
	`meal_fat_grams` double NOT NULL,
	`meal_ingredients` json NOT NULL,
	`meal_steps` json NOT NULL,
	`meal_allergy_warnings` json NOT NULL,
	`live_flag` int GENERATED ALWAYS AS ((case when `reversed` = 0 then 1 else null end)) STORED,
	CONSTRAINT `food_history_id` PRIMARY KEY(`id`),
	CONSTRAINT `food_history_one_live_entry_per_meal` UNIQUE(`user_id`,`meal_id`,`live_flag`)
);
--> statement-breakpoint
CREATE TABLE `food_history_consumed` (
	`id` int AUTO_INCREMENT NOT NULL,
	`entry_id` varchar(24) NOT NULL,
	`position` int NOT NULL,
	`ingredient_key` varchar(120) NOT NULL,
	`batch_id` varchar(24) NOT NULL,
	`name` varchar(120) NOT NULL,
	`amount` double NOT NULL,
	`unit` varchar(20) NOT NULL,
	`category` enum('produce','dairy','meat','seafood','grains','canned','frozen','spices','beverages','snacks','other') NOT NULL,
	`expiry_date` datetime(3),
	`source` enum('groceries','receipt','manual') NOT NULL,
	CONSTRAINT `food_history_consumed_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `meal_ingredients` (
	`id` int AUTO_INCREMENT NOT NULL,
	`meal_id` varchar(24) NOT NULL,
	`position` int NOT NULL,
	`name` varchar(120) NOT NULL,
	`quantity` double NOT NULL,
	`unit` varchar(20) NOT NULL,
	`from_pantry` boolean NOT NULL,
	CONSTRAINT `meal_ingredients_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `meal_plan_days` (
	`id` varchar(24) NOT NULL,
	`plan_id` varchar(24) NOT NULL,
	`position` int NOT NULL,
	`day_number` int NOT NULL,
	`date` date,
	CONSTRAINT `meal_plan_days_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `meal_plans` (
	`id` varchar(24) NOT NULL,
	`user_id` varchar(24) NOT NULL,
	`title` varchar(200) NOT NULL,
	`status` enum('active') NOT NULL DEFAULT 'active',
	`start_date` date,
	`settings_diet` varchar(30) NOT NULL,
	`settings_allergies` json NOT NULL,
	`settings_goal` varchar(30) NOT NULL,
	`settings_budget` varchar(20) NOT NULL,
	`settings_height_cm` double,
	`settings_weight_kg` double,
	`settings_weight_updated_at` datetime(3),
	`settings_training_context` json,
	`settings_meal_types` json NOT NULL,
	`settings_max_extra_items` int,
	`version` int NOT NULL DEFAULT 0,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `meal_plans_id` PRIMARY KEY(`id`),
	CONSTRAINT `meal_plans_one_active_per_user` UNIQUE(`user_id`,`status`)
);
--> statement-breakpoint
CREATE TABLE `meals` (
	`id` varchar(24) NOT NULL,
	`plan_id` varchar(24) NOT NULL,
	`day_id` varchar(24) NOT NULL,
	`position` int NOT NULL,
	`type` enum('breakfast','lunch','dinner','snack') NOT NULL,
	`title` varchar(200) NOT NULL,
	`description` text NOT NULL,
	`prep_minutes` int NOT NULL,
	`calories` int NOT NULL,
	`protein_grams` double NOT NULL,
	`carbs_grams` double NOT NULL,
	`fat_grams` double NOT NULL,
	`steps` json NOT NULL,
	`allergy_warnings` json NOT NULL,
	`eaten` boolean NOT NULL DEFAULT false,
	`history_entry_id` varchar(24),
	CONSTRAINT `meals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pantry_batches` (
	`id` varchar(24) NOT NULL,
	`ingredient_id` varchar(24) NOT NULL,
	`quantity` double NOT NULL,
	`unit` varchar(20) NOT NULL,
	`expiry_date` datetime(3),
	`source` enum('groceries','receipt','manual') NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `pantry_batches_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pantry_ingredients` (
	`id` varchar(24) NOT NULL,
	`user_id` varchar(24) NOT NULL,
	`ingredient_key` varchar(120) NOT NULL,
	`name` varchar(120) NOT NULL,
	`category` enum('produce','dairy','meat','seafood','grains','canned','frozen','spices','beverages','snacks','other') NOT NULL,
	`version` int NOT NULL DEFAULT 0,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `pantry_ingredients_id` PRIMARY KEY(`id`),
	CONSTRAINT `pantry_user_key_unique` UNIQUE(`user_id`,`ingredient_key`)
);
--> statement-breakpoint
CREATE TABLE `scans` (
	`id` varchar(24) NOT NULL,
	`user_id` varchar(24) NOT NULL,
	`type` enum('groceries','receipt') NOT NULL,
	`ai_items` json NOT NULL,
	`status` enum('pending_review','confirmed') NOT NULL DEFAULT 'pending_review',
	`confirmed_count` int,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `scans_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `stock_operation_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`operation_id` varchar(24) NOT NULL,
	`position` int NOT NULL,
	`name` varchar(120) NOT NULL,
	`quantity` double NOT NULL,
	`unit` varchar(20) NOT NULL,
	`category` enum('produce','dairy','meat','seafood','grains','canned','frozen','spices','beverages','snacks','other') NOT NULL,
	`expiry_date` datetime(3),
	`source` enum('groceries','receipt','manual') NOT NULL,
	`ingredient_id` varchar(24) NOT NULL,
	`batch_id` varchar(24) NOT NULL,
	CONSTRAINT `stock_operation_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `stock_operations` (
	`id` varchar(24) NOT NULL,
	`user_id` varchar(24) NOT NULL,
	`operation_key` varchar(160) NOT NULL,
	`fingerprint` char(64) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `stock_operations_id` PRIMARY KEY(`id`),
	CONSTRAINT `stock_operations_user_key_unique` UNIQUE(`user_id`,`operation_key`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` varchar(24) NOT NULL,
	`email` varchar(255) NOT NULL,
	`password_hash` varchar(255) NOT NULL,
	`plan` enum('free','plus') NOT NULL DEFAULT 'free',
	`diet` varchar(30) NOT NULL DEFAULT 'none',
	`allergies` json NOT NULL,
	`goal` varchar(30) NOT NULL DEFAULT 'balanced',
	`budget` varchar(20) NOT NULL DEFAULT 'medium',
	`height_cm` double,
	`weight_kg` double,
	`weight_updated_at` datetime(3),
	`training_enabled` boolean NOT NULL DEFAULT false,
	`training_goal` enum('general_fitness','strength','muscle_gain','endurance') NOT NULL DEFAULT 'general_fitness',
	`training_experience` enum('beginner','intermediate') NOT NULL DEFAULT 'beginner',
	`training_equipment` json NOT NULL,
	`training_weekdays` json NOT NULL,
	`training_session_minutes` int NOT NULL DEFAULT 30,
	`training_excluded_exercises` json NOT NULL,
	`usage_period` char(7) NOT NULL,
	`scans_this_month` int NOT NULL DEFAULT 0,
	`plans_this_month` int NOT NULL DEFAULT 0,
	`push_tokens` json NOT NULL,
	`schedule_revision` int NOT NULL DEFAULT 0,
	`onboarded` boolean NOT NULL DEFAULT false,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `workout_plan_days` (
	`id` int AUTO_INCREMENT NOT NULL,
	`plan_id` varchar(24) NOT NULL,
	`position` int NOT NULL,
	`date` date NOT NULL,
	`title` varchar(200),
	`explanation` text,
	CONSTRAINT `workout_plan_days_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `workout_plan_exercises` (
	`id` int AUTO_INCREMENT NOT NULL,
	`day_id` int NOT NULL,
	`position` int NOT NULL,
	`exercise_id` varchar(60) NOT NULL,
	`sets` int,
	`reps_min` int,
	`reps_max` int,
	`duration_seconds` int,
	`rest_seconds` int,
	CONSTRAINT `workout_plan_exercises_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `workout_plans` (
	`id` varchar(24) NOT NULL,
	`user_id` varchar(24) NOT NULL,
	`title` varchar(200),
	`status` enum('draft','active') NOT NULL DEFAULT 'draft',
	`context` json NOT NULL,
	`version` int NOT NULL DEFAULT 0,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`active_flag` int GENERATED ALWAYS AS ((case when `status` = 'active' then 1 else null end)) STORED,
	CONSTRAINT `workout_plans_id` PRIMARY KEY(`id`),
	CONSTRAINT `workout_plans_one_active_per_user` UNIQUE(`user_id`,`active_flag`)
);
--> statement-breakpoint
CREATE TABLE `workout_session_exercises` (
	`id` int AUTO_INCREMENT NOT NULL,
	`session_id` varchar(64) NOT NULL,
	`position` int NOT NULL,
	`exercise_id` varchar(60),
	`rest_seconds` int,
	`definition` json NOT NULL,
	CONSTRAINT `workout_session_exercises_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `workout_session_sets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`exercise_row_id` int NOT NULL,
	`position` int NOT NULL,
	`reps` int,
	`weight_kg` double,
	`duration_seconds` int,
	`distance_km` double,
	`status` varchar(12),
	CONSTRAINT `workout_session_sets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `workout_sessions` (
	`id` varchar(64) NOT NULL,
	`user_id` varchar(24) NOT NULL,
	`revision` int NOT NULL,
	`operation_id` varchar(64) NOT NULL,
	`plan_id` varchar(24),
	`scheduled_date` date,
	`date` date NOT NULL,
	`timezone` varchar(64),
	`title` varchar(200),
	`started_at` datetime(3),
	`finished_at` datetime(3),
	`status` enum('in_progress','finished'),
	`notes` text,
	`feedback` varchar(10),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `workout_sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `admin_sessions` ADD CONSTRAINT `fk_admin_sessions_admin` FOREIGN KEY (`admin_id`) REFERENCES `admin_accounts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `food_history` ADD CONSTRAINT `fk_food_history_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `food_history_consumed` ADD CONSTRAINT `fk_food_history_consumed_entry` FOREIGN KEY (`entry_id`) REFERENCES `food_history`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `meal_ingredients` ADD CONSTRAINT `fk_meal_ingredients_meal` FOREIGN KEY (`meal_id`) REFERENCES `meals`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `meal_plan_days` ADD CONSTRAINT `fk_meal_plan_days_plan` FOREIGN KEY (`plan_id`) REFERENCES `meal_plans`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `meal_plans` ADD CONSTRAINT `fk_meal_plans_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `meals` ADD CONSTRAINT `fk_meals_plan` FOREIGN KEY (`plan_id`) REFERENCES `meal_plans`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `meals` ADD CONSTRAINT `fk_meals_day` FOREIGN KEY (`day_id`) REFERENCES `meal_plan_days`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pantry_batches` ADD CONSTRAINT `fk_pantry_batches_ingredient` FOREIGN KEY (`ingredient_id`) REFERENCES `pantry_ingredients`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pantry_ingredients` ADD CONSTRAINT `fk_pantry_ingredients_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `scans` ADD CONSTRAINT `fk_scans_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_operation_items` ADD CONSTRAINT `fk_stock_operation_items_operation` FOREIGN KEY (`operation_id`) REFERENCES `stock_operations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_operations` ADD CONSTRAINT `fk_stock_operations_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workout_plan_days` ADD CONSTRAINT `fk_workout_plan_days_plan` FOREIGN KEY (`plan_id`) REFERENCES `workout_plans`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workout_plan_exercises` ADD CONSTRAINT `fk_workout_plan_exercises_day` FOREIGN KEY (`day_id`) REFERENCES `workout_plan_days`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workout_plans` ADD CONSTRAINT `fk_workout_plans_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workout_session_exercises` ADD CONSTRAINT `fk_workout_session_exercises_session` FOREIGN KEY (`session_id`) REFERENCES `workout_sessions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workout_session_sets` ADD CONSTRAINT `fk_workout_session_sets_exercise` FOREIGN KEY (`exercise_row_id`) REFERENCES `workout_session_exercises`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workout_sessions` ADD CONSTRAINT `fk_workout_sessions_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `admin_sessions_expires_idx` ON `admin_sessions` (`expires_at`);--> statement-breakpoint
CREATE INDEX `food_history_user_date_idx` ON `food_history` (`user_id`,`reversed`,`date`,`id`);--> statement-breakpoint
CREATE INDEX `food_history_consumed_entry_idx` ON `food_history_consumed` (`entry_id`);--> statement-breakpoint
CREATE INDEX `meal_ingredients_meal_idx` ON `meal_ingredients` (`meal_id`);--> statement-breakpoint
CREATE INDEX `meal_plan_days_plan_idx` ON `meal_plan_days` (`plan_id`);--> statement-breakpoint
CREATE INDEX `meals_plan_idx` ON `meals` (`plan_id`);--> statement-breakpoint
CREATE INDEX `pantry_batches_ingredient_idx` ON `pantry_batches` (`ingredient_id`);--> statement-breakpoint
CREATE INDEX `scans_user_idx` ON `scans` (`user_id`);--> statement-breakpoint
CREATE INDEX `stock_operation_items_operation_idx` ON `stock_operation_items` (`operation_id`);--> statement-breakpoint
CREATE INDEX `workout_plan_days_plan_idx` ON `workout_plan_days` (`plan_id`);--> statement-breakpoint
CREATE INDEX `workout_plan_exercises_day_idx` ON `workout_plan_exercises` (`day_id`);--> statement-breakpoint
CREATE INDEX `workout_plans_user_idx` ON `workout_plans` (`user_id`);--> statement-breakpoint
CREATE INDEX `workout_session_exercises_session_idx` ON `workout_session_exercises` (`session_id`);--> statement-breakpoint
CREATE INDEX `workout_session_sets_exercise_idx` ON `workout_session_sets` (`exercise_row_id`);--> statement-breakpoint
CREATE INDEX `workout_sessions_user_date_idx` ON `workout_sessions` (`user_id`,`date`,`id`);