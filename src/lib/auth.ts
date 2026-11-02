import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { sessionSecret } from "./env";

export const SESSION_COOKIE = "bw_session";
export const PORTAL_COOKIE = "bw_portal";

export type Session = { uid: string; role: string; name: string };
export type PortalSession = { contactId: string; customerId: string; name: string; kind: "portal" };

function key() {
  return new TextEncoder().encode(sessionSecret());
}

export async function signSession(session: Session) {
  return new SignJWT(session)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("14d")
    .sign(key());
}

export async function verifySession(token: string | undefined | null): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    if (typeof payload.uid !== "string" || typeof payload.role !== "string" || typeof payload.name !== "string") {
      return null;
    }
    return { uid: payload.uid, role: payload.role, name: payload.name };
  } catch {
    return null;
  }
}

export async function getSession() {
  const jar = await cookies();
  return verifySession(jar.get(SESSION_COOKIE)?.value);
}

export async function signPortalSession(session: PortalSession) {
  return new SignJWT({ ...session, kind: "portal" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("14d")
    .sign(key());
}

export async function verifyPortalSession(token: string | undefined | null): Promise<PortalSession | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    if (payload.kind !== "portal" || typeof payload.contactId !== "string" || typeof payload.customerId !== "string" || typeof payload.name !== "string") {
      return null;
    }
    return { contactId: payload.contactId, customerId: payload.customerId, name: payload.name, kind: "portal" };
  } catch {
    return null;
  }
}

export async function getPortalSession() {
  const jar = await cookies();
  return verifyPortalSession(jar.get(PORTAL_COOKIE)?.value);
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 14,
  };
}

export function hashApiKey(keyValue: string) {
  return createHash("sha256").update(keyValue).digest("hex");
}

export function generateApiKey() {
  const keyValue = `bw_live_${randomBytes(24).toString("base64url")}`;
  return { key: keyValue, prefix: keyValue.slice(0, 16), hash: hashApiKey(keyValue) };
}

export function apiKeyHashesMatch(stored: string, presented: string) {
  const left = Buffer.from(stored);
  const right = Buffer.from(presented);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
