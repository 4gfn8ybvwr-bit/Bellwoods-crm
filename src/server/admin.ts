import bcrypt from "bcryptjs";
import { allow, type Actor } from "@/domain/permissions";
import { ServiceError } from "@/domain/errors";
import { generateApiKey, hashApiKey } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { saveSettings } from "./settings";

const ROLES = new Set(["ADMIN", "SALES", "OFFICE", "FITTER"]);

export async function hashPassword(password: string) {
  if (password.length < 8) throw new ServiceError(400, "Password must be at least 8 characters");
  return bcrypt.hash(password, 10);
}

export async function checkPassword(password: string, passwordHash: string) {
  return bcrypt.compare(password, passwordHash);
}

export async function createUser(
  actor: Actor,
  input: { name: string; email: string; password: string; role: string },
) {
  allow(actor, "admin");
  if (!ROLES.has(input.role)) throw new ServiceError(400, "Unknown role");
  if (!input.name.trim() || !input.email.trim()) throw new ServiceError(400, "Name and email are required");
  const email = input.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new ServiceError(400, "That email is already in use");
  const user = await prisma.user.create({
    data: { name: input.name.trim(), email, role: input.role, passwordHash: await hashPassword(input.password) },
  });
  return publicUser(user);
}

export async function updateUser(
  actor: Actor,
  id: string,
  input: { name?: string; role?: string; active?: boolean; password?: string },
) {
  allow(actor, "admin");
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) throw new ServiceError(404, "User not found");
  if (input.role && !ROLES.has(input.role)) throw new ServiceError(400, "Unknown role");
  const becomingInactive = input.active === false || (input.role && input.role !== "ADMIN");
  if (existing.role === "ADMIN" && existing.active && becomingInactive) {
    const admins = await prisma.user.count({ where: { role: "ADMIN", active: true, NOT: { id } } });
    if (admins === 0 && (input.active === false || input.role !== "ADMIN")) {
      throw new ServiceError(400, "Keep at least one active admin");
    }
  }
  const user = await prisma.user.update({
    where: { id },
    data: {
      name: input.name?.trim(),
      role: input.role,
      active: input.active,
      passwordHash: input.password ? await hashPassword(input.password) : undefined,
    },
  });
  return publicUser(user);
}

export function publicUser(user: { id: string; name: string; email: string; role: string; active: boolean; createdAt: Date }) {
  return { id: user.id, name: user.name, email: user.email, role: user.role, active: user.active, createdAt: user.createdAt };
}

export async function createApiKey(actor: Actor, input: { name: string; scopes: string[] }) {
  allow(actor, "admin");
  if (!input.name.trim()) throw new ServiceError(400, "Give the key a name");
  const scopes = input.scopes.filter((scope) => ["read", "write", "admin"].includes(scope));
  if (!scopes.includes("read") && !scopes.includes("write") && !scopes.includes("admin")) {
    throw new ServiceError(400, "Choose read, write or admin");
  }
  if (!actor.userId) throw new ServiceError(400, "API keys are created by a signed-in admin");
  const generated = generateApiKey();
  const record = await prisma.apiKey.create({
    data: {
      name: input.name.trim(),
      prefix: generated.prefix,
      keyHash: generated.hash,
      scopes: Array.from(new Set(scopes)).join(","),
      createdById: actor.userId,
    },
  });
  return { ...publicApiKey(record), key: generated.key };
}

export async function revokeApiKey(actor: Actor, id: string) {
  allow(actor, "admin");
  const existing = await prisma.apiKey.findUnique({ where: { id } });
  if (!existing) throw new ServiceError(404, "API key not found");
  const record = await prisma.apiKey.update({ where: { id }, data: { revokedAt: existing.revokedAt ?? new Date() } });
  return publicApiKey(record);
}

export function publicApiKey(key: {
  id: string;
  name: string;
  prefix: string;
  scopes: string;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: key.id,
    name: key.name,
    prefix: key.prefix,
    scopes: key.scopes.split(",").filter(Boolean),
    revokedAt: key.revokedAt,
    lastUsedAt: key.lastUsedAt,
    createdAt: key.createdAt,
  };
}

export async function createWebhook(
  actor: Actor,
  input: { url: string; events: string[]; secret?: string },
) {
  allow(actor, "admin");
  let url: URL;
  try {
    url = new URL(input.url);
  } catch {
    throw new ServiceError(400, "Enter a valid webhook URL");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new ServiceError(400, "Webhook URL must be http or https");
  const events = input.events.map((event) => event.trim()).filter(Boolean);
  if (events.length === 0) throw new ServiceError(400, "Choose at least one event, or *");
  const secret = input.secret?.trim() || generateApiKey().key;
  return prisma.webhookEndpoint.create({
    data: { url: url.toString(), events: events.join(","), secret, active: true },
  });
}

export async function updateWebhook(actor: Actor, id: string, input: { active?: boolean; events?: string[]; url?: string }) {
  allow(actor, "admin");
  const existing = await prisma.webhookEndpoint.findUnique({ where: { id } });
  if (!existing) throw new ServiceError(404, "Webhook not found");
  return prisma.webhookEndpoint.update({
    where: { id },
    data: {
      active: input.active,
      events: input.events ? input.events.join(",") : undefined,
      url: input.url?.trim(),
    },
  });
}

export async function updateAppSettings(
  actor: Actor,
  input: { invoiceTolerancePence?: number; defaultDepositPercent?: number; vatRateBps?: number },
) {
  allow(actor, "admin");
  const values: Record<string, string> = {};
  if (input.invoiceTolerancePence != null) {
    if (!Number.isInteger(input.invoiceTolerancePence) || input.invoiceTolerancePence < 0) {
      throw new ServiceError(400, "Tolerance must be a number of pence, zero or more");
    }
    values.invoiceTolerancePence = String(input.invoiceTolerancePence);
  }
  if (input.defaultDepositPercent != null) {
    if (!Number.isInteger(input.defaultDepositPercent) || input.defaultDepositPercent < 0 || input.defaultDepositPercent > 100) {
      throw new ServiceError(400, "Default deposit must be between 0 and 100");
    }
    values.defaultDepositPercent = String(input.defaultDepositPercent);
  }
  if (input.vatRateBps != null) {
    if (!Number.isInteger(input.vatRateBps) || input.vatRateBps < 0 || input.vatRateBps > 10000) {
      throw new ServiceError(400, "VAT rate is out of range");
    }
    values.vatRateBps = String(input.vatRateBps);
  }
  return saveSettings(values);
}

export async function createStage(actor: Actor, input: { name: string; slug: string; colour?: string }) {
  allow(actor, "admin");
  const slug = input.slug.trim().toLowerCase();
  if (!input.name.trim() || !/^[a-z0-9-]+$/.test(slug)) {
    throw new ServiceError(400, "Stage name and a slug (letters, numbers, hyphens) are required");
  }
  const last = await prisma.stage.findFirst({ orderBy: { sortOrder: "desc" } });
  return prisma.stage.create({
    data: { name: input.name.trim(), slug, colour: input.colour || "#234237", sortOrder: (last?.sortOrder ?? 0) + 1 },
  });
}

export async function updateStage(actor: Actor, id: string, input: { name?: string; colour?: string; slug?: string }) {
  allow(actor, "admin");
  const existing = await prisma.stage.findUnique({ where: { id } });
  if (!existing) throw new ServiceError(404, "Stage not found");
  let slug = input.slug?.trim().toLowerCase();
  if (slug && ["ready-to-order", "complete"].includes(existing.slug) && slug !== existing.slug) {
    throw new ServiceError(400, "The ready-to-order and complete slugs are part of the workflow");
  }
  if (slug && !/^[a-z0-9-]+$/.test(slug)) throw new ServiceError(400, "Slug may contain letters, numbers and hyphens");
  return prisma.stage.update({
    where: { id },
    data: { name: input.name?.trim(), colour: input.colour, slug },
  });
}

export async function reorderStages(actor: Actor, ids: string[]) {
  allow(actor, "admin");
  const stages = await prisma.stage.findMany();
  if (ids.length !== stages.length || new Set(ids).size !== ids.length) {
    throw new ServiceError(400, "Provide every stage id, once");
  }
  await prisma.$transaction(
    ids.map((id, index) => prisma.stage.update({ where: { id }, data: { sortOrder: index + 1 } })),
  );
  return prisma.stage.findMany({ orderBy: { sortOrder: "asc" } });
}

export async function deleteStage(actor: Actor, id: string) {
  allow(actor, "admin");
  const stage = await prisma.stage.findUnique({ where: { id }, include: { contracts: { take: 1 } } });
  if (!stage) throw new ServiceError(404, "Stage not found");
  if (["ready-to-order", "complete"].includes(stage.slug)) {
    throw new ServiceError(400, "That stage is part of the workflow");
  }
  if (stage.contracts.length) throw new ServiceError(400, "Move contracts off this stage first");
  await prisma.stage.delete({ where: { id } });
  return { ok: true };
}

export { hashApiKey };
