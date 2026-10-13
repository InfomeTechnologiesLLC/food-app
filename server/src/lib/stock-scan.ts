import mongoose from "mongoose";
import { Scan } from "../models/Scan.js";
import { addStockInSession } from "./add-stock.js";
import type { StockInput } from "../domain/pantry.js";

export async function stockScan(userId: string, scanId: string, items: Omit<StockInput, "source">[]) {
  return mongoose.connection.transaction(async (session) => {
    const scan = await Scan.findOne({ _id: scanId, userId }).session(session);
    if (!scan) return false;
    if (scan.status === "confirmed") return true;
    await addStockInSession(userId, `scan:${scanId}`, items.map((item) => ({ ...item, source: scan.type! })), session);
    scan.status = "confirmed";
    scan.confirmedCount = items.length;
    await scan.save({ session });
    return true;
  });
}
