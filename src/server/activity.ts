import type { Actor } from "@/domain/permissions";
import { prisma } from "@/lib/prisma";

export async function recordActivity(input: {
  actor: Actor;
  contractId?: string | null;
  entityType: string;
  entityId: string;
  kind: string;
  body: string;
  createdAt?: Date;
}) {
  const who = input.actor.source === "api" ? `API key “${input.actor.apiKeyName ?? "unnamed"}”` : input.actor.name;
  return prisma.activity.create({
    data: {
      contractId: input.contractId ?? null,
      entityType: input.entityType,
      entityId: input.entityId,
      kind: input.kind,
      body: `${who} ${input.body}`,
      userId: input.actor.userId,
      apiKeyId: input.actor.apiKeyId,
      createdAt: input.createdAt,
    },
  });
}
