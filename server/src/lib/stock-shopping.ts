import type { Types } from "mongoose";
import { PantryItem } from "../models/PantryItem.js";

/** Use the shopping row ID so concurrent requests and retries add this purchase once. */
export async function stockShoppingItem(userId: string, item: {
  _id: Types.ObjectId; name?: string | null; quantity?: number | null; unit?: string | null;
}) {
  await PantryItem.updateOne(
    { _id: item._id, userId },
    { $setOnInsert: {
      userId, name: item.name, quantity: item.quantity ?? 0,
      unit: item.unit ?? "pcs", source: "groceries",
    } },
    { upsert: true }
  );
}
