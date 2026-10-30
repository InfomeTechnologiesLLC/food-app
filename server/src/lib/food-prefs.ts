import { findAllergens } from "./ingredients.js";

/** Diet choices. "none" means no restriction. */
export const DIETS = ["none", "non_vegetarian", "vegetarian", "eggetarian", "vegan", "pescatarian", "keto", "halal", "kosher"] as const;

const DIET_TEXT: Record<string, string> = {
  none: "no restriction",
  non_vegetarian: "non-vegetarian: chicken, mutton, fish and eggs are welcome alongside vegetarian dishes",
  vegetarian: "vegetarian: no meat, fish or eggs",
  eggetarian: "vegetarian plus eggs: no meat or fish",
  vegan: "vegan: no animal products at all",
};
export const dietText = (diet: string) => DIET_TEXT[diet] ?? diet;

/** Lines for an AI prompt describing the user's food preferences (user values are quoted as data). */
export function preferenceLines(p: { diet: string; cuisine?: string | null; dislikes?: string[] }) {
  return [
    `- Diet: ${dietText(p.diet)}`,
    p.cuisine ? `- Cuisine: everyday home cooking from "${p.cuisine}" (use dishes and ingredients common there)` : null,
    p.dislikes?.length ? `- Foods the user does not like (avoid them wherever possible): ${p.dislikes.map((d) => `"${d}"`).join(", ")}` : null,
  ].filter(Boolean).join("\n");
}

/** Disliked foods that appear in a meal's title or ingredients. Uses the same matching as allergies. */
export const dislikesIn = (text: string, dislikes: string[] = []) => findAllergens(text, dislikes);
