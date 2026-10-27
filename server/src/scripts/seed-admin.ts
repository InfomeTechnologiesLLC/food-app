import { env } from "../env.js";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { connectDb, closeDb } from "../db/client.js";
import { adminAccountRepo } from "../repos/admin.js";
import { bcryptPasswordFits } from "../lib/admin-portal.js";

const emailValue = process.env.ADMIN_EMAIL?.trim();
const password = process.env.ADMIN_PASSWORD;
const parsedEmail = z.string().email().safeParse(emailValue);
if (!parsedEmail.success || !password) throw new Error("Set a valid ADMIN_EMAIL and ADMIN_PASSWORD before running seed:admin");
const email = parsedEmail.data.toLowerCase();
if (password.length < 8) throw new Error("ADMIN_PASSWORD must be at least 8 characters");
if (!bcryptPasswordFits(password)) throw new Error("ADMIN_PASSWORD must be at most 72 UTF-8 bytes for bcrypt");

await connectDb(env.DATABASE_URL);
try {
  const existing = await adminAccountRepo.findByEmail(email);
  if (existing) console.log(`Admin account already exists for ${email}; existing credentials were preserved.`);
  else {
    await adminAccountRepo.create({ email, passwordHash: await bcrypt.hash(password, 12) });
    console.log(`Created admin account for ${email}.`);
  }
} finally { await closeDb(); }
