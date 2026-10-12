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

export interface PantryItem {
  _id: string;
  name: string;
  quantity: number;
  unit: string;
  category: Category;
  expiryDate?: string | null;
  source: 'groceries' | 'receipt' | 'manual';
}

export type PantryInput = Omit<PantryItem, '_id' | 'source'> & { source?: PantryItem['source'] };

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
  /** `available` = in your pantry now, a basic staple, or ticked as bought on this plan's list */
  ingredients: { name: string; quantity: number; unit: string; fromPantry: boolean; available: boolean }[];
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
  needed: number;
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
  checked: boolean;
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
  shoppingChecked: number;
  maxExtraItems: number | null;
  readyMeals: number;
  totalMeals: number;
}
