import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface AuthRequest extends Request {
  userId?: string;
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace(/^Bearer /, "");
  if (!token) return res.status(401).json({ error: "Missing token" });
  try {
    const { sub } = jwt.verify(token, process.env.JWT_SECRET!) as { sub: string };
    req.userId = sub;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}
