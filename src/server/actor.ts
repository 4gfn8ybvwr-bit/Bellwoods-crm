import { allow, scopesForRole, type Actor, type Permission } from "@/domain/permissions";
import { ServiceError } from "@/domain/errors";
import { hashApiKey, apiKeyHashesMatch, verifySession, getSession, SESSION_COOKIE } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function actorFromUserId(userId: string): Promise<Actor> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.active) throw new ServiceError(401, "Please sign in");
  return {
    userId: user.id,
    apiKeyId: null,
    apiKeyName: null,
    name: user.name,
    role: user.role,
    scopes: scopesForRole(user.role),
    source: "user",
  };
}

export async function actorFromSession() {
  const session = await getSession();
  if (!session) throw new ServiceError(401, "Please sign in");
  return actorFromUserId(session.uid);
}

export async function actorFromApiKey(token: string): Promise<Actor> {
  const keyHash = hashApiKey(token);
  const apiKey = await prisma.apiKey.findUnique({ where: { keyHash } });
  if (!apiKey || apiKey.revokedAt || !apiKeyHashesMatch(apiKey.keyHash, keyHash)) {
    throw new ServiceError(401, "Invalid API key");
  }
  await prisma.apiKey.update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } });
  return {
    userId: null,
    apiKeyId: apiKey.id,
    apiKeyName: apiKey.name,
    name: apiKey.name,
    role: null,
    scopes: apiKey.scopes.split(",").map((scope) => scope.trim()).filter(Boolean),
    source: "api",
  };
}

export async function actorFromRequest(request: Request) {
  const header = request.headers.get("authorization");
  if (header?.toLowerCase().startsWith("bearer ")) {
    const token = header.slice(7).trim();
    if (!token) throw new ServiceError(401, "Invalid API key");
    return actorFromApiKey(token);
  }
  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  const session = await verifySession(match ? decodeURIComponent(match[1]) : null);
  if (!session) throw new ServiceError(401, "Sign in or provide an API key");
  return actorFromUserId(session.uid);
}

export function requirePermission(actor: Actor, permission: Permission) {
  allow(actor, permission);
}
