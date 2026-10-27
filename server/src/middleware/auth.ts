import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { userRepo } from "../repos/users.js";

export interface AuthRequest extends Request {
  userId?: string;
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace(/^Bearer /, "");
  if (!token) return res.status(401).json({ error: "Missing token" });
  let sub: string;
  try {
    ({ sub } = jwt.verify(token, process.env.JWT_SECRET!) as { sub: string });
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
  // A valid token can still point to an account that no longer exists (for example a login
  // from the old MongoDB database, or after the database was recreated). Answer 401 so the
  // app asks the user to sign in again, instead of failing later with a database error.
  if (!(await userRepo.exists(sub))) return res.status(401).json({ error: "Account not found. Please sign in again." });
  req.userId = sub;
  next();
}