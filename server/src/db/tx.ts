import { getDb, type Tx } from "./client.js";

const errno = (error: unknown): number | undefined => {
  for (let e = error as { errno?: number; cause?: unknown } | undefined; e; e = e.cause as typeof e) {
    if (typeof e.errno === "number") return e.errno;
  }
  return undefined;
};
/** Unique index violation (MySQL error 1062). */
export const isDuplicateKey = (error: unknown) => errno(error) === 1062;
/** Deadlock or lock wait timeout: safe to retry the whole transaction. */
const isRetryable = (error: unknown) => errno(error) === 1213 || errno(error) === 1205;

/**
 * Runs `work` in a READ COMMITTED transaction. All changes commit together or not at all.
 * Retries a few times when MySQL reports a deadlock (and optionally a duplicate key race).
 */
export async function transaction<T>(work: (tx: Tx) => Promise<T>, options: { retryDuplicates?: boolean } = {}): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await getDb().transaction(work, { isolationLevel: "read committed" });
    } catch (error) {
      const retry = isRetryable(error) || (options.retryDuplicates && isDuplicateKey(error));
      if (!retry || attempt >= 4) throw error;
      await new Promise((resolve) => setTimeout(resolve, 10 * (attempt + 1) + Math.random() * 20));
    }
  }
}
