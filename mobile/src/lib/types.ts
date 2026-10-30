import type { TrainingPreferences } from './exercise-types';

export type Diet = 'none' | 'non_vegetarian' | 'vegetarian' | 'eggetarian' | 'vegan' | 'pescatarian' | 'keto' | 'halal' | 'kosher';
export type Goal = 'balanced' | 'weight_loss' | 'muscle_gain';
export type Budget = 'low' | 'medium' | 'high';

export interface Preferences {
  diet: Diet;
  allergies: string[];
  goal: Goal;
  budget: Budget;
  /** Country whose home cooking meal plans follow */
  cuisine?: string | null;
  /** Foods meal plans and the coach avoid where possible */
  dislikes?: string[];
}

export type Sex = 'male' | 'female';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';

export interface BodyMeasurements {
  heightCm?: number | null;
  weightKg?: number | null;
  weightUpdatedAt?: string | null;
  targetWeightKg?: number | null;
  /** Used for the daily calorie, macro and water targets */
  sex?: Sex | null;
  birthYear?: number | null;
  activityLevel?: ActivityLevel | null;
  /** Weeks the user would like to reach the target weight in */
  goalWeeks?: number | null;
}

export interface User {
  _id: string;
  email: string;
  plan: 'free' | 'plus';
  onboarded: boolean;
  preferences: Preferences;
  body: BodyMeasurements;
  training: TrainingPreferences;
  usage: { scansThisMonth: number; plansThisMonth: number; coachThisMonth?: number };
  /** null = unlimited */
  limits: { scansPerMonth: number | null; plansPerMonth: number | null; coachPerMonth?: number | null };
}

export const CATEGORIES = [
  'produce', 'dairy', 'meat', 'seafood', 'grains', 'canned',
  'frozen', 'spices', 'beverages', 'snacks', 'other',
] as const;
export type Category = (typeof CATEGORIES)[number];

export interface PantryBatch {
  _id: string;
  quantity: number;
  unit: string;
  expiryDate: string | null;
  source: 'groceries' | 'receipt' | 'manual';
}
export interface PantryIngredient {
  _id: string;
  key: string;
  name: string;
  category: Category;
  expiryDate: string | null;
  totals: { quantity: number; unit: string }[];
  batches: PantryBatch[];
}
export interface PantryInput {
  name: string;
  quantity: number;
  unit: string;
  category: Category;
  expiryDate: string | null;
  source?: PantryBatch['source'];
}

export type ScanType = 'groceries' | 'receipt';

export interface ScannedItem {
  name: string;
  quantity: number;
  unit: string;
  category: Category;
  estimatedExpiryDays: number | null;
  confidence: 'high' | 'medium' | 'low';
}

export interface ScanResult {
  scanId: string;
  type: ScanType;
  items: ScannedItem[];
}

export const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
export type MealType = (typeof MEAL_TYPES)[number];

export interface Meal {
  _id: string;
  type: MealType;
  title: string;
  description: string;
  prepMinutes: number;
  calories: number;
  /** Estimated grams for one person; ingredient quantities cover one serving. */
  nutrition: { proteinGrams: number; carbsGrams: number; fatGrams: number };
  /** Availability uses current stock; checkmarks alone never count as stock. */
  ingredients: { name: string; quantity: number; unit: string; fromPantry: boolean; available: boolean; have: number; shortage: number; unitMismatch: boolean; incompatibleStock: { quantity: number; unit: string }[] }[];
  steps: string[];
  allergyWarnings: string[];
  missing: string[];
  readyToCook: boolean;
  eaten: boolean;
  historyEntryId: string | null;
}

/** An ingredient the pantry can't fully cover when marking a meal as eaten. */
export interface Shortage {
  name: string;
  quantity: number;
  shortage: number;
  incompatibleStock: { name: string; quantity: number; unit: string }[];
  unit: string;
  have: number;
  unitMismatch: boolean;
}

/** Only the accepted plan is stored. */
export type PlanStatus = 'active';

export interface ShoppingItem {
  _id: string;
  name: string;
  quantity: number;
  unit: string;
}

export interface MealPlan {
  _id: string;
  title: string;
  status: PlanStatus;
  startDate?: string;
  createdAt: string;
  __v: number;
  days: { day: number; date?: string; meals: Meal[] }[];
  shoppingList: ShoppingItem[];
  readyMeals: number;
  totalMeals: number;
  settingsSnapshot?: { maxExtraItems?: number | null };
}

export interface MealPlanSummary {
  __v: number;
  _id: string;
  title: string;
  status: PlanStatus;
  startDate?: string;
  createdAt: string;
  dayCount: number;
  shoppingTotal: number;
  maxExtraItems: number | null;
  readyMeals: number;
  totalMeals: number;
}

export interface NutritionTotals {
  meals: number;
  calories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
}
export interface FoodHistoryEntry {
  _id: string;
  mealId: string;
  sourcePlanId: string;
  sourcePlanTitle: string;
  date: string;
  recordedAt: string;
  meal: Omit<Meal, 'ingredients' | 'missing' | 'readyToCook'> & {
    ingredients: { name: string; quantity: number; unit: string; fromPantry: boolean }[];
  };
}
export interface FoodHistoryPage {
  entries: FoodHistoryEntry[];
  totals: Record<string, NutritionTotals>;
  nextCursor: string | null;
}

/** GET /me/targets (worked out on the server by lib/targets.ts) */
export type DailyTargets = {
  ready: true;
  age: number; bmr: number; tdee: number;
  calories: number; proteinGrams: number; carbsGrams: number; fatGrams: number; waterMl: number;
  /** Calories added or removed by weekly check-ins */
  adjustmentKcal: number;
  direction: 'lose' | 'gain' | 'maintain';
  weeklyRateKg: number;
  timeline: { weeks: number; requestedWeeks: number | null; adjusted: boolean; explanation: string } | null;
  warnings: string[];
  notice: string;
} | {
  ready: false;
  missing: ('sex' | 'birthYear' | 'heightCm' | 'weightKg' | 'activityLevel')[];
  waterMl: number;
  notice: string;
};

/** GET /me/water/:date */
export interface WaterDay {
  date: string;
  totalMl: number;
  goalMl: number;
  entries: { _id: string; amountMl: number; recordedAt: string }[];
}

// ── AI coach (server: routes/coach.ts, routes/food-log.ts) ──

export interface Macros { calories: number; proteinGrams: number; carbsGrams: number; fatGrams: number }

export interface FoodEstimateItem extends Macros { name: string; quantity: number; unit: string }
export interface FoodEstimate {
  title: string;
  items: FoodEstimateItem[];
  totals: Macros;
  confidence: 'high' | 'medium' | 'low';
  note: string;
}

export interface SuggestedMeal {
  type: MealType;
  title: string;
  description: string;
  prepMinutes: number;
  calories: number;
  nutrition: { proteinGrams: number; carbsGrams: number; fatGrams: number };
  ingredients: { name: string; quantity: number; unit: string; fromPantry: boolean }[];
  steps: string[];
  why: string;
}
export interface NextMealResult {
  status: 'suggested' | 'done_for_today' | 'needs_profile';
  message: string;
  mealType: MealType | null;
  aim: Macros | null;
  remaining: Macros | null;
  meal: SuggestedMeal | null;
  toBuy: { name: string; quantity: number; unit: string }[];
}

export type CoachAction =
  | { type: 'meal_suggestion'; result: NextMealResult }
  | { type: 'confirm_food'; estimate: FoodEstimate; mealType: MealType }
  | { type: 'reminder'; date: string; time: string; body: string }
  | { type: 'check_in'; deltaKcal: number; reason: string };

export interface CoachMessage { id: string; role: 'user' | 'coach'; text: string; actions?: CoachAction[]; error?: boolean }

export interface TargetChange { _id: string; date: string; deltaKcal: number; adjustmentAfter: number; reason: string }

export interface CoachToday {
  date: string;
  targets: DailyTargets;
  eaten: Macros;
  remaining: Macros | null;
  water: { drankMl: number; goalMl: number; leftMl: number };
  workout: { title: string | null; rest: boolean; exercises: number; done: boolean } | null;
  missedWorkoutsThisWeek: number;
  checkIn: { deltaKcal: number; reason: string } | null;
}
