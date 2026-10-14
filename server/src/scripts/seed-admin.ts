import { env } from "../env.js";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { AdminAccount } from "../models/AdminAccount.js";
import { z } from "zod";
import { bcryptPasswordFits } from "../lib/admin-portal.js";

const emailValue = process.env.ADMIN_EMAIL?.trim();
const password = process.env.ADMIN_PASSWORD;
const parsedEmail = z.string().email().safeParse(emailValue);
if (!parsedEmail.success || !password) throw new Error("Set a valid ADMIN_EMAIL and ADMIN_PASSWORD before running seed:admin");
const email = parsedEmail.data.toLowerCase();
if (password.length < 8) throw new Error("ADMIN_PASSWORD must be at least 8 characters");
if (!bcryptPasswordFits(password)) throw new Error("ADMIN_PASSWORD must be at most 72 UTF-8 bytes for bcrypt");

await mongoose.connect(env.MONGODB_URI);
try {
  const existing = await AdminAccount.findOne({ email });
  if (existing) console.log(`Admin account already exists for ${email}; existing credentials were preserved.`);
  else {
    await AdminAccount.create({ email, passwordHash: await bcrypt.hash(password, 12) });
    console.log(`Created admin account for ${email}.`);
  }
} finally { await mongoose.disconnect(); }
