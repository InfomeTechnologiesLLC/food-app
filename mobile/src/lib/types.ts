import type { TrainingPreferences } from './exercise-types';

export type Diet = 'none' | 'vegetarian' | 'vegan' | 'pescatarian' | 'keto' | 'halal' | 'kosher';
export type Goal = 'balanced' | 'weight_loss' | 'muscle_gain';
export type Budget = 'low' | 'medium' | 'high';

export interface Preferences {
  diet: Diet;
  allergies: string[];
  goal: Goal;
  budget: Budget;
}

export interface BodyMeasurements {
  heightCm?: number | null;
  weightKg?: number | null;
  weightUpdatedAt?: string | null;
  targetWeightKg?: number | null;
}

export interface User {
  _id: string;
  email: string;
  plan: 'free' | 'plus';
  onboarded: boolean;
  preferences: Preferences;
  body: BodyMeasurements;
  training: TrainingPreferences;
  usage: { scansThisMonth: number; plansThisMonth: number };
  /** null = unlimited */
  limits: { scansPerMonth: number | null; plansPerMonth: number | null };
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
