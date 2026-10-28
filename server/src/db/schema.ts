/**
 * MealMind MySQL schema (Drizzle ORM).
 *
 * Every former MongoDB collection is a table. Every embedded list of objects
 * (pantry batches, plan days, meals, meal ingredients, workout days, ...) is its
 * own child table linked with a foreign key and ON DELETE CASCADE, so deleting a
 * parent row also deletes its children.
 *
 * Simple lists of plain strings/numbers (allergies, cooking steps, weekdays, ...)
 * are stored in JSON columns. They are always read and written as a whole and
 * never searched, so separate tables would add joins without any benefit.
 *
 * Column names are snake_case in MySQL; the TypeScript property names are camelCase.
 * Primary keys of rows that the app/API refers to are 24-character hex strings
 * (the same format the app used with MongoDB), so existing mobile clients keep working.
 *
 * After changing this file run `npm run db:generate` (writes a new SQL file in
 * drizzle/) and then `npm run db:migrate`.
 */
import { sql } from "drizzle-orm";
import {
  mysqlTable, varchar, char, int, double, boolean, text, datetime, date, mysqlEnum,
  index, uniqueIndex, foreignKey, customType,
} from "drizzle-orm/mysql-core";
import { PANTRY_CATEGORIES } from "../domain/pantry.js";

/** JSON column that also works on MariaDB, where JSON is returned as a string. */
const json = <T>(name: string) => customType<{ data: T; driverData: string }>({
  dataType: () => "json",
  toDriver: (value) => JSON.stringify(value),
  fromDriver: (value) => (typeof value === "string" ? JSON.parse(value) : value) as T,
})(name);

const id = (name = "id") => varchar(name, { length: 24 });
/** Millisecond-precision UTC timestamps. */
const timestamp = (name: string) => datetime(name, { mode: "date", fsp: 3 });
const createdAt = () => timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP(3)`).$defaultFn(() => new Date());
const updatedAt = () => timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP(3)`).$defaultFn(() => new Date()).$onUpdateFn(() => new Date());
/** A calendar day such as 2026-10-22, returned as a string. */
const day = (name: string) => date(name, { mode: "string" });

const SOURCES = ["groceries", "receipt", "manual"] as const;
const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"] as const;
const TRAINING_GOALS = ["general_fitness", "strength", "muscle_gain", "endurance"] as const;

// ───────────────────────────── Accounts ─────────────────────────────

export const users = mysqlTable("users", {
  id: id().primaryKey(),
  email: varchar("email", { length: 255 }).notNull(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  plan: mysqlEnum("plan", ["free", "plus"]).notNull().default("free"),
  // preferences
  diet: varchar("diet", { length: 30 }).notNull().default("none"),
  allergies: json<string[]>("allergies").notNull().$defaultFn(() => []),
  goal: varchar("goal", { length: 30 }).notNull().default("balanced"),
  budget: varchar("budget", { length: 20 }).notNull().default("medium"),
  // body
  heightCm: double("height_cm"),
  weightKg: double("weight_kg"),
  weightUpdatedAt: timestamp("weight_updated_at"),
  targetWeightKg: double("target_weight_kg"),
  // training
  trainingEnabled: boolean("training_enabled").notNull().default(false),
  trainingGoal: mysqlEnum("training_goal", TRAINING_GOALS).notNull().default("general_fitness"),
  trainingExperience: mysqlEnum("training_experience", ["beginner", "intermediate"]).notNull().default("beginner"),
  trainingEquipment: json<string[]>("training_equipment").notNull().$defaultFn(() => []),
  trainingWeekdays: json<number[]>("training_weekdays").notNull().$defaultFn(() => [1, 3, 5]),
  trainingSessionMinutes: int("training_session_minutes").notNull().default(30),
  trainingExcludedExercises: json<string[]>("training_excluded_exercises").notNull().$defaultFn(() => []),
  // monthly usage counters
  usagePeriod: char("usage_period", { length: 7 }).notNull().$defaultFn(() => new Date().toISOString().slice(0, 7)),
  scansThisMonth: int("scans_this_month").notNull().default(0),
  plansThisMonth: int("plans_this_month").notNull().default(0),
  pushTokens: json<string[]>("push_tokens").notNull().$defaultFn(() => []),
  scheduleRevision: int("schedule_revision").notNull().default(0),
  onboarded: boolean("onboarded").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex("users_email_unique").on(t.email)]);

export const adminAccounts = mysqlTable("admin_accounts", {
  id: id().primaryKey(),
  email: varchar("email", { length: 255 }).notNull(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex("admin_accounts_email_unique").on(t.email)]);

export const adminSessions = mysqlTable("admin_sessions", {
  id: id().primaryKey(),
  adminId: id("admin_id").notNull(),
  tokenHash: char("token_hash", { length: 64 }).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  foreignKey({ name: "fk_admin_sessions_admin", columns: [t.adminId], foreignColumns: [adminAccounts.id] }).onDelete("cascade"),
  uniqueIndex("admin_sessions_token_unique").on(t.tokenHash),
  index("admin_sessions_expires_idx").on(t.expiresAt),
]);

// ───────────────────────────── Pantry ─────────────────────────────

/** One row per distinct ingredient a user has in stock (e.g. "rice"). */
export const pantryIngredients = mysqlTable("pantry_ingredients", {
  id: id().primaryKey(),
  userId: id("user_id").notNull(),
  key: varchar("ingredient_key", { length: 120 }).notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  category: mysqlEnum("category", PANTRY_CATEGORIES).notNull(),
  version: int("version").notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  foreignKey({ name: "fk_pantry_ingredients_user", columns: [t.userId], foreignColumns: [users.id] }).onDelete("cascade"),
  uniqueIndex("pantry_user_key_unique").on(t.userId, t.key),
]);

/** Each purchase of an ingredient, with its own quantity and expiry date. */
export const pantryBatches = mysqlTable("pantry_batches", {
  id: id().primaryKey(),
  ingredientId: id("ingredient_id").notNull(),
  quantity: double("quantity").notNull(),
  unit: varchar("unit", { length: 20 }).notNull(),
  expiryDate: timestamp("expiry_date"),
  source: mysqlEnum("source", SOURCES).notNull(),
  createdAt: createdAt(),
}, (t) => [
  foreignKey({ name: "fk_pantry_batches_ingredient", columns: [t.ingredientId], foreignColumns: [pantryIngredients.id] }).onDelete("cascade"),
  index("pantry_batches_ingredient_idx").on(t.ingredientId),
]);

/** Receipt of one "add stock" action so a retried request never adds stock twice. */
export const stockOperations = mysqlTable("stock_operations", {
  id: id().primaryKey(),
  userId: id("user_id").notNull(),
  key: varchar("operation_key", { length: 160 }).notNull(),
  fingerprint: char("fingerprint", { length: 64 }).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  foreignKey({ name: "fk_stock_operations_user", columns: [t.userId], foreignColumns: [users.id] }).onDelete("cascade"),
  uniqueIndex("stock_operations_user_key_unique").on(t.userId, t.key),
]);

/** The items of a stock operation and the pantry batch each one created. */
export const stockOperationItems = mysqlTable("stock_operation_items", {
  id: int("id").autoincrement().primaryKey(),
  operationId: id("operation_id").notNull(),
  position: int("position").notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  quantity: double("quantity").notNull(),
  unit: varchar("unit", { length: 20 }).notNull(),
  category: mysqlEnum("category", PANTRY_CATEGORIES).notNull(),
  expiryDate: timestamp("expiry_date"),
  source: mysqlEnum("source", SOURCES).notNull(),
  // No foreign keys here: the batch may later be used up and deleted, the receipt stays.
  ingredientId: id("ingredient_id").notNull(),
  batchId: id("batch_id").notNull(),
}, (t) => [
  foreignKey({ name: "fk_stock_operation_items_operation", columns: [t.operationId], foreignColumns: [stockOperations.id] }).onDelete("cascade"),
  index("stock_operation_items_operation_idx").on(t.operationId),
]);

export const scans = mysqlTable("scans", {
  id: id().primaryKey(),
  userId: id("user_id").notNull(),
  type: mysqlEnum("type", ["groceries", "receipt"]).notNull(),
  /** Raw AI output, kept for debugging. */
  aiItems: json<unknown>("ai_items").notNull().$defaultFn(() => []),
  status: mysqlEnum("status", ["pending_review", "confirmed"]).notNull().default("pending_review"),
  confirmedCount: int("confirmed_count"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  foreignKey({ name: "fk_scans_user", columns: [t.userId], foreignColumns: [users.id] }).onDelete("cascade"),
  index("scans_user_idx").on(t.userId),
]);

// ───────────────────────────── Meal plans ─────────────────────────────

/** A user's accepted meal plan. A user has at most one (status is always 'active'). */
export const mealPlans = mysqlTable("meal_plans", {
  id: id().primaryKey(),
  userId: id("user_id").notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  status: mysqlEnum("status", ["active"]).notNull().default("active"),
  startDate: day("start_date"),
  // Copy of the user's settings when the plan was generated
  settingsDiet: varchar("settings_diet", { length: 30 }).notNull(),
  settingsAllergies: json<string[]>("settings_allergies").notNull(),
  settingsGoal: varchar("settings_goal", { length: 30 }).notNull(),
  settingsBudget: varchar("settings_budget", { length: 20 }).notNull(),
  settingsHeightCm: double("settings_height_cm"),
  settingsWeightKg: double("settings_weight_kg"),
  settingsWeightUpdatedAt: timestamp("settings_weight_updated_at"),
  settingsTrainingContext: json<unknown>("settings_training_context"),
  settingsMealTypes: json<string[]>("settings_meal_types").notNull(),
  settingsMaxExtraItems: int("settings_max_extra_items"),
  /** Optimistic-concurrency revision (exposed to the app as __v). */
  version: int("version").notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  foreignKey({ name: "fk_meal_plans_user", columns: [t.userId], foreignColumns: [users.id] }).onDelete("cascade"),
  uniqueIndex("meal_plans_one_active_per_user").on(t.userId, t.status),
]);

export const mealPlanDays = mysqlTable("meal_plan_days", {
  id: id().primaryKey(),
  planId: id("plan_id").notNull(),
  position: int("position").notNull(),
  dayNumber: int("day_number").notNull(),
  date: day("date"),
}, (t) => [
  foreignKey({ name: "fk_meal_plan_days_plan", columns: [t.planId], foreignColumns: [mealPlans.id] }).onDelete("cascade"),
  index("meal_plan_days_plan_idx").on(t.planId),
]);

export const meals = mysqlTable("meals", {
  id: id().primaryKey(),
  planId: id("plan_id").notNull(),
  dayId: id("day_id").notNull(),
  position: int("position").notNull(),
  type: mysqlEnum("type", MEAL_TYPES).notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  description: text("description").notNull(),
  prepMinutes: int("prep_minutes").notNull(),
  calories: int("calories").notNull(),
  proteinGrams: double("protein_grams").notNull(),
  carbsGrams: double("carbs_grams").notNull(),
  fatGrams: double("fat_grams").notNull(),
  steps: json<string[]>("steps").notNull(),
  allergyWarnings: json<string[]>("allergy_warnings").notNull(),
  eaten: boolean("eaten").notNull().default(false),
  historyEntryId: id("history_entry_id"),
}, (t) => [
  foreignKey({ name: "fk_meals_plan", columns: [t.planId], foreignColumns: [mealPlans.id] }).onDelete("cascade"),
  foreignKey({ name: "fk_meals_day", columns: [t.dayId], foreignColumns: [mealPlanDays.id] }).onDelete("cascade"),
  index("meals_plan_idx").on(t.planId),
]);

export const mealIngredients = mysqlTable("meal_ingredients", {
  id: int("id").autoincrement().primaryKey(),
  mealId: id("meal_id").notNull(),
  position: int("position").notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  quantity: double("quantity").notNull(),
  unit: varchar("unit", { length: 20 }).notNull(),
  fromPantry: boolean("from_pantry").notNull(),
}, (t) => [
  foreignKey({ name: "fk_meal_ingredients_meal", columns: [t.mealId], foreignColumns: [meals.id] }).onDelete("cascade"),
  index("meal_ingredients_meal_idx").on(t.mealId),
]);

// ───────────────────────────── Food history ─────────────────────────────

/** A meal the user ate. Keeps a copy of the meal so it survives plan deletion. */
export const foodHistory = mysqlTable("food_history", {
  id: id().primaryKey(),
  userId: id("user_id").notNull(),
  mealId: id("meal_id").notNull(),
  sourcePlanId: id("source_plan_id").notNull(),
  sourcePlanTitle: varchar("source_plan_title", { length: 200 }).notNull(),
  date: day("date").notNull(),
  recordedAt: timestamp("recorded_at").notNull(),
  reversed: boolean("reversed").notNull().default(false),
  reversedAt: timestamp("reversed_at"),
  // Copy of the meal as it was eaten
  mealType: mysqlEnum("meal_type", MEAL_TYPES).notNull(),
  mealTitle: varchar("meal_title", { length: 200 }).notNull(),
  mealDescription: text("meal_description").notNull(),
  mealPrepMinutes: int("meal_prep_minutes").notNull(),
  mealCalories: int("meal_calories").notNull(),
  mealProteinGrams: double("meal_protein_grams").notNull(),
  mealCarbsGrams: double("meal_carbs_grams").notNull(),
  mealFatGrams: double("meal_fat_grams").notNull(),
  mealIngredients: json<{ name: string; quantity: number; unit: string; fromPantry: boolean }[]>("meal_ingredients").notNull(),
  mealSteps: json<string[]>("meal_steps").notNull(),
  mealAllergyWarnings: json<string[]>("meal_allergy_warnings").notNull(),
  /** 1 while the entry is not undone, otherwise NULL. Makes "one live entry per meal" a unique index. */
  liveFlag: int("live_flag").generatedAlwaysAs(sql`(case when \`reversed\` = 0 then 1 else null end)`, { mode: "stored" }),
}, (t) => [
  foreignKey({ name: "fk_food_history_user", columns: [t.userId], foreignColumns: [users.id] }).onDelete("cascade"),
  uniqueIndex("food_history_one_live_entry_per_meal").on(t.userId, t.mealId, t.liveFlag),
  index("food_history_user_date_idx").on(t.userId, t.reversed, t.date, t.id),
]);

/** Exactly what eating a meal took from the pantry, so undo can put it back. */
export const foodHistoryConsumed = mysqlTable("food_history_consumed", {
  id: int("id").autoincrement().primaryKey(),
  entryId: id("entry_id").notNull(),
  position: int("position").notNull(),
  ingredientKey: varchar("ingredient_key", { length: 120 }).notNull(),
  batchId: id("batch_id").notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  amount: double("amount").notNull(),
  unit: varchar("unit", { length: 20 }).notNull(),
  category: mysqlEnum("category", PANTRY_CATEGORIES).notNull(),
  expiryDate: timestamp("expiry_date"),
  source: mysqlEnum("source", SOURCES).notNull(),
}, (t) => [
  foreignKey({ name: "fk_food_history_consumed_entry", columns: [t.entryId], foreignColumns: [foodHistory.id] }).onDelete("cascade"),
  index("food_history_consumed_entry_idx").on(t.entryId),
]);

// ───────────────────────────── Exercise ─────────────────────────────

export const workoutPlans = mysqlTable("workout_plans", {
  id: id().primaryKey(),
  userId: id("user_id").notNull(),
  title: varchar("title", { length: 200 }),
  status: mysqlEnum("status", ["draft", "active"]).notNull().default("draft"),
  /** The profile the plan was generated from (used to re-validate edits). */
  context: json<unknown>("context").notNull(),
  version: int("version").notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  /** 1 for the active plan, otherwise NULL. Makes "one active plan per user" a unique index. */
  activeFlag: int("active_flag").generatedAlwaysAs(sql`(case when \`status\` = 'active' then 1 else null end)`, { mode: "stored" }),
}, (t) => [
  foreignKey({ name: "fk_workout_plans_user", columns: [t.userId], foreignColumns: [users.id] }).onDelete("cascade"),
  uniqueIndex("workout_plans_one_active_per_user").on(t.userId, t.activeFlag),
  index("workout_plans_user_idx").on(t.userId),
]);

export const workoutPlanDays = mysqlTable("workout_plan_days", {
  id: int("id").autoincrement().primaryKey(),
  planId: id("plan_id").notNull(),
  position: int("position").notNull(),
  date: day("date").notNull(),
  title: varchar("title", { length: 200 }),
  explanation: text("explanation"),
}, (t) => [
  foreignKey({ name: "fk_workout_plan_days_plan", columns: [t.planId], foreignColumns: [workoutPlans.id] }).onDelete("cascade"),
  index("workout_plan_days_plan_idx").on(t.planId),
]);

export const workoutPlanExercises = mysqlTable("workout_plan_exercises", {
  id: int("id").autoincrement().primaryKey(),
  dayId: int("day_id").notNull(),
  position: int("position").notNull(),
  exerciseId: varchar("exercise_id", { length: 60 }).notNull(),
  sets: int("sets"),
  repsMin: int("reps_min"),
  repsMax: int("reps_max"),
  durationSeconds: int("duration_seconds"),
  restSeconds: int("rest_seconds"),
}, (t) => [
  foreignKey({ name: "fk_workout_plan_exercises_day", columns: [t.dayId], foreignColumns: [workoutPlanDays.id] }).onDelete("cascade"),
  index("workout_plan_exercises_day_idx").on(t.dayId),
]);

/** One weigh-in per user per calendar day; logging the same day again replaces it. */
export const weightLogs = mysqlTable("weight_logs", {
  id: id().primaryKey(),
  userId: id("user_id").notNull(),
  date: day("date").notNull(),
  weightKg: double("weight_kg").notNull(),
  recordedAt: timestamp("recorded_at").notNull().$defaultFn(() => new Date()),
}, (t) => [
  foreignKey({ name: "fk_weight_logs_user", columns: [t.userId], foreignColumns: [users.id] }).onDelete("cascade"),
  uniqueIndex("weight_logs_user_date_unique").on(t.userId, t.date),
]);

/** A logged workout. The id is a UUID generated by the mobile app. */
export const workoutSessions = mysqlTable("workout_sessions", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: id("user_id").notNull(),
  revision: int("revision").notNull(),
  operationId: varchar("operation_id", { length: 64 }).notNull(),
  planId: varchar("plan_id", { length: 24 }),
  scheduledDate: day("scheduled_date"),
  date: day("date").notNull(),
  timezone: varchar("timezone", { length: 64 }),
  title: varchar("title", { length: 200 }),
  startedAt: timestamp("started_at"),
  finishedAt: timestamp("finished_at"),
  status: mysqlEnum("status", ["in_progress", "finished"]),
  notes: text("notes"),
  feedback: varchar("feedback", { length: 10 }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  foreignKey({ name: "fk_workout_sessions_user", columns: [t.userId], foreignColumns: [users.id] }).onDelete("cascade"),
  index("workout_sessions_user_date_idx").on(t.userId, t.date, t.id),
]);

export const workoutSessionExercises = mysqlTable("workout_session_exercises", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: varchar("session_id", { length: 64 }).notNull(),
  position: int("position").notNull(),
  exerciseId: varchar("exercise_id", { length: 60 }),
  restSeconds: int("rest_seconds"),
  /** Copy of the exercise library entry at the time of the workout. */
  definition: json<unknown>("definition").notNull(),
}, (t) => [
  foreignKey({ name: "fk_workout_session_exercises_session", columns: [t.sessionId], foreignColumns: [workoutSessions.id] }).onDelete("cascade"),
  index("workout_session_exercises_session_idx").on(t.sessionId),
]);

export const workoutSessionSets = mysqlTable("workout_session_sets", {
  id: int("id").autoincrement().primaryKey(),
  exerciseRowId: int("exercise_row_id").notNull(),
  position: int("position").notNull(),
  reps: int("reps"),
  weightKg: double("weight_kg"),
  durationSeconds: int("duration_seconds"),
  distanceKm: double("distance_km"),
  status: varchar("status", { length: 12 }),
}, (t) => [
  foreignKey({ name: "fk_workout_session_sets_exercise", columns: [t.exerciseRowId], foreignColumns: [workoutSessionExercises.id] }).onDelete("cascade"),
  index("workout_session_sets_exercise_idx").on(t.exerciseRowId),
]);
