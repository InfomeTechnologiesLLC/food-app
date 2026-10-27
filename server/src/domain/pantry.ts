export const PANTRY_CATEGORIES = ["produce", "dairy", "meat", "seafood", "grains", "canned", "frozen", "spices", "beverages", "snacks", "other"] as const;
export type PantryCategory = typeof PANTRY_CATEGORIES[number];
export type StockSource = "groceries" | "receipt" | "manual";
export interface StockInput {
  name: string; quantity: number; unit: string; category: PantryCategory;
  expiryDate: Date | null; source: StockSource;
}
export interface StockBatch {
  _id: string; quantity: number; unit: string;
  expiryDate: Date | null; source: StockSource;
}
export interface IngredientStock {
  _id: string; userId: string; key: string; name: string;
  category: PantryCategory; batches: StockBatch[];
  createdAt?: Date; updatedAt?: Date; __v?: number;
}
