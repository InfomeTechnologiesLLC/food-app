import { z } from "zod";
import { gemini, GEMINI_MODEL, withRetry, AIError } from "./gemini.js";
import { PANTRY_CATEGORIES } from "../domain/pantry.js";

export type ScanType = "groceries" | "receipt";

export const scannedItemSchema = z.object({
  name: z.string().describe("Common ingredient name, singular, lowercase, no brand. e.g. 'tomato', 'greek yogurt'"),
  quantity: z.number().describe("Best estimate of how much there is; 1 if unsure"),
  unit: z.string().describe("pcs, g, kg, ml, L, pack, bunch, can, bottle, dozen"),
  category: z.enum(PANTRY_CATEGORIES),
  estimatedExpiryDays: z
    .number()
    .int()
    .nullable()
    .describe("Typical days until this goes bad from today, considering its visible state; null for shelf-stable items"),
  confidence: z.enum(["high", "medium", "low"]).describe("How sure you are this item is present and correctly named"),
});

const scanResultSchema = z.object({
  isRelevant: z.boolean().describe("false if the image shows no food or groceries at all (or, for receipts, is not a grocery receipt)"),
  items: z.array(scannedItemSchema),
});

export type ScannedItem = z.infer<typeof scannedItemSchema>;

const PROMPTS: Record<ScanType, (today: string) => string> = {
  groceries: (today) => `You are a kitchen inventory assistant. Today is ${today}. List every distinct food item in this photo of groceries.
The groceries can be arranged in any way: spread on a counter or table, still in shopping bags or a basket, stacked in a cupboard,
on fridge shelves, in a delivery box, a single item held in hand, or a messy pile. Work with whatever you see.
- Identify packaged products from their labels and packaging, and loose produce by sight. Read brand labels only to work out what the
  product is, then give the generic ingredient name (e.g. "Amul Taaza" -> "milk", "Maggi" -> "instant noodles").
- Count identical items (e.g. 3 cans of chickpeas -> quantity 3, unit "can") and merge duplicates.
- Use the pack size printed on the label when legible (e.g. 500 g, 1 L). Otherwise estimate a sensible quantity and unit.
- If a best-before or expiry date is printed and legible, use it to set estimatedExpiryDays from today. Otherwise estimate the typical
  shelf life of that item as bought fresh today.
- Only include items you can actually see. Do not guess what's inside opaque bags or behind other items.
- Skip non-food items (detergent, toiletries, bags, packaging).
- Mark partly hidden, blurry or ambiguous items as low confidence.`,
  receipt: (today) => `You are a kitchen inventory assistant. Today is ${today}. Read this grocery receipt and list the food items purchased.
- Expand abbreviations into plain ingredient names (e.g. "ORG BNLS CHKN BRST" -> "chicken breast").
- Skip non-food lines: bags, taxes, discounts, totals, household or personal care products.
- Use the quantity and weight printed on the receipt when it is shown.
- Estimate expiry from the purchase date being today.`,
};

const responseJsonSchema = z.toJSONSchema(scanResultSchema);

export async function scanImage(image: Buffer, mimeType: string, type: ScanType): Promise<ScannedItem[]> {
  const response = await withRetry(() =>
    gemini.models.generateContent({
      model: GEMINI_MODEL,
      contents: [
        {
          role: "user",
          parts: [{ inlineData: { mimeType, data: image.toString("base64") } }, { text: PROMPTS[type](new Date().toDateString()) }],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseJsonSchema,
        temperature: 0.2,
      },
    })
  );

  let parsed;
  try {
    parsed = scanResultSchema.safeParse(JSON.parse(response.text ?? ""));
  } catch {
    throw new AIError("The AI returned an unreadable response. Please try again.");
  }
  if (!parsed.success) throw new AIError("The AI returned an unexpected response. Please try again.");
  if (!parsed.data.isRelevant) {
    throw new AIError(
      type === "groceries"
        ? "That doesn't look like a photo of groceries. Try again with the food clearly in view."
        : "That doesn't look like a grocery receipt. Try a clearer, flat photo of the receipt.",
      422
    );
  }
  return parsed.data.items.filter((i) => i.name.trim());
}
