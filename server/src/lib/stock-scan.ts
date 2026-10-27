import { transaction } from "../db/tx.js";
import { scanRepo } from "../repos/scans.js";
import { addStockInSession } from "./add-stock.js";
import type { StockInput } from "../domain/pantry.js";

export async function stockScan(userId: string, scanId: string, items: Omit<StockInput, "source">[]) {
  return transaction(async (tx) => {
    // The row lock makes a second, concurrent confirmation wait and then see "confirmed".
    const scan = await scanRepo.findById(scanId, userId, tx, { lock: true });
    if (!scan) return false;
    if (scan.status === "confirmed") return true;
    await addStockInSession(userId, `scan:${scanId}`, items.map((item) => ({ ...item, source: scan.type })), tx);
    await scanRepo.markConfirmed(tx, scanId, items.length);
    return true;
  });
}
