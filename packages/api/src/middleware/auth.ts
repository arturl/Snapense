import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface AuthenticatedRequest extends Request {
  user: {
    oid: string;
    name: string;
    email: string;
  };
  accessToken: string;
}

/**
 * Lightweight auth middleware.
 *
 * The frontend acquires a Microsoft Graph access token (audience=https://graph.microsoft.com).
 * We don't fully verify the signature here — the token will be validated by Graph API
 * when we forward it. We just decode it to extract user info and pass it through.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing authorization header" });
    return;
  }

  const token = authHeader.slice(7);

  try {
    // Graph access tokens may be opaque (not JWT-decodable).
    // Try to decode, but if it fails just pass the token through —
    // Graph API itself will validate it.
    const payload = jwt.decode(token) as jwt.JwtPayload | null;

    const user = payload
      ? {
          oid: payload.oid || payload.sub || "",
          name: payload.name || "",
          email: payload.preferred_username || payload.email || "",
        }
      : { oid: "unknown", name: "", email: "" };

    (req as AuthenticatedRequest).user = user;
    (req as AuthenticatedRequest).accessToken = token;

    next();
  } catch (err) {
    console.error("Auth error:", err);
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
