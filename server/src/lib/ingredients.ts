/** Normalizes an ingredient name for matching: lowercase, no punctuation, naive singular. */
export function normalize(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (w.length > 3 && w.endsWith("oes") ? w.slice(0, -2) : w.length > 3 && w.endsWith("ies") ? w.slice(0, -3) + "y" : w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w))
    .join(" ");
}

/** Basics every kitchen is assumed to have; never counted as "missing" or put on a shopping list. */
export const STAPLES = ["salt", "black pepper", "pepper", "cooking oil", "oil", "water", "sugar", "turmeric", "chilli powder", "chili powder", "cumin"];

export const isStaple = (name: string) => STAPLES.some((s) => normalize(s) === normalize(name));

/** In the pantry (by name) or a staple. */
export const isAvailable = (name: string, pantryNames: string[]) =>
  isStaple(name) || pantryNames.some((p) => sameIngredient(p, name));

/** Distinct ingredients across meals that the user would have to buy. */
export function extraIngredients(meals: { ingredients: { name: string }[] }[], pantryNames: string[]) {
  const extras = new Map<string, string>();
  for (const ing of meals.flatMap((m) => m.ingredients)) {
    if (!isAvailable(ing.name, pantryNames)) extras.set(normalize(ing.name), ing.name);
  }
  return [...extras.values()];
}

/** Exact normalized names only: sharing words does not make ingredients interchangeable. */
export function sameIngredient(a: string, b: string) {
  const na = normalize(a);
  const nb = normalize(b);
  return na.length > 0 && na === nb;
}

// Words that reveal an allergen even when the allergen itself isn't named.
const ALLERGEN_TERMS: Record<string, string[]> = {
  peanuts: ["peanut", "groundnut", "peanut butter", "satay"],
  "tree nuts": ["almond", "cashew", "walnut", "pecan", "pistachio", "hazelnut", "macadamia", "brazil nut", "pine nut", "praline", "marzipan"],
  milk: ["milk", "butter", "cheese", "cream", "yogurt", "yoghurt", "ghee", "paneer", "whey", "curd", "khoa", "lassi", "custard"],
  eggs: ["egg", "mayonnaise", "mayo", "meringue", "omelette", "omelet"],
  gluten: ["wheat", "flour", "bread", "pasta", "noodle", "barley", "rye", "semolina", "couscous", "seitan", "roti", "chapati", "naan", "paratha", "maida", "atta", "sooji", "rava", "bun", "tortilla", "cracker", "breadcrumb"],
  soy: ["soy", "soya", "tofu", "tempeh", "edamame", "miso"],
  fish: ["fish", "salmon", "tuna", "cod", "sardine", "anchovy", "mackerel", "tilapia", "trout", "pomfret", "basa", "hilsa"],
  shellfish: ["shrimp", "prawn", "crab", "lobster", "clam", "mussel", "oyster", "scallop", "squid", "octopus"],
  sesame: ["sesame", "tahini", "til"],
};

// Ingredients that look like allergens by name but aren't.
const FALSE_POSITIVES = ["coconut milk", "almond milk", "oat milk", "soy milk", "rice milk", "cream of tartar", "butternut", "peanut free", "nutmeg", "eggplant", "buckwheat", "gluten free"];

/** Returns the allergies (from the user's list) that this text appears to contain. */
export function findAllergens(text: string, allergies: string[]): string[] {
  let hay = ` ${normalize(text)} `;
  for (const fp of FALSE_POSITIVES) hay = hay.replaceAll(` ${normalize(fp)} `, " ");
  return allergies.filter((allergy) => {
    const terms = ALLERGEN_TERMS[allergy] ?? [allergy];
    return terms.some((t) => hay.includes(` ${normalize(t)} `));
  });
}
