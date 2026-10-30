import { z } from "zod";

/** Keywords Gemini's structured output doesn't use; length and pattern rules are checked by zod after the reply instead. */
const DROP = new Set(["minLength", "maxLength", "pattern", "$schema"]);

function clean(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).filter(([k]) => !DROP.has(k)).map(([k, v]) => [k, clean(v)]));
  }
  return value;
}

/** JSON schema for Gemini (responseJsonSchema or function parameters) from a zod schema. Always re-validate replies with the zod schema. */
export const geminiSchema = (schema: z.ZodType) => clean(z.toJSONSchema(schema, { io: "input" }));

/** A short, safe description of an AI failure for logs, and for the app while developing. */
export function aiFailure(err: unknown) {
  const e = err as { status?: number; message?: string };
  return `${e.status ? `${e.status} ` : ""}${(e.message ?? String(err)).replace(/\s+/g, " ").slice(0, 300)}`;
}
