import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { userRepo } from "../repos/users.js";
import { isDuplicateKey } from "../db/tx.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { toPublicUser } from "../lib/usage.js";
import rateLimit from "express-rate-limit";

const router = Router();

// Slow down password guessing: 20 login/register attempts per 15 minutes per IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many attempts. Please wait a few minutes and try again." },
});
const credentials = z.object({ email: z.string().email(), password: z.string().min(8) });
const sign = (id: string) => jwt.sign({ sub: id }, process.env.JWT_SECRET!, { expiresIn: "30d" });

router.post("/register", authLimiter, async (req, res) => {
  const parsed = credentials.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { email, password } = parsed.data;
  if (await userRepo.emailExists(email)) return res.status(409).json({ error: "Email already registered" });
  try {
    const user = await userRepo.create({ email, passwordHash: await bcrypt.hash(password, 10) });
    res.status(201).json({ token: sign(user._id) });
  } catch (error) {
    // Two simultaneous sign-ups with the same email: the unique index rejects the second one.
    if (isDuplicateKey(error)) return res.status(409).json({ error: "Email already registered" });
    throw error;
  }
});

router.post("/login", authLimiter, async (req, res) => {
  const parsed = credentials.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid credentials" });
  const user = await userRepo.findByEmail(parsed.data.email);
  if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash)))
    return res.status(401).json({ error: "Invalid credentials" });
  res.json({ token: sign(user._id) });
});

router.get("/me", requireAuth, async (req: AuthRequest, res) => {
  const user = await userRepo.findById(req.userId!);
  if (!user) return res.status(401).json({ error: "Account not found" });
  res.json(toPublicUser(user));
});

export default router;
