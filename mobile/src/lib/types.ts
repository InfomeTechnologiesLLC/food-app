export type Diet = 'none' | 'vegetarian' | 'vegan' | 'pescatarian' | 'keto' | 'halal' | 'kosher';
export type Goal = 'balanced' | 'weight_loss' | 'muscle_gain' | 'budget';
export type Budget = 'low' | 'medium' | 'high';

export interface Preferences {
  diet: Diet;
  allergies: string[];
  goal: Goal;
  budget: Budget;
  heightCm?: number | null;
  weightKg?: number | null;
  weightUpdatedAt?: string | null;
}

export interface User {
  _id: string;
  email: string;
  plan: 'free' | 'plus';
  onboarded: boolean;
  preferences: Preferences;
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
  made: boolean;
  madeAt?: string;
}

/** An ingredient the pantry can't fully cover when marking a meal as made. */
export interface Shortage {
  name: string;
  quantity: number;
  shortage: number;
  incompatibleStock: { name: string; quantity: number; unit: string }[];
  unit: string;
  have: number;
  unitMismatch: boolean;
}

/** draft = generated but not added yet; there's at most one active plan */
export type PlanStatus = 'draft' | 'active';

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
  days: { day: number; meals: Meal[] }[];
  shoppingList: ShoppingItem[];
  readyMeals: number;
  totalMeals: number;
  settingsSnapshot?: { maxExtraItems?: number | null };
}

export interface MealPlanSummary {
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
