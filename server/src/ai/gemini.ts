import { GoogleGenAI } from "@google/genai";
import { env } from "../env.js";

export const gemini = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
export const GEMINI_MODEL = env.GEMINI_MODEL;

export class AIError extends Error {
  constructor(message: string, public status = 502) {
    super(message);
  }
}

/** Retries on Gemini rate limits (429) and overloads (503) with exponential backoff. */
export async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (err) {
      const status = (err as { status?: number }).status;
      const retryable = status === 429 || status === 503;
      if (!retryable || i >= attempts - 1) {
        if (status === 429) throw new AIError("The AI is busy right now (rate limit). Please try again in a minute.", 429);
        throw err;
      }
      await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
    }
  }
}
