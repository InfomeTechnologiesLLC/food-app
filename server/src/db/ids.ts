import { randomBytes } from "node:crypto";

// 24-character hex ids (time + random + counter). Ids already stored on phones keep this
// format, and new ids sort by creation time.
const processPart = randomBytes(5).toString("hex");
let counter = randomBytes(3).readUIntBE(0, 3);

export function newId(): string {
  counter = (counter + 1) % 0xffffff;
  const time = Math.floor(Date.now() / 1000).toString(16).padStart(8, "0");
  return time + processPart + counter.toString(16).padStart(6, "0");
}

export const isId = (value: unknown): value is string => typeof value === "string" && /^[a-f\d]{24}$/i.test(value);
