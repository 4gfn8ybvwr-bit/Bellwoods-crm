import { Prisma } from "@prisma/client";
import { ServiceError } from "@/domain/errors";

export async function takeNext(tx: Prisma.TransactionClient, id: string) {
  const existing = await tx.sequence.findUnique({ where: { id } });
  if (!existing) throw new ServiceError(500, `Number sequence “${id}” is not set up`);
  const row = await tx.sequence.update({
    where: { id },
    data: { next: { increment: 1 } },
  });
  return row.next - 1;
}

export function formatContractNumber(type: string, n: number) {
  return `${type}${n}`;
}
